import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import catalog from '../config/prizes.json' with { type: 'json' };
import { hashPassword } from '../server/auth.js';
import { PostgresStore } from '../server/neon/store.js';
import { NeonAuth, PostgresRateLimiter } from '../server/neon/auth.js';
import { createNeonHandler } from '../server/neon/handler.js';
import { Game } from '../server/game.js';
import { applyInventoryPlan } from '../server/inventory.js';
import inventoryPlan from '../deploy/inventory.json' with { type: 'json' };

const connectionString = process.env.NEON_VERIFY_DATABASE_URL;
const password = randomBytes(20).toString('hex');
const passwordHash = await hashPassword(password);
const integration = (name, run) => test(name, { skip: !connectionString }, run);

async function fixture(t) {
  const pool = new pg.Pool({ connectionString, max: 6, connectionTimeoutMillis: 15_000 });
  const schema = `premio_verify_${randomBytes(8).toString('hex')}`;
  const config = { publicUrl: 'https://pgallardob.github.io/premio', adminPasswordHash: passwordHash,
    deviceSecret: randomBytes(32).toString('hex'), production: true, promotionReviewed: true, promotionContact: 'Verification only' };
  const store = new PostgresStore(pool, catalog, { schema, defaults: { settings: { campaignActive: true, interval: 2 }, inventory: { opener: 1, cookies: 0, jokey: 0 } } });
  await store.migrate();
  t.after(async () => {
    // Only remove this fixture's unique schema, never the production schema.
    assert.match(schema, /^premio_verify_[a-f0-9]{16}$/);
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  });
  const makeHandler = () => createNeonHandler({ config, game: new Game(store, catalog, config), auth: new NeonAuth(config, store), limiter: new PostgresRateLimiter(store, config.deviceSecret) });
  let handler = makeHandler();
  const client = () => {
    let device = '';
    let session = '';
    let csrf = '';
    const call = async (path, { method = 'GET', body, headers = {}, origin = new URL(config.publicUrl).origin } = {}) => {
      const response = await handler(new Request(`https://api.example.test${path}`, { method,
        headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(device ? { 'X-Olivos-Device': device } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body) }));
      device = response.headers.get('x-olivos-device') ?? device;
      session = response.headers.get('x-olivos-session') ?? session;
      const data = response.status === 204 ? null : response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
      if (data?.csrfToken) csrf = data.csrfToken;
      return { status: response.status, data, headers: response.headers };
    };
    call.participate = (key = randomUUID(), body = {}) => call('/api/participations', { method: 'POST', body, headers: { 'Idempotency-Key': key } });
    call.login = () => call('/api/admin/login', { method: 'POST', body: { password } });
    return call;
  };
  return { pool, store, config, client, restart: () => { handler = makeHandler(); } };
}

test('Postgres schema identifiers cannot inject SQL', () => {
  assert.throws(() => new PostgresStore(null, catalog, { schema: 'premio; DROP SCHEMA public' }), /Invalid database schema/);
});

integration('Neon CORS permits only the configured frontend and never requires third-party cookies', async (t) => {
  const { client } = await fixture(t);
  const visitor = client();
  const status = await visitor('/api/status');
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('access-control-allow-origin'), 'https://pgallardob.github.io');
  assert.equal(status.headers.has('set-cookie'), false);
  assert.match(status.headers.get('x-olivos-device'), /^[a-f0-9]{32}\.[a-f0-9]{64}$/);
  assert.equal((await visitor('/api/status', { origin: 'https://evil.example' })).status, 403);
  const preflight = await visitor('/api/admin/login', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
});

