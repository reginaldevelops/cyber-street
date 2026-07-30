import * as THREE from 'three'
import { PLAZA_HALF, PLAZA_SIZE, TILE_SIZE, ws } from './worldConfig.js'

export type GroundConceptId = 'grate-deep' | 'grate-cargo' | 'grate-neon-drain' | 'grate-rust-pipe'

export interface GroundConceptMeta {
  id: GroundConceptId
  agent: string
  name: string
  tagline: string
  pitch: string
}

/** Vier agent-verbeteringen op Industrial Grate — druk 1–4 om te vergelijken. */
export const GROUND_CONCEPTS: GroundConceptMeta[] = [
  {
    id: 'grate-deep',
    agent: 'Agent A',
    name: 'Deep Grate Cathedral',
    tagline: 'Gelaagd rooster / recessed channels',
    pitch: 'Twee-laags roosters met bouten per tegel, verzonken drainage, stoom uit roosters, stalen rand.',
  },
  {
    id: 'grate-cargo',
    agent: 'Agent B',
    name: 'Cargo Dock Heavy',
    tagline: 'Laad-dock / forklift zones',
    pitch: 'Heftruck-banen, ZONE-markeringen, klinknagels, ketting-ankers, rubber bumpers, chevrons.',
  },
  {
    id: 'grate-neon-drain',
    agent: 'Agent C',
    name: 'Neon Drain Network',
    tagline: 'Glowing pipe grid',
    pitch: 'Volledig drainnetwerk met knooppunten, underglow onder elk rooster, centrale drain-hub.',
  },
  {
    id: 'grate-rust-pipe',
    agent: 'Agent D',
    name: 'Rust & Machinery',
    tagline: 'Verweerde fabrieksvloer',
    pitch: 'Roestvlekken, leidingen, kleppen, kabelgoten, stencil-waarschuwingen, gemixte tegels.',
  },
]

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622

export interface GroundBuildContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders: THREE.Mesh[]
  glowTexture: THREE.CanvasTexture
}

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function makeCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  if (repeat) tex.repeat.set(repeat[0], repeat[1])
  tex.needsUpdate = true
  return tex
}

function addCollider(root: THREE.Group, ctx: GroundBuildContext) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x141018 })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA_SIZE, PLAZA_SIZE), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.visible = false
  ctx.colliders.push(mesh)
  root.add(mesh)
  return mesh
}

function makeGrateTexture(variant: 'standard' | 'heavy' | 'fine' | 'rusty') {
  return makeCanvasTexture(128, 128, (g) => {
    g.fillStyle = variant === 'rusty' ? '#2a2018' : '#1a1822'
    g.fillRect(0, 0, 128, 128)
    const step = variant === 'fine' ? 12 : variant === 'heavy' ? 20 : 16
    g.strokeStyle = variant === 'heavy' ? '#4a5060' : '#3a4050'
    g.lineWidth = variant === 'heavy' ? 3 : 2
    for (let i = 0; i <= 128; i += step) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke()
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke()
    }
    g.fillStyle = '#0a0810'
    const hole = variant === 'fine' ? 4 : 6
    for (let x = step / 2; x < 128; x += step) {
      for (let y = step / 2; y < 128; y += step) {
        g.fillRect(x - hole / 2, y - hole / 2, hole, hole)
      }
    }
    if (variant === 'rusty') {
      g.fillStyle = 'rgba(120,60,30,0.35)'
      for (let r = 0; r < 8; r++) {
        g.beginPath()
        g.ellipse(rand(r) * 128, rand(r + 1) * 128, 10 + rand(r + 2) * 18, 8 + rand(r + 3) * 12, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  }, [4, 4])
}

function makeLabelTexture(text: string, color = '#ffe14d') {
  return makeCanvasTexture(256, 64, (g) => {
    g.fillStyle = '#141018'
    g.fillRect(0, 0, 256, 64)
    g.font = 'bold 28px Courier New, monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = color
    g.shadowColor = color
    g.shadowBlur = 10
    g.fillText(text, 128, 32)
  })
}

function addBolts(root: THREE.Group, cx: number, cz: number, half: number, y: number, mat: THREE.Material, scale = 1) {
  const r = 0.04 * scale
  const h = 0.06 * scale
  const inset = Math.max(0.06, half - 0.12 * scale)
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 6), mat)
    bolt.position.set(cx + ox * inset, y, cz + oz * inset)
    root.add(bolt)
  }
}

