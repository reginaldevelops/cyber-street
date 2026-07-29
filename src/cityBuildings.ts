import * as THREE from 'three'
import { buildModernTower } from './modernBuilding.js'
import type { CityGridContext } from './cityGrid.js'

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_RED = 0xff2244
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622

export type BuildingKind =
  | 'ramen'
  | 'exchange'
  | 'cafe'
  | 'bar'
  | 'convenience'
  | 'market'
  | 'laundry'
  | 'karaoke'
  | 'rowshops'
  | 'tower'
  | 'park'
  | 'shrine'

export interface LotParams {
  root: THREE.Group
  ctx: CityGridContext
  cx: number
  cz: number
  w: number
  d: number
  seed: number
  /** Which block edge faces the nearest avenue (shop front). */
  frontYaw: number
}

function rand(seed: number) {
  return (Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453) % 1
}

function r(seed: number) {
  const v = rand(seed)
  return v < 0 ? v + 1 : v
}

function makeSign(label: string, color: number, w = 256, h = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#0c0a10'
  g.fillRect(0, 0, w, h)
  const css = `#${color.toString(16).padStart(6, '0')}`
  g.font = `bold ${h > 80 ? 36 : 26}px Courier New, monospace`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = css
  g.shadowColor = css
  g.shadowBlur = 14
  g.fillText(label, w / 2, h / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function neonSign(
  root: THREE.Group,
  ctx: CityGridContext,
  label: string,
  color: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  sw: number,
  sh: number,
  seed: number,
) {
  const tex = makeSign(label, color, 256, sh > 1 ? 128 : 64)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveIntensity: 0.9,
    emissiveMap: tex,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  root.add(mesh)
  ctx.flickerMats.push({ mat, base: 0.9, t: seed })
}

function frontOffset(yaw: number, depth: number) {
  return new THREE.Vector3(Math.sin(yaw) * depth * 0.48, 0, Math.cos(yaw) * depth * 0.48)
}

/** Japanese ramen shop — red facade, lanterns, menu board. */
export function buildRamenShop(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const h = 2.8
  const fo = frontOffset(frontYaw, d)
  const fx = cx + fo.x
  const fz = cz + fo.z

  const brickMat = new THREE.MeshStandardMaterial({ color: 0x4a3830, roughness: 0.88, metalness: 0.05 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, h, d * 0.88), brickMat)
  body.position.set(cx, h / 2, cz)
  root.add(body)

  const frontMat = new THREE.MeshStandardMaterial({
    color: 0x881818,
    emissive: 0x441010,
    emissiveIntensity: 0.25,
    roughness: 0.65,
  })
  const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.85, 0.12), frontMat)
  front.position.set(fx, h * 0.45, fz)
  front.rotation.y = frontYaw
  root.add(front)

  neonSign(root, ctx, 'RAMEN', NEON_RED, fx, h * 0.72, fz, frontYaw, 2.4, 0.55, seed)

  for (let i = 0; i < 5; i++) {
    const lanMat = new THREE.MeshStandardMaterial({
      color: 0xcc1111,
      emissive: 0xff2233,
      emissiveIntensity: 0.8,
    })
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lanMat)
    lan.scale.y = 1.4
    const lx = fx + Math.cos(frontYaw + Math.PI / 2) * (-1 + i * 0.5)
    const lz = fz + Math.sin(frontYaw + Math.PI / 2) * (-1 + i * 0.5)
    lan.position.set(lx, 2.1, lz)
    root.add(lan)
  }

  const counterGlow = new THREE.PointLight(NEON_ORANGE, 0.35, 8, 2)
  counterGlow.position.set(fx, 1.2, fz)
  root.add(counterGlow)
}

/** 24h money exchange — bright neon currencies. */
export function buildExchange(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const h = 3.2
  const fo = frontOffset(frontYaw, d)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.85, h, d * 0.85),
    new THREE.MeshStandardMaterial({ color: 0x3a3438, roughness: 0.7, metalness: 0.2 }),
  )
  body.position.set(cx, h / 2, cz)
  root.add(body)
  neonSign(root, ctx, '24 EXCHANGE', NEON_PINK, cx + fo.x, h * 0.55, cz + fo.z, frontYaw, 2.6, 0.65, seed)
  neonSign(root, ctx, '€ $ ¥', NEON_YELLOW, cx + fo.x, h * 0.35, cz + fo.z, frontYaw, 1.4, 0.4, seed + 1)
}