integration('Postgres serializes concurrent winners across independent stores without overselling', async (t) => {
  const { store, pool, config } = await fixture(t);
  const another = new PostgresStore(pool, catalog, { schema: store.schema.slice(1, -1) });
  await another.initialize();
  const games = [new Game(store, catalog, config), new Game(another, catalog, config)];
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => games[i % 2].participate(randomUUID(), randomUUID(), {})));
  const accepted = results.filter((result) => result.status === 'fulfilled');
  assert.equal(accepted.length, 2);
  assert.equal(accepted.filter((result) => result.value.won).length, 1);
  assert(results.filter((result) => result.status === 'rejected').every((result) => result.reason.code === 'OUT_OF_STOCK'));
  await store.initialize();
  assert.equal(store.state.totalParticipations, 2);
  assert.equal(store.state.inventory.opener, 0);
});

integration('Postgres idempotency and mandatory cooldown survive a new application instance', async (t) => {
  const { client, restart, store } = await fixture(t);
  const visitor = client();
  await visitor('/api/status');
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, () => visitor.participate(key)));
  assert(results.every((result) => result.status === 200 && result.data.id === 1));
  assert.equal(results.filter((result) => !result.data.replayed).length, 1);
  restart();
  assert.equal((await visitor.participate()).status, 429);
  assert.equal(store.state.totalParticipations, 1);
});

integration('Neon admin sessions persist across instances, enforce CSRF and are revoked on logout', async (t) => {
  const { client, restart } = await fixture(t);
  const admin = client();
  assert.equal((await admin.login()).status, 200);
  restart();
  assert.equal((await admin('/api/admin/session')).status, 200);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { campaignActive: false }, headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { cooldownEnabled: false } })).status, 400);
  assert.equal((await admin('/api/admin/export')).status, 200);
  assert.equal((await admin('/api/admin/logout', { method: 'POST', body: {} })).status, 200);
  restart();
  assert.equal((await admin('/api/admin/session')).status, 401);
});

integration('Neon redemption remains single use and private wallet ownership is isolated', async (t) => {
  const { client, restart } = await fixture(t);
  const first = client();
  const second = client();
  const stranger = client();
  for (const visitor of [first, second, stranger]) await visitor('/api/status');
  await first.participate();
  const winner = await second.participate();
  const coupon = winner.data.coupon;
  assert(coupon);
  assert.equal((await stranger('/api/wallet')).data.coupons.length, 0);
  const admin = client();
  await admin.login();
  restart();
  const results = await Promise.all([1, 2].map(() => admin(`/api/admin/coupons/${coupon.code}/redeem`, { method: 'POST', body: {} })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await second(`/api/coupons/${coupon.token}`)).data.status, 'redeemed');
});

integration('Postgres rolls back failed operations and migrations preserve existing records', async (t) => {
  const { store, pool } = await fixture(t);
  await assert.rejects(store.transaction((state) => { state.inventory.opener = 99; throw new Error('rollback'); }), /rollback/);
  await store.initialize();
  assert.equal(store.state.inventory.opener, 1);
  await store.transaction((state) => { state.inventory.opener = 3; });
  await store.migrate();
  assert.equal(store.state.inventory.opener, 3);
  const expanded = new PostgresStore(pool, [...catalog, { ...catalog[0], id: 'future-prize', initialStock: 0 }], { schema: store.schema.slice(1, -1) });
  await expanded.migrate();
  assert.equal(expanded.state.inventory.opener, 3);
  assert.equal(expanded.state.inventory['future-prize'], 0);
  await expanded.transaction((state) => { state.inventory['future-prize'] = 7; });
  await expanded.migrate();
  assert.equal(expanded.state.inventory['future-prize'], 7);
});

