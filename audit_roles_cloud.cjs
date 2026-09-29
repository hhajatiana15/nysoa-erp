const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/app.js','utf8').replace(/\binitFirebaseCloud\(\);/,'');
const noop=()=>{};
const ctx=vm.createContext({console,Date,Math,Intl,JSON,structuredClone,
 navigator:{onLine:true,userAgent:'test'},window:{addEventListener:noop},
 document:{addEventListener:noop,getElementById:()=>({}),querySelector:()=>({}),querySelectorAll:()=>[]},
 localStorage:{getItem:()=>null,setItem:noop},sessionStorage:{getItem:()=>null,setItem:noop},
 setTimeout:noop,clearTimeout:noop,setInterval:noop,clearInterval:noop,alert:noop});
vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
const queries=[];
ctx.fakeStore={collection(name){const predicates=[];return {
 where(field,op,value){predicates.push([field,op,value]);return this},
 onSnapshot(ok){queries.push({name,predicates:[...predicates]});ok({metadata:{fromCache:false},docs:[],docChanges:()=>[]});return noop}
}}};
for(const role of ['ADMIN','GESTIONNAIRE','CONTROLE','TECHNICIEN']){
 queries.length=0;
 run(`user={uid:'uid-${role}',role:'${role}',username:'${role.toLowerCase()}'};cloudReady=true;fbStore=globalThis.fakeStore;cloudStopListeners();startExtendedRealtimeListeners()`);
 const names=queries.map(q=>q.name);
 assert.equal(names.length,new Set(names).size,`${role}: duplicate listener`);
 assert.equal(run('cloudSnapshotReady.size'),names.length);
 assert.equal(run('cloudReadableCollections().length'),names.length);
 assert(names.includes('projects')&&names.includes('dailyReports'));
 const report=queries.find(q=>q.name==='dailyReports');
 if(role==='ADMIN')assert.equal(report.predicates.length,0);
 else assert.deepEqual(report.predicates,[['ownerUid','==',`uid-${role}`]]);
 if(role!=='ADMIN'){
  assert(!names.includes('quotes')&&!names.includes('bank')&&!names.includes('accounting'));
  assert.deepEqual(queries.find(q=>q.name==='editRequests').predicates,[['requesterUid','==',`uid-${role}`]]);
 }
 if(role==='CONTROLE'||role==='TECHNICIEN'){
  assert(!names.includes('invoices')&&!names.includes('payroll')&&!names.includes('expenses'));
  assert(names.includes('reports')&&names.includes('siteControls'));
 }
 if(role==='GESTIONNAIRE')assert(names.includes('invoices')&&names.includes('clientReceipts'));
 assert.equal(run('cloudCanWrite("quotes")'),role==='ADMIN');
 assert.equal(run('cloudCanWrite("cashEntries")'),role==='ADMIN');
}
const rules=fs.readFileSync(__dirname+'/firestore.rules','utf8');
const match=[...rules.matchAll(/match \/([A-Za-z][A-Za-z0-9]*)\/\{/g)].map(m=>m[1]);
const all=Array.from(run('CLOUD_BUSINESS_COLLECTIONS'));
assert.deepEqual(all.filter(x=>!match.includes(x)),[], 'Every synced collection requires an explicit rules block');
assert.match(rules,/match \/\{document=\*\*\} \{ allow read, write: if false;/);
console.log('PASS: role-based listeners, owner-scoped queries, denied finance modules, and explicit Firestore paths.');
