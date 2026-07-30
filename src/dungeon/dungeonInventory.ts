import {
  ARMOR_ITEMS,
  BACKPACK_SIZE,
  BOSS_DROP_TABLE,
  CONSUMABLE_ITEMS,
  CONSUMABLE_SHARED_COOLDOWN,
  DROP_TABLES,
  ITEM_CATALOG,
  MOB_AWARDS,
  PLAYER_BASE_STATS,
  PROGRESSION_CONFIG,
  RARITY_CONFIG,
  WEAPON_ITEMS,
  WEAPON_STAT_LIMITS,
  xpToNextLevel,
} from './dungeonConfig.js'
import { chance, pick, randInt, type RandomSource } from './dungeonRng.js'
import type {
  ArmorItemDefinition,
  ArmorSlot,
  ConsumableItemId,
  DerivedArmorStats,
  ItemId,
  ItemInstance,
  LevelUpResult,
  MobKind,
  PlayerProgress,
  WeaponItemDefinition,
  WeaponItemEffects,
  WeaponSlot,
  WeaponStats,
} from './dungeonTypes.js'

let nextInstanceNumber = 1

export function createItemInstance(itemId: ItemId, quantity = 1): ItemInstance {
  return {
    instanceId: `item-${nextInstanceNumber++}`,
    itemId,
    quantity: Math.max(1, Math.floor(quantity)),
  }
}

export function createDefaultProgress(): PlayerProgress {
  return {
    level: PROGRESSION_CONFIG.startingLevel,
    xp: 0,
    scrap: 0,
    hp: PLAYER_BASE_STATS.maxHp,
    maxHp: PLAYER_BASE_STATS.maxHp,
    baseArmor: PLAYER_BASE_STATS.armor,
    temporaryArmor: 0,
    backpack: Array.from({ length: BACKPACK_SIZE }, () => null),
    equippedWeapon: {
      barrel: null,
      receiver: {
        instanceId: 'starter-balanced-bolt-pack',
        itemId: 'balanced-bolt-pack',
        quantity: 1,
      },
      magazine: null,
      optic: null,
    },
    equippedArmor: {
      head: null,
      torso: null,
      legs: null,
    },
    effects: {
      consumableCooldownRemaining: 0,
      ablativeRemaining: 0,
      redlineRemaining: 0,
    },
  }
}

function equippedWeaponDefinition(
  progress: PlayerProgress,
  slot: WeaponSlot,
): WeaponItemDefinition | null {
  const instance = progress.equippedWeapon[slot]
  if (!instance) return null
  const definition = ITEM_CATALOG[instance.itemId]
  return definition.kind === 'weapon' ? definition : null
}

function applySetEffects(stats: WeaponStats, effects: WeaponItemEffects): void {
  if (effects.damageSet !== undefined) stats.damage = effects.damageSet
  if (effects.rangeSet !== undefined) stats.range = effects.rangeSet
  if (effects.spreadDegreesSet !== undefined) stats.spreadDegrees = effects.spreadDegreesSet
  if (effects.armorPenetrationSet !== undefined) {
    stats.armorPenetration = effects.armorPenetrationSet
  }
  if (effects.raysPerShotSet !== undefined) stats.raysPerShot = effects.raysPerShotSet
  if (effects.aimAssistDegreesSet !== undefined) {
    stats.aimAssistDegrees = effects.aimAssistDegreesSet
  }
  if (effects.chainRangeSet !== undefined) stats.chainRange = effects.chainRangeSet
  if (effects.chainDamageMultiplierSet !== undefined) {
    stats.chainDamageMultiplier = effects.chainDamageMultiplierSet
  }
  if (effects.electricDamageEverySet !== undefined) {
    stats.electricDamageEvery = effects.electricDamageEverySet
  }
  if (effects.electricDamageSet !== undefined) stats.electricDamage = effects.electricDamageSet
  if (effects.piercesNormalEnemySet !== undefined) {
    stats.piercesNormalEnemy = effects.piercesNormalEnemySet
  }
  if (effects.marksLowHpThresholdSet !== undefined) {
    stats.marksLowHpThreshold = effects.marksLowHpThresholdSet
  }
}

