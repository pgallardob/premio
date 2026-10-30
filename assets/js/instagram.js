import { request, uniqueRequestKey } from './api.js';
import { deployment } from './deployment.js';
import { message } from './ui.js';

const initialized = new WeakSet();
const pending = new WeakMap();
const inFlight = new WeakSet();

export function initializeInstagramLinks() {
  document.querySelectorAll('[data-instagram-source]').forEach((link) => {
    if (initialized.has(link)) return;
    initialized.add(link);
    const status = document.getElementById(link.dataset.instagramStatus);
    const record = async (event) => {
      if (event.defaultPrevented || (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0)) return;
      if (inFlight.has(link)) return;
      if (!deployment.backendAvailable) {
        message(status, 'El enlace está disponible, pero esta publicación no puede registrar clics.', 'error');
        return;
      }
      inFlight.add(link);
      // Native target=_blank navigation is independent of the logging request.
      try {
        const key = pending.get(link) ?? uniqueRequestKey();
        pending.set(link, key);
        message(status, 'Registrando el clic…');
        await request('/api/instagram/clicks', { method: 'POST', keepalive: true,
          headers: { 'Idempotency-Key': key }, body: { source: link.dataset.instagramSource } });
        pending.delete(link);
        message(status, 'Clic registrado. No confirma visita ni seguimiento.', 'success');
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) pending.delete(link);
        message(status, 'No pudimos confirmar el registro del clic. El enlace sigue disponible; puedes reintentar.', 'error');
      } finally { inFlight.delete(link); }
    };
    link.addEventListener('click', record);
    link.addEventListener('auxclick', record);
  });
}
