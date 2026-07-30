# Sewer Dungeon Design

## Scope

This is a one-day MVP for the existing `Game` class in `src/game.ts`. Walking into the existing sewer hatch starts a newly seeded run. The current long sewer tunnel is replaced or hidden by a small graph of room groups built from Three.js primitives. The system reuses the existing isometric camera, WASD movement, mouse aim, raycast shooting, tracers, and surface return flow.

The MVP has:

- 8 rooms per run: 6 on the required entrance-to-boss path and 2 optional branches.
- Five reusable room element types. Every type has compatible north/east/south/west door sockets, so any type can connect to any other type.
- Four normal combat rooms, two optional reward encounters, an entrance room, and a final boss room.
- Room-local enemy steering instead of a navmesh.
- A 16-slot inventory, four weapon-part slots, three armor slots, three consumable hotkeys, XP, scrap, loot drops, and combat HUD.

Out of scope for this pass: multiplayer, quests, procedural meshes, saved dungeon state, item affixes, vendors, crafting, drag-and-drop inventory, and full pathfinding.

## Run flow

1. The player enters the surface hatch.
2. Generate a fresh dungeon from `seed = Date.now() ^ runCounter`.
3. Spawn the player in the entrance room with HP restored to maximum. Consumables and equipment persist between runs.
4. Entering an uncleared combat room closes its connected doors and starts its encounter.
5. Killing all enemies unlocks the doors and rolls loot.
6. The boss door opens only after all four main-path combat rooms are clear. Optional branches are not required.
7. Killing the boss displays `SEWER PURGED`, awards boss loot, and opens an exit ladder.
8. Using the ladder returns the player to `surfaceReturnPos`. Entering again creates a new run.

## World scale and shared room contract

- Ground plane: `y = 0`.
- Dungeon grid cell: `28 x 28` world units.
- Wall height: `3.4`.
- Door opening: `3.0` wide, centered on a wall.
- Door trigger: `3.0 x 2.0`, extending one unit to each side of the wall.
- A room occupies one grid cell; its playable floor is at most `22 x 22`, preventing overlap.
- Socket directions are `N = -Z`, `E = +X`, `S = +Z`, and `W = -X`.
- Every room builder accepts an `openSockets: Set<'N' | 'E' | 'S' | 'W'>`. It places a door for every graph edge and a solid wall at every unused socket.
- Connecting rooms add a `6 x 3` floor bridge between their door openings. No free-form corridor routing is needed.
- Room props must leave a two-unit-wide path from every open socket to the room center.

## Room types

All spawn counts below include only normal mobs. The entrance and boss overrides take precedence over a template's normal rules.

| Type | Purpose and visual identity | Playable size | Door sockets | Spawn rules |
|---|---|---:|---|---|
| **Access Junction** | Entrance, navigation hub, and low-pressure first encounter. Square concrete floor, ladder, four warning lamps, center drain. | `18 x 18` | N/E/S/W | Forced as room 0 with no enemies. If reused later, budget 4, max 3 mobs, no Arc Tech, and four corner spawn points. |
| **Pump Hall** | Open kiting arena. Two pumps create soft cover without blocking the center. Cyan pipe lights identify it. | `22 x 16` | N/E/S/W | Standard budget for its depth, max 4 mobs, max 2 ranged mobs. Eight perimeter spawn points. Gunners prefer the long walls. |
| **Filtration Beds** | Lane combat. Three low filter beds make four walkable lanes; beds block movement and shots. Green toxic glow. | `20 x 20` | N/E/S/W | Standard budget, max 4 mobs, must include at least 1 melee mob, max 1 Gunner. Never spawn inside a lane entrance or within 6 units of the player. |
| **Maintenance Maze** | Close-range pressure and ambushes. Four waist-high machinery blocks form an offset cross. Amber work lights. | `18 x 22` | N/E/S/W | Standard budget, max 4 mobs, max 1 Gunner, Blade Runner weight doubled. Enemies use six prop-adjacent spawn points, but all spawned enemies are revealed when doors close. |
| **Overflow Cistern** | Large set-piece arena with a dry center and shallow glowing perimeter water. Used for the final boss. | `22 x 22` | N/E/S/W | Forced as room 7 with only the boss. If selected for a non-boss room, budget +1, max 5 mobs, max 2 ranged mobs. Boss version has one incoming socket and no loop edge. |

