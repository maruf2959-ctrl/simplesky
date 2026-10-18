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

  // Estimate Bortle class from NASA Black Marble night-lights brightness around a point.
  // Calibrated by eye against UK sites (Kielder ≈2, rural Norfolk ≈3–4, Worthing ≈6–7, London 8–9).
  async function estimateBortle(lat, lon) {
    const z = 8, n = 2 ** z;
    const x = ((lon + 180) / 360) * n;
    const y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
    const tx = Math.floor(x), ty = Math.floor(y);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = GIBS.replace('{z}', z).replace('{y}', ty).replace('{x}', tx);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = Math.floor((x - tx) * 256), py = Math.floor((y - ty) * 256);
    const sample = (r) => {
      let sum = 0, cnt = 0;
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++) {
          const X = px + dx, Y = py + dy;
          if (X < 0 || Y < 0 || X > 255 || Y > 255) continue;
          const d = ctx.getImageData(X, Y, 1, 1).data;
          sum += (d[0] + d[1] + d[2]) / 3;
          cnt++;
        }
      return sum / cnt;
    };
    const v = 0.6 * sample(1) + 0.4 * sample(6);
    const b = v < 12 ? 2 : v < 25 ? 3 : v < 45 ? 4 : v < 90 ? 5 : v < 170 ? 6 : v < 235 ? 7 : v < 250 ? 8 : 9;
    return { bortle: b, value: Math.round(v) };
  }

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
      el('p', { class: 'small muted', style: 'margin:0.2rem 0 0.7rem' }, `${loc.lat.toFixed(3)}°, ${loc.lon.toFixed(3)}° · tap the map to move the pin`),
      el('div', { class: 'row wrap' }, el('div', { class: 'grow', style: 'flex-basis:200px' }, input), gps),
      status,
      results));

    // Map.
    const mapBox = el('div', { id: 'leafletMap', role: 'application', 'aria-label': 'Map with light pollution layer' });
    const layerToggle = el('label', { class: 'row small', style: 'margin-top:0.5rem' }, el('input', { type: 'checkbox', checked: App.store.get('lightLayer', true) }), 'Show light pollution (NASA night lights)');
    section.append(el('div', { class: 'card' }, mapBox, layerToggle, el('p', { class: 'small muted', style: 'margin:0.3rem 0 0' }, 'Black and blue = dark skies. Yellow and white = heavy light pollution. Head for the dark patches!')));
    initMap(mapBox, loc, layerToggle.querySelector('input'));

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

  function initMap(box, loc, toggle) {
    const go = () => {
      if (!window.L) return setTimeout(go, 150);
      map = L.map(box, { zoomControl: true, attributionControl: true }).setView([loc.lat, loc.lon], 9);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors'
      }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, pane: 'overlayPane', zIndex: 650 }).addTo(map);
      const lights = L.tileLayer(GIBS, { maxNativeZoom: 8, maxZoom: 18, opacity: 0.75, attribution: 'Night lights: NASA Black Marble' });
      if (toggle.checked) lights.addTo(map);
      toggle.addEventListener('change', () => {
        App.store.set('lightLayer', toggle.checked);
        toggle.checked ? lights.addTo(map) : map.removeLayer(lights);
      });
      marker = L.circleMarker([loc.lat, loc.lon], { radius: 9, color: '#ffd479', weight: 3, fillColor: '#ffd479', fillOpacity: 0.35 }).addTo(map);
      map.on('click', (e) => setSite({ name: `Pinned spot (${e.latlng.lat.toFixed(2)}, ${e.latlng.lng.toFixed(2)})`, lat: +e.latlng.lat.toFixed(4), lon: +e.latlng.lng.toFixed(4) }));
      setTimeout(() => map.invalidateSize(), 200);
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
