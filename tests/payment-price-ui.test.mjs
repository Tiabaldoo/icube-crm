import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
function fixture() {
  const controls = { '#pf-child': { value: '8' }, '#pf-enrollment': { value: '7' }, '#pf-date': { value: '2026-10-15' },
    '#pf-price': { value: '9999' }, '#pf-amount': { value: '6600' }, '#pf-calc': { innerHTML: '' } };
  const requests = [];
  const context = vm.createContext({ controls, legacy: { state: { payments: [{ id: 1, enrollmentId: 7, price: 825 }] } },
    paymentEnrollment: () => ({ currentPrice: '9999' }), element: (selector) => controls[selector], value: (selector) => controls[selector]?.value,
    html: String, api: { request(path) { return new Promise((resolve, reject) => requests.push({ path, resolve, reject })); } } });
  vm.runInContext('let paymentQuoteSequence=0;\n' + source.slice(source.indexOf('async function updatePaymentPrice'), source.indexOf('async function savePayment')), context);
  return { controls, requests, update: (id) => context.updatePaymentPrice(id) };
}
test('payment form resolves selected operation date and ignores stale responses', async () => {
  const f = fixture(); const first = f.update(null);
  assert.equal(f.controls['#pf-price'].value, '');
  f.controls['#pf-date'].value = '2026-09-15'; const second = f.update(null);
  assert.equal(f.requests[1].path, '/enrollments/7/payment-quote?paidOn=2026-09-15');
  f.requests[1].resolve({ currentPrice: '825.00' }); await second;
  f.requests[0].resolve({ currentPrice: '1100.00' }); await first;
  assert.equal(f.controls['#pf-price'].value, '825.00'); assert.match(f.controls['#pf-calc'].innerHTML, /8 занятия/);
});
test('existing payment keeps historical readonly price; unused direction move quotes target and restores original on return', async () => {
  const f = fixture(); await f.update(1);
  assert.equal(f.controls['#pf-price'].value, '825'); assert.equal(f.requests.length, 0);
  f.controls['#pf-enrollment'].value = '8'; const moved = f.update(1);
  f.requests[0].resolve({ currentPrice: '1500.00' }); await moved; assert.equal(f.controls['#pf-price'].value, '1500.00');
  f.controls['#pf-enrollment'].value = '7'; await f.update(1); assert.equal(f.controls['#pf-price'].value, '825');
  assert.match(source, /id="pf-price"[^>]*readonly/);
  assert.match(source, /id="pf-date"[^>]*onchange="icubeApi.updatePaymentPrice/);
});
test('missing historical tariff displays the server reason and never falls back to today’s price', async () => {
  const f = fixture(); const pending = f.update(null);
  f.requests[0].reject(new Error('Для направления не настроена цена занятия')); await pending;
  assert.equal(f.controls['#pf-price'].value, ''); assert.equal(f.controls['#pf-calc'].textContent, 'Для направления не настроена цена занятия');
});
