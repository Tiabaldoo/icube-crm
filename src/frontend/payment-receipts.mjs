import { ApiClient, ApiError } from '../data/api-client.mjs';

const api = new ApiClient();
const legacy = window.icubeLegacy;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (symbol) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[symbol]);
const errorText = (error) => error instanceof ApiError ? error.message : 'Не удалось выполнить операцию';
const operationKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let queue = null;
let loading = false;

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
    const button = `<button class="btn soft" onclick="icubePaymentReceipts.openFile(${payment.receiptIds[0]})">Посмотреть чек</button>`;
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
  const options = receipt.options.map((item) => `<div class="payment-receipt-option"><div><b>${esc(item.childName)}</b><span>${esc(item.directionName)} — ${money(item.subscriptionAmount)} / 4 занятия</span></div><button class="btn primary" onclick="icubePaymentReceipts.apply(${receipt.id},${item.enrollmentId})">Зачислить абонемент</button></div>`).join('');
  const closeLabel = receipt.linkedPayments ? 'Завершить обработку' : 'Закрыть без автоматического зачисления';
  return `<h3>Чек от ${dateRu(receipt.uploadedAt)}</h3><div class="muted">Родитель: ${esc(receipt.guardianName || 'Не указан')}</div>${preview}<div class="payment-receipt-options">${options || '<div class="empty">Нет доступных активных направлений.</div>'}</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Закрыть</button><button class="btn danger" onclick="icubePaymentReceipts.close(${receipt.id},${receipt.linkedPayments ? 'true' : 'false'})">${closeLabel}</button></div>`;
}

async function open(receiptId) {
  try { legacy.state.modal = detailHtml(await api.request(`/payment-receipts/${receiptId}`)); legacy.render(); }
  catch (error) { window.alert(errorText(error)); }
}

async function apply(receiptId, enrollmentId) {
  try {
    await api.request(`/payment-receipts/${receiptId}/apply-subscription`, { method: 'POST', body: { enrollmentId }, idempotencyKey: operationKey() });
    await window.icubeApi.reload({ render: false });
    await loadQueue({ render: false });
    await open(receiptId);
  } catch (error) { window.alert(errorText(error)); }
}

async function close(receiptId, linked = false) {
  const warning = linked ? 'Завершить обработку чека?' : 'Чек будет закрыт без создания оплаты. Если оплата поступила, внесите её вручную в разделе «Оплаты».';
  if (!window.confirm(warning)) return;
  try {
    await api.request(`/payment-receipts/${receiptId}/close`, { method: 'POST', body: {} });
    legacy.state.modal = null; await loadQueue({ render: false }); legacy.render();
  } catch (error) { window.alert(errorText(error)); }
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

window.icubePaymentReceipts = { open, apply, close, openFile, refreshCandidates, refresh: loadQueue };