export function deriveArmor(progress: PlayerProgress): DerivedArmorStats {
  let equipmentArmor = 0
  let maxHpBonus = 0
  let movementSpeedModifier = 0
  let criticalChanceBonus = 0

  for (const instance of Object.values(progress.equippedArmor)) {
    if (!instance) continue
    const definition = ITEM_CATALOG[instance.itemId]
    if (definition.kind !== 'armor') continue
    equipmentArmor += definition.armor
    maxHpBonus += definition.maxHp
    movementSpeedModifier += definition.movementSpeed
    criticalChanceBonus += definition.criticalChance
  }

  const temporaryArmor = progress.effects.ablativeRemaining > 0 ? progress.temporaryArmor : 0
  return {
    baseArmor: progress.baseArmor,
    equipmentArmor,
    temporaryArmor,
    total: progress.baseArmor + equipmentArmor + temporaryArmor,
    maxHpBonus,
    movementSpeedModifier,
    criticalChanceBonus,
  }
}

export function totalArmor(progress: PlayerProgress): number {
  return deriveArmor(progress).total
}

export function deriveWeaponStats(progress: PlayerProgress): WeaponStats {
  const armorStats = deriveArmor(progress)
  const stats: WeaponStats = {
    damage:
      PLAYER_BASE_STATS.weaponDamage +
      PROGRESSION_CONFIG.weaponDamagePerLevel * (Math.max(1, progress.level) - 1),
    fireInterval: PLAYER_BASE_STATS.fireInterval,
    magazine: PLAYER_BASE_STATS.magazine,
    reload: PLAYER_BASE_STATS.reload,
    range: PLAYER_BASE_STATS.range,
    spreadDegrees: PLAYER_BASE_STATS.spreadDegrees,
    criticalChance: PLAYER_BASE_STATS.criticalChance + armorStats.criticalChanceBonus,
    criticalMultiplier: PLAYER_BASE_STATS.criticalMultiplier,
    armorPenetration: 0,
    raysPerShot: 1,
    aimAssistDegrees: PLAYER_BASE_STATS.aimAssistDegrees,
    movementSpeedModifier: armorStats.movementSpeedModifier,
    walkSpeed: PLAYER_BASE_STATS.walkSpeed + armorStats.movementSpeedModifier,
    sprintSpeed: PLAYER_BASE_STATS.sprintSpeed + armorStats.movementSpeedModifier,
    chainRange: 0,
    chainDamageMultiplier: 0,
    electricDamageEvery: 0,
    electricDamage: 0,
    piercesNormalEnemy: false,
    marksLowHpThreshold: 0,
  }

  const barrel = equippedWeaponDefinition(progress, 'barrel')
  if (barrel) {
    applySetEffects(stats, barrel.effects)
    stats.damage += barrel.effects.damageAdd ?? 0
    stats.fireInterval += barrel.effects.fireIntervalAdd ?? 0
  }

  const receiver = equippedWeaponDefinition(progress, 'receiver')
  const magazine = equippedWeaponDefinition(progress, 'magazine')
  for (const definition of [receiver, magazine]) {
    if (!definition) continue
    applySetEffects(stats, definition.effects)
    stats.damage += definition.effects.damageAdd ?? 0
    stats.fireInterval += definition.effects.fireIntervalAdd ?? 0
    stats.magazine += definition.effects.magazineAdd ?? 0
    stats.reload += definition.effects.reloadAdd ?? 0
  }

  const multiplicativeEffects = [barrel, receiver, magazine]
    .filter((definition): definition is WeaponItemDefinition => definition !== null)
    .map((definition) => definition.effects)
  for (const effects of multiplicativeEffects) {
    stats.damage *= effects.damageMultiplier ?? 1
    stats.fireInterval *= effects.fireIntervalMultiplier ?? 1
  }

  const optic = equippedWeaponDefinition(progress, 'optic')
  if (optic) {
    applySetEffects(stats, optic.effects)
    stats.criticalChance += optic.effects.criticalChanceAdd ?? 0
  }

  if (barrel?.effects.fireIntervalMinimum !== undefined) {
    stats.fireInterval = Math.max(stats.fireInterval, barrel.effects.fireIntervalMinimum)
  }
  if (progress.effects.redlineRemaining > 0) {
    const redline = CONSUMABLE_ITEMS['redline-ampoule']
    stats.damage *= redline.damageMultiplier
    stats.fireInterval *= redline.fireIntervalMultiplier
  }

  stats.damage = Math.max(WEAPON_STAT_LIMITS.minimumDamage, stats.damage)
  stats.fireInterval = Math.max(WEAPON_STAT_LIMITS.minimumFireInterval, stats.fireInterval)
  stats.magazine = Math.max(WEAPON_STAT_LIMITS.minimumMagazine, Math.round(stats.magazine))
  stats.reload = Math.max(WEAPON_STAT_LIMITS.minimumReload, stats.reload)
  stats.walkSpeed = Math.max(WEAPON_STAT_LIMITS.minimumMovementSpeed, stats.walkSpeed)
  stats.sprintSpeed = Math.max(WEAPON_STAT_LIMITS.minimumMovementSpeed, stats.sprintSpeed)
  return stats
}

