import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { FileStore } from './store.js';
import { Game } from './game.js';
import { Auth, RateLimiter } from './auth.js';
import { AppError, requireFields, requireInput } from './errors.js';
import { createClientAddressResolver } from './proxy.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const publicFiles = new Map(['/', '/index.html', '/admin.html', '/cupon.html', '/cartel.html', '/instalar.html', '/offline.html', '/sw.js', '/manifest.webmanifest'].map((path) => [path, path === '/' ? 'index.html' : path.slice(1)]));
const vendorFiles = new Map([
  ['/vendor/pico.min.css', 'node_modules/@picocss/pico/css/pico.min.css'],
  ...[400, 500, 600, 700, 800].map((weight) => [`/vendor/manrope-${weight}.woff2`, `node_modules/@fontsource/manrope/files/manrope-latin-${weight}-normal.woff2`]),
  ...[400, 500, 600, 700, 800].map((weight) => [`/vendor/syne-${weight}.woff2`, `node_modules/@fontsource/syne/files/syne-latin-${weight}-normal.woff2`]),
]);

function sendJson(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Utiliza el formato application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'INVALID_JSON', 'No se pudo leer la solicitud JSON.'); }
}

function securityHeaders(response, config) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cache-Control', 'no-store');
  if (config.publicUrl.startsWith('https://')) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

