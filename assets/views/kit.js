// My Kit tab: search for a telescope, build up parts on a diagram, see what it can do.
(function () {
  'use strict';
  const { el } = App;

  const PARTS = [
    ['tube', 'Telescope'],
    ['mount', 'Mount'],
    ['finder', 'Finder'],
    ['diagonal', 'Diagonal'],
    ['eyepieces', 'Eyepieces'],
    ['barlow', 'Barlow'],
    ['reducer', 'Reducer'],
    ['camera', 'Camera'],
    ['filters', 'Filters']
  ];
  const TYPE_LABEL = { mak: 'Maksutov-Cassegrain', sct: 'Schmidt-Cassegrain', refractor: 'Refractor', newtonian: 'Newtonian reflector', dob: 'Dobsonian', smart: 'Smart telescope' };

  let gear = null;
  let scopes = [];
  let selected = 'tube';

  const byId = (list, id) => (gear?.[list] || []).find((x) => x.id === id);

  function partValue(setup, part) {
    switch (part) {
      case 'tube': return setup.scope ? `${setup.scope.name} (${setup.scope.aperture} mm, f/${(setup.scope.focal / setup.scope.aperture).toFixed(1)})` : null;
      case 'mount': return byId('mounts', setup.mountId)?.name || null;
      case 'finder': return byId('finders', setup.finderId)?.name || null;
      case 'diagonal': return byId('diagonals', setup.diagonalId)?.name || null;
      case 'eyepieces': return (setup.eyepieces || []).length ? setup.eyepieces.map((e) => `${e.focal} mm`).join(', ') : null;
      case 'barlow': return byId('barlows', setup.barlowId)?.name || null;
      case 'reducer': return byId('reducers', setup.reducerId)?.name || null;
      case 'camera': return byId('cameras', setup.cameraId)?.name || null;
      case 'filters': return (setup.filters || []).map((f) => byId('filters', f)?.name).filter(Boolean).join(', ') || null;
    }
    return null;
  }

  // ------------------------------------------------------------- diagram
  function diagram(setup, onPick) {
    const NS = 'http://www.w3.org/2000/svg';
    const type = setup.scope?.type || 'refractor';
    const smart = type === 'smart';
    const has = (p) => !!partValue(setup, p);
    const g = (part, inner, label, lx, ly) =>
      `<g class="part${selected === part ? ' sel' : ''}${has(part) ? '' : ' missing'}" data-part="${part}" tabindex="0" role="button" aria-label="${label}">${inner}<text x="${lx}" y="${ly}">${label}</text></g>`;
    let tube;
    if (smart) tube = `<rect class="shape" x="130" y="60" width="150" height="110" rx="18"/><circle class="shape" cx="205" cy="95" r="22"/>`;
    else if (type === 'mak' || type === 'sct') tube = `<rect class="shape" x="110" y="70" width="170" height="70" rx="10" transform="rotate(-22 195 105)"/><ellipse class="shape" cx="268" cy="70" rx="10" ry="36" transform="rotate(-22 268 70)"/>`;
    else if (type === 'newtonian' || type === 'dob') tube = `<rect class="shape" x="90" y="62" width="230" height="78" rx="8" transform="rotate(-28 205 101)"/>`;
    else tube = `<rect class="shape" x="70" y="85" width="250" height="44" rx="8" transform="rotate(-22 195 107)"/><rect class="shape" x="280" y="40" width="60" height="52" rx="6" transform="rotate(-22 310 66)"/>`;
    const dob = type === 'dob';
    const mount = dob
      ? `<path class="shape" d="M130 185 h150 v95 h-150z M150 185 l20 -40 M260 185 l-20 -40"/>`
      : smart
        ? `<path class="shape" d="M205 175 v30 M205 205 L150 295 M205 205 L205 300 M205 205 L260 295"/>`
        : `<rect class="shape" x="180" y="150" width="50" height="40" rx="8"/><path class="shape" d="M205 190 L140 300 M205 190 L205 305 M205 190 L270 300"/>`;
    const eyeX = type === 'newtonian' || dob ? 245 : 110;
    const eyeY = type === 'newtonian' || dob ? 40 : 160;
    const svg = `
      <svg class="scope-svg" viewBox="0 0 420 320" xmlns="${NS}" role="group" aria-label="Your telescope: tap a part to change it">
        ${g('mount', mount, 'Mount', 290, 290)}
        ${g('tube', tube, smart ? 'Smart telescope' : 'Telescope', smart ? 160 : 292, smart ? 50 : 150)}
        ${smart ? '' : g('finder', `<rect class="shape" x="190" y="38" width="44" height="14" rx="6" transform="rotate(-22 212 45)"/>`, 'Finder', 150, 30)}
        ${smart ? '' : g('diagonal', `<path class="shape" d="M${eyeX - 12} ${eyeY - 10} l16 0 l0 16 z"/>`, 'Diagonal', eyeX - 100, eyeY + 4)}
        ${smart ? '' : g('eyepieces', `<rect class="shape" x="${eyeX - 8}" y="${eyeY - 32}" width="14" height="22" rx="3"/>`, 'Eyepiece', eyeX - 98, eyeY - 18)}
        ${smart ? '' : g('barlow', `<rect class="shape" x="${eyeX + 14}" y="${eyeY + 14}" width="26" height="12" rx="4"/>`, 'Barlow', eyeX + 46, eyeY + 25)}
        ${g('camera', `<rect class="shape" x="${smart ? 300 : 20}" y="${smart ? 120 : 200}" width="44" height="32" rx="6"/><circle class="shape" cx="${smart ? 322 : 42}" cy="${smart ? 136 : 216}" r="8"/>`, 'Camera', smart ? 300 : 18, smart ? 168 : 250)}
        ${smart ? '' : g('filters', `<circle class="shape" cx="370" cy="200" r="16"/>`, 'Filters', 350, 236)}
      </svg>`;
    const wrap = el('div', { html: svg });
    wrap.addEventListener('click', (e) => {
      const p = e.target.closest('[data-part]');
      if (p) onPick(p.dataset.part);
    });
    wrap.addEventListener('keydown', (e) => {
      const p = e.target.closest('[data-part]');
      if (p && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onPick(p.dataset.part);
      }
    });
    return wrap;
  }

  // --------------------------------------------------------- scope search
  function searchBox(onChoose) {
    const input = el('input', { type: 'search', placeholder: 'Search, e.g. “127 SLT”, “Skyliner 200”, “Seestar”', 'aria-label': 'Search telescopes' });
    const results = el('div', { class: 'results' });
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    function update() {
      const q = norm(input.value);
      const words = q.split(' ').filter(Boolean);
      const hits = scopes.filter((s) => {
        const hay = norm(`${s.brand} ${s.name} ${s.aperture}mm ${TYPE_LABEL[s.type]}`).replace(/ /g, '');
        return words.every((w) => hay.includes(w.replace(/ /g, '')));
      }).slice(0, q ? 12 : 8);
      results.replaceChildren(
        ...hits.map((s) => el('button', { onclick: () => onChoose(s) }, `${s.brand} ${s.name}`, el('small', {}, `${s.aperture} mm · ${s.focal} mm · ${TYPE_LABEL[s.type]}${s.mount ? ' · ' + (byId('mounts', s.mount)?.name || '') : ' · tube only'}`))),
        el('button', { onclick: () => customScope(onChoose) }, '➕ Not listed? Enter it yourself', el('small', {}, 'Just aperture and focal length'))
      );
    }
    input.addEventListener('input', update);
    update();
    return el('div', {}, input, results);
  }

  function customScope(onChoose) {
    const name = el('input', { type: 'text', placeholder: 'Name, e.g. My 6-inch reflector' });
    const ap = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'e.g. 150', min: 20, max: 1000 });
    const fl = el('input', { type: 'number', inputmode: 'numeric', placeholder: 'e.g. 750', min: 100, max: 5000 });
    const type = el('select', {}, Object.entries(TYPE_LABEL).map(([k, v]) => el('option', { value: k }, v)));
    const err = el('p', { class: 'small', style: 'color:var(--bad)', role: 'alert' });
    const close = App.sheet('Add your own telescope',
      el('label', { class: 'field' }, 'Name', name),
      el('div', { class: 'row' }, el('label', { class: 'field grow' }, 'Aperture (mm)', ap), el('label', { class: 'field grow' }, 'Focal length (mm)', fl)),
      el('label', { class: 'field' }, 'Type', type),
      el('p', { class: 'small muted' }, 'Both numbers are usually printed on the tube or the box, e.g. “D=127mm F=1500mm”.'),
      err,
      el('button', { class: 'btn primary', style: 'width:100%', onclick: () => {
        const D = Number(ap.value), F = Number(fl.value);
        if (!(D >= 20 && F >= 100)) return (err.textContent = 'Enter the aperture and focal length in millimetres.');
        close();
        onChoose({ id: null, brand: '', name: name.value.trim() || `${D} mm ${TYPE_LABEL[type.value].toLowerCase()}`, type: type.value, aperture: D, focal: F, mount: null, eyepieces: [], custom: true });
      } }, 'Add telescope'));
  }

  function applyScope(setup, s, keepParts) {
    setup.scopeId = s.id;
    setup.scope = { name: `${s.brand ? s.brand + ' ' : ''}${s.name}`.trim(), type: s.type, aperture: s.aperture, focal: s.focal };
    if (!keepParts) {
      setup.mode = s.allInOne ? 'allinone' : 'modular';
      setup.mountId = s.mount || setup.mountId || null;
      if (s.eyepieces?.length || s.custom === undefined) setup.eyepieces = (s.eyepieces || []).map((f) => ({ focal: f, afov: 50, type: 'plossl' }));
      setup.diagonalId = s.diagonal || null;
      setup.finderId = s.finder || null;
      setup.cameraId = s.camera || (s.type === 'smart' ? null : setup.cameraId || null);
      if (s.type === 'smart') {
        setup.barlowId = null;
        setup.reducerId = null;
        setup.filters = [];
      }
    }
    if (!setup.name || /^My |^New setup/.test(setup.name)) setup.name = `My ${s.name.replace(/ smart telescope| \(tube\)/i, '')}`;
  }

  // ----------------------------------------------------------- part sheets
  function radioSheet(title, list, current, onPick, noneLabel = 'None') {
    const close = App.sheet(title,
      el('div', { class: 'results', style: 'max-height:60vh' },
        noneLabel ? el('button', { onclick: () => { close(); onPick(null); } }, (current ? '' : '✓ ') + noneLabel) : null,
        list.map((x) => el('button', { onclick: () => { close(); onPick(x.id); } }, (x.id === current ? '✓ ' : '') + x.name, x.sub ? el('small', {}, x.sub) : null))));
  }

  function editPart(part, kit, setup, redraw) {
    selected = part;
    const save = () => {
      Kit.save(kit);
      redraw();
    };
    const smart = setup.scope?.type === 'smart';
    if (setup.mode === 'allinone' && part !== 'tube' && !(part === 'camera' && !smart)) {
      App.sheet(PARTS.find((p) => p[0] === part)[1],
        el('p', {}, partValue(setup, part) || 'Built in.'),
        el('p', { class: 'small muted' }, 'This setup is all-in-one, so its parts are fixed. Switch to “Modular” to swap parts in and out.'),
        el('button', { class: 'btn', onclick: () => { setup.mode = 'modular'; save(); document.querySelector('.sheet-bg')?.remove(); } }, 'Switch to modular'));
      redraw();
      return;
    }
    switch (part) {
      case 'tube': {
        const close = App.sheet('Choose your telescope', searchBox((s) => { close(); applyScope(setup, s, false); save(); }));
        break;
      }
      case 'mount':
        radioSheet('Mount', gear.mounts.map((m) => ({ ...m, sub: { 'altaz-goto': 'Computerised alt-az GoTo', 'eq-goto': 'Equatorial GoTo', tracker: 'Star tracker', 'altaz-manual': 'Manual alt-az', dob: 'Push-to Dobsonian', 'eq-manual': 'Manual equatorial', smart: 'Built in' }[m.type] })), setup.mountId, (id) => { setup.mountId = id; save(); });
        break;
      case 'finder':
        radioSheet('Finder', gear.finders.filter((f) => f.id !== 'none'), setup.finderId, (id) => { setup.finderId = id; save(); });
        break;
      case 'diagonal':
        radioSheet('Diagonal', gear.diagonals.filter((d) => d.id !== 'none'), setup.diagonalId, (id) => { setup.diagonalId = id; save(); });
        break;
      case 'barlow':
        radioSheet('Barlow lens', gear.barlows, setup.barlowId, (id) => { setup.barlowId = id; save(); });
        break;
      case 'reducer':
        radioSheet('Focal reducer', gear.reducers, setup.reducerId, (id) => { setup.reducerId = id; save(); });
        break;
      case 'camera': {
        const groups = { astro: 'Astronomy camera', dslr: 'DSLR', mirrorless: 'Mirrorless', phone: 'Phone', smart: 'Smart-scope sensor' };
        radioSheet('Camera', gear.cameras.map((c) => ({ ...c, sub: `${groups[c.kind] || c.kind} · ${c.px} µm pixels · ${c.w}×${c.h} mm` })), setup.cameraId, (id) => { setup.cameraId = id; save(); }, 'No camera (viewing only)');
        break;
      }
      case 'filters': {
        const boxes = gear.filters.map((f) => el('label', { class: 'partrow' }, el('input', { type: 'checkbox', value: f.id, checked: (setup.filters || []).includes(f.id) }), el('span', { class: 'pv' }, f.name)));
        const close = App.sheet('Filters', el('div', { class: 'partlist' }, boxes),
          el('p', { class: 'small muted' }, '⚠️ Only ever observe the Sun with certified solar film covering the front of the telescope.'),
          el('button', { class: 'btn primary', style: 'width:100%;margin-top:0.6rem', onclick: () => { setup.filters = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value); close(); save(); } }, 'Save'));
        break;
      }
      case 'eyepieces':
        eyepieceSheet(setup, save);
        break;
    }
    redraw();
  }

  function eyepieceSheet(setup, save) {
    const chips = el('div', { class: 'ep-chips' });
    const typeSel = el('select', {}, gear.eyepieceTypes.map((t) => el('option', { value: t.id }, t.name)));
    const custom = el('input', { type: 'number', inputmode: 'decimal', placeholder: 'mm', style: 'width:90px' });
    const F = setup.scope?.focal || 1000;
    function drawChips() {
      setup.eyepieces.sort((a, b) => b.focal - a.focal);
      chips.replaceChildren(...(setup.eyepieces.length ? setup.eyepieces.map((e, i) => el('span', { class: 'ep-chip' }, `${e.focal} mm · ${Math.round(F / e.focal)}×`, el('button', { 'aria-label': 'Remove', onclick: () => { setup.eyepieces.splice(i, 1); drawChips(); save(); } }, '×'))) : [el('span', { class: 'muted small' }, 'No eyepieces yet.')]));
    }
    const add = (f) => {
      const t = gear.eyepieceTypes.find((x) => x.id === typeSel.value);
      if (!(f > 1 && f < 60) || setup.eyepieces.some((e) => e.focal === f)) return;
      setup.eyepieces.push({ focal: f, afov: t.afov, type: t.id });
      drawChips();
      save();
    };
    drawChips();
    App.sheet('Eyepieces',
      chips,
      el('label', { class: 'field' }, 'Type for new eyepieces', typeSel),
      el('p', { class: 'small muted', style: 'margin:0.2rem 0' }, 'Tap to add (the focal length is printed on the eyepiece):'),
      el('div', { class: 'ep-chips' }, [40, 32, 25, 20, 17, 15, 12, 10, 9, 8, 6, 5, 4].map((f) => el('button', { class: 'btn small', onclick: () => add(f) }, `${f} mm`))),
      el('div', { class: 'row', style: 'margin-top:0.6rem' }, custom, el('button', { class: 'btn small', onclick: () => add(Number(custom.value)) }, 'Add other size')));
  }

  // ------------------------------------------------------------ numbers
  function numbers(setup) {
    const k = Rating.derive(setup, gear);
    if (!k) return null;
    const loc = App.location();
    const lm = Rating.NELM(loc.bortle) + 5 * Math.log10(k.D / 7) - 0.5;
    const flag = (v) => (v.mag > k.maxUseful ? '⚠️ too high' : v.exit > 7 ? 'wider than your pupil' : v.mag >= k.D * 1.2 ? 'planets, doubles' : v.mag >= k.D * 0.5 ? 'globulars, small nebulae' : 'finding, big objects');
    const rows = k.views.map((v) => el('tr', {}, el('td', {}, v.label), el('td', { class: 'num' }, Math.round(v.mag) + '×'), el('td', { class: 'num' }, v.tfov >= 60 ? (v.tfov / 60).toFixed(2) + '°' : Math.round(v.tfov) + '′'), el('td', { class: 'num' }, v.exit.toFixed(1) + ' mm'), el('td', { class: 'small muted' }, flag(v))));
    const cam = k.camera;
    const camBox = cam
      ? el('div', { class: 'card' },
          el('h3', {}, '📷 ' + cam.name),
          el('div', { class: 'stats' },
            el('div', {}, el('span', { class: 'k' }, 'Field (prime)'), el('span', { class: 'v' }, `${Math.round((cam.w / (k.F * (k.reducer?.factor || 1))) * 3437.75)}′ × ${Math.round((cam.h / (k.F * (k.reducer?.factor || 1))) * 3437.75)}′`)),
            el('div', {}, el('span', { class: 'k' }, 'Image scale'), el('span', { class: 'v' }, `${((206.265 * cam.px) / (k.F * (k.reducer?.factor || 1))).toFixed(2)}″/px`)),
            el('div', {}, el('span', { class: 'k' }, 'Ideal for planets'), el('span', { class: 'v' }, `≈f/${Math.round(cam.px * 5)}`), el('div', { class: 'small muted' }, `You're at f/${k.fr.toFixed(1)}${k.barlow ? ` (f/${(k.fr * k.barlow.factor).toFixed(0)} with Barlow)` : ''}`)),
            el('div', {}, el('span', { class: 'k' }, 'Deep-sky subs'), el('span', { class: 'v' }, k.mount?.type === 'altaz-goto' ? `≈${Math.max(1, Math.round((k.mount.track1000 * 1000) / k.F))} s max` : k.mount?.type === 'eq-goto' || k.mount?.type === 'tracker' ? `≈${Math.round((k.mount.track1000 * 1000) / k.F)} s` : k.mount?.type === 'smart' ? '10 s auto' : 'no tracking'))))
      : null;
    return el('div', {},
      el('div', { class: 'card' },
        el('h3', {}, 'What your telescope can do'),
        el('div', { class: 'stats' },
          el('div', {}, el('span', { class: 'k' }, 'Aperture · focal'), el('span', { class: 'v' }, `${k.D} mm · ${k.F} mm`)),
          el('div', {}, el('span', { class: 'k' }, 'Focal ratio'), el('span', { class: 'v' }, `f/${k.fr.toFixed(1)}`), el('div', { class: 'small muted' }, k.fr >= 10 ? 'slow: great for planets' : k.fr <= 6 ? 'fast: wide, bright views' : 'all-rounder')),
          el('div', {}, el('span', { class: 'k' }, 'Light grasp'), el('span', { class: 'v' }, `${Math.round(k.lightGrasp)}× eye`)),
          el('div', {}, el('span', { class: 'k' }, 'Faintest stars'), el('span', { class: 'v' }, `mag ${lm.toFixed(1)}`), el('div', { class: 'small muted' }, `at Bortle ${loc.bortle}`)),
          el('div', {}, el('span', { class: 'k' }, 'Resolution'), el('span', { class: 'v' }, `${k.res.toFixed(2)}″`)),
          el('div', {}, el('span', { class: 'k' }, 'Useful power'), el('span', { class: 'v' }, `${Math.round(k.minUseful)}–${Math.round(k.maxUseful)}×`))),
        k.views.length
          ? el('div', { class: 'table-wrap', style: 'margin-top:0.8rem' }, el('table', { class: 'plain' }, el('thead', {}, el('tr', {}, el('th', {}, 'Eyepiece'), el('th', {}, 'Power'), el('th', {}, 'Field'), el('th', {}, 'Exit pupil'), el('th', {}, 'Good for'))), el('tbody', {}, rows)))
          : setup.scope.type === 'smart' ? null : el('p', { class: 'small muted' }, 'Add eyepieces to see magnifications.')),
      camBox);
  }

  // -------------------------------------------------------------- render
  async function render(section) {
    gear = gear || (await App.data('gear'));
    const tdata = await App.data('telescopes');
    scopes = tdata?.telescopes || [];
    if (!gear) {
      section.replaceChildren(el('p', { class: 'empty' }, 'Could not load the gear list.'));
      return;
    }
    const kit = Kit.get();
    function redraw() {
      const setup = Kit.active(kit);
      section.replaceChildren();
      // Setup switcher.
      section.append(el('div', { class: 'chipbar', style: 'margin-top:0.9rem' },
        kit.setups.map((s) => el('button', { class: s.id === kit.active ? 'on' : '', onclick: () => { kit.active = s.id; Kit.save(kit); redraw(); } }, s.name)),
        el('button', { onclick: () => {
          const s = { id: Kit.newId(), name: 'New setup', scope: null, mode: 'modular', eyepieces: [], filters: [] };
          kit.setups.push(s);
          kit.active = s.id;
          redraw();
        } }, '+ New setup')));

      if (kit.starter) section.append(el('div', { class: 'card', style: 'border-color:rgba(255,212,121,0.4)' }, el('p', { style: 'margin:0' }, '👋 This is a starter setup based on the Celestron 127 SLT. Search for your own telescope below, or tap any part to change it.')));

      if (!setup?.scope) {
        section.append(el('div', { class: 'card' }, el('h2', {}, 'Find your telescope'), el('p', { class: 'small muted' }, 'Search by brand, model or size. You can fine-tune the parts afterwards.'),
          searchBox((s) => { applyScope(setup, s, false); Kit.save(kit); redraw(); })));
        return;
      }

      // Name + mode.
      const nameInput = el('input', { type: 'text', value: setup.name, 'aria-label': 'Setup name', onchange: (e) => { setup.name = e.target.value.trim() || setup.name; Kit.save(kit); } });
      section.append(el('div', { class: 'card' },
        el('label', { class: 'field', style: 'margin-top:0' }, 'Setup name', nameInput),
        el('div', { class: 'switch', role: 'group', 'aria-label': 'Kit type' },
          el('button', { class: setup.mode !== 'allinone' ? 'on' : '', onclick: () => { setup.mode = 'modular'; Kit.save(kit); redraw(); } }, '🔧 Modular: swap parts'),
          el('button', { class: setup.mode === 'allinone' ? 'on' : '', onclick: () => { setup.mode = 'allinone'; Kit.save(kit); redraw(); } }, '📦 All-in-one: fixed')),
        el('p', { class: 'small muted', style: 'margin:0.5rem 0 0' }, setup.mode === 'allinone' ? 'Parts are treated as fixed (as bought). Great for smart scopes and starter bundles.' : 'Tap any part on the diagram or in the list to change it.')));

      // Diagram + parts list.
      const smart = setup.scope.type === 'smart';
      const parts = PARTS.filter(([p]) => !smart || p === 'tube' || p === 'mount' || p === 'camera');
      section.append(el('div', { class: 'card' },
        el('p', { class: 'kicker' }, `${TYPE_LABEL[setup.scope.type] || ''} · tap a part`),
        diagram(setup, (p) => editPart(p, kit, setup, redraw)),
        el('div', { class: 'partlist' },
          parts.map(([p, label]) => el('div', { class: 'partrow' + (selected === p ? ' sel' : ''), role: 'button', tabindex: 0, onclick: () => editPart(p, kit, setup, redraw), onkeydown: (e) => e.key === 'Enter' && editPart(p, kit, setup, redraw) },
            el('span', { class: 'pk' }, label),
            el('span', { class: 'pv' + (partValue(setup, p) ? '' : ' muted') }, partValue(setup, p) || (p === 'camera' ? 'None (viewing only)' : 'None')),
            el('span', { class: 'muted' }, '›'))))));

      const nums = numbers(setup);
      if (nums) section.append(nums);

      if (kit.setups.length > 1) section.append(el('button', { class: 'btn ghost', style: 'color:var(--bad);margin:0.5rem 0 1rem', onclick: (e) => {
        // Two taps to delete (browser confirm dialogs aren't available everywhere).
        if (e.currentTarget.dataset.armed !== '1') {
          e.currentTarget.dataset.armed = '1';
          e.currentTarget.textContent = `Tap again to delete “${setup.name}”`;
          return;
        }
        kit.setups = kit.setups.filter((s) => s.id !== setup.id);
        kit.active = kit.setups[0].id;
        Kit.save(kit);
        redraw();
      } }, 'Delete this setup'));
    }
    redraw();
  }

  App.register('kit', { render });
})();
