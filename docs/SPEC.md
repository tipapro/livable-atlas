# Livable Atlas — specification

The current design of the whole system. Why things are the way they are, and what was tried and rejected, is in [`DECISIONS.md`](DECISIONS.md). Data provenance and refresh steps: [`DATA-SOURCES.md`](DATA-SOURCES.md). Publishing and search-console steps: [`DEPLOY.md`](DEPLOY.md).

Change rule: a change to the model, the data contract or the UI updates this file in the same commit; a change of preset values or golden criteria also records its reason in `DECISIONS.md`.

## 1. Goal and success criteria

A public static site: a world map where every land cell of a 0.25° grid gets a 0–100 score for "how good is it to live here". The idea: deconstruct coastal California's climate and infrastructure into measurable factors. The "California" preset is the default; users tune each factor's range, tolerance, weight and key flag, a weight per factor group and the key strength, and the map recolours live. Settings persist in localStorage. UI in English and Russian, usable on mobile; sources and licences are shown on the site.

Performance: moving a slider recolours the map in < 100 ms on a desktop.

**Golden criteria** (California preset, real data, `web/tests/unit/golden.test.ts`; skipped with a warning when required layers are missing):
- Anchors: San Diego ≥ 85, Los Angeles ≥ 80, Lisbon ≥ 70; Novosibirsk ≤ 30, Singapore ≤ 50, Death Valley ≤ 30; Lisbon > Vladivostok.
- Perceived climate: Málaga, Valencia, Perth, Adelaide, Athens ≥ 85; London, Manchester, Hamburg, Seattle, Vancouver at least 12 below Lisbon; Denver > Chicago; Moscow and St Petersburg ≤ 30.
- Grey cities: London, Manchester, Hamburg, Vancouver ≤ 55; Moscow ≤ London.
- Winter sun offsets cold: Khabarovsk > Tomsk.
- Development and safety: Delhi, Bangalore, Mexico City, Cape Town ≤ 45; Nairobi ≤ 55.
- Deserts: Kufra, the Great Sand Sea, Erg Chech, Tamanrasset, Ghardaia, Sebha and Aswan score below each of Yaroslavl, Nizhny Novgorod, Kazan, Samara, Saratov, Volgograd; fewer than 1 % of the cells of Egypt, Libya and Algeria with < 100 mm of rain a year reach the weakest of those cities.
- Remoteness: Nullarbor, the Great Victoria Desert, Alice Springs ≤ 30.
- Rain is penalised, not floored: Sochi ≥ 40; Brisbane, Porto ≥ 60.
- Year-round comfort: Denver at least 20 below San Diego.
- Economy: Oran, Algiers, Tunis, Rabat ≤ 72.
- Regional wealth: the point 30 km east of Moscow (55.75° N) at least 8 above the point 150 km east; Moscow > Nizhny Novgorod; Bucharest > Ploiești.
- Switch-off: with the `country` and `infrastructure` group weights at 0, no factor of those groups changes the score (Moscow +30 km and +150 km).

Tight margins: Málaga exactly 85; Moscow 2 above Nizhny Novgorod. Any recalibration re-runs `cd web && npm test`.

Out of scope: backend, accounts, climate-change projections, resolution finer than 0.25°, sharing settings via URL, dark theme, another basemap provider, e2e in CI.

## 2. Architecture

```
pipeline/ (Python, uv, offline)         web/ (Vite + React + TS, static)
 sources/*  ─fetch→ .cache/raw           loader ─fetch→ public/data/*
 build      ─regrid 0.25°→ float32       store (Zustand + persist)
 pack       ─quantize→ web/public/data ─►  worker: score + paint → ImageData
                                          MapLibre (OpenFreeMap) + image layer
```

The only link between the two parts is the data contract (§3). The pipeline runs locally (sources are ~2.8 GB, not in CI); the packed output (~11 MB) is committed to `web/public/data/`.

