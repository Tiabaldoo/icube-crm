import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { financeFixture } from './helpers/finance-sql-fixture.mjs';

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

test('form and backend agree on known individual tariff and reject unknown history with string flags', async (t) => {
  const f = financeFixture(t, { price: '825.00', packageCount: 8, mode: 'attendance_share' });
  f.db.exec(`UPDATE child_enrollments SET individual_price='825.00' WHERE id=7;
    INSERT INTO price_versions VALUES(4,'enrollment',7,NULL,NULL,NULL,'825.00','2026-09-30',NULL);`);
  const form = fixture(); form.controls['#pf-date'].value = '2026-10-19';
  const known = form.update(null);
  form.requests[0].resolve(await f.payments.quote(7, '2026-10-19')); await known;
  assert.equal(form.controls['#pf-price'].value, '825.00');
  assert.match(form.controls['#pf-calc'].innerHTML, /8 занятия/);
  const saved = await f.pay(form.controls['#pf-amount'].value, { paidOn: form.controls['#pf-date'].value });
  assert.equal(saved.priceSnapshot, form.controls['#pf-price'].value); assert.equal(saved.lessonsCredit, '8.00000000');
  assert.equal(f.balance(), 8);

  f.db.exec('DELETE FROM price_versions WHERE id=4');
  form.controls['#pf-date'].value = '2026-09-15'; const unknown = form.update(null);
  await assert.rejects(f.payments.quote(7, '2026-09-15'), (error) => {
    assert.equal(error.code, 'PRICE_HISTORY_UNAVAILABLE'); form.requests[1].reject(error); return true;
  });
  await unknown;
  assert.equal(form.controls['#pf-price'].value, '');
  assert.match(form.controls['#pf-calc'].textContent, /отсутствует история индивидуальной цены/);
  await assert.rejects(f.pay('6600', { paidOn: '2026-09-15' }), { code: 'PRICE_HISTORY_UNAVAILABLE' });
  assert.equal(f.rows('payments').length, 1); assert.equal(f.balance(), 8);
});
import { advancedGroupFields, installAdvancedGroupUi } from '../src/frontend/advanced-groups.mjs';

