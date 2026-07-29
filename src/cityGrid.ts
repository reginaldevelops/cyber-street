import * as THREE from 'three'
import { buildLot, civicKindAt, pickBuildingKind } from './cityBuildings.js'
import { addBikeStall, addBenchAndBin, addLanternString, addPowerLines, addSidewalkTiles, addStreetCart, addTrafficLight, addUtilityBox, addVendingMachine } from './cityProps.js'
import { PLAZA_EXCLUDE } from './worldConfig.js'

const BLOCK = 13
const ROAD = 5
const PITCH = BLOCK + ROAD
const GRID_SPAN = 4
const SURFACE_Y = 0.008
const MARK_Y = 0.022
const SIDEWALK_W = 1.1

export const CITY_BLOCK = BLOCK
export const CITY_ROAD = ROAD
export const CITY_PITCH = PITCH
export const CITY_GRID_SPAN = GRID_SPAN
export const CITY_SIDEWALK_W = SIDEWALK_W

const NEON_CYAN = 0x00f6ff
const NEON_ACCENTS = [NEON_CYAN, 0xff2d95, 0xffe14d, 0xff6622]

export interface CityGridContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function seededRand(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#1c1c22'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(28,28,34,${0.04 + Math.random() * 0.06})` : `rgba(36,36,44,${0.04 + Math.random() * 0.06})`
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 6)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function markingMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    emissive: 0xf2f2f2,
    emissiveIntensity: 0.06,
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
  if (roll < 0.18) {
    addBikeStall(root, frontX + rx * 1.2, frontZ + rz * 1.2, yaw + Math.PI, seed)
  } else if (roll < 0.32) {
    addVendingMachine(root, frontX, frontZ, yaw + Math.PI)
  } else if (roll < 0.48) {
    addBenchAndBin(root, frontX, frontZ, yaw + Math.PI)
  } else if (roll < 0.58) {
    addStreetCart(root, ctx, frontX + rx * 0.8, frontZ + rz * 0.8, yaw + Math.PI, seed)
  } else if (roll < 0.68) {
    addUtilityBox(root, frontX - rx * 1.4, frontZ - rz * 1.4, yaw)
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
      // Traffic lights on two corners of major avenues
      if ((i + j) % 3 !== 0) continue
      if (segmentOverlapsPlaza(x, x, z - 1, z + 1, true)) continue
      const ox = ROAD * 0.42
      const oz = ROAD * 0.42
      addTrafficLight(root, x + ox, z + oz)
    }
  }
}

