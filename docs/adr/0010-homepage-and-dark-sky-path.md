# ADR 0010: Homepage at the site root; the Dark Sky Simulator moves to /dark-sky/

Status: accepted · 2026-10-03 (added on request)

## Context
The deployment now carries three apps on one platform: the Dark Sky Simulator, WildSight and the Public Art Policy
Simulator. Jay asked for a homepage that shows all three with screenshots and their videos. The Dark Sky Simulator
sat at the site root, and its shared scenario links and PDF-brief figures point there (`/#s=…&f=…&t=…`).

## Decision
- **Homepage at `/`** (`web/index.html`): a static page (no React) with a card per app: screenshot, one-line purpose,
  four things it does, its planning-estimate caveat, an Open button, and its 30-second video
  (`web/public/home/`, 720p, no audio track; the 1080p originals stay outside the repo).
- **Dark Sky at `/dark-sky/`** (`web/dark-sky/index.html`); its data package moves with it to
  `web/public/dark-sky/data/` because the shared loader reads `data/` next to each page. The pipeline output path,
  tests and comments follow.
- **Old links keep working:** the homepage forwards any `#s=`, `#f=` or `#t=` hash to `dark-sky/` with the hash, so
  shared scenarios and brief hyperlinks generated before the move still open the right view.
- Cross-links between the apps point at `../dark-sky/`, `../wildsight/` and `../public-art/`; each app links home.

## Consequences
- Bookmarks of the bare root now land on the homepage instead of the simulator (one click away).
- `vercel.json` redirects `/dark-sky` to `/dark-sky/` like the other apps, so page-relative paths resolve.
- The homepage screenshots are a snapshot; regenerate them when an app's look changes.
