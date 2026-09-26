import { ApiClient, ApiError } from '../data/api-client.mjs';

const api = new ApiClient();
const legacy = window.icubeLegacy;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const errorText = (error) => error instanceof ApiError ? error.message : 'Не удалось выполнить операцию';
let queue = null;
let loading = false;
const submitting = new Set();

function staffAllowed() { return ['director', 'partner'].includes(legacy.state.role); }
function dateRu(value) { return String(value ?? '').slice(0, 10).split('-').reverse().join('.'); }
function money(value) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value ?? 0))} ₽`; }

async function loadQueue({ render = true } = {}) {
  if (!staffAllowed() || loading) return;
  loading = true;
  try { queue = await api.request('/payment-receipts'); }
  catch (error) { queue = { error: errorText(error) }; }
  finally { loading = false; if (render && legacy.state.page === 'payments') legacy.render(); }
}

function queueHtml() {
  if (!staffAllowed()) return '';
  if (queue == null) { queueMicrotask(() => loadQueue()); return '<div class="card pad"><h2>Чеки на проверке</h2><div class="muted">Загрузка…</div></div>'; }
  if (queue.error) return `<div class="card pad"><h2>Чеки на проверке</h2><div class="notice">${esc(queue.error)}</div></div>`;
  return `<div class="card pad payment-receipt-queue"><div class="section-title"><div><h2>Чеки на проверке</h2><div class="muted mini">Чек сам по себе не меняет баланс</div></div></div>${queue.length ? `<div class="list">${queue.map((receipt) => `<div class="kpi-line"><div><b>${dateRu(receipt.uploadedAt)}</b><div class="muted mini">Родитель: ${esc(receipt.guardianName || 'Не указан')}</div></div><button class="btn" onclick="icubePaymentReceipts.open(${receipt.id})">Посмотреть чек</button></div>`).join('')}</div>` : '<div class="empty">Новых чеков нет.</div>'}</div>`;
}

function receiptButtons(html) {
  for (const payment of legacy.state.payments ?? []) {
    if (!payment.receiptIds?.length) continue;
    const button = `<button class="btn soft payment-receipt-action" title="Посмотреть чек" aria-label="Посмотреть чек" onclick="icubePaymentReceipts.openFile(${payment.receiptIds[0]})">📎 <span>Чек</span></button>`;
    html = html.replace(`<button class="btn" onclick="editPayment(${payment.id})">`, `${button}<button class="btn" onclick="editPayment(${payment.id})">`);
    html = html.replace(`<button class="btn" onclick="editChildPayment(${payment.childId},${payment.id})">`, `${button}<button class="btn" onclick="editChildPayment(${payment.childId},${payment.id})">`);
  }
  return html;
}

const originalPayments = window.payments;
if (typeof originalPayments === 'function') window.payments = function (...args) {
  return `${queueHtml()}${receiptButtons(originalPayments.apply(this, args))}`;
};
const originalChild = window.child;
if (typeof originalChild === 'function') window.child = function (...args) {
  return receiptButtons(originalChild.apply(this, args));
};

function detailHtml(receipt) {
  const preview = receipt.mimeType === 'application/pdf'
    ? `<iframe class="payment-receipt-preview" src="${esc(receipt.fileUrl)}" title="Чек"></iframe>`
    : `<img class="payment-receipt-preview" src="${esc(receipt.fileUrl)}" alt="Чек об оплате">`;
  const options = receipt.options.map((item) => {
    const linked = Number(item.linkedPayments) > 0;
    return `<div class="payment-receipt-option"><div><b>${esc(item.childName)}</b><span>${esc(item.directionName)} — ${money(item.subscriptionAmount)} / 4 занятия</span></div>${linked
      ? `<strong class="payment-receipt-linked">✓ Внесено ${money(item.linkedAmount)}</strong>`
      : `<button class="btn primary" onclick="icubePaymentReceipts.beginApply(${receipt.id},${item.enrollmentId})">Внести оплату</button>`}</div>`;
  }).join('');
  const allLinked = receipt.options.every((item) => Number(item.linkedPayments) > 0);
  return `<h3>Чек от ${dateRu(receipt.uploadedAt)}</h3><div class="muted">Родитель: ${esc(receipt.guardianName || 'Не указан')}</div>${preview}<div class="notice payment-receipt-hint">Сумма по умолчанию равна стоимости абонемента. Если родитель перевёл другую сумму, измените её перед внесением оплаты.</div><div class="payment-receipt-options">${options || '<div class="empty">Нет доступных активных направлений.</div>'}</div><div class="modal-actions"><button class="btn primary" onclick="icubePaymentReceipts.close(${receipt.id},${allLinked})">Закрыть</button></div>`;
}

async function open(receiptId) {
  try { legacy.state.modal = detailHtml(await api.request(`/payment-receipts/${receiptId}`)); legacy.render(); }
  catch (error) { window.alert(errorText(error)); }
}

async function beginApply(receiptId, enrollmentId) {
  try {
    const receipt = await api.request(`/payment-receipts/${receiptId}`);
    const item = receipt.options.find((option) => String(option.enrollmentId) === String(enrollmentId));
    if (!item) throw new ApiError('Направление недоступно для этого чека');
    legacy.state.modal = `<h3>Внести оплату</h3><div class="payment-receipt-payment-target"><b>${esc(item.childName)}</b><span>${esc(item.directionName)}</span></div><div class="form-grid"><div class="field span-2"><label>Сумма, ₽</label><input class="input" id="receipt-payment-amount" inputmode="decimal" value="${esc(item.subscriptionAmount)}"></div><div class="field"><label>Способ оплаты</label><input class="input" value="Безналичный расчёт" readonly></div><div class="field"><label>Дата</label><input class="input" value="${dateRu(receipt.uploadedAt)}" readonly></div></div><div class="muted mini" style="margin-top:10px">По умолчанию указана текущая стоимость абонемента. Если родитель перевёл другую сумму, укажите фактически полученную сумму.</div><div class="modal-actions"><button class="btn" onclick="icubePaymentReceipts.open(${receipt.id})">Отмена</button><button class="btn primary" id="receipt-payment-submit" onclick="icubePaymentReceipts.confirmApply(${receipt.id},${item.enrollmentId})">Внести оплату</button></div>`;
    legacy.render();
  } catch (error) { window.alert(errorText(error)); }
}

async function confirmApply(receiptId, enrollmentId) {
  const key = `${receiptId}:${enrollmentId}`;
  if (submitting.has(key)) return;
  const button = document.querySelector('#receipt-payment-submit'); const amount = document.querySelector('#receipt-payment-amount')?.value;
  submitting.add(key); if (button) { button.disabled = true; button.textContent = 'Вносим…'; }
  try {
    await api.request(`/payment-receipts/${receiptId}/apply-subscription`, { method: 'POST', body: { enrollmentId, amount }, idempotencyKey: `receipt-${receiptId}-enrollment-${enrollmentId}` });
    await window.icubeApi.reload({ render: false });
    await loadQueue({ render: false });
    await open(receiptId);
    submitting.delete(key);
  } catch (error) {
    submitting.delete(key); if (button) { button.disabled = false; button.textContent = 'Внести оплату'; }
    window.alert(errorText(error));
  }
}

async function finishClose(receiptId) {
  try {
    await api.request(`/payment-receipts/${receiptId}/close`, { method: 'POST', body: {} });
    legacy.state.modal = null; await loadQueue({ render: false }); legacy.render();
  } catch (error) { window.alert(errorText(error)); }
}

async function close(receiptId, allLinked = false) {
  if (allLinked) return finishClose(receiptId);
  legacy.state.modal = `<h3>Не все оплаты по этому чеку внесены</h3><p>Если закрыть проверку сейчас, чек исчезнет из очереди. Оставшиеся оплаты при необходимости нужно будет внести вручную.</p><div class="modal-actions"><button class="btn" onclick="icubePaymentReceipts.open(${receiptId})">Вернуться</button><button class="btn danger" onclick="icubePaymentReceipts.finishClose(${receiptId})">Закрыть без внесения</button></div>`;
  legacy.render();
}

function openFile(receiptId) { window.open(`/api/v1/payment-receipts/${encodeURIComponent(receiptId)}/file`, '_blank', 'noopener'); }

async function refreshCandidates() {
  const field = document.querySelector('#pf-receipt-field');
  if (!field) return;
  const childId = document.querySelector('#pf-child')?.value;
  if (!childId) { field.innerHTML = ''; return; }
  try {
    const receipts = await api.request(`/payment-receipts?childId=${encodeURIComponent(childId)}&all=true`);
    field.innerHTML = receipts.length ? `<label>Чек родителя</label><select class="select" id="pf-receipt"><option value="">Не прикреплять</option>${receipts.map((item) => `<option value="${item.id}">Есть чек от ${dateRu(item.uploadedAt)}</option>`).join('')}</select>` : '';
  } catch { field.innerHTML = ''; }
}

window.icubePaymentReceipts = { open, beginApply, confirmApply, close, finishClose, openFile, refreshCandidates, refresh: loadQueue };