function addDrainChannel(
  root: THREE.Group,
  ctx: GroundBuildContext,
  x: number,
  z: number,
  len: number,
  rotZ: number,
  color: number,
  width = 0.42,
  y = 0.012,
) {
  const recess = new THREE.Mesh(
    new THREE.PlaneGeometry(width, len),
    new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.9, metalness: 0.1 }),
  )
  recess.rotation.x = -Math.PI / 2
  recess.rotation.z = rotZ
  recess.position.set(x, y, z)
  root.add(recess)

  const glowMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.5,
  })
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.55, len * 0.92), glowMat)
  glow.rotation.copy(recess.rotation)
  glow.position.set(x, y + 0.004, z)
  root.add(glow)
  ctx.flickerMats.push({ mat: glowMat, base: 0.35, t: Math.random() * 3 })
}

// ── Agent A: Deep Grate Cathedral ─────────────────────────────────────────────

function buildGrateDeep(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'grate-deep'
  addCollider(root, ctx)

  const grateTex = makeGrateTexture('heavy')
  const grateMat = new THREE.MeshStandardMaterial({ map: grateTex, color: 0x3a4450, roughness: 0.32, metalness: 0.9 })
  const solidMat = new THREE.MeshStandardMaterial({ color: 0x343840, roughness: 0.82, metalness: 0.18 })
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.35, metalness: 0.92 })

  const tileSize = TILE_SIZE
  for (let gz = -PLAZA_HALF + ws(1.6); gz < PLAZA_HALF; gz += tileSize) {
    for (let gx = -PLAZA_HALF + ws(1.6); gx < PLAZA_HALF; gx += tileSize) {
      const isGrate = (Math.floor(gx / tileSize) + Math.floor(gz / tileSize)) % 2 === 0
      const cx = gx + tileSize / 2
      const cz = gz + tileSize / 2

      if (isGrate) {
        const pit = new THREE.Mesh(new THREE.BoxGeometry(tileSize - 0.22, 0.14, tileSize - 0.22), solidMat)
        pit.position.set(cx, -0.07, cz)
        root.add(pit)
        const grate = new THREE.Mesh(new THREE.BoxGeometry(tileSize - 0.32, 0.05, tileSize - 0.32), grateMat)
        grate.position.set(cx, 0.02, cz)
        grate.receiveShadow = true
        root.add(grate)
        addBolts(root, cx, cz, tileSize / 2 - 0.12, 0.048, boltMat)
      } else {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(tileSize - 0.28, 0.06, tileSize - 0.28), solidMat)
        slab.position.set(cx, 0.03, cz)
        slab.receiveShadow = true
        root.add(slab)
      }
    }
  }

  // Central drain hub
  const hubGrate = new THREE.Mesh(new THREE.CylinderGeometry(ws(1.6), ws(1.6), 0.05, 8), grateMat)
  hubGrate.position.y = 0.025
  root.add(hubGrate)

  return root
}

// ── Agent B: Cargo Dock Heavy ─────────────────────────────────────────────────

