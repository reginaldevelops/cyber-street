# Sewer Dungeon QA Review

Reviewed against `docs/dungeon-design.md`, with emphasis on `DungeonSystem.ts`, combat, rooms, generation, inventory, HUD, and the sewer integration in `game.ts`.

Verification snapshot:

- `npm run build` passes (TypeScript and Vite).
- Generation has reciprocal sockets, graph validation, four main rooms, a degree-one boss, bridges for each graph edge, and a deterministic fallback.
- Surface enemies are hidden and stop updating in the sewer (`game.ts:1175-1180`, `1578-1590`).
- Dungeon lights remain outside the hidden surface-light snapshot; every room has a hemisphere fill and local lamps (`dungeonRooms.ts:120-140`, `479-481`). Rooms should not be pitch black.
- The front fire arc, magazine consumption, manual reload, and empty-magazine auto-reload are wired.

Severity meaning: **blocker** prevents a normal run from being completed; **major** breaks or bypasses a core run rule; **minor** is a contained gameplay, feedback, or reproducibility defect.

## Blockers

No compile-time or deterministic completion blocker was found. The run can currently be bypassed via the exit button, but that is classified as a major progression defect rather than an inability to complete.

## Major

1. **Encounter doors are visual only; the player can walk through every locked door.** `dungeonRooms.ts:215-224` creates door slabs but does not add them to `BuiltRoom.colliders`; `DungeonSystem.ts:529-540` only toggles visibility, while movement checks only `this.colliders` (`335-379`). This defeats room locking and lets the player flee active encounters. Add slabs to the collision set and make `constrainPlayer` ignore them while hidden (otherwise hidden slabs would also block).

2. **The boss gate is never physically closed, and its warning is erased in the same frame.** All slabs start hidden (`dungeonRooms.ts:215-224`), and `buildWorld` never locks the boss's incoming socket. The count check at `DungeonSystem.ts:459-464` only declines activation after the player is already inside. Its prompt is then overwritten by `updateLootPrompt` at `330` / `607-629`. Lock both sides of the boss edge when building the run, unlock them when `clearedMainCount()` reaches four, and give gate/loot/ladder prompts one centralized priority order.

3. **The surface “Exit sewer” button bypasses the entire dungeon.** `game.ts:1191-1193` exposes the button immediately, and its handler calls `exitSewer()` without checking boss state (`228-232`). A player can abandon/reset any run before killing the boss, contrary to the ladder-only flow. Hide or disable this button during an active run, or route it through a `dungeon.canExit` check.

4. **The usable exit is not at the visible ladder.** The ladder mesh is at room-local `(-6.8, -7.65)` (`dungeonRooms.ts:243-255`), but the prompt and interaction use the entrance room center returned by `getSpawnPosition()` (`DungeonSystem.ts:120-124`, `620-640`). After victory, the visible ladder does nothing and an invisible exit exists near the center drain. Expose a world-space ladder interaction anchor from `BuiltRoom` and use it for prompt and interaction distance.

5. **Player shots pass through walls and room props.** `DungeonCombat.applyPlayerShot` raycasts only live enemy hit meshes (`dungeonCombat.ts:309-329`); no dungeon colliders are considered. Enemies can therefore be killed through sealed walls, locked doors, pumps, filter beds, and maze blocks. Raycast enemy hit meshes and blockers together and apply damage only when an enemy is the nearest legal hit; implement Flechette's one-enemy exception explicitly.

6. **Players can leave bridges and roam the empty plane around the dungeon.** Bridges are only floor meshes (`dungeonRooms.ts:508-529`) and `constrainPlayer` only rejects overlap with wall/prop AABBs (`DungeonSystem.ts:335-379`). Because movement has no gravity or floor-membership check, stepping sideways off a bridge gives unrestricted exterior access. Add bridge-side collision/rails or constrain positions to the union of room floors and bridge rectangles.

7. **Enemies ignore walls and room props during movement, and hostile projectiles ignore props.** Enemy movement is direct position addition plus a center-radius clamp (`dungeonCombat.ts:445-469`), so mobs can walk through pumps, filter beds, maze machinery, and even narrow room walls. Projectile blocking only recognizes specifically named wall/door meshes (`1065-1095`), not props. Supply room blockers to combat, resolve enemy movement against them, and include shot-blocking props in projectile segment tests.

8. **Dungeon movement stats and reload movement restrictions are not wired into `Game`.** `game.ts:1016-1019` always uses global `WALK_SPEED`/`SPRINT_SPEED`; it never reads `dungeon.weaponStats().walkSpeed/sprintSpeed`. It also allows sprinting while reload is active, despite `DungeonSystem` tracking reload at `207-212` / `308-313`. Expose reload/input state and use derived dungeon speeds while underground.

9. **Opening inventory does not actually pause player simulation.** `DungeonSystem.update` pauses combat at `293-297`, but `Game.updatePlayer` still moves, turns, and accepts sprint before that call (`game.ts:1001-1061`, `1573-1585`). A player can hold movement while operating the inventory and cross triggers/doors. Gate movement and firing on a dungeon `isPaused`/`acceptsInput` state, clear velocity/firing when opening, and resume only after close.

