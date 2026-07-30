import * as THREE from 'three'
import { ws } from './worldConfig.js'
import { FOUNTAIN_X, FOUNTAIN_Z } from './plazaFountain.js'
import { SUBWAY_X, SUBWAY_Z } from './plazaSubway.js'
import { CITY_PITCH, CITY_ROAD, CITY_GRID_SPAN } from './cityGrid.js'
import { PLAZA_EXCLUDE } from './worldConfig.js'

// ── Palette (matches game.ts neon constants) ────────────────────────────────
export const NEON_CYAN = 0x00f6ff
export const NEON_GREEN = 0x22ff66
export const TRUCK_RED = 0xcc2222
export const CONTAINER_BLUE = 0x2a4858
export const CONTAINER_ORANGE = 0xe85d04
export const CONTAINER_RED = 0x8a3030

export type DroidPose = 'idle' | 'typing' | 'walking' | 'sitting'

export interface DroidNPC {
  root: THREE.Group
  pose: DroidPose
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  walkPhase: number
  /** Walking droids follow a closed loop of [x,z] waypoints (local offsets from spawn). */
  path?: THREE.Vector2[]
  pathT: number
}

export interface HoloPanel {
  group: THREE.Group
  baseY: number
  phase: number
  borderMat: THREE.MeshStandardMaterial
  /** When set, panel keeps this yaw instead of spinning. */
  fixedYaw?: number
}

export interface SteamVent {
  grate: THREE.Mesh
  steam: THREE.Points
  vels: Float32Array
  phase: number
}

export interface AmbienceCritter {
  root: THREE.Group
  kind: 'rat' | 'bird'
  phase: number
  home: THREE.Vector3
}

export interface AmbienceState {
  droids: DroidNPC[]
  holoPanels: HoloPanel[]
  steamVents: SteamVent[]
  critters: AmbienceCritter[]
}

// ── Shared materials & textures (lazy singletons) ───────────────────────────
let greenGridTex: THREE.CanvasTexture | null = null
let holoScanTex: THREE.CanvasTexture | null = null

let chassisMat: THREE.MeshStandardMaterial
let panelMat: THREE.MeshStandardMaterial
let jointMat: THREE.MeshStandardMaterial
let darkMat: THREE.MeshStandardMaterial
let metalMat: THREE.MeshStandardMaterial
let woodMat: THREE.MeshStandardMaterial

function ensureSharedMaterials() {
  if (chassisMat) return
  chassisMat = new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.45, metalness: 0.72 })
  panelMat = new THREE.MeshStandardMaterial({ color: 0x3a3844, roughness: 0.38, metalness: 0.8 })
  jointMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.3, metalness: 0.9 })
  darkMat = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.55, metalness: 0.65 })
  metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.35, metalness: 0.85 })
  woodMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.82, metalness: 0.08 })
}

/** Procedural green emissive grid for droid face displays — KEY reference visual. */
export function makeGreenGridTexture(): THREE.CanvasTexture {
  if (greenGridTex) return greenGridTex
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#030806'
  ctx.fillRect(0, 0, size, size)

  const cell = 16
  ctx.strokeStyle = '#22ff66'
  ctx.lineWidth = 1.5
  ctx.shadowColor = '#44ff88'
  ctx.shadowBlur = 6
  for (let i = 0; i <= size; i += cell) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(size, i)
    ctx.stroke()
  }

  // Brighter cross at center — "active sensor"
  ctx.fillStyle = '#66ffaa'
  ctx.shadowBlur = 10
  ctx.fillRect(size / 2 - 2, size / 2 - 2, 4, 4)

  greenGridTex = new THREE.CanvasTexture(c)
  greenGridTex.needsUpdate = true
  return greenGridTex
}

function makeHoloScanTexture(): THREE.CanvasTexture {
  if (holoScanTex) return holoScanTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(0, 20, 30, 0.15)'
  ctx.fillRect(0, 0, 256, 160)
  ctx.strokeStyle = 'rgba(0, 246, 255, 0.35)'
  ctx.lineWidth = 1
  for (let y = 8; y < 160; y += 10) {
    ctx.beginPath()
    ctx.moveTo(12, y)
    ctx.lineTo(244, y)
    ctx.stroke()
  }
  for (let x = 20; x < 256; x += 28) {
    ctx.fillStyle = 'rgba(0, 246, 255, 0.12)'
    ctx.fillRect(x, 24, 18, 6)
  }
  holoScanTex = new THREE.CanvasTexture(c)
  holoScanTex.needsUpdate = true
  return holoScanTex
}