Template assignment guarantees all five types in every run:

- Room 0 is Access Junction.
- The boss room is Overflow Cistern.
- Shuffle Pump Hall, Filtration Beds, and Maintenance Maze into three different main-path rooms.
- Fill the remaining three rooms using equal random weights across all five templates, except Access Junction cannot be selected for the room immediately before the boss.

## Dungeon graph generation

### Data shape

```ts
type Direction = 'N' | 'E' | 'S' | 'W'

interface DungeonRoom {
  id: number
  gridX: number
  gridZ: number
  depth: number
  template: RoomType
  role: 'entrance' | 'main' | 'branch' | 'boss'
  neighbors: Partial<Record<Direction, number>>
  state: 'dormant' | 'active' | 'cleared'
}
```

Use a tiny seeded PRNG such as `mulberry32(seed)` for graph layout, templates, encounters, and loot. Store and show the seed in the pause/inventory panel so a bad layout can be reproduced.

### Algorithm

1. Place entrance room 0 at grid `(0, 0)`.
2. Build a six-room critical path: entrance, four normal rooms, and boss.
3. For each next critical-path room:
   - Shuffle N/E/S/W.
   - Pick the first adjacent unoccupied grid cell.
   - Reject a candidate if it would give the previous room more than three neighbors.
   - If no direction works, backtrack one placement. Restart the graph after ten backtracks.
4. Add two branch rooms:
   - Pick a non-boss critical room at depth 1-4 with degree below three.
   - Place the branch in a random free cardinal neighbor.
   - Prefer different parent rooms; allow the second branch to extend from the first only if no main-path socket is free.
5. Add optional loops. For every pair of rooms already in cardinally adjacent cells but not connected, add an edge with 35% probability if both degrees stay at or below three. Never add a second edge to the boss.
6. Validate:
   - Exactly eight rooms exist.
   - Breadth-first search reaches all rooms from room 0.
   - The boss is exactly critical depth 5.
   - The boss has exactly one neighbor.
   - The critical path has four normal encounters.
   - All five templates are represented.
7. Retry with `seed + attempt` if validation fails, up to 50 attempts. A straight six-room path with two one-room branches is the deterministic fallback.
8. Convert grid coordinates to world coordinates:
   - `worldX = SEWER_ORIGIN_X + gridX * 28`
   - `worldZ = SEWER_ORIGIN_Z + gridZ * 28`
9. Build each room and only the doors represented by graph edges. Opposite socket pairs must agree (`N/S`, `E/W`).

The boss path is guaranteed because it is created before branches or loops and retained during validation. Keep `criticalPathRoomIds` explicitly rather than inferring it later.

### Encounter budget

Normal mob costs are:

| Mob | Cost |
|---|---:|
| Blade Runner | 1 |
| Pipe Bruiser | 2 |
| Drain Gunner | 2 |
| Shield Warden | 3 |
| Arc Tech | 3 |

Base room budget is `3 + depth`, giving budgets 4, 5, 6, and 7 for main-path depths 1-4. A non-boss Overflow Cistern adds 1. A branch uses its parent depth and adds 1 because it contains optional rewards.

Fill a room by repeatedly choosing a legal mob whose cost fits the remaining budget. Stop when no legal choice fits; an unspent point is acceptable. Apply the template limits plus these global fairness rules:

- Maximum 4 normal mobs, or 5 in a non-boss Cistern.
- Maximum 2 ranged mobs (`Drain Gunner` or `Arc Tech`).
- Maximum 1 Shield Warden and 1 Arc Tech.
- Do not combine 2 Gunners with an Arc Tech.
- Spawn at least 6 units from the player and 2 units from another mob.
- Enemies become active 0.6 seconds after doors close; they cannot attack during that delay.

