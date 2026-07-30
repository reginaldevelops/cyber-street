import * as THREE from 'three'
import { buildLot, civicKindAt, pickBuildingKind } from './cityBuildings.js'
import { addBikeStall, addBenchAndBin, addLanternString, addPowerLines, addSidewalkTiles, addStreetCart, addTrafficLight, addUtilityBox, addVendingMachine } from './cityProps.js'
import { overlapsConstructionSite } from './constructionSite.js'
import { PLAZA_EXCLUDE, STREET_MID, STREET_OUTER } from './worldConfig.js'
import { addTilePlane, addTiledRoadStrip, makeTileAsphaltMat } from './tiledSurfaces.js'

const BLOCK = 13
const ROAD = 5
const PITCH = BLOCK + ROAD
const GRID_SPAN = 4
const MARK_Y = 0.065
const SIDEWALK_W = 1.1

export const CITY_BLOCK = BLOCK
export const CITY_ROAD = ROAD
export const CITY_PITCH = PITCH
export const CITY_GRID_SPAN = GRID_SPAN
export const CITY_SIDEWALK_W = SIDEWALK_W

const NEON_CYAN = 0x00f6ff

export interface CityGridContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function seededRand(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function markingMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    emissive: 0xf2f2f2,
    emissiveIntensity: 0.08,
    roughness: 0.62,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
}

function blockOverlapsPlaza(minX: number, maxX: number, minZ: number, maxZ: number) {
  return maxX > -PLAZA_EXCLUDE && minX < PLAZA_EXCLUDE && maxZ > -PLAZA_EXCLUDE && minZ < PLAZA_EXCLUDE
}

function segmentOverlapsPlaza(a: number, b: number, orthoMin: number, orthoMax: number, vertical: boolean) {
  const minX = vertical ? Math.min(a, b) - ROAD / 2 : orthoMin
  const maxX = vertical ? Math.max(a, b) + ROAD / 2 : orthoMax
  const minZ = vertical ? orthoMin : Math.min(a, b) - ROAD / 2
  const maxZ = vertical ? orthoMax : Math.max(a, b) + ROAD / 2
  return blockOverlapsPlaza(minX, maxX, minZ, maxZ)
}

/** Major outer avenues — skip ±18 clutter; ±36 used for N–S only (ring owns E–W). */
function majorRoadLines(): number[] {
  return [-72, -54, -36, 36, 54, 72]
}

/** All lines used for block subdivision (majors + axis). */
function blockLines(): number[] {
  return [-72, -54, -36, 0, 36, 54, 72]
}


/** Dashed centre line on ONE road segment — never through intersections. */
function addDashedSegment(
  root: THREE.Group,
  mat: THREE.Material,
  x: number,
  z: number,
  len: number,
  alongX: boolean,
) {
  const dash = 1.5
  const gap = 1.0
  const count = Math.max(0, Math.floor(len / (dash + gap)))
  for (let i = 0; i < count; i++) {
    const t = -len / 2 + dash / 2 + i * (dash + gap)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? dash : 0.12, alongX ? 0.12 : dash), mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(alongX ? x + t : x, MARK_Y, alongX ? z : z + t)
    root.add(m)
  }
}

function addSolidSegment(
  root: THREE.Group,
  mat: THREE.Material,
  x: number,
  z: number,
  len: number,
  alongX: boolean,
  offset: number,
) {
  const w = 0.1
  const m = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? len : w, alongX ? w : len), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(alongX ? x : x + offset, MARK_Y - 0.001, alongX ? z + offset : z)
  root.add(m)
}

function frontYawForBlock(cx: number, cz: number): number {
  if (Math.abs(cx) >= Math.abs(cz)) return cx >= 0 ? -Math.PI / 2 : Math.PI / 2
  return cz >= 0 ? Math.PI : 0
}

function addStreetLampOnSidewalk(
  root: THREE.Group,
  ctx: CityGridContext,
  x: number,
  z: number,
  faceYaw: number,
) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x35333e, roughness: 0.42, metalness: 0.78 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), poleMat)
  pole.position.set(x, 2.1, z)
  pole.castShadow = true
  root.add(pole)
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0dd,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.4,
  })
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.22), lampMat)
  lamp.position.set(x + Math.cos(faceYaw) * 0.9, 3.95, z + Math.sin(faceYaw) * 0.9)
  root.add(lamp)
  ctx.flickerMats.push({ mat: lampMat, base: 0.4, t: Math.random() * 3 })
  const light = new THREE.PointLight(NEON_CYAN, 0.4, 12, 2)
  light.position.copy(lamp.position)
  root.add(light)
}

