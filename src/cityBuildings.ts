import * as THREE from 'three'
import { buildModernTower } from './modernBuilding.js'
import type { CityGridContext } from './cityGrid.js'
import {
  NEON_BLUE,
  NEON_CYAN,
  NEON_GREEN,
  NEON_ORANGE,
  NEON_PINK,
  NEON_PURPLE,
  NEON_RED,
  NEON_YELLOW,
  WINDOW_COOL,
  WINDOW_WARM,
  addAwning,
  addBuildingMass,
  addCanopy,
  addCollider,
  addEntryDoors,
  addLedBelt,
  addLotLight,
  addNeonSign,
  addParkingApron,
  addRoofAc,
  addWindowRibbon,
  lotFrame,
  matGlass,
  matMetal,
  matPaint,
  seeded,
} from './buildingKit.js'

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
  | 'police'
  | 'fire'
  | 'hospital'
  | 'diner'
  | 'bank'
  | 'hotel'
  | 'theater'
  | 'clinic'
  | 'arcade'
  | 'pharmacy'
  | 'garage'

export interface LotParams {
  root: THREE.Group
  ctx: CityGridContext
  cx: number
  cz: number
  w: number
  d: number
  seed: number
  frontYaw: number
}

function r(seed: number) {
  return seeded(seed)
}

/** Civic / landmark slots — guaranteed metro anchors. */
export const CIVIC_SLOTS: [gridX: number, gridZ: number, kind: BuildingKind][] = [
  [-3, 1, 'police'],
  [1, -3, 'fire'],
  [3, 2, 'hospital'],
  [-2, -2, 'diner'],
  [2, -2, 'bank'],
  [-3, -2, 'hotel'],
  [2, 3, 'theater'],
  [-1, 3, 'arcade'],
  [3, -1, 'clinic'],
  [-3, 3, 'garage'],
]

export function civicKindAt(gx: number, gz: number): BuildingKind | null {
  for (const [cx, cz, kind] of CIVIC_SLOTS) {
    if (gx === cx && gz === cz) return kind
  }
  return null
}

// ── Food & nightlife ─────────────────────────────────────────────────────────

export function buildRamenShop(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 3.0
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x3a2824, metalness: 0.08 })
  addLedBelt(root, ctx, f, 0.22 + h * 0.55, NEON_RED, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.5, count: 4, winW: 1.1, winH: 1.6, span: bw * 0.7, glow: WINDOW_WARM })
  addEntryDoors(root, ctx, f, { color: NEON_RED, width: 1.1 })
  addAwning(root, ctx, f, { y: 2.55, width: bw * 0.75, color: NEON_RED })
  addNeonSign(root, ctx, 'RAMEN', NEON_RED, f.frontX + f.fx * 0.15, h + 0.35, f.frontZ + f.fz * 0.15, frontYaw, 2.6, 0.6, seed)
  addNeonSign(root, ctx, '一蘭', NEON_YELLOW, f.frontX + f.fx * 0.12, h - 0.15, f.frontZ + f.fz * 0.12, frontYaw, 1.4, 0.35, seed + 1, 0.85)

  for (let i = 0; i < 5; i++) {
    const lanMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0xff2233, emissiveIntensity: 0.85 })
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lanMat)
    lan.scale.y = 1.35
    const t = (i - 2) * 0.55
    lan.position.set(f.frontX + f.rx * t + f.fx * 0.7, 2.15, f.frontZ + f.rz * t + f.fz * 0.7)
    root.add(lan)
  }
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_ORANGE, 0.4)
  addCollider(root, ctx, f, h + 0.4, bw, bd)
}

export function buildExchange(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 3.4
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x2a2430, metalness: 0.35, upperScale: 0.7, upperH: 1.2, upperColor: 0x3a3444 })
  addLedBelt(root, ctx, f, 0.22 + h, NEON_PINK, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.6, count: 5, winW: 0.95, winH: 1.8, span: bw * 0.78, glow: NEON_PINK, intensity: 0.45 })
  addEntryDoors(root, ctx, f, { color: NEON_PINK })
  addCanopy(root, ctx, f, { y: 2.7, width: 3.2, glow: NEON_PINK })
  addNeonSign(root, ctx, '24 EXCHANGE', NEON_PINK, f.frontX, h + 0.55, f.frontZ, frontYaw, 3.0, 0.55, seed)
  addNeonSign(root, ctx, '€ $ ¥ ₿', NEON_YELLOW, f.frontX, h + 0.05, f.frontZ, frontYaw, 2.0, 0.35, seed + 1)
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_PINK, 0.4)
  addCollider(root, ctx, f, topY, bw, bd)
}

