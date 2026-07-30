import * as THREE from 'three'

/** Voxel / pixel-friendly player rig for the tiled cyber world. */
export interface PlayerRig {
  root: THREE.Group
  body: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  gun: THREE.Group
  gunHolder: THREE.Group
  muzzle: THREE.Object3D
  muzzleLight: THREE.PointLight
  visorMat: THREE.MeshStandardMaterial
  mixer?: THREE.AnimationMixer
  idleAction?: THREE.AnimationAction | null
  walkAction?: THREE.AnimationAction | null
  runAction?: THREE.AnimationAction | null
  hasSkeleton: boolean
}

function flat(color: number, metal = 0.15, rough = 0.72) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true })
}

function glow(color: number, intensity = 0.9) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.35,
    flatShading: true,
  })
}

/**
 * Chunky low-poly street runner — reads as a pixel/tile citizen, not a smooth GLB.
 */
export function buildPlayerCharacter(
  neonCyan: number,
  neonPink: number,
  neonOrange: number,
): PlayerRig {
  const root = new THREE.Group()
  root.name = 'player-root'
  const body = new THREE.Group()
  body.name = 'player-body'

  const coat = flat(0x1a1424, 0.25, 0.62)
  const armor = flat(0x2e2a38, 0.55, 0.4)
  const dark = flat(0x0e0c14, 0.35, 0.55)
  const boot = flat(0x121018, 0.4, 0.5)
  const trim = glow(neonCyan, 0.85)
  const pink = glow(neonPink, 0.7)
  const visorMat = glow(neonCyan, 1.35)
  visorMat.transparent = true
  visorMat.opacity = 0.95

  // ── Torso (oversized voxel block) ────────────────────────────────────────
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.7, 0.34), coat)
  torso.position.y = 1.12
  torso.castShadow = true
  body.add(torso)

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.1), armor)
  chest.position.set(0, 1.18, 0.18)
  body.add(chest)

  const core = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.04), pink)
  core.position.set(0, 1.2, 0.24)
  body.add(core)

  // Coat skirt panels
  for (const side of [-1, 1] as const) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.08), coat)
    flap.position.set(side * 0.2, 0.7, -0.06)
    flap.rotation.x = 0.08
    body.add(flap)
  }

  // Neon side stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.06), trim)
  stripe.position.set(0.3, 1.12, 0.1)
  body.add(stripe)

  // Pauldrons
  for (const side of [-1, 1] as const) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.2), armor)
    pad.position.set(side * 0.38, 1.42, 0)
    pad.castShadow = true
    body.add(pad)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.22), trim)
    edge.position.set(side * 0.38, 1.5, 0)
    body.add(edge)
  }

  // Belt + pouches
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.36), dark)
  belt.position.set(0, 0.78, 0.02)
  body.add(belt)
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), trim)
  buckle.position.set(0, 0.78, 0.2)
  body.add(buckle)
  for (const side of [-1, 1] as const) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.1), armor)
    pouch.position.set(side * 0.24, 0.74, 0.16)
    body.add(pouch)
  }

  // ── Head — blocky helm + wide visor ──────────────────────────────────────
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), armor)
  helm.position.y = 1.68
  helm.castShadow = true
  body.add(helm)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.38), coat)
  hood.position.set(0, 1.9, -0.02)
  body.add(hood)

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.08), visorMat)
  visor.position.set(0, 1.68, 0.16)
  body.add(visor)

  // Pixel "eyes" on visor
  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), pink)
    eye.position.set(side * 0.08, 1.68, 0.21)
    body.add(eye)
  }

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.12), dark)
  jaw.position.set(0, 1.52, 0.14)
  body.add(jaw)

  // Antenna
  const ant = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), dark)
  ant.position.set(0.14, 2.05, -0.06)
  body.add(ant)
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), pink)
  tip.position.set(0.14, 2.18, -0.06)
  body.add(tip)

  // ── Arms ─────────────────────────────────────────────────────────────────
  const armL = new THREE.Group()
  const armR = new THREE.Group()
  const buildArm = (arm: THREE.Group, side: number) => {
    arm.position.set(side * 0.4, 1.34, 0)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), coat)
    upper.position.y = -0.16
    upper.castShadow = true
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), armor)
    guard.position.y = -0.32
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), coat)
    fore.position.y = -0.5
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), trim)
    cuff.position.y = -0.62
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), dark)
    hand.position.y = -0.72
    arm.add(upper, guard, fore, cuff, hand)
  }
  buildArm(armL, -1)
  buildArm(armR, 1)
  body.add(armL, armR)

  // ── Legs (pivoted for walk cycle) ────────────────────────────────────────
  const legL = new THREE.Group()
  const legR = new THREE.Group()
  const buildLeg = (leg: THREE.Group, side: number) => {
    leg.position.set(side * 0.15, 0.76, 0)
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.18), coat)
    thigh.position.y = -0.18
    thigh.castShadow = true
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), armor)
    knee.position.y = -0.38
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), boot)
    shin.position.y = -0.56
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.28), boot)
    foot.position.set(0, -0.74, 0.06)
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.14), trim)
    sole.position.set(0, -0.7, 0.14)
    leg.add(thigh, knee, shin, foot, sole)
  }
  buildLeg(legL, -1)
  buildLeg(legR, 1)
  body.add(legL, legR)

  // ── Compact cyber gadget (hidden when combat off still hangs at hip) ─────
  const gun = new THREE.Group()
  gun.name = 'gadget'
  const neonGun = glow(neonOrange, 0.9)
  const metal = flat(0x1a1c22, 0.85, 0.3)
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.28), metal)
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), metal)
  barrel.position.set(0, 0.02, 0.22)
  const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16), neonGun)
  glowStrip.position.set(0.06, 0.06, 0.12)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.02, 0.36)
  gun.add(receiver, barrel, glowStrip, muzzle)

  const gunHolder = new THREE.Group()
  gunHolder.position.set(0.38, 1.05, 0.22)
  gunHolder.rotation.set(-0.35, -0.1, 0.1)
  gunHolder.add(gun)
  gunHolder.visible = false
  body.add(gunHolder)

  const muzzleLight = new THREE.PointLight(0xff8833, 0, 7, 2)
  gun.add(muzzleLight)
  muzzleLight.position.copy(muzzle.position)

  // Soft personal neon light
  const aura = new THREE.PointLight(neonCyan, 0.35, 5, 2)
  aura.position.set(0, 1.5, 0.3)
  body.add(aura)

  root.add(body)
  return {
    root,
    body,
    legL,
    legR,
    armL,
    armR,
    gun,
    gunHolder,
    muzzle,
    muzzleLight,
    visorMat,
    hasSkeleton: false,
  }
}
