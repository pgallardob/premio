import QRCode from 'qrcode';
import { createApiRouter, sendJson } from '../api.js';
import { AppError } from '../errors.js';

class WebResponse {
  constructor() { this.headers = new Map(); this.status = 200; this.body = null; }
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  getHeader(name) { return this.headers.get(name.toLowerCase()); }
  writeHead(status, headers = {}) {
    this.status = status;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
  }
  end(body) { this.body = body ?? null; }
  response() { return new Response(this.body, { status: this.status, headers: Object.fromEntries(this.headers) }); }
}

export function createNeonHandler({ config, game, auth, limiter, ready = async () => {}, clock = Date.now }) {
  const allowedOrigin = new URL(config.publicUrl).origin;
  const qr = (text) => QRCode.toBuffer(text, { width: 512, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#102414', light: '#ffffff' } });
  const route = createApiRouter({ config, game, auth, limiter, qr });
  return async (request) => {
    const output = new WebResponse();
    output.setHeader('Cache-Control', 'no-store');
    output.setHeader('X-Content-Type-Options', 'nosniff');
    output.setHeader('Referrer-Policy', 'no-referrer');
    output.setHeader('Vary', 'Origin');
    const origin = request.headers.get('origin');
    if (origin === allowedOrigin) {
      output.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      output.setHeader('Access-Control-Expose-Headers', 'X-Olivos-Device, X-Olivos-Session, Retry-After, Content-Disposition');
    }
    try {
      if (origin && origin !== allowedOrigin) throw new AppError(403, 'FORBIDDEN', 'El origen de la solicitud no está autorizado.');
      if (request.method === 'OPTIONS') {
        output.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        output.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Olivos-Device, Idempotency-Key');
        output.setHeader('Access-Control-Max-Age', '600');
        output.writeHead(204);
        return output.response();
      }
      await ready();
      const pathname = new URL(request.url).pathname;
      if (pathname === '/healthz' && request.method === 'GET') sendJson(output, { status: 'ok', persistence: 'postgres' });
      else {
        const incoming = { method: request.method, headers: Object.fromEntries(request.headers),
          async *[Symbol.asyncIterator]() { if (request.body) for await (const chunk of request.body) yield Buffer.from(chunk); } };
        // Until a trusted gateway address is documented, use a non-spoofable global limit.
        await route(incoming, output, pathname, 'global');
      }
    } catch (error) {
      const status = error instanceof AppError ? error.status : 503;
      if (!(error instanceof AppError)) console.error('Neon API failure:', error.code ?? 'INTERNAL_ERROR');
      if (error.details?.retryAt) output.setHeader('Retry-After', Math.max(1, Math.ceil((Date.parse(error.details.retryAt) - clock()) / 1000)));
      sendJson(output, { error: { code: error instanceof AppError ? error.code : 'SERVICE_UNAVAILABLE',
        message: error instanceof AppError ? error.message : 'No pudimos completar la operación. Intenta nuevamente sin cambiar tu participación.', ...(error.details ?? {}) } }, status);
    }
    return output.response();
  };
}
