// Celestial object info: a photo, a beginner-friendly description, quick facts,
// and how it rates for your kit tonight. Used by Home, Tonight and the gallery.
(function () {
  'use strict';
  const { el, fmtTime } = App;

  const REALITY = {
    galaxy: 'Photos like this take hours of exposure. Through the eyepiece a galaxy looks like a soft grey glow, brightest in the middle. Seeing light that left millions of years ago is the thrill.',
    nebula: 'Long-exposure photos show colour your eyes can’t. Visually it’s a ghostly grey-green cloud, still beautiful, especially from a dark site.',
    pn: 'Small and surprisingly bright. Expect a little grey or blue-green disc or ring at high power, rather than the colours in the photo.',
    globular: 'At low power it’s a fuzzy ball; at higher power the edges break up into countless pin-point stars.',
    open: 'This one looks great by eye: a scatter of sparkling stars. Use your lowest-power eyepiece.',
    double: 'Two stars close together. Look for the contrasting colours.',
    planet: 'A small, sharp disc. Detail comes and goes as the air steadies, so keep watching for those moments.',
    moon: 'Spectacular in any telescope, and bright enough to dazzle. A Moon filter helps.'
  };

  const objectsData = () => App.data('objects').then((d) => d?.objects || {});

  function photo(info, cls) {
    return info?.image
      ? el('img', { class: cls, src: info.image, alt: '', loading: 'lazy', decoding: 'async' })
      : el('div', { class: cls + ' noimg', 'aria-hidden': 'true' }, '✦');
  }

  function factRow(k, v) {
    return v ? el('div', {}, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v)) : null;
  }

  function sizeText(t, pos) {
    if (t.type === 'planet' || t.type === 'moon') return pos ? (pos.diameterArcsec > 120 ? `${(pos.diameterArcsec / 60).toFixed(1)}′ across` : `${pos.diameterArcsec.toFixed(1)}″ across`) : null;
    if (t.type === 'double') return `${t.sep}″ apart`;
    return t.w >= 1 ? `${Math.round(t.w)}′ × ${Math.round(t.h)}′` : `${Math.round(t.w * 60)}″`;
  }

  function distanceText(t, info, pos) {
    if (t.type === 'planet' && pos) {
      const km = pos.distance * 149.6e6;
      return `${(km / 1e6).toFixed(0)} million km (${(pos.distance * 8.317).toFixed(0)} light-minutes)`;
    }
    return info?.distance || null;
  }

  // Open the sheet for a target id. `entry` (from the tonight plan) is optional.
  async function open(id) {
    const [objects, targets, P] = await Promise.all([objectsData(), App.data('targets'), window.Planner ? Planner.get().catch(() => null) : null]);
    const t = [...(targets?.solarSystem || []), ...(targets?.deepSky || [])].find((x) => x.id === id);
    if (!t) return;
    const info = objects[id];
    const entry = P?.plan.find((e) => e.target.id === id) || null;
    const pos = t.type === 'planet' ? Astro.planetRaDec(t.id, new Date()) : t.type === 'moon' ? Astro.moonRaDec(new Date()) : null;
    const k = P?.k;
    const vis = entry?.visual;
    const img = entry?.imaging;
    const hasGoto = k?.mount?.handset && ['altaz-goto', 'eq-goto'].includes(k.mount.type);
    const title = t.common && t.common !== t.name ? t.common : t.name;

    App.sheet(title,
      el('figure', { class: 'obj-hero' },
        photo(info, 'obj-img'),
        info?.imageCredit ? el('figcaption', {}, 'Image: ', info.imageSource ? el('a', { href: info.imageSource, target: '_blank', rel: 'noopener' }, info.imageCredit) : info.imageCredit) : null),
      el('div', { class: 'row wrap', style: 'gap:0.4rem;margin:0.2rem 0 0.6rem' },
        el('span', { class: 'pill-type' }, `${App.TYPE_ICON[t.type] || ''} ${App.TYPE_NAME[t.type] || ''}`),
        t.name !== title ? el('span', { class: 'pill-type' }, t.name) : null,
        info?.constellation ? el('span', { class: 'pill-type' }, `in ${info.constellation}`) : null),

      el('h4', { class: 'sheet-h' }, 'What is it?'),
      el('p', { class: 'obj-text' }, info?.summary || t.desc),
      info?.url ? el('p', { class: 'small muted' }, el('a', { href: info.url, target: '_blank', rel: 'noopener' }, 'Read more on Wikipedia →')) : null,

      el('div', { class: 'stats' },
        factRow('Distance', distanceText(t, info, pos)),
        factRow('Brightness', t.type === 'moon' ? `${Math.round((pos?.illum || 0) * 100)}% lit` : `mag ${(t.type === 'planet' && pos ? pos.mag : t.mag).toFixed(1)}`),
        factRow('Size in the sky', sizeText(t, pos)),
        entry ? factRow('Best tonight', `${fmtTime(entry.best.t)} · ${Math.round(entry.best.alt)}° ${App.compass(entry.best.az)}`) : factRow('Tonight', 'Not well placed'),
        entry ? factRow('Right now', entry.now.alt > 0 ? `${Math.round(entry.now.alt)}° high, ${App.compass(entry.now.az)}` : 'Below the horizon') : null),

      vis || img ? el('h4', { class: 'sheet-h' }, 'Through your telescope') : null,
      vis ? el('div', { class: 'row', style: 'align-items:flex-start' }, App.scoreRing(vis.score), el('div', { class: 'grow' },
        el('strong', { class: 'lbl-' + App.scoreClass(vis.score) }, `Viewing: ${vis.label}`),
        vis.view ? el('div', { class: 'small' }, `Use ${vis.view.label} (${Math.round(vis.view.mag)}×)`) : null,
        el('ul', { class: 'reasons' }, vis.reasons.map((r) => el('li', {}, r))))) : null,
      img ? el('div', { class: 'row', style: 'align-items:flex-start;margin-top:0.6rem' }, App.scoreRing(img.score), el('div', { class: 'grow' },
        el('strong', { class: 'lbl-' + App.scoreClass(img.score) }, `Photography: ${img.label}`),
        el('ul', { class: 'reasons' }, img.reasons.map((r) => el('li', {}, r))))) : null,
      el('p', { class: 'reality' }, '👁 ', REALITY[t.type] || ''),

      hasGoto && t.hc ? el('div', { class: 'goto' }, '🎯 GoTo: ', t.hc, ' → ENTER') : null,
      el('p', { class: 'small muted', style: 'margin-top:0.8rem' }, info?.textCredit ? `Description: ${info.textCredit}.` : ''));
  }

  // Grid of every object, grouped by type: a visual way to explore.
  async function gallery() {
    const [objects, targets, P] = await Promise.all([objectsData(), App.data('targets'), window.Planner ? Planner.get().catch(() => null) : null]);
    const all = [...(targets?.solarSystem || []), ...(targets?.deepSky || [])];
    const groups = [['Moon & planets', ['moon', 'planet']], ['Nebulae', ['nebula', 'pn']], ['Galaxies', ['galaxy']], ['Star clusters', ['globular', 'open']], ['Double stars', ['double']]];
    const up = new Set((P?.plan || []).map((e) => e.target.id));
    App.sheet('Explore the sky',
      el('p', { class: 'small muted', style: 'margin-top:0' }, 'Tap anything to learn about it. ✓ = visible from your location tonight.'),
      groups.map(([label, types]) => el('section', {},
        el('h4', { class: 'sheet-h' }, label),
        el('div', { class: 'gal' }, all.filter((t) => types.includes(t.type)).map((t) =>
          el('button', { class: 'gal-tile', onclick: () => open(t.id), 'aria-label': t.common || t.name },
            photo(objects[t.id], 'gal-img'),
            el('span', { class: 'gal-name' }, (up.has(t.id) ? '✓ ' : '') + (t.common && t.common.length < 22 ? t.common : t.name))))))));
  }

  window.ObjectInfo = { open, gallery, photo, objects: objectsData };
})();
