import { request, uniqueRequestKey } from './api.js';
import { $, $$, element, icon, message, busy, updateRules, openDialog, initializeDialogs, emptyState, statusChip, formatDate, renderFramedCoupon, couponUrl, downloadCoupon, toast } from './ui.js';
import { announceParticipation } from './updates.js';
import { deployment } from './deployment.js';

let campaign;
let submitting = false;
let winningCoupon;
let pendingKey;
try { pendingKey = sessionStorage.getItem('olivos_pending_participation'); } catch { /* Storage may be disabled. */ }

initializeDialogs();
$('#current-year').textContent = new Date().getFullYear();

function updateParticipationButton() {
  $$('[data-participate-button]').forEach((button) => {
    const label = $('[data-participate-label]', button);
    busy(button, submitting);
    if (submitting) { label.textContent = 'Descubriendo tu momento…'; return; }
    if (!deployment.backendAvailable) { button.disabled = true; label.textContent = 'Servidor pendiente'; return; }
    if (!campaign) { label.textContent = 'Volver a conectar'; return; }
    button.disabled = !campaign.active || campaign.availableStock === 0;
    label.textContent = !campaign.active ? 'Volveremos a sorprenderte'
      : campaign.availableStock === 0 ? 'Nuevas sorpresas muy pronto' : button.dataset.idleLabel;
  });
}

function renderPrizes(prizes) {
  const cards = prizes.map((prize) => {
    const card = element('article', 'prize-card');
    card.dataset.prize = prize.id;
    const art = element('div', 'prize-card__art');
    const image = element('img', 'prize-card__image');
    image.src = prize.image;
    image.alt = '';
    image.width = 360;
    image.height = 440;
    image.loading = 'lazy';
    art.append(element('span', 'prize-card__category', prize.category), image,
      element('span', 'prize-card__stock', prize.stock > 0 ? `${prize.stock} disponibles` : 'Pronto, más sorpresas'));
    const body = element('div', 'prize-card__body');
    body.append(element('h3', '', prize.name), element('p', '', prize.description));
    card.append(art, body);
    return card;
  });
  $('#prize-grid').replaceChildren(...cards);
  $('#prize-grid').setAttribute('aria-busy', 'false');
}

async function loadCampaign() {
  try {
    campaign = deployment.backendAvailable ? await request('/api/status') : deployment.staticCampaign;
    updateRules(campaign.rules);
    $('#promotion-contact').hidden = !campaign.promotionContact;
    $('#promotion-contact').textContent = campaign.promotionContact ? `Consultas sobre la promoción: ${campaign.promotionContact}` : '';
    renderPrizes(campaign.prizes);
    const status = $('#campaign-status');
    status.dataset.status = campaign.active && campaign.availableStock > 0 ? 'active' : 'paused';
    $('#campaign-status-label').textContent = !deployment.backendAvailable ? 'Servidor pendiente de conexión' : !campaign.active ? 'Experiencia en pausa' : campaign.availableStock === 0 ? 'Preparando sorpresas' : 'La sorpresa está activa';
    if (!deployment.backendAvailable) $('#participation-guidance').textContent = 'Servidor pendiente: esta publicación todavía no registra participaciones.';
    $('#daily-code-field').hidden = !campaign.rules.dailyCodeEnabled;
    $('#daily-code').required = campaign.rules.dailyCodeEnabled;
    $('#cooldown-explanation').textContent = 'Puedes participar una vez cada 24 horas desde este navegador. El límite se cuenta desde tu última participación, no desde medianoche. Borrar cookies puede eludir este control básico: no es una verificación de identidad.';
    return true;
  } catch (error) {
    campaign = undefined;
    $('#campaign-status').dataset.status = 'error';
    $('#campaign-status-label').textContent = 'Sin conexión con el local';
    $('#prize-grid').replaceChildren(emptyState('La sorpresa puede esperar un momento.', 'No pudimos consultar los premios. Revisa la conexión y vuelve a conectar.', 'leaf'));
    $('#prize-grid').setAttribute('aria-busy', 'false');
    message($('#participation-message'), error.message, 'error');
    return false;
  } finally { updateParticipationButton(); }
}

async function refreshWallet() {
  const content = $('#wallet-content');
  try {
    const { coupons } = await request('/api/wallet');
    $('#wallet-count').textContent = coupons.length;
    $('#wallet-count').hidden = coupons.length === 0;
    if (!coupons.length) {
      content.replaceChildren(emptyState('Las buenas historias empiezan aquí.', 'Todavía no tienes cupones. Cuando ganes, tu sorpresa tendrá un lugar en esta colección.', 'ticket'));
      return;
    }
    const list = element('div', 'wallet-list');
    coupons.forEach((coupon) => {
      const link = element('a', 'wallet-item');
      link.href = couponUrl(coupon);
      const image = element('img');
      image.src = coupon.prize.image;
      image.alt = '';
      const copy = element('span', 'wallet-item__copy');
      copy.append(element('strong', '', coupon.prize.name), element('small', '', coupon.code), element('small', '', `Vence ${formatDate(coupon.expiresAt)}`));
      link.append(image, copy, statusChip(coupon.status));
      list.append(link);
    });
    content.replaceChildren(list);
  } catch (error) {
    content.replaceChildren(emptyState('Tus momentos siguen siendo tuyos.', error.message, 'shield'));
    const retry = element('button', 'button button--outline', 'Intentar nuevamente');
    retry.type = 'button';
    retry.addEventListener('click', refreshWallet);
    content.append(retry);
  }
}

