import * as THREE from 'three'
import { makeNeonLabel } from './buildingKit.js'

const NEON_CYAN = 0x00f6ff
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622
const METRO_BLUE = 0x4488ff
const METRO_PINK = 0xff2d95

/**
 * Station behind fountain (SE), opposite Tesla diner (NW).
 * Rails run west, loop underground, then toward the diner.
 */
export const SUBWAY_X = 14.5
export const SUBWAY_Z = 14.5

export interface PlazaSubwayContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function matMetal(color: number, rough = 0.35, metal = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}

function matPaint(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.14 })
}

function glow(color: number, intensity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.4,
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
  fontPx = 48,
) {
  const tex = makeNeonLabel(text, color, 512, 128, fontPx)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: 1.15,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  root.add(mesh)
  ctx.flickerMats.push({ mat, base: 1.15, t: Math.random() * 3 })
  return mesh
}

/** Twin rails + ties along world-space polyline. */
function addRails(root: THREE.Group, points: THREE.Vector3[], gauge = 1.1) {
  const railMat = matMetal(0x9aa0a8, 0.28, 0.94)
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

    const bed = new THREE.Mesh(new THREE.BoxGeometry(gauge + 1.0, 0.14, len + 0.05), bedMat)
    bed.position.copy(mid)
    bed.position.y -= 0.12
    bed.rotation.y = yaw
    bed.rotation.x = -pitch
    bed.receiveShadow = true
    root.add(bed)

    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len + 0.04), railMat)
      rail.position.copy(mid).addScaledVector(perp, (side * gauge) / 2)
      rail.rotation.y = yaw
      rail.rotation.x = -pitch
      rail.castShadow = true
      root.add(rail)
    }

    const tieCount = Math.max(1, Math.floor(len / 0.6))
    for (let t = 0; t < tieCount; t++) {
      const u = (t + 0.5) / tieCount
      const p = a.clone().lerp(b, u)
      const tie = new THREE.Mesh(new THREE.BoxGeometry(gauge + 0.45, 0.08, 0.22), tieMat)
      tie.position.copy(p)
      tie.position.y -= 0.06
      tie.rotation.y = yaw
      root.add(tie)
    }

    if (mid.y > 0.35 && i % 2 === 0) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, mid.y + 0.2, 0.24),
        matMetal(0x4a5058, 0.42, 0.75),
      )
      post.position.set(mid.x, (mid.y - 0.1) / 2, mid.z)
      post.castShadow = true
      root.add(post)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), matMetal(0x6a7078))
      cap.position.set(mid.x, mid.y - 0.15, mid.z)
      root.add(cap)
    }
  }
}

/** High-end metro car with doors, lights, pantograph. */
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

  const bodyMat = matPaint(0x2c3444)
  const silver = matMetal(0xc4cad2, 0.22, 0.9)
  const dark = matMetal(0x1a1c22, 0.4, 0.7)
  const windowMat = glow(0x66ccee, 0.55)
  windowMat.transparent = true
  windowMat.opacity = 0.8

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.15, 7.2), bodyMat)
  body.position.y = 1.28
  body.castShadow = true
  g.add(body)

  // Rounded nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 0.7), bodyMat)
  nose.position.set(0, 1.2, -3.7)
  g.add(nose)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.16, 7.1), silver)
  roof.position.y = 2.4
  g.add(roof)

  // Accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.22, 7.25), glow(METRO_BLUE, 0.85))
  stripe.position.y = 1.95
  g.add(stripe)
  ctx.flickerMats.push({ mat: stripe.material as THREE.MeshStandardMaterial, base: 0.85, t: 0.8 })

  // Lower skirt
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.25, 7.0), dark)
  skirt.position.y = 0.45
  g.add(skirt)

  // Side windows + door panels
  for (let i = 0; i < 5; i++) {
    const wz = -2.4 + i * 1.2
    if (i === 1 || i === 3) {
      // Door
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.85), matMetal(0x3a4050))
      door.position.set(1.22, 1.15, wz)
      g.add(door)
      const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9), windowMat)
      doorGlass.position.set(1.27, 1.45, wz)
      doorGlass.rotation.y = Math.PI / 2
      g.add(doorGlass)
      const door2 = door.clone()
      door2.position.x = -1.22
      g.add(door2)
    } else {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.85), windowMat)
      win.position.set(1.21, 1.5, wz)
      win.rotation.y = Math.PI / 2
      g.add(win)
      const win2 = win.clone()
      win2.position.x = -1.21
      win2.rotation.y = -Math.PI / 2
      g.add(win2)
    }
  }

  // Front windshield + headlights
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.05), windowMat)
  front.position.set(0, 1.55, -4.06)
  g.add(front)
  for (const side of [-1, 1] as const) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), glow(NEON_YELLOW, 1.1))
    lamp.rotation.x = Math.PI / 2
    lamp.position.set(side * 0.7, 0.85, -4.08)
    g.add(lamp)
  }

  addSign(g, ctx, 'M', METRO_BLUE, 0, 2.15, -4.08, 0, 0.55, 0.55, 56)

  // Pantograph on roof
  const pantBase = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.5), dark)
  pantBase.position.set(0, 2.52, 0.8)
  g.add(pantBase)
  const pantArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), dark)
  pantArm.position.set(0, 2.8, 0.8)
  pantArm.rotation.z = 0.35
  g.add(pantArm)
  const pantBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.08), silver)
  pantBar.position.set(0, 3.05, 0.8)
  g.add(pantBar)

  for (const [wx, wz] of [[-0.85, -2.5], [0.85, -2.5], [-0.85, 2.5], [0.85, 2.5]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), matMetal(0x121216))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, 0.28, wz)
    g.add(wheel)
  }

  const light = new THREE.PointLight(NEON_CYAN, 0.45, 11, 2)
  light.position.set(0, 2.1, 0)
  g.add(light)
  const headLight = new THREE.PointLight(NEON_YELLOW, 0.55, 14, 2)
  headLight.position.set(0, 1.0, -4.2)
  g.add(headLight)
  root.add(g)
}

