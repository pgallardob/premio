import { request, setCsrfToken } from './api.js?v=0.4.0';
import { $, $$, element, icon, message, busy, formatDate, statusChip, emptyState, openDialog, initializeDialogs, toast } from './ui.js?v=0.4.0';
import { onParticipationRecorded } from './updates.js?v=0.4.0';
import { deployment } from './deployment.js?v=0.4.0';

let dashboard;
let signedIn = false;
let loading;
let settingsDirty = false;
let selectedCoupon;
let selectedVisit;
let redemptionNeedsRecheck = false;
const refreshInterval = deployment.adminRefreshMs ?? 3000;
let refreshTimer;
let nextRefreshDelay = refreshInterval;
let refreshNotBefore = 0;
let lastInventory = '';
let lastSettings = '';
let lastCoupons = '';
const inventoryEdits = new Set();
const panelNames = { overview: 'Vista general', visits: 'Visitas', coupons: 'Cupones y canjes', inventory: 'Los premios', settings: 'La experiencia' };
initializeDialogs();
$('#coupon-code-input').pattern = '([Oo][Ll][Vv]|[Tt][Ss][Tt])-[A-Fa-f0-9]{12}';

$('#panel-coupons a[download]').addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    const blob = await request('/api/admin/export', { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = 'los-olivos-cupones.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message); }
});

function showLogin(text = '') {
  signedIn = false;
  stopAutoRefresh();
  setCsrfToken('');
  $('#admin-shell').hidden = true;
  $('#login-screen').hidden = false;
  $('dialog[open]')?.close();
  message($('#login-message'), text, text ? 'error' : '');
}

function setLiveStatus(status, text) {
  $('#live-indicator').dataset.status = status;
  if ($('#live-update-status').textContent !== text) $('#live-update-status').textContent = text;
}

function stopAutoRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
}

function scheduleAutoRefresh(delay = nextRefreshDelay) {
  stopAutoRefresh();
  if (!signedIn || document.hidden || navigator.onLine === false) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    loadDashboard({ background: true }).catch(() => {}).finally(() => scheduleAutoRefresh());
  }, Math.max(delay, refreshNotBefore - Date.now(), 0));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAutoRefresh();
  else scheduleAutoRefresh(0);
});
window.addEventListener('focus', () => scheduleAutoRefresh(0));
window.addEventListener('online', () => scheduleAutoRefresh(0));
window.addEventListener('offline', () => {
  stopAutoRefresh();
  setLiveStatus('disconnected', 'Sin conexión · esperando la red');
});
window.addEventListener('pagehide', stopAutoRefresh);
window.addEventListener('pageshow', () => scheduleAutoRefresh(0));
onParticipationRecorded(() => scheduleAutoRefresh(0));
$('#redeem-dialog').addEventListener('close', () => scheduleAutoRefresh(0));

function handleError(error, target = $('#admin-global-message')) {
  if (error.status === 401) { showLogin('Tu sesión terminó. Ingresa nuevamente para continuar.'); return; }
  message(target, error.message, 'error');
}