export function buildCafe(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 2.6
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x3a342e })
  addWindowRibbon(root, ctx, f, { y: 1.35, count: 4, winW: 1.15, winH: 1.5, span: bw * 0.72, glow: WINDOW_WARM, intensity: 0.65 })
  addEntryDoors(root, ctx, f, { color: NEON_CYAN, width: 0.95 })
  addAwning(root, ctx, f, { y: 2.3, width: bw * 0.8, color: NEON_CYAN })
  addNeonSign(root, ctx, 'CAFE NOIR', NEON_CYAN, f.frontX, h + 0.3, f.frontZ, frontYaw, 2.4, 0.45, seed)

  const tableMat = matPaint(0x8a3030)
  for (let i = 0; i < 3; i++) {
    const t = (i - 1) * 1.05
    const tx = f.frontX + f.rx * t + f.fx * 1.4
    const tz = f.frontZ + f.rz * t + f.fz * 1.4
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10), tableMat)
    table.position.set(tx, 0.72, tz)
    root.add(table)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), matMetal(0x333338))
    leg.position.set(tx, 0.35, tz)
    root.add(leg)
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.35), tableMat)
    chair.position.set(tx - f.fx * 0.55, 0.28, tz - f.fz * 0.55)
    root.add(chair)
  }
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, WINDOW_WARM, 0.35)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildBar(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 3.8
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x14121c, metalness: 0.25 })
  addLedBelt(root, ctx, f, 0.22 + 2.2, NEON_PINK, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.4, count: 3, winW: 1.3, winH: 1.7, span: bw * 0.65, glow: NEON_PURPLE, intensity: 0.5 })
  addEntryDoors(root, ctx, f, { color: NEON_PINK, height: 2.35 })
  addCanopy(root, ctx, f, { y: 2.65, width: 2.8, glow: NEON_PINK })
  // Vertical strip sign
  addNeonSign(root, ctx, 'BAR', NEON_PINK, f.frontX + f.rx * (bw * 0.42), 2.4, f.frontZ + f.rz * (bw * 0.42), frontYaw, 0.5, 2.4, seed)
  addNeonSign(root, ctx, 'OPEN', NEON_CYAN, f.frontX, 3.5, f.frontZ, frontYaw, 1.2, 0.3, seed + 1)

  const bottleMat = new THREE.MeshStandardMaterial({ color: 0x88ffaa, emissive: 0x44aa66, emissiveIntensity: 0.5 })
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), bottleMat)
    b.position.set(f.frontX + f.rx * (i - 2) * 0.25 + f.fx * 0.2, 1.3 + (i % 3) * 0.15, f.frontZ + f.rz * (i - 2) * 0.25 + f.fz * 0.2)
    root.add(b)
  }
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_PINK, 0.5)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildDiner(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw, 0.42)
  const h = 3.2
  const { bw, bd, topY } = addBuildingMass(root, f, {
    h,
    color: 0xc8ccd2,
    metalness: 0.75,
    rounded: true,
    upperScale: 0.72,
    upperH: 1.6,
    upperColor: 0xb0b4bc,
  })
  addLedBelt(root, ctx, f, 0.22 + h, NEON_RED, bw * 0.98, bd * 0.98, seed)
  addWindowRibbon(root, ctx, f, { y: 1.55, count: 5, winW: 1.15, winH: 1.9, span: bw * 0.72, glow: WINDOW_WARM, intensity: 0.65 })
  addWindowRibbon(root, ctx, f, { y: 0.22 + h + 0.9, count: 4, winW: 1.0, winH: 1.1, span: bw * 0.55, glow: WINDOW_WARM, intensity: 0.5 })
  addEntryDoors(root, ctx, f, { color: NEON_CYAN, height: 2.3 })
  addCanopy(root, ctx, f, { y: 2.75, width: 3.6, glow: 0xf2f4f8 })
  addNeonSign(root, ctx, 'DINER', NEON_RED, f.frontX, h + 0.55, f.frontZ, frontYaw, 3.4, 0.7, seed, 1.15)
  addNeonSign(root, ctx, 'OPEN 24H', NEON_YELLOW, f.frontX, h + 0.05, f.frontZ, frontYaw, 1.8, 0.32, seed + 1)
  addParkingApron(root, f, { spots: 3, color: NEON_CYAN })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_RED, 0.45)
  addLotLight(root, f, WINDOW_WARM, 0.35, 10)
  addCollider(root, ctx, f, topY, bw, bd)
}

