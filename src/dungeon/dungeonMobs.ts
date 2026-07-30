import * as THREE from 'three'
import type { MobKind } from './dungeonTypes.js'

export type { MobKind } from './dungeonTypes.js'

export interface MobMesh {
  root: THREE.Group
  hitMeshes: THREE.Mesh[]
  mats: THREE.MeshStandardMaterial[]
}

interface MobBuildContext extends MobMesh {}

interface CoreOptions {
  bodyWidth?: number
  bodyHeight?: number
  bodyDepth?: number
  shoulderWidth?: number
  legSpread?: number
  slim?: boolean
}

function mobMaterial(
  ctx: MobBuildContext,
  color: number,
  roughness = 0.62,
  metalness = 0.38,
  emissive?: number,
  emissiveIntensity = 0,
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
    emissive: emissive ?? 0x000000,
    emissiveIntensity,
  })
  ctx.mats.push(material)
  return material
}

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  name: string,
  x: number,
  y: number,
  z: number,
  hit = false,
  ctx?: MobBuildContext,
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (hit && ctx) ctx.hitMeshes.push(mesh)
  return mesh
}

function boxPart(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  material: THREE.MeshStandardMaterial,
  name: string,
  x: number,
  y: number,
  z: number,
  hit = false,
  ctx?: MobBuildContext,
) {
  return part(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), material, name, x, y, z, hit, ctx)
}

function cylinderPart(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  material: THREE.MeshStandardMaterial,
  name: string,
  x: number,
  y: number,
  z: number,
  hit = false,
  ctx?: MobBuildContext,
) {
  return part(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
    name,
    x,
    y,
    z,
    hit,
    ctx,
  )
}

function addCore(
  ctx: MobBuildContext,
  bodyMaterial: THREE.MeshStandardMaterial,
  armorMaterial: THREE.MeshStandardMaterial,
  darkMaterial: THREE.MeshStandardMaterial,
  accentMaterial: THREE.MeshStandardMaterial,
  options: CoreOptions = {},
) {
  const bodyWidth = options.bodyWidth ?? 0.72
  const bodyHeight = options.bodyHeight ?? 0.88
  const bodyDepth = options.bodyDepth ?? 0.42
  const shoulderWidth = options.shoulderWidth ?? bodyWidth + 0.25
  const legSpread = options.legSpread ?? bodyWidth * 0.28
  const limbWidth = options.slim ? 0.16 : 0.22

  const leftBoot = boxPart(0.27, 0.2, 0.42, darkMaterial, 'left-boot', -legSpread, 0.1, 0.08)
  const rightBoot = boxPart(0.27, 0.2, 0.42, darkMaterial, 'right-boot', legSpread, 0.1, 0.08)
  const leftLeg = boxPart(limbWidth, 0.78, 0.25, bodyMaterial, 'left-leg-hit', -legSpread, 0.55, 0, true, ctx)
  const rightLeg = boxPart(limbWidth, 0.78, 0.25, bodyMaterial, 'right-leg-hit', legSpread, 0.55, 0, true, ctx)
  const pelvis = boxPart(bodyWidth * 0.82, 0.34, bodyDepth, armorMaterial, 'pelvis-hit', 0, 1.02, 0, true, ctx)
  const torso = boxPart(bodyWidth, bodyHeight, bodyDepth, armorMaterial, 'torso-hit', 0, 1.5, 0, true, ctx)
  const shoulder = boxPart(shoulderWidth, 0.2, bodyDepth + 0.08, darkMaterial, 'shoulder-bar', 0, 1.82, 0)
  const head = boxPart(
    options.slim ? 0.38 : 0.46,
    0.44,
    0.42,
    bodyMaterial,
    'head-hit',
    0,
    2.14,
    0,
    true,
    ctx,
  )
  const visor = boxPart(
    options.slim ? 0.32 : 0.4,
    0.1,
    0.06,
    accentMaterial,
    'visor',
    0,
    2.18,
    0.235,
  )
  const leftArm = boxPart(limbWidth, 0.78, limbWidth, bodyMaterial, 'left-arm-hit', -shoulderWidth / 2, 1.47, 0, true, ctx)
  const rightArm = boxPart(limbWidth, 0.78, limbWidth, bodyMaterial, 'right-arm-hit', shoulderWidth / 2, 1.47, 0, true, ctx)

  ctx.root.add(
    leftBoot,
    rightBoot,
    leftLeg,
    rightLeg,
    pelvis,
    torso,
    shoulder,
    head,
    visor,
    leftArm,
    rightArm,
  )

  return { torso, head, leftArm, rightArm }
}

