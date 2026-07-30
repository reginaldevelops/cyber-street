import * as THREE from 'three'
import {
  DEATH_CONFIG,
  ITEM_CATALOG,
  LOOT_WORLD_CONFIG,
  PLAYER_BASE_STATS,
  RARITY_CONFIG,
  mitigateDamage,
} from './dungeonConfig.js'
import { DungeonCombat, pickEncounterComposition, type ShotResult } from './dungeonCombat.js'
import { generateDungeon, OPPOSITE_DIRECTION } from './dungeonGenerator.js'
import { DungeonHud } from './dungeonHud.js'
import {
  awardMobProgress,
  createDefaultProgress,
  deriveArmor,
  deriveWeaponStats,
  equip,
  rollLoot,
  scrapItem,
  tickProgressEffects,
  totalArmor,
  tryAddItem,
  useConsumable,
} from './dungeonInventory.js'
import { mulberry32, type RandomSource } from './dungeonRng.js'
import { buildDoorBridge, buildRoomMesh, type BuiltRoom } from './dungeonRooms.js'
import type {
  ConsumableItemId,
  Direction,
  DungeonRoom,
  GeneratedDungeon,
  ItemInstance,
  MobKind,
  PlayerProgress,
  WeaponStats,
} from './dungeonTypes.js'

export interface DungeonFireResult {
  fired: boolean
  muzzle: THREE.Vector3
  rays: {
    end: THREE.Vector3
    hit: ShotResult | null
  }[]
}

interface LiveRoom {
  data: DungeonRoom
  built: BuiltRoom
  encounterKinds: MobKind[]
}

interface WorldLoot {
  root: THREE.Group
  item: ItemInstance
  label: string
}

/**
 * Owns a single sewer dungeon run: rooms, combat, loot, HUD, player RPG progress.
 */
export class DungeonSystem {
  private root = new THREE.Group()
  private combat: DungeonCombat
  private hud = new DungeonHud()
  private generated: GeneratedDungeon | null = null
  private rooms = new Map<number, LiveRoom>()
  private colliders: THREE.Mesh[] = []
  private activeRoomId: number | null = null
  private progress: PlayerProgress = createDefaultProgress()
  private rng: RandomSource = Math.random
  private ammo = PLAYER_BASE_STATS.magazine as number
  private reloading = 0
  private fireCooldown = 0
  private invuln = 0
  private dead = false
  private deathTimer = 0
  private loot: WorldLoot[] = []
  private paused = false
  private bossCleared = false
  private runActive = false
  private protectedScrap = 0
  private seed = 0
  private lastPlayerPos = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  constructor(private scene: THREE.Scene) {
    this.root.name = 'dungeon-root'
    this.root.visible = false
    this.scene.add(this.root)
    this.combat = new DungeonCombat(this.scene, this.root)
    this.hud.hide()
    this.hud.bindInventoryActions({
      equip: (i) => {
        equip(this.progress, i)
        this.clampAmmoToMagazine()
        this.refreshHud()
      },
      scrap: (i) => {
        scrapItem(this.progress, i)
        this.clampAmmoToMagazine()
        this.refreshHud()
      },
      use: (i) => {
        useConsumable(this.progress, i)
        this.refreshHud()
      },
      close: () => this.closeInventory(),
    })
  }

  get isActive(): boolean {
    return this.runActive
  }

  get playerProgress(): PlayerProgress {
    return this.progress
  }

  get worldColliders(): THREE.Mesh[] {
    return this.colliders
  }

  canExit(): boolean {
    return this.bossCleared
  }

  acceptsInput(): boolean {
    return this.runActive && !this.paused && !this.dead && !this.hud.isInventoryOpen()
  }

  getSpawnPosition(): THREE.Vector3 {
    const entrance = this.rooms.get(0)
    if (!entrance) return new THREE.Vector3(0, 0, 280)
    return new THREE.Vector3(entrance.data.worldX, 0, entrance.data.worldZ)
  }

  getExitPosition(): THREE.Vector3 {
    return this.rooms.get(0)?.built.exitAnchor?.clone() ?? this.getSpawnPosition()
  }

