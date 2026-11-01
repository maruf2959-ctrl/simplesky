// My Kit tab: search for any gear (telescopes, cameras, lenses, binoculars, mounts),
// build setups part by part on a diagram, and see what each setup can do.
(function () {
  'use strict';
  const { el } = App;

  const TYPE_LABEL = {
    mak: 'Maksutov-Cassegrain', sct: 'Schmidt-Cassegrain', refractor: 'Refractor', newtonian: 'Newtonian reflector',
    dob: 'Dobsonian', smart: 'Smart telescope', lens: 'Camera lens', binoculars: 'Binoculars', eye: 'Naked eye'
  };
  const TELESCOPE_TYPES = ['mak', 'sct', 'refractor', 'newtonian', 'dob'];
  const CAMERA_KIND = { astro: 'Astronomy camera', dslr: 'DSLR', mirrorless: 'Mirrorless', phone: 'Phone', smart: 'Smart-scope sensor' };
  const MOUNT_KIND = { 'altaz-goto': 'Computerised alt-az GoTo', 'eq-goto': 'Equatorial GoTo', tracker: 'Star tracker', 'altaz-manual': 'Manual alt-az', dob: 'Push-to Dobsonian', 'eq-manual': 'Manual equatorial', smart: 'Built in', tripod: 'No tracking', handheld: 'No mount' };
  const POPULAR = ['nexstar-127slt', 'skyliner-200p', 'seestar-s50', 'camera:nikon-d5300', 'bino-10x50'];

  // Which parts each kind of setup has, in display order.
  const PARTS_FOR = {
    telescope: [['tube', 'Telescope'], ['mount', 'Mount'], ['finder', 'Finder'], ['diagonal', 'Diagonal'], ['eyepieces', 'Eyepieces'], ['barlow', 'Barlow'], ['reducer', 'Reducer'], ['camera', 'Camera'], ['filters', 'Filters']],
    smart: [['tube', 'Smart telescope'], ['mount', 'Mount'], ['camera', 'Camera']],
    lens: [['tube', 'Lens'], ['camera', 'Camera'], ['mount', 'Mount'], ['filters', 'Filters']],
    binoculars: [['tube', 'Binoculars'], ['mount', 'Mount']],
    eye: []
  };
  const kindOf = (setup) => (TELESCOPE_TYPES.includes(setup?.scope?.type) ? 'telescope' : setup?.scope?.type || 'telescope');

  let gear = null;
  let scopes = [];
  let selected = 'tube';

  const byId = (list, id) => (gear?.[list] || []).find((x) => x.id === id);
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const matches = (hay, q) => {
    const h = norm(hay).replace(/ /g, '');
    return norm(q).split(' ').filter(Boolean).every((w) => h.includes(w));
  };

  function scopeLine(s) {
    if (s.type === 'binoculars') return `${s.magnification}× magnification · ${s.aperture} mm · ${s.field}° field`;
    if (s.type === 'lens') return `${s.focal} mm at f/${(s.focal / s.aperture).toFixed(1)} · ${s.note || ''}`;
    if (s.type === 'eye') return 'No equipment';
    return `${s.aperture} mm · ${s.focal} mm focal length${s.mount ? ' · ' + (byId('mounts', s.mount)?.name || '') : ' · tube only'}`;
  }

  function partValue(setup, part) {
    const s = setup.scope;
    switch (part) {
      case 'tube':
        if (!s) return null;
        if (s.type === 'binoculars' || s.type === 'eye' || s.type === 'lens') return s.name;
        return `${s.name} (${s.aperture} mm, f/${(s.focal / s.aperture).toFixed(1)})`;
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

  // How the camera connects, in plain words.
  function adapterText(cam, setup) {
    const kind = kindOf(setup);
    const mountName = gear.cameraMounts?.[cam.mount] || cam.mount;
    if (cam.kind === 'smart') return 'Built into the smart telescope.';
    if (cam.kind === 'phone') return 'Use a phone adapter that clamps onto the eyepiece.';
    if (kind === 'lens') return `Lenses attach directly. Make sure the lens is ${mountName} fit (or use an adapter).`;
    if (cam.kind === 'astro') return 'Push the supplied 1.25″ nosepiece into the focuser (remove the diagonal), or use the T2 thread with a 2″ adapter. Add a UV/IR-cut filter for colour cameras without one.';
    return `You need a ${mountName} T-ring plus a 1.25″ (or 2″) T-adapter. Remove the diagonal and push the adapter into the focuser. A 2× Barlow between them is good for planets.`;
  }

  // ------------------------------------------------------------- diagram
  function diagram(setup, onPick) {
    const NS = 'http://www.w3.org/2000/svg';
    const type = setup.scope?.type || 'refractor';
    const kind = kindOf(setup);
    const has = (p) => !!partValue(setup, p);
    const g = (part, inner, label, lx, ly) =>
      `<g class="part${selected === part ? ' sel' : ''}${has(part) ? '' : ' missing'}" data-part="${part}" tabindex="0" role="button" aria-label="${label}">${inner}<text x="${lx}" y="${ly}">${label}</text></g>`;
    let body;
    if (kind === 'eye') {
      body = `<path class="shape" d="M90 160 Q210 60 330 160 Q210 260 90 160z"/><circle class="shape" cx="210" cy="160" r="42"/><circle class="shape" cx="210" cy="160" r="16" style="fill:var(--gold-soft)"/>`;
    } else if (kind === 'binoculars') {
      body = `${g('tube', `<rect class="shape" x="110" y="70" width="80" height="150" rx="22"/><rect class="shape" x="230" y="70" width="80" height="150" rx="22"/><rect class="shape" x="185" y="110" width="50" height="40" rx="8"/>`, 'Binoculars', 170, 50)}
        ${g('mount', `<path class="shape" d="M210 220 v30 M210 250 L160 305 M210 250 L210 310 M210 250 L260 305"/>`, 'Mount', 275, 300)}`;
    } else if (kind === 'lens') {
      body = `${g('camera', `<rect class="shape" x="120" y="90" width="120" height="85" rx="12"/><rect class="shape" x="145" y="70" width="45" height="24" rx="6"/>`, 'Camera', 140, 60)}
        ${g('tube', `<rect class="shape" x="240" y="100" width="${Math.min(150, 40 + (setup.scope.focal || 50) / 4)}" height="64" rx="10"/>`, 'Lens', 290, 90)}
        ${g('mount', `<path class="shape" d="M180 175 v30 M180 205 L125 300 M180 205 L180 305 M180 205 L235 300"/>`, 'Mount', 250, 296)}
        ${g('filters', `<circle class="shape" cx="370" cy="230" r="16"/>`, 'Filters', 350, 266)}`;
    } else {
      const smart = type === 'smart';
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
      body = `${g('mount', mount, 'Mount', 290, 290)}
        ${g('tube', tube, smart ? 'Smart telescope' : 'Telescope', smart ? 160 : 292, smart ? 50 : 150)}
        ${smart ? '' : g('finder', `<rect class="shape" x="190" y="38" width="44" height="14" rx="6" transform="rotate(-22 212 45)"/>`, 'Finder', 150, 30)}
        ${smart ? '' : g('diagonal', `<path class="shape" d="M${eyeX - 12} ${eyeY - 10} l16 0 l0 16 z"/>`, 'Diagonal', eyeX - 100, eyeY + 4)}
        ${smart ? '' : g('eyepieces', `<rect class="shape" x="${eyeX - 8}" y="${eyeY - 32}" width="14" height="22" rx="3"/>`, 'Eyepiece', eyeX - 98, eyeY - 18)}
        ${smart ? '' : g('barlow', `<rect class="shape" x="${eyeX + 14}" y="${eyeY + 14}" width="26" height="12" rx="4"/>`, 'Barlow', eyeX + 46, eyeY + 25)}
        ${g('camera', `<rect class="shape" x="${smart ? 300 : 20}" y="${smart ? 120 : 200}" width="44" height="32" rx="6"/><circle class="shape" cx="${smart ? 322 : 42}" cy="${smart ? 136 : 216}" r="8"/>`, 'Camera', smart ? 300 : 18, smart ? 168 : 250)}
        ${smart ? '' : g('filters', `<circle class="shape" cx="370" cy="200" r="16"/>`, 'Filters', 350, 236)}`;
    }
    const wrap = el('div', { html: `<svg class="scope-svg" viewBox="0 0 420 320" xmlns="${NS}" role="group" aria-label="Your setup: tap a part to change it">${body}</svg>` });
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

  // ----------------------------------------------------- universal search
  // One box that finds telescopes, smart scopes, lenses, binoculars, cameras and mounts.
  function catalogue() {
    return [
      ...scopes.map((s) => ({ kind: 'scope', id: s.id, item: s, title: `${s.brand && s.brand !== 'Camera lens' && s.brand !== 'Binoculars' ? s.brand + ' ' : ''}${s.name}`, sub: `${TYPE_LABEL[s.type]} · ${scopeLine(s)}`, hay: `${s.brand} ${s.name} ${TYPE_LABEL[s.type]} ${s.aperture}mm ${s.focal || ''}mm` })),
      ...gear.cameras.filter((c) => c.kind !== 'smart').map((c) => ({ kind: 'camera', id: 'camera:' + c.id, item: c, title: c.name, sub: `Camera · ${CAMERA_KIND[c.kind] || c.kind}${gear.cameraMounts?.[c.mount] ? ' · ' + gear.cameraMounts[c.mount] + ' mount' : ''}`, hay: `${c.name} camera ${c.kind} ${c.brand}` })),
      ...gear.mounts.filter((m) => m.type !== 'smart').map((m) => ({ kind: 'mount', id: 'mount:' + m.id, item: m, title: m.name, sub: `Mount · ${MOUNT_KIND[m.type] || ''}`, hay: `${m.name} mount ${MOUNT_KIND[m.type] || ''}` }))
    ];
  }

  function searchBox(onChoose, { placeholder = 'Search telescopes, cameras, lenses, binoculars, mounts…', only = null, showPopular = false } = {}) {
    const input = el('input', { type: 'search', placeholder, 'aria-label': 'Search gear', id: 'kitSearch' });
    const results = el('div', { class: 'results' });
    const all = catalogue().filter((x) => !only || only.includes(x.kind));
    function update() {
      const q = input.value.trim();
      let hits = q ? all.filter((x) => matches(x.hay, q)).slice(0, 14) : showPopular ? POPULAR.map((id) => all.find((x) => x.id === id)).filter(Boolean) : only ? all.slice(0, 8) : [];
      results.replaceChildren(
        q || !showPopular ? null : el('p', { class: 'small muted', style: 'margin:0.2rem 0' }, 'Popular:'),
        ...hits.map((x) => el('button', { onclick: () => onChoose(x) }, x.title, el('small', {}, x.sub))),
        (q || only) && (!only || only.includes('scope')) ? el('button', { onclick: () => customScope((s) => onChoose({ kind: 'scope', item: s })) }, '➕ Not listed? Enter a telescope yourself', el('small', {}, 'Just aperture and focal length')) : null
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
    const type = el('select', {}, TELESCOPE_TYPES.map((k) => el('option', { value: k }, TYPE_LABEL[k])));
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

  const shortName = (s) => s.replace(/ smart telescope| \(tube\)| \(cooled\)| \(full frame\)/gi, '').replace(/^Celestron |^Sky-Watcher |^ZWO /, '');

  function applyScope(setup, s) {
    const fixed = s.type === 'binoculars' || s.type === 'eye';
    setup.scopeId = s.id;
    setup.scope = { name: `${s.brand && !['Camera lens', 'Binoculars'].includes(s.brand) ? s.brand + ' ' : ''}${s.name}`.trim(), type: s.type, aperture: s.aperture, focal: s.focal };
    if (s.magnification) Object.assign(setup.scope, { magnification: s.magnification, field: s.field });
    setup.mode = s.allInOne || fixed ? 'allinone' : 'modular';
    setup.mountId = s.mount || (s.type === 'lens' ? 'tripod' : setup.mountId || null);
    setup.eyepieces = (s.eyepieces || []).map((f) => ({ focal: f, afov: 50, type: 'plossl' }));
    setup.diagonalId = s.diagonal || null;
    setup.finderId = s.finder || null;
    setup.barlowId = null;
    setup.reducerId = null;
    if (fixed) setup.cameraId = null;
    else if (s.type === 'smart') setup.cameraId = s.camera || null;
    else if (byId('cameras', setup.cameraId)?.kind === 'smart') setup.cameraId = null;
    if (s.type === 'smart' || fixed) setup.filters = [];
    autoName(setup);
  }

  // Name setups after what's in them until the user names one themselves.
  function autoName(setup) {
    if (setup.customName) return;
    const cam = byId('cameras', setup.cameraId);
    const main = setup.scope ? shortName(setup.scope.name) : '';
    if (setup.scope?.type === 'lens') setup.name = `${cam ? shortName(cam.name).split(' / ')[0] : 'Camera'} + ${setup.scope.focal} mm lens`;
    else if (setup.scope?.type === 'eye') setup.name = 'Naked eye';
    else setup.name = cam && setup.scope?.type !== 'smart' ? `${main} + ${shortName(cam.name).split(' / ')[0]}` : main || 'New setup';
  }

  // ----------------------------------------------------------- part sheets
  function radioSheet(title, list, current, onPick, noneLabel = 'None') {
    const box = el('div', { class: 'results', style: 'max-height:55vh' });
    const input = list.length > 8 ? el('input', { type: 'search', placeholder: `Search ${title.toLowerCase()}…`, 'aria-label': `Search ${title}` }) : null;
    let close;
    function draw() {
      const q = input?.value.trim() || '';
      box.replaceChildren(
        noneLabel && !q ? el('button', { onclick: () => { close(); onPick(null); } }, (current ? '' : '✓ ') + noneLabel) : null,
        ...list.filter((x) => !q || matches(`${x.name} ${x.sub || ''}`, q)).map((x) => el('button', { onclick: () => { close(); onPick(x.id); } }, (x.id === current ? '✓ ' : '') + x.name, x.sub ? el('small', {}, x.sub) : null)));
    }
    input?.addEventListener('input', draw);
    draw();
    close = App.sheet(title, input, box);
  }

  function editPart(part, kit, setup, redraw) {
    selected = part;
    const save = () => {
      autoName(setup);
      Kit.save(kit);
      redraw();
    };
    const kind = kindOf(setup);
    const fixedParts = setup.mode === 'allinone' && part !== 'tube' && !(part === 'camera' && kind !== 'smart') && kind !== 'binoculars';
    if (fixedParts) {
      App.sheet(part[0].toUpperCase() + part.slice(1),
        el('p', {}, partValue(setup, part) || 'Built in.'),
        el('p', { class: 'small muted' }, 'This setup is all-in-one, so its parts are fixed. Switch to “Modular” to swap parts in and out.'),
        el('button', { class: 'btn', onclick: () => { setup.mode = 'modular'; save(); document.querySelector('.sheet-bg')?.remove(); } }, 'Switch to modular'));
      redraw();
      return;
    }
    switch (part) {
      case 'tube': {
        const only = ['scope'];
        const close = App.sheet(kind === 'lens' ? 'Choose a lens' : kind === 'binoculars' ? 'Choose binoculars' : 'Choose your telescope',
          searchBox((x) => { close(); applyScope(setup, x.item); save(); }, { only, placeholder: kind === 'lens' ? 'Search lenses, e.g. “50 mm”' : 'Search, e.g. “127 SLT”, “Skyliner 200”, “10×50”' }));
        break;
      }
      case 'mount':
        radioSheet('Mount', gear.mounts.filter((m) => m.type !== 'smart').map((m) => ({ ...m, sub: MOUNT_KIND[m.type] })), setup.mountId, (id) => { setup.mountId = id; save(); });
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
      case 'camera':
        radioSheet('Camera', gear.cameras.filter((c) => c.kind !== 'smart').map((c) => ({ ...c, sub: `${CAMERA_KIND[c.kind] || c.kind}${gear.cameraMounts?.[c.mount] ? ' · ' + gear.cameraMounts[c.mount] + ' mount' : ''} · ${c.px} µm pixels` })), setup.cameraId, (id) => { setup.cameraId = id; save(); }, kind === 'lens' ? null : 'No camera (viewing only)');
        break;
      case 'filters': {
        const boxes = gear.filters.map((f) => el('label', { class: 'partrow' }, el('input', { type: 'checkbox', value: f.id, checked: (setup.filters || []).includes(f.id) }), el('span', { class: 'pv' }, f.name)));
        const close = App.sheet('Filters', el('div', { class: 'partlist' }, boxes),
          el('p', { class: 'small muted' }, '⚠️ Only ever observe the Sun with certified solar film covering the front of the telescope or lens.'),
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
    const typeSel = el('select', { 'aria-label': 'Eyepiece type' }, gear.eyepieceTypes.map((t) => el('option', { value: t.id }, t.name)));
    const custom = el('input', { type: 'number', inputmode: 'decimal', placeholder: 'mm', style: 'width:90px', 'aria-label': 'Other eyepiece focal length' });
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
  const stat = (k, v, sub) => el('div', {}, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v), sub ? el('div', { class: 'small muted' }, sub) : null);

  function numbers(setup) {
    const k = Rating.derive(setup, gear);
    if (!k) return null;
    const loc = App.location();
    const kind = kindOf(setup);
    const lm = Rating.NELM(loc.bortle) + 5 * Math.log10(k.D / 7) - (kind === 'eye' ? 0 : 0.5);
    const cam = k.camera;
    const fe = k.F * (k.reducer?.factor || 1);
    const crop = cam ? 43.27 / Math.hypot(cam.w, cam.h) : 1;
    const subText = () => {
      const t = k.mount?.type;
      if (t === 'smart') return '10 s, automatic';
      if (t === 'altaz-goto') return `≈${Math.max(1, Math.round((k.mount.track1000 * 1000) / fe))} s max`;
      if (t === 'eq-goto' || t === 'tracker') return `≈${Math.round(Math.min(300, (k.mount.track1000 * 1000) / fe))} s`;
      if (t === 'handheld') return 'Use a tripod';
      const r = 500 / (fe * crop);
      return r >= 0.5 ? `≈${r < 10 ? r.toFixed(1) : Math.round(r)} s (500 rule, untracked)` : 'Too long for untracked shots';
    };
    let main;
    if (kind === 'eye') {
      main = el('div', { class: 'card' }, el('h3', {}, 'What you can see without gear'),
        el('div', { class: 'stats' }, stat('Faintest stars', `mag ${lm.toFixed(1)}`, `at Bortle ${loc.bortle}`), stat('Best sights', 'Moon, planets, Pleiades, meteors')),
        el('p', { class: 'small muted', style: 'margin:0.6rem 0 0' }, 'Give your eyes 20 minutes in the dark, and use red mode on this app. Then search above to add binoculars, a telescope or a camera.'));
    } else if (kind === 'binoculars') {
      const v = k.views[0];
      main = el('div', { class: 'card' }, el('h3', {}, 'What your binoculars can do'),
        el('div', { class: 'stats' }, stat('Magnification', `${v.mag}×`), stat('Field of view', `${(v.tfov / 60).toFixed(1)}°`, 'about 13 Moons wide at 6.5°'), stat('Exit pupil', `${v.exit.toFixed(1)} mm`), stat('Light grasp', `${Math.round(k.lightGrasp)}× eye`), stat('Faintest stars', `mag ${lm.toFixed(1)}`, `at Bortle ${loc.bortle}`)));
    } else if (kind === 'lens') {
      main = el('div', { class: 'card' }, el('h3', {}, 'What this lens can do'),
        el('div', { class: 'stats' }, stat('Focal length', `${k.F} mm`, cam ? `≈${Math.round(k.F * crop)} mm full-frame equivalent` : null), stat('Aperture', `f/${k.fr.toFixed(1)}`, `${k.D.toFixed(0)} mm opening`), stat('Exposures', subText())),
        cam ? null : el('p', { class: 'small', style: 'color:var(--gold);margin:0.6rem 0 0' }, 'Add your camera body to get photography ratings.'));
    } else {
      const flag = (v) => (v.mag > k.maxUseful ? '⚠️ too high' : v.exit > 7 ? 'wider than your pupil' : v.mag >= k.D * 1.2 ? 'planets, doubles' : v.mag >= k.D * 0.5 ? 'globulars, small nebulae' : 'finding, big objects');
      const rows = k.views.map((v) => el('tr', {}, el('td', {}, v.label), el('td', { class: 'num' }, Math.round(v.mag) + '×'), el('td', { class: 'num' }, v.tfov >= 60 ? (v.tfov / 60).toFixed(2) + '°' : Math.round(v.tfov) + '′'), el('td', { class: 'num' }, v.exit.toFixed(1) + ' mm'), el('td', { class: 'small muted' }, flag(v))));
      main = el('div', { class: 'card' },
        el('h3', {}, kind === 'smart' ? 'What your smart telescope can do' : 'What your telescope can do'),
        el('div', { class: 'stats' },
          stat('Aperture · focal', `${k.D} mm · ${k.F} mm`),
          stat('Focal ratio', `f/${k.fr.toFixed(1)}`, k.fr >= 10 ? 'slow: great for planets' : k.fr <= 6 ? 'fast: wide, bright views' : 'all-rounder'),
          stat('Light grasp', `${Math.round(k.lightGrasp)}× eye`),
          stat('Faintest stars', `mag ${lm.toFixed(1)}`, `at Bortle ${loc.bortle}`),
          stat('Resolution', `${k.res.toFixed(2)}″`),
          kind === 'smart' ? null : stat('Useful power', `${Math.round(k.minUseful)}–${Math.round(k.maxUseful)}×`)),
        k.views.length
          ? el('div', { class: 'table-wrap', style: 'margin-top:0.8rem' }, el('table', { class: 'plain' }, el('thead', {}, el('tr', {}, el('th', {}, 'Eyepiece'), el('th', {}, 'Power'), el('th', {}, 'Field'), el('th', {}, 'Exit pupil'), el('th', {}, 'Good for'))), el('tbody', {}, rows)))
          : kind === 'smart' ? null : el('p', { class: 'small muted' }, 'Add eyepieces to see magnifications.'));
    }
    const camBox = cam
      ? el('div', { class: 'card' },
          el('h3', {}, '📷 ' + cam.name),
          el('div', { class: 'stats' },
            stat(kind === 'lens' ? 'Field' : 'Field (prime focus)', `${Math.round((cam.w / fe) * 3437.75)}′ × ${Math.round((cam.h / fe) * 3437.75)}′`, (cam.w / fe) * 57.3 > 2 ? `${((cam.w / fe) * 57.3).toFixed(1)}° wide` : null),
            stat('Image scale', `${((206.265 * cam.px) / fe).toFixed(2)}″/px`),
            kind === 'lens' ? null : stat('Ideal for planets', `≈f/${Math.round(cam.px * 5)}`, `You're at f/${k.fr.toFixed(1)}${k.barlow ? ` (f/${(k.fr * k.barlow.factor).toFixed(0)} with Barlow)` : ''}`),
            kind === 'lens' ? null : stat('Deep-sky subs', subText())),
          el('p', { class: 'small', style: 'margin:0.7rem 0 0' }, el('strong', {}, 'Connecting it: '), adapterText(cam, setup)))
      : null;
    return el('div', { class: 'kit-numbers' }, main, camBox);
  }

  // When a search result is picked from the top search box.
  function chooseFromSearch(x, kit, setup, redraw) {
    const commit = () => {
      Kit.save(kit);
      redraw();
    };
    const newSetup = (scope) => {
      const s = { id: Kit.newId(), name: 'New setup', scope: null, mode: 'modular', eyepieces: [], filters: [] };
      kit.setups.push(s);
      kit.active = s.id;
      return s;
    };
    if (x.kind === 'mount') {
      setup.mountId = x.item.id;
      return commit();
    }
    if (x.kind === 'camera') {
      const k = kindOf(setup);
      if (setup.scope && (k === 'telescope' || k === 'lens')) {
        App.sheet(`Add ${x.item.name}`,
          el('div', { class: 'results' },
            el('button', { onclick: () => { setup.cameraId = x.item.id; autoName(setup); document.querySelector('.sheet-bg')?.remove(); commit(); } }, `Use it with “${setup.name}”`, el('small', {}, k === 'lens' ? 'Swap the camera body on this lens setup' : 'Prime focus through the telescope (needs a T-ring)')),
            el('button', { onclick: () => { const s = newSetup(); applyScope(s, scopes.find((l) => l.id === 'lens-18-55-long')); s.cameraId = x.item.id; autoName(s); document.querySelector('.sheet-bg')?.remove(); commit(); } }, 'New setup: camera + lens on a tripod', el('small', {}, 'Wide-field shots of the Milky Way, Orion, Andromeda and the Pleiades. Change the lens after.'))));
        return;
      }
      const s = setup.scope && k !== 'eye' && k !== 'binoculars' ? setup : newSetup();
      applyScope(s, scopes.find((l) => l.id === 'lens-18-55-long'));
      s.cameraId = x.item.id;
      autoName(s);
      return commit();
    }
    // A telescope, smart scope, lens or binoculars.
    if (setup.scope && setup.scope.type !== 'eye' && !kit.starter) {
      App.sheet(`Add ${x.title}`,
        el('div', { class: 'results' },
          el('button', { onclick: () => { document.querySelector('.sheet-bg')?.remove(); const s = newSetup(); applyScope(s, x.item); commit(); } }, 'Add as a new setup', el('small', {}, 'Keep your current setups too (recommended)')),
          el('button', { onclick: () => { document.querySelector('.sheet-bg')?.remove(); applyScope(setup, x.item); commit(); } }, `Replace in “${setup.name}”`, el('small', {}, 'Swap the main instrument in this setup'))));
      return;
    }
    applyScope(setup, x.item);
    commit();
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
      const kind = kindOf(setup);
      section.replaceChildren();
      section.classList.remove('two-col', 'side-right');

      section.append(el('div', { class: 'kit-head' },
        el('p', { class: 'kicker', style: 'margin-top:1rem' }, 'My Kit'),
        el('h2', { class: 'explore-title' }, kit.starter ? 'What do you observe with?' : 'Your setups'),
        el('p', { class: 'muted', style: 'margin:0.2rem 0 0' }, 'Everything in Tonight is rated for the setup you choose here.')));

      // Setup switcher.
      section.append(el('div', { class: 'chipbar', role: 'tablist', 'aria-label': 'Your setups' },
        kit.setups.map((s) => el('button', { class: s.id === kit.active ? 'on' : '', role: 'tab', 'aria-selected': String(s.id === kit.active), onclick: () => { kit.active = s.id; Kit.save(kit); redraw(); } }, s.name)),
        el('button', { onclick: () => {
          const s = { id: Kit.newId(), name: 'New setup', scope: null, mode: 'modular', eyepieces: [], filters: [] };
          kit.setups.push(s);
          kit.active = s.id;
          redraw();
        } }, '+ New setup')));

      // Universal search.
      section.append(el('div', { class: 'card kit-search' },
        el('h3', {}, kit.starter ? '🔭 Find your gear' : '🔎 Add or change gear'),
        el('p', { class: 'small muted', style: 'margin:0 0 0.5rem' }, 'Telescopes, smart telescopes, cameras, camera lenses, binoculars and mounts.'),
        searchBox((x) => chooseFromSearch(x, kit, setup, redraw), { showPopular: kit.starter })));

      if (!setup?.scope) {
        section.append(el('div', { class: 'card' }, el('h2', {}, 'What’s in this setup?'), el('p', { class: 'small muted' }, 'Search for the telescope, lens or binoculars it uses. You can add the camera and other parts afterwards.'),
          searchBox((x) => { applyScope(setup, x.item); Kit.save(kit); redraw(); }, { only: ['scope'] })));
        return;
      }

      // Name + mode.
      const nameInput = el('input', { type: 'text', value: setup.name, id: 'setupName', 'aria-label': 'Setup name', onchange: (e) => { setup.name = e.target.value.trim() || setup.name; setup.customName = true; Kit.save(kit); } });
      section.append(el('div', { class: 'card' },
        el('label', { class: 'field', style: 'margin-top:0' }, 'Setup name', nameInput),
        kind === 'telescope'
          ? el('div', {},
              el('div', { class: 'switch', role: 'group', 'aria-label': 'Kit type' },
                el('button', { class: setup.mode !== 'allinone' ? 'on' : '', onclick: () => { setup.mode = 'modular'; Kit.save(kit); redraw(); } }, '🔧 Modular: swap parts'),
                el('button', { class: setup.mode === 'allinone' ? 'on' : '', onclick: () => { setup.mode = 'allinone'; Kit.save(kit); redraw(); } }, '📦 All-in-one: fixed')),
              el('p', { class: 'small muted', style: 'margin:0.5rem 0 0' }, setup.mode === 'allinone' ? 'Parts are treated as fixed (as bought). Great for starter bundles.' : 'Tap any part on the diagram or in the list to change it.'))
          : el('p', { class: 'small muted', style: 'margin:0' }, `${TYPE_LABEL[setup.scope.type]} setup${kind === 'eye' ? '' : '. Tap a part to change it.'}`)));

      // Diagram + parts list.
      const parts = PARTS_FOR[kind] || PARTS_FOR.telescope;
      section.append(el('div', { class: 'card kit-diagram' },
        el('p', { class: 'kicker' }, `${TYPE_LABEL[setup.scope.type] || ''}${parts.length ? ' · tap a part' : ''}`),
        diagram(setup, (p) => editPart(p, kit, setup, redraw)),
        parts.length ? el('div', { class: 'partlist' },
          parts.map(([p, label]) => el('div', { class: 'partrow' + (selected === p ? ' sel' : ''), role: 'button', tabindex: 0, onclick: () => editPart(p, kit, setup, redraw), onkeydown: (e) => e.key === 'Enter' && editPart(p, kit, setup, redraw) },
            el('span', { class: 'pk' }, label),
            el('span', { class: 'pv' + (partValue(setup, p) ? '' : ' muted') }, partValue(setup, p) || (p === 'camera' ? (kind === 'lens' ? 'Add your camera body' : 'None (viewing only)') : 'None')),
            el('span', { class: 'muted' }, '›')))) : null));

      const nums = numbers(setup);
      const left = el('div', { class: 'col-main' }, ...[...section.children]);
      const right = el('div', { class: 'col-side' }, nums);
      section.replaceChildren(left, right);
      section.classList.add('two-col', 'side-right');

      if (kit.setups.length > 1) right.append(el('button', { class: 'btn ghost', style: 'color:var(--bad);margin:0.5rem 0 1rem', onclick: (e) => {
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
  window.KitUI = { kindOf };
})();