export function buildConvenience(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 2.5
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x2a3848, metalness: 0.28 })
  addLedBelt(root, ctx, f, 0.22 + h - 0.15, NEON_GREEN, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.3, count: 4, winW: 1.35, winH: 1.7, span: bw * 0.8, glow: WINDOW_COOL, intensity: 0.7 })
  addEntryDoors(root, ctx, f, { color: NEON_GREEN, double: true })
  addCanopy(root, ctx, f, { y: 2.35, width: bw * 0.7, glow: NEON_GREEN })
  addNeonSign(root, ctx, '24/7 MART', NEON_GREEN, f.frontX, h + 0.25, f.frontZ, frontYaw, 2.8, 0.45, seed)
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_GREEN, 0.4)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildMarket(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 2.2
  const { bw, bd } = addBuildingMass(root, f, { h, color: 0x3a3028 })
  addAwning(root, ctx, f, { y: 2.15, width: bw * 0.9, depth: 1.8, color: NEON_YELLOW })
  addWindowRibbon(root, ctx, f, { y: 1.2, count: 3, winW: 1.4, winH: 1.3, span: bw * 0.7, glow: WINDOW_WARM })
  addNeonSign(root, ctx, 'MARKET', NEON_ORANGE, f.frontX, h + 0.55, f.frontZ, frontYaw, 2.4, 0.4, seed)

  const crateMat = matPaint(0x5a4030)
  for (let i = 0; i < 6; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35 + r(seed + i) * 0.15, 0.45), crateMat)
    const t = (i - 2.5) * 0.6
    crate.position.set(f.frontX + f.rx * t + f.fx * 1.1, 0.2, f.frontZ + f.rz * t + f.fz * 1.1)
    root.add(crate)
  }
  addLotLight(root, f, NEON_YELLOW, 0.35)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildKaraoke(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 4.2
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x2a1838, metalness: 0.3 })
  addLedBelt(root, ctx, f, 0.22 + 2.0, NEON_PINK, bw, bd, seed)
  addLedBelt(root, ctx, f, 0.22 + 3.2, NEON_PURPLE, bw, bd, seed + 1)
  addWindowRibbon(root, ctx, f, { y: 1.5, count: 3, winW: 1.2, winH: 1.6, span: bw * 0.6, glow: NEON_PINK })
  addEntryDoors(root, ctx, f, { color: NEON_PINK })
  addNeonSign(root, ctx, 'KARAOKE', NEON_PINK, f.frontX + f.rx * bw * 0.4, 2.6, f.frontZ + f.rz * bw * 0.4, frontYaw, 0.55, 2.6, seed)
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_PINK, 0.5)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildLaundry(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 2.5
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x3a4048 })
  addWindowRibbon(root, ctx, f, { y: 1.35, count: 3, winW: 1.2, winH: 1.5, span: bw * 0.7, glow: WINDOW_COOL })
  addEntryDoors(root, ctx, f, { color: NEON_CYAN, double: false, width: 1.2 })
  addNeonSign(root, ctx, 'LAUNDRY', NEON_CYAN, f.frontX, h + 0.25, f.frontZ, frontYaw, 2.2, 0.4, seed)
  const spinMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488cc, emissiveIntensity: 0.55 })
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14), spinMat)
    win.position.set(f.frontX + f.rx * side * 1.4 + f.fx * 0.1, 1.2, f.frontZ + f.rz * side * 1.4 + f.fz * 0.1)
    win.rotation.y = frontYaw
    root.add(win)
  }
  addRoofAc(root, f, topY, seed)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildRowShops(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const count = 2 + Math.floor(r(seed) * 2)
  const shopW = (w * 0.92) / count
  const labels = ['NOOD', 'INKT', 'GEAR', 'TECH', 'HACK', 'DATA', 'VOID', 'NET', 'CHIP', 'LENS']
  const colors = [NEON_CYAN, NEON_PINK, NEON_YELLOW, NEON_ORANGE, NEON_GREEN, NEON_PURPLE]

  for (let i = 0; i < count; i++) {
    const sx = cx + (i - (count - 1) / 2) * shopW
    const h = 2.2 + r(seed + i * 7) * 1.6
    const f = lotFrame(sx, cz, shopW, d, frontYaw)
    const wallHue = 0.65 + r(seed + i) * 0.15
    const color = new THREE.Color().setHSL(wallHue, 0.18, 0.14 + r(seed + i * 3) * 0.1).getHex()
    const { bw, bd, topY } = addBuildingMass(root, f, { h, color })
    addWindowRibbon(root, ctx, f, {
      y: 1.25,
      count: 2,
      winW: shopW * 0.35,
      winH: h * 0.5,
      span: bw * 0.7,
      glow: WINDOW_WARM,
      intensity: 0.45 + r(seed + i) * 0.3,
    })
    addEntryDoors(root, ctx, f, { color: colors[i % colors.length], double: false, width: 0.9, height: 2.0 })
    const label = labels[Math.floor(r(seed + i * 11) * labels.length)]
    const neon = colors[Math.floor(r(seed + i * 13) * colors.length)]
    addNeonSign(root, ctx, label, neon, f.frontX, h * 0.7, f.frontZ, frontYaw, shopW * 0.65, 0.4, seed + i)
    if (r(seed + i * 17) > 0.45) addAwning(root, ctx, f, { y: h * 0.85, width: bw * 0.8, color: neon })
    addRoofAc(root, f, topY, seed + i)
    addCollider(root, ctx, f, h + 0.2, bw, bd)
  }
}

