// Kit model + rating engine.
//
// Ratings are heuristics built on standard observing formulae (Dawes limit,
// limiting magnitude, surface brightness vs sky brightness, field of view,
// field rotation, focal ratio). They answer "how good will this look with MY
// kit tonight", on a 0–100 scale, with plain-English reasons.
(function (global) {
  'use strict';

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const log2 = Math.log2;
  const log10 = Math.log10;

  // ------------------------------------------------------------------ kit
  // New users start with the naked eye, so Tonight works before any kit is added.
  const DEFAULT_KIT = {
    starter: true,
    active: 's1',
    setups: [
      {
        id: 's1',
        name: 'Naked eye',
        scopeId: 'naked-eye',
        scope: { name: 'Naked eye', type: 'eye', aperture: 7, focal: null, magnification: 1, field: 120 },
        mode: 'allinone',
        mountId: 'handheld',
        eyepieces: [],
        barlowId: null,
        reducerId: null,
        diagonalId: null,
        finderId: null,
        cameraId: null,
        filters: []
      }
    ]
  };

  const Kit = {
    get() {
      return App.store.get('kit', null) || structuredClone(DEFAULT_KIT);
    },
    save(kit) {
      kit.starter = false;
      App.store.set('kit', kit);
      App.emit('kit', kit);
    },
    active(kit = Kit.get()) {
      return kit.setups.find((s) => s.id === kit.active) || kit.setups[0] || null;
    },
    newId: () => 's' + Math.random().toString(36).slice(2, 8)
  };

  // -------------------------------------------------------------- derived
  const NELM = (b) => 7.6 - 0.5 * (clamp(b, 1, 9) - 1);
  const SQM = { 1: 21.9, 2: 21.6, 3: 21.4, 4: 20.8, 5: 20.3, 6: 19.5, 7: 18.9, 8: 18.4, 9: 17.8 };
  const sqmFor = (b) => SQM[clamp(Math.round(b), 1, 9)];

  function derive(setup, gear) {
    if (!setup?.scope) return null;
    const D = Number(setup.scope.aperture);
    const F = Number(setup.scope.focal);
    const find = (list, id) => (gear?.[list] || []).find((x) => x.id === id) || null;
    const mount = find('mounts', setup.mountId);
    const barlow = find('barlows', setup.barlowId);
    const reducer = find('reducers', setup.reducerId);
    const camera = find('cameras', setup.cameraId);
    const type = setup.scope.type;
    const views = [];
    // Binoculars and the naked eye have one fixed view; telescopes use their eyepieces.
    if (type === 'binoculars' || type === 'eye') {
      const mag = Number(setup.scope.magnification) || 1;
      views.push({ label: type === 'eye' ? 'Naked eye' : `${mag}× binoculars`, mag, tfov: (Number(setup.scope.field) || 6) * 60, exit: D / mag, fixed: true });
    }
    for (const ep of type === 'lens' || type === 'binoculars' || type === 'eye' ? [] : setup.eyepieces || []) {
      const f = Number(ep.focal);
      if (!f) continue;
      const add = (factor, label) => {
        const mag = (F * factor) / f;
        views.push({ label, mag, tfov: (ep.afov / mag) * 60, exit: D / mag, focal: f, barlow: factor > 1 });
      };
      add(1, `${f} mm`);
      if (barlow) add(barlow.factor, `${f} mm + ${barlow.factor}× Barlow`);
    }
    views.sort((a, b) => a.mag - b.mag);
    const fixedView = type === 'binoculars' || type === 'eye';
    const maxUseful = fixedView ? views[0].mag : Math.min(2 * D, 350);
    return {
      setup,
      type,
      D,
      F: F || 0,
      fr: F ? F / D : 0,
      mount,
      barlow,
      reducer,
      camera,
      views,
      maxUseful,
      minUseful: D / 7,
      res: type === 'eye' ? 60 : 116 / D,
      widest: views.reduce((m, v) => (v.barlow ? m : Math.max(m, v.tfov)), 0) || (setup.scope.type === 'smart' ? 0 : 0),
      hasFilter: (id) => (setup.filters || []).includes(id),
      lightGrasp: (D / 7) ** 2
    };
  }

  const labelFor = (s) => (s == null ? '–' : s >= 80 ? 'Excellent' : s >= 65 ? 'Good' : s >= 45 ? 'Fair' : s >= 25 ? 'Tough' : 'Not practical');

  function sbAvg(t) {
    return t.mag + 2.5 * log10((Math.PI / 4) * t.w * t.h * 3600);
  }

  function altFactor(alt, planet) {
    if (alt == null || alt < 5) return 0;
    if (alt < 15) return planet ? 0.45 : 0.4;
    if (alt < 25) return planet ? 0.7 : 0.78;
    if (alt < 35) return 0.9;
    return 1;
  }

  function nearestView(views, wantMag, maxMag) {
    const ok = views.filter((v) => v.mag <= maxMag * 1.05);
    const pool = ok.length ? ok : views;
    return pool.reduce((best, v) => (!best || Math.abs(log2(v.mag / wantMag)) < Math.abs(log2(best.mag / wantMag)) ? v : best), null);
  }

  function planetBase(p, k) {
    if (p.elongation < 12) return 0;
    return clamp(20 * log2(Math.max(p.diameterArcsec / k.res, 1)) + 10, 5, 98);
  }

  // ----------------------------------------------------------- visual rating
  // ctx: { k (derived kit), bortle, alt, moon: { illum, sep, up }, pos (planet/moon extras) }
  function visual(t, ctx) {
    const k = ctx.k;
    const reasons = [];
    let score;
    let view = null;
    // Smart scopes and camera lenses are camera-only; see imaging().
    if (k.type === 'smart' || k.type === 'lens') return null;
    const simple = k.type === 'eye' || k.type === 'binoculars';
    if (!k.views.length) reasons.push('Add an eyepiece in My Kit for magnification advice.');

    if (t.type === 'moon') {
      score = k.type === 'eye' ? 80 : k.type === 'binoculars' ? 90 : 95;
      const age = ctx.pos?.age ?? 7;
      if (age > 12.5 && age < 16.5) reasons.push('Near full: bright and flat-looking. A Moon filter helps; the best detail is near the edge.');
      else reasons.push('Look along the terminator (the day–night line) for craters in deep shadow.');
      view = nearestView(k.views, Math.min(k.maxUseful * 0.6, 150), k.maxUseful);
    } else if (t.type === 'planet') {
      const p = ctx.pos;
      if (p.elongation < 12) return { score: 0, label: 'Not practical', reasons: ['Too close to the Sun right now. Never point a telescope near the Sun.'] };
      const detail = p.diameterArcsec / k.res;
      score = planetBase(p, k);
      if (simple) {
        const lmS = NELM(ctx.bortle) + (k.type === 'binoculars' ? 5 * log10(k.D / 7) : 0);
        const mag = k.views[0].mag;
        const notes = {
          jupiter: mag >= 7 ? [78, 'Look for up to four of its moons in a line either side.'] : [70, 'Brilliant cream-coloured “star”.'],
          saturn: mag >= 15 ? [60, 'Looks oval; at 15×+ you may glimpse the rings as “ears”.'] : [55, 'A steady golden “star”.'],
          venus: [72, mag >= 10 ? 'Brilliant; you may make out its crescent or gibbous phase.' : 'The brightest “star” in the sky.'],
          mars: [55, 'A distinctly orange-red “star”.'],
          mercury: [45, 'Low in twilight; a satisfying catch.'],
          uranus: [k.type === 'eye' ? 15 : 40, 'A faint blue-green “star”. You need a finder chart.'],
          neptune: [k.type === 'eye' ? 3 : 22, 'A faint blue “star”. A challenge.']
        };
        const [base, note] = notes[t.id] || [40, ''];
        score = p.mag < lmS - 0.3 ? base : 5;
        reasons.length = 0;
        reasons.push(p.mag < lmS - 0.3 ? note : `At magnitude ${p.mag.toFixed(1)} it’s too faint for ${k.type === 'eye' ? 'the naked eye' : 'these binoculars'} here.`, 'A telescope is needed for surface detail.');
        view = k.views[0];
        const af2 = altFactor(ctx.alt, true);
        if (af2 < 1 && ctx.alt != null) reasons.push(`Not very high (${Math.round(ctx.alt)}°).`);
        const sc = Math.round(clamp(score * af2, 0, 99));
        return { score: sc, label: labelFor(sc), reasons, view };
      }
      reasons.push(`${p.diameterArcsec.toFixed(1)}″ across; your ${k.D} mm aperture resolves ${k.res.toFixed(2)}″.`);
      if (detail > 15) reasons.push(t.id === 'saturn' ? 'Rings and the Cassini Division on steady nights.' : t.id === 'jupiter' ? 'Cloud belts, moons and maybe the Great Red Spot.' : 'Plenty of resolution for surface detail.');
      else if (detail > 5) reasons.push('A small disc; detail needs steady air.');
      else reasons.push('Just a tiny disc. Seeing it is the achievement.');
      if (t.id === 'venus' || t.id === 'mercury') reasons.push('Shows a phase. Best in twilight before it sinks low.');
      const want = Math.min(k.maxUseful * 0.85, 60 * (k.D / 25.4) * 0.8, 250);
      view = nearestView(k.views, want, k.maxUseful);
    } else if (t.type === 'double') {
      const ratio = t.sep / k.res;
      const needMag = 240 / t.sep;
      score = ratio < 1 ? 15 : ratio < 1.6 ? 55 : 80;
      if (ratio < 1) reasons.push(`Separation ${t.sep}″ is below your ${k.res.toFixed(1)}″ resolution limit.`);
      else reasons.push(`Splits at about ${Math.ceil(needMag)}× (separation ${t.sep}″).`);
      const maxView = k.views.length ? k.views[k.views.length - 1].mag : 0;
      if (maxView && maxView < needMag) {
        score -= 20;
        reasons.push(`Your highest power is ${Math.round(maxView)}×; a shorter eyepiece or Barlow would help.`);
      }
      view = nearestView(k.views, Math.max(needMag * 1.5, 60), k.maxUseful);
    } else {
      // Deep sky.
      const sqm = sqmFor(ctx.bortle);
      const lm = NELM(ctx.bortle) + 5 * log10(k.D / 7) - (k.type === 'eye' ? 0 : 0.5);
      const margin = lm - t.mag;
      const ap = 2.5 * log10(Math.max(k.D, 25) / 80);
      if (t.type === 'open') {
        score = 58 + Math.min(30, margin * 3);
      } else {
        const diff = sbAvg(t) - (t.core || 0) - sqm;
        score = 80 - 20 * (diff - ap) + Math.min(15, margin * 2);
      }
      if (margin < 2) score -= (2 - margin) * 15;
      if (t.type === 'pn') score = Math.min(score, 75 + margin * 4);
      if (margin < 0) {
        score = Math.min(score, 10);
        reasons.push(`Magnitude ${t.mag} is fainter than your scope's limit (~${lm.toFixed(1)}) under Bortle ${ctx.bortle} skies.`);
      }
      const nebula = t.type === 'nebula' || t.type === 'pn';
      if (nebula && (k.hasFilter('uhc') || k.hasFilter('oiii'))) {
        score += 10;
        reasons.push('Your UHC/OIII filter boosts the contrast.');
      }
      if (ctx.bortle >= 6 && (t.type === 'galaxy' || t.type === 'nebula') && score < 70) reasons.push('Light pollution washes out faint detail. A darker site makes a big difference.');
      const big = Math.max(t.w, t.h);
      if (k.widest && big > k.widest * 1.3) {
        const pen = Math.min(t.type === 'open' ? 30 : 20, (t.type === 'open' ? 12 : 8) * log2(big / k.widest));
        score -= pen;
        reasons.push(`Spans ${Math.round(big)}′ but your widest view is ${Math.round(k.widest)}′, so you'll see the middle part.`);
      }
      if (big < 1.5 && t.type === 'pn') reasons.push('Tiny but bright; use high power.');
      if (t.type === 'globular') reasons.push(k.D >= 120 ? 'Should start resolving into stars at high power.' : 'A fuzzy ball; resolving stars needs more aperture.');
      const want = t.type === 'pn' && big < 2 ? 150 : t.type === 'globular' ? 120 : t.type === 'galaxy' ? 60 : 40;
      view = nearestView(k.views, Math.min(want, k.maxUseful), k.maxUseful);
      if (big > 20) view = k.views.find((v) => !v.barlow) || view;
      // Moon interference.
      if (ctx.moon?.up && ctx.moon.illum > 0.25) {
        const pen = ctx.moon.illum * 35 * Math.max(0, 1 - ctx.moon.sep / 120);
        if (pen > 3) {
          score -= pen;
          reasons.push(`The ${Math.round(ctx.moon.illum * 100)}% Moon is ${Math.round(ctx.moon.sep)}° away, which brightens the sky.`);
        }
      }
    }
    const af = altFactor(ctx.alt, t.type === 'planet' || t.type === 'moon');
    if (af < 1 && ctx.alt != null) reasons.push(ctx.alt < 15 ? `Low (${Math.round(ctx.alt)}°): looking through lots of turbulent air.` : `Not very high (${Math.round(ctx.alt)}°).`);
    score = Math.round(clamp(score * af, 0, 99));
    return { score, label: labelFor(score), reasons, view };
  }

  // ---------------------------------------------------------- imaging rating
  function imaging(t, ctx) {
    const k = ctx.k;
    const cam = k.camera;
    if (!cam || k.type === 'eye' || k.type === 'binoculars') return null;
    const reasons = [];
    let score;
    const kind = cam.kind;
    const mountType = k.mount?.type || 'altaz-manual';
    if (mountType === 'handheld' && t.type !== 'moon') return mk(5, ['Hand-held is too shaky for this. Put the camera on a tripod.']);

    if (kind === 'phone') {
      if (t.type === 'moon') return mk(85, ['Hold the phone to a low-power eyepiece; tap to focus, then lower exposure.']);
      if (t.type === 'planet') {
        return mk(Math.min(60, planetBase(ctx.pos, k) * 0.6), ['Record video through a high-power eyepiece, then stack it. Small but doable.']);
      }
      if (t.mag < 5 && (t.type === 'nebula' || t.type === 'open' || t.type === 'double')) return mk(30, ['Use night mode on a steady mount; expect a faint smudge.']);
      return mk(8, ["A phone can't gather enough light for this through the eyepiece."]);
    }

    const ideal = 5 * cam.px; // colour planetary sampling rule of thumb
    if (t.type === 'planet' || t.type === 'moon') {
      const options = [{ fr: k.fr, label: 'prime focus' }];
      if (k.barlow) options.push({ fr: k.fr * k.barlow.factor, label: `${k.barlow.factor}× Barlow` });
      const best = options.reduce((a, o) => (Math.abs(log2(o.fr / ideal)) < Math.abs(log2(a.fr / ideal)) ? o : a));
      const sampling = clamp(1 - Math.abs(log2(best.fr / ideal)) * 0.35, 0.5, 1);
      const kindF = { astro: 1, dslr: 0.8, mirrorless: 0.75, smart: 0.55 }[kind] ?? 0.7;
      const fl = best.fr * k.D;
      const scale = (206.265 * cam.px) / fl;
      if (t.type === 'moon') {
        const fovMin = (Math.min(cam.w, cam.h) / (k.F * (k.reducer?.factor || 1))) * 3437.75;
        score = fovMin >= 31 ? 92 : 80;
        reasons.push(fovMin >= 31 ? 'The whole Moon fits in one frame.' : `Field is ${Math.round(fovMin)}′, so shoot a mosaic for the full Moon (or close-ups).`);
      } else {
        score = planetBase(ctx.pos, k) * sampling * kindF;
        if (ctx.pos.elongation < 12) reasons.push('Too close to the Sun right now.');
        const px = ctx.pos.diameterArcsec / scale;
        if (px < 8) {
          score = Math.min(score, 25);
          reasons.push(`Only ≈${Math.max(1, Math.round(px))} px across at ${Math.round(fl)} mm: it’ll be a bright dot${t.id === 'jupiter' ? ', but you can catch its four moons' : ''}. A telescope gives real detail.`);
        } else
        reasons.push(`Shoot video at ${best.label} (f/${best.fr.toFixed(0)}; ideal ≈f/${ideal.toFixed(0)}), so the planet is ≈${Math.round(px)} px across.`);
        if (kind !== 'astro') reasons.push(kind === 'dslr' ? 'Use movie-crop / 640×480 mode if your camera has it.' : 'A dedicated planetary camera would do better.');
        reasons.push('Stack the best 10–25% of frames in AutoStakkert.');
      }
      return mk(score * altFactor(ctx.alt, true), reasons);
    }

    // Deep sky.
    if (t.type === 'double') return mk(70 * altFactor(ctx.alt), ['Short exposures, easy colourful result.']);
    const fe = k.F * (k.reducer?.factor || 1);
    const fr = fe / k.D;
    let sub;
    const corner = Math.hypot(cam.w, cam.h) / 2 / (cam.px / 1000);
    if (mountType === 'smart' || kind === 'smart') {
      sub = 10;
      reasons.push('Smart scope: auto-stacks 10 s frames and handles field rotation.');
    } else if (mountType === 'altaz-goto') {
      const track = (k.mount.track1000 * 1000) / fe;
      const w = Astro.fieldRotationRate(Math.max(ctx.alt || 30, 10), ctx.az ?? 180, ctx.lat ?? 51);
      const rot = 1 / (corner * w);
      sub = Math.min(track, rot);
      reasons.push(`Alt-az mount: subs ≈${sub < 10 ? sub.toFixed(1) : Math.round(sub)} s (${rot < track ? 'field rotation' : 'tracking'} limited).`);
    } else if (mountType === 'eq-goto' || mountType === 'tracker') {
      sub = Math.min(300, (k.mount.track1000 * 1000) / fe);
      if (mountType === 'tracker' && fe > 600) reasons.push('A star tracker struggles to carry and track this focal length.');
      reasons.push(`Equatorial tracking: ≈${Math.round(sub)} s subs unguided.`);
    } else {
      // No tracking: the "500 rule" keeps stars round for about 500 ÷ (focal length × crop factor) seconds.
      const crop = 43.27 / Math.hypot(cam.w, cam.h);
      sub = Math.min(30, 500 / (fe * crop));
      if (sub < 0.5) return mk(t.mag < 5 && t.type !== 'galaxy' ? 12 : 3, ['No motorised tracking: at this focal length stars trail in under half a second. Only the Moon and planets (as video) are practical.']);
      reasons.push(`No tracking: keep exposures to ≈${sub < 10 ? sub.toFixed(1) : Math.round(sub)} s (the 500 rule) and stack lots of them.`);
    }
    if (mountType === 'tracker' && fe > 600) sub = Math.min(sub, 5);
    const sqm = sqmFor(ctx.bortle);
    const speed = sub / (fr * fr);
    const C = 2.5 * log10(speed / 1.2);
    const difficulty = (t.type === 'open' ? t.mag + 14.5 : sbAvg(t) - (t.core || 0)) - 20;
    const x = difficulty - C + (20.3 - sqm) * 0.6;
    score = 132 - 16 * x;
    if (sub < 15 && cam.rn > 2) {
      score -= 8;
      reasons.push(`Higher read noise (${cam.rn} e⁻) costs you on short subs.`);
    }
    const fw = (cam.w / fe) * 3437.75;
    const fh = (cam.h / fe) * 3437.75;
    const inFrame = Math.min(1, Math.max(fw, fh) / Math.max(t.w, t.h)) * Math.min(1, Math.min(fw, fh) / Math.min(t.w, t.h));
    if (inFrame < 0.35) {
      score = Math.min(score - ((t.core || 0) >= 1 ? 6 : 15), 70);
      reasons.push(`Frame is ${Math.round(fw)}′×${Math.round(fh)}′: only the core of this ${Math.round(Math.max(t.w, t.h))}′ target fits.`);
    } else if ((t.w * t.h) / (fw * fh) < 0.01) {
      score = Math.min(score - 12, 78);
      reasons.push('Small in the frame. Crop the result, or use more focal length.');
    } else reasons.push(`Frames nicely (${Math.round(fw)}′×${Math.round(fh)}′ field).`);
    if (ctx.moon?.up && ctx.moon.illum > 0.3) {
      const pen = ctx.moon.illum * 25 * Math.max(0, 1 - ctx.moon.sep / 120);
      if (pen > 3) {
        score -= pen;
        reasons.push('Moonlight adds noise. Choose another night or use a narrowband filter.');
      }
    }
    const mins = Math.round(clamp(15 * 2 ** (x - 3), 10, 240));
    const frames = Math.ceil((mins * 60) / Math.max(sub, 1));
    reasons.push(`Aim for ~${mins >= 60 ? (mins / 60).toFixed(1) + ' h' : mins + ' min'} total (${frames.toLocaleString('en-GB')} × ${sub < 10 ? sub.toFixed(1) : Math.round(sub)} s).`);
    return { ...mk(score * altFactor(ctx.alt), reasons), sub, frames, minutes: mins };

    function mk(s, r) {
      const sc = Math.round(clamp(s, 0, 99));
      return { score: sc, label: labelFor(sc), reasons: r };
    }
  }

  // -------------------------------------------------------------- planning
  function positionOf(t, date) {
    if (t.type === 'moon') return Astro.moonRaDec(date);
    if (t.type === 'planet') return Astro.planetRaDec(t.id, date);
    return t;
  }

  // Build tonight's plan: every target with its best time, altitude, cloud and ratings.
  function plan({ targets, k, loc, night, hours, now = new Date() }) {
    const list = [...targets.solarSystem, ...targets.deepSky];
    const start = night.isDark ? now : night.start;
    const end = night.end;
    const times = [];
    for (let ms = start.getTime(); ms <= end.getTime(); ms += 15 * 60000) times.push(new Date(ms));
    if (!times.length) times.push(now);
    // Planets and the Moon also count in twilight (from sunset).
    const twiStart = night.sunset && night.sunset < start ? night.sunset : start;
    const twiTimes = [];
    for (let ms = Math.max(twiStart.getTime(), night.isDark ? now.getTime() : twiStart.getTime()); ms <= end.getTime(); ms += 15 * 60000) twiTimes.push(new Date(ms));
    const moonAt = new Map(times.concat(twiTimes).map((d) => [d.getTime(), { ...Astro.moonRaDec(d), ...Astro.moonAltAz(d, loc.lat, loc.lon) }]));
    const hourFor = (d) => (hours || []).find((h) => Math.abs(h.t - d) <= 30 * 60000) || null;

    const out = [];
    for (const t of list) {
      const ts = t.type === 'planet' || t.type === 'moon' ? twiTimes : times;
      let best = null;
      const samples = [];
      for (const d of ts) {
        const p = positionOf(t, d);
        const aa = t.type === 'moon' ? { alt: moonAt.get(d.getTime()).alt, az: moonAt.get(d.getTime()).az } : Astro.altAz(p.ra, p.dec, d, loc.lat, loc.lon);
        if (aa.alt < 8) continue;
        if (samples.length === 0 || d - samples[samples.length - 1].t >= 30 * 60000) samples.push({ t: d, alt: aa.alt, az: aa.az });
        const h = hourFor(d);
        const clear = h ? App.hourScore(h) : null;
        // Prefer high altitude, nudged towards clearer hours.
        const key = aa.alt + (clear == null ? 0 : clear * 0.25);
        if (!best || key > best.key) best = { key, t: d, alt: aa.alt, az: aa.az, pos: p, clear };
      }
      if (!best) continue;
      best.samples = samples;
      const m = moonAt.get(best.t.getTime());
      const moon = t.type === 'moon' ? null : { illum: m.illum, up: m.alt > 0, sep: Astro.separation(m.ra, m.dec, best.pos.ra, best.pos.dec) };
      const ctx = { k, bortle: loc.bortle || 6, alt: best.alt, az: best.az, lat: loc.lat, moon, pos: best.pos };
      const vis = visual(t, ctx);
      let img = imaging(t, ctx);
      // On alt-az mounts the highest point is the worst for field rotation, so
      // look for the best imaging moment separately.
      if (img && k.camera && t.type !== 'planet' && t.type !== 'moon') {
        for (const smp of best.samples) {
          if (smp.alt < 20) continue;
          const mm = moonAt.get(smp.t.getTime());
          const c2 = { ...ctx, alt: smp.alt, az: smp.az, moon: { illum: mm.illum, up: mm.alt > 0, sep: Astro.separation(mm.ra, mm.dec, best.pos.ra, best.pos.dec) } };
          const alt2 = imaging(t, c2);
          if (alt2.score > img.score) img = { ...alt2, at: smp.t };
        }
      }
      const nowPos = positionOf(t, now);
      const nowAa = t.type === 'moon' ? Astro.moonAltAz(now, loc.lat, loc.lon) : Astro.altAz(nowPos.ra, nowPos.dec, now, loc.lat, loc.lon);
      const main = vis ?? img;
      const kitScore = main?.score ?? 0;
      out.push({
        target: t,
        best,
        now: nowAa,
        visual: vis,
        imaging: img,
        kitScore,
        tonight: Math.round(kitScore * (best.clear == null ? 1 : 0.35 + 0.65 * (best.clear / 100)))
      });
    }
    return out.sort((a, b) => b.tonight - a.tonight || b.kitScore - a.kitScore);
  }

  // Three bright, well-spread alignment stars for SkyAlign / 2-star align.
  function alignStars(stars, date, loc) {
    const up = stars
      .map((s) => ({ ...s, ...Astro.altAz(s.ra, s.dec, date, loc.lat, loc.lon) }))
      .filter((s) => s.alt > 20 && s.alt < 75 && s.name !== 'Polaris')
      .sort((a, b) => a.mag - b.mag)
      .slice(0, 14);
    let best = null;
    const azd = (a, b) => Math.min(Math.abs(a.az - b.az), 360 - Math.abs(a.az - b.az));
    for (let i = 0; i < up.length; i++)
      for (let j = i + 1; j < up.length; j++)
        for (let l = j + 1; l < up.length; l++) {
          const s = [up[i], up[j], up[l]];
          const spread = Math.min(azd(s[0], s[1]), azd(s[1], s[2]), azd(s[0], s[2]));
          const key = spread - (s[0].mag + s[1].mag + s[2].mag) * 8;
          if (!best || key > best.key) best = { key, stars: s };
        }
    return best ? best.stars : up.slice(0, 3);
  }

  global.Kit = Kit;
  global.Rating = { derive, visual, imaging, plan, alignStars, labelFor, sbAvg, NELM, sqmFor };
})(window);
