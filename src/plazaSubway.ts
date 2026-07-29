import * as THREE from 'three'
import { makeNeonLabel } from './buildingKit.js'

const NEON_CYAN = 0x00f6ff
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622
const METRO_BLUE = 0x3388ff
const METRO_PINK = 0xff2d95

/**
 * Station behind fountain (SE), opposite Tesla diner (NW).
 * Rails run west along the plaza, loop down underground, then toward the diner.
 */
export const SUBWAY_X = 14.5
export const SUBWAY_Z = 14.5

export interface PlazaSubwayContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function matMetal(color: number, rough = 0.4, metal = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}

function matPaint(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.12 })
}

function glow(color: number, intensity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.35,
  })
}

function addSign(
  root: THREE.Group,
  ctx: PlazaSubwayContext,
  text: string,
  color: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  w: number,
  h: number,
) {
  const tex = makeNeonLabel(text, color, 512, 128, 42)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: 1.1,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  root.add(mesh)
  ctx.flickerMats.push({ mat, base: 1.1, t: Math.random() * 3 })
}

/** Twin rails + ties along world-space polyline. */
function addRails(root: THREE.Group, points: THREE.Vector3[], gauge = 1.1) {
  const railMat = matMetal(0x8a9098, 0.3, 0.92)
  const tieMat = matPaint(0x2a2018)
  const bedMat = matPaint(0x1a1a22)

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const dir = b.clone().sub(a)
    const len = dir.length()
    if (len < 0.08) continue
    dir.normalize()

    const horiz = new THREE.Vector3(dir.x, 0, dir.z)
    if (horiz.lengthSq() < 1e-6) horiz.set(1, 0, 0)
    horiz.normalize()
    const perp = new THREE.Vector3(-horiz.z, 0, horiz.x)
    const yaw = Math.atan2(horiz.x, horiz.z)
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z))

    // Ballast bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(gauge + 0.9, 0.12, len + 0.05), bedMat)
    bed.position.copy(mid)
    bed.position.y -= 0.1
    bed.rotation.y = yaw
    bed.rotation.x = -pitch
    bed.receiveShadow = true
    root.add(bed)

    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, len + 0.04), railMat)
      rail.position.copy(mid).addScaledVector(perp, side * gauge / 2)
      rail.rotation.y = yaw
      rail.rotation.x = -pitch
      rail.castShadow = true
      root.add(rail)
    }

    const tieCount = Math.max(1, Math.floor(len / 0.65))
    for (let t = 0; t < tieCount; t++) {
      const u = (t + 0.5) / tieCount
      const p = a.clone().lerp(b, u)
      const tie = new THREE.Mesh(new THREE.BoxGeometry(gauge + 0.4, 0.07, 0.2), tieMat)
      tie.position.copy(p)
      tie.position.y -= 0.05
      tie.rotation.y = yaw
      root.add(tie)
    }

    // Support pillars while elevated (y > 0.3)
    if (mid.y > 0.35 && i % 2 === 0) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, mid.y + 0.15, 0.22),
        matMetal(0x4a5058, 0.45, 0.7),
      )
      post.position.set(mid.x, (mid.y - 0.1) / 2, mid.z)
      post.castShadow = true
      root.add(post)
    }
  }
}

function buildMetroCar(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  yaw: number,
  ctx: PlazaSubwayContext,
) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw

  const bodyMat = matPaint(0x2a3448)
  const silver = matMetal(0xb0b6c0, 0.28, 0.88)
  const windowMat = glow(NEON_CYAN, 0.5)
  windowMat.transparent = true
  windowMat.opacity = 0.78

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.1, 6.8), bodyMat)
  body.position.y = 1.25
  body.castShadow = true
  g.add(body)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 6.75), silver)
  roof.position.y = 2.35
  g.add(roof)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.2, 6.82), glow(METRO_BLUE, 0.75))
  stripe.position.y = 1.85
  g.add(stripe)
  ctx.flickerMats.push({ mat: stripe.material as THREE.MeshStandardMaterial, base: 0.75, t: 1 })

  for (let i = 0; i < 4; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.8), windowMat)
    win.position.set(1.18, 1.45, -2.0 + i * 1.3)
    win.rotation.y = Math.PI / 2
    g.add(win)
    const win2 = win.clone()
    win2.position.x = -1.18
    win2.rotation.y = -Math.PI / 2
    g.add(win2)
  }

  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), windowMat)
  front.position.set(0, 1.5, -3.42)
  g.add(front)

  addSign(g, ctx, 'M', METRO_BLUE, 0, 2.05, -3.45, 0, 0.5, 0.5)

  for (const [wx, wz] of [[-0.8, -2.2], [0.8, -2.2], [-0.8, 2.2], [0.8, 2.2]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 10), matMetal(0x1a1a20))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, 0.26, wz)
    g.add(wheel)
  }

  const light = new THREE.PointLight(NEON_CYAN, 0.35, 9, 2)
  light.position.set(0, 2.0, 0)
  g.add(light)
  root.add(g)
}

