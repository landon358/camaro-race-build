# Precise 3D part modeling guide

Goal: every physical part in the app should look like the real Gen 6 (2016–2024) Camaro part — or the race
part the build uses — with the **right shape, real dimensions and the right location**, so the builder can hold
a part in the shop and recognise it on screen.

Read `data/SCHEMA.md` first (car coordinates: meters, x rearward from the front axle, y up, z = left/driver side).

## What you own

- `src/parts/custom/<group>.js` — your generators and rules (one file per group; nobody else edits it).
- The `model` (and new `modelRef`) fields of components in your systems' JSON files under `data/systems/<system>/`.
  Do NOT change other fields (hardware, torque, text…). Use a small Node/Python script to edit JSON; keep it valid.

## How a part is drawn

Each component has `model`: one or more primitives (`box`, `cylinder`, `disc`, `torus`, `cone`, `sphere`, `tube`
with `path`, `plate` with `outline`, `wall` with `edge`) giving placement and an overall size box. A **rule**
maps a component id to a **generator**, which draws a detailed shape that fits that box.

Rules in your file are checked before the built-in ones (`src/parts/index.js` → `BASE_RULES`):

```js
rules: [
  [/^brakes\.front-calipers\.caliper$/, 'brakes_frontCaliper', { prim: true, usesPos: true }],
],
```

Options: `prim` (only the first primitive of the component), `shapes: ['cylinder']` (only these primitive shapes),
`variant` (passed to the generator), `axis: 'x'|'y'|'z'` (force the length axis for axial generators),
`usesPos` (generator output depends on world position — e.g. relative to the wheel centre; disables sharing),
`perPart` (cache per component), `whole: true` (one generator for the whole component, built from the union box
of all its primitives — use for seats, pedal boxes, assemblies).

### Generator kinds (name them `<group>_<name>`, e.g. `brakes_frontRotor`)

| kind | signature | frame |
|---|---|---|
| `axial` | `(L, D1, D2, ctx)` | canonical: **length along +X**, cross-section D1 on Y, D2 on Z, centred at origin. The primitive's `axis` (or the box's longest side) is rotated onto X for you. For discs/tori the length is the thickness along the hole axis. |
| `boxes` | `(sx, sy, sz, ctx)` | **world-aligned** box centred at origin (x rearward, y up, z left). Use for non-round parts with a fixed orientation (engine block, gearbox, ECU…). |
| `paths` | `(points: Vector3[], radius, ctx)` | **world coordinates** along the polyline (lines, hoses, links, shafts, cage tubes). |
| `whole` | `(min: Vector3, max: Vector3, ctx)` | box relative to the component centre (`ctx.center`). |

`ctx` contains `comp`, `m` (the primitive), `pos` (world centre, left-side copy for mirrored parts), `side`
(+1 left / −1 right), `variant`, `wheelOffset` ({x, y} from the part to the nearest wheel centre, in its local
frame — use it for calipers, brackets, ducts that wrap the wheel), `axis`.

Mirrored copies (`mirror: true`) are drawn by reflecting your output in z — build the LEFT (+z) part only.

Return `new PartBuilder()...build()`. `PartBuilder.add(geometry, finish, position, rotationEuler, scale)` merges
everything per finish into one mesh. Helpers in `src/parts/geo.js`: `cylX/cylY/cylZ(r, len, seg, r2)`,
`hexX(r, len)`, `box(sx, sy, sz, radius)`, `sphere(r)`, `torusX(R, t)`, `latheX([[radius, x], ...])` (profiles
revolved around X — the most useful tool for round parts), `ringX(ro, ri, t)`, `extrudeX(shape, t)` (2D
`THREE.Shape` in the YZ plane extruded along X — great for brackets, flanges, caliper bodies),
`Helix`, `curveFrom(points)`, `tubeAlong(curve, r)`, `ribbonAlong(curve, w, t)`, `alignX(a, b, scale)`
(matrix for a unit-X object from a to b, use with `addMatrix`), `V(x, y, z)`. Built-in generators you can reuse or
learn from: `src/parts/generators.js`.

