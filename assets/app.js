(function () {
  'use strict';

  const SITE = { lat: 50.8179, lon: -0.3728, tz: 'Europe/London' };
  const FL = 1500;

  // RA/Dec in degrees, size in arcminutes.
  const TARGETS = [
    { id: 'M42', name: 'M42 Orion Nebula', ra: 83.82, dec: -5.39, w: 65, h: 60, kind: 'nebula' },
    { id: 'M31', name: 'M31 Andromeda Galaxy', ra: 10.68, dec: 41.27, w: 178, h: 63, kind: 'galaxy' },
    { id: 'M51', name: 'M51 Whirlpool Galaxy', ra: 202.47, dec: 47.2, w: 11, h: 7, kind: 'galaxy' },
    { id: 'M81', name: "M81 Bode's Galaxy", ra: 148.89, dec: 69.07, w: 27, h: 14, kind: 'galaxy' },
    { id: 'M13', name: 'M13 Hercules Cluster', ra: 250.42, dec: 36.46, w: 20, h: 20, kind: 'cluster' },
    { id: 'M57', name: 'M57 Ring Nebula', ra: 283.4, dec: 33.03, w: 1.4, h: 1, kind: 'nebula' },
    { id: 'M27', name: 'M27 Dumbbell Nebula', ra: 299.9, dec: 22.72, w: 8, h: 5.7, kind: 'nebula' },
    { id: 'M1', name: 'M1 Crab Nebula', ra: 83.63, dec: 22.01, w: 7, h: 5, kind: 'nebula' },
    { id: 'M45', name: 'M45 Pleiades', ra: 56.75, dec: 24.12, w: 110, h: 110, kind: 'cluster' },
    { id: 'jupiter', name: 'Jupiter', planet: 'jupiter', kind: 'planet' },
    { id: 'saturn', name: 'Saturn', planet: 'saturn', kind: 'planet' }
  ];

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  };
  const gbp = (n) => (n == null ? '–' : '£' + (Math.round(n * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }));
  const fmtTime = (d) => d.toLocaleTimeString('en-GB', { timeZone: SITE.tz, hour: '2-digit', minute: '2-digit' });
  const ago = (iso) => {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 60) return `${mins} min ago`;
    if (mins < 60 * 36) return `${Math.round(mins / 60)} h ago`;
    return `${Math.round(mins / 1440)} days ago`;
  };

  const state = { cameras: [], accessories: [], listings: null, history: { days: {} } };

  // ------------------------------------------------------------- starfield
  function starfield() {
    const c = $('#sky');
    const ctx = c.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars = [];
    function resize() {
      c.width = innerWidth * devicePixelRatio;
      c.height = innerHeight * devicePixelRatio;
      const n = Math.round((innerWidth * innerHeight) / 2600);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        r: (Math.random() ** 3 * 1.6 + 0.3) * devicePixelRatio,
        p: Math.random() * Math.PI * 2,
        s: 0.4 + Math.random() * 1.2,
        hue: Math.random() < 0.15 ? 'rgba(255,214,150,' : Math.random() < 0.2 ? 'rgba(170,200,255,' : 'rgba(255,255,255,'
      }));
    }
    function draw(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of stars) {
        const a = reduce ? 0.7 : 0.45 + 0.4 * Math.sin(s.p + (t / 1000) * s.s);
        ctx.fillStyle = s.hue + a.toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) requestAnimationFrame(draw);
    }
    addEventListener('resize', resize);
    resize();
    requestAnimationFrame(draw);
  }

  // ----------------------------------------------------------------- data
  async function loadJson(url, fallback) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (e) {
      console.warn('Could not load', url, e);
      return fallback;
    }
  }

  const fov = (cam, fl = FL) => ({
    w: (cam.sensor.widthMm / fl) * 3437.75,
    h: (cam.sensor.heightMm / fl) * 3437.75
  });
  const scale = (cam, fl = FL) => (206.265 * cam.sensor.pixelUm) / fl;
  const cornerPx = (cam) => Math.hypot(cam.sensor.widthMm, cam.sensor.heightMm) / 2 / (cam.sensor.pixelUm / 1000);

  // ---------------------------------------------------------------- tonight
  function targetRaDec(t, date) {
    if (!t.planet) return t;
    const p = Astro.planetRaDec(t.planet, date);
    return { ...t, ra: p.ra, dec: p.dec, w: p.diameterArcsec / 60, h: p.diameterArcsec / 60, diam: p.diameterArcsec };
  }

  function darkWindow(now) {
    let start = null, end = null;
    for (let m = 0; m <= 24 * 60; m += 5) {
      const d = new Date(now.getTime() + m * 60000);
      const s = Astro.sunRaDec(d);
      const alt = Astro.altAz(s.ra, s.dec, d, SITE.lat, SITE.lon).alt;
      if (alt < -18 && !start) start = d;
      if (start && alt >= -18) { end = d; break; }
    }
    return { start, end };
  }

  function rotationLimit(cam, alt, az) {
    if (alt <= 0) return null;
    const w = Astro.fieldRotationRate(alt, az, SITE.lat);
    return 1 / (cornerPx(cam) * w);
  }

  const fmtSecs = (s) => (s == null ? '–' : s > 120 ? '>2 min' : s >= 10 ? Math.round(s) + ' s' : s.toFixed(1) + ' s');

  function fits(t, f) {
    const big = Math.max(t.w, t.h), small = Math.min(t.w, t.h);
    const fb = Math.max(f.w, f.h), fs = Math.min(f.w, f.h);
    if (big <= fb * 0.9 && small <= fs * 0.9) return ['Yes', 'ok'];
    if (big <= fb * 1.6) return ['Mostly', 'meh'];
    return ['Core only', 'bad'];
  }

  function renderTonight() {
    const now = new Date();
    $('#clock').textContent = now.toLocaleString('en-GB', { timeZone: SITE.tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' (UK time)';
    const dark = darkWindow(now);
    const sunNow = Astro.sunRaDec(now);
    const isDarkNow = Astro.altAz(sunNow.ra, sunNow.dec, now, SITE.lat, SITE.lon).alt < -18;
    $('#darkWindow').textContent = dark.start ? `${isDarkNow ? 'now' : fmtTime(dark.start)} → ${dark.end ? fmtTime(dark.end) : '…'}` : 'No full darkness';
    const mp = Astro.moonPhase(now);
    const phaseName = mp.age < 1.8 ? 'New' : mp.age < 6 ? 'Waxing crescent' : mp.age < 9 ? 'First quarter' : mp.age < 13.8 ? 'Waxing gibbous' : mp.age < 15.8 ? 'Full' : mp.age < 20.5 ? 'Waning gibbous' : mp.age < 23.5 ? 'Last quarter' : mp.age < 27.8 ? 'Waning crescent' : 'New';
    $('#moon').textContent = `${phaseName}, ${Math.round(mp.illum * 100)}% lit${mp.illum > 0.6 ? ', so favour planets and clusters' : mp.illum < 0.3 ? ', good for nebulae' : ''}`;
    state.dark = dark;

    const cam = state.cameras.find((c) => c.id === $('#rotCamera').value) || state.cameras[0];
    const f = fov(cam);
    const tb = $('#targetRows');
    tb.replaceChildren();
    const winStart = dark.start || now, winEnd = dark.end || new Date(now.getTime() + 12 * 3600000);
    for (const t0 of TARGETS) {
      const t = targetRaDec(t0, now);
      const cur = Astro.altAz(t.ra, t.dec, now, SITE.lat, SITE.lon);
      let best = { alt: -90 };
      for (let ms = winStart.getTime(); ms <= winEnd.getTime(); ms += 10 * 60000) {
        const d = new Date(ms);
        const p = Astro.altAz(t.ra, t.dec, d, SITE.lat, SITE.lon);
        if (p.alt > best.alt) best = { ...p, at: d };
      }
      const [fitTxt, fitCls] = fits(t, f);
      const up = cur.alt > 10;
      const bestTxt = best.alt > 15 ? `${Math.round(best.alt)}° at ${fmtTime(best.at)}` : 'Too low tonight';
      const extra = t.diam ? ` · ${t.diam.toFixed(1)}″` : '';
      tb.append(
        el('tr', { class: up ? '' : 'dim' },
          el('td', {}, el('strong', {}, t.name), el('span', { class: 'muted' }, extra)),
          el('td', {}, cur.alt > 0 ? `${Math.round(cur.alt)}° ${compass(cur.az)}` : 'below horizon'),
          el('td', {}, bestTxt),
          el('td', {}, el('span', { class: 'pill ' + fitCls }, t.kind === 'planet' ? 'Yes' : fitTxt)),
          el('td', {}, t.kind === 'planet' ? 'Video: n/a' : `${up ? fmtSecs(rotationLimit(cam, cur.alt, cur.az)) : '–'} / ${best.alt > 15 ? fmtSecs(rotationLimit(cam, best.alt, best.az)) : '–'}`)
        )
      );
    }
  }

  const compass = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];

  async function loadCloud() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${SITE.lat}&longitude=${SITE.lon}&hourly=cloud_cover&timezone=UTC&forecast_days=2`;
      const json = await (await fetch(url)).json();
      const times = json.hourly.time.map((t) => new Date(t + 'Z'));
      const start = state.dark?.start || new Date();
      const end = state.dark?.end || new Date(start.getTime() + 10 * 3600000);
      const hrs = times.map((t, i) => ({ t, c: json.hourly.cloud_cover[i] })).filter((h) => h.t >= new Date(start.getTime() - 3600000) && h.t <= end);
      if (!hrs.length) throw new Error('no hours');
      const avg = Math.round(hrs.reduce((a, h) => a + h.c, 0) / hrs.length);
      const best = hrs.reduce((a, h) => (h.c < a.c ? h : a));
      $('#cloud').textContent = `${avg}% average; clearest ${fmtTime(best.t)} (${best.c}%)`;
    } catch {
      $('#cloud').textContent = 'unavailable';
    }
  }

  // --------------------------------------------------------------- listings
  function medianFor(camId) {
    const prices = (state.listings?.listings || []).filter((l) => l.cameraId === camId && l.format !== 'Retail').map((l) => l.price).sort((a, b) => a - b);
    if (prices.length < 3) return null;
    const m = Math.floor(prices.length / 2);
    return prices.length % 2 ? prices[m] : (prices[m - 1] + prices[m]) / 2;
  }

  function renderSources() {
    const box = $('#sourceStatus');
    box.replaceChildren();
    const data = state.listings;
    if (!data) {
      $('#updated').textContent = 'No listings file yet. Run the updater.';
      return;
    }
    $('#updated').textContent = `Updated ${ago(data.generatedAt)} · ${data.listings.length} listings`;
    for (const [name, s] of Object.entries(data.sources || {})) {
      box.append(
        el('span', { class: 'src ' + (s.ok ? 'ok' : 'bad'), title: s.error || (s.warnings || []).join('\n') || '' },
          s.ok ? `● ${name}: ${s.count}` : `○ ${name}: ${s.error && /not set/.test(s.error) ? 'needs API key' : 'unavailable'}${s.count ? ` (showing ${s.count} from ${s.lastSuccess ? ago(s.lastSuccess) : 'earlier'})` : ''}`)
      );
    }
  }

  function renderListings() {
    const grid = $('#listingGrid');
    grid.replaceChildren();
    const data = state.listings;
    if (!data) return;
    const camF = $('#fCamera').value, budget = Number($('#fBudget').value) || Infinity, srcF = $('#fSource').value, sort = $('#fSort').value;
    const showAcc = $('#fAccessories').checked;
    const camById = Object.fromEntries(state.cameras.map((c) => [c.id, c]));
    let rows = data.listings.filter((l) => {
      if (l.accessoryId && !showAcc) return false;
      if (!l.cameraId && !l.accessoryId) return false;
      if (camF && l.cameraId !== camF) return false;
      if (srcF && l.source !== srcF) return false;
      return l.price + (l.shipping || 0) <= budget;
    });
    const deal = (l) => {
      const m = medianFor(l.cameraId);
      return m ? (l.price - m) / m : 0;
    };
    rows.sort((a, b) => {
      if (sort === 'deal') return deal(a) - deal(b);
      if (sort === 'new') return new Date(b.firstSeen) - new Date(a.firstSeen);
      if (sort === 'rank') return (camById[a.cameraId]?.rank ?? 99) - (camById[b.cameraId]?.rank ?? 99) || a.price - b.price;
      return a.price - b.price;
    });
    if (!rows.length) {
      grid.append(el('p', { class: 'empty' }, 'No listings match. Try a higher budget, or turn on accessories. If eBay shows "needs API key", see the README.'));
      return;
    }
    for (const l of rows.slice(0, 120)) {
      const cam = camById[l.cameraId];
      const m = medianFor(l.cameraId);
      const pct = m ? Math.round(((l.price - m) / m) * 100) : null;
      const isNew = Date.now() - new Date(l.firstSeen) < 36 * 3600000;
      grid.append(
        el('a', { class: 'listing' + (l.stale ? ' stale' : ''), href: l.url, target: '_blank', rel: 'noopener' },
          el('div', { class: 'thumb' }, l.image ? el('img', { src: l.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : el('span', {}, '✦')),
          el('div', { class: 'body' },
            el('div', { class: 'tags' },
              el('span', { class: 'tag src-' + l.source.replace(/\W/g, '').toLowerCase() }, l.source),
              cam ? el('span', { class: 'tag' }, `#${cam.rank} ${cam.name.replace(/\s*\(.*\)/, '')}`) : el('span', { class: 'tag' }, 'Accessory'),
              isNew ? el('span', { class: 'tag new' }, 'New today') : null,
              l.inStock === false ? el('span', { class: 'tag bad' }, 'Out of stock') : null,
              l.stale ? el('span', { class: 'tag bad' }, 'Not re-checked') : null
            ),
            el('h4', {}, l.title),
            el('div', { class: 'price' },
              el('strong', {}, gbp(l.price)),
              l.shipping ? el('span', { class: 'muted' }, ` + ${gbp(l.shipping)} post`) : l.shipping === 0 ? el('span', { class: 'muted' }, ' free post') : null,
              pct != null && pct <= -10 ? el('span', { class: 'deal' }, `${-pct}% below median`) : null
            ),
            el('div', { class: 'meta' }, [l.condition, l.format, l.endsAt ? 'ends ' + new Date(l.endsAt).toLocaleString('en-GB', { timeZone: SITE.tz, weekday: 'short', hour: '2-digit', minute: '2-digit' }) : null, l.seller].filter(Boolean).join(' · '))
          )
        )
      );
    }
  }

  function manualLinks() {
    const box = $('#manualLinks');
    for (const c of state.cameras) {
      const q = encodeURIComponent(c.cexQuery || c.name);
      box.append(el('a', { class: 'chip', href: `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&LH_PrefLoc=1&_sop=15`, target: '_blank', rel: 'noopener' }, `eBay: ${c.name.replace(/\s*\(.*\)/, '')}`));
      for (const s of c.searchLinks || []) box.append(el('a', { class: 'chip', href: s.url, target: '_blank', rel: 'noopener' }, `${s.store}: ${decodeURIComponent(s.url.split('q=')[1] || c.name)}`));
      box.append(el('a', { class: 'chip', href: `https://uk.webuy.com/search?stext=${q}`, target: '_blank', rel: 'noopener' }, `CeX: ${c.name.replace(/\s*\(.*\)/, '')}`));
    }
    box.append(el('a', { class: 'chip', href: 'https://www.astrobuysell.com/uk/', target: '_blank', rel: 'noopener' }, 'Astro Buy Sell UK (classifieds)'));
    box.append(el('a', { class: 'chip', href: 'https://stargazerslounge.com/forum/48-for-sale-astronomy-equipment/', target: '_blank', rel: 'noopener' }, 'Stargazers Lounge classifieds'));
  }

  // ---------------------------------------------------------------- ranking
  function sparkline(camId) {
    const days = Object.keys(state.history.days || {}).sort().slice(-60);
    const pts = days.map((d) => state.history.days[d]?.[camId]?.median).map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (pts.length < 2) return el('span', { class: 'muted' }, pts.length ? gbp(pts[0][1]) + ' median' : 'collecting…');
    const ys = pts.map((p) => p[1]);
    const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
    const W = 90, H = 24, n = days.length - 1 || 1;
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${((x / n) * W).toFixed(1)},${(H - 2 - ((y - lo) / span) * (H - 4)).toFixed(1)}`).join('');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'spark');
    svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5"/><title>Median used price, last ${days.length} days: ${gbp(ys[0])} → ${gbp(ys[ys.length - 1])}</title>`;
    return svg;
  }

  const stars = (n) => el('span', { class: 'stars', 'aria-label': `${n} out of 5` }, '★'.repeat(n) + '☆'.repeat(5 - n));

  function priceCell(c) {
    const retail = state.listings?.listings.find((l) => l.cameraId === c.id && l.format === 'Retail');
    const m = medianFor(c.id);
    const parts = [];
    if (retail) parts.push(el('div', {}, `${gbp(retail.price)} new`, el('span', { class: 'muted' }, ' (FLO, live)')));
    else if (c.priceRef.new) parts.push(el('div', {}, `${gbp(c.priceRef.new)} new`));
    if (m) parts.push(el('div', {}, `${gbp(m)} used`, el('span', { class: 'muted' }, ' (live median)')));
    else if (c.priceRef.usedLow) parts.push(el('div', { class: 'muted' }, `${gbp(c.priceRef.usedLow)}–${gbp(c.priceRef.usedHigh)} used*`));
    return parts;
  }

  function renderRanking() {
    const tb = $('#rankRows');
    tb.replaceChildren();
    for (const c of state.cameras) {
      const f = fov(c);
      tb.append(
        el('tr', {},
          el('td', { class: 'rk' }, c.rank),
          el('td', {}, el('strong', {}, c.name), el('div', { class: 'muted small' }, c.badge)),
          el('td', {}, priceCell(c)),
          el('td', {}, scale(c).toFixed(2) + '″/px'),
          el('td', {}, `${f.w.toFixed(0)}′ × ${f.h.toFixed(0)}′`),
          el('td', {}, stars(c.planetary)),
          el('td', {}, stars(c.deepSky)),
          el('td', {}, sparkline(c.id))
        )
      );
    }
    tb.append(el('tr', {}, el('td', { colspan: 8, class: 'muted small' }, '* Typical used range from research. The live median replaces it once there are 3 or more listings. Scale is per pixel at prime focus.')));

    const cards = $('#cameraCards');
    cards.replaceChildren();
    for (const c of state.cameras) {
      cards.append(
        el('details', { class: 'camcard' },
          el('summary', {}, el('span', { class: 'rk' }, '#' + c.rank), ' ', c.name, el('span', { class: 'badge' }, c.badge)),
          el('div', { class: 'camgrid' },
            el('div', {}, el('h5', {}, 'Strengths'), el('ul', { class: 'pros' }, c.strengths.map((s) => el('li', {}, s)))),
            el('div', {}, el('h5', {}, 'Weaknesses'), el('ul', { class: 'cons' }, c.weaknesses.map((s) => el('li', {}, s))))
          ),
          el('p', {}, el('strong', {}, 'Sensor: '), `${c.sensor.model}, ${c.sensor.resolution}, ${c.sensor.pixelUm} µm pixels, ≈${c.sensor.readNoiseE} e⁻ read noise${c.sensor.cooled ? ', cooled' : ''}.`),
          el('p', {}, el('strong', {}, 'Connecting to the 127 SLT: '), c.adapters),
          el('p', { class: 'muted small' }, c.priceRef.usedNote || '')
        )
      );
    }
  }

  // ---------------------------------------------------------------- framing
  function renderFraming() {
    const cam = state.cameras.find((c) => c.id === $('#frCamera').value);
    const fl = Number($('#frOptics').value);
    const t0 = TARGETS.find((t) => t.id === $('#frTarget').value);
    const t = targetRaDec(t0, new Date());
    const f = fov(cam, fl);
    const svg = $('#frSvg');
    const W = 600, H = 400;
    const span = Math.max(f.w * 1.25, t.w * 1.15, f.h * 1.25 * 1.5, t.h * 1.15 * 1.5);
    const k = W / span;
    const cx = W / 2, cy = H / 2;
    const tw = (t.w * k) / 2, th = (t.h * k) / 2;
    const fw = f.w * k, fh = f.h * k;
    const shape = t.kind === 'planet'
      ? `<circle cx="${cx}" cy="${cy}" r="${Math.max(tw, 1.5)}" fill="url(#gPlanet)"/>`
      : t.kind === 'galaxy'
        ? `<ellipse cx="${cx}" cy="${cy}" rx="${tw}" ry="${th}" fill="url(#gGalaxy)" transform="rotate(-30 ${cx} ${cy})"/>`
        : t.kind === 'cluster'
          ? Array.from({ length: 70 }, (_, i) => { const a = i * 2.4, r = Math.sqrt(i / 70) * tw; return `<circle cx="${cx + r * Math.cos(a)}" cy="${cy + r * Math.sin(a) * (th / tw)}" r="${Math.max(1, 2.2 - r / tw * 1.5)}" fill="#fff6dd"/>`; }).join('')
          : `<ellipse cx="${cx}" cy="${cy}" rx="${tw}" ry="${th}" fill="url(#gNeb)"/>`;
    svg.innerHTML = `
      <defs>
        <radialGradient id="gNeb"><stop offset="0" stop-color="#ffe8f2"/><stop offset=".25" stop-color="#ff7aa8" stop-opacity=".85"/><stop offset=".7" stop-color="#5fb7c9" stop-opacity=".35"/><stop offset="1" stop-color="#5fb7c9" stop-opacity="0"/></radialGradient>
        <radialGradient id="gGalaxy"><stop offset="0" stop-color="#fff4d6"/><stop offset=".3" stop-color="#d9c7a0" stop-opacity=".7"/><stop offset="1" stop-color="#8aa0d0" stop-opacity="0"/></radialGradient>
        <radialGradient id="gPlanet"><stop offset="0" stop-color="#fbe3b8"/><stop offset="1" stop-color="#c99a5e"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="#04060f"/>
      ${shape}
      <rect x="${cx - fw / 2}" y="${cy - fh / 2}" width="${fw}" height="${fh}" fill="none" stroke="#ffd479" stroke-width="2" stroke-dasharray="6 4"/>
      <text x="${cx - fw / 2 + 6}" y="${cy - fh / 2 - 6}" fill="#ffd479" font-size="13">${cam.name.replace(/\s*\(.*\)/, '')} @ ${fl} mm</text>
      <text x="12" y="${H - 12}" fill="#9fb0d8" font-size="12">${t.name} · ${t.w < 1 ? (t.w * 60).toFixed(0) + '″' : t.w.toFixed(0) + '′ × ' + t.h.toFixed(0) + '′'}</text>`;
    const fr = fl / 127;
    const pctOfFrame = t.kind === 'planet' ? `${((t.diam / (scale(cam, fl))) | 0)} px across` : `${Math.round((Math.min(t.w, f.w) * Math.min(t.h, f.h)) / (t.w * t.h) * 100)}% of target in frame`;
    $('#frStats').innerHTML = `
      <dt>Field</dt><dd>${f.w.toFixed(1)}′ × ${f.h.toFixed(1)}′</dd>
      <dt>Image scale</dt><dd>${scale(cam, fl).toFixed(2)}″/px</dd>
      <dt>Focal ratio</dt><dd>f/${fr.toFixed(1)} (${((fr / 4) ** 2).toFixed(1)}× slower than f/4)</dd>
      <dt>Target</dt><dd>${pctOfFrame}</dd>
      ${t.kind === 'planet' ? `<dt>Ideal f-ratio</dt><dd>≈f/${(cam.sensor.pixelUm * 5).toFixed(0)} for ${cam.sensor.pixelUm} µm</dd>` : ''}`;
  }

  // -------------------------------------------------------------------- kit
  function accPrice(id) {
    const live = state.listings?.listings.find((l) => l.accessoryId === id);
    const a = state.accessories.find((x) => x.id === id);
    return { price: live?.price ?? a?.price ?? 0, url: a?.url, name: a?.name, live: !!live, approx: a?.approx };
  }
  function camPrice(id, used) {
    const c = state.cameras.find((x) => x.id === id);
    if (used) return medianFor(id) ?? Math.round((c.priceRef.usedLow + c.priceRef.usedHigh) / 2);
    const retail = state.listings?.listings.find((l) => l.cameraId === id && l.format === 'Retail');
    return retail?.price ?? c.priceRef.new;
  }

  function renderKits() {
    const kits = [
      { title: 'Planetary: ZWO ASI662MC', lines: [['ZWO ASI662MC (includes 1.25″ nosepiece)', camPrice('asi662mc'), 'https://www.firstlightoptics.com/zwo-cameras/zwo-asi-662mc-usb-3-camera.html'], ['acc:uvir'], ['Your existing 2× Barlow', 0]], chain: 'Visual back → (2× Barlow, good nights only) → UV/IR filter → ASI662MC. Remove the star diagonal.' },
      { title: 'All-rounder: ZWO ASI585MC', lines: [['ZWO ASI585MC (includes 1.25″ nosepiece)', camPrice('asi585mc'), 'https://www.firstlightoptics.com/zwo-cameras/zwo-asi-585mc-usb-3-camera.html'], ['acc:uvir'], ['acc:reducer'], ['Bahtinov mask 127 mm (approx.)', 20]], chain: 'Planets: visual back → UV/IR filter → camera. Deep sky: visual back → 0.5× reducer screwed onto the nosepiece → camera. Plate-solve to measure the true reduction (≈0.55–0.65×).' },
      { title: 'Budget deep sky: used Canon 600D', lines: [['Used Canon 600D body (live median / typical)', camPrice('canon-600d', true), 'https://www.mpb.com/en-uk/search?q=canon%20eos%20600d'], ['acc:t-ring'], ['acc:nosepiece'], ['Canon-compatible intervalometer (approx.)', 15]], chain: 'Visual back → 1.25″ T-nosepiece → Canon EF T-ring → 600D. For planets: visual back → 2× Barlow → nosepiece → T-ring → 600D, using 640×480 movie crop.' },
      { title: 'Wide-field M42 / M31 (the alternative)', lines: [['Used Canon 600D body', camPrice('canon-600d', true)], ['acc:gti'], ['Used Canon EF-S 55–250 IS STM (approx.)', 90], ['Ball head (approx.)', 25]], chain: 'Tripod → Star Adventurer GTi (polar aligned) → ball head → 600D + lens at 135–250 mm, f/5.6, 30–120 s subs.' }
    ];
    const box = $('#kitTables');
    box.replaceChildren();
    for (const k of kits) {
      let total = 0;
      const rows = k.lines.map((ln) => {
        let [name, price, url] = ln;
        let note = '';
        if (name.startsWith('acc:')) {
          const a = accPrice(name.slice(4));
          [name, price, url] = [a.name, a.price, a.url];
          note = a.live ? ' (live)' : a.approx ? ' (approx.)' : '';
        }
        total += price || 0;
        return el('tr', {}, el('td', {}, url ? el('a', { href: url, target: '_blank', rel: 'noopener' }, name) : name), el('td', { class: 'num' }, price ? gbp(price) + note : 'owned'));
      });
      box.append(
        el('div', { class: 'kit' },
          el('h3', {}, k.title),
          el('table', { class: 'plain' }, el('tbody', {}, rows, el('tr', { class: 'total' }, el('td', {}, 'Total'), el('td', { class: 'num' }, '≈' + gbp(Math.round(total)))))),
          el('p', { class: 'chain' }, k.chain)
        )
      );
    }
  }

  // ------------------------------------------------------------------- init
  async function init() {
    starfield();
    const [cat, listings, history] = await Promise.all([
      loadJson('data/cameras.json', null),
      loadJson('data/listings.json', null),
      loadJson('data/history.json', { days: {} })
    ]);
    if (!cat) {
      document.querySelector('main').prepend(el('p', { class: 'empty' }, 'Could not load data/cameras.json. Open the site through a web server (see the README), not as a file.'));
      return;
    }
    state.cameras = cat.cameras.sort((a, b) => a.rank - b.rank);
    state.accessories = cat.accessories || [];
    state.listings = listings;
    state.history = history;

    for (const sel of ['#rotCamera', '#frCamera', '#fCamera']) {
      for (const c of state.cameras) $(sel).append(el('option', { value: c.id }, c.name));
    }
    $('#frCamera').value = 'canon-600d';
    for (const t of TARGETS) $('#frTarget').append(el('option', { value: t.id }, t.name));
    const sources = [...new Set((listings?.listings || []).map((l) => l.source))].sort();
    for (const s of sources) $('#fSource').append(el('option', { value: s }, s));

    renderTonight();
    loadCloud();
    renderSources();
    renderListings();
    manualLinks();
    renderRanking();
    renderFraming();
    renderKits();

    $('#rotCamera').addEventListener('change', renderTonight);
    for (const id of ['#fCamera', '#fBudget', '#fSource', '#fSort', '#fAccessories']) $(id).addEventListener('change', renderListings);
    for (const id of ['#frCamera', '#frOptics', '#frTarget']) $(id).addEventListener('change', renderFraming);
    setInterval(renderTonight, 5 * 60000);
  }

  init();
})();
