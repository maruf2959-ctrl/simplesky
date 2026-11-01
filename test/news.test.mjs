import { test } from 'node:test';
import assert from 'node:assert/strict';
test('parseRss extracts titles, links and dates', async () => {
  const { parseRss } = await import('../scripts/update-news.mjs');
  const xml = `<rss><channel><item><title><![CDATA[Webb spots a &amp; galaxy]]></title><link>https://example.org/a</link><pubDate>Sat, 17 Oct 2026 10:00:00 +0000</pubDate></item><item><title>No link</title></item></channel></rss>`;
  const items = parseRss(xml, 'NASA');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Webb spots a & galaxy');
  assert.equal(items[0].date, '2026-10-17T10:00:00.000Z');
});