Finishes (realistic materials): `cast` (cast aluminium), `machined`, `aluminum`, `steel`, `stainless`, `chrome`,
`iron` (rotors), `black`, `satin` (black anodised), `crinkle` (wrinkle paint), `plastic`, `rubber`, `carbon`,
`red`, `blue`, `gold`, `copper`, `spring`, `wheel`, `cage`, `chassis`, `paint`, `seat`, `webbing`, `yellow`,
`orange`, `wire`, `harness`, `header`, `heatwrap`, `screen`, `lens`, `glass`, `net`, `core` (radiator fins),
`braided` (stainless braid). Use the finish the real part has (e.g. ZL1 Brembo calipers are red, LT4 blower lid
is black, TR-6060 case is cast aluminium).

## Reference research — required for every physical part

1. Search for real images and dimensions of THE CAMARO PART (Gen 6 / Alpha platform / LT1/LT4 / ZL1 1LE, or the
   specific race part the component's data names). Good sources: GM parts catalogs (gmpartsdirect, gmpartsgiant,
   gmpartsonline — they show part photos and exploded diagrams), Chevrolet Performance, Summit/Jegs product pages
   with dimension specs, manufacturer pages and PDF drawings (Brembo, AP Racing, Tremec, Holley, Peterson, Fuel
   Safe, MoTeC, Sparco…), camaro6.com build threads with photos.
   Use WebSearch (load it with ToolSearch if needed) and WebFetch. WebFetch on a product page or image URL lets you
   read descriptions/specs; use image search results' titles/alt text and page text to confirm what the part looks
   like. Do NOT download files to disk.
2. Write down the real dimensions (overall L x W x H, diameters, bolt patterns, port positions) and the key
   recognisable features (fins, bosses, ports, ribs, logos areas, connector positions, colour).
3. Record it on the component:
   ```json
   "modelRef": {
     "images": [{ "title": "GM 84228580 front caliper (gmpartsdirect)", "url": "https://..." }],
     "dimensions": "390 x 34 mm rotor; caliper ~ 300 x 130 x 110 mm",
     "features": "6-piston monobloc, red, Brembo logo outboard, 2 bridge bolts, bleeder top",
     "confidence": "measured|published|estimated"
   }
   ```
   The app shows these links next to the part so the builder can compare.

## Modeling

- Fix `model` placement/size first so the box is the real size at the real location (check it against
  `data/body-envelope.json` / the landmarks; parts must not float or poke through the body).
- Then write a generator that reproduces the real silhouette and features at that size: e.g. the Gen V small block is a 90° V8: deep-skirt block, 4.4" bore spacing, cam-in-block, DI pump on
  the valley cover rear; a TR-6060 has a tapered bellhousing integral front case, ribbed main case, long tail
  housing with shifter tower; a Brembo 6-piston has a monobloc body with curved bridge, etc.
- Detail budget: big parts ≤ 15k triangles, medium ≤ 4k, small (bolts, sensors, clips) ≤ 600. Prefer `latheX` and
  `extrudeX` over many boxes. Merge via PartBuilder (one mesh per finish).
- Keep parts that are the same physical item in different places as `instances` / `mirror` (not new components).

## Checking your work

```bash
npm run data                                # rebuild public/data/db.json from the JSON files
node scripts/check-parts.mjs --system brakes   # builds every part headlessly; flags errors, NaN, oversize, heavy
node scripts/check-parts.mjs --id brakes.front-calipers.caliper --verbose
node scripts/fit-check.mjs                  # parts poking outside the body
```

Fix every ERROR. Oversize warnings are acceptable only when a part's `rot` explains it. Make sure
`node -e "import('./src/parts/index.js')"` still loads (syntax errors break the whole app).
