import * as THREE from 'three'
import { attachRooftopDetails } from './rooftops.js'

// ── Palette (purple-grey cyber-industrial) ────────────────────────────────
export const PLAZA_HALF = 20
const PLAZA_SIZE = PLAZA_HALF * 2

const WALL_DARK = 0x1a1624
const WALL_MID = 0x2a2436
const WALL_TRIM = 0x3a3448
const SKYLINE_SIL = 0x120e1a
const STREET_DARK = 0x121018
const STREET_WET = 0x0e0c14
const METAL = 0x4a5058
const PIPE = 0x3a3844
const GRATE = 0x2a2830

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const NEON_YELLOW = 0xffe14d
const NEON_ORANGE = 0xff6622
const WINDOW_WARM = 0xffcc66
const WINDOW_COOL = 0x88aaff
const WINDOW_PINK = 0xff8866
const BRICK_RED = 0x4a2828
const BRICK_TAN = 0x3a3428
const BRICK_GREY = 0x323038
const BRICK_ACCENT = [BRICK_RED, BRICK_TAN, BRICK_GREY, WALL_MID] as const

const SHOP_INSET = PLAZA_HALF - 1.5 // 18.5 — matches game.ts courtyard shops
const STREET_INNER = PLAZA_HALF + 0.5 // 20.5 — just outside plaza trim
const STREET_OUTER = PLAZA_HALF + 6.5 // 26.5 — outer curb
const PERIM_INNER = PLAZA_HALF + 7 // 27 — back of street
const PERIM_OUTER = PLAZA_HALF + 13 // 33 — facade outer face
const SKYLINE_NEAR = PLAZA_HALF + 16 // 36
const SKYLINE_FAR = PLAZA_HALF + 38 // 58

export interface CitySurroundContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  /** Optional colliders for backdrop geometry (not skyline). */
  colliders?: THREE.Mesh[]
}

export interface CitySurroundStats {
  meshCount: number
  instancedMeshCount: number
  instanceCount: number
}

// ── Shared materials (lazy singleton per scene build) ─────────────────────
let _mats: {
  wall: THREE.MeshStandardMaterial
  wallDark: THREE.MeshStandardMaterial
  trim: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  pipe: THREE.MeshStandardMaterial
  window: THREE.MeshStandardMaterial
  walkway: THREE.MeshStandardMaterial
  cable: THREE.MeshBasicMaterial
} | null = null

function mats() {
  if (!_mats) {
    _mats = {
      wall: new THREE.MeshStandardMaterial({ color: WALL_MID, roughness: 0.78, metalness: 0.14 }),
      wallDark: new THREE.MeshStandardMaterial({ color: WALL_DARK, roughness: 0.82, metalness: 0.1 }),
      trim: new THREE.MeshStandardMaterial({ color: WALL_TRIM, roughness: 0.55, metalness: 0.35 }),
      metal: new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.38, metalness: 0.82 }),
      pipe: new THREE.MeshStandardMaterial({ color: PIPE, roughness: 0.45, metalness: 0.55 }),
      window: new THREE.MeshStandardMaterial({
        color: WINDOW_WARM,
        emissive: WINDOW_WARM,
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.2,
      }),
      walkway: new THREE.MeshStandardMaterial({ color: 0x2a2834, roughness: 0.6, metalness: 0.45 }),
      cable: new THREE.MeshBasicMaterial({ color: 0x554466 }),
    }
  }
  return _mats
}

