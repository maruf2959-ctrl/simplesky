import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { titleMatches, parseRetailPage } from '../scripts/update-listings.mjs';

const { cameras } = JSON.parse(await readFile(new URL('../data/cameras.json', import.meta.url), 'utf8'));
const cam = (id) => cameras.find((c) => c.id === id);

test('ASI585MC matches the uncooled camera only', () => {
  assert.ok(titleMatches(cam('asi585mc'), 'ZWO ASI585MC USB3.0 Colour Astronomy Camera'));
  assert.ok(titleMatches(cam('asi585mc'), 'zwo asi 585mc planetary camera boxed'));
  assert.ok(!titleMatches(cam('asi585mc'), 'ZWO ASI585MC Pro cooled camera'));
  assert.ok(!titleMatches(cam('asi585mc'), 'ZWO ASI585MM mono camera'));
  assert.ok(!titleMatches(cam('asi585mc'), 'ZWO ASI585MC Air'));
});

test('Canon 600D family matches bodies, rejects spares and accessories', () => {
  assert.ok(titleMatches(cam('canon-600d'), 'Canon EOS 600D 18MP DSLR Camera Body'));
  assert.ok(titleMatches(cam('canon-600d'), 'Canon EOS 700D with 18-55mm lens'));
  assert.ok(!titleMatches(cam('canon-600d'), 'Canon EOS 600D for parts not working'));
  assert.ok(!titleMatches(cam('canon-600d'), 'Battery grip for Canon 600D 650D 700D'));
  assert.ok(!titleMatches(cam('canon-600d'), 'Canon EOS 2000D body'));
});

test('alphabetic exclusions use word boundaries', () => {
  // "pro" must not match inside "protective"
  assert.ok(titleMatches(cam('asi585mc'), 'ZWO ASI585MC with protective case'));
});

test('parseRetailPage reads price, stock and title', () => {
  const html = `<title>ZWO ASI 662MC USB 3 Camera | First Light Optics</title>
    <meta property="product:price:amount" content="199.00">
    <script type="application/ld+json">{"offers":{"price":"199.00","availability":"https:\\/\\/schema.org\\/InStock"}}</script>`;
  const info = parseRetailPage(html);
  assert.equal(info.price, 199);
  assert.equal(info.availability, 'InStock');
  assert.equal(info.title, 'ZWO ASI 662MC USB 3 Camera');
});

test('parseRetailPage keeps inch marks in titles', () => {
  const info = parseRetailPage('<title>Astro Essentials 1.25" to T Camera Nosepiece Adapter | FLO</title><meta property="product:price:amount" content="12.00">');
  assert.equal(info.title, 'Astro Essentials 1.25" to T Camera Nosepiece Adapter');
  assert.equal(info.price, 12);
});

test('parseRss extracts titles, links and dates', async () => {
  const { parseRss } = await import('../scripts/update-news.mjs');
  const xml = `<rss><channel><item><title><![CDATA[Webb spots a &amp; galaxy]]></title><link>https://example.org/a</link><pubDate>Sat, 17 Oct 2026 10:00:00 +0000</pubDate></item><item><title>No link</title></item></channel></rss>`;
  const items = parseRss(xml, 'NASA');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Webb spots a & galaxy');
  assert.equal(items[0].date, '2026-10-17T10:00:00.000Z');
});
