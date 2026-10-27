import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApplication } from '../server/app.js';
import { FileStore } from '../server/store.js';
import { hashPassword } from '../server/auth.js';

const password = randomBytes(20).toString('hex');
const passwordHash = await hashPassword(password);

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-api-'));
  let now = Date.parse('2026-10-27T15:00:00Z');
  const config = { dataDir: directory, publicUrl: 'http://localhost', adminPasswordHash: passwordHash, deviceSecret: randomBytes(32).toString('hex'), clock: () => now,
    initialSettings: { campaignActive: true, cooldownEnabled: false }, initialInventory: { refreshment: 12, snack: 10, coffee: 8 } };
  const app = await createApplication(config);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const client = () => {
    const jar = new Map();
    let csrf = '';
    const call = async (path, options = {}) => {
      const response = await fetch(`${config.publicUrl}${path}`, {
        ...options,
        headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...options.headers },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      for (const value of response.headers.getSetCookie()) {
        const [name, ...parts] = value.split(';')[0].split('=');
        jar.set(name, parts.join('='));
      }
      const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: response.status, headers: response.headers, data };
    };
    call.participate = (key = randomUUID(), body = {}) => call('/api/participations', { method: 'POST', headers: { 'Idempotency-Key': key }, body });
    call.login = () => call('/api/admin/login', { method: 'POST', body: { password } });
    call.jar = jar;
    return call;
  };
  const visitor = client();
  await visitor('/api/status');
  const admin = client();
  await admin.login();
  return { app, config, directory, visitor, admin, client, advance: (milliseconds) => { now += milliseconds; } };
}

test('default contract: page views do not count and exactly participation 20 wins', async (t) => {
  const { visitor, admin } = await fixture(t);
  const status = await visitor('/api/status');
  assert.equal(status.data.rules.interval, 20);
  assert.equal(status.data.rules.expiryDays, 5);
  assert.equal(Object.hasOwn(status.data, 'testMode'), false);
  assert.equal(status.data.prizes.length, 3);
  assert.equal((await admin('/api/admin/dashboard')).data.totals.participations, 0);
  for (let index = 1; index <= 20; index += 1) {
    const result = await visitor.participate();
    assert.equal(result.status, 200);
    assert.equal(result.data.id, index);
    assert.equal(result.data.won, index === 20);
    if (index < 20) assert.equal(result.data.coupon, null);
    else {
      assert.match(result.data.coupon.code, /^OLV-[A-F0-9]{12}$/);
      assert.match(result.data.coupon.token, /^[a-f0-9]{64}$/);
      assert.equal(Date.parse(result.data.coupon.expiresAt) - Date.parse(result.data.coupon.issuedAt), 5 * 86_400_000);
      assert.equal(result.data.coupon.status, 'active');
    }
  }
});

test('40 concurrent participations create two winners and never oversubscribe inventory', async (t) => {
  const { visitor, admin } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 40 }, () => visitor.participate()));
  assert(results.every((result) => result.status === 200));
  const winners = results.filter((result) => result.data.won);
  assert.equal(winners.length, 2);
  assert.deepEqual(winners.map((item) => item.data.id).sort((a, b) => a - b), [20, 40]);
  assert.equal(new Set(winners.map((item) => item.data.coupon.code)).size, 2);
  const { data } = await admin('/api/admin/dashboard');
  assert.equal(data.totals.participations, 40);
  assert.equal(data.totals.stock, 28);
  assert.equal(data.cycleProgress, 0);
});

test('repeated concurrent idempotency keys record one participation even with cooldown enabled', async (t) => {
  const { visitor, admin } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { cooldownEnabled: true } });
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 10 }, () => visitor.participate(key)));
  assert(results.every((result) => result.status === 200 && result.data.id === 1));
  assert.equal(results.filter((result) => !result.data.replayed).length, 1);
  assert.equal((await admin('/api/admin/dashboard')).data.totals.participations, 1);
});

