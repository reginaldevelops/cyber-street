import { DUNGEON_GENERATION, ROOM_CELL_SIZE } from './dungeonConfig.js'
import { chance, mulberry32, pick, shuffle, type RandomSource } from './dungeonRng.js'
import type {
  Direction,
  DungeonRoom,
  GeneratedDungeon,
  RoomRole,
  RoomType,
} from './dungeonTypes.js'
import { SEWER_ORIGIN_X, SEWER_ORIGIN_Z } from '../sewer.js'

export const DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W']

export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
}

export const DIRECTION_OFFSETS: Record<Direction, { x: number; z: number }> = {
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
}

const CRITICAL_PATH_IDS = [0, 1, 2, 3, 4, 7] as const
const BRANCH_IDS = [5, 6] as const
const UNIQUE_NORMAL_TEMPLATES: readonly RoomType[] = [
  'pump-hall',
  'filtration-beds',
  'maintenance-maze',
]
const ALL_TEMPLATES: readonly RoomType[] = [
  'access-junction',
  'pump-hall',
  'filtration-beds',
  'maintenance-maze',
  'overflow-cistern',
]

function gridKey(x: number, z: number): string {
  return `${x},${z}`
}

function makeRoom(
  id: number,
  gridX: number,
  gridZ: number,
  depth: number,
  role: RoomRole,
): DungeonRoom {
  return {
    id,
    gridX,
    gridZ,
    worldX: SEWER_ORIGIN_X + gridX * ROOM_CELL_SIZE,
    worldZ: SEWER_ORIGIN_Z + gridZ * ROOM_CELL_SIZE,
    depth,
    template: role === 'boss' ? 'overflow-cistern' : 'access-junction',
    role,
    neighbors: {},
    state: 'dormant',
  }
}

function degree(room: DungeonRoom): number {
  return Object.keys(room.neighbors).length
}

function occupiedCells(rooms: Iterable<DungeonRoom>): Set<string> {
  return new Set([...rooms].map((room) => gridKey(room.gridX, room.gridZ)))
}

function freeDirections(room: DungeonRoom, rooms: Map<number, DungeonRoom>): Direction[] {
  const occupied = occupiedCells(rooms.values())
  return DIRECTIONS.filter((direction) => {
    const offset = DIRECTION_OFFSETS[direction]
    return !occupied.has(gridKey(room.gridX + offset.x, room.gridZ + offset.z))
  })
}

function connect(a: DungeonRoom, direction: Direction, b: DungeonRoom): void {
  a.neighbors[direction] = b.id
  b.neighbors[OPPOSITE_DIRECTION[direction]] = a.id
}

function disconnect(a: DungeonRoom, b: DungeonRoom): void {
  for (const direction of DIRECTIONS) {
    if (a.neighbors[direction] === b.id) delete a.neighbors[direction]
    if (b.neighbors[direction] === a.id) delete b.neighbors[direction]
  }
}

function buildCriticalPath(rng: RandomSource): Map<number, DungeonRoom> | null {
  const rooms = new Map<number, DungeonRoom>()
  const entrance = makeRoom(0, 0, 0, 0, 'entrance')
  rooms.set(entrance.id, entrance)
  const path: DungeonRoom[] = [entrance]
  let backtracks = 0

  while (path.length < CRITICAL_PATH_IDS.length) {
    const previous = path[path.length - 1]!
    const nextId = CRITICAL_PATH_IDS[path.length]!
    let placed = false

    if (degree(previous) < DUNGEON_GENERATION.maxRoomDegree) {
      for (const direction of shuffle(rng, DIRECTIONS)) {
        const offset = DIRECTION_OFFSETS[direction]
        const gridX = previous.gridX + offset.x
        const gridZ = previous.gridZ + offset.z
        if ([...rooms.values()].some((room) => room.gridX === gridX && room.gridZ === gridZ)) {
          continue
        }

        const role: RoomRole = nextId === 7 ? 'boss' : 'main'
        const next = makeRoom(nextId, gridX, gridZ, path.length, role)
        connect(previous, direction, next)
        rooms.set(next.id, next)
        path.push(next)
        placed = true
        break
      }
    }

    if (placed) continue
    if (path.length === 1 || ++backtracks >= DUNGEON_GENERATION.maxBacktracks) return null

    const removed = path.pop()!
    const newEnd = path[path.length - 1]!
    disconnect(newEnd, removed)
    rooms.delete(removed.id)
  }

  return rooms
}