/** Props belong on sidewalk at block edge — never in the road or intersection. */
function addBlockSidewalkProps(
  root: THREE.Group,
  ctx: CityGridContext,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  seed: number,
) {
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const yaw = frontYawForBlock(cx, cz)
  const inset = 0.55
  const depth = Math.min((maxX - minX), (maxZ - minZ)) / 2 - inset

  // Match building frontOffset convention: sin→X, cos→Z
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const rx = Math.cos(yaw)
  const rz = -Math.sin(yaw)

  const frontX = cx + fx * depth
  const frontZ = cz + fz * depth

  const roll = seededRand(seed + 200)
  // Pull props back from the curb so footprints stay on the sidewalk
  const curbBack = 1.05
  const px = frontX - fx * curbBack
  const pz = frontZ - fz * curbBack
  if (roll < 0.18) {
    addBikeStall(root, px + rx * 1.2, pz + rz * 1.2, yaw + Math.PI, seed)
  } else if (roll < 0.32) {
    addVendingMachine(root, px, pz, yaw + Math.PI)
  } else if (roll < 0.48) {
    addBenchAndBin(root, px, pz, yaw + Math.PI)
  } else if (roll < 0.58) {
    addStreetCart(root, ctx, px + rx * 0.8, pz + rz * 0.8, yaw + Math.PI, seed)
  } else if (roll < 0.68) {
    addUtilityBox(root, px - rx * 1.4, pz - rz * 1.4, yaw)
  }

  if (seededRand(seed + 311) > 0.72) {
    const sideX = cx + rx * (Math.min(maxX - minX, maxZ - minZ) / 2 - 0.5)
    const sideZ = cz + rz * (Math.min(maxX - minX, maxZ - minZ) / 2 - 0.5)
    addBenchAndBin(root, sideX, sideZ, yaw + Math.PI / 2)
  }
}

function addIntersectionExtras(root: THREE.Group, lines: number[]) {
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      const x = lines[i]
      const z = lines[j]
      if (Math.abs(x) < PLAZA_EXCLUDE && Math.abs(z) < PLAZA_EXCLUDE) continue
      if ((i + j) % 2 !== 0) continue
      if (Math.abs(x) < STREET_OUTER + 1 || Math.abs(z) < STREET_OUTER + 1) continue
      const ox = ROAD / 2 + 0.45
      const oz = ROAD / 2 + 0.45
      addTrafficLight(root, x + ox, z + oz)
    }
  }
}

/** Full road if outside plaza; otherwise stubs from ring outward. */
function addClippedRoadStrip(
  root: THREE.Group,
  mat: THREE.Material,
  alt: THREE.Material,
  cx: number,
  cz: number,
  width: number,
  fullLength: number,
  alongZ: boolean,
  tileSize: number,
) {
  const half = fullLength / 2
  const clipAt = STREET_OUTER
  const crossesPlaza = alongZ
    ? Math.abs(cx) < clipAt + width / 2
    : Math.abs(cz) < clipAt + width / 2

  if (!crossesPlaza) {
    addTiledRoadStrip(root, mat, alt, cx, cz, width, fullLength, alongZ, tileSize)
    return
  }

  const stubLen = half - clipAt
  if (stubLen < 1) return
  const stubCenter = clipAt + stubLen / 2
  if (alongZ) {
    addTiledRoadStrip(root, mat, alt, cx, -stubCenter, width, stubLen, true, tileSize)
    addTiledRoadStrip(root, mat, alt, cx, stubCenter, width, stubLen, true, tileSize)
  } else {
    addTiledRoadStrip(root, mat, alt, -stubCenter, cz, width, stubLen, false, tileSize)
    addTiledRoadStrip(root, mat, alt, stubCenter, cz, width, stubLen, false, tileSize)
  }
}

