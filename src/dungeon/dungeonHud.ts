import type { Camera, Vector3 } from 'three'
import { ITEM_CATALOG, RARITY_CONFIG, xpToNextLevel } from './dungeonConfig.js'
import type {
  DerivedArmorStats,
  ItemDefinition,
  ItemInstance,
  PlayerProgress,
  WeaponStats,
} from './dungeonTypes.js'

export type DamageNumberKind = 'player' | 'enemy' | 'crit' | 'armor'

export interface DungeonHudDerivedStats {
  armor?: DerivedArmorStats | number
  weapon?: WeaponStats
  currentAmmo?: number
  ammo?: number
  magazine?: number
  totalArmor?: number
  total?: number
}

export interface DungeonInventoryHandlers {
  equip: (backpackIndex: number) => unknown
  scrap: (backpackIndex: number) => unknown
  use: (backpackIndex: number) => unknown
  close: () => unknown
}

const WEAPON_SLOTS = ['barrel', 'receiver', 'magazine', 'optic'] as const
const ARMOR_SLOTS = ['head', 'torso', 'legs'] as const

function element<T extends HTMLElement>(root: ParentNode, id: string): T {
  const found = root.querySelector<T>(`#${id}`)
  if (!found) throw new Error(`Dungeon HUD is missing #${id}`)
  return found
}

function clampFraction(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0
  return Math.max(0, Math.min(1, value / maximum))
}

function whole(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0))
}

function createDungeonHudMarkup(): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = `
    <div id="dungeon-hud" class="hidden">
      <div id="dng-player-panel" class="dng-panel">
        <div class="dng-panel-title"><span id="dng-level">LV 1</span><span id="dng-armor">ARM 0</span></div>
        <div class="dng-meter dng-hp-meter"><span id="dng-hp-fill"></span><b id="dng-hp-text">0 / 0</b></div>
        <div class="dng-meter dng-xp-meter"><span id="dng-xp-fill"></span><b id="dng-xp-text">XP 0 / 0</b></div>
      </div>
      <div id="dng-ammo" class="dng-panel"><span>AMMO</span><b id="dng-ammo-text">0 / 0</b></div>
      <div id="dng-scrap" class="dng-panel">SCRAP <b id="dng-scrap-text">0</b></div>
      <div id="dng-room" class="dng-panel"><b id="dng-room-text">0 / 0</b> PURGED</div>
      <div id="dng-boss" class="hidden">
        <div class="dng-boss-label"><b id="dng-boss-name">BOSS</b><span id="dng-boss-text">0 / 0</span></div>
        <div class="dng-boss-track"><span id="dng-boss-fill"></span><i class="phase phase-60"></i><i class="phase phase-30"></i></div>
      </div>
      <div id="dng-banner" class="hidden"></div>
      <div id="dng-prompt" class="hidden"></div>
      <div id="dng-inventory" class="hidden">
        <div class="dng-inventory-panel">
          <header><div><span>SEWER LOADOUT</span><small>INVENTORY 4 × 4</small></div><button id="dng-inventory-close" type="button">X</button></header>
          <div class="dng-inventory-body">
            <section class="dng-equipment"><h2>WEAPON PARTS</h2><div id="dng-weapon-slots" class="dng-equipment-slots"></div><h2>ARMOR</h2><div id="dng-armor-slots" class="dng-equipment-slots"></div></section>
            <section class="dng-backpack"><h2>BACKPACK <span id="dng-pack-count">0 / 16</span></h2><div id="dng-inventory-grid"></div></section>
            <aside id="dng-item-detail"><div class="dng-detail-empty">SELECT AN ITEM</div></aside>
          </div>
        </div>
      </div>
    </div>`
  return wrapper.firstElementChild as HTMLDivElement
}

function createDamageLayer(): HTMLDivElement {
  const layer = document.createElement('div')
  layer.id = 'dng-dmg-layer'
  return layer
}