// ── 1 & 2. Droid NPC (~1.8 m, ~14 meshes) ──────────────────────────────────
//
// Body hierarchy:
//   root (y=0)
//   ├ pelvis      Box 0.34×0.18×0.22  @ y=0.92
//   ├ torso       Box 0.40×0.46×0.24  @ y=1.22
//   ├ chestPlate  Box 0.30×0.20×0.05  @ y=1.26, z=+0.12
//   ├ neck        Cyl r=0.06 h=0.08    @ y=1.48
//   ├ headShell   Box 0.40×0.34×0.28  @ y=1.68  ← large boxy head
//   ├ faceBezel   Box 0.36×0.28×0.04  @ y=1.68, z=+0.14  (dark frame)
//   ├ faceDisplay Plane 0.32×0.22     @ y=1.68, z=+0.16  (green grid emissive)
//   ├ pauldronL/R Box 0.12×0.10×0.14
//   ├ armL/R Group: upper Box 0.10×0.28 + fore Box 0.08×0.24
//   └ legL/R Group: thigh Box 0.12×0.32 + shin Box 0.10×0.30 + foot Box 0.12×0.06×0.20
//
// Pose variants:
//   idle    — arms hang, slight sway
//   typing  — armR forward/down toward holo panel, armL raised
//   walking — leg swing driven in updateAmbience(); optional patrol path

export function buildDroidNPC(x: number, z: number, pose: DroidPose = 'idle', local = false): DroidNPC {
  ensureSharedMaterials()
  const gridTex = makeGreenGridTexture()
  const faceMat = new THREE.MeshStandardMaterial({
    map: gridTex,
    emissive: NEON_GREEN,
    emissiveMap: gridTex,
    emissiveIntensity: 2.6,
    roughness: 0.25,
    metalness: 0.4,
  })

  const root = new THREE.Group()
  if (!local) root.position.set(x, 0, z)

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.22), chassisMat)
  pelvis.position.y = 0.92
  pelvis.castShadow = true

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.24), panelMat)
  torso.position.y = 1.22
  torso.castShadow = true

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), chassisMat)
  chestPlate.position.set(0, 1.26, 0.12)

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), jointMat)
  neck.position.y = 1.48

  const headShell = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.28), panelMat)
  headShell.position.y = 1.68
  headShell.castShadow = true

  const faceBezel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.04), darkMat)
  faceBezel.position.set(0, 1.68, 0.14)

  const faceDisplay = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.22), faceMat)
  faceDisplay.position.set(0, 1.68, 0.16)

  const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), panelMat)
  pauldronL.position.set(-0.28, 1.38, 0)
  const pauldronR = pauldronL.clone()
  pauldronR.position.x = 0.28

  const buildLimbArm = (side: number) => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.28, 1.32, 0)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), chassisMat)
    upper.position.y = -0.14
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), panelMat)
    fore.position.y = -0.38
    arm.add(upper, fore)
    return arm
  }

  const buildLimbLeg = (side: number) => {
    const leg = new THREE.Group()
    leg.position.set(side * 0.11, 0.92, 0)
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), chassisMat)
    thigh.position.y = -0.16
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), panelMat)
    shin.position.y = -0.48
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.2), darkMat)
    foot.position.set(0, -0.64, 0.04)
    leg.add(thigh, shin, foot)
    return leg
  }

  const armL = buildLimbArm(-1)
  const armR = buildLimbArm(1)
  const legL = buildLimbLeg(-1)
  const legR = buildLimbLeg(1)

  // Pose setup
  if (pose === 'typing') {
    armR.rotation.x = -1.05
    armR.rotation.z = -0.15
    armR.position.set(0.22, 1.28, 0.18)
    armL.rotation.x = -0.55
    armL.rotation.z = 0.2
    root.rotation.y = Math.PI * 0.15
  } else if (pose === 'walking') {
    root.rotation.y = Math.random() * Math.PI * 2
  }

  root.add(
    pelvis, torso, chestPlate, neck, headShell, faceBezel, faceDisplay,
    pauldronL, pauldronR, armL, armR, legL, legR,
  )

  const path =
    pose === 'walking'
      ? [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(4, 0),
          new THREE.Vector2(4, 3),
          new THREE.Vector2(-2, 3),
          new THREE.Vector2(-2, 0),
        ]
      : undefined

  return {
    root,
    pose,
    legL,
    legR,
    armL,
    armR,
    walkPhase: Math.random() * 10,
    path,
    pathT: Math.random(),
  }
}

