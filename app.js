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

function cloudCollectionLocalRows(collection){
 if(collection==="attendanceWeekly")return db.modules?.attendanceWeekly||[];
 if(collection==="employees")return db.modules?.employees||[];
 return Array.isArray(db[collection])?db[collection]:[];
}
function replaceCloudCollectionLocalRows(collection,rows){
 if(collection==="attendanceWeekly"){db.modules=db.modules||{};db.modules.attendanceWeekly=rows;}
 else if(collection==="employees"){db.modules=db.modules||{};db.modules.employees=rows;}
 else db[collection]=rows;
 save();
}
async function updatePresence(status="online"){
 if(!cloudReady||!user?.uid||!fbStore)return;
 try{await fbStore.collection("userPresence").doc(user.uid).set({
  uid:user.uid,email:user.email||"",displayName:user.label||user.username||"",role:user.role,status,
  currentPage:cloudCurrentPage||"dashboard",lastSeen:new Date().toISOString(),device:navigator.userAgent.slice(0,160)
 },{merge:true});}catch(e){console.warn("presence",e);}
}
function startPresence(){clearInterval(presenceTimer);updatePresence("online");presenceTimer=setInterval(()=>updatePresence(document.hidden?"inactive":"online"),60000);}
function stopPresence(){clearInterval(presenceTimer);presenceTimer=null;if(user?.uid)updatePresence("offline");}
document.addEventListener("visibilitychange",()=>{if(user&&cloudReady)updatePresence(document.hidden?"inactive":"online");});

