import { request } from './api.js';

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
export const statusLabels = { active: 'Por disfrutar', redeemed: 'Canjeado', expired: 'Vencido' };

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function icon(name) {
  const node = element('span', `icon icon--${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function message(target, text = '', kind = '') {
  target.textContent = text;
  target.dataset.kind = kind;
}

export function busy(button, active) {
  button.disabled = active;
  button.setAttribute('aria-busy', String(active));
}

export function formatDate(value, withTime = false) {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'America/Santiago',
  }).format(new Date(value));
}

export function updateRules(rules) {
  $$('[data-rule]').forEach((node) => {
    if (Object.hasOwn(rules, node.dataset.rule)) node.textContent = rules[node.dataset.rule];
  });
}

const dialogTriggers = new WeakMap();
export function openDialog(dialog) {
  if (dialog.open) return;
  dialogTriggers.set(dialog, document.activeElement);
  dialog.showModal();
  document.body.classList.add('dialog-open');
}

export function initializeDialogs() {
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('[data-open-dialog]').forEach((button) => button.addEventListener('click', () => openDialog(document.getElementById(button.dataset.openDialog))));
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('close', () => {
      if (!$('dialog[open]')) document.body.classList.remove('dialog-open');
      dialogTriggers.get(dialog)?.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
  });
}

let toastTimeout;
export function toast(text) {
  const node = $('#toast');
  if (!node) return;
  clearTimeout(toastTimeout);
  node.textContent = text;
  node.hidden = false;
  toastTimeout = setTimeout(() => { node.hidden = true; }, 4500);
}

export function emptyState(title, description, iconName = 'spark') {
  const node = element('div', 'empty-state');
  node.append(icon(iconName), element('h3', '', title), element('p', '', description));
  return node;
}

export function statusChip(status) {
  const node = element('span', 'status-chip', statusLabels[status] ?? status);
  node.dataset.status = status;
  return node;
}

export function renderFramedCoupon(coupon, ids) {
  document.getElementById(ids.name).textContent = coupon.prize.name;
  document.getElementById(ids.code).textContent = coupon.code;
  document.getElementById(ids.expiry).textContent = `Vence ${formatDate(coupon.expiresAt, true)} · Un solo canje`;
  document.getElementById(ids.qr).src = `/api/coupons/${coupon.token}/qr`;
}

export function couponUrl(coupon) { return `${location.origin}/premio/cupon.html#${coupon.token}`; }

async function loadImage(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = `${line}${word} `;
    if (context.measureText(next).width > maxWidth && line) {
      context.fillText(line.trim(), x, y);
      line = `${word} `;
      y += lineHeight;
    } else line = next;
  }
  context.fillText(line.trim(), x, y);
}

export async function downloadCoupon(coupon) {
  coupon = await request(`/api/coupons/${coupon.token}`);
  const [frame, qr] = await Promise.all([loadImage('/premio/img/sinimg.jpeg'), loadImage(`/api/coupons/${coupon.token}/qr`)]);
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 1390;
  const context = canvas.getContext('2d');
  context.drawImage(frame, 0, 0, 768, 1390);
  context.textAlign = 'center';
  context.fillStyle = '#5f6943';
  context.font = '700 15px Manrope, sans-serif';
  context.fillText('TU PEQUEÑO GRAN MOMENTO', 384, 475);
  context.fillStyle = '#233b1c';
  context.font = '700 44px Syne, sans-serif';
  wrapCanvasText(context, coupon.prize.name, 384, 565, 510, 54);
  context.font = '600 19px Manrope, sans-serif';
  context.fillText('Presenta este cupón en Los Olivos', 384, 682);
  context.font = '800 27px Manrope, sans-serif';
  context.fillText(coupon.code, 384, 750);
  context.drawImage(qr, 264, 805, 240, 240);
  context.font = '600 17px Manrope, sans-serif';
  context.fillText(`Vence ${formatDate(coupon.expiresAt, true)}`, 384, 1110);
  context.font = '500 15px Manrope, sans-serif';
  context.fillText(`Estado al descargar: ${statusLabels[coupon.status]}`, 384, 1150);
  context.fillText('Un solo canje. El local verifica su estado en línea.', 384, 1182);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo crear la imagen.')), 'image/png'));
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = `los-olivos-${coupon.code}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const input = element('textarea', 'sr-only');
  input.value = text;
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('No se pudo copiar el enlace. Puedes guardarlo desde la barra de direcciones.');
}
