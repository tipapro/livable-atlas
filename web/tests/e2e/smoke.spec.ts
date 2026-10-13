import { expect, test, type Locator, type Page } from '@playwright/test'

const rendered = (page: Page) => expect(page.getByTestId('app')).toHaveAttribute('data-renders', /[1-9]/)
const weight = (page: Page, id: string) => page.getByTestId(`factor-${id}`).getByRole('slider').first()

test('renders score layer', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
})

// Makes warm_tmax score 0 everywhere (lo = hi = 50, tolerance 0), key box unchecked, and opens the card on the map centre (lon 0, lat 30: land).
async function zeroWarmTmax(page: Page) {
  await page.goto('/')
  await rendered(page)
  const row = page.getByTestId('factor-warm_tmax')
  await row.getByRole('checkbox', { name: /key$/ }).uncheck()
  await row.getByRole('button').click()
  await row.getByRole('slider', { name: /from$/ }).fill('50')
  await row.getByRole('slider', { name: /to$/ }).fill('50')
  await row.getByLabel(/^Tolerance/).fill('0')
  await page.locator('.maplibregl-canvas').click()
  await expect(page.getByTestId('card-score')).toHaveText(/^\d+$/)
  return row
}

test('settings change updates card score', async ({ page }) => {
  const row = await zeroWarmTmax(page)
  const score = page.getByTestId('card-score')
  const a = Number(await score.textContent())
  await row.getByRole('checkbox', { name: /key$/ }).check()
  await expect.poll(async () => Number(await score.textContent())).toBeLessThan(a)
  await expect(score).not.toHaveText('Excluded')
})

test('a group weight change updates the card score', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  // Off-centre: the Saharan centre scores ~4, where a group weight moves the score by less than a point.
  const canvas = page.locator('.maplibregl-canvas')
  const box = (await canvas.boundingBox())!
  await canvas.click({ position: { x: box.width / 2 - 20, y: box.height / 2 - 50 } })
  const score = page.getByTestId('card-score')
  await expect(score).toHaveText(/^\d+$/)
  const group = page.getByRole('slider', { name: 'Country and region — group weight' })
  for (const w of ['0', '5']) {
    const prev = await score.textContent()
    await group.fill(w)
    await expect(score).not.toHaveText(prev!)
  }
})

test('strength 0 removes key penalties', async ({ page }) => {
  const row = await zeroWarmTmax(page)
  const key = row.getByRole('checkbox', { name: /key$/ })
  const score = page.getByTestId('card-score')
  // Closing and reopening the card re-reads the score under the current settings, so the value cannot be stale.
  const read = async () => {
    await page.keyboard.press('Escape')
    await page.locator('.maplibregl-canvas').click()
    await expect(score).toHaveText(/^\d+$/)
    return Number(await score.textContent())
  }
  const off = await read()
  await key.check()
  expect(await read()).toBeLessThan(off)
  await page.getByRole('slider', { name: 'Key factor strength' }).fill('0')
  const on0 = await read()
  await key.uncheck()
  expect(await read()).toBe(on0)
})

test('settings persist across reload', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  await weight(page, 'warm_tmax').fill('2')
  await page.reload()
  await rendered(page)
  await expect(weight(page, 'warm_tmax')).toHaveValue('2')
})

test('locale toggle switches to Russian', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Climate', { exact: true })).toBeVisible()
  await page.getByTestId('locale-toggle').click()
  await expect(page.getByText('Климат', { exact: true })).toBeVisible()
})

test('missing layers are disabled', async ({ page }) => {
  // Remove pm25 from the manifest so the test does not depend on what the pipeline built.
  await page.route('**/data/manifest.json', async route => {
    const manifest = await (await route.fetch()).json()
    delete manifest.layers.pm25
    await route.fulfill({ json: manifest })
  })
  await page.goto('/')
  await expect(weight(page, 'pm25')).toBeDisabled()
})

