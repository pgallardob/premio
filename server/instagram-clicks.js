import { AppError, requireFields, requireInput } from './errors.js';

const sources = ['home', 'result', 'coupon'];
const retention = 7 * 86_400_000;
const capacity = 1000;
const validKey = (key) => typeof key === 'string' && /^[\w-]{16,80}$/.test(key);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const empty = () => ({ total: 0, bySource: { home: 0, result: 0, coupon: 0 }, entries: [] });

export function validateInstagramClicks(data) {
  if (data === undefined) return;
  if (!data || Array.isArray(data) || !count(data.total) || !data.bySource || Array.isArray(data.bySource)
    || Object.keys(data).some((key) => !['total', 'bySource', 'entries'].includes(key))
    || Object.keys(data.bySource).length !== sources.length || !sources.every((source) => count(data.bySource[source]))
    || sources.reduce((sum, source) => sum + data.bySource[source], 0) !== data.total
    || !Array.isArray(data.entries) || data.entries.length > capacity || data.entries.length > data.total
    || data.entries.some((entry) => !entry || !validKey(entry.key) || !sources.includes(entry.source)
      || typeof entry.clickedAt !== 'string' || !Number.isFinite(Date.parse(entry.clickedAt))
      || Object.keys(entry).some((key) => !['key', 'source', 'clickedAt'].includes(key)))
    || new Set(data.entries.map((entry) => entry.key)).size !== data.entries.length) {
    throw new Error('El registro de clics de Instagram no es válido. No se modificaron los datos.');
  }
}

function prune(data, now) {
  data.entries = data.entries.filter((entry) => Date.parse(entry.clickedAt) > now - retention).slice(-capacity);
}

export function instagramClickSummary(state, now) {
  const data = state.instagramClicks ?? empty();
  prune(data, now);
  return { total: data.total, bySource: { ...data.bySource }, retained: data.entries.length,
    recent: data.entries.slice(-20).reverse().map(({ source, clickedAt }) => ({ source, clickedAt })) };
}

export class InstagramClicks {
  constructor(store, clock = Date.now) { Object.assign(this, { store, clock }); }

  record(key, input) {
    requireFields(input, ['source']);
    requireInput(validKey(key), 'Falta una clave válida para registrar el clic.');
    requireInput(sources.includes(input.source), 'El origen del clic no es válido.');
    return this.store.transaction((state) => {
      state.instagramClicks ??= empty();
      const data = state.instagramClicks;
      const now = this.clock();
      prune(data, now);
      const previous = data.entries.find((entry) => entry.key === key);
      if (previous) {
        if (previous.source !== input.source) throw new AppError(409, 'CLICK_KEY_REUSED', 'Esta clave ya identifica otro origen de clic.');
        return { recorded: true, clickedAt: previous.clickedAt, replayed: true };
      }
      if (data.total === Number.MAX_SAFE_INTEGER) throw new AppError(503, 'CLICK_COUNTER_LIMIT', 'El registro de clics alcanzó su capacidad.');
      const entry = { key, source: input.source, clickedAt: new Date(now).toISOString() };
      data.total += 1;
      data.bySource[entry.source] += 1;
      data.entries.push(entry);
      data.entries = data.entries.slice(-capacity);
      return { recorded: true, clickedAt: entry.clickedAt, replayed: false };
    });
  }
}