export class DungeonHud {
  private readonly root: HTMLDivElement
  private readonly damageLayer: HTMLDivElement
  private readonly levelText: HTMLElement
  private readonly armorText: HTMLElement
  private readonly hpFill: HTMLElement
  private readonly hpText: HTMLElement
  private readonly xpFill: HTMLElement
  private readonly xpText: HTMLElement
  private readonly ammoText: HTMLElement
  private readonly scrapText: HTMLElement
  private readonly roomText: HTMLElement
  private readonly boss: HTMLElement
  private readonly bossName: HTMLElement
  private readonly bossText: HTMLElement
  private readonly bossFill: HTMLElement
  private readonly banner: HTMLElement
  private readonly prompt: HTMLElement
  private readonly inventory: HTMLElement
  private readonly inventoryGrid: HTMLElement
  private readonly weaponSlots: HTMLElement
  private readonly armorSlots: HTMLElement
  private readonly packCount: HTMLElement
  private readonly itemDetail: HTMLElement
  private readonly closeButton: HTMLButtonElement

  private handlers: DungeonInventoryHandlers | null = null
  private inventoryProgress: PlayerProgress | null = null
  private selectedBackpackIndex: number | null = null
  private scrapConfirmationIndex: number | null = null
  private bannerTimer: number | null = null
  private damageTimers = new Set<number>()
  private disposed = false

  private readonly onInventoryClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return

    const slot = target.closest<HTMLElement>('[data-backpack-index]')
    if (slot && this.inventoryGrid.contains(slot)) {
      const index = Number(slot.dataset.backpackIndex)
      if (Number.isInteger(index) && this.inventoryProgress?.backpack[index]) {
        this.selectedBackpackIndex = index
        this.scrapConfirmationIndex = null
        this.renderInventory(this.inventoryProgress)
      }
      return
    }

    const action = target.closest<HTMLButtonElement>('[data-dng-action]')?.dataset.dngAction
    if (!action) return
    if (action === 'close') {
      this.closeInventory()
      this.handlers?.close()
      return
    }
    const index = this.selectedBackpackIndex
    if (index === null || !this.inventoryProgress?.backpack[index]) return

    if (action === 'scrap' && this.scrapConfirmationIndex !== index) {
      this.scrapConfirmationIndex = index
      this.renderItemDetail(this.inventoryProgress, index)
      return
    }

