import * as THREE from 'three'
import { PLAZA_HALF, PLAZA_SIZE, STREET_INNER, STREET_MID, STREET_OUTER, STREET_W, ws } from './worldConfig.js'

const ASPHALT = 0x1c1c22
const MARKING_WHITE = 0xf2f2f2
const CURB = 0x4a4848
const NEON_CYAN = 0x00f6ff
const MARK_Y = 0.022
const STREET_SURFACE_Y = 0.008

export interface PlazaStreetContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#1c1c22'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const a = 0.04 + Math.random() * 0.08
    g.fillStyle = Math.random() > 0.5 ? `rgba(28,28,34,${a})` : `rgba(36,36,44,${a})`
    g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = `rgba(12,12,16,${0.15 + Math.random() * 0.2})`
    g.lineWidth = 0.5 + Math.random()
    g.beginPath()
    g.moveTo(Math.random() * 512, Math.random() * 512)
    g.lineTo(Math.random() * 512, Math.random() * 512)
    g.stroke()
  }
  // Wet streaks
  for (let i = 0; i < 6; i++) {
    const wx = Math.random() * 512
    g.fillStyle = `rgba(40,48,58,${0.08 + Math.random() * 0.06})`
    g.fillRect(wx, 0, 8 + Math.random() * 20, 512)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function markingMat(emissive = 0.05) {
  const mat = new THREE.MeshStandardMaterial({
    color: MARKING_WHITE,
    emissive: MARKING_WHITE,
    emissiveIntensity: emissive,
    roughness: 0.62,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  return mat
}

/** Square ring mesh — no overlapping corner patches. */
function buildStreetRingMesh(): THREE.Mesh {
  const asphaltTex = makeAsphaltTexture()
  const mat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    color: ASPHALT,
    roughness: 0.92,
    metalness: 0.08,
  })

  const outer = STREET_OUTER
  const inner = STREET_INNER
  const shape = new THREE.Shape()
  shape.moveTo(-outer, -outer)
  shape.lineTo(outer, -outer)
  shape.lineTo(outer, outer)
  shape.lineTo(-outer, outer)
  shape.closePath()

  const hole = new THREE.Path()
  hole.moveTo(-inner, -inner)
  hole.lineTo(inner, -inner)
  hole.lineTo(inner, inner)
  hole.lineTo(-inner, inner)
  hole.closePath()
  shape.holes.push(hole)

  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.008
  mesh.receiveShadow = true
  return mesh
}

function addDashLine(
  root: THREE.Group,
  x: number,
  z: number,
  len: number,
  alongX: boolean,
  w = 0.16,
  dash = 1.6,
  gap = 1.1,
) {
  const mat = markingMat(0.1)
  const count = Math.floor(len / (dash + gap))
  for (let i = 0; i < count; i++) {
    const dashMesh = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? dash : w, alongX ? w : dash), mat)
    dashMesh.rotation.x = -Math.PI / 2
    const t = -len / 2 + dash / 2 + i * (dash + gap)
    dashMesh.position.set(alongX ? x + t : x, MARK_Y, alongX ? z : z + t)
    root.add(dashMesh)
  }
}

function addSolidLine(root: THREE.Group, x: number, z: number, len: number, alongX: boolean, w = 0.12) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? len : w, alongX ? w : len), markingMat(0.08))
  line.rotation.x = -Math.PI / 2
  line.position.set(x, MARK_Y - 0.001, z)
  root.add(line)
}

/** Zebra — stripes run parallel to `stripeAxis` (0 = along X, PI/2 = along Z). */
function addZebraCrossing(
  root: THREE.Group,
  cx: number,
  cz: number,
  span: number,
  depth: number,
  stripeAxis: number,
) {
  const stripeW = 0.48
  const count = Math.floor(span / stripeW)
  const mat = markingMat(0.14)
  for (let i = 0; i < count; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeW * 0.78, depth), mat)
    stripe.rotation.x = -Math.PI / 2
    stripe.rotation.y = stripeAxis
    const ox = (i - (count - 1) / 2) * stripeW
    stripe.position.set(cx + Math.cos(stripeAxis) * ox, MARK_Y + 0.002, cz + Math.sin(stripeAxis) * ox)
    root.add(stripe)
  }
}

function addStopBar(root: THREE.Group, x: number, z: number, len: number, alongX: boolean) {
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? len : 0.35, alongX ? 0.35 : len), markingMat(0.12))
  bar.rotation.x = -Math.PI / 2
  bar.position.set(x, MARK_Y + 0.001, z)
  root.add(bar)
}

