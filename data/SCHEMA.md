# Gen 6 Camaro Road-Race Build — Parts Database Schema

The app is a 3D interactive build guide for a **2016–2024 (6th generation, GM Alpha platform) Chevrolet Camaro**
being built **from a bare chassis (bare unibody shell)** into a **road-race car** with a **custom racing engine**
(GM Gen V small-block "LT" architecture as the factory baseline: LT1 6.2L in SS, LT4 6.2L supercharged in ZL1; race
alternatives such as dry-sump, forged rotating assembly, race heads, etc.). Every component is either the
**GM factory part** or a **high-performance / racing alternative**. Record BOTH where applicable.

The reference body mesh in the app is a **Camaro ZL1 1LE**, so ZL1 / ZL1 1LE factory parts are the preferred "factory" baseline
when they differ from SS/LT parts (note the SS/1LE variant when relevant).

## Output files

Each research agent owns ONE system folder: `data/systems/<systemId>/`

- `_system.json` — system metadata, schematics, routes (see below)
- `<subsystemId>.json` — ONE file per subsystem, containing a single Subsystem object (keeps files small; write many files)

All files must be **strict valid JSON** (no comments, no trailing commas). Validate every file with:
`node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`

## IDs

- lowercase kebab-case, dot-separated hierarchy: `brakes`, `brakes.front-calipers`, `brakes.front-calipers.caliper`
- Component ids MUST start with their subsystem id. They must be globally unique.
- `connectsTo` may reference ids in other systems (use your best guess of the other system's id using the system ids
  listed below + a sensible subsystem/component name; the app tolerates dangling refs but good guesses are valuable).

System ids (fixed): `engine`, `engine-support`, `drivetrain`, `chassis`, `suspension`, `steering`, `brakes`,
`wheels`, `electrical`, `safety`, `interior`, `body`, `aero`.

## `_system.json`

```json
{
  "id": "brakes",
  "name": "Brakes",
  "summary": "2–4 sentence overview of the system on this car, factory vs race approach.",
  "overview": "Longer markdown-ish text (paragraphs separated by \\n\\n): how it works, key design decisions for a road-race build, rules considerations (NASA/SCCA/ Trans Am / FIA where relevant), common failure points.",
  "buildNotes": ["ordered high level tips for building this system from bare chassis"],
  "schematics": [
    {
      "id": "brakes.hydraulic",
      "title": "Brake hydraulic circuit",
      "type": "hydraulic",
      "description": "what the diagram shows",
      "nodes": [ { "id": "mc-front", "label": "Front master cylinder", "componentId": "brakes.pedal-box.master-cylinder-front" } ],
      "edges": [ { "from": "mc-front", "to": "abs", "label": "-3 AN hard line", "kind": "brake-fluid" } ]
    }
  ],
  "routes": [
    {
      "id": "brakes.route.lf-line",
      "name": "LF brake line",
      "kind": "brake-fluid",
      "componentId": "brakes.lines.front-hard-line",
      "radius": 0.004,
      "points": [[0.55,0.55,0.35],[0.3,0.45,0.6],[0.0,0.40,0.70]]
    }
  ],
  "sources": [ { "title": "...", "url": "https://..." } ]
}
```

`kind` vocabulary (edges and routes): `oil`, `coolant`, `fuel`, `fuel-vapor`, `air`, `boost`, `exhaust`, `brake-fluid`,
`clutch-fluid`, `power`, `ground`, `signal`, `can`, `ethernet`, `mechanical`, `torque`, `vacuum`, `fire-suppressant`, `water`.

`type` vocabulary (schematics): `flow`, `hydraulic`, `wiring`, `mechanical`, `block`.

Schematics are the "schematic" view of the system — make them genuinely informative (e.g. full dry-sump oil path with
every stage of the pump, filter, cooler, tank, breather; full fuel path tank→lift pumps→surge→pressure pumps→filter→rails→regulator→return;
wiring: battery→cutoff→PDM channels→loads; CAN bus topology). 10–40 nodes per schematic is typical. Multiple schematics per system welcome.

Routes are 3D polylines (in car coordinates, below) for lines/hoses/harness trunks/exhaust pipes/cage tubes so the app
can draw them in 3D. Use enough points to follow a plausible path around major components (5–20 points).

