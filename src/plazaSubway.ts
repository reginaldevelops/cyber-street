import * as THREE from 'three'
import { makeNeonLabel } from './buildingKit.js'
import { STREET_MID } from './worldConfig.js'

const NEON_CYAN = 0x00f6ff
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622
const METRO_BLUE = 0x4488ff
const METRO_PINK = 0xff2d95

/**
 * Metro station on the south plaza ring avenue.
 * Track runs edge-to-edge across the map along the south ring centerline.
 */
export const SUBWAY_X = 0
export const SUBWAY_Z = STREET_MID
export const SUBWAY_TRACK_Z = STREET_MID
export const SUBWAY_TRACK_Y = 0.85
export const SUBWAY_TRACK_HALF = 74

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

  const bodyMat = matPaint(0x2a3240)
  const silver = matMetal(0xd0d6de, 0.18, 0.94)
  const dark = matMetal(0x14161c, 0.38, 0.75)
  const accent = glow(METRO_BLUE, 0.95)
  const windowMat = glow(0x7ad4f0, 0.65)
  windowMat.transparent = true
  windowMat.opacity = 0.82

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.2, 7.4), bodyMat)
  body.position.y = 1.3
  body.castShadow = true
  g.add(body)

  // Rounded nose + rear cap
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.85, 0.75), bodyMat)
  nose.position.set(0, 1.22, -3.85)
  g.add(nose)
  const rear = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.85, 0.55), bodyMat)
  rear.position.set(0, 1.22, 3.85)
  g.add(rear)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 7.3), silver)
  roof.position.y = 2.45
  g.add(roof)

  // Dual accent stripes
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.18, 7.45), accent)
  stripe.position.y = 2.0
  g.add(stripe)
  ctx.flickerMats.push({ mat: accent, base: 0.95, t: 0.8 })
  const stripeLow = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.1, 7.45), glow(METRO_PINK, 0.55))
  stripeLow.position.y = 0.72
  g.add(stripeLow)

  // Lower skirt
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.28, 7.15), dark)
  skirt.position.y = 0.42
  g.add(skirt)

  // Side windows + door panels
  for (let i = 0; i < 5; i++) {
    const wz = -2.5 + i * 1.25
    if (i === 1 || i === 3) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.75, 0.9), matMetal(0x3a4050))
      door.position.set(1.25, 1.18, wz)
      g.add(door)
      const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.95), windowMat)
      doorGlass.position.set(1.3, 1.48, wz)
      doorGlass.rotation.y = Math.PI / 2
      g.add(doorGlass)
      const door2 = door.clone()
      door2.position.x = -1.25
      g.add(door2)
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.2), silver)
      handle.position.set(1.32, 1.05, wz + 0.25)
      g.add(handle)
    } else {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.88), windowMat)
      win.position.set(1.24, 1.52, wz)
      win.rotation.y = Math.PI / 2
      g.add(win)
      const win2 = win.clone()
      win2.position.x = -1.24
      win2.rotation.y = -Math.PI / 2
      g.add(win2)
    }
  }

  // Front windshield + headlights
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), windowMat)
  front.position.set(0, 1.58, -4.22)
  g.add(front)
  for (const side of [-1, 1] as const) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), glow(NEON_YELLOW, 1.2))
    lamp.rotation.x = Math.PI / 2
    lamp.position.set(side * 0.72, 0.88, -4.24)
    g.add(lamp)
    const lampRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12), silver)
    lampRing.rotation.y = Math.PI / 2
    lampRing.position.set(side * 0.72, 0.88, -4.2)
    g.add(lampRing)
  }

  addSign(g, ctx, 'M', METRO_BLUE, 0, 2.2, -4.24, 0, 0.55, 0.55, 56)

  // Dual pantographs
  for (const pz of [-1.2, 1.4] as const) {
    const pantBase = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.5), dark)
    pantBase.position.set(0, 2.56, pz)
    g.add(pantBase)
    const pantArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), dark)
    pantArm.position.set(0, 2.84, pz)
    pantArm.rotation.z = 0.35
    g.add(pantArm)
    const pantBar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.08), silver)
    pantBar.position.set(0, 3.1, pz)
    g.add(pantBar)
  }

  for (const [wx, wz] of [
    [-0.88, -2.6],
    [0.88, -2.6],
    [-0.88, -0.4],
    [0.88, -0.4],
    [-0.88, 2.6],
    [0.88, 2.6],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12), matMetal(0x121216))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, 0.28, wz)
    g.add(wheel)
  }

  const light = new THREE.PointLight(NEON_CYAN, 0.5, 12, 2)
  light.position.set(0, 2.15, 0)
  g.add(light)
  const headLight = new THREE.PointLight(NEON_YELLOW, 0.65, 16, 2)
  headLight.position.set(0, 1.0, -4.35)
  g.add(headLight)
  root.add(g)
}

