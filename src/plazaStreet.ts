import * as THREE from 'three'

const PLAZA_HALF = 20
const PLAZA_SIZE = PLAZA_HALF * 2
const STREET_INNER = PLAZA_HALF + 0.5
const STREET_OUTER = PLAZA_HALF + 6.5
const STREET_MID = (STREET_INNER + STREET_OUTER) / 2
const STREET_W = STREET_OUTER - STREET_INNER

const ASPHALT = 0x1a1a1e
const MARKING_WHITE = 0xeeeeee
const NEON_CYAN = 0x00f6ff

export interface PlazaStreetContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
}

function markingMat(emissive = 0) {
  return new THREE.MeshStandardMaterial({
    color: MARKING_WHITE,
    emissive: MARKING_WHITE,
    emissiveIntensity: emissive,
    roughness: 0.55,
    metalness: 0.05,
  })
}

function addDashLine(root: THREE.Group, x: number, z: number, len: number, alongX: boolean, w = 0.14, dash = 1.4, gap = 1.0) {
  const mat = markingMat(0.08)
  const count = Math.floor(len / (dash + gap))
  for (let i = 0; i < count; i++) {
    const dashMesh = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? dash : w, alongX ? w : dash), mat)
    dashMesh.rotation.x = -Math.PI / 2
    const t = -len / 2 + dash / 2 + i * (dash + gap)
    dashMesh.position.set(alongX ? x + t : x, 0.012, alongX ? z : z + t)
    root.add(dashMesh)
  }
}

function addSolidLine(root: THREE.Group, x: number, z: number, len: number, alongX: boolean, w = 0.1) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? len : w, alongX ? w : len), markingMat(0.06))
  line.rotation.x = -Math.PI / 2
  line.position.set(x, 0.011, z)
  root.add(line)
}

/** Zebra crossing — white stripes perpendicular to crossing direction. */
function addZebraCrossing(root: THREE.Group, cx: number, cz: number, crossWidth: number, crossDepth: number, rotY = 0) {
  const stripeW = 0.42
  const count = Math.floor(crossWidth / stripeW)
  for (let i = 0; i < count; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeW * 0.72, crossDepth), markingMat(0.12))
    stripe.rotation.x = -Math.PI / 2
    stripe.rotation.y = rotY
    const ox = (i - (count - 1) / 2) * stripeW
    stripe.position.set(cx + Math.cos(rotY) * ox, 0.014, cz + Math.sin(rotY) * ox)
    root.add(stripe)
  }
}

function addStreetLamp(
  root: THREE.Group,
  ctx: PlazaStreetContext,
  x: number,
  z: number,
  faceInward: number,
) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3844, roughness: 0.45, metalness: 0.75 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), poleMat)
  pole.position.set(x, 1.8, z)
  pole.castShadow = true
  root.add(pole)

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), poleMat)
  arm.position.set(x + Math.cos(faceInward) * 0.55, 3.45, z + Math.sin(faceInward) * 0.55)
  root.add(arm)

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffeedd,
    emissive: NEON_CYAN,
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.2,
  })
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.22), lampMat)
  lamp.position.set(x + Math.cos(faceInward) * 1.05, 3.38, z + Math.sin(faceInward) * 1.05)
  root.add(lamp)
  ctx.flickerMats.push({ mat: lampMat, base: 1.1, t: Math.random() * 3 })
}

function buildSchoolBus(): THREE.Group {
  const bus = new THREE.Group()
  bus.name = 'school-bus'

  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xe8a800, roughness: 0.48, metalness: 0.35 })
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.5, metalness: 0.4 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x6688aa,
    emissive: 0x223344,
    emissiveIntensity: 0.25,
    roughness: 0.1,
    metalness: 0.7,
    transparent: true,
    opacity: 0.85,
  })

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.35, 6.8), yellowMat)
  body.position.y = 1.05
  body.castShadow = true
  bus.add(body)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.4), yellowMat)
  hood.position.set(0, 0.72, -3.5)
  bus.add(hood)

  for (let wx = 0; wx < 4; wx++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.62), glassMat)
    win.position.set(-0.65 + wx * 0.05, 1.25, -2.2 + wx * 1.35)
    win.rotation.y = Math.PI / 2
    bus.add(win)
  }

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.75), glassMat)
  windshield.position.set(0, 1.15, -4.15)
  bus.add(windshield)

  const stopSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.45, 0.25),
    new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0xff3344, emissiveIntensity: 0.5 }),
  )
  stopSign.position.set(-1.12, 1.05, -2.8)
  bus.add(stopSign)

  for (const [wx, wz] of [[-0.85, -2.2], [0.85, -2.2], [-0.85, 2.2], [0.85, 2.2]] as [number, number][]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12), blackMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, 0.38, wz)
    bus.add(wheel)
  }

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 0.2), blackMat)
  bumper.position.set(0, 0.45, -4.25)
  bus.add(bumper)

  return bus
}

