import { request } from './api.js';
import { $, updateRules } from './ui.js';
import { deployment } from './deployment.js';

$('#print-poster').disabled = true;
$('#print-poster').addEventListener('click', () => window.print());
try {
  const status = deployment.backendAvailable ? await request('/premio/api/status') : deployment.staticCampaign;
  updateRules(status.rules);
  $('#poster-url').textContent = status.publicUrl;
  const warnings = [];
  if (!deployment.backendAvailable) warnings.push('Servidor de premios pendiente. No utilices este cartel para una campaña comercial todavía.');
  if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(status.publicUrl).hostname)) warnings.push('Este QR apunta a localhost: no funcionará en otro teléfono. Configura PUBLIC_URL antes de imprimir.');
  if (!status.active) warnings.push('La campaña está en pausa.');
  $('#poster-warning').textContent = warnings.join(' ');
  $('#poster-print-warning').textContent = warnings.join(' ');
  $('#print-poster').disabled = !deployment.backendAvailable;
} catch (error) {
  $('#poster-warning').textContent = error.message;
  $('#poster-url').textContent = 'No se pudo verificar la dirección del QR.';
}