// ── Civic ────────────────────────────────────────────────────────────────────

export function buildPolice(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const POLICE_BLUE = 0x2266cc
  const h = 3.8
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x2a3040, metalness: 0.3, upperScale: 0.65, upperH: 1.4, upperColor: 0x343c4c })
  addLedBelt(root, ctx, f, 0.22 + h, POLICE_BLUE, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.7, count: 5, winW: 1.0, winH: 1.7, span: bw * 0.75, glow: WINDOW_COOL })
  addEntryDoors(root, ctx, f, { color: POLICE_BLUE, height: 2.4 })
  addCanopy(root, ctx, f, { y: 2.85, width: 3.4, glow: POLICE_BLUE })
  addNeonSign(root, ctx, 'POLITIE', POLICE_BLUE, f.frontX, h + 0.4, f.frontZ, frontYaw, 2.8, 0.55, seed)

  const badgeMat = new THREE.MeshStandardMaterial({ color: POLICE_BLUE, emissive: POLICE_BLUE, emissiveIntensity: 0.75 })
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 6), badgeMat)
  badge.rotation.x = Math.PI / 2
  badge.position.set(f.frontX + f.fx * 0.12, 2.0, f.frontZ + f.fz * 0.12)
  badge.rotation.y = frontYaw
  root.add(badge)

  // Garage bay
  const bay = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.4, 2.0, 0.12), matMetal(0x1a1a22, 0.5, 0.55))
  bay.position.set(f.frontX + f.rx * bw * 0.28 + f.fx * 0.05, 1.1, f.frontZ + f.rz * bw * 0.28 + f.fz * 0.05)
  bay.rotation.y = frontYaw
  root.add(bay)

  addParkingApron(root, f, { spots: 2, color: POLICE_BLUE })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, POLICE_BLUE, 0.4)
  addCollider(root, ctx, f, topY, bw, bd)
}

export function buildFireStation(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const FIRE_RED = 0xdd2222
  const h = 3.8
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x3a3028 })
  addLedBelt(root, ctx, f, 0.22 + h - 0.2, FIRE_RED, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 2.6, count: 4, winW: 0.9, winH: 1.0, span: bw * 0.7, glow: WINDOW_WARM })
  addNeonSign(root, ctx, 'BRANDWEER', FIRE_RED, f.frontX, h + 0.35, f.frontZ, frontYaw, 3.0, 0.5, seed)

  for (let i = 0; i < 2; i++) {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x881818, emissive: FIRE_RED, emissiveIntensity: 0.3, roughness: 0.55 })
    const door = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.35, 2.4, 0.12), doorMat)
    const t = (i - 0.5) * bw * 0.4
    door.position.set(f.frontX + f.rx * t + f.fx * 0.08, 1.3, f.frontZ + f.rz * t + f.fz * 0.08)
    door.rotation.y = frontYaw
    root.add(door)
  }

  const ladderMat = matMetal(0x4a5058)
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.4, h * 1.15, 0.4), ladderMat)
  tower.position.set(f.cx - f.rx * bw * 0.4, h * 0.55, f.cz - f.rz * bw * 0.4)
  root.add(tower)
  for (let i = 0; i < 7; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.06), ladderMat)
    rung.position.set(tower.position.x + f.fx * 0.22, 0.45 + i * 0.5, tower.position.z + f.fz * 0.22)
    root.add(rung)
  }
  addParkingApron(root, f, { spots: 2, color: FIRE_RED })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, FIRE_RED, 0.4)
  addCollider(root, ctx, f, topY + 0.5, bw, bd)
}

