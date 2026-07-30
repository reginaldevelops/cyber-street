import type {
  ArmorItemDefinition,
  ConsumableItemDefinition,
  DropTable,
  ItemDefinition,
  ItemId,
  MobKind,
  MobStats,
  ProgressionAward,
  Rarity,
  RoomType,
  ScaledMobStats,
  WeaponItemDefinition,
} from './dungeonTypes.js'

export const ROOM_CELL_SIZE = 28

export const ROOM_CONFIG = {
  groundY: 0,
  cellSize: ROOM_CELL_SIZE,
  wallHeight: 3.4,
  doorOpeningWidth: 3,
  doorTriggerWidth: 3,
  doorTriggerDepth: 2,
  playableFloorMax: 22,
  bridgeLength: 6,
  bridgeWidth: 3,
  clearPathWidth: 2,
} as const

export const ROOM_TYPE_CONFIG: Record<
  RoomType,
  {
    playableWidth: number
    playableDepth: number
    budgetBonus: number
    maxMobs: number
    maxRanged: number
    maxGunners: number
    minimumMelee: number
    spawnPointCount: number
  }
> = {
  'access-junction': {
    playableWidth: 18,
    playableDepth: 18,
    budgetBonus: 0,
    maxMobs: 3,
    maxRanged: 2,
    maxGunners: 2,
    minimumMelee: 0,
    spawnPointCount: 4,
  },
  'pump-hall': {
    playableWidth: 22,
    playableDepth: 16,
    budgetBonus: 0,
    maxMobs: 4,
    maxRanged: 2,
    maxGunners: 2,
    minimumMelee: 0,
    spawnPointCount: 8,
  },
  'filtration-beds': {
    playableWidth: 20,
    playableDepth: 20,
    budgetBonus: 0,
    maxMobs: 4,
    maxRanged: 2,
    maxGunners: 1,
    minimumMelee: 1,
    spawnPointCount: 0,
  },
  'maintenance-maze': {
    playableWidth: 18,
    playableDepth: 22,
    budgetBonus: 0,
    maxMobs: 4,
    maxRanged: 2,
    maxGunners: 1,
    minimumMelee: 0,
    spawnPointCount: 6,
  },
  'overflow-cistern': {
    playableWidth: 22,
    playableDepth: 22,
    budgetBonus: 1,
    maxMobs: 5,
    maxRanged: 2,
    maxGunners: 2,
    minimumMelee: 0,
    spawnPointCount: 0,
  },
}

export const DUNGEON_GENERATION = {
  roomCount: 8,
  criticalPathRoomCount: 6,
  mainEncounterCount: 4,
  bossDepth: 5,
  branchCount: 2,
  maxRoomDegree: 3,
  maxBacktracks: 10,
  maxAttempts: 50,
  loopChance: 0.35,
  firstBranchParentMinDepth: 1,
  firstBranchParentMaxDepth: 4,
} as const

export const ENCOUNTER_CONFIG = {
  baseBudget: 3,
  branchBudgetBonus: 1,
  defaultMaxMobs: 4,
  cisternMaxMobs: 5,
  maxRanged: 2,
  maxShieldWardens: 1,
  maxArcTechs: 1,
  playerSpawnDistance: 6,
  mobSeparation: 2,
  activationDelay: 0.6,
} as const

