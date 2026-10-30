import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-browser-'));
const artifacts = resolve(process.env.ARTIFACTS_DIR ?? 'artifacts/browser');
await mkdir(artifacts, { recursive: true });
const password = randomBytes(20).toString('hex');
const config = { dataDir: directory, publicUrl: 'http://localhost', adminPasswordHash: await hashPassword(password), deviceSecret: randomBytes(32).toString('hex'),
  initialSettings: { campaignActive: true, cooldownEnabled: false }, initialInventory: { opener: 12, cookies: 10, jokey: 8 } };
const app = await createApplication(config);
const errors = [];
const results = [];
let browser;
let expectedDashboardFailure = false;
let expectedSettingsFailure = false;
let winningPrivateUrl;
const check = async (label, operation) => { await operation(); results.push(label); console.log(`PASS ${label}`); };

try {
  await new Promise((resolveListen) => app.server.listen(0, '127.0.0.1', resolveListen));
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !entry.text().includes('401')
      && !(expectedDashboardFailure && entry.text().includes('net::ERR_FAILED'))
      && !(expectedSettingsFailure && entry.text().includes('400'))) errors.push(entry.text());
  });
  const noOverflow = async () => {
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    if (sizes.content > sizes.viewport) {
      console.log(await page.evaluate(() => ({ scrollX, elements: Array.from(document.querySelectorAll('body *')).filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.right + scrollX > innerWidth + 1;
      }).slice(0, 18).map((node) => ({ tag: node.tagName, id: node.id, className: node.className, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width, overflow: getComputedStyle(node).overflow, scrollWidth: node.scrollWidth })), containers: ['html','body','.table-scroll','table','#redeem-dialog'].map(selector => { const node = document.querySelector(selector); return { selector, width:node.getBoundingClientRect().width, scrollWidth: node.scrollWidth, overflow:getComputedStyle(node).overflow }; }) })));
      await page.screenshot({ path: join(artifacts, 'layout-failure.png'), fullPage: true });
    }
    expect(sizes.content, `Horizontal overflow at ${sizes.viewport}px`).toBeLessThanOrEqual(sizes.viewport);
  };

  await check('Customer screen: local assets, no embedded code and six responsive widths', async () => {
    await page.goto(config.publicUrl);
    await expect(page.getByRole('button', { name: 'Descubrir mi suerte' })).toBeEnabled();
    await expect(page.locator('.prize-card')).toHaveCount(5);
    await expect(page.locator('.edition, .universe-coordinate')).toHaveCount(0);
    await expect(page.locator('.experience-card')).not.toContainText('VOL. 01');
    await expect(page.locator('.experience-card')).not.toContainText('33°36');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.locator('[style], script:not([src]), [onclick]').count()).toBe(0);
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await noOverflow();
      await expect(page.getByRole('button', { name: 'Descubrir mi suerte' })).toBeVisible();
      if ([390, 1440].includes(width)) await page.screenshot({ path: join(artifacts, `home-${width}.png`), fullPage: true });
    }
  });

  await check('The complete first section fits between the header and footer without scrolling', async () => {
    for (const [width, height] of [[1440, 900], [1366, 596], [1280, 720], [1024, 768], [800, 600], [390, 844], [390, 700], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(config.publicUrl);
      await expect(page.locator('#participate-button')).toBeEnabled();
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({
        hero: document.querySelector('.hero').getBoundingClientRect().toJSON(),
        copy: document.querySelector('.hero__copy').getBoundingClientRect().toJSON(),
        visual: document.querySelector('.hero__visual').getBoundingClientRect().toJSON(),
        footer: document.querySelector('.site-footer').getBoundingClientRect().toJSON(),
        headlineSize: parseFloat(getComputedStyle(document.querySelector('.hero h1')).fontSize),
        productHeight: parseFloat(getComputedStyle(document.querySelector('.hero-product')).height),
        scrollY,
      }));
      expect(layout.scrollY).toBe(0);
      expect(layout.hero.bottom, `Hero at ${width}x${height}`).toBeLessThanOrEqual(layout.footer.top + 1);
      expect(layout.copy.bottom, `Hero text at ${width}x${height}`).toBeLessThanOrEqual(layout.footer.top);
      expect(layout.visual.bottom, `Hero illustration at ${width}x${height}`).toBeLessThanOrEqual(layout.footer.top);
      expect(layout.headlineSize).toBeLessThanOrEqual(width <= 600 ? 40 : 52);
      expect(layout.productHeight).toBeLessThanOrEqual(235);
      await noOverflow();
      if ([1366, 390].includes(width)) await page.screenshot({ path: join(artifacts, `hero-first-screen-${width}x${height}.png`), fullPage: false });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await check('Logo and compact footer remain visible on direct participation and experience links', async () => {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      for (const hash of ['experiencia', 'participar']) {
        await page.goto(`${config.publicUrl}/#${hash}`);
        await expect(page.locator('.site-header .brand__logo')).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.site-footer')).toBeInViewport({ ratio: 0.98 });
        await expect(page.getByRole('button', { name: 'Bases de la experiencia', exact: true })).toBeInViewport();
        await noOverflow();
        if (width === 390 || width === 1440) await page.screenshot({ path: join(artifacts, `${hash}-${width}.png`), fullPage: false });
      }
    }
    await page.goto(config.publicUrl);
    await expect(page.getByRole('button', { name: 'Descubrir mi suerte' })).toBeEnabled();
  });

  await check('Navigation frames complete experience and prize sections below the header', async () => {
    for (const [width, height] of [[1280, 720], [1024, 768], [800, 600], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto(config.publicUrl);
      await expect(page.getByRole('button', { name: 'Descubrir mi suerte' })).toBeEnabled();
      for (const [hash, label, sectionId] of [['experiencia', 'La experiencia', 'experience-section'], ['premios', 'Los premios', 'prizes-section']]) {
        const link = page.locator('.desktop-nav').getByRole('link', { name: label, exact: true });
        if (await link.isVisible()) await link.click();
        else await page.goto(`${config.publicUrl}/#${hash}`);
        await expect(page).toHaveURL(new RegExp(`#${hash}$`));
        await expect(page.locator('.prize-card')).toHaveCount(5);
        const layout = await page.evaluate(({ hash, sectionId }) => ({
          heading: document.getElementById(hash).getBoundingClientRect().toJSON(),
          section: document.getElementById(sectionId).getBoundingClientRect().toJSON(),
          header: document.querySelector('.site-header').getBoundingClientRect().toJSON(),
          footer: document.querySelector('.site-footer').getBoundingClientRect().toJSON(),
        }), { hash, sectionId });
        expect(layout.heading.top, `${hash} heading at ${width}x${height}`).toBeGreaterThanOrEqual(layout.header.bottom + 7);
        expect(layout.heading.top, `${hash} excessive anchor gap at ${width}x${height}`).toBeLessThanOrEqual(layout.header.bottom + 28);
        expect(layout.section.bottom, `${hash} content below footer at ${width}x${height}`).toBeLessThanOrEqual(layout.footer.top - 8);
        if (width === 1280 || width === 800) await page.screenshot({ path: join(artifacts, `${hash}-framed-${width}.png`), fullPage: false });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(config.publicUrl);
    await expect(page.getByRole('button', { name: 'Descubrir mi suerte' })).toBeEnabled();
  });

  await check('Wallet empty state and keyboard dismissal restore focus', async () => {
    await page.getByRole('button', { name: 'Mis cupones' }).click();
    await expect(page.getByRole('dialog', { name: 'Mis cupones.' })).toBeVisible();
    await expect(page.getByText('Las buenas historias empiezan aquí.')).toBeVisible();
    const walletBox = await page.locator('#wallet-dialog').boundingBox();
    expect(walletBox.width).toBeLessThanOrEqual(620);
    expect(walletBox.height).toBeLessThan(800);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Mis cupones' })).toBeFocused();
  });

  await check('The closing action participates immediately, without an anchor detour or second click', async () => {
    const originalUrl = page.url();
    await page.getByRole('button', { name: 'Participar ahora', exact: true }).click();
    await expect(page.locator('#result-dialog')).toBeVisible();
    await expect(page.locator('#participation-receipt')).toContainText('#000001');
    await expect(page.locator('#result-title')).toHaveText('Gracias por sumar un buen momento.');
    await expect(page.locator('#result-description')).toHaveText('Esta vez no hubo premio, pero tu participación quedó registrada. Vuelve en 24 horas: nos encantará verte otra vez.');
    await expect(page.locator('#result-description .result-emphasis')).toHaveText('no hubo premio');
    const outcomeStyles = await page.locator('#result-description').evaluate((node) => ({
      align: getComputedStyle(node).textAlign,
      color: getComputedStyle(node).color,
      highlightedColor: getComputedStyle(node.querySelector('strong')).color,
      highlightedWeight: getComputedStyle(node.querySelector('strong')).fontWeight,
    }));
    expect(outcomeStyles.align).toBe('center');
    expect(outcomeStyles.highlightedColor).not.toBe(outcomeStyles.color);
    expect(Number(outcomeStyles.highlightedWeight)).toBeGreaterThanOrEqual(700);
    await page.screenshot({ path: join(artifacts, 'participation-centered-result.png'), fullPage: false });
    await expect(page).toHaveURL(originalUrl);
    await page.keyboard.press('Escape');
  });

  await check('Winning flow: one winner, original frame and downloadable PNG', async () => {
    for (let count = 2; count < 20; count += 1) {
      const response = await context.request.post(`${config.publicUrl}/api/participations`, { headers: { 'Idempotency-Key': randomBytes(16).toString('hex') }, data: {} });
      expect(response.ok()).toBeTruthy();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Descubrir mi suerte' }).click();
    await expect(page.locator('#result-dialog')).toHaveAttribute('data-state', 'winner');
    await expect(page.locator('#result-coupon-qr')).toBeVisible();
    await noOverflow();
    await page.screenshot({ path: join(artifacts, 'winner-mobile.png'), fullPage: false });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar mi cupón' }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/^los-olivos-OLV-.*\.png$/);
    await download.saveAs(join(artifacts, 'downloaded-coupon.png'));
    const link = await page.locator('#open-winner-link').getAttribute('href');
    winningPrivateUrl = link;
    await page.goto(link);
    await expect(page.locator('#coupon-status')).toHaveText('Por disfrutar');
    await noOverflow();
    await page.screenshot({ path: join(artifacts, 'coupon-mobile.png'), fullPage: true });
  });

  await check('A winning coupon is saved in My coupons with its validation code', async () => {
    const privateUrl = page.url();
    const couponCode = await page.locator('#coupon-code').textContent();
    await page.goto(config.publicUrl);
    await expect(page.getByRole('button', { name: 'Descubrir mi suerte' })).toBeEnabled();
    await expect(page.locator('#wallet-count')).toHaveText('1');
    await page.setViewportSize({ width: 320, height: 844 });
    await noOverflow();
    await page.getByRole('button', { name: /Mis cupones/ }).click();
    const savedCoupon = page.locator('.wallet-item').filter({ hasText: couponCode });
    await expect(savedCoupon).toBeVisible();
    await expect(savedCoupon).toContainText('Por disfrutar');
    await page.screenshot({ path: join(artifacts, 'wallet-with-winner.png'), fullPage: false });
    await savedCoupon.click();
    await expect(page).toHaveURL(privateUrl);
    await expect(page.locator('#coupon-code')).toHaveText(couponCode);
    await page.setViewportSize({ width: 1366, height: 596 });
    await page.goto(config.publicUrl);
    const before = (await app.game.dashboard()).totals.participations;
    await page.evaluate(async (token) => {
      const { showSavedCoupon } = await import('/assets/js/app.js');
      await showSavedCoupon(token);
    }, new URL(privateUrl).hash.slice(1));
    await expect(page.locator('#result-coupon-code')).toHaveText(couponCode);
    await expect(page.locator('#participation-receipt')).toContainText(couponCode);
    const bounds = await page.evaluate(() => ({
      dialog: document.getElementById('result-dialog').getBoundingClientRect().toJSON(),
      frame: document.getElementById('result-coupon').getBoundingClientRect().toJSON(),
      qr: document.getElementById('result-coupon-qr').getBoundingClientRect().toJSON(),
      height: innerHeight,
    }));
    expect(bounds.dialog.width).toBeLessThanOrEqual(780);
    expect(bounds.dialog.height).toBeLessThanOrEqual(bounds.height - 39);
    expect(bounds.frame.top).toBeGreaterThanOrEqual(bounds.dialog.top);
    expect(bounds.frame.bottom).toBeLessThanOrEqual(bounds.dialog.bottom);
    expect(bounds.qr.bottom).toBeLessThanOrEqual(bounds.dialog.bottom);
    expect((await app.game.dashboard()).totals.participations).toBe(before);
    await page.screenshot({ path: join(artifacts, 'saved-winner-short-desktop.png'), fullPage: false });
    await page.goto(privateUrl);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  let code;
  await check('Private admin login and responsive dashboard at four widths', async () => {
    code = await page.locator('#coupon-code').textContent();
    await page.goto(`${config.publicUrl}/admin.html`);
    await expect(page.locator('#login-screen')).toBeVisible();
    for (const [width, height] of [[1366, 596], [1280, 720], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(totalHeight, `Login height at ${width}x${height}`).toBeLessThanOrEqual(height + 1);
      if (width === 1366) await page.screenshot({ path: join(artifacts, 'login-compact-desktop.png') });
    }
    await noOverflow();
    await page.screenshot({ path: join(artifacts, 'login-mobile.png'), fullPage: true });
    await page.getByLabel('Contraseña de administración', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
    await expect(page.locator('#admin-shell')).toBeVisible();
    await expect(page.locator('[data-total="participations"]')).toHaveText('20');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await noOverflow();
      if ([390, 1440].includes(width)) await page.screenshot({ path: join(artifacts, `admin-${width}.png`), fullPage: true });
    }
  });

  await check('Coupon verification controls have matching heights and aligned edges', async () => {
    await page.locator('[data-panel="coupons"]').click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const input = await page.locator('#coupon-code-input').boundingBox();
      const button = await page.locator('#validate-form button[type="submit"]').boundingBox();
      expect(Math.abs(input.height - button.height), `Control heights at ${width}px`).toBeLessThanOrEqual(1);
      expect(button.height).toBe(48);
      if (width > 350) expect(Math.abs(input.y - button.y), `Control top edges at ${width}px`).toBeLessThanOrEqual(1);
      else {
        expect(button.y).toBeGreaterThanOrEqual(input.y + input.height + 7);
        expect(Math.abs(button.x + button.width - input.x - input.width)).toBeLessThanOrEqual(1);
      }
      await noOverflow();
      if (width === 390 || width === 1024) await page.locator('.redemption-card').screenshot({ path: join(artifacts, `verification-controls-${width}.png`) });
    }
    await page.locator('[data-panel="overview"]').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  let externalContext;
  await check('Admin updates automatically for another device and on returning to its tab, without navigation', async () => {
    let navigations = 0;
    const countNavigation = (frame) => { if (frame === page.mainFrame()) navigations += 1; };
    page.on('framenavigated', countNavigation);
    externalContext = await browser.newContext();
    await externalContext.request.get(`${config.publicUrl}/api/status`);
    const remoteResult = await externalContext.request.post(`${config.publicUrl}/api/participations`, {
      headers: { 'Idempotency-Key': randomBytes(16).toString('hex') }, data: {},
    });
    expect(remoteResult.ok()).toBeTruthy();
    await expect(page.locator('[data-total="participations"]')).toHaveText('21', { timeout: 8000 });
    await expect(page.locator('#live-update-status')).toHaveText('Actualización automática');
    const customer = await context.newPage();
    customer.on('pageerror', (error) => errors.push(error.message));
    await customer.goto(config.publicUrl);
    await customer.getByRole('button', { name: 'Descubrir mi suerte' }).click();
    await expect(customer.locator('#participation-receipt')).toContainText('#000022');
    await page.bringToFront();
    await expect(page.locator('[data-total="participations"]')).toHaveText('22', { timeout: 3000 });
    expect(navigations).toBe(0);
    page.off('framenavigated', countNavigation);
    await customer.close();
  });

  await check('Automatic updates preserve unsaved settings and inventory edits', async () => {
    await page.locator('[data-panel="settings"]').click();
    await page.locator('#setting-expiry').fill('9');
    const participation = await externalContext.request.post(`${config.publicUrl}/api/participations`, {
      headers: { 'Idempotency-Key': randomBytes(16).toString('hex') }, data: {},
    });
    expect(participation.ok()).toBeTruthy();
    await expect(page.locator('[data-total="participations"]')).toHaveText('23', { timeout: 8000 });
    await expect(page.locator('#setting-expiry')).toHaveValue('9');
    await page.locator('#setting-expiry').fill('5');
    await page.getByRole('button', { name: 'Guardar la experiencia' }).click();
    await expect(page.locator('#settings-message')).toContainText('correctamente');
    await page.locator('[data-panel="inventory"]').click();
    await page.locator('#stock-jokey').fill('77');
    await page.locator('#inventory-title').click();
    const updatedSnapshot = page.waitForResponse(async (response) => response.url().endsWith('/api/admin/dashboard')
      && response.status() === 200 && (await response.json()).inventory.some((prize) => prize.id === 'jokey' && prize.stock === 6), { timeout: 8000 });
    await app.game.updateInventory('jokey', { stock: 6 });
    await updatedSnapshot;
    await expect(page.locator('#stock-jokey')).toHaveValue('77');
    await page.locator('#stock-jokey').fill('6');
    await page.getByRole('button', { name: 'Actualizar stock de Jokey' }).click();
    await expect(page.locator('#stock-jokey')).toHaveValue('6');
  });

  await check('Admin recovers from a connection failure without reloading or discarding data', async () => {
    expectedDashboardFailure = true;
    await page.route('**/api/admin/dashboard', (route) => route.abort('failed'));
    await expect(page.locator('#live-update-status')).toHaveText('Reconectando automáticamente…', { timeout: 8000 });
    await expect(page.locator('[data-total="participations"]')).toHaveText('23');
    await page.unroute('**/api/admin/dashboard');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('#live-update-status')).toHaveText('Actualización automática', { timeout: 5000 });
    expectedDashboardFailure = false;
  });

  await check('QR validation requires explicit confirmation; redemption is single use', async () => {
    await page.goto(`${config.publicUrl}/admin.html#redeem=${code}`);
    await expect(page.locator('#redeem-dialog')).toBeVisible();
    await expect(page.locator('#redeem-details')).toContainText('Por disfrutar');
    await page.setViewportSize({ width: 1366, height: 596 });
    const redemptionSize = await page.locator('#redeem-dialog').evaluate((dialog) => ({ height: dialog.getBoundingClientRect().height, scroll: dialog.scrollHeight, client: dialog.clientHeight }));
    expect(redemptionSize.height).toBeLessThanOrEqual(556);
    expect(redemptionSize.scroll).toBeLessThanOrEqual(redemptionSize.client + 1);
    await page.screenshot({ path: join(artifacts, 'redemption-compact-desktop.png') });
    await page.getByRole('button', { name: 'Confirmar canje y entrega' }).click();
    await expect(page.locator('#redeem-message')).toContainText('¡Canje confirmado!');
    await expect(page.locator('#confirm-redeem')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#redeem-dialog')).not.toBeVisible();
    await page.locator('#coupon-code-input').fill(code);
    await page.getByRole('button', { name: 'Verificar', exact: true }).click();
    await expect(page.locator('#redeem-dialog')).toBeVisible();
    await expect(page.locator('#redeem-details')).toContainText('Canjeado');
    await expect(page.locator('#confirm-redeem')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#redeem-dialog')).not.toBeVisible();
  });

  await check('A private redeemed coupon is compact and remembered by a different browser', async () => {
    const otherContext = await browser.newContext({ viewport: { width: 1366, height: 596 }, reducedMotion: 'reduce' });
    const otherPage = await otherContext.newPage();
    const before = (await app.game.dashboard()).totals;
    const saved = otherPage.waitForResponse((response) => response.url().endsWith('/api/wallet/coupons') && response.request().method() === 'POST');
    await otherPage.goto(winningPrivateUrl);
    expect((await saved).status()).toBe(200);
    await expect(otherPage.locator('#coupon-status')).toHaveText('Canjeado');
    for (const [width, height] of [[1366, 596], [1280, 720], [390, 844]]) {
      await otherPage.setViewportSize({ width, height });
      await otherPage.evaluate(() => document.fonts.ready);
      const totalHeight = await otherPage.evaluate(() => document.documentElement.scrollHeight);
      expect(totalHeight, `Coupon height at ${width}x${height}`).toBeLessThanOrEqual(height + 1);
      await otherPage.screenshot({ path: join(artifacts, `coupon-compact-${width}.png`), fullPage: false });
    }
    await otherPage.locator('#coupon-wallet-button').click();
    await expect(otherPage.locator('#wallet-dialog')).toBeVisible();
    const item = otherPage.locator('.wallet-item').filter({ hasText: code });
    await expect(item).toBeVisible();
    await expect(item).toContainText('Canjeado');
    await expect(otherPage.locator('#wallet-count')).toHaveText('1');
    const after = (await app.game.dashboard()).totals;
    expect(after).toEqual(before);
    await otherContext.close();
    await page.bringToFront();
  });

  await check('Settings, inventory, coupon filters and poster remain usable at mobile width', async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    for (const panel of ['coupons', 'inventory', 'settings']) {
      await page.locator(`[data-panel="${panel}"]`).click();
      await expect(page.locator(`#panel-${panel}`)).toBeVisible();
      await noOverflow();
    }
    await app.game.updateSettings({ cooldownEnabled: true });
    await page.locator('#refresh-dashboard').click();
    await expect(page.getByLabel('Una participación cada 24 horas', { exact: false })).toBeDisabled();
    await page.getByRole('button', { name: 'Guardar la experiencia' }).click();
    await expect(page.locator('#settings-message')).toContainText('correctamente');
    await page.locator('[data-panel="inventory"]').click();
    await page.locator('#stock-jokey').fill('7');
    await page.getByRole('button', { name: 'Actualizar stock de Jokey' }).click();
    await expect(page.locator('#stock-jokey')).toHaveValue('7');
    await page.goto(`${config.publicUrl}/cartel.html`);
    await expect(page.locator('#poster-url')).toHaveText(config.publicUrl);
    await noOverflow();
    await page.screenshot({ path: join(artifacts, 'poster-mobile.png'), fullPage: true });
  });

  await check('Customer cooldown uses the saved device, not a cosmetic frontend restriction', async () => {
    await page.goto(config.publicUrl);
    await expect(page.getByRole('button', { name: 'Descubrir mi suerte' })).toBeEnabled();
    await page.getByRole('button', { name: 'Descubrir mi suerte' }).click();
    await expect(page.locator('#participation-message')).toContainText('Ya participaste');
    await expect(page.locator('#result-dialog')).not.toBeVisible();
  });

  await check('Poster is compact, has readable contrast and prints as one A4 sheet', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${config.publicUrl}/cartel.html`);
    await expect(page.locator('#poster-url')).toHaveText(config.publicUrl);
    const poster = await page.locator('.poster').boundingBox();
    expect(poster.width).toBeLessThanOrEqual(400);
    expect(poster.height).toBeLessThan(740);
    const contrasts = await page.evaluate(() => {
      const rgb = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = (color) => rgb(color).map((part) => {
        const value = part / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const background = luminance(getComputedStyle(document.querySelector('.poster')).backgroundColor);
      return ['.poster .eyebrow', '.poster h1', '.poster h1 span', '.poster-description', '.poster-details', '.poster-terms', '.poster footer', '.poster-url'].map((selector) => {
        const color = luminance(getComputedStyle(document.querySelector(selector)).color);
        return { selector, ratio: (Math.max(color, background) + .05) / (Math.min(color, background) + .05) };
      });
    });
    for (const contrast of contrasts) expect(contrast.ratio, contrast.selector).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: join(artifacts, 'poster-desktop.png'), fullPage: true });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.poster-guide')).toBeHidden();
    await expect(page.locator('#poster-print-warning')).toBeVisible();
    const printedQr = await page.locator('.poster-qr').boundingBox();
    expect(printedQr.width).toBeGreaterThan(220);
    const pdf = await page.pdf({ path: join(artifacts, 'poster-a4.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true });
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
    await page.emulateMedia({ media: 'screen' });
  });

  await check('Visible Back controls navigate safely on every page without modifying rewards', async () => {
    const before = (await app.game.dashboard()).totals;
    await page.getByRole('link', { name: 'Volver al local', exact: true }).click();
    await expect(page.locator('#admin-shell')).toBeVisible();
    await page.locator('.admin-topbar').getByRole('link', { name: 'Volver a la experiencia', exact: true }).click();
    await expect(page.locator('#participate-button')).toBeEnabled();
    await page.locator('.desktop-nav').getByRole('link', { name: 'La experiencia', exact: true }).click();
    await page.getByRole('link', { name: 'Volver al inicio', exact: true }).click();
    await expect(page).toHaveURL(/#participar$/);
    await page.goto(winningPrivateUrl);
    await expect(page.locator('#coupon-status')).toHaveText('Canjeado');
    await page.getByRole('link', { name: 'Volver a Mis cupones', exact: true }).click();
    await expect(page.locator('#wallet-dialog')).toBeVisible();
    await expect(page.locator('.wallet-item').filter({ hasText: code })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(`${config.publicUrl}/admin.html#redeem=${code}`);
    await expect(page.locator('#redeem-dialog')).toBeVisible();
    await page.locator('#redeem-dialog').getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(page.locator('#redeem-dialog')).not.toBeVisible();
    const loggedOutContext = await browser.newContext();
    const loginPage = await loggedOutContext.newPage();
    await loginPage.goto(`${config.publicUrl}/admin.html`);
    await loginPage.getByRole('link', { name: /Volver a la experiencia/ }).click();
    await expect(loginPage).toHaveURL(`${config.publicUrl}/`);
    await loggedOutContext.close();
    await page.bringToFront();
    expect((await app.game.dashboard()).totals).toEqual(before);
  });

  await check('Publication review is explicit and settings feedback spans the form below its save button', async () => {
    const original = structuredClone(app.store.state.settings);
    const production = config.production;
    try {
      await app.store.transaction((state) => { state.settings.campaignActive = false; state.settings.promotionReviewed = false; state.settings.promotionReviewedAt = null; });
      config.production = true;
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(`${config.publicUrl}/admin.html#settings`);
      await expect(page.locator('#setting-reviewed')).not.toBeChecked();
      await page.locator('#setting-contact').fill('contacto@example.invalid');
      await page.locator('#setting-active').check();
      expectedSettingsFailure = true;
      await page.getByRole('button', { name: 'Guardar la experiencia' }).click();
      await expect(page.locator('#settings-message')).toContainText('revisaste las bases');
      expectedSettingsFailure = false;
      expect(app.store.state.settings.campaignActive).toBe(false);
      await page.locator('#settings-message').evaluate((node) => { node.textContent = 'Confirma las bases, el contacto de la promoción y el inventario antes de activar la campaña pública.'; });
      for (const width of [1366, 800, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const boxes = await page.evaluate(() => ({
          form: document.getElementById('settings-form').getBoundingClientRect().toJSON(),
          button: document.querySelector('.settings-submit button').getBoundingClientRect().toJSON(),
          message: document.getElementById('settings-message').getBoundingClientRect().toJSON(),
        }));
        expect(boxes.message.width).toBeGreaterThanOrEqual(boxes.form.width * .95);
        expect(boxes.message.top).toBeGreaterThanOrEqual(boxes.button.bottom + 8);
        expect(boxes.message.height).toBeLessThan(180);
        await noOverflow();
        if (width === 1366 || width === 390) await page.screenshot({ path: join(artifacts, `settings-feedback-${width}.png`), fullPage: true });
      }
      await page.locator('#setting-reviewed').check();
      await page.getByRole('button', { name: 'Guardar la experiencia' }).click();
      await expect(page.locator('#settings-message')).toContainText('actualizó correctamente');
      await expect(page.locator('#promotion-review-status')).toContainText('Confirmación guardada');
      expect(app.store.state.settings.campaignActive).toBe(true);
    } finally {
      expectedSettingsFailure = false;
      config.production = production;
      await app.store.transaction((state) => { state.settings = original; });
    }
    for (const [hash, dialog] of [['bases', 'rules-dialog'], ['privacidad', 'privacy-dialog']]) {
      await page.goto(`${config.publicUrl}/#${hash}`);
      await expect(page.locator(`#${dialog}`)).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await page.goto(`${config.publicUrl}/#premios`);
    await expect(page.locator('.section-heading__aside strong')).toHaveText('Un detalle, un antojo, una sorpresa.');
    await expect(page.locator('.section-heading__aside br')).toHaveCount(0);
  });

  await check('A private test winner stays clearly noncommercial on phone, download, wallet and admin validation', async () => {
    const { testCoupons, ...before } = structuredClone(app.store.state);
    const held = await app.game.createTestWinner();
    await page.goto(`${config.publicUrl}/cupon.html?test=${held.code}#${held.token}`);
    await expect(page.locator('#coupon-status')).toContainText('Ganador de prueba');
    await expect(page.locator('#coupon-expiry')).toContainText('NO CANJEABLE');
    await expect(page.locator('#coupon-description')).toContainText('sin vencimiento');
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (width === 390) await page.screenshot({ path: join(artifacts, 'held-winner-phone.png'), fullPage: true });
    }
    const download = page.waitForEvent('download');
    await page.locator('#download-coupon').click();
    expect((await download).suggestedFilename()).toBe(`los-olivos-${held.code}.png`);
    await page.locator('#coupon-wallet-button').click();
    await expect(page.locator('#wallet-dialog')).toBeVisible();
    await expect(page.locator('.wallet-item').filter({ hasText: held.code })).toContainText('Prueba · sin canje');
    await page.goto(`${config.publicUrl}/admin.html?test=${held.code}#redeem=${held.code}`);
    await expect(page.locator('#redeem-dialog')).toBeVisible();
    await expect(page.locator('#confirm-redeem')).toBeHidden();
    await expect(page.locator('#redeem-message')).toContainText('no permite canjes reales');
    const { testCoupons: current, ...after } = app.store.state;
    expect(current).toHaveLength(1);
    expect(current[0].status).toBe('active');
    expect(after).toEqual(before);
  });

  expect(errors.filter((text) => !/Failed to load resource:.*429/.test(text))).toEqual([]);
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ browser: `Google Chrome ${browser.version()}`, checks: results, uncaughtErrors: errors.filter((text) => !text.includes('Failed to load resource')), generatedAt: new Date().toISOString() }, null, 2));
  console.log(`\n${results.length} browser checks passed. Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