function buildPipeBruiser(ctx: MobBuildContext) {
  const body = mobMaterial(ctx, 0x59615b, 0.82, 0.18)
  const armor = mobMaterial(ctx, 0x663c2f, 0.68, 0.48)
  const dark = mobMaterial(ctx, 0x151a1b, 0.7, 0.55)
  const orange = mobMaterial(ctx, 0xff7a24, 0.4, 0.45, 0xff5a16, 0.65)
  addCore(ctx, body, armor, dark, orange, {
    bodyWidth: 0.96,
    bodyHeight: 0.92,
    bodyDepth: 0.58,
    shoulderWidth: 1.34,
    legSpread: 0.3,
  })

  const tank = cylinderPart(0.3, 0.32, 0.9, 8, dark, 'back-pressure-tank', 0, 1.55, -0.48)
  ctx.root.add(tank)
  for (const x of [-0.34, 0.34]) {
    const shoulderPad = boxPart(0.4, 0.25, 0.68, armor, 'bruiser-shoulder-pad', x > 0 ? 0.64 : -0.64, 1.82, 0)
    shoulderPad.rotation.z = x > 0 ? -0.18 : 0.18
    ctx.root.add(shoulderPad)
  }

  const club = new THREE.Group()
  club.name = 'pipe-club'
  club.position.set(0.78, 0.88, 0.12)
  club.rotation.z = -0.2
  const handle = cylinderPart(0.08, 0.08, 1.55, 6, dark, 'club-handle', 0, 0.5, 0)
  const head = cylinderPart(0.23, 0.3, 0.88, 8, armor, 'club-head', 0, 1.55, 0)
  head.rotation.z = Math.PI / 2
  club.add(handle, head)
  ctx.root.add(club)
}

function buildDrainGunner(ctx: MobBuildContext) {
  const body = mobMaterial(ctx, 0x435157, 0.7, 0.3)
  const armor = mobMaterial(ctx, 0x263a43, 0.48, 0.68)
  const dark = mobMaterial(ctx, 0x101719, 0.58, 0.72)
  const red = mobMaterial(ctx, 0xff3048, 0.3, 0.5, 0xff2038, 0.9)
  addCore(ctx, body, armor, dark, red, { bodyWidth: 0.7, shoulderWidth: 1.02 })

  const rifle = new THREE.Group()
  rifle.name = 'drain-rifle'
  rifle.position.set(0.18, 1.45, 0.36)
  const receiver = boxPart(0.62, 0.24, 0.62, dark, 'rifle-receiver', 0, 0, 0)
  const barrel = boxPart(0.13, 0.13, 1.15, armor, 'rifle-barrel', 0.12, 0.02, 0.8)
  const stock = boxPart(0.22, 0.3, 0.48, body, 'rifle-stock', -0.15, -0.02, -0.48)
  const sight = boxPart(0.12, 0.1, 0.16, red, 'rifle-sight', 0.05, 0.18, 0.05)
  rifle.add(receiver, barrel, stock, sight)
  ctx.root.add(rifle)

  const antenna = cylinderPart(0.025, 0.025, 0.55, 5, dark, 'gunner-antenna', -0.2, 2.57, -0.1)
  antenna.rotation.z = -0.18
  ctx.root.add(antenna)
}

