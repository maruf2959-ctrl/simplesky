# SimpleSky

An all-round **stargazing app for your phone**: what *your* telescope can see tonight, the weather,
a sky calendar, your kit, and live UK gear prices. It started as "Camera Finder", a camera guide for a
**Celestron NexStar 127 SLT** and now works with any telescope. It's installable (Add to Home Screen),
works offline at a dark site, and has a red night mode.

The plan and progress live in [ROADMAP.md](ROADMAP.md).

## Tabs

| Tab | What it does |
|---|---|
| **Home** | Tonight at a glance, a swipeable row of photo highlights for your kit, coming-up events, "Did you know?" facts and a beginner's start guide. |
| **Tonight** | Cloud timeline, darkness, Moon, dew and wind. Every object is **rated 0–100 for your kit** (viewing, and photography if your setup has a camera), with reasons, the eyepiece to use, a **GoTo helper** (alignment stars for right now plus hand-controller paths), and **"★ Better with…"** when another of your setups suits an object better. |
| **Explore** | A photo gallery of all 55 objects with search and filters. Tap any object for its **info sheet**: a credited photo, a beginner-friendly description, facts, your ratings, a simulated **eyepiece view and camera frame** at your kit's real field of view, and how each of your setups compares. |
| **Events** | Calculated sky calendar (Moon phases, meteor showers, oppositions, elongations, conjunctions, seasons, clock changes) with thumbnails, plus NASA/ESA headlines. |
| **My Kit** | **One search box for all gear:** telescopes, smart telescopes, cameras (DSLR, mirrorless, astro), camera lenses, binoculars and mounts. Build setups part by part on a tappable diagram, keep as many setups as you like, and see what each can do, including how to connect your camera (e.g. *Nikon F T-ring + 1.25″ adapter*). New users start with the naked eye. |
| **Location & sky** (📍 at the top) | GPS, place or UK postcode search, a live map with a NASA night-lights layer, an automatic Bortle estimate, and stargazing conditions. |

On a computer, the tabs move into a left sidebar and the screens use two columns.

The old **Shop** tab (live UK camera prices) is archived in `archive/shop/`.

### How the ratings work

`assets/rating.js` scores each target from standard observing formulae: aperture resolution (Dawes limit)
against a planet's size; limiting magnitude and surface brightness against your sky (Bortle class); the
target's size against your widest eyepiece field; Moon brightness and distance; and altitude. For
photography it adds focal ratio, sensor framing, pixel sampling, read noise and the longest sub your
mount allows (tracking, alt-az field rotation, or the 500 rule when untracked on a tripod). Binoculars and the naked eye get their own simpler ratings. The results are heuristics, tested in `test/rating.test.mjs`.

## Setup

1. **Turn on Pages:** go to *Settings → Pages → Build and deployment → Source* and choose **GitHub Actions**.
2. Merging to `main` runs `.github/workflows/deploy.yml`: it runs the tests and publishes the site. Nothing runs on a schedule.
3. **Refreshing news and object photos is manual on purpose:** run the scripts, check the changes, and commit them yourself.

The site lives at `https://<your-username>.github.io/simplesky/`.

## Run locally

```bash
npm run serve                      # then open http://localhost:8080
node scripts/update-news.mjs       # refresh data/news.json
python3 scripts/build-object-info.py   # fetch missing object photos and descriptions
npm test                           # RSS parsing and rating engine
```

## Data sources

- **Weather:** Open-Meteo. **Geocoding:** Open-Meteo and postcodes.io. **Light pollution:** NASA Black Marble (GIBS). **Map:** Esri dark-grey basemap.
- **Object photos and text:** Wikimedia Commons and Wikipedia, with credits in `data/objects.json`.
- **News:** NASA and ESA RSS via `scripts/update-news.mjs` (run by hand).
- Nothing runs on a schedule. See ROADMAP.md for why.

## Not affiliated

SimpleSky is an independent hobby project. Ratings are estimates to help you plan, not guarantees.