function buildGrateCargo(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'grate-cargo'
  addCollider(root, ctx)

  const steelTex = makeCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#2a2a30'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,60,68,${0.2 + rand(i) * 0.3})`
      g.fillRect(rand(i + 1) * 256, rand(i + 2) * 256, 30 + rand(i + 3) * 50, 2)
    }
    g.fillStyle = '#4a5058'
    for (let r = 0; r < 24; r++) {
      g.beginPath()
      g.arc(rand(r + 10) * 256, rand(r + 11) * 256, 2.5, 0, Math.PI * 2)
      g.fill()
    }
  }, [4, 4])

  const steelMat = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x3a4048, roughness: 0.45, metalness: 0.88 })
  const grateMat = new THREE.MeshStandardMaterial({ map: makeGrateTexture('standard'), color: 0x3a4048, roughness: 0.38, metalness: 0.85 })
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x4a2020, roughness: 0.92, metalness: 0.05 })

  // Forklift lanes (solid steel)
  for (const lane of [-6, 6] as number[]) {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(ws(2.8), PLAZA_SIZE - ws(4)), steelMat)
    path.rotation.x = -Math.PI / 2
    path.position.set(lane, 0.006, 0)
    root.add(path)
    const dashMat = new THREE.MeshStandardMaterial({ color: NEON_YELLOW, emissive: NEON_YELLOW, emissiveIntensity: 0.4 })
    for (let d = -16; d <= 16; d += 3) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), dashMat)
      dash.rotation.x = -Math.PI / 2
      dash.position.set(lane, 0.012, d)
      root.add(dash)
    }
  }

  // Grate zones between lanes
  for (let gz = -PLAZA_HALF + ws(2); gz < PLAZA_HALF; gz += ws(3.5)) {
    for (const gx of [-13, -2.5, 2.5, 13] as number[]) {
      const gtile = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), grateMat)
      gtile.rotation.x = -Math.PI / 2
      gtile.position.set(gx, 0.008, gz + 1.75)
      root.add(gtile)
    }
  }

  // Loading zones A/B/C
  const zones = ['ZONE A', 'ZONE B', 'ZONE C']
  for (let zi = 0; zi < 3; zi++) {
    const zx = -12 + zi * 12
    const labelTex = makeLabelTexture(zones[zi], '#ff6622')
    const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, emissive: NEON_ORANGE, emissiveMap: labelTex, emissiveIntensity: 0.55 })
    const label = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.55), labelMat)
    label.rotation.x = -Math.PI / 2
    label.position.set(zx, 0.014, PLAZA_HALF - ws(3))
    root.add(label)
    ctx.flickerMats.push({ mat: labelMat, base: 0.55, t: Math.random() * 4 })

    const zonePlate = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), steelMat)
    zonePlate.rotation.x = -Math.PI / 2
    zonePlate.position.set(zx, 0.005, PLAZA_HALF - ws(8))
    root.add(zonePlate)
  }

  // Chevron hazard border
  for (let i = -18; i <= 18; i += 1.2) {
    const isYellow = Math.floor(i / 1.2) % 2 === 0
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.0),
      new THREE.MeshStandardMaterial({
        color: isYellow ? NEON_YELLOW : 0x141018,
        emissive: isYellow ? NEON_ORANGE : 0x000000,
        emissiveIntensity: isYellow ? 0.35 : 0,
      }),
    )
    stripe.rotation.x = -Math.PI / 2
    stripe.rotation.z = Math.PI / 4
    stripe.position.set(i, 0.016, -PLAZA_HALF + ws(0.55))
    root.add(stripe)
  }

  // Rubber bumpers + chain anchors
  for (const [bx, bz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]] as [number, number][]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.35), rubberMat)
    bumper.position.set(bx, 0.09, bz)
    bumper.rotation.y = Math.atan2(bx, bz)
    root.add(bumper)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 12), steelMat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(bx * 0.92, 0.04, bz * 0.92)
    root.add(ring)
  }

  addDrainChannel(root, ctx, 0, 0, 28, Math.PI / 2, NEON_CYAN, 0.3, 0.007)

  return root
}

// ── Agent C: Neon Drain Network ─────────────────────────────────────────────

