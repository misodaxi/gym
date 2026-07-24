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
   data/posts.json     -> publicaciones del feed de la comunidad
   data/messages.json  -> mensajes directos entre usuarios
   data/notifications.json -> notificaciones de actividad por usuario
========================================================= */
let githubConfig = null;
let lastSyncTime = null;
const COLLECTION_NAMES = ['accounts','media','ranking','exercises','social','posts','messages','notifications','stories'];

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
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"></path>',
  comment:'<path d="M21 11.5a8.4 8.4 0 0 1-8.8 8.4 8.9 8.9 0 0 1-3.6-.7L3 21l1.8-5.4A8.4 8.4 0 1 1 21 11.5Z"></path>',
  share:'<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"></line><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"></line>',
  send:'<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>',
  message:'<path d="M21 11.5a8.4 8.4 0 0 1-8.8 8.4 8.9 8.9 0 0 1-3.6-.7L3 21l1.8-5.4A8.4 8.4 0 1 1 21 11.5Z"></path>',
  dots:'<circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.6"></circle><path d="M21 15l-5-5L5 21"></path>',
  bookmark:'<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"></path>',
  'rank-bronze':'<path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"></path>',
  'rank-silver':'<path d="M12 2 14.7 8.6 22 9.3l-5.5 4.7L18.2 21 12 17.3 5.8 21l1.7-7-5.5-4.7 7.3-.7Z"></path>',
  'rank-gold':'<circle cx="12" cy="9" r="6"></circle><path d="M8.5 14 5 22 12 18 19 22 15.5 14Z"></path>',
  'rank-platinum':'<path d="M12 4 22 15 16 15 16 20 8 20 8 15 2 15Z"></path>',
  'rank-diamond':'<path d="M6 3h12l4 6-10 12L2 9Z"></path>',
  'rank-legend':'<path d="M3 8 7 11 12 5 17 11 21 8 19 19 5 19Z"></path>',
};
function icon(name, size=15){
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;
}
function iconFilled(name, size=15){
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="none">${ICONS[name]||''}</svg>`;
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
    routineTemplates: [], workoutSessions: [], savedPosts: [], trainingPlans: [],
    challenges: { dailyCompletions: {}, levels: {} }, customChallenges: [],
    settings: { plateInventory: defaultPlateInventory(), kcalGoal:2200, stepsGoal:10000, waterServingMl:250, waterGoalMl:2000,
      accessibility: { fontScale:'normal', highContrast:false, reduceMotion:false, largeTargets:false } },
    profile: { age:null, heightCm:null, weightKg:null, bio:'', isPublic:true },
    theme: 'dark',
    createdAt: new Date().toISOString()
  };
}
function defaultMediaStore(){ return { avatar: null, cover: null, progressPhotos: [], workoutMedia: {} }; }
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
  acc.savedPosts = acc.savedPosts || [];
  acc.trainingPlans = acc.trainingPlans || [];
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
  acc.settings.accessibility = acc.settings.accessibility || {};
  acc.settings.accessibility.fontScale = acc.settings.accessibility.fontScale || 'normal';
  acc.settings.accessibility.highContrast = !!acc.settings.accessibility.highContrast;
  acc.settings.accessibility.reduceMotion = !!acc.settings.accessibility.reduceMotion;
  acc.settings.accessibility.largeTargets = !!acc.settings.accessibility.largeTargets;
  acc.profile = acc.profile || {};
  acc.profile.isPublic = acc.profile.isPublic !== false;
  acc.profile.gender = acc.profile.gender || 'male';
  acc.profile.publicFields = acc.profile.publicFields || {};
  const pf = acc.profile.publicFields;
  ['age','height','weight','bio','wilks','workoutCount','streak','rank','bodyMap'].forEach(k=>{
    if(pf[k]===undefined) pf[k] = true;
  });
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
/* ---- Fusión de cambios entre dispositivos al guardar una cuenta ----
   Evita que un dispositivo sobrescriba por completo los datos guardados
   por otro dispositivo desde el último guardado (p. ej. entrenamientos
   registrados en el móvil mientras se editaba el perfil en el ordenador). */
function mergeArrayField(remoteArr, localArr, keyField){
  remoteArr = Array.isArray(remoteArr) ? remoteArr : [];
  localArr = Array.isArray(localArr) ? localArr : [];
  if(keyField){
    const map = new Map();
    remoteArr.forEach(item=>{ if(item && item[keyField]!=null) map.set(item[keyField], item); });
    localArr.forEach(item=>{ if(item && item[keyField]!=null) map.set(item[keyField], item); });
    return Array.from(map.values());
  }
  const seen = new Set();
  const merged = [];
  [...remoteArr, ...localArr].forEach(item=>{
    const sig = JSON.stringify(item);
    if(!seen.has(sig)){ seen.add(sig); merged.push(item); }
  });
  return merged;
}
function mergeAccountObjects(remote, local){
  if(!remote) return local;
  if(!local) return remote;
  const merged = { ...local };
  merged.workouts = mergeArrayField(remote.workouts, local.workouts, 'id');
  merged.goals = mergeArrayField(remote.goals, local.goals, 'id');
  merged.nutrition = mergeArrayField(remote.nutrition, local.nutrition, 'id');
  merged.routineTemplates = mergeArrayField(remote.routineTemplates, local.routineTemplates, 'id');
  merged.workoutSessions = mergeArrayField(remote.workoutSessions, local.workoutSessions, 'id');
  merged.customChallenges = mergeArrayField(remote.customChallenges, local.customChallenges, 'id');
  merged.savedPosts = mergeArrayField(remote.savedPosts, local.savedPosts, null);
  merged.trainingPlans = mergeArrayField(remote.trainingPlans, local.trainingPlans, 'id');
  merged.steps = mergeArrayField(remote.steps, local.steps, 'date');
  merged.sleep = mergeArrayField(remote.sleep, local.sleep, 'date');
  merged.waterLog = mergeArrayField(remote.waterLog, local.waterLog, 'date');
  merged.measurements = mergeArrayField(remote.measurements, local.measurements, null);
  merged.history = mergeArrayField(remote.history, local.history, null);
  const remoteChallenges = remote.challenges || { dailyCompletions:{}, levels:{} };
  const localChallenges = local.challenges || { dailyCompletions:{}, levels:{} };
  const levels = { ...(remoteChallenges.levels||{}) };
  Object.entries(localChallenges.levels||{}).forEach(([k,v])=>{ levels[k] = Math.max(levels[k]||0, v); });
  merged.challenges = { dailyCompletions: { ...(remoteChallenges.dailyCompletions||{}), ...(localChallenges.dailyCompletions||{}) }, levels };
  return merged;
}
async function persistAccountObj(username, accountObj){
  if(isGithubMode()){
    await collectionUpdate('accounts', col=>{
      col[username] = mergeAccountObjects(col[username], accountObj);
    }, `Actualizar datos de ${username}`, {});
  }
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
    await collectionUpdate('posts', col=>{ Object.keys(col).forEach(id=>{ if(col[id].author===username) delete col[id]; }); }, `Borrar publicaciones de: ${username}`, {});
    await collectionUpdate('messages', col=>{ Object.keys(col).forEach(cid=>{ if(cid.split('__').includes(username)) delete col[cid]; }); }, `Borrar mensajes de: ${username}`, {});
    await collectionUpdate('notifications', col=>{ delete col[username]; }, `Borrar notificaciones de: ${username}`, {});
    await collectionUpdate('stories', col=>{ delete col[username]; }, `Borrar historias de: ${username}`, {});
  } else {
    await storageDeleteKey(`wilks:account:${username}`, false);
    await storageDeleteKey(`wilks:media:${username}`, false);
    await storageDeleteKey(`wilks:ranking:${username}`, true);
    await storageDeleteKey(`wilks:social:${username}`, true);
    await deleteAllPostsBy(username);
    await deleteUserMessages(username);
    const notifCol = await getNotificationsCollection(); delete notifCol[username]; await storageSet('wilks:notifications', JSON.stringify(notifCol), true);
    const storiesCol = await getStoriesCollection(); delete storiesCol[username]; await saveStoriesCollectionLocal(storiesCol);
  }
}
async function wipeAllAccounts(){
  if(isGithubMode()){
    for(const name of ['accounts','media','ranking','social','posts','messages','notifications','stories']){
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
    await storageDeleteKey('wilks:posts', true);
    await storageDeleteKey('wilks:messages', true);
    await storageDeleteKey('wilks:notifications', true);
    await storageDeleteKey('wilks:stories', true);
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
function mergeMediaStore(remote, local){
  if(!remote) return local;
  if(!local) return remote;
  return {
    avatar: local.avatar!==undefined ? local.avatar : remote.avatar,
    cover: local.cover!==undefined ? local.cover : remote.cover,
    progressPhotos: mergeArrayField(remote.progressPhotos, local.progressPhotos, 'id'),
    workoutMedia: { ...(remote.workoutMedia||{}), ...(local.workoutMedia||{}) }
  };
}
async function persistMediaStoreFor(username, store){
  if(isGithubMode()){ await collectionUpdate('media', col=>{ col[username] = mergeMediaStore(col[username], store); }, `Actualizar media de ${username}`, {}); }
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

async function fetchAllSocialMap(){
  if(isGithubMode()){ return await collectionFetchFresh('social', {}); }
  const map = {};
  const keys = await storageListKeys('wilks:social:', true);
  for(const k of keys){
    const raw = await storageGet(k, true);
    if(raw){ try{ map[k.replace('wilks:social:','')] = JSON.parse(raw); }catch(e){} }
  }
  return map;
}
/* ---- Social: apoyos y comentarios de perfiles públicos ---- */
function defaultSocial(){ return { kudos: 0, kudosBy: [], comments: [], following: [], muted: [], blocked: [], pinnedPostId: null }; }
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

/* =========================================================
   PUBLICACIONES: feed social de la comunidad
   Cada publicación: { id, author, text, image, createdAt, likes:[user...], comments:[{id,from,text,date}], shares:[{by,date}] }
========================================================= */
function newPostId(){ return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function defaultPost(author, text, image){
  return { id:newPostId(), author, text:(text||'').trim(), image:image||null, createdAt:new Date().toISOString(), likes:[], comments:[], shares:[] };
}
async function getPostsCollection(){
  if(isGithubMode()){ return await collectionFetchFresh('posts', {}); }
  const raw = await storageGet('wilks:posts', true);
  return raw ? JSON.parse(raw) : {};
}
async function savePostsCollectionLocal(col){
  await storageSet('wilks:posts', JSON.stringify(col), true);
}
async function createPost(author, text, image){
  const post = defaultPost(author, text, image);
  if(isGithubMode()){
    await collectionUpdate('posts', col=>{ col[post.id] = post; }, `Nueva publicación de ${author}`, {});
  } else {
    const col = await getPostsCollection();
    col[post.id] = post;
    await savePostsCollectionLocal(col);
  }
  return post;
}
async function fetchAllPosts(){
  const col = await getPostsCollection();
  return Object.values(col).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
}
async function fetchPostsByAuthor(author){
  const all = await fetchAllPosts();
  return all.filter(p=>p.author===author);
}
async function mutatePost(postId, mutatorFn, message){
  if(isGithubMode()){
    await collectionUpdate('posts', col=>{ if(col[postId]) mutatorFn(col[postId]); }, message || `Actualizar publicación ${postId}`, {});
  } else {
    const col = await getPostsCollection();
    if(col[postId]){ mutatorFn(col[postId]); await savePostsCollectionLocal(col); }
  }
}
async function togglePostLike(postId, byUser){
  await mutatePost(postId, post=>{
    post.likes = post.likes || [];
    const idx = post.likes.indexOf(byUser);
    if(idx>=0) post.likes.splice(idx,1); else post.likes.push(byUser);
  }, `Me gusta en ${postId}`);
}
async function addPostComment(postId, fromUser, text){
  const comment = { id:Date.now(), from:fromUser, text, date:new Date().toLocaleString('es-ES'), likes:[] };
  await mutatePost(postId, post=>{ post.comments = post.comments || []; post.comments.push(comment); }, `Comentario en ${postId}`);
  return comment;
}
async function toggleCommentLike(postId, commentId, username){
  await mutatePost(postId, post=>{
    const c = (post.comments||[]).find(c=>c.id===commentId);
    if(!c) return;
    c.likes = c.likes || [];
    const idx = c.likes.indexOf(username);
    if(idx>=0) c.likes.splice(idx,1); else c.likes.push(username);
  }, `Like en comentario ${commentId}`);
}
async function deletePostComment(postId, commentId, byUser){
  await mutatePost(postId, post=>{
    post.comments = (post.comments||[]).filter(c=> !(c.id===commentId && (c.from===byUser || post.author===byUser)));
  }, `Borrar comentario en ${postId}`);
}
async function registerPostShare(postId, byUser){
  await mutatePost(postId, post=>{ post.shares = post.shares || []; post.shares.push({ by:byUser, date:new Date().toISOString() }); }, `Compartir ${postId}`);
}
/* =========================================================
   SILENCIAR / BLOQUEAR / FIJAR PUBLICACIÓN
========================================================= */
async function toggleMuteUser(targetUser, byUser){
  const mutator = col=>{ col[byUser] = col[byUser] || defaultSocial(); col[byUser].muted = col[byUser].muted || []; const i = col[byUser].muted.indexOf(targetUser); if(i>=0) col[byUser].muted.splice(i,1); else col[byUser].muted.push(targetUser); };
  if(isGithubMode()){ await collectionUpdate('social', mutator, `${byUser} silencia a ${targetUser}`, {}); }
  else{ const social = await fetchSocial(byUser); social.muted = social.muted || []; const i = social.muted.indexOf(targetUser); if(i>=0) social.muted.splice(i,1); else social.muted.push(targetUser); await storageSet(`wilks:social:${byUser}`, JSON.stringify(social), true); }
}
async function toggleBlockUser(targetUser, byUser){
  const mutator = col=>{ col[byUser] = col[byUser] || defaultSocial(); col[byUser].blocked = col[byUser].blocked || []; const i = col[byUser].blocked.indexOf(targetUser); if(i>=0) col[byUser].blocked.splice(i,1); else col[byUser].blocked.push(targetUser); };
  if(isGithubMode()){ await collectionUpdate('social', mutator, `${byUser} bloquea a ${targetUser}`, {}); }
  else{ const social = await fetchSocial(byUser); social.blocked = social.blocked || []; const i = social.blocked.indexOf(targetUser); if(i>=0) social.blocked.splice(i,1); else social.blocked.push(targetUser); await storageSet(`wilks:social:${byUser}`, JSON.stringify(social), true); }
}
async function togglePinPost(username, postId){
  const mutator = col=>{ col[username] = col[username] || defaultSocial(); col[username].pinnedPostId = (col[username].pinnedPostId===postId) ? null : postId; };
  if(isGithubMode()){ await collectionUpdate('social', mutator, `Fijar publicación de ${username}`, {}); }
  else{ const social = await fetchSocial(username); social.pinnedPostId = (social.pinnedPostId===postId) ? null : postId; await storageSet(`wilks:social:${username}`, JSON.stringify(social), true); }
}

/* =========================================================
   REPOSTS y ENCUESTAS en publicaciones
========================================================= */
async function createRepost(username, originalPost, caption){
  const post = defaultPost(username, caption||'', null);
  post.repostOf = originalPost.id;
  post.repostAuthor = originalPost.author;
  post.repostText = originalPost.text || '';
  post.repostImage = originalPost.image || null;
  if(isGithubMode()){ await collectionUpdate('posts', col=>{ col[post.id] = post; }, `Republicación de ${username}`, {}); }
  else{ const col = await getPostsCollection(); col[post.id] = post; await savePostsCollectionLocal(col); }
  return post;
}
async function createPollPost(username, text, question, options){
  const post = defaultPost(username, text, null);
  post.poll = { question, options: options.map(o=>({ text:o, votes:[] })) };
  if(isGithubMode()){ await collectionUpdate('posts', col=>{ col[post.id] = post; }, `Encuesta de ${username}`, {}); }
  else{ const col = await getPostsCollection(); col[post.id] = post; await savePostsCollectionLocal(col); }
  return post;
}
async function votePoll(postId, username, optionIndex){
  await mutatePost(postId, post=>{
    if(!post.poll) return;
    post.poll.options.forEach(o=>{ o.votes = (o.votes||[]).filter(v=>v!==username); });
    post.poll.options[optionIndex].votes = post.poll.options[optionIndex].votes || [];
    post.poll.options[optionIndex].votes.push(username);
  }, `Voto en encuesta ${postId}`);
}
async function createTemplateSharePost(username, caption, template){
  const post = defaultPost(username, caption||'', null);
  post.templateShare = { name: template.name, exercises: template.exercises };
  if(isGithubMode()){ await collectionUpdate('posts', col=>{ col[post.id] = post; }, `Plantilla compartida por ${username}`, {}); }
  else{ const col = await getPostsCollection(); col[post.id] = post; await savePostsCollectionLocal(col); }
  return post;
}

/* =========================================================
   HISTORIAS (contenido efímero de 24 horas)
========================================================= */
const STORY_LIFETIME_MS = 24*60*60*1000;
function newStoryId(){ return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
async function getStoriesCollection(){
  if(isGithubMode()){ return await collectionFetchFresh('stories', {}); }
  const raw = await storageGet('wilks:stories', true);
  return raw ? JSON.parse(raw) : {};
}
async function saveStoriesCollectionLocal(col){ await storageSet('wilks:stories', JSON.stringify(col), true); }
function pruneExpiredStories(col){
  const now = Date.now();
  Object.keys(col).forEach(username=>{
    col[username] = (col[username]||[]).filter(s=> new Date(s.expiresAt).getTime() > now);
    if(col[username].length===0) delete col[username];
  });
  return col;
}
async function createStory(username, image, text){
  const story = { id:newStoryId(), image:image||null, text:(text||'').trim(), createdAt:new Date().toISOString(), expiresAt:new Date(Date.now()+STORY_LIFETIME_MS).toISOString(), viewedBy:[] };
  if(isGithubMode()){
    await collectionUpdate('stories', col=>{ pruneExpiredStories(col); col[username] = col[username] || []; col[username].push(story); }, `Historia de ${username}`, {});
  } else {
    const col = await getStoriesCollection();
    pruneExpiredStories(col);
    col[username] = col[username] || [];
    col[username].push(story);
    await saveStoriesCollectionLocal(col);
  }
  return story;
}
async function fetchAllStories(){
  let col = await getStoriesCollection();
  col = pruneExpiredStories(col);
  return col;
}
async function markStoryViewed(username, storyId, viewer){
  const mutator = col=>{ const list = col[username]||[]; const s = list.find(x=>x.id===storyId); if(s){ s.viewedBy = s.viewedBy||[]; if(!s.viewedBy.includes(viewer)) s.viewedBy.push(viewer); } };
  if(isGithubMode()){ await collectionUpdate('stories', mutator, `Ver historia`, {}); }
  else{ const col = await getStoriesCollection(); mutator(col); await saveStoriesCollectionLocal(col); }
}
async function deleteStory(username, storyId){
  const mutator = col=>{ col[username] = (col[username]||[]).filter(s=>s.id!==storyId); };
  if(isGithubMode()){ await collectionUpdate('stories', mutator, `Borrar historia`, {}); }
  else{ const col = await getStoriesCollection(); mutator(col); await saveStoriesCollectionLocal(col); }
}

async function editPostText(postId, byUser, newText){
  await mutatePost(postId, post=>{
    if(post.author===byUser){ post.text = (newText||'').trim(); post.editedAt = new Date().toISOString(); }
  }, `Editar publicación ${postId}`);
}
async function deletePostById(postId, byUser){
  if(isGithubMode()){
    await collectionUpdate('posts', col=>{ if(col[postId] && col[postId].author===byUser) delete col[postId]; }, `Borrar publicación ${postId}`, {});
  } else {
    const col = await getPostsCollection();
    if(col[postId] && col[postId].author===byUser){ delete col[postId]; await savePostsCollectionLocal(col); }
  }
}
async function deleteAllPostsBy(username){
  if(isGithubMode()){
    await collectionUpdate('posts', col=>{ Object.keys(col).forEach(id=>{ if(col[id].author===username) delete col[id]; }); }, `Borrar publicaciones de ${username}`, {});
  } else {
    const col = await getPostsCollection();
    Object.keys(col).forEach(id=>{ if(col[id].author===username) delete col[id]; });
    await savePostsCollectionLocal(col);
  }
}

/* =========================================================
   MENSAJES DIRECTOS entre usuarios
   Colección indexada por "conversationId" (usuarios ordenados alfabéticamente y unidos con "__")
========================================================= */
function conversationId(u1,u2){ return [u1,u2].sort().join('__'); }
async function getMessagesCollection(){
  if(isGithubMode()){ return await collectionFetchFresh('messages', {}); }
  const raw = await storageGet('wilks:messages', true);
  return raw ? JSON.parse(raw) : {};
}
async function saveMessagesCollectionLocal(col){
  await storageSet('wilks:messages', JSON.stringify(col), true);
}
async function sendDirectMessage(from, to, text, extra){
  const cid = conversationId(from, to);
  const msg = { id:Date.now().toString(36)+Math.random().toString(36).slice(2,5), from, to, text:(text||'').trim(), date:new Date().toISOString(), readBy:[from], type:'text', ...(extra||{}) };
  if(isGithubMode()){
    await collectionUpdate('messages', col=>{ col[cid] = col[cid] || []; col[cid].push(msg); }, `Mensaje ${from} → ${to}`, {});
  } else {
    const col = await getMessagesCollection();
    col[cid] = col[cid] || [];
    col[cid].push(msg);
    await saveMessagesCollectionLocal(col);
  }
  return msg;
}
async function fetchConversation(u1, u2){
  const col = await getMessagesCollection();
  return col[conversationId(u1,u2)] || [];
}
async function markConversationRead(u1, u2, reader){
  const cid = conversationId(u1,u2);
  const mutator = col=>{ (col[cid]||[]).forEach(m=>{ m.readBy = m.readBy||[]; if(!m.readBy.includes(reader)) m.readBy.push(reader); }); };
  if(isGithubMode()){ await collectionUpdate('messages', mutator, `Marcar leído ${cid}`, {}); }
  else{ const col = await getMessagesCollection(); mutator(col); await saveMessagesCollectionLocal(col); }
}
async function fetchInboxSummaries(username){
  const col = await getMessagesCollection();
  const summaries = [];
  Object.keys(col).forEach(cid=>{
    const msgs = col[cid];
    if(!msgs || !msgs.length) return;
    const parts = cid.split('__');
    if(!parts.includes(username)) return;
    const other = parts[0]===username ? parts[1] : parts[0];
    const last = msgs[msgs.length-1];
    const unread = msgs.filter(m=> m.to===username && !(m.readBy||[]).includes(username)).length;
    summaries.push({ other, last, unread, total: msgs.length });
  });
  summaries.sort((a,b)=> (b.last.date||'').localeCompare(a.last.date||''));
  return summaries;
}
async function deleteUserMessages(username){
  if(isGithubMode()){
    await collectionUpdate('messages', col=>{ Object.keys(col).forEach(cid=>{ if(cid.split('__').includes(username)) delete col[cid]; }); }, `Borrar mensajes de ${username}`, {});
  } else {
    const col = await getMessagesCollection();
    Object.keys(col).forEach(cid=>{ if(cid.split('__').includes(username)) delete col[cid]; });
    await saveMessagesCollectionLocal(col);
  }
}

/* =========================================================
   SEGUIR USUARIOS (follow / unfollow)
   Se guarda en la colección "social" del usuario que sigue: social[byUser].following = [usernames...]
========================================================= */
async function toggleFollow(targetUser, byUser){
  if(targetUser===byUser) return;
  if(isGithubMode()){
    await collectionUpdate('social', col=>{
      col[byUser] = col[byUser] || defaultSocial();
      col[byUser].following = col[byUser].following || [];
      const idx = col[byUser].following.indexOf(targetUser);
      if(idx>=0) col[byUser].following.splice(idx,1); else col[byUser].following.push(targetUser);
    }, `${byUser} sigue/deja de seguir a ${targetUser}`, {});
  } else {
    const social = await fetchSocial(byUser);
    social.following = social.following || [];
    const idx = social.following.indexOf(targetUser);
    if(idx>=0) social.following.splice(idx,1); else social.following.push(targetUser);
    await storageSet(`wilks:social:${byUser}`, JSON.stringify(social), true);
  }
}
async function fetchFollowStats(username){
  const socialMap = await fetchAllSocialMap();
  const followingList = (socialMap[username] && socialMap[username].following) || [];
  const followers = Object.keys(socialMap).filter(u=> (socialMap[u].following||[]).includes(username));
  return { followers: followers.length, following: followingList.length, followersList: followers, followingList };
}

/* =========================================================
   NOTIFICACIONES de actividad (likes, comentarios, seguidores, menciones, mensajes)
========================================================= */
function newNotifId(){ return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
async function getNotificationsCollection(){
  if(isGithubMode()){ return await collectionFetchFresh('notifications', {}); }
  const raw = await storageGet('wilks:notifications', true);
  return raw ? JSON.parse(raw) : {};
}
async function pushNotification(toUsername, notif){
  if(!toUsername) return;
  const entry = { id:newNotifId(), date:new Date().toISOString(), read:false, ...notif };
  if(isGithubMode()){
    await collectionUpdate('notifications', col=>{
      col[toUsername] = col[toUsername] || [];
      col[toUsername].unshift(entry);
      if(col[toUsername].length>80) col[toUsername].length = 80;
    }, `Notificación para ${toUsername}`, {});
  } else {
    const col = await getNotificationsCollection();
    col[toUsername] = col[toUsername] || [];
    col[toUsername].unshift(entry);
    if(col[toUsername].length>80) col[toUsername].length = 80;
    await storageSet('wilks:notifications', JSON.stringify(col), true);
  }
}
async function fetchNotifications(username){
  const col = await getNotificationsCollection();
  return col[username] || [];
}
async function markAllNotificationsRead(username){
  const mutator = col=>{ (col[username]||[]).forEach(n=>n.read=true); };
  if(isGithubMode()){ await collectionUpdate('notifications', mutator, `Marcar notificaciones leídas de ${username}`, {}); }
  else { const col = await getNotificationsCollection(); mutator(col); await storageSet('wilks:notifications', JSON.stringify(col), true); }
}

/* =========================================================
   REACCIONES MÚLTIPLES en publicaciones (❤️ 💪 🔥 👏 😮)
========================================================= */
async function setPostReaction(postId, username, emoji){
  let resultEmoji = emoji;
  await mutatePost(postId, post=>{
    post.reactions = post.reactions || {};
    if(post.reactions[username]===emoji){ delete post.reactions[username]; resultEmoji = null; }
    else{ post.reactions[username] = emoji; }
    post.likes = Object.keys(post.reactions); // mantiene compatibilidad con el conteo previo
  }, `Reacción en ${postId}`);
  return resultEmoji;
}

/* =========================================================================================
   CATÁLOGO DE EJERCICIOS: lista cerrada y curada (no editable por los usuarios), en
   inglés y español, organizada por grupo muscular y objetivo, con descripción, instrucciones
   paso a paso y un rango de nivel asociado a la mejor marca de cada usuario.
========================================================================================= */
const MUSCLE_GROUPS = ['Pecho','Espalda','Hombros','Bíceps','Tríceps','Antebrazos','Abdomen','Glúteos','Cuádriceps','Isquiotibiales','Gemelos','Cuerpo completo'];
const EXERCISE_OBJECTIVES = ['Fuerza','Hipertrofia','Calistenia','Velocidad','Atletismo','Flexibilidad','Resistencia','Potencia','Equilibrio'];

/* Pictogramas de referencia (ilustraciones propias, no fotografías) para cada familia de movimiento.
   Figura esquemática con la posición de partida en gris y la posición final en dorado, más una flecha
   indicando la dirección del movimiento. Se agrupan varios patrones afines bajo el mismo pictograma. */
const PATTERN_ICON_GROUPS = {
  push:'push', pull:'pull', row:'pull', squat:'squat', hinge:'squat', lunge:'squat',
  'press-overhead':'overhead', raise:'overhead', curl:'curl', extension:'curl',
  calf:'calf', core:'core', carry:'carry', plyo:'explosive', stretch:'stretch',
  cardio:'cardio', calisthenics:'hold'
};
const PATTERN_PICTOGRAMS = {
  push:`<circle cx="30" cy="20" r="7"/><line x1="30" y1="27" x2="30" y2="55"/><line x1="30" y1="55" x2="18" y2="85"/><line x1="30" y1="55" x2="42" y2="85"/>
    <line x1="30" y1="35" x2="55" y2="35" stroke-dasharray="3 3" opacity=".5"/>
    <line x1="30" y1="35" x2="70" y2="35" class="pict-accent"/><path d="M62 28 L70 35 L62 42" class="pict-accent" fill="none"/>`,
  pull:`<circle cx="65" cy="20" r="7"/><line x1="65" y1="27" x2="65" y2="55"/><line x1="65" y1="55" x2="53" y2="85"/><line x1="65" y1="55" x2="77" y2="85"/>
    <line x1="65" y1="35" x2="35" y2="35" stroke-dasharray="3 3" opacity=".5"/>
    <line x1="65" y1="35" x2="25" y2="35" class="pict-accent"/><path d="M33 28 L25 35 L33 42" class="pict-accent" fill="none"/>`,
  squat:`<circle cx="50" cy="18" r="7"/><line x1="50" y1="25" x2="50" y2="48"/>
    <line x1="50" y1="30" x2="30" y2="38"/><line x1="50" y1="30" x2="70" y2="38"/>
    <path d="M50 48 L38 65 L38 85" stroke-dasharray="3 3" opacity=".5" fill="none"/>
    <path d="M50 48 L62 65 L62 85" stroke-dasharray="3 3" opacity=".5" fill="none"/>
    <path d="M50 48 L36 62 L40 85" class="pict-accent" fill="none"/>
    <path d="M50 48 L64 62 L60 85" class="pict-accent" fill="none"/>
    <path d="M50 78 L50 88" class="pict-accent"/><path d="M44 82 L50 88 L56 82" class="pict-accent" fill="none"/>`,
  overhead:`<circle cx="50" cy="30" r="7"/><line x1="50" y1="37" x2="50" y2="65"/><line x1="50" y1="65" x2="40" y2="88"/><line x1="50" y1="65" x2="60" y2="88"/>
    <line x1="50" y1="42" x2="35" y2="55" stroke-dasharray="3 3" opacity=".5"/>
    <path d="M50 42 L38 15" class="pict-accent" fill="none"/><path d="M31 22 L38 15 L45 22" class="pict-accent" fill="none"/>`,
  curl:`<circle cx="30" cy="20" r="7"/><line x1="30" y1="27" x2="30" y2="60"/><line x1="30" y1="60" x2="20" y2="88"/><line x1="30" y1="60" x2="40" y2="88"/>
    <line x1="30" y1="35" x2="52" y2="50" stroke-dasharray="3 3" opacity=".5"/>
    <path d="M30 35 L48 32" class="pict-accent" fill="none"/>
    <path d="M55 45 A18 18 0 0 0 50 30" class="pict-accent" fill="none"/><path d="M44 32 L50 30 L49 37" class="pict-accent" fill="none"/>`,
  calf:`<circle cx="50" cy="22" r="7"/><line x1="50" y1="29" x2="50" y2="58"/><line x1="50" y1="35" x2="34" y2="45"/><line x1="50" y1="35" x2="66" y2="45"/>
    <line x1="50" y1="58" x2="44" y2="80" stroke-dasharray="3 3" opacity=".5"/><line x1="44" y1="80" x2="56" y2="80" stroke-dasharray="3 3" opacity=".5"/>
    <path d="M50 58 L45 76 L58 82" class="pict-accent" fill="none"/>
    <path d="M50 68 L50 58" class="pict-accent"/><path d="M45 63 L50 57 L55 63" class="pict-accent" fill="none"/>`,
  core:`<line x1="15" y1="80" x2="85" y2="80" stroke-dasharray="3 3" opacity=".4"/>
    <circle cx="25" cy="70" r="7"/><line x1="31" y1="72" x2="55" y2="78"/>
    <path d="M55 78 L70 60" stroke-dasharray="3 3" opacity=".5" fill="none"/>
    <path d="M55 78 L72 50" class="pict-accent" fill="none"/><path d="M65 50 L72 50 L72 57" class="pict-accent" fill="none"/>`,
  carry:`<circle cx="30" cy="18" r="6"/><line x1="30" y1="24" x2="30" y2="50"/><line x1="30" y1="50" x2="22" y2="85"/><line x1="30" y1="50" x2="38" y2="85"/>
    <line x1="18" y1="35" x2="42" y2="35"/><circle cx="14" cy="38" r="4" fill="currentColor" opacity=".6"/><circle cx="46" cy="38" r="4" fill="currentColor" opacity=".6"/>
    <path d="M55 50 L80 50" class="pict-accent" fill="none"/><path d="M72 43 L80 50 L72 57" class="pict-accent" fill="none"/>`,
  explosive:`<circle cx="50" cy="55" r="7"/><line x1="50" y1="62" x2="50" y2="80"/><line x1="50" y1="80" x2="40" y2="92"/><line x1="50" y1="80" x2="60" y2="92"/>
    <circle cx="50" cy="20" r="7" opacity=".5" stroke-dasharray="3 3"/><line x1="50" y1="27" x2="50" y2="45" opacity=".5" stroke-dasharray="3 3"/>
    <path d="M50 62 L50 20" class="pict-accent" stroke-dasharray="2 4"/><path d="M43 30 L50 20 L57 30" class="pict-accent" fill="none"/>`,
  stretch:`<circle cx="35" cy="25" r="7"/><line x1="35" y1="32" x2="35" y2="60"/><line x1="35" y1="60" x2="27" y2="88"/><line x1="35" y1="60" x2="45" y2="88"/>
    <path d="M35 38 Q 55 30 68 18" class="pict-accent" fill="none"/>
    <path d="M62 14 Q 66 18 68 18 Q 68 22 65 25" class="pict-accent" fill="none"/>`,
  cardio:`<circle cx="30" cy="22" r="7"/><line x1="30" y1="29" x2="38" y2="52"/><line x1="38" y1="52" x2="28" y2="78"/><line x1="38" y1="52" x2="55" y2="70"/>
    <line x1="32" y1="35" x2="15" y2="45"/><line x1="32" y1="35" x2="45" y2="20"/>
    <path d="M60 30 L75 30" class="pict-accent" opacity=".6"/><path d="M60 42 L80 42" class="pict-accent"/><path d="M60 54 L72 54" class="pict-accent" opacity=".6"/>`,
  hold:`<circle cx="50" cy="70" r="7"/><line x1="50" y1="63" x2="50" y2="40"/><line x1="50" y1="40" x2="30" y2="30"/><line x1="50" y1="40" x2="70" y2="30"/>
    <line x1="50" y1="63" x2="35" y2="80" stroke-dasharray="3 3" opacity=".5"/><line x1="50" y1="63" x2="65" y2="80" stroke-dasharray="3 3" opacity=".5"/>
    <path d="M20 24 L30 30 M80 24 L70 30" class="pict-accent" fill="none"/>`,
};
function exercisePictogramSvg(pattern){
  const key = PATTERN_ICON_GROUPS[pattern] || 'hold';
  const body = PATTERN_PICTOGRAMS[key] || PATTERN_PICTOGRAMS.hold;
  return `<svg viewBox="0 0 100 100" class="exercise-pictogram" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
const PATTERN_INFO = {
  push:{ desc:n=>`Ejercicio de empuje que trabaja principalmente el pecho, los hombros y los tríceps.`,
    steps:['Colócate en la posición inicial con un agarre firme y estable.','Baja el peso o el cuerpo de forma controlada hasta notar el estiramiento.','Empuja de vuelta a la posición inicial extendiendo los codos.','Mantén el core activado durante todo el movimiento.','Controla la respiración: inhala al bajar, exhala al empujar.'] },
  pull:{ desc:n=>`Ejercicio de tracción centrado en la espalda y los brazos.`,
    steps:['Agárrate o sujeta el peso con un agarre firme.','Tira llevando los codos hacia atrás y juntando las escápulas.','Controla el regreso a la posición inicial sin perder tensión.','Evita usar impulso; el movimiento debe ser controlado.','Mantén el pecho elevado durante todo el recorrido.'] },
  row:{ desc:n=>`Ejercicio de remo para el desarrollo de la espalda media y los dorsales.`,
    steps:['Inclina el torso manteniendo la espalda recta.','Tira del peso hacia el abdomen llevando los codos hacia atrás.','Aprieta las escápulas en la parte final del movimiento.','Baja el peso de forma controlada sin redondear la espalda.'] },
  squat:{ desc:n=>`Movimiento de sentadilla que desarrolla cuádriceps, glúteos e isquiotibiales.`,
    steps:['Coloca los pies a la anchura de los hombros con la carga bien apoyada.','Baja flexionando cadera y rodillas manteniendo el pecho erguido.','Desciende hasta donde tu movilidad lo permita con buena técnica.','Empuja a través de los talones para volver a la posición inicial.','Mantén la espalda neutra durante todo el recorrido.'] },
  hinge:{ desc:n=>`Movimiento de bisagra de cadera que trabaja isquiotibiales, glúteos y zona lumbar.`,
    steps:['Comienza con una ligera flexión de rodillas y la espalda recta.','Empuja la cadera hacia atrás manteniendo el peso cerca del cuerpo.','Baja hasta sentir el estiramiento en los isquiotibiales.','Vuelve a la posición inicial empujando la cadera hacia delante.','Evita redondear la espalda en ningún momento.'] },
  'press-overhead':{ desc:n=>`Press vertical que desarrolla principalmente los hombros y los tríceps.`,
    steps:['Sujeta el peso a la altura de los hombros con los codos ligeramente adelantados.','Empuja hacia arriba hasta extender completamente los brazos.','Evita arquear excesivamente la zona lumbar.','Baja de forma controlada hasta la posición inicial.'] },
  curl:{ desc:n=>`Ejercicio de aislamiento para el desarrollo del bíceps.`,
    steps:['Mantén los codos pegados al cuerpo durante todo el movimiento.','Flexiona el codo llevando el peso hacia el hombro.','Aprieta el bíceps en la parte alta del movimiento.','Baja de forma lenta y controlada hasta la extensión completa.'] },
  extension:{ desc:n=>`Ejercicio de aislamiento para el desarrollo del tríceps.`,
    steps:['Fija la parte superior del brazo cerca de la cabeza o el cuerpo.','Extiende el codo llevando el peso hacia arriba o hacia atrás.','Aprieta el tríceps en la posición de extensión completa.','Vuelve a la posición inicial de forma controlada.'] },
  raise:{ desc:n=>`Ejercicio de aislamiento para el desarrollo de los hombros.`,
    steps:['Sujeta el peso con los brazos ligeramente flexionados.','Eleva el peso lateral o frontalmente hasta la altura del hombro.','Evita usar impulso; controla el movimiento en todo momento.','Baja de forma lenta hasta la posición inicial.'] },
  calf:{ desc:n=>`Ejercicio de aislamiento para el desarrollo de los gemelos.`,
    steps:['Colócate con la punta de los pies apoyada y los talones libres.','Eleva los talones lo máximo posible contrayendo los gemelos.','Mantén la contracción un segundo en la parte alta.','Baja de forma controlada hasta sentir el estiramiento.'] },
  lunge:{ desc:n=>`Movimiento unilateral de pierna que trabaja cuádriceps y glúteos.`,
    steps:['Da un paso al frente, atrás o al lateral según la variante.','Flexiona ambas rodillas hasta formar un ángulo de 90 grados.','Empuja con la pierna delantera para volver a la posición inicial.','Mantén el torso erguido durante todo el movimiento.'] },
  core:{ desc:n=>`Ejercicio de core que fortalece la musculatura abdominal y estabilizadora.`,
    steps:['Colócate en la posición inicial manteniendo la zona lumbar protegida.','Activa el abdomen antes de iniciar el movimiento.','Realiza el movimiento de forma controlada, sin usar impulso.','Respira de forma constante durante todo el ejercicio.'] },
  carry:{ desc:n=>`Ejercicio funcional de acarreo que mejora la fuerza de agarre y la estabilidad del core.`,
    steps:['Sujeta la carga con un agarre firme y el core activado.','Camina o desplázate manteniendo una postura erguida.','Evita balancear la carga de un lado a otro.','Controla la respiración durante todo el recorrido.'] },
  plyo:{ desc:n=>`Ejercicio pliométrico orientado a desarrollar potencia y velocidad.`,
    steps:['Adopta una posición atlética antes de iniciar el movimiento.','Ejecuta el movimiento explosivo con la máxima intención de velocidad.','Amortigua la recepción flexionando rodillas y cadera.','Recupera la posición inicial antes de repetir.'] },
  stretch:{ desc:n=>`Ejercicio de movilidad y flexibilidad para mejorar el rango de movimiento.`,
    steps:['Adopta la posición inicial de forma lenta y controlada.','Lleva el estiramiento hasta notar tensión, sin llegar a sentir dolor.','Mantén la posición respirando de forma profunda y constante.','Suelta el estiramiento de forma progresiva.'] },
  cardio:{ desc:n=>`Ejercicio cardiovascular orientado a mejorar la resistencia aeróbica.`,
    steps:['Comienza con un ritmo suave para calentar.','Aumenta progresivamente la intensidad hasta el ritmo objetivo.','Mantén una respiración constante durante todo el esfuerzo.','Termina con unos minutos a ritmo suave para enfriar.'] },
  calisthenics:{ desc:n=>`Ejercicio de calistenia avanzada que exige fuerza relativa y control corporal.`,
    steps:['Adopta la posición de partida con el core totalmente activado.','Ejecuta el movimiento de forma controlada, sin balanceos.','Mantén la alineación corporal durante todo el ejercicio.','Progresa de forma gradual con variantes más sencillas si es necesario.'] },
};

/* Cada entrada base: [id, nombreEn, nombreEs, músculo principal, [objetivos], patrón, tipoDePuntuación, [variantes[en,es]]] */
const EXERCISE_BASES = [
['bench-press','Bench Press','Press de banca','Pecho',['Fuerza','Hipertrofia'],'push','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Incline Barbell','inclinado con barra'],['Incline Dumbbell','inclinado con mancuernas'],['Decline Barbell','declinado con barra'],['Close-Grip','con agarre cerrado'],['Smith Machine','en multipower'],['Machine','en máquina']]],
['push-up','Push-Up','Flexión de brazos','Pecho',['Calistenia','Hipertrofia'],'push','reps',[['Standard','estándar'],['Wide Grip','agarre ancho'],['Diamond','diamante'],['Decline','declinada'],['Incline','inclinada'],['Archer','de arquero'],['One-Arm','a un brazo'],['Clap','con palmada']]],
['chest-fly','Chest Fly','Aperturas de pecho','Pecho',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Machine','en máquina'],['Incline Dumbbell','inclinadas con mancuernas']]],
['cable-crossover','Cable Crossover','Cruce de poleas','Pecho',['Hipertrofia'],'raise','strength-abs',[['High to Low','de arriba a abajo'],['Low to High','de abajo a arriba']]],
['dip','Dip','Fondos en paralelas','Pecho',['Calistenia','Fuerza'],'push','reps',[['Chest','de pecho'],['Tricep','de tríceps'],['Ring','en anillas'],['Weighted','lastrados']]],
['pullover','Pullover','Pullover','Pecho',['Hipertrofia'],'pull','strength-abs',[['Dumbbell','con mancuerna'],['Barbell','con barra'],['Cable','en polea']]],
['pull-up','Pull-Up','Dominada','Espalda',['Calistenia','Fuerza'],'pull','reps',[['Standard','estándar'],['Wide Grip','agarre ancho'],['Close Grip','agarre cerrado'],['Chin-Up','supina'],['Neutral Grip','agarre neutro'],['Weighted','lastrada'],['Archer','de arquero'],['L-Sit','con L-sit'],['Commando','comando']]],
['lat-pulldown','Lat Pulldown','Jalón al pecho','Espalda',['Fuerza','Hipertrofia'],'pull','strength-abs',[['Wide Grip','agarre ancho'],['Close Grip','agarre cerrado'],['Reverse Grip','agarre supino'],['Single Arm','a un brazo']]],
['bent-over-row','Bent-Over Row','Remo con barra inclinado','Espalda',['Fuerza','Hipertrofia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Underhand','agarre supino'],['Pendlay','Pendlay']]],
['seated-row','Seated Row','Remo sentado','Espalda',['Hipertrofia'],'row','strength-abs',[['Cable','en polea'],['Machine','en máquina'],['Wide Grip','agarre ancho']]],
['t-bar-row','T-Bar Row','Remo en T','Espalda',['Fuerza','Hipertrofia'],'row','strength-bw',[['Standard','estándar'],['Chest-Supported','con apoyo en pecho']]],
['face-pull','Face Pull','Face pull','Espalda',['Hipertrofia'],'pull','strength-abs',[['Cable','en polea'],['Band','con banda']]],
['straight-arm-pulldown','Straight-Arm Pulldown','Jalón con brazos rectos','Espalda',['Hipertrofia'],'pull','strength-abs',[['Cable','en polea'],['Band','con banda']]],
['shrug','Shrug','Encogimiento de hombros','Espalda',['Fuerza','Hipertrofia'],'raise','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Trap Bar','con trap bar']]],
['deadlift','Deadlift','Peso muerto','Espalda',['Fuerza'],'hinge','strength-bw',[['Conventional','convencional'],['Sumo','sumo'],['Romanian','rumano'],['Stiff-Leg','con piernas rígidas'],['Trap Bar','con trap bar'],['Deficit','en déficit'],['Snatch-Grip','agarre de arrancada']]],
['good-morning','Good Morning','Buenos días','Espalda',['Fuerza'],'hinge','strength-bw',[['Barbell','con barra'],['Seated','sentado']]],
['back-extension','Back Extension','Extensión lumbar','Espalda',['Fuerza','Calistenia'],'hinge','reps',[['Bodyweight','con peso corporal'],['Weighted','lastrada']]],
['overhead-press','Overhead Press','Press militar','Hombros',['Fuerza'],'press-overhead','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Seated Barbell','sentado con barra'],['Push Press','press de impulso'],['Arnold Press','Arnold press']]],
['lateral-raise','Lateral Raise','Elevación lateral','Hombros',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Machine','en máquina'],['Leaning','inclinado lateral']]],
['front-raise','Front Raise','Elevación frontal','Hombros',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Cable','en polea'],['Plate','con disco']]],
['rear-delt-fly','Rear Delt Fly','Elevación posterior','Hombros',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Machine','en máquina']]],
['upright-row','Upright Row','Remo al mentón','Hombros',['Hipertrofia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Cable','en polea']]],
['handstand-push-up','Handstand Push-Up','Flexión en pino','Hombros',['Calistenia'],'push','reps',[['Wall','en pared'],['Free','libre'],['Deficit','en déficit']]],
['bicep-curl','Bicep Curl','Curl de bíceps','Bíceps',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Cable','en polea'],['EZ Bar','con barra Z'],['Alternating','alterno']]],
['hammer-curl','Hammer Curl','Curl martillo','Bíceps',['Hipertrofia'],'curl','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Cross-Body','cruzado']]],
['preacher-curl','Preacher Curl','Curl predicador','Bíceps',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuerna'],['Machine','en máquina']]],
['concentration-curl','Concentration Curl','Curl concentrado','Bíceps',['Hipertrofia'],'curl','strength-abs',[['Dumbbell','con mancuerna']]],
['spider-curl','Spider Curl','Curl araña','Bíceps',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['chin-up','Chin-Up','Dominada supina','Bíceps',['Calistenia','Fuerza'],'pull','reps',[['Standard','estándar'],['Weighted','lastrada']]],
['tricep-extension','Tricep Extension','Extensión de tríceps','Tríceps',['Hipertrofia'],'extension','strength-abs',[['Overhead Dumbbell','sobre la cabeza con mancuerna'],['Overhead Cable','sobre la cabeza en polea'],['Lying Barbell','tumbado con barra'],['Cable','en polea']]],
['tricep-pushdown','Tricep Pushdown','Extensión de tríceps en polea','Tríceps',['Hipertrofia'],'extension','strength-abs',[['Rope','con cuerda'],['Bar','con barra'],['Reverse Grip','agarre supino'],['Single Arm','a un brazo']]],
['skull-crusher','Skull Crusher','Press francés','Tríceps',['Hipertrofia'],'extension','strength-abs',[['Barbell','con barra'],['EZ Bar','con barra Z'],['Dumbbell','con mancuernas']]],
['close-grip-bench','Close-Grip Bench Press','Press banca agarre cerrado','Tríceps',['Fuerza','Hipertrofia'],'push','strength-bw',[['Barbell','con barra'],['Smith Machine','en multipower']]],
['tricep-kickback','Tricep Kickback','Patada de tríceps','Tríceps',['Hipertrofia'],'extension','strength-abs',[['Dumbbell','con mancuerna'],['Cable','en polea']]],
['wrist-curl','Wrist Curl','Curl de muñeca','Antebrazos',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Behind Back','tras la espalda']]],
['reverse-curl','Reverse Curl','Curl inverso','Antebrazos',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Cable','en polea']]],
['farmers-carry','Farmer\u2019s Carry','Paseo del granjero','Antebrazos',['Fuerza','Atletismo'],'carry','strength-bw',[['Dumbbell','con mancuernas'],['Kettlebell','con kettlebells'],['Trap Bar','con trap bar']]],
['dead-hang','Dead Hang','Colgarse de la barra','Antebrazos',['Calistenia'],'carry','time',[['Standard','estándar'],['One-Arm','a un brazo'],['Towel','con toalla']]],
['crunch','Crunch','Abdominal crunch','Abdomen',['Hipertrofia'],'core','reps',[['Standard','estándar'],['Cable','en polea'],['Machine','en máquina'],['Bicycle','bicicleta'],['Reverse','inverso']]],
['plank','Plank','Plancha','Abdomen',['Calistenia','Equilibrio'],'core','time',[['Standard','estándar'],['Side','lateral'],['Weighted','lastrada'],['RKC','RKC']]],
['leg-raise','Leg Raise','Elevación de piernas','Abdomen',['Calistenia'],'core','reps',[['Lying','tumbado'],['Hanging','colgado'],['Captain’s Chair','en silla romana']]],
['russian-twist','Russian Twist','Giro ruso','Abdomen',['Hipertrofia'],'core','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso'],['Medicine Ball','con balón medicinal']]],
['sit-up','Sit-Up','Abdominal completo','Abdomen',['Hipertrofia'],'core','reps',[['Standard','estándar'],['Weighted','lastrado'],['Decline','en banco declinado']]],
['ab-wheel-rollout','Ab Wheel Rollout','Rueda abdominal','Abdomen',['Fuerza','Calistenia'],'core','reps',[['Kneeling','de rodillas'],['Standing','de pie']]],
['cable-crunch','Cable Crunch','Crunch en polea','Abdomen',['Hipertrofia'],'core','strength-abs',[['Standard','estándar'],['Kneeling','de rodillas']]],
['mountain-climber','Mountain Climber','Escalador','Abdomen',['Resistencia','Calistenia'],'core','reps',[['Standard','estándar'],['Cross-Body','cruzado'],['Slider','con deslizadores']]],
['l-sit','L-Sit','L-sit','Abdomen',['Calistenia'],'core','time',[['Floor','en suelo'],['Parallettes','en paralelas'],['Hanging','colgado']]],
['dragon-flag','Dragon Flag','Dragon flag','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar'],['Negative','negativa']]],
['hip-thrust','Hip Thrust','Hip thrust','Glúteos',['Fuerza','Hipertrofia'],'hinge','strength-bw',[['Barbell','con barra'],['Machine','en máquina'],['Single-Leg','a una pierna'],['Banded','con banda']]],
['glute-bridge','Glute Bridge','Puente de glúteos','Glúteos',['Calistenia','Hipertrofia'],'hinge','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso'],['Single-Leg','a una pierna']]],
['cable-kickback','Cable Kickback','Patada de glúteo en polea','Glúteos',['Hipertrofia'],'extension','strength-abs',[['Standard','estándar'],['Banded','con banda']]],
['bulgarian-split-squat','Bulgarian Split Squat','Sentadilla búlgara','Glúteos',['Fuerza','Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['step-up','Step-Up','Subida al cajón','Glúteos',['Fuerza','Atletismo'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['squat','Squat','Sentadilla','Cuádriceps',['Fuerza'],'squat','strength-bw',[['Back Barbell','trasera con barra'],['Front Barbell','frontal con barra'],['Goblet','goblet'],['Box','al cajón'],['Overhead','overhead'],['Pause','con pausa'],['Zercher','Zercher']]],
['leg-press','Leg Press','Prensa de piernas','Cuádriceps',['Fuerza','Hipertrofia'],'squat','strength-abs',[['Standard','estándar'],['Single-Leg','a una pierna'],['45 Degree','a 45 grados']]],
['leg-extension','Leg Extension','Extensión de cuádriceps','Cuádriceps',['Hipertrofia'],'extension','strength-abs',[['Standard','estándar'],['Single-Leg','a una pierna']]],
['lunge','Lunge','Zancada','Cuádriceps',['Fuerza','Atletismo'],'lunge','strength-bw',[['Walking','caminando'],['Reverse','inversa'],['Dumbbell','con mancuernas'],['Barbell','con barra'],['Curtsy','curtsy']]],
['sissy-squat','Sissy Squat','Sissy squat','Cuádriceps',['Calistenia'],'squat','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['wall-sit','Wall Sit','Silla contra la pared','Cuádriceps',['Calistenia'],'squat','time',[['Standard','estándar'],['Weighted','con peso']]],
['pistol-squat','Pistol Squat','Sentadilla a una pierna','Cuádriceps',['Calistenia','Equilibrio'],'squat','reps',[['Assisted','asistida'],['Free','libre'],['Weighted','lastrada']]],
['leg-curl','Leg Curl','Curl femoral','Isquiotibiales',['Hipertrofia'],'curl','strength-abs',[['Lying','tumbado'],['Seated','sentado'],['Standing','de pie'],['Single-Leg','a una pierna']]],
['nordic-curl','Nordic Curl','Curl nórdico','Isquiotibiales',['Calistenia','Fuerza'],'curl','reps',[['Standard','estándar'],['Assisted','asistido']]],
['glute-ham-raise','Glute-Ham Raise','Glute-ham raise','Isquiotibiales',['Fuerza','Calistenia'],'curl','reps',[['Standard','estándar'],['Weighted','lastrado']]],
['calf-raise','Calf Raise','Elevación de talones','Gemelos',['Hipertrofia'],'calf','strength-bw',[['Standing','de pie'],['Seated','sentado'],['Donkey','burro'],['Single-Leg','a una pierna'],['Leg Press','en prensa']]],
['clean-and-jerk','Clean and Jerk','Dos tiempos','Cuerpo completo',['Fuerza','Potencia'],'squat','strength-bw',[['Standard','estándar'],['Power','power'],['Squat Clean','clean en sentadilla']]],
['snatch','Snatch','Arrancada','Cuerpo completo',['Fuerza','Potencia'],'squat','strength-bw',[['Standard','estándar'],['Power','power'],['Hang','hang']]],
['kettlebell-swing','Kettlebell Swing','Swing con kettlebell','Cuerpo completo',['Potencia','Resistencia'],'hinge','strength-bw',[['Two-Hand','a dos manos'],['One-Hand','a una mano'],['American','americano']]],
['burpee','Burpee','Burpee','Cuerpo completo',['Resistencia','Calistenia'],'plyo','reps',[['Standard','estándar'],['Push-Up','con flexión'],['Box Jump','con salto al cajón'],['One-Arm','a un brazo']]],
['thruster','Thruster','Thruster','Cuerpo completo',['Potencia','Resistencia'],'squat','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Kettlebell','con kettlebell']]],
['turkish-get-up','Turkish Get-Up','Turkish get-up','Cuerpo completo',['Fuerza','Equilibrio'],'core','strength-bw',[['Kettlebell','con kettlebell'],['Dumbbell','con mancuerna']]],
['sled-push','Sled Push','Empuje de trineo','Cuerpo completo',['Potencia','Atletismo'],'carry','strength-bw',[['Push','empuje'],['Pull','arrastre']]],
['battle-ropes','Battle Ropes','Cuerdas de batalla','Cuerpo completo',['Resistencia','Potencia'],'cardio','time',[['Alternating Waves','olas alternas'],['Slams','golpes']]],
['box-jump','Box Jump','Salto al cajón','Cuerpo completo',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar'],['Single-Leg','a una pierna']]],
['muscle-up','Muscle-Up','Muscle-up','Cuerpo completo',['Calistenia'],'calisthenics','reps',[['Bar','en barra'],['Ring','en anillas']]],
['human-flag','Human Flag','Bandera humana','Cuerpo completo',['Calistenia'],'calisthenics','time',[['Full','completa'],['Tucked','recogida']]],
['front-lever','Front Lever','Front lever','Cuerpo completo',['Calistenia'],'calisthenics','time',[['Full','completo'],['Tuck','recogido'],['Advanced Tuck','recogido avanzado'],['One-Leg','a una pierna']]],
['back-lever','Back Lever','Back lever','Cuerpo completo',['Calistenia'],'calisthenics','time',[['Full','completo'],['Tuck','recogido']]],
['planche','Planche','Planche','Cuerpo completo',['Calistenia'],'calisthenics','time',[['Full','completo'],['Tuck','recogido'],['Advanced Tuck','recogido avanzado'],['Straddle','straddle']]],
['handstand','Handstand','Pino','Cuerpo completo',['Calistenia','Equilibrio'],'calisthenics','time',[['Wall','en pared'],['Free','libre'],['One-Arm','a un brazo']]],
['sprint','Sprint','Sprint','Cuerpo completo',['Velocidad','Atletismo'],'cardio','distance-time',[['100m','100 metros'],['200m','200 metros'],['400m','400 metros']]],
['broad-jump','Broad Jump','Salto de longitud','Cuerpo completo',['Velocidad','Potencia'],'plyo','distance',[['Standing','desde parado'],['Triple','triple']]],
['vertical-jump','Vertical Jump','Salto vertical','Cuerpo completo',['Potencia','Atletismo'],'plyo','distance',[['Standing','desde parado'],['Approach','con carrera']]],
['bounding','Bounding','Zancadas de potencia','Cuerpo completo',['Velocidad','Atletismo'],'plyo','reps',[['Standard','estándar'],['Single-Leg','a una pierna']]],
['agility-ladder','Agility Ladder','Escalera de agilidad','Cuerpo completo',['Velocidad','Atletismo'],'cardio','time',[['In-In-Out-Out','dentro-dentro-fuera-fuera'],['Icky Shuffle','icky shuffle']]],
['shuttle-run','Shuttle Run','Carrera de ida y vuelta','Cuerpo completo',['Velocidad','Atletismo'],'cardio','distance-time',[['5-10-5','5-10-5'],['Standard','estándar']]],
['hip-flexor-stretch','Hip Flexor Stretch','Estiramiento de flexores de cadera','Cuádriceps',['Flexibilidad'],'stretch','time',[['Kneeling','de rodillas'],['Standing','de pie']]],
['hamstring-stretch','Hamstring Stretch','Estiramiento de isquiotibiales','Isquiotibiales',['Flexibilidad'],'stretch','time',[['Standing','de pie'],['Seated','sentado'],['Lying','tumbado']]],
['shoulder-dislocate','Shoulder Dislocate','Dislocaciones de hombro','Hombros',['Flexibilidad'],'stretch','reps',[['Band','con banda'],['Stick','con palo']]],
['cat-cow','Cat-Cow','Gato-vaca','Espalda',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['cossack-squat','Cossack Squat','Sentadilla cosaca','Cuádriceps',['Flexibilidad','Calistenia'],'squat','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['split-stretch','Split Stretch','Estiramiento de spagat','Cuádriceps',['Flexibilidad'],'stretch','time',[['Front Split','spagat frontal'],['Side Split','spagat lateral']]],
['thoracic-rotation','Thoracic Rotation','Rotación torácica','Espalda',['Flexibilidad'],'stretch','reps',[['Quadruped','a cuatro patas'],['Side-Lying','tumbado de lado']]],
['pigeon-pose','Pigeon Pose','Postura de la paloma','Glúteos',['Flexibilidad'],'stretch','time',[['Standard','estándar'],['Reclined','reclinada']]],
['worlds-greatest-stretch','World\u2019s Greatest Stretch','El mejor estiramiento del mundo','Cuerpo completo',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['running','Running','Correr','Cuerpo completo',['Resistencia','Atletismo'],'cardio','distance-time',[['5K','5 km'],['10K','10 km'],['Half Marathon','media maratón'],['Marathon','maratón']]],
['cycling','Cycling','Ciclismo','Cuerpo completo',['Resistencia'],'cardio','distance-time',[['20K','20 km'],['40K','40 km'],['Hill Climb','subida']]],
['rowing','Rowing','Remo (máquina)','Cuerpo completo',['Resistencia','Fuerza'],'cardio','distance-time',[['2000m','2000 metros'],['5000m','5000 metros']]],
['jump-rope','Jump Rope','Comba','Cuerpo completo',['Resistencia','Velocidad'],'cardio','time',[['Standard','estándar'],['Double Under','doble salto']]],
['swimming','Swimming','Natación','Cuerpo completo',['Resistencia'],'cardio','distance-time',[['500m','500 metros'],['1000m','1000 metros'],['1500m','1500 metros']]],
['stair-climb','Stair Climb','Subida de escaleras','Cuerpo completo',['Resistencia','Atletismo'],'cardio','time',[['Standard','estándar'],['Weighted','con peso']]],
['pec-deck','Pec Deck','Pec deck','Pecho',['Hipertrofia'],'raise','strength-abs',[['Standard','estándar'],['Single Arm','a un brazo']]],
['zottman-curl','Zottman Curl','Curl Zottman','Bíceps',['Hipertrofia'],'curl','strength-abs',[['Dumbbell','con mancuernas']]],
['drag-curl','Drag Curl','Curl drag','Bíceps',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['jm-press','JM Press','Press JM','Tríceps',['Hipertrofia','Fuerza'],'extension','strength-abs',[['Barbell','con barra'],['EZ Bar','con barra Z']]],
['tate-press','Tate Press','Press Tate','Tríceps',['Hipertrofia'],'extension','strength-abs',[['Dumbbell','con mancuernas']]],
['cable-woodchopper','Cable Woodchopper','Leñador en polea','Abdomen',['Hipertrofia','Atletismo'],'core','reps',[['High to Low','de arriba a abajo'],['Low to High','de abajo a arriba']]],
['pallof-press','Pallof Press','Pallof press','Abdomen',['Fuerza','Equilibrio'],'core','reps',[['Standing','de pie'],['Kneeling','de rodillas']]],
['reverse-hyperextension','Reverse Hyperextension','Hiperextensión inversa','Isquiotibiales',['Fuerza','Hipertrofia'],'hinge','strength-abs',[['Machine','en máquina'],['Bench','en banco']]],
['hip-abduction','Hip Abduction','Abducción de cadera','Glúteos',['Hipertrofia'],'raise','strength-abs',[['Machine','en máquina'],['Cable','en polea'],['Band','con banda']]],
['hip-adduction','Hip Adduction','Aducción de cadera','Glúteos',['Hipertrofia'],'raise','strength-abs',[['Machine','en máquina'],['Cable','en polea'],['Band','con banda']]],
['landmine-press','Landmine Press','Press landmine','Hombros',['Fuerza','Hipertrofia'],'press-overhead','strength-bw',[['Standard','estándar'],['Single Arm','a un brazo']]],
['cuban-press','Cuban Press','Press cubano','Hombros',['Hipertrofia'],'press-overhead','strength-abs',[['Dumbbell','con mancuernas']]],
['y-raise','Y-Raise','Elevación en Y','Hombros',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Incline Bench','en banco inclinado']]],
['renegade-row','Renegade Row','Remo renegado','Espalda',['Fuerza','Resistencia'],'row','strength-abs',[['Dumbbell','con mancuernas']]],
['man-maker','Man Maker','Man maker','Cuerpo completo',['Resistencia','Potencia'],'plyo','reps',[['Dumbbell','con mancuernas']]],
['wall-ball','Wall Ball','Wall ball','Cuerpo completo',['Potencia','Resistencia'],'squat','reps',[['Standard','estándar']]],
['medicine-ball-slam','Medicine Ball Slam','Golpe con balón medicinal','Cuerpo completo',['Potencia'],'plyo','reps',[['Overhead','sobre la cabeza'],['Rotational','rotacional']]],
['tuck-jump','Tuck Jump','Salto con rodillas al pecho','Cuerpo completo',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['depth-jump','Depth Jump','Salto en profundidad','Cuerpo completo',['Potencia'],'plyo','reps',[['Standard','estándar']]],
['lateral-bound','Lateral Bound','Salto lateral','Cuádriceps',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['bear-crawl','Bear Crawl','Marcha del oso','Cuerpo completo',['Calistenia','Resistencia'],'core','time',[['Forward','hacia delante'],['Lateral','lateral']]],
['crab-walk','Crab Walk','Marcha del cangrejo','Cuerpo completo',['Calistenia'],'core','time',[['Standard','estándar']]],
['inchworm','Inchworm','Inchworm','Cuerpo completo',['Flexibilidad','Calistenia'],'stretch','reps',[['Standard','estándar']]],
['superman','Superman','Superman','Espalda',['Calistenia','Hipertrofia'],'hinge','reps',[['Standard','estándar'],['Alternating','alterno']]],
['bird-dog','Bird Dog','Bird dog','Abdomen',['Equilibrio','Calistenia'],'core','reps',[['Standard','estándar'],['Weighted','con peso']]],
['single-leg-deadlift','Single-Leg Deadlift','Peso muerto a una pierna','Isquiotibiales',['Fuerza','Equilibrio'],'hinge','strength-bw',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell'],['Bodyweight','con peso corporal']]],
['typewriter-pull-up','Typewriter Pull-Up','Dominada typewriter','Espalda',['Calistenia'],'pull','reps',[['Standard','estándar']]],
['skin-the-cat','Skin the Cat','Skin the cat','Cuerpo completo',['Calistenia'],'calisthenics','reps',[['Ring','en anillas'],['Bar','en barra']]],
['rope-climb','Rope Climb','Trepa de cuerda','Espalda',['Calistenia','Fuerza'],'pull','time',[['Legless','sin piernas'],['Standard','estándar']]],
['tire-flip','Tire Flip','Volteo de neumático','Cuerpo completo',['Potencia','Fuerza'],'hinge','reps',[['Standard','estándar']]],
['yoke-carry','Yoke Carry','Yoke carry','Cuerpo completo',['Fuerza','Atletismo'],'carry','strength-bw',[['Standard','estándar']]],
['suitcase-carry','Suitcase Carry','Suitcase carry','Antebrazos',['Fuerza','Equilibrio'],'carry','strength-bw',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell']]],
['overhead-carry','Overhead Carry','Overhead carry','Hombros',['Fuerza','Equilibrio'],'carry','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Kettlebell','con kettlebells']]],
['wrist-roller','Wrist Roller','Rodillo de muñeca','Antebrazos',['Fuerza','Hipertrofia'],'curl','reps',[['Standard','estándar']]],
['plate-pinch','Plate Pinch','Pellizco de disco','Antebrazos',['Fuerza'],'carry','time',[['Standard','estándar']]],
['tibialis-raise','Tibialis Raise','Elevación de tibial','Gemelos',['Hipertrofia'],'calf','reps',[['Standard','estándar'],['Weighted','con peso']]],
['jefferson-curl','Jefferson Curl','Jefferson curl','Espalda',['Flexibilidad'],'stretch','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['scorpion-stretch','Scorpion Stretch','Estiramiento escorpión','Espalda',['Flexibilidad'],'stretch','reps',[['Standard','estándar']]],
['frog-stretch','Frog Stretch','Estiramiento de rana','Glúteos',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['butterfly-stretch','Butterfly Stretch','Estiramiento mariposa','Glúteos',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['standing-quad-stretch','Standing Quad Stretch','Estiramiento de cuádriceps de pie','Cuádriceps',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['downward-dog','Downward Dog','Perro boca abajo','Cuerpo completo',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['cobra-stretch','Cobra Stretch','Estiramiento cobra','Abdomen',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['childs-pose','Child\u2019s Pose','Postura del niño','Espalda',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['seal-stretch','Seal Stretch','Estiramiento de foca','Abdomen',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['couch-stretch','Couch Stretch','Couch stretch','Cuádriceps',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['ankle-mobility','Ankle Mobility Drill','Movilidad de tobillo','Gemelos',['Flexibilidad'],'stretch','reps',[['Standard','estándar'],['Weighted','con peso']]],
['band-pull-apart','Band Pull-Apart','Apertura con banda','Espalda',['Hipertrofia'],'raise','reps',[['Standard','estándar']]],
['scapular-pull-up','Scapular Pull-Up','Dominada escapular','Espalda',['Calistenia'],'pull','reps',[['Standard','estándar']]],
['seated-good-morning','Seated Good Morning','Buenos días sentado','Espalda',['Fuerza'],'hinge','strength-bw',[['Barbell','con barra']]],
['zercher-carry','Zercher Carry','Zercher carry','Cuerpo completo',['Fuerza'],'carry','strength-bw',[['Standard','estándar']]],
['single-arm-farmers-carry','Single-Arm Farmer\u2019s Carry','Paseo del granjero a un brazo','Antebrazos',['Fuerza','Equilibrio'],'carry','strength-bw',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell']]],
['prowler-push','Prowler Push','Empuje de prowler','Cuerpo completo',['Potencia','Resistencia'],'carry','strength-bw',[['Low Handle','manillar bajo'],['High Handle','manillar alto']]],
['clean-pull','Clean Pull','Tirón de clean','Cuerpo completo',['Fuerza','Potencia'],'hinge','strength-bw',[['Standard','estándar']]],
['snatch-pull','Snatch Pull','Tirón de arrancada','Cuerpo completo',['Fuerza','Potencia'],'hinge','strength-bw',[['Standard','estándar']]],
['push-press','Push Press','Push press','Hombros',['Fuerza','Potencia'],'press-overhead','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['behind-neck-press','Behind the Neck Press','Press tras nuca','Hombros',['Fuerza'],'press-overhead','strength-bw',[['Barbell','con barra']]],
['single-arm-shoulder-press','Single-Arm Shoulder Press','Press de hombro a un brazo','Hombros',['Fuerza','Hipertrofia'],'press-overhead','strength-abs',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell']]],
['incline-row','Incline Row','Remo inclinado','Espalda',['Hipertrofia'],'row','strength-abs',[['Dumbbell','con mancuernas']]],
['meadows-row','Meadows Row','Remo Meadows','Espalda',['Hipertrofia'],'row','strength-abs',[['Barbell','con barra']]],
['chest-supported-row','Chest-Supported Row','Remo con apoyo en pecho','Espalda',['Hipertrofia'],'row','strength-abs',[['Dumbbell','con mancuernas'],['Machine','en máquina']]],
['inverted-row','Inverted Row','Remo invertido','Espalda',['Calistenia'],'row','reps',[['Bodyweight','con peso corporal'],['Feet Elevated','pies elevados']]],
['single-arm-lat-pulldown','Single-Arm Lat Pulldown','Jalón al pecho a un brazo','Espalda',['Hipertrofia'],'pull','strength-abs',[['Cable','en polea']]],
['sumo-squat','Sumo Squat','Sentadilla sumo','Glúteos',['Fuerza','Hipertrofia'],'squat','strength-bw',[['Dumbbell','con mancuerna'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['curtsy-lunge','Curtsy Lunge','Zancada curtsy','Glúteos',['Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Bodyweight','con peso corporal']]],
['donkey-kick','Donkey Kick','Patada de burro','Glúteos',['Hipertrofia','Calistenia'],'extension','reps',[['Bodyweight','con peso corporal'],['Banded','con banda'],['Cable','en polea']]],
['fire-hydrant','Fire Hydrant','Fire hydrant','Glúteos',['Hipertrofia','Calistenia'],'raise','reps',[['Bodyweight','con peso corporal'],['Banded','con banda']]],
['clamshell','Clamshell','Almeja','Glúteos',['Hipertrofia'],'raise','reps',[['Bodyweight','con peso corporal'],['Banded','con banda']]],
['hack-squat','Hack Squat','Sentadilla hack','Cuádriceps',['Fuerza','Hipertrofia'],'squat','strength-abs',[['Machine','en máquina'],['Barbell','con barra']]],
['front-foot-elevated-split-squat','Front-Foot Elevated Split Squat','Zancada búlgara pie elevado','Cuádriceps',['Fuerza','Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas']]],
['jump-squat','Jump Squat','Sentadilla con salto','Cuádriceps',['Potencia'],'plyo','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['spanish-squat','Spanish Squat','Sentadilla española','Cuádriceps',['Fuerza','Flexibilidad'],'squat','time',[['Band','con banda']]],
['seated-leg-curl','Seated Leg Curl','Curl femoral sentado','Isquiotibiales',['Hipertrofia'],'curl','strength-abs',[['Machine','en máquina']]],
['stability-ball-leg-curl','Stability Ball Leg Curl','Curl femoral en fitball','Isquiotibiales',['Calistenia'],'curl','reps',[['Standard','estándar']]],
['standing-calf-raise-machine','Standing Calf Raise Machine','Elevación de talones en máquina de pie','Gemelos',['Hipertrofia'],'calf','strength-abs',[['Standard','estándar']]],
['jump-rope-double-under','Double Under','Doble salto de comba','Cuerpo completo',['Resistencia','Velocidad'],'cardio','reps',[['Standard','estándar']]],
['assault-bike','Assault Bike','Bicicleta de asalto','Cuerpo completo',['Resistencia','Potencia'],'cardio','time',[['Calories','calorías'],['Distance','distancia']]],
['ski-erg','Ski Erg','Ski erg','Cuerpo completo',['Resistencia'],'cardio','distance-time',[['500m','500 metros'],['1000m','1000 metros']]],
['elliptical','Elliptical','Elíptica','Cuerpo completo',['Resistencia'],'cardio','time',[['Standard','estándar']]],
['incline-treadmill-walk','Incline Treadmill Walk','Caminata en cinta inclinada','Cuerpo completo',['Resistencia'],'cardio','time',[['Standard','estándar']]],
['triple-jump','Triple Jump','Triple salto','Cuerpo completo',['Velocidad','Potencia'],'plyo','distance',[['Standard','estándar']]],
['hurdle-hop','Hurdle Hop','Salto de vallas','Cuerpo completo',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['cone-drill','Cone Drill','Ejercicio de conos','Cuerpo completo',['Velocidad','Atletismo'],'cardio','time',[['T-Drill','T-drill'],['L-Drill','L-drill']]],
['medicine-ball-throw','Medicine Ball Throw','Lanzamiento de balón medicinal','Cuerpo completo',['Potencia'],'plyo','distance',[['Chest Pass','pase de pecho'],['Overhead Throw','lanzamiento sobre cabeza'],['Rotational Throw','lanzamiento rotacional']]],
['pistol-box-squat','Pistol Box Squat','Pistol squat al cajón','Cuádriceps',['Calistenia','Equilibrio'],'squat','reps',[['Standard','estándar']]],
['shrimp-squat','Shrimp Squat','Shrimp squat','Cuádriceps',['Calistenia','Equilibrio'],'squat','reps',[['Standard','estándar']]],
['bulgarian-split-squat-jump','Bulgarian Split Squat Jump','Sentadilla búlgara con salto','Glúteos',['Potencia'],'plyo','reps',[['Standard','estándar']]],
['side-plank','Side Plank','Plancha lateral','Abdomen',['Calistenia','Equilibrio'],'core','time',[['Standard','estándar'],['With Rotation','con rotación'],['With Leg Lift','con elevación de pierna']]],
['hollow-body-hold','Hollow Body Hold','Hollow body hold','Abdomen',['Calistenia'],'core','time',[['Standard','estándar'],['Rocking','con balanceo']]],
['v-up','V-Up','V-up','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar'],['Weighted','con peso']]],
['toes-to-bar','Toes to Bar','Toes to bar','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar'],['Knee Raise','elevación de rodillas']]],
['windshield-wiper','Windshield Wiper','Limpiaparabrisas','Abdomen',['Calistenia'],'core','reps',[['Hanging','colgado'],['Lying','tumbado']]],
['stir-the-pot','Stir the Pot','Stir the pot','Abdomen',['Calistenia','Equilibrio'],'core','time',[['Standard','estándar']]],
['sled-drag','Sled Drag','Arrastre de trineo','Cuerpo completo',['Fuerza','Atletismo'],'carry','strength-bw',[['Forward','hacia delante'],['Backward','hacia atrás']]],
['pike-push-up','Pike Push-Up','Flexión pike','Hombros',['Calistenia'],'push','reps',[['Standard','estándar'],['Feet Elevated','pies elevados']]],
['diamond-push-up','Diamond Push-Up','Flexión diamante','Tríceps',['Calistenia'],'push','reps',[['Standard','estándar'],['Knees','de rodillas']]],
['spoto-press','Spoto Press','Press Spoto','Pecho',['Fuerza'],'push','strength-bw',[['Barbell','con barra']]],
['floor-press','Floor Press','Press en suelo','Pecho',['Fuerza'],'push','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['svend-press','Svend Press','Press Svend','Pecho',['Hipertrofia'],'push','strength-abs',[['Plate','con disco']]],
['guillotine-press','Guillotine Press','Press guillotina','Pecho',['Hipertrofia'],'push','strength-bw',[['Barbell','con barra']]],
['landmine-row','Landmine Row','Remo landmine','Espalda',['Fuerza','Hipertrofia'],'row','strength-bw',[['Standard','estándar'],['Single Arm','a un brazo']]],
['seal-row','Seal Row','Remo seal','Espalda',['Hipertrofia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['kroc-row','Kroc Row','Remo Kroc','Espalda',['Fuerza','Hipertrofia'],'row','strength-abs',[['Dumbbell','con mancuerna']]],
['pendlay-row-alt','High Pull Row','Remo con tirón alto','Espalda',['Fuerza','Potencia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['cable-pullthrough','Cable Pull-Through','Pull-through en polea','Glúteos',['Hipertrofia'],'hinge','strength-abs',[['Standard','estándar']]],
['banded-hip-thrust','Banded Hip Thrust','Hip thrust con banda','Glúteos',['Hipertrofia'],'hinge','reps',[['Standard','estándar']]],
['step-down','Step-Down','Bajada del cajón','Cuádriceps',['Fuerza','Equilibrio'],'lunge','strength-bw',[['Standard','estándar']]],
['reverse-lunge','Reverse Lunge','Zancada inversa','Cuádriceps',['Fuerza','Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['lateral-lunge','Lateral Lunge','Zancada lateral','Cuádriceps',['Fuerza','Flexibilidad'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Bodyweight','con peso corporal']]],
['skater-jump','Skater Jump','Salto de patinador','Cuádriceps',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['ice-skater','Speed Skater','Speed skater','Cuádriceps',['Atletismo','Resistencia'],'plyo','reps',[['Standard','estándar']]],
['wall-angel','Wall Angel','Ángel de pared','Hombros',['Flexibilidad'],'stretch','reps',[['Standard','estándar']]],
['doorway-stretch','Doorway Chest Stretch','Estiramiento de pecho en puerta','Pecho',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['triceps-stretch','Overhead Triceps Stretch','Estiramiento de tríceps sobre cabeza','Tríceps',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['lat-stretch','Lat Stretch','Estiramiento de dorsal','Espalda',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['neck-stretch','Neck Stretch','Estiramiento de cuello','Hombros',['Flexibilidad'],'stretch','time',[['Lateral','lateral'],['Forward','frontal']]],
['ankle-hop','Ankle Hop','Salto de tobillo','Gemelos',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['seated-jump','Seated Box Jump','Salto al cajón desde sentado','Cuerpo completo',['Potencia'],'plyo','reps',[['Standard','estándar']]],
['plank-to-push-up','Plank to Push-Up','Plancha a flexión','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar']]],
['dead-bug','Dead Bug','Dead bug','Abdomen',['Calistenia','Equilibrio'],'core','reps',[['Standard','estándar'],['Weighted','con peso']]],
['flutter-kick','Flutter Kick','Flutter kick','Abdomen',['Calistenia','Resistencia'],'core','time',[['Standard','estándar']]],
['scissor-kick','Scissor Kick','Scissor kick','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar']]],
['copenhagen-plank','Copenhagen Plank','Plancha Copenhagen','Cuádriceps',['Fuerza','Flexibilidad'],'core','time',[['Full','completa'],['Bent Knee','rodilla flexionada']]],
['nordic-hamstring-curl','Nordic Hamstring Curl','Curl nórdico de isquios asistido','Isquiotibiales',['Fuerza','Calistenia'],'curl','reps',[['Machine','en máquina'],['Assisted','asistido']]],
['banded-lateral-walk','Banded Lateral Walk','Paso lateral con banda','Glúteos',['Hipertrofia','Atletismo'],'lunge','reps',[['Standard','estándar']]],
['monster-walk','Monster Walk','Monster walk','Glúteos',['Hipertrofia'],'lunge','reps',[['Standard','estándar']]],
['single-leg-calf-raise','Single-Leg Calf Raise','Elevación de talón a una pierna','Gemelos',['Hipertrofia','Equilibrio'],'calf','strength-bw',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['seated-wrist-extension','Wrist Extension','Extensión de muñeca','Antebrazos',['Hipertrofia'],'extension','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['towel-hang-swing','Towel Hang Swing','Balanceo colgado con toalla','Antebrazos',['Fuerza','Calistenia'],'carry','time',[['Standard','estándar']]],
];

let EXERCISE_CATALOG = null;
function slugify(s){ return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function buildExerciseCatalog(){
  if(EXERCISE_CATALOG) return EXERCISE_CATALOG;
  const list = [];
  EXERCISE_BASES.forEach(row=>{
    const [id, en, es, muscle, objectives, pattern, scoreType, variants] = row;
    const info = PATTERN_INFO[pattern] || PATTERN_INFO.core;
    variants.forEach(([ven, ves])=>{
      const fullEn = ven ? `${ven} ${en}` : en;
      const fullEs = ves ? `${es} ${ves}` : es;
      list.push({
        id: id + '__' + slugify(ven||'base'),
        baseId: id, en: fullEn, es: fullEs, muscle, objectives, pattern, scoreType,
        desc: info.desc(fullEs), steps: info.steps
      });
    });
  });
  EXERCISE_CATALOG = list;
  return list;
}
function getExerciseById(id){ return buildExerciseCatalog().find(e=>e.id===id); }
function getExerciseByName(name){
  const n = (name||'').trim().toLowerCase();
  if(!n) return null;
  return buildExerciseCatalog().find(e=>e.en.toLowerCase()===n || e.es.toLowerCase()===n) || null;
}
/* Distancia de edición (Levenshtein) para búsqueda tolerante a errores ortográficos */
function levenshtein(a, b){
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  if(m===0) return n; if(n===0) return m;
  let prev = Array(n+1).fill(0).map((_,j)=>j);
  for(let i=1;i<=m;i++){
    const cur = [i];
    for(let j=1;j<=n;j++){
      cur[j] = a[i-1]===b[j-1] ? prev[j-1] : 1 + Math.min(prev[j-1], prev[j], cur[j-1]);
    }
    prev = cur;
  }
  return prev[n];
}
function searchExercises(query, { muscle=null, objective=null } = {}){
  const catalog = buildExerciseCatalog();
  let list = catalog;
  if(muscle) list = list.filter(e=>e.muscle===muscle);
  if(objective) list = list.filter(e=>e.objectives.includes(objective));
  const q = (query||'').trim().toLowerCase();
  if(!q) return list;
  const queryWords = q.split(/\s+/).filter(Boolean);
  const scored = list.map(e=>{
    const en = e.en.toLowerCase(), es = e.es.toLowerCase();
    if(en.includes(q) || es.includes(q)) return { e, score:-1000 }; // coincidencia exacta de frase: máxima prioridad
    const catalogWords = (en+' '+es).split(/[\s-]+/).filter(Boolean);
    let total = 0;
    for(const qw of queryWords){
      let best = 999;
      for(const cw of catalogWords){
        if(cw===qw){ best = 0; break; }
        if(cw.startsWith(qw) || qw.startsWith(cw)){ best = Math.min(best, 1); continue; }
        const d = levenshtein(qw, cw);
        if(d < best) best = d;
      }
      const tolerance = Math.max(1, Math.ceil(qw.length*0.34));
      if(best > tolerance) return { e, score:9999 }; // esta palabra de la búsqueda no encaja con nada: descartar
      total += best;
    }
    return { e, score: total };
  });
  return scored.filter(s=>s.score < 9999).sort((a,b)=>a.score-b.score).map(s=>s.e);
}

/* =========================================================
   RANGOS POR EJERCICIO: umbrales según el tipo de puntuación
========================================================= */
const SCORE_MULTIPLIERS = {
  squat:[0.75,1.1,1.5,1.9,2.3,2.75], hinge:[0.9,1.3,1.75,2.2,2.7,3.2],
  push:[0.4,0.6,0.85,1.1,1.4,1.7], press:[0.3,0.45,0.6,0.8,1,1.2],
  pull:[0.25,0.4,0.55,0.7,0.9,1.1], row:[0.3,0.45,0.6,0.8,1,1.2],
  raise:[0.06,0.1,0.15,0.2,0.26,0.33], curl:[0.1,0.16,0.22,0.3,0.38,0.47],
  extension:[0.08,0.13,0.18,0.24,0.31,0.39], calf:[0.4,0.6,0.85,1.1,1.4,1.7],
  lunge:[0.3,0.5,0.7,0.95,1.2,1.5], carry:[0.6,0.9,1.2,1.6,2,2.4],
  default:[0.2,0.35,0.5,0.68,0.88,1.1]
};
function strengthTierForExercise(ex, bodyWeightKg, bestKg){
  if(!bestKg || !bodyWeightKg) return 0;
  const type = ex.scoreType==='strength-bw' ? (ex.pattern==='press-overhead'?'press':ex.pattern) : 'default';
  const mults = SCORE_MULTIPLIERS[type] || SCORE_MULTIPLIERS.default;
  const ratio = bestKg / bodyWeightKg;
  let tier = 0;
  mults.forEach((m,i)=>{ if(ratio >= m) tier = i+1; });
  return tier;
}
const REPS_TIER_THRESHOLDS = [3,8,15,25,40,60];
const TIME_TIER_THRESHOLDS = [10,25,45,70,100,140]; // segundos
function repsOrTimeTier(scoreType, best){
  if(!best) return 0;
  const thresholds = scoreType==='time' ? TIME_TIER_THRESHOLDS : REPS_TIER_THRESHOLDS;
  let tier = 0;
  thresholds.forEach((t,i)=>{ if(best >= t) tier = i+1; });
  return tier;
}