function seededRand(seed: number) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Readable storefront sign texture — Agent 2 building labels. */
export function makeStoreSignTexture(label: string, hexColor: number, sub = ''): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = sub ? 96 : 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0c0a10'
  ctx.fillRect(0, 0, c.width, c.height)
  const css = `#${hexColor.toString(16).padStart(6, '0')}`
  ctx.font = 'bold 28px Courier New, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = css
  ctx.shadowColor = css
  ctx.shadowBlur = 12
  ctx.fillText(label, 128, sub ? 28 : 32)
  if (sub) {
    ctx.font = '16px Courier New, monospace'
    ctx.globalAlpha = 0.75
    ctx.fillText(sub, 128, 62)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

/** Procedural abstract kanji-like vertical neon glyph strip. */
export function makeKanjiNeonTexture(hexColor: number, variant = 0): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#080610'
  ctx.fillRect(0, 0, 128, 512)

  const css = `#${hexColor.toString(16).padStart(6, '0')}`
  ctx.strokeStyle = css
  ctx.shadowColor = css
  ctx.shadowBlur = 18
  ctx.lineWidth = 5
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  const strokes: [number, number, number, number][] = [
    [64, 40, 64, 120],
    [40, 80, 88, 80],
    [48, 140, 80, 200],
    [64, 200, 64, 280],
    [36, 240, 92, 240],
    [52, 300, 76, 380],
    [64, 380, 64, 470],
    [32, 420, 96, 420],
  ]
  const offset = variant * 17
  for (let i = 0; i < strokes.length; i++) {
    if (seededRand(variant * 31 + i) < 0.25) continue
    const s = strokes[(i + offset) % strokes.length]
    ctx.beginPath()
    ctx.moveTo(s[0] + (seededRand(i) - 0.5) * 8, s[1])
    ctx.lineTo(s[2] + (seededRand(i + 7) - 0.5) * 8, s[3])
    ctx.stroke()
  }
  // Horizontal scan flicker bands
  ctx.globalAlpha = 0.15
  ctx.fillStyle = css
  for (let b = 0; b < 6; b++) {
    ctx.fillRect(0, 60 + b * 72 + variant * 11, 128, 3)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

type Side = 'north' | 'south' | 'east' | 'west'

interface FacadeSlot {
  u: number // position along side axis
  width: number
  height: number
  depth: number
  isFullBlock: boolean
  side: Side
}

/** Placement rules for pipes / AC / vents on a facade segment. */
function attachFacadeDetails(
  ctx: CitySurroundContext,
  slot: FacadeSlot,
  group: THREE.Group,
  seed: number,
) {
  const m = mats()
  const { side, u, width, height } = slot
  const baseY = height * 0.35

  // Horizontal pipe runs — every 2nd–3rd segment
  if (seededRand(seed) > 0.35) {
    const pipeLen = width * 0.85
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, pipeLen, 6), m.pipe)
    pipe.rotation.z = Math.PI / 2
    if (side === 'north' || side === 'south') pipe.rotation.y = Math.PI / 2
    pipe.position.set(0, baseY + seededRand(seed + 1) * height * 0.35, 0.18)
    group.add(pipe)
  }

  // AC units — top third, staggered
  if (seededRand(seed + 2) > 0.45) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.42), m.metal)
    ac.position.set(
      (seededRand(seed + 3) - 0.5) * width * 0.5,
      height * 0.72,
      0.28,
    )
    group.add(ac)
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.08), m.trim)
    vent.position.copy(ac.position)
    vent.position.y += 0.18
    group.add(vent)
  }

  // Vertical cable bundle
  if (seededRand(seed + 4) > 0.5) {
    const cableH = height * 0.55
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.04, cableH, 0.04), m.cable)
    cable.position.set(width * 0.38, cableH * 0.5, 0.22)
    group.add(cable)
  }

  // Steam vent grille
  if (seededRand(seed + 5) > 0.6) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), m.trim)
    grate.position.set(-width * 0.25, 1.2, 0.2)
    group.add(grate)
  }
}

function sideTransform(side: Side, u: number, depthCenter: number): { x: number; z: number; rotY: number } {
  switch (side) {
    case 'north':
      return { x: u, z: -depthCenter, rotY: 0 }
    case 'south':
      return { x: u, z: depthCenter, rotY: Math.PI }
    case 'west':
      return { x: -depthCenter, z: u, rotY: Math.PI / 2 }
    case 'east':
      return { x: depthCenter, z: u, rotY: -Math.PI / 2 }
  }
}

/**
 * 1. Perimeter wall buildings — flat inward facades + shallow 3D blocks.
 * Heights 6–14u, fills gaps behind shop row on all 4 sides.
 */
