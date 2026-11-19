// A topic page: every entry in one topic, in lanes by how you'd learn from it
// (Watch / Read / Do / Study / Papers), each running Intro → Advanced.
// Tick-boxes are remembered in this browser (localStorage), nowhere else.
// URL: topic.html?t=CODE&level=I|C|A&format=Video|Article|Code|Course%20%26%20Book|Paper

import { buildEntries, viewOf } from './model.js';
import { setupThemeToggle } from './theme.js';

const LANES = [
  { key: 'Video', name: 'Watch', sub: 'videos & talks' },
  { key: 'Article', name: 'Read', sub: 'articles & notes' },
  { key: 'Code', name: 'Do', sub: 'code to run' },
  { key: 'Course & Book', name: 'Study', sub: 'courses & books' },
  { key: 'Paper', name: 'Papers', sub: 'research papers' },
];
const LEVELS = [['I', 'Intro'], ['C', 'Core'], ['A', 'Advanced']];
const LEVEL_RANK = { I: 0, C: 1, A: 2 };
const DONE_KEY = '3c-done';

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

const params = new URLSearchParams(location.search);
const state = { level: params.get('level') || '', format: params.get('format') || '' };
let topicCode = params.get('t') || '';
let categories, items, field;

// ---------- Ticks (this browser only) ----------

function loadDone() {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); }
}
const done = loadDone();
function saveDone() {
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* private mode: ticks last for this visit */ }
}

// ---------- Rendering ----------

function writeState() {
  const p = new URLSearchParams({ t: topicCode });
  if (state.level) p.set('level', state.level);
  if (state.format) p.set('format', state.format);
  history.replaceState(null, '', `?${p}`);
}

function renderHead() {
  const t = categories.topics[topicCode];
  const ticked = items.filter(e => done.has(e.url)).length;
  document.title = `${t.name} · The 3C Repository`;
  $('crumb').replaceChildren(el('a', { href: 'index.html' }, 'Front page'), ` › ${field.name} › ${t.symbol}`);
  $('head').replaceChildren(
    el('div', { class: 'block', style: `--band: var(--f${field.index + 1})` },
      el('span', { class: 'sym' }, t.symbol),
      el('span', { class: 'label' }, `${items.length} entries`)),
    el('div', { class: 'topic-head__text' },
      el('span', { class: 'label accent' }, field.name),
      el('h1', { class: 'display', id: 'topic-h' }, t.name),
      el('p', {}, t.blurb)),
    el('span', { class: 'ticked', 'aria-live': 'polite' }, `${ticked} / ${items.length} ticked`));
}

function renderFilters() {
  $('level-chips').replaceChildren(...[['', 'All'], ...LEVELS].map(([k, name]) => el('button', {
    type: 'button', 'aria-pressed': String(state.level === k), onclick: () => { state.level = k; render(); },
  }, name)));
  const present = new Set(items.map(e => e.format));
  $('format-chips').replaceChildren(...[{ key: '', name: 'Any', sub: 'all formats' }, ...LANES.filter(l => present.has(l.key))]
    .map(l => el('button', {
      type: 'button', class: 'pill', 'aria-pressed': String(state.format === l.key), onclick: () => { state.format = l.key; render(); },
    }, el('span', { class: 'pill__main' }, l.name), el('span', { class: 'pill__sub' }, l.sub))));
}

function renderLanes() {
  const fits = e => (!state.level || e.level === state.level) && (!state.format || e.format === state.format);
  let shown = 0;
  const lanes = LANES.map(lane => {
    const all = items.filter(e => e.format === lane.key);
    if (!all.length) return null; // a topic with no videos gets no Watch lane
    if (state.format && state.format !== lane.key) return null;
    const vis = all.filter(fits).sort((a, b) => (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) || a.order - b.order);
    shown += vis.length;
    const d = all.filter(e => done.has(e.url)).length;
    return el('section', { class: 'lane', 'aria-label': `${lane.name}: ${lane.sub}` },
      el('div', { class: 'lane__head' },
        el('div', { class: 'lane__top' }, el('h2', { class: 'display' }, lane.name), el('span', { class: 'label' }, `${d} of ${all.length} done`)),
        el('span', { class: 'label', style: 'opacity:.85' }, lane.sub),
        el('div', { class: 'lane__bar', 'aria-hidden': 'true' }, el('span', { style: `width: ${Math.round(d / all.length * 100)}%` }))),
      vis.length ? vis.map(item) : el('p', { class: 'lane__empty' }, 'Nothing in this lane for these filters.'));
  }).filter(Boolean);
  $('lanes').replaceChildren(...lanes);
  $('shown').textContent = state.level || state.format ? `Showing ${shown} of ${items.length}` : `Showing all ${items.length}`;
}

function item(e) {
  const isDone = done.has(e.url);
  const lv = Object.fromEntries(LEVELS)[e.level];
  return el('div', { class: `item${isDone ? ' done' : ''}` },
    el('button', {
      type: 'button', class: 'tick', 'aria-pressed': String(isDone),
      'aria-label': `${isDone ? 'Mark as not done' : 'Mark as done'}: ${e.title}`,
      onclick: () => { if (done.has(e.url)) done.delete(e.url); else done.add(e.url); saveDone(); render(); },
    }, isDone ? '✓' : ''),
    el('div', { class: 'item__body' },
      el('div', { style: 'display:flex; gap:6px; align-items:center; flex-wrap:wrap;' },
        lv ? el('span', { class: `lv lv--${e.level}` }, lv) : el('span', { class: 'unreviewed' }, 'New'),
        el('span', { class: 'label muted' }, e.host)),
      el('a', { class: 'item__title', href: e.url, target: '_blank', rel: 'noopener noreferrer' }, e.title),
      e.summary ? el('p', { class: 'item__desc' }, e.summary) : null));
}

function render() {
  writeState();
  renderHead();
  renderFilters();
  renderLanes();
}

// ---------- Boot ----------

async function load() {
  setupThemeToggle($('theme-toggle'));
  try {
    const [data, cats] = await Promise.all(['data.json', 'categories.json']
      .map(f => fetch(f).then(r => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); })));
    categories = cats;
    const fields = viewOf(cats, cats.views.default);
    if (!cats.topics[topicCode]) {
      $('head').replaceChildren(el('p', { class: 'notfound' }, 'That topic does not exist. ', el('a', { href: 'index.html', class: 'accent' }, 'Pick one on the front page →')));
      return;
    }
    const gi = fields.groups.findIndex(g => g.topics.includes(topicCode));
    field = { name: fields.groups[gi].name, index: gi };
    items = buildEntries(data, cats, {}).filter(e => e.topic === topicCode);
    render();
  } catch (err) {
    console.error(err);
    $('head').replaceChildren(el('p', { class: 'notfound' }, 'This topic could not load. Please try again in a moment.'));
  }
}

load();