test('cooldown is enforced server-side for a full rolling 24 hours', async (t) => {
  const { visitor, admin, advance } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { cooldownEnabled: true } });
  assert.equal((await visitor.participate()).status, 200);
  const blocked = await visitor.participate();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.error.code, 'COOLDOWN');
  assert.equal(Number(blocked.headers.get('retry-after')), 86400);
  advance(86_400_000 - 1);
  assert.equal((await visitor.participate()).status, 429);
  advance(1);
  assert.equal((await visitor.participate()).status, 200);
});

test('one coupon can be redeemed only once, including simultaneous requests', async (t) => {
  const { visitor, admin } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 2 } });
  await visitor.participate();
  const coupon = (await visitor.participate()).data.coupon;
  const before = (await admin('/api/admin/dashboard')).data.totals.stock;
  const calls = await Promise.all([1, 2].map(() => admin(`/api/admin/coupons/${coupon.code}/redeem`, { method: 'POST', body: {} })));
  assert.deepEqual(calls.map((result) => result.status).sort(), [200, 409]);
  assert.equal(calls.find((result) => result.status === 409).data.error.code, 'COUPON_REDEEMED');
  const after = (await admin('/api/admin/dashboard')).data;
  assert.equal(after.totals.stock, before);
  assert.equal(after.totals.redeemed, 1);
  assert.equal((await visitor(`/api/coupons/${coupon.token}`)).data.status, 'redeemed');
});

test('expiry returns a reservation exactly once and expired coupons cannot be redeemed', async (t) => {
  const { visitor, admin, advance } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 2 } });
  await visitor.participate();
  const coupon = (await visitor.participate()).data.coupon;
  assert.equal((await admin('/api/admin/dashboard')).data.totals.stock, 29);
  advance(5 * 86_400_000);
  await admin.login();
  assert.equal((await visitor(`/api/coupons/${coupon.token}`)).data.status, 'expired');
  assert.equal((await admin('/api/admin/dashboard')).data.totals.stock, 30);
  assert.equal((await visitor(`/api/coupons/${coupon.token}`)).data.status, 'expired');
  assert.equal((await admin('/api/admin/dashboard')).data.totals.stock, 30);
  const redeemed = await admin(`/api/admin/coupons/${coupon.code}/redeem`, { method: 'POST', body: {} });
  assert.equal(redeemed.status, 409);
  assert.equal(redeemed.data.error.code, 'COUPON_EXPIRED');
});

test('wallet ownership is isolated; public codes cannot enumerate private coupons', async (t) => {
  const { visitor, admin, client } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 2 } });
  await visitor.participate();
  const coupon = (await visitor.participate()).data.coupon;
  assert.equal((await visitor('/api/wallet')).data.coupons.length, 1);
  const stranger = client();
  assert.equal((await stranger('/api/wallet')).data.coupons.length, 0);
  assert.equal((await stranger(`/api/coupons/${coupon.code}`)).status, 404);
  assert.equal((await stranger(`/api/coupons/${'0'.repeat(64)}`)).status, 404);
  assert.equal((await stranger(`/api/coupons/${coupon.token}`)).status, 200);
  const qr = await stranger(`/api/coupons/${coupon.token}/qr`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal(qr.data.subarray(1, 4).toString(), 'PNG');
});