/** Markings on a road segment between two orthogonal lines. */
function addSegmentMarkings(
  root: THREE.Group,
  markMat: THREE.Material,
  alongX: boolean,
  ortho: number,
  a: number,
  b: number,
  avenue: boolean,
) {
  const lo = Math.min(a, b) + ROAD / 2 + 0.2
  const hi = Math.max(a, b) - ROAD / 2 - 0.2
  const segLen = hi - lo
  if (segLen < 2.5) return
  const mid = (lo + hi) / 2
  if (alongX) {
    if (segmentOverlapsPlaza(lo, hi, ortho, ortho, false)) return
    if (avenue) addDashedSegment(root, markMat, mid, ortho, segLen, true)
    else {
      addSolidSegment(root, markMat, mid, ortho, segLen, true, ROAD * 0.36)
      addSolidSegment(root, markMat, mid, ortho, segLen, true, -ROAD * 0.36)
    }
  } else {
    if (segmentOverlapsPlaza(ortho, ortho, lo, hi, true)) return
    if (avenue) addDashedSegment(root, markMat, ortho, mid, segLen, false)
    else {
      addSolidSegment(root, markMat, ortho, mid, segLen, false, ROAD * 0.36)
      addSolidSegment(root, markMat, ortho, mid, segLen, false, -ROAD * 0.36)
    }
  }
}

