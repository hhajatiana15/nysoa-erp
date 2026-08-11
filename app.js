const DEFAULT_USERS=[];

function ensureSecurityData(){
 ensureGovernanceData();
 db.users=Array.isArray(db.users)&&db.users.length?db.users:JSON.parse(JSON.stringify(DEFAULT_USERS));
 db.loginEvents=Array.isArray(db.loginEvents)?db.loginEvents:[];
 db.notifications=Array.isArray(db.notifications)?db.notifications:[];
 db.technicalEntries=Array.isArray(db.technicalEntries)?db.technicalEntries:[];
 db.usageSessions=Array.isArray(db.usageSessions)?db.usageSessions:[];
 db.importedUsagePackets=Array.isArray(db.importedUsagePackets)?db.importedUsagePackets:[];
 db.usageExportCounters=db.usageExportCounters||{};
 db.dailyReports=Array.isArray(db.dailyReports)?db.dailyReports:[];
 db.importedDailyReportPackets=Array.isArray(db.importedDailyReportPackets)?db.importedDailyReportPackets:[];
 db.dailyReportSettings=db.dailyReportSettings||{deadline:"17:30",logoutReminder:true};
 db.siteControls=Array.isArray(db.siteControls)?db.siteControls:[];
 db.modules=db.modules||{};
 db.modules.attendanceWeekly=Array.isArray(db.modules.attendanceWeekly)?db.modules.attendanceWeekly:[];
 db.modules.attendanceQR=Array.isArray(db.modules.attendanceQR)?db.modules.attendanceQR:[];
 db.userActivityLog=Array.isArray(db.userActivityLog)?db.userActivityLog:[];
 db.technicianMiniProfiles=Array.isArray(db.technicianMiniProfiles)?db.technicianMiniProfiles:[];

 save();
}
function findUser(username){return (db.users||[]).find(u=>u.username===username);}
function userStatus(u){
 if(!u.active)return "Désactivé";
 if(!u.lastSeen)return "Passif";
 return (Date.now()-new Date(u.lastSeen).getTime())<5*60*1000?"Actif":"Passif";
}
function touchCurrentUser(){
 if(!user)return;
 const u=findUser(user.username);
 if(u){u.lastSeen=new Date().toISOString();save();}
}
function addAdminNotification(message,type="Connexion"){
 db.notifications=db.notifications||[];
 db.notifications.unshift({
  id:"NOT-"+Date.now(),type,message,createdAt:new Date().toISOString(),read:false
 });
 save();
}
function logTechnicalEntry(action,moduleName,reference,details){
 if(!user||user.role!=="CONTROLE")return;
 db.technicalEntries=db.technicalEntries||[];
 db.technicalEntries.unshift({
  id:"TEC-"+Date.now(),controller:user.username,controllerLabel:user.label,
  action,module:moduleName,reference,details,
  createdAt:new Date().toISOString()
 });
 save();
}


// ===== V4.7.5 — MINI IDENTITÉS TECHNICIENS / SESSIONS SIMULTANÉES =====
function technicianSessionProfile(){
 try{return JSON.parse(sessionStorage.getItem("nysoa_technician_identity")||"null");}catch(e){return null;}
}
function effectiveUserIdentity(){
 const t=technicianSessionProfile();
 if(user?.role==="TECHNICIEN"&&t)return {uid:"TECH-"+t.id,username:t.name,label:t.name,role:"TECHNICIEN",technicianId:t.id,sharedUid:user.uid||""};
 return user||{};
}
async function loadTechnicianMiniProfiles(){
 let rows=Array.isArray(db.technicianMiniProfiles)?db.technicianMiniProfiles:[];
 if(cloudReady&&fbStore){
  try{const s=await fbStore.collection("technicianMiniProfiles").get();rows=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active!==false);db.technicianMiniProfiles=rows;save();}catch(e){console.warn("mini technicians",e);}
 }
 return rows.filter(x=>x.active!==false);
}
async function saveTechnicianMiniProfile(obj){
 db.technicianMiniProfiles=Array.isArray(db.technicianMiniProfiles)?db.technicianMiniProfiles:[];
 const old=db.technicianMiniProfiles.find(x=>x.id===obj.id);
 if(old)Object.assign(old,obj);else db.technicianMiniProfiles.push(obj);save();
 if(cloudReady&&fbStore)await fbStore.collection("technicianMiniProfiles").doc(obj.id).set(cloudSanitize(obj),{merge:true});
}
async function technicianIdentityGate(){
 const rows=await loadTechnicianMiniProfiles();
 $("#content").innerHTML=`<div class="panel"><h3>IDENTIFICATION TECHNICIEN</h3><div class="panel-body">
 <div class="notice">Compte TECHNICIEN partagé. Choisissez votre identité personnelle. Chaque téléphone ou ordinateur garde sa propre session, donc plusieurs techniciens peuvent travailler simultanément.</div>
 <div class="form-actions"><button class="btn primary" onclick="technicianMiniCreate()">+ Créer mon identité</button></div>
 <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Accès</th></tr></thead><tbody>${rows.length?rows.map(t=>`<tr><td><b>${esc(t.name||"Technicien")}</b></td><td><button class="btn-xs btn-edit" onclick="technicianMiniLogin('${esc(t.id)}')">Choisir</button></td></tr>`).join(""):'<tr><td colspan="2">Aucune identité. Cliquez sur « Créer mon identité ».</td></tr>'}</tbody></table></div></div></div>`;
}
function technicianMiniCreate(){
 $("#content").innerHTML=`<div class="panel"><h3>CRÉER MON IDENTITÉ</h3><form id="fMiniTech" class="form-grid">
 <label>Nom<input name="name" required placeholder="Ex. Jean Rakoto"></label>
 <label>PIN personnel<input name="pin" inputmode="numeric" minlength="4" maxlength="8" required placeholder="4 à 8 chiffres"></label>
 <div class="form-actions full"><button class="btn primary">Créer et entrer</button><button type="button" class="btn secondary" onclick="technicianIdentityGate()">Annuler</button></div></form></div>`;
 document.getElementById("fMiniTech").onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.target),name=String(f.get("name")||"").trim(),pin=String(f.get("pin")||"").trim();if(!/^\d{4,8}$/.test(pin))return alert("PIN : 4 à 8 chiffres.");
 const obj={id:"TMIN-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),name,pin,active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await saveTechnicianMiniProfile(obj);sessionStorage.setItem("nysoa_technician_identity",JSON.stringify({id:obj.id,name:obj.name}));$("#currentUserLabel").textContent=obj.name+" — Technicien";lastMeaningfulActivityAt=Date.now();startUsageSession();startPresence();await logUserActivity("Identification technicien créée","session",obj.id,obj.name);renderMenu();go("dashboard");};
}
async function technicianMiniLogin(id){
 const rows=await loadTechnicianMiniProfiles(),t=rows.find(x=>String(x.id)===String(id));if(!t)return alert("Identité introuvable.");
 const pin=prompt("PIN personnel de "+t.name+" :");if(pin===null)return;if(String(pin)!==String(t.pin||""))return alert("PIN incorrect.");
 sessionStorage.setItem("nysoa_technician_identity",JSON.stringify({id:t.id,name:t.name}));$("#currentUserLabel").textContent=t.name+" — Technicien";lastMeaningfulActivityAt=Date.now();startUsageSession();startPresence();await logUserActivity("Identification technicien","session",t.id,t.name);renderMenu();go("dashboard");
}
async function technicianMyIdentity(){
 const cur=technicianSessionProfile();if(!cur)return technicianIdentityGate();const rows=await loadTechnicianMiniProfiles(),t=rows.find(x=>String(x.id)===String(cur.id));if(!t)return technicianIdentityGate();
 $("#content").innerHTML=`<div class="panel"><h3>MON IDENTITÉ TECHNICIEN</h3><form id="fMiniTechEdit" class="form-grid">
 <label>Nom<input name="name" value="${esc(t.name||"")}" required></label><label>Nouveau PIN<input name="pin" inputmode="numeric" minlength="4" maxlength="8" placeholder="Laisser vide pour conserver"></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="go('dashboard')">Annuler</button><button type="button" class="btn secondary" onclick="technicianChangeIdentity()">Changer de technicien</button></div></form></div>`;
 document.getElementById("fMiniTechEdit").onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.target),name=String(f.get("name")||"").trim(),pin=String(f.get("pin")||"").trim();if(pin&&!/^\d{4,8}$/.test(pin))return alert("PIN : 4 à 8 chiffres.");t.name=name;if(pin)t.pin=pin;t.updatedAt=new Date().toISOString();await saveTechnicianMiniProfile(t);sessionStorage.setItem("nysoa_technician_identity",JSON.stringify({id:t.id,name:t.name}));$("#currentUserLabel").textContent=t.name+" — Technicien";await logUserActivity("Identité technicien modifiée","session",t.id,t.name);renderMenu();go("dashboard");};
}
function technicianChangeIdentity(){closeUsageSession("Changement de technicien");stopPresence();sessionStorage.removeItem("nysoa_usage_session_id");sessionStorage.removeItem("nysoa_technician_identity");lastMeaningfulActivityAt=0;$("#currentUserLabel").textContent=user?.label||"Technicien";technicianIdentityGate();}

// ===== FIREBASE CLOUD SYNC — VERSION 4.5 / PHASE 1 =====
// Phase 1 : Authentication, profils utilisateurs, chantiers et rapports journaliers.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAZMfBTLbFlJsuzhQR0tEnT4dpfaK7m_SA",
  authDomain: "erp-nysoa.firebaseapp.com",
  projectId: "erp-nysoa",
  storageBucket: "erp-nysoa.firebasestorage.app",
  messagingSenderId: "273810293592",
  appId: "1:273810293592:web:15895e9279f2f331ce9b2d"
};

let fbApp=null, fbAuth=null, fbStore=null;
let cloudReady=false;
let cloudListeners=[];
let cloudCurrentPage="dashboard";
let cloudApplyingSnapshot=false;
let cloudState={status:"Initialisation…",lastSync:null,error:null};

let presenceTimer=null;
let adminNotifUnsub=null;
let cloudAutoSyncTimer=null;

const CLOUD_MODULE_COLLECTIONS=new Set([
 "attendanceWeekly","attendanceQR","employees","payroll","purchases","stock","stockMovements","invoices",
 "clients","suppliers","bank","accounting","treasury","planning","situations","technicalFollowup","quality",
 "nonConformities","equipment","vehicles","fuel"
]);
const CLOUD_BUSINESS_COLLECTIONS=[
 "projects","quotes","invoices","clientReceipts","requests","appro","expenses","purchases","stock","stockMovements",
 "employees","payroll","siteControls","reports","dailyReports","attendanceWeekly","attendanceQR","usageSessions",
 "clients","suppliers","bank","accounting","treasury","planning","situations","technicalFollowup","quality",
 "nonConformities","equipment","vehicles","fuel"
];
function cloudCollectionLocalRows(collection){
 if(CLOUD_MODULE_COLLECTIONS.has(collection))return db.modules?.[collection]||[];
 return Array.isArray(db[collection])?db[collection]:[];
}
function replaceCloudCollectionLocalRows(collection,rows){
 if(CLOUD_MODULE_COLLECTIONS.has(collection)){db.modules=db.modules||{};db.modules[collection]=rows;}
 else db[collection]=rows;
 saveLocalOnly();
}
let lastMeaningfulActivityAt=0;
const REAL_ACTIVITY_WINDOW_MS=5*60*1000;
async function updatePresence(status="auto"){
 const actor=effectiveUserIdentity();
 if(!cloudReady||!actor?.uid||!fbStore)return;
 const now=Date.now(),recent=lastMeaningfulActivityAt&&(now-lastMeaningfulActivityAt)<=REAL_ACTIVITY_WINDOW_MS;
 const realStatus=status==="offline"?"offline":(recent?"active":"inactive");
 try{await fbStore.collection("userPresence").doc(actor.uid).set({
  uid:actor.uid,sharedUid:actor.sharedUid||user?.uid||"",email:user?.email||"",
  displayName:actor.label||actor.username||user?.label||user?.username||"",role:actor.role||user?.role||"",
  technicianId:actor.technicianId||"",status:realStatus,currentPage:cloudCurrentPage||"dashboard",
  lastSeen:new Date().toISOString(),lastActivityAt:lastMeaningfulActivityAt?new Date(lastMeaningfulActivityAt).toISOString():null,
  device:navigator.userAgent.slice(0,180)
 },{merge:true});}catch(e){console.warn("presence",e);}
}
async function logUserActivity(action,moduleName="",reference="",details=""){
 if(!user)return;
 const actor=effectiveUserIdentity(),now=new Date();lastMeaningfulActivityAt=now.getTime();
 const rec={id:"ACT-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
  uid:actor.uid||user.uid||"",sharedUid:actor.sharedUid||user.uid||"",technicianId:actor.technicianId||"",
  username:actor.username||user.username||user.email||"",label:actor.label||actor.username||user.label||user.email||"",
  role:actor.role||user.role||"",module:moduleName||cloudCurrentPage||"dashboard",action:String(action||"Activité"),
  reference:String(reference||""),details:String(details||""),createdAt:now.toISOString(),device:navigator.userAgent.slice(0,180)};
 db.userActivityLog=Array.isArray(db.userActivityLog)?db.userActivityLog:[];db.userActivityLog.unshift(rec);if(db.userActivityLog.length>5000)db.userActivityLog.length=5000;saveLocalOnly();
 if(cloudReady&&fbStore&&rec.uid){try{await Promise.all([fbStore.collection("userActivity").doc(rec.id).set(cloudSanitize(rec)),updatePresence("active")]);}catch(e){console.warn("activity",e);}}
}
function startPresence(){clearInterval(presenceTimer);lastMeaningfulActivityAt=Date.now();logUserActivity("Connexion ERP","session","","Ouverture d’une session utilisateur");presenceTimer=setInterval(()=>updatePresence("auto"),60000);}
function stopPresence(){clearInterval(presenceTimer);presenceTimer=null;if(user){logUserActivity("Déconnexion ERP","session","","Fermeture de session");updatePresence("offline");}}
document.addEventListener("visibilitychange",()=>{if(user&&cloudReady)updatePresence("auto");});

function adminPresencePage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 $("#content").innerHTML=`<div class="panel"><h3>ÉTAT RÉEL DES UTILISATEURS ERP</h3><div class="panel-body"><div class="notice">ACTIF = une action métier réelle a été effectuée dans les 5 dernières minutes. Un ERP simplement laissé ouvert reste INACTIF.</div><button class="btn secondary" onclick="adminLoginHistory()">Historique des connexions</button><div id="presenceRows">Chargement…</div></div></div>`;
 fbStore.collection("userPresence").onSnapshot(snap=>{
  const now=Date.now(),rows=snap.docs.map(d=>d.data()).sort((a,b)=>String(a.displayName||a.email).localeCompare(String(b.displayName||b.email)));
  const html=rows.map(r=>{const act=Date.parse(r.lastActivityAt||0)||0,mins=act?Math.floor(Math.max(0,now-act)/60000):null;let st=r.status==="offline"?"offline":(act&&now-act<=REAL_ACTIVITY_WINDOW_MS?"active":"inactive");let label=st==="active"?"ACTIF — travail détecté":st==="inactive"?`INACTIF${mins!==null?` — dernière action il y a ${mins} min`:""}`:"DÉCONNECTÉ";return `<button class="presence-row presence-click" onclick="userActivityHistory('${esc(r.uid||"")}','${esc(r.displayName||r.email||"")}')"><span class="presence-dot presence-${st==='active'?'online':st}"></span><div><b>${esc(r.displayName||r.email)}</b><small>${esc(r.role||"")} — ${label}</small><small>Dernière action : ${esc(r.currentPage||"dashboard")} ${r.lastActivityAt?"— "+new Date(r.lastActivityAt).toLocaleString("fr-FR"):""}</small></div><span>Historique ›</span></button>`;}).join("");
  const el=document.getElementById("presenceRows");if(el)el.innerHTML=html||"Aucune activité enregistrée.";
 });
}
async function userActivityHistory(uid,label=""){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 $("#content").innerHTML=`<div class="panel"><h3>HISTORIQUE D’ACTIVITÉ — ${esc(label)}</h3><div class="panel-body"><button class="btn secondary" onclick="adminPresencePage()">← Retour</button><label style="margin-left:10px">Période <select id="activityPeriod"><option value="1">Aujourd’hui</option><option value="7">7 jours</option><option value="30">30 jours</option><option value="3650">Tout</option></select></label></div><div id="activityHistoryRows" class="table-wrap">Chargement…</div></div>`;
 const render=async()=>{const days=+document.getElementById("activityPeriod").value||1,cut=Date.now()-days*86400000;let rows=[];
  try{if(cloudReady&&fbStore&&uid){const snap=await fbStore.collection("userActivity").where("uid","==",uid).get();rows=snap.docs.map(d=>d.data());}else rows=(db.userActivityLog||[]).filter(x=>x.uid===uid);}
  catch(e){rows=(db.userActivityLog||[]).filter(x=>x.uid===uid);}
  rows=rows.filter(x=>(Date.parse(x.createdAt)||0)>=cut).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  document.getElementById("activityHistoryRows").innerHTML=`<table><thead><tr><th>Date / heure</th><th>Module</th><th>Action réelle</th><th>Référence</th><th>Détails</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${new Date(x.createdAt).toLocaleString("fr-FR")}</td><td>${esc(x.module||"")}</td><td><b>${esc(x.action||"")}</b></td><td>${esc(x.reference||"")}</td><td>${esc(x.details||"")}</td></tr>`).join(""):'<tr><td colspan="5">Aucune activité sur cette période.</td></tr>'}</tbody></table>`;};
 document.getElementById("activityPeriod").onchange=render;render();
}
function notifModuleCount(module){return (db.cloudNotifications||[]).filter(n=>n.module===module&&n.read!==true).length;}
function renderCloudBadges(){
 document.querySelectorAll(".menu-btn").forEach(btn=>{const page=btn.dataset.page,count=notifModuleCount(page);let badge=btn.querySelector(".menu-notif-badge");if(count){if(!badge){badge=document.createElement("span");badge.className="menu-notif-badge";btn.appendChild(badge);}badge.textContent=count>99?"99+":String(count);}else if(badge)badge.remove();});
}
function startAdminNotifications(){
 if(user.role!=="ADMIN"||!fbStore)return;
 if(adminNotifUnsub)try{adminNotifUnsub();}catch(e){}
 adminNotifUnsub=fbStore.collection("notifications").where("targetRole","==","ADMIN").onSnapshot(s=>{db.cloudNotifications=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.read!==true);save();renderCloudBadges();});
}
async function markNotificationsRead(module){
 if(user?.role!=="ADMIN"||!fbStore)return;
 try{const s=await fbStore.collection("notifications").where("targetRole","==","ADMIN").where("module","==",module).get();const b=fbStore.batch();s.docs.filter(d=>d.data().read!==true).forEach(d=>b.update(d.ref,{read:true,readAt:new Date().toISOString(),readBy:user.uid}));await b.commit();}catch(e){console.warn(e);}
}
async function createAdminNotification(module,title,detail,entityId){
 if(!cloudReady||user?.role==="ADMIN"||!fbStore)return;
 try{await fbStore.collection("notifications").add({module,title,detail:detail||"",entityId:entityId||"",sourceUid:user.uid,sourceName:user.label||user.username,sourceRole:user.role,targetRole:"ADMIN",read:false,createdAt:new Date().toISOString()});}catch(e){console.warn("notif",e);}
}
async function cloudWriteGeneric(collection,record,notifyTitle=""){
 if(!user||!record?.id)return;
 logUserActivity(notifyTitle||"Enregistrement / modification",collection,record.id,record.project||record.employeeName||"");
 if(!cloudReady)return;
 try{const payload=cloudSanitize({...record,cloudSyncedAt:new Date().toISOString()});await fbStore.collection(collection).doc(String(record.id)).set(payload,{merge:true});record.cloudSyncedAt=payload.cloudSyncedAt;if(notifyTitle&&!record.cloudNotifiedAt&&user.role!=="ADMIN"){await createAdminNotification(collection,notifyTitle,`${user.label||user.username} — ${record.project||record.id}`,record.id);record.cloudNotifiedAt=new Date().toISOString();}save();cloudMarkSynced();}catch(e){console.warn("cloud generic",collection,e);}
}
let cloudRealtimeRenderTimer=null;
const cloudFingerprints=new Map();
function recordFingerprint(r){
 try{const x={...(r||{})};delete x.cloudSyncedAt;delete x.cloudNotifiedAt;return JSON.stringify(x);}catch(e){return String(r?.id||"");}
}
function rememberCollectionFingerprints(collection,rows){
 (rows||[]).forEach(r=>{if(r?.id)cloudFingerprints.set(collection+"::"+String(r.id),recordFingerprint(r));});
}
function pageUsesCollection(page,collection){
 const map={
  projects:["projects","dashboard","dashboardFinance","dashboardTechnique"],
  quotes:["quotes","dashboard","dashboardFinance"],
  invoices:["invoices","dashboard","dashboardFinance"],
  clientReceipts:["clientReceipts","dashboard","dashboardFinance"],
  requests:["appro","dashboard"],
  appro:["appro","cash","dashboard","dashboardFinance"],
  expenses:["expenses","cash","dashboard","dashboardFinance"],
  purchases:["purchases","dashboard","dashboardFinance"],
  stock:["stock","dashboard"],
  stockMovements:["stock","dashboard"],
  employees:["employees","attendance","qrAttendance","payroll","dashboard"],
  payroll:["payroll","dashboard","dashboardFinance"],
  siteControls:["siteControls","dashboard","dashboardTechnique"],
  reports:["reports","dashboard","dashboardTechnique"],
  dailyReports:["dailyReports","dashboard","dashboardTechnique"],
  attendanceWeekly:["attendance","dashboard","dashboardTechnique"],
  attendanceQR:["qrAttendance","attendance","dashboard","dashboardTechnique"],
  usageSessions:["usageTime","presenceUsers","dashboard"],
  clients:["clients"],suppliers:["suppliers"],bank:["bank"],accounting:["accounting"],treasury:["treasury"],
  planning:["planning"],situations:["situations","dashboardTechnique"],technicalFollowup:["technicalFollowup"],
  quality:["quality"],nonConformities:["nonConformities"],equipment:["equipment"],vehicles:["vehicles"],fuel:["fuel"]
 };
 return (map[collection]||[]).includes(page);
}
function scheduleRealtimeRender(collection){
 if(!pageUsesCollection(cloudCurrentPage,collection))return;
 clearTimeout(cloudRealtimeRenderTimer);
 cloudRealtimeRenderTimer=setTimeout(()=>{
  const p=cloudCurrentPage;
  // Do not destroy an open edit/create form while the user is typing.
  if(document.querySelector("#content form"))return;
  try{go(p);}catch(e){console.warn("auto-render",p,e);}
 },180);
}
function startExtendedRealtimeListeners(){
 if(!cloudReady||!user)return;
 CLOUD_BUSINESS_COLLECTIONS.forEach(collection=>{
  try{
   cloudListeners.push(fbStore.collection(collection).onSnapshot(s=>{
    let local=cloudCollectionLocalRows(collection);
    const removed=new Set(s.docChanges().filter(c=>c.type==="removed").map(c=>String(c.doc.id)));
    if(removed.size){local=local.filter(r=>!removed.has(String(r.id)));replaceCloudCollectionLocalRows(collection,local);}
    const remote=s.docs.map(d=>({id:d.id,...d.data()}));
    const map=new Map(local.map(r=>[String(r.id),r]));let changed=removed.size>0;
    remote.forEach(r=>{const l=map.get(String(r.id));if(!l){local.push(r);changed=true;return;}const rt=Date.parse(r.updatedAt||r.cloudSyncedAt||r.createdAt||0)||0,lt=Date.parse(l.updatedAt||l.cloudSyncedAt||l.createdAt||0)||0;if(rt>=lt&&recordFingerprint(l)!==recordFingerprint(r)){Object.assign(l,r);changed=true;}});
    rememberCollectionFingerprints(collection,remote);
    if(changed){replaceCloudCollectionLocalRows(collection,local);scheduleRealtimeRender(collection);}
    cloudMarkSynced();
   },e=>console.warn("listener",collection,e)));
  }catch(e){console.warn("listener setup",collection,e);}
 });
}
async function cloudAutoSyncAll(reason="auto"){
 if(!cloudReady||!user||!navigator.onLine||cloudApplyingSnapshot)return;
 for(const collection of CLOUD_BUSINESS_COLLECTIONS){
  const rows=cloudCollectionLocalRows(collection);
  for(const r of rows){
   if(!r?.id)continue;
   const key=collection+"::"+String(r.id),fp=recordFingerprint(r);
   if(cloudFingerprints.get(key)===fp)continue;
   try{
    const payload=cloudSanitize({...r,cloudSyncedAt:new Date().toISOString()});
    await fbStore.collection(collection).doc(String(r.id)).set(payload,{merge:true});
    r.cloudSyncedAt=payload.cloudSyncedAt;
    cloudFingerprints.set(key,recordFingerprint(r));
   }catch(e){console.warn("auto sync",collection,r.id,e);}
  }
 }
 saveLocalOnly();cloudMarkSynced();
}
function startCloudAutoSync(){
 clearInterval(cloudAutoSyncTimer);
 // Laisser d’abord les listeners Firebase charger/fusionner l’état Cloud,
 // puis pousser uniquement les vraies modifications locales.
 setTimeout(()=>cloudAutoSyncAll("startup"),2500);
 cloudAutoSyncTimer=setInterval(()=>cloudAutoSyncAll("timer"),5000);
}

function cashTable(){
  return `<div class="card"><h3>💵 Derniers mouvements de caisse</h3><p>Aucun mouvement disponible.</p></div>`;
}

function dashboardDetail(type){
 let title="",rows=[];
 if(type==="revenue"){title="DÉTAIL DU CHIFFRE D’AFFAIRES";rows=(db.projects||[]).filter(p=>!p.deleted).map(p=>({a:p.name||p.id,b:p.client||"",c:money(+p.budget||0),d:p.status||""}));}
 if(type==="employees"){title="DÉTAIL DES EMPLOYÉS ACTIFS";rows=(db.modules?.employees||[]).filter(e=>!e.deleted&&employeeStatusLabel(e)==="Actif").map(e=>({a:employeeName(e),b:projectLabel(employeeProject(e))||"Non affecté",c:employeeRole(e),d:employeeStatusLabel(e)}));}
 if(type==="projects"){title="DÉTAIL DES CHANTIERS";rows=(db.projects||[]).filter(p=>!p.deleted).map(p=>({a:p.name||p.id,b:p.client||"",c:(p.progress||0)+"%",d:p.status||""}));}
 $("#content").innerHTML=`<div class="panel"><h3>${title}</h3><div class="table-wrap"><table><thead><tr><th>Nom / Chantier</th><th>Affectation / Client</th><th>Valeur / Fonction</th><th>Statut</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><b>${esc(r.a)}</b></td><td>${esc(r.b)}</td><td>${esc(r.c)}</td><td>${esc(r.d)}</td></tr>`).join(""):`<tr><td colspan="4">Aucune donnée.</td></tr>`}</tbody></table></div></div>`;
}
function cleanupExpiredLocalPhotos(){const days=+(db.appSettings?.photoRetentionDays||3),cutoff=Date.now()-days*86400000;let n=0;(db.siteControls||[]).forEach(r=>{const t=Date.parse(r.createdAt||r.updatedAt||0)||0;if(r.photo&&t&&t<cutoff){r.photo="";r.photoExpiredAt=new Date().toISOString();n++;}});if(n)save();return n;}


function legacyUsernameForRole(role){
  return role==="ADMIN"?"admin":role==="GESTIONNAIRE"?"gestionnaire":role==="CONTROLE"?"controle":role==="TECHNICIEN"?"technicien":"user";
}
function cloudStatusText(text,kind="normal"){
  cloudState.status=text;
  const el=document.getElementById("cloudStatus");
  if(el){
    el.textContent=text;
    el.className=kind==="ok"?"cloud-ok":kind==="error"?"cloud-error":kind==="busy"?"cloud-busy":"";
  }
  const ls=document.getElementById("cloudLastSync");
  if(ls)ls.textContent=cloudState.lastSync?`Dernière sync : ${new Date(cloudState.lastSync).toLocaleTimeString("fr-FR")}`:"";
}
function cloudMarkSynced(){
  cloudState.lastSync=new Date().toISOString();
  cloudStatusText(navigator.onLine?"Connecté":"Hors ligne",navigator.onLine?"ok":"error");
renderGlobalProjectSelector();
}
function cloudSanitize(value){
  return JSON.parse(JSON.stringify(value,(k,v)=>v===undefined?null:v));
}
function cloudProfileLabel(profile){
  return profile?.displayName||profile?.label||"Utilisateur NYSOA";
}
function cloudLocalUserUpsert(){
  if(!user)return;
  db.users=Array.isArray(db.users)?db.users:[];
  let u=db.users.find(x=>x.uid===user.uid)||db.users.find(x=>x.username===user.username);
  const rec={uid:user.uid,email:user.email,username:user.username,role:user.role,label:user.label,assignedProjects:user.assignedProjects||[],active:true,lastSeen:new Date().toISOString()};
  if(u)Object.assign(u,rec);else db.users.push(rec);
  save();
}
async function cloudLoadProfile(fbUser){
  if(!fbStore)throw new Error("Firestore non initialisé.");
  const snap=await fbStore.collection("users").doc(fbUser.uid).get();
  if(!snap.exists)throw new Error("Profil Firestore introuvable pour cet utilisateur.");
  const profile=snap.data()||{};
  if(profile.active!==true)throw new Error("Ce compte est désactivé.");
  if(!["ADMIN","GESTIONNAIRE","CONTROLE","TECHNICIEN"].includes(profile.role))throw new Error("Rôle utilisateur non reconnu.");
  return {
    uid:fbUser.uid,
    email:fbUser.email||"",
    username:legacyUsernameForRole(profile.role),
    role:profile.role,
    label:cloudProfileLabel(profile),
    assignedProjects:Array.isArray(profile.assignedProjects)?profile.assignedProjects:[]
  };
}
function cloudStopListeners(){
  cloudListeners.forEach(unsub=>{try{unsub();}catch(e){}});
  cloudListeners=[];
}
function cloudMergeRemoteCollection(collection,remoteRows){
  cloudApplyingSnapshot=true;
  db[collection]=Array.isArray(db[collection])?db[collection]:[];
  const byId=new Map(db[collection].map(x=>[String(x.id),x]));
  remoteRows.forEach(remote=>{
    const local=byId.get(String(remote.id));
    if(!local){
      db[collection].push(remote);
      byId.set(String(remote.id),remote);
      return;
    }
    const remoteTime=Date.parse(remote.updatedAt||remote.cloudSyncedAt||remote.createdAt||0)||0;
    const localTime=Date.parse(local.updatedAt||local.cloudSyncedAt||local.createdAt||0)||0;
    if(remoteTime>=localTime)Object.assign(local,remote);
  });
  save();
  cloudApplyingSnapshot=false;
  cloudMarkSynced();
  if(["dashboard","projects","dailyReports"].includes(cloudCurrentPage)){
    clearTimeout(window.__nysoaCloudRefreshTimer);
    window.__nysoaCloudRefreshTimer=setTimeout(()=>{
      try{
        if(cloudCurrentPage==="projects")projects();
        else if(cloudCurrentPage==="dailyReports")dailyReportsPage();
        else if(cloudCurrentPage==="dashboard")dashboard();
      }catch(e){}
    },250);
  }
}
function cloudAttachPhase1Listeners(){
  if(!cloudReady||!user)return;
  cloudStopListeners();

  // Chantiers : tous les utilisateurs actifs peuvent les lire.
  cloudListeners.push(
    fbStore.collection("projects").onSnapshot(snap=>{
      const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
      cloudMergeRemoteCollection("projects",rows);
    },err=>{console.error(err);cloudStatusText("Erreur projets","error");})
  );

  // Rapports : l'Admin voit tout, les autres seulement leurs propres rapports.
  let q=fbStore.collection("dailyReports");
  if(user.role!=="ADMIN")q=q.where("ownerUid","==",user.uid);
  cloudListeners.push(
    q.onSnapshot(snap=>{
      const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
      cloudMergeRemoteCollection("dailyReports",rows);rememberCollectionFingerprints("dailyReports",rows);scheduleRealtimeRender("dailyReports");
    },err=>{console.error(err);cloudStatusText("Erreur rapports","error");})
  );
}
async function cloudUpsert(collection,record){
  if(!cloudReady||!user||cloudApplyingSnapshot||!record?.id)return false;
  try{
    cloudStatusText("Synchronisation…","busy");
    const payload=cloudSanitize(record);
    if(collection==="dailyReports"){
      payload.ownerUid=payload.ownerUid||user.uid;
      payload.ownerEmail=payload.ownerEmail||user.email;
    }
    payload.cloudSyncedAt=new Date().toISOString();
    await fbStore.collection(collection).doc(String(record.id)).set(payload,{merge:true});
    record.cloudSyncedAt=payload.cloudSyncedAt;
    if(collection==="dailyReports"){
      record.ownerUid=payload.ownerUid;
      record.ownerEmail=payload.ownerEmail;
    }
    save();
    cloudMarkSynced();
    return true;
  }catch(err){
    console.error("Cloud upsert",collection,err);
    cloudState.error=err.message;
    cloudStatusText(navigator.onLine?"Erreur cloud":"Hors ligne","error");
    return false;
  }
}
async function cloudDelete(collection,id){
  if(!cloudReady||!user||user.role!=="ADMIN"||!id)return false;
  try{
    cloudStatusText("Synchronisation…","busy");
    await fbStore.collection(collection).doc(String(id)).delete();
    cloudMarkSynced();
    return true;
  }catch(err){
    console.error(err);cloudStatusText("Erreur cloud","error");return false;
  }
}
function cloudSyncRecord(collection,record){
  if(!record)return;
  if(collection==="projects" && !["ADMIN","GESTIONNAIRE"].includes(user?.role||""))return;
  if(collection==="dailyReports"){
    record.ownerUid=record.ownerUid||user?.uid||record.ownerUid;
    record.ownerEmail=record.ownerEmail||user?.email||record.ownerEmail;
  }
  cloudUpsert(collection,record);
}
async function cloudSyncPendingPhase1(){
  if(!cloudReady||!user)return;
  const pendingProjects=(db.projects||[]).filter(r=>{
    if(!["ADMIN","GESTIONNAIRE"].includes(user.role))return false;
    const u=Date.parse(r.updatedAt||r.createdAt||0)||0,s=Date.parse(r.cloudSyncedAt||0)||0;
    return u>s;
  });
  const pendingReports=(db.dailyReports||[]).filter(r=>{
    if(user.role!=="ADMIN" && r.ownerUid && r.ownerUid!==user.uid)return false;
    if(user.role!=="ADMIN" && !r.ownerUid && r.owner!==user.username)return false;
    const u=Date.parse(r.updatedAt||r.createdAt||0)||0,s=Date.parse(r.cloudSyncedAt||0)||0;
    return u>s;
  });
  for(const r of pendingProjects)await cloudUpsert("projects",r);
  for(const r of pendingReports)await cloudUpsert("dailyReports",r);
}
async function cloudSyncNow(){
  if(!cloudReady)return alert("Firebase n’est pas encore connecté.");
  cloudStatusText("Synchronisation de secours…","busy");
  await cloudSyncPendingPhase1();
  await cloudAutoSyncAll("manuel-secours");
  cloudStopListeners();startExtendedRealtimeListeners();
  cloudMarkSynced();
  alert("Synchronisation terminée. Le mode normal reste automatique.");
}
async function cloudMigrationPhase1(){
  if(!cloudReady||user?.role!=="ADMIN")return alert("Migration réservée à l’Admin.");
  if(!confirm("Migrer les chantiers et rapports journaliers locaux de la V4.4 vers Firebase ?\n\nLes données existantes dans le Cloud seront fusionnées."))return;
  try{
    cloudStatusText("Migration V4.4…","busy");
    const userSnaps=await fbStore.collection("users").get();
    const uidByRole={};
    userSnaps.forEach(d=>{const x=d.data()||{};if(x.role)uidByRole[x.role]=d.id;});
    let count=0;
    for(const p of (db.projects||[])){
      await fbStore.collection("projects").doc(String(p.id)).set(cloudSanitize({...p,cloudSyncedAt:new Date().toISOString()}),{merge:true});
      p.cloudSyncedAt=new Date().toISOString();count++;
    }
    for(const r of (db.dailyReports||[])){
      const ownerUid=r.ownerUid||uidByRole[r.role]||null;
      const payload={...r,ownerUid,cloudSyncedAt:new Date().toISOString()};
      await fbStore.collection("dailyReports").doc(String(r.id)).set(cloudSanitize(payload),{merge:true});
      Object.assign(r,{ownerUid,cloudSyncedAt:payload.cloudSyncedAt});count++;
    }
    save();cloudMarkSynced();cloudAttachPhase1Listeners();
    alert(`Migration terminée : ${count} enregistrement(s) traités.`);
  }catch(err){
    console.error(err);cloudStatusText("Erreur migration","error");alert("Migration impossible : "+err.message);
  }
}
async function firebaseEmailLogin(email,password){
  if(!fbAuth)throw new Error("Firebase Authentication n’est pas disponible.");
  await fbAuth.signInWithEmailAndPassword(email,password);
}
async function firebaseLogout(){
  stopPresence();
  clearInterval(cloudAutoSyncTimer);
  cloudStopListeners();
  try{if(fbAuth)await fbAuth.signOut();}catch(e){}
}
function initFirebaseCloud(){
  try{
    if(typeof firebase==="undefined")throw new Error("SDK Firebase non chargé.");
    fbApp=firebase.apps.length?firebase.app():firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth=firebase.auth();
    fbStore=firebase.firestore();
    cloudReady=true;
    fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
    cloudStatusText(navigator.onLine?"Connexion…":"Hors ligne",navigator.onLine?"busy":"error");

    fbAuth.onAuthStateChanged(async fbUser=>{
      if(!fbUser){
        cloudStopListeners();
        user=null;
        sessionStorage.removeItem("nysoa_v2_user");
        document.getElementById("app")?.classList.add("hidden");
        document.getElementById("login")?.classList.remove("hidden");
        cloudStatusText(navigator.onLine?"Prêt":"Hors ligne",navigator.onLine?"normal":"error");
        return;
      }
      try{
        const profile=await cloudLoadProfile(fbUser);
        user=profile;
        sessionStorage.setItem("nysoa_v2_user",JSON.stringify(user));
        cloudLocalUserUpsert();
        boot();
        startExtendedRealtimeListeners();
        if(user.role!=="TECHNICIEN"||technicianSessionProfile())startPresence();
        startCloudAutoSync();
        if(user.role==="ADMIN")startAdminNotifications();
        await cloudSyncPendingPhase1();
      }catch(err){
        console.error(err);
        document.getElementById("loginMsg").textContent=err.message;
        await fbAuth.signOut();
      }
    });
  }catch(err){
    console.error(err);
    cloudReady=false;
    cloudStatusText("Firebase indisponible","error");
    const msg=document.getElementById("loginMsg");
    if(msg)msg.textContent="Connexion Firebase indisponible. Vérifiez Internet puis actualisez la page.";
  }
}
window.addEventListener("online",()=>{cloudStatusText("Reconnexion…","busy");if(user&&cloudReady){cloudSyncPendingPhase1();cloudAutoSyncAll("reconnexion");cloudStopListeners();startExtendedRealtimeListeners();}});
window.addEventListener("offline",()=>cloudStatusText("Hors ligne","error"));