function addBranch(
  rooms: Map<number, DungeonRoom>,
  parent: DungeonRoom,
  branchId: number,
  rng: RandomSource,
): DungeonRoom | null {
  if (degree(parent) >= DUNGEON_GENERATION.maxRoomDegree) return null
  const available = shuffle(rng, freeDirections(parent, rooms))
  const direction = available[0]
  if (!direction) return null
  const offset = DIRECTION_OFFSETS[direction]
  const branch = makeRoom(
    branchId,
    parent.gridX + offset.x,
    parent.gridZ + offset.z,
    parent.depth,
    'branch',
  )
  connect(parent, direction, branch)
  rooms.set(branch.id, branch)
  return branch
}

function addBranches(rooms: Map<number, DungeonRoom>, rng: RandomSource): boolean {
  const criticalParents = CRITICAL_PATH_IDS.slice(1, 5)
    .map((id) => rooms.get(id))
    .filter((room): room is DungeonRoom => room !== undefined)
  const firstParent = shuffle(rng, criticalParents).find(
    (room) =>
      degree(room) < DUNGEON_GENERATION.maxRoomDegree &&
      freeDirections(room, rooms).length > 0,
  )
  if (!firstParent) return false

  const firstBranch = addBranch(rooms, firstParent, BRANCH_IDS[0], rng)
  if (!firstBranch) return false

  const secondParents = shuffle(rng, criticalParents).sort((a, b) => {
    if (a.id === firstParent.id) return 1
    if (b.id === firstParent.id) return -1
    return 0
  })
  const secondParent = secondParents.find(
    (room) =>
      degree(room) < DUNGEON_GENERATION.maxRoomDegree &&
      freeDirections(room, rooms).length > 0,
  )

  if (secondParent) {
    return addBranch(rooms, secondParent, BRANCH_IDS[1], rng) !== null
  }
  return addBranch(rooms, firstBranch, BRANCH_IDS[1], rng) !== null
}

function directionBetween(a: DungeonRoom, b: DungeonRoom): Direction | null {
  const dx = b.gridX - a.gridX
  const dz = b.gridZ - a.gridZ
  if (dx === 0 && dz === -1) return 'N'
  if (dx === 1 && dz === 0) return 'E'
  if (dx === 0 && dz === 1) return 'S'
  if (dx === -1 && dz === 0) return 'W'
  return null
}

function addOptionalLoops(rooms: Map<number, DungeonRoom>, rng: RandomSource): void {
  const roomList = [...rooms.values()].sort((a, b) => a.id - b.id)
  for (let aIndex = 0; aIndex < roomList.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < roomList.length; bIndex += 1) {
      const a = roomList[aIndex]!
      const b = roomList[bIndex]!
      const direction = directionBetween(a, b)
      if (!direction || a.neighbors[direction] !== undefined) continue
      if (a.role === 'boss' || b.role === 'boss') continue
      if (
        degree(a) >= DUNGEON_GENERATION.maxRoomDegree ||
        degree(b) >= DUNGEON_GENERATION.maxRoomDegree
      ) {
        continue
      }
      if (chance(rng, DUNGEON_GENERATION.loopChance)) connect(a, direction, b)
    }
  }
}

function assignTemplates(rooms: Map<number, DungeonRoom>, rng: RandomSource): void {
  rooms.get(0)!.template = 'access-junction'
  rooms.get(7)!.template = 'overflow-cistern'

  const selectedMainIds = shuffle(rng, [1, 2, 3, 4]).slice(0, 3)
  const uniqueTemplates = shuffle(rng, UNIQUE_NORMAL_TEMPLATES)
  selectedMainIds.forEach((id, index) => {
    rooms.get(id)!.template = uniqueTemplates[index]!
  })

  for (const room of rooms.values()) {
    if (room.id === 0 || room.id === 7 || selectedMainIds.includes(room.id)) continue
    const choices =
      room.id === CRITICAL_PATH_IDS[CRITICAL_PATH_IDS.length - 2]
        ? ALL_TEMPLATES.filter((template) => template !== 'access-junction')
        : ALL_TEMPLATES
    room.template = pick(rng, choices)
  }
}