// ── 3. Holographic panel (5 meshes: fill + 4 border strips) ─────────────────

export function buildHoloPanel(x: number, y: number, z: number): HoloPanel {
  ensureSharedMaterials()
  const group = new THREE.Group()
  group.position.set(x, y, z)

  const fillMat = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.55,
    map: makeHoloScanTexture(),
    transparent: true,
    opacity: 0.42,
    roughness: 0.15,
    metalness: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.62), fillMat)
  group.add(fill)

  const borderMat = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
    metalness: 0.5,
  })
  const bw = 0.04
  const borders = [
    [0, 0.33, 0.95, bw],
    [0, -0.33, 0.95, bw],
    [-0.475, 0, bw, 0.62],
    [0.475, 0, bw, 0.62],
  ] as const
  for (const [bx, by, w, h] of borders) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, h), borderMat)
    strip.position.set(bx, by, 0.002)
    group.add(strip)
  }

  return { group, baseY: y, phase: Math.random() * Math.PI * 2, borderMat }
}

// ── 4. Delivery truck + flatbed cart + shipping container ─────────────────

export function buildDeliveryTruck(x: number, z: number, yaw = 0): THREE.Group {
  ensureSharedMaterials()
  const truck = new THREE.Group()
  truck.position.set(x, 0, z)
  truck.rotation.y = yaw

  const cabMat = new THREE.MeshStandardMaterial({
    color: TRUCK_RED,
    roughness: 0.55,
    metalness: 0.35,
  })
  const cargoMat = cabMat.clone()
  cargoMat.color.setHex(0xaa1a1a)

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.35, 1.5), cabMat)
  cab.position.set(-0.9, 0.78, 0)
  cab.castShadow = true
  truck.add(cab)

  const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.15, 1.7), cargoMat)
  cargo.position.set(1.15, 0.68, 0)
  cargo.castShadow = true
  truck.add(cargo)

  const windshield = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.55),
    new THREE.MeshStandardMaterial({
      color: NEON_CYAN,
      emissive: NEON_CYAN,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      metalness: 0.6,
    }),
  )
  windshield.position.set(-0.15, 1.05, 0.76)
  windshield.rotation.y = Math.PI / 2
  truck.add(windshield)

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10)
  const wheelMat = darkMat
  const wheelSpots: [number, number][] = [
    [-1.3, 0.85], [-1.3, -0.85], [0.4, 0.9], [0.4, -0.9], [2.0, 0.9], [2.0, -0.9],
  ]
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, 0.28, wz)
    truck.add(wheel)
  }

  return truck
}

export function buildShippingContainer(
  x: number,
  y: number,
  z: number,
  color: number = CONTAINER_BLUE,
): THREE.Group {
  ensureSharedMaterials()
  const group = new THREE.Group()
  group.position.set(x, y, z)

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
    metalness: 0.45,
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.2), bodyMat)
  body.position.y = 0.6
  body.castShadow = true
  group.add(body)

  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xeeddcc,
    roughness: 0.7,
    metalness: 0.2,
  })
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.1, 2.22), stripeMat)
  stripe.position.y = 0.85
  group.add(stripe)

  return group
}

export function buildFlatbedCart(x: number, z: number, containerColor?: number): THREE.Group {
  ensureSharedMaterials()
  const cart = new THREE.Group()
  cart.position.set(x, 0, z)

  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 1.6), metalMat)
  bed.position.y = 0.55
  bed.castShadow = true
  cart.add(bed)

  const railMat = chassisMat
  for (const side of [-0.75, 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.06), railMat)
    rail.position.set(0, 0.68, side)
    cart.add(rail)
  }

  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 8)
  for (const [wx, wz] of [
    [-1.0, 0.65],
    [-1.0, -0.65],
    [1.0, 0.65],
    [1.0, -0.65],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, 0.22, wz)
    cart.add(wheel)
  }

  if (containerColor !== undefined) {
    const container = buildShippingContainer(0, 0.62, 0, containerColor)
    cart.add(container)
  }

  return cart
}

