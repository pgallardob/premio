import { createHmac, randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from './errors.js';

const derive = promisify(scrypt);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}

export function cookies(request) {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1)];
  }));
}

export class RateLimiter {
  constructor(clock = Date.now) { this.entries = new Map(); this.clock = clock; }

  take(key, maximum, windowMs) {
    const now = this.clock();
    if (this.entries.size > 2000) {
      for (const [entryKey, entry] of this.entries) if (entry.until <= now) this.entries.delete(entryKey);
      if (this.entries.size > 10000) throw new AppError(429, 'RATE_LIMITED', 'El servicio está ocupado. Intenta nuevamente en unos minutos.');
    }
    let entry = this.entries.get(key);
    if (!entry || entry.until <= now) entry = { count: 0, until: now + windowMs };
    entry.count += 1;
    this.entries.set(key, entry);
    if (entry.count > maximum) throw new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un momento antes de volver a intentar.', { retryAt: new Date(entry.until).toISOString() });
  }
}

export class Auth {
  constructor(config, clock = Date.now) {
    this.config = config;
    this.clock = clock;
    this.sessions = new Map();
  }

  setCookie(response, name, value, maxAge) {
    const secure = this.config.publicUrl.startsWith('https://') ? '; Secure' : '';
    const cookie = `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
    const current = response.getHeader('Set-Cookie') ?? [];
    response.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : [current]), cookie]);
  }

  device(request, response) {
    const cookie = cookies(request).olivos_device ?? '';
    const [id, signature] = cookie.split('.');
    const sign = (value) => createHmac('sha256', this.config.deviceSecret).update(value).digest('hex');
    if (/^[a-f0-9]{32}$/.test(id ?? '') && equal(signature, sign(id))) return id;
    const nextId = randomBytes(16).toString('hex');
    this.setCookie(response, 'olivos_device', `${nextId}.${sign(nextId)}`, 365 * 86400);
    return nextId;
  }

  async login(password, response) {
    const [salt, expected] = this.config.adminPasswordHash.split(':');
    const candidate = (await derive(password, salt, 64)).toString('hex');
    if (!equal(candidate, expected)) throw new AppError(401, 'UNAUTHORIZED', 'La contraseña no es correcta. Intenta nuevamente.');
    for (const [key, session] of this.sessions) if (session.expires <= this.clock()) this.sessions.delete(key);
    if (this.sessions.size >= 100) this.sessions.delete(this.sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    const session = { csrfToken: randomBytes(32).toString('hex'), expires: this.clock() + 8 * 3_600_000 };
    this.sessions.set(digest(token), session);
    this.setCookie(response, 'olivos_session', token, 8 * 3600);
    return this.view(session);
  }

  requireSession(request, mutation = false) {
    const token = cookies(request).olivos_session ?? '';
    const session = this.sessions.get(digest(token));
    if (!session || session.expires <= this.clock()) {
      this.sessions.delete(digest(token));
      throw new AppError(401, 'UNAUTHORIZED', 'Tu sesión terminó. Ingresa nuevamente para continuar.');
    }
    if (mutation && !equal(request.headers['x-csrf-token'], session.csrfToken)) {
      throw new AppError(403, 'FORBIDDEN', 'No se pudo verificar la solicitud. Actualiza la página.');
    }
    return this.view(session);
  }

  view(session) { return { csrfToken: session.csrfToken, expiresAt: new Date(session.expires).toISOString() }; }

  logout(request, response) {
    this.sessions.delete(digest(cookies(request).olivos_session ?? ''));
    this.setCookie(response, 'olivos_session', '', 0);
  }
}
