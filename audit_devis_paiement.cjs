const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const noop=()=>{},storage=new Map(),element={addEventListener:noop,classList:{add:noop,remove:noop},dataset:{},style:{},querySelector:()=>null};
const ctx=vm.createContext({console,Date,Math,Intl,JSON,structuredClone,
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 setTimeout:noop,clearTimeout:noop,setInterval:noop,navigator:{onLine:false},window:{addEventListener:noop},
 document:{addEventListener:noop,querySelector:()=>element,getElementById:()=>element,querySelectorAll:()=>[]},alert:noop,confirm:()=>false});
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8').replace(/\binitFirebaseCloud\(\);/,''),ctx);
const run=s=>vm.runInContext(s,ctx);
run(`user={role:'ADMIN',username:'admin'};db.projects=[{id:'P',chantier:'HOMEOPHARMA',client:'Mme Aina',budget:12000000,budgetSource:'manuel'}];db.quotes=[{id:'Q',date:'2026-09-29',project:'P',client:'Mme Aina',status:'Accepté',sections:[{title:'LOT',items:[{qty:1,pu:10000000}]}],discount:0,vatEnabled:false}];db.clientReceipts=[];db.modules={invoices:[]};cloudSyncRecord=()=>{};`);
run(`syncProjectQuoteBudget('P')`);
assert.equal(run(`db.projects[0].budgetSource`),'devis');
assert.equal(run(`db.projects[0].budget`),10000000);
assert.equal(run(`quotePaymentPosition(db.quotes[0]).received`),0);
assert.equal(run(`quotePaymentPosition(db.quotes[0]).contract`),10000000);
assert.match(run(`quotePaymentNotice(db.quotes[0])`),/Aucun paiement validé/);
run(`db.clientReceipts.push({id:'R',project:'P',client:'Mme Aina',amount:2500000,status:'En attente',date:'2026-09-29'})`);
assert.equal(run(`quotePaymentPosition(db.quotes[0]).received`),0);
assert.equal(run(`quotePaymentPosition(db.quotes[0]).pending`),2500000);
run(`db.clientReceipts[0].status='Validé'`);
assert.equal(run(`quotePaymentPosition(db.quotes[0]).received`),2500000);
assert.equal(run(`clientPaymentRows('P')[0].remaining`),7500000);
assert.match(run(`quotePaymentNotice(db.quotes[0])`),/Paiement enregistré/);
assert.equal(run(`db.modules.invoices.length`),0);
console.log('PASS: devis accepté → budget, paiement en attente séparé, encaissement validé → reste à payer, aucune facture automatique.');
