// Home tab: tonight at a glance, top picks for your kit, facts and a beginner's start.
(function () {
  'use strict';
  const { el, fmtTime } = App;

  const FACTS = [
    ['🔭', 'Your 127 mm telescope collects about 330 times more light than your eye.'],
    ['🌌', 'The Andromeda Galaxy is 2.5 million light years away. The light you see left before humans existed.'],
    ['🪐', "Saturn's rings are about 280,000 km wide but often less than 100 metres thick."],
    ['⭐', 'Betelgeuse is so big that, in place of the Sun, it would swallow the orbits of Mercury, Venus, Earth, Mars and maybe Jupiter.'],
    ['🌙', 'The Moon is drifting away from Earth by about 3.8 cm a year, about as fast as your fingernails grow.'],
    ['☁️', 'The Orion Nebula is a stellar nursery 1,350 light years away, with thousands of stars being born.'],
    ['👁️', 'Your eyes take 20–30 minutes to fully dark-adapt. One glance at a white phone screen resets them. Use red mode!'],
    ['🌠', 'The Perseids in August and the Geminids in December can show more than 60 meteors an hour from a dark site.'],
    ['🟠', 'Jupiter’s Great Red Spot is a storm bigger than Earth that has raged for at least 190 years.'],
    ['💍', 'The Ring Nebula is the shell of gas thrown off by a dying Sun-like star. One day the Sun will make one too.'],
    ['📸', 'Stacking 100 short exposures cuts random noise by 10× (the square root of the frame count).'],
    ['✳️', 'M13 holds several hundred thousand stars packed into a ball about 150 light years across.'],
    ['🌍', 'From Worthing, the sky turns about 15° an hour, which is why your mount has to keep tracking.'],
    ['🔴', 'Mars looks red because its surface is covered in iron oxide. It’s literally rusty.'],
    ['🌀', 'The Whirlpool Galaxy (M51) is colliding with a smaller galaxy. You can see the pair in one view.'],
    ['🧭', 'Polaris isn’t the brightest star (it’s about 48th), but it barely moves, so it marks north.']
  ];

  const greet = () => {
    const h = Number(new Date().toLocaleString('en-GB', { timeZone: App.TZ, hour: 'numeric', hour12: false }));
    return h < 5 ? 'Clear skies, night owl' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };

  async function render(section) {
    const loc = App.location();
    const facts = [...FACTS].sort(() => Math.random() - 0.5);
    section.replaceChildren(
      el('div', { class: 'hello' }, el('h2', {}, greet()), el('p', {}, `Here’s the sky over ${loc.name.split(',')[0]}.`))
    );
    const tonightCard = el('div', { class: 'card' }, el('p', { class: 'muted' }, 'Checking the forecast…'));
    const picksCard = el('div', { class: 'card' });
    const eventsCard = el('div', { class: 'card' });
    const kitCard = el('div', { class: 'card' });
    section.append(
      tonightCard,
      picksCard,
      eventsCard,
      el('div', { class: 'card' },
        el('h2', {}, 'Did you know?'),
        el('div', { class: 'facts' }, facts.map(([em, txt]) => el('div', { class: 'fact' }, el('span', { class: 'em' }, em), el('p', {}, txt))))),
      kitCard,
      el('div', { class: 'card' },
        el('h2', {}, 'New to this? Start here'),
        el('div', { class: 'starter' },
          el('a', { href: '#kit' }, el('span', { class: 'em' }, '🔭'), el('div', {}, el('strong', {}, '1 · Add your telescope'), el('small', {}, 'Search your model. Ratings and advice adapt to it.'))),
          el('a', { href: '#map' }, el('span', { class: 'em' }, '📍'), el('div', {}, el('strong', {}, '2 · Set your location'), el('small', {}, 'Weather, darkness and light pollution for where you are.'))),
          el('a', { href: '#tonight' }, el('span', { class: 'em' }, '🌙'), el('div', {}, el('strong', {}, '3 · Check tonight'), el('small', {}, 'What your kit can see, when, and how to find it.'))),
          el('a', { href: '#events' }, el('span', { class: 'em' }, '📅'), el('div', {}, el('strong', {}, '4 · Plan ahead'), el('small', {}, 'Meteor showers, Moon phases and planet highlights.'))),
          el('a', { href: '#explore' }, el('span', { class: 'em' }, '🪐'), el('div', {}, el('strong', {}, '5 · Explore'), el('small', {}, 'Photos and plain-English guides to every object.')))))
    );

    // Upcoming events teaser.
    if (window.EventsCalc) {
      const evs = window.EventsCalc.upcoming(3);
      eventsCard.append(el('div', { class: 'card-head' }, el('h2', {}, 'Coming up'), el('a', { href: '#events' }, 'Calendar →')),
        evs.map((e) => el('div', { class: 'ev' }, el('div', { class: 'date' }, el('b', {}, e.date.toLocaleDateString('en-GB', { timeZone: App.TZ, day: 'numeric' })), el('span', {}, e.date.toLocaleDateString('en-GB', { timeZone: App.TZ, month: 'short' }))), el('div', {}, el('h4', {}, `${e.icon} ${e.title}`), el('p', {}, e.short || e.desc)))));
    } else eventsCard.remove();

    let P;
    try {
      P = await Planner.get();
    } catch {
      tonightCard.replaceChildren(el('p', { class: 'muted' }, 'Couldn’t load tonight’s data.'));
      return;
    }
    const { plan, night, hours, k, setup } = P;
    const c = Planner.conditions(hours, night);
    const v = Planner.verdict(c);
    const mp = Astro.moonRaDec(new Date());
    tonightCard.replaceChildren(
      el('p', { class: 'kicker' }, 'Tonight'),
      el('div', { class: 'verdict-big' }, c ? App.scoreRing(c.avg, 'Sky clarity tonight') : null, el('div', {}, el('h2', { style: 'margin:0' }, v.text), el('p', { class: 'muted', style: 'margin:0.2rem 0 0' }, v.sub))),
      el('div', { class: 'stats' },
        el('div', {}, el('span', { class: 'k' }, 'Dark'), el('span', { class: 'v' }, `${night.isDark ? 'now' : fmtTime(night.start)} → ${fmtTime(night.end)}`)),
        el('div', {}, el('span', { class: 'k' }, 'Moon'), el('span', { class: 'v' }, `${Math.round(mp.illum * 100)}% · ${Astro.phaseName(mp.age)}`)),
        c ? el('div', {}, el('span', { class: 'k' }, 'Cloud'), el('span', { class: 'v' }, `${c.cloud}%`)) : null),
      el('a', { class: 'btn primary', href: '#tonight', style: 'margin-top:0.9rem;width:100%' }, 'Open tonight’s plan'));

    const objects = await ObjectInfo.objects();
    const top = plan.filter((e) => e.visual || e.imaging).slice(0, 8);
    picksCard.append(
      el('div', { class: 'card-head' }, el('h2', {}, 'Tonight’s highlights'), el('a', { href: '#tonight' }, 'All →')),
      el('p', { class: 'small muted', style: 'margin:0 0 0.6rem' }, `Best for ${setup?.name || 'your kit'} · tap for details`),
      top.length
        ? el('div', { class: 'hl-row' }, top.map((e) => {
            const r = e.visual ?? e.imaging;
            return el('button', { class: 'hl-card', onclick: () => ObjectInfo.open(e.target.id), 'aria-label': `${e.target.common || e.target.name}, ${r.label}` },
              ObjectInfo.photo(objects[e.target.id], 'hl-img'),
              el('span', { class: 'hl-score s-' + App.scoreClass(r.score) }, r.score),
              el('span', { class: 'hl-text' },
                el('strong', {}, e.target.common || e.target.name),
                el('small', {}, `${r.label} · best ${fmtTime(e.best.t)}`)));
          }))
        : el('p', { class: 'muted' }, 'Nothing well placed. Check back later.'),
      el('a', { class: 'btn', href: '#explore', style: 'width:100%;margin-top:0.8rem' }, '🪐 Explore the sky: planets, nebulae, galaxies'));

    if (P.kit.starter) {
      kitCard.append(
        el('h2', {}, '🔭 Set up your kit'),
        el('p', { style: 'margin:0 0 0.7rem' }, 'Ratings are for the naked eye right now. Add your telescope, camera or binoculars and everything in SimpleSky is rated for your own gear.'),
        el('a', { class: 'btn primary', href: '#kit', style: 'width:100%' }, 'Find my gear'));
    } else if (k) {
      const cam = k.camera;
      kitCard.append(
        el('div', { class: 'card-head' }, el('h2', {}, 'Your kit'), el('a', { href: '#kit' }, 'Change →')),
        el('p', { style: 'margin:0' }, el('strong', {}, setup.name), el('span', { class: 'muted' }, P.kit.setups.length > 1 ? ` · ${P.kit.setups.length} setups` : '')),
        el('div', { class: 'stats' },
          el('div', {}, el('span', { class: 'k' }, 'Main'), el('span', { class: 'v' }, setup.scope.name)),
          cam ? el('div', {}, el('span', { class: 'k' }, 'Camera'), el('span', { class: 'v' }, cam.name)) : null,
          k.mount ? el('div', {}, el('span', { class: 'k' }, 'Mount'), el('span', { class: 'v' }, k.mount.name)) : null,
          el('div', {}, el('span', { class: 'k' }, 'Light grasp'), el('span', { class: 'v' }, `${Math.round(k.lightGrasp)}× your eye`))));
    }
  }

  App.register('home', { render });
})();