const INIT={
 projects:[],
 appro:[],
 expenses:[],
 requests:[],
 reports:[],
 modules:{},
 quotes:[],
 clientReceipts:[],
 users:JSON.parse(JSON.stringify(DEFAULT_USERS)),
 loginEvents:[],
 notifications:[],
 technicalEntries:[],
 usageSessions:[],
 importedUsagePackets:[],
 usageExportCounters:{},
 dailyReports:[],
 importedDailyReportPackets:[],
 dailyReportSettings:{deadline:"17:30",logoutReminder:true}
};
let db=JSON.parse(localStorage.getItem("nysoa_stable_vide_db_v1")||"null")||structuredClone(INIT);
let user=JSON.parse(sessionStorage.getItem("nysoa_v2_user")||"null");
let adminWorkspace=sessionStorage.getItem("nysoa_admin_workspace")||"GENERAL";
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat("fr-FR").format(+n||0)+" Ar", sum=a=>a.reduce((x,y)=>x+(+y||0),0);
const saveLocalOnly=()=>localStorage.setItem("nysoa_stable_vide_db_v1",JSON.stringify(db));
let cloudAutoSaveDebounce=null;
const save=()=>{saveLocalOnly();if(cloudReady&&user){clearTimeout(cloudAutoSaveDebounce);cloudAutoSaveDebounce=setTimeout(()=>cloudAutoSyncAll("save"),350);}};
if(!db.modules) db.modules={};
if(!Array.isArray(db.clientReceipts)) db.clientReceipts=[];
if(!Array.isArray(db.modules.stockMovements)) db.modules.stockMovements=[];
const canEditRecord=(r)=>user.role==="ADMIN" || ((user.role==="GESTIONNAIRE"||user.role==="CONTROLE") && r.owner===user.username && (r.workflow||"Brouillon")!=="Validé");
const workflowBadge=(w)=>`<span class="badge ${w==="Validé"?"b-green":w==="À corriger"?"b-orange":"b-blue"}">${w||"Brouillon"}</span>`;

function ensureGovernanceData(){
 db.auditLog=Array.isArray(db.auditLog)?db.auditLog:[];
 db.trash=Array.isArray(db.trash)?db.trash:[];
 db.adminValidationCounters=db.adminValidationCounters||{ADMIN:0};
 db.importedValidationFiles=Array.isArray(db.importedValidationFiles)?db.importedValidationFiles:[];
}
function cloneRecord(v){return JSON.parse(JSON.stringify(v));}
function audit(action,moduleName,reference,details="",before=null,after=null){
 ensureGovernanceData();const actor=effectiveUserIdentity();
 const rec={id:"AUD-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:new Date().toISOString(),
  uid:actor.uid||user?.uid||"",sharedUid:actor.sharedUid||user?.uid||"",technicianId:actor.technicianId||"",
  user:actor.label||actor.username||user?.label||user?.username||"système",username:actor.username||user?.username||"",
  role:actor.role||user?.role||"SYSTÈME",action,module:moduleName,reference:String(reference||""),details:String(details||""),
  before:before?cloneRecord(before):null,after:after?cloneRecord(after):null,device:navigator.userAgent.slice(0,180)};
 db.auditLog.unshift(rec);if(db.auditLog.length>10000)db.auditLog.length=10000;saveLocalOnly();
 if(cloudReady&&fbStore&&user)fbStore.collection("auditLog").doc(rec.id).set(cloudSanitize(rec)).catch(e=>console.warn("audit cloud",e));
 logUserActivity(action,moduleName,reference,details);
}
function pushHistory(record,action,before=null,details=""){
 const actor=effectiveUserIdentity();record.history=Array.isArray(record.history)?record.history:[];
 record.history.unshift({id:"HIS-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:new Date().toISOString(),user:actor.label||actor.username||user.username,role:actor.role||user.role,technicianId:actor.technicianId||"",action,details,snapshot:before?cloneRecord(before):null});
}
function isLocked(record){
 const state=record?.workflow||record?.status||"Brouillon";
 return state==="Validé"||state==="Validée"||state==="Archivé";
}
function canUserChange(record){
 if(user.role==="ADMIN")return true;
 return record?.owner===user.username && !isLocked(record) && !record?.deleted;
}
function softDeleteRecord(collection,moduleName,id){
 const rows=db[collection]||[];
 const record=rows.find(x=>String(x.id)===String(id));
 if(!record)return;
 if(!canUserChange(record))return alert("Cette donnée est verrouillée ou ne vous appartient pas.");
 const reason=prompt("Motif de suppression :");
 if(reason===null)return;
 const before=cloneRecord(record);
 record.deleted=true;
 record.deletedAt=new Date().toISOString();
 record.deletedBy=user.username;
 record.deleteReason=reason.trim()||"Erreur de saisie";
 record.updatedAt=record.deletedAt;
 record.updatedBy=user.username;
 pushHistory(record,"Suppression logique",before,record.deleteReason);
 audit("Suppression logique",moduleName,record.id,record.deleteReason,before,record);
 save();
 if(collection==="projects"||collection==="dailyReports")cloudSyncRecord(collection,record);
 refreshModule(moduleName);
}
function restoreRecord(collection,moduleName,id){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 const record=(db[collection]||[]).find(x=>String(x.id)===String(id));
 if(!record)return;
 const before=cloneRecord(record);
 record.deleted=false;
 record.restoredAt=new Date().toISOString();
 record.restoredBy=user.username;
 record.updatedAt=record.restoredAt;
 record.updatedBy=user.username;
 pushHistory(record,"Restauration",before);
 audit("Restauration",moduleName,record.id,"Donnée restaurée",before,record);
 save();
 if(collection==="projects"||collection==="dailyReports")cloudSyncRecord(collection,record);
 trashPage();
}
function permanentDelete(collection,moduleName,id){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 if(!confirm("Supprimer définitivement cette donnée ? Cette action est irréversible."))return;
 const rows=db[collection]||[];
 const record=rows.find(x=>String(x.id)===String(id));
 db[collection]=rows.filter(x=>String(x.id)!==String(id));
 audit("Suppression définitive",moduleName,id,"Suppression définitive",record,null);
 save();if(CLOUD_BUSINESS_COLLECTIONS.includes(collection))cloudDelete(collection,id);trashPage();
}
function showRecordHistory(collection,id){
 const record=(db[collection]||[]).find(x=>String(x.id)===String(id));
 if(!record)return;
 const rows=record.history||[];
 $("#content").innerHTML=`<div class="panel"><h3>HISTORIQUE — ${esc(id)}</h3>
 <div class="panel-body"><button class="btn secondary" onclick="refreshModule('${collection}')">Retour</button>
 ${canUserChange(record)&&rows.some(x=>x.snapshot)?`<button class="btn primary" onclick="undoLastChange('${collection}','${id}')">Annuler la dernière modification</button>`:""}</div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead><tbody>
 ${rows.length?rows.map(h=>`<tr><td>${new Date(h.date).toLocaleString("fr-FR")}</td><td>${esc(h.user)} (${esc(h.role)})</td><td>${esc(h.action)}</td><td>${esc(h.details||"")}</td></tr>`).join(""):`<tr><td colspan="4">Aucun historique.</td></tr>`}
 </tbody></table></div></div>`;
}
function undoLastChange(collection,id){
 const record=(db[collection]||[]).find(x=>String(x.id)===String(id));
 if(!record||!canUserChange(record))return alert("Impossible d’annuler cette modification.");
 const entry=(record.history||[]).find(x=>x.snapshot);
 if(!entry)return alert("Aucune version antérieure disponible.");
 const before=cloneRecord(record);
 const restored=cloneRecord(entry.snapshot);
 Object.keys(record).forEach(k=>delete record[k]);
 Object.assign(record,restored);
 record.updatedAt=new Date().toISOString();
 record.updatedBy=user.username;
 pushHistory(record,"Annulation de la dernière modification",before);
 audit("Annulation",collection,id,"Retour à la version précédente",before,record);
 save();refreshModule(collection);
}
function refreshModule(moduleName){
 const map={projects:"projects",expenses:"expenses",requests:"appro",reports:"reports"};
 go(map[moduleName]||moduleName);
}
async function auditPage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 ensureGovernanceData();
 $("#content").innerHTML=`<div class="panel"><h3>JOURNAL D’AUDIT CLOUD</h3><div class="panel-body">
 <button class="btn secondary" onclick="adminLoginHistory()">Historique des connexions</button>
 <span class="muted">Actions réelles de tous les utilisateurs et appareils, avec auteur et valeurs avant/après.</span></div>
 <div id="auditCloudRows" class="table-wrap">Chargement…</div></div>`;
 let rows=[];try{if(cloudReady&&fbStore){const s=await fbStore.collection("auditLog").get();rows=s.docs.map(d=>d.data());}else rows=db.auditLog||[];}catch(e){rows=db.auditLog||[];}
 rows=rows.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 document.getElementById("auditCloudRows").innerHTML=`<table><thead><tr><th>Date</th><th>Utilisateur</th><th>Rôle</th><th>Action</th><th>Module</th><th>Référence</th><th>Détails</th><th>Avant/Après</th></tr></thead><tbody>
 ${rows.length?rows.map(a=>`<tr><td>${a.date?new Date(a.date).toLocaleString("fr-FR"):""}</td><td><b>${esc(a.user||a.username||"")}</b></td><td>${esc(a.role||"")}</td><td>${esc(a.action||"")}</td><td>${esc(a.module||"")}</td><td>${esc(a.reference||"")}</td><td>${esc(a.details||"")}</td><td>${(a.before||a.after)?`<button class="btn-xs" onclick="showAuditDiff('${esc(a.id)}')">Voir</button>`:"—"}</td></tr>`).join(""):'<tr><td colspan="8">Aucune opération enregistrée.</td></tr>'}</tbody></table>`;
 db.auditLog=rows;saveLocalOnly();
}
async function adminLoginHistory(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 $("#content").innerHTML=`<div class="panel"><h3>HISTORIQUE DES CONNEXIONS UTILISATEURS</h3><div class="panel-body"><button class="btn secondary" onclick="auditPage()">← Retour audit</button>
 <div class="notice">Connexions/déconnexions Admin, Gestionnaire et identités Technicien, tous appareils confondus.</div></div><div id="loginHistoryRows" class="table-wrap">Chargement…</div></div>`;
 let rows=[];try{if(cloudReady&&fbStore){const s=await fbStore.collection("userActivity").get();rows=s.docs.map(d=>d.data());}else rows=db.userActivityLog||[];}catch(e){rows=db.userActivityLog||[];}
 rows=rows.filter(x=>["Connexion ERP","Déconnexion ERP","Identification technicien","Identification technicien créée"].includes(x.action)).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
 document.getElementById("loginHistoryRows").innerHTML=`<table><thead><tr><th>Date/heure</th><th>Utilisateur</th><th>Rôle</th><th>Événement</th><th>Appareil</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${x.createdAt?new Date(x.createdAt).toLocaleString("fr-FR"):""}</td><td><b>${esc(x.label||x.username||"")}</b></td><td>${esc(x.role||"")}</td><td>${esc(x.action||"")}</td><td>${esc(x.device||"")}</td></tr>`).join(""):'<tr><td colspan="5">Aucune connexion enregistrée.</td></tr>'}</tbody></table>`;
}
async function showAuditDiff(id){
 let a=(db.auditLog||[]).find(x=>String(x.id)===String(id));if(!a&&cloudReady&&fbStore){try{const d=await fbStore.collection("auditLog").doc(String(id)).get();if(d.exists)a=d.data();}catch(e){}}
 if(!a)return alert("Entrée d’audit introuvable.");const pretty=v=>esc(JSON.stringify(v||{},null,2));
 $("#content").innerHTML=`<div class="panel"><h3>DÉTAIL AUDIT — ${esc(a.reference||a.id)}</h3><div class="panel-body"><button class="btn secondary" onclick="auditPage()">← Retour</button><p><b>${esc(a.user||"")}</b> — ${esc(a.action||"")} — ${a.date?new Date(a.date).toLocaleString("fr-FR"):""}</p></div>
 <div class="grid-2"><div class="panel"><h3>AVANT</h3><pre class="audit-json">${pretty(a.before)}</pre></div><div class="panel"><h3>APRÈS</h3><pre class="audit-json">${pretty(a.after)}</pre></div></div></div>`;
}
function trashPage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 const groups=[
  ["projects","Chantiers"],["expenses","Dépenses"],["requests","Demandes"],["reports","Rapports"]
 ];
 const rows=[];
 groups.forEach(([collection,label])=>(db[collection]||[]).filter(x=>x.deleted).forEach(x=>rows.push({collection,label,record:x})));
 Object.entries(db.modules||{}).forEach(([collection,data])=>(data||[]).filter(x=>x.deleted).forEach(x=>rows.push({collection:"modules."+collection,label:collection,record:x})));
 $("#content").innerHTML=`<div class="panel"><h3>CORBEILLE</h3><div class="table-wrap"><table>
 <thead><tr><th>Module</th><th>Référence</th><th>Supprimé par</th><th>Date</th><th>Motif</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(x.record.id||"")}</td><td>${esc(x.record.deletedBy||"")}</td><td>${x.record.deletedAt?new Date(x.record.deletedAt).toLocaleString("fr-FR"):""}</td><td>${esc(x.record.deleteReason||"")}</td><td>${x.collection.startsWith("modules.")?`<button class="btn-xs btn-edit" onclick="restoreGeneric('${x.collection.slice(8)}','${x.record.id}')">Restaurer</button><button class="btn-xs btn-delete" onclick="permanentDeleteGeneric('${x.collection.slice(8)}','${x.record.id}')">Supprimer définitivement</button>`:`<button class="btn-xs btn-edit" onclick="restoreRecord('${x.collection}','${x.collection}','${x.record.id}')">Restaurer</button><button class="btn-xs btn-delete" onclick="permanentDelete('${x.collection}','${x.collection}','${x.record.id}')">Supprimer définitivement</button>`}</td></tr>`).join(""):`<tr><td colspan="6">La corbeille est vide.</td></tr>`}
 </tbody></table></div></div>`;
}


const ADMIN_FINANCE_MENU=[
 ["dashboardFinance","◉","TABLEAU DE BORD FINANCE"],
 ["quotes","📄","DEVIS"],["invoices","🧾","FACTURATION"],["clientReceipts","💳","ENCAISSEMENTS CLIENTS"],
 ["clients","👥","CLIENTS"],["suppliers","🚚","FOURNISSEURS"],
 ["purchases","🛒","ACHATS"],["stock","📦","STOCK"],
 ["employees","👥","EMPLOYÉS"],["qrAttendance","▣","PRÉSENCE QR"],["attendance","◷","POINTAGE"],["payroll","💵","PAIE"],
 ["cash","💵","CAISSE"],["bank","🏦","BANQUE"],["accounting","📚","COMPTABILITÉ"],
 ["reportsFinance","◔","RAPPORTS FINANCIERS"]
];
const ADMIN_TECH_MENU=[
 ["dashboardTechnique","◉","TABLEAU DE BORD TECHNIQUE"],
 ["projects","🏗","CHANTIERS"],["qrAttendance","▣","PRÉSENCE QR"],["siteControls","📷","CONTRÔLE CHANTIER"],["planning","📅","PLANNING"],
 ["situations","📊","SITUATION DE TRAVAUX"],["technicalFollowup","🧰","SUIVI JOURNALIER"],
 ["quality","✅","CONTRÔLE QUALITÉ"],["nonConformities","⚠","NON-CONFORMITÉS"],
 ["equipment","🏗","MATÉRIELS & ENGINS"],["vehicles","🚚","VÉHICULES"],
 ["fuel","⛽","CARBURANT"],["reports","◔","RAPPORTS TECHNIQUES"],["technicalRecap","📚","RÉCAPITULATIF TECHNIQUE"]
];

const menus={
 ADMIN:[["dashboard","◉","TABLEAU DE BORD"],["projects","🏗","GESTION DES CHANTIERS"],["quotes","📄","DEVIS"],["invoices","🧾","FACTURATION"],["clientReceipts","💳","ENCAISSEMENTS CLIENTS"],["situations","📊","SITUATION DE TRAVAUX"],["clients","👥","CLIENTS"],["suppliers","🚚","FOURNISSEURS"],["purchases","🛒","ACHATS"],["stock","📦","STOCK"],["equipment","🏗","MATÉRIELS & ENGINS"],["vehicles","🚚","VÉHICULES"],["fuel","⛽","CARBURANT"],["employees","👥","EMPLOYÉS"],["qrAttendance","▣","PRÉSENCE QR"],["attendance","◷","POINTAGE"],["payroll","💵","PAIE"],["cash","💵","CAISSE"],["bank","🏦","BANQUE"],["accounting","📚","COMPTABILITÉ"],["dailyReports","📝","RAPPORTS JOURNALIERS"],["reports","◔","RAPPORTS"],["adminValidations","✅","VALIDATIONS"],["usageTime","⏱","TEMPS D’UTILISATION"],["trash","🗑","CORBEILLE"],["audit","📜","JOURNAL D’AUDIT"],["logicAudit","🧭","CONTRÔLE LOGIQUE ERP"],["presenceUsers","●","UTILISATEURS ACTIFS"],["technicians","🧑‍🔧","TECHNICIENS & ACCÈS"],["settings","⚙","PARAMÈTRES"]],
 GESTIONNAIRE:[["dashboard","◉","TABLEAU DE BORD"],["projects","🏗","GESTION DES CHANTIERS"],["purchases","🛒","ACHATS"],["stock","📦","STOCK"],["employees","👥","EMPLOYÉS"],["qrAttendance","▣","SCAN BADGE QR"],["attendance","◷","POINTAGE"],["payroll","💵","PAIE"],["cash","💵","CAISSE"],["clientReceipts","💳","ENCAISSEMENTS CLIENTS"],["dailyReports","📝","RAPPORT JOURNALIER"],["reports","◔","RAPPORTS FINANCIERS"]],
 CONTROLE:[["dashboard","◉","TABLEAU DE BORD"],["projects","🏗","GESTION DES CHANTIERS"],["qrAttendance","▣","SCAN BADGE QR"],["siteControls","📷","CONTRÔLE CHANTIER"],["attendance","◷","PRÉSENCE CHANTIER"],["situations","📊","SITUATION DE TRAVAUX"],["dailyReports","📝","RAPPORT JOURNALIER"],["reports","◔","RAPPORTS TECHNIQUES"]],
 TECHNICIEN:[["dashboard","◉","TABLEAU DE BORD"],["technicianMyIdentity","👤","MON IDENTITÉ"],["projects","🏗","CHANTIERS"],["qrAttendance","▣","SCAN BADGE QR"],["attendance","◷","POINTAGE"],["siteControls","📷","SUIVI CHANTIER"],["dailyReports","📝","RAPPORT JOURNALIER"],["reports","◔","RAPPORTS TECHNIQUES"]]
};

function projectFinancialDetail(projectId){
 const p=(db.projects||[]).find(x=>String(x.id)===String(projectId));if(!p)return;
 const s=projectFinancialSnapshot(projectId);
 $("#content").innerHTML=`<div class="panel"><h3>FICHE FINANCIÈRE — ${esc(p.name||p.id)}</h3>
 <div class="panel-body"><button class="btn secondary" onclick="projects()">Retour</button></div></div>
 <div class="kpis">
 ${kpi("💼","green","BUDGET",money(p.budget||0))}
 ${kpi("✅","teal","DEVIS VALIDÉS",money(s.validated))}
 ${kpi("🧾","blue","FACTURÉ",money(s.invoiced))}
 ${kpi("💳","green","ENCAISSÉ",money(s.received))}
 ${kpi("⏳","orange","RESTE À FACTURER",money(s.toInvoice))}
 ${kpi("⚠","orange","CRÉANCE CLIENT",money(s.receivable))}
 ${kpi("💸","orange","COÛT RÉEL",money(s.actual))}
 ${kpi("📌","purple","COÛT ENGAGÉ",money(s.committed))}
 ${kpi("📈","teal","MARGE PROVISOIRE",money(s.margin))}
 ${kpi("👛","purple","SOLDE CAISSE",money(s.cash))}
 </div>
 <div class="panel" style="margin-top:12px"><h3>LOGIQUE</h3><div class="panel-body">
  <p><b>Reste à facturer</b> = Devis validés − Facturation.</p>
  <p><b>Créance client</b> = Facturation − Encaissements validés.</p>
  <p><b>Coût engagé</b> = Coût réel + Achats approuvés/effectués/livrés non payés.</p>
  <p><b>Marge provisoire</b> = Chiffre d’affaires facturé − Coût réel.</p>
 </div></div>`;
}

function projectMetrics(id){let p=db.projects.find(x=>x.id===id)||{};let app=sum(db.appro.filter(x=>x.project===id&&x.status==="Validée"&&!x.deleted).map(x=>x.amount));let dep=totalOperatingExpenses(id);return{budget:p.budget||0,app,dep,cash:app-dep,remaining:(p.budget||0)-dep}}
async function login(u,p){
  try{
    $("#loginMsg").textContent="Connexion à Firebase…";
    await firebaseEmailLogin(u,p);
    return true;
  }catch(err){
    console.error(err);
    $("#loginMsg").textContent=err?.code==="auth/invalid-credential"||err?.code==="auth/wrong-password"||err?.code==="auth/user-not-found"
      ?"Adresse e-mail ou mot de passe incorrect."
      :(err?.message||"Connexion impossible.");
    return false;
  }
}
function boot(){ensureSecurityData();quarantineLegacyInvoices();touchCurrentUser();if(user.role!=="ADMIN"&&(user.role!=="TECHNICIEN"||technicianSessionProfile()))startUsageSession();$("#login").classList.add("hidden");$("#app").classList.remove("hidden");const actor=effectiveUserIdentity();$("#currentUserLabel").textContent=actor.label||user.label;$("#today").textContent=new Date().toLocaleDateString("fr-FR");renderMenu();
const obsoleteManualButtons=["sendUpdatesBtn","refreshAdminBtn","publishValidationBtn","importValidationBtn","exportUsageBtn","importUsageBtn","exportDailyReportsBtn","importDailyReportsBtn","cloudMigrateBtn"];
obsoleteManualButtons.forEach(id=>{const el=document.getElementById(id);if(el)el.style.display="none";});
const cloudSyncBtn=document.getElementById("cloudSyncBtn");
if(cloudSyncBtn){cloudSyncBtn.style.display="inline-flex";cloudSyncBtn.title="Synchronisation de secours — le fonctionnement normal est automatique";}
cloudStatusText(navigator.onLine?"Connecté":"Hors ligne",navigator.onLine?"ok":"error");
if(user.role==="TECHNICIEN"&&!technicianSessionProfile())technicianIdentityGate();else if(user.role==="ADMIN"&&adminWorkspace==="FINANCE")go("dashboardFinance");else if(user.role==="ADMIN"&&adminWorkspace==="TECHNIQUE")go("dashboardTechnique");else go("dashboard")}
function renderMenu(){
 let list=menus[user.role];
 if(user.role==="ADMIN"){
   $("#adminWorkspaceBar").classList.remove("hidden");
   list=adminWorkspace==="FINANCE"?ADMIN_FINANCE_MENU:adminWorkspace==="TECHNIQUE"?ADMIN_TECH_MENU:menus.ADMIN;
 }else{
   $("#adminWorkspaceBar").classList.add("hidden");
 }
 $("#menu").innerHTML=list.map(m=>`<button class="menu-btn" data-page="${m[0]}"><span class="ico">${m[1]}</span>${m[2]}</button>`).join("");
 document.querySelectorAll(".menu-btn").forEach(b=>b.onclick=()=>go(b.dataset.page));
 renderCloudBadges();
 document.querySelectorAll(".workspace-tab").forEach(b=>{
   b.classList.toggle("active",b.dataset.workspace===adminWorkspace);
   b.onclick=()=>switchWorkspace(b.dataset.workspace);
 });
}
function switchWorkspace(workspace){
 adminWorkspace=workspace;
 sessionStorage.setItem("nysoa_admin_workspace",workspace);
 renderMenu();
 if(workspace==="FINANCE")go("dashboardFinance");
 else if(workspace==="TECHNIQUE")go("dashboardTechnique");
 else go("dashboard");
}

