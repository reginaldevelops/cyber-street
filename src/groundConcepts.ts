import * as THREE from 'three'

export type GroundConceptId = 'neon-grid' | 'broken-nyc' | 'rain-mirror' | 'industrial-grate'

export interface GroundConceptMeta {
  id: GroundConceptId
  agent: string
  name: string
  tagline: string
  pitch: string
}

/** Vier agent-concepten — druk 1–4 in-game om te wisselen. */
export const GROUND_CONCEPTS: GroundConceptMeta[] = [
  {
    id: 'neon-grid',
    agent: 'Agent A',
    name: 'Neon Grid Plaza',
    tagline: 'MMO hub / Tron crossover',
    pitch: 'Donker glas-asfalt met gloeiend raster. Het plein voelt als een online lobby — duidelijke zones, geen rommel.',
  },
  {
    id: 'broken-nyc',
    agent: 'Agent B',
    name: 'Broken NYC Street',
    tagline: 'Vuile Manhattan achtersteeg',
    pitch: 'Gebarsten asfalt, manholes, gele strepen, olievlekken. Rauw en herkenbaar straatgevoel.',
  },
  {
    id: 'rain-mirror',
    agent: 'Agent C',
    name: 'Rain Mirror',
    tagline: 'Film-noir reflectie',
    pitch: 'Extreem nat oppervlak, grote plassen, drainage naar het midden. Neon weerkaatst in het water.',
  },
  {
    id: 'industrial-grate',
    agent: 'Agent D',
    name: 'Industrial Grate Yard',
    tagline: 'Haven / laad-dock',
    pitch: 'Metalen roosters, afvoerkanalen met cyan-onderlicht, waarschuwingsstrepen. Cyber-industrieel.',
  },
]

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622

const PLAZA_HALF = 20
const PLAZA_SIZE = PLAZA_HALF * 2
const STREET_INNER = PLAZA_HALF + 0.5
const STREET_OUTER = PLAZA_HALF + 6.5

export interface GroundBuildContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders: THREE.Mesh[]
  glowTexture: THREE.CanvasTexture
}

function rand(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453
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

function puddle(
  ctx: GroundBuildContext,
  x: number,
  z: number,
  radius: number,
  color: number,
  intensity = 0.2,
  y = 0.025,
) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x080610,
    emissive: color,
    emissiveIntensity: intensity,
    emissiveMap: ctx.glowTexture,
    transparent: true,
    opacity: 0.78,
    roughness: 0.08,
    metalness: 0.92,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, y, z)
  return { mesh, mat, intensity }
}

function plazaPlane(mat: THREE.Material, colliders: THREE.Mesh[]) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA_SIZE, PLAZA_SIZE), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  colliders.push(mesh)
  return mesh
}

function streetRing(mat: THREE.Material) {
  const root = new THREE.Group()
  root.name = 'street-ring'
  const streetW = STREET_OUTER - STREET_INNER
  const mid = (STREET_INNER + STREET_OUTER) / 2
  const sides = ['north', 'south', 'east', 'west'] as const
  for (const side of sides) {
    const len = PLAZA_SIZE + streetW * 2
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(side === 'north' || side === 'south' ? len : streetW, side === 'north' || side === 'south' ? streetW : len),
      mat,
    )
    strip.rotation.x = -Math.PI / 2
    strip.receiveShadow = true
    if (side === 'north') strip.position.set(0, 0.005, -mid)
    else if (side === 'south') strip.position.set(0, 0.005, mid)
    else if (side === 'west') strip.position.set(-mid, 0.005, 0)
    else strip.position.set(mid, 0.005, 0)
    root.add(strip)
  }
  return root
}

// ── Agent A: Neon Grid Plaza ────────────────────────────────────────────────