function itemCapacity(progress: PlayerProgress, item: ItemInstance): number {
  const definition = ITEM_CATALOG[item.itemId]
  if (definition.kind !== 'consumable') {
    return progress.backpack.filter((slot) => slot === null).length
  }

  let capacity = 0
  for (const slot of progress.backpack) {
    if (slot === null) capacity += definition.stackLimit
    else if (slot.itemId === item.itemId) capacity += definition.stackLimit - slot.quantity
  }
  return capacity
}

/** Adds the entire item quantity atomically. Returns false without mutation if full. */
export function tryAddItem(progress: PlayerProgress, item: ItemInstance): boolean {
  const quantity = Math.max(1, Math.floor(item.quantity))
  const definition = ITEM_CATALOG[item.itemId]
  const requiredCapacity = definition.kind === 'consumable' ? quantity : quantity
  if (itemCapacity(progress, item) < requiredCapacity) return false

  if (definition.kind !== 'consumable') {
    for (let count = 0; count < quantity; count += 1) {
      const index = progress.backpack.findIndex((slot) => slot === null)
      progress.backpack[index] =
        count === 0
          ? { ...item, quantity: 1 }
          : createItemInstance(item.itemId)
    }
    return true
  }

  let remaining = quantity
  for (const slot of progress.backpack) {
    if (remaining === 0) break
    if (slot?.itemId !== item.itemId || slot.quantity >= definition.stackLimit) continue
    const added = Math.min(remaining, definition.stackLimit - slot.quantity)
    slot.quantity += added
    remaining -= added
  }
  while (remaining > 0) {
    const index = progress.backpack.findIndex((slot) => slot === null)
    const added = Math.min(remaining, definition.stackLimit)
    progress.backpack[index] =
      remaining === quantity
        ? { ...item, quantity: added }
        : createItemInstance(item.itemId, added)
    remaining -= added
  }
  return true
}

function updateMaxHpAfterEquipmentChange(progress: PlayerProgress, previousBonus: number): void {
  const bonusDelta = deriveArmor(progress).maxHpBonus - previousBonus
  if (bonusDelta === 0) return
  progress.maxHp += bonusDelta
  progress.hp = Math.max(1, Math.min(progress.maxHp, progress.hp + bonusDelta))
}