/** SimCity grid — logical road markings & sidewalk-only props. */
export function buildCityGrid(ctx: CityGridContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'city-grid'

  const asphaltTex = makeAsphaltTexture()
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    color: 0x1c1c22,
    roughness: 0.22,
    metalness: 0.58,
  })
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x4a4848, roughness: 0.85, metalness: 0.15 })
  const markMat = markingMat()

  const citySpan = GRID_SPAN * 2 * PITCH + ROAD
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(citySpan + 8, citySpan + 8),
    new THREE.MeshStandardMaterial({ color: 0x0e0c12, roughness: 0.92, metalness: 0.05 }),
  )
  base.rotation.x = -Math.PI / 2
  base.position.y = -0.02
  base.receiveShadow = true
  root.add(base)

  const lines: number[] = []
  for (let i = -GRID_SPAN; i <= GRID_SPAN; i++) lines.push(i * PITCH)

  // Road surfaces — no markings yet
  for (const pos of lines) {
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, citySpan), asphaltMat)
    vRoad.rotation.x = -Math.PI / 2
    vRoad.position.set(pos, SURFACE_Y, 0)
    vRoad.receiveShadow = true
    root.add(vRoad)
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(citySpan, ROAD), asphaltMat)
    hRoad.rotation.x = -Math.PI / 2
    hRoad.position.set(0, SURFACE_Y, pos)
    hRoad.receiveShadow = true
    root.add(hRoad)
  }

  // Markings per segment BETWEEN intersections (skip plaza zone)
  for (let li = 0; li < lines.length; li++) {
    const roadX = lines[li]
    const isAvenue = li % 2 === 0
    for (let si = 0; si < lines.length - 1; si++) {
      const z0 = lines[si] + ROAD / 2 + 0.15
      const z1 = lines[si + 1] - ROAD / 2 - 0.15
      const segLen = z1 - z0
      if (segLen < 2.5) continue
      if (segmentOverlapsPlaza(roadX, roadX, z0, z1, true)) continue
      if (isAvenue) addDashedSegment(root, markMat, roadX, (z0 + z1) / 2, segLen, false)
      else {
        addSolidSegment(root, markMat, roadX, (z0 + z1) / 2, segLen, false, ROAD * 0.38)
        addSolidSegment(root, markMat, roadX, (z0 + z1) / 2, segLen, false, -ROAD * 0.38)
      }
    }
  }
  for (let li = 0; li < lines.length; li++) {
    const roadZ = lines[li]
    const isAvenue = li % 2 === 0
    for (let si = 0; si < lines.length - 1; si++) {
      const x0 = lines[si] + ROAD / 2 + 0.15
      const x1 = lines[si + 1] - ROAD / 2 - 0.15
      const segLen = x1 - x0
      if (segLen < 2.5) continue
      if (segmentOverlapsPlaza(x0, x1, roadZ, roadZ, false)) continue
      if (isAvenue) addDashedSegment(root, markMat, (x0 + x1) / 2, roadZ, segLen, true)
      else {
        addSolidSegment(root, markMat, (x0 + x1) / 2, roadZ, segLen, true, ROAD * 0.38)
        addSolidSegment(root, markMat, (x0 + x1) / 2, roadZ, segLen, true, -ROAD * 0.38)
      }
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
      const cx = (minX + maxX) / 2
      const cz = (minZ + maxZ) / 2
      const w = maxX - minX
      const d = maxZ - minZ
      for (const [x, z, lw, lh, ax] of [
        [cx, minZ + 0.11, w, 0.18, true],
        [cx, maxZ - 0.11, w, 0.18, true],
        [minX + 0.11, cz, 0.18, d, false],
        [maxX - 0.11, cz, 0.18, d, false],
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

      const cx = (minX + maxX) / 2
      const cz = (minZ + maxZ) / 2
      const w = maxX - minX - SIDEWALK_W * 2
      const d = maxZ - minZ - SIDEWALK_W * 2
      const seed = xi * 97 + zi * 53 + 1000
      const gx = xi - GRID_SPAN
      const gz = zi - GRID_SPAN

      addSidewalkTiles(root, cx, cz, maxX - minX, maxZ - minZ)

      const kind = civicKindAt(gx, gz) ?? pickBuildingKind(gx, gz, seed)
      if (kind !== 'park') {
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.88, metalness: 0.08 }),
        )
        pad.rotation.x = -Math.PI / 2
        pad.position.set(cx, 0.004, cz)
        pad.receiveShadow = true
        root.add(pad)
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

      // Street lamps on sidewalk corners — denser near plaza
      const lampChance = Math.abs(gx) + Math.abs(gz) <= 2 ? 0.25 : 0.45
      if (seededRand(seed + 31) > lampChance) {
        addStreetLampOnSidewalk(root, ctx, minX + SIDEWALK_W * 0.6, minZ + SIDEWALK_W * 0.6, frontYawForBlock(cx, cz))
      }
      if (seededRand(seed + 44) > 0.65) {
        addStreetLampOnSidewalk(root, ctx, maxX - SIDEWALK_W * 0.6, maxZ - SIDEWALK_W * 0.6, frontYawForBlock(cx, cz))
      }
    }
  }

  addIntersectionExtras(root, lines)

  ctx.scene.add(root)
  return root
}