/** Chunked 3D metro “M” that reads clearly in isometric view. */
function buildMetroLetterM(parent: THREE.Group, ctx: PlazaSubwayContext, y: number, z: number) {
  const m = new THREE.Group()
  m.position.set(0, y, z)

  const face = glow(METRO_PINK, 1.15)
  const core = glow(METRO_BLUE, 0.95)
  const chrome = matMetal(0xd8dee6, 0.18, 0.95)
  ctx.flickerMats.push({ mat: face, base: 1.15, t: 0.5 })
  ctx.flickerMats.push({ mat: core, base: 0.95, t: 1.4 })

  // Outer chrome shell + neon face — classic station monogram
  const strokes: [number, number, number, number, number, number][] = [
    // left upright
    [-0.95, 0, 0.42, 2.35, 0.28, 0],
    // right upright
    [0.95, 0, 0.42, 2.35, 0.28, 0],
    // left diagonal
    [-0.48, 0.15, 0.36, 1.55, 0.26, 0.52],
    // right diagonal
    [0.48, 0.15, 0.36, 1.55, 0.26, -0.52],
  ]

  for (const [lx, ly, w, h, d, rotZ] of strokes) {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, d + 0.08), chrome)
    shell.position.set(lx, ly, -0.02)
    shell.rotation.z = rotZ
    shell.castShadow = true
    m.add(shell)

    const neon = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), face)
    neon.position.set(lx, ly, 0.08)
    neon.rotation.z = rotZ
    m.add(neon)

    const inner = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.72, d * 0.45), core)
    inner.position.set(lx, ly, 0.14)
    inner.rotation.z = rotZ
    m.add(inner)
  }

  // Center peak diamond
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.45, 0.22), face)
  peak.position.set(0, 0.55, 0.12)
  peak.rotation.z = Math.PI / 4
  m.add(peak)

  parent.add(m)
}

/**
 * High-end arched metro pavilion — deep canopy over the tracks with a bold M,
 * matching the yellow sketch but with premium steel / neon / glass detailing.
 */