function showPanel(name) {
  if (!Object.hasOwn(panelNames, name)) name = 'overview';
  $$('.admin-panel').forEach((panel) => { panel.hidden = panel.id !== `panel-${name}`; });
  $$('[data-panel]').forEach((link) => {
    if (link.dataset.panel === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#panel-breadcrumb').textContent = panelNames[name];
}

async function handleHash() {
  if (!signedIn) return;
  const hash = location.hash.slice(1);
  const visit = hash.match(/^visit=([a-f0-9]{32})$/i);
  if (visit) {
    showPanel('visits');
    history.replaceState(null, '', '#visits');
    await validateVisit(visit[1]);
    return;
  }
  const match = hash.match(/^redeem=((?:OLV|TST)-[A-F0-9]{12})$/);
  if (match) {
    showPanel('coupons');
    $('#coupon-code-input').value = match[1];
    history.replaceState(null, '', '#coupons');
    await validateCoupon(match[1]);
  } else showPanel(hash);
}
window.addEventListener('hashchange', handleHash);

function renderVisit(visit) {
  selectedVisit = visit;
  $('#visit-lookup-code').value = visit.code;
  $('#visit-approval-code').textContent = visit.code;
  $('#visit-approval-details').textContent = `Solicitud creada el ${formatDate(visit.createdAt, true)}. Válida hasta ${formatDate(visit.expiresAt, true)}.`;
  $('#visit-present').checked = false;
  $('#visit-present').disabled = visit.status !== 'pending';
  $('#visit-approve').disabled = true;
  $('#visit-approve').hidden = visit.status !== 'pending';
  message($('#visit-approval-message'), visit.status === 'approved' ? 'Visita ya autorizada. El visitante debe presionar su botón para descubrir el resultado.'
    : visit.status === 'used' ? 'Esta autorización ya se utilizó para una participación.' : 'Compara el código con la pantalla del teléfono presente. No se requiere compra.');
}

async function validateVisit(identifier) {
  message($('#visit-lookup-message'));
  try {
    renderVisit(await request(`/api/admin/visits/${encodeURIComponent(identifier.toUpperCase())}`));
    openDialog($('#visit-approval-dialog'));
  } catch (error) { handleError(error, $('#visit-lookup-message')); }
}

$('#visit-lookup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('button[type="submit"]', event.currentTarget);
  busy(button, true);
  try { await validateVisit($('#visit-lookup-code').value.trim()); }
  finally { busy(button, false); }
});
$('#visit-present').addEventListener('input', () => { $('#visit-approve').disabled = !$('#visit-present').checked || selectedVisit?.status !== 'pending'; });
$('#visit-approve').addEventListener('click', async () => {
  if (selectedVisit?.status !== 'pending' || !$('#visit-present').checked) return;
  const button = $('#visit-approve');
  busy(button, true);
  try {
    renderVisit(await request(`/api/admin/visits/${selectedVisit.id}/approve`, { method: 'POST', body: { present: true } }));
    toast('Visita autorizada. Aún no se registró una participación.');
    await refreshAfterMutation();
  } catch (error) { handleError(error, $('#visit-approval-message')); }
  finally { busy(button, false); button.disabled = !$('#visit-present').checked || selectedVisit?.status !== 'pending'; }
});
$$('[data-go-redeem]').forEach((button) => button.addEventListener('click', () => {
  location.hash = 'coupons';
  showPanel('coupons');
  $('#coupon-code-input').focus();
}));

function renderOverview() {
  const clicks = dashboard.instagramClicks ?? { total: 0, recent: [] };
  $('#instagram-click-total').textContent = new Intl.NumberFormat('es-CL').format(clicks.total);
  const sources = { home: 'Enlace en la página principal', result: 'Enlace en el resultado', coupon: 'Enlace en la página de cupón' };
  $('#instagram-click-events').replaceChildren(...(clicks.recent.length ? clicks.recent.map((entry) => {
    const row = element('div', 'instagram-event');
    const time = element('time', '', formatDate(entry.clickedAt, true));
    time.dateTime = entry.clickedAt;
    row.append(element('span', '', sources[entry.source] ?? 'Enlace de Instagram'), time);
    return row;
  }) : [element('p', '', 'Todavía no hay clics registrados.')]));
  $$('[data-total]').forEach((node) => { node.textContent = new Intl.NumberFormat('es-CL').format(dashboard.totals[node.dataset.total]); });
  $('#active-coupon-count').textContent = dashboard.totals.active;
  const status = $('#admin-campaign-status');
  status.dataset.status = dashboard.settings.campaignActive ? 'active' : 'paused';
  $('span:last-child', status).textContent = dashboard.settings.campaignActive ? 'Campaña activa' : 'Campaña en pausa';
  $('#cycle-progress-number').textContent = dashboard.cycleProgress;
  $('#cycle-target').textContent = dashboard.settings.interval;
  $('#cycle-progress').max = dashboard.settings.interval;
  $('#cycle-progress').value = dashboard.cycleProgress;
  const remaining = dashboard.settings.interval - dashboard.cycleProgress;
  $('#cycle-description').textContent = `Faltan ${remaining} participaciones válidas para completar el ciclo, siempre que haya stock disponible.`;

  const maximum = Math.max(1, ...dashboard.activity.map((day) => day.count));
  const bars = dashboard.activity.map((day) => {
    const column = element('div', 'activity-column');
    const meter = element('meter');
    meter.min = 0;
    meter.max = maximum;
    meter.value = day.count;
    meter.setAttribute('aria-label', `${day.label}: ${day.count} participaciones`);
    column.append(element('span', '', day.count), meter, element('small', '', day.label));
    return column;
  });
  $('#activity-chart').replaceChildren(...bars);
  const weekTotal = dashboard.activity.reduce((sum, day) => sum + day.count, 0);
  $('#activity-summary').textContent = `${weekTotal} participaciones en los últimos siete días · Hora de Chile`;
  const recent = dashboard.recent.slice(0, 5);
  if (!recent.length) {
    $('#recent-activity').replaceChildren(emptyState('Todo buen momento tiene un comienzo.', 'Comparte el QR del local. Las primeras participaciones aparecerán aquí.', 'leaf'));
    return;
  }
  const rows = recent.map((entry) => {
    const row = element('div', 'recent-row');
    const mark = element('span', 'recent-row__icon');
    mark.append(icon(entry.won ? 'gift' : 'spark'));
    const copy = element('span', 'recent-row__copy');
    copy.append(element('strong', '', entry.won ? 'Una nueva sorpresa encontró a su ganador' : 'Alguien sumó un buen momento'),
      element('small', '', `Participación #${String(entry.id).padStart(6, '0')}${entry.couponCode ? ` · ${entry.couponCode}` : ''}`));
    const time = element('time', '', formatDate(entry.createdAt, true));
    time.dateTime = entry.createdAt;
    row.append(mark, copy, time);
    return row;
  });
  $('#recent-activity').replaceChildren(...rows);
}

function renderCouponTable() {
  if (!dashboard) return;
  const query = $('#coupon-search').value.trim().toLocaleLowerCase('es');
  const filter = $('#coupon-filter').value;
  const coupons = dashboard.coupons.filter((coupon) => (filter === 'all' || coupon.status === filter)
    && `${coupon.code} ${coupon.prize.name}`.toLocaleLowerCase('es').includes(query));
  const rows = coupons.map((coupon) => {
    const row = element('tr');
    const identity = element('td');
    identity.append(element('strong', '', coupon.code), element('small', '', coupon.prize.name));
    const status = element('td');
    status.append(statusChip(coupon.status));
    const action = element('td');
    const button = element('button', 'link-button', coupon.status === 'active' ? 'Verificar →' : 'Ver detalle →');
    button.type = 'button';
    button.setAttribute('aria-label', `Verificar cupón ${coupon.code}`);
    button.addEventListener('click', () => validateCoupon(coupon.code));
    action.append(button);
    row.append(identity, element('td', '', formatDate(coupon.issuedAt)), element('td', '', formatDate(coupon.expiresAt)), status, action);
    return row;
  });
  if (!rows.length) {
    const row = element('tr');
    const cell = element('td');
    cell.colSpan = 5;
    cell.append(emptyState(dashboard.coupons.length ? 'Ningún cupón coincide.' : 'La primera sorpresa está por llegar.', dashboard.coupons.length ? 'Prueba otro código o cambia el filtro.' : 'Cuando se emita un premio, lo encontrarás aquí con su código y estado.', 'ticket'));
    row.append(cell);
    rows.push(row);
  }
  $('#coupon-table-body').replaceChildren(...rows);
  $('#coupon-table-caption').textContent = `${coupons.length} de ${dashboard.coupons.length} cupones · ${dashboard.totals.redeemed} canjeados · ${dashboard.totals.expired} vencidos`;
}
$('#coupon-search').addEventListener('input', renderCouponTable);
$('#coupon-filter').addEventListener('change', renderCouponTable);

function renderInventory() {
  const cards = dashboard.inventory.map((prize) => {
    const card = element('article', 'inventory-card');
    const image = element('img');
    image.src = prize.image;
    image.alt = '';
    image.width = 360;
    image.height = 440;
    const form = element('form');
    const label = element('label', '', 'Unidades disponibles, sin reservas');
    const input = element('input');
    input.type = 'number';
    input.id = `stock-${prize.id}`;
    input.min = '0';
    input.max = '10000';
    input.required = true;
    input.value = prize.stock;
    input.addEventListener('input', () => {
      if (input.value !== '' && Number(input.value) === prize.stock) inventoryEdits.delete(prize.id);
      else inventoryEdits.add(prize.id);
    });
    label.htmlFor = input.id;
    const controls = element('div', 'inline-input');
    const save = element('button', 'button button--outline', 'Actualizar');
    save.type = 'submit';
    save.setAttribute('aria-label', `Actualizar stock de ${prize.name}`);
    controls.append(input, save);
    const feedback = element('p', 'form-message');
    feedback.setAttribute('role', 'status');
    form.append(label, controls, feedback);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      busy(save, true);
      message(feedback);
      try {
        await request(`/api/admin/inventory/${prize.id}`, { method: 'PATCH', body: { stock: Number(input.value) } });
        inventoryEdits.delete(prize.id);
        toast('Inventario actualizado. Las buenas sorpresas siguen disponibles.');
        await refreshAfterMutation();
      } catch (error) { handleError(error, feedback); }
      finally { busy(save, false); }
    });
    card.append(image, element('p', 'eyebrow', prize.category), element('h2', '', prize.name), element('p', '', prize.description), form);
    return card;
  });
  $('#inventory-grid').replaceChildren(...cards);
}