integration('Postgres inventory plan is atomic and concurrent retries cannot restock twice', async (t) => {
  const { store, pool } = await fixture(t);
  await store.transaction((state) => {
    state.settings.campaignActive = false;
    for (const prize of catalog) state.inventory[prize.id] = 0;
  });
  const another = new PostgresStore(pool, catalog, { schema: store.schema.slice(1, -1) });
  await another.initialize();
  const results = await Promise.allSettled([store, another].map((writer) => applyInventoryPlan(writer, catalog, inventoryPlan.items)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'INVENTORY_CHANGED');
  await store.initialize();
  assert.equal(Object.values(store.state.inventory).reduce((sum, value) => sum + value, 0), 58);
  assert.equal(store.state.audit.length, 5);
  assert.equal(store.state.settings.campaignActive, false);
});

integration('Neon login throttling persists across cold starts and ignores spoofed forwarding headers', async (t) => {
  const { client, restart } = await fixture(t);
  for (let i = 0; i < 5; i += 1) {
    const response = await client()('/api/admin/login', { method: 'POST', body: { password: 'wrong' }, headers: { 'X-Forwarded-For': `192.0.2.${i}` } });
    assert.equal(response.status, 401);
    restart();
  }
  assert.equal((await client().login()).status, 429);
});

integration('Neon owner review and public contact persist and permit activation without deployment flags', async (t) => {
  const { store, client, config, restart } = await fixture(t);
  await store.transaction((state) => { state.settings.campaignActive = false; });
  config.promotionReviewed = false;
  config.promotionContact = '';
  const admin = client();
  await admin.login();
  const contact = 'contacto@example.invalid';
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { promotionContact: contact } })).status, 200);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { campaignActive: true } })).status, 400);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { promotionReviewedAt: 'forged' } })).status, 400);
  const approved = await admin('/api/admin/settings', { method: 'PATCH', body: { promotionReviewed: true, campaignActive: true } });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.promotionReviewed, true);
  assert.equal(typeof approved.data.promotionReviewedAt, 'string');
  restart();
  const visitor = client();
  const status = await visitor('/api/status');
  assert.equal(status.data.promotionContact, contact);
  assert.equal(status.data.active, true);
  assert.equal((await visitor.participate()).status, 200);
  await admin('/api/admin/settings', { method: 'PATCH', body: { campaignActive: false, promotionReviewed: false } });
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { campaignActive: true } })).status, 400);
});

integration('one held test winner survives instances, never redeems and leaves all business data intact', async (t) => {
  const { store, pool, config } = await fixture(t);
  const another = new PostgresStore(pool, catalog, { schema: store.schema.slice(1, -1) });
  await another.initialize();
  const games = [store, another].map((writer) => new Game(writer, catalog, config));
  const { testCoupons, ...before } = structuredClone(store.state);
  const winners = await Promise.all(games.map((game) => game.createTestWinner()));
  assert.equal(winners[0].token, winners[1].token);
  assert.equal(winners[0].expiresAt, null);
  await assert.rejects(games[1].redeem(winners[0].code), (error) => error.code === 'TEST_COUPON');
  await another.initialize();
  assert.equal(another.state.testCoupons[0].status, 'active');
  await games[1].deleteTestWinner(winners[0].code);
  await store.initialize();
  const { testCoupons: remaining, ...after } = store.state;
  assert.equal(remaining.length, 0);
  assert.deepEqual(after, before);
});