const ALL_PROJECTS_CONTEXT="__ALL__";
function currentProjectContext(){
 const v=sessionStorage.getItem("nysoa_project_context");
 return (!v||v===ALL_PROJECTS_CONTEXT)?"":v;
}
function userCanAccessProject(projectId){
 if(!user||user.role!=="CONTROLE")return true;
 const assigned=Array.isArray(user.assignedProjects)?user.assignedProjects:[];
 return assigned.length===0||assigned.map(String).includes(String(projectId));
}
function accessibleProjects(){return (db.projects||[]).filter(p=>!p.deleted&&userCanAccessProject(p.id));}
function projectContextOptions(selected=currentProjectContext()){
 return `<option value="${ALL_PROJECTS_CONTEXT}" ${!selected?"selected":""}>Tous les chantiers</option>`+
  accessibleProjects().map(p=>`<option value="${esc(p.id)}" ${String(selected)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("");
}
function renderGlobalProjectSelector(){
 const el=document.getElementById("globalProjectFilter");
 if(!el)return;
 let selected=currentProjectContext();
 if(selected && !(db.projects||[]).some(p=>String(p.id)===String(selected)&&!p.deleted)){
  sessionStorage.setItem("nysoa_project_context",ALL_PROJECTS_CONTEXT);selected="";
 }
 el.innerHTML=projectContextOptions(selected);
 el.value=selected||ALL_PROJECTS_CONTEXT;
}
function setGlobalProjectContext(projectId){
 const raw=String(projectId??"").trim();
 const isAll=!raw||raw===ALL_PROJECTS_CONTEXT;
 const value=isAll?"":raw;
 sessionStorage.setItem("nysoa_project_context",isAll?ALL_PROJECTS_CONTEXT:value);
 const el=document.getElementById("globalProjectFilter");
 if(el)el.value=isAll?ALL_PROJECTS_CONTEXT:value;
 // One single source of truth for every module: blank currentProjectContext() means ALL.
 go(cloudCurrentPage||"dashboard");
 requestAnimationFrame(renderGlobalProjectSelector);
}
function matchesProjectContext(record){
 const p=currentProjectContext();
 if(!p)return true;
 return String(record?.project||record?.chantier||"")===String(p);
}
function projectContextNotice(){
 const p=currentProjectContext();
 if(!p)return "";
 const pr=(db.projects||[]).find(x=>String(x.id)===String(p));
 return `<div class="project-context-note">🏗 Chantier sélectionné : <b>${esc(pr?.name||p)}</b> <button class="btn-xs" onclick="setGlobalProjectContext('')">Afficher tout</button></div>`;
}

function go(page){cloudCurrentPage=page;if(user?.role==="ADMIN")markNotificationsRead(page);if(user&&cloudReady)updatePresence(document.hidden?"inactive":"online");document.querySelectorAll(".menu-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));({dashboard:dashboard,dashboardFinance:dashboardFinance,dashboardTechnique:dashboardTechnique,quotes:quotes,invoices:invoicesPage,clientReceipts:clientReceiptsPage,employees:employeesPage,qrAttendance:qrAttendancePage,technicianMyIdentity:technicianMyIdentity,technicians:techniciansPage,payroll:payrollPage,expenses:expensesPage,appro:approPage,cash:cashPage,projects:projects,siteControls:siteControlsPage,reports:reports,attendance:attendance,technicalRecap:technicalRecap,adminValidations:adminValidationsPage,usageTime:usageTimePage,purchases:purchasesPage,dailyReports:dailyReportsPage,presenceUsers:adminPresencePage,trash:trashPage,audit:auditPage,logicAudit:logicAuditPage}[page]||generic)(page);setTimeout(renderGlobalProjectSelector,0)}
function kpi(icon,color,title,value,note="",page=""){
 const routes={
  "CHANTIERS EN COURS":"projects","NOMBRE DE CHANTIERS":"projects",
  "RAPPORTS TECHNIQUES":"reports","RAPPORTS VALIDÉS":"reports","NON-CONFORMITÉS":"reports",
  "TECHNICIENS ACTIFS":"siteControls","EMPLOYÉS ACTIFS":"employees","POINTAGES DU JOUR":"attendance",
  "DÉPENSES TOTALES":"expenses","APPROVISIONNEMENTS SAISIS":"appro","DEMANDES EN ATTENTE":"appro",
  "CHIFFRE D’AFFAIRES (TTC)":"invoices"
 };
 const target=page||routes[title]||"";
 const detail=title==="CHIFFRE D’AFFAIRES (TTC)"?"revenue":title==="DÉPENSES TOTALES"?"expenses":title==="DÉPENSES RÉELLES"?"expenses":title==="COÛT RÉEL"?"expenses":title==="EMPLOYÉS ACTIFS"?"employees":(title==="CHANTIERS EN COURS"||title==="NOMBRE DE CHANTIERS")?"projects":"";
 const action=detail?`dashboardDetail('${detail}')`:(target?`go('${target}')`:"");
 return `<div class="kpi ${action?"kpi-link":""}" ${action?`role="button" tabindex="0" onclick="${action}" onkeydown="if(event.key==='Enter')${action}"`:""}>
 <div class="circle ${color}">${icon}</div><div><small>${title}</small><strong>${value}</strong><span style="font-size:10px;color:#6b7885">${note}</span></div></div>`;
}

function workspaceBanner(type,title,subtitle){
 return `<div class="workspace-banner ${type}"><div><h2>${title}</h2><p>${subtitle}</p></div><b>${type==="finance"?"💰":"🏗"}</b></div>`;
}

function payrollExpenseTotal(projectId=""){
 return (db.modules?.payroll||[])
  .filter(r=>!r.deleted&&(!projectId||String(r.project)===String(projectId)))
  .reduce((n,r)=>{
    const legacy=(r.advancePaid===undefined&&r.balancePaid===undefined);
    if(legacy){
      if(r.workflow==="En attente")return n;
      return n+(+r.netPaid||+r.grossAmount||+(r.values?.[2]||0)||0);
    }
    return n+(r.advancePaid?+r.advanceAmount||0:0)+(r.balancePaid?+r.balanceAmount||0:0);
  },0);
}
function moduleExpenseAmount(r){
 if(!r)return 0;
 if(Number.isFinite(+r.amount)&&+r.amount)return +r.amount;
 const vals=Array.isArray(r.values)?r.values:[];
 for(let i=vals.length-1;i>=0;i--){
  const v=Number(String(vals[i]??"").replace(/\s/g,"").replace(/Ar/gi,"").replace(/,/g,"."));
  if(Number.isFinite(v)&&v)return v;
 }
 return 0;
}
function totalOperatingExpenses(projectId=""){
 const direct=(db.expenses||[]).filter(x=>!x.deleted&&(!projectId||String(x.project)===String(projectId))).reduce((n,x)=>n+(+x.amount||0),0);
 const generic=(db.modules?.expenses||[]).filter(x=>!x.deleted&&(!projectId||String(x.project)===String(projectId))).reduce((n,x)=>n+moduleExpenseAmount(x),0);
 return direct+generic+payrollExpenseTotal(projectId);
}


// ===== V4.6.0 — LOGIQUE FINANCIÈRE STANDARDISÉE =====
function acceptedQuoteRows(projectId=""){
 return (db.quotes||[]).filter(q=>!q.deleted&&q.status==="Accepté"&&(!projectId||String(q.project)===String(projectId)));
}
function totalValidatedQuotes(projectId=""){
 return acceptedQuoteRows(projectId).reduce((n,q)=>n+quoteFinancials(q).ttc,0);
}
function totalInvoiced(projectId=""){
 return invoiceRows().filter(x=>!projectId||String(x.project)===String(projectId))
  .reduce((n,x)=>n+(+x.trancheAmount||+(x.values?.[2]||0)||0),0);
}
function receiptRows(){
 db.clientReceipts=Array.isArray(db.clientReceipts)?db.clientReceipts:[];
 return db.clientReceipts.filter(r=>!r.deleted);
}
function totalClientReceipts(projectId="",onlyValidated=true){
 return receiptRows()
  .filter(r=>(!projectId||String(r.project)===String(projectId))&&(!onlyValidated||r.status==="Validé"))
  .reduce((n,r)=>n+(+r.amount||0),0);
}
function outstandingReceivables(projectId=""){
 return Math.max(0,totalInvoiced(projectId)-totalClientReceipts(projectId,true));
}
function remainingToInvoice(projectId=""){
 return Math.max(0,totalValidatedQuotes(projectId)-totalInvoiced(projectId));
}
function committedPurchases(projectId=""){
 const rows=(db.modules?.purchases||[]).filter(r=>!r.deleted&&(!projectId||String(r.project)===String(projectId)));
 return rows.filter(r=>["Approuvé","Effectué","Livré"].includes(r.status)&&r.paymentStatus!=="Payé")
  .reduce((n,r)=>n+(+r.amount||0),0);
}
function actualCost(projectId=""){
 return totalOperatingExpenses(projectId);
}
function committedCost(projectId=""){
 return actualCost(projectId)+committedPurchases(projectId);
}
function provisionalMargin(projectId=""){
 return totalInvoiced(projectId)-actualCost(projectId);
}
function projectFinancialSnapshot(projectId=""){
 const validated=totalValidatedQuotes(projectId), invoiced=totalInvoiced(projectId), received=totalClientReceipts(projectId,true),
 actual=actualCost(projectId), committed=committedCost(projectId);
 return {
  validated,invoiced,received,
  toInvoice:Math.max(0,validated-invoiced),
  receivable:Math.max(0,invoiced-received),
  actual,committed,
  margin:invoiced-actual,
  cash:projectMetrics(projectId).cash
 };
}

function dashboardFinance(){
 const totalBudget=sum((db.projects||[]).filter(x=>!x.deleted).map(x=>x.budget));
 const validated=totalValidatedQuotes();
 const invoiced=totalInvoiced();
 const received=totalClientReceipts("",true);
 const receivable=Math.max(0,invoiced-received);
 const actual=actualCost();
 const committed=committedCost();
 const margin=invoiced-actual;
 const totalApp=sum((db.appro||[]).filter(x=>x.status==="Validée"&&!x.deleted).map(x=>x.amount));
 const cashBal=totalApp-actual;
 const pendingAppro=(db.requests||[]).filter(x=>x.status==="En attente"&&!x.deleted).length;
 const pendingReceipts=receiptRows().filter(x=>x.status==="En attente").length;
 $("#content").innerHTML=workspaceBanner("finance","ESPACE FINANCE","Pilotage standardisé : contrat, facturation, encaissement, coûts, engagements et trésorerie")+
 `<div class="kpis finance-kpis-v460">
 ${kpi("💼","green","BUDGET PROJETS",money(totalBudget),"Prévision chantier")}
 ${kpi("✅","teal","DEVIS VALIDÉS",money(validated),"Valeur contractuelle")}
 ${kpi("🧾","blue","CHIFFRE D’AFFAIRES",money(invoiced),"Factures / tranches émises")}
 ${kpi("💳","green","ENCAISSEMENTS CLIENTS",money(received),"Vola tena voaray")}
 ${kpi("⏳","orange","CRÉANCES CLIENTS",money(receivable),"Facturé non encaissé")}
 ${kpi("💸","orange","COÛT RÉEL",money(actual),"Dépenses + paie")}
 ${kpi("📌","purple","COÛT ENGAGÉ",money(committed),"Réel + achats engagés non payés")}
 ${kpi("📈","teal","MARGE PROVISOIRE",money(margin),"CA − coût réel")}
 ${kpi("👛","purple","SOLDE CAISSE",money(cashBal),"Appro validées − sorties")}
 ${kpi("📋","blue","À VALIDER",pendingAppro+pendingReceipts,"Appro + encaissements")}
 </div>
 <div class="finance-logic-strip">
  <div><b>Reste à facturer</b><span>${money(Math.max(0,validated-invoiced))}</span></div>
  <div><b>Créances clients</b><span>${money(receivable)}</span></div>
  <div><b>Achats engagés non payés</b><span>${money(committedPurchases())}</span></div>
 </div>
 <div class="module-grid">
 ${[
 ["quotes","📄","Devis","Valeur contractuelle acceptée"],
 ["invoices","🧾","Facturation","Tranches facturées au client"],
 ["clientReceipts","💳","Encaissements clients","Paiements réellement reçus"],
 ["purchases","🛒","Achats","Engagements et achats chantier"],
 ["stock","📦","Stock","Entrées, sorties et disponibilité"],
 ["cash","💵","Caisse","Journal des mouvements réels"],
 ["appro","➕","Approvisionnement","Alimentation des caisses chantier"],
 ["expenses","💸","Dépenses","Sorties réelles hors paie"],
 ["payroll","👥","Paie","Avances et soldes personnel"],
 ["bank","🏦","Banque","Mouvements bancaires"],
 ["accounting","📚","Comptabilité","Journaux et synthèses"],
 ["treasury","💰","Trésorerie","Disponibilités et prévisions"],
 ["reportsFinance","📊","Rapports financiers","Exports et analyses"]
 ].map(x=>`<div class="module-card finance-accent" onclick="go('${x[0]}')"><div class="module-icon">${x[1]}</div><strong>${x[2]}</strong><small>${x[3]}</small></div>`).join("")}
 </div>`;
}
function dashboardTechnique(){
 $("#content").innerHTML=workspaceBanner("technique","ESPACE TECHNIQUE","Pilotage des chantiers, planning, avancement, qualité et rapports de contrôle")+
 `<div class="kpis">
 ${kpi("🏗","green","CHANTIERS EN COURS",db.projects.filter(x=>x.status==="En cours").length)}
 ${kpi("📈","blue","AVANCEMENT MOYEN",Math.round(sum(db.projects.map(x=>x.progress))/Math.max(db.projects.length,1))+"%")}
 ${kpi("📋","orange","RAPPORTS TECHNIQUES",db.reports.length)}
 ${kpi("⚠","purple","NON-CONFORMITÉS",db.reports.filter(x=>x.conformity==="Non conforme").length)}
 ${kpi("✅","teal","RAPPORTS VALIDÉS",db.reports.filter(x=>x.status==="Validé").length)}
 </div>
 <div class="module-grid">
 ${[
 ["projects","🏗","Chantiers","Fiches, responsables et état d’avancement"],
 ["planning","📅","Planning","Délais, tâches et jalons"],
 ["situations","📊","Situation de travaux","Avancement physique et quantités"],
 ["technicalFollowup","🧰","Suivi journalier","Travaux, main-d’œuvre et matériaux"],
 ["quality","✅","Contrôle qualité","Points de contrôle et conformité"],
 ["nonConformities","⚠","Non-conformités","Anomalies et actions correctives"],
 ["equipment","🏗","Matériels & engins","Affectation et disponibilité"],
 ["vehicles","🚚","Véhicules","Suivi parc et entretiens"],
 ["fuel","⛽","Carburant","Consommation chantier"],
 ["reports","📄","Rapports techniques","Rapports du contrôle et suivi"],
 ["photos","📷","Photos chantier","Avant, pendant et après travaux"],
 ["technicalRecap","📚","Récapitulatif","Synthèse des activités techniques"]
 ].map(x=>`<div class="module-card tech-accent" onclick="go('${x[0]}')"><div class="module-icon">${x[1]}</div><strong>${x[2]}</strong><small>${x[3]}</small></div>`).join("")}
 </div>`;
}

function dashboard(){
 let totalBudget=sum(db.projects.map(x=>x.budget));
 let totalApp=sum(db.appro.filter(x=>x.status==="Validée").map(x=>x.amount));
 let totalRequests=sum(db.requests.map(x=>+x.amount||0));
 let totalAppDisplayed=user.role==="GESTIONNAIRE"?totalApp+totalRequests:totalApp;
 let totalDep=totalOperatingExpenses();
 let cashBal=totalApp-totalDep;
 let invoices=db.modules.invoices||[];
 let employees=db.modules.employees||[];
 let stock=db.modules.stock||[];
 let totalRevenue=totalInvoiced();
 let totalReceived=totalClientReceipts("",true);
 let netProfit=totalRevenue-totalDep;
 let activeEmployees=employees.filter(e=>employeeStatusLabel(e)==="Actif").length;
 let todayKey=new Date().toISOString().slice(0,10);
 let attendanceToday=(db.modules.attendanceWeekly||[])
   .reduce((n,r)=>n+(r.entries||[]).filter(e=>e.states?.[todayKey]==="P").length,0);
 let chartEmpty=`<div class="empty-state">Aucune donnée disponible pour le moment.</div>`;
 let alertItems=[];
 if(stock.length){
   let lowStock=stock.filter(r=>+(r.values?.[1]||0)<=5).length;
   if(lowStock)alertItems.push(`Stock faible : ${lowStock} article(s)`);
 }
 let overdueProjects=db.projects.filter(p=>p.status==="En retard").length;
 if(overdueProjects)alertItems.push(`${overdueProjects} chantier(s) en retard`);
 let pendingRequests=db.requests.filter(x=>x.status==="En attente").length;
 if(pendingRequests)alertItems.push(`${pendingRequests} demande(s) d’approvisionnement en attente`);
 const dailyReminder=user.role!=="ADMIN"?dailyReportReminderHtml():"";

 if(user.role==="GESTIONNAIRE"){
  $("#content").innerHTML=dailyReminder+workspaceBanner("general","VUE GÉNÉRALE GESTIONNAIRE","Synthèse des opérations autorisées.")+
  `<div class="kpis">
    ${kpi("💵","green","APPROVISIONNEMENTS SAISIS",money(totalAppDisplayed))}
    ${kpi("👛","blue","DÉPENSES TOTALES",money(totalDep))}
    ${kpi("💰","orange","SOLDE CAISSE",money(cashBal))}
    ${kpi("📋","purple","DEMANDES EN ATTENTE",pendingRequests)}
    ${kpi("👥","teal","POINTAGES DU JOUR",attendanceToday)}
  </div>
  <div class="notice">
 Les données enregistrées apparaissent immédiatement. Le montant « Approvisionnements saisis » comprend les approvisionnements validés et les demandes envoyées. Le solde caisse compte uniquement les entrées réellement validées.
 </div>
  ${cashTable()}`;return;
 }
 if(user.role==="CONTROLE"){
  $("#content").innerHTML=`<div class="kpis">
    ${kpi("🏗","green","CHANTIERS EN COURS",db.projects.filter(x=>x.status==="En cours").length)}
    ${kpi("📊","blue","RAPPORTS TECHNIQUES",db.reports.length)}
    ${kpi("✅","orange","RAPPORTS VALIDÉS",db.reports.filter(x=>x.status==="Validé").length)}
    ${kpi("⚠","purple","NON-CONFORMITÉS",db.reports.filter(x=>x.conformity==="Non conforme").length)}
    ${kpi("👷","teal","TECHNICIENS ACTIFS",user.role==="CONTROLE"?1:0)}
  </div>${reportsTable()}`;return;
 }
 $("#content").innerHTML=`<div class="sync-guide">
 <b>☁ Synchronisation automatique :</b> les données sont enregistrées dans le Cloud et mises à jour en temps réel sur les appareils connectés. Aucun fichier à télécharger ou importer.
</div>
<div class="kpis">
 ${kpi("📈","green","CHIFFRE D’AFFAIRES (TTC)",money(totalRevenue),"Calculé depuis les factures")}
 ${kpi("👛","blue","DÉPENSES TOTALES",money(totalDep),"Suivi réel")}
 ${kpi("💰","orange","BÉNÉFICE NET",money(netProfit),"CA moins dépenses")}
 ${kpi("🏗","purple","NOMBRE DE CHANTIERS",db.projects.length,"Total enregistré")}
 ${kpi("👥","teal","EMPLOYÉS ACTIFS",activeEmployees,"Effectif enregistré")}
 </div>
 <div class="grid-3">
  <div class="panel"><h3>CHIFFRE D’AFFAIRES (TTC) PAR MOIS</h3>${totalRevenue?`<div class="empty-state">Les statistiques mensuelles apparaîtront après l’enregistrement des dates de facturation.</div>`:chartEmpty}</div>
  <div class="panel"><h3>DÉPENSES VS BUDGET (PAR MOIS)</h3>${totalDep||totalBudget?`<div class="empty-state">Les statistiques mensuelles apparaîtront après l’enregistrement régulier des opérations.</div>`:chartEmpty}</div>
  <div class="panel"><h3>RÉPARTITION DES DÉPENSES</h3>${totalDep?`<div class="empty-state">La répartition sera calculée à partir des catégories de dépenses.</div>`:chartEmpty}</div>
 </div>
 <div class="grid-2" style="margin-top:12px">
  <div class="panel"><h3>AVANCEMENT DES CHANTIERS</h3>${db.projects.length?projectsTable(true):chartEmpty}</div>
  <div>
   <div class="panel"><h3>SITUATION FINANCIÈRE GLOBALE</h3><div class="panel-body">
    <table><tr><td>Total budget projets</td><td><b>${money(totalBudget)}</b></td></tr><tr><td>Approvisionnements caisse</td><td>${money(totalApp)}</td></tr><tr><td>Dépenses réelles (dont salaires)</td><td>${money(totalDep)}</td></tr><tr><td>Disponible caisse</td><td style="color:#078b4c"><b>${money(cashBal)}</b></td></tr></table>
   </div></div>
  </div>
 </div>
 <div class="grid-3" style="margin-top:12px">
  <div class="panel"><h3>TOP CHANTIERS PAR RENTABILITÉ</h3><div class="panel-body">${db.projects.length?db.projects.slice(0,5).map(p=>{let m=projectMetrics(p.id),rate=m.budget?((m.budget-m.dep)/m.budget*100):0;return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee"><span>${p.name}</span><b>${rate.toFixed(1)}%</b></div>`}).join(""):`<div class="empty-state">Aucun chantier enregistré.</div>`}</div></div>
  <div class="panel"><h3>ACTIONS RAPIDES</h3><div class="actions-grid">${[
    ["Nouveau Devis","📄","quotes"],
    ["Nouvelle Facture","🧾","invoices"],
    ["Nouvelle Dépense","💸","expenses"],
    ["Nouvel Achat","🛒","purchases"],
    ["Appro. Caisse","💵","appro"],
    ["Paiement Banque","🏦","bank"],
    ["Nouveau Chantier","🏗","projects"],
    ["Pointage","◷","attendance"]
  ].map(x=>`<div class="action-card" onclick="go('${x[2]}')"><b>${x[1]}</b>${x[0]}</div>`).join("")}</div></div>
  <div class="panel"><h3>ALERTES</h3><div class="alert-list">${alertItems.length?alertItems.map(x=>`<div class="alert-item"><span>⚠ ${x}</span></div>`).join(""):`<div class="empty-state">Aucune alerte actuellement.</div>`}</div></div>
 </div>`;
}
function projectsTable(compact=false){return `<div class="table-wrap"><table><thead><tr><th>Chantier</th><th>Client</th><th>Début</th><th>Fin prévue</th><th>Avancement</th><th>Statut</th></tr></thead><tbody>${db.projects.map(p=>`<tr><td>${p.id}<br>${p.name}</td><td>${p.client}</td><td>${p.start}</td><td>${p.end}</td><td><div class="progress"><span style="width:${p.progress}%"></span></div>${p.progress}%</td><td><span class="badge b-blue">${p.status}</span></td></tr>`).join("")}</tbody></table></div>`}
function projects(){
 let budgetCol=user.role==="ADMIN"?"<th>Budget initial</th>":"";
 $("#content").innerHTML=`
 ${user.role==="ADMIN"?'<div class="notice">Budgets confidentiels visibles uniquement par l’ADMIN.</div>':""}
 <div class="panel">
   <h3>GESTION DES CHANTIERS</h3>
   <div class="panel-body">
     ${["ADMIN","GESTIONNAIRE"].includes(user.role)?'<button class="btn primary" onclick="projectForm()">Nouveau chantier</button>':""}
     <div class="notice" style="margin-top:10px">
       L’Admin et le Gestionnaire créent les chantiers. Le Technicien les consulte et assure le suivi technique.
     </div>
   </div>
   <div class="table-wrap">
     <table>
       <thead><tr>
         <th>Code</th><th>Projet</th><th>Client</th>${budgetCol}
         <th>Début</th><th>Fin prévue</th><th>Avancement</th><th>Statut</th><th>Actions</th>
       </tr></thead>
       <tbody>
         ${accessibleProjects().length?accessibleProjects().map(p=>{
           const isOwner=p.owner===user.username;
           let actions="";
           if(user.role==="ADMIN"){
             actions=`<button class="btn-xs btn-edit" onclick="projectForm('${p.id}')">Modifier</button><button class="btn-xs" onclick="projectFinancialDetail('${p.id}')">Finance</button>
                      <button class="btn-xs btn-delete" onclick="softDeleteRecord('projects','projects','${p.id}')">Supprimer</button>
                      <button class="btn-xs" onclick="showRecordHistory('projects','${p.id}')">Historique</button>`;
           }else if(isOwner && !isLocked(p)){
             actions=`<button class="btn-xs btn-edit" onclick="projectForm('${p.id}')">Modifier</button>
                      <button class="btn-xs btn-delete" onclick="softDeleteRecord('projects','projects','${p.id}')">Supprimer</button>
                      <button class="btn-xs" onclick="showRecordHistory('projects','${p.id}')">Historique</button>`;
             if(user.role==="CONTROLE"){
               actions+=`<button class="btn-xs btn-edit" onclick="projectTechnicalForm('${p.id}')">Suivi technique</button>`;
             }
           }else if(user.role==="CONTROLE"){
             actions=`<button class="btn-xs btn-edit" onclick="projectTechnicalForm('${p.id}')">Modifier suivi</button>`;
           }else{
             actions="<span>Consultation</span>";
           }
           return `<tr>
             <td>${esc(p.id)}</td>
             <td>${esc(p.name)}</td>
             <td>${esc(p.client)}</td>
             ${user.role==="ADMIN"?`<td>${money(p.budget||0)}</td>`:""}
             <td>${esc(p.start||"")}</td>
             <td>${esc(p.end||"")}</td>
             <td>${p.progress||0}%</td>
             <td>${esc(p.status||"")}</td>
             <td><div class="edit-actions">${actions}</div></td>
           </tr>`;
         }).join(""):`<tr><td colspan="${user.role==="ADMIN"?9:8}"><div class="empty-state">Aucun chantier enregistré.</div></td></tr>`}
       </tbody>
     </table>
   </div>
 </div>`;
}
function projectForm(id=""){
 if(user.role==="CONTROLE"){alert("La création/modification principale d’un chantier est réservée à l’Admin et au Gestionnaire. Utilisez le suivi technique.");return projects();}
 let p=id?db.projects.find(x=>x.id===id):null;
 if(p && !canUserChange(p)){
   alert("Vous pouvez modifier uniquement les chantiers que vous avez créés.");
   return projects();
 }

 const budgetField=user.role==="ADMIN"
   ?`<label>Budget initial<input name="budget" type="number" min="0" value="${p?.budget||""}" required></label>`
   :"";

 $("#content").innerHTML=`<div class="panel">
   <h3>${p?"MODIFIER":"NOUVEAU"} CHANTIER</h3>
   <form id="fProject" class="form-grid">
     <label>Code<input name="id" value="${p?.id||""}" ${p?"readonly":""} required></label>
     <label>Client<input name="client" value="${p?.client||""}" required></label>
     <label class="full">Intitulé<input name="name" value="${p?.name||""}" required></label>
     ${budgetField}
     <label>Début<input name="start" type="date" value="${p?.start||""}" required></label>
     <label>Fin prévue<input name="end" type="date" value="${p?.end||""}" required></label>
     <label>Avancement (%)<input name="progress" type="number" min="0" max="100" value="${p?.progress??0}" required></label>
     <label>Statut<select name="status">
       ${["Prévu","Non démarré","En cours","Suspendu","Terminé"].map(s=>`<option ${p?.status===s?"selected":""}>${s}</option>`).join("")}
     </select></label>
     <div class="form-actions full">
       <button class="btn primary">Enregistrer</button>
       <button type="button" class="btn secondary" onclick="projects()">Annuler</button>
     </div>
   </form>
 </div>`;

 $("#fProject").onsubmit=e=>{
   e.preventDefault();
   let f=new FormData(e.target);
   let duplicate=db.projects.find(x=>x.id===f.get("id") && x!==p);
   if(duplicate)return alert("Ce code chantier existe déjà.");

   let obj={
     id:f.get("id").trim(),
     name:f.get("name").trim(),
     client:f.get("client").trim(),
     budget:user.role==="ADMIN"?+f.get("budget"):(p?.budget||0),
     start:f.get("start"),
     end:f.get("end"),
     progress:+f.get("progress"),
     status:f.get("status"),
     owner:p?.owner||user.username,
     createdBy:p?.createdBy||user.username,
     createdAt:p?.createdAt||new Date().toISOString(),
     updatedBy:user.username,
     updatedAt:new Date().toISOString()
   };

   const before=p?cloneRecord(p):null;
   obj.workflow=p?.workflow||"Brouillon";
   if(p){pushHistory(p,"Modification",before);Object.assign(p,obj);audit("Modification","projects",p.id,"Chantier modifié",before,p)}
   else{obj.history=[];pushHistory(obj,"Création");db.projects.push(obj);audit("Création","projects",obj.id,"Chantier créé",null,obj)}
   save();
   cloudSyncRecord("projects",p||obj);
   alert(p?"Chantier modifié avec succès.":"Chantier ajouté avec succès.");
   projects();
 };
}

function readImageCompressed(file,maxWidth=1280,quality=.72){
 return new Promise((resolve,reject)=>{
  if(!file)return resolve("");
  if(!file.type.startsWith("image/"))return reject(new Error("Le fichier sélectionné n’est pas une image."));
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error("Lecture de l’image impossible."));
  reader.onload=()=>{
   const img=new Image();
   img.onerror=()=>reject(new Error("Image invalide."));
   img.onload=()=>{
    const scale=Math.min(1,maxWidth/img.width);
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    resolve(canvas.toDataURL("image/jpeg",quality));
   };
   img.src=reader.result;
  };
  reader.readAsDataURL(file);
 });
}
function canChangeSiteControl(r){
 return user.role==="ADMIN" || (user.role==="CONTROLE" && r.owner===user.username && r.workflow!=="Validé");
}
function siteControlsPage(){
 ensureSecurityData();cleanupExpiredLocalPhotos();
 const rows=(db.siteControls||[]).filter(r=>!r.deleted&&userCanAccessProject(r.project));
 $("#content").innerHTML=`<div class="panel"><h3>CONTRÔLE CHANTIER AVEC PHOTO</h3>
 <div class="panel-body">
  ${["ADMIN","CONTROLE"].includes(user.role)?'<button class="btn primary" onclick="siteControlForm()">+ Nouveau contrôle</button>':""}
  ${user.role==="ADMIN"?`<label class="inline-setting">Conservation photo <select onchange="db.appSettings=db.appSettings||{};db.appSettings.photoRetentionDays=+this.value;save();siteControlsPage()"><option value="2" ${(db.appSettings?.photoRetentionDays||3)==2?"selected":""}>2 jours</option><option value="3" ${(db.appSettings?.photoRetentionDays||3)==3?"selected":""}>3 jours</option></select></label>`:""}
  <div class="notice">Le Technicien enregistre le contrôle, l’effectif présent et une photo. Les photos locales expirent après ${db.appSettings?.photoRetentionDays||3} jour(s).</div>
 </div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Ouvriers</th><th>Manœuvres</th><th>Total</th><th>Observation</th><th>Photo</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr>
 <td>${esc(r.date)}</td><td>${esc(r.project)}</td><td>${r.workers||0}</td><td>${r.labourers||0}</td><td><b>${(+r.workers||0)+(+r.labourers||0)}</b></td>
 <td>${esc(r.note||"")}</td>
 <td>${r.photo?`<img class="site-photo-thumb" src="${r.photo}" onclick="openSitePhoto('${r.id}')" alt="Photo contrôle">`:"Aucune"}</td>
 <td>${workflowBadge(r.workflow||"Soumis")}</td>
 <td><div class="edit-actions">
 ${canChangeSiteControl(r)?`<button class="btn-xs btn-edit" onclick="siteControlForm('${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="deleteSiteControl('${r.id}')">Supprimer</button>`:"<span>Verrouillé</span>"}
 ${user.role==="ADMIN"&&r.workflow!=="Validé"?`<button class="btn-xs" onclick="validateSiteControl('${r.id}')">Valider</button>`:""}
 </div></td></tr>`).join(""):`<tr><td colspan="9"><div class="empty-state">Aucun contrôle chantier enregistré.</div></td></tr>`}
 </tbody></table></div></div>`;
}
function siteControlForm(id=""){
 ensureSecurityData();
 const r=id?db.siteControls.find(x=>x.id===id):null;
 if(r&&!canChangeSiteControl(r))return alert("Ce contrôle est verrouillé.");
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEAU"} CONTRÔLE CHANTIER</h3>
 <form id="fSiteControl" class="form-grid">
 <label>Date<input name="date" type="date" value="${r?.date||new Date().toISOString().slice(0,10)}" required></label>
 <label>Chantier<select name="project" required>${accessibleProjects().map(p=>`<option value="${esc(p.id)}" ${r?.project===p.id?"selected":""}>${esc(p.id)} - ${esc(p.name)}</option>`).join("")}</select></label>
 <label>Nombre d’ouvriers<input name="workers" type="number" min="0" value="${r?.workers??0}" required></label>
 <label>Nombre de manœuvres<input name="labourers" type="number" min="0" value="${r?.labourers??0}" required></label>
 <label class="full">Travaux contrôlés / Observation<textarea name="note" required>${esc(r?.note||"")}</textarea></label>
 <label class="full">Photo chantier<input name="photo" type="file" accept="image/*" capture="environment"></label>
 ${r?.photo?`<div class="full"><img class="site-photo-preview" src="${r.photo}" alt="Photo actuelle"></div>`:""}
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="siteControlsPage()">Annuler</button></div>
 </form></div>`;
 $("#fSiteControl").onsubmit=async e=>{
  e.preventDefault();
  const btn=e.target.querySelector("button");if(btn)btn.disabled=true;
  try{
   const f=new FormData(e.target),file=e.target.elements.photo.files?.[0];
   const photo=file?await readImageCompressed(file):r?.photo||"";
   const obj={
    id:r?.id||"CTL-"+Date.now(),date:f.get("date"),project:f.get("project"),
    workers:+f.get("workers")||0,labourers:+f.get("labourers")||0,note:f.get("note"),photo,
    owner:r?.owner||user.username,workflow:r?.workflow||"Soumis",
    updatedBy:user.username,updatedAt:new Date().toISOString()
   };
   if(r)Object.assign(r,obj);else{obj.createdAt=new Date().toISOString();db.siteControls.push(obj);}
   audit(r?"Modification":"Création","siteControls",obj.id,`Contrôle ${obj.project}: ${obj.workers} ouvriers, ${obj.labourers} manœuvres`);
   save();cloudWriteGeneric("siteControls",r||obj,"Nouveau contrôle chantier");siteControlsPage();
  }catch(err){alert(err.message||"Enregistrement impossible.");}
  finally{if(btn)btn.disabled=false;}
 };
}
function deleteSiteControl(id){
 const r=db.siteControls.find(x=>x.id===id);if(!r||!canChangeSiteControl(r))return;
 if(!confirm("Supprimer ce contrôle chantier ?"))return;
 r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=user.username;save();siteControlsPage();
}
function validateSiteControl(id){
 if(user.role!=="ADMIN")return;
 const r=db.siteControls.find(x=>x.id===id);if(!r)return;
 r.workflow="Validé";r.validatedBy=user.username;r.validatedAt=new Date().toISOString();save();siteControlsPage();
}
function openSitePhoto(id){
 const r=db.siteControls.find(x=>x.id===id);if(!r?.photo)return;
 const w=window.open("","_blank");w.document.write(`<title>Photo ${esc(r.project)}</title><img src="${r.photo}" style="max-width:100%;height:auto">`);
}

function projectTechnicalForm(id){
 let p=db.projects.find(x=>x.id===id);if(!p)return;
 $("#content").innerHTML=`<div class="panel"><h3>MODIFIER LE SUIVI TECHNIQUE</h3>
 <form id="fTechProject" class="form-grid">
 <label>Chantier<input value="${esc(p.id)} - ${esc(p.name)}" readonly></label>
 <label>Avancement (%)<input name="progress" type="number" min="0" max="100" value="${p.progress||0}" required></label>
 <label>Statut<select name="status">${["Prévu","Non démarré","En cours","Suspendu","Terminé"].map(x=>`<option ${p.status===x?"selected":""}>${x}</option>`).join("")}</select></label>
 <label>Ouvriers présents<input name="workers" type="number" min="0" value="${p.workersPresent||0}"></label>
 <label>Manœuvres présents<input name="labourers" type="number" min="0" value="${p.labourersPresent||0}"></label>
 <label class="full">Observation technique<textarea name="technicalNote">${esc(p.technicalNote||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button>
 <button type="button" class="btn secondary" onclick="siteControlForm('${p.id}')">Contrôle avec photo</button>
 <button type="button" class="btn secondary" onclick="projects()">Annuler</button></div></form></div>`;
 $("#fTechProject").onsubmit=e=>{
  e.preventDefault();let f=new FormData(e.target);
  p.progress=+f.get("progress");p.status=f.get("status");p.technicalNote=f.get("technicalNote");
  p.workersPresent=+f.get("workers")||0;p.labourersPresent=+f.get("labourers")||0;
  p.lastTechnicalEditor=user.username;p.lastTechnicalEdit=new Date().toISOString();
  logTechnicalEntry("Modification","Suivi chantier",p.id,`Avancement ${p.progress}%, statut ${p.status}, ouvriers ${p.workersPresent}, manœuvres ${p.labourersPresent}`);
  save();projects();
 };
}
function usersManagement(){if(user?.role!=="ADMIN")return alert("Réservé à l’Admin.");adminPresencePage();}
function userForm(username=""){
 const existing=username?findUser(username):null;
 $("#content").innerHTML=`<div class="panel"><h3>${existing?"MODIFIER":"AJOUTER"} UN UTILISATEUR</h3>
 <form id="fUser" class="form-grid">
  <label>Nom d’utilisateur<input name="username" value="${esc(existing?.username||"")}" ${existing?"readonly":""} required></label>
  <label>Nom affiché<input name="label" value="${esc(existing?.label||"")}" required></label>
  <label>Rôle<select name="role">
   <option value="CONTROLE" ${existing?.role==="CONTROLE"?"selected":""}>Technicien contrôle & suivi</option>
   <option value="GESTIONNAIRE" ${existing?.role==="GESTIONNAIRE"?"selected":""}>Gestionnaire</option>
   <option value="ADMIN" ${existing?.role==="ADMIN"?"selected":""}>Administrateur</option>
  </select></label>
  <label>Mot de passe<input id="newUserPass" name="pass" type="password" value="${esc(existing?.pass||"")}" required></label>
  <label class="show-password-option"><input id="showNewUserPass" type="checkbox">Afficher le mot de passe</label>
  <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="usersManagement()">Annuler</button></div>
 </form></div>`;
 $("#showNewUserPass").onchange=e=>$("#newUserPass").type=e.target.checked?"text":"password";
 $("#fUser").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target);
  const uname=f.get("username").trim();
  if(!existing&&findUser(uname))return alert("Ce nom d’utilisateur existe déjà.");
  const obj=existing||{username:uname,active:true,lastLogin:null,lastSeen:null};
  obj.label=f.get("label").trim();obj.role=f.get("role");obj.pass=f.get("pass");
  if(!existing)db.users.push(obj);
  save();usersManagement();
 };
}
function toggleUser(username){
 const u=findUser(username);if(!u)return;
 u.active=!u.active;save();usersManagement();
}

function logicAuditIssues(){
 const issues=[];
 const add=(level,module,ref,msg)=>issues.push({level,module,ref,msg});
 (db.projects||[]).filter(x=>!x.deleted).forEach(p=>{
  const s=projectFinancialSnapshot(p.id);
  if(s.invoiced>s.validated+0.01&&s.validated>0)add("Critique","Facturation",p.id,"Facturation supérieure aux devis validés.");
  if(s.received>s.invoiced+0.01)add("Critique","Encaissements",p.id,"Encaissements supérieurs au montant facturé.");
  if(s.cash<0)add("Alerte","Caisse",p.id,"Solde caisse négatif.");
 });
 const requireProject=[
  ["Dépenses",expenseRows()],
  ["Paie",payrollRows()],
  ["Factures",invoiceRows()],
  ["Encaissements",receiptRows()],
  ["Achats",(db.modules?.purchases||[]).filter(x=>!x.deleted)],
  ["Appro",(db.appro||[]).filter(x=>!x.deleted)]
 ];
 requireProject.forEach(([module,rows])=>rows.forEach(r=>{if(!r.project)add("Alerte",module,r.id||"","Chantier non renseigné.");}));
 payrollRows().forEach(p=>{
  const gross=+p.grossAmount||0;
  const paid=(p.advancePaid?+p.advanceAmount||0:0)+(p.balancePaid?+p.balanceAmount||0:0);
  if(paid>gross+0.01)add("Critique","Paie",p.id,"Avance + solde dépasse le salaire dû.");
 });
 (db.modules?.purchases||[]).filter(x=>!x.deleted).forEach(p=>{
  if(p.paymentStatus==="Payé"&&!p.linkedExpenseId)add("Alerte","Achats",p.id,"Achat marqué payé sans écriture de dépense liée.");
 });
 return issues;
}
function logicAuditPage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 const issues=logicAuditIssues();
 const critical=issues.filter(x=>x.level==="Critique").length,alerts=issues.filter(x=>x.level==="Alerte").length;
 $("#content").innerHTML=`<div class="kpis">
 ${kpi("✅","green","CONTRÔLES",String(issues.length===0?"OK":issues.length))}
 ${kpi("⛔","orange","CRITIQUES",critical)}
 ${kpi("⚠","purple","ALERTES",alerts)}
 ${kpi("🏗","blue","CHANTIERS",(db.projects||[]).filter(x=>!x.deleted).length)}
 </div>
 <div class="panel"><h3>CONTRÔLE LOGIQUE ERP — V4.6.0</h3>
 <div class="panel-body"><div class="notice">Ce module détecte les incohérences sans supprimer ni modifier automatiquement les données.</div></div>
 <div class="table-wrap"><table><thead><tr><th>Niveau</th><th>Module</th><th>Référence</th><th>Problème détecté</th></tr></thead><tbody>
 ${issues.length?issues.map(x=>`<tr><td>${x.level==="Critique"?'<span class="badge b-orange">Critique</span>':'<span class="badge b-blue">Alerte</span>'}</td><td>${esc(x.module)}</td><td>${esc(x.ref)}</td><td>${esc(x.msg)}</td></tr>`).join(""):`<tr><td colspan="4"><b>Aucune incohérence majeure détectée.</b></td></tr>`}
 </tbody></table></div></div>`;
}

function notificationsPage(){
 if(!user)return dashboard();
 db.notifications.forEach(n=>n.read=true);save();
 $("#content").innerHTML=`<div class="panel"><h3>NOTIFICATIONS ADMIN</h3>
 <div class="panel-body">${db.notifications.length?db.notifications.map(n=>`<div class="notification-row">
  <div><b>${esc(n.type)}</b><br>${esc(n.message)}</div><small>${new Date(n.createdAt).toLocaleString("fr-FR")}</small>
 </div>`).join(""):`<div class="empty-state">Aucune notification.</div>`}</div></div>
 <div class="panel" style="margin-top:12px"><h3>HISTORIQUE DES CONNEXIONS</h3>
 <div class="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Date et heure</th></tr></thead><tbody>
 ${db.loginEvents.map(l=>`<tr><td>${esc(l.label)} (${esc(l.username)})</td><td>${esc(l.role)}</td><td>${new Date(l.loginAt).toLocaleString("fr-FR")}</td></tr>`).join("")}
 </tbody></table></div></div>`;
}
function technicalRecap(){
 if(!user)return dashboard();
 const reportRows=db.reports.map(r=>({
  date:r.updatedAt||r.date,controller:r.owner||"Non précisé",module:"Rapport technique",
  reference:r.id,details:`Chantier ${r.project} — ${r.work} — ${r.conformity}`
 }));
 const projectRows=db.projects.filter(p=>p.lastTechnicalEditor).map(p=>({
  date:p.lastTechnicalEdit,controller:p.lastTechnicalEditor,module:"Suivi chantier",
  reference:p.id,details:`Avancement ${p.progress||0}% — ${p.status} — ${p.technicalNote||""}`
 }));
 const rows=[...(db.technicalEntries||[]).map(x=>({
  date:x.createdAt,controller:x.controllerLabel||x.controller,module:x.module,reference:x.reference,details:x.details
 })),...reportRows,...projectRows].sort((a,b)=>new Date(b.date)-new Date(a.date));
 $("#content").innerHTML=`<div class="panel"><h3>RÉCAPITULATIF DES DONNÉES TECHNIQUES</h3>
 <div class="panel-body">Toutes les données saisies ou modifiées par les techniciens contrôle & suivi sont regroupées ici.</div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Technicien</th><th>Module</th><th>Référence</th><th>Détails</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr><td>${r.date?new Date(r.date).toLocaleString("fr-FR"):""}</td><td>${esc(r.controller)}</td><td>${esc(r.module)}</td><td>${esc(r.reference)}</td><td>${esc(r.details)}</td></tr>`).join(""):`<tr><td colspan="5"><div class="empty-state">Aucune donnée technique saisie.</div></td></tr>`}
 </tbody></table></div></div>`;
}
function reports(){$("#content").innerHTML=`<div class="panel"><h3>${user.role==="CONTROLE"?"RAPPORTS TECHNIQUES CONTRÔLE & SUIVI":"RAPPORTS"}</h3>${user.role==="CONTROLE"?'<div class="panel-body"><button class="btn primary" onclick="reportForm()">Nouveau rapport</button></div>':""}${reportsTable()}</div>`}
function reportsTable(){return `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Date</th><th>Chantier</th><th>Avancement</th><th>Travaux contrôlés</th><th>Conformité</th><th>Incident</th><th>Action</th><th>Statut</th><th>Observation Admin</th><th>Actions</th></tr></thead><tbody>${db.reports.filter(r=>!r.deleted&&userCanAccessProject(r.project)).map(r=>`<tr><td>${r.id}</td><td>${r.date}</td><td>${r.project}</td><td>${r.progress}%</td><td>${r.work}</td><td>${r.conformity}</td><td>${r.issue}</td><td>${r.action}</td><td>${workflowBadge(r.workflow||r.status)}</td><td>${esc(r.adminObservation||"")}</td><td><div class="edit-actions">${canUserChange(r)?`<button class="btn-xs btn-edit" onclick="reportForm('${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="softDeleteRecord('reports','reports','${r.id}')">Supprimer</button>`:"<span>Verrouillé</span>"}<button class="btn-xs" onclick="showRecordHistory('reports','${r.id}')">Historique</button></div></td></tr>`).join("")}</tbody></table></div>`}
function reportForm(id=""){let r=id?db.reports.find(x=>x.id===id):null;if(r&&!canUserChange(r))return alert("Ce rapport est verrouillé ou ne vous appartient pas.");let opts=accessibleProjects().map(p=>`<option value="${p.id}">${p.id} - ${p.name}</option>`).join("");$("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEAU"} RAPPORT CONTRÔLE & SUIVI</h3><form id="fReport" class="form-grid"><label>Date<input name="date" type="date" value="${r?.date||""}" required></label><label>Chantier<select name="project">${accessibleProjects().map(p=>`<option value="${p.id}" ${r?.project===p.id?"selected":""}>${p.id} - ${p.name}</option>`).join("")}</select></label><label>Avancement réel (%)<input name="progress" type="number" min="0" max="100" value="${r?.progress??0}" required></label><label>Conformité<select name="conformity"><option ${r?.conformity==="Conforme"?"selected":""}>Conforme</option><option ${r?.conformity==="Non conforme"?"selected":""}>Non conforme</option></select></label><label class="full">Travaux contrôlés<textarea name="work" required>${r?.work||""}</textarea></label><label>Incident / Blocage<input name="issue" value="${r?.issue||""}"></label><label>Action corrective<input name="action" value="${r?.action||""}" required></label><button class="btn primary">Enregistrer</button></form></div>`;$("#fReport").onsubmit=e=>{e.preventDefault();let f=new FormData(e.target);let obj={id:r?.id||"RAP-"+String(db.reports.length+1).padStart(3,"0"),owner:r?.owner||user.username,date:f.get("date"),project:f.get("project"),progress:+f.get("progress"),work:f.get("work"),conformity:f.get("conformity"),issue:f.get("issue")||"Aucun",action:f.get("action"),status:r?.status||"À valider",updatedAt:new Date().toISOString()};const before=r?cloneRecord(r):null;obj.workflow=r?.workflow||"Soumis";obj.updatedBy=user.username;if(r){pushHistory(r,"Modification",before);Object.assign(r,obj);audit("Modification","reports",r.id,"Rapport modifié",before,r)}else{obj.createdAt=new Date().toISOString();obj.history=[];pushHistory(obj,"Création");db.reports.push(obj);audit("Création","reports",obj.id,"Rapport créé",null,obj)}logTechnicalEntry(r?"Modification":"Création","Rapport technique",obj.id,`Chantier ${obj.project}, avancement ${obj.progress}%, ${obj.conformity}`);save();cloudWriteGeneric("reports",r||obj,"Nouveau rapport technique");reports()}}
function deleteReport(id){if(confirm("Supprimer ce rapport ?")){db.reports=db.reports.filter(x=>x.id!==id);save();reports()}}
function mondayOf(dateStr){
 const d=new Date(dateStr+"T12:00:00");const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);
 return d.toISOString().slice(0,10);
}
function addDays(dateStr,n){const d=new Date(dateStr+"T12:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function employeeStatusLabel(e){return (e.workflow==="Inactif"||e.active===false)?"Passif":"Actif";}
function attendance(){
 ensureSecurityData();
 const employees=(db.modules.employees||[]).filter(r=>!r.deleted);
 const today=new Date().toISOString().slice(0,10),selectedDate=sessionStorage.getItem("nysoa_attendance_date")||today;
 const weekStart=mondayOf(selectedDate),project=sessionStorage.getItem("nysoa_attendance_project")||"";
 const days=["L","M","M","J","V","S","D"].map((label,i)=>({label,date:addDays(weekStart,i)}));
 let record=db.modules.attendanceWeekly.find(r=>r.weekStart===weekStart&&r.project===project);const entries=record?.entries||[];const keyOf=(r,i)=>r.id||r.values?.[0]||`EMP-${i+1}`;
 $("#content").innerHTML=`<div class="panel"><h3>POINTAGE DU PERSONNEL — LISTE COMPLÈTE</h3><div class="panel-body"><div class="form-grid"><label>Semaine contenant le<input id="attendanceDate" type="date" value="${selectedDate}"></label><label>Filtre chantier<select id="attendanceProject"><option value="">Tous les employés</option>${accessibleProjects().map(p=>`<option value="${esc(p.id)}" ${project===p.id?"selected":""}>${esc(p.id)} - ${esc(p.name)}</option>`).join("")}</select></label><div class="form-actions full"><button class="btn primary" onclick="saveAttendance()">Enregistrer le pointage</button><button class="btn secondary" onclick="go('qrAttendance')">📷 Scanner les badges QR</button></div></div><div class="attendance-note">Tous les employés sont visibles, Actifs ou Passifs. Sans scan ou saisie manuelle, le jour est considéré <b>Absent</b>. Un scan QR met automatiquement le salarié <b>Présent</b>. Vous pouvez corriger manuellement.</div></div><div class="table-wrap"><table class="attendance-table weekly-attendance"><thead><tr><th>Matricule</th><th>Nom</th><th>Fonction</th><th>État employé</th><th>Affectation</th>${days.map(d=>`<th class="center">${d.label}<small>${d.date.slice(8,10)}</small></th>`).join("")}<th>Total P</th><th>Mode aujourd’hui</th></tr></thead><tbody>${employees.length?employees.map((r,i)=>{const key=keyOf(r,i),entry=entries.find(e=>e.employeeKey===key)||{},states=entry.states||{},assigned=employeeProject(r),show=!project||String(assigned||"")===String(project);if(!show)return "";const total=days.reduce((n,d)=>n+((states[d.date]||"A")==="P"?1:0),0);const qrToday=qrAttendanceRows().find(q=>q.employeeId===key&&q.date===selectedDate&&q.direction==="Entrée");return `<tr data-employee="${esc(key)}"><td>${esc(employeeMatricule(r)||r.id||r.values?.[0]||"")}</td><td><b>${esc(employeeName(r))}</b></td><td>${esc(employeeRole(r))}</td><td>${employeeStatusLabel(r)==="Actif"?'<span class="qr-in">Actif</span>':'<span class="qr-out">Passif</span>'}</td><td>${esc(projectLabel(assigned)||"Non affecté")}</td>${days.map(d=>{const state=states[d.date]||"A";return `<td class="center"><label class="attendance-check"><input type="checkbox" class="att-present" data-key="${esc(key)}" data-date="${d.date}" ${state==="P"?"checked":""} onchange="setAttendanceCheck('${esc(key)}','${d.date}','P',this.checked)"> P</label><label class="attendance-check"><input type="checkbox" class="att-absent" data-key="${esc(key)}" data-date="${d.date}" ${state!=="P"?"checked":""} onchange="setAttendanceCheck('${esc(key)}','${d.date}','A',this.checked)"> A</label></td>`}).join("")}<td class="num attendance-total" data-key="${esc(key)}"><b>${total}</b></td><td>${qrToday?'<span class="qr-in">QR</span>':'<span>Manuel / défaut</span>'}</td></tr>`;}).join(""):'<tr><td colspan="14">Aucun employé enregistré.</td></tr>'}</tbody></table></div><div class="panel-body"><b>Semaine : ${weekStart} au ${addDays(weekStart,6)}</b> — ${employees.length} employé(s) enregistré(s)</div></div>`;
 $("#attendanceDate").onchange=e=>{sessionStorage.setItem("nysoa_attendance_date",e.target.value);attendance();};$("#attendanceProject").onchange=e=>{sessionStorage.setItem("nysoa_attendance_project",e.target.value);attendance();};
}
function setAttendanceCheck(key,date,state,checked){
 const p=document.querySelector(`.att-present[data-key="${CSS.escape(key)}"][data-date="${date}"]`),a=document.querySelector(`.att-absent[data-key="${CSS.escape(key)}"][data-date="${date}"]`);
 if(state==="P"){if(checked){if(a)a.checked=false;}else if(a)a.checked=true;}else{if(checked){if(p)p.checked=false;}else if(p)p.checked=true;}refreshAttendanceRow(key);
}
function refreshAttendanceRow(key){const states=[...document.querySelectorAll(`.att-present[data-key="${CSS.escape(key)}"]`)];const total=states.filter(x=>x.checked).length;const t=document.querySelector(`.attendance-total[data-key="${CSS.escape(key)}"]`);if(t)t.innerHTML=`<b>${total}</b>`;}
function saveAttendance(){
 const selectedDate=$("#attendanceDate")?.value,project=$("#attendanceProject")?.value||"";if(!selectedDate)return alert("Choisissez une date.");
 const weekStart=mondayOf(selectedDate),employees=(db.modules.employees||[]).filter(r=>!r.deleted);let record=db.modules.attendanceWeekly.find(r=>r.weekStart===weekStart&&r.project===project);
 if(!record){record={id:"ATTW-"+Date.now(),weekStart,project,entries:[],owner:user.username,updatedAt:new Date().toISOString(),updatedBy:user.username};db.modules.attendanceWeekly.push(record);}record.entries=record.entries||[];
 employees.forEach((e,i)=>{const key=e.id||e.values?.[0]||`EMP-${i+1}`;if(project&&String(employeeProject(e)||"")!==String(project))return;let entry=record.entries.find(x=>x.employeeKey===key);if(!entry){entry={employeeKey:key,states:{},paid:false,paidAt:""};record.entries.push(entry);}entry.states=entry.states||{};document.querySelectorAll(`.att-present[data-key="${CSS.escape(key)}"]`).forEach(el=>{entry.states[el.dataset.date]=el.checked?"P":"A";});});
 record.updatedAt=new Date().toISOString();record.updatedBy=user.username;save();logUserActivity("Pointage manuel enregistré","pointage",record.id,project?projectLabel(project):"Tous les employés");cloudWriteGeneric("attendanceWeekly",record,"Pointage du personnel");alert("Pointage enregistré. Les salariés non présents restent Absent.");attendance();
}
function clearAttendanceEmployee(key){
 document.querySelectorAll(`.attendance-state[data-key="${CSS.escape(key)}"]`).forEach(x=>x.value="");
 const paid=document.querySelector(`.attendance-paid[data-key="${CSS.escape(key)}"]`);if(paid)paid.checked=false;
 refreshAttendanceRow(key);
}


// ===== V4.7 — PRÉSENCE QR & MULTI-TECHNICIENS =====
let activeQrScanner=null;
function employeeQrCode(e){return `NYSOA-EMP|${e.id}|${e.qrToken||""}`;}
function ensureEmployeeQrToken(e){
 if(!e.qrToken){e.qrToken=("QR"+Date.now().toString(36)+Math.random().toString(36).slice(2,10)).toUpperCase();e.updatedAt=new Date().toISOString();save();cloudWriteGeneric("employees",e,"Mise à jour badge QR");}
 return e.qrToken;
}
function employeeBadge(id){
 const e=employeeRows().find(x=>String(x.id)===String(id));if(!e)return alert("Employé introuvable.");
 ensureEmployeeQrToken(e);const project=projectLabel(employeeProject(e))||"Multi-chantiers / Non affecté";
 const photo=e.photoData||"";
 $("#content").innerHTML=`<div class="panel badge-screen"><h3 class="no-print">BADGE PROFESSIONNEL — EMPLOYÉ</h3>
 <div class="badge-qr-wrap"><div class="employee-badge employee-badge-v472" id="employeeBadgePrint">
   <div class="badge-top"><img src="assets/logo_nysoa_construct.png" class="badge-logo" alt="NYSOA"><div><div class="badge-brand">ENTREPRISE NYSOA CONSTRUCT</div><div class="badge-subtitle">CARTE PROFESSIONNELLE</div></div></div>
   <div class="badge-main">
     <div class="badge-photo">${photo?`<img src="${photo}" alt="Photo ${esc(employeeName(e))}">`:`<div class="badge-photo-empty"><span>PHOTO</span></div>`}</div>
     <div class="badge-info"><h2>${esc(employeeName(e))}</h2><div class="badge-job">${esc(employeeRole(e))}</div><p><b>Matricule :</b> ${esc(employeeMatricule(e)||e.id)}</p><p><b>Chantier :</b> ${esc(project)}</p><p><b>Statut :</b> ${esc(e.workflow||"Actif")}</p></div>
     <div class="badge-qr-col"><div id="employeeQrCanvas" class="qr-canvas"></div><small>SCAN PRÉSENCE</small></div>
   </div>
   <div class="badge-footer">Badge personnel • ENTREPRISE NYSOA CONSTRUCT</div>
 </div></div>
 <div class="panel-body no-print badge-actions"><button class="btn primary" onclick="printEmployeeBadge()">🖨 Imprimer le badge uniquement</button> <button class="btn secondary" onclick="employeeForm('${e.id}')">Modifier / Photo</button> <button class="btn secondary" onclick="employeesPage()">Retour</button></div></div>`;
 const box=document.getElementById("employeeQrCanvas");
 if(window.QRCode){new QRCode(box,{text:employeeQrCode(e),width:118,height:118,correctLevel:QRCode.CorrectLevel.M});}
 else box.innerHTML=`<div class="qr-lib-error">QR local indisponible.</div>`;
}
function printEmployeeBadge(){window.print();}
async function compressEmployeePhoto(file){
 return new Promise((resolve,reject)=>{
  if(!file)return resolve("");
  const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{
   const img=new Image();img.onerror=reject;img.onload=()=>{
    const max=420,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
    const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
    resolve(c.toDataURL("image/jpeg",0.78));
   };img.src=reader.result;
  };reader.readAsDataURL(file);
 });
}
function qrAttendanceRows(){db.modules=db.modules||{};db.modules.attendanceQR=Array.isArray(db.modules.attendanceQR)?db.modules.attendanceQR:[];return db.modules.attendanceQR.filter(x=>!x.deleted);}
function qrAttendancePage(){
 if(!["ADMIN","GESTIONNAIRE","CONTROLE","TECHNICIEN"].includes(user.role))return alert("Accès non autorisé.");
 const ctx=currentProjectContext();const today=new Date().toISOString().slice(0,10);
 const rows=qrAttendanceRows().filter(r=>(!ctx||String(r.project)===String(ctx))&&String(r.date)===today).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>PRÉSENCE PAR BADGE QR</h3><div class="panel-body"><div class="form-grid"><label>Chantier<select id="qrProject" required><option value="">Choisir le chantier</option>${accessibleProjects().map(p=>`<option value="${esc(p.id)}" ${String(ctx)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label><div class="form-actions"><button class="btn primary" onclick="startQrScanner()">📷 Scanner un badge</button><button class="btn secondary" onclick="stopQrScanner()">Arrêter caméra</button></div><label class="full">Saisie manuelle (secours)<div class="manual-qr"><input id="qrManualCode" placeholder="Coller / saisir le code du badge"><button type="button" class="btn secondary" onclick="processBadgeScan(document.getElementById('qrManualCode').value)">Valider</button></div></label></div><div id="qr-reader" class="qr-reader"></div><div id="qrScanResult"></div><div class="notice">Premier scan de la journée = <b>Entrée</b>. Le scan suivant après l’entrée = <b>Sortie</b>. Un double scan dans les 30 secondes est ignoré.</div></div></div>
 <div class="panel" style="margin-top:12px"><h3>SCANS DU JOUR</h3><div class="table-wrap"><table><thead><tr><th>Heure</th><th>Employé</th><th>Poste</th><th>Chantier</th><th>Mouvement</th><th>Scanné par</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${new Date(r.timestamp).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</td><td><b>${esc(r.employeeName)}</b></td><td>${esc(r.jobTitle||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${r.direction==="Entrée"?'<span class="qr-in">Entrée</span>':'<span class="qr-out">Sortie</span>'}</td><td>${esc(r.scannedByLabel||r.scannedBy||"")}</td></tr>`).join(""):'<tr><td colspan="6">Aucun scan aujourd’hui.</td></tr>'}</tbody></table></div></div>`;
}
async function startQrScanner(){
 const project=document.getElementById("qrProject")?.value;if(!project)return alert("Choisissez d’abord le chantier.");
 if(!window.Html5Qrcode){document.getElementById("qrScanResult").innerHTML='<div class="notice error">Le lecteur QR n’a pas pu se charger. Utilisez la saisie manuelle de secours.</div>';return;}
 await stopQrScanner();
 try{activeQrScanner=new Html5Qrcode("qr-reader");await activeQrScanner.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:240}},text=>processBadgeScan(text),()=>{});}
 catch(err){activeQrScanner=null;document.getElementById("qrScanResult").innerHTML=`<div class="notice error">Caméra indisponible : ${esc(err?.message||String(err))}. Autorisez la caméra dans le navigateur.</div>`;}
}
async function stopQrScanner(){if(activeQrScanner){try{await activeQrScanner.stop();await activeQrScanner.clear();}catch(e){}activeQrScanner=null;}}
async function processBadgeScan(code){
 code=String(code||"").trim();if(!code)return;
 const project=document.getElementById("qrProject")?.value;if(!project)return alert("Choisissez le chantier.");
 const parts=code.split("|");if(parts.length!==3||parts[0]!=="NYSOA-EMP")return showQrResult("Badge QR invalide.",false);
 const [,id,token]=parts,e=employeeRows().find(x=>String(x.id)===String(id));
 if(!e||!e.qrToken||String(e.qrToken)!==String(token)||e.workflow==="Inactif")return showQrResult("Badge inconnu, expiré ou employé inactif.",false);
 const assigned=employeeProject(e);if(assigned&&String(assigned)!==String(project)){return showQrResult(`Ce salarié est affecté à ${projectLabel(assigned)}, pas à ${projectLabel(project)}.`,false);}
 const now=new Date(),date=now.toISOString().slice(0,10),same=qrAttendanceRows().filter(r=>r.employeeId===e.id&&r.project===project&&r.date===date).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
 const last=same[0];if(last&&now-new Date(last.timestamp)<30000)return showQrResult(`Double scan ignoré — ${employeeName(e)}.`,false);
 const direction=last?.direction==="Entrée"?"Sortie":"Entrée";
 const actor=effectiveUserIdentity();const rec={id:"QRATT-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),employeeId:e.id,employeeName:employeeName(e),jobTitle:employeeRole(e),project,date,timestamp:now.toISOString(),direction,scannedBy:actor.username||user.username,scannedByLabel:actor.label||actor.username||user.label,scannerUid:actor.uid||user.uid||"",technicianId:actor.technicianId||"",owner:user.username,createdAt:now.toISOString(),updatedAt:now.toISOString()};
 db.modules.attendanceQR.push(rec);save();syncQrPresenceToWeekly(e,project,date);logUserActivity("Scan badge QR — "+direction,"pointage",e.id,employeeName(e)+" — "+projectLabel(project));cloudWriteGeneric("attendanceQR",rec,"Scan badge QR");
 showQrResult(`${direction} enregistrée — ${employeeName(e)} — ${now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}.`,true);setTimeout(qrAttendancePage,900);
}
function showQrResult(msg,ok){const el=document.getElementById("qrScanResult");if(el)el.innerHTML=`<div class="qr-result ${ok?"ok":"bad"}">${ok?"✓":"⚠"} ${esc(msg)}</div>`;}
function syncQrPresenceToWeekly(e,project,date){
 const weekStart=mondayOf(date);let record=db.modules.attendanceWeekly.find(r=>r.weekStart===weekStart&&r.project===project);
 if(!record){record={id:"ATTW-"+Date.now(),weekStart,project,entries:[],owner:user.username,updatedAt:new Date().toISOString(),updatedBy:user.username};db.modules.attendanceWeekly.push(record);}
 const key=e.id;let entry=record.entries.find(x=>x.employeeKey===key);if(!entry){entry={employeeKey:key,states:{},dailySalary:employeePayCycle(e)==="Hebdomadaire"?Math.round(employeeBaseSalary(e)/6):0,paid:false,paidAt:""};record.entries.push(entry);}
 entry.states=entry.states||{};entry.states[date]="P";record.updatedAt=new Date().toISOString();record.updatedBy=user.username;save();cloudWriteGeneric("attendanceWeekly",record,"Présence QR synchronisée");
}
async function techniciansPage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 const rows=await loadTechnicianMiniProfiles();
 $("#content").innerHTML=`<div class="panel"><h3>TECHNICIENS — MINI IDENTITÉS</h3><div class="panel-body">
 <button class="btn primary" onclick="adminMiniTechnicianForm()">+ Ajouter une identité technicien</button>
 <div class="notice">Un seul login Firebase TECHNICIEN est partagé. Chaque technicien utilise ensuite son Nom + PIN personnel sur son propre téléphone ou ordinateur. Plusieurs techniciens peuvent travailler simultanément.</div></div>
 <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Statut</th><th>Dernière modification</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(t=>`<tr><td><b>${esc(t.name||"")}</b></td><td>${t.active!==false?'<span class="qr-in">Actif</span>':'<span class="qr-out">Passif</span>'}</td><td>${t.updatedAt?new Date(t.updatedAt).toLocaleString("fr-FR"):""}</td><td><button class="btn-xs btn-edit" onclick="adminMiniTechnicianForm('${t.id}')">Modifier</button> <button class="btn-xs" onclick="adminMiniTechnicianToggle('${t.id}',${t.active===false?'true':'false'})">${t.active===false?'Activer':'Désactiver'}</button></td></tr>`).join(""):'<tr><td colspan="4">Aucune identité technicien.</td></tr>'}
 </tbody></table></div></div>`;
}
async function adminMiniTechnicianForm(id=""){
 if(user.role!=="ADMIN")return;const rows=await loadTechnicianMiniProfiles(),t=id?rows.find(x=>String(x.id)===String(id)):null;
 $("#content").innerHTML=`<div class="panel"><h3>${t?"MODIFIER":"AJOUTER"} UNE IDENTITÉ TECHNICIEN</h3><form id="fAdminMiniTech" class="form-grid">
 <label>Nom<input name="name" value="${esc(t?.name||"")}" required></label><label>PIN ${t?"(laisser vide pour conserver)":""}<input name="pin" inputmode="numeric" minlength="4" maxlength="8" ${t?"":"required"}></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="techniciansPage()">Annuler</button></div></form></div>`;
 document.getElementById("fAdminMiniTech").onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.target),name=String(f.get("name")||"").trim(),pin=String(f.get("pin")||"").trim();if((!t||pin)&&!/^[0-9]{4,8}$/.test(pin))return alert("PIN : 4 à 8 chiffres.");const obj=t?{...t}:{id:"TMIN-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),active:true,createdAt:new Date().toISOString()};obj.name=name;if(pin)obj.pin=pin;obj.updatedAt=new Date().toISOString();await saveTechnicianMiniProfile(obj);audit(t?"Modification identité technicien":"Création identité technicien","technicianMiniProfiles",obj.id,obj.name,t||null,obj);techniciansPage();};
}
async function adminMiniTechnicianToggle(id,active){if(user.role!=="ADMIN")return;const rows=await loadTechnicianMiniProfiles(),t=rows.find(x=>String(x.id)===String(id));if(!t)return;t.active=!!active;t.updatedAt=new Date().toISOString();await saveTechnicianMiniProfile(t);audit(active?"Activation technicien":"Désactivation technicien","technicianMiniProfiles",id,t.name);techniciansPage();}


const PURCHASE_STATUSES=["Demandé","Approuvé","Effectué","Livré","Refusé","Annulé"];
function purchaseBadge(status){
 const cls=status==="Livré"?"b-green":status==="Approuvé"||status==="Effectué"?"b-blue":status==="Refusé"||status==="Annulé"?"b-orange":"b-blue";
 return `<span class="badge ${cls}">${esc(status||"Demandé")}</span>`;
}
function purchaseCanEdit(record){
 return user.role==="GESTIONNAIRE" && record.owner===user.username && !record.deleted;
}
function purchasesPage(){
 db.modules.purchases=Array.isArray(db.modules.purchases)?db.modules.purchases:[];
 const rows=db.modules.purchases.filter(x=>!x.deleted);
 $("#content").innerHTML=`<div class="panel"><h3>ACHATS</h3>
 <div class="panel-body">
 ${user.role==="GESTIONNAIRE"?`<button class="btn primary" onclick="purchaseForm()">+ Nouvel achat</button>`:""}
 <span class="muted">Workflow : Demandé → Approuvé → Effectué → Livré</span>
 </div>
 <div class="table-wrap"><table><thead><tr>
 <th>Référence</th><th>Date</th><th>Chantier</th><th>Désignation</th><th>Fournisseur</th>
 <th>Quantité</th><th>Montant</th><th>Situation</th><th>Paiement</th><th>Dernière mise à jour</th>
 <th>Modifié par</th><th>Observation</th><th>Actions</th>
 </tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr>
 <td>${esc(r.id)}</td><td>${esc(r.date||"")}</td><td>${esc(r.project||"")}</td>
 <td>${esc(r.designation||"")}</td><td>${esc(r.supplier||"")}</td>
 <td>${esc(r.quantity||"")} ${esc(r.unit||"")}</td><td>${money(r.amount)}</td>
 <td>${purchaseBadge(r.status)}</td><td>${workflowBadge(r.paymentStatus||"Non payé")}</td>
 <td>${r.updatedAt?new Date(r.updatedAt).toLocaleString("fr-FR"):""}</td>
 <td>${esc(r.updatedBy||r.owner||"")}</td><td>${esc(r.observation||"")}</td>
 <td><div class="edit-actions">
 ${purchaseCanEdit(r)?`<button class="btn-xs btn-edit" onclick="purchaseForm('${r.id}')">Modifier / situation</button>
 <button class="btn-xs btn-delete" onclick="softDeletePurchase('${r.id}')">Supprimer</button>`:""}
 <button class="btn-xs" onclick="purchaseHistory('${r.id}')">Historique</button>
 </div></td></tr>`).join(""):`<tr><td colspan="13">Aucun achat enregistré.</td></tr>`}
 </tbody></table></div></div>`;
}
function purchaseForm(id=""){
 if(user.role!=="GESTIONNAIRE")return alert("La saisie des achats est réservée au Gestionnaire.");
 db.modules.purchases=Array.isArray(db.modules.purchases)?db.modules.purchases:[];
 const r=id?db.modules.purchases.find(x=>String(x.id)===String(id)):null;
 if(r&&!purchaseCanEdit(r))return alert("Cet achat ne vous appartient pas.");
 const projectOptions=db.projects.filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${r?.project===p.id?"selected":""}>${esc(p.id)} - ${esc(p.name||"")}</option>`).join("");
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER L’ACHAT":"NOUVEL ACHAT"}</h3>
 <form id="purchaseForm" class="form-grid">
 <label>Référence<input name="reference" value="${esc(r?.id||"")}" placeholder="Automatique si vide"></label>
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required><option value="">Choisir un chantier</option>${projectOptions}</select></label>
 <label>Désignation<input name="designation" value="${esc(r?.designation||"")}" required></label>
 <label>Fournisseur<input name="supplier" value="${esc(r?.supplier||"")}" required></label>
 <label>Quantité<input name="quantity" type="number" step="0.01" value="${esc(r?.quantity||"")}" required></label>
 <label>Unité<input name="unit" value="${esc(r?.unit||"Unité")}" required></label>
 <label>Montant total<input name="amount" type="number" step="0.01" value="${esc(r?.amount||"")}" required></label>
 <label>Situation<select name="status">${PURCHASE_STATUSES.map(s=>`<option ${r?.status===s?"selected":""}>${s}</option>`).join("")}</select></label><label>État paiement<select name="paymentStatus"><option ${r?.paymentStatus==="Non payé"?"selected":""}>Non payé</option><option ${r?.paymentStatus==="Payé"?"selected":""}>Payé</option></select></label>
 <label class="full">Observation<input name="observation" value="${esc(r?.observation||"")}" placeholder="Ex. Validation téléphonique Admin"></label>
 <div id="approvalFields" class="approval-fields full">
 <label>Approuvé par<input name="approvedBy" value="${esc(r?.approvedBy||"Admin / Direction")}"></label>
 <label>Date d’autorisation<input name="approvedAt" type="datetime-local" value="${r?.approvedAt?new Date(r.approvedAt).toISOString().slice(0,16):""}"></label>
 <label>Mode d’autorisation<select name="approvalMode"><option>Téléphone</option><option>WhatsApp</option><option>E-mail</option><option>En personne</option></select></label>
 </div>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="purchasesPage()">Annuler</button></div>
 </form></div>`;
 const statusSelect=document.querySelector('[name="status"]');
 const toggleApproval=()=>document.getElementById("approvalFields").style.display=statusSelect.value==="Approuvé"||r?.approvedAt?"grid":"none";
 statusSelect.onchange=toggleApproval;toggleApproval();
 $("#purchaseForm").onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const now=new Date().toISOString();
  const newStatus=f.get("status");
  const oldStatus=r?.status||null;
  const obj={
   id:(f.get("reference")||"").trim()||r?.id||"ACH-"+String(db.modules.purchases.length+1).padStart(4,"0"),
   date:f.get("date"),project:f.get("project"),designation:f.get("designation"),
   supplier:f.get("supplier"),quantity:+f.get("quantity"),unit:f.get("unit"),
   amount:+f.get("amount"),status:newStatus,workflow:newStatus,paymentStatus:f.get("paymentStatus")||"Non payé",
   observation:f.get("observation"),owner:r?.owner||user.username,
   updatedBy:user.username,updatedAt:now,
   approvedBy:newStatus==="Approuvé"?(f.get("approvedBy")||"Admin / Direction"):r?.approvedBy||"",
   approvedAt:newStatus==="Approuvé"?(f.get("approvedAt")?new Date(f.get("approvedAt")).toISOString():now):r?.approvedAt||"",
   approvalMode:newStatus==="Approuvé"?(f.get("approvalMode")||"Téléphone"):r?.approvalMode||""
  };
  if(!r&&db.modules.purchases.some(x=>String(x.id)===String(obj.id)))return alert("Cette référence existe déjà.");
  if(r){
   const before=cloneRecord(r);
   Object.assign(r,obj);
   pushHistory(r,oldStatus!==newStatus?"Changement de situation":"Modification",before,oldStatus!==newStatus?`${oldStatus} → ${newStatus}`:"Achat modifié");
   audit(oldStatus!==newStatus?"Changement situation achat":"Modification","purchases",r.id,oldStatus!==newStatus?`${oldStatus} → ${newStatus}`:"Achat modifié",before,r);
  }else{
   obj.createdAt=now;obj.history=[];pushHistory(obj,"Création",null,`Situation initiale : ${newStatus}`);
   db.modules.purchases.push(obj);audit("Création","purchases",obj.id,`Achat créé — ${newStatus}`,null,obj);
  }
  const saved=r||obj;
  if(saved.paymentStatus==="Payé"&&!saved.linkedExpenseId){
   const exp={id:"DEP-ACH-"+saved.id,date:saved.date,project:saved.project,category:"Achats",label:`Achat ${saved.designation}`,amount:+saved.amount||0,paymentMode:"À préciser",reference:saved.id,status:"Payée",note:`Généré automatiquement depuis achat ${saved.id}`,owner:user.username,createdAt:now,updatedAt:now,sourcePurchaseId:saved.id};
   db.expenses.push(exp);saved.linkedExpenseId=exp.id;
  }
  save();purchasesPage();
 };
}
function softDeletePurchase(id){
 const r=(db.modules.purchases||[]).find(x=>String(x.id)===String(id));
 if(!r||!purchaseCanEdit(r))return;
 const reason=prompt("Motif de suppression :");if(reason===null)return;
 const before=cloneRecord(r);r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=user.username;r.deleteReason=reason||"Erreur de saisie";
 pushHistory(r,"Suppression logique",before,r.deleteReason);audit("Suppression logique","purchases",id,r.deleteReason,before,r);save();purchasesPage();
}
function purchaseHistory(id){
 const r=(db.modules.purchases||[]).find(x=>String(x.id)===String(id));if(!r)return;
 const rows=r.history||[];
 $("#content").innerHTML=`<div class="panel"><h3>HISTORIQUE ACHAT — ${esc(id)}</h3>
 <div class="panel-body"><button class="btn secondary" onclick="purchasesPage()">Retour</button></div>
 <div class="table-wrap"><table><thead><tr><th>Date et heure</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead><tbody>
 ${rows.length?rows.map(h=>`<tr><td>${new Date(h.date).toLocaleString("fr-FR")}</td><td>${esc(h.user)} (${esc(h.role)})</td><td>${esc(h.action)}</td><td>${esc(h.details||"")}</td></tr>`).join(""):`<tr><td colspan="4">Aucun historique.</td></tr>`}
 </tbody></table></div></div>`;
}




// ===== APPRO CAISSE / CAISSE / DÉPENSES V4.5.6 =====
function projectLabel(id){
 const p=(db.projects||[]).find(x=>String(x.id)===String(id));
 return p?.name||id||"Non affecté";
}
function expenseRows(){
 db.expenses=Array.isArray(db.expenses)?db.expenses:[];
 return db.expenses.filter(x=>!x.deleted);
}
function expensesPage(){
 const ctx=currentProjectContext();
 const rows=expenseRows().filter(x=>!ctx||String(x.project)===String(ctx));
 $("#content").innerHTML=`${caisseNav("expenses")}${projectContextNotice()}<div class="panel"><h3>DÉPENSES (JOURNAL)</h3>
 <div class="panel-body"><button class="btn primary" onclick="expenseForm()">+ Nouvelle dépense</button>
 <div class="notice">Une dépense est une sortie réelle de caisse. Chaque saisie doit être rattachée à un chantier.</div></div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Catégorie</th><th>Libellé</th><th>Montant</th><th>Mode</th><th>Référence</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(r.category||"")}</td><td>${esc(r.label||r.note||"")}</td><td><b>${money(r.amount||0)}</b></td><td>${esc(r.paymentMode||"")}</td><td>${esc(r.reference||"")}</td><td>${workflowBadge(r.status||"Payée")}</td><td><div class="edit-actions"><button class="btn-xs btn-edit" onclick="expenseForm('${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="deleteExpense('${r.id}')">Supprimer</button></div></td></tr>`).join(""):`<tr><td colspan="9">Aucune dépense.</td></tr>`}
 </tbody></table></div></div>`;
}
function expenseForm(id=""){
 const r=id?expenseRows().find(x=>String(x.id)===String(id)):null;
 const project=r?.project||currentProjectContext()||"";
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVELLE"} DÉPENSE</h3><form id="fExpense" class="form-grid">
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required><option value="">Choisir</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label>
 <label>Catégorie<select name="category"><option>Achats</option><option>Carburant</option><option>Transport</option><option>Main-d’œuvre externe</option><option>Matériels</option><option>Frais chantier</option><option>Autre</option></select></label>
 <label>Libellé<input name="label" value="${esc(r?.label||"")}" required></label>
 <label>Montant (Ar)<input name="amount" type="number" min="1" step="1" value="${+r?.amount||""}" required></label>
 <label>Mode de paiement<select name="paymentMode">${["Espèces","Virement","Mobile Money","Chèque","Autre"].map(x=>`<option ${r?.paymentMode===x?"selected":""}>${x}</option>`).join("")}</select></label>
 <label>Référence<input name="reference" value="${esc(r?.reference||"")}"></label>
 <label>Statut<select name="status"><option ${r?.status==="Payée"?"selected":""}>Payée</option><option ${r?.status==="En attente"?"selected":""}>En attente</option></select></label>
 <label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="expensesPage()">Annuler</button></div></form></div>`;
 $("#fExpense").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target);
  const obj={id:r?.id||"DEP-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),project:f.get("project"),category:f.get("category"),label:f.get("label"),amount:+f.get("amount")||0,paymentMode:f.get("paymentMode"),reference:f.get("reference")||"",status:f.get("status"),note:f.get("note")||"",owner:r?.owner||user.username,updatedBy:user.username,updatedAt:new Date().toISOString()};
  const before=r?cloneRecord(r):null;if(r)Object.assign(r,obj);else{obj.createdAt=new Date().toISOString();db.expenses.push(obj);}
  audit(r?"Modification dépense":"Création dépense","expenses",obj.id,`${obj.label} — ${money(obj.amount)}`,before,cloneRecord(obj));save();if(typeof cloudWriteGeneric==="function")cloudWriteGeneric("expenses",obj,"Nouvelle dépense");expensesPage();
 };
}
function deleteExpense(id){
 const r=expenseRows().find(x=>String(x.id)===String(id));if(!r)return;
 if(!confirm("Supprimer cette dépense ?"))return;
 const before=cloneRecord(r),actor=effectiveUserIdentity();r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=actor.label||actor.username||user.username;r.updatedAt=r.deletedAt;audit("Suppression dépense","expenses",r.id,r.label||"",before,cloneRecord(r));save();expensesPage();
}

function caisseNav(active="journal"){
 const btn=(key,label,fn)=>`<button class="btn ${active===key?"primary":"secondary"}" onclick="${fn}">${label}</button>`;
 return `<div class="panel caisse-hub"><h3>💵 MODULE CAISSE</h3><div class="panel-body form-actions">${btn("journal","Vue générale / Journal","cashPage()")}${btn("appro","Demandes & Approvisionnements","approPage()")}${btn("expenses","Dépenses caisse","expensesPage()")}${btn("treasury","Trésorerie","cashTreasuryPage()")}</div></div>`;
}
function cashTreasuryPage(){generic("treasury");const c=document.getElementById("content");if(c)c.innerHTML=caisseNav("treasury")+c.innerHTML;}
function approPage(){
 db.requests=Array.isArray(db.requests)?db.requests:[];
 db.appro=Array.isArray(db.appro)?db.appro:[];
 const ctx=currentProjectContext();
 const req=db.requests.filter(x=>!x.deleted&&(!ctx||String(x.project)===String(ctx))).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const aps=db.appro.filter(x=>!x.deleted&&x.status==="Validée"&&(!ctx||String(x.project)===String(ctx))).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 $("#content").innerHTML=`${caisseNav("appro")}${projectContextNotice()}<div class="panel"><h3>${user.role==="ADMIN"?"APPROVISIONNEMENT CAISSE":"DEMANDE D’APPROVISIONNEMENT"}</h3>
 <div class="panel-body"><button class="btn primary" onclick="approForm()">+ ${user.role==="ADMIN"?"Nouvel approvisionnement":"Nouvelle demande"}</button>
 <div class="notice">APPRO. CAISSE = entrée de fonds destinée au fonctionnement d’un chantier. Ce n’est pas une dépense.</div></div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Montant</th><th>Motif</th><th>Mode</th><th>Référence</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${req.length?req.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td><b>${money(r.amount||0)}</b></td><td>${esc(r.purpose||r.note||"")}</td><td>${esc(r.paymentMode||"")}</td><td>${esc(r.reference||"")}</td><td>${workflowBadge(r.status||"En attente")}</td><td><div class="edit-actions">${user.role==="ADMIN"&&r.status==="En attente"?`<button class="btn-xs btn-edit" onclick="validateApproRequest('${r.id}',true)">Valider</button><button class="btn-xs btn-delete" onclick="validateApproRequest('${r.id}',false)">Rejeter</button>`:r.status==="En attente"?`<button class="btn-xs btn-edit" onclick="approForm('${r.id}')">Modifier</button>`:""}</div></td></tr>`).join(""):`<tr><td colspan="8">Aucune demande.</td></tr>`}
 </tbody></table></div></div>
 ${user.role==="ADMIN"?`<div class="panel" style="margin-top:12px"><h3>APPROVISIONNEMENTS VALIDÉS</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Montant</th><th>Motif</th><th>Mode</th><th>Référence</th></tr></thead><tbody>${aps.length?aps.map(a=>`<tr><td>${esc(a.date||"")}</td><td>${esc(projectLabel(a.project))}</td><td><b>${money(a.amount||0)}</b></td><td>${esc(a.purpose||a.note||"")}</td><td>${esc(a.paymentMode||"")}</td><td>${esc(a.reference||"")}</td></tr>`).join(""):`<tr><td colspan="6">Aucun approvisionnement validé.</td></tr>`}</tbody></table></div></div>`:""}`;
}
function approForm(id=""){
 const r=id?(db.requests||[]).find(x=>String(x.id)===String(id)):null;
 const project=r?.project||currentProjectContext()||"";
 $("#content").innerHTML=`<div class="panel"><h3>${user.role==="ADMIN"?"NOUVEL APPROVISIONNEMENT":"DEMANDE D’APPROVISIONNEMENT"}</h3><form id="fAppro" class="form-grid">
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required><option value="">Choisir</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label>
 <label>Montant (Ar)<input name="amount" type="number" min="1" step="1" value="${+r?.amount||""}" required></label>
 <label>Motif<input name="purpose" value="${esc(r?.purpose||r?.note||"")}" required></label>
 <label>Mode<select name="paymentMode">${["Espèces","Virement","Mobile Money","Chèque","Autre"].map(x=>`<option ${r?.paymentMode===x?"selected":""}>${x}</option>`).join("")}</select></label>
 <label>Référence<input name="reference" value="${esc(r?.reference||"")}"></label>
 <label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="approPage()">Annuler</button></div></form></div>`;
 $("#fAppro").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString();
  if(user.role==="ADMIN"){
   const obj={id:"APP-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),project:f.get("project"),amount:+f.get("amount")||0,purpose:f.get("purpose"),paymentMode:f.get("paymentMode"),reference:f.get("reference")||"",note:f.get("note")||"",status:"Validée",owner:user.username,createdAt:now,updatedAt:now};
   db.appro.push(obj);audit("Création approvisionnement caisse","appro",obj.id,`${projectLabel(obj.project)} — ${money(obj.amount)}`,null,obj);save();if(typeof cloudWriteGeneric==="function")cloudWriteGeneric("appro",obj);approPage();return;
  }
  const obj={id:r?.id||"DEM-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),project:f.get("project"),amount:+f.get("amount")||0,purpose:f.get("purpose"),paymentMode:f.get("paymentMode"),reference:f.get("reference")||"",note:f.get("note")||"",status:r?.status||"En attente",owner:r?.owner||user.username,updatedBy:user.username,updatedAt:now};
  const before=r?cloneRecord(r):null;if(r)Object.assign(r,obj);else{obj.createdAt=now;db.requests.push(obj);}
  audit(r?"Modification demande approvisionnement":"Création demande approvisionnement","requests",obj.id,`${projectLabel(obj.project)} — ${money(obj.amount)}`,before,obj);save();if(typeof cloudWriteGeneric==="function")cloudWriteGeneric("requests",obj,"Nouvelle demande d’approvisionnement");approPage();
 };
}
function validateApproRequest(id,accept){
 if(user.role!=="ADMIN")return;
 const r=(db.requests||[]).find(x=>String(x.id)===String(id));if(!r)return;
 const now=new Date().toISOString();
 if(accept){
  r.status="Validée";r.validatedAt=now;r.validatedBy=user.username;r.updatedAt=now;
  if(!r.linkedApproId){
   const a={id:"APP-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:r.date,project:r.project,amount:+r.amount||0,purpose:r.purpose||r.note||"",paymentMode:r.paymentMode||"",reference:r.reference||"",note:r.note||"",status:"Validée",sourceRequestId:r.id,owner:user.username,createdAt:now,updatedAt:now};
   r.linkedApproId=a.id;db.appro.push(a);if(typeof cloudWriteGeneric==="function")cloudWriteGeneric("appro",a);
  }
 }else{r.status="Rejetée";r.rejectedAt=now;r.rejectedBy=user.username;r.updatedAt=now;}
 audit(accept?"Validation demande approvisionnement":"Rejet demande approvisionnement","requests",r.id,`${projectLabel(r.project)} — ${money(r.amount)}`,null,cloneRecord(r));save();if(typeof cloudWriteGeneric==="function")cloudWriteGeneric("requests",r);approPage();
}

function payrollActualMovements(projectId=""){
 const out=[];
 (db.modules?.payroll||[]).filter(p=>!p.deleted&&(!projectId||String(p.project)===String(projectId))).forEach(p=>{
  const legacy=(p.advancePaid===undefined&&p.balancePaid===undefined);
  if(legacy){
   if(p.workflow!=="En attente"){
    const amt=+p.netPaid||+p.grossAmount||0;
    if(amt)out.push({date:p.date||p.createdAt?.slice(0,10)||"",project:p.project,type:"Sortie",source:"Paie",label:`Salaire ${p.employeeName||""} — ${p.periodLabel||""}`,amount:amt,reference:p.id});
   }
   return;
  }
  if(p.advancePaid&&+p.advanceAmount>0)out.push({date:p.advanceDate||p.date||"",project:p.project,type:"Sortie",source:"Avance salaire",label:`Avance ${p.employeeName||""} — ${p.periodLabel||""}`,amount:+p.advanceAmount,reference:p.id});
  if(p.balancePaid&&+p.balanceAmount>0)out.push({date:p.balanceDate||p.date||"",project:p.project,type:"Sortie",source:"Solde salaire",label:`Solde ${p.employeeName||""} — ${p.periodLabel||""}`,amount:+p.balanceAmount,reference:p.id});
 });
 return out;
}
function cashMovements(projectId=""){
 const rows=[];
 (db.appro||[]).filter(a=>!a.deleted&&a.status==="Validée"&&(!projectId||String(a.project)===String(projectId))).forEach(a=>rows.push({date:a.date||"",project:a.project,type:"Entrée",source:"Appro caisse",label:a.purpose||a.note||"Approvisionnement",amount:+a.amount||0,reference:a.reference||a.id}));
 expenseRows().filter(e=>e.status!=="En attente"&&(!projectId||String(e.project)===String(projectId))).forEach(e=>rows.push({date:e.date||"",project:e.project,type:"Sortie",source:"Dépense",label:e.label||e.category||"Dépense",amount:+e.amount||0,reference:e.reference||e.id}));
 rows.push(...payrollActualMovements(projectId));
 return rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function cashPage(){
 const ctx=currentProjectContext(),rows=cashMovements(ctx);
 let running=0;
 const rendered=rows.map(r=>{running+=r.type==="Entrée"?+r.amount:-r.amount;return {...r,balance:running};});
 const totalIn=rows.filter(r=>r.type==="Entrée").reduce((n,r)=>n+r.amount,0),totalOut=rows.filter(r=>r.type==="Sortie").reduce((n,r)=>n+r.amount,0);
 $("#content").innerHTML=`${caisseNav("journal")}${projectContextNotice()}<div class="kpis">${kpi("⬇","green","ENTRÉES CAISSE",money(totalIn))}${kpi("⬆","orange","SORTIES CAISSE",money(totalOut))}${kpi("💵","blue","SOLDE CAISSE",money(totalIn-totalOut))}</div>
 <div class="panel"><h3>CAISSE — JOURNAL DES MOUVEMENTS</h3><div class="notice">La caisse est calculée automatiquement à partir des approvisionnements validés, dépenses payées et paiements de personnel.</div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Type</th><th>Source</th><th>Libellé</th><th>Entrée</th><th>Sortie</th><th>Solde progressif</th><th>Référence</th></tr></thead><tbody>
 ${rendered.length?rendered.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${r.type}</td><td>${esc(r.source)}</td><td>${esc(r.label)}</td><td>${r.type==="Entrée"?money(r.amount):""}</td><td>${r.type==="Sortie"?money(r.amount):""}</td><td><b>${money(r.balance)}</b></td><td>${esc(r.reference||"")}</td></tr>`).join(""):`<tr><td colspan="9">Aucun mouvement de caisse.</td></tr>`}
 </tbody></table></div></div>`;
}


// ===== EMPLOYÉS & PAIE V4.5.5 =====
function employeeRows(){
 db.modules.employees=Array.isArray(db.modules.employees)?db.modules.employees:[];
 return db.modules.employees.filter(r=>!r.deleted);
}
function payrollRows(){
 db.modules.payroll=Array.isArray(db.modules.payroll)?db.modules.payroll:[];
 return db.modules.payroll.filter(r=>!r.deleted);
}
function employeeName(e){return e?.name||e?.values?.[0]||"";}
function employeeCategory(e){return e?.category||e?.values?.[1]||"";}
function employeeRole(e){return e?.jobTitle||e?.values?.[2]||"";}
function employeePayCycle(e){return e?.payCycle||e?.values?.[3]||"Hebdomadaire";}
function employeeBaseSalary(e){return +(e?.baseSalary||e?.values?.[4]||0);}
function employeeProject(e){return e?.project||e?.values?.[5]||"";}
function employeeMatricule(e){return e?.matricule||e?.employeeNo||"";}
const EMPLOYEE_JOB_CODES={
 "Chef d’équipe":"CE",
 "Chef de chantier":"CC",
 "Maçon":"MC",
 "Manœuvre":"MN",
 "Ouvrier":"OV",
 "Coffreur":"CF",
 "Ferrailleur":"FR",
 "Électricien":"EL",
 "Plombier":"PL",
 "Chauffeur":"CH",
 "Magasinier":"MG",
 "Technicien":"TC",
 "Contrôleur":"CT",
 "Gestionnaire":"GE",
 "Commissionnaire":"CM"
};
function employeeJobCode(jobTitle){
 const title=String(jobTitle||"").trim();
 if(EMPLOYEE_JOB_CODES[title])return EMPLOYEE_JOB_CODES[title];
 const normalized=title.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z ]/g," ").trim();
 const parts=normalized.split(/\s+/).filter(Boolean);
 if(!parts.length)return "EM";
 if(parts.length===1)return parts[0].slice(0,2).toUpperCase().padEnd(2,"X");
 return (parts[0][0]+parts[1][0]).toUpperCase();
}
function nextEmployeeMatricule(jobTitle,excludeId=""){
 const prefix=employeeJobCode(jobTitle);
 let max=0;
 employeeRows().forEach(emp=>{
  if(excludeId&&String(emp.id)===String(excludeId))return;
  const m=String(employeeMatricule(emp)||"").toUpperCase();
  const hit=m.match(new RegExp("^"+prefix+"(\\d{3,})$"));
  if(hit)max=Math.max(max,parseInt(hit[1],10)||0);
 });
 return prefix+String(max+1).padStart(3,"0");
}
function ensureEmployeeMatricules(){
 const rows=employeeRows();let anyChanged=false,changedRows=[];
 rows.forEach(emp=>{
  let rowChanged=false;const old=String(employeeMatricule(emp)||"").trim(),prefix=employeeJobCode(employeeRole(emp));
  if(!old){emp.matricule=nextEmployeeMatricule(employeeRole(emp),emp.id);rowChanged=true;}
  else{const legacy=old.match(/^(\d{1,4})[A-Za-zÀ-ÿ]+$/);if(legacy&&!old.toUpperCase().startsWith(prefix)){emp.matricule=prefix+String(parseInt(legacy[1],10)||0).padStart(3,"0");emp.matriculeLegacy=old;emp.matriculeNormalizedAt=new Date().toISOString();rowChanged=true;}}
  if(rowChanged){emp.updatedAt=new Date().toISOString();anyChanged=true;changedRows.push(emp);}
 });
 if(anyChanged){save();changedRows.forEach(emp=>cloudWriteGeneric("employees",emp,"Normalisation matricule employé"));}
}

