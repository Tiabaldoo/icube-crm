import { ApiClient, ApiError } from '../data/api-client.mjs';

const legacy = window.icubeLegacy;
const api = new ApiClient();
const state = legacy.state;
let currentByCode = new Map();

function fail(error) {
  window.alert(error instanceof ApiError ? error.message : 'Не удалось сохранить базовые цены направлений');
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

async function loadPrices({ render = true } = {}) {
  try {
    const items = await api.list('price-versions');
    applyPrices(items);
    if (render) legacy.render();
  } catch (error) { fail(error); }
}

function bindSettingsPrices() {
  if (state.page !== 'settings') return;
  const blocks = Array.from(document.querySelectorAll('.settings-block'));
  const priceBlock = blocks.find((block) => block.querySelector('h3')?.textContent?.trim() === 'Стоимость занятий');
  if (!priceBlock || priceBlock.dataset.apiPricesBound === 'true') return;

  const rows = Array.from(priceBlock.querySelectorAll('.setting-row'));
  const roboticsRow = rows.find((row) => row.querySelector('b')?.textContent?.trim() === 'Робототехника');
  const programmingRow = rows.find((row) => row.querySelector('b')?.textContent?.trim() === 'Программирование');
  const roboticsInput = roboticsRow?.querySelector('input');
  const programmingInput = programmingRow?.querySelector('input');
  if (!roboticsInput || !programmingInput) return;

  const robotics = findPrice('robotics', 'Робототехника');
  const programming = findPrice('programming', 'Программирование');
  roboticsInput.id = 'settings-robot-package';
  programmingInput.id = 'settings-code-package';
  roboticsInput.removeAttribute('onchange');
  programmingInput.removeAttribute('onchange');
  roboticsInput.value = robotics?.packagePrice ?? '';
  programmingInput.value = programming?.packagePrice ?? '';
  roboticsRow.querySelector('.muted.mini').textContent = 'Базовая цена абонемента за 4 занятия';
  programmingRow.querySelector('.muted.mini').textContent = 'Базовая цена абонемента за 4 занятия';

  const actions = document.createElement('div');
  actions.style.marginTop = '14px';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn primary';
  button.textContent = 'Сохранить базовые цены';
  button.addEventListener('click', savePrices);
  actions.appendChild(button);
  priceBlock.appendChild(actions);
  priceBlock.dataset.apiPricesBound = 'true';
}

async function savePrices() {
  const robotics = findPrice('robotics', 'Робототехника');
  const programming = findPrice('programming', 'Программирование');
  if (!robotics || !programming) return window.alert('Не найдены направления в серверном справочнике');
  const desired = [
    { current: robotics, packagePrice: document.querySelector('#settings-robot-package')?.value },
    { current: programming, packagePrice: document.querySelector('#settings-code-package')?.value },
  ];
  if (desired.some((item) => !String(item.packagePrice ?? '').trim())) return window.alert('Укажите обе базовые цены абонементов');

  try {
    for (const item of desired) {
      if (String(item.packagePrice).replace(',', '.') === String(item.current.packagePrice).replace(',', '.')) continue;
      await api.create('price-versions', { directionId: item.current.directionId, packagePrice: String(item.packagePrice).trim() });
    }
    await loadPrices({ render: true });
  } catch (error) { fail(error); }
}

const observer = new MutationObserver(bindSettingsPrices);
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
loadPrices({ render: true });
