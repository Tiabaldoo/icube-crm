import { ApiClient, ApiError } from '../data/api-client.mjs';

const authenticatedUser = await (window.icubeAuthReady ?? Promise.resolve(null));
if (authenticatedUser?.roles?.includes('director')) {
const legacy = window.icubeLegacy;
const api = new ApiClient();
const state = legacy.state;
const LEAVE_WARNING = 'Есть несохранённые изменения. Уйти без сохранения?';
const SETTINGS_DESCRIPTION = 'Основные параметры работы CRM: цены, зарплаты и условия партнёрских проектов.';
const SALARY_LOAD_MESSAGE = 'Не удалось загрузить ставки зарплаты. Обновите страницу или попробуйте ещё раз.';
const PARTNER_LOAD_MESSAGE = 'Не удалось загрузить условия партнёрства. Обновите страницу или попробуйте ещё раз.';
const PARTNER_SETUP_MESSAGE = 'Сначала настройте партнёра проекта «Зебра»';
const salaryStateKeys = {
  regular_fixed: 'salaryFix',
  per_present_child: 'salaryChild',
  intro_fixed: 'salaryIntro',
  empty_trip_fixed: 'salaryEmpty',
};
let currentByCode = new Map();
let currentSalaryByKey = new Map();
let currentPartnerAgreement = null;
let priceLoaded = false;
let salaryLoaded = false;
let partnerLoaded = false;
let partnerSettingsAvailable = false;
let priceLoadError = null;
let salaryLoadError = null;
let partnerLoadError = null;
let savingPrice = false;
let savingSalary = false;
let savingPartner = false;
let baseline = null;
let dirty = false;

function backendMessage(error, fallback) {
  return error instanceof ApiError && error.message ? error.message : fallback;
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
  priceLoaded = Boolean(robotics && programming);
  priceLoadError = priceLoaded ? null : 'Не удалось загрузить стоимость занятий.';
}

function applySalaryRates(items) {
  const next = new Map((items ?? []).map((item) => [item.key, item]));
  const complete = Object.keys(salaryStateKeys).every((key) => next.get(key)?.value != null);
  if (!complete) throw new Error('Сервер вернул неполный набор ставок зарплаты');
  currentSalaryByKey = next;
  salaryLoaded = true;
  salaryLoadError = null;
  state.serverSalaryRates = Object.fromEntries(Array.from(next.entries()).map(([key, item]) => [key, { ...item }]));
  for (const [key, stateKey] of Object.entries(salaryStateKeys)) {
    state.settings[stateKey] = Number(next.get(key).value);
  }
}

function clearSalaryRates(error) {
  currentSalaryByKey = new Map();
  salaryLoaded = false;
  salaryLoadError = SALARY_LOAD_MESSAGE;
  state.serverSalaryRates = null;
  console.error(error);
}

function applyPartnerAgreement(agreement) {
  currentPartnerAgreement = agreement;
  partnerLoaded = Boolean(agreement);
  partnerSettingsAvailable = Boolean(agreement);
  partnerLoadError = null;
  state.serverPartnerAgreement = agreement ? { ...agreement } : null;
  if (!agreement) return;
  state.settings.tax = Number(agreement.taxPercent);
  state.settings.icubeShare = Number(agreement.icubePercent);
  state.settings.partnerShare = Number(agreement.partnerPercent);
}

function clearPartnerAgreement(error, message = PARTNER_LOAD_MESSAGE) {
  currentPartnerAgreement = null;
  partnerLoaded = false;
  partnerSettingsAvailable = false;
  partnerLoadError = message;
  state.serverPartnerAgreement = null;
  if (error) console.error(error);
}

function syncMetaState() {
  state.settingsLoadErrors = {
    salary: salaryLoadError,
    partner: partnerLoadError,
  };
  state.settingsSaving = {
    salary: savingSalary,
    partner: savingPartner,
  };
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

function percentUnits(normalized) {
  if (!normalized) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

function displayNumber(value) {
  const text = String(value ?? '');
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
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

function priceFormValues() {
  return {
    robotPackage: normalizeMoney(document.querySelector('#settings-robot-package')?.value),
    codePackage: normalizeMoney(document.querySelector('#settings-code-package')?.value),
  };
}

function salaryFormValues() {
  return {
    regular_fixed: normalizeMoney(document.querySelector('#settings-salary-fixed')?.value),
    per_present_child: normalizeMoney(document.querySelector('#settings-salary-child')?.value),
    intro_fixed: normalizeMoney(document.querySelector('#settings-salary-intro')?.value),
    empty_trip_fixed: normalizeMoney(document.querySelector('#settings-salary-empty')?.value),
  };
}

function partnerFormValues() {
  return {
    taxPercent: normalizePercent(document.querySelector('#settings-partner-tax')?.value),
    icubePercent: normalizePercent(document.querySelector('#settings-partner-icube')?.value),
    partnerPercent: normalizePercent(document.querySelector('#settings-partner-share')?.value),
  };
}

function formValues() {
  return { ...priceFormValues(), ...salaryFormValues(), ...partnerFormValues() };
}

function setCleanBaseline() {
  baseline = serverValues();
  recalculateDirty();
}

function recalculateDirty() {
  if (!baseline || state.page !== 'settings') {
    dirty = false;
    return;
  }
  const current = formValues();
  dirty = Object.keys(baseline).some((key) => current[key] !== baseline[key]);
}

function rowByLabel(block, label) {
  return Array.from(block.querySelectorAll('.setting-row')).find((row) => row.querySelector('b')?.textContent?.trim() === label);
}

function prepareInput(row, id, value, { step, disabled = false } = {}) {
  const input = row?.querySelector('input');
  if (!input) return null;
  input.id = id;
  input.removeAttribute('onchange');
  input.min = '0';
  if (step) input.step = step;
  input.value = displayNumber(value ?? '');
  input.disabled = disabled;
  if (input.dataset.serverSettingsTracked !== 'true') {
    input.addEventListener('input', recalculateDirty);
    input.dataset.serverSettingsTracked = 'true';
  }
  return input;
}

function ensureStatus(block, id) {
  let status = block.querySelector('#' + id);
  if (status) return status;
  status = document.createElement('div');
  status.id = id;
  status.className = 'notice';
  status.style.marginTop = '12px';
  status.hidden = true;
  block.appendChild(status);
  return status;
}

function setStatus(block, id, message) {
  const status = ensureStatus(block, id);
  status.textContent = message ?? '';
  status.hidden = !message;
}

function ensureAction(block, key, label, handler) {
  let action = block.querySelector('[data-settings-action="' + key + '"]');
  if (action) return action.querySelector('button');
  action = document.createElement('div');
  action.dataset.settingsAction = key;
  action.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn primary';
  button.textContent = label;
  button.addEventListener('click', handler);
  action.appendChild(button);
  block.appendChild(action);
  return button;
}

function syncPriceInputs(priceBlock) {
  const robotics = findPrice('robotics', 'Робототехника');
  const programming = findPrice('programming', 'Программирование');
  const roboticsRow = rowByLabel(priceBlock, 'Робототехника');
  const programmingRow = rowByLabel(priceBlock, 'Программирование');
  prepareInput(roboticsRow, 'settings-robot-package', priceLoaded ? robotics?.packagePrice : '', { step: '0.01', disabled: !priceLoaded });
  prepareInput(programmingRow, 'settings-code-package', priceLoaded ? programming?.packagePrice : '', { step: '0.01', disabled: !priceLoaded });
  const roboticsHint = roboticsRow?.querySelector('.muted.mini');
  const programmingHint = programmingRow?.querySelector('.muted.mini');
  if (roboticsHint) roboticsHint.textContent = 'Базовая цена абонемента за 4 занятия';
  if (programmingHint) programmingHint.textContent = 'Базовая цена абонемента за 4 занятия';
  const button = ensureAction(priceBlock, 'prices', 'Сохранить цены', savePrices);
  button.disabled = !priceLoaded || savingPrice;
  setStatus(priceBlock, 'settings-price-status', priceLoadError);
}

function syncSalaryInputs(salaryBlock) {
  prepareInput(rowByLabel(salaryBlock, 'Фикс обычного занятия'), 'settings-salary-fixed', salaryLoaded ? currentSalaryByKey.get('regular_fixed')?.value : '', { step: '0.01', disabled: !salaryLoaded });
  prepareInput(rowByLabel(salaryBlock, 'За присутствующего ребёнка'), 'settings-salary-child', salaryLoaded ? currentSalaryByKey.get('per_present_child')?.value : '', { step: '0.01', disabled: !salaryLoaded });
  prepareInput(rowByLabel(salaryBlock, 'Ознакомительное занятие'), 'settings-salary-intro', salaryLoaded ? currentSalaryByKey.get('intro_fixed')?.value : '', { step: '0.01', disabled: !salaryLoaded });
  prepareInput(rowByLabel(salaryBlock, 'Пустой выезд'), 'settings-salary-empty', salaryLoaded ? currentSalaryByKey.get('empty_trip_fixed')?.value : '', { step: '0.01', disabled: !salaryLoaded });
  const button = ensureAction(salaryBlock, 'salary', 'Сохранить ставки', saveSalaryRates);
  button.disabled = !salaryLoaded || savingSalary;
  setStatus(salaryBlock, 'settings-salary-status', salaryLoadError);
}

function syncPartnerInputs(partnerBlock) {
  const title = partnerBlock.querySelector('h3');
  if (title) title.textContent = 'Партнёрство · Зебра';
  prepareInput(rowByLabel(partnerBlock, 'Налог, %'), 'settings-partner-tax', partnerLoaded ? currentPartnerAgreement?.taxPercent : '', { step: '0.001', disabled: !partnerLoaded });
  prepareInput(rowByLabel(partnerBlock, 'Доля iCube, %'), 'settings-partner-icube', partnerLoaded ? currentPartnerAgreement?.icubePercent : '', { step: '0.001', disabled: !partnerLoaded });
  prepareInput(rowByLabel(partnerBlock, 'Доля партнёра, %'), 'settings-partner-share', partnerLoaded ? currentPartnerAgreement?.partnerPercent : '', { step: '0.001', disabled: !partnerLoaded });
  const button = ensureAction(partnerBlock, 'partner', 'Сохранить условия', savePartnerAgreement);
  button.disabled = !partnerLoaded || !partnerSettingsAvailable || savingPartner;
  setStatus(partnerBlock, 'settings-partner-status', partnerLoadError);
}

function bindSettingsForm() {
  if (state.page !== 'settings') return;
  const blocks = Array.from(document.querySelectorAll('.settings-block'));
  const priceBlock = blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Стоимость занятий');
  const salaryBlock = blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Зарплата');
  const partnerBlock = blocks.find((block) => {
    const title = block.querySelector('h3')?.textContent?.trim() ?? '';
    return title === 'Партнёрство' || title === 'Партнёрство · Зебра';
  });
  if (!priceBlock || !salaryBlock || !partnerBlock) return;

  const pageDescription = document.querySelector('.page-head .muted');
  if (pageDescription) pageDescription.textContent = SETTINGS_DESCRIPTION;
  const productionNotice = Array.from(partnerBlock.querySelectorAll('.notice')).find((item) => item.textContent.includes('В production изменение настроек'));
  productionNotice?.remove();

  syncPriceInputs(priceBlock);
  syncSalaryInputs(salaryBlock);
  syncPartnerInputs(partnerBlock);
  recalculateDirty();
}

async function loadPrices() {
  try {
    applyPrices(await api.list('price-versions'));
    return true;
  } catch (error) {
    priceLoaded = false;
    priceLoadError = backendMessage(error, 'Не удалось загрузить стоимость занятий.');
    console.error(error);
    return false;
  }
}

async function loadSalaryRates() {
  try {
    applySalaryRates(await api.list('salary-rate-versions'));
    syncMetaState();
    return true;
  } catch (error) {
    clearSalaryRates(error);
    syncMetaState();
    return false;
  }
}

async function loadPartnerAgreement() {
  try {
    applyPartnerAgreement(await api.list('partner-agreement-versions'));
    syncMetaState();
    return true;
  } catch (error) {
    if (error instanceof ApiError && ['PARTNER_NOT_CONFIGURED', 'PARTNER_AGREEMENT_NOT_CONFIGURED'].includes(error.code)) {
      clearPartnerAgreement(error, PARTNER_SETUP_MESSAGE);
    } else {
      clearPartnerAgreement(error, PARTNER_LOAD_MESSAGE);
    }
    syncMetaState();
    return false;
  }
}

function currentBlocks() {
  const blocks = Array.from(document.querySelectorAll('.settings-block'));
  return {
    price: blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Стоимость занятий'),
    salary: blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Зарплата'),
    partner: blocks.find((block) => (block.querySelector('h3')?.textContent?.trim() ?? '').startsWith('Партнёрство')),
  };
}

async function savePrices() {
  if (savingPrice || !priceLoaded) return;
  const robotics = findPrice('robotics', 'Робототехника');
  const programming = findPrice('programming', 'Программирование');
  if (!robotics || !programming) return window.alert('Не найдены направления в серверном справочнике');
  const values = priceFormValues();
  if (Object.values(values).some((value) => value == null)) return window.alert('Проверьте заполнение стоимости занятий');
  const changes = [
    { current: robotics, value: values.robotPackage },
    { current: programming, value: values.codePackage },
  ].filter((item) => normalizeMoney(item.current.packagePrice) !== item.value);
  const block = currentBlocks().price;
  if (!changes.length) {
    if (block) setStatus(block, 'settings-price-status', 'Изменений нет.');
    return;
  }

  savingPrice = true;
  if (block) {
    const button = block.querySelector('[data-settings-action="prices"] button');
    if (button) button.disabled = true;
  }
  try {
    for (const item of changes) {
      await api.create('price-versions', { directionId: item.current.directionId, packagePrice: item.value });
    }
    await loadPrices();
    if (block) {
      syncPriceInputs(block);
      setStatus(block, 'settings-price-status', priceLoaded ? 'Стоимость занятий сохранена.' : priceLoadError);
    }
    baseline = serverValues();
    recalculateDirty();
  } catch (error) {
    await loadPrices();
    if (block) {
      syncPriceInputs(block);
      setStatus(block, 'settings-price-status', 'Не удалось сохранить стоимость занятий. Текущие значения обновлены с сервера.');
    }
    window.alert(backendMessage(error, 'Не удалось сохранить стоимость занятий'));
  } finally {
    savingPrice = false;
    const button = block?.querySelector('[data-settings-action="prices"] button');
    if (button) button.disabled = !priceLoaded;
  }
}

async function saveSalaryRates() {
  if (savingSalary || !salaryLoaded) return;
  const values = salaryFormValues();
  if (Object.values(values).some((value) => value == null)) return window.alert('Проверьте заполнение ставок зарплаты');
  const changedKeys = Object.keys(salaryStateKeys).filter((key) => normalizeMoney(currentSalaryByKey.get(key)?.value) !== values[key]);
  const block = currentBlocks().salary;
  if (!changedKeys.length) {
    if (block) setStatus(block, 'settings-salary-status', 'Изменений нет.');
    return;
  }
  if (!window.confirm('Сохранить новые ставки зарплаты?\n\nИзменение создаст новую историческую версию.')) return;

  savingSalary = true;
  syncMetaState();
  const button = block?.querySelector('[data-settings-action="salary"] button');
  if (button) button.disabled = true;
  try {
    for (const key of changedKeys) {
      await api.create('salary-rate-versions', { key, value: values[key] });
    }
    const verified = await loadSalaryRates();
    if (!verified) throw new Error('Не удалось повторно загрузить ставки зарплаты');
    if (block) {
      syncSalaryInputs(block);
      setStatus(block, 'settings-salary-status', 'Ставки зарплаты сохранены. Новые ставки действуют с момента изменения; исторические занятия сохраняют прежние ставки.');
    }
    baseline = serverValues();
    recalculateDirty();
  } catch (error) {
    await loadSalaryRates();
    if (block) {
      syncSalaryInputs(block);
      setStatus(block, 'settings-salary-status', salaryLoaded
        ? 'Не удалось полностью сохранить ставки. Текущие значения обновлены с сервера.'
        : SALARY_LOAD_MESSAGE);
    }
    window.alert(backendMessage(error, 'Не удалось полностью сохранить ставки'));
  } finally {
    savingSalary = false;
    syncMetaState();
    const currentButton = block?.querySelector('[data-settings-action="salary"] button');
    if (currentButton) currentButton.disabled = !salaryLoaded;
  }
}

async function savePartnerAgreement() {
  if (savingPartner || !partnerLoaded || !currentPartnerAgreement) return;
  const values = partnerFormValues();
  if (Object.values(values).some((value) => value == null)) return window.alert('Проценты должны быть от 0 до 100');
  if (percentUnits(values.icubePercent) + percentUnits(values.partnerPercent) !== 100000n) {
    return window.alert('Доли iCube и партнёра в сумме должны составлять 100%.');
  }
  const changed = normalizePercent(currentPartnerAgreement.taxPercent) !== values.taxPercent
    || normalizePercent(currentPartnerAgreement.icubePercent) !== values.icubePercent
    || normalizePercent(currentPartnerAgreement.partnerPercent) !== values.partnerPercent;
  const block = currentBlocks().partner;
  if (!changed) {
    if (block) setStatus(block, 'settings-partner-status', 'Изменений нет.');
    return;
  }
  if (!window.confirm('Сохранить новые условия партнёрства?\n\nНалог: ' + displayNumber(values.taxPercent) + '%\nДоля iCube: ' + displayNumber(values.icubePercent) + '%\nДоля партнёра: ' + displayNumber(values.partnerPercent) + '%')) return;

  savingPartner = true;
  syncMetaState();
  const button = block?.querySelector('[data-settings-action="partner"] button');
  if (button) button.disabled = true;
  try {
    await api.create('partner-agreement-versions', {
      projectId: currentPartnerAgreement.projectId,
      taxPercent: values.taxPercent,
      icubePercent: values.icubePercent,
      partnerPercent: values.partnerPercent,
    });
    const verified = await loadPartnerAgreement();
    if (!verified) throw new Error('Не удалось повторно загрузить условия партнёрства');
    if (block) {
      syncPartnerInputs(block);
      setStatus(block, 'settings-partner-status', 'Условия партнёрства сохранены.');
    }
    baseline = serverValues();
    recalculateDirty();
  } catch (error) {
    await loadPartnerAgreement();
    if (block) {
      syncPartnerInputs(block);
      setStatus(block, 'settings-partner-status', partnerLoaded
        ? 'Не удалось сохранить условия партнёрства. Текущие значения обновлены с сервера.'
        : partnerLoadError || PARTNER_LOAD_MESSAGE);
    }
    window.alert(backendMessage(error, 'Не удалось сохранить условия партнёрства'));
  } finally {
    savingPartner = false;
    syncMetaState();
    const currentButton = block?.querySelector('[data-settings-action="partner"] button');
    if (currentButton) currentButton.disabled = !partnerLoaded || !partnerSettingsAvailable;
  }
}

window.savePriceSettings = savePrices;
window.saveSalarySettings = saveSalaryRates;
window.savePartnerSettings = savePartnerAgreement;

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

const app = document.querySelector('#app');
const observer = new MutationObserver(bindSettingsForm);
if (app) observer.observe(app, { childList: true, subtree: true });
bindSettingsForm();

async function initializeSettings() {
  await Promise.all([loadPrices(), loadSalaryRates(), loadPartnerAgreement()]);
  setCleanBaseline();
  legacy.render();
  queueMicrotask(bindSettingsForm);
  return {
    prices: priceLoaded,
    salary: salaryLoaded,
    partner: partnerLoaded,
  };
}

window.icubeFinancialSettingsReady = initializeSettings();
}