function buildBladeRunner(ctx: MobBuildContext) {
  const body = mobMaterial(ctx, 0x32303d, 0.66, 0.32)
  const armor = mobMaterial(ctx, 0x541c48, 0.46, 0.58)
  const dark = mobMaterial(ctx, 0x0d1016, 0.62, 0.6)
  const pink = mobMaterial(ctx, 0xff2da8, 0.28, 0.42, 0xff1497, 1.15)
  addCore(ctx, body, armor, dark, pink, {
    bodyWidth: 0.5,
    bodyHeight: 0.82,
    bodyDepth: 0.32,
    shoulderWidth: 0.74,
    legSpread: 0.16,
    slim: true,
  })

  for (const side of [-1, 1]) {
    const blade = boxPart(0.06, 0.75, 0.17, pink, 'runner-arm-blade', side * 0.47, 1.12, 0.15)
    blade.rotation.z = side * 0.22
    ctx.root.add(blade)
    const calfBlade = boxPart(0.05, 0.48, 0.16, armor, 'runner-calf-fin', side * 0.29, 0.5, -0.18)
    calfBlade.rotation.z = side * 0.28
    ctx.root.add(calfBlade)
  }

  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.58, 4), pink)
  crest.name = 'runner-crest'
  crest.position.set(0, 2.53, -0.08)
  crest.rotation.x = -0.25
  crest.castShadow = true
  ctx.root.add(crest)
}

function buildShieldWarden(ctx: MobBuildContext) {
  const body = mobMaterial(ctx, 0x4c5454, 0.8, 0.22)
  const armor = mobMaterial(ctx, 0x39464c, 0.42, 0.78)
  const dark = mobMaterial(ctx, 0x111719, 0.62, 0.62)
  const cyan = mobMaterial(ctx, 0x31dfe8, 0.3, 0.42, 0x18ceda, 0.8)
  addCore(ctx, body, armor, dark, cyan, {
    bodyWidth: 0.92,
    bodyHeight: 0.98,
    bodyDepth: 0.55,
    shoulderWidth: 1.25,
    legSpread: 0.28,
  })

  const shield = new THREE.Group()
  shield.name = 'warden-shield'
  shield.position.set(-0.5, 1.28, 0.48)
  shield.rotation.z = -0.05
  const plate = boxPart(1.05, 1.55, 0.16, armor, 'shield-plate', 0, 0, 0)
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.22, 8), dark)
  boss.name = 'shield-boss'
  boss.rotation.x = Math.PI / 2
  boss.position.z = 0.15
  boss.castShadow = true
  const stripe = boxPart(0.12, 1.25, 0.04, cyan, 'shield-energy-stripe', 0, 0, 0.11)
  shield.add(plate, boss, stripe)
  ctx.root.add(shield)

  const baton = cylinderPart(0.09, 0.11, 1.15, 6, dark, 'warden-baton', 0.72, 1.04, 0.2)
  baton.rotation.z = -0.2
  ctx.root.add(baton)
}

function buildArcTech(ctx: MobBuildContext) {
  const body = mobMaterial(ctx, 0x394247, 0.72, 0.28)
  const armor = mobMaterial(ctx, 0x233542, 0.46, 0.62)
  const dark = mobMaterial(ctx, 0x10141b, 0.58, 0.7)
  const cyan = mobMaterial(ctx, 0x29e8ff, 0.25, 0.42, 0x13dfff, 1.2)
  addCore(ctx, body, armor, dark, cyan, {
    bodyWidth: 0.64,
    bodyHeight: 0.92,
    bodyDepth: 0.4,
    shoulderWidth: 0.88,
    slim: true,
  })

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.55, 6), armor)
  hood.name = 'arc-tech-hood'
  hood.position.set(0, 2.42, -0.03)
  hood.castShadow = true
  ctx.root.add(hood)

  const orbRig = new THREE.Group()
  orbRig.name = 'arc-orb-rig'
  orbRig.position.set(0.72, 1.85, 0)
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), cyan)
  orb.name = 'arc-orb'
  orb.castShadow = false
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 5, 10), armor)
  ring.name = 'arc-orb-ring'
  ring.rotation.x = Math.PI / 2
  ring.castShadow = true
  orbRig.add(orb, ring)
  ctx.root.add(orbRig)

  const backpack = boxPart(0.5, 0.8, 0.28, dark, 'arc-capacitor', 0, 1.52, -0.34)
  const coil = boxPart(0.38, 0.5, 0.06, cyan, 'arc-capacitor-glow', 0, 1.52, -0.5)
  ctx.root.add(backpack, coil)
}

