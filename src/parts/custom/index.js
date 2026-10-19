// Registry of per-group precise part models. Each module exports { rules, axial, boxes, paths, whole }.
import engine from './engine.js';
import engineSupport from './engine-support.js';
import drivetrain from './drivetrain.js';
import chassis from './chassis.js';
import brakes from './brakes.js';
import electrical from './electrical.js';
import safety from './safety.js';

export const CUSTOM = [engine, engineSupport, drivetrain, chassis, brakes, electrical, safety];