export function buildHospital(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const MED_CYAN = 0x44ddcc
  const h = 4.5
  const { bw, bd, topY } = addBuildingMass(root, f, {
    h,
    color: 0x3a4048,
    metalness: 0.25,
    upperScale: 0.78,
    upperH: 2.0,
    upperColor: 0x444c54,
  })
  addLedBelt(root, ctx, f, 0.22 + h, MED_CYAN, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.7, count: 6, winW: 0.95, winH: 1.8, span: bw * 0.8, glow: WINDOW_COOL, intensity: 0.6 })
  addWindowRibbon(root, ctx, f, { y: 0.22 + h + 1.0, count: 5, winW: 0.85, winH: 1.2, span: bw * 0.65, glow: WINDOW_COOL })
  addEntryDoors(root, ctx, f, { color: MED_CYAN, height: 2.5, width: 1.3 })
  addCanopy(root, ctx, f, { y: 2.95, width: 4.0, depth: 1.8, glow: MED_CYAN })
  addNeonSign(root, ctx, 'ZIEKENHUIS', MED_CYAN, f.frontX, h + 0.45, f.frontZ, frontYaw, 3.2, 0.5, seed)
  addNeonSign(root, ctx, 'SPOED', NEON_RED, f.frontX, h - 0.15, f.frontZ, frontYaw, 1.4, 0.35, seed + 1)

  const crossMat = new THREE.MeshStandardMaterial({ color: NEON_RED, emissive: NEON_RED, emissiveIntensity: 0.9 })
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 0.08), crossMat)
  crossH.position.set(f.frontX + f.fx * 0.1, 3.2, f.frontZ + f.fz * 0.1)
  crossH.rotation.y = frontYaw
  root.add(crossH)
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.2, 0.08), crossMat)
  crossV.position.copy(crossH.position)
  crossV.rotation.y = frontYaw
  root.add(crossV)
  ctx.flickerMats.push({ mat: crossMat, base: 0.9, t: seed })

  const helipad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.06, 16), matMetal(0x2a3038, 0.6, 0.4))
  helipad.position.set(f.cx, topY + 0.04, f.cz)
  root.add(helipad)
  const hMat = new THREE.MeshStandardMaterial({ color: MED_CYAN, emissive: MED_CYAN, emissiveIntensity: 0.55 })
  const helipadH = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.04), hMat)
  helipadH.position.set(f.cx, topY + 0.1, f.cz)
  root.add(helipadH)
  const helipadH2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.04), hMat)
  helipadH2.position.set(f.cx, topY + 0.1, f.cz)
  root.add(helipadH2)

  addParkingApron(root, f, { spots: 3, color: MED_CYAN })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, MED_CYAN, 0.45)
  addCollider(root, ctx, f, topY + 0.3, bw, bd)
}

// ── New metro types ──────────────────────────────────────────────────────────

export function buildBank(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const GOLD = 0xd4a84b
  const h = 4.0
  const { bw, bd, topY } = addBuildingMass(root, f, {
    h,
    color: 0x2a2e38,
    metalness: 0.45,
    upperScale: 0.85,
    upperH: 1.8,
    upperColor: 0x343844,
  })
  addLedBelt(root, ctx, f, 0.22 + h, GOLD, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.8, count: 5, winW: 1.05, winH: 2.0, span: bw * 0.78, glow: WINDOW_COOL, intensity: 0.4 })
  addEntryDoors(root, ctx, f, { color: GOLD, height: 2.6, width: 1.4 })
  addCanopy(root, ctx, f, { y: 3.1, width: 4.2, depth: 1.7, glow: GOLD })
  addNeonSign(root, ctx, 'NEON BANK', GOLD, f.frontX, h + 0.5, f.frontZ, frontYaw, 3.0, 0.5, seed)
  addNeonSign(root, ctx, 'SECURE', NEON_CYAN, f.frontX, h + 0.05, f.frontZ, frontYaw, 1.5, 0.28, seed + 1)

  // Columns
  for (const side of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 10), matMetal(0x8a9098, 0.3, 0.85))
    col.position.set(f.frontX + f.rx * side * 1.8 + f.fx * 0.55, 1.7, f.frontZ + f.rz * side * 1.8 + f.fz * 0.55)
    root.add(col)
  }
  addParkingApron(root, f, { spots: 2, color: GOLD })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, GOLD, 0.4)
  addCollider(root, ctx, f, topY, bw, bd)
}