## Mob roster

Stats are level-1 values. Distances and speeds are world units. Cooldown is measured from the end of the previous attack. Enemies never deal contact damage.

| Mob | HP | Armor | Damage | Speed | Range / cooldown | Behavior |
|---|---:|---:|---:|---:|---|---|
| **Pipe Bruiser** | 90 | 8 | 18 | 3.8 | 2.0 melee / 1.0 s | Chases directly. At range 2.0, stops for a 0.55 s club windup, then swings a 100-degree arc. Miss or hit is followed by 0.45 s recovery. |
| **Drain Gunner** | 65 | 4 | 11 | 3.1 | 8-16 preferred / 1.1 s | Strafes to maintain 10 units. Shows a red aim line for 0.25 s, then fires one visible projectile at speed 13. Projectile lifetime is 1.6 s. Relocates if the player is out of sight for 1.5 s. |
| **Blade Runner** | 50 | 0 | 13 | 5.2 | 1.6 melee / 1.4 s | Circles until 5-7 units away, flashes pink for 0.35 s, then dashes up to 5 units at speed 10. The blade can hit once per dash. Has 0.5 s recovery. |
| **Shield Warden** | 130 | 24 | 16 | 2.6 | 2.1 melee / 1.6 s | Advances facing the player. Its front 120-degree shield arc grants 35 extra armor. A 0.65 s bash windup is followed by a 2-unit hit and 0.8-unit knockback. Shots from behind ignore the bonus armor. |
| **Arc Tech** | 75 | 10 | 9 | 3.0 | 7-13 preferred / 2.2 s | Retreats from melee. Charges for 0.6 s and launches an orb at speed 8. On impact or after 1.8 s, the orb creates a clearly marked 2.5-radius field that deals 9 once after a 0.45 s warning. |
| **The Sump King** (boss) | 650 | 22 | 26 max strike / 10 bolt | 2.8 | attack-specific | Uses the phase rotation below. Cannot be staggered, but every attack has a telegraph. |

For a run generated above player level 1, snapshot `scaleLevel = min(playerLevel, 5)` and apply:

- Enemy and boss HP: `baseHP * (1 + 0.10 * (scaleLevel - 1))`, rounded up.
- Enemy and boss damage: `baseDamage * (1 + 0.06 * (scaleLevel - 1))`, rounded up.
- Armor and speed do not scale.

### Boss behavior

The Sump King targets the player continuously and selects the first available legal attack:

1. **Wrench slam:** if within 3 units, 0.9 s orange floor cone, then 26 damage in a 2.6-radius, 120-degree arc; 0.8 s recovery.
2. **Scrap burst:** if farther than 3 units, 0.5 s red aim line, then three projectiles in a 12-degree fan, each dealing 10 at speed 11; 1.5 s cooldown. A player can be hit by at most two bolts from one burst.
3. **Drain charge:** every 12 seconds, 0.8 s straight floor lane telegraph, then charge 8 units at speed 9 for 20 damage; the boss is vulnerable and stationary for 1.2 s afterward.
4. At 60% and 30% HP, become invulnerable for 1.0 s, roar, then summon one Pipe Bruiser and one Blade Runner from marked grates. Never keep more than two summoned mobs alive; skip excess summons.
5. Below 30% HP, movement speed becomes 3.4 and Scrap Burst cooldown becomes 1.1 s. Damage does not increase.

The boss bar appears when its room locks and includes name, HP fraction, and phase markers at 60% and 30%.

## Player stats and progression

### Base level-1 stats

| Stat | Value |
|---|---:|
| Maximum HP | 140 |
| Base armor | 12 |
| Walk speed | 5.6 |
| Sprint speed | 9.2 |
| Weapon damage | 16 |
| Fire interval | 0.18 s |
| Magazine | 18 |
| Reload | 1.4 s |
| Range | 35 |
| Spread | 1.5 degrees |
| Critical chance | 5% |
| Critical multiplier | 1.5x |

