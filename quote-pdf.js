// Client quote as a real, self-contained PDF. The PDF viewer prints the file,
// rather than the ERP web page, so browser-generated web headers are absent.
function quotePdfText(value){
 return String(value??'').replace(/[\u2018\u2019\u02bc]/g,"'").replace(/[\u201c\u201d]/g,'"')
  .replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...').replace(/[\u00a0\u202f]/g,' ')
  .replace(/œ/g,'oe').replace(/Œ/g,'OE')
  .replace(/[^\x20-\x7e\u00a1-\u00ff\n\r]/g,'?');
}
function quotePdfWrap(value,font,size,width){
 const lines=[];
 for(const paragraph of quotePdfText(value).split(/\r?\n/)){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   const next=line?line+' '+word:word;
   if(font.widthOfTextAtSize(next,size)<=width){line=next;continue;}
   if(line)lines.push(line);
   line='';let chunk='';
   for(const char of word){
    if(chunk&&font.widthOfTextAtSize(chunk+char,size)>width){lines.push(chunk);chunk='';}
    chunk+=char;
   }
   line=chunk;
  }
  lines.push(line);
 }
 return lines.length?lines:[''];
}
async function buildQuotePdf(quote,logoBytes){
 if(!globalThis.PDFLib)throw Error('Le générateur PDF local est indisponible. Rechargez la page et réessayez.');
 const {PDFDocument,StandardFonts,rgb}=PDFLib;
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setTitle(quotePdfText(`Devis ${quote.id} - ${quote.client}`));doc.setAuthor('Entreprise NYSOA Construct');
 let logo=null;
 try{
  if(!logoBytes){const response=await fetch('assets/logo_nysoa_construct.png');if(response.ok)logoBytes=new Uint8Array(await response.arrayBuffer());}
  if(logoBytes)logo=await doc.embedPng(logoBytes);
 }catch(err){console.warn('Logo du devis PDF indisponible',err);}
 const w=841.89,h=595.28,L=42,R=800,navy=rgb(.09,.2,.31),blue=rgb(.04,.4,.72),gray=rgb(.37,.43,.49),pale=rgb(.93,.96,.99),line=rgb(.79,.84,.89),white=rgb(1,1,1);
 let page,y,pageNo=0;
 const txt=(v,x,yy,size=10,face=font,color=navy)=>page.drawText(quotePdfText(v),{x,y:yy,size,font:face,color});
 const rule=(yy,x=L,x2=R)=>page.drawLine({start:{x,y:yy},end:{x:x2,y:yy},thickness:.6,color:line});
 const para=(v,x,top,width,size=10,face=font,leading=14,color=navy)=>{
  const rows=quotePdfWrap(v,face,size,width);
  rows.forEach((s,i)=>txt(s,x,top-i*leading,size,face,color));return rows.length*leading;
 };
 const head=()=>{
  page=doc.addPage([w,h]);pageNo++;
  if(logo){const fit=logo.scaleToFit(99,59);page.drawImage(logo,{x:L,y:h-79,width:fit.width,height:fit.height});}
  txt('ENTREPRISE NYSOA CONSTRUCT',L+108,h-42,13,bold,blue);
  txt('Construction - Bâtiment - Génie Civil - Travaux Publics',L+108,h-57,8.5,font);
  txt('Lot 0708 K Ambohimena, Antsirabe | +261 34 99 498 49',L+108,h-70,8.5,font);
  txt('hhajatiana15@gmail.com',L+108,h-83,8.5,font);
  txt('DEVIS',R-92,h-42,24,bold,navy);
  txt(quote.id||'',R-146,h-62,10,bold,blue);
  txt('Date : '+(quote.date||''),R-146,h-78,9,font);
  rule(h-93);
  y=h-114;
 };
 const pageFooter=()=>{
  rule(34);txt(`Entreprise NYSOA Construct  |  Devis ${quote.id}  |  Page ${pageNo}`,L,22,8,font,gray);
 };
 const nextPage=()=>{pageFooter();head();};
 const room=height=>{if(y-height<48)nextPage();};
 const row=(cells,height,section=false)=>{
  room(height);
  page.drawRectangle({x:L,y:y-height,width:R-L,height,color:section?rgb(.91,.94,.76):white,borderWidth:.5,borderColor:line});
  const cols=[L,83,461,522,585,678,R];
  for(let j=1;j<cols.length-1;j++)page.drawLine({start:{x:cols[j],y},end:{x:cols[j],y:y-height},thickness:.45,color:line});
  cells.forEach((c,j)=>para(c,cols[j]+4,y-12,cols[j+1]-cols[j]-8,section?9:8.3,section?bold:font,11));
  y-=height;
 };
 const tableHeading=()=>{row(['N°','DÉSIGNATION','UNITÉ','QTÉ','PU (Ar)','TOTAL (Ar)'],24,true);};
 head();
 const meta=[['CLIENT',quote.client],['ADRESSE',quote.clientAddress],['TÉLÉPHONE',quote.clientPhone],['VALIDITÉ',quote.validUntil||'-']];
 meta.forEach(([label,value],i)=>{
  const x=L+i*190;
  txt(label,x,y,8,bold,gray);
  para(value||'-',x,y-15,181,10,bold,13);
 });
 y-=55;
 txt('CHANTIER',L,y,8,bold,gray);txt(projectLabel(quote.project),L+67,y,10,bold);
 y-=23;txt('OBJET DU DEVIS',L,y,8,bold,gray);
 y-=17;y-=para(quote.object||'-',L,y,R-L,11,bold,15)+13;
 tableHeading();
 let sectionNo=0;
 for(const section of quote.sections||[]){
  sectionNo++;
  const sectionText=quotePdfWrap(section.title||'',bold,9,367);
  if(y-(Math.max(24,sectionText.length*11+9))-24<48)nextPage();
  row([roman(sectionNo),section.title||'', '', '', '', ''],Math.max(24,sectionText.length*11+9),true);
  for(const item of section.items||[]){
   const designation=quotePdfWrap(item.designation||'',font,8.3,370);
   const amount=(+item.qty||0)*(+item.pu||0);
   const rowHeight=Math.max(24,designation.length*11+9);
   if(y-rowHeight<48){nextPage();tableHeading();}
   row([item.no||'',item.designation||'',item.unit||'',String(item.qty??''),money(item.pu||0),money(amount)],rowHeight);
  }
  const subtotal=(section.items||[]).reduce((n,i)=>n+(+i.qty||0)*(+i.pu||0),0);
  room(25);txt('Sous-total '+quotePdfText(section.title||''),L+6,y-16,9,bold);
  txt(money(subtotal),678,y-16,9,bold);rule(y-25);y-=25;
 }
 const f=quoteFinancials(quote),summary=[['DEVIS INITIAL (HT)',money(f.ht)],['RÉDUCTION NÉGOCIÉE',money(f.discount)],...(quote.vatEnabled?[[`TVA (${quote.vatRate}%)`,money(f.vat)]]:[]),['DEVIS FINAL ACCEPTÉ (TTC)',money(f.ttc)]];
 room(summary.length*23+105);
 y-=14;
 for(const [label,value] of summary){
  const last=label.startsWith('DEVIS FINAL');
  if(last)page.drawRectangle({x:470,y:y-18,width:R-470,height:24,color:navy});
  txt(label,478,y-11,last?10:9,last?bold:font,last?white:navy);
  const size=last?11:9;
  txt(value,R-8-bold.widthOfTextAtSize(quotePdfText(value),size),y-11,size,bold,last?white:navy);
  y-=23;
 }
 y-=17;
 y-=para(`Arrêté le présent devis à la somme de ${money(f.ttc)} (${numberToFrenchWords(f.ttc)} ARIARY).`,L,y,R-L,9,font,13)+11;
 room(46);
 txt('Le client',L+95,y-12,9,bold);txt('Le gérant',R-172,y-12,9,bold);
 y-=46;rule(y,L+42,L+310);rule(y,R-270,R-20);
 doc.getPages().forEach((p,i)=>{if(p!==page){/* already numbered on transition */}else pageFooter();});
 return doc.save();
}
function quotePdfFilename(quote){return ('Devis_'+String(quote.id||'NY SOA').replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf');}