  /** Start a fresh run. Returns spawn world position. */
  enter(seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0): THREE.Vector3 {
    this.exit(false)
    this.generated = generateDungeon(seed)
    this.seed = this.generated.seed
    this.rng = mulberry32(this.generated.seed ^ 0x9e3779b9)
    this.progress.hp = this.progress.maxHp
    this.protectedScrap = this.progress.scrap
    this.ammo = deriveWeaponStats(this.progress).magazine
    this.reloading = 0
    this.fireCooldown = 0
    this.invuln = 1
    this.dead = false
    this.deathTimer = 0
    this.bossCleared = false
    this.activeRoomId = null
    this.paused = false

    this.buildWorld()
    this.root.visible = true
    this.runActive = true
    this.hud.show()
    this.refreshHud()
    this.hud.showBanner('WALK THROUGH OPEN DOORS — MOBS GUARD EACH ROOM', 2800)
    this.hud.updateRoomProgress(0, 4, this.seed)
    return this.getSpawnPosition()
  }

  /** Yaw toward the first connected room so the player faces an exit. */
  getSpawnFacing(): number {
    const entrance = this.rooms.get(0)
    if (!entrance) return 0
    const dirs = Object.keys(entrance.data.neighbors) as Direction[]
    if (dirs.length === 0) return 0
    const dir = dirs[0]!
    if (dir === 'N') return Math.PI
    if (dir === 'S') return 0
    if (dir === 'E') return Math.PI / 2
    return -Math.PI / 2
  }

  exit(hideHud = true): void {
    this.combat.clear()
    this.combat.setBlockers([])
    this.clearLoot()
    for (const room of this.rooms.values()) {
      room.built.root.removeFromParent()
      this.disposeObject(room.built.root)
    }
    this.rooms.clear()
    this.colliders = []
    while (this.root.children.length) {
      const child = this.root.children[0]!
      this.root.remove(child)
      this.disposeObject(child)
    }
    this.root.visible = false
    this.runActive = false
    this.generated = null
    this.activeRoomId = null
    if (hideHud) this.hud.hide()
  }

  dispose(): void {
    this.exit()
    this.hud.dispose()
    this.root.removeFromParent()
  }

  toggleInventory(): void {
    if (!this.runActive) return
    if (this.hud.isInventoryOpen()) this.closeInventory()
    else {
      this.paused = true
      this.hud.openInventory(this.progress)
    }
  }

  closeInventory(): void {
    this.hud.closeInventory()
    this.paused = false
    this.refreshHud()
  }

  tryPickup(): boolean {
    if (!this.runActive || this.dead || this.paused) return false
    return this.interact(this.lastPlayerPos) === 'pickup'
  }

  useHotkey(slot: 1 | 2 | 3): void {
    if (!this.runActive || this.dead || this.paused) return
    const ids = ['med-gel-injector', 'ablative-patch', 'redline-ampoule'] as const satisfies readonly ConsumableItemId[]
    const ok = useConsumable(this.progress, ids[slot - 1]!)
    if (ok) {
      this.hud.showBanner(ITEM_CATALOG[ids[slot - 1]!].name.toUpperCase(), 900)
      this.refreshHud()
    }
  }

  startReload(): void {
    if (!this.runActive || this.dead || this.paused) return
    const w = deriveWeaponStats(this.progress)
    if (this.reloading > 0 || this.ammo >= w.magazine) return
    this.reloading = w.reload
  }