Level starts at 1 and caps at 10. XP needed for the next level is `500 + 250 * (level - 1)`. Each level-up fully heals the player and permanently grants `+8 maximum HP` and `+1 weapon damage`. Display a short `LEVEL UP` banner; do not open a talent screen in the MVP.

XP and scrap awards:

| Mob | XP | Scrap |
|---|---:|---:|
| Blade Runner | 30 | 6-10 |
| Pipe Bruiser | 40 | 8-14 |
| Drain Gunner | 45 | 10-16 |
| Shield Warden | 60 | 14-22 |
| Arc Tech | 65 | 16-24 |
| The Sump King | 400 | 250 |

### Equipment resolution

The player equips one part in each weapon slot (`barrel`, `receiver`, `magazine`, `optic`) and one armor piece in each armor slot (`head`, `torso`, `legs`).

Resolve weapon stats in this order:

1. Start from base stats plus level damage.
2. Let the barrel replace values explicitly listed in its description.
3. Add flat receiver and magazine changes.
4. Apply multiplicative changes.
5. Clamp to: damage at least 5, fire interval at least 0.09 s, magazine at least 6, reload at least 0.6 s, and speed at least 4.5.

Total armor is `base armor + equipped armor values + temporary armor`. Armor movement modifiers apply to both walk and sprint speed.

## Item catalog

Rarity is fixed per item for this MVP, which avoids procedural affix UI and balance work.

| Rarity | Color | World beam | Scrap value |
|---|---|---:|---:|
| Common | `#d5d9dd` | 0.8 units | 15 |
| Uncommon | `#52e38b` | 1.0 units | 30 |
| Rare | `#47a7ff` | 1.2 units | 65 |
| Epic | `#c86bff` | 1.5 units | 140 |

Duplicate equipment can be picked up or scrapped from the inventory for its listed value.

### Weapon parts

| Slot | Item | Rarity | Exact effect |
|---|---|---|---|
| Barrel | **Rifled Sewer Barrel** | Common | `+2 damage`, range becomes 42, spread becomes 0.8 degrees. |
| Barrel | **Flechette Barrel** | Uncommon | Damage becomes 14, range becomes 30, spread becomes 2 degrees, and attacks ignore 12 armor. |
| Barrel | **Scattershot Barrel** | Rare | Six rays per shot, 7 damage each, range 16, spread 14 degrees, and fire interval cannot be below 0.55 s. Each ray crits separately. |
| Barrel | **Arc-Coil Barrel** | Epic | Damage becomes 13, range 25, `+0.08 s` fire interval. A hit chains once to the nearest second enemy within 4 units for 50% final damage. |
| Receiver | **Balanced Bolt Pack** | Common | No stat change; starter receiver and a low-value scrap drop. |
| Receiver | **Overclocked Trigger** | Uncommon | Fire interval `x0.78`; damage `x0.90`. |
| Receiver | **Hydraulic Breach Block** | Rare | Damage `x1.35`; fire interval `x1.30`; `+0.20 s` reload. |
| Magazine | **Quickcell Magazine** | Common | `-4` magazine capacity; `-0.40 s` reload. |
| Magazine | **Jury-Rigged Drum** | Uncommon | `+12` magazine capacity; `+0.35 s` reload. |
| Magazine | **Voltaic Feed** | Rare | `+4` magazine capacity; every sixth shot deals `+8` raw electric damage. Counter resets on reload. |
| Optic | **Glow-Sight** | Common | Aim-assist angle becomes 4 degrees. |
| Optic | **Threat-Painter** | Uncommon | `+5` percentage points critical chance; aim-assist angle becomes 3 degrees. |
| Optic | **Sump Oracle** | Epic | `+10` percentage points critical chance; the crosshair marks enemies below 25% HP. |