function buildNeonGrid(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'ground-neon-grid'

  const gridTex = makeCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#0e0c14'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = '#1a2840'
    g.lineWidth = 2
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke()
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke()
    }
    g.strokeStyle = 'rgba(0,246,255,0.35)'
    g.lineWidth = 1.5
    for (let i = 16; i <= 256; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke()
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke()
    }
  }, [5, 5])

  const baseMat = new THREE.MeshStandardMaterial({
    map: gridTex,
    color: 0x14101c,
    roughness: 0.22,
    metalness: 0.72,
  })
  root.add(plazaPlane(baseMat, ctx.colliders))

  const lineMat = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.85,
    roughness: 0.3,
    metalness: 0.4,
  })
  ctx.flickerMats.push({ mat: lineMat, base: 0.85, t: Math.random() * 3 })

  for (const [lx, lz, len, rot] of [
    [0, 0, PLAZA_SIZE - 2, 0], [0, 0, PLAZA_SIZE - 2, Math.PI / 2],
  ] as [number, number, number, number][]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len), lineMat)
    line.rotation.x = -Math.PI / 2
    line.rotation.z = rot
    line.position.set(lx, 0.018, lz)
    root.add(line)
  }

  const hubGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({
      color: NEON_CYAN,
      map: ctx.glowTexture,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  hubGlow.rotation.x = -Math.PI / 2
  hubGlow.position.y = 0.016
  root.add(hubGlow)

  const cornerMat = lineMat.clone()
  cornerMat.color.set(NEON_PINK)
  cornerMat.emissive.set(NEON_PINK)
  for (const [cx, cz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]] as [number, number][]) {
    const corner = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), cornerMat)
    corner.rotation.x = -Math.PI / 2
    corner.position.set(cx, 0.017, cz)
    root.add(corner)
  }
  ctx.flickerMats.push({ mat: cornerMat, base: 0.7, t: Math.random() * 4 })

  const p1 = puddle(ctx, 0, 0, 4, NEON_CYAN, 0.14)
  root.add(p1.mesh)
  ctx.flickerMats.push({ mat: p1.mat, base: p1.intensity, t: Math.random() * 2 })

  const streetMat = new THREE.MeshStandardMaterial({ color: 0x0e0c16, roughness: 0.15, metalness: 0.78 })
  root.add(streetRing(streetMat))
  return root
}

// ── Agent B: Broken NYC Street ──────────────────────────────────────────────

function buildBrokenNyc(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'ground-broken-nyc'

  const asphaltTex = makeCanvasTexture(512, 512, (g) => {
    g.fillStyle = '#1a1818'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = `rgba(30,28,26,${0.3 + rand(i) * 0.5})`
      g.lineWidth = 1 + rand(i + 1) * 2
      g.beginPath()
      g.moveTo(rand(i + 2) * 512, rand(i + 3) * 512)
      for (let s = 0; s < 4; s++) g.lineTo(rand(i + s + 4) * 512, rand(i + s + 5) * 512)
      g.stroke()
    }
    g.fillStyle = 'rgba(40,38,34,0.6)'
    for (let p = 0; p < 18; p++) {
      g.beginPath()
      g.ellipse(rand(p + 10) * 512, rand(p + 11) * 512, 8 + rand(p + 12) * 20, 6 + rand(p + 13) * 14, 0, 0, Math.PI * 2)
      g.fill()
    }
  }, [3, 3])

  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    color: 0x2a2824,
    roughness: 0.88,
    metalness: 0.12,
  })
  root.add(plazaPlane(asphaltMat, ctx.colliders))

  const lineMat = new THREE.MeshStandardMaterial({
    color: NEON_YELLOW,
    emissive: NEON_YELLOW,
    emissiveIntensity: 0.35,
    roughness: 0.6,
    metalness: 0.1,
  })
  for (let i = -16; i <= 16; i += 8) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.14), lineMat)
    dash.rotation.x = -Math.PI / 2
    dash.position.set(i, 0.015, 0)
    root.add(dash)
  }

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x4a4844, roughness: 0.92, metalness: 0.05 })
  const curbW = 0.55
  for (const [bx, bz, rw, rh] of [
    [0, -PLAZA_HALF + curbW / 2, PLAZA_SIZE, curbW],
    [0, PLAZA_HALF - curbW / 2, PLAZA_SIZE, curbW],
    [-PLAZA_HALF + curbW / 2, 0, curbW, PLAZA_SIZE],
    [PLAZA_HALF - curbW / 2, 0, curbW, PLAZA_SIZE],
  ] as [number, number, number, number][]) {
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), curbMat)
    curb.rotation.x = -Math.PI / 2
    curb.position.set(bx, 0.012, bz)
    root.add(curb)
  }

  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x3a3834, roughness: 0.55, metalness: 0.75 })
  for (const [mx, mz] of [[-6, -8], [9, 5], [-11, 12], [7, -12]] as [number, number][]) {
    const mh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), manholeMat)
    mh.rotation.x = -Math.PI / 2
    mh.position.set(mx, 0.02, mz)
    root.add(mh)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 12), manholeMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(mx, 0.021, mz)
    root.add(ring)
  }

  const oilMat = new THREE.MeshStandardMaterial({
    color: 0x1a1420,
    emissive: 0x442266,
    emissiveIntensity: 0.25,
    roughness: 0.15,
    metalness: 0.85,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
  const oil = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.2), oilMat)
  oil.rotation.x = -Math.PI / 2
  oil.position.set(-8, 0.018, 4)
  oil.rotation.z = 0.3
  root.add(oil)

  const p1 = puddle(ctx, 5, -6, 2.5, NEON_PINK, 0.08)
  root.add(p1.mesh)

  const streetMat = new THREE.MeshStandardMaterial({ color: 0x1a1814, roughness: 0.9, metalness: 0.08 })
  root.add(streetRing(streetMat))
  return root
}