export const MOB_STATS: Record<MobKind, MobStats> = {
  'blade-runner': {
    name: 'Blade Runner',
    hp: 50,
    armor: 0,
    damage: 13,
    speed: 5.2,
    cost: 1,
    ranged: false,
    range: 1.6,
    cooldown: 1.4,
    windup: 0.35,
    recovery: 0.5,
  },
  'pipe-bruiser': {
    name: 'Pipe Bruiser',
    hp: 90,
    armor: 8,
    damage: 18,
    speed: 3.8,
    cost: 2,
    ranged: false,
    range: 2,
    cooldown: 1,
    windup: 0.55,
    recovery: 0.45,
  },
  'drain-gunner': {
    name: 'Drain Gunner',
    hp: 65,
    armor: 4,
    damage: 11,
    speed: 3.1,
    cost: 2,
    ranged: true,
    range: 16,
    preferredRangeMin: 8,
    preferredRangeMax: 16,
    cooldown: 1.1,
    windup: 0.25,
  },
  'shield-warden': {
    name: 'Shield Warden',
    hp: 130,
    armor: 24,
    damage: 16,
    speed: 2.6,
    cost: 3,
    ranged: false,
    range: 2.1,
    cooldown: 1.6,
    windup: 0.65,
  },
  'arc-tech': {
    name: 'Arc Tech',
    hp: 75,
    armor: 10,
    damage: 9,
    speed: 3,
    cost: 3,
    ranged: true,
    range: 13,
    preferredRangeMin: 7,
    preferredRangeMax: 13,
    cooldown: 2.2,
    windup: 0.6,
  },
  'sump-king': {
    name: 'The Sump King',
    hp: 650,
    armor: 22,
    damage: 26,
    speed: 2.8,
    cost: 0,
    ranged: false,
    range: 3,
    cooldown: 0,
  },
}

export const MOB_BEHAVIOR = {
  pipeBruiser: {
    swingArcDegrees: 100,
  },
  drainGunner: {
    desiredRange: 10,
    projectileSpeed: 13,
    projectileLifetime: 1.6,
    relocateAfterNoSight: 1.5,
  },
  bladeRunner: {
    circleRangeMin: 5,
    circleRangeMax: 7,
    dashDistance: 5,
    dashSpeed: 10,
    hitsPerDash: 1,
  },
  shieldWarden: {
    shieldArcDegrees: 120,
    shieldBonusArmor: 35,
    knockback: 0.8,
  },
  arcTech: {
    orbSpeed: 8,
    orbLifetime: 1.8,
    fieldRadius: 2.5,
    fieldWarning: 0.45,
  },
  leashDistance: 22,
} as const

export const BOSS_CONFIG = {
  slam: {
    triggerRange: 3,
    telegraph: 0.9,
    damage: 26,
    radius: 2.6,
    arcDegrees: 120,
    recovery: 0.8,
  },
  scrapBurst: {
    minimumRange: 3,
    telegraph: 0.5,
    projectileCount: 3,
    fanDegrees: 12,
    damage: 10,
    projectileSpeed: 11,
    cooldown: 1.5,
    maximumHitsPerBurst: 2,
  },
  drainCharge: {
    cooldown: 12,
    telegraph: 0.8,
    distance: 8,
    speed: 9,
    damage: 20,
    vulnerableDuration: 1.2,
  },
  phaseThresholds: [0.6, 0.3] as const,
  phaseInvulnerability: 1,
  summonedPipeBruisers: 1,
  summonedBladeRunners: 1,
  maximumSummonsAlive: 2,
  finalPhaseSpeed: 3.4,
  finalPhaseScrapBurstCooldown: 1.1,
} as const

export const ENEMY_SCALING = {
  maxScaleLevel: 5,
  hpPerLevel: 0.1,
  damagePerLevel: 0.06,
} as const

export function scaleMobStats(kind: MobKind, playerLevel: number): ScaledMobStats {
  const base = MOB_STATS[kind]
  const scaleLevel = Math.min(Math.max(1, Math.floor(playerLevel)), ENEMY_SCALING.maxScaleLevel)
  const levels = scaleLevel - 1
  return {
    ...base,
    hp: Math.ceil(base.hp * (1 + ENEMY_SCALING.hpPerLevel * levels)),
    damage: Math.ceil(base.damage * (1 + ENEMY_SCALING.damagePerLevel * levels)),
  }
}

