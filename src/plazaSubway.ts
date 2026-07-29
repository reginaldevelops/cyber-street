import * as THREE from 'three'
import { makeNeonLabel } from './buildingKit.js'

const NEON_CYAN = 0x00f6ff
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622
const METRO_BLUE = 0x3388ff

/** Behind fountain (9,9), opposite Tesla diner (-9,-9) on SE plaza. */
export const SUBWAY_X = 15.2
export const SUBWAY_Z = 15.2

export interface PlazaSubwayContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function matMetal(color: number, rough = 0.4, metal = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}

function matPaint(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15 })
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
  const tex = makeNeonLabel(text, color, 512, 128, 44)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: 1.05,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  root.add(mesh)
  ctx.flickerMats.push({ mat, base: 1.05, t: Math.random() * 3 })
}

/** Twin rails along a polyline of {x,y,z} points. */
function addRails(root: THREE.Group, points: THREE.Vector3[], gauge = 1.05) {
  const railMat = matMetal(0x6a7078, 0.35, 0.9)
  const tieMat = matPaint(0x2a2018)

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const dir = b.clone().sub(a)
    const len = dir.length()
    if (len < 0.05) continue
    dir.normalize()

    // Horizontal perpendicular for gauge (approx on XZ)
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
    const yaw = Math.atan2(dir.x, dir.z)
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z))

    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len + 0.02), railMat)
      const off = perp.clone().multiplyScalar(side * gauge / 2)
      rail.position.copy(mid).add(off)
      rail.rotation.y = yaw
      rail.rotation.x = -pitch
      rail.castShadow = true
      root.add(rail)
    }

    // Ties every ~0.7m along segment
    const tieCount = Math.max(1, Math.floor(len / 0.7))
    for (let t = 0; t < tieCount; t++) {
      const u = (t + 0.5) / tieCount
      const p = a.clone().lerp(b, u)
      const tie = new THREE.Mesh(new THREE.BoxGeometry(gauge + 0.35, 0.06, 0.18), tieMat)
      tie.position.copy(p)
      tie.position.y -= 0.04
      tie.rotation.y = yaw
      root.add(tie)
    }
  }
}

function buildMetroCar(root: THREE.Group, x: number, y: number, z: number, yaw: number, ctx: PlazaSubwayContext) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw

  const bodyMat = matPaint(0x2a3040)
  const silver = matMetal(0xa0a8b0, 0.3, 0.85)
  const windowMat = glow(NEON_CYAN, 0.45)
  windowMat.transparent = true
  windowMat.opacity = 0.75

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 7.2), bodyMat)
  body.position.y = 1.35
  body.castShadow = true
  g.add(body)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.15, 7.15), silver)
  roof.position.y = 2.5
  g.add(roof)

  // Stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.18, 7.22), glow(METRO_BLUE, 0.7))
  stripe.position.y = 1.9
  g.add(stripe)
  ctx.flickerMats.push({ mat: stripe.material as THREE.MeshStandardMaterial, base: 0.7, t: 1 })

  for (let i = 0; i < 4; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.85), windowMat)
    win.position.set(1.21, 1.55, -2.2 + i * 1.4)
    win.rotation.y = Math.PI / 2
    g.add(win)
    const win2 = win.clone()
    win2.position.x = -1.21
    win2.rotation.y = -Math.PI / 2
    g.add(win2)
  }

  // Front window
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), windowMat)
  front.position.set(0, 1.6, -3.62)
  g.add(front)

  addSign(g, ctx, 'M', METRO_BLUE, 0, 2.15, -3.65, 0, 0.55, 0.55)

  for (const [wx, wz] of [[-0.85, -2.4], [0.85, -2.4], [-0.85, 2.4], [0.85, 2.4]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10), matMetal(0x1a1a20))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, 0.28, wz)
    g.add(wheel)
  }

  const light = new THREE.PointLight(NEON_CYAN, 0.4, 10, 2)
  light.position.set(0, 2.2, 0)
  g.add(light)

  root.add(g)
}

/**
 * Above-ground metro station SE of plaza (behind fountain, opposite diner).
 * Platform + rails that slope down into an underground tunnel mouth.
 */
