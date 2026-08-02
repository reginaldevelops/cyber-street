# Cyber Street

Isometric cyberpunk city you can walk — plaza hub, SimCity-style streets, landmarks, and a sewer dungeon.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5180 — click **PLAY** to enter the city.

## Controls

| Input | Action |
| --- | --- |
| **W A S D** | Move |
| **Shift** | Sprint |
| **Mouse** | Aim |
| **Left click** | Shoot |
| **R** | Reload (dungeon) |
| **E** | Loot / sewer exit |
| **I** / **Tab** | Inventory |
| **1–3** | Consumables |

## What's in the city

- Plaza hub with Tesla-style diner, fountain, metro pavilion, construction site
- Surrounding street grid: shops, civic buildings (politie, brandweer, ziekenhuis), markets, fietsenstalling
- Sewer hatch → seeded random dungeon (rooms, mobs, boss, loot)

## Stack

- TypeScript · Vite · Three.js

## Project layout

```
src/game.ts           — scene, player, input, camera, combat
src/cityGrid.ts       — SimCity-style street grid
src/cityBuildings.ts  — lot / building kit
src/plaza*.ts         — diner, fountain, subway, street ring
src/dungeon/          — sewer dungeon RPG
```

## Credits

- Parked Ferrari GLB from [duolahypercho/earth-online](https://github.com/duolahypercho/earth-online/blob/main/public/assets/ferrari.glb)

## License

MIT
