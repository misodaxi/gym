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
    routineTemplates: [], workoutSessions: [], savedPosts: [],
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
  const comment = { id:Date.now(), from:fromUser, text, date:new Date().toLocaleString('es-ES') };
  await mutatePost(postId, post=>{ post.comments = post.comments || []; post.comments.push(comment); }, `Comentario en ${postId}`);
  return comment;
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
async function sendDirectMessage(from, to, text){
  const cid = conversationId(from, to);
  const msg = { id:Date.now().toString(36)+Math.random().toString(36).slice(2,5), from, to, text:(text||'').trim(), date:new Date().toISOString(), readBy:[from] };
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
