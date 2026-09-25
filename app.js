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

const CLOUD_MODULE_COLLECTIONS=new Set(["attendanceWeekly","attendanceQR","employees","payroll","purchases","stock","stockMovements","invoices","clients","suppliers","bank","accounting","treasury","planning","situations","technicalFollowup","quality","nonConformities","equipment","vehicles","fuel","cashEntries","employeeAdvances"]);
const CLOUD_BUSINESS_COLLECTIONS=["projects","quotes","invoices","clientReceipts","requests","editRequests","appro","expenses","purchases","stock","stockMovements","employees","payroll","siteControls","reports","dailyReports","attendanceWeekly","attendanceQR","usageSessions","clients","suppliers","bank","accounting","treasury","planning","situations","technicalFollowup","quality","nonConformities","equipment","vehicles","fuel","cashEntries","employeeAdvances"];
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
 try{
 const payload=cloudSanitize({...record,cloudSyncedAt:new Date().toISOString()});delete payload.__syncConflict;
 await fbStore.collection(collection).doc(String(record.id)).set(payload,{merge:true});
 record.cloudSyncedAt=payload.cloudSyncedAt;
 const key=collection+"::"+String(record.id);
 cloudFingerprints.set(key,recordFingerprint(record));cloudRemoteVersions.set(key,businessTimestamp(record));
 if(notifyTitle&&!record.cloudNotifiedAt&&user.role!=="ADMIN"){
  await createAdminNotification(collection,notifyTitle,`${user.label||user.username} — ${record.project||record.id}`,record.id);
  record.cloudNotifiedAt=new Date().toISOString();
 }
 saveLocalOnly();cloudMarkSynced();
}catch(e){console.warn("cloud generic",collection,e);}
}
let cloudRealtimeRenderTimer=null;
const cloudFingerprints=new Map();
const cloudRemoteVersions=new Map();
const cloudSessionStartedAt=Date.now();

function recordFingerprint(r){
 try{
  const x={...(r||{})};
  delete x.cloudSyncedAt;delete x.cloudNotifiedAt;delete x.__syncConflict;
  return JSON.stringify(x);
 }catch(e){return String(r?.id||"");}
}
function businessTimestamp(r){
 // CRITICAL: cloudSyncedAt is transport metadata, never a business version.
 // Only real create/update times are allowed to decide which data is newer.
 return Date.parse(r?.updatedAt||r?.createdAt||0)||0;
}
function rememberCollectionFingerprints(collection,rows){
 (rows||[]).forEach(r=>{
  if(!r?.id)return;
  const key=collection+"::"+String(r.id);
  cloudFingerprints.set(key,recordFingerprint(r));
  cloudRemoteVersions.set(key,businessTimestamp(r));
 });
}
function ensureSyncBackupData(){
 db.syncRecovery=Array.isArray(db.syncRecovery)?db.syncRecovery:[];
}
function backupBeforeRemoteOverwrite(collection,localRecord,remoteRecord,reason="remote_newer"){
 ensureSyncBackupData();
 const fpLocal=recordFingerprint(localRecord),fpRemote=recordFingerprint(remoteRecord);
 if(fpLocal===fpRemote)return;
 db.syncRecovery.unshift({
  id:"REC-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
  collection,recordId:String(localRecord?.id||remoteRecord?.id||""),
  reason,createdAt:new Date().toISOString(),
  localSnapshot:JSON.parse(JSON.stringify(localRecord||{})),
  remoteSnapshot:JSON.parse(JSON.stringify(remoteRecord||{}))
 });
 if(db.syncRecovery.length>1500)db.syncRecovery.length=1500;
 saveLocalOnly();
}
function pageUsesCollection(page,collection){
 const map={
  projects:["projects","dashboard","dashboardFinance","dashboardTechnique"],
  quotes:["quotes","materials","dashboard","dashboardFinance"],
  invoices:["invoices","dashboard","dashboardFinance"],
  clientReceipts:["clientReceipts","dashboard","dashboardFinance"],
  requests:["appro","dashboard"],
  editRequests:["adminValidations"],
  appro:["appro","cash","dashboard","dashboardFinance"],
  expenses:["expenses","cash","dashboard","dashboardFinance"],
  cashEntries:["cash","dashboard","dashboardFinance"],
  employeeAdvances:["payroll","cash","dashboard","dashboardFinance"],
  purchases:["purchases","stock","expenses","cash","dashboard","dashboardFinance"],
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
    const remote=s.docs.map(d=>({id:d.id,...d.data()}));
    const map=new Map(local.map(r=>[String(r.id),r]));
    let changed=false;

    // Explicit Firestore deletion is authoritative.
    const removed=new Set(s.docChanges().filter(c=>c.type==="removed").map(c=>String(c.doc.id)));
    if(removed.size){
     removed.forEach(id=>{
      const existing=map.get(id);
      if(existing)backupBeforeRemoteOverwrite(collection,existing,{id,deleted:true},"remote_delete");
     });
     local=local.filter(r=>!removed.has(String(r.id)));
     changed=true;
    }

    remote.forEach(r=>{
     const key=collection+"::"+String(r.id);
     const l=local.find(x=>String(x.id)===String(r.id));
     const rt=businessTimestamp(r),lt=businessTimestamp(l);
     cloudRemoteVersions.set(key,rt);

     if(!l){
      local.push(r);changed=true;return;
     }
     if(recordFingerprint(l)===recordFingerprint(r))return;

     // Remote wins only when its BUSINESS update time is truly newer.
     // Equal/ambiguous versions never overwrite silently.
     if(rt>lt || (rt===0 && lt===0)){
      backupBeforeRemoteOverwrite(collection,l,r,rt>lt?"remote_newer":"ambiguous_remote_preferred");
      Object.keys(l).forEach(k=>delete l[k]);Object.assign(l,r);changed=true;
     }else if(rt===lt){
      l.__syncConflict=true;
      console.warn("NYSOA sync conflict (same timestamp)",collection,r.id);
     }
     // If local is newer, keep it. Safe auto-sync will push it later.
    });

    rememberCollectionFingerprints(collection,remote);
    if(changed)replaceCloudCollectionLocalRows(collection,local);
    if(changed)scheduleRealtimeRender(collection);
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
   if(!r?.id||r.__syncConflict)continue;
   const key=collection+"::"+String(r.id);
   const fp=recordFingerprint(r),remoteFp=cloudFingerprints.get(key);
   if(remoteFp===fp)continue;

   const localTs=businessTimestamp(r);
   const remoteTs=cloudRemoteVersions.get(key);

   // Existing cloud record: local may push ONLY if its real updatedAt is newer.
   if(remoteTs!==undefined && localTs<=remoteTs)continue;

   // Record absent from cloud: auto-create only if created/modified during this session.
   // This prevents an old browser cache from resurrecting deleted/stale records.
   if(remoteTs===undefined && (!localTs || localTs < cloudSessionStartedAt-30000))continue;

   try{
    const payload=cloudSanitize({...r,cloudSyncedAt:new Date().toISOString()});
    delete payload.__syncConflict;
    await fbStore.collection(collection).doc(String(r.id)).set(payload,{merge:true});
    r.cloudSyncedAt=payload.cloudSyncedAt;
    cloudFingerprints.set(key,recordFingerprint(r));
    cloudRemoteVersions.set(key,localTs);
   }catch(e){console.warn("safe auto sync",collection,r.id,e);}
  }
 }
 saveLocalOnly();cloudMarkSynced();
}
function startCloudAutoSync(){
 clearInterval(cloudAutoSyncTimer);
 // Listeners establish the cloud baseline first. No blind startup push.
 setTimeout(()=>cloudAutoSyncAll("startup-safe"),3500);
 cloudAutoSyncTimer=setInterval(()=>cloudAutoSyncAll("timer-safe"),7000);
}

function cashTable(){
 const rows=cashMovements(currentProjectContext()).slice(-5).reverse();
 return `<div class="card"><h3>💵 Derniers mouvements de caisse</h3>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Mouvement</th><th>Montant</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(r.label)}</td><td>${r.type==="Sortie"?"−":"+"}${money(r.amount)}</td></tr>`).join("")}</tbody></table></div>`:"<p>Aucun mouvement disponible.</p>"}</div>`;
}