/**
 * Iconic arched metro gate — matches the yellow sketch:
 * big semi-circular canopy over the tracks with a neon M.
 */
function buildArchedMetroGate(
  root: THREE.Group,
  ctx: PlazaSubwayContext,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale = 1,
) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw
  g.scale.setScalar(scale)

  const steel = matMetal(0x8a929c, 0.28, 0.88)
  const dark = matPaint(0x1e222a)
  const neon = glow(METRO_BLUE, 1.05)
  const pink = glow(METRO_PINK, 0.9)

  // Twin legs
  for (const side of [-1, 1] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.2, 0.7), steel)
    leg.position.set(side * 3.4, 2.1, 0)
    leg.castShadow = true
    g.add(leg)

    // Leg neon edge
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.0, 0.12), neon)
    edge.position.set(side * 3.65, 2.1, 0.35)
    g.add(edge)

    // Base plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 1.1), dark)
    plinth.position.set(side * 3.4, 0.18, 0)
    g.add(plinth)
  }
  ctx.flickerMats.push({ mat: neon, base: 1.05, t: 0.4 })

  // Arch — segmented torus / boxes along a semicircle
  const archR = 3.55
  const archY = 4.2
  const segments = 14
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const ang = Math.PI * t // 0 → π
    const ax = Math.cos(ang) * archR
    const ay = archY + Math.sin(ang) * archR * 0.95
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.85), steel)
    beam.position.set(ax, ay, 0)
    beam.rotation.z = ang - Math.PI / 2
    beam.castShadow = true
    g.add(beam)

    // Neon rim on arch face
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.14), neon)
    rim.position.set(ax, ay + 0.28, 0.4)
    rim.rotation.z = ang - Math.PI / 2
    g.add(rim)
  }

  // Inner arch fill (dark canopy ceiling)
  for (let i = 1; i < segments; i++) {
    const t = i / segments
    const ang = Math.PI * t
    const ax = Math.cos(ang) * (archR - 0.55)
    const ay = archY + Math.sin(ang) * (archR - 0.55) * 0.95
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.7), dark)
    panel.position.set(ax, ay - 0.15, 0)
    panel.rotation.z = ang - Math.PI / 2
    g.add(panel)
  }

  // Big suspended M medallion
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.18, 28), glow(METRO_BLUE, 0.55))
  disc.rotation.x = Math.PI / 2
  disc.position.set(0, 5.6, 0.15)
  g.add(disc)
  ctx.flickerMats.push({ mat: disc.material as THREE.MeshStandardMaterial, base: 0.55, t: 1.2 })

  const discRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 8, 28), pink)
  discRing.position.set(0, 5.6, 0.15)
  g.add(discRing)
  ctx.flickerMats.push({ mat: pink, base: 0.9, t: 1.8 })

  addSign(g, ctx, 'M', METRO_PINK, 0, 5.6, 0.28, 0, 1.6, 1.6, 90)

  // METRO wordmark below medallion
  addSign(g, ctx, 'METRO', NEON_CYAN, 0, 4.35, 0.45, 0, 3.4, 0.55, 44)

  // Cross-brace under arch
  const brace = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.12, 0.2), steel)
  brace.position.set(0, 3.9, -0.15)
  g.add(brace)

  // Hanging platform lights
  for (const side of [-1.5, 0, 1.5]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.35), glow(NEON_CYAN, 0.7))
    lamp.position.set(side, 4.0, 0.2)
    g.add(lamp)
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), matPaint(0x222228))
    cord.position.set(side, 4.2, 0.2)
    g.add(cord)
  }

  const light = new THREE.PointLight(METRO_BLUE, 0.85, 18, 2)
  light.position.set(0, 5.0, 1.5)
  g.add(light)
  const wash = new THREE.PointLight(NEON_CYAN, 0.4, 12, 2)
  wash.position.set(0, 3.5, -1)
  g.add(wash)

  if (ctx.colliders) {
    for (const side of [-1, 1] as const) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 4.2, 0.9),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      col.position.set(side * 3.4, 2.1, 0)
      g.add(col)
      ctx.colliders.push(col)
    }
  }

  root.add(g)
}

