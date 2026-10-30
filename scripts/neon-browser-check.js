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
  const status = await response.json();
  const expectedInventory = process.env.NEON_VERIFY_INITIAL_INVENTORY === 'true'
    ? JSON.parse(await readFile(join(root, 'deploy/inventory.json'), 'utf8')).items : null;
  if (expectedInventory) {
    expect(status.availableStock).toBe(expectedInventory.reduce((sum, item) => sum + item.stock, 0));
    expect(status.prizes.map((prize) => ({ id: prize.id, stock: prize.stock }))).toEqual(expectedInventory.map((item) => ({ id: item.prizeId, stock: item.stock })));
  }
  await expect(page.locator('.prize-card')).toHaveCount(5);
  const campaignLabel = !status.active ? 'Experiencia en pausa' : status.availableStock === 0 ? 'Preparando sorpresas' : 'La sorpresa está activa';
  await expect(page.locator('#campaign-status-label')).toHaveText(campaignLabel);
  if (!status.active || status.availableStock === 0) await expect(page.locator('#participate-button')).toBeDisabled();
  else await expect(page.locator('#participate-button')).toBeEnabled();
  const instagram = page.locator('[data-instagram-source="home"]');
  await expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/comercializadora_los_olivos_/');
  await expect(instagram).toHaveAttribute('rel', 'noopener noreferrer');
  const invalidClick = await context.request.post(`${api}/api/instagram/clicks`, {
    headers: { Origin: new URL(base).origin, 'Idempotency-Key': 'publication-invalid-click-source' }, data: { source: 'unsupported' } });
  expect(invalidClick.status()).toBe(400);
  expect((await invalidClick.json()).error.code).toBe('INVALID_INPUT');
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
  await expect(page.locator('#campaign-status-label')).toHaveText(campaignLabel);
  expect(await page.evaluate(() => localStorage.getItem('olivos_device_v1'))).toBe(device);
  for (const width of [320, 390, 800, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  console.log('PASS Connected Pages uses real Neon CORS, persistent device identity and the actual campaign state without participating.');

  await page.goto(`${base}admin.html`);
  await expect(page.locator('#login-button')).toBeEnabled();
  await page.locator('#admin-password').fill(password);
  const dashboardReady = page.waitForResponse(response => response.url() === `${api}/api/admin/dashboard` && response.status() === 200);
  await page.locator('#login-button').click();
  await expect(page.locator('#admin-shell')).toBeVisible({ timeout: 30_000 });
  const snapshot = await (await dashboardReady).json();
  await expect(page.locator('#instagram-click-total')).toHaveText(new Intl.NumberFormat('es-CL').format(snapshot.instagramClicks.total));
  console.log('PASS Click-only profile link and private counter; invalid-source rejection verified without logging synthetic events.');
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('olivos_session_v1')).token);
  await page.reload();
  await expect(page.locator('#admin-shell')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-panel="visits"]').click();
  await expect(page.locator('#visit-lookup-form')).toBeVisible();
  const missing = '0'.repeat(32);
  const privateLookup = await page.evaluate(async (id) => {
    const { request } = await import('/premio/assets/js/api.js');
    try { await request(`/api/admin/visits/${id}`); return 200; } catch (error) { return error.status; }
  }, missing);
  expect(privateLookup).toBe(404);
  await page.locator('[data-panel="settings"]').click();
  if (status.rules.presenceRequired) await expect(page.locator('#setting-presence')).toBeChecked();
  else await expect(page.locator('#setting-presence')).not.toBeChecked();
  console.log('PASS Published visit panel and safe private lookup; eligibility flag matches live API and no presence was falsely approved.');
  if (process.env.NEON_VERIFY_PUBLICATION_UI === 'true') {
    await page.locator('a[href="#settings"]').first().click();
    await expect(page.locator('#setting-contact')).toHaveValue(process.env.NEON_EXPECT_PROMOTION_CONTACT);
    await expect(page.locator('#setting-reviewed')).not.toBeChecked();
    await expect(page.locator('#setting-active')).not.toBeChecked();
    await page.locator('#setting-active').check();
    const rejected = page.waitForResponse((response) => response.url() === `${api}/api/admin/settings` && response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Guardar la experiencia' }).click();
    expect((await rejected).status()).toBe(400);
    await expect(page.locator('#settings-message')).toContainText('revisaste las bases');
    const geometry = await page.evaluate(() => ({
      form: document.getElementById('settings-form').getBoundingClientRect().toJSON(),
      button: document.querySelector('.settings-submit button').getBoundingClientRect().toJSON(),
      message: document.getElementById('settings-message').getBoundingClientRect().toJSON(),
    }));
    expect(geometry.message.width).toBeGreaterThanOrEqual(geometry.form.width * .95);
    expect(geometry.message.top).toBeGreaterThan(geometry.button.bottom);
    await mkdir(join(root, 'artifacts/neon-browser'), { recursive: true });
    await page.screenshot({ path: join(root, 'artifacts/neon-browser/publication-settings.png'), fullPage: true });
    await page.reload();
    await expect(page.locator('#setting-reviewed')).not.toBeChecked();
    await expect(page.locator('#setting-active')).not.toBeChecked();
    console.log('PASS Live contact and full-width activation feedback; missing owner review is rejected without activating.');
  }
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
  if (process.env.NEON_EXPECT_PROMOTION_CONTACT) {
    await page.goto(`${base}#bases`);
    await expect(page.locator('#rules-dialog')).toBeVisible();
    await expect(page.locator('#promotion-contact')).toContainText(process.env.NEON_EXPECT_PROMOTION_CONTACT);
  }
  if (!preview) {
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(base);
  }
  expect(errors).toEqual([]);
  console.log(`PASS ${preview ? 'Prepublication build with real deployed API' : 'Live public site'} installation page, manifest and JavaScript errors check. No prizes issued or stock changed.`);
} finally { await browser.close(); }
