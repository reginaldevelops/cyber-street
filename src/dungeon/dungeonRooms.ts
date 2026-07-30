import * as THREE from 'three'
import type { Direction, RoomType } from './dungeonTypes.js'

export type { Direction, RoomType } from './dungeonTypes.js'

export const CELL = 28
export const WALL_HEIGHT = 3.4
export const DOOR_WIDTH = 3

export interface BuiltRoom {
  root: THREE.Group
  colliders: THREE.Mesh[]
  spawnPoints: THREE.Vector3[]
  floorY: 0
  props: THREE.Object3D[]
  /** Door slabs start hidden. Encounter code can show them when a room locks. */
  doorSlabs: Partial<Record<Direction, THREE.Mesh>>
}

interface RoomMaterials {
  floor: THREE.MeshStandardMaterial
  floorInset: THREE.MeshStandardMaterial
  wall: THREE.MeshStandardMaterial
  wallDamp: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  rust: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
}

interface BuildContext {
  root: THREE.Group
  colliders: THREE.Mesh[]
  props: THREE.Object3D[]
  spawnPoints: THREE.Vector3[]
  worldX: number
  worldZ: number
  mats: RoomMaterials
}

const WALL_THICKNESS = 0.4
const DOOR_HEIGHT = 2.55
const FRAME_THICKNESS = 0.18

const ROOM_SIZES: Record<RoomType, readonly [number, number]> = {
  'access-junction': [18, 18],
  'pump-hall': [22, 16],
  'filtration-beds': [20, 20],
  'maintenance-maze': [18, 22],
  'overflow-cistern': [22, 22],
}

function standardMaterial(color: number, roughness = 0.8, metalness = 0.15) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  })
}

function emissiveMaterial(color: number, intensity = 0.75, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.4,
    transparent: opacity < 1,
    opacity,
    flatShading: true,
  })
}

function createRoomMaterials(): RoomMaterials {
  return {
    floor: standardMaterial(0x101817, 0.94, 0.08),
    floorInset: standardMaterial(0x182321, 0.88, 0.13),
    wall: standardMaterial(0x26302e, 0.9, 0.1),
    wallDamp: standardMaterial(0x182522, 0.96, 0.06),
    metal: standardMaterial(0x465052, 0.4, 0.78),
    rust: standardMaterial(0x693b2d, 0.72, 0.4),
    dark: standardMaterial(0x090e10, 0.82, 0.28),
  }
}

function box(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
) {
  const result = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), material)
  result.position.set(x, y, z)
  result.castShadow = true
  result.receiveShadow = true
  return result
}

function addCollider(ctx: BuildContext, mesh: THREE.Mesh) {
  ctx.root.add(mesh)
  ctx.colliders.push(mesh)
  return mesh
}

function addProp(ctx: BuildContext, prop: THREE.Object3D) {
  ctx.root.add(prop)
  ctx.props.push(prop)
  return prop
}

function addSpawnPoints(ctx: BuildContext, points: readonly (readonly [number, number])[]) {
  for (const [x, z] of points) {
    ctx.spawnPoints.push(new THREE.Vector3(ctx.worldX + x, 0, ctx.worldZ + z))
  }
}

function addLamp(
  ctx: BuildContext,
  x: number,
  y: number,
  z: number,
  color: number,
  intensity = 0.7,
  range = 8,
) {
  const lamp = new THREE.Group()
  lamp.name = 'warning-lamp'
  lamp.position.set(x, y, z)

  const cage = box(0.32, 0.18, 0.32, ctx.mats.dark, 0, 0, 0)
  const lens = box(0.22, 0.12, 0.22, emissiveMaterial(color, 1.1), 0, -0.03, 0)
  lamp.add(cage, lens)

  const light = new THREE.PointLight(color, intensity, range, 2)
  light.position.y = -0.1
  lamp.add(light)
  addProp(ctx, lamp)
}

