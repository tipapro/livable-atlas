# Livable Atlas — decisions and rationale

Why the model and the product look the way they do. The current design is in [`SPEC.md`](SPEC.md). Read this before changing the preset, the score model or a golden criterion: most "obvious improvements" below were measured and rejected. Scores are on the California preset with real data unless stated otherwise.

## Guiding principle

The human's main criterion is **how people actually feel a place**, not raw numbers. What people praise in coastal California: sunshine nearly every day, few rainy days, mild winter days, no muggy or scorching summers, weather fit to be outside all year, little change through the year — plus a safe, developed economy and a city within reach. Calibrate by looking at the map (headless screenshots of a region, Contrast on and off), not only at numbers.

## Score model

- **Nothing is excluded.** Early versions excluded cells failing a "critical" factor; it was inconsistent: Russia dropped out on a temperature factor while Britain, failing sunshine and rainy days as badly, scored 76. Every place now stays on the map with a low score.
- **Group weights.** With one flat weighted mean over 27 factors, climate had 63 % of the weight and country 8 %; a weight-5 factor at zero cost only ~7.7 points, so many passed factors diluted the few failed ones (Bangalore with PM2.5 at 8/100 equalled Manchester; Cape Town at ~40 homicides per 100k scored 92). Groups are averaged first, then weighted.
- **Key factors as a soft multiplicative penalty** `max(0.3, 1 − k·(d/tol)²)`. Rejected, measured: group weights alone (London stayed 85 — sun is still diluted inside the climate group); a linear penalty over 8 key factors (Málaga 52, Lisbon 72); a penalty on `s` alone (Death Valley 57: +46 °C cost the same as +36 °C); no floor (Cape Town and Chita went to 0). One global strength and a constant floor: per-factor strength and a tunable floor were not wanted.
- **A key factor in a zero-weight group does not penalise**, so setting `country` and `infrastructure` to 0 really leaves only climate and nature (a human requirement).
- **Missing data is skipped, not penalised**, for key factors too. Consequence accepted: Libya and DR Congo have no homicide rate and are not penalised for it.
- **Option B rejected** (a "cities and country" block that the climate penalties do not compress): it lifts Moscow visibly but also lifts rich grey cities such as London above 55.

## Climate