// ── Agent C: Rain Mirror ────────────────────────────────────────────────────

function buildRainMirror(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'ground-rain-mirror'

  const mirrorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0812,
    roughness: 0.04,
    metalness: 0.95,
  })
  root.add(plazaPlane(mirrorMat, ctx.colliders))

  for (const [px, pz, r, col, int] of [
    [0, 0, 6, NEON_CYAN, 0.18],
    [-10, 8, 3.5, NEON_PINK, 0.12],
    [12, -5, 4, NEON_CYAN, 0.1],
    [-5, -10, 3, NEON_PINK, 0.11],
    [8, 10, 2.8, NEON_CYAN, 0.09],
  ] as [number, number, number, number, number][]) {
    const p = puddle(ctx, px, pz, r, col, int, 0.022)
    root.add(p.mesh)
    ctx.flickerMats.push({ mat: p.mat, base: int, t: Math.random() * 3 })
  }

  const grooveMat = new THREE.MeshStandardMaterial({
    color: 0x080610,
    roughness: 0.12,
    metalness: 0.88,
  })
  for (let a = 0; a < 4; a++) {
    const groove = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 14), grooveMat)
    groove.rotation.x = -Math.PI / 2
    groove.rotation.z = (a / 4) * Math.PI * 2 + Math.PI / 4
    groove.position.set(0, 0.014, 7)
    groove.rotation.y = (a / 4) * Math.PI * 2
    root.add(groove)
  }

  const rippleMat = new THREE.MeshBasicMaterial({
    color: NEON_CYAN,
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  for (let r = 0; r < 3; r++) {
    const ripple = new THREE.Mesh(new THREE.RingGeometry(1.5 + r * 1.2, 1.7 + r * 1.2, 32), rippleMat)
    ripple.rotation.x = -Math.PI / 2
    ripple.position.set(0, 0.019, 0)
    root.add(ripple)
  }

  const streetMat = new THREE.MeshStandardMaterial({ color: 0x06050c, roughness: 0.06, metalness: 0.92 })
  root.add(streetRing(streetMat))
  return root
}

// ── Agent D: Industrial Grate Yard ──────────────────────────────────────────

function makeGrateTexture() {
  return makeCanvasTexture(128, 128, (g) => {
    g.fillStyle = '#1a1822'
    g.fillRect(0, 0, 128, 128)
    g.strokeStyle = '#3a4050'
    g.lineWidth = 2
    for (let i = 0; i <= 128; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke()
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke()
    }
    g.fillStyle = '#0a0810'
    for (let x = 8; x < 128; x += 16) {
      for (let y = 8; y < 128; y += 16) {
        g.fillRect(x - 3, y - 3, 6, 6)
      }
    }
  }, [4, 4])
}

function buildIndustrialGrate(ctx: GroundBuildContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'ground-industrial-grate'

  const grateTex = makeGrateTexture()
  const grateMat = new THREE.MeshStandardMaterial({
    map: grateTex,
    color: 0x3a4048,
    roughness: 0.35,
    metalness: 0.88,
  })
  const solidMat = new THREE.MeshStandardMaterial({ color: 0x141018, roughness: 0.75, metalness: 0.2 })

  for (let gz = -PLAZA_HALF + 2; gz < PLAZA_HALF; gz += 4) {
    for (let gx = -PLAZA_HALF + 2; gx < PLAZA_HALF; gx += 4) {
      const isGrate = (Math.floor(gx / 4) + Math.floor(gz / 4)) % 2 === 0
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), isGrate ? grateMat : solidMat)
      tile.rotation.x = -Math.PI / 2
      tile.position.set(gx + 1.8, isGrate ? 0.008 : 0.004, gz + 1.8)
      tile.receiveShadow = true
      root.add(tile)
    }
  }

  const mainCollider = new THREE.Mesh(new THREE.PlaneGeometry(PLAZA_SIZE, PLAZA_SIZE), solidMat)
  mainCollider.rotation.x = -Math.PI / 2
  mainCollider.visible = false
  ctx.colliders.push(mainCollider)
  root.add(mainCollider)

  const channelMat = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.5,
  })
  ctx.flickerMats.push({ mat: channelMat, base: 0.55, t: Math.random() * 2 })

  for (const [cx, cz, len, rot] of [
    [0, -PLAZA_HALF + 1.2, PLAZA_SIZE - 4, 0],
    [0, PLAZA_HALF - 1.2, PLAZA_SIZE - 4, 0],
    [-PLAZA_HALF + 1.2, 0, PLAZA_SIZE - 4, Math.PI / 2],
    [PLAZA_HALF - 1.2, 0, PLAZA_SIZE - 4, Math.PI / 2],
  ] as [number, number, number, number][]) {
    const channel = new THREE.Mesh(new THREE.PlaneGeometry(0.35, len), channelMat)
    channel.rotation.x = -Math.PI / 2
    channel.rotation.z = rot
    channel.position.set(cx, 0.016, cz)
    root.add(channel)
  }

  const hazardMat = new THREE.MeshStandardMaterial({
    color: NEON_YELLOW,
    emissive: NEON_ORANGE,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    metalness: 0.2,
  })
  for (let i = -18; i < 18; i += 2) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), hazardMat)
    stripe.rotation.x = -Math.PI / 2
    stripe.position.set(i, 0.017, -PLAZA_HALF + 0.5)
    root.add(stripe)
  }

  const hatchMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.85 })
  for (const [hx, hz] of [[-8, 6], [10, -8], [0, 12]] as [number, number][]) {
    const hatch = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), hatchMat)
    hatch.rotation.x = -Math.PI / 2
    hatch.position.set(hx, 0.019, hz)
    root.add(hatch)
  }

  const streetMat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.4, metalness: 0.7 })
  root.add(streetRing(streetMat))
  return root
}

const BUILDERS: Record<GroundConceptId, (ctx: GroundBuildContext) => THREE.Group> = {
  'neon-grid': buildNeonGrid,
  'broken-nyc': buildBrokenNyc,
  'rain-mirror': buildRainMirror,
  'industrial-grate': buildIndustrialGrate,
}

export function buildGroundConcept(id: GroundConceptId, ctx: GroundBuildContext): THREE.Group {
  return BUILDERS[id](ctx)
}

export function conceptIndex(id: GroundConceptId): number {
  return GROUND_CONCEPTS.findIndex((c) => c.id === id)
}

export function conceptByKey(key: string): GroundConceptId | null {
  const n = parseInt(key, 10)
  if (n >= 1 && n <= 4) return GROUND_CONCEPTS[n - 1].id
  return null
}

export { PLAZA_SIZE, PLAZA_HALF }
