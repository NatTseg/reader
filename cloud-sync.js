// Optional account sync. Local saves work without a connection or a cloud account.
let cloudTimer, cloudBusy = false, cloudEpoch = 0, cloudConflict = null;
let cloudStatus = "Cloud sync is not connected.", cloudEnabled = false;
function cloudConfig() {
  const c = window.ORTHOBIBLE_CLOUD;
  if (!c) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(c.url) || typeof c.publishableKey !== "string") throw new Error("Cloud setup is incomplete.");
  let publicKey = c.publishableKey.startsWith("sb_publishable_");
  if (!publicKey) { try { publicKey = JSON.parse(atob(c.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role === 'anon'; } catch {} }
  if (!publicKey) throw new Error("Cloud setup requires a publishable key, never a secret or service key.");
  return {url:c.url.replace(/\/$/,""), key:c.publishableKey};
}
async function cloudRequest(path, options = {}, token) {
  const c = cloudConfig(); if (!c) throw new Error("Cloud sync has not been set up yet.");
  const response = await fetch(c.url + path, {...options, signal:AbortSignal.timeout(20000), headers:{apikey:c.key, "Content-Type":"application/json", ...(token ? {Authorization:`Bearer ${token}`} : {}), ...options.headers}});
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (data?.code === "40001") throw new Error("Another device just saved changes. Tap Sync now to try again.");
    if (response.status === 401 || response.status === 403) throw new Error("Sign in again to continue syncing. Your device saves are intact.");
    throw new Error(data?.msg || data?.message || data?.error_description || "Cloud sync failed. Your changes remain saved on this device.");
  }
  return data;
}
async function storeCloudSession(data) {
  if (!data?.access_token || !data.refresh_token || !data.user?.id || !Number.isFinite(data.expires_in)) throw new Error("The sign-in response was incomplete.");
  const session = {access_token:data.access_token, refresh_token:data.refresh_token, user:data.user.id, email:data.user.email || "", expiresAt:Date.now()+data.expires_in*1000, project:cloudConfig().url};
  await studyTransaction({cloudSession:session}); return session;
}
async function cloudSession() {
  const read = async () => {
    const session = await studyRead("cloudSession");
    if (!session || session.project !== cloudConfig()?.url) return null;
    if (session.expiresAt > Date.now()+60000) return session;
    return storeCloudSession(await cloudRequest('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})}));
  };
  return navigator.locks ? navigator.locks.request("orthobible-cloud-auth", read) : read();
}
function stableJson(value) {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJson(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function sameData(a,b) { return stableJson(a) === stableJson(b); }
function mergeSyncMap(base = {}, local = {}, remote = {}, conflicts, label) {
  const result = {};
  for (const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])) {
    const b=base[key], l=local[key], r=remote[key]; let value;
    if (sameData(l,r) || sameData(r,b)) value=l;
    else if (sameData(l,b)) value=r;
    else { conflicts.push(`${label}: ${key}`); value=l; }
    if (value !== undefined) result[key]=value;
  }
  return result;
}
function mergeCloudBackups(base, local, remote) {
  const conflicts=[];
  const baseline=base?.reader || {book:'JHN',chapter:1,scroll:0,tab:'bible',font:20,theme:'light',showNotes:true,showPreamble:true,bookmarks:[],legacySaved:[],comments:{},highlights:{},fontFamily:'serif',lineSpacing:1.85,paper:'original',readingPlan:null};
  const reader={...local.reader};
  const position = r => ({book:r.book, chapter:r.chapter, scroll:r.scroll, tab:r.tab});
  Object.assign(reader, sameData(position(local.reader),position(baseline)) ? position(remote.reader) : position(local.reader));
  for (const key of ['font','theme','showNotes','showPreamble','fontFamily','lineSpacing','paper']) if (sameData(local.reader[key],baseline[key])) reader[key]=remote.reader[key];
  for (const key of ['comments','highlights']) reader[key]=mergeSyncMap(baseline[key],local.reader[key],remote.reader[key],conflicts,key);
  for (const [key,id] of [['bookmarks',x=>`${x.book}:${x.chapter}:${x.verse}`],['legacySaved',x=>x.key]]) {
    const map = items => Object.fromEntries((items || []).map(x=>[id(x),x]));
    reader[key]=Object.values(mergeSyncMap(map(baseline[key]),map(local.reader[key]),map(remote.reader[key]),conflicts,key));
  }
  reader.history=[...local.reader.history||[],...remote.reader.history||[]].sort((a,b)=>b.ts-a.ts).filter((x,i,all)=>all.findIndex(y=>y.book===x.book&&y.chapter===x.chapter)===i).slice(0,50);
  if (sameData(local.reader.readingPlan,baseline.readingPlan)) reader.readingPlan=remote.reader.readingPlan;
  else if (local.reader.readingPlan && remote.reader.readingPlan && local.reader.readingPlan.id===remote.reader.readingPlan.id) {
    const indexed = p => Object.fromEntries((p?.completed || []).map(n=>[n,true]));
    const days=mergeSyncMap(indexed(baseline.readingPlan),indexed(local.reader.readingPlan),indexed(remote.reader.readingPlan),conflicts,'Reading plan');
    reader.readingPlan={id:local.reader.readingPlan.id,completed:Object.keys(days).map(Number)};
  } else if (!sameData(remote.reader.readingPlan,baseline.readingPlan) && !sameData(local.reader.readingPlan,remote.reader.readingPlan)) conflicts.push('Reading plan');
  // Completed readings combine across devices; a memory verse keeps the copy with more reviews.
  const doneDays=new Set([...Object.keys(local.reader.today?.done||{}),...Object.keys(remote.reader.today?.done||{})]);
  reader.today={done:Object.fromEntries([...doneDays].map(day=>[day,[...new Set([...(local.reader.today?.done?.[day]||[]),...(remote.reader.today?.done?.[day]||[])])]]))};
  const memory=new Map();
  for (const item of [...remote.reader.memory||[],...local.reader.memory||[]]) if (!memory.has(item.id) || (item.reviews||0)>=(memory.get(item.id).reviews||0)) memory.set(item.id,item);
  const removed=id=>(baseline.memory||[]).some(x=>x.id===id) && (!(local.reader.memory||[]).some(x=>x.id===id) || !(remote.reader.memory||[]).some(x=>x.id===id));
  reader.memory=[...memory.values()].filter(item=>!removed(item.id));
  const b=base?.personal || null,l=local.personal,r=remote.personal;
  let personal;
  if (sameData(l,r) || sameData(r,b)) personal=l;
  else if (sameData(l,b)) personal=r;
  else if (l && r) {
    personal={};
    for (const key of ['notes','preambles','introductions','sourceNotes']) personal[key]=mergeSyncMap(b?.[key],l[key],r[key],conflicts,key);
    const guides = p=>Object.fromEntries((p?.guides || []).map(g=>[g.title,g]));
    if (l.alignment || r.alignment) {
      personal.alignment={edition:window.BIBLE.edition,version:1};
      for(const key of ['notes','verses','candidates','evidence']) personal.alignment[key]=mergeSyncMap(b?.alignment?.[key],l.alignment?.[key],r.alignment?.[key],conflicts,'Verse links');
    } else personal.alignment=null;
    personal.guides=Object.values(mergeSyncMap(guides(b),guides(l),guides(r),conflicts,'guides'));
  } else { conflicts.push('Imported study material'); personal=l; }
  return {backup:validateBackup({...local, reader, personal}), conflicts};
}
function cloudMetaKey(session) { return `cloudBase:${session.project}:${session.user}`; }
async function fetchCloudSnapshot(session, meta, local) {
  const query = `/rest/v1/orthobible_sync?user_id=eq.${encodeURIComponent(session.user)}`;
  const rows = await cloudRequest(query+'&select=revision,study_revision,reader', {}, session.access_token);
  const row = rows?.[0]; if (!row) return {revision:0, studyRevision:0, backup:null};
  let personal;
  if (meta?.studyRevision === row.study_revision && meta?.base) personal=meta.base.personal;
  else {
    const content = await cloudRequest(query+`&revision=eq.${row.revision}&select=personal`, {}, session.access_token);
    if (!content?.[0]) throw new Error("Another device is syncing. Try again in a moment.");
    personal=content[0].personal.data;
  }
  return {revision:row.revision, studyRevision:row.study_revision, backup:validateBackup({...local, reader:row.reader, personal})};
}
function updateCloudLabel() { const el=$("cloudStatus"); if (el) el.textContent=cloudStatus; }
function queueCloudSync() {
  if (!cloudEnabled || cloudBusy || persistenceBusy || cloudConflict) return;
  clearTimeout(cloudTimer); cloudTimer=setTimeout(()=>syncCloud(),5000);
}
async function syncCloud(resolution) {
  if (cloudBusy || persistenceBusy || !cloudEnabled) return;
  if (navigator.onLine === false) { cloudStatus="Offline. Changes are saved here and will sync when you reconnect."; updateCloudLabel(); return; }
  cloudBusy=true;
  const epoch=cloudEpoch;
  try {
    cloudStatus="Syncing…"; updateCloudLabel();
    const session=await cloudSession(); if (!session) { cloudEnabled=false; throw new Error("Sign in to enable cloud sync."); }
    const meta=await studyRead(cloudMetaKey(session));
    const local=await createBackup();
    const remote=await fetchCloudSnapshot(session,meta,local);
    if (epoch !== cloudEpoch) return;
    let merged=remote.backup ? mergeCloudBackups(meta?.base,local,remote.backup) : {backup:local,conflicts:[]};
    if (resolution && cloudConflict && cloudConflict.revision === remote.revision) {
      merged={backup:resolution==='device' ? local : remote.backup, conflicts:[]};
    }
    if (merged.conflicts.length) {
      cloudConflict={...remote, conflicts:merged.conflicts};
      cloudStatus=`Sync paused: ${merged.conflicts.length} conflicting change${merged.conflicts.length===1?'':'s'}. Open Cloud sync to review.`;
      updateCloudLabel(); const button=$("resolveCloud"); if(button) button.hidden=false;
      return;
    }
    // If the reader changed while the network request ran, retry with fresh local data.
    const current=await createBackup();
    if (!sameData({reader:current.reader,personal:current.personal},{reader:local.reader,personal:local.personal})) { cloudStatus="New device changes are queued for sync."; return; }
    const candidate=merged.backup;
    const changed=!remote.backup || !sameData({reader:candidate.reader,personal:candidate.personal},{reader:remote.backup.reader,personal:remote.backup.personal});
    let versions={revision:remote.revision,study_revision:remote.studyRevision};
    if (changed) {
      if (remote.backup) await studyTransaction({cloudRecovery:remote.backup});
      if (epoch !== cloudEpoch) return;
      versions=await cloudRequest('/rest/v1/rpc/save_orthobible',{method:'POST',body:JSON.stringify({expected_revision:remote.revision,next_reader:candidate.reader,next_personal:!remote.backup || !sameData(candidate.personal,remote.backup.personal) ? {data:candidate.personal} : null})},session.access_token);
    }
    if (epoch !== cloudEpoch) return;
    // Do not replace edits made while an upload was in flight. They will be merged next time.
    const latest=await createBackup();
    if (!sameData({reader:latest.reader,personal:latest.personal},{reader:local.reader,personal:local.personal})) {
      // Keep the old merge base until the merged snapshot reaches this device.
      // Advancing it here would mistake unapplied remote additions for local deletions.
      cloudStatus="Cloud copy saved. Newer device changes are queued."; return;
    }
    if (!sameData({reader:candidate.reader,personal:candidate.personal},{reader:local.reader,personal:local.personal})) await restoreBackup(candidate);
    await studyTransaction({[cloudMetaKey(session)]:{revision:versions.revision,studyRevision:versions.study_revision,base:candidate}, lastCloudSync:new Date().toISOString()});
    cloudConflict=null;
    cloudStatus=`Synced at ${new Date().toLocaleTimeString()}. Your changes are saved on this device and in your private account.`;
  } catch(error) { cloudStatus=error.message || "Sync paused. Your changes remain saved on this device."; }
  finally { cloudBusy=false; updateCloudLabel(); if (cloudStatus.includes("queued")) queueCloudSync(); }
}
async function initializeCloudSync() {
  try {
    if (!cloudConfig()) return;
    const session=await studyRead("cloudSession");
    cloudEnabled=!!session && session.project===cloudConfig().url;
    if (cloudEnabled) { cloudStatus="Saved changes are waiting to sync."; queueCloudSync(); }
  } catch(error) { cloudStatus=error.message; }
  window.addEventListener('online',queueCloudSync);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueCloudSync()});
  setInterval(()=>{if(cloudEnabled && !cloudConflict && document.visibilityState==='visible') syncCloud()},60000);
}
function showCloudConflict() {
  if (!cloudConflict) return;
  const parent=captureSwipeView(dialog);
  openDialog("Review sync conflict", `<button class="text-button" id="cloudBack">‹ Cloud sync</button><p>Both devices changed the same saved data. Nothing has been overwritten.</p><p class="helper">${esc(cloudConflict.conflicts.slice(0,12).join(' · '))}</p><p>Cloud copy: ${esc(backupCounts(cloudConflict.backup))}</p><p class="helper">Choose which complete version to keep. A recovery copy is saved on this device before replacement.</p><div class="storage-actions"><button class="secondary" id="keepDevice">Keep this device’s version</button><button class="secondary" id="keepCloud">Use the cloud version</button></div>`);
  dialogBack=showCloudSync; dialogBackSnapshot=parent; $("cloudBack").onclick=showCloudSync;
  for (const [id,resolution] of [['keepDevice','device'],['keepCloud','cloud']]) $(id).onclick=async()=>{ $("keepDevice").disabled=true; $("keepCloud").disabled=true; await syncCloud(resolution); showCloudSync(); };
}
function showCloudSync() {
  const parent=captureSwipeView(dialog);
  let configured=false; try { configured=!!cloudConfig(); } catch(error) { cloudStatus=error.message; }
  openDialog("Cloud sync", `<button class="text-button" id="cloudBack">‹ Reading settings</button><p id="cloudStatus" role="status">${esc(cloudStatus)}</p>${!configured ? '<p>Cloud sync needs a one-time backend setup. Device storage and backup files are available now.</p>' : cloudEnabled ? '<div class="storage-actions"><button class="primary" id="syncNow">Sync now</button><button class="secondary" id="disconnectCloud">Disconnect this device</button></div><button class="text-button" id="resolveCloud" '+(cloudConflict?'':'hidden')+'>Review conflicting changes</button><button class="text-button" id="cloudRecovery">Restore the previous cloud copy</button>' : '<form id="cloudLogin"><label for="cloudEmail">Email</label><input id="cloudEmail" type="email" autocomplete="username" required><label for="cloudPassword">Password</label><input id="cloudPassword" type="password" autocomplete="current-password" required><p class="helper">Use your private sync account. Signing in enables syncing of saved verses, comments, reading progress, settings, and imported OSB material. Your password is not saved on this device.</p><button class="primary" type="submit">Sign in &amp; enable sync</button></form>'}`);
  dialogBack=showSettings; dialogBackSnapshot=parent; $("cloudBack").onclick=showSettings;
  if (!configured) return;
  if (!cloudEnabled) $("cloudLogin").onsubmit=async event=>{
    event.preventDefault(); const button=event.target.querySelector('button'); button.disabled=true;
    const email=$("cloudEmail").value.trim(), password=$("cloudPassword").value; $("cloudPassword").value="";
    try { await storeCloudSession(await cloudRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})})); cloudEnabled=true; cloudEpoch++; cloudConflict=null; showCloudSync(); await syncCloud(); }
    catch(error) { cloudStatus=error.message; updateCloudLabel(); button.disabled=false; }
  };
  else {
    $("syncNow").onclick=()=>syncCloud();
    $("resolveCloud").onclick=showCloudConflict;
    $("cloudRecovery").onclick=async()=>{try{const backup=await studyRead('cloudRecovery');if(backup)showRestorePreview(validateBackup(backup));else notify('No previous cloud copy is stored on this device yet.');}catch(error){notify(error.message)}};
    $("disconnectCloud").onclick=async()=>{
      cloudEpoch++;cloudEnabled=false;cloudConflict=null;clearTimeout(cloudTimer);
      await studyTransaction({cloudSession:null});
      cloudStatus="Disconnected. Device saves and the cloud copy are still available.";showCloudSync();
    };
  }
}
