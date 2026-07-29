import * as THREE from 'three'
import { buildLot, pickBuildingKind } from './cityBuildings.js'
import {
  addLanternString,
  addPowerLines,
  addSidewalkTiles,
  scatterStreetProps,
} from './cityProps.js'
import { PLAZA_EXCLUDE } from './worldConfig.js'

const BLOCK = 13
const ROAD = 5
const PITCH = BLOCK + ROAD
const GRID_SPAN = 4
const SURFACE_Y = 0.006
const MARK_Y = 0.018

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622
const NEON_ACCENTS = [NEON_CYAN, NEON_PINK, NEON_YELLOW, NEON_ORANGE]

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
  for (let i = 0; i < 8000; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(28,28,34,${0.04 + Math.random() * 0.08})` : `rgba(36,36,44,${0.04 + Math.random() * 0.08})`
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 6)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function blockOverlapsPlaza(minX: number, maxX: number, minZ: number, maxZ: number) {
  return maxX > -PLAZA_EXCLUDE && minX < PLAZA_EXCLUDE && maxZ > -PLAZA_EXCLUDE && minZ < PLAZA_EXCLUDE
}

/** Face shop fronts toward the nearest avenue (away from city center). */
function frontYawForBlock(cx: number, cz: number): number {
  if (Math.abs(cx) >= Math.abs(cz)) return cx >= 0 ? -Math.PI / 2 : Math.PI / 2
  return cz >= 0 ? Math.PI : 0
}

function addStreetLamp(
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
  const armLen = 1.1
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.07, 0.07), poleMat)
  arm.position.set(x + Math.cos(faceYaw) * (armLen / 2 + 0.08), 4.05, z + Math.sin(faceYaw) * (armLen / 2 + 0.08))
  arm.rotation.y = faceYaw
  root.add(arm)
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0dd,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.35,
    roughness: 0.35,
  })
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.22), lampMat)
  lamp.position.set(x + Math.cos(faceYaw) * (armLen + 0.12), 3.98, z + Math.sin(faceYaw) * (armLen + 0.12))
  root.add(lamp)
  ctx.flickerMats.push({ mat: lampMat, base: 0.35, t: Math.random() * 3 })
  const light = new THREE.PointLight(NEON_CYAN, 0.45, 14, 2)
  light.position.copy(lamp.position)
  root.add(light)
}

function addZebraAtIntersection(root: THREE.Group, x: number, z: number, span: number) {
  const markMat = new THREE.MeshStandardMaterial({
    color: NEON_YELLOW,
    emissive: NEON_YELLOW,
    emissiveIntensity: 0.12,
    roughness: 0.62,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  for (let i = -2; i <= 2; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.45, span * 0.7), markMat)
    stripe.rotation.x = -Math.PI / 2
    stripe.position.set(x + i * 0.55, MARK_Y + 0.002, z)
    root.add(stripe)
    const stripe2 = stripe.clone()
    stripe2.rotation.z = Math.PI / 2
    stripe2.position.set(x, MARK_Y + 0.002, z + i * 0.55)
    root.add(stripe2)
  }
}

/** SimCity grid with varied districts — food streets near plaza, towers further out. */
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
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    emissive: 0xf2f2f2,
    emissiveIntensity: 0.04,
    roughness: 0.62,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })

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

  for (let li = 0; li < lines.length; li++) {
    const pos = lines[li]
    const isAvenue = li % 2 === 0
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
    if (isAvenue) {
      for (const [rx, rz, rw, rh] of [[pos, 0, 0.14, citySpan - ROAD], [0, pos, citySpan - ROAD, 0.14]] as const) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), markMat)
        dash.rotation.x = -Math.PI / 2
        dash.position.set(rx, MARK_Y, rz)
        root.add(dash)
      }
    }
  }

  for (const pos of lines) {
    if (Math.abs(pos) > PLAZA_EXCLUDE + ROAD) continue
    for (const side of [-1, 1]) {
      const curbV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, citySpan), curbMat)
      curbV.position.set(pos + side * (ROAD / 2 + 0.09), 0.07, 0)
      root.add(curbV)
      const curbH = new THREE.Mesh(new THREE.BoxGeometry(citySpan, 0.14, 0.18), curbMat)
      curbH.position.set(0, 0.07, pos + side * (ROAD / 2 + 0.09))
      root.add(curbH)
    }
  }

  for (let xi = 0; xi < lines.length - 1; xi++) {
    for (let zi = 0; zi < lines.length - 1; zi++) {
      const minX = lines[xi] + ROAD / 2
      const maxX = lines[xi + 1] - ROAD / 2
      const minZ = lines[zi] + ROAD / 2
      const maxZ = lines[zi + 1] - ROAD / 2
      if (blockOverlapsPlaza(minX, maxX, minZ, maxZ)) continue

      const cx = (minX + maxX) / 2
      const cz = (minZ + maxZ) / 2
      const w = maxX - minX - 0.6
      const d = maxZ - minZ - 0.6
      const seed = xi * 97 + zi * 53 + 1000
      const gx = xi - GRID_SPAN
      const gz = zi - GRID_SPAN

      addSidewalkTiles(root, cx, cz, w, d)

      const kind = pickBuildingKind(gx, gz, seed)
      if (kind !== 'park') {
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.88, metalness: 0.08 }),
        )
        pad.rotation.x = -Math.PI / 2
        pad.position.set(cx, 0.003, cz)
        pad.receiveShadow = true
        root.add(pad)
      }

      buildLot(kind, {
        root,
        ctx,
        cx,
        cz,
        w,
        d,
        seed,
        frontYaw: frontYawForBlock(cx, cz),
      })

      // Food-street atmosphere near plaza
      if (Math.abs(gx) + Math.abs(gz) <= 2 && seededRand(seed + 50) > 0.45) {
        const fo = frontYawForBlock(cx, cz)
        const lx = cx + Math.cos(fo) * d * 0.35
        const lz = cz + Math.sin(fo) * d * 0.35
        addLanternString(root, lx - 1.2, lz, lx + 1.2, lz, seed)
      }

      if (seededRand(seed + 77) > 0.82) {
        addPowerLines(root, cx - w * 0.4, cz, cx + w * 0.4, cz, 3.2 + seededRand(seed) * 0.8)
      }
    }
  }

  // Intersections: lamps, props, zebra crossings near plaza
  for (const x of lines) {
    for (const z of lines) {
      if (Math.abs(x) < PLAZA_EXCLUDE && Math.abs(z) < PLAZA_EXCLUDE) continue
      addStreetLamp(root, ctx, x + ROAD * 0.35, z + ROAD * 0.35, Math.PI * 0.25)

      const distPlaza = Math.max(Math.abs(x), Math.abs(z))
      if (distPlaza < PLAZA_EXCLUDE + PITCH * 1.5 && seededRand(x * 7 + z) > 0.5) {
        addZebraAtIntersection(root, x, z, ROAD)
      }

      scatterStreetProps(root, ctx, x + (seededRand(x + z) - 0.5) * ROAD * 0.5, z + (seededRand(z - x) - 0.5) * ROAD * 0.5, x * 13 + z)

      if (seededRand(x * 13 + z) > 0.75) {
        const accent = NEON_ACCENTS[Math.floor(seededRand(x + z) * NEON_ACCENTS.length)]
        const glow = new THREE.PointLight(accent, 0.28, 12, 2)
        glow.position.set(x, 0.6, z)
        root.add(glow)
      }
    }
  }

  ctx.scene.add(root)
  return root
}
