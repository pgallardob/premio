import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

// All approvals and participations here belong to an isolated local fixture, never the live campaign.
const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-visits-browser-'));
const artifacts = resolve(process.env.ARTIFACTS_DIR ?? 'artifacts/visits');
await mkdir(artifacts, { recursive: true });
const password = randomBytes(20).toString('hex');
let now = Date.now();
const config = { dataDir: directory, publicUrl: 'http://localhost', production: true, clock: () => now,
  adminPasswordHash: await hashPassword(password), deviceSecret: randomBytes(32).toString('hex'),
  promotionContact: 'Verification only', promotionReviewed: true,
  initialSettings: { campaignActive: true }, initialInventory: { opener: 2 } };
const app = await createApplication(config);
const checks = [];
const errors = [];
let browser;
const check = async (label, run) => { await run(); checks.push(label); console.log(`PASS ${label}`); };
const noOverflow = async (page) => {
  const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(layout.content).toBeLessThanOrEqual(layout.width);
};

try {
  await new Promise((resolveListen) => app.server.listen(0, '127.0.0.1', resolveListen));
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const adminContext = await browser.newContext({ viewport: { width: 1366, height: 700 }, reducedMotion: 'reduce' });
  const customer = await customerContext.newPage();
  const admin = await adminContext.newPage();
  for (const page of [customer, admin]) page.on('pageerror', (error) => errors.push(error.message));

  await check('Owner must reconfirm published rules before enabling the visit gate; no counters reset', async () => {
    await admin.goto(`${config.publicUrl}/admin.html#settings`);
    await admin.locator('#admin-password').fill(password);
    await admin.locator('#login-button').click();
    await expect(admin.locator('#panel-settings')).toBeVisible();
    await expect(admin.locator('#setting-reviewed')).toBeChecked();
    await admin.locator('#setting-presence').check();
    await expect(admin.locator('#setting-reviewed')).not.toBeChecked();
    await admin.locator('#settings-form button[type="submit"]').click();
    await expect(admin.locator('#settings-message')).toContainText('revisaste las bases');
    expect(app.store.state.settings.presenceRequired).toBe(false);
    await admin.locator('#setting-reviewed').check();
    await admin.locator('#settings-form button[type="submit"]').click();
    await expect(admin.locator('#settings-message')).toContainText('actualizó correctamente');
    expect(app.store.state.settings.presenceRequired).toBe(true);
    expect(app.store.state.settings.campaignActive).toBe(true);
    expect(app.store.state.totalParticipations).toBe(0);
    expect(app.store.state.inventory.opener).toBe(2);
  });

  let code;
  let visitId;
  await check('Customer requests a ten-minute code without purchase or participation, at four responsive widths', async () => {
    await customer.goto(config.publicUrl);
    await expect(customer.locator('#participate-button')).toHaveText(/Validar mi visita/);
    await expect(customer.locator('#participation-guidance')).toContainText('no requiere compra');
    await customer.locator('#participate-button').click();
    await expect(customer.locator('#visit-dialog')).toBeVisible();
    await expect(customer.locator('#visit-continue')).toBeHidden();
    code = await customer.locator('#visit-code').textContent();
    expect(code).toMatch(/^VIS-[A-F0-9]{8}$/);
    visitId = app.store.state.visits.find((visit) => visit.code === code).id;
    await customer.locator('#visit-qr').evaluate((image) => image.decode());
    for (const [width, height] of [[320, 700], [390, 844], [800, 600], [1366, 596]]) {
      await customer.setViewportSize({ width, height });
      await noOverflow(customer);
      await expect(customer.locator('#visit-code')).toBeVisible();
      await expect(customer.locator('#visit-cancel')).toBeVisible();
      if (width === 390) await customer.screenshot({ path: join(artifacts, 'customer-pending-390.png') });
    }
    expect(app.store.state.totalParticipations).toBe(0);
    expect(app.store.state.inventory.opener).toBe(2);
    await customer.setViewportSize({ width: 390, height: 844 });
  });

  await check('Staff lookup and QR deep-link require explicit presence confirmation; approval does not play', async () => {
    await admin.locator('[data-panel="visits"]').click();
    await admin.locator('#visit-lookup-code').fill(code.toLowerCase());
    await admin.locator('#visit-lookup-form button[type="submit"]').click();
    await expect(admin.locator('#visit-approval-code')).toHaveText(code);
    await expect(admin.locator('#visit-approve')).toBeDisabled();
    await admin.locator('#visit-approval-dialog [data-close-dialog]').click();
    // This is the exact destination encoded by the QR; lookup remains read-only.
    await admin.goto(`${config.publicUrl}/admin.html#visit=${visitId}`);
    await expect(admin.locator('#visit-approval-dialog')).toBeVisible();
    await expect(admin.locator('#visit-present')).not.toBeChecked();
    for (const width of [320, 390, 1366]) {
      await admin.setViewportSize({ width, height: width < 600 ? 844 : 700 });
      await noOverflow(admin);
      await expect(admin.locator('#visit-approve')).toBeVisible();
      if (width === 390) await admin.screenshot({ path: join(artifacts, 'staff-confirmation-390.png') });
    }
    expect(app.store.state.visits[0].status).toBe('pending');
    await admin.locator('#visit-present').check();
    await admin.locator('#visit-approve').click();
    await expect(admin.locator('#visit-approval-message')).toContainText('ya autorizada');
    expect(app.store.state.totalParticipations).toBe(0);
    await expect(customer.locator('#visit-continue')).toBeVisible({ timeout: 12_000 });
    await customer.screenshot({ path: join(artifacts, 'customer-approved-390.png') });
    await customer.locator('#visit-continue').click();
    await expect(customer.locator('#participation-receipt')).toContainText('#000001');
    expect(app.store.state.totalParticipations).toBe(1);
    expect(app.store.state.visits[0].status).toBe('used');
    await customer.locator('#result-dialog [aria-label="Cerrar resultado"]').click();
    await expect(customer.locator('#participate-button')).toHaveText(/Vuelve en 24 horas/);
    await expect(customer.locator('#participate-button')).toBeDisabled();
    await admin.locator('#visit-approval-dialog [data-close-dialog]').click();
  });

  await check('A lost accepted response is recovered after reload and visit expiry, without a duplicate or second approval', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(config.publicUrl);
    await page.locator('#participate-button').click();
    const pendingCode = await page.locator('#visit-code').textContent();
    await admin.locator('#visit-lookup-code').fill(pendingCode);
    await admin.locator('#visit-lookup-form button[type="submit"]').click();
    await admin.locator('#visit-present').check();
    await admin.locator('#visit-approve').click();
    await expect(admin.locator('#visit-approval-message')).toContainText('ya autorizada');
    await expect(page.locator('#visit-continue')).toBeVisible({ timeout: 12_000 });
    await page.route('**/api/participations', async (route) => {
      const accepted = await route.fetch();
      expect(accepted.status()).toBe(200);
      await route.abort('connectionreset');
    }, { times: 1 });
    await page.locator('#visit-continue').click();
    await expect(page.locator('#participation-message')).not.toBeEmpty();
    expect(app.store.state.totalParticipations).toBe(2);
    now += 600_000;
    await page.reload();
    await expect(page.locator('#participate-button')).toHaveText(/Recuperar mi resultado/);
    await expect(page.locator('#participate-button')).toBeEnabled();
    await page.locator('#participate-button').click();
    await expect(page.locator('#participation-receipt')).toContainText('#000002');
    expect(app.store.state.totalParticipations).toBe(2);
    expect(await page.evaluate(() => sessionStorage.getItem('olivos_pending_participation'))).toBe(null);
    await context.close();
    await admin.locator('#visit-approval-dialog [data-close-dialog]').click();
  });

  await check('Cancellation removes only the requesting browser pass and expiry offers a fresh request', async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(config.publicUrl);
    await page.locator('#participate-button').click();
    await expect(page.locator('#visit-code')).toHaveText(/^VIS-/);
    const oldCode = await page.locator('#visit-code').textContent();
    await page.locator('#visit-cancel').click();
    await expect(page.locator('#visit-dialog')).toBeHidden();
    expect(app.store.state.visits.some((visit) => visit.code === oldCode)).toBe(false);
    await page.locator('#participate-button').click();
    now += 600_000;
    await expect(page.locator('#visit-code')).toHaveText('Solicitud vencida', { timeout: 12_000 });
    await expect(page.locator('#visit-continue')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.locator('#participate-button').click();
    await expect(page.locator('#visit-code')).toHaveText(/^VIS-/);
    expect(app.store.state.totalParticipations).toBe(2);
    await context.close();
  });

  expect(errors).toEqual([]);
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ browser: `Google Chrome ${browser.version()}`, checks, uncaughtErrors: errors, isolated: true }, null, 2));
  console.log(`Verified ${checks.length} visit browser groups; live data untouched.`);
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true });
}
