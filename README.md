# Cyber Street

Browser-based cyberpunk third-person shooter prototype. One neon street, WASD movement, mouse aim, hitscan shooting.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5180 — click to capture the mouse.

## Controls

| Input | Action |
| --- | --- |
| **W A S D** | Move (relative to aim direction) |
| **Shift** | Sprint |
| **Mouse** | Aim (yaw + pitch, pointer lock) |
| **Left click** | Shoot (hold for auto fire) |

## Stack

- TypeScript
- Vite
- Three.js (+ UnrealBloom postprocessing)

## Project layout

```
src/game.ts   — scene, player, enemies, input, camera, combat, atmosphere
src/main.ts   — entry point
```

## Roadmap

- [x] One street + third-person movement
- [x] Mouse aim (pointer lock)
- [x] Smooth movement (acceleration, lean, walk cycle, sprint FOV kick)
- [x] GTA3-style follow camera with collision + damping
- [x] Shooting (hitscan with aim assist, tracers, muzzle flash, sparks)
- [x] NPC enemies (chase, hit flash, death + respawn)
- [ ] Enemy attacks / player health
- [ ] Sound design
- [ ] Multiplayer server

## License

MIT
