// The front page: one-screen spread with Start here, every topic (table or
// map) and a topic details panel. Hover or focus previews a topic; click pins it.
// URL: #t=CODE pins a topic, ?show=map opens the map.

import { buildEntries, viewOf } from './model.js';
import { setupThemeToggle } from './theme.js';

const LEVEL_NAME = { I: 'Intro', C: 'Core', A: 'Advanced' };
const LEVEL_RANK = { I: 0, C: 1, A: 2 };
const SVG = 'http://www.w3.org/2000/svg';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
};
const svg = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
};

let categories, editorial, entries, byUrl, stats, conn, fields, fieldOf;
let pinned = (location.hash.match(/^#t=([A-Z]+)$/) || [])[1] || '';
let hover = '';
let mode = new URLSearchParams(location.search).get('show') === 'map' ? 'map' : 'table';

// ---------- Derived data ----------

function topicStats() {
  const s = {};
  for (const code of Object.keys(categories.topics)) s[code] = { n: 0, I: 0, C: 0, A: 0, items: [] };
  for (const e of entries) {
    const t = s[e.topic];
    if (!t) continue;
    t.n++;
    if (e.level) t[e.level]++;
    t.items.push(e);
  }
  for (const t of Object.values(s)) t.items.sort((a, b) => (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) || a.order - b.order);
  return s;
}

const tier = n => (n >= 22 ? 4 : n >= 13 ? 3 : n >= 8 ? 2 : 1);
const sym = code => categories.topics[code].symbol || code.slice(0, 2);
const band = code => `var(--f${fieldOf[code].index + 1})`;
const linksOf = code => conn.links.filter(l => l.a === code || l.b === code).sort((x, y) => y.strength - x.strength);

/** White or deep-ink text on a field colour, whichever reads better (WCAG luminance). */
function textOn(hex) {
  const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const L = lum(hex);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.06 ? '#FFFFFF' : '#0F2A2E';
}
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- Selection ----------

const focus = () => hover || pinned;
function preview(code) { hover = code; renderPanel(); markActive(); }
function unpreview() { hover = ''; renderPanel(); markActive(); }
function pin(code) {
  pinned = code; hover = '';
  history.replaceState(null, '', `${location.search || location.pathname}#t=${code}`);
  renderPanel(); markActive();
}

/** Update pressed/focus styling without rebuilding the table or map. */
function markActive() {
  const f = focus();
  document.querySelectorAll('.tile').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.code === pinned)));
  if (mode !== 'map') return;
  const near = new Set([f, ...linksOf(f).map(l => (l.a === f ? l.b : l.a))]);
  document.querySelectorAll('.map .node').forEach(n => {
    const c = n.dataset.code;
    n.classList.toggle('dim', !near.has(c));
    n.classList.toggle('focus', c === f);
    n.classList.toggle('pinned', c === pinned);
    n.setAttribute('aria-pressed', String(c === pinned));
  });
  document.querySelectorAll('.map .edge').forEach(e => e.classList.toggle('lit', e.dataset.a === f || e.dataset.b === f));
}

const hoverable = code => ({
  onmouseenter: () => preview(code),
  onmouseleave: unpreview,
  onfocus: () => preview(code),
  onblur: unpreview,
});

// ---------- Rendering ----------

function renderLead() {
  const lead = editorial.lead;
  const at = lead.accent ? lead.headline.indexOf(lead.accent) : -1;
  $('lead-h').replaceChildren(...(at >= 0
    ? [lead.headline.slice(0, at), el('em', {}, lead.accent), lead.headline.slice(at + lead.accent.length)]
    : [lead.headline]));
  $('lead-kicker').textContent = lead.kicker;
  $('lead-dek').textContent = lead.dek;
  $('lead-cta').href = lead.url;
  $('lead-cta').textContent = `${lead.cta || 'Read it'} →`;
  const picks = editorial.picks.items.map(p => byUrl.get(p.url)).filter(Boolean);
  $('inside').replaceChildren(...picks.map(e => el('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer' },
    el('span', { class: 'label accent' }, `${sym(e.topic)} · ${categories.topics[e.topic].name}`),
    el('span', { class: 'inside__title' }, e.title))));
}