test('private links can be bookmarked across browsers without transferring ownership or changing redemption', async (t) => {
  const { visitor, admin, client, config } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 2 } });
  await visitor.participate();
  const coupon = (await visitor.participate()).data.coupon;
  const other = client();
  assert.equal((await other('/api/wallet')).data.coupons.length, 0);
  assert.equal((await other('/api/wallet/coupons', { method: 'POST', body: { token: coupon.code } })).status, 400);
  assert.equal((await other('/api/wallet/coupons', { method: 'POST', body: { token: '0'.repeat(64) } })).status, 404);
  assert.equal((await other('/api/wallet/coupons', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: { token: coupon.token } })).status, 403);
  assert.equal((await other('/api/wallet/coupons', { method: 'POST', headers: { Origin: config.publicUrl }, body: { token: coupon.token } })).status, 200);
  assert.equal((await other('/api/wallet/coupons', { method: 'POST', body: { token: coupon.token } })).status, 200);
  assert.equal((await other('/api/wallet')).data.coupons.length, 1);
  assert.equal((await visitor('/api/wallet')).data.coupons.length, 1);
  assert.equal((await client()('/api/wallet')).data.coupons.length, 0);
  const before = (await admin('/api/admin/dashboard')).data.totals;
  assert.equal(before.participations, 2);
  assert.equal(before.stock, 29);
  assert.equal(before.active, 1);
  await admin(`/api/admin/coupons/${coupon.code}/redeem`, { method: 'POST', body: {} });
  const redeemedBrowser = client();
  await redeemedBrowser('/api/wallet/coupons', { method: 'POST', body: { token: coupon.token } });
  const saved = (await redeemedBrowser('/api/wallet')).data.coupons;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'redeemed');
  assert(!JSON.stringify(saved).includes('savedBy'));
  const after = (await admin('/api/admin/dashboard')).data.totals;
  assert.equal(after.participations, 2);
  assert.equal(after.stock, 29);
  assert.equal(after.redeemed, 1);
});

test('pause and empty stock do not count rejected participations', async (t) => {
  const { visitor, admin } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { campaignActive: false } });
  assert.equal((await visitor.participate()).data.error.code, 'CAMPAIGN_PAUSED');
  await admin('/api/admin/settings', { method: 'PATCH', body: { campaignActive: true } });
  for (const prize of ['refreshment', 'snack', 'coffee']) await admin(`/api/admin/inventory/${prize}`, { method: 'PATCH', body: { stock: 0 } });
  const result = await visitor.participate();
  assert.equal(result.status, 503);
  assert.equal(result.data.error.code, 'OUT_OF_STOCK');
  assert.equal((await admin('/api/admin/dashboard')).data.totals.participations, 0);
});

test('only in-stock prizes are selected and another win cannot reserve a missing unit', async (t) => {
  const { visitor, admin } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 2 } });
  for (const id of ['refreshment', 'snack']) await admin(`/api/admin/inventory/${id}`, { method: 'PATCH', body: { stock: 0 } });
  await admin('/api/admin/inventory/coffee', { method: 'PATCH', body: { stock: 1 } });
  await visitor.participate();
  const winning = await visitor.participate();
  assert.equal(winning.data.coupon.prize.id, 'coffee');
  assert.equal((await visitor.participate()).status, 503);
  assert.equal((await admin('/api/admin/dashboard')).data.totals.stock, 0);
});

test('daily local code is verified on the server and expires on the next Chilean day', async (t) => {
  const { visitor, admin, advance } = await fixture(t);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { dailyCodeEnabled: true } })).status, 400);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { dailyCodeEnabled: true, dailyCode: 'OLIVOS-2026' } })).status, 200);
  assert.equal((await visitor.participate()).status, 403);
  assert.equal((await visitor.participate(randomUUID(), { dailyCode: 'WRONG' })).status, 403);
  assert.equal((await visitor.participate(randomUUID(), { dailyCode: 'olivos-2026' })).status, 200);
  const publicStatus = await visitor('/api/status');
  assert(!JSON.stringify(publicStatus.data).includes('OLIVOS-2026'));
  assert(!JSON.stringify(publicStatus.data).includes('dailyCodeHash'));
  advance(86_400_000);
  assert.equal((await visitor.participate(randomUUID(), { dailyCode: 'OLIVOS-2026' })).status, 403);
});