function renderSettings() {
  const settings = dashboard.settings;
  $('#setting-interval').value = settings.interval;
  $('#setting-expiry').value = settings.expiryDays;
  $('#setting-cooldown').checked = settings.cooldownEnabled;
  $('#setting-presence').checked = settings.presenceRequired === true;
  $('#setting-daily-enabled').checked = settings.dailyCodeEnabled;
  $('#setting-active').checked = settings.campaignActive;
  $('#setting-contact').value = settings.promotionContact ?? '';
  $('#setting-reviewed').checked = settings.promotionReviewed === true;
  $('#promotion-review-status').textContent = settings.promotionReviewed
    ? settings.promotionReviewedAt ? `Confirmación guardada el ${formatDate(settings.promotionReviewedAt, true)}.` : 'La revisión ya está confirmada en la configuración.'
    : 'La confirmación está pendiente. No se marca automáticamente.';
  $('#setting-daily-code').value = '';
  $('#daily-code-status').textContent = settings.hasDailyCode ? 'Ya hay un código configurado para hoy. No se muestra ni se guarda en texto plano.' : 'No hay un código vigente para hoy. Configura uno antes de activar la verificación.';
}
$('#settings-form').addEventListener('input', () => { settingsDirty = true; });
for (const id of ['setting-contact', 'setting-interval', 'setting-expiry', 'setting-daily-enabled', 'setting-presence']) {
  document.getElementById(id).addEventListener('input', () => {
    $('#setting-reviewed').checked = false;
    $('#promotion-review-status').textContent = 'La configuración cambió. Revisa las bases y confirma nuevamente antes de activar.';
  });
}
$('#setting-reviewed').addEventListener('input', () => {
  $('#promotion-review-status').textContent = $('#setting-reviewed').checked
    ? 'La confirmación se registrará al guardar la experiencia.'
    : 'La revisión no está confirmada. Pausa la campaña antes de retirar una confirmación guardada.';
});
$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('button[type="submit"]', event.currentTarget);
  busy(button, true);
  message($('#settings-message'));
  const data = {
    interval: Number($('#setting-interval').value),
    expiryDays: Number($('#setting-expiry').value),
    dailyCodeEnabled: $('#setting-daily-enabled').checked,
    presenceRequired: $('#setting-presence').checked,
    campaignActive: $('#setting-active').checked,
    promotionContact: $('#setting-contact').value.trim(),
    promotionReviewed: $('#setting-reviewed').checked,
  };
  const code = $('#setting-daily-code').value.trim();
  if (code) data.dailyCode = code;
  try {
    const saved = await request('/api/admin/settings', { method: 'PATCH', body: data });
    settingsDirty = false;
    lastSettings = '';
    $('#setting-daily-code').value = '';
    await refreshAfterMutation();
    message($('#settings-message'), `La experiencia se actualizó correctamente. ${saved.campaignActive ? 'La campaña está activa.' : 'La campaña permanece en pausa.'}`, 'success');
    toast(saved.campaignActive ? 'Campaña activa.' : 'Configuración guardada. La campaña sigue pausada.');
  } catch (error) { handleError(error, $('#settings-message')); }
  finally {
    busy(button, false);
    if (signedIn && $('#settings-message').textContent) $('#settings-message').scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
});

