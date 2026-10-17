# Camera Finder · 127 SLT

A stargazing-themed web app with **live UK listings** for astrophotography cameras that suit a
**Celestron NexStar 127 SLT** (127 mm Maksutov, 1,500 mm, f/12, alt-az GoTo). It also has an honest
research guide to what that telescope and mount can achieve.

The listings refresh **every day** through a GitHub Action, and the site is served free from GitHub Pages.

## What's in it

| Section | What it does |
|---|---|
| **Tonight over Worthing** | Dark window, moon phase, cloud forecast (Open-Meteo), and the altitude of M42/M31/M51/M81/M13/M57/M27/Jupiter/Saturn. It also gives the **field-rotation-limited exposure** for your chosen camera, calculated live. |
| **Live UK listings** | eBay UK (official API), CeX, and First Light Optics prices, filtered to the recommended cameras. Spares, accessories and "for parts" items are excluded. Listings below the median are flagged as deals. |
| **Rankings** | 8 cameras ranked for *this* telescope, with live prices, image scale, field of view and a price-trend sparkline. |
| **Framing simulator** | Draws each sensor's field against each target at prime focus, with the 0.5× reducer, with the 2× Barlow, or on a camera lens. |
| **Limits, kit list, alternatives, examples, sources** | The research: f/12 brightness, field rotation, SLT tracking, frames to stack, Barlow use, exact adapters with totals, the lens-plus-tracker alternative, and real 127 Mak results. |

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
npm test                           # listing-filter unit tests
```

## Data sources and their limits

- **eBay UK** uses the Browse API (`EBAY_GB`, item location GB, "for parts" condition excluded).
- **CeX** uses the public JSON that powers uk.webuy.com. It's best effort: CeX sometimes blocks cloud IPs. If it fails, the last good results stay on the site and are marked "Not re-checked".
- **First Light Optics** reads the price and stock status from each product page.
- **MPB** blocks automated access, so the site gives one-click pre-filled MPB, eBay, CeX, ABS UK and Stargazers Lounge searches instead.

To add or tune a camera, edit `data/cameras.json`: `match` controls which titles count, `priceRange` sets the price filter, and `retail` lists product pages to price-check.

## Not affiliated

This site is an independent hobby project. Prices are indicative; always check the listing.