function buildArchedMetroGate(
  root: THREE.Group,
  ctx: PlazaSubwayContext,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale = 1,
  deep = true,
) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = yaw
  g.scale.setScalar(scale)

  const steel = matMetal(0x9aa3ae, 0.22, 0.92)
  const chrome = matMetal(0xc8d0da, 0.16, 0.96)
  const dark = matPaint(0x161a22)
  const slate = matPaint(0x2a303a)
  const neon = glow(METRO_BLUE, 1.15)
  const pink = glow(METRO_PINK, 1.0)
  const cyan = glow(NEON_CYAN, 0.85)
  ctx.flickerMats.push({ mat: neon, base: 1.15, t: 0.35 })
  ctx.flickerMats.push({ mat: pink, base: 1.0, t: 1.6 })
  ctx.flickerMats.push({ mat: cyan, base: 0.85, t: 0.9 })

  const glass = new THREE.MeshStandardMaterial({
    color: 0x88ccee,
    emissive: 0x224466,
    emissiveIntensity: 0.35,
    roughness: 0.12,
    metalness: 0.35,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
  })

  const archR = 4.15
  const archBaseY = 3.55
  const segments = 18
  // Depth ribs so the arch reads as a pavilion over the train (sketch)
  const ribZs = deep ? [-2.4, -1.2, 0, 1.2, 2.4] : [0]

  // Twin structural legs + plinths for each rib
  for (const rz of ribZs) {
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.48, 3.7, 0.55), steel)
      leg.position.set(side * (archR - 0.05), 1.85, rz)
      leg.castShadow = true
      g.add(leg)

      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.5, 0.1), neon)
      edge.position.set(side * (archR + 0.22), 1.85, rz + 0.22)
      g.add(edge)

      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.85), dark)
      plinth.position.set(side * (archR - 0.05), 0.16, rz)
      g.add(plinth)

      const footGlow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.55), cyan)
      footGlow.position.set(side * (archR - 0.05), 0.34, rz)
      g.add(footGlow)
    }
  }

  // Arch ribs + neon face rim on the front rib
  for (const rz of ribZs) {
    const isFront = rz === ribZs[ribZs.length - 1]
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const ang = Math.PI * t
      const ax = Math.cos(ang) * archR
      const ay = archBaseY + Math.sin(ang) * archR * 0.92

      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.52), steel)
      beam.position.set(ax, ay, rz)
      beam.rotation.z = ang - Math.PI / 2
      beam.castShadow = true
      g.add(beam)

      if (isFront) {
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 0.12), neon)
        rim.position.set(ax * 1.02, ay + 0.26, rz + 0.32)
        rim.rotation.z = ang - Math.PI / 2
        g.add(rim)

        // Decorative scallop bosses every few segments
        if (i % 3 === 0) {
          const boss = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.18), chrome)
          boss.position.set(ax * 1.04, ay + 0.38, rz + 0.38)
          g.add(boss)
          const jewel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), pink)
          jewel.position.set(ax * 1.04, ay + 0.38, rz + 0.48)
          g.add(jewel)
        }
      }
    }
  }

  // Glass canopy panels between ribs
  if (deep) {
    for (let r = 0; r < ribZs.length - 1; r++) {
      const z0 = ribZs[r]
      const z1 = ribZs[r + 1]
      const zm = (z0 + z1) / 2
      const depth = Math.abs(z1 - z0) - 0.08
      for (let i = 1; i < segments; i++) {
        const t = i / segments
        const ang = Math.PI * t
        const ax = Math.cos(ang) * (archR - 0.35)
        const ay = archBaseY + Math.sin(ang) * (archR - 0.35) * 0.92
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, depth), glass)
        panel.position.set(ax, ay - 0.12, zm)
        panel.rotation.z = ang - Math.PI / 2
        g.add(panel)
      }
    }
  }

  // Inner dark soffit
  for (let i = 2; i < segments - 1; i++) {
    const t = i / segments
    const ang = Math.PI * t
    const ax = Math.cos(ang) * (archR - 0.85)
    const ay = archBaseY + Math.sin(ang) * (archR - 0.85) * 0.92
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.14, deep ? 4.6 : 0.7),
      slate,
    )
    panel.position.set(ax, ay - 0.22, 0)
    panel.rotation.z = ang - Math.PI / 2
    g.add(panel)
  }

  // Apex finial
  const finial = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.45), chrome)
  finial.position.set(0, archBaseY + archR * 0.92 + 0.55, deep ? 2.4 : 0)
  g.add(finial)
  const finialGlow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 0.22), pink)
  finialGlow.position.copy(finial.position)
  finialGlow.position.y += 0.15
  finialGlow.position.z += 0.12
  g.add(finialGlow)

  // Bold suspended M in the arch mouth (sketch hero)
  const medY = archBaseY + archR * 0.42
  const medZ = deep ? 2.55 : 0.2

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.16, 32), glow(METRO_BLUE, 0.45))
  disc.rotation.x = Math.PI / 2
  disc.position.set(0, medY, medZ - 0.08)
  g.add(disc)
  ctx.flickerMats.push({ mat: disc.material as THREE.MeshStandardMaterial, base: 0.45, t: 1.1 })

  const discRing = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.07, 8, 32), pink)
  discRing.position.set(0, medY, medZ - 0.08)
  g.add(discRing)

  const discRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.045, 8, 32), neon)
  discRing2.position.set(0, medY, medZ - 0.08)
  g.add(discRing2)

  buildMetroLetterM(g, ctx, medY, medZ + 0.05)

  // Hanging cables from apex to medallion
  for (const side of [-0.55, 0.55] as const) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 5), matMetal(0x555a62))
    cable.position.set(side * 0.4, medY + 1.05, medZ - 0.15)
    cable.rotation.z = side * 0.28
    g.add(cable)
  }

  addSign(g, ctx, 'METRO', NEON_CYAN, 0, medY - 1.55, medZ + 0.15, 0, 3.6, 0.5, 46)

  // Tie beams under canopy
  for (const bz of deep ? [-1.8, 0, 1.8] : [0]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(archR * 2 - 0.4, 0.1, 0.16), steel)
    brace.position.set(0, 3.35, bz)
    g.add(brace)
  }

  // Linear hanging platform lights
  const lampZs = deep ? [-1.8, -0.6, 0.6, 1.8] : [0]
  for (const lz of lampZs) {
    for (const lx of [-1.8, 0, 1.8]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), matPaint(0x222228))
      cord.position.set(lx, 3.55, lz)
      g.add(cord)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.28), cyan)
      lamp.position.set(lx, 3.3, lz)
      g.add(lamp)
    }
  }

  // Approach steps + branded pavement strip (front only when deep)
  if (deep) {
    for (let s = 0; s < 3; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(7.2 - s * 0.35, 0.14, 0.55), slate)
      step.position.set(0, 0.08 + s * 0.14, 3.15 + s * 0.5)
      step.receiveShadow = true
      g.add(step)
    }
    const apron = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.08, 2.4), dark)
    apron.position.set(0, 0.04, 4.4)
    apron.receiveShadow = true
    g.add(apron)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.04, 0.18), neon)
    stripe.position.set(0, 0.1, 4.4)
    g.add(stripe)
  }

  const light = new THREE.PointLight(METRO_BLUE, 1.05, 22, 2)
  light.position.set(0, medY, medZ + 1.2)
  g.add(light)
  const wash = new THREE.PointLight(NEON_CYAN, 0.55, 14, 2)
  wash.position.set(0, 3.2, deep ? -1.5 : -1)
  g.add(wash)
  const pinkWash = new THREE.PointLight(METRO_PINK, 0.35, 10, 2)
  pinkWash.position.set(0, medY, medZ + 0.8)
  g.add(pinkWash)

  if (ctx.colliders) {
    for (const side of [-1, 1] as const) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 3.8, deep ? 5.2 : 0.9),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      col.position.set(side * (archR - 0.05), 1.9, 0)
      g.add(col)
      ctx.colliders.push(col)
    }
  }

  root.add(g)
}

