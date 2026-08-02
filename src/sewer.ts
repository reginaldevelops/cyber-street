import * as THREE from 'three'
import { makeNeonLabel } from './buildingKit.js'
import { DINER_SIZE, DINER_X, DINER_Z } from './plazaDiner.js'

/** Hatch just east of the diner lot. */
export const SEWER_ENTRANCE_X = DINER_X + DINER_SIZE / 2 + 2.4
export const SEWER_ENTRANCE_Z = DINER_Z + 1.5

/**
 * Separate underground pocket — far from the plaza so surface/sewer never overlap.
 * Thin long route under the city (visual narrative); coords are self-contained.
 */
export const SEWER_ORIGIN_X = 0
export const SEWER_ORIGIN_Y = 0
export const SEWER_ORIGIN_Z = 280
export const SEWER_LENGTH = 96
export const SEWER_HALF_W = 2.15
export const SEWER_HEIGHT = 3.4

/** Player spawn inside the tunnel (west end = entrance ladder). */
export const SEWER_SPAWN = new THREE.Vector3(
  SEWER_ORIGIN_X - SEWER_LENGTH / 2 + 3.5,
  0,
  SEWER_ORIGIN_Z,
)

/** Walk-into radius on the surface hatch (forgiving — curb ring is ~1.5m). */
export const SEWER_ENTER_RADIUS = 2.4

export interface SewerContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

export interface SewerSystem {
  entrance: THREE.Group
  tunnel: THREE.Group
  /** Invisible trigger mesh at hatch (world-space). */
  enterTrigger: THREE.Object3D
}

function matPaint(color: number, rough = 0.88, metal = 0.08) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}

function glow(color: number, intensity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.45,
    metalness: 0.35,
  })
}

function addSign(
  root: THREE.Group,
  ctx: SewerContext,
  text: string,
  color: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  w: number,
  h: number,
  fontPx = 40,
) {
  const tex = makeNeonLabel(text, color, 512, 128, fontPx)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: 0.75,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  root.add(mesh)
  ctx.flickerMats.push({ mat, base: 0.75, t: Math.random() * 2 })
}

/** Surface hatch / stairwell next to the Tesla diner. */
export function buildSewerEntrance(ctx: SewerContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'sewer-entrance'
  root.position.set(SEWER_ENTRANCE_X, 0, SEWER_ENTRANCE_Z)

  const concrete = matPaint(0x5a5e66, 0.9, 0.12)
  const dark = matPaint(0x1a1e24, 0.92, 0.05)
  const rust = matPaint(0x6a3a28, 0.75, 0.35)
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.85 })
  const slime = glow(0x44aa66, 0.35)

  // Raised concrete curb around hatch
  const curb = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.28, 3.6), concrete)
  curb.position.y = 0.14
  curb.receiveShadow = true
  curb.castShadow = true
  root.add(curb)

  // Dark shaft opening
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 2.2), dark)
  hole.position.y = 0.22
  root.add(hole)

  // Metal grate (slightly open / ajar)
  const grate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.5), metal)
  grate.position.set(0.15, 0.32, -0.15)
  grate.rotation.x = -0.35
  grate.castShadow = true
  root.add(grate)
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.08), rust)
    bar.position.set(0.15, 0.36, -0.7 + i * 0.28)
    bar.rotation.x = -0.35
    root.add(bar)
  }

  // Ladder down into darkness
  for (let i = 0; i < 6; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), metal)
    rung.position.set(0, -0.15 - i * 0.35, 0.85)
    root.add(rung)
  }
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.06), metal)
    rail.position.set(side * 0.35, -0.9, 0.85)
    root.add(rail)
  }

  // Warning bollards
  for (const [bx, bz] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8), rust)
    post.position.set(bx, 0.45, bz)
    root.add(post)
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 8), glow(0xffcc00, 0.4))
    stripe.position.set(bx, 0.7, bz)
    root.add(stripe)
  }

  addSign(root, ctx, 'SEWER', 0x44ff88, 0, 1.55, 1.85, 0, 2.2, 0.45, 44)
  addSign(root, ctx, 'ENTER ↓', 0xffcc00, 0, 1.1, 1.85, 0, 2.0, 0.35, 36)

  const drip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), slime)
  drip.position.set(0.4, 0.28, 0.5)
  root.add(drip)

  const light = new THREE.PointLight(0x55ff88, 0.45, 8, 2)
  light.position.set(0, 1.2, 0)
  root.add(light)

  // Trigger anchor (local origin = hatch center)
  const trigger = new THREE.Object3D()
  trigger.name = 'sewer-enter-trigger'
  trigger.position.set(0, 0.3, 0)
  root.add(trigger)

  if (ctx.colliders) {
    // Low curb collision — leave center open so player can walk in
    for (const [ox, oz, w, d] of [
      [0, -1.55, 3.4, 0.35],
      [0, 1.55, 3.4, 0.35],
      [-1.55, 0, 0.35, 2.6],
      [1.55, 0, 0.35, 2.6],
    ] as const) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.0, d),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      col.position.set(ox, 0.5, oz)
      root.add(col)
      ctx.colliders.push(col)
    }
  }

  ctx.scene.add(root)
  return root
}

