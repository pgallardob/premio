import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateInstagramClicks } from './instagram-clicks.js';

export function initialState(catalog, defaults = {}) {
  return {
    version: 1,
    settings: {
      interval: 20,
      expiryDays: 5,
      cooldownEnabled: true,
      cooldownHours: 24,
      dailyCodeEnabled: false,
      presenceRequired: false,
      dailyCodeHash: null,
      dailyCodeDate: null,
      campaignActive: false,
      ...defaults.settings,
    },
    inventory: { ...Object.fromEntries(catalog.map((prize) => [prize.id, prize.initialStock])), ...defaults.inventory },
    totalParticipations: 0,
    cycleProgress: 0,
    participations: [],
    coupons: [],
    testCoupons: [],
    visits: [],
    lastParticipation: {},
    audit: [],
  };
}

export function validateState(state) {
  validateInstagramClicks(state.instagramClicks);
  if (state.version !== 1 || !Array.isArray(state.participations) || !Array.isArray(state.coupons)
    || !state.settings || !state.inventory || !state.lastParticipation || !Array.isArray(state.audit)
    || !Number.isSafeInteger(state.totalParticipations) || state.totalParticipations < 0
    || !Number.isSafeInteger(state.cycleProgress) || state.cycleProgress < 0
    || !Number.isInteger(state.settings.interval) || state.settings.interval < 2
    || state.cycleProgress >= state.settings.interval
    || Object.values(state.inventory).some((stock) => !Number.isInteger(stock) || stock < 0)) {
    throw new Error('El archivo de datos no es válido. Se conservó sin cambios; restaure una copia verificada.');
  }
  const settings = state.settings;
  const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const fingerprint = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const code = (value) => typeof value === 'string' && /^OLV-[A-F0-9]{12}$/.test(value);
  if (typeof settings.cooldownEnabled !== 'boolean' || settings.cooldownHours !== 24
    || (settings.presenceRequired !== undefined && typeof settings.presenceRequired !== 'boolean')
    || (settings.promotionContact !== undefined && (typeof settings.promotionContact !== 'string' || settings.promotionContact.length > 200))
    || (settings.promotionReviewed !== undefined && typeof settings.promotionReviewed !== 'boolean')
    || (settings.promotionReviewedAt !== undefined && settings.promotionReviewedAt !== null && !validDate(settings.promotionReviewedAt))
    || typeof settings.campaignActive !== 'boolean' || typeof settings.dailyCodeEnabled !== 'boolean'
    || !Number.isInteger(settings.expiryDays) || settings.expiryDays < 1 || settings.expiryDays > 30
    || !state.lastParticipation || Array.isArray(state.lastParticipation) || typeof state.lastParticipation !== 'object'
    || Object.entries(state.lastParticipation).some(([device, at]) => !fingerprint(device) || !Number.isFinite(at) || at < 0)
    || new Set(state.coupons.map((coupon) => coupon.code)).size !== state.coupons.length
    || state.coupons.some((coupon) => (coupon.testOnly !== undefined && coupon.testOnly !== false) || !code(coupon.code) || !fingerprint(coupon.token) || !fingerprint(coupon.deviceHash)
      || !coupon.prize || !Object.hasOwn(state.inventory, coupon.prize.id)
      || !['active', 'redeemed', 'expired'].includes(coupon.status) || !validDate(coupon.issuedAt) || !validDate(coupon.expiresAt)
      || Date.parse(coupon.expiresAt) <= Date.parse(coupon.issuedAt)
      || (coupon.status === 'redeemed' ? !validDate(coupon.redeemedAt) : coupon.redeemedAt !== null)
      || (coupon.savedBy !== undefined && (!Array.isArray(coupon.savedBy) || coupon.savedBy.length > 100 || coupon.savedBy.some((device) => !fingerprint(device)))))
    || state.participations.some((entry) => !Number.isSafeInteger(entry.id) || entry.id < 1 || !validDate(entry.createdAt)
      || !fingerprint(entry.deviceHash) || typeof entry.requestKey !== 'string' || !/^[\w-]{16,80}$/.test(entry.requestKey)
      || typeof entry.won !== 'boolean' || (entry.couponCode !== null && !code(entry.couponCode))
      || (entry.visitId !== undefined && !/^[a-f0-9]{32}$/.test(entry.visitId)))) {
    throw new Error('El estado contiene reglas o registros no válidos. No se reinició ni sobrescribió el archivo.');
  }
  const tests = state.testCoupons === undefined ? [] : state.testCoupons;
  if (!Array.isArray(tests) || tests.length > 1 || tests.some((coupon) => coupon.testOnly !== true
    || !/^TST-[A-F0-9]{12}$/.test(coupon.code ?? '') || !fingerprint(coupon.token) || !fingerprint(coupon.deviceHash)
    || coupon.status !== 'active' || coupon.expiresAt !== null || coupon.redeemedAt !== null || !validDate(coupon.issuedAt)
    || !coupon.prize || !Object.hasOwn(state.inventory, coupon.prize.id)
    || (coupon.savedBy !== undefined && (!Array.isArray(coupon.savedBy) || coupon.savedBy.length > 100 || coupon.savedBy.some((device) => !fingerprint(device)))))
    || new Set([...state.coupons, ...tests].map((coupon) => coupon.token)).size !== state.coupons.length + tests.length) {
    throw new Error('El cupón de prueba no es válido. No se modificaron los datos.');
  }
  const visits = state.visits === undefined ? [] : state.visits;
  if (!Array.isArray(visits) || visits.length > 1000 || visits.some((visit) => !visit
    || !/^[a-f0-9]{32}$/.test(visit.id ?? '') || !/^VIS-[A-F0-9]{8}$/.test(visit.code ?? '') || !fingerprint(visit.deviceHash)
    || !['pending', 'approved', 'used'].includes(visit.status) || !validDate(visit.createdAt) || !validDate(visit.expiresAt)
    || Date.parse(visit.expiresAt) <= Date.parse(visit.createdAt)
    || (visit.status === 'pending' ? visit.approvedAt !== null || visit.usedAt !== null
      : !validDate(visit.approvedAt) || Date.parse(visit.approvedAt) < Date.parse(visit.createdAt)
        || Date.parse(visit.approvedAt) >= Date.parse(visit.expiresAt)
        || (visit.status === 'used' ? !validDate(visit.usedAt) || Date.parse(visit.usedAt) < Date.parse(visit.approvedAt)
          || Date.parse(visit.usedAt) >= Date.parse(visit.expiresAt) : visit.usedAt !== null)))
    || new Set(visits.map((visit) => visit.id)).size !== visits.length
    || new Set(visits.map((visit) => visit.code)).size !== visits.length) {
    throw new Error('Las solicitudes de visita no son válidas. No se modificaron los datos.');
  }
}

