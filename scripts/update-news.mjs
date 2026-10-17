#!/usr/bin/env node
// Fetch astronomy headlines from public RSS feeds into data/news.json.
// Runs in the daily GitHub Action; any feed may fail without breaking the others.
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/news.json');
const FEEDS = [
  { source: 'NASA', url: 'https://www.nasa.gov/feed/' },
  { source: 'ESA', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science' }
];

const decode = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();

export function parseRss(xml, source) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map((m) => {
    const tag = (t) => m[0].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] || '';
    const date = new Date(decode(tag('pubDate')) || Date.now());
    return { title: decode(tag('title')), link: decode(tag('link')), date: isNaN(date) ? new Date().toISOString() : date.toISOString(), source };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link));
}

async function main() {
  let items = [];
  for (const f of FEEDS) {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'SimpleSky/1.0 (+https://github.com/maruf2959-ctrl/Camera-finder-)' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const got = parseRss(await res.text(), f.source);
      console.log(`✓ ${f.source}: ${got.length}`);
      items.push(...got);
    } catch (e) {
      console.warn(`✗ ${f.source}: ${e.message}`);
    }
  }
  if (!items.length) {
    console.warn('No news fetched; keeping the previous file.');
    return;
  }
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  const seen = new Set();
  items = items.filter((i) => (seen.has(i.link) ? false : seen.add(i.link))).slice(0, 30);
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 1) + '\n');
  console.log(`Wrote ${items.length} headlines.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
