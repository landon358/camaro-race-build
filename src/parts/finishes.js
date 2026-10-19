// Realistic surface finishes for generated parts ("Real colors" mode).
import * as THREE from 'three';

function stripeTexture(a, b, n = 64, w = 4) {
  const c = document.createElement('canvas');
  c.width = n; c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < n; x++) {
    g.fillStyle = x % w < w / 2 ? a : b;
    g.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function braidTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#7d838c';
  g.fillRect(0, 0, 32, 32);
  g.strokeStyle = '#c9cdd3';
  g.lineWidth = 2;
  for (let i = -32; i < 64; i += 6) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 32); g.stroke();
    g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i, 32); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// name -> material params
const DEF = {
  cast: { color: '#a3a7ad', metalness: 0.55, roughness: 0.6 },
  machined: { color: '#cfd3d8', metalness: 0.9, roughness: 0.25 },
  aluminum: { color: '#b9bec5', metalness: 0.75, roughness: 0.38 },
  steel: { color: '#5c6067', metalness: 0.75, roughness: 0.42 },
  stainless: { color: '#b4b8be', metalness: 0.9, roughness: 0.3 },
  chrome: { color: '#e4e7ec', metalness: 1, roughness: 0.12 },
  iron: { color: '#6a6d71', metalness: 0.8, roughness: 0.55 },
  black: { color: '#1c1d20', metalness: 0.35, roughness: 0.55 },
  satin: { color: '#2b2d31', metalness: 0.55, roughness: 0.38 },
  crinkle: { color: '#151517', metalness: 0.2, roughness: 0.85 },
  plastic: { color: '#232427', metalness: 0.05, roughness: 0.6 },
  rubber: { color: '#121214', metalness: 0, roughness: 0.92 },
  carbon: { color: '#1e2024', metalness: 0.45, roughness: 0.28 },
  red: { color: '#c3161c', metalness: 0.35, roughness: 0.32 },
  blue: { color: '#2456c8', metalness: 0.7, roughness: 0.3 },
  gold: { color: '#c9a24a', metalness: 0.9, roughness: 0.3 },
  copper: { color: '#b8733a', metalness: 0.9, roughness: 0.35 },
  spring: { color: '#d0281f', metalness: 0.45, roughness: 0.35 },
  wheel: { color: '#2d3035', metalness: 0.85, roughness: 0.28 },
  cage: { color: '#d8d9d6', metalness: 0.25, roughness: 0.45 },
  chassis: { color: '#c7c9cc', metalness: 0.2, roughness: 0.6 },
  paint: { color: '#8a1712', metalness: 0.6, roughness: 0.32 },
  seat: { color: '#18181a', metalness: 0.05, roughness: 0.9 },
  webbing: { color: '#2346a8', metalness: 0, roughness: 0.85 },
  yellow: { color: '#e8b400', metalness: 0.1, roughness: 0.5 },
  orange: { color: '#e8641a', metalness: 0.1, roughness: 0.5 },
  wire: { color: '#b01818', metalness: 0.1, roughness: 0.6 },
  harness: { color: '#141416', metalness: 0.05, roughness: 0.75 },
  header: { color: '#8e8f93', metalness: 0.6, roughness: 0.5 },
  heatwrap: { color: '#a8936a', metalness: 0.1, roughness: 0.95 },
  screen: { color: '#0b1220', metalness: 0.2, roughness: 0.2, emissive: '#1a3a6a', emissiveIntensity: 0.6 },
  lens: { color: '#ff3020', metalness: 0.1, roughness: 0.2, emissive: '#aa1008', emissiveIntensity: 0.6 },
  glass: { color: '#6c8aa6', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35 },
  net: { color: '#1b1b1d', metalness: 0, roughness: 0.9, transparent: true, opacity: 0.85 },
};

const cache = new Map();
let coreTex, braid;

export function finishMaterial(name, opacity) {
  const key = `${name}|${opacity || 1}`;
  if (cache.has(key)) return cache.get(key);
  let p = DEF[name];
  let map = null;
  if (name === 'core') {
    p = { color: '#9aa0a8', metalness: 0.6, roughness: 0.5 };
    coreTex ||= stripeTexture('#5b6068', '#c3c8ce', 64, 2);
    map = coreTex;
  } else if (name === 'braided') {
    p = { color: '#ffffff', metalness: 0.8, roughness: 0.4 };
    braid ||= braidTexture();
    map = braid;
  }
  p ||= DEF.steel;
  const mat = new THREE.MeshStandardMaterial({
    color: p.color,
    metalness: p.metalness,
    roughness: p.roughness,
    map,
    emissive: p.emissive || '#000000',
    emissiveIntensity: p.emissiveIntensity ?? 1,
    side: THREE.DoubleSide,
  });
  const op = Math.min(opacity || 1, p.opacity || 1);
  if (p.transparent || op < 1) {
    mat.transparent = true;
    mat.opacity = op;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;
  }
  cache.set(key, mat);
  return mat;
}