async function serveStatic(pathname, request, response) {
  let file = publicFiles.get(pathname) ?? vendorFiles.get(pathname);
  if (!file && /^\/(assets|img)\/[A-Za-z0-9_/.\-]+$/.test(pathname)
    && pathname.split('/').every((part) => part !== '..' && !part.startsWith('.'))
    && Object.hasOwn(types, extname(pathname))) file = pathname.slice(1);
  if (!file) throw new AppError(404, 'NOT_FOUND', 'Esta página no existe.');
  let buffer;
  try { buffer = await readFile(resolve(root, file)); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') throw new AppError(404, 'NOT_FOUND', 'Este archivo no existe.');
    throw error;
  }
  response.writeHead(200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Content-Length': buffer.length,
    'Cache-Control': 'no-cache',
    ...(pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
  });
  response.end(request.method === 'HEAD' ? undefined : buffer);
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function createApplication(config) {
  const catalog = JSON.parse(await readFile(resolve(root, 'config/prizes.json'), 'utf8'));
  if (!Array.isArray(catalog) || !catalog.length || new Set(catalog.map((prize) => prize.id)).size !== catalog.length
    || catalog.some((prize) => !/^[a-z0-9-]+$/.test(prize.id) || typeof prize.name !== 'string' || !prize.name.trim()
      || prize.name.length > 70 || typeof prize.description !== 'string' || !prize.description.trim() || prize.description.length > 300
      || typeof prize.category !== 'string' || !prize.category.trim() || prize.category.length > 40 || typeof prize.featured !== 'boolean'
      || !Number.isInteger(prize.initialStock) || prize.initialStock < 0 || prize.initialStock > 10000
      || !/^\/assets\/images\/[a-z0-9-]+\.(svg|png|jpeg)$/.test(prize.image))) throw new Error('El catálogo contiene premios no válidos.');
  const clientAddress = createClientAddressResolver(config.trustedProxies);
  const store = new FileStore(config.dataDir, catalog, { settings: config.initialSettings, inventory: config.initialInventory });
  await store.initialize();
  if (config.production && store.state.settings.cooldownEnabled !== true) {
    await store.close();
    throw new Error('Producción requiere la protección de 24 horas activada.');
  }
  if (config.production && store.state.settings.campaignActive && (!config.promotionReviewed || !config.promotionContact)) {
    await store.close();
    throw new Error('La campaña activa requiere bases revisadas y contacto antes de iniciar producción.');
  }
  const clock = config.clock ?? Date.now;
  const game = new Game(store, catalog, config, clock);
  const auth = new Auth(config, clock);
  const limiter = new RateLimiter(clock);
  const qr = (text) => QRCode.toBuffer(text, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#102414', light: '#ffffff' } });

  const server = createServer(async (request, response) => {
    securityHeaders(response, config);
    try {
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url, config.publicUrl).pathname); }
      catch { throw new AppError(400, 'INVALID_INPUT', 'La dirección no es válida.'); }
      const method = request.method;
      if (pathname === '/healthz' && ['GET', 'HEAD'].includes(method)) return sendJson(response, { status: 'ok' });
      if (config.production) {
        const target = new URL(config.publicUrl);
        const supplied = typeof request.headers.host === 'string' ? request.headers.host.toLowerCase() : '';
        const explicitDefaultPort = !target.port && supplied === `${target.hostname}:${target.protocol === 'https:' ? '443' : '80'}`;
        if (supplied !== target.host && !explicitDefaultPort) throw new AppError(421, 'INVALID_HOST', 'El dominio de la solicitud no está autorizado.');
      }
      if (!pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method)) throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.');
        await serveStatic(pathname, request, response);
        return;
      }
      const ip = clientAddress(request);
      limiter.take(`api:${ip}`, 300, 60_000);
      const mutation = !['GET', 'HEAD'].includes(method);
      if (mutation && request.headers.origin && request.headers.origin !== new URL(config.publicUrl).origin) {
        throw new AppError(403, 'FORBIDDEN', 'El origen de la solicitud no está autorizado.');
      }

      if (pathname === '/api/admin/login' && method === 'POST') {
        limiter.take(`login:${ip}`, 5, 15 * 60_000);
        const input = await readJson(request);
        requireFields(input, ['password']);
        requireInput(typeof input.password === 'string' && input.password.length >= 1 && input.password.length <= 256, 'Ingresa una contraseña válida.');
        sendJson(response, await auth.login(input.password, response));
        return;
      }

      if (pathname.startsWith('/api/admin/')) {
        const session = auth.requireSession(request, mutation);
        if (pathname === '/api/admin/session' && method === 'GET') return sendJson(response, session);
        if (pathname === '/api/admin/logout' && method === 'POST') {
          requireFields(await readJson(request), []);
          auth.logout(request, response);
          return sendJson(response, { ok: true });
        }
        if (pathname === '/api/admin/dashboard' && method === 'GET') return sendJson(response, await game.dashboard());
        if (pathname === '/api/admin/settings' && method === 'PATCH') return sendJson(response, await game.updateSettings(await readJson(request)));
        const inventory = pathname.match(/^\/api\/admin\/inventory\/([\w-]+)$/);
        if (inventory && method === 'PATCH') return sendJson(response, await game.updateInventory(inventory[1], await readJson(request)));
        const coupon = pathname.match(/^\/api\/admin\/coupons\/(OLV-[A-F0-9]{12})(\/redeem)?$/);
        if (coupon && !coupon[2] && method === 'GET') return sendJson(response, await game.getCoupon(coupon[1], true));
        if (coupon?.[2] && method === 'POST') {
          requireFields(await readJson(request), []);
          return sendJson(response, await game.redeem(coupon[1]));
        }
        if (pathname === '/api/admin/export' && method === 'GET') {
          const { coupons } = await game.dashboard();
          const rows = [['Código', 'Premio', 'Estado', 'Emisión', 'Vencimiento', 'Canje'],
            ...coupons.map((item) => [item.code, item.prize.name, item.status, item.issuedAt, item.expiresAt, item.redeemedAt])];
          response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="los-olivos-cupones.csv"' });
          response.end(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`);
          return;
        }
        throw new AppError(404, 'NOT_FOUND', 'La operación no existe.');
      }

      if (pathname === '/api/status' && method === 'GET') {
        auth.device(request, response);
        return sendJson(response, await game.status());
      }
      if (pathname === '/api/participations' && method === 'POST') {
        limiter.take(`participate:${ip}`, 60, 60_000);
        const deviceId = auth.device(request, response);
        return sendJson(response, await game.participate(deviceId, request.headers['idempotency-key'], await readJson(request)));
      }
      if (pathname === '/api/wallet' && method === 'GET') return sendJson(response, await game.wallet(auth.device(request, response)));
      if (pathname === '/api/wallet/coupons' && method === 'POST') {
        limiter.take(`wallet:${ip}`, 60, 60_000);
        return sendJson(response, await game.saveCoupon(auth.device(request, response), await readJson(request)));
      }
      if (pathname === '/api/campaign/qr' && method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end(await qr(config.publicUrl));
        return;
      }
      const coupon = pathname.match(/^\/api\/coupons\/([a-f0-9]{64})(\/qr)?$/);
      if (coupon && method === 'GET') {
        const data = await game.getCoupon(coupon[1]);
        if (!coupon[2]) return sendJson(response, data);
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end(await qr(`${config.publicUrl}/admin.html#redeem=${data.code}`));
        return;
      }
      throw new AppError(404, 'NOT_FOUND', 'La operación no existe.');
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      const status = error instanceof AppError ? error.status : 500;
      if (status === 500) console.error('Request failed:', error.message);
      if (error.details?.retryAt) response.setHeader('Retry-After', Math.max(1, Math.ceil((Date.parse(error.details.retryAt) - clock()) / 1000)));
      sendJson(response, { error: { code: error.code && error instanceof AppError ? error.code : 'INTERNAL_ERROR', message: status === 500 ? 'No pudimos completar la operación. Intenta nuevamente sin cambiar tu participación.' : error.message, ...(error.details ?? {}) } }, status);
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.maxHeadersCount = 40;
  server.maxConnections = 200;
  return { server, store, game, close: async () => {
    if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
    await store.close();
  } };
}
