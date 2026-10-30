import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import catalog from '../config/prizes.json' with { type: 'json' };
import plan from '../deploy/inventory.json' with { type: 'json' };
import { FileStore } from '../server/store.js';
import { applyInventoryPlan } from '../server/inventory.js';
import { Game } from '../server/game.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencode', 'premio-inventory-'));
  const store = new FileStore(directory, catalog);
  await store.initialize();
  t.after(async () => { await store.close(); await rm(directory, { recursive: true }); });
  return store;
}

test('real catalog has five stable prize IDs, safe defaults and the requested 58-unit plan', async () => {
  assert.deepEqual(catalog.map((prize) => prize.id), ['opener', 'cookies', 'jokey', 'tshirt', 'planner']);
  assert.deepEqual(catalog.map((prize) => prize.name), ['Destapador Monster', 'Galletas mini Costa', 'Jokey', 'Polera', 'Agenda']);
  assert.deepEqual(plan.items.map((item) => item.stock), [20, 20, 10, 5, 3]);
  assert.equal(plan.items.reduce((sum, item) => sum + item.stock, 0), 58);
  assert(catalog.every((prize) => prize.initialStock === 0));
  for (const prize of catalog) await access(new URL(`..${prize.image}`, import.meta.url));
});

test('an inventory plan commits all quantities and audit entries without activating the campaign', async (t) => {
  const store = await fixture(t);
  const result = await applyInventoryPlan(store, catalog, plan.items);
  assert.equal(result.total, 58);
  assert.equal(store.state.audit.length, 5);
  assert.equal(store.state.totalParticipations, 0);
  assert.equal(store.state.coupons.length, 0);
  assert.equal(store.state.settings.campaignActive, false);
  assert.equal(store.state.settings.cooldownEnabled, true);
  assert.equal(store.state.settings.cooldownHours, 24);
});

test('a late validation error rolls back the entire stock load and audit', async (t) => {
  const store = await fixture(t);
  const invalid = structuredClone(plan.items);
  invalid.at(-1).stock = -1;
  const before = structuredClone(store.state);
  await assert.rejects(applyInventoryPlan(store, catalog, invalid), (error) => error.code === 'INVALID_INPUT');
  assert.deepEqual(store.state, before);
});

test('expected-stock checks preserve concurrent owner changes and reject repeat loads', async (t) => {
  const store = await fixture(t);
  await store.transaction((state) => { state.inventory.cookies = 2; });
  const before = structuredClone(store.state);
  await assert.rejects(applyInventoryPlan(store, catalog, plan.items), (error) => error.code === 'INVENTORY_CHANGED');
  assert.deepEqual(store.state, before);
  await store.transaction((state) => { state.inventory.cookies = 0; });
  await applyInventoryPlan(store, catalog, plan.items);
  await assert.rejects(applyInventoryPlan(store, catalog, plan.items), (error) => error.code === 'INVENTORY_CHANGED');
  assert.equal(store.state.audit.length, 5);
});

test('bulk inventory loading requires a paused campaign and a complete unique catalog plan', async (t) => {
  const store = await fixture(t);
  await assert.rejects(applyInventoryPlan(store, catalog, plan.items.slice(1)), (error) => error.code === 'INVALID_INPUT');
  const duplicate = structuredClone(plan.items);
  duplicate[1].prizeId = duplicate[0].prizeId;
  await assert.rejects(applyInventoryPlan(store, catalog, duplicate), (error) => error.code === 'INVALID_INPUT');
  await store.transaction((state) => { state.settings.campaignActive = true; });
  await assert.rejects(applyInventoryPlan(store, catalog, plan.items), (error) => error.code === 'CAMPAIGN_ACTIVE');
  assert.equal(store.state.audit.length, 0);
});

test('loading a catalog preserves existing participation history, cycle and retired IDs', async (t) => {
  const store = await fixture(t);
  const entry = { id: 1, deviceHash: 'a'.repeat(64), requestKey: randomUUID(), won: false, couponCode: null, createdAt: new Date().toISOString() };
  await store.transaction((state) => {
    state.totalParticipations = 1;
    state.cycleProgress = 1;
    state.participations.push(entry);
    state.inventory.retired = 0;
  });
  await applyInventoryPlan(store, catalog, plan.items);
  assert.equal(store.state.totalParticipations, 1);
  assert.equal(store.state.cycleProgress, 1);
  assert.deepEqual(store.state.participations, [entry]);
  assert.equal(store.state.inventory.retired, 0);
});

test('retired prizes with remaining stock must be reconciled instead of silently hidden', async (t) => {
  const store = await fixture(t);
  await store.transaction((state) => { state.inventory.retired = 1; });
  await assert.rejects(applyInventoryPlan(store, catalog, plan.items), (error) => error.code === 'RETIRED_STOCK');
  assert.equal(store.state.audit.length, 0);
  assert.equal(store.state.inventory.retired, 1);
});

test('expired reservations are reconciled before checking the expected available stock', async (t) => {
  const store = await fixture(t);
  let now = Date.now();
  const game = new Game(store, catalog, { deviceSecret: 'c'.repeat(64) }, () => now);
  await store.transaction((state) => {
    state.settings.campaignActive = true;
    state.settings.interval = 2;
    state.inventory.opener = 1;
  });
  await game.participate('first-device', randomUUID(), {});
  await game.participate('second-device', randomUUID(), {});
  await store.transaction((state) => { state.settings.campaignActive = false; });
  now += 6 * 86_400_000;
  const before = structuredClone(store.state);
  await assert.rejects(applyInventoryPlan(store, catalog, plan.items, () => now), (error) => error.code === 'INVENTORY_CHANGED');
  assert.deepEqual(store.state, before);
});
