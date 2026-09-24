// Dedicated attendance page. SCANNER users do not receive an ERP session.
const firebaseConfig={
 apiKey:"AIzaSyAZMfBTLbFlJsuzhQR0tEnT4dpfaK7m_SA",
 authDomain:"erp-nysoa.firebaseapp.com",projectId:"erp-nysoa",
 storageBucket:"erp-nysoa.firebasestorage.app",messagingSenderId:"273810293592",
 appId:"1:273810293592:web:15895e9279f2f331ce9b2d"
};
const $=id=>document.getElementById(id);
let auth,store,profile=null,reader=null,busy=false,lastRead="",lastReadAt=0;
function status(message,error=false){$("status").textContent=message;$("status").className="status"+(error?" error":"");}
function result(message,error=false){$("result").textContent=message;$("result").className="result"+(error?" error":" ok");}
function dateKey(now){return now.toISOString().slice(0,10);} // Matches the ERP's attendance date convention.
function mondayOf(date){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
function employeeName(e){return e.name||e.values?.[0]||"";}
function employeeRole(e){return e.jobTitle||e.values?.[2]||"";}
function projectName(p){return p.chantier||p.location||p.siteName||p.name||p.id;}
function errorText(e){
 if(e?.code==="permission-denied")return "Accès Firebase refusé. Vérifiez les droits du compte scanner.";
 if(e?.code==="auth/wrong-password"||e?.code==="auth/invalid-credential")return "E-mail ou mot de passe incorrect.";
 if(!navigator.onLine)return "Connexion Internet nécessaire pour enregistrer le scan.";
 return e?.message||"Une erreur est survenue.";
}
async function stopCamera(){if(reader){const old=reader;reader=null;try{await old.stop();await old.clear();}catch(e){}}$("start").hidden=false;$("stop").hidden=true;}
async function loadProjects(){
 const snap=await store.collection("projects").get();const select=$("project");select.replaceChildren(new Option("Choisir un chantier",""));
 const allowed=Array.isArray(profile.assignedProjects)?profile.assignedProjects.map(String):[];
 snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>!p.deleted&&(!allowed.length||allowed.includes(String(p.id))))
  .sort((a,b)=>projectName(a).localeCompare(projectName(b))).forEach(p=>select.add(new Option(projectName(p),p.id)));
 if(select.options.length===2)select.selectedIndex=1;
 if(select.options.length===1)status("Aucun chantier autorisé pour ce compte.",true);
 else status("Choisissez le chantier puis ouvrez la caméra.");
}
async function startCamera(){
 if(!$("project").value)return status("Choisissez d’abord le chantier.",true);
 if(typeof Html5Qrcode==="undefined")return status("Le lecteur QR n’a pas pu se charger. Vérifiez la connexion.",true);
 try{reader=new Html5Qrcode("reader");await reader.start({facingMode:"environment"},{fps:10,qrbox:{width:230,height:230}},processScan,()=>{});
  $("start").hidden=true;$("stop").hidden=false;status("Caméra ouverte. Présentez un badge QR.");
 }catch(e){reader=null;status("Caméra indisponible. Autorisez l’accès à la caméra et réessayez. "+errorText(e),true);}
}
async function processScan(raw){
 if(busy||raw===lastRead&&Date.now()-lastReadAt<2500)return;
 lastRead=raw;lastReadAt=Date.now();
 busy=true;$("project").disabled=true;
 try{
  const parts=String(raw||"").trim().split("|");
  if(parts.length!==3||parts[0]!=="NYSOA-EMP"||!parts[1]||!parts[2])throw new Error("Badge QR invalide.");
  if(!navigator.onLine)throw new Error("Connexion Internet nécessaire pour enregistrer le scan.");
  const project=$("project").value;
  if(!project)throw new Error("Choisissez le chantier.");
  const employeeSnap=await store.collection("employees").doc(parts[1]).get();
  if(!employeeSnap.exists)throw new Error("Badge inconnu.");
  const e=employeeSnap.data();
  if(e.deleted||e.workflow==="Inactif"||e.active===false||!e.qrToken||e.qrToken!==parts[2])throw new Error("Badge expiré ou employé inactif.");
  const now=new Date(),date=dateKey(now),weekStart=mondayOf(date);
  // Existing ERP scans may predate this scanner. Seed the guard from today's cloud history.
  const [previous,weekly]=await Promise.all([
   store.collection("attendanceQR").where("date","==",date).get(),
   store.collection("attendanceWeekly").where("weekStart","==",weekStart).get()
  ]);
  const latest=previous.docs.map(d=>d.data()).filter(r=>!r.deleted&&String(r.employeeId)===parts[1]&&String(r.project)===project)
   .sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)))[0];
  const master=weekly.docs.find(d=>!d.data().deleted&&!d.data().project);
  const weeklyRef=master?.ref||store.collection("attendanceWeekly").doc("ATTW-SCAN-"+weekStart);
  const guardRef=store.collection("attendanceScanState").doc(encodeURIComponent([date,project,parts[1]].join("|")));
  const recordId="QRATT-"+Date.now()+"-"+Math.random().toString(36).slice(2,9);
  const outcome=await store.runTransaction(async tx=>{
   // All reads precede writes, and the guard serializes simultaneous scans of one badge.
   const [guardDoc,weekDoc]=await Promise.all([tx.get(guardRef),tx.get(weeklyRef)]);
   const last=guardDoc.exists?guardDoc.data():latest;
   if(last?.timestamp&&now.getTime()-Date.parse(last.timestamp)<30000)return {duplicate:true};
   const direction=last?.direction==="Entrée"?"Sortie":"Entrée";
   const rec={id:recordId,employeeId:parts[1],employeeName:employeeName(e),jobTitle:employeeRole(e),project,date,
    timestamp:now.toISOString(),direction,scannedBy:profile.displayName||profile.label||auth.currentUser.email,
    scannedByLabel:profile.displayName||profile.label||auth.currentUser.email,scannerUid:auth.currentUser.uid,
    owner:"scanner",createdAt:now.toISOString(),updatedAt:now.toISOString()};
   const old=weekDoc.exists?weekDoc.data():{};
   const entries=Array.isArray(old.entries)?structuredClone(old.entries):[];
   let entry=entries.find(x=>String(x.employeeKey)===parts[1]);
   if(!entry){entry={employeeKey:parts[1],states:{},assignments:{}};entries.push(entry);}
   entry.states=entry.states||{};entry.assignments=entry.assignments||{};
   entry.states[date]="P";entry.assignments[date]=project;
   tx.set(guardRef,{timestamp:rec.timestamp,direction,employeeId:parts[1],project,date,scannerUid:auth.currentUser.uid});
   tx.set(store.collection("attendanceQR").doc(recordId),rec);
   tx.set(weeklyRef,{id:weeklyRef.id,weekStart,project:"",entries,owner:old.owner||"scanner",
    createdAt:old.createdAt||rec.createdAt,updatedAt:rec.updatedAt,updatedBy:rec.scannedByLabel},{merge:true});
   return {duplicate:false,direction,name:rec.employeeName,time:now};
  });
  if(outcome.duplicate)result("Double scan ignoré (moins de 30 secondes).",true);
  else result(outcome.direction+" enregistrée — "+outcome.name+" — "+outcome.time.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}));
 }catch(e){result(errorText(e),true);}finally{busy=false;$("project").disabled=false;}
}
async function init(){
 if(typeof firebase==="undefined")return status("Firebase indisponible. Vérifiez la connexion.",true);
 firebase.initializeApp(firebaseConfig);auth=firebase.auth();store=firebase.firestore();
 await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
 auth.onAuthStateChanged(async current=>{
  await stopCamera();profile=null;$("scanner").hidden=true;$("login").hidden=!!current;
  if(!current){status("Connectez le compte scanner de l’agent.");return;}
  try{
   const p=await store.collection("users").doc(current.uid).get();
   if(!p.exists||p.data().active!==true||p.data().role!=="SCANNER"){
    await auth.signOut();status("Compte non autorisé pour le scan. Demandez un profil SCANNER actif.",true);return;
   }
   profile=p.data();$("login").hidden=true;$("scanner").hidden=false;await loadProjects();
  }catch(e){status(errorText(e),true);$("scanner").hidden=true;}
 });
 $("login").addEventListener("submit",async ev=>{ev.preventDefault();status("Connexion…");
  try{await auth.signInWithEmailAndPassword($("email").value.trim(),$("password").value);}catch(e){status(errorText(e),true);}});
 $("start").onclick=startCamera;$("stop").onclick=stopCamera;
 $("logout").onclick=async()=>{await stopCamera();await auth.signOut();};
}
init().catch(e=>status(errorText(e),true));
