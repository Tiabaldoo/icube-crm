import { ApiClient, ApiError } from '../data/api-client.mjs';

const legacy = window.icubeLegacy;
const api = new ApiClient();
const state = legacy.state;
const LEAVE_WARNING = 'Есть несохранённые изменения. Уйти без сохранения?';
const SETTINGS_DESCRIPTION = 'Основные параметры работы CRM: цены, зарплаты и условия партнёрских проектов.';
const salaryStateKeys = {
  regular_fixed: 'salaryFix',
  per_present_child: 'salaryChild',
  intro_fixed: 'salaryIntro',
  empty_trip_fixed: 'salaryEmpty',
};
let currentByCode = new Map();
let currentSalaryByKey = new Map();
let currentPartnerAgreement = null;
let baseline = null;
let dirty = false;
let settingsLoaded = false;
let savedMessageTimer = null;

function fail(error) {
  window.alert(error instanceof ApiError ? error.message : 'Не удалось сохранить настройки');
  console.error(error);
}

function findPrice(code, name) {
  return currentByCode.get(code) ?? Array.from(currentByCode.values()).find((item) => item.directionName === name) ?? null;
}

function applyPrices(items) {
  currentByCode = new Map(items.map((item) => [item.directionCode, item]));
  const robotics = findPrice('robotics', 'Робототехника');
  const programming = findPrice('programming', 'Программирование');
  if (robotics?.price != null) state.settings.robotPrice = Number(robotics.price);
  if (programming?.price != null) state.settings.codePrice = Number(programming.price);
}

function applySalaryRates(items) {
  currentSalaryByKey = new Map(items.map((item) => [item.key, item]));
  for (const [key, stateKey] of Object.entries(salaryStateKeys)) {
    const rate = currentSalaryByKey.get(key);
    if (rate?.value != null) state.settings[stateKey] = Number(rate.value);
  }
}

function applyPartnerAgreement(agreement) {
  currentPartnerAgreement = agreement;
  if (agreement?.taxPercent != null) state.settings.tax = Number(agreement.taxPercent);
  if (agreement?.icubePercent != null) state.settings.icubeShare = Number(agreement.icubePercent);
  if (agreement?.partnerPercent != null) state.settings.partnerShare = Number(agreement.partnerPercent);
}

function normalizeMoney(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,11})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function normalizePercent(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,3})(?:[.,](\d{1,3}))?$/);
  if (!match) return null;
  const units = BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
  if (units > 100000n) return null;
  return `${units / 1000n}.${String(units % 1000n).padStart(3, '0')}`;
}

function serverValues() {
  return {
    robotPackage: normalizeMoney(findPrice('robotics', 'Робототехника')?.packagePrice),
    codePackage: normalizeMoney(findPrice('programming', 'Программирование')?.packagePrice),
    regular_fixed: normalizeMoney(currentSalaryByKey.get('regular_fixed')?.value),
    per_present_child: normalizeMoney(currentSalaryByKey.get('per_present_child')?.value),
    intro_fixed: normalizeMoney(currentSalaryByKey.get('intro_fixed')?.value),
    empty_trip_fixed: normalizeMoney(currentSalaryByKey.get('empty_trip_fixed')?.value),
    taxPercent: normalizePercent(currentPartnerAgreement?.taxPercent),
    icubePercent: normalizePercent(currentPartnerAgreement?.icubePercent),
    partnerPercent: normalizePercent(currentPartnerAgreement?.partnerPercent),
  };
}

function formValues() {
  return {
    robotPackage: normalizeMoney(document.querySelector('#settings-robot-package')?.value),
    codePackage: normalizeMoney(document.querySelector('#settings-code-package')?.value),
    regular_fixed: normalizeMoney(document.querySelector('#settings-salary-fixed')?.value),
    per_present_child: normalizeMoney(document.querySelector('#settings-salary-child')?.value),
    intro_fixed: normalizeMoney(document.querySelector('#settings-salary-intro')?.value),
    empty_trip_fixed: normalizeMoney(document.querySelector('#settings-salary-empty')?.value),
    taxPercent: normalizePercent(document.querySelector('#settings-partner-tax')?.value),
    icubePercent: normalizePercent(document.querySelector('#settings-partner-icube')?.value),
    partnerPercent: normalizePercent(document.querySelector('#settings-partner-share')?.value),
  };
}

function setCleanBaseline() {
  baseline = serverValues();
  dirty = false;
}

function recalculateDirty() {
  if (!baseline || state.page !== 'settings') return;
  const current = formValues();
  dirty = Object.keys(baseline).some((key) => current[key] !== baseline[key]);
}

function rowByLabel(block, label) {
  return Array.from(block.querySelectorAll('.setting-row')).find((row) => row.querySelector('b')?.textContent?.trim() === label);
}

function prepareInput(row, id, value) {
  const input = row?.querySelector('input');
  if (!input) return null;
  input.id = id;
  input.removeAttribute('onchange');
  input.value = value ?? '';
  input.addEventListener('input', recalculateDirty);
  return input;
}

