import pg from 'pg';
import catalogSource from '../../config/prizes.json' with { type: 'json' };
import { Game } from '../game.js';
import { PostgresStore } from './store.js';
import { NeonAuth, PostgresRateLimiter } from './auth.js';
import { createNeonHandler } from './handler.js';

const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
const website = new URL(publicUrl);
if (website.protocol !== 'https:' || website.username || website.password || website.search || website.hash) throw new Error('A public HTTPS website URL is required.');
if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.ADMIN_PASSWORD_HASH ?? '') || !/^[a-f0-9]{64}$/.test(process.env.DEVICE_SECRET ?? '') || process.env.CREDENTIALS_ROTATED !== 'true') throw new Error('Fresh deployment credentials are required.');
const config = { publicUrl, adminPasswordHash: process.env.ADMIN_PASSWORD_HASH, deviceSecret: process.env.DEVICE_SECRET,
  production: true, promotionReviewed: process.env.PROMOTION_REVIEWED === 'true', promotionContact: process.env.PROMOTION_CONTACT ?? '' };
const base = website.pathname.replace(/\/$/, '');
const catalog = catalogSource.map((prize) => ({ ...prize, image: `${base}${prize.image}` }));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
pool.on('error', (error) => console.error('Database pool failure:', error.code ?? 'CONNECTION_ERROR'));
const store = new PostgresStore(pool, catalog);
let initialization;
const ready = async () => {
  initialization ??= store.initialize().catch((error) => { initialization = undefined; throw error; });
  await initialization;
  if (store.state.settings.cooldownEnabled !== true) throw new Error('The 24-hour protection is mandatory.');
  if (store.state.settings.campaignActive && (!config.promotionReviewed || !config.promotionContact)) throw new Error('An active campaign requires reviewed terms and a contact.');
};
export default createNeonHandler({ config, ready, game: new Game(store, catalog, config), auth: new NeonAuth(config, store), limiter: new PostgresRateLimiter(store, config.deviceSecret) });