export function buildPerimeterCity(ctx: CitySurroundContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'perimeter-city'
  const m = mats()
  const depthCenter = (PERIM_INNER + PERIM_OUTER) / 2
  const depthSpan = PERIM_OUTER - PERIM_INNER

  const sides: Side[] = ['north', 'south', 'east', 'west']
  const gapForShops = 8.5 // leave room for existing shop/corner volumes at ±18.5

  for (const side of sides) {
    const spans: [number, number][] = []
    const axisMin = -PLAZA_HALF + 4
    const axisMax = PLAZA_HALF - 4

    // Split around corner blocks & shop bays
    if (side === 'north' || side === 'south') {
      spans.push([axisMin, -gapForShops], [-gapForShops + 1, gapForShops - 1], [gapForShops, axisMax])
    } else {
      spans.push([axisMin, -12], [-8, 8], [12, axisMax])
    }

    let segIdx = 0
    for (const [a0, a1] of spans) {
      const len = a1 - a0
      if (len < 3) continue
      const segW = len / Math.ceil(len / 5.5)
      for (let u = a0 + segW / 2; u < a1; u += segW) {
        const w = Math.min(segW * 0.92, a1 - a0)
        const height = 6 + seededRand(side.charCodeAt(0) * 17 + segIdx) * 8
        const isFullBlock = seededRand(segIdx + 99) > 0.72
        const { x, z, rotY } = sideTransform(side, u, depthCenter)

        const block = new THREE.Group()
        block.position.set(x, 0, z)
        block.rotation.y = rotY

        if (isFullBlock) {
          const brickColor = BRICK_ACCENT[segIdx % BRICK_ACCENT.length]
          const bodyMat = m.wallDark.clone()
          bodyMat.color.set(brickColor)
          const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, depthSpan), bodyMat)
          body.position.y = height / 2
          body.castShadow = true
          body.receiveShadow = true
          block.add(body)
          ctx.colliders?.push(body)
        } else {
          const brickColor = BRICK_ACCENT[(segIdx + 1) % BRICK_ACCENT.length]
          const facadeMat = m.wall.clone()
          facadeMat.color.set(brickColor)
          const facade = new THREE.Mesh(new THREE.BoxGeometry(w, height, 0.35), facadeMat)
          facade.position.set(0, height / 2, -depthSpan / 2 + 0.2)
          facade.castShadow = true
          block.add(facade)
          const capL = new THREE.Mesh(new THREE.BoxGeometry(0.25, height, depthSpan * 0.6), m.wallDark)
          capL.position.set(-w / 2 + 0.12, height / 2, 0)
          block.add(capL)
          const capR = capL.clone()
          capR.position.x = w / 2 - 0.12
          block.add(capR)
        }

        // Brick banding / water stain
        if (seededRand(segIdx + 50) > 0.4) {
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.92, 0.12, 0.04),
            new THREE.MeshStandardMaterial({ color: 0x1a1618, roughness: 0.9, metalness: 0.05 }),
          )
          band.position.set(0, height * 0.28, -depthSpan / 2 + 0.24)
          block.add(band)
        }

        // Window strip (instanced later per segment — here 2–4 emissive planes)
        const winCount = 2 + Math.floor(seededRand(segIdx) * 3)
        const winColors = [WINDOW_WARM, WINDOW_COOL, WINDOW_PINK]
        for (let wi = 0; wi < winCount; wi++) {
          const winMat = m.window.clone()
          winMat.color.set(winColors[wi % 3])
          winMat.emissive.set(winColors[wi % 3])
          winMat.emissiveIntensity = 0.4 + seededRand(segIdx + wi) * 0.5
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), winMat)
          const wx = (wi - (winCount - 1) / 2) * (w / (winCount + 1))
          win.position.set(wx, height * (0.45 + (wi % 2) * 0.22), -depthSpan / 2 + 0.22)
          block.add(win)
          ctx.flickerMats.push({ mat: winMat, base: winMat.emissiveIntensity, t: Math.random() * 4 })
        }

        attachFacadeDetails(ctx, { u, width: w, height, depth: depthSpan, isFullBlock, side }, block, segIdx * 13)

        // Purpose sign on every 2nd segment — Agent 2
        const storeLabels = ['DELI', 'PAWN', 'REPAIR', 'NOODLES', 'PHARM', 'LOCKS', 'DATA', 'PRINT']
        const storeColors = [NEON_ORANGE, NEON_YELLOW, NEON_CYAN, NEON_PINK, 0x44ff88, NEON_CYAN, 0x9a86ff, NEON_YELLOW]
        if (segIdx % 2 === 0) {
          const li = segIdx % storeLabels.length
          const tex = makeStoreSignTexture(storeLabels[li], storeColors[li], 'OPEN 24H')
          const signMat = new THREE.MeshStandardMaterial({
            map: tex,
            emissive: storeColors[li],
            emissiveMap: tex,
            emissiveIntensity: 0.75,
            roughness: 0.4,
            metalness: 0.2,
          })
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.75, 2.8), 0.55), signMat)
          sign.position.set(0, height * 0.78, -depthSpan / 2 + 0.26)
          block.add(sign)
          ctx.flickerMats.push({ mat: signMat, base: 0.75, t: Math.random() * 4 })
        }

        attachRooftopDetails(block, w, height, depthSpan, segIdx * 7 + side.charCodeAt(0))
        root.add(block)
        segIdx++
      }
    }
  }

  ctx.scene.add(root)
  return root
}