test('load error shows retry', async ({ page }) => {
  await page.route('**/data/manifest.json', route => route.fulfill({ status: 500 }))
  await page.goto('/')
  await expect(page.getByTestId('error-screen')).toBeVisible()
  await expect(page.getByTestId('retry')).toBeVisible()
  await page.unroute('**/data/manifest.json')
  await page.getByTestId('retry').click()
  await rendered(page)
})

test('map mode switch recolors and shows the month slider for monthly modes', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const app = page.getByTestId('app')
  const before = Number(await app.getAttribute('data-renders'))
  await page.getByTestId('mode-select').selectOption({ label: 'Human Development Index' })
  await expect.poll(async () => Number(await app.getAttribute('data-renders'))).toBeGreaterThan(before)
  const legend = page.getByLabel('Legend')
  await expect(legend.getByText('0.3', { exact: true })).toBeVisible()
  await expect(legend.getByText('1', { exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Month', exact: true })).toHaveCount(0)
  await page.getByTestId('mode-select').selectOption({ label: 'Precipitation' })
  await expect(page.getByRole('slider', { name: 'Month', exact: true })).toBeVisible()
})

test('contrast toggle changes the map and the legend', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const app = page.getByTestId('app')
  const legend = page.getByLabel('Legend')
  const box = legend.getByRole('checkbox', { name: 'Contrast' })
  await expect(box).toBeChecked()
  const labels = legend.locator('span:not([class*=ramp])').filter({ hasText: /^\d+$/ })
  await expect(labels).toHaveCount(5)
  const before = Number(await app.getAttribute('data-renders'))
  await box.uncheck()
  await expect.poll(async () => Number(await app.getAttribute('data-renders'))).toBeGreaterThan(before)
  await expect(labels).toHaveText(['0', '100'])
  await page.getByTestId('mode-select').selectOption({ label: 'Human Development Index' })
  await expect(legend.getByRole('checkbox')).toHaveCount(0)
})

test('map click opens a point card with breakdown and climate chart; close removes it', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  // Map center is lon 0, lat 30: land.
  await page.locator('.maplibregl-canvas').click()
  const card = page.getByTestId('point-card')
  await expect(page.getByTestId('card-score')).toHaveText(/^(\d+|No data)$/)
  await expect(card).toContainText('Algeria')
  const rows = card.locator('tbody tr')
  await expect(rows).toHaveCount(5)
  await card.getByRole('button', { name: /^Show all \(\d+\)$/ }).click()
  expect(await rows.count()).toBeGreaterThan(5)
  await card.getByRole('button', { name: 'Show less' }).click()
  await expect(rows).toHaveCount(5)
  await expect(card.getByRole('button', { name: 'Add to compare' })).toBeEnabled()
  await expect(card.locator('svg polyline')).toHaveCount(2)
  await expect(card.getByText('Precipitation', { exact: true })).toBeVisible() // prec.bin loads after the first answer, without another click
  await expect(page.getByTestId('locale-toggle')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Point details' })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(card).toHaveCount(0)
  await page.locator('.maplibregl-canvas').click()
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
})

test('Add to compare is disabled on a sea card', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  await page.evaluate("__map.jumpTo({ center: [-30, 30], zoom: 4 })") // mid-Atlantic
  await page.waitForFunction("__map.loaded()")
  await page.locator('.maplibregl-canvas').click()
  await expect(page.getByTestId('card-score')).toHaveText('No data')
  await expect(page.getByTestId('point-card').getByRole('button', { name: 'Add to compare' })).toBeDisabled()
})

test('city search opens the card; top list has 20 cities', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  await page.getByRole('tab', { name: 'Cities' }).click()
  await expect(page.getByTestId('top-list').getByRole('listitem')).toHaveCount(20)
  await page.getByRole('combobox', { name: 'Search city' }).fill('Lisbon')
  await page.getByRole('option').first().click()
  await expect(page.getByTestId('card-score')).toBeVisible()
  await expect(page.getByTestId('point-card')).toContainText('Portugal')
})