  /**
   * Fire using derived weapon stats. Returns tracer endpoints for the game to render.
   */
  tryFire(
    muzzle: THREE.Vector3,
    aimPoint: THREE.Vector3,
    faceYaw: number,
  ): DungeonFireResult {
    const empty: DungeonFireResult = {
      fired: false,
      muzzle: muzzle.clone(),
      rays: [],
    }
    if (!this.runActive || this.dead || this.paused) return empty
    if (this.reloading > 0 || this.fireCooldown > 0) return empty

    const w = deriveWeaponStats(this.progress)
    if (this.ammo <= 0) {
      this.startReload()
      return empty
    }

    // Fire arc vs body facing
    const dx = aimPoint.x - muzzle.x
    const dz = aimPoint.z - muzzle.z
    const len = Math.hypot(dx, dz)
    if (len < 0.2) return empty
    const fx = Math.sin(faceYaw)
    const fz = Math.cos(faceYaw)
    const dot = (fx * dx + fz * dz) / len
    if (dot < Math.cos((100 * Math.PI) / 180)) return empty

    this.ammo -= 1
    this.fireCooldown = w.fireInterval
    if (this.ammo <= 0) this.startReload()

    const rays: DungeonFireResult['rays'] = []
    const baseDir = new THREE.Vector3(dx, aimPoint.y - muzzle.y, dz).normalize()

    for (let ray = 0; ray < w.raysPerShot; ray++) {
      const dir = baseDir.clone()
      if (w.spreadDegrees > 0) {
        const yaw =
          ((Math.random() - 0.5) * w.spreadDegrees * Math.PI) / 180
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      }
      const isCrit = Math.random() < w.criticalChance
      const hit = this.combat.applyPlayerShot(
        muzzle,
        dir,
        w.damage,
        w.range,
        w.armorPenetration,
        isCrit,
      )
      if (hit) {
        rays.push({ end: hit.hitPoint.clone(), hit })
        this.onEnemyShot(hit, w)
      } else {
        rays.push({
          end: muzzle.clone().addScaledVector(dir, w.range * 0.7),
          hit: null,
        })
      }
    }

    this.refreshHud()
    return { fired: true, muzzle: muzzle.clone(), rays }
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    aimPoint: THREE.Vector3,
    camera: THREE.Camera,
    rendererDom: HTMLElement,
  ): void {
    if (!this.runActive) return

    if (this.hud.isInventoryOpen()) {
      this.paused = true
      return
    }
    this.paused = false

    if (this.dead) {
      this.deathTimer -= dt
      if (this.deathTimer <= 0) this.respawn(playerPos)
      return
    }

    tickProgressEffects(this.progress, dt)
    this.invuln = Math.max(0, this.invuln - dt)
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    if (this.reloading > 0) {
      this.reloading -= dt
      if (this.reloading <= 0) {
        this.reloading = 0
        this.ammo = deriveWeaponStats(this.progress).magazine
      }
    }

    this.updateRoomPresence(playerPos)
    this.combat.update(dt, playerPos, true, (dmg) => this.hurtPlayer(dmg, playerPos, camera, rendererDom))

    if (this.activeRoomId !== null) {
      const room = this.rooms.get(this.activeRoomId)
      if (room && room.data.state === 'active' && this.combat.allDead()) {
        this.clearRoom(room)
      }
    }

    const boss = this.combat.getBossHp()
    if (boss) this.hud.showBossBar(boss.name, boss.current, boss.max)
    else if (this.bossCleared) this.hud.hideBossBar()

    this.updateLootPrompt(playerPos)
    this.refreshHud()
    void aimPoint
  }

  /** Soft AABB clamp against dungeon colliders (XZ foot-collision). */
  constrainPlayer(prev: THREE.Vector3, next: THREE.Vector3): void {
    if (!this.runActive) return
    const radius = 0.45
    const playerMinY = 0.15
    const playerMaxY = 1.7
    for (const mesh of this.colliders) {
      if (mesh.userData.isDoorSlab && !mesh.visible) continue
      if (mesh.userData.noCollision) continue
      if (!mesh.geometry) continue
      mesh.updateWorldMatrix(true, false)
      const box = new THREE.Box3().setFromObject(mesh)
      if (box.isEmpty()) continue
      // Skip overhead geometry (lintels, hanging lamps) — don't seal doorways
      if (box.min.y > playerMaxY || box.max.y < playerMinY) continue
      // Expand for player radius
      box.min.x -= radius
      box.min.z -= radius
      box.max.x += radius
      box.max.z += radius
      if (
        next.x >= box.min.x &&
        next.x <= box.max.x &&
        next.z >= box.min.z &&
        next.z <= box.max.z
      ) {
        // Push out on smallest axis
        const dxL = next.x - box.min.x
        const dxR = box.max.x - next.x
        const dzL = next.z - box.min.z
        const dzR = box.max.z - next.z
        const m = Math.min(dxL, dxR, dzL, dzR)
        if (m === dxL) next.x = box.min.x
        else if (m === dxR) next.x = box.max.x
        else if (m === dzL) next.z = box.min.z
        else next.z = box.max.z
        // If still stuck, revert axis from prev
        if (
          next.x >= box.min.x &&
          next.x <= box.max.x &&
          next.z >= box.min.z &&
          next.z <= box.max.z
        ) {
          next.x = prev.x
          next.z = prev.z
        }
      }
    }
  }

