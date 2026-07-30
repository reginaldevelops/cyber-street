import * as THREE from 'three'
import type { CityGridContext } from './cityGrid.js'

export const NEON_CYAN = 0x00f6ff
export const NEON_PINK = 0xff2d95
export const NEON_RED = 0xff2244
export const NEON_YELLOW = 0xffe14d
export const NEON_ORANGE = 0xff6622
export const NEON_GREEN = 0x22ff66
export const NEON_BLUE = 0x4488ff
export const NEON_PURPLE = 0xaa66ff
export const WINDOW_WARM = 0xffcc88
export const WINDOW_COOL = 0x88aacc

export interface LotFrame {
  cx: number
  cz: number
  w: number
  d: number
  frontYaw: number
  /** Unit forward (toward street). */
  fx: number
  fz: number
  /** Unit right (along facade). */
  rx: number
  rz: number
  /** Front facade center at building face. */
  frontX: number
  frontZ: number
}

export function lotFrame(cx: number, cz: number, w: number, d: number, frontYaw: number, depthFrac = 0.46): LotFrame {
  const fx = Math.sin(frontYaw)
  const fz = Math.cos(frontYaw)
  const rx = Math.cos(frontYaw)
  const rz = -Math.sin(frontYaw)
  return {
    cx,
    cz,
    w,
    d,
    frontYaw,
    fx,
    fz,
    rx,
    rz,
    frontX: cx + fx * d * depthFrac,
    frontZ: cz + fz * d * depthFrac,
  }
}

export function seeded(seed: number) {
  const v = (Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453) % 1
  return v < 0 ? v + 1 : v
}

