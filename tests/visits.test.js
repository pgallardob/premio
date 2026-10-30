import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { validateState } from '../server/store.js';
import { createApiRouter } from '../server/api.js';

const password = randomBytes(20).toString('hex');
const passwordHash = await hashPassword(password);
const TEN_MINUTES = 600_000;

async function fixture(t, settings = {}, production = false) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-visits-'));
  let now = Date.parse('2026-10-30T18:00:00Z');
  const config = { dataDir: directory, publicUrl: 'http://localhost', adminPasswordHash: passwordHash,
    deviceSecret: randomBytes(32).toString('hex'), clock: () => now, production,
    promotionContact: 'Verification only', promotionReviewed: true,
    initialSettings: { campaignActive: true, presenceRequired: true, ...settings }, initialInventory: { opener: 2 } };
  let app;
  async function start() {
    app = await createApplication(config);
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); });
  function client() {
    const cookies = new Map();
    let csrf;
    const call = async (path, { body, headers, ...options } = {}) => {
      const response = await fetch(`${config.publicUrl}${path}`, { ...options,
        headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body) });
      for (const item of response.headers.getSetCookie()) {
        const [name, value] = item.split(';')[0].split('=');
        cookies.set(name, value);
      }
      const data = response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: response.status, data, headers: response.headers };
    };
    call.create = () => call('/api/visits', { method: 'POST', body: {} });
    call.participate = (visitId, key = randomUUID(), body = {}) => call('/api/participations', { method: 'POST',
      headers: { 'Idempotency-Key': key }, body: { ...(visitId ? { visitId } : {}), ...body } });
    call.login = () => call('/api/admin/login', { method: 'POST', body: { password } });
    call.approve = (id, body = { present: true }, headers = {}) => call(`/api/admin/visits/${id}/approve`, { method: 'POST', body, headers });
    return call;
  }
  const visitor = client();
  const admin = client();
  await visitor('/api/status');
  await admin.login();
  return { get app() { return app; }, visitor, admin, client, config, advance: (ms) => { now += ms; },
    restart: async () => { await app.close(); await start(); } };
}

test('a public link, pending code and QR cannot participate or approve; repeated requests reuse one visit', async (t) => {
  const f = await fixture(t);
  const before = structuredClone(f.app.store.state);
  assert.equal((await f.visitor('/api/status')).data.rules.presenceRequired, true);
  assert.equal((await f.visitor.participate()).data.error.code, 'VISIT_REQUIRED');
  const first = (await f.visitor.create()).data;
  assert.equal(first.required, true);
  assert.equal(first.cooldownUntil, null);
  assert.equal(first.visit.status, 'pending');
  assert.match(first.visit.code, /^VIS-[A-F0-9]{8}$/);
  assert.equal(Date.parse(first.visit.expiresAt) - Date.parse(first.visit.createdAt), TEN_MINUTES);
  assert.deepEqual((await f.visitor.create()).data, first);
  assert.equal((await f.visitor.participate(first.visit.id)).data.error.code, 'VISIT_REQUIRED');
  assert.equal((await f.visitor.approve(first.visit.id)).status, 401);
  assert.equal((await f.visitor(`/api/admin/visits/${first.visit.id}`)).status, 401);
  const qr = await f.visitor(`/api/visits/${first.visit.id}/qr`);
  assert.equal(qr.status, 200);
  assert.equal(qr.data.subarray(1, 4).toString(), 'PNG');
  assert.equal((await f.visitor(`/api/visits/${first.visit.code}/qr`)).status, 404);
  assert(!JSON.stringify(first).includes('deviceHash'));
  assert.equal(f.app.store.state.visits.length, 1);
  assert.equal(f.app.store.state.totalParticipations, before.totalParticipations);
  assert.deepEqual(f.app.store.state.inventory, before.inventory);
  assert.deepEqual(f.app.store.state.audit, before.audit);
});