export function buildHotel(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 5.5
  const { bw, bd, topY } = addBuildingMass(root, f, {
    h,
    color: 0x1e2430,
    metalness: 0.4,
    upperScale: 0.7,
    upperH: 2.4,
    upperColor: 0x283040,
  })
  addLedBelt(root, ctx, f, 0.22 + 2.4, NEON_CYAN, bw, bd, seed)
  addLedBelt(root, ctx, f, 0.22 + h, NEON_PINK, bw * 0.72, bd * 0.72, seed + 1)
  for (const floorY of [1.4, 3.2, 4.6]) {
    addWindowRibbon(root, ctx, f, {
      y: floorY,
      count: 5,
      winW: 0.9,
      winH: 1.1,
      span: bw * 0.75,
      glow: floorY > 3 ? WINDOW_WARM : WINDOW_COOL,
      intensity: 0.5,
    })
  }
  addEntryDoors(root, ctx, f, { color: NEON_CYAN, height: 2.5, width: 1.5 })
  addCanopy(root, ctx, f, { y: 2.9, width: 4.5, depth: 2.0, glow: NEON_CYAN })
  addNeonSign(root, ctx, 'HOTEL VOID', NEON_CYAN, f.frontX, h + 0.6, f.frontZ, frontYaw, 3.4, 0.55, seed)
  addNeonSign(root, ctx, '★★★★', NEON_YELLOW, f.frontX, h + 0.15, f.frontZ, frontYaw, 1.6, 0.3, seed + 1)
  addParkingApron(root, f, { spots: 3, color: NEON_CYAN })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_CYAN, 0.5)
  addCollider(root, ctx, f, topY, bw, bd)
}

export function buildTheater(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 4.8
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x1a1220, metalness: 0.2, rounded: true })
  addLedBelt(root, ctx, f, 0.22 + 3.0, NEON_YELLOW, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 2.0, count: 3, winW: 1.5, winH: 2.2, span: bw * 0.65, glow: NEON_YELLOW, intensity: 0.35 })
  addEntryDoors(root, ctx, f, { color: NEON_YELLOW, height: 2.6, width: 1.6 })
  addCanopy(root, ctx, f, { y: 3.1, width: 5.0, depth: 2.2, glow: NEON_YELLOW })
  addNeonSign(root, ctx, 'CINEMA', NEON_YELLOW, f.frontX, h + 0.35, f.frontZ, frontYaw, 3.2, 0.65, seed, 1.1)
  addNeonSign(root, ctx, 'NOW SHOWING', NEON_PINK, f.frontX, h - 0.25, f.frontZ, frontYaw, 2.4, 0.35, seed + 1)

  // Marquee bulbs
  const bulbMat = new THREE.MeshStandardMaterial({ color: NEON_YELLOW, emissive: NEON_YELLOW, emissiveIntensity: 0.9 })
  for (let i = 0; i < 12; i++) {
    const t = (i / 11 - 0.5) * bw * 0.85
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), bulbMat)
    bulb.position.set(f.frontX + f.rx * t + f.fx * 1.1, 3.25, f.frontZ + f.rz * t + f.fz * 1.1)
    root.add(bulb)
  }
  ctx.flickerMats.push({ mat: bulbMat, base: 0.9, t: seed })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_YELLOW, 0.55)
  addCollider(root, ctx, f, topY, bw, bd)
}

