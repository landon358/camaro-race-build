export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function el(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Only allow http(s) links from research data. */
export function safeUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function sourceLinks(sources) {
  return (sources || [])
    .map((s) => (typeof s === 'string' ? { title: s, url: s } : s))
    .map((s) => ({ ...s, url: safeUrl(s.url) }))
    .filter((s) => s.url);
}

let toastTimer;
let lastUndo = null;
/**
 * Short confirmation at the bottom of the screen, with an optional action (e.g. Undo).
 * Stays 10 s, waits while hovered or focused; the last Undo also works with Ctrl/Cmd+Z.
 */
export function toast(message, action) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.replaceChildren();
  const span = document.createElement('span');
  span.textContent = message;
  t.appendChild(span);
  lastUndo = null;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = action.label;
    const run = () => { action.run(); t.hidden = true; lastUndo = null; announce(`${action.label} done`); };
    b.addEventListener('click', run);
    t.appendChild(b);
    if (/undo/i.test(action.label)) lastUndo = run;
  }
  t.hidden = false;
  const hide = () => { if (!t.matches(':hover, :focus-within')) { t.hidden = true; lastUndo = null; } else arm(); };
  const arm = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hide, action ? 10000 : 3500); };
  arm();
  announce(action ? `${message}. Press Control Z to undo.` : message);
}

window.addEventListener('keydown', (e) => {
  if (!lastUndo || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  lastUndo();
});

/** Tell screen-reader users what just happened. */
export function announce(message) {
  const live = document.getElementById('sr-live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => (live.textContent = message), 30);
}
