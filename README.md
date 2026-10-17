# SimpleSky

An all-round **stargazing app for your phone**: what *your* telescope can see tonight, the weather,
a sky calendar, your kit, and live UK gear prices. It started as "Camera Finder", a camera guide for a
**Celestron NexStar 127 SLT** and now works with any telescope. It's installable (Add to Home Screen),
works offline at a dark site, and has a red night mode.

The plan and progress live in [ROADMAP.md](ROADMAP.md).

## Tabs

| Tab | What it does |
|---|---|
| **Home** | Tonight at a glance, the best targets for your kit, "Did you know?" facts, and a beginner's start guide. |
| **Tonight** | Cloud timeline, darkness, Moon, dew and wind. Every target is **rated 0–100 for your kit** (viewing, and photography if you've added a camera), with the eyepiece to use, the reasons behind the score, and a **GoTo helper** (alignment stars to use now plus hand-controller paths). |
| **Events** | Calculated sky calendar (Moon phases, meteor showers, oppositions, elongations, conjunctions, seasons, clock changes) plus NASA/ESA headlines refreshed daily. |
| **My Kit** | Search about 50 popular telescopes (or enter your own), build the setup on a tappable diagram, switch between modular and all-in-one, and see magnification, field of view, limiting magnitude and camera numbers. Multiple setups are supported. |
| **Shop** | Live UK listings (eBay, CeX, First Light Optics), rankings, framing simulator and the 127 SLT camera guide. |
| **Location & sky** (📍 at the top) | GPS, place or UK postcode search, a live map with a NASA night-lights layer, an automatic Bortle estimate, and stargazing conditions. |

### How the ratings work

`assets/rating.js` scores each target from standard observing formulae: aperture resolution (Dawes limit)
against a planet's size; limiting magnitude and surface brightness against your sky (Bortle class); the
target's size against your widest eyepiece field; Moon brightness and distance; and altitude. For
photography it adds focal ratio, sensor framing, pixel sampling, read noise and the longest sub your
mount allows (tracking or alt-az field rotation). The results are heuristics, tested in `test/rating.test.mjs`.

## Setup (about 10 minutes)

1. **Merge this branch into `main`.** Scheduled workflows only run on the default branch.
2. **Turn on Pages:** go to *Settings → Pages → Build and deployment → Source* and choose **GitHub Actions**.
3. **Add eBay API keys** (free). Without them, the site still works but shows only retailer and CeX prices.
   1. Sign up at <https://developer.ebay.com> and create a **Production** keyset.
   2. eBay asks production apps about *Marketplace Account Deletion* notifications. This app stores no eBay user data, so choose the **exemption / opt-out** option.
   3. In the repository, go to *Settings → Secrets and variables → Actions* and add `EBAY_CLIENT_ID` (the App ID) and `EBAY_CLIENT_SECRET` (the Cert ID).
4. Go to *Actions → "Update listings & deploy site" → Run workflow* to do the first refresh. After that it runs daily at 05:17 UTC.

Your site will be at `https://<your-username>.github.io/Camera-finder-/`.

## Run locally

```bash
node scripts/update-listings.mjs   # refresh data/listings.json (set EBAY_* env vars for eBay)
npm run serve                      # then open http://localhost:8080
node scripts/update-news.mjs       # refresh data/news.json
npm test                           # listing filters, RSS parsing and rating engine
```

## Data sources and their limits

- **eBay UK** uses the Browse API (`EBAY_GB`, item location GB, "for parts" condition excluded).
- **CeX** uses the public JSON that powers uk.webuy.com. It's best effort: CeX sometimes blocks cloud IPs. If it fails, the last good results stay on the site and are marked "Not re-checked".
- **First Light Optics** reads the price and stock status from each product page.
- **MPB** blocks automated access, so the site gives one-click pre-filled MPB, eBay, CeX, ABS UK and Stargazers Lounge searches instead.

To add or tune a camera, edit `data/cameras.json`: `match` controls which titles count, `priceRange` sets the price filter, and `retail` lists product pages to price-check.

## Not affiliated

This site is an independent hobby project. Prices are indicative; always check the listing.
