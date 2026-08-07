import { expect, test } from '@playwright/test'

test('renders the document inside the canvas frame', async ({ page }) => {
  await page.goto('/')

  const canvas = page.frameLocator('iframe[title="Canvas frame"]')
  await expect(canvas.locator('[data-canvas-node-id="page-home"]')).toBeVisible()
  await expect(canvas.locator('[data-canvas-node-id="hero-title"]')).toHaveText(
    'Build low-code canvases',
  )
})

test('drops an element just outside the page edge', async ({ page }) => {
  await page.goto('/')

  const canvas = page.frameLocator('iframe[title="Canvas frame"]')
  const pageSurface = canvas.locator('.canvas-frame-page')
  const root = canvas.locator('[data-canvas-node-id="page-home"]')
  const actions = canvas.locator('[data-canvas-node-id="actions"]')
  const source = canvas.locator('[data-canvas-node-id="cta-primary"]')
  await expect(source).toBeVisible()

  const [pageBox, rootBox, actionsBox, sourceBox] = await Promise.all([
    pageSurface.boundingBox(),
    root.boundingBox(),
    actions.boundingBox(),
    source.boundingBox(),
  ])
  if (!pageBox || !rootBox || !actionsBox || !sourceBox) {
    throw new Error('Canvas geometry is unavailable')
  }

  expect(rootBox.height).toBeGreaterThanOrEqual(pageBox.height - 2)
  const target = {
    x: pageBox.x + pageBox.width / 2,
    y: pageBox.y + pageBox.height + 24,
  }
  expect(target.y).toBeGreaterThan(actionsBox.y + actionsBox.height + 100)

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  )
  await page.mouse.down()
  await page.waitForTimeout(130)
  await page.mouse.move(target.x, target.y, { steps: 4 })
  await expect(page.locator('.canvas-drop-highlight')).toBeVisible()
  await page.mouse.up()

  await expect(
    root.locator(':scope > [data-canvas-node-id="cta-primary"]'),
  ).toBeVisible()
})