function addDoorFrame(
  root: THREE.Group,
  dir: Direction,
  wallX: number,
  wallZ: number,
  frameMaterial: THREE.Material,
) {
  const frame = new THREE.Group()
  frame.name = `door-frame-${dir}`

  if (dir === 'N' || dir === 'S') {
    frame.add(
      box(FRAME_THICKNESS, DOOR_HEIGHT, WALL_THICKNESS + 0.22, frameMaterial, -DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0),
      box(FRAME_THICKNESS, DOOR_HEIGHT, WALL_THICKNESS + 0.22, frameMaterial, DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0),
      box(DOOR_WIDTH + FRAME_THICKNESS * 2, FRAME_THICKNESS, WALL_THICKNESS + 0.22, frameMaterial, 0, DOOR_HEIGHT, 0),
    )
  } else {
    frame.add(
      box(WALL_THICKNESS + 0.22, DOOR_HEIGHT, FRAME_THICKNESS, frameMaterial, 0, DOOR_HEIGHT / 2, -DOOR_WIDTH / 2),
      box(WALL_THICKNESS + 0.22, DOOR_HEIGHT, FRAME_THICKNESS, frameMaterial, 0, DOOR_HEIGHT / 2, DOOR_WIDTH / 2),
      box(WALL_THICKNESS + 0.22, FRAME_THICKNESS, DOOR_WIDTH + FRAME_THICKNESS * 2, frameMaterial, 0, DOOR_HEIGHT, 0),
    )
  }

  frame.position.set(wallX, 0, wallZ)
  root.add(frame)
}

function addWall(
  ctx: BuildContext,
  dir: Direction,
  roomWidth: number,
  roomDepth: number,
  isOpen: boolean,
  doorSlabs: Partial<Record<Direction, THREE.Mesh>>,
) {
  const northSouth = dir === 'N' || dir === 'S'
  const length = northSouth ? roomWidth : roomDepth
  const wallX = northSouth ? 0 : (dir === 'E' ? roomWidth / 2 : -roomWidth / 2)
  const wallZ = northSouth ? (dir === 'S' ? roomDepth / 2 : -roomDepth / 2) : 0
  const material = dir === 'N' || dir === 'W' ? ctx.mats.wallDamp : ctx.mats.wall

  if (!isOpen) {
    const wall = northSouth
      ? box(length, WALL_HEIGHT, WALL_THICKNESS, material, wallX, WALL_HEIGHT / 2, wallZ)
      : box(WALL_THICKNESS, WALL_HEIGHT, length, material, wallX, WALL_HEIGHT / 2, wallZ)
    wall.name = `solid-wall-${dir}`
    addCollider(ctx, wall)
    return
  }

  const sideLength = (length - DOOR_WIDTH) / 2
  const sideOffset = DOOR_WIDTH / 2 + sideLength / 2
  const first = northSouth
    ? box(sideLength, WALL_HEIGHT, WALL_THICKNESS, material, -sideOffset, WALL_HEIGHT / 2, wallZ)
    : box(WALL_THICKNESS, WALL_HEIGHT, sideLength, material, wallX, WALL_HEIGHT / 2, -sideOffset)
  const second = northSouth
    ? box(sideLength, WALL_HEIGHT, WALL_THICKNESS, material, sideOffset, WALL_HEIGHT / 2, wallZ)
    : box(WALL_THICKNESS, WALL_HEIGHT, sideLength, material, wallX, WALL_HEIGHT / 2, sideOffset)
  first.name = `door-wall-${dir}-a`
  second.name = `door-wall-${dir}-b`
  addCollider(ctx, first)
  addCollider(ctx, second)

  const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT
  const lintel = northSouth
    ? box(DOOR_WIDTH, lintelHeight, WALL_THICKNESS, material, 0, DOOR_HEIGHT + lintelHeight / 2, wallZ)
    : box(WALL_THICKNESS, lintelHeight, DOOR_WIDTH, material, wallX, DOOR_HEIGHT + lintelHeight / 2, 0)
  lintel.name = `door-lintel-${dir}`
  addCollider(ctx, lintel)
  addDoorFrame(ctx.root, dir, wallX, wallZ, ctx.mats.rust)

  const slabMaterial = standardMaterial(0x202b2d, 0.36, 0.82)
  const slab = northSouth
    ? box(DOOR_WIDTH - 0.12, DOOR_HEIGHT - 0.08, 0.16, slabMaterial, 0, (DOOR_HEIGHT - 0.08) / 2, wallZ)
    : box(0.16, DOOR_HEIGHT - 0.08, DOOR_WIDTH - 0.12, slabMaterial, wallX, (DOOR_HEIGHT - 0.08) / 2, 0)
  slab.name = `door-slab-${dir}`
  slab.visible = false
  slab.userData.direction = dir
  slab.userData.isDoorSlab = true
  ctx.root.add(slab)
  doorSlabs[dir] = slab
}

