/* =========================================================
   storage.js
   Capa compartida de almacenamiento y utilidades.
   Se usa tanto en index.html (login) como en app.html (app).
========================================================= */

function claudeStorageAvailable(){
  try{ return typeof window.storage !== 'undefined' && window.storage !== null; }catch(e){ return false; }
}

/* ---- Config local del dispositivo (no depende de shared) ---- */
async function localConfigGet(key){
  if(claudeStorageAvailable()){
    try{ const r = await window.storage.get(key, false); if(r) return r.value; }catch(e){}
  }
  try{ return localStorage.getItem('wilkslocal:'+key); }catch(e){ return null; }
}
async function localConfigSet(key, value){
  if(claudeStorageAvailable()){
    try{ const r = await window.storage.set(key, value, false); if(r) return r; }catch(e){}
  }
  try{ localStorage.setItem('wilkslocal:'+key, value); return true; }catch(e){ return null; }
}
async function localConfigDelete(key){
  if(claudeStorageAvailable()){
    try{ const r = await window.storage.delete(key, false); if(r) return r; }catch(e){}
  }
  try{ localStorage.removeItem('wilkslocal:'+key); return true; }catch(e){ return null; }
}

/* ---- Almacenamiento clave/valor genérico (modo local, sin GitHub) ---- */
async function storageGet(key, shared=false){
  if(claudeStorageAvailable()){
    try{ const r = await window.storage.get(key, shared); if(r) return r.value; return null; }catch(e){}
  }
  try{ return localStorage.getItem('wilkslocal:'+key); }catch(e){ return null; }
}
async function storageSet(key, value, shared=false){
  if(claudeStorageAvailable()){
    try{ const r = await window.storage.set(key, value, shared); if(r) return r; }catch(e){}
  }
  try{ localStorage.setItem('wilkslocal:'+key, value); return {key,value}; }catch(e){ return null; }
}
async function storageDeleteKey(key, shared=false){
  if(claudeStorageAvailable()){
    try{ const r = await window.storage.delete(key, shared); if(r) return r; }catch(e){}
  }
  try{ localStorage.removeItem('wilkslocal:'+key); return true; }catch(e){ return null; }
}
async function storageListKeys(prefix, shared=false){
  if(claudeStorageAvailable()){
    try{ const r = await window.storage.list(prefix, shared); if(r) return r.keys; }catch(e){}
  }
  try{
    const keys = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.indexOf('wilkslocal:'+prefix)===0){ keys.push(k.replace('wilkslocal:','')); }
    }
    return keys;
  }catch(e){ return []; }
}

/* ---- Sesión persistente (se mantiene hasta cerrar sesión manualmente) ---- */
const SESSION_KEY = 'wilks:session';
async function getSession(){
  const raw = await localConfigGet(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}
async function setSession(username){
  await localConfigSet(SESSION_KEY, JSON.stringify({ username, since: new Date().toISOString() }));
}
async function clearSession(){ await localConfigDelete(SESSION_KEY); }

/* ---- Base64 UTF-8 ---- */
function utf8ToB64(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b=>{ bin += String.fromCharCode(b); });
  return btoa(bin);
}
function b64ToUtf8(b64){
  const bin = atob(b64.replace(/\n/g,''));
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++){ bytes[i] = bin.charCodeAt(i); }
  return new TextDecoder().decode(bytes);
}

