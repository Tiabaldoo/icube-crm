import { ApiClient } from '../data/api-client.mjs';

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const money = (value) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value ?? 0))} ₽`;
const isoToRu = (value) => String(value ?? '').split('-').reverse().join('.');
const percent = (value) => String(value ?? '').replace(/\.0+$/, '');

export function settlementDirection(transferAmount) {
  const amount = Number(transferAmount ?? 0);
  if (amount > 0) return { label: 'К получению', detail: 'от iCube', amount: Math.abs(amount), closed: false };
  if (amount < 0) return { label: 'К переводу', detail: 'в iCube', amount: Math.abs(amount), closed: false };
  return { label: '', detail: 'Взаиморасчёт закрыт', amount: 0, closed: true };
}

function appendNavigationButton(html, className, button) {
  const marker = `<div class="${className}">`;
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = html.indexOf('</div>', start + marker.length);
  if (end < 0) return html;
  return `${html.slice(0, end)}${button}${html.slice(end)}`;
}

export function installPartnerSettlementUi({ windowObject = globalThis.window, api = new ApiClient() } = {}) {
  const legacy = windowObject?.icubeLegacy;
  if (!legacy) return;
  const state = legacy.state;
  const basePartnerPage = windowObject.partner;
  const baseShell = windowObject.shell;

  const partnerProfile = () => (state.authUser?.roles ?? []).includes('partner') && !(state.authUser?.roles ?? []).includes('director');
  const ownProject = () => (state.projects ?? []).find((project) => project.active !== false) ?? null;

  function resultContent() {
    const project = ownProject();
    const result = String(state.partnerSettlement?.projectId ?? '') === String(project?.id ?? '') ? state.partnerSettlement : null;
    if (state.partnerSettlementError) return `<div class="card pad partner-settlement"><div class="notice">${safe(state.partnerSettlementError)}</div></div>`;
    if (!result) return '<div class="card pad partner-settlement"><div class="empty">Выберите период и нажмите «Рассчитать».</div></div>';

    const direction = settlementDirection(result.transferAmount);
    const final = direction.closed
      ? `<div class="partner-final partner-final-closed"><span>Итоговый расчёт</span><b>${money(0)}</b><div class="partner-final-note">${safe(direction.detail)}</div></div>`
      : `<div class="partner-final ${Number(result.transferAmount) > 0 ? 'partner-final-pay' : 'partner-final-return'}"><span>Итоговый расчёт · ${safe(direction.label)}</span><b>${money(direction.amount)}</b><div class="partner-final-note">${safe(direction.detail)}</div></div>`;

    return `<div class="card pad partner-settlement"><div class="section-title"><div><h2 style="font-size:22px">${safe(result.projectName)}</h2><div class="muted">${isoToRu(result.periodFrom)} — ${isoToRu(result.periodTo)}</div></div></div>
      <div class="partner-lines">
        <div class="partner-line"><span>Оплаты</span><b>${money(result.paymentsAmount)}</b></div>
        <div class="partner-line"><span>Возвраты</span><b>${money(result.refundsAmount)}</b></div>
        <div class="partner-line"><span>Доход после возвратов</span><b>${money(result.incomeAmount)}</b></div>
        <div class="partner-line"><span>Налог ${safe(percent(result.taxPercent))}%</span><b>− ${money(result.taxAmount)}</b></div>
        <div class="partner-line"><span>Зарплата преподавателей</span><b>− ${money(result.salaryAmount)}</b></div>
        <div class="partner-line partner-divider"><span>Остаток к распределению</span><b>${money(result.distributableAmount)}</b></div>
        <div class="partner-line"><span>Доля iCube · ${safe(percent(result.icubePercent))}%</span><b>${money(result.icubeShareAmount)}</b></div>
        <div class="partner-line"><span>Доля партнёра · ${safe(percent(result.partnerPercent))}%</span><b>${money(result.partnerShareAmount)}</b></div>
        <div class="partner-line"><span>Наличные у партнёра</span><b>${money(result.cashHeldByPartner)}</b></div>
      </div>${final}</div>`;
  }

  function partnerSettlementPage() {
    if (!partnerProfile()) return typeof basePartnerPage === 'function' ? basePartnerPage() : '';
    const project = ownProject();
    if (!project) return `${legacy.pageHead('Расчёты', 'Взаиморасчёт по вашему проекту.')}<div class="card pad"><div class="empty">Партнёрский проект не найден.</div></div>`;
    return `${legacy.pageHead('Расчёты', `Взаиморасчёт · ${safe(project.name)}`)}<div class="partner-settlement-toolbar">
      <div class="field"><label>С</label><input class="input" id="partner-read-from" type="date" value="${safe(state.partnerDateFrom)}"></div>
      <div class="field"><label>По</label><input class="input" id="partner-read-to" type="date" value="${safe(state.partnerDateTo)}"></div>
      <button class="btn primary" onclick="icubePartnerSettlementCalculate()">Рассчитать</button>
    </div>${resultContent()}`;
  }

  async function calculate() {
    const from = windowObject.document?.querySelector('#partner-read-from')?.value || state.partnerDateFrom;
    const to = windowObject.document?.querySelector('#partner-read-to')?.value || state.partnerDateTo;
    state.partnerDateFrom = from;
    state.partnerDateTo = to;
    try {
      state.partnerSettlement = await api.list('partner-settlements', `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      state.partnerSettlementError = null;
    } catch (error) {
      state.partnerSettlement = null;
      state.partnerSettlementError = error?.message ?? 'Не удалось рассчитать взаиморасчёт';
    }
    legacy.render();
  }

  windowObject.partner = partnerSettlementPage;
  windowObject.icubePartnerSettlementCalculate = calculate;

  if (typeof baseShell === 'function') {
    windowObject.shell = function (...args) {
      let output = baseShell.apply(this, args);
      if (!partnerProfile()) return output;
      const active = state.page === 'partner' ? 'active' : '';
      output = appendNavigationButton(output, 'nav', `<button class="${active}" onclick="navTo('partner')">Расчёты</button>`);
      output = appendNavigationButton(output, 'mobile-drawer-nav', `<button class="${active}" onclick="mobileNavToV129('partner')">Расчёты</button>`);
      return output;
    };
  }
}

if (typeof window !== 'undefined' && window.icubeLegacy) installPartnerSettlementUi();