export function buildIndustrialCrate(x: number, y: number, z: number, size = 0.55): THREE.Group {
  ensureSharedMaterials()
  const group = new THREE.Group()
  group.position.set(x, y, z)
  const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), woodMat)
  crate.position.y = size / 2
  crate.castShadow = true
  group.add(crate)
  const band = new THREE.Mesh(new THREE.BoxGeometry(size + 0.02, 0.06, size + 0.02), metalMat)
  band.position.y = size * 0.65
  group.add(band)
  return group
}

// ── 5. Ambient critters (2–3 meshes each) ───────────────────────────────────

export function buildCyberRat(x: number, z: number): AmbienceCritter {
  ensureSharedMaterials()
  const root = new THREE.Group()
  root.position.set(x, 0, z)

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), darkMat)
  body.position.y = 0.08
  root.add(body)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), chassisMat)
  head.position.set(0, 0.1, 0.18)
  root.add(head)

  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.03, 0.02),
    new THREE.MeshStandardMaterial({ color: NEON_GREEN, emissive: NEON_GREEN, emissiveIntensity: 2 }),
  )
  eye.position.set(0.04, 0.12, 0.24)
  root.add(eye)

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 0.28, 4), jointMat)
  tail.rotation.x = Math.PI / 2.8
  tail.position.set(0, 0.08, -0.22)
  root.add(tail)

  return { root, kind: 'rat', phase: Math.random() * 10, home: new THREE.Vector3(x, 0, z) }
}

export function buildDroneBird(x: number, y: number, z: number): AmbienceCritter {
  ensureSharedMaterials()
  const root = new THREE.Group()
  root.position.set(x, y, z)

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.28), panelMat)
  root.add(body)

  const wingMat = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.1), wingMat)
  wingL.position.set(-0.22, 0, 0)
  wingL.rotation.y = 0.3
  const wingR = wingL.clone()
  wingR.position.x = 0.22
  wingR.rotation.y = -0.3
  root.add(wingL, wingR)

  return { root, kind: 'bird', phase: Math.random() * 10, home: new THREE.Vector3(x, y, z) }
}

// ── 6. Steam vent (grate mesh + rising particles) ───────────────────────────

export function buildSteamVent(x: number, y: number, z: number): SteamVent {
  ensureSharedMaterials()
  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.04, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x3a3844, roughness: 0.5, metalness: 0.75 }),
  )
  grate.position.set(x, y, z)
  grate.castShadow = true

  const count = 24
  const positions = new Float32Array(count * 3)
  const vels = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = x + THREE.MathUtils.randFloatSpread(0.35)
    positions[i * 3 + 1] = y + 0.05
    positions[i * 3 + 2] = z + THREE.MathUtils.randFloatSpread(0.35)
    vels[i * 3] = THREE.MathUtils.randFloatSpread(0.15)
    vels[i * 3 + 1] = THREE.MathUtils.randFloat(0.6, 1.4)
    vels[i * 3 + 2] = THREE.MathUtils.randFloatSpread(0.15)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const steam = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xaaccdd,
      size: 0.12,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  )

  return { grate, steam, vels, phase: Math.random() * 4 }
}

// ── 7. Wall-mounted machinery cluster (~6 meshes) ───────────────────────────

