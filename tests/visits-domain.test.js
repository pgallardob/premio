import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { FileStore } from '../server/store.js';
import { Game } from '../server/game.js';
import catalog from '../config/prizes.json' with { type: 'json' };

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-visit-domain-'));
  const store = new FileStore(directory, catalog, { settings: { campaignActive: true }, inventory: { opener: 2 } });
  await store.initialize();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true }); });
  const game = new Game(store, catalog, { production: true, promotionReviewed: true, promotionContact: 'Verification only',
    deviceSecret: randomBytes(32).toString('hex'), publicUrl: 'https://example.invalid' });
  return { store, game };
}

test('domain visit permission is atomically consumed once and old idempotent results remain recoverable', async (t) => {
  const { store, game } = await fixture(t);
  const device = randomUUID();
  const oldKey = randomUUID();
  await game.participate(device, oldKey, {});
  const before = structuredClone(store.state);
  await assert.rejects(game.updateSettings({ presenceRequired: true }), /revisaste las bases/);
  assert.deepEqual(store.state, before);
  await game.updateSettings({ presenceRequired: true, promotionReviewed: true });
  assert.deepEqual(store.state.participations, before.participations);
  assert.deepEqual(store.state.inventory, before.inventory);
  assert.equal((await game.participate(device, oldKey, {})).replayed, true);
  const visitor = randomUUID();
  await assert.rejects(game.participate(visitor, randomUUID(), {}), (error) => error.code === 'VISIT_REQUIRED');
  const visit = (await game.visits.create(visitor)).visit;
  assert.equal(visit.status, 'pending');
  assert.equal((await game.visits.create(visitor)).visit.id, visit.id);
  assert.throws(() => game.visits.approve(visit.id, { present: false }), /Confirma/);
  await game.visits.approve(visit.id, { present: true });
  assert.equal(store.state.totalParticipations, 1);
  await assert.rejects(game.participate(randomUUID(), randomUUID(), { visitId: visit.id }), (error) => error.code === 'VISIT_REQUIRED');
  // Disable cooldown only inside this fixture to isolate the independent one-use invariant.
  await store.transaction((state) => { state.settings.cooldownEnabled = false; });
  const key = randomUUID();
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => game.participate(visitor, randomUUID(), { visitId: visit.id })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert(results.filter((result) => result.status === 'rejected').every((result) => result.reason.code === 'VISIT_REQUIRED'));
  assert.equal(store.state.totalParticipations, 2);
  assert.equal(store.state.visits[0].status, 'used');
  await assert.rejects(game.visits.approve(visit.id, { present: true }), (error) => error.code === 'VISIT_USED');
  const next = (await game.visits.create(visitor)).visit;
  await game.visits.approve(next.id, { present: true });
  const replayed = await Promise.all(Array.from({ length: 4 }, () => game.participate(visitor, key, { visitId: next.id })));
  assert.equal(replayed.filter((result) => !result.replayed).length, 1);
  assert(replayed.every((result) => result.id === 3));
});
