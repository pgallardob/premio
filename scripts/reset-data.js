import { readFile, readdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { FileStore } from '../server/store.js';

if (!process.argv.includes('--confirm=DELETE_ALL_RECORDS')) throw new Error('Esta operación elimina todos los registros. Se requiere --confirm=DELETE_ALL_RECORDS y el servidor detenido.');
const catalog = JSON.parse(await readFile(new URL('../config/prizes.json', import.meta.url), 'utf8'));
const store = new FileStore(resolve(process.env.DATA_DIR ?? './data'), catalog);
await store.initialize();
try {
  const result = await store.transaction((state) => {
    state.participations = [];
    state.coupons = [];
    state.lastParticipation = {};
    state.audit = [];
    state.totalParticipations = 0;
    state.cycleProgress = 0;
    state.inventory = Object.fromEntries(catalog.map((prize) => [prize.id, 0]));
    state.settings.cooldownEnabled = true;
    state.settings.cooldownHours = 24;
    state.settings.campaignActive = false;
    state.settings.dailyCodeHash = null;
    state.settings.dailyCodeDate = null;
    return { participations: 0, coupons: 0, redemptions: 0, auditRecords: 0, availableStock: 0, campaignActive: false, cooldownEnabled: true };
  });
  for (const name of await readdir(store.directory)) {
    if (/^state\.[a-f0-9-]+\.tmp$/.test(name)) await unlink(join(store.directory, name));
  }
  console.log(JSON.stringify(result, null, 2));
  console.log('Registros eliminados sin conservar una copia. Credenciales y catálogo preservados; confirme inventario real antes de activar.');
} finally { await store.close(); }
