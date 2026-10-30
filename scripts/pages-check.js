import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';

const build = spawnSync(process.execPath, ['scripts/build-pages.js'], { encoding: 'utf8' });
if (build.status !== 0) throw new Error(build.stderr || 'Static build failed.');
const root = resolve('dist-pages');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const apiRequests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname.includes('/api/')) apiRequests.push(pathname);
  if (!pathname.startsWith('/premio/') || pathname.includes('..')) { response.writeHead(404).end(); return; }
  const relative = pathname.slice('/premio/'.length) || 'index.html';
  try {
    const bytes = await readFile(join(root, relative));
    response.writeHead(200, { 'Content-Type': types[extname(relative)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
let browser;
try {
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${server.address().port}/premio/`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 596 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.goto(base);
  expect(await page.locator('script[src*="app.js"]').getAttribute('src')).toContain('?v=');
  await expect(page.locator('.prize-card')).toHaveCount(5);
  await expect(page.locator('#participate-button')).toBeDisabled();
  await expect(page.locator('#participation-guidance')).toContainText('Servidor pendiente');
  await expect(page.locator('#campaign-status-label')).toContainText('Servidor pendiente');
  for (const width of [320, 390, 800, 1366]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 700 });
    const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    expect(layout.content).toBeLessThanOrEqual(layout.width);
  }
  const manifest = await (await context.request.get(`${base}manifest.webmanifest`)).json();
  expect(manifest.scope).toBe('/premio/');
  expect(manifest.start_url).toBe('/premio/?source=app');
  for (const icon of manifest.icons) expect(icon.src.startsWith('/premio/')).toBeTruthy();
  await page.evaluate(async () => {
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Pages worker did not activate')), 15000))]);
  });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(`${base}`);
  await page.goto(`${base}admin.html`);
  await expect(page.locator('#login-button')).toBeDisabled();
  await expect(page.locator('#admin-password')).toBeDisabled();
  await expect(page.locator('#login-message')).toContainText('GitHub Pages');
  await page.goto(`${base}cartel.html`);
  await expect(page.locator('#poster-warning')).toContainText('Servidor de premios pendiente');
  await expect(page.locator('#print-poster')).toBeDisabled();
  expect(await page.locator('.poster-qr img').evaluate((image) => image.decode().then(() => image.naturalWidth))).toBe(512);
  await page.goto(`${base}instalar.html`);
  await expect(page.locator('#backend-warning')).toContainText('GitHub Pages');
  for (const path of ['.env', 'ellocal.txt', 'data/state.json', 'server/index.js']) expect((await context.request.get(`${base}${path}`)).status()).toBe(404);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
  console.log('GitHub Pages build verified: /premio/ paths, scoped manifest/worker, responsive UI, no secrets and no fake API traffic.');
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