function bindSettingsForm() {
  if (!settingsLoaded || state.page !== 'settings') return;
  const blocks = Array.from(document.querySelectorAll('.settings-block'));
  const priceBlock = blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Стоимость занятий');
  const salaryBlock = blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Зарплата');
  const partnerBlock = blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Партнёрство');
  const settingsCard = priceBlock?.closest('.card');
  if (!priceBlock || !salaryBlock || !partnerBlock || !settingsCard || settingsCard.dataset.apiSettingsBound === 'true') return;

  const pageDescription = document.querySelector('.page-head .muted');
  if (pageDescription) pageDescription.textContent = SETTINGS_DESCRIPTION;
  const productionNotice = Array.from(partnerBlock.querySelectorAll('.notice')).find((item) => item.textContent.includes('В production изменение настроек'));
  productionNotice?.remove();

  const robotics = findPrice('robotics', 'Робототехника');
  const programming = findPrice('programming', 'Программирование');
  const roboticsRow = rowByLabel(priceBlock, 'Робототехника');
  const programmingRow = rowByLabel(priceBlock, 'Программирование');
  prepareInput(roboticsRow, 'settings-robot-package', robotics?.packagePrice);
  prepareInput(programmingRow, 'settings-code-package', programming?.packagePrice);
  roboticsRow.querySelector('.muted.mini').textContent = 'Базовая цена абонемента за 4 занятия';
  programmingRow.querySelector('.muted.mini').textContent = 'Базовая цена абонемента за 4 занятия';

  prepareInput(rowByLabel(salaryBlock, 'Фикс обычного занятия'), 'settings-salary-fixed', currentSalaryByKey.get('regular_fixed')?.value);
  prepareInput(rowByLabel(salaryBlock, 'За присутствующего ребёнка'), 'settings-salary-child', currentSalaryByKey.get('per_present_child')?.value);
  prepareInput(rowByLabel(salaryBlock, 'Ознакомительное занятие'), 'settings-salary-intro', currentSalaryByKey.get('intro_fixed')?.value);
  prepareInput(rowByLabel(salaryBlock, 'Пустой выезд'), 'settings-salary-empty', currentSalaryByKey.get('empty_trip_fixed')?.value);

  prepareInput(rowByLabel(partnerBlock, 'Налог, %'), 'settings-partner-tax', currentPartnerAgreement?.taxPercent);
  prepareInput(rowByLabel(partnerBlock, 'Доля iCube, %'), 'settings-partner-icube', currentPartnerAgreement?.icubePercent);
  prepareInput(rowByLabel(partnerBlock, 'Доля партнёра, %'), 'settings-partner-share', currentPartnerAgreement?.partnerPercent);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 20px 20px';
  actions.dataset.settingsActions = 'true';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn primary';
  button.textContent = 'Сохранить настройки';
  button.addEventListener('click', saveSettings);
  const status = document.createElement('div');
  status.id = 'settings-save-status';
  status.className = 'notice';
  status.textContent = 'Настройки сохранены';
  status.hidden = true;
  status.style.margin = '0';
  actions.append(button, status);
  settingsCard.appendChild(actions);
  settingsCard.dataset.apiSettingsBound = 'true';
  recalculateDirty();
}

function showSavedMessage() {
  bindSettingsForm();
  const status = document.querySelector('#settings-save-status');
  if (!status) return;
  status.hidden = false;
  if (savedMessageTimer) window.clearTimeout(savedMessageTimer);
  savedMessageTimer = window.setTimeout(() => { status.hidden = true; }, 2500);
}

async function refreshServerSettings() {
  const [prices, salaryRates, partnerAgreement] = await Promise.all([
    api.list('price-versions'),
    api.list('salary-rate-versions'),
    api.list('partner-agreement-versions'),
  ]);
  applyPrices(prices);
  applySalaryRates(salaryRates);
  applyPartnerAgreement(partnerAgreement);
}

async function saveSettings() {
  const robotics = findPrice('robotics', 'Робототехника');
  const programming = findPrice('programming', 'Программирование');
  if (!robotics || !programming) return window.alert('Не найдены направления в серверном справочнике');
  if (!currentPartnerAgreement) return window.alert('Не найдены условия партнёрского проекта «Зебра»');
  const values = formValues();
  if (Object.values(values).some((value) => value == null)) return window.alert('Проверьте заполнение полей настроек');

  try {
    const priceChanges = [
      { current: robotics, value: values.robotPackage },
      { current: programming, value: values.codePackage },
    ];
    for (const item of priceChanges) {
      if (normalizeMoney(item.current.packagePrice) === item.value) continue;
      await api.create('price-versions', { directionId: item.current.directionId, packagePrice: item.value });
    }

    for (const key of Object.keys(salaryStateKeys)) {
      const current = currentSalaryByKey.get(key);
      if (!current) throw new Error(`Не найдена ставка ${key}`);
      if (normalizeMoney(current.value) === values[key]) continue;
      await api.create('salary-rate-versions', { key, value: values[key] });
    }

    const partnerChanged = normalizePercent(currentPartnerAgreement.taxPercent) !== values.taxPercent
      || normalizePercent(currentPartnerAgreement.icubePercent) !== values.icubePercent
      || normalizePercent(currentPartnerAgreement.partnerPercent) !== values.partnerPercent;
    if (partnerChanged) {
      await api.create('partner-agreement-versions', {
        projectCode: 'zebra',
        taxPercent: values.taxPercent,
        icubePercent: values.icubePercent,
        partnerPercent: values.partnerPercent,
      });
    }

    await refreshServerSettings();
    await window.icubeApi.reload({ render: false });
    state.page = 'settings';
    setCleanBaseline();
    legacy.render();
    queueMicrotask(showSavedMessage);
  } catch (error) { fail(error); }
}

const originalNavTo = window.navTo;
if (typeof originalNavTo === 'function') {
  window.navTo = function (page) {
    if (state.page === 'settings' && page !== 'settings' && dirty) {
      if (!window.confirm(LEAVE_WARNING)) return;
      dirty = false;
    }
    return originalNavTo.apply(this, arguments);
  };
}

window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

const observer = new MutationObserver(bindSettingsForm);
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });

refreshServerSettings()
  .then(() => {
    settingsLoaded = true;
    setCleanBaseline();
    legacy.render();
  })
  .catch(fail);