test('compare two pinned points; pins survive reload', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const canvas = page.locator('.maplibregl-canvas')
  // Two Algerian/Saharan land points (about 32N and 21N), far enough apart to differ in climate.
  for (const position of [{ x: 640, y: 350 }, { x: 640, y: 400 }]) {
    await canvas.click({ position })
    await expect(page.getByTestId('card-score')).toBeVisible()
    await page.getByRole('button', { name: 'Add to compare' }).click()
    await expect(page.getByRole('button', { name: 'In comparison' })).toBeDisabled()
  }
  const tab = page.getByRole('tab', { name: 'Compare (2)' })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const table = page.getByTestId('compare')
  await expect(table.getByTestId('compare-col')).toHaveCount(2)
  await expect(table.getByText('(best)').first()).toBeAttached()
  await page.reload()
  await rendered(page)
  await expect(page.getByRole('tab', { name: 'Compare (2)' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('compare').getByTestId('compare-col')).toHaveCount(2)
})

test('the Compare tab says how to add points when nothing is pinned', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  await page.getByRole('tab', { name: 'Compare' }).click()
  await expect(page.getByText('Pin points from the place card to compare them.')).toBeVisible()
})

test('About the data lists sources and licenses; Escape closes it', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  await page.getByTestId('about-open').click()
  const dialog = page.getByRole('dialog', { name: 'About the data' })
  await expect(dialog).toContainText('IBTrACS')
  await expect(dialog).toContainText('CC BY-NC-SA')
  await expect(dialog).toContainText('Data: 1991–2020 monthly normals · retrieved 2026-10-12') // TerraClimate: when to refresh
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('link').last()).toBeFocused() // Tab wraps inside the dialog
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  const search = page.getByRole('combobox', { name: 'Search city' })
  await search.click({ force: true }) // the page behind a modal dialog is inert
  await expect(search).not.toBeFocused()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('about-open')).toBeFocused()
})

// Every pair of the given elements must be disjoint.
async function expectNoOverlap(targets: Record<string, Locator>) {
  const boxes = await Promise.all(Object.entries(targets).map(async ([name, l]) => [name, (await l.boundingBox())!] as const))
  for (const [a, p] of boxes) {
    expect(p, a).toBeTruthy()
    for (const [b, q] of boxes) {
      if (a < b) {
        const apart = p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y
        expect(apart, `${a} overlaps ${b}`).toBe(true)
      }
    }
  }
}

test('desktop: the card is at most 420px wide', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  await page.locator('.maplibregl-canvas').click()
  const box = (await page.getByTestId('point-card').boundingBox())!
  expect(box.width).toBeLessThanOrEqual(420)
})

for (const width of [768, 1024, 1280]) {
  test(`no overlapping panels at ${width}px with the card and a monthly mode`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto('/')
    await rendered(page)
    // MapLibre hides the attribution until the style has loaded, so measure after that.
    await expect(page.getByTestId('map-loading')).toHaveCount(0, { timeout: 15_000 })
    await page.getByTestId('mode-select').selectOption({ label: 'Precipitation' })
    await page.locator('.maplibregl-canvas').click({ position: { x: width / 2, y: 360 } })
    await expect(page.getByTestId('card-score')).toBeVisible()
    const panel = page.getByRole('complementary', { name: 'Panel' })
    // NARROW (< 1024): the rail while the card is open; at 1024 the open panel and the card both fit.
    await expect(panel.getByRole('button', { name: 'Expand panel' })).toHaveCount(width < 1024 ? 1 : 0)
    await expectNoOverlap({
      panel,
      search: page.getByRole('combobox', { name: 'Search city' }),
      locale: page.getByTestId('locale-toggle'),
      about: page.getByTestId('about-open'),
      card: page.getByTestId('point-card'),
      dock: page.getByTestId('dock'),
      attribution: page.locator('.maplibregl-ctrl-attrib'),
    })
  })
}