function employeesPage(){
 ensureEmployeeMatricules();
 const ctx=currentProjectContext();
 const rows=employeeRows().filter(e=>!ctx||String(employeeProject(e))===String(ctx));
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>EMPLOYÉS</h3>
 <div class="panel-body"><button class="btn primary" onclick="employeeForm()">+ Nouvel employé</button>
 <div class="notice">Séparer clairement l’équipe terrain et le staff. Chaque employé peut être payé par semaine ou par mois.</div></div>
 <div class="table-wrap"><table><thead><tr><th>Matricule</th><th>Nom</th><th>Catégorie</th><th>Poste</th><th>Chantier</th><th>Mode de paie</th><th>Salaire de base</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(e=>{
   const pr=(db.projects||[]).find(p=>String(p.id)===String(employeeProject(e)));
   return `<tr><td><b>${esc(employeeMatricule(e))}</b></td><td><b>${esc(employeeName(e))}</b></td><td>${esc(employeeCategory(e))}</td><td>${esc(employeeRole(e))}</td><td>${esc(pr?.name||employeeProject(e)||"Non affecté")}</td><td>${esc(employeePayCycle(e))}</td><td>${money(employeeBaseSalary(e))}</td><td>${workflowBadge(e.workflow||"Actif")}</td><td><div class="edit-actions"><button class="btn-xs" onclick="employeeBadge('${e.id}')">Badge QR</button><button class="btn-xs btn-edit" onclick="employeeForm('${e.id}')">Modifier</button><button class="btn-xs" onclick="payrollForm('', '${e.id}')">Payer</button><button class="btn-xs btn-delete" onclick="deleteEmployee('${e.id}')">Supprimer</button></div></td></tr>`;
 }).join(""):`<tr><td colspan="9">Aucun employé.</td></tr>`}
 </tbody></table></div></div>`;
}

function employeeForm(id=""){
 const e=id?employeeRows().find(x=>String(x.id)===String(id)):null;
 // V4.7.4: always prefill edit form from both modern fields and legacy values[]
 const existingName=e?employeeName(e):"";
 const existingRole=e?employeeRole(e):"";
 const existingPayCycle=e?employeePayCycle(e):"Hebdomadaire";
 const existingBaseSalary=e?employeeBaseSalary(e):0;
 const category=(e?employeeCategory(e):"")||"Équipe terrain";
 const project=(e?employeeProject(e):"")||currentProjectContext()||"";
 $("#content").innerHTML=`<div class="panel"><h3>${e?"MODIFIER":"NOUVEL"} EMPLOYÉ</h3><form id="fEmployee" class="form-grid">
 <label>Nom et prénom<input name="name" value="${esc(existingName)}" required></label>
 <label>Matricule<input id="employeeMatriculePreview" value="${esc(employeeMatricule(e)||(e?nextEmployeeMatricule(employeeRole(e),e.id):"Généré après choix du poste"))}" readonly><small>Généré automatiquement selon la fonction et conservé définitivement.</small></label>
 <label>Photo employé (optionnel)<input name="photo" type="file" accept="image/*" capture="user"><small>${e?.photoData?"Photo enregistrée — choisir une nouvelle image pour la remplacer.":"Cadre photo vide si aucune image n’est choisie."}</small></label>
 <label>Catégorie<select name="category" id="employeeCategory" onchange="updateEmployeeRoleOptions()">
   <option ${category==="Équipe terrain"?"selected":""}>Équipe terrain</option>
   <option ${category==="Staff"?"selected":""}>Staff</option>
 </select></label>
 <label>Poste<select name="jobTitle" id="employeeRole" onchange="updateEmployeeMatriculePreview()"></select></label>
 <label>Chantier<select name="project"><option value="">Non affecté / Multi-chantiers</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label>
 <label>Mode de paiement<select name="payCycle">
   <option ${existingPayCycle==="Hebdomadaire"?"selected":""}>Hebdomadaire</option>
   <option ${existingPayCycle==="Mensuel"?"selected":""}>Mensuel</option>
 </select></label>
 <label>Salaire de base (Ar)<input name="baseSalary" type="number" min="0" step="1" value="${existingBaseSalary||""}" required></label>
 <label>Date d'entrée<input name="startDate" type="date" value="${esc(e?.startDate||new Date().toISOString().slice(0,10))}"></label>
 <label>Statut<select name="workflow"><option ${e?.workflow==="Actif"?"selected":""}>Actif</option><option ${e?.workflow==="Inactif"?"selected":""}>Inactif</option></select></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="employeesPage()">Annuler</button></div>
 </form></div>`;
 document.getElementById("fEmployee").dataset.employeeId=e?.id||"";
 updateEmployeeRoleOptions(existingRole);
 $("#fEmployee").onsubmit=async ev=>{
  ev.preventDefault();const f=new FormData(ev.target);const photoFile=f.get("photo");let photoData=e?.photoData||"";
  if(photoFile&&photoFile.size){try{photoData=await compressEmployeePhoto(photoFile);}catch(err){console.error(err);alert("Impossible de traiter la photo. Le badge sera créé sans nouvelle photo.");}}
  const selectedJob=f.get("jobTitle");
  const permanentMatricule=e?.matricule||nextEmployeeMatricule(selectedJob,e?.id||"");
  const obj={...(e||{}),id:e?.id||"EMP-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),matricule:permanentMatricule,qrToken:e?.qrToken||("QR"+Date.now().toString(36)+Math.random().toString(36).slice(2,10)).toUpperCase(),name:f.get("name"),category:f.get("category"),jobTitle:selectedJob,project:f.get("project")||"",payCycle:f.get("payCycle"),baseSalary:+f.get("baseSalary")||0,startDate:f.get("startDate")||e?.startDate||"",workflow:f.get("workflow")||e?.workflow||"Actif",owner:e?.owner||user.username,updatedBy:user.username,updatedAt:new Date().toISOString(),photoData:photoData};
  const before=e?cloneRecord(e):null;if(e)Object.assign(e,obj);else{obj.createdAt=new Date().toISOString();db.modules.employees.push(obj);}
  audit(e?"Modification employé":"Création employé","employees",obj.id,obj.name,before,cloneRecord(obj));save();cloudWriteGeneric("employees",obj,e?"Modification employé":"Création employé");employeeBadge(obj.id);
 };
}
function updateEmployeeRoleOptions(selected=""){
 const cat=document.getElementById("employeeCategory")?.value||"Équipe terrain",el=document.getElementById("employeeRole");if(!el)return;
 const opts=cat==="Staff"?["Contrôleur","Gestionnaire","Commissionnaire","Technicien","Magasinier"]:["Chef de chantier","Chef d’équipe","Maçon","Ouvrier","Manœuvre","Coffreur","Ferrailleur","Électricien","Plombier","Chauffeur"];
 el.innerHTML=opts.map(x=>`<option ${x===selected?"selected":""}>${x}</option>`).join("");
 updateEmployeeMatriculePreview();
}
function updateEmployeeMatriculePreview(){
 const field=document.getElementById("employeeMatriculePreview"),role=document.getElementById("employeeRole");if(!field||!role)return;
 const form=document.getElementById("fEmployee");
 const editingId=form?.dataset?.employeeId||"";
 const existing=editingId?employeeRows().find(x=>String(x.id)===String(editingId)):null;
 field.value=employeeMatricule(existing)||nextEmployeeMatricule(role.value,editingId);
}
function deleteEmployee(id){
 const e=employeeRows().find(x=>String(x.id)===String(id));if(!e)return;
 if(!confirm("Supprimer cet employé ?"))return;const before=cloneRecord(e),actor=effectiveUserIdentity();
 e.deleted=true;e.deletedAt=new Date().toISOString();e.deletedBy=actor.label||actor.username||user.username;e.updatedAt=e.deletedAt;audit("Suppression employé","employees",e.id,e.name||"",before,cloneRecord(e));save();employeesPage();
}

function employeeAdvancesTotal(employeeId,excludePayrollId=""){
 return payrollRows().filter(p=>String(p.employeeId)===String(employeeId)&&String(p.id)!==String(excludePayrollId)&&!p.deleted)
  .reduce((n,p)=>n+(p.advancePaid?+p.advanceAmount||0:0),0);
}
function payrollPage(){
 const ctx=currentProjectContext();
 const rows=payrollRows().filter(p=>!ctx||String(p.project)===String(ctx));
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>PAIE</h3>
 <div class="panel-body"><button class="btn primary" onclick="payrollForm()">+ Nouvelle période de paie</button>
 <div class="notice">L’avance et le solde sont deux sorties distinctes. Une avance déjà versée ne doit jamais être comptée une deuxième fois au paiement final.</div></div>
 <div class="table-wrap"><table><thead><tr><th>Employé</th><th>Poste</th><th>Chantier</th><th>Période</th><th>Salaire dû</th><th>Avance versée</th><th>Solde payé</th><th>Total payé</th><th>Reste</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(p=>{
  const e=employeeRows().find(x=>String(x.id)===String(p.employeeId)),gross=+p.grossAmount||0;
  const legacy=(p.advancePaid===undefined&&p.balancePaid===undefined);
  const adv=legacy?0:(p.advancePaid?+p.advanceAmount||0:0);
  const bal=legacy?(p.workflow!=="En attente"?+p.netPaid||gross:0):(p.balancePaid?+p.balanceAmount||0:0);
  const paid=adv+bal,remain=Math.max(0,gross-paid);
  return `<tr><td><b>${esc(employeeName(e)||p.employeeName||"")}</b></td><td>${esc(employeeRole(e)||p.jobTitle||"")}</td><td>${esc(projectLabel(p.project))}</td><td>${esc(p.periodLabel||p.payCycle||"")}</td><td>${money(gross)}</td><td>${money(adv)}</td><td>${money(bal)}</td><td><b>${money(paid)}</b></td><td>${money(remain)}</td><td>${workflowBadge(p.workflow||"En attente")}</td><td><div class="edit-actions"><button class="btn-xs btn-edit" onclick="payrollForm('${p.id}','${p.employeeId}')">Modifier</button><button class="btn-xs btn-delete" onclick="deletePayroll('${p.id}')">Supprimer</button></div></td></tr>`;
 }).join(""):`<tr><td colspan="11">Aucune paie enregistrée.</td></tr>`}
 </tbody></table></div></div>`;
}
function payrollForm(id="",employeeId=""){
 const p=id?payrollRows().find(x=>String(x.id)===String(id)):null;
 const eid=p?.employeeId||employeeId||"",e=employeeRows().find(x=>String(x.id)===String(eid));
 const payCycle=p?.payCycle||employeePayCycle(e)||"Hebdomadaire",salary=+p?.grossAmount||employeeBaseSalary(e)||0;
 const project=p?.project||employeeProject(e)||currentProjectContext()||"";
 const legacy=p&&(p.advancePaid===undefined&&p.balancePaid===undefined);
 const legacyBalance=legacy&&p.workflow!=="En attente"?(+p.netPaid||salary):0;
 $("#content").innerHTML=`<div class="panel"><h3>${p?"MODIFIER":"NOUVELLE"} PAIE</h3><form id="fPayroll" class="form-grid">
 <label>Employé<select name="employeeId" id="payEmployee" required onchange="payrollEmployeeChanged(this.value)"><option value="">Choisir</option>${employeeRows().filter(x=>x.workflow!=="Inactif").map(x=>`<option value="${esc(x.id)}" ${String(eid)===String(x.id)?"selected":""}>${esc(employeeName(x))} — ${esc(employeeRole(x))}</option>`).join("")}</select></label>
 <label>Chantier<select name="project" required><option value="">Choisir</option>${(db.projects||[]).filter(x=>!x.deleted).map(x=>`<option value="${esc(x.id)}" ${String(project)===String(x.id)?"selected":""}>${esc(x.id)} — ${esc(x.name||"")}</option>`).join("")}</select></label>
 <label>Catégorie<input id="payCategory" value="${esc(employeeCategory(e)||"")}" readonly></label>
 <label>Poste<input id="payRole" value="${esc(employeeRole(e)||"")}" readonly></label>
 <label>Mode de paiement<input name="payCycle" id="payCycle" value="${esc(payCycle)}" readonly></label>
 <label>Période<select name="periodType" id="periodType"><option value="Semaine" ${payCycle==="Hebdomadaire"?"selected":""}>Semaine</option><option value="Mois" ${payCycle==="Mensuel"?"selected":""}>Mois</option></select></label>
 <label>Libellé période<input name="periodLabel" value="${esc(p?.periodLabel||"")}" placeholder="${payCycle==="Hebdomadaire"?"Ex: Semaine 30 / 2026":"Ex: Juillet 2026"}" required></label>
 <label>Salaire dû pour la période (Ar)<input name="grossAmount" id="grossAmount" type="number" min="0" value="${salary||""}" oninput="recalcPayrollV456()" required></label>
 <label class="checkline"><input name="advancePaid" id="advancePaid" type="checkbox" ${p?.advancePaid?"checked":""} onchange="recalcPayrollV456()"> Avance déjà versée</label>
 <label>Date avance<input name="advanceDate" type="date" value="${esc(p?.advanceDate||"")}"></label>
 <label>Montant avance (Ar)<input name="advanceAmount" id="advanceAmount" type="number" min="0" value="${+p?.advanceAmount||0}" oninput="recalcPayrollV456()"></label>
 <label class="checkline"><input name="balancePaid" id="balancePaid" type="checkbox" ${(p?.balancePaid||legacyBalance>0)?"checked":""} onchange="recalcPayrollV456()"> Solde payé</label>
 <label>Date paiement solde<input name="balanceDate" type="date" value="${esc(p?.balanceDate||p?.date||"")}"></label>
 <label>Montant solde payé (Ar)<input name="balanceAmount" id="balanceAmount" type="number" min="0" value="${+p?.balanceAmount||legacyBalance||0}" oninput="recalcPayrollV456()"></label>
 <label>Total réellement payé<input id="payrollTotalPaid" value="0" readonly></label>
 <label>Reste salaire<input id="payrollRemaining" value="0" readonly></label>
 <label>Statut<input id="payrollStatus" value="" readonly></label>
 <label class="full">Observation<textarea name="note">${esc(p?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="payrollPage()">Annuler</button></div></form></div>`;
 recalcPayrollV456();
 $("#fPayroll").onsubmit=ev=>{
  ev.preventDefault();const f=new FormData(ev.target),emp=employeeRows().find(x=>String(x.id)===String(f.get("employeeId")));if(!emp)return alert("Choisir un employé.");
  const gross=+f.get("grossAmount")||0,advancePaid=!!f.get("advancePaid"),balancePaid=!!f.get("balancePaid"),advance=advancePaid?(+f.get("advanceAmount")||0):0,balance=balancePaid?(+f.get("balanceAmount")||0):0;
  if(advance+balance>gross+0.01)return alert("Avance + solde ne peut pas dépasser le salaire dû.");
  if(advancePaid&&!f.get("advanceDate"))return alert("Veuillez renseigner la date de l’avance.");
  if(balancePaid&&!f.get("balanceDate"))return alert("Veuillez renseigner la date du paiement du solde.");
  const paid=advance+balance,remain=Math.max(0,gross-paid),workflow=paid<=0?"En attente":remain<=0.01?"Payé":"Partiel";
  const obj={id:p?.id||"PAY-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),employeeId:emp.id,employeeName:employeeName(emp),category:employeeCategory(emp),jobTitle:employeeRole(emp),project:f.get("project"),payCycle:employeePayCycle(emp),periodType:f.get("periodType"),periodLabel:f.get("periodLabel"),grossAmount:gross,advancePaid,advanceDate:f.get("advanceDate")||"",advanceAmount:advance,balancePaid,balanceDate:f.get("balanceDate")||"",balanceAmount:balance,totalPaid:paid,remainingSalary:remain,workflow,note:f.get("note")||"",owner:p?.owner||user.username,updatedBy:user.username,updatedAt:new Date().toISOString()};
  if(p)Object.assign(p,obj);else{obj.createdAt=new Date().toISOString();db.modules.payroll.push(obj);}
  save();payrollPage();
 };
}
function payrollEmployeeChanged(id){
 const e=employeeRows().find(x=>String(x.id)===String(id));if(!e)return;
 document.getElementById("payCategory").value=employeeCategory(e);document.getElementById("payRole").value=employeeRole(e);document.getElementById("payCycle").value=employeePayCycle(e);document.getElementById("grossAmount").value=employeeBaseSalary(e);
 const pt=document.getElementById("periodType");if(pt)pt.value=employeePayCycle(e)==="Mensuel"?"Mois":"Semaine";recalcPayrollV456();
}
function recalcPayrollV456(){
 const gross=+document.getElementById("grossAmount")?.value||0;
 const adv=document.getElementById("advancePaid")?.checked?(+document.getElementById("advanceAmount")?.value||0):0;
 const bal=document.getElementById("balancePaid")?.checked?(+document.getElementById("balanceAmount")?.value||0):0;
 const paid=adv+bal,remain=Math.max(0,gross-paid);
 const t=document.getElementById("payrollTotalPaid"),r=document.getElementById("payrollRemaining"),s=document.getElementById("payrollStatus");
 if(t)t.value=paid.toFixed(0);if(r)r.value=remain.toFixed(0);if(s)s.value=paid<=0?"En attente":remain<=0.01?"Payé":"Partiel";
}
function deletePayroll(id){
 const p=payrollRows().find(x=>String(x.id)===String(id));if(!p)return;
 if(!confirm("Supprimer cette paie ?"))return;p.deleted=true;p.deletedAt=new Date().toISOString();p.deletedBy=user.username;save();payrollPage();
}



// ===== ENCAISSEMENTS CLIENTS V4.6.0 =====
function clientReceiptsPage(){
 sessionStorage.removeItem("nysoa_receipt_form_project");
 const ctx=currentProjectContext();
 const rows=receiptRows().filter(r=>!ctx||String(r.project)===String(ctx)).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const received=rows.filter(r=>r.status==="Validé").reduce((n,r)=>n+(+r.amount||0),0);
 const pending=rows.filter(r=>r.status==="En attente").reduce((n,r)=>n+(+r.amount||0),0);
 $("#content").innerHTML=`${projectContextNotice()}<div class="kpis">
  ${kpi("💳","green","ENCAISSÉ VALIDÉ",money(received))}
  ${kpi("⏳","orange","EN ATTENTE",money(pending))}
  ${kpi("📄","blue","FACTURÉ",money(totalInvoiced(ctx)))}
  ${kpi("⚠","purple","CRÉANCE",money(Math.max(0,totalInvoiced(ctx)-received)))}
 </div>
 <div class="panel"><h3>ENCAISSEMENTS CLIENTS</h3>
 <div class="panel-body">
  <button class="btn primary" onclick="clientReceiptForm()">+ Nouvel encaissement</button>
  <div class="notice">Un encaissement = argent réellement reçu du client. Il ne doit pas être confondu avec la facturation.</div>
 </div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Client</th><th>Facture</th><th>Montant reçu</th><th>Mode</th><th>Référence</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(r.client||"")}</td><td>${esc(r.invoiceId||"")}</td><td><b>${money(r.amount||0)}</b></td><td>${esc(r.paymentMode||"")}</td><td>${esc(r.reference||"")}</td><td>${workflowBadge(r.status||"En attente")}</td><td><div class="edit-actions">
 ${user.role==="ADMIN"&&r.status==="En attente"?`<button class="btn-xs btn-edit" onclick="validateClientReceipt('${r.id}',true)">Valider</button><button class="btn-xs btn-delete" onclick="validateClientReceipt('${r.id}',false)">Rejeter</button>`:""}
 ${r.status==="En attente"&&(user.role==="GESTIONNAIRE"||user.role==="ADMIN")?`<button class="btn-xs" onclick="clientReceiptForm('${r.id}')">Modifier</button>`:""}
 </div></td></tr>`).join(""):`<tr><td colspan="9">Aucun encaissement.</td></tr>`}
 </tbody></table></div></div>`;
}
function clientReceiptForm(id="",projectOverride=""){
 const r=id?receiptRows().find(x=>String(x.id)===String(id)):null;
 const project=r?.project||projectOverride||sessionStorage.getItem("nysoa_receipt_form_project")||currentProjectContext()||"";
 const inv=invoiceRows().filter(x=>!project||String(x.project)===String(project));
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEL"} ENCAISSEMENT CLIENT</h3><form id="fReceipt" class="form-grid">
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required onchange="receiptProjectChanged(this.value)"><option value="">Choisir</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label>
 <label>Facture / tranche<select name="invoiceId" onchange="receiptInvoiceChanged(this.value)"><option value="">Paiement global chantier</option>${inv.map(i=>`<option value="${esc(i.id)}" ${i.id===r?.invoiceId?"selected":""}>${esc(i.id)} — ${money(i.trancheAmount||0)}</option>`).join("")}</select></label>
 <label>Client<input name="client" id="receiptClient" value="${esc(r?.client||inv.find(i=>i.id===r?.invoiceId)?.client||"")}" required></label>
 <label>Montant reçu (Ar)<input name="amount" type="number" min="1" step="1" value="${+r?.amount||""}" required></label>
 <label>Mode<select name="paymentMode">${["Espèces","Virement","Mobile Money","Chèque","Autre"].map(x=>`<option ${r?.paymentMode===x?"selected":""}>${x}</option>`).join("")}</select></label>
 <label>Référence / reçu<input name="reference" value="${esc(r?.reference||"")}" required></label>
 <label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="sessionStorage.removeItem('nysoa_receipt_form_project');clientReceiptsPage()">Annuler</button></div></form></div>`;
 $("#fReceipt").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString();
  const project=f.get("project"),amount=+f.get("amount")||0;
  const already=totalClientReceipts(project,true)+(r?.status==="Validé"?-(+r.amount||0):0);
  if(amount<=0)return alert("Montant invalide.");
  if(already+amount>totalInvoiced(project)+0.01)return alert("L’encaissement dépasse le montant facturé pour ce chantier.");
  const obj={id:r?.id||"ENC-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),project,invoiceId:f.get("invoiceId")||"",client:f.get("client"),amount,paymentMode:f.get("paymentMode"),reference:f.get("reference"),note:f.get("note")||"",status:r?.status|| (user.role==="ADMIN"?"Validé":"En attente"),owner:r?.owner||user.username,updatedBy:user.username,updatedAt:now};
  if(r)Object.assign(r,obj);else{obj.createdAt=now;db.clientReceipts.push(obj);}
  save();clientReceiptsPage();
 };
}
function receiptProjectChanged(projectId){
 sessionStorage.setItem("nysoa_receipt_form_project",String(projectId||""));
 clientReceiptForm("",String(projectId||""));
}
function receiptInvoiceChanged(id){
 const inv=invoiceRows().find(x=>String(x.id)===String(id));
 if(inv){const el=document.getElementById("receiptClient");if(el)el.value=inv.client||"";}
}
function validateClientReceipt(id,accept){
 if(user.role!=="ADMIN")return;
 const r=receiptRows().find(x=>String(x.id)===String(id));if(!r)return;
 if(accept){
  const other=totalClientReceipts(r.project,true);
  if(other+(+r.amount||0)>totalInvoiced(r.project)+0.01)return alert("Validation impossible : le total encaissé dépasserait le montant facturé.");
  r.status="Validé";r.validatedAt=new Date().toISOString();r.validatedBy=user.username;
 }else{
  r.status="Rejeté";r.rejectedAt=new Date().toISOString();r.rejectedBy=user.username;
 }
 r.updatedAt=new Date().toISOString();save();clientReceiptsPage();
}


