# Camera Finder → all-round stargazing app: roadmap

This file tracks the project from session to session. **Read it first when you pick the project up**,
then update it as part of every piece of work: tick what's done, add decisions, and note what's next.

> To continue in a new Claude session, say: *"Continue the Camera Finder project, check ROADMAP.md"*

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
| **Shop** | Today's Camera Finder: best gear and live UK prices, but driven by *your* kit instead of being fixed to the 127 SLT. |

## Status

| | |
|---|---|
| Live site | https://maruf2959-ctrl.github.io/Camera-finder-/ |
| Current version | v1: 127 SLT single page (merged in PR #1, 17 Oct 2026) |
| Now working on | Planning v2 (tabbed app). Waiting for the owner to confirm the build order |
| Last updated | 17 Oct 2026 |

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

## Open questions for the owner

- [ ] Confirm the build order below.
- [ ] Tab names and order: Home · Tonight · Map · Events · My Kit · Shop (6 tabs; phones usually fit 5). Merge Map into Tonight, or put Shop under My Kit?
- [ ] Look and feel: keep the current deep-space look, and add a **red night mode** for use at the telescope?
- [ ] ISS and satellite passes: worth adding later? (They need orbital data and a bit more maths.)

## Build plan (draft order)

### Phase 0: Housekeeping
- [x] v1 site live on GitHub Pages
- [x] Daily listings refresh
- [x] Roadmap created
- [ ] Add eBay API keys (owner action, see README)
- [ ] Hide CeX from the status bar while it's blocked

### Phase 1: App shell and Home
- [ ] Restructure into a tabbed app with a bottom tab bar (mobile-first, desktop friendly)
- [ ] Move the current page content into the **Shop** tab, with nothing lost
- [ ] **Home**: tonight-at-a-glance card, a "Did you know?" fact carousel, a beginner "start here" section
- [ ] PWA: manifest, icon, offline cache, Add to Home Screen
- [ ] Red night-mode toggle

### Phase 2: My Kit
- [ ] `data/telescopes.json` with about 50 popular scopes (Celestron NexStar/SE/AstroMaster/StarSense, Sky-Watcher Skymax/Heritage/Skyliner/Evostar/Star Discovery, Seestar/Dwarf smart scopes…), plus mounts, eyepieces, Barlows, diagonals, cameras and filters
- [ ] Search box with one-tap add; custom entry for anything missing
- [ ] All-in-one vs modular switch
- [ ] Interactive SVG telescope diagram: tap a part to set or change it (OTA, mount, finder, diagonal, eyepiece, Barlow, camera)
- [ ] Derived numbers: magnification per eyepiece, max useful magnification, field of view, focal ratio, limiting magnitude
- [ ] Several saved setups (e.g. "Visual" and "Imaging"), stored on the device

### Phase 3: Location and Map
- [ ] Set location by GPS, postcode/town search, or tapping the map
- [ ] Leaflet map with a light-pollution (night-lights) layer and an estimated Bortle number
- [ ] Panel of stargazer variables: darkness window, moon, cloud, dew risk, wind, temperature

### Phase 4: Tonight
- [ ] Hour-by-hour cloud and conditions timeline, with a "go out / don't bother" score
- [ ] Best targets tonight for *your* kit and location (visual first; astrophotography notes when a camera is in the kit), with altitude, best time, and how each one looks in your eyepieces
- [ ] Moon, all planets, a bright double-star and cluster list, and Messier highlights
- [ ] **GoTo helper (NexStar SLT)**: alignment stars to use now, then each target's hand-controller path, refreshed automatically

### Phase 5: Events and news
- [ ] Calendar: moon phases, meteor showers (with peak dates and ZHR), planet oppositions and conjunctions, eclipses, equinoxes and solstices
- [ ] "This week's sky" highlights for the location
- [ ] News feed from public astronomy RSS sources, refreshed daily by the Action
- [ ] (Later) ISS and bright satellite passes

### Phase 6: Shop, driven by My Kit
- [ ] Rankings, framing simulator, exposure limits and adapter lists use the saved kit instead of fixed 127 SLT numbers
- [ ] Wider catalogue: lenses, trackers, mounts, filters, eyepieces
- [ ] (Later) price watch: highlight listings under your target price

### Phase 7: Later ideas
- [ ] Session log: what you observed or imaged, with notes and photos
- [ ] Results gallery
- [ ] Observing lists and Messier marathon tracker

## Changelog

- **17 Oct 2026:** v1 launched (Camera Finder for the 127 SLT). Roadmap created, then rewritten around the owner's all-round stargazing-app brief.
