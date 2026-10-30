import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-instagram-browser-'));
const artifacts = resolve(process.env.ARTIFACTS_DIR ?? 'artifacts/instagram');
await mkdir(artifacts, { recursive: true });
const password = randomBytes(20).toString('hex');
const config = { dataDir: directory, publicUrl: 'http://localhost', adminPasswordHash: await hashPassword(password),
  deviceSecret: randomBytes(32).toString('hex'), initialInventory: { opener: 2 },
  initialSettings: { campaignActive: true, cooldownEnabled: false, interval: 2 } };
const app = await createApplication(config);
const destination = 'https://www.instagram.com/comercializadora_los_olivos_/';
const checks = [];
const errors = [];
let browser;
const check = async (label, run) => { await run(); checks.push(label); console.log(`PASS ${label}`); };
const business = () => {
  const { instagramClicks, ...state } = structuredClone(app.store.state);
  return state;
};

try {
  await new Promise(resolveListen => app.server.listen(0, '127.0.0.1', resolveListen));
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const externalRequests = [];
  // Only the navigation destination is a static fixture. The click API and persistence run for real locally.
  await context.route('https://www.instagram.com/**', async route => {
    externalRequests.push({ url: route.request().url(), headers: route.request().headers() });
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Navigation fixture</title><p>No Instagram API or follow verification.</p>' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const open = async source => {
    const link = page.locator(`[data-instagram-source="${source}"]`);
    const popupReady = page.waitForEvent('popup');
    await link.click();
    const popup = await popupReady;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(destination);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
  };
  const noOverflow = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };

  await check('Views never record clicks; native profile links disclose first-party recording without API credentials', async () => {
    await page.goto(config.publicUrl);
    await expect(page.locator('#participate-button')).toBeEnabled();
    await expect(page.locator('[data-instagram-source="home"]')).toHaveAttribute('href', destination);
    await expect(page.locator('[data-instagram-source="home"]')).toContainText('Se registra el clic');
    expect(app.store.state.instagramClicks).toBeUndefined();
    expect(externalRequests).toHaveLength(0);
    await page.reload();
    await expect(page.locator('#participate-button')).toBeEnabled();
    expect(app.store.state.instagramClicks).toBeUndefined();
  });

  await check('A native click opens a private-safe new tab and persists one event without touching promotion state', async () => {
    const before = business();
    await open('home');
    await expect(page.locator('#instagram-home-status')).toContainText('Clic registrado');
    expect(app.store.state.instagramClicks.total).toBe(1);
    expect(business()).toEqual(before);
    expect(externalRequests[0].headers.referer).toBeUndefined();
    expect(externalRequests[0].headers['x-olivos-device']).toBeUndefined();
    expect(new URL(externalRequests[0].url).hash).toBe('');
  });

  await check('A lost accepted response can be retried with the same key without inflating the click counter', async () => {
    const keys = [];
    page.on('request', request => { if (request.url().endsWith('/api/instagram/clicks')) keys.push(request.headers()['idempotency-key']); });
    await page.route('**/api/instagram/clicks', async route => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('connectionreset');
    }, { times: 1 });
    await open('home');
    await expect(page.locator('#instagram-home-status')).toContainText('No se pudo registrar');
    expect(app.store.state.instagramClicks.total).toBe(2);
    await open('home');
    await expect(page.locator('#instagram-home-status')).toContainText('Clic registrado');
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(app.store.state.instagramClicks.total).toBe(2);
  });

  await check('Result and coupon links record their own source without delaying results or leaking the private token', async () => {
    await page.locator('#participate-button').click();
    await expect(page.locator('#result-dialog')).toBeVisible();
    const before = business();
    await open('result');
    await expect(page.locator('#instagram-result-status')).toContainText('Clic registrado');
    expect(business()).toEqual(before);
    await page.locator('#result-dialog [aria-label="Cerrar resultado"]').click();
    await page.locator('#participate-button').click();
    await expect(page.locator('#result-dialog')).toHaveAttribute('data-state', 'winner');
    const privateUrl = await page.locator('#open-winner-link').getAttribute('href');
    await page.goto(privateUrl);
    await expect(page.locator('#coupon-actions')).toBeVisible();
    const couponBefore = business();
    await open('coupon');
    await expect(page.locator('#instagram-coupon-status')).toContainText('Clic registrado');
    expect(business()).toEqual(couponBefore);
    expect(app.store.state.instagramClicks.bySource).toEqual({ home: 2, result: 1, coupon: 1 });
    expect(externalRequests.every(request => request.url === destination && !request.headers.referer)).toBe(true);
    for (const [width, height] of [[320, 844], [390, 844], [1366, 596]]) {
      await page.setViewportSize({ width, height });
      await noOverflow();
      await expect(page.locator('[data-instagram-source="coupon"]')).toBeVisible();
      if (width === 390) await page.screenshot({ path: join(artifacts, 'coupon-click-record.png'), fullPage: true });
    }
  });

  await check('Logging failure never blocks the external link, hides a result or redeems a coupon', async () => {
    const before = business();
    await page.route('**/api/instagram/clicks', route => route.abort('internetdisconnected'));
    await open('coupon');
    await expect(page.locator('#instagram-coupon-status')).toContainText('No se pudo registrar');
    expect(app.store.state.instagramClicks.total).toBe(4);
    expect(business()).toEqual(before);
    await expect(page.locator('#coupon-status')).toHaveText('Por disfrutar');
  });

  await check('Private dashboard shows recorded clicks, not followers or verified visitors, at four widths', async () => {
    await page.goto(`${config.publicUrl}/admin.html`);
    await page.locator('#admin-password').fill(password);
    await page.locator('#login-button').click();
    await expect(page.locator('#instagram-click-total')).toHaveText('4');
    await expect(page.locator('#instagram-click-events .instagram-event')).toHaveCount(4);
    await expect(page.locator('#instagram-click-events')).toContainText('Enlace en la página de cupón');
    for (const width of [320, 390, 800, 1366]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 800 });
      await noOverflow();
    }
    await page.locator('#instagram-click-total').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(artifacts, 'admin-click-records.png'), fullPage: true });
  });

  expect(errors).toEqual([]);
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ browser: `Google Chrome ${browser.version()}`, checks,
    externalDestination: 'Static navigation fixture only; no actual Instagram/profile/follow assertion.', livePromotionTouched: false, errors }, null, 2));
  console.log(`Verified ${checks.length} isolated Instagram click groups; no live campaign or Meta API calls.`);
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true });
}