// ===== FACTURATION PAR CHANTIER / DEVIS VALIDÉ =====
function acceptedQuotesForProject(projectId){
 return (db.quotes||[]).filter(q=>q.status==="Accepté"&&(!projectId||String(q.project)===String(projectId)));
}
function invoiceLegacyAmount(r){return +(r?.trancheAmount||r?.values?.[2]||0)||0;}
function isClearlyGhostInvoice(r){
 if(!r||r.deleted)return false;
 const id=String(r.id||"").toUpperCase();
 const isGeneric=id.startsWith("GEN-");
 const hasStructuredIdentity=!!(r.date||r.project||r.client||r.quoteId||(+r.quoteAmount||0)>0||(+r.tranchePercent||0)>0||(+r.trancheAmount||0)>0);
 return isGeneric&&!hasStructuredIdentity;
}
function isStructuredInvoice(r){
 if(!r||r.deleted)return false;
 if(isClearlyGhostInvoice(r))return false;
 // A real invoice (especially FAC-...) must stay visible even if an older version
 // did not yet contain every V4.7.x structured field.
 const id=String(r.id||"").toUpperCase();
 if(id.startsWith("FAC-"))return true;
 return !!(r.project||r.date||r.client||r.quoteId||(+r.quoteAmount||0)>0||(+r.tranchePercent||0)>0||(+r.trancheAmount||0)>0);
}
function legacyInvoiceRows(){
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 return db.modules.invoices.filter(r=>!r.deleted&&isClearlyGhostInvoice(r));
}
function invoiceRows(){
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 return db.modules.invoices.filter(r=>isStructuredInvoice(r));
}
function quarantineLegacyInvoices(){
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 let changed=false;
 db.modules.invoices.forEach(r=>{
  if(isClearlyGhostInvoice(r)){
   if(!r.legacyQuarantined){r.legacyQuarantined=true;r.legacyReason="Ancienne donnée générique vide — exclue des calculs de facturation";r.legacyQuarantinedAt=new Date().toISOString();changed=true;}
  }else if(r.legacyQuarantined){
   // Restore a real invoice accidentally quarantined by V4.7.7.
   delete r.legacyQuarantined;delete r.legacyReason;delete r.legacyQuarantinedAt;changed=true;
  }
 });
 if(changed){saveLocalOnly();setTimeout(()=>cloudAutoSyncAll("restore-real-invoices"),1500);}
 return legacyInvoiceRows().length;
}
function legacyInvoiceReviewPage(){if(user.role!=="ADMIN")return;const rows=legacyInvoiceRows();$("#content").innerHTML=`<div class="panel"><h3>ANCIENNES DONNÉES DE FACTURATION À VÉRIFIER</h3><div class="panel-body"><button class="btn secondary" onclick="invoicesPage()">← Retour Facturation</button><div class="notice">Ces données sont isolées et ne participent plus aux totaux ni au reste à facturer.</div></div><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Ancien montant</th><th>Raison</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.id||"")}</td><td>${money(+(r.values?.[2]||r.trancheAmount||0))}</td><td>${esc(r.legacyReason||"Donnée incomplète")}</td></tr>`).join(""):'<tr><td colspan="3">Aucune ancienne donnée isolée.</td></tr>'}</tbody></table></div></div>`;}
function invoicePaidForProject(projectId,excludeId=""){
 return invoiceRows().filter(r=>String(r.project)===String(projectId)&&String(r.id)!==String(excludeId))
  .reduce((n,r)=>n+invoiceLegacyAmount(r),0);
}
function validatedQuoteAmount(projectId,quoteId=""){
 const q=quoteId?(db.quotes||[]).find(x=>x.id===quoteId):acceptedQuotesForProject(projectId).slice(-1)[0];
 return q?quoteFinancials(q).ttc:0;
}
function invoicesPage(){
 sessionStorage.removeItem("nysoa_invoice_form_project");
 if(user.role!=="ADMIN")return generic("invoices");
 const ctx=currentProjectContext();
 const rows=invoiceRows().filter(r=>!ctx||String(r.project||"")===String(ctx));
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>FACTURATION PAR CHANTIER</h3>
 <div class="panel-body"><button class="btn primary" onclick="invoiceForm()">+ Nouvelle tranche / facture</button>
 ${legacyInvoiceRows().length?`<button class="btn secondary" onclick="legacyInvoiceReviewPage()">⚠ ${legacyInvoiceRows().length} ancienne(s) donnée(s) isolée(s)</button>`:""}
 <div class="notice">Chaque facture est rattachée à un chantier. Ici, le reste signifie « reste à facturer ». Les paiements réellement reçus sont enregistrés séparément dans ENCAISSEMENTS CLIENTS.</div></div>
 <div class="table-wrap"><table><thead><tr><th>N° facture</th><th>Date</th><th>Chantier</th><th>Client</th><th>Devis validé</th><th>Montant devis</th><th>Tranche</th><th>Montant tranche</th><th>Total facturé</th><th>Reste à facturer</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>{
  const qa=+r.quoteAmount||validatedQuoteAmount(r.project,r.quoteId);
  const paid=invoiceRows().filter(x=>String(x.project)===String(r.project)).reduce((n,x)=>n+invoiceLegacyAmount(x),0);
  const remain=Math.max(0,qa-paid),pr=(db.projects||[]).find(p=>String(p.id)===String(r.project));
  return `<tr><td><b>${esc(r.id)}</b></td><td>${esc(r.date||"")}</td><td>${esc(pr?.name||r.project||"")}</td><td>${esc(r.client||r.values?.[1]||"")}</td><td>${esc(r.quoteId||"")}</td><td>${money(qa||(+r.quoteAmount||0))}</td><td><b>${(+r.tranchePercent||0).toFixed(2)}%</b></td><td>${money(invoiceLegacyAmount(r))}</td><td>${money(paid)}</td><td><b>${money(remain)}</b></td><td><div class="edit-actions"><button class="btn-xs btn-edit" onclick="invoiceForm('${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="deleteInvoice('${r.id}')">Supprimer</button></div></td></tr>`;
 }).join(""):`<tr><td colspan="11">Aucune facture pour ce chantier.</td></tr>`}
 </tbody></table></div></div>`;
}
function invoiceForm(id="",projectOverride=""){
 if(user.role!=="ADMIN")return;
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 const r=id?db.modules.invoices.find(x=>String(x.id)===String(id)):null;
 const projectId=r?.project||projectOverride||sessionStorage.getItem("nysoa_invoice_form_project")||currentProjectContext()||"",quotes=acceptedQuotesForProject(projectId);
 const selectedQuoteId=r?.quoteId||quotes.slice(-1)[0]?.id||"",selectedQuote=(db.quotes||[]).find(q=>q.id===selectedQuoteId);
 const qa=r?.quoteAmount||(selectedQuote?quoteFinancials(selectedQuote).ttc:0),pct=+r?.tranchePercent||0;
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVELLE"} FACTURATION</h3><div class="notice">Vous pouvez sélectionner un devis accepté pour remplir automatiquement les champs, ou saisir manuellement le client et le montant du devis validé.</div><form id="fInvoice" class="form-grid">
 <label>N° facture<input name="id" value="${esc(r?.id||"FAC-"+new Date().getFullYear()+"-"+String(db.modules.invoices.length+1).padStart(4,"0"))}" required></label>
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required onchange="invoiceProjectChanged(this.value)"><option value="">Choisir un chantier</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(projectId)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label>
 <label>Devis validé<select name="quoteId" onchange="invoiceQuoteChanged(this.value)"><option value="">Saisie manuelle / aucun devis lié</option>${quotes.map(q=>`<option value="${esc(q.id)}" ${q.id===selectedQuoteId?"selected":""}>${esc(q.id)} — ${money(quoteFinancials(q).ttc)}</option>`).join("")}</select></label>
 <label>Client<input name="client" id="invoiceClient" value="${esc(r?.client||selectedQuote?.client||"")}" placeholder="Nom du client" required></label>
 <label>Montant du devis validé<input name="quoteAmount" id="invoiceQuoteAmount" type="number" min="0" step="0.01" value="${+qa||0}" oninput="recalcInvoiceForm()" required></label>
 <label>Tranche de paiement (%)<input name="tranchePercent" id="invoiceTranchePercent" type="number" min="0.01" max="100" step="0.01" value="${pct||""}" oninput="recalcInvoiceForm()" required></label>
 <label>Montant de cette tranche<input name="trancheAmount" id="invoiceTrancheAmount" type="number" value="${r?.trancheAmount||((+qa||0)*pct/100)||0}" readonly></label>
 <label>Total déjà facturé avant cette tranche<input id="invoiceAlreadyPaid" value="${invoicePaidForProject(projectId,r?.id||"")}" readonly></label>
 <label>Reste à facturer après cette tranche<input id="invoiceRemaining" value="0" readonly></label>
 <label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="sessionStorage.removeItem('nysoa_invoice_form_project');invoicesPage()">Annuler</button></div></form></div>`;
 recalcInvoiceForm();
 $("#fInvoice").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),project=f.get("project"),quoteId=f.get("quoteId"),q=(db.quotes||[]).find(x=>x.id===quoteId);
  if(q&&q.status!=="Accepté")return alert("Le devis sélectionné doit être accepté.");
  const client=(f.get("client")||q?.client||"").trim(),amount=+f.get("quoteAmount")||0,pct=+f.get("tranchePercent")||0,tranche=amount*pct/100,already=invoicePaidForProject(project,r?.id||"");
  if(!client)return alert("Veuillez renseigner le client.");
  if(amount<=0)return alert("Veuillez renseigner le montant du devis validé.");
  if(already+tranche>amount+0.01)return alert("Cette tranche dépasse le reste à payer.");
  const before=r?cloneRecord(r):null,actor=effectiveUserIdentity();
  const obj={id:f.get("id"),date:f.get("date"),project,quoteId:quoteId||"",client,quoteAmount:amount,tranchePercent:pct,trancheAmount:tranche,note:f.get("note")||"",workflow:r?.workflow||"Validé",owner:r?.owner||actor.username||user.username,updatedBy:actor.label||actor.username||user.username,updatedAt:new Date().toISOString()};
  if(r)Object.assign(r,obj);else{obj.createdAt=new Date().toISOString();db.modules.invoices.push(obj);}
  audit(r?"Modification facture":"Création facture","invoices",obj.id,`${client} — ${money(tranche)}`,before,cloneRecord(obj));sessionStorage.removeItem("nysoa_invoice_form_project");save();invoicesPage();
 };
}
function invoiceProjectChanged(projectId){
 sessionStorage.setItem("nysoa_invoice_form_project",String(projectId||""));
 invoiceForm("",String(projectId||""));
}
function invoiceQuoteChanged(quoteId){
 const q=(db.quotes||[]).find(x=>x.id===quoteId);
 if(q){
  document.getElementById("invoiceClient").value=q.client||"";
  document.getElementById("invoiceQuoteAmount").value=quoteFinancials(q).ttc;
 }
 recalcInvoiceForm();
}
function recalcInvoiceForm(){
 const amount=+document.getElementById("invoiceQuoteAmount")?.value||0,pct=+document.getElementById("invoiceTranchePercent")?.value||0,already=+document.getElementById("invoiceAlreadyPaid")?.value||0,tranche=amount*pct/100;
 const ta=document.getElementById("invoiceTrancheAmount");if(ta)ta.value=tranche.toFixed(2);
 const rem=document.getElementById("invoiceRemaining");if(rem)rem.value=Math.max(0,amount-already-tranche).toFixed(2);
}
function deleteInvoice(id){
 if(user.role!=="ADMIN")return;
 const r=(db.modules.invoices||[]).find(x=>String(x.id)===String(id));if(!r)return;
 if(!confirm("Supprimer cette facture / tranche ?"))return;
 const before=cloneRecord(r),actor=effectiveUserIdentity();r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=actor.label||actor.username||user.username;r.updatedAt=r.deletedAt;
 audit("Suppression facture","invoices",r.id,"Facture/tranche supprimée",before,cloneRecord(r));save();invoicesPage();
}