The starter weapon uses Balanced Bolt Pack and empty/default values in the other three slots. An empty slot makes no stat change.

### Armor

| Slot | Item | Rarity | Exact effect |
|---|---|---|---|
| Head | **Filter Hood** | Common | `+5 armor`. |
| Head | **Targeting Visor** | Rare | `+8 armor`, `+5` percentage points critical chance. |
| Torso | **Patchwork Vest** | Common | `+9 armor`. |
| Torso | **Riot-Weave Jacket** | Uncommon | `+14 armor`, `-0.20` movement speed. |
| Torso | **Sump Exoshell** | Epic | `+20 armor`, `+20 maximum HP`, `-0.40` movement speed. |
| Legs | **Rubber Waders** | Common | `+4 armor`. |
| Legs | **Bulwark Knees** | Uncommon | `+10 armor`, `-0.25` movement speed. |
| Legs | **Servo Greaves** | Rare | `+7 armor`, `+0.50` movement speed. |

Equipping maximum-HP armor changes both maximum and current HP by the same amount. Unequipping it cannot reduce current HP below 1.

### Consumables

| Item | Rarity | Stack | Hotkey | Effect |
|---|---|---:|---|---|
| **Med-Gel Injector** | Common | 5 | `1` | After a 0.4 s use animation, heal 45 HP. Taking damage cancels use without consuming it. Shared consumable cooldown: 2 s. |
| **Ablative Patch** | Uncommon | 3 | `2` | Gain 20 temporary armor for 20 s. Reusing refreshes duration; it does not stack. Shared cooldown: 2 s. |
| **Redline Ampoule** | Rare | 2 | `3` | For 10 s, damage is `x1.20` and fire interval is `x0.85`. Reusing refreshes duration. Shared cooldown: 2 s. |

## Drop tables

Each normal mob rolls its table once on death. The ranges total 100%; “nothing” means the XP and scrap still drop. If an item set is selected, choose uniformly from the listed items. Loot is rolled when the mob dies, not when it spawns.

| Mob | Nothing | Weapon part | Armor | Consumable |
|---|---:|---|---|---|
| Pipe Bruiser | 55% | 15%: Rifled Sewer Barrel, Hydraulic Breach Block | 20%: Patchwork Vest, Bulwark Knees | 10%: Med-Gel Injector |
| Drain Gunner | 45% | 35%: Rifled Sewer Barrel, Overclocked Trigger, Jury-Rigged Drum, Threat-Painter | 10%: Targeting Visor | 10%: Med-Gel Injector, Redline Ampoule |
| Blade Runner | 55% | 20%: Quickcell Magazine, Overclocked Trigger | 15%: Rubber Waders, Servo Greaves | 10%: Med-Gel Injector |
| Shield Warden | 35% | 15%: Hydraulic Breach Block, Voltaic Feed | 40%: Riot-Weave Jacket, Bulwark Knees, Sump Exoshell | 10%: Ablative Patch |
| Arc Tech | 30% | 45%: Flechette Barrel, Arc-Coil Barrel, Voltaic Feed, Sump Oracle | 5%: Targeting Visor | 20%: Ablative Patch, Redline Ampoule |

The Sump King drops all of the following:

1. 250 scrap and 400 XP.
2. One weapon item, with equal 25% weights: Scattershot Barrel, Arc-Coil Barrel, Voltaic Feed, or Sump Oracle.
3. One armor item, with equal 25% weights: Targeting Visor, Riot-Weave Jacket, Sump Exoshell, or Servo Greaves.
4. A 50% chance for one Med-Gel Injector and a separate 25% chance for one Redline Ampoule.

World loot remains for the duration of the run. It has a colored vertical beam, a slowly rotating mesh, and a label shown within 3 units. At 1.8 units, press `E` to pick it up. Scrap or stackable consumables merge automatically; equipment needs one free backpack slot. If full, show `INVENTORY FULL` and leave the item on the floor.

## Inventory UX

### Slots