integration('Neon visit approval is private, browser-bound and persistent across cold starts', async (t) => {
  const { store, client, restart } = await fixture(t);
  const admin = client();
  const visitor = client();
  const stranger = client();
  await admin.login();
  const changed = await admin('/api/admin/settings', { method: 'PATCH', body: { presenceRequired: true, promotionReviewed: true } });
  assert.equal(changed.status, 200);
  assert.equal((await visitor.participate()).data.error.code, 'VISIT_REQUIRED');
  const visit = (await visitor('/api/visits', { method: 'POST', body: {} })).data.visit;
  assert.equal((await stranger(`/api/admin/visits/${visit.id}`)).status, 401);
  assert.equal((await stranger(`/api/admin/visits/${visit.id}/approve`, { method: 'POST', body: { present: true } })).status, 401);
  assert.equal((await admin(`/api/admin/visits/${visit.id}/approve`, { method: 'POST', body: { present: true }, headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
  const approved = await admin(`/api/admin/visits/${visit.id}/approve`, { method: 'POST', body: { present: true } });
  assert.equal(approved.data.status, 'approved');
  assert.equal(store.state.totalParticipations, 0);
  restart();
  assert.equal((await visitor('/api/visits/current')).data.visit.id, visit.id);
  assert.equal((await stranger.participate(randomUUID(), { visitId: visit.id })).data.error.code, 'VISIT_REQUIRED');
  const key = randomUUID();
  assert.equal((await visitor.participate(key, { visitId: visit.id })).data.id, 1);
  restart();
  assert.equal((await visitor.participate(key)).data.replayed, true);
  assert.equal((await visitor('/api/visits', { method: 'POST', body: {} })).data.error.code, 'COOLDOWN');
  await store.initialize();
  assert.equal(store.state.visits[0].status, 'used');
  assert.equal(store.state.participations[0].visitId, visit.id);
  assert.equal(store.state.audit.filter((item) => item.action === 'visit_approved').length, 1);
});

integration('Postgres row locks prevent pass reuse across independent instances even without cooldown', async (t) => {
  const { store, pool, config } = await fixture(t);
  await store.transaction((state) => { state.settings.presenceRequired = true; state.settings.cooldownEnabled = false; });
  const other = new PostgresStore(pool, catalog, { schema: store.schema.slice(1, -1) });
  await other.initialize();
  const games = [store, other].map((writer) => new Game(writer, catalog, config));
  const device = randomUUID();
  const visit = (await games[0].visits.create(device)).visit;
  const approvals = await Promise.all(games.map((game) => game.visits.approve(visit.id, { present: true })));
  assert.deepEqual(approvals[0], approvals[1]);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => games[i % 2].participate(device, randomUUID(), { visitId: visit.id })));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert(results.filter((item) => item.status === 'rejected').every((item) => item.reason.code === 'VISIT_REQUIRED'));
  await other.initialize();
  assert.equal(other.state.totalParticipations, 1);
  assert.equal(other.state.inventory.opener, 1);
  assert.equal(other.state.audit.filter((item) => item.action === 'visit_approved').length, 1);
});

integration('Postgres eligibility review is prospective and rejects unreviewed activation atomically', async (t) => {
  const { store, client } = await fixture(t);
  const admin = client();
  const visitor = client();
  await admin.login();
  const key = randomUUID();
  await visitor.participate(key);
  const before = structuredClone(store.state);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { presenceRequired: true } })).status, 400);
  await store.initialize();
  assert.deepEqual(store.state, before);
  assert.equal((await admin('/api/admin/settings', { method: 'PATCH', body: { presenceRequired: true, promotionReviewed: true } })).status, 200);
  assert.deepEqual(store.state.participations, before.participations);
  assert.deepEqual(store.state.inventory, before.inventory);
  assert.equal((await visitor.participate(key)).data.replayed, true);
  assert.equal((await client().participate()).data.error.code, 'VISIT_REQUIRED');
});

integration('Postgres click records survive cold starts, deduplicate across writers and leave business data unchanged', async (t) => {
  const { store, pool, config, client, restart } = await fixture(t);
  const before = structuredClone(store.state);
  const another = new PostgresStore(pool, catalog, { schema: store.schema.slice(1, -1) });
  await another.initialize();
  const games = [store, another].map((writer) => new Game(writer, catalog, config));
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => games[i % 2].instagramClicks.record(key, { source: 'result' })));
  assert.equal(results.filter((result) => !result.replayed).length, 1);
  const visitor = client();
  const recorded = await visitor('/api/instagram/clicks', { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: { source: 'coupon' } });
  assert.equal(recorded.status, 200);
  assert.equal(recorded.headers.has('x-olivos-device'), false);
  restart();
  const admin = client();
  await admin.login();
  const snapshot = (await admin('/api/admin/dashboard')).data;
  assert.equal(snapshot.instagramClicks.total, 2);
  assert(!JSON.stringify(snapshot).includes(key));
  await another.initialize();
  const { instagramClicks, ...business } = another.state;
  assert.deepEqual(business, before);
  assert.equal(instagramClicks.entries.length, 2);
});