function renderTable() {
  $('table').replaceChildren(...fields.groups.map((g, gi) => {
    const n = g.topics.reduce((s, c) => s + stats[c].n, 0);
    const cols = g.topics.length > 5 ? 2 : 1;
    return el('div', { class: 'field-col', style: `--band: var(--f${gi + 1})` },
      el('div', { class: 'field-col__head', style: `width: ${cols * 84 + (cols - 1) * 6}px` },
        el('span', { class: 'label' }, g.name),
        el('span', { class: 'label muted' }, `${n} entries`)),
      el('div', { class: 'tiles', style: `grid-template-columns: repeat(${cols}, 84px)` },
        g.topics.map(code => {
          const t = stats[code];
          const name = categories.topics[code].name;
          return el('button', {
            type: 'button', class: `tile tile--${tier(t.n)}`, 'data-code': code, 'aria-pressed': String(code === pinned),
            'aria-label': `${sym(code)}, ${name}, ${t.n} entries`,
            onclick: () => pin(code), ...hoverable(code),
          },
            el('span', { class: 'tile__top' }, el('span', { class: 'sym' }, sym(code)), el('span', { class: 'tile__n' }, String(t.n))),
            el('span', { class: 'tile__name' }, name),
            el('span', { class: 'bar', 'aria-hidden': 'true' },
              el('span', { class: 'i', style: `flex: ${t.I} 1 0` }),
              el('span', { class: 'c', style: `flex: ${t.C} 1 0` }),
              el('span', { class: 'a', style: `flex: ${t.A} 1 0` })));
        })));
  }));
}

function renderMap() {
  const W = conn.width, H = conn.height;
  const colours = fields.groups.map((_, i) => cssVar(`--f${i + 1}`) || '#0F6E74');
  const edges = conn.links.map(l => {
    const [x1, y1] = conn.positions[l.a], [x2, y2] = conn.positions[l.b];
    return svg('line', { class: 'edge', x1, y1, x2, y2, 'stroke-width': Math.max(1.5, l.strength * 9), 'data-a': l.a, 'data-b': l.b });
  });
  const nodes = Object.entries(conn.positions).map(([code, [x, y]]) => {
    const n = stats[code].n;
    const s = Math.round(22 + Math.sqrt(n) * 4.6); // square size
    const fill = colours[fieldOf[code].index];
    return svg('g', {
      class: 'node', 'data-code': code, tabindex: '0', role: 'button', 'aria-pressed': String(code === pinned),
      'aria-label': `${sym(code)}, ${categories.topics[code].name}, ${n} entries`,
      onclick: () => pin(code), ...hoverable(code),
      onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pin(code); } },
    },
      svg('rect', { class: 'ring', x: x - s / 2 - 5, y: y - s / 2 - 5, width: s + 10, height: s + 10 }),
      svg('rect', { class: 'box', x: x - s / 2, y: y - s / 2, width: s, height: s, fill }),
      svg('text', { class: 'sym-t', x, y: y + 1, 'font-size': Math.max(13, Math.round(s * 0.42)), fill: textOn(fill) }, sym(code)),
      svg('text', { class: 'lab', x, y: y + s / 2 + 14 }, categories.topics[code].name.split(/ [&,(]/)[0]));
  });
  $('map').replaceChildren(
    svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Map of how the topics connect' }, ...edges, ...nodes),
    el('p', { class: 'map__note' }, 'Bigger squares hold more entries. Lines join topics whose entries talk about the same things; thicker lines are stronger links.'));
}

function renderLegend() {
  $('legend').replaceChildren(
    ...fields.groups.map((g, i) => el('span', {}, el('i', { style: `background: var(--f${i + 1})` }), g.name)),
    el('span', { class: 'label muted' }, 'Hover to preview · click to pin'));
}

