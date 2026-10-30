import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { AppError, requireFields, requireInput } from './errors.js';
import { VisitService, requireApprovedVisit, pruneVisits } from './visits.js';

const DAY = 86_400_000;
const timezone = 'America/Santiago';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
const dayKey = (date) => dayFormatter.format(date);

export function promotionReadiness(settings, config = {}) {
  const contact = settings.promotionContact ?? config.promotionContact ?? '';
  return {
    promotionContact: typeof contact === 'string' ? contact.trim() : '',
    promotionReviewed: settings.promotionReviewed ?? (config.promotionReviewed === true),
    promotionReviewedAt: settings.promotionReviewedAt ?? null,
  };
}

export class Game {
  constructor(store, catalog, config, clock = Date.now) {
    Object.assign(this, { store, catalog, config, clock });
    this.visits = new VisitService({ store, catalog, hashDevice: (value) => this.hash(value), clock,
      prepare: (state) => this.expire(state), ready: (state) => {
        const readiness = promotionReadiness(state.settings, config);
        return !config.production || (readiness.promotionReviewed && Boolean(readiness.promotionContact));
      } });
  }

  hash(value) {
    return createHmac('sha256', this.config.deviceSecret).update(value).digest('hex');
  }

  expire(state) {
    if (state.visits) pruneVisits(state, this.clock());
    for (const [device, at] of Object.entries(state.lastParticipation)) {
      if (this.clock() - at >= state.settings.cooldownHours * 3_600_000) delete state.lastParticipation[device];
    }
    for (const coupon of state.coupons) {
      if (coupon.status === 'active' && Date.parse(coupon.expiresAt) <= this.clock()) {
        coupon.status = 'expired';
        state.inventory[coupon.prize.id] += 1;
      }
    }
  }

  safeSettings(settings) {
    const { dailyCodeHash, ...safe } = settings;
    return { ...safe, ...promotionReadiness(settings, this.config), hasDailyCode: Boolean(dailyCodeHash) && settings.dailyCodeDate === dayKey(this.clock()) };
  }

  prizes(state) {
    return this.catalog.map(({ initialStock, ...prize }) => ({ ...prize, stock: state.inventory[prize.id] }));
  }

  couponView(coupon, state) {
    return {
      code: coupon.code,
      token: coupon.token,
      prize: { ...coupon.prize, stock: state.inventory[coupon.prize.id] ?? 0 },
      issuedAt: coupon.issuedAt,
      expiresAt: coupon.expiresAt,
      status: coupon.status,
      redeemedAt: coupon.redeemedAt,
      ...(coupon.testOnly === true ? { testOnly: true } : {}),
    };
  }

  status() {
    return this.store.transaction((state) => {
      this.expire(state);
      const prizes = this.prizes(state);
      const { interval, expiryDays, cooldownEnabled, cooldownHours, dailyCodeEnabled } = state.settings;
      return {
        active: state.settings.campaignActive,
        rules: { interval, expiryDays, cooldownEnabled, cooldownHours, dailyCodeEnabled, presenceRequired: state.settings.presenceRequired === true },
        prizes,
        availableStock: prizes.reduce((sum, prize) => sum + prize.stock, 0),
        publicUrl: this.config.publicUrl,
        promotionContact: promotionReadiness(state.settings, this.config).promotionContact,
      };
    });
  }