export function makeNeonLabel(text: string, color: number, w = 512, h = 128, fontPx = 48): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#08070c'
  g.fillRect(0, 0, w, h)
  const css = `#${color.toString(16).padStart(6, '0')}`
  g.font = `bold ${fontPx}px "Arial Black", Impact, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = css
  g.shadowColor = css
  g.shadowBlur = 16
  g.fillText(text, w / 2, h / 2 + 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

export function addNeonSign(
  root: THREE.Group,
  ctx: CityGridContext,
  label: string,
  color: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  sw: number,
  sh: number,
  seed: number,
  intensity = 1.0,
) {
  const tex = makeNeonLabel(label, color, Math.max(256, Math.floor(sw * 120)), Math.max(64, Math.floor(sh * 120)), sh > 0.7 ? 56 : 40)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: intensity,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  root.add(mesh)
  ctx.flickerMats.push({ mat, base: intensity, t: seed })
  return mesh
}

export function matMetal(color: number, rough = 0.35, metal = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}

export function matPaint(color: number, rough = 0.72) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.12 })
}

export function matGlass(emissive: number, intensity = 0.55) {
  return new THREE.MeshStandardMaterial({
    color: 0x6688aa,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.12,
    metalness: 0.7,
    transparent: true,
    opacity: 0.78,
  })
}

/** Building shell with plinth + optional setback upper. */
export function addBuildingMass(
  root: THREE.Group,
  f: LotFrame,
  opts: {
    h: number
    color: number
    metalness?: number
    upperScale?: number
    upperH?: number
    upperColor?: number
    rounded?: boolean
  },
) {
  const bw = f.w * 0.88
  const bd = f.d * 0.78
  const baseMat = matPaint(opts.color)
  baseMat.metalness = opts.metalness ?? 0.18

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.25, 0.22, bd + 0.2), matMetal(0x2a2830, 0.55, 0.55))
  plinth.position.set(f.cx, 0.11, f.cz)
  root.add(plinth)

  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, opts.h, bd), baseMat)
  body.position.set(f.cx, 0.22 + opts.h / 2, f.cz)
  body.castShadow = true
  body.receiveShadow = true
  root.add(body)

  if (opts.rounded) {
    for (const side of [-1, 1] as const) {
      const end = new THREE.Mesh(
        new THREE.CylinderGeometry(bd / 2, bd / 2, opts.h, 16, 1, false, 0, Math.PI),
        baseMat,
      )
      end.rotation.y = f.frontYaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2)
      end.position.set(f.cx + f.rx * (bw / 2), 0.22 + opts.h / 2, f.cz + f.rz * (bw / 2))
      end.castShadow = true
      root.add(end)
    }
  }

  let topY = 0.22 + opts.h
  if (opts.upperH && opts.upperScale) {
    const uw = bw * opts.upperScale
    const ud = bd * opts.upperScale
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(uw, opts.upperH, ud),
      matPaint(opts.upperColor ?? opts.color),
    )
    upper.position.set(f.cx, topY + opts.upperH / 2, f.cz)
    upper.castShadow = true
    root.add(upper)
    topY += opts.upperH
  }
  return { bw, bd, topY, bodyH: opts.h }
}

/** Horizontal LED accent belt. */
export function addLedBelt(
  root: THREE.Group,
  ctx: CityGridContext,
  f: LotFrame,
  y: number,
  color: number,
  bw: number,
  bd: number,
  seed: number,
) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0.4,
  })
  const belt = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.2, 0.1, bd + 0.18), mat)
  belt.position.set(f.cx, y, f.cz)
  root.add(belt)
  ctx.flickerMats.push({ mat, base: 0.9, t: seed })
}

/** Front window ribbon with frames. */
export function addWindowRibbon(
  root: THREE.Group,
  ctx: CityGridContext,
  f: LotFrame,
  opts: {
    y: number
    count: number
    winW: number
    winH: number
    span: number
    glow?: number
    intensity?: number
    zPush?: number
  },
) {
  const glass = matGlass(opts.glow ?? WINDOW_WARM, opts.intensity ?? 0.55)
  const frame = matMetal(0x3a3844, 0.4, 0.7)
  const zPush = opts.zPush ?? 0.06
  const start = -opts.span / 2 + opts.winW / 2
  for (let i = 0; i < opts.count; i++) {
    const t = opts.count === 1 ? 0 : start + (i / Math.max(1, opts.count - 1)) * (opts.span - opts.winW)
    const x = f.frontX + f.rx * t + f.fx * zPush
    const z = f.frontZ + f.rz * t + f.fz * zPush
    const win = new THREE.Mesh(new THREE.PlaneGeometry(opts.winW * 0.88, opts.winH * 0.88), glass)
    win.position.set(x, opts.y, z)
    win.rotation.y = f.frontYaw
    root.add(win)
    const fr = new THREE.Mesh(new THREE.BoxGeometry(opts.winW, opts.winH, 0.05), frame)
    fr.position.set(x - f.fx * 0.03, opts.y, z - f.fz * 0.03)
    fr.rotation.y = f.frontYaw
    root.add(fr)
  }
  ctx.flickerMats.push({ mat: glass, base: opts.intensity ?? 0.55, t: opts.y })
}

/** Double or single entry door. */
export function addEntryDoors(
  root: THREE.Group,
  ctx: CityGridContext,
  f: LotFrame,
  opts: { y?: number; width?: number; height?: number; color?: number; double?: boolean } = {},
) {
  const h = opts.height ?? 2.2
  const w = opts.width ?? 1.0
  const y = opts.y ?? 0.22 + h / 2
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x1a2838,
    emissive: opts.color ?? NEON_CYAN,
    emissiveIntensity: 0.28,
    roughness: 0.25,
    metalness: 0.65,
    transparent: true,
    opacity: 0.88,
  })
  const doors = opts.double === false ? [0] : [-0.52, 0.52]
  for (const side of doors) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.48, h, 0.08), doorMat)
    door.position.set(f.frontX + f.rx * side * w + f.fx * 0.08, y, f.frontZ + f.rz * side * w + f.fz * 0.08)
    door.rotation.y = f.frontYaw
    root.add(door)
  }
  ctx.flickerMats.push({ mat: doorMat, base: 0.28, t: 1 })
}

export function addCanopy(
  root: THREE.Group,
  ctx: CityGridContext,
  f: LotFrame,
  opts: { y: number; width: number; depth?: number; glow?: number },
) {
  const depth = opts.depth ?? 1.5
  const steel = matMetal(0x6a7078)
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(opts.width, 0.08, depth), steel)
  canopy.position.set(f.frontX + f.fx * (depth / 2 + 0.1), opts.y, f.frontZ + f.fz * (depth / 2 + 0.1))
  canopy.rotation.y = f.frontYaw
  canopy.castShadow = true
  root.add(canopy)

  const glowMat = new THREE.MeshStandardMaterial({
    color: opts.glow ?? NEON_WHITE_SAFE,
    emissive: opts.glow ?? 0xf2f4f8,
    emissiveIntensity: 0.5,
    roughness: 0.4,
  })
  const glow = new THREE.Mesh(new THREE.BoxGeometry(opts.width * 0.92, 0.04, depth * 0.85), glowMat)
  glow.position.copy(canopy.position)
  glow.position.y -= 0.06
  glow.rotation.y = f.frontYaw
  root.add(glow)
  ctx.flickerMats.push({ mat: glowMat, base: 0.5, t: 2 })
}

const NEON_WHITE_SAFE = 0xf2f4f8

/** Small parking apron with stall lines in front of lot (uses front sidewalk strip of lot). */
export function addParkingApron(
  root: THREE.Group,
  f: LotFrame,
  opts: { spots?: number; depth?: number; color?: number } = {},
) {
  const spots = opts.spots ?? 2
  const depth = opts.depth ?? 3.2
  const spotW = Math.min(2.4, (f.w * 0.75) / spots)
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    emissive: 0xf2f2f2,
    emissiveIntensity: 0.08,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(spots * spotW + 0.4, depth),
    new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.9, metalness: 0.1 }),
  )
  asphalt.rotation.x = -Math.PI / 2
  const ax = f.cx + f.fx * (f.d * 0.42)
  const az = f.cz + f.fz * (f.d * 0.42)
  asphalt.position.set(ax, 0.02, az)
  asphalt.rotation.z = -f.frontYaw
  asphalt.receiveShadow = true
  root.add(asphalt)

  for (let i = 0; i < spots; i++) {
    const t = (i - (spots - 1) / 2) * spotW
    const sx = ax + f.rx * t
    const sz = az + f.rz * t
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.06, depth * 0.85), markMat)
    line.rotation.x = -Math.PI / 2
    line.rotation.z = -f.frontYaw
    line.position.set(sx - f.rx * (spotW / 2 - 0.05), 0.025, sz - f.rz * (spotW / 2 - 0.05))
    root.add(line)
  }

  // Charger or bollard accents
  for (let i = 0; i < spots; i++) {
    const t = (i - (spots - 1) / 2) * spotW
    const px = ax + f.rx * t - f.fx * (depth * 0.35)
    const pz = az + f.rz * t - f.fz * (depth * 0.35)
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.1, 0.2),
      matMetal(0x222228, 0.5, 0.6),
    )
    post.position.set(px, 0.55, pz)
    root.add(post)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.28, 0.12),
      new THREE.MeshStandardMaterial({
        color: opts.color ?? NEON_CYAN,
        emissive: opts.color ?? NEON_CYAN,
        emissiveIntensity: 0.55,
      }),
    )
    head.position.set(px, 1.2, pz)
    root.add(head)
  }
}

export function addAwning(
  root: THREE.Group,
  ctx: CityGridContext,
  f: LotFrame,
  opts: { y: number; width: number; depth?: number; color: number },
) {
  const depth = opts.depth ?? 1.3
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color,
    emissive: opts.color,
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
    roughness: 0.55,
  })
  const awning = new THREE.Mesh(new THREE.BoxGeometry(opts.width, 0.06, depth), mat)
  awning.position.set(f.frontX + f.fx * (depth / 2), opts.y, f.frontZ + f.fz * (depth / 2))
  awning.rotation.y = f.frontYaw
  // slight droop
  awning.rotation.x = f.fx * 0.08
  root.add(awning)
  ctx.flickerMats.push({ mat, base: 0.3, t: 3 })
}

export function addRoofAc(root: THREE.Group, f: LotFrame, topY: number, seed: number) {
  const n = 1 + Math.floor(seeded(seed) * 3)
  const mat = matMetal(0x4a5058, 0.45, 0.7)
  for (let i = 0; i < n; i++) {
    const ox = (seeded(seed + i * 3) - 0.5) * f.w * 0.4
    const oz = (seeded(seed + i * 5) - 0.5) * f.d * 0.35
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.55), mat)
    box.position.set(f.cx + ox, topY + 0.25, f.cz + oz)
    root.add(box)
  }
}

export function addLotLight(root: THREE.Group, f: LotFrame, color: number, intensity = 0.45, dist = 12) {
  const light = new THREE.PointLight(color, intensity, dist, 2)
  light.position.set(f.frontX + f.fx * 0.5, 2.4, f.frontZ + f.fz * 0.5)
  root.add(light)
}

export function addCollider(
  root: THREE.Group,
  ctx: CityGridContext,
  f: LotFrame,
  h: number,
  bw = f.w * 0.88,
  bd = f.d * 0.78,
) {
  if (!ctx.colliders) return
  const col = new THREE.Mesh(
    new THREE.BoxGeometry(bw, h, bd),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  col.position.set(f.cx, h / 2, f.cz)
  root.add(col)
  ctx.colliders.push(col)
}