/** Platform deck beside the track. Length runs along local X (E–W); track faces +local Z. */
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
  const steel = matMetal(0x6a727c, 0.35, 0.8)
  const yellow = glow(NEON_YELLOW, 0.75)
  const cyan = glow(NEON_CYAN, 0.65)
  const depth = 5.2

  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.42, depth), concrete)
  deck.position.y = 0.55
  deck.receiveShadow = true
  deck.castShadow = true
  g.add(deck)

  // Raised curb toward tracks (+Z)
  const curb = new THREE.Mesh(new THREE.BoxGeometry(length - 0.2, 0.12, 0.35), steel)
  curb.position.set(0, 0.8, depth / 2 - 0.12)
  g.add(curb)

  const edge = new THREE.Mesh(new THREE.BoxGeometry(length - 0.4, 0.05, 0.18), yellow)
  edge.position.set(0, 0.88, depth / 2 - 0.12)
  g.add(edge)
  ctx.flickerMats.push({ mat: yellow, base: 0.75, t: 2 })

  for (let i = 0; i < Math.floor(length / 0.7); i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.5), dark)
    strip.position.set(-length / 2 + 0.6 + i * 0.7, 0.78, depth / 2 - 0.75)
    g.add(strip)
  }

  for (let i = 0; i < 4; i++) {
    const px = -length * 0.35 + i * (length * 0.22)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), steel)
    pole.position.set(px, 1.95, -depth / 2 + 0.45)
    g.add(pole)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.35), cyan)
    cap.position.set(px, 3.2, -depth / 2 + 0.45)
    g.add(cap)
  }
  ctx.flickerMats.push({ mat: cyan, base: 0.65, t: 1.3 })

  for (const bx of [-length * 0.28, length * 0.08]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.52), matPaint(0x2a2834))
    seat.position.set(bx, 0.98, -0.6)
    g.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.08), matPaint(0x2a2834))
    back.position.set(bx, 1.28, -0.84)
    g.add(back)
  }

  const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 0.12), matPaint(0x12151c))
  board.position.set(length * 0.28, 2.0, -depth / 2 + 0.2)
  g.add(board)
  addSign(g, ctx, '→ DOWNTOWN', NEON_CYAN, length * 0.28, 2.35, -depth / 2 + 0.28, 0, 2.4, 0.4)
  addSign(g, ctx, 'NEXT TRAIN 2 MIN', NEON_YELLOW, length * 0.28, 1.85, -depth / 2 + 0.28, 0, 2.6, 0.35)
  addSign(g, ctx, 'PLAZA STATION', METRO_PINK, length * 0.28, 1.4, -depth / 2 + 0.28, 0, 2.5, 0.32)

  if (ctx.colliders) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(length, 1.2, depth),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col.position.y = 0.6
    g.add(col)
    ctx.colliders.push(col)
  }

  root.add(g)
}

