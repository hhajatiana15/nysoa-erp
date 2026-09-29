const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const noop = () => {};
function element(key) {
  if (!elements.has(key)) elements.set(key, {
    innerHTML:'', value:'', dataset:{}, elements:{}, style:{}, classList:{add:noop,remove:noop},
    addEventListener:noop, querySelector(){return null},
  });
  return elements.get(key);
}
const notices = [];
const storage = {getItem(){return null},setItem:noop,removeItem:noop};
const ctx = vm.createContext({console,Date,Math,Intl,JSON,structuredClone,
  localStorage:storage,sessionStorage:storage,setTimeout:noop,clearTimeout:noop,setInterval:noop,
  navigator:{onLine:false,userAgent:'encaissement-test'},window:{addEventListener:noop},
  document:{addEventListener:noop,querySelector:element,getElementById:element,querySelectorAll(){return []}},
  FormData:class {constructor(form){this.fields=form.fields}get(name){return this.fields[name]??null}},
  alert(message){notices.push(message)},confirm(){return false},
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8').replace(/\binitFirebaseCloud\(\);/,''),ctx);
const run = code => vm.runInContext(code,ctx);
run(`user={role:'ADMIN',username:'admin'};
db.projects=[{id:'P',chantier:'FACE LES MARMAILLES',client:'Mr Jalanesh',budget:0,budgetSource:'devis'}];
db.quotes=[];db.clientReceipts=[];db.modules={clients:[],invoices:[]};
currentProjectContext=()=> 'P';`);
const form = element('#fReceipt');
const liveForm = element('fReceipt');
liveForm.elements={project:{value:'P'},client:{value:'Mr Jalanesh'},amount:{value:'10525000'},
  directBudget:{value:'20000000'}};
run(`clientReceiptForm()`);
assert.match(element('#content').innerHTML,/Budget direct du chantier/);
assert.match(element('#content').innerHTML,/Référence du reçu/);
assert.doesNotMatch(element('#content').innerHTML,/name="reference"[^>]+required/);
const draft = element('#content').innerHTML.match(/data-draft-id="([^"]+)"/)[1];
liveForm.dataset.draftId=draft;
form.dataset.draftId=draft;
form.fields={date:'2026-09-29',project:'P',invoiceId:'',client:'Mr Jalanesh',amount:'10525000',
  directBudget:'20000000',paymentMode:'Espèces',reference:'',note:''};
form.onsubmit({preventDefault:noop,target:form});
assert.equal(run(`db.projects[0].budget`),20000000);
assert.equal(run(`db.projects[0].budgetSource`),'manuel');
assert.equal(run(`db.clientReceipts[0].amount`),10525000);
assert.equal(run(`clientPaymentRows('P')[0].remaining`),9475000);
assert.equal(run(`clientPaymentRows('P')[0].percent`),52.625);
assert.match(run(`db.clientReceipts[0].reference`),/^REC-\d{8}-/);
assert.equal(run(`db.modules.invoices.length`),1);
assert.equal(run(`db.modules.invoices[0].trancheAmount`),10525000);
assert.equal(run(`db.clientReceipts[0].invoiceId===db.modules.invoices[0].id`),true);
assert.equal(run(`invoiceReceiptPaid(db.modules.invoices[0].id)`),10525000);
assert.equal(run(`invoicePaidForProject('P')`),10525000);
assert.equal(notices.length,0);
// A second advance cannot exceed the remaining contract balance.
run(`clientReceiptForm()`);
const nextDraft=element('#content').innerHTML.match(/data-draft-id="([^"]+)"/)[1];
form.dataset.draftId=nextDraft;
form.fields={date:'2026-09-29',project:'P',invoiceId:'',client:'Mr Jalanesh',amount:'9475001',
  directBudget:'',paymentMode:'Espèces',reference:'',note:''};
form.onsubmit({preventDefault:noop,target:form});
assert.equal(run(`db.clientReceipts.length`),1);
assert.match(notices.at(-1),/dépasse le montant du contrat/);
// An invoice created from a direct budget creates exactly one linked payment.
run(`db.projects.push({id:'P2',chantier:'HOMEOPHARMA',name:'Finition',client:'Mme Aina',budget:10000000,budgetSource:'manuel'});`);
run(`invoiceForm('','P2')`);
const invoiceForm = element('#fInvoice');
invoiceForm.fields={recordId:'INV-test-direct',invoiceNo:'FAC-2026-1001',date:'2026-09-29',project:'P2',quoteId:'',
  client:'Mme Aina',billingClientName:'Mme Aina',invoiceDesignation:'Acompte travaux de finition',
  quoteAmount:'10000000',invoiceType:'Tranche',trancheAmount:'3000000',paymentMode:'Virement',note:''};
invoiceForm.onsubmit({preventDefault:noop,target:invoiceForm});
assert.equal(run(`invoiceRows().filter(i=>i.project==='P2').length`),1);
assert.equal(run(`receiptRows().filter(r=>r.project==='P2').length`),1);
assert.equal(run(`clientPaymentRows('P2')[0].remaining`),7000000);
assert.equal(run(`invoiceReceiptPaid('INV-test-direct')`),3000000);
assert.equal(notices.length,1);
console.log('PASS: encaissement direct → facture, facture directe → encaissement, aucun double compte, reste à payer.');
