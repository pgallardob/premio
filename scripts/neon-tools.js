import { spawnSync } from 'node:child_process';
import { readFile, writeFile, access, mkdir, unlink } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../server/auth.js';
import { PostgresStore } from '../server/neon/store.js';
import { validateState } from '../server/store.js';
import { applyInventoryPlan } from '../server/inventory.js';
import { Game } from '../server/game.js';
import QRCode from 'qrcode';

const root = resolve(import.meta.dirname, '..');
const target = JSON.parse(await readFile(join(root, 'deploy/neon-target.json'), 'utf8'));
const configDir = process.env.NEON_CONFIG_DIR;
if (!configDir || !process.env.NEON_CLI_PATH) throw new Error('Set NEON_CONFIG_DIR and NEON_CLI_PATH to your private authenticated CLI configuration.');
const credentialLocation = relative(root, resolve(configDir));
if (!credentialLocation || (!credentialLocation.startsWith(`..${sep}`) && credentialLocation !== '..' && !isAbsolute(credentialLocation))) throw new Error('Keep deployment credentials outside the repository.');
const profile = process.env.NEON_PROFILE ?? 'premio';
const common = ['--profile', profile, '--config-dir', configDir, '--no-analytics', '--output', 'json'];
const selection = ['--project-id', target.projectId, '--branch', target.branchId];