function buildTrackPath(): THREE.Vector3[] {
  // Full E–W street-running metro along the avenue south of the plaza
  const z = SUBWAY_TRACK_Z
  const y = SUBWAY_TRACK_Y
  const pts: THREE.Vector3[] = []
  for (let x = -SUBWAY_TRACK_HALF; x <= SUBWAY_TRACK_HALF; x += 6) {
    pts.push(new THREE.Vector3(x, y, z))
  }
  if (pts[pts.length - 1].x < SUBWAY_TRACK_HALF) {
    pts.push(new THREE.Vector3(SUBWAY_TRACK_HALF, y, z))
  }
  return pts
}

function addEndPortal(
  root: THREE.Group,
  ctx: PlazaSubwayContext,
  x: number,
  z: number,
  yaw: number,
  label: string,
) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = yaw

  const steel = matMetal(0x6a727c)
  const dark = matPaint(0x1a1e26)

  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 1.2), dark)
  frame.position.y = 1.4
  g.add(frame)

  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 2.4, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x020208, roughness: 1 }),
  )
  hole.position.y = 1.15
  g.add(hole)

  for (const side of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.2, 0.35), steel)
    post.position.set(side * 1.7, 1.6, 0)
    g.add(post)
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.22, 1.25), glow(METRO_BLUE, 0.75))
  lintel.position.y = 3.15
  g.add(lintel)
  ctx.flickerMats.push({ mat: lintel.material as THREE.MeshStandardMaterial, base: 0.75, t: 0.5 })

  addSign(g, ctx, label, NEON_ORANGE, 0, 3.45, -0.7, 0, 3.2, 0.38)

  root.add(g)
}

/**
 * Plaza Metro: station on the south approach avenue, rails edge-to-edge E–W across the city.
 */
export function buildPlazaSubway(ctx: PlazaSubwayContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-subway'

  // Arch opens along the track (local Z → world X). Platform sits north toward the plaza.
  const stationYaw = Math.PI / 2
  const trackZ = SUBWAY_TRACK_Z
  const trackY = SUBWAY_TRACK_Y

  buildArchedMetroGate(root, ctx, SUBWAY_X, 0, trackZ, stationYaw, 1.0, true)
  // Platform on plaza-facing (north) shoulder — length along track, safety edge toward rails
  buildPlatform(root, ctx, SUBWAY_X, trackZ - 3.8, 0, 14)

  // Slim secondary marker arches at ± east/west mid-stops
  buildArchedMetroGate(root, ctx, -54, 0, trackZ, stationYaw, 0.55, false)
  buildArchedMetroGate(root, ctx, 54, 0, trackZ, stationYaw, 0.55, false)

  const path = buildTrackPath()
  addRails(root, path, 1.15)

  // End-of-line portals at map edges
  addEndPortal(root, ctx, -SUBWAY_TRACK_HALF - 0.2, trackZ, Math.PI / 2, 'WEST TERMINUS')
  addEndPortal(root, ctx, SUBWAY_TRACK_HALF + 0.2, trackZ, -Math.PI / 2, 'EAST TERMINUS')

  // Train at main plaza station
  buildMetroCar(root, SUBWAY_X, trackY, trackZ, stationYaw, ctx)
  // Second car further east on the same line
  buildMetroCar(root, 28, trackY, trackZ, stationYaw, ctx)

  // Surface vent grates along the avenue (street-running utilities)
  const grateMat = matMetal(0x3a4050, 0.45, 0.7)
  for (const gx of [-40, -20, 20, 40] as const) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.1), grateMat)
    grate.position.set(gx, 0.05, trackZ - 2.8)
    root.add(grate)
    const glowLine = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.1), glow(NEON_CYAN, 0.45))
    glowLine.position.set(gx, 0.11, trackZ - 2.8)
    root.add(glowLine)
  }

  ctx.scene.add(root)
  return root
}