test('tabs switch with the keyboard', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const tab = (name: string) => page.getByRole('tab', { name })
  await tab('Settings').focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab('Cities')).toHaveAttribute('aria-selected', 'true')
  await expect(tab('Cities')).toBeFocused()
  await expect(page.getByTestId('top-list').getByRole('listitem')).toHaveCount(20)
  await page.keyboard.press('End')
  await expect(tab('Compare')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(tab('Settings')).toHaveAttribute('aria-selected', 'true')
})

test('rail collapse persists across reload', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const panel = page.getByRole('complementary', { name: 'Panel' })
  await panel.getByRole('button', { name: 'Collapse panel' }).click()
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(60)
  await page.reload()
  await rendered(page)
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(60)
  await panel.getByRole('button', { name: 'Cities' }).click()
  await expect(page.getByRole('tab', { name: 'Cities' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Cities' })).toBeFocused()
  expect((await panel.boundingBox())!.width).toBeGreaterThan(300)
})

test('focus follows the panel across collapse and expand', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const panel = page.getByRole('complementary', { name: 'Panel' })
  await panel.getByRole('button', { name: 'Collapse panel' }).focus()
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('button', { name: 'Expand panel' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeFocused()
  // A card opened by a map click does not pull focus into the panel.
  await page.setViewportSize({ width: 768, height: 720 })
  await page.locator('.maplibregl-canvas').click({ position: { x: 560, y: 360 } })
  await expect(panel.getByRole('button', { name: 'Expand panel' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Expand panel' })).not.toBeFocused()
  // Forced rail (card open below 1024): a rail tab closes the card and focuses the chosen tab.
  await panel.getByRole('button', { name: 'Cities' }).click()
  await expect(page.getByTestId('point-card')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Cities' })).toBeFocused()
})

test('search keyboard navigation', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const search = page.getByRole('combobox', { name: 'Search city' })
  const results = page.getByTestId('search-results')
  await search.fill('lisb')
  await expect(results.getByRole('option').first()).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(results.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('point-card')).toContainText('Portugal')
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('')
  await expect(results).toBeHidden()
  // Enter with nothing highlighted does nothing; Escape closes only the list, never the card.
  await search.fill('lisb')
  await expect(results.getByRole('option').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(results.getByRole('option').first()).toBeVisible()
  await expect(search).toHaveValue('lisb')
  await page.keyboard.press('Escape')
  await expect(results).toBeHidden()
  await expect(page.getByTestId('point-card')).toBeVisible()
})

test('search results close when focus leaves the input', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const search = page.getByRole('combobox', { name: 'Search city' })
  const results = page.getByTestId('search-results')
  await search.fill('lis')
  await expect(results).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(results).toBeHidden()
  await search.fill('lisb')
  await expect(results).toBeVisible()
  await page.locator('.maplibregl-canvas').click({ position: { x: 640, y: 400 } })
  await expect(results).toBeHidden()
  await expect(page.getByTestId('point-card')).toBeVisible()
})

test('a full localStorage says settings are not saved; the message closes', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError') } })
  await page.goto('/')
  await rendered(page)
  await weight(page, 'warm_tmax').fill('4')
  const status = page.getByRole('status').filter({ hasText: 'could not be saved' })
  await expect(status).toBeVisible()
  await status.getByRole('button', { name: 'Close' }).click()
  await expect(status).toHaveCount(0)
})

test('Save as asks before overwriting an existing preset', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  const saved = () => page.evaluate(() => JSON.parse(localStorage['livable-atlas:v1']).state.userPresets.mine.factors.warm_tmax.weight)
  let confirmed = false
  page.on('dialog', d => (d.type() === 'prompt' ? d.accept('mine') : confirmed ? d.accept() : d.dismiss()))
  await page.getByRole('button', { name: 'Save as…' }).click()
  const before = await saved()
  await weight(page, 'warm_tmax').fill(before === 5 ? '4' : '5')
  await page.getByRole('button', { name: 'Save as…' }).click()
  expect(await saved()).toBe(before)
  confirmed = true
  await page.getByRole('button', { name: 'Save as…' }).click()
  await expect.poll(saved).not.toBe(before)
})

test('basemap failure shows a message', async ({ page }) => {
  await page.route('**/tiles.openfreemap.org/**', route => route.abort())
  await page.goto('/')
  await expect(page.getByRole('status').filter({ hasText: 'base map failed to load' })).toBeVisible()
  await expect(page.getByTestId('map-loading')).toHaveCount(0)
})

test('closing the card keeps focus in the page; Escape in a form field leaves the card open', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  await page.locator('.maplibregl-canvas').click()
  const card = page.getByTestId('point-card')
  await expect(card).toBeVisible()
  await page.getByLabel('Preset').focus()
  await page.keyboard.press('Escape')
  await expect(card).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await expect(page.locator('body')).not.toBeFocused()
  await page.locator('.maplibregl-canvas').click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator('body')).not.toBeFocused()
})

test('About stays disabled until the manifest has loaded', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(r => (release = r))
  await page.route('**/data/manifest.json', async route => {
    await gate
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByTestId('about-open')).toBeDisabled()
  release()
  await expect(page.getByTestId('about-open')).toBeEnabled()
})

test('basemap message clears once the map loads', async ({ page }) => {
  let failed = false
  await page.route('**/tiles.openfreemap.org/**/*.pbf', route => (failed ? route.continue() : ((failed = true), route.abort())))
  await page.goto('/')
  await expect.poll(() => failed).toBe(true)
  await expect(page.getByTestId('map-loading')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByText('base map failed')).toHaveCount(0)
})

test('a failed prec.bin falls back to the score map with one message and no prec mode', async ({ page }) => {
  await page.route('**/monthly/prec.bin.gz', route => route.fulfill({ status: 404 }))
  await page.goto('/')
  await rendered(page)
  await page.getByTestId('mode-select').selectOption({ label: 'Precipitation' })
  await expect(page.getByTestId('mode-select')).toHaveValue('score')
  await expect(page.getByText('Monthly precipitation (prec.bin) failed to load')).toHaveCount(1)
  await expect(page.getByTestId('mode-select').getByRole('option', { name: 'Precipitation', exact: true })).toHaveCount(0)
  const status = page.getByRole('status').filter({ hasText: 'failed to load' })
  await status.getByRole('button', { name: 'Close' }).click()
  await expect(status).toHaveCount(0)
})

test('loading card shows progress, then disappears', async ({ page }) => {
  await page.route('**/data/layers/*.bin.gz', async route => {
    await new Promise(r => setTimeout(r, 300))
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByTestId('loading-card')).toBeVisible()
  await expect(page.getByTestId('loading-card')).toContainText(/Loading data…/)
  await rendered(page)
  await expect(page.getByTestId('loading-card')).toHaveCount(0)
})

test('map chip disappears once the style loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('map-loading')).toHaveCount(0, { timeout: 15_000 })
})

test('world copy: score layer drawn and click wraps', async ({ page }) => {
  await page.goto('/')
  await rendered(page)
  // Expressions run in the page (the e2e tsconfig has no DOM lib). __map is the dev-only MapLibre hook.
  await page.evaluate("__map.jumpTo({ center: [212.3, 64.8], zoom: 4 })") // Fairbanks, on the copy east of 180°
  const idle = () => page.evaluate("new Promise(r => { __map.once('idle', r); __map.triggerRepaint() })")
  // The canvas centre pixel, read back (the dev build keeps the drawing buffer).
  const centre = () => page.evaluate(`(() => {
    const src = __map.getCanvas()
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const g = c.getContext('2d')
    g.drawImage(src, 0, 0)
    return Array.from(g.getImageData(src.width >> 1, src.height >> 1, 1, 1).data)
  })()`)
  await idle()
  const withScore = await centre()
  await page.evaluate("__map.setLayoutProperty('score', 'visibility', 'none')")
  await idle()
  expect(await centre()).not.toEqual(withScore)
  await page.evaluate("__map.setLayoutProperty('score', 'visibility', 'visible')")
  await idle()
  await page.locator('.maplibregl-canvas').click({ position: { x: 640, y: 360 } })
  await expect(page.getByTestId('point-card')).toContainText(/14[78]\.\d\d° W/)
  await expect(page.getByTestId('card-score')).toHaveText(/^(\d+|No data)$/)
})

const sheetHeight = async (page: Page) => (await page.getByTestId('sheet').boundingBox())!.height

test('mobile sheet heights', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await rendered(page)
  const handle = page.getByRole('button', { name: 'Resize panel' })
  // Poll: the height animates between snaps.
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - 72)).toBeLessThanOrEqual(4)
  await handle.click()
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - 406)).toBeLessThanOrEqual(8)
  await handle.click()
  await expect.poll(() => sheetHeight(page)).toBeGreaterThanOrEqual(700)
  await handle.click()
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - 72)).toBeLessThanOrEqual(4)
})