  participate(deviceId, requestKey, input) {
    requireFields(input, ['dailyCode', 'visitId']);
    requireInput(typeof requestKey === 'string' && /^[\w-]{16,80}$/.test(requestKey), 'Falta una clave válida de participación.');
    requireInput(input.dailyCode === undefined || (typeof input.dailyCode === 'string' && input.dailyCode.length <= 24), 'El código del local no es válido.');
    if ('visitId' in input) requireInput(typeof input.visitId === 'string' && /^[a-f0-9]{32}$/.test(input.visitId), 'La autorización de visita no es válida.');
    const deviceHash = this.hash(deviceId);
    return this.store.transaction((state) => {
      this.expire(state);
      const previous = state.participations.find((entry) => entry.deviceHash === deviceHash && entry.requestKey === requestKey);
      const result = (entry, replayed) => ({
        id: entry.id,
        won: entry.won,
        createdAt: entry.createdAt,
        coupon: entry.couponCode ? this.couponView(state.coupons.find((coupon) => coupon.code === entry.couponCode), state) : null,
        replayed,
      });
      if (previous) return result(previous, true);
      const rules = state.settings;
      if (!rules.campaignActive) throw new AppError(409, 'CAMPAIGN_PAUSED', 'La experiencia está en pausa. Vuelve a visitarnos pronto.');
      const readiness = promotionReadiness(rules, this.config);
      if (this.config.production && (!readiness.promotionReviewed || !readiness.promotionContact)) throw new AppError(409, 'PROMOTION_NOT_READY', 'La campaña está completando su configuración. Tu participación no se ha contado.');
      const available = this.prizes(state).filter((prize) => prize.stock > 0);
      if (!available.length) throw new AppError(503, 'OUT_OF_STOCK', 'Estamos preparando nuevas sorpresas. Tu participación no se ha contado.');
      const last = state.lastParticipation[deviceHash];
      if (rules.cooldownEnabled && last && this.clock() - last < rules.cooldownHours * 3_600_000) {
        throw new AppError(429, 'COOLDOWN', 'Ya participaste. Tu próxima oportunidad estará disponible en 24 horas.', {
          retryAt: new Date(last + rules.cooldownHours * 3_600_000).toISOString(),
        });
      }
      if (rules.dailyCodeEnabled && (!rules.dailyCodeHash || rules.dailyCodeDate !== dayKey(this.clock())
        || this.hash(`${rules.dailyCodeDate}:${input.dailyCode?.trim().toUpperCase()}`) !== rules.dailyCodeHash)) {
        throw new AppError(403, 'DAILY_CODE_REQUIRED', 'Ingresa el código de hoy que encontrarás en el local.');
      }
      const visit = rules.presenceRequired ? requireApprovedVisit(state, input.visitId, deviceHash, this.clock()) : null;
      state.totalParticipations += 1;
      state.cycleProgress += 1;
      const entry = {
        id: state.totalParticipations,
        createdAt: new Date(this.clock()).toISOString(),
        deviceHash,
        requestKey,
        won: state.cycleProgress === rules.interval,
        couponCode: null,
      };
      if (visit) {
        visit.status = 'used';
        visit.usedAt = entry.createdAt;
        entry.visitId = visit.id;
      }
      if (entry.won) {
        const { stock, ...prize } = available[randomInt(available.length)];
        let code;
        do { code = `OLV-${randomBytes(6).toString('hex').toUpperCase()}`; }
        while (state.coupons.some((coupon) => coupon.code === code));
        const coupon = {
          code,
          token: randomBytes(32).toString('hex'),
          prize,
          deviceHash,
          issuedAt: entry.createdAt,
          expiresAt: new Date(this.clock() + rules.expiryDays * DAY).toISOString(),
          status: 'active',
          redeemedAt: null,
        };
        state.inventory[prize.id] -= 1;
        state.coupons.push(coupon);
        entry.couponCode = code;
        state.cycleProgress = 0;
      }
      state.lastParticipation[deviceHash] = this.clock();
      state.participations.push(entry);
      return result(entry, false);
    });
  }

  wallet(deviceId) {
    return this.store.transaction((state) => {
      this.expire(state);
      const deviceHash = this.hash(deviceId);
      return { coupons: [...state.coupons, ...(state.testCoupons ?? [])].filter((coupon) => coupon.deviceHash === deviceHash || coupon.savedBy?.includes(deviceHash))
        .reverse().map((coupon) => this.couponView(coupon, state)) };
    });
  }

  saveCoupon(deviceId, input) {
    requireFields(input, ['token']);
    requireInput(typeof input.token === 'string' && /^[a-f0-9]{64}$/.test(input.token), 'Se necesita el enlace privado completo del cupón.');
    const deviceHash = this.hash(deviceId);
    return this.store.transaction((state) => {
      const testCoupon = (state.testCoupons ?? []).find((item) => item.token === input.token);
      if (!testCoupon) this.expire(state);
      const coupon = testCoupon ?? state.coupons.find((item) => item.token === input.token);
      if (!coupon) throw new AppError(404, 'NOT_FOUND', 'No encontramos ese cupón. Revisa su enlace privado.');
      if (coupon.deviceHash !== deviceHash) {
        coupon.savedBy ??= [];
        if (!coupon.savedBy.includes(deviceHash)) {
          if (coupon.savedBy.length >= 100) throw new AppError(409, 'WALLET_LIMIT_REACHED', 'Este cupón alcanzó el límite de navegadores guardados. Puedes consultarlo con su enlace privado.');
          coupon.savedBy.push(deviceHash);
        }
      }
      return { saved: true };
    });
  }

