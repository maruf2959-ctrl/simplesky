// App core: tiny helpers, saved settings, data loading, weather and the tab router.
(function (global) {
  'use strict';

  const DEFAULT_LOCATION = { name: 'Worthing, West Sussex', lat: 50.8179, lon: -0.3728, bortle: 6, bortleAuto: true };
  const TZ = 'Europe/London';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtTime = (d) => (d ? d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '–');
  const fmtDay = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => d.toLocaleDateString('en-GB', { timeZone: TZ, ...opts });
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // ------------------------------------------------------------ storage
  // Everything personal stays on this device. Storage can be blocked (private
  // mode), so every access is guarded and the app still works without it.
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('stargazer.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('stargazer.' + key, JSON.stringify(value));
      } catch { /* storage unavailable */ }
    }
  };

  // ------------------------------------------------------------- events
  const listeners = {};
  const on = (name, fn) => (listeners[name] ||= []).push(fn);
  const emit = (name, data) => (listeners[name] || []).forEach((fn) => fn(data));

  // ---------------------------------------------------------- location
  function site() {
    return { ...DEFAULT_LOCATION, ...store.get('location', {}) };
  }
  function setSite(loc) {
    store.set('location', { ...site(), ...loc });
    weatherCache = null;
    updateLocPill();
    emit('location', site());
  }
  function updateLocPill() {
    const n = $('#locName');
    if (n) n.textContent = site().name.split(',')[0];
  }

  // -------------------------------------------------------------- data
  const dataCache = {};
  function data(name) {
    return (dataCache[name] ||= fetch(`data/${name}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .catch((e) => {
        console.warn('data', name, e);
        delete dataCache[name];
        return null;
      }));
  }

  // ----------------------------------------------------------- weather
  let weatherCache = null;
  function weather() {
    const loc = site();
    const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
    const saved = store.get('weather', null);
    const revive = (list) => list.map((h) => ({ ...h, t: new Date(h.t) }));
    if (!weatherCache && saved && saved.key === key && Date.now() - saved.at < 30 * 60000) weatherCache = Promise.resolve(revive(saved.data));
    if (weatherCache) return weatherCache;
    const params = new URLSearchParams({
      latitude: loc.lat,
      longitude: loc.lon,
      hourly: 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,dew_point_2m,temperature_2m,wind_speed_10m,precipitation_probability,visibility',
      daily: 'sunrise,sunset',
      timezone: 'UTC',
      forecast_days: '3',
      wind_speed_unit: 'mph'
    });
    weatherCache = fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) => {
        const h = json.hourly;
        const hours = h.time.map((t, i) => ({
          t: new Date(t + 'Z'),
          cloud: h.cloud_cover[i],
          low: h.cloud_cover_low[i],
          mid: h.cloud_cover_mid[i],
          high: h.cloud_cover_high[i],
          rh: h.relative_humidity_2m[i],
          dew: h.dew_point_2m[i],
          temp: h.temperature_2m[i],
          wind: h.wind_speed_10m[i],
          rain: h.precipitation_probability[i],
          vis: h.visibility[i]
        }));
        store.set('weather', { key, at: Date.now(), data: hours });
        return hours;
      })
      .catch((e) => {
        console.warn('weather', e);
        weatherCache = null;
        return saved?.key === key ? revive(saved.data) : null;
      });
    return weatherCache;
  }

  // How good one hour is for stargazing, 0–100. Low cloud matters most and
  // thin high cloud least; damp air means dew and haze.
  function hourScore(h) {
    if (!h) return null;
    const cloud = 0.5 * h.low + 0.35 * h.mid + 0.15 * h.high;
    const effective = Math.max(cloud, h.cloud * 0.6);
    let s = 100 - effective;
    if (h.rain > 40) s -= 20;
    if (h.wind > 20) s -= 10;
    if (h.rh > 92) s -= 8;
    return clamp(Math.round(s), 0, 100);
  }
  const scoreLabel = (s) => (s == null ? 'Unknown' : s >= 80 ? 'Clear' : s >= 60 ? 'Mostly clear' : s >= 40 ? 'Patchy' : s >= 20 ? 'Mostly cloudy' : 'Overcast');

  // ------------------------------------------------------------- night
  // Sun-altitude events over the next ~30 h, sampled every 5 minutes.
  function night(from = new Date()) {
    const loc = site();
    const sunAlt = (d) => {
      const s = Astro.sunRaDec(d);
      return Astro.altAz(s.ra, s.dec, d, loc.lat, loc.lon).alt;
    };
    const res = { now: sunAlt(from) };
    // Start from noon today (UK) if it's daytime, else from now, so "tonight" is stable.
    let prev = res.now;
    for (let m = 5; m <= 30 * 60; m += 5) {
      const d = new Date(from.getTime() + m * 60000);
      const a = sunAlt(d);
      if (prev > -0.83 && a <= -0.83 && !res.sunset) res.sunset = d;
      if (prev > -18 && a <= -18 && !res.darkStart) res.darkStart = d;
      if (prev <= -18 && a > -18 && !res.darkEnd && (res.darkStart || res.now <= -18)) res.darkEnd = d;
      if (prev <= -0.83 && a > -0.83 && !res.sunrise && (res.sunset || res.now <= -0.83)) res.sunrise = d;
      prev = a;
      if (res.sunrise && res.darkEnd) break;
    }
    if (res.now <= -18) res.darkStart = from;
    if (res.now <= -0.83 && !res.sunset) res.sunset = from;
    res.isDark = res.now <= -18;
    res.noFullDark = !res.darkStart;
    // Window used for "tonight": astronomical dark, or nautical-ish twilight in UK summer.
    res.start = res.darkStart || res.sunset || from;
    res.end = res.darkEnd || res.sunrise || new Date(res.start.getTime() + 8 * 3600000);
    return res;
  }

  // ------------------------------------------------------------ router
  const views = {};
  let current = null;
  function register(name, view) {
    views[name] = view;
  }
  function show(name) {
    if (!views[name]) return;
    const section = $('#view-' + name);
    if (current === name) return;
    $$('.view').forEach((v) => v.classList.toggle('active', v === section));
    $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name || (name === 'map' && a.dataset.tab === 'tonight')));
    $('#viewTitle').textContent = section.dataset.title;
    current = name;
    const v = views[name];
    if (!v.rendered) {
      v.rendered = true;
      Promise.resolve(v.render(section)).catch((e) => {
        console.error(e);
        section.append(el('p', { class: 'empty' }, 'Something went wrong loading this tab.'));
      });
    } else if (v.onShow) v.onShow(section);
    window.scrollTo(0, 0);
  }
  function route() {
    const name = global.location.hash.slice(1);
    if (views[name]) show(name);
    else if (!current) show('home');
  }
  // Let views re-render when kit or location change, but only when visible
  // (others re-render lazily the next time they're shown).
  function rerenderOn(eventName, name) {
    on(eventName, () => {
      const v = views[name];
      if (!v?.rendered) return;
      if (current === name) {
        const section = $('#view-' + name);
        section.replaceChildren();
        v.render(section);
      } else v.rendered = false;
    });
  }

  // --------------------------------------------------------- red mode
  function setRed(onOff) {
    document.documentElement.classList.toggle('red', onOff);
    $('#redToggle')?.setAttribute('aria-pressed', String(onOff));
    store.set('red', onOff);
  }

  // ------------------------------------------------------- starfield
  function starfield() {
    const c = $('#sky');
    if (!c) return;
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
      if (!reduce && !document.hidden) requestAnimationFrame(draw);
    }
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => !document.hidden && !reduce && requestAnimationFrame(draw));
    resize();
    requestAnimationFrame(draw);
  }

  function start() {
    starfield();
    updateLocPill();
    setRed(store.get('red', false));
    $('#redToggle').addEventListener('click', () => setRed(!document.documentElement.classList.contains('red')));
    addEventListener('hashchange', route);
    for (const v of ['home', 'tonight', 'events']) {
      rerenderOn('kit', v);
      rerenderOn('location', v);
    }
    rerenderOn('location', 'map');
    route();
    if ('serviceWorker' in navigator && global.location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------------------------------------------------------- shared UI
  const scoreClass = (s) => (s >= 80 ? 'ex' : s >= 65 ? 'good' : s >= 45 ? 'fair' : s >= 25 ? 'tough' : 'no');
  const scoreRing = (s, title) => el('div', { class: 'score s-' + scoreClass(s ?? 0), style: `--p:${s ?? 0}`, title: title || '', 'aria-label': `Score ${s ?? 0} out of 100` }, el('b', {}, s ?? '–'));
  const TYPE_ICON = { moon: '🌙', planet: '🪐', nebula: '☁️', pn: '💍', galaxy: '🌀', globular: '✳️', open: '✨', double: '⭐' };
  const TYPE_NAME = { moon: 'Moon', planet: 'Planet', nebula: 'Nebula', pn: 'Planetary nebula', galaxy: 'Galaxy', globular: 'Globular cluster', open: 'Open cluster', double: 'Double star' };
  const compass = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
  function sheet(title, ...content) {
    const close = () => bg.remove();
    const bg = el('div', { class: 'sheet-bg', onclick: (e) => e.target === bg && close() },
      el('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
        el('div', { class: 'card-head' }, el('h3', {}, title), el('button', { class: 'btn small ghost', onclick: close }, 'Close')),
        ...content));
    document.body.append(bg);
    return close;
  }

  global.App = {
    scoreClass, scoreRing, TYPE_ICON, TYPE_NAME, compass, sheet,
    $, $$, el, esc, fmtTime, fmtDay, clamp, store, on, emit,
    location: site, setLocation: setSite, data, weather, hourScore, scoreLabel, night,
    register, show, start: () => start(), TZ
  };
})(window);