/* ---- Hash de contraseña (SHA-256) y reglas de seguridad ---- */
async function hashPassword(pw){
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function passwordRuleResults(pw){
  return { len: pw.length>=8, upper: /[A-Z]/.test(pw), lower: /[a-z]/.test(pw), num: /[0-9]/.test(pw), special: /[^A-Za-z0-9]/.test(pw) };
}

/* =========================================================
   GITHUB: almacenamiento en varias colecciones (archivos JSON)
   data/accounts.json  -> cuentas (sin fotos/vídeos)
   data/media.json     -> fotos de perfil, progreso y entrenamientos
   data/ranking.json   -> ranking de Wilks/DOTS
   data/exercises.json -> categorías de ejercicios creadas por usuarios
   data/social.json    -> apoyos y comentarios de perfiles públicos
========================================================= */
let githubConfig = null;
let lastSyncTime = null;
const COLLECTION_NAMES = ['accounts','media','ranking','exercises','social'];

function isGithubMode(){ return !!(githubConfig && githubConfig.owner && githubConfig.repo && githubConfig.token); }

async function loadGithubConfigFromStorage(){
  const raw = await localConfigGet('wilks:github-config');
  githubConfig = raw ? JSON.parse(raw) : null;
}
async function saveGithubConfigToStorage(cfg){
  githubConfig = cfg;
  await localConfigSet('wilks:github-config', JSON.stringify(cfg));
}
async function clearGithubConfig(){
  githubConfig = null;
  await localConfigDelete('wilks:github-config');
}

function ghHeaders(){
  return { 'Authorization': `Bearer ${githubConfig.token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}
function ghCollectionPath(name){
  let base = githubConfig.basePath || 'data/';
  if(!base.endsWith('/')) base += '/';
  return base + name + '.json';
}
function ghCollectionUrl(name){
  return `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${ghCollectionPath(name)}`;
}
async function ghFetchCollection(name, defaultObj){
  const url = `${ghCollectionUrl(name)}?ref=${encodeURIComponent(githubConfig.branch||'main')}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if(res.status===404){ return { content: JSON.parse(JSON.stringify(defaultObj||{})), sha: null }; }
  if(!res.ok){ throw new Error(`GitHub respondió ${res.status} al leer ${name}.json`); }
  const data = await res.json();
  const decoded = b64ToUtf8(data.content);
  let parsed;
  try{ parsed = JSON.parse(decoded); }catch(e){ parsed = JSON.parse(JSON.stringify(defaultObj||{})); }
  return { content: parsed, sha: data.sha };
}
async function ghWriteCollection(name, obj, sha, message){
  const body = { message: message || `Actualizar ${name}.json`, content: utf8ToB64(JSON.stringify(obj, null, 2)), branch: githubConfig.branch || 'main' };
  if(sha) body.sha = sha;
  const res = await fetch(ghCollectionUrl(name), { method:'PUT', headers: { ...ghHeaders(), 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if(res.status===409) return null;
  if(!res.ok){ throw new Error(`GitHub respondió ${res.status} al guardar ${name}.json`); }
  return await res.json();
}
async function collectionFetchFresh(name, defaultObj={}){
  const { content } = await ghFetchCollection(name, defaultObj);
  lastSyncTime = new Date();
  return content;
}
async function collectionUpdate(name, mutatorFn, message, defaultObj={}){
  for(let attempt=0; attempt<4; attempt++){
    const { content, sha } = await ghFetchCollection(name, defaultObj);
    mutatorFn(content);
    const result = await ghWriteCollection(name, content, sha, message);
    if(result){ lastSyncTime = new Date(); return content; }
  }
  throw new Error(`No se pudo guardar ${name}.json tras varios intentos (posible conflicto de escritura). Inténtalo de nuevo.`);
}

/* =========================================================
   ICONOS, TOASTS Y UTILIDADES DE UI COMPARTIDAS
========================================================= */
const ICONS = {
  check:'<polyline points="20 6 9 17 4 12"></polyline>',
  alert:'<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
  award:'<circle cx="12" cy="8" r="6"></circle><path d="M9 14l-2 7 5-3 5 3-2-7"></path>',
  trash:'<polyline points="3 6 5 6 21 6"></polyline><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>',
  up:'<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>',
  down:'<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>',
  flat:'<line x1="5" y1="12" x2="19" y2="12"></line>',
  droplet:'<path d="M12 2s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12Z"></path>',
  user:'<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"></path><circle cx="12" cy="13" r="4"></circle>',
  upload:'<path d="M12 21V9"></path><polyline points="7 13 12 8 17 13"></polyline><path d="M5 20h14"></path>',
  link:'<path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5"></path><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19"></path>',
};
function icon(name, size=15){
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;
}
function toast(msg, type='info', ms=3600){
  const wrap = document.getElementById('toastWrap');
  if(!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type==='error' ? ' error' : '');
  el.innerHTML = icon(type==='error' ? 'alert' : 'check') + `<span>${escapeHTML(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(()=>{ el.remove(); }, ms);
}
function escapeHTML(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function todayStr(){ return new Date().toISOString().slice(0,10); }
function applyTheme(theme){ document.body.classList.toggle('theme-light', theme==='light'); }
function safeHostname(url){ try{ return new URL(url).hostname.replace(/^www\./,''); }catch(e){ return url; } }

/* =========================================================
   ARCHIVOS: imágenes y vídeos (compresión, límites)
========================================================= */
const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // límite práctico para vídeo embebido en la base de datos compartida
const MAX_RECORD_SECONDS = 180; // 3 minutos

function resizeImageFile(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxDim){ h = Math.round(h*maxDim/w); w = maxDim; } }
        else{ if(h>maxDim){ w = Math.round(w*maxDim/h); h = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=>reject(new Error('No se pudo leer la imagen.'));
      img.src = e.target.result;
    };
    reader.onerror = ()=>reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}
function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

/* =========================================================
   MODELOS POR DEFECTO Y CAPA DE DATOS DE CUENTA
   (compartido entre index.html y app.html)
========================================================= */
function defaultPlateInventory(){
  return {
    "25":{enabled:true,count:''}, "20":{enabled:true,count:''}, "15":{enabled:true,count:''},
    "10":{enabled:true,count:''}, "5":{enabled:true,count:''}, "2.5":{enabled:true,count:''},
    "1.25":{enabled:true,count:''}, "0.5":{enabled:false,count:''}
  };
}
function defaultAccount(passwordHash){
  return {
    password: passwordHash,
    history: [], workouts: [], measurements: [], goals: [],
    nutrition: [], steps: [], sleep: [], waterLog: [],
    routineTemplates: [], workoutSessions: [],
    challenges: { dailyCompletions: {}, levels: {} }, customChallenges: [],
    settings: { plateInventory: defaultPlateInventory(), kcalGoal:2200, stepsGoal:10000, waterServingMl:250, waterGoalMl:2000 },
    profile: { age:null, heightCm:null, weightKg:null, bio:'', isPublic:true },
    theme: 'dark',
    createdAt: new Date().toISOString()
  };
}
function defaultMediaStore(){ return { avatar: null, progressPhotos: [], workoutMedia: {} }; }
function ensureAccountShape(acc){
  acc.history = acc.history || [];
  acc.workouts = acc.workouts || [];
  acc.measurements = acc.measurements || [];
  acc.goals = acc.goals || [];
  acc.nutrition = acc.nutrition || [];
  acc.steps = acc.steps || [];
  acc.sleep = acc.sleep || [];
  acc.routineTemplates = acc.routineTemplates || [];
  acc.workoutSessions = acc.workoutSessions || [];
  acc.customChallenges = acc.customChallenges || [];
  acc.challenges = acc.challenges || {};
  acc.challenges.dailyCompletions = acc.challenges.dailyCompletions || {};
  acc.challenges.levels = acc.challenges.levels || {};
  if(!acc.waterLog){
    acc.waterLog = (acc.water && acc.water.date) ? [{ date: acc.water.date, count: acc.water.count || 0 }] : [];
  }
  delete acc.water;
  acc.settings = acc.settings || {};
  acc.settings.plateInventory = acc.settings.plateInventory || defaultPlateInventory();
  acc.settings.kcalGoal = acc.settings.kcalGoal || 2200;
  acc.settings.stepsGoal = acc.settings.stepsGoal || 10000;
  acc.settings.waterServingMl = acc.settings.waterServingMl || 250;
  acc.settings.waterGoalMl = acc.settings.waterGoalMl || 2000;
  acc.profile = acc.profile || {};
  acc.profile.isPublic = acc.profile.isPublic !== false;
  return acc;
}

async function accountExists(username){
  if(isGithubMode()){ const col = await collectionFetchFresh('accounts', {}); return !!col[username]; }
  const raw = await storageGet(`wilks:account:${username}`, false);
  return !!raw;
}
async function fetchAccount(username){
  if(isGithubMode()){ const col = await collectionFetchFresh('accounts', {}); return col[username] || null; }
  const raw = await storageGet(`wilks:account:${username}`, false);
  return raw ? JSON.parse(raw) : null;
}
async function createAccount(username, accountObj){
  if(isGithubMode()){ await collectionUpdate('accounts', col=>{ col[username] = accountObj; }, `Crear cuenta: ${username}`, {}); }
  else{ await storageSet(`wilks:account:${username}`, JSON.stringify(accountObj), false); }
}
async function persistAccountObj(username, accountObj){
  if(isGithubMode()){ await collectionUpdate('accounts', col=>{ col[username] = accountObj; }, `Actualizar datos de ${username}`, {}); }
  else{
    const r = await storageSet(`wilks:account:${username}`, JSON.stringify(accountObj), false);
    if(!r) throw new Error('No se pudo guardar en el almacenamiento local del navegador.');
  }
}
async function removeAccountData(username){
  if(isGithubMode()){
    await collectionUpdate('accounts', col=>{ delete col[username]; }, `Borrar cuenta: ${username}`, {});
    await collectionUpdate('media', col=>{ delete col[username]; }, `Borrar media de: ${username}`, {});
    await collectionUpdate('ranking', col=>{ delete col[username]; }, `Borrar ranking de: ${username}`, {});
    await collectionUpdate('social', col=>{ delete col[username]; }, `Borrar social de: ${username}`, {});
  } else {
    await storageDeleteKey(`wilks:account:${username}`, false);
    await storageDeleteKey(`wilks:media:${username}`, false);
    await storageDeleteKey(`wilks:ranking:${username}`, true);
    await storageDeleteKey(`wilks:social:${username}`, true);
  }
}
async function wipeAllAccounts(){
  if(isGithubMode()){
    for(const name of ['accounts','media','ranking','social']){
      await collectionUpdate(name, col=>{ Object.keys(col).forEach(k=>delete col[k]); }, `Borrar todo: ${name}.json`, {});
    }
  } else {
    for(const prefix of ['wilks:account:','wilks:media:']){
      const keys = await storageListKeys(prefix, false);
      for(const k of keys){ await storageDeleteKey(k, false); }
    }
    for(const prefix of ['wilks:ranking:','wilks:social:']){
      const keys = await storageListKeys(prefix, true);
      for(const k of keys){ await storageDeleteKey(k, true); }
    }
  }
}
async function fetchAllAccountsMap(){
  if(isGithubMode()){ return await collectionFetchFresh('accounts', {}); }
  const map = {};
  const keys = await storageListKeys('wilks:account:', false);
  for(const k of keys){
    const raw = await storageGet(k, false);
    if(raw){ try{ map[k.replace('wilks:account:','')] = JSON.parse(raw); }catch(e){} }
  }
  return map;
}
async function fetchAllMediaMap(){
  if(isGithubMode()){ return await collectionFetchFresh('media', {}); }
  const map = {};
  const keys = await storageListKeys('wilks:media:', false);
  for(const k of keys){
    const raw = await storageGet(k, false);
    if(raw){ try{ map[k.replace('wilks:media:','')] = JSON.parse(raw); }catch(e){} }
  }
  return map;
}
async function fetchMediaStoreFor(username){
  if(isGithubMode()){ const col = await collectionFetchFresh('media', {}); return col[username] ? { ...defaultMediaStore(), ...col[username] } : defaultMediaStore(); }
  const raw = await storageGet(`wilks:media:${username}`, false);
  return raw ? { ...defaultMediaStore(), ...JSON.parse(raw) } : defaultMediaStore();
}
async function persistMediaStoreFor(username, store){
  if(isGithubMode()){ await collectionUpdate('media', col=>{ col[username] = store; }, `Actualizar media de ${username}`, {}); }
  else{ await storageSet(`wilks:media:${username}`, JSON.stringify(store), false); }
}
async function listAllAccountSummaries(){
  const accountsMap = await fetchAllAccountsMap();
  const mediaMap = await fetchAllMediaMap();
  return Object.keys(accountsMap).map(u=>{
    const a = accountsMap[u];
    const m = mediaMap[u] || {};
    const bestWilks = (a.history||[]).reduce((mx,h)=>Math.max(mx,h.wilksScore),0);
    return { username:u, createdAt:a.createdAt, workouts:(a.workouts||[]).length, bestWilks, avatar: m.avatar||null };
  });
}

/* ---- Ranking ---- */
async function persistRanking(username, rankObj){
  if(isGithubMode()){ await collectionUpdate('ranking', col=>{ col[username] = rankObj; }, `Actualizar ranking de ${username}`, {}); }
  else{ await storageSet(`wilks:ranking:${username}`, JSON.stringify(rankObj), true); }
}
async function fetchRankingList(){
  if(isGithubMode()){ const col = await collectionFetchFresh('ranking', {}); return Object.values(col); }
  const keys = await storageListKeys('wilks:ranking:', true);
  const arr = [];
  for(const k of keys){ const raw = await storageGet(k, true); if(raw){ try{ arr.push(JSON.parse(raw)); }catch(e){} } }
  return arr;
}

/* ---- Registro compartido de ejercicios (categorías creadas por usuarios) ---- */
function normalizeExerciseKey(str){ return (str||'').trim().toLowerCase().replace(/\s+/g,' '); }
async function getExerciseRegistry(){
  if(isGithubMode()){ return await collectionFetchFresh('exercises', {}); }
  const raw = await storageGet('wilks:exercises', true);
  return raw ? JSON.parse(raw) : {};
}
async function registerExerciseIfNew(label, byUser){
  const key = normalizeExerciseKey(label);
  if(!key) return key;
  if(isGithubMode()){
    await collectionUpdate('exercises', col=>{
      if(!col[key]){ col[key] = { label: label.trim(), addedBy: byUser, addedAt: new Date().toISOString() }; }
    }, `Registrar ejercicio: ${label}`, {});
  } else {
    const registry = await getExerciseRegistry();
    if(!registry[key]){
      registry[key] = { label: label.trim(), addedBy: byUser, addedAt: new Date().toISOString() };
      await storageSet('wilks:exercises', JSON.stringify(registry), true);
    }
  }
  return key;
}

/* ---- Social: apoyos y comentarios de perfiles públicos ---- */
function defaultSocial(){ return { kudos: 0, kudosBy: [], comments: [] }; }
async function fetchSocial(username){
  if(isGithubMode()){ const col = await collectionFetchFresh('social', {}); return col[username] ? { ...defaultSocial(), ...col[username] } : defaultSocial(); }
  const raw = await storageGet(`wilks:social:${username}`, true);
  return raw ? { ...defaultSocial(), ...JSON.parse(raw) } : defaultSocial();
}
async function toggleKudos(username, byUser){
  if(isGithubMode()){
    await collectionUpdate('social', col=>{
      col[username] = col[username] || defaultSocial();
      col[username].kudosBy = col[username].kudosBy || [];
      const idx = col[username].kudosBy.indexOf(byUser);
      if(idx>=0){ col[username].kudosBy.splice(idx,1); col[username].kudos = Math.max(0,(col[username].kudos||0)-1); }
      else{ col[username].kudosBy.push(byUser); col[username].kudos = (col[username].kudos||0)+1; }
    }, `Actualizar apoyo a ${username}`, {});
  } else {
    const social = await fetchSocial(username);
    const idx = social.kudosBy.indexOf(byUser);
    if(idx>=0){ social.kudosBy.splice(idx,1); social.kudos = Math.max(0, social.kudos-1); }
    else{ social.kudosBy.push(byUser); social.kudos = (social.kudos||0)+1; }
    await storageSet(`wilks:social:${username}`, JSON.stringify(social), true);
  }
}
async function addSocialComment(username, fromUser, text){
  const comment = { id: Date.now(), from: fromUser, text, date: new Date().toLocaleString('es-ES') };
  if(isGithubMode()){
    await collectionUpdate('social', col=>{
      col[username] = col[username] || defaultSocial();
      col[username].comments = col[username].comments || [];
      col[username].comments.push(comment);
    }, `Nuevo comentario para ${username}`, {});
  } else {
    const social = await fetchSocial(username);
    social.comments = social.comments || [];
    social.comments.push(comment);
    await storageSet(`wilks:social:${username}`, JSON.stringify(social), true);
  }
}