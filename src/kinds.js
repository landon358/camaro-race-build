// Colors for line / flow kinds used by 3D routes and schematic edges.
export const KINDS = {
  oil: { color: '#e0a526', label: 'Oil' },
  coolant: { color: '#2fd4b4', label: 'Coolant' },
  fuel: { color: '#f2e64a', label: 'Fuel' },
  'fuel-vapor': { color: '#b8b06a', label: 'Fuel vapor / vent' },
  air: { color: '#8fd3ff', label: 'Intake air' },
  boost: { color: '#4d9dff', label: 'Boost' },
  exhaust: { color: '#c46a3a', label: 'Exhaust' },
  'brake-fluid': { color: '#ff5b5b', label: 'Brake fluid' },
  'clutch-fluid': { color: '#ff8fb1', label: 'Clutch fluid' },
  power: { color: '#ff3b30', label: 'Power (+12V)' },
  ground: { color: '#9aa3b2', label: 'Ground' },
  signal: { color: '#b48cff', label: 'Signal' },
  can: { color: '#d36bff', label: 'CAN bus' },
  ethernet: { color: '#6bffb8', label: 'Ethernet' },
  mechanical: { color: '#c7ccd6', label: 'Mechanical' },
  torque: { color: '#e055c8', label: 'Torque path' },
  vacuum: { color: '#7a8ca8', label: 'Vacuum / crankcase' },
  'fire-suppressant': { color: '#ff2d55', label: 'Fire suppressant' },
  water: { color: '#4fc3f7', label: 'Water' },
};

export const kindColor = (k) => (KINDS[k] || KINDS.mechanical).color;