function loadDashboard({ background = false } = {}) {
  if (loading) return loading;
  if (!signedIn) return Promise.resolve();
  if (!background) {
    busy($('#refresh-dashboard'), true);
    message($('#admin-global-message'));
  }
  loading = (async () => {
    try {
      const snapshot = await request('/api/admin/dashboard');
      if (!signedIn) return;
      dashboard = snapshot;
      renderOverview();
      const couponsKey = JSON.stringify(dashboard.coupons);
      if (couponsKey !== lastCoupons && !$('#redeem-dialog').open
        && (!background || !$('#coupon-table-body').contains(document.activeElement))) {
        renderCouponTable();
        lastCoupons = couponsKey;
      }
      const inventoryKey = JSON.stringify(dashboard.inventory);
      if (inventoryKey !== lastInventory && inventoryEdits.size === 0
        && (!background || !$('#inventory-grid').contains(document.activeElement))) {
        renderInventory();
        lastInventory = inventoryKey;
      }
      const settingsKey = JSON.stringify(dashboard.settings);
      if (!settingsDirty && settingsKey !== lastSettings
        && (!background || !$('#settings-form').contains(document.activeElement))) {
        renderSettings();
        lastSettings = settingsKey;
      }
      nextRefreshDelay = refreshInterval;
      refreshNotBefore = 0;
      setLiveStatus('connected', 'Actualización automática');
      const time = $('#live-update-time');
      time.dateTime = new Date().toISOString();
      time.textContent = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Santiago' }).format(new Date());
    } catch (error) {
      const retryAt = Date.parse(error.retryAt);
      refreshNotBefore = Number.isFinite(retryAt) ? retryAt : 0;
      nextRefreshDelay = refreshNotBefore ? Math.max(refreshInterval, refreshNotBefore - Date.now()) : Math.min(nextRefreshDelay * 2, 30_000);
      setLiveStatus('disconnected', 'Reconectando automáticamente…');
      if (!background || error.status === 401) handleError(error);
      throw error;
    } finally {
      loading = undefined;
      if (!background) busy($('#refresh-dashboard'), false);
    }
  })();
  return loading;
}
$('#refresh-dashboard').addEventListener('click', () => loadDashboard().then(() => toast('Datos actualizados.')).catch(() => {}));

