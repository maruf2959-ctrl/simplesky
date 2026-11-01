import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ctx = { Math };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(await readFile(new URL('../assets/conditions.js', import.meta.url), 'utf8'), ctx);
const { Sky } = ctx;

const hour = (o) => ({ cloud: 0, low: 0, mid: 0, high: 0, rh: 65, wind: 4, gust: 7, jet: 35, rain: 0, vis: 30000, ...o });
const dark = { sunAlt: -30, moonAlt: -10, moonIllum: 0.1, bortle: 4 };

test('a clear, still, dark night rates excellent', () => {
  const r = Sky.rate(hour(), dark);
  assert.ok(r.score >= 85, `got ${r.score}`);
  assert.match(r.verdict, /Clear and still/);
});

test('cloud caps the rating whatever else is good', () => {
  assert.ok(Sky.rate(hour({ cloud: 95, low: 90, mid: 60 }), dark).score < 25);
});

test('wind, jet stream and moonlight each lower a clear night and explain why', () => {
  const base = Sky.rate(hour(), dark).score;
  const windy = Sky.rate(hour({ wind: 22, gust: 38 }), dark);
  const turbulent = Sky.rate(hour({ jet: 140 }), dark);
  const moonlit = Sky.rate(hour(), { ...dark, moonAlt: 40, moonIllum: 0.98 });
  assert.ok(windy.score < base && turbulent.score < base && moonlit.score < base);
  assert.match(windy.verdict, /windy/);
  assert.match(turbulent.verdict, /turbulent/);
  assert.match(moonlit.verdict, /moonlit/);
});

test('light pollution and twilight lower the darkness factor', () => {
  const city = Sky.rate(hour(), { ...dark, bortle: 9 });
  const twilight = Sky.rate(hour(), { ...dark, sunAlt: -8 });
  const dk = (r) => r.parts.find((p) => p.key === 'dark').score;
  assert.ok(dk(city) < dk(Sky.rate(hour(), dark)));
  assert.ok(dk(twilight) < 50);
});
