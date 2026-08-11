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
  x:'<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  search:'<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  dumbbell:'<line x1="6" y1="12" x2="18" y2="12"></line><rect x="2" y="9" width="3" height="6" rx="1"></rect><rect x="19" y="9" width="3" height="6" rx="1"></rect><rect x="6" y="7" width="3" height="10" rx="1"></rect><rect x="15" y="7" width="3" height="10" rx="1"></rect>',
  target:'<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
  users:'<circle cx="9" cy="8" r="3.2"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17.5" cy="9" r="2.6"></circle><path d="M15 12.2a5.2 5.2 0 0 1 6.5 5"></path>',
  chart:'<polyline points="3 17 9 11 13 15 21 6"></polyline><polyline points="15 6 21 6 21 12"></polyline>',
  bars:'<rect x="4" y="12" width="4" height="8" rx="1"></rect><rect x="10" y="7" width="4" height="13" rx="1"></rect><rect x="16" y="3" width="4" height="17" rx="1"></rect>',
};
function icon(name, size=15){
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;
}
function iconFilled(name, size=15){
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="none">${ICONS[name]||''}</svg>`;
}
function emptyState(iconName, text){
  return `<div class="empty-state"><div class="empty-state-icon">${icon(iconName,22)}</div><p>${text}</p></div>`;
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
    nutrition: [], steps: [], sleep: [], waterLog: [], wellbeing: [],
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
  acc.wellbeing = acc.wellbeing || [];
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
  merged.wellbeing = mergeArrayField(remote.wellbeing, local.wellbeing, 'date');
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
async function deleteConversation(u1, u2){
  const cid = conversationId(u1, u2);
  if(isGithubMode()){
    await collectionUpdate('messages', col=>{ delete col[cid]; }, `Eliminar conversación ${cid}`, {});
  } else {
    const col = await getMessagesCollection();
    delete col[cid];
    await saveMessagesCollectionLocal(col);
  }
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
const MUSCLE_GROUPS = ['Trapecio','Romboides','Deltoides anterior','Deltoides lateral','Deltoides posterior','Pectoral mayor','Bíceps braquial','Braquiorradial','Flexores del antebrazo','Extensores del antebrazo','Abdomen','Recto femoral','Vasto lateral','Vasto medial','Aductores','Tibial anterior','Gastrocnemio','Sóleo','Infraespinoso','Dorsal ancho','Tríceps (cabeza larga)','Tríceps (cabeza lateral)','Lumbares','Glúteo mayor','Glúteo medio','Bíceps femoral','Isquiotibiales','Cuerpo completo'];

/* Datos SVG del diagrama corporal muscular (anatomia real, hombre y mujer) */
const MUSCLE_REGION_TO_GROUP = {"Trapecio":"Trapecio","Romboides":"Romboides","Deltoides anterior":"Deltoides anterior","Deltoides lateral":"Deltoides lateral","Deltoides posterior":"Deltoides posterior","Pectoral mayor":"Pectoral mayor","Bíceps braquial":"Bíceps braquial","Braquiorradial":"Braquiorradial","Flexores del antebrazo":"Flexores del antebrazo","Extensores del antebrazo":"Extensores del antebrazo","Abdomen":"Abdomen","Recto femoral":"Recto femoral","Vasto lateral":"Vasto lateral","Vasto medial":"Vasto medial","Aductores":"Aductores","Tibial anterior":"Tibial anterior","Gastrocnemio":"Gastrocnemio","Sóleo":"Sóleo","Infraespinoso":"Infraespinoso","Dorsal ancho":"Dorsal ancho","Tríceps (cabeza larga)":"Tríceps (cabeza larga)","Tríceps (cabeza lateral)":"Tríceps (cabeza lateral)","Lumbares":"Lumbares","Glúteo mayor":"Glúteo mayor","Glúteo medio":"Glúteo medio","Bíceps femoral":"Bíceps femoral","Isquiotibiales":"Isquiotibiales","Sartorio":"Recto femoral","Tensor de la fascia lata":"Glúteo medio","Peroneo largo":"Gastrocnemio","Redondo mayor":"Dorsal ancho"};
const BODY_MUSCLE_SVG_DATA = {"male":{"front":{"w":398.0,"h":810.0,"regions":{"Trapecio":["M167.0,6.0 167.0,9.0 168.0,10.0 168.0,32.0 169.0,33.0 169.0,41.0 168.0,42.0 168.0,51.0 167.0,52.0 167.0,55.0 166.0,56.0 166.0,59.0 161.0,68.0 161.0,70.0 163.0,70.0 164.0,71.0 171.0,71.0 172.0,70.0 173.0,70.0 173.0,69.0 176.0,65.0 179.0,65.0 180.0,66.0 182.0,71.0 186.0,75.0 192.0,77.0 193.0,76.0 193.0,73.0 192.0,72.0 192.0,68.0 191.0,67.0 191.0,64.0 190.0,63.0 190.0,61.0 189.0,60.0 189.0,57.0 188.0,56.0 188.0,53.0 187.0,52.0 187.0,49.0 186.0,48.0 186.0,45.0 185.0,44.0 185.0,41.0 184.0,40.0 184.0,37.0 183.0,36.0 183.0,32.0 182.0,31.0 182.0,27.0 181.0,26.0 181.0,23.0 180.0,22.0 180.0,20.0 171.0,11.0 171.0,10.0 168.0,7.0 168.0,6.0 Z","M230.0,8.0 229.0,8.0 229.0,9.0 226.0,12.0 226.0,13.0 220.0,19.0 219.0,19.0 218.0,20.0 218.0,23.0 217.0,24.0 217.0,28.0 216.0,29.0 216.0,33.0 215.0,34.0 215.0,37.0 214.0,38.0 214.0,41.0 213.0,42.0 213.0,45.0 212.0,46.0 212.0,49.0 211.0,50.0 211.0,53.0 210.0,54.0 210.0,57.0 209.0,58.0 209.0,61.0 208.0,62.0 208.0,64.0 207.0,65.0 207.0,68.0 206.0,69.0 206.0,72.0 205.0,73.0 205.0,76.0 204.0,77.0 204.0,78.0 205.0,78.0 206.0,77.0 211.0,75.0 213.0,73.0 214.0,73.0 214.0,72.0 216.0,70.0 217.0,67.0 219.0,65.0 221.0,65.0 222.0,66.0 223.0,69.0 226.0,71.0 233.0,71.0 236.0,69.0 236.0,68.0 233.0,63.0 233.0,61.0 231.0,58.0 231.0,55.0 230.0,54.0 230.0,48.0 229.0,47.0 229.0,24.0 230.0,23.0 Z","M189.0,28.0 189.0,37.0 190.0,38.0 190.0,41.0 191.0,42.0 191.0,45.0 192.0,46.0 192.0,48.0 193.0,49.0 193.0,51.0 194.0,52.0 195.0,57.0 197.0,60.0 197.0,62.0 198.0,63.0 198.0,64.0 200.0,64.0 200.0,63.0 202.0,60.0 202.0,58.0 205.0,53.0 205.0,50.0 206.0,49.0 206.0,47.0 207.0,46.0 207.0,43.0 208.0,42.0 208.0,39.0 209.0,38.0 209.0,34.0 210.0,33.0 210.0,29.0 207.0,29.0 206.0,30.0 203.0,31.0 201.0,33.0 198.0,33.0 196.0,31.0 Z","M236.0,39.0 236.0,43.0 237.0,44.0 237.0,47.0 238.0,48.0 238.0,50.0 239.0,51.0 239.0,53.0 240.0,54.0 240.0,55.0 242.0,57.0 242.0,58.0 250.0,66.0 251.0,66.0 253.0,68.0 254.0,68.0 257.0,70.0 259.0,70.0 260.0,71.0 272.0,71.0 273.0,70.0 287.0,70.0 287.0,69.0 279.0,62.0 278.0,62.0 274.0,59.0 269.0,57.0 267.0,55.0 266.0,55.0 265.0,54.0 264.0,54.0 263.0,53.0 262.0,53.0 261.0,52.0 260.0,52.0 259.0,51.0 258.0,51.0 257.0,50.0 256.0,50.0 255.0,49.0 242.0,43.0 240.0,41.0 239.0,41.0 237.0,39.0 Z","M162.0,40.0 160.0,40.0 158.0,42.0 157.0,42.0 156.0,43.0 155.0,43.0 154.0,44.0 153.0,44.0 152.0,45.0 151.0,45.0 150.0,46.0 149.0,46.0 148.0,47.0 147.0,47.0 146.0,48.0 145.0,48.0 144.0,49.0 143.0,49.0 142.0,50.0 129.0,56.0 127.0,58.0 124.0,59.0 122.0,61.0 121.0,61.0 119.0,63.0 118.0,63.0 114.0,67.0 113.0,67.0 111.0,69.0 111.0,70.0 123.0,70.0 124.0,71.0 136.0,71.0 137.0,70.0 140.0,70.0 141.0,69.0 142.0,69.0 144.0,67.0 147.0,66.0 157.0,56.0 157.0,55.0 160.0,50.0 160.0,48.0 161.0,47.0 161.0,44.0 162.0,43.0 Z"],"Deltoides lateral":["M97.0,74.0 92.0,74.0 91.0,73.0 80.0,73.0 79.0,74.0 75.0,74.0 74.0,75.0 69.0,76.0 67.0,78.0 64.0,79.0 54.0,89.0 54.0,90.0 49.0,99.0 49.0,101.0 48.0,102.0 48.0,105.0 47.0,106.0 47.0,110.0 46.0,111.0 46.0,127.0 47.0,128.0 47.0,133.0 48.0,134.0 48.0,137.0 49.0,138.0 49.0,141.0 50.0,142.0 50.0,144.0 51.0,145.0 52.0,150.0 54.0,153.0 54.0,155.0 56.0,155.0 57.0,152.0 59.0,150.0 59.0,149.0 62.0,145.0 62.0,142.0 63.0,141.0 63.0,129.0 64.0,128.0 64.0,119.0 65.0,118.0 65.0,114.0 66.0,113.0 66.0,110.0 67.0,109.0 67.0,106.0 69.0,103.0 69.0,101.0 70.0,100.0 73.0,93.0 76.0,90.0 76.0,89.0 85.0,80.0 86.0,80.0 87.0,79.0 89.0,79.0 89.0,78.0 90.0,77.0 91.0,77.0 92.0,76.0 94.0,76.0 95.0,75.0 97.0,75.0 Z","M303.0,74.0 303.0,75.0 310.0,78.0 311.0,79.0 311.0,80.0 313.0,80.0 314.0,81.0 314.0,82.0 316.0,82.0 321.0,87.0 321.0,89.0 322.0,89.0 327.0,95.0 327.0,96.0 329.0,99.0 329.0,101.0 331.0,104.0 332.0,109.0 333.0,110.0 333.0,114.0 334.0,115.0 334.0,119.0 335.0,120.0 335.0,138.0 336.0,139.0 336.0,143.0 337.0,144.0 337.0,146.0 339.0,148.0 339.0,149.0 341.0,151.0 341.0,152.0 343.0,154.0 343.0,155.0 344.0,156.0 345.0,156.0 345.0,153.0 346.0,152.0 346.0,150.0 347.0,149.0 347.0,147.0 348.0,146.0 348.0,144.0 349.0,143.0 349.0,140.0 350.0,139.0 350.0,137.0 351.0,136.0 351.0,131.0 352.0,130.0 352.0,123.0 353.0,122.0 353.0,114.0 352.0,113.0 352.0,106.0 351.0,105.0 351.0,102.0 350.0,101.0 350.0,99.0 349.0,98.0 345.0,89.0 343.0,87.0 343.0,86.0 337.0,80.0 336.0,80.0 334.0,78.0 333.0,78.0 330.0,76.0 328.0,76.0 327.0,75.0 325.0,75.0 324.0,74.0 320.0,74.0 319.0,73.0 307.0,73.0 306.0,74.0 Z"],"Deltoides anterior":["M117.0,79.0 116.0,79.0 115.0,78.0 113.0,78.0 112.0,77.0 102.0,77.0 101.0,78.0 98.0,78.0 97.0,79.0 95.0,79.0 92.0,81.0 90.0,81.0 90.0,82.0 88.0,84.0 87.0,84.0 80.0,91.0 80.0,92.0 77.0,95.0 77.0,96.0 73.0,103.0 73.0,105.0 72.0,106.0 72.0,108.0 71.0,109.0 71.0,112.0 70.0,113.0 70.0,116.0 69.0,117.0 69.0,123.0 68.0,124.0 68.0,141.0 69.0,141.0 71.0,139.0 74.0,138.0 76.0,136.0 81.0,134.0 84.0,131.0 85.0,131.0 97.0,119.0 97.0,118.0 100.0,115.0 100.0,114.0 106.0,106.0 106.0,105.0 109.0,101.0 111.0,96.0 113.0,94.0 115.0,89.0 117.0,87.0 117.0,86.0 119.0,83.0 119.0,81.0 Z","M281.0,79.0 279.0,81.0 279.0,84.0 283.0,89.0 284.0,92.0 286.0,94.0 287.0,97.0 289.0,99.0 289.0,100.0 292.0,104.0 293.0,107.0 295.0,109.0 295.0,110.0 297.0,112.0 297.0,113.0 299.0,115.0 299.0,116.0 302.0,119.0 302.0,120.0 313.0,131.0 314.0,131.0 317.0,134.0 318.0,134.0 319.0,135.0 326.0,138.0 328.0,140.0 331.0,141.0 331.0,128.0 330.0,127.0 330.0,119.0 329.0,118.0 329.0,114.0 328.0,113.0 328.0,110.0 327.0,109.0 327.0,106.0 324.0,101.0 324.0,99.0 323.0,98.0 323.0,97.0 319.0,92.0 319.0,90.0 318.0,90.0 313.0,85.0 313.0,84.0 311.0,84.0 310.0,83.0 310.0,82.0 308.0,82.0 303.0,79.0 301.0,79.0 300.0,78.0 298.0,78.0 297.0,77.0 286.0,77.0 285.0,78.0 283.0,78.0 282.0,79.0 Z"],"Pectoral mayor":["M129.0,82.0 122.0,89.0 122.0,90.0 116.0,98.0 115.0,101.0 113.0,103.0 112.0,106.0 110.0,108.0 110.0,109.0 107.0,113.0 107.0,114.0 104.0,117.0 104.0,118.0 101.0,121.0 101.0,122.0 88.0,135.0 88.0,137.0 89.0,138.0 90.0,138.0 95.0,143.0 96.0,143.0 107.0,154.0 108.0,154.0 112.0,158.0 113.0,158.0 118.0,162.0 119.0,162.0 128.0,167.0 130.0,167.0 131.0,168.0 134.0,168.0 135.0,169.0 137.0,169.0 138.0,170.0 143.0,170.0 144.0,171.0 162.0,171.0 163.0,170.0 168.0,170.0 169.0,169.0 172.0,169.0 173.0,168.0 176.0,168.0 177.0,167.0 179.0,167.0 180.0,166.0 185.0,164.0 188.0,161.0 189.0,161.0 189.0,160.0 192.0,157.0 192.0,156.0 193.0,155.0 193.0,153.0 194.0,152.0 194.0,145.0 195.0,144.0 195.0,108.0 194.0,107.0 194.0,97.0 193.0,96.0 193.0,94.0 190.0,90.0 190.0,89.0 189.0,88.0 188.0,88.0 185.0,85.0 184.0,85.0 179.0,82.0 177.0,82.0 176.0,81.0 174.0,81.0 173.0,80.0 170.0,80.0 169.0,79.0 165.0,79.0 164.0,78.0 156.0,78.0 155.0,77.0 143.0,77.0 142.0,78.0 138.0,78.0 137.0,79.0 135.0,79.0 134.0,80.0 Z","M214.0,84.0 212.0,86.0 211.0,86.0 207.0,90.0 207.0,91.0 205.0,93.0 205.0,95.0 204.0,96.0 204.0,99.0 203.0,100.0 203.0,151.0 204.0,152.0 205.0,157.0 208.0,160.0 208.0,161.0 209.0,161.0 212.0,164.0 213.0,164.0 216.0,166.0 218.0,166.0 219.0,167.0 224.0,168.0 225.0,169.0 228.0,169.0 229.0,170.0 235.0,170.0 236.0,171.0 253.0,171.0 254.0,170.0 260.0,170.0 261.0,169.0 263.0,169.0 264.0,168.0 266.0,168.0 267.0,167.0 272.0,166.0 273.0,165.0 280.0,162.0 283.0,159.0 284.0,159.0 286.0,157.0 287.0,157.0 303.0,142.0 304.0,142.0 308.0,138.0 309.0,138.0 310.0,137.0 310.0,135.0 298.0,123.0 298.0,122.0 292.0,115.0 292.0,114.0 290.0,112.0 289.0,109.0 287.0,107.0 286.0,104.0 282.0,99.0 281.0,96.0 279.0,94.0 279.0,93.0 277.0,91.0 277.0,90.0 269.0,82.0 268.0,82.0 263.0,79.0 261.0,79.0 260.0,78.0 256.0,78.0 255.0,77.0 241.0,77.0 240.0,78.0 234.0,78.0 233.0,79.0 229.0,79.0 228.0,80.0 225.0,80.0 224.0,81.0 222.0,81.0 221.0,82.0 219.0,82.0 218.0,83.0 216.0,83.0 215.0,84.0 Z"],"Bíceps braquial":["M84.0,141.0 79.0,141.0 78.0,142.0 73.0,143.0 71.0,145.0 70.0,145.0 64.0,151.0 64.0,152.0 62.0,154.0 61.0,157.0 59.0,159.0 59.0,161.0 58.0,162.0 58.0,163.0 56.0,166.0 56.0,168.0 55.0,169.0 55.0,172.0 54.0,173.0 54.0,175.0 53.0,176.0 53.0,179.0 52.0,180.0 52.0,185.0 51.0,186.0 51.0,193.0 50.0,194.0 50.0,213.0 51.0,214.0 51.0,219.0 52.0,220.0 53.0,225.0 54.0,226.0 54.0,227.0 58.0,231.0 64.0,231.0 65.0,230.0 70.0,228.0 79.0,219.0 79.0,218.0 81.0,216.0 81.0,215.0 87.0,204.0 87.0,202.0 88.0,201.0 88.0,200.0 89.0,199.0 89.0,197.0 90.0,196.0 90.0,193.0 91.0,192.0 91.0,190.0 92.0,189.0 92.0,186.0 93.0,185.0 93.0,182.0 94.0,181.0 94.0,175.0 95.0,174.0 95.0,156.0 94.0,155.0 94.0,151.0 93.0,150.0 93.0,148.0 92.0,147.0 92.0,146.0 89.0,143.0 88.0,143.0 87.0,142.0 85.0,142.0 Z","M314.0,141.0 313.0,142.0 311.0,142.0 310.0,143.0 309.0,143.0 307.0,145.0 307.0,146.0 305.0,149.0 305.0,151.0 304.0,152.0 304.0,159.0 303.0,160.0 303.0,169.0 304.0,170.0 304.0,179.0 305.0,180.0 305.0,185.0 306.0,186.0 306.0,190.0 307.0,191.0 307.0,193.0 308.0,194.0 308.0,197.0 310.0,200.0 310.0,202.0 312.0,205.0 312.0,207.0 313.0,208.0 315.0,213.0 320.0,219.0 320.0,220.0 327.0,227.0 328.0,227.0 330.0,229.0 331.0,229.0 332.0,230.0 334.0,230.0 335.0,231.0 341.0,231.0 344.0,228.0 344.0,227.0 347.0,222.0 347.0,219.0 348.0,218.0 348.0,215.0 349.0,214.0 349.0,189.0 348.0,188.0 348.0,183.0 347.0,182.0 347.0,178.0 346.0,177.0 346.0,175.0 345.0,174.0 345.0,171.0 344.0,170.0 344.0,168.0 342.0,165.0 342.0,163.0 341.0,162.0 339.0,157.0 332.0,148.0 331.0,148.0 328.0,145.0 327.0,145.0 322.0,142.0 320.0,142.0 319.0,141.0 Z","M48.0,153.0 46.0,153.0 46.0,154.0 44.0,156.0 43.0,159.0 41.0,161.0 41.0,162.0 40.0,163.0 40.0,165.0 38.0,168.0 37.0,173.0 36.0,174.0 36.0,177.0 35.0,178.0 35.0,182.0 34.0,183.0 34.0,209.0 35.0,209.0 35.0,208.0 40.0,202.0 40.0,201.0 43.0,197.0 43.0,195.0 45.0,192.0 45.0,189.0 46.0,188.0 46.0,185.0 47.0,184.0 47.0,180.0 48.0,179.0 48.0,175.0 49.0,174.0 49.0,162.0 48.0,161.0 Z","M352.0,154.0 352.0,156.0 351.0,157.0 351.0,176.0 352.0,177.0 352.0,182.0 353.0,183.0 353.0,187.0 354.0,188.0 354.0,192.0 355.0,193.0 355.0,195.0 356.0,196.0 358.0,201.0 360.0,203.0 360.0,204.0 362.0,206.0 362.0,207.0 363.0,208.0 364.0,208.0 364.0,194.0 365.0,193.0 365.0,189.0 364.0,188.0 364.0,180.0 363.0,179.0 363.0,176.0 362.0,175.0 362.0,172.0 361.0,171.0 361.0,169.0 360.0,168.0 355.0,157.0 353.0,155.0 353.0,154.0 Z"],"Abdomen":["M105.0,162.0 105.0,166.0 104.0,167.0 104.0,173.0 103.0,174.0 103.0,177.0 102.0,178.0 102.0,181.0 101.0,182.0 101.0,189.0 102.0,190.0 102.0,194.0 103.0,195.0 103.0,197.0 104.0,198.0 105.0,203.0 107.0,206.0 107.0,208.0 108.0,209.0 108.0,210.0 109.0,211.0 115.0,224.0 119.0,229.0 124.0,240.0 126.0,242.0 128.0,247.0 130.0,249.0 130.0,252.0 129.0,253.0 127.0,253.0 127.0,267.0 126.0,268.0 126.0,288.0 127.0,289.0 127.0,292.0 128.0,293.0 130.0,298.0 135.0,303.0 136.0,303.0 140.0,307.0 141.0,307.0 146.0,311.0 147.0,311.0 150.0,313.0 152.0,313.0 155.0,309.0 155.0,305.0 156.0,304.0 156.0,291.0 155.0,290.0 155.0,284.0 154.0,283.0 154.0,281.0 153.0,280.0 152.0,277.0 148.0,273.0 147.0,273.0 145.0,271.0 145.0,270.0 143.0,270.0 141.0,268.0 141.0,266.0 142.0,265.0 144.0,265.0 146.0,267.0 146.0,268.0 148.0,268.0 151.0,270.0 152.0,270.0 154.0,268.0 154.0,267.0 155.0,266.0 155.0,257.0 154.0,256.0 154.0,251.0 153.0,250.0 153.0,247.0 152.0,246.0 151.0,243.0 148.0,240.0 147.0,240.0 145.0,238.0 144.0,238.0 142.0,236.0 141.0,236.0 140.0,235.0 140.0,234.0 138.0,234.0 137.0,233.0 137.0,231.0 138.0,230.0 140.0,230.0 141.0,231.0 141.0,232.0 143.0,232.0 144.0,233.0 146.0,233.0 147.0,234.0 149.0,234.0 150.0,235.0 151.0,235.0 154.0,232.0 154.0,225.0 153.0,224.0 153.0,220.0 152.0,219.0 152.0,218.0 148.0,214.0 141.0,211.0 137.0,208.0 137.0,206.0 138.0,205.0 140.0,205.0 141.0,206.0 142.0,206.0 145.0,208.0 147.0,208.0 148.0,209.0 151.0,209.0 153.0,207.0 153.0,206.0 154.0,205.0 154.0,202.0 153.0,201.0 153.0,198.0 152.0,197.0 152.0,196.0 147.0,192.0 145.0,192.0 144.0,191.0 144.0,189.0 145.0,188.0 146.0,188.0 147.0,187.0 149.0,187.0 150.0,186.0 150.0,183.0 147.0,180.0 146.0,180.0 145.0,179.0 141.0,179.0 140.0,178.0 135.0,178.0 134.0,177.0 131.0,177.0 130.0,176.0 125.0,175.0 124.0,174.0 119.0,172.0 117.0,170.0 116.0,170.0 114.0,168.0 113.0,168.0 109.0,164.0 108.0,164.0 106.0,162.0 Z","M293.0,163.0 290.0,163.0 282.0,170.0 281.0,170.0 272.0,175.0 270.0,175.0 269.0,176.0 267.0,176.0 266.0,177.0 263.0,177.0 262.0,178.0 258.0,178.0 257.0,179.0 251.0,179.0 250.0,180.0 249.0,180.0 246.0,183.0 246.0,186.0 249.0,188.0 251.0,188.0 252.0,189.0 252.0,191.0 251.0,192.0 246.0,194.0 244.0,196.0 244.0,197.0 243.0,198.0 243.0,200.0 242.0,201.0 242.0,207.0 244.0,209.0 247.0,209.0 248.0,208.0 251.0,208.0 256.0,205.0 258.0,205.0 258.0,204.0 259.0,203.0 261.0,203.0 262.0,204.0 262.0,206.0 261.0,207.0 259.0,207.0 259.0,208.0 255.0,211.0 248.0,214.0 243.0,219.0 243.0,221.0 242.0,222.0 242.0,225.0 241.0,226.0 241.0,231.0 244.0,235.0 247.0,235.0 248.0,234.0 250.0,234.0 255.0,231.0 257.0,231.0 258.0,232.0 258.0,234.0 257.0,235.0 256.0,235.0 254.0,237.0 253.0,237.0 251.0,239.0 250.0,239.0 248.0,241.0 248.0,242.0 244.0,245.0 244.0,246.0 242.0,249.0 242.0,252.0 241.0,253.0 241.0,268.0 243.0,270.0 245.0,270.0 246.0,269.0 248.0,269.0 250.0,267.0 252.0,267.0 252.0,266.0 255.0,263.0 257.0,263.0 258.0,264.0 258.0,266.0 255.0,269.0 253.0,269.0 253.0,270.0 251.0,272.0 250.0,272.0 247.0,275.0 246.0,275.0 245.0,276.0 245.0,277.0 243.0,279.0 243.0,280.0 241.0,283.0 241.0,287.0 240.0,288.0 240.0,306.0 241.0,307.0 241.0,310.0 244.0,313.0 247.0,313.0 248.0,312.0 251.0,311.0 253.0,309.0 254.0,309.0 256.0,307.0 257.0,307.0 260.0,304.0 261.0,304.0 267.0,298.0 267.0,297.0 270.0,292.0 270.0,290.0 271.0,289.0 271.0,283.0 272.0,282.0 272.0,275.0 271.0,274.0 271.0,265.0 270.0,264.0 270.0,254.0 267.0,254.0 266.0,253.0 266.0,251.0 269.0,248.0 269.0,247.0 272.0,243.0 274.0,238.0 276.0,236.0 278.0,231.0 280.0,229.0 282.0,224.0 284.0,222.0 284.0,221.0 292.0,206.0 292.0,204.0 293.0,203.0 293.0,201.0 294.0,200.0 294.0,198.0 295.0,197.0 295.0,195.0 296.0,194.0 296.0,192.0 297.0,191.0 297.0,182.0 296.0,181.0 296.0,178.0 295.0,177.0 295.0,174.0 294.0,173.0 294.0,168.0 293.0,167.0 Z","M194.0,173.0 191.0,171.0 186.0,171.0 185.0,172.0 182.0,172.0 179.0,174.0 177.0,174.0 176.0,175.0 174.0,175.0 173.0,176.0 171.0,176.0 170.0,177.0 167.0,177.0 166.0,178.0 165.0,178.0 162.0,181.0 162.0,182.0 161.0,183.0 161.0,187.0 160.0,188.0 160.0,196.0 161.0,197.0 161.0,199.0 162.0,200.0 162.0,201.0 163.0,201.0 164.0,202.0 169.0,202.0 170.0,201.0 177.0,201.0 178.0,200.0 188.0,200.0 189.0,199.0 191.0,199.0 192.0,198.0 193.0,198.0 193.0,197.0 195.0,195.0 195.0,175.0 194.0,174.0 Z","M202.0,173.0 202.0,174.0 201.0,175.0 201.0,178.0 200.0,179.0 200.0,191.0 201.0,192.0 201.0,195.0 203.0,198.0 204.0,198.0 205.0,199.0 207.0,199.0 208.0,200.0 218.0,200.0 219.0,201.0 225.0,201.0 226.0,202.0 231.0,202.0 234.0,200.0 234.0,198.0 235.0,197.0 235.0,186.0 234.0,185.0 234.0,182.0 232.0,179.0 231.0,179.0 228.0,177.0 226.0,177.0 223.0,175.0 221.0,175.0 220.0,174.0 218.0,174.0 217.0,173.0 212.0,172.0 211.0,171.0 205.0,171.0 Z","M162.0,209.0 162.0,210.0 161.0,211.0 161.0,213.0 160.0,214.0 160.0,222.0 161.0,223.0 161.0,227.0 162.0,228.0 162.0,229.0 165.0,232.0 189.0,232.0 190.0,231.0 192.0,231.0 194.0,229.0 194.0,228.0 195.0,227.0 195.0,209.0 193.0,206.0 192.0,206.0 191.0,205.0 176.0,205.0 175.0,206.0 168.0,206.0 167.0,207.0 165.0,207.0 Z","M201.0,208.0 201.0,210.0 200.0,211.0 200.0,224.0 201.0,225.0 201.0,228.0 204.0,231.0 205.0,231.0 206.0,232.0 230.0,232.0 233.0,229.0 233.0,228.0 234.0,227.0 234.0,223.0 235.0,222.0 235.0,213.0 232.0,208.0 231.0,208.0 230.0,207.0 228.0,207.0 227.0,206.0 220.0,206.0 219.0,205.0 205.0,205.0 Z","M72.0,233.0 65.0,236.0 61.0,239.0 61.0,240.0 59.0,243.0 59.0,250.0 64.0,248.0 67.0,245.0 67.0,244.0 69.0,242.0 69.0,241.0 71.0,238.0 Z","M327.0,233.0 327.0,236.0 329.0,239.0 329.0,241.0 330.0,242.0 330.0,243.0 335.0,248.0 336.0,248.0 337.0,249.0 340.0,249.0 340.0,244.0 339.0,243.0 339.0,241.0 338.0,240.0 338.0,239.0 337.0,238.0 332.0,236.0 330.0,234.0 Z","M163.0,239.0 163.0,240.0 161.0,243.0 161.0,255.0 162.0,256.0 162.0,261.0 163.0,262.0 163.0,263.0 166.0,266.0 168.0,266.0 169.0,267.0 182.0,267.0 183.0,266.0 190.0,266.0 194.0,263.0 194.0,262.0 195.0,261.0 195.0,242.0 192.0,238.0 191.0,238.0 190.0,237.0 167.0,237.0 166.0,238.0 Z","M202.0,239.0 202.0,240.0 201.0,241.0 201.0,243.0 200.0,244.0 200.0,258.0 201.0,259.0 201.0,262.0 205.0,266.0 229.0,266.0 230.0,265.0 231.0,265.0 231.0,264.0 233.0,261.0 233.0,257.0 234.0,256.0 234.0,243.0 233.0,242.0 233.0,240.0 231.0,238.0 229.0,238.0 228.0,237.0 205.0,237.0 Z","M168.0,272.0 167.0,273.0 167.0,274.0 166.0,275.0 165.0,275.0 163.0,278.0 163.0,293.0 164.0,294.0 164.0,299.0 165.0,300.0 165.0,304.0 166.0,305.0 166.0,309.0 167.0,310.0 167.0,313.0 168.0,314.0 168.0,317.0 169.0,318.0 169.0,321.0 170.0,322.0 170.0,325.0 171.0,326.0 171.0,329.0 172.0,330.0 172.0,332.0 173.0,333.0 173.0,335.0 174.0,336.0 174.0,338.0 175.0,339.0 175.0,341.0 176.0,342.0 176.0,344.0 177.0,345.0 178.0,350.0 180.0,353.0 180.0,355.0 181.0,356.0 185.0,365.0 188.0,368.0 189.0,368.0 190.0,369.0 193.0,369.0 195.0,366.0 195.0,352.0 196.0,351.0 196.0,316.0 195.0,315.0 195.0,312.0 196.0,311.0 196.0,285.0 195.0,284.0 195.0,277.0 194.0,276.0 194.0,275.0 190.0,272.0 Z","M228.0,272.0 206.0,272.0 205.0,273.0 204.0,273.0 201.0,277.0 201.0,280.0 200.0,281.0 200.0,362.0 201.0,363.0 201.0,366.0 203.0,369.0 207.0,369.0 211.0,365.0 211.0,364.0 213.0,362.0 213.0,360.0 216.0,355.0 216.0,353.0 218.0,350.0 218.0,348.0 220.0,345.0 220.0,343.0 221.0,342.0 221.0,340.0 222.0,339.0 222.0,337.0 223.0,336.0 223.0,333.0 224.0,332.0 224.0,329.0 225.0,328.0 225.0,325.0 226.0,324.0 226.0,321.0 227.0,320.0 227.0,317.0 228.0,316.0 228.0,313.0 229.0,312.0 229.0,309.0 230.0,308.0 230.0,303.0 231.0,302.0 231.0,297.0 232.0,296.0 232.0,289.0 233.0,288.0 233.0,280.0 232.0,279.0 232.0,276.0 Z"],"Braquiorradial":["M44.0,209.0 41.0,209.0 35.0,215.0 35.0,216.0 31.0,220.0 31.0,221.0 28.0,224.0 28.0,225.0 24.0,230.0 24.0,231.0 20.0,238.0 20.0,240.0 18.0,243.0 18.0,245.0 17.0,246.0 17.0,248.0 16.0,249.0 16.0,252.0 15.0,253.0 15.0,257.0 14.0,258.0 14.0,265.0 13.0,266.0 13.0,276.0 14.0,277.0 14.0,285.0 15.0,286.0 15.0,290.0 16.0,291.0 16.0,296.0 17.0,297.0 17.0,301.0 18.0,302.0 18.0,309.0 19.0,310.0 19.0,331.0 20.0,332.0 20.0,348.0 21.0,349.0 21.0,355.0 22.0,356.0 22.0,361.0 23.0,361.0 24.0,360.0 24.0,355.0 25.0,354.0 25.0,349.0 26.0,348.0 26.0,344.0 27.0,343.0 27.0,340.0 28.0,339.0 28.0,336.0 29.0,335.0 29.0,332.0 30.0,331.0 30.0,328.0 31.0,327.0 31.0,325.0 32.0,324.0 32.0,321.0 33.0,320.0 33.0,318.0 34.0,317.0 34.0,315.0 35.0,314.0 35.0,311.0 37.0,308.0 37.0,305.0 38.0,304.0 38.0,302.0 40.0,299.0 40.0,297.0 41.0,296.0 41.0,293.0 42.0,292.0 42.0,290.0 43.0,289.0 43.0,287.0 44.0,286.0 44.0,284.0 45.0,283.0 45.0,281.0 46.0,280.0 46.0,278.0 47.0,277.0 47.0,274.0 48.0,273.0 48.0,270.0 49.0,269.0 49.0,265.0 50.0,264.0 50.0,256.0 51.0,255.0 51.0,247.0 50.0,246.0 50.0,239.0 49.0,238.0 49.0,234.0 48.0,233.0 48.0,229.0 47.0,228.0 47.0,225.0 46.0,224.0 46.0,220.0 45.0,219.0 45.0,214.0 44.0,213.0 Z","M355.0,209.0 355.0,213.0 354.0,214.0 354.0,219.0 353.0,220.0 353.0,224.0 352.0,225.0 352.0,229.0 351.0,230.0 351.0,234.0 350.0,235.0 350.0,241.0 349.0,242.0 349.0,264.0 350.0,265.0 350.0,269.0 351.0,270.0 351.0,273.0 352.0,274.0 352.0,277.0 353.0,278.0 353.0,280.0 354.0,281.0 354.0,284.0 355.0,285.0 355.0,287.0 356.0,288.0 356.0,290.0 357.0,291.0 357.0,293.0 358.0,294.0 358.0,296.0 359.0,297.0 359.0,299.0 360.0,300.0 360.0,302.0 361.0,303.0 361.0,305.0 362.0,306.0 362.0,308.0 363.0,309.0 363.0,311.0 364.0,312.0 364.0,314.0 365.0,315.0 365.0,317.0 366.0,318.0 366.0,320.0 367.0,321.0 367.0,324.0 368.0,325.0 368.0,328.0 369.0,329.0 369.0,331.0 370.0,332.0 370.0,335.0 371.0,336.0 371.0,339.0 372.0,340.0 372.0,344.0 373.0,345.0 373.0,349.0 374.0,350.0 374.0,355.0 375.0,356.0 375.0,362.0 376.0,362.0 377.0,361.0 377.0,353.0 378.0,352.0 378.0,337.0 379.0,336.0 379.0,314.0 380.0,313.0 380.0,307.0 381.0,306.0 381.0,301.0 382.0,300.0 382.0,296.0 383.0,295.0 383.0,291.0 384.0,290.0 384.0,286.0 385.0,285.0 385.0,259.0 384.0,258.0 384.0,255.0 383.0,254.0 383.0,251.0 382.0,250.0 382.0,247.0 381.0,246.0 381.0,244.0 379.0,241.0 379.0,239.0 378.0,238.0 375.0,231.0 373.0,229.0 372.0,226.0 370.0,224.0 370.0,223.0 368.0,221.0 368.0,220.0 364.0,216.0 364.0,215.0 358.0,209.0 Z"],"Flexores del antebrazo":["M68.0,253.0 66.0,253.0 65.0,254.0 62.0,255.0 57.0,260.0 57.0,261.0 55.0,264.0 55.0,267.0 54.0,268.0 54.0,271.0 53.0,272.0 53.0,274.0 52.0,275.0 52.0,277.0 51.0,278.0 51.0,281.0 50.0,282.0 50.0,284.0 49.0,285.0 49.0,287.0 48.0,288.0 48.0,291.0 47.0,292.0 47.0,294.0 46.0,295.0 45.0,300.0 43.0,303.0 43.0,306.0 42.0,307.0 42.0,309.0 41.0,310.0 41.0,312.0 40.0,313.0 40.0,315.0 39.0,316.0 39.0,318.0 38.0,319.0 38.0,322.0 37.0,323.0 37.0,325.0 36.0,326.0 36.0,331.0 35.0,332.0 35.0,334.0 36.0,334.0 37.0,331.0 39.0,329.0 39.0,328.0 41.0,326.0 41.0,325.0 44.0,322.0 44.0,321.0 54.0,310.0 54.0,309.0 60.0,301.0 60.0,300.0 64.0,293.0 64.0,291.0 65.0,290.0 65.0,288.0 66.0,287.0 66.0,285.0 67.0,284.0 67.0,280.0 68.0,279.0 68.0,271.0 69.0,270.0 69.0,262.0 68.0,261.0 Z","M332.0,253.0 331.0,254.0 331.0,257.0 330.0,258.0 330.0,273.0 331.0,274.0 331.0,280.0 332.0,281.0 332.0,284.0 333.0,285.0 334.0,290.0 336.0,293.0 336.0,295.0 337.0,296.0 337.0,297.0 339.0,299.0 340.0,302.0 342.0,304.0 342.0,305.0 344.0,307.0 344.0,308.0 357.0,323.0 357.0,324.0 361.0,329.0 362.0,332.0 363.0,332.0 363.0,330.0 362.0,329.0 362.0,325.0 361.0,324.0 361.0,321.0 360.0,320.0 360.0,317.0 359.0,316.0 359.0,313.0 357.0,310.0 357.0,307.0 356.0,306.0 356.0,304.0 355.0,303.0 355.0,301.0 354.0,300.0 354.0,298.0 353.0,297.0 353.0,295.0 352.0,294.0 352.0,292.0 351.0,291.0 351.0,288.0 349.0,285.0 349.0,282.0 348.0,281.0 348.0,278.0 347.0,277.0 347.0,275.0 346.0,274.0 346.0,272.0 345.0,271.0 345.0,267.0 344.0,266.0 344.0,264.0 343.0,263.0 341.0,258.0 339.0,256.0 338.0,256.0 334.0,253.0 Z","M9.0,286.0 9.0,291.0 8.0,292.0 8.0,297.0 7.0,298.0 7.0,307.0 6.0,308.0 6.0,330.0 7.0,331.0 7.0,338.0 8.0,339.0 8.0,344.0 9.0,345.0 9.0,348.0 10.0,349.0 10.0,352.0 11.0,353.0 11.0,356.0 12.0,357.0 12.0,359.0 13.0,360.0 14.0,363.0 15.0,363.0 15.0,320.0 14.0,319.0 14.0,309.0 13.0,308.0 13.0,302.0 12.0,301.0 12.0,295.0 11.0,294.0 11.0,289.0 10.0,288.0 10.0,286.0 Z","M390.0,288.0 388.0,288.0 388.0,293.0 387.0,294.0 387.0,298.0 386.0,299.0 386.0,304.0 385.0,305.0 385.0,312.0 384.0,313.0 384.0,329.0 383.0,330.0 383.0,364.0 384.0,364.0 384.0,363.0 386.0,360.0 387.0,355.0 388.0,354.0 388.0,350.0 389.0,349.0 389.0,346.0 390.0,345.0 390.0,341.0 391.0,340.0 391.0,333.0 392.0,332.0 392.0,303.0 391.0,302.0 391.0,295.0 390.0,294.0 Z"],"Tensor de la fascia lata":["M269.0,308.0 269.0,310.0 268.0,311.0 268.0,314.0 267.0,315.0 267.0,319.0 266.0,320.0 266.0,324.0 265.0,325.0 265.0,337.0 266.0,338.0 266.0,340.0 269.0,345.0 269.0,347.0 270.0,348.0 270.0,349.0 279.0,366.0 279.0,368.0 285.0,379.0 285.0,381.0 289.0,388.0 289.0,390.0 291.0,393.0 291.0,395.0 292.0,396.0 293.0,399.0 294.0,399.0 294.0,393.0 293.0,392.0 293.0,379.0 292.0,378.0 292.0,370.0 291.0,369.0 291.0,361.0 290.0,360.0 290.0,355.0 289.0,354.0 289.0,350.0 288.0,349.0 288.0,346.0 287.0,345.0 287.0,342.0 286.0,341.0 286.0,338.0 285.0,337.0 285.0,335.0 284.0,334.0 283.0,329.0 282.0,328.0 277.0,317.0 275.0,315.0 275.0,314.0 273.0,312.0 273.0,311.0 270.0,308.0 Z","M129.0,309.0 127.0,309.0 125.0,311.0 125.0,312.0 121.0,316.0 120.0,319.0 118.0,321.0 118.0,322.0 116.0,325.0 116.0,327.0 114.0,330.0 114.0,332.0 113.0,333.0 113.0,335.0 112.0,336.0 112.0,338.0 111.0,339.0 111.0,342.0 110.0,343.0 110.0,346.0 109.0,347.0 109.0,350.0 108.0,351.0 108.0,356.0 107.0,357.0 107.0,363.0 106.0,364.0 106.0,374.0 105.0,375.0 105.0,384.0 104.0,385.0 104.0,398.0 105.0,398.0 105.0,397.0 106.0,396.0 106.0,394.0 109.0,389.0 109.0,387.0 111.0,384.0 111.0,382.0 113.0,379.0 113.0,377.0 116.0,372.0 116.0,370.0 117.0,369.0 117.0,368.0 127.0,349.0 127.0,347.0 128.0,346.0 128.0,345.0 129.0,344.0 129.0,342.0 131.0,339.0 131.0,336.0 132.0,335.0 132.0,323.0 131.0,322.0 131.0,317.0 130.0,316.0 130.0,312.0 129.0,311.0 Z"],"Sartorio":["M260.0,316.0 258.0,316.0 258.0,317.0 253.0,326.0 253.0,328.0 248.0,337.0 248.0,339.0 244.0,346.0 244.0,348.0 240.0,355.0 240.0,357.0 238.0,359.0 238.0,361.0 237.0,362.0 237.0,363.0 235.0,366.0 235.0,368.0 229.0,379.0 229.0,381.0 226.0,386.0 226.0,388.0 225.0,389.0 225.0,391.0 224.0,392.0 224.0,395.0 225.0,396.0 225.0,399.0 226.0,400.0 226.0,403.0 227.0,404.0 227.0,406.0 228.0,407.0 228.0,409.0 229.0,410.0 229.0,413.0 230.0,414.0 230.0,416.0 231.0,417.0 231.0,420.0 233.0,420.0 234.0,415.0 236.0,412.0 236.0,410.0 237.0,409.0 237.0,408.0 238.0,407.0 238.0,405.0 240.0,402.0 240.0,399.0 241.0,398.0 241.0,396.0 242.0,395.0 242.0,393.0 243.0,392.0 243.0,390.0 244.0,389.0 244.0,387.0 245.0,386.0 245.0,384.0 246.0,383.0 246.0,381.0 247.0,380.0 247.0,377.0 248.0,376.0 248.0,374.0 249.0,373.0 249.0,370.0 250.0,369.0 250.0,366.0 251.0,365.0 251.0,363.0 252.0,362.0 252.0,359.0 253.0,358.0 253.0,355.0 254.0,354.0 254.0,351.0 255.0,350.0 255.0,347.0 256.0,346.0 256.0,342.0 257.0,341.0 257.0,337.0 258.0,336.0 258.0,332.0 259.0,331.0 259.0,326.0 260.0,325.0 Z","M138.0,317.0 137.0,318.0 137.0,326.0 138.0,327.0 138.0,333.0 139.0,334.0 139.0,339.0 140.0,340.0 140.0,343.0 141.0,344.0 141.0,348.0 142.0,349.0 142.0,352.0 143.0,353.0 143.0,357.0 144.0,358.0 144.0,360.0 145.0,361.0 145.0,364.0 146.0,365.0 146.0,368.0 147.0,369.0 147.0,371.0 148.0,372.0 148.0,374.0 149.0,375.0 149.0,378.0 150.0,379.0 150.0,381.0 151.0,382.0 151.0,384.0 152.0,385.0 152.0,387.0 153.0,388.0 153.0,391.0 155.0,394.0 155.0,397.0 157.0,400.0 157.0,402.0 158.0,403.0 158.0,405.0 159.0,406.0 160.0,411.0 162.0,414.0 162.0,416.0 164.0,419.0 164.0,421.0 165.0,421.0 166.0,420.0 166.0,417.0 167.0,416.0 167.0,414.0 168.0,413.0 168.0,410.0 169.0,409.0 169.0,407.0 170.0,406.0 170.0,403.0 171.0,402.0 171.0,399.0 172.0,398.0 172.0,395.0 173.0,394.0 173.0,393.0 172.0,392.0 172.0,389.0 167.0,380.0 167.0,378.0 163.0,371.0 163.0,369.0 162.0,368.0 162.0,367.0 158.0,360.0 158.0,358.0 153.0,349.0 153.0,347.0 152.0,346.0 152.0,345.0 149.0,340.0 149.0,338.0 145.0,331.0 145.0,329.0 143.0,326.0 143.0,324.0 142.0,323.0 140.0,318.0 139.0,317.0 Z"],"Recto femoral":["M134.0,346.0 133.0,347.0 133.0,348.0 123.0,367.0 123.0,369.0 122.0,370.0 122.0,371.0 120.0,374.0 120.0,376.0 117.0,381.0 117.0,383.0 116.0,384.0 116.0,386.0 115.0,387.0 115.0,389.0 114.0,390.0 114.0,392.0 113.0,393.0 113.0,395.0 112.0,396.0 112.0,399.0 111.0,400.0 111.0,404.0 110.0,405.0 110.0,411.0 109.0,412.0 109.0,433.0 110.0,434.0 110.0,440.0 111.0,441.0 111.0,446.0 112.0,447.0 112.0,449.0 113.0,450.0 113.0,453.0 114.0,454.0 114.0,457.0 115.0,458.0 115.0,460.0 117.0,463.0 118.0,468.0 119.0,469.0 119.0,470.0 121.0,473.0 121.0,475.0 122.0,476.0 124.0,481.0 126.0,483.0 129.0,490.0 131.0,492.0 131.0,493.0 134.0,496.0 135.0,496.0 135.0,495.0 140.0,486.0 140.0,484.0 143.0,479.0 143.0,477.0 145.0,474.0 145.0,472.0 146.0,471.0 146.0,469.0 147.0,468.0 147.0,466.0 148.0,465.0 148.0,463.0 149.0,462.0 149.0,460.0 150.0,459.0 150.0,457.0 151.0,456.0 151.0,453.0 152.0,452.0 152.0,449.0 153.0,448.0 153.0,444.0 154.0,443.0 154.0,438.0 155.0,437.0 155.0,420.0 154.0,419.0 154.0,413.0 153.0,412.0 153.0,408.0 152.0,407.0 152.0,404.0 151.0,403.0 151.0,400.0 150.0,399.0 150.0,397.0 149.0,396.0 149.0,394.0 148.0,393.0 148.0,391.0 147.0,390.0 147.0,387.0 146.0,386.0 146.0,384.0 145.0,383.0 145.0,380.0 144.0,379.0 144.0,377.0 143.0,376.0 143.0,374.0 142.0,373.0 142.0,370.0 141.0,369.0 141.0,367.0 140.0,366.0 140.0,363.0 139.0,362.0 139.0,359.0 138.0,358.0 138.0,356.0 137.0,355.0 137.0,352.0 136.0,351.0 135.0,346.0 Z","M262.0,346.0 261.0,347.0 261.0,349.0 260.0,350.0 260.0,353.0 259.0,354.0 259.0,357.0 258.0,358.0 258.0,361.0 257.0,362.0 257.0,364.0 256.0,365.0 256.0,368.0 255.0,369.0 255.0,372.0 254.0,373.0 254.0,375.0 253.0,376.0 253.0,378.0 252.0,379.0 252.0,381.0 251.0,382.0 251.0,385.0 250.0,386.0 250.0,388.0 249.0,389.0 249.0,392.0 248.0,393.0 248.0,395.0 247.0,396.0 247.0,398.0 246.0,399.0 246.0,402.0 245.0,403.0 245.0,406.0 244.0,407.0 244.0,411.0 243.0,412.0 243.0,418.0 242.0,419.0 242.0,432.0 243.0,433.0 243.0,442.0 244.0,443.0 244.0,447.0 245.0,448.0 245.0,451.0 246.0,452.0 246.0,454.0 247.0,455.0 247.0,457.0 248.0,458.0 248.0,461.0 249.0,462.0 250.0,467.0 252.0,470.0 252.0,472.0 254.0,475.0 254.0,477.0 257.0,482.0 257.0,484.0 261.0,491.0 261.0,493.0 263.0,495.0 263.0,496.0 264.0,496.0 267.0,492.0 267.0,491.0 269.0,489.0 269.0,488.0 278.0,471.0 278.0,469.0 280.0,466.0 280.0,464.0 281.0,463.0 281.0,461.0 282.0,460.0 282.0,458.0 283.0,457.0 283.0,455.0 284.0,454.0 284.0,452.0 285.0,451.0 285.0,448.0 286.0,447.0 286.0,444.0 287.0,443.0 287.0,438.0 288.0,437.0 288.0,430.0 289.0,429.0 289.0,412.0 288.0,411.0 288.0,405.0 287.0,404.0 287.0,400.0 286.0,399.0 286.0,397.0 285.0,396.0 285.0,394.0 284.0,393.0 283.0,388.0 282.0,387.0 282.0,386.0 281.0,385.0 281.0,383.0 279.0,380.0 279.0,378.0 278.0,377.0 278.0,376.0 277.0,375.0 277.0,374.0 276.0,373.0 276.0,372.0 275.0,371.0 275.0,370.0 274.0,369.0 274.0,368.0 273.0,367.0 273.0,366.0 272.0,365.0 272.0,364.0 271.0,363.0 271.0,362.0 270.0,361.0 270.0,360.0 269.0,359.0 263.0,346.0 Z"],"Aductores":["M183.0,374.0 183.0,375.0 182.0,376.0 182.0,378.0 181.0,379.0 181.0,382.0 180.0,383.0 180.0,385.0 179.0,386.0 179.0,389.0 178.0,390.0 178.0,393.0 177.0,394.0 177.0,397.0 176.0,398.0 176.0,401.0 175.0,402.0 175.0,405.0 174.0,406.0 174.0,408.0 173.0,409.0 173.0,412.0 172.0,413.0 172.0,416.0 171.0,417.0 171.0,420.0 170.0,421.0 170.0,425.0 169.0,426.0 169.0,430.0 170.0,431.0 170.0,433.0 171.0,434.0 171.0,436.0 172.0,437.0 172.0,439.0 173.0,440.0 173.0,442.0 174.0,443.0 174.0,445.0 175.0,446.0 175.0,448.0 176.0,449.0 176.0,451.0 177.0,452.0 177.0,455.0 178.0,456.0 178.0,458.0 179.0,459.0 179.0,462.0 180.0,463.0 180.0,465.0 181.0,466.0 181.0,469.0 182.0,470.0 182.0,473.0 183.0,474.0 183.0,477.0 184.0,478.0 184.0,483.0 185.0,484.0 185.0,486.0 186.0,486.0 186.0,483.0 187.0,482.0 187.0,479.0 188.0,478.0 188.0,475.0 189.0,474.0 189.0,470.0 190.0,469.0 190.0,465.0 191.0,464.0 191.0,460.0 192.0,459.0 192.0,453.0 193.0,452.0 193.0,447.0 194.0,446.0 194.0,438.0 195.0,437.0 195.0,424.0 196.0,423.0 196.0,397.0 195.0,396.0 195.0,388.0 194.0,387.0 194.0,384.0 193.0,383.0 192.0,380.0 186.0,375.0 Z","M214.0,374.0 211.0,375.0 205.0,380.0 205.0,381.0 203.0,384.0 203.0,386.0 202.0,387.0 202.0,392.0 201.0,393.0 201.0,429.0 202.0,430.0 202.0,438.0 203.0,439.0 203.0,445.0 204.0,446.0 204.0,451.0 205.0,452.0 205.0,457.0 206.0,458.0 206.0,462.0 207.0,463.0 207.0,467.0 208.0,468.0 208.0,472.0 209.0,473.0 209.0,476.0 210.0,477.0 210.0,481.0 211.0,482.0 211.0,485.0 212.0,485.0 212.0,483.0 213.0,482.0 213.0,478.0 214.0,477.0 214.0,473.0 215.0,472.0 215.0,469.0 216.0,468.0 216.0,465.0 217.0,464.0 217.0,462.0 218.0,461.0 218.0,458.0 219.0,457.0 219.0,455.0 220.0,454.0 220.0,452.0 221.0,451.0 221.0,449.0 222.0,448.0 222.0,446.0 223.0,445.0 223.0,443.0 224.0,442.0 224.0,440.0 225.0,439.0 225.0,437.0 226.0,436.0 226.0,434.0 227.0,433.0 227.0,431.0 228.0,430.0 228.0,426.0 227.0,425.0 227.0,421.0 226.0,420.0 226.0,417.0 225.0,416.0 225.0,413.0 224.0,412.0 224.0,409.0 223.0,408.0 223.0,405.0 222.0,404.0 222.0,402.0 221.0,401.0 221.0,398.0 220.0,397.0 220.0,395.0 219.0,394.0 219.0,391.0 218.0,390.0 218.0,388.0 217.0,387.0 217.0,384.0 216.0,383.0 216.0,381.0 215.0,380.0 215.0,377.0 214.0,376.0 Z"],"Vasto lateral":["M295.0,413.0 294.0,413.0 294.0,430.0 293.0,431.0 293.0,438.0 292.0,439.0 292.0,443.0 291.0,444.0 291.0,448.0 290.0,449.0 290.0,452.0 289.0,453.0 289.0,456.0 288.0,457.0 288.0,459.0 287.0,460.0 286.0,465.0 284.0,468.0 284.0,470.0 281.0,475.0 281.0,477.0 280.0,478.0 275.0,489.0 273.0,491.0 273.0,492.0 269.0,499.0 269.0,501.0 268.0,502.0 268.0,503.0 267.0,504.0 267.0,506.0 266.0,507.0 266.0,510.0 265.0,511.0 265.0,516.0 264.0,517.0 264.0,543.0 265.0,544.0 265.0,547.0 266.0,548.0 266.0,550.0 267.0,551.0 270.0,558.0 274.0,562.0 275.0,562.0 276.0,563.0 280.0,563.0 282.0,561.0 283.0,561.0 283.0,560.0 286.0,557.0 286.0,556.0 288.0,554.0 289.0,551.0 291.0,549.0 291.0,548.0 294.0,543.0 294.0,541.0 297.0,536.0 297.0,534.0 299.0,531.0 299.0,529.0 300.0,528.0 301.0,523.0 303.0,520.0 303.0,518.0 304.0,517.0 304.0,514.0 305.0,513.0 305.0,510.0 306.0,509.0 306.0,505.0 307.0,504.0 307.0,500.0 308.0,499.0 308.0,491.0 309.0,490.0 309.0,467.0 308.0,466.0 308.0,458.0 307.0,457.0 307.0,451.0 306.0,450.0 306.0,446.0 305.0,445.0 305.0,442.0 304.0,441.0 304.0,438.0 303.0,437.0 303.0,434.0 302.0,433.0 301.0,428.0 299.0,425.0 299.0,423.0 297.0,420.0 297.0,418.0 296.0,417.0 296.0,415.0 295.0,414.0 Z","M102.0,415.0 101.0,416.0 101.0,418.0 99.0,421.0 99.0,423.0 97.0,426.0 97.0,428.0 96.0,429.0 96.0,432.0 95.0,433.0 95.0,435.0 94.0,436.0 94.0,439.0 93.0,440.0 93.0,443.0 92.0,444.0 92.0,449.0 91.0,450.0 91.0,455.0 90.0,456.0 90.0,463.0 89.0,464.0 89.0,493.0 90.0,494.0 90.0,500.0 91.0,501.0 91.0,506.0 92.0,507.0 92.0,510.0 93.0,511.0 93.0,514.0 94.0,515.0 94.0,518.0 95.0,519.0 95.0,521.0 96.0,522.0 96.0,524.0 97.0,525.0 98.0,530.0 99.0,531.0 99.0,532.0 100.0,533.0 100.0,535.0 102.0,538.0 102.0,540.0 103.0,541.0 108.0,552.0 110.0,554.0 110.0,555.0 112.0,557.0 112.0,558.0 116.0,562.0 117.0,562.0 118.0,563.0 121.0,563.0 122.0,562.0 123.0,562.0 124.0,561.0 124.0,560.0 128.0,557.0 128.0,556.0 131.0,551.0 132.0,546.0 133.0,545.0 133.0,539.0 134.0,538.0 134.0,522.0 133.0,521.0 133.0,513.0 132.0,512.0 132.0,509.0 131.0,508.0 131.0,505.0 130.0,504.0 130.0,502.0 129.0,501.0 124.0,490.0 122.0,488.0 122.0,487.0 115.0,474.0 115.0,472.0 112.0,467.0 112.0,465.0 111.0,464.0 111.0,462.0 110.0,461.0 110.0,459.0 109.0,458.0 109.0,456.0 108.0,455.0 108.0,452.0 107.0,451.0 107.0,448.0 106.0,447.0 106.0,443.0 105.0,442.0 105.0,436.0 104.0,435.0 104.0,428.0 103.0,427.0 103.0,415.0 Z"],"Vasto medial":["M161.0,429.0 161.0,433.0 160.0,434.0 160.0,440.0 159.0,441.0 159.0,445.0 158.0,446.0 158.0,450.0 157.0,451.0 157.0,454.0 156.0,455.0 156.0,458.0 155.0,459.0 155.0,461.0 154.0,462.0 153.0,467.0 151.0,470.0 151.0,472.0 149.0,475.0 149.0,477.0 146.0,482.0 146.0,484.0 145.0,485.0 145.0,487.0 143.0,490.0 143.0,492.0 142.0,493.0 142.0,495.0 141.0,496.0 141.0,498.0 140.0,499.0 140.0,502.0 139.0,503.0 139.0,528.0 140.0,529.0 140.0,533.0 141.0,534.0 141.0,537.0 142.0,538.0 143.0,543.0 144.0,544.0 144.0,545.0 146.0,548.0 146.0,550.0 148.0,552.0 149.0,555.0 151.0,557.0 151.0,558.0 158.0,565.0 159.0,565.0 162.0,567.0 164.0,567.0 165.0,566.0 167.0,566.0 172.0,560.0 172.0,559.0 175.0,554.0 175.0,552.0 176.0,551.0 176.0,549.0 177.0,548.0 177.0,546.0 178.0,545.0 178.0,542.0 179.0,541.0 179.0,538.0 180.0,537.0 180.0,532.0 181.0,531.0 181.0,524.0 182.0,523.0 182.0,499.0 181.0,498.0 181.0,492.0 180.0,491.0 180.0,486.0 179.0,485.0 179.0,480.0 178.0,479.0 178.0,475.0 177.0,474.0 177.0,471.0 176.0,470.0 176.0,467.0 175.0,466.0 175.0,463.0 174.0,462.0 174.0,460.0 173.0,459.0 173.0,457.0 172.0,456.0 172.0,454.0 171.0,453.0 171.0,451.0 170.0,450.0 169.0,445.0 168.0,444.0 168.0,443.0 167.0,442.0 167.0,440.0 165.0,437.0 165.0,435.0 164.0,434.0 162.0,429.0 Z","M236.0,429.0 235.0,429.0 235.0,430.0 232.0,435.0 232.0,437.0 229.0,442.0 229.0,444.0 228.0,445.0 228.0,447.0 227.0,448.0 227.0,450.0 226.0,451.0 226.0,453.0 225.0,454.0 225.0,456.0 224.0,457.0 224.0,459.0 223.0,460.0 223.0,463.0 222.0,464.0 222.0,466.0 221.0,467.0 221.0,470.0 220.0,471.0 220.0,475.0 219.0,476.0 219.0,479.0 218.0,480.0 218.0,484.0 217.0,485.0 217.0,490.0 216.0,491.0 216.0,499.0 215.0,500.0 215.0,524.0 216.0,525.0 216.0,532.0 217.0,533.0 217.0,537.0 218.0,538.0 218.0,542.0 219.0,543.0 219.0,545.0 220.0,546.0 220.0,549.0 222.0,552.0 222.0,554.0 223.0,555.0 226.0,562.0 230.0,566.0 232.0,566.0 233.0,567.0 239.0,565.0 245.0,559.0 245.0,558.0 249.0,553.0 249.0,552.0 254.0,543.0 254.0,541.0 255.0,540.0 255.0,537.0 256.0,536.0 256.0,534.0 257.0,533.0 257.0,529.0 258.0,528.0 258.0,522.0 259.0,521.0 259.0,504.0 258.0,503.0 258.0,499.0 257.0,498.0 257.0,496.0 256.0,495.0 255.0,490.0 253.0,487.0 253.0,485.0 252.0,484.0 252.0,483.0 250.0,480.0 250.0,478.0 247.0,473.0 246.0,468.0 244.0,465.0 244.0,463.0 243.0,462.0 243.0,460.0 242.0,459.0 242.0,457.0 241.0,456.0 241.0,453.0 240.0,452.0 240.0,449.0 239.0,448.0 239.0,444.0 238.0,443.0 238.0,439.0 237.0,438.0 237.0,430.0 Z"],"Peroneo largo":["M281.0,602.0 280.0,602.0 279.0,603.0 279.0,604.0 276.0,609.0 276.0,614.0 277.0,615.0 277.0,618.0 278.0,619.0 278.0,622.0 279.0,623.0 279.0,627.0 280.0,628.0 280.0,632.0 281.0,633.0 281.0,638.0 282.0,639.0 282.0,646.0 283.0,647.0 283.0,673.0 282.0,674.0 282.0,682.0 281.0,683.0 281.0,688.0 280.0,689.0 280.0,692.0 279.0,693.0 279.0,697.0 278.0,698.0 278.0,701.0 277.0,702.0 277.0,704.0 276.0,705.0 276.0,708.0 275.0,709.0 275.0,711.0 274.0,712.0 274.0,714.0 273.0,715.0 273.0,718.0 272.0,719.0 272.0,721.0 271.0,722.0 271.0,725.0 270.0,726.0 270.0,728.0 269.0,729.0 269.0,732.0 268.0,733.0 268.0,735.0 267.0,736.0 267.0,739.0 266.0,740.0 266.0,743.0 265.0,744.0 265.0,747.0 264.0,748.0 264.0,751.0 263.0,752.0 263.0,756.0 262.0,757.0 262.0,762.0 261.0,763.0 261.0,766.0 260.0,767.0 260.0,771.0 259.0,772.0 259.0,779.0 258.0,780.0 258.0,804.0 259.0,804.0 259.0,801.0 260.0,800.0 260.0,795.0 261.0,794.0 261.0,790.0 262.0,789.0 262.0,785.0 263.0,784.0 263.0,780.0 264.0,779.0 264.0,775.0 265.0,774.0 265.0,770.0 266.0,769.0 266.0,765.0 267.0,764.0 267.0,761.0 268.0,760.0 268.0,757.0 269.0,756.0 269.0,753.0 270.0,752.0 270.0,749.0 271.0,748.0 271.0,746.0 272.0,745.0 272.0,742.0 273.0,741.0 273.0,738.0 274.0,737.0 274.0,735.0 275.0,734.0 275.0,731.0 277.0,728.0 277.0,726.0 278.0,725.0 278.0,723.0 279.0,722.0 280.0,717.0 284.0,710.0 284.0,708.0 288.0,701.0 289.0,696.0 292.0,691.0 292.0,689.0 293.0,688.0 293.0,686.0 294.0,685.0 294.0,681.0 295.0,680.0 295.0,675.0 296.0,674.0 296.0,648.0 295.0,647.0 295.0,641.0 294.0,640.0 294.0,636.0 293.0,635.0 293.0,632.0 292.0,631.0 292.0,629.0 291.0,628.0 291.0,625.0 290.0,624.0 290.0,622.0 289.0,621.0 288.0,616.0 286.0,613.0 286.0,611.0 284.0,608.0 284.0,606.0 Z","M116.0,603.0 116.0,604.0 113.0,607.0 112.0,612.0 110.0,615.0 110.0,617.0 109.0,618.0 109.0,621.0 108.0,622.0 108.0,624.0 107.0,625.0 107.0,627.0 106.0,628.0 106.0,630.0 105.0,631.0 105.0,634.0 104.0,635.0 104.0,638.0 103.0,639.0 103.0,643.0 102.0,644.0 102.0,649.0 101.0,650.0 101.0,673.0 102.0,674.0 102.0,680.0 103.0,681.0 103.0,685.0 104.0,686.0 104.0,689.0 105.0,690.0 105.0,692.0 110.0,701.0 110.0,703.0 112.0,706.0 112.0,708.0 116.0,715.0 117.0,720.0 119.0,723.0 119.0,726.0 121.0,729.0 121.0,732.0 122.0,733.0 122.0,735.0 123.0,736.0 123.0,739.0 124.0,740.0 124.0,742.0 125.0,743.0 125.0,746.0 126.0,747.0 126.0,750.0 127.0,751.0 127.0,754.0 128.0,755.0 128.0,758.0 129.0,759.0 129.0,762.0 130.0,763.0 130.0,767.0 131.0,768.0 131.0,773.0 132.0,774.0 132.0,777.0 133.0,778.0 133.0,782.0 134.0,783.0 134.0,787.0 135.0,788.0 135.0,792.0 136.0,793.0 136.0,797.0 137.0,798.0 137.0,802.0 138.0,803.0 139.0,803.0 139.0,788.0 138.0,787.0 138.0,780.0 137.0,779.0 137.0,773.0 136.0,772.0 136.0,767.0 135.0,766.0 135.0,762.0 134.0,761.0 134.0,757.0 133.0,756.0 133.0,752.0 132.0,751.0 132.0,747.0 131.0,746.0 131.0,743.0 130.0,742.0 130.0,739.0 129.0,738.0 129.0,735.0 128.0,734.0 128.0,731.0 127.0,730.0 127.0,727.0 126.0,726.0 126.0,723.0 125.0,722.0 125.0,720.0 124.0,719.0 124.0,717.0 123.0,716.0 123.0,713.0 122.0,712.0 122.0,710.0 121.0,709.0 121.0,706.0 120.0,705.0 120.0,702.0 119.0,701.0 119.0,698.0 118.0,697.0 118.0,694.0 117.0,693.0 117.0,688.0 116.0,687.0 116.0,682.0 115.0,681.0 115.0,672.0 114.0,671.0 114.0,653.0 115.0,652.0 115.0,641.0 116.0,640.0 116.0,635.0 117.0,634.0 117.0,630.0 118.0,629.0 118.0,626.0 119.0,625.0 121.0,625.0 122.0,626.0 122.0,630.0 121.0,631.0 121.0,637.0 120.0,638.0 120.0,647.0 119.0,648.0 119.0,673.0 120.0,674.0 120.0,681.0 121.0,682.0 121.0,688.0 122.0,689.0 122.0,693.0 123.0,694.0 123.0,697.0 124.0,698.0 124.0,701.0 125.0,702.0 125.0,705.0 126.0,706.0 126.0,709.0 127.0,710.0 127.0,712.0 128.0,713.0 128.0,715.0 129.0,716.0 130.0,721.0 132.0,724.0 132.0,726.0 133.0,727.0 135.0,732.0 136.0,732.0 137.0,731.0 137.0,723.0 138.0,722.0 138.0,702.0 137.0,701.0 137.0,678.0 136.0,677.0 136.0,665.0 135.0,664.0 135.0,657.0 134.0,656.0 134.0,650.0 133.0,649.0 133.0,643.0 132.0,642.0 132.0,639.0 131.0,638.0 131.0,635.0 130.0,634.0 130.0,631.0 129.0,630.0 129.0,628.0 128.0,627.0 128.0,624.0 126.0,621.0 126.0,619.0 124.0,619.0 124.0,620.0 123.0,621.0 123.0,624.0 122.0,625.0 120.0,625.0 119.0,624.0 119.0,621.0 120.0,620.0 120.0,617.0 121.0,616.0 121.0,613.0 122.0,612.0 122.0,611.0 121.0,610.0 118.0,603.0 Z","M273.0,618.0 272.0,618.0 272.0,619.0 271.0,620.0 271.0,622.0 270.0,623.0 270.0,625.0 269.0,626.0 269.0,628.0 268.0,629.0 268.0,632.0 267.0,633.0 267.0,635.0 266.0,636.0 266.0,639.0 265.0,640.0 265.0,643.0 264.0,644.0 264.0,649.0 263.0,650.0 263.0,654.0 262.0,655.0 262.0,661.0 261.0,662.0 261.0,672.0 260.0,673.0 260.0,687.0 259.0,688.0 259.0,729.0 260.0,730.0 260.0,732.0 261.0,732.0 262.0,731.0 262.0,730.0 265.0,725.0 266.0,720.0 268.0,717.0 268.0,715.0 269.0,714.0 269.0,712.0 270.0,711.0 270.0,709.0 271.0,708.0 271.0,706.0 272.0,705.0 272.0,703.0 273.0,702.0 273.0,698.0 274.0,697.0 274.0,694.0 275.0,693.0 275.0,689.0 276.0,688.0 276.0,684.0 277.0,683.0 277.0,677.0 278.0,676.0 278.0,644.0 277.0,643.0 277.0,636.0 276.0,635.0 276.0,629.0 275.0,628.0 275.0,624.0 274.0,623.0 274.0,620.0 273.0,619.0 Z"],"Tibial anterior":["M164.0,611.0 162.0,616.0 160.0,618.0 160.0,619.0 156.0,626.0 156.0,628.0 154.0,631.0 154.0,633.0 153.0,634.0 153.0,636.0 152.0,637.0 152.0,639.0 151.0,640.0 151.0,643.0 150.0,644.0 150.0,649.0 149.0,650.0 149.0,659.0 148.0,660.0 148.0,661.0 149.0,662.0 149.0,668.0 150.0,669.0 150.0,672.0 151.0,673.0 151.0,675.0 152.0,676.0 153.0,681.0 155.0,684.0 155.0,686.0 156.0,687.0 156.0,688.0 157.0,689.0 157.0,690.0 158.0,691.0 164.0,704.0 165.0,705.0 166.0,705.0 171.0,696.0 171.0,694.0 172.0,693.0 172.0,692.0 173.0,691.0 173.0,689.0 175.0,686.0 175.0,682.0 176.0,681.0 176.0,675.0 177.0,674.0 177.0,659.0 176.0,658.0 176.0,652.0 175.0,651.0 175.0,648.0 174.0,647.0 174.0,644.0 173.0,643.0 173.0,641.0 172.0,640.0 172.0,638.0 171.0,637.0 171.0,634.0 170.0,633.0 170.0,631.0 169.0,630.0 169.0,628.0 168.0,627.0 168.0,625.0 167.0,624.0 167.0,621.0 166.0,620.0 166.0,618.0 165.0,617.0 165.0,611.0 Z","M233.0,612.0 232.0,612.0 232.0,616.0 231.0,617.0 231.0,620.0 230.0,621.0 230.0,623.0 229.0,624.0 229.0,626.0 228.0,627.0 228.0,630.0 227.0,631.0 227.0,633.0 226.0,634.0 226.0,636.0 225.0,637.0 225.0,640.0 224.0,641.0 224.0,643.0 223.0,644.0 223.0,647.0 222.0,648.0 222.0,651.0 221.0,652.0 221.0,657.0 220.0,658.0 220.0,678.0 221.0,679.0 221.0,683.0 222.0,684.0 222.0,688.0 224.0,690.0 226.0,696.0 227.0,696.0 228.0,697.0 228.0,701.0 230.0,703.0 230.0,704.0 232.0,704.0 233.0,703.0 234.0,700.0 236.0,698.0 236.0,697.0 241.0,688.0 241.0,686.0 242.0,685.0 242.0,684.0 243.0,683.0 243.0,681.0 245.0,678.0 245.0,676.0 246.0,675.0 246.0,672.0 247.0,671.0 247.0,668.0 248.0,667.0 248.0,651.0 247.0,650.0 247.0,645.0 246.0,644.0 246.0,641.0 245.0,640.0 245.0,637.0 244.0,636.0 244.0,634.0 243.0,633.0 242.0,628.0 241.0,627.0 236.0,616.0 Z"],"Gastrocnemio":["M248.0,683.0 247.0,683.0 247.0,684.0 246.0,685.0 246.0,687.0 241.0,696.0 241.0,698.0 236.0,707.0 236.0,709.0 235.0,710.0 235.0,712.0 234.0,713.0 234.0,725.0 235.0,726.0 235.0,730.0 236.0,731.0 236.0,735.0 237.0,736.0 237.0,741.0 238.0,742.0 238.0,748.0 239.0,749.0 239.0,756.0 240.0,757.0 240.0,771.0 241.0,772.0 241.0,778.0 240.0,779.0 240.0,793.0 241.0,793.0 241.0,791.0 242.0,790.0 242.0,787.0 243.0,786.0 243.0,783.0 244.0,782.0 244.0,779.0 245.0,778.0 245.0,773.0 246.0,772.0 246.0,763.0 247.0,762.0 247.0,750.0 248.0,749.0 Z","M148.0,684.0 148.0,747.0 149.0,748.0 149.0,762.0 150.0,763.0 150.0,770.0 151.0,771.0 151.0,777.0 152.0,778.0 152.0,782.0 153.0,783.0 153.0,786.0 154.0,787.0 154.0,790.0 155.0,791.0 155.0,793.0 156.0,793.0 156.0,760.0 157.0,759.0 157.0,750.0 158.0,749.0 158.0,744.0 159.0,743.0 159.0,739.0 160.0,738.0 160.0,732.0 161.0,731.0 161.0,727.0 162.0,726.0 162.0,720.0 163.0,719.0 163.0,716.0 162.0,715.0 162.0,711.0 161.0,710.0 160.0,705.0 157.0,701.0 157.0,699.0 152.0,690.0 152.0,688.0 151.0,687.0 150.0,684.0 Z"]}},"back":{"w":431.0,"h":838.0,"regions":{"Trapecio":["M225.0,6.0 208.0,6.0 207.0,7.0 207.0,13.0 206.0,14.0 206.0,18.0 205.0,19.0 205.0,22.0 204.0,23.0 203.0,28.0 202.0,29.0 198.0,38.0 196.0,40.0 196.0,41.0 189.0,48.0 189.0,49.0 186.0,52.0 186.0,55.0 187.0,55.0 192.0,58.0 194.0,58.0 198.0,61.0 199.0,61.0 209.0,71.0 209.0,72.0 213.0,77.0 215.0,82.0 216.0,82.0 218.0,80.0 218.0,79.0 219.0,78.0 220.0,75.0 222.0,73.0 222.0,72.0 233.0,61.0 236.0,60.0 238.0,58.0 240.0,58.0 241.0,57.0 246.0,55.0 246.0,52.0 236.0,41.0 236.0,40.0 234.0,38.0 234.0,37.0 230.0,30.0 230.0,28.0 229.0,27.0 229.0,25.0 228.0,24.0 228.0,22.0 227.0,21.0 227.0,17.0 226.0,16.0 226.0,7.0 Z","M201.0,7.0 196.0,7.0 193.0,9.0 191.0,9.0 189.0,11.0 189.0,23.0 190.0,24.0 190.0,35.0 191.0,36.0 192.0,36.0 195.0,32.0 195.0,31.0 198.0,26.0 198.0,24.0 200.0,21.0 200.0,18.0 201.0,17.0 201.0,13.0 202.0,12.0 202.0,8.0 Z","M231.0,7.0 231.0,16.0 232.0,17.0 232.0,20.0 233.0,21.0 233.0,24.0 235.0,27.0 235.0,29.0 236.0,30.0 236.0,31.0 238.0,33.0 238.0,34.0 240.0,36.0 240.0,37.0 241.0,37.0 241.0,35.0 242.0,34.0 242.0,22.0 243.0,21.0 243.0,11.0 239.0,8.0 237.0,8.0 236.0,7.0 Z"],"Romboides":["M177.0,60.0 176.0,61.0 171.0,62.0 168.0,64.0 166.0,64.0 163.0,66.0 161.0,66.0 156.0,69.0 154.0,69.0 147.0,73.0 145.0,73.0 144.0,74.0 137.0,77.0 135.0,79.0 134.0,79.0 130.0,83.0 130.0,85.0 132.0,87.0 133.0,87.0 138.0,90.0 141.0,90.0 142.0,91.0 145.0,91.0 148.0,93.0 151.0,93.0 152.0,94.0 157.0,96.0 160.0,99.0 160.0,100.0 162.0,103.0 163.0,108.0 164.0,109.0 164.0,112.0 165.0,113.0 165.0,115.0 166.0,116.0 166.0,119.0 167.0,120.0 167.0,123.0 168.0,124.0 168.0,127.0 169.0,128.0 169.0,131.0 170.0,132.0 170.0,134.0 171.0,135.0 171.0,138.0 172.0,139.0 172.0,141.0 173.0,142.0 173.0,145.0 174.0,146.0 174.0,148.0 175.0,149.0 175.0,152.0 176.0,153.0 176.0,155.0 177.0,156.0 177.0,158.0 178.0,159.0 178.0,161.0 179.0,162.0 179.0,164.0 180.0,165.0 180.0,167.0 181.0,168.0 181.0,170.0 182.0,171.0 183.0,176.0 184.0,177.0 184.0,178.0 185.0,179.0 185.0,181.0 188.0,186.0 188.0,188.0 189.0,189.0 189.0,190.0 190.0,191.0 190.0,192.0 191.0,193.0 191.0,194.0 192.0,195.0 192.0,196.0 193.0,197.0 193.0,198.0 194.0,199.0 194.0,200.0 195.0,201.0 195.0,202.0 196.0,203.0 202.0,216.0 204.0,218.0 204.0,219.0 207.0,223.0 207.0,224.0 208.0,225.0 209.0,225.0 211.0,222.0 211.0,218.0 212.0,217.0 212.0,126.0 211.0,125.0 211.0,90.0 210.0,89.0 210.0,85.0 209.0,84.0 209.0,82.0 208.0,81.0 208.0,79.0 207.0,78.0 206.0,75.0 204.0,73.0 204.0,72.0 199.0,67.0 198.0,67.0 196.0,65.0 195.0,65.0 193.0,63.0 192.0,63.0 189.0,61.0 186.0,61.0 185.0,60.0 Z","M255.0,60.0 246.0,60.0 245.0,61.0 243.0,61.0 242.0,62.0 237.0,64.0 229.0,71.0 229.0,72.0 225.0,77.0 225.0,78.0 224.0,79.0 224.0,81.0 222.0,84.0 222.0,88.0 221.0,89.0 221.0,106.0 220.0,107.0 220.0,220.0 221.0,221.0 221.0,224.0 222.0,225.0 224.0,225.0 224.0,224.0 226.0,222.0 228.0,217.0 230.0,215.0 235.0,204.0 237.0,202.0 237.0,201.0 240.0,196.0 240.0,194.0 241.0,193.0 241.0,192.0 244.0,187.0 244.0,185.0 246.0,182.0 247.0,177.0 249.0,174.0 249.0,172.0 250.0,171.0 250.0,169.0 251.0,168.0 251.0,166.0 252.0,165.0 252.0,163.0 253.0,162.0 253.0,160.0 254.0,159.0 254.0,157.0 255.0,156.0 255.0,154.0 256.0,153.0 256.0,151.0 257.0,150.0 257.0,148.0 258.0,147.0 258.0,145.0 259.0,144.0 259.0,141.0 260.0,140.0 260.0,138.0 261.0,137.0 261.0,134.0 262.0,133.0 262.0,131.0 263.0,130.0 263.0,127.0 264.0,126.0 264.0,124.0 265.0,123.0 265.0,120.0 266.0,119.0 266.0,116.0 267.0,115.0 267.0,113.0 268.0,112.0 268.0,109.0 269.0,108.0 269.0,106.0 270.0,105.0 270.0,103.0 271.0,102.0 272.0,99.0 275.0,96.0 276.0,96.0 281.0,93.0 284.0,93.0 285.0,92.0 287.0,92.0 288.0,91.0 291.0,91.0 292.0,90.0 294.0,90.0 295.0,89.0 300.0,87.0 302.0,84.0 302.0,83.0 298.0,79.0 297.0,79.0 278.0,69.0 273.0,68.0 268.0,65.0 266.0,65.0 261.0,62.0 259.0,62.0 258.0,61.0 256.0,61.0 Z"],"Deltoides posterior":["M141.0,102.0 138.0,99.0 137.0,99.0 120.0,90.0 118.0,90.0 117.0,89.0 115.0,89.0 114.0,88.0 112.0,88.0 111.0,87.0 106.0,87.0 105.0,86.0 97.0,86.0 96.0,87.0 90.0,87.0 89.0,88.0 87.0,88.0 86.0,89.0 84.0,89.0 83.0,90.0 82.0,90.0 80.0,92.0 79.0,92.0 77.0,94.0 76.0,94.0 70.0,100.0 70.0,101.0 66.0,106.0 66.0,107.0 63.0,112.0 63.0,114.0 61.0,117.0 61.0,120.0 60.0,121.0 60.0,125.0 59.0,126.0 59.0,131.0 58.0,132.0 58.0,144.0 59.0,145.0 59.0,152.0 60.0,153.0 60.0,156.0 61.0,157.0 62.0,157.0 65.0,154.0 65.0,153.0 74.0,145.0 75.0,145.0 82.0,141.0 84.0,141.0 85.0,140.0 88.0,140.0 89.0,139.0 93.0,139.0 94.0,138.0 97.0,138.0 98.0,137.0 101.0,137.0 102.0,136.0 107.0,135.0 108.0,134.0 113.0,132.0 115.0,130.0 116.0,130.0 118.0,128.0 119.0,128.0 123.0,124.0 124.0,124.0 135.0,113.0 135.0,112.0 139.0,108.0 139.0,107.0 141.0,105.0 Z","M291.0,102.0 291.0,104.0 292.0,105.0 292.0,106.0 296.0,110.0 296.0,111.0 311.0,126.0 312.0,126.0 320.0,132.0 321.0,132.0 328.0,136.0 331.0,136.0 332.0,137.0 334.0,137.0 335.0,138.0 339.0,138.0 340.0,139.0 345.0,139.0 346.0,140.0 348.0,140.0 349.0,141.0 351.0,141.0 352.0,142.0 355.0,143.0 357.0,145.0 358.0,145.0 368.0,155.0 368.0,156.0 369.0,157.0 371.0,157.0 371.0,152.0 372.0,151.0 372.0,146.0 373.0,145.0 373.0,126.0 372.0,125.0 372.0,120.0 371.0,119.0 371.0,117.0 370.0,116.0 369.0,111.0 368.0,110.0 366.0,105.0 361.0,99.0 361.0,98.0 354.0,92.0 353.0,92.0 346.0,88.0 344.0,88.0 343.0,87.0 337.0,87.0 336.0,86.0 328.0,86.0 327.0,87.0 322.0,87.0 321.0,88.0 319.0,88.0 318.0,89.0 313.0,90.0 312.0,91.0 311.0,91.0 310.0,92.0 309.0,92.0 308.0,93.0 307.0,93.0 306.0,94.0 293.0,100.0 Z"],"Infraespinoso":["M144.0,111.0 143.0,112.0 142.0,112.0 140.0,114.0 140.0,115.0 129.0,126.0 128.0,126.0 124.0,130.0 124.0,132.0 125.0,133.0 126.0,136.0 128.0,138.0 128.0,139.0 137.0,149.0 137.0,150.0 152.0,164.0 153.0,164.0 158.0,168.0 159.0,168.0 164.0,171.0 166.0,171.0 167.0,172.0 171.0,172.0 172.0,171.0 172.0,167.0 171.0,166.0 171.0,162.0 170.0,161.0 170.0,159.0 169.0,158.0 169.0,155.0 168.0,154.0 168.0,151.0 167.0,150.0 167.0,148.0 166.0,147.0 166.0,144.0 165.0,143.0 165.0,141.0 164.0,140.0 164.0,138.0 163.0,137.0 163.0,134.0 162.0,133.0 161.0,128.0 158.0,123.0 158.0,121.0 156.0,119.0 156.0,118.0 151.0,113.0 150.0,113.0 147.0,111.0 Z","M288.0,111.0 284.0,111.0 283.0,112.0 280.0,113.0 275.0,119.0 275.0,120.0 271.0,127.0 271.0,129.0 269.0,132.0 269.0,134.0 268.0,135.0 268.0,137.0 267.0,138.0 267.0,141.0 266.0,142.0 266.0,144.0 265.0,145.0 265.0,147.0 264.0,148.0 264.0,150.0 263.0,151.0 263.0,154.0 262.0,155.0 262.0,157.0 261.0,158.0 261.0,161.0 260.0,162.0 260.0,166.0 259.0,167.0 259.0,172.0 260.0,173.0 261.0,173.0 262.0,172.0 264.0,172.0 265.0,171.0 267.0,171.0 271.0,168.0 274.0,167.0 279.0,163.0 280.0,163.0 287.0,156.0 288.0,156.0 292.0,152.0 292.0,151.0 300.0,143.0 300.0,142.0 304.0,138.0 304.0,137.0 308.0,132.0 308.0,130.0 302.0,124.0 301.0,124.0 290.0,112.0 289.0,112.0 Z"],"Redondo mayor":["M109.0,141.0 109.0,142.0 108.0,143.0 108.0,156.0 109.0,157.0 109.0,160.0 110.0,161.0 111.0,164.0 115.0,169.0 116.0,169.0 118.0,171.0 119.0,171.0 122.0,173.0 125.0,173.0 126.0,174.0 130.0,174.0 131.0,175.0 150.0,175.0 151.0,174.0 154.0,174.0 155.0,173.0 155.0,172.0 153.0,170.0 152.0,170.0 148.0,166.0 147.0,166.0 144.0,163.0 143.0,163.0 135.0,155.0 135.0,154.0 129.0,148.0 129.0,147.0 124.0,142.0 124.0,141.0 123.0,140.0 122.0,140.0 120.0,138.0 114.0,138.0 110.0,141.0 Z","M323.0,142.0 321.0,140.0 320.0,140.0 317.0,138.0 311.0,138.0 297.0,153.0 297.0,154.0 296.0,155.0 295.0,155.0 285.0,165.0 284.0,165.0 281.0,168.0 280.0,168.0 277.0,171.0 276.0,171.0 275.0,172.0 275.0,173.0 276.0,173.0 277.0,174.0 281.0,174.0 282.0,175.0 300.0,175.0 301.0,174.0 305.0,174.0 306.0,173.0 309.0,173.0 310.0,172.0 315.0,170.0 320.0,165.0 320.0,164.0 322.0,161.0 322.0,159.0 323.0,158.0 323.0,155.0 324.0,154.0 324.0,144.0 323.0,143.0 Z"],"Tríceps (cabeza lateral)":["M96.0,145.0 87.0,145.0 86.0,146.0 81.0,147.0 79.0,149.0 76.0,150.0 70.0,156.0 70.0,157.0 68.0,159.0 68.0,160.0 63.0,169.0 63.0,171.0 62.0,172.0 62.0,174.0 61.0,175.0 61.0,177.0 60.0,178.0 60.0,182.0 59.0,183.0 59.0,188.0 58.0,189.0 58.0,196.0 57.0,197.0 57.0,207.0 58.0,208.0 58.0,212.0 59.0,213.0 59.0,214.0 62.0,216.0 67.0,216.0 68.0,215.0 71.0,215.0 72.0,214.0 74.0,214.0 75.0,213.0 78.0,212.0 81.0,209.0 82.0,209.0 90.0,200.0 90.0,199.0 92.0,197.0 92.0,196.0 96.0,189.0 96.0,187.0 97.0,186.0 97.0,184.0 98.0,183.0 98.0,181.0 99.0,180.0 99.0,177.0 100.0,176.0 100.0,172.0 101.0,171.0 101.0,151.0 100.0,150.0 100.0,148.0 Z","M335.0,145.0 333.0,147.0 333.0,148.0 332.0,149.0 332.0,152.0 331.0,153.0 331.0,171.0 332.0,172.0 332.0,177.0 333.0,178.0 333.0,181.0 334.0,182.0 334.0,184.0 335.0,185.0 336.0,190.0 337.0,191.0 340.0,198.0 342.0,200.0 342.0,201.0 349.0,209.0 350.0,209.0 352.0,211.0 353.0,211.0 357.0,214.0 359.0,214.0 360.0,215.0 363.0,215.0 364.0,216.0 370.0,216.0 373.0,212.0 373.0,204.0 374.0,203.0 374.0,197.0 373.0,196.0 373.0,186.0 372.0,185.0 372.0,180.0 371.0,179.0 371.0,176.0 370.0,175.0 370.0,173.0 369.0,172.0 368.0,167.0 367.0,166.0 364.0,159.0 361.0,156.0 361.0,155.0 355.0,149.0 354.0,149.0 349.0,146.0 347.0,146.0 346.0,145.0 Z","M56.0,164.0 55.0,164.0 55.0,165.0 51.0,169.0 51.0,170.0 47.0,175.0 47.0,176.0 44.0,181.0 44.0,183.0 43.0,184.0 43.0,186.0 41.0,189.0 41.0,191.0 40.0,192.0 40.0,195.0 39.0,196.0 39.0,200.0 38.0,201.0 38.0,208.0 37.0,209.0 37.0,222.0 38.0,222.0 42.0,213.0 44.0,211.0 45.0,208.0 49.0,203.0 49.0,202.0 52.0,197.0 52.0,195.0 53.0,194.0 53.0,190.0 54.0,189.0 54.0,184.0 55.0,183.0 55.0,174.0 56.0,173.0 Z","M376.0,165.0 376.0,179.0 377.0,180.0 377.0,188.0 378.0,189.0 378.0,193.0 379.0,194.0 379.0,197.0 381.0,200.0 381.0,202.0 383.0,204.0 383.0,205.0 385.0,207.0 386.0,210.0 390.0,215.0 393.0,222.0 394.0,222.0 394.0,207.0 393.0,206.0 393.0,199.0 392.0,198.0 392.0,195.0 391.0,194.0 391.0,190.0 390.0,189.0 389.0,184.0 388.0,183.0 384.0,174.0 382.0,172.0 382.0,171.0 380.0,169.0 380.0,168.0 377.0,165.0 Z"],"Dorsal ancho":["M109.0,173.0 109.0,192.0 110.0,193.0 110.0,197.0 111.0,198.0 111.0,201.0 112.0,202.0 112.0,204.0 113.0,205.0 114.0,210.0 116.0,213.0 116.0,215.0 117.0,216.0 122.0,227.0 124.0,229.0 124.0,230.0 126.0,232.0 127.0,235.0 130.0,238.0 130.0,239.0 134.0,243.0 134.0,244.0 138.0,248.0 138.0,249.0 142.0,253.0 142.0,254.0 147.0,259.0 147.0,260.0 151.0,264.0 151.0,265.0 165.0,280.0 165.0,281.0 175.0,291.0 176.0,291.0 178.0,289.0 178.0,288.0 179.0,287.0 179.0,286.0 180.0,285.0 180.0,284.0 181.0,283.0 181.0,282.0 182.0,281.0 182.0,280.0 183.0,279.0 183.0,278.0 184.0,277.0 184.0,276.0 185.0,275.0 185.0,274.0 186.0,273.0 186.0,272.0 187.0,271.0 187.0,270.0 188.0,269.0 188.0,268.0 189.0,267.0 189.0,266.0 190.0,265.0 190.0,264.0 191.0,263.0 191.0,262.0 201.0,243.0 201.0,241.0 204.0,236.0 204.0,231.0 203.0,230.0 198.0,219.0 196.0,217.0 191.0,206.0 189.0,204.0 189.0,203.0 188.0,202.0 188.0,201.0 187.0,200.0 187.0,199.0 186.0,198.0 186.0,197.0 185.0,196.0 179.0,183.0 176.0,180.0 175.0,180.0 174.0,179.0 172.0,179.0 171.0,178.0 167.0,178.0 166.0,179.0 157.0,179.0 156.0,180.0 148.0,180.0 147.0,181.0 133.0,181.0 132.0,180.0 126.0,180.0 125.0,179.0 120.0,178.0 117.0,176.0 115.0,176.0 111.0,173.0 Z","M322.0,173.0 321.0,173.0 312.0,178.0 310.0,178.0 309.0,179.0 307.0,179.0 306.0,180.0 299.0,180.0 298.0,181.0 284.0,181.0 283.0,180.0 276.0,180.0 275.0,179.0 268.0,179.0 267.0,178.0 261.0,178.0 260.0,179.0 257.0,179.0 253.0,182.0 253.0,183.0 252.0,184.0 252.0,185.0 251.0,186.0 251.0,187.0 250.0,188.0 250.0,189.0 249.0,190.0 249.0,191.0 248.0,192.0 248.0,193.0 247.0,194.0 241.0,207.0 239.0,209.0 234.0,220.0 232.0,222.0 232.0,223.0 228.0,230.0 228.0,232.0 227.0,233.0 227.0,234.0 228.0,235.0 228.0,237.0 230.0,240.0 230.0,242.0 236.0,253.0 236.0,255.0 245.0,272.0 245.0,274.0 246.0,275.0 252.0,288.0 254.0,290.0 257.0,290.0 259.0,288.0 259.0,287.0 273.0,272.0 273.0,271.0 279.0,265.0 279.0,264.0 284.0,259.0 284.0,258.0 288.0,254.0 288.0,253.0 293.0,248.0 293.0,247.0 296.0,244.0 296.0,243.0 300.0,239.0 300.0,238.0 302.0,236.0 302.0,235.0 308.0,227.0 309.0,224.0 311.0,222.0 311.0,221.0 315.0,214.0 315.0,212.0 317.0,209.0 317.0,207.0 318.0,206.0 318.0,204.0 319.0,203.0 319.0,201.0 320.0,200.0 320.0,197.0 321.0,196.0 321.0,192.0 322.0,191.0 322.0,184.0 323.0,183.0 323.0,176.0 322.0,175.0 Z","M141.0,262.0 141.0,264.0 142.0,265.0 142.0,271.0 143.0,272.0 143.0,278.0 144.0,279.0 144.0,288.0 145.0,289.0 145.0,305.0 146.0,305.0 153.0,298.0 154.0,298.0 158.0,294.0 159.0,294.0 160.0,293.0 160.0,292.0 161.0,291.0 161.0,286.0 160.0,285.0 159.0,282.0 156.0,279.0 156.0,278.0 150.0,272.0 150.0,271.0 146.0,267.0 146.0,266.0 142.0,262.0 Z","M289.0,262.0 288.0,262.0 283.0,267.0 283.0,268.0 273.0,279.0 273.0,280.0 270.0,284.0 270.0,287.0 269.0,288.0 269.0,289.0 270.0,290.0 270.0,292.0 273.0,295.0 274.0,295.0 277.0,298.0 278.0,298.0 284.0,304.0 285.0,304.0 285.0,288.0 286.0,287.0 286.0,278.0 287.0,277.0 287.0,271.0 288.0,270.0 288.0,265.0 289.0,264.0 Z"],"Tríceps (cabeza larga)":["M85.0,214.0 83.0,214.0 78.0,218.0 76.0,218.0 73.0,220.0 71.0,220.0 70.0,221.0 68.0,221.0 67.0,222.0 64.0,222.0 63.0,223.0 58.0,224.0 56.0,226.0 55.0,226.0 52.0,229.0 52.0,230.0 50.0,232.0 50.0,233.0 48.0,235.0 48.0,236.0 46.0,239.0 46.0,241.0 45.0,242.0 45.0,244.0 44.0,245.0 44.0,254.0 52.0,254.0 53.0,253.0 56.0,253.0 57.0,252.0 58.0,252.0 59.0,251.0 61.0,251.0 63.0,249.0 66.0,248.0 74.0,240.0 74.0,239.0 76.0,237.0 77.0,234.0 79.0,232.0 79.0,231.0 81.0,228.0 81.0,226.0 83.0,223.0 83.0,221.0 84.0,220.0 84.0,218.0 85.0,217.0 Z","M346.0,214.0 346.0,215.0 347.0,216.0 347.0,218.0 348.0,219.0 348.0,221.0 349.0,222.0 349.0,224.0 350.0,225.0 350.0,227.0 351.0,228.0 354.0,235.0 356.0,237.0 356.0,238.0 358.0,240.0 358.0,241.0 365.0,248.0 366.0,248.0 370.0,251.0 372.0,251.0 375.0,253.0 379.0,253.0 380.0,254.0 387.0,254.0 387.0,251.0 388.0,250.0 388.0,249.0 387.0,248.0 387.0,245.0 386.0,244.0 385.0,239.0 384.0,238.0 382.0,233.0 376.0,226.0 375.0,226.0 371.0,223.0 369.0,223.0 368.0,222.0 365.0,222.0 364.0,221.0 361.0,221.0 360.0,220.0 358.0,220.0 357.0,219.0 350.0,216.0 348.0,214.0 Z"],"Extensores del antebrazo":["M31.0,245.0 30.0,245.0 27.0,248.0 27.0,249.0 21.0,257.0 21.0,258.0 14.0,271.0 14.0,273.0 13.0,274.0 13.0,276.0 12.0,277.0 12.0,280.0 11.0,281.0 11.0,283.0 10.0,284.0 10.0,286.0 9.0,287.0 9.0,292.0 8.0,293.0 8.0,299.0 7.0,300.0 7.0,310.0 6.0,311.0 6.0,325.0 7.0,326.0 7.0,345.0 8.0,345.0 8.0,342.0 9.0,341.0 9.0,334.0 10.0,333.0 10.0,325.0 11.0,324.0 11.0,316.0 12.0,315.0 12.0,309.0 13.0,308.0 13.0,303.0 14.0,302.0 14.0,298.0 15.0,297.0 15.0,294.0 16.0,293.0 16.0,291.0 17.0,290.0 17.0,288.0 18.0,287.0 18.0,285.0 19.0,284.0 19.0,281.0 21.0,278.0 22.0,273.0 24.0,270.0 25.0,265.0 26.0,264.0 26.0,263.0 27.0,262.0 27.0,260.0 28.0,259.0 28.0,256.0 29.0,255.0 29.0,252.0 30.0,251.0 30.0,248.0 31.0,247.0 Z","M401.0,246.0 401.0,247.0 402.0,248.0 402.0,251.0 403.0,252.0 403.0,255.0 404.0,256.0 404.0,258.0 405.0,259.0 405.0,262.0 406.0,263.0 406.0,265.0 408.0,268.0 409.0,273.0 411.0,276.0 412.0,281.0 414.0,284.0 414.0,286.0 415.0,287.0 415.0,289.0 416.0,290.0 416.0,293.0 417.0,294.0 417.0,297.0 418.0,298.0 418.0,302.0 419.0,303.0 419.0,308.0 420.0,309.0 420.0,317.0 421.0,318.0 421.0,326.0 422.0,327.0 422.0,336.0 423.0,337.0 423.0,343.0 424.0,343.0 424.0,338.0 425.0,337.0 425.0,323.0 424.0,322.0 424.0,316.0 425.0,315.0 425.0,299.0 424.0,298.0 424.0,292.0 423.0,291.0 423.0,286.0 422.0,285.0 422.0,283.0 421.0,282.0 421.0,280.0 420.0,279.0 419.0,274.0 417.0,271.0 417.0,269.0 416.0,268.0 414.0,263.0 412.0,261.0 411.0,258.0 409.0,256.0 409.0,255.0 407.0,253.0 407.0,252.0 404.0,249.0 404.0,248.0 402.0,246.0 Z","M69.0,255.0 68.0,255.0 66.0,257.0 63.0,258.0 60.0,261.0 59.0,261.0 56.0,265.0 56.0,267.0 55.0,268.0 55.0,272.0 54.0,273.0 54.0,278.0 53.0,279.0 53.0,284.0 52.0,285.0 52.0,289.0 51.0,290.0 51.0,294.0 50.0,295.0 50.0,298.0 49.0,299.0 49.0,301.0 48.0,302.0 48.0,305.0 47.0,306.0 47.0,308.0 46.0,309.0 46.0,311.0 45.0,312.0 45.0,314.0 44.0,315.0 44.0,317.0 43.0,318.0 42.0,323.0 40.0,326.0 40.0,328.0 39.0,329.0 39.0,331.0 38.0,332.0 38.0,334.0 37.0,335.0 37.0,337.0 36.0,338.0 36.0,340.0 35.0,341.0 35.0,343.0 34.0,344.0 34.0,347.0 33.0,348.0 33.0,350.0 32.0,351.0 32.0,354.0 31.0,355.0 31.0,356.0 32.0,356.0 32.0,354.0 34.0,352.0 36.0,347.0 38.0,345.0 38.0,344.0 40.0,342.0 40.0,341.0 42.0,339.0 42.0,338.0 45.0,335.0 45.0,334.0 49.0,330.0 49.0,329.0 55.0,322.0 56.0,319.0 60.0,314.0 60.0,313.0 62.0,310.0 62.0,308.0 65.0,303.0 65.0,301.0 66.0,300.0 66.0,297.0 67.0,296.0 67.0,294.0 68.0,293.0 68.0,288.0 69.0,287.0 69.0,279.0 70.0,278.0 70.0,271.0 69.0,270.0 Z","M363.0,256.0 363.0,258.0 362.0,259.0 362.0,286.0 363.0,287.0 363.0,292.0 364.0,293.0 364.0,296.0 365.0,297.0 366.0,302.0 367.0,303.0 367.0,304.0 368.0,305.0 368.0,307.0 369.0,308.0 370.0,311.0 372.0,313.0 373.0,316.0 375.0,318.0 375.0,319.0 377.0,321.0 377.0,322.0 380.0,325.0 380.0,326.0 383.0,329.0 383.0,330.0 390.0,338.0 390.0,339.0 394.0,344.0 397.0,351.0 398.0,352.0 399.0,352.0 399.0,350.0 398.0,349.0 398.0,347.0 397.0,346.0 397.0,343.0 396.0,342.0 396.0,340.0 395.0,339.0 395.0,337.0 394.0,336.0 394.0,334.0 393.0,333.0 392.0,328.0 390.0,325.0 390.0,323.0 389.0,322.0 389.0,320.0 388.0,319.0 388.0,317.0 387.0,316.0 387.0,314.0 386.0,313.0 386.0,311.0 385.0,310.0 385.0,308.0 384.0,307.0 384.0,305.0 383.0,304.0 383.0,302.0 382.0,301.0 382.0,298.0 381.0,297.0 381.0,294.0 380.0,293.0 380.0,290.0 379.0,289.0 379.0,284.0 378.0,283.0 378.0,278.0 377.0,277.0 377.0,272.0 376.0,271.0 376.0,267.0 373.0,262.0 372.0,262.0 366.0,257.0 Z","M49.0,263.0 45.0,263.0 44.0,264.0 42.0,264.0 41.0,265.0 40.0,265.0 38.0,267.0 37.0,267.0 30.0,274.0 30.0,275.0 27.0,278.0 27.0,279.0 22.0,288.0 22.0,290.0 21.0,291.0 21.0,293.0 20.0,294.0 20.0,296.0 19.0,297.0 19.0,301.0 18.0,302.0 18.0,307.0 17.0,308.0 17.0,315.0 16.0,316.0 16.0,326.0 15.0,327.0 15.0,367.0 16.0,368.0 16.0,375.0 17.0,376.0 17.0,379.0 18.0,380.0 18.0,381.0 19.0,381.0 19.0,378.0 20.0,377.0 20.0,374.0 21.0,373.0 21.0,369.0 22.0,368.0 22.0,366.0 23.0,365.0 23.0,362.0 24.0,361.0 24.0,358.0 25.0,357.0 25.0,355.0 26.0,354.0 26.0,352.0 27.0,351.0 27.0,349.0 28.0,348.0 28.0,346.0 29.0,345.0 29.0,343.0 30.0,342.0 30.0,340.0 31.0,339.0 32.0,334.0 34.0,331.0 35.0,326.0 37.0,323.0 37.0,320.0 39.0,317.0 39.0,315.0 40.0,314.0 40.0,312.0 41.0,311.0 41.0,309.0 42.0,308.0 42.0,305.0 43.0,304.0 43.0,302.0 44.0,301.0 44.0,299.0 45.0,298.0 45.0,294.0 46.0,293.0 46.0,290.0 47.0,289.0 47.0,285.0 48.0,284.0 48.0,280.0 49.0,279.0 49.0,272.0 50.0,271.0 50.0,265.0 49.0,264.0 Z","M382.0,263.0 382.0,277.0 383.0,278.0 383.0,283.0 384.0,284.0 384.0,288.0 385.0,289.0 385.0,293.0 386.0,294.0 386.0,297.0 387.0,298.0 387.0,301.0 388.0,302.0 388.0,304.0 389.0,305.0 389.0,307.0 390.0,308.0 390.0,310.0 391.0,311.0 391.0,313.0 392.0,314.0 393.0,319.0 394.0,320.0 394.0,321.0 395.0,322.0 395.0,324.0 397.0,327.0 397.0,329.0 398.0,330.0 398.0,332.0 399.0,333.0 399.0,335.0 400.0,336.0 401.0,341.0 403.0,344.0 403.0,347.0 404.0,348.0 404.0,350.0 405.0,351.0 405.0,353.0 406.0,354.0 406.0,357.0 407.0,358.0 407.0,361.0 408.0,362.0 408.0,364.0 409.0,365.0 409.0,368.0 410.0,369.0 410.0,372.0 411.0,373.0 411.0,377.0 412.0,378.0 412.0,381.0 413.0,381.0 413.0,379.0 414.0,378.0 414.0,374.0 415.0,373.0 415.0,366.0 416.0,365.0 416.0,354.0 417.0,353.0 417.0,332.0 416.0,331.0 416.0,316.0 415.0,315.0 415.0,308.0 414.0,307.0 414.0,302.0 413.0,301.0 413.0,297.0 412.0,296.0 412.0,294.0 411.0,293.0 410.0,288.0 409.0,287.0 406.0,280.0 401.0,274.0 401.0,273.0 396.0,268.0 395.0,268.0 393.0,266.0 392.0,266.0 387.0,263.0 Z"],"Lumbares":["M180.0,299.0 179.0,299.0 178.0,298.0 176.0,298.0 175.0,297.0 170.0,297.0 169.0,298.0 166.0,298.0 165.0,299.0 163.0,299.0 162.0,300.0 159.0,301.0 157.0,303.0 156.0,303.0 147.0,312.0 147.0,313.0 145.0,315.0 145.0,316.0 141.0,323.0 141.0,325.0 140.0,326.0 140.0,329.0 139.0,330.0 139.0,333.0 138.0,334.0 138.0,345.0 137.0,346.0 137.0,347.0 138.0,348.0 138.0,357.0 139.0,357.0 140.0,356.0 140.0,355.0 154.0,341.0 155.0,341.0 158.0,338.0 161.0,337.0 165.0,334.0 167.0,334.0 170.0,332.0 173.0,332.0 174.0,331.0 180.0,331.0 181.0,330.0 188.0,330.0 189.0,331.0 194.0,331.0 195.0,332.0 197.0,332.0 197.0,328.0 196.0,327.0 196.0,325.0 195.0,324.0 194.0,319.0 193.0,318.0 191.0,313.0 189.0,311.0 189.0,310.0 186.0,306.0 186.0,305.0 Z","M250.0,300.0 245.0,305.0 245.0,306.0 241.0,311.0 241.0,312.0 239.0,315.0 239.0,317.0 237.0,320.0 237.0,322.0 236.0,323.0 236.0,325.0 235.0,326.0 235.0,328.0 234.0,329.0 234.0,332.0 237.0,332.0 238.0,331.0 244.0,331.0 245.0,330.0 253.0,330.0 254.0,331.0 258.0,331.0 259.0,332.0 262.0,332.0 265.0,334.0 267.0,334.0 269.0,336.0 270.0,336.0 274.0,339.0 275.0,339.0 281.0,345.0 282.0,345.0 291.0,355.0 292.0,355.0 292.0,350.0 293.0,349.0 293.0,338.0 292.0,337.0 292.0,331.0 291.0,330.0 291.0,327.0 290.0,326.0 289.0,321.0 288.0,320.0 285.0,313.0 277.0,304.0 276.0,304.0 274.0,302.0 273.0,302.0 266.0,298.0 263.0,298.0 262.0,297.0 256.0,297.0 255.0,298.0 Z"],"Glúteo mayor":["M193.0,338.0 191.0,338.0 190.0,337.0 186.0,337.0 185.0,336.0 180.0,336.0 179.0,337.0 174.0,337.0 173.0,338.0 170.0,338.0 169.0,339.0 162.0,342.0 159.0,345.0 158.0,345.0 152.0,352.0 152.0,353.0 150.0,355.0 150.0,356.0 147.0,361.0 147.0,363.0 146.0,364.0 146.0,366.0 145.0,367.0 145.0,370.0 144.0,371.0 144.0,376.0 143.0,377.0 143.0,394.0 144.0,395.0 144.0,401.0 145.0,402.0 145.0,409.0 146.0,410.0 146.0,429.0 145.0,430.0 145.0,437.0 144.0,438.0 144.0,442.0 143.0,443.0 143.0,444.0 146.0,444.0 147.0,443.0 161.0,443.0 162.0,444.0 186.0,444.0 187.0,443.0 190.0,443.0 191.0,442.0 196.0,441.0 198.0,439.0 201.0,438.0 207.0,432.0 207.0,431.0 210.0,427.0 210.0,425.0 211.0,424.0 211.0,422.0 212.0,421.0 212.0,419.0 213.0,418.0 213.0,366.0 212.0,365.0 212.0,361.0 210.0,358.0 210.0,356.0 209.0,355.0 207.0,350.0 205.0,348.0 205.0,347.0 200.0,342.0 199.0,342.0 197.0,340.0 196.0,340.0 Z","M241.0,337.0 240.0,338.0 235.0,340.0 233.0,342.0 232.0,342.0 227.0,347.0 227.0,348.0 225.0,350.0 225.0,351.0 222.0,356.0 222.0,358.0 221.0,359.0 221.0,361.0 220.0,362.0 220.0,366.0 219.0,367.0 219.0,419.0 220.0,420.0 220.0,422.0 221.0,423.0 221.0,426.0 222.0,427.0 223.0,430.0 229.0,437.0 230.0,437.0 232.0,439.0 233.0,439.0 238.0,442.0 240.0,442.0 241.0,443.0 244.0,443.0 245.0,444.0 250.0,444.0 251.0,445.0 261.0,445.0 262.0,444.0 269.0,444.0 270.0,443.0 282.0,443.0 283.0,444.0 287.0,444.0 287.0,443.0 286.0,442.0 286.0,439.0 285.0,438.0 285.0,432.0 284.0,431.0 284.0,408.0 285.0,407.0 285.0,402.0 286.0,401.0 286.0,397.0 287.0,396.0 287.0,391.0 288.0,390.0 288.0,374.0 287.0,373.0 287.0,368.0 286.0,367.0 286.0,365.0 285.0,364.0 284.0,359.0 283.0,358.0 282.0,355.0 278.0,350.0 278.0,349.0 270.0,342.0 269.0,342.0 262.0,338.0 259.0,338.0 258.0,337.0 253.0,337.0 252.0,336.0 247.0,336.0 246.0,337.0 Z"],"Glúteo medio":["M294.0,365.0 294.0,377.0 293.0,378.0 293.0,398.0 294.0,399.0 295.0,404.0 296.0,405.0 299.0,412.0 301.0,414.0 302.0,417.0 304.0,419.0 305.0,422.0 307.0,424.0 308.0,427.0 310.0,429.0 312.0,434.0 313.0,434.0 313.0,426.0 312.0,425.0 312.0,417.0 311.0,416.0 311.0,410.0 310.0,409.0 310.0,406.0 309.0,405.0 309.0,401.0 308.0,400.0 308.0,397.0 307.0,396.0 307.0,393.0 306.0,392.0 306.0,390.0 305.0,389.0 305.0,387.0 304.0,386.0 304.0,384.0 303.0,383.0 303.0,381.0 302.0,380.0 301.0,375.0 298.0,371.0 298.0,370.0 295.0,366.0 295.0,365.0 Z","M136.0,366.0 135.0,366.0 134.0,369.0 132.0,371.0 132.0,372.0 129.0,376.0 129.0,378.0 128.0,379.0 128.0,381.0 126.0,384.0 126.0,386.0 125.0,387.0 125.0,389.0 124.0,390.0 124.0,393.0 123.0,394.0 123.0,396.0 122.0,397.0 122.0,399.0 121.0,400.0 121.0,404.0 120.0,405.0 120.0,409.0 119.0,410.0 119.0,414.0 118.0,415.0 118.0,421.0 117.0,422.0 117.0,433.0 118.0,433.0 121.0,426.0 123.0,424.0 124.0,421.0 126.0,419.0 127.0,416.0 129.0,414.0 130.0,411.0 132.0,409.0 132.0,408.0 135.0,403.0 136.0,398.0 137.0,397.0 137.0,369.0 136.0,368.0 Z"],"Bíceps femoral":["M134.0,439.0 131.0,440.0 126.0,445.0 126.0,446.0 122.0,450.0 121.0,453.0 119.0,455.0 119.0,456.0 116.0,461.0 115.0,466.0 113.0,469.0 113.0,472.0 112.0,473.0 112.0,476.0 111.0,477.0 111.0,484.0 110.0,485.0 110.0,508.0 111.0,509.0 111.0,515.0 112.0,516.0 112.0,521.0 113.0,522.0 113.0,525.0 114.0,526.0 114.0,530.0 115.0,531.0 115.0,533.0 116.0,534.0 116.0,536.0 117.0,537.0 117.0,540.0 118.0,541.0 118.0,543.0 120.0,546.0 120.0,548.0 121.0,549.0 121.0,551.0 123.0,554.0 123.0,556.0 125.0,559.0 125.0,561.0 127.0,564.0 128.0,569.0 129.0,569.0 130.0,568.0 130.0,548.0 129.0,547.0 129.0,544.0 128.0,543.0 128.0,541.0 129.0,540.0 129.0,534.0 128.0,533.0 128.0,525.0 127.0,524.0 127.0,516.0 126.0,515.0 126.0,501.0 125.0,500.0 125.0,492.0 126.0,491.0 126.0,476.0 127.0,475.0 127.0,470.0 128.0,469.0 128.0,464.0 129.0,463.0 129.0,459.0 130.0,458.0 130.0,454.0 131.0,453.0 131.0,451.0 132.0,450.0 132.0,446.0 133.0,445.0 133.0,443.0 134.0,442.0 Z","M297.0,440.0 297.0,444.0 298.0,445.0 298.0,448.0 299.0,449.0 299.0,452.0 300.0,453.0 300.0,458.0 301.0,459.0 301.0,463.0 302.0,464.0 302.0,467.0 303.0,468.0 303.0,475.0 304.0,476.0 304.0,510.0 303.0,511.0 303.0,520.0 302.0,521.0 302.0,527.0 301.0,528.0 301.0,537.0 300.0,538.0 300.0,567.0 302.0,567.0 302.0,566.0 304.0,563.0 305.0,558.0 307.0,555.0 307.0,553.0 309.0,550.0 309.0,548.0 310.0,547.0 310.0,545.0 311.0,544.0 311.0,542.0 312.0,541.0 312.0,539.0 313.0,538.0 313.0,536.0 314.0,535.0 314.0,533.0 315.0,532.0 315.0,529.0 316.0,528.0 316.0,525.0 317.0,524.0 317.0,520.0 318.0,519.0 318.0,514.0 319.0,513.0 319.0,504.0 320.0,503.0 320.0,487.0 319.0,486.0 319.0,479.0 318.0,478.0 318.0,474.0 317.0,473.0 317.0,470.0 316.0,469.0 316.0,467.0 315.0,466.0 314.0,461.0 313.0,460.0 311.0,455.0 309.0,453.0 309.0,452.0 307.0,450.0 307.0,449.0 304.0,446.0 304.0,445.0 299.0,440.0 Z"],"Isquiotibiales":["M225.0,441.0 224.0,441.0 224.0,444.0 223.0,445.0 223.0,453.0 222.0,454.0 222.0,458.0 223.0,459.0 223.0,462.0 224.0,462.0 224.0,459.0 225.0,458.0 225.0,454.0 226.0,453.0 226.0,449.0 227.0,448.0 227.0,443.0 Z","M205.0,442.0 204.0,443.0 204.0,447.0 205.0,448.0 205.0,453.0 206.0,454.0 206.0,458.0 207.0,459.0 207.0,465.0 208.0,465.0 208.0,445.0 207.0,444.0 207.0,442.0 Z","M199.0,446.0 196.0,446.0 195.0,447.0 193.0,447.0 192.0,448.0 189.0,448.0 188.0,449.0 185.0,449.0 184.0,450.0 182.0,450.0 181.0,451.0 181.0,453.0 180.0,454.0 180.0,462.0 179.0,463.0 179.0,473.0 178.0,474.0 178.0,488.0 177.0,489.0 177.0,510.0 178.0,511.0 178.0,525.0 179.0,526.0 179.0,537.0 180.0,538.0 180.0,545.0 181.0,546.0 181.0,553.0 182.0,554.0 182.0,559.0 183.0,560.0 183.0,565.0 184.0,566.0 185.0,566.0 185.0,563.0 186.0,562.0 186.0,560.0 187.0,559.0 187.0,556.0 188.0,555.0 188.0,552.0 189.0,551.0 189.0,549.0 190.0,548.0 190.0,545.0 191.0,544.0 191.0,542.0 193.0,539.0 194.0,534.0 195.0,533.0 195.0,532.0 196.0,531.0 196.0,529.0 197.0,528.0 197.0,525.0 198.0,524.0 198.0,522.0 199.0,521.0 199.0,518.0 200.0,517.0 200.0,515.0 201.0,514.0 201.0,510.0 202.0,509.0 202.0,505.0 203.0,504.0 203.0,498.0 204.0,497.0 204.0,470.0 203.0,469.0 203.0,463.0 202.0,462.0 202.0,457.0 201.0,456.0 201.0,452.0 200.0,451.0 200.0,448.0 199.0,447.0 Z","M232.0,446.0 232.0,448.0 231.0,449.0 231.0,451.0 230.0,452.0 230.0,456.0 229.0,457.0 229.0,461.0 228.0,462.0 228.0,469.0 227.0,470.0 227.0,500.0 228.0,501.0 228.0,507.0 229.0,508.0 229.0,511.0 230.0,512.0 230.0,516.0 231.0,517.0 231.0,520.0 232.0,521.0 232.0,524.0 233.0,525.0 233.0,527.0 234.0,528.0 234.0,530.0 235.0,531.0 235.0,533.0 236.0,534.0 236.0,536.0 237.0,537.0 237.0,539.0 238.0,540.0 239.0,545.0 241.0,548.0 241.0,551.0 242.0,552.0 242.0,555.0 243.0,556.0 243.0,559.0 244.0,560.0 244.0,563.0 245.0,564.0 245.0,568.0 246.0,568.0 246.0,563.0 247.0,562.0 247.0,557.0 248.0,556.0 248.0,551.0 249.0,550.0 249.0,542.0 250.0,541.0 250.0,535.0 251.0,534.0 251.0,524.0 252.0,523.0 252.0,510.0 253.0,509.0 253.0,483.0 252.0,482.0 252.0,465.0 251.0,464.0 251.0,455.0 250.0,454.0 250.0,451.0 249.0,450.0 247.0,450.0 246.0,449.0 242.0,449.0 241.0,448.0 239.0,448.0 238.0,447.0 236.0,447.0 235.0,446.0 Z","M174.0,450.0 170.0,450.0 169.0,449.0 155.0,449.0 154.0,450.0 151.0,450.0 150.0,451.0 145.0,453.0 140.0,457.0 140.0,458.0 136.0,463.0 136.0,465.0 134.0,468.0 134.0,471.0 133.0,472.0 133.0,475.0 132.0,476.0 132.0,484.0 131.0,485.0 131.0,508.0 132.0,509.0 132.0,518.0 133.0,519.0 133.0,528.0 134.0,529.0 134.0,534.0 135.0,535.0 135.0,542.0 136.0,543.0 136.0,547.0 137.0,548.0 137.0,552.0 138.0,553.0 138.0,557.0 139.0,558.0 139.0,563.0 140.0,564.0 140.0,568.0 141.0,568.0 141.0,567.0 143.0,565.0 145.0,560.0 147.0,558.0 148.0,555.0 150.0,553.0 151.0,550.0 153.0,548.0 153.0,547.0 155.0,545.0 157.0,540.0 159.0,538.0 159.0,537.0 166.0,524.0 166.0,522.0 168.0,519.0 168.0,517.0 169.0,516.0 169.0,514.0 170.0,513.0 170.0,509.0 171.0,508.0 171.0,503.0 172.0,502.0 172.0,488.0 173.0,487.0 173.0,470.0 174.0,469.0 174.0,458.0 175.0,457.0 175.0,451.0 Z","M257.0,450.0 256.0,451.0 256.0,462.0 257.0,463.0 257.0,475.0 258.0,476.0 258.0,500.0 259.0,501.0 259.0,507.0 260.0,508.0 260.0,511.0 261.0,512.0 261.0,515.0 262.0,516.0 263.0,521.0 265.0,524.0 265.0,526.0 266.0,527.0 271.0,538.0 273.0,540.0 274.0,543.0 276.0,545.0 277.0,548.0 279.0,550.0 280.0,553.0 282.0,555.0 282.0,556.0 283.0,557.0 285.0,562.0 287.0,564.0 288.0,567.0 289.0,567.0 289.0,566.0 290.0,565.0 290.0,560.0 291.0,559.0 291.0,555.0 292.0,554.0 292.0,550.0 293.0,549.0 293.0,543.0 294.0,542.0 294.0,537.0 295.0,536.0 295.0,531.0 296.0,530.0 296.0,525.0 297.0,524.0 297.0,517.0 298.0,516.0 298.0,504.0 299.0,503.0 299.0,482.0 298.0,481.0 298.0,475.0 297.0,474.0 297.0,470.0 296.0,469.0 296.0,467.0 295.0,466.0 292.0,459.0 286.0,453.0 285.0,453.0 283.0,451.0 281.0,451.0 280.0,450.0 277.0,450.0 276.0,449.0 263.0,449.0 262.0,450.0 Z"],"Gastrocnemio":["M258.0,520.0 257.0,520.0 257.0,526.0 256.0,527.0 256.0,537.0 255.0,538.0 255.0,547.0 254.0,548.0 254.0,555.0 253.0,556.0 253.0,565.0 252.0,566.0 252.0,576.0 253.0,576.0 256.0,573.0 257.0,570.0 259.0,568.0 259.0,567.0 263.0,560.0 263.0,558.0 266.0,553.0 266.0,551.0 268.0,548.0 268.0,542.0 261.0,529.0 261.0,527.0 259.0,524.0 259.0,522.0 258.0,521.0 Z","M172.0,521.0 171.0,522.0 171.0,524.0 167.0,531.0 167.0,533.0 162.0,542.0 162.0,548.0 163.0,549.0 164.0,554.0 166.0,557.0 166.0,559.0 167.0,560.0 169.0,565.0 171.0,567.0 171.0,568.0 172.0,569.0 173.0,572.0 175.0,574.0 175.0,575.0 177.0,577.0 178.0,577.0 178.0,568.0 177.0,567.0 177.0,559.0 176.0,558.0 176.0,549.0 175.0,548.0 175.0,540.0 174.0,539.0 174.0,532.0 173.0,531.0 173.0,521.0 Z","M157.0,550.0 154.0,554.0 153.0,557.0 151.0,559.0 151.0,560.0 144.0,573.0 143.0,578.0 141.0,581.0 141.0,583.0 140.0,584.0 140.0,586.0 139.0,587.0 139.0,590.0 138.0,591.0 138.0,594.0 139.0,594.0 141.0,592.0 142.0,592.0 145.0,589.0 147.0,589.0 148.0,588.0 154.0,588.0 164.0,598.0 164.0,599.0 166.0,601.0 167.0,601.0 167.0,600.0 168.0,599.0 168.0,594.0 169.0,593.0 169.0,587.0 170.0,586.0 170.0,582.0 169.0,581.0 169.0,577.0 168.0,576.0 167.0,571.0 164.0,566.0 164.0,564.0 161.0,559.0 161.0,557.0 158.0,552.0 158.0,550.0 Z","M273.0,550.0 272.0,550.0 272.0,552.0 269.0,557.0 269.0,559.0 266.0,564.0 266.0,566.0 262.0,573.0 262.0,575.0 261.0,576.0 261.0,579.0 260.0,580.0 260.0,592.0 261.0,593.0 261.0,597.0 262.0,598.0 262.0,600.0 263.0,601.0 264.0,601.0 264.0,600.0 268.0,596.0 268.0,595.0 273.0,590.0 274.0,590.0 276.0,588.0 282.0,588.0 283.0,589.0 286.0,590.0 291.0,595.0 292.0,595.0 292.0,594.0 291.0,593.0 291.0,590.0 290.0,589.0 290.0,587.0 289.0,586.0 289.0,583.0 288.0,582.0 288.0,580.0 286.0,577.0 285.0,572.0 284.0,571.0 284.0,570.0 283.0,569.0 283.0,568.0 282.0,567.0 276.0,554.0 273.0,551.0 Z","M148.0,597.0 142.0,599.0 139.0,602.0 139.0,603.0 138.0,604.0 137.0,604.0 132.0,609.0 132.0,610.0 128.0,615.0 127.0,618.0 124.0,621.0 124.0,622.0 123.0,623.0 123.0,625.0 117.0,636.0 116.0,641.0 114.0,644.0 114.0,646.0 113.0,647.0 113.0,649.0 112.0,650.0 112.0,653.0 111.0,654.0 111.0,657.0 110.0,658.0 110.0,661.0 109.0,662.0 109.0,668.0 108.0,669.0 108.0,689.0 109.0,690.0 109.0,695.0 110.0,696.0 110.0,699.0 111.0,700.0 114.0,707.0 119.0,713.0 119.0,714.0 123.0,717.0 125.0,717.0 126.0,718.0 131.0,718.0 132.0,717.0 135.0,716.0 137.0,714.0 137.0,713.0 142.0,709.0 142.0,708.0 144.0,706.0 144.0,705.0 145.0,704.0 145.0,702.0 146.0,701.0 146.0,697.0 145.0,696.0 145.0,651.0 146.0,650.0 146.0,640.0 147.0,639.0 147.0,630.0 148.0,629.0 148.0,623.0 149.0,622.0 149.0,613.0 150.0,612.0 150.0,599.0 Z","M282.0,597.0 281.0,598.0 280.0,598.0 280.0,599.0 279.0,600.0 279.0,608.0 280.0,609.0 280.0,616.0 281.0,617.0 281.0,625.0 282.0,626.0 282.0,633.0 283.0,634.0 283.0,645.0 284.0,646.0 284.0,666.0 285.0,667.0 285.0,676.0 284.0,677.0 284.0,697.0 283.0,698.0 283.0,702.0 284.0,703.0 285.0,706.0 287.0,708.0 287.0,709.0 294.0,716.0 295.0,716.0 298.0,718.0 304.0,718.0 305.0,717.0 308.0,716.0 314.0,709.0 314.0,708.0 319.0,699.0 319.0,697.0 320.0,696.0 320.0,692.0 321.0,691.0 321.0,666.0 320.0,665.0 320.0,660.0 319.0,659.0 319.0,656.0 318.0,655.0 318.0,652.0 317.0,651.0 317.0,648.0 316.0,647.0 316.0,645.0 314.0,642.0 313.0,637.0 312.0,636.0 312.0,635.0 311.0,634.0 311.0,632.0 310.0,631.0 305.0,620.0 303.0,618.0 302.0,615.0 299.0,612.0 299.0,611.0 296.0,608.0 296.0,607.0 288.0,599.0 287.0,599.0 284.0,597.0 Z","M157.0,600.0 157.0,602.0 156.0,603.0 156.0,606.0 155.0,607.0 155.0,613.0 154.0,614.0 154.0,619.0 153.0,620.0 153.0,627.0 152.0,628.0 152.0,637.0 151.0,638.0 151.0,650.0 150.0,651.0 150.0,697.0 151.0,698.0 151.0,702.0 154.0,706.0 154.0,707.0 164.0,717.0 165.0,717.0 168.0,719.0 170.0,719.0 171.0,720.0 175.0,720.0 176.0,719.0 179.0,718.0 182.0,715.0 182.0,714.0 184.0,712.0 187.0,705.0 189.0,703.0 189.0,700.0 190.0,699.0 190.0,696.0 191.0,695.0 191.0,670.0 190.0,669.0 190.0,665.0 189.0,664.0 189.0,660.0 188.0,659.0 188.0,656.0 187.0,655.0 187.0,653.0 186.0,652.0 186.0,650.0 185.0,649.0 185.0,647.0 184.0,646.0 183.0,641.0 181.0,638.0 181.0,636.0 179.0,634.0 179.0,633.0 178.0,632.0 172.0,619.0 170.0,617.0 170.0,616.0 167.0,612.0 166.0,609.0 164.0,607.0 164.0,606.0 158.0,600.0 Z","M272.0,601.0 270.0,601.0 268.0,603.0 268.0,604.0 265.0,607.0 265.0,608.0 259.0,616.0 257.0,621.0 255.0,623.0 255.0,624.0 250.0,633.0 250.0,635.0 247.0,639.0 247.0,641.0 245.0,644.0 245.0,646.0 244.0,647.0 244.0,649.0 243.0,650.0 243.0,652.0 242.0,653.0 242.0,656.0 241.0,657.0 241.0,660.0 240.0,661.0 240.0,664.0 239.0,665.0 239.0,669.0 238.0,670.0 238.0,695.0 239.0,696.0 239.0,700.0 240.0,701.0 240.0,703.0 242.0,705.0 245.0,712.0 248.0,715.0 248.0,716.0 252.0,719.0 254.0,719.0 255.0,720.0 258.0,720.0 259.0,719.0 261.0,719.0 262.0,718.0 265.0,717.0 274.0,708.0 274.0,707.0 276.0,705.0 276.0,704.0 278.0,701.0 278.0,696.0 279.0,695.0 279.0,647.0 278.0,646.0 278.0,634.0 277.0,633.0 277.0,624.0 276.0,623.0 276.0,617.0 275.0,616.0 275.0,610.0 274.0,609.0 274.0,605.0 273.0,604.0 273.0,602.0 Z"],"Sóleo":["M137.0,721.0 134.0,723.0 132.0,723.0 131.0,724.0 130.0,724.0 130.0,730.0 131.0,731.0 131.0,736.0 132.0,737.0 132.0,740.0 133.0,741.0 133.0,744.0 134.0,745.0 134.0,748.0 135.0,749.0 135.0,751.0 136.0,752.0 136.0,755.0 137.0,756.0 137.0,758.0 138.0,759.0 138.0,761.0 139.0,762.0 139.0,765.0 140.0,766.0 140.0,768.0 141.0,769.0 141.0,771.0 142.0,772.0 142.0,774.0 143.0,775.0 143.0,778.0 144.0,779.0 144.0,781.0 145.0,782.0 145.0,784.0 146.0,785.0 146.0,787.0 147.0,788.0 147.0,791.0 148.0,792.0 148.0,794.0 149.0,795.0 149.0,797.0 150.0,798.0 150.0,800.0 151.0,801.0 151.0,804.0 152.0,805.0 153.0,810.0 154.0,810.0 154.0,802.0 153.0,801.0 153.0,793.0 151.0,791.0 151.0,789.0 152.0,788.0 152.0,785.0 151.0,784.0 151.0,779.0 150.0,778.0 150.0,773.0 149.0,772.0 149.0,768.0 148.0,767.0 148.0,763.0 147.0,762.0 147.0,757.0 146.0,756.0 146.0,753.0 145.0,752.0 145.0,748.0 144.0,747.0 144.0,743.0 143.0,742.0 143.0,739.0 142.0,738.0 142.0,735.0 141.0,734.0 141.0,730.0 140.0,729.0 140.0,726.0 139.0,725.0 139.0,722.0 138.0,721.0 Z","M291.0,721.0 290.0,721.0 290.0,724.0 289.0,725.0 289.0,728.0 288.0,729.0 288.0,733.0 287.0,734.0 287.0,737.0 286.0,738.0 286.0,741.0 285.0,742.0 285.0,746.0 284.0,747.0 284.0,751.0 283.0,752.0 283.0,756.0 282.0,757.0 282.0,760.0 281.0,761.0 281.0,765.0 280.0,766.0 280.0,771.0 279.0,772.0 279.0,776.0 278.0,777.0 278.0,783.0 277.0,784.0 277.0,790.0 276.0,791.0 276.0,798.0 275.0,799.0 275.0,810.0 276.0,810.0 276.0,808.0 277.0,807.0 277.0,804.0 278.0,803.0 278.0,801.0 279.0,800.0 279.0,798.0 280.0,797.0 280.0,794.0 281.0,793.0 281.0,791.0 282.0,790.0 282.0,788.0 283.0,787.0 283.0,785.0 284.0,784.0 284.0,782.0 285.0,781.0 285.0,778.0 286.0,777.0 286.0,775.0 287.0,774.0 287.0,771.0 288.0,770.0 288.0,768.0 289.0,767.0 289.0,765.0 290.0,764.0 290.0,762.0 291.0,761.0 291.0,759.0 292.0,758.0 292.0,755.0 293.0,754.0 293.0,751.0 294.0,750.0 294.0,748.0 295.0,747.0 295.0,744.0 296.0,743.0 296.0,740.0 297.0,739.0 297.0,736.0 298.0,735.0 298.0,730.0 299.0,729.0 299.0,726.0 298.0,725.0 298.0,724.0 297.0,724.0 296.0,723.0 294.0,723.0 Z","M120.0,722.0 120.0,725.0 121.0,726.0 121.0,729.0 122.0,730.0 122.0,733.0 123.0,734.0 123.0,737.0 124.0,738.0 124.0,741.0 125.0,742.0 125.0,745.0 126.0,746.0 126.0,749.0 127.0,750.0 127.0,753.0 128.0,754.0 128.0,756.0 129.0,757.0 129.0,759.0 130.0,760.0 130.0,763.0 131.0,764.0 131.0,767.0 132.0,768.0 132.0,771.0 133.0,772.0 133.0,775.0 134.0,776.0 134.0,779.0 135.0,780.0 135.0,783.0 136.0,784.0 136.0,786.0 137.0,787.0 137.0,790.0 138.0,791.0 138.0,793.0 139.0,794.0 139.0,797.0 140.0,798.0 140.0,801.0 141.0,802.0 141.0,805.0 142.0,806.0 142.0,809.0 143.0,810.0 143.0,813.0 144.0,814.0 144.0,816.0 145.0,817.0 145.0,819.0 146.0,820.0 146.0,822.0 147.0,823.0 148.0,828.0 149.0,829.0 150.0,832.0 151.0,832.0 151.0,827.0 150.0,826.0 150.0,820.0 149.0,819.0 149.0,814.0 148.0,813.0 148.0,810.0 147.0,809.0 147.0,807.0 146.0,806.0 146.0,802.0 145.0,801.0 145.0,799.0 144.0,798.0 144.0,796.0 143.0,795.0 143.0,792.0 142.0,791.0 142.0,789.0 141.0,788.0 141.0,786.0 140.0,785.0 140.0,782.0 139.0,781.0 139.0,778.0 138.0,777.0 138.0,775.0 137.0,774.0 137.0,772.0 136.0,771.0 136.0,769.0 135.0,768.0 135.0,765.0 134.0,764.0 134.0,762.0 133.0,761.0 133.0,759.0 132.0,758.0 132.0,755.0 131.0,754.0 131.0,751.0 130.0,750.0 130.0,748.0 129.0,747.0 129.0,744.0 128.0,743.0 128.0,741.0 127.0,740.0 127.0,737.0 126.0,736.0 126.0,733.0 125.0,732.0 125.0,730.0 124.0,729.0 124.0,726.0 123.0,725.0 123.0,723.0 122.0,722.0 Z","M309.0,722.0 307.0,722.0 305.0,725.0 305.0,727.0 304.0,728.0 304.0,732.0 303.0,733.0 303.0,735.0 302.0,736.0 302.0,739.0 301.0,740.0 301.0,742.0 300.0,743.0 300.0,746.0 299.0,747.0 299.0,750.0 298.0,751.0 298.0,753.0 297.0,754.0 297.0,756.0 296.0,757.0 296.0,760.0 295.0,761.0 295.0,763.0 294.0,764.0 294.0,766.0 293.0,767.0 293.0,769.0 292.0,770.0 292.0,773.0 291.0,774.0 291.0,776.0 290.0,777.0 290.0,779.0 289.0,780.0 289.0,783.0 288.0,784.0 288.0,786.0 287.0,787.0 287.0,789.0 286.0,790.0 286.0,793.0 285.0,794.0 285.0,796.0 284.0,797.0 284.0,800.0 283.0,801.0 283.0,804.0 282.0,805.0 282.0,808.0 281.0,809.0 281.0,812.0 280.0,813.0 280.0,816.0 279.0,817.0 279.0,822.0 278.0,823.0 278.0,832.0 279.0,832.0 279.0,831.0 280.0,830.0 280.0,828.0 281.0,827.0 281.0,825.0 283.0,822.0 283.0,819.0 284.0,818.0 284.0,816.0 285.0,815.0 285.0,812.0 286.0,811.0 286.0,808.0 287.0,807.0 287.0,805.0 288.0,804.0 288.0,802.0 289.0,801.0 289.0,798.0 290.0,797.0 290.0,794.0 291.0,793.0 291.0,790.0 292.0,789.0 292.0,785.0 293.0,784.0 293.0,781.0 294.0,780.0 294.0,777.0 295.0,776.0 295.0,774.0 296.0,773.0 296.0,770.0 297.0,769.0 297.0,767.0 298.0,766.0 298.0,763.0 299.0,762.0 299.0,760.0 300.0,759.0 300.0,756.0 301.0,755.0 301.0,752.0 302.0,751.0 302.0,748.0 303.0,747.0 303.0,745.0 304.0,744.0 304.0,741.0 305.0,740.0 305.0,737.0 306.0,736.0 306.0,734.0 307.0,733.0 307.0,729.0 308.0,728.0 308.0,724.0 309.0,723.0 Z","M174.0,727.0 172.0,727.0 172.0,728.0 171.0,729.0 171.0,731.0 170.0,732.0 170.0,734.0 169.0,735.0 169.0,739.0 168.0,740.0 168.0,744.0 167.0,745.0 167.0,750.0 166.0,751.0 166.0,758.0 165.0,759.0 165.0,766.0 164.0,767.0 164.0,778.0 163.0,779.0 163.0,794.0 164.0,795.0 164.0,803.0 165.0,804.0 165.0,809.0 166.0,809.0 166.0,796.0 167.0,795.0 167.0,782.0 168.0,781.0 168.0,774.0 169.0,773.0 169.0,767.0 170.0,766.0 170.0,760.0 171.0,759.0 171.0,756.0 172.0,755.0 172.0,749.0 173.0,748.0 173.0,742.0 174.0,741.0 Z","M256.0,727.0 255.0,728.0 254.0,733.0 255.0,734.0 255.0,742.0 256.0,743.0 256.0,748.0 257.0,749.0 257.0,754.0 258.0,755.0 258.0,760.0 259.0,761.0 259.0,766.0 260.0,767.0 260.0,775.0 261.0,776.0 261.0,783.0 262.0,784.0 262.0,795.0 263.0,796.0 263.0,806.0 264.0,806.0 264.0,804.0 265.0,803.0 265.0,770.0 264.0,769.0 264.0,762.0 263.0,761.0 263.0,753.0 262.0,752.0 262.0,747.0 261.0,746.0 261.0,741.0 260.0,740.0 260.0,736.0 259.0,735.0 259.0,731.0 258.0,730.0 257.0,727.0 Z"]}}},"female":{"front":{"w":229.0,"h":473.0,"regions":{"Trapecio":["M132.0,6.0 126.0,13.0 125.0,21.0 123.0,25.0 122.0,32.0 119.0,40.0 126.0,34.0 130.0,37.0 134.0,37.0 131.0,29.0 131.0,7.0 Z","M100.0,7.0 100.0,25.0 99.0,26.0 99.0,30.0 95.0,37.0 99.0,37.0 105.0,34.0 106.0,36.0 111.0,40.0 110.0,34.0 107.0,26.0 107.0,23.0 106.0,22.0 106.0,19.0 105.0,18.0 105.0,14.0 104.0,11.0 Z","M120.0,17.0 116.0,19.0 111.0,17.0 111.0,21.0 115.0,33.0 119.0,24.0 Z","M94.0,24.0 91.0,25.0 88.0,28.0 70.0,37.0 75.0,37.0 76.0,38.0 84.0,37.0 91.0,31.0 91.0,29.0 93.0,27.0 Z","M136.0,24.0 139.0,31.0 144.0,36.0 149.0,38.0 156.0,38.0 159.0,37.0 148.0,30.0 Z"],"Deltoides lateral":["M172.0,39.0 172.0,40.0 176.0,42.0 180.0,46.0 186.0,56.0 188.0,62.0 188.0,67.0 189.0,68.0 189.0,75.0 192.0,80.0 195.0,72.0 195.0,57.0 194.0,56.0 194.0,53.0 191.0,47.0 185.0,41.0 180.0,39.0 Z","M59.0,40.0 50.0,40.0 44.0,43.0 37.0,51.0 35.0,56.0 35.0,60.0 34.0,61.0 34.0,70.0 35.0,71.0 35.0,75.0 37.0,80.0 41.0,74.0 42.0,62.0 47.0,51.0 54.0,43.0 Z"],"Pectoral mayor":["M85.0,42.0 80.0,44.0 74.0,51.0 65.0,67.0 64.0,75.0 66.0,81.0 74.0,90.0 83.0,93.0 93.0,93.0 94.0,92.0 97.0,92.0 99.0,90.0 106.0,87.0 110.0,83.0 112.0,79.0 112.0,52.0 108.0,47.0 98.0,43.0 93.0,43.0 92.0,42.0 Z","M123.0,47.0 119.0,52.0 119.0,58.0 118.0,59.0 119.0,60.0 119.0,64.0 118.0,65.0 118.0,75.0 119.0,76.0 120.0,82.0 122.0,85.0 129.0,90.0 135.0,92.0 139.0,92.0 140.0,93.0 148.0,93.0 154.0,91.0 160.0,87.0 165.0,79.0 166.0,72.0 165.0,71.0 164.0,64.0 154.0,47.0 149.0,43.0 146.0,43.0 145.0,42.0 134.0,43.0 Z"],"Deltoides anterior":["M70.0,43.0 64.0,43.0 61.0,44.0 52.0,52.0 49.0,57.0 47.0,63.0 46.0,73.0 51.0,71.0 54.0,67.0 60.0,62.0 67.0,51.0 69.0,46.0 71.0,44.0 Z","M160.0,43.0 165.0,54.0 171.0,63.0 178.0,70.0 184.0,73.0 184.0,67.0 183.0,66.0 182.0,59.0 177.0,50.0 173.0,46.0 168.0,43.0 Z"],"Bíceps braquial":["M54.0,76.0 50.0,76.0 46.0,78.0 41.0,83.0 37.0,91.0 36.0,101.0 35.0,102.0 35.0,115.0 37.0,120.0 43.0,118.0 49.0,112.0 55.0,101.0 56.0,95.0 57.0,94.0 58.0,84.0 57.0,83.0 57.0,79.0 Z","M175.0,76.0 173.0,79.0 173.0,83.0 172.0,84.0 172.0,90.0 173.0,91.0 173.0,96.0 175.0,102.0 183.0,115.0 188.0,119.0 193.0,120.0 194.0,113.0 195.0,112.0 195.0,101.0 194.0,100.0 194.0,95.0 193.0,94.0 192.0,88.0 189.0,83.0 184.0,78.0 180.0,76.0 Z","M33.0,84.0 29.0,91.0 27.0,97.0 26.0,110.0 30.0,104.0 32.0,98.0 Z","M197.0,84.0 198.0,98.0 202.0,107.0 204.0,109.0 202.0,93.0 Z"],"Abdomen":["M66.0,90.0 67.0,91.0 67.0,96.0 68.0,97.0 68.0,100.0 70.0,106.0 77.0,120.0 84.0,130.0 87.0,137.0 90.0,140.0 91.0,138.0 90.0,130.0 89.0,128.0 82.0,122.0 83.0,120.0 85.0,120.0 86.0,121.0 85.0,122.0 86.0,121.0 88.0,122.0 87.0,123.0 90.0,122.0 91.0,120.0 90.0,119.0 90.0,115.0 84.0,110.0 87.0,108.0 89.0,109.0 90.0,108.0 90.0,104.0 86.0,100.0 87.0,99.0 83.0,99.0 82.0,98.0 76.0,97.0 Z","M164.0,90.0 154.0,97.0 148.0,99.0 143.0,99.0 144.0,100.0 140.0,103.0 139.0,106.0 140.0,108.0 144.0,107.0 147.0,105.0 149.0,107.0 146.0,110.0 144.0,109.0 145.0,110.0 141.0,113.0 140.0,116.0 140.0,122.0 144.0,121.0 147.0,123.0 142.0,127.0 140.0,131.0 140.0,140.0 142.0,138.0 143.0,139.0 142.0,138.0 145.0,131.0 147.0,129.0 148.0,130.0 146.0,134.0 146.0,138.0 140.0,149.0 140.0,163.0 147.0,157.0 151.0,155.0 147.0,146.0 147.0,135.0 148.0,134.0 148.0,130.0 147.0,128.0 148.0,125.0 151.0,122.0 154.0,116.0 156.0,115.0 159.0,109.0 159.0,107.0 162.0,101.0 Z","M112.0,92.0 109.0,91.0 102.0,96.0 96.0,98.0 96.0,105.0 109.0,105.0 112.0,104.0 113.0,102.0 Z","M118.0,92.0 117.0,94.0 118.0,104.0 121.0,104.0 122.0,105.0 126.0,105.0 127.0,104.0 133.0,105.0 135.0,101.0 135.0,99.0 133.0,97.0 130.0,97.0 121.0,91.0 Z","M96.0,111.0 96.0,118.0 98.0,121.0 112.0,121.0 113.0,119.0 113.0,112.0 112.0,109.0 100.0,109.0 Z","M118.0,109.0 117.0,112.0 117.0,118.0 118.0,121.0 133.0,121.0 134.0,118.0 134.0,111.0 130.0,109.0 Z","M43.0,123.0 38.0,126.0 37.0,130.0 42.0,126.0 Z","M187.0,124.0 191.0,129.0 193.0,129.0 191.0,125.0 Z","M96.0,129.0 96.0,134.0 98.0,139.0 112.0,139.0 113.0,136.0 112.0,126.0 98.0,126.0 Z","M118.0,126.0 117.0,129.0 117.0,136.0 119.0,139.0 132.0,139.0 133.0,138.0 133.0,135.0 134.0,134.0 134.0,128.0 133.0,126.0 Z","M81.0,130.0 83.0,135.0 83.0,147.0 79.0,155.0 90.0,163.0 90.0,150.0 85.0,140.0 84.0,135.0 Z","M99.0,144.0 97.0,146.0 97.0,156.0 98.0,157.0 98.0,163.0 100.0,168.0 100.0,172.0 101.0,173.0 102.0,180.0 105.0,186.0 106.0,191.0 108.0,195.0 110.0,197.0 112.0,197.0 112.0,188.0 113.0,187.0 113.0,149.0 111.0,144.0 Z","M131.0,144.0 119.0,144.0 117.0,149.0 117.0,191.0 118.0,192.0 118.0,197.0 122.0,194.0 125.0,188.0 129.0,176.0 129.0,173.0 130.0,172.0 130.0,168.0 131.0,167.0 132.0,158.0 133.0,157.0 133.0,145.0 Z"],"Braquiorradial":["M30.0,114.0 23.0,121.0 18.0,128.0 13.0,140.0 13.0,156.0 14.0,157.0 13.0,189.0 14.0,183.0 20.0,165.0 22.0,162.0 23.0,157.0 25.0,154.0 26.0,149.0 30.0,140.0 30.0,136.0 31.0,135.0 Z","M200.0,114.0 199.0,136.0 200.0,137.0 202.0,148.0 204.0,151.0 204.0,153.0 211.0,169.0 211.0,173.0 217.0,191.0 216.0,189.0 216.0,182.0 215.0,181.0 215.0,160.0 216.0,159.0 215.0,156.0 216.0,155.0 216.0,150.0 217.0,149.0 216.0,137.0 213.0,132.0 213.0,130.0 207.0,121.0 Z"],"Flexores del antebrazo":["M41.0,133.0 35.0,138.0 33.0,146.0 31.0,149.0 30.0,154.0 28.0,157.0 28.0,159.0 26.0,162.0 22.0,174.0 22.0,173.0 33.0,162.0 39.0,151.0 40.0,144.0 41.0,143.0 Z","M189.0,133.0 189.0,141.0 188.0,142.0 189.0,143.0 190.0,151.0 197.0,163.0 207.0,174.0 204.0,167.0 203.0,161.0 198.0,150.0 196.0,141.0 194.0,137.0 Z","M9.0,154.0 8.0,156.0 8.0,160.0 7.0,161.0 7.0,169.0 6.0,170.0 7.0,185.0 8.0,186.0 8.0,190.0 9.0,192.0 9.0,174.0 10.0,173.0 Z","M220.0,154.0 220.0,175.0 219.0,176.0 220.0,177.0 220.0,187.0 221.0,188.0 221.0,191.0 221.0,185.0 223.0,179.0 223.0,166.0 222.0,165.0 222.0,160.0 Z"],"Tensor de la fascia lata":["M75.0,161.0 67.0,172.0 63.0,180.0 59.0,192.0 59.0,196.0 58.0,197.0 58.0,202.0 57.0,204.0 77.0,174.0 Z","M155.0,161.0 154.0,169.0 153.0,170.0 153.0,175.0 164.0,190.0 172.0,203.0 171.0,194.0 170.0,193.0 170.0,190.0 167.0,181.0 161.0,169.0 Z"],"Sartorio":["M82.0,169.0 82.0,173.0 83.0,174.0 83.0,178.0 84.0,179.0 85.0,186.0 90.0,199.0 90.0,202.0 97.0,223.0 101.0,213.0 101.0,208.0 Z","M148.0,169.0 129.0,208.0 129.0,213.0 133.0,223.0 136.0,214.0 136.0,211.0 140.0,201.0 140.0,198.0 144.0,188.0 144.0,185.0 146.0,181.0 Z"],"Recto femoral":["M79.0,180.0 65.0,200.0 60.0,213.0 60.0,228.0 61.0,229.0 61.0,233.0 64.0,242.0 66.0,245.0 66.0,247.0 76.0,265.0 88.0,241.0 91.0,232.0 91.0,219.0 90.0,218.0 89.0,211.0 83.0,195.0 83.0,192.0 Z","M151.0,180.0 140.0,213.0 139.0,221.0 138.0,222.0 138.0,230.0 139.0,231.0 139.0,234.0 142.0,243.0 153.0,265.0 158.0,257.0 166.0,240.0 168.0,234.0 168.0,231.0 169.0,230.0 170.0,218.0 169.0,217.0 169.0,212.0 167.0,206.0 162.0,196.0 Z"],"Aductores":["M108.0,204.0 106.0,210.0 106.0,213.0 100.0,228.0 106.0,247.0 107.0,236.0 108.0,235.0 108.0,229.0 109.0,228.0 109.0,223.0 110.0,222.0 110.0,217.0 112.0,212.0 112.0,209.0 Z","M122.0,204.0 118.0,209.0 118.0,213.0 120.0,219.0 120.0,225.0 121.0,226.0 121.0,232.0 122.0,233.0 122.0,239.0 123.0,240.0 123.0,246.0 124.0,247.0 125.0,241.0 127.0,238.0 127.0,235.0 130.0,228.0 123.0,211.0 123.0,208.0 122.0,207.0 Z"],"Vasto lateral":["M54.0,215.0 48.0,233.0 48.0,252.0 49.0,253.0 49.0,257.0 52.0,265.0 52.0,268.0 55.0,274.0 57.0,282.0 64.0,296.0 64.0,298.0 72.0,313.0 75.0,308.0 75.0,303.0 76.0,302.0 75.0,279.0 74.0,278.0 74.0,274.0 72.0,268.0 68.0,262.0 57.0,238.0 57.0,235.0 55.0,230.0 55.0,224.0 54.0,223.0 Z","M175.0,215.0 174.0,230.0 173.0,231.0 173.0,235.0 170.0,244.0 156.0,270.0 155.0,276.0 154.0,277.0 154.0,285.0 153.0,286.0 153.0,306.0 154.0,307.0 154.0,310.0 156.0,313.0 158.0,311.0 161.0,305.0 161.0,303.0 163.0,301.0 164.0,297.0 170.0,286.0 170.0,284.0 174.0,276.0 179.0,261.0 179.0,257.0 181.0,252.0 181.0,232.0 180.0,231.0 178.0,221.0 Z"],"Vasto medial":["M134.0,231.0 133.0,236.0 130.0,242.0 130.0,245.0 128.0,250.0 128.0,254.0 127.0,255.0 127.0,259.0 126.0,260.0 126.0,280.0 127.0,281.0 127.0,286.0 129.0,291.0 129.0,295.0 133.0,307.0 137.0,315.0 139.0,315.0 142.0,312.0 147.0,299.0 148.0,289.0 149.0,288.0 149.0,270.0 148.0,269.0 148.0,266.0 145.0,261.0 145.0,259.0 137.0,243.0 134.0,234.0 Z","M96.0,232.0 93.0,241.0 91.0,244.0 91.0,246.0 80.0,269.0 80.0,276.0 79.0,277.0 81.0,298.0 82.0,299.0 82.0,302.0 85.0,311.0 88.0,315.0 90.0,315.0 92.0,313.0 96.0,305.0 100.0,293.0 101.0,285.0 102.0,284.0 102.0,279.0 103.0,278.0 103.0,258.0 102.0,257.0 101.0,247.0 Z"],"Peroneo largo":["M66.0,335.0 58.0,349.0 58.0,351.0 54.0,360.0 54.0,363.0 53.0,364.0 53.0,381.0 59.0,398.0 59.0,401.0 61.0,405.0 61.0,409.0 63.0,414.0 63.0,418.0 65.0,423.0 65.0,428.0 67.0,434.0 67.0,440.0 69.0,446.0 69.0,451.0 70.0,452.0 70.0,457.0 71.0,458.0 72.0,467.0 72.0,455.0 71.0,454.0 70.0,439.0 69.0,438.0 67.0,422.0 66.0,421.0 66.0,417.0 65.0,416.0 65.0,412.0 63.0,406.0 63.0,401.0 61.0,395.0 61.0,390.0 60.0,389.0 60.0,363.0 61.0,362.0 61.0,357.0 62.0,356.0 63.0,349.0 67.0,339.0 67.0,335.0 Z","M161.0,335.0 160.0,336.0 160.0,339.0 162.0,343.0 162.0,346.0 165.0,355.0 165.0,362.0 166.0,363.0 166.0,383.0 165.0,384.0 164.0,395.0 162.0,400.0 162.0,404.0 161.0,405.0 161.0,408.0 160.0,409.0 160.0,412.0 157.0,421.0 157.0,425.0 156.0,426.0 154.0,439.0 153.0,440.0 153.0,444.0 152.0,445.0 150.0,467.0 152.0,454.0 153.0,453.0 153.0,449.0 155.0,444.0 155.0,439.0 157.0,434.0 157.0,430.0 158.0,429.0 161.0,414.0 168.0,393.0 170.0,390.0 172.0,380.0 173.0,379.0 173.0,366.0 172.0,365.0 172.0,360.0 167.0,345.0 Z","M69.0,344.0 67.0,350.0 67.0,353.0 66.0,354.0 66.0,358.0 65.0,359.0 64.0,383.0 65.0,384.0 65.0,391.0 66.0,392.0 67.0,401.0 68.0,402.0 68.0,405.0 71.0,414.0 72.0,400.0 73.0,399.0 73.0,388.0 74.0,387.0 74.0,365.0 73.0,364.0 73.0,357.0 72.0,356.0 71.0,347.0 70.0,344.0 Z","M157.0,344.0 155.0,350.0 155.0,353.0 154.0,354.0 154.0,358.0 153.0,359.0 152.0,374.0 151.0,375.0 151.0,396.0 152.0,397.0 152.0,412.0 153.0,414.0 158.0,399.0 159.0,392.0 160.0,391.0 161.0,377.0 162.0,376.0 161.0,360.0 160.0,359.0 160.0,354.0 159.0,353.0 159.0,349.0 Z"],"Tibial anterior":["M90.0,341.0 84.0,351.0 82.0,357.0 82.0,360.0 81.0,361.0 81.0,374.0 89.0,392.0 90.0,392.0 92.0,389.0 97.0,376.0 97.0,366.0 96.0,365.0 96.0,361.0 91.0,347.0 Z","M137.0,341.0 129.0,366.0 129.0,379.0 130.0,380.0 130.0,383.0 135.0,392.0 138.0,388.0 144.0,376.0 144.0,373.0 145.0,372.0 145.0,361.0 144.0,360.0 144.0,356.0 142.0,350.0 Z"],"Gastrocnemio":["M80.0,383.0 80.0,422.0 79.0,423.0 79.0,436.0 80.0,437.0 80.0,448.0 81.0,449.0 81.0,455.0 82.0,458.0 82.0,437.0 83.0,436.0 84.0,424.0 85.0,423.0 87.0,410.0 88.0,409.0 88.0,402.0 85.0,393.0 Z","M145.0,383.0 136.0,402.0 136.0,412.0 137.0,413.0 137.0,418.0 138.0,419.0 138.0,424.0 139.0,425.0 139.0,430.0 140.0,431.0 140.0,445.0 141.0,446.0 140.0,449.0 140.0,459.0 141.0,452.0 142.0,451.0 142.0,446.0 143.0,445.0 143.0,431.0 144.0,430.0 144.0,389.0 145.0,388.0 Z"]}},"back":{"w":234.0,"h":494.0,"regions":{"Trapecio":["M121.0,6.0 115.0,6.0 112.0,7.0 111.0,17.0 108.0,23.0 102.0,29.0 103.0,31.0 108.0,33.0 117.0,43.0 120.0,38.0 124.0,34.0 132.0,30.0 124.0,20.0 122.0,14.0 122.0,11.0 121.0,10.0 Z","M108.0,7.0 104.0,8.0 104.0,19.0 108.0,12.0 Z","M126.0,7.0 127.0,14.0 130.0,19.0 131.0,17.0 131.0,8.0 Z"],"Romboides":["M95.0,34.0 91.0,37.0 73.0,46.0 75.0,48.0 81.0,50.0 84.0,50.0 89.0,53.0 91.0,58.0 93.0,69.0 98.0,84.0 100.0,87.0 101.0,92.0 113.0,113.0 113.0,110.0 114.0,109.0 114.0,55.0 113.0,54.0 113.0,48.0 111.0,43.0 104.0,36.0 100.0,34.0 Z","M137.0,34.0 128.0,37.0 123.0,42.0 120.0,48.0 120.0,112.0 121.0,112.0 124.0,108.0 132.0,92.0 135.0,82.0 137.0,79.0 137.0,76.0 139.0,73.0 141.0,61.0 143.0,59.0 144.0,54.0 147.0,51.0 157.0,48.0 160.0,46.0 154.0,42.0 Z"],"Deltoides posterior":["M77.0,55.0 64.0,48.0 59.0,48.0 58.0,47.0 56.0,48.0 52.0,48.0 46.0,51.0 40.0,58.0 37.0,65.0 37.0,69.0 36.0,70.0 37.0,83.0 43.0,77.0 47.0,75.0 58.0,73.0 63.0,70.0 Z","M157.0,55.0 165.0,65.0 172.0,71.0 179.0,74.0 187.0,75.0 192.0,78.0 197.0,83.0 197.0,80.0 198.0,79.0 198.0,71.0 197.0,70.0 196.0,62.0 194.0,58.0 187.0,51.0 180.0,48.0 171.0,48.0 Z"],"Infraespinoso":["M79.0,61.0 69.0,70.0 69.0,71.0 84.0,85.0 91.0,89.0 94.0,89.0 87.0,67.0 82.0,61.0 Z","M156.0,62.0 151.0,61.0 146.0,66.0 142.0,78.0 140.0,89.0 142.0,89.0 149.0,85.0 164.0,71.0 164.0,70.0 Z"],"Redondo mayor":["M172.0,77.0 167.0,74.0 160.0,81.0 159.0,80.0 160.0,81.0 149.0,91.0 158.0,91.0 159.0,90.0 165.0,89.0 170.0,84.0 171.0,78.0 Z","M62.0,76.0 62.0,82.0 66.0,87.0 75.0,91.0 84.0,91.0 84.0,90.0 77.0,85.0 67.0,75.0 Z"],"Tríceps (cabeza lateral)":["M55.0,80.0 48.0,80.0 41.0,86.0 37.0,97.0 37.0,105.0 36.0,106.0 36.0,114.0 37.0,115.0 45.0,112.0 50.0,107.0 54.0,99.0 55.0,92.0 56.0,91.0 Z","M179.0,80.0 178.0,82.0 178.0,86.0 177.0,87.0 178.0,88.0 179.0,97.0 183.0,106.0 190.0,113.0 197.0,115.0 198.0,114.0 197.0,98.0 193.0,86.0 189.0,82.0 185.0,80.0 Z","M201.0,91.0 201.0,101.0 202.0,102.0 202.0,106.0 209.0,119.0 209.0,109.0 205.0,97.0 Z","M33.0,92.0 29.0,97.0 26.0,105.0 26.0,108.0 25.0,109.0 25.0,118.0 32.0,106.0 Z"],"Dorsal ancho":["M63.0,91.0 65.0,102.0 72.0,118.0 82.0,132.0 97.0,148.0 101.0,139.0 101.0,137.0 105.0,130.0 107.0,123.0 110.0,118.0 99.0,101.0 97.0,96.0 93.0,96.0 92.0,95.0 90.0,96.0 74.0,96.0 73.0,95.0 70.0,95.0 Z","M170.0,91.0 168.0,93.0 160.0,96.0 145.0,96.0 144.0,95.0 137.0,96.0 136.0,99.0 124.0,118.0 129.0,128.0 129.0,130.0 132.0,135.0 132.0,137.0 137.0,148.0 153.0,130.0 161.0,119.0 168.0,103.0 168.0,100.0 170.0,95.0 Z","M151.0,139.0 145.0,147.0 144.0,150.0 150.0,156.0 149.0,154.0 149.0,145.0 Z","M83.0,140.0 85.0,146.0 85.0,154.0 84.0,156.0 89.0,151.0 89.0,148.0 Z"],"Tríceps (cabeza larga)":["M48.0,116.0 42.0,119.0 39.0,119.0 33.0,121.0 29.0,127.0 28.0,135.0 34.0,134.0 39.0,131.0 45.0,124.0 45.0,122.0 Z","M186.0,116.0 189.0,124.0 196.0,132.0 203.0,135.0 206.0,135.0 205.0,127.0 200.0,121.0 189.0,118.0 Z"],"Extensores del antebrazo":["M19.0,134.0 15.0,140.0 9.0,153.0 8.0,161.0 7.0,162.0 6.0,175.0 9.0,160.0 13.0,151.0 13.0,149.0 16.0,144.0 Z","M216.0,135.0 218.0,142.0 225.0,158.0 228.0,175.0 228.0,168.0 227.0,167.0 226.0,155.0 224.0,149.0 Z","M39.0,138.0 34.0,142.0 31.0,158.0 27.0,167.0 27.0,169.0 25.0,172.0 25.0,174.0 20.0,184.0 32.0,171.0 38.0,160.0 39.0,151.0 40.0,150.0 40.0,140.0 Z","M195.0,138.0 194.0,146.0 195.0,147.0 195.0,155.0 196.0,156.0 197.0,162.0 203.0,172.0 214.0,184.0 204.0,161.0 204.0,158.0 201.0,149.0 201.0,144.0 200.0,142.0 Z","M29.0,141.0 24.0,143.0 20.0,147.0 14.0,159.0 13.0,167.0 12.0,168.0 12.0,173.0 11.0,174.0 11.0,181.0 10.0,182.0 10.0,202.0 10.0,199.0 14.0,187.0 16.0,184.0 17.0,179.0 22.0,169.0 22.0,167.0 24.0,164.0 27.0,155.0 27.0,152.0 29.0,147.0 Z","M206.0,141.0 205.0,144.0 206.0,145.0 206.0,150.0 207.0,151.0 208.0,158.0 214.0,171.0 214.0,173.0 217.0,178.0 223.0,196.0 224.0,202.0 224.0,181.0 223.0,180.0 223.0,172.0 222.0,171.0 221.0,161.0 216.0,149.0 212.0,144.0 Z"],"Lumbares":["M96.0,155.0 93.0,155.0 90.0,157.0 75.0,173.0 67.0,187.0 67.0,189.0 65.0,192.0 62.0,201.0 67.0,193.0 78.0,182.0 86.0,178.0 93.0,177.0 94.0,176.0 106.0,178.0 106.0,175.0 104.0,169.0 Z","M138.0,155.0 130.0,169.0 130.0,171.0 128.0,174.0 128.0,178.0 139.0,176.0 140.0,177.0 145.0,177.0 154.0,181.0 166.0,192.0 172.0,202.0 168.0,189.0 159.0,173.0 144.0,157.0 Z"],"Glúteo mayor":["M106.0,186.0 100.0,183.0 89.0,183.0 86.0,185.0 82.0,186.0 75.0,193.0 72.0,198.0 70.0,204.0 70.0,207.0 69.0,208.0 69.0,232.0 66.0,241.0 70.0,239.0 81.0,239.0 82.0,240.0 87.0,240.0 88.0,241.0 98.0,241.0 105.0,238.0 111.0,232.0 114.0,224.0 114.0,215.0 115.0,214.0 114.0,211.0 114.0,200.0 110.0,190.0 Z","M128.0,186.0 124.0,190.0 121.0,196.0 120.0,204.0 119.0,205.0 120.0,225.0 125.0,235.0 129.0,238.0 136.0,241.0 148.0,241.0 154.0,239.0 163.0,239.0 167.0,241.0 166.0,239.0 166.0,235.0 165.0,234.0 165.0,227.0 164.0,226.0 164.0,223.0 165.0,222.0 165.0,211.0 164.0,210.0 163.0,201.0 159.0,193.0 153.0,187.0 144.0,183.0 134.0,183.0 Z"],"Glúteo medio":["M62.0,212.0 55.0,225.0 53.0,231.0 53.0,235.0 52.0,236.0 52.0,252.0 53.0,253.0 53.0,256.0 59.0,244.0 59.0,242.0 63.0,233.0 63.0,216.0 62.0,215.0 Z","M171.0,212.0 170.0,229.0 171.0,230.0 171.0,233.0 173.0,239.0 180.0,254.0 180.0,256.0 181.0,254.0 181.0,248.0 182.0,247.0 181.0,232.0 180.0,231.0 179.0,225.0 176.0,220.0 176.0,218.0 172.0,212.0 Z"],"Isquiotibiales":["M88.0,246.0 83.0,246.0 82.0,245.0 72.0,246.0 67.0,250.0 65.0,255.0 65.0,279.0 66.0,280.0 68.0,303.0 69.0,304.0 69.0,310.0 70.0,311.0 70.0,318.0 77.0,305.0 79.0,303.0 81.0,298.0 83.0,296.0 83.0,294.0 86.0,289.0 88.0,283.0 88.0,279.0 89.0,278.0 89.0,266.0 90.0,265.0 90.0,247.0 Z","M106.0,245.0 96.0,247.0 95.0,250.0 95.0,259.0 94.0,260.0 94.0,290.0 95.0,291.0 96.0,315.0 101.0,300.0 101.0,297.0 105.0,287.0 105.0,284.0 107.0,279.0 107.0,275.0 108.0,274.0 109.0,260.0 108.0,259.0 108.0,252.0 107.0,251.0 Z","M128.0,245.0 125.0,254.0 125.0,273.0 126.0,274.0 126.0,278.0 127.0,279.0 129.0,290.0 131.0,294.0 131.0,297.0 134.0,304.0 136.0,315.0 137.0,313.0 138.0,292.0 139.0,291.0 139.0,254.0 138.0,253.0 138.0,248.0 137.0,247.0 Z","M146.0,246.0 143.0,247.0 144.0,277.0 145.0,278.0 145.0,283.0 148.0,292.0 162.0,318.0 163.0,308.0 164.0,307.0 164.0,301.0 165.0,300.0 165.0,294.0 166.0,293.0 166.0,288.0 167.0,287.0 167.0,281.0 168.0,280.0 168.0,273.0 169.0,272.0 169.0,258.0 168.0,257.0 168.0,253.0 167.0,251.0 161.0,246.0 158.0,246.0 157.0,245.0 Z","M90.0,292.0 84.0,305.0 92.0,324.0 Z","M143.0,292.0 142.0,309.0 141.0,310.0 141.0,323.0 149.0,305.0 Z"],"Bíceps femoral":["M59.0,257.0 55.0,266.0 55.0,270.0 54.0,271.0 54.0,285.0 55.0,286.0 55.0,290.0 56.0,291.0 58.0,302.0 63.0,317.0 62.0,294.0 61.0,293.0 61.0,283.0 60.0,282.0 60.0,269.0 59.0,268.0 Z","M175.0,257.0 174.0,272.0 173.0,273.0 173.0,279.0 172.0,280.0 172.0,286.0 171.0,287.0 171.0,294.0 170.0,295.0 170.0,316.0 176.0,299.0 176.0,296.0 179.0,287.0 179.0,279.0 180.0,278.0 179.0,267.0 Z"],"Gastrocnemio":["M81.0,310.0 74.0,322.0 70.0,335.0 77.0,331.0 79.0,331.0 84.0,335.0 87.0,339.0 88.0,327.0 85.0,321.0 85.0,319.0 81.0,312.0 Z","M152.0,310.0 149.0,316.0 149.0,318.0 147.0,320.0 147.0,322.0 145.0,325.0 145.0,330.0 144.0,331.0 145.0,333.0 145.0,338.0 154.0,331.0 158.0,332.0 162.0,335.0 161.0,329.0 Z","M158.0,339.0 157.0,340.0 157.0,349.0 158.0,350.0 159.0,367.0 160.0,368.0 160.0,396.0 159.0,398.0 165.0,406.0 168.0,408.0 172.0,408.0 177.0,403.0 181.0,394.0 181.0,389.0 182.0,388.0 181.0,377.0 177.0,365.0 171.0,353.0 165.0,345.0 Z","M75.0,340.0 73.0,340.0 62.0,351.0 57.0,360.0 57.0,362.0 54.0,367.0 51.0,376.0 51.0,380.0 50.0,381.0 50.0,391.0 51.0,392.0 51.0,396.0 56.0,405.0 60.0,408.0 66.0,406.0 72.0,398.0 72.0,359.0 74.0,355.0 Z","M81.0,341.0 80.0,348.0 79.0,349.0 79.0,353.0 77.0,358.0 77.0,367.0 76.0,368.0 76.0,375.0 77.0,376.0 76.0,393.0 77.0,394.0 77.0,399.0 78.0,401.0 85.0,408.0 90.0,409.0 96.0,404.0 99.0,398.0 99.0,395.0 100.0,394.0 100.0,382.0 99.0,381.0 99.0,377.0 98.0,376.0 96.0,366.0 88.0,350.0 Z","M151.0,341.0 143.0,352.0 140.0,359.0 138.0,361.0 138.0,363.0 133.0,373.0 132.0,382.0 131.0,383.0 131.0,394.0 133.0,400.0 135.0,402.0 135.0,404.0 141.0,409.0 143.0,409.0 148.0,406.0 155.0,398.0 155.0,366.0 154.0,365.0 154.0,356.0 153.0,355.0 153.0,349.0 152.0,348.0 Z"],"Sóleo":["M65.0,416.0 62.0,418.0 63.0,428.0 64.0,429.0 64.0,433.0 65.0,434.0 65.0,438.0 66.0,439.0 67.0,446.0 69.0,450.0 70.0,457.0 75.0,472.0 74.0,470.0 72.0,448.0 71.0,447.0 71.0,441.0 69.0,435.0 68.0,425.0 Z","M166.0,416.0 165.0,416.0 164.0,422.0 163.0,423.0 163.0,428.0 162.0,429.0 162.0,433.0 161.0,434.0 161.0,438.0 159.0,444.0 159.0,449.0 157.0,455.0 157.0,461.0 156.0,462.0 155.0,472.0 163.0,448.0 163.0,445.0 167.0,434.0 167.0,431.0 168.0,430.0 168.0,420.0 169.0,419.0 Z","M90.0,420.0 87.0,428.0 85.0,441.0 84.0,442.0 84.0,447.0 83.0,448.0 82.0,470.0 83.0,457.0 84.0,456.0 86.0,442.0 88.0,437.0 88.0,433.0 90.0,428.0 Z","M142.0,420.0 142.0,431.0 143.0,432.0 144.0,442.0 146.0,448.0 148.0,470.0 147.0,444.0 146.0,443.0 146.0,437.0 145.0,436.0 145.0,432.0 144.0,431.0 144.0,427.0 143.0,426.0 143.0,422.0 Z","M57.0,421.0 58.0,432.0 59.0,433.0 59.0,436.0 61.0,441.0 61.0,445.0 62.0,446.0 62.0,449.0 63.0,450.0 63.0,453.0 64.0,454.0 64.0,457.0 65.0,458.0 65.0,461.0 66.0,462.0 66.0,465.0 67.0,466.0 67.0,469.0 68.0,470.0 68.0,473.0 69.0,474.0 72.0,488.0 72.0,483.0 71.0,482.0 70.0,473.0 68.0,469.0 65.0,455.0 63.0,451.0 63.0,448.0 62.0,447.0 62.0,444.0 59.0,435.0 Z","M174.0,421.0 173.0,428.0 172.0,429.0 173.0,430.0 171.0,434.0 170.0,441.0 167.0,448.0 165.0,458.0 158.0,479.0 157.0,488.0 159.0,482.0 159.0,479.0 162.0,472.0 163.0,465.0 165.0,461.0 166.0,454.0 168.0,450.0 168.0,447.0 170.0,443.0 170.0,439.0 173.0,430.0 172.0,429.0 173.0,428.0 Z"]}}}};


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
    steps:['Colócate en la posición inicial con un agarre firme y estable.','Baja el peso o el cuerpo de forma controlada hasta notar el estiramiento.','Empuja de vuelta a la posición inicial extendiendo los codos.','Mantén el core activado durante todo el movimiento.','Controla la respiración: inhala al bajar, exhala al empujar.'],
    secondary:'Tríceps, deltoides anterior y serrato anterior como estabilizadores.',
    mistakes:['Arquear en exceso la zona lumbar para compensar falta de fuerza.','Dejar caer los codos completamente bloqueados de golpe al extender.','Bajar demasiado rápido perdiendo el control de la carga.'],
    tips:'Aprieta el pecho activamente en la fase final del empuje y mantén las escápulas ligeramente retraídas para proteger el hombro.' },
  pull:{ desc:n=>`Ejercicio de tracción centrado en la espalda y los brazos.`,
    steps:['Agárrate o sujeta el peso con un agarre firme.','Tira llevando los codos hacia atrás y juntando las escápulas.','Controla el regreso a la posición inicial sin perder tensión.','Evita usar impulso; el movimiento debe ser controlado.','Mantén el pecho elevado durante todo el recorrido.'],
    secondary:'Bíceps, dorsal ancho, romboides y antebrazos por el agarre.',
    mistakes:['Usar impulso de las piernas o balanceo del torso ("kipping" involuntario).','No completar el recorrido, quedándose corto en la parte alta.','Encoger los hombros hacia las orejas en vez de activar la espalda.'],
    tips:'Piensa en "llevar los codos hacia los bolsillos traseros" para priorizar la espalda sobre el bíceps.' },
  row:{ desc:n=>`Ejercicio de remo para el desarrollo de la espalda media y los dorsales.`,
    steps:['Inclina el torso manteniendo la espalda recta.','Tira del peso hacia el abdomen llevando los codos hacia atrás.','Aprieta las escápulas en la parte final del movimiento.','Baja el peso de forma controlada sin redondear la espalda.'],
    secondary:'Bíceps, deltoides posterior y erectores espinales como estabilizadores.',
    mistakes:['Redondear la espalda baja durante la tracción.','Tirar con un tirón brusco en vez de un recorrido controlado.','Usar demasiado peso y compensar con balanceo del torso.'],
    tips:'Mantén el pecho ligeramente elevado y evita rotar el torso; el movimiento debe sentirse en la espalda, no en los brazos.' },
  squat:{ desc:n=>`Movimiento de sentadilla que desarrolla cuádriceps, glúteos e isquiotibiales.`,
    steps:['Coloca los pies a la anchura de los hombros con la carga bien apoyada.','Baja flexionando cadera y rodillas manteniendo el pecho erguido.','Desciende hasta donde tu movilidad lo permita con buena técnica.','Empuja a través de los talones para volver a la posición inicial.','Mantén la espalda neutra durante todo el recorrido.'],
    secondary:'Glúteos, isquiotibiales, core y espalda baja como estabilizadores.',
    mistakes:['Dejar que las rodillas colapsen hacia dentro (valgo de rodilla).','Levantar los talones del suelo por falta de movilidad de tobillo.','Redondear la zona lumbar en el fondo del movimiento.'],
    tips:'Reparte el peso entre todo el pie, no solo la punta ni solo el talón, y respira profundo antes de bajar para estabilizar el core (maniobra de Valsalva controlada).' },
  hinge:{ desc:n=>`Movimiento de bisagra de cadera que trabaja isquiotibiales, glúteos y zona lumbar.`,
    steps:['Comienza con una ligera flexión de rodillas y la espalda recta.','Empuja la cadera hacia atrás manteniendo el peso cerca del cuerpo.','Baja hasta sentir el estiramiento en los isquiotibiales.','Vuelve a la posición inicial empujando la cadera hacia delante.','Evita redondear la espalda en ningún momento.'],
    secondary:'Espalda baja (erectores), core y antebrazos por el agarre.',
    mistakes:['Doblar demasiado las rodillas convirtiéndolo en una sentadilla.','Redondear la espalda baja, sobre todo con cargas altas.','Alejar la barra o el peso del cuerpo durante el recorrido.'],
    tips:'Imagina que cierras una puerta con la cadera hacia atrás; la barra debe rozar las piernas durante todo el recorrido.' },
  'press-overhead':{ desc:n=>`Press vertical que desarrolla principalmente los hombros y los tríceps.`,
    steps:['Sujeta el peso a la altura de los hombros con los codos ligeramente adelantados.','Empuja hacia arriba hasta extender completamente los brazos.','Evita arquear excesivamente la zona lumbar.','Baja de forma controlada hasta la posición inicial.'],
    secondary:'Tríceps, trapecio superior y core para estabilizar el tronco.',
    mistakes:['Arquear la espalda baja para ayudar a subir el peso.','Empujar hacia delante en vez de hacia arriba, perdiendo trayectoria vertical.','No activar los glúteos y el core para estabilizar la cadera.'],
    tips:'Aprieta los glúteos y el abdomen antes de empujar: eso protege la zona lumbar y transmite más fuerza hacia arriba.' },
  curl:{ desc:n=>`Ejercicio de aislamiento para el desarrollo del bíceps.`,
    steps:['Mantén los codos pegados al cuerpo durante todo el movimiento.','Flexiona el codo llevando el peso hacia el hombro.','Aprieta el bíceps en la parte alta del movimiento.','Baja de forma lenta y controlada hasta la extensión completa.'],
    secondary:'Braquial y braquiorradial (antebrazo) como sinergistas.',
    mistakes:['Balancear el torso o los hombros para generar impulso ("cheating").','Mover los codos hacia delante en vez de mantenerlos fijos.','No completar la extensión total del brazo en la bajada.'],
    tips:'Controla especialmente la fase negativa (bajada); es donde más se estimula el crecimiento muscular.' },
  extension:{ desc:n=>`Ejercicio de aislamiento para el desarrollo del tríceps.`,
    steps:['Fija la parte superior del brazo cerca de la cabeza o el cuerpo.','Extiende el codo llevando el peso hacia arriba o hacia atrás.','Aprieta el tríceps en la posición de extensión completa.','Vuelve a la posición inicial de forma controlada.'],
    secondary:'Ancóneo y deltoides como estabilizadores del codo y hombro.',
    mistakes:['Mover el codo hacia fuera o hacia delante durante la extensión.','Usar impulso del hombro en vez de aislar el tríceps.','No llegar a la extensión completa por miedo a "bloquear" el codo.'],
    tips:'Mantén el codo apuntando siempre en la misma dirección; solo el antebrazo debe moverse.' },
  raise:{ desc:n=>`Ejercicio de aislamiento para el desarrollo de los hombros.`,
    steps:['Sujeta el peso con los brazos ligeramente flexionados.','Eleva el peso lateral o frontalmente hasta la altura del hombro.','Evita usar impulso; controla el movimiento en todo momento.','Baja de forma lenta hasta la posición inicial.'],
    secondary:'Trapecio superior y supraespinoso como sinergistas.',
    mistakes:['Encoger los hombros (elevar el trapecio) en vez del deltoides.','Usar demasiado peso y compensar con balanceo del cuerpo.','Elevar por encima de la altura del hombro sin necesidad, cargando la articulación.'],
    tips:'Piensa en "verter una jarra de agua" al final del recorrido para orientar bien la rotación de la muñeca.' },
  calf:{ desc:n=>`Ejercicio de aislamiento para el desarrollo de los gemelos.`,
    steps:['Colócate con la punta de los pies apoyada y los talones libres.','Eleva los talones lo máximo posible contrayendo los gemelos.','Mantén la contracción un segundo en la parte alta.','Baja de forma controlada hasta sentir el estiramiento.'],
    secondary:'Sóleo y tibial posterior como sinergistas del tobillo.',
    mistakes:['Hacer el recorrido muy corto y rápido, sin pausa arriba.','Flexionar las rodillas para ayudarse con el impulso.','No bajar lo suficiente para estirar el gemelo entre repeticiones.'],
    tips:'Prueba a girar ligeramente la punta de los pies hacia dentro o hacia fuera entre series para enfatizar distintas cabezas del gemelo.' },
  lunge:{ desc:n=>`Movimiento unilateral de pierna que trabaja cuádriceps y glúteos.`,
    steps:['Da un paso al frente, atrás o al lateral según la variante.','Flexiona ambas rodillas hasta formar un ángulo de 90 grados.','Empuja con la pierna delantera para volver a la posición inicial.','Mantén el torso erguido durante todo el movimiento.'],
    secondary:'Isquiotibiales, aductores y core para el equilibrio.',
    mistakes:['Dejar que la rodilla delantera sobrepase mucho la punta del pie de forma descontrolada.','Perder el equilibrio por dar un paso demasiado corto o largo.','Inclinar el torso hacia delante en exceso.'],
    tips:'Trabaja delante de un espejo al principio para comprobar que la rodilla sigue la misma línea que el pie.' },
  core:{ desc:n=>`Ejercicio de core que fortalece la musculatura abdominal y estabilizadora.`,
    steps:['Colócate en la posición inicial manteniendo la zona lumbar protegida.','Activa el abdomen antes de iniciar el movimiento.','Realiza el movimiento de forma controlada, sin usar impulso.','Respira de forma constante durante todo el ejercicio.'],
    secondary:'Oblicuos, transverso abdominal y flexores de cadera.',
    mistakes:['Aguantar la respiración durante todo el ejercicio.','Tirar del cuello con las manos en vez de usar el abdomen.','Dejar que la zona lumbar se despegue del suelo o se hunda en exceso.'],
    tips:'Exhala en el momento de mayor esfuerzo (la contracción); ayuda a activar mejor el abdomen profundo.' },
  carry:{ desc:n=>`Ejercicio funcional de acarreo que mejora la fuerza de agarre y la estabilidad del core.`,
    steps:['Sujeta la carga con un agarre firme y el core activado.','Camina o desplázate manteniendo una postura erguida.','Evita balancear la carga de un lado a otro.','Controla la respiración durante todo el recorrido.'],
    secondary:'Antebrazos, trapecio y core como estabilizadores globales.',
    mistakes:['Encorvar la espalda o dejar caer los hombros hacia delante.','Caminar con pasos demasiado largos que desestabilizan la carga.','Sujetar con las muñecas flexionadas en vez de en posición neutra.'],
    tips:'Aprieta el core como si te fueran a dar un golpe en el estómago; eso estabiliza toda la columna durante el desplazamiento.' },
  plyo:{ desc:n=>`Ejercicio pliométrico orientado a desarrollar potencia y velocidad.`,
    steps:['Adopta una posición atlética antes de iniciar el movimiento.','Ejecuta el movimiento explosivo con la máxima intención de velocidad.','Amortigua la recepción flexionando rodillas y cadera.','Recupera la posición inicial antes de repetir.'],
    secondary:'Cuádriceps, glúteos, gemelos y core como cadena de potencia.',
    mistakes:['Aterrizar con las piernas completamente rígidas.','Encadenar repeticiones sin recuperar la posición, perdiendo técnica.','Entrenar pliometría con fatiga acumulada alta, aumentando el riesgo de lesión.'],
    tips:'Prioriza la calidad sobre la cantidad: pocas repeticiones muy explosivas son mejores que muchas repeticiones lentas.' },
  stretch:{ desc:n=>`Ejercicio de movilidad y flexibilidad para mejorar el rango de movimiento.`,
    steps:['Adopta la posición inicial de forma lenta y controlada.','Lleva el estiramiento hasta notar tensión, sin llegar a sentir dolor.','Mantén la posición respirando de forma profunda y constante.','Suelta el estiramiento de forma progresiva.'],
    secondary:'Varía según la zona; suele implicar músculos y fascia adyacentes a la articulación trabajada.',
    mistakes:['Rebotar en el estiramiento en vez de mantenerlo estático.','Forzar hasta sentir dolor agudo en vez de una tensión tolerable.','Estirar en frío sin ningún calentamiento previo.'],
    tips:'Mantén cada estiramiento al menos 20-30 segundos para obtener beneficios reales sobre la flexibilidad.' },
  cardio:{ desc:n=>`Ejercicio cardiovascular orientado a mejorar la resistencia aeróbica.`,
    steps:['Comienza con un ritmo suave para calentar.','Aumenta progresivamente la intensidad hasta el ritmo objetivo.','Mantén una respiración constante durante todo el esfuerzo.','Termina con unos minutos a ritmo suave para enfriar.'],
    secondary:'Sistema cardiorrespiratorio junto con la musculatura de piernas o brazos implicada.',
    mistakes:['Empezar demasiado fuerte y no poder mantener el ritmo.','Ignorar la técnica de respiración durante el esfuerzo.','No hidratarse adecuadamente antes y durante sesiones largas.'],
    tips:'Usa la "prueba del habla": si puedes mantener una conversación entrecortada, vas a una intensidad aeróbica adecuada.' },
  calisthenics:{ desc:n=>`Ejercicio de calistenia avanzada que exige fuerza relativa y control corporal.`,
    steps:['Adopta la posición de partida con el core totalmente activado.','Ejecuta el movimiento de forma controlada, sin balanceos.','Mantén la alineación corporal durante todo el ejercicio.','Progresa de forma gradual con variantes más sencillas si es necesario.'],
    secondary:'Core, hombros y espalda como estabilizadores globales de todo el cuerpo.',
    mistakes:['Saltarse las progresiones e intentar la variante completa demasiado pronto.','Perder la alineación corporal (cadera caída o arqueada).','Entrenar movimientos de alta exigencia articular sin calentamiento específico.'],
    tips:'Domina primero las progresiones más sencillas (rodillas, banda elástica, tiempo parcial) antes de ir a por la variante completa.' },
};

/* Nivel de dificultad orientativo y equipo detectado a partir del patrón, tipo de puntuación y variante */
function exerciseDifficulty(ex){
  if(ex.scoreType==='time' && (ex.pattern==='calisthenics')) return 'Avanzado';
  if(['calisthenics'].includes(ex.pattern)) return 'Avanzado';
  if(ex.pattern==='plyo' || ex.pattern==='squat' && /Overhead|Zercher|Front/i.test(ex.en)) return 'Intermedio-Avanzado';
  if(['squat','hinge','press-overhead'].includes(ex.pattern) && /Barbell|Trap Bar|Snatch|Clean/i.test(ex.en)) return 'Intermedio-Avanzado';
  if(['stretch','carry','calf','curl','extension','raise'].includes(ex.pattern)) return 'Principiante';
  if(['core','cardio'].includes(ex.pattern)) return 'Principiante-Intermedio';
  return 'Intermedio';
}
function exerciseEquipment(ex){
  const s = ex.en.toLowerCase();
  if(s.includes('barbell')) return 'Barra';
  if(s.includes('dumbbell')) return 'Mancuernas';
  if(s.includes('kettlebell')) return 'Kettlebell';
  if(s.includes('cable')) return 'Polea / cable';
  if(s.includes('machine')||s.includes('smith')||s.includes('leg press')||s.includes('hack')) return 'Máquina';
  if(s.includes('band')) return 'Banda elástica';
  if(s.includes('ring')) return 'Anillas';
  if(s.includes('box')) return 'Cajón pliométrico';
  if(s.includes('bike')||s.includes('treadmill')||s.includes('erg')||s.includes('elliptical')||s.includes('rope')) return 'Máquina de cardio / cuerda';
  if(s.includes('sled')||s.includes('prowler')) return 'Trineo';
  if(s.includes('plate')) return 'Disco';
  if(ex.scoreType==='reps' || ex.scoreType==='time' || ex.pattern==='calisthenics' || ex.pattern==='stretch') return 'Peso corporal';
  return 'Peso libre / peso corporal';
}

/* Cada entrada base: [id, nombreEn, nombreEs, músculo principal, [objetivos], patrón, tipoDePuntuación, [variantes[en,es]]] */
const EXERCISE_BASES = [
['bench-press','Bench Press','Press de banca','Pectoral mayor',['Fuerza','Hipertrofia'],'push','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Incline Barbell','inclinado con barra'],['Incline Dumbbell','inclinado con mancuernas'],['Decline Barbell','declinado con barra'],['Close-Grip','con agarre cerrado'],['Smith Machine','en multipower'],['Machine','en máquina']]],
['push-up','Push-Up','Flexión de brazos','Pectoral mayor',['Calistenia','Hipertrofia'],'push','reps',[['Standard','estándar'],['Wide Grip','agarre ancho'],['Diamond','diamante'],['Decline','declinada'],['Incline','inclinada'],['Archer','de arquero'],['One-Arm','a un brazo'],['Clap','con palmada']]],
['chest-fly','Chest Fly','Aperturas de pecho','Pectoral mayor',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Machine','en máquina'],['Incline Dumbbell','inclinadas con mancuernas']]],
['cable-crossover','Cable Crossover','Cruce de poleas','Pectoral mayor',['Hipertrofia'],'raise','strength-abs',[['High to Low','de arriba a abajo'],['Low to High','de abajo a arriba']]],
['dip','Dip','Fondos en paralelas','Pectoral mayor',['Calistenia','Fuerza'],'push','reps',[['Chest','de pecho'],['Tricep','de tríceps'],['Ring','en anillas'],['Weighted','lastrados']]],
['pullover','Pullover','Pullover','Pectoral mayor',['Hipertrofia'],'pull','strength-abs',[['Dumbbell','con mancuerna'],['Barbell','con barra'],['Cable','en polea']]],
['pull-up','Pull-Up','Dominada','Dorsal ancho',['Calistenia','Fuerza'],'pull','reps',[['Standard','estándar'],['Wide Grip','agarre ancho'],['Close Grip','agarre cerrado'],['Chin-Up','supina'],['Neutral Grip','agarre neutro'],['Weighted','lastrada'],['Archer','de arquero'],['L-Sit','con L-sit'],['Commando','comando']]],
['lat-pulldown','Lat Pulldown','Jalón al pecho','Dorsal ancho',['Fuerza','Hipertrofia'],'pull','strength-abs',[['Wide Grip','agarre ancho'],['Close Grip','agarre cerrado'],['Reverse Grip','agarre supino'],['Single Arm','a un brazo']]],
['bent-over-row','Bent-Over Row','Remo con barra inclinado','Dorsal ancho',['Fuerza','Hipertrofia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Underhand','agarre supino'],['Pendlay','Pendlay']]],
['seated-row','Seated Row','Remo sentado','Romboides',['Hipertrofia'],'row','strength-abs',[['Cable','en polea'],['Machine','en máquina'],['Wide Grip','agarre ancho']]],
['t-bar-row','T-Bar Row','Remo en T','Dorsal ancho',['Fuerza','Hipertrofia'],'row','strength-bw',[['Standard','estándar'],['Chest-Supported','con apoyo en pecho']]],
['face-pull','Face Pull','Face pull','Deltoides posterior',['Hipertrofia'],'pull','strength-abs',[['Cable','en polea'],['Band','con banda']]],
['straight-arm-pulldown','Straight-Arm Pulldown','Jalón con brazos rectos','Dorsal ancho',['Hipertrofia'],'pull','strength-abs',[['Cable','en polea'],['Band','con banda']]],
['shrug','Shrug','Encogimiento de hombros','Trapecio',['Fuerza','Hipertrofia'],'raise','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Trap Bar','con trap bar']]],
['deadlift','Deadlift','Peso muerto','Lumbares',['Fuerza'],'hinge','strength-bw',[['Conventional','convencional'],['Sumo','sumo'],['Romanian','rumano'],['Stiff-Leg','con piernas rígidas'],['Trap Bar','con trap bar'],['Deficit','en déficit'],['Snatch-Grip','agarre de arrancada']]],
['good-morning','Good Morning','Buenos días','Lumbares',['Fuerza'],'hinge','strength-bw',[['Barbell','con barra'],['Seated','sentado']]],
['back-extension','Back Extension','Extensión lumbar','Lumbares',['Fuerza','Calistenia'],'hinge','reps',[['Bodyweight','con peso corporal'],['Weighted','lastrada']]],
['overhead-press','Overhead Press','Press militar','Deltoides anterior',['Fuerza'],'press-overhead','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Seated Barbell','sentado con barra'],['Push Press','press de impulso'],['Arnold Press','Arnold press']]],
['lateral-raise','Lateral Raise','Elevación lateral','Deltoides lateral',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Machine','en máquina'],['Leaning','inclinado lateral']]],
['front-raise','Front Raise','Elevación frontal','Deltoides anterior',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Cable','en polea'],['Plate','con disco']]],
['rear-delt-fly','Rear Delt Fly','Elevación posterior','Deltoides posterior',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Machine','en máquina']]],
['upright-row','Upright Row','Remo al mentón','Deltoides lateral',['Hipertrofia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Cable','en polea']]],
['handstand-push-up','Handstand Push-Up','Flexión en pino','Deltoides anterior',['Calistenia'],'push','reps',[['Wall','en pared'],['Free','libre'],['Deficit','en déficit']]],
['bicep-curl','Bicep Curl','Curl de bíceps','Bíceps braquial',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Cable','en polea'],['EZ Bar','con barra Z'],['Alternating','alterno']]],
['hammer-curl','Hammer Curl','Curl martillo','Braquiorradial',['Hipertrofia'],'curl','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Cross-Body','cruzado']]],
['preacher-curl','Preacher Curl','Curl predicador','Bíceps braquial',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuerna'],['Machine','en máquina']]],
['concentration-curl','Concentration Curl','Curl concentrado','Bíceps braquial',['Hipertrofia'],'curl','strength-abs',[['Dumbbell','con mancuerna']]],
['spider-curl','Spider Curl','Curl araña','Bíceps braquial',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['chin-up','Chin-Up','Dominada supina','Bíceps braquial',['Calistenia','Fuerza'],'pull','reps',[['Standard','estándar'],['Weighted','lastrada']]],
['tricep-extension','Tricep Extension','Extensión de tríceps','Tríceps (cabeza larga)',['Hipertrofia'],'extension','strength-abs',[['Overhead Dumbbell','sobre la cabeza con mancuerna'],['Overhead Cable','sobre la cabeza en polea'],['Lying Barbell','tumbado con barra'],['Cable','en polea']]],
['tricep-pushdown','Tricep Pushdown','Extensión de tríceps en polea','Tríceps (cabeza lateral)',['Hipertrofia'],'extension','strength-abs',[['Rope','con cuerda'],['Bar','con barra'],['Reverse Grip','agarre supino'],['Single Arm','a un brazo']]],
['skull-crusher','Skull Crusher','Press francés','Tríceps (cabeza larga)',['Hipertrofia'],'extension','strength-abs',[['Barbell','con barra'],['EZ Bar','con barra Z'],['Dumbbell','con mancuernas']]],
['close-grip-bench','Close-Grip Bench Press','Press banca agarre cerrado','Tríceps (cabeza lateral)',['Fuerza','Hipertrofia'],'push','strength-bw',[['Barbell','con barra'],['Smith Machine','en multipower']]],
['tricep-kickback','Tricep Kickback','Patada de tríceps','Tríceps (cabeza lateral)',['Hipertrofia'],'extension','strength-abs',[['Dumbbell','con mancuerna'],['Cable','en polea']]],
['wrist-curl','Wrist Curl','Curl de muñeca','Flexores del antebrazo',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Behind Back','tras la espalda']]],
['reverse-curl','Reverse Curl','Curl inverso','Braquiorradial',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas'],['Cable','en polea']]],
['farmers-carry','Farmer’s Carry','Paseo del granjero','Flexores del antebrazo',['Fuerza','Atletismo'],'carry','strength-bw',[['Dumbbell','con mancuernas'],['Kettlebell','con kettlebells'],['Trap Bar','con trap bar']]],
['dead-hang','Dead Hang','Colgarse de la barra','Flexores del antebrazo',['Calistenia'],'carry','time',[['Standard','estándar'],['One-Arm','a un brazo'],['Towel','con toalla']]],
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
['hip-thrust','Hip Thrust','Hip thrust','Glúteo mayor',['Fuerza','Hipertrofia'],'hinge','strength-bw',[['Barbell','con barra'],['Machine','en máquina'],['Single-Leg','a una pierna'],['Banded','con banda']]],
['glute-bridge','Glute Bridge','Puente de glúteos','Glúteo mayor',['Calistenia','Hipertrofia'],'hinge','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso'],['Single-Leg','a una pierna']]],
['cable-kickback','Cable Kickback','Patada de glúteo en polea','Glúteo mayor',['Hipertrofia'],'extension','strength-abs',[['Standard','estándar'],['Banded','con banda']]],
['bulgarian-split-squat','Bulgarian Split Squat','Sentadilla búlgara','Glúteo mayor',['Fuerza','Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['step-up','Step-Up','Subida al cajón','Glúteo mayor',['Fuerza','Atletismo'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['squat','Squat','Sentadilla','Vasto lateral',['Fuerza'],'squat','strength-bw',[['Back Barbell','trasera con barra'],['Front Barbell','frontal con barra'],['Goblet','goblet'],['Box','al cajón'],['Overhead','overhead'],['Pause','con pausa'],['Zercher','Zercher']]],
['leg-press','Leg Press','Prensa de piernas','Vasto lateral',['Fuerza','Hipertrofia'],'squat','strength-abs',[['Standard','estándar'],['Single-Leg','a una pierna'],['45 Degree','a 45 grados']]],
['leg-extension','Leg Extension','Extensión de cuádriceps','Recto femoral',['Hipertrofia'],'extension','strength-abs',[['Standard','estándar'],['Single-Leg','a una pierna']]],
['lunge','Lunge','Zancada','Vasto lateral',['Fuerza','Atletismo'],'lunge','strength-bw',[['Walking','caminando'],['Reverse','inversa'],['Dumbbell','con mancuernas'],['Barbell','con barra'],['Curtsy','curtsy']]],
['sissy-squat','Sissy Squat','Sissy squat','Recto femoral',['Calistenia'],'squat','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['wall-sit','Wall Sit','Silla contra la pared','Vasto medial',['Calistenia'],'squat','time',[['Standard','estándar'],['Weighted','con peso']]],
['pistol-squat','Pistol Squat','Sentadilla a una pierna','Vasto lateral',['Calistenia','Equilibrio'],'squat','reps',[['Assisted','asistida'],['Free','libre'],['Weighted','lastrada']]],
['leg-curl','Leg Curl','Curl femoral','Bíceps femoral',['Hipertrofia'],'curl','strength-abs',[['Lying','tumbado'],['Seated','sentado'],['Standing','de pie'],['Single-Leg','a una pierna']]],
['nordic-curl','Nordic Curl','Curl nórdico','Isquiotibiales',['Calistenia','Fuerza'],'curl','reps',[['Standard','estándar'],['Assisted','asistido']]],
['glute-ham-raise','Glute-Ham Raise','Glute-ham raise','Bíceps femoral',['Fuerza','Calistenia'],'curl','reps',[['Standard','estándar'],['Weighted','lastrado']]],
['calf-raise','Calf Raise','Elevación de talones','Gastrocnemio',['Hipertrofia'],'calf','strength-bw',[['Standing','de pie'],['Seated','sentado'],['Donkey','burro'],['Single-Leg','a una pierna'],['Leg Press','en prensa']]],
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
['hip-flexor-stretch','Hip Flexor Stretch','Estiramiento de flexores de cadera','Recto femoral',['Flexibilidad'],'stretch','time',[['Kneeling','de rodillas'],['Standing','de pie']]],
['hamstring-stretch','Hamstring Stretch','Estiramiento de isquiotibiales','Bíceps femoral',['Flexibilidad'],'stretch','time',[['Standing','de pie'],['Seated','sentado'],['Lying','tumbado']]],
['shoulder-dislocate','Shoulder Dislocate','Dislocaciones de hombro','Deltoides anterior',['Flexibilidad'],'stretch','reps',[['Band','con banda'],['Stick','con palo']]],
['cat-cow','Cat-Cow','Gato-vaca','Lumbares',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['cossack-squat','Cossack Squat','Sentadilla cosaca','Vasto medial',['Flexibilidad','Calistenia'],'squat','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['split-stretch','Split Stretch','Estiramiento de spagat','Aductores',['Flexibilidad'],'stretch','time',[['Front Split','spagat frontal'],['Side Split','spagat lateral']]],
['thoracic-rotation','Thoracic Rotation','Rotación torácica','Romboides',['Flexibilidad'],'stretch','reps',[['Quadruped','a cuatro patas'],['Side-Lying','tumbado de lado']]],
['pigeon-pose','Pigeon Pose','Postura de la paloma','Glúteo medio',['Flexibilidad'],'stretch','time',[['Standard','estándar'],['Reclined','reclinada']]],
['worlds-greatest-stretch','World’s Greatest Stretch','El mejor estiramiento del mundo','Cuerpo completo',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['running','Running','Correr','Cuerpo completo',['Resistencia','Atletismo'],'cardio','distance-time',[['5K','5 km'],['10K','10 km'],['Half Marathon','media maratón'],['Marathon','maratón']]],
['cycling','Cycling','Ciclismo','Cuerpo completo',['Resistencia'],'cardio','distance-time',[['20K','20 km'],['40K','40 km'],['Hill Climb','subida']]],
['rowing','Rowing','Remo (máquina)','Cuerpo completo',['Resistencia','Fuerza'],'cardio','distance-time',[['2000m','2000 metros'],['5000m','5000 metros']]],
['jump-rope','Jump Rope','Comba','Cuerpo completo',['Resistencia','Velocidad'],'cardio','time',[['Standard','estándar'],['Double Under','doble salto']]],
['swimming','Swimming','Natación','Cuerpo completo',['Resistencia'],'cardio','distance-time',[['500m','500 metros'],['1000m','1000 metros'],['1500m','1500 metros']]],
['stair-climb','Stair Climb','Subida de escaleras','Cuerpo completo',['Resistencia','Atletismo'],'cardio','time',[['Standard','estándar'],['Weighted','con peso']]],
['pec-deck','Pec Deck','Pec deck','Pectoral mayor',['Hipertrofia'],'raise','strength-abs',[['Standard','estándar'],['Single Arm','a un brazo']]],
['zottman-curl','Zottman Curl','Curl Zottman','Braquiorradial',['Hipertrofia'],'curl','strength-abs',[['Dumbbell','con mancuernas']]],
['drag-curl','Drag Curl','Curl drag','Bíceps braquial',['Hipertrofia'],'curl','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['jm-press','JM Press','Press JM','Tríceps (cabeza larga)',['Hipertrofia','Fuerza'],'extension','strength-abs',[['Barbell','con barra'],['EZ Bar','con barra Z']]],
['tate-press','Tate Press','Press Tate','Tríceps (cabeza larga)',['Hipertrofia'],'extension','strength-abs',[['Dumbbell','con mancuernas']]],
['cable-woodchopper','Cable Woodchopper','Leñador en polea','Abdomen',['Hipertrofia','Atletismo'],'core','reps',[['High to Low','de arriba a abajo'],['Low to High','de abajo a arriba']]],
['pallof-press','Pallof Press','Pallof press','Abdomen',['Fuerza','Equilibrio'],'core','reps',[['Standing','de pie'],['Kneeling','de rodillas']]],
['reverse-hyperextension','Reverse Hyperextension','Hiperextensión inversa','Bíceps femoral',['Fuerza','Hipertrofia'],'hinge','strength-abs',[['Machine','en máquina'],['Bench','en banco']]],
['hip-abduction','Hip Abduction','Abducción de cadera','Glúteo medio',['Hipertrofia'],'raise','strength-abs',[['Machine','en máquina'],['Cable','en polea'],['Band','con banda']]],
['hip-adduction','Hip Adduction','Aducción de cadera','Aductores',['Hipertrofia'],'raise','strength-abs',[['Machine','en máquina'],['Cable','en polea'],['Band','con banda']]],
['landmine-press','Landmine Press','Press landmine','Deltoides anterior',['Fuerza','Hipertrofia'],'press-overhead','strength-bw',[['Standard','estándar'],['Single Arm','a un brazo']]],
['cuban-press','Cuban Press','Press cubano','Deltoides lateral',['Hipertrofia'],'press-overhead','strength-abs',[['Dumbbell','con mancuernas']]],
['y-raise','Y-Raise','Elevación en Y','Deltoides posterior',['Hipertrofia'],'raise','strength-abs',[['Dumbbell','con mancuernas'],['Cable','en polea'],['Incline Bench','en banco inclinado']]],
['renegade-row','Renegade Row','Remo renegado','Dorsal ancho',['Fuerza','Resistencia'],'row','strength-abs',[['Dumbbell','con mancuernas']]],
['man-maker','Man Maker','Man maker','Cuerpo completo',['Resistencia','Potencia'],'plyo','reps',[['Dumbbell','con mancuernas']]],
['wall-ball','Wall Ball','Wall ball','Cuerpo completo',['Potencia','Resistencia'],'squat','reps',[['Standard','estándar']]],
['medicine-ball-slam','Medicine Ball Slam','Golpe con balón medicinal','Cuerpo completo',['Potencia'],'plyo','reps',[['Overhead','sobre la cabeza'],['Rotational','rotacional']]],
['tuck-jump','Tuck Jump','Salto con rodillas al pecho','Cuerpo completo',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['depth-jump','Depth Jump','Salto en profundidad','Cuerpo completo',['Potencia'],'plyo','reps',[['Standard','estándar']]],
['lateral-bound','Lateral Bound','Salto lateral','Vasto lateral',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['bear-crawl','Bear Crawl','Marcha del oso','Cuerpo completo',['Calistenia','Resistencia'],'core','time',[['Forward','hacia delante'],['Lateral','lateral']]],
['crab-walk','Crab Walk','Marcha del cangrejo','Cuerpo completo',['Calistenia'],'core','time',[['Standard','estándar']]],
['inchworm','Inchworm','Inchworm','Cuerpo completo',['Flexibilidad','Calistenia'],'stretch','reps',[['Standard','estándar']]],
['superman','Superman','Superman','Lumbares',['Calistenia','Hipertrofia'],'hinge','reps',[['Standard','estándar'],['Alternating','alterno']]],
['bird-dog','Bird Dog','Bird dog','Abdomen',['Equilibrio','Calistenia'],'core','reps',[['Standard','estándar'],['Weighted','con peso']]],
['single-leg-deadlift','Single-Leg Deadlift','Peso muerto a una pierna','Bíceps femoral',['Fuerza','Equilibrio'],'hinge','strength-bw',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell'],['Bodyweight','con peso corporal']]],
['typewriter-pull-up','Typewriter Pull-Up','Dominada typewriter','Dorsal ancho',['Calistenia'],'pull','reps',[['Standard','estándar']]],
['skin-the-cat','Skin the Cat','Skin the cat','Cuerpo completo',['Calistenia'],'calisthenics','reps',[['Ring','en anillas'],['Bar','en barra']]],
['rope-climb','Rope Climb','Trepa de cuerda','Dorsal ancho',['Calistenia','Fuerza'],'pull','time',[['Legless','sin piernas'],['Standard','estándar']]],
['tire-flip','Tire Flip','Volteo de neumático','Cuerpo completo',['Potencia','Fuerza'],'hinge','reps',[['Standard','estándar']]],
['yoke-carry','Yoke Carry','Yoke carry','Cuerpo completo',['Fuerza','Atletismo'],'carry','strength-bw',[['Standard','estándar']]],
['suitcase-carry','Suitcase Carry','Suitcase carry','Flexores del antebrazo',['Fuerza','Equilibrio'],'carry','strength-bw',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell']]],
['overhead-carry','Overhead Carry','Overhead carry','Deltoides lateral',['Fuerza','Equilibrio'],'carry','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Kettlebell','con kettlebells']]],
['wrist-roller','Wrist Roller','Rodillo de muñeca','Flexores del antebrazo',['Fuerza','Hipertrofia'],'curl','reps',[['Standard','estándar']]],
['plate-pinch','Plate Pinch','Pellizco de disco','Flexores del antebrazo',['Fuerza'],'carry','time',[['Standard','estándar']]],
['tibialis-raise','Tibialis Raise','Elevación de tibial','Tibial anterior',['Hipertrofia'],'calf','reps',[['Standard','estándar'],['Weighted','con peso']]],
['jefferson-curl','Jefferson Curl','Jefferson curl','Lumbares',['Flexibilidad'],'stretch','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['scorpion-stretch','Scorpion Stretch','Estiramiento escorpión','Lumbares',['Flexibilidad'],'stretch','reps',[['Standard','estándar']]],
['frog-stretch','Frog Stretch','Estiramiento de rana','Aductores',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['butterfly-stretch','Butterfly Stretch','Estiramiento mariposa','Aductores',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['standing-quad-stretch','Standing Quad Stretch','Estiramiento de cuádriceps de pie','Recto femoral',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['downward-dog','Downward Dog','Perro boca abajo','Cuerpo completo',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['cobra-stretch','Cobra Stretch','Estiramiento cobra','Abdomen',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['childs-pose','Child’s Pose','Postura del niño','Dorsal ancho',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['seal-stretch','Seal Stretch','Estiramiento de foca','Abdomen',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['couch-stretch','Couch Stretch','Couch stretch','Recto femoral',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['ankle-mobility','Ankle Mobility Drill','Movilidad de tobillo','Tibial anterior',['Flexibilidad'],'stretch','reps',[['Standard','estándar'],['Weighted','con peso']]],
['band-pull-apart','Band Pull-Apart','Apertura con banda','Romboides',['Hipertrofia'],'raise','reps',[['Standard','estándar']]],
['scapular-pull-up','Scapular Pull-Up','Dominada escapular','Trapecio',['Calistenia'],'pull','reps',[['Standard','estándar']]],
['seated-good-morning','Seated Good Morning','Buenos días sentado','Lumbares',['Fuerza'],'hinge','strength-bw',[['Barbell','con barra']]],
['zercher-carry','Zercher Carry','Zercher carry','Cuerpo completo',['Fuerza'],'carry','strength-bw',[['Standard','estándar']]],
['single-arm-farmers-carry','Single-Arm Farmer’s Carry','Paseo del granjero a un brazo','Flexores del antebrazo',['Fuerza','Equilibrio'],'carry','strength-bw',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell']]],
['prowler-push','Prowler Push','Empuje de prowler','Cuerpo completo',['Potencia','Resistencia'],'carry','strength-bw',[['Low Handle','manillar bajo'],['High Handle','manillar alto']]],
['clean-pull','Clean Pull','Tirón de clean','Cuerpo completo',['Fuerza','Potencia'],'hinge','strength-bw',[['Standard','estándar']]],
['snatch-pull','Snatch Pull','Tirón de arrancada','Cuerpo completo',['Fuerza','Potencia'],'hinge','strength-bw',[['Standard','estándar']]],
['push-press','Push Press','Push press','Deltoides anterior',['Fuerza','Potencia'],'press-overhead','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['behind-neck-press','Behind the Neck Press','Press tras nuca','Deltoides lateral',['Fuerza'],'press-overhead','strength-bw',[['Barbell','con barra']]],
['single-arm-shoulder-press','Single-Arm Shoulder Press','Press de hombro a un brazo','Deltoides anterior',['Fuerza','Hipertrofia'],'press-overhead','strength-abs',[['Dumbbell','con mancuerna'],['Kettlebell','con kettlebell']]],
['incline-row','Incline Row','Remo inclinado','Dorsal ancho',['Hipertrofia'],'row','strength-abs',[['Dumbbell','con mancuernas']]],
['meadows-row','Meadows Row','Remo Meadows','Dorsal ancho',['Hipertrofia'],'row','strength-abs',[['Barbell','con barra']]],
['chest-supported-row','Chest-Supported Row','Remo con apoyo en pecho','Romboides',['Hipertrofia'],'row','strength-abs',[['Dumbbell','con mancuernas'],['Machine','en máquina']]],
['inverted-row','Inverted Row','Remo invertido','Dorsal ancho',['Calistenia'],'row','reps',[['Bodyweight','con peso corporal'],['Feet Elevated','pies elevados']]],
['single-arm-lat-pulldown','Single-Arm Lat Pulldown','Jalón al pecho a un brazo','Dorsal ancho',['Hipertrofia'],'pull','strength-abs',[['Cable','en polea']]],
['sumo-squat','Sumo Squat','Sentadilla sumo','Aductores',['Fuerza','Hipertrofia'],'squat','strength-bw',[['Dumbbell','con mancuerna'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['curtsy-lunge','Curtsy Lunge','Zancada curtsy','Glúteo medio',['Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Bodyweight','con peso corporal']]],
['donkey-kick','Donkey Kick','Patada de burro','Glúteo mayor',['Hipertrofia','Calistenia'],'extension','reps',[['Bodyweight','con peso corporal'],['Banded','con banda'],['Cable','en polea']]],
['fire-hydrant','Fire Hydrant','Fire hydrant','Glúteo medio',['Hipertrofia','Calistenia'],'raise','reps',[['Bodyweight','con peso corporal'],['Banded','con banda']]],
['clamshell','Clamshell','Almeja','Glúteo medio',['Hipertrofia'],'raise','reps',[['Bodyweight','con peso corporal'],['Banded','con banda']]],
['hack-squat','Hack Squat','Sentadilla hack','Vasto lateral',['Fuerza','Hipertrofia'],'squat','strength-abs',[['Machine','en máquina'],['Barbell','con barra']]],
['front-foot-elevated-split-squat','Front-Foot Elevated Split Squat','Zancada búlgara pie elevado','Vasto medial',['Fuerza','Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas']]],
['jump-squat','Jump Squat','Sentadilla con salto','Vasto lateral',['Potencia'],'plyo','reps',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['spanish-squat','Spanish Squat','Sentadilla española','Recto femoral',['Fuerza','Flexibilidad'],'squat','time',[['Band','con banda']]],
['seated-leg-curl','Seated Leg Curl','Curl femoral sentado','Isquiotibiales',['Hipertrofia'],'curl','strength-abs',[['Machine','en máquina']]],
['stability-ball-leg-curl','Stability Ball Leg Curl','Curl femoral en fitball','Isquiotibiales',['Calistenia'],'curl','reps',[['Standard','estándar']]],
['standing-calf-raise-machine','Standing Calf Raise Machine','Elevación de talones en máquina de pie','Gastrocnemio',['Hipertrofia'],'calf','strength-abs',[['Standard','estándar']]],
['jump-rope-double-under','Double Under','Doble salto de comba','Cuerpo completo',['Resistencia','Velocidad'],'cardio','reps',[['Standard','estándar']]],
['assault-bike','Assault Bike','Bicicleta de asalto','Cuerpo completo',['Resistencia','Potencia'],'cardio','time',[['Calories','calorías'],['Distance','distancia']]],
['ski-erg','Ski Erg','Ski erg','Cuerpo completo',['Resistencia'],'cardio','distance-time',[['500m','500 metros'],['1000m','1000 metros']]],
['elliptical','Elliptical','Elíptica','Cuerpo completo',['Resistencia'],'cardio','time',[['Standard','estándar']]],
['incline-treadmill-walk','Incline Treadmill Walk','Caminata en cinta inclinada','Cuerpo completo',['Resistencia'],'cardio','time',[['Standard','estándar']]],
['triple-jump','Triple Jump','Triple salto','Cuerpo completo',['Velocidad','Potencia'],'plyo','distance',[['Standard','estándar']]],
['hurdle-hop','Hurdle Hop','Salto de vallas','Cuerpo completo',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['cone-drill','Cone Drill','Ejercicio de conos','Cuerpo completo',['Velocidad','Atletismo'],'cardio','time',[['T-Drill','T-drill'],['L-Drill','L-drill']]],
['medicine-ball-throw','Medicine Ball Throw','Lanzamiento de balón medicinal','Cuerpo completo',['Potencia'],'plyo','distance',[['Chest Pass','pase de pecho'],['Overhead Throw','lanzamiento sobre cabeza'],['Rotational Throw','lanzamiento rotacional']]],
['pistol-box-squat','Pistol Box Squat','Pistol squat al cajón','Vasto lateral',['Calistenia','Equilibrio'],'squat','reps',[['Standard','estándar']]],
['shrimp-squat','Shrimp Squat','Shrimp squat','Vasto medial',['Calistenia','Equilibrio'],'squat','reps',[['Standard','estándar']]],
['bulgarian-split-squat-jump','Bulgarian Split Squat Jump','Sentadilla búlgara con salto','Glúteo mayor',['Potencia'],'plyo','reps',[['Standard','estándar']]],
['side-plank','Side Plank','Plancha lateral','Abdomen',['Calistenia','Equilibrio'],'core','time',[['Standard','estándar'],['With Rotation','con rotación'],['With Leg Lift','con elevación de pierna']]],
['hollow-body-hold','Hollow Body Hold','Hollow body hold','Abdomen',['Calistenia'],'core','time',[['Standard','estándar'],['Rocking','con balanceo']]],
['v-up','V-Up','V-up','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar'],['Weighted','con peso']]],
['toes-to-bar','Toes to Bar','Toes to bar','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar'],['Knee Raise','elevación de rodillas']]],
['windshield-wiper','Windshield Wiper','Limpiaparabrisas','Abdomen',['Calistenia'],'core','reps',[['Hanging','colgado'],['Lying','tumbado']]],
['stir-the-pot','Stir the Pot','Stir the pot','Abdomen',['Calistenia','Equilibrio'],'core','time',[['Standard','estándar']]],
['sled-drag','Sled Drag','Arrastre de trineo','Cuerpo completo',['Fuerza','Atletismo'],'carry','strength-bw',[['Forward','hacia delante'],['Backward','hacia atrás']]],
['pike-push-up','Pike Push-Up','Flexión pike','Deltoides anterior',['Calistenia'],'push','reps',[['Standard','estándar'],['Feet Elevated','pies elevados']]],
['diamond-push-up','Diamond Push-Up','Flexión diamante','Tríceps (cabeza lateral)',['Calistenia'],'push','reps',[['Standard','estándar'],['Knees','de rodillas']]],
['spoto-press','Spoto Press','Press Spoto','Pectoral mayor',['Fuerza'],'push','strength-bw',[['Barbell','con barra']]],
['floor-press','Floor Press','Press en suelo','Pectoral mayor',['Fuerza'],'push','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['svend-press','Svend Press','Press Svend','Pectoral mayor',['Hipertrofia'],'push','strength-abs',[['Plate','con disco']]],
['guillotine-press','Guillotine Press','Press guillotina','Pectoral mayor',['Hipertrofia'],'push','strength-bw',[['Barbell','con barra']]],
['landmine-row','Landmine Row','Remo landmine','Dorsal ancho',['Fuerza','Hipertrofia'],'row','strength-bw',[['Standard','estándar'],['Single Arm','a un brazo']]],
['seal-row','Seal Row','Remo seal','Dorsal ancho',['Hipertrofia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['kroc-row','Kroc Row','Remo Kroc','Dorsal ancho',['Fuerza','Hipertrofia'],'row','strength-abs',[['Dumbbell','con mancuerna']]],
['pendlay-row-alt','High Pull Row','Remo con tirón alto','Dorsal ancho',['Fuerza','Potencia'],'row','strength-bw',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['cable-pullthrough','Cable Pull-Through','Pull-through en polea','Glúteo mayor',['Hipertrofia'],'hinge','strength-abs',[['Standard','estándar']]],
['banded-hip-thrust','Banded Hip Thrust','Hip thrust con banda','Glúteo mayor',['Hipertrofia'],'hinge','reps',[['Standard','estándar']]],
['step-down','Step-Down','Bajada del cajón','Vasto medial',['Fuerza','Equilibrio'],'lunge','strength-bw',[['Standard','estándar']]],
['reverse-lunge','Reverse Lunge','Zancada inversa','Vasto lateral',['Fuerza','Hipertrofia'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Barbell','con barra'],['Bodyweight','con peso corporal']]],
['lateral-lunge','Lateral Lunge','Zancada lateral','Aductores',['Fuerza','Flexibilidad'],'lunge','strength-bw',[['Dumbbell','con mancuernas'],['Bodyweight','con peso corporal']]],
['skater-jump','Skater Jump','Salto de patinador','Vasto lateral',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['ice-skater','Speed Skater','Speed skater','Vasto lateral',['Atletismo','Resistencia'],'plyo','reps',[['Standard','estándar']]],
['wall-angel','Wall Angel','Ángel de pared','Deltoides posterior',['Flexibilidad'],'stretch','reps',[['Standard','estándar']]],
['doorway-stretch','Doorway Chest Stretch','Estiramiento de pecho en puerta','Pectoral mayor',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['triceps-stretch','Overhead Triceps Stretch','Estiramiento de tríceps sobre cabeza','Tríceps (cabeza larga)',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['lat-stretch','Lat Stretch','Estiramiento de dorsal','Dorsal ancho',['Flexibilidad'],'stretch','time',[['Standard','estándar']]],
['neck-stretch','Neck Stretch','Estiramiento de cuello','Trapecio',['Flexibilidad'],'stretch','time',[['Lateral','lateral'],['Forward','frontal']]],
['ankle-hop','Ankle Hop','Salto de tobillo','Gastrocnemio',['Potencia','Atletismo'],'plyo','reps',[['Standard','estándar']]],
['seated-jump','Seated Box Jump','Salto al cajón desde sentado','Cuerpo completo',['Potencia'],'plyo','reps',[['Standard','estándar']]],
['plank-to-push-up','Plank to Push-Up','Plancha a flexión','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar']]],
['dead-bug','Dead Bug','Dead bug','Abdomen',['Calistenia','Equilibrio'],'core','reps',[['Standard','estándar'],['Weighted','con peso']]],
['flutter-kick','Flutter Kick','Flutter kick','Abdomen',['Calistenia','Resistencia'],'core','time',[['Standard','estándar']]],
['scissor-kick','Scissor Kick','Scissor kick','Abdomen',['Calistenia'],'core','reps',[['Standard','estándar']]],
['copenhagen-plank','Copenhagen Plank','Plancha Copenhagen','Aductores',['Fuerza','Flexibilidad'],'core','time',[['Full','completa'],['Bent Knee','rodilla flexionada']]],
['nordic-hamstring-curl','Nordic Hamstring Curl','Curl nórdico de isquios asistido','Bíceps femoral',['Fuerza','Calistenia'],'curl','reps',[['Machine','en máquina'],['Assisted','asistido']]],
['banded-lateral-walk','Banded Lateral Walk','Paso lateral con banda','Glúteo medio',['Hipertrofia','Atletismo'],'lunge','reps',[['Standard','estándar']]],
['monster-walk','Monster Walk','Monster walk','Glúteo medio',['Hipertrofia'],'lunge','reps',[['Standard','estándar']]],
['single-leg-calf-raise','Single-Leg Calf Raise','Elevación de talón a una pierna','Gastrocnemio',['Hipertrofia','Equilibrio'],'calf','strength-bw',[['Bodyweight','con peso corporal'],['Weighted','con peso']]],
['seated-wrist-extension','Wrist Extension','Extensión de muñeca','Extensores del antebrazo',['Hipertrofia'],'extension','strength-abs',[['Barbell','con barra'],['Dumbbell','con mancuernas']]],
['towel-hang-swing','Towel Hang Swing','Balanceo colgado con toalla','Flexores del antebrazo',['Fuerza','Calistenia'],'carry','time',[['Standard','estándar']]],
['seated-calf-raise','Seated Calf Raise','Elevación de talones sentado','Sóleo',['Hipertrofia'],'calf','strength-bw',[['Machine','en máquina'],['Dumbbell','con mancuerna'],['Plate-Loaded','con discos']]],
['external-rotation','External Rotation','Rotación externa de hombro','Infraespinoso',['Hipertrofia','Fuerza'],'raise','strength-abs',[['Band','con banda'],['Cable','en polea'],['Dumbbell','con mancuerna'],['Side-Lying','tumbado de lado']]]
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
      const entry = {
        id: id + '__' + slugify(ven||'base'),
        baseId: id, en: fullEn, es: fullEs, muscle, objectives, pattern, scoreType,
        desc: info.desc(fullEs), steps: info.steps,
        secondary: info.secondary, mistakes: info.mistakes, tips: info.tips
      };
      entry.difficulty = exerciseDifficulty(entry);
      entry.equipment = exerciseEquipment(entry);
      list.push(entry);
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