/** Corner café with terrace tables. */
export function buildCafe(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const h = 2.4
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.8, h, d * 0.8),
    new THREE.MeshStandardMaterial({ color: 0x3a3834, roughness: 0.75, metalness: 0.15 }),
  )
  body.position.set(cx, h / 2, cz)
  root.add(body)

  const fo = frontOffset(frontYaw, d)
  neonSign(root, ctx, 'CAFE', NEON_CYAN, cx + fo.x, h * 0.6, cz + fo.z, frontYaw, 1.6, 0.45, seed)

  const tableMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5, metalness: 0.2 })
  for (let i = 0; i < 2 + Math.floor(r(seed) * 2); i++) {
    const tx = cx + fo.x * 0.3 + Math.cos(frontYaw + Math.PI / 2) * (i - 1) * 0.9
    const tz = cz + fo.z * 0.3 + Math.sin(frontYaw + Math.PI / 2) * (i - 1) * 0.9
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10), tableMat)
    table.position.set(tx, 0.45, tz)
    root.add(table)
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), tableMat)
    chair.position.set(tx, 0.25, tz + 0.55)
    root.add(chair)
  }
}

/** Neon bar / izakaya vertical strip. */
export function buildBar(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const h = 3.5
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.75, h, d * 0.75),
    new THREE.MeshStandardMaterial({ color: 0x1a1822, roughness: 0.8, metalness: 0.15 }),
  )
  body.position.set(cx, h / 2, cz)
  root.add(body)
  const fo = frontOffset(frontYaw, d)
  neonSign(root, ctx, 'BAR', NEON_PINK, cx + fo.x, h * 0.5, cz + fo.z, frontYaw, 0.55, 2.2, seed)
  const bottleMat = new THREE.MeshStandardMaterial({
    color: 0x88ffaa,
    emissive: 0x44aa66,
    emissiveIntensity: 0.4,
  })
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), bottleMat)
    b.position.set(cx + fo.x * 0.9, 1 + i * 0.35, cz + fo.z * 0.9)
    root.add(b)
  }
}

/** Bright convenience store — lit glass front. */
export function buildConvenience(p: LotParams) {
  const { root, cx, cz, w, d, frontYaw } = p
  const h = 2.2
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.9, h, d * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x2a3848, roughness: 0.4, metalness: 0.3 }),
  )
  body.position.set(cx, h / 2, cz)
  root.add(body)
  const fo = frontOffset(frontYaw, d)
  const glass = new THREE.MeshStandardMaterial({
    color: 0xaaccff,
    emissive: 0x6688bb,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.85,
  })
  const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.65, h * 0.65), glass)
  win.position.set(cx + fo.x, h * 0.45, cz + fo.z)
  win.rotation.y = frontYaw
  root.add(win)
}

/** Open market front — crates, awning. */
export function buildMarket(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const fo = frontOffset(frontYaw, d)
  const awningMat = new THREE.MeshStandardMaterial({
    color: NEON_YELLOW,
    emissive: NEON_YELLOW,
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  })
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, 0.04, 1.2), awningMat)
  awning.position.set(cx + fo.x * 0.5, 2.2, cz + fo.z * 0.5)
  awning.rotation.y = frontYaw
  root.add(awning)
  ctx.flickerMats.push({ mat: awningMat, base: 0.35, t: seed })

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.85, metalness: 0.05 })
  for (let i = 0; i < 5; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.45), crateMat)
    crate.position.set(
      cx + fo.x * 0.2 + Math.cos(frontYaw + Math.PI / 2) * (i - 2) * 0.55,
      0.18,
      cz + fo.z * 0.2 + Math.sin(frontYaw + Math.PI / 2) * (i - 2) * 0.55,
    )
    root.add(crate)
  }
}

/** Small park / plaza pocket — benches, tree, less concrete. */
export function buildParkLot(p: LotParams) {
  const { root, cx, cz, w, d, seed } = p
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.95, d * 0.95),
    new THREE.MeshStandardMaterial({ color: 0x1a2820, roughness: 0.95, metalness: 0 }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(cx, 0.005, cz)
  root.add(grass)

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 }),
  )
  trunk.position.set(cx, 0.6, cz)
  root.add(trunk)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x224433, roughness: 0.85 }),
  )
  canopy.position.set(cx, 1.5, cz)
  root.add(canopy)

  if (r(seed) > 0.4) {
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.08, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.85 }),
    )
    bench.position.set(cx + 1.2, 0.42, cz)
    root.add(bench)
  }
}

/** Row of 2–3 narrow shop fronts in one block. */
export function buildRowShops(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const count = 2 + Math.floor(r(seed) * 2)
  const shopW = (w * 0.9) / count
  const labels = ['NOOD', 'INKT', 'GEAR', 'TECH', 'HACK', 'DATA', 'VOID', 'NET']
  const colors = [NEON_CYAN, NEON_PINK, NEON_YELLOW, NEON_ORANGE]

  for (let i = 0; i < count; i++) {
    const sx = cx + (i - (count - 1) / 2) * shopW
    const h = 2 + r(seed + i * 7) * 1.8
    const wallHue = 0.68 + r(seed + i) * 0.12
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(shopW * 0.88, h, d * 0.75),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(wallHue, 0.15, 0.16 + r(seed + i * 3) * 0.08),
        roughness: 0.78,
      }),
    )
    wall.position.set(sx, h / 2, cz)
    root.add(wall)

    const fo = frontOffset(frontYaw, d)
    const label = labels[Math.floor(r(seed + i * 11) * labels.length)]
    const color = colors[Math.floor(r(seed + i * 13) * colors.length)]
    neonSign(root, ctx, label, color, sx + fo.x, h * 0.55, cz + fo.z, frontYaw, shopW * 0.7, 0.45, seed + i)
  }
}