/**
 * 2. Background skyline — 3 depth layers of dark silhouettes + instanced glowing windows.
 */
export function buildSkylineBackdrop(ctx: CitySurroundContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'skyline-backdrop'
  const silMat = new THREE.MeshBasicMaterial({ color: SKYLINE_SIL })

  const layers = [
    { zOff: SKYLINE_NEAR, count: 7, hMin: 14, hMax: 28, wMin: 3, wMax: 7 },
    { zOff: SKYLINE_NEAR + 10, count: 9, hMin: 20, hMax: 42, wMin: 2.5, wMax: 6 },
    { zOff: SKYLINE_FAR, count: 11, hMin: 28, hMax: 58, wMin: 2, wMax: 5 },
  ]

  const windowGeo = new THREE.PlaneGeometry(0.45, 0.65)
  const windowMats = [
    new THREE.MeshStandardMaterial({ color: WINDOW_WARM, emissive: WINDOW_WARM, emissiveIntensity: 0.5 }),
    new THREE.MeshStandardMaterial({ color: WINDOW_COOL, emissive: WINDOW_COOL, emissiveIntensity: 0.45 }),
    new THREE.MeshStandardMaterial({ color: WINDOW_PINK, emissive: WINDOW_PINK, emissiveIntensity: 0.4 }),
  ]

  for (const layer of layers) {
    for (let ring = 0; ring < 4; ring++) {
      const side = ring as 0 | 1 | 2 | 3
      const alongMin = -PLAZA_HALF - 8
      const alongMax = PLAZA_HALF + 8
      const step = (alongMax - alongMin) / layer.count

      for (let i = 0; i < layer.count; i++) {
        const h = layer.hMin + seededRand(layer.zOff + i + ring * 100) * (layer.hMax - layer.hMin)
        const w = layer.wMin + seededRand(i * 7 + ring) * (layer.wMax - layer.wMin)
        const u = alongMin + i * step + step * 0.5

        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.85), silMat)
        tower.castShadow = false
        tower.receiveShadow = false

        if (side === 0) tower.position.set(u, h / 2, -layer.zOff)
        else if (side === 1) tower.position.set(u, h / 2, layer.zOff)
        else if (side === 2) tower.position.set(-layer.zOff, h / 2, u)
        else tower.position.set(layer.zOff, h / 2, u)

        root.add(tower)

        // Agent 4 — setbacks, spires, accent bands
        if (seededRand(i + ring + layer.zOff) > 0.35) {
          const setH = h * (0.22 + seededRand(i) * 0.18)
          const setW = w * 0.72
          const setback = new THREE.Mesh(new THREE.BoxGeometry(setW, setH, setW * 0.8), silMat)
          setback.position.copy(tower.position)
          setback.position.y = h + setH / 2
          root.add(setback)

          if (seededRand(i + 11) > 0.5) {
            const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 2.5 + seededRand(i) * 4, 6), silMat)
            spire.position.set(setback.position.x, setback.position.y + setH / 2 + 1.2, setback.position.z)
            root.add(spire)
            const beacon = new THREE.Mesh(
              new THREE.SphereGeometry(0.12, 6, 6),
              new THREE.MeshStandardMaterial({
                color: i % 2 ? NEON_PINK : NEON_CYAN,
                emissive: i % 2 ? NEON_PINK : NEON_CYAN,
                emissiveIntensity: 1.2,
              }),
            )
            beacon.position.copy(spire.position)
            beacon.position.y += 1.4 + seededRand(i) * 2
            root.add(beacon)
            ctx.flickerMats.push({ mat: beacon.material as THREE.MeshStandardMaterial, base: 1.2, t: Math.random() * 3 })
          }
        }

        // Horizontal accent band — lit office floor
        if (seededRand(i + 33) > 0.45) {
          const bandY = h * (0.55 + seededRand(i + 5) * 0.25)
          const bandColor = [NEON_CYAN, NEON_PINK, NEON_YELLOW][i % 3]
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(w * 1.02, 0.18, w * 0.88),
            new THREE.MeshStandardMaterial({
              color: bandColor,
              emissive: bandColor,
              emissiveIntensity: 0.35,
              transparent: true,
              opacity: 0.55,
            }),
          )
          band.position.copy(tower.position)
          band.position.y = bandY
          root.add(band)
        }

        // Rooftop billboard silhouette
        if (seededRand(i + 77) > 0.72 && layer.zOff >= SKYLINE_NEAR) {
          const board = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.12, 0.08), silMat)
          board.position.copy(tower.position)
          board.position.y = h + 0.4
          root.add(board)
          const adColor = [NEON_PINK, NEON_CYAN, NEON_ORANGE][i % 3]
          const ad = new THREE.Mesh(
            new THREE.PlaneGeometry(w * 0.75, h * 0.08),
            new THREE.MeshStandardMaterial({
              color: adColor,
              emissive: adColor,
              emissiveIntensity: 0.5,
              transparent: true,
              opacity: 0.65,
            }),
          )
          ad.position.copy(board.position)
          ad.position.z += w * 0.44
          if (side === 1) ad.rotation.y = Math.PI
          else if (side === 2) ad.rotation.y = Math.PI / 2
          else if (side === 3) ad.rotation.y = -Math.PI / 2
          root.add(ad)
        }

        // Instanced windows on plaza-facing face
        const rows = 2 + Math.floor(h / 8)
        const cols = Math.max(1, Math.floor(w / 1.1))
        const total = rows * cols
        const wMat = windowMats[(i + ring) % 3]
        const winGroup = new THREE.Group()
        winGroup.position.copy(tower.position)
        const inst = new THREE.InstancedMesh(windowGeo, wMat, total)
        inst.castShadow = false
        const dummy = new THREE.Object3D()
        let idx = 0
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (seededRand(idx + i) < 0.28) continue // dark units
            dummy.position.set(
              (c - (cols - 1) / 2) * 0.95,
              2 + r * (h - 3) / rows,
              w * 0.43 + 0.02,
            )
            if (side === 1) dummy.rotation.y = Math.PI
            else if (side === 2) dummy.rotation.y = Math.PI / 2
            else if (side === 3) dummy.rotation.y = -Math.PI / 2
            dummy.updateMatrix()
            inst.setMatrixAt(idx, dummy.matrix)
            idx++
          }
        }
        inst.count = idx
        inst.instanceMatrix.needsUpdate = true
        winGroup.add(inst)
        root.add(winGroup)
        ctx.flickerMats.push({ mat: wMat, base: wMat.emissiveIntensity, t: Math.random() * 5 })
      }
    }
  }

  ctx.scene.add(root)
  return root
}