function buildAccessJunction(ctx: BuildContext) {
  const drain = new THREE.Group()
  drain.name = 'junction-drain'
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 12), ctx.mats.rust)
  rim.position.y = 0.025
  rim.receiveShadow = true
  drain.add(rim)
  const grate = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.09, 12), ctx.mats.dark)
  grate.position.y = 0.05
  grate.receiveShadow = true
  drain.add(grate)
  for (let i = -2; i <= 2; i++) {
    drain.add(box(1.55, 0.05, 0.08, ctx.mats.metal, 0, 0.11, i * 0.28))
  }
  addProp(ctx, drain)

  const ladder = new THREE.Group()
  ladder.name = 'exit-ladder'
  ladder.position.set(-6.8, 0, -7.65)
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 6), ctx.mats.metal)
    rail.position.set(side * 0.38, 1.55, 0)
    rail.castShadow = true
    ladder.add(rail)
  }
  for (let i = 0; i < 9; i++) {
    ladder.add(box(0.82, 0.06, 0.08, ctx.mats.metal, 0, 0.22 + i * 0.34, 0))
  }
  addProp(ctx, ladder)

  for (const [x, z] of [
    [-7.2, -7.2],
    [7.2, -7.2],
    [-7.2, 7.2],
    [7.2, 7.2],
  ] as const) {
    addLamp(ctx, x, 2.75, z, 0xffb52e, 0.55, 7)
  }

  addSpawnPoints(ctx, [
    [-5.8, -5.8],
    [5.8, -5.8],
    [-5.8, 5.8],
    [5.8, 5.8],
  ])
}

function createPump(ctx: BuildContext, x: number, z: number, rotationY: number) {
  const pump = new THREE.Group()
  pump.name = 'pump'
  pump.position.set(x, 0, z)
  pump.rotation.y = rotationY

  const base = box(2.8, 0.45, 1.75, ctx.mats.rust, 0, 0.225, 0)
  pump.add(base)
  ctx.colliders.push(base)

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 2.15, 8), ctx.mats.metal)
  tank.rotation.z = Math.PI / 2
  tank.position.y = 1.15
  tank.castShadow = true
  tank.receiveShadow = true
  pump.add(tank)
  const cap = box(0.35, 1.25, 1.25, ctx.mats.dark, -1.05, 1.15, 0)
  pump.add(cap)

  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.25, 8), ctx.mats.metal)
  pipe.position.set(0.7, 2.0, 0)
  pipe.castShadow = true
  pump.add(pipe)
  const cyan = emissiveMaterial(0x00dce8, 0.95)
  pump.add(box(2.35, 0.09, 0.09, cyan, 0, 1.55, 0.75))
  addProp(ctx, pump)
}

function buildPumpHall(ctx: BuildContext) {
  createPump(ctx, -5.5, -3.2, 0)
  createPump(ctx, 5.5, 3.2, Math.PI)
  addLamp(ctx, -8.5, 2.65, 0, 0x00e5ff, 0.65, 10)
  addLamp(ctx, 8.5, 2.65, 0, 0x00e5ff, 0.65, 10)

  addSpawnPoints(ctx, [
    [-8.5, -5.3],
    [-3.0, -5.3],
    [3.0, -5.3],
    [8.5, -5.3],
    [-8.5, 5.3],
    [-3.0, 5.3],
    [3.0, 5.3],
    [8.5, 5.3],
  ])
}