/** Platform deck under the arch. */
function buildPlatform(
  root: THREE.Group,
  ctx: PlazaSubwayContext,
  x: number,
  z: number,
  yaw: number,
  length = 10,
) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = yaw

  const concrete = matPaint(0x3a3e48)
  const dark = matPaint(0x22262e)
  const yellow = glow(NEON_YELLOW, 0.7)

  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.4, length), concrete)
  deck.position.y = 0.55
  deck.receiveShadow = true
  deck.castShadow = true
  g.add(deck)

  // Safety edge
  const edge = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.05, 0.2), yellow)
  edge.position.set(0, 0.78, length / 2 - 0.15)
  g.add(edge)
  ctx.flickerMats.push({ mat: yellow, base: 0.7, t: 2 })

  // Tactile tiles strip
  for (let i = 0; i < 8; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.55), dark)
    strip.position.set(-2.4 + i * 0.7, 0.77, length / 2 - 0.7)
    g.add(strip)
  }

  // Benches
  for (const bz of [-length * 0.25, length * 0.1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), matPaint(0x2a2834))
    seat.position.set(-1.8, 0.95, bz)
    g.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.08), matPaint(0x2a2834))
    back.position.set(-1.8, 1.25, bz - 0.22)
    g.add(back)
  }

  // Info board
  addSign(g, ctx, '→ DOWNTOWN', NEON_CYAN, 2.2, 2.2, -length * 0.2, -Math.PI / 2, 2.4, 0.4)
  addSign(g, ctx, 'NEXT TRAIN 2 MIN', NEON_YELLOW, 2.2, 1.7, -length * 0.2, -Math.PI / 2, 2.6, 0.35)

  if (ctx.colliders) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 1.2, length),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col.position.y = 0.6
    g.add(col)
    ctx.colliders.push(col)
  }

  root.add(g)
}

