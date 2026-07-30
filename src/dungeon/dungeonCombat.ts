import * as THREE from 'three'
import {
  BOSS_CONFIG,
  COMBAT_CONFIG,
  ENCOUNTER_CONFIG,
  MOB_BEHAVIOR,
  MOB_STATS,
  PLAYER_BASE_STATS,
  ROOM_TYPE_CONFIG,
  mitigateDamage,
  scaleMobStats,
} from './dungeonConfig.js'
import { createMobMesh } from './dungeonMobs.js'
import type {
  MobKind,
  RoomType,
  ScaledMobStats,
} from './dungeonTypes.js'

type NormalMobKind = Exclude<MobKind, 'sump-king'>
type RandomSource = () => number

export interface EncounterCompositionOptions {
  roomType?: RoomType
  isBranch?: boolean
  rng?: RandomSource
}

export interface ShotResult {
  enemyId: number
  kind: MobKind
  damage: number
  remainingHp: number
  killed: boolean
  isCrit: boolean
  hitPoint: THREE.Vector3
}

interface MaterialState {
  material: THREE.MeshStandardMaterial
  emissive: THREE.Color
  intensity: number
}

type EnemyMode =
  | 'idle'
  | 'windup'
  | 'recovery'
  | 'dash'
  | 'boss-slam'
  | 'boss-burst'
  | 'boss-charge-windup'
  | 'boss-charge'
  | 'boss-vulnerable'
  | 'boss-summon'

interface Enemy {
  id: number
  kind: MobKind
  stats: ScaledMobStats
  root: THREE.Group
  hitMeshes: THREE.Mesh[]
  materialStates: MaterialState[]
  hp: number
  maxHp: number
  alive: boolean
  roomCenter: THREE.Vector3
  mode: EnemyMode
  timer: number
  cooldown: number
  chargeCooldown: number
  attackDirection: THREE.Vector3
  dashRemaining: number
  attackHit: boolean
  strafeDirection: number
  flashTimer: number
  telegraph: THREE.Object3D | null
  summonThresholdsUsed: Set<number>
}

interface Projectile {
  mesh: THREE.Mesh
  position: THREE.Vector3
  velocity: THREE.Vector3
  lifetime: number
  damage: number
  kind: 'bullet' | 'arc-orb'
  burstId: number
}

interface AreaField {
  mesh: THREE.Mesh
  position: THREE.Vector3
  timer: number
  damage: number
}

const NORMAL_MOB_KINDS: readonly NormalMobKind[] = [
  'blade-runner',
  'pipe-bruiser',
  'drain-gunner',
  'shield-warden',
  'arc-tech',
]
const MELEE_KINDS = new Set<NormalMobKind>([
  'blade-runner',
  'pipe-bruiser',
  'shield-warden',
])
const ROOM_LEASH_RADIUS = 10
const EPSILON = 0.0001

/**
 * Returns the normal-mob budget for a room. Branches receive their optional
 * encounter bonus in addition to the room template's bonus.
 */
export function encounterBudgetForDepth(
  depth: number,
  roomType: RoomType = 'pump-hall',
  isBranch = false,
): number {
  const safeDepth = Math.max(0, Math.floor(depth))
  return (
    ENCOUNTER_CONFIG.baseBudget +
    safeDepth +
    ROOM_TYPE_CONFIG[roomType].budgetBonus +
    (isBranch ? ENCOUNTER_CONFIG.branchBudgetBonus : 0)
  )
}

/**
 * Picks a legal encounter using the design budget and fairness limits.
 * Supplying a seeded RNG makes the result reproducible.
 */
export function pickEncounterComposition(
  depth: number,
  options: EncounterCompositionOptions = {},
): NormalMobKind[] {
  const roomType = options.roomType ?? 'pump-hall'
  const roomRules = ROOM_TYPE_CONFIG[roomType]
  const rng = options.rng ?? Math.random
  let budget = encounterBudgetForDepth(depth, roomType, options.isBranch ?? false)
  const result: NormalMobKind[] = []

  const count = (kind: NormalMobKind) => result.filter((entry) => entry === kind).length
  const rangedCount = () => result.filter((kind) => MOB_STATS[kind].ranged).length
  const legal = (kind: NormalMobKind): boolean => {
    if (MOB_STATS[kind].cost > budget || result.length >= roomRules.maxMobs) return false
    if (roomType === 'access-junction' && kind === 'arc-tech') return false
    if (MOB_STATS[kind].ranged && rangedCount() >= roomRules.maxRanged) return false
    if (kind === 'drain-gunner' && count(kind) >= roomRules.maxGunners) return false
    if (kind === 'shield-warden' && count(kind) >= ENCOUNTER_CONFIG.maxShieldWardens) {
      return false
    }
    if (kind === 'arc-tech' && count(kind) >= ENCOUNTER_CONFIG.maxArcTechs) return false
    if (kind === 'arc-tech' && count('drain-gunner') >= 2) return false
    if (kind === 'drain-gunner' && count('arc-tech') > 0 && count(kind) >= 1) return false
    return true
  }

  // Filtration Beds must contain melee. Reserving it first prevents a ranged
  // roll from consuming the last usable budget point.
  if (roomRules.minimumMelee > 0) {
    const choices = NORMAL_MOB_KINDS.filter((kind) => MELEE_KINDS.has(kind) && legal(kind))
    const selected = choices[Math.floor(rng() * choices.length)]
    if (selected) {
      result.push(selected)
      budget -= MOB_STATS[selected].cost
    }
  }

  while (result.length < roomRules.maxMobs) {
    const choices = NORMAL_MOB_KINDS.filter(legal)
    if (choices.length === 0) break
    const weighted =
      roomType === 'maintenance-maze' && choices.includes('blade-runner')
        ? [...choices, 'blade-runner' as const]
        : choices
    const selected = weighted[Math.floor(rng() * weighted.length)]!
    result.push(selected)
    budget -= MOB_STATS[selected].cost
  }
  return result
}

