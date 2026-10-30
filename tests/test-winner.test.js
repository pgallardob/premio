import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { validateState } from '../server/store.js';

const password = randomBytes(20).toString('hex');
const passwordHash = await hashPassword(password);
const business = ({ testCoupons, ...state }) => structuredClone(state);

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-held-winner-'));
  let now = Date.parse('2026-10-30T16:00:00Z');
  const config = { dataDir: directory, publicUrl: 'http://localhost', adminPasswordHash: passwordHash,
    deviceSecret: randomBytes(32).toString('hex'), clock: () => now,
    initialSettings: { campaignActive: true, interval: 2 }, initialInventory: { opener: 2 } };
  const app = await createApplication(config);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); });
  const client = () => {
    const jar = new Map();
    let csrf = '';
    return async (path, { method = 'GET', body } = {}) => {
      const response = await fetch(`${config.publicUrl}${path}`, { method,
        headers: { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(';')[0].split('='); jar.set(key, value); }
      const data = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: response.status, data };
    };
  };
  return { app, client, advance: (milliseconds) => { now += milliseconds; } };
}

test('one held test winner is idempotent, distinct and does not affect any business state', async (t) => {
  const { app } = await fixture(t);
  const before = business(app.store.state);
  const coupon = await app.game.createTestWinner();
  const same = await app.game.createTestWinner();
  assert.match(coupon.code, /^TST-[A-F0-9]{12}$/);
  assert.equal(coupon.testOnly, true);
  assert.equal(coupon.expiresAt, null);
  assert.equal(coupon.status, 'active');
  assert.equal(coupon.token, same.token);
  assert.equal(app.store.state.testCoupons.length, 1);
  assert.deepEqual(business(app.store.state), before);
  assert.equal(Object.hasOwn(await app.game.status(), 'testMode'), false);
});

test('a held winner stays active for years and cannot be redeemed even by administration', async (t) => {
  const { app, client, advance } = await fixture(t);
  const coupon = await app.game.createTestWinner();
  advance(30 * 365 * 86_400_000);
  assert.equal((await app.game.getCoupon(coupon.token)).status, 'active');
  const admin = client();
  assert.equal((await admin('/api/admin/login', { method: 'POST', body: { password } })).status, 200);
  assert.equal((await admin(`/api/admin/coupons/${coupon.code}`)).data.testOnly, true);
  const blocked = await admin(`/api/admin/coupons/${coupon.code}/redeem`, { method: 'POST', body: {} });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.error.code, 'TEST_COUPON');
  assert.equal((await app.game.getCoupon(coupon.token)).status, 'active');
  assert.equal((await app.game.dashboard()).totals.stock, 2);
});

test('a test coupon can be bookmarked but remains outside commercial counts and CSV', async (t) => {
  const { app, client } = await fixture(t);
  const coupon = await app.game.createTestWinner();
  const visitor = client();
  await visitor('/api/wallet/coupons', { method: 'POST', body: { token: coupon.token } });
  const wallet = await visitor('/api/wallet');
  assert.equal(wallet.data.coupons.length, 1);
  assert.equal(wallet.data.coupons[0].testOnly, true);
  const dashboard = await app.game.dashboard();
  assert.equal(dashboard.totals.issued, 0);
  assert.equal(dashboard.totals.active, 0);
  assert.equal(dashboard.totals.participations, 0);
  const admin = client();
  await admin('/api/admin/login', { method: 'POST', body: { password } });
  assert(!(await admin('/api/admin/export')).data.includes(coupon.code));
});

test('explicit test deletion invalidates its links and bookmarks without deleting a real coupon', async (t) => {
  const { app, client } = await fixture(t);
  await app.game.participate('first', randomUUID(), {});
  const real = (await app.game.participate('second', randomUUID(), {})).coupon;
  const before = business(app.store.state);
  const coupon = await app.game.createTestWinner();
  const visitor = client();
  await visitor('/api/wallet/coupons', { method: 'POST', body: { token: coupon.token } });
  assert.throws(() => app.game.deleteTestWinner(real.code), /Solo se puede eliminar/);
  await app.game.deleteTestWinner(coupon.code);
  assert.equal((await visitor(`/api/coupons/${coupon.token}`)).status, 404);
  assert.equal((await visitor('/api/wallet')).data.coupons.length, 0);
  assert.equal((await app.game.getCoupon(real.token)).status, 'active');
  assert.deepEqual(business(app.store.state), before);
});

test('test-only data cannot be disguised as commercial or given a mutable status/expiry', async (t) => {
  const { app } = await fixture(t);
  await app.game.createTestWinner();
  for (const change of [
    (state) => { state.testCoupons[0].status = 'redeemed'; },
    (state) => { state.testCoupons[0].expiresAt = new Date().toISOString(); },
    (state) => { state.coupons.push(state.testCoupons.pop()); },
    (state) => { state.testCoupons = null; },
  ]) {
    const invalid = structuredClone(app.store.state);
    change(invalid);
    assert.throws(() => validateState(invalid));
  }
});