/**
 * 3. Massive vertical neon sign boards — procedural kanji canvas, pink/cyan dominant.
 */
export function buildVerticalNeonSigns(ctx: CitySurroundContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'vertical-neon-signs'

  const signSpots: [Side, number, number, number][] = [
    ['north', -14, 0, NEON_PINK],
    ['south', 14, 0, NEON_CYAN],
  ]

  for (const [side, u, variant, color] of signSpots) {
    const depthCenter = (PERIM_INNER + PERIM_OUTER) / 2 - 0.5
    const { x, z, rotY } = sideTransform(side, u, depthCenter)
    const signH = 9 + variant * 1.5
    const signW = 1.4

    const tex = makeKanjiNeonTexture(color, variant)
    const signMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: color,
      emissiveMap: tex,
      emissiveIntensity: 1.1,
      roughness: 0.35,
      metalness: 0.2,
      transparent: true,
      side: THREE.DoubleSide,
    })

    const board = new THREE.Group()
    board.position.set(x, 0, z)
    board.rotation.y = rotY

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat)
    sign.position.set(0, signH / 2 + 2.5, -((PERIM_OUTER - PERIM_INNER) / 2) + 0.15)
    board.add(sign)

    // Mount frame + glow backing
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(signW + 0.2, signH + 0.25, 0.08),
      mats().trim,
    )
    frame.position.copy(sign.position)
    frame.position.z -= 0.06
    board.add(frame)

    ctx.flickerMats.push({ mat: signMat, base: 1.1, t: Math.random() * 3 })
    root.add(board)
  }

  ctx.scene.add(root)
  return root
}