export function equip(progress: PlayerProgress, backpackIndex: number): boolean {
  const item = progress.backpack[backpackIndex]
  if (!item || item.quantity !== 1) return false
  const definition = ITEM_CATALOG[item.itemId]
  if (definition.kind === 'consumable') return false

  const previousHpBonus = deriveArmor(progress).maxHpBonus
  if (definition.kind === 'weapon') {
    const oldItem = progress.equippedWeapon[definition.slot]
    progress.equippedWeapon[definition.slot] = item
    progress.backpack[backpackIndex] = oldItem
  } else {
    const oldItem = progress.equippedArmor[definition.slot]
    progress.equippedArmor[definition.slot] = item
    progress.backpack[backpackIndex] = oldItem
  }
  updateMaxHpAfterEquipmentChange(progress, previousHpBonus)
  return true
}

export function unequip(progress: PlayerProgress, slot: WeaponSlot | ArmorSlot): boolean {
  const backpackIndex = progress.backpack.findIndex((item) => item === null)
  if (backpackIndex < 0) return false
  const previousHpBonus = deriveArmor(progress).maxHpBonus

  if (slot in progress.equippedWeapon) {
    const weaponSlot = slot as WeaponSlot
    const item = progress.equippedWeapon[weaponSlot]
    if (!item) return false
    progress.equippedWeapon[weaponSlot] = null
    progress.backpack[backpackIndex] = item
  } else {
    const armorSlot = slot as ArmorSlot
    const item = progress.equippedArmor[armorSlot]
    if (!item) return false
    progress.equippedArmor[armorSlot] = null
    progress.backpack[backpackIndex] = item
  }

  updateMaxHpAfterEquipmentChange(progress, previousHpBonus)
  return true
}

export function scrapItem(
  progress: PlayerProgress,
  backpackIndex: number,
  quantity?: number,
): number {
  const item = progress.backpack[backpackIndex]
  if (!item) return 0
  const removeCount = Math.min(
    item.quantity,
    Math.max(1, Math.floor(quantity ?? item.quantity)),
  )
  const definition = ITEM_CATALOG[item.itemId]
  const award = RARITY_CONFIG[definition.rarity].scrapValue * removeCount
  item.quantity -= removeCount
  if (item.quantity === 0) progress.backpack[backpackIndex] = null
  progress.scrap += award
  return award
}

function findConsumableIndex(
  progress: PlayerProgress,
  itemOrIndex: ConsumableItemId | number,
): number {
  if (typeof itemOrIndex === 'number') return itemOrIndex
  return progress.backpack.findIndex((item) => item?.itemId === itemOrIndex)
}

export function useConsumable(
  progress: PlayerProgress,
  itemOrIndex: ConsumableItemId | number,
): boolean {
  if (progress.effects.consumableCooldownRemaining > 0) return false
  const backpackIndex = findConsumableIndex(progress, itemOrIndex)
  const item = progress.backpack[backpackIndex]
  if (!item) return false
  const definition = ITEM_CATALOG[item.itemId]
  if (definition.kind !== 'consumable') return false
  if (definition.id === 'med-gel-injector' && progress.hp >= progress.maxHp) return false

  if (definition.heal > 0) {
    progress.hp = Math.min(progress.maxHp, progress.hp + definition.heal)
  }
  if (definition.id === 'ablative-patch') {
    progress.temporaryArmor = definition.temporaryArmor
    progress.effects.ablativeRemaining = definition.duration
  }
  if (definition.id === 'redline-ampoule') {
    progress.effects.redlineRemaining = definition.duration
  }

  item.quantity -= 1
  if (item.quantity === 0) progress.backpack[backpackIndex] = null
  progress.effects.consumableCooldownRemaining = CONSUMABLE_SHARED_COOLDOWN
  return true
}