/** SimCity grid — sparse logical avenues + clean markings. */
export function buildCityGrid(ctx: CityGridContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'city-grid'

  const asphaltMat = makeTileAsphaltMat(0x3a3e48)
  const asphaltAlt = makeTileAsphaltMat(0x444850)
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x4a4848, roughness: 0.85, metalness: 0.15 })
  const markMat = markingMat()

  const citySpan = GRID_SPAN * 2 * PITCH + ROAD
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(citySpan + 8, citySpan + 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3e48, roughness: 0.95, metalness: 0.05 }),
  )
  base.rotation.x = -Math.PI / 2
  base.position.y = -0.02
  base.receiveShadow = true
  root.add(base)

  const majors = majorRoadLines()
  const lines = blockLines()

  // N–S majors (including ±36 flanking the plaza)
  for (const pos of majors) {
    addClippedRoadStrip(root, asphaltMat, asphaltAlt, pos, 0, ROAD, citySpan, true, 1.55)
  }
  // E–W majors only beyond the ring (54/72) — ring + metro corridor handle the inner belt
  for (const pos of majors) {
    if (Math.abs(pos) < 50) continue
    addClippedRoadStrip(root, asphaltMat, asphaltAlt, 0, pos, ROAD, citySpan, false, 1.55)
  }

  // Central axis stubs — connect plaza ring mid-sides to the outer grid
  addClippedRoadStrip(root, asphaltMat, asphaltAlt, 0, 0, ROAD, citySpan, true, 1.55)
  addClippedRoadStrip(root, asphaltMat, asphaltAlt, 0, 0, ROAD, citySpan, false, 1.55)

  // Continue north/south ring corridors past the plaza (metro runs on south)
  addClippedRoadStrip(root, asphaltMat, asphaltAlt, 0, STREET_MID, ROAD, citySpan, false, 1.55)
  addClippedRoadStrip(root, asphaltMat, asphaltAlt, 0, -STREET_MID, ROAD, citySpan, false, 1.55)

  // Markings between block lines on paved roads
  const nsRoads = [...majors, 0]
  const ewRoads = [...majors.filter((p) => Math.abs(p) >= 54), 0, STREET_MID, -STREET_MID]

  for (const roadX of nsRoads) {
    const avenue = Math.abs(roadX) < 0.01 || Math.abs(Math.abs(roadX) - 54) < 0.01 || Math.abs(Math.abs(roadX) - 72) < 0.01
    for (let si = 0; si < lines.length - 1; si++) {
      addSegmentMarkings(root, markMat, false, roadX, lines[si], lines[si + 1], avenue)
    }
  }
  for (const roadZ of ewRoads) {
    const avenue =
      Math.abs(roadZ) < 0.01 ||
      Math.abs(Math.abs(roadZ) - STREET_MID) < 0.05 ||
      Math.abs(Math.abs(roadZ) - 54) < 0.01 ||
      Math.abs(Math.abs(roadZ) - 72) < 0.01
    for (let si = 0; si < lines.length - 1; si++) {
      addSegmentMarkings(root, markMat, true, roadZ, lines[si], lines[si + 1], avenue)
    }
  }

  // Curbs between sidewalk and road on block edges
  for (let xi = 0; xi < lines.length - 1; xi++) {
    for (let zi = 0; zi < lines.length - 1; zi++) {
      const minX = lines[xi] + ROAD / 2
      const maxX = lines[xi + 1] - ROAD / 2
      const minZ = lines[zi] + ROAD / 2
      const maxZ = lines[zi + 1] - ROAD / 2
      if (blockOverlapsPlaza(minX, maxX, minZ, maxZ)) continue
      if (overlapsConstructionSite(minX, maxX, minZ, maxZ)) continue
      const cx = (minX + maxX) / 2
      const cz = (minZ + maxZ) / 2
      const bw = maxX - minX
      const bd = maxZ - minZ
      // Skip oversized "merged" cells that aren't real blocks (no road on all sides)
      if (bw > 40 || bd > 40) continue
      for (const [x, z, lw, lh, ax] of [
        [cx, minZ + 0.11, bw, 0.18, true],
        [cx, maxZ - 0.11, bw, 0.18, true],
        [minX + 0.11, cz, 0.18, bd, false],
        [maxX - 0.11, cz, 0.18, bd, false],
      ] as const) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(ax ? lw : lw, 0.12, ax ? lh : lh), curbMat)
        curb.position.set(x, 0.06, z)
        root.add(curb)
      }
    }
  }

  // Blocks: sidewalk tiles, buildings, props on sidewalk only
  for (let xi = 0; xi < lines.length - 1; xi++) {
    for (let zi = 0; zi < lines.length - 1; zi++) {
      const minX = lines[xi] + ROAD / 2
      const maxX = lines[xi + 1] - ROAD / 2
      const minZ = lines[zi] + ROAD / 2
      const maxZ = lines[zi + 1] - ROAD / 2
      if (blockOverlapsPlaza(minX, maxX, minZ, maxZ)) continue
      if (overlapsConstructionSite(minX, maxX, minZ, maxZ)) continue

      const cx = (minX + maxX) / 2
      const cz = (minZ + maxZ) / 2
      const bw = maxX - minX
      const bd = maxZ - minZ
      if (bw > 40 || bd > 40) continue

      const w = bw - SIDEWALK_W * 2
      const d = bd - SIDEWALK_W * 2
      const seed = xi * 97 + zi * 53 + 1000
      const gx = Math.round(cx / PITCH)
      const gz = Math.round(cz / PITCH)

      addSidewalkTiles(root, cx, cz, bw, bd)

      const kind = civicKindAt(gx, gz) ?? pickBuildingKind(gx, gz, seed)
      if (kind !== 'park') {
        const padMat = makeTileAsphaltMat(0x3e424c)
        const padAlt = makeTileAsphaltMat(0x484c56)
        addTilePlane(root, {
          cx,
          cz,
          width: w,
          depth: d,
          tileSize: 1.7,
          y: 0.025,
          height: 0.05,
          gap: 0.12,
          mat: padMat,
          altMat: padAlt,
          checker: true,
        })
      }

      buildLot(kind, { root, ctx, cx, cz, w, d, seed, frontYaw: frontYawForBlock(cx, cz) })
      addBlockSidewalkProps(root, ctx, minX, maxX, minZ, maxZ, seed)

      if (Math.abs(gx) + Math.abs(gz) <= 3 && seededRand(seed + 50) > 0.4) {
        const fo = frontYawForBlock(cx, cz)
        const lx = cx + Math.sin(fo) * d * 0.42
        const lz = cz + Math.cos(fo) * d * 0.42
        const rx = Math.cos(fo)
        const rz = -Math.sin(fo)
        addLanternString(root, lx - rx * 1.2, lz - rz * 1.2, lx + rx * 1.2, lz + rz * 1.2, seed)
      }

      if (seededRand(seed + 77) > 0.78) {
        addPowerLines(root, minX + 1, cz, maxX - 1, cz, 3.4)
      }

      const lampChance = Math.abs(gx) + Math.abs(gz) <= 2 ? 0.25 : 0.45
      if (seededRand(seed + 31) > lampChance) {
        addStreetLampOnSidewalk(root, ctx, minX + SIDEWALK_W * 0.6, minZ + SIDEWALK_W * 0.6, frontYawForBlock(cx, cz))
      }
      if (seededRand(seed + 44) > 0.65) {
        addStreetLampOnSidewalk(root, ctx, maxX - SIDEWALK_W * 0.6, maxZ - SIDEWALK_W * 0.6, frontYawForBlock(cx, cz))
      }
    }
  }

  addIntersectionExtras(root, majors.filter((v) => Math.abs(v) >= 36))

  ctx.scene.add(root)
  return root
}
