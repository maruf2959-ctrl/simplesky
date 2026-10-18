#!/usr/bin/env node
// Daily listings updater. Pulls current UK listings for every camera in
// data/cameras.json and writes data/listings.json + data/history.json.
//
// Sources (each one is optional and fails independently):
//   - eBay UK  : official Browse API. Needs EBAY_CLIENT_ID / EBAY_CLIENT_SECRET.
//   - CeX UK   : public JSON search used by uk.webuy.com (best effort).
//   - Retailers: product pages listed under `retail` (price read from page meta).
//
// If a source fails, the previous listings from that source are kept (marked
// stale) so one bad night never empties the site.
//
// Usage: node scripts/update-listings.mjs [--dry-run]

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMERAS = path.join(ROOT, 'data/cameras.json');
const LISTINGS = path.join(ROOT, 'data/listings.json');
const HISTORY = path.join(ROOT, 'data/history.json');
const DRY_RUN = process.argv.includes('--dry-run');
const UA = 'SimpleSky/1.0 (+https://github.com/maruf2959-ctrl/simplesky; daily price check)';
const HISTORY_DAYS = 180;

// Titles containing any of these are accessories, spares or broken items.
const GLOBAL_EXCLUDE = [
  'for parts', 'spares', 'faulty', 'broken', 'not working', 'for repair', 'untested',
  'battery', 'charger', 'strap', 'screen protector', 'box only', 'empty box', 'lens only',
  'case for', 'bag for', 'manual', 'eyecup', 'grip', 'cable only', 'dummy', 'replacement',
  'shutter unit', 'mainboard', 'motherboard', 'lcd screen', 'body cap', 'remote', 'cover'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Alphabetic tokens match on letter boundaries ("pro" won't hit "protective");
// tokens with digits match as plain substrings ("585" hits "asi585mc").
function hasToken(title, token) {
  const t = token.toLowerCase();
  if (/^[a-z ]+$/.test(t)) return new RegExp(`(^|[^a-z])${escapeRe(t)}([^a-z]|$)`).test(title);
  return title.includes(t);
}

export function titleMatches(camera, rawTitle) {
  const title = rawTitle.toLowerCase();
  const m = camera.match || {};
  if ((m.all || []).some((t) => !hasToken(title, t))) return false;
  if ((m.any || []).length && !(m.any || []).some((t) => hasToken(title, t))) return false;
  if ((m.none || []).some((t) => hasToken(title, t))) return false;
  if (GLOBAL_EXCLUDE.some((t) => title.includes(t))) return false;
  return true;
}

async function fetchWithRetry(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(25000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(2000 * 2 ** i);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- eBay ----

async function ebayToken() {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetchWithRetry('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  if (!res.ok) throw new Error(`eBay token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function fetchEbay(cameras) {
  const token = await ebayToken();
  if (!token) throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set — add them as repository secrets');
  const out = [];
  for (const cam of cameras) {
    if (!cam.ebayQuery) continue;
    const [lo, hi] = cam.priceRange || [1, 2000];
    const filter = [
      `price:[${lo}..${hi}]`,
      'priceCurrency:GBP',
      'itemLocationCountry:GB',
      'buyingOptions:{FIXED_PRICE|AUCTION|BEST_OFFER}',
      // new, open box, refurbished grades, used. Excludes 7000 (for parts).
      'conditionIds:{1000|1500|2000|2010|2020|2030|2500|3000}'
    ].join(',');
    const params = new URLSearchParams({ q: cam.ebayQuery, filter, limit: '60', sort: 'price' });
    if (cam.ebayCategory) params.set('category_ids', cam.ebayCategory);
    const res = await fetchWithRetry(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=GB,zip=BN11',
        'User-Agent': UA
      }
    });
    if (!res.ok) throw new Error(`eBay search "${cam.ebayQuery}" HTTP ${res.status}`);
    const json = await res.json();
    for (const it of json.itemSummaries || []) {
      if (!titleMatches(cam, it.title || '')) continue;
      const isAuction = (it.buyingOptions || []).includes('AUCTION') && !(it.buyingOptions || []).includes('FIXED_PRICE');
      const price = Number((isAuction && it.currentBidPrice ? it.currentBidPrice : it.price)?.value);
      if (!Number.isFinite(price)) continue;
      const ship = it.shippingOptions?.[0]?.shippingCost?.value;
      out.push({
        id: `ebay:${it.itemId}`,
        source: 'eBay',
        cameraId: cam.id,
        title: it.title,
        price,
        shipping: ship != null ? Number(ship) : null,
        condition: it.condition || null,
        format: isAuction ? 'Auction' : 'Buy it now',
        endsAt: isAuction ? it.itemEndDate || null : null,
        url: it.itemWebUrl,
        image: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
        seller: it.seller ? `${it.seller.username} (${it.seller.feedbackPercentage ?? '?'}%, ${it.seller.feedbackScore ?? 0})` : null,
        location: it.itemLocation?.postalCode || it.itemLocation?.country || null
      });
    }
    await sleep(400);
  }
  return out;
}

// ----------------------------------------------------------------- CeX ----

async function fetchCex(cameras) {
  const out = [];
  for (const cam of cameras) {
    if (!cam.cexQuery) continue;
    const params = new URLSearchParams({ q: cam.cexQuery, firstRecord: '1', count: '50', sortBy: 'sellprice', sortOrder: 'asc' });
    const res = await fetchWithRetry(`https://wss2.cex.uk.webuy.io/v3/boxes?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`CeX HTTP ${res.status}`);
    const json = await res.json();
    for (const box of json?.response?.data?.boxes || []) {
      if (!titleMatches(cam, box.boxName || '')) continue;
      if (Number(box.ecomQuantityOnHand || 0) <= 0 && Number(box.outOfStock) === 1) continue;
      out.push({
        id: `cex:${box.boxId}`,
        source: 'CeX',
        cameraId: cam.id,
        title: box.boxName,
        price: Number(box.sellPrice),
        shipping: null,
        condition: `CeX grade ${String(box.boxName).match(/,\s*([ABC])\s*$/)?.[1] || ''}`.trim(),
        format: 'Buy it now',
        url: `https://uk.webuy.com/product-detail?id=${encodeURIComponent(box.boxId)}`,
        image: box.imageUrls?.medium || box.imageUrls?.large || null,
        seller: 'CeX (24-month warranty)',
        location: null
      });
    }
    await sleep(600);
  }
  return out;
}

// ------------------------------------------------------------ Retailers ----

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function parseRetailPage(html) {
  const meta = (prop) =>
    html.match(new RegExp(`(?:property|name)="${escapeRe(prop)}"\\s+content="([^"]+)"`, 'i'))?.[1] ||
    html.match(new RegExp(`content="([^"]+)"\\s+(?:property|name)="${escapeRe(prop)}"`, 'i'))?.[1];
  let price = Number(meta('product:price:amount'));
  if (!Number.isFinite(price) || price <= 0) price = Number(html.match(/"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)/)?.[1]);
  const availability = html.match(/"availability"\s*:\s*"[^"]*schema\.org\\?\/([A-Za-z]+)"/)?.[1] || null;
  // <title> first: some shops leave raw quotes (1.25") inside og:title.
  const title = decodeEntities((html.match(/<title>([^<]+)/i)?.[1] || meta('og:title') || '').split('|')[0].trim());
  const image = meta('og:image') || null;
  return { price: Number.isFinite(price) && price > 0 ? price : null, availability, title, image };
}

async function fetchRetail(cameras, accessories) {
  const pages = [
    ...cameras.flatMap((c) => (c.retail || []).map((r) => ({ ...r, cameraId: c.id }))),
    ...accessories.filter((a) => /\.html$/.test(a.url) && !/all-filters/.test(a.url)).map((a) => ({ store: 'First Light Optics', url: a.url, accessoryId: a.id }))
  ];
  const out = [];
  const errors = [];
  for (const p of pages) {
    try {
      const res = await fetchWithRetry(p.url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = parseRetailPage(await res.text());
      if (info.price == null) throw new Error('no price on page');
      out.push({
        id: `retail:${p.url}`,
        source: p.store,
        cameraId: p.cameraId || null,
        accessoryId: p.accessoryId || null,
        title: info.title,
        price: info.price,
        shipping: null,
        condition: 'New',
        format: 'Retail',
        inStock: info.availability ? /InStock|LimitedAvailability/i.test(info.availability) : null,
        url: p.url,
        image: info.image,
        seller: p.store,
        location: 'UK'
      });
    } catch (err) {
      errors.push(`${p.url}: ${err.message}`);
    }
    await sleep(1500);
  }
  if (!out.length && errors.length) throw new Error(errors[0]);
  return { items: out, warnings: errors };
}

// ---------------------------------------------------------------- main ----

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
}

async function main() {
  const catalogue = await readJson(CAMERAS, null);
  if (!catalogue) throw new Error('data/cameras.json missing or invalid');
  const previous = await readJson(LISTINGS, { listings: [], sources: {} });
  const history = await readJson(HISTORY, { days: {} });
  const now = new Date().toISOString();

  const sources = {
    eBay: () => fetchEbay(catalogue.cameras),
    CeX: () => fetchCex(catalogue.cameras),
    Retail: async () => fetchRetail(catalogue.cameras, catalogue.accessories || [])
  };

  const listings = [];
  const status = {};
  for (const [name, run] of Object.entries(sources)) {
    const prevForSource = previous.listings.filter((l) => (name === 'Retail' ? l.format === 'Retail' : l.source === name));
    try {
      const result = await run();
      const items = Array.isArray(result) ? result : result.items;
      const firstSeen = new Map(prevForSource.map((l) => [l.id, l.firstSeen]));
      for (const it of items) listings.push({ ...it, firstSeen: firstSeen.get(it.id) || now, lastSeen: now });
      status[name] = { ok: true, count: items.length, checkedAt: now, warnings: result.warnings?.slice(0, 5) || [] };
      console.log(`✓ ${name}: ${items.length} listings`);
    } catch (err) {
      // Keep yesterday's data rather than showing nothing.
      for (const l of prevForSource) listings.push({ ...l, stale: true });
      status[name] = {
        ok: false,
        count: prevForSource.length,
        checkedAt: now,
        lastSuccess: previous.sources?.[name]?.ok ? previous.sources[name].checkedAt : previous.sources?.[name]?.lastSuccess || null,
        error: String(err.message || err).slice(0, 300)
      };
      console.warn(`✗ ${name}: ${err.message}`);
    }
  }

  // De-duplicate and sort.
  const seen = new Set();
  const unique = listings.filter((l) => (seen.has(l.id) ? false : seen.add(l.id))).sort((a, b) => a.price - b.price);

  // Daily price stats per camera (used/second-hand market only, so new retail
  // prices don't drag the median around).
  const stats = {};
  for (const cam of catalogue.cameras) {
    const used = unique.filter((l) => l.cameraId === cam.id && l.format !== 'Retail' && !l.stale).map((l) => l.price);
    const retail = unique.find((l) => l.cameraId === cam.id && l.format === 'Retail');
    stats[cam.id] = {
      count: used.length,
      min: used.length ? Math.min(...used) : null,
      median: median(used),
      retail: retail?.price ?? null
    };
  }
  history.days[today()] = stats;
  const keep = Object.keys(history.days).sort().slice(-HISTORY_DAYS);
  history.days = Object.fromEntries(keep.map((d) => [d, history.days[d]]));

  const output = { generatedAt: now, sources: status, listings: unique };
  if (DRY_RUN) {
    console.log(JSON.stringify({ sources: status, sample: unique.slice(0, 5) }, null, 2));
    return;
  }
  await writeFile(LISTINGS, JSON.stringify(output, null, 2) + '\n');
  await writeFile(HISTORY, JSON.stringify(history, null, 2) + '\n');
  console.log(`Wrote ${unique.length} listings.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