function renderPanel() {
  const code = focus();
  const t = stats[code];
  const topic = categories.topics[code];
  const field = fieldOf[code];
  const isPreview = hover && hover !== pinned;
  $('panel').replaceChildren(
    el('div', { class: 'panel-head' },
      el('div', { class: `block${tier(t.n) === 4 ? ' block--hi' : ''}`, style: `--band: ${band(code)}` },
        el('span', { class: 'sym' }, sym(code)),
        el('span', { class: 'label' }, `${t.n} entries`)),
      el('div', { style: 'display:flex; flex-direction:column; justify-content:center; gap:4px; min-width:0;' },
        el('span', { class: 'label accent' }, `${isPreview ? 'Preview' : 'Pinned'} · ${field.name}`),
        el('h2', { class: 'display' }, topic.name))),
    el('div', { class: 'scroll' },
      el('div', { class: 'panel-body' },
        el('p', {}, topic.blurb),
        el('div', { class: 'chips' },
          el('span', {}, `${t.I} intro`), el('span', {}, `${t.C} core`), el('span', { class: 'solid' }, `${t.A} advanced`)),
        el('div', { class: 'list' },
          el('span', { class: 'label muted' }, 'Read first'),
          t.items.slice(0, 3).map(e => el('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer' },
            el('span', { class: 'label muted' }, `${LEVEL_NAME[e.level] || 'New'} · ${e.host}`),
            el('span', {}, e.title)))),
        el('div', { class: 'list' },
          el('span', { class: 'label muted' }, 'Connected to'),
          linksOf(code).slice(0, 5).map(l => {
            const other = l.a === code ? l.b : l.a;
            return el('button', { type: 'button', onclick: () => pin(other) },
              el('span', { class: 'sym' }, sym(other)),
              el('span', {}, el('span', { style: 'font-weight:600; font-size:13.5px;' }, categories.topics[other].name),
                el('small', {}, `linked by ${l.linkedBy}`)));
          })))),
    el('div', { class: 'panel-foot' },
      el('a', { class: 'btn', href: `topic.html?t=${code}` }, `Open ${topic.name} →`)));
}

function setMode(m) {
  mode = m;
  $('mode-table').setAttribute('aria-pressed', String(m === 'table'));
  $('mode-map').setAttribute('aria-pressed', String(m === 'map'));
  $('table').hidden = m !== 'table';
  $('map').hidden = m !== 'map';
  const p = new URLSearchParams(location.search);
  if (m === 'map') p.set('show', 'map'); else p.delete('show');
  history.replaceState(null, '', (p.toString() ? `?${p}` : location.pathname) + location.hash);
  if (m === 'map') renderMap();
  markActive();
}

// ---------- Boot ----------

async function load() {
  setupThemeToggle($('theme-toggle'));
  try {
    const [data, cats, ed, thumbs, links] = await Promise.all(
      ['data.json', 'categories.json', 'editorial.json', 'thumbnails.json', 'connections.json']
        .map(f => fetch(f).then(r => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); })));
    categories = cats; editorial = ed; conn = links;
    entries = buildEntries(data, cats, thumbs);
    byUrl = new Map(entries.map(e => [e.url, e]));
    stats = topicStats();
    fields = viewOf(cats, cats.views.default);
    fieldOf = {};
    fields.groups.forEach((g, index) => g.topics.forEach(c => { fieldOf[c] = { name: g.name, index }; }));
    if (!pinned || !stats[pinned]) pinned = fields.groups[0].topics[0];

    const updated = data.generatedAt ? new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    $('stamp').textContent = `${entries.length} entries · ${Object.keys(cats.topics).length} topics · ${fields.groups.length} fields${updated ? ` · updated ${updated}` : ''}`;
    renderLead();
    renderTable();
    renderLegend();
    renderPanel();
    $('mode-table').addEventListener('click', () => setMode('table'));
    $('mode-map').addEventListener('click', () => setMode('map'));
    setMode(mode);
    // Re-colour map text if the theme changes.
    $('theme-toggle').addEventListener('click', () => { if (mode === 'map') { renderMap(); markActive(); } });
  } catch (err) {
    console.error(err);
    $('table').replaceChildren(el('p', { class: 'muted' }, 'The topics could not load. Please try again in a moment.'));
  }
}

load();
