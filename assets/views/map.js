// Location & sky tab: set where you observe from, see light pollution on a live map,
// and the conditions a stargazer cares about.
(function () {
  'use strict';
  const { el, fmtTime } = App;

  const BORTLE = [
    [1, '#0a0a1a', 'Excellent dark site', 'Zodiacal light, Milky Way casts shadows.'],
    [2, '#1a1f4a', 'Truly dark', 'Milky Way highly structured.'],
    [3, '#173a6b', 'Rural', 'Some glow on the horizon; Milky Way still complex.'],
    [4, '#1f6b3a', 'Rural/suburban transition', 'Light domes over towns; Milky Way visible but less detail.'],
    [5, '#6b8a1f', 'Suburban', 'Milky Way weak overhead; M31 easy, M33 hard.'],
    [6, '#b39b12', 'Bright suburban', 'Milky Way only at the zenith on good nights.'],
    [7, '#b3621f', 'Suburban/urban', 'Sky grey-orange; Milky Way invisible.'],
    [8, '#a8321f', 'City', 'Only bright clusters and the planets stand out.'],
    [9, '#c21f5a', 'Inner city', 'Moon, planets and bright stars only.']
  ];
  const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';

  // NASA Black Marble night-lights tiles, cached as canvases so many points can be sampled.
  const tileCache = new Map();
  function tileCtx(tx, ty) {
    const key = `${tx}/${ty}`;
    if (!tileCache.has(key)) {
      tileCache.set(key, (async () => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = GIBS.replace('{z}', 8).replace('{y}', ty).replace('{x}', tx);
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx;
      })().catch((e) => { tileCache.delete(key); throw e; }));
    }
    return tileCache.get(key);
  }

  // Average night-lights brightness (0–255) in a small box around a point (zoom-8 pixels ≈ 400 m).
  async function lightsAt(lat, lon, r) {
    const n = 256;
    const x = ((lon + 180) / 360) * n;
    const y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
    const tx = Math.floor(x), ty = Math.floor(y);
    const ctx = await tileCtx(tx, ty);
    const px = Math.floor((x - tx) * 256), py = Math.floor((y - ty) * 256);
    const x0 = Math.max(0, px - r), y0 = Math.max(0, py - r), x1 = Math.min(255, px + r), y1 = Math.min(255, py + r);
    const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return sum / (d.length / 4);
  }

  // Calibrated by eye against UK sites (Kielder ≈2, rural Norfolk ≈3–4, Worthing ≈6–7, London 8–9).
  const bortleFromLights = (v) => (v < 12 ? 2 : v < 25 ? 3 : v < 45 ? 4 : v < 90 ? 5 : v < 170 ? 6 : v < 235 ? 7 : v < 250 ? 8 : 9);

  async function estimateBortle(lat, lon) {
    const v = 0.6 * (await lightsAt(lat, lon, 1)) + 0.4 * (await lightsAt(lat, lon, 6));
    return { bortle: bortleFromLights(v), value: Math.round(v) };
  }

  // ------------------------------------------------- forecast grid (stargazing map)
  // A 9×9 grid of forecast points (≈20 km apart) around the site, fetched in one request.
  const GRID_N = 9, GRID_DLAT = 0.18, GRID_DLON = 0.28;
  let gridCache = null;
  async function forecastGrid(loc) {
    const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
    if (gridCache?.key === key && Date.now() - gridCache.at < 30 * 60000) return gridCache.cells;
    const pts = [];
    const half = (GRID_N - 1) / 2;
    for (let i = 0; i < GRID_N; i++)
      for (let j = 0; j < GRID_N; j++) pts.push({ lat: +(loc.lat + (i - half) * GRID_DLAT).toFixed(3), lon: +(loc.lon + (j - half) * GRID_DLON).toFixed(3) });
    const params = new URLSearchParams({
      latitude: pts.map((p) => p.lat).join(','),
      longitude: pts.map((p) => p.lon).join(','),
      hourly: 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_speed_250hPa,precipitation_probability,visibility',
      timezone: 'UTC', forecast_days: '2', wind_speed_unit: 'mph'
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const json = await res.json();
    const cells = (Array.isArray(json) ? json : [json]).map((d, idx) => {
      const h = d.hourly;
      return {
        ...pts[idx],
        sea: d.elevation === 0, // the forecast model's terrain height is exactly 0 over the sea
        hours: h.time.map((t, i) => ({ t: new Date(t + 'Z'), cloud: h.cloud_cover[i], low: h.cloud_cover_low[i], mid: h.cloud_cover_mid[i], high: h.cloud_cover_high[i], rh: h.relative_humidity_2m[i], wind: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i], jet: h.wind_speed_250hPa[i], rain: h.precipitation_probability[i], vis: h.visibility[i] }))
      };
    });
    // Light pollution for each cell (best effort; the forecast still works without it).
    await Promise.all(cells.map(async (c) => { c.bortle = await lightsAt(c.lat, c.lon, 4).then(bortleFromLights).catch(() => null); }));
    gridCache = { key, at: Date.now(), cells };
    return cells;
  }

  function skyCtx(date, loc, bortle) {
    const sun = Astro.sunRaDec(date);
    const m = Astro.moonRaDec(date);
    return { sunAlt: Astro.altAz(sun.ra, sun.dec, date, loc.lat, loc.lon).alt, moonAlt: Astro.moonAltAz(date, loc.lat, loc.lon).alt, moonIllum: m.illum, bortle };
  }

  const distDir = (a, b) => {
    const dy = (b.lat - a.lat) * 111, dx = (b.lon - a.lon) * 111 * Math.cos((a.lat * Math.PI) / 180);
    return `${Math.round(Math.hypot(dx, dy))} km ${App.compass((Math.atan2(dx, dy) * 180) / Math.PI + 360)}`;
  };

  async function geocode(q) {
    const pc = q.trim().toUpperCase();
    if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(pc) || /^[A-Z]{1,2}\d[A-Z\d]?$/.test(pc)) {
      const full = /\d[A-Z]{2}$/.test(pc.replace(/\s/g, ''));
      const url = full ? `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}` : `https://api.postcodes.io/outcodes/${encodeURIComponent(pc)}`;
      const r = await fetch(url).then((x) => x.json()).catch(() => null);
      if (r?.result) return [{ name: `${pc}, ${r.result.admin_district?.[0] || r.result.admin_district || r.result.parish || 'UK'}`, lat: r.result.latitude, lon: r.result.longitude }];
    }
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`).then((x) => x.json()).catch(() => null);
    return (r?.results || []).map((p) => ({ name: [p.name, p.admin1, p.country_code].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude }));
  }

  let map = null;
  let marker = null;

  function setSite(loc, auto = true) {
    App.setLocation(loc);
    if (auto) estimateBortle(loc.lat, loc.lon).then((r) => App.setLocation({ bortle: r.bortle, bortleAuto: true, nightLights: r.value })).catch(() => {});
  }

  async function render(section) {
    const loc = App.location();
    section.replaceChildren();

    // Search + GPS.
    const input = el('input', { type: 'search', placeholder: 'Town, place or UK postcode', 'aria-label': 'Search location' });
    const results = el('div', { class: 'results' });
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return results.replaceChildren();
      timer = setTimeout(async () => {
        const hits = await geocode(q);
        results.replaceChildren(...(hits.length ? hits.map((h) => el('button', { onclick: () => setSite(h) }, h.name, el('small', {}, `${h.lat.toFixed(3)}, ${h.lon.toFixed(3)}`))) : [el('p', { class: 'small muted' }, 'No matches.')]));
      }, 350);
    });
    const status = el('p', { class: 'small', style: 'color:var(--bad);margin:0.4rem 0 0', role: 'status' });
    const gps = el('button', { class: 'btn', onclick: () => {
      if (!navigator.geolocation) return (status.textContent = 'Location isn’t available on this device. Search for your town instead.');
      gps.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(
        (p) => setSite({ name: 'My location', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
        () => { gps.textContent = '📍 Use my location'; status.textContent = 'Couldn’t get your location. Check location permissions, or search for your town.'; },
        { enableHighAccuracy: false, timeout: 15000 });
    } }, '📍 Use my location');

    if (App.embed) {
      section.append(manualLocation(loc));
      section.append(bortleCard(loc));
      return conditionsCard(section, loc);
    }

    section.append(el('div', { class: 'card' },
      el('p', { class: 'kicker' }, 'Observing from'),
      el('h2', { style: 'margin:0' }, loc.name),
      el('p', { class: 'small muted', style: 'margin:0.2rem 0 0.7rem' }, `${loc.lat.toFixed(3)}°, ${loc.lon.toFixed(3)}° · tap the map (or a square) to move the pin`),
      el('div', { class: 'row wrap' }, el('div', { class: 'grow', style: 'flex-basis:200px' }, input), gps),
      status,
      results));

    // Tonight's rating for this spot, with an hour slider shared by the forecast map.
    const hours = await App.weather();
    const night = App.night();
    const from = new Date((night.sunset || night.start).getTime() - 3600000);
    const to = new Date((night.sunrise || night.end).getTime() + 3600000);
    const win = (hours || []).filter((h) => h.t >= from && h.t <= to);
    const ratings = win.map((h) => Sky.rate(h, skyCtx(h.t, loc, loc.bortle)));
    const bestI = ratings.reduce((b, r, k) => (r.score > (ratings[b]?.score ?? -1) ? k : b), 0);
    const nowI = win.findIndex((h) => Math.abs(h.t - Date.now()) < 30 * 60000);
    let idx = nowI >= 0 ? nowI : Math.max(0, win.findIndex((h) => h.t >= night.start));
    const ratingCard = el('div', { class: 'card rating-card' });
    const slider = el('input', { type: 'range', min: 0, max: Math.max(0, win.length - 1), value: idx, id: 'hourSlider', 'aria-label': 'Forecast hour' });
    const sliderLabel = el('span', { class: 'slider-time' });
    slider.addEventListener('input', () => { idx = Number(slider.value); update(); });
    section.append(ratingCard);

    // Map with the stargazing forecast grid and light pollution.
    const mapBox = el('div', { id: 'leafletMap', role: 'application', 'aria-label': 'Map with stargazing forecast and light pollution layers' });
    const fcToggle = el('input', { type: 'checkbox', checked: App.store.get('forecastLayer', true), id: 'fcToggle' });
    const lpToggle = el('input', { type: 'checkbox', checked: App.store.get('lightLayer', false), id: 'lpToggle' });
    const bestLine = el('div', { class: 'best-spot' });
    section.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, 'Stargazing map'), el('span', { class: 'small muted' }, win.length ? 'Forecast · updates when opened' : '')),
      el('div', { class: 'row wrap', style: 'gap:0.4rem 1rem;margin:0 0 0.6rem' },
        el('label', { class: 'row small' }, fcToggle, 'Sky forecast'),
        el('label', { class: 'row small' }, lpToggle, 'Light pollution')),
      mapBox,
      el('div', { class: 'legend' }, [[85, 'Excellent'], [70, 'Good'], [50, 'Fair'], [30, 'Poor'], [10, 'Bad']].map(([sc, t]) => el('span', {}, el('i', { style: `background:${Sky.colorFor(sc)}` }), t)), el('span', {}, 'Each square ≈ 20 km (faint over the sea). Tap one for details.')),
      bestLine));

    let grid = null; // { layer, cells, rects }
    function update() {
      if (!win.length) {
        ratingCard.replaceChildren(el('h2', {}, 'Tonight’s stargazing rating'), el('p', { class: 'muted' }, App.embed ? 'Live forecasts aren’t available in this version.' : 'Forecast unavailable right now. Check your connection.'));
        return;
      }
      const h = win[idx];
      const r = ratings[idx];
      sliderLabel.textContent = `${fmtTime(h.t)}${idx === nowI ? ' (now)' : ''}`;
      ratingCard.replaceChildren(
        el('div', { class: 'card-head' }, el('h2', {}, 'Stargazing rating'), el('span', { class: 'small muted' }, loc.name.split(',')[0])),
        el('div', { class: 'verdict-big' }, App.scoreRing(r.score, 'Stargazing rating'), el('div', {}, el('h3', { style: 'margin:0' }, r.verdict), el('p', { class: 'small muted', style: 'margin:0.2rem 0 0' }, `For ${fmtTime(h.t)}. Drag the slider to see other hours.`))),
        el('div', { class: 'slider-row' }, el('span', { class: 'small muted' }, fmtTime(win[0].t)), slider, el('span', { class: 'small muted' }, fmtTime(win[win.length - 1].t))),
        el('div', { class: 'row wrap', style: 'justify-content:space-between;gap:0.4rem' }, sliderLabel,
          el('button', { class: 'btn small', onclick: () => { idx = bestI; slider.value = idx; update(); } }, `Best hour: ${fmtTime(win[bestI].t)} (${ratings[bestI].score})`)),
        el('div', { class: 'factors' }, r.parts.map((f) => el('div', { class: 'factor' },
          el('div', { class: 'factor-top' }, el('span', {}, f.name), el('strong', { style: `color:${Sky.colorFor(f.score)}` }, f.score)),
          el('div', { class: 'bar' }, el('i', { style: `width:${f.score}%;background:${Sky.colorFor(f.score)}` })),
          el('div', { class: 'small muted' }, f.text)))));
      paintGrid();
    }

    function paintGrid() {
      if (!grid || !win.length) return;
      const t = win[idx].t.getTime();
      let best = null;
      grid.cells.forEach((c, k) => {
        const ch = c.hours.find((x) => Math.abs(x.t - t) < 30 * 60000);
        c.now = ch ? Sky.rate(ch, skyCtx(win[idx].t, c, c.bortle ?? loc.bortle)) : null;
        const sc = c.now?.score;
        grid.rects[k].setStyle({ fillColor: sc == null ? '#555' : Sky.colorFor(sc), fillOpacity: sc == null ? 0.1 : c.sea ? 0.18 : 0.42 });
        if (sc != null && !c.sea && (!best || sc > best.now.score)) best = c;
      });
      bestLine.replaceChildren(...(best ? [
        el('span', {}, `🏆 Best nearby at ${fmtTime(win[idx].t)}: `, el('strong', {}, `${best.now.score}`), ` · ${distDir(loc, best)}${best.bortle ? ` · Bortle ${best.bortle}` : ''}`),
        el('button', { class: 'btn small', onclick: () => map?.flyTo([best.lat, best.lon], 10) }, 'Show'),
        el('button', { class: 'btn small', onclick: () => setSite({ name: `Dark spot ${distDir(loc, best)} of ${loc.name.split(',')[0]}`, lat: best.lat, lon: best.lon }) }, 'Use this spot')
      ] : []));
    }

    update();
    if (!App.embed) initMap(mapBox, loc, { fcToggle, lpToggle }, (m) => {
      forecastGrid(loc).then((cells) => {
        const layer = L.layerGroup();
        const rects = cells.map((c) => L.rectangle([[c.lat - GRID_DLAT / 2, c.lon - GRID_DLON / 2], [c.lat + GRID_DLAT / 2, c.lon + GRID_DLON / 2]], { weight: 0, fillOpacity: 0.4, interactive: true })
          .on('click', () => {
            const r = c.now;
            L.popup().setLatLng([c.lat, c.lon]).setContent(r ? `<strong>${r.score}/100</strong> · ${App.esc(r.verdict)}<br>${r.parts.map((f) => `${f.name}: ${f.score}`).join(' · ')}<br><small>${distDir(loc, c)}${c.bortle ? ` · Bortle ${c.bortle}` : ''}</small><br><button class="btn small" data-lat="${c.lat}" data-lon="${c.lon}" data-name="${App.esc(distDir(loc, c))}">Observe from here</button>` : 'No data').openOn(m);
          })
          .addTo(layer));
        grid = { layer, cells, rects };
        m.on('popupopen', (e) => {
          const b = e.popup.getElement()?.querySelector('button[data-lat]');
          b?.addEventListener('click', () => setSite({ name: `Spot ${b.dataset.name} of ${loc.name.split(',')[0]}`, lat: Number(b.dataset.lat), lon: Number(b.dataset.lon) }));
        });
        if (fcToggle.checked) layer.addTo(m);
        fcToggle.addEventListener('change', () => { App.store.set('forecastLayer', fcToggle.checked); fcToggle.checked ? layer.addTo(m) : m.removeLayer(layer); });
        paintGrid();
      }).catch(() => bestLine.replaceChildren(el('span', { class: 'small muted' }, 'The forecast map couldn’t load. Try again later.')));
    });

    section.append(bortleCard(loc));
    await conditionsCard(section, loc);
  }

  // Embedded hosts block GPS, place search and map tiles, so offer places and coordinates.
  const PRESETS = [
    { name: 'Worthing, West Sussex', lat: 50.8179, lon: -0.3728, bortle: 6 },
    { name: 'Brighton', lat: 50.8225, lon: -0.1372, bortle: 7 },
    { name: 'Ditchling Beacon, South Downs', lat: 50.9006, lon: -0.1066, bortle: 4 },
    { name: 'London', lat: 51.5072, lon: -0.1276, bortle: 9 },
    { name: 'Exmoor Dark Sky Reserve', lat: 51.13, lon: -3.65, bortle: 3 },
    { name: 'Kielder Forest', lat: 55.23, lon: -2.58, bortle: 2 }
  ];
  function manualLocation(loc) {
    const lat = el('input', { type: 'number', inputmode: 'decimal', id: 'manLat', step: 'any', value: loc.lat, 'aria-label': 'Latitude' });
    const lon = el('input', { type: 'number', inputmode: 'decimal', id: 'manLon', step: 'any', value: loc.lon, 'aria-label': 'Longitude' });
    const msg = el('p', { class: 'small', style: 'color:var(--bad);margin:0.3rem 0 0', role: 'status' });
    return el('div', { class: 'card' },
      el('p', { class: 'kicker' }, 'Observing from'),
      el('h2', { style: 'margin:0' }, loc.name),
      el('p', { class: 'small muted', style: 'margin:0.2rem 0 0.7rem' }, `${loc.lat.toFixed(3)}°, ${loc.lon.toFixed(3)}°`),
      el('p', { class: 'small muted', style: 'margin:0 0 0.4rem' }, 'Pick a place, or enter coordinates (find them in Apple or Google Maps by pressing on a spot).'),
      el('div', { class: 'chipbar', style: 'flex-wrap:wrap' }, PRESETS.map((p) => el('button', { class: p.name === loc.name ? 'on' : '', onclick: () => App.setLocation({ ...p, bortleAuto: true }) }, p.name.split(',')[0]))),
      el('div', { class: 'row wrap', style: 'margin-top:0.6rem' },
        el('label', { class: 'field grow', style: 'margin:0;flex-basis:120px' }, 'Latitude', lat),
        el('label', { class: 'field grow', style: 'margin:0;flex-basis:120px' }, 'Longitude', lon),
        el('button', { class: 'btn', style: 'align-self:flex-end', onclick: () => {
          const a = Number(lat.value), b = Number(lon.value);
          if (!(a >= -90 && a <= 90 && b >= -180 && b <= 180)) return (msg.textContent = 'Latitude must be between -90 and 90, longitude between -180 and 180.');
          App.setLocation({ name: `Custom spot (${a.toFixed(2)}, ${b.toFixed(2)})`, lat: a, lon: b, bortleAuto: false });
        } }, 'Use these')),
      msg);
  }

  function bortleCard(loc) {
    const cur = BORTLE[(loc.bortle || 6) - 1];
    return el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', {}, `Sky darkness: Bortle ${loc.bortle}`), loc.bortleAuto ? el('span', { class: 'small muted' }, 'estimated') : el('span', { class: 'small muted' }, 'set by you')),
      el('p', { style: 'margin:0' }, el('strong', {}, cur[2]), ` · ${cur[3]}`),
      el('div', { class: 'bortle', role: 'radiogroup', 'aria-label': 'Bortle class' },
        BORTLE.map(([n, col, name]) => el('button', { class: n === loc.bortle ? 'on' : '', style: `background:${col}`, title: name, 'aria-label': `Bortle ${n}: ${name}`, onclick: () => App.setLocation({ bortle: n, bortleAuto: false }) }, n))),
      el('p', { class: 'small muted', style: 'margin:0.5rem 0 0' }, App.embed ? 'Tap the number that matches your sky. Every rating in the app uses this.' : 'Estimated from satellite night-lights data. Adjust it if your sky looks darker or brighter. Every rating in the app uses this.'),
      App.embed ? null : el('button', { class: 'btn small', style: 'margin-top:0.5rem', onclick: () => estimateBortle(loc.lat, loc.lon).then((r) => App.setLocation({ bortle: r.bortle, bortleAuto: true, nightLights: r.value })).catch(() => {}) }, 'Re-estimate from map'));
  }

  async function conditionsCard(section, loc) {
    // Conditions panel.
    const cond = el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Loading conditions…'));
    section.append(cond);
    const [hours] = await Promise.all([App.weather()]);
    const night = App.night();
    const c = Planner.conditions(hours, night);
    const mp = Astro.moonRaDec(new Date());
    const mt = Planner.moonTimes(loc, new Date());
    const nowH = hours?.find((h) => Math.abs(h.t - Date.now()) < 31 * 60000);
    cond.replaceChildren(
      el('h2', {}, 'Stargazing conditions'),
      el('div', { class: 'stats' },
        el('div', {}, el('span', { class: 'k' }, 'Sunset · sunrise'), el('span', { class: 'v' }, `${fmtTime(night.sunset)} · ${fmtTime(night.sunrise)}`)),
        el('div', {}, el('span', { class: 'k' }, 'Astronomical dark'), el('span', { class: 'v' }, night.noFullDark ? 'none (summer)' : `${night.isDark ? 'now' : fmtTime(night.darkStart)} → ${fmtTime(night.darkEnd)}`)),
        el('div', {}, el('span', { class: 'k' }, 'Moon'), el('span', { class: 'v' }, `${Math.round(mp.illum * 100)}% ${Astro.phaseName(mp.age).toLowerCase()}`), el('div', { class: 'small muted' }, mt.upNow ? `up${mt.set ? ', sets ' + fmtTime(mt.set) : ''}` : mt.rise ? `rises ${fmtTime(mt.rise)}` : '')),
        nowH ? el('div', {}, el('span', { class: 'k' }, 'Cloud now'), el('span', { class: 'v' }, `${nowH.cloud}%`), el('div', { class: 'small muted' }, `low ${nowH.low}% · mid ${nowH.mid}% · high ${nowH.high}%`)) : null,
        c ? el('div', {}, el('span', { class: 'k' }, 'Tonight’s cloud'), el('span', { class: 'v' }, `${c.cloud}% avg`)) : null,
        nowH ? el('div', {}, el('span', { class: 'k' }, 'Temp · dew point'), el('span', { class: 'v' }, `${Math.round(nowH.temp)}° · ${Math.round(nowH.dew)}°C`)) : null,
        c ? el('div', {}, el('span', { class: 'k' }, 'Dew risk'), el('span', { class: 'v' }, c.dew), el('div', { class: 'small muted' }, c.dew === 'High' ? 'use a dew shield' : '')) : null,
        nowH ? el('div', {}, el('span', { class: 'k' }, 'Wind'), el('span', { class: 'v' }, `${Math.round(nowH.wind)} mph`)) : null,
        nowH ? el('div', {}, el('span', { class: 'k' }, 'Humidity'), el('span', { class: 'v' }, `${nowH.rh}%`)) : null,
        el('div', {}, el('span', { class: 'k' }, 'Faintest naked-eye star'), el('span', { class: 'v' }, `≈ mag ${Rating.NELM(loc.bortle).toFixed(1)}`))),
      el('a', { class: 'btn primary', href: '#tonight', style: 'margin-top:0.9rem;width:100%' }, 'See what’s up tonight'));
  }

  function initMap(box, loc, { lpToggle }, onReady) {
    const go = () => {
      if (!window.L) return setTimeout(go, 150);
      map = L.map(box, { zoomControl: true, attributionControl: true }).setView([loc.lat, loc.lon], 8);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors · Forecast: Open-Meteo'
      }).addTo(map);
      const lights = L.tileLayer(GIBS, { maxNativeZoom: 8, maxZoom: 18, opacity: 0.75, attribution: 'Night lights: NASA Black Marble' });
      if (lpToggle.checked) lights.addTo(map);
      lpToggle.addEventListener('change', () => {
        App.store.set('lightLayer', lpToggle.checked);
        lpToggle.checked ? lights.addTo(map) : map.removeLayer(lights);
      });
      // Place names above the coloured layers.
      map.createPane('labels');
      map.getPane('labels').style.zIndex = 650;
      map.getPane('labels').style.pointerEvents = 'none';
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'labels' }).addTo(map);
      marker = L.circleMarker([loc.lat, loc.lon], { radius: 9, color: '#ffd479', weight: 3, fillColor: '#ffd479', fillOpacity: 0.35, pane: 'labels' }).addTo(map);
      map.on('click', (e) => {
        if (e.originalEvent?.target?.classList?.contains('leaflet-interactive')) return;
        setSite({ name: `Pinned spot (${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)})`, lat: +e.latlng.lat.toFixed(4), lon: +e.latlng.lng.toFixed(4) });
      });
      setTimeout(() => map.invalidateSize(), 200);
      onReady?.(map);
    };
    go();
  }

  App.register('map', {
    render,
    onShow() {
      if (map) setTimeout(() => map.invalidateSize(), 100);
    }
  });
})();