export const PLAYER_BASE_STATS = {
  maxHp: 140,
  armor: 12,
  walkSpeed: 5.6,
  sprintSpeed: 9.2,
  weaponDamage: 16,
  fireInterval: 0.18,
  magazine: 18,
  reload: 1.4,
  range: 35,
  spreadDegrees: 1.5,
  criticalChance: 0.05,
  criticalMultiplier: 1.5,
  aimAssistDegrees: 0,
} as const

export const WEAPON_STAT_LIMITS = {
  minimumDamage: 5,
  minimumFireInterval: 0.09,
  minimumMagazine: 6,
  minimumReload: 0.6,
  minimumMovementSpeed: 4.5,
} as const

export const PROGRESSION_CONFIG = {
  startingLevel: 1,
  maximumLevel: 10,
  xpBase: 500,
  xpPerLevel: 250,
  maxHpPerLevel: 8,
  weaponDamagePerLevel: 1,
} as const

export function xpToNextLevel(level: number): number {
  if (level >= PROGRESSION_CONFIG.maximumLevel) return 0
  return PROGRESSION_CONFIG.xpBase + PROGRESSION_CONFIG.xpPerLevel * (Math.max(1, level) - 1)
}

export const MOB_AWARDS: Record<MobKind, ProgressionAward> = {
  'blade-runner': { xp: 30, scrapMin: 6, scrapMax: 10 },
  'pipe-bruiser': { xp: 40, scrapMin: 8, scrapMax: 14 },
  'drain-gunner': { xp: 45, scrapMin: 10, scrapMax: 16 },
  'shield-warden': { xp: 60, scrapMin: 14, scrapMax: 22 },
  'arc-tech': { xp: 65, scrapMin: 16, scrapMax: 24 },
  'sump-king': { xp: 400, scrapMin: 250, scrapMax: 250 },
}

export const RARITY_CONFIG: Record<
  Rarity,
  { color: string; worldBeamHeight: number; scrapValue: number }
> = {
  common: { color: '#d5d9dd', worldBeamHeight: 0.8, scrapValue: 15 },
  uncommon: { color: '#52e38b', worldBeamHeight: 1, scrapValue: 30 },
  rare: { color: '#47a7ff', worldBeamHeight: 1.2, scrapValue: 65 },
  epic: { color: '#c86bff', worldBeamHeight: 1.5, scrapValue: 140 },
}

