import { AppError, requireFields, requireInput } from './errors.js';
import { Game } from './game.js';

export async function applyInventoryPlan(store, catalog, items, clock = Date.now) {
  requireInput(Array.isArray(items) && items.length === catalog.length, 'El plan debe incluir todos los premios del catálogo.');
  for (const item of items) {
    requireFields(item, ['prizeId', 'stock', 'expectedStock']);
    requireInput(catalog.some((prize) => prize.id === item.prizeId), 'El plan contiene un premio desconocido.');
    requireInput(Number.isInteger(item.expectedStock) && item.expectedStock >= 0 && item.expectedStock <= 10000, 'Falta el stock previo esperado del premio.');
  }
  requireInput(new Set(items.map((item) => item.prizeId)).size === items.length, 'El plan contiene premios duplicados.');
  return store.transaction(async (state) => {
    if (state.settings.campaignActive) throw new AppError(409, 'CAMPAIGN_ACTIVE', 'Pausa la campaña antes de aplicar una carga completa.');
    const now = clock();
    const game = new Game({ transaction: async (operation) => operation(state) }, catalog, {}, () => now);
    game.expire(state);
    const known = new Set(catalog.map((prize) => prize.id));
    const checkRetiredStock = () => {
      if (Object.entries(state.inventory).some(([id, stock]) => !known.has(id) && stock > 0)) throw new AppError(409, 'RETIRED_STOCK', 'Hay existencias de premios anteriores. Revísalas antes de cargar el catálogo nuevo.');
    };
    checkRetiredStock();
    for (const item of items) {
      if (state.inventory[item.prizeId] !== item.expectedStock) throw new AppError(409, 'INVENTORY_CHANGED', 'El inventario cambió. Revisa el plan antes de volver a cargar.');
    }
    // Reuse domain validation and audit, but commit the whole plan once.
    for (const item of items) await game.updateInventory(item.prizeId, { stock: item.stock });
    checkRetiredStock();
    return { inventory: game.prizes(state), total: game.prizes(state).reduce((sum, prize) => sum + prize.stock, 0) };
  });
}