function formControls(markup, controls) {
 for(const match of markup.matchAll(/<input\b([^>]+)>/g)){
  const id=match[1].match(/\bid="([^"]+)"/)?.[1];if(!id)continue;
  controls['#'+id]={value:match[1].match(/\bvalue="([^"]*)"/)?.[1]??'',checked:/\bchecked\b/.test(match[1]),addEventListener(){}};
 }
 for(const match of markup.matchAll(/<select\b([^>]+)>([\s\S]*?)<\/select>/g)){
  const id=match[1].match(/\bid="([^"]+)"/)?.[1];if(!id)continue;
  const control={set innerHTML(html){this.html=html;const options=[...html.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)];const option=options.find(o=>/\bselected\b/.test(o[1]))??options[0];this.value=option?.[1].match(/\bvalue="([^"]*)"/)?.[1]??option?.[2]??'';},get innerHTML(){return this.html;},addEventListener(){}};
  control.innerHTML=match[2];controls['#'+id]=control;
 }
}
function paymentFormFixture(create = async(_r,body)=>({childId:8,...body})){
 const controls={},calls=[],timers=[];const state={children:[{id:8,name:'Ребёнок',enrollments:[{id:7,direction:'Робототехника'},{id:8,direction:'Программирование'}]},{id:9,name:'Другой ребёнок',enrollments:[{id:9,direction:'Программирование'}]}],payments:[{id:46,childId:8,enrollmentId:7,amount:4500,price:1125,paidOn:'2026-10-15',methodCode:'cashless'}]};
 const context=vm.createContext({legacy:{state,render(){for(const key of Object.keys(controls))delete controls[key];formControls(state.modal??'',controls);controls['#pf-calc']={innerHTML:''};}},
  element:s=>controls[s],value:s=>controls[s]?.value??'',html:String,businessDate:()=> '2026-10-20',operationKey:()=> 'new-key',
  paymentEnrollment:(child,id)=>state.children.find(c=>c.id===Number(child))?.enrollments.find(e=>e.id===Number(id)),
  window:{alert:m=>{throw Error(m);}},setTimeout:fn=>timers.push(fn),reload:async()=>{},fail:e=>{throw e;},
  api:{async request(path){calls.push(path);return{currentPrice:path.includes('/7/')?'1125.00':'1025.00'};},async create(resource,body,key){calls.push({resource,body,key});return create(resource,body);},async update(resource,id,body){calls.push({resource,id,body});return{childId:8};}}});
 vm.runInContext('let paymentCreateKey=null,paymentSavePending=false,paymentQuoteSequence=0;\n'+source.slice(source.indexOf('function paymentForm('),source.indexOf('function deletePaymentPrompt(')),context);
 return{context,controls,state,calls,async flush(){while(timers.length)await timers.shift()();await new Promise(r=>setImmediate(r));}};
}
test('new payment stays empty across quotes, child/direction/group changes; manual amount is retained and edit starts with saved amount',async()=>{
 const f=paymentFormFixture();f.context.paymentForm(8,'Робототехника');assert.equal(f.controls['#pf-amount'].value,'');await f.flush();assert.equal(f.controls['#pf-amount'].value,'');
 f.controls['#pf-child'].value='9';f.context.refreshPaymentDirections();await f.flush();assert.equal(f.controls['#pf-amount'].value,'');
 f.controls['#pf-child'].value='8';f.context.refreshPaymentDirections(null,8);await f.flush();assert.equal(f.controls['#pf-amount'].value,'');
 f.controls['#pf-amount'].value='3375';f.controls['#pf-enrollment'].value='7';f.state.children[0].enrollments[0].groupId=44;await f.context.updatePaymentPrice();assert.equal(f.controls['#pf-amount'].value,'3375');
 f.context.paymentForm(8,'Робототехника',46);await f.flush();assert.equal(f.controls['#pf-amount'].value,'4500');assert.equal(f.controls['#pf-price'].value,'1125');
 f.context.paymentForm(8,'Программирование');await f.flush();assert.equal(f.controls['#pf-amount'].value,'','another new payment never copies the prior amount');
});
test('manually entered payment still reaches the existing server financial service and produces its normal DB state',async(t)=>{
 const db=financeFixture(t),f=paymentFormFixture((_r,body)=>db.pay(body.amount,{paidOn:body.paidOn,method:body.method}));
 f.context.paymentForm(8,'Робототехника');await f.flush();f.controls['#pf-amount'].value='4500';await f.context.savePayment();
 assert.equal(db.balance(),4);assert.equal(db.rows('payments').length,1);assert.equal(db.rows('balance_entries').length,1);assert.equal(db.rows('balance_lots')[0].remaining_lessons,'4.00000000');
 const request=f.calls.find(c=>c.resource==='payments');assert.equal(request.body.amount,'4500');assert.equal(request.key,'new-key');assert.equal(request.body.priceSnapshot,undefined);
});
function groupPriceFixture(group={price:1125,packageLessonCount:4,isIndividual:false}){
 const controls={},state={role:'director',groups:[{id:10,...group}],modal:null};const unitWrapper={hidden:false},packageWrapper={hidden:false,label:{},querySelector(){return this.label;}};
 const document={querySelector:s=>controls[s],querySelectorAll:()=>[]};
 const host={groupForm(){state.modal='<div class="modal-actions"></div>';for(const k of Object.keys(controls))delete controls[k];controls['#gf-price']={value:group.price==null?'':String(group.price),closest:()=>unitWrapper,addEventListener(){}};controls['#gf-dir']={value:group.isMixed?'Смешанная':'Робототехника',addEventListener(){}};controls['.modal-actions']={insertAdjacentHTML(_p,html){formControls(html,controls);controls['[data-group-package-price]']=packageWrapper;controls['#gf-unit-hint']={};}};},group(){return'';}};
 installAdvancedGroupUi({state},host,document);host.groupForm(10);return{controls,host,state,unitWrapper,packageWrapper};
}
for(const [amount,unit] of [['4500','1125.00'],['4100','1025.00'],['2900','725.00'],['5000','1250.00']])test(`ordinary group package ${amount} maps to ${unit} through existing fields and payload`,()=>{
 const f=groupPriceFixture();assert.equal(f.controls['#gf-package-price'].value,'4500.00');assert.equal(f.unitWrapper.hidden,true);
 assert.ok(f.state.modal.indexOf('id="gf-package-price"')<f.state.modal.indexOf('<details'));assert.match(f.state.modal,/Стоимость абонемента за 4 занятия/);
 assert.equal(f.controls['#gf-price'].value,'1125');assert.equal(f.host.icubeAdvancedGroups.payload().packagePrice,undefined,'opening/saving unchanged retains the stored unit tariff');
 f.controls['#gf-package-price'].value=amount;f.host.icubeAdvancedGroups.refresh(true);assert.equal(f.controls['#gf-price'].value,unit);assert.match(f.controls['#gf-unit-hint'].textContent,new RegExp(unit+' ₽'));
 const dto=f.host.icubeAdvancedGroups.payload();assert.equal(dto.packagePrice,amount);assert.equal(dto.packageLessonCount,4);assert.equal(dto.isIndividual,false);
});
test('individual group keeps its eight-lesson package, and mixed tariffs retain their existing separate inputs',()=>{
 const f=groupPriceFixture({price:825,packageLessonCount:8,isIndividual:true,calculationMode:'attendance_share'});
 assert.equal(f.controls['#gf-package-price'].value,'6600.00');assert.equal(f.unitWrapper.hidden,false);assert.ok(f.state.modal.indexOf('id="gf-package-price"')>f.state.modal.indexOf('<details'));
 f.controls['#gf-package-price'].value='7200';f.host.icubeAdvancedGroups.refresh(true);assert.equal(f.controls['#gf-price'].value,'900.00');assert.equal(f.host.icubeAdvancedGroups.payload().packagePrice,'7200');assert.equal(f.host.icubeAdvancedGroups.payload().packageLessonCount,8);
 const mixed=groupPriceFixture({price:null,isMixed:true});assert.equal(mixed.packageWrapper.hidden,true);assert.equal(mixed.controls['#gf-package-price'].disabled,true);assert.equal(mixed.unitWrapper.hidden,true);
 assert.equal((advancedGroupFields().match(/id="gf-package-price"/g)||[]).length,1);
});

test('ordinary inherited price remains empty and clearing a package restores existing default-price semantics',()=>{
 const inherited=groupPriceFixture({price:null,packageLessonCount:4});assert.equal(inherited.controls['#gf-package-price'].value,'');assert.equal(inherited.host.icubeAdvancedGroups.payload().packagePrice,undefined);
 const f=groupPriceFixture();f.controls['#gf-package-price'].value='';f.host.icubeAdvancedGroups.refresh(true);assert.equal(f.controls['#gf-price'].value,'');assert.equal(f.host.icubeAdvancedGroups.payload().packagePrice,null);
});