function buildGrateNeonDrain(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'grate-neon-drain'
  addCollider(root, ctx)

  const grateTex = makeGrateTexture('fine')
  const grateMat = new THREE.MeshStandardMaterial({ map: grateTex, color: 0x3a4858, roughness: 0.3, metalness: 0.9 })
  const solidMat = new THREE.MeshStandardMaterial({ color: 0x100e18, roughness: 0.7, metalness: 0.3 })

  const tileSize = ws(3.0)
  for (let gz = -PLAZA_HALF + ws(1.5); gz < PLAZA_HALF; gz += tileSize) {
    for (let gx = -PLAZA_HALF + ws(1.5); gx < PLAZA_HALF; gx += tileSize) {
      const isGrate = (Math.floor(gx / 3) + Math.floor(gz / 3)) % 2 === 0
      const cx = gx + tileSize / 2
      const cz = gz + tileSize / 2
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(tileSize - 0.15, tileSize - 0.15), isGrate ? grateMat : solidMat)
      tile.rotation.x = -Math.PI / 2
      tile.position.set(cx, isGrate ? 0.01 : 0.004, cz)
      root.add(tile)

      if (isGrate) {
        const underColor = rand(cx + cz) > 0.5 ? NEON_CYAN : NEON_PINK
        const underMat = new THREE.MeshStandardMaterial({
          color: underColor,
          emissive: underColor,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.85,
        })
        const under = new THREE.Mesh(new THREE.PlaneGeometry(tileSize - 0.5, tileSize - 0.5), underMat)
        under.rotation.x = -Math.PI / 2
        under.position.set(cx, 0.002, cz)
        root.add(under)
        ctx.flickerMats.push({ mat: underMat, base: 0.45, t: Math.random() * 3 })
      }
    }
  }

  // Grid drain network — horizontal + vertical every 5 units
  for (let i = -PLAZA_HALF + ws(2.5); i <= PLAZA_HALF; i += ws(5)) {
    addDrainChannel(root, ctx, i, 0, PLAZA_SIZE - ws(4), Math.PI / 2, i % ws(10) === 0 ? NEON_PINK : NEON_CYAN, 0.32)
    addDrainChannel(root, ctx, 0, i, PLAZA_SIZE - ws(4), 0, i % ws(10) === 0 ? NEON_PINK : NEON_CYAN, 0.32)
  }

  // Junction nodes
  for (let jx = -15; jx <= 15; jx += 5) {
    for (let jz = -15; jz <= 15; jz += 5) {
      const nodeMat = new THREE.MeshStandardMaterial({
        color: NEON_CYAN,
        emissive: NEON_PINK,
        emissiveIntensity: 1.0,
        roughness: 0.2,
        metalness: 0.6,
      })
      const node = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.35), nodeMat)
      node.position.set(jx, 0.022, jz)
      root.add(node)
      ctx.flickerMats.push({ mat: nodeMat, base: 1.0, t: Math.random() * 2 })
    }
  }

  // Central drain hub
  const hubGlow = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 2.8, 32),
    new THREE.MeshBasicMaterial({ color: NEON_CYAN, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, map: ctx.glowTexture }),
  )
  hubGlow.rotation.x = -Math.PI / 2
  hubGlow.position.y = 0.024
  root.add(hubGlow)
  const hubGrate = new THREE.Mesh(new THREE.CircleGeometry(ws(2.0), 16), grateMat)
  hubGrate.rotation.x = -Math.PI / 2
  hubGrate.position.y = 0.026
  root.add(hubGrate)
  for (let ring = 0; ring < 3; ring++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(0.8 + ring * 0.45, 0.025, 6, 24),
      new THREE.MeshBasicMaterial({ color: ring % 2 ? NEON_PINK : NEON_CYAN, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    r.rotation.x = Math.PI / 2
    r.position.y = 0.03 + ring * 0.01
    root.add(r)
  }

  return root
}

// ── Agent D: Rust & Machinery ───────────────────────────────────────────────

function buildGrateRustPipe(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'grate-rust-pipe'
  addCollider(root, ctx)

  const grateTex = makeGrateTexture('rusty')
  const grateMat = new THREE.MeshStandardMaterial({ map: grateTex, color: 0x4a4038, roughness: 0.55, metalness: 0.75 })
  const solidMat = new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 0.82, metalness: 0.2 })
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.42, metalness: 0.82 })
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x6a4030, roughness: 0.88, metalness: 0.35 })

  // Mixed tile sizes
  for (let gz = -PLAZA_HALF + ws(1); gz < PLAZA_HALF; ) {
    for (let gx = -PLAZA_HALF + ws(1); gx < PLAZA_HALF; ) {
      const big = rand(gx + gz) > 0.65
      const sz = big ? 5.5 : 2.8
      const isGrate = (Math.floor(gx) + Math.floor(gz)) % 2 === 0
      const cx = gx + sz / 2
      const cz = gz + sz / 2
      const mat = isGrate ? grateMat : solidMat
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(sz - 0.12, sz - 0.12), mat)
      tile.rotation.x = -Math.PI / 2
      tile.position.set(cx, 0.006, cz)
      root.add(tile)

      if (!isGrate && rand(gx) > 0.55) {
        const rust = new THREE.Mesh(new THREE.PlaneGeometry(sz * 0.4, sz * 0.35), rustMat)
        rust.rotation.x = -Math.PI / 2
        rust.position.set(cx + (rand(gz) - 0.5) * sz * 0.3, 0.008, cz + (rand(gx) - 0.5) * sz * 0.3)
        rust.rotation.z = rand(gx + gz) * 0.5
        root.add(rust)
      }
      gx += sz
    }
    gz += rand(gz) > 0.5 ? 5.5 : 2.8
  }

  // Pipe runs
  for (const [px, pz, len, rotY] of [
    [-8, -5, 22, 0], [10, 8, 18, Math.PI / 2], [0, -12, 16, 0.3],
  ] as [number, number, number, number][]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len, 10), pipeMat)
    pipe.rotation.z = Math.PI / 2
    pipe.rotation.y = rotY
    pipe.position.set(px, 0.14, pz)
    pipe.castShadow = true
    root.add(pipe)
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), pipeMat)
    flange.position.set(px - len / 2 + 0.5, 0.14, pz)
    root.add(flange)
  }

  // Valve wheels
  for (const [vx, vz] of [[-4, -8], [12, 4], [-10, 10]] as [number, number][]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), pipeMat)
    stem.position.set(vx, 0.18, vz)
    root.add(stem)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 16), rustMat)
    wheel.rotation.x = Math.PI / 2
    wheel.position.set(vx, 0.36, vz)
    root.add(wheel)
  }

  // Cable tray channels
  for (const side of [-1, 1]) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, PLAZA_SIZE - ws(6)), new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.5, metalness: 0.7 }))
    tray.position.set(side * 16, 0.04, 0)
    root.add(tray)
    for (let c = -14; c <= 14; c += 4) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.6, metalness: 0.5 }))
      cable.rotation.z = Math.PI / 2
      cable.position.set(side * 16, 0.1, c)
      root.add(cable)
    }
  }

  // Stencil warnings
  for (const [tx, tz, text, col] of [
    [-14, 0, 'HIGH VOLT', '#ff6622'],
    [14, -6, 'STEAM', '#00f6ff'],
    [0, 14, 'NO STEP', '#ffe14d'],
  ] as [number, number, string, string][]) {
    const tex = makeLabelTexture(text, col)
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: parseInt(col.replace('#', ''), 16), emissiveMap: tex, emissiveIntensity: 0.5 })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.5), mat)
    sign.rotation.x = -Math.PI / 2
    sign.position.set(tx, 0.015, tz)
    root.add(sign)
  }

  // Oil leaks
  const oilMat = new THREE.MeshStandardMaterial({
    color: 0x1a1020,
    emissive: 0x553366,
    emissiveIntensity: 0.3,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  })
  for (const [ox, oz, sx, sz] of [[6, -4, 2.5, 1.8], [-7, 7, 3, 2.2], [2, -10, 2, 2.5]] as [number, number, number, number][]) {
    const oil = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), oilMat)
    oil.rotation.x = -Math.PI / 2
    oil.position.set(ox, 0.013, oz)
    root.add(oil)
  }

  addDrainChannel(root, ctx, -PLAZA_HALF + ws(1.3), 0, PLAZA_SIZE - ws(3), Math.PI / 2, NEON_ORANGE, 0.36)
  addDrainChannel(root, ctx, 0, PLAZA_HALF - ws(1.3), PLAZA_SIZE - ws(3), 0, NEON_ORANGE, 0.36)

  return root
}

const BUILDERS: Record<GroundConceptId, (ctx: GroundBuildContext) => THREE.Group> = {
  'grate-deep': buildGrateDeep,
  'grate-cargo': buildGrateCargo,
  'grate-neon-drain': buildGrateNeonDrain,
  'grate-rust-pipe': buildGrateRustPipe,
}

export function buildGroundConcept(id: GroundConceptId, ctx: GroundBuildContext): THREE.Group {
  return BUILDERS[id](ctx)
}

export function conceptByKey(key: string): GroundConceptId | null {
  const n = parseInt(key, 10)
  if (n >= 1 && n <= 4) return GROUND_CONCEPTS[n - 1].id
  return null
}