export const WEAPON_ITEMS = {
  'rifled-sewer-barrel': {
    id: 'rifled-sewer-barrel',
    name: 'Rifled Sewer Barrel',
    kind: 'weapon',
    slot: 'barrel',
    rarity: 'common',
    description: '+2 damage, 42 range, 0.8° spread.',
    effects: { damageAdd: 2, rangeSet: 42, spreadDegreesSet: 0.8 },
  },
  'flechette-barrel': {
    id: 'flechette-barrel',
    name: 'Flechette Barrel',
    kind: 'weapon',
    slot: 'barrel',
    rarity: 'uncommon',
    description: '14 damage, 30 range, 2° spread, and 12 armor penetration.',
    effects: {
      damageSet: 14,
      rangeSet: 30,
      spreadDegreesSet: 2,
      armorPenetrationSet: 12,
      piercesNormalEnemySet: true,
    },
  },
  'scattershot-barrel': {
    id: 'scattershot-barrel',
    name: 'Scattershot Barrel',
    kind: 'weapon',
    slot: 'barrel',
    rarity: 'rare',
    description: 'Six 7-damage rays, 16 range, 14° spread, minimum 0.55s fire interval.',
    effects: {
      raysPerShotSet: 6,
      damageSet: 7,
      rangeSet: 16,
      spreadDegreesSet: 14,
      fireIntervalMinimum: 0.55,
    },
  },
  'arc-coil-barrel': {
    id: 'arc-coil-barrel',
    name: 'Arc-Coil Barrel',
    kind: 'weapon',
    slot: 'barrel',
    rarity: 'epic',
    description: '13 damage, 25 range, +0.08s fire interval; chains within 4 units for 50%.',
    effects: {
      damageSet: 13,
      rangeSet: 25,
      fireIntervalAdd: 0.08,
      chainRangeSet: 4,
      chainDamageMultiplierSet: 0.5,
    },
  },
  'balanced-bolt-pack': {
    id: 'balanced-bolt-pack',
    name: 'Balanced Bolt Pack',
    kind: 'weapon',
    slot: 'receiver',
    rarity: 'common',
    description: 'Reliable starter receiver with no stat changes.',
    effects: {},
  },
  'overclocked-trigger': {
    id: 'overclocked-trigger',
    name: 'Overclocked Trigger',
    kind: 'weapon',
    slot: 'receiver',
    rarity: 'uncommon',
    description: '0.78x fire interval and 0.90x damage.',
    effects: { fireIntervalMultiplier: 0.78, damageMultiplier: 0.9 },
  },
  'hydraulic-breach-block': {
    id: 'hydraulic-breach-block',
    name: 'Hydraulic Breach Block',
    kind: 'weapon',
    slot: 'receiver',
    rarity: 'rare',
    description: '1.35x damage, 1.30x fire interval, and +0.20s reload.',
    effects: { damageMultiplier: 1.35, fireIntervalMultiplier: 1.3, reloadAdd: 0.2 },
  },
  'quickcell-magazine': {
    id: 'quickcell-magazine',
    name: 'Quickcell Magazine',
    kind: 'weapon',
    slot: 'magazine',
    rarity: 'common',
    description: '-4 capacity and -0.40s reload.',
    effects: { magazineAdd: -4, reloadAdd: -0.4 },
  },
  'jury-rigged-drum': {
    id: 'jury-rigged-drum',
    name: 'Jury-Rigged Drum',
    kind: 'weapon',
    slot: 'magazine',
    rarity: 'uncommon',
    description: '+12 capacity and +0.35s reload.',
    effects: { magazineAdd: 12, reloadAdd: 0.35 },
  },
  'voltaic-feed': {
    id: 'voltaic-feed',
    name: 'Voltaic Feed',
    kind: 'weapon',
    slot: 'magazine',
    rarity: 'rare',
    description: '+4 capacity; every sixth shot deals +8 raw electric damage.',
    effects: { magazineAdd: 4, electricDamageEverySet: 6, electricDamageSet: 8 },
  },
  'glow-sight': {
    id: 'glow-sight',
    name: 'Glow-Sight',
    kind: 'weapon',
    slot: 'optic',
    rarity: 'common',
    description: '4° aim assist.',
    effects: { aimAssistDegreesSet: 4 },
  },
  'threat-painter': {
    id: 'threat-painter',
    name: 'Threat-Painter',
    kind: 'weapon',
    slot: 'optic',
    rarity: 'uncommon',
    description: '+5% critical chance and 3° aim assist.',
    effects: { criticalChanceAdd: 0.05, aimAssistDegreesSet: 3 },
  },
  'sump-oracle': {
    id: 'sump-oracle',
    name: 'Sump Oracle',
    kind: 'weapon',
    slot: 'optic',
    rarity: 'epic',
    description: '+10% critical chance; marks enemies below 25% HP.',
    effects: { criticalChanceAdd: 0.1, marksLowHpThresholdSet: 0.25 },
  },
} as const satisfies Record<string, WeaponItemDefinition>