- **Sunshine from CRU hours, not radiation.** TerraClimate radiation mostly tracked latitude (sunny Chita 148 W/m², grey London 114); CRU sunshine hours match station records within ~±5 % (San Diego 3058 h, Lisbon 2745, Moscow 1693, London 1456). CRU CL 2.0 has no explicit licence; accepted for a personal non-commercial site, credited by citation.
- **Wet days** were added because people feel the number of grey, wet days rather than millimetres.
- **Felt winter day (`cold_feel`)** is the key winter factor: the daytime high plus 8 °C × the winter share of possible sunshine. Clear, calm winter sun feels about 6–10 °C warmer than the shade (UTCI, Steadman's apparent temperature), so sunny frost (Transbaikal, the Russian Far East, the Rockies) beats grey frost at the same temperature. It is computed in the browser so the bonus is tunable. The daytime high, not the night low, because Denver's sunny winters (8 °C days, −7.5 °C nights) are pleasant while Chicago's 2.5 °C days are not. `cold_sun` uses fixed solstice months, independent of TerraClimate's coldest window.
- **Comfort months**: dry 31 °C days and Mediterranean 17.5–18 °C summer dew points are not felt as uncomfortable, hence 18–31 °C and dew ≤ 18 °C. Key since Denver (83) looked like California; making it key dropped Denver to 68. Measured alternatives: climate weight 6 (Denver only 80), seasonality key (Khabarovsk 9, Bucharest 49), cold-night key (breaks the desert check).
- **`warm_tmax` stays 22–29** although the Los Angeles cell mean is 31 °C: widening it lifted Singapore above its limit; LA still scores ≥ 80.
- **Precipitation is key and log-scaled.** Deserts passed most climate factors (sun, dry air, mild sunny winters) and half the arid cells of Egypt, Libya and Algeria reached Yaroslavl ("uninhabitable desert higher than the Volga — not normal"). Making rain key with a symmetric trapezoid in mm then floored everything above ~1134 mm (Sochi 18, Brisbane 23, Porto 23). On a log scale (rain is felt by ratio), `230–1000 mm, tol 0.3 decade`: the dry side floors below ~75 mm (Kufra 2, Aswan 4), the wet side costs ×0.78 at 1700 mm and floors only above ~3200 mm (then Sochi 54, Brisbane 78, Porto 74). Cost accepted: rainless mild fog-desert coasts fall too (Lima 16, Antofagasta 26).
- **Rio de Janeiro stays low (~17)**: homicide, rainy days, a muggy summer and sunshine compound. Accepted.

## Geography, hazards, environment

- **Water includes big rivers and lakes** (`min(sea, 2 × river)`): the human wanted the Volga to count, slightly less than the sea. One factor, id kept `coast_dist` so saves keep working. Cut-off: rivers rank ≤ 4, lakes ≤ 2 (Volga cities, Vienna, Budapest, Chicago now 4–21 km); Irkutsk is 123 km because its Angara reach is rank 6 — the Elbe, Loire, Kama, Don are out too; revisit if smaller rivers should count.
- **`seismic_pga` 0–0.42** because Los Angeles is 0.41 g; **`homicide` 0–6** because the US rate is 5.76; **`pm25` 0–11** because Los Angeles is 10.6 µg/m³ — the preset is anchored so San Diego/LA sit inside every range.
- **PM2.5: only ACAG's global product**, so the layer has no seams between regional calibrations.

## Infrastructure and wealth

- **Agglomerations for `dist_bigcity`.** City-proper populations put Seattle 711 km, Denver 891, Lisbon 433 km from a "city ≥ 1M"; clusters of cities within 30 km fixed that (Seattle 4, Denver 5, Lisbon 1). Chaining in dense regions is acceptable for a distance factor.
- **Regional GDP (Kummu et al. 2025, admin-2).** The human expected a visible halo around Moscow and "a developed city with good infrastructure is better than just a big city". HDI, homicide and price level are national; GDL subnational HDI splits Russia only into 8 federal districts (Moscow sits inside the Central district, below Ural and North-West) and was declined; national UNDP HDI stays. Kummu is open (CC BY 4.0) and separates Moscow city from Moscow oblast. The preset `hi` (650 000 $) equals the richest region, so a richer place never scores lower.
- **GDP is key and HDI tolerance 0.15**: a fine climate did not make up for a weak economy (Oran 82, Rabat 76); now Oran 71, Rabat 50, Tunis 47. Measured alternative: country weight 3.5 (Oran still 81).
- **Crimea (~40) sits below Novorossiysk (63)** because its regional GDP is a quarter as high. Accepted.
- **Stricter infrastructure, group weight 2**, so "any city is better than nothing" shows within a region; density `hi` 20 000 so megacity cores are not penalised. Stronger knobs were measured and bought little (GDP weight 5: nothing; infrastructure 3–4: halo 7–8 but Nairobi near its limit).
- **`travel_city` is key**: a mild sunny climate with no city for hours scored like a good city (Nullarbor 78, Alice Springs 55, above London 44); now 23 and 16. Tolerance 100 min (not 120) so the web of towns and roads around big cities shows instead of a solid fill. Cost: remote countryside 2–3 h from a town loses 15–30 % (Madrid + 150 km 32, Alentejo 63).
- **Moscow vs its region**: the halo exists (golden: ≥ 8 points between +30 and +150 km east) but Moscow itself is only ~2 above Nizhny Novgorod, because the climate key penalties (×≈0.4 around Moscow) compress every non-climate difference. That is the price of the multiplicative model (see option B).

## Countries

- Small islands keep their own country (a cell touching exactly one country takes it); before, Malé counted as India.
- Somaliland, Northern Cyprus and Kosovo take their parent's values; without that Hargeysa scored 93 for lack of HDI and homicide data. Other gaps (Libya, DR Congo, Taiwan…) stay unfilled.

## Map and palette

- **Contrast-limited equalisation (clip 1.5), on by default.** With the linear ramp, 15–35 — most of Russia, Canada, northern Europe — sat in one narrow band and 22 vs 27 was invisible. Full equalisation gave half the ramp to scores 0–10 (Sahara, Siberia, Amazonia) and turned everything above ~30 yellow (Bengaluru looked like San Diego). The clip keeps the stretch where scores crowd and leaves the top its room: only scores ≥ ~67 reach yellow.
- **Orange top at 100** (yellow moved to 80) at the human's request, so the best places stand out from merely good ones.
- **OpenFreeMap positron basemap** (no key, no limits); CARTO raster and vector were offered and declined. Its tiles are slow (z4 tile 808 KB, 2.2 s), hence the explicit loading indicators.

## Product and engineering

- **Light theme, layout "A"**: one collapsible left panel with tabs, floating search, compact card, bottom dock; mobile bottom sheet.
- **Static site on GitHub Pages**, data precomputed and committed; binaries gzipped by the pipeline because Pages does not compress `.bin` (29 MB → ~11 MB). The pipeline is not in CI (gigabytes of downloads); e2e is not in CI (network and browsers).
- **Settings migrations** keep user edits and replace only untouched past preset values (persist versions), so recalibrations reach users without wiping their work.
- **SEO**: static translated guides are the indexable content; the single map URL serves both languages, so only the guides have `hreflang`. A project Pages site cannot serve the host-root `robots.txt`: the sitemap is submitted in Search Console instead.
- **Off-land search result** opens a "No data" card instead of snapping to the nearest land (the smaller fix).
- **Licensing**: GEM's CC BY-NC-SA makes the site and data non-commercial; the code is MIT.

## Development history (decodes "phase N" in code comments)

1. Skeleton on synthetic data. 2. Climate and geography (TerraClimate, ETOPO, water), first calibration. 3. Hazards, environment, infrastructure, countries. 4. UI (card, search, compare, modes, EN/RU, mobile). 5. Polish and deploy prep: gzip binaries (manifest v2), rivers and lakes, agglomerations, loading feedback, world copies, redesign, Firefox e2e, Pages workflow. 6. Perceived climate: CRU sunshine and wet days, winter daytime high, comfort months. 7. Factor balance: no exclusion, group weights, key penalties, `cold_feel`, desert fix. 8. Regional wealth and contrast: `gdp_pc`, stricter infrastructure, contrast palette with orange, then key `travel_city`, log precipitation, key `comfort_months` and `gdp_pc`, the road web ("phase 8.0" = before those follow-ups). Then two final code reviews and SEO (guides, metadata, lazy MapLibre), all 2026-10-12…14.

## Reference scores (preset, 2026-10-14)

San Diego 100, San Francisco 99, Los Angeles 97, Adelaide 97, Perth 93, Lisbon 92, Valencia 86, Athens 86, Málaga 85, Sydney 83, Barcelona 80, Brisbane 78, Porto 74, New York 72, Rome 71, Oran 71, Denver 68, Madrid 66, Chicago 63, Seattle 60, Bucharest 57, Sochi 51, Paris 46, London 42, Vladivostok 38, Tokyo 30, Nairobi 24, Bangalore 24, Moscow 21, Novosibirsk 19, Mexico City 18, Rio de Janeiro 17.