function adminPresencePage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 $("#content").innerHTML=`<div class="panel"><h3>UTILISATEURS ACTIFS</h3><div id="presenceRows" class="panel-body">Chargement…</div></div>`;
 fbStore.collection("userPresence").onSnapshot(snap=>{
  const now=Date.now(),rows=snap.docs.map(d=>d.data());
  const html=rows.map(r=>{const mins=Math.floor(Math.max(0,now-(Date.parse(r.lastSeen||0)||0))/60000);let st=r.status||"offline";if(mins>=5)st="offline";else if(mins>=2&&st==="online")st="inactive";let label=st==="online"?"En ligne":st==="inactive"?`Inactif depuis ${mins} min`:`Hors ligne — dernière activité il y a ${mins} min`;return `<div class="presence-row"><span class="presence-dot presence-${st}"></span><div><b>${esc(r.displayName||r.email)}</b><small>${esc(r.role||"")} — ${label}</small><small>Module : ${esc(r.currentPage||"dashboard")}</small></div></div>`;}).join("");
  const el=document.getElementById("presenceRows");if(el)el.innerHTML=html||"Aucune activité enregistrée.";
 });
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
 if(!cloudReady||!user||!record?.id)return;
 try{const payload=cloudSanitize({...record,cloudSyncedAt:new Date().toISOString()});await fbStore.collection(collection).doc(String(record.id)).set(payload,{merge:true});record.cloudSyncedAt=payload.cloudSyncedAt;if(notifyTitle&&!record.cloudNotifiedAt&&user.role!=="ADMIN"){await createAdminNotification(collection,notifyTitle,`${user.label||user.username} — ${record.project||record.id}`,record.id);record.cloudNotifiedAt=new Date().toISOString();}save();cloudMarkSynced();}catch(e){console.warn("cloud generic",collection,e);}
}
function startExtendedRealtimeListeners(){
 if(!cloudReady||!user)return;
 const collections=["requests","expenses","siteControls","reports","attendanceWeekly","employees"];
 collections.forEach(collection=>{try{cloudListeners.push(fbStore.collection(collection).onSnapshot(s=>{const remote=s.docs.map(d=>({id:d.id,...d.data()}));const local=cloudCollectionLocalRows(collection);const map=new Map(local.map(r=>[String(r.id),r]));remote.forEach(r=>{const l=map.get(String(r.id));if(!l){local.push(r);return;}const rt=Date.parse(r.updatedAt||r.cloudSyncedAt||r.createdAt||0)||0,lt=Date.parse(l.updatedAt||l.cloudSyncedAt||l.createdAt||0)||0;if(rt>=lt)Object.assign(l,r);});replaceCloudCollectionLocalRows(collection,local);},e=>console.warn("listener",collection,e)));}catch(e){console.warn(e);}});
}
function startCloudAutoSync(){
 clearInterval(cloudAutoSyncTimer);
 const run=async()=>{if(!cloudReady||!user||!navigator.onLine)return;const cfg=[
  ["requests","Nouvelle demande d’approvisionnement"],["expenses","Nouvelle dépense"],["siteControls","Nouveau contrôle chantier"],["reports","Nouveau rapport technique"],["attendanceWeekly","Mise à jour présence chantier"],["employees","Mise à jour personnel"]
 ];for(const [c,title] of cfg){for(const r of cloudCollectionLocalRows(c)){if(r.deleted)continue;const u=Date.parse(r.updatedAt||r.createdAt||0)||0,s=Date.parse(r.cloudSyncedAt||0)||0;if(u>s)await cloudWriteGeneric(c,r,title);}}};
 run();cloudAutoSyncTimer=setInterval(run,10000);
}
function dashboardDetail(type){
 let title="",rows=[];
 if(type==="revenue"){title="DÉTAIL DU CHIFFRE D’AFFAIRES";rows=(db.projects||[]).filter(p=>!p.deleted).map(p=>({a:p.name||p.id,b:p.client||"",c:money(+p.budget||0),d:p.status||""}));}
 if(type==="employees"){title="DÉTAIL DES EMPLOYÉS ACTIFS";rows=(db.modules?.employees||[]).filter(e=>!e.deleted).map(e=>({a:e.values?.[1]||"",b:e.values?.[4]||"Non affecté",c:e.values?.[2]||"",d:"Actif"}));}
 if(type==="projects"){title="DÉTAIL DES CHANTIERS";rows=(db.projects||[]).filter(p=>!p.deleted).map(p=>({a:p.name||p.id,b:p.client||"",c:(p.progress||0)+"%",d:p.status||""}));}
 $("#content").innerHTML=`<div class="panel"><h3>${title}</h3><div class="table-wrap"><table><thead><tr><th>Nom / Chantier</th><th>Affectation / Client</th><th>Valeur / Fonction</th><th>Statut</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><b>${esc(r.a)}</b></td><td>${esc(r.b)}</td><td>${esc(r.c)}</td><td>${esc(r.d)}</td></tr>`).join(""):`<tr><td colspan="4">Aucune donnée.</td></tr>`}</tbody></table></div></div>`;
}
function cleanupExpiredLocalPhotos(){const days=+(db.appSettings?.photoRetentionDays||3),cutoff=Date.now()-days*86400000;let n=0;(db.siteControls||[]).forEach(r=>{const t=Date.parse(r.createdAt||r.updatedAt||0)||0;if(r.photo&&t&&t<cutoff){r.photo="";r.photoExpiredAt=new Date().toISOString();n++;}});if(n)save();return n;}


function legacyUsernameForRole(role){
  return role==="ADMIN"?"admin":role==="GESTIONNAIRE"?"gestionnaire":role==="CONTROLE"?"controle":"user";
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
  const rec={uid:user.uid,email:user.email,username:user.username,role:user.role,label:user.label,active:true,lastSeen:new Date().toISOString()};
  if(u)Object.assign(u,rec);else db.users.push(rec);
  save();
}
async function cloudLoadProfile(fbUser){
  if(!fbStore)throw new Error("Firestore non initialisé.");
  const snap=await fbStore.collection("users").doc(fbUser.uid).get();
  if(!snap.exists)throw new Error("Profil Firestore introuvable pour cet utilisateur.");
  const profile=snap.data()||{};
  if(profile.active!==true)throw new Error("Ce compte est désactivé.");
  if(!["ADMIN","GESTIONNAIRE","CONTROLE"].includes(profile.role))throw new Error("Rôle utilisateur non reconnu.");
  return {
    uid:fbUser.uid,
    email:fbUser.email||"",
    username:legacyUsernameForRole(profile.role),
    role:profile.role,
    label:cloudProfileLabel(profile)
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
      cloudMergeRemoteCollection("dailyReports",rows);
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
  cloudStatusText("Synchronisation…","busy");
  await cloudSyncPendingPhase1();
  cloudAttachPhase1Listeners();
  cloudMarkSynced();
  alert("Synchronisation Cloud Phase 1 terminée.");
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
        cloudAttachPhase1Listeners();
        startExtendedRealtimeListeners();
        startPresence();
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
window.addEventListener("online",()=>{cloudStatusText("Reconnexion…","busy");if(user&&cloudReady){cloudSyncPendingPhase1();cloudAttachPhase1Listeners();}});
window.addEventListener("offline",()=>cloudStatusText("Hors ligne","error"));

const INIT={
 projects:[],
 appro:[],
 expenses:[],
 requests:[],
 reports:[],
 modules:{},
 quotes:[],
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
const save=()=>localStorage.setItem("nysoa_stable_vide_db_v1",JSON.stringify(db));
if(!db.modules) db.modules={};
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
 ensureGovernanceData();
 db.auditLog.unshift({
  id:"AUD-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
  date:new Date().toISOString(),
  user:user?.username||"système",
  role:user?.role||"SYSTÈME",
  action,module:moduleName,reference,details,
  before:before?cloneRecord(before):null,
  after:after?cloneRecord(after):null
 });
 save();
}
function pushHistory(record,action,before=null,details=""){
 record.history=Array.isArray(record.history)?record.history:[];
 record.history.unshift({
  id:"HIS-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),
  date:new Date().toISOString(),
  user:user.username,role:user.role,action,details,
  snapshot:before?cloneRecord(before):null
 });
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
 save();if(collection==="projects"||collection==="dailyReports")cloudDelete(collection,id);trashPage();
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
function auditPage(){
 if(user.role!=="ADMIN")return alert("Réservé à l’Admin.");
 ensureGovernanceData();
 $("#content").innerHTML=`<div class="panel"><h3>JOURNAL D’AUDIT</h3>
 <div class="panel-body">Journal non modifiable des créations, modifications, suppressions, restaurations, validations et synchronisations.</div>
 <div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Rôle</th><th>Action</th><th>Module</th><th>Référence</th><th>Détails</th></tr></thead><tbody>
 ${db.auditLog.length?db.auditLog.map(a=>`<tr><td>${new Date(a.date).toLocaleString("fr-FR")}</td><td>${esc(a.user)}</td><td>${esc(a.role)}</td><td>${esc(a.action)}</td><td>${esc(a.module)}</td><td>${esc(a.reference)}</td><td>${esc(a.details||"")}</td></tr>`).join(""):`<tr><td colspan="7">Aucune opération enregistrée.</td></tr>`}
 </tbody></table></div></div>`;
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
 ["quotes","📄","DEVIS"],["invoices","🧾","FACTURATION"],
 ["clients","👥","CLIENTS"],["suppliers","🚚","FOURNISSEURS"],
 ["purchases","🛒","ACHATS"],["stock","📦","STOCK"],
 ["employees","👥","EMPLOYÉS"],["attendance","◷","POINTAGE"],["payroll","💵","PAIE"],
 ["cash","💵","CAISSE"],["bank","🏦","BANQUE"],["expenses","☷","DÉPENSES"],
 ["appro","💵","APPRO. CAISSE"],["accounting","📚","COMPTABILITÉ"],
 ["treasury","💰","TRÉSORERIE"],["reportsFinance","◔","RAPPORTS FINANCIERS"]
];
const ADMIN_TECH_MENU=[
 ["dashboardTechnique","◉","TABLEAU DE BORD TECHNIQUE"],
 ["projects","🏗","CHANTIERS"],["siteControls","📷","CONTRÔLE CHANTIER"],["planning","📅","PLANNING"],
 ["situations","📊","SITUATION DE TRAVAUX"],["technicalFollowup","🧰","SUIVI JOURNALIER"],
 ["quality","✅","CONTRÔLE QUALITÉ"],["nonConformities","⚠","NON-CONFORMITÉS"],
 ["equipment","🏗","MATÉRIELS & ENGINS"],["vehicles","🚚","VÉHICULES"],
 ["fuel","⛽","CARBURANT"],["reports","◔","RAPPORTS TECHNIQUES"],["technicalRecap","📚","RÉCAPITULATIF TECHNIQUE"]
];

const menus={
 ADMIN:[["dashboard","◉","TABLEAU DE BORD"],["projects","🏗","GESTION DES CHANTIERS"],["quotes","📄","DEVIS"],["invoices","🧾","FACTURATION"],["situations","📊","SITUATION DE TRAVAUX"],["clients","👥","CLIENTS"],["suppliers","🚚","FOURNISSEURS"],["purchases","🛒","ACHATS"],["stock","📦","STOCK"],["equipment","🏗","MATÉRIELS & ENGINS"],["vehicles","🚚","VÉHICULES"],["fuel","⛽","CARBURANT"],["employees","👥","EMPLOYÉS"],["attendance","◷","POINTAGE"],["payroll","💵","PAIE"],["cash","💵","CAISSE"],["bank","🏦","BANQUE"],["expenses","☷","DÉPENSES (JOURNAL)"],["appro","💵","APPRO. CAISSE"],["accounting","📚","COMPTABILITÉ"],["treasury","💵","TRÉSORERIE"],["dailyReports","📝","RAPPORTS JOURNALIERS"],["reports","◔","RAPPORTS"],["adminValidations","✅","VALIDATIONS À PUBLIER"],["usageTime","⏱","TEMPS D’UTILISATION"],["trash","🗑","CORBEILLE"],["audit","📜","JOURNAL D’AUDIT"],["presenceUsers","●","UTILISATEURS ACTIFS"],["settings","⚙","PARAMÈTRES"]],
 GESTIONNAIRE:[["dashboard","◉","TABLEAU DE BORD"],["projects","🏗","GESTION DES CHANTIERS"],["purchases","🛒","ACHATS"],["stock","📦","STOCK"],["employees","👥","EMPLOYÉS"],["attendance","◷","POINTAGE"],["payroll","💵","PAIE"],["cash","💵","CAISSE"],["expenses","☷","DÉPENSES (JOURNAL)"],["appro","💵","DEMANDE D'APPRO."],["dailyReports","📝","RAPPORT JOURNALIER"],["reports","◔","RAPPORTS FINANCIERS"]],
 CONTROLE:[["dashboard","◉","TABLEAU DE BORD"],["projects","🏗","GESTION DES CHANTIERS"],["siteControls","📷","CONTRÔLE CHANTIER"],["attendance","◷","PRÉSENCE CHANTIER"],["situations","📊","SITUATION DE TRAVAUX"],["dailyReports","📝","RAPPORT JOURNALIER"],["reports","◔","RAPPORTS TECHNIQUES"]]
};
function projectMetrics(id){let p=db.projects.find(x=>x.id===id)||{};let app=sum(db.appro.filter(x=>x.project===id&&x.status==="Validée").map(x=>x.amount));let dep=sum(db.expenses.filter(x=>x.project===id).map(x=>x.amount));return{budget:p.budget||0,app,dep,cash:app-dep,remaining:(p.budget||0)-dep}}
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
function boot(){ensureSecurityData();touchCurrentUser();if(user.role!=="ADMIN")startUsageSession();$("#login").classList.add("hidden");$("#app").classList.remove("hidden");$("#currentUserLabel").textContent=user.label;$("#today").textContent=new Date().toLocaleDateString("fr-FR");renderMenu();
const sendBtn=document.getElementById("sendUpdatesBtn");
const refreshBtn=document.getElementById("refreshAdminBtn");
if(sendBtn)sendBtn.style.display=user.role==="ADMIN"?"none":"inline-flex";
if(refreshBtn)refreshBtn.style.display=user.role==="ADMIN"?"inline-flex":"none";
const publishBtn=document.getElementById("publishValidationBtn");
const importValidationBtn=document.getElementById("importValidationBtn");
if(publishBtn)publishBtn.style.display=user.role==="ADMIN"?"inline-flex":"none";
if(importValidationBtn)importValidationBtn.style.display=user.role==="ADMIN"?"none":"inline-flex";
const exportUsageBtn=document.getElementById("exportUsageBtn");
const importUsageBtn=document.getElementById("importUsageBtn");
if(exportUsageBtn)exportUsageBtn.style.display=user.role==="ADMIN"?"none":"inline-flex";
if(importUsageBtn)importUsageBtn.style.display=user.role==="ADMIN"?"inline-flex":"none";
const exportDailyReportsBtn=document.getElementById("exportDailyReportsBtn");
const importDailyReportsBtn=document.getElementById("importDailyReportsBtn");
if(exportDailyReportsBtn)exportDailyReportsBtn.style.display=user.role==="ADMIN"?"none":"inline-flex";
if(importDailyReportsBtn)importDailyReportsBtn.style.display=user.role==="ADMIN"?"inline-flex":"none";
const cloudMigrateBtn=document.getElementById("cloudMigrateBtn");
const cloudSyncBtn=document.getElementById("cloudSyncBtn");
if(cloudMigrateBtn)cloudMigrateBtn.style.display=user.role==="ADMIN"?"inline-flex":"none";
if(cloudSyncBtn)cloudSyncBtn.style.display="inline-flex";
cloudStatusText(navigator.onLine?"Connecté":"Hors ligne",navigator.onLine?"ok":"error");
if(user.role==="ADMIN"&&adminWorkspace==="FINANCE")go("dashboardFinance");else if(user.role==="ADMIN"&&adminWorkspace==="TECHNIQUE")go("dashboardTechnique");else go("dashboard")}
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

function currentProjectContext(){
 return sessionStorage.getItem("nysoa_project_context")||"";
}
function projectContextOptions(selected=currentProjectContext()){
 return `<option value="">Tous les chantiers</option>`+
  (db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(selected)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("");
}
function renderGlobalProjectSelector(){
 const el=document.getElementById("globalProjectFilter");
 if(!el)return;
 const selected=currentProjectContext();
 el.innerHTML=projectContextOptions(selected);
 if(selected && !(db.projects||[]).some(p=>String(p.id)===String(selected)&&!p.deleted)){
  sessionStorage.removeItem("nysoa_project_context");
  el.value="";
 }
}
function setGlobalProjectContext(projectId){
 if(projectId)sessionStorage.setItem("nysoa_project_context",projectId);
 else sessionStorage.removeItem("nysoa_project_context");
 go(cloudCurrentPage||"dashboard");
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

function go(page){cloudCurrentPage=page;if(user?.role==="ADMIN")markNotificationsRead(page);if(user&&cloudReady)updatePresence(document.hidden?"inactive":"online");document.querySelectorAll(".menu-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));({dashboard:dashboard,dashboardFinance:dashboardFinance,dashboardTechnique:dashboardTechnique,quotes:quotes,invoices:invoicesPage,projects:projects,siteControls:siteControlsPage,expenses:expenses,appro:appro,reports:reports,cash:cash,attendance:attendance,technicalRecap:technicalRecap,adminValidations:adminValidationsPage,usageTime:usageTimePage,purchases:purchasesPage,dailyReports:dailyReportsPage,presenceUsers:adminPresencePage,trash:trashPage,audit:auditPage}[page]||generic)(page);setTimeout(renderGlobalProjectSelector,0)}
function kpi(icon,color,title,value,note="",page=""){
 const routes={
  "CHANTIERS EN COURS":"projects","NOMBRE DE CHANTIERS":"projects",
  "RAPPORTS TECHNIQUES":"reports","RAPPORTS VALIDÉS":"reports","NON-CONFORMITÉS":"reports",
  "TECHNICIENS ACTIFS":"siteControls","EMPLOYÉS ACTIFS":"employees","POINTAGES DU JOUR":"attendance",
  "DÉPENSES TOTALES":"expenses","APPROVISIONNEMENTS SAISIS":"appro","DEMANDES EN ATTENTE":"appro",
  "CHIFFRE D’AFFAIRES (TTC)":"invoices"
 };
 const target=page||routes[title]||"";
 const detail=title==="CHIFFRE D’AFFAIRES (TTC)"?"revenue":title==="EMPLOYÉS ACTIFS"?"employees":(title==="CHANTIERS EN COURS"||title==="NOMBRE DE CHANTIERS")?"projects":"";
 const action=detail?`dashboardDetail('${detail}')`:(target?`go('${target}')`:"");
 return `<div class="kpi ${action?"kpi-link":""}" ${action?`role="button" tabindex="0" onclick="${action}" onkeydown="if(event.key==='Enter')${action}"`:""}>
 <div class="circle ${color}">${icon}</div><div><small>${title}</small><strong>${value}</strong><span style="font-size:10px;color:#6b7885">${note}</span></div></div>`;
}

function workspaceBanner(type,title,subtitle){
 return `<div class="workspace-banner ${type}"><div><h2>${title}</h2><p>${subtitle}</p></div><b>${type==="finance"?"💰":"🏗"}</b></div>`;
}
function dashboardFinance(){
 let totalApp=sum(db.appro.filter(x=>x.status==="Validée").map(x=>x.amount));
 let totalRequests=sum(db.requests.map(x=>+x.amount||0));
 let totalAppDisplayed=user.role==="GESTIONNAIRE"?totalApp+totalRequests:totalApp;
 let totalDep=sum(db.expenses.map(x=>x.amount));
 let cashBal=totalApp-totalDep;
 let totalBudget=sum(db.projects.map(x=>x.budget));
 $("#content").innerHTML=workspaceBanner("finance","ESPACE FINANCE","Gestion confidentielle des budgets, caisse, achats, paie, banque et trésorerie")+
 `<div class="kpis">
 ${kpi("💼","green","BUDGET TOTAL PROJETS",money(totalBudget),"ADMIN uniquement")}
 ${kpi("💵","blue","APPROVISIONNEMENTS",money(totalApp))}
 ${kpi("💸","orange","DÉPENSES RÉELLES",money(totalDep))}
 ${kpi("👛","purple","SOLDE CAISSE",money(cashBal))}
 ${kpi("📋","teal","DEMANDES EN ATTENTE",db.requests.filter(x=>x.status==="En attente").length)}
 </div>
 <div class="module-grid">
 ${[
 ["quotes","📄","Devis","Création, validation et suivi des devis"],
 ["invoices","🧾","Facturation","Factures clients et règlements"],
 ["purchases","🛒","Achats","Commandes et achats chantier"],
 ["stock","📦","Stock","Entrées, sorties et alertes"],
 ["cash","💵","Caisse","Entrées, sorties et soldes"],
 ["appro","➕","Approvisionnement","Alimentation des caisses chantier"],
 ["expenses","💸","Dépenses","Journal complet et justificatifs"],
 ["bank","🏦","Banque","Mouvements et rapprochements"],
 ["payroll","👥","Paie","Salaires, avances et retenues"],
 ["accounting","📚","Comptabilité","Journaux et synthèses"],
 ["treasury","💰","Trésorerie","Prévisions et disponibilités"],
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
 let totalDep=sum(db.expenses.map(x=>x.amount));
 let cashBal=totalApp-totalDep;
 let invoices=db.modules.invoices||[];
 let employees=db.modules.employees||[];
 let stock=db.modules.stock||[];
 let totalRevenue=sum(invoices.filter(r=>!r.deleted).map(r=>+(r.trancheAmount||r.values?.[2]||0)));
 let netProfit=totalRevenue-totalDep;
 let activeEmployees=employees.length;
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
 <b>Synchronisation simple :</b> le Gestionnaire et le Technicien exportent leur fichier de mise à jour, puis l’Admin clique sur « Actualiser les données » pour l’importer.
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
    <table><tr><td>Total budget projets</td><td><b>${money(totalBudget)}</b></td></tr><tr><td>Approvisionnements caisse</td><td>${money(totalApp)}</td></tr><tr><td>Dépenses réelles</td><td>${money(totalDep)}</td></tr><tr><td>Disponible caisse</td><td style="color:#078b4c"><b>${money(cashBal)}</b></td></tr></table>
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
         ${db.projects.filter(p=>!p.deleted).length?db.projects.filter(p=>!p.deleted).map(p=>{
           const isOwner=p.owner===user.username;
           let actions="";
           if(user.role==="ADMIN"){
             actions=`<button class="btn-xs btn-edit" onclick="projectForm('${p.id}')">Modifier</button>
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
 const rows=(db.siteControls||[]).filter(r=>!r.deleted);
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
 <label>Chantier<select name="project" required>${db.projects.filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${r?.project===p.id?"selected":""}>${esc(p.id)} - ${esc(p.name)}</option>`).join("")}</select></label>
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
function reportsTable(){return `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Date</th><th>Chantier</th><th>Avancement</th><th>Travaux contrôlés</th><th>Conformité</th><th>Incident</th><th>Action</th><th>Statut</th><th>Observation Admin</th><th>Actions</th></tr></thead><tbody>${db.reports.filter(r=>!r.deleted).map(r=>`<tr><td>${r.id}</td><td>${r.date}</td><td>${r.project}</td><td>${r.progress}%</td><td>${r.work}</td><td>${r.conformity}</td><td>${r.issue}</td><td>${r.action}</td><td>${workflowBadge(r.workflow||r.status)}</td><td>${esc(r.adminObservation||"")}</td><td><div class="edit-actions">${canUserChange(r)?`<button class="btn-xs btn-edit" onclick="reportForm('${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="softDeleteRecord('reports','reports','${r.id}')">Supprimer</button>`:"<span>Verrouillé</span>"}<button class="btn-xs" onclick="showRecordHistory('reports','${r.id}')">Historique</button></div></td></tr>`).join("")}</tbody></table></div>`}
function reportForm(id=""){let r=id?db.reports.find(x=>x.id===id):null;if(r&&!canUserChange(r))return alert("Ce rapport est verrouillé ou ne vous appartient pas.");let opts=db.projects.map(p=>`<option value="${p.id}">${p.id} - ${p.name}</option>`).join("");$("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVEAU"} RAPPORT CONTRÔLE & SUIVI</h3><form id="fReport" class="form-grid"><label>Date<input name="date" type="date" value="${r?.date||""}" required></label><label>Chantier<select name="project">${db.projects.map(p=>`<option value="${p.id}" ${r?.project===p.id?"selected":""}>${p.id} - ${p.name}</option>`).join("")}</select></label><label>Avancement réel (%)<input name="progress" type="number" min="0" max="100" value="${r?.progress??0}" required></label><label>Conformité<select name="conformity"><option ${r?.conformity==="Conforme"?"selected":""}>Conforme</option><option ${r?.conformity==="Non conforme"?"selected":""}>Non conforme</option></select></label><label class="full">Travaux contrôlés<textarea name="work" required>${r?.work||""}</textarea></label><label>Incident / Blocage<input name="issue" value="${r?.issue||""}"></label><label>Action corrective<input name="action" value="${r?.action||""}" required></label><button class="btn primary">Enregistrer</button></form></div>`;$("#fReport").onsubmit=e=>{e.preventDefault();let f=new FormData(e.target);let obj={id:r?.id||"RAP-"+String(db.reports.length+1).padStart(3,"0"),owner:r?.owner||user.username,date:f.get("date"),project:f.get("project"),progress:+f.get("progress"),work:f.get("work"),conformity:f.get("conformity"),issue:f.get("issue")||"Aucun",action:f.get("action"),status:r?.status||"À valider",updatedAt:new Date().toISOString()};const before=r?cloneRecord(r):null;obj.workflow=r?.workflow||"Soumis";obj.updatedBy=user.username;if(r){pushHistory(r,"Modification",before);Object.assign(r,obj);audit("Modification","reports",r.id,"Rapport modifié",before,r)}else{obj.createdAt=new Date().toISOString();obj.history=[];pushHistory(obj,"Création");db.reports.push(obj);audit("Création","reports",obj.id,"Rapport créé",null,obj)}logTechnicalEntry(r?"Modification":"Création","Rapport technique",obj.id,`Chantier ${obj.project}, avancement ${obj.progress}%, ${obj.conformity}`);save();cloudWriteGeneric("reports",r||obj,"Nouveau rapport technique");reports()}}
function deleteReport(id){if(confirm("Supprimer ce rapport ?")){db.reports=db.reports.filter(x=>x.id!==id);save();reports()}}
function mondayOf(dateStr){
 const d=new Date(dateStr+"T12:00:00");const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);
 return d.toISOString().slice(0,10);
}
function addDays(dateStr,n){const d=new Date(dateStr+"T12:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function attendance(){
 ensureSecurityData();
 const employees=(db.modules.employees||[]).filter(r=>!r.deleted);
 const today=new Date().toISOString().slice(0,10);
 const selectedDate=sessionStorage.getItem("nysoa_attendance_date")||today;
 const weekStart=mondayOf(selectedDate);
 const project=sessionStorage.getItem("nysoa_attendance_project")||"";
 const days=["L","M","M","J","V","S","D"].map((label,i)=>({label,date:addDays(weekStart,i)}));
 let record=db.modules.attendanceWeekly.find(r=>r.weekStart===weekStart&&r.project===project);
 const entries=record?.entries||[];
 const keyOf=(r,i)=>r.values?.[0]||`EMP-${i+1}`;
 $("#content").innerHTML=`<div class="panel"><h3>PRÉSENCE HEBDOMADAIRE DU PERSONNEL</h3>
 <div class="panel-body"><div class="form-grid">
 <label>Semaine contenant le<input id="attendanceDate" type="date" value="${selectedDate}"></label>
 <label>Chantier<select id="attendanceProject"><option value="">Tous / Siège</option>${db.projects.filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${project===p.id?"selected":""}>${esc(p.id)} - ${esc(p.name)}</option>`).join("")}</select></label>
 <div class="form-actions full"><button class="btn primary" onclick="saveAttendance()">Enregistrer la semaine</button></div>
 </div><div class="attendance-note">Cochez Présent ou Absent pour chaque jour. Le total et le montant sont calculés automatiquement. Paiement hebdomadaire à cocher en fin de semaine.</div></div>
 <div class="table-wrap"><table class="attendance-table weekly-attendance"><thead><tr>
 <th>Matricule</th><th>Nom</th><th>Fonction</th>
 ${days.map(d=>`<th class="center">${d.label}<small>${d.date.slice(8,10)}</small></th>`).join("")}
 <th>Total jours</th><th>Salaire/jour</th><th>Montant</th><th>Payé</th><th>Action</th></tr></thead><tbody>
 ${employees.length?employees.map((r,i)=>{
  const key=keyOf(r,i),entry=entries.find(e=>e.employeeKey===key)||{};
  const states=entry.states||{};
  const salary=+(entry.dailySalary??r.values?.[3]??0);
  const total=days.reduce((n,d)=>n+(states[d.date]==="P"?1:0),0);
  return `<tr data-employee="${esc(key)}"><td>${esc(r.values?.[0]||"")}</td><td><b>${esc(r.values?.[1]||"")}</b></td><td>${esc(r.values?.[2]||"")}</td>
  ${days.map(d=>`<td class="center"><select class="attendance-state" data-key="${esc(key)}" data-date="${d.date}"><option value="">—</option><option value="P" ${states[d.date]==="P"?"selected":""}>P</option><option value="A" ${states[d.date]==="A"?"selected":""}>A</option></select></td>`).join("")}
  <td class="num attendance-total" data-key="${esc(key)}"><b>${total}</b></td>
  <td><input class="attendance-salary num" data-key="${esc(key)}" type="number" min="0" value="${salary}"></td>
  <td class="num attendance-amount" data-key="${esc(key)}"><b>${money(total*salary)}</b></td>
  <td class="center"><input class="attendance-paid" data-key="${esc(key)}" type="checkbox" ${entry.paid?"checked":""}><small>${entry.paidAt?new Date(entry.paidAt).toLocaleDateString("fr-FR"):""}</small></td>
  <td><button class="btn-xs btn-delete" onclick="clearAttendanceEmployee('${esc(key)}')">Effacer</button></td></tr>`;
 }).join(""):`<tr><td colspan="15"><div class="empty-state">Ajoutez d’abord le personnel dans Employés.</div></td></tr>`}
 </tbody></table></div>
 <div class="panel-body"><b>Semaine : ${weekStart} au ${addDays(weekStart,6)}</b> — Paiements cochés : ${entries.filter(e=>e.paid).length}</div></div>`;
 $("#attendanceDate").onchange=e=>{sessionStorage.setItem("nysoa_attendance_date",e.target.value);attendance();};
 $("#attendanceProject").onchange=e=>{sessionStorage.setItem("nysoa_attendance_project",e.target.value);attendance();};
 document.querySelectorAll(".attendance-state,.attendance-salary").forEach(el=>el.onchange=()=>refreshAttendanceRow(el.dataset.key));
}
function refreshAttendanceRow(key){
 const states=[...document.querySelectorAll(`.attendance-state[data-key="${CSS.escape(key)}"]`)];
 const total=states.filter(x=>x.value==="P").length;
 const salary=+document.querySelector(`.attendance-salary[data-key="${CSS.escape(key)}"]`)?.value||0;
 const t=document.querySelector(`.attendance-total[data-key="${CSS.escape(key)}"]`);if(t)t.innerHTML=`<b>${total}</b>`;
 const a=document.querySelector(`.attendance-amount[data-key="${CSS.escape(key)}"]`);if(a)a.innerHTML=`<b>${money(total*salary)}</b>`;
}
function saveAttendance(){
 const selectedDate=$("#attendanceDate")?.value,project=$("#attendanceProject")?.value||"";
 if(!selectedDate)return alert("Choisissez une date.");
 const weekStart=mondayOf(selectedDate),employees=(db.modules.employees||[]).filter(r=>!r.deleted);
 let record=db.modules.attendanceWeekly.find(r=>r.weekStart===weekStart&&r.project===project);
 const entries=employees.map((r,i)=>{
  const key=r.values?.[0]||`EMP-${i+1}`,states={};
  document.querySelectorAll(`.attendance-state[data-key="${CSS.escape(key)}"]`).forEach(x=>{if(x.value)states[x.dataset.date]=x.value;});
  const dailySalary=Math.max(0,+document.querySelector(`.attendance-salary[data-key="${CSS.escape(key)}"]`)?.value||0);
  if(r.values)r.values[3]=String(dailySalary);
  const paid=document.querySelector(`.attendance-paid[data-key="${CSS.escape(key)}"]`)?.checked===true;
  const old=record?.entries?.find(e=>e.employeeKey===key);
  return {employeeKey:key,states,dailySalary,paid,paidAt:paid?(old?.paidAt||new Date().toISOString()):""};
 });
 if(record){record.entries=entries;record.updatedAt=new Date().toISOString();record.updatedBy=user.username;}
 else db.modules.attendanceWeekly.push({id:"ATTW-"+Date.now(),weekStart,project,entries,owner:user.username,updatedBy:user.username,updatedAt:new Date().toISOString()});
 save();const saved=db.modules.attendanceWeekly.find(r=>r.weekStart===weekStart&&r.project===project);if(saved)cloudWriteGeneric("attendanceWeekly",saved,"Mise à jour présence chantier");alert("Présence hebdomadaire enregistrée.");attendance();
}
function clearAttendanceEmployee(key){
 document.querySelectorAll(`.attendance-state[data-key="${CSS.escape(key)}"]`).forEach(x=>x.value="");
 const paid=document.querySelector(`.attendance-paid[data-key="${CSS.escape(key)}"]`);if(paid)paid.checked=false;
 refreshAttendanceRow(key);
}


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
 <th>Quantité</th><th>Montant</th><th>Situation</th><th>Dernière mise à jour</th>
 <th>Modifié par</th><th>Observation</th><th>Actions</th>
 </tr></thead><tbody>
 ${rows.length?rows.map(r=>`<tr>
 <td>${esc(r.id)}</td><td>${esc(r.date||"")}</td><td>${esc(r.project||"")}</td>
 <td>${esc(r.designation||"")}</td><td>${esc(r.supplier||"")}</td>
 <td>${esc(r.quantity||"")} ${esc(r.unit||"")}</td><td>${money(r.amount)}</td>
 <td>${purchaseBadge(r.status)}</td>
 <td>${r.updatedAt?new Date(r.updatedAt).toLocaleString("fr-FR"):""}</td>
 <td>${esc(r.updatedBy||r.owner||"")}</td><td>${esc(r.observation||"")}</td>
 <td><div class="edit-actions">
 ${purchaseCanEdit(r)?`<button class="btn-xs btn-edit" onclick="purchaseForm('${r.id}')">Modifier / situation</button>
 <button class="btn-xs btn-delete" onclick="softDeletePurchase('${r.id}')">Supprimer</button>`:""}
 <button class="btn-xs" onclick="purchaseHistory('${r.id}')">Historique</button>
 </div></td></tr>`).join(""):`<tr><td colspan="12">Aucun achat enregistré.</td></tr>`}
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
 <label>Chantier<select name="project"><option value="">Non précisé</option>${projectOptions}</select></label>
 <label>Désignation<input name="designation" value="${esc(r?.designation||"")}" required></label>
 <label>Fournisseur<input name="supplier" value="${esc(r?.supplier||"")}" required></label>
 <label>Quantité<input name="quantity" type="number" step="0.01" value="${esc(r?.quantity||"")}" required></label>
 <label>Unité<input name="unit" value="${esc(r?.unit||"Unité")}" required></label>
 <label>Montant total<input name="amount" type="number" step="0.01" value="${esc(r?.amount||"")}" required></label>
 <label>Situation<select name="status">${PURCHASE_STATUSES.map(s=>`<option ${r?.status===s?"selected":""}>${s}</option>`).join("")}</select></label>
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
   amount:+f.get("amount"),status:newStatus,workflow:newStatus,
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


// ===== FACTURATION PAR CHANTIER / DEVIS VALIDÉ =====
function acceptedQuotesForProject(projectId){
 return (db.quotes||[]).filter(q=>q.status==="Accepté"&&(!projectId||String(q.project)===String(projectId)));
}
function invoiceRows(){
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 return db.modules.invoices.filter(r=>!r.deleted);
}
function invoicePaidForProject(projectId,excludeId=""){
 return invoiceRows().filter(r=>String(r.project)===String(projectId)&&String(r.id)!==String(excludeId))
  .reduce((n,r)=>n+(+r.trancheAmount||+(r.values?.[2]||0)||0),0);
}
function validatedQuoteAmount(projectId,quoteId=""){
 const q=quoteId?(db.quotes||[]).find(x=>x.id===quoteId):acceptedQuotesForProject(projectId).slice(-1)[0];
 return q?quoteFinancials(q).ttc:0;
}
function invoicesPage(){
 if(user.role!=="ADMIN")return generic("invoices");
 const ctx=currentProjectContext(),rows=invoiceRows().filter(r=>!ctx||String(r.project)===String(ctx));
 $("#content").innerHTML=`${projectContextNotice()}<div class="panel"><h3>FACTURATION PAR CHANTIER</h3>
 <div class="panel-body"><button class="btn primary" onclick="invoiceForm()">+ Nouvelle tranche / facture</button>
 <div class="notice">Chaque facture est rattachée à un chantier et à un devis accepté. Le reste à payer est recalculé automatiquement.</div></div>
 <div class="table-wrap"><table><thead><tr><th>N° facture</th><th>Date</th><th>Chantier</th><th>Client</th><th>Devis validé</th><th>Montant devis</th><th>Tranche</th><th>Montant tranche</th><th>Total payé</th><th>Reste à payer</th><th>Actions</th></tr></thead><tbody>
 ${rows.length?rows.map(r=>{
  const qa=+r.quoteAmount||validatedQuoteAmount(r.project,r.quoteId);
  const paid=invoiceRows().filter(x=>String(x.project)===String(r.project)).reduce((n,x)=>n+(+x.trancheAmount||+(x.values?.[2]||0)||0),0);
  const remain=Math.max(0,qa-paid),pr=(db.projects||[]).find(p=>String(p.id)===String(r.project));
  return `<tr><td><b>${esc(r.id)}</b></td><td>${esc(r.date||"")}</td><td>${esc(pr?.name||r.project||"")}</td><td>${esc(r.client||"")}</td><td>${esc(r.quoteId||"")}</td><td>${money(qa)}</td><td><b>${(+r.tranchePercent||0).toFixed(2)}%</b></td><td>${money(r.trancheAmount||0)}</td><td>${money(paid)}</td><td><b>${money(remain)}</b></td><td><div class="edit-actions"><button class="btn-xs btn-edit" onclick="invoiceForm('${r.id}')">Modifier</button><button class="btn-xs btn-delete" onclick="deleteInvoice('${r.id}')">Supprimer</button></div></td></tr>`;
 }).join(""):`<tr><td colspan="11">Aucune facture pour ce chantier.</td></tr>`}
 </tbody></table></div></div>`;
}
function invoiceForm(id=""){
 if(user.role!=="ADMIN")return;
 db.modules.invoices=Array.isArray(db.modules.invoices)?db.modules.invoices:[];
 const r=id?db.modules.invoices.find(x=>String(x.id)===String(id)):null;
 const projectId=r?.project||currentProjectContext()||"",quotes=acceptedQuotesForProject(projectId);
 const selectedQuoteId=r?.quoteId||quotes.slice(-1)[0]?.id||"",selectedQuote=(db.quotes||[]).find(q=>q.id===selectedQuoteId);
 const qa=r?.quoteAmount||(selectedQuote?quoteFinancials(selectedQuote).ttc:0),pct=+r?.tranchePercent||0;
 $("#content").innerHTML=`<div class="panel"><h3>${r?"MODIFIER":"NOUVELLE"} FACTURATION</h3><form id="fInvoice" class="form-grid">
 <label>N° facture<input name="id" value="${esc(r?.id||"FAC-"+new Date().getFullYear()+"-"+String(db.modules.invoices.length+1).padStart(4,"0"))}" required></label>
 <label>Date<input name="date" type="date" value="${esc(r?.date||new Date().toISOString().slice(0,10))}" required></label>
 <label>Chantier<select name="project" required onchange="invoiceProjectChanged(this.value)"><option value="">Choisir un chantier</option>${(db.projects||[]).filter(p=>!p.deleted).map(p=>`<option value="${esc(p.id)}" ${String(projectId)===String(p.id)?"selected":""}>${esc(p.id)} — ${esc(p.name||"")}</option>`).join("")}</select></label>
 <label>Devis validé<select name="quoteId" required onchange="invoiceQuoteChanged(this.value)"><option value="">Choisir le devis accepté</option>${quotes.map(q=>`<option value="${esc(q.id)}" ${q.id===selectedQuoteId?"selected":""}>${esc(q.id)} — ${money(quoteFinancials(q).ttc)}</option>`).join("")}</select></label>
 <label>Client<input name="client" id="invoiceClient" value="${esc(r?.client||selectedQuote?.client||"")}" readonly></label>
 <label>Montant du devis validé<input name="quoteAmount" id="invoiceQuoteAmount" type="number" value="${+qa||0}" readonly></label>
 <label>Tranche de paiement (%)<input name="tranchePercent" id="invoiceTranchePercent" type="number" min="0.01" max="100" step="0.01" value="${pct||""}" oninput="recalcInvoiceForm()" required></label>
 <label>Montant de cette tranche<input name="trancheAmount" id="invoiceTrancheAmount" type="number" value="${r?.trancheAmount||((+qa||0)*pct/100)||0}" readonly></label>
 <label>Total déjà payé avant cette tranche<input id="invoiceAlreadyPaid" value="${invoicePaidForProject(projectId,r?.id||"")}" readonly></label>
 <label>Reste à payer après cette tranche<input id="invoiceRemaining" value="0" readonly></label>
 <label class="full">Observation<textarea name="note">${esc(r?.note||"")}</textarea></label>
 <div class="form-actions full"><button class="btn primary">Enregistrer</button><button type="button" class="btn secondary" onclick="invoicesPage()">Annuler</button></div></form></div>`;
 recalcInvoiceForm();
 $("#fInvoice").onsubmit=e=>{
  e.preventDefault();const f=new FormData(e.target),project=f.get("project"),quoteId=f.get("quoteId"),q=(db.quotes||[]).find(x=>x.id===quoteId);
  if(!q||q.status!=="Accepté")return alert("Le devis sélectionné doit être accepté.");
  const amount=quoteFinancials(q).ttc,pct=+f.get("tranchePercent")||0,tranche=amount*pct/100,already=invoicePaidForProject(project,r?.id||"");
  if(already+tranche>amount+0.01)return alert("Cette tranche dépasse le reste à payer.");
  const obj={id:f.get("id"),date:f.get("date"),project,quoteId,client:q.client,quoteAmount:amount,tranchePercent:pct,trancheAmount:tranche,note:f.get("note")||"",workflow:r?.workflow||"Validé",owner:r?.owner||user.username,updatedBy:user.username,updatedAt:new Date().toISOString()};
  if(r)Object.assign(r,obj);else{obj.createdAt=new Date().toISOString();db.modules.invoices.push(obj);}
  save();invoicesPage();
 };
}
function invoiceProjectChanged(projectId){
 if(projectId)sessionStorage.setItem("nysoa_project_context",projectId);else sessionStorage.removeItem("nysoa_project_context");
 invoiceForm();
}
function invoiceQuoteChanged(quoteId){
 const q=(db.quotes||[]).find(x=>x.id===quoteId);if(!q)return;
 document.getElementById("invoiceClient").value=q.client||"";
 document.getElementById("invoiceQuoteAmount").value=quoteFinancials(q).ttc;
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
 r.deleted=true;r.deletedAt=new Date().toISOString();r.deletedBy=user.username;save();invoicesPage();
}


const GENERIC_FIELDS={clients:["Nom / raison sociale","Téléphone","Adresse"],suppliers:["Fournisseur","Téléphone","Spécialité"],stock:["Article","Quantité","Unité"],employees:["Matricule","Nom complet","Fonction"],payroll:["Employé","Mois","Net à payer"],bank:["Référence","Libellé","Montant"],accounting:["Journal","Libellé","Montant"],treasury:["Libellé","Échéance","Montant"],planning:["Activité","Début","Fin"],situations:["Situation","Période","Avancement"],technicalFollowup:["Chantier","Travaux du jour","Observation"],quality:["Contrôle","Résultat","Observation"],nonConformities:["Référence","Description","Action corrective"],equipment:["Matériel / engin","État","Affectation"],vehicles:["Véhicule","Immatriculation","État"],fuel:["Véhicule / engin","Quantité (L)","Montant"],invoices:["N° facture","Client","Montant"]};
function generic(page){
 let label=(menus[user.role].find(x=>x[0]===page)||ADMIN_FINANCE_MENU.concat(ADMIN_TECH_MENU).find(x=>x[0]===page)||[])[2]||page,
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



const USAGE_IDLE_LIMIT_MS=15*60*1000;
let lastUsageActivity=Date.now();
function currentUsageSession(){
 const id=sessionStorage.getItem("nysoa_usage_session_id");
 return id?(db.usageSessions||[]).find(x=>x.id===id):null;
}
function startUsageSession(){
 if(!user||user.role==="ADMIN")return;
 db.usageSessions=Array.isArray(db.usageSessions)?db.usageSessions:[];
 let s=currentUsageSession();
 if(s&&!s.closedAt)return;
 const now=new Date().toISOString();
 s={
  id:"UTI-"+user.username+"-"+Date.now(),
  username:user.username,label:user.label,role:user.role,
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
["click","keydown","input","mousemove","touchstart","scroll"].forEach(evt=>document.addEventListener(evt,()=>{lastUsageActivity=Date.now();},{passive:true}));
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
 <div class="panel-body"><button class="btn primary" onclick="openUsageImport()">Importer temps d’utilisation</button>
 <button class="btn secondary" onclick="exportUsageCSV()">Exporter CSV</button>
 <span class="muted">Le fichier importé contient uniquement les sessions et les durées, sans achats, dépenses, chantiers ni rapports.</span></div>
 <div class="usage-summary">${Object.values(totals).map(t=>`<div class="usage-card"><b>${esc(t.label)}</b><span>${esc(t.role)}</span><strong>${secondsToDuration(t.seconds)}</strong><small>${t.count} connexion(s)</small></div>`).join("")||"<p>Aucune donnée importée.</p>"}</div>
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
 const rows=db.modules[page]||[];const before=rows.find(x=>String(x.id)===String(id));db.modules[page]=rows.filter(x=>String(x.id)!==String(id));audit("Suppression définitive","modules."+page,id,"",before,null);save();trashPage();
}
function showGenericHistory(page,id){
 const record=(db.modules[page]||[]).find(x=>String(x.id)===String(id));if(!record)return;
 const rows=record.history||[];
 $("#content").innerHTML=`<div class="panel"><h3>HISTORIQUE — ${esc(id)}</h3><div class="panel-body"><button class="btn secondary" onclick="generic('${page}')">Retour</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead><tbody>${rows.length?rows.map(h=>`<tr><td>${new Date(h.date).toLocaleString("fr-FR")}</td><td>${esc(h.user)}</td><td>${esc(h.action)}</td><td>${esc(h.details||"")}</td></tr>`).join(""):`<tr><td colspan="4">Aucun historique.</td></tr>`}</tbody></table></div></div>`;
}
