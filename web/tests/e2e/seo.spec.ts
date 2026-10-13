import { expect, test } from '@playwright/test'

test('the map shell and scoring start while MapLibre is still downloading', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/src/map/MapView.tsx*', async route => {
    await pending
    await route.continue()
  })
  try {
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible()
    await expect(page.getByTestId('app')).toHaveAttribute('data-renders', /^[1-9]\d*$/)
    await expect(page.getByTestId('map-loading')).toBeVisible()
    expect(await page.locator('.maplibregl-canvas').count()).toBe(0)
  } finally {
    release()
  }
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await expect.poll(async () => (await page.locator('.maplibregl-canvas').boundingBox())?.height).toBe(page.viewportSize()!.height)
})

test('a failed map module leaves the app usable and offers a reload', async ({ page }) => {
  await page.route('**/src/map/MapView.tsx*', route => route.abort())
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible()
  const error = page.getByRole('alert')
  await expect(error).toContainText('Could not load the interactive map')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByTestId('locale-toggle').click()
  await expect(error).toBeInViewport({ ratio: 1 })
  await page.unroute('**/src/map/MapView.tsx*')
  await error.getByRole('button').click()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('late shared styles keep search text clear of its icon', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('combobox', { name: 'Search city' })).toBeVisible()
  await page.addStyleTag({ url: '/src/index.css?direct' })
  expect(await page.evaluate(`(() => {
    const input = document.querySelector('input[role="combobox"]')
    const icon = input.parentElement.querySelector('svg')
    return input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingLeft) >= icon.getBoundingClientRect().right
  })()`)).toBe(true)
})

test('guides are readable and linked in both languages without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Livable Atlas')
    await page.getByRole('link', { name: 'How scores work and where the data comes from' }).click()
    await expect(page).toHaveURL(/\/about\.html$/)
    await expect(page.getByRole('heading', { name: 'How are livability scores calculated?' })).toBeVisible()
    await page.getByRole('link', { name: 'По-русски' }).click()
    await expect(page).toHaveURL(/\/about-ru\.html$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Где лучше жить')
    await expect(page.getByRole('link', { name: 'Открыть карту' })).toHaveAttribute('href', './')
    expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true)
  } finally {
    await context.close()
  }
})

test('About links to the guide for the selected language', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('about-open')).toBeEnabled()
  await page.getByTestId('about-open').click()
  await expect(page.getByRole('link', { name: 'How Livable Atlas works' })).toHaveAttribute('href', /^(\.\/|\/)about\.html$/)
  await page.keyboard.press('Escape')
  await page.getByTestId('locale-toggle').click()
  await page.getByTestId('about-open').click()
  await expect(page.getByRole('link', { name: 'Как устроена карта Livable Atlas' })).toHaveAttribute('href', /^(\.\/|\/)about-ru\.html$/)
})
