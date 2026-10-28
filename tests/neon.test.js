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

const connectionString = process.env.NEON_VERIFY_DATABASE_URL;
const password = randomBytes(20).toString('hex');
const passwordHash = await hashPassword(password);
const integration = (name, run) => test(name, { skip: !connectionString }, run);

async function fixture(t) {
  const pool = new pg.Pool({ connectionString, max: 6, connectionTimeoutMillis: 15_000 });
  const schema = `premio_verify_${randomBytes(8).toString('hex')}`;
  const config = { publicUrl: 'https://pgallardob.github.io/premio', adminPasswordHash: passwordHash,
    deviceSecret: randomBytes(32).toString('hex'), production: true, promotionReviewed: true, promotionContact: 'Verification only' };
  const store = new PostgresStore(pool, catalog, { schema, defaults: { settings: { campaignActive: true, interval: 2 }, inventory: { refreshment: 1, snack: 0, coffee: 0 } } });
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
    call.participate = (key = randomUUID()) => call('/api/participations', { method: 'POST', body: {}, headers: { 'Idempotency-Key': key } });
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
  assert.equal(store.state.inventory.refreshment, 0);
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
  const { store } = await fixture(t);
  await assert.rejects(store.transaction((state) => { state.inventory.refreshment = 99; throw new Error('rollback'); }), /rollback/);
  await store.initialize();
  assert.equal(store.state.inventory.refreshment, 1);
  await store.transaction((state) => { state.inventory.refreshment = 3; });
  await store.migrate();
  assert.equal(store.state.inventory.refreshment, 3);
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