/**
 * 4. Street extensions — dark wet ring beyond plaza, grates, steam particle vents.
 */
export function buildStreetExtensions(ctx: CitySurroundContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'street-extensions'
  const m = mats()

  const streetW = STREET_OUTER - STREET_INNER
  const stripMat = new THREE.MeshStandardMaterial({
    color: STREET_DARK,
    roughness: 0.22,
    metalness: 0.55,
  })
  const wetMat = new THREE.MeshStandardMaterial({
    color: STREET_WET,
    roughness: 0.08,
    metalness: 0.72,
  })

  const sides: Side[] = ['north', 'south', 'east', 'west']
  for (const side of sides) {
    const len = PLAZA_SIZE + streetW * 2
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(side === 'north' || side === 'south' ? len : streetW, side === 'north' || side === 'south' ? streetW : len),
      stripMat,
    )
    strip.rotation.x = -Math.PI / 2
    strip.receiveShadow = true

    const mid = (STREET_INNER + STREET_OUTER) / 2
    if (side === 'north') strip.position.set(0, 0.008, -mid)
    else if (side === 'south') strip.position.set(0, 0.008, mid)
    else if (side === 'west') strip.position.set(-mid, 0.008, 0)
    else strip.position.set(mid, 0.008, 0)
    root.add(strip)

    // Wet reflection lane center
    const wet = strip.clone()
    wet.material = wetMat
    wet.scale.set(0.35, 0.35, 1)
    root.add(wet)
  }

  // Corner fillets
  const corners: [number, number][] = [
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ]
  for (const [cx, cz] of corners) {
    const corner = new THREE.Mesh(new THREE.PlaneGeometry(streetW, streetW), stripMat)
    corner.rotation.x = -Math.PI / 2
    corner.position.set(cx * (PLAZA_HALF + streetW / 2), 0.007, cz * (PLAZA_HALF + streetW / 2))
    corner.receiveShadow = true
    root.add(corner)
  }

  // Instanced grates + steam vents along streets
  const grateGeo = new THREE.BoxGeometry(0.9, 0.04, 0.9)
  const grateMat = new THREE.MeshStandardMaterial({ color: GRATE, roughness: 0.7, metalness: 0.5 })
  const grateCount = 24
  const grates = new THREE.InstancedMesh(grateGeo, grateMat, grateCount)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < grateCount; i++) {
    const side = i % 4
    const t = -PLAZA_HALF + 4 + (i / 4) * 7
    const mid = (STREET_INNER + STREET_OUTER) / 2
    if (side === 0) dummy.position.set(t, 0.03, -mid)
    else if (side === 1) dummy.position.set(t, 0.03, mid)
    else if (side === 2) dummy.position.set(-mid, 0.03, t)
    else dummy.position.set(mid, 0.03, t)
    dummy.updateMatrix()
    grates.setMatrixAt(i, dummy.matrix)
  }
  grates.instanceMatrix.needsUpdate = true
  root.add(grates)

  // Steam vents — simple additive planes, animated in game loop if desired
  const steamMat = new THREE.MeshBasicMaterial({
    color: 0x8899aa,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const steamSpots: [number, number][] = [
    [-16, -23], [8, -23], [18, 23], [-10, 23], [-23, 6], [23, -8],
  ]
  for (const [sx, sz] of steamSpots) {
    const puff = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), steamMat)
    puff.position.set(sx, 0.8, sz)
    puff.rotation.y = Math.random() * Math.PI
    root.add(puff)
  }

  ctx.scene.add(root)
  return root
}