export const ARMOR_ITEMS = {
  'filter-hood': {
    id: 'filter-hood',
    name: 'Filter Hood',
    kind: 'armor',
    slot: 'head',
    rarity: 'common',
    description: '+5 armor.',
    armor: 5,
    maxHp: 0,
    movementSpeed: 0,
    criticalChance: 0,
  },
  'targeting-visor': {
    id: 'targeting-visor',
    name: 'Targeting Visor',
    kind: 'armor',
    slot: 'head',
    rarity: 'rare',
    description: '+8 armor and +5% critical chance.',
    armor: 8,
    maxHp: 0,
    movementSpeed: 0,
    criticalChance: 0.05,
  },
  'patchwork-vest': {
    id: 'patchwork-vest',
    name: 'Patchwork Vest',
    kind: 'armor',
    slot: 'torso',
    rarity: 'common',
    description: '+9 armor.',
    armor: 9,
    maxHp: 0,
    movementSpeed: 0,
    criticalChance: 0,
  },
  'riot-weave-jacket': {
    id: 'riot-weave-jacket',
    name: 'Riot-Weave Jacket',
    kind: 'armor',
    slot: 'torso',
    rarity: 'uncommon',
    description: '+14 armor and -0.20 movement speed.',
    armor: 14,
    maxHp: 0,
    movementSpeed: -0.2,
    criticalChance: 0,
  },
  'sump-exoshell': {
    id: 'sump-exoshell',
    name: 'Sump Exoshell',
    kind: 'armor',
    slot: 'torso',
    rarity: 'epic',
    description: '+20 armor, +20 maximum HP, and -0.40 movement speed.',
    armor: 20,
    maxHp: 20,
    movementSpeed: -0.4,
    criticalChance: 0,
  },
  'rubber-waders': {
    id: 'rubber-waders',
    name: 'Rubber Waders',
    kind: 'armor',
    slot: 'legs',
    rarity: 'common',
    description: '+4 armor.',
    armor: 4,
    maxHp: 0,
    movementSpeed: 0,
    criticalChance: 0,
  },
  'bulwark-knees': {
    id: 'bulwark-knees',
    name: 'Bulwark Knees',
    kind: 'armor',
    slot: 'legs',
    rarity: 'uncommon',
    description: '+10 armor and -0.25 movement speed.',
    armor: 10,
    maxHp: 0,
    movementSpeed: -0.25,
    criticalChance: 0,
  },
  'servo-greaves': {
    id: 'servo-greaves',
    name: 'Servo Greaves',
    kind: 'armor',
    slot: 'legs',
    rarity: 'rare',
    description: '+7 armor and +0.50 movement speed.',
    armor: 7,
    maxHp: 0,
    movementSpeed: 0.5,
    criticalChance: 0,
  },
} as const satisfies Record<string, ArmorItemDefinition>

export const CONSUMABLE_ITEMS = {
  'med-gel-injector': {
    id: 'med-gel-injector',
    name: 'Med-Gel Injector',
    kind: 'consumable',
    slot: 'consumable',
    rarity: 'common',
    description: 'Heal 45 HP after a 0.4s use animation.',
    stackLimit: 5,
    hotkey: 1,
    useDuration: 0.4,
    duration: 0,
    heal: 45,
    temporaryArmor: 0,
    damageMultiplier: 1,
    fireIntervalMultiplier: 1,
  },
  'ablative-patch': {
    id: 'ablative-patch',
    name: 'Ablative Patch',
    kind: 'consumable',
    slot: 'consumable',
    rarity: 'uncommon',
    description: 'Gain 20 temporary armor for 20s.',
    stackLimit: 3,
    hotkey: 2,
    useDuration: 0,
    duration: 20,
    heal: 0,
    temporaryArmor: 20,
    damageMultiplier: 1,
    fireIntervalMultiplier: 1,
  },
  'redline-ampoule': {
    id: 'redline-ampoule',
    name: 'Redline Ampoule',
    kind: 'consumable',
    slot: 'consumable',
    rarity: 'rare',
    description: 'For 10s, deal 1.20x damage with a 0.85x fire interval.',
    stackLimit: 2,
    hotkey: 3,
    useDuration: 0,
    duration: 10,
    heal: 0,
    temporaryArmor: 0,
    damageMultiplier: 1.2,
    fireIntervalMultiplier: 0.85,
  },
} as const satisfies Record<string, ConsumableItemDefinition>

export const CONSUMABLE_SHARED_COOLDOWN = 2
export const BACKPACK_SIZE = 16

export const ITEM_CATALOG: Record<ItemId, ItemDefinition> = {
  ...WEAPON_ITEMS,
  ...ARMOR_ITEMS,
  ...CONSUMABLE_ITEMS,
}

