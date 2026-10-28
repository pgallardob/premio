import { AppError, requireFields, requireInput } from './errors.js';

export function sendJson(response, value, status = 200) {
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

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

// Both transports use the same routes and game rules.
export function createApiRouter({ game, auth, limiter, qr, config }) {
  return async (request, response, pathname, ip) => {
    const method = request.method;
    const mutation = !['GET', 'HEAD'].includes(method);
    await limiter.take(`api:${ip}`, 300, 60_000);
    if (mutation && request.headers.origin && request.headers.origin !== new URL(config.publicUrl).origin) {
      throw new AppError(403, 'FORBIDDEN', 'El origen de la solicitud no está autorizado.');
    }
    if (pathname === '/api/admin/login' && method === 'POST') {
      await limiter.take(`login:${ip}`, 5, 15 * 60_000);
      const input = await readJson(request);
      requireFields(input, ['password']);
      requireInput(typeof input.password === 'string' && input.password.length >= 1 && input.password.length <= 256, 'Ingresa una contraseña válida.');
      return sendJson(response, await auth.login(input.password, response));
    }
    if (pathname.startsWith('/api/admin/')) {
      const session = await auth.requireSession(request, mutation);
      if (pathname === '/api/admin/session' && method === 'GET') return sendJson(response, session);
      if (pathname === '/api/admin/logout' && method === 'POST') {
        requireFields(await readJson(request), []);
        await auth.logout(request, response);
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
      await limiter.take(`participate:${ip}`, 60, 60_000);
      return sendJson(response, await game.participate(auth.device(request, response), request.headers['idempotency-key'], await readJson(request)));
    }
    if (pathname === '/api/wallet' && method === 'GET') return sendJson(response, await game.wallet(auth.device(request, response)));
    if (pathname === '/api/wallet/coupons' && method === 'POST') {
      await limiter.take(`wallet:${ip}`, 60, 60_000);
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
  };
}