/** Cool above-ground metro pavilion at the SE plaza corner. */
function buildStation(root: THREE.Group, ctx: PlazaSubwayContext) {
  const g = new THREE.Group()
  g.position.set(SUBWAY_X, 0, SUBWAY_Z)
  // Face NW toward fountain / diner
  g.rotation.y = Math.PI / 4

  const concrete = matPaint(0x3a3e48)
  const dark = matPaint(0x22262e)
  const steel = matMetal(0x7a8088)
  const glass = glow(NEON_CYAN, 0.4)
  glass.transparent = true
  glass.opacity = 0.72

  // Raised tiled plaza pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(10, 0.28, 8), dark)
  pad.position.y = 0.14
  pad.receiveShadow = true
  g.add(pad)

  // Main hall — open glass box with heavy steel roof
  const hall = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.4, 4.8), concrete)
  hall.position.set(0, 1.9, 0.4)
  hall.castShadow = true
  g.add(hall)

  // Cut glass facade (front toward fountain)
  for (let i = 0; i < 3; i++) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 0.08), glass)
    pane.position.set(-2.2 + i * 2.2, 1.6, -2.05)
    g.add(pane)
  }
  ctx.flickerMats.push({ mat: glass, base: 0.4, t: 0.5 })

  // Entrance void
  const entry = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 1 }),
  )
  entry.position.set(0, 1.35, -2.0)
  g.add(entry)

  // Wing roofs / cantilever
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.18, 6.2), steel)
  roof.position.set(0, 3.85, 0.2)
  roof.castShadow = true
  g.add(roof)

  const roofAccent = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 5.9), glow(METRO_BLUE, 0.7))
  roofAccent.position.set(0, 3.72, 0.2)
  g.add(roofAccent)
  ctx.flickerMats.push({ mat: roofAccent.material as THREE.MeshStandardMaterial, base: 0.7, t: 1.1 })

  // Side columns
  for (const side of [-1, 1] as const) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.7, 8), steel)
    col.position.set(side * 4.0, 1.95, -1.2)
    col.castShadow = true
    g.add(col)
  }

  // Escalator down into platform (visible steps)
  for (let i = 0; i < 8; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), steel)
    step.position.set(0, 0.15 + i * 0.2, -0.2 + i * 0.4)
    g.add(step)
  }

  // Big METRO blade sign
  addSign(g, ctx, 'METRO', METRO_BLUE, 0, 4.35, -2.3, 0, 4.2, 0.75)
  addSign(g, ctx, 'LINE M1', NEON_YELLOW, 0, 3.75, -2.3, 0, 2.4, 0.35)

  // Round M totem
  const totem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.2, 20), glow(METRO_BLUE, 0.9))
  totem.position.set(-3.6, 2.6, -2.3)
  totem.rotation.x = Math.PI / 2
  g.add(totem)
  addSign(g, ctx, 'M', METRO_PINK, -3.6, 2.6, -2.45, 0, 0.7, 0.7)

  // Tall pylon
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.2, 0.4), dark)
  pylon.position.set(4.5, 3.1, -2.5)
  g.add(pylon)
  addSign(g, ctx, 'M', METRO_BLUE, 4.5, 5.5, -2.75, 0, 1.0, 1.0)

  const light = new THREE.PointLight(METRO_BLUE, 0.65, 16, 2)
  light.position.set(0, 3.2, 0)
  g.add(light)

  if (ctx.colliders) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(8, 4, 5.5),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col.position.set(0, 2, 0.2)
    g.add(col)
    ctx.colliders.push(col)
  }

  root.add(g)
}

/**
 * Path matching the yellow sketch:
 * station (SE, behind fountain) → west along south edge → loop on west side diving underground → toward diner (NW).
 */
function buildTrackPath(): THREE.Vector3[] {
  return [
    // Platform at station (elevated)
    new THREE.Vector3(14.5, 0.85, 12.5),
    new THREE.Vector3(12.0, 0.85, 14.5),
    // West along SE→SW plaza edge (screen-left from station)
    new THREE.Vector3(8.0, 0.9, 16.5),
    new THREE.Vector3(3.0, 0.95, 17.2),
    new THREE.Vector3(-2.0, 1.0, 17.0),
    new THREE.Vector3(-7.0, 1.0, 15.5),
    new THREE.Vector3(-11.5, 0.9, 12.5),
    // Left-side loop — start descending
    new THREE.Vector3(-15.0, 0.55, 8.0),
    new THREE.Vector3(-16.5, 0.15, 3.0),
    new THREE.Vector3(-16.8, -0.6, -2.0),
    new THREE.Vector3(-15.5, -1.5, -6.5),
    new THREE.Vector3(-13.0, -2.4, -9.5),
    // Underground toward diner (NW)
    new THREE.Vector3(-10.5, -3.3, -11.5),
    new THREE.Vector3(-7.5, -4.0, -13.0),
    new THREE.Vector3(-4.0, -4.6, -14.0),
    new THREE.Vector3(0.0, -5.0, -14.5),
    new THREE.Vector3(4.0, -5.2, -14.0),
  ]
}