async function refreshAfterMutation() {
  if (loading) await loading.catch(() => {});
  return loadDashboard();
}

function renderRedemption(coupon) {
  selectedCoupon = coupon;
  redemptionNeedsRecheck = false;
  const details = element('div', 'redemption-detail');
  const image = element('img');
  image.src = coupon.prize.image;
  image.alt = '';
  const copy = element('div');
  copy.append(element('h3', '', coupon.prize.name), element('strong', '', coupon.code), statusChip(coupon.status, coupon.testOnly),
    element('p', '', coupon.testOnly ? 'Prueba sin vencimiento. No permite entrega ni canje.' : `Vence ${formatDate(coupon.expiresAt, true)}${coupon.redeemedAt ? ` · Canjeado ${formatDate(coupon.redeemedAt, true)}` : ''}`));
  details.append(image, copy);
  $('#redeem-details').replaceChildren(details);
  $('#confirm-redeem').hidden = coupon.status !== 'active' || coupon.testOnly === true;
  $('#confirm-redeem').replaceChildren(document.createTextNode('Confirmar canje y entrega '), icon('check'));
  message($('#redeem-message'), coupon.testOnly ? 'Cupón ganador de prueba: permanece activo hasta su eliminación y no permite canjes reales.' : coupon.status === 'active' ? 'Cupón vigente. Confirma el canje antes de entregar el premio.' : 'Este cupón no permite una nueva entrega.', coupon.status === 'active' ? '' : 'error');
}

