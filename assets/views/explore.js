// Explore tab: a photo gallery of every object, with search and filters.
(function () {
  'use strict';
  const { el } = App;

  const GROUPS = [
    ['all', 'All', null],
    ['tonight', 'Up tonight', null],
    ['solar', 'Moon & planets', ['moon', 'planet']],
    ['neb', 'Nebulae', ['nebula', 'pn']],
    ['gal', 'Galaxies', ['galaxy']],
    ['clu', 'Clusters', ['globular', 'open']],
    ['dbl', 'Double stars', ['double']]
  ];

  async function render(section) {
    section.replaceChildren(el('p', { class: 'empty' }, 'Loading the sky…'));
    const [objects, targets, P] = await Promise.all([ObjectInfo.objects(), App.data('targets'), Planner.get().catch(() => null)]);
    const all = [...(targets?.solarSystem || []), ...(targets?.deepSky || [])];
    const byId = new Map((P?.plan || []).map((e) => [e.target.id, e]));
    let group = App.store.get('exploreGroup', 'all');
    let query = '';

    const search = el('input', { type: 'search', id: 'exploreSearch', placeholder: 'Search, e.g. “Orion”, “M31”, “ring”', 'aria-label': 'Search objects' });
    const chips = el('div', { class: 'chipbar' });
    const grid = el('div', { class: 'gal gal-lg' });
    const count = el('p', { class: 'small muted', style: 'margin:0.2rem 0 0.6rem' });

    function draw() {
      chips.replaceChildren(...GROUPS.map(([id, label]) => el('button', { class: group === id ? 'on' : '', onclick: () => { group = id; App.store.set('exploreGroup', id); draw(); } }, label)));
      const q = query.trim().toLowerCase();
      const types = GROUPS.find((g) => g[0] === group)?.[2];
      const rows = all.filter((t) => {
        if (types && !types.includes(t.type)) return false;
        if (group === 'tonight' && !byId.has(t.id)) return false;
        if (!q) return true;
        const info = objects[t.id] || {};
        return [t.id, t.name, t.common, App.TYPE_NAME[t.type], info.constellation, info.title].filter(Boolean).join(' ').toLowerCase().includes(q);
      });
      // Best-rated tonight first, then everything else alphabetically.
      rows.sort((a, b) => (byId.get(b.id)?.kitScore ?? -1) - (byId.get(a.id)?.kitScore ?? -1) || (a.common || a.name).localeCompare(b.common || b.name));
      count.textContent = `${rows.length} object${rows.length === 1 ? '' : 's'} · ✓ = visible from ${App.location().name.split(',')[0]} tonight · tap for details`;
      grid.replaceChildren(...(rows.length ? rows.map((t) => {
        const e = byId.get(t.id);
        const r = e ? e.visual ?? e.imaging : null;
        return el('button', { class: 'gal-tile', onclick: () => ObjectInfo.open(t.id), 'aria-label': `${t.common || t.name}${r ? ', ' + r.label : ''}` },
          ObjectInfo.photo(objects[t.id], 'gal-img'),
          r ? el('span', { class: 'hl-score s-' + App.scoreClass(r.score) }, r.score) : null,
          el('span', { class: 'gal-name' }, (e ? '✓ ' : '') + (t.common && t.common.length < 24 ? t.common : t.name)),
          el('span', { class: 'gal-sub' }, `${App.TYPE_NAME[t.type]}${objects[t.id]?.constellation ? ' · ' + objects[t.id].constellation : ''}`));
      }) : [el('p', { class: 'empty' }, 'No objects match. Try another search.')]));
    }
    search.addEventListener('input', () => { query = search.value; draw(); });

    section.replaceChildren(
      el('div', { class: 'explore-head' },
        el('p', { class: 'kicker', style: 'margin-top:1rem' }, 'Explore the sky'),
        el('h2', { class: 'explore-title' }, 'Planets, nebulae, galaxies and star clusters'),
        el('p', { class: 'muted', style: 'margin:0.2rem 0 0.8rem' }, 'Photos and plain-English guides to everything in SimpleSky. Scores show how each one rates for your kit tonight.')),
      search, chips, count, grid);
    draw();
  }

  App.register('explore', { render });
})();