  weaponStats(): WeaponStats {
    return deriveWeaponStats(this.progress)
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private buildWorld(): void {
    if (!this.generated) return
    const builtById = new Map<number, BuiltRoom>()

    for (const room of this.generated.rooms) {
      const sockets = new Set<Direction>(Object.keys(room.neighbors) as Direction[])
      const built = buildRoomMesh(room.template, sockets, room.worldX, room.worldZ)
      this.root.add(built.root)
      this.colliders.push(...built.colliders)
      builtById.set(room.id, built)

      let encounterKinds: MobKind[] = []
      if (room.role === 'boss') {
        encounterKinds = ['sump-king']
      } else if (room.role === 'main' || room.role === 'branch') {
        encounterKinds = pickEncounterComposition(room.depth, {
          roomType: room.template,
          isBranch: room.role === 'branch',
          rng: this.rng,
        })
      }

      this.rooms.set(room.id, { data: room, built, encounterKinds })
    }

    // Bridges between connected rooms (each edge once)
    const seen = new Set<string>()
    for (const room of this.generated.rooms) {
      for (const [dir, neighborId] of Object.entries(room.neighbors) as [Direction, number][]) {
        const key = [room.id, neighborId].sort((a, b) => a - b).join('-')
        if (seen.has(key)) continue
        seen.add(key)
        const a = builtById.get(room.id)
        const b = builtById.get(neighborId)
        if (!a || !b) continue
        const bridge = buildDoorBridge(a, b, dir)
        this.root.add(bridge)
      }
    }

    // Entrance starts cleared
    const entrance = this.rooms.get(0)
    if (entrance) {
      entrance.data.state = 'cleared'
      this.setDoorsLocked(entrance, false)
    }

    this.updateBossGate()
    this.combat.setBlockers(this.colliders)
  }

  private updateRoomPresence(playerPos: THREE.Vector3): void {
    let nearest: LiveRoom | null = null
    let best = Infinity
    for (const room of this.rooms.values()) {
      const d = Math.hypot(playerPos.x - room.data.worldX, playerPos.z - room.data.worldZ)
      if (d < best) {
        best = d
        nearest = room
      }
    }
    // Rooms sit on a 28-unit grid; activate once the player is inside / on the bridge
    if (!nearest || best > 16) return

    if (this.activeRoomId !== nearest.data.id) {
      // Leaving active uncleared room keeps it active until cleared
      if (this.activeRoomId !== null) {
        const prev = this.rooms.get(this.activeRoomId)
        if (prev && prev.data.state === 'active' && !this.combat.allDead()) {
          // Stay locked in fight — don't switch
          return
        }
      }
      this.activeRoomId = nearest.data.id
    }

    if (nearest.data.state === 'dormant' && nearest.encounterKinds.length > 0) {
      // Boss gate: need 4 main rooms cleared
      if (nearest.data.role === 'boss' && this.clearedMainCount() < 4) {
        this.hud.setPickupPrompt('CLEAR 4 MAIN ROOMS TO OPEN THE SUMP')
        return
      }
      this.activateRoom(nearest, playerPos)
    }
  }

  private activateRoom(room: LiveRoom, playerPos: THREE.Vector3): void {
    room.data.state = 'active'
    this.setDoorsLocked(room, true)
    this.hud.showBanner(room.data.role === 'boss' ? 'THE SUMP KING' : 'ROOM LOCKED', 1400)

    const center = new THREE.Vector3(room.data.worldX, 0, room.data.worldZ)
    const scaleLevel = Math.min(this.progress.level, 5)
    const spawns = [...room.built.spawnPoints]
    // Prefer spawns far from player
    spawns.sort(
      (a, b) =>
        playerPos.distanceToSquared(b) - playerPos.distanceToSquared(a),
    )

    if (room.data.role === 'boss') {
      this.combat.spawnBoss(center.clone().setY(0), scaleLevel)
      return
    }

    const mobs = room.encounterKinds.map((kind, i) => {
      const pos =
        spawns[i % Math.max(1, spawns.length)]?.clone() ??
        center.clone().add(new THREE.Vector3((i - 1) * 2.5, 0, 2))
      // Keep away from player
      if (pos.distanceTo(playerPos) < 6) {
        const away = pos.clone().sub(playerPos)
        away.y = 0
        if (away.lengthSq() < 0.01) away.set(1, 0, 0)
        away.normalize().multiplyScalar(7)
        pos.copy(playerPos).add(away)
      }
      pos.y = 0
      return { kind, position: pos, scaleLevel, roomCenter: center.clone() }
    })
    this.combat.spawnEncounter(mobs)
  }

  private clearRoom(room: LiveRoom): void {
    room.data.state = 'cleared'
    this.setDoorsLocked(room, false)
    this.combat.clear()
    this.hud.showBanner('ROOM CLEARED', 1200)

    if (room.data.role === 'boss') {
      this.bossCleared = true
      this.hud.hideBossBar()
      this.hud.showBanner('SEWER PURGED — FIND THE LADDER', 3200)
      // Boss loot already awarded on kill via onEnemyShot
    } else if (room.data.role === 'main') {
      this.updateBossGate()
    }
    this.hud.updateRoomProgress(this.clearedMainCount(), 4, this.seed)
  }

  private clearedMainCount(): number {
    let n = 0
    for (const room of this.rooms.values()) {
      if (room.data.role === 'main' && room.data.state === 'cleared') n++
    }
    return n
  }

  private setDoorsLocked(room: LiveRoom, locked: boolean): void {
    for (const slab of Object.values(room.built.doorSlabs)) {
      if (slab) slab.visible = locked
    }
    // Also lock neighbor-facing slabs that lead here
    for (const [dir, nid] of Object.entries(room.data.neighbors) as [Direction, number][]) {
      const other = this.rooms.get(nid)
      if (!other) continue
      const opp = OPPOSITE_DIRECTION[dir]
      const slab = other.built.doorSlabs[opp]
      if (slab) slab.visible = locked
    }
  }

  private updateBossGate(): void {
    const boss = [...this.rooms.values()].find((room) => room.data.role === 'boss')
    if (!boss || boss.data.state !== 'dormant') return
    this.setDoorsLocked(boss, this.clearedMainCount() < 4)
  }

  private onEnemyShot(hit: ShotResult, _weapon: WeaponStats): void {
    const kind: 'crit' | 'enemy' = hit.isCrit ? 'crit' : 'enemy'
    // Damage numbers need camera — deferred via banner if missing; Game can also show
    this.tmp.copy(hit.hitPoint)
    this.tmp.y += 1.2

    if (!hit.killed) return

    const awards = awardMobProgress(this.progress, hit.kind, this.rng)
    if (awards.levelUp.levelsGained > 0) {
      this.hud.showBanner(`LEVEL UP — LV ${awards.levelUp.level}`, 2000)
      this.ammo = deriveWeaponStats(this.progress).magazine
    }

    const drops = rollLoot(hit.kind, this.rng)
    for (const item of drops) {
      this.spawnLoot(hit.hitPoint, item)
    }

  }

  private spawnLoot(at: THREE.Vector3, item: ItemInstance): void {
    const def = ITEM_CATALOG[item.itemId]
    const rarity = def.rarity
    const hex = RARITY_CONFIG[rarity].color
    const color = new THREE.Color(hex)
    const beamH = RARITY_CONFIG[rarity].worldBeamHeight
    const root = new THREE.Group()
    root.position.set(at.x, 0.35, at.z)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.7,
        flatShading: true,
      }),
    )
    root.add(mesh)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, beamH, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
      }),
    )
    beam.position.y = beamH * 0.5
    root.add(beam)
    this.root.add(root)
    this.loot.push({ root, item, label: `${def.name}` })
  }

  private clearLoot(): void {
    for (const l of this.loot) {
      l.root.removeFromParent()
      this.disposeObject(l.root)
    }
    this.loot = []
  }

  private updateLootPrompt(playerPos: THREE.Vector3): void {
    this.lastPlayerPos.copy(playerPos)
    let best: WorldLoot | null = null
    let bestD: number = LOOT_WORLD_CONFIG.labelDistance
    for (const l of this.loot) {
      const d = playerPos.distanceTo(l.root.position)
      if (d < bestD) {
        bestD = d
        best = l
      }
    }
    const lockedBoss = [...this.rooms.values()].find(
      (room) => room.data.role === 'boss' && room.data.state === 'dormant',
    )
    const nearLockedBoss =
      this.clearedMainCount() < 4 &&
      lockedBoss !== undefined &&
      Math.hypot(
        playerPos.x - lockedBoss.data.worldX,
        playerPos.z - lockedBoss.data.worldZ,
      ) < 14
    if (nearLockedBoss) {
      this.hud.setPickupPrompt('CLEAR 4 MAIN ROOMS TO OPEN THE SUMP')
    } else if (best && bestD <= LOOT_WORLD_CONFIG.labelDistance) {
      this.hud.setPickupPrompt(`E — ${best.label}`)
    } else if (this.bossCleared) {
      const exit = this.getExitPosition()
      if (playerPos.distanceTo(exit) < 4) {
        this.hud.setPickupPrompt('E — EXIT LADDER')
      } else {
        this.hud.setPickupPrompt(null)
      }
    } else {
      this.hud.setPickupPrompt(null)
    }

    for (const l of this.loot) {
      l.root.rotation.y += 0.02
    }
  }

  /** Call from game with player position for E key. */
  interact(playerPos: THREE.Vector3): 'pickup' | 'exit' | null {
    if (!this.acceptsInput()) return null
    this.lastPlayerPos.copy(playerPos)
    if (this.canExit() && playerPos.distanceTo(this.getExitPosition()) < 4) {
      return 'exit'
    }
    let best: WorldLoot | null = null
    let bestD: number = LOOT_WORLD_CONFIG.pickupDistance
    for (const l of this.loot) {
      const d = playerPos.distanceTo(l.root.position)
      if (d < bestD) {
        bestD = d
        best = l
      }
    }
    if (!best) return null
    if (!tryAddItem(this.progress, best.item)) {
      this.hud.showBanner('INVENTORY FULL', 1200)
      return 'pickup'
    }
    best.root.removeFromParent()
    this.disposeObject(best.root)
    this.loot = this.loot.filter((x) => x !== best)
    this.hud.showBanner(`LOOT + ${ITEM_CATALOG[best.item.itemId].name}`, 1000)
    this.refreshHud()
    return 'pickup'
  }

  private hurtPlayer(
    dmg: number,
    playerPos: THREE.Vector3,
    camera: THREE.Camera,
    rendererDom: HTMLElement,
  ): void {
    if (this.invuln > 0 || this.dead) return
    const armor = totalArmor(this.progress)
    const dealt = mitigateDamage(dmg, armor)
    this.progress.hp = Math.max(0, this.progress.hp - dealt)
    this.invuln = 0.35
    this.hud.showDamageNumber(playerPos.clone().setY(1.4), camera, rendererDom, dealt, 'player')
    this.refreshHud()
    if (this.progress.hp <= 0) {
      this.dead = true
      this.deathTimer = DEATH_CONFIG.sequenceDuration
      const runEarnings = Math.max(0, this.progress.scrap - this.protectedScrap)
      const loss = Math.floor(runEarnings * DEATH_CONFIG.currentRunScrapLoss)
      this.progress.scrap = Math.max(0, this.progress.scrap - loss)
      this.protectedScrap = this.progress.scrap
      this.hud.showBanner(loss > 0 ? `DOWNED — LOST ${loss} SCRAP` : 'DOWNED', 1800)
      this.combat.clear()
    }
  }

  private respawn(playerPos: THREE.Vector3): void {
    this.dead = false
    this.progress.hp = this.progress.maxHp
    this.invuln = DEATH_CONFIG.respawnInvulnerability
    const spawn = this.getSpawnPosition()
    playerPos.copy(spawn)
    // Reset uncleared active room
    if (this.activeRoomId !== null) {
      const room = this.rooms.get(this.activeRoomId)
      if (room && room.data.state === 'active') {
        room.data.state = 'dormant'
        this.setDoorsLocked(room, false)
      }
    }
    this.activeRoomId = 0
    this.combat.clear()
    this.hud.hideBossBar()
    this.refreshHud()
    this.hud.showBanner('RESPAWNED', 1000)
  }

  private refreshHud(): void {
    const weapon = deriveWeaponStats(this.progress)
    const armor = deriveArmor(this.progress)
    this.hud.updatePlayer(this.progress, {
      weapon,
      armor,
      currentAmmo: this.ammo,
      magazine: weapon.magazine,
      totalArmor: armor.total,
    })
    this.hud.updateRoomProgress(this.clearedMainCount(), 4, this.seed)
  }

  private clampAmmoToMagazine(): void {
    this.ammo = Math.min(this.ammo, deriveWeaponStats(this.progress).magazine)
  }

  private disposeObject(object: THREE.Object3D): void {
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

  /** Expose damage numbers for player shots from Game. */
  showHitNumber(
    pos: THREE.Vector3,
    camera: THREE.Camera,
    dom: HTMLElement,
    amount: number,
    crit: boolean,
  ): void {
    this.hud.showDamageNumber(pos, camera, dom, amount, crit ? 'crit' : 'enemy')
  }
}