export function validateDungeon(
  rooms: readonly DungeonRoom[],
  criticalPathIds: readonly number[],
): boolean {
  if (rooms.length !== DUNGEON_GENERATION.roomCount) return false
  if (
    criticalPathIds.length !== DUNGEON_GENERATION.criticalPathRoomCount ||
    criticalPathIds.join(',') !== CRITICAL_PATH_IDS.join(',')
  ) {
    return false
  }

  const byId = new Map(rooms.map((room) => [room.id, room]))
  if (byId.size !== rooms.length) return false
  const boss = byId.get(7)
  if (
    !boss ||
    boss.role !== 'boss' ||
    boss.depth !== DUNGEON_GENERATION.bossDepth ||
    degree(boss) !== 1
  ) {
    return false
  }

  const normalCriticalRooms = criticalPathIds
    .map((id) => byId.get(id))
    .filter((room): room is DungeonRoom => room?.role === 'main')
  if (normalCriticalRooms.length !== DUNGEON_GENERATION.mainEncounterCount) return false

  for (const room of rooms) {
    if (degree(room) > DUNGEON_GENERATION.maxRoomDegree) return false
    for (const [direction, neighborId] of Object.entries(room.neighbors) as [
      Direction,
      number,
    ][]) {
      const neighbor = byId.get(neighborId)
      if (
        !neighbor ||
        neighbor.neighbors[OPPOSITE_DIRECTION[direction]] !== room.id ||
        directionBetween(room, neighbor) !== direction
      ) {
        return false
      }
    }
  }

  const reached = new Set<number>([0])
  const queue = [0]
  while (queue.length > 0) {
    const room = byId.get(queue.shift()!)
    if (!room) return false
    for (const neighborId of Object.values(room.neighbors)) {
      if (neighborId !== undefined && !reached.has(neighborId)) {
        reached.add(neighborId)
        queue.push(neighborId)
      }
    }
  }
  if (reached.size !== rooms.length) return false

  return new Set(rooms.map((room) => room.template)).size === ALL_TEMPLATES.length
}

function fallbackDungeon(seed: number): GeneratedDungeon {
  const rooms = new Map<number, DungeonRoom>()
  const pathCoordinates = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
  ] as const

  CRITICAL_PATH_IDS.forEach((id, index) => {
    const [gridX, gridZ] = pathCoordinates[index]!
    const role: RoomRole = id === 0 ? 'entrance' : id === 7 ? 'boss' : 'main'
    const room = makeRoom(id, gridX, gridZ, index, role)
    rooms.set(id, room)
    if (index > 0) connect(rooms.get(CRITICAL_PATH_IDS[index - 1]!)!, 'E', room)
  })

  const northBranch = makeRoom(5, 2, -1, 2, 'branch')
  const southBranch = makeRoom(6, 3, 1, 3, 'branch')
  rooms.set(5, northBranch)
  rooms.set(6, southBranch)
  connect(rooms.get(2)!, 'N', northBranch)
  connect(rooms.get(3)!, 'S', southBranch)
  assignTemplates(rooms, mulberry32(seed))

  return {
    seed,
    rooms: [...rooms.values()].sort((a, b) => a.id - b.id),
    criticalPathIds: [...CRITICAL_PATH_IDS],
    worldOffset: { x: SEWER_ORIGIN_X, z: SEWER_ORIGIN_Z },
  }
}

export function generateDungeon(seed: number): GeneratedDungeon {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0
  for (let attempt = 0; attempt < DUNGEON_GENERATION.maxAttempts; attempt += 1) {
    const attemptSeed = (normalizedSeed + attempt) >>> 0
    const rng = mulberry32(attemptSeed)
    const rooms = buildCriticalPath(rng)
    if (!rooms || !addBranches(rooms, rng)) continue

    addOptionalLoops(rooms, rng)
    assignTemplates(rooms, rng)
    const sortedRooms = [...rooms.values()].sort((a, b) => a.id - b.id)
    if (!validateDungeon(sortedRooms, CRITICAL_PATH_IDS)) continue

    return {
      seed: attemptSeed,
      rooms: sortedRooms,
      criticalPathIds: [...CRITICAL_PATH_IDS],
      worldOffset: { x: SEWER_ORIGIN_X, z: SEWER_ORIGIN_Z },
    }
  }

  return fallbackDungeon((normalizedSeed + DUNGEON_GENERATION.maxAttempts) >>> 0)
}
