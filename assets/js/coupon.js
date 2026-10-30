import { request } from './api.js?v=0.2.4';
import { $, message, busy, statusLabels, formatDate, renderFramedCoupon, downloadCoupon, copyText, couponUrl, toast } from './ui.js?v=0.2.4';

const token = location.hash.slice(1);
let coupon;
let loading = false;
let savedInWallet = false;
let saving;

function rememberCoupon() {
  if (savedInWallet) return Promise.resolve();
  saving ??= request('/api/wallet/coupons', { method: 'POST', body: { token } })
    .then(() => { savedInWallet = true; }).finally(() => { saving = undefined; });
  return saving;
}

async function loadCoupon() {
  if (loading) return;
  loading = true;
  try {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Este enlace no contiene un cupón válido. Abre «Mis cupones» desde el navegador donde participaste.');
    coupon = await request(`/api/coupons/${token}`);
    renderFramedCoupon(coupon, { name: 'coupon-prize-name', code: 'coupon-code', qr: 'coupon-qr', expiry: 'coupon-expiry' });
    $('#coupon-frame').hidden = false;
    $('#coupon-placeholder').hidden = true;
    $('#coupon-actions').hidden = false;
    $('#coupon-status').dataset.status = coupon.status;
    $('#coupon-status').textContent = coupon.testOnly ? 'Ganador de prueba · sin validez para canje' : statusLabels[coupon.status];
    $('#coupon-description').textContent = coupon.testOnly
      ? 'Este cupón ganador de prueba permanece activo y sin vencimiento hasta que solicites eliminarlo. No reserva inventario ni permite canjes reales.'
      : coupon.status === 'active'
      ? `Tu premio está reservado. Muéstralo en el local antes del ${formatDate(coupon.expiresAt, true)}. La administración confirmará el canje.`
      : coupon.status === 'redeemed'
        ? `Este buen momento ya fue disfrutado. Cupón canjeado el ${formatDate(coupon.redeemedAt, true)}. No puede utilizarse otra vez.`
        : 'El tiempo de esta sorpresa ya pasó. Este cupón está vencido y no puede canjearse.';
    message($('#coupon-message'));
    $('#coupon-wallet-button').disabled = false;
    try { await rememberCoupon(); }
    catch { message($('#coupon-message'), 'El cupón se puede consultar, pero no se pudo guardar en este navegador. Presiona Mis cupones para reintentar.', 'error'); }
    return true;
  } catch (error) {
    coupon = undefined;
    $('#coupon-frame').hidden = true;
    $('#coupon-placeholder').hidden = false;
    $('#coupon-actions').hidden = true;
    $('#coupon-wallet-button').disabled = true;
    $('#coupon-status').dataset.status = 'error';
    $('#coupon-status').textContent = 'No pudimos verificar tu cupón';
    message($('#coupon-message'), `${error.message} No entregues ni reclames el premio sin verificar su estado.`, 'error');
    return false;
  } finally { loading = false; }
}

$('#download-coupon').addEventListener('click', async () => {
  busy($('#download-coupon'), true);
  try {
    if (!await loadCoupon() || !coupon) return;
    await downloadCoupon(coupon);
    toast('Cupón descargado. Guarda también su enlace privado.');
  } catch { message($('#coupon-message'), 'No se pudo descargar la imagen. Guarda tu enlace privado o utiliza «Imprimir cupón».', 'error'); }
  finally { busy($('#download-coupon'), false); }
});
$('#copy-coupon').addEventListener('click', async () => {
  if (!coupon) return;
  try { await copyText(couponUrl(coupon)); toast('Enlace privado copiado. No lo compartas públicamente.'); }
  catch (error) { message($('#coupon-message'), error.message, 'error'); }
});
$('#print-coupon').addEventListener('click', () => window.print());
$('#coupon-wallet-button').addEventListener('click', async () => {
  busy($('#coupon-wallet-button'), true);
  try { await rememberCoupon(); location.assign('/premio/#mis-cupones'); }
  catch (error) { message($('#coupon-message'), error.message, 'error'); busy($('#coupon-wallet-button'), false); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCoupon(); });
setInterval(() => { if (!document.hidden) loadCoupon(); }, 60_000);
loadCoupon();
