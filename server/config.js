import { resolve } from 'node:path';

export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 4173);
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, '');
  const url = new URL(publicUrl);
  const production = env.NODE_ENV === 'production';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido.');
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('PUBLIC_URL debe ser un origen HTTP o HTTPS sin rutas ni credenciales.');
  if (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /\.(invalid|example|test)$/.test(url.hostname))) throw new Error('Producción requiere una URL HTTPS pública real.');
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.ADMIN_PASSWORD_HASH ?? '') || !/^[a-f0-9]{64}$/.test(env.DEVICE_SECRET ?? '')) throw new Error('Faltan credenciales válidas. Ejecute node scripts/setup.js.');
  if (production && env.CREDENTIALS_ROTATED !== 'true') throw new Error('Genere credenciales nuevas de publicación antes de iniciar producción.');
  const promotionContact = (env.PROMOTION_CONTACT ?? '').trim();
  if (promotionContact.length > 200) throw new Error('PROMOTION_CONTACT no puede superar 200 caracteres.');
  return { port, host: env.HOST ?? '127.0.0.1', publicUrl, production,
    adminPasswordHash: env.ADMIN_PASSWORD_HASH, deviceSecret: env.DEVICE_SECRET,
    dataDir: resolve(env.DATA_DIR ?? './data'),
    trustedProxies: (env.TRUSTED_PROXIES ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    promotionReviewed: env.PROMOTION_REVIEWED === 'true', promotionContact };
}
