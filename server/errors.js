export class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function requireInput(condition, message) {
  if (!condition) throw new AppError(400, 'INVALID_INPUT', message);
}

export function requireFields(value, allowed) {
  requireInput(value && typeof value === 'object' && !Array.isArray(value), 'Se esperaba un objeto JSON.');
  requireInput(Object.keys(value).every((key) => allowed.includes(key)), 'La solicitud contiene campos no permitidos.');
}