export class FileStore {
  constructor(directory, catalog, defaults = {}) {
    this.directory = directory;
    this.catalog = catalog;
    this.defaults = defaults;
    this.file = join(directory, 'state.json');
    this.lockFile = join(directory, 'store.lock');
    this.queue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true });
    await this.acquireLock();
    try {
      try {
        this.state = JSON.parse(await readFile(this.file, 'utf8'));
        validateState(this.state);
        for (const prize of this.catalog) this.state.inventory[prize.id] ??= prize.initialStock;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this.state = initialState(this.catalog, this.defaults);
      }
      await this.persist(this.state);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async acquireLock() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        this.lock = await open(this.lockFile, 'wx', 0o600);
        await this.lock.writeFile(String(process.pid));
        return;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const pid = Number(await readFile(this.lockFile, 'utf8'));
        if (!Number.isInteger(pid) || pid < 1) throw new Error('Bloqueo de datos no válido; revise data/store.lock.');
        try {
          process.kill(pid, 0);
        } catch (processError) {
          if (processError.code === 'ESRCH') {
            await unlink(this.lockFile);
            continue;
          }
        }
        throw new Error('Ya existe un proceso usando estos datos. Utilice una sola instancia del servidor.');
      }
    }
    throw new Error('No se pudo obtener el bloqueo del archivo de datos.');
  }

  async persist(state) {
    validateState(state);
    const temporary = join(this.directory, `state.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flush: true });
      await rename(temporary, this.file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  transaction(operation) {
    const task = this.queue.then(async () => {
      const draft = structuredClone(this.state);
      const result = await operation(draft);
      if (JSON.stringify(draft) !== JSON.stringify(this.state)) {
        await this.persist(draft);
        this.state = draft;
      }
      return structuredClone(result);
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async close() {
    await this.queue;
    if (this.lock) {
      await this.lock.close();
      this.lock = null;
      await unlink(this.lockFile);
    }
  }
}