    if (action === 'equip') this.handlers?.equip(index)
    if (action === 'use') this.handlers?.use(index)
    if (action === 'scrap') this.handlers?.scrap(index)
    this.scrapConfirmationIndex = null
    if (!this.inventoryProgress.backpack[index]) this.selectedBackpackIndex = null
    this.renderInventory(this.inventoryProgress)
  }

  constructor() {
    let hud = document.getElementById('hud')
    if (!hud) {
      hud = document.createElement('div')
      hud.id = 'hud'
      document.body.append(hud)
    }

    this.root = hud.querySelector<HTMLDivElement>('#dungeon-hud') ?? createDungeonHudMarkup()
    if (!hud.contains(this.root)) hud.append(this.root)
    this.damageLayer =
      hud.querySelector<HTMLDivElement>('#dng-dmg-layer') ?? createDamageLayer()
    if (!hud.contains(this.damageLayer)) hud.append(this.damageLayer)

    this.levelText = element(this.root, 'dng-level')
    this.armorText = element(this.root, 'dng-armor')
    this.hpFill = element(this.root, 'dng-hp-fill')
    this.hpText = element(this.root, 'dng-hp-text')
    this.xpFill = element(this.root, 'dng-xp-fill')
    this.xpText = element(this.root, 'dng-xp-text')
    this.ammoText = element(this.root, 'dng-ammo-text')
    this.scrapText = element(this.root, 'dng-scrap-text')
    this.roomText = element(this.root, 'dng-room-text')
    this.boss = element(this.root, 'dng-boss')
    this.bossName = element(this.root, 'dng-boss-name')
    this.bossText = element(this.root, 'dng-boss-text')
    this.bossFill = element(this.root, 'dng-boss-fill')
    this.banner = element(this.root, 'dng-banner')
    this.prompt = element(this.root, 'dng-prompt')
    this.inventory = element(this.root, 'dng-inventory')
    this.inventoryGrid = element(this.root, 'dng-inventory-grid')
    this.weaponSlots = element(this.root, 'dng-weapon-slots')
    this.armorSlots = element(this.root, 'dng-armor-slots')
    this.packCount = element(this.root, 'dng-pack-count')
    this.itemDetail = element(this.root, 'dng-item-detail')
    this.closeButton = element<HTMLButtonElement>(this.root, 'dng-inventory-close')

    this.inventory.addEventListener('click', this.onInventoryClick)
    this.closeButton.dataset.dngAction = 'close'
  }

  show(): void {
    if (!this.disposed) this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
    this.closeInventory()
    this.hideBossBar()
    this.setPickupPrompt(null)
  }

  updatePlayer(progress: PlayerProgress, derivedStats: DungeonHudDerivedStats): void {
    const hp = whole(progress.hp)
    const maxHp = Math.max(1, whole(progress.maxHp))
    const neededXp = xpToNextLevel(progress.level)
    const maximumLevel = neededXp <= 0

    const nestedArmor =
      typeof derivedStats.armor === 'object' ? derivedStats.armor.total : derivedStats.armor
    const armor =
      nestedArmor ?? derivedStats.totalArmor ?? derivedStats.total ?? progress.baseArmor
    const magazine = whole(derivedStats.weapon?.magazine ?? derivedStats.magazine ?? 0)
    const ammo = whole(derivedStats.currentAmmo ?? derivedStats.ammo ?? magazine)

    this.levelText.textContent = `LV ${whole(progress.level)}`
    this.armorText.textContent = `ARM ${whole(armor)}`
    this.hpText.textContent = `${hp} / ${maxHp}`
    this.hpFill.style.width = `${clampFraction(progress.hp, progress.maxHp) * 100}%`
    this.hpFill.classList.toggle('low', progress.hp / maxHp <= 0.25)
    this.xpText.textContent = maximumLevel ? 'XP MAX' : `XP ${whole(progress.xp)} / ${whole(neededXp)}`
    this.xpFill.style.width = `${maximumLevel ? 100 : clampFraction(progress.xp, neededXp) * 100}%`
    this.scrapText.textContent = whole(progress.scrap).toString()
    this.ammoText.textContent = `${ammo} / ${magazine}`
    this.ammoText.classList.toggle('empty', ammo === 0)

    if (this.inventoryProgress === progress && this.isInventoryOpen()) {
      this.renderInventory(progress)
    }
  }

  updateRoomProgress(clearedMain: number, totalMain: number): void {
    this.roomText.textContent = `${whole(clearedMain)} / ${whole(totalMain)}`
  }

  showBossBar(name: string, hp: number, maxHp: number): void {
    const safeMax = Math.max(1, whole(maxHp))
    this.bossName.textContent = name
    this.bossText.textContent = `${whole(hp)} / ${safeMax}`
    this.bossFill.style.width = `${clampFraction(hp, maxHp) * 100}%`
    this.boss.classList.remove('hidden')
  }

  hideBossBar(): void {
    this.boss.classList.add('hidden')
  }

  showDamageNumber(
    worldPos: Vector3,
    camera: Camera,
    rendererDom: HTMLElement,
    amount: number,
    kind: DamageNumberKind,
  ): void {
    if (this.disposed) return
    const projected = worldPos.clone().project(camera)
    if (projected.z < -1 || projected.z > 1) return

    const rect = rendererDom.getBoundingClientRect()
    const number = document.createElement('span')
    number.className = `dng-damage-number ${kind}`
    number.textContent = whole(amount).toString()
    number.style.left = `${rect.left + (projected.x + 1) * 0.5 * rect.width}px`
    number.style.top = `${rect.top + (1 - projected.y) * 0.5 * rect.height}px`
    this.damageLayer.append(number)

    const timer = window.setTimeout(() => {
      number.remove()
      this.damageTimers.delete(timer)
    }, 700)
    this.damageTimers.add(timer)
  }

  showBanner(text: string, ms: number): void {
    if (this.bannerTimer !== null) window.clearTimeout(this.bannerTimer)
    this.banner.textContent = text
    this.banner.classList.remove('hidden')
    this.bannerTimer = window.setTimeout(() => {
      this.banner.classList.add('hidden')
      this.bannerTimer = null
    }, Math.max(0, ms))
  }

  setPickupPrompt(text: string | null): void {
    this.prompt.textContent = text ?? ''
    this.prompt.classList.toggle('hidden', !text)
  }

  openInventory(progress: PlayerProgress): void {
    if (this.disposed) return
    this.inventoryProgress = progress
    if (
      this.selectedBackpackIndex !== null &&
      !progress.backpack[this.selectedBackpackIndex]
    ) {
      this.selectedBackpackIndex = null
    }
    this.renderInventory(progress)
    this.inventory.classList.remove('hidden')
  }

  closeInventory(): void {
    this.inventory.classList.add('hidden')
    this.selectedBackpackIndex = null
    this.scrapConfirmationIndex = null
  }

  isInventoryOpen(): boolean {
    return !this.inventory.classList.contains('hidden')
  }

  bindInventoryActions(handlers: DungeonInventoryHandlers): void {
    this.handlers = handlers
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.inventory.removeEventListener('click', this.onInventoryClick)
    if (this.bannerTimer !== null) window.clearTimeout(this.bannerTimer)
    for (const timer of this.damageTimers) window.clearTimeout(timer)
    this.damageTimers.clear()
    this.damageLayer.replaceChildren()
    this.handlers = null
    this.inventoryProgress = null
    this.hide()
  }

  private renderInventory(progress: PlayerProgress): void {
    this.packCount.textContent = `${progress.backpack.filter(Boolean).length} / ${progress.backpack.length}`
    this.renderEquipment(progress)

    const slots = Array.from({ length: 16 }, (_, index) => {
      const item = progress.backpack[index] ?? null
      return this.itemSlotMarkup(item, index)
    })
    this.inventoryGrid.innerHTML = slots.join('')

    if (this.selectedBackpackIndex === null) {
      this.itemDetail.innerHTML = '<div class="dng-detail-empty">SELECT AN ITEM</div>'
    } else {
      this.renderItemDetail(progress, this.selectedBackpackIndex)
    }
  }

  private renderEquipment(progress: PlayerProgress): void {
    this.weaponSlots.innerHTML = WEAPON_SLOTS.map((slot) =>
      this.equipmentSlotMarkup(slot, progress.equippedWeapon[slot]),
    ).join('')
    this.armorSlots.innerHTML = ARMOR_SLOTS.map((slot) =>
      this.equipmentSlotMarkup(slot, progress.equippedArmor[slot]),
    ).join('')
  }

  private equipmentSlotMarkup(label: string, item: ItemInstance | null): string {
    const definition = item ? ITEM_CATALOG[item.itemId] : null
    const rarity = definition ? ` rarity-${definition.rarity}` : ''
    const itemName = definition?.name ?? 'EMPTY'
    return `<div class="dng-equip-slot${rarity}"><span>${label.toUpperCase()}</span><b>${itemName}</b></div>`
  }

  private itemSlotMarkup(item: ItemInstance | null, index: number): string {
    if (!item) {
      return `<button class="dng-item-slot empty" data-backpack-index="${index}" type="button" aria-label="Empty inventory slot"><span>${index + 1}</span></button>`
    }
    const definition = ITEM_CATALOG[item.itemId]
    const selected = this.selectedBackpackIndex === index ? ' selected' : ''
    const quantity = item.quantity > 1 ? `<em>×${item.quantity}</em>` : ''
    return `<button class="dng-item-slot rarity-${definition.rarity}${selected}" data-backpack-index="${index}" type="button" title="${definition.name}"><span>${this.itemGlyph(definition)}</span><b>${definition.name}</b>${quantity}</button>`
  }

  private itemGlyph(definition: ItemDefinition): string {
    if (definition.kind === 'consumable') return String(definition.hotkey)
    if (definition.kind === 'armor') return 'A'
    return 'W'
  }

  private renderItemDetail(progress: PlayerProgress, index: number): void {
    const item = progress.backpack[index]
    if (!item) {
      this.selectedBackpackIndex = null
      this.itemDetail.innerHTML = '<div class="dng-detail-empty">SELECT AN ITEM</div>'
      return
    }
    const definition = ITEM_CATALOG[item.itemId]
    const scrapValue = RARITY_CONFIG[definition.rarity].scrapValue * item.quantity
    const primaryAction =
      definition.kind === 'consumable'
        ? '<button data-dng-action="use" type="button">USE</button>'
        : '<button data-dng-action="equip" type="button">EQUIP</button>'
    const confirm = this.scrapConfirmationIndex === index
    this.itemDetail.innerHTML = `
      <div class="dng-detail rarity-${definition.rarity}">
        <small>${definition.rarity.toUpperCase()} · ${definition.slot.toUpperCase()}</small>
        <h2>${definition.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}</h2>
        <p>${definition.description}</p>
        <div class="dng-detail-actions">
          ${primaryAction}
          <button class="${confirm ? 'confirm' : ''}" data-dng-action="scrap" type="button">${confirm ? `CONFIRM +${scrapValue}` : `SCRAP +${scrapValue}`}</button>
        </div>
      </div>`
  }
}