function flatDirection(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const result = to.clone().sub(from)
  result.y = 0
  return result.lengthSq() > EPSILON ? result.normalize() : new THREE.Vector3(0, 0, 1)
}

function angleWithin(direction: THREE.Vector3, target: THREE.Vector3, degrees: number): boolean {
  return direction.dot(target) >= Math.cos(THREE.MathUtils.degToRad(degrees / 2))
}

function horizontalDistanceToSegment(
  point: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
): number {
  const segmentX = end.x - start.x
  const segmentZ = end.z - start.z
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ
  if (lengthSquared <= EPSILON) {
    return Math.hypot(point.x - start.x, point.z - start.z)
  }
  const t = THREE.MathUtils.clamp(
    ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSquared,
    0,
    1,
  )
  return Math.hypot(
    point.x - (start.x + segmentX * t),
    point.z - (start.z + segmentZ * t),
  )
}

function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    geometries.add(child.geometry)
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
    childMaterials.forEach((material) => materials.add(material))
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

export class DungeonCombat {
  private enemies: Enemy[] = []
  private projectiles: Projectile[] = []
  private fields: AreaField[] = []
  private readonly hitOwners = new Map<THREE.Mesh, Enemy>()
  private readonly raycaster = new THREE.Raycaster()
  private blockers: THREE.Mesh[] = []
  private nextEnemyId = 1
  private nextBurstId = 1
  private playerInvulnerability = 0
  private readonly burstHits = new Map<number, number>()

  constructor(
    private scene: THREE.Scene,
    private root: THREE.Group,
  ) {}

  spawnEncounter(
    mobs: {
      kind: MobKind
      position: THREE.Vector3
      scaleLevel: number
      roomCenter?: THREE.Vector3
    }[],
  ): void {
    this.clear()
    for (const mob of mobs) {
      this.spawnEnemy(mob.kind, mob.position, mob.scaleLevel, mob.roomCenter ?? mob.position)
    }
  }

  spawnBoss(position: THREE.Vector3, scaleLevel: number): void {
    this.clear()
    this.spawnEnemy('sump-king', position, scaleLevel, position)
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerAlive: boolean,
    onPlayerHit: (dmg: number) => void,
  ): void {
    const delta = Math.min(0.1, Math.max(0, dt))
    this.playerInvulnerability = Math.max(0, this.playerInvulnerability - delta)

    if (!playerAlive) {
      this.clearHostileEffects()
      this.playerInvulnerability = 0
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue
        this.clearTelegraph(enemy)
        enemy.mode = 'idle'
        enemy.timer = 0
        enemy.cooldown = Math.max(enemy.cooldown, ENCOUNTER_CONFIG.activationDelay)
        if (this.enemyPosition(enemy).distanceToSquared(enemy.roomCenter) > EPSILON) {
          this.moveEnemy(enemy, flatDirection(this.enemyPosition(enemy), enemy.roomCenter), delta)
        }
        this.refreshEnemyGlow(enemy)
      }
      return
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      enemy.cooldown = Math.max(0, enemy.cooldown - delta)
      enemy.flashTimer = Math.max(0, enemy.flashTimer - delta)
      if (enemy.kind === 'sump-king') {
        enemy.chargeCooldown = Math.max(0, enemy.chargeCooldown - delta)
        this.updateBoss(enemy, delta, playerPos, onPlayerHit)
      } else {
        this.updateNormalEnemy(enemy, delta, playerPos, onPlayerHit)
      }
      this.refreshEnemyGlow(enemy)
    }