async function validateCoupon(code) {
  message($('#validate-message'));
  try {
    const coupon = await request(`/api/admin/coupons/${encodeURIComponent(code.toUpperCase())}`);
    renderRedemption(coupon);
    openDialog($('#redeem-dialog'));
  } catch (error) { handleError(error, $('#validate-message')); }
}
$('#validate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('button[type="submit"]', event.currentTarget);
  busy(button, true);
  try { await validateCoupon($('#coupon-code-input').value.trim()); }
  finally { busy(button, false); }
});

$('#confirm-redeem').addEventListener('click', async () => {
  if (!selectedCoupon || selectedCoupon.testOnly) return;
  const button = $('#confirm-redeem');
  busy(button, true);
  try {
    if (redemptionNeedsRecheck) {
      const current = await request(`/api/admin/coupons/${selectedCoupon.code}`);
      renderRedemption(current);
      if (current.status === 'redeemed') message($('#redeem-message'), 'El sistema confirma que el cupón está canjeado. No registres otra entrega.', 'success');
    } else {
      const coupon = await request(`/api/admin/coupons/${selectedCoupon.code}/redeem`, { method: 'POST', body: {} });
      renderRedemption(coupon);
      message($('#redeem-message'), '¡Canje confirmado! Ya puedes entregar el premio. Gracias por crear un buen momento.', 'success');
      toast('Canje confirmado. Un nuevo buen momento entregado.');
    }
    await refreshAfterMutation();
  } catch (error) {
    handleError(error, $('#redeem-message'));
    if (error.status !== 401) {
      redemptionNeedsRecheck = true;
      button.hidden = false;
      button.textContent = 'Volver a verificar el estado';
      message($('#redeem-message'), `${error.message} Verifica el estado antes de entregar el premio.`, 'error');
    }
  } finally { busy(button, false); }
});

async function enterWorkspace(session) {
  setCsrfToken(session.csrfToken);
  signedIn = true;
  $('#admin-shell').hidden = false;
  $('#login-screen').hidden = true;
  settingsDirty = false;
  inventoryEdits.clear();
  lastInventory = '';
  lastSettings = '';
  lastCoupons = '';
  try {
    await loadDashboard();
    await handleHash();
  } finally { scheduleAutoRefresh(); }
}
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  busy($('#login-button'), true);
  message($('#login-message'));
  try {
    const session = await request('/api/admin/login', { method: 'POST', body: { password: $('#admin-password').value } });
    $('#admin-password').value = '';
    await enterWorkspace(session);
  } catch (error) { message($('#login-message'), error.message, 'error'); }
  finally { busy($('#login-button'), false); }
});
$('#logout-button').addEventListener('click', async () => {
  busy($('#logout-button'), true);
  try {
    await request('/api/admin/logout', { method: 'POST', body: {} });
    showLogin();
    $('#admin-password').focus();
  } catch (error) { handleError(error); }
  finally { busy($('#logout-button'), false); }
});

if (deployment.backendAvailable) {
  try { await enterWorkspace(await request('/api/admin/session')); }
  catch (error) { if (error.status === 401) showLogin(); else showLogin(error.message); }
} else {
  showLogin(deployment.backendNotice);
  $('#admin-password').disabled = true;
  $('#login-button').disabled = true;
}