export const DROP_TABLES: Record<Exclude<MobKind, 'sump-king'>, DropTable> = {
  'pipe-bruiser': {
    nothing: 0.55,
    weapon: {
      chance: 0.15,
      items: ['rifled-sewer-barrel', 'hydraulic-breach-block'],
    },
    armor: {
      chance: 0.2,
      items: ['patchwork-vest', 'bulwark-knees'],
    },
    consumable: { chance: 0.1, items: ['med-gel-injector'] },
  },
  'drain-gunner': {
    nothing: 0.45,
    weapon: {
      chance: 0.35,
      items: [
        'rifled-sewer-barrel',
        'overclocked-trigger',
        'jury-rigged-drum',
        'threat-painter',
      ],
    },
    armor: { chance: 0.1, items: ['targeting-visor'] },
    consumable: { chance: 0.1, items: ['med-gel-injector', 'redline-ampoule'] },
  },
  'blade-runner': {
    nothing: 0.55,
    weapon: {
      chance: 0.2,
      items: ['quickcell-magazine', 'overclocked-trigger'],
    },
    armor: { chance: 0.15, items: ['rubber-waders', 'servo-greaves'] },
    consumable: { chance: 0.1, items: ['med-gel-injector'] },
  },
  'shield-warden': {
    nothing: 0.35,
    weapon: {
      chance: 0.15,
      items: ['hydraulic-breach-block', 'voltaic-feed'],
    },
    armor: {
      chance: 0.4,
      items: ['riot-weave-jacket', 'bulwark-knees', 'sump-exoshell'],
    },
    consumable: { chance: 0.1, items: ['ablative-patch'] },
  },
  'arc-tech': {
    nothing: 0.3,
    weapon: {
      chance: 0.45,
      items: ['flechette-barrel', 'arc-coil-barrel', 'voltaic-feed', 'sump-oracle'],
    },
    armor: { chance: 0.05, items: ['targeting-visor'] },
    consumable: { chance: 0.2, items: ['ablative-patch', 'redline-ampoule'] },
  },
}

export const BOSS_DROP_TABLE = {
  weapon: [
    'scattershot-barrel',
    'arc-coil-barrel',
    'voltaic-feed',
    'sump-oracle',
  ] as const,
  weaponChanceEach: 0.25,
  armor: [
    'targeting-visor',
    'riot-weave-jacket',
    'sump-exoshell',
    'servo-greaves',
  ] as const,
  armorChanceEach: 0.25,
  medGelChance: 0.5,
  redlineChance: 0.25,
} as const

export const COMBAT_CONFIG = {
  minimumDamage: 1,
  armorConstant: 100,
  playerDamageInvulnerability: 0.35,
  enemyProjectileRadius: 0.25,
  playerCollisionRadius: 0.45,
  normalMobCollisionRadius: 0.5,
  bossCollisionRadius: 1,
  damageNumberDuration: 0.7,
  damageNumberRise: 0.8,
  criticalNumberScale: 1.25,
  armorHeavyPreventionFraction: 0.3,
  damageFlashDuration: 0.08,
  playerGunShake: 0.08,
  playerDamageShake: 0.18,
  bossSlamShake: 0.25,
} as const

export function mitigateDamage(raw: number, armor: number, penetration = 0): number {
  const effectiveArmor = Math.max(0, armor - penetration)
  const mitigated = raw * COMBAT_CONFIG.armorConstant / (COMBAT_CONFIG.armorConstant + effectiveArmor)
  return Math.max(COMBAT_CONFIG.minimumDamage, Math.ceil(mitigated))
}

export const LOOT_WORLD_CONFIG = {
  labelDistance: 3,
  pickupDistance: 1.8,
} as const

export const DEATH_CONFIG = {
  sequenceDuration: 1.2,
  currentRunScrapLoss: 0.15,
  respawnInvulnerability: 1,
} as const