    this.updateProjectiles(delta, playerPos, onPlayerHit)
    this.updateFields(delta, playerPos, onPlayerHit)
  }

  /** Player hitscan against dungeon enemies. Returns damage dealt info. */
  applyPlayerShot(
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3,
    damage: number,
    range: number,
    armorPen: number,
    isCrit: boolean,
  ): ShotResult | null {
    if (range <= 0 || rayDir.lengthSq() <= EPSILON) return null
    const hitMeshes = this.getHitMeshes()
    if (hitMeshes.length === 0) return null
    const blockers = this.blockers.filter((mesh) => mesh.geometry && this.isVisible(mesh))

    this.root.updateWorldMatrix(true, true)
    this.raycaster.set(rayOrigin, rayDir.clone().normalize())
    this.raycaster.near = 0
    this.raycaster.far = range
    const hit = this.raycaster.intersectObjects([...hitMeshes, ...blockers], false)[0]
    if (!hit) return null
    const enemy = this.hitOwners.get(hit.object as THREE.Mesh)
    if (!enemy) return null
    if (!enemy?.alive) return null

    let armor = enemy.stats.armor
    if (enemy.kind === 'shield-warden') {
      const toShooter = flatDirection(this.enemyPosition(enemy), rayOrigin)
      const facing = new THREE.Vector3(Math.sin(enemy.root.rotation.y), 0, Math.cos(enemy.root.rotation.y))
      if (angleWithin(facing, toShooter, MOB_BEHAVIOR.shieldWarden.shieldArcDegrees)) {
        armor += MOB_BEHAVIOR.shieldWarden.shieldBonusArmor
      }
    }

    const invulnerable = enemy.mode === 'boss-summon'
    const rawDamage = Math.max(0, damage) * (isCrit ? PLAYER_BASE_STATS.criticalMultiplier : 1)
    const dealt = invulnerable ? 0 : mitigateDamage(rawDamage, armor, Math.max(0, armorPen))
    if (dealt > 0) {
      enemy.hp = Math.max(0, enemy.hp - dealt)
      enemy.flashTimer = COMBAT_CONFIG.damageFlashDuration
      if (enemy.hp === 0) this.killEnemy(enemy)
    }

    return {
      enemyId: enemy.id,
      kind: enemy.kind,
      damage: dealt,
      remainingHp: enemy.hp,
      killed: !enemy.alive,
      isCrit,
      hitPoint: hit.point.clone(),
    }
  }

  getHitMeshes(): THREE.Mesh[] {
    return this.enemies.flatMap((enemy) => (enemy.alive ? enemy.hitMeshes : []))
  }

  setBlockers(meshes: THREE.Mesh[]): void {
    this.blockers = meshes
  }

  clear(): void {
    this.clearHostileEffects()
    for (const enemy of this.enemies) {
      this.clearTelegraph(enemy)
      enemy.root.removeFromParent()
      disposeObject(enemy.root)
    }
    this.enemies = []
    this.hitOwners.clear()
    this.burstHits.clear()
    this.playerInvulnerability = 0
  }

  allDead(): boolean {
    return this.enemies.every((enemy) => !enemy.alive)
  }

  getBossHp(): { current: number; max: number; name: string } | null {
    const boss = this.enemies.find((enemy) => enemy.kind === 'sump-king')
    return boss
      ? { current: boss.hp, max: boss.maxHp, name: MOB_STATS['sump-king'].name }
      : null
  }

  private spawnEnemy(
    kind: MobKind,
    position: THREE.Vector3,
    scaleLevel: number,
    roomCenter: THREE.Vector3,
  ): Enemy {
    const visual = createMobMesh(kind)
    const stats = scaleMobStats(kind, scaleLevel)
    this.root.updateWorldMatrix(true, false)
    visual.root.position.copy(this.root.worldToLocal(position.clone()))
    visual.root.userData.combatEnemyId = this.nextEnemyId
    this.root.add(visual.root)

    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      stats,
      root: visual.root,
      hitMeshes: visual.hitMeshes,
      materialStates: visual.mats.map((material) => ({
        material,
        emissive: material.emissive.clone(),
        intensity: material.emissiveIntensity,
      })),
      hp: stats.hp,
      maxHp: stats.hp,
      alive: true,
      roomCenter: roomCenter.clone(),
      mode: 'idle',
      timer: 0,
      cooldown: ENCOUNTER_CONFIG.activationDelay,
      chargeCooldown: BOSS_CONFIG.drainCharge.cooldown,
      attackDirection: new THREE.Vector3(0, 0, 1),
      dashRemaining: 0,
      attackHit: false,
      strafeDirection: Math.random() < 0.5 ? -1 : 1,
      flashTimer: 0,
      telegraph: null,
      summonThresholdsUsed: new Set<number>(),
    }
    this.enemies.push(enemy)
    for (const mesh of enemy.hitMeshes) this.hitOwners.set(mesh, enemy)
    return enemy
  }

  private enemyPosition(enemy: Enemy): THREE.Vector3 {
    return enemy.root.getWorldPosition(new THREE.Vector3())
  }

  private setEnemyPosition(enemy: Enemy, worldPosition: THREE.Vector3): void {
    enemy.root.position.copy(this.root.worldToLocal(worldPosition.clone()))
  }

  private face(enemy: Enemy, direction: THREE.Vector3): void {
    if (direction.lengthSq() > EPSILON) enemy.root.rotation.y = Math.atan2(direction.x, direction.z)
  }

  private moveEnemy(enemy: Enemy, desired: THREE.Vector3, dt: number, speed = enemy.stats.speed): void {
    const position = this.enemyPosition(enemy)
    const movement = desired.clone()
    movement.y = 0
    for (const other of this.enemies) {
      if (other === enemy || !other.alive) continue
      const away = position.clone().sub(this.enemyPosition(other))
      away.y = 0
      const distance = away.length()
      if (distance > EPSILON && distance < 1.4) {
        movement.addScaledVector(away.normalize(), (1.4 - distance) * 1.8)
      }
    }
    if (movement.lengthSq() <= EPSILON) return
    movement.normalize()
    this.face(enemy, movement)
    position.addScaledVector(movement, speed * dt)
    const fromCenter = position.clone().sub(enemy.roomCenter)
    fromCenter.y = 0
    if (fromCenter.length() > ROOM_LEASH_RADIUS) {
      fromCenter.setLength(ROOM_LEASH_RADIUS)
      position.x = enemy.roomCenter.x + fromCenter.x
      position.z = enemy.roomCenter.z + fromCenter.z
    }
    this.setEnemyPosition(enemy, position)
  }

  private updateNormalEnemy(
    enemy: Enemy,
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
  ): void {
    switch (enemy.kind) {
      case 'pipe-bruiser':
        this.updateBruiser(enemy, dt, playerPos, onPlayerHit)
        break
      case 'drain-gunner':
        this.updateGunner(enemy, dt, playerPos)
        break
      case 'blade-runner':
        this.updateBladeRunner(enemy, dt, playerPos, onPlayerHit)
        break
      case 'shield-warden':
        this.updateWarden(enemy, dt, playerPos, onPlayerHit)
        break
      case 'arc-tech':
        this.updateArcTech(enemy, dt, playerPos)
        break
    }
  }

  private idleSteering(
    enemy: Enemy,
    playerPos: THREE.Vector3,
    desiredMin: number,
    desiredMax: number,
  ): THREE.Vector3 {
    const position = this.enemyPosition(enemy)
    if (position.distanceTo(playerPos) > MOB_BEHAVIOR.leashDistance) {
      return flatDirection(position, enemy.roomCenter)
    }
    const toward = flatDirection(position, playerPos)
    const distance = position.distanceTo(playerPos)
    if (distance < desiredMin) return toward.multiplyScalar(-1)
    if (distance > desiredMax) return toward
    return new THREE.Vector3(toward.z * enemy.strafeDirection, 0, -toward.x * enemy.strafeDirection)
  }

  private updateBruiser(
    enemy: Enemy,
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
  ): void {
    const position = this.enemyPosition(enemy)
    const distance = position.distanceTo(playerPos)
    if (enemy.mode === 'idle') {
      const toward = flatDirection(position, playerPos)
      this.face(enemy, toward)
      if (enemy.cooldown <= 0 && distance <= enemy.stats.range) {
        this.beginWindup(enemy, enemy.stats.windup ?? 0.55, toward)
      } else {
        this.moveEnemy(enemy, toward, dt)
      }
      return
    }
    if (enemy.mode === 'windup') {
      enemy.timer -= dt
      if (enemy.timer <= 0) {
        if (this.playerInArc(enemy, playerPos, enemy.stats.range + 0.25, MOB_BEHAVIOR.pipeBruiser.swingArcDegrees)) {
          this.tryPlayerHit(enemy.stats.damage, onPlayerHit)
        }
        enemy.mode = 'recovery'
        enemy.timer = enemy.stats.recovery ?? 0.45
      }
      return
    }
    this.finishRecovery(enemy, dt)
  }

  private updateGunner(enemy: Enemy, dt: number, playerPos: THREE.Vector3): void {
    const position = this.enemyPosition(enemy)
    const distance = position.distanceTo(playerPos)
    if (enemy.mode === 'idle') {
      const toward = flatDirection(position, playerPos)
      this.face(enemy, toward)
      if (enemy.cooldown <= 0 && distance <= enemy.stats.range) {
        enemy.mode = 'windup'
        enemy.timer = enemy.stats.windup ?? 0.25
        enemy.attackDirection.copy(toward)
        enemy.telegraph = this.createLine(position, playerPos, 0xff2438, 0.06, 1.35)
      } else {
        this.moveEnemy(
          enemy,
          this.idleSteering(enemy, playerPos, 8, 12),
          dt,
        )
      }
      return
    }
    if (enemy.mode === 'windup') {
      const toward = flatDirection(this.enemyPosition(enemy), playerPos)
      enemy.attackDirection.copy(toward)
      this.face(enemy, toward)
      this.updateLine(enemy.telegraph, this.enemyPosition(enemy), playerPos)
      enemy.timer -= dt
      if (enemy.timer <= 0) {
        this.spawnProjectile(
          this.enemyPosition(enemy).add(new THREE.Vector3(0, 1.25, 0)),
          toward,
          MOB_BEHAVIOR.drainGunner.projectileSpeed,
          MOB_BEHAVIOR.drainGunner.projectileLifetime,
          enemy.stats.damage,
          'bullet',
        )
        this.clearTelegraph(enemy)
        enemy.mode = 'idle'
        enemy.cooldown = enemy.stats.cooldown
      }
    }
  }

  private updateBladeRunner(
    enemy: Enemy,
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
  ): void {
    const position = this.enemyPosition(enemy)
    const distance = position.distanceTo(playerPos)
    if (enemy.mode === 'idle') {
      const toward = flatDirection(position, playerPos)
      this.face(enemy, toward)
      if (
        enemy.cooldown <= 0 &&
        distance >= MOB_BEHAVIOR.bladeRunner.circleRangeMin &&
        distance <= MOB_BEHAVIOR.bladeRunner.circleRangeMax
      ) {
        this.beginWindup(enemy, enemy.stats.windup ?? 0.35, toward)
        enemy.telegraph = this.createLine(position, playerPos, 0xff2da8, 0.12, 1.1)
      } else {
        this.moveEnemy(
          enemy,
          this.idleSteering(
            enemy,
            playerPos,
            MOB_BEHAVIOR.bladeRunner.circleRangeMin,
            MOB_BEHAVIOR.bladeRunner.circleRangeMax,
          ),
          dt,
        )
      }
      return
    }
    if (enemy.mode === 'windup') {
      this.updateLine(enemy.telegraph, this.enemyPosition(enemy), playerPos)
      enemy.timer -= dt
      if (enemy.timer <= 0) {
        enemy.attackDirection.copy(flatDirection(this.enemyPosition(enemy), playerPos))
        enemy.dashRemaining = MOB_BEHAVIOR.bladeRunner.dashDistance
        enemy.attackHit = false
        enemy.mode = 'dash'
        this.clearTelegraph(enemy)
      }
      return
    }
    if (enemy.mode === 'dash') {
      const travel = Math.min(enemy.dashRemaining, MOB_BEHAVIOR.bladeRunner.dashSpeed * dt)
      this.moveEnemy(enemy, enemy.attackDirection, travel / MOB_BEHAVIOR.bladeRunner.dashSpeed, MOB_BEHAVIOR.bladeRunner.dashSpeed)
      enemy.dashRemaining -= travel
      if (!enemy.attackHit && this.enemyPosition(enemy).distanceTo(playerPos) <= enemy.stats.range) {
        enemy.attackHit = true
        this.tryPlayerHit(enemy.stats.damage, onPlayerHit)
      }
      if (enemy.dashRemaining <= EPSILON) {
        enemy.mode = 'recovery'
        enemy.timer = enemy.stats.recovery ?? 0.5
      }
      return
    }
    this.finishRecovery(enemy, dt)
  }

  private updateWarden(
    enemy: Enemy,
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
  ): void {
    const position = this.enemyPosition(enemy)
    const toward = flatDirection(position, playerPos)
    if (enemy.mode === 'idle') {
      this.face(enemy, toward)
      if (enemy.cooldown <= 0 && position.distanceTo(playerPos) <= enemy.stats.range) {
        this.beginWindup(enemy, enemy.stats.windup ?? 0.65, toward)
      } else {
        this.moveEnemy(enemy, toward, dt)
      }
      return
    }
    if (enemy.mode === 'windup') {
      enemy.timer -= dt
      if (enemy.timer <= 0) {
        if (this.playerInArc(enemy, playerPos, 2.1, MOB_BEHAVIOR.shieldWarden.shieldArcDegrees)) {
          this.tryPlayerHit(enemy.stats.damage, onPlayerHit)
        }
        enemy.mode = 'recovery'
        enemy.timer = 0.35
      }
      return
    }
    this.finishRecovery(enemy, dt)
  }

  private updateArcTech(enemy: Enemy, dt: number, playerPos: THREE.Vector3): void {
    const position = this.enemyPosition(enemy)
    const distance = position.distanceTo(playerPos)
    if (enemy.mode === 'idle') {
      const toward = flatDirection(position, playerPos)
      this.face(enemy, toward)
      if (enemy.cooldown <= 0 && distance <= enemy.stats.range) {
        enemy.mode = 'windup'
        enemy.timer = enemy.stats.windup ?? 0.6
        enemy.attackDirection.copy(toward)
        enemy.telegraph = this.createChargeOrb(position, 0x25e8ff)
      } else {
        this.moveEnemy(enemy, this.idleSteering(enemy, playerPos, 7, 11), dt)
      }
      return
    }
    if (enemy.mode === 'windup') {
      const toward = flatDirection(this.enemyPosition(enemy), playerPos)
      enemy.attackDirection.copy(toward)
      this.face(enemy, toward)
      if (enemy.telegraph) {
        const orbPosition = this.enemyPosition(enemy).addScaledVector(toward, 0.8)
        orbPosition.y += 1.35
        this.setObjectWorldPosition(enemy.telegraph, orbPosition)
        enemy.telegraph.scale.setScalar(1 + 0.25 * Math.sin(enemy.timer * 28))
      }
      enemy.timer -= dt
      if (enemy.timer <= 0) {
        this.spawnProjectile(
          this.enemyPosition(enemy).add(new THREE.Vector3(0, 1.25, 0)),
          toward,
          MOB_BEHAVIOR.arcTech.orbSpeed,
          MOB_BEHAVIOR.arcTech.orbLifetime,
          enemy.stats.damage,
          'arc-orb',
        )
        this.clearTelegraph(enemy)
        enemy.mode = 'idle'
        enemy.cooldown = enemy.stats.cooldown
      }
    }
  }

  private updateBoss(
    boss: Enemy,
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
  ): void {
    const hpFraction = boss.hp / boss.maxHp
    const pendingThreshold = BOSS_CONFIG.phaseThresholds.find(
      (threshold) => hpFraction <= threshold && !boss.summonThresholdsUsed.has(threshold),
    )
    if (pendingThreshold !== undefined && boss.mode !== 'boss-summon') {
      boss.summonThresholdsUsed.add(pendingThreshold)
      this.clearTelegraph(boss)
      boss.mode = 'boss-summon'
      boss.timer = BOSS_CONFIG.phaseInvulnerability
      boss.telegraph = this.createSummonMarks(boss)
    }

    const position = this.enemyPosition(boss)
    const toward = flatDirection(position, playerPos)
    const distance = position.distanceTo(playerPos)
    const finalPhase = hpFraction < BOSS_CONFIG.phaseThresholds[1]
    const speed = finalPhase ? BOSS_CONFIG.finalPhaseSpeed : boss.stats.speed

    switch (boss.mode) {
      case 'idle':
        this.face(boss, toward)
        if (boss.chargeCooldown <= 0) {
          boss.mode = 'boss-charge-windup'
          boss.timer = BOSS_CONFIG.drainCharge.telegraph
          boss.attackDirection.copy(toward)
          boss.telegraph = this.createLane(
            position,
            toward,
            BOSS_CONFIG.drainCharge.distance,
            1.7,
            0xff7626,
          )
        } else if (boss.cooldown <= 0 && distance <= BOSS_CONFIG.slam.triggerRange) {
          boss.mode = 'boss-slam'
          boss.timer = BOSS_CONFIG.slam.telegraph
          boss.attackDirection.copy(toward)
          boss.telegraph = this.createCone(
            position,
            toward,
            BOSS_CONFIG.slam.radius,
            BOSS_CONFIG.slam.arcDegrees,
            0xff7626,
          )
        } else if (boss.cooldown <= 0) {
          boss.mode = 'boss-burst'
          boss.timer = BOSS_CONFIG.scrapBurst.telegraph
          boss.attackDirection.copy(toward)
          boss.telegraph = this.createLine(position, playerPos, 0xff2438, 0.1, 1.5)
        } else {
          this.moveEnemy(boss, toward, dt, speed)
        }
        break

      case 'boss-slam':
        boss.timer -= dt
        if (boss.timer <= 0) {
          if (this.playerInArc(boss, playerPos, BOSS_CONFIG.slam.radius, BOSS_CONFIG.slam.arcDegrees)) {
            this.tryPlayerHit(
              this.scaledBossAttackDamage(boss, BOSS_CONFIG.slam.damage),
              onPlayerHit,
            )
          }
          this.clearTelegraph(boss)
          boss.mode = 'recovery'
          boss.timer = BOSS_CONFIG.slam.recovery
        }
        break

      case 'boss-burst':
        boss.attackDirection.copy(flatDirection(this.enemyPosition(boss), playerPos))
        this.face(boss, boss.attackDirection)
        this.updateLine(boss.telegraph, this.enemyPosition(boss), playerPos)
        boss.timer -= dt
        if (boss.timer <= 0) {
          const burstId = this.nextBurstId++
          const count = BOSS_CONFIG.scrapBurst.projectileCount
          for (let index = 0; index < count; index += 1) {
            const t = index / (count - 1) - 0.5
            const direction = boss.attackDirection
              .clone()
              .applyAxisAngle(
                new THREE.Vector3(0, 1, 0),
                THREE.MathUtils.degToRad(BOSS_CONFIG.scrapBurst.fanDegrees) * t,
              )
            this.spawnProjectile(
              this.enemyPosition(boss).add(new THREE.Vector3(0, 1.45, 0)),
              direction,
              BOSS_CONFIG.scrapBurst.projectileSpeed,
              1.8,
              this.scaledBossAttackDamage(boss, BOSS_CONFIG.scrapBurst.damage),
              'bullet',
              burstId,
            )
          }
          this.clearTelegraph(boss)
          boss.mode = 'idle'
          boss.cooldown = finalPhase
            ? BOSS_CONFIG.finalPhaseScrapBurstCooldown
            : BOSS_CONFIG.scrapBurst.cooldown
        }
        break

      case 'boss-charge-windup':
        boss.timer -= dt
        if (boss.timer <= 0) {
          boss.mode = 'boss-charge'
          boss.dashRemaining = BOSS_CONFIG.drainCharge.distance
          boss.attackHit = false
          boss.chargeCooldown = BOSS_CONFIG.drainCharge.cooldown
          this.clearTelegraph(boss)
        }
        break

      case 'boss-charge': {
        const travel = Math.min(
          boss.dashRemaining,
          BOSS_CONFIG.drainCharge.speed * dt,
        )
        this.moveEnemy(
          boss,
          boss.attackDirection,
          travel / BOSS_CONFIG.drainCharge.speed,
          BOSS_CONFIG.drainCharge.speed,
        )
        boss.dashRemaining -= travel
        if (!boss.attackHit && this.enemyPosition(boss).distanceTo(playerPos) <= 1.5) {
          boss.attackHit = true
          this.tryPlayerHit(
            this.scaledBossAttackDamage(boss, BOSS_CONFIG.drainCharge.damage),
            onPlayerHit,
          )
        }
        if (boss.dashRemaining <= EPSILON) {
          boss.mode = 'boss-vulnerable'
          boss.timer = BOSS_CONFIG.drainCharge.vulnerableDuration
        }
        break
      }

      case 'boss-vulnerable':
        boss.timer -= dt
        if (boss.timer <= 0) boss.mode = 'idle'
        break

      case 'boss-summon':
        boss.timer -= dt
        if (boss.timer <= 0) {
          this.clearTelegraph(boss)
          this.summonBossAdds(boss)
          boss.mode = 'idle'
          boss.cooldown = 0.5
        }
        break

      case 'recovery':
        this.finishRecovery(boss, dt)
        break

      default:
        boss.mode = 'idle'
    }
  }

  private scaledBossAttackDamage(boss: Enemy, baseDamage: number): number {
    return Math.ceil(baseDamage * (boss.stats.damage / MOB_STATS['sump-king'].damage))
  }

  private summonBossAdds(boss: Enemy): void {
    const aliveAdds = this.enemies.filter(
      (enemy) => enemy.alive && enemy.kind !== 'sump-king',
    ).length
    const available = BOSS_CONFIG.maximumSummonsAlive - aliveAdds
    if (available <= 0) return
    const level = Math.max(
      1,
      Math.round(
        1 +
          (boss.maxHp / MOB_STATS['sump-king'].hp - 1) /
            0.1,
      ),
    )
    const summons: NormalMobKind[] = ['pipe-bruiser', 'blade-runner']
    const positions = this.bossSummonPositions(boss)
    for (let index = 0; index < Math.min(available, summons.length); index += 1) {
      this.spawnEnemy(summons[index]!, positions[index]!, level, boss.roomCenter)
    }
  }

  private bossSummonPositions(boss: Enemy): [THREE.Vector3, THREE.Vector3] {
    const bossPosition = this.enemyPosition(boss)
    return [Math.PI * 0.75, -Math.PI * 0.25].map((angle) =>
      bossPosition
        .clone()
        .add(new THREE.Vector3(Math.sin(angle) * 4.5, 0, Math.cos(angle) * 4.5)),
    ) as [THREE.Vector3, THREE.Vector3]
  }

  private beginWindup(enemy: Enemy, duration: number, direction: THREE.Vector3): void {
    enemy.mode = 'windup'
    enemy.timer = duration
    enemy.attackDirection.copy(direction)
    this.face(enemy, direction)
  }

  private finishRecovery(enemy: Enemy, dt: number): void {
    enemy.timer -= dt
    if (enemy.timer <= 0) {
      enemy.mode = 'idle'
      enemy.cooldown = enemy.stats.cooldown
    }
  }

  private playerInArc(
    enemy: Enemy,
    playerPos: THREE.Vector3,
    range: number,
    degrees: number,
  ): boolean {
    const position = this.enemyPosition(enemy)
    if (position.distanceTo(playerPos) > range + COMBAT_CONFIG.playerCollisionRadius) return false
    return angleWithin(enemy.attackDirection, flatDirection(position, playerPos), degrees)
  }

  private tryPlayerHit(damage: number, onPlayerHit: (damage: number) => void): boolean {
    if (this.playerInvulnerability > 0) return false
    this.playerInvulnerability = COMBAT_CONFIG.playerDamageInvulnerability
    onPlayerHit(damage)
    return true
  }

  private killEnemy(enemy: Enemy): void {
    enemy.alive = false
    this.clearTelegraph(enemy)
    enemy.root.visible = false
    for (const mesh of enemy.hitMeshes) this.hitOwners.delete(mesh)
  }

  private spawnProjectile(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    lifetime: number,
    damage: number,
    kind: Projectile['kind'],
    burstId = 0,
  ): void {
    const color = kind === 'arc-orb' ? 0x25e8ff : 0xff384b
    const radius = kind === 'arc-orb' ? 0.3 : COMBAT_CONFIG.enemyProjectileRadius
    const material = new THREE.MeshBasicMaterial({ color })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material)
    mesh.name = `dungeon-${kind}`
    this.setObjectWorldPosition(mesh, position)
    this.root.add(mesh)
    this.projectiles.push({
      mesh,
      position: position.clone(),
      velocity: direction.clone().normalize().multiplyScalar(speed),
      lifetime,
      damage,
      kind,
      burstId,
    })
  }

  private updateProjectiles(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
  ): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index]!
      const next = projectile.position.clone().addScaledVector(projectile.velocity, dt)
      projectile.lifetime -= dt
      const hitWall = this.segmentHitsWall(projectile.position, next)
      const hitPlayer =
        horizontalDistanceToSegment(playerPos, projectile.position, next) <=
        COMBAT_CONFIG.enemyProjectileRadius + COMBAT_CONFIG.playerCollisionRadius

      if (projectile.kind === 'arc-orb' && (hitWall || hitPlayer || projectile.lifetime <= 0)) {
        this.createAreaField(hitWall ? projectile.position : next, projectile.damage)
        this.removeProjectile(index)
        continue
      }
      if (hitWall || projectile.lifetime <= 0) {
        this.removeProjectile(index)
        continue
      }
      if (hitPlayer) {
        const priorHits = this.burstHits.get(projectile.burstId) ?? 0
        if (
          projectile.burstId === 0 ||
          priorHits < BOSS_CONFIG.scrapBurst.maximumHitsPerBurst
        ) {
          if (this.tryPlayerHit(projectile.damage, onPlayerHit) && projectile.burstId !== 0) {
            this.burstHits.set(projectile.burstId, priorHits + 1)
          }
        }
        this.removeProjectile(index)
        continue
      }
      projectile.position.copy(next)
      this.setObjectWorldPosition(projectile.mesh, next)
    }
  }

  private createAreaField(position: THREE.Vector3, damage: number): void {
    const mesh = this.createRing(position, MOB_BEHAVIOR.arcTech.fieldRadius, 0xff962d)
    mesh.name = 'dungeon-arc-field-warning'
    this.fields.push({
      mesh: mesh as THREE.Mesh,
      position: position.clone(),
      timer: MOB_BEHAVIOR.arcTech.fieldWarning,
      damage,
    })
  }

  private updateFields(
    dt: number,
    playerPos: THREE.Vector3,
    onPlayerHit: (damage: number) => void,
  ): void {
    for (let index = this.fields.length - 1; index >= 0; index -= 1) {
      const field = this.fields[index]!
      field.timer -= dt
      field.mesh.scale.setScalar(1 + 0.06 * Math.sin(field.timer * 34))
      if (field.timer > 0) continue
      if (
        Math.hypot(field.position.x - playerPos.x, field.position.z - playerPos.z) <=
        MOB_BEHAVIOR.arcTech.fieldRadius + COMBAT_CONFIG.playerCollisionRadius
      ) {
        this.tryPlayerHit(field.damage, onPlayerHit)
      }
      this.removeField(index)
    }
  }

  private segmentHitsWall(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from)
    const length = direction.length()
    if (length <= EPSILON) return false
    const blockers: THREE.Mesh[] = []
    const seen = new Set<THREE.Object3D>()
    const collect = (object: THREE.Object3D) => {
      if (seen.has(object)) return
      seen.add(object)
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !this.isVisible(child)) return
        if (
          child.name.startsWith('solid-wall-') ||
          child.name.startsWith('door-wall-') ||
          child.name.startsWith('door-lintel-') ||
          (child.name.startsWith('door-slab-') && child.visible)
        ) {
          blockers.push(child)
        }
      })
    }
    collect(this.scene)
    collect(this.root)
    if (blockers.length === 0) return false
    this.scene.updateMatrixWorld(true)
    this.root.updateWorldMatrix(true, true)
    this.raycaster.set(from, direction.normalize())
    this.raycaster.near = 0
    this.raycaster.far = length + COMBAT_CONFIG.enemyProjectileRadius
    return this.raycaster.intersectObjects(blockers, false).length > 0
  }

  private isVisible(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object
    while (current) {
      if (!current.visible) return false
      current = current.parent
    }
    return true
  }

  private removeProjectile(index: number): void {
    const [projectile] = this.projectiles.splice(index, 1)
    if (!projectile) return
    projectile.mesh.removeFromParent()
    disposeObject(projectile.mesh)
  }

  private removeField(index: number): void {
    const [field] = this.fields.splice(index, 1)
    if (!field) return
    field.mesh.removeFromParent()
    disposeObject(field.mesh)
  }

  private clearHostileEffects(): void {
    while (this.projectiles.length > 0) this.removeProjectile(this.projectiles.length - 1)
    while (this.fields.length > 0) this.removeField(this.fields.length - 1)
    this.burstHits.clear()
  }

  private createLine(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: number,
    width: number,
    y: number,
  ): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 1), material)
    mesh.name = 'dungeon-aim-telegraph'
    mesh.userData.telegraphY = y
    this.root.add(mesh)
    this.updateLine(mesh, from, to)
    return mesh
  }

  private updateLine(object: THREE.Object3D | null, from: THREE.Vector3, to: THREE.Vector3): void {
    if (!(object instanceof THREE.Mesh)) return
    const start = from.clone()
    const end = to.clone()
    const y = Number(object.userData.telegraphY ?? 0.06)
    start.y = y
    end.y = y
    const midpoint = start.clone().add(end).multiplyScalar(0.5)
    this.setObjectWorldPosition(object, midpoint)
    object.scale.z = Math.max(0.01, start.distanceTo(end))
    object.rotation.y = Math.atan2(end.x - start.x, end.z - start.z)
  }

  private createLane(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    width: number,
    color: number,
  ): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material)
    mesh.name = 'dungeon-charge-lane'
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.z = Math.atan2(direction.x, direction.z)
    const center = position.clone().addScaledVector(direction, length / 2)
    center.y = 0.045
    this.setObjectWorldPosition(mesh, center)
    this.root.add(mesh)
    return mesh
  }

  private createRing(position: THREE.Vector3, radius: number, color: number): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.05, radius - 0.14), radius, 32),
      material,
    )
    mesh.rotation.x = -Math.PI / 2
    const center = position.clone()
    center.y = 0.055
    this.setObjectWorldPosition(mesh, center)
    this.root.add(mesh)
    return mesh
  }

  private createSummonMarks(boss: Enemy): THREE.Group {
    const group = new THREE.Group()
    group.name = 'dungeon-summon-grate-warnings'
    for (const position of this.bossSummonPositions(boss)) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff842d,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 24), material)
      ring.rotation.x = -Math.PI / 2
      position.y = 0.06
      ring.position.copy(this.root.worldToLocal(position.clone()))
      group.add(ring)
    }
    this.root.add(group)
    return group
  }

  private createCone(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    arcDegrees: number,
    color: number,
  ): THREE.Mesh {
    const points: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)]
    const halfArc = THREE.MathUtils.degToRad(arcDegrees / 2)
    for (let index = 0; index <= 20; index += 1) {
      const angle = -halfArc + (halfArc * 2 * index) / 20
      points.push(new THREE.Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    geometry.setIndex(Array.from({ length: 20 }, (_, index) => [0, index + 1, index + 2]).flat())
    geometry.computeVertexNormals()
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'dungeon-slam-cone'
    mesh.rotation.y = Math.atan2(direction.x, direction.z)
    const center = position.clone()
    center.y = 0.05
    this.setObjectWorldPosition(mesh, center)
    this.root.add(mesh)
    return mesh
  }

  private createChargeOrb(position: THREE.Vector3, color: number): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), material)
    mesh.name = 'dungeon-charge-orb'
    const orbPosition = position.clone()
    orbPosition.y += 1.35
    this.setObjectWorldPosition(mesh, orbPosition)
    this.root.add(mesh)
    return mesh
  }

  private setObjectWorldPosition(object: THREE.Object3D, position: THREE.Vector3): void {
    object.position.copy(this.root.worldToLocal(position.clone()))
  }

  private clearTelegraph(enemy: Enemy): void {
    if (!enemy.telegraph) return
    enemy.telegraph.removeFromParent()
    disposeObject(enemy.telegraph)
    enemy.telegraph = null
  }

  private refreshEnemyGlow(enemy: Enemy): void {
    let color: number | null = null
    let intensity = 0
    if (enemy.flashTimer > 0) {
      color = 0xffffff
      intensity = 1.25
    } else if (
      enemy.mode === 'windup' ||
      enemy.mode === 'boss-slam' ||
      enemy.mode === 'boss-charge-windup' ||
      enemy.mode === 'boss-summon'
    ) {
      color =
        enemy.kind === 'blade-runner'
          ? 0xff2da8
          : enemy.kind === 'arc-tech'
            ? 0x25e8ff
            : 0xff7626
      intensity = 1.05
    } else if (enemy.mode === 'boss-burst') {
      color = 0xff263d
      intensity = 1.05
    } else if (enemy.mode === 'dash') {
      color = 0xff2da8
      intensity = 0.9
    }

    for (const state of enemy.materialStates) {
      if (color === null) {
        state.material.emissive.copy(state.emissive)
        state.material.emissiveIntensity = state.intensity
      } else {
        state.material.emissive.setHex(color)
        state.material.emissiveIntensity = intensity
      }
    }
  }
}
