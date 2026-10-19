# Camaro Race Build — 3D parts guide

**Live app:** https://landon358.github.io/camaro-race-build/

Interactive 3D build guide for a 6th-gen (2016–2024) Camaro road-race car built from a bare chassis.
Every system → subsystem → component → fastener, placed on the car, with torque specs, factory vs race
options, install steps, schematics and a build tracker.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — rebuilds the parts database when data files change
npm run build      # static site in dist/ (open with any static web server, e.g. `npx vite preview`)
```

The live site is served by GitHub Pages from `docs/`. To publish changes, rebuild and copy the build there:

```bash
npm run build && rm -rf docs && cp -R dist docs && touch docs/.nojekyll
```

## Where things live

| Path | What |
|---|---|
| `data/systems/<system>/_system.json` | System overview, build notes, schematics, 3D line routes |
| `data/systems/<system>/<subsystem>.json` | Components with hardware, options, install notes, 3D model |
| `data/SCHEMA.md` | Data format, build phases and the car coordinate system (meters, x rearward from front axle, y up, z left) |
| `data/aliases.json` | Fixes for cross-system links that point at a slightly different id |
| `scripts/build-data.mjs` | Merges data into `public/data/db.json` and prints a validation report |
| `public/models/camaro.glb` | Reference body (from the ZL1 1LE OBJ), aligned to car coordinates, meshopt-compressed |
| `public/models/body-parts.glb` | Real body panels (hood, doors, fascias, glass, lamps…) cut from the reference body, used as those components' 3D parts |
| `data/body-envelope.json` | Body shape measured from the reference mesh (top/side/bottom surfaces) |
| `scripts/fit-check.mjs` | Lists parts that poke outside the body |
| `scripts/fit-fix.mjs` | Shapes the splitter/air dam to the nose, sets the wing height, pulls stray parts inside the body |
| `src/parts/` | Realistic part generators (wheels, tires, rotors, calipers, springs, dampers, V8 block, heads, blower, gearbox, diff, coolers, pumps, filters, seat, pedals, AN lines, hoses, harnesses…) and the rules that map each component to one |
| `src/` | App (Three.js viewer, UI panels, schematics renderer) |

## Editing parts

Edit any JSON file in `data/systems/`. With `npm run dev` running, the database rebuilds and the page
reloads automatically. Run `npm run data` to see the validation report (duplicate ids, broken links,
parts without a 3D model).

## Torque data

Every fastener is tagged **verified** (GM service info or the part maker's instructions, with source),
**typical** (consistent across reputable published tables) or **estimate**. Always confirm against the
service manual or the instructions for the exact part you install.

## Your progress

Build status, chosen options and notes are saved in the browser (localStorage). Use
**Build tracker → Back up** to save a JSON file, and **Restore** to load it on another device.