function buildSumpKing(ctx: MobBuildContext) {
  const body = mobMaterial(ctx, 0x54544d, 0.84, 0.18)
  const armor = mobMaterial(ctx, 0x59392d, 0.55, 0.62)
  const dark = mobMaterial(ctx, 0x101416, 0.56, 0.74)
  const orange = mobMaterial(ctx, 0xff6a20, 0.3, 0.5, 0xff5414, 1.05)
  addCore(ctx, body, armor, dark, orange, {
    bodyWidth: 1.25,
    bodyHeight: 1.25,
    bodyDepth: 0.72,
    shoulderWidth: 1.75,
    legSpread: 0.4,
  })

  for (const side of [-1, 1]) {
    const tank = cylinderPart(0.3, 0.36, 1.25, 8, dark, 'boss-back-tank', side * 0.42, 1.68, -0.58)
    ctx.root.add(tank)
    const shoulder = boxPart(0.58, 0.34, 0.8, armor, 'boss-shoulder-armor', side * 0.87, 1.91, 0)
    shoulder.rotation.z = side * -0.12
    ctx.root.add(shoulder)
    const vent = boxPart(0.12, 0.62, 0.12, orange, 'boss-tank-glow', side * 0.42, 1.68, -0.91)
    ctx.root.add(vent)
  }

  const crown = new THREE.Group()
  crown.name = 'sump-crown'
  crown.position.y = 2.48
  for (let i = -2; i <= 2; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34 + (2 - Math.abs(i)) * 0.08, 4), armor)
    spike.position.set(i * 0.18, 0.15, 0)
    spike.castShadow = true
    crown.add(spike)
  }
  ctx.root.add(crown)

  const wrench = new THREE.Group()
  wrench.name = 'sump-king-wrench'
  wrench.position.set(1.02, 1.02, 0.12)
  wrench.rotation.z = -0.22
  const handle = boxPart(0.16, 1.85, 0.2, dark, 'wrench-handle', 0, 0.5, 0)
  const jaw = boxPart(0.75, 0.42, 0.25, armor, 'wrench-jaw', 0, 1.52, 0)
  const jawCut = boxPart(0.28, 0.32, 0.32, orange, 'wrench-core', 0, 1.52, 0.02)
  wrench.add(handle, jaw, jawCut)
  ctx.root.add(wrench)

  const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), orange)
  chestCore.name = 'boss-chest-core'
  chestCore.position.set(0, 1.58, 0.42)
  chestCore.castShadow = false
  ctx.root.add(chestCore)
}

/** Builds a chunky low-poly visual and the meshes used for weapon hit tests. */
export function createMobMesh(kind: MobKind): MobMesh {
  const ctx: MobBuildContext = {
    root: new THREE.Group(),
    hitMeshes: [],
    mats: [],
  }
  ctx.root.name = `dungeon-mob-${kind}`
  ctx.root.userData.mobKind = kind

  switch (kind) {
    case 'pipe-bruiser':
      buildPipeBruiser(ctx)
      break
    case 'drain-gunner':
      buildDrainGunner(ctx)
      break
    case 'blade-runner':
      buildBladeRunner(ctx)
      break
    case 'shield-warden':
      buildShieldWarden(ctx)
      break
    case 'arc-tech':
      buildArcTech(ctx)
      break
    case 'sump-king':
      buildSumpKing(ctx)
      break
  }

  for (const hitMesh of ctx.hitMeshes) {
    hitMesh.userData.mobRoot = ctx.root
    hitMesh.userData.mobKind = kind
  }
  return ctx
}
