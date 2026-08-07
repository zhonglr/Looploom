import { expect, test } from '@playwright/test'

test('renders the document inside the canvas frame', async ({ page }) => {
  await page.goto('/')

  const canvas = page.frameLocator('iframe[title="Canvas frame"]')
  await expect(canvas.locator('[data-canvas-node-id="page-home"]')).toBeVisible()
  await expect(canvas.locator('[data-canvas-node-id="hero-title"]')).toHaveText(
    'Build low-code canvases',
  )
})
