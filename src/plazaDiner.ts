import * as THREE from 'three'
import { TILE_SIZE } from './worldConfig.js'

/** 4×4 plaza tiles — Tesla-diner footprint. */
export const DINER_TILES = 4
export const DINER_SIZE = DINER_TILES * TILE_SIZE // 12.8

const TESLA_RED = 0xe31937
const TESLA_SILVER = 0xc8ccd2
const TESLA_DARK = 0x1a1c20
const TESLA_STEEL = 0x8a9098
const NEON_RED = 0xff2244
const NEON_CYAN = 0x00f6ff
const NEON_WHITE = 0xf2f4f8
const WINDOW_GLOW = 0xffcc88
const MARK_WHITE = 0xf2f2f2

export interface PlazaDinerContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function makeNeonLabel(text: string, color: number, w: number, h: number, fontPx: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#0a0a0c'
  g.fillRect(0, 0, w, h)
  const css = `#${color.toString(16).padStart(6, '0')}`
  g.font = `bold ${fontPx}px "Arial Black", Impact, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = css
  g.shadowColor = css
  g.shadowBlur = 18
  g.fillText(text, w / 2, h / 2 + 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function makeLogoTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#0a0a0c'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = '#e31937'
  g.lineWidth = 14
  g.beginPath()
  g.arc(128, 128, 96, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#e31937'
  g.shadowColor = '#e31937'
  g.shadowBlur = 22
  g.font = 'bold 140px "Arial Black", Impact, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('T', 128, 142)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * Retro-futuristic Tesla-style diner on the plaza.
 * Lot is 4×4 tiles: building + EV parking apron with neon branding.
 */
export function buildPlazaDiner(ctx: PlazaDinerContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-diner'

  // Northwest plaza — clear of central hub, fully on grate floor
  const lotX = -9
  const lotZ = -9
  const lot = DINER_SIZE
  const half = lot / 2

  // Face southeast toward plaza center
  const yaw = Math.PI / 4
  root.position.set(lotX, 0, lotZ)
  root.rotation.y = yaw

  const silverMat = new THREE.MeshStandardMaterial({
    color: TESLA_SILVER,
    roughness: 0.28,
    metalness: 0.88,
  })
  const darkMat = new THREE.MeshStandardMaterial({
    color: TESLA_DARK,
    roughness: 0.55,
    metalness: 0.45,
  })
  const steelMat = new THREE.MeshStandardMaterial({
    color: TESLA_STEEL,
    roughness: 0.35,
    metalness: 0.82,
  })
  const redLedMat = new THREE.MeshStandardMaterial({
    color: TESLA_RED,
    emissive: TESLA_RED,
    emissiveIntensity: 0.95,
    roughness: 0.35,
    metalness: 0.4,
  })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88aacc,
    emissive: WINDOW_GLOW,
    emissiveIntensity: 0.45,
    roughness: 0.12,
    metalness: 0.7,
    transparent: true,
    opacity: 0.72,
  })
  const warmGlassMat = glassMat.clone()
  warmGlassMat.emissiveIntensity = 0.7
  const markMat = new THREE.MeshStandardMaterial({
    color: MARK_WHITE,
    emissive: MARK_WHITE,
    emissiveIntensity: 0.08,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })

  // ── Lot pad ──────────────────────────────────────────────────────────────
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(lot + 0.4, 0.12, lot + 0.4),
    new THREE.MeshStandardMaterial({ color: 0x16161c, roughness: 0.82, metalness: 0.2 }),
  )
  pad.position.y = 0.06
  pad.receiveShadow = true
  root.add(pad)

  // Building occupies rear ~55% of lot; parking apron in front
  const buildW = 8.6
  const buildD = 6.2
  const buildH1 = 3.1
  const buildH2 = 2.4
  const buildZ = -half + buildD / 2 + 0.55

  // ── Ground floor — curved metallic volume (box + rounded ends) ───────────
  const ground = new THREE.Mesh(new THREE.BoxGeometry(buildW * 0.72, buildH1, buildD), silverMat)
  ground.position.set(0, 0.12 + buildH1 / 2, buildZ)
  ground.castShadow = true
  ground.receiveShadow = true
  root.add(ground)

  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(
      new THREE.CylinderGeometry(buildD / 2, buildD / 2, buildH1, 20, 1, false, 0, Math.PI),
      silverMat,
    )
    end.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
    end.position.set(side * (buildW * 0.36), 0.12 + buildH1 / 2, buildZ)
    end.castShadow = true
    root.add(end)
  }

  // Dark plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(buildW + 0.2, 0.22, buildD + 0.15), darkMat)
  plinth.position.set(0, 0.17, buildZ)
  root.add(plinth)

  // ── Red LED belt between floors ──────────────────────────────────────────
  const belt = new THREE.Mesh(new THREE.BoxGeometry(buildW + 0.35, 0.14, buildD + 0.25), redLedMat)
  belt.position.set(0, 0.12 + buildH1 + 0.07, buildZ)
  root.add(belt)
  ctx.flickerMats.push({ mat: redLedMat, base: 0.95, t: 1.2 })

  // Curved belt ends
  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(buildD / 2 + 0.05, 0.07, 8, 24, Math.PI),
      redLedMat,
    )
    ring.rotation.x = Math.PI / 2
    ring.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2
    ring.position.set(side * (buildW * 0.36), 0.12 + buildH1 + 0.07, buildZ)
    root.add(ring)
  }

  // ── Upper floor / Skypad ─────────────────────────────────────────────────
  const upper = new THREE.Mesh(new THREE.BoxGeometry(buildW * 0.62, buildH2, buildD * 0.88), silverMat)
  upper.position.set(0, 0.12 + buildH1 + 0.14 + buildH2 / 2, buildZ)
  upper.castShadow = true
  root.add(upper)

  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(
      new THREE.CylinderGeometry((buildD * 0.88) / 2, (buildD * 0.88) / 2, buildH2, 18, 1, false, 0, Math.PI),
      silverMat,
    )
    end.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
    end.position.set(side * (buildW * 0.31), upper.position.y, buildZ)
    end.castShadow = true
    root.add(end)
  }

  // Roof deck railing
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.3, metalness: 0.85 })
  const roofY = 0.12 + buildH1 + 0.14 + buildH2 + 0.05
  const rail = new THREE.Mesh(new THREE.BoxGeometry(buildW * 0.58, 0.06, buildD * 0.82), railMat)
  rail.position.set(0, roofY, buildZ)
  root.add(rail)
  for (const [rx, rz, rw, rd] of [
    [0, buildZ - buildD * 0.4, buildW * 0.55, 0.05],
    [0, buildZ + buildD * 0.4, buildW * 0.55, 0.05],
    [-buildW * 0.28, buildZ, 0.05, buildD * 0.78],
    [buildW * 0.28, buildZ, 0.05, buildD * 0.78],
  ] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.55, rd), railMat)
    post.position.set(rx, roofY + 0.28, rz)
    root.add(post)
  }

  // Solar strip on roof
  const solar = new THREE.Mesh(
    new THREE.BoxGeometry(buildW * 0.4, 0.04, buildD * 0.35),
    new THREE.MeshStandardMaterial({ color: 0x1a2840, emissive: 0x112244, emissiveIntensity: 0.25, metalness: 0.7 }),
  )
  solar.position.set(0, roofY + 0.04, buildZ)
  root.add(solar)

  // ── Front glass ribbon (ground + upper) ──────────────────────────────────
  const frontZ = buildZ + buildD / 2 + 0.04
  const winCount = 6
  for (let i = 0; i < winCount; i++) {
    const wx = (i - (winCount - 1) / 2) * 1.15
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), glassMat)
    win.position.set(wx, 0.12 + 1.35, frontZ)
    root.add(win)

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.28, 0.06), steelMat)
    frame.position.set(wx, win.position.y, frontZ - 0.03)
    root.add(frame)
  }
  ctx.flickerMats.push({ mat: glassMat, base: 0.45, t: 0.4 })

  for (let i = 0; i < 5; i++) {
    const wx = (i - 2) * 1.15
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.5), warmGlassMat)
    win.position.set(wx, 0.12 + buildH1 + 0.14 + buildH2 * 0.52, frontZ - 0.05)
    root.add(win)
  }
  ctx.flickerMats.push({ mat: warmGlassMat, base: 0.7, t: 2.1 })

  // Side windows on curved ends
  for (const side of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      const wy = row === 0 ? 0.12 + 1.4 : 0.12 + buildH1 + 0.14 + 1.2
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, row === 0 ? 1.8 : 1.3), glassMat)
      win.position.set(side * (buildW * 0.36 + buildD / 2 * 0.15), wy, buildZ)
      win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
      root.add(win)
    }
  }

  // Entry doors (center)
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x223344,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.25,
    roughness: 0.2,
    metalness: 0.7,
    transparent: true,
    opacity: 0.85,
  })
  for (const side of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.35, 0.08), doorMat)
    door.position.set(side * 0.48, 0.12 + 1.2, frontZ + 0.02)
    root.add(door)
  }
  ctx.flickerMats.push({ mat: doorMat, base: 0.25, t: 0.8 })

  // Canopy over entrance
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.6), steelMat)
  canopy.position.set(0, 2.85, frontZ + 0.7)
  canopy.castShadow = true
  root.add(canopy)
  const canopyGlow = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.04, 1.4),
    new THREE.MeshStandardMaterial({
      color: NEON_WHITE,
      emissive: NEON_WHITE,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    }),
  )
  canopyGlow.position.set(0, 2.78, frontZ + 0.7)
  root.add(canopyGlow)
  ctx.flickerMats.push({
    mat: canopyGlow.material as THREE.MeshStandardMaterial,
    base: 0.55,
    t: 1.5,
  })

  // ── Neon DINER sign + TESLA wordmark ─────────────────────────────────────
  const dinerTex = makeNeonLabel('DINER', TESLA_RED, 512, 128, 72)
  const dinerMat = new THREE.MeshStandardMaterial({
    map: dinerTex,
    emissive: TESLA_RED,
    emissiveMap: dinerTex,
    emissiveIntensity: 1.15,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const dinerSign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), dinerMat)
  dinerSign.position.set(0, 0.12 + buildH1 + 0.55, frontZ + 0.12)
  root.add(dinerSign)
  ctx.flickerMats.push({ mat: dinerMat, base: 1.15, t: 0.2 })

  const teslaTex = makeNeonLabel('TESLA', NEON_WHITE, 384, 64, 40)
  const teslaMat = new THREE.MeshStandardMaterial({
    map: teslaTex,
    emissive: NEON_WHITE,
    emissiveMap: teslaTex,
    emissiveIntensity: 0.85,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const teslaSign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.45), teslaMat)
  teslaSign.position.set(0, 0.12 + buildH1 + 1.25, frontZ + 0.1)
  root.add(teslaSign)
  ctx.flickerMats.push({ mat: teslaMat, base: 0.85, t: 0.6 })

  // Circular T logo — facade
  const logoTex = makeLogoTexture()
  const logoMat = new THREE.MeshStandardMaterial({
    map: logoTex,
    emissive: TESLA_RED,
    emissiveMap: logoTex,
    emissiveIntensity: 0.9,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), logoMat)
  logo.position.set(-buildW * 0.28, 0.12 + buildH1 + 1.6, frontZ + 0.08)
  root.add(logo)
  ctx.flickerMats.push({ mat: logoMat, base: 0.9, t: 1.8 })

  // Free-standing neon pylon by parking
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 0.35), darkMat)
  pylon.position.set(half - 1.1, 2.7, half - 1.4)
  pylon.castShadow = true
  root.add(pylon)
  const pylonSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7), dinerMat.clone())
  pylonSign.position.set(half - 1.1, 4.6, half - 1.4 + 0.2)
  root.add(pylonSign)
  const pylonLogo = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), logoMat.clone())
  pylonLogo.position.set(half - 1.1, 3.6, half - 1.4 + 0.2)
  root.add(pylonLogo)

  // ── EV parking apron (front of lot) ──────────────────────────────────────
  const parkZ0 = buildZ + buildD / 2 + 1.1
  const parkDepth = half - parkZ0 - 0.35
  const spotW = 2.4
  const spotCount = 4
  const spotsSpan = spotCount * spotW

  // Asphalt patch
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(spotsSpan + 0.8, Math.max(parkDepth, 3.2)),
    new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9, metalness: 0.15 }),
  )
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.set(0, 0.125, parkZ0 + Math.max(parkDepth, 3.2) / 2)
  asphalt.receiveShadow = true
  root.add(asphalt)

  for (let i = 0; i < spotCount; i++) {
    const sx = -spotsSpan / 2 + spotW / 2 + i * spotW
    const sz = parkZ0 + 1.55

    // Stall outline
    const outline = new THREE.Mesh(new THREE.PlaneGeometry(spotW - 0.2, 0.08), markMat)
    outline.rotation.x = -Math.PI / 2
    outline.position.set(sx, 0.132, sz - 1.35)
    root.add(outline)
    const left = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 2.7), markMat)
    left.rotation.x = -Math.PI / 2
    left.position.set(sx - spotW / 2 + 0.1, 0.132, sz)
    root.add(left)
    const right = left.clone()
    right.position.x = sx + spotW / 2 - 0.1
    root.add(right)

    // EV symbol on ground
    const evTex = makeNeonLabel('EV', NEON_CYAN, 128, 64, 36)
    const evMat = new THREE.MeshStandardMaterial({
      map: evTex,
      emissive: NEON_CYAN,
      emissiveMap: evTex,
      emissiveIntensity: 0.55,
      transparent: true,
      roughness: 0.7,
    })
    const evMark = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), evMat)
    evMark.rotation.x = -Math.PI / 2
    evMark.position.set(sx, 0.134, sz + 0.4)
    root.add(evMark)

    // Supercharger post
    const charger = new THREE.Group()
    charger.position.set(sx, 0.12, parkZ0 + 0.25)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.45, 0.28), darkMat)
    post.position.y = 0.72
    post.castShadow = true
    charger.add(post)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.45, 0.18),
      new THREE.MeshStandardMaterial({
        color: TESLA_RED,
        emissive: TESLA_RED,
        emissiveIntensity: 0.55,
        roughness: 0.4,
        metalness: 0.5,
      }),
    )
    head.position.y = 1.55
    charger.add(head)
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.28),
      new THREE.MeshStandardMaterial({
        color: NEON_CYAN,
        emissive: NEON_CYAN,
        emissiveIntensity: 0.8,
      }),
    )
    screen.position.set(0, 1.55, 0.1)
    charger.add(screen)
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6),
      new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.7, metalness: 0.2 }),
    )
    cable.position.set(0.18, 0.9, 0.05)
    cable.rotation.z = 0.35
    charger.add(cable)
    root.add(charger)
  }

  // Accessible / reserved stripe at far right of apron
  const hashMat = new THREE.MeshStandardMaterial({
    color: 0x3a6ecc,
    emissive: 0x2255aa,
    emissiveIntensity: 0.35,
    roughness: 0.6,
  })
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.4), hashMat)
    stripe.rotation.x = -Math.PI / 2
    stripe.rotation.z = Math.PI / 4
    stripe.position.set(spotsSpan / 2 + 0.55, 0.133, parkZ0 + 1.5 + (i - 2) * 0.35)
    root.add(stripe)
  }

  // Warm interior spill lights
  const interior = new THREE.PointLight(0xffcc88, 0.85, 14, 2)
  interior.position.set(0, 2.2, buildZ)
  root.add(interior)
  const entranceLight = new THREE.PointLight(0xffe8cc, 0.55, 10, 2)
  entranceLight.position.set(0, 2.6, frontZ + 1.2)
  root.add(entranceLight)
  const redWash = new THREE.PointLight(TESLA_RED, 0.35, 12, 2)
  redWash.position.set(0, 4.2, frontZ)
  root.add(redWash)

  // Collider for building mass
  if (ctx.colliders) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(buildW + 0.4, buildH1 + buildH2 + 0.5, buildD + 0.3),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col.position.set(0, (buildH1 + buildH2) / 2 + 0.2, buildZ)
    root.add(col)
    ctx.colliders.push(col)
  }

  ctx.scene.add(root)
  return root
}
