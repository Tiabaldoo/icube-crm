import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createBudgetEntries } from '../backend/src/budget-entries.mjs';
import { createApiRouter } from '../backend/src/routes.mjs';

function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.function('NOW',{varargs:true},()=> '2026-10-21 12:00:00');
  db.exec(`CREATE TABLE director_budget_entries(id INTEGER PRIMARY KEY,entry_type TEXT NOT NULL CHECK(entry_type IN ('income','expense')),
    occurred_on TEXT NOT NULL,amount TEXT NOT NULL,purpose TEXT,created_by_user_id INTEGER NOT NULL,request_key TEXT UNIQUE NOT NULL,
    request_fingerprint TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT);
    CREATE TABLE payments(id INTEGER PRIMARY KEY,amount TEXT); INSERT INTO payments VALUES(1,'4500.00');
    CREATE TABLE balance_entries(id INTEGER PRIMARY KEY,amount_delta TEXT);INSERT INTO balance_entries VALUES(1,'4500.00');
    CREATE TABLE child_enrollments(id INTEGER PRIMARY KEY,balance_lessons TEXT); INSERT INTO child_enrollments VALUES(1,'4.00000000');`);
  const calls=[];
  async function query(raw,params={}) {
    calls.push(raw);const sql=raw.replace(/ FOR UPDATE/g,'').replace('ON DUPLICATE KEY UPDATE id=id','ON CONFLICT(request_key) DO UPDATE SET id=id');
    const bindings=Object.fromEntries(Object.entries(params).filter(([key])=>new RegExp(`:${key}\\b`).test(sql)));const stmt=db.prepare(sql);
    if(/^SELECT/.test(sql))return [stmt.all(bindings)];const r=stmt.run(bindings);return [{insertId:Number(r.lastInsertRowid),affectedRows:r.changes}];
  }
  let tail=Promise.resolve();const pool={query,async getConnection(){const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;return{query,async beginTransaction(){db.exec('BEGIN');},async commit(){db.exec('COMMIT');},async rollback(){db.exec('ROLLBACK');},release};}};
  const service=createBudgetEntries(pool);const director={roles:['director'],userId:'1',idempotencyKey:'budget-operation-1'};
  const period={from:'2026-09-10',to:'2026-10-20'};const body={type:'income',date:'2026-10-20',amount:'1234.56',purpose:'Прочий чистый доход'};
  const business=()=>JSON.stringify(['payments','balance_entries','child_enrollments'].map(name=>db.prepare(`SELECT * FROM ${name}`).all()));
  return {db,pool,calls,service,director,period,body,business};
}

test('manual income/expense CRUD persists exact kopecks, inclusive dates, optional purpose and soft deletion without changing child finances',async(t)=>{
  const f=fixture(t),before=f.business();const entry=await f.service.create(f.body,f.director);assert.equal(entry.amount,'1234.56');
  const expense=await f.service.create({type:'expense',date:'2026-09-10',amount:'200'}, {...f.director,idempotencyKey:'expense-1'});assert.equal(expense.purpose,'');assert.equal(expense.amount,'200.00');
  assert.equal((await f.service.list(f.period,f.director)).length,2);
  const updated=await f.service.update(entry.id,{type:'income',date:'2026-10-21',amount:'1500.01',purpose:' Исправлено '},f.director);assert.equal(updated.amount,'1500.01');assert.equal(updated.purpose,'Исправлено');
  assert.equal((await f.service.list(f.period,f.director)).length,1);
  await f.service.remove(expense.id,f.director);await f.service.remove(expense.id,f.director);assert.deepEqual(await f.service.list(f.period,f.director),[]);
  assert.notEqual(f.db.prepare('SELECT deleted_at FROM director_budget_entries WHERE id=?').get(Number(expense.id)).deleted_at,null);
  await assert.rejects(f.service.update(expense.id,f.body,f.director),{code:'NOT_FOUND'});assert.equal(f.business(),before);
  assert.ok(f.calls.filter(sql=>/^(INSERT|UPDATE)/.test(sql)).every(sql=>/^(INSERT INTO|UPDATE) director_budget_entries/.test(sql)));
});