export function buildTower(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed } = p
  const floors = 5 + Math.floor(r(seed) * 7)
  const towerW = Math.min(w * 0.7, 5.2)
  const towerD = Math.min(d * 0.7, 5.2)
  const windowMats: THREE.MeshStandardMaterial[] = []
  const tower = buildModernTower({
    width: towerW,
    depth: towerD,
    floors,
    balconies: r(seed + 2) > 0.35,
    balconySide: r(seed + 3) > 0.5 ? 1 : -1,
    seed: seed * 17,
    windowMatsOut: windowMats,
  })
  tower.position.set(cx, 0, cz)
  root.add(tower)
  for (const wm of windowMats) {
    ctx.flickerMats.push({ mat: wm, base: wm.emissiveIntensity, t: r(seed) * 4 })
  }
}

/** Pick building type from district + avoid repetition via seed. */
export function pickBuildingKind(gx: number, gz: number, seed: number): BuildingKind {
  const ring = Math.abs(gx) + Math.abs(gz)
  const roll = r(seed * 19 + gx * 3 + gz * 7)

  if (ring <= 2) {
    const food: BuildingKind[] = ['ramen', 'exchange', 'cafe', 'bar', 'convenience', 'market', 'rowshops', 'karaoke']
    return food[Math.floor(roll * food.length)]
  }
  if (ring <= 3) {
    if (roll < 0.12) return 'park'
    if (roll < 0.22) return 'market'
    if (roll < 0.38) return 'rowshops'
    if (roll < 0.52) return 'convenience'
    if (roll < 0.62) return 'laundry'
    if (roll < 0.75) return 'cafe'
    return roll > 0.88 ? 'tower' : 'bar'
  }
  if (roll < 0.08) return 'park'
  if (roll < 0.15) return 'shrine'
  if (roll < 0.55) return 'tower'
  if (roll < 0.72) return 'rowshops'
  return r(seed + 99) > 0.5 ? 'convenience' : 'laundry'
}

export function buildKaraoke(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const h = 3.8
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.7, h, d * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x2a1838, roughness: 0.65, metalness: 0.25 }),
  )
  body.position.set(cx, h / 2, cz)
  root.add(body)
  const fo = frontOffset(frontYaw, d)
  neonSign(root, ctx, 'KARAOKE', NEON_PINK, cx + fo.x, h * 0.55, cz + fo.z, frontYaw, 0.5, 2.4, seed)
}

export function buildLaundry(p: LotParams) {
  const { root, cx, cz, w, d, frontYaw } = p
  const h = 2.4
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.85, h, d * 0.85),
    new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.2 }),
  )
  body.position.set(cx, h / 2, cz)
  root.add(body)
  const fo = frontOffset(frontYaw, d)
  const spinMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    emissive: 0x4488cc,
    emissiveIntensity: 0.5,
  })
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), spinMat)
  win.position.set(cx + fo.x, h * 0.45, cz + fo.z)
  win.rotation.y = frontYaw
  root.add(win)
}

export function buildShrine(p: LotParams) {
  const { root, cx, cz, seed } = p
  const stone = new THREE.MeshStandardMaterial({ color: 0x4a4848, roughness: 0.85, metalness: 0.1 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 1.8), stone)
  base.position.set(cx, 0.12, cz)
  root.add(base)
  const torii = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), stone)
  torii.position.set(cx, 1.6, cz)
  root.add(torii)
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), stone)
    pillar.position.set(cx + side * 0.9, 0.85, cz)
    root.add(pillar)
  }
  if (r(seed) > 0.5) {
    const lan = new THREE.MeshStandardMaterial({
      color: 0xcc1111,
      emissive: 0xff2233,
      emissiveIntensity: 0.7,
    })
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), lan)
    orb.position.set(cx, 2.0, cz)
    root.add(orb)
  }
}

export function buildLot(kind: BuildingKind, p: LotParams) {
  switch (kind) {
    case 'ramen': return buildRamenShop(p)
    case 'exchange': return buildExchange(p)
    case 'cafe': return buildCafe(p)
    case 'bar': return buildBar(p)
    case 'convenience': return buildConvenience(p)
    case 'market': return buildMarket(p)
    case 'park': return buildParkLot(p)
    case 'rowshops': return buildRowShops(p)
    case 'tower': return buildTower(p)
    case 'karaoke': return buildKaraoke(p)
    case 'laundry': return buildLaundry(p)
    case 'shrine': return buildShrine(p)
  }
}
