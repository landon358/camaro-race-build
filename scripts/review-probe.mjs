// Measure the car: casts rays through the review server (scripts/review-server.mjs).
//   node scripts/review-probe.mjs --rays '[{"o":[-2,0.3,0.5],"d":[1,0,0]}]' [--what body|all|id1,id2]
//   Shortcuts: --from front|rear|left|right|above|below --at 'a,b' (the two other coordinates) — e.g.
//   --from below --at '0.5,0.3' probes straight up at x=0.5, z=0.3; --from front --at '0.3,0.5' probes along +x at y=0.3, z=0.5.
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
let rays = arg('rays') ? JSON.parse(arg('rays')) : [];
const from = arg('from');
if (from) {
  const pts = arg('at').split(';').map((s) => s.split(',').map(Number));
  const F = { front: [[-5, 1, 2], [1, 0, 0]], rear: [[9, 1, 2], [-1, 0, 0]], left: [[1, 2, 5], [0, 0, -1]], right: [[1, 2, -5], [0, 0, 1]], above: [[1, 5, 2], [0, -1, 0]], below: [[1, -5, 2], [0, 1, 0]] }[from];
  rays = pts.map(([a, b]) => {
    const o = [...F[0]];
    if (from === 'front' || from === 'rear') { o[1] = a; o[2] = b; }
    else if (from === 'left' || from === 'right') { o[0] = a; o[1] = b; }
    else { o[0] = a; o[2] = b; }
    return { o, d: F[1] };
  });
}
const w = arg('what', 'body');
const what = w === 'body' || w === 'all' ? w : w.split(',');
const res = await fetch(`http://127.0.0.1:${arg('port', 5191)}/probe`, { method: 'POST', body: JSON.stringify({ rays, what }) });
const out = await res.json();
if (out.error) { console.error(out.error); process.exit(1); }
rays.forEach((r, i) => console.log(JSON.stringify(r.o), '->', out.hits[i] ? `${JSON.stringify(out.hits[i].p)} ${out.hits[i].id}` : 'no hit'));