function buildFiltrationBeds(ctx: BuildContext) {
  const bedMat = standardMaterial(0x293d34, 0.86, 0.18)
  const toxicMat = emissiveMaterial(0x43ff78, 0.48, 0.78)

  // Each logical bed is split at the center to preserve the east-west socket route.
  for (const x of [-5.2, -1.9, 5.2]) {
    const bed = new THREE.Group()
    bed.name = 'filtration-bed'
    bed.position.x = x
    for (const z of [-4.25, 4.25]) {
      const shell = box(1.45, 0.78, 6.0, bedMat, 0, 0.39, z)
      bed.add(shell)
      ctx.colliders.push(shell)
      bed.add(box(1.18, 0.06, 5.65, toxicMat, 0, 0.81, z))
    }
    addProp(ctx, bed)
  }

  addLamp(ctx, -8.3, 2.55, -8.3, 0x43ff78, 0.45, 8)
  addLamp(ctx, 8.3, 2.55, 8.3, 0x43ff78, 0.45, 8)
  addSpawnPoints(ctx, [
    [-7.8, -7.5],
    [-3.5, -7.5],
    [3.0, -7.5],
    [7.8, -7.5],
    [-7.8, 7.5],
    [-3.5, 7.5],
    [3.0, 7.5],
    [7.8, 7.5],
  ])
}

function buildMaintenanceMaze(ctx: BuildContext) {
  const machineMat = standardMaterial(0x34393b, 0.58, 0.62)
  const amberMat = emissiveMaterial(0xffa928, 0.75)
  const blocks = [
    [-3.8, -3.25, 2.7, 3.25],
    [3.65, -3.8, 2.9, 2.7],
    [-3.35, 3.85, 3.1, 2.65],
    [3.9, 3.15, 2.6, 3.2],
  ] as const

  for (let i = 0; i < blocks.length; i++) {
    const [x, z, width, depth] = blocks[i]
    const machine = new THREE.Group()
    machine.name = 'maintenance-block'
    machine.position.set(x, 0, z)
    const body = box(width, 1.15, depth, machineMat, 0, 0.575, 0)
    machine.add(body)
    ctx.colliders.push(body)
    machine.add(box(width * 0.72, 0.08, 0.12, amberMat, 0, 0.86, depth / 2 + 0.065))
    machine.add(box(0.3, 0.24, 0.08, ctx.mats.dark, i % 2 ? 0.55 : -0.55, 0.55, depth / 2 + 0.075))
    addProp(ctx, machine)
  }

  addLamp(ctx, -7.2, 2.55, 0, 0xffa928, 0.55, 8)
  addLamp(ctx, 7.2, 2.55, 0, 0xffa928, 0.55, 8)
  addSpawnPoints(ctx, [
    [-6.6, -7.7],
    [5.8, -7.8],
    [-6.3, 7.8],
    [6.5, 7.5],
    [-6.6, 2.2],
    [6.7, -1.8],
  ])
}

function buildOverflowCistern(ctx: BuildContext) {
  const dryCenter = box(16, 0.12, 16, ctx.mats.floorInset, 0, 0.01, 0)
  dryCenter.name = 'cistern-dry-center'
  dryCenter.receiveShadow = true
  dryCenter.castShadow = false
  addProp(ctx, dryCenter)

  const waterMat = emissiveMaterial(0x00bda8, 0.42, 0.58)
  waterMat.depthWrite = false
  const strips = [
    box(22, 0.08, 2.2, waterMat, 0, 0.02, -9.9),
    box(22, 0.08, 2.2, waterMat, 0, 0.02, 9.9),
    box(2.2, 0.08, 17.6, waterMat, -9.9, 0.02, 0),
    box(2.2, 0.08, 17.6, waterMat, 9.9, 0.02, 0),
  ]
  for (const strip of strips) {
    strip.name = 'cistern-glow-water'
    strip.castShadow = false
    addProp(ctx, strip)
  }

  for (const [x, z] of [
    [-9.6, -9.6],
    [9.6, -9.6],
    [-9.6, 9.6],
    [9.6, 9.6],
  ] as const) {
    const bollard = box(0.42, 1.6, 0.42, ctx.mats.rust, x, 0.8, z)
    addProp(ctx, bollard)
    addLamp(ctx, x, 1.75, z, 0xff6a24, 0.48, 8)
  }

  const centerMark = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.45, 8),
    emissiveMaterial(0xff6a24, 0.55, 0.78),
  )
  centerMark.name = 'boss-arena-mark'
  centerMark.rotation.x = -Math.PI / 2
  centerMark.position.y = 0.085
  addProp(ctx, centerMark)

  addSpawnPoints(ctx, [
    [0, 0],
    [-6.5, -6.5],
    [0, -7.2],
    [6.5, -6.5],
    [-7.2, 0],
    [7.2, 0],
    [-6.5, 6.5],
    [0, 7.2],
    [6.5, 6.5],
  ])
}