export function buildWallMachinery(
  x: number,
  y: number,
  z: number,
  faceYaw: number,
): THREE.Group {
  ensureSharedMaterials()
  const cluster = new THREE.Group()
  cluster.position.set(x, y, z)
  cluster.rotation.y = faceYaw

  const mainPanel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.18), panelMat)
  mainPanel.castShadow = true
  cluster.add(mainPanel)

  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), metalMat)
  pipe.rotation.z = Math.PI / 2
  pipe.position.set(0.5, -0.35, 0.12)
  cluster.add(pipe)

  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), darkMat)
  gauge.rotation.x = Math.PI / 2
  gauge.position.set(-0.35, 0.15, 0.12)
  cluster.add(gauge)

  const ledColors = [NEON_CYAN, NEON_GREEN, 0xff6622]
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.04, 0.03),
      new THREE.MeshStandardMaterial({
        color: ledColors[i],
        emissive: ledColors[i],
        emissiveIntensity: 1.6,
      }),
    )
    led.position.set(-0.45 + i * 0.22, -0.28, 0.11)
    led.userData.blink = i * 0.7
    cluster.add(led)
  }

  const ventSlot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.04), darkMat)
  ventSlot.position.set(0.1, 0.38, 0.11)
  cluster.add(ventSlot)

  return cluster
}

// ── 8 & 9. populateSceneAmbience — 18 prop placements across plaza ────────────

function seatDroidOnBench(droid: DroidNPC, x: number, z: number, rotY: number) {
  droid.root.position.set(x, -0.38, z)
  droid.root.rotation.y = rotY
  droid.pose = 'sitting'
  droid.legL.rotation.x = -1.15
  droid.legR.rotation.x = -1.15
  droid.armL.rotation.x = -0.35
  droid.armR.rotation.x = -0.2
  droid.armL.rotation.z = 0.15
  droid.armR.rotation.z = -0.1
}

/** NPCs hanging at the plaza fountain opposite the diner. */
function spawnFountainLoiterers(scene: THREE.Scene, droids: DroidNPC[]) {
  const fx = FOUNTAIN_X
  const fz = FOUNTAIN_Z
  const benchR = 3.85

  const sitters = [
    { a: 0.15, offset: -0.35 },
    { a: Math.PI * 0.85, offset: 0.25 },
    { a: Math.PI * 1.7, offset: -0.15 },
  ]
  for (const s of sitters) {
    const bx = fx + Math.cos(s.a) * benchR
    const bz = fz + Math.sin(s.a) * benchR
    const rotY = Math.atan2(-(bx - fx), -(bz - fz))
    const tx = Math.cos(rotY + Math.PI / 2) * s.offset
    const tz = Math.sin(rotY + Math.PI / 2) * s.offset
    const droid = buildDroidNPC(0, 0, 'idle')
    seatDroidOnBench(droid, bx + tx, bz + tz, rotY)
    droids.push(droid)
    scene.add(droid.root)
  }

  const chat1 = buildDroidNPC(fx + 4.2, fz + 1.2, 'idle')
  chat1.root.rotation.y = -0.8
  droids.push(chat1)
  scene.add(chat1.root)

  const chat2 = buildDroidNPC(fx + 4.6, fz + 2.0, 'idle')
  chat2.root.rotation.y = 2.4
  chat2.armR.rotation.x = -0.6
  droids.push(chat2)
  scene.add(chat2.root)

  const leaner = buildDroidNPC(fx - 4.4, fz - 1.5, 'idle')
  leaner.root.rotation.y = 0.9
  leaner.armL.rotation.x = -0.9
  leaner.armL.rotation.z = 0.35
  droids.push(leaner)
  scene.add(leaner.root)

  const walker = buildDroidNPC(fx + 4.5, fz, 'walking')
  walker.root.userData.spawn = new THREE.Vector2(fx, fz)
  walker.path = [
    new THREE.Vector2(4.6, 0),
    new THREE.Vector2(3.2, 3.4),
    new THREE.Vector2(-1.5, 4.5),
    new THREE.Vector2(-4.6, 1.0),
    new THREE.Vector2(-3.4, -3.2),
    new THREE.Vector2(1.2, -4.5),
    new THREE.Vector2(4.6, 0),
  ]
  droids.push(walker)
  scene.add(walker.root)
}