function addCurbSegment(root: THREE.Group, x: number, z: number, len: number, alongX: boolean) {
  const curbMat = new THREE.MeshStandardMaterial({ color: CURB, roughness: 0.82, metalness: 0.15 })
  const curb = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.22, 0.14, alongX ? 0.22 : len), curbMat)
  curb.position.set(x, 0.07, z)
  curb.castShadow = true
  curb.receiveShadow = true
  root.add(curb)
}

function addStreetLamp(root: THREE.Group, ctx: PlazaStreetContext, x: number, z: number, faceInward: number) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x35333e, roughness: 0.42, metalness: 0.78 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 4.2, 10), poleMat)
  pole.position.set(x, 2.1, z)
  pole.castShadow = true
  root.add(pole)

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 10), poleMat)
  base.position.set(x, 0.06, z)
  root.add(base)

  const armLen = 1.25
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, armLen), poleMat)
  arm.position.set(x + Math.cos(faceInward) * (armLen / 2 + 0.08), 4.05, z + Math.sin(faceInward) * (armLen / 2 + 0.08))
  root.add(arm)

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff4e8,
    emissive: NEON_CYAN,
    emissiveIntensity: 1.15,
    roughness: 0.28,
    metalness: 0.25,
  })
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.28), lampMat)
  lamp.position.set(x + Math.cos(faceInward) * (armLen + 0.12), 3.98, z + Math.sin(faceInward) * (armLen + 0.12))
  root.add(lamp)

  const light = new THREE.PointLight(0xffeedd, 0.55, 14, 2)
  light.position.copy(lamp.position)
  light.position.y -= 0.05
  root.add(light)

  ctx.flickerMats.push({ mat: lampMat, base: 1.15, t: Math.random() * 3 })
}

const WHEEL_RADIUS = 0.42

/** Lift group so its lowest mesh point sits on `surfaceY` (after x/z/rotation are set). */
function snapGroupBaseToY(group: THREE.Object3D, surfaceY: number) {
  const box = new THREE.Box3().setFromObject(group)
  group.position.y += surfaceY - box.min.y
}

function buildSchoolBus(): THREE.Group {
  const bus = new THREE.Group()
  bus.name = 'school-bus'

  const wheelY = WHEEL_RADIUS
  const floorY = WHEEL_RADIUS * 2 + 0.04
  const bodyH = 1.45
  const bodyY = floorY + bodyH / 2

  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf0b000, roughness: 0.45, metalness: 0.32 })
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x121216, roughness: 0.55, metalness: 0.45 })
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0x888890, roughness: 0.25, metalness: 0.9 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x557799,
    emissive: 0x1a2838,
    emissiveIntensity: 0.3,
    roughness: 0.08,
    metalness: 0.75,
    transparent: true,
    opacity: 0.82,
  })

  for (const [wx, wz] of [[-0.92, -2.5], [0.92, -2.5], [-0.92, 2.5], [0.92, 2.5]] as [number, number][]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 14), blackMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, wheelY, wz)
    wheel.castShadow = true
    bus.add(wheel)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 8), chromeMat)
    hub.rotation.z = Math.PI / 2
    hub.position.set(wx, wheelY, wz)
    bus.add(hub)
  }

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.36, 7.35), blackMat)
  chassis.position.y = floorY - 0.18
  chassis.castShadow = true
  bus.add(chassis)

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.35, bodyH, 7.4), yellowMat)
  body.position.y = bodyY
  body.castShadow = true
  bus.add(body)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.18, 7.35), yellowMat)
  roof.position.y = bodyY + bodyH / 2 + 0.09
  bus.add(roof)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.62, 1.55), yellowMat)
  hood.position.set(0, floorY + 0.31, -3.95)
  hood.castShadow = true
  bus.add(hood)

  const grill = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 0.12), blackMat)
  grill.position.set(0, floorY + 0.24, -4.72)
  bus.add(grill)

  for (let i = 0; i < 5; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.68), glassMat)
    win.position.set(-1.18, floorY + 0.55, -2.4 + i * 1.35)
    win.rotation.y = Math.PI / 2
    bus.add(win)
  }

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.82), glassMat)
  windshield.position.set(0, floorY + 0.47, -4.65)
  bus.add(windshield)

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.85), blackMat)
  door.position.set(-1.2, floorY + 0.57, 1.8)
  bus.add(door)

  const stopSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.52, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0xff2233, emissiveIntensity: 0.55 }),
  )
  stopSign.position.set(-1.22, floorY + 0.52, -1.2)
  bus.add(stopSign)

  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 256
  labelCanvas.height = 64
  const lg = labelCanvas.getContext('2d')!
  lg.fillStyle = '#000'
  lg.fillRect(0, 0, 256, 64)
  lg.fillStyle = '#111'
  lg.font = 'bold 28px sans-serif'
  lg.textAlign = 'center'
  lg.fillText('SCHOOL BUS', 128, 42)
  const labelTex = new THREE.CanvasTexture(labelCanvas)
  const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.6, metalness: 0.1 })
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.42), labelMat)
  label.position.set(0, floorY + 0.42, 3.72)
  bus.add(label)

  const bumperY = wheelY + 0.06
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.22), blackMat)
  bumperF.position.set(0, bumperY, -4.78)
  bus.add(bumperF)
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.22), blackMat)
  bumperR.position.set(0, bumperY, 4.78)
  bus.add(bumperR)

  return bus
}

