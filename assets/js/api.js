import { deployment } from './deployment.js?v=0.2.3';

let csrfToken = '';
const remote = deployment.bearerTransport === true;
const storageScope = deployment.apiBaseUrl ?? '';
const memory = new Map();

function storedToken(name, value) {
  const storage = name === 'device' ? 'localStorage' : 'sessionStorage';
  const key = `olivos_${name}_v1`;
  if (value !== undefined) {
    memory.set(name, value);
    try {
      if (value) window[storage].setItem(key, JSON.stringify({ origin: storageScope, token: value }));
      else window[storage].removeItem(key);
    } catch { /* An in-memory session still works when storage is unavailable. */ }
    return value;
  }
  try {
    const saved = JSON.parse(window[storage].getItem(key) ?? 'null');
    if (saved?.origin === storageScope && typeof saved.token === 'string') return saved.token;
  } catch { /* Private browsing may disable storage. */ }
  return memory.get(name) ?? '';
}

export function apiUrl(path) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path.');
  return `${deployment.apiBaseUrl ?? ''}${path}`;
}

export class ApiError extends Error {
  constructor(error, status = 0) {
    super(error.message);
    this.code = error.code;
    this.status = status;
    this.retryAt = error.retryAt;
  }
}

export function setCsrfToken(value) { csrfToken = value; }

export async function request(path, { method = 'GET', body, headers = {}, responseType = 'json' } = {}) {
  if (!deployment.backendAvailable) throw new ApiError({ code: 'BACKEND_NOT_CONFIGURED', message: deployment.backendNotice });
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const device = remote ? storedToken('device') : '';
    const session = remote && path.startsWith('/api/admin/') ? storedToken('session') : '';
    response = await fetch(apiUrl(path), {
      method,
      credentials: remote ? 'omit' : 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(device ? { 'X-Olivos-Device': device } : {}),
        ...(session ? { Authorization: `Bearer ${session}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    clearTimeout(timeout);
    throw new ApiError({ code: 'NETWORK_ERROR', message: 'No pudimos conectar con el local. Revisa tu conexión e intenta nuevamente.' });
  }
  if (remote) {
    const device = response.headers.get('X-Olivos-Device');
    const session = response.headers.get('X-Olivos-Session');
    if (device && /^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(device)) storedToken('device', device);
    if (session !== null && (!session || /^[a-f0-9]{64}$/.test(session))) storedToken('session', session);
    if (response.status === 401 && path.startsWith('/api/admin/')) storedToken('session', '');
  }
  if (response.ok && responseType === 'blob') {
    try { return await response.blob(); } finally { clearTimeout(timeout); }
  }
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError({ code: 'INVALID_RESPONSE', message: 'El servidor no devolvió una respuesta válida. Intenta nuevamente.' }, response.status); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw new ApiError(data.error ?? { code: 'UNKNOWN_ERROR', message: 'No pudimos completar la operación.' }, response.status);
  return data;
}

export function uniqueRequestKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (value) => value.toString(16).padStart(2, '0')).join('');
}