function cli(args, timeout = 60_000) {
  const script = /\.(?:mjs|cjs|js)$/.test(process.env.NEON_CLI_PATH);
  const result = spawnSync(script ? process.execPath : process.env.NEON_CLI_PATH,
    [...(script ? [process.env.NEON_CLI_PATH] : []), ...args, ...common],
    { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    // CLI errors can contain environment values; keep raw output private.
    writeFileSync(join(configDir, 'last-cli-error.log'), `${result.stderr ?? ''}\n${result.stdout ?? ''}`, { mode: 0o600 });
    throw new Error(`Neon command failed (${result.status ?? 'timeout'}): ${args.slice(0, 2).join(' ')}. No credentials were printed.`);
  }
  return result.stdout.trim();
}

async function databaseUrl() {
  const raw = cli(['connection-string', target.branchId, '--project-id', target.projectId, '--database-name', 'neondb', '--role-name', 'neondb_owner', '--ssl', 'verify-full']);
  let value;
  try { value = JSON.parse(raw); } catch { value = raw; }
  const url = typeof value === 'string' ? value : value.connection_string ?? value.connection_uri ?? value.uri;
  if (typeof url !== 'string' || !/^postgres(?:ql)?:\/\//.test(url)) throw new Error('The selected project did not return a usable connection string.');
  return url;
}

const environmentFile = join(configDir, 'premio-deployment.env');
async function prepareCredentials() {
  try { await access(environmentFile); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const password = randomBytes(24).toString('base64url');
  const hash = await hashPassword(password);
  await writeFile(join(configDir, 'premio-admin-password.txt'), `${password}\n`, { mode: 0o600, flag: 'wx' });
  await writeFile(environmentFile, `PUBLIC_URL=${target.publicUrl}\nADMIN_PASSWORD_HASH=${hash}\nDEVICE_SECRET=${randomBytes(32).toString('hex')}\nCREDENTIALS_ROTATED=true\nPROMOTION_REVIEWED=false\nPROMOTION_CONTACT=\n`, { mode: 0o600, flag: 'wx' });
  console.log('Fresh publication credentials saved only in the private CLI directory.');
}

const command = process.argv[2] ?? 'inspect';
if (['inspect', 'migrate', 'verify', 'inventory-plan', 'inventory-apply', 'set-contact', 'test-winner-create', 'test-winner-delete', 'require-presence'].includes(command)) {
  if (command === 'inventory-apply' && process.argv[3] !== '--confirm=APPLY_INVENTORY') throw new Error('Explicit --confirm=APPLY_INVENTORY is required.');
  if (command === 'set-contact' && (!process.argv[3] || process.argv[4] !== '--confirm=UPDATE_CONTACT')) throw new Error('Provide a public contact and --confirm=UPDATE_CONTACT.');
  if (command === 'test-winner-create' && process.argv[3] !== '--confirm=CREATE_TEST_WINNER') throw new Error('Explicit --confirm=CREATE_TEST_WINNER is required.');
  if (command === 'test-winner-delete' && process.argv[3] !== '--confirm=DELETE_TEST_WINNER') throw new Error('Explicit --confirm=DELETE_TEST_WINNER is required.');
  if (command === 'require-presence' && (process.argv[3] !== '--confirm=REQUIRE_PRESENCE' || process.argv[4] !== '--owner-reviewed-terms')) throw new Error('Explicit --confirm=REQUIRE_PRESENCE and owner confirmation via --owner-reviewed-terms are required.');
  const pool = new pg.Pool({ connectionString: await databaseUrl(), max: 2, connectionTimeoutMillis: 15_000 });
  try {
    if (command === 'require-presence') {
      const catalog = JSON.parse(await readFile(join(root, 'config/prizes.json'), 'utf8'));
      const store = new PostgresStore(pool, catalog);
      await store.initialize();
      // Never supply this confirmation on behalf of an owner who has not reviewed the new rules.
      const game = new Game(store, catalog, { production: true, publicUrl: target.publicUrl });
      const saved = store.state.settings.presenceRequired ? game.safeSettings(store.state.settings)
        : await game.updateSettings({ presenceRequired: true, promotionReviewed: true });
      console.log(JSON.stringify({ presenceRequired: saved.presenceRequired, campaignActive: saved.campaignActive, promotionReviewedAt: saved.promotionReviewedAt }, null, 2));
    }
    if (command.startsWith('test-winner-')) {
      const markerPath = join(configDir, 'test-winner.json');
      const qrPath = join(root, 'artifacts/test-winner-qr.png');
      let previous;
      try { previous = JSON.parse(await readFile(markerPath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('The existing private test marker could not be verified; no file was overwritten.'); }
      if (previous && (previous.projectId !== target.projectId || previous.branchId !== target.branchId || previous.testOnly !== true || !/^TST-[A-F0-9]{12}$/.test(previous.code))) throw new Error('The private test marker belongs to an unknown resource.');
      const source = JSON.parse(await readFile(join(root, 'config/prizes.json'), 'utf8'));
      const base = new URL(target.publicUrl).pathname.replace(/\/$/, '');
      const catalog = source.map((prize) => ({ ...prize, image: `${base}${prize.image}` }));
      const store = new PostgresStore(pool, catalog);
      await store.initialize();
      const game = new Game(store, catalog, { production: true, publicUrl: target.publicUrl });
      if (command === 'test-winner-create') {
        if (!previous) {
          try { await access(qrPath); throw new Error('A QR image already exists without a verified marker; it was preserved.'); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const coupon = await game.createTestWinner();
        if (previous && (previous.code !== coupon.code || previous.token !== coupon.token)) throw new Error('A different test coupon is already recorded locally; it was preserved.');
        const url = `${target.publicUrl}/cupon.html?test=${coupon.code}#${coupon.token}`;
        const marker = { projectId: target.projectId, branchId: target.branchId, testOnly: true, code: coupon.code,
          token: coupon.token, url, prize: coupon.prize.name, issuedAt: coupon.issuedAt, expiresAt: null, qr: 'artifacts/test-winner-qr.png' };
        await writeFile(markerPath, JSON.stringify(marker, null, 2), { mode: 0o600, ...(previous ? {} : { flag: 'wx' }) });
        await mkdir(join(root, 'artifacts'), { recursive: true });
        await writeFile(qrPath, await QRCode.toBuffer(url, { width: 768, margin: 4, errorCorrectionLevel: 'M' }));
        console.log(JSON.stringify({ code: coupon.code, prize: coupon.prize.name, testOnly: true, status: coupon.status, expiresAt: null,
          qr: 'artifacts/test-winner-qr.png', retainedUntilRequestedDeletion: true }, null, 2));
      } else {
        if (!previous) throw new Error('No verified private test marker exists; no record was deleted.');
        console.log(JSON.stringify(await game.deleteTestWinner(previous.code), null, 2));
        await unlink(markerPath);
        await unlink(qrPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
        for (const name of ['phone-390.png', 'downloaded-test.png', 'admin-readonly.png']) {
          await unlink(join(root, 'artifacts/test-winner-check', name)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
        }
      }
    }
    if (command === 'set-contact') {
      const catalog = JSON.parse(await readFile(join(root, 'config/prizes.json'), 'utf8'));
      const store = new PostgresStore(pool, catalog);
      await store.initialize();
      const game = new Game(store, catalog, { production: true, publicUrl: target.publicUrl });
      const settings = await game.updateSettings({ promotionContact: process.argv[3] });
      console.log(JSON.stringify({ promotionContact: settings.promotionContact, promotionReviewed: settings.promotionReviewed, campaignActive: settings.campaignActive }, null, 2));
    }
    if (command.startsWith('inventory-')) {
      const plan = JSON.parse(await readFile(join(root, 'deploy/inventory.json'), 'utf8'));
      if (plan.projectId !== target.projectId || plan.branchId !== target.branchId) throw new Error('Inventory plan does not match the selected project and branch.');
      const catalog = JSON.parse(await readFile(join(root, 'config/prizes.json'), 'utf8'));
      const store = new PostgresStore(pool, catalog);
      await store.initialize();
      if (command === 'inventory-apply') console.log(JSON.stringify(await applyInventoryPlan(store, catalog, plan.items), null, 2));
      else console.log(JSON.stringify({ active: store.state.settings.campaignActive, items: plan.items.map((item) => ({ ...item, currentStock: store.state.inventory[item.prizeId] ?? null })) }, null, 2));
    }
    if (command === 'migrate') {
      const catalog = JSON.parse(await readFile(join(root, 'config/prizes.json'), 'utf8'));
      await new PostgresStore(pool, catalog).migrate();
      await prepareCredentials();
    }
    const { rows } = await pool.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2");
    console.log(JSON.stringify({ project: target.projectId, branch: target.branchId, tables: rows }, null, 2));
    if (command === 'verify') {
      const { rows: states } = await pool.query('SELECT document FROM premio.state WHERE id = 1');
      const state = states[0]?.document;
      validateState(state);
      const { totalParticipations, cycleProgress, participations, coupons, inventory, settings, audit } = state;
      const businessFingerprint = createHash('sha256').update(JSON.stringify({ totalParticipations, cycleProgress, participations, coupons, inventory, settings, audit })).digest('hex');
      console.log(JSON.stringify({ active: state.settings.campaignActive, cooldownEnabled: state.settings.cooldownEnabled,
        cooldownHours: state.settings.cooldownHours, stock: Object.values(state.inventory).reduce((sum, value) => sum + value, 0),
        participations: state.totalParticipations, coupons: state.coupons.length, testCoupons: (state.testCoupons ?? []).length,
        presenceRequired: state.settings.presenceRequired === true, visits: (state.visits ?? []).length, auditEntries: state.audit.length, businessFingerprint,
        verificationSchemasRemaining: rows.some((row) => row.table_schema.startsWith('premio_verify_')) }, null, 2));
    }
  } finally { await pool.end(); }
} else if (command === 'test') {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/neon.test.js'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, NEON_VERIFY_DATABASE_URL: await databaseUrl() }, timeout: 180_000,
  });
  process.exitCode = result.status ?? 1;
} else if (command === 'diagnose') {
  let text = await readFile(join(configDir, 'last-cli-error.log'), 'utf8');
  const environment = await readFile(environmentFile, 'utf8');
  for (const line of environment.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (separator > 0 && /PASSWORD|SECRET|TOKEN|DATABASE_URL/.test(key) && value.length > 8) text = text.replaceAll(value, '[redacted]');
  }
  console.log(text.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[redacted-database-url]').slice(0, 6000));
} else if (command === 'deploy') {
  await prepareCredentials();
  // No env pull: never overwrite the user's local .env or expose DATABASE_URL.
  cli(['config', 'plan', '--config', 'neon.ts', '--env', environmentFile, ...selection]);
  const raw = cli(['deploy', '--config', 'neon.ts', '--env', environmentFile, '--no-env-pull', ...selection], 240_000);
  await writeFile(join(configDir, 'last-deployment.json'), raw, { mode: 0o600 });
  const functions = JSON.parse(cli(['functions', 'list', ...selection]));
  const deployed = functions.find((entry) => entry.slug === 'api');
  if (!deployed) throw new Error('API deployment was not found.');
  const safe = { project: target.projectId, branch: target.branchId, url: deployed.invocation_url, status: deployed.active_deployment?.status ?? deployed.current_deployment?.status };
  await mkdir(join(root, 'artifacts'), { recursive: true });
  await writeFile(join(root, 'artifacts/neon-deployment.json'), JSON.stringify(safe, null, 2));
  console.log(JSON.stringify(safe, null, 2));
} else throw new Error('Use inspect, migrate, test, deploy, verify, inventory-plan, inventory-apply, set-contact, test-winner-create, test-winner-delete, require-presence or diagnose.');