/** Street NPCs walking sidewalk loops around city blocks (not on roads). */
function spawnCityStreetLife(scene: THREE.Scene, droids: DroidNPC[]) {
  const sidewalkInset = CITY_ROAD / 2 + 1.0
  const routes: { cx: number; cz: number; half: number }[] = []

  for (let gx = -CITY_GRID_SPAN; gx < CITY_GRID_SPAN; gx++) {
    for (let gz = -CITY_GRID_SPAN; gz < CITY_GRID_SPAN; gz++) {
      const cx = (gx + 0.5) * CITY_PITCH
      const cz = (gz + 0.5) * CITY_PITCH
      if (Math.abs(cx) < PLAZA_EXCLUDE && Math.abs(cz) < PLAZA_EXCLUDE) continue
      // Sparse sampling — every other block-ish
      if ((gx + gz * 3 + 10) % 5 !== 0) continue
      const half = CITY_PITCH / 2 - sidewalkInset
      routes.push({ cx, cz, half })
    }
  }

  let placed = 0
  for (const route of routes) {
    if (placed >= 10) break
    const walker = buildDroidNPC(route.cx + route.half, route.cz, 'walking')
    walker.root.userData.spawn = new THREE.Vector2(route.cx, route.cz)
    const h = route.half
    walker.path = [
      new THREE.Vector2(h, h * 0.6),
      new THREE.Vector2(h * 0.6, -h),
      new THREE.Vector2(-h, -h * 0.5),
      new THREE.Vector2(-h * 0.5, h),
      new THREE.Vector2(h, h * 0.6),
    ]
    droids.push(walker)
    scene.add(walker.root)
    placed++

    // Idle loiterer near block front
    if (placed < 10 && (placed % 2 === 0)) {
      const idle = buildDroidNPC(route.cx + h * 0.3, route.cz + h * 0.85, 'idle')
      idle.root.rotation.y = Math.PI + (placed * 0.7)
      droids.push(idle)
      scene.add(idle.root)
      placed++
    }
  }
}

/** Commuters hanging at the metro station on the south plaza avenue. */
function spawnSubwayLoiterers(scene: THREE.Scene, droids: DroidNPC[]) {
  const sx = SUBWAY_X
  const sz = SUBWAY_Z - 3.5
  const face = Math.PI // face south toward the tracks

  const idle1 = buildDroidNPC(sx - 2.8, sz - 0.4, 'idle')
  idle1.root.rotation.y = face
  droids.push(idle1)
  scene.add(idle1.root)

  const idle2 = buildDroidNPC(sx + 1.2, sz - 0.2, 'idle')
  idle2.root.rotation.y = face + 0.4
  idle2.armR.rotation.x = -0.55
  droids.push(idle2)
  scene.add(idle2.root)

  // Walker along the platform / approach
  const walker = buildDroidNPC(sx - 1, sz, 'walking')
  walker.root.userData.spawn = new THREE.Vector2(sx, sz)
  walker.path = [
    new THREE.Vector2(-4, 0),
    new THREE.Vector2(-1, 0.5),
    new THREE.Vector2(3, 0),
    new THREE.Vector2(1, -0.4),
    new THREE.Vector2(-2, 0),
  ]
  droids.push(walker)
  scene.add(walker.root)
}

export function populateSceneAmbience(
  scene: THREE.Scene,
  _flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[],
): AmbienceState {
  ensureSharedMaterials()
  const state: AmbienceState = { droids: [], holoPanels: [], steamVents: [], critters: [] }

  const marketDroid = buildDroidNPC(ws(2), ws(3), 'idle')
  marketDroid.root.rotation.y = 0.8
  state.droids.push(marketDroid)
  scene.add(marketDroid.root)

  spawnFountainLoiterers(scene, state.droids)
  spawnSubwayLoiterers(scene, state.droids)
  spawnCityStreetLife(scene, state.droids)

  const vent = buildSteamVent(ws(6), 0.02, -ws(6))
  state.steamVents.push(vent)
  scene.add(vent.grate, vent.steam)

  const vent2 = buildSteamVent(-ws(18), 0.02, ws(14))
  state.steamVents.push(vent2)
  scene.add(vent2.grate, vent2.steam)

  return state
}

// ── Animation tick (call from game loop) ────────────────────────────────────

