import { request, apiUrl } from './api.js?v=0.3.0';
import { $, message, busy, openDialog, formatDate } from './ui.js?v=0.3.0';

export function createVisitController({ onChange, onContinue }) {
  let required = false;
  let state = { visit: null, cooldownUntil: null };
  let timer;
  let loading = false;
  let version = 0;
  const dialog = $('#visit-dialog');
  const pass = () => state.visit?.status === 'approved' && Date.parse(state.visit.expiresAt) > Date.now() ? state.visit.id : undefined;
  const cooldown = () => state.cooldownUntil && Date.parse(state.cooldownUntil) > Date.now() ? state.cooldownUntil : null;

  function render() {
    const visit = state.visit;
    $('#visit-code').textContent = visit?.code ?? 'Solicitud vencida';
    $('#visit-qr-box').hidden = !visit;
    if (visit) {
      const source = apiUrl(`/api/visits/${visit.id}/qr`);
      if ($('#visit-qr').getAttribute('src') !== source) $('#visit-qr').src = source;
    }
    $('#visit-expiry').textContent = visit ? `Válido hasta ${formatDate(visit.expiresAt, true)}` : 'Cierra este aviso y solicita un código nuevo.';
    $('#visit-status').textContent = !visit ? 'La solicitud ya no está vigente.'
      : visit.status === 'approved' ? 'Visita confirmada. Ahora puedes descubrir tu resultado.'
        : visit.status === 'used' ? 'Esta autorización ya se utilizó.' : 'Esperando la confirmación del personal del local.';
    $('#visit-continue').hidden = !pass();
    $('#visit-cancel').hidden = !visit || visit.status === 'used';
    onChange();
  }

  async function refresh() {
    if (!required) return;
    const requestedVersion = version;
    const current = await request('/api/visits/current');
    if (requestedVersion !== version) return;
    state = current;
    render();
  }

  function stop() { clearTimeout(timer); timer = undefined; }
  function poll(delay = 5000) {
    stop();
    if (!dialog.open || document.hidden) return;
    timer = setTimeout(async () => {
      let nextDelay = 5000;
      try { await refresh(); message($('#visit-message')); }
      catch (error) {
        message($('#visit-message'), error.message, 'error');
        const retryAt = Date.parse(error.retryAt);
        nextDelay = Number.isFinite(retryAt) ? Math.max(5000, retryAt - Date.now()) : Math.min(delay * 2, 30_000);
      }
      finally { poll(nextDelay); }
    }, delay);
  }

  dialog.addEventListener('close', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (dialog.open) { refresh().catch(() => {}); poll(); } });
  window.addEventListener('pagehide', stop);
  $('#visit-continue').addEventListener('click', () => {
    if (!pass()) { refresh().catch(() => {}); return; }
    dialog.close();
    onContinue();
  });
  $('#visit-cancel').addEventListener('click', async () => {
    if (!state.visit) return;
    busy($('#visit-cancel'), true);
    try {
      await request('/api/visits/cancel', { method: 'POST', body: { visitId: state.visit.id } });
      version += 1;
      state.visit = null;
      dialog.close();
      onChange();
    } catch (error) { message($('#visit-message'), error.message, 'error'); }
    finally { busy($('#visit-cancel'), false); }
  });

  return {
    getVisitId: pass,
    getCooldownUntil: cooldown,
    refresh,
    async load(enabled) {
      version += 1;
      required = enabled;
      if (required) await refresh();
      else { stop(); state = { visit: null, cooldownUntil: null }; }
    },
    async open() {
      if (!required || loading) return;
      loading = true;
      try {
        state = await request('/api/visits', { method: 'POST', body: {} });
        message($('#visit-message'));
        render();
        openDialog(dialog);
        poll();
      } finally { loading = false; }
    },
  };
}