10. **Death does not stop movement input during the death sequence.** `DungeonSystem` sets only its private `dead` flag (`663-683`); `Game.updatePlayer` has no death-state check and runs before dungeon respawn (`game.ts:1573-1585`). The player can keep moving for 1.2 seconds while downed. Expose an input-enabled state, zero velocity on death, and suppress movement/fire until respawn completes.

11. **Most special weapon-part effects are calculated but never executed.** `deriveWeaponStats` exposes chain, sixth-shot electric damage, normal-enemy piercing, aim assist, and low-HP marking (`dungeonInventory.ts:146-220`), but `DungeonSystem.tryFire` uses only basic damage/range/spread/penetration/ray count (`DungeonSystem.ts:231-278`). Arc-Coil, Voltaic Feed, Flechette piercing, Glow-Sight/Threat-Painter aim assist, and Sump Oracle marking are therefore misleading loot. Add per-magazine shot state and explicit effect resolution in the shot pipeline.

12. **Boss victory becomes true before the boss room is cleared.** Killing the boss sets `bossCleared` immediately (`DungeonSystem.ts:549-565`), while `clearRoom` waits for every summoned add to die (`319-323`, `506-518`). This enables the entrance exit while adds remain; if the player dies in that window, respawn resets the boss room to dormant but does not clear `bossCleared` (`686-704`). Set victory only in `clearRoom` after the encounter is fully resolved, and reset it whenever an uncleared boss encounter resets.

13. **Repeated deaths can charge the same run scrap repeatedly and eventually consume protected pre-run scrap.** `runScrapEarned` only increases (`DungeonSystem.ts:551-552`) and death always subtracts 15% of that cumulative value from total scrap (`679-680`). It is never reduced after a loss. Track protected pre-run scrap separately, deduct once from the current run's remaining earnings, and update that run ledger after each loss.

14. **Med-Gel is instant and cannot be interrupted.** Although the item defines a 0.4-second use (`dungeonConfig.ts:581-597`), `useConsumable` heals and consumes immediately (`dungeonInventory.ts:352-378`). Damage therefore cannot cancel its use as designed. Add a pending-use timer in `DungeonSystem`, consume only on completion, and cancel without consumption from `hurtPlayer`.

15. **Repeated runs leak room, bridge, and loot GPU resources.** `DungeonSystem.exit` and `clearLoot` only detach objects (`153-169`, `600-605`); unlike combat cleanup, they never dispose geometries/materials. Every new run allocates another complete dungeon. Traverse and dispose owned room/bridge/loot resources on exit, taking care not to double-dispose shared materials.

## Minor

16. **Changing magazine equipment can leave impossible ammo values.** Inventory equip refreshes stats but never reconciles `ammo` (`DungeonSystem.ts:91-99`, `707-716`). Equipping Quickcell can show and fire `18 / 14`; equipping a drum does not grant or proportionally preserve capacity. Clamp current ammo to the new magazine (or define a consistent refill policy) after equipment swaps.

17. **Loot labels only appear inside pickup range, not label range.** `updateLootPrompt` initializes `bestD` to `pickupDistance` (1.8) at `DungeonSystem.ts:607-618`, so the later 3-unit `labelDistance` condition can never extend visibility. Search within `labelDistance`, then separately require `pickupDistance` for interaction.

18. **Scattershot hit feedback is indexed incorrectly after a miss.** `tryFire` appends every ray to `endPoints` but appends only hits to `results` (`DungeonSystem.ts:251-278`). `game.ts:1273-1286` assumes both arrays have matching indices, so a miss before a hit attaches feedback to the wrong ray and later hits may get no feedback. Return one aligned record per ray, with `hit: ShotResult | null`.

19. **The combat HUD omits reload state, weapon slots, consumable counts, and shared cooldowns.** The HUD markup only has ammo plus inventory equipment (`dungeonHud.ts:48-75`), and `refreshHud` supplies no reload/effect timing (`DungeonSystem.ts:707-718`). Add the designed bottom-center weapon/consumable strip and reload progress so players can make informed combat decisions.

20. **The reproducible seed is only shown briefly and truncated.** Entry displays `seed % 100000` for 2.2 seconds (`DungeonSystem.ts:148`); the inventory/pause panel never shows the full generated seed. Display `generated.seed` persistently in the HUD or inventory.

21. **Starter control feedback is incomplete.** The dungeon hint lists the main actions but omits Shift sprint, Tab as an inventory key, and Esc behavior (`game.ts:1195-1197`). Include all starter controls, preferably with a short first-run “clear rooms to unlock boss / return to ladder” objective.

22. **Esc is swallowed even when inventory is already closed.** In sewer mode it always calls `closeInventory()` and returns (`game.ts:929-932`), so the specified fallback pause behavior cannot occur. Check `isInventoryOpen()` first; otherwise route Esc to the game's pause flow.