test('staff must attest explicitly with session, CSRF and allowed origin; approval itself never participates', async (t) => {
  const f = await fixture(t);
  const visit = (await f.visitor.create()).data.visit;
  for (const body of [{}, { present: false }, { present: 'true' }, { present: true, approved: true }]) {
    assert.equal((await f.admin.approve(visit.id, body)).status, 400);
  }
  assert.equal((await f.admin.approve(visit.id, { present: true }, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await f.admin.approve(visit.id, { present: true }, { Origin: 'https://evil.example' })).status, 403);
  const lookedUp = await f.admin(`/api/admin/visits/${visit.code.toLowerCase().replace('vis-', 'VIS-')}`);
  assert.equal(lookedUp.data.status, 'pending');
  const approved = await f.admin.approve(visit.id, { present: true }, { Origin: f.config.publicUrl });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, 'approved');
  assert(!JSON.stringify(approved.data).includes('deviceHash'));
  f.advance(60_000);
  assert.deepEqual((await f.admin.approve(visit.id)).data, approved.data);
  assert.equal(f.app.store.state.audit.filter((entry) => entry.action === 'visit_approved').length, 1);
  assert.equal(f.app.store.state.totalParticipations, 0);
  assert.equal(f.app.store.state.inventory.opener, 2);
  assert.equal((await f.visitor('/api/visits/current')).data.visit.status, 'approved');
});

test('an approved ID cannot be borrowed or cancelled by another browser, including a fresh device', async (t) => {
  const f = await fixture(t);
  const visit = (await f.visitor.create()).data.visit;
  await f.admin.approve(visit.id);
  const stranger = f.client();
  assert.equal((await stranger('/api/visits/current')).data.visit, null);
  assert.equal((await stranger.participate(visit.id)).data.error.code, 'VISIT_REQUIRED');
  assert.equal((await stranger('/api/visits/cancel', { method: 'POST', body: { visitId: visit.id } })).status, 200);
  assert.equal((await f.visitor('/api/visits/current')).data.visit.id, visit.id);
  const key = randomUUID();
  const accepted = await f.visitor.participate(visit.id, key);
  assert.equal(accepted.data.id, 1);
  assert.equal((await stranger.participate(visit.id, key)).data.error.code, 'VISIT_REQUIRED');
  assert.equal(f.app.store.state.totalParticipations, 1);
  assert.equal(f.app.store.state.participations[0].visitId, visit.id);
});

test('database transaction consumes a pass once even without cooldown; same-key races return one original result', async (t) => {
  const f = await fixture(t, { cooldownEnabled: false });
  const visit = (await f.visitor.create()).data.visit;
  const approvals = await Promise.all(Array.from({ length: 6 }, () => f.admin.approve(visit.id)));
  assert(approvals.every((item) => item.status === 200));
  const results = await Promise.all(Array.from({ length: 10 }, () => f.visitor.participate(visit.id)));
  assert.equal(results.filter((item) => item.status === 200).length, 1);
  assert(results.filter((item) => item.status !== 200).every((item) => item.data.error.code === 'VISIT_REQUIRED'));
  assert.equal((await f.admin.approve(visit.id)).data.error.code, 'VISIT_USED');
  const next = (await f.visitor.create()).data.visit;
  assert.notEqual(next.id, visit.id);
  await f.admin.approve(next.id);
  const key = randomUUID();
  const same = await Promise.all(Array.from({ length: 10 }, () => f.visitor.participate(next.id, key)));
  assert(same.every((item) => item.status === 200 && item.data.id === 2));
  assert.equal(same.filter((item) => !item.data.replayed).length, 1);
  assert.equal(f.app.store.state.totalParticipations, 2);
  assert.equal(f.app.store.state.audit.filter((item) => item.action === 'visit_approved').length, 2);
});

test('pending and approved visits expire at their exact boundary and cannot be extended by replay', async (t) => {
  const f = await fixture(t);
  const pending = (await f.visitor.create()).data.visit;
  f.advance(TEN_MINUTES);
  assert.equal((await f.admin.approve(pending.id)).data.error.code, 'VISIT_NOT_FOUND');
  assert.equal((await f.visitor('/api/visits/current')).data.visit, null);
  const visit = (await f.visitor.create()).data.visit;
  f.advance(TEN_MINUTES - 1);
  const approved = (await f.admin.approve(visit.id)).data;
  assert.equal(Date.parse(approved.expiresAt) - Date.parse(approved.approvedAt), TEN_MINUTES);
  f.advance(TEN_MINUTES);
  assert.equal((await f.visitor.participate(visit.id)).data.error.code, 'VISIT_REQUIRED');
  assert.equal((await f.admin.approve(visit.id)).status, 404);
  assert.equal((await f.visitor(`/api/visits/${visit.id}/qr`)).status, 404);
  assert.equal(f.app.store.state.totalParticipations, 0);
});

