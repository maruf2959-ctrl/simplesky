# Shop (archived 1 Nov 2026)

The Shop tab (live UK camera listings, camera rankings, framing simulator and the
127 SLT camera-buying guide) was removed from the app on the owner's request after
they bought a Nikon D5300. Everything is kept here so it can come back later.

| File | Was at |
|---|---|
| `shop-section.html` | the `#view-shop` section of `index.html` |
| `shop.js` | `assets/views/shop.js` |
| `update-listings.mjs` | `scripts/update-listings.mjs` (eBay Browse API, CeX, First Light Optics) |
| `update-listings.test.mjs` | `test/update-listings.test.mjs` |
| `cameras.json`, `listings.json`, `history.json` | `data/` |

The Shop's CSS is still in `assets/style.css` (`.listing`, `.rank`, `.framing`, …).

**To restore:** move the files back, paste `shop-section.html` into `index.html` as a
view, add a `#shop` tab and the `shop.js` script tag, and fix the imports in the test.
**Don't** bring back a scheduled scraping workflow: refresh listings by hand (see ROADMAP.md).
