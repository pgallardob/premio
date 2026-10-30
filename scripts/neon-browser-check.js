import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const deployment = JSON.parse(await readFile(join(root, 'artifacts/neon-deployment.json'), 'utf8'));
const target = JSON.parse(await readFile(join(root, 'deploy/neon-target.json'), 'utf8'));
const base = `${target.publicUrl}/`;
const api = deployment.url.replace(/\/$/, '');
const preview = process.env.NEON_LOCAL_BUILD === 'true';
if (!process.env.NEON_CONFIG_DIR) throw new Error('A private Neon credential directory is required.');
const password = (await readFile(join(process.env.NEON_CONFIG_DIR, 'premio-admin-password.txt'), 'utf8')).trim();
if (preview) {
  const built = spawnSync(process.execPath, ['scripts/build-pages.js'], { cwd: root, env: { ...process.env, PAGES_API_URL: api }, encoding: 'utf8' });
  if (built.status !== 0) throw new Error('The connected Pages build failed.');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: preview ? 'block' : 'allow', acceptDownloads: true });
  if (preview) {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
    await context.route(`${base}**`, async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname).slice(new URL(base).pathname.length) || 'index.html';
      if (path.includes('..')) return route.fulfill({ status: 404 });
      try { await route.fulfill({ status: 200, contentType: types[extname(path)] ?? 'application/octet-stream', body: await readFile(join(root, 'dist-pages', path)) }); }
      catch { await route.fulfill({ status: 404 }); }
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const statusResponse = page.waitForResponse((response) => response.url() === `${api}/api/status`);
  await page.goto(base);
  const response = await statusResponse;
  expect(response.status()).toBe(200);
  const expectedInventory = process.env.NEON_VERIFY_INITIAL_INVENTORY === 'true'
    ? JSON.parse(await readFile(join(root, 'deploy/inventory.json'), 'utf8')).items : null;
  if (expectedInventory) {
    const status = await response.json();
    expect(status.availableStock).toBe(expectedInventory.reduce((sum, item) => sum + item.stock, 0));
    expect(status.prizes.map((prize) => ({ id: prize.id, stock: prize.stock }))).toEqual(expectedInventory.map((item) => ({ id: item.prizeId, stock: item.stock })));
  }
  await expect(page.locator('.prize-card')).toHaveCount(5);
  await expect(page.locator('#campaign-status-label')).toHaveText('Experiencia en pausa');
  await expect(page.locator('#participate-button')).toBeDisabled();
  expect(await page.locator('.prize-card__image').evaluateAll(async (images) => {
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => image.decode()));
    return images.every((image) => image.naturalWidth > 0);
  })).toBeTruthy();
  const device = await page.evaluate(() => localStorage.getItem('olivos_device_v1'));
  expect(Boolean(device)).toBeTruthy();
  await page.locator('#wallet-button').click();
  await expect(page.locator('#wallet-dialog')).toBeVisible();
  await expect(page.locator('#wallet-content')).toContainText('Todavía no tienes cupones');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#campaign-status-label')).toHaveText('Experiencia en pausa');
  expect(await page.evaluate(() => localStorage.getItem('olivos_device_v1'))).toBe(device);
  for (const width of [320, 390, 800, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  console.log('PASS Connected Pages uses real Neon CORS, persistent device identity and correctly paused campaign UI.');

  await page.goto(`${base}admin.html`);
  await expect(page.locator('#login-button')).toBeEnabled();
  await page.locator('#admin-password').fill(password);
  await page.locator('#login-button').click();
  await expect(page.locator('#admin-shell')).toBeVisible({ timeout: 30_000 });
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('olivos_session_v1')).token);
  await page.reload();
  await expect(page.locator('#admin-shell')).toBeVisible({ timeout: 30_000 });
  if (expectedInventory) {
    await page.locator('a[href="#inventory"]').first().click();
    for (const item of expectedInventory) await expect(page.locator(`#stock-${item.prizeId}`)).toHaveValue(String(item.stock));
  }
  await page.locator('a[href="#coupons"]').first().click();
  const download = page.waitForEvent('download');
  await page.locator('#panel-coupons a[download]').click();
  const csv = await download;
  expect(csv.suggestedFilename()).toBe('los-olivos-cupones.csv');
  const directory = join(root, 'artifacts/neon-browser');
  await mkdir(directory, { recursive: true });
  const csvPath = join(directory, 'empty-register.csv');
  await csv.saveAs(csvPath);
  expect((await readFile(csvPath, 'utf8')).includes(password)).toBeFalsy();
  await page.locator('#logout-button').click();
  await expect(page.locator('#login-screen')).toBeVisible();
  const revoked = await context.request.get(`${api}/api/admin/session`, { headers: { Origin: new URL(base).origin, Authorization: `Bearer ${session}` } });
  expect(revoked.status()).toBe(401);
  console.log('PASS Remote admin login/reload, bearer+CSRF transport, authenticated CSV and server-side logout revocation.');

  await page.goto(`${base}instalar.html`);
  await expect(page.locator('#backend-warning')).toBeHidden();
  const manifestResponse = await context.request.get(`${base}manifest.webmanifest`);
  const manifest = await manifestResponse.json();
  expect(manifest.scope).toBe('/premio/');
  if (!preview) {
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(base);
  }
  expect(errors).toEqual([]);
  console.log(`PASS ${preview ? 'Prepublication build with real deployed API' : 'Live public site'} installation page, manifest and JavaScript errors check. No prizes issued or stock changed.`);
} finally { await browser.close(); }
