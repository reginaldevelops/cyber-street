export type Direction = 'N' | 'E' | 'S' | 'W'

export type RoomType =
  | 'access-junction'
  | 'pump-hall'
  | 'filtration-beds'
  | 'maintenance-maze'
  | 'overflow-cistern'

export type RoomRole = 'entrance' | 'main' | 'branch' | 'boss'
export type RoomState = 'dormant' | 'active' | 'cleared'

export type MobKind =
  | 'blade-runner'
  | 'pipe-bruiser'
  | 'drain-gunner'
  | 'shield-warden'
  | 'arc-tech'
  | 'sump-king'

export type WeaponSlot = 'barrel' | 'receiver' | 'magazine' | 'optic'
export type ArmorSlot = 'head' | 'torso' | 'legs'
export type ItemSlot = WeaponSlot | ArmorSlot | 'consumable'
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic'

export type WeaponItemId =
  | 'rifled-sewer-barrel'
  | 'flechette-barrel'
  | 'scattershot-barrel'
  | 'arc-coil-barrel'
  | 'balanced-bolt-pack'
  | 'overclocked-trigger'
  | 'hydraulic-breach-block'
  | 'quickcell-magazine'
  | 'jury-rigged-drum'
  | 'voltaic-feed'
  | 'glow-sight'
  | 'threat-painter'
  | 'sump-oracle'

export type ArmorItemId =
  | 'filter-hood'
  | 'targeting-visor'
  | 'patchwork-vest'
  | 'riot-weave-jacket'
  | 'sump-exoshell'
  | 'rubber-waders'
  | 'bulwark-knees'
  | 'servo-greaves'

export type ConsumableItemId = 'med-gel-injector' | 'ablative-patch' | 'redline-ampoule'
export type EquipmentItemId = WeaponItemId | ArmorItemId
export type ItemId = EquipmentItemId | ConsumableItemId

export interface GridPosition {
  x: number
  z: number
}

export interface WorldPosition {
  x: number
  z: number
}

export interface DungeonRoom {
  id: number
  gridX: number
  gridZ: number
  worldX: number
  worldZ: number
  depth: number
  template: RoomType
  role: RoomRole
  neighbors: Partial<Record<Direction, number>>
  state: RoomState
}

export interface GeneratedDungeon {
  seed: number
  rooms: DungeonRoom[]
  criticalPathIds: number[]
  worldOffset: WorldPosition
}

export interface MobStats {
  name: string
  hp: number
  armor: number
  damage: number
  speed: number
  cost: number
  ranged: boolean
  range: number
  preferredRangeMin?: number
  preferredRangeMax?: number
  cooldown: number
  windup?: number
  recovery?: number
}

export interface ScaledMobStats extends MobStats {
  hp: number
  damage: number
}

export interface WeaponStats {
  damage: number
  fireInterval: number
  magazine: number
  reload: number
  range: number
  spreadDegrees: number
  criticalChance: number
  criticalMultiplier: number
  armorPenetration: number
  raysPerShot: number
  aimAssistDegrees: number
  movementSpeedModifier: number
  walkSpeed: number
  sprintSpeed: number
  chainRange: number
  chainDamageMultiplier: number
  electricDamageEvery: number
  electricDamage: number
  piercesNormalEnemy: boolean
  marksLowHpThreshold: number
}

export interface DerivedArmorStats {
  baseArmor: number
  equipmentArmor: number
  temporaryArmor: number
  total: number
  maxHpBonus: number
  movementSpeedModifier: number
  criticalChanceBonus: number
}

export interface WeaponItemEffects {
  damageAdd?: number
  damageSet?: number
  damageMultiplier?: number
  fireIntervalAdd?: number
  fireIntervalMultiplier?: number
  fireIntervalMinimum?: number
  magazineAdd?: number
  reloadAdd?: number
  rangeSet?: number
  spreadDegreesSet?: number
  criticalChanceAdd?: number
  armorPenetrationSet?: number
  raysPerShotSet?: number
  aimAssistDegreesSet?: number
  chainRangeSet?: number
  chainDamageMultiplierSet?: number
  electricDamageEverySet?: number
  electricDamageSet?: number
  piercesNormalEnemySet?: boolean
  marksLowHpThresholdSet?: number
}

export interface WeaponItemDefinition {
  id: WeaponItemId
  name: string
  kind: 'weapon'
  slot: WeaponSlot
  rarity: Rarity
  description: string
  effects: WeaponItemEffects
}

export interface ArmorItemDefinition {
  id: ArmorItemId
  name: string
  kind: 'armor'
  slot: ArmorSlot
  rarity: Rarity
  description: string
  armor: number
  maxHp: number
  movementSpeed: number
  criticalChance: number
}

export interface ConsumableItemDefinition {
  id: ConsumableItemId
  name: string
  kind: 'consumable'
  slot: 'consumable'
  rarity: Rarity
  description: string
  stackLimit: number
  hotkey: 1 | 2 | 3
  useDuration: number
  duration: number
  heal: number
  temporaryArmor: number
  damageMultiplier: number
  fireIntervalMultiplier: number
}

export type ItemDefinition =
  | WeaponItemDefinition
  | ArmorItemDefinition
  | ConsumableItemDefinition

export interface ItemInstance {
  instanceId: string
  itemId: ItemId
  quantity: number
}

export type BackpackSlot = ItemInstance | null

export interface TemporaryEffects {
  consumableCooldownRemaining: number
  ablativeRemaining: number
  redlineRemaining: number
}

export interface PlayerProgress {
  level: number
  xp: number
  scrap: number
  hp: number
  maxHp: number
  baseArmor: number
  temporaryArmor: number
  backpack: BackpackSlot[]
  equippedWeapon: Record<WeaponSlot, ItemInstance | null>
  equippedArmor: Record<ArmorSlot, ItemInstance | null>
  effects: TemporaryEffects
}

export interface DropCategory<T extends ItemId = ItemId> {
  chance: number
  items: readonly T[]
}

export interface DropTable {
  nothing: number
  weapon?: DropCategory<WeaponItemId>
  armor?: DropCategory<ArmorItemId>
  consumable?: DropCategory<ConsumableItemId>
}

export interface ProgressionAward {
  xp: number
  scrapMin: number
  scrapMax: number
}

export interface LevelUpResult {
  levelsGained: number
  level: number
  xp: number
  xpToNext: number
}