  getCoupon(identifier, byCode = false) {
    return this.store.transaction((state) => {
      const testCoupon = (state.testCoupons ?? []).find((item) => (byCode ? item.code : item.token) === identifier);
      if (testCoupon) return this.couponView(testCoupon, state);
      this.expire(state);
      const coupon = state.coupons.find((item) => (byCode ? item.code : item.token) === identifier);
      if (!coupon) throw new AppError(404, 'NOT_FOUND', 'No encontramos ese cupón. Revisa el enlace o el código.');
      return this.couponView(coupon, state);
    });
  }

  redeem(code) {
    return this.store.transaction((state) => {
      if ((state.testCoupons ?? []).some((coupon) => coupon.code === code)) throw new AppError(409, 'TEST_COUPON', 'Este cupón es de prueba, no permite canje y permanece activo hasta que se elimine.');
      this.expire(state);
      const coupon = state.coupons.find((item) => item.code === code);
      if (!coupon) throw new AppError(404, 'NOT_FOUND', 'No encontramos un cupón con ese código.');
      if (coupon.status === 'redeemed') throw new AppError(409, 'COUPON_REDEEMED', 'Este cupón ya fue canjeado. No entregues otro premio.');
      if (coupon.status === 'expired') throw new AppError(409, 'COUPON_EXPIRED', 'Este cupón ya venció y no se puede canjear.');
      coupon.status = 'redeemed';
      coupon.redeemedAt = new Date(this.clock()).toISOString();
      state.audit.push({ action: 'redeem', code, at: coupon.redeemedAt });
      return this.couponView(coupon, state);
    });
  }

  updateSettings(input) {
    requireFields(input, ['interval', 'expiryDays', 'cooldownEnabled', 'dailyCodeEnabled', 'presenceRequired', 'campaignActive', 'dailyCode', 'promotionContact', 'promotionReviewed']);
    for (const key of ['cooldownEnabled', 'dailyCodeEnabled', 'presenceRequired', 'campaignActive', 'promotionReviewed']) {
      if (key in input) requireInput(typeof input[key] === 'boolean', `El campo ${key} debe ser verdadero o falso.`);
    }
    requireInput(input.cooldownEnabled !== false, 'La protección de 24 horas no se puede desactivar.');
    if ('promotionContact' in input) requireInput(typeof input.promotionContact === 'string' && input.promotionContact.trim().length <= 200, 'El contacto de la promoción debe ser un texto de hasta 200 caracteres.');
    if ('interval' in input) requireInput(Number.isInteger(input.interval) && input.interval >= 2 && input.interval <= 1000, 'El intervalo debe estar entre 2 y 1000.');
    if ('expiryDays' in input) requireInput(Number.isInteger(input.expiryDays) && input.expiryDays >= 1 && input.expiryDays <= 30, 'La vigencia debe estar entre 1 y 30 días.');
    if ('dailyCode' in input) requireInput(typeof input.dailyCode === 'string' && /^[A-Za-z0-9-]{4,24}$/.test(input.dailyCode), 'El código debe contener entre 4 y 24 letras, números o guiones.');
    return this.store.transaction((state) => {
      if ('interval' in input && input.interval !== state.settings.interval && state.cycleProgress !== 0) {
        throw new AppError(409, 'CYCLE_IN_PROGRESS', 'Completa el ciclo actual antes de cambiar la frecuencia de premios.');
      }
      const { dailyCode, ...settings } = input;
      if ('promotionContact' in settings) settings.promotionContact = settings.promotionContact.trim();
      const previous = promotionReadiness(state.settings, this.config);
      const reviewChanged = ['interval', 'expiryDays', 'dailyCodeEnabled', 'presenceRequired'].some((key) => key in settings && settings[key] !== (state.settings[key] ?? false))
        || ('promotionContact' in settings && settings.promotionContact !== previous.promotionContact);
      if (reviewChanged && settings.promotionReviewed !== true) settings.promotionReviewed = false;
      const next = { ...state.settings, ...settings };
      const readiness = promotionReadiness(next, this.config);
      if (this.config.production && next.campaignActive) {
        requireInput(readiness.promotionContact, 'Completa el contacto de la promoción antes de activar la campaña.');
        requireInput(readiness.promotionReviewed, 'Confirma que revisaste las bases y la privacidad antes de activar la campaña.');
      }
      if (input.campaignActive) requireInput(this.prizes(state).some((prize) => prize.stock > 0), 'Carga inventario real antes de activar la campaña.');
      Object.assign(state.settings, settings);
      if ('promotionReviewed' in settings) {
        if (!settings.promotionReviewed) state.settings.promotionReviewedAt = null;
        else if (reviewChanged || !state.settings.promotionReviewedAt) state.settings.promotionReviewedAt = new Date(this.clock()).toISOString();
      }
      if (dailyCode) {
        state.settings.dailyCodeDate = dayKey(this.clock());
        state.settings.dailyCodeHash = this.hash(`${state.settings.dailyCodeDate}:${dailyCode.trim().toUpperCase()}`);
      }
      requireInput(!state.settings.dailyCodeEnabled || (state.settings.dailyCodeHash && state.settings.dailyCodeDate === dayKey(this.clock())), 'Configura un código para hoy antes de activar la verificación del local.');
      state.audit.push({ action: 'settings', fields: Object.keys(input), at: new Date(this.clock()).toISOString() });
      return this.safeSettings(state.settings);
    });
  }