/**
 * Builds a self-contained room group at the supplied world position.
 * Mesh positions and colliders are local to root; spawn points are world-space.
 */
export function buildRoomMesh(
  template: RoomType,
  openSockets: Set<Direction>,
  worldX: number,
  worldZ: number,
): BuiltRoom {
  const root = new THREE.Group()
  root.name = `dungeon-room-${template}`
  root.position.set(worldX, 0, worldZ)

  const colliders: THREE.Mesh[] = []
  const props: THREE.Object3D[] = []
  const spawnPoints: THREE.Vector3[] = []
  const doorSlabs: Partial<Record<Direction, THREE.Mesh>> = {}
  const mats = createRoomMaterials()
  const ctx: BuildContext = { root, colliders, props, spawnPoints, worldX, worldZ, mats }
  const [roomWidth, roomDepth] = ROOM_SIZES[template]

  root.userData.roomType = template
  root.userData.roomWidth = roomWidth
  root.userData.roomDepth = roomDepth
  root.userData.openSockets = [...openSockets]
  root.userData.doorSlabs = doorSlabs

  const foundation = box(roomWidth, 0.24, roomDepth, mats.floor, 0, -0.12, 0)
  foundation.name = 'room-floor'
  foundation.castShadow = false
  foundation.receiveShadow = true
  root.add(foundation)

  for (const direction of ['N', 'E', 'S', 'W'] as const) {
    addWall(ctx, direction, roomWidth, roomDepth, openSockets.has(direction), doorSlabs)
  }

  const fill = new THREE.HemisphereLight(0x213b39, 0x050807, 0.42)
  fill.position.y = WALL_HEIGHT
  root.add(fill)

  switch (template) {
    case 'access-junction':
      buildAccessJunction(ctx)
      break
    case 'pump-hall':
      buildPumpHall(ctx)
      break
    case 'filtration-beds':
      buildFiltrationBeds(ctx)
      break
    case 'maintenance-maze':
      buildMaintenanceMaze(ctx)
      break
    case 'overflow-cistern':
      buildOverflowCistern(ctx)
      break
  }

  return { root, colliders, spawnPoints, floorY: 0, props, doorSlabs }
}

/**
 * Creates the narrow floor span between two cardinally adjacent room doors.
 * The bridge expands beyond six units when either room has a smaller footprint.
 */
export function buildDoorBridge(fromRoom: BuiltRoom, toRoom: BuiltRoom, dir: Direction): THREE.Mesh {
  const northSouth = dir === 'N' || dir === 'S'
  const fromHalf = Number(fromRoom.root.userData[northSouth ? 'roomDepth' : 'roomWidth'] ?? 22) / 2
  const toHalf = Number(toRoom.root.userData[northSouth ? 'roomDepth' : 'roomWidth'] ?? 22) / 2
  const centerDistance = northSouth
    ? Math.abs(toRoom.root.position.z - fromRoom.root.position.z)
    : Math.abs(toRoom.root.position.x - fromRoom.root.position.x)
  const length = Math.max(0.2, centerDistance - fromHalf - toHalf)
  const material = standardMaterial(0x172321, 0.88, 0.2)
  const bridge = northSouth
    ? box(DOOR_WIDTH, 0.16, length, material, 0, -0.08, 0)
    : box(length, 0.16, DOOR_WIDTH, material, 0, -0.08, 0)

  bridge.name = `door-bridge-${dir}`
  bridge.position.x = (fromRoom.root.position.x + toRoom.root.position.x) / 2
  bridge.position.z = (fromRoom.root.position.z + toRoom.root.position.z) / 2
  bridge.castShadow = false
  bridge.receiveShadow = true
  bridge.userData.fromRoom = fromRoom.root.name
  bridge.userData.toRoom = toRoom.root.name
  bridge.userData.direction = dir
  return bridge
}
