import { randomBytes } from 'node:crypto';
import { AppError, requireFields, requireInput } from './errors.js';

const TTL = 10 * 60_000;
const MAX_VISITS = 1000;

export function pruneVisits(state, now) {
  state.visits ??= [];
  state.visits = state.visits.filter((visit) => Date.parse(visit.expiresAt) > now);
}

function view(visit) {
  const { deviceHash, ...safe } = visit;
  return safe;
}

function find(state, identifier) {
  return state.visits.find((visit) => visit.id === identifier.toLowerCase() || visit.code === identifier.toUpperCase());
}

export function requireApprovedVisit(state, id, deviceHash, now) {
  pruneVisits(state, now);
  const visit = typeof id === 'string' && state.visits.find((item) => item.id === id && item.deviceHash === deviceHash);
  if (!visit || visit.status !== 'approved') throw new AppError(409, 'VISIT_REQUIRED', 'Solicita al personal que valide tu visita presencial antes de participar.');
  return visit;
}

export class VisitService {
  constructor({ store, catalog, hashDevice, clock = Date.now, prepare, ready }) {
    Object.assign(this, { store, catalog, hashDevice, clock, prepare, ready });
  }

  cooldown(state, hash, now) {
    const last = state.lastParticipation[hash];
    return state.settings.cooldownEnabled && Number.isFinite(last) && last + 24 * 3_600_000 > now
      ? new Date(last + 24 * 3_600_000).toISOString() : null;
  }

  requireOpen(state) {
    this.prepare(state);
    if (!state.settings.presenceRequired) throw new AppError(409, 'VISITS_DISABLED', 'La validación de visitas todavía no está habilitada.');
    if (!state.settings.campaignActive) throw new AppError(409, 'CAMPAIGN_PAUSED', 'La campaña está en pausa. No se registró una participación.');
    if (!this.ready(state)) throw new AppError(409, 'PROMOTION_NOT_READY', 'La campaña está completando su configuración. No se registró una participación.');
    if (!this.catalog.some((prize) => state.inventory[prize.id] > 0)) throw new AppError(503, 'OUT_OF_STOCK', 'No hay premios disponibles. No se registró una participación.');
  }

  current(deviceId) {
    const hash = this.hashDevice(deviceId);
    return this.store.transaction((state) => {
      if (!state.settings.presenceRequired) return { required: false, visit: null, cooldownUntil: null };
      const now = this.clock();
      pruneVisits(state, now);
      const visit = state.visits.find((item) => item.deviceHash === hash && item.status !== 'used')
        ?? state.visits.find((item) => item.deviceHash === hash);
      return { required: true, visit: visit ? view(visit) : null, cooldownUntil: this.cooldown(state, hash, now) };
    });
  }

  create(deviceId) {
    const hash = this.hashDevice(deviceId);
    return this.store.transaction((state) => {
      this.requireOpen(state);
      const now = this.clock();
      const retryAt = this.cooldown(state, hash, now);
      if (retryAt) throw new AppError(429, 'COOLDOWN', 'Ya participaste. Tu próxima oportunidad estará disponible en 24 horas.', { retryAt });
      pruneVisits(state, now);
      const existing = state.visits.find((item) => item.deviceHash === hash && item.status !== 'used');
      if (existing) return { required: true, visit: view(existing), cooldownUntil: null };
      if (state.visits.length >= MAX_VISITS) throw new AppError(429, 'RATE_LIMITED', 'Hay muchas validaciones pendientes. Intenta nuevamente en unos minutos.');
      let code;
      do { code = `VIS-${randomBytes(4).toString('hex').toUpperCase()}`; } while (state.visits.some((item) => item.code === code));
      const visit = { id: randomBytes(16).toString('hex'), code, deviceHash: hash, status: 'pending',
        createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL).toISOString(), approvedAt: null, usedAt: null };
      state.visits.push(visit);
      return { required: true, visit: view(visit), cooldownUntil: null };
    });
  }

  get(identifier) {
    requireInput(typeof identifier === 'string' && /^(?:[a-f0-9]{32}|VIS-[a-f0-9]{8})$/i.test(identifier), 'El código de visita no es válido.');
    return this.store.transaction((state) => {
      pruneVisits(state, this.clock());
      const visit = find(state, identifier);
      if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', 'La solicitud no existe o venció. Pide un código nuevo.');
      return view(visit);
    });
  }

  approve(identifier, input) {
    requireInput(typeof identifier === 'string' && /^(?:[a-f0-9]{32}|VIS-[a-f0-9]{8})$/i.test(identifier), 'El código de visita no es válido.');
    requireFields(input, ['present']);
    requireInput(input.present === true, 'Confirma que ves este código en el teléfono de una persona presente en el local.');
    return this.store.transaction((state) => {
      this.requireOpen(state);
      const now = this.clock();
      pruneVisits(state, now);
      const visit = find(state, identifier);
      if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', 'La solicitud no existe o venció. Pide un código nuevo.');
      if (visit.status === 'used') throw new AppError(409, 'VISIT_USED', 'Esta autorización ya se utilizó. No puede autorizarse otra vez.');
      if (visit.status === 'pending') {
        visit.status = 'approved';
        visit.approvedAt = new Date(now).toISOString();
        visit.expiresAt = new Date(now + TTL).toISOString();
        state.audit.push({ action: 'visit_approved', visitId: visit.id, at: visit.approvedAt });
      }
      return view(visit);
    });
  }

  cancel(deviceId, id) {
    requireInput(typeof id === 'string' && /^[a-f0-9]{32}$/.test(id), 'La solicitud de visita no es válida.');
    const hash = this.hashDevice(deviceId);
    return this.store.transaction((state) => {
      pruneVisits(state, this.clock());
      state.visits = state.visits.filter((visit) => !(visit.id === id && visit.deviceHash === hash && visit.status !== 'used'));
      return { cancelled: true };
    });
  }

}