- 16 backpack slots in a `4 x 4` grid.
- 4 weapon equipment slots: barrel, receiver, magazine, optic.
- 3 armor equipment slots: head, torso, legs.
- Consumables occupy backpack slots and stack to their listed limit.
- Scrap and XP are counters and consume no slots.

### Controls

| Input | Action |
|---|---|
| `I` or `Tab` | Toggle inventory; pauses dungeon simulation and releases firing. |
| `WASD` | Move. |
| `Shift` | Sprint. |
| Mouse | Aim. |
| Left mouse | Fire. |
| `R` | Reload. Reload also starts automatically when firing an empty magazine. |
| `E` | Pick up nearest labeled loot or use exit ladder. |
| `1`, `2`, `3` | Use Med-Gel, Ablative Patch, Redline Ampoule. |
| `Esc` | Close inventory first, otherwise pause. |

While the inventory is open:

- Click a backpack item to show name, rarity, slot, exact effects, and buttons.
- `Equip` swaps with the currently equipped item; the old item returns to the selected backpack slot.
- `Use` consumes a consumable.
- `Scrap` requires a second click and awards the rarity scrap value.
- No drag-and-drop is required.
- Disable the current numeric ground-concept debug switching while in a dungeon so keys 1-3 are unambiguous.

## Combat rules

### Damage and armor

For every hit:

```text
effectiveArmor = max(0, targetArmor - armorPenetration)
mitigated = rawDamage * 100 / (100 + effectiveArmor)
finalDamage = max(1, ceil(mitigated))
```

Examples:

- 18 raw damage into the base player's 12 armor deals `ceil(16.07) = 17`.
- 16 raw damage into a Pipe Bruiser's 8 armor deals `ceil(14.81) = 15`.
- Flechette's 12 penetration reduces a Shield Warden's normal 24 armor to 12.

Player critical hits roll independently per ray and multiply raw damage by 1.5 before armor. Enemy attacks do not crit. Temporary armor is part of target armor, not a separate shield pool.

### Player weapon

- Player shots remain raycasts/hitscan to match the current `game.ts` implementation. Tracer meshes are visual only.
- A shot consumes one magazine round, including a Scattershot shot.
- Reloading prevents firing and sprinting for its duration. Moving at walk speed is allowed.
- Taking damage does not cancel reload.
- Raycasts stop at the first room prop or wall. Flechette may pierce one normal enemy, but never geometry or the boss.
- Aim assist may select only an alive enemy inside the listed angle, range, and current room.

### Enemy attacks

- Enemy melee checks overlap only at the end of the windup; moving out before that moment avoids damage.
- Telegraph color is consistent: orange for melee/area attacks, red for aimed projectiles, pink for dashes.
- Enemy projectiles are spheres with collision radius 0.25 and are destroyed by walls.
- The player receives 0.35 s damage invulnerability after a hit. The hit that starts invulnerability still applies; later hits during it show no damage number. This prevents unavoidable overlapping bursts.
- The player has a collision radius of 0.45; normal mobs use 0.5; the boss uses 1.0.
- Mobs use direct seek/strafe steering and simple separation. If a direct path intersects a rectangular room prop, steer toward the nearer free side. No navmesh or A* is required.
- An enemy farther than 22 units from the player returns toward its room center. Enemies never leave their room through a door.

### Damage feedback

- Spawn a screen-facing damage number at the hit position for 0.7 s, rising 0.8 units.
- Player damage: white; critical: yellow and 1.25x size; armor-heavy hit (30%+ prevented): blue; damage to player: red.
- Flash the damaged model emissive for 0.08 s.
- Apply no more than one camera shake at a time: 0.08 units for player gun, 0.18 for taking damage, and 0.25 for boss slam.

## HUD and light MMO features

Use DOM overlays, consistent with the existing crosshair and kill counter.

