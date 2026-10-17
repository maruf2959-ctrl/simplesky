# SimpleSky: roadmap

This file tracks the project from session to session. **Read it first when you pick the project up**,
then update it as part of every piece of work: tick what's done, add decisions, and note what's next.

> To continue in a new Claude session, say: *"Continue the SimpleSky project, check ROADMAP.md"*

## Vision (owner's brief, 17 Oct 2026)

An **all-round stargazing app**, mainly for the owner's personal use but friendly to beginners who've
just bought a telescope. It's for **viewing first** and astrophotography second, with a stargazing look
throughout. It has a **bottom tab bar** like a phone app.

| Tab | What it does |
|---|---|
| **Home** | A welcome and summary page: tonight at a glance (is it clear? what's up?), plus facts and tips that draw people into astronomy and astrophotography. |
| **Tonight** | What's visible tonight for *your* kit and location, updated live. Cloud and weather tracking. A **GoTo helper** for the NexStar SLT: alignment stars to use now, and exactly what to key into the hand controller. |
| **Sky map / Location** | Set your location. A live map showing where you are, light-pollution levels, and the variables a stargazer cares about (cloud, darkness, moon, dew, wind). |
| **Events** | A calendar and news feed: moon phases, meteor showers, planet highlights, conjunctions, eclipses, ISS passes, and astronomy news worth looking out for. |
| **My Kit** | Search for a telescope ("Celestron 127 SLT") and add it in one tap. Add a mount, eyepieces, Barlow, diagonal, camera and filters. A simple **telescope diagram** where you tap each part. A switch for **all-in-one** scopes (bought as a set) vs **modular** setups (swap parts in and out). |
| **Shop** | The original Camera Finder: best gear and live UK prices, but driven by *your* kit instead of being fixed to the 127 SLT. |

## Status

| | |
|---|---|
| Live site | https://maruf2959-ctrl.github.io/Camera-finder-/ |
| Current version | v2: tabbed phone app, built 18 Oct 2026 on branch `claude/astrophotography-camera-research-i0qhy2` (merge to go live) |
| Now working on | Owner review of v2, then the "Next up" list below |
| Last updated | 18 Oct 2026 |

## Decisions

- **Personal use first:** no accounts. Kit and location are saved on the device (browser storage), and the whole app works offline where possible.
- **Hosting:** stays free, using GitHub Pages plus a daily GitHub Action for listings and news.
- **Stack:** plain HTML, CSS and JavaScript with no build step, kept simple so any future session can continue it. Small libraries from a CDN only where they earn their place (e.g. Leaflet for the map).
- **Installable phone app (PWA):** yes. Add to Home Screen gives a full-screen app feel with the bottom tab bar.
- **Data sources (all free):**
  - Weather and cloud: Open-Meteo (cloud layers, humidity/dew, wind). Optionally 7Timer! for astro seeing and transparency.
  - Map: OpenStreetMap tiles via Leaflet. NASA GIBS "Black Marble" night-lights layer as the light-pollution view. The Bortle number is an estimate, so label it that way.
  - Sky positions: computed in the browser (already done for Messier targets, Jupiter and Saturn; extend to the Moon, all planets and bright stars).
  - Events: computed where possible (moon phases, planet events, meteor-shower table). News headlines are fetched by the daily Action from public RSS feeds (e.g. NASA, ESA).
  - Telescope search: a **curated database** (`data/telescopes.json`) of popular beginner and intermediate scopes, mounts and accessories. No free public telescope-spec API exists. Anything missing can be added as custom gear.
  - Listings: First Light Optics ✅ working. eBay UK ⏳ needs the `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` secrets. CeX ❌ blocks GitHub's servers. MPB: search links only.
- **GoTo helper:** uses the NexStar hand-controller catalogues (Messier, NGC, Caldwell, Named Star, Solar System), e.g. *"Menu → List → Messier → 42"*. It suggests alignment stars that are well placed right now for SkyAlign or two-star align.
- **Working style:** small steps, each tested, committed, pushed and merged, so the live site never breaks.

## Layout (decided 18 Oct 2026)

- **Bottom tab bar (5):** Home · Tonight · Events · My Kit · Shop
- **Top bar:** 📍 location pill (opens Location & sky with the map) and a 👁 red night-mode toggle
- Phone-first; desktop gets a centred floating tab bar. Desktop polish comes later.

## Code map (for future sessions)

| File | Purpose |
|---|---|
| `index.html` | App shell: top bar, `<section class="view">` per tab, bottom tab bar. The Shop markup lives here. |
| `assets/core.js` | `App`: helpers, `App.store` (localStorage), location, Open-Meteo weather, `App.night()` darkness window, hash router, red mode, shared UI (`scoreRing`, `sheet`). |
| `assets/astro.js` | `Astro`: Sun, Moon and planet positions, alt/az, separation, field rotation, Moon phase. |
| `assets/rating.js` | `Kit` model (setups saved on the device) and `Rating` engine: `derive`, `visual`, `imaging`, `plan`, `alignStars`. |
| `assets/views/*.js` | One file per tab; each calls `App.register(name, { render })`. |
| `data/targets.json` | Moon, planets, 47 deep-sky and double-star targets (with NexStar hand-control paths), 34 alignment stars. |
| `data/telescopes.json`, `data/gear.json` | Telescope database (49) and mounts, eyepiece types, Barlows, reducers, diagonals, finders, filters, cameras. |
| `data/cameras.json`, `listings.json`, `history.json`, `news.json` | Shop catalogue plus files refreshed daily by the GitHub Action. |
| `sw.js`, `manifest.webmanifest` | Installable PWA and offline cache. |
| `test/*.test.mjs` | `npm test`: listing filters, RSS parsing, rating sanity checks. |

## Open questions for the owner

- [ ] ISS and satellite passes: worth adding later? (They need orbital data and a bit more maths.)
- [ ] Review the rating scores against real nights out. Anything that feels too generous or harsh?

## Build plan

### Phase 0: Housekeeping
- [x] v1 site live on GitHub Pages
- [x] Daily listings refresh
- [x] Roadmap created
- [ ] Add eBay API keys (owner action, see README)
- [ ] Hide CeX from the status bar while it's blocked

### Phase 1: App shell and Home ✅
- [x] Restructure into a tabbed app with a bottom tab bar (mobile-first, desktop friendly)
- [x] Move the current page content into the **Shop** tab (Listings · Rankings · Framing · Guide), with nothing lost
- [x] **Home**: tonight-at-a-glance card, top picks for your kit, coming-up events, "Did you know?" facts, beginner "start here"
- [x] PWA: manifest, icons, offline cache (`sw.js`), Add to Home Screen
- [x] Red night-mode toggle

### Phase 2: My Kit ✅
- [x] `data/telescopes.json` (49 scopes) and `data/gear.json` (18 mounts, eyepiece types, Barlows, reducers, diagonals, finders, filters, 20 cameras incl. smart-scope sensors)
- [x] Search box with one-tap add; custom entry for anything missing
- [x] All-in-one vs modular switch
- [x] Interactive SVG telescope diagram (shape changes with scope type): tap a part to change it
- [x] Derived numbers: magnification, true field, exit pupil per eyepiece (with and without Barlow), max useful power, limiting magnitude, resolution, camera field and scale
- [x] Several saved setups, stored on the device
- [ ] Next: a nicer, more realistic diagram per scope type; eyepiece brand presets; import/export kit

### Phase 3: Location and Map ✅
- [x] Set location by GPS, postcode/town search (postcodes.io, Open-Meteo geocoding) or tapping the map
- [x] Leaflet map (Esri dark-grey base) with a NASA Black Marble night-lights layer and an automatic Bortle estimate read from it (manual override)
- [x] Panel of stargazer variables: sunset/sunrise, darkness window, Moon, cloud by layer, temperature and dew point, dew risk, wind, humidity
- [ ] Next: "find darker skies near me" (scan the night-lights layer for nearby dark spots)

### Phase 4: Tonight ✅
- [x] Hour-by-hour cloud timeline with a "go out / don't bother" verdict and score
- [x] **Rating engine** (`assets/rating.js`): every target scored 0–100 for the active kit, in **Viewing** and **Photography** modes, with reasons, eyepiece suggestion, sub length and total integration
- [x] Moon, all 7 planets, 47 deep-sky objects and doubles; filters (Up now, Planets, Nebulae, Galaxies, Clusters, Doubles)
- [x] **GoTo helper**: three well-spread alignment stars for right now, plus each target's hand-control path
- [ ] Next: 7Timer seeing/transparency (needs a server-side fetch, as there's no CORS); altitude-over-time chart per target; more targets (Caldwell list)

### Phase 5: Events and news ✅
- [x] Calculated 12-month calendar: Moon phases, meteor-shower peaks (with Moon interference), oppositions, Mercury/Venus elongations, Moon–planet and planet–planet conjunctions, equinoxes and solstices, UK clock changes, plus the Aug 2027 eclipse
- [x] "This week" highlights
- [x] News feed (NASA and ESA RSS) via `scripts/update-news.mjs` in the daily Action
- [ ] Next: more eclipse data; event reminders; ISS and bright satellite passes

### Phase 6: Shop, driven by My Kit
- [ ] Rankings, framing simulator, exposure limits and adapter lists use the saved kit instead of fixed 127 SLT numbers
- [ ] Wider catalogue: lenses, trackers, mounts, filters, eyepieces
- [ ] (Later) price watch: highlight listings under your target price

### Phase 7: Later ideas
- [ ] Session log: what you observed or imaged, with notes and photos
- [ ] Results gallery
- [ ] Observing lists and Messier marathon tracker

## Changelog

- **18 Oct 2026:** App renamed **SimpleSky** (was Stargazer / Camera Finder). The repository name and URL are unchanged for now.
- **18 Oct 2026:** v2 built: tabbed phone app (Home, Tonight with ratings and GoTo helper, Events with news, My Kit with telescope search and diagram, Location map with light pollution, Shop), red mode, PWA. 11 tests passing.
- **17 Oct 2026:** v1 launched (Camera Finder for the 127 SLT). Roadmap created, then rewritten around the owner's all-round stargazing-app brief.
