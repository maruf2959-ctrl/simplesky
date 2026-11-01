// Events tab: a computed sky calendar (Moon phases, meteor showers, planet
// oppositions/elongations, conjunctions, seasons) plus an astronomy news feed.
(function () {
  'use strict';
  const { el, fmtTime } = App;
  const DAY = 86400000;

  const SHOWERS = [
    // month (1-12), day, name, ZHR, radiant note
    [1, 3, 'Quadrantids', 110, 'Short, sharp peak. Best after midnight; the radiant is high in the north-east.'],
    [4, 22, 'Lyrids', 18, 'Best before dawn, radiant near Vega.'],
    [5, 6, 'Eta Aquariids', 50, 'Poor from the UK: the radiant barely rises before dawn. Expect a handful.'],
    [8, 12, 'Perseids', 100, 'The summer favourite. Good from late evening, best before dawn.'],
    [10, 8, 'Draconids', 10, 'Unusual evening shower; usually weak, occasionally surprises.'],
    [10, 21, 'Orionids', 20, 'Debris from Halley’s Comet. Best after midnight.'],
    [11, 5, 'Southern Taurids', 5, 'Slow, and known for bright fireballs.'],
    [11, 12, 'Northern Taurids', 5, 'Slow fireballs; active for weeks.'],
    [11, 17, 'Leonids', 15, 'Fast meteors after midnight.'],
    [12, 14, 'Geminids', 150, 'The best shower of the year. Active all night from mid-evening.'],
    [12, 22, 'Ursids', 10, 'Small pre-Christmas shower, radiant near the Little Dipper.']
  ];
  const FIXED = [
    { date: '2027-08-02T10:00:00Z', icon: '🌘', type: 'other', title: 'Solar eclipse (partial from the UK)', desc: 'Total across Spain and North Africa; a partial eclipse from the UK in the late morning. NEVER look at the Sun without certified eclipse glasses or a solar filter.' }
  ];

  let cache = null;

  function lastSunday(year, month) {
    const d = new Date(Date.UTC(year, month + 1, 0, 1));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  }

  function compute(days = 400) {
    if (cache && Date.now() - cache.at < 3600000) return cache.list;
    const loc = App.location();
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + days * DAY);
    const out = [];

    // Moon phases.
    const step = 3 * 3600000;
    let prev = Astro.moonRaDec(start).age;
    const marks = [[0, 'New Moon', '🌑', 'Darkest skies of the month. Best for galaxies and nebulae.'], [7.38, 'First quarter', '🌓', 'Great evening Moon: craters stand out along the terminator.'], [14.77, 'Full Moon', '🌕', 'Bright sky; a good night for the Moon itself, planets and double stars.'], [22.15, 'Last quarter', '🌗', 'Rises around midnight, leaving dark evenings.']];
    for (let t = start.getTime() + step; t < end.getTime(); t += step) {
      const age = Astro.moonRaDec(new Date(t)).age;
      for (const [a, title, icon, desc] of marks) {
        const crossed = a === 0 ? age < prev : prev < a && age >= a;
        if (crossed) out.push({ date: new Date(t - step / 2), type: 'moon', icon, title, desc, short: desc.split('.')[0] + '.', obj: 'moon' });
      }
      prev = age;
    }

    // Meteor showers.
    for (const y of [start.getUTCFullYear(), start.getUTCFullYear() + 1]) {
      for (const [m, d, name, zhr, note] of SHOWERS) {
        const date = new Date(Date.UTC(y, m - 1, d, 2));
        if (date < start || date > end) continue;
        const illum = Astro.moonRaDec(date).illum;
        const moonNote = illum > 0.6 ? ` The Moon is ${Math.round(illum * 100)}% lit, so expect fewer meteors.` : illum < 0.3 ? ' Little moonlight. Good conditions!' : '';
        out.push({ date, type: 'meteor', icon: '🌠', title: `${name} meteor shower peak`, desc: `Up to ~${zhr} meteors/hour under ideal dark skies (fewer from towns). ${note}${moonNote}`, short: `Up to ~${zhr}/hour. ${illum > 0.6 ? 'Moonlit.' : illum < 0.3 ? 'Dark skies!' : ''}` });
      }
    }

    // Planet oppositions and greatest elongations (daily sampling, local maxima).
    for (const p of Astro.PLANETS) {
      let a = null, b = null;
      for (let t = start.getTime() - DAY; t < end.getTime(); t += DAY) {
        const c = Astro.planetRaDec(p, new Date(t)).elongation;
        if (a != null && b != null && b > a && b >= c) {
          const date = new Date(t - DAY);
          const P = Astro.planetRaDec(p, date);
          const name = p[0].toUpperCase() + p.slice(1);
          if (['mars', 'jupiter', 'saturn', 'uranus', 'neptune'].includes(p) && b > 170 && date >= start)
            out.push({ date, type: 'planet', obj: p, icon: '🪐', title: `${name} at opposition`, desc: `${name} is opposite the Sun: up all night, closest and brightest (mag ${P.mag.toFixed(1)}, ${P.diameterArcsec.toFixed(1)}″). The best time of year to observe it.`, short: `Up all night at its brightest, ${P.diameterArcsec.toFixed(1)}″ across.` });
          if ((p === 'mercury' && b > 17) || (p === 'venus' && b > 40)) {
            if (date >= start) {
              const sun = Astro.sunRaDec(date);
              const evening = ((P.ra - sun.ra + 360) % 360) < 180;
              out.push({ date, type: 'planet', obj: p, icon: '✨', title: `${name} at greatest ${evening ? 'evening' : 'morning'} elongation`, desc: `${name} is ${b.toFixed(0)}° from the Sun, its best ${evening ? 'evening (look west after sunset)' : 'morning (look east before sunrise)'} showing.`, short: `Best ${evening ? 'evening' : 'morning'} view, ${b.toFixed(0)}° from the Sun.` });
            }
          }
        }
        a = b;
        b = c;
      }
    }

    // Moon–planet and planet–planet conjunctions (2-hourly sampling).
    const bright = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
    const pairs = [...bright.map((p) => ['moon', p]), ...bright.flatMap((p, i) => bright.slice(i + 1).map((q) => [p, q]))];
    const pos = (n, d) => (n === 'moon' ? Astro.moonRaDec(d) : Astro.planetRaDec(n, d));
    for (const [p, q] of pairs) {
      const limit = p === 'moon' ? 3.5 : 1.5;
      const stepC = p === 'moon' ? 2 * 3600000 : 12 * 3600000;
      let s0 = null, s1 = null;
      for (let t = start.getTime(); t < end.getTime(); t += stepC) {
        const d = new Date(t);
        const A = pos(p, d), B = pos(q, d);
        const s2 = Astro.separation(A.ra, A.dec, B.ra, B.dec);
        if (s0 != null && s1 < s0 && s1 <= s2 && s1 < limit) {
          const date = new Date(t - stepC);
          const sun = Astro.sunRaDec(date);
          const elong = Astro.separation(B.ra, B.dec, sun.ra, sun.dec);
          if (elong > 15) {
            const nm = (x) => (x === 'moon' ? 'Moon' : x[0].toUpperCase() + x.slice(1));
            const evening = ((B.ra - sun.ra + 360) % 360) < 180;
            out.push({ date, type: 'conj', obj: q, icon: '🤝', title: `${nm(p)} meets ${nm(q)}`, desc: `${nm(p)} and ${nm(q)} pass ${s1.toFixed(1)}° apart${p === 'moon' ? '' : ', close enough to share a low-power view'}. Look ${evening ? 'in the evening sky' : 'in the morning sky'}.`, short: `${s1.toFixed(1)}° apart, ${evening ? 'evening' : 'morning'} sky.` });
          }
        }
        s0 = s1;
        s1 = s2;
      }
    }

    // Seasons (Sun's RA crossing 0h/6h/12h/18h).
    const seasons = [[0, 'March equinox', 'Spring begins: equal day and night.'], [90, 'June solstice', 'Longest day. No true darkness in the UK for weeks.'], [180, 'September equinox', 'Autumn begins and the nights draw in fast.'], [270, 'December solstice', 'Longest night of the year!']];
    let ra0 = Astro.sunRaDec(start).ra;
    for (let t = start.getTime() + DAY; t < end.getTime(); t += DAY) {
      const ra = Astro.sunRaDec(new Date(t)).ra;
      for (const [a, title, desc] of seasons) {
        const crossed = a === 0 ? ra < ra0 : ra0 < a && ra >= a;
        if (crossed) out.push({ date: new Date(t), type: 'other', icon: a === 90 ? '☀️' : a === 270 ? '🌌' : '🍂', title, desc, short: desc });
      }
      ra0 = ra;
    }

    // UK clock changes.
    for (const y of [start.getUTCFullYear(), start.getUTCFullYear() + 1]) {
      const back = lastSunday(y, 9), fwd = lastSunday(y, 2);
      if (back >= start && back <= end) out.push({ date: back, type: 'other', icon: '🕰️', title: 'Clocks go back', desc: 'Darkness arrives an hour earlier by the clock: earlier stargazing evenings!', short: 'Darker evenings by the clock.' });
      if (fwd >= start && fwd <= end) out.push({ date: fwd, type: 'other', icon: '🕰️', title: 'Clocks go forward', desc: 'Darkness arrives an hour later by the clock.', short: 'Later darkness by the clock.' });
    }

    for (const f of FIXED) {
      const date = new Date(f.date);
      if (date >= start && date <= end) out.push({ ...f, date, short: f.desc.split('.')[0] + '.' });
    }

    out.sort((x, y) => x.date - y.date);
    cache = { at: Date.now(), list: out, loc };
    return out;
  }

  App.on('location', () => (cache = null));

  window.EventsCalc = {
    upcoming(n = 3) {
      const now = Date.now() - DAY / 2;
      return compute().filter((e) => e.date >= now).slice(0, n);
    }
  };

  async function render(section) {
    section.replaceChildren(el('p', { class: 'empty' }, 'Building your sky calendar…'));
    await new Promise((r) => setTimeout(r, 30));
    const all = compute();
    const objects = await ObjectInfo.objects();
    const thumb = (e) => (e.obj && objects[e.obj]?.image ? el('button', { class: 'ev-thumb', onclick: () => ObjectInfo.open(e.obj), 'aria-label': `About ${e.obj}` }, ObjectInfo.photo(objects[e.obj], 'ev-img')) : null);
    section.replaceChildren();
    const now = Date.now();
    const week = all.filter((e) => e.date - now < 7 * DAY && e.date - now > -DAY / 2);

    section.append(el('div', { class: 'card' },
      el('p', { class: 'kicker' }, 'This week'),
      week.length ? week.map((e) => el('div', { class: 'row', style: 'padding:0.3rem 0' }, el('span', { style: 'font-size:1.3rem' }, e.icon), el('div', { class: 'grow' }, el('strong', {}, e.title), el('div', { class: 'small muted' }, `${e.date.toLocaleDateString('en-GB', { timeZone: App.TZ, weekday: 'long', day: 'numeric', month: 'short' })} · ${e.short}`)))) : el('p', { class: 'muted', style: 'margin:0' }, 'A quiet week. Perfect for deep-sky hunting on clear nights.')));

    const filters = [['all', 'All'], ['moon', 'Moon'], ['meteor', 'Meteors'], ['planet', 'Planets'], ['conj', 'Conjunctions'], ['other', 'Other']];
    let f = 'all';
    const chips = el('div', { class: 'chipbar' });
    const list = el('div', {});
    function draw() {
      chips.replaceChildren(...filters.map(([id, txt]) => el('button', { class: f === id ? 'on' : '', onclick: () => { f = id; draw(); } }, txt)));
      const rows = all.filter((e) => e.date >= now - DAY / 2 && (f === 'all' || e.type === f));
      const out = [];
      let month = '';
      for (const e of rows) {
        const m = e.date.toLocaleDateString('en-GB', { timeZone: App.TZ, month: 'long', year: 'numeric' });
        if (m !== month) out.push(el('p', { class: 'ev-month' }, (month = m)));
        out.push(el('div', { class: 'ev' },
          el('div', { class: 'date' }, el('b', {}, e.date.toLocaleDateString('en-GB', { timeZone: App.TZ, day: 'numeric' })), el('span', {}, e.date.toLocaleDateString('en-GB', { timeZone: App.TZ, weekday: 'short' }))),
          el('div', { class: 'grow' }, el('h4', {}, `${e.icon} ${e.title}`), el('p', {}, e.desc)),
          thumb(e)));
      }
      list.replaceChildren(...(out.length ? out : [el('p', { class: 'empty' }, 'Nothing in this category coming up.')]));
    }
    draw();
    section.append(el('h2', { style: 'font-size:1.15rem;margin:1.2rem 0 0.3rem' }, 'Sky calendar'), el('p', { class: 'small muted', style: 'margin:0 0 0.4rem' }, 'Calculated for your location for the next 12 months. Times are approximate (±a few hours).'), chips, list);

    // News.
    const news = await App.data('news');
    const twoCol = () => {
      const side = el('div', { class: 'col-side' });
      const main = el('div', { class: 'col-main' });
      for (const n of [...section.children]) (n.classList.contains('card') ? side : main).append(n);
      section.replaceChildren(main, side);
      section.classList.add('two-col', 'side-right');
    };
    if (news?.items?.length) {
      section.append(el('div', { class: 'card news' },
        el('h2', {}, 'Astronomy news'),
        news.items.slice(0, 12).map((n) => el('a', { href: n.link, target: '_blank', rel: 'noopener' }, n.title, el('small', {}, `${n.source} · ${new Date(n.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`))),
        el('p', { class: 'small muted', style: 'margin:0.6rem 0 0' }, `Headlines from NASA and ESA, refreshed daily.`)));
    }
    twoCol();
  }

  App.register('events', { render });
})();