- **Top left:** player level, HP bar with `current / max`, armor number, and XP bar with `current / next`.
- **Bottom center:** four weapon-part icons, ammo `current / magazine`, reload progress, and the three consumable icons with stack counts/cooldowns.
- **Top right:** scrap total, current room count such as `3 / 4 PURGED`, and compact seed.
- **Center:** crosshair, interaction prompt, `INVENTORY FULL`, room-clear, and level-up messages.
- **Boss room:** full-width boss bar at top center with 60% and 30% phase ticks.
- **World:** rarity beam and pickup label; floating damage numbers.

Scrap is awarded immediately on mob death with a small `+12 SCRAP` flyout. XP and equipment persist across death and between runs for the browser session. Persistence to `localStorage` is optional only if time remains.

## Death and fairness

- At 0 HP, stop input, clear projectiles, and play a 1.2 s death/fade sequence.
- Lose 15% of scrap earned during the current run, rounded down. Previously held scrap, XP, equipment, and items are safe.
- Respawn in the dungeon entrance at full HP.
- Cleared normal rooms remain cleared and floor loot remains.
- The current uncleared room resets to dormant and respawns its original encounter when re-entered.
- A boss death resets the boss to full HP and removes its summoned mobs.
- Give the player 1.0 s of invulnerability after respawning.
- Never spawn an attack outside the camera view, within 6 units of the entrance used by the player, or before the 0.6 s room-start delay.
- Boss thresholds, melee arcs, dash lanes, and area attacks must be visible before damage occurs.

This retains consequences without deleting earned gear or forcing the player to replay every cleared room.

## Suggested module split under `src/`

Keep `Game` as the owner of the render loop, renderer, camera, player model, and top-level input. Add a small subsystem rather than rewriting the architecture.

```text
src/
  game.ts                    Existing orchestration; forwards enter/update/input events.
  sewer.ts                   Keep the surface hatch and shared sewer coordinates.
  dungeon/
    dungeonTypes.ts          Interfaces, enums, stat/item types.
    dungeonConfig.ts         All numeric mob, item, room, and progression data.
    dungeonGenerator.ts      Seeded graph generation and validation; no Three.js meshes.
    dungeonRooms.ts          Five room builders, doors, props, colliders, spawn points.
    dungeonCombat.ts         Mob state machines, attacks, projectiles, damage, boss.
    dungeonInventory.ts      Inventory/equipment, derived stats, loot rolls, XP/scrap.
    dungeonHud.ts            DOM HUD, inventory panel, boss bar, labels, damage numbers.
    DungeonSystem.ts         Run lifecycle facade and room/encounter coordination.
```

Minimal `Game` integration:

1. Construct one `DungeonSystem` with `scene`, `player`, raycaster/camera references, and callbacks for player muzzle position and visual effects.
2. Replace `buildSewerTunnel()` in the enter flow with `dungeon.enter(seed, playerProgress)`.
3. In the animation loop, call `dungeon.update(dt, playerPosition, aimPoint)` only while `inSewer`.
4. Route dungeon key presses (`E`, `R`, `I`, `1-3`) and left-mouse fire to the subsystem.
5. Let the subsystem return room colliders or a `constrainPlayer(previousPosition, nextPosition)` result.
6. On exit, remove the dungeon root, projectiles, labels, and listeners, then use the existing surface restore flow.

For the one-day implementation, use primitive models with accent colors for each mob role, reuse one geometry/material set per type, pool projectiles and damage-number DOM nodes, and avoid per-frame object allocation where practical.

## Acceptance checklist

- Entering the hatch creates a different valid eight-room dungeon each run.
- All five room types appear and every graph edge has matching door sockets.
- The boss is reachable only after four guaranteed main-path encounters.
- Every normal mob and the boss use the exact telegraphs and stats above.
- HP, armor, damage, drops, inventory, consumables, XP, scrap, death, boss bar, and damage numbers work without leaving the sewer.
- No enemy spawns on the player, attacks before activation, leaves its room, or damages without a visible telegraph.
- The player can complete a level-1 run with the starter weapon and careful movement without requiring a lucky drop.