  updateInventory(prizeId, input) {
    requireFields(input, ['stock']);
    requireInput(Number.isInteger(input.stock) && input.stock >= 0 && input.stock <= 10000, 'El stock debe ser un entero entre 0 y 10000.');
    if (!this.catalog.some((prize) => prize.id === prizeId)) throw new AppError(404, 'NOT_FOUND', 'El premio no existe.');
    return this.store.transaction((state) => {
      this.expire(state);
      state.inventory[prizeId] = input.stock;
      state.audit.push({ action: 'inventory', prizeId, stock: input.stock, at: new Date(this.clock()).toISOString() });
      return this.prizes(state).find((prize) => prize.id === prizeId);
    });
  }

  createTestWinner() {
    const selected = this.catalog.find((prize) => prize.featured) ?? this.catalog[0];
    if (!selected) throw new AppError(400, 'INVALID_INPUT', 'No hay un premio configurado para la prueba.');
    return this.store.transaction((state) => {
      state.testCoupons ??= [];
      if (state.testCoupons.length) return this.couponView(state.testCoupons[0], state);
      const { initialStock, ...prize } = selected;
      let token;
      do { token = randomBytes(32).toString('hex'); } while (state.coupons.some((coupon) => coupon.token === token));
      const coupon = { code: `TST-${randomBytes(6).toString('hex').toUpperCase()}`, token,
        deviceHash: randomBytes(32).toString('hex'), prize, issuedAt: new Date(this.clock()).toISOString(),
        expiresAt: null, redeemedAt: null, status: 'active', testOnly: true, savedBy: [] };
      state.testCoupons.push(coupon);
      return this.couponView(coupon, state);
    });
  }

  deleteTestWinner(code) {
    requireInput(typeof code === 'string' && /^TST-[A-F0-9]{12}$/.test(code), 'Solo se puede eliminar el cupón de prueba identificado.');
    return this.store.transaction((state) => {
      const index = (state.testCoupons ?? []).findIndex((coupon) => coupon.code === code);
      if (index < 0) throw new AppError(404, 'NOT_FOUND', 'El cupón de prueba no existe.');
      state.testCoupons.splice(index, 1);
      return { deleted: true, code };
    });
  }

  dashboard() {
    return this.store.transaction((state) => {
      this.expire(state);
      const coupons = state.coupons.map((coupon) => this.couponView(coupon, state)).reverse();
      const counts = new Map();
      for (const entry of state.participations) {
        const key = dayKey(Date.parse(entry.createdAt));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const activity = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(this.clock() - (6 - index) * DAY);
        const dateKey = dayKey(date);
        return {
          date: dateKey,
          label: new Intl.DateTimeFormat('es-CL', { weekday: 'short', timeZone: timezone }).format(date),
          count: counts.get(dateKey) ?? 0,
        };
      });
      return {
        totals: {
          participations: state.totalParticipations,
          issued: coupons.length,
          active: coupons.filter((coupon) => coupon.status === 'active').length,
          redeemed: coupons.filter((coupon) => coupon.status === 'redeemed').length,
          expired: coupons.filter((coupon) => coupon.status === 'expired').length,
          stock: Object.values(state.inventory).reduce((sum, stock) => sum + stock, 0),
        },
        cycleProgress: state.cycleProgress,
        settings: this.safeSettings(state.settings),
        inventory: this.prizes(state),
        coupons,
        activity,
        recent: state.participations.slice(-100).reverse().map(({ deviceHash, requestKey, ...entry }) => entry),
        publicUrl: this.config.publicUrl,
      };
    });
  }
}
