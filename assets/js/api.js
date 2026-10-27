import { deployment } from './deployment.js';

let csrfToken = '';

export class ApiError extends Error {
  constructor(error, status = 0) {
    super(error.message);
    this.code = error.code;
    this.status = status;
    this.retryAt = error.retryAt;
  }
}

export function setCsrfToken(value) { csrfToken = value; }

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  if (!deployment.backendAvailable) throw new ApiError({ code: 'BACKEND_NOT_CONFIGURED', message: deployment.backendNotice });
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    clearTimeout(timeout);
    throw new ApiError({ code: 'NETWORK_ERROR', message: 'No pudimos conectar con el local. Revisa tu conexión e intenta nuevamente.' });
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
