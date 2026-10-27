import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/auth.js';

const name = process.argv.find((value) => value.startsWith('--file='))?.slice(7) ?? '.env';
if (!['.env', '.env.production'].includes(name)) throw new Error('El archivo de configuración debe ser .env o .env.production.');
const file = new URL(`../${name}`, import.meta.url);
let existing = '';
try { existing = await readFile(file, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (/^ADMIN_PASSWORD_HASH=.+$/m.test(existing) && !process.argv.includes('--rotate-password')) {
  console.log('La configuración ya existe; no se modificó. Para cambiar la contraseña: node scripts/setup.js --rotate-password');
} else {
  const password = randomBytes(15).toString('base64url');
  const hash = await hashPassword(password);
  const secret = existing.match(/^DEVICE_SECRET=(.+)$/m)?.[1] ?? randomBytes(32).toString('hex');
  const defaults = name === '.env.production'
    ? 'HOST=0.0.0.0\nPORT=8080\nPUBLIC_URL=https://CHANGE-ME.invalid\nDOMAIN=CHANGE-ME.invalid\nTLS_EMAIL=\nDATA_DIR=./data\nBACKUP_DIR=./backups\nNODE_ENV=production\nPROMOTION_CONTACT=\nPROMOTION_REVIEWED=false\n'
    : 'HOST=127.0.0.1\nPORT=4173\nPUBLIC_URL=http://localhost:4173\nDATA_DIR=./data\nNODE_ENV=development\n';
  const content = (existing || defaults).replace(/^ADMIN_PASSWORD_HASH=.*\r?\n?/gm, '').replace(/^DEVICE_SECRET=.*\r?\n?/gm, '');
  const productionMarker = name === '.env.production' ? '\nCREDENTIALS_ROTATED=true' : '';
  await writeFile(file, `${content.replace(/^CREDENTIALS_ROTATED=.*\r?\n?/gm, '').trimEnd()}\nADMIN_PASSWORD_HASH=${hash}\nDEVICE_SECRET=${secret}${productionMarker}\n`, { mode: 0o600 });
  const nextStep = name === '.env.production' ? 'Complete dominio, HTTPS y datos de la promoción antes de desplegar; consulte docs/PRODUCCION.md.' : 'Inicie con: npm start';
  console.log(`\nConfiguración preparada: ${name}\nContraseña de administración (se muestra una sola vez): ${password}\n\nGuárdela en un gestor de contraseñas. No se guarda en texto plano.\n${nextStep}\n`);
}