test('parallel/retried creation saves one operation, conflicts are rejected and retries cannot resurrect deleted records',async(t)=>{
  const f=fixture(t);const [a,b]=await Promise.all([f.service.create(f.body,f.director),f.service.create(f.body,f.director)]);assert.equal(a.id,b.id);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM director_budget_entries').get().n,1);
  await assert.rejects(f.service.create({...f.body,amount:'1234.57'},f.director),{code:'IDEMPOTENCY_CONFLICT'});
  await f.service.remove(a.id,f.director);assert.equal((await f.service.create(f.body,f.director)).deleted,true);assert.equal((await f.service.list(f.period,f.director)).length,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM director_budget_entries').get().n,1);
});

test('manual budget validation rejects non-positive/inexact amounts, invalid dates/types and oversized descriptions before writes',async(t)=>{
  const f=fixture(t);
  for(const amount of ['0','-1','1.001','NaN','Infinity','1e3','100000000000.00'])await assert.rejects(f.service.create({...f.body,amount},f.director),{code:'VALIDATION_ERROR'});
  for(const change of [{type:'payment'},{date:'2026-02-30'},{purpose:'x'.repeat(1001)},{purpose:12}])await assert.rejects(f.service.create({...f.body,...change},f.director),{code:'VALIDATION_ERROR'});
  await assert.rejects(f.service.list({from:'2026-10-21',to:'2026-10-20'},f.director),{code:'VALIDATION_ERROR'});
  await assert.rejects(f.service.create(f.body,{...f.director,idempotencyKey:''}),{code:'IDEMPOTENCY_KEY_REQUIRED'});
  assert.equal(f.calls.length,0);
});

for(const role of ['partner','teacher','parent'])test(`${role} cannot read, create, edit or remove budget entries through service or API`,async(t)=>{
  const f=fixture(t),context={...f.director,roles:[role]};
  for(const action of [()=>f.service.list(f.period,context),()=>f.service.create(f.body,context),()=>f.service.update('1',f.body,context),()=>f.service.remove('1',context)])await assert.rejects(action(),{code:'FORBIDDEN'});
  const router=createApiRouter(f.pool,{budgetEntries:f.service,testAuth(req,_res,next){req.auth=context;next();}});
  for(const [method,url]of [['GET','/statistics/budget/entries'],['POST','/statistics/budget/entries'],['PATCH','/statistics/budget/entries/1'],['DELETE','/statistics/budget/entries/1']]) {
    const response=await new Promise((resolve,reject)=>router.handle({method,url,query:f.period,body:f.body,get:()=>context.idempotencyKey},{status(code){this.code=code;return this;},json(body){resolve({code:this.code,body});}},reject));
    assert.equal(response.code,403);
  }
  assert.equal(f.calls.length,0);
});

test('budget migration is isolated, has positive exact amounts, duplicate protection, creator and soft-delete period index',async()=>{
  const sql=await readFile(new URL('../database/migrations/027_director_budget_entries.sql',import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE director_budget_entries/);assert.match(sql,/amount DECIMAL\(13,2\) NOT NULL/);assert.match(sql,/CHECK \(amount > 0\)/);assert.match(sql,/UNIQUE KEY uq_director_budget_request/);
  assert.match(sql,/deleted_at,occurred_on,id/);assert.match(sql,/REFERENCES users\(id\)/);assert.doesNotMatch(sql,/ALTER TABLE|DROP TABLE|UPDATE payments|balance_entries|project_id/);
});

test('a stale director form cannot save or delete under another signed-in user',async(t)=>{
  const f=fixture(t);const router=createApiRouter(f.pool,{budgetEntries:f.service,testAuth(req,_res,next){req.auth={roles:['director'],userId:'2'};next();}});
  for(const [method,url]of [['POST','/statistics/budget/entries'],['PATCH','/statistics/budget/entries/1'],['DELETE','/statistics/budget/entries/1']]) {
    await assert.rejects(new Promise((resolve,reject)=>router.handle({method,url,query:f.period,body:f.body,get:header=>header==='X-Expected-Actor-Id'?'1':'budget-key'}, {status(code){this.code=code;return this;},json(body){resolve({code:this.code,body});}},reject)),{status:409,code:'ACTOR_CHANGED'});
  }
  assert.equal(f.calls.length,0);
});

test('director API creates, lists, updates and soft-deletes the persisted manual operation',async(t)=>{
  const f=fixture(t);const router=createApiRouter(f.pool,{budgetEntries:f.service,testAuth(req,_res,next){req.auth=f.director;next();}});
  const request=(method,url,body=f.body)=>new Promise((resolve,reject)=>router.handle({method,url,query:f.period,body,get:header=>header==='X-Expected-Actor-Id'?'1':f.director.idempotencyKey},
    {status(code){this.code=code;return this;},json(data){resolve({code:this.code,data:data.data});},end(){resolve({code:this.code});}},reject));
  const created=await request('POST','/statistics/budget/entries');assert.equal(created.code,201);assert.equal((await request('GET','/statistics/budget/entries')).data.length,1);
  const updated=await request('PATCH',`/statistics/budget/entries/${created.data.id}`,{...f.body,amount:'999.99'});assert.equal(updated.data.amount,'999.99');
  assert.equal((await request('DELETE',`/statistics/budget/entries/${created.data.id}`)).code,204);assert.deepEqual((await request('GET','/statistics/budget/entries')).data,[]);
});