export function tickProgressEffects(progress: PlayerProgress, deltaSeconds: number): void {
  const delta = Math.max(0, deltaSeconds)
  progress.effects.consumableCooldownRemaining = Math.max(
    0,
    progress.effects.consumableCooldownRemaining - delta,
  )
  progress.effects.ablativeRemaining = Math.max(0, progress.effects.ablativeRemaining - delta)
  progress.effects.redlineRemaining = Math.max(0, progress.effects.redlineRemaining - delta)
  if (progress.effects.ablativeRemaining === 0) progress.temporaryArmor = 0
}

export function consumableCount(progress: PlayerProgress, itemId: ConsumableItemId): number {
  return progress.backpack.reduce(
    (total, item) => total + (item?.itemId === itemId ? item.quantity : 0),
    0,
  )
}

function lootInstance(itemId: ItemId, rng: RandomSource, index: number): ItemInstance {
  const randomPart = Math.floor(rng() * 0x100000000).toString(36)
  return { instanceId: `loot-${randomPart}-${index}`, itemId, quantity: 1 }
}

export function rollLoot(mobKind: MobKind, rng: RandomSource): ItemInstance[] {
  const itemIds: ItemId[] = []

  if (mobKind === 'sump-king') {
    itemIds.push(pick(rng, BOSS_DROP_TABLE.weapon))
    itemIds.push(pick(rng, BOSS_DROP_TABLE.armor))
    if (chance(rng, BOSS_DROP_TABLE.medGelChance)) itemIds.push('med-gel-injector')
    if (chance(rng, BOSS_DROP_TABLE.redlineChance)) itemIds.push('redline-ampoule')
  } else {
    const table = DROP_TABLES[mobKind]
    const roll = rng()
    let threshold = table.nothing
    if (roll < threshold) return []

    for (const category of [table.weapon, table.armor, table.consumable]) {
      if (!category) continue
      threshold += category.chance
      if (roll < threshold) {
        itemIds.push(pick(rng, category.items))
        break
      }
    }
  }

  return itemIds.map((itemId, index) => lootInstance(itemId, rng, index))
}

export function rollScrapAward(mobKind: MobKind, rng: RandomSource): number {
  const award = MOB_AWARDS[mobKind]
  return randInt(rng, award.scrapMin, award.scrapMax)
}

export function checkLevelUp(progress: PlayerProgress): LevelUpResult {
  let levelsGained = 0
  while (progress.level < PROGRESSION_CONFIG.maximumLevel) {
    const required = xpToNextLevel(progress.level)
    if (progress.xp < required) break
    progress.xp -= required
    progress.level += 1
    progress.maxHp += PROGRESSION_CONFIG.maxHpPerLevel
    progress.hp = progress.maxHp
    levelsGained += 1
  }
  if (progress.level >= PROGRESSION_CONFIG.maximumLevel) progress.xp = 0
  return {
    levelsGained,
    level: progress.level,
    xp: progress.xp,
    xpToNext: xpToNextLevel(progress.level),
  }
}

export function addXp(progress: PlayerProgress, amount: number): LevelUpResult {
  if (progress.level < PROGRESSION_CONFIG.maximumLevel) {
    progress.xp += Math.max(0, Math.floor(amount))
  }
  return checkLevelUp(progress)
}

export function awardMobProgress(
  progress: PlayerProgress,
  mobKind: MobKind,
  rng: RandomSource,
): { xp: number; scrap: number; levelUp: LevelUpResult } {
  const award = MOB_AWARDS[mobKind]
  const scrap = rollScrapAward(mobKind, rng)
  progress.scrap += scrap
  return { xp: award.xp, scrap, levelUp: addXp(progress, award.xp) }
}

export function isWeaponItem(itemId: ItemId): boolean {
  return itemId in WEAPON_ITEMS
}

export function isArmorItem(itemId: ItemId): boolean {
  return itemId in ARMOR_ITEMS
}

export function armorDefinition(itemId: ItemId): ArmorItemDefinition | null {
  const definition = ITEM_CATALOG[itemId]
  return definition.kind === 'armor' ? definition : null
}