/** Lane markings on straight segments only — avoids corner clutter. */
function addStraightMarkings(root: THREE.Group) {
  const straightLen = PLAZA_SIZE - ws(1.2)
  const innerLine = STREET_INNER + 0.28
  const outerLine = STREET_OUTER - 0.28

  for (const zSign of [-1, 1]) {
    addSolidLine(root, 0, zSign * innerLine, straightLen, true, 0.11)
    addDashLine(root, 0, zSign * STREET_MID, straightLen, true)
    addSolidLine(root, 0, zSign * outerLine, straightLen, true, 0.11)
  }

  for (const xSign of [-1, 1]) {
    addSolidLine(root, xSign * innerLine, 0, straightLen, false, 0.11)
    addDashLine(root, xSign * STREET_MID, 0, straightLen, false)
    addSolidLine(root, xSign * outerLine, 0, straightLen, false, 0.11)
  }
}

function addCurbs(root: THREE.Group) {
  const len = PLAZA_SIZE
  addCurbSegment(root, 0, -STREET_INNER + 0.11, len, true)
  addCurbSegment(root, 0, STREET_INNER - 0.11, len, true)
  addCurbSegment(root, -STREET_INNER + 0.11, 0, len, false)
  addCurbSegment(root, STREET_INNER - 0.11, 0, len, false)
}

/** Real street ring: asphalt, markings, lamps, zebra crossings, school bus. */
export function buildPlazaStreet(ctx: PlazaStreetContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-street'

  root.add(buildStreetRingMesh())
  addCurbs(root)
  addStraightMarkings(root)

  const crossSpan = STREET_W - 0.6
  const crossDepth = ws(3.6)

  // West (linker): 2 zebrapaden op noord- en zuidarm
  addZebraCrossing(root, -STREET_MID, -ws(14), crossSpan, crossDepth, Math.PI / 2)
  addStopBar(root, -STREET_MID, -ws(16.2), crossSpan, true)
  addZebraCrossing(root, -STREET_MID, ws(14), crossSpan, crossDepth, Math.PI / 2)
  addStopBar(root, -STREET_MID, ws(16.2), crossSpan, true)

  // East (rechter): 2 zebrapaden
  addZebraCrossing(root, STREET_MID, -ws(14), crossSpan, crossDepth, Math.PI / 2)
  addStopBar(root, STREET_MID, -ws(16.2), crossSpan, true)
  addZebraCrossing(root, STREET_MID, ws(14), crossSpan, crossDepth, Math.PI / 2)
  addStopBar(root, STREET_MID, ws(16.2), crossSpan, true)

  // Lamps on outer sidewalk — skip corner zones
  const lampSpacing = ws(9)
  const lampInset = STREET_OUTER - ws(0.55)
  for (let t = -PLAZA_HALF + ws(6); t <= PLAZA_HALF - ws(6); t += lampSpacing) {
    addStreetLamp(root, ctx, t, -lampInset, Math.PI / 2)
    addStreetLamp(root, ctx, t, lampInset, -Math.PI / 2)
    addStreetLamp(root, ctx, -lampInset, t, 0)
    addStreetLamp(root, ctx, lampInset, t, Math.PI)
  }

  // School bus — east lane, aligned with road; snap wheel base to asphalt surface
  const bus = buildSchoolBus()
  const parkX = STREET_MID + STREET_W * 0.22
  const parkZ = -8
  bus.position.set(parkX, 0, parkZ)
  bus.rotation.y = 0
  root.add(bus)
  snapGroupBaseToY(bus, STREET_SURFACE_Y)

  ctx.scene.add(root)
  return root
}
