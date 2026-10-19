// Torque helpers: read the research text into steps, N·m first, with honest confidence.
const NUM = '(\\d+(?:\\.\\d+)?(?:\\s*[–-]\\s*\\d+(?:\\.\\d+)?)?)'; // a value or a range
const RE_NM = new RegExp(`${NUM}\\s*(?:N[·.\\s-]?m|Nm)`, 'i');
const RE_FT = new RegExp(`${NUM}\\s*(?:ft[-·.\\s]?lbs?|lb[-·.\\s]?ft|ft\\.?\\s?lbs?)`, 'i');
const RE_IN = new RegExp(`${NUM}\\s*(?:in[-·.\\s]?lbs?|lb[-·.\\s]?in)`, 'i');
// an angle step: "+90°", "then +80-95 deg", "final 90 degrees" (not "37° flare")
const RE_ANGLE = /(?:\+\s*|then\s+(?:turn\s+)?(?:an?\s+)?(?:additional\s+)?\+?\s*|final(?:\s+pass)?\s*:?\s*\+?\s*|additional\s+)(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:°|deg(?:rees)?\b)/i;


/** Rewrite a piece of torque text N·m first: "59 ft-lb (80 N·m)" -> "80 N·m (59 ft-lb)", "25 in-lb" -> "2.8 N·m (25 in-lb)". */
function nmFirst(part) {
  const tidy = (v) => v.replace(/\s*[–-]\s*/, '–');
  const conv = (v, k, d = 0) => tidy(v).split('–').map((x) => (+x * k).toFixed(d)).join('–');
  const lab = part.match(/^([-A-Za-z0-9][^:]{0,40}?):\s*(?=[≈~\d])/);
  const label = lab ? `${lab[1].trim()}: ` : '';
  const body = lab ? part.slice(lab[0].length) : part;
  const n = body.match(RE_NM);
  const f = body.match(RE_FT);
  const i = body.match(RE_IN);
  const a = body.match(RE_ANGLE);
  const other = f ? `${tidy(f[1])} ft-lb` : i ? `${tidy(i[1])} in-lb` : '';
  let value = '';
  if (n) value = `${tidy(n[1])} N·m${other ? ` (${other})` : ''}`;
  else if (f) value = `${conv(f[1], 1.3558)} N·m (${other})`;
  else if (i) value = `${conv(i[1], 0.113, 1)} N·m (${other})`;
  if (!value) return part.replace(/^\+/, 'turn +');
  const angle = a ? ` then ${a[2] ? `+${a[1]}–${a[2]}°` : `+${a[1]}°`}` : '';
  const approx = /[≈~]/.test(body) ? '≈ ' : '';
  let rest = body.replace(RE_FT, '').replace(RE_IN, '').replace(RE_NM, '').replace(RE_ANGLE, '').replace(/[≈~]/g, '')
    .replace(/\(\s*\)/g, '').replace(/^[\s,:-]+|[\s,:-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  if (angle) rest = rest.replace(/\b(first|initial) pass\b,?\s*/i, '').trim(); // the angle is the final step
  // tidy what is left: no leading dashes, no words left hanging at the end ("listed at", "on the", "/")
  rest = rest.replace(/\s+\/\s+/g, ' ').replace(/do not exceed \s*on/i, 'maximum, on').replace(/^[–—-]+\s*/, '').replace(/(\s*(\/|\b(listed at|at|on the|of the|of|to|per|and|or|the|a|~)))+\s*$/i, '').replace(/\s*\/\s*$/, '').trim();
  return `${label}${approx}${value}${angle}${rest ? ` — ${rest}` : ''}`;
}

export const CONFIDENCE = {
  verified: { label: 'Verified', short: 'Verified', desc: "From GM or the part maker's instructions." },
  typical: { label: 'Typical', short: 'Typical', desc: 'A common published value, not confirmed for this car.' },
  estimate: { label: 'Estimate', short: 'Estimate', desc: 'Our best guess. Do not torque to this until you confirm it.' },
};

export function confidenceOf(h) {
  return CONFIDENCE[h?.confidence] ? h.confidence : 'estimate';
}

/** True when a hardware entry has a usable torque value at all. */
export function hasTorque(h) {
  return !!(h?.torque && !/^\s*(n\/?a|none|-|—)\b/i.test(h.torque) && /\d/.test(h.torque));
}

/**
 * Parse a torque string like "111 ft-lb (150 N·m) first pass + 15–30°".
 * Returns { primary, secondary, steps[], angle, isRange, confirm, raw }.
 */
export function parseTorque(raw, extra = '') {
  const text = String(raw || '');
  const nm = text.match(RE_NM);
  const ft = text.match(RE_FT);
  const inlb = text.match(RE_IN);
  // the angle step is sometimes only written in the sequence notes
  const ang = text.match(RE_ANGLE) || String(extra || '').match(RE_ANGLE);
  const fromNotes = !text.match(RE_ANGLE) && !!ang;
  const firstPassOnly = !ang && /first pass|stage 1|initial (pass|torque)|snug/i.test(`${text} ${extra}`) && /final|then|stage 2|second pass/i.test(`${text} ${extra}`);
  const tidy = (v) => v.replace(/\s*[–-]\s*/, '–');
  const conv = (v, k, digits = 0) => tidy(v).split('–').map((x) => (+x * k).toFixed(digits)).join('–');
  // N·m always leads; the other unit (as written, or converted) sits underneath
  let primary = null;
  let secondary = null;
  if (nm) {
    primary = `${tidy(nm[1])} N·m`;
    secondary = ft ? `${tidy(ft[1])} ft-lb` : inlb ? `${tidy(inlb[1])} in-lb` : parseFloat(nm[1]) < 12 ? `≈ ${conv(nm[1], 8.851)} in-lb` : `≈ ${conv(nm[1], 0.7376)} ft-lb`;
  } else if (ft) {
    primary = `${conv(ft[1], 1.3558)} N·m`;
    secondary = `${tidy(ft[1])} ft-lb as written`;
  } else if (inlb) {
    primary = `${conv(inlb[1], 0.113, 1)} N·m`;
    secondary = `${tidy(inlb[1])} in-lb as written`;
  }
  // several torque values, several angles, or a "loosen" step: a real multi-step sequence — never collapse it
  const units = text.match(new RegExp(`${NUM}\\s*(?:ft[-·.\\s]?lbs?|lb[-·.\\s]?ft|in[-·.\\s]?lbs?)`, 'gi')) || [];
  const angles = text.match(new RegExp(RE_ANGLE.source, 'gi')) || [];
  const multi = /loosen|back off/i.test(text) || angles.length > 1 || (units.length > 1 && /then|,\s*\d/.test(text) && !/;|\bor\b|steel|alumin|metric|\bAN\b|kit|factory|BMR/i.test(text));
  const steps = [];
  let aside = '';
  // alternatives: "steel …; aluminium …", "M10: …; M12: …", "Factory link: … . BMR arm: …" — list every one, never keep only the first
  const pieces = text.split(/;\s*|\.\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
  const valued = pieces.filter((x) => RE_NM.test(x) || RE_FT.test(x) || RE_IN.test(x));
  const alts = !multi && valued.length > 1;
  // two sources giving different numbers for the same bolt is not a choice of part
  const disagree = alts && /unresolved|owner.?(reported|posted)|read as|\blists\b|sources? (differ|disagree)|\bvs\.?\b|conflict/i.test(text);
  const seqPieces = String(extra || '').split(/;\s*|\s+\/\s+/).map((x) => x.trim()).filter((x) => RE_NM.test(x) || RE_FT.test(x) || RE_IN.test(x));
  const seqFull = !multi && !alts && !ang && seqPieces.length > 1 && /first pass|final|then|stage/i.test(String(extra));
  let finalChoice = false;
  if (seqFull) {
    // "First pass 15 N·m; final 27 N·m new head / 23 N·m used head": steps in order, and a final value
    // that depends on the part is one step with its choices ("27 N·m new head or 23 N·m used head")
    for (const stepText of String(extra).split(/;\s*/).map((x) => x.trim()).filter((x) => RE_NM.test(x) || RE_FT.test(x) || RE_IN.test(x))) {
      const choices = stepText.split(/\s+\/\s+/).map((x) => nmFirst(x.replace(/\.$/, '')));
      if (choices.length > 1) finalChoice = true;
      steps.push(choices.join(' or '));
    }
  } else if (multi) {
    for (const part of text.split(/\s*(?:,\s*then|;\s*then|\bthen\b|,)\s*/i).map((x) => x.trim()).filter(Boolean)) {
      if (!/\d/.test(part) && !/loosen|back off/i.test(part)) { aside += `${part} `; continue; } // e.g. "Aftermarket covers: maker value."
      const [step, ...more] = part.split(/\.\s+(?=[A-Z])/);
      steps.push(nmFirst(step.replace(/\.$/, '')));
      if (more.length) aside += `${more.join('. ')} `;
    }
  } else if (disagree) {
    for (const x of valued) steps.push(x.replace(/\.$/, '').replace(/^[≈~]\s*/, '≈ '));
  } else if (alts) {
    for (const x of valued) steps.push(nmFirst(x.replace(/\.$/, '')));
    for (const x of pieces) if (!valued.includes(x)) aside += `${x} `;
  } else if (primary) steps.push(primary);
  let angle = null;
  let angleRange = false;
  if (ang && !multi && !alts) {
    angle = ang[2] ? `+${ang[1]}–${ang[2]}°` : `+${ang[1]}°`;
    angleRange = !!ang[2];
    steps.push(`then turn ${angle}`);
  }
  const isRange = /\d\s*[–-]\s*\d/.test(text) || angleRange;
  const vague = /(per (kit|manufacturer|maker|instructions)|see |varies|depends|snug|hand.?tight)/i.test(text);
  const both = `${text} ${extra}`;
  const angleUnknown = !ang && /(angle|final (step|pass)|final value)[^.]{0,40}not (published|listed|on file|available|known)|not published|unpublished|final angle unknown/i.test(both);
  const samePasses = !ang && firstPassOnly && !angleUnknown && /(final|second) pass[^.]{0,20}(same|again|\d+\s*(n·?m|nm|ft))/i.test(both);
  // an angle that came from the sequence but is hedged there ("some owners report", "pattern of", "confirm")
  const angleHedged = fromNotes && /some owners|reported|pattern of|value from|typical of|other platform|zeta|chevy ss|confirm|verify|not in the|front value|rear value|assum/i.test(String(extra));
  const confirmWhy = !primary ? 'No value — check the maker’s instructions'
    : seqFull ? (finalChoice ? `${steps.length} steps — the final value depends on your part` : `${steps.length} steps — follow them in order`)
      : disagree ? 'Sources disagree — confirm in GM service info before torquing'
        : alts ? `${steps.length} values — use the one that matches your part`
      : multi ? `${steps.length}-step sequence — follow every step in order`
      : angleHedged ? `Final angle not confirmed (${angle} reported) — check GM service info`
      : angleUnknown ? 'Final angle not on file — get the GM service info before torquing'
      : samePasses ? 'Tighten in 2 passes to this value'
        : firstPassOnly ? 'First pass only — final step in the sequence'
      : vague ? 'Check the maker’s instructions' : isRange ? 'Range given — confirm for your parts' : '';
  return { primary, secondary, steps, angle, angleRange, fromNotes, firstPassOnly: firstPassOnly && !seqFull, angleUnknown, samePasses, angleHedged, multi: multi || alts || seqFull, alts, disagree, aside: aside.trim(), isRange, confirm: !!confirmWhy, confirmWhy, raw: text };
}

/** Torque for one hardware row, reading the angle step from its sequence notes too. */
export function parseHw(h) {
  // only this bolt's own torque and sequence fields — free-text notes often quote other bolts or cars
  return parseTorque(h?.torque, h?.torqueSequence || '');
}

/** The same bolts are also listed on another part ("same fasteners as …"): show once. */
export function isDuplicateRow(h) {
  return /same (fasteners|bolts|hardware) as/i.test(`${h?.notes || ''} ${h?.torqueSequence || ''}`);
}

/** REUSE / INSPECT / REPLACE / DISPUTED from free text. */
export function reuseClass(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (/disput|unclear|sources (differ|disagree)|conflict/.test(t)) return 'DISPUTED';
  if (/replace|tty|torque.to.yield|single.use|new\b|one.time|do not reuse/.test(t)) return 'REPLACE';
  if (/inspect|check|if (damaged|worn)|condition/.test(t)) return 'INSPECT';
  if (/reus|ok to|re-use/.test(t)) return 'REUSE';
  return null;
}

export const REUSE_LABEL = { REPLACE: 'Use new', DISPUTED: 'New? (sources disagree)', INSPECT: 'Inspect', REUSE: 'Reuse' };
export const REUSE_DESC = {
  REPLACE: 'Single-use: fit new ones.',
  DISPUTED: 'Sources disagree whether these are single-use. New ones are the safe choice.',
  INSPECT: 'Reuse only if threads and faces are good.',
  REUSE: 'Fine to reuse.',
};

/** One-line summary for a part: count, first torque and how many must be new. */
export function fastenerSummary(c, hardware = c.hardware) {
  const hw = hardware || [];
  if (!hw.length) return null;
  const torqued = hw.filter(hasTorque);
  const cls = hw.map((h) => reuseClass(h.reuse));
  const replace = hw.filter((h, i) => cls[i] === 'REPLACE').reduce((n, h) => n + (Number(h.qty) || 1), 0);
  const disputed = hw.filter((h, i) => cls[i] === 'DISPUTED').reduce((n, h) => n + (Number(h.qty) || 1), 0);
  const first = torqued[0] ? parseHw(torqued[0]) : null;
  return {
    count: hw.reduce((n, h) => n + (Number(h.qty) || 1), 0),
    kinds: hw.length,
    torque: first,
    torqueItem: torqued[0]?.item || '',
    torqueRow: torqued[0] || null,
    more: Math.max(0, torqued.length - 1),
    replace,
    disputed,
    confidence: torqued[0] ? confidenceOf(torqued[0]) : null,
  };
}

/** "8 fasteners · 2 must be new" */
export function fastenerWords(sum) {
  if (!sum) return '';
  const parts = [`${sum.count} fastener${sum.count === 1 ? '' : 's'}`];
  if (sum.replace) parts.push(`${sum.replace} must be new`);
  if (sum.disputed) parts.push(`${sum.disputed} new advised`);
  return parts.join(' · ');
}

/** Short fastener label: "Front brake caliper bolt (caliper-to-knuckle)" -> "caliper bolt". */
export function boltLabel(item) {
  const s = String(item || '').replace(/\s*\([^)]*\)/g, '').trim();
  return s.length > 38 ? `${s.slice(0, 36)}…` : s;
}