/**
 * 6. Second-story walkways bridging buildings above the shop row.
 */
export function buildElevatedWalkways(ctx: CitySurroundContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'elevated-walkways'
  const m = mats()
  const walkY = 5.6
  const walkW = 1.35
  const walkDepth = 1.1
  const zNorth = -SHOP_INSET - 3.2
  const zSouth = SHOP_INSET + 3.2

  const bridges: [number, number, number, number][] = [
    [-14, zNorth, 10, 0],
    [4, zNorth, 8, 0],
    [-6, zSouth, 12, Math.PI],
    [12, zSouth, 9, Math.PI],
    [-18.5, -6, 7, Math.PI / 2],
    [18.5, 8, 6, -Math.PI / 2],
  ]

  for (const [x, z, len, rot] of bridges) {
    const g = new THREE.Group()
    g.position.set(x, walkY, z)
    g.rotation.y = rot

    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, walkDepth), m.walkway)
    deck.castShadow = true
    g.add(deck)

    // Railings — instanced posts
    const railGeo = new THREE.BoxGeometry(0.06, 0.55, 0.06)
    const railMat = m.metal
    const postCount = Math.floor(len / 1.8) * 2
    const rails = new THREE.InstancedMesh(railGeo, railMat, postCount)
    let pi = 0
    for (let p = -len / 2 + 0.4; p < len / 2; p += 1.8) {
      for (const side of [-1, 1]) {
        _dummy.position.set(p, -0.28, side === 1 ? walkDepth - 0.35 : -0.35)
        _dummy.updateMatrix()
        rails.setMatrixAt(pi, _dummy.matrix)
        pi++
      }
    }
    rails.count = pi
    rails.instanceMatrix.needsUpdate = true
    g.add(rails)

    // Underneath cable runs
    const cable = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.05, 0.05), m.cable)
    cable.position.set(0, -0.35, walkDepth / 2)
    g.add(cable)

    root.add(g)
  }

  ctx.scene.add(root)
  return root
}

const _dummy = new THREE.Object3D()

/** Slim wet street ring — grounds the plaza without clutter. */
function buildStreetRing(ctx: CitySurroundContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'street-ring'
  const stripMat = new THREE.MeshStandardMaterial({ color: STREET_DARK, roughness: 0.18, metalness: 0.62 })
  const streetW = STREET_OUTER - STREET_INNER
  const mid = (STREET_INNER + STREET_OUTER) / 2
  const sides: Side[] = ['north', 'south', 'east', 'west']
  for (const side of sides) {
    const len = PLAZA_SIZE + streetW * 2
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(side === 'north' || side === 'south' ? len : streetW, side === 'north' || side === 'south' ? streetW : len),
      stripMat,
    )
    strip.rotation.x = -Math.PI / 2
    strip.receiveShadow = true
    if (side === 'north') strip.position.set(0, 0.006, -mid)
    else if (side === 'south') strip.position.set(0, 0.006, mid)
    else if (side === 'west') strip.position.set(-mid, 0.006, 0)
    else strip.position.set(mid, 0.006, 0)
    root.add(strip)
  }
  ctx.scene.add(root)
  return root
}

/** Master builder — all surround systems + stats for budget tracking. */
export function buildCitySurround(ctx: CitySurroundContext): CitySurroundStats {
  buildStreetRing(ctx)
  buildPerimeterCity(ctx)
  buildVerticalNeonSigns(ctx)
  buildSkylineBackdrop(ctx)

  let meshCount = 0
  let instancedMeshCount = 0
  let instanceCount = 0
  ctx.scene.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      instancedMeshCount++
      instanceCount += obj.count
    } else if (obj instanceof THREE.Mesh) {
      meshCount++
    }
  })
  return { meshCount, instancedMeshCount, instanceCount }
}