Stack:
- pipeline: Python 3.12 (uv), numpy, xarray, rioxarray/rasterio, geopandas, scipy (cKDTree), pytest.
- web: Vite, React 19, TypeScript strict, Zustand (`persist`), MapLibre GL JS, Vitest, Playwright (chromium and firefox). Plain CSS modules with design tokens, no UI kit; hand-written SVG charts and icons; i18n as typed dictionaries.
- Browser floor (Vite's default target): Chrome/Edge ≥ 111, Firefox ≥ 114, Safari/iOS ≥ 16.4. Nothing is polyfilled.

## 3. Data contract (`web/public/data/`)

Grid: global, 0.25°, 1440×720. Cell `(r, c)`, flat index `r*1440 + c`. Row 0 starts at 90° N, column 0 at 180° W. Cell centre: `lat = 90 − (r+0.5)·0.25`, `lon = −180 + (c+0.5)·0.25`.

Only land cells are stored: any land fraction per Natural Earth 10m land (rasterized with `all_touched`), excluding Antarctica (lat < −60); N ≈ 264 000.

Files. Every binary is gzipped with `mtime=0` (reproducible bytes). The loader gunzips (`DecompressionStream`) only bodies that start with `1f 8b`, because the Vite dev server serves `*.gz` already decompressed while GitHub Pages serves the raw gzip; length checks apply to the decompressed bytes.
- `cells.bin.gz` — `Uint32[N]`, strictly increasing flat indices inside the grid.
- `layers/<id>.bin.gz` — `Uint8[N]` or `Uint16[N]` (dtype in the manifest). The type's max (255 / 65535) is nodata. Physical value = `offset + q·scale`.
- `monthly/<var>.bin.gz` — `Uint8[N·12]` or `Uint16[N·12]`, cell-major (`i*12 + m`), same quantization. `tmax`, `tmin`, `tdew` load at startup; `prec` loads lazily when a point card first opens.
- `cities.json` — GeoNames cities with population ≥ 15k: `[name, nameRu|null, countryIso2, lat, lon, population]`, sorted by population descending; populations are city-proper.
- `countries.json` — `{iso3: {name, nameRu}}`, keys in index order (ascending ISO3; code `ISO_A3_EH`, or `ADM0_A3` where that is `-99`), plus `layers/country.bin.gz` (`Uint8` index, 255 = none).
- `manifest.json` (plain JSON, as are `cities.json` and `countries.json`):

```json
{
  "version": 2,
  "grid": { "res": 0.25, "width": 1440, "height": 720, "west": -180, "north": 90 },
  "cellCount": 264000,
  "layers": {
    "warm_tmax": { "file": "layers/warm_tmax.bin.gz", "dtype": "uint8", "scale": 0.5, "offset": -40, "unit": "°C", "source": "terraclimate" }
  },
  "monthly": {
    "tmax": { "file": "monthly/tmax.bin.gz", "dtype": "uint8", "scale": 0.5, "offset": -40, "unit": "°C", "source": "terraclimate" }
  },
  "sources": {
    "terraclimate": { "name": "TerraClimate 1991–2020 normals", "url": "…", "license": "CC0", "citation": "…", "period": "1991–2020 monthly normals", "retrieved": "2026-10-12" }
  },
  "builtAt": "2026-10-12T00:00:00Z"
}
```

The loader rejects any other `version`, a different grid origin or resolution, an unknown dtype and a binary of the wrong length (the error names the file). Every source states `period` (what time the data describes, or its version) and `retrieved` (download date); a pipeline test requires both. A layer missing from the manifest (e.g. a manual source not fetched yet) is not an error: its factor shows as disabled with a "no data" note.

## 4. Pipeline (`pipeline/livable_pipeline/`)

- `grid.py` — grid constants, land mask, cells, cell areas; regridding: `coarsen_mean` / `read_coarse` for rasters on an integer-multiple grid, `rasterize` for vectors, great-circle distance via a KD-tree on 3D unit vectors (to vertices, not segments).
- `sources/<name>.py` — `INFO` (name, url, license, citation, period, retrieved) and `build(grid, raw_dir) -> dict[str, np.ndarray]` (float32, full grid, NaN = nodata). Downloads go through `download.fetch(url, path)` into `pipeline/.cache/raw/<name>/` (written to `.part`, renamed when complete; cached by path). A manual source whose file is missing prints instructions and returns `{}`.
- `sources/synthetic.py` — fake layers for pipeline tests.
- `derive.py` — `tavg = (tmax+tmin)/2`; the warm and cold periods are the 3 consecutive months (wrapping) with the highest and lowest mean `tavg`, so hemispheres need no special case; dew point from vapour pressure (inverse Magnus).
- `pack.py` — quantization per layer from an explicit table (dtype, scale, offset); writes binaries and the manifest.
- `report.py` — layer values at reference places, for calibration.
- `cli.py` — `atlas build [sources...]` builds each source into `.cache/layers/<source>.npz`, continues past a failing source, packs every cached source into `web/public/data.new` and swaps it in only when complete, then exits non-zero naming the failed sources. `atlas report` prints the reference table.

Source-specific rules:
- Water (`coast_dist`): `min(km to the sea coast, 2 × km to a major river or lake)`; Natural Earth rivers with `scalerank` ≤ 4 and lakes ≤ 2 (Volga, Danube, Rhine, Baikal, Great Lakes…), vertices densified below the grid step; `RIVER_FACTOR = 2`.
- Big cities (`dist_bigcity`): GeoNames cities15000 whose centres lie within `AGGLO_KM = 30` km of each other form one single-linkage cluster; every member of a cluster summing to ≥ 1M is a target point.
- CRU (`sunshine`, `wet_days`, `cold_sun`): CRU's 10′ land mask misses some coasts, so empty cells take the nearest CRU cell within 2 cells (~55 km). `sunshine` = Σ monthly % of possible sunshine × day length (FAO-56 eq. 34). `cold_sun` = mean % of possible sunshine over Dec–Feb (lat ≥ 0) or Jun–Aug (lat < 0).
- Kummu GDP (`gdp_pc`): Zenodo record 18429133, band count asserted (35), last band (2024); 5′ → 0.25° as the mean of the 3×3 source pixels ignoring nodata; `uint16`, scale 10 (max 655 340 $; the richest land cell is 633 470 $).
- PM2.5: only ACAG's global `GL` product (manual download); regional files are ignored.
- Countries: rasterized from Natural Earth admin0. A cell takes the country containing its centre; a land cell whose centre falls in no country takes the one country touching it, else the nearest assigned country. A country without a value is nodata, except parents: Somaliland → Somalia, Northern Cyprus → Cyprus, Kosovo → World Bank `XKX` (`PARENT` in `sources/countries.py`).
- GFED: the build asserts all 240 monthly files are present.

Licences: GEM is CC BY-NC-SA, so the site and the packed data are non-commercial; CRU CL 2.0 has no explicit licence (credited by citation); everything else is CC BY / CC0 / public domain. Attribution is built from `manifest.sources`. The code is MIT.

## 5. Factors and the California preset

Each factor has a comfort range `[lo, hi]` (score 1), a tolerance `tol` (linear falloff to 0 on each side), a weight 0–5 and a key flag (settings field `critical`). For `log` factors, distances are in log10 and `tol` is in decades; the UI shows original units. Group weights 0–5 in steps of 0.5; preset: climate 4, country and region 2.5, infrastructure 2, hazards 1, environment 1, geography 0.5. Key strength `k` = 0.25. Values live in `web/src/scoring/presets.ts`.

| id | What | Unit | Source | lo–hi | tol | w | key |
|---|---|---|---|---|---|---|---|
| **Climate** |
| warm_tmax | daytime high, warm period | °C | TerraClimate 1991–2020 | 22–29 | 7 | 5 | ✓ |
| warm_tmin | night low, warm period | °C | TerraClimate | 13–20 | 6 | 3 | |
| cold_feel | felt winter day: `cold_tmax + sunBonus · cold_sun / 100`, sunBonus 8 °C (client-side, §6) | °C | derived | 18–30 | 18 | 5 | ✓ |
| cold_tmax | daytime high, cold period (input of `cold_feel`) | °C | TerraClimate | 15–24 | 15 | 0 | |
| cold_sun | % of possible sunshine in winter (input of `cold_feel`) | % | CRU CL 2.0 sunp, 1961–1990 | 50–100 | 40 | 0 | |
| cold_tmin | night low, cold period | °C | TerraClimate | 5–14 | 12 | 2 | |
| warm_tdew | dew point (mugginess), warm period | °C | TerraClimate | −10–16 | 6 | 4 | ✓ |
| precip_annual (log) | annual precipitation | mm | TerraClimate | 230–1000 | 0.3 | 1 | ✓ |
| sunshine | bright sunshine hours per year | h | CRU CL 2.0 sunp | 2800–4200 | 1200 | 5 | ✓ |
| wet_days | days per year with > 0.1 mm | days | CRU CL 2.0 rd0 | 0–60 | 110 | 5 | ✓ |
| wind_mean | mean wind speed | m/s | TerraClimate ws | 0–5 | 4 | 1 | |
| seasonality | warm-period tavg − cold-period tavg | °C | derived | 0–12 | 12 | 3 | |
| frost_months | months with tavg < 0 | mo | derived | 0–0 | 4 | 2 | |
| comfort_months | comfortable months (client-side, §6) | mo | monthly | 8–12 | 6 | 5 | ✓ |
| **Geography** |
| coast_dist | distance to water (sea, big rivers and lakes) | km | Natural Earth | 0–50 | 300 | 3 | |
| elevation | elevation | m | ETOPO 2022 | 0–1500 | 1500 | 1 | |
| ruggedness | std dev of elevation within the cell | m | ETOPO 2022 | 0–1000 | 500 | 0 | |
| **Hazards** |
| cyclone_freq | hurricane-strength (≥ 64 kt) passes within 150 km per decade | count | IBTrACS v04, since 1980 | 0–0.2 | 2 | 3 | |
| seismic_pga | PGA, 10 % in 50 years | g | GEM GSHM v2023.1 | 0–0.42 | 0.5 | 1 | |
| wildfire | mean annual burned fraction | % | GFED5 | 0–0.5 | 5 | 1 | |
| flood | share of cell in the 100-year floodplain | % | JRC | 0–5 | 30 | 1 | |
| **Environment** |
| pm25 | annual mean PM2.5 | µg/m³ | ACAG V6.GL.02.04, 2022 | 0–11 | 25 | 2 | ✓ |
| **Infrastructure** |
| travel_city | travel time to a city ≥ 50k | min | Nelson et al. 2019 | 0–20 | 100 | 3 | ✓ |
| dist_bigcity | distance to an agglomeration ≥ 1M | km | GeoNames cities15000 | 0–30 | 120 | 2 | |
| dist_airport | distance to a large airport | km | OurAirports | 0–50 | 150 | 1 | |
| pop_density (log) | population density | /km² | GHSL GHS-POP 2020 | 100–20 000 | 1 | 1 | |
| **Country and region** (group id `country`) |
| gdp_pc (log) | admin-2 GDP per capita, PPP, constant 2021 USD, 2024 | $ | Kummu et al. 2025 | 50 000–650 000 | 0.7 | 3 | ✓ |
| hdi | Human Development Index (national) | 0–1 | UNDP HDR | 0.85–1 | 0.15 | 3 | ✓ |
| homicide | homicides per 100k (latest year) | /100k | World Bank VC.IHR.PSRC.P5 | 0–6 | 10 | 2 | ✓ |
| price_level | price level vs US (PPP / exchange rate) | ratio | World Bank | 0–1.2 | 0.8 | 0 | |

Weight-0 factors (`cold_tmax`, `cold_sun`, `ruggedness`, `price_level`) are reference layers: they have map modes and card rows but do not score. San Diego sits inside every range; the settings sliders mark its value ("CA").

## 6. Score model (web, pure functions)

For each cell and each factor with `weight > 0` whose layer is in the manifest:
- `v` = value; nodata → the factor is skipped for that cell (a key factor too: no penalty).
- `x = log ? log10(max(v, ε)) : v`; `d = max(lo − x, 0, x − hi)`; `s = tol > 0 ? max(0, 1 − d/tol) : (d == 0 ? 1 : 0)`.
- Group score `g = Σ w·s / Σ w` over the group's factors with data; a group with none is skipped.
- Base `b = Σ W_g·g / Σ W_g` over groups not skipped; if `Σ W_g == 0` or no factor has data, the cell is nodata (255).
- Key penalty, for each key factor with data, `weight > 0` and group weight > 0: `m = max(0.3, 1 − k·(d/tol)²)`. `k = 0` switches all penalties off; with `k > 0` and `tol = 0`, `m` is 1 inside the range and 0.3 outside.
- `score = round(100 · b · Π m)`, 0–100. Nothing is excluded.
- "Lost" for a factor (point card) = the score with that factor made perfect (`s = 1`, `m = 1`) minus the actual score; `samplePoint` computes it in the worker.

Derived layers, built in the worker by `derivedLayers` and rebuilt when the comfort settings change:
- `comfort_months` = months with `tmax ∈ [dayLo, dayHi]`, `tmin ≥ nightMin`, `tdew ≤ dewMax`; preset 18–31 °C, ≥ 8 °C, ≤ 18 °C.
- `cold_feel` = `cold_tmax + sunBonus · cold_sun / 100`, preset `sunBonus` 8 °C; nodata where either input is.

Worker output: `Uint8Array[N]` (0–100, 255 nodata), the map `ImageData` (§7) and `tone` (101 numbers, §7). Settings changes are latest-wins: the worker processes only the newest message; `sample` requests are coalesced the same way.

## 7. Map rendering

- MapLibre GL JS with the OpenFreeMap "positron" style (no key). The score layer is a `canvas` source under the first symbol layer (labels on top), `raster-resampling: nearest`, opacity 0.75. MapLibre is a lazy chunk: the app shell, loader and worker start without it; while it downloads the map area shows `Loading map…`, and if the chunk fails an alert offers a reload.
- The worker paints a 1440×1440 Web Mercator image (±85.0511°): each output row is inverse-projected to a grid row and the cell found via a lookup table `Int32[1440·720]` (flat index → cell index or −1), built once.
- Palette: six evenly spaced stops — dark purple, blue, teal, green, yellow (80), orange (100). Nodata and ocean are transparent.
- **Contrast** (score map only, default on): after each run the worker builds a 101-bin histogram of scored cells, clips every bin at 1.5 × its even share and spreads the excess evenly, then `tone[s] = round(100 · (cdf(s−1) + cdf(s)) / 2)`; a cell is painted `PALETTE[tone[s]]`. No scored cell → `tone[s] = s`. Contrast off, factor and monthly maps are linear.
- Map modes: `score` | `factor:<id>` (raw values, own scale and legend) | `monthly:<var>` (month slider 1–12).
- World copies are rendered; clicks are wrapped (`lngLat.wrap()`), so card, pins and worker always see lon in [−180, 180).
- Loading feedback: until the first score is drawn, a card shows `Loading data… NN %` (native `<progress>`; counts only responses with `Content-Length` and no `Content-Encoding`, so on the dev server it is indeterminate; never decreases). `Loading map…` until the style loads, then a small spinner from `dataloading` to `idle`. The score layer needs the basemap style: while OpenFreeMap is down the map stays blank and a status says so.
- Dev only: `window.__map` and a preserved drawing buffer, so e2e can read pixels.

## 8. UI

- Full-screen map. Left panel (360 px) with tabs Settings, Cities, Compare; collapses to a 48 px icon rail (and is shown as the rail while a point card is open below 1024 px). A floating top bar holds the city search (combobox), the locale toggle and "About the data". The point card (340 px) sits on the right. One bottom dock holds the mode select, the month slider and the legend; it wraps when narrow. Light theme only; colours, radii, spacing and fonts are design tokens in `index.css`.
- **Mobile (< 768 px):** the panel becomes a bottom sheet with peek (72 px), half (50 %) and full heights; the handle cycles them and dragging snaps; not persisted (default peek); a tab tapped at peek raises it to half. While a point is open the sheet has a fourth tab, Place, holding the card (opens at half; closing returns to the previous tab). Locale and About become icon buttons. Dock and compact attribution sit above the peek; the attribution starts collapsed. Flying to a city uses a `flyTo` offset of a quarter viewport upwards.
- **Settings:** preset picker (California plus user presets: save as…, delete), reset to preset, "Key factor strength" slider (0–1, step 0.05), factor groups with a weight slider on each header, factor rows with weight, Key toggle, an expandable dual `lo–hi` slider and `tol` field. The expanded `comfort_months` row holds the comfort parameters, the `cold_feel` row the winter sun bonus. Factors without data are disabled and labelled.
- **Legend:** the ramp with labels. In score mode a "Contrast" / «Контраст» checkbox: on — five labels (lowest score, the scores reaching tone 25, 50, 75, highest score); off — 0 and 100. The card's score badge uses the map colour (`tone[score]` while Contrast is on).
- **Point card** (map click): coordinates, nearest city and country, score; the factor breakdown (value, `s` bar, points lost, key tag) sorted by lost, collapsed to the top 5; monthly climate chart (tmax/tmin lines, precipitation bars); "Add to compare" (disabled on a no-data card). A city whose cell is off land opens a "No data" card.
- **Cities:** the 20 best cities with population ≥ 100k by their cell's score. **Search:** prefix match on `name` and `nameRu`, case-, diacritics- and ё/е-insensitive; arrows, Enter, Escape (closes only the list); picking flies to the city and opens its card.
- **Compare:** up to 3 pinned points (deduplicated by cell), factors × points, best value per row highlighted.
- **About the data:** a native modal dialog with the model description, a link to the guide in the current language, and each source's licence, citation, period and retrieval date.
- i18n: `en` and `ru`, default from `navigator.language`, toggle in the top bar.
- Accessibility: tabs with `role="tablist"` and arrow keys; the combobox pattern with a live result count; focus returns after picking a city, closing the card or a dialog; visible focus ring; motion respects `prefers-reduced-motion`.

**State** (Zustand `persist` → localStorage `livable-atlas:v1`, persist version 7): `{ presetId, factors: {[id]: {lo, hi, tol, weight, critical}}, comfort: {dayLo, dayHi, nightMin, dewMax, sunBonus}, groups, strength, userPresets, mapMode, month, contrast, pinned: [{lat, lon}], locale, ui: {panel, tab} }`. `contrast` (default true) is not part of presets. If localStorage is unavailable or a write fails, state lives in memory and a status says so.

**Upgrading saves** (`merge` in `web/src/state/store.ts`), field by field, the same for every user preset:
- a missing factor, one whose bounds no longer fit its slider (unit changed) or a missing/non-boolean key flag takes the preset;
- a past preset value the user never edited is replaced by the current one: saves without `groups` (before group weights existed) against every past preset value; newer saves only for values recalibrated after their persist version (`RECALIBRATED`: v2 `precip_annual` in mm; v3 the four infrastructure factors and `groups.infrastructure` 1; v4 `travel_city` not key; v6 `comfort_months`, `gdp_pc` not key and `hdi` tol 0.25; v7 `travel_city` tol 120); v5 replaces every `precip_annual` (`NOW_LOG`: its tolerance moved from mm to decades);
- `groups`, `strength`, `comfort.sunBonus` are clamped and rounded as the setters do; anything else takes the preset; `ui.panel` and `ui.tab` are validated independently;
- a save that cannot be repaired (no factors object, invalid comfort) resets to the preset.

## 9. Static pages and SEO

- Three HTML entry points: `index.html` (the map), `about.html` and `about-ru.html` (translated guides: what the map measures, how the score works, how to use it, data sources, limitations). The guides need no JavaScript or map data and link to each other and to the map; the map's initial HTML has a short readable introduction and links to both guides until the app replaces it.
- `web/seo.ts` (a Vite plugin) injects per-page titles, descriptions, canonical URLs, Open Graph/Twitter metadata (image `social-preview.png`, a 1200×630 map screenshot), application JSON-LD on the map page, `hreflang` alternates on the guides only, and emits `sitemap.xml` (three URLs, no modification dates) and a permissive `robots.txt`.
- Absolute URLs come from `SITE_URL`, which the Pages workflow takes from `actions/configure-pages` (switched to `https://`: a custom domain without Enforce HTTPS reports `http://`); the local default is `https://tipapro.github.io/livable-atlas/`. It must be an absolute HTTPS URL without credentials, query or fragment, otherwise the build fails. Assets stay relative (`base: './'`), so any repository name works.

## 10. Errors

- Manifest or layer failed to load, or a corrupt binary: an error screen naming the file, with Retry.
- Worker error: a status toast; the map keeps its previous render.
- `prec` failure: the card works without precipitation, `monthly:prec` falls back to the score with one dismissible status.
- Basemap style failure: a status message.
- Pipeline: a missing manual source is a warning; a failing source fails only itself, and the old data stays in place.

## 11. Testing

- pipeline (pytest): grid math, regridding, KD-tree distances, warm/cold periods in both hemispheres, dew point, water and agglomeration rules, `cold_sun` windows, country parents, pack round-trip, manifest fields.
- web unit (Vitest): trapezoid, log factors, group weights, key penalty, derived layers, nodata, contrast `tone`, binary decoding and loader checks, Mercator resampling, lookup table, search normalisation, save upgrades, SEO build output (`tests/unit/seo.test.ts` runs real Vite builds for project, root and custom-domain URLs).
- golden (Vitest, real data): §1.
- e2e (Playwright, chromium and firefox, needs network for OpenFreeMap): load and render, slider → card score, persistence, EN/RU, search, tabs and rail, mobile sheet, layout overlap at 375/768/1024/1280, world copies, Contrast, guides without JavaScript, lazy MapLibre and its failure.
- CI (`.github/workflows/pages.yml`): typecheck, unit tests, build, publish to Pages. No e2e, no pipeline.

## 12. Known limitations

- About 1000 atoll cells (French Polynesia, Maldives, Fiji, Kiribati) have no CRU sunshine or rainy days; 1042 cells have `cold_tmax` but no `cold_sun`, so the key winter factor is skipped there (67 of them below 0 °C: Arctic islands, Kurils).
- CRU covers 1961–1990, TerraClimate 1991–2020.
- Countries without a homicide rate (Libya, DR Congo, Chad, Mali, …) are not penalised for it; HDI and homicide are national.
- Single-linkage agglomerations can chain metros (the largest cluster, in Japan, has 1082 members).
- `download.fetch` caches by path, not URL: changing a source URL needs the cached file deleted. GFED extraction writes in place, so an interrupted extraction can leave a truncated file. ETOPO regridding peaks at ~6–8 GB RAM.
- Safari/WebKit has never been run; e2e depends on OpenFreeMap; `data-renders` counts images received, not drawn.
- The legend and card badge use the previous `tone` for one frame after a toggle; legend labels sit only approximately under their ramp positions.
- The guides (`about.html`, `about-ru.html`) restate model facts (30 factors, source list) by hand: update them with any model change.