test('mobile: a map click opens the Place tab at half height', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await rendered(page)
  await page.locator('.maplibregl-canvas').click({ position: { x: 187, y: 300 } })
  const sheet = page.getByTestId('sheet')
  await expect(sheet.getByTestId('point-card')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Place' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - 406)).toBeLessThanOrEqual(8)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('point-card')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Place' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
})

test('mobile: choosing a city with the keyboard moves focus to the Place tab', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await rendered(page)
  await page.getByRole('tab', { name: 'Cities' }).click()
  const city = page.getByRole('tabpanel').getByRole('button').first()
  await city.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Place' })).toBeFocused() // not lost to <body> when the list unmounts
  await page.keyboard.press('Escape') // closes the card and removes the focused Place tab
  await expect(page.getByRole('tab', { name: 'Place' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Cities' })).toBeFocused()
})

test('mobile: no overlap at 375 in Russian', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await rendered(page)
  await expect(page.getByTestId('map-loading')).toHaveCount(0, { timeout: 15_000 })
  await page.getByTestId('locale-toggle').click()
  const canvas = page.locator('.maplibregl-canvas')
  // About 42° N, 0° E: land in Spain, so the point can be pinned.
  await canvas.click({ position: { x: 187, y: 340 } })
  await expect(page.getByTestId('card-score')).toBeVisible()
  await page.getByRole('button', { name: 'Добавить к сравнению' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('point-card')).toHaveCount(0)
  const handle = page.getByRole('button', { name: 'Изменить размер панели' })
  while ((await page.getByTestId('sheet').getAttribute('data-height')) !== 'peek') await handle.click()
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - 72)).toBeLessThanOrEqual(4)
  const search = page.getByRole('combobox', { name: 'Поиск города' })
  await expectNoOverlap({
    search,
    locale: page.getByTestId('locale-toggle'),
    about: page.getByTestId('about-open'),
    sheet: page.getByTestId('sheet'),
    dock: page.getByTestId('dock'),
    attribution: page.locator('.maplibregl-ctrl-attrib'),
  })
  await canvas.click({ position: { x: 187, y: 340 } })
  await expect(page.getByTestId('sheet').getByTestId('card-score')).toBeVisible()
  await expect.poll(async () => Math.abs((await sheetHeight(page)) - 406)).toBeLessThanOrEqual(8)
  await expectNoOverlap({ search, sheet: page.getByTestId('sheet') })
})