## Subsystem file `<subsystemId>.json`

```json
{
  "id": "brakes.front-calipers",
  "system": "brakes",
  "name": "Front Calipers",
  "description": "1–3 sentences.",
  "components": [ Component, ... ]
}
```

## Component

```json
{
  "id": "brakes.front-calipers.caliper",
  "name": "Front brake caliper",
  "qty": 2,
  "description": "What it is and what it does (2–4 sentences, practical, written for someone building the car).",
  "location": "Where it is on the car and what it mounts to.",
  "connectsTo": ["suspension.front-knuckle.knuckle", "brakes.lines.front-flex-line"],
  "factory": {
    "name": "Brembo 6-piston monobloc (ZL1)",
    "partNumber": "GM 84xxxxxx",          // ONLY if you found it in a source; otherwise omit or ""
    "notes": "material, weight, spec details"
  },
  "raceOptions": [
    { "name": "AP Racing CP9668 6-piston", "brand": "AP Racing", "partNumber": "CP9668-...", "notes": "why/when", "url": "https://..." }
  ],
  "specs": { "Pistons": "6 (38/34/30 mm)", "Material": "Aluminum monobloc" },
  "hardware": [ Hardware, ... ],
  "fluids": [ { "name": "DOT 4 racing brake fluid", "spec": "Castrol SRF / Motul RBF660", "capacity": "~1 L system" } ],
  "installNotes": ["Step-by-step or key tips, in order."],
  "inspection": ["What to check between race weekends"],
  "buildPhase": 3,
  "installOrder": 10,
  "tags": ["brembo", "6-piston"],
  "sources": [ { "title": "...", "url": "https://..." } ],
  "model": Model | [Model, ...]
}
```

Include the components a builder actually handles: major parts AND the small stuff (brackets, clips, seals, gaskets, O-rings,
sensors, lines, fittings, grommets, straps, heat shields, dowels, spacers, shims). "Every bolt and nut" goes in `hardware`.

### Hardware (fasteners & small hardware attached to a component)

```json
{
  "item": "Caliper-to-knuckle mounting bolt",
  "qty": 2,                                  // per ONE component instance (say "per side" etc. in notes if ambiguous)
  "spec": "M14 x 1.5 x 45 mm flange-head bolt",
  "grade": "10.9",
  "partNumber": "GM 11570xxx",               // only if found
  "torque": "148 ft-lb (200 N·m)",           // include both units when possible; "N/A" for clips etc.
  "torqueSequence": "",                      // e.g. "15 ft-lb, then +80°, then +53°" or pattern notes
  "threadlocker": "Blue (Loctite 243)",      // or "none", "red 271", "anti-seize", "thread sealant", "oil threads"
  "safetyWire": false,
  "reuse": "Replace (TTY)" ,                 // or "Reusable", "Replace each removal", "Inspect"
  "tool": "15 mm 12-point socket",           // optional
  "notes": "",
  "confidence": "verified",                  // verified = found in GM service info or manufacturer instructions with a source;
                                             // typical = commonly published value for this application;
                                             // estimate = engineering estimate — MUST be labeled so
  "source": "https://..."
}
```

**Accuracy matters — a builder will torque real bolts with this.** Never invent a part number. Label every torque with
`confidence`. Prefer GM service manual values (Gen 6 Camaro / Alpha platform / Gen V LT engine) and manufacturer install
instructions (ARP, Brembo, AP Racing, Tremec, etc.). If unknown, give the typical value for that fastener size/grade and mark `estimate`.

### Build phases (`buildPhase`, integer)

1. Chassis prep (strip, seam weld, cage, mounts, paint)
2. Fuel cell & hard lines (fuel, brake, plumbing runs through chassis)
3. Suspension, subframes & steering
4. Brakes, hubs, wheels
5. Engine assembly (on stand)
6. Engine & drivetrain installation
7. Engine support systems (cooling, oiling, exhaust, intake, fuel delivery to engine)
8. Electrical, harness & electronics
9. Safety & interior (seat, belts, fire system, nets, controls)
10. Body & aero
11. Fluids, startup, setup (alignment, corner weights, shakedown)

`installOrder` = order within the system (1..n).

## 3D placement (`model`) — car coordinate system (METERS)

