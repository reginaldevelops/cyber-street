# Cyber Street

Browser-based cyberpunk third-person shooter prototype. One neon street, WASD movement, mouse aim.

Lives in this repo under `cyber-street/` for now (easy to split later).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5180 — click to capture the mouse, then **WASD** to move and **mouse** to aim.

## Stack

- TypeScript
- Vite
- Three.js

## Project layout

```
src/game.ts   — scene, player, input, camera
src/main.ts   — entry point
```

## Roadmap

- [x] One street + third-person movement
- [x] Mouse aim (pointer lock)
- [ ] Shooting (hitscan)
- [ ] NPC enemies
- [ ] Multiplayer server

## License

MIT