test('pause, stock, readiness and daily-code rejections do not consume an approved visit', async (t) => {
  const f = await fixture(t);
  const visit = (await f.visitor.create()).data.visit;
  await f.admin.approve(visit.id);
  await f.app.game.updateSettings({ campaignActive: false });
  assert.equal((await f.visitor.participate(visit.id)).data.error.code, 'CAMPAIGN_PAUSED');
  assert.equal((await f.visitor.create()).data.error.code, 'CAMPAIGN_PAUSED');
  await f.app.game.updateSettings({ campaignActive: true, dailyCodeEnabled: true, dailyCode: 'LOCAL-2026' });
  assert.equal((await f.visitor.participate(visit.id)).data.error.code, 'DAILY_CODE_REQUIRED');
  await f.app.game.updateInventory('opener', { stock: 0 });
  assert.equal((await f.visitor.participate(visit.id)).data.error.code, 'OUT_OF_STOCK');
  assert.equal((await f.visitor.create()).data.error.code, 'OUT_OF_STOCK');
  await f.app.game.updateInventory('opener', { stock: 2 });
  f.config.production = true;
  await f.app.store.transaction((state) => { state.settings.promotionReviewed = false; });
  assert.equal((await f.visitor.participate(visit.id)).data.error.code, 'PROMOTION_NOT_READY');
  assert.equal((await f.visitor.create()).data.error.code, 'PROMOTION_NOT_READY');
  assert.equal(f.app.store.state.visits[0].status, 'approved');
  assert.equal(f.app.store.state.totalParticipations, 0);
  await f.app.game.updateSettings({ promotionReviewed: true });
  assert.equal((await f.visitor.participate(visit.id, randomUUID(), { dailyCode: 'LOCAL-2026' })).status, 200);
});

test('accepted-result recovery survives expiry, pause and restart; cooldown still requires a new visit after 24 hours', async (t) => {
  const f = await fixture(t);
  const visit = (await f.visitor.create()).data.visit;
  await f.admin.approve(visit.id);
  const key = randomUUID();
  assert.equal((await f.visitor.participate(visit.id, key)).status, 200);
  const blocked = await f.visitor.create();
  assert.equal(blocked.data.error.code, 'COOLDOWN');
  assert.equal(Number(blocked.headers.get('retry-after')), 86400);
  const until = (await f.visitor('/api/visits/current')).data.cooldownUntil;
  assert.equal(until, blocked.data.error.retryAt);
  f.advance(TEN_MINUTES);
  await f.restart();
  assert.equal((await f.visitor.participate(undefined, key)).data.replayed, true);
  await f.app.game.updateSettings({ campaignActive: false });
  assert.equal((await f.visitor.participate(undefined, key)).data.id, 1);
  await f.app.game.updateSettings({ campaignActive: true });
  f.advance(86_400_000 - TEN_MINUTES - 1);
  assert.equal((await f.visitor.create()).data.error.code, 'COOLDOWN');
  f.advance(1);
  assert.equal((await f.visitor.participate()).data.error.code, 'VISIT_REQUIRED');
  const next = (await f.visitor.create()).data.visit;
  assert.equal(next.status, 'pending');
  assert.equal(f.app.store.state.totalParticipations, 1);
});

