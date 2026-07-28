import * as THREE from 'three'

/** Agent 3 — cooler isometric cyber-street runner. */
export interface PlayerRig {
  root: THREE.Group
  body: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  gun: THREE.Group
  gunHolder: THREE.Group
  muzzle: THREE.Object3D
  muzzleLight: THREE.PointLight
  visorMat: THREE.MeshStandardMaterial
}

export function buildPlayerCharacter(
  neonCyan: number,
  neonPink: number,
  neonOrange: number,
): PlayerRig {
  const root = new THREE.Group()
  const body = new THREE.Group()

  const coatMat = new THREE.MeshStandardMaterial({ color: 0x14101c, roughness: 0.58, metalness: 0.32 })
  const coatInner = new THREE.MeshStandardMaterial({ color: 0x221828, roughness: 0.65, metalness: 0.2 })
  const trimMat = new THREE.MeshStandardMaterial({
    color: neonCyan,
    emissive: neonCyan,
    emissiveIntensity: 0.65,
    roughness: 0.32,
    metalness: 0.55,
  })
  const pinkTrim = new THREE.MeshStandardMaterial({
    color: neonPink,
    emissive: neonPink,
    emissiveIntensity: 0.5,
    roughness: 0.35,
    metalness: 0.5,
  })
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x2a2834, roughness: 0.38, metalness: 0.82 })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xb89880, roughness: 0.72, metalness: 0.08 })
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x0e0c12, roughness: 0.5, metalness: 0.42 })
  const metalGun = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.32, metalness: 0.92 })
  const gripGun = new THREE.MeshStandardMaterial({ color: 0x121010, roughness: 0.78, metalness: 0.12 })
  const neonGun = new THREE.MeshStandardMaterial({
    color: neonOrange,
    emissive: neonOrange,
    emissiveIntensity: 1.0,
    roughness: 0.35,
    metalness: 0.45,
  })

  const visorMat = new THREE.MeshStandardMaterial({
    color: neonCyan,
    emissive: neonCyan,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.35,
    transparent: true,
    opacity: 0.92,
  })

  // Torso — armored under long coat
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.74, 0.3), coatMat)
  torso.position.y = 1.08
  torso.castShadow = true
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.08), armorMat)
  chestPlate.position.set(0, 1.12, 0.14)
  const chestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), pinkTrim)
  chestGlow.position.set(0, 1.14, 0.19)

  // Coat tails
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.06), coatInner)
    tail.position.set(side * 0.2, 0.72, -0.08)
    tail.rotation.x = 0.12
    body.add(tail)
  }

  // Shoulder pauldrons
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.16), armorMat)
    pad.position.set(side * 0.34, 1.38, 0)
    const padTrim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.18), trimMat)
    padTrim.position.set(side * 0.34, 1.44, 0)
    body.add(pad, padTrim)
  }

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.32), metalGun)
  belt.position.set(0, 0.82, 0.02)
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.05), trimMat)
  buckle.position.set(0, 0.82, 0.18)

  // Utility pouches
  for (const side of [-1, 1]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.08), armorMat)
    pouch.position.set(side * 0.22, 0.78, 0.12)
    body.add(pouch)
  }

  // Head — hood + full visor
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinMat)
  head.position.y = 1.62
  head.castShadow = true
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.3), coatMat)
  hood.position.set(0, 1.78, -0.03)
  const hoodTrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.32), trimMat)
  hoodTrim.position.set(0, 1.72, -0.02)

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.06), visorMat)
  visor.position.set(0, 1.62, 0.12)
  const rebreather = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), armorMat)
  rebreather.position.set(0, 1.54, 0.14)

  const buildArm = (side: number) => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.34, 1.28, 0)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), coatMat)
    upper.position.y = -0.16
    upper.castShadow = true
    const foreGuard = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 0.11), armorMat)
    foreGuard.position.y = -0.38
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), coatMat)
    fore.position.y = -0.52
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), skinMat)
    hand.position.y = -0.62
    arm.add(upper, foreGuard, fore, hand)
    return arm
  }
  const armL = buildArm(-1)
  const armR = buildArm(1)

  const legL = new THREE.Group()
  const legR = new THREE.Group()
  const buildLeg = (leg: THREE.Group, side: number) => {
    leg.position.set(side * 0.13, 0.78, 0)
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 0.15), coatMat)
    thigh.position.y = -0.18
    thigh.castShadow = true
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), bootMat)
    shin.position.y = -0.52
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.24), bootMat)
    boot.position.set(0, -0.7, 0.05)
    const bootTrim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), trimMat)
    bootTrim.position.set(0, -0.66, 0.12)
    leg.add(thigh, shin, boot, bootTrim)
  }
  buildLeg(legL, -1)
  buildLeg(legR, 1)

  // Compact cyber SMG with laser
  const gun = new THREE.Group()
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.32), metalGun)
  receiver.position.set(0, 0, 0.02)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.22, 8), metalGun)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.02, 0.28)
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), gripGun)
  grip.position.set(0, -0.1, -0.02)
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.07), metalGun)
  mag.position.set(0, -0.08, 0.06)
  const scope = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.1), metalGun)
  scope.position.set(0, 0.08, 0.08)
  const laser = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.14), neonGun)
  laser.position.set(0.04, 0.06, 0.22)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.02, 0.42)
  gun.add(receiver, barrel, grip, mag, scope, laser, muzzle)

  const gunHolder = new THREE.Group()
  gunHolder.position.set(0.36, 1.1, 0.24)
  gunHolder.rotation.set(-0.38, -0.12, 0.08)
  gunHolder.add(gun)

  const muzzleLight = new THREE.PointLight(0xff8833, 0, 7, 2)
  gun.add(muzzleLight)
  muzzleLight.position.copy(muzzle.position)

  body.add(
    torso, chestPlate, chestGlow, belt, buckle,
    head, hood, hoodTrim, visor, rebreather,
    armL, armR, legL, legR, gunHolder,
  )
  root.add(body)

  return { root, body, legL, legR, gun, gunHolder, muzzle, muzzleLight, visorMat }
}
