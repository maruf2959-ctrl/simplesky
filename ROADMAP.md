# Camera Finder: roadmap

This file tracks the project from session to session. **Read it first when you pick the project up**,
then update it as part of every piece of work: tick what's done, add decisions, and note what's next.

> To continue in a new Claude session, say: *"Continue the Camera Finder project, check ROADMAP.md"*

## Goal

Turn Camera Finder from a site built for one telescope (a NexStar 127 SLT in Worthing) into a
**versatile astrophotography gear finder**. Anyone should be able to enter their own telescope, mount
and location, and get honest recommendations, live UK listings and a plan for tonight.

## Status

| | |
|---|---|
| Live site | https://maruf2959-ctrl.github.io/Camera-finder-/ |
| Current version | v1: 127 SLT edition (merged in PR #1, 17 Oct 2026) |
| Now working on | Waiting for the owner to confirm the order of phases below |
| Last updated | 17 Oct 2026 |

## Decisions so far

- **Hosting:** GitHub Pages plus a daily GitHub Action. Free; no server.
- **Stack:** plain HTML, CSS and JavaScript with no build step. The updater is a Node script (`scripts/update-listings.mjs`).
- **Data:** `data/cameras.json` holds the catalogue, `data/listings.json` the daily listings, and `data/history.json` the price history.
- **Listing sources:** First Light Optics ✅ working. eBay UK ⏳ needs the `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` secrets. CeX ❌ blocks GitHub's servers. MPB has no API, so the site links to pre-filled searches instead.
- **Working style:** small steps, each tested, committed, pushed and merged, so the site is never left broken.

## Open questions for the owner

- [ ] Is the app just for you, or for other people too? (Accounts and alerts depend on this.)
- [ ] Stay on free hosting only? (Phase 6 needs a small backend, which is still possible on free tiers.)
- [ ] Should it be installable on a phone home screen (PWA)?

## Phases (draft order; reorder or cut freely)

### Phase 0: Housekeeping
- [x] v1 site live on GitHub Pages
- [x] Daily listings refresh
- [ ] Add eBay API keys (owner action, see README)
- [ ] Hide or remove CeX from the status bar while it's blocked

### Phase 1: Any telescope and mount
- [ ] Setup panel to choose a telescope from a preset list (Maks, SCTs, refractors, Newtonians, Dobsonians, smart scopes) or enter aperture and focal length by hand
- [ ] Mount type: alt-az GoTo, EQ GoTo, star tracker, manual Dobsonian, smart scope
- [ ] Recalculate rankings, framing, sub-length limits, Barlow advice and kit lists from that setup instead of fixed 127 SLT numbers
- [ ] Save the setup in the browser so it's remembered
- [ ] Keep "127 SLT" as a one-tap preset

### Phase 2: Any location
- [ ] Use phone location or a UK postcode for "Tonight", the cloud forecast and field rotation
- [ ] Light-pollution hint (Bortle estimate) for the chosen location

### Phase 3: Wider gear catalogue and listings
- [ ] More cameras: Sony, Fuji, newer Canon and Nikon, Player One, SVBony, QHY
- [ ] Lenses, trackers and mounts, filters, reducers, smart scopes as listing categories
- [ ] Move recommendation text out of `index.html` into the data files so new gear doesn't need code changes

### Phase 4: Night planner
- [ ] Best targets tonight for *your* setup, ranked by altitude, moon and cloud
- [ ] Suggested exposure, gain or ISO, and number of frames per target

### Phase 5: My kit and upgrade path
- [ ] Save the gear you own
- [ ] "Best next upgrade for your budget" suggestions

### Phase 6: Price alerts (needs a small backend or email service)
- [ ] Saved searches, e.g. "Canon 600D under £120"
- [ ] Highlight matching listings on the site; optional email alert

### Phase 7: Results gallery and session log
- [ ] Log sessions (target, kit, exposures, notes)
- [ ] Upload results to compare against the real-world examples

### Phase 8: Polish
- [ ] Installable phone app (PWA) with offline support
- [ ] Red-light night mode to protect dark adaptation

## Changelog

- **17 Oct 2026:** v1 launched with live First Light Optics prices, the 127 SLT research guide, a framing simulator and field-rotation calculator. Roadmap created.
