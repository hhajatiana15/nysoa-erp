const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/app.js','utf8');
const start=code.indexOf('const unsavedModuleViews=new Map();');
const end=code.indexOf('\nfunction printCurrentView()',start);
const html=fs.readFileSync(__dirname+'/index.html','utf8');
assert(start>0&&end>start&&html.includes('id="erpBackBtn"')&&html.includes('id="erpForwardBtn"'));
const back={disabled:true,title:''},forward={disabled:true,title:''};
const content={nodes:[],querySelector:()=>content.nodes.some(n=>n.editing)?{}:null,get firstChild(){return this.nodes[0]},replaceChildren(f){this.nodes=f.nodes.splice(0)}};
const document={activeElement:{closest(){return null}},getElementById:id=>({content,erpBackBtn:back,erpForwardBtn:forward})[id]||null,
 querySelectorAll:()=>[{dataset:{page:'quotes'},classList:{toggle(){}}}],createDocumentFragment:()=>({nodes:[],appendChild(n){content.nodes.shift();this.nodes.push(n)}})};
const ctx=vm.createContext({document,user:{uid:'u1'},cloudCurrentPage:'dashboard',renderGlobalProjectSelector(){},syncQuoteEditorFields(){},
 originalGo(page){ctx.cloudCurrentPage=page;content.nodes=[{page,editing:false}]}});
vm.runInContext(code.slice(start,end),ctx);
vm.runInContext("go('quotes')",ctx);
const quoteNode={page:'quotes',editing:true,value:'objet conservé'};content.nodes=[quoteNode];
vm.runInContext("go('invoices');go('clientReceipts')",ctx);
assert.equal(back.disabled,false);assert.equal(forward.disabled,true);
vm.runInContext('erpHistoryBack()',ctx);assert.equal(ctx.cloudCurrentPage,'invoices');
vm.runInContext('erpHistoryBack()',ctx);assert.equal(ctx.cloudCurrentPage,'quotes');assert.equal(content.nodes[0],quoteNode);
assert.equal(back.disabled,true);assert.equal(forward.disabled,false);
vm.runInContext('erpHistoryForward()',ctx);assert.equal(ctx.cloudCurrentPage,'invoices');
vm.runInContext("go('projects')",ctx);assert.equal(forward.disabled,true);
vm.runInContext('erpHistoryForward()',ctx);assert.equal(ctx.cloudCurrentPage,'projects');
console.log('PASS: Précédent/Suivant, brouillon DEVIS conservé, branche suivante invalidée après nouvelle navigation.');
