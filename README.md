# Livable Atlas

[Open the map](https://tipapro.github.io/livable-atlas/) · [How it works](https://tipapro.github.io/livable-atlas/about.html) · [Russian guide](https://tipapro.github.io/livable-atlas/about-ru.html)

A world map that scores every 0.25° land cell (about 264 000 cells) from 0 to 100 for "how good is it to live here". It starts from a California-like preset: sunny, dry, mild all year, safe, developed, close to a city. You can tune every factor's range, tolerance, weight and "key" flag, and a weight per factor group; the map recolours in the browser.

Static site, no backend: the data is precomputed and served from `web/public/data/`.

## How the score works

- About 30 factors in six groups: climate, geography, hazards, environment, infrastructure, country and region.
- Each factor scores 0–1 with a trapezoid: full marks inside its range, falling to 0 over its tolerance.
- Factors are averaged by weight inside a group, then groups by group weight.
- A **key** factor also multiplies the total, by between 1 and 0.3: a desert, a muggy summer, no city for hours, a weak economy or violent crime pull the whole score down.
- The map's **Contrast** mode (on by default) stretches the palette where many places share similar scores. Turn it off for absolute 0–100 colours.

The full model and the data contract are in [`docs/SPEC.md`](docs/SPEC.md); the reasons behind it and the rejected alternatives in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Data

17 open datasets. They are listed in [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) with the period each one covers, the date it was retrieved, its licence and how to refresh it. The site shows the same list under **About the data**.

The GEM seismic hazard map is CC BY-NC-SA, so the site is **non-commercial**.

## Licence

The code is MIT-licensed (`LICENSE`). The data in `web/public/data/` is derived from the sources above and keeps their licences; because of GEM's CC BY-NC-SA, the packed data and the site as a whole are non-commercial.

## Layout

- `pipeline/` — Python (uv). Downloads the sources, regrids them to the 0.25° grid and packs binary layers and `manifest.json` into `web/public/data/`.
- `web/` — Vite + React + TypeScript + MapLibre. Reads only `web/public/data/`; scoring runs in a Web Worker.
- `docs/` — spec, decisions, data sources, deploy guide and the human's to-do list.
- `AGENTS.md` — the guide for the coding agents that wrote and maintain this project.

## Commands

```sh
# web (Node from web/.nvmrc)
cd web && npm ci
npm run dev        # local site
npm test           # unit tests, incl. golden criteria on the real data
npm run e2e        # Playwright, chromium + firefox (needs network for the base map)
npm run typecheck && npm run build

# pipeline (uv; needs ~3 GB of downloads in pipeline/.cache/raw)
cd pipeline
uv run pytest
uv run atlas build [source ...]   # all sources by default
uv run atlas report               # layer values at reference places
```

## Deploy

GitHub Pages via GitHub Actions (`.github/workflows/pages.yml`): every push to `main` runs typecheck, tests and build, then publishes `web/dist`. First-time setup is in [`docs/DEPLOY.md`](docs/DEPLOY.md).

Browsers: Chrome/Edge ≥ 111, Firefox ≥ 114, Safari/iOS ≥ 16.4. Base map: [OpenFreeMap](https://openfreemap.org/) (© OpenMapTiles, data © OpenStreetMap contributors); the score layer is drawn on top of its style, so the map stays blank while OpenFreeMap is down.
