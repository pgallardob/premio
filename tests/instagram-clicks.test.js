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
const week = 7 * 86_400_000;

async function fixture(t, settings = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-clicks-'));
  let now = Date.parse('2026-10-30T21:00:00Z');
  const config = { dataDir: directory, publicUrl: 'http://localhost', adminPasswordHash: passwordHash,
    deviceSecret: randomBytes(32).toString('hex'), clock: () => now,
    initialSettings: { campaignActive: true, presenceRequired: true, ...settings }, initialInventory: { opener: 2 } };
  const app = await createApplication(config);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); });
  const call = async (path, { body, headers = {}, ...options } = {}) => {
    const response = await fetch(`${config.publicUrl}${path}`, { ...options,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const click = (source = 'home', key = randomUUID(), headers = {}) => call('/api/instagram/clicks', {
    method: 'POST', body: { source }, headers: { 'Idempotency-Key': key, ...headers } });
  return { app, config, call, click, advance: (ms) => { now += ms; } };
}

test('clicks record only event source/time/key and never mutate promotion state or establish browser identity', async (t) => {
  const f = await fixture(t);
  const before = structuredClone(f.app.store.state);
  const result = await f.click();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { recorded: true, clickedAt: '2026-10-30T21:00:00.000Z', replayed: false });
  assert.equal(result.headers.has('set-cookie'), false);
  assert.equal(result.headers.has('x-olivos-device'), false);
  const { instagramClicks, ...after } = f.app.store.state;
  assert.deepEqual(after, before);
  assert.equal(instagramClicks.total, 1);
  assert.deepEqual(Object.keys(instagramClicks.entries[0]).sort(), ['clickedAt', 'key', 'source']);
  assert.equal((await f.call('/api/participations', { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: {} })).data.error.code, 'VISIT_REQUIRED');
});

test('concurrent retries deduplicate one global event key; source changes with the same key are rejected', async (t) => {
  const f = await fixture(t);
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 12 }, () => f.click('result', key)));
  assert(results.every((result) => result.status === 200));
  assert.equal(results.filter((result) => !result.data.replayed).length, 1);
  const changed = await f.click('coupon', key);
  assert.equal(changed.status, 409);
  assert.equal(changed.data.error.code, 'CLICK_KEY_REUSED');
  assert.equal(f.app.store.state.instagramClicks.total, 1);
  await Promise.all(Array.from({ length: 8 }, (_, i) => f.click(i % 2 ? 'coupon' : 'home')));
  assert.deepEqual(f.app.store.state.instagramClicks.bySource, { home: 4, result: 1, coupon: 4 });
});

test('views, invalid payloads and foreign origins never log clicks; administrative records are private', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/instagram/clicks')).status, 404);
  assert.equal((await f.call('/api/admin/dashboard')).status, 401);
  assert.equal((await f.call('/api/instagram/clicks', { method: 'POST', body: { source: 'home' } })).status, 400);
  for (const body of [{}, { source: 'unknown' }, { source: 'home', token: 'not-accepted' }, { source: 'home', url: 'https://evil.example' }]) {
    assert.equal((await f.call('/api/instagram/clicks', { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body })).status, 400);
  }
  assert.equal((await f.click('home', randomUUID(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.click('home', randomUUID(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal(f.app.store.state.instagramClicks, undefined);
});

test('click data survives restart and safe dashboard summaries never expose event keys or invent visits/follows', async (t) => {
  const f = await fixture(t);
  const key = randomUUID();
  await f.click('coupon', key);
  await f.app.close();
  const reopened = await createApplication(f.config);
  try {
    const snapshot = await reopened.game.dashboard();
    assert.equal(snapshot.instagramClicks.total, 1);
    assert.deepEqual(snapshot.instagramClicks.recent, [{ source: 'coupon', clickedAt: '2026-10-30T21:00:00.000Z' }]);
    assert(!JSON.stringify(snapshot).includes(key));
    assert.equal(snapshot.totals.participations, 0);
    assert.equal(snapshot.totals.stock, 2);
    assert.equal(Object.hasOwn(snapshot.instagramClicks, 'followers'), false);
  } finally { await reopened.close(); }
});

test('seven-day and thousand-entry retention bound the log but preserve identifier-free accumulated counts', async (t) => {
  const f = await fixture(t);
  await f.app.store.transaction((state) => {
    state.instagramClicks = { total: 1000, bySource: { home: 1000, result: 0, coupon: 0 },
      entries: Array.from({ length: 1000 }, (_, i) => ({ key: `fixture-event-${String(i).padStart(6, '0')}`, source: 'home', clickedAt: '2026-10-30T21:00:00.000Z' })) };
  });
  await f.click('result');
  assert.equal(f.app.store.state.instagramClicks.total, 1001);
  assert.equal(f.app.store.state.instagramClicks.entries.length, 1000);
  assert.equal(f.app.store.state.instagramClicks.entries.some((entry) => entry.key === 'fixture-event-000000'), false);
  f.advance(week);
  const summary = (await f.app.game.dashboard()).instagramClicks;
  assert.equal(summary.total, 1001);
  assert.equal(summary.retained, 0);
  await f.click('coupon');
  assert.equal(f.app.store.state.instagramClicks.total, 1002);
  assert.equal(f.app.store.state.instagramClicks.entries.length, 1);
});

test('clicking is never required to participate or redeem, including a campaign with no click data', async (t) => {
  const f = await fixture(t, { presenceRequired: false, cooldownEnabled: false, interval: 2 });
  await f.app.game.participate('fixture-device', randomUUID(), {});
  const winner = await f.app.game.participate('fixture-device', randomUUID(), {});
  assert.equal(winner.won, true);
  assert.equal((await f.app.game.redeem(winner.coupon.code)).status, 'redeemed');
  assert.equal(f.app.store.state.instagramClicks, undefined);
  const before = structuredClone(f.app.store.state);
  await f.app.game.updateSettings({ campaignActive: false });
  await f.click();
  const { instagramClicks, ...after } = f.app.store.state;
  assert.deepEqual(after.participations, before.participations);
  assert.deepEqual(after.coupons, before.coupons);
  assert.deepEqual(after.inventory, before.inventory);
  assert.equal(instagramClicks.total, 1);
});

test('legacy state remains valid and malformed or identity-bearing click data is rejected', async (t) => {
  const f = await fixture(t);
  assert.doesNotThrow(() => validateState(f.app.store.state));
  await f.click();
  for (const mutate of [data => { data.total = -1; }, data => { data.bySource.home = 2; },
    data => { data.entries[0].clickedAt = 'invalid'; }, data => { data.entries[0].deviceHash = 'not-allowed'; },
    data => { data.entries.push({ ...data.entries[0] }); data.total++; data.bySource.home++; }]) {
    const invalid = structuredClone(f.app.store.state);
    mutate(invalid.instagramClicks);
    assert.throws(() => validateState(invalid), /registro de clics/);
  }
});