const GENERIC_FIELDS={clients:["Nom / raison sociale","Téléphone","Adresse"],suppliers:["Fournisseur","Téléphone","Spécialité"],stock:["Article","Quantité","Unité"],employees:["Matricule","Nom complet","Fonction"],payroll:["Employé","Mois","Net à payer"],bank:["Référence","Libellé","Montant"],accounting:["Journal","Libellé","Montant"],treasury:["Libellé","Échéance","Montant"],planning:["Activité","Début","Fin"],situations:["Situation","Période","Avancement"],technicalFollowup:["Chantier","Travaux du jour","Observation"],quality:["Contrôle","Résultat","Observation"],nonConformities:["Référence","Description","Action corrective"],equipment:["Matériel / engin","État","Affectation"],vehicles:["Véhicule","Immatriculation","État"],fuel:["Véhicule / engin","Quantité (L)","Montant"],invoices:["N° facture","Client","Montant"]};
function generic(page){
 let label=(page==="treasury"?"TRÉSORERIE CAISSE":(menus[user.role].find(x=>x[0]===page)||ADMIN_FINANCE_MENU.concat(ADMIN_TECH_MENU).find(x=>x[0]===page)||[])[2])||page,
 fields=GENERIC_FIELDS[page]||["Référence","Désignation","Observation"],
 rows=(db.modules[page]||[]).filter(r=>!r.deleted&&matchesProjectContext(r));
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>${label}</h3><div class="panel-body">
 <button class="btn primary" onclick="genericForm('${page}')">+ Nouvelle entrée</button><button class="btn secondary" onclick="exportBackup()">Sauvegarder les données</button></div>
 <div class="table-wrap"><table><thead><tr><th>Chantier</th>${fields.map(x=>`<th>${x}</th>`).join("")}<th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr><td>${esc((db.projects||[]).find(p=>String(p.id)===String(r.project))?.name||r.project||"Non affecté")}</td>${fields.map((_,j)=>`<td>${esc(r.values[j]||"")}</td>`).join("")}<td>${workflowBadge(r.workflow)}</td><td><div class="edit-actions">${canUserChange(r)?`<button class="btn-xs btn-edit" onclick="genericFormById('${page}','${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="softDeleteGeneric('${page}','${r.id}')">Supprimer</button>`:"<span>Verrouillé</span>"}<button class="btn-xs" onclick="showGenericHistory('${page}','${r.id}')">Historique</button></div></td></tr>`).join(""):`<tr><td colspan="${fields.length+3}">Aucune donnée pour ce chantier.</td></tr>`}
 </tbody></table></div></div>`;
}
function genericForm(page,index=-1){
 let fields=GENERIC_FIELDS[page]||["Référence","Désignation","Observation"],r=index>=0?(db.modules[page]||[])[index]:null;
 if(r&&!canEditRecord(r))return alert("Cette entrée validée ne peut plus être modifiée.");
 const selectedProject=r?.project||currentProjectContext()||"";
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVELLE"} ENTRÉE</h3><form id="fGeneric" class="form-grid">
 <label>Chantier<select name="project" required><option value="">Choisir un chantier</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(selectedProject)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label>
 ${fields.map((f,i)=>`<label>${f}<input name="v${i}" value="${esc(r?.values?.[i]||"")}" required></label>`).join("")}
 <label>Statut<select name="workflow">${["Brouillon","Soumis","À corriger","Validé"].filter(x=>user.role==="ADMIN"||x!=="Validé").map(x=>`<option ${r?.workflow===x?"selected":""}>${x}</option>`).join("")}</select></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="generic('${page}')">Annuler</button></div></form></div>`;
 $("#fGeneric").onsubmit=e=>{
  e.preventDefault();let f=new FormData(e.target),obj={id:r?.id||"GEN-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),project:f.get("project"),values:fields.map((_,i)=>f.get("v"+i)),workflow:f.get("workflow"),owner:r?.owner||user.username,updatedBy:user.username,updatedAt:new Date().toISOString()};
  db.modules[page]=db.modules[page]||[];const before=r?cloneRecord(r):null;
  if(r){pushHistory(r,"Modification",before);Object.assign(r,obj);audit("Modification","modules."+page,r.id,"Entrée modifiée",before,r)}
  else{obj.createdAt=new Date().toISOString();obj.history=[];pushHistory(obj,"Création");db.modules[page].push(obj);audit("Création","modules."+page,obj.id,"Entrée créée",null,obj)}
  save();generic(page);
 };
}
function genericDelete(page,index){if(user.role!=="ADMIN")return;if(confirm("Supprimer cette entrée ?")){db.modules[page].splice(index,1);save();generic(page)}}
function exportBackup(){let blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="NYSOA_CONSTRUCT_SAUVEGARDE_"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href)}
$("#showLoginPass").onchange=e=>{
  $("#loginPass").type=e.target.checked?"text":"password";
};
$("#loginForm").onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector("button");if(btn)btn.disabled=true;await login($("#loginUser").value.trim(),$("#loginPass").value);if(btn)btn.disabled=false;}
$("#logoutBtn").onclick=async()=>{
 if(shouldWarnDailyReportLogout()){
  const fill=confirm("⚠ Votre rapport journalier d’aujourd’hui n’est pas encore envoyé à l’Admin.\n\nOK : ouvrir le rapport\nAnnuler : quitter quand même");
  if(fill){go("dailyReports");return;}
 }
 closeUsageSession("Déconnexion");sessionStorage.removeItem("nysoa_v2_user");await firebaseLogout();location.reload();
}
initFirebaseCloud();


// ===== MODULE DEVIS ADMIN PROFESSIONNEL =====
if(!Array.isArray(db.quotes)){db.quotes=[];save();}
function quoteTotal(q){return q.sections.reduce((t,s)=>t+s.items.reduce((a,i)=>a+(+i.qty||0)*(+i.pu||0),0),0)}
function quoteFinancials(q){let ht=quoteTotal(q),discount=+q.discount||0,net=Math.max(0,ht-discount),vat=q.vatEnabled?net*(+q.vatRate||0)/100:0;return{ht,discount,net,vat,ttc:net+vat}}
function quoteStatusClass(s){return s==="Accepté"?"qs-approved":s==="Refusé"?"qs-refused":s==="Envoyé"?"qs-sent":"qs-draft"}
function quotes(){
 if(user.role!=="ADMIN"){document.querySelector("#content").innerHTML='<div class="panel"><div class="panel-body"><div class="admin-only-note">Le module Devis est réservé exclusivement à l’ADMIN.</div></div></div>';return}
 document.querySelector("#content").innerHTML=`<div class="quote-toolbar"><div class="left"><button class="btn primary" onclick="quoteEditor()">+ Nouveau devis</button></div><div class="right"><input id="quoteSearch" placeholder="Rechercher client, objet ou numéro" style="width:280px;margin:0" oninput="filterQuotes()"></div></div><div class="admin-only-note"><b>Accès ADMIN uniquement.</b> Les prix unitaires, remises, TVA, montants et marges commerciales ne sont visibles par aucun autre rôle.</div><div class="quote-list-card"><div class="table-wrap"><table id="quoteList"><thead><tr><th>N° devis</th><th>Date</th><th>Chantier</th><th>Client</th><th>Objet</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${db.quotes.map(q=>{let f=quoteFinancials(q);return `<tr data-search="${(q.id+' '+q.client+' '+q.object).toLowerCase()}"><td><b>${q.id}</b></td><td>${q.date}</td><td>${esc((db.projects||[]).find(p=>String(p.id)===String(q.project))?.name||q.project||"Non affecté")}</td><td>${q.client}</td><td>${q.object}</td><td><b>${money(f.ttc)}</b></td><td><span class="quote-status ${quoteStatusClass(q.status)}">${q.status}</span></td><td><div class="edit-actions"><button class="btn-xs btn-edit" onclick="quoteEditor('${q.id}')">Ouvrir</button><button class="btn-xs btn-save" onclick="duplicateQuote('${q.id}')">Dupliquer</button><button class="btn-xs btn-delete" onclick="deleteQuote('${q.id}')">Supprimer</button></div></td></tr>`}).join("")}</tbody></table></div></div>`;
}
function filterQuotes(){let v=(document.querySelector('#quoteSearch')?.value||'').toLowerCase();document.querySelectorAll('#quoteList tbody tr').forEach(r=>r.style.display=r.dataset.search.includes(v)?'':'none')}
function newQuote(){return{id:"DEV-"+new Date().getFullYear()+"-"+String(db.quotes.length+1).padStart(3,"0"),date:new Date().toISOString().slice(0,10),validUntil:"",project:currentProjectContext()||"",client:"",clientAddress:"",clientPhone:"",object:"",status:"Brouillon",vatEnabled:false,vatRate:20,discount:0,sections:[{title:"NOUVEAU LOT",items:[{no:"1.1",designation:"",unit:"",qty:1,pu:0}]}],notes:"Arrêté le présent devis à la somme indiquée ci-dessous.",createdBy:"ADMIN"}}
let activeQuote=null;
function quoteEditor(id=""){
 if(user.role!=="ADMIN"){quotes();return}
 activeQuote=id?structuredClone(db.quotes.find(x=>x.id===id)):newQuote();renderQuoteEditor();
}
function renderQuoteEditor(){let q=activeQuote,f=quoteFinancials(q);document.querySelector('#content').innerHTML=`<div class="quote-toolbar no-print"><div class="left"><button class="btn secondary" onclick="quotes()">← Liste des devis</button><button class="btn primary" onclick="saveQuote()">Enregistrer</button><button class="btn secondary" onclick="window.print()">Imprimer / PDF</button></div><div class="right"><select onchange="activeQuote.status=this.value;renderQuoteEditor()" style="margin:0;width:150px"><option ${q.status==='Brouillon'?'selected':''}>Brouillon</option><option ${q.status==='Envoyé'?'selected':''}>Envoyé</option><option ${q.status==='Accepté'?'selected':''}>Accepté</option><option ${q.status==='Refusé'?'selected':''}>Refusé</option></select></div></div>
 <div class="quote-editor">
  <div class="quote-head"><div class="quote-company"><img src="assets/logo_nysoa_construct.png"><div class="quote-company-info"><strong>ENTREPRISE NYSOA CONSTRUCT</strong><br>Construction - Bâtiment - Génie Civil - Travaux Publics<br>Lot 0708 K Ambohimena, Antsirabe<br>Téléphone / WhatsApp : +261 34 99 498 49<br>E-mail : hhajatiana15@gmail.com<br>Facebook : Entreprise NySoa Antsirabe</div></div><div class="quote-title-box"><h1>DEVIS</h1><div class="quote-no"><input value="${q.id}" onchange="activeQuote.id=this.value" style="text-align:right;font-weight:800"></div><div style="margin-top:8px">Date : <input type="date" value="${q.date}" onchange="activeQuote.date=this.value" style="width:150px;display:inline-block"></div></div></div>
  <div class="quote-meta"><label>Client<input value="${esc(q.client)}" onchange="activeQuote.client=this.value"></label><label>Adresse<input value="${esc(q.clientAddress)}" onchange="activeQuote.clientAddress=this.value"></label><label>Téléphone<input value="${esc(q.clientPhone)}" onchange="activeQuote.clientPhone=this.value"></label><label>Validité<input type="date" value="${q.validUntil||''}" onchange="activeQuote.validUntil=this.value"></label></div>
  <div class="quote-object"><label>Chantier<select onchange="activeQuote.project=this.value"><option value="">Choisir un chantier</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(q.project||"")===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label></div>
  <div class="quote-object"><label>Objet du devis<input value="${esc(q.object)}" onchange="activeQuote.object=this.value"></label></div>
  <div class="table-wrap"><table class="quote-table"><thead><tr><th style="width:60px">N°</th><th>DÉSIGNATION</th><th style="width:90px">UNITÉ</th><th style="width:100px">QUANTITÉ</th><th style="width:145px">PU</th><th style="width:155px">PRIX TOTAL</th><th class="no-print" style="width:55px"></th></tr></thead><tbody>${q.sections.map((s,si)=>quoteSectionHtml(s,si)).join('')}</tbody></table></div>
  <div class="quote-add-row no-print"><button class="btn secondary" onclick="addQuoteSection()">+ Ajouter un lot</button><button class="btn secondary" onclick="addQuoteItem(${Math.max(0,q.sections.length-1)})">+ Ajouter une ligne</button></div>
  <div class="quote-options no-print"><label><input type="checkbox" ${q.vatEnabled?'checked':''} onchange="activeQuote.vatEnabled=this.checked;renderQuoteEditor()"> Appliquer TVA</label><label>Taux TVA (%) <input type="number" value="${q.vatRate}" onchange="activeQuote.vatRate=+this.value;renderQuoteEditor()"></label><label>REMISE saisie manuellement (Ar) <input type="number" min="0" step="1" value="${q.discount}" onchange="activeQuote.discount=Math.max(0,+this.value||0);renderQuoteEditor()"></label></div>
  <div class="quote-summary-block"><table class="quote-summary"><tr><td>REMISE</td><td>${f.discount?'- ':''}${money(f.discount)}</td></tr>${q.vatEnabled?`<tr><td>TVA (${q.vatRate}%)</td><td>${money(f.vat)}</td></tr>`:''}<tr class="grand"><td>TOTAL GÉNÉRAL</td><td>${money(f.ttc)}</td></tr></table><div class="quote-words">Arrêté le présent devis à la somme de : <strong>${money(f.ttc)}</strong> (<strong>${numberToFrenchWords(f.ttc)} ARIARY</strong>).</div></div>
  <div class="quote-signatures"><div>Le client<div class="signature-line">Nom, signature et mention « Bon pour accord »</div></div><div>Le gérant<div class="signature-line">HAJATIANA Hasiniaina Rivoherilaza</div></div></div>
 </div>`}
function quoteSectionHtml(s,si){let st=s.items.reduce((a,i)=>a+(+i.qty||0)*(+i.pu||0),0);return `<tr class="quote-section-row"><td>${roman(si+1)}</td><td colspan="5"><input value="${esc(s.title)}" onchange="activeQuote.sections[${si}].title=this.value" style="font-weight:900"></td><td class="no-print"><button class="quote-remove" onclick="removeQuoteSection(${si})">×</button></td></tr>${s.items.map((i,ii)=>`<tr><td><input class="center" value="${esc(i.no)}" onchange="activeQuote.sections[${si}].items[${ii}].no=this.value"></td><td><textarea onchange="activeQuote.sections[${si}].items[${ii}].designation=this.value">${esc(i.designation)}</textarea></td><td><input class="center" value="${esc(i.unit)}" onchange="activeQuote.sections[${si}].items[${ii}].unit=this.value"></td><td><input class="num" type="number" step="0.01" value="${i.qty}" onchange="activeQuote.sections[${si}].items[${ii}].qty=+this.value;renderQuoteEditor()"></td><td><input class="num" type="number" step="1" value="${i.pu}" onchange="activeQuote.sections[${si}].items[${ii}].pu=+this.value;renderQuoteEditor()"></td><td class="num"><b>${money((+i.qty||0)*(+i.pu||0))}</b></td><td class="no-print"><button class="quote-remove" onclick="removeQuoteItem(${si},${ii})">×</button></td></tr>`).join('')}<tr class="quote-subtotal-row"><td colspan="5" style="text-align:right">Sous-total ${esc(s.title)}</td><td class="num">${money(st)}</td><td class="no-print"><button class="btn-xs btn-edit" onclick="addQuoteItem(${si})">+</button></td></tr>`}
function addQuoteSection(){activeQuote.sections.push({title:"NOUVEAU LOT",items:[{no:(activeQuote.sections.length+1)+".1",designation:"",unit:"",qty:1,pu:0}]});renderQuoteEditor()}
function removeQuoteSection(si){if(activeQuote.sections.length===1)return alert('Le devis doit contenir au moins un lot.');activeQuote.sections.splice(si,1);renderQuoteEditor()}
function addQuoteItem(si){let s=activeQuote.sections[si];s.items.push({no:(si+1)+"."+(s.items.length+1),designation:"",unit:"",qty:1,pu:0});renderQuoteEditor()}
function removeQuoteItem(si,ii){let s=activeQuote.sections[si];if(s.items.length===1)return alert('Le lot doit contenir au moins une ligne.');s.items.splice(ii,1);renderQuoteEditor()}
function saveQuote(){if(!activeQuote.project)return alert('Veuillez choisir le chantier.');if(!activeQuote.client.trim()||!activeQuote.object.trim())return alert('Veuillez renseigner le client et l’objet du devis.');let idx=db.quotes.findIndex(x=>x.id===activeQuote.id);if(idx>=0)db.quotes[idx]=structuredClone(activeQuote);else db.quotes.push(structuredClone(activeQuote));save();alert('Devis enregistré.');quotes()}
function duplicateQuote(id){let q=structuredClone(db.quotes.find(x=>x.id===id));q.id='DEV-'+new Date().getFullYear()+'-'+String(db.quotes.length+1).padStart(3,'0');q.status='Brouillon';q.date=new Date().toISOString().slice(0,10);db.quotes.push(q);save();quotes()}
function deleteQuote(id){if(confirm('Supprimer définitivement ce devis ?')){db.quotes=db.quotes.filter(x=>x.id!==id);save();quotes()}}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function roman(n){return ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'][n]||n}
function numberToFrenchWords(value){
 const n=Math.max(0,Math.round(Number(value)||0));
 if(n===0)return "ZÉRO";
 const units=["","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize"];
 function underHundred(x){
  if(x<17)return units[x];
  if(x<20)return "dix-"+units[x-10];
  const tens=Math.floor(x/10),u=x%10;
  if(tens===7)return "soixante-"+(u===1?"et-onze":underHundred(10+u));
  if(tens===9)return "quatre-vingt-"+underHundred(10+u);
  const names={2:"vingt",3:"trente",4:"quarante",5:"cinquante",6:"soixante",8:"quatre-vingt"};
  let r=names[tens]||"";
  if(u===0)return tens===8?r+"s":r;
  return r+(u===1?" et un":"-"+units[u]);
 }
 function underThousand(x){
  if(x<100)return underHundred(x);
  const h=Math.floor(x/100),r=x%100;
  let out=h===1?"cent":units[h]+" cent";
  if(r===0)return h>1?out+"s":out;
  return out+" "+underHundred(r);
 }
 function group(x,div,singular,plural){
  const q=Math.floor(x/div),r=x%div;
  if(!q)return {text:"",rest:x};
  let t=q===1?singular:underThousand(q)+" "+plural;
  return {text:t,rest:r};
 }
 let rest=n,parts=[];
 const billion=group(rest,1000000000,"un milliard","milliards"); if(billion.text)parts.push(billion.text); rest=billion.rest;
 const million=group(rest,1000000,"un million","millions"); if(million.text)parts.push(million.text); rest=million.rest;
 if(rest>=1000){const q=Math.floor(rest/1000);parts.push(q===1?"mille":underThousand(q)+" mille");rest%=1000;}
 if(rest)parts.push(underThousand(rest));
 return parts.join(" ").toUpperCase();
}

// ===== IMPORT / EXPORT / IMPRESSION DIRECTE =====
let currentPageForData = "dashboard";
const originalGo = go;
go = function(page){ currentPageForData = page; return originalGo(page); };

function printCurrentView(){
  window.print();
}
function openImportDialog(){
  const input=document.getElementById("externalImportFile");
  if(input){ input.value=""; input.click(); }
}
function csvEscape(value){
  const s=String(value ?? "");
  return /[;"\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function downloadText(filename,text,type="text/plain;charset=utf-8"){
  const blob=new Blob(["\ufeff"+text],{type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function parseCSV(text){
  const rows=[];let row=[],cell="",quoted=false;
  text=text.replace(/^\uFEFF/,"");
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(quoted){
      if(c==='"'&&n==='"'){cell+='"';i++;}
      else if(c==='"') quoted=false;
      else cell+=c;
    }else{
      if(c==='"') quoted=true;
      else if(c===';'||c===','){row.push(cell.trim());cell="";}
      else if(c==='\n'){row.push(cell.trim());rows.push(row);row=[];cell="";}
      else if(c!=='\r') cell+=c;
    }
  }
  if(cell.length||row.length){row.push(cell.trim());rows.push(row);}
  return rows.filter(r=>r.some(v=>v!==""));
}
function exportCurrentModuleCSV(){
  const page=currentPageForData;
  const date=new Date().toISOString().slice(0,10);
  let headers=[],rows=[];
  if(page==="purchases"){
    if(user.role!=="GESTIONNAIRE")throw new Error("L’importation des achats est réservée au Gestionnaire.");
    db.modules.purchases=Array.isArray(db.modules.purchases)?db.modules.purchases:[];
    const normalized=headers.map(h=>h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""));
    const col=(...names)=>normalized.findIndex(h=>names.some(n=>h.includes(n)));
    const idx={
      ref:col("reference","référence","numero","n°"),
      date:col("date"),
      project:col("chantier","projet"),
      designation:col("designation","article","produit","libelle"),
      supplier:col("fournisseur"),
      quantity:col("quantite","qte"),
      unit:col("unite"),
      amount:col("montant","total"),
      status:col("statut","situation"),
      observation:col("observation","remarque")
    };
    dataRows.forEach((r,i)=>{
      const get=(key,fallback="")=>idx[key]>=0?r[idx[key]]:fallback;
      const id=text(get("ref"))||uniqueId("ACH",i);
      if(db.modules.purchases.some(x=>String(x.id)===id)){skipped++;return;}
      let status=text(get("status"))||"Demandé";
      if(!PURCHASE_STATUSES.includes(status))status="Demandé";
      const obj={id,date:text(get("date"))||today,project:text(get("project")),designation:text(get("designation")),supplier:text(get("supplier")),quantity:number(get("quantity")),unit:text(get("unit"))||"Unité",amount:number(get("amount")),status,workflow:status,observation:text(get("observation")),owner,updatedBy:owner,createdAt:now,updatedAt:now,history:[]};
      pushHistory(obj,"Importation Excel",null,sourceFile);db.modules.purchases.push(obj);addAudit("purchases",id);imported++;
    });
  }else if(page==="projects"){
    headers=["ID","Nom","Client","Budget","Début","Fin","Avancement","Statut"];
    rows=db.projects.map(x=>[x.id,x.name,x.client,x.budget,x.start,x.end,x.progress,x.status]);
  }else if(page==="expenses"){
    headers=["ID","Propriétaire","Workflow","Date","Chantier","Catégorie","Fournisseur","Montant","Note"];
    rows=db.expenses.map(x=>[x.id,x.owner,x.workflow,x.date,x.project,x.cat,x.supplier,x.amount,x.note]);
  }else if(page==="appro"){
    headers=["ID","Date","Chantier","Montant","Note","Statut"];
    rows=db.appro.map(x=>[x.id,x.date,x.project,x.amount,x.note,x.status]);
  }else if(page==="reports"){
    headers=["ID","Propriétaire","Workflow","Date","Chantier","Avancement","Travaux","Conformité","Problème","Action","Statut"];
    rows=db.reports.map(x=>[x.id,x.owner,x.workflow,x.date,x.project,x.progress,x.work,x.conformity,x.issue,x.action,x.status]);
  }else if(page==="quotes" && user.role==="ADMIN"){
    headers=["N° devis","Date","Validité","Client","Adresse","Téléphone","Objet","Statut","Total TTC"];
    rows=db.quotes.map(q=>[q.id,q.date,q.validUntil,q.client,q.clientAddress,q.clientPhone,q.object,q.status,quoteFinancials(q).ttc]);
  }else if(GENERIC_FIELDS[page]){
    headers=[...GENERIC_FIELDS[page],"Workflow","Propriétaire","Dernière modification"];
    rows=(db.modules[page]||[]).map(r=>[...(r.values||[]),r.workflow||"Brouillon",r.owner||"",r.updatedAt||""]);
  }else{
    return alert("Ouvrez d’abord un module de données à exporter.");
  }
  const csv=[headers,...rows].map(r=>r.map(csvEscape).join(";")).join("\n");
  downloadText(`NYSOA_${page}_${date}.csv`,csv,"text/csv;charset=utf-8");
}
async function handleExternalImport(event){
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  try{
    const name=file.name.toLowerCase();
    if(name.endsWith(".json")){
      const data=JSON.parse(await file.text());
      if(data.projects||data.expenses||data.modules||data.quotes){
        if(user.role!=="ADMIN") throw new Error("La restauration complète JSON est réservée à l’ADMIN.");
        if(!confirm("Remplacer les données actuelles par cette sauvegarde ?"))return;
        db=data;if(!db.modules)db.modules={};ensureGovernanceData();save();
        audit("Importation JSON","système",file.name,"Sauvegarde complète importée");
        alert("Importation JSON terminée.");go("dashboard");return;
      }
      throw new Error("Format JSON non reconnu.");
    }

    let matrix=[];
    if(name.endsWith(".xlsx")||name.endsWith(".xls")){
      if(typeof XLSX==="undefined")throw new Error("Le lecteur Excel n’a pas pu être chargé. Vérifiez la connexion Internet puis réessayez.");
      const buffer=await file.arrayBuffer();
      const workbook=XLSX.read(buffer,{type:"array",cellDates:true});
      if(!workbook.SheetNames.length)throw new Error("Le classeur Excel ne contient aucune feuille.");
      const sheetName=workbook.SheetNames[0];
      matrix=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:"",raw:false,dateNF:"yyyy-mm-dd"});
    }else{
      matrix=parseCSV(await file.text());
    }

    matrix=matrix.filter(r=>Array.isArray(r)&&r.some(v=>String(v).trim()!==""));
    if(matrix.length<2)throw new Error("Le fichier ne contient aucune ligne de données.");
    importCSVIntoCurrentModule(matrix,file.name);
  }catch(err){alert("Importation impossible : "+err.message);}
}
function importCSVIntoCurrentModule(matrix,sourceFile=""){
  const page=currentPageForData;
  const headers=(matrix[0]||[]).map(v=>String(v).trim());
  const dataRows=matrix.slice(1).filter(r=>r.some(v=>String(v).trim()!==""));
  if(!confirm(`Importer ${dataRows.length} ligne(s) Excel/CSV dans le module « ${page} » ?`))return;
  const owner=user.username,now=new Date().toISOString(),today=now.slice(0,10);
  let imported=0,skipped=0;
  const uniqueId=(prefix,index)=>`${prefix}-${Date.now()}-${String(index+1).padStart(3,"0")}`;
  const number=v=>Number(String(v??0).replace(/\s/g,"").replace(",","."))||0;
  const text=v=>String(v??"").trim();
  const addAudit=(moduleName,id)=>audit("Importation Excel",moduleName,id,`Source : ${sourceFile||"fichier externe"}`);

  if(page==="projects"){
    if(!["ADMIN","GESTIONNAIRE","CONTROLE"].includes(user.role))throw new Error("Accès non autorisé.");
    dataRows.forEach((r,i)=>{
      const id=text(r[0])||uniqueId("CH",i);
      if(db.projects.some(x=>String(x.id)===id)){skipped++;return;}
      const obj={id,name:text(r[1]),client:text(r[2]),budget:user.role==="ADMIN"?number(r[3]):0,start:text(r[4]),end:text(r[5]),progress:number(r[6]),status:text(r[7])||"Non démarré",workflow:user.role==="ADMIN"?(text(r[8])||"Brouillon"):"Brouillon",owner,updatedBy:owner,createdAt:now,updatedAt:now,history:[]};
      pushHistory(obj,"Importation Excel",null,sourceFile);db.projects.push(obj);addAudit("projects",id);imported++;
    });
  }else if(page==="expenses"){
    if(!["ADMIN","GESTIONNAIRE"].includes(user.role))throw new Error("Accès non autorisé.");
    dataRows.forEach((r,i)=>{
      const id=text(r[0])||uniqueId("DEP",i);if(db.expenses.some(x=>String(x.id)===id)){skipped++;return;}
      const obj={id,owner:user.role==="ADMIN"?(text(r[1])||owner):owner,workflow:user.role==="ADMIN"?(text(r[2])||"Brouillon"):"Brouillon",date:text(r[3])||today,project:text(r[4]),cat:text(r[5]),supplier:text(r[6]),amount:number(r[7]),note:text(r[8]),updatedBy:owner,createdAt:now,updatedAt:now,history:[]};
      pushHistory(obj,"Importation Excel",null,sourceFile);db.expenses.push(obj);addAudit("expenses",id);imported++;
    });
  }else if(page==="appro"){
    if(user.role==="GESTIONNAIRE"){
      dataRows.forEach((r,i)=>{
        const id=text(r[0])||uniqueId("DEM",i);if(db.requests.some(x=>String(x.id)===id)){skipped++;return;}
        const obj={id,date:text(r[1])||today,project:text(r[2]),amount:number(r[3]),reason:text(r[4]),urgency:text(r[5])||"Normale",status:"En attente",workflow:"Soumis",owner,updatedBy:owner,createdAt:now,updatedAt:now,history:[]};
        pushHistory(obj,"Importation Excel",null,sourceFile);db.requests.push(obj);addAudit("requests",id);imported++;
      });
    }else if(user.role==="ADMIN"){
      dataRows.forEach((r,i)=>{
        const id=text(r[0])||uniqueId("APP",i);if(db.appro.some(x=>String(x.id)===id)){skipped++;return;}
        const obj={id,date:text(r[1])||today,project:text(r[2]),amount:number(r[3]),note:text(r[4]),status:text(r[5])||"Validée",owner,updatedBy:owner,createdAt:now,updatedAt:now,history:[]};
        pushHistory(obj,"Importation Excel",null,sourceFile);db.appro.push(obj);addAudit("appro",id);imported++;
      });
    }else throw new Error("Le Technicien ne peut pas importer des données financières.");
  }else if(page==="reports"){
    if(!["ADMIN","CONTROLE"].includes(user.role))throw new Error("Accès non autorisé.");
    dataRows.forEach((r,i)=>{
      const id=text(r[0])||uniqueId("RAP",i);if(db.reports.some(x=>String(x.id)===id)){skipped++;return;}
      const obj={id,owner:user.role==="ADMIN"?(text(r[1])||owner):owner,workflow:user.role==="ADMIN"?(text(r[2])||"Brouillon"):"Brouillon",date:text(r[3])||today,project:text(r[4]),progress:number(r[5]),work:text(r[6]),conformity:text(r[7]),issue:text(r[8]),action:text(r[9]),status:text(r[10])||"Brouillon",updatedBy:owner,createdAt:now,updatedAt:now,history:[]};
      pushHistory(obj,"Importation Excel",null,sourceFile);db.reports.push(obj);addAudit("reports",id);imported++;
    });
  }else if(GENERIC_FIELDS[page]){
    db.modules[page]=db.modules[page]||[];
    const count=GENERIC_FIELDS[page].length;
    dataRows.forEach((r,i)=>{
      const id=text(r[count+3])||uniqueId(page.toUpperCase().slice(0,4),i);
      if(db.modules[page].some(x=>String(x.id)===id)){skipped++;return;}
      const obj={id,values:r.slice(0,count).map(text),workflow:user.role==="ADMIN"?(text(r[count])||"Brouillon"):"Brouillon",owner:user.role==="ADMIN"?(text(r[count+1])||owner):owner,updatedBy:owner,createdAt:now,updatedAt:now,history:[]};
      pushHistory(obj,"Importation Excel",null,sourceFile);db.modules[page].push(obj);addAudit("modules."+page,id);imported++;
    });
  }else{
    throw new Error("Ouvrez d’abord le module de destination : Chantiers, Dépenses, Approvisionnement, Rapports ou un autre tableau de données.");
  }
  save();recalculateAfterSync();
  alert(`${imported} ligne(s) importée(s) avec succès.\n${skipped} doublon(s) ignoré(s).`);
  go(page);
}

setInterval(()=>{if(user)touchCurrentUser();},60000);
window.addEventListener("storage",e=>{
 if(e.key==="nysoa_simple_sync_db_v1"&&user){
  try{db=JSON.parse(e.newValue);renderMenu();}catch(_){}
 }
});



const USAGE_IDLE_LIMIT_MS=5*60*1000;
let lastUsageActivity=Date.now();
function currentUsageSession(){
 const id=sessionStorage.getItem("nysoa_usage_session_id");
 return id?(db.usageSessions||[]).find(x=>x.id===id):null;
}
function startUsageSession(){
 if(!user||user.role==="ADMIN"||(user.role==="TECHNICIEN"&&!technicianSessionProfile()))return;
 db.usageSessions=Array.isArray(db.usageSessions)?db.usageSessions:[];
 let s=currentUsageSession();
 if(s&&!s.closedAt)return;
 const actor=effectiveUserIdentity(),now=new Date().toISOString();
 s={
  id:"UTI-"+(actor.uid||actor.username||user.username)+"-"+Date.now(),
  uid:actor.uid||user.uid||"",sharedUid:actor.sharedUid||user.uid||"",technicianId:actor.technicianId||"",
  username:actor.username||user.username,label:actor.label||actor.username||user.label,role:actor.role||user.role,
  loginAt:now,lastSeenAt:now,logoutAt:null,
  activeSeconds:0,idleSeconds:0,closedAt:null,
  device:navigator.userAgent,exported:false
 };
 db.usageSessions.unshift(s);
 sessionStorage.setItem("nysoa_usage_session_id",s.id);
 lastUsageActivity=Date.now();save();
}
function recordUsageTick(){
 if(!user||user.role==="ADMIN")return;
 let s=currentUsageSession();if(!s){startUsageSession();s=currentUsageSession();}if(!s)return;
 const now=Date.now();
 if(now-lastUsageActivity<=USAGE_IDLE_LIMIT_MS)s.activeSeconds=(s.activeSeconds||0)+60;
 else s.idleSeconds=(s.idleSeconds||0)+60;
 s.lastSeenAt=new Date().toISOString();save();
}
function closeUsageSession(reason="Fermeture"){
 if(!user||user.role==="ADMIN")return;
 const s=currentUsageSession();if(!s||s.closedAt)return;
 s.logoutAt=new Date().toISOString();s.closedAt=s.logoutAt;s.closeReason=reason;save();
 sessionStorage.removeItem("nysoa_usage_session_id");
}
["click","keydown","input","change","touchstart"].forEach(evt=>document.addEventListener(evt,()=>{lastUsageActivity=Date.now();},{passive:true}));
window.addEventListener("beforeunload",()=>{if(user&&user.role!=="ADMIN"){const s=currentUsageSession();if(s){s.lastSeenAt=new Date().toISOString();save();}}});
setInterval(recordUsageTick,60000);

function secondsToDuration(value){
 const total=Math.max(0,Number(value)||0),h=Math.floor(total/3600),m=Math.floor((total%3600)/60);
 return `${h} h ${String(m).padStart(2,"0")} min`;
}
function exportUsageTime(){
 if(!user||user.role==="ADMIN")return alert("Réservé au Gestionnaire et au Technicien.");
 recordUsageTick();
 const sessions=(db.usageSessions||[]).filter(s=>s.username===user.username&&!s.exported);
 if(!sessions.length)return alert("Aucun nouveau temps d’utilisation à exporter.");
 db.usageExportCounters=db.usageExportCounters||{};
 db.usageExportCounters[user.username]=(db.usageExportCounters[user.username]||0)+1;
 const seq=db.usageExportCounters[user.username];
 const packet={
  format:"NYSOA_USAGE_TIME_V1",version:1,
  packetId:`TEMPS-${user.username}-${Date.now()}`,
  sequence:seq,source:{username:user.username,label:user.label,role:user.role},
  exportedAt:new Date().toISOString(),
  sessions:sessions.map(cloneRecord)
 };
 sessions.forEach(s=>{s.exported=true;s.exportedAt=packet.exportedAt;});
 save();
 downloadJSON(packet,`TEMPS_UTILISATION_${user.role}_${String(seq).padStart(3,"0")}.nysoa`);
 alert(`${sessions.length} session(s) exportée(s). Aucune donnée métier n’est incluse.`);
}
function openUsageImport(){document.getElementById("usageImportFile")?.click();}
async function handleUsageImport(event){
 const file=event.target.files?.[0];event.target.value="";if(!file)return;
 if(user.role!=="ADMIN")return alert("Import réservé à l’Admin.");
 try{
  const packet=JSON.parse(await file.text());
  if(packet.format!=="NYSOA_USAGE_TIME_V1")throw new Error("Fichier de temps d’utilisation incompatible.");
  db.importedUsagePackets=Array.isArray(db.importedUsagePackets)?db.importedUsagePackets:[];
  if(db.importedUsagePackets.includes(packet.packetId))throw new Error("Ce fichier a déjà été importé.");
  db.usageSessions=Array.isArray(db.usageSessions)?db.usageSessions:[];
  let added=0,updated=0;
  (packet.sessions||[]).forEach(incoming=>{
   const existing=db.usageSessions.find(x=>x.id===incoming.id);
   if(existing){Object.assign(existing,incoming);updated++;}
   else{db.usageSessions.push(incoming);added++;}
  });
  db.importedUsagePackets.push(packet.packetId);
  audit("Import temps d’utilisation","usageTime",file.name,`${added} ajout(s), ${updated} mise(s) à jour`);
  save();alert(`Import terminé.\n${added} session(s) ajoutée(s).\n${updated} session(s) actualisée(s).`);
  usageTimePage();
 }catch(err){alert("Import impossible : "+err.message);}
}
function usageTimePage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 const sessions=(db.usageSessions||[]).slice().sort((a,b)=>String(b.loginAt).localeCompare(String(a.loginAt)));
 const totals={};
 sessions.forEach(s=>{
  const key=s.username||"inconnu";
  totals[key]=totals[key]||{label:s.label||key,role:s.role,seconds:0,count:0};
  totals[key].seconds+=Number(s.activeSeconds)||0;totals[key].count++;
 });
 $("#content").innerHTML=`<div class="panel"><h3>TEMPS D’UTILISATION</h3>
 <div class="panel-body"><button class="btn secondary" onclick="exportUsageCSV()">Exporter CSV</button>
 <span class="muted">Les temps d’utilisation sont synchronisés automatiquement via le Cloud. Aucun import manuel n’est nécessaire.</span></div>
 <div class="usage-summary">${Object.values(totals).map(t=>`<div class="usage-card"><b>${esc(t.label)}</b><span>${esc(t.role)}</span><strong>${secondsToDuration(t.seconds)}</strong><small>${t.count} connexion(s)</small></div>`).join("")||"<p>Aucune donnée disponible.</p>"}</div>
 <div class="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Date</th><th>Entrée</th><th>Dernière activité / sortie</th><th>Temps actif</th><th>Temps inactif</th><th>Appareil</th></tr></thead><tbody>
 ${sessions.length?sessions.map(s=>`<tr><td>${esc(s.label||s.username)}</td><td>${esc(s.role)}</td><td>${new Date(s.loginAt).toLocaleDateString("fr-FR")}</td><td>${new Date(s.loginAt).toLocaleTimeString("fr-FR")}</td><td>${new Date(s.logoutAt||s.lastSeenAt||s.loginAt).toLocaleTimeString("fr-FR")}</td><td><b>${secondsToDuration(s.activeSeconds)}</b></td><td>${secondsToDuration(s.idleSeconds)}</td><td class="device-cell">${esc(s.device||"")}</td></tr>`).join(""):`<tr><td colspan="8">Aucune session disponible.</td></tr>`}
 </tbody></table></div></div>`;
}
function exportUsageCSV(){
 if(user.role!=="ADMIN")return;
 const rows=[["Utilisateur","Rôle","Date","Entrée","Sortie / dernière activité","Secondes actives","Durée active","Secondes inactives"]];
 (db.usageSessions||[]).forEach(s=>rows.push([s.label||s.username,s.role,s.loginAt,s.loginAt,s.logoutAt||s.lastSeenAt||"",s.activeSeconds||0,secondsToDuration(s.activeSeconds),s.idleSeconds||0]));
 const csv=rows.map(r=>r.map(csvEscape).join(";")).join("\n");
 downloadText(`NYSOA_TEMPS_UTILISATION_${new Date().toISOString().slice(0,10)}.csv`,csv,"text/csv;charset=utf-8");
}



// ===== RAPPORT JOURNALIER V4.4 =====
const DAILY_REPORT_STATUSES=["Brouillon","Complété","Prêt à envoyer","Exporté vers Admin","Reçu par Admin","Consulté","Archivé"];
function localDateKey(d=new Date()){
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
 return `${y}-${m}-${day}`;
}
function dailyReportIsLate(r){
 const deadline=db.dailyReportSettings?.deadline||"17:30";
 const now=new Date();
 if(r.reportDate<localDateKey())return !["Reçu par Admin","Consulté","Archivé"].includes(r.status);
 if(r.reportDate>localDateKey())return false;
 const [h,m]=deadline.split(":").map(Number);
 const limit=new Date();limit.setHours(h,m,0,0);
 return now>limit&&!["Exporté vers Admin","Reçu par Admin","Consulté","Archivé"].includes(r.status);
}
function reportStatusBadge(r){
 const late=dailyReportIsLate(r);
 const cls=late?"b-orange":["Reçu par Admin","Consulté","Archivé"].includes(r.status)?"b-green":r.status==="Exporté vers Admin"?"b-blue":"b-orange";
 return `<span class="badge ${cls}">${late?"En retard — ":""}${esc(r.status||"Brouillon")}</span>${r.cloudSyncedAt?` <span class="badge b-green">☁ Synchronisé</span>`:""}`;
}
function myTodayReport(){
 return (db.dailyReports||[]).find(r=>(r.ownerUid? r.ownerUid===user.uid : r.owner===user.username)&&r.reportDate===localDateKey()&&!r.deleted);
}
function missingDailyReportMessage(){
 if(!user||user.role==="ADMIN")return "";
 const r=myTodayReport();
 if(!r)return `⚠ Rapport journalier du ${new Date().toLocaleDateString("fr-FR")} non rempli.`;
 if(r.cloudSyncedAt)return "";
 if(r.status==="Brouillon"||r.status==="Complété"||r.status==="Prêt à envoyer")
   return `⚠ Le rapport du ${new Date(r.reportDate+"T12:00:00").toLocaleDateString("fr-FR")} n’est pas encore envoyé à l’Admin.`;
 if(r.status==="Exporté vers Admin")return "Rapport exporté. En attente de réception par l’Admin.";
 return "";
}
function dailyReportReminderHtml(){
 const msg=missingDailyReportMessage();
 if(!msg)return "";
 const r=myTodayReport();
 return `<div class="daily-reminder ${r?.status==="Exporté vers Admin"?"sent":"warning"}">
 <div><b>RAPPEL RAPPORT JOURNALIER</b><p>${esc(msg)}</p></div>
 <button class="btn primary" onclick="go('dailyReports')">${r?"Ouvrir le rapport":"Créer le rapport"}</button>
 </div>`;
}
function dailyReportsPage(){
 db.dailyReports=Array.isArray(db.dailyReports)?db.dailyReports:[];
 const rows=(user.role==="ADMIN"?db.dailyReports:db.dailyReports.filter(r=>r.ownerUid? r.ownerUid===user.uid : r.owner===user.username)).filter(r=>!r.deleted)
  .sort((a,b)=>String(b.reportDate+b.createdAt).localeCompare(String(a.reportDate+a.createdAt)));
 const today=myTodayReport();
 $("#content").innerHTML=`${user.role!=="ADMIN"?dailyReportReminderHtml():""}
 <div class="panel"><h3>${user.role==="ADMIN"?"RAPPORTS JOURNALIERS REÇUS":"MES RAPPORTS JOURNALIERS"}</h3>
 <div class="panel-body">
 ${user.role!=="ADMIN"?`<button class="btn primary" onclick="dailyReportForm('${today?.id||""}')">${today?"Ouvrir le rapport d’aujourd’hui":"+ Créer le rapport d’aujourd’hui"}</button>
 <button class="btn secondary" onclick="exportDailyReports()">Envoyer les rapports prêts</button>`:
 `<button class="btn primary" onclick="openDailyReportImport()">Importer les rapports</button>
 <label class="inline-setting">Heure limite <input type="time" value="${esc(db.dailyReportSettings?.deadline||"17:30")}" onchange="setDailyReportDeadline(this.value)"></label>`}
 </div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Rôle</th><th>Chantier</th><th>Résumé</th><th>Statut</th><th>Créé / modifié</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr><td><b>${new Date(r.reportDate+"T12:00:00").toLocaleDateString("fr-FR")}</b></td>
 <td>${esc(r.ownerLabel||r.owner)}</td><td>${esc(r.role)}</td><td>${esc(r.project||"Non précisé")}</td>
 <td>${esc((r.workDone||r.controlledWork||"").slice(0,90))}</td><td>${reportStatusBadge(r)}</td>
 <td>${new Date(r.updatedAt||r.createdAt).toLocaleString("fr-FR")}</td>
 <td><div class="edit-actions">
 ${user.role!=="ADMIN"&&!["Reçu par Admin","Consulté","Archivé"].includes(r.status)?`<button class="btn-xs btn-edit" onclick="dailyReportForm('${r.id}')">Modifier</button>`:""}
 <button class="btn-xs" onclick="dailyReportView('${r.id}')">Voir</button>
 ${user.role==="ADMIN"&&r.status!=="Consulté"?`<button class="btn-xs btn-save" onclick="markDailyReportRead('${r.id}')">Marquer consulté</button>`:""}
 </div></td></tr>`).join(""):`<tr><td colspan="8">Aucun rapport journalier.</td></tr>`}
 </tbody></table></div></div>`;
}
function dailyReportForm(id=""){
 if(user.role==="ADMIN")return dailyReportsPage();
 const existing=id?(db.dailyReports||[]).find(r=>r.id===id):null;
 if(existing&&((existing.ownerUid&&existing.ownerUid!==user.uid)||(!existing.ownerUid&&existing.owner!==user.username)))return alert("Accès refusé.");
 const roleTech=user.role==="CONTROLE";
 const r=existing||{};
 const projectOptions=db.projects.filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${r.project===p.id?"selected":""}>${esc(p.id)} - ${esc(p.name||"")}</option>`).join("");
 $("#content").innerHTML=`<div class="panel"><h3>RAPPORT JOURNALIER — ${roleTech?"TECHNICIEN":"GESTIONNAIRE"}</h3>
 <form id="dailyReportForm" class="form-grid">
 <label>Date du rapport<input name="reportDate" type="date" value="${esc(r.reportDate||localDateKey())}" required></label>
 <label>Chantier<select name="project"><option value="">Non précisé</option>${projectOptions}</select></label>
 ${roleTech?`
 <label class="full">Travaux contrôlés<textarea name="controlledWork" required>${esc(r.controlledWork||"")}</textarea></label>
 <label>Avancement (%)<input name="progress" type="number" min="0" max="100" value="${esc(r.progress??"")}"></label>
 <label>Effectif présent<input name="workforce" type="number" min="0" value="${esc(r.workforce??"")}"></label>
 <label class="full">Contrôle qualité<textarea name="qualityControl">${esc(r.qualityControl||"")}</textarea></label>
 <label class="full">Matériels utilisés<textarea name="equipmentUsed">${esc(r.equipmentUsed||"")}</textarea></label>
 <label class="full">Non-conformités constatées<textarea name="nonConformities">${esc(r.nonConformities||"")}</textarea></label>
 <label class="full">Mesures correctives<textarea name="correctiveActions">${esc(r.correctiveActions||"")}</textarea></label>
 <label class="full">Problèmes techniques<textarea name="problems">${esc(r.problems||"")}</textarea></label>`:`
 <label class="full">Travaux réalisés<textarea name="workDone" required>${esc(r.workDone||"")}</textarea></label>
 <label class="full">Achats réalisés ou en attente<textarea name="purchases">${esc(r.purchases||"")}</textarea></label>
 <label class="full">Dépenses réalisées<textarea name="expenses">${esc(r.expenses||"")}</textarea></label>
 <label class="full">Livraisons reçues<textarea name="deliveries">${esc(r.deliveries||"")}</textarea></label>
 <label>Effectif présent<input name="workforce" type="number" min="0" value="${esc(r.workforce??"")}"></label>
 <label class="full">Problèmes rencontrés<textarea name="problems">${esc(r.problems||"")}</textarea></label>
 <label class="full">Solutions prises<textarea name="solutions">${esc(r.solutions||"")}</textarea></label>`}
 <label class="full">Travaux prévus demain<textarea name="tomorrowWork">${esc(r.tomorrowWork||"")}</textarea></label>
 <label class="full">Observations<textarea name="observations">${esc(r.observations||"")}</textarea></label>
 <label>Statut<select name="status">
 ${["Brouillon","Complété","Prêt à envoyer"].map(s=>`<option ${r.status===s?"selected":""}>${s}</option>`).join("")}
 </select></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="dailyReportsPage()">Annuler</button></div>
 </form></div>`;
 $("#dailyReportForm").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString();
  const reportDate=f.get("reportDate");
  const duplicate=(db.dailyReports||[]).find(x=>x.owner===user.username&&x.reportDate===reportDate&&x.id!==existing?.id&&!x.deleted);
  if(duplicate)return alert("Vous avez déjà un rapport pour cette date.");
  const obj={
   id:existing?.id||`RAPJ-${user.uid||user.username}-${reportDate}`,
   reportDate,project:f.get("project"),owner:user.username,ownerUid:user.uid||existing?.ownerUid||"",ownerEmail:user.email||existing?.ownerEmail||"",ownerLabel:user.label,role:user.role,
   controlledWork:f.get("controlledWork")||"",workDone:f.get("workDone")||"",
   progress:+f.get("progress")||0,workforce:+f.get("workforce")||0,
   qualityControl:f.get("qualityControl")||"",equipmentUsed:f.get("equipmentUsed")||"",
   nonConformities:f.get("nonConformities")||"",correctiveActions:f.get("correctiveActions")||"",
   purchases:f.get("purchases")||"",expenses:f.get("expenses")||"",deliveries:f.get("deliveries")||"",
   problems:f.get("problems")||"",solutions:f.get("solutions")||"",
   tomorrowWork:f.get("tomorrowWork")||"",observations:f.get("observations")||"",
   status:f.get("status"),createdAt:existing?.createdAt||now,updatedAt:now,history:existing?.history||[]
  };
  if(existing){
   const before=cloneRecord(existing);Object.assign(existing,obj);
   pushHistory(existing,"Modification",before,`Statut : ${obj.status}`);
   audit("Modification rapport journalier","dailyReports",existing.id,obj.status,before,existing);
  }else{
   pushHistory(obj,"Création",null,`Statut : ${obj.status}`);
   db.dailyReports.push(obj);audit("Création rapport journalier","dailyReports",obj.id,obj.status,null,obj);
  }
  save();
  cloudSyncRecord("dailyReports",existing||obj);
  dailyReportsPage();
 };
}
function dailyReportView(id){
 const r=(db.dailyReports||[]).find(x=>x.id===id);if(!r)return;
 const details=user.role==="CONTROLE"||r.role==="CONTROLE"?
 [["Travaux contrôlés",r.controlledWork],["Avancement",`${r.progress||0}%`],["Effectif",r.workforce],["Contrôle qualité",r.qualityControl],["Matériels utilisés",r.equipmentUsed],["Non-conformités",r.nonConformities],["Mesures correctives",r.correctiveActions],["Problèmes",r.problems],["Travaux prévus demain",r.tomorrowWork],["Observations",r.observations]]:
 [["Travaux réalisés",r.workDone],["Achats",r.purchases],["Dépenses",r.expenses],["Livraisons",r.deliveries],["Effectif",r.workforce],["Problèmes",r.problems],["Solutions",r.solutions],["Travaux prévus demain",r.tomorrowWork],["Observations",r.observations]];
 $("#content").innerHTML=`<div class="panel"><h3>RAPPORT DU ${new Date(r.reportDate+"T12:00:00").toLocaleDateString("fr-FR")}</h3>
 <div class="panel-body"><button class="btn secondary" onclick="dailyReportsPage()">Retour</button>${user.role==="ADMIN"&&r.status!=="Consulté"?`<button class="btn primary" onclick="markDailyReportRead('${r.id}')">Marquer consulté</button>`:""}</div>
 <div class="report-sheet"><div class="report-meta"><b>${esc(r.ownerLabel||r.owner)}</b><span>${esc(r.role)}</span><span>Chantier : ${esc(r.project||"Non précisé")}</span>${reportStatusBadge(r)}</div>
 ${details.map(([k,v])=>`<section><h4>${esc(k)}</h4><p>${esc(String(v??""))||"—"}</p></section>`).join("")}</div></div>`;
}
function exportDailyReports(){
 if(!user||user.role==="ADMIN")return alert("Fonction réservée au Gestionnaire et au Technicien.");
 const ready=(db.dailyReports||[]).filter(r=>(r.ownerUid? r.ownerUid===user.uid : r.owner===user.username)&&["Complété","Prêt à envoyer"].includes(r.status)&&!r.deleted);
 if(!ready.length)return alert("Aucun rapport complété ou prêt à envoyer.");
 const now=new Date().toISOString();
 const packet={format:"NYSOA_DAILY_REPORT_V1",packetId:`RAPJ-${user.username}-${Date.now()}`,source:{username:user.username,label:user.label,role:user.role},exportedAt:now,reports:ready.map(cloneRecord)};
 ready.forEach(r=>{const before=cloneRecord(r);r.status="Exporté vers Admin";r.exportedAt=now;r.updatedAt=now;pushHistory(r,"Export vers Admin",before,"Fichier de rapports journaliers créé");});
 save();
 const role=user.role==="GESTIONNAIRE"?"GESTIONNAIRE":"TECHNICIEN";
 downloadJSON(packet,`RAPPORTS_JOURNALIERS_${role}_${localDateKey()}.nysoa`);
 alert(`${ready.length} rapport(s) exporté(s). Envoyez le fichier à l’Admin.`);
 dailyReportsPage();
}
function openDailyReportImport(){document.getElementById("dailyReportImportFile")?.click();}
async function handleDailyReportImport(event){
 const file=event.target.files?.[0];event.target.value="";if(!file)return;
 if(user.role!=="ADMIN")return alert("Import réservé à l’Admin.");
 try{
  const packet=JSON.parse(await file.text());
  if(packet.format!=="NYSOA_DAILY_REPORT_V1")throw new Error("Fichier incompatible.");
  db.importedDailyReportPackets=db.importedDailyReportPackets||[];
  if(db.importedDailyReportPackets.includes(packet.packetId))throw new Error("Ce fichier a déjà été importé.");
  let added=0,updated=0;const now=new Date().toISOString();
  (packet.reports||[]).forEach(incoming=>{
   let r=(db.dailyReports||[]).find(x=>x.id===incoming.id);
   if(r){Object.assign(r,incoming);updated++;}else{r=cloneRecord(incoming);db.dailyReports.push(r);added++;}
   const before=cloneRecord(r);r.status="Reçu par Admin";r.receivedAt=now;r.updatedAt=now;
   r.history=Array.isArray(r.history)?r.history:[];r.history.unshift({id:"HIS-"+Date.now()+Math.random(),date:now,user:user.username,role:user.role,action:"Importé par Admin",details:file.name});
  });
  db.importedDailyReportPackets.push(packet.packetId);
  audit("Import rapports journaliers","dailyReports",file.name,`${added} ajout(s), ${updated} mise(s) à jour`);
  save();alert(`Import terminé : ${added} ajouté(s), ${updated} actualisé(s).`);dailyReportsPage();
 }catch(err){alert("Import impossible : "+err.message);}
}
function markDailyReportRead(id){
 const r=(db.dailyReports||[]).find(x=>x.id===id);if(!r||user.role!=="ADMIN")return;
 const before=cloneRecord(r);r.status="Consulté";r.consultedAt=new Date().toISOString();r.updatedAt=r.consultedAt;
 pushHistory(r,"Consulté par Admin",before,"Rapport lu");audit("Consultation rapport journalier","dailyReports",id,"Rapport consulté",before,r);save();cloudSyncRecord("dailyReports",r);dailyReportsPage();
}
function setDailyReportDeadline(value){
 db.dailyReportSettings=db.dailyReportSettings||{};db.dailyReportSettings.deadline=value||"17:30";save();dailyReportsPage();
}
function shouldWarnDailyReportLogout(){
 if(!user||user.role==="ADMIN"||db.dailyReportSettings?.logoutReminder===false)return false;
 const r=myTodayReport();
 return !r||["Brouillon","Complété","Prêt à envoyer"].includes(r.status);
}


// ===== SYNCHRONISATION SIMPLE PAR FICHIER JSON =====
// Principe : le Gestionnaire et le Technicien exportent leurs mises à jour.
// Ils envoient le fichier NYSOA à l'Admin par WhatsApp, e-mail ou Drive.
// L'Admin clique sur "Actualiser les données" et importe le fichier reçu.

function downloadJSON(data, filename){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/octet-stream"});
 const a=document.createElement("a");
 a.href=URL.createObjectURL(blob);
 a.download=filename;
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(a.href);
}

function exportMyUpdates(){
 if(!user||user.role==="ADMIN"){
  alert("Cette fonction est destinée au Gestionnaire et au Technicien.");
  return;
 }

 db.updateCounters=db.updateCounters||{};
 const roleKey=user.role==="GESTIONNAIRE"?"gestionnaire":"technicien";
 let number=db.updateCounters[roleKey];
 if(!Number.isInteger(number)){
   number=user.role==="GESTIONNAIRE"?1:2;
 }else{
   number+=2;
 }
 db.updateCounters[roleKey]=number;
 save();

 const roleLabel=user.role==="GESTIONNAIRE"?"GESTIONNAIRE":"TECHNICIEN";
 const filename=`MISE_A_JOUR_${String(number).padStart(3,"0")}_${roleLabel}.nysoa`;

 const packet={
   format:"NYSOA_SYNC_V3",
   version:3,
   company:"ENTREPRISE NYSOA CONSTRUCT",
   source:{
     username:user.username,
     label:user.label,
     role:user.role
   },
   sequence:number,
   exportedAt:new Date().toISOString(),
   database:buildSyncDatabase()
 };

 localStorage.setItem("nysoa_last_update_file_content",JSON.stringify(packet,null,2));
 downloadJSON(packet,filename);
 setTimeout(()=>showShareChoices(filename,user.label||user.username),350);
}

function buildSyncDatabase(){
 const clone=value=>JSON.parse(JSON.stringify(value??null));
 const result={};

 // Collections principales
 [
  "projects","appro","expenses","requests","reports",
  "technicalEntries","dailyReports","modules"
 ].forEach(key=>result[key]=clone(db[key]||([])));

 // Données complémentaires utiles à la cohérence
 result.auditLog=clone(db.auditLog||[]);
 result.meta={
   exportedBy:user.username,
   exportedRole:user.role,
   exportedAt:new Date().toISOString()
 };

 return result;
}

async function showShareChoices(filename,sender){
 const old=document.getElementById("syncShareModal");
 if(old)old.remove();

 const modal=document.createElement("div");
 modal.id="syncShareModal";
 modal.className="modal-overlay";
 modal.innerHTML=`<div class="modal-card sync-share-card">
   <h3>Mise à jour téléchargée</h3>
   <p>Le fichier <b>${esc(filename)}</b> est enregistré sur votre appareil.</p>
   <p>Sur téléphone ou navigateur compatible, utilisez « Partager le fichier » pour joindre directement la mise à jour. Sur ordinateur, WhatsApp Web ne peut pas joindre automatiquement un fichier pour des raisons de sécurité du navigateur.</p>
   <div class="share-choice-grid">
     <button class="btn whatsapp-btn" id="shareNativeFile">Partager le fichier</button>
     <button class="btn mail-btn" id="shareMail">Préparer un e-mail</button>
     <button class="btn secondary" id="openWhatsApp">Ouvrir WhatsApp</button>
     <button class="btn secondary" id="closeShareModal">Fermer</button>
   </div>
 </div>`;
 document.body.appendChild(modal);

 document.getElementById("shareNativeFile").onclick=async()=>{
   try{
     const response=await fetch(URL.createObjectURL(new Blob([])));
   }catch(_){}
   try{
     const packetText=localStorage.getItem("nysoa_last_update_file_content");
     if(!packetText){
       alert("Le fichier a déjà été téléchargé. Utilisez le dossier Téléchargements pour le joindre.");
       return;
     }
     const file=new File([packetText],filename,{type:"application/octet-stream"});
     if(navigator.canShare && navigator.share && navigator.canShare({files:[file]})){
       await navigator.share({
         title:"Mise à jour ERP NYSOA",
         text:`Mise à jour ERP envoyée par ${sender}.`,
         files:[file]
       });
     }else{
       alert("Le partage direct de fichier n’est pas disponible sur ce navigateur. Le fichier est dans le dossier Téléchargements : joignez-le manuellement dans WhatsApp ou E-mail.");
     }
   }catch(err){
     if(err?.name!=="AbortError"){
       alert("Partage impossible sur ce navigateur. Joignez manuellement le fichier depuis le dossier Téléchargements.");
     }
   }
 };

 document.getElementById("openWhatsApp").onclick=()=>{
   const text=`Bonjour, je vous envoie ma mise à jour ERP NYSOA. Le fichier à joindre est : ${filename}.`;
   window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank");
 };

 document.getElementById("shareMail").onclick=()=>{
   const subject="Mise à jour ERP NYSOA";
   const body=`Bonjour,\n\nVeuillez trouver en pièce jointe ma mise à jour ERP NYSOA : ${filename}.\n\nExpéditeur : ${sender}`;
   window.location.href="mailto:?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
 };

 document.getElementById("closeShareModal").onclick=()=>modal.remove();
 modal.onclick=e=>{if(e.target===modal)modal.remove();};
}

function openSyncImport(){
 if(user?.role!=="ADMIN"){
  alert("Seul l’Admin peut actualiser les données.");
  return;
 }
 document.getElementById("syncImportFile").click();
}

function recordKey(record,index=0){
 return record?.id || record?.reference || [
  record?.owner||"",
  record?.updatedBy||"",
  record?.date||"",
  JSON.stringify(record?.values||[]),
  index
 ].join("|");
}

function recordTime(record){
 const raw=record?.updatedAt||record?.lastTechnicalEdit||record?.createdAt||record?.date||"";
 const time=Date.parse(raw);
 return Number.isFinite(time)?time:0;
}

function mergeArray(target,incoming,collectionName=""){
 const result=Array.isArray(target)?target.map(x=>structuredClone(x)):[];
 const stats={added:0,updated:0,unchanged:0,conflicts:0};

 const getKey=(record,index)=>{
   if(record?.id)return String(record.id);
   if(record?.reference)return String(record.reference);
   if(record?.employeeKey)return String(record.employeeKey);
   if(record?.date&&record?.project)return `${record.date}|${record.project}`;
   if(Array.isArray(record?.values)&&record.values.length)return `${record.values[0]||""}|${record.values[1]||""}`;
   return `${collectionName}|${record?.owner||record?.updatedBy||""}|${index}|${JSON.stringify(record)}`;
 };

 const getTime=record=>{
   const raw=record?.updatedAt||record?.lastTechnicalEdit||record?.createdAt||record?.date||"";
   const time=Date.parse(raw);
   return Number.isFinite(time)?time:0;
 };

 const map=new Map(result.map((r,i)=>[getKey(r,i),i]));

 (incoming||[]).forEach((item,i)=>{
   const key=getKey(item,i);
   if(!map.has(key)){
     result.push(structuredClone(item));
     map.set(key,result.length-1);
     stats.added++;
     return;
   }

   const pos=map.get(key);
   const local=result[pos];
   const incomingTime=getTime(item);
   const localTime=getTime(local);

   const same=JSON.stringify(local)===JSON.stringify(item);
   if(same){
     stats.unchanged++;
     return;
   }

   if(incomingTime>=localTime){
     result[pos]={...local,...structuredClone(item)};
     stats.updated++;
   }else{
     stats.conflicts++;
   }
 });

 return {rows:result,stats};
}

async function handleSyncImport(event){
 const file=event.target.files?.[0];
 event.target.value="";
 if(!file)return;

 if(user?.role!=="ADMIN"){
  alert("Seul l’Admin peut importer les mises à jour.");
  return;
 }

 try{
  const packet=JSON.parse(await file.text());

  if(packet.format!=="NYSOA_SYNC_V3" || !packet.database){
    throw new Error("Fichier incompatible. Utilisez une mise à jour NYSOA version 3.");
  }

  db.importedUpdateFiles=Array.isArray(db.importedUpdateFiles)?db.importedUpdateFiles:[];
  if(db.importedUpdateFiles.includes(file.name)){
    throw new Error("Cette mise à jour a déjà été importée.");
  }

  db.lastImportedSequence=db.lastImportedSequence||{};
  const sourceKey=packet.source?.username||packet.source?.role||"INCONNU";
  const currentSequence=Number(packet.sequence||0);
  const lastSequence=Number(db.lastImportedSequence[sourceKey]||0);

  if(currentSequence && currentSequence<lastSequence){
    throw new Error("Une mise à jour plus récente de cet utilisateur a déjà été importée.");
  }

  const incoming=packet.database;
  const summary={};
  const mergeCollection=(name)=>{
    const merged=mergeArray(db[name]||[],incoming[name]||[],name);
    db[name]=merged.rows;
    summary[name]=merged.stats;
  };

  ["projects","appro","expenses","requests","reports","technicalEntries"].forEach(mergeCollection);

  db.modules=db.modules||{};
  summary.modules={added:0,updated:0,unchanged:0,conflicts:0,details:{}};

  Object.entries(incoming.modules||{}).forEach(([name,rows])=>{
    const merged=mergeArray(db.modules[name]||[],rows||[],`modules.${name}`);
    db.modules[name]=merged.rows;
    summary.modules.details[name]=merged.stats;
    summary.modules.added+=merged.stats.added;
    summary.modules.updated+=merged.stats.updated;
    summary.modules.unchanged+=merged.stats.unchanged;
    summary.modules.conflicts+=merged.stats.conflicts;
  });

  db.importedUpdateFiles.push(file.name);
  if(currentSequence)db.lastImportedSequence[sourceKey]=currentSequence;

  db.syncHistory=Array.isArray(db.syncHistory)?db.syncHistory:[];
  db.syncHistory.unshift({
    id:"SYNC-"+Date.now(),
    sourceUser:packet.source?.username||"Utilisateur externe",
    sourceLabel:packet.source?.label||packet.source?.username||"Utilisateur externe",
    sourceRole:packet.source?.role||"INCONNU",
    sequence:packet.sequence||null,
    exportedAt:packet.exportedAt||null,
    importedAt:new Date().toISOString(),
    fileName:file.name,
    summary
  });

  save();
  recalculateAfterSync();

  const totals=Object.values(summary).reduce((acc,s)=>{
    if(!s||typeof s!=="object")return acc;
    acc.added+=(s.added||0);
    acc.updated+=(s.updated||0);
    acc.unchanged+=(s.unchanged||0);
    acc.conflicts+=(s.conflicts||0);
    return acc;
  },{added:0,updated:0,unchanged:0,conflicts:0});

  const details=[
    `Chantiers : +${summary.projects.added} / ${summary.projects.updated} modifié(s)`,
    `Approvisionnements : +${summary.appro.added} / ${summary.appro.updated} modifié(s)`,
    `Dépenses : +${summary.expenses.added} / ${summary.expenses.updated} modifiée(s)`,
    `Demandes : +${summary.requests.added} / ${summary.requests.updated} modifiée(s)`,
    `Rapports : +${summary.reports.added} / ${summary.reports.updated} modifié(s)`,
    `Données techniques : +${summary.technicalEntries.added} / ${summary.technicalEntries.updated} modifiée(s)`,
    `Autres modules : +${summary.modules.added} / ${summary.modules.updated} modifié(s)`
  ].join("\n");

  alert(
    `Mise à jour NYSOA terminée.\n\n`+
    `Source : ${packet.source?.label||packet.source?.username||"Utilisateur externe"}\n`+
    `Fichier : ${file.name}\n\n`+
    `${details}\n\n`+
    `Total ajouté : ${totals.added}\n`+
    `Total modifié : ${totals.updated}\n`+
    `Conflits conservés côté Admin : ${totals.conflicts}`
  );

  go("dashboard");
 }catch(err){
  alert("Import impossible : "+err.message);
 }
}

function recalculateAfterSync(){
 db.projects=db.projects||[];
 db.appro=db.appro||[];
 db.expenses=db.expenses||[];
 db.requests=db.requests||[];
 db.reports=db.reports||[];
 db.technicalEntries=db.technicalEntries||[];
 db.modules=db.modules||{};

 // Normalisation légère des montants et statuts
 db.appro.forEach(r=>r.amount=Number(r.amount||0));
 db.expenses.forEach(r=>r.amount=Number(r.amount||0));
 db.requests.forEach(r=>r.amount=Number(r.amount||0));
 db.projects.forEach(r=>{
   r.budget=Number(r.budget||0);
   r.progress=Number(r.progress||0);
 });

 save();
}


function adminValidationsPage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 const rows=[
  ...(db.requests||[]).filter(x=>!x.deleted).map(x=>({collection:"requests",module:"Demande d’approvisionnement",record:x})),
  ...(db.expenses||[]).filter(x=>!x.deleted).map(x=>({collection:"expenses",module:"Dépense",record:x})),
  ...(db.reports||[]).filter(x=>!x.deleted).map(x=>({collection:"reports",module:"Rapport technique",record:x})),
  ...(db.projects||[]).filter(x=>!x.deleted).map(x=>({collection:"projects",module:"Chantier",record:x}))
 ].filter(x=>!isLocked(x.record));
 $("#content").innerHTML=`<div class="panel"><h3>VALIDATIONS ADMIN</h3>
 <div class="panel-body"><button class="btn primary" onclick="publishAdminValidations()">Télécharger les validations Admin</button></div>
 <div class="table-wrap"><table><thead><tr><th>Module</th><th>Référence</th><th>Propriétaire</th><th>Statut actuel</th><th>Décision</th><th>Observation Admin</th></tr></thead><tbody>
 ${rows.length?rows.map(x=>`<tr><td>${esc(x.module)}</td><td>${esc(x.record.id)}</td><td>${esc(x.record.owner||"")}</td><td>${workflowBadge(x.record.workflow||x.record.status)}</td>
 <td><select class="validation-decision" data-collection="${x.collection}" data-id="${esc(x.record.id)}"><option value="">Sans changement</option><option>Validé</option><option>À corriger</option><option>Refusé</option><option>Archivé</option></select></td>
 <td><input class="validation-note" data-collection="${x.collection}" data-id="${esc(x.record.id)}" placeholder="Observation"></td></tr>`).join(""):`<tr><td colspan="6">Aucune donnée en attente de validation.</td></tr>`}
 </tbody></table></div></div>`;
}
function publishAdminValidations(){
 if(user.role!=="ADMIN")return;
 ensureGovernanceData();
 const changes=[];
 document.querySelectorAll(".validation-decision").forEach(select=>{
  if(!select.value)return;
  const collection=select.dataset.collection,id=select.dataset.id;
  const record=(db[collection]||[]).find(x=>String(x.id)===String(id));
  if(!record)return;
  const before=cloneRecord(record);
  const note=document.querySelector(`.validation-note[data-collection="${collection}"][data-id="${CSS.escape(id)}"]`)?.value||"";
  record.workflow=select.value;
  if(collection==="requests")record.status=select.value==="Validé"?"Validée":select.value;
  if(collection==="reports")record.status=select.value;
  record.adminObservation=note;
  record.validatedBy=user.username;
  record.validatedAt=new Date().toISOString();
  record.updatedBy=user.username;
  record.updatedAt=record.validatedAt;
  pushHistory(record,"Décision Admin",before,`${select.value}${note?" — "+note:""}`);
  audit("Validation Admin",collection,id,`${select.value}${note?" — "+note:""}`,before,record);
  changes.push({collection,id,record:cloneRecord(record)});
 });
 if(!changes.length)return alert("Sélectionnez au moins une décision.");
 db.adminValidationCounters.ADMIN=(db.adminValidationCounters.ADMIN||0)+1;
 const sequence=db.adminValidationCounters.ADMIN;
 const packet={
  format:"NYSOA_ADMIN_VALIDATION_V1",
  version:1,
  company:"ENTREPRISE NYSOA CONSTRUCT",
  sequence,
  source:{username:user.username,label:user.label,role:user.role},
  exportedAt:new Date().toISOString(),
  changes
 };
 save();
 downloadJSON(packet,`VALIDATION_ADMIN_${String(sequence).padStart(3,"0")}.nysoa`);
 alert(`${changes.length} validation(s) publiée(s).`);
 adminValidationsPage();
}
function openValidationImport(){
 document.getElementById("validationImportFile")?.click();
}
async function handleValidationImport(event){
 const file=event.target.files?.[0];event.target.value="";
 if(!file)return;
 if(user.role==="ADMIN")return alert("Cette importation est destinée aux autres utilisateurs.");
 try{
  const packet=JSON.parse(await file.text());
  if(packet.format!=="NYSOA_ADMIN_VALIDATION_V1")throw new Error("Fichier de validation Admin incompatible.");
  db.importedValidationFiles=Array.isArray(db.importedValidationFiles)?db.importedValidationFiles:[];
  if(db.importedValidationFiles.includes(file.name))throw new Error("Cette validation a déjà été importée.");
  let applied=0,ignored=0;
  (packet.changes||[]).forEach(change=>{
   const record=(db[change.collection]||[]).find(x=>String(x.id)===String(change.id));
   if(!record){ignored++;return;}
   if(record.owner!==user.username){ignored++;return;}
   const before=cloneRecord(record);
   Object.assign(record,change.record);
   pushHistory(record,"Validation Admin importée",before,record.adminObservation||"");
   audit("Import validation Admin",change.collection,change.id,record.workflow||record.status,before,record);
   applied++;
  });
  db.importedValidationFiles.push(file.name);
  save();recalculateAfterSync();
  alert(`Validation Admin importée.\n\n${applied} donnée(s) mise(s) à jour.\n${ignored} donnée(s) ignorée(s).`);
  dashboard();
 }catch(err){alert("Import impossible : "+err.message);}
}


function genericFormById(page,id){
 const index=(db.modules[page]||[]).findIndex(x=>String(x.id)===String(id));
 genericForm(page,index);
}
function softDeleteGeneric(page,id){
 const record=(db.modules[page]||[]).find(x=>String(x.id)===String(id));
 if(!record||!canUserChange(record))return alert("Cette donnée est verrouillée ou ne vous appartient pas.");
 const reason=prompt("Motif de suppression :");if(reason===null)return;
 const before=cloneRecord(record);
 record.deleted=true;record.deletedAt=new Date().toISOString();record.deletedBy=user.username;record.deleteReason=reason||"Erreur de saisie";record.updatedAt=record.deletedAt;record.updatedBy=user.username;
 pushHistory(record,"Suppression logique",before,record.deleteReason);audit("Suppression logique","modules."+page,id,record.deleteReason,before,record);save();generic(page);
}
function restoreGeneric(page,id){
 if(user.role!=="ADMIN")return;
 const record=(db.modules[page]||[]).find(x=>String(x.id)===String(id));if(!record)return;
 const before=cloneRecord(record);record.deleted=false;record.updatedAt=new Date().toISOString();record.updatedBy=user.username;pushHistory(record,"Restauration",before);audit("Restauration","modules."+page,id,"",before,record);save();trashPage();
}
function permanentDeleteGeneric(page,id){
 if(user.role!=="ADMIN"||!confirm("Supprimer définitivement ?"))return;
 const rows=db.modules[page]||[];const before=rows.find(x=>String(x.id)===String(id));db.modules[page]=rows.filter(x=>String(x.id)!==String(id));audit("Suppression définitive","modules."+page,id,"",before,null);save();if(CLOUD_BUSINESS_COLLECTIONS.includes(page))cloudDelete(page,id);trashPage();
}
function showGenericHistory(page,id){
 const record=(db.modules[page]||[]).find(x=>String(x.id)===String(id));if(!record)return;
 const rows=record.history||[];
 $("#content").innerHTML=`<div class="panel"><h3>HISTORIQUE — ${esc(id)}</h3><div class="panel-body"><button class="btn secondary" onclick="generic('${page}')">Retour</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead><tbody>${rows.length?rows.map(h=>`<tr><td>${new Date(h.date).toLocaleString("fr-FR")}</td><td>${esc(h.user)}</td><td>${esc(h.action)}</td><td>${esc(h.details||"")}</td></tr>`).join(""):`<tr><td colspan="4">Aucun historique.</td></tr>`}</tbody></table></div></div>`;
}
