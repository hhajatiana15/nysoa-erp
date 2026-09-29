const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const pdf=fs.readFileSync(__dirname+'/quote-pdf.js','utf8');
const start=app.indexOf('async function quoteCreateProject(){');
const end=app.indexOf('function ensureClientFromName(',start);
assert(start>0&&end>start);
const projects=[];
const quote={clientId:'C1',client:'Mme Lala',object:'Construction maison',project:''};
const input={value:'  VILLA   ANTSIRABE  ',closest:()=>({querySelector:()=>({disabled:false})})};
let rendered=0,saved=0,synced=0,notice='';
const ctx=vm.createContext({
 user:{role:'ADMIN',username:'admin'},activeQuote:quote,db:{projects},document:{getElementById:id=>id==='quoteNewProjectName'?input:null},
 syncQuoteEditorFields(){},quoteClientCatalog:()=>[{id:'C1',name:'Mme Lala'}],clientNameFromRecord:c=>c.name,
 projectChantierName:p=>p.chantier,pushHistory(p){p.history.push('Création')},audit(){},save(){saved++},
 async cloudUpsert(collection,p){assert.equal(collection,'projects');assert.equal(p.clientId,'C1');synced++;return true},
 renderQuoteEditor(){rendered++},alert(s){notice=s},console,Date,Math
});
vm.runInContext(app.slice(start,end),ctx);
(async()=>{
 await vm.runInContext('quoteCreateProject()',ctx);
 assert.equal(projects.length,1);assert.equal(projects[0].chantier,'VILLA ANTSIRABE');
 assert.equal(projects[0].client,'Mme Lala');assert.equal(projects[0].budgetSource,'devis');assert.equal(projects[0].budget,0);
 assert.equal(quote.project,projects[0].id);assert.equal(saved,1);assert.equal(synced,1);assert.equal(rendered,1);
 await vm.runInContext('quoteCreateProject()',ctx);
 assert.equal(projects.length,1);assert.match(notice,/existe déjà/);
 assert(!/<label>Validité/.test(app));assert(!pdf.includes("['VALIDITÉ'"));
 assert(html.includes('app.js?v=4.9.8-chantier-devis')&&html.includes('quote-pdf.js?v=4.9.8-sans-validite'));
 console.log('PASS: nouveau chantier lié au client et au devis, liste mise à jour, doublon refusé, validité absente du devis et PDF.');
})().catch(e=>{console.error(e);process.exit(1)});