export function buildClinic(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 3.2
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x3a4850, metalness: 0.2 })
  addLedBelt(root, ctx, f, 0.22 + h - 0.1, NEON_CYAN, bw, bd, seed)
  addWindowRibbon(root, ctx, f, { y: 1.55, count: 4, winW: 1.15, winH: 1.7, span: bw * 0.72, glow: WINDOW_COOL })
  addEntryDoors(root, ctx, f, { color: NEON_CYAN })
  addCanopy(root, ctx, f, { y: 2.7, width: 3.2, glow: NEON_CYAN })
  addNeonSign(root, ctx, 'KLINIEK', NEON_CYAN, f.frontX, h + 0.3, f.frontZ, frontYaw, 2.4, 0.45, seed)
  addNeonSign(root, ctx, '+', NEON_RED, f.frontX + f.rx * 1.6, 2.2, f.frontZ + f.rz * 1.6, frontYaw, 0.55, 0.55, seed + 1)
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_CYAN, 0.35)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildArcade(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 3.5
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x1a1028, metalness: 0.3 })
  addLedBelt(root, ctx, f, 0.22 + 1.8, NEON_GREEN, bw, bd, seed)
  addLedBelt(root, ctx, f, 0.22 + 2.8, NEON_PINK, bw, bd, seed + 1)
  addWindowRibbon(root, ctx, f, { y: 1.5, count: 4, winW: 1.2, winH: 1.8, span: bw * 0.75, glow: NEON_GREEN, intensity: 0.7 })
  addEntryDoors(root, ctx, f, { color: NEON_GREEN, height: 2.3 })
  addCanopy(root, ctx, f, { y: 2.65, width: 3.5, glow: NEON_PINK })
  addNeonSign(root, ctx, 'ARCADE', NEON_GREEN, f.frontX, h + 0.35, f.frontZ, frontYaw, 2.8, 0.55, seed)
  addNeonSign(root, ctx, 'INSERT COIN', NEON_PINK, f.frontX, h - 0.15, f.frontZ, frontYaw, 2.2, 0.3, seed + 1)
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_GREEN, 0.5)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildPharmacy(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 2.8
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x2a3834 })
  addWindowRibbon(root, ctx, f, { y: 1.4, count: 4, winW: 1.15, winH: 1.6, span: bw * 0.75, glow: NEON_GREEN, intensity: 0.55 })
  addEntryDoors(root, ctx, f, { color: NEON_GREEN })
  addAwning(root, ctx, f, { y: 2.4, width: bw * 0.8, color: NEON_GREEN })
  addNeonSign(root, ctx, 'APOTHEEK', NEON_GREEN, f.frontX, h + 0.3, f.frontZ, frontYaw, 2.6, 0.45, seed)
  const crossMat = new THREE.MeshStandardMaterial({ color: NEON_GREEN, emissive: NEON_GREEN, emissiveIntensity: 0.85 })
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.06), crossMat)
  ch.position.set(f.frontX + f.rx * 2.0 + f.fx * 0.1, 2.1, f.frontZ + f.rz * 2.0 + f.fz * 0.1)
  ch.rotation.y = frontYaw
  root.add(ch)
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.06), crossMat)
  cv.position.copy(ch.position)
  cv.rotation.y = frontYaw
  root.add(cv)
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_GREEN, 0.35)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

export function buildGarage(p: LotParams) {
  const { root, ctx, cx, cz, w, d, seed, frontYaw } = p
  const f = lotFrame(cx, cz, w, d, frontYaw)
  const h = 3.6
  const { bw, bd, topY } = addBuildingMass(root, f, { h, color: 0x2a2a30, metalness: 0.5 })
  addLedBelt(root, ctx, f, 0.22 + h - 0.15, NEON_ORANGE, bw, bd, seed)
  addNeonSign(root, ctx, 'PARKEER', NEON_ORANGE, f.frontX, h + 0.3, f.frontZ, frontYaw, 2.6, 0.45, seed)
  addNeonSign(root, ctx, 'P', NEON_ORANGE, f.frontX + f.rx * bw * 0.35, 2.4, f.frontZ + f.rz * bw * 0.35, frontYaw, 0.9, 0.9, seed + 1)

  for (let i = 0; i < 2; i++) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.38, 2.5, 0.1), matMetal(0x1a1a20, 0.45, 0.6))
    const t = (i - 0.5) * bw * 0.42
    door.position.set(f.frontX + f.rx * t + f.fx * 0.06, 1.35, f.frontZ + f.rz * t + f.fz * 0.06)
    door.rotation.y = frontYaw
    root.add(door)
    // Window strip on door
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.3, 0.25), matGlass(NEON_ORANGE, 0.4))
    strip.position.set(door.position.x + f.fx * 0.06, 2.2, door.position.z + f.fz * 0.06)
    strip.rotation.y = frontYaw
    root.add(strip)
  }
  addParkingApron(root, f, { spots: 3, color: NEON_ORANGE })
  addRoofAc(root, f, topY, seed)
  addLotLight(root, f, NEON_ORANGE, 0.4)
  addCollider(root, ctx, f, h + 0.3, bw, bd)
}

// ── Parks / shrine / tower ───────────────────────────────────────────────────