/** Real street ring: asphalt, white lines, lamps, zebra corners, school bus. */
export function buildPlazaStreet(ctx: PlazaStreetContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-street'

  const asphaltMat = new THREE.MeshStandardMaterial({
    color: ASPHALT,
    roughness: 0.88,
    metalness: 0.12,
  })

  const sides = ['north', 'south', 'east', 'west'] as const
  const corner = PLAZA_HALF + STREET_W / 2

  // Asphalt + corner patches
  for (const side of sides) {
    const len = PLAZA_SIZE + STREET_W * 2
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(side === 'north' || side === 'south' ? len : STREET_W, side === 'north' || side === 'south' ? STREET_W : len),
      asphaltMat,
    )
    strip.rotation.x = -Math.PI / 2
    strip.receiveShadow = true
    if (side === 'north') strip.position.set(0, 0.006, -STREET_MID)
    else if (side === 'south') strip.position.set(0, 0.006, STREET_MID)
    else if (side === 'west') strip.position.set(-STREET_MID, 0.006, 0)
    else strip.position.set(STREET_MID, 0.006, 0)
    root.add(strip)
  }

  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W, STREET_W), asphaltMat)
    patch.rotation.x = -Math.PI / 2
    patch.position.set(cx * corner, 0.005, cz * corner)
    root.add(patch)
  }

  // Inner + outer edge lines per side
  const edgeInset = STREET_W * 0.12
  const lineLen = PLAZA_SIZE + STREET_W * 1.6
  addSolidLine(root, 0, -STREET_MID + edgeInset, lineLen, true)
  addSolidLine(root, 0, -STREET_OUTER + edgeInset * 0.6, lineLen, true)
  addSolidLine(root, 0, STREET_MID - edgeInset, lineLen, true)
  addSolidLine(root, 0, STREET_OUTER - edgeInset * 0.6, lineLen, true)
  addSolidLine(root, -STREET_MID + edgeInset, 0, lineLen, false)
  addSolidLine(root, -STREET_OUTER + edgeInset * 0.6, 0, lineLen, false)
  addSolidLine(root, STREET_MID - edgeInset, 0, lineLen, false)
  addSolidLine(root, STREET_OUTER - edgeInset * 0.6, 0, lineLen, false)

  addDashLine(root, 0, -STREET_MID, lineLen, true)
  addDashLine(root, 0, STREET_MID, lineLen, true)
  addDashLine(root, -STREET_MID, 0, lineLen, false)
  addDashLine(root, STREET_MID, 0, lineLen, false)

  // Zebra crossings — linkerhoek (west) + rechterhoek (east), 2 per hoek
  const crossDepth = STREET_W * 0.88
  const crossWidth = 3.2
  const cornerOff = PLAZA_HALF + STREET_W * 0.42

  // West linkerhoek: NW + SW
  addZebraCrossing(root, -cornerOff, -cornerOff + 1.2, crossWidth, crossDepth, 0)
  addZebraCrossing(root, -cornerOff + 1.2, -cornerOff, crossWidth, crossDepth, Math.PI / 2)
  addZebraCrossing(root, -cornerOff, cornerOff - 1.2, crossWidth, crossDepth, 0)
  addZebraCrossing(root, -cornerOff + 1.2, cornerOff, crossWidth, crossDepth, Math.PI / 2)

  // East rechterhoek: NE + SE
  addZebraCrossing(root, cornerOff, -cornerOff + 1.2, crossWidth, crossDepth, 0)
  addZebraCrossing(root, cornerOff - 1.2, -cornerOff, crossWidth, crossDepth, Math.PI / 2)
  addZebraCrossing(root, cornerOff, cornerOff - 1.2, crossWidth, crossDepth, 0)
  addZebraCrossing(root, cornerOff - 1.2, cornerOff, crossWidth, crossDepth, Math.PI / 2)

  // Street lamps along outer edge
  const lampSpacing = 8
  for (let t = -PLAZA_HALF + 4; t <= PLAZA_HALF - 4; t += lampSpacing) {
    addStreetLamp(root, ctx, t, -STREET_OUTER + 0.35, Math.PI / 2)
    addStreetLamp(root, ctx, t, STREET_OUTER - 0.35, -Math.PI / 2)
    addStreetLamp(root, ctx, -STREET_OUTER + 0.35, t, 0)
    addStreetLamp(root, ctx, STREET_OUTER - 0.35, t, Math.PI)
  }
  // Corner lamps
  for (const [lx, lz, face] of [
    [-corner, -corner, Math.PI / 4],
    [corner, -corner, (3 * Math.PI) / 4],
    [-corner, corner, -Math.PI / 4],
    [corner, corner, (-3 * Math.PI) / 4],
  ] as [number, number, number][]) {
    addStreetLamp(root, ctx, lx, lz, face)
  }

  // School bus parked along south-east road
  const bus = buildSchoolBus()
  bus.position.set(STREET_MID + 0.6, 0, 10)
  bus.rotation.y = -Math.PI / 2
  root.add(bus)

  ctx.scene.add(root)
  return root
}

export { PLAZA_HALF, STREET_INNER, STREET_OUTER, STREET_MID }