test('configuration validates types, unknown fields and cycle-boundary frequency changes', async (t) => {
  const { visitor, admin } = await fixture(t);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { interval: '2' } })).status, 400);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 0 } })).status, 400);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { admin: true } })).status, 400);
  assert.equal((await admin('/api/admin/inventory/coffee', { method: 'PATCH', body: { stock: -1 } })).status, 400);
  assert.equal((await visitor('/api/participations', { method: 'POST', body: {} })).status, 400);
  await visitor.participate();
  const result = await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 2 } });
  assert.equal(result.status, 409);
  assert.equal(result.data.error.code, 'CYCLE_IN_PROGRESS');
  assert.equal((await admin('/api/admin/dashboard')).data.settings.interval, 20);
});

test('admin sessions require cookies, CSRF and the configured origin; logout revokes access', async (t) => {
  const { admin, client, config } = await fixture(t);
  const stranger = client();
  assert.equal((await stranger('/api/admin/dashboard')).status, 401);
  const session = await admin('/api/admin/session');
  assert.match(session.data.csrfToken, /^[a-f0-9]{64}$/);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', headers: { 'X-CSRF-Token': 'wrong' }, body: { campaignActive: false } })).status, 403);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', headers: { Origin: 'https://evil.example' }, body: { campaignActive: false } })).status, 403);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', headers: { Origin: config.publicUrl }, body: { campaignActive: false } })).status, 200);
  assert.equal((await admin('/api/admin/logout', { method: 'POST', body: {} })).status, 200);
  assert.equal((await admin('/api/admin/dashboard')).status, 401);
});

test('login is rate limited and uses HttpOnly SameSite cookies, not exposed password hashes', async (t) => {
  const { client, admin } = await fixture(t);
  const loggedIn = await admin.login();
  assert.match(loggedIn.headers.get('set-cookie'), /HttpOnly/);
  assert.match(loggedIn.headers.get('set-cookie'), /SameSite=Strict/);
  assert(!JSON.stringify(loggedIn.data).includes(passwordHash));
  const attacker = client();
  const results = [];
  for (let index = 0; index < 5; index += 1) results.push(await attacker('/api/admin/login', { method: 'POST', body: { password: 'not-the-password' } }));
  assert.equal(results.at(-1).status, 429);
});

test('private server and data files cannot be downloaded; CSP forbids inline scripts and styles', async (t) => {
  const { visitor } = await fixture(t);
  for (const path of ['/.env', '/data/state.json', '/data/store.lock', '/server/index.js', '/package.json', '/laidea.md', '/assets/%2e%2e/%2e%2e/.env']) {
    assert.equal((await visitor(path)).status, 404, path);
  }
  const home = await visitor('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert(!home.headers.get('content-security-policy').includes('unsafe-inline'));
  assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await visitor('/vendor/pico.min.css')).status, 200);
  assert.equal((await visitor('/vendor/manrope-400.woff2')).status, 200);
});

test('CSV exports contain no bearer tokens or device identifiers', async (t) => {
  const { visitor, admin } = await fixture(t);
  await admin('/api/admin/settings', { method: 'PATCH', body: { interval: 2 } });
  await visitor.participate();
  const coupon = (await visitor.participate()).data.coupon;
  const csv = await admin('/api/admin/export');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  assert(csv.data.toString().includes(coupon.code));
  assert(!csv.data.toString().includes(coupon.token));
  assert(!csv.data.toString().includes('deviceHash'));
});

test('state survives restart, transaction failures roll back and a second writer is rejected', async (t) => {
  const { app, visitor, config, directory } = await fixture(t);
  await visitor.participate();
  await assert.rejects(app.store.transaction((draft) => { draft.totalParticipations = 999; throw new Error('intentional rollback'); }), /rollback/);
  assert.equal((await app.game.dashboard()).totals.participations, 1);
  const otherStore = new FileStore(directory, []);
  await assert.rejects(otherStore.initialize(), /un proceso/);
  await app.close();
  const reopened = await createApplication(config);
  t.after(() => reopened.close());
  assert.equal((await reopened.game.dashboard()).totals.participations, 1);
  await reopened.close();
  await writeFile(join(directory, 'state.json'), '{invalid-data');
  await assert.rejects(createApplication(config));
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), '{invalid-data');
});