export function updateAmbience(state: AmbienceState, dt: number, elapsed: number) {
  // Holo panel bob + gentle yaw
  for (const h of state.holoPanels) {
    h.group.position.y = h.baseY + Math.sin(elapsed * 1.2 + h.phase) * 0.08
    if (h.fixedYaw !== undefined) {
      h.group.rotation.y = h.fixedYaw
    } else {
      h.group.rotation.y += dt * 0.15
    }
  }

  // Droid idle sway / walk cycle / patrol
  for (const d of state.droids) {
    if (d.pose === 'sitting') {
      d.armL.rotation.z = 0.15 + Math.sin(elapsed * 0.9 + d.walkPhase) * 0.03
      d.armR.rotation.z = -0.1 - Math.sin(elapsed * 0.9 + d.walkPhase) * 0.03
    } else if (d.pose === 'idle') {
      d.armL.rotation.z = Math.sin(elapsed * 1.1 + d.walkPhase) * 0.04
      d.armR.rotation.z = -Math.sin(elapsed * 1.1 + d.walkPhase) * 0.04
      d.root.position.y = Math.sin(elapsed * 2 + d.walkPhase) * 0.015
    } else if (d.pose === 'typing') {
      d.armR.rotation.x = -1.05 + Math.sin(elapsed * 3.5) * 0.06
    } else if (d.pose === 'walking' && d.path) {
      d.pathT = (d.pathT + dt * 0.08) % 1
      const segCount = d.path.length
      const f = d.pathT * segCount
      const i = Math.floor(f) % segCount
      const t = f - i
      const a = d.path[i]
      const b = d.path[(i + 1) % segCount]
      const lx = THREE.MathUtils.lerp(a.x, b.x, t)
      const lz = THREE.MathUtils.lerp(a.y, b.y, t)
      const spawn = d.root.userData.spawn as THREE.Vector2 | undefined
      if (spawn) {
        d.root.position.x = spawn.x + lx
        d.root.position.z = spawn.y + lz
      }
      const dx = b.x - a.x
      const dz = b.y - a.y
      if (dx * dx + dz * dz > 0.001) {
        d.root.rotation.y = dampAngle(d.root.rotation.y, Math.atan2(dx, dz), 10, dt)
      }
      d.walkPhase += dt * 7
      const swing = Math.sin(d.walkPhase) * 0.38
      d.legL.rotation.x = swing
      d.legR.rotation.x = -swing
      d.root.position.y = Math.abs(Math.sin(d.walkPhase * 2)) * 0.03
    }
  }

  // Steam particles
  for (const v of state.steamVents) {
    const pos = v.steam.geometry.getAttribute('position') as THREE.BufferAttribute
    const ox = v.grate.position.x
    const oy = v.grate.position.y
    const oz = v.grate.position.z
    for (let i = 0; i < pos.count; i++) {
      let py = pos.getY(i) + v.vels[i * 3 + 1] * dt
      if (py > oy + 2.2) {
        py = oy + 0.05
        pos.setX(i, ox + THREE.MathUtils.randFloatSpread(0.35))
        pos.setZ(i, oz + THREE.MathUtils.randFloatSpread(0.35))
      } else {
        pos.setX(i, pos.getX(i) + v.vels[i * 3] * dt)
        pos.setZ(i, pos.getZ(i) + v.vels[i * 3 + 2] * dt)
      }
      pos.setY(i, py)
    }
    pos.needsUpdate = true
    ;(v.steam.material as THREE.PointsMaterial).opacity =
      0.28 + Math.sin(elapsed * 2 + v.phase) * 0.08
  }

  // Critters
  for (const c of state.critters) {
    if (c.kind === 'rat') {
      const r = 0.9
      c.root.position.x = c.home.x + Math.cos(elapsed * 0.35 + c.phase) * r
      c.root.position.z = c.home.z + Math.sin(elapsed * 0.35 + c.phase) * r
      c.root.rotation.y = elapsed * 0.35 + c.phase
    } else {
      c.root.position.x = c.home.x + Math.sin(elapsed * 0.5 + c.phase) * 3
      c.root.position.z = c.home.z + Math.cos(elapsed * 0.35 + c.phase) * 2
      c.root.position.y = c.home.y + Math.sin(elapsed * 1.8 + c.phase) * 0.35
      const wingL = c.root.children[1]
      const wingR = c.root.children[2]
      if (wingL && wingR) {
        wingL.rotation.z = Math.sin(elapsed * 12) * 0.35
        wingR.rotation.z = -Math.sin(elapsed * 12) * 0.35
      }
    }
  }
}

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}