test('owner review is renewed for prospective eligibility changes without resetting old entries or stock', async (t) => {
  const f = await fixture(t, { presenceRequired: false }, true);
  const key = randomUUID();
  await f.visitor.participate(undefined, key);
  const before = structuredClone(f.app.store.state);
  assert.equal((await f.visitor.create()).data.error.code, 'VISITS_DISABLED');
  await assert.rejects(f.app.game.updateSettings({ presenceRequired: true }), /revisaste las bases/);
  assert.deepEqual(f.app.store.state, before);
  f.advance(1000);
  const settings = await f.app.game.updateSettings({ presenceRequired: true, promotionReviewed: true });
  assert.equal(settings.presenceRequired, true);
  assert.equal(typeof settings.promotionReviewedAt, 'string');
  assert.equal(settings.campaignActive, true);
  assert.deepEqual(f.app.store.state.participations, before.participations);
  assert.deepEqual(f.app.store.state.inventory, before.inventory);
  assert.equal((await f.visitor.participate(undefined, key)).data.replayed, true);
  assert.equal((await f.client().participate()).data.error.code, 'VISIT_REQUIRED');
});

test('only the owning browser cancels unused requests, while used passes remain consumed', async (t) => {
  const f = await fixture(t, { cooldownEnabled: false });
  let visit = (await f.visitor.create()).data.visit;
  await f.admin.approve(visit.id);
  const cancel = (id) => f.visitor('/api/visits/cancel', { method: 'POST', body: { visitId: id } });
  assert.equal((await cancel(visit.id)).status, 200);
  assert.equal((await cancel(visit.id)).status, 200);
  assert.equal((await f.visitor.participate(visit.id)).data.error.code, 'VISIT_REQUIRED');
  visit = (await f.visitor.create()).data.visit;
  await f.admin.approve(visit.id);
  await f.visitor.participate(visit.id);
  await cancel(visit.id);
  assert.equal((await f.visitor('/api/visits/current')).data.visit.status, 'used');
  assert.equal(f.app.store.state.totalParticipations, 1);
  assert.equal((await f.visitor('/api/visits', { method: 'POST', body: { approved: true } })).status, 400);
  assert.equal((await cancel('invalid')).status, 400);
});

test('visit retention is bounded and expired requests free capacity without changing participation history', async (t) => {
  const f = await fixture(t);
  const template = structuredClone((await f.visitor.create()).data.visit);
  await f.app.store.transaction((state) => {
    state.visits = Array.from({ length: 1000 }, (_, i) => ({ ...template,
      id: i.toString(16).padStart(32, '0'), code: `VIS-${i.toString(16).padStart(8, '0').toUpperCase()}`, deviceHash: i.toString(16).padStart(64, '0') }));
  });
  assert.equal((await f.visitor.create()).data.error.code, 'RATE_LIMITED');
  f.advance(TEN_MINUTES);
  assert.equal((await f.visitor.create()).status, 200);
  assert.equal(f.app.store.state.visits.length, 1);
  assert.equal(f.app.store.state.totalParticipations, 0);
  assert.equal(f.app.store.state.inventory.opener, 2);
});

test('legacy state remains compatible while malformed visit records fail closed', async (t) => {
  const f = await fixture(t);
  const visit = (await f.visitor.create()).data.visit;
  const state = structuredClone(f.app.store.state);
  delete state.visits;
  delete state.settings.presenceRequired;
  assert.doesNotThrow(() => validateState(state));
  for (const changes of [{ status: 'approved' }, { status: 'used', usedAt: visit.createdAt },
    { deviceHash: 'not-a-hash' }, { expiresAt: visit.createdAt }, { code: 'VIS-INVALID' }]) {
    const invalid = structuredClone(f.app.store.state);
    Object.assign(invalid.visits[0], changes);
    assert.throws(() => validateState(invalid), /visita no son válidas/);
  }
});

test('visit QR encodes only the read-only staff deep-link and preserves a deployment subpath', async (t) => {
  const f = await fixture(t);
  const visit = (await f.visitor.create()).data.visit;
  let encoded;
  const route = createApiRouter({ game: f.app.game, auth: {}, limiter: { take: async () => {} },
    qr: async (text) => { encoded = text; return Buffer.from('qr-fixture'); }, config: { publicUrl: 'https://example.invalid/premio' } });
  const response = { writeHead: () => {}, end: () => {} };
  await route({ method: 'GET', headers: {} }, response, `/api/visits/${visit.id}/qr`, 'fixture');
  assert.equal(encoded, `https://example.invalid/premio/admin.html#visit=${visit.id}`);
  assert.equal(f.app.store.state.visits[0].status, 'pending');
  assert.equal(f.app.store.state.totalParticipations, 0);
});