function dashboardDetail(type){
 let title="",rows=[];
 if(type==="revenue"){title="DÉTAIL DU CHIFFRE D’AFFAIRES";rows=invoiceRows().filter(r=>!currentProjectContext()||String(r.project)===String(currentProjectContext())).map(r=>({a:projectLabel(r.project),b:invoiceDisplayNo(r),c:money(invoiceLegacyAmount(r)),d:r.date||""}));}
 if(type==="expenses"){title="DÉTAIL DES DÉPENSES RÉELLES";rows=financialExpenseRows(currentProjectContext()).map(r=>({a:projectLabel(r.project),b:r.label||r.category||"",c:money(r.amount),d:r.fundSource||"Admin"}));}
 if(type==="employees"){title="DÉTAIL DES EMPLOYÉS ACTIFS";rows=(db.modules?.employees||[]).filter(e=>!e.deleted&&employeeStatusLabel(e)==="Actif").map(e=>({a:employeeName(e),b:projectLabel(employeeProject(e))||"Non affecté",c:employeeRole(e),d:employeeStatusLabel(e)}));}
 if(type==="projects"){title="DÉTAIL DES CHANTIERS";rows=accessibleProjects().filter(p=>!currentProjectContext()||String(p.id)===String(currentProjectContext())).map(p=>({a:projectChantierName(p),b:p.client||"",c:(p.progress||0)+"%",d:p.status||""}));}
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
 editRequests:[],
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
if(!Array.isArray(db.editRequests)) db.editRequests=[];
if(!Array.isArray(db.modules.stockMovements)) db.modules.stockMovements=[];
if(!Array.isArray(db.modules.cashEntries)) db.modules.cashEntries=[];
if(!Array.isArray(db.modules.employeeAdvances)) db.modules.employeeAdvances=[];
const canEditRecord=(r)=>canUserChange(r);
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
 return canRequestOwnEdit(record) && withinEditWindow(record) && !isLocked(record);
}
const EDIT_WINDOW_MS=24*60*60*1000;
function canRequestOwnEdit(record){
 if(!record||record.deleted||!["GESTIONNAIRE","CONTROLE","TECHNICIEN"].includes(user?.role))return false;
 const actor=effectiveUserIdentity();
 if(record.ownerTechnicianId&&record.ownerTechnicianId!==actor.technicianId)return false;
 if((user.role==="CONTROLE"||user.role==="TECHNICIEN")&&record.technicalOwner===user.username){
  return !record.technicalOwnerUid||!user.uid||record.technicalOwnerUid===user.uid;
 }
 if(record.ownerUid&&user.uid&&record.ownerUid!==user.uid&&record.ownerUid!==actor.uid)return false;
 return record.owner===user.username;
}
function withinEditWindow(record){
 const created=Date.parse(((user?.role==="CONTROLE"||user?.role==="TECHNICIEN")&&record?.technicalOwner===user.username?record.technicalCreatedAt:record?.createdAt)||"");
 return Number.isFinite(created)&&Date.now()>=created&&Date.now()-created<EDIT_WINDOW_MS;
}
function canOpenOwnEdit(record){return user?.role==="ADMIN"||canRequestOwnEdit(record);}
function requestEditIfRequired(collection,record,proposed,returnTo){
 if(!record)return false;
 if(!canOpenOwnEdit(record)){alert("Cette donnée ne vous appartient pas.");return true;}
 if(user.role==="ADMIN"||canUserChange(record))return false;
 db.editRequests=Array.isArray(db.editRequests)?db.editRequests:[];
 if(db.editRequests.some(x=>x.status==="En attente"&&x.collection===collection&&String(x.recordId)===String(record.id))){
  alert("Une demande de modification est déjà en attente pour cette donnée.");return true;
 }
 const excluded=new Set(["id","owner","ownerUid","createdAt","updatedAt","updatedBy","history","deleted","deletedAt","deletedBy","validatedAt","validatedBy","approvedAt","approvedBy","adminObservation"]);
 const changes={};
 for(const [key,value] of Object.entries(proposed)){
  if(!excluded.has(key)&&JSON.stringify(value)!==JSON.stringify(record[key]))changes[key]=value;
 }
 if(!Object.keys(changes).length){alert("Aucune modification à soumettre.");return true;}
 const actor=effectiveUserIdentity(),now=new Date().toISOString();
 const request={id:"MOD-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),collection,recordId:String(record.id),baseUpdatedAt:record.updatedAt||"",baseFingerprint:recordFingerprint(record),changes,project:record.project||"",owner:record.owner,requester:actor.label||user.username,requesterUid:actor.uid||user.uid||"",requesterRole:user.role,requestedAt:now,updatedAt:now,createdAt:now,status:"En attente"};
 db.editRequests.push(request);audit("Demande de modification","editRequests",request.id,collection+" / "+record.id,null,request);
 saveLocalOnly();cloudWriteGeneric("editRequests",request,"Demande de modification");
 alert("Demande envoyée à l’Admin. La donnée actuelle reste inchangée jusqu’à sa validation.");
 if(typeof returnTo==="function")returnTo();
 return true;
}
function decideEditRequest(id,accept){
 if(user?.role!=="ADMIN")return alert("Réservé à l’Admin.");
 const req=(db.editRequests||[]).find(x=>String(x.id)===String(id));
 if(!req||req.status!=="En attente")return alert("Demande déjà traitée ou introuvable.");
 const allowed=new Set(["projects","expenses","purchases","payroll","requests","clientReceipts","siteControls","reports","dailyReports","employees","attendanceWeekly",...Object.keys(GENERIC_FIELDS)]);
 if(!allowed.has(req.collection))return alert("Module non autorisé pour cette validation.");
 const record=cloudCollectionLocalRows(req.collection).find(x=>String(x.id)===String(req.recordId));
 if(accept&&(!record||record.deleted))return alert("Donnée source supprimée ou introuvable : demande non applicable.");
 if(accept&&(req.baseUpdatedAt!==(record.updatedAt||"")||req.baseFingerprint!==recordFingerprint(record)))return alert("La donnée a changé depuis la demande. Rejetez celle-ci et demandez une nouvelle correction.");
 if(accept){
  if(req.collection==="projects"){
   const source=req.changes.budgetSource||record.budgetSource;
   if(source==="devis"&&Object.hasOwn(req.changes,"budget"))return alert("Budget issu d’un devis validé : modifier le devis d’origine.");
   if(source==="manuel"&&Object.hasOwn(req.changes,"budget")){
    const amount=+req.changes.budget;
    const billed=sum(invoiceRows().filter(x=>String(x.project)===String(record.id)).map(invoiceLegacyAmount));
    const received=sum(receiptRows().filter(x=>String(x.project)===String(record.id)&&x.status==="Validé").map(x=>x.amount));
    if(!Number.isFinite(amount)||amount<0||amount+.01<Math.max(billed,received))return alert("Budget inférieur aux factures ou paiements validés.");
   }
  }
  if(req.collection==="clientReceipts"){
   const proposed={...record,...req.changes},contract=clientContractAmount(proposed.project,proposed.client);
   const already=sum(receiptRows().filter(x=>String(x.id)!==String(record.id)&&x.status==="Validé"&&String(x.project)===String(proposed.project)&&clientPaymentKey(receiptClientName(x))===clientPaymentKey(proposed.client)).map(x=>x.amount));
   if(!contract||+proposed.amount<=0||already+(+proposed.amount)>contract+.01)return alert("Montant client supérieur au contrat ou contrat introuvable.");
   if(proposed.invoiceId){const invoice=invoiceRows().find(x=>String(x.id)===String(proposed.invoiceId));if(!invoice||String(invoice.project)!==String(proposed.project)||clientPaymentKey(invoice.client)!==clientPaymentKey(proposed.client)||invoiceReceiptPaid(invoice.id,record.id)+(+proposed.amount)>invoiceLegacyAmount(invoice)+.01)return alert("Facture ou montant de la tranche incompatible.");}
   req.changes.paymentPercent=+(+proposed.amount/contract*100).toFixed(4);
  }
  if(req.collection==="expenses"&&req.changes.status!=="En attente"&&(req.changes.fundSource||record.fundSource)==="Caisse Gestionnaire"&&!canSpendManagerCash(+((req.changes.amount??record.amount)||0),record.status!=="En attente"&&record.fundSource==="Caisse Gestionnaire"?+record.amount||0:0))return alert("Solde caisse insuffisant pour cette correction.");
  if(req.collection==="purchases"&&(req.changes.paymentStatus||record.paymentStatus)==="Payé"&&(req.changes.fundSource||record.fundSource)==="Caisse Gestionnaire"&&!canSpendManagerCash(+((req.changes.amount??record.amount)||0),record.paymentStatus==="Payé"&&record.fundSource==="Caisse Gestionnaire"?+record.amount||0:0))return alert("Solde caisse insuffisant pour cet achat.");
  if(req.collection==="payroll"&&(req.changes.fundSource||record.fundSource)==="Caisse Gestionnaire"&&!canSpendManagerCash(+((req.changes.totalPaid??record.totalPaid)||0),record.fundSource==="Caisse Gestionnaire"?+record.totalPaid||0:0))return alert("Solde caisse insuffisant pour cette paie.");
  if(req.collection==="payroll"){
   const proposed={...record,...req.changes},ded=+proposed.advanceDeduction||0;
   const oldDed=+record.advanceDeduction||0;
   if(ded>employeeAdvanceBalance(proposed.employeeId)+oldDed+.01||(+proposed.advanceAmount||0)+(+proposed.balanceAmount||0)+ded>(+proposed.grossAmount||0)+.01)return alert("Correction paie incompatible avec le salaire ou la dette d’avance.");
  }
  const before=cloneRecord(record);Object.assign(record,req.changes);record.updatedAt=new Date().toISOString();record.updatedBy=user.username;
  pushHistory(record,"Correction validée par Admin",before,req.id);
  if(req.collection==="payroll"){
   removePayrollAdvanceRepayments(record.id);
   if(+record.advanceDeduction>0)applyAdvanceRepayment(record.employeeId,+record.advanceDeduction,record.advanceRepaymentDate,record.id);
  }
  audit("Correction validée","editRequests",req.id,req.collection+" / "+req.recordId,before,record);
  cloudWriteGeneric(req.collection,record,"Correction validée");
 }
 req.status=accept?"Validée":"Refusée";req.decidedAt=new Date().toISOString();req.decidedBy=user.username;req.updatedAt=req.decidedAt;
 audit(accept?"Demande validée":"Demande refusée","editRequests",req.id,req.collection+" / "+req.recordId,null,req);
 saveLocalOnly();cloudWriteGeneric("editRequests",req,"Décision de correction");adminValidationsPage();
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
async function restoreDeletedRecord(collection,id,inModules=false){
 if(user?.role!=="ADMIN")return alert("Restauration réservée à l’Admin.");
 const rows=inModules?db.modules?.[collection]:db[collection];
 const record=(rows||[]).find(x=>String(x.id)===String(id)&&x.deleted===true);
 if(!record)return alert("Enregistrement supprimé introuvable.");
 if(record.project&&collection!=="projects"&&!(db.projects||[]).some(p=>!p.deleted&&String(p.id)===String(record.project)))return alert("Restaurez d’abord le chantier associé à cette donnée.");
 if(collection==="invoices"&&record.quoteId&&!(db.quotes||[]).some(q=>!q.deleted&&String(q.id)===String(record.quoteId)))return alert("Restaurez d’abord le devis lié à cette facture.");
 if(collection==="clientReceipts"&&record.invoiceId&&!(db.modules?.invoices||[]).some(i=>!i.deleted&&String(i.id)===String(record.invoiceId)))return alert("Restaurez d’abord la facture liée à cet encaissement.");
 const before=cloneRecord(record),now=new Date().toISOString();
 const restored={...record,deleted:false,restoredAt:now,restoredBy:user.username,updatedAt:now,updatedBy:user.username};
 const synced=CLOUD_BUSINESS_COLLECTIONS.includes(collection);
 if(synced&&cloudReady&&navigator.onLine){
  try{
   const payload=cloudSanitize({...restored,cloudSyncedAt:new Date().toISOString()});
   await fbStore.collection(collection).doc(String(id)).set(payload,{merge:true});
   restored.cloudSyncedAt=payload.cloudSyncedAt;
   cloudFingerprints.set(collection+"::"+String(id),recordFingerprint(restored));
   cloudRemoteVersions.set(collection+"::"+String(id),businessTimestamp(restored));
   cloudMarkSynced();
  }catch(error){console.error("Restauration Cloud",collection,id,error);return alert("Restauration interrompue : le Cloud n’a pas accepté la modification. "+(error?.message||error));}
 }
 Object.assign(record,restored);
 pushHistory(record,"Restauration",before);
 audit("Restauration",inModules?"modules."+collection:collection,id,"Donnée restaurée",before,record);
 save();
 if(collection==="quotes")syncProjectQuoteBudget(record.project);
 trashPage();
 if(synced&&(!cloudReady||!navigator.onLine))alert("Restauration enregistrée sur cet appareil. Synchronisez le Cloud dès que la connexion revient.");
}
function restoreRecord(collection,moduleName,id){return restoreDeletedRecord(collection,id,false)}
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
 const rows=[];
 [...new Set([...CLOUD_BUSINESS_COLLECTIONS,"technicalEntries"])].forEach(collection=>{
  if(!Array.isArray(db[collection]))return;
  db[collection].filter(x=>x?.deleted===true&&x.id).forEach(x=>rows.push({collection,label:(menus.ADMIN.find(m=>m[0]===collection)||[])[2]||collection,record:x}));
 });
 Object.entries(db.modules||{}).forEach(([collection,data])=>{if(Array.isArray(data))data.filter(x=>x?.deleted===true&&x.id).forEach(x=>rows.push({collection:"modules."+collection,label:(menus.ADMIN.find(m=>m[0]===collection)||[])[2]||collection,record:x}));});
 rows.sort((a,b)=>String(b.record.deletedAt||"").localeCompare(String(a.record.deletedAt||"")));
 $("#content").innerHTML=`<div class="panel"><h3>CORBEILLE — ${rows.length} donnée(s)</h3><div class="panel-body"><p>Les données supprimées restent récupérables ici, y compris devis, factures et dépenses. Restaurez d’abord le chantier, puis le devis ou la facture si une donnée en dépend. Une suppression définitive ne peut être annulée que depuis une sauvegarde externe.</p><input id="trashSearch" placeholder="Rechercher module, référence ou motif" oninput="filterTrashRows()"></div><div class="table-wrap"><table id="trashTable">
 <thead><tr><th>Module</th><th>Référence</th><th>Supprimé par</th><th>Date</th><th>Motif</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(x=>`<tr data-search="${esc([x.label,x.record.id,x.record.deleteReason].join(' ').toLowerCase())}"><td>${esc(x.label)}</td><td>${esc(x.record.id||"")}</td><td>${esc(x.record.deletedBy||"")}</td><td>${x.record.deletedAt?new Date(x.record.deletedAt).toLocaleString("fr-FR"):""}</td><td>${esc(x.record.deleteReason||"")}</td><td>${x.collection.startsWith("modules.")?`<button class="btn-xs btn-edit" onclick="restoreGeneric('${x.collection.slice(8)}','${x.record.id}')">Restaurer</button><button class="btn-xs btn-delete" onclick="permanentDeleteGeneric('${x.collection.slice(8)}','${x.record.id}')">Supprimer définitivement</button>`:`<button class="btn-xs btn-edit" onclick="restoreRecord('${x.collection}','${x.collection}','${x.record.id}')">Restaurer</button><button class="btn-xs btn-delete" onclick="permanentDelete('${x.collection}','${x.collection}','${x.record.id}')">Supprimer définitivement</button>`}</td></tr>`).join(""):`<tr><td colspan="6">La corbeille est vide.</td></tr>`}
 </tbody></table></div></div>`;
}
function filterTrashRows(){const value=String(document.getElementById('trashSearch')?.value||'').toLowerCase();document.querySelectorAll('#trashTable tbody tr[data-search]').forEach(row=>row.style.display=row.dataset.search.includes(value)?'':'none')}


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

// Plan interne en lecture seule pour l'équipe terrain, avec édition réservée à l'Admin.
for(const role of ["ADMIN","GESTIONNAIRE","CONTROLE","TECHNICIEN"]){
 const after=menus[role].findIndex(item=>item[0]==="quotes"||item[0]==="projects");
 menus[role].splice(after+1,0,["materials","🧱","PRÉVISION MATÉRIAUX"]);
}

function projectFinancialDetail(projectId){
 if(user?.role!=="ADMIN")return alert("La fiche financière et le budget chantier sont réservés à l’Admin.");
 const p=accessibleProjects().find(x=>String(x.id)===String(projectId));if(!p)return;
 const s=projectFinancialSnapshot(projectId);
 $("#content").innerHTML=`<div class="panel"><h3>FICHE FINANCIÈRE — ${esc(projectFullLabel(projectId))}</h3>
 <div class="panel-body"><button class="btn secondary" onclick="projects()">Retour</button></div></div>
 <div class="kpis">
 ${kpi("💼","green","BUDGET",money(projectBudgetAmount(p)))}
 ${kpi("✅","teal","DEVIS VALIDÉS",money(s.validated))}
 ${kpi("🧾","blue","FACTURÉ",money(s.invoiced))}
 ${kpi("💳","green","ENCAISSÉ",money(s.received))}
 ${kpi("📊","blue","RESTE À PAYER CONTRAT",money(s.contractRemaining))}
 ${kpi("⏳","orange","RESTE À FACTURER",money(s.toInvoice))}
 ${kpi("⚠","orange","CRÉANCE CLIENT",money(s.receivable))}
 ${kpi("💸","orange","COÛT RÉEL",money(s.actual))}
 ${kpi("📌","purple","COÛT ENGAGÉ",money(s.committed))}
 ${kpi("📈","teal","MARGE PROVISOIRE",money(s.margin))}
 ${kpi("👛","purple","SOLDE CAISSE",money(s.cash))}
 </div>
 <div class="panel" style="margin-top:12px"><h3>LOGIQUE</h3><div class="panel-body">
  <p><b>Reste à facturer</b> = Devis validés − Facturation.</p>
  <p><b>Créance facturée</b> = Facturation − Encaissements validés. <b>Reste à payer contrat</b> = Contrat − Encaissements validés.</p>
  <p><b>Coût engagé</b> = Coût réel + Achats approuvés/effectués/livrés non payés.</p>
  <p><b>Marge provisoire</b> = Chiffre d’affaires facturé − Coût réel.</p>
 </div></div>${financialExpenseDetail(projectId)}`;
}

function projectMetrics(id){
 const p=accessibleProjects().find(x=>String(x.id)===String(id))||{};
 const entries=cashMovements(id),app=sum(entries.filter(x=>x.type==="Entrée").map(x=>x.amount));
 const cashOut=sum(entries.filter(x=>x.type==="Sortie").map(x=>x.amount));
 const dep=sum(financialExpenseRows(id).map(r=>r.amount));
 const budget=projectBudgetAmount(p);
 return {budget,app,dep,cash:app-cashOut,remaining:budget-dep};
}
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

function printA4AutoFit(){
 try{
  document.documentElement.classList.add("print-a4-autofit");
  window.print();
 }finally{
  setTimeout(()=>document.documentElement.classList.remove("print-a4-autofit"),500);
 }
}

function boot(){
 try{migrateProjectChantierFields();}catch(e){console.warn('migration chantier',e);}
ensureSecurityData();quarantineLegacyInvoices();touchCurrentUser();if(user.role!=="ADMIN"&&(user.role!=="TECHNICIEN"||technicianSessionProfile()))startUsageSession();$("#login").classList.add("hidden");$("#app").classList.remove("hidden");const actor=effectiveUserIdentity();$("#currentUserLabel").textContent=actor.label||user.label;$("#today").textContent=new Date().toLocaleDateString("fr-FR");$("#exerciseYear").textContent=String(new Date().getFullYear());$("#resetTestDataBtn").classList.toggle("hidden",user.role!=="ADMIN");renderMenu();
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
 $("#menu").innerHTML=list.map(m=>`<button class="menu-btn" data-page="${m[0]}"><span class="ico">${m[1]}</span>${m[2]}</button>`).join("")+
   `<button class="menu-btn" data-page="changePassword"><span class="ico">🔐</span>CHANGER MON MOT DE PASSE</button>`;
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
 if(!v||v===ALL_PROJECTS_CONTEXT)return "";
 return (db.projects||[]).some(p=>String(p.id)===String(v)&&!p.deleted)?v:"";
}
function userCanAccessProject(projectId){
 if(!user||user.role!=="CONTROLE")return true;
 const assigned=Array.isArray(user.assignedProjects)?user.assignedProjects:[];
 return assigned.length===0||assigned.map(String).includes(String(projectId));
}
function accessibleProjects(){return (db.projects||[]).filter(p=>!p.deleted&&!!(p.chantier||p.name||p.projectName||p.client||p.start||p.end)&&userCanAccessProject(p.id));}
function projectContextOptions(selected=currentProjectContext()){
 return `<option value="${ALL_PROJECTS_CONTEXT}" ${!selected?"selected":""}>Tous les chantiers</option>`+
  accessibleProjects().map(p=>`<option value="${esc(p.id)}" ${String(selected)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("");
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
 return `<div class="project-context-note">🏗 Chantier sélectionné : <b>${esc(pr?projectFullLabel(p):p)}</b> <button class="btn-xs" onclick="setGlobalProjectContext('')">Afficher tout</button></div>`;
}

function go(page){cloudCurrentPage=page;if(user?.role==="ADMIN")markNotificationsRead(page);if(user&&cloudReady)updatePresence(document.hidden?"inactive":"online");document.querySelectorAll(".menu-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));({dashboard:dashboard,dashboardFinance:dashboardFinance,dashboardTechnique:dashboardTechnique,quotes:quotes,materials:materialPlanPage,invoices:invoicesPage,clientReceipts:clientReceiptsPage,employees:employeesPage,qrAttendance:qrAttendancePage,technicianMyIdentity:technicianMyIdentity,technicians:techniciansPage,payroll:payrollPage,expenses:expensesPage,appro:approPage,cash:cashPage,projects:projects,siteControls:siteControlsPage,reports:reports,attendance:attendance,technicalRecap:technicalRecap,adminValidations:adminValidationsPage,usageTime:usageTimePage,purchases:purchasesPage,stock:stockPage,dailyReports:dailyReportsPage,presenceUsers:adminPresencePage,trash:trashPage,audit:auditPage,logicAudit:logicAuditPage,changePassword:changePasswordPage}[page]||generic)(page);setTimeout(renderGlobalProjectSelector,0)}
function changePasswordPage(){
 const account=fbAuth?.currentUser;
 if(!account)return alert("Veuillez vous connecter à l’ERP.");
 $("#content").innerHTML=`<div class="panel"><h3>CHANGER MON MOT DE PASSE</h3><div class="panel-body">
 <p>Compte : <strong id="passwordAccountEmail"></strong></p>
 <form id="changePasswordForm" class="form-grid" autocomplete="off">
 <label>Mot de passe actuel<input name="currentPassword" type="password" autocomplete="current-password" required></label>
 <label>Nouveau mot de passe<input name="newPassword" type="password" autocomplete="new-password" minlength="6" required></label>
 <label>Confirmer le nouveau mot de passe<input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required></label>
 <div class="form-actions full"><button class="btn primary" type="submit">Enregistrer le nouveau mot de passe</button></div>
 <p id="changePasswordMessage" class="full" role="status" aria-live="polite"></p>
 </form></div></div>`;
 $("#passwordAccountEmail").textContent=account.email||"Adresse non disponible";
 $("#changePasswordForm").onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),message=$("#changePasswordMessage");
  const oldPass=form.elements.currentPassword.value,newPass=form.elements.newPassword.value;
  if(newPass!==form.elements.confirmPassword.value){message.textContent="Les nouveaux mots de passe ne correspondent pas.";return;}
  if(newPass.length<6){message.textContent="Le nouveau mot de passe doit contenir au moins 6 caractères.";return;}
  if(!account.email){message.textContent="Ce compte n’a pas d’adresse e-mail Firebase.";return;}
  button.disabled=true;message.textContent="Vérification et mise à jour en cours…";
  try{
   const credential=firebase.auth.EmailAuthProvider.credential(account.email,oldPass);
   await account.reauthenticateWithCredential(credential);
   await account.updatePassword(newPass);
   form.reset();message.textContent="Mot de passe modifié. Utilisez le nouveau mot de passe à votre prochaine connexion.";
  }catch(error){
   const invalid=["auth/invalid-credential","auth/wrong-password","auth/invalid-login-credentials"];
   message.textContent=invalid.includes(error.code)?"Mot de passe actuel incorrect.":
    error.code==="auth/weak-password"?"Le nouveau mot de passe est trop faible.":
    error.code==="auth/network-request-failed"?"Connexion Internet indisponible. Réessayez.":
    "Modification impossible ("+(error.code||"erreur inconnue")+"). Réessayez plus tard.";
  }finally{button.disabled=false;}
 };
}
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
 const manual=manualExpenseRows().filter(x=>x.status!=="En attente"&&(!projectId||String(x.project)===String(projectId))).reduce((n,x)=>n+(+x.amount||0),0);
 const purchases=(db.modules?.purchases||[]).filter(x=>!x.deleted&&x.paymentStatus==="Payé"&&(!projectId||String(x.project)===String(projectId))).reduce((n,x)=>n+(+x.amount||0),0);
 const generic=(db.modules?.expenses||[]).filter(x=>!x.deleted&&(!projectId||String(x.project)===String(projectId))).reduce((n,x)=>n+moduleExpenseAmount(x),0);
 return manual+purchases+generic+payrollExpenseTotal(projectId);
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
function receiptRows(){
 db.clientReceipts=Array.isArray(db.clientReceipts)?db.clientReceipts:[];
 return db.clientReceipts.filter(r=>!r.deleted);
}
function clientPaymentKey(name){return String(name||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLocaleLowerCase("fr-FR");}
function receiptClientName(r){return String(r.client||r.clientName||invoiceRows().find(i=>String(i.id)===String(r.invoiceId))?.client||"").trim();}
function clientContractAmount(projectId,client,asOf=erpToday()){
 if(!projectId||!clientPaymentKey(client))return 0;
 const key=clientPaymentKey(client);
 const project=(db.projects||[]).find(p=>!p.deleted&&String(p.id)===String(projectId));
 const directContract=project?.budgetSource==="manuel"&&clientPaymentKey(project.client)===key?projectBudgetAmount(project):0;
 const quotes=acceptedQuotesForProject(projectId).filter(q=>!q.deleted&&clientPaymentKey(q.client)===key&&(!q.date||String(q.date).slice(0,10)<=asOf));
 let total=project?.budgetSource==="manuel"&&clientPaymentKey(project.client)===key?directContract:sum(quotes.map(q=>quoteFinancials(q).ttc));
 const covered=new Set(quotes.map(q=>String(q.id))),groups=new Map();
 invoiceRows().filter(i=>String(i.project)===String(projectId)&&clientPaymentKey(i.client||i.values?.[1])===key&&(!i.date||String(i.date).slice(0,10)<=asOf)).forEach(i=>{
  if(i.quoteId&&covered.has(String(i.quoteId)))return;
  const group=i.quoteId?"devis:"+i.quoteId:"sans-devis",old=groups.get(group)||{contract:0,invoiced:0};
  old.contract=Math.max(old.contract,+i.quoteAmount||0);old.invoiced+=invoiceLegacyAmount(i);groups.set(group,old);
 });
 const unlinked=groups.get("sans-devis");groups.delete("sans-devis");
 groups.forEach(g=>{total+=Math.max(g.contract,g.invoiced);});
 if(unlinked)total=Math.max(total,Math.max(unlinked.contract,unlinked.invoiced));
 return total;
}
function clientPaymentRows(projectId="",asOf=erpToday()){
 const clients=new Map();
 const active=new Set(accessibleProjects().map(p=>String(p.id)));
 const add=(project,client)=>{const name=String(client||"").trim(),key=String(project||"")+"::"+clientPaymentKey(name);if(name&&project&&active.has(String(project))&&!clients.has(key))clients.set(key,{project,client:name});};
 (db.projects||[]).filter(p=>!p.deleted&&p.budgetSource==="manuel"&&(!projectId||String(p.id)===String(projectId))).forEach(p=>add(p.id,p.client));
 acceptedQuotesForProject(projectId).filter(q=>!q.deleted).forEach(q=>add(q.project,q.client));
 invoiceRows().filter(i=>!projectId||String(i.project)===String(projectId)).forEach(i=>add(i.project,i.client||i.values?.[1]));
 receiptRows().filter(r=>!projectId||String(r.project)===String(projectId)).forEach(r=>add(r.project,receiptClientName(r)));
 return [...clients.values()].map(row=>{
  const contract=clientContractAmount(row.project,row.client,asOf);
  const receipts=receiptRows().filter(r=>r.status==="Validé"&&String(r.project)===String(row.project)&&clientPaymentKey(receiptClientName(r))===clientPaymentKey(row.client)&&(!r.date||String(r.date).slice(0,10)<=asOf));
  const received=sum(receipts.map(r=>r.amount||r.receivedAmount));
  return {...row,contract,received,remaining:Math.max(0,contract-received),percent:contract?received/contract*100:null};
 }).filter(row=>row.contract||row.received);
}
function totalValidatedQuotes(projectId=""){
 return acceptedQuotesForProject(projectId).filter(q=>!q.deleted)
  .reduce((n,q)=>n+quoteFinancials(q).ttc,0);
}
function projectFinancialSnapshot(projectId=""){
 const f=financeScope(projectId),{validated,invoiced,received,actual,committed}=f;
 return {
  validated,invoiced,received,
  toInvoice:Math.max(0,f.contract-invoiced),
  receivable:Math.max(0,invoiced-received),
  actual,committed,
  margin:invoiced-actual,
  cash:f.cash,
  remaining:f.budgetRemaining,contractRemaining:f.contractRemaining
 };
}

function dashboardFinance(){
 if(user?.role!=="ADMIN")return dashboardCore();
 const ctx=currentProjectContext(),f=financeScope(ctx);
 const totalBudget=f.budget,validated=f.validated,invoiced=f.invoiced,received=f.received;
 const receivable=Math.max(0,invoiced-received);
 const actual=f.actual,committed=f.committed;
 const margin=invoiced-actual;
 const cashBal=f.cash;
 const pendingAppro=(db.requests||[]).filter(x=>x.status==="En attente"&&!x.deleted&&(!ctx||String(x.project)===String(ctx))).length;
 const pendingReceipts=receiptRows().filter(x=>x.status==="En attente"&&(!ctx||String(x.project)===String(ctx))).length;
 $("#content").innerHTML=workspaceBanner("finance","ESPACE FINANCE","Contrat, facturation, encaissements, coûts et caisse")+projectContextNotice()+
 `<div class="kpis finance-kpis-v460">
 ${kpi("💼","green","BUDGET PROJETS",money(totalBudget),"Prévision chantier")}
 ${kpi("📉","blue","BUDGET RESTANT",money(f.budgetRemaining),"Budget − toutes dépenses")}
 ${kpi("✅","teal","DEVIS VALIDÉS",money(validated),"Valeur contractuelle")}
 ${kpi("🧾","blue","CHIFFRE D’AFFAIRES",money(invoiced),"Factures / tranches émises")}
 ${kpi("💳","green","ENCAISSEMENTS CLIENTS",money(received),"Vola tena voaray")}
 ${kpi("📊","blue","RESTE À PAYER CONTRAT",money(f.contractRemaining),"Contrats − encaissements validés")}
 ${kpi("⏳","orange","CRÉANCES CLIENTS",money(receivable),"Facturé non encaissé")}
 ${kpi("💸","orange","COÛT RÉEL",money(actual),"Dépenses + paie")}
 ${kpi("📌","purple","COÛT ENGAGÉ",money(committed),"Réel + achats engagés non payés")}
 ${kpi("📈","teal","MARGE PROVISOIRE",money(margin),"CA − coût réel")}
 ${kpi("👛","purple","SOLDE CAISSE",money(cashBal),"Entrées réelles − dépenses Gestionnaire")}
 ${kpi("🏦","blue","TRÉSORERIE GÉNÉRALE",money(financeScope().treasury),"Tous clients encaissés − paiements Admin − transferts caisse")}
 ${kpi("📋","blue","À VALIDER",pendingAppro+pendingReceipts,"Appro + encaissements")}
 </div>
 <div class="finance-logic-strip">
  <div><b>Reste à facturer</b><span>${money(Math.max(0,f.contract-invoiced))}</span></div>
  <div><b>Créances clients</b><span>${money(receivable)}</span></div>
  <div><b>Reste à payer contrats</b><span>${money(f.contractRemaining)}</span></div>
  <div><b>Achats engagés non payés</b><span>${money(committedPurchases(ctx))}</span></div>
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
 </div>${financialExpenseDetail(ctx)}`;
}
function dashboardTechnique(){
 const ctx=currentProjectContext(),projects=accessibleProjects().filter(p=>!ctx||String(p.id)===String(ctx));
 const reports=(db.reports||[]).filter(r=>!r.deleted&&(!ctx||String(r.project)===String(ctx)));
 $("#content").innerHTML=workspaceBanner("technique","ESPACE TECHNIQUE","Pilotage des chantiers, planning, avancement, qualité et rapports de contrôle")+
 `<div class="kpis">
 ${kpi("🏗","green","CHANTIERS EN COURS",projects.filter(x=>x.status==="En cours").length)}
 ${kpi("📈","blue","AVANCEMENT MOYEN",Math.round(sum(projects.map(x=>x.progress))/Math.max(projects.length,1))+"%")}
 ${kpi("📋","orange","RAPPORTS TECHNIQUES",reports.length)}
 ${kpi("⚠","purple","NON-CONFORMITÉS",reports.filter(x=>x.conformity==="Non conforme").length)}
 ${kpi("✅","teal","RAPPORTS VALIDÉS",reports.filter(x=>x.status==="Validé").length)}
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
function projectBudgetSourceChanged(select){
 const input=document.getElementById("projectBudgetAmount"),hint=document.getElementById("projectBudgetHint");
 if(!input)return;
 if(select.value==="devis"){
  if(!input.readOnly)input.dataset.manualBudget=input.value;
  const id=document.querySelector('#fProject input[name="id"]')?.value||"";
  input.value=sum(acceptedQuotesForProject(id).map(q=>quoteFinancials(q).ttc));input.readOnly=true;input.required=false;
  if(hint)hint.textContent="Budget calculé depuis les devis acceptés, remises incluses. Sans devis accepté, il reste à 0 Ar.";
 }else{
  input.value=input.dataset.manualBudget||"";input.readOnly=false;input.required=true;
  if(hint)hint.textContent="Budget saisi directement, indépendant des devis.";
 }
}


function totalInvoiced(projectId=""){
 const rows=(typeof invoiceRows==="function")
   ? invoiceRows()
   : ((db.modules?.invoices||[]).filter(r=>!r.deleted));
 return rows
   .filter(r=>!projectId||String(r.project||"")===String(projectId))
   .reduce((n,r)=>n+(typeof invoiceLegacyAmount==="function"
     ? invoiceLegacyAmount(r)
     : (+r.trancheAmount||+r.values?.[2]||0)),0);
}
function safeTotalInvoiced(projectId=""){
 try{return totalInvoiced(projectId)||0;}
 catch(e){console.warn("Dashboard total facturé",e);return 0;}
}

function dashboardAutoCharts(){const ctx=currentProjectContext(),projects=accessibleProjects().filter(p=>!ctx||String(p.id)===String(ctx)),data=projects.map(p=>({label:projectChantierName(p),rev:financeScope(p.id).invoiced,dep:financeScope(p.id).actual})),mx=Math.max(1,...data.flatMap(x=>[x.rev,x.dep]));const bars=data.length?data.map(x=>`<div class="auto-chart-row"><b>${esc(x.label)}</b><div><div class="auto-chart-track"><div class="auto-chart-bar revenue" style="width:${Math.min(100,x.rev/mx*100)}%"></div></div><small>CA ${money(x.rev)}</small><div class="auto-chart-track"><div class="auto-chart-bar expense" style="width:${Math.min(100,x.dep/mx*100)}%"></div></div><small>Dép. ${money(x.dep)}</small></div></div>`).join(""):'<div class="empty-state">Aucune donnée.</div>';const cats={};financialExpenseRows(ctx).forEach(r=>{const k=r.category||r.source||"Autre";cats[k]=(cats[k]||0)+(+r.amount||0)});const cm=Math.max(1,...Object.values(cats)),cb=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="auto-chart-row"><b>${esc(k)}</b><div><div class="auto-chart-track"><div class="auto-chart-bar expense" style="width:${Math.min(100,v/cm*100)}%"></div></div><small>${money(v)}</small></div></div>`).join("")||'<div class="empty-state">Aucune dépense.</div>';return`<div class="grid-2 auto-dashboard-charts"><div class="panel"><h3>📊 CA / DÉPENSES PAR CHANTIER</h3><div class="panel-body">${bars}</div></div><div class="panel"><h3>📉 DÉPENSES PAR CATÉGORIE</h3><div class="panel-body">${cb}</div></div></div>`;}

function monthlyFinanceChart(kind,projectId=""){
 const year=Number(erpToday().slice(0,4)),months=Array.from({length:12},()=>0);
 const rows=kind==="revenue"?invoiceRows().filter(r=>financeProjectIsActive(r.project)&&(!projectId||String(r.project)===String(projectId))).map(r=>({date:r.date,amount:invoiceLegacyAmount(r)}))
  :financialExpenseRows(projectId).map(r=>({date:r.date,amount:+r.amount||0}));
 let undated=0;
 rows.forEach(r=>{const d=String(r.date||"").slice(0,10),month=+d.slice(5,7);
  if(/^\d{4}-\d{2}-\d{2}$/.test(d)&&+d.slice(0,4)===year&&month>=1&&month<=12&&d<=erpToday())months[month-1]+=+r.amount||0;
  else if(!d)undated+=+r.amount||0;
 });
 const budget=kind==="expenses"?financeScope(projectId).budget:0;
 const max=Math.max(1,budget,...months),ticks=[max,max/2,0];
 return `<div class="finance-chart" role="img" aria-label="${kind==="revenue"?"Chiffre d’affaires":"Dépenses"} mensuel ${year}">
 <div class="finance-chart-axis">${ticks.map(v=>`<span>${esc(new Intl.NumberFormat("fr-FR",{notation:"compact",maximumFractionDigits:1}).format(v))}</span>`).join("")}</div>
 <div class="finance-chart-plot"><div class="finance-chart-columns">${months.map((v,i)=>`<div class="finance-chart-month"><div class="finance-chart-bar ${kind}" style="height:${Math.max(0,Math.min(100,v/max*100))}%" title="${esc(String(i+1).padStart(2,"0"))}/${year} : ${esc(money(v))}"></div><small>${["J","F","M","A","M","J","J","A","S","O","N","D"][i]}</small></div>`).join("")}</div>${kind==="expenses"&&budget?`<div class="finance-chart-budget" style="bottom:${budget/max*100}%" title="Budget initial : ${esc(money(budget))}"></div>`:""}</div>
 </div><div class="finance-chart-note">${kind==="expenses"?`Barres : dépenses mensuelles · Budget initial total : ${money(budget)}.`:`Factures émises par mois (${year}).`}${undated?` · ${money(undated)} sans date, hors graphique.`:""}</div>`;
}
function expenseCategoryChart(projectId=""){
 const totals=new Map();financialExpenseRows(projectId).forEach(r=>{const key=String(r.category||r.source||"Autre");totals.set(key,(totals.get(key)||0)+(+r.amount||0));});
 const rows=[...totals].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]),total=sum(rows.map(x=>x[1]));
 const colors=["#1463b8","#e59a1a","#2e9c56","#d63b3b","#8e24aa","#10a9b6"];
 let offset=0;const stops=rows.map(([name,value],i)=>{const start=offset;offset+=value/total*100;return `${colors[i%colors.length]} ${start}% ${offset}%`;});
 return `<div class="finance-donut-wrap"><div class="finance-donut" style="background:${total?`conic-gradient(${stops.join(",")})`:"#e7edf3"}" role="img" aria-label="Répartition des dépenses : ${total?money(total):"aucune dépense"}"><span>${total?money(total):"0 Ar"}</span></div>
 <div class="finance-category-list">${rows.length?rows.map(([name,value],i)=>`<div><i style="background:${colors[i%colors.length]}"></i><span>${esc(name)}</span><b>${money(value)}</b></div>`).join(""):'<div class="finance-no-data">Aucune dépense enregistrée.</div>'}</div></div>`;
}


function totalClientReceipts(projectId=""){
 const rows=receiptRows();
 return rows.filter(r=>r.status==="Validé"&&(!projectId||String(r.project||"")===String(projectId)))
   .reduce((n,r)=>n+(+r.amount||+r.receivedAmount||+r.values?.[2]||0),0);
}


function totalExpenses(projectId=""){
 try{
  if(typeof totalOperatingExpenses==="function")return totalOperatingExpenses(projectId)||0;
 }catch(e){}
 const rows=(db.expenses||[]);
 return (Array.isArray(rows)?rows:[])
   .filter(r=>!r.deleted&&(!projectId||String(r.project||"")===String(projectId)))
   .reduce((n,r)=>n+(+r.amount||0),0);
}


function safeMetric(fn,fallback=0){
 try{
  const v=fn();
  return Number.isFinite(+v)?+v:fallback;
 }catch(e){
  console.warn("Dashboard metric fallback",e);
  return fallback;
 }
}

function dashboardCore(){
 const ctx=currentProjectContext(),visibleProjects=accessibleProjects().filter(p=>!ctx||String(p.id)===String(ctx));
 const finances=financeScope(ctx);
 let totalBudget=finances.budget;
 let totalApp=sum(finances.cashRows.filter(x=>x.type==="Entrée").map(x=>x.amount));
 let totalRequests=sum(db.requests.map(x=>+x.amount||0));
 let totalAppDisplayed=totalApp;
 let totalDep=finances.actual;
 let cashBal=finances.cash;
 let invoices=db.modules.invoices||[];
 let employees=db.modules.employees||[];
 let stock=db.modules.stock||[];
 let totalRevenue=finances.invoiced;
 let totalReceived=finances.received;
 let netProfit=totalRevenue-totalDep;
 let activeEmployees=employees.filter(e=>!e.deleted&&employeeStatusLabel(e)==="Actif").length;
 let todayKey=erpToday();
 const attendanceByEmployee=new Map();
 (db.modules.attendanceWeekly||[]).filter(r=>!r.deleted).forEach(r=>(r.entries||[]).forEach(e=>{
  const value=e.states?.[todayKey]==="P"?1:e.states?.[todayKey]==="H"?0.5:0;
  if(value)attendanceByEmployee.set(String(e.employeeKey),Math.max(attendanceByEmployee.get(String(e.employeeKey))||0,value));
 }));
 let attendanceToday=sum([...attendanceByEmployee.values()]);
 let chartEmpty=`<div class="empty-state">Aucune donnée disponible pour le moment.</div>`;
 let alertItems=[];
 if(stock.length){
   let lowStock=stock.filter(r=>!r.deleted&&+(r.values?.[1]||0)<=5).length;
   if(lowStock)alertItems.push(`Stock faible : ${lowStock} article(s)`);
 }
 let overdueProjects=visibleProjects.filter(p=>p.status==="En retard").length;
 if(overdueProjects)alertItems.push(`${overdueProjects} chantier(s) en retard`);
 let pendingRequests=db.requests.filter(x=>!x.deleted&&x.status==="En attente"&&(!ctx||String(x.project)===String(ctx))).length;
 if(pendingRequests)alertItems.push(`${pendingRequests} demande(s) d’approvisionnement en attente`);
 const dailyReminder=user.role!=="ADMIN"?dailyReportReminderHtml():"";

 if(user.role==="GESTIONNAIRE"){
  $("#content").innerHTML=dailyReminder+workspaceBanner("general","VUE GÉNÉRALE GESTIONNAIRE","Synthèse des opérations autorisées.")+
  `<div class="kpis">
    ${kpi("💵","green","ENTRÉES DE CAISSE REÇUES",money(totalAppDisplayed))}
    ${kpi("👛","blue","DÉPENSES DE CAISSE",money(sum(finances.cashRows.filter(r=>r.type==="Sortie").map(r=>r.amount))))}
    ${kpi("💰","orange","SOLDE CAISSE",money(cashBal))}
    ${kpi("📋","purple","DEMANDES EN ATTENTE",pendingRequests)}
    ${kpi("👥","teal","JOURS POINTÉS AUJOURD’HUI",attendanceToday)}
  </div>
  <div class="notice">
 Les demandes d’approvisionnement ne créditent pas la caisse. Seules les entrées réellement remises au Gestionnaire l’alimentent. Les dépenses Admin ne diminuent pas cette caisse.
 </div>
  ${cashTable()}${dashboardAutoCharts()}`;return;
 }
 if(user.role==="CONTROLE"){
  $("#content").innerHTML=`<div class="kpis">
    ${kpi("🏗","green","CHANTIERS EN COURS",visibleProjects.filter(x=>x.status==="En cours").length)}
    ${kpi("📊","blue","RAPPORTS TECHNIQUES",db.reports.length)}
    ${kpi("✅","orange","RAPPORTS VALIDÉS",db.reports.filter(x=>x.status==="Validé").length)}
    ${kpi("⚠","purple","NON-CONFORMITÉS",db.reports.filter(x=>x.conformity==="Non conforme").length)}
    ${kpi("👷","teal","TECHNICIENS ACTIFS",user.role==="CONTROLE"?1:0)}
  </div>${reportsTable()}`;return;
 }
 $("#content").innerHTML=projectContextNotice()+`<div class="sync-guide">
 <b>☁ Synchronisation automatique :</b> les données sont enregistrées dans le Cloud et mises à jour en temps réel sur les appareils connectés. Aucun fichier à télécharger ou importer.
</div>
<div class="kpis">
 ${kpi("📈","green","CHIFFRE D’AFFAIRES (TTC)",money(totalRevenue),"Calculé depuis les factures")}
 ${kpi("👛","blue","DÉPENSES TOTALES",money(totalDep),"Suivi réel")}
 ${kpi("💰","orange","BÉNÉFICE NET",money(netProfit),"CA moins dépenses")}
 ${kpi("🏗","purple","NOMBRE DE CHANTIERS",visibleProjects.length,"Total enregistré")}
 ${kpi("👥","teal","EMPLOYÉS ACTIFS",activeEmployees,"Effectif enregistré")}
 </div>
 <div class="grid-3">
  <div class="panel"><h3>CHIFFRE D’AFFAIRES (TTC) PAR MOIS</h3>${monthlyFinanceChart("revenue",ctx)}</div>
  <div class="panel"><h3>DÉPENSES VS BUDGET (PAR MOIS)</h3>${monthlyFinanceChart("expenses",ctx)}</div>
  <div class="panel"><h3>RÉPARTITION DES DÉPENSES</h3>${expenseCategoryChart(ctx)}</div>
 </div>
 <div class="grid-2" style="margin-top:12px">
  <div class="panel"><h3>AVANCEMENT DES CHANTIERS</h3>${visibleProjects.length?projectsTable(true):chartEmpty}</div>
  <div>
   <div class="panel"><h3>SITUATION FINANCIÈRE GLOBALE</h3><div class="panel-body">
    <table><tr><td>Total budget projets</td><td><b>${money(totalBudget)}</b></td></tr><tr><td>Budget restant</td><td><b>${money(finances.budgetRemaining)}</b></td></tr><tr><td>Encaissements clients validés</td><td>${money(totalReceived)}</td></tr><tr><td>Transferts vers caisse gestionnaire</td><td>${money(totalApp)}</td></tr><tr><td>Dépenses réelles (dont salaires)</td><td>${money(totalDep)}</td></tr><tr><td>Trésorerie générale (tous chantiers)</td><td><b>${money(financeScope().treasury)}</b></td></tr><tr><td>Disponible caisse gestionnaire</td><td style="color:#078b4c"><b>${money(cashBal)}</b></td></tr></table>
   </div></div>
  </div>
 </div>
 <div class="grid-3" style="margin-top:12px">
  <div class="panel"><h3>BUDGET RESTANT PAR CHANTIER</h3><div class="panel-body">${visibleProjects.length?visibleProjects.slice(0,5).map(p=>{let m=projectMetrics(p.id);return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee"><span>${esc(projectChantierName(p))}</span><b>${money(m.remaining)}</b></div>`}).join(""):`<div class="empty-state">Aucun chantier enregistré.</div>`}</div></div>
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

function dashboard(){
 try{
  return dashboardCore();
 }catch(e){
  console.error("Dashboard non bloquant",e);
  const msg=(e&&e.message)?e.message:String(e||"Erreur inconnue");
  const content=document.getElementById("content");
  if(content){
   content.innerHTML=`<div class="panel"><h3>TABLEAU DE BORD</h3>
    <div class="panel-body">
     <div class="notice">Le tableau de bord a rencontré une erreur non critique. Les modules ERP restent accessibles.</div>
     <p><b>Détail :</b> ${esc(msg)}</p>
    </div></div>`;
  }
  return null;
 }
}

function projectsTable(compact=false){const ctx=currentProjectContext();return `<div class="table-wrap"><table><thead><tr><th>Chantier</th><th>Client</th><th>Début</th><th>Fin prévue</th><th>Avancement</th><th>Statut</th></tr></thead><tbody>${accessibleProjects().filter(p=>!ctx||String(p.id)===String(ctx)).map(p=>`<tr><td>${esc(projectChantierName(p))}<br>${esc(projectWorkName(p))}</td><td>${esc(p.client||"")}</td><td>${esc(p.start||"")}</td><td>${esc(p.end||"")}</td><td><div class="progress"><span style="width:${+p.progress||0}%"></span></div>${+p.progress||0}%</td><td><span class="badge b-blue">${esc(p.status||"")}</span></td></tr>`).join("")}</tbody></table></div>`}
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
         <th>Chantier / lieu</th><th>Projet / travaux</th><th>Client</th>${budgetCol}
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
           }else if(isOwner && user.role==="GESTIONNAIRE"){
             actions=`<button class="btn-xs btn-edit" onclick="projectForm('${p.id}')">${canUserChange(p)?"Modifier":"Demander correction"}</button>
                      ${canUserChange(p)?`<button class="btn-xs btn-delete" onclick="softDeleteRecord('projects','projects','${p.id}')">Supprimer</button>`:""}
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
             <td>${esc(projectChantierName(p))}</td>
             <td>${esc(projectWorkName(p))}</td>
             <td>${esc(p.client)}</td>
             ${user.role==="ADMIN"?`<td>${money(projectBudgetAmount(p))}</td>`:""}
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
 if(p && !canOpenOwnEdit(p)){
   alert("Vous pouvez modifier uniquement les chantiers que vous avez créés.");
   return projects();
 }

 const quoteBudget=p?acceptedQuotesForProject(p.id).length>0:false;
 const budgetSource=p?.budgetSource==="manuel"?"manuel":p?.budgetSource==="devis"?"devis":quoteBudget?"devis":"manuel";
 const budgetField=user.role==="ADMIN"
   ?`<label>Origine du budget<select name="budgetSource" onchange="projectBudgetSourceChanged(this)"><option value="devis" ${budgetSource==="devis"?"selected":""}>Depuis devis validé</option><option value="manuel" ${budgetSource==="manuel"?"selected":""}>Saisie directe sans devis</option></select></label><label>Budget chantier (Ar)<input id="projectBudgetAmount" name="budget" type="number" min="0" step="0.01" value="${p?projectBudgetAmount(p):""}" ${budgetSource==="devis"?'readonly':'required'}></label><div id="projectBudgetHint" class="notice full">${budgetSource==="devis"?'Budget calculé depuis les devis acceptés, remises incluses. Sans devis accepté, il reste à 0 Ar.':'Budget saisi directement, indépendant des devis.'}</div>`
   :"";

 $("#content").innerHTML=`<div class="panel">
   <h3>${p?"MODIFIER":"NOUVEAU"} CHANTIER</h3>
   <form id="fProject" class="form-grid">
     <input type="hidden" name="id" value="${esc(p?.id||"")}">
     <label>Chantier / lieu<input name="chantier" value="${esc(projectChantierName(p))}" placeholder="Ex. AMPEFY, VISY GASY, AMBOHIMANABE" required></label>
     <label>Projet / travaux<input name="name" value="${esc(projectWorkName(p))}" placeholder="Ex. PEINTURE, OUVRAGE METALLIQUE, CLÔTURE" required></label>
     <label>Client<input name="client" list="projectClientList" value="${esc(p?.client||"")}" required></label>
     <datalist id="projectClientList">${(db.modules?.clients||[]).filter(c=>!c.deleted).map(c=>`<option value="${esc(clientNameFromRecord(c))}"></option>`).join("")}</datalist>
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
 if(user.role==="ADMIN"){
  const amount=document.getElementById("projectBudgetAmount");
  if(amount)amount.dataset.manualBudget=String(p?.manualBudget??p?.budgetBeforeQuote??(budgetSource==="manuel"?p?.budget??"":""));
 }

 $("#fProject").onsubmit=e=>{
   e.preventDefault();
   let f=new FormData(e.target);
   const chantier=String(f.get("chantier")||"").trim();
   const name=String(f.get("name")||"").trim();
   let duplicate=db.projects.find(x=>x!==p&&!x.deleted&&projectChantierName(x).toLowerCase()===chantier.toLowerCase()&&projectWorkName(x).toLowerCase()===name.toLowerCase());
   if(duplicate)return alert("Ce chantier avec ce projet existe déjà.");
   const internalId=p?.id||("CH-"+Date.now()+"-"+Math.random().toString(36).slice(2,7).toUpperCase());
   const source=user.role==="ADMIN"?String(f.get("budgetSource")||budgetSource):budgetSource;
   const directBudget=+f.get("budget");
   if(source==="manuel"&&user.role==="ADMIN"&&(!Number.isFinite(directBudget)||directBudget<0))return alert("Saisissez un budget direct valide.");
   const budget=source==="devis"?sum(acceptedQuotesForProject(internalId).map(q=>quoteFinancials(q).ttc)):(user.role==="ADMIN"?directBudget:+p?.budget||0);
   if(p&&(source!==budgetSource||Math.abs(budget-projectBudgetAmount(p))>0.01)){
    const invoices=invoiceRows().filter(x=>String(x.project)===String(p.id));
    const received=sum(receiptRows().filter(x=>String(x.project)===String(p.id)&&x.status==="Validé").map(x=>x.amount));
    if(budget+0.01<sum(invoices.map(invoiceLegacyAmount))||budget+0.01<received)return alert("Le budget choisi est inférieur aux factures ou aux encaissements validés. Corrigez d’abord ces opérations.");
   }

   let obj={
     id:internalId,
     chantier:chantier,
     name:name,
     projectName:name,
     client:f.get("client").trim(),
     budget,budgetSource:source,manualBudget:source==="manuel"?budget:(p?.manualBudget??p?.budgetBeforeQuote??0),
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
   if(p&&requestEditIfRequired("projects",p,obj,projects))return;
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
 return user.role==="ADMIN" || (user.role==="CONTROLE" && canUserChange(r));
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
 ${canOpenOwnEdit(r)?`<button class="btn-xs btn-edit" onclick="siteControlForm('${r.id}')">${canChangeSiteControl(r)?"Modifier":"Demander correction"}</button>${canChangeSiteControl(r)?`<button class="btn-xs btn-delete" onclick="deleteSiteControl('${r.id}')">Supprimer</button>`:""}`:"<span>Verrouillé</span>"}
 ${user.role==="ADMIN"&&r.workflow!=="Validé"?`<button class="btn-xs" onclick="validateSiteControl('${r.id}')">Valider</button>`:""}
 </div></td></tr>`).join(""):`<tr><td colspan="9"><div class="empty-state">Aucun contrôle chantier enregistré.</div></td></tr>`}
 </tbody></table></div></div>`;
}
function siteControlForm(id=""){
 ensureSecurityData();
 const r=id?db.siteControls.find(x=>x.id===id):null;
 if(r&&!canOpenOwnEdit(r))return alert("Ce contrôle ne vous appartient pas.");
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEAU"} CONTRÔLE CHANTIER</h3>
 <form id="fSiteControl" class="form-grid">
 <label>Date<input name="date" type="date" value="${r?.date||new Date().toISOString().slice(0,10)}" required></label>
 <label>Chantier<select name="project" required>${accessibleProjects().map(p=>`<option value="${esc(p.id)}" ${r?.project===p.id?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label>
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
    owner:r?.owner||user.username,ownerUid:r?.ownerUid||user.uid||"",ownerTechnicianId:r?.ownerTechnicianId||effectiveUserIdentity().technicianId||"",workflow:r?.workflow||"Soumis",
    updatedBy:user.username,updatedAt:new Date().toISOString()
   };
   if(r&&requestEditIfRequired("siteControls",r,obj,siteControlsPage))return;
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
  const proposed={progress:+f.get("progress"),status:f.get("status"),technicalNote:f.get("technicalNote"),workersPresent:+f.get("workers")||0,labourersPresent:+f.get("labourers")||0};
  if(p.technicalOwner&&p.technicalOwner!==user.username&&user.role!=="ADMIN")return alert("Ce suivi appartient à un autre technicien.");
  if(p.technicalOwner&&requestEditIfRequired("projects",p,proposed,projects))return;
  p.progress=+f.get("progress");p.status=f.get("status");p.technicalNote=f.get("technicalNote");
  p.workersPresent=+f.get("workers")||0;p.labourersPresent=+f.get("labourers")||0;
  p.technicalOwner=p.technicalOwner||user.username;p.technicalOwnerUid=p.technicalOwnerUid||user.uid||"";p.technicalCreatedAt=p.technicalCreatedAt||new Date().toISOString();
  p.lastTechnicalEditor=user.username;p.lastTechnicalEdit=new Date().toISOString();
  p.updatedAt=new Date().toISOString();
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
  if(s.received>s.contract+0.01&&s.contract>0)add("Critique","Encaissements",p.id,"Encaissements supérieurs aux contrats clients.");
  if(s.cash<0)add("Alerte","Caisse",p.id,"Solde caisse négatif.");
  if(s.remaining<0)add("Alerte","Budget",p.id,"Dépenses réelles supérieures au budget initial.");
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
  if(p.paymentStatus==="Payé"&&!paidPurchaseJournalRows(p.project).some(x=>x.reference===p.id))add("Critique","Achats",p.id,"Achat payé absent du journal des dépenses.");
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
function reportsTable(){return `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Date</th><th>Chantier</th><th>Avancement</th><th>Travaux contrôlés</th><th>Conformité</th><th>Incident</th><th>Action</th><th>Statut</th><th>Observation Admin</th><th>Actions</th></tr></thead><tbody>${db.reports.filter(r=>!r.deleted&&userCanAccessProject(r.project)).map(r=>`<tr><td>${r.id}</td><td>${r.date}</td><td>${esc(projectLabel(r.project))}</td><td>${r.progress}%</td><td>${r.work}</td><td>${r.conformity}</td><td>${r.issue}</td><td>${r.action}</td><td>${workflowBadge(r.workflow||r.status)}</td><td>${esc(r.adminObservation||"")}</td><td><div class="edit-actions">${canOpenOwnEdit(r)?`<button class="btn-xs btn-edit" onclick="reportForm('${r.id}')">${canUserChange(r)?"Modifier":"Demander correction"}</button>${canUserChange(r)?`<button class="btn-xs btn-delete" onclick="softDeleteRecord('reports','reports','${r.id}')">Supprimer</button>`:""}`:"<span>Verrouillé</span>"}<button class="btn-xs" onclick="showRecordHistory('reports','${r.id}')">Historique</button></div></td></tr>`).join("")}</tbody></table></div>`}
function reportForm(id=""){let r=id?db.reports.find(x=>x.id===id):null;if(r&&!canOpenOwnEdit(r))return alert("Ce rapport ne vous appartient pas.");let opts=accessibleProjects().map(p=>`<option value="${p.id}">${p.id} - ${p.name}</option>`).join("");$("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEAU"} RAPPORT CONTRÔLE & SUIVI</h3><form id="fReport" class="form-grid"><label>Date<input name="date" type="date" value="${r?.date||""}" required></label><label>Chantier<select name="project">${accessibleProjects().map(p=>`<option value="${p.id}" ${r?.project===p.id?"selected":""}>${p.id} - ${p.name}</option>`).join("")}</select></label><label>Avancement réel (%)<input name="progress" type="number" min="0" max="100" value="${r?.progress??0}" required></label><label>Conformité<select name="conformity"><option ${r?.conformity==="Conforme"?"selected":""}>Conforme</option><option ${r?.conformity==="Non conforme"?"selected":""}>Non conforme</option></select></label><label class="full">Travaux contrôlés<textarea name="work" required>${r?.work||""}</textarea></label><label>Incident / Blocage<input name="issue" value="${r?.issue||""}"></label><label>Action corrective<input name="action" value="${r?.action||""}" required></label><button class="btn primary">Enregistrer</button></form></div>`;$("#fReport").onsubmit=e=>{e.preventDefault();let f=new FormData(e.target);let obj={id:r?.id||"RAP-"+String(db.reports.length+1).padStart(3,"0"),owner:r?.owner||user.username,date:f.get("date"),project:f.get("project"),progress:+f.get("progress"),work:f.get("work"),conformity:f.get("conformity"),issue:f.get("issue")||"Aucun",action:f.get("action"),status:r?.status||"À valider",updatedAt:new Date().toISOString()};const before=r?cloneRecord(r):null;obj.workflow=r?.workflow||"Soumis";obj.updatedBy=user.username;if(r&&requestEditIfRequired("reports",r,obj,reports))return;if(r){pushHistory(r,"Modification",before);Object.assign(r,obj);audit("Modification","reports",r.id,"Rapport modifié",before,r)}else{obj.createdAt=new Date().toISOString();obj.history=[];pushHistory(obj,"Création");db.reports.push(obj);audit("Création","reports",obj.id,"Rapport créé",null,obj)}logTechnicalEntry(r?"Modification":"Création","Rapport technique",obj.id,`Chantier ${obj.project}, avancement ${obj.progress}%, ${obj.conformity}`);save();cloudWriteGeneric("reports",r||obj,"Nouveau rapport technique");reports()}}
function deleteReport(id){if(confirm("Supprimer ce rapport ?")){db.reports=db.reports.filter(x=>x.id!==id);save();reports()}}
function mondayOf(dateStr){
 const d=new Date(dateStr+"T12:00:00");const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);
 return d.toISOString().slice(0,10);
}
function addDays(dateStr,n){const d=new Date(dateStr+"T12:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function employeeStatusLabel(e){return (e.workflow==="Inactif"||e.active===false)?"Passif":"Actif";}

function weeklyAttendanceRecord(weekStart){
 db.modules.attendanceWeekly=Array.isArray(db.modules.attendanceWeekly)?db.modules.attendanceWeekly:[];
 const same=db.modules.attendanceWeekly.filter(r=>r.weekStart===weekStart&&!r.deleted);
 let master=same.find(r=>!r.project)||same[0];
 if(!master){
  master={id:"ATTW-"+Date.now()+"-"+Math.random().toString(36).slice(2,5),weekStart,project:"",entries:[],owner:user.username,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  db.modules.attendanceWeekly.push(master);
 }
 master.project="";
 master.entries=Array.isArray(master.entries)?master.entries:[];

 // Merge former per-project weekly records into one master record.
 same.filter(r=>r!==master).forEach(old=>{
  (old.entries||[]).forEach(oe=>{
   let me=master.entries.find(x=>String(x.employeeKey)===String(oe.employeeKey));
   if(!me){me={employeeKey:oe.employeeKey,states:{},assignments:{}};master.entries.push(me);}
   me.states=me.states||{};me.assignments=me.assignments||{};
   Object.entries(oe.states||{}).forEach(([d,s])=>{
    if(!me.states[d]||me.states[d]==="A")me.states[d]=s;
   });
   Object.entries(oe.assignments||{}).forEach(([d,a])=>{
    if(a&&!me.assignments[d])me.assignments[d]=a;
   });
  });
  old.deleted=true;old.deletedAt=new Date().toISOString();old.mergedInto=master.id;
 });
 return master;
}
function attendanceAssignmentControl(key,date,value,projects){
 const known=projects.some(p=>String(p.id)===String(value));
 const manual=value&&!known;
 return `<select class="att-assignment-choice" data-key="${esc(key)}" data-date="${date}" onchange="attendanceAssignmentChoiceChanged(this)">
   <option value="">— Chantier / lieu —</option>
   ${projects.map(p=>`<option value="${esc(p.id)}" ${String(value)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}
   <option value="__MANUAL__" ${manual?"selected":""}>Autre / manuel…</option>
  </select>
  <input class="att-assignment-manual" data-key="${esc(key)}" data-date="${date}" value="${esc(manual?value:"")}" placeholder="Saisir chantier / lieu" style="${manual?"":"display:none"}">`;
}
function attendanceAssignmentChoiceChanged(el){
 const key=el.dataset.key,date=el.dataset.date;
 const manual=document.querySelector(`.att-assignment-manual[data-key="${CSS.escape(key)}"][data-date="${date}"]`);
 if(manual)manual.style.display=el.value==="__MANUAL__"?"block":"none";
}
function attendanceReadAssignment(key,date){
 const sel=document.querySelector(`.att-assignment-choice[data-key="${CSS.escape(key)}"][data-date="${date}"]`);
 if(!sel)return "";
 if(sel.value==="__MANUAL__"){
  return String(document.querySelector(`.att-assignment-manual[data-key="${CSS.escape(key)}"][data-date="${date}"]`)?.value||"").trim();
 }
 return String(sel.value||"").trim();
}
function attendance(){
 ensureSecurityData();
 const employees=(db.modules.employees||[]).filter(r=>!r.deleted);
 const today=new Date().toISOString().slice(0,10);
 const selectedDate=sessionStorage.getItem("nysoa_attendance_date")||today;
 const weekStart=mondayOf(selectedDate);
 const filterProject=sessionStorage.getItem("nysoa_attendance_project")||"";
 const days=["L","M","M","J","V","S","D"].map((label,i)=>({label,date:addDays(weekStart,i)}));
 const record=weeklyAttendanceRecord(weekStart),entries=record.entries||[],projects=accessibleProjects();
 const keyOf=(r,i)=>r.id||r.values?.[0]||`EMP-${i+1}`;

 $("#content").innerHTML=`<div class="panel"><h3>POINTAGE — AFFECTATION PAR JOUR</h3><div class="panel-body">
 <div class="form-grid"><label>Semaine contenant le<input id="attendanceDate" type="date" value="${selectedDate}"></label>
 <label>Filtre chantier<select id="attendanceProject"><option value="">Tous les employés</option>${projects.map(p=>`<option value="${esc(p.id)}" ${filterProject===p.id?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label>
 <div class="form-actions full"><button class="btn primary" onclick="saveAttendance()">Enregistrer</button><button class="btn secondary" onclick="go('qrAttendance')">📷 Scanner QR</button></div></div>
 <div class="attendance-note"><b>Présence :</b> Absent = 0, ½ journée = 0,5, Présent = 1. <b>Chantier / lieu :</b> choisissez un chantier dans la liste ou « Autre / manuel ». Un scan QR met automatiquement le chantier du scan sur le jour concerné.</div></div>
 <div class="table-wrap"><table class="attendance-table weekly-attendance"><thead><tr><th>Matricule</th><th>Nom</th><th>Fonction</th><th>État</th>${days.map(d=>`<th class="center">${d.label}<small>${d.date.slice(8,10)}</small><br><small>Présence / Chantier</small></th>`).join("")}<th>Total jours</th></tr></thead><tbody>
 ${employees.length?employees.map((e,i)=>{
  const key=keyOf(e,i),entry=entries.find(x=>String(x.employeeKey)===String(key))||{},states=entry.states||{},assign=entry.assignments||{};
  const defaultProject=employeeProject(e)||"";
  const matchesFilter=!filterProject||days.some(d=>String(assign[d.date]||defaultProject)===String(filterProject));
  if(!matchesFilter)return "";
  const total=days.reduce((n,d)=>n+(states[d.date]==="P"?1:states[d.date]==="H"?0.5:0),0);
  return `<tr><td>${esc(employeeMatricule(e)||e.id||"")}</td><td><b>${esc(employeeName(e))}</b></td><td>${esc(employeeRole(e))}</td><td>${employeeStatusLabel(e)==="Actif"?'<span class="qr-in">Actif</span>':'<span class="qr-out">Passif</span>'}</td>
  ${days.map(d=>{const st=states[d.date]||"A",af=assign[d.date]??defaultProject;return `<td class="center"><select class="att-state" data-key="${esc(key)}" data-date="${d.date}" onchange="refreshAttendanceRow('${esc(key)}')"><option value="A" ${st==="A"?"selected":""}>Absent (0)</option><option value="H" ${st==="H"?"selected":""}>½ journée (0,5)</option><option value="P" ${st==="P"?"selected":""}>Présent (1)</option></select>${attendanceAssignmentControl(key,d.date,af,projects)}</td>`}).join("")}
  <td class="attendance-total" data-key="${esc(key)}"><b>${total.toFixed(1)}</b></td></tr>`;
 }).join(""):'<tr><td colspan="12">Aucun employé actif dans le registre. Ajoutez ou synchronisez les employés pour pointer leur présence.</td></tr>'}
 </tbody></table></div></div>`;

 $("#attendanceDate").onchange=e=>{sessionStorage.setItem("nysoa_attendance_date",e.target.value);attendance()};
 $("#attendanceProject").onchange=e=>{sessionStorage.setItem("nysoa_attendance_project",e.target.value);attendance()};
}
function refreshAttendanceRow(key){
 const ss=[...document.querySelectorAll(`.att-state[data-key="${CSS.escape(key)}"]`)];
 const total=ss.reduce((n,s)=>n+(s.value==="P"?1:s.value==="H"?0.5:0),0);
 const t=document.querySelector(`.attendance-total[data-key="${CSS.escape(key)}"]`);
 if(t)t.innerHTML=`<b>${total.toFixed(1)}</b>`;
}
function saveAttendance(){
 const selectedDate=$("#attendanceDate")?.value;
 if(!selectedDate)return alert("Choisissez une date.");
 const weekStart=mondayOf(selectedDate),employees=(db.modules.employees||[]).filter(r=>!r.deleted);
 const record=weeklyAttendanceRecord(weekStart);
 const draft=cloneRecord(record);
 draft.entries=draft.entries||[];
 employees.forEach((e,i)=>{
  const key=e.id||e.values?.[0]||`EMP-${i+1}`;
  let en=draft.entries.find(x=>String(x.employeeKey)===String(key));
  if(!en){en={employeeKey:key,states:{},assignments:{}};draft.entries.push(en);}
  en.states=en.states||{};en.assignments=en.assignments||{};
  document.querySelectorAll(`.att-state[data-key="${CSS.escape(key)}"]`).forEach(x=>en.states[x.dataset.date]=x.value||"A");
  document.querySelectorAll(`.att-assignment-choice[data-key="${CSS.escape(key)}"]`).forEach(x=>{
   en.assignments[x.dataset.date]=attendanceReadAssignment(key,x.dataset.date);
  });
 });
 const firstEntry=!record.entries?.length;
 if(!firstEntry&&requestEditIfRequired("attendanceWeekly",record,draft,attendance))return;
 Object.assign(record,draft);
 if(firstEntry)record.createdAt=new Date().toISOString();
 record.updatedAt=new Date().toISOString();record.updatedBy=effectiveUserIdentity().label||user.username;
 const stats={P:0,H:0,A:0};(record.entries||[]).forEach(en=>Object.values(en.states||{}).forEach(s=>{if(stats[s]!==undefined)stats[s]++;}));
 audit("Enregistrement pointage","attendanceWeekly",record.id,`Présents ${stats.P} — Demi-journées ${stats.H} — Absents ${stats.A}`,null,cloneRecord(record));
 saveLocalOnly();cloudWriteGeneric("attendanceWeekly",record,"Pointage hebdomadaire");logUserActivity("Pointage enregistré","pointage",record.id,"Affectations journalières");attendance();
}
function clearAttendanceEmployee(key){
 document.querySelectorAll(`.att-state[data-key="${CSS.escape(key)}"]`).forEach(x=>x.value="A");
 document.querySelectorAll(`.att-assignment-choice[data-key="${CSS.escape(key)}"]`).forEach(x=>x.value="");
 document.querySelectorAll(`.att-assignment-manual[data-key="${CSS.escape(key)}"]`).forEach(x=>{x.value="";x.style.display="none"});
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
 ensureEmployeeQrToken(e);const project="";
 const photo=e.photoData||"";
 $("#content").innerHTML=`<div class="panel badge-screen"><h3 class="no-print">BADGE PROFESSIONNEL — EMPLOYÉ</h3>
 <div class="badge-qr-wrap"><div class="employee-badge employee-badge-v472" id="employeeBadgePrint">
   <div class="badge-top"><img src="assets/logo_nysoa_construct.png" class="badge-logo" alt="NYSOA"><div><div class="badge-brand">ENTREPRISE NYSOA CONSTRUCT</div><div class="badge-subtitle">CARTE PROFESSIONNELLE</div></div></div>
   <div class="badge-main">
     <div class="badge-photo">${photo?`<img src="${photo}" alt="Photo ${esc(employeeName(e))}">`:`<div class="badge-photo-empty"><span>PHOTO</span></div>`}</div>
     <div class="badge-info"><h2>${esc(employeeName(e))}</h2><div class="badge-job">${esc(employeeRole(e))}</div><p><b>Matricule :</b> ${esc(employeeMatricule(e)||e.id)}</p><p><b>Chantier :</b>&nbsp;</p><p><b>Statut :</b> ${esc(e.workflow||"Actif")}</p></div>
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
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>PRÉSENCE PAR BADGE QR</h3><div class="panel-body"><div class="form-grid"><label>Chantier<select id="qrProject" required><option value="">Choisir le chantier</option>${accessibleProjects().map(p=>`<option value="${esc(p.id)}" ${String(ctx)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label><div class="form-actions"><button class="btn primary" onclick="startQrScanner()">📷 Scanner un badge</button><button class="btn secondary" onclick="stopQrScanner()">Arrêter caméra</button></div><label class="full">Saisie manuelle (secours)<div class="manual-qr"><input id="qrManualCode" placeholder="Coller / saisir le code du badge"><button type="button" class="btn secondary" onclick="processBadgeScan(document.getElementById('qrManualCode').value)">Valider</button></div></label></div><div id="qr-reader" class="qr-reader"></div><div id="qrScanResult"></div><div class="notice">Premier scan de la journée = <b>Entrée</b>. Le scan suivant après l’entrée = <b>Sortie</b>. Un double scan dans les 30 secondes est ignoré.</div></div></div>
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
 const project=document.getElementById("qrProject")?.value;if(!project)return alert("Choisissez le chantier où le badge est scanné. Ce chantier sera affecté automatiquement au pointage du jour.");
 const parts=code.split("|");if(parts.length!==3||parts[0]!=="NYSOA-EMP")return showQrResult("Badge QR invalide.",false);
 const [,id,token]=parts,e=employeeRows().find(x=>String(x.id)===String(id));
 if(!e||!e.qrToken||String(e.qrToken)!==String(token)||e.workflow==="Inactif")return showQrResult("Badge inconnu, expiré ou employé inactif.",false);
 const now=new Date(),date=now.toISOString().slice(0,10),same=qrAttendanceRows().filter(r=>r.employeeId===e.id&&r.project===project&&r.date===date).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
 const last=same[0];if(last&&now-new Date(last.timestamp)<30000)return showQrResult(`Double scan ignoré — ${employeeName(e)}.`,false);
 const direction=last?.direction==="Entrée"?"Sortie":"Entrée";
 const actor=effectiveUserIdentity();const rec={id:"QRATT-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),employeeId:e.id,employeeName:employeeName(e),jobTitle:employeeRole(e),project,date,timestamp:now.toISOString(),direction,scannedBy:actor.username||user.username,scannedByLabel:actor.label||actor.username||user.label,scannerUid:actor.uid||user.uid||"",technicianId:actor.technicianId||"",owner:user.username,createdAt:now.toISOString(),updatedAt:now.toISOString()};
 db.modules.attendanceQR.push(rec);save();syncQrPresenceToWeekly(e,project,date);logUserActivity("Scan badge QR — "+direction,"pointage",e.id,employeeName(e)+" — "+projectLabel(project));cloudWriteGeneric("attendanceQR",rec,"Scan badge QR");
 showQrResult(`${direction} enregistrée — ${employeeName(e)} — ${now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}.`,true);setTimeout(qrAttendancePage,900);
}
function showQrResult(msg,ok){const el=document.getElementById("qrScanResult");if(el)el.innerHTML=`<div class="qr-result ${ok?"ok":"bad"}">${ok?"✓":"⚠"} ${esc(msg)}</div>`;}
function syncQrPresenceToWeekly(e,project,date){
 const weekStart=mondayOf(date),record=weeklyAttendanceRecord(weekStart);
 const key=e.id;
 let entry=record.entries.find(x=>String(x.employeeKey)===String(key));
 if(!entry){entry={employeeKey:key,states:{},assignments:{}};record.entries.push(entry);}
 entry.states=entry.states||{};entry.assignments=entry.assignments||{};
 // QR scan means present for the day and records the exact chantier selected at scan.
 entry.states[date]="P";
 entry.assignments[date]=project;
 record.updatedAt=new Date().toISOString();
 record.updatedBy=effectiveUserIdentity().label||user.username;
 saveLocalOnly();
 cloudWriteGeneric("attendanceWeekly",record,"Présence QR synchronisée");
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


// ===== STOCK PROFESSIONNEL V4.8.4 =====
function stockItems(){db.modules.stock=Array.isArray(db.modules.stock)?db.modules.stock:[];return db.modules.stock.filter(x=>!x.deleted);}
function stockMovementRows(){db.modules.stockMovements=Array.isArray(db.modules.stockMovements)?db.modules.stockMovements:[];return db.modules.stockMovements.filter(x=>!x.deleted);}
function stockItemName(i){return i?.article||i?.name||i?.values?.[0]||"";}
function stockItemUnit(i){return i?.unit||i?.values?.[2]||"Unité";}
function stockOpeningQty(i){return +(i?.openingQty??i?.values?.[1]??0)||0;}
function stockOpeningValue(i){return +(i?.openingUnitValue??i?.unitPrice??0)||0;}
function stockSnapshot(item){
 let qty=stockOpeningQty(item),value=qty*stockOpeningValue(item);
 stockMovementRows().filter(m=>String(m.itemId)===String(item.id)).sort((a,b)=>String(a.createdAt||a.date||"").localeCompare(String(b.createdAt||b.date||""))).forEach(m=>{
  const q=+m.qty||0;
  if(m.type==="Entrée"){qty+=q;value+=q*(+m.unitValue||0);}
  else{const avg=qty>0?value/qty:stockOpeningValue(item);qty-=q;value-=q*avg;}
 });
 qty=Math.max(0,qty);value=Math.max(0,value);return{qty,value,avg:qty>0?value/qty:stockOpeningValue(item)};
}
function stockTotalValue(){return stockItems().reduce((n,i)=>n+stockSnapshot(i).value,0);}
function stockPage(){
 const ctx=currentProjectContext(),items=stockItems();
 const moves=stockMovementRows().filter(m=>!ctx||!m.project||String(m.project)===String(ctx)).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const ins=moves.filter(x=>x.type==="Entrée"),outs=moves.filter(x=>x.type==="Sortie");
 $("#content").innerHTML=`${projectContextNotice()}<div class="kpis">${kpi("📦","blue","VALEUR DU STOCK",money(stockTotalValue()),"Calcul automatique")}${kpi("⬇","green","ENTRÉES STOCK",ins.length)}${kpi("⬆","orange","SORTIES STOCK",outs.length)}</div>
 <div class="panel"><h3>STOCK — ÉTAT ACTUEL</h3><div class="panel-body"><button class="btn primary" onclick="stockItemForm()">+ Article</button> <button class="btn secondary" onclick="stockMovementForm('Entrée')">+ Entrée</button> <button class="btn secondary" onclick="stockMovementForm('Sortie')">− Sortie</button></div><div class="table-wrap"><table><thead><tr><th>Article</th><th>Unité</th><th>Quantité en stock</th><th>Valeur unitaire moyenne</th><th>Valeur du stock</th><th>Action</th></tr></thead><tbody>${items.length?items.map(i=>{const s=stockSnapshot(i);return`<tr><td><b>${esc(stockItemName(i))}</b></td><td>${esc(stockItemUnit(i))}</td><td><b>${s.qty.toFixed(2)}</b></td><td>${money(s.avg)}</td><td><b>${money(s.value)}</b></td><td><button class="btn-xs btn-edit" onclick="stockItemForm('${i.id}')">Modifier</button></td></tr>`}).join(""):'<tr><td colspan="6">Aucun article.</td></tr>'}</tbody></table></div></div>
 <div class="panel" style="margin-top:12px"><h3>ENTRÉES</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Article</th><th>Qté</th><th>PU</th><th>Valeur</th><th>Chantier</th><th>Référence</th></tr></thead><tbody>${ins.length?ins.map(m=>`<tr><td>${esc(m.date||"")}</td><td>${esc(m.itemName||"")}</td><td>${m.qty} ${esc(m.unit||"")}</td><td>${money(m.unitValue)}</td><td>${money((+m.qty||0)*(+m.unitValue||0))}</td><td>${esc(projectLabel(m.project)||"")}</td><td>${esc(m.reference||"")}</td></tr>`).join(""):'<tr><td colspan="7">Aucune entrée.</td></tr>'}</tbody></table></div></div>
 <div class="panel" style="margin-top:12px"><h3>SORTIES</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Article</th><th>Qté</th><th>Chantier / destination</th><th>Référence</th><th>Observation</th></tr></thead><tbody>${outs.length?outs.map(m=>`<tr><td>${esc(m.date||"")}</td><td>${esc(m.itemName||"")}</td><td>${m.qty} ${esc(m.unit||"")}</td><td>${esc(projectLabel(m.project)||m.project||"")}</td><td>${esc(m.reference||"")}</td><td>${esc(m.note||"")}</td></tr>`).join(""):'<tr><td colspan="6">Aucune sortie.</td></tr>'}</tbody></table></div></div>`;
}
function stockItemForm(id=""){
 const r=id?stockItems().find(x=>String(x.id)===String(id)):null;$("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEL"} ARTICLE</h3><form id="fStockItem" class="form-grid"><label>Article<input name="article" value="${esc(stockItemName(r))}" required></label><label>Unité<input name="unit" value="${esc(stockItemUnit(r))}" required></label><label>Stock initial<input name="openingQty" type="number" min="0" step="0.01" value="${stockOpeningQty(r)}"></label><label>Valeur unitaire initiale (Ar)<input name="openingUnitValue" type="number" min="0" step="0.01" value="${stockOpeningValue(r)}"></label><div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="stockPage()">Annuler</button></div></form></div>`;
 $("#fStockItem").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString(),obj={...(r||{}),id:r?.id||"STK-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),article:f.get("article"),unit:f.get("unit"),openingQty:+f.get("openingQty")||0,openingUnitValue:+f.get("openingUnitValue")||0,updatedAt:now,updatedBy:user.username};const before=r?cloneRecord(r):null;if(r)Object.assign(r,obj);else{obj.createdAt=now;db.modules.stock.push(obj);}audit(r?"Modification article stock":"Création article stock","stock",obj.id,obj.article,before,cloneRecord(obj));saveLocalOnly();cloudWriteGeneric("stock",obj,"Stock article");stockPage();};
}
function stockMovementForm(type){
 const items=stockItems();$("#content").innerHTML=`<div class="panel"><h3>${type.toUpperCase()} STOCK</h3><form id="fStockMove" class="form-grid"><label>Date<input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Article<select name="itemId" required><option value="">Choisir</option>${items.map(i=>`<option value="${esc(i.id)}">${esc(stockItemName(i))} — ${stockSnapshot(i).qty.toFixed(2)} ${esc(stockItemUnit(i))}</option>`).join("")}</select></label><label>Quantité<input name="qty" type="number" min="0.01" step="0.01" required></label>${type==="Entrée"?'<label>Valeur unitaire (Ar)<input name="unitValue" type="number" min="0" step="0.01" required></label>':""}<label>Chantier / destination<select name="project"><option value="">Non affecté</option>${accessibleProjects().map(p=>`<option value="${esc(p.id)}">${esc(projectChantierName(p))}</option>`).join("")}</select></label><label>Référence<input name="reference"></label><label class="full">Observation<textarea name="note"></textarea></label><div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="stockPage()">Annuler</button></div></form></div>`;
 $("#fStockMove").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),item=items.find(i=>String(i.id)===String(f.get("itemId")));if(!item)return;const qty=+f.get("qty")||0,s=stockSnapshot(item);if(type==="Sortie"&&qty>s.qty+0.0001)return alert("Stock insuffisant.");const uv=type==="Entrée"?(+f.get("unitValue")||0):s.avg,now=new Date().toISOString(),m={id:"MOV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),type,itemId:item.id,itemName:stockItemName(item),unit:stockItemUnit(item),qty,unitValue:uv,project:f.get("project")||"",reference:f.get("reference")||"",note:f.get("note")||"",owner:user.username,createdAt:now,updatedAt:now};db.modules.stockMovements.push(m);audit(type+" stock","stockMovements",m.id,`${m.itemName} — ${qty}`,null,m);saveLocalOnly();cloudWriteGeneric("stockMovements",m,type+" stock");stockPage();};
}

const PURCHASE_STATUSES=["Demandé","Approuvé","Effectué","Livré","Refusé","Annulé"];
function purchaseBadge(status){
 const cls=status==="Livré"?"b-green":status==="Approuvé"||status==="Effectué"?"b-blue":status==="Refusé"||status==="Annulé"?"b-orange":"b-blue";
 return `<span class="badge ${cls}">${esc(status||"Demandé")}</span>`;
}
function purchaseCanEdit(record){if(!record||record.deleted)return false;if(user.role==="ADMIN")return true;return user.role==="GESTIONNAIRE"&&record.owner===user.username;}
function purchasesPage(){
 db.modules.purchases=Array.isArray(db.modules.purchases)?db.modules.purchases:[];
 const ctx=currentProjectContext(),rows=db.modules.purchases.filter(x=>!x.deleted&&(!ctx||String(x.project)===String(ctx)));
 $("#content").innerHTML=`<div class="panel"><h3>ACHATS</h3>
 <div class="panel-body">
 ${["ADMIN","GESTIONNAIRE"].includes(user.role)?`<button class="btn primary" onclick="purchaseForm()">+ Nouvel achat</button>`:""}
 <span class="muted">Workflow : Demandé → Approuvé → Effectué → Livré</span>
 </div>
 <div class="table-wrap"><table><thead><tr>
 <th>Référence</th><th>Date</th><th>Chantier</th><th>Désignation</th><th>Fournisseur</th>
 <th>Quantité</th><th>Montant</th><th>Situation</th><th>Paiement</th><th>Dernière mise à jour</th>
 <th>Modifié par</th><th>Observation</th><th>Actions</th>
 </tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr>
 <td>${esc(r.id)}</td><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td>
 <td>${esc(r.designation||"")}</td><td>${esc(r.supplier||"")}</td>
 <td>${esc(r.quantity||"")} ${esc(r.unit||"")}</td><td>${money(r.amount)}</td>
 <td>${purchaseBadge(r.status)}</td><td>${workflowBadge(r.paymentStatus||"Non payé")}</td>
 <td>${r.updatedAt?new Date(r.updatedAt).toLocaleString("fr-FR"):""}</td>
 <td>${esc(r.updatedBy||r.owner||"")}</td><td>${esc(r.observation||"")}</td>
 <td><div class="edit-actions">
 ${canOpenOwnEdit(r)?`<button class="btn-xs btn-edit" onclick="purchaseForm('${r.id}')">${canUserChange(r)?"Modifier / situation":"Demander correction"}</button>
 ${canUserChange(r)?`<button class="btn-xs btn-delete" onclick="softDeletePurchase('${r.id}')">Supprimer</button>`:""}`:""}
 <button class="btn-xs" onclick="purchaseHistory('${r.id}')">Historique</button>
 </div></td></tr>`).join(""):`<tr><td colspan="13">Aucun achat enregistré.</td></tr>`}
 </tbody></table></div></div>`;
}
function purchaseForm(id=""){
 if(!["ADMIN","GESTIONNAIRE"].includes(user.role))return alert("Accès achat non autorisé.");
 db.modules.purchases=Array.isArray(db.modules.purchases)?db.modules.purchases:[];
 const r=id?db.modules.purchases.find(x=>String(x.id)===String(id)):null;
 if(r&&!canOpenOwnEdit(r))return alert("Cet achat ne vous appartient pas.");
 const projectOptions=db.projects.filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${r?.project===p.id?"selected":""}>${esc(projectChantierName(p))} — ${esc(projectWorkName(p))}</option>`).join("");
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
 <label>Situation<select name="status">${PURCHASE_STATUSES.map(s=>`<option ${r?.status===s?"selected":""}>${s}</option>`).join("")}</select></label><label>État paiement<select name="paymentStatus"><option ${r?.paymentStatus==="Non payé"?"selected":""}>Non payé</option><option ${r?.paymentStatus==="Payé"?"selected":""}>Payé</option></select></label><label>Date du paiement<input name="paymentDate" type="date" value="${esc(r?.paymentDate||erpToday())}"></label><label>Source des fonds<select name="fundSource">${user.role==="GESTIONNAIRE"?'<option>Caisse Gestionnaire</option>':`<option ${r?.fundSource==="Admin"||!r?"selected":""}>Admin</option><option ${r?.fundSource==="Caisse Gestionnaire"?"selected":""}>Caisse Gestionnaire</option>`}</select></label>
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
  const oldStatus=r?.status||null,amount=+f.get("amount")||0,quantity=+f.get("quantity")||0,paymentStatus=f.get("paymentStatus")||"Non payé";
  if(amount<=0||quantity<=0)return alert("Quantité et montant doivent être positifs.");
  if(paymentStatus==="Payé"&&["Refusé","Annulé"].includes(newStatus))return alert("Un achat refusé ou annulé ne peut pas être marqué payé.");
  const fundSource=user.role==="GESTIONNAIRE"?"Caisse Gestionnaire":f.get("fundSource")||"Admin";
  if(paymentStatus==="Payé"&&fundSource==="Caisse Gestionnaire"&&!canSpendManagerCash(amount,r?.paymentStatus==="Payé"&&r?.fundSource==="Caisse Gestionnaire"?+r.amount||0:0))return alert("Solde caisse insuffisant pour payer cet achat.");
  const obj={
   id:(f.get("reference")||"").trim()||r?.id||"ACH-"+String(db.modules.purchases.length+1).padStart(4,"0"),
   date:f.get("date"),project:f.get("project"),designation:f.get("designation"),
   supplier:f.get("supplier"),quantity,unit:f.get("unit"),
   amount,status:newStatus,workflow:newStatus,paymentStatus,paymentDate:paymentStatus==="Payé"?(f.get("paymentDate")||erpToday()):"",fundSource,
   observation:f.get("observation"),owner:r?.owner||user.username,
   updatedBy:user.username,updatedAt:now,
   approvedBy:newStatus==="Approuvé"?(f.get("approvedBy")||"Admin / Direction"):r?.approvedBy||"",
   approvedAt:newStatus==="Approuvé"?(f.get("approvedAt")?new Date(f.get("approvedAt")).toISOString():now):r?.approvedAt||"",
   approvalMode:newStatus==="Approuvé"?(f.get("approvalMode")||"Téléphone"):r?.approvalMode||""
  };
  if(!r&&db.modules.purchases.some(x=>String(x.id)===String(obj.id)))return alert("Cette référence existe déjà.");
  if(r&&requestEditIfRequired("purchases",r,obj,purchasesPage))return;
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
  // V4.8.3: no duplicate expense record is created.
  // The unified expense journal reads paid purchases directly from PURCHASES.
  if(saved.linkedExpenseId){
   const legacyExp=(db.expenses||[]).find(e=>String(e.id)===String(saved.linkedExpenseId));
   if(legacyExp&&!legacyExp.legacyLinkedArchived){
    legacyExp.legacyLinkedArchived=true;legacyExp.legacyLinkedArchivedAt=now;
   }
  }
  saveLocalOnly();
  if(typeof cloudWriteGeneric==="function")cloudWriteGeneric("purchases",saved,r?"Achat modifié":"Nouvel achat");
  purchasesPage();
 };
}
function softDeletePurchase(id){
 const r=(db.modules.purchases||[]).find(x=>String(x.id)===String(id));
 if(!r||!canUserChange(r))return;
 const reason=prompt("Motif de suppression :");if(reason===null)return;
 const before=cloneRecord(r);r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=user.username;r.deleteReason=reason||"Erreur de saisie";
 pushHistory(r,"Suppression logique",before,r.deleteReason);audit("Suppression logique","purchases",id,r.deleteReason,before,r);saveLocalOnly();if(typeof cloudWriteGeneric==="function")cloudWriteGeneric("purchases",r,"Achat supprimé");purchasesPage();
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
function isInternalProjectId(v){
 return /^CH-\d+-[A-Z0-9]+$/i.test(String(v||""));
}
function projectChantierName(p){
 if(!p)return "";
 if(String(p.chantier||"").trim())return String(p.chantier).trim();
 if(p.id&&!isInternalProjectId(p.id))return String(p.id).trim();
 return String(p.location||p.siteName||p.name||p.id||"").trim();
}
function projectWorkName(p){
 if(!p)return "";
 return String(p.name||p.projectName||p.workName||"").trim();
}
function projectLabel(id){
 const p=(db.projects||[]).find(x=>String(x.id)===String(id));
 return p?projectChantierName(p):(id||"Non affecté");
}
function financeProjectIsActive(id){return !id||(db.projects||[]).some(p=>!p.deleted&&String(p.id)===String(id));}
function projectFullLabel(id){
 const p=(db.projects||[]).find(x=>String(x.id)===String(id));
 if(!p)return id||"Non affecté";
 const ch=projectChantierName(p),work=projectWorkName(p);
 return work&&work!==ch?`${ch} — ${work}`:ch;
}
function migrateProjectChantierFields(){
 db.projects=Array.isArray(db.projects)?db.projects:[];
 let changed=false;
 db.projects.forEach(p=>{
  if(p.deleted)return;
  if(!String(p.chantier||"").trim()){
   if(p.id&&!isInternalProjectId(p.id)){p.chantier=String(p.id).trim();changed=true;}
   else if(p.location||p.siteName){p.chantier=String(p.location||p.siteName).trim();changed=true;}
  }
  if(!p.projectName&&p.name){p.projectName=p.name;changed=true;}
 });
 if(changed)saveLocalOnly();
 return changed;
}

function expenseRows(){db.expenses=Array.isArray(db.expenses)?db.expenses:[];return db.expenses.filter(x=>!x.deleted);}
function manualExpenseRows(){return expenseRows().filter(x=>!x.sourcePurchaseId&&!x.sourcePayrollId&&!x.legacyLinkedArchived);}
function paidPurchaseJournalRows(projectId=""){return (db.modules?.purchases||[]).filter(p=>!p.deleted&&p.paymentStatus==="Payé"&&(!projectId||String(p.project)===String(projectId))).map(p=>({id:"JRN-ACH-"+p.id,date:p.paymentDate||p.date||"",project:p.project,category:"Achats",label:`Achat ${p.designation||p.id}`,amount:+p.amount||0,paymentMode:p.paymentMode||"À préciser",fundSource:p.fundSource||"Admin",reference:p.id,status:"Payée",source:"Achat",readonly:true}));}
function payrollActualMovements(projectId=""){const out=[];(db.modules?.payroll||[]).filter(p=>!p.deleted&&(!projectId||String(p.project)===String(projectId))).forEach(p=>{const legacy=p.advancePaid===undefined&&p.balancePaid===undefined;if(legacy){if(p.workflow!=="En attente"){const amt=+p.netPaid||+p.grossAmount||0;if(amt)out.push({date:p.date||p.createdAt?.slice(0,10)||"",project:p.project,type:"Sortie",source:"Paie",label:`Salaire ${p.employeeName||""} — ${p.periodLabel||""}`,amount:amt,reference:p.id,fundSource:p.fundSource||"Caisse Gestionnaire"})}return}if(p.advancePaid&&+p.advanceAmount>0)out.push({date:p.advanceDate||p.date||"",project:p.project,type:"Sortie",source:"Avance salaire",label:`Avance ${p.employeeName||""} — ${p.periodLabel||""}`,amount:+p.advanceAmount,reference:p.id,fundSource:p.fundSource||"Caisse Gestionnaire"});if(p.balancePaid&&+p.balanceAmount>0)out.push({date:p.balanceDate||p.date||"",project:p.project,type:"Sortie",source:"Solde salaire",label:`Solde ${p.employeeName||""} — ${p.periodLabel||""}`,amount:+p.balanceAmount,reference:p.id,fundSource:p.fundSource||"Caisse Gestionnaire"})});return out;}
function payrollExpenseJournalRows(projectId=""){return payrollActualMovements(projectId).map(m=>({id:"JRN-PAY-"+m.reference+"-"+m.source,date:m.date,project:m.project,category:"Salaires",label:m.label,amount:m.amount,paymentMode:"Paie",fundSource:m.fundSource,reference:m.reference,status:"Payée",source:m.source,readonly:true}));}
function unifiedExpenseJournalRows(projectId=""){const direct=manualExpenseRows().filter(e=>e.status!=="En attente"&&(!projectId||String(e.project)===String(projectId))).map(e=>({...e,source:"Dépense",fundSource:e.fundSource||"Admin",readonly:false}));return[...direct,...paidPurchaseJournalRows(projectId),...payrollExpenseJournalRows(projectId)].filter(e=>financeProjectIsActive(e.project)).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));}
function erpToday(){
 const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function financialExpenseRows(projectId="",asOf=erpToday()){
 const generic=(db.modules?.expenses||[]).filter(r=>!r.deleted&&financeProjectIsActive(r.project)&&(!projectId||String(r.project)===String(projectId)))
  .map(r=>({id:r.id,date:r.date||r.createdAt?.slice(0,10)||"",project:r.project,category:r.category||"Autre",label:r.label||r.values?.[1]||r.id,amount:moduleExpenseAmount(r),fundSource:r.fundSource||"Admin",source:"Autre dépense"}));
 return [...unifiedExpenseJournalRows(projectId),...generic]
  .filter(r=>!r.date||String(r.date).slice(0,10)<=asOf)
  .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
}
function financeScope(projectId="",asOf=erpToday()){
 const projects=accessibleProjects().filter(p=>!projectId||String(p.id)===String(projectId));
 const budget=sum(projects.map(projectBudgetAmount));
 const expenses=financialExpenseRows(projectId,asOf),actual=sum(expenses.map(r=>r.amount));
 const adminExpense=sum(expenses.filter(r=>r.fundSource!=="Caisse Gestionnaire").map(r=>r.amount));
 const invoiced=invoiceRows().filter(r=>financeProjectIsActive(r.project)&&(!projectId||String(r.project)===String(projectId))&&(!r.date||String(r.date).slice(0,10)<=asOf))
  .reduce((n,r)=>n+invoiceLegacyAmount(r),0);
 const received=receiptRows().filter(r=>financeProjectIsActive(r.project)&&r.status==="Validé"&&(!projectId||String(r.project)===String(projectId))&&(!r.date||String(r.date).slice(0,10)<=asOf))
  .reduce((n,r)=>n+(+r.amount||+r.receivedAmount||0),0);
 const clientPayments=clientPaymentRows(projectId,asOf),contract=sum(clientPayments.map(row=>row.contract));
 const contractRemaining=sum(clientPayments.map(row=>row.remaining));
 const validated=acceptedQuotesForProject(projectId).filter(q=>!q.deleted&&(!q.date||String(q.date).slice(0,10)<=asOf))
  .reduce((n,q)=>n+quoteFinancials(q).ttc,0);
 const cashRows=cashMovements(projectId).filter(r=>!r.date||String(r.date).slice(0,10)<=asOf);
 const cashFunding=sum(cashRows.filter(r=>r.type==="Entrée").map(r=>r.amount));
 const cash=cashFunding-sum(cashRows.filter(r=>r.type==="Sortie").map(r=>r.amount));
 const treasury=received-adminExpense-cashFunding;
 const committed=actual+sum((db.modules?.purchases||[]).filter(r=>!r.deleted&&(!projectId||String(r.project)===String(projectId))&&["Approuvé","Effectué","Livré"].includes(r.status)&&r.paymentStatus!=="Payé"&&(!r.date||String(r.date).slice(0,10)<=asOf)).map(r=>r.amount));
 return {projectId,asOf,budget,budgetRemaining:budget-actual,adminExpense,expenses,actual,invoiced,received,validated,contract,contractRemaining,clientPayments,cash,cashFunding,treasury,committed,cashRows};
}
function financialExpenseDetail(projectId=""){
 const f=financeScope(projectId),rows=f.expenses;
 return `<div class="panel" style="margin-top:12px"><h3>DÉPENSES JUSQU’AU ${esc(f.asOf)} — ${esc(projectId?projectChantierName(accessibleProjects().find(p=>String(p.id)===String(projectId))):"TOUS LES CHANTIERS")}</h3>
 <div class="panel-body"><b>Total imputé au budget : ${money(f.actual)}</b> · Paiement Admin : ${money(f.adminExpense)} · Caisse Gestionnaire : ${money(f.actual-f.adminExpense)}</div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Catégorie</th><th>Libellé</th><th>Source des fonds</th><th>Montant</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.date||"Sans date")}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(r.category||r.source||"")}</td><td>${esc(r.label||"")}</td><td>${esc(r.fundSource||"Admin")}</td><td>${money(r.amount)}</td></tr>`).join(""):'<tr><td colspan="6">Aucune dépense enregistrée.</td></tr>'}</tbody></table></div></div>`;
}
function unifiedExpenseTotal(projectId=""){return unifiedExpenseJournalRows(projectId).reduce((n,r)=>n+(+r.amount||0),0);}
function expensesPage(){const ctx=currentProjectContext(),rows=unifiedExpenseJournalRows(ctx),total=rows.reduce((n,r)=>n+(+r.amount||0),0);$("#content").innerHTML=`${caisseNav("expenses")}${projectContextNotice()}<div class="kpis">${kpi("📒","orange","TOTAL DÉPENSES",money(total),"Journal général")}</div><div class="panel"><h3>DÉPENSES — JOURNAL GÉNÉRAL</h3><div class="panel-body"><button class="btn primary" onclick="expenseForm()">+ Nouvelle dépense</button><div class="notice">Tous les achats payés, salaires payés et autres dépenses apparaissent ici. <b>Source des fonds</b> distingue Caisse Gestionnaire et Admin.</div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Source</th><th>Catégorie</th><th>Libellé</th><th>Montant</th><th>Source des fonds</th><th>Référence</th><th>Action</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(r.source||"")}</td><td>${esc(r.category||"")}</td><td>${esc(r.label||"")}</td><td><b>${money(r.amount)}</b></td><td><b>${esc(r.fundSource||"Admin")}</b></td><td>${esc(r.reference||"")}</td><td>${r.readonly?'<span class="muted">Automatique</span>':canOpenOwnEdit(r)?`<button class="btn-xs btn-edit" onclick="expenseForm('${r.id}')">${canUserChange(r)?"Modifier":"Demander correction"}</button> ${canUserChange(r)?`<button class="btn-xs btn-delete" onclick="deleteExpense('${r.id}')">Supprimer</button>`:""}`:'<span class="muted">Consultation</span>'}</td></tr>`).join(""):'<tr><td colspan="9">Aucune dépense.</td></tr>'}</tbody></table></div></div>`;}
function expenseForm(id=""){const r=id?expenseRows().find(x=>String(x.id)===String(id)):null;if(id&&!r)return alert("Dépense introuvable.");if(r&&user.role!=="ADMIN"&&r.owner!==user.username)return alert("Cette dépense ne vous appartient pas.");const project=r?.project||currentProjectContext()||"";$("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVELLE"} DÉPENSE</h3><form id="fExpense" class="form-grid"><label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label><label>Chantier<select name="project" required><option value="">Choisir</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label><label>Catégorie<select name="category">${["Achats","Carburant","Transport","Main-d’œuvre externe","Matériels","Frais chantier","Autre"].map(x=>`<option ${r?.category===x?"selected":""}>${x}</option>`).join("")}</select></label><label>Libellé<input name="label" value="${esc(r?.label||"")}" required></label><label>Montant<input name="amount" type="number" min="1" value="${+r?.amount||""}" required></label><label>Mode<select name="paymentMode">${["Espèces","Virement","Mobile Money","Chèque","Autre"].map(x=>`<option ${r?.paymentMode===x?"selected":""}>${x}</option>`).join("")}</select></label><label>Source des fonds<select name="fundSource"><option ${r?.fundSource==="Caisse Gestionnaire"||(!r&&user.role==="GESTIONNAIRE")?"selected":""}>Caisse Gestionnaire</option><option ${r?.fundSource==="Admin"||(!r&&user.role==="ADMIN")?"selected":""}>Admin</option></select></label><label>Référence<input name="reference" value="${esc(r?.reference||"")}"></label><label>Statut<select name="status"><option ${r?.status==="Payée"?"selected":""}>Payée</option><option ${r?.status==="En attente"?"selected":""}>En attente</option></select></label><label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label><div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="expensesPage()">Annuler</button></div></form></div>`;$("#fExpense").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString(),obj={id:r?.id||"DEP-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),project:f.get("project"),category:f.get("category"),label:f.get("label"),amount:+f.get("amount")||0,paymentMode:f.get("paymentMode"),fundSource:user.role==="GESTIONNAIRE"?"Caisse Gestionnaire":f.get("fundSource")||"Admin",reference:f.get("reference")||"",status:f.get("status"),note:f.get("note")||"",owner:r?.owner||user.username,updatedBy:user.username,updatedAt:now};const before=r?cloneRecord(r):null;if(obj.status!=="En attente"&&obj.fundSource==="Caisse Gestionnaire"&&!canSpendManagerCash(obj.amount,r&&r.status!=="En attente"&&r.fundSource==="Caisse Gestionnaire"?+r.amount||0:0))return alert("Solde caisse insuffisant. L’Admin doit enregistrer l’approvisionnement réellement remis.");if(r&&requestEditIfRequired("expenses",r,obj,expensesPage))return;if(r)Object.assign(r,obj);else{obj.createdAt=now;db.expenses.push(obj)}audit(r?"Modification dépense":"Création dépense","expenses",obj.id,`${obj.label} — ${money(obj.amount)} — ${obj.fundSource}`,before,obj);saveLocalOnly();cloudWriteGeneric("expenses",obj,"Dépense");expensesPage()};}
function deleteExpense(id){const r=expenseRows().find(x=>String(x.id)===String(id));if(!r||!canUserChange(r)||!confirm("Supprimer cette dépense ?"))return;const before=cloneRecord(r);r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=user.username;r.updatedAt=r.deletedAt;audit("Suppression dépense","expenses",r.id,r.label,before,r);saveLocalOnly();cloudWriteGeneric("expenses",r,"Dépense supprimée");expensesPage();}
function caisseNav(active="journal"){const b=(k,l,f)=>`<button class="btn ${active===k?"primary":"secondary"}" onclick="${f}">${l}</button>`;return`<div class="panel caisse-hub"><h3>💵 MODULE CAISSE</h3><div class="panel-body form-actions">${b("journal","Journal caisse","cashPage()")}${b("appro","Demandes appro","approPage()")}${b("expenses","Dépenses","expensesPage()")}${b("treasury","Trésorerie","cashTreasuryPage()")}</div></div>`;}
function cashEntryRows(){db.modules.cashEntries=Array.isArray(db.modules.cashEntries)?db.modules.cashEntries:[];return db.modules.cashEntries.filter(x=>!x.deleted);}
function cashEntryForm(){if(user?.role!=="ADMIN")return alert("L’Admin enregistre la remise réelle à la caisse Gestionnaire.");$("#content").innerHTML=`<div class="panel"><h3>ENTRÉE CAISSE MANUELLE</h3><div class="notice">Montant réellement remis à la caisse Gestionnaire. Indépendant de la demande d’approvisionnement.</div><form id="fCashEntry" class="form-grid"><label>Date<input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Montant<input name="amount" type="number" min="1" required></label><label>Chantier<select name="project"><option value="">Caisse générale</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}">${esc(projectChantierName(p))}</option>`).join("")}</select></label><label>Référence<input name="reference"></label><label class="full">Observation<textarea name="note"></textarea></label><div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="cashPage()">Annuler</button></div></form></div>`;$("#fCashEntry").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString(),a=effectiveUserIdentity(),o={id:"CIN-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),amount:+f.get("amount")||0,project:f.get("project")||"",reference:f.get("reference")||"",note:f.get("note")||"",enteredBy:a.label||a.username||user.username,createdAt:now,updatedAt:now};db.modules.cashEntries.push(o);audit("Entrée caisse","cashEntries",o.id,money(o.amount),null,o);saveLocalOnly();cloudWriteGeneric("cashEntries",o,"Entrée caisse");cashPage()};}
function cashTreasuryPage(){generic("treasury");const c=document.getElementById("content");if(c)c.innerHTML=caisseNav("treasury")+c.innerHTML;}
function approPage(){db.requests=Array.isArray(db.requests)?db.requests:[];const ctx=currentProjectContext(),req=db.requests.filter(x=>!x.deleted&&(!ctx||String(x.project)===String(ctx))).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));$("#content").innerHTML=`${caisseNav("appro")}${projectContextNotice()}<div class="panel"><h3>DEMANDES D’APPROVISIONNEMENT</h3><div class="panel-body">${user.role!=="ADMIN"?'<button class="btn primary" onclick="approForm()">+ Nouvelle demande</button>':""}<div class="notice">Validation Admin simple : <b>OK</b> ou <b>Non</b>. Une validation ne crédite jamais automatiquement la caisse.</div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Montant</th><th>Motif</th><th>Statut</th><th>Action</th></tr></thead><tbody>${req.length?req.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td><b>${money(r.amount)}</b></td><td>${esc(r.purpose||r.note||"")}</td><td>${workflowBadge(r.status||"En attente")}</td><td>${user.role==="ADMIN"&&r.status==="En attente"?`<button class="btn-xs btn-edit" onclick="validateApproRequest('${r.id}',true)">OK</button> <button class="btn-xs btn-delete" onclick="validateApproRequest('${r.id}',false)">Non</button>`:canOpenOwnEdit(r)?`<button class="btn-xs btn-edit" onclick="approForm('${r.id}')">${canUserChange(r)?"Modifier":"Demander correction"}</button>`:""}</td></tr>`).join(""):'<tr><td colspan="6">Aucune demande.</td></tr>'}</tbody></table></div></div>`;}
function approForm(id=""){const r=id?(db.requests||[]).find(x=>String(x.id)===String(id)):null,project=r?.project||currentProjectContext()||"";$("#content").innerHTML=`<div class="panel"><h3>DEMANDE D’APPROVISIONNEMENT</h3><form id="fAppro" class="form-grid"><label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label><label>Chantier<select name="project" required><option value="">Choisir</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label><label>Montant<input name="amount" type="number" min="1" value="${+r?.amount||""}" required></label><label>Motif<input name="purpose" value="${esc(r?.purpose||"")}" required></label><label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label><div class="form-actions full"><button class="btn primary">Envoyer</button><button type="button" class="btn secondary" onclick="approPage()">Annuler</button></div></form></div>`;$("#fAppro").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString(),o={id:r?.id||"DEM-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),project:f.get("project"),amount:+f.get("amount")||0,purpose:f.get("purpose"),note:f.get("note")||"",status:r?.status||"En attente",owner:r?.owner||user.username,updatedBy:user.username,updatedAt:now};const before=r?cloneRecord(r):null;if(r&&requestEditIfRequired("requests",r,o,approPage))return;if(r)Object.assign(r,o);else{o.createdAt=now;db.requests.push(o)}audit(r?"Modification demande appro":"Création demande appro","requests",o.id,`${projectLabel(o.project)} — ${money(o.amount)}`,before,o);saveLocalOnly();cloudWriteGeneric("requests",o,"Demande appro");approPage()};}
function validateApproRequest(id,accept){if(user.role!=="ADMIN")return;const r=(db.requests||[]).find(x=>String(x.id)===String(id));if(!r)return;const now=new Date().toISOString(),before=cloneRecord(r);r.status=accept?"Validée":"Rejetée";r.updatedAt=now;if(accept){r.validatedAt=now;r.validatedBy=user.username}else{r.rejectedAt=now;r.rejectedBy=user.username}audit(accept?"Validation demande appro":"Rejet demande appro","requests",r.id,accept?"OK":"Non",before,r);saveLocalOnly();cloudWriteGeneric("requests",r,"Décision appro");approPage();}
function canSpendManagerCash(amount,previousPaid=0){return (+amount||0)<=financeScope().cash+(+previousPaid||0)+0.01;}
function cashMovements(projectId=""){const rows=[];cashEntryRows().filter(a=>financeProjectIsActive(a.project)&&(!projectId||String(a.project)===String(projectId))).forEach(a=>rows.push({date:a.date,project:a.project,type:"Entrée",source:"Entrée caisse manuelle",label:a.note||"Entrée caisse",amount:+a.amount||0,reference:a.reference||a.id}));unifiedExpenseJournalRows(projectId).filter(e=>(e.fundSource||"Admin")==="Caisse Gestionnaire").forEach(e=>rows.push({date:e.date,project:e.project,type:"Sortie",source:e.source||"Dépense",label:e.label||e.category||"Dépense",amount:+e.amount||0,reference:e.reference||e.id}));return rows.sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));}
function cashPage(){const ctx=currentProjectContext(),rows=cashMovements(ctx);let running=0;const rendered=rows.map(r=>{running+=r.type==="Entrée"?+r.amount:-r.amount;return{...r,balance:running}}),ins=rows.filter(r=>r.type==="Entrée").reduce((n,r)=>n+r.amount,0),outs=rows.filter(r=>r.type==="Sortie").reduce((n,r)=>n+r.amount,0);$("#content").innerHTML=`${caisseNav("journal")}${projectContextNotice()}<div class="kpis">${kpi("⬇","green","ENTRÉES CAISSE",money(ins))}${kpi("⬆","orange","SORTIES CAISSE",money(outs))}${kpi("💵","blue","SOLDE CAISSE",money(ins-outs))}</div><div class="panel"><h3>JOURNAL CAISSE GESTIONNAIRE</h3><div class="panel-body">${user.role==="ADMIN"?'<button class="btn primary" onclick="cashEntryForm()">+ Entrée caisse manuelle</button>':""}<div class="notice">La caisse est indépendante des demandes appro. Seules les dépenses marquées <b>Caisse Gestionnaire</b> diminuent ce solde. Les dépenses Admin restent dans le Journal général sans diminuer cette caisse.</div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Type</th><th>Source</th><th>Libellé</th><th>Entrée</th><th>Sortie</th><th>Solde</th><th>Référence</th></tr></thead><tbody>${rendered.length?rendered.map(r=>`<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${r.type}</td><td>${esc(r.source)}</td><td>${esc(r.label)}</td><td>${r.type==="Entrée"?money(r.amount):""}</td><td>${r.type==="Sortie"?money(r.amount):""}</td><td><b>${money(r.balance)}</b></td><td>${esc(r.reference||"")}</td></tr>`).join(""):'<tr><td colspan="9">Aucun mouvement.</td></tr>'}</tbody></table></div></div>`;}

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
 "Commissionnaire":"CM",
 "Aide-maçon":"AM",
 "Carreleur":"CR",
 "Peintre":"PE",
 "Soudeur":"SO",
 "Menuisier":"ME",
 "Charpentier":"CHP",
 "Conducteur d’engins":"CD",
 "Gardien":"GA",
 "Comptable":"CP",
 "Assistant administratif":"AA",
 "Responsable logistique":"RL",
 "Responsable QHSE":"QH"
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
 <label>Chantier<select name="project"><option value="">Non affecté / Multi-chantiers</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label>
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
  const before=e?cloneRecord(e):null;if(e&&requestEditIfRequired("employees",e,obj,employeesPage))return;
  if(e)Object.assign(e,obj);else{obj.createdAt=new Date().toISOString();db.modules.employees.push(obj);}
  audit(e?"Modification employé":"Création employé","employees",obj.id,obj.name,before,cloneRecord(obj));save();cloudWriteGeneric("employees",obj,e?"Modification employé":"Création employé");employeeBadge(obj.id);
 };
}
function updateEmployeeRoleOptions(selected=""){
 const el=document.getElementById("employeeRole");if(!el)return;
 const opts=["Chef de chantier","Chef d’équipe","Maçon","Aide-maçon","Ouvrier","Manœuvre","Coffreur","Ferrailleur","Électricien","Plombier","Carreleur","Peintre","Soudeur","Menuisier","Charpentier","Conducteur d’engins","Chauffeur","Gardien","Magasinier","Technicien","Contrôleur","Gestionnaire","Commissionnaire","Comptable","Assistant administratif","Responsable logistique","Responsable QHSE"];
 el.innerHTML=opts.map(x=>`<option ${x===selected?"selected":""}>${x}</option>`).join("");updateEmployeeMatriculePreview();
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

function employeeAdvanceRows(){db.modules.employeeAdvances=Array.isArray(db.modules.employeeAdvances)?db.modules.employeeAdvances:[];return db.modules.employeeAdvances.filter(x=>!x.deleted);}
function advanceRepaid(a){return(a.repayments||[]).reduce((n,r)=>n+(+r.amount||0),0);}
function advanceBalance(a){return Math.max(0,(+a.amount||0)-advanceRepaid(a));}
function employeeAdvanceBalance(employeeId){return employeeAdvanceRows().filter(a=>String(a.employeeId)===String(employeeId)).reduce((n,a)=>n+advanceBalance(a),0);}
function advanceForm(employeeId=""){const e=employeeRows().find(x=>String(x.id)===String(employeeId));if(!e)return alert("Choisissez un employé.");$("#content").innerHTML=`<div class="panel"><h3>NOUVELLE AVANCE — ${esc(employeeName(e))}</h3><form id="fAdvance" class="form-grid"><label>Date avance<input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Montant à rembourser<input name="amount" type="number" min="1" required></label><label>Première date remboursement<input name="firstDueDate" type="date" required></label><label>Nombre de tranches prévues<input name="plannedInstallments" type="number" min="1" value="1" required></label><label class="full">Observation<textarea name="note"></textarea></label><div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="payrollPage()">Annuler</button></div></form></div>`;$("#fAdvance").onsubmit=e2=>{e2.preventDefault();const f=new FormData(e2.target),now=new Date().toISOString(),o={id:"ADV-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),employeeId:e.id,employeeName:employeeName(e),date:f.get("date"),amount:+f.get("amount")||0,firstDueDate:f.get("firstDueDate"),plannedInstallments:+f.get("plannedInstallments")||1,repayments:[],note:f.get("note")||"",status:"À rembourser",createdAt:now,updatedAt:now,updatedBy:user.username};db.modules.employeeAdvances.push(o);audit("Nouvelle avance","employeeAdvances",o.id,`${o.employeeName} — ${money(o.amount)}`,null,o);saveLocalOnly();cloudWriteGeneric("employeeAdvances",o,"Avance employé");advanceHistoryPage(e.id)};}
function advanceHistoryPage(employeeId){const e=employeeRows().find(x=>String(x.id)===String(employeeId)),rows=employeeAdvanceRows().filter(a=>String(a.employeeId)===String(employeeId));$("#content").innerHTML=`<div class="panel"><h3>AVANCES / REMBOURSEMENTS — ${esc(employeeName(e)||"")}</h3><div class="panel-body"><button class="btn primary" onclick="advanceForm('${employeeId}')">+ Nouvelle avance</button> <button class="btn secondary" onclick="payrollPage()">Retour</button></div><div class="table-wrap"><table><thead><tr><th>Date avance</th><th>Montant</th><th>1re échéance</th><th>Tranches prévues</th><th>Remboursé</th><th>Reste</th><th>Détail remboursements</th></tr></thead><tbody>${rows.length?rows.map(a=>`<tr><td>${esc(a.date||"")}</td><td>${money(a.amount)}</td><td>${esc(a.firstDueDate||"")}</td><td>${a.plannedInstallments||1}</td><td>${money(advanceRepaid(a))}</td><td><b>${money(advanceBalance(a))}</b></td><td>${(a.repayments||[]).length?a.repayments.map(r=>`${esc(r.date||"")} : ${money(r.amount)}`).join("<br>"):"Aucun"}</td></tr>`).join(""):'<tr><td colspan="7">Aucune avance.</td></tr>'}</tbody></table></div></div>`;}
function removePayrollAdvanceRepayments(payrollId){employeeAdvanceRows().forEach(a=>{const old=(a.repayments||[]).length;a.repayments=(a.repayments||[]).filter(r=>String(r.payrollId)!==String(payrollId));if(old!==a.repayments.length){a.status=advanceBalance(a)<=.01?"Remboursée":advanceRepaid(a)>0?"Partiel":"À rembourser";a.updatedAt=new Date().toISOString();cloudWriteGeneric("employeeAdvances",a,"Correction remboursement")}});}
function applyAdvanceRepayment(employeeId,amount,date,payrollId){let remaining=+amount||0;const rows=employeeAdvanceRows().filter(a=>String(a.employeeId)===String(employeeId)&&advanceBalance(a)>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));for(const a of rows){if(remaining<=0)break;const part=Math.min(remaining,advanceBalance(a));a.repayments=Array.isArray(a.repayments)?a.repayments:[];a.repayments.push({id:"REP-"+Date.now()+"-"+Math.random().toString(36).slice(2,5),date,amount:part,payrollId});remaining-=part;a.status=advanceBalance(a)<=.01?"Remboursée":"Partiel";a.updatedAt=new Date().toISOString();cloudWriteGeneric("employeeAdvances",a,"Remboursement avance")}}
function employeeAdvancesTotal(employeeId,excludePayrollId=""){return employeeAdvanceBalance(employeeId);}
function payrollPage(){const ctx=currentProjectContext(),rows=payrollRows().filter(p=>!ctx||String(p.project)===String(ctx));$("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>PAIE</h3><div class="panel-body"><button class="btn primary" onclick="payrollForm()">+ Nouvelle période de paie</button><div class="notice">Suivi complet des avances et remboursements partiels. La déduction d’avance réduit la dette mais n’est pas une nouvelle sortie de caisse.</div></div><div class="table-wrap"><table><thead><tr><th>Employé</th><th>Période</th><th>Salaire dû</th><th>Payé</th><th>Déduction avance</th><th>Reste salaire</th><th>Dette avance</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows.length?rows.map(p=>{const gross=+p.grossAmount||0,adv=p.advancePaid?+p.advanceAmount||0:0,bal=p.balancePaid?+p.balanceAmount||0:0,ded=+p.advanceDeduction||0,paid=adv+bal,remain=Math.max(0,gross-paid-ded);return`<tr><td><b>${esc(p.employeeName||employeeName(employeeRows().find(e=>e.id===p.employeeId))||"")}</b></td><td>${esc(p.periodLabel||"")}</td><td>${money(gross)}</td><td>${money(paid)}</td><td>${money(ded)}</td><td>${money(remain)}</td><td><b>${money(employeeAdvanceBalance(p.employeeId))}</b></td><td>${workflowBadge(p.workflow||"En attente")}</td><td>${canOpenOwnEdit(p)?`<button class="btn-xs btn-edit" onclick="payrollForm('${p.id}','${p.employeeId}')">${canUserChange(p)?"Modifier":"Demander correction"}</button> `:""}<button class="btn-xs" onclick="advanceHistoryPage('${p.employeeId}')">Avances</button>${canUserChange(p)?` <button class="btn-xs btn-delete" onclick="deletePayroll('${p.id}')">Supprimer</button>`:""}</td></tr>`}).join(""):'<tr><td colspan="9">Aucune paie.</td></tr>'}</tbody></table></div></div>`;}
function payrollForm(id="",employeeId=""){const p=id?payrollRows().find(x=>String(x.id)===String(id)):null;if(id&&!p)return alert("Paie introuvable.");if(p&&user.role!=="ADMIN"&&p.owner!==user.username)return alert("Cette paie ne vous appartient pas.");const eid=p?.employeeId||employeeId||"",e=employeeRows().find(x=>String(x.id)===String(eid)),cycle=p?.payCycle||employeePayCycle(e)||"Hebdomadaire",salary=+p?.grossAmount||employeeBaseSalary(e)||0,project=p?.project||employeeProject(e)||currentProjectContext()||"";$("#content").innerHTML=`<div class="panel"><h3>${p?"MODIFIER":"NOUVELLE"} PAIE</h3><form id="fPayroll" class="form-grid"><label>Employé<select name="employeeId" id="payEmployee" required onchange="payrollEmployeeChanged(this.value)"><option value="">Choisir</option>${employeeRows().filter(x=>x.workflow!=="Inactif").map(x=>`<option value="${esc(x.id)}" ${String(eid)===String(x.id)?"selected":""}>${esc(employeeName(x))} — ${esc(employeeRole(x))}</option>`).join("")}</select></label><label>Chantier<select name="project" required><option value="">Choisir</option>${(db.projects||[]).filter(x=>!x.deleted).map(x=>`<option value="${esc(x.id)}" ${String(project)===String(x.id)?"selected":""}>${esc(projectChantierName(x))} — ${esc(projectWorkName(x))}</option>`).join("")}</select></label><label>Poste<input id="payRole" value="${esc(employeeRole(e)||"")}" readonly></label><label>Mode<input id="payCycle" value="${esc(cycle)}" readonly></label><label>Période<input name="periodLabel" value="${esc(p?.periodLabel||"")}" required></label><label>Salaire dû<input name="grossAmount" id="grossAmount" type="number" min="0" value="${salary||""}" oninput="recalcPayrollV456()" required></label><label class="checkline"><input name="advancePaid" id="advancePaid" type="checkbox" ${p?.advancePaid?"checked":""} onchange="recalcPayrollV456()"> Avance salaire versée</label><label>Date avance<input name="advanceDate" type="date" value="${esc(p?.advanceDate||"")}"></label><label>Montant avance salaire<input name="advanceAmount" id="advanceAmount" type="number" min="0" value="${+p?.advanceAmount||0}" oninput="recalcPayrollV456()"></label><label class="checkline"><input name="balancePaid" id="balancePaid" type="checkbox" ${p?.balancePaid?"checked":""} onchange="recalcPayrollV456()"> Solde payé</label><label>Date solde<input name="balanceDate" type="date" value="${esc(p?.balanceDate||"")}"></label><label>Montant solde<input name="balanceAmount" id="balanceAmount" type="number" min="0" value="${+p?.balanceAmount||0}" oninput="recalcPayrollV456()"></label><label>Dette avance à rembourser<input id="advanceDebtOutstanding" value="${employeeAdvanceBalance(eid)}" readonly></label><label>Déduction avance<input name="advanceDeduction" id="advanceDeduction" type="number" min="0" value="${+p?.advanceDeduction||0}" oninput="recalcPayrollV456()"></label><label>Date remboursement<input name="advanceRepaymentDate" type="date" value="${esc(p?.advanceRepaymentDate||"")}"></label><label>Source des fonds<select name="fundSource"><option ${p?.fundSource==="Caisse Gestionnaire"||(!p&&user.role==="GESTIONNAIRE")?"selected":""}>Caisse Gestionnaire</option><option ${p?.fundSource==="Admin"||(!p&&user.role==="ADMIN")?"selected":""}>Admin</option></select></label><label>Total réellement payé<input id="payrollTotalPaid" readonly></label><label>Reste salaire<input id="payrollRemaining" readonly></label><label>Statut<input id="payrollStatus" readonly></label><label class="full">Observation<textarea name="note">${esc(p?.note||"")}</textarea></label><div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="payrollPage()">Annuler</button></div></form></div>`;recalcPayrollV456();$("#fPayroll").onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target),emp=employeeRows().find(x=>String(x.id)===String(f.get("employeeId")));if(!emp)return alert("Choisir un employé.");const gross=+f.get("grossAmount")||0,ap=!!f.get("advancePaid"),bp=!!f.get("balancePaid"),advance=ap?(+f.get("advanceAmount")||0):0,balance=bp?(+f.get("balanceAmount")||0):0,ded=+f.get("advanceDeduction")||0;if(ded>employeeAdvanceBalance(emp.id)+.01)return alert("Déduction supérieure à la dette d’avance.");if(advance+balance+ded>gross+.01)return alert("Paiements + déduction dépassent le salaire dû.");if(ap&&!f.get("advanceDate"))return alert("Date avance requise.");if(bp&&!f.get("balanceDate"))return alert("Date solde requise.");if(ded>0&&!f.get("advanceRepaymentDate"))return alert("Date remboursement requise.");const paid=advance+balance,remain=Math.max(0,gross-paid-ded),workflow=(paid+ded)<=0?"En attente":remain<=.01?"Payé":"Partiel",now=new Date().toISOString(),o={id:p?.id||"PAY-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),employeeId:emp.id,employeeName:employeeName(emp),jobTitle:employeeRole(emp),project:f.get("project"),payCycle:employeePayCycle(emp),periodLabel:f.get("periodLabel"),grossAmount:gross,advancePaid:ap,advanceDate:f.get("advanceDate")||"",advanceAmount:advance,balancePaid:bp,balanceDate:f.get("balanceDate")||"",balanceAmount:balance,advanceDeduction:ded,advanceRepaymentDate:f.get("advanceRepaymentDate")||"",fundSource:user.role==="GESTIONNAIRE"?"Caisse Gestionnaire":f.get("fundSource")||"Caisse Gestionnaire",totalPaid:paid,remainingSalary:remain,workflow,note:f.get("note")||"",owner:p?.owner||user.username,updatedBy:user.username,updatedAt:now};const before=p?cloneRecord(p):null;const previousPaid=p?.fundSource==="Caisse Gestionnaire"?((p.advancePaid?+p.advanceAmount||0:0)+(p.balancePaid?+p.balanceAmount||0:0)):0;if(o.fundSource==="Caisse Gestionnaire"&&!canSpendManagerCash(paid,previousPaid))return alert("Solde caisse insuffisant pour verser cette paie.");if(p&&requestEditIfRequired("payroll",p,o,payrollPage))return;if(p)Object.assign(p,o);else{o.createdAt=now;db.modules.payroll.push(o)}removePayrollAdvanceRepayments(o.id);if(ded>0)applyAdvanceRepayment(emp.id,ded,o.advanceRepaymentDate,o.id);audit(p?"Modification paie":"Création paie","payroll",o.id,`${o.employeeName} — ${money(o.totalPaid)} — remboursement ${money(ded)}`,before,o);saveLocalOnly();cloudWriteGeneric("payroll",o,"Paie");payrollPage()};}
function payrollEmployeeChanged(id){const e=employeeRows().find(x=>String(x.id)===String(id));if(!e)return;document.getElementById("payRole").value=employeeRole(e);document.getElementById("payCycle").value=employeePayCycle(e);document.getElementById("grossAmount").value=employeeBaseSalary(e);document.getElementById("advanceDebtOutstanding").value=employeeAdvanceBalance(e.id);recalcPayrollV456();}
function recalcPayrollV456(){const gross=+document.getElementById("grossAmount")?.value||0,adv=document.getElementById("advancePaid")?.checked?(+document.getElementById("advanceAmount")?.value||0):0,bal=document.getElementById("balancePaid")?.checked?(+document.getElementById("balanceAmount")?.value||0):0,ded=+document.getElementById("advanceDeduction")?.value||0,paid=adv+bal,remain=Math.max(0,gross-paid-ded);if(document.getElementById("payrollTotalPaid"))document.getElementById("payrollTotalPaid").value=paid.toFixed(0);if(document.getElementById("payrollRemaining"))document.getElementById("payrollRemaining").value=remain.toFixed(0);if(document.getElementById("payrollStatus"))document.getElementById("payrollStatus").value=(paid+ded)<=0?"En attente":remain<=.01?"Payé":"Partiel";}
function deletePayroll(id){const p=payrollRows().find(x=>String(x.id)===String(id));if(!p||user.role!=="ADMIN"&&p.owner!==user.username||!confirm("Supprimer cette paie ?"))return;removePayrollAdvanceRepayments(p.id);const before=cloneRecord(p);p.deleted=true;p.deletedAt=new Date().toISOString();p.updatedAt=p.deletedAt;audit("Suppression paie","payroll",p.id,p.employeeName,before,p);saveLocalOnly();cloudWriteGeneric("payroll",p,"Paie supprimée");payrollPage();}


// ===== ENCAISSEMENTS CLIENTS V4.6.0 =====
function clientReceiptsPage(){
 sessionStorage.removeItem("nysoa_receipt_form_project");
 const ctx=currentProjectContext();
 const rows=receiptRows().filter(r=>!ctx||String(r.project)===String(ctx)).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const received=rows.filter(r=>r.status==="Validé").reduce((n,r)=>n+(+r.amount||0),0);
 const pending=rows.filter(r=>r.status==="En attente").reduce((n,r)=>n+(+r.amount||0),0);
 const clientBalances=clientPaymentRows(ctx);
 $("#content").innerHTML=`${projectContextNotice()}<div class="kpis">
  ${kpi("💳","green","ENCAISSÉ VALIDÉ",money(received))}
  ${kpi("📊","blue","RESTE À PAYER CONTRATS",money(sum(clientBalances.map(r=>r.remaining))))}
  ${kpi("⏳","orange","EN ATTENTE",money(pending))}
  ${kpi("📄","blue","FACTURÉ",money(totalInvoiced(ctx)))}
  ${kpi("⚠","purple","CRÉANCE FACTURÉE",money(Math.max(0,totalInvoiced(ctx)-received)))}
 </div>
 <div class="panel"><h3>SUIVI DES PAIEMENTS PAR CLIENT ET CHANTIER</h3><div class="table-wrap"><table><thead><tr><th>Chantier</th><th>Client</th><th>Montant du contrat</th><th>Encaissé validé</th><th>Pourcentage payé</th><th>Reste à payer</th></tr></thead><tbody>
 ${clientBalances.length?clientBalances.map(r=>`<tr><td>${esc(projectLabel(r.project))}</td><td>${esc(r.client)}</td><td>${r.contract?money(r.contract):"Contrat à renseigner"}</td><td>${money(r.received)}</td><td>${r.percent===null?"—":r.percent.toFixed(2)+" %"}</td><td><b>${r.contract?money(r.remaining):"—"}</b></td></tr>`).join(""):'<tr><td colspan="6">Aucun contrat ni encaissement enregistré.</td></tr>'}
 </tbody></table></div></div>
 <div class="panel"><h3>ENCAISSEMENTS CLIENTS</h3>
 <div class="panel-body">
  <button class="btn primary" onclick="clientReceiptForm()">+ Nouvel encaissement</button>
  <div class="notice">Pourcentage payé = somme des encaissements validés / montant du contrat client. Le reste à payer contrat est distinct de la créance déjà facturée.</div>
 </div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Chantier</th><th>Client</th><th>Facture</th><th>Montant reçu</th><th>% du contrat</th><th>Mode</th><th>Référence</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>{const base=clientContractAmount(r.project,receiptClientName(r));return `<tr><td>${esc(r.date||"")}</td><td>${esc(projectLabel(r.project))}</td><td>${esc(receiptClientName(r))}</td><td>${esc(r.invoiceId||"")}</td><td><b>${money(r.amount||0)}</b></td><td>${base?((+r.amount||0)/base*100).toFixed(2)+" %":"—"}</td><td>${esc(r.paymentMode||"")}</td><td>${esc(r.reference||"")}</td><td>${workflowBadge(r.status||"En attente")}</td><td><div class="edit-actions">
 ${user.role==="ADMIN"&&r.status==="En attente"?`<button class="btn-xs btn-edit" onclick="validateClientReceipt('${r.id}',true)">Valider</button><button class="btn-xs btn-delete" onclick="validateClientReceipt('${r.id}',false)">Rejeter</button>`:""}
 ${canOpenOwnEdit(r)?`<button class="btn-xs" onclick="clientReceiptForm('${r.id}')">${canUserChange(r)?"Modifier":"Demander correction"}</button>`:""}
 </div></td></tr>`;}).join(""):`<tr><td colspan="10">Aucun encaissement.</td></tr>`}
 </tbody></table></div></div>`;
}
function clientReceiptForm(id="",projectOverride=""){
 const r=id?receiptRows().find(x=>String(x.id)===String(id)):null;
 if(id&&!r)return alert("Encaissement introuvable.");
 if(r&&!canOpenOwnEdit(r))return alert("Cet encaissement ne vous appartient pas.");
 const project=r?.project||projectOverride||sessionStorage.getItem("nysoa_receipt_form_project")||currentProjectContext()||"";
 const inv=invoiceRows().filter(x=>!project||String(x.project)===String(project));
 const suggestedClient=r?.client||inv.find(i=>i.id===r?.invoiceId)?.client||(db.projects||[]).find(p=>String(p.id)===String(project))?.client||"";
 const clientSuggestions=[...new Set([...(db.modules?.clients||[]).filter(c=>!c.deleted).map(clientNameFromRecord),(db.projects||[]).find(p=>String(p.id)===String(project))?.client,...acceptedQuotesForProject(project).filter(q=>!q.deleted).map(q=>q.client),...inv.map(i=>i.client)].filter(Boolean))];
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEL"} ENCAISSEMENT CLIENT</h3><form id="fReceipt" data-receipt-id="${esc(r?.id||"")}" class="form-grid">
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required onchange="receiptProjectChanged(this.value)"><option value="">Choisir</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(project)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label>
 <label>Facture / tranche<select name="invoiceId" onchange="receiptInvoiceChanged(this.value)"><option value="">Paiement global chantier</option>${inv.map(i=>`<option value="${esc(i.id)}" ${i.id===r?.invoiceId?"selected":""}>${esc(i.id)} — ${money(i.trancheAmount||0)}</option>`).join("")}</select></label>
 <label>Client<input name="client" id="receiptClient" list="receiptClientList" value="${esc(suggestedClient)}" oninput="recalcReceiptPayment()" required><datalist id="receiptClientList">${clientSuggestions.map(name=>`<option value="${esc(name)}"></option>`).join("")}</datalist></label>
 <label>Montant reçu (Ar)<input name="amount" id="receiptAmount" type="number" min="1" step="0.01" value="${+r?.amount||""}" oninput="recalcReceiptPayment()" required></label>
 <label>Pourcentage de ce versement sur le contrat (%)<input name="paymentPercent" id="receiptPercent" type="number" min="0.01" max="100" step="0.01" oninput="receiptPercentChanged()"><small>Vous pouvez saisir le montant ou le pourcentage.</small></label>
 <label>Montant du contrat client<input id="receiptContract" readonly></label>
 <label>Déjà encaissé validé<input id="receiptPreviouslyPaid" readonly></label>
 <label>Reste à payer après ce versement<input id="receiptRemaining" readonly></label>
 <label>Mode<select name="paymentMode">${["Espèces","Virement","Mobile Money","Chèque","Autre"].map(x=>`<option ${r?.paymentMode===x?"selected":""}>${x}</option>`).join("")}</select></label>
 <label>Référence / reçu<input name="reference" value="${esc(r?.reference||"")}" required></label>
 <label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="sessionStorage.removeItem('nysoa_receipt_form_project');clientReceiptsPage()">Annuler</button></div></form></div>`;
 recalcReceiptPayment();
 $("#fReceipt").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),now=new Date().toISOString();
  const project=f.get("project"),client=String(f.get("client")||"").trim(),amount=+f.get("amount")||0,invoiceId=f.get("invoiceId")||"";
  const invoice=invoiceId?invoiceRows().find(i=>String(i.id)===String(invoiceId)):null;
  if(invoiceId&&!invoice)return alert("Facture introuvable ou supprimée.");
  if(invoice&&(!String(invoice.project||"")||String(invoice.project)!==String(project)||clientPaymentKey(invoice.client)!==clientPaymentKey(client)))return alert("La facture choisie doit appartenir à ce chantier et à ce client.");
  const base=clientContractAmount(project,client);
  const already=sum(receiptRows().filter(x=>x.id!==r?.id&&x.status==="Validé"&&String(x.project)===String(project)&&clientPaymentKey(receiptClientName(x))===clientPaymentKey(client)).map(x=>x.amount));
  if(amount<=0)return alert("Montant invalide.");
  if(!base)return alert("Ajoutez un devis accepté ou une facture avec montant du contrat pour ce client et ce chantier.");
  if(already+amount>base+0.01)return alert("L’encaissement de ce client dépasse le montant du contrat sur ce chantier.");
  if(invoice&&invoiceReceiptPaid(invoice.id,r?.id)+amount>invoiceLegacyAmount(invoice)+0.01)return alert("Le total des paiements attribués à cette facture dépasse son montant. Choisissez « Paiement global chantier » pour une avance non attribuée.");
  const obj={id:r?.id||"ENC-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),date:f.get("date"),project,invoiceId,client,amount,paymentPercent:+(amount/base*100).toFixed(4),paymentMode:f.get("paymentMode"),reference:f.get("reference"),note:f.get("note")||"",status:r?.status|| (user.role==="ADMIN"?"Validé":"En attente"),owner:r?.owner||user.username,updatedBy:user.username,updatedAt:now};
  if(r&&requestEditIfRequired("clientReceipts",r,obj,clientReceiptsPage))return;
  if(r)Object.assign(r,obj);else{obj.createdAt=now;db.clientReceipts.push(obj);}
  save();clientReceiptsPage();
 };
}
function recalcReceiptPayment(){
 const f=document.getElementById("fReceipt");if(!f)return;
 const project=f.elements.project.value,client=f.elements.client.value,base=clientContractAmount(project,client);
 const currentId=f.dataset.receiptId||"";
 const already=sum(receiptRows().filter(r=>r.status==="Validé"&&String(r.id)!==currentId&&String(r.project)===String(project)&&clientPaymentKey(receiptClientName(r))===clientPaymentKey(client)).map(r=>r.amount));
 document.getElementById("receiptContract").value=base?money(base):"Contrat à renseigner";
 document.getElementById("receiptPreviouslyPaid").value=money(already);
 document.getElementById("receiptPercent").value=base&&+f.elements.amount.value?((+f.elements.amount.value)/base*100).toFixed(2):"";
 document.getElementById("receiptRemaining").value=base?money(Math.max(0,base-already-(+f.elements.amount.value||0))):"—";
}
function receiptPercentChanged(){
 const f=document.getElementById("fReceipt");if(!f)return;
 const base=clientContractAmount(f.elements.project.value,f.elements.client.value),percent=+document.getElementById("receiptPercent").value||0;
 if(!base){document.getElementById("receiptPercent").value="";return alert("Choisissez d’abord un client avec un devis accepté ou une facture avec montant du contrat.");}
 f.elements.amount.value=percent?+(base*percent/100).toFixed(2):"";
 recalcReceiptPayment();
}
function receiptProjectChanged(projectId){
 sessionStorage.setItem("nysoa_receipt_form_project",String(projectId||""));
 clientReceiptForm("",String(projectId||""));
}
function receiptInvoiceChanged(id){
 const inv=invoiceRows().find(x=>String(x.id)===String(id));
 if(inv){const el=document.getElementById("receiptClient");if(el)el.value=inv.client||"";}
 recalcReceiptPayment();
}
function validateClientReceipt(id,accept){
 if(user.role!=="ADMIN")return;
 const r=receiptRows().find(x=>String(x.id)===String(id));if(!r)return;
 if(accept){
  const base=clientContractAmount(r.project,receiptClientName(r));
  const other=sum(receiptRows().filter(x=>x.id!==r.id&&x.status==="Validé"&&String(x.project)===String(r.project)&&clientPaymentKey(receiptClientName(x))===clientPaymentKey(receiptClientName(r))).map(x=>x.amount));
  if(!base||other+(+r.amount||0)>base+0.01)return alert("Validation impossible : montant du contrat introuvable ou total encaissé supérieur au contrat de ce client.");
  if(r.invoiceId){const inv=invoiceRows().find(i=>String(i.id)===String(r.invoiceId));if(!inv||invoiceReceiptPaid(r.invoiceId,r.id)+(+r.amount||0)>invoiceLegacyAmount(inv)+0.01)return alert("Validation impossible : les paiements attribués dépassent le montant de cette facture.");}
  r.status="Validé";r.validatedAt=new Date().toISOString();r.validatedBy=user.username;
 }else{
  r.status="Rejeté";r.rejectedAt=new Date().toISOString();r.rejectedBy=user.username;
 }
 r.updatedAt=new Date().toISOString();save();clientReceiptsPage();
}


// ===== FACTURATION PAR CHANTIER / DEVIS VALIDÉ =====
function acceptedQuotesForProject(projectId){
 return (db.quotes||[]).filter(q=>!q.deleted&&financeProjectIsActive(q.project)&&q.status==="Accepté"&&(!projectId||String(q.project)===String(projectId)));
}
function projectBudgetAmount(project){
 if(!project?.id)return +project?.budget||0;
 if(project.budgetSource==="manuel")return +project.budget||0;
 const accepted=acceptedQuotesForProject(project.id);
 if(accepted.length)return sum(accepted.map(q=>quoteFinancials(q).ttc));
 return project.budgetSource==="devis"?0:(+project.budget||0);
}
function syncProjectQuoteBudget(projectId){
 const p=(db.projects||[]).find(row=>!row.deleted&&String(row.id)===String(projectId));
 if(!p)return;
 if(p.budgetSource==="manuel")return;
 const accepted=acceptedQuotesForProject(projectId),previous=+p.budget||0;
 if(accepted.length){
  if(p.budgetSource!=="devis")p.budgetBeforeQuote=previous;
  p.budget=sum(accepted.map(q=>quoteFinancials(q).ttc));p.budgetSource="devis";
 }else if(p.budgetSource==="devis"){
  p.budget=0;
 }else return;
 if(p.budget!==previous||p.budgetSource!=="devis"||!p.budgetQuoteSyncedAt){
  p.budgetQuoteSyncedAt=new Date().toISOString();p.updatedAt=p.budgetQuoteSyncedAt;
  saveLocalOnly();cloudSyncRecord("projects",p);
 }
}
function invoiceDisplayNo(r){return String(r?.invoiceNo||r?.id||"");}
function generateInvoiceInternalId(){
 if(globalThis.crypto?.randomUUID)return "INV-"+crypto.randomUUID();
 return "INV-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);
}
function generateInvoiceNumber(){
 const y=new Date().getFullYear();
 const nums=(db.modules?.invoices||[]).map(r=>String(r.invoiceNo||r.id||""))
  .map(v=>{const m=v.match(new RegExp("^FAC-"+y+"-(\\d{4})$"));return m?+m[1]:0;});
 const n=Math.max(0,...nums)+1;
 return "FAC-"+y+"-"+String(n).padStart(4,"0");
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
async function invoiceRecoveryPage(){
 if(user.role!=="ADMIN")return;
 $("#content").innerHTML=`<div class="panel"><h3>RÉCUPÉRATION & HISTORIQUE FACTURATION</h3>
 <div class="panel-body"><button class="btn secondary" onclick="invoicesPage()">← Retour Facturation</button>
 <div class="notice">Centre de sécurité : versions locales, Cloud, audit et sauvegardes automatiques avant conflit. Restaurer crée une nouvelle version sûre sans écraser l’original.</div></div>
 <div id="invoiceRecoveryRows" class="table-wrap">Chargement…</div></div>`;
 let candidates=[];
 const add=(source,snap,date="")=>{
  if(!snap||!(+snap.quoteAmount||+snap.trancheAmount||+snap.values?.[2]||0))return;
  candidates.push({source,date:date||snap.updatedAt||snap.createdAt||"",snapshot:snap});
 };
 (db.modules?.invoices||[]).forEach(x=>add("Local actuel",cloneRecord(x)));
 (db.syncRecovery||[]).filter(x=>x.collection==="invoices").forEach(x=>{
  add("Backup local avant sync",x.localSnapshot,x.createdAt);
  add("Version Cloud observée",x.remoteSnapshot,x.createdAt);
 });
 try{
  if(cloudReady&&fbStore){
   const [si,sa]=await Promise.all([fbStore.collection("invoices").get(),fbStore.collection("auditLog").where("module","==","invoices").get()]);
   si.docs.forEach(d=>add("Cloud actuel",{id:d.id,...d.data()}));
   sa.docs.forEach(d=>{const a=d.data();if(a.after)add("Audit — "+(a.action||"action"),a.after,a.date);if(a.before)add("Audit avant — "+(a.action||"action"),a.before,a.date);});
  }
 }catch(e){console.warn("recovery scan",e);}
 const seen=new Set();
 candidates=candidates.filter(c=>{const k=recordFingerprint(c.snapshot);if(seen.has(k))return false;seen.add(k);return true;})
  .sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const el=document.getElementById("invoiceRecoveryRows");
 el.innerHTML=`<table><thead><tr><th>Source</th><th>Date version</th><th>N°</th><th>Chantier</th><th>Client</th><th>Montant devis</th><th>Tranche</th><th>Montant tranche</th><th>Action</th></tr></thead><tbody>
 ${candidates.length?candidates.map((c,i)=>{const r=c.snapshot;return `<tr><td>${esc(c.source)}</td><td>${c.date?new Date(c.date).toLocaleString("fr-FR"):""}</td><td><b>${esc(invoiceDisplayNo(r))}</b></td><td>${esc(projectLabel(r.project)||r.project||"")}</td><td>${esc(r.client||r.values?.[1]||"")}</td><td>${money(+r.quoteAmount||0)}</td><td>${(+r.tranchePercent||0).toFixed(2)}%</td><td>${money(invoiceLegacyAmount(r))}</td><td><button class="btn-xs btn-edit" onclick="restoreInvoiceCandidate(${i})">Restaurer copie</button></td></tr>`;}).join(""):'<tr><td colspan="9">Aucune version récupérable trouvée.</td></tr>'}
 </tbody></table>`;
 window.__invoiceRecoveryCandidates=candidates;
}
async function restoreInvoiceCandidate(index){
 if(user.role!=="ADMIN")return;
 const c=window.__invoiceRecoveryCandidates?.[index];if(!c)return alert("Version introuvable.");
 const s=cloneRecord(c.snapshot),actor=effectiveUserIdentity(),now=new Date().toISOString();
 const restored={...s,id:generateInvoiceInternalId(),invoiceNo:(s.invoiceNo||invoiceDisplayNo(s)||generateInvoiceNumber())+"-R",
  deleted:false,restoredFrom:s.id||"",restoredSource:c.source,restoredAt:now,updatedAt:now,updatedBy:actor.label||actor.username||user.username};
 delete restored.cloudSyncedAt;delete restored.legacyQuarantined;delete restored.__syncConflict;
 db.modules.invoices.push(restored);saveLocalOnly();
 audit("Restauration facture","invoices",restored.id,`Depuis ${c.source} — ${restored.invoiceNo}`,null,cloneRecord(restored));
 await cloudWriteGeneric("invoices",restored,"Facture restaurée");
 alert("Copie restaurée. L’ancienne version n’a pas été écrasée.");
 invoicesPage();
}

function invoicePaidForProject(projectId,excludeId="",client="",quoteId=""){
 return invoiceRows().filter(r=>String(r.project)===String(projectId)&&String(r.id)!==String(excludeId)
  &&(!client||clientPaymentKey(r.client||r.values?.[1])===clientPaymentKey(client))
  &&(!quoteId||String(r.quoteId||"")===String(quoteId)))
  .reduce((n,r)=>n+invoiceLegacyAmount(r),0);
}
function invoiceReceiptPaid(invoiceId,excludeReceiptId=""){
 return sum(receiptRows().filter(r=>r.status==="Validé"&&String(r.invoiceId)===String(invoiceId)&&String(r.id)!==String(excludeReceiptId)).map(r=>r.amount||r.receivedAmount));
}
function invoiceDesignationText(r){
 return String(r?.invoiceDesignation||(db.quotes||[]).find(q=>String(q.id)===String(r?.quoteId))?.object||r?.object||"").trim();
}
function invoiceQuoteLines(q){
 return (q?.sections||[]).flatMap(s=>(s.items||[]).map(i=>({section:String(s.title||""),no:String(i.no||""),designation:String(i.designation||""),unit:String(i.unit||""),qty:+i.qty||0,pu:+i.pu||0,amount:(+i.qty||0)*(+i.pu||0)})));
}
function invoiceQuoteLinesHtml(q,record){
 const snapshot=record?.quoteLines?.length&&(!q||String(record.quoteId)===String(q.id));
 const lines=snapshot?record.quoteLines:q?invoiceQuoteLines(q):[];
 if(!lines.length)return '<div class="notice">Sélectionnez un devis accepté pour afficher automatiquement les désignations, quantités et prix unitaires.</div>';
 const f=snapshot?{ht:+record.quotedHt||0,discount:+record.quotedDiscount||0,vat:+record.quotedVat||0,ttc:+record.quoteAmount||0}:q?quoteFinancials(q):{ht:0,discount:0,vat:0,ttc:0};
 return `<div class="notice">Détail du devis accepté : les quantités ci-dessous sont celles du contrat. Le montant de la facture peut représenter une tranche et ne signifie pas que toutes ces quantités ont été livrées.</div><div class="table-wrap"><table><thead><tr><th>Lot</th><th>N°</th><th>Désignation du devis</th><th>Unité</th><th>Quantité prévue</th><th>PU devis</th><th>Montant prévu</th></tr></thead><tbody>${lines.map(i=>`<tr><td>${esc(i.section)}</td><td>${esc(i.no)}</td><td>${esc(i.designation)}</td><td>${esc(i.unit)}</td><td>${i.qty}</td><td>${money(i.pu)}</td><td>${money(i.amount)}</td></tr>`).join("")}</tbody></table></div><div class="notice">Sous-total : ${money(f.ht)} · Réduction : ${money(f.discount)} · TVA : ${money(f.vat)} · Contrat final : <b>${money(f.ttc)}</b></div>`;
}
function invoiceBilledQuantity(quoteId,lineIndex,excludeInvoiceId=""){
 return invoiceRows().filter(i=>String(i.quoteId)===String(quoteId)&&String(i.id)!==String(excludeInvoiceId)&&i.invoiceType==="Attachement")
  .reduce((n,i)=>n+(+i.billedLines?.[lineIndex]?.billedQty||0),0);
}
function invoiceAttachmentHtml(q,record){
 if(!q)return '<div class="notice">Un devis accepté est nécessaire pour saisir un attachement.</div>';
 const f=quoteFinancials(q),ratio=f.ht?f.ttc/f.ht:0;
 return `<div class="notice">Indiquez les quantités <b>réellement exécutées</b>. Le PU du devis est repris automatiquement ; la réduction et la TVA sont réparties au prorata. Les factures d’attachement précédentes diminuent les quantités encore disponibles.</div><div class="table-wrap"><table><thead><tr><th>N°</th><th>Désignation</th><th>Unité</th><th>Qté prévue</th><th>Déjà facturée</th><th>Qté de cette facture</th><th>PU devis</th><th>PU final / total</th></tr></thead><tbody>${invoiceQuoteLines(q).map((line,index)=>{const billed=invoiceBilledQuantity(q.id,index,record?.id),available=Math.max(0,line.qty-billed),current=+record?.billedLines?.[index]?.billedQty||0;return `<tr><td>${esc(line.no)}</td><td>${esc(line.designation)}</td><td>${esc(line.unit)}</td><td>${line.qty}</td><td>${billed}</td><td><input type="number" name="billedQty_${index}" data-invoice-billed-line="${index}" min="0" max="${available}" step="any" value="${current}" oninput="recalcInvoiceForm('lines')" style="min-width:90px"></td><td>${money(line.pu)}</td><td>${money(line.pu*ratio)} / ${money(current*line.pu*ratio)}</td></tr>`}).join("")}</tbody></table></div>`;
}
function invoiceAttachmentValue(quote,billedLines){
 const f=quoteFinancials(quote),ratio=f.ht?f.ttc/f.ht:0;
 return Math.round(sum(billedLines.map(line=>(+line.billedQty||0)*(+line.pu||0)))*ratio*100)/100;
}
function validatedQuoteAmount(projectId,quoteId=""){
 const q=quoteId?(db.quotes||[]).find(x=>x.id===quoteId):acceptedQuotesForProject(projectId).slice(-1)[0];
 return q?quoteFinancials(q).ttc:0;
}

function invoiceRecoveryIdentity(r){
 const visible=String(r?.invoiceNo||r?.id||"").trim();
 if(visible)return visible;
 return [r?.date||"",r?.project||"",r?.client||"",+r?.quoteAmount||0,+r?.tranchePercent||0,+r?.trancheAmount||+r?.values?.[2]||0].join("|");
}
function isValidRecoverableInvoice(r){
 if(!r||r.deleted)return false;
 const amount=+r.trancheAmount||+r.values?.[2]||0;
 const quote=+r.quoteAmount||0;
 return amount>0&&(quote>0||r.project||r.client);
}
async function restoreMissingInvoicesFromHistory(){
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 const currentKeys=new Set(invoiceRows().map(invoiceRecoveryIdentity));
 let candidates=[];

 const add=(r,date="",source="")=>{
  if(!isValidRecoverableInvoice(r))return;
  candidates.push({r:cloneRecord(r),date:date||r.updatedAt||r.createdAt||"",source});
 };
 (db.syncRecovery||[]).filter(x=>x.collection==="invoices").forEach(x=>{
  add(x.localSnapshot,x.createdAt,"Backup sync");
  add(x.remoteSnapshot,x.createdAt,"Cloud observé");
 });
 try{
  if(cloudReady&&fbStore){
   const [is,as]=await Promise.all([
    fbStore.collection("invoices").get(),
    fbStore.collection("auditLog").get()
   ]);
   is.docs.forEach(d=>add({id:d.id,...d.data()},"","Cloud invoices"));
   as.docs.map(d=>d.data()).filter(a=>String(a.module||"").includes("invoices")).forEach(a=>{
    add(a.after,a.date,"Audit après");
    add(a.before,a.date,"Audit avant");
   });
  }
 }catch(e){console.warn("Restauration factures",e);}

 // Keep only the latest known snapshot for each invoice identity.
 const latest=new Map();
 candidates.sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).forEach(c=>{
  const key=invoiceRecoveryIdentity(c.r);
  latest.set(key,c);
 });

 let restored=0;
 for(const [key,c] of latest){
  if(currentKeys.has(key))continue;
  const s=c.r,now=new Date().toISOString();
  // Preserve visible invoice number; give a fresh internal ID only if its old ID collides.
  const existingId=db.modules.invoices.some(x=>String(x.id)===String(s.id));
  const restoredObj={...s,
   id:existingId?generateInvoiceInternalId():(s.id||generateInvoiceInternalId()),
   invoiceNo:s.invoiceNo||(String(s.id||"").startsWith("FAC-")?s.id:generateInvoiceNumber()),
   deleted:false,recovered:true,recoveredSource:c.source,recoveredAt:now,updatedAt:now,
   updatedBy:effectiveUserIdentity().label||user.username
  };
  delete restoredObj.legacyQuarantined;delete restoredObj.legacyReason;delete restoredObj.__syncConflict;
  db.modules.invoices.push(restoredObj);currentKeys.add(key);restored++;
  audit("Restauration automatique facture","invoices",restoredObj.id,`${restoredObj.invoiceNo} — ${c.source}`,null,cloneRecord(restoredObj));
  try{await cloudWriteGeneric("invoices",restoredObj,"Facture récupérée");}catch(e){}
 }
 if(restored)saveLocalOnly();
 return restored;
}

async function refreshInvoicesFromCloud(){
 if(!cloudReady||!fbStore||!user)return {active:invoiceRows(),recoverable:0};
 try{
  const snap=await fbStore.collection("invoices").get();
  const remote=snap.docs.map(d=>({id:d.id,...d.data()}));
  db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
  const byId=new Map(db.modules.invoices.map(r=>[String(r.id),r]));
  let changed=false;
  remote.forEach(r=>{
   const id=String(r.id),local=byId.get(id);
   if(!local){db.modules.invoices.push(r);byId.set(id,r);changed=true;return;}
   const rt=businessTimestamp(r),lt=businessTimestamp(local);
   if(recordFingerprint(local)!==recordFingerprint(r) && rt>=lt){
    backupBeforeRemoteOverwrite("invoices",local,r,"facturation_cloud_refresh");
    Object.keys(local).forEach(k=>delete local[k]);Object.assign(local,r);changed=true;
   }
  });
  if(changed)saveLocalOnly();
  rememberCollectionFingerprints("invoices",remote);

  // Count distinct historical invoice versions that are not currently active.
  let recoverable=0;
  try{
   const a=await fbStore.collection("auditLog").where("module","==","invoices").get();
   const activeIds=new Set(invoiceRows().map(r=>String(r.id)));
   const seen=new Set();
   a.docs.forEach(d=>{
    const x=d.data()||{};
    [x.after,x.before].forEach(v=>{
     if(!v)return;
     const amt=+v.trancheAmount||+v.values?.[2]||0;
     if(!amt)return;
     const key=recordFingerprint(v);
     if(seen.has(key))return;seen.add(key);
     if(!activeIds.has(String(v.id||"")))recoverable++;
    });
   });
  }catch(e){console.warn("audit facturation",e);}
  return {active:invoiceRows(),recoverable};
 }catch(e){
  console.warn("Lecture Cloud facturation",e);
  return {active:invoiceRows(),recoverable:0};
 }
}

async function invoicesPage(){
 sessionStorage.removeItem("nysoa_invoice_form_project");
 if(user.role!=="ADMIN")return generic("invoices");

 $("#content").innerHTML=`<div class="panel"><h3>FACTURATION</h3><div class="panel-body">Chargement des factures Cloud…</div></div>`;
 const cloudStateInvoices=await refreshInvoicesFromCloud();
 const restoredInvoices=await restoreMissingInvoicesFromHistory();

 const ctx=currentProjectContext();
 const rows=invoiceRows().filter(r=>!ctx||String(r.project||"")===String(ctx));
 const recoverable=cloudStateInvoices.recoverable||0;

 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>FACTURATION PAR CHANTIER</h3>
 <div class="panel-body"><button class="btn primary" onclick="invoiceForm()">+ Nouvelle tranche / facture</button>
 <button class="btn secondary" onclick="invoiceRecoveryPage()">🛟 Historique / récupération${recoverable?` (${recoverable})`:""}</button>
 ${legacyInvoiceRows().length?`<button class="btn secondary" onclick="legacyInvoiceReviewPage()">⚠ ${legacyInvoiceRows().length} ancienne(s) donnée(s) isolée(s)</button>`:""}
 ${restoredInvoices?`<div class="notice"><b>${restoredInvoices} facture(s) historique(s) récupérée(s) automatiquement.</b></div>`:""}
 <div class="notice"><b>Source actuelle : Cloud Firebase + données locales fusionnées.</b> « Tous les chantiers » affiche toutes les factures actives. Les anciennes versions restent accessibles dans Historique / récupération sans être comptées deux fois.</div></div>
 <div class="table-wrap"><table><thead><tr><th>N° facture</th><th>Date</th><th>Chantier</th><th>Client</th><th>Désignation facture</th><th>Devis validé</th><th>Contrat final</th><th>Tranche</th><th>Montant facture</th><th>Attribué à la facture</th><th>Reste facture</th><th>Total facturé</th><th>Reste à facturer</th><th>Reste à payer contrat</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>{
  const qa=+r.quoteAmount||validatedQuoteAmount(r.project,r.quoteId);
  const projectInvoices=invoiceRows().filter(x=>String(x.project)===String(r.project)&&clientPaymentKey(x.client||x.values?.[1])===clientPaymentKey(r.client||r.values?.[1])&&(!r.quoteId||String(x.quoteId||"")===String(r.quoteId)));
  const paid=projectInvoices.reduce((n,x)=>n+invoiceLegacyAmount(x),0);
  const remain=Math.max(0,qa-paid),pr=(db.projects||[]).find(p=>String(p.id)===String(r.project));
  const balance=clientPaymentRows(r.project).find(x=>clientPaymentKey(x.client)===clientPaymentKey(r.client||r.values?.[1]));
  const allocated=invoiceReceiptPaid(r.id);
  return `<tr><td><b>${esc(invoiceDisplayNo(r))}</b></td><td>${esc(r.date||"")}</td><td>${esc(projectChantierName(pr)||r.project||"")}</td><td>${esc(r.billingClientName||r.client||r.values?.[1]||"")}</td><td>${esc(invoiceDesignationText(r))}</td><td>${esc(r.quoteId||"")}</td><td>${money(qa||(+r.quoteAmount||0))}</td><td><b>${(+r.tranchePercent||0).toFixed(2)}%</b></td><td>${money(invoiceLegacyAmount(r))}</td><td>${money(allocated)}</td><td><b>${money(Math.max(0,invoiceLegacyAmount(r)-allocated))}</b></td><td>${money(paid)}</td><td><b>${money(remain)}</b></td><td><b>${balance?.contract?money(balance.remaining):'Contrat à renseigner'}</b></td><td>${r.__syncConflict?'<span class="badge b-orange">Conflit sync</span> ':""}<div class="edit-actions"><button class="btn-xs" onclick="invoiceDetail('${r.id}')">Voir détail</button><button class="btn-xs btn-edit" onclick="invoiceForm('${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="deleteInvoice('${r.id}')">Supprimer</button></div></td></tr>`;
 }).join(""):`<tr><td colspan="15">Aucune facture active pour ce filtre. Vérifiez « Historique / récupération » si une ancienne facture a été remplacée ou supprimée.</td></tr>`}
 </tbody></table></div></div>`;
}
function invoiceDetail(id){
 if(user?.role!=="ADMIN")return;
 const r=invoiceRows().find(i=>String(i.id)===String(id));if(!r)return alert("Facture introuvable.");
 const position=clientPaymentRows(r.project).find(x=>clientPaymentKey(x.client)===clientPaymentKey(r.client));
 const contract=+r.quoteAmount||0,already=invoicePaidForProject(r.project,"",r.client,r.quoteId),amount=invoiceLegacyAmount(r);
 $("#content").innerHTML=`<div class="panel invoice-detail"><div class="panel-body no-print"><button class="btn secondary" onclick="invoicesPage()">← Facturation</button> <button class="btn primary" onclick="invoiceForm('${esc(r.id)}')">Modifier</button> <button class="btn primary" onclick="window.print()">Imprimer / PDF</button></div><h3>FACTURE ${esc(invoiceDisplayNo(r))} — ${esc(r.date||"")}</h3><div class="panel-body"><p><b>Chantier :</b> ${esc(projectFullLabel(r.project))} · <b>Client :</b> ${esc(r.billingClientName||r.client)} · <b>Devis :</b> ${esc(r.quoteId||"Saisie manuelle")} · <b>Type :</b> ${esc(r.invoiceType||"Tranche / acompte")}</p><div class="invoice-object"><small>DÉSIGNATION DE LA FACTURE</small><strong>${esc(invoiceDesignationText(r)||"Objet à renseigner")}</strong></div>${r.note?`<p><b>Précision :</b> ${esc(r.note)}</p>`:""}<div class="invoice-detail-summary"><div>Montant de cette facture<br><strong>${money(amount)}</strong></div><div>Encaissé et attribué à cette facture<br><strong>${money(invoiceReceiptPaid(r.id))}</strong></div><div>Reste sur cette facture<br><strong>${money(Math.max(0,amount-invoiceReceiptPaid(r.id)))}</strong></div><div>Reste à facturer sur ce devis<br><strong>${money(Math.max(0,contract-already))}</strong></div><div>Déjà payé par ce client sur ce chantier<br><strong>${money(position?.received||0)}</strong></div><div>Reste à payer sur son contrat<br><strong>${position?.contract?money(position.remaining):"Contrat à renseigner"}</strong></div></div><div class="notice no-print">Les lignes techniques du devis restent disponibles pour le calcul d’un attachement, sans être imprimées comme désignation de cette facture. Un paiement global non attribué à cette facture est compté dans le total payé du client.</div></div></div>`;
}
function invoiceForm(id="",projectOverride=""){
 if(user.role!=="ADMIN")return;
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 const r=id?db.modules.invoices.find(x=>String(x.id)===String(id)):null;
 const projectId=r?.project||projectOverride||sessionStorage.getItem("nysoa_invoice_form_project")||currentProjectContext()||"",quotes=acceptedQuotesForProject(projectId);
 const budgetProject=(db.projects||[]).find(p=>String(p.id)===String(projectId));
 const selectedQuoteId=r?.quoteId||(budgetProject?.budgetSource==="manuel"?"":quotes.length===1?quotes[0].id:""),selectedQuote=(db.quotes||[]).find(q=>q.id===selectedQuoteId);
 const qa=selectedQuote?quoteFinancials(selectedQuote).ttc:r?.quoteAmount!=null?+r.quoteAmount:budgetProject?.budgetSource==="manuel"?projectBudgetAmount(budgetProject):0,pct=+r?.tranchePercent||0;
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVELLE"} FACTURATION</h3><div class="notice">Le champ « Désignation de la facture » reprend d’abord l’OBJET du devis. Vous pouvez ensuite réécrire librement ce texte pour chaque facture. Les détails techniques du devis servent seulement au calcul de l’attachement.</div><form id="fInvoice" class="form-grid">
 <input type="hidden" name="recordId" value="${esc(r?.id||generateInvoiceInternalId())}">
 <label>N° facture<input name="invoiceNo" value="${esc(r?.invoiceNo||(r?.id?.startsWith("FAC-")?r.id:generateInvoiceNumber()))}" required></label>
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required onchange="invoiceProjectChanged(this.value)"><option value="">Choisir un chantier</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(projectId)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label>
 <label>Devis validé<select name="quoteId" onchange="invoiceQuoteChanged(this.value)"><option value="">Saisie manuelle / aucun devis lié</option>${quotes.map(q=>`<option value="${esc(q.id)}" ${q.id===selectedQuoteId?"selected":""}>${esc(q.id)} — ${money(quoteFinancials(q).ttc)}</option>`).join("")}</select></label>
 <label>Client du contrat (suivi comptable)<input name="client" id="invoiceClient" value="${esc(r?.client||selectedQuote?.client||budgetProject?.client||"")}" placeholder="Nom du client" ${selectedQuote?'readonly':''} oninput="recalcInvoiceForm()" required></label>
 <label>Client affiché sur la facture<input name="billingClientName" id="invoiceBillingClient" value="${esc(r?.billingClientName||r?.client||selectedQuote?.client||budgetProject?.client||"")}" required></label>
 <label class="full">Désignation de la facture<textarea name="invoiceDesignation" id="invoiceDesignation" required placeholder="Ex. Première tranche sur paiement des travaux de finition d’un bâtiment">${esc(r?.invoiceDesignation||selectedQuote?.object||invoiceDesignationText(r))}</textarea></label>
 <label>Budget du chantier<input id="invoiceProjectBudget" value="${projectId?projectBudgetAmount(budgetProject):0}" readonly></label>
 <label>Montant du contrat<input name="quoteAmount" id="invoiceQuoteAmount" type="number" min="0" step="0.01" value="${+qa||0}" ${selectedQuote||budgetProject?.budgetSource==="manuel"?'readonly':''} oninput="recalcInvoiceForm()" required></label>
 <details class="full invoice-quote-reference"><summary>Voir les lignes du devis (référence interne pour le calcul)</summary><div id="invoiceQuoteLines">${invoiceQuoteLinesHtml(selectedQuote,r)}</div></details>
 <label>Nature de la facture<select name="invoiceType" id="invoiceType" onchange="invoiceModeChanged(this.value)"><option value="Tranche" ${r?.invoiceType!=="Attachement"?"selected":""}>Tranche / acompte (montant direct)</option><option value="Attachement" ${r?.invoiceType==="Attachement"?"selected":""}>Attachement (quantités exécutées)</option></select></label>
 <div id="invoiceAttachmentLines" class="full" style="display:${r?.invoiceType==="Attachement"?'block':'none'}">${invoiceAttachmentHtml(selectedQuote,r)}</div>
 <label>Montant exact de cette facture (Ar)<input name="trancheAmount" id="invoiceTrancheAmount" type="number" min="0.01" step="0.01" value="${+r?.trancheAmount||""}" oninput="recalcInvoiceForm('amount')" required></label>
 <label>Part du devis facturée (%)<input name="tranchePercent" id="invoiceTranchePercent" type="number" min="0" max="100" step="0.000001" value="${pct||""}" oninput="recalcInvoiceForm('percent')"></label>
 <label>Total déjà facturé avant cette facture<input id="invoiceAlreadyPaid" value="${invoicePaidForProject(projectId,r?.id||"",r?.client||selectedQuote?.client||"",selectedQuoteId)}" readonly></label>
 <label>Reste à facturer après cette facture<input id="invoiceRemaining" value="0" readonly></label>
 <label>Déjà encaissé du client (validé)<input id="invoiceClientReceived" value="0" readonly></label>
 <label>Reste à payer du client sur son contrat<input id="invoiceClientDue" value="0" readonly></label>
 <div class="notice full">« Reste à facturer » = contrat − factures. « Reste à payer du client » = contrat − encaissements validés. Émettre une facture ne signifie pas que le client a payé.</div>
 <label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="sessionStorage.removeItem('nysoa_invoice_form_project');invoicesPage()">Annuler</button></div></form></div>`;
 recalcInvoiceForm();
 $("#fInvoice").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),project=f.get("project"),quoteId=f.get("quoteId"),q=(db.quotes||[]).find(x=>x.id===quoteId);
  if(q&&(q.deleted||q.status!=="Accepté"))return alert("Le devis sélectionné doit être actif et accepté.");
  const client=(f.get("client")||q?.client||"").trim(),billingClientName=String(f.get("billingClientName")||client).trim(),invoiceDesignation=String(f.get("invoiceDesignation")||q?.object||"").trim(),amount=+f.get("quoteAmount")||0,invoiceType=f.get("invoiceType")==="Attachement"?"Attachement":"Tranche";
  if(invoiceType==="Attachement"&&!q)return alert("Choisissez un devis accepté pour saisir un attachement.");
  const billedLines=invoiceType==="Attachement"?invoiceQuoteLines(q).map((line,index)=>({...line,billedQty:+f.get(`billedQty_${index}`)||0})):[];
  if(billedLines.some((line,index)=>line.billedQty<0||line.billedQty+invoiceBilledQuantity(quoteId,index,r?.id)>line.qty+0.000001))return alert("Une quantité facturée dépasse la quantité restante du devis.");
  const tranche=invoiceType==="Attachement"?invoiceAttachmentValue(q,billedLines):+f.get("trancheAmount")||0,pct=amount?tranche/amount*100:0,already=invoicePaidForProject(project,r?.id||"",client,quoteId);
  if(q&&(String(q.project)!==String(project)||clientPaymentKey(q.client)!==clientPaymentKey(client)))return alert("Le devis choisi doit appartenir à ce chantier et à ce client.");
  if(q&&Math.abs(amount-quoteFinancials(q).ttc)>0.01)return alert("Le montant du contrat doit correspondre au devis accepté sélectionné.");
  const activeProject=(db.projects||[]).find(p=>String(p.id)===String(project));
  const manualBudget=activeProject?.budgetSource==="manuel";
  if(manualBudget&&(clientPaymentKey(client)!==clientPaymentKey(activeProject.client)||Math.abs(amount-projectBudgetAmount(activeProject))>0.01))return alert("Le client et le montant du contrat doivent correspondre au budget saisi directement pour ce chantier.");
  if(!q&&!manualBudget&&acceptedQuotesForProject(project).length)return alert("Choisissez le devis accepté correspondant à ce client pour lier correctement la facture au budget du chantier.");
  if(!client)return alert("Veuillez renseigner le client.");
  if(!billingClientName||!invoiceDesignation)return alert("Renseignez le client à afficher et la désignation de cette facture.");
  if(amount<=0)return alert("Veuillez renseigner le montant du devis validé.");
  if(tranche<=0||!Number.isFinite(tranche))return alert("Saisissez un montant positif pour cette facture.");
  const alreadyReceivedForInvoice=receiptRows().filter(rec=>rec.status==="Validé"&&String(rec.invoiceId)===String(r?.id||"")&&r?.id).reduce((n,rec)=>n+(+rec.amount||0),0);
  if(r&&alreadyReceivedForInvoice>0&&(String(r.project)!==String(project)||clientPaymentKey(r.client)!==clientPaymentKey(client)||String(r.quoteId||"")!==String(quoteId||"")))return alert("Facture liée à des paiements : chantier, client et devis ne peuvent plus être modifiés.");
  if(r&&alreadyReceivedForInvoice>tranche+0.01)return alert("Des encaissements validés sont déjà liés à cette facture et dépassent son nouveau montant.");
  if(q&&!manualBudget&&Math.abs(projectBudgetAmount(activeProject)-sum(acceptedQuotesForProject(project).map(x=>quoteFinancials(x).ttc)))>0.01)return alert("Budget chantier et devis acceptés ne correspondent pas.");
  if(already+tranche>amount+0.01)return alert("Cette tranche dépasse le reste à facturer pour ce client et ce devis.");
  const before=r?cloneRecord(r):null,actor=effectiveUserIdentity();
  const obj={
   id:r?.id||f.get("recordId")||generateInvoiceInternalId(),
   invoiceNo:String(f.get("invoiceNo")||r?.invoiceNo||r?.id||generateInvoiceNumber()).trim(),
   date:f.get("date"),project,quoteId:quoteId||"",client,billingClientName,invoiceDesignation,quoteAmount:amount,tranchePercent:pct,trancheAmount:tranche,invoiceType,billedLines,
   quoteLines:r?.quoteLines?.length&&r.quoteId===quoteId?r.quoteLines:q?invoiceQuoteLines(q):[],quotedHt:r?.quoteLines?.length&&r.quoteId===quoteId?r.quotedHt:q?quoteFinancials(q).ht:0,quotedDiscount:r?.quoteLines?.length&&r.quoteId===quoteId?r.quotedDiscount:q?quoteFinancials(q).discount:0,quotedVat:r?.quoteLines?.length&&r.quoteId===quoteId?r.quotedVat:q?quoteFinancials(q).vat:0,
   note:f.get("note")||"",workflow:r?.workflow||"Validé",owner:r?.owner||actor.username||user.username,
   updatedBy:actor.label||actor.username||user.username,updatedAt:new Date().toISOString()
  };
  if(r)Object.assign(r,obj);else{obj.createdAt=new Date().toISOString();db.modules.invoices.push(obj);}
  audit(r?"Modification facture":"Création facture","invoices",obj.id,`${obj.invoiceNo} — ${client} — ${money(tranche)}`,before,cloneRecord(obj));
  sessionStorage.removeItem("nysoa_invoice_form_project");
  saveLocalOnly();
  cloudWriteGeneric("invoices",obj,r?"Facture modifiée":"Nouvelle facture");
  invoicesPage();
 };
}
function invoiceProjectChanged(projectId){
 sessionStorage.setItem("nysoa_invoice_form_project",String(projectId||""));
 const qsel=document.querySelector('#fInvoice select[name="quoteId"]');
 if(!qsel)return;
 const quotes=acceptedQuotesForProject(projectId);
 qsel.innerHTML='<option value="">Saisie manuelle / aucun devis lié</option>'+
  quotes.map(q=>`<option value="${esc(q.id)}">${esc(q.id)} — ${money(quoteFinancials(q).ttc)}</option>`).join("");
 const project=(db.projects||[]).find(p=>String(p.id)===String(projectId));
 qsel.value=project?.budgetSource==="manuel"?"":quotes.length===1?quotes[0].id:"";
 const budget=document.getElementById("invoiceProjectBudget");
 if(budget)budget.value=projectBudgetAmount((db.projects||[]).find(p=>String(p.id)===String(projectId)));
 const invoiceAmount=document.getElementById("invoiceTrancheAmount");if(invoiceAmount)invoiceAmount.value="";
 const invoicePercent=document.getElementById("invoiceTranchePercent");if(invoicePercent)invoicePercent.value="";
 invoiceQuoteChanged(qsel.value);
 recalcInvoiceForm();
}
function invoiceQuoteChanged(quoteId){
 const q=acceptedQuotesForProject().find(x=>x.id===quoteId);
 const projectId=document.querySelector('#fInvoice select[name="project"]')?.value||"";
 const project=(db.projects||[]).find(p=>String(p.id)===String(projectId));
 const client=document.getElementById("invoiceClient"),base=document.getElementById("invoiceQuoteAmount"),lines=document.getElementById("invoiceQuoteLines");
 if(q){
  client.value=q.client||"";base.value=quoteFinancials(q).ttc;
 }else{client.value=project?.budgetSource==="manuel"?project.client||"":"";base.value=project?.budgetSource==="manuel"?projectBudgetAmount(project):"";}
 const displayedClient=document.getElementById("invoiceBillingClient"),designation=document.getElementById("invoiceDesignation");
 if(displayedClient)displayedClient.value=q?.client||((project?.budgetSource==="manuel")?project.client:"")||"";
 if(designation)designation.value=q?.object||"";
 client.readOnly=!!q;base.readOnly=!!q||project?.budgetSource==="manuel";
 if(lines)lines.innerHTML=invoiceQuoteLinesHtml(q,null);
 const attachment=document.getElementById("invoiceAttachmentLines");if(attachment)attachment.innerHTML=invoiceAttachmentHtml(q,null);
 const amount=document.getElementById("invoiceTrancheAmount");if(amount)amount.value="";
 const percent=document.getElementById("invoiceTranchePercent");if(percent)percent.value="";
 recalcInvoiceForm();
}
function invoiceModeChanged(mode){
 const f=document.getElementById("fInvoice"),quoteId=f?.elements?.quoteId?.value||"",q=acceptedQuotesForProject().find(x=>x.id===quoteId),attachment=document.getElementById("invoiceAttachmentLines");
 if(attachment){attachment.style.display=mode==="Attachement"?"block":"none";if(mode==="Attachement")attachment.innerHTML=invoiceAttachmentHtml(q,(db.modules?.invoices||[]).find(i=>String(i.id)===String(f?.elements?.recordId?.value||"")));}
 const amount=document.getElementById("invoiceTrancheAmount");if(amount){amount.readOnly=mode==="Attachement";if(mode==="Attachement")amount.value="";}
 const pct=document.getElementById("invoiceTranchePercent");if(pct)pct.readOnly=mode==="Attachement";
 recalcInvoiceForm(mode==="Attachement"?"lines":"");
}
function recalcInvoiceForm(changed=""){
 const f=document.getElementById("fInvoice"),project=f?.elements?.project?.value||"",client=document.getElementById("invoiceClient")?.value||"",quoteId=f?.elements?.quoteId?.value||"";
 const existing=(db.modules?.invoices||[]).find(i=>String(i.id)===String(f?.elements?.recordId?.value||""));
 const already=invoicePaidForProject(project,existing?.id||"",client,quoteId);
 const alreadyEl=document.getElementById("invoiceAlreadyPaid");if(alreadyEl)alreadyEl.value=already;
 const amount=+document.getElementById("invoiceQuoteAmount")?.value||0,ta=document.getElementById("invoiceTrancheAmount"),pctEl=document.getElementById("invoiceTranchePercent"),mode=f?.elements?.invoiceType?.value||"Tranche";
 if(mode==="Attachement"&&ta){
  const q=acceptedQuotesForProject(project).find(x=>x.id===quoteId);
  const inputs=[...document.querySelectorAll("[data-invoice-billed-line]")];
  const lines=q?invoiceQuoteLines(q).map((line,index)=>({...line,billedQty:+inputs.find(el=>+el.dataset.invoiceBilledLine===index)?.value||0})):[];
  ta.value=lines.length?invoiceAttachmentValue(q,lines).toFixed(2):"";
 }else if(changed==="percent"&&ta)ta.value=amount>0&&+pctEl?.value>0?(Math.round(amount*(+pctEl.value)/100*100)/100).toFixed(2):"";
 const tranche=+ta?.value||0;
 if(changed!=="percent"&&pctEl)pctEl.value=amount>0&&tranche>0?String(+(tranche/amount*100).toFixed(6)):"";
 const rem=document.getElementById("invoiceRemaining");if(rem)rem.value=Math.max(0,amount-already-tranche).toFixed(2);
 const position=clientPaymentRows(project).find(x=>clientPaymentKey(x.client)===clientPaymentKey(client));
 const received=document.getElementById("invoiceClientReceived");if(received)received.value=(position?.received||0).toFixed(2);
 const due=document.getElementById("invoiceClientDue");if(due)due.value=position?.contract?position.remaining.toFixed(2):"Contrat à renseigner";
}
function deleteInvoice(id){
 if(user.role!=="ADMIN")return;
 const r=(db.modules.invoices||[]).find(x=>String(x.id)===String(id));if(!r)return;
 if(!confirm("Supprimer cette facture / tranche ?"))return;
 const before=cloneRecord(r),actor=effectiveUserIdentity();r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=actor.label||actor.username||user.username;r.updatedAt=r.deletedAt;
 audit("Suppression facture","invoices",r.id,"Facture/tranche supprimée",before,cloneRecord(r));saveLocalOnly();cloudWriteGeneric("invoices",r,"Facture supprimée");invoicesPage();
}



function normalizeClientName(v){return String(v||"").trim().replace(/\s+/g," ").toLowerCase();}
function clientNameFromRecord(r){return String(r?.values?.[0]||r?.name||r?.client||"").trim();}
function clientPhoneFromRecord(r){return String(r?.values?.[1]||r?.phone||r?.telephone||"").trim();}
function clientAddressFromRecord(r){return String(r?.values?.[2]||r?.address||r?.adresse||"").trim();}
function ensureClientFromName(name,phone="",address="",source="Récupération"){
 name=String(name||"").trim();if(!name)return null;
 db.modules.clients=Array.isArray(db.modules.clients)?db.modules.clients:[];
 const key=normalizeClientName(name);
 let c=db.modules.clients.find(x=>!x.deleted&&normalizeClientName(clientNameFromRecord(x))===key);
 if(c){
  c.values=Array.isArray(c.values)?c.values:["","",""];
  if(!c.values[1]&&phone)c.values[1]=phone;
  if(!c.values[2]&&address)c.values[2]=address;
  return c;
 }
 const now=new Date().toISOString();
 c={id:"CLI-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),project:"",values:[name,phone,address],workflow:"Validé",owner:user?.username||"ADMIN",createdAt:now,updatedAt:now,recovered:true,recoveredSource:source};
 db.modules.clients.push(c);
 return c;
}
async function restoreClientsFromHistory(){
 db.modules.clients=Array.isArray(db.modules.clients)?db.modules.clients:[];
 let before=db.modules.clients.filter(x=>!x.deleted).length,cloudRows=[],auditRows=[];
 try{
  if(cloudReady&&fbStore){
   const [cs,as]=await Promise.all([
    fbStore.collection("clients").get(),
    fbStore.collection("auditLog").get()
   ]);
   cloudRows=cs.docs.map(d=>({id:d.id,...d.data()}));
   auditRows=as.docs.map(d=>d.data()).filter(a=>String(a.module||"").includes("clients"));
  }
 }catch(e){console.warn("Restauration clients Cloud",e);}

 // Current Cloud client records
 cloudRows.forEach(r=>ensureClientFromName(clientNameFromRecord(r),clientPhoneFromRecord(r),clientAddressFromRecord(r),"Cloud clients"));
 // Audit snapshots
 auditRows.forEach(a=>[a.after,a.before].forEach(r=>{
  if(r)ensureClientFromName(clientNameFromRecord(r),clientPhoneFromRecord(r),clientAddressFromRecord(r),"Audit clients");
 }));
 // Business modules containing client names
 (db.quotes||[]).filter(x=>!x.deleted).forEach(q=>ensureClientFromName(q.client,q.clientPhone||"",q.clientAddress||"","Devis"));
 invoiceRows().forEach(i=>ensureClientFromName(i.client||i.values?.[1],"","","Facturation"));
 (db.clientReceipts||[]).filter(x=>!x.deleted).forEach(r=>ensureClientFromName(r.client||r.clientName||"","","","Encaissements"));
 (db.projects||[]).filter(x=>!x.deleted).forEach(p=>ensureClientFromName(p.client||"","","","Chantiers"));

 const after=db.modules.clients.filter(x=>!x.deleted).length;
 if(after>before){
  saveLocalOnly();
  for(const c of db.modules.clients.filter(x=>!x.deleted&&x.recovered&&!x.cloudSyncedAt)){
   try{await cloudWriteGeneric("clients",c,"Client récupéré");}catch(e){}
  }
 }
 return after-before;
}
async function clientsRecoveredPage(){
 $("#content").innerHTML='<div class="panel"><h3>CLIENTS</h3><div class="panel-body">Récupération des anciennes données clients…</div></div>';
 const n=await restoreClientsFromHistory();
 generic("clients");
 if(n>0){
  const p=document.querySelector("#content .panel-body");
  if(p)p.insertAdjacentHTML("beforeend",`<div class="notice"><b>${n}</b> client(s) ancien(s) récupéré(s) automatiquement.</div>`);
 }
}

const GENERIC_FIELDS={clients:["Nom / raison sociale","Téléphone","Adresse"],suppliers:["Fournisseur","Téléphone","Spécialité"],stock:["Article","Quantité","Unité"],employees:["Matricule","Nom complet","Fonction"],payroll:["Employé","Mois","Net à payer"],bank:["Référence","Libellé","Montant"],accounting:["Journal","Libellé","Montant"],treasury:["Libellé","Échéance","Montant"],planning:["Activité","Début","Fin"],situations:["Situation","Période","Avancement"],technicalFollowup:["Chantier","Travaux du jour","Observation"],quality:["Contrôle","Résultat","Observation"],nonConformities:["Référence","Description","Action corrective"],equipment:["Matériel / engin","État","Affectation"],vehicles:["Véhicule","Immatriculation","État"],fuel:["Véhicule / engin","Quantité (L)","Montant"],invoices:["N° facture","Client","Montant"]};
function generic(page){
 if(page==="clients"&&!sessionStorage.getItem("nysoa_clients_recovery_done")){
  sessionStorage.setItem("nysoa_clients_recovery_done","1");
  restoreClientsFromHistory().then(()=>generic("clients"));
  return;
 }
 let label=(page==="treasury"?"TRÉSORERIE CAISSE":(menus[user.role].find(x=>x[0]===page)||ADMIN_FINANCE_MENU.concat(ADMIN_TECH_MENU).find(x=>x[0]===page)||[])[2])||page,
 fields=GENERIC_FIELDS[page]||["Référence","Désignation","Observation"],
 rows=(db.modules[page]||[]).filter(r=>!r.deleted&&matchesProjectContext(r));
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>${label}</h3><div class="panel-body">
 <button class="btn primary" onclick="genericForm('${page}')">+ Nouvelle entrée</button><button class="btn secondary" onclick="exportBackup()">Sauvegarder les données</button></div>
 <div class="table-wrap"><table><thead><tr>${page==="clients"?"":`<th>Chantier</th>`}${fields.map(x=>`<th>${x}</th>`).join("")}<th>Statut</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr>${page==="clients"?"":`<td>${esc(projectLabel(r.project))}</td>`}${fields.map((_,j)=>`<td>${esc(r.values[j]||"")}</td>`).join("")}<td>${workflowBadge(r.workflow)}</td><td><div class="edit-actions">${canOpenOwnEdit(r)?`<button class="btn-xs btn-edit" onclick="genericFormById('${page}','${r.id}')">${canUserChange(r)?"Modifier":"Demander correction"}</button>${canUserChange(r)?`<button class="btn-xs btn-delete" onclick="softDeleteGeneric('${page}','${r.id}')">Supprimer</button>`:""}`:"<span>Verrouillé</span>"}<button class="btn-xs" onclick="showGenericHistory('${page}','${r.id}')">Historique</button></div></td></tr>`).join(""):`<tr><td colspan="${fields.length+3}">Aucune donnée pour ce chantier.</td></tr>`}
 </tbody></table></div></div>`;
}
function genericForm(page,index=-1){
 let fields=GENERIC_FIELDS[page]||["Référence","Désignation","Observation"],r=index>=0?(db.modules[page]||[])[index]:null;
 if(r&&!canOpenOwnEdit(r))return alert("Cette entrée ne vous appartient pas.");
 const selectedProject=r?.project||currentProjectContext()||"";
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVELLE"} ENTRÉE</h3><form id="fGeneric" class="form-grid">
 ${page==="clients"?"":`<label>Chantier<select name="project" required><option value="">Choisir un chantier</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(selectedProject)===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label>`}
 ${fields.map((f,i)=>`<label>${f}<input name="v${i}" value="${esc(r?.values?.[i]||"")}" required></label>`).join("")}
 <label>Statut<select name="workflow">${["Brouillon","Soumis","À corriger","Validé"].filter(x=>user.role==="ADMIN"||x!=="Validé").map(x=>`<option ${r?.workflow===x?"selected":""}>${x}</option>`).join("")}</select></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="generic('${page}')">Annuler</button></div></form></div>`;
 $("#fGeneric").onsubmit=e=>{
  e.preventDefault();let f=new FormData(e.target),obj={id:r?.id||"GEN-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),project:page==="clients"?"":f.get("project"),values:fields.map((_,i)=>f.get("v"+i)),workflow:f.get("workflow"),owner:r?.owner||user.username,updatedBy:user.username,updatedAt:new Date().toISOString()};
  db.modules[page]=db.modules[page]||[];const before=r?cloneRecord(r):null;
  if(r&&requestEditIfRequired(page,r,obj,()=>generic(page)))return;
  if(r){pushHistory(r,"Modification",before);Object.assign(r,obj);audit("Modification","modules."+page,r.id,"Entrée modifiée",before,r)}
  else{obj.createdAt=new Date().toISOString();obj.history=[];pushHistory(obj,"Création");db.modules[page].push(obj);audit("Création","modules."+page,obj.id,"Entrée créée",null,obj)}
  saveLocalOnly();if(CLOUD_MODULE_COLLECTIONS.has(page))cloudWriteGeneric(page,obj,page==="clients"?"Client enregistré":"Entrée enregistrée");generic(page);
 };
}
function genericDelete(page,index){if(user.role!=="ADMIN")return;if(confirm("Supprimer cette entrée ?")){db.modules[page].splice(index,1);save();generic(page)}}
function exportBackup(){let blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="NYSOA_CONSTRUCT_SAUVEGARDE_"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href)}
async function resetTestTransactions(){
 if(user?.role!=="ADMIN"||!cloudReady||!fbStore||!navigator.onLine){alert("Connectez-vous en tant qu’Admin au Cloud avant de réinitialiser les données d’essai.");return;}
 const button=document.getElementById("resetTestDataBtn"),keep=new Set(["projects","suppliers","employees"]);
 const collections=CLOUD_BUSINESS_COLLECTIONS.filter(name=>!keep.has(name));
 if(button)button.disabled=true;
 try{
  const snapshots=[];
  for(const name of CLOUD_BUSINESS_COLLECTIONS){
   const snap=await fbStore.collection(name).get();
   snapshots.push({name,rows:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
  }
  const backup={createdAt:new Date().toISOString(),purpose:"Sauvegarde avant effacement des données d’essai",cloud:snapshots,local:db};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`NYSOA_AVANT_REINITIALISATION_${erpToday()}.json`;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  if(prompt("Vérifiez que la sauvegarde JSON est bien téléchargée. Cette action masquera les données d’essai sur tous les appareils. Les chantiers, fournisseurs, employés et comptes restent conservés. Tapez REINITIALISER pour continuer :")!=="REINITIALISER")return;
  const now=new Date().toISOString(),tasks=[];
  snapshots.filter(s=>!keep.has(s.name)).forEach(s=>s.rows.filter(r=>!r.deleted).forEach(r=>tasks.push({name:s.name,id:r.id})));
  for(let i=0;i<tasks.length;i+=400){
   const batch=fbStore.batch();
   tasks.slice(i,i+400).forEach(({name,id})=>batch.set(fbStore.collection(name).doc(String(id)),{deleted:true,deletedAt:now,updatedAt:now},{merge:true}));
   await batch.commit();
  }
  collections.forEach(name=>{
   const rows=cloudCollectionLocalRows(name);
   rows.forEach(row=>{row.deleted=true;row.deletedAt=now;row.updatedAt=now;});
  });
  saveLocalOnly();
  cloudMarkSynced();go("dashboard");
  alert("Données d’essai effacées. Chantiers, fournisseurs, employés et comptes conservés. Gardez la sauvegarde JSON en lieu sûr.");
 }catch(error){console.error("Réinitialisation",error);alert("Opération interrompue : "+(error?.message||error)+". Gardez la sauvegarde JSON et vérifiez les données synchronisées avant de recommencer.");}
 finally{if(button)button.disabled=false;}
}
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
// Une prévision est attachée au devis, mais elle reste un document interne distinct.
// Les coefficients sont des hypothèses modifiables : jamais des métrés contractuels.
// Nomenclature indicative pour la construction générale. Aucune consommation
// n'est inventée lorsque l'unité, les plans ou les spécifications manquent.
const MATERIAL_WORK_PRESETS=[
 {key:'installation',match:/installation (?:de |du )?chantier|base vie|implantation|repli (?:de |du )?chantier/,materials:['Clôture et signalisation provisoires','Base vie et protections provisoires','Raccordement provisoire eau / électricité'],tools:['Barrières de chantier','Coffret électrique provisoire','Mètre et niveau','EPI']},
 {key:'terrassement',match:/terrassement|decapage|fouille|deblai|remblai|nivellement/,materials:['Matériaux de remblai','Géotextile selon étude','Évacuation des déblais'],tools:['Pelle ou excavatrice','Compacteur','Niveau et matériel de topographie','EPI']},
 {key:'fondation',match:/fondation|semelle|longrine|radier/,materials:['Béton selon étude de structure','Armatures acier selon plans','Coffrage et accessoires'],tools:['Bétonnière ou pompe selon ouvrage','Matériel de coffrage','Vibrateur à béton','EPI']},
 {key:'structure',match:/beton|poteau|poutre|dalle|plancher|coffrage|ferraillage/,materials:['Béton selon étude de structure','Armatures acier selon plans','Coffrage et accessoires'],tools:['Bétonnière ou pompe selon ouvrage','Vibrateur à béton','Matériel de coffrage','EPI']},
 {key:'maconnerie',match:/maconnerie|mur|cloison|parpaing|brique/,materials:['Blocs, briques ou parpaings selon plans','Ciment pour mortier','Sable pour mortier','Armatures de liaison selon plans'],tools:['Truelles','Fil à plomb et niveau','Échafaudage selon hauteur','EPI']},
 {key:'enduit',match:/enduit|crepi|ragr[eé]age/,materials:['Ciment ou enduit prémélangé','Sable fin','Primaire ou adjuvant selon support'],tools:['Taloche','Règle de maçon','Malaxeur','Échafaudage','EPI']},
 {key:'carrelage',match:/carrelage|carreau|fa[iï]ence/,materials:['Carreaux selon format à confirmer','Ciment colle selon support','Mortier de joint','Croisillons'],tools:['Coupe-carreaux','Peigne à colle','Système de nivellement','Malaxeur','Niveau','EPI']},
 {key:'peinture',match:/peinture|peindre/,materials:['Peinture selon système et nombre de couches','Sous-couche ou primaire','Enduit de rebouchage','Bâches et ruban de protection'],tools:['Rouleaux et recharges','Pinceaux','Bac à peinture','Échelle ou échafaudage','Masque et gants']},
 {key:'electricite',match:/[eé]lectricit[eé]|[eé]lectrique|[eé]clairage|prise|tableau [eé]lectrique/,materials:['Câbles selon schéma électrique','Gaines et conduits','Tableau et protections électriques','Prises, interrupteurs ou luminaires'],tools:['Multimètre','Tire-fil','Pince à sertir','Outillage isolé','EPI']},
 {key:'plomberie',match:/plomberie|sanitaire|alimentation eau|evacuation eau/,materials:['Tubes selon plans','Raccords et vannes','Appareils sanitaires selon choix','Étanchéité des raccords'],tools:['Coupe-tube','Pince à sertir ou souder selon réseau','Clés de plomberie','EPI']},
 {key:'toiture',match:/toiture|couverture|charpente|zinguerie/,materials:['Couverture selon plans','Charpente ou liteaux','Fixations et accessoires','Gouttières selon plans'],tools:['Échafaudage','Harnais de sécurité','Outillage de couverture','EPI']},
 {key:'menuiserie',match:/menuiserie|porte|fen[eê]tre|alu|minium|vitrage/,materials:['Menuiserie selon dimensions','Quincaillerie et fixations','Vitrage selon plans','Joints et mastic'],tools:['Perceuse et visseuse','Niveau','Outils de pose','EPI']},
 {key:'etancheite',match:/[eé]tanch[eé]it[eé]|imperm[eé]abilisation/,materials:['Membrane ou produit d’étanchéité selon système','Primaire selon support','Bande et accessoires de relevé'],tools:['Outils de préparation du support','Rouleaux et applicateurs','EPI']},
 {key:'voirie',match:/voirie|pavage|drainage|assainissement|vrd/,materials:['Granulats selon étude','Éléments de revêtement ou pavés','Canalisations et accessoires selon plans'],tools:['Compacteur','Matériel de nivellement','EPI']}
];
function forecastSource(q){return JSON.stringify((q.sections||[]).flatMap((s,si)=>(s.items||[]).map((i,ii)=>[si,ii,String(i.designation||''),String(i.unit||''),Number(i.qty)||0])))}
function forecastLines(q){return (q.sections||[]).flatMap((s,si)=>(s.items||[]).map((i,ii)=>({key:`${si}:${ii}`,name:String(i.designation||'').trim(),unit:String(i.unit||'').trim(),qty:Number(i.qty)||0}))).filter(x=>x.name)}
function forecastKind(line){const d=line.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');return MATERIAL_WORK_PRESETS.find(p=>p.key==='carrelage'&&p.match.test(d))?.key||MATERIAL_WORK_PRESETS.find(p=>p.key==='peinture'&&p.match.test(d))?.key||MATERIAL_WORK_PRESETS.find(p=>p.match.test(d))?.key||'autres'}
function forecastPreset(kind){return MATERIAL_WORK_PRESETS.find(p=>p.key===kind)}
function forecastMaterial(id,line,name,unit,coefficient,loss,packSize,roundStep,notes=''){
 return {id,lineKey:line.key,name,unit,coefficient,loss,packSize,roundStep,notes,manualQuantity:''};
}
function ganttQuoteTasks(q){return (q.sections||[]).flatMap((section,si)=>(section.items||[]).map((item,ii)=>({key:`${si}:${ii}`,name:String(item.designation||'').trim(),lot:String(section.title||'Lot '+(si+1)).trim()}))).filter(item=>item.name);}
function ganttDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;
 const date=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
}
function ganttIso(date){return date.toISOString().slice(0,10)}
function ganttAddDays(date,n){return new Date(date.getTime()+n*86400000)}
function ganttDayNumber(value){const date=ganttDate(value);return date?Math.round(date.getTime()/86400000):NaN}
function generateForecastGantt(q){
 const project=(db.projects||[]).find(p=>String(p.id)===String(q.project)&&!p.deleted),lines=ganttQuoteTasks(q);
 const start=ganttDate(project?.start)||ganttDate(q.date)||ganttDate(erpToday());
 const projectEnd=ganttDate(project?.end),dated=!!ganttDate(project?.start)&&!!projectEnd&&projectEnd>=start;
 const days=dated?Math.round((projectEnd-start)/86400000)+1:Math.max(1,lines.length)*7;
 return {dateBasis:dated?'chantier':'indicatif',tasks:lines.map((line,index)=>{
  const first=Math.floor(index*days/lines.length),last=Math.max(first,Math.floor((index+1)*days/lines.length)-1);
  return {...line,start:ganttIso(ganttAddDays(start,first)),end:ganttIso(ganttAddDays(start,last)),progress:0};
 })};
}
function validForecastGantt(q,gantt){
 const keys=new Set(ganttQuoteTasks(q).map(item=>item.key)),tasks=gantt?.tasks;
 return Array.isArray(tasks)&&tasks.length===keys.size&&tasks.every(t=>keys.delete(t.key)&&String(t.name||'').trim()&&String(t.lot||'').trim()&&ganttDate(t.start)&&ganttDate(t.end)&&t.start<=t.end&&Number.isFinite(Number(t.progress))&&Number(t.progress)>=0&&Number(t.progress)<=100);
}
function ganttTickDates(min,max){
 const span=max-min+1,step=span<=35?1:span<=140?7:span<=760?30:90,ticks=[];
 for(let day=0;day<span;day+=step)ticks.push({offset:day,label:ganttIso(ganttAddDays(new Date(min*86400000),day)).slice(5)});
 return ticks;
}
function renderForecastGantt(q,plan,canEdit){
 const gantt=plan.gantt||generateForecastGantt(q),tasks=gantt.tasks||[];
 if(!tasks.length)return '<p>Aucune désignation dans le devis : renseignez les travaux pour générer le planning.</p>';
 const min=Math.min(...tasks.map(t=>ganttDayNumber(t.start))),max=Math.max(...tasks.map(t=>ganttDayNumber(t.end)));
 if(!Number.isFinite(min)||!Number.isFinite(max)||max<min)return '<p class="material-warning">Dates du planning invalides : corrigez les tâches avant impression.</p>';
 const days=max-min+1,ticks=ganttTickDates(min,max),markers=ticks.map(t=>`<span class="gantt-grid-line" style="left:${(t.offset/days)*100}%"></span>`).join('');
 return `<p>Durées réparties provisoirement entre les dates du chantier${gantt.dateBasis==='indicatif'?' (dates du chantier absentes ou invalides : période indicative de 7 jours par tâche)':''}. Vérifier l’ordre, les dépendances, les équipes et les durées sur le terrain.</p>
 <div class="gantt-overflow"><div class="gantt-board"><div class="gantt-label gantt-head">Travaux / dates</div><div class="gantt-track gantt-head">${ticks.map(t=>`<span class="gantt-tick" style="left:${(t.offset/days)*100}%">${esc(t.label)}</span>`).join('')}</div>
 ${tasks.map((task,index)=>{
  const left=((ganttDayNumber(task.start)-min)/days)*100,width=((ganttDayNumber(task.end)-ganttDayNumber(task.start)+1)/days)*100;
  return `<div class="gantt-label"><b>${esc(task.name)}</b><small>${esc(task.lot)} · ${esc(task.start)} → ${esc(task.end)}</small>${canEdit?`<div class="gantt-edit no-print"><label>Travaux<input value="${esc(task.name)}" onchange="editForecastGantt(${index},'name',this.value)"></label><label>Lot<input value="${esc(task.lot)}" onchange="editForecastGantt(${index},'lot',this.value)"></label><label>Début<input type="date" value="${esc(task.start)}" onchange="editForecastGantt(${index},'start',this.value)"></label><label>Fin<input type="date" value="${esc(task.end)}" onchange="editForecastGantt(${index},'end',this.value)"></label><label>Réalisé %<input type="number" min="0" max="100" value="${esc(task.progress)}" onchange="editForecastGantt(${index},'progress',this.value)"></label></div>`:''}</div><div class="gantt-track">${markers}<div class="gantt-bar" style="left:${left}%;width:${width}%" title="${esc(task.name)} : ${esc(task.start)} → ${esc(task.end)}"><span style="width:${Number(task.progress)||0}%"></span></div><small class="gantt-progress">${Number(task.progress)||0}%</small></div>`;
 }).join('')}</div></div>`;
}
function editForecastGantt(index,key,value){
 if(user?.role!=='ADMIN'||!activeMaterialForecast?.gantt?.tasks?.[index])return;
 const task=activeMaterialForecast.gantt.tasks[index];
 if(key==='name'||key==='lot'){if(!String(value).trim())return alert('Le libellé ne peut pas être vide.');task[key]=String(value).trim();}
 else if(key==='progress'){const n=Number(value);if(!Number.isFinite(n)||n<0||n>100)return alert('Avancement compris entre 0 et 100 %.');task.progress=n;}
 else if(key==='start'||key==='end'){
  if(!ganttDate(value)||key==='start'&&value>task.end||key==='end'&&value<task.start)return alert('Dates invalides : le début doit précéder la fin.');
  task[key]=value;
 }else return;
 renderMaterialPlan();
}
function regenerateForecastGantt(){
 if(user?.role!=='ADMIN'||!activeMaterialForecast)return;
 const q=db.quotes.find(item=>item.id===selectedMaterialQuoteId&&!item.deleted);
 if(!q||activeMaterialForecast.source!==forecastSource(q))return alert('Actualisez d’abord le plan depuis le devis modifié.');
 if(activeMaterialForecast.gantt?.tasks?.length&&!confirm('Remplacer les dates et avancements modifiés par la répartition automatique ?'))return;
 activeMaterialForecast.gantt=generateForecastGantt(q);renderMaterialPlan();
}
function generateMaterialForecast(q){
 const materials=[],tools=[];
 for(const line of forecastLines(q)){
  const kind=forecastKind(line),preset=forecastPreset(kind),unit=line.unit.toLowerCase().replace(/²/g,'2'),area=/m2|metre carre/.test(unit);
  if(kind==='carrelage'&&area){
   // 60 × 60 cm = 0,36 m²/carrelage ; achat par lots de 10 pièces.
   materials.push(forecastMaterial(`${line.key}:tiles`,line,'Carreaux 60 × 60 cm','pièces',1/0.36,10,1,10,'Format et découpes à confirmer sur plans.'));
   // Dosage indicatif 5 kg/m² ; le fabricant donne une plage suivant support et pose.
   materials.push(forecastMaterial(`${line.key}:glue`,line,'Ciment colle (sac 25 kg)','sacs',5,10,25,1,'Dosage de base 5 kg/m² à confirmer selon support, peigne et produit.'));
  }else if(kind==='peinture'&&area){
   materials.push(forecastMaterial(`${line.key}:paint`,line,'Peinture (2 couches)','pots de 10 L',0.2,10,10,1,'0,1 L/m²/couche × 2 ; rendement et préparation à confirmer.'));
  }
  const included=new Set(materials.filter(m=>m.lineKey===line.key).map(m=>m.name.toLowerCase()));
  for(const [index,name] of (preset?.materials||['Matériaux et fournitures à préciser selon plans']).entries()){
   if(included.has(name.toLowerCase())||kind==='carrelage'&&area&&index<2||kind==='peinture'&&area&&index===0)continue;
   materials.push(forecastMaterial(`${line.key}:suggestion:${index}`,line,name,'à définir',0,0,1,1,'Poste indicatif : compléter unité, consommation et métré avant achat.'));
  }
  for(const name of preset?.tools||['Outillage selon nature des travaux','Équipements de protection individuelle'])tools.push({lineKey:line.key,name,qty:0,unit:'à dimensionner'});
 }
 return {source:forecastSource(q),schemaVersion:2,generatedAt:new Date().toISOString(),materials,tools,gantt:generateForecastGantt(q)};
}
function upgradeMaterialForecast(q,plan){
 if((Number(plan.schemaVersion)||0)>=2||plan.source!==forecastSource(q))return plan;
 const fresh=generateMaterialForecast(q),represented=new Set((plan.materials||[]).map(m=>m.lineKey));
 plan.materials=Array.isArray(plan.materials)?plan.materials:[];
 plan.tools=Array.isArray(plan.tools)?plan.tools:[];
 const first=forecastLines(q)[0]?.key;
 for(const tool of plan.tools)if(!tool.lineKey&&first)tool.lineKey=first;
 const equipped=new Set(plan.tools.map(t=>t.lineKey));
 plan.materials.push(...fresh.materials.filter(m=>!represented.has(m.lineKey)));
 plan.tools.push(...fresh.tools.filter(t=>!equipped.has(t.lineKey)));
 plan.schemaVersion=2;
 return plan;
}
function forecastRequired(line,material){
 const coeff=Number(material.coefficient),loss=Number(material.loss),pack=Number(material.packSize),step=Number(material.roundStep);
 if(material.manualQuantity!==''&&material.manualQuantity!==null&&material.manualQuantity!==undefined){const manual=Number(material.manualQuantity);return Number.isFinite(manual)&&manual>=0?manual:null;}
 if(!line||![line.qty,coeff,loss,pack,step].every(Number.isFinite)||line.qty<=0||coeff<=0||loss<0||pack<=0||step<=0)return null;
 return Math.ceil((line.qty*coeff*(1+loss/100)/pack/step)-1e-10)*step;
}
function validForecastMaterial(line,m){
 return !!line&&String(m.name||'').trim()&&String(m.unit||'').trim()&&['coefficient','loss','packSize','roundStep'].every(k=>Number.isFinite(Number(m[k]))&&Number(m[k])>=0)&&Number(m.packSize)>0&&Number.isInteger(Number(m.roundStep))&&Number(m.roundStep)>0&&(m.manualQuantity===''||m.manualQuantity===null||m.manualQuantity===undefined||Number.isFinite(Number(m.manualQuantity))&&Number(m.manualQuantity)>=0);
}
let selectedMaterialQuoteId='',activeMaterialForecast=null;
function materialPlanPage(id=''){
 if(!user)return;
 const permitted=(db.quotes||[]).filter(q=>!q.deleted&&userCanAccessProject(q.project)&&(db.projects||[]).some(p=>!p.deleted&&String(p.id)===String(q.project)));
 const chosen=permitted.find(q=>String(q.id)===String(id||selectedMaterialQuoteId))||permitted[0];
 selectedMaterialQuoteId=chosen?.id||'';
 activeMaterialForecast=chosen?(chosen.materialForecast?upgradeMaterialForecast(chosen,structuredClone(chosen.materialForecast)):generateMaterialForecast(chosen)):null;
 if(activeMaterialForecast&&!activeMaterialForecast.gantt)activeMaterialForecast.gantt=generateForecastGantt(chosen);
 renderMaterialPlan();
}
function chooseMaterialQuote(id){selectedMaterialQuoteId=id;materialPlanPage(id)}
function forecastInput(type,index,key,value,canEdit,display=value,attrs=''){
 return `${canEdit?`<input class="no-print" ${attrs} value="${esc(value??'')}" onchange="editForecast${type}(${index},'${key}',this.value)">`:''}<span class="material-print-value">${esc(display??'')}</span>`;
}
function forecastLineChoice(type,index,key,selected,lines,canEdit){
 const label=lines.find(line=>line.key===selected)?.name||'Non affecté';
 return `${canEdit?`<select class="no-print" onchange="editForecast${type}(${index},'${key}',this.value)"><option value="">Non affecté</option>${lines.map(line=>`<option value="${esc(line.key)}" ${line.key===selected?'selected':''}>${esc(line.name)}</option>`).join('')}</select>`:''}<span class="material-print-value">${esc(label)}</span>`;
}
function renderMaterialPlan(){
 const canEdit=user?.role==='ADMIN',q=(db.quotes||[]).find(x=>x.id===selectedMaterialQuoteId&&!x.deleted),p=activeMaterialForecast;
 const permitted=(db.quotes||[]).filter(x=>!x.deleted&&userCanAccessProject(x.project)&&(db.projects||[]).some(project=>!project.deleted&&String(project.id)===String(x.project)));
 if(!q||!permitted.includes(q)){document.querySelector('#content').innerHTML='<div class="panel"><div class="panel-body">Aucun devis lié à un chantier accessible. Enregistrez d’abord un devis avec ses quantités.</div></div>';return;}
 const lines=forecastLines(q),lineByKey=new Map(lines.map(x=>[x.key,x]));
 const stale=p.source!==forecastSource(q);
 const rows=(p.materials||[]).map((m,ix)=>{
  const line=lineByKey.get(m.lineKey),required=forecastRequired(line,m);
  return `<tr><td>${forecastLineChoice('Material',ix,'lineKey',m.lineKey,lines,canEdit)}<small>${line?`${line.qty} ${esc(line.unit)} dans le devis`:'Actualiser le plan'}</small></td><td>${forecastInput('Material',ix,'name',m.name,canEdit)}</td><td>${forecastInput('Material',ix,'unit',m.unit,canEdit)}</td><td>${forecastInput('Material',ix,'coefficient',m.coefficient,canEdit,`${m.coefficient} / ${line?.unit||'unité'}`,'type="number" min="0" step="any"')}</td><td>${forecastInput('Material',ix,'loss',m.loss,canEdit,`${m.loss} %`,'type="number" min="0" step="any"')}</td><td>${forecastInput('Material',ix,'packSize',m.packSize,canEdit,m.packSize,'type="number" min="0.001" step="any"')}</td><td>${forecastInput('Material',ix,'roundStep',m.roundStep,canEdit,m.roundStep,'type="number" min="1" step="1"')}</td><td>${forecastInput('Material',ix,'manualQuantity',m.manualQuantity??'',canEdit,m.manualQuantity===''?'—':m.manualQuantity,'type="number" min="0" step="any" placeholder="Automatique"')}</td><td><strong>${required===null?'À chiffrer':required.toLocaleString('fr-FR')} ${required===null?'':esc(m.unit)}</strong></td><td>${forecastInput('Material',ix,'notes',m.notes||'',canEdit)}</td><td class="no-print">${canEdit?`<button class="btn-xs btn-delete" onclick="removeForecastMaterial(${ix})">×</button>`:''}</td></tr>`;
 }).join('');
 const tools=(p.tools||[]).map((t,ix)=>`<tr><td>${forecastLineChoice('Tool',ix,'lineKey',t.lineKey,lines,canEdit)}</td><td>${forecastInput('Tool',ix,'name',t.name,canEdit)}</td><td>${forecastInput('Tool',ix,'qty',t.qty,canEdit,Number(t.qty)>0?t.qty:'À dimensionner','type="number" min="0" step="any"')}</td><td>${forecastInput('Tool',ix,'unit',t.unit,canEdit)}</td><td class="no-print">${canEdit?`<button class="btn-xs btn-delete" onclick="removeForecastTool(${ix})">×</button>`:''}</td></tr>`).join('');
 document.querySelector('#content').innerHTML=`<div class="materials-sheet"><div class="material-actions no-print"><label>Devis source <select onchange="chooseMaterialQuote(this.value)">${permitted.map(item=>`<option value="${esc(item.id)}" ${item.id===q.id?'selected':''}>${esc(item.id)} — ${esc(projectLabel(item.project))} — ${esc(item.object||'')}</option>`).join('')}</select></label>${canEdit?`<button class="btn primary" onclick="saveMaterialForecast()">Enregistrer le plan</button><button class="btn secondary" onclick="refreshMaterialForecast()">Actualiser depuis devis</button>`:''}<button class="btn secondary" onclick="window.print()">Imprimer / PDF</button></div>
 <h2>PRÉVISION DE MATÉRIAUX ET D’OUTILLAGE</h2><p><strong>Usage interne — équipe de suivi</strong> · Chantier : ${esc(projectLabel(q.project))} · Devis : ${esc(q.id)} · Objet : ${esc(q.object||'')}<br>Préparé le ${esc((p.generatedAt||'').slice(0,10))}. Quantités indicatives à vérifier sur site et sur plans avant commande.</p>
 ${stale?'<p class="material-warning">Le devis a changé : actualisez cette prévision avant de commander.</p>':''}
 <h3>DEVIS INTERNE — MATÉRIAUX PAR DÉSIGNATION</h3><p>Toutes les désignations du devis client sont reprises. « À chiffrer » signifie que les plans, le métré ou le dosage restent à préciser. La colonne « Quantité corrigée » remplace la formule lorsque l’Admin y inscrit une quantité.</p><div class="table-wrap"><table class="material-table"><thead><tr><th>Désignation du devis</th><th>Matériau / fourniture</th><th>Unité d’achat</th><th>Conso / unité de travaux</th><th>Perte %</th><th>Conditionnement</th><th>Lot d’achat</th><th>Quantité corrigée</th><th>Besoin prévisionnel</th><th>Hypothèse</th><th class="no-print"></th></tr></thead><tbody>${rows||'<tr><td colspan="11">Renseignez les désignations du devis client avant de générer le plan.</td></tr>'}</tbody></table></div>
 ${canEdit?`<div class="material-actions no-print"><select id="forecastLine">${lines.map(line=>`<option value="${esc(line.key)}">${esc(line.name)} (${line.qty} ${esc(line.unit)})</option>`).join('')}</select><button class="btn secondary" onclick="addForecastMaterial()">+ Matériau manuel</button></div>`:''}
 ${lines.filter(line=>forecastKind(line)==='autres').length?`<p class="material-warning">Désignations sans nomenclature standard : ${lines.filter(line=>forecastKind(line)==='autres').map(x=>esc(x.name)).join(', ')}. Complétez leurs matériaux et matériels selon les plans.</p>`:''}
 <h3>DEVIS INTERNE — MATÉRIELS ET OUTILLAGE PAR DÉSIGNATION</h3><div class="table-wrap"><table class="material-table material-tools"><thead><tr><th>Désignation du devis</th><th>Matériel / outil</th><th>Quantité</th><th>Unité / observation</th><th class="no-print"></th></tr></thead><tbody>${tools||'<tr><td colspan="5">Aucun matériel saisi.</td></tr>'}</tbody></table></div>${canEdit?`<div class="material-actions no-print"><select id="forecastToolLine">${lines.map(line=>`<option value="${esc(line.key)}">${esc(line.name)}</option>`).join('')}</select><button class="btn secondary" onclick="addForecastTool()">+ Ajouter un matériel</button></div>`:''}
 <h3>PLANNING GANTT — DÉSIGNATIONS DU DEVIS</h3>${canEdit?'<button class="btn secondary no-print" onclick="regenerateForecastGantt()">Générer / réinitialiser le Gantt</button>':''}${renderForecastGantt(q,p,canEdit)}
 <p class="material-footnote">Besoin brut = quantité du devis × consommation × (1 + pertes / 100). Quantité à prévoir = besoin brut / conditionnement, arrondi au lot d’achat supérieur. Valider format, dosage, rendement, pertes, dates et accès au chantier avant achat ou exécution.</p></div>`;
}
function editForecastMaterial(ix,key,value){
 if(user?.role!=='ADMIN'||!activeMaterialForecast?.materials?.[ix])return;
 const m=activeMaterialForecast.materials[ix];
 if(['coefficient','loss','packSize','roundStep'].includes(key)){const n=Number(value);if(!Number.isFinite(n)||n<0||(key==='packSize'&&n===0)||(key==='roundStep'&&(!Number.isInteger(n)||n<1)))return alert('Saisissez une valeur valide.');m[key]=n;}
 else if(key==='manualQuantity'){if(value==='')m.manualQuantity='';else{const n=Number(value);if(!Number.isFinite(n)||n<0)return alert('Quantité corrigée invalide.');m.manualQuantity=n;}}
 else if(['name','notes','unit'].includes(key))m[key]=value;
 else if(key==='lineKey'){if(!forecastLines(db.quotes.find(q=>q.id===selectedMaterialQuoteId)||{}).some(line=>line.key===value))return alert('Choisissez une désignation du devis.');m.lineKey=value;}
 else return;
 renderMaterialPlan();
}
function editForecastTool(ix,key,value){if(user?.role!=='ADMIN'||!activeMaterialForecast?.tools?.[ix])return;if(key==='qty'){const n=Number(value);if(!Number.isFinite(n)||n<0)return alert('Quantité invalide.');activeMaterialForecast.tools[ix].qty=n;}else if(['name','unit'].includes(key))activeMaterialForecast.tools[ix][key]=value;else if(key==='lineKey'){if(!forecastLines(db.quotes.find(q=>q.id===selectedMaterialQuoteId)||{}).some(line=>line.key===value))return alert('Choisissez une désignation du devis.');activeMaterialForecast.tools[ix].lineKey=value;}else return;renderMaterialPlan()}
function addForecastMaterial(){if(user?.role!=='ADMIN')return;const key=document.querySelector('#forecastLine')?.value,line=forecastLines((db.quotes||[]).find(q=>q.id===selectedMaterialQuoteId)||{}).find(x=>x.key===key);if(!line)return;activeMaterialForecast.materials.push(forecastMaterial('manual-'+Date.now()+'-'+Math.random().toString(36).slice(2),line,'Matériau à définir','unités',0,0,1,1,'À renseigner selon le métré.'));renderMaterialPlan()}
function removeForecastMaterial(ix){if(user?.role!=='ADMIN')return;activeMaterialForecast.materials.splice(ix,1);renderMaterialPlan()}
function addForecastTool(){if(user?.role!=='ADMIN')return;const lineKey=document.querySelector('#forecastToolLine')?.value;if(!lineKey)return;activeMaterialForecast.tools.push({lineKey,name:'Matériel à définir',qty:0,unit:'à dimensionner'});renderMaterialPlan()}
function removeForecastTool(ix){if(user?.role!=='ADMIN')return;activeMaterialForecast.tools.splice(ix,1);renderMaterialPlan()}
function refreshMaterialForecast(){if(user?.role!=='ADMIN')return;const q=db.quotes.find(x=>x.id===selectedMaterialQuoteId);if(!q)return;if(activeMaterialForecast?.materials?.length&&!confirm('Recalculer le plan ? Les ajustements enregistrés ou non seront remplacés.'))return;activeMaterialForecast=generateMaterialForecast(q);renderMaterialPlan()}
function saveMaterialForecast(){
 if(user?.role!=='ADMIN')return;
 const q=db.quotes.find(x=>x.id===selectedMaterialQuoteId&&!x.deleted),p=activeMaterialForecast;if(!q||!p)return;
 if(p.source!==forecastSource(q))return alert('Le devis a changé : actualisez le plan avant de l’enregistrer.');
 if(!validForecastGantt(q,p.gantt))return alert('Le Gantt doit contenir chaque désignation du devis avec des dates et avancements valides.');
 const lines=new Map(forecastLines(q).map(x=>[x.key,x]));
 if([...lines.keys()].some(key=>!p.materials.some(m=>m.lineKey===key)||!p.tools.some(t=>t.lineKey===key)))return alert('Chaque désignation du devis doit avoir au moins un matériau et un matériel associé.');
 if(p.materials.some(m=>!validForecastMaterial(lines.get(m.lineKey),m))||p.tools.some(t=>!lines.has(t.lineKey)||!String(t.name||'').trim()||!Number.isFinite(Number(t.qty))||Number(t.qty)<0))return alert('Corrigez les matériaux, coefficients, conditionnements et matériels avant enregistrement. Les quantités à chiffrer peuvent rester vides.');
 q.materialForecast=structuredClone(p);q.updatedAt=new Date().toISOString();saveLocalOnly();cloudWriteGeneric('quotes',q,'Prévision matériaux enregistrée');alert('Prévision interne enregistrée.');renderMaterialPlan();
}
function quoteStatusClass(s){return s==="Accepté"?"qs-approved":s==="Refusé"?"qs-refused":s==="Envoyé"?"qs-sent":"qs-draft"}
function quotes(){
 if(user.role!=="ADMIN"){document.querySelector("#content").innerHTML='<div class="panel"><div class="panel-body"><div class="admin-only-note">Le module Devis est réservé exclusivement à l’ADMIN.</div></div></div>';return}
 document.querySelector("#content").innerHTML=`<div class="quote-toolbar"><div class="left"><button class="btn primary" onclick="quoteEditor()">+ Nouveau devis</button></div><div class="right"><input id="quoteSearch" placeholder="Rechercher client, objet ou numéro" style="width:280px;margin:0" oninput="filterQuotes()"></div></div><div class="admin-only-note"><b>Accès ADMIN uniquement.</b> Les prix unitaires, remises, TVA, montants et marges commerciales ne sont visibles par aucun autre rôle.</div><div class="quote-list-card"><div class="table-wrap"><table id="quoteList"><thead><tr><th>N° devis</th><th>Date</th><th>Chantier</th><th>Client</th><th>Objet</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${db.quotes.filter(q=>!q.deleted).map(q=>{let f=quoteFinancials(q);return `<tr data-search="${(q.id+' '+q.client+' '+q.object).toLowerCase()}"><td><b>${q.id}</b></td><td>${q.date}</td><td>${esc(projectLabel(q.project))}</td><td>${q.client}</td><td>${q.object}</td><td><b>${money(f.ttc)}</b></td><td><span class="quote-status ${quoteStatusClass(q.status)}">${q.status}</span></td><td><div class="edit-actions"><button class="btn-xs btn-edit" onclick="quoteEditor('${q.id}')">Ouvrir</button><button class="btn-xs btn-save" onclick="materialPlanPage('${q.id}')">Plan matériaux</button><button class="btn-xs btn-save" onclick="duplicateQuote('${q.id}')">Dupliquer</button><button class="btn-xs btn-delete" onclick="deleteQuote('${q.id}')">Supprimer</button></div></td></tr>`}).join("")}</tbody></table></div></div>`;
}
function filterQuotes(){let v=(document.querySelector('#quoteSearch')?.value||'').toLowerCase();document.querySelectorAll('#quoteList tbody tr').forEach(r=>r.style.display=r.dataset.search.includes(v)?'':'none')}
function newQuote(){return{id:"DEV-"+new Date().getFullYear()+"-"+String(db.quotes.length+1).padStart(3,"0"),date:new Date().toISOString().slice(0,10),validUntil:"",project:currentProjectContext()||"",client:"",clientAddress:"",clientPhone:"",object:"",status:"Brouillon",vatEnabled:false,vatRate:20,discount:0,sections:[{title:"NOUVEAU LOT",items:[{no:"1.1",designation:"",unit:"",qty:1,pu:0}]}],notes:"Arrêté le présent devis à la somme indiquée ci-dessous.",createdBy:"ADMIN"}}
let activeQuote=null,activeQuoteOriginalId="";
function quoteEditor(id=""){
 if(user.role!=="ADMIN"){quotes();return}
 const existing=id?db.quotes.find(x=>x.id===id&&!x.deleted):null;if(id&&!existing)return alert("Devis introuvable.");activeQuote=existing?structuredClone(existing):newQuote();activeQuoteOriginalId=existing?.id||"";renderQuoteEditor();
}
function renderQuoteEditor(){let q=activeQuote,f=quoteFinancials(q);document.querySelector('#content').innerHTML=`<div class="quote-toolbar no-print"><div class="left"><button class="btn secondary" onclick="quotes()">← Liste des devis</button><button class="btn primary" onclick="saveQuote()">Enregistrer</button><button class="btn secondary" onclick="printA4AutoFit()">Imprimer / PDF</button>${activeQuoteOriginalId?`<button class="btn secondary" onclick="materialPlanPage('${q.id}')">Plan matériaux interne</button>`:""}</div><div class="right"><select onchange="activeQuote.status=this.value;renderQuoteEditor()" style="margin:0;width:150px"><option ${q.status==='Brouillon'?'selected':''}>Brouillon</option><option ${q.status==='Envoyé'?'selected':''}>Envoyé</option><option ${q.status==='Accepté'?'selected':''}>Accepté</option><option ${q.status==='Refusé'?'selected':''}>Refusé</option></select></div></div>
 <div class="quote-editor">
  <div class="quote-head"><div class="quote-company"><img src="assets/logo_nysoa_construct.png"><div class="quote-company-info"><strong>ENTREPRISE NYSOA CONSTRUCT</strong><br>Construction - Bâtiment - Génie Civil - Travaux Publics<br>Lot 0708 K Ambohimena, Antsirabe<br>Téléphone / WhatsApp : +261 34 99 498 49<br>E-mail : hhajatiana15@gmail.com<br>Facebook : Entreprise NySoa Antsirabe</div></div><div class="quote-title-box"><h1>DEVIS</h1><div class="quote-no"><input value="${q.id}" ${activeQuoteOriginalId?"readonly":"onchange=\"activeQuote.id=this.value\""} style="text-align:right;font-weight:800"></div><div style="margin-top:8px">Date : <input type="date" value="${q.date}" onchange="activeQuote.date=this.value" style="width:150px;display:inline-block"></div></div></div>
  <div class="quote-meta"><label>Client<input value="${esc(q.client)}" onchange="activeQuote.client=this.value"></label><label>Adresse<input value="${esc(q.clientAddress)}" onchange="activeQuote.clientAddress=this.value"></label><label>Téléphone<input value="${esc(q.clientPhone)}" onchange="activeQuote.clientPhone=this.value"></label><label>Validité<input type="date" value="${q.validUntil||''}" onchange="activeQuote.validUntil=this.value"></label></div>
  <div class="quote-object"><label>Chantier<select onchange="activeQuote.project=this.value"><option value="">Choisir un chantier</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(q.project||"")===String(p.id)?"selected":""}>${esc(projectChantierName(p))}</option>`).join("")}</select></label></div>
  <div class="quote-object"><label>Objet du devis<input value="${esc(q.object)}" onchange="activeQuote.object=this.value"></label></div>
  <p class="admin-only-note no-print">Saisissez toutes les désignations du chantier (installation, gros œuvre, électricité, finition, etc.). Après enregistrement, chacune sera reprise dans le devis interne matériaux/matériels et dans le planning Gantt. Les prix du devis client restent confidentiels.</p>
  <div class="table-wrap"><table class="quote-table"><thead><tr><th style="width:60px">N°</th><th>DÉSIGNATION</th><th style="width:90px">UNITÉ</th><th style="width:100px">QUANTITÉ</th><th style="width:145px">PU</th><th style="width:155px">PRIX TOTAL</th><th class="no-print" style="width:55px"></th></tr></thead><tbody>${q.sections.map((s,si)=>quoteSectionHtml(s,si)).join('')}</tbody></table></div>
  <div class="quote-add-row no-print"><button class="btn secondary" onclick="addQuoteSection()">+ Ajouter un lot</button><button class="btn secondary" onclick="addQuoteItem(${Math.max(0,q.sections.length-1)})">+ Ajouter une ligne</button></div>
  <div class="quote-options no-print"><label><input type="checkbox" ${q.vatEnabled?'checked':''} onchange="activeQuote.vatEnabled=this.checked;renderQuoteEditor()"> Appliquer TVA</label><label>Taux TVA (%) <input type="number" value="${q.vatRate}" onchange="activeQuote.vatRate=+this.value;renderQuoteEditor()"></label><label>Réduction négociée avec le client (Ar) <input type="number" min="0" step="1" value="${q.discount}" onchange="activeQuote.discount=Math.max(0,+this.value||0);renderQuoteEditor()"></label></div>
  <div class="quote-summary-block"><table class="quote-summary"><tr><td>DEVIS INITIAL (HT)</td><td>${money(f.ht)}</td></tr><tr><td>RÉDUCTION NÉGOCIÉE</td><td>${f.discount?'- ':''}${money(f.discount)}</td></tr>${q.vatEnabled?`<tr><td>TVA (${q.vatRate}%)</td><td>${money(f.vat)}</td></tr>`:''}<tr class="grand"><td>DEVIS FINAL ACCEPTÉ (TTC)</td><td>${money(f.ttc)}</td></tr></table><div class="quote-words">Arrêté le présent devis à la somme de : <strong>${money(f.ttc)}</strong> (<strong>${numberToFrenchWords(f.ttc)} ARIARY</strong>).</div></div>
  <div class="quote-signatures"><div>Le client<div class="signature-line">Nom, signature et mention « Bon pour accord »</div></div><div>Le gérant<div class="signature-line">HAJATIANA Hasiniaina Rivoherilaza</div></div></div>
 </div>`}
function quoteSectionHtml(s,si){let st=s.items.reduce((a,i)=>a+(+i.qty||0)*(+i.pu||0),0);return `<tr class="quote-section-row"><td>${roman(si+1)}</td><td colspan="5"><input value="${esc(s.title)}" onchange="activeQuote.sections[${si}].title=this.value" style="font-weight:900"></td><td class="no-print"><button class="quote-remove" onclick="removeQuoteSection(${si})">×</button></td></tr>${s.items.map((i,ii)=>`<tr><td><input class="center" value="${esc(i.no)}" onchange="activeQuote.sections[${si}].items[${ii}].no=this.value"></td><td><textarea onchange="activeQuote.sections[${si}].items[${ii}].designation=this.value">${esc(i.designation)}</textarea></td><td><input class="center" value="${esc(i.unit)}" onchange="activeQuote.sections[${si}].items[${ii}].unit=this.value"></td><td><input class="num" type="number" step="0.01" value="${i.qty}" onchange="activeQuote.sections[${si}].items[${ii}].qty=+this.value;renderQuoteEditor()"></td><td><input class="num" type="number" step="1" value="${i.pu}" onchange="activeQuote.sections[${si}].items[${ii}].pu=+this.value;renderQuoteEditor()"></td><td class="num"><b>${money((+i.qty||0)*(+i.pu||0))}</b></td><td class="no-print"><button class="quote-remove" onclick="removeQuoteItem(${si},${ii})">×</button></td></tr>`).join('')}<tr class="quote-subtotal-row"><td colspan="5" style="text-align:right">Sous-total ${esc(s.title)}</td><td class="num">${money(st)}</td><td class="no-print"><button class="btn-xs btn-edit" onclick="addQuoteItem(${si})">+</button></td></tr>`}
function addQuoteSection(){activeQuote.sections.push({title:"NOUVEAU LOT",items:[{no:(activeQuote.sections.length+1)+".1",designation:"",unit:"",qty:1,pu:0}]});renderQuoteEditor()}
function removeQuoteSection(si){if(activeQuote.sections.length===1)return alert('Le devis doit contenir au moins un lot.');activeQuote.sections.splice(si,1);renderQuoteEditor()}
function addQuoteItem(si){let s=activeQuote.sections[si];s.items.push({no:(si+1)+"."+(s.items.length+1),designation:"",unit:"",qty:1,pu:0});renderQuoteEditor()}
function removeQuoteItem(si,ii){let s=activeQuote.sections[si];if(s.items.length===1)return alert('Le lot doit contenir au moins une ligne.');s.items.splice(ii,1);renderQuoteEditor()}
function saveQuote(){
 if(user?.role!=="ADMIN")return;
 const q=activeQuote,project=(db.projects||[]).find(p=>!p.deleted&&String(p.id)===String(q?.project));
 if(!project)return alert('Veuillez choisir un chantier actif.');
 if(!String(q.client||'').trim()||!String(q.object||'').trim())return alert('Veuillez renseigner le client et l’objet du devis.');
 const f=quoteFinancials(q);
 if(!Number.isFinite(+q.discount)||+q.discount<0||+q.discount>=f.ht)return alert('La réduction doit être positive ou nulle et inférieure au montant initial.');
 if(f.ttc<=0)return alert('Le montant final du devis doit être positif.');
 const now=new Date().toISOString(),idx=db.quotes.findIndex(x=>x.id===q.id&&!x.deleted);
 if(idx<0&&db.quotes.some(x=>x.id===q.id))return alert('Ce numéro de devis existe déjà.');
 const old=idx>=0?db.quotes[idx]:null;
 if(activeQuoteOriginalId&&q.id!==activeQuoteOriginalId)return alert('Le numéro d’un devis déjà enregistré ne peut pas être modifié.');
 const oldClientReceipts=old&&receiptRows().filter(r=>r.status==='Validé'&&String(r.project)===String(old.project)&&clientPaymentKey(receiptClientName(r))===clientPaymentKey(old.client));
 const oldIdentityChanged=old&&(String(old.project)!==String(q.project)||clientPaymentKey(old.client)!==clientPaymentKey(q.client));
 if(oldIdentityChanged&&(oldClientReceipts?.length||invoiceRows().some(i=>String(i.quoteId)===String(q.id))))return alert('Chantier et client non modifiables après encaissement ou facturation.');
 if(invoiceRows().some(i=>String(i.quoteId)===String(q.id))&&(old?.status!==q.status||Math.abs(quoteFinancials(old).ttc-f.ttc)>0.01||JSON.stringify(invoiceQuoteLines(old))!==JSON.stringify(invoiceQuoteLines(q))||(+old.discount||0)!==(+q.discount||0)||!!old.vatEnabled!==!!q.vatEnabled||(+old.vatRate||0)!==(+q.vatRate||0)))return alert('Une facture est déjà liée à ce devis. Ses montants, désignations, quantités et PU doivent rester identiques ; corrigez la facturation avant de modifier le devis.');
 if(oldClientReceipts?.length&&old?.status==='Accepté'&&q.status!=='Accepté')return alert('Ce devis accepté a des paiements validés : son statut doit rester Accepté.');
 if(q.status==='Accepté'){
  const other=sum(acceptedQuotesForProject(q.project).filter(x=>x.id!==q.id&&clientPaymentKey(x.client)===clientPaymentKey(q.client)).map(x=>quoteFinancials(x).ttc));
  const paid=sum(receiptRows().filter(r=>r.status==='Validé'&&String(r.project)===String(q.project)&&clientPaymentKey(receiptClientName(r))===clientPaymentKey(q.client)).map(r=>r.amount||r.receivedAmount));
  if(other+f.ttc+0.01<paid)return alert('Le devis final ne peut pas être inférieur aux encaissements déjà validés pour ce client et ce chantier.');
 }
 const saved={...structuredClone(q),createdAt:old?.createdAt||now,updatedAt:now};
 if(idx>=0)db.quotes[idx]=saved;else db.quotes.push(saved);
 saveLocalOnly();cloudWriteGeneric('quotes',saved,'Devis enregistré');
 if(old?.project&&old.project!==saved.project)syncProjectQuoteBudget(old.project);
 syncProjectQuoteBudget(saved.project);
 alert('Devis enregistré. '+(saved.status==='Accepté'?(project.budgetSource==='manuel'?`Budget direct conservé : ${money(projectBudgetAmount(project))}.`:`Budget chantier actualisé : ${money(projectBudgetAmount(project))}.`):''));quotes();
}
function duplicateQuote(id){if(user?.role!=="ADMIN")return;const source=db.quotes.find(x=>x.id===id&&!x.deleted);if(!source)return;let q=structuredClone(source),now=new Date().toISOString();q.id='DEV-'+new Date().getFullYear()+'-'+String(db.quotes.length+1).padStart(3,'0');while(db.quotes.some(x=>x.id===q.id))q.id='DEV-'+new Date().getFullYear()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();q.status='Brouillon';q.date=erpToday();q.createdAt=now;q.updatedAt=now;delete q.deleted;delete q.materialForecast;db.quotes.push(q);saveLocalOnly();cloudWriteGeneric('quotes',q,'Copie de devis');quotes()}
function deleteQuote(id){if(user?.role!=="ADMIN")return;const q=db.quotes.find(x=>x.id===id&&!x.deleted);if(!q)return;if(invoiceRows().some(i=>String(i.quoteId)===String(id)))return alert('Ce devis est lié à une facture. Conservez-le pour préserver le contrat client.');if(q.status==='Accepté'&&receiptRows().some(r=>r.status==='Validé'&&String(r.project)===String(q.project)&&clientPaymentKey(receiptClientName(r))===clientPaymentKey(q.client)))return alert('Ce devis accepté correspond à des encaissements validés ; conservez-le pour préserver le solde client.');if(!confirm('Déplacer ce devis dans la corbeille ?'))return;q.deleted=true;q.deletedAt=new Date().toISOString();q.deletedBy=user.username;q.updatedAt=q.deletedAt;saveLocalOnly();cloudWriteGeneric('quotes',q,'Devis supprimé');syncProjectQuoteBudget(q.project);quotes()}
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
   return `⚠ Le rapport du ${new Date(r.reportDate+"T12:00:00").toLocaleDateString("fr-FR")} n’est pas encore envoyé à l’Admin.${dashboardAutoCharts()}`;
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
 <td>${esc(r.ownerLabel||r.owner)}</td><td>${esc(r.role)}</td><td>${esc(r.project?projectLabel(r.project):"Non précisé")}</td>
 <td>${esc((r.workDone||r.controlledWork||"").slice(0,90))}</td><td>${reportStatusBadge(r)}</td>
 <td>${new Date(r.updatedAt||r.createdAt).toLocaleString("fr-FR")}</td>
 <td><div class="edit-actions">
 ${user.role!=="ADMIN"&&canOpenOwnEdit(r)?`<button class="btn-xs btn-edit" onclick="dailyReportForm('${r.id}')">${canUserChange(r)?"Modifier":"Demander correction"}</button>`:""}
 <button class="btn-xs" onclick="dailyReportView('${r.id}')">Voir</button>
 ${user.role==="ADMIN"&&r.status!=="Consulté"?`<button class="btn-xs btn-save" onclick="markDailyReportRead('${r.id}')">Marquer consulté</button>`:""}
 </div></td></tr>`).join(""):`<tr><td colspan="8">Aucun rapport journalier.</td></tr>`}
 </tbody></table></div></div>`;
}
function dailyReportForm(id=""){
 if(user.role==="ADMIN")return dailyReportsPage();
 const existing=id?(db.dailyReports||[]).find(r=>r.id===id):null;
 if(existing&&!canRequestOwnEdit(existing))return alert("Accès refusé.");
 const roleTech=user.role==="CONTROLE";
 const r=existing||{};
 const projectOptions=db.projects.filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${r.project===p.id?"selected":""}>${esc(projectChantierName(p))} — ${esc(projectWorkName(p))}</option>`).join("");
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
   reportDate,project:f.get("project"),owner:user.username,ownerUid:user.uid||existing?.ownerUid||"",ownerTechnicianId:existing?.ownerTechnicianId||effectiveUserIdentity().technicianId||"",ownerEmail:user.email||existing?.ownerEmail||"",ownerLabel:user.label,role:user.role,
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
   if(requestEditIfRequired("dailyReports",existing,obj,dailyReportsPage))return;
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
 const pendingEdits=(db.editRequests||[]).filter(x=>x.status==="En attente");
 const rows=[
  ...(db.requests||[]).filter(x=>!x.deleted).map(x=>({collection:"requests",module:"Demande d’approvisionnement",record:x})),
  ...(db.expenses||[]).filter(x=>!x.deleted).map(x=>({collection:"expenses",module:"Dépense",record:x})),
  ...(db.reports||[]).filter(x=>!x.deleted).map(x=>({collection:"reports",module:"Rapport technique",record:x})),
  ...(db.projects||[]).filter(x=>!x.deleted).map(x=>({collection:"projects",module:"Chantier",record:x}))
 ].filter(x=>!isLocked(x.record));
 $("#content").innerHTML=`<div class="panel"><h3>DEMANDES DE CORRECTION (APRÈS 24 H)</h3>
 <div class="notice">La donnée d’origine reste inchangée tant que l’Admin n’a pas accepté la demande. Les demandes refusées restent dans l’historique.</div>
 <div class="table-wrap"><table><thead><tr><th>Reçue le</th><th>Module / référence</th><th>Demandeur</th><th>Modifications demandées</th><th>Décision</th></tr></thead><tbody>
 ${pendingEdits.length?pendingEdits.map(x=>`<tr><td>${esc(x.requestedAt||"")}</td><td>${esc(x.collection)} / ${esc(x.recordId)}</td><td>${esc(x.requester||x.owner||"")}</td><td><pre class="edit-request-changes">${esc(JSON.stringify(x.changes,null,2))}</pre></td><td><button class="btn-xs btn-edit" onclick="decideEditRequest('${esc(x.id)}',true)">Accepter</button> <button class="btn-xs btn-delete" onclick="decideEditRequest('${esc(x.id)}',false)">Refuser</button></td></tr>`).join(""):'<tr><td colspan="5">Aucune correction en attente.</td></tr>'}
 </tbody></table></div></div><div class="panel"><h3>VALIDATIONS ADMIN</h3>
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
function restoreGeneric(page,id){return restoreDeletedRecord(page,id,true)}
function permanentDeleteGeneric(page,id){
 if(user.role!=="ADMIN"||!confirm("Supprimer définitivement ?"))return;
 const rows=db.modules[page]||[];const before=rows.find(x=>String(x.id)===String(id));db.modules[page]=rows.filter(x=>String(x.id)!==String(id));audit("Suppression définitive","modules."+page,id,"",before,null);save();if(CLOUD_BUSINESS_COLLECTIONS.includes(page))cloudDelete(page,id);trashPage();
}
function showGenericHistory(page,id){
 const record=(db.modules[page]||[]).find(x=>String(x.id)===String(id));if(!record)return;
 const rows=record.history||[];
 $("#content").innerHTML=`<div class="panel"><h3>HISTORIQUE — ${esc(id)}</h3><div class="panel-body"><button class="btn secondary" onclick="generic('${page}')">Retour</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead><tbody>${rows.length?rows.map(h=>`<tr><td>${new Date(h.date).toLocaleString("fr-FR")}</td><td>${esc(h.user)}</td><td>${esc(h.action)}</td><td>${esc(h.details||"")}</td></tr>`).join(""):`<tr><td colspan="4">Aucun historique.</td></tr>`}</tbody></table></div></div>`;
}
