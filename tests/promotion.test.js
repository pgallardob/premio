import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { validateState } from '../server/store.js';

const passwordHash = await hashPassword(randomBytes(20).toString('hex'));
const contact = 'contacto@example.invalid';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-promotion-'));
  let now = Date.parse('2026-10-30T16:00:00Z');
  const config = { production: true, dataDir: directory, publicUrl: 'https://premio.example.org',
    adminPasswordHash: passwordHash, deviceSecret: randomBytes(32).toString('hex'),
    promotionReviewed: false, promotionContact: '', initialInventory: { opener: 2 }, clock: () => now };
  let app = await createApplication(config);
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); });
  return { get app() { return app; }, config, advance: (milliseconds) => { now += milliseconds; },
    restart: async () => { await app.close(); app = await createApplication(config); } };
}

test('saving a public contact does not approve terms, activate or consume inventory', async (t) => {
  const f = await fixture(t);
  const saved = await f.app.game.updateSettings({ promotionContact: `  ${contact}  ` });
  assert.equal(saved.promotionContact, contact);
  assert.equal(saved.promotionReviewed, false);
  assert.equal(saved.promotionReviewedAt, null);
  assert.equal(saved.campaignActive, false);
  assert.equal((await f.app.game.status()).promotionContact, contact);
  assert.equal((await f.app.game.dashboard()).totals.stock, 2);
  assert.equal(f.app.store.state.totalParticipations, 0);
  assert.equal(f.app.store.state.coupons.length, 0);
});

test('production activation rejects the precise missing prerequisite without partial approval', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.app.game.updateSettings({ campaignActive: true }), /contacto/);
  await f.app.game.updateSettings({ promotionContact: contact });
  await assert.rejects(f.app.game.updateSettings({ campaignActive: true }), /revisaste las bases/);
  assert.equal(f.app.store.state.settings.campaignActive, false);
  assert.equal(f.app.store.state.settings.promotionReviewed, false);
  assert.equal(f.app.store.state.audit.length, 1);
});

test('explicit owner review and contact survive restart even when deployment defaults are false', async (t) => {
  const f = await fixture(t);
  const saved = await f.app.game.updateSettings({ promotionContact: contact, promotionReviewed: true, campaignActive: true });
  assert.equal(saved.promotionReviewed, true);
  assert.equal(saved.promotionReviewedAt, '2026-10-30T16:00:00.000Z');
  await f.restart();
  const status = await f.app.game.status();
  assert.equal(status.active, true);
  assert.equal(status.promotionContact, contact);
  assert.equal((await f.app.game.participate('reviewed-device', randomUUID(), {})).id, 1);
  assert.equal(f.config.promotionReviewed, false);
  assert.equal(f.config.promotionContact, '');
});

test('contact and published-rule changes require a fresh explicit review', async (t) => {
  const f = await fixture(t);
  const original = await f.app.game.updateSettings({ promotionContact: contact, promotionReviewed: true, campaignActive: true });
  await assert.rejects(f.app.game.updateSettings({ promotionContact: 'updated@example.invalid' }), /revisaste las bases/);
  assert.equal((await f.app.game.status()).promotionContact, contact);
  f.advance(60_000);
  const confirmed = await f.app.game.updateSettings({ promotionContact: 'updated@example.invalid', promotionReviewed: true });
  assert.notEqual(confirmed.promotionReviewedAt, original.promotionReviewedAt);
  await f.app.game.updateSettings({ campaignActive: false });
  const changed = await f.app.game.updateSettings({ expiryDays: 7 });
  assert.equal(changed.promotionReviewed, false);
  assert.equal(changed.promotionReviewedAt, null);
  await assert.rejects(f.app.game.updateSettings({ campaignActive: true }), /revisaste las bases/);
});

test('explicit rejection overrides legacy environment review and timestamps cannot be forged', async (t) => {
  const f = await fixture(t);
  f.config.promotionReviewed = true;
  f.config.promotionContact = contact;
  await f.app.game.updateSettings({ campaignActive: true });
  await f.app.game.updateSettings({ campaignActive: false, promotionReviewed: false });
  await f.restart();
  await assert.rejects(f.app.game.updateSettings({ campaignActive: true }), /revisaste las bases/);
  assert.throws(() => f.app.game.updateSettings({ promotionReviewedAt: '2000-01-01T00:00:00Z' }), /campos no permitidos/);
  assert.throws(() => f.app.game.updateSettings({ promotionReviewed: 'true' }), /verdadero o falso/);
  assert.throws(() => f.app.game.updateSettings({ promotionContact: 42 }), /contacto/);
  assert.throws(() => f.app.game.updateSettings({ promotionContact: 'x'.repeat(201) }), /contacto/);
  const invalid = structuredClone(f.app.store.state);
  invalid.settings.promotionReviewedAt = 'invalid';
  assert.throws(() => validateState(invalid), /no válidos/);
});

test('the production readiness checker uses the same persisted owner review as the application', async (t) => {
  const f = await fixture(t);
  await f.app.game.updateSettings({ promotionContact: contact, promotionReviewed: true, campaignActive: true });
  const result = spawnSync(process.execPath, ['scripts/production-check.js'], { encoding: 'utf8', env: {
    ...process.env, NODE_ENV: 'production', PUBLIC_URL: f.config.publicUrl, DATA_DIR: f.config.dataDir,
    ADMIN_PASSWORD_HASH: f.config.adminPasswordHash, DEVICE_SECRET: f.config.deviceSecret, CREDENTIALS_ROTATED: 'true',
    PROMOTION_REVIEWED: 'false', PROMOTION_CONTACT: '',
  } });
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'ready-for-live-verification');
  assert(report.checks.find((check) => check.name === 'Contacto de la promoción').ok);
});
