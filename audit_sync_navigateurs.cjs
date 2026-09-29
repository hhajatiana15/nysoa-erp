const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8').replace(/\binitFirebaseCloud\(\);/,'');
const noop=()=>{};
const shared=new Map(),listeners=new Map();let failWrites=false;
function publish(collection){for(const fn of listeners.get(collection)||[]){const rows=shared.get(collection)||new Map();fn({docs:[...rows].map(([id,value])=>({id,data:()=>structuredClone(value)})),docChanges:()=>[],metadata:{fromCache:false}});}}
const firestore={collection(name){return {onSnapshot(fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);publish(name);return()=>listeners.get(name).delete(fn)},doc(id){return {async set(payload){if(failWrites)throw Error('permission-denied');if(!shared.has(name))shared.set(name,new Map());shared.get(name).set(id,structuredClone(payload));publish(name)}}}}}};
function browser(){const storage=new Map(),elements=new Map(),notices=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',className:'',innerHTML:'',classList:{add:noop,remove:noop},style:{},dataset:{},addEventListener:noop,querySelector:()=>null});return elements.get(id)};
 const navigator={onLine:true,userAgent:'test'};
 const ctx=vm.createContext({console:{...console,warn:noop},Date,Math,Intl,JSON,structuredClone,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},navigator,window:{addEventListener:noop},document:{addEventListener:noop,querySelector:el,getElementById:el,querySelectorAll:()=>[]},setTimeout:noop,clearTimeout:noop,setInterval:noop,clearInterval:noop,alert:s=>notices.push(s),confirm:()=>true});
 vm.runInContext(source,ctx);const run=s=>vm.runInContext(s,ctx);
 run(`user={uid:'ADMIN-1',role:'ADMIN',username:'admin'};cloudReady=true;fbStore=globalThis.__fakeStore;logUserActivity=()=>{};loadCloudPendingWrites();`);
 return {ctx,run,storage,elements,notices,navigator,el};
}
// Create a fresh context with its fake store injected before assigning fbStore.
function make(){const b=browser();b.ctx.__fakeStore=firestore;b.run('fbStore=globalThis.__fakeStore;startExtendedRealtimeListeners()');return b}
(async()=>{
 const opera=make(),chrome=make();
 opera.run(`db.quotes.push({id:'DEV-1',project:'P',client:'Mme Aina',status:'Accepté',sections:[{title:'LOT',items:[{qty:1,pu:5000000}]}],updatedAt:new Date().toISOString()});saveLocalOnly()`);
 await opera.run(`cloudWriteGeneric('quotes',db.quotes[0],'Devis enregistré')`);
 assert.equal(chrome.run(`db.quotes.find(x=>x.id==='DEV-1')?.client`),'Mme Aina');
 assert.equal(opera.run(`Object.keys(cloudPendingWrites).length`),0);
 assert.equal(chrome.el('cloudStatus').textContent,'Synchronisé');
 opera.navigator.onLine=false;
 opera.run(`db.clientReceipts.push({id:'REC-1',project:'P',client:'Mme Aina',amount:1000000,status:'Validé',updatedAt:new Date().toISOString()});saveLocalOnly()`);
 await opera.run(`cloudWriteGeneric('clientReceipts',db.clientReceipts[0],'Paiement')`);
 assert.equal(chrome.run(`db.clientReceipts.length`),0);
 assert.equal(opera.run(`Object.keys(cloudPendingWrites).length`),1);
 opera.navigator.onLine=true;
 await opera.run(`cloudAutoSyncAll('reconnexion')`);
 assert.equal(chrome.run(`db.clientReceipts.find(x=>x.id==='REC-1')?.amount`),1000000);
 assert.equal(opera.run(`Object.keys(cloudPendingWrites).length`),0);
 failWrites=true;
 opera.run(`db.quotes[0].object='Travaux';db.quotes[0].updatedAt=new Date(Date.now()+1000).toISOString();saveLocalOnly()`);
 await opera.run(`cloudWriteGeneric('quotes',db.quotes[0],'Modification')`);
 assert.equal(opera.run(`Object.keys(cloudPendingWrites).length`),1);
 assert.match(opera.el('cloudStatus').textContent,/Erreur envoi/);
 failWrites=false;
 await opera.run(`cloudAutoSyncAll('retry')`);
 assert.equal(chrome.run(`db.quotes.find(x=>x.id==='DEV-1')?.object`),'Travaux');
 assert.equal(opera.run(`Object.keys(cloudPendingWrites).length`),0);
 // Older local-only records are detected and uploaded only after Admin confirms.
 opera.run(`db.modules.clients=db.modules.clients||[];db.modules.clients.push({id:'CLIENT-OLD',name:'Mme Aina',createdAt:'2026-08-01T00:00:00.000Z'});saveLocalOnly()`);
 opera.run(`cloudStopListeners();startExtendedRealtimeListeners()`);
 assert.equal(opera.run(`cloudMissingLocal.has('clients::CLIENT-OLD')`),true);
 await opera.run(`cloudSyncNow()`);
 assert.equal(chrome.run(`db.modules.clients.find(x=>x.id==='CLIENT-OLD')?.name`),'Mme Aina');
 opera.navigator.onLine=false;
 opera.run(`db.quotes[0].object='Version Opera';db.quotes[0].updatedAt=new Date(Date.now()+2000).toISOString();saveLocalOnly()`);
 await opera.run(`cloudWriteGeneric('quotes',db.quotes[0],'Modification hors ligne')`);
 chrome.run(`db.quotes[0].object='Version Chrome';db.quotes[0].updatedAt=new Date(Date.now()+3000).toISOString();saveLocalOnly()`);
 await chrome.run(`cloudWriteGeneric('quotes',db.quotes[0],'Modification concurrente')`);
 opera.navigator.onLine=true;
 await opera.run(`cloudAutoSyncAll('conflit')`);
 assert.equal(opera.run(`db.quotes[0].__syncConflict`),true);
 assert.equal(chrome.run(`db.quotes[0].object`),'Version Chrome');
 assert.equal(opera.run(`Object.keys(cloudPendingWrites).length`),1);
 console.log('PASS: Opera → Chrome, hors ligne puis reconnexion, erreur conservée, conflit sans écrasement, anciennes données importées avec accord Admin.');
})().catch(e=>{console.error(e);process.exitCode=1});
