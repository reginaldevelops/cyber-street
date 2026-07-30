import * as THREE from 'three'
import { STREET_OUTER } from './worldConfig.js'
import { makeNeonLabel } from './buildingKit.js'

/** Rough flat-under-construction lot west of the plaza. */
export const SITE_MIN_X = -54
export const SITE_MAX_X = -STREET_OUTER - 1.2
export const SITE_MIN_Z = -22
export const SITE_MAX_Z = 22

export interface ConstructionSiteContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function seeded(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

export function overlapsConstructionSite(minX: number, maxX: number, minZ: number, maxZ: number) {
  return maxX > SITE_MIN_X && minX < SITE_MAX_X && maxZ > SITE_MIN_Z && minZ < SITE_MAX_Z
}

function addSign(
  root: THREE.Group,
  ctx: ConstructionSiteContext,
  text: string,
  color: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  w: number,
  h: number,
  fontPx = 42,
) {
  const tex = makeNeonLabel(text, color, 512, 128, fontPx)
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: color,
    emissiveMap: tex,
    emissiveIntensity: 0.6,
    roughness: 0.65,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  root.add(mesh)
  ctx.flickerMats.push({ mat, base: 0.6, t: Math.random() * 2 })
}

/**
 * Gritty construction yard: sand, temporary fencing, incomplete tower carcass,
 * STOP / NO ACCESS signage, cones and material piles.
 */
export function buildConstructionSite(ctx: ConstructionSiteContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'construction-site'

  const cx = (SITE_MIN_X + SITE_MAX_X) / 2
  const cz = (SITE_MIN_Z + SITE_MAX_Z) / 2
  const w = SITE_MAX_X - SITE_MIN_X
  const d = SITE_MAX_Z - SITE_MIN_Z

  const sand = new THREE.MeshStandardMaterial({ color: 0xc2a86a, roughness: 1, metalness: 0.02 })
  const sandDark = new THREE.MeshStandardMaterial({ color: 0xa89058, roughness: 1, metalness: 0.02 })
  const dirt = new THREE.MeshStandardMaterial({ color: 0x6a5438, roughness: 0.95, metalness: 0.05 })
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.9, metalness: 0.1 })
  const rebar = new THREE.MeshStandardMaterial({ color: 0x6a4030, roughness: 0.55, metalness: 0.65 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.45, metalness: 0.8 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.85, metalness: 0.08 })
  const orange = new THREE.MeshStandardMaterial({
    color: 0xe85d04,
    emissive: 0xe85d04,
    emissiveIntensity: 0.25,
    roughness: 0.7,
  })
  const warning = new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    emissive: 0xffaa00,
    emissiveIntensity: 0.35,
    roughness: 0.55,
  })

  const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), sand)
  pad.position.set(cx, 0.05, cz)
  pad.receiveShadow = true
  root.add(pad)

  for (let i = 0; i < 14; i++) {
    const pw = 2.2 + seeded(i) * 3.5
    const pd = 1.8 + seeded(i + 3) * 3.0
    const patch = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.08, pd), i % 3 === 0 ? dirt : sandDark)
    patch.position.set(
      SITE_MIN_X + 2 + seeded(i + 7) * (w - 4),
      0.12,
      SITE_MIN_Z + 2 + seeded(i + 11) * (d - 4),
    )
    patch.rotation.y = seeded(i + 13) * 0.6
    root.add(patch)
  }

  const fenceH = 2.4
  const postGap = 2.6
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x3a3e46,
    roughness: 0.55,
    metalness: 0.55,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  })

  const edges: { x0: number; z0: number; x1: number; z1: number }[] = [
    { x0: SITE_MIN_X, z0: SITE_MIN_Z, x1: SITE_MAX_X, z1: SITE_MIN_Z },
    { x0: SITE_MIN_X, z0: SITE_MAX_Z, x1: SITE_MAX_X, z1: SITE_MAX_Z },
    { x0: SITE_MIN_X, z0: SITE_MIN_Z, x1: SITE_MIN_X, z1: SITE_MAX_Z },
    { x0: SITE_MAX_X, z0: SITE_MIN_Z, x1: SITE_MAX_X, z1: SITE_MAX_Z },
  ]

  for (const e of edges) {
    const dx = e.x1 - e.x0
    const dz = e.z1 - e.z0
    const len = Math.hypot(dx, dz)
    const count = Math.max(2, Math.floor(len / postGap))
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, fenceH, 0.12), steel)
      post.position.set(e.x0 + dx * t, fenceH / 2, e.z0 + dz * t)
      post.castShadow = true
      root.add(post)
    }
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, fenceH * 0.85), fenceMat)
    panel.position.set((e.x0 + e.x1) / 2, fenceH * 0.5, (e.z0 + e.z1) / 2)
    if (Math.abs(dz) > Math.abs(dx)) panel.rotation.y = Math.PI / 2
    root.add(panel)

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(dx) > 0.1 ? len : 0.14, 0.12, Math.abs(dz) > 0.1 ? len : 0.14),
      warning,
    )
    rail.position.set((e.x0 + e.x1) / 2, fenceH + 0.05, (e.z0 + e.z1) / 2)
    root.add(rail)
  }

  const gateZ = cz
  const facePlaza = -Math.PI / 2

  const stopPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), steel)
  stopPole.position.set(SITE_MAX_X + 0.2, 1.1, gateZ - 3.5)
  root.add(stopPole)
  addSign(root, ctx, 'STOP', 0xff2222, SITE_MAX_X + 0.28, 1.55, gateZ - 3.5, facePlaza, 1.5, 0.7, 56)

  const accessBoard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 2.6), wood)
  accessBoard.position.set(SITE_MAX_X + 0.08, 1.3, gateZ + 3.2)
  root.add(accessBoard)
  addSign(root, ctx, 'NO ACCESS', 0xffcc00, SITE_MAX_X + 0.28, 1.35, gateZ + 3.2, facePlaza, 2.4, 0.55, 40)
  addSign(root, ctx, 'BOUWTERREIN', 0xff6622, SITE_MAX_X + 0.3, 2.4, gateZ, facePlaza, 3.2, 0.6, 36)

  // Incomplete flat carcass
  const towerX = cx - 2
  const towerZ = cz + 2
  const floors = 5
  const tw = 9.5
  const td = 7.5
  const floorH = 3.1
  for (let f = 0; f < floors; f++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(tw - f * 0.15, 0.28, td - f * 0.1), concrete)
    slab.position.set(towerX, 0.4 + f * floorH, towerZ)
    slab.castShadow = true
    slab.receiveShadow = true
    root.add(slab)

    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.55, floorH, 0.55), concrete)
      col.position.set(
        towerX + sx * (tw / 2 - 0.5),
        0.4 + f * floorH + floorH / 2,
        towerZ + sz * (td / 2 - 0.45),
      )
      col.castShadow = true
      root.add(col)
    }

    if (f === floors - 1) {
      for (let i = 0; i < 18; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4 + seeded(i) * 1.8, 5), rebar)
        bar.position.set(
          towerX + (seeded(i) - 0.5) * (tw - 1.5),
          0.4 + floors * floorH + 0.7,
          towerZ + (seeded(i + 5) - 0.5) * (td - 1.2),
        )
        bar.rotation.z = (seeded(i + 9) - 0.5) * 0.15
        root.add(bar)
      }
    }
  }

  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < 4; i++) {
      const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, floorH, 5), steel)
      upright.position.set(towerX + tw / 2 + 0.7, 0.4 + f * floorH + floorH / 2, towerZ - td / 2 + 1.2 + i * 1.6)
      root.add(upright)
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.5), wood)
      plank.position.set(towerX + tw / 2 + 0.7, 0.4 + (f + 1) * floorH - 0.1, towerZ - td / 2 + 1.2 + i * 1.6)
      root.add(plank)
    }
  }

  for (let i = 0; i < 6; i++) {
    const pile = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8 + seeded(i) * 0.6, 1.2 + seeded(i + 1) * 0.5, 0.9 + seeded(i) * 0.7, 8),
      i % 2 ? dirt : sandDark,
    )
    pile.position.set(SITE_MIN_X + 3 + seeded(i + 20) * 8, 0.45, SITE_MIN_Z + 4 + seeded(i + 22) * (d - 8))
    root.add(pile)
  }

  for (let i = 0; i < 5; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.5 + seeded(i) * 2, 8), steel)
    pipe.rotation.z = Math.PI / 2
    pipe.rotation.y = seeded(i + 30) * Math.PI
    pipe.position.set(cx + 6 + seeded(i) * 3, 0.25, cz - 8 + i * 2.2)
    root.add(pipe)
  }

  for (const [ox, oz] of [
    [0.8, -5],
    [0.8, -4],
    [0.8, 4],
    [0.8, 5.2],
    [1.6, -2],
    [1.6, 2],
  ] as const) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), orange)
    cone.position.set(SITE_MAX_X + ox, 0.4, gateZ + oz)
    root.add(cone)
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }),
    )
    stripe.position.set(SITE_MAX_X + ox, 0.45, gateZ + oz)
    root.add(stripe)
  }

  const shack = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.4, 2.8),
    new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.7, metalness: 0.25 }),
  )
  shack.position.set(SITE_MIN_X + 5, 1.25, SITE_MAX_Z - 5)
  shack.castShadow = true
  root.add(shack)
  const shackRoof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.15, 3.1), steel)
  shackRoof.position.set(SITE_MIN_X + 5, 2.55, SITE_MAX_Z - 5)
  root.add(shackRoof)

  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.2), steel)
  craneBase.position.set(cx + 5, 0.3, cz - 6)
  root.add(craneBase)
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.45, 18, 0.45), steel)
  mast.position.set(cx + 5, 9.2, cz - 6)
  mast.castShadow = true
  root.add(mast)
  const jib = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 0.35), steel)
  jib.position.set(cx + 1, 17.5, cz - 6)
  root.add(jib)
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), orange)
  hook.position.set(cx + 5 - 9, 14.5, cz - 6)
  root.add(hook)
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 4), steel)
  cable.position.set(cx + 5 - 9, 16, cz - 6)
  root.add(cable)

  if (ctx.colliders) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), new THREE.MeshBasicMaterial({ visible: false }))
    col.position.set(cx, 1.5, cz)
    root.add(col)
    ctx.colliders.push(col)

    const towerCol = new THREE.Mesh(
      new THREE.BoxGeometry(tw + 1, floors * floorH, td + 1),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    towerCol.position.set(towerX, (floors * floorH) / 2, towerZ)
    root.add(towerCol)
    ctx.colliders.push(towerCol)
  }

  ctx.scene.add(root)
  return root
}
