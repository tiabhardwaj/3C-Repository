// One-off: turns the hand-tagged list (one line per doc entry: "<n> <TOPIC> <LEVEL>",
// in doc order) into categories.json, keyed by each entry's primaryUrl.
//   node scripts/build-categories.mjs <tags.txt>
// After this first run, categories.json is the file people edit; this
// script is only needed again for a full re-tag.

import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const data = JSON.parse(readFileSync(new URL('data.json', root), 'utf8'));
const lines = readFileSync(process.argv[2], 'utf8').trim().split(/\r?\n/);

// `symbol` is the two-letter, periodic-table-style mnemonic shown on each tile.
const topics = {
  QC:    { symbol: 'Qc', name: 'Quantum chemistry & DFT', blurb: 'Hartree-Fock, density functionals, basis sets, spectroscopy.' },
  MD:    { symbol: 'Md', name: 'Molecular dynamics & force fields', blurb: 'Simulating atoms in motion: GROMACS, OpenMM, integrators, water models.' },
  SM:    { symbol: 'Sm', name: 'Statistical mechanics & complex systems', blurb: 'Ensembles, entropy, phase transitions, percolation.' },
  MLM:   { symbol: 'Ml', name: 'ML for molecules & materials', blurb: 'Interatomic potentials, generative materials, cheminformatics, datasets.' },
  MAT:   { symbol: 'Ma', name: 'Materials science', blurb: 'Alloys, crystals, polymers, stability of solids.' },
  CHE:   { symbol: 'Ce', name: 'Chemical engineering & applied chemistry', blurb: 'Process design, combustion, analytical chemistry, lithography.' },
  PRO:   { symbol: 'Pr', name: 'Protein structure & design', blurb: 'AlphaFold, ESM, de novo design, structural biology.' },
  DRUG:  { symbol: 'Dr', name: 'Drug discovery & medicine', blurb: 'Binding affinity, docking, organoids, vaccines.' },
  BIO:   { symbol: 'Cb', name: 'Cells & biophysics', blurb: 'Gene circuits, stochastic simulation, how cells compute.' },
  NEURO: { symbol: 'Ns', name: 'Neuroscience & the brain', blurb: 'Neural circuits, predictive coding, optogenetics.' },
  NUM:   { symbol: 'Nm', name: 'Numerical methods', blurb: 'Linear algebra, Fourier, Monte Carlo, scientific computing courses.' },
  PDE:   { symbol: 'Fl', name: 'Fluids & differential equations', blurb: 'CFD, spectral methods, physics-informed networks.' },
  DLT:   { symbol: 'Lt', name: 'Deep learning theory & optimization', blurb: 'Generalization, SGD, mean-field and statistical-physics views of learning.' },
  MLF:   { symbol: 'Mf', name: 'Machine learning foundations & models', blurb: 'Transformers, diffusion, GNN primers, uncertainty, textbooks.' },
  MATH:  { symbol: 'Mt', name: 'Mathematics', blurb: 'Proofs, number theory, geometry, AI and mathematics.' },
  CS:    { symbol: 'Cp', name: 'Computing & hardware', blurb: 'Architecture, chips, shells, and the history of the machines.' },
  QM:    { symbol: 'Qm', name: 'Quantum mechanics & atomic physics', blurb: 'Wavefunctions, hydrogen, spin, Zeeman, time-dependent QM.' },
  QCOMP: { symbol: 'Qu', name: 'Quantum computing', blurb: 'Rydberg atoms, Qiskit, Hamiltonian simulation.' },
  CMP:   { symbol: 'Cm', name: 'Condensed matter physics', blurb: 'Magnetism, linear response, topology in solids.' },
  COSMO: { symbol: 'Co', name: 'Particles, nuclei & the cosmos', blurb: 'Black holes, dark matter, quarks, superheavy elements.' },
  OPT:   { symbol: 'Op', name: 'Optics & lasers', blurb: 'Laser cooling, telescopes, lenses, Ti:sapphire.' },
  HIST:  { symbol: 'Hi', name: 'History & people of science', blurb: 'Primary sources, biographies, Los Alamos.' },
  RES:   { symbol: 'Rs', name: 'How research works', blurb: 'Reading lists, research craft, measuring progress.' },
  AI:    { symbol: 'Ai', name: 'AI, mind & the future', blurb: 'Intelligence, consciousness, AI policy and safety.' },
  IND:   { symbol: 'In', name: 'Engineering, industry & energy', blurb: 'Supply chains, factories, robots, propulsion.' },
  MISC:  { symbol: 'Cu', name: 'Curiosities', blurb: 'Hard to file, worth keeping.' },
};
const levels = {
  I: { name: 'Intro', blurb: 'No background needed: explainers, popular talks, essays, first tutorials.' },
  C: { name: 'Core', blurb: 'Standard coursework: textbooks, courses, reference material, widely used tools.' },
  A: { name: 'Advanced', blurb: 'Research level: papers, preprints, specialist code and graduate seminars.' },
};

