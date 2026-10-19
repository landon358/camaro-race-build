// One icon set (Lucide), one stroke weight, used everywhere.
import {
  createElement, BadgeCheck, Box, Boxes, Camera, Car, Check, ChevronDown, ChevronRight, Circle, CircleHelp,
  ClipboardCheck, Download, ExternalLink, Eye, EyeOff, Focus, Gauge, Hand, Info, Layers, ListChecks, MapPin,
  Menu, PackageCheck, Pause, Play, Printer, RotateCcw, Search, Settings2, ShoppingCart, SlidersHorizontal,
  TriangleAlert, Undo2, Upload, Workflow, Wrench, X, ZoomIn,
} from 'lucide';

const ICONS = {
  verified: BadgeCheck, part: Box, parts: Boxes, camera: Camera, car: Car, check: Check, down: ChevronDown,
  right: ChevronRight, circle: Circle, help: CircleHelp, inspect: ClipboardCheck, download: Download,
  external: ExternalLink, eye: Eye, eyeOff: EyeOff, focus: Focus, gauge: Gauge, hand: Hand, info: Info,
  layers: Layers, list: ListChecks, pin: MapPin, menu: Menu, installed: PackageCheck, pause: Pause, play: Play,
  print: Printer, reset: RotateCcw, search: Search, settings: Settings2, cart: ShoppingCart,
  sliders: SlidersHorizontal, warn: TriangleAlert, undo: Undo2, upload: Upload, schematic: Workflow,
  wrench: Wrench, close: X, zoom: ZoomIn,
};

/** SVG markup for an icon (decorative: aria-hidden). */
export function icon(name, size = 18) {
  const node = ICONS[name];
  if (!node) return '';
  const svg = createElement(node);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('stroke-width', '1.9');
  svg.classList.add('ico');
  return svg.outerHTML;
}

// Build status: glyph + word, never colour alone.
export const STATUS_ICON = { needed: 'circle', ordered: 'cart', inhand: 'hand', installed: 'installed' };
