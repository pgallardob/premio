import { readFile, access, constants, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadConfig } from '../server/config.js';
import { promotionReadiness } from '../server/game.js';
import { validateState } from '../server/store.js';

const checks = [];
const add = (name, ok, action) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { action }) });
let config;
try { config = loadConfig(); add('Credenciales y formato de configuración', true); }
catch (error) { add('Credenciales y formato de configuración', false, error.message); }
add('Perfil de producción', process.env.NODE_ENV === 'production', 'Configure NODE_ENV=production en el servidor de destino.');
const [major, minor, patch] = process.versions.node.split('.').map(Number);
add('Runtime actualizado', major > 24 || (major === 24 && (minor > 22 || (minor === 22 && patch >= 1))), 'Use Node.js 24.22.1 LTS o una versión compatible actualizada.');
let url;
try { url = new URL(process.env.PUBLIC_URL ?? ''); } catch { /* Report below. */ }
add('URL HTTPS pública', url?.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url?.hostname) && !/\.(invalid|example|test)$/.test(url?.hostname ?? ''), 'Configure el dominio real, su DNS y un certificado HTTPS de confianza.');
add('Credenciales nuevas de publicación', process.env.CREDENTIALS_ROTATED === 'true', 'Genere .env.production con credenciales nuevas; no reutilice la contraseña compartida durante el desarrollo.');
let state;
try { state = JSON.parse(await readFile(resolve(process.env.DATA_DIR ?? './data', 'state.json'), 'utf8')); }
catch { /* A fresh volume is initialized safely at startup. */ }
const readiness = promotionReadiness(state?.settings ?? {}, config ?? { promotionReviewed: process.env.PROMOTION_REVIEWED === 'true', promotionContact: process.env.PROMOTION_CONTACT ?? '' });
add('Bases y privacidad revisadas', readiness.promotionReviewed === true, 'Confirme la revisión de bases y privacidad desde Administración.');
add('Contacto de la promoción', Boolean(readiness.promotionContact), 'Configure un contacto real para consultas de la promoción.');
if (state) {
  try { validateState(state); add('Datos válidos', true); }
  catch (error) { add('Datos válidos', false, error.message); }
  add('Protección de 24 horas', state.settings?.cooldownEnabled === true, 'La protección debe permanecer activada.');
  add('Inventario real disponible', Object.values(state.inventory ?? {}).some((stock) => stock > 0), 'Cargue unidades reales en Administración antes de abrir la campaña.');
  add('Campaña habilitada por el local', state.settings?.campaignActive === true, 'Active la campaña después de completar todos los controles anteriores.');
} else add('Datos inicializados', false, 'El volumen nuevo comienza pausado y sin stock; inicie el servidor y configure el local.');
for (const file of ['manifest.webmanifest', 'sw.js', 'instalar.html', 'offline.html', 'assets/images/app/icon-192.png', 'assets/images/app/icon-512.png', 'assets/images/app/apple-touch-icon.png']) {
  try { await access(resolve(file), constants.R_OK); add(`PWA: ${file}`, true); }
  catch { add(`PWA: ${file}`, false, 'Falta un archivo necesario para la instalación.'); }
}
const blocked = checks.some((check) => !check.ok);
const report = JSON.stringify({ status: blocked ? 'blocked' : 'ready-for-live-verification', checks,
  note: 'Este control local no verifica DNS, certificado, acceso desde Internet, instalación física ni asesoramiento legal.' }, null, 2);
const output = process.argv.find((value) => value.startsWith('--output='))?.slice(9);
if (output) { const file = resolve(output); await mkdir(dirname(file), { recursive: true }); await writeFile(file, `${report}\n`); }
console.log(report);
process.exitCode = blocked ? 1 : 0;
