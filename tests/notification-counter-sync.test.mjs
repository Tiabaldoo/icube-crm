import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {installDashboardUi} from '../src/frontend/dashboard-ui.mjs';
const source=await readFile(new URL('../src/frontend/push-client.mjs',import.meta.url),'utf8');
function fixture(role='director'){
 const calls=[],alerts=[],badges=[{},{},{}],roots=[];let failRead=false,renders=0;
 const server=[1,2,3].map(id=>({id:String(id),title:'Уведомление '+id,body:'Текст',readAt:null,destination:'home'}));
 const state={role,page:'dashboard',notifications:[],children:[],groups:[],projects:[],payments:[],lessons:[],teachers:[],sites:[]};
 const api={async request(path,options={}){
  calls.push({path,options});
  if(path.endsWith('/read-all')){if(failRead)throw Error('read failed');server.forEach(n=>n.readAt??='2026-10-20');return{read:3};}
  if(path.endsWith('/read')){if(failRead)throw Error('read failed');server.find(n=>n.id===path.split('/').at(-2)).readAt??='2026-10-20';return{read:true};}
  if(path==='/notifications'||path==='/parent/notifications')return structuredClone(server);
  throw Error('Unexpected request: '+path);
 }};
 const document={documentElement:{clientWidth:1200,clientHeight:900},body:{appendChild(root){roots.push(root);}},addEventListener(){},querySelectorAll(selector){return selector==='[data-notification-badge]'?badges:[];},
  createElement(){return{style:{removeProperty(){}},setAttribute(){},getBoundingClientRect(){return{width:320,height:200};},remove(){this.removed=true;},innerHTML:''};}};
 const host={icubeLegacy:{state,pageHead:()=>'',render(){renders++;}},addEventListener(){},matchMedia:()=>({matches:false}),innerWidth:1200,innerHeight:900,alert:m=>alerts.push(m),icubeOpenNotification:async()=>{}};
 const context=vm.createContext({window:host,document,URL,Date,console,ApiClient:class{request(...args){return api.request(...args);}},ApiError:Error,isPushPanelInteraction:()=>true});
 const plain=source.replace(/^import .*;\r?\n/gm,'').replace(/^globalThis\.ICUBE_FRONTEND_BUILD[^\n]*\n/m,'').replace(/^export /gm,'');
 vm.runInContext(plain,context);installDashboardUi({windowObject:host,api});
 return{host,state,calls,alerts,badges,roots,server,get renders(){return renders;},fail(){failRead=true;},anchor:{isConnected:true,getBoundingClientRect:()=>({right:1000,bottom:80,top:40})}};
}
test('desktop badge, dashboard, bell and history share latest server-loaded state after single/repeated/all read actions',async()=>{
 const f=fixture(),push=f.host.icubePush;await push.refreshInbox();assert.equal(push.unread(),3);
 // The main CRM reload replaces its array; the popup must not keep an obsolete private copy.
 f.state.notifications=structuredClone(f.server);await f.host.markDashboardNotificationRead(3);
 assert.equal(push.unread(),2);assert.ok(f.badges.every(b=>b.textContent==='2'&&!b.hidden));assert.doesNotMatch(f.host.dashboard(),/>Уведомление 3<\/b>/);
 await f.host.markDashboardNotificationRead(3);assert.equal(push.unread(),2);
 await push.togglePanel(f.anchor);assert.match(f.roots.at(-1).innerHTML,/Уведомление 1/);assert.doesNotMatch(f.roots.at(-1).innerHTML,/Уведомление 3/);
 await push.openNotification(1);assert.equal(push.unread(),1);assert.ok(f.badges.every(b=>b.textContent==='1'));assert.doesNotMatch(f.host.dashboard(),/>Уведомление 1<\/b>/);
 await push.togglePanel(f.anchor);await push.markAllRead();assert.equal(push.unread(),0);assert.ok(f.badges.every(b=>b.textContent==='0'&&b.hidden));assert.ok(f.state.notifications.every(n=>n.readAt));
 assert.doesNotMatch(f.host.dashboard(),/Важные уведомления/);await push.showHistory();assert.match(f.roots.at(-1).innerHTML,/Уведомление 3/);
 const before=f.calls.filter(c=>c.path.endsWith('/read')).length;await push.openNotification(1);assert.equal(f.calls.filter(c=>c.path.endsWith('/read')).length,before);assert.equal(push.unread(),0);
 assert.equal(f.alerts.length,0);assert.ok(f.renders>=4);assert.equal(f.state.notifications.length,3,'read actions retain history');
});
test('failed read does not alter notifications or decrement any counter',async()=>{
 const f=fixture(),push=f.host.icubePush;await push.refreshInbox();f.fail();
 await f.host.markDashboardNotificationRead(1);await push.openNotification(2);await push.markAllRead();
 assert.equal(push.unread(),3);assert.ok(f.state.notifications.every(n=>!n.readAt));assert.ok(f.badges.every(b=>b.textContent==='3'));assert.equal(f.alerts.length,3);
});
test('parent inbox keeps its existing endpoint and local state instead of adopting staff notifications',async()=>{
 const f=fixture('parent'),push=f.host.icubePush;f.state.notifications=[{id:'foreign',readAt:null}];await push.refreshInbox();assert.equal(push.unread(),3);
 await push.markAllRead();assert.equal(push.unread(),0);assert.equal(f.state.notifications[0].readAt,null);assert.equal(f.renders,0);
 assert.ok(f.calls.every(c=>c.path.startsWith('/parent/notifications')));
});

test('bell read updates the latest CRM list even when it is replaced while the existing request is pending',async()=>{
 const f=fixture(),push=f.host.icubePush;await push.refreshInbox();const original=f.state.notifications;
 const request=f.host.icubeLegacy.state.notifications[0];
 // request() is async, so openNotification yields before applying its successful result.
 const pending=push.openNotification(1);f.state.notifications=structuredClone(original);await pending;
 assert.ok(request.readAt);assert.ok(f.state.notifications[0].readAt);assert.equal(push.unread(),2);assert.ok(f.badges.every(b=>b.textContent==='2'));
});

test('bell read actions update badges without rerendering an open form or unrelated page',async()=>{
 const f=fixture(),push=f.host.icubePush;await push.refreshInbox();f.state.modal='unsaved payment';await push.markAllRead();assert.equal(f.renders,0);assert.equal(f.state.modal,'unsaved payment');assert.equal(push.unread(),0);
 f.state.modal=null;f.state.page='child';await push.openNotification(1);assert.equal(f.renders,0);assert.equal(f.state.page,'child');
});