export function buildParkLot(p: LotParams) {
  const { root, cx, cz, w, d, seed } = p
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.95, d * 0.95),
    new THREE.MeshStandardMaterial({ color: 0x1a2820, roughness: 0.95, metalness: 0 }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(cx, 0.005, cz)
  root.add(grass)

  for (let i = 0; i < 2 + Math.floor(r(seed) * 2); i++) {
    const ox = (r(seed + i * 3) - 0.5) * w * 0.5
    const oz = (r(seed + i * 5) - 0.5) * d * 0.5
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 6), matPaint(0x3a3028))
    trunk.position.set(cx + ox, 0.55, cz + oz)
    root.add(trunk)
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55 + r(seed + i) * 0.2, 8, 6), matPaint(0x224433))
    canopy.position.set(cx + ox, 1.4, cz + oz)
    root.add(canopy)
  }

  const benchMat = matPaint(0x3a3848)
  for (let i = 0; i < 2; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.42), benchMat)
    bench.position.set(cx + (i - 0.5) * 2.2, 0.42, cz + d * 0.25)
    root.add(bench)
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.08), benchMat)
    back.position.set(bench.position.x, 0.7, bench.position.z - 0.18)
    root.add(back)
  }

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, d * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.85 }),
  )
  path.rotation.x = -Math.PI / 2
  path.position.set(cx, 0.008, cz)
  root.add(path)
}

export function buildShrine(p: LotParams) {
  const { root, cx, cz, seed } = p
  const stone = matPaint(0x4a4848, 0.85)
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 2.2), stone)
  base.position.set(cx, 0.14, cz)
  root.add(base)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 3.2), matPaint(0x2a2830))
  floor.position.set(cx, 0.04, cz)
  root.add(floor)
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 0.14), stone)
    pillar.position.set(cx + side * 1.0, 0.95, cz)
    root.add(pillar)
  }
  const torii = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), stone)
  torii.position.set(cx, 1.85, cz)
  root.add(torii)
  const toriiTop = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.18), matPaint(0x8a2020))
  toriiTop.position.set(cx, 2.05, cz)
  root.add(toriiTop)
  if (r(seed) > 0.3) {
    const lan = new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0xff2233, emissiveIntensity: 0.75 })
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lan)
    orb.position.set(cx, 2.35, cz)
    root.add(orb)
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
  if (ctx.colliders) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(towerW, floors * 1.4, towerD),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col.position.set(cx, (floors * 1.4) / 2, cz)
    root.add(col)
    ctx.colliders.push(col)
  }
}

export function pickBuildingKind(gx: number, gz: number, seed: number): BuildingKind {
  const ring = Math.abs(gx) + Math.abs(gz)
  const roll = r(seed * 19 + gx * 3 + gz * 7)

  if (ring <= 2) {
    const inner: BuildingKind[] = [
      'ramen', 'cafe', 'bar', 'convenience', 'market', 'rowshops', 'karaoke',
      'diner', 'arcade', 'pharmacy', 'exchange', 'laundry',
    ]
    return inner[Math.floor(roll * inner.length)]
  }
  if (ring <= 3) {
    if (roll < 0.08) return 'park'
    if (roll < 0.16) return 'theater'
    if (roll < 0.26) return 'hotel'
    if (roll < 0.34) return 'bank'
    if (roll < 0.42) return 'clinic'
    if (roll < 0.52) return 'rowshops'
    if (roll < 0.6) return 'diner'
    if (roll < 0.68) return 'bar'
    if (roll < 0.76) return 'cafe'
    if (roll < 0.84) return 'garage'
    return roll > 0.92 ? 'tower' : 'convenience'
  }
  if (roll < 0.08) return 'park'
  if (roll < 0.14) return 'shrine'
  if (roll < 0.22) return 'hotel'
  if (roll < 0.3) return 'garage'
  if (roll < 0.58) return 'tower'
  if (roll < 0.72) return 'rowshops'
  if (roll < 0.82) return 'convenience'
  return r(seed + 99) > 0.5 ? 'laundry' : 'pharmacy'
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
    case 'police': return buildPolice(p)
    case 'fire': return buildFireStation(p)
    case 'hospital': return buildHospital(p)
    case 'diner': return buildDiner(p)
    case 'bank': return buildBank(p)
    case 'hotel': return buildHotel(p)
    case 'theater': return buildTheater(p)
    case 'clinic': return buildClinic(p)
    case 'arcade': return buildArcade(p)
    case 'pharmacy': return buildPharmacy(p)
    case 'garage': return buildGarage(p)
  }
}
