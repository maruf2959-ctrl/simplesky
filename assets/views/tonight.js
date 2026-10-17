// Tonight tab + the shared planner used by Home.
(function () {
  'use strict';
  const { el, fmtTime, fmtDay } = App;

  // ---------------------------------------------------------------- planner
  let memo = null;
  App.on('kit', () => (memo = null));
  App.on('location', () => (memo = null));

  async function getPlan(force) {
    if (memo && !force && Date.now() - memo.at < 5 * 60000) return memo.value;
    const p = (async () => {
      const [targets, gear, hours] = await Promise.all([App.data('targets'), App.data('gear'), App.weather()]);
      if (!targets || !gear) throw new Error('data');
      const kit = Kit.get();
      const setup = Kit.active(kit);
      const k = Rating.derive(setup, gear);
      const loc = App.location();
      const now = new Date();
      const night = App.night(now);
      const plan = k ? Rating.plan({ targets, k, loc, night, hours, now }) : [];
      return { plan, night, hours, k, kit, setup, gear, targets, loc, now };
    })();
    memo = { at: Date.now(), value: p };
    p.catch(() => (memo = null));
    return p;
  }

  function moonTimes(loc, from) {
    let prev = Astro.moonAltAz(from, loc.lat, loc.lon).alt;
    const out = { upNow: prev > 0 };
    for (let m = 10; m <= 26 * 60; m += 10) {
      const d = new Date(from.getTime() + m * 60000);
      const a = Astro.moonAltAz(d, loc.lat, loc.lon).alt;
      if (prev <= 0 && a > 0 && !out.rise) out.rise = d;
      if (prev > 0 && a <= 0 && !out.set) out.set = d;
      prev = a;
    }
    return out;
  }

  function conditions(hours, night) {
    if (!hours) return null;
    const inWin = hours.filter((h) => h.t >= new Date(night.start.getTime() - 30 * 60000) && h.t <= night.end);
    const list = inWin.length ? inWin : hours.slice(0, 8);
    const scores = list.map(App.hourScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const bestI = scores.indexOf(Math.max(...scores));
    const dewGap = Math.min(...list.map((h) => h.temp - h.dew));
    return {
      avg,
      best: list[bestI],
      bestScore: scores[bestI],
      clearHours: scores.filter((s) => s >= 70).length,
      cloud: Math.round(list.reduce((a, h) => a + h.cloud, 0) / list.length),
      temp: Math.round(Math.min(...list.map((h) => h.temp))),
      wind: Math.round(Math.max(...list.map((h) => h.wind))),
      dew: dewGap < 1.5 ? 'High' : dewGap < 3.5 ? 'Moderate' : 'Low',
      rain: Math.max(...list.map((h) => h.rain ?? 0))
    };
  }

  function verdict(c) {
    if (!c) return { text: 'Forecast unavailable', sub: 'Check the sky. The ratings below assume clear skies.' };
    if (c.avg >= 75) return { text: 'Great night. Get out there!', sub: `${c.clearHours} clear hours forecast.` };
    if (c.avg >= 55) return { text: 'Worth setting up', sub: `Clearest around ${fmtTime(c.best.t)}.` };
    if (c.avg >= 35) return { text: 'Patchy: grab gaps', sub: c.bestScore >= 60 ? `Best gap around ${fmtTime(c.best.t)}.` : 'Planets and the Moon through gaps.' };
    return { text: 'Mostly cloudy', sub: c.bestScore >= 60 ? `A possible gap around ${fmtTime(c.best.t)}.` : 'Probably a night off. Plan for the next clear one.' };
  }

  function timeline(hours, night) {
    if (!hours) return null;
    const from = new Date((night.sunset || night.start).getTime() - 3600000);
    const to = new Date((night.sunrise || night.end).getTime() + 3600000);
    const hs = hours.filter((h) => h.t >= from && h.t <= to);
    if (!hs.length) return null;
    const color = (s) => (s >= 75 ? '#7be0a5' : s >= 55 ? '#b6e07b' : s >= 35 ? '#ffd479' : s >= 15 ? '#ffae6b' : '#ff8d8d');
    return el('div', {},
      el('div', { class: 'timeline', role: 'img', 'aria-label': 'Hourly sky clarity tonight' },
        hs.map((h) => {
          const s = App.hourScore(h);
          const dark = h.t >= night.start && h.t <= night.end;
          return el('div', { class: 'h' + (dark ? ' dark' : ''), title: `${fmtTime(h.t)}: ${h.cloud}% cloud (low ${h.low}%), ${App.scoreLabel(s)}` },
            el('div', { class: 'bar' }, el('i', { style: `height:${Math.max(6, s)}%;--c:${color(s)}` })),
            el('span', {}, fmtTime(h.t).slice(0, 2)),
            el('span', {}, h.cloud + '%'));
        })),
      el('div', { class: 'legend' },
        el('span', {}, el('i', { style: 'background:#7be0a5' }), 'Clear'),
        el('span', {}, el('i', { style: 'background:#ffd479' }), 'Patchy'),
        el('span', {}, el('i', { style: 'background:#ff8d8d' }), 'Cloudy'),
        el('span', {}, el('i', { style: 'outline:1px solid #ffd479' }), 'Dark hours'),
        el('span', {}, 'Bar height = clarity · number = total cloud')));
  }

  // ------------------------------------------------------------- item card
  function targetCard(e, mode, setup, k) {
    const t = e.target;
    const r = mode === 'photo' ? e.imaging : e.visual ?? e.imaging;
    const score = r?.score ?? 0;
    const name = t.common && t.common !== t.name ? `${t.name} · ${t.common}` : t.common || t.name;
    const upNow = e.now.alt > 10;
    const when = mode === 'photo' && r?.at ? r.at : e.best.t;
    const sky = e.best.clear;
    const hasGoto = ['altaz-goto', 'eq-goto', 'tracker'].includes(k.mount?.type) && k.mount?.handset;
    return el('details', { class: 'titem' },
      el('summary', {},
        App.scoreRing(score, r?.label),
        el('div', { class: 'grow' },
          el('div', { class: 'tname' }, name),
          el('div', { class: 'tsub' }, `${App.TYPE_ICON[t.type] || ''} ${App.TYPE_NAME[t.type] || ''} · `, el('span', { class: 'lbl-' + App.scoreClass(score) }, r?.label || '')),
          el('div', { class: 'tmeta' },
            el('span', {}, upNow ? `Up now ${Math.round(e.now.alt)}° ${App.compass(e.now.az)}` : `Best ${fmtTime(when)}`),
            el('span', {}, `Peak ${Math.round(e.best.alt)}° ${App.compass(e.best.az)}`),
            sky != null ? el('span', {}, `Sky ${App.scoreLabel(sky).toLowerCase()}`) : null))),
      el('div', { class: 'tbody' },
        el('p', {}, t.desc),
        r?.view ? el('p', {}, el('strong', {}, 'Eyepiece: '), `${r.view.label} → ${Math.round(r.view.mag)}×, ${r.view.tfov >= 60 ? (r.view.tfov / 60).toFixed(1) + '°' : Math.round(r.view.tfov) + '′'} field`) : null,
        el('h4', {}, mode === 'photo' ? 'Photography rating: why' : 'Why this rating'),
        el('ul', {}, (r?.reasons || ['No rating available for this kit.']).map((x) => el('li', {}, x))),
        mode !== 'photo' && e.imaging ? el('p', { class: 'small muted' }, `Photography: ${e.imaging.score}/100 (${e.imaging.label}). Switch to Photography above for details.`) : null,
        hasGoto && t.hc ? el('div', { class: 'goto' }, '🎯 GoTo: ', t.hc, ' → ENTER') : null,
        el('p', { class: 'small muted' }, `Best placed at ${fmtTime(e.best.t)} (${Math.round(e.best.alt)}° high, ${App.compass(e.best.az)}).`)));
  }

  // ------------------------------------------------------------------ render
  async function render(section) {
    section.replaceChildren(el('p', { class: 'empty' }, 'Working out tonight’s sky…'));
    let P;
    try {
      P = await getPlan();
    } catch {
      section.replaceChildren(el('p', { class: 'empty' }, 'Could not load sky data. Check your connection.'));
      return;
    }
    const { plan, night, hours, k, kit, setup, gear, loc, now } = P;
    section.replaceChildren();
    if (!k) {
      section.append(el('div', { class: 'card' }, el('h2', {}, 'Add your telescope first'), el('p', {}, 'Ratings are worked out for your own kit.'), el('a', { class: 'btn primary', href: '#kit' }, 'Go to My Kit')));
      return;
    }

    // Conditions card.
    const c = conditions(hours, night);
    const v = verdict(c);
    const mp = Astro.moonRaDec(now);
    const mt = moonTimes(loc, now);
    section.append(
      el('div', { class: 'card' },
        el('p', { class: 'kicker' }, `${fmtDay(now, { weekday: 'long', day: 'numeric', month: 'long' })} · ${loc.name.split(',')[0]}`),
        el('div', { class: 'verdict-big' },
          c ? App.scoreRing(c.avg, 'Sky clarity tonight') : null,
          el('div', {}, el('h2', { style: 'margin:0' }, v.text), el('p', { class: 'muted', style: 'margin:0.2rem 0 0' }, v.sub))),
        el('div', { class: 'stats' },
          el('div', {}, el('span', { class: 'k' }, night.noFullDark ? 'Darkest (no full dark)' : 'Astro dark'), el('span', { class: 'v' }, `${night.isDark ? 'now' : fmtTime(night.start)} → ${fmtTime(night.end)}`)),
          el('div', {}, el('span', { class: 'k' }, 'Moon'), el('span', { class: 'v' }, `${Astro.phaseName(mp.age)} ${Math.round(mp.illum * 100)}%`), el('div', { class: 'small muted' }, mt.upNow ? `Up now${mt.set ? ', sets ' + fmtTime(mt.set) : ''}` : mt.rise ? `Rises ${fmtTime(mt.rise)}` : '')),
          c ? el('div', {}, el('span', { class: 'k' }, 'Cloud'), el('span', { class: 'v' }, `${c.cloud}% avg`)) : null,
          c ? el('div', {}, el('span', { class: 'k' }, 'Dew risk'), el('span', { class: 'v' }, c.dew)) : null,
          c ? el('div', {}, el('span', { class: 'k' }, 'Low / wind'), el('span', { class: 'v' }, `${c.temp}°C · ${c.wind} mph`)) : null,
          el('div', {}, el('span', { class: 'k' }, 'Sky darkness'), el('span', { class: 'v' }, `Bortle ${loc.bortle} `), el('a', { href: '#map', class: 'small' }, 'change'))),
        timeline(hours, night) ? el('div', { style: 'margin-top:0.9rem' }, timeline(hours, night)) : null));

    // Setup + mode.
    let mode = App.store.get('tonightMode', 'view');
    if (!k.camera && mode === 'photo') mode = 'view';
    if (k.setup.scope.type === 'smart') mode = 'photo';
    const modeSwitch = el('div', { class: 'switch' },
      el('button', { class: mode === 'view' ? 'on' : '', disabled: k.setup.scope.type === 'smart', onclick: () => setMode('view') }, '👁 Viewing'),
      el('button', { class: mode === 'photo' ? 'on' : '', disabled: !k.camera, onclick: () => setMode('photo') }, '📷 Photography'));
    function setMode(m) {
      App.store.set('tonightMode', m);
      render(section);
    }
    const setupSel = kit.setups.length > 1
      ? el('select', { onchange: (e) => { kit.active = e.target.value; Kit.save(kit); } }, kit.setups.map((s) => el('option', { value: s.id, selected: s.id === setup.id }, s.name)))
      : el('strong', {}, setup.name);
    section.append(el('div', { class: 'card' },
      el('div', { class: 'row wrap' }, el('span', { class: 'muted small' }, 'Rated for'), setupSel, el('a', { href: '#kit', class: 'small' }, 'edit kit')),
      el('p', { class: 'small muted', style: 'margin:0.3rem 0 0.6rem' }, `${setup.scope.name} · ${k.D} mm f/${k.fr.toFixed(1)} · ${k.mount?.name || 'no mount set'}${k.camera ? ' · ' + k.camera.name : ''}`),
      modeSwitch,
      !k.camera && k.setup.scope.type !== 'smart' ? el('p', { class: 'small muted', style: 'margin:0.5rem 0 0' }, 'Add a camera in My Kit to see photography ratings.') : null));

    // GoTo helper.
    if (k.mount?.handset && ['altaz-goto', 'eq-goto'].includes(k.mount.type)) {
      const stars = Rating.alignStars(P.targets.alignStars, night.isDark ? now : night.start, loc);
      const nexstar = k.mount.handset === 'nexstar';
      section.append(el('details', { class: 'card', open: App.store.get('gotoOpen', true) ? true : null, ontoggle: (e) => App.store.set('gotoOpen', e.target.open) },
        el('summary', { style: 'cursor:pointer;font-weight:600' }, `🎯 GoTo helper: ${nexstar ? 'NexStar SLT' : k.mount.name}`),
        el('ol', { style: 'padding-left:1.2rem;font-size:0.92rem' },
          el('li', {}, 'Level the tripod, point the tube roughly level and north, then switch on.'),
          el('li', {}, `Enter time ${fmtTime(night.isDark ? now : night.start)}, date ${fmtDay(now, { day: '2-digit', month: '2-digit', year: 'numeric' })}, and location ${Math.abs(loc.lat).toFixed(1)}°${loc.lat >= 0 ? 'N' : 'S'} ${Math.abs(loc.lon).toFixed(1)}°${loc.lon >= 0 ? 'E' : 'W'}. ${nexstar ? 'UK: daylight saving ON in summer, time zone GMT.' : ''}`),
          el('li', {}, nexstar ? 'Choose SkyAlign (or Two-Star Align) and centre these bright stars in turn, pressing ENTER, then ALIGN:' : 'Run a 2- or 3-star alignment using these well-spread bright stars:'),
          el('ul', {}, stars.map((s) => el('li', {}, el('strong', {}, s.name), ` ${Math.round(s.alt)}° high, ${App.compass(s.az)} (mag ${s.mag.toFixed(1)})`))),
          el('li', {}, 'Finish each star with the up and right arrow keys (this takes up gear backlash). Centre it in the eyepiece, not just the finder.'),
          el('li', {}, nexstar ? 'Then GoTo: use the catalogue path on each target below (e.g. Messier → 42 → ENTER).' : 'Then use the catalogue path on each target below.')),
        el('p', { class: 'small muted' }, 'Positions refresh automatically. SkyAlign accepts any three bright objects, including planets. Keep them far apart.')));
    }

    // Filters + list.
    const filters = [['all', 'All'], ['up', 'Up now'], ['planet', 'Moon & planets'], ['neb', 'Nebulae'], ['galaxy', 'Galaxies'], ['cluster', 'Clusters'], ['double', 'Doubles']];
    let f = App.store.get('tonightFilter', 'all');
    const chips = el('div', { class: 'chipbar', role: 'tablist' });
    const list = el('div', { class: 'tlist' });
    const match = (e) => {
      const ty = e.target.type;
      return f === 'all' || (f === 'up' && e.now.alt > 10) || (f === 'planet' && (ty === 'planet' || ty === 'moon')) || (f === 'neb' && (ty === 'nebula' || ty === 'pn')) || (f === 'galaxy' && ty === 'galaxy') || (f === 'cluster' && (ty === 'open' || ty === 'globular')) || (f === 'double' && ty === 'double');
    };
    function draw() {
      chips.replaceChildren(...filters.map(([id, txt]) => el('button', { class: f === id ? 'on' : '', onclick: () => { f = id; App.store.set('tonightFilter', id); draw(); } }, txt)));
      const key = mode === 'photo' ? (e) => (e.imaging?.score ?? 0) * (e.best.clear == null ? 1 : 0.35 + 0.65 * (e.best.clear / 100)) : (e) => e.tonight;
      const rows = plan.filter(match).filter((e) => (mode === 'photo' ? e.imaging : e.visual ?? e.imaging)).sort((a, b) => key(b) - key(a));
      list.replaceChildren(...(rows.length ? rows.map((e) => targetCard(e, mode, setup, k)) : [el('p', { class: 'empty' }, 'Nothing in this group is well placed tonight.')]));
    }
    draw();
    section.append(
      el('div', { class: 'card-head', style: 'margin-top:1.2rem' }, el('h2', { style: 'margin:0;font-size:1.15rem' }, mode === 'photo' ? 'Best to photograph tonight' : 'Best to see tonight'), el('span', { class: 'small muted' }, `${plan.length} up`)),
      el('p', { class: 'small muted', style: 'margin:0.2rem 0 0.4rem' }, 'Scores are for your kit at the target’s best moment tonight, including the Moon and your sky darkness. The order also accounts for forecast cloud.'),
      chips,
      list);
  }

  App.register('tonight', {
    render,
    onShow(section) {
      if (memo && Date.now() - memo.at > 5 * 60000) {
        section.replaceChildren();
        render(section);
      }
    }
  });
  window.Planner = { get: getPlan, conditions, verdict, moonTimes };
})();
