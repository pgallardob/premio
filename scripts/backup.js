import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { FileStore, validateState } from '../server/store.js';

const directory = resolve(process.env.DATA_DIR ?? './data');
const store = new FileStore(directory, []);
await mkdir(directory, { recursive: true });
await store.acquireLock();
try {
  const restore = process.argv.find((value) => value.startsWith('--restore='))?.slice(10);
  if (restore) {
    if (!process.argv.includes('--confirm=RESTORE_STATE')) throw new Error('Restaurar requiere --confirm=RESTORE_STATE y el servidor detenido.');
    const state = JSON.parse(await readFile(resolve(restore), 'utf8'));
    validateState(state);
    if (state.settings.cooldownEnabled !== true) throw new Error('No se restaura un estado con la protección de 24 horas desactivada.');
    state.settings.campaignActive = false;
    await store.persist(state);
    console.log('Copia restaurada y campaña pausada. Revise el inventario antes de activar.');
  } else {
    const state = JSON.parse(await readFile(store.file, 'utf8'));
    validateState(state);
    const backups = resolve(process.env.BACKUP_DIR ?? './backups');
    await mkdir(backups, { recursive: true });
    const file = join(backups, `state-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
    await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx', flush: true });
    console.log(`Copia privada creada: ${file}`);
  }
} finally { await store.close(); }