Three.js style, Y up:
- **x** = longitudinal. `x = 0` at FRONT axle centerline, **positive toward the REAR**. Rear axle at `x = 2.811` (110.7 in wheelbase).
- **y** = up. `y = 0` is the ground.
- **z** = lateral. `z = 0` is car centerline, **positive = LEFT / driver side** (US LHD), negative = right/passenger.

Landmarks (from the reference ZL1 1LE mesh, approx, race ride height):

| Landmark | value |
|---|---|
| Front bumper face | x = -0.98 |
| Rear bumper face | x = 3.84 |
| Front axle / rear axle | x = 0 / x = 2.811 |
| Wheel centers | y = 0.37, z = ±0.78 (track ≈ 1.55–1.60 m) |
| Tire | diameter ≈ 0.70–0.74, width ≈ 0.31–0.34 |
| Body half-width (excl. mirrors) | ≈ 0.95 |
| Roof top | y ≈ 1.36–1.38, roof spans x ≈ 1.2–2.6 |
| Rocker panel bottom | y ≈ 0.14 ; floor pan underside y ≈ 0.15–0.18 |
| Hood | x ≈ -0.76 … 0.58, hood top y ≈ 0.95–1.0 at cowl |
| Cowl / firewall (upper) | x ≈ 0.60–0.70 ; windshield base x ≈ 0.65, top at x ≈ 1.25 |
| Radiator / heat exchanger stack | x ≈ -0.70 … -0.62, y ≈ 0.25–0.70 |
| Engine (Gen V LT) | block front face x ≈ -0.30, bellhousing face x ≈ 0.38, crank centerline y ≈ 0.40, z = 0; front-mid-engine, mostly behind front axle; intake top y ≈ 0.85 (ZL1 supercharger lid ≈ 0.92) |
| Transmission | x ≈ 0.38 … 1.25 (manual TR-6060), output/tailshaft ≈ x 1.25, y ≈ 0.36 |
| Driveshaft | x ≈ 1.25 … 2.60, y ≈ 0.35 |
| Rear differential center | x ≈ 2.80, y ≈ 0.36, z = 0 |
| Driver seat H-point | x ≈ 1.75, y ≈ 0.33, z = +0.37 ; steering wheel center x ≈ 1.25, y ≈ 0.80, z = +0.37 |
| Pedals | x ≈ 0.85–0.95, y ≈ 0.25–0.45, z ≈ +0.30–0.45 |
| B-pillar | x ≈ 2.15 ; A-pillar base x ≈ 0.70 |
| Trunk floor | x ≈ 3.0 … 3.7, y ≈ 0.40 |
| Front strut tower top | x ≈ 0.05, y ≈ 0.85, z = ±0.55 |
| Rear shock top | x ≈ 2.75, y ≈ 0.70, z = ±0.58 |

### Model object

```json
{ "shape": "box", "pos": [x,y,z], "size": [lx, ly, lz] }
{ "shape": "cylinder", "pos": [x,y,z], "size": [lx,ly,lz], "axis": "x" }    // cylinder fits the size box; axis = length direction
{ "shape": "sphere", "pos": [...], "size": [...] }
{ "shape": "cone", "pos": [...], "size": [...], "axis": "y" }
{ "shape": "torus", "pos": [...], "size": [...], "axis": "z" }               // e.g. tire, O-ring, seal; axis = through-hole direction
{ "shape": "disc", "pos": [...], "size": [...], "axis": "z" }                // rotor/flywheel/pulley: cylinder with a hole
{ "shape": "tube", "path": [[x,y,z],...], "radius": 0.02 }                  // pipes, hoses, lines, cage tubes, links, shafts
```

Optional on any model: `"rot": [rxDeg, ryDeg, rzDeg]`, `"mirror": true` (also draw a copy mirrored to -z for L/R pairs;
give the LEFT (+z) one), `"instances": [[x,y,z], ...]` (draw the same shape at each position; overrides pos),
`"color": "#hex"` (optional override). A component's `model` may be an ARRAY of model objects to build a rough
compound shape (e.g. a seat = shell box + back box). Keep it to ≤ 8 primitives per component. Small hardware-ish components
(sensors, clips) can be tiny boxes/cylinders at the right spot. Sizes must be realistic (meters).
If truly no sensible placement exists (e.g. a fluid), omit `model`.