// How topics are grouped on the site. Only "fields" is used (Rings and Roles
// were dropped on 19 Nov 2026). A view is just a regrouping of topic codes,
// so changing it never requires re-tagging entries. Every topic must appear
// in exactly one group.
const views = {
  default: 'fields',
  fields: {
    name: 'Fields',
    desc: 'Six wings named after disciplines, the way a university or a bookshop shelves things.',
    bestFor: 'People who already know which field they want to browse.',
    groups: [
      { id: 'molecules-materials', name: 'Molecules & Materials', desc: 'Electrons to engineered materials: the heart of computational chemistry.', topics: ['QC', 'MLM', 'MAT', 'MD', 'CHE', 'SM'] },
      { id: 'maths-computing', name: 'Maths & Computing', desc: 'The mathematics and machinery underneath every simulation.', topics: ['MATH', 'CS', 'PDE', 'NUM'] },
      { id: 'machine-learning', name: 'Machine Learning', desc: 'How learning machines work, from first principles to research.', topics: ['DLT', 'MLF'] },
      { id: 'life-medicine', name: 'Life & Medicine', desc: 'Proteins, cells, brains and the search for new medicines.', topics: ['BIO', 'DRUG', 'PRO', 'NEURO'] },
      { id: 'physics', name: 'Physics', desc: 'From the hydrogen atom to black holes, plus quantum computers.', topics: ['QM', 'COSMO', 'QCOMP', 'CMP', 'OPT'] },
      { id: 'science-society', name: 'Science & Society', desc: 'The people, history and big questions around the science.', topics: ['HIST', 'AI', 'RES', 'IND', 'MISC'] },
    ],
  },
};
// Every topic needs its own symbol, like elements on a periodic table.
const symbols = Object.values(topics).map(t => t.symbol);
const dupeSymbols = symbols.filter((s, i) => symbols.indexOf(s) !== i);
if (symbols.some(s => !/^[A-Z][a-z]$/.test(s)) || dupeSymbols.length) throw new Error(`bad or duplicate symbols: ${dupeSymbols}`);
for (const [key, view] of Object.entries(views)) {
  if (key === 'default') continue;
  const seen = view.groups.flatMap(g => g.topics);
  const missing = Object.keys(topics).filter(t => !seen.includes(t));
  const dupes = seen.filter((t, i) => seen.indexOf(t) !== i);
  if (missing.length || dupes.length) throw new Error(`view ${key}: missing ${missing} duplicated ${dupes}`);
}

const items = data.sections.flatMap(s => s.items);
if (lines.length !== items.length) throw new Error(`${lines.length} tags for ${items.length} entries`);

const entries = {};
lines.forEach((line, i) => {
  const [n, topic, level] = line.trim().split(/\s+/);
  if (Number(n) !== i + 1) throw new Error(`line ${i + 1} is numbered ${n}`);
  if (!topics[topic]) throw new Error(`unknown topic ${topic} on line ${n}`);
  if (!levels[level]) throw new Error(`unknown level ${level} on line ${n}`);
  const url = items[i].primaryUrl;
  entries[url] = { topic, level, title: items[i].title.trim() };
});

const out = {
  _readme: 'Subject and level for every doc entry, keyed by primaryUrl. Edit topic/level here; titles are only a reading aid and are not used by the site. Entries missing from this file are auto-suggested and shown as unreviewed.',
  topics, levels, views, entries,
};
writeFileSync(new URL('categories.json', root), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote categories.json: ${Object.keys(entries).length} entries`);
