import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function initialState(catalog, defaults = {}) {
  return {
    version: 1,
    settings: {
      interval: 20,
      expiryDays: 5,
      cooldownEnabled: true,
      cooldownHours: 24,
      dailyCodeEnabled: false,
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
    lastParticipation: {},
    audit: [],
  };
}

export function validateState(state) {
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
    || typeof settings.campaignActive !== 'boolean' || typeof settings.dailyCodeEnabled !== 'boolean'
    || !Number.isInteger(settings.expiryDays) || settings.expiryDays < 1 || settings.expiryDays > 30
    || !state.lastParticipation || Array.isArray(state.lastParticipation) || typeof state.lastParticipation !== 'object'
    || Object.entries(state.lastParticipation).some(([device, at]) => !fingerprint(device) || !Number.isFinite(at) || at < 0)
    || new Set(state.coupons.map((coupon) => coupon.code)).size !== state.coupons.length
    || state.coupons.some((coupon) => !code(coupon.code) || !fingerprint(coupon.token) || !fingerprint(coupon.deviceHash)
      || !coupon.prize || !Object.hasOwn(state.inventory, coupon.prize.id)
      || !['active', 'redeemed', 'expired'].includes(coupon.status) || !validDate(coupon.issuedAt) || !validDate(coupon.expiresAt)
      || Date.parse(coupon.expiresAt) <= Date.parse(coupon.issuedAt)
      || (coupon.status === 'redeemed' ? !validDate(coupon.redeemedAt) : coupon.redeemedAt !== null)
      || (coupon.savedBy !== undefined && (!Array.isArray(coupon.savedBy) || coupon.savedBy.length > 100 || coupon.savedBy.some((device) => !fingerprint(device)))))
    || state.participations.some((entry) => !Number.isSafeInteger(entry.id) || entry.id < 1 || !validDate(entry.createdAt)
      || !fingerprint(entry.deviceHash) || typeof entry.requestKey !== 'string' || !/^[\w-]{16,80}$/.test(entry.requestKey)
      || typeof entry.won !== 'boolean' || (entry.couponCode !== null && !code(entry.couponCode)))) {
    throw new Error('El estado contiene reglas o registros no válidos. No se reinició ni sobrescribió el archivo.');
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