export function buildPlazaSubway(ctx: PlazaSubwayContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-subway'
  // Face toward diner / fountain (NW); local +Z runs SE into the tunnel
  const yaw = Math.PI / 4
  root.position.set(SUBWAY_X, 0, SUBWAY_Z)
  root.rotation.y = yaw

  // Local axes after root rotation: +Z is "into station back / toward tunnel", -Z is toward fountain
  // We'll build in local space: platform along X, rails go +Z then down

  const concrete = matPaint(0x3a3a44)
  const darkConc = matPaint(0x2a2a32)
  const steel = matMetal(0x6a7078)
  const glass = glow(NEON_CYAN, 0.35)
  glass.transparent = true
  glass.opacity = 0.7

  // ── Station pavilion ─────────────────────────────────────────────────────
  const pavilion = new THREE.Group()
  pavilion.position.set(0, 0, -1.2)

  const base = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 5.2), darkConc)
  base.position.y = 0.12
  base.receiveShadow = true
  pavilion.add(base)

  // Curved-ish roof: flat + side arcs via boxes
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.15, 5.8), steel)
  roof.position.y = 4.1
  roof.castShadow = true
  pavilion.add(roof)

  const roofGlow = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.06, 5.4), glow(METRO_BLUE, 0.55))
  roofGlow.position.y = 4.0
  pavilion.add(roofGlow)
  ctx.flickerMats.push({ mat: roofGlow.material as THREE.MeshStandardMaterial, base: 0.55, t: 0.4 })

  // Support columns
  for (const [cx, cz] of [[-3.5, -2], [3.5, -2], [-3.5, 2], [3.5, 2]] as const) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.9, 8), steel)
    col.position.set(cx, 2.05, cz)
    col.castShadow = true
    pavilion.add(col)
  }

  // Back wall + ticket hall
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.6, 0.35), concrete)
  wall.position.set(0, 1.9, 2.3)
  wall.castShadow = true
  pavilion.add(wall)

  // Glass front
  for (let i = 0; i < 4; i++) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.8), glass)
    pane.position.set(-2.7 + i * 1.8, 1.7, -2.55)
    pavilion.add(pane)
  }
  ctx.flickerMats.push({ mat: glass, base: 0.35, t: 1.2 })

  // Entrance opening
  const doorMat = glow(METRO_BLUE, 0.4)
  doorMat.transparent = true
  doorMat.opacity = 0.55
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.12), doorMat)
  door.position.set(0, 1.4, -2.5)
  pavilion.add(door)

  // Escalator hint into station (steps going down inside)
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), steel)
    step.position.set(0, 0.2 + i * 0.18, -0.5 + i * 0.35)
    pavilion.add(step)
  }

  addSign(pavilion, ctx, 'METRO', METRO_BLUE, 0, 3.55, -2.7, 0, 3.6, 0.7)
  addSign(pavilion, ctx, 'LINE M1', NEON_YELLOW, 0, 3.05, -2.7, 0, 2.2, 0.35)
  addSign(pavilion, ctx, 'M', METRO_BLUE, -3.6, 2.4, -2.6, 0, 0.7, 0.7)

  // Pylon with M
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.5, 0.35), darkConc)
  pylon.position.set(4.6, 2.75, -2.8)
  pavilion.add(pylon)
  addSign(pavilion, ctx, 'M', METRO_BLUE, 4.6, 4.8, -3.0, 0, 0.9, 0.9)

  const pavilionLight = new THREE.PointLight(METRO_BLUE, 0.55, 14, 2)
  pavilionLight.position.set(0, 3.5, 0)
  pavilion.add(pavilionLight)

  root.add(pavilion)

  // ── Platform (beside pavilion, toward tunnel) ────────────────────────────
  const platform = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.35, 10), concrete)
  platform.position.set(0, 0.35, 5.5)
  platform.receiveShadow = true
  platform.castShadow = true
  root.add(platform)

  // Platform edge yellow line
  const edge = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.04, 0.18), glow(NEON_YELLOW, 0.65))
  edge.position.set(0, 0.55, 10.2)
  root.add(edge)
  ctx.flickerMats.push({ mat: edge.material as THREE.MeshStandardMaterial, base: 0.65, t: 2 })

  // Platform canopy
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.1, 9.5), steel)
  canopy.position.set(0, 3.4, 5.5)
  canopy.castShadow = true
  root.add(canopy)
  const canopyLight = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.05, 9), glow(NEON_CYAN, 0.4))
  canopyLight.position.set(0, 3.32, 5.5)
  root.add(canopyLight)

  // Benches on platform
  for (const bx of [-2.2, 2.2]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.45), matPaint(0x2a2834))
    seat.position.set(bx, 0.75, 4.5)
    root.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.08), matPaint(0x2a2834))
    back.position.set(bx, 1.05, 4.28)
    root.add(back)
  }

  addSign(root, ctx, '→ DOWNTOWN', NEON_CYAN, 0, 2.8, 1.5, 0, 3.2, 0.4)

  // ── Rails: from platform → slope underground ─────────────────────────────
  // Local +Z goes SE in world (away from fountain) after yaw rotation
  const railPoints: THREE.Vector3[] = [
    new THREE.Vector3(0, 0.58, 2.5),
    new THREE.Vector3(0, 0.58, 8),
    new THREE.Vector3(0, 0.4, 12),
    new THREE.Vector3(0, -0.4, 16),
    new THREE.Vector3(0, -1.6, 20),
    new THREE.Vector3(0, -3.2, 24),
    new THREE.Vector3(0, -4.5, 28),
    new THREE.Vector3(0, -5.5, 34),
  ]
  addRails(root, railPoints, 1.15)

  // Track bed / trench walls as it descends
  for (let i = 2; i < railPoints.length - 1; i++) {
    const p = railPoints[i]
    const next = railPoints[i + 1]
    const mid = p.clone().add(next).multiplyScalar(0.5)
    const len = p.distanceTo(next)
    const pitch = Math.atan2(next.y - p.y, next.z - p.z)

    // Floor of trench
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, len + 0.1), darkConc)
    bed.position.copy(mid)
    bed.position.y -= 0.35
    bed.rotation.x = -pitch
    root.add(bed)

    // Side retaining walls (taller as we go deeper)
    const wallH = Math.min(4.5, 1.2 + Math.abs(mid.y) * 0.9)
    for (const side of [-1, 1] as const) {
      const rw = new THREE.Mesh(new THREE.BoxGeometry(0.28, wallH, len + 0.05), concrete)
      rw.position.set(side * 1.85, mid.y + wallH / 2 - 0.8, mid.z)
      rw.rotation.x = -pitch * 0.3
      root.add(rw)
    }
  }

  // Tunnel mouth portal
  const portalZ = 22
  const portalY = -2.8
  const portal = new THREE.Group()
  portal.position.set(0, portalY, portalZ)

  const arch = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.0, 1.2), darkConc)
  arch.position.y = 1.5
  portal.add(arch)
  // Hollow opening
  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 2.6, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x020208, roughness: 1, metalness: 0 }),
  )
  opening.position.y = 1.3
  portal.add(opening)

  const rim = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 1.4), glow(METRO_BLUE, 0.75))
  rim.position.y = 3.6
  portal.add(rim)
  ctx.flickerMats.push({ mat: rim.material as THREE.MeshStandardMaterial, base: 0.75, t: 0.8 })

  addSign(portal, ctx, 'UNDERGROUND', NEON_ORANGE, 0, 3.9, -0.7, 0, 3.0, 0.4)

  // Dark tunnel continuation beyond portal
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.0, 12), matPaint(0x0a0a10))
  tunnel.position.set(0, 1.2, 7)
  portal.add(tunnel)

  const tunnelLight = new THREE.PointLight(METRO_BLUE, 0.5, 16, 2)
  tunnelLight.position.set(0, 2.5, 2)
  portal.add(tunnelLight)

  root.add(portal)

  // Ground cut / berm around descending trench (visible hole in plaza)
  for (let i = 0; i < 5; i++) {
    const z = 14 + i * 2.2
    const y = -0.15 - i * 0.55
    const berm = new THREE.Mesh(new THREE.BoxGeometry(5.5 + i * 0.3, 0.35, 2.0), matPaint(0x1a1820))
    berm.position.set(0, y, z)
    berm.receiveShadow = true
    root.add(berm)
  }

  // Metro car parked at platform (emerging / waiting)
  buildMetroCar(root, 0, 0.55, 6.5, 0, ctx)

  // Second car further down entering tunnel (half sunk)
  buildMetroCar(root, 0, -2.2, 20.5, 0, ctx)

  // Colliders for pavilion + platform
  if (ctx.colliders) {
    const col1 = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 4, 5),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col1.position.set(0, 2, -1.2)
    root.add(col1)
    ctx.colliders.push(col1)

    const col2 = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 1.2, 10),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col2.position.set(0, 0.6, 5.5)
    root.add(col2)
    ctx.colliders.push(col2)
  }

  ctx.scene.add(root)
  return root
}
