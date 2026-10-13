# Data sources

Every layer on the map comes from one of the sources below. The pipeline (`pipeline/`) downloads them into `pipeline/.cache/raw/<source>/` (not committed), regrids them to the 0.25° land grid and packs them into `web/public/data/` (committed). The site shows the same list, with each source's data period and retrieval date, in **About the data**. All of it comes from `INFO` in `pipeline/livable_pipeline/sources/<source>.py`.

"Period" is the time the data describes, or its version. "Retrieved" is the date the raw file was downloaded.

| Source id | Dataset | Layers (factors) | Period | Retrieved | Licence |
|---|---|---|---|---|---|
| `terraclimate` | [TerraClimate](https://www.climatologylab.org/terraclimate.html) monthly normals (tmax, tmin, ppt, vap, ws) | warm/cold day and night temperatures, dew point, seasonality, frost months, annual precipitation, wind, monthly tmax/tmin/tdew/prec (comfortable months are computed in the browser from the monthly layers) | 1991–2020 monthly normals | 2026-10-12 | CC0 1.0 |
| `cru` | [CRU CL 2.0](https://crudata.uea.ac.uk/cru/data/hrg/tmc/) 10′ climatology (sunp, rd0) | sunshine hours, wet days, winter sunshine share | 1961–1990 climatology (published 2002) | 2026-10-13 | no explicit licence; cite the paper |
| `etopo` | [ETOPO 2022](https://www.ncei.noaa.gov/products/etopo-global-relief-model) 60″ surface | elevation, ruggedness | ETOPO 2022 v1 | 2026-10-12 | public domain |
| `coast` | [Natural Earth](https://www.naturalearthdata.com/) 10m coastline, rivers, lakes | distance to water | 5.0.0 (coastline 5.0.0-pre9) | 2026-10-12 | public domain |
| `countries` | Natural Earth 10m admin 0 countries | country index (`country`, `countries.json`) | 5.1.1 | 2026-10-12 | public domain |
| `ibtracs` | [IBTrACS](https://www.ncei.noaa.gov/products/international-best-track-archive) v04r01, since 1980 | tropical cyclones per decade | storm seasons 1980–2025 | 2026-10-12 | public domain |
| `gem` | [GEM Global Seismic Hazard Map](https://www.globalquakemodel.org/product/global-seismic-hazard-map) (PGA, 10 % in 50 years, rock) | earthquake hazard | version 2023.1 | 2026-10-12 | **CC BY-NC-SA 4.0** (makes the site non-commercial) |
| `gfed` | [GFED5](https://www.globalfiredata.org/) burned area | wildfire | 2001–2020 (annual mean) | 2026-10-12 | CC BY 4.0 |
| `jrc_flood` | [JRC global flood hazard map](https://data.jrc.ec.europa.eu/dataset/jrc-floods-floodmapgl_rp100y-tif), 100-year return period | flood | 2016 release | 2026-10-12 | CC BY 4.0 |
| `acag` | [ACAG V6.GL.02.04](https://sites.wustl.edu/acag/datasets/surface-pm2-5/) satellite PM2.5, 0.1° | PM2.5 | 2022 annual mean | 2026-10-12 (manual download) | free with citation |
| `nelson` | [Nelson et al. 2019](https://figshare.com/articles/dataset/Travel_time_to_cities_and_ports_in_the_year_2015/7638134) travel time to cities ≥ 50 000 | travel time to a city | 2015 | 2026-10-12 | CC BY 4.0 |
| `geonames` | [GeoNames](https://www.geonames.org/) cities15000 + alternate names | distance to a metro area ≥ 1M, city list and search (`cities.json`) | snapshot of the retrieval date | 2026-10-12 | CC BY 4.0 |
| `ourairports` | [OurAirports](https://ourairports.com/data/) | distance to a large airport | snapshot of the retrieval date | 2026-10-12 | public domain |
| `ghsl` | [GHS-POP R2023A](https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php) | population density | epoch 2020 | 2026-10-12 | CC BY 4.0 |
| `undp` | [UNDP Human Development Report 2025](https://hdr.undp.org/data-center/documentation-and-downloads) | HDI (national) | HDI 2023, latest year per country | 2026-10-12 | CC BY 3.0 IGO |
| `worldbank` | [World Bank WDI](https://data.worldbank.org/) VC.IHR.PSRC.P5, PA.NUS.PPP, PA.NUS.FCRF | homicide rate, price level (national) | latest of the 5 most recent values per country: homicide mostly 2015–2023, price level mostly 2025 (WDI update of 2026-10-08) | 2026-10-12 | CC BY 4.0 |
| `kummu` | [Kummu et al. 2025](https://doi.org/10.5281/zenodo.10976733) GDP per capita (PPP), admin 2 | GDP per capita of the region | 2024 (last band of 1990–2024; Zenodo version of 2026-03-13) | 2026-10-13 | CC BY 4.0 |

The land mask itself (which 0.25° cells exist) comes from Natural Earth 10m land 5.1.1 (`pipeline/livable_pipeline/grid.py`), retrieved 2026-10-12. Citations for every source are in `INFO` and in the site's About dialog.

## Refreshing a source

1. Delete its raw files: `pipeline/.cache/raw/<source>/` (the pipeline reuses a file that is already there). For `acag` (manual) download the new global `*.GL.*.nc` from the ACAG page into that folder instead. If the source's URL or file name carries a version or year (`terraclimate`, `undp`, `kummu`, `gem`, `ghsl`, `ibtracs`), update it in `sources/<source>.py` first.
2. Update `period` and `retrieved` in that file's `INFO`.
3. Rebuild and pack: `cd pipeline && uv run atlas build <source>`, then `uv run atlas report` to compare the reference places with the previous numbers.
4. Check the scores: `cd web && npm test` runs the golden criteria (spec §1) on the real data. If one fails, recalibrate the preset (`web/src/scoring/presets.ts`) and record why in the spec's §5 calibration paragraphs.
5. Commit the code change and the packed data (`web/public/data/`) separately.

Factors whose data are national (HDI, homicide, price level) change with every UNDP or World Bank release; climate normals (TerraClimate 1991–2020, CRU 1961–1990) change only when a new normal period is published.
