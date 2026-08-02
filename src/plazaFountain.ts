import * as THREE from 'three'

const NEON_CYAN = 0x00f6ff
const NEON_PINK = 0xff2d95
const WATER = 0x3a88aa

/** Opposite the Tesla diner (NW) — SE plaza, axis-aligned. */
export const FOUNTAIN_X = 12
export const FOUNTAIN_Z = 14

export interface PlazaFountainContext {
  scene: THREE.Scene
  flickerMats: { mat: THREE.MeshStandardMaterial; base: number; t: number }[]
  colliders?: THREE.Mesh[]
}

function addBench(root: THREE.Group, x: number, z: number, rotY: number) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = rotY

  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3848, roughness: 0.4, metalness: 0.75 })
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a2834, roughness: 0.7, metalness: 0.25 })
  const accent = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.5,
  })

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.1, 0.48), seatMat)
  seat.position.y = 0.44
  seat.castShadow = true
  g.add(seat)

  const back = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 0.08), seatMat)
  back.position.set(0, 0.78, -0.2)
  g.add(back)

  for (const bx of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.4), metal)
    leg.position.set(bx, 0.22, 0)
    g.add(leg)
  }

  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.04), accent)
  strip.position.set(0, 0.5, 0.22)
  g.add(strip)

  root.add(g)
}

/**
 * Plaza fountain opposite the diner — basin, cyan jets, benches around the pad.
 * NPCs are spawned via ambience.spawnFountainLoiterers so they animate.
 */
export function buildPlazaFountain(ctx: PlazaFountainContext): THREE.Group {
  const root = new THREE.Group()
  root.name = 'plaza-fountain'
  root.position.set(FOUNTAIN_X, 0, FOUNTAIN_Z)

  const stone = new THREE.MeshStandardMaterial({ color: 0x2a2834, roughness: 0.72, metalness: 0.28 })
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x4a4858, roughness: 0.45, metalness: 0.65 })
  const waterMat = new THREE.MeshStandardMaterial({
    color: WATER,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.85,
    transparent: true,
    opacity: 0.78,
  })
  const glowMat = new THREE.MeshStandardMaterial({
    color: NEON_CYAN,
    emissive: NEON_CYAN,
    emissiveIntensity: 0.9,
    roughness: 0.3,
    metalness: 0.4,
  })

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.4, 0.1, 32),
    new THREE.MeshStandardMaterial({ color: 0x16141c, roughness: 0.85, metalness: 0.15 }),
  )
  pad.position.y = 0.05
  pad.receiveShadow = true
  root.add(pad)

  const basinOuter = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.55, 28), stone)
  basinOuter.position.y = 0.35
  basinOuter.castShadow = true
  root.add(basinOuter)

  const basinInner = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.35, 28), waterMat)
  basinInner.position.y = 0.42
  root.add(basinInner)
  ctx.flickerMats.push({ mat: waterMat, base: 0.35, t: 0.5 })

  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.12, 10, 36), rimMat)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.62
  root.add(rim)

  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.1, 12), stone)
  ped.position.y = 0.95
  ped.castShadow = true
  root.add(ped)

  const upperBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.28, 20), stone)
  upperBowl.position.y = 1.55
  root.add(upperBowl)

  const upperWater = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), waterMat.clone())
  upperWater.position.y = 1.68
  root.add(upperWater)
  ctx.flickerMats.push({
    mat: upperWater.material as THREE.MeshStandardMaterial,
    base: 0.4,
    t: 1.2,
  })

  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 8), glowMat)
  jet.position.y = 2.35
  root.add(jet)
  ctx.flickerMats.push({ mat: glowMat, base: 0.9, t: 0.3 })

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 10),
    new THREE.MeshStandardMaterial({
      color: NEON_PINK,
      emissive: NEON_PINK,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.5,
    }),
  )
  tip.position.y = 3.05
  root.add(tip)

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.03, 1.1, 6),
      new THREE.MeshStandardMaterial({
        color: NEON_CYAN,
        emissive: NEON_CYAN,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.65,
      }),
    )
    stream.position.set(Math.cos(a) * 0.55, 2.1, Math.sin(a) * 0.55)
    stream.rotation.z = Math.cos(a) * 0.55
    stream.rotation.x = Math.sin(a) * 0.55
    root.add(stream)
  }

  const underRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.8, 0.04, 8, 40),
    new THREE.MeshBasicMaterial({
      color: NEON_CYAN,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  underRing.rotation.x = Math.PI / 2
  underRing.position.y = 0.38
  root.add(underRing)

  const light = new THREE.PointLight(NEON_CYAN, 0.7, 14, 2)
  light.position.set(0, 2.2, 0)
  root.add(light)

  const benchR = 3.85
  for (const a of [0.15, Math.PI * 0.45, Math.PI * 0.85, Math.PI * 1.25, Math.PI * 1.7]) {
    const bx = Math.cos(a) * benchR
    const bz = Math.sin(a) * benchR
    addBench(root, bx, bz, Math.atan2(-bx, -bz))
  }

  if (ctx.colliders) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 1.2, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    col.position.y = 0.6
    root.add(col)
    ctx.colliders.push(col)
  }

  ctx.scene.add(root)
  return root
}
