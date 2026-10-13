# Livable Atlas — agent guide

World map scoring every 0.25° land cell for "how good is it to live here", starting from a California-like preset. Users tune thresholds and weights; the score recomputes in the browser. Static site (GitHub Pages). All code is written by agents.

Spec: `docs/SPEC.md` (the current design) and `docs/DECISIONS.md` (why, and what was rejected) — read both before any work.

## Layout

- `pipeline/` — Python (uv). Offline: downloads sources, regrids to 0.25°, packs binary layers + `manifest.json` into `web/public/data/`.
- `web/` — Vite + React + TypeScript. Reads only `web/public/data/` (the data contract in the spec).

## Commands

- Pipeline: `cd pipeline && uv run pytest`, `uv run atlas build [source...]`, `uv run atlas report`
- Web: `cd web && npm run dev`, `npm test` (Vitest), `npm run e2e` (Playwright), `npm run build`, `npm run typecheck`

## Workflow

- Use superpowers skills: brainstorming → writing-plans → subagent-driven-development / executing-plans, TDD, verification-before-completion, requesting-code-review.
- Plans and task specs are temporary working files: keep them out of the repository (or delete them before merging). What lasts goes into `docs/SPEC.md` (the system as it is now) and `docs/DECISIONS.md` (a human decision, a calibration reason, a rejected alternative), in the same branch as the change.
- Anything that needs the human (manual downloads, registrations, GitHub settings) is deferred: implement the fallback, keep going, and list the human's steps at the end of the final message (lasting instructions go into `docs/DEPLOY.md` or `docs/DATA-SOURCES.md`).
- Never commit raw downloads (`pipeline/.cache/`). Packed output in `web/public/data/` is committed.
- Don't change the data contract (manifest/binary format) without updating the spec.
- Never run commands rooted at `/` or `~` (e.g. `vitest --root /`, `find ~`): they crawl the whole disk and trigger macOS privacy prompts (Desktop, network volumes). Keep temp scripts inside the repo and delete them.
- Docs are written in English; the human chats in Russian.
- Work on a feature branch per task (`<topic>`), fast-forward merge into `main` when the human approves.
- "Phase N" in code comments and tests refers to the development history (phases 1–8 and SEO, finished 2026-10-14); `docs/DECISIONS.md` explains what each recalibration changed and why.

## Status (2026-10-14)

- The site is complete and ready for GitHub Pages; next the human publishes via `docs/DEPLOY.md` and submits the sitemap (both in `docs/DEPLOY.md`).
- Docs: `docs/SPEC.md` (golden criteria §1, data contract §3, factors §5, model §6, saves §8, SEO §9, known limitations §12), `docs/DECISIONS.md`, `docs/DATA-SOURCES.md`, `docs/DEPLOY.md`.
- Tight golden margins: Málaga exactly 85 (≥ 85), Moscow 2 above Nizhny Novgorod. Any recalibration must re-run `cd web && npm test`.
- Saves: persist version 7; a preset change bumps it and adds the old value to `RECALIBRATED` in `web/src/state/store.ts`.
- The static guides `web/about.html` and `web/about-ru.html` restate model facts by hand: update them with any model change. Public URLs come from `SITE_URL` (`web/seo.ts`).
- Tests: pipeline 98, web 196 unit, 44 e2e in each of chromium and firefox; build ok (maplibre chunk ~1 MB, warning limit 1100 kB).

## Tooling

- Node 26 / npm 11 (`web/.nvmrc`), uv 0.13 (Python 3.12), Playwright chromium and firefox. Firefox runs need `CFFIXED_USER_HOME=web/.ffhome` (set in `playwright.config.ts`; one-off scripts must set it too) because macOS privacy rules block Firefox's real profile dir for the Claude app; `web/.ffhome/` is gitignored and cannot be deleted from inside the Claude app.
- `pipeline/.cache/raw/<source>/` holds every download (~2.8 GB, never committed; `acag` is a manual download). `pipeline/.cache/layers/<source>.npz` caches built layers, so `atlas build <one source>` repacks everything without re-running the others.

## Lessons (for agents)

- Subagent-driven work: give implementers the task brief, the global constraints and AGENTS.md as file paths, not pasted text; mid-tier models for implementers and reviewers, the most capable for the final review; build review packages for code commits only (packed data is bulk binary); rule on plan conflicts instead of stalling and record the ruling.
- Keep a real-data smoke step in every source task: real files differed from the plan's facts (ETOPO ocean-only cells, GHSL overhanging −180°, Nelson without a nodata tag, World Bank mixed years).
- Never launch or kill the human's apps (an implementer once ran `pkill -f` and killed the human's Firefox): Playwright's bundled headless browsers only, kill only PIDs you started; local servers bind 127.0.0.1 (0.0.0.0 pops a macOS network prompt).
- Playwright wipes `web/test-results/` on every run; the overlap e2e must wait for the base-map style (`map-loading` count 0); e2e needs network (OpenFreeMap).
- Calibrate by looking at the map, not only at numbers: headless screenshots of a region with Contrast on and off caught the over-exposed palette, the empty-outback scores and the missing road web.

## Writing code

The best code is the code never written. Solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.

**Before you write.** Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what it could break. That is scope; extra features are not.

**Take the first option that fully works:**

1. Does it need to exist? Skip features, options and flexibility nobody asked for; name them in one line.
2. Already in this codebase? Use it the way the surrounding code does.
3. Standard library or platform feature? Use it.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

**Rules.**

- Lazy about the solution, never about the change: finish every caller, test and fixture the change breaks.
- No abstraction, wrapper, option, config, boilerplate or "for later" code nobody asked for. Deletion beats addition. Keep the existing structure and conventions.
- Shortest working diff wins — but a one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: grep every caller first, fix the root cause once in shared code.
- Moved/merged code keeps its error handling and validation.
- Between equal-size options, take the one correct on edge cases.
- New non-trivial logic (branch, loop, parser, whole script) leaves one small test or assert-based self-check.
- Known-limit shortcut gets a comment: `shortcut: <the limit>, <when to upgrade>`.

**Never cut:** validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything the user asked for.