function addDescentTrench(root: THREE.Group, points: THREE.Vector3[]) {
  const wallMat = matPaint(0x2a2e36)
  const dark = matPaint(0x12141a)

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.y > 0.2 && b.y > 0.2) continue

    const mid = a.clone().add(b).multiplyScalar(0.5)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const horiz = new THREE.Vector3(dir.x, 0, dir.z).normalize()
    const yaw = Math.atan2(horiz.x, horiz.z)
    const depth = Math.max(0.8, -mid.y + 0.6)
    const wallH = depth + 0.8

    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, len + 0.1), dark)
    bed.position.set(mid.x, mid.y - 0.45, mid.z)
    bed.rotation.y = yaw
    root.add(bed)

    for (const side of [-1, 1] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, len + 0.08), wallMat)
      const perp = new THREE.Vector3(-horiz.z, 0, horiz.x)
      wall.position.set(mid.x + perp.x * 1.9, mid.y + wallH * 0.25, mid.z + perp.z * 1.9)
      wall.rotation.y = yaw
      root.add(wall)
    }
  }
}

function addTunnelPortal(root: THREE.Group, ctx: PlazaSubwayContext, at: THREE.Vector3, toward: THREE.Vector3) {
  const dir = toward.clone().sub(at)
  dir.y = 0
  dir.normalize()
  const yaw = Math.atan2(dir.x, dir.z)

  const g = new THREE.Group()
  g.position.copy(at)
  g.rotation.y = yaw

  const dark = matPaint(0x1a1e26)
  const arch = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.8, 1.4), dark)
  arch.position.y = 0.4
  g.add(arch)

  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 2.5, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x020208, roughness: 1 }),
  )
  hole.position.y = 0.2
  g.add(hole)

  const rim = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.5), glow(METRO_BLUE, 0.8))
  rim.position.y = 2.35
  g.add(rim)
  ctx.flickerMats.push({ mat: rim.material as THREE.MeshStandardMaterial, base: 0.8, t: 0.7 })

  addSign(g, ctx, 'UNDERGROUND', NEON_ORANGE, 0, 2.65, -0.75, 0, 3.2, 0.4)

  // Tunnel tube continuing underground
  const tube = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 14), matPaint(0x0a0c10))
  tube.position.set(0, 0.1, 8)
  g.add(tube)

  const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 12), glow(NEON_CYAN, 0.55))
  glowStrip.position.set(0, 1.2, 8)
  g.add(glowStrip)

  const light = new THREE.PointLight(METRO_BLUE, 0.55, 18, 2)
  light.position.set(0, 1.5, 3)
  g.add(light)

  root.add(g)
}

/**
 * Metro: SE station behind fountain → west loop diving underground → toward diner.
 */
export function buildPlazaSubway(ctx: PlazaSubwayContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-subway'

  buildStation(root, ctx)

  const path = buildTrackPath()
  addRails(root, path, 1.15)
  addDescentTrench(root, path)

  // Portal where the loop goes underground (west side)
  const portalAt = new THREE.Vector3(-16.2, -0.9, 0.5)
  const portalToward = new THREE.Vector3(-15.0, -1.5, -5.0)
  addTunnelPortal(root, ctx, portalAt, portalToward)

  // Train waiting at station platform
  buildMetroCar(root, 13.2, 0.85, 13.2, Math.PI / 4, ctx)

  // Train entering the west loop / tunnel
  buildMetroCar(root, -15.8, -0.35, 4.5, Math.PI * 0.95, ctx)

  // Grated vent covers along underground stretch near diner (surface clues)
  const grateMat = matMetal(0x3a4050, 0.45, 0.7)
  for (const [gx, gz] of [[-9, -12], [-6, -13], [-3, -13.5], [0, -14]] as const) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.2), grateMat)
    grate.position.set(gx, 0.04, gz)
    root.add(grate)
    const glowLine = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.08), glow(NEON_CYAN, 0.45))
    glowLine.position.set(gx, 0.09, gz)
    root.add(glowLine)
  }

  ctx.scene.add(root)
  return root
}
