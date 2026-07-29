import * as THREE from 'three'
import { buildModernTower } from './modernBuilding.js'
import { PLAZA_EXCLUDE } from './worldConfig.js'

const BLOCK = 13
const ROAD = 5
const PITCH = BLOCK + ROAD
const GRID_SPAN = 4 // blocks outward from center per axis
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
    const x = Math.random() * 512
    const y = Math.random() * 512
    const a = 0.04 + Math.random() * 0.08
    g.fillStyle = Math.random() > 0.5 ? `rgba(28,28,34,${a})` : `rgba(36,36,44,${a})`
    g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  for (let i = 0; i < 5; i++) {
    const wx = Math.random() * 512
    g.fillStyle = `rgba(40,48,58,${0.08 + Math.random() * 0.06})`
    g.fillRect(wx, 0, 8 + Math.random() * 20, 512)
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

function makeSignTexture(label: string, hexColor: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0c0a10'
  ctx.fillRect(0, 0, 256, 64)
  const css = `#${hexColor.toString(16).padStart(6, '0')}`
  ctx.font = 'bold 28px Courier New, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = css
  ctx.shadowColor = css
  ctx.shadowBlur = 12
  ctx.fillText(label, 128, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function addNeonSign(
  root: THREE.Group,
  ctx: CityGridContext,
  x: number,
  y: number,
  z: number,
  rotY: number,
  label: string,
  color: number,
  seed: number,
) {
  const tex = makeSignTexture(label, color)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveIntensity: 0.85,
    emissiveMap: tex,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.85), mat)
  sign.position.set(x, y, z)
  sign.rotation.y = rotY
  root.add(sign)
  ctx.flickerMats.push({ mat, base: 0.85, t: seed })
}

function buildCommercialBlock(
  root: THREE.Group,
  ctx: CityGridContext,
  cx: number,
  cz: number,
  w: number,
  d: number,
  seed: number,
) {
  const floors = 2 + Math.floor(seededRand(seed) * 4)
  const fh = 1.25
  const h = floors * fh + 0.3
  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.72 + seededRand(seed + 1) * 0.08, 0.12, 0.14 + seededRand(seed + 2) * 0.06),
    roughness: 0.72,
    metalness: 0.18,
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h, d * 0.92), wallMat)
  body.position.set(cx, h / 2, cz)
  body.castShadow = true
  body.receiveShadow = true
  root.add(body)

  const accent = NEON_ACCENTS[Math.floor(seededRand(seed + 3) * NEON_ACCENTS.length)]
  const trimMat = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0.5,
  })
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.12, d * 0.94), trimMat)
  trim.position.set(cx, 0.06, cz)
  root.add(trim)
  ctx.flickerMats.push({ mat: trimMat, base: 0.55, t: seed * 0.7 })

  const labels = ['RAMEN', 'DATA', 'GEAR', 'NOOD', 'TECH', 'INKT', 'HACK', 'VOID']
  const label = labels[Math.floor(seededRand(seed + 4) * labels.length)]
  addNeonSign(root, ctx, cx, h * 0.55, cz + d * 0.47, 0, label, accent, seed)

  for (let f = 0; f < floors; f++) {
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      emissive: seededRand(seed + f * 11) > 0.35 ? 0x88bbff : 0x221818,
      emissiveIntensity: 0.35 + seededRand(seed + f) * 0.4,
      roughness: 0.25,
    })
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, fh * 0.55), winMat)
    win.position.set(cx, 0.55 + f * fh + fh * 0.35, cz + d * 0.465)
    root.add(win)
    if (winMat.emissiveIntensity > 0.4) {
      ctx.flickerMats.push({ mat: winMat, base: winMat.emissiveIntensity, t: seed + f })
    }
  }

  if (seededRand(seed + 9) > 0.55) {
    const holoMat = new THREE.MeshBasicMaterial({
      color: NEON_PINK,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), holoMat)
    holo.position.set(cx + w * 0.35, h + 1.1, cz)
    root.add(holo)
  }
}

function buildCityBlock(
  root: THREE.Group,
  ctx: CityGridContext,
  cx: number,
  cz: number,
  w: number,
  d: number,
  seed: number,
) {
  const roll = seededRand(seed)
  if (roll > 0.62) {
    const floors = 4 + Math.floor(seededRand(seed + 1) * 6)
    const towerW = Math.min(w * 0.75, 5.5)
    const towerD = Math.min(d * 0.75, 5.5)
    const windowMats: THREE.MeshStandardMaterial[] = []
    const tower = buildModernTower({
      width: towerW,
      depth: towerD,
      floors,
      balconies: seededRand(seed + 2) > 0.4,
      balconySide: seededRand(seed + 3) > 0.5 ? 1 : -1,
      seed: seed * 17,
      windowMatsOut: windowMats,
    })
    tower.position.set(cx, 0, cz)
    root.add(tower)
    for (const wm of windowMats) {
      ctx.flickerMats.push({ mat: wm, base: wm.emissiveIntensity, t: Math.random() * 4 })
    }
    if (seededRand(seed + 5) > 0.5) {
      addNeonSign(root, ctx, cx, floors * 1.35 * 0.55, cz + towerD * 0.52, 0, 'APT', NEON_CYAN, seed)
    }
  } else {
    buildCommercialBlock(root, ctx, cx, cz, w, d, seed)
  }
}

/** SimCity-style orthogonal grid — plaza stays center hub, city blocks radiate outward. */
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

  // Road grid
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
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.14, citySpan - ROAD), markMat)
      dash.rotation.x = -Math.PI / 2
      dash.position.set(pos, MARK_Y, 0)
      root.add(dash)
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(citySpan - ROAD, 0.14), markMat)
      dashH.rotation.x = -Math.PI / 2
      dashH.position.set(0, MARK_Y, pos)
      root.add(dashH)
    }
  }

  // Curbs along plaza-adjacent roads
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

  // City blocks + intersection lamps
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
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.88, metalness: 0.08 }),
      )
      pad.rotation.x = -Math.PI / 2
      pad.position.set(cx, 0.003, cz)
      pad.receiveShadow = true
      root.add(pad)

      const seed = xi * 97 + zi * 53 + 1000
      buildCityBlock(root, ctx, cx, cz, w, d, seed)
    }
  }

  for (const x of lines) {
    for (const z of lines) {
      if (Math.abs(x) < PLAZA_EXCLUDE && Math.abs(z) < PLAZA_EXCLUDE) continue
      addStreetLamp(root, ctx, x + ROAD * 0.35, z + ROAD * 0.35, Math.PI * 0.25)
      if (seededRand(x * 13 + z) > 0.7) {
        const accent = NEON_ACCENTS[Math.floor(seededRand(x + z) * NEON_ACCENTS.length)]
        const glow = new THREE.PointLight(accent, 0.25, 10, 2)
        glow.position.set(x, 0.5, z)
        root.add(glow)
      }
    }
  }

  ctx.scene.add(root)
  return root
}
