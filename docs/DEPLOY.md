# Deploying to GitHub Pages

The site is static: the workflow in `.github/workflows/pages.yml` builds `web/` and publishes `web/dist`. The packed data in `web/public/data/` is committed, so CI needs no pipeline run. The build uses a relative base, so any repository name works.

## SEO and public URLs

`actions/configure-pages` supplies the actual Pages `base_url` to the build as `SITE_URL`, including a custom domain when configured. For a custom domain without "Enforce HTTPS" that URL starts with `http://`; the workflow switches it to `https://` (turning on Enforce HTTPS in the Pages settings of the site that owns the domain is still recommended, so the `http://` copy redirects). Vite generates canonical URLs, Open Graph/Twitter previews, application JSON-LD, `sitemap.xml` and `robots.txt`. All three HTML pages have metadata before JavaScript runs. `about.html` and `about-ru.html` are translated, linked guides that need no JavaScript or map data. The single interactive map URL supports both interface languages; only the guide pages use `hreflang` alternates.

For a local production build, the default is `https://tipapro.github.io/livable-atlas/`. To test another deployment, run from `web/`:

```sh
SITE_URL=https://example.github.io/atlas/ npm run build
```

`SITE_URL` must be an absolute HTTPS directory URL without credentials, query parameters or a fragment. A missing trailing slash is added. Relative assets continue to work under a repository subpath. The committed `web/public/social-preview.png` is an actual 1200×630 map screenshot; refresh it if the map's appearance changes.

After publishing:

1. Inspect the page source and confirm the canonical URL, `og:url` and `og:image` use the published hostname and repository path. Open both guides, `social-preview.png` and `sitemap.xml` directly.
2. Add the published URL prefix to Google Search Console (and, optionally, Bing Webmaster Tools / Yandex Webmaster), verify ownership and submit the full `sitemap.xml` URL. If using an HTML verification file, put the supplied file unchanged in `web/public/` and redeploy. Use URL Inspection to check the live page and request indexing.
3. A project site at `https://user.github.io/repo/` cannot set the host's `/robots.txt` from this repository: crawlers ignore `/repo/robots.txt`. Submit the sitemap directly. If you control the account-root site, add a `Sitemap: https://user.github.io/repo/sitemap.xml` line to its existing root robots file. On a custom domain or account-root Pages site, the generated robots file is already at the correct root. See [Google's robots location rules](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).

No crawler resources are blocked. There are no invented city URLs or ratings, and sitemap entries do not claim a new modification date on every build. Search-engine indexing and ranking still depend on the published site and the search engine.

## Steps

1. Create an empty public GitHub repository (any name; no README, no licence file, so the first push is not rejected).
2. Connect and push `main` from the project folder:
   ```sh
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. In the repository: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Open the Actions tab and wait for the "Deploy to GitHub Pages" run to finish (a few minutes). If the first run started before step 3, re-run it (Actions → the run → Re-run all jobs, or "Run workflow" on the workflow page).
5. Open `https://<user>.github.io/<repo>/`.
6. Update later: merge or push to `main`; every push to `main` redeploys.

## Troubleshooting

- **404 on `data/...` files in the browser console or network tab:** the base path is wrong. Check that the page URL ends with `/<repo>/` (with the trailing slash) and that `web/vite.config.ts` still has `base: './'`.
- **Blank map but side panels work:** open the browser console and look for OpenFreeMap (tile or style) errors; the base map comes from `tiles.openfreemap.org`. The scores are computed locally from `data/`, but the map draws the score layer only after the OpenFreeMap style has loaded, so an OpenFreeMap outage leaves the map blank (the city list, search and point card still work).
- **Browsers:** Chrome/Edge ≥ 111, Firefox ≥ 114, Safari/iOS ≥ 16.4 (Vite's default build target).
- **Red workflow run:** open the run in the Actions tab and read the failing step (typecheck, test and build all run in CI; e2e does not).
- **First run:** `actionlint` was not available while the workflow was written, so the first workflow run is the final check of the YAML. If it fails before any step starts, the error message names the offending line.

## Licence

Publish this only as a non-commercial project: the GEM seismic hazard data is CC BY-NC-SA, which forbids commercial use and requires share-alike. Source attributions, data periods and retrieval dates are in the app's "About the data" dialog and in `docs/DATA-SOURCES.md`.