$('#wallet-button').addEventListener('click', () => {
  openDialog($('#wallet-dialog'));
  refreshWallet();
});
$('#wallet-dialog').addEventListener('close', () => {
  if (location.hash === '#mis-cupones') history.replaceState(null, '', `${location.pathname}${location.search}`);
});
$('#wallet-recovery-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('button[type="submit"]', event.currentTarget);
  busy(button, true);
  message($('#wallet-recovery-message'));
  try {
    const link = new URL($('#wallet-private-link').value.trim());
    if (link.origin !== location.origin || link.pathname !== '/cupon.html' || link.username || link.password || !/^#[a-f0-9]{64}$/.test(link.hash)) {
      throw new Error('Utiliza el enlace privado completo de un cupón de Los Olivos, no su código de canje.');
    }
    await request('/api/wallet/coupons', { method: 'POST', body: { token: link.hash.slice(1) } });
    $('#wallet-private-link').value = '';
    await refreshWallet();
    message($('#wallet-recovery-message'), 'Cupón guardado. Su estado y vencimiento no cambian.', 'success');
  } catch (error) {
    message($('#wallet-recovery-message'), error instanceof TypeError ? 'Pega un enlace privado válido.' : error.message, 'error');
  } finally { busy(button, false); }
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#mis-cupones') { openDialog($('#wallet-dialog')); refreshWallet(); }
});

function showResult(result) {
  const coupon = result.coupon;
  winningCoupon = coupon;
  const isWinner = result.won && coupon;
  $('#result-dialog').dataset.state = isWinner ? 'winner' : 'participated';
  $('#result-coupon').hidden = !isWinner;
  $('#save-winner-button').hidden = !isWinner;
  $('#open-winner-link').hidden = !isWinner;
  message($('#result-message'));
  $('#participation-receipt').textContent = result.id === undefined && coupon
    ? `Cupón ${coupon.code} · Emitido ${formatDate(coupon.issuedAt, true)}`
    : `Participación #${String(result.id).padStart(6, '0')} · ${formatDate(result.createdAt, true)}`;
  if (isWinner) {
    $('#result-eyebrow').textContent = result.replayed ? 'TU SORPRESA SIGUE AQUÍ' : 'HOY, LO INESPERADO ERES TÚ';
    $('#result-title').textContent = coupon.status === 'active' ? 'Este buen momento es tuyo.' : 'Tu momento ya tiene una historia.';
    $('#result-description').textContent = coupon.status === 'active'
      ? `¡Ganaste! ${coupon.prize.description} Guarda tu cupón y muéstralo en el local antes de su vencimiento.`
      : `Recuperamos tu participación original. El cupón está ${coupon.status === 'redeemed' ? 'canjeado' : 'vencido'}; no es un premio nuevo.`;
    renderFramedCoupon(coupon, { name: 'result-prize-name', code: 'result-coupon-code', qr: 'result-coupon-qr', expiry: 'result-coupon-expiry' });
    $('#open-winner-link').href = couponUrl(coupon);
  } else {
    $('#result-eyebrow').textContent = 'YA ERES PARTE DE LA EXPERIENCIA';
    $('#result-title').textContent = 'Gracias por sumar un buen momento.';
    const followUp = ', pero tu participación quedó registrada. Vuelve en 24 horas: nos encantará verte otra vez.';
    $('#result-description').replaceChildren(
      document.createTextNode('Esta vez '),
      element('strong', 'result-emphasis', 'no hubo premio'),
      document.createTextNode(followUp),
    );
  }
  openDialog($('#result-dialog'));
}

export async function showSavedCoupon(token) {
  const coupon = await request(`/api/coupons/${token}`);
  showResult({ won: true, replayed: true, coupon, createdAt: coupon.issuedAt });
}

$('#participation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  message($('#participation-message'));
  if (!campaign) { await loadCampaign(); return; }
  submitting = true;
  updateParticipationButton();
  pendingKey ??= uniqueRequestKey();
  try { sessionStorage.setItem('olivos_pending_participation', pendingKey); } catch { /* In-memory retries remain idempotent. */ }
  try {
    const result = await request('/api/participations', {
      method: 'POST', headers: { 'Idempotency-Key': pendingKey },
      body: campaign.rules.dailyCodeEnabled ? { dailyCode: $('#daily-code').value.trim() } : {},
    });
    pendingKey = undefined;
    try { sessionStorage.removeItem('olivos_pending_participation'); } catch { /* No persistent storage available. */ }
    showResult(result);
    message($('#participation-message'), `Participación #${String(result.id).padStart(6, '0')} registrada. ${result.won ? 'Tu premio está en «Mis cupones».' : 'Consulta el resultado que aparece en pantalla.'}`, 'success');
    announceParticipation();
    await Promise.allSettled([loadCampaign(), refreshWallet()]);
  } catch (error) {
    const detail = error.retryAt ? ` Puedes volver a intentar el ${formatDate(error.retryAt, true)}.` : '';
    message($('#participation-message'), `${error.message}${detail}`, 'error');
  } finally { submitting = false; updateParticipationButton(); }
});

$('#save-winner-button').addEventListener('click', async () => {
  const button = $('#save-winner-button');
  busy(button, true);
  try { await downloadCoupon(winningCoupon); toast('Tu pequeño gran momento ya tiene una imagen para guardar.'); }
  catch { message($('#result-message'), 'No pudimos descargar la imagen. Abre «Ver mi cupón» y guarda su enlace privado.', 'error'); }
  finally { busy(button, false); }
});

async function initialize() {
  if (await loadCampaign()) await refreshWallet();
  if (location.hash === '#mis-cupones') openDialog($('#wallet-dialog'));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && !submitting) initialize(); });
initialize();
