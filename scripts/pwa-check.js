import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-pwa-'));
const artifacts = resolve(process.env.ARTIFACTS_DIR ?? 'artifacts/pwa');
await mkdir(artifacts, { recursive: true });
const config = { dataDir: directory, publicUrl: 'http://localhost', deviceSecret: randomBytes(32).toString('hex'), adminPasswordHash: await hashPassword(randomBytes(20).toString('hex')),
  initialSettings: { campaignActive: true, cooldownEnabled: false, interval: 2 }, initialInventory: { coffee: 2 } };
const app = await createApplication(config);
const results = [];
const check = async (name, action) => { await action(); results.push(name); console.log(`PASS ${name}`); };
let browser;
try {
  await new Promise((resolveListen) => app.server.listen(0, '127.0.0.1', resolveListen));
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await check('Manifest, local icons and restrictive worker CSP are served correctly', async () => {
    const response = await context.request.get(`${config.publicUrl}/manifest.webmanifest`);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBeTruthy();
    expect(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBeTruthy();
    const worker = await context.request.get(`${config.publicUrl}/sw.js`);
    expect(worker.headers()['service-worker-allowed']).toBe('/');
    expect(worker.headers()['content-security-policy']).toContain("worker-src 'self'");
    expect(worker.headers()['content-security-policy']).not.toContain('unsafe-inline');
  });

  await check('Service worker controls the app and caches only public resources', async () => {
    await page.goto(config.publicUrl);
    await page.evaluate(async () => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Worker did not activate')), 15000)),
      ]);
      if (!navigator.serviceWorker.controller) await new Promise((resolveControl) => navigator.serviceWorker.addEventListener('controllerchange', resolveControl, { once: true }));
    });
    const cache = await page.evaluate(async () => {
      const paths = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
      }
      return paths;
    });
    expect(cache).toContain('/offline.html');
    expect(cache.some((path) => path.startsWith('/api/'))).toBeFalsy();
    expect(cache).not.toContain('/admin.html');
    expect(cache).not.toContain('/cupon.html');
  });

  await app.game.participate('pwa-fixture', randomUUID(), {});
  const coupon = (await app.game.participate('pwa-fixture', randomUUID(), {})).coupon;
  await check('Private coupon navigation does not store the document or API response in Cache Storage', async () => {
    await page.goto(`${config.publicUrl}/cupon.html#${coupon.token}`);
    await expect(page.locator('#coupon-status')).toHaveText('Por disfrutar');
    await page.goto(`${config.publicUrl}/admin.html`);
    await expect(page.locator('#login-screen')).toBeVisible();
    const sensitive = await page.evaluate(async () => {
      const found = [];
      for (const name of await caches.keys()) for (const entry of await (await caches.open(name)).keys()) {
        const path = new URL(entry.url).pathname;
        if (path.startsWith('/api/') || ['/admin.html', '/cupon.html'].includes(path)) found.push(path);
      }
      return found;
    });
    expect(sensitive).toEqual([]);
  });

  await check('Offline mode never invents winners, replays private data or confirms redemption', async () => {
    const before = (await app.game.dashboard()).totals;
    await context.setOffline(true);
    await page.goto(`${config.publicUrl}/cupon.html#${coupon.token}`);
    await expect(page.getByRole('heading', { name: 'Volvamos a conectar.' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(coupon.code);
    const apiReachable = await page.evaluate(() => fetch('/api/wallet', { cache: 'no-store' }).then(() => true).catch(() => false));
    expect(apiReachable).toBeFalsy();
    expect((await app.game.dashboard()).totals).toEqual(before);
    await context.setOffline(false);
  });

  await check('Android install instructions, localhost warning and user dismissal are handled honestly', async () => {
    await page.goto(`${config.publicUrl}/instalar.html`);
    await expect(page.locator('#installation-warning')).toContainText('dirección HTTPS');
    await expect(page.locator('body')).toContainText('Android · Chrome');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });
    await page.locator('#install-app').click();
    await expect(page.locator('#installation-status')).toContainText('cancelada');
    const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({ path: join(artifacts, 'installation-android.png'), fullPage: true });
  });

  await check('iPhone manual installation instructions are shown without a fake native installer', async () => {
    const iosContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
    const iosPage = await iosContext.newPage();
    await iosPage.goto(`${config.publicUrl}/instalar.html`);
    await expect(iosPage.locator('#installation-status')).toContainText('Safari');
    await expect(iosPage.locator('body')).toContainText('Agregar a pantalla de inicio');
    await expect(iosPage.locator('#install-app')).toBeHidden();
    await iosPage.screenshot({ path: join(artifacts, 'installation-ios-instructions.png'), fullPage: true });
    await iosContext.close();
  });
  await check('A separate app session can recover a coupon from its private link without a new participation', async () => {
    const isolatedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const isolated = await isolatedContext.newPage();
    const before = (await app.game.dashboard()).totals;
    await isolated.goto(`${config.publicUrl}/#mis-cupones`);
    await expect(isolated.locator('#wallet-dialog')).toBeVisible();
    await expect(isolated.locator('.wallet-item')).toHaveCount(0);
    await isolated.locator('.wallet-recovery summary').click();
    await isolated.locator('#wallet-private-link').fill(`${config.publicUrl}/cupon.html#${coupon.token}`);
    await isolated.getByRole('button', { name: 'Guardar en Mis cupones' }).click();
    await expect(isolated.locator('.wallet-item').filter({ hasText: coupon.code })).toBeVisible();
    await expect(isolated.locator('#wallet-recovery-message')).toContainText('Cupón guardado');
    expect((await app.game.dashboard()).totals).toEqual(before);
    await isolatedContext.close();
  });
  expect(errors).toEqual([]);
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ checks: results, uncaughtErrors: errors,
    note: 'Real Chrome and service-worker checks. iOS instructions use user-agent simulation, not a physical Safari installation.' }, null, 2));
  console.log(`\n${results.length} PWA checks passed.`);
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
