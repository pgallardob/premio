import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { loadConfig } from '../server/config.js';
import { createClientAddressResolver } from '../server/proxy.js';

const hash = await hashPassword(randomBytes(24).toString('hex'));
const secret = randomBytes(32).toString('hex');
const env = { NODE_ENV: 'production', PUBLIC_URL: 'https://rewards.example.org', ADMIN_PASSWORD_HASH: hash, DEVICE_SECRET: secret, CREDENTIALS_ROTATED: 'true' };

async function sandbox(t, extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-production-'));
  const config = { dataDir: directory, publicUrl: 'http://localhost', adminPasswordHash: hash, deviceSecret: secret, ...extra };
  const app = await createApplication(config);
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, app, config };
}
const cli = (script, directory, args = [], extra = {}) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8', env: { ...process.env, DATA_DIR: directory, ...extra },
});
const withHost = (url, host) => new Promise((resolveResponse, reject) => {
  const request = httpRequest(url, { headers: { Host: host } }, (response) => {
    response.resume();
    response.on('end', () => resolveResponse({ status: response.statusCode, headers: response.headers }));
  });
  request.on('error', reject);
  request.end();
});

test('production configuration rejects unsafe origins and invalid credentials', () => {
  assert.equal(loadConfig(env).production, true);
  for (const publicUrl of ['http://rewards.example.org', 'https://localhost', 'https://CHANGE-ME.invalid', 'https://rewards.example.org/path', 'https://user:password@rewards.example.org']) {
    assert.throws(() => loadConfig({ ...env, PUBLIC_URL: publicUrl }), undefined, publicUrl);
  }
  assert.throws(() => loadConfig({ ...env, ADMIN_PASSWORD_HASH: '' }));
  assert.throws(() => loadConfig({ ...env, DEVICE_SECRET: 'short' }));
  assert.throws(() => loadConfig({ ...env, CREDENTIALS_ROTATED: 'false' }));
});

test('forwarded client addresses are accepted only through explicitly trusted proxies', () => {
  const request = (peer, forwarded) => ({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': forwarded } });
  assert.equal(createClientAddressResolver()(request('198.51.100.12', '203.0.113.99')), '198.51.100.12');
  const resolve = createClientAddressResolver(['127.0.0.1/32', '::1/128']);
  assert.equal(resolve(request('127.0.0.1', '203.0.113.99, 198.51.100.12')), '198.51.100.12');
  assert.equal(resolve(request('::ffff:127.0.0.1', '198.51.100.12')), '198.51.100.12');
  assert.equal(resolve(request('127.0.0.1', 'invalid')), '127.0.0.1');
  assert.throws(() => createClientAddressResolver(['not-an-ip']));
  assert.throws(() => createClientAddressResolver(['0.0.0.0/0']));
});

test('fresh installations are paused, empty and protected; health reveals no business data', async (t) => {
  const { app, config } = await sandbox(t);
  const status = await app.game.status();
  assert.equal(status.active, false);
  assert.equal(status.availableStock, 0);
  assert.equal(status.rules.cooldownEnabled, true);
  assert.equal(Object.hasOwn(status, 'testMode'), false);
  await assert.rejects(app.game.participate('fresh-device', randomUUID(), {}), (error) => error.code === 'CAMPAIGN_PAUSED');
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  config.publicUrl = base;
  const health = await fetch(`${base}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal(health.headers.get('set-cookie'), null);
});

test('production activation requires review, contact and stock; host and secure cookies are enforced', async (t) => {
  const { app, config } = await sandbox(t, { production: true, publicUrl: env.PUBLIC_URL, initialInventory: { jokey: 1 } });
  assert.throws(() => app.game.updateSettings({ cooldownEnabled: false }), (error) => error.status === 400);
  await assert.rejects(app.game.updateSettings({ campaignActive: true }), (error) => error.status === 400);
  config.promotionReviewed = true;
  config.promotionContact = 'Contact the store';
  assert.equal((await app.game.updateSettings({ campaignActive: true })).campaignActive, true);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await withHost(`${base}/api/status`, 'attacker.invalid')).status, 421);
  const response = await withHost(`${base}/api/status`, 'rewards.example.org');
  assert.equal(response.status, 200);
  assert.match(response.headers['set-cookie'].join(';'), /Secure/);
  assert.match(response.headers['content-security-policy'], /worker-src 'self'/);
  await app.game.updateInventory('jokey', { stock: 0 });
  await assert.rejects(app.game.updateSettings({ campaignActive: true }), (error) => error.status === 400);
});

test('destructive reset requires explicit confirmation and a stopped writer, then removes all records', async (t) => {
  const { app, directory } = await sandbox(t, { initialSettings: { campaignActive: true, cooldownEnabled: false, interval: 2 }, initialInventory: { jokey: 2 } });
  await app.game.participate('device', randomUUID(), {});
  await app.game.participate('device', randomUUID(), {});
  assert.equal(cli('scripts/reset-data.js', directory, ['--confirm=DELETE_ALL_RECORDS']).status, 1);
  assert.equal((await app.game.dashboard()).totals.issued, 1);
  await app.close();
  assert.equal(cli('scripts/reset-data.js', directory).status, 1);
  const reset = cli('scripts/reset-data.js', directory, ['--confirm=DELETE_ALL_RECORDS']);
  assert.equal(reset.status, 0, reset.stderr);
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
  assert.equal(state.totalParticipations, 0);
  assert.equal(state.cycleProgress, 0);
  assert.deepEqual(state.coupons, []);
  assert.deepEqual(state.participations, []);
  assert.deepEqual(state.lastParticipation, {});
  assert.deepEqual(state.audit, []);
  assert(Object.values(state.inventory).every((stock) => stock === 0));
  assert.equal(state.settings.cooldownEnabled, true);
  assert.equal(state.settings.campaignActive, false);
});

test('backup and restoration are exclusive, validated and restore a paused protected state', async (t) => {
  const { app, directory } = await sandbox(t, { initialSettings: { campaignActive: true, cooldownEnabled: false, interval: 2 }, initialInventory: { jokey: 2 } });
  await app.game.participate('device', randomUUID(), {});
  await app.game.participate('device', randomUUID(), {});
  await app.game.updateSettings({ cooldownEnabled: true });
  const backups = join(directory, 'backups');
  assert.equal(cli('scripts/backup.js', directory, [], { BACKUP_DIR: backups }).status, 1);
  await app.close();
  const backup = cli('scripts/backup.js', directory, [], { BACKUP_DIR: backups });
  assert.equal(backup.status, 0, backup.stderr);
  const file = join(backups, (await readdir(backups))[0]);
  cli('scripts/reset-data.js', directory, ['--confirm=DELETE_ALL_RECORDS']);
  const restored = cli('scripts/backup.js', directory, [`--restore=${file}`, '--confirm=RESTORE_STATE']);
  assert.equal(restored.status, 0, restored.stderr);
  const content = await readFile(join(directory, 'state.json'), 'utf8');
  const state = JSON.parse(content);
  assert.equal(state.totalParticipations, 2);
  assert.equal(state.coupons.length, 1);
  assert.equal(state.settings.campaignActive, false);
  assert.equal(state.settings.cooldownEnabled, true);
  const invalid = join(directory, 'invalid.json');
  await writeFile(invalid, '{bad json');
  assert.equal(cli('scripts/backup.js', directory, [`--restore=${invalid}`, '--confirm=RESTORE_STATE']).status, 1);
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), content);
});
