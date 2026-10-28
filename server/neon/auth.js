import { createHash, createHmac } from 'node:crypto';
import { Auth } from '../auth.js';
import { AppError } from '../errors.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const sessionToken = (request) => /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '')?.[1] ?? '';

export class NeonAuth extends Auth {
  constructor(config, store, clock = Date.now) {
    super(config, clock);
    this.store = store;
  }

  setCookie(response, name, value) {
    response.setHeader(name === 'olivos_device' ? 'X-Olivos-Device' : 'X-Olivos-Session', value);
  }

  device(request, response) {
    const token = request.headers['x-olivos-device'] ?? '';
    return super.device({ headers: { cookie: `olivos_device=${token}` } }, response);
  }

  async login(password, response) {
    let token;
    const view = await super.login(password, { setHeader: (_, value) => { token = value; } });
    const key = digest(token);
    const session = this.sessions.get(key);
    this.sessions.delete(key);
    await this.store.pool.query(`DELETE FROM ${this.store.schema}.sessions WHERE expires <= $1`, [this.clock()]);
    await this.store.pool.query(`INSERT INTO ${this.store.schema}.sessions (token_hash, csrf_token, expires) VALUES ($1, $2, $3)`, [key, session.csrfToken, session.expires]);
    response.setHeader('X-Olivos-Session', token);
    return view;
  }

  async requireSession(request, mutation = false) {
    const token = sessionToken(request);
    if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Tu sesión terminó. Ingresa nuevamente para continuar.');
    const key = digest(token);
    const { rows } = await this.store.pool.query(`SELECT csrf_token, expires FROM ${this.store.schema}.sessions WHERE token_hash = $1`, [key]);
    if (rows[0]) this.sessions.set(key, { csrfToken: rows[0].csrf_token, expires: Number(rows[0].expires) });
    try { return super.requireSession({ headers: { ...request.headers, cookie: `olivos_session=${token}` } }, mutation); }
    finally { this.sessions.delete(key); }
  }

  async logout(request, response) {
    await this.store.pool.query(`DELETE FROM ${this.store.schema}.sessions WHERE token_hash = $1`, [digest(sessionToken(request))]);
    response.setHeader('X-Olivos-Session', '');
  }
}

export class PostgresRateLimiter {
  constructor(store, secret, clock = Date.now) { Object.assign(this, { store, secret, clock }); }

  async take(key, maximum, windowMs) {
    const now = this.clock();
    const hash = createHmac('sha256', this.secret).update(key).digest('hex');
    const { rows } = await this.store.pool.query(`INSERT INTO ${this.store.schema}.rate_limits (key_hash, hits, until_ms)
      VALUES ($1, 1, $3) ON CONFLICT (key_hash) DO UPDATE SET
      hits = CASE WHEN rate_limits.until_ms <= $2 THEN 1 ELSE rate_limits.hits + 1 END,
      until_ms = CASE WHEN rate_limits.until_ms <= $2 THEN $3 ELSE rate_limits.until_ms END
      RETURNING hits, until_ms`, [hash, now, now + windowMs]);
    if (rows[0].hits > maximum) throw new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un momento antes de volver a intentar.', { retryAt: new Date(Number(rows[0].until_ms)).toISOString() });
  }
}