function buildTrackPath(): THREE.Vector3[] {
  return [
    new THREE.Vector3(14.5, 0.85, 12.5),
    new THREE.Vector3(12.0, 0.85, 14.5),
    new THREE.Vector3(8.0, 0.9, 16.5),
    new THREE.Vector3(3.0, 0.95, 17.2),
    new THREE.Vector3(-2.0, 1.0, 17.0),
    new THREE.Vector3(-7.0, 1.0, 15.5),
    new THREE.Vector3(-11.5, 0.9, 12.5),
    new THREE.Vector3(-15.0, 0.55, 8.0),
    new THREE.Vector3(-16.5, 0.15, 3.0),
    new THREE.Vector3(-16.8, -0.6, -2.0),
    new THREE.Vector3(-15.5, -1.5, -6.5),
    new THREE.Vector3(-13.0, -2.4, -9.5),
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
    if (a.y > 0.25 && b.y > 0.25) continue

    const mid = a.clone().add(b).multiplyScalar(0.5)
    const dir = b.clone().sub(a)
    const len = dir.length()
    const horiz = new THREE.Vector3(dir.x, 0, dir.z).normalize()
    const yaw = Math.atan2(horiz.x, horiz.z)
    const depth = Math.max(0.8, -mid.y + 0.6)
    const wallH = depth + 1.0

    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.28, len + 0.1), dark)
    bed.position.set(mid.x, mid.y - 0.5, mid.z)
    bed.rotation.y = yaw
    root.add(bed)

    for (const side of [-1, 1] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, wallH, len + 0.08), wallMat)
      const perp = new THREE.Vector3(-horiz.z, 0, horiz.x)
      wall.position.set(mid.x + perp.x * 2.0, mid.y + wallH * 0.22, mid.z + perp.z * 2.0)
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
  const steel = matMetal(0x5a6068)

  // Recessed portal framed by steel
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.0, 4.2, 1.6), dark)
  frame.position.y = 0.5
  g.add(frame)

  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.8, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x020208, roughness: 1 }),
  )
  hole.position.y = 0.25
  g.add(hole)

  // Steel ring plates
  for (const [wy, ww] of [[2.5, 4.8], [0.25, 4.8], [1.4, 0.25]] as const) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(ww === 0.25 ? 3.4 : ww, 0.18, 1.7), steel)
    if (ww === 0.25) {
      // skip side plates in this loop — handled below
    } else {
      plate.position.set(0, wy, 0)
      g.add(plate)
    }
  }
  for (const side of [-1, 1] as const) {
    const sidePlate = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 1.7), steel)
    sidePlate.position.set(side * 1.75, 1.2, 0)
    g.add(sidePlate)
  }

  const rim = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 1.7), glow(METRO_BLUE, 0.85))
  rim.position.y = 2.7
  g.add(rim)
  ctx.flickerMats.push({ mat: rim.material as THREE.MeshStandardMaterial, base: 0.85, t: 0.6 })

  addSign(g, ctx, 'UNDERGROUND', NEON_ORANGE, 0, 3.05, -0.85, 0, 3.4, 0.4)

  const tube = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.0, 16), matPaint(0x0a0c10))
  tube.position.set(0, 0.15, 9)
  g.add(tube)

  // Tunnel LED strips
  for (const side of [-1.4, 1.4]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 14), glow(NEON_CYAN, 0.5))
    strip.position.set(side, 1.4, 9)
    g.add(strip)
  }

  const light = new THREE.PointLight(METRO_BLUE, 0.6, 20, 2)
  light.position.set(0, 1.6, 2)
  g.add(light)

  root.add(g)
}

/**
 * High-end metro: arched M gate over platform, rails diving west underground toward diner.
 */
export function buildPlazaSubway(ctx: PlazaSubwayContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-subway'

  // Hero arched gate at SE station (behind fountain) — matches the sketch
  const stationYaw = Math.PI / 4
  buildArchedMetroGate(root, ctx, SUBWAY_X - 0.5, 0, SUBWAY_Z - 0.5, stationYaw, 1.05)
  buildPlatform(root, ctx, SUBWAY_X - 1.2, SUBWAY_Z + 0.8, stationYaw, 11)

  // Secondary smaller arch at the underground portal (west loop)
  buildArchedMetroGate(root, ctx, -16.0, -0.4, 2.5, Math.PI * 0.95, 0.72)

  const path = buildTrackPath()
  addRails(root, path, 1.15)
  addDescentTrench(root, path)

  const portalAt = new THREE.Vector3(-16.4, -0.95, -0.5)
  const portalToward = new THREE.Vector3(-15.2, -1.6, -5.5)
  addTunnelPortal(root, ctx, portalAt, portalToward)

  // Train under the main arch
  buildMetroCar(root, 13.0, 0.85, 13.5, stationYaw, ctx)

  // Train entering west portal under the smaller arch
  buildMetroCar(root, -15.9, -0.4, 3.8, Math.PI * 0.95, ctx)

  // Surface vents along underground run toward diner
  const grateMat = matMetal(0x3a4050, 0.45, 0.7)
  for (const [gx, gz] of [[-9, -12], [-6, -13], [-3, -13.5], [0, -14]] as const) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.3), grateMat)
    grate.position.set(gx, 0.05, gz)
    root.add(grate)
    const glowLine = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.1), glow(NEON_CYAN, 0.5))
    glowLine.position.set(gx, 0.11, gz)
    root.add(glowLine)
  }

  ctx.scene.add(root)
  return root
}
