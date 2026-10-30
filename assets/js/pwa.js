import { deployment } from './deployment.js?v=0.3.0';

let installPrompt;
const button = document.getElementById('install-app');
const status = document.getElementById('installation-status');
const setStatus = (text) => { if (status) status.textContent = text; };
const backendWarning = document.getElementById('backend-warning');
if (backendWarning && !deployment.backendAvailable) { backendWarning.hidden = false; backendWarning.textContent = deployment.backendNotice; }
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (standalone()) setStatus('La aplicación ya está abierta como app instalada.');
else if (ios) setStatus('En iPhone o iPad, abre esta página en Safari y utiliza Compartir → Agregar a pantalla de inicio.');
else setStatus('En Android, abre esta página en Chrome y utiliza su menú → Instalar app o Agregar a pantalla de inicio.');

if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  const notice = document.getElementById('installation-warning');
  if (notice) {
    notice.hidden = false;
    notice.textContent = 'Esta dirección es local al computador. Para instalar desde el teléfono se necesita publicar la aplicación con una dirección HTTPS accesible.';
  }
} else if (!isSecureContext) {
  setStatus('La instalación requiere una conexión HTTPS segura.');
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (ios || standalone()) return;
  installPrompt = event;
  if (button && !standalone()) { button.hidden = false; button.disabled = false; }
});
button?.addEventListener('click', async () => {
  if (!installPrompt) return;
  button.disabled = true;
  const prompt = installPrompt;
  installPrompt = undefined;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setStatus(choice.outcome === 'accepted' ? 'Solicitud aceptada. Completa la confirmación del navegador.' : 'Instalación cancelada. Puedes utilizar el menú del navegador cuando lo necesites.');
  } catch { setStatus('Utiliza el menú del navegador para agregar la app a la pantalla de inicio.'); }
  finally { button.hidden = true; }
});
window.addEventListener('appinstalled', () => {
  if (button) button.hidden = true;
  setStatus('Aplicación instalada. Puedes abrirla desde su icono.');
});

if ('serviceWorker' in navigator && isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/premio/sw.js', { scope: '/premio/', updateViaCache: 'none' }).catch(() => {
      if (status) setStatus('No se pudo preparar el acceso sin conexión. La web sigue disponible en línea; vuelve a cargar con conexión.');
    });
  });
}
