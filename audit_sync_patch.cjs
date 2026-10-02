const fs=require('fs');
const path=process.argv[2]||'app.js';
const s=fs.readFileSync(path,'utf8');
const checks=[
 ['pending queue durable', 'nysoa_cloud_pending_mutations_v2'],
 ['immediate write', 'async function cloudWriteImmediate'],
 ['queue flush', 'async function flushCloudMutationQueue'],
 ['dirty mutation detector', 'function collectDirtyLocalMutations'],
 ['save immediate mutation', 'dirty.forEach(({collection,record})=>cloudWriteImmediate(collection,record))'],
 ['resume sync', 'flushCloudMutationQueue("retour-ecran")'],
 ['reconnect sync', 'cloudAutoSyncAll("reconnexion-securite")'],
 ['delete queue', 'queueCloudDelete(collection,id'],
 ['siteControl delete timestamp', 'r.updatedAt=r.deletedAt;r.updatedBy=user.username'],
 ['siteControl validation timestamp', 'r.updatedAt=r.validatedAt;r.updatedBy=user.username']
];
let fail=0;
for(const [name,needle] of checks){
 const ok=s.includes(needle);
 console.log(`${ok?'OK  ':'FAIL'} ${name}`);
 if(!ok)fail++;
}
if(fail){console.error(`\n${fail} contrôle(s) en échec.`);process.exit(1)}
console.log('\nPatch sync/mutation: contrôles statiques OK.');
