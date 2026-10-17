import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Load the browser scripts into a sandbox with minimal App shims.
const ctx = { console, structuredClone, Math, Date };
ctx.window = ctx;
ctx.App = { store: { get: (_k, f) => f, set() {} }, emit() {}, hourScore: () => null };
vm.createContext(ctx);
for (const f of ['assets/astro.js', 'assets/rating.js']) vm.runInContext(await readFile(new URL('../' + f, import.meta.url), 'utf8'), ctx);
const gear = JSON.parse(await readFile(new URL('../data/gear.json', import.meta.url), 'utf8'));
const targets = JSON.parse(await readFile(new URL('../data/targets.json', import.meta.url), 'utf8'));
const { Kit, Rating } = ctx;

const loc = { lat: 50.8179, lon: -0.3728, bortle: 6 };
const now = new Date('2026-10-17T21:00:00Z');
const night = { isDark: true, start: now, end: new Date('2026-10-18T04:40:00Z'), sunset: new Date('2026-10-17T17:05:00Z') };
const planFor = (mod) => {
  const s = Kit.get().setups[0];
  mod?.(s);
  return Rating.plan({ targets, k: Rating.derive(s, gear), loc, night, hours: null, now });
};
const find = (plan, id) => plan.find((e) => e.target.id === id);

test('127 SLT: bright planets and M42 beat faint galaxies', () => {
  const p = planFor();
  assert.ok(find(p, 'saturn').visual.score > 85);
  assert.ok(find(p, 'M42').visual.score > find(p, 'M101').visual.score + 40);
  assert.ok(find(p, 'M33').visual.score < 45, 'M33 is hard from a Bortle 6 town');
});

test('no camera means no photography rating', () => {
  assert.equal(find(planFor(), 'M42').imaging, null);
});

test('a smart scope out-images the 127 SLT on big targets but not planets', () => {
  const slt = planFor((s) => (s.cameraId = 'asi585mc'));
  const seestar = planFor((s) => Object.assign(s, { scope: { name: 'Seestar', type: 'smart', aperture: 50, focal: 250 }, mountId: 'smart', eyepieces: [], barlowId: null, cameraId: 'seestar-s50' }));
  assert.ok(find(seestar, 'M31').imaging.score > find(slt, 'M31').imaging.score + 20);
  assert.ok(find(slt, 'saturn').imaging.score > find(seestar, 'saturn').imaging.score + 30);
});

test('darker skies raise deep-sky ratings', () => {
  const town = find(planFor(), 'M51').visual.score;
  const s = Kit.get().setups[0];
  const dark = find(Rating.plan({ targets, k: Rating.derive(s, gear), loc: { ...loc, bortle: 3 }, night, hours: null, now }), 'M51').visual.score;
  assert.ok(dark > town + 15);
});

test('alignment stars are well spread and above 20°', () => {
  const stars = Rating.alignStars(targets.alignStars, now, loc);
  assert.equal(stars.length, 3);
  for (const s of stars) assert.ok(s.alt > 20);
});