/** Long thin sewer tunnel under the city. Hidden until entered. */
export function buildSewerTunnel(ctx: SewerContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'sewer-tunnel'
  root.position.set(SEWER_ORIGIN_X, SEWER_ORIGIN_Y, SEWER_ORIGIN_Z)
  root.visible = false

  const L = SEWER_LENGTH
  const W = SEWER_HALF_W * 2
  const H = SEWER_HEIGHT

  const wall = matPaint(0x2a3230, 0.92, 0.1)
  const wallDamp = matPaint(0x1e2824, 0.95, 0.08)
  const floor = matPaint(0x1a201c, 0.95, 0.05)
  const water = glow(0x226644, 0.25)
  water.transparent = true
  water.opacity = 0.55
  const brick = matPaint(0x3a342c, 0.88, 0.12)
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5a6060, roughness: 0.45, metalness: 0.7 })
  const rust = matPaint(0x7a4030, 0.7, 0.4)
  const lampMat = glow(0x88ffaa, 0.7)

  // Floor + shallow channel
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 0.35, W), floor)
  deck.position.y = -0.15
  deck.receiveShadow = true
  root.add(deck)

  const channel = new THREE.Mesh(new THREE.BoxGeometry(L - 2, 0.12, 1.1), water)
  channel.position.y = 0.06
  root.add(channel)

  // Walls
  for (const side of [-1, 1] as const) {
    const wmesh = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.4), side > 0 ? wall : wallDamp)
    wmesh.position.set(0, H / 2, side * (SEWER_HALF_W + 0.15))
    wmesh.castShadow = true
    wmesh.receiveShadow = true
    root.add(wmesh)

    // Brick banding
    for (let i = 0; i < 8; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.08, 0.35, 0.12), brick)
      band.position.set(-L / 2 + 6 + i * 11, 1.2 + (i % 2) * 0.8, side * (SEWER_HALF_W + 0.32))
      root.add(band)
    }
  }

  // Ceiling arches (segmented)
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(L, 0.35, W + 0.6), wallDamp)
  ceiling.position.y = H
  root.add(ceiling)

  // End caps
  for (const end of [-1, 1] as const) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, H + 0.4, W + 0.8), wall)
    cap.position.set(end * (L / 2 + 0.1), H / 2, 0)
    root.add(cap)
  }

  // Ladder at west entrance end
  const ladderX = -L / 2 + 2.2
  for (let i = 0; i < 10; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 0.05), pipeMat)
    rung.position.set(ladderX, 0.25 + i * 0.32, -SEWER_HALF_W + 0.35)
    root.add(rung)
  }
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 6), pipeMat)
    rail.position.set(ladderX + side * 0.38, 1.7, -SEWER_HALF_W + 0.35)
    root.add(rail)
  }
  addSign(root, ctx, 'EXIT ↑ SURFACE', 0xffcc00, ladderX, 2.6, -SEWER_HALF_W + 0.55, 0, 2.6, 0.4, 32)

  // Overhead pipes along length
  for (const pz of [-0.7, 0.7] as const) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, L - 4, 8), pipeMat)
    pipe.rotation.z = Math.PI / 2
    pipe.position.set(0, H - 0.55, pz)
    root.add(pipe)
  }
  for (let i = 0; i < 12; i++) {
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.2), rust)
    valve.position.set(-L / 2 + 8 + i * 7, H - 0.55, i % 2 ? 0.7 : -0.7)
    root.add(valve)
  }

  // Wall lamps + point lights
  for (let i = 0; i < 10; i++) {
    const lx = -L / 2 + 6 + i * 9
    const side = i % 2 ? 1 : -1
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.35), lampMat)
    lamp.position.set(lx, 2.4, side * (SEWER_HALF_W - 0.15))
    root.add(lamp)
    ctx.flickerMats.push({ mat: lampMat, base: 0.7, t: i * 0.37 })

    const pl = new THREE.PointLight(0x66ff99, 0.55, 14, 2)
    pl.position.set(lx, 2.3, side * 0.5)
    root.add(pl)
  }

  // Ambient fill for the tunnel
  const amb = new THREE.AmbientLight(0x1a3028, 0.55)
  root.add(amb)
  const hemi = new THREE.HemisphereLight(0x335544, 0x0a100c, 0.4)
  root.add(hemi)

  // Debris / crates
  for (let i = 0; i < 7; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 + (i % 3) * 0.2, 0.5, 0.55),
      i % 2 ? rust : brick,
    )
    box.position.set(-L / 2 + 12 + i * 11, 0.35, (i % 2 ? 1 : -1) * 1.2)
    box.rotation.y = i * 0.4
    box.castShadow = true
    root.add(box)
  }

  // Colliders for walls
  if (ctx.colliders) {
    for (const side of [-1, 1] as const) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(L, H, 0.5),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      col.position.set(0, H / 2, side * (SEWER_HALF_W + 0.2))
      root.add(col)
      ctx.colliders.push(col)
    }
    for (const end of [-1, 1] as const) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, H, W + 1),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      col.position.set(end * (L / 2), H / 2, 0)
      root.add(col)
      ctx.colliders.push(col)
    }
  }

  ctx.scene.add(root)
  return root
}

export function buildSewerSystem(ctx: SewerContext): SewerSystem {
  const entrance = buildSewerEntrance(ctx)
  const tunnel = buildSewerTunnel(ctx)
  const enterTrigger = entrance.getObjectByName('sewer-enter-trigger') ?? entrance
  return { entrance, tunnel, enterTrigger }
}

/** Soft clamp player inside the tunnel corridor. */
export function clampSewerPosition(pos: THREE.Vector3) {
  const halfL = SEWER_LENGTH / 2 - 1.2
  pos.x = THREE.MathUtils.clamp(pos.x, SEWER_ORIGIN_X - halfL, SEWER_ORIGIN_X + halfL)
  pos.z = THREE.MathUtils.clamp(pos.z, SEWER_ORIGIN_Z - SEWER_HALF_W + 0.45, SEWER_ORIGIN_Z + SEWER_HALF_W - 0.45)
  pos.y = 0
}
