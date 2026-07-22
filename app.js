/* =========================================================
   app.js — lógica exclusiva de app.html (aplicación principal)
========================================================= */
let currentUser = null;
let account = null;
let mediaStore = null;
let pendingWorkoutMedia = null;

/* ---- Rutinas y sesión activa ---- */
let builderExercises = [];
let activeSession = null;
let sessionTimerInterval = null;
let sessionElapsedSeconds = 0;
let setTimerInterval = null;
let setElapsedSeconds = 0;
let activeSetRef = null;
let restTimerInterval = null;
let restElapsedSeconds = 0;
let restTimerRunning = false;
let sessionMediaTarget = null;

/* ---- Retos ---- */
const DAILY_CHALLENGE_POOL = [
  'Haz 50 flexiones repartidas como quieras a lo largo del día',
  'Completa tu objetivo de agua de hoy',
  'Completa tu objetivo de pasos de hoy',
  'Registra al menos una comida en Nutrición',
  'Aguanta una plancha de 2 minutos, repartida en series si hace falta',
  'Haz una serie extra con RIR 0-1 en tu ejercicio principal de hoy',
  'Añade una foto de progreso',
  'Registra tus horas de sueño de anoche',
  'Estírate 10 minutos al terminar de entrenar'
];
const TIER_META = [
  {tier:1, name:'Bronce',   color:'#a5672f'},
  {tier:2, name:'Plata',    color:'#9a9aa3'},
  {tier:3, name:'Oro',      color:'#d4af37'},
  {tier:4, name:'Platino',  color:'#6fd4c9'},
  {tier:5, name:'Diamante', color:'#7fb3ff'},
  {tier:6, name:'Leyenda',  color:'#c86fe0'},
];
function tierMeta(tier){ return TIER_META[Math.max(0,Math.min(TIER_META.length-1, tier-1))]; }
function tierXP(tier){ return tier*50; } // XP que otorga alcanzar ese nivel/rango
const CHALLENGE_DEFS = [
  { id:'pullup', name:'Dominadas', category:'Calistenia', levels:[
    {level:1,label:'1 dominada estricta'},{level:2,label:'5 dominadas seguidas'},{level:3,label:'10 dominadas seguidas'},
    {level:4,label:'15 dominadas seguidas'},{level:5,label:'20 dominadas seguidas'},{level:6,label:'25 dominadas seguidas (élite)'}
  ]},
  { id:'handstand', name:'Pino (handstand)', category:'Calistenia', levels:[
    {level:1,label:'10 segundos apoyado en la pared'},{level:2,label:'30 segundos apoyado en la pared'},{level:3,label:'10 segundos libre, sin apoyo'},
    {level:4,label:'60 segundos libre, sin apoyo'},{level:5,label:'90 segundos libre, sin apoyo'},{level:6,label:'5 press to handstand seguidos (élite)'}
  ]},
  { id:'squat', name:'Sentadilla con barra', category:'Fuerza', levels:[
    {level:1,label:'Levanta tu propio peso corporal'},{level:2,label:'Levanta 1.5x tu peso corporal'},{level:3,label:'Levanta 2x tu peso corporal'},
    {level:4,label:'Levanta 2.5x tu peso corporal'},{level:5,label:'Levanta 3x tu peso corporal'},{level:6,label:'Levanta 3.5x tu peso corporal (élite)'}
  ]},
  { id:'bench', name:'Press de banca', category:'Fuerza', levels:[
    {level:1,label:'Levanta 0.5x tu peso corporal'},{level:2,label:'Levanta 0.75x tu peso corporal'},{level:3,label:'Levanta 1x tu peso corporal'},
    {level:4,label:'Levanta 1.25x tu peso corporal'},{level:5,label:'Levanta 1.5x tu peso corporal'},{level:6,label:'Levanta 1.75x tu peso corporal (élite)'}
  ]},
  { id:'deadlift', name:'Peso muerto', category:'Fuerza', levels:[
    {level:1,label:'Levanta 1.25x tu peso corporal'},{level:2,label:'Levanta 1.75x tu peso corporal'},{level:3,label:'Levanta 2.25x tu peso corporal'},
    {level:4,label:'Levanta 2.75x tu peso corporal'},{level:5,label:'Levanta 3.25x tu peso corporal'},{level:6,label:'Levanta 3.75x tu peso corporal (élite)'}
  ]},
  { id:'plank', name:'Plancha', category:'Core', levels:[
    {level:1,label:'Aguanta 30 segundos'},{level:2,label:'Aguanta 1 minuto'},{level:3,label:'Aguanta 2 minutos'},
    {level:4,label:'Aguanta 3 minutos'},{level:5,label:'Aguanta 4 minutos'},{level:6,label:'Aguanta 5 minutos (élite)'}
  ]},
  { id:'dip', name:'Fondos en paralelas', category:'Calistenia', levels:[
    {level:1,label:'1 fondo estricto'},{level:2,label:'5 fondos seguidos'},{level:3,label:'10 fondos seguidos'},
    {level:4,label:'15 fondos seguidos'},{level:5,label:'20 fondos seguidos'},{level:6,label:'25 fondos seguidos (élite)'}
  ]},
  { id:'run5k', name:'Correr 5 km', category:'Cardio', levels:[
    {level:1,label:'Completa 5 km corriendo, sin importar el tiempo'},{level:2,label:'5 km en menos de 30 minutos'},{level:3,label:'5 km en menos de 25 minutos'},
    {level:4,label:'5 km en menos de 22 minutos'},{level:5,label:'5 km en menos de 20 minutos'},{level:6,label:'5 km en menos de 18 minutos (élite)'}
  ]},
  { id:'burpees', name:'Burpees', category:'Cardio', levels:[
    {level:1,label:'10 burpees seguidos'},{level:2,label:'25 burpees seguidos'},{level:3,label:'50 burpees seguidos'},
    {level:4,label:'75 burpees seguidos'},{level:5,label:'100 burpees seguidos'},{level:6,label:'150 burpees seguidos (élite)'}
  ]},
  { id:'deadhang', name:'Dead hang (colgarse de la barra)', category:'Calistenia', levels:[
    {level:1,label:'Aguanta 10 segundos'},{level:2,label:'Aguanta 30 segundos'},{level:3,label:'Aguanta 60 segundos'},
    {level:4,label:'Aguanta 90 segundos'},{level:5,label:'Aguanta 120 segundos'},{level:6,label:'Aguanta 180 segundos (élite)'}
  ]},
  { id:'pistolsquat', name:'Pistol squat (sentadilla a una pierna)', category:'Equilibrio', levels:[
    {level:1,label:'1 repetición asistida (con apoyo)'},{level:2,label:'1 repetición completa sin apoyo'},{level:3,label:'3 repeticiones por pierna'},
    {level:4,label:'6 repeticiones por pierna'},{level:5,label:'10 repeticiones por pierna'},{level:6,label:'15 repeticiones por pierna (élite)'}
  ]},
  { id:'lsit', name:'L-sit', category:'Core', levels:[
    {level:1,label:'Aguanta 5 segundos'},{level:2,label:'Aguanta 10 segundos'},{level:3,label:'Aguanta 20 segundos'},
    {level:4,label:'Aguanta 30 segundos'},{level:5,label:'Aguanta 45 segundos'},{level:6,label:'Aguanta 60 segundos (élite)'}
  ]},
  { id:'verticaljump', name:'Salto vertical', category:'Potencia', levels:[
    {level:1,label:'Alcanza 30 cm de salto'},{level:2,label:'Alcanza 40 cm de salto'},{level:3,label:'Alcanza 50 cm de salto'},
    {level:4,label:'Alcanza 60 cm de salto'},{level:5,label:'Alcanza 70 cm de salto'},{level:6,label:'Alcanza 80 cm de salto (élite)'}
  ]},
  { id:'hipmobility', name:'Sentadilla profunda (ATG)', category:'Movilidad', levels:[
    {level:1,label:'Mantén la posición 10 segundos con talones apoyados'},{level:2,label:'Mantén la posición 30 segundos'},{level:3,label:'Mantén la posición 1 minuto'},
    {level:4,label:'Mantén la posición 2 minutos'},{level:5,label:'Mantén la posición 3 minutos'},{level:6,label:'Mantén la posición 5 minutos (élite)'}
  ]},
  { id:'cycling20k', name:'Pedalear 20 km', category:'Resistencia', levels:[
    {level:1,label:'Completa 20 km en bici, sin importar el tiempo'},{level:2,label:'20 km en menos de 60 minutos'},{level:3,label:'20 km en menos de 50 minutos'},
    {level:4,label:'20 km en menos de 45 minutos'},{level:5,label:'20 km en menos de 40 minutos'},{level:6,label:'20 km en menos de 35 minutos (élite)'}
  ]},
  { id:'swim500', name:'Nadar 500 metros', category:'Natación', levels:[
    {level:1,label:'Completa 500 m nadando, sin importar el tiempo'},{level:2,label:'500 m en menos de 15 minutos'},{level:3,label:'500 m en menos de 12 minutos'},
    {level:4,label:'500 m en menos de 10 minutos'},{level:5,label:'500 m en menos de 9 minutos'},{level:6,label:'500 m en menos de 8 minutos (élite)'}
  ]},
  { id:'militarypress', name:'Press militar (overhead press)', category:'Fuerza', levels:[
    {level:1,label:'Levanta 0.4x tu peso corporal'},{level:2,label:'Levanta 0.55x tu peso corporal'},{level:3,label:'Levanta 0.7x tu peso corporal'},
    {level:4,label:'Levanta 0.85x tu peso corporal'},{level:5,label:'Levanta 1x tu peso corporal'},{level:6,label:'Levanta 1.2x tu peso corporal (élite)'}
  ]},
  { id:'weightedpullup', name:'Dominadas lastradas', category:'Fuerza', levels:[
    {level:1,label:'Añade un 10% de tu peso corporal'},{level:2,label:'Añade un 25% de tu peso corporal'},{level:3,label:'Añade un 40% de tu peso corporal'},
    {level:4,label:'Añade un 55% de tu peso corporal'},{level:5,label:'Añade un 70% de tu peso corporal'},{level:6,label:'Añade un 85% de tu peso corporal (élite)'}
  ]},
];
function challengeLevelLabel(def, level){
  const item = def.levels.find(l=>l.level===level);
  if(!item) return item;
  if(!account || !account.profile || !account.profile.weightKg) return item.label;
  const w = account.profile.weightKg;
  const map = {
    squat:{1:1,2:1.5,3:2,4:2.5,5:3,6:3.5},
    bench:{1:0.5,2:0.75,3:1,4:1.25,5:1.5,6:1.75},
    deadlift:{1:1.25,2:1.75,3:2.25,4:2.75,5:3.25,6:3.75},
    militarypress:{1:0.4,2:0.55,3:0.7,4:0.85,5:1,6:1.2},
    weightedpullup:{1:0.1,2:0.25,3:0.4,4:0.55,5:0.7,6:0.85}
  };
  if(map[def.id] && map[def.id][level]){
    const target = (w*map[def.id][level]).toFixed(0);
    return `${item.label} (~${target} kg)`;
  }
  return item.label;
}

/* =========================================================
   SISTEMA DE XP Y RANGO GLOBAL DE RETOS
========================================================= */
function computeChallengeXP(accObj){
  const acc = accObj || account;
  if(!acc) return 0;
  let xp = 0;
  const levels = (acc.challenges && acc.challenges.levels) || {};
  Object.entries(levels).forEach(([id, lvl])=>{
    for(let l=1; l<=lvl; l++) xp += tierXP(l);
  });
  (acc.customChallenges||[]).forEach(c=>{ if(c.completed) xp += tierXP(c.difficulty||3); });
  const streak = computeDailyChallengeStreak(acc);
  xp += Math.min(streak, 60) * 5; // hasta 300 XP de bonus por racha diaria
  return xp;
}
const RANK_THRESHOLDS = [
  {name:'Bronce', min:0, color:'#a5672f'},
  {name:'Plata', min:300, color:'#9a9aa3'},
  {name:'Oro', min:800, color:'#d4af37'},
  {name:'Platino', min:1500, color:'#6fd4c9'},
  {name:'Diamante', min:2500, color:'#7fb3ff'},
  {name:'Leyenda', min:4000, color:'#c86fe0'},
];
function getRankForXP(xp){
  let current = RANK_THRESHOLDS[0], next = RANK_THRESHOLDS[1];
  for(let i=0;i<RANK_THRESHOLDS.length;i++){
    if(xp >= RANK_THRESHOLDS[i].min){ current = RANK_THRESHOLDS[i]; next = RANK_THRESHOLDS[i+1] || null; }
  }
  return { current, next };
}
function renderChallengeRankCard(){
  const el = document.getElementById('challengeRankCard');
  if(!el || !account) return;
  const xp = computeChallengeXP();
  const { current, next } = getRankForXP(xp);
  const pct = next ? Math.min(100, ((xp-current.min)/(next.min-current.min))*100) : 100;
  el.innerHTML = `
    <div class="rank-hero">
      <div class="rank-hero-badge" style="border-color:${current.color}; color:${current.color};">${iconFilled(rankIconName(current.name),24)}</div>
      <div style="flex:1; min-width:180px;">
        <h2 style="margin:0;">Rango: <span style="color:${current.color};">${current.name}</span></h2>
        <p class="muted" style="margin:2px 0 8px;">${xp} XP acumulados${next?` · ${next.min-xp} XP para ${next.name}`:' · Rango máximo alcanzado'}</p>
        <div class="progress-track"><div class="progress-fill ${!next?'complete':''}" style="width:${pct}%; background:${current.color};"></div></div>
      </div>
    </div>
  `;
}

function renderChallengeCategoryFilter(){
  const el = document.getElementById('challengeCategoryFilter');
  if(!el) return;
  const categories = ['Todas', ...new Set(CHALLENGE_DEFS.map(c=>c.category))];
  el.innerHTML = categories.map(cat=>`<button class="chip-filter ${(challengeCategoryFilter===cat)?'active':''}" onclick="setChallengeCategoryFilter('${cat}')">${escapeHTML(cat)}</button>`).join('');
}
let challengeCategoryFilter = 'Todas';
function setChallengeCategoryFilter(cat){ challengeCategoryFilter = cat; renderChallengeCategoryFilter(); renderMilestoneChallenges(); }

/* =========================================================
   NAVEGACIÓN (sidebar de escritorio + barra inferior móvil)
========================================================= */
const TAB_TITLES = { dashboard:'Panel', calculators:'Calculadoras', training:'Entrenamiento', health:'Salud', progress:'Progreso', community:'Comunidad', ranking:'Ranking', settings:'Ajustes' };

async function refreshFromRemote(){
  if(!isGithubMode() || !currentUser) return;
  try{
    const accCol = await collectionFetchFresh('accounts', {});
    if(accCol[currentUser]){ account = ensureAccountShape(accCol[currentUser]); }
    mediaStore = await fetchMediaStoreFor(currentUser);
  }catch(e){ /* si falla, seguimos con los datos que ya teníamos en memoria */ }
}

async function showTab(name){
  await refreshFromRemote();
  document.querySelectorAll('.side-link[data-tab]').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  const moreTabs = ['calculators','health','ranking','settings'];
  document.querySelectorAll('.mobile-nav-item[data-tab]').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===name || (b.dataset.tab==='more' && moreTabs.includes(name)));
  });
  document.querySelectorAll('.sheet-item[data-tab]').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-'+name));
  document.getElementById('pageTitle').textContent = TAB_TITLES[name] || '';
  if(name==='dashboard') renderDashboard();
  if(name==='training'){ renderWorkouts(); renderPRBoard(); renderExerciseDatalist(); renderTemplateList(); renderActiveSession(); }
  if(name==='health'){ renderNutrition(); renderSteps(); renderSleep(); }
  if(name==='progress'){ renderMeasurements(); renderGoals(); renderAchievements(); renderPhotoGallery(); renderDailyChallenge(); renderChallengeRankCard(); renderChallengeCategoryFilter(); renderMilestoneChallenges(); renderCustomChallenges(); }
  if(name==='community'){ loadCommunityFeed(); refreshDmUnreadIndicator(); refreshNotifUnreadIndicator(); }
  if(name==='ranking') loadRanking();
  if(name==='calculators') renderPlateInventoryForm();
  if(name==='settings'){
    updateSettingsStatusIndicator(); renderProfile(); renderProfileFields(); renderAccessibilitySettings();
    const lbl=document.getElementById('currentUsernameLabel'); if(lbl) lbl.textContent = currentUser;
    const lbl2=document.getElementById('currentUsernameLabel2'); if(lbl2) lbl2.textContent = currentUser;
    const miniAv = document.getElementById('settingsMiniAvatar');
    if(miniAv && mediaStore && mediaStore.avatar) miniAv.innerHTML = `<img src="${mediaStore.avatar}" alt="">`;
  }
}
async function showSub(name){
  await refreshFromRemote();
  const panel = document.querySelector('.tab-panel.active');
  panel.querySelectorAll('.subtab-btn').forEach(b=>b.classList.toggle('active', b.dataset.sub===name));
  panel.querySelectorAll('.sub-panel').forEach(p=>p.classList.toggle('active', p.id==='sub-'+name));
  if(name==='calc-plates') renderPlateInventoryForm();
  if(name==='calc-progression') {}
  if(name==='pr-photos') renderPhotoGallery();
  if(name==='tr-log') renderWorkouts();
  if(name==='tr-pr') renderPRBoard();
  if(name==='tr-compare') renderExerciseDatalist();
  if(name==='tr-routines'){ renderBuilderExercises(); renderTemplateList(); renderActiveSession(); }
  if(name==='pr-challenges'){ renderDailyChallenge(); renderMilestoneChallenges(); renderCustomChallenges(); }
  if(name==='set-username'){ document.getElementById('currentUsernameLabel').textContent = currentUser; }
  if(name==='comm-feed') loadCommunityFeed();
  if(name==='comm-profiles') loadCommunity();
  if(name==='comm-messages') loadDmInbox();
  if(name==='comm-notifications') loadNotifications();
  if(name==='tr-plan'){ renderPlanList(); renderTodayPlanCard(); if(!document.getElementById('planDaysBuilder').children.length) addPlanSplitDay(); }
}
function renderAll(){
  renderDashboard(); renderWorkouts(); renderPRBoard(); renderMeasurements(); renderGoals();
  renderAchievements(); renderWaterWidget(); renderPlateInventoryForm(); renderPhotoGallery();
  renderProfile(); renderProfileFields(); renderNutrition(); renderSteps(); renderSleep(); renderExerciseDatalist();
  renderTemplateList(); renderActiveSession(); renderDailyChallenge(); renderMilestoneChallenges(); renderCustomChallenges();
}

/* =========================================================
   SESIÓN Y ARRANQUE
========================================================= */
async function logout(){
  await clearSession();
  window.location.href = 'index.html';
}
async function saveAccount(){ await persistAccountObj(currentUser, account); }

async function enterApp(){
  document.getElementById('userChip').innerHTML = icon('user',14) + ` ${escapeHTML(currentUser)}`;
  applyTheme(account.theme || 'dark');
  document.getElementById('themeToggle').checked = (account.theme === 'light');
  document.getElementById('themeToggle2').checked = (account.theme === 'light');
  document.getElementById('wkDate').value = todayStr();
  document.getElementById('planStartDate').value = todayStr();
  document.getElementById('mDate').value = todayStr();
  document.getElementById('photoDate').value = todayStr();
  document.getElementById('nutDate').value = todayStr();
  document.getElementById('sleepDate').value = todayStr();
  updateSettingsStatusIndicator();
  await showTab('dashboard');
  renderAll();
  applyAccessibilitySettings();
  document.getElementById('appScreen').classList.remove('hidden');
  refreshDmUnreadIndicator();
  refreshNotifUnreadIndicator();
}

(async function initApp(){
  await loadGithubConfigFromStorage();
  const session = await getSession();
  if(!session || !session.username){ window.location.href = 'index.html'; return; }
  currentUser = session.username;
  try{
    const acc = await fetchAccount(currentUser);
    if(!acc){ await clearSession(); window.location.href = 'index.html'; return; }
    account = ensureAccountShape(acc);
    mediaStore = await fetchMediaStoreFor(currentUser);
  }catch(e){
    toast('Error al cargar tu cuenta: ' + e.message, 'error');
  }
  resetTimer();
  await enterApp();
})();

/* =========================================================
   TEMA
========================================================= */
async function toggleTheme(){
  const on = !document.body.classList.contains('theme-light');
  applyTheme(on ? 'light' : 'dark');
  document.getElementById('themeToggle').checked = on;
  document.getElementById('themeToggle2').checked = on;
  if(account){ account.theme = on ? 'light' : 'dark'; await saveAccount(); }
}

/* =========================================================
   ACCESIBILIDAD: tamaño de texto, contraste, movimiento, objetivos táctiles
========================================================= */
function applyAccessibilitySettings(){
  const a11y = (account && account.settings && account.settings.accessibility) || { fontScale:'normal', highContrast:false, reduceMotion:false, largeTargets:false };
  const body = document.body;
  body.classList.remove('a11y-text-large', 'a11y-text-xlarge');
  if(a11y.fontScale==='large') body.classList.add('a11y-text-large');
  if(a11y.fontScale==='xlarge') body.classList.add('a11y-text-xlarge');
  body.classList.toggle('a11y-high-contrast', !!a11y.highContrast);
  body.classList.toggle('a11y-reduce-motion', !!a11y.reduceMotion);
  body.classList.toggle('a11y-large-targets', !!a11y.largeTargets);
}
function renderAccessibilitySettings(){
  if(!account) return;
  const a11y = account.settings.accessibility || { fontScale:'normal', highContrast:false, reduceMotion:false, largeTargets:false };
  const fs = document.getElementById('a11yFontScale'); if(fs) fs.value = a11y.fontScale || 'normal';
  const hc = document.getElementById('a11yHighContrast'); if(hc) hc.checked = !!a11y.highContrast;
  const rm = document.getElementById('a11yReduceMotion'); if(rm) rm.checked = !!a11y.reduceMotion;
  const lt = document.getElementById('a11yLargeTargets'); if(lt) lt.checked = !!a11y.largeTargets;
}
async function updateAccessibilitySetting(key, value){
  account.settings = account.settings || {};
  account.settings.accessibility = account.settings.accessibility || {};
  account.settings.accessibility[key] = value;
  applyAccessibilitySettings();
  try{ await saveAccount(); }catch(e){ toast('Error al guardar: ' + e.message, 'error'); }
}

/* =========================================================
   ESTADO GITHUB (en ajustes)
========================================================= */
function updateSettingsStatusIndicator(){
  const on = isGithubMode();
  const dot = document.getElementById('settingsStatusDot');
  const text = document.getElementById('settingsStatusText');
  if(dot) dot.className = 'status-dot ' + (on?'on':'off');
  if(text) text.textContent = on ? `Conectado a ${githubConfig.owner}/${githubConfig.repo} (${githubConfig.branch})` : 'Modo local (solo en este dispositivo)';
  const summary = document.getElementById('ghSettingsSummary');
  if(summary){
    summary.textContent = on
      ? `Carpeta: ${githubConfig.basePath || 'data/'} · Última sincronización: ${lastSyncTime ? lastSyncTime.toLocaleTimeString('es-ES') : 'aún no'}`
      : 'No hay ningún repositorio conectado. Los datos solo se guardan en este dispositivo.';
  }
  const syncChip = document.getElementById('syncChip');
  if(syncChip) syncChip.textContent = on ? `GitHub: ${githubConfig.repo}` : 'Modo local';
}
async function syncNow(){
  if(!isGithubMode()){ toast('No hay ningún repositorio conectado.', 'error'); return; }
  try{
    await refreshFromRemote();
    renderAll();
    updateSettingsStatusIndicator();
    toast('Sincronizado con GitHub.');
  }catch(e){ toast('Error al sincronizar: ' + e.message, 'error'); }
}
function goEditConnection(){ window.location.href = 'index.html'; }

/* =========================================================
   PERFIL: FOTO Y DATOS PÚBLICOS
========================================================= */
function renderProfile(){
  if(!account) return;
  const avatar = mediaStore && mediaStore.avatar;
  const preview = document.getElementById('avatarPreview');
  if(preview) preview.innerHTML = avatar ? `<img src="${avatar}" alt="Foto de perfil">` : icon('user', 26);
  const chip = document.getElementById('userChip');
  if(chip){ chip.innerHTML = (avatar ? `<img class="avatar-sm" src="${avatar}" alt="">` : icon('user', 14)) + ` ${escapeHTML(currentUser)}`; }
  const coverPreview = document.getElementById('coverPreview');
  if(coverPreview) coverPreview.innerHTML = (mediaStore && mediaStore.cover) ? `<img src="${mediaStore.cover}" alt="Portada">` : '<p class="muted">Sin portada todavía.</p>';
}
async function uploadAvatar(event){
  const file = event.target.files[0];
  if(!file) return;
  try{
    const dataUrl = await resizeImageFile(file, 260, 0.78);
    mediaStore.avatar = dataUrl;
    await persistMediaStoreFor(currentUser, mediaStore);
    renderProfile();
    toast('Foto de perfil actualizada.');
  }catch(e){ toast('No se pudo procesar la imagen: ' + e.message, 'error'); }
  event.target.value = '';
}
async function removeAvatar(){
  mediaStore.avatar = null;
  try{ await persistMediaStoreFor(currentUser, mediaStore); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderProfile();
  toast('Foto de perfil eliminada.');
}
async function uploadCoverPhoto(event){
  const file = event.target.files[0];
  if(!file) return;
  try{
    const dataUrl = await resizeImageFile(file, 1200, 0.75);
    mediaStore.cover = dataUrl;
    await persistMediaStoreFor(currentUser, mediaStore);
    renderProfile();
    toast('Portada actualizada.');
  }catch(e){ toast('No se pudo procesar la imagen: ' + e.message, 'error'); }
  event.target.value = '';
}
async function removeCoverPhoto(){
  mediaStore.cover = null;
  try{ await persistMediaStoreFor(currentUser, mediaStore); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderProfile();
  toast('Portada eliminada.');
}
function renderProfileFields(){
  if(!account) return;
  const p = account.profile || {};
  document.getElementById('profileAge').value = p.age ?? '';
  document.getElementById('profileHeight').value = p.heightCm ?? '';
  document.getElementById('profileWeight').value = p.weightKg ?? '';
  document.getElementById('profileBio').value = p.bio || '';
  document.getElementById('profilePublicToggle').checked = p.isPublic !== false;
}
async function saveProfileFields(){
  account.profile = account.profile || {};
  account.profile.age = parseInt(document.getElementById('profileAge').value) || null;
  account.profile.heightCm = parseFloat(document.getElementById('profileHeight').value) || null;
  account.profile.weightKg = parseFloat(document.getElementById('profileWeight').value) || null;
  account.profile.bio = document.getElementById('profileBio').value.trim();
  try{ await saveAccount(); toast('Datos de perfil guardados.'); }catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function toggleProfilePublic(){
  account.profile = account.profile || {};
  account.profile.isPublic = document.getElementById('profilePublicToggle').checked;
  try{ await saveAccount(); toast(account.profile.isPublic ? 'Tu perfil ahora es público.' : 'Tu perfil ahora es privado.'); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* =========================================================
   CÁMARA: fotos y vídeos capturados en el momento
========================================================= */
let cameraStream = null;
let cameraContext = null; // 'avatar' | 'progressPhoto' | 'workoutMedia'
let cameraFacingMode = 'environment';
let cameraAllowAudio = false;
let mediaRecorderRef = null;
let recordedChunks = [];
let recordingTimerHandle = null;
let recordingSeconds = 0;

async function openCameraModal(context, allowVideo){
  cameraContext = context;
  cameraAllowAudio = !!allowVideo;
  cameraFacingMode = context==='avatar' ? 'user' : 'environment';
  document.getElementById('cameraVideoBtn').classList.toggle('hidden', !allowVideo);
  document.getElementById('cameraModal').classList.add('open');
  await startCameraStream();
}
async function startCameraStream(){
  if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream = null; }
  try{
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cameraFacingMode }, width:{ideal:1280}, height:{ideal:720} },
      audio: cameraAllowAudio
    });
    document.getElementById('cameraPreview').srcObject = cameraStream;
  }catch(e){
    toast('No se pudo acceder a la cámara: ' + e.message, 'error');
    closeCameraModal();
  }
}
async function switchCameraFacing(){
  cameraFacingMode = cameraFacingMode==='user' ? 'environment' : 'user';
  const btn = document.getElementById('cameraSwitchBtn');
  if(btn) btn.disabled = true;
  await startCameraStream();
  if(btn) btn.disabled = false;
}
function closeCameraModal(){
  if(mediaRecorderRef && mediaRecorderRef.state==='recording'){ try{ mediaRecorderRef.stop(); }catch(e){} }
  if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream = null; }
  clearInterval(recordingTimerHandle);
  document.getElementById('cameraTimer').textContent = '';
  document.getElementById('cameraVideoBtn').textContent = 'Grabar vídeo';
  document.getElementById('cameraModal').classList.remove('open');
}
async function takeCameraPhoto(){
  const video = document.getElementById('cameraPreview');
  const canvas = document.getElementById('cameraCanvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
  closeCameraModal();
  await handleCapturedMedia('image', dataUrl);
}
function toggleCameraVideoRecording(){
  const btn = document.getElementById('cameraVideoBtn');
  if(mediaRecorderRef && mediaRecorderRef.state==='recording'){ mediaRecorderRef.stop(); return; }
  recordedChunks = [];
  try{ mediaRecorderRef = new MediaRecorder(cameraStream, { mimeType:'video/webm' }); }
  catch(e){ toast('Grabación de vídeo no soportada en este navegador.', 'error'); return; }
  mediaRecorderRef.ondataavailable = (e)=>{ if(e.data.size>0) recordedChunks.push(e.data); };
  mediaRecorderRef.onstop = async ()=>{
    clearInterval(recordingTimerHandle);
    document.getElementById('cameraTimer').textContent = '';
    btn.textContent = 'Grabar vídeo';
    const blob = new Blob(recordedChunks, { type:'video/webm' });
    if(blob.size > MAX_VIDEO_BYTES){
      toast('El vídeo grabado supera los 20 MB permitidos. Graba un clip más corto o usa un enlace de vídeo.', 'error');
      closeCameraModal();
      return;
    }
    const dataUrl = await new Promise((resolve)=>{ const r = new FileReader(); r.onload = ()=>resolve(r.result); r.readAsDataURL(blob); });
    closeCameraModal();
    await handleCapturedMedia('video', dataUrl);
  };
  mediaRecorderRef.start();
  btn.textContent = 'Detener grabación';
  recordingSeconds = 0;
  document.getElementById('cameraTimer').textContent = '0:00 / 3:00';
  recordingTimerHandle = setInterval(()=>{
    recordingSeconds++;
    const m = Math.floor(recordingSeconds/60), s = recordingSeconds%60;
    document.getElementById('cameraTimer').textContent = `${m}:${String(s).padStart(2,'0')} / 3:00`;
    if(recordingSeconds >= MAX_RECORD_SECONDS){ mediaRecorderRef.stop(); }
  }, 1000);
}
async function handleCapturedMedia(type, dataUrl){
  if(cameraContext==='avatar'){
    mediaStore.avatar = dataUrl;
    try{ await persistMediaStoreFor(currentUser, mediaStore); renderProfile(); toast('Foto de perfil actualizada.'); }
    catch(e){ toast('Error: ' + e.message, 'error'); }
  } else if(cameraContext==='cover'){
    mediaStore.cover = dataUrl;
    try{ await persistMediaStoreFor(currentUser, mediaStore); renderProfile(); toast('Portada actualizada.'); }
    catch(e){ toast('Error: ' + e.message, 'error'); }
  } else if(cameraContext==='progressPhoto'){
    const date = document.getElementById('photoDate').value || todayStr();
    const note = document.getElementById('photoNote').value.trim();
    mediaStore.progressPhotos = mediaStore.progressPhotos || [];
    mediaStore.progressPhotos.push({ id: Date.now(), date, note, dataUrl });
    try{ await persistMediaStoreFor(currentUser, mediaStore); renderPhotoGallery(); toast('Foto de progreso guardada.'); }
    catch(e){ toast('Error: ' + e.message, 'error'); }
  } else if(cameraContext==='workoutMedia'){
    pendingWorkoutMedia = { type, dataUrl };
    renderPendingWorkoutMediaPreview();
    toast('Adjunto listo. Guarda la sesión para asociarlo.');
  } else if(cameraContext==='sessionSet'){
    await attachSessionSetMedia({ type, dataUrl });
  } else if(cameraContext==='post'){
    stagedPostImage = dataUrl;
    renderStagedPostImage();
  } else if(cameraContext==='story'){
    stagedStoryImage = dataUrl;
    renderStagedStoryImage();
  }
}

/* =========================================================
   ESTILO COMPARTIDO DE GRÁFICAS (Chart.js)
========================================================= */
function chartColors(){
  const styles = getComputedStyle(document.body);
  return {
    gold: styles.getPropertyValue('--gold').trim() || '#d4af37',
    text: styles.getPropertyValue('--text-dim').trim() || '#8b8b95',
    border: styles.getPropertyValue('--border').trim() || '#2a2a33',
    panel: styles.getPropertyValue('--panel-alt').trim() || '#1e1e26'
  };
}
function barChartConfig(labels, data, unitLabel){
  const c = chartColors();
  return {
    type:'bar',
    data:{ labels: labels.length?labels:['Sin datos'], datasets:[{ data: data.length?data:[0], backgroundColor: c.gold, borderRadius:6, maxBarThickness:30, borderSkipped:false }] },
    options:{
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{display:false}, tooltip:{ backgroundColor:c.panel, titleColor:c.text, bodyColor:c.text, borderColor:c.border, borderWidth:1, padding:8, callbacks:{ label:(ctx)=> `${ctx.parsed.y} ${unitLabel||''}`.trim() } } },
      scales:{
        x:{ grid:{display:false}, ticks:{ color:c.text, font:{size:10} } },
        y:{ beginAtZero:true, grid:{ color:c.border }, ticks:{ color:c.text, font:{size:10} } }
      }
    }
  };
}
function lineChartConfig(labels, data, label, suggestedMax){
  const c = chartColors();
  return {
    type:'line',
    data:{ labels: labels.length?labels:['Sin datos'], datasets:[{
      label, data: data.length?data:[0], borderColor:c.gold, backgroundColor:'rgba(212,175,55,0.14)',
      borderWidth:2.5, fill:true, tension:0.35, pointRadius:3, pointHoverRadius:5,
      pointBackgroundColor:c.gold, pointBorderColor:c.gold, spanGaps:true
    }] },
    options:{
      responsive:true,
      plugins:{ legend:{display:false}, tooltip:{ backgroundColor:c.panel, titleColor:c.text, bodyColor:c.text, borderColor:c.border, borderWidth:1, padding:8 } },
      scales:{
        x:{ grid:{display:false}, ticks:{ color:c.text, font:{size:10}, display: labels.length<=15 } },
        y:{ beginAtZero:true, suggestedMax, grid:{ color:c.border }, ticks:{ color:c.text, font:{size:10} } }
      }
    }
  };
}

/* =========================================================
   FÓRMULAS: 1RM (Epley, unificada), WILKS, DOTS
========================================================= */
function epley1RM(weight, reps){ return parseFloat((weight*(1+reps/30)).toFixed(1)); }
function calculate1RM(weight, reps){ if(reps<1 || reps>30) return null; return epley1RM(weight, reps); }
function wilksScoreCalc(gender, bodyWeight, total){
  const coeff = {
    male:[-216.0475144,16.2606339,-0.002388645,-0.00113732,7.01863E-06,-1.291E-08],
    female:[594.31747775582,-27.23842536447,0.82112226871,-0.00930733913,4.731582E-05,-9.054E-08]
  }[gender];
  const denom = coeff[0]+coeff[1]*bodyWeight+coeff[2]*Math.pow(bodyWeight,2)+coeff[3]*Math.pow(bodyWeight,3)+coeff[4]*Math.pow(bodyWeight,4)+coeff[5]*Math.pow(bodyWeight,5);
  return (total*500)/denom;
}
function dotsScoreCalc(gender, bodyWeightRaw, total){
  let bw = bodyWeightRaw;
  let denom;
  if(gender==='male'){
    bw = Math.min(Math.max(bw,40),210);
    denom = -307.75076 + 24.0900756*bw - 0.1918759221*Math.pow(bw,2) + 0.0007391293*Math.pow(bw,3) - 0.000001093*Math.pow(bw,4);
  } else {
    bw = Math.min(Math.max(bw,40),150);
    denom = -57.96288 + 13.6175032*bw - 0.1126655495*Math.pow(bw,2) + 0.0005158568*Math.pow(bw,3) - 0.0000010706*Math.pow(bw,4);
  }
  return (total*500)/denom;
}
function wilksLevel(score){
  if(score<120) return 'N/A';
  if(score<200) return 'Principiante';
  if(score<238) return 'Novato';
  if(score<326) return 'Intermedio';
  if(score<414) return 'Avanzado';
  return 'Élite';
}
async function calculateWilks(){
  const gender = document.getElementById('gender').value;
  const bodyWeight = parseFloat(document.getElementById('bodyWeight').value);
  const benchPress = parseFloat(document.getElementById('benchPress').value);
  const benchReps = parseFloat(document.getElementById('benchReps').value);
  const squat = parseFloat(document.getElementById('squat').value);
  const squatReps = parseFloat(document.getElementById('squatReps').value);
  const deadlift = parseFloat(document.getElementById('deadlift').value);
  const deadliftReps = parseFloat(document.getElementById('deadliftReps').value);
  if([bodyWeight,benchPress,benchReps,squat,squatReps,deadlift,deadliftReps].some(v=>isNaN(v))){ toast('Completa todos los campos.', 'error'); return; }
  const bench1RM = calculate1RM(benchPress, benchReps);
  const squat1RM = calculate1RM(squat, squatReps);
  const deadlift1RM = calculate1RM(deadlift, deadliftReps);
  if(bench1RM===null || squat1RM===null || deadlift1RM===null){ toast('Las repeticiones deben estar entre 1 y 30.', 'error'); return; }
  const total1RM = bench1RM + squat1RM + deadlift1RM;
  const wilksScore = wilksScoreCalc(gender, bodyWeight, total1RM);
  const dotsScore = dotsScoreCalc(gender, bodyWeight, total1RM);
  const level = wilksLevel(wilksScore);
  document.getElementById('result').classList.remove('hidden');
  document.getElementById('result').innerHTML = `
    <p>Puntaje de Wilks: <span class="wilks-score">${wilksScore.toFixed(2)}</span> (${level})</p>
    <p>Puntaje DOTS: <span class="wilks-score">${dotsScore.toFixed(2)}</span></p>
    <p>Total estimado (1RM): <span class="wilks-score">${total1RM.toFixed(1)} kg</span></p>
    <p class="muted">1RM estimado con la fórmula de Epley: peso × (1 + reps/30). Mayor precisión en series de 1 a 10 repeticiones.</p>
  `;
  account.history.push({ date: new Date().toLocaleString('es-ES'), gender, bodyWeight, benchPress, benchReps, squat, squatReps, deadlift, deadliftReps, wilksScore, dotsScore, level, total1RM });
  try{ await saveAccount(); await updateRanking(); toast('Cálculo guardado y sincronizado.'); }
  catch(e){ toast('Se guardó localmente pero falló la sincronización: ' + e.message, 'error'); }
  renderDashboard();
}
function resetForm(){ document.getElementById('wilksForm').reset(); document.getElementById('result').classList.add('hidden'); }
function calcStandalone1RM(){
  const w = parseFloat(document.getElementById('rmWeight').value);
  const r = parseFloat(document.getElementById('rmReps').value);
  if(isNaN(w) || isNaN(r)){ toast('Completa peso y repeticiones.', 'error'); return; }
  const rm = calculate1RM(w, r);
  if(rm===null){ toast('Las repeticiones deben estar entre 1 y 30.', 'error'); return; }
  document.getElementById('rmResult').classList.remove('hidden');
  document.getElementById('rmResult').innerHTML = `<p>1RM estimado: <span class="wilks-score">${rm} kg</span></p><p class="muted">Fórmula de Epley: peso × (1 + reps/30).</p>`;
  const pcts = [50,60,65,70,75,80,85,90,95,100];
  let rows = pcts.map(p=>`<tr><td>${p}%</td><td>${(rm*p/100).toFixed(1)} kg</td></tr>`).join('');
  document.getElementById('rmTable').innerHTML = `<h3>Tabla de porcentajes</h3><table><thead><tr><th>% de 1RM</th><th>Peso</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* =========================================================
   DISCOS (vista de perfil / lateral)
========================================================= */
const PLATE_SIZES = ["25","20","15","10","5","2.5","1.25","0.5"];
const PLATE_META = {
  25:{color:'#161616', edge:'#000000', ring:'#c62d2d', diameter:78, thickness:26, label:'#c62d2d'},
  20:{color:'#161616', edge:'#000000', ring:'#2f6fd1', diameter:70, thickness:23, label:'#4d8ce8'},
  15:{color:'#18170f', edge:'#000000', ring:'#e0c23a', diameter:63, thickness:20, label:'#e0c23a'},
  10:{color:'#101610', edge:'#000000', ring:'#3fa35f', diameter:55, thickness:18, label:'#4fb872'},
  5:{color:'#1c1c1c',  edge:'#000000', ring:'#eceae4', diameter:46, thickness:14, label:'#eceae4'},
  2.5:{color:'#161616', edge:'#000000', ring:'#8a8a92', diameter:38, thickness:11, label:'#a5a5ad'},
  1.25:{color:'#161616', edge:'#000000', ring:'#b58a2e', diameter:31, thickness:9,  label:'#c9a24a'},
  0.5:{color:'#161616',  edge:'#000000', ring:'#5f5f66', diameter:25, thickness:7,  label:'#84848c'}
};
function renderPlateInventoryForm(){
  const el = document.getElementById('plateInventoryForm');
  if(!el || !account) return;
  const inv = account.settings.plateInventory || defaultPlateInventory();
  el.innerHTML = PLATE_SIZES.map(size=>{
    const cfg = inv[size] || {enabled:false, count:''};
    const meta = PLATE_META[size];
    return `
      <div class="plate-inv-row">
        <input type="checkbox" id="plateEnabled-${size}" ${cfg.enabled?'checked':''}>
        <div class="plate-swatch" style="background:${meta.color}; box-shadow: inset 0 0 0 2px ${meta.ring};"></div>
        <label for="plateEnabled-${size}">${size} kg</label>
        <input type="number" id="plateCount-${size}" placeholder="Cantidad por lado (ilimitado)" value="${cfg.count ?? ''}" min="0">
      </div>
    `;
  }).join('');
}
async function savePlateInventory(){
  const inv = {};
  PLATE_SIZES.forEach(size=>{
    const enabled = document.getElementById(`plateEnabled-${size}`).checked;
    const count = document.getElementById(`plateCount-${size}`).value;
    inv[size] = { enabled, count: count===''? '' : count };
  });
  account.settings.plateInventory = inv;
  try{ await saveAccount(); toast('Inventario de discos guardado.'); }
  catch(e){ toast('Error al guardar: ' + e.message, 'error'); }
}
function calcPlates(){
  const target = parseFloat(document.getElementById('plateTarget').value);
  const bar = parseFloat(document.getElementById('plateBar').value) || 20;
  const resEl = document.getElementById('plateResult');
  const vizEl = document.getElementById('plateViz');
  const legendEl = document.getElementById('plateLegend');
  if(isNaN(target) || target < bar){ toast('Introduce un peso objetivo válido, mayor que la barra.', 'error'); return; }
  const inv = (account && account.settings && account.settings.plateInventory) || defaultPlateInventory();
  const sizes = PLATE_SIZES.filter(s=>inv[s] && inv[s].enabled).map(Number).sort((a,b)=>b-a);
  if(sizes.length===0){ toast('No has habilitado ningún disco en tu inventario.', 'error'); vizEl.innerHTML=''; legendEl.innerHTML=''; return; }
  const remaining = {};
  sizes.forEach(s=>{
    const cfgCount = inv[String(s)] ? inv[String(s)].count : '';
    remaining[s] = (cfgCount===''||cfgCount===null||cfgCount===undefined) ? Infinity : Number(cfgCount);
  });
  let perSide = (target - bar)/2;
  const used = [];
  for(const s of sizes){
    while(perSide >= s - 0.001 && remaining[s] > 0){ used.push(s); perSide -= s; remaining[s]--; }
  }
  const achieved = bar + used.reduce((a,b)=>a+b,0)*2;
  const counts = {};
  used.forEach(p=>{ counts[p] = (counts[p]||0)+1; });
  const grouped = Object.keys(counts).sort((a,b)=>b-a).map(p=>`${counts[p]} × ${p} kg`).join(', ') || 'Ninguno';
  const shortfallNote = perSide > 0.001
    ? `<p class="muted">No se pudo completar exactamente el peso objetivo con los discos disponibles en tu inventario (faltarían ${(perSide*2).toFixed(2)} kg).</p>`
    : (Math.abs(achieved-target)>0.01 ? `<p class="muted">El objetivo de ${target} kg no es exacto con los discos disponibles.</p>` : '');
  resEl.innerHTML = `<div class="result">
    <p>Barra: <span class="wilks-score">${bar} kg</span></p>
    <p>Discos por lado: <span class="wilks-score">${grouped}</span></p>
    <p class="muted">Por lado: ${((achieved-bar)/2).toFixed(2)} kg añadidos</p>
    <p>Peso total cargado: <span class="wilks-score">${achieved.toFixed(2)} kg</span></p>
    ${shortfallNote}
  </div>`;
  const platesHtml = used.map((p,i)=>{
    const meta = PLATE_META[p];
    const w = Math.round(meta.diameter * 2.05);
    const h = Math.round(w * 0.62);
    const showLabel = meta.diameter >= 31;
    const brandSize = Math.max(5, Math.round(w*0.044));
    const numSize = Math.max(10, Math.round(w*0.16));
    return `<div class="plate-disc" style="width:${w}px; height:${h}px; margin-left:${i===0?0:-Math.round(w*0.6)}px; z-index:${used.length-i}; animation-delay:${i*0.04}s;" title="${p} kg">
      <span class="plate-ring-shadow"></span>
      <span class="plate-ring-outer" style="background:${meta.color};"></span>
      <span class="plate-ring-color" style="background:${meta.ring};"></span>
      <span class="plate-ring-inner" style="background:${meta.color};"></span>
      <span class="plate-disc-hub"></span>
      ${showLabel?`
        <span class="plate-disc-text">
          <span class="plate-disc-brand" style="color:${meta.ring}; font-size:${brandSize}px;">IRONSIDE</span>
          <span class="plate-disc-label" style="color:${meta.ring}; font-size:${numSize}px;">${p}</span>
        </span>`:''}
    </div>`;
  }).join('');
  vizEl.innerHTML = `<div class="plate-stack plate-stack-3d">${platesHtml}</div><div class="bar-line-3d"></div>`;
  const usedSizes = [...new Set(used)].sort((a,b)=>b-a);
  legendEl.innerHTML = usedSizes.map(p=>{
    const meta = PLATE_META[p];
    return `<div class="plate-legend-item"><span class="plate-legend-face" style="background:${meta.color}; box-shadow: inset 0 0 0 3px ${meta.ring};"><span class="plate-legend-hole"></span></span>${p} kg × ${counts[p]}</div>`;
  }).join('');
}

/* =========================================================
   IMC / % GRASA / TDEE
========================================================= */
function calcBMI(){
  const w = parseFloat(document.getElementById('bmiWeight').value);
  const h = parseFloat(document.getElementById('bmiHeight').value)/100;
  if(isNaN(w) || isNaN(h) || h<=0){ toast('Completa peso y altura.', 'error'); return; }
  const bmi = w/(h*h);
  let cat;
  if(bmi<18.5) cat='Bajo peso'; else if(bmi<25) cat='Normal'; else if(bmi<30) cat='Sobrepeso'; else cat='Obesidad';
  document.getElementById('bmiResult').classList.remove('hidden');
  document.getElementById('bmiResult').innerHTML = `<p>IMC: <span class="wilks-score">${bmi.toFixed(1)}</span> (${cat})</p>`;
}
document.addEventListener('change', (e)=>{
  if(e.target && e.target.id==='bfGender'){
    document.getElementById('bfHipWrap').style.display = e.target.value==='female' ? 'block' : 'none';
  }
});
function calcBodyFat(){
  const gender = document.getElementById('bfGender').value;
  const height = parseFloat(document.getElementById('bfHeight').value);
  const neck = parseFloat(document.getElementById('bfNeck').value);
  const waist = parseFloat(document.getElementById('bfWaist').value);
  const hip = parseFloat(document.getElementById('bfHip').value);
  if(isNaN(height) || isNaN(neck) || isNaN(waist)){ toast('Completa altura, cuello y cintura.', 'error'); return; }
  let bf;
  if(gender==='male'){ bf = 495/(1.0324 - 0.19077*Math.log10(waist-neck) + 0.15456*Math.log10(height)) - 450; }
  else{
    if(isNaN(hip)){ toast('Introduce la medida de cadera.', 'error'); return; }
    bf = 495/(1.29579 - 0.35004*Math.log10(waist+hip-neck) + 0.22100*Math.log10(height)) - 450;
  }
  document.getElementById('bfResult').classList.remove('hidden');
  document.getElementById('bfResult').innerHTML = `<p>Grasa corporal estimada: <span class="wilks-score">${bf.toFixed(1)}%</span></p><p class="muted">Método Navy: es una estimación, no un diagnóstico médico.</p>`;
}
function calcTDEE(){
  const gender = document.getElementById('tdeeGender').value;
  const age = parseFloat(document.getElementById('tdeeAge').value);
  const weight = parseFloat(document.getElementById('tdeeWeight').value);
  const height = parseFloat(document.getElementById('tdeeHeight').value);
  const activity = parseFloat(document.getElementById('tdeeActivity').value);
  const goal = parseFloat(document.getElementById('tdeeGoal').value);
  if([age,weight,height].some(v=>isNaN(v))){ toast('Completa edad, peso y altura.', 'error'); return; }
  let bmr = gender==='male' ? 10*weight + 6.25*height - 5*age + 5 : 10*weight + 6.25*height - 5*age - 161;
  const tdee = bmr*activity;
  const targetCals = tdee*(1+goal);
  const protein = weight*2;
  const fat = (targetCals*0.25)/9;
  const proteinCals = protein*4;
  const fatCals = fat*9;
  const carbs = Math.max(0,(targetCals - proteinCals - fatCals))/4;
  document.getElementById('tdeeResult').classList.remove('hidden');
  document.getElementById('tdeeResult').innerHTML = `
    <p>Metabolismo basal (BMR): <span class="wilks-score">${bmr.toFixed(0)} kcal</span></p>
    <p>Gasto total diario (TDEE): <span class="wilks-score">${tdee.toFixed(0)} kcal</span></p>
    <p>Calorías objetivo: <span class="wilks-score">${targetCals.toFixed(0)} kcal</span></p>
    <table><thead><tr><th>Macro</th><th>Gramos</th><th>Kcal</th></tr></thead>
    <tbody>
      <tr><td>Proteína</td><td>${protein.toFixed(0)} g</td><td>${proteinCals.toFixed(0)}</td></tr>
      <tr><td>Grasa</td><td>${fat.toFixed(0)} g</td><td>${fatCals.toFixed(0)}</td></tr>
      <tr><td>Carbohidratos</td><td>${carbs.toFixed(0)} g</td><td>${(carbs*4).toFixed(0)}</td></tr>
    </tbody></table>
    <div class="button-group"><button class="flex1 ghost" onclick="applyTdeeAsKcalGoal(${targetCals.toFixed(0)})">Usar como objetivo diario en Nutrición</button></div>
  `;
}
async function applyTdeeAsKcalGoal(value){
  account.settings.kcalGoal = value;
  try{ await saveAccount(); toast('Objetivo de calorías actualizado en Nutrición.'); }catch(e){ toast('Error: ' + e.message, 'error'); }
}
function calcProgression(){
  const rm = parseFloat(document.getElementById('progCurrentRM').value);
  const pct = parseFloat(document.getElementById('progWeeklyPct').value);
  const weeks = Math.min(52, Math.max(1, parseInt(document.getElementById('progWeeks').value) || 8));
  if(isNaN(rm) || isNaN(pct)){ toast('Completa el 1RM actual y el incremento semanal.', 'error'); return; }
  let rows = '';
  let current = rm;
  for(let w=1; w<=weeks; w++){
    current = current * (1 + pct/100);
    rows += `<tr><td>Semana ${w}</td><td>${current.toFixed(1)} kg</td><td>+${(current-rm).toFixed(1)} kg</td></tr>`;
  }
  document.getElementById('progressionResult').innerHTML = `
    <div class="result">
      <p>1RM proyectado tras ${weeks} semanas: <span class="wilks-score">${current.toFixed(1)} kg</span></p>
      <p class="muted">Proyección lineal simple; en la práctica el progreso real no es constante y conviene revisarla cada pocas semanas.</p>
    </div>
    <table><thead><tr><th>Semana</th><th>1RM proyectado</th><th>Ganancia acumulada</th></tr></thead><tbody>${rows}</tbody></table>
  `;
}

/* =========================================================
   ENTRENAMIENTOS (registro, PRs, medios, enlaces de vídeo)
========================================================= */
async function handleWkFileSelected(event){
  const file = event.target.files[0];
  if(!file) return;
  try{
    if(file.type.startsWith('video/')){
      if(file.size > MAX_VIDEO_BYTES){ toast('El vídeo pesa más de 20 MB. Usa un clip más corto o pega un enlace.', 'error'); event.target.value=''; return; }
      const dataUrl = await fileToDataUrl(file);
      pendingWorkoutMedia = { type:'video', dataUrl };
    } else if(file.type.startsWith('image/')){
      const dataUrl = await resizeImageFile(file, 900, 0.7);
      pendingWorkoutMedia = { type:'image', dataUrl };
    }
    renderPendingWorkoutMediaPreview();
  }catch(e){ toast('No se pudo procesar el archivo: ' + e.message, 'error'); }
}
function renderPendingWorkoutMediaPreview(){
  const el = document.getElementById('wkMediaPreview');
  if(!pendingWorkoutMedia){ el.innerHTML=''; return; }
  el.innerHTML = (pendingWorkoutMedia.type==='image'
    ? `<img class="wk-thumb" src="${pendingWorkoutMedia.dataUrl}" alt="">`
    : `<video class="wk-thumb" src="${pendingWorkoutMedia.dataUrl}" controls muted></video>`)
    + ` <button type="button" class="small ghost" onclick="clearPendingWorkoutMedia()">Quitar</button>`;
}
function clearPendingWorkoutMedia(){ pendingWorkoutMedia = null; document.getElementById('wkMedia').value=''; renderPendingWorkoutMediaPreview(); }

async function addWorkout(){
  const date = document.getElementById('wkDate').value || todayStr();
  const exercise = document.getElementById('wkExercise').value.trim();
  const weight = parseFloat(document.getElementById('wkWeight').value);
  const reps = parseFloat(document.getElementById('wkReps').value);
  const sets = parseFloat(document.getElementById('wkSets').value) || 1;
  const rirRaw = document.getElementById('wkRIR').value;
  const rir = rirRaw==='' ? null : parseFloat(rirRaw);
  const notes = document.getElementById('wkNotes').value.trim();
  const videoLink = document.getElementById('wkVideoLink').value.trim();
  if(!exercise || isNaN(weight) || isNaN(reps)){ toast('Completa ejercicio, peso y repeticiones.', 'error'); return; }
  const prevBestEntry = account.workouts
    .filter(w=>w.exercise.toLowerCase()===exercise.toLowerCase())
    .reduce((best,w)=> (epley1RM(w.weight,w.reps) > (best?epley1RM(best.weight,best.reps):0)) ? w : best, null);
  const prevBest1RM = prevBestEntry ? epley1RM(prevBestEntry.weight, prevBestEntry.reps) : 0;
  const new1RM = epley1RM(weight, reps);
  let mediaId = null;
  if(pendingWorkoutMedia){
    mediaId = 'm' + Date.now();
    mediaStore.workoutMedia = mediaStore.workoutMedia || {};
    mediaStore.workoutMedia[mediaId] = pendingWorkoutMedia;
  }
  account.workouts.push({ id: Date.now(), date, exercise, weight, reps, sets, rir, notes, mediaId, videoLink: videoLink || null });
  try{
    await saveAccount();
    if(mediaId){ await persistMediaStoreFor(currentUser, mediaStore); }
    await registerExerciseIfNew(exercise, currentUser);
  }catch(e){ toast('Error al sincronizar: ' + e.message, 'error'); }
  document.getElementById('wkExercise').value='';
  document.getElementById('wkWeight').value='';
  document.getElementById('wkReps').value='';
  document.getElementById('wkSets').value='1';
  document.getElementById('wkRIR').value='';
  document.getElementById('wkNotes').value='';
  document.getElementById('wkVideoLink').value='';
  clearPendingWorkoutMedia();
  renderWorkouts(); renderPRBoard(); renderDashboard(); renderAchievements(); renderExerciseDatalist();
  if(new1RM > prevBest1RM){ toast(`Nuevo récord estimado en ${exercise}: ${new1RM} kg.`); }
  else{ toast('Sesión guardada.'); }
}
async function deleteWorkout(id){
  account.workouts = account.workouts.filter(w=>w.id!==id);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderWorkouts(); renderPRBoard();
}
function renderWorkouts(){
  const el = document.getElementById('workoutList');
  const filterEl = document.getElementById('wkFilter');
  const filter = filterEl ? filterEl.value.trim().toLowerCase() : '';
  if(!account || account.workouts.length===0){ el.innerHTML = '<p class="muted">Aún no hay sesiones registradas.</p>'; return; }
  let sorted = [...account.workouts].sort((a,b)=> new Date(b.date)-new Date(a.date));
  if(filter) sorted = sorted.filter(w=>w.exercise.toLowerCase().includes(filter));
  if(sorted.length===0){ el.innerHTML = '<p class="muted">No hay sesiones que coincidan con ese filtro.</p>'; return; }
  el.innerHTML = sorted.map(w=>{
    const media = w.mediaId ? (mediaStore.workoutMedia||{})[w.mediaId] : null;
    let mediaHtml = '';
    if(media && media.type==='image') mediaHtml = `<img class="wk-thumb" src="${media.dataUrl}" onclick="openLightbox(this.src)" alt="">`;
    if(media && media.type==='video') mediaHtml = `<video class="wk-thumb" src="${media.dataUrl}" controls muted preload="metadata"></video>`;
    const linkHtml = w.videoLink ? `<a href="${escapeHTML(w.videoLink)}" target="_blank" rel="noopener" class="video-link-card">${icon('link',12)} ${escapeHTML(safeHostname(w.videoLink))}</a>` : '';
    return `
    <div class="list-item">
      <div class="row" style="align-items:flex-start; flex-wrap:nowrap;">
        ${mediaHtml}
        <div>
          <strong>${escapeHTML(w.exercise)}</strong> — ${w.weight} kg × ${w.reps} reps × ${w.sets} series${w.rir!=null&&w.rir!==''?` · RIR ${w.rir}`:''}
          <div class="muted">${w.date}${w.notes? ' · '+escapeHTML(w.notes):''}</div>
          ${linkHtml}
        </div>
      </div>
      <button class="small danger" onclick="deleteWorkout(${w.id})">${icon('trash',13)} Borrar</button>
    </div>`;
  }).join('');
}
function renderPRBoard(){
  const el = document.getElementById('prBoard');
  if(!account || account.workouts.length===0){ el.innerHTML = '<p class="muted">Registra sesiones para ver tus récords.</p>'; return; }
  const byExercise = {};
  account.workouts.forEach(w=>{
    const key = w.exercise.trim().toLowerCase();
    const rm = epley1RM(w.weight, w.reps);
    if(!byExercise[key] || rm > byExercise[key].rm){ byExercise[key] = { name:w.exercise, rm, date:w.date, mediaId:w.mediaId }; }
  });
  const rows = Object.values(byExercise).sort((a,b)=>b.rm-a.rm).map(e=>{
    const media = e.mediaId ? (mediaStore.workoutMedia||{})[e.mediaId] : null;
    const thumb = media && media.type==='image' ? `<img class="wk-thumb" style="width:34px;height:34px;" src="${media.dataUrl}" onclick="openLightbox(this.src)" alt="">` : '';
    return `<tr><td style="text-align:left;"><div class="row" style="flex-wrap:nowrap;">${thumb}<span>${escapeHTML(e.name)}</span></div></td><td>${e.rm.toFixed(1)} kg</td><td>${e.date}</td></tr>`;
  }).join('');
  el.innerHTML = `<table><thead><tr><th>Ejercicio</th><th>1RM estimado</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* =========================================================
   COMPARAR EJERCICIOS (categorías creadas por usuarios)
========================================================= */
async function renderExerciseDatalist(){
  try{
    const registry = await getExerciseRegistry();
    const dl = document.getElementById('exerciseList');
    if(!dl) return;
    dl.innerHTML = Object.values(registry).map(e=>`<option value="${escapeHTML(e.label)}"></option>`).join('');
  }catch(e){}
}
async function loadExerciseLeaderboard(){
  const raw = document.getElementById('compareExercise').value;
  const key = normalizeExerciseKey(raw);
  const el = document.getElementById('exerciseLeaderboard');
  if(!key){ toast('Escribe o selecciona un ejercicio.', 'error'); return; }
  el.innerHTML = '<p class="muted">Cargando comparativa...</p>';
  try{
    const accountsMap = await fetchAllAccountsMap();
    const mediaMap = await fetchAllMediaMap();
    const results = [];
    Object.keys(accountsMap).forEach(username=>{
      const acc = accountsMap[username];
      const workouts = (acc.workouts||[]).filter(w=>normalizeExerciseKey(w.exercise)===key);
      if(workouts.length===0) return;
      const best = workouts.reduce((m,w)=>{ const rm = epley1RM(w.weight,w.reps); return rm>m.rm ? {rm,date:w.date} : m; }, {rm:0,date:''});
      results.push({ username, rm: best.rm, date: best.date, avatar: (mediaMap[username]&&mediaMap[username].avatar)||null });
    });
    if(results.length===0){ el.innerHTML = '<p class="muted">Nadie ha registrado este ejercicio todavía. Sé el primero.</p>'; return; }
    results.sort((a,b)=>b.rm-a.rm);
    el.innerHTML = results.map((r,i)=>{
      const rankClass = i===0?'r1':i===1?'r2':i===2?'r3':'';
      return `<div class="rank-item ${i===0?'top1':''}">
        <div class="rank-info">
          <div class="rank-badge ${rankClass}">${i+1}</div>
          ${r.avatar?`<img class="avatar-sm" style="width:26px;height:26px;" src="${r.avatar}" alt="">`:''}
          <strong>${escapeHTML(r.username)}${r.username===currentUser?' (tú)':''}</strong>
        </div>
        <div class="rank-scores"><div><div class="metric-label">1RM est.</div><span class="wilks-score">${r.rm.toFixed(1)} kg</span></div></div>
      </div>`;
    }).join('');
  }catch(e){ el.innerHTML = `<p class="muted">Error: ${escapeHTML(e.message)}</p>`; }
}

/* =========================================================
   TEMPORIZADOR DE DESCANSO
========================================================= */
let timerTotalSeconds = 90;
let timerRemaining = 90;
let timerInterval = null;
function formatTime(s){ const m = Math.floor(s/60).toString().padStart(2,'0'); const sec = Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}`; }
function updateTimerDisplay(){ document.getElementById('timerDisplay').textContent = formatTime(timerRemaining); }
function setTimerPreset(seconds){
  pauseTimer();
  if(seconds===null){ const custom = parseInt(document.getElementById('customTimerSeconds').value); seconds = isNaN(custom) ? 90 : custom; }
  timerTotalSeconds = seconds; timerRemaining = seconds; updateTimerDisplay();
}
function startTimer(){
  if(timerInterval) return;
  timerInterval = setInterval(()=>{
    timerRemaining--;
    if(timerRemaining<=0){ timerRemaining = 0; updateTimerDisplay(); pauseTimer(); beep(); toast('Descanso terminado.'); return; }
    updateTimerDisplay();
  },1000);
}
function pauseTimer(){ clearInterval(timerInterval); timerInterval = null; }
function resetTimer(){ pauseTimer(); timerRemaining = timerTotalSeconds; updateTimerDisplay(); }
function beep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  }catch(e){}
  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}

/* =========================================================
   MEDIDAS CORPORALES
========================================================= */
async function addMeasurement(){
  const date = document.getElementById('mDate').value || todayStr();
  const weight = parseFloat(document.getElementById('mWeight').value);
  const waist = parseFloat(document.getElementById('mWaist').value);
  const chest = parseFloat(document.getElementById('mChest').value);
  const arm = parseFloat(document.getElementById('mArm').value);
  const thigh = parseFloat(document.getElementById('mThigh').value);
  if([weight,waist,chest,arm,thigh].every(v=>isNaN(v))){ toast('Completa al menos una medida.', 'error'); return; }
  account.measurements.push({date, weight, waist, chest, arm, thigh});
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  ['mWeight','mWaist','mChest','mArm','mThigh'].forEach(id=>document.getElementById(id).value='');
  renderMeasurements(); renderAchievements();
  toast('Medidas guardadas.');
}
async function deleteMeasurement(idx){
  account.measurements.splice(idx,1);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderMeasurements();
}
let measureChartInstance = null;
function renderMeasurementChart(){
  const metric = document.getElementById('measureMetric').value;
  const data = [...(account?.measurements||[])].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const labels = data.map(d=>d.date);
  const values = data.map(d=> isNaN(d[metric]) ? null : d[metric]);
  const ctx = document.getElementById('measureChart').getContext('2d');
  if(measureChartInstance) measureChartInstance.destroy();
  const metricLabel = document.getElementById('measureMetric').selectedOptions[0].textContent;
  measureChartInstance = new Chart(ctx, lineChartConfig(labels, values, metricLabel));
}
function renderMeasurements(){
  renderMeasurementChart();
  const el = document.getElementById('measureHistory');
  if(!account || account.measurements.length===0){ el.innerHTML='<p class="muted">Sin medidas registradas.</p>'; return; }
  const sorted = [...account.measurements].map((m,i)=>({...m, idx:i})).sort((a,b)=>new Date(b.date)-new Date(a.date));
  el.innerHTML = sorted.map(m=>`
    <div class="list-item">
      <div class="muted">${m.date} — Peso: ${m.weight??'-'} · Cintura: ${m.waist??'-'} · Pecho: ${m.chest??'-'} · Brazo: ${m.arm??'-'} · Muslo: ${m.thigh??'-'}</div>
      <button class="small danger" onclick="deleteMeasurement(${m.idx})">${icon('trash',13)} Borrar</button>
    </div>
  `).join('');
}

/* =========================================================
   FOTOS DE PROGRESO
========================================================= */
async function stagePhoto(event){
  const file = event.target.files[0];
  if(!file) return;
  try{
    const dataUrl = await resizeImageFile(file, 700, 0.68);
    const date = document.getElementById('photoDate').value || todayStr();
    const note = document.getElementById('photoNote').value.trim();
    mediaStore.progressPhotos = mediaStore.progressPhotos || [];
    mediaStore.progressPhotos.push({ id: Date.now(), date, note, dataUrl });
    await persistMediaStoreFor(currentUser, mediaStore);
    document.getElementById('photoNote').value = '';
    renderPhotoGallery();
    toast('Foto de progreso guardada.');
  }catch(e){ toast('No se pudo procesar la imagen: ' + e.message, 'error'); }
  event.target.value = '';
}
async function deletePhoto(id){
  mediaStore.progressPhotos = (mediaStore.progressPhotos||[]).filter(p=>p.id!==id);
  try{ await persistMediaStoreFor(currentUser, mediaStore); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderPhotoGallery();
}
function renderPhotoGallery(){
  const el = document.getElementById('photoGallery');
  if(!el) return;
  const photos = (mediaStore && mediaStore.progressPhotos) || [];
  if(photos.length===0){ el.innerHTML = '<p class="muted">Todavía no has añadido fotos de progreso.</p>'; return; }
  const sorted = [...photos].sort((a,b)=>new Date(b.date)-new Date(a.date));
  el.innerHTML = sorted.map(p=>`
    <div class="photo-card">
      <img src="${p.dataUrl}" onclick="openLightbox(this.src)" alt="Foto de progreso del ${p.date}">
      <div class="photo-meta">
        <span class="muted">${p.date}${p.note?' · '+escapeHTML(p.note):''}</span>
        <button class="small danger" onclick="deletePhoto(${p.id})">${icon('trash',12)}</button>
      </div>
    </div>
  `).join('');
}
function openLightbox(src){ document.getElementById('lightboxImg').src = src; document.getElementById('lightbox').classList.add('open'); }
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); }

/* =========================================================
   SALUD: NUTRICIÓN, PASOS, SUEÑO
========================================================= */
function last7Days(){
  const days = [];
  for(let i=6;i>=0;i--){ const d = new Date(); d.setDate(d.getDate()-i); days.push(d.toISOString().slice(0,10)); }
  return days;
}
async function addNutritionLog(){
  const date = document.getElementById('nutDate').value || todayStr();
  const name = document.getElementById('nutName').value.trim();
  const kcal = parseFloat(document.getElementById('nutKcal').value);
  const protein = parseFloat(document.getElementById('nutProtein').value) || 0;
  const carbs = parseFloat(document.getElementById('nutCarbs').value) || 0;
  const fat = parseFloat(document.getElementById('nutFat').value) || 0;
  if(!name || isNaN(kcal)){ toast('Completa al menos el nombre y las calorías.', 'error'); return; }
  account.nutrition = account.nutrition || [];
  account.nutrition.push({ id: Date.now(), date, name, kcal, protein, carbs, fat });
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  document.getElementById('nutName').value=''; document.getElementById('nutKcal').value='';
  document.getElementById('nutProtein').value=''; document.getElementById('nutCarbs').value=''; document.getElementById('nutFat').value='';
  renderNutrition();
  toast('Alimento registrado.');
}
async function deleteNutritionLog(id){
  account.nutrition = (account.nutrition||[]).filter(n=>n.id!==id);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderNutrition();
}
function setKcalGoalPrompt(){
  const current = (account.settings && account.settings.kcalGoal) || 2200;
  const val = prompt('Nuevo objetivo diario de calorías (kcal)', current);
  if(val===null) return;
  const num = parseFloat(val);
  if(isNaN(num) || num<=0){ toast('Introduce un número válido.', 'error'); return; }
  account.settings.kcalGoal = num;
  saveAccount().then(renderNutrition).catch(e=>toast('Error: '+e.message,'error'));
}
let nutritionChartInstance = null;
function renderNutrition(){
  if(!account) return;
  const logs = account.nutrition || [];
  const today = todayStr();
  const todays = logs.filter(n=>n.date===today);
  const totalKcal = todays.reduce((s,n)=>s+n.kcal,0);
  const totalProtein = todays.reduce((s,n)=>s+(n.protein||0),0);
  const totalCarbs = todays.reduce((s,n)=>s+(n.carbs||0),0);
  const totalFat = todays.reduce((s,n)=>s+(n.fat||0),0);
  const goal = (account.settings && account.settings.kcalGoal) || 2200;
  const pct = Math.min(100, (totalKcal/goal)*100);
  const todayEl = document.getElementById('nutritionToday');
  if(todayEl){
    todayEl.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <span class="wilks-score">${totalKcal.toFixed(0)} kcal</span>
        <span class="muted">Objetivo: ${goal} kcal</span>
      </div>
      <div class="progress-track" style="margin:8px 0 12px;"><div class="progress-fill ${totalKcal>=goal?'complete':''}" style="width:${pct}%;"></div></div>
      <p class="muted">Proteína: ${totalProtein.toFixed(0)}g · Carbohidratos: ${totalCarbs.toFixed(0)}g · Grasa: ${totalFat.toFixed(0)}g</p>
      ${todays.length? todays.map(n=>`
        <div class="list-item">
          <span>${escapeHTML(n.name)} — ${n.kcal} kcal</span>
          <button class="small danger" onclick="deleteNutritionLog(${n.id})">${icon('trash',12)}</button>
        </div>`).join('') : '<p class="muted">Todavía no has registrado nada hoy.</p>'}
    `;
  }
  const days = last7Days();
  const totals = days.map(d=> logs.filter(n=>n.date===d).reduce((s,n)=>s+n.kcal,0));
  const canvas = document.getElementById('nutritionChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(nutritionChartInstance) nutritionChartInstance.destroy();
  nutritionChartInstance = new Chart(ctx, barChartConfig(days.map(d=>d.slice(5)), totals, 'kcal'));
}
async function addSteps(){
  const amount = parseInt(document.getElementById('stepsInput').value);
  if(isNaN(amount)){ toast('Introduce un número de pasos válido.', 'error'); return; }
  account.steps = account.steps || [];
  let entry = account.steps.find(s=>s.date===todayStr());
  if(!entry){ entry = {date: todayStr(), steps:0}; account.steps.push(entry); }
  entry.steps += amount;
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  document.getElementById('stepsInput').value='';
  renderSteps();
  toast('Pasos actualizados.');
}
function setStepsGoalPrompt(){
  const current = (account.settings && account.settings.stepsGoal) || 10000;
  const val = prompt('Nuevo objetivo diario de pasos', current);
  if(val===null) return;
  const num = parseInt(val);
  if(isNaN(num) || num<=0){ toast('Introduce un número válido.', 'error'); return; }
  account.settings.stepsGoal = num;
  saveAccount().then(renderSteps).catch(e=>toast('Error: '+e.message,'error'));
}
let stepsChartInstance = null;
function renderSteps(){
  if(!account) return;
  const entries = account.steps || [];
  const today = entries.find(s=>s.date===todayStr());
  const todaySteps = today ? today.steps : 0;
  const goal = (account.settings && account.settings.stepsGoal) || 10000;
  const pct = Math.min(100, (todaySteps/goal)*100);
  const el = document.getElementById('stepsToday');
  if(el){
    el.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <span class="wilks-score">${todaySteps.toLocaleString('es-ES')} pasos</span>
        <span class="muted">Objetivo: ${goal.toLocaleString('es-ES')}</span>
      </div>
      <div class="progress-track" style="margin-top:8px;"><div class="progress-fill ${pct>=100?'complete':''}" style="width:${pct}%;"></div></div>
    `;
  }
  const days = last7Days();
  const totals = days.map(d=>{ const e = entries.find(s=>s.date===d); return e?e.steps:0; });
  const canvas = document.getElementById('stepsChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(stepsChartInstance) stepsChartInstance.destroy();
  stepsChartInstance = new Chart(ctx, barChartConfig(days.map(d=>d.slice(5)), totals, 'pasos'));
}
async function saveSleepLog(){
  const date = document.getElementById('sleepDate').value || todayStr();
  const hours = parseFloat(document.getElementById('sleepHours').value);
  if(isNaN(hours)){ toast('Introduce las horas dormidas.', 'error'); return; }
  account.sleep = account.sleep || [];
  let entry = account.sleep.find(s=>s.date===date);
  if(!entry){ entry = {date}; account.sleep.push(entry); }
  entry.hours = hours;
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderSleep();
  toast('Sueño registrado.');
}
async function deleteSleepLog(date){
  account.sleep = (account.sleep||[]).filter(s=>s.date!==date);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderSleep();
}
function renderSleep(){
  const el = document.getElementById('sleepHistory');
  if(!el || !account) return;
  const entries = [...(account.sleep||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,14);
  if(entries.length===0){ el.innerHTML = '<p class="muted">Sin registros de sueño.</p>'; return; }
  el.innerHTML = entries.map(s=>`
    <div class="list-item">
      <span>${s.date} — ${s.hours} h</span>
      <button class="small danger" onclick="deleteSleepLog('${s.date}')">${icon('trash',12)}</button>
    </div>
  `).join('');
}

/* =========================================================
   OBJETIVOS
========================================================= */
async function addGoal(){
  const desc = document.getElementById('goalDesc').value.trim();
  const unit = document.getElementById('goalUnit').value.trim();
  const current = parseFloat(document.getElementById('goalCurrent').value);
  const target = parseFloat(document.getElementById('goalTarget').value);
  if(!desc || isNaN(current) || isNaN(target)){ toast('Completa descripción, valor actual y objetivo.', 'error'); return; }
  account.goals.push({id:Date.now(), desc, unit, current, target});
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  document.getElementById('goalDesc').value=''; document.getElementById('goalUnit').value='';
  document.getElementById('goalCurrent').value=''; document.getElementById('goalTarget').value='';
  renderGoals();
  toast('Objetivo creado.');
}
async function updateGoalProgress(id){
  const goal = account.goals.find(g=>g.id===id);
  if(!goal) return;
  const val = prompt(`Nuevo valor actual para "${goal.desc}" (${goal.unit||''})`, goal.current);
  if(val===null) return;
  const num = parseFloat(val);
  if(isNaN(num)){ toast('Introduce un número válido.', 'error'); return; }
  goal.current = num;
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderGoals(); renderAchievements();
}
async function deleteGoal(id){
  account.goals = account.goals.filter(g=>g.id!==id);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderGoals();
}
function renderGoals(){
  const el = document.getElementById('goalList');
  if(!account || account.goals.length===0){ el.innerHTML='<p class="muted">Todavía no has creado objetivos.</p>'; return; }
  el.innerHTML = account.goals.map(g=>{
    const done = g.current>=g.target;
    const pct = Math.min(100, Math.max(0, (g.current/g.target)*100)).toFixed(0);
    return `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <strong>${escapeHTML(g.desc)}${done?' '+icon('check',14):''}</strong>
        <span class="muted">${g.current}${g.unit||''} / ${g.target}${g.unit||''}</span>
      </div>
      <div class="progress-track" style="margin-top:8px;"><div class="progress-fill ${done?'complete':''}" style="width:${pct}%;"></div></div>
      <div class="row" style="justify-content:space-between; margin-top:10px;">
        <span class="muted">${pct}% completado</span>
        <div class="row">
          <button class="small ghost" onclick="updateGoalProgress(${g.id})">Actualizar</button>
          <button class="small danger" onclick="deleteGoal(${g.id})">${icon('trash',13)} Borrar</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* =========================================================
   RACHA, VOLUMEN Y LOGROS
========================================================= */
function computeStreak(){
  if(!account || account.workouts.length===0) return 0;
  const uniqueDates = [...new Set(account.workouts.map(w=>w.date))].sort().reverse();
  let streak = 0; let cursor = new Date();
  for(let i=0;i<uniqueDates.length;i++){
    const d = new Date(uniqueDates[i]);
    const diff = Math.round((cursor - d)/(1000*60*60*24));
    if(diff===0 || diff===1){ streak++; cursor = d; } else if(diff>1){ break; }
  }
  return streak;
}
function computeTotalVolume(){
  if(!account) return 0;
  return account.workouts.reduce((sum,w)=> sum + (w.weight*w.reps*w.sets), 0);
}
function getAchievementDefs(){
  return [
    {name:'Primeros pasos', desc:'Realiza tu primer cálculo de Wilks', check:a=>a.history.length>=1},
    {name:'Cinco cálculos', desc:'Guarda 5 cálculos de Wilks', check:a=>a.history.length>=5},
    {name:'Nivel Élite', desc:'Alcanza el nivel Élite en Wilks', check:a=>a.history.some(h=>h.level==='Élite')},
    {name:'Diez entrenamientos', desc:'Registra 10 sesiones de entrenamiento', check:a=>a.workouts.length>=10},
    {name:'Racha de constancia', desc:'Entrena 7 días seguidos', check:a=>computeStreak()>=7},
    {name:'Meta cumplida', desc:'Completa un objetivo', check:a=>a.goals.some(g=>g.current>=g.target)},
    {name:'Seguimiento constante', desc:'Registra tus medidas 3 veces', check:a=>a.measurements.length>=3},
    {name:'Rompiendo récords', desc:'Registra PRs en 3 ejercicios distintos', check:a=>{ const set = new Set(a.workouts.map(w=>w.exercise.trim().toLowerCase())); return set.size>=3; }},
    {name:'Diario visual', desc:'Sube 3 fotos de progreso', check:a=>(mediaStore && mediaStore.progressPhotos ? mediaStore.progressPhotos.length : 0)>=3},
    {name:'Nutrición al día', desc:'Registra comidas en 3 días distintos', check:a=>{ const set = new Set((a.nutrition||[]).map(n=>n.date)); return set.size>=3; }},
    {name:'En movimiento', desc:'Registra pasos en 3 días distintos', check:a=>(a.steps||[]).length>=3},
    {name:'Primera plantilla', desc:'Crea tu primera plantilla de rutina', check:a=>(a.routineTemplates||[]).length>=1},
    {name:'Cinco plantillas', desc:'Guarda 5 plantillas de rutina', check:a=>(a.routineTemplates||[]).length>=5},
    {name:'Entrenamiento cronometrado', desc:'Completa una sesión con el cronómetro de rutinas', check:a=>(a.workoutSessions||[]).length>=1},
    {name:'Diez sesiones cronometradas', desc:'Completa 10 sesiones con el cronómetro', check:a=>(a.workoutSessions||[]).length>=10},
    {name:'Primer reto', desc:'Supera el nivel 1 de un reto', check:a=>a.challenges && Object.values(a.challenges.levels||{}).some(l=>l>=1)},
    {name:'Maestro de un reto', desc:'Alcanza el nivel máximo de un reto', check:a=>a.challenges && Object.entries(a.challenges.levels||{}).some(([id,l])=>{ const def = CHALLENGE_DEFS.find(c=>c.id===id); return def && l>=def.levels.length; })},
    {name:'Racha de retos', desc:'Completa el reto diario 7 días seguidos', check:a=>computeDailyChallengeStreak()>=7},
    {name:'Reto propio', desc:'Crea tu primer reto personalizado', check:a=>(a.customChallenges||[]).length>=1},
  ];
}
function renderAchievements(){
  if(!account) return;
  const defs = getAchievementDefs();
  const listEl = document.getElementById('achievementList');
  const dashEl = document.getElementById('dashboardBadges');
  const html = defs.map(d=>{
    const unlocked = d.check(account);
    return `<span class="badge ${unlocked?'unlocked':'locked'}" title="${escapeHTML(d.desc)}">${icon(unlocked?'award':'lock',14)} ${escapeHTML(d.name)}</span>`;
  }).join('');
  if(listEl) listEl.innerHTML = html || '<p class="muted">Sin logros todavía.</p>';
  if(dashEl){
    const unlockedOnes = defs.filter(d=>d.check(account));
    dashEl.innerHTML = unlockedOnes.length
      ? unlockedOnes.map(d=>`<span class="badge unlocked">${icon('award',14)} ${escapeHTML(d.name)}</span>`).join('')
      : '<p class="muted">Aún no has desbloqueado logros. Sigue entrenando.</p>';
  }
}

/* =========================================================
   AGUA (con tamaño de vaso y objetivo configurables)
========================================================= */
async function addWater(){
  account.waterLog = account.waterLog || [];
  let entry = account.waterLog.find(w=>w.date===todayStr());
  if(!entry){ entry = { date: todayStr(), count: 0 }; account.waterLog.push(entry); }
  entry.count++;
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderWaterWidget();
}
async function resetWater(){
  account.waterLog = account.waterLog || [];
  let entry = account.waterLog.find(w=>w.date===todayStr());
  if(!entry){ entry = { date: todayStr(), count: 0 }; account.waterLog.push(entry); }
  entry.count = 0;
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderWaterWidget();
}
function setWaterSettingsPrompt(){
  const currentServing = (account.settings && account.settings.waterServingMl) || 250;
  const currentGoal = (account.settings && account.settings.waterGoalMl) || 2000;
  const serving = prompt('Tamaño del vaso (ml)', currentServing);
  if(serving===null) return;
  const goal = prompt('Objetivo diario de agua (ml)', currentGoal);
  if(goal===null) return;
  const sNum = parseInt(serving), gNum = parseInt(goal);
  if(isNaN(sNum)||sNum<=0||isNaN(gNum)||gNum<=0){ toast('Introduce valores válidos.', 'error'); return; }
  account.settings.waterServingMl = sNum;
  account.settings.waterGoalMl = gNum;
  saveAccount().then(renderWaterWidget).catch(e=>toast('Error: '+e.message,'error'));
}
let waterChartInstance = null;
function renderWaterWidget(){
  const el = document.getElementById('waterWidget');
  if(!account) return;
  account.waterLog = account.waterLog || [];
  let entry = account.waterLog.find(w=>w.date===todayStr());
  if(!entry){ entry = { date: todayStr(), count: 0 }; account.waterLog.push(entry); }
  const servingMl = (account.settings && account.settings.waterServingMl) || 250;
  const goalMl = (account.settings && account.settings.waterGoalMl) || 2000;
  const totalMl = entry.count * servingMl;
  const cellsNeeded = Math.max(1, Math.ceil(goalMl/servingMl));
  const cells = Array.from({length:cellsNeeded}, (_,i)=> i < entry.count ? 'filled' : '').map(cls=>`<div class="water-cell ${cls}"></div>`).join('');
  el.innerHTML = `
    <div class="water-row">${cells}</div>
    <div class="row" style="justify-content:space-between; margin-bottom:12px;">
      <span class="muted">${icon('droplet',13)} ${totalMl} ml de ${goalMl} ml (vaso de ${servingMl} ml)</span>
    </div>
    <div class="button-group" style="margin-top:0;">
      <button class="flex1 small" onclick="addWater()">Añadir vaso</button>
      <button class="flex1 small ghost" onclick="resetWater()">Reiniciar</button>
      <button class="flex1 small ghost" onclick="setWaterSettingsPrompt()">Ajustar tamaño/objetivo</button>
    </div>
    <canvas id="waterChart" height="80" style="margin-top:14px;"></canvas>
  `;
  const days = last7Days();
  const totals = days.map(d=>{ const e = account.waterLog.find(w=>w.date===d); return e ? e.count*servingMl : 0; });
  const canvas = document.getElementById('waterChart');
  if(canvas){
    const ctx = canvas.getContext('2d');
    if(waterChartInstance) waterChartInstance.destroy();
    waterChartInstance = new Chart(ctx, barChartConfig(days.map(d=>d.slice(5)), totals, 'ml'));
  }
}

/* =========================================================
   DASHBOARD
========================================================= */
let dashboardChartInstance = null;
function animateStatValues(container){
  container.querySelectorAll('.stat-value').forEach(el=>{
    const text = el.textContent;
    const match = text.match(/^-?\d+(\.\d+)?/);
    if(!match){ return; }
    const target = parseFloat(match[0]);
    const suffix = text.slice(match[0].length);
    const decimals = (match[0].split('.')[1]||'').length;
    const duration = 550;
    const start = performance.now();
    function frame(now){
      const t = Math.min(1, (now-start)/duration);
      const eased = 1 - Math.pow(1-t, 3);
      el.textContent = (target*eased).toFixed(decimals) + suffix;
      if(t<1) requestAnimationFrame(frame); else el.textContent = text;
    }
    requestAnimationFrame(frame);
  });
}
function renderDashboard(){
  if(!account) return;
  document.getElementById('streakChip').innerHTML = `${icon('up',0)}`.length ? `<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s-5 4.5-5 9.5a5 5 0 0 0 10 0c0-1.5-1-2.5-1-2.5s.5 2-1 3c0 0 .5-3-1.5-5 0 0 .5 2-1.5 3C11 8 12 5 12 2Z"></path></svg> ${computeStreak()} días` : '';
  const bestWilks = account.history.reduce((m,h)=>Math.max(m,h.wilksScore),0);
  const lastEntry = account.history[account.history.length-1];
  const prevEntry = account.history[account.history.length-2];
  let trendHtml = '';
  if(lastEntry && prevEntry){
    const diff = lastEntry.wilksScore - prevEntry.wilksScore;
    const dir = diff>0.05 ? 'up' : diff<-0.05 ? 'down' : 'flat';
    trendHtml = `<span class="trend ${dir}">${icon(dir,11)} ${diff>=0?'+':''}${diff.toFixed(1)}</span>`;
  }
  const volume = computeTotalVolume();
  const statsEl = document.getElementById('dashboardStats');
  statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-top"><span class="stat-label">Último Wilks</span>${trendHtml}</div><div class="stat-value">${lastEntry?lastEntry.wilksScore.toFixed(1):'0'}</div></div>
    <div class="stat-card"><div class="stat-top"><span class="stat-label">Mejor Wilks</span></div><div class="stat-value">${bestWilks?bestWilks.toFixed(1):'0'}</div></div>
    <div class="stat-card"><div class="stat-top"><span class="stat-label">Entrenamientos</span></div><div class="stat-value">${account.workouts.length}</div></div>
    <div class="stat-card"><div class="stat-top"><span class="stat-label">Volumen total</span></div><div class="stat-value">${volume>=1000?(volume/1000).toFixed(1)+'t':volume.toFixed(0)+'kg'}</div></div>
  `;
  animateStatValues(statsEl);
  const ctx = document.getElementById('dashboardChart').getContext('2d');
  const last10 = account.history.slice(-10);
  const labels = last10.map((h,i)=>`#${account.history.length-last10.length+i+1}`);
  const scores = last10.map(h=>h.wilksScore);
  if(dashboardChartInstance) dashboardChartInstance.destroy();
  dashboardChartInstance = new Chart(ctx, lineChartConfig(labels, scores, 'Wilks', 500));
  renderWaterWidget();
  renderAchievements();
}

/* =========================================================
   RANKING GLOBAL
========================================================= */
async function updateRanking(){
  if(!currentUser || account.history.length===0) return;
  const bestWilks = account.history.reduce((m,h)=>Math.max(m,h.wilksScore),0);
  const bestDots = account.history.reduce((m,h)=>Math.max(m,h.dotsScore||0),0);
  await persistRanking(currentUser, { username: currentUser, bestWilks, bestDots, avatar:(mediaStore&&mediaStore.avatar)||null, updated: new Date().toISOString() });
}
async function loadRanking(){
  const el = document.getElementById('rankingList');
  el.innerHTML = '<p class="muted">Cargando ranking...</p>';
  try{
    const entries = await fetchRankingList();
    if(entries.length===0){ el.innerHTML = '<p class="muted">Todavía no hay puntajes en el ranking. Sé el primero.</p>'; return; }
    entries.sort((a,b)=>b.bestWilks-a.bestWilks);
    el.innerHTML = entries.map((e,i)=>{
      const rankClass = i===0?'r1':i===1?'r2':i===2?'r3':'';
      return `
      <div class="rank-item ${i===0?'top1':''}">
        <div class="rank-info">
          <div class="rank-badge ${rankClass}">${i+1}</div>
          ${e.avatar ? `<img class="avatar-sm" style="width:26px;height:26px;" src="${e.avatar}" alt="">` : ''}
          <strong>${escapeHTML(e.username)}${e.username===currentUser?' (tú)':''}</strong>
        </div>
        <div class="rank-scores">
          <div><div class="metric-label">Wilks</div><span class="wilks-score">${e.bestWilks.toFixed(1)}</span></div>
          <div><div class="metric-label">DOTS</div><span class="wilks-score">${(e.bestDots||0).toFixed(1)}</span></div>
        </div>
      </div>`;
    }).join('');
  }catch(e){ el.innerHTML = `<p class="muted">Error al cargar el ranking: ${escapeHTML(e.message)}</p>`; }
}

/* =========================================================
   COMUNIDAD: PERFILES PÚBLICOS
========================================================= */
let communityProfilesCache = [];
async function loadCommunity(){
  document.getElementById('communityDetail').classList.add('hidden');
  const grid = document.getElementById('communityGrid');
  grid.innerHTML = '<p class="muted">Cargando perfiles...</p>';
  try{
    const accountsMap = await fetchAllAccountsMap();
    const mediaMap = await fetchAllMediaMap();
    communityProfilesCache = Object.keys(accountsMap)
      .map(u=>({ username:u, acc:accountsMap[u], media: mediaMap[u]||{} }))
      .filter(p=> !p.acc.profile || p.acc.profile.isPublic !== false);
    renderCommunityTop();
    renderCommunityGrid();
  }catch(e){ grid.innerHTML = `<p class="muted">Error: ${escapeHTML(e.message)}</p>`; }
}
function renderCommunityTop(){
  const el = document.getElementById('communityTop');
  if(!el) return;
  const ranked = communityProfilesCache
    .map(p=>({ username:p.username, media:p.media, bestWilks:(p.acc.history||[]).reduce((m,h)=>Math.max(m,h.wilksScore),0) }))
    .filter(p=>p.bestWilks>0)
    .sort((a,b)=>b.bestWilks-a.bestWilks)
    .slice(0,3);
  if(ranked.length===0){ el.innerHTML = ''; return; }
  el.innerHTML = `
    <h3>Mejores puntajes de la comunidad</h3>
    <div class="grid grid-3">
      ${ranked.map((p,i)=>`
        <div class="card profile-card" onclick="openCommunityProfile('${p.username.replace(/'/g,"\\'")}')">
          <div class="row" style="gap:8px;">
            <div class="rank-badge ${i===0?'r1':i===1?'r2':'r3'}">${i+1}</div>
            ${p.media.avatar?`<img class="avatar-sm" style="width:26px;height:26px;" src="${p.media.avatar}" alt="">`:''}
            <div><strong>${escapeHTML(p.username)}</strong><div class="muted">${p.bestWilks.toFixed(1)} Wilks</div></div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="divider"></div>
  `;
}
function renderCommunityGrid(){
  const grid = document.getElementById('communityGrid');
  if(!grid) return;
  if(communityProfilesCache.length===0){ grid.innerHTML = '<p class="muted">No hay perfiles públicos todavía.</p>'; return; }
  const search = (document.getElementById('communitySearch').value || '').trim().toLowerCase();
  const sortBy = document.getElementById('communitySort').value;
  let list = communityProfilesCache.filter(p=> !search || p.username.toLowerCase().includes(search));
  list = list.map(p=>({ ...p, bestWilks:(p.acc.history||[]).reduce((m,h)=>Math.max(m,h.wilksScore),0), workoutsCount:(p.acc.workouts||[]).length }));
  if(sortBy==='wilks') list.sort((a,b)=>b.bestWilks-a.bestWilks);
  else if(sortBy==='name') list.sort((a,b)=>a.username.localeCompare(b.username));
  else if(sortBy==='recent') list.sort((a,b)=>(b.acc.createdAt||'').localeCompare(a.acc.createdAt||''));
  if(list.length===0){ grid.innerHTML = '<p class="muted">No hay perfiles que coincidan con tu búsqueda.</p>'; return; }
  grid.innerHTML = `<div class="grid grid-3">` + list.map(p=>`
      <div class="card profile-card" onclick="openCommunityProfile('${p.username.replace(/'/g,"\\'")}')">
        <div class="row" style="gap:10px;">
          <div class="avatar-preview" style="width:44px;height:44px;">${p.media.avatar?`<img src="${p.media.avatar}" alt="">`:icon('user',20)}</div>
          <div><strong>${escapeHTML(p.username)}</strong><div class="muted">Wilks: ${p.bestWilks?p.bestWilks.toFixed(1):'—'} · ${p.workoutsCount} entrenos</div></div>
        </div>
      </div>`).join('') + `</div>`;
}
async function openCommunityProfile(username){
  const detailEl = document.getElementById('communityDetail');
  detailEl.classList.remove('hidden');
  detailEl.innerHTML = '<p class="muted">Cargando perfil...</p>';
  detailEl.scrollIntoView({ behavior:'smooth', block:'start' });
  try{
    const acc = await fetchAccount(username);
    const media = await fetchMediaStoreFor(username);
    const social = await fetchSocial(username);
    const mySocial = await fetchSocial(currentUser);
    const followStats = await fetchFollowStats(username);
    const bestWilks = (acc.history||[]).reduce((m,h)=>Math.max(m,h.wilksScore),0);
    const p = acc.profile || {};
    const iGaveKudos = (social.kudosBy||[]).includes(currentUser);
    const iFollow = (mySocial.following||[]).includes(username);
    const iMuted = (mySocial.muted||[]).includes(username);
    const iBlocked = (mySocial.blocked||[]).includes(username);
    const postsCount = (await fetchPostsByAuthor(username)).length;
    const streak = computeDailyChallengeStreak(acc);
    const rank = getRankForXP(computeChallengeXP(acc)).current;
    const badges = getAchievementDefs().filter(d=>d.check(acc));
    const pinnedPost = social.pinnedPostId ? (await fetchPostsByAuthor(username)).find(p=>p.id===social.pinnedPostId) : null;
    detailEl.innerHTML = `
      ${media.cover?`<div class="profile-cover"><img src="${media.cover}" alt=""></div>`:''}
      <div class="row" style="gap:14px; align-items:flex-start; ${media.cover?'margin-top:-30px;':''}">
        <div class="avatar-preview profile-detail-avatar" style="width:72px;height:72px;">${media.avatar?`<img src="${media.avatar}" alt="">`:icon('user',30)}</div>
        <div style="flex:1;">
          <h2 style="margin:0;">${escapeHTML(username)} ${rankBadgeInline(rank)}</h2>
          <p class="muted">${p.age?p.age+' años · ':''}${p.heightCm?p.heightCm+' cm · ':''}${p.weightKg?p.weightKg+' kg':''}</p>
          <p>${escapeHTML(p.bio||'')}</p>
          <p class="muted">Mejor Wilks: ${bestWilks?bestWilks.toFixed(1):'—'} · ${(acc.workouts||[]).length} entrenamientos${streak>0?` · 🔥 ${streak} días de racha`:''}</p>
          <div class="profile-stat-row">
            <span><strong>${postsCount}</strong> publicaciones</span>
            <span><strong>${followStats.followers}</strong> seguidores</span>
            <span><strong>${followStats.following}</strong> seguidos</span>
          </div>
          ${badges.length?`<div class="profile-badges">${badges.map(d=>`<span class="badge unlocked" title="${escapeHTML(d.desc)}">${icon('award',12)} ${escapeHTML(d.name)}</span>`).join('')}</div>`:''}
        </div>
      </div>
      <div class="button-group">
        ${username!==currentUser?`<button class="flex1 ${iFollow?'ghost':''}" onclick="handleToggleFollow('${username.replace(/'/g,"\\'")}')">${iFollow?icon('check',14)+' Siguiendo':'+ Seguir'}</button>`:''}
        <button class="flex1 ${iGaveKudos?'':'ghost'}" onclick="handleToggleKudos('${username.replace(/'/g,"\\'")}')">${icon('award',14)} Apoyo (${social.kudos||0})</button>
        ${username!==currentUser?`<button class="flex1 ghost" onclick="openConversationFromProfile('${username.replace(/'/g,"\\'")}')">${icon('message',14)} Mensaje</button>`:''}
        <button class="flex1 ghost" onclick="document.getElementById('communityDetail').classList.add('hidden')">Cerrar</button>
      </div>
      ${username!==currentUser?`
        <div class="button-group">
          <button class="flex1 ghost small" onclick="handleToggleMute('${username.replace(/'/g,"\\'")}')">${iMuted?'Dejar de silenciar':'Silenciar'}</button>
          <button class="flex1 ghost small danger" onclick="handleToggleBlock('${username.replace(/'/g,"\\'")}')">${iBlocked?'Desbloquear':'Bloquear'}</button>
        </div>
      `:''}
      ${pinnedPost?`<div class="divider"></div><h3>📌 Publicación fijada</h3><div class="post-card">${renderPostCard(pinnedPost)}</div>`:''}
      <div class="divider"></div>
      <h3>Publicaciones de ${escapeHTML(username)}</h3>
      <div id="communityProfilePosts"><p class="muted">Cargando...</p></div>
      <div class="divider"></div>
      <h3>Comentarios</h3>
      <div id="communityComments">${(social.comments||[]).map(c=>`<div class="list-item"><span><strong>${escapeHTML(c.from)}:</strong> ${escapeHTML(c.text)}</span></div>`).join('') || '<p class="muted">Sin comentarios todavía.</p>'}</div>
      <div class="row" style="margin-top:10px;">
        <input type="text" id="communityCommentInput" placeholder="Escribe un comentario" style="margin:0;">
        <button class="ghost" onclick="handleAddCommunityComment('${username.replace(/'/g,"\\'")}')">Comentar</button>
      </div>
    `;
    const postsEl = document.getElementById('communityProfilePosts');
    const authorPosts = await fetchPostsByAuthor(username);
    if(postsEl){
      postsEl.innerHTML = authorPosts.length
        ? authorPosts.slice(0,6).map(p=>`<div class="list-item" style="align-items:flex-start; cursor:pointer;" onclick="handleTogglePinPost('${username.replace(/'/g,"\\'")}','${p.id}')" title="Click para fijar/quitar del perfil"><span>${escapeHTML((p.text||'').slice(0,120))}${p.text&&p.text.length>120?'…':''}${p.image?' 📷':''}${social.pinnedPostId===p.id?' 📌':''}</span><span class="muted post-time">${timeAgo(p.createdAt)}</span></div>`).join('')
        : '<p class="muted">Todavía no ha publicado nada.</p>';
    }
  }catch(e){ detailEl.innerHTML = `<p class="muted">Error: ${escapeHTML(e.message)}</p>`; }
}
function rankBadgeInline(rank){
  if(!rank) return '';
  return `<span class="xp-rank-badge xp-rank-badge-lg" style="color:${rank.color}; border-color:${rank.color}; background:${rank.color}22;">${iconFilled(rankIconName(rank.name),13)} ${rank.name}</span>`;
}
async function handleToggleFollow(username){
  try{
    await toggleFollow(username, currentUser);
    feedFollowingCache = null;
    const mySocial = await fetchSocial(currentUser);
    if((mySocial.following||[]).includes(username)){
      pushNotification(username, { type:'follow', text:`${currentUser} ha empezado a seguirte.`, from:currentUser }).catch(()=>{});
    }
    openCommunityProfile(username);
    toast('Actualizado.');
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function handleToggleKudos(username){
  try{ await toggleKudos(username, currentUser); feedFollowingCache = null; openCommunityProfile(username); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function handleAddCommunityComment(username){
  const input = document.getElementById('communityCommentInput');
  const text = input.value.trim();
  if(!text){ toast('Escribe algo primero.', 'error'); return; }
  try{
    await addSocialComment(username, currentUser, text);
    if(username!==currentUser) pushNotification(username, { type:'profile_comment', text:`${currentUser} comentó en tu perfil: "${text.slice(0,60)}"`, from:currentUser }).catch(()=>{});
    input.value=''; openCommunityProfile(username); toast('Comentario publicado.');
  }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* =========================================================
   FEED SOCIAL: publicaciones, likes, comentarios, compartir
========================================================= */
let stagedPostImage = null;
let communityFeedCache = [];
let communityMediaCache = {};
let feedFilter = 'all';
let feedOpenComments = new Set();

function autoGrow(el){ el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; const cc=document.getElementById('postCharCount'); if(cc) cc.textContent = `${el.value.length} / 600`; }

async function stagePostImage(event){
  const file = event.target.files[0];
  if(!file) return;
  try{
    stagedPostImage = await resizeImageFile(file, 1080, 0.72);
    renderStagedPostImage();
  }catch(e){ toast('No se pudo procesar la imagen: ' + e.message, 'error'); }
  event.target.value = '';
}
function renderStagedPostImage(){
  const wrap = document.getElementById('postImagePreview');
  const img = document.getElementById('postImagePreviewImg');
  if(stagedPostImage){ img.src = stagedPostImage; wrap.classList.remove('hidden'); }
  else{ img.src=''; wrap.classList.add('hidden'); }
}
function clearPostImage(){ stagedPostImage = null; renderStagedPostImage(); }

async function publishPost(){
  const textEl = document.getElementById('postText');
  const text = textEl.value.trim();
  let pollQuestion = '', pollOptions = [];
  if(pollBuilderOpen){
    pollQuestion = document.getElementById('pollQuestion').value.trim();
    pollOptions = [...document.querySelectorAll('.poll-option-input')].map(i=>i.value.trim()).filter(Boolean);
    if(!pollQuestion || pollOptions.length<2){ toast('La encuesta necesita una pregunta y al menos 2 opciones.', 'error'); return; }
  }
  if(!text && !stagedPostImage && !pollBuilderOpen){ toast('Escribe algo, añade una foto o crea una encuesta antes de publicar.', 'error'); return; }
  const btn = document.getElementById('publishPostBtn');
  btn.disabled = true; btn.textContent = 'Publicando...';
  try{
    if(pollBuilderOpen){ await createPollPost(currentUser, text, pollQuestion, pollOptions); }
    else{ await createPost(currentUser, text, stagedPostImage); }
    notifyMentions(text, currentUser, 'en una publicación');
    textEl.value = ''; textEl.style.height='auto';
    const cc = document.getElementById('postCharCount'); if(cc) cc.textContent = '0 / 600';
    clearPostImage();
    if(pollBuilderOpen){ togglePollBuilder(false); document.getElementById('pollQuestion').value=''; document.getElementById('pollOptionsWrap').innerHTML = '<input type="text" class="poll-option-input" placeholder="Opción 1" style="margin:0 0 6px;"><input type="text" class="poll-option-input" placeholder="Opción 2" style="margin:0 0 6px;">'; }
    toast('Publicación compartida con la comunidad.');
    await loadCommunityFeed();
  }catch(e){ toast('Error al publicar: ' + e.message, 'error'); }
  finally{ btn.disabled = false; btn.textContent = 'Publicar'; }
}

async function setFeedFilter(f){
  feedFilter = f;
  document.querySelectorAll('#sub-comm-feed .chip-filter[data-filter]').forEach(b=>b.classList.toggle('active', b.dataset.filter===f));
  if(f==='following' && !feedFollowingCache){ await primeFollowingCache(); }
  renderCommunityFeed();
}
let feedSearchQuery = '';
let feedHashtagFilter = null;
function handleFeedSearch(value){ feedSearchQuery = value.trim().toLowerCase(); renderCommunityFeed(); }
function setHashtagFilter(tag){
  feedHashtagFilter = (feedHashtagFilter===tag) ? null : tag;
  renderCommunityFeed();
}
function renderFeedHashtagBar(){
  const el = document.getElementById('feedHashtagBar');
  if(!el) return;
  const tagCounts = {};
  communityFeedCache.forEach(p=>{
    const tags = (p.text||'').match(/#(\w+)/g) || [];
    tags.forEach(t=>{ const tag = t.slice(1).toLowerCase(); tagCounts[tag] = (tagCounts[tag]||0)+1; });
  });
  const top = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  if(top.length===0){ el.classList.add('hidden'); el.innerHTML=''; return; }
  el.classList.remove('hidden');
  el.innerHTML = top.map(([tag,count])=>`<button class="chip-filter ${feedHashtagFilter===tag?'active':''}" onclick="setHashtagFilter('${tag}')">#${escapeHTML(tag)} · ${count}</button>`).join('');
}

async function loadCommunityFeed(){
  const el = document.getElementById('communityFeed');
  if(!el) return;
  el.innerHTML = '<p class="muted">Cargando publicaciones...</p>';
  try{
    const [posts, mediaMap, avatarStore] = await Promise.all([ fetchAllPosts(), fetchAllMediaMap(), (mediaStore?Promise.resolve(mediaStore):fetchMediaStoreFor(currentUser)) ]);
    communityFeedCache = posts;
    communityMediaCache = mediaMap;
    const composerAvatarEl = document.getElementById('composerAvatar');
    if(composerAvatarEl && avatarStore && avatarStore.avatar){ composerAvatarEl.innerHTML = `<img src="${avatarStore.avatar}" alt="">`; }
    // datos para el selector de mensajes nuevos
    const dl = document.getElementById('communityUsersList');
    if(dl){ dl.innerHTML = Object.keys(mediaMap).map(u=>`<option value="${escapeHTML(u)}">`).join(''); }
    renderFeedHashtagBar();
    await primeModerationCache();
    checkForNewPosts();
    renderCommunityFeed();
    const authorsInvolved = posts.map(p=>p.repostAuthor||p.author);
    primeRankCacheFor(authorsInvolved).then(renderCommunityFeed);
    loadStoriesBar();
    renderSuggestedFollows();
    renderTopStreaksWidget();
  }catch(e){ el.innerHTML = `<p class="muted">Error al cargar el feed: ${escapeHTML(e.message)}</p>`; }
}

function renderCommunityFeed(){
  const el = document.getElementById('communityFeed');
  if(!el) return;
  let list = communityFeedCache.filter(p=> !mutedUsersCache.has(p.author) && !blockedUsersCache.has(p.author) && !reportedPostsCache.has(p.id));
  if(feedFilter==='mine') list = list.filter(p=>p.author===currentUser);
  else if(feedFilter==='following'){
    list = list.filter(p=> feedFollowingCache && feedFollowingCache.has(p.author));
  } else if(feedFilter==='saved'){
    const saved = new Set((account && account.savedPosts) || []);
    list = list.filter(p=> saved.has(p.id));
  }
  if(feedHashtagFilter){
    list = list.filter(p=> (p.text||'').toLowerCase().includes('#'+feedHashtagFilter));
  }
  if(feedSearchQuery){
    list = list.filter(p=>
      (p.text||'').toLowerCase().includes(feedSearchQuery) ||
      p.author.toLowerCase().includes(feedSearchQuery.replace('@',''))
    );
  }
  if(list.length===0){
    const emptyMsgs = { mine:'Todavía no has publicado nada. ¡Comparte tu primer entrenamiento!', saved:'No has guardado ninguna publicación todavía.', following:'Todavía no sigues a nadie. Ve a Perfiles y empieza a seguir usuarios.' };
    el.innerHTML = `<div class="panel-card"><p class="muted">${emptyMsgs[feedFilter] || (feedSearchQuery||feedHashtagFilter ? 'No se han encontrado publicaciones con ese criterio.' : 'No hay publicaciones para mostrar todavía. ¡Sé el primero en compartir algo!')}</p></div>`;
    return;
  }
  if(feedSortMode==='popular'){
    list = [...list].sort((a,b)=> engagementScore(b) - engagementScore(a));
  }
  el.innerHTML = renderFeedWithDateSeparators(list);
}
let feedFollowingCache = null;
async function primeFollowingCache(){
  try{
    const mySocial = await fetchSocial(currentUser);
    feedFollowingCache = new Set(mySocial.following || []);
  }catch(e){ feedFollowingCache = new Set(); }
}

let feedSortMode = 'recent';
function toggleFeedSort(){
  feedSortMode = feedSortMode==='recent' ? 'popular' : 'recent';
  const btn = document.getElementById('feedSortBtn');
  if(btn) btn.textContent = feedSortMode==='popular' ? '🔥 Populares' : '🕐 Recientes';
  renderCommunityFeed();
}
function engagementScore(p){
  return Object.keys(p.reactions||{}).length + (p.comments||[]).length*2 + (p.shares||[]).length*3;
}
function feedDateLabel(iso){
  const d = new Date(iso); const now = new Date();
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nOnly-dOnly)/86400000);
  if(diffDays===0) return 'Hoy';
  if(diffDays===1) return 'Ayer';
  if(diffDays<7) return 'Esta semana';
  if(diffDays<30) return 'Este mes';
  return 'Más antiguas';
}
function renderFeedWithDateSeparators(list){
  if(feedSortMode==='popular') return list.map(p=>renderPostCard(p)).join('');
  let lastLabel = null;
  let html = '';
  list.forEach(p=>{
    const label = feedDateLabel(p.createdAt);
    if(label!==lastLabel){ html += `<div class="feed-date-separator"><span>${label}</span></div>`; lastLabel = label; }
    html += renderPostCard(p);
  });
  return html;
}
function timeAgo(iso){
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs/60000);
  if(mins < 1) return 'ahora mismo';
  if(mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins/60);
  if(hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs/24);
  if(days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-ES');
}

const REACTION_EMOJIS = ['❤️','💪','🔥','👏','😮'];
function linkifyPostText(text){
  let out = escapeHTML(text||'');
  out = out.replace(/#(\w+)/g, (m,tag)=>`<span class="post-hashtag" onclick="jumpToFeedHashtag('${tag.toLowerCase()}')">#${tag}</span>`);
  out = out.replace(/@(\w+)/g, (m,user)=>`<span class="post-mention" onclick="jumpToProfile('${user.replace(/'/g,"\\'")}')">@${user}</span>`);
  return out;
}
function jumpToFeedHashtag(tag){
  document.querySelector('.tab-panel.active .subtab-btn[data-sub="comm-feed"]').click();
  setTimeout(()=>setHashtagFilter(tag), 60);
}
function reactionSummary(post){
  const counts = {};
  Object.values(post.reactions||{}).forEach(e=>{ counts[e] = (counts[e]||0)+1; });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
}
function renderPostCard(p){
  const media = communityMediaCache[p.author] || {};
  const avatar = media.avatar ? `<img src="${media.avatar}" alt="">` : icon('user',18);
  const myReaction = (p.reactions||{})[currentUser];
  const reactions = reactionSummary(p);
  const totalReactions = Object.keys(p.reactions||{}).length || (p.likes||[]).length;
  const commentCount = (p.comments||[]).length;
  const shareCount = (p.shares||[]).length;
  const commentsOpen = feedOpenComments.has(p.id);
  const reactionPickerOpen = feedOpenReactionPicker===p.id;
  const isMine = p.author === currentUser;
  const isSaved = !!(account && (account.savedPosts||[]).includes(p.id));
  const isEditing = feedEditingPostId===p.id;
  const menuOpen = postMenuOpenId===p.id;
  const isRepost = !!p.repostOf;
  return `
    <div class="post-card" id="post-${p.id}">
      ${isRepost?`<div class="repost-tag">${icon('share',12)} ${escapeHTML(p.author)} republicó de ${escapeHTML(p.repostAuthor)}</div>`:''}
      <div class="post-head">
        <div class="row" style="gap:10px;">
          <div class="avatar-preview" style="width:38px;height:38px; cursor:pointer;" onclick="jumpToProfile('${p.author.replace(/'/g,"\\'")}')">${avatar}</div>
          <div>
            <strong class="post-author" onclick="jumpToProfile('${p.author.replace(/'/g,"\\'")}')">${escapeHTML(p.author)}</strong> ${rankBadgeHtml(p.author)}
            <div class="muted post-time">${timeAgo(p.createdAt)}${p.editedAt?' · editado':''}</div>
          </div>
        </div>
        <div class="row" style="gap:2px; position:relative;">
          <button class="icon-btn post-menu-btn" title="${isSaved?'Quitar de guardados':'Guardar publicación'}" onclick="handleToggleSavePost('${p.id}')">${isSaved?icon('check',15):icon('bookmark',15)}</button>
          ${isMine?`<button class="icon-btn post-menu-btn" title="Editar" onclick="startEditPost('${p.id}')">${icon('edit',15)}</button><button class="icon-btn post-menu-btn" title="Borrar publicación" onclick="handleDeletePost('${p.id}')">${icon('trash',15)}</button>`:''}
          <button class="icon-btn post-menu-btn" title="Más opciones" onclick="togglePostMenu('${p.id}')">${icon('dots',15)}</button>
          ${menuOpen?`<div class="post-dropdown-menu">${postMenuHtml(p)}</div>`:''}
        </div>
      </div>
      ${isEditing ? `
        <div class="post-edit-box">
          <textarea id="postEditInput-${p.id}" rows="2">${escapeHTML(p.text||'')}</textarea>
          <div class="button-group"><button class="small" onclick="saveEditPost('${p.id}')">Guardar</button><button class="small ghost" onclick="cancelEditPost()">Cancelar</button></div>
        </div>
      ` : (p.text?`<p class="post-text">${linkifyPostText(p.text)}</p>`:'')}
      ${p.image?`<div class="post-image"><img src="${p.image}" alt="" onclick="openLightbox('${p.image}')"></div>`:''}
      ${isRepost?`
        <div class="repost-embed">
          <strong class="post-author" onclick="jumpToProfile('${p.repostAuthor.replace(/'/g,"\\'")}')">${escapeHTML(p.repostAuthor)}</strong>
          ${p.repostText?`<p class="post-text">${linkifyPostText(p.repostText)}</p>`:''}
          ${p.repostImage?`<div class="post-image"><img src="${p.repostImage}" alt=""></div>`:''}
        </div>
      `:''}
      ${renderPollBlock(p)}
      ${p.templateShare?`
        <div class="template-share-block">
          <strong>${icon('bookmark',13)} Plantilla: ${escapeHTML(p.templateShare.name)}</strong>
          <p class="muted">${p.templateShare.exercises.length} ejercicio(s)</p>
          ${!isMine?`<button class="ghost small" onclick="duplicateSharedTemplate('${p.id}')">Duplicar a mis plantillas</button>`:''}
        </div>
      `:''}
      ${reactions.length?`<div class="post-reaction-summary" onclick="showReactionViewers('${p.id}')" style="cursor:pointer;">${reactions.map(([e,c])=>`<span>${e} ${c}</span>`).join(' ')}</div>`:''}
      <div class="post-actions">
        <div class="post-reaction-wrap">
          <button class="post-action-btn ${myReaction?'liked':''}" onclick="toggleReactionPicker('${p.id}')">${myReaction?myReaction:icon('heart',16)} <span>${totalReactions}</span></button>
          ${reactionPickerOpen?`<div class="reaction-picker">${REACTION_EMOJIS.map(e=>`<button class="reaction-picker-btn ${myReaction===e?'active':''}" onclick="handleSetReaction('${p.id}','${e}')">${e}</button>`).join('')}</div>`:''}
        </div>
        <button class="post-action-btn" onclick="togglePostComments('${p.id}')">${icon('comment',16)} <span>${commentCount}</span></button>
        <button class="post-action-btn" onclick="handleRepost('${p.id}')" title="Republicar">${icon('share',16)} <span>${shareCount}</span></button>
        <button class="post-action-btn" onclick="handleSharePost('${p.id}')" title="Compartir externamente / por mensaje">${icon('send',15)}</button>
      </div>
      <div class="post-comments ${commentsOpen?'':'hidden'}" id="postComments-${p.id}">
        <div class="post-comments-list">
          ${(p.comments||[]).map(c=>{
            const cLiked = (c.likes||[]).includes(currentUser);
            const cLikeCount = (c.likes||[]).length;
            return `<div class="post-comment"><strong onclick="jumpToProfile('${c.from.replace(/'/g,"\\'")}')">${escapeHTML(c.from)}</strong> <span>${linkifyPostText(c.text)}</span><div class="muted post-time">${escapeHTML(c.date)} · <span class="reply-link" onclick="replyToComment('${p.id}','${c.from.replace(/'/g,"\\'")}')">Responder</span> · <span class="reply-link ${cLiked?'liked-text':''}" onclick="handleToggleCommentLike('${p.id}',${c.id})">Me gusta${cLikeCount?` (${cLikeCount})`:''}</span></div></div>`;
          }).join('') || '<p class="muted" style="margin:6px 0;">Sé el primero en comentar.</p>'}
        </div>
        <div class="row" style="margin-top:8px; gap:6px; position:relative;">
          <input type="text" placeholder="Escribe un comentario... usa @usuario" id="postCommentInput-${p.id}" style="margin:0;" oninput="handleMentionTypeahead(this,'mentionList-${p.id}')" onkeydown="if(event.key==='Enter'){handlePostComment('${p.id}');}">
          <div id="mentionList-${p.id}" class="mention-suggestions hidden"></div>
          <button class="ghost small" onclick="handlePostComment('${p.id}')">Enviar</button>
        </div>
      </div>
    </div>
  `;
}
async function duplicateSharedTemplate(postId){
  const post = communityFeedCache.find(p=>p.id===postId);
  if(!post || !post.templateShare) return;
  account.routineTemplates = account.routineTemplates || [];
  account.routineTemplates.push({ id: Date.now(), name: post.templateShare.name + ' (copia)', exercises: JSON.parse(JSON.stringify(post.templateShare.exercises)) });
  try{ await saveAccount(); toast('Plantilla añadida a tus rutinas.'); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}

function notifyMentions(text, fromUser, context){
  const mentions = [...new Set(((text||'').match(/@(\w+)/g)||[]).map(m=>m.slice(1)))];
  mentions.forEach(async (username)=>{
    if(username===fromUser) return;
    const acc = await fetchAccount(username).catch(()=>null);
    if(acc){ pushNotification(username, { type:'mention', text:`${fromUser} te mencionó ${context}.`, from:fromUser }).catch(()=>{}); }
  });
}

let feedOpenReactionPicker = null;
function toggleReactionPicker(postId){
  feedOpenReactionPicker = feedOpenReactionPicker===postId ? null : postId;
  renderCommunityFeed();
}
async function handleSetReaction(postId, emoji){
  try{
    const result = await setPostReaction(postId, currentUser, emoji);
    const post = communityFeedCache.find(p=>p.id===postId);
    if(post){
      post.reactions = post.reactions || {};
      if(result){ post.reactions[currentUser] = result; if(post.author!==currentUser) pushNotification(post.author, { type:'reaction', text:`${currentUser} reaccionó ${result} a tu publicación.`, from:currentUser, postId }).catch(()=>{}); }
      else{ delete post.reactions[currentUser]; }
      post.likes = Object.keys(post.reactions);
    }
    feedOpenReactionPicker = null;
    renderCommunityFeed();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}

function togglePostComments(postId){
  if(feedOpenComments.has(postId)) feedOpenComments.delete(postId); else feedOpenComments.add(postId);
  renderCommunityFeed();
  if(feedOpenComments.has(postId)){ const inp = document.getElementById(`postCommentInput-${postId}`); if(inp) inp.focus(); }
}
async function handleToggleCommentLike(postId, commentId){
  try{
    await toggleCommentLike(postId, commentId, currentUser);
    const post = communityFeedCache.find(p=>p.id===postId);
    if(post){
      const c = (post.comments||[]).find(c=>c.id===commentId);
      if(c){ c.likes = c.likes || []; const idx = c.likes.indexOf(currentUser); if(idx>=0) c.likes.splice(idx,1); else c.likes.push(currentUser); }
    }
    renderCommunityFeed();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function handlePostComment(postId){
  const input = document.getElementById(`postCommentInput-${postId}`);
  const text = input.value.trim();
  if(!text) return;
  try{
    const comment = await addPostComment(postId, currentUser, text);
    const post = communityFeedCache.find(p=>p.id===postId);
    if(post){
      post.comments = post.comments || [];
      post.comments.push(comment);
      if(post.author!==currentUser) pushNotification(post.author, { type:'comment', text:`${currentUser} comentó tu publicación: "${text.slice(0,60)}"`, from:currentUser, postId }).catch(()=>{});
    }
    notifyMentions(text, currentUser, 'en un comentario');
    input.value = '';
    feedOpenComments.add(postId);
    renderCommunityFeed();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function handleToggleSavePost(postId){
  account.savedPosts = account.savedPosts || [];
  const idx = account.savedPosts.indexOf(postId);
  if(idx>=0) account.savedPosts.splice(idx,1); else account.savedPosts.push(postId);
  try{ await saveAccount(); renderCommunityFeed(); toast(idx>=0?'Publicación quitada de guardados.':'Publicación guardada.'); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
let feedEditingPostId = null;
function startEditPost(postId){ feedEditingPostId = postId; renderCommunityFeed(); setTimeout(()=>{ const el=document.getElementById(`postEditInput-${postId}`); if(el) el.focus(); }, 30); }
function cancelEditPost(){ feedEditingPostId = null; renderCommunityFeed(); }
async function saveEditPost(postId){
  const input = document.getElementById(`postEditInput-${postId}`);
  const newText = input.value.trim();
  try{
    await editPostText(postId, currentUser, newText);
    const post = communityFeedCache.find(p=>p.id===postId);
    if(post){ post.text = newText; post.editedAt = new Date().toISOString(); }
    feedEditingPostId = null;
    renderCommunityFeed();
    toast('Publicación actualizada.');
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function handleSharePost(postId){
  try{
    await registerPostShare(postId, currentUser);
    const post = communityFeedCache.find(p=>p.id===postId);
    if(post){ post.shares = post.shares || []; post.shares.push({by:currentUser, date:new Date().toISOString()}); }
    renderCommunityFeed();
    const shareText = `Mira esta publicación de ${post?post.author:''} en Wilks Pro: ${post&&post.text?post.text.slice(0,80):''}`;
    const wantsDm = confirm('Publicación compartida. ¿Quieres además enviarla por mensaje directo a un usuario? (Cancelar para compartir solo externamente)');
    if(wantsDm){
      const target = prompt('¿A qué usuario quieres enviársela?');
      if(target && target.trim() && target.trim()!==currentUser){
        try{ await sendDirectMessage(currentUser, target.trim(), shareText); toast('Enviado por mensaje a ' + target.trim() + '.'); }
        catch(e){ toast('No se pudo enviar el mensaje: ' + e.message, 'error'); }
      }
      return;
    }
    if(navigator.share){
      try{ await navigator.share({ title:'Wilks Pro', text: shareText }); }catch(e){ /* cancelado por el usuario */ }
    } else {
      try{ await navigator.clipboard.writeText(shareText); toast('Texto copiado al portapapeles.'); }
      catch(e){ toast('Publicación compartida.'); }
    }
  }catch(e){ toast('Error al compartir: ' + e.message, 'error'); }
}
async function handleDeletePost(postId){
  if(!confirm('¿Borrar esta publicación? Esta acción no se puede deshacer.')) return;
  try{
    await deletePostById(postId, currentUser);
    communityFeedCache = communityFeedCache.filter(p=>p.id!==postId);
    renderCommunityFeed();
    toast('Publicación borrada.');
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
function jumpToProfile(username){
  document.querySelector('.tab-panel.active .subtab-btn[data-sub="comm-profiles"]').click();
  setTimeout(()=>openCommunityProfile(username), 60);
}

/* =========================================================
   CENTRO DE NOTIFICACIONES
========================================================= */
let notificationsCache = [];
async function refreshNotifUnreadIndicator(){
  try{
    const list = await fetchNotifications(currentUser);
    const unread = list.filter(n=>!n.read).length;
    const dot = document.getElementById('notifUnreadDot');
    if(dot){ dot.classList.toggle('hidden', unread===0); dot.textContent = unread>9?'9+':(unread||''); }
    const topDot = document.getElementById('topbarNotifDot');
    if(topDot) topDot.classList.toggle('hidden', unread===0);
  }catch(e){}
}
const NOTIF_ICON = { follow:'user', reaction:'heart', comment:'comment', profile_comment:'comment', mention:'message' };
async function loadNotifications(){
  const el = document.getElementById('notificationsList');
  if(!el) return;
  el.innerHTML = '<p class="muted">Cargando...</p>';
  try{
    notificationsCache = await fetchNotifications(currentUser);
    if(notificationsCache.length===0){ el.innerHTML = '<p class="muted">No tienes notificaciones todavía.</p>'; return; }
    el.innerHTML = notificationsCache.map(n=>`
      <div class="list-item notif-item ${n.read?'':'unread'}" onclick="handleOpenNotification('${(n.from||'').replace(/'/g,"\\'")}')">
        <div class="row" style="gap:10px;">
          <div class="notif-icon">${icon(NOTIF_ICON[n.type]||'award',15)}</div>
          <div><span>${escapeHTML(n.text)}</span><div class="muted post-time">${timeAgo(n.date)}</div></div>
        </div>
      </div>
    `).join('');
    await markAllNotificationsRead(currentUser);
    refreshNotifUnreadIndicator();
  }catch(e){ el.innerHTML = `<p class="muted">Error: ${escapeHTML(e.message)}</p>`; }
}
function handleOpenNotification(fromUser){
  if(!fromUser) return;
  document.querySelector('.tab-panel.active .subtab-btn[data-sub="comm-profiles"]').click();
  setTimeout(()=>openCommunityProfile(fromUser), 60);
}
async function handleMarkAllNotificationsRead(){
  try{ await markAllNotificationsRead(currentUser); loadNotifications(); }catch(e){}
}

/* =========================================================
   MENSAJES DIRECTOS (DM) entre usuarios
========================================================= */
let dmActivePeer = null;
let dmInboxCache = [];
let dmPollHandle = null;

function openMoreSheet(){
  document.getElementById('moreSheetBackdrop').classList.add('open');
  document.getElementById('moreSheet').classList.add('open');
}
function closeMoreSheet(){
  document.getElementById('moreSheetBackdrop').classList.remove('open');
  document.getElementById('moreSheet').classList.remove('open');
}
async function quickJumpCommunity(subId){
  await showTab('community');
  showSub(subId);
}
async function refreshDmUnreadIndicator(){
  try{
    const inbox = await fetchInboxSummaries(currentUser);
    const totalUnread = inbox.reduce((s,c)=>s+c.unread,0);
    const dot = document.getElementById('dmUnreadDot');
    if(dot){ dot.classList.toggle('hidden', totalUnread===0); dot.textContent = totalUnread>9?'9+':(totalUnread||''); }
    const topDot = document.getElementById('topbarDmDot');
    if(topDot) topDot.classList.toggle('hidden', totalUnread===0);
  }catch(e){}
}

async function loadDmInbox(){
  const listEl = document.getElementById('dmConversationList');
  if(!listEl) return;
  listEl.innerHTML = '<p class="muted">Cargando conversaciones...</p>';
  try{
    dmInboxCache = await fetchInboxSummaries(currentUser);
    renderDmInbox();
    refreshDmUnreadIndicator();
  }catch(e){ listEl.innerHTML = `<p class="muted">Error: ${escapeHTML(e.message)}</p>`; }
}
function renderDmInbox(){
  const listEl = document.getElementById('dmConversationList');
  if(!listEl) return;
  if(dmInboxCache.length===0){ listEl.innerHTML = '<p class="muted">Todavía no tienes conversaciones. Escribe un usuario arriba para empezar.</p>'; return; }
  listEl.innerHTML = dmInboxCache.map(c=>`
    <div class="dm-conv-item ${dmActivePeer===c.other?'active':''}" onclick="openConversation('${c.other.replace(/'/g,"\\'")}')">
      <div class="avatar-preview" style="width:34px;height:34px;">${(communityMediaCache[c.other]&&communityMediaCache[c.other].avatar)?`<img src="${communityMediaCache[c.other].avatar}" alt="">`:icon('user',16)}</div>
      <div style="flex:1; min-width:0;">
        <strong>${escapeHTML(c.other)}</strong>
        <div class="muted dm-last-msg">${escapeHTML((c.last.from===currentUser?'Tú: ':'') + c.last.text)}</div>
      </div>
      ${c.unread>0?`<span class="dm-unread-badge">${c.unread}</span>`:''}
    </div>
  `).join('');
}
async function startNewConversation(){
  const input = document.getElementById('dmNewUser');
  const username = input.value.trim();
  if(!username){ toast('Escribe un nombre de usuario.', 'error'); return; }
  if(username===currentUser){ toast('No puedes enviarte mensajes a ti mismo.', 'error'); return; }
  const acc = await fetchAccount(username);
  if(!acc){ toast('Ese usuario no existe.', 'error'); return; }
  input.value = '';
  openConversation(username);
}
function openConversationFromProfile(username){
  document.querySelector('.tab-panel.active .subtab-btn[data-sub="comm-messages"]').click();
  setTimeout(()=>openConversation(username), 60);
}
async function openConversation(username){
  dmActivePeer = username;
  renderDmInbox();
  const chatArea = document.getElementById('dmChatArea');
  chatArea.innerHTML = '<p class="muted" style="padding:16px;">Cargando conversación...</p>';
  try{
    const msgs = await fetchConversation(currentUser, username);
    renderDmChat(username, msgs);
    await markConversationRead(currentUser, username, currentUser);
    refreshDmUnreadIndicator();
  }catch(e){ chatArea.innerHTML = `<p class="muted" style="padding:16px;">Error: ${escapeHTML(e.message)}</p>`; }
}
const DM_EMOJIS = ['😀','😂','😍','😎','🥳','😢','😡','😱','🤔','👍','👎','👏','🙌','💪','🔥','💯','🏆','🥇','⚡','🎉','❤️','🧡','💛','💚','💙','💜','🤝','🙏','😴','🤕','🥵','🥶'];
const DM_STICKERS = ['💪','🔥','🏆','🥇','🎉','👏','💯','⚡','😤','🥵','🙌','🚀','🧠','😎','💀','👑'];

function renderDmBubbleContent(m){
  const type = m.type || 'text';
  if(type==='image'){
    return `<div class="dm-image-wrap"><img src="${m.image}" alt="" class="dm-image" onclick="openLightbox('${m.image}')"></div>${m.text?`<div class="dm-caption">${escapeHTML(m.text)}</div>`:''}`;
  }
  if(type==='audio'){
    return `<div class="dm-audio-wrap">🎤 <audio controls src="${m.audio}"></audio></div>`;
  }
  if(type==='sticker'){
    return `<span class="dm-sticker">${m.sticker}</span>`;
  }
  return `<div>${linkifyPostText(m.text)}</div>`;
}
function renderDmChat(username, msgs){
  const media = communityMediaCache[username] || {};
  const chatArea = document.getElementById('dmChatArea');
  chatArea.innerHTML = `
    <div class="dm-chat-head">
      <div class="avatar-preview" style="width:32px;height:32px;">${media.avatar?`<img src="${media.avatar}" alt="">`:icon('user',16)}</div>
      <strong>${escapeHTML(username)}</strong>
    </div>
    <div class="dm-messages" id="dmMessages">
      ${msgs.length===0?'<p class="muted" style="padding:14px;">Aún no hay mensajes. ¡Envía el primero!</p>':msgs.map(m=>`
        <div class="dm-bubble ${m.from===currentUser?'me':'them'} ${m.type==='sticker'?'is-sticker':''}">
          ${renderDmBubbleContent(m)}
          <div class="dm-bubble-time">${new Date(m.date).toLocaleString('es-ES', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' })}</div>
        </div>
      `).join('')}
    </div>
    <div id="dmEmojiPicker" class="dm-picker-panel hidden">${DM_EMOJIS.map(e=>`<button class="dm-picker-emoji" onclick="insertDmEmoji('${e}')">${e}</button>`).join('')}</div>
    <div id="dmStickerPicker" class="dm-picker-panel hidden">${DM_STICKERS.map(e=>`<button class="dm-picker-emoji" onclick="sendDmSticker('${e}')">${e}</button>`).join('')}</div>
    <div id="dmRecordBar" class="dm-record-bar hidden">
      <span class="dm-record-dot"></span> Grabando audio... <strong id="dmRecordTime">0:00</strong>
      <button class="ghost small" onclick="cancelDmRecording()">Cancelar</button>
      <button class="small" onclick="stopDmRecording()">Enviar</button>
    </div>
    <div class="dm-input-row">
      <input type="file" id="dmImageFile" accept="image/*" style="display:none;" onchange="stageDmImage(event)">
      <button type="button" class="icon-btn" title="Emoji" onclick="toggleDmEmojiPicker()">😀</button>
      <button type="button" class="icon-btn" title="Stickers" onclick="toggleDmStickerPicker()">🎉</button>
      <button type="button" class="icon-btn" title="Enviar foto" onclick="document.getElementById('dmImageFile').click()">${icon('image',16)}</button>
      <button type="button" class="icon-btn" title="Mensaje de voz" onclick="startDmRecording()">🎤</button>
      <input type="text" id="dmMessageInput" placeholder="Escribe un mensaje..." onkeydown="if(event.key==='Enter'){handleSendDm();}">
      <button onclick="handleSendDm()">${icon('send',15)}</button>
    </div>
  `;
  const box = document.getElementById('dmMessages');
  if(box) box.scrollTop = box.scrollHeight;
}
function toggleDmEmojiPicker(){
  document.getElementById('dmStickerPicker').classList.add('hidden');
  document.getElementById('dmEmojiPicker').classList.toggle('hidden');
}
function toggleDmStickerPicker(){
  document.getElementById('dmEmojiPicker').classList.add('hidden');
  document.getElementById('dmStickerPicker').classList.toggle('hidden');
}
function insertDmEmoji(e){
  const input = document.getElementById('dmMessageInput');
  input.value += e;
  input.focus();
}
async function sendDmSticker(e){
  if(!dmActivePeer) return;
  document.getElementById('dmStickerPicker').classList.add('hidden');
  try{
    await sendDirectMessage(currentUser, dmActivePeer, '', { type:'sticker', sticker:e });
    const msgs = await fetchConversation(currentUser, dmActivePeer);
    renderDmChat(dmActivePeer, msgs);
    loadDmInbox();
  }catch(err){ toast('Error al enviar: ' + err.message, 'error'); }
}
async function stageDmImage(event){
  const file = event.target.files[0];
  if(!file || !dmActivePeer) return;
  event.target.value = '';
  try{
    const dataUrl = await resizeImageFile(file, 1000, 0.72);
    await sendDirectMessage(currentUser, dmActivePeer, '', { type:'image', image:dataUrl });
    const msgs = await fetchConversation(currentUser, dmActivePeer);
    renderDmChat(dmActivePeer, msgs);
    loadDmInbox();
  }catch(e){ toast('No se pudo enviar la imagen: ' + e.message, 'error'); }
}

/* ---- Mensajes de voz en DM ---- */
let dmMediaRecorder = null;
let dmRecordedChunks = [];
let dmRecordStream = null;
let dmRecordTimerHandle = null;
let dmRecordSeconds = 0;
async function startDmRecording(){
  if(!dmActivePeer){ toast('Selecciona una conversación primero.', 'error'); return; }
  try{
    dmRecordStream = await navigator.mediaDevices.getUserMedia({ audio:true });
  }catch(e){ toast('No se pudo acceder al micrófono: ' + e.message, 'error'); return; }
  dmRecordedChunks = [];
  dmMediaRecorder = new MediaRecorder(dmRecordStream);
  dmMediaRecorder.ondataavailable = ev=>{ if(ev.data.size>0) dmRecordedChunks.push(ev.data); };
  dmMediaRecorder.start();
  dmRecordSeconds = 0;
  document.getElementById('dmRecordBar').classList.remove('hidden');
  document.getElementById('dmRecordTime').textContent = '0:00';
  dmRecordTimerHandle = setInterval(()=>{
    dmRecordSeconds++;
    const m = Math.floor(dmRecordSeconds/60), s = dmRecordSeconds%60;
    document.getElementById('dmRecordTime').textContent = `${m}:${s.toString().padStart(2,'0')}`;
    if(dmRecordSeconds>=60) stopDmRecording();
  }, 1000);
}
function cancelDmRecording(){
  if(dmMediaRecorder && dmMediaRecorder.state!=='inactive') dmMediaRecorder.stop();
  if(dmRecordStream) dmRecordStream.getTracks().forEach(t=>t.stop());
  clearInterval(dmRecordTimerHandle);
  document.getElementById('dmRecordBar').classList.add('hidden');
  dmMediaRecorder = null; dmRecordedChunks = [];
}
function stopDmRecording(){
  if(!dmMediaRecorder){ document.getElementById('dmRecordBar').classList.add('hidden'); return; }
  clearInterval(dmRecordTimerHandle);
  document.getElementById('dmRecordBar').classList.add('hidden');
  dmMediaRecorder.onstop = async ()=>{
    if(dmRecordStream) dmRecordStream.getTracks().forEach(t=>t.stop());
    const blob = new Blob(dmRecordedChunks, { type:'audio/webm' });
    if(blob.size > MAX_VIDEO_BYTES){ toast('El audio pesa demasiado.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async ()=>{
      try{
        await sendDirectMessage(currentUser, dmActivePeer, '', { type:'audio', audio:reader.result, durationSec:dmRecordSeconds });
        const msgs = await fetchConversation(currentUser, dmActivePeer);
        renderDmChat(dmActivePeer, msgs);
        loadDmInbox();
      }catch(e){ toast('No se pudo enviar el audio: ' + e.message, 'error'); }
    };
    reader.readAsDataURL(blob);
  };
  if(dmMediaRecorder.state!=='inactive') dmMediaRecorder.stop();
}

async function handleSendDm(){
  if(!dmActivePeer) return;
  const input = document.getElementById('dmMessageInput');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  try{
    await sendDirectMessage(currentUser, dmActivePeer, text);
    const msgs = await fetchConversation(currentUser, dmActivePeer);
    renderDmChat(dmActivePeer, msgs);
    loadDmInbox();
  }catch(e){ toast('Error al enviar: ' + e.message, 'error'); }
}

/* =========================================================
   RANGO DE RETOS: insignia junto al nombre en el feed / perfil
========================================================= */
let communityRankCache = {};
async function primeRankCacheFor(usernames){
  const uniq = [...new Set(usernames)].filter(u=>!(u in communityRankCache));
  for(const u of uniq){
    try{
      const acc = await fetchAccount(u);
      communityRankCache[u] = acc ? getRankForXP(computeChallengeXP(acc)).current : null;
    }catch(e){ communityRankCache[u] = null; }
  }
}
function rankIconName(rankName){
  const map = { Bronce:'rank-bronze', Plata:'rank-silver', Oro:'rank-gold', Platino:'rank-platinum', Diamante:'rank-diamond', Leyenda:'rank-legend' };
  return map[rankName] || 'award';
}
function rankBadgeHtml(username){
  const r = communityRankCache[username];
  if(!r) return '';
  return `<span class="xp-rank-badge" style="color:${r.color}; border-color:${r.color}; background:${r.color}22;" title="Rango: ${r.name}">${iconFilled(rankIconName(r.name),12)}</span>`;
}

/* =========================================================
   HISTORIAS (contenido efímero de 24h)
========================================================= */
let storiesCache = {};
let storyViewerQueue = [];
let storyViewerIndex = 0;
let storyViewerTimer = null;
let stagedStoryImage = null;

async function loadStoriesBar(){
  const el = document.getElementById('storiesBar');
  if(!el) return;
  try{
    storiesCache = await fetchAllStories();
    const myAvatar = (mediaStore && mediaStore.avatar) ? `<img src="${mediaStore.avatar}" alt="">` : icon('user',20);
    const others = Object.keys(storiesCache).filter(u=>u!==currentUser);
    const myStories = storiesCache[currentUser] || [];
    let html = `
      <div class="story-item" onclick="${myStories.length ? `openStoryViewer('${currentUser}')` : `openCreateStoryModal()`}">
        <div class="story-ring ${myStories.length?'has-story':'no-story'}"><div class="story-avatar">${myAvatar}</div>${myStories.length?'':'<span class="story-add-badge">+</span>'}</div>
        <span class="story-label">Tu historia</span>
      </div>`;
    html += others.map(u=>{
      const media = communityMediaCache[u] || {};
      const avatar = media.avatar ? `<img src="${media.avatar}" alt="">` : icon('user',20);
      const allSeen = (storiesCache[u]||[]).every(s=>(s.viewedBy||[]).includes(currentUser));
      return `<div class="story-item" onclick="openStoryViewer('${u.replace(/'/g,"\\'")}')">
        <div class="story-ring ${allSeen?'seen':'unseen'}"><div class="story-avatar">${avatar}</div></div>
        <span class="story-label">${escapeHTML(u)}</span>
      </div>`;
    }).join('');
    el.innerHTML = html;
  }catch(e){ el.innerHTML = `<p class="muted">No se pudieron cargar las historias.</p>`; }
}
function openCreateStoryModal(){
  document.getElementById('storyComposerText').value = '';
  stagedStoryImage = null;
  renderStagedStoryImage();
  document.getElementById('createStoryModal').classList.add('open');
}
function closeCreateStoryModal(){ document.getElementById('createStoryModal').classList.remove('open'); }
async function stageStoryImage(event){
  const file = event.target.files[0];
  if(!file) return;
  try{ stagedStoryImage = await resizeImageFile(file, 900, 0.7); renderStagedStoryImage(); }
  catch(e){ toast('No se pudo procesar la imagen: ' + e.message, 'error'); }
  event.target.value = '';
}
function renderStagedStoryImage(){
  const wrap = document.getElementById('storyComposerPreview');
  const img = document.getElementById('storyComposerPreviewImg');
  if(stagedStoryImage){ img.src = stagedStoryImage; wrap.classList.remove('hidden'); }
  else{ img.src=''; wrap.classList.add('hidden'); }
}
async function publishStory(){
  const text = document.getElementById('storyComposerText').value.trim();
  if(!text && !stagedStoryImage){ toast('Añade una foto o un texto para tu historia.', 'error'); return; }
  try{
    await createStory(currentUser, stagedStoryImage, text);
    closeCreateStoryModal();
    toast('Historia publicada. Estará visible 24 horas.');
    loadStoriesBar();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
function openStoryViewer(username){
  storyViewerQueue = storiesCache[username] || [];
  if(storyViewerQueue.length===0){ if(username===currentUser) openCreateStoryModal(); return; }
  storyViewerIndex = 0;
  document.getElementById('storyViewer').classList.add('open');
  document.getElementById('storyViewerUser').textContent = username;
  const media = communityMediaCache[username] || (username===currentUser?mediaStore:{});
  document.getElementById('storyViewerAvatar').innerHTML = (media&&media.avatar) ? `<img src="${media.avatar}" alt="">` : icon('user',16);
  document.getElementById('storyViewerFooter').innerHTML = username===currentUser
    ? `<button class="ghost small danger" onclick="handleDeleteCurrentStory('${username.replace(/'/g,"\\'")}')">Borrar esta historia</button>`
    : '';
  renderStoryProgress();
  showCurrentStory(username);
}
function renderStoryProgress(){
  const row = document.getElementById('storyProgressRow');
  row.innerHTML = storyViewerQueue.map((s,i)=>`<div class="story-progress-track"><div class="story-progress-fill ${i<storyViewerIndex?'full':''}" id="storyProgress-${i}"></div></div>`).join('');
}
function showCurrentStory(username){
  clearTimeout(storyViewerTimer);
  const s = storyViewerQueue[storyViewerIndex];
  if(!s){ closeStoryViewer(); return; }
  markStoryViewed(username, s.id, currentUser).catch(()=>{});
  document.getElementById('storyViewerTime').textContent = timeAgo(s.createdAt);
  const contentEl = document.getElementById('storyViewerContent');
  contentEl.innerHTML = s.image
    ? `<img src="${s.image}" alt="">${s.text?`<div class="story-caption">${escapeHTML(s.text)}</div>`:''}`
    : `<div class="story-text-slide">${escapeHTML(s.text)}</div>`;
  const fill = document.getElementById(`storyProgress-${storyViewerIndex}`);
  if(fill){ fill.style.transition='none'; fill.style.width='0%'; requestAnimationFrame(()=>{ fill.style.transition='width 5s linear'; fill.style.width='100%'; }); }
  storyViewerTimer = setTimeout(()=>storyNext(), 5000);
}
function storyNext(){
  storyViewerIndex++;
  if(storyViewerIndex >= storyViewerQueue.length){ closeStoryViewer(); return; }
  showCurrentStory(document.getElementById('storyViewerUser').textContent);
}
function storyPrev(){
  storyViewerIndex = Math.max(0, storyViewerIndex-1);
  showCurrentStory(document.getElementById('storyViewerUser').textContent);
}
function closeStoryViewer(){
  clearTimeout(storyViewerTimer);
  document.getElementById('storyViewer').classList.remove('open');
  loadStoriesBar();
}
async function handleDeleteCurrentStory(username){
  const s = storyViewerQueue[storyViewerIndex];
  if(!s || !confirm('¿Borrar esta historia?')) return;
  try{ await deleteStory(username, s.id); toast('Historia borrada.'); closeStoryViewer(); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* =========================================================
   ENCUESTAS en publicaciones
========================================================= */
let pollBuilderOpen = false;
function togglePollBuilder(forceOpen){
  pollBuilderOpen = forceOpen!==undefined ? !!forceOpen : !pollBuilderOpen;
  document.getElementById('postPollBuilder').classList.toggle('hidden', !pollBuilderOpen);
}
function addPollOption(){
  const wrap = document.getElementById('pollOptionsWrap');
  if(wrap.children.length>=4){ toast('Máximo 4 opciones.', 'error'); return; }
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'poll-option-input'; input.style.margin = '0 0 6px';
  input.placeholder = `Opción ${wrap.children.length+1}`;
  wrap.appendChild(input);
}
async function handleVotePoll(postId, optionIndex){
  try{
    await votePoll(postId, currentUser, optionIndex);
    const post = communityFeedCache.find(p=>p.id===postId);
    if(post && post.poll){ post.poll.options.forEach(o=>{ o.votes = (o.votes||[]).filter(v=>v!==currentUser); }); post.poll.options[optionIndex].votes.push(currentUser); }
    renderCommunityFeed();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
function renderPollBlock(post){
  if(!post.poll) return '';
  const totalVotes = post.poll.options.reduce((s,o)=>s+(o.votes||[]).length,0);
  const myVoteIdx = post.poll.options.findIndex(o=>(o.votes||[]).includes(currentUser));
  return `<div class="poll-block">
    <strong>${escapeHTML(post.poll.question)}</strong>
    ${post.poll.options.map((o,i)=>{
      const pct = totalVotes ? Math.round(((o.votes||[]).length/totalVotes)*100) : 0;
      return `<button class="poll-option-btn ${myVoteIdx===i?'voted':''}" onclick="handleVotePoll('${post.id}', ${i})">
        <span class="poll-option-fill" style="width:${pct}%;"></span>
        <span class="poll-option-label">${escapeHTML(o.text)}</span><span class="poll-option-pct">${pct}%</span>
      </button>`;
    }).join('')}
    <p class="muted" style="margin-top:4px;">${totalVotes} voto${totalVotes===1?'':'s'}</p>
  </div>`;
}

/* =========================================================
   REPOST
========================================================= */
async function handleRepost(postId){
  const post = communityFeedCache.find(p=>p.id===postId);
  if(!post) return;
  const caption = prompt('Añade un comentario a tu republicación (opcional):', '');
  if(caption===null) return;
  try{
    await createRepost(currentUser, post, caption);
    if(post.author!==currentUser) pushNotification(post.author, { type:'repost', text:`${currentUser} republicó tu publicación.`, from:currentUser, postId }).catch(()=>{});
    toast('Publicación republicada en tu perfil.');
    loadCommunityFeed();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* =========================================================
   SILENCIAR / BLOQUEAR / REPORTAR / FIJAR
========================================================= */
let mutedUsersCache = new Set();
let blockedUsersCache = new Set();
async function primeModerationCache(){
  try{ const social = await fetchSocial(currentUser); mutedUsersCache = new Set(social.muted||[]); blockedUsersCache = new Set(social.blocked||[]); }
  catch(e){}
}
async function handleToggleMute(username){
  try{ await toggleMuteUser(username, currentUser); await primeModerationCache(); renderCommunityFeed(); toast(mutedUsersCache.has(username)?`Has silenciado a ${username}.`:`Ya no silencias a ${username}.`); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function handleToggleBlock(username){
  if(!confirm(`¿${blockedUsersCache.has(username)?'Desbloquear':'Bloquear'} a ${username}?`)) return;
  try{ await toggleBlockUser(username, currentUser); await primeModerationCache(); renderCommunityFeed(); toast('Actualizado.'); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
function handleReportPost(postId){
  const reason = prompt('¿Por qué quieres reportar esta publicación? (se ocultará de tu feed)');
  if(reason===null) return;
  reportedPostsCache.add(postId);
  renderCommunityFeed();
  toast('Publicación reportada y ocultada de tu feed. Gracias por avisar.');
}
let reportedPostsCache = new Set();
async function handleTogglePinPost(username, postId){
  try{
    await togglePinPost(username, postId);
    toast('Actualizado.');
    if(document.getElementById('communityDetail') && !document.getElementById('communityDetail').classList.contains('hidden')) openCommunityProfile(username);
    renderCommunityFeed();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
function postMenuHtml(p){
  const isMine = p.author===currentUser;
  const isMuted = mutedUsersCache.has(p.author);
  const isBlocked = blockedUsersCache.has(p.author);
  const items = [];
  if(isMine){
    items.push(`<button onclick="handleTogglePinPost('${p.author.replace(/'/g,"\\'")}','${p.id}'); closePostMenu();">${icon('bookmark',13)} Fijar/quitar del perfil</button>`);
  } else {
    items.push(`<button onclick="handleToggleMute('${p.author.replace(/'/g,"\\'")}'); closePostMenu();">${isMuted?'Dejar de silenciar':'Silenciar'} a ${escapeHTML(p.author)}</button>`);
    items.push(`<button onclick="handleToggleBlock('${p.author.replace(/'/g,"\\'")}'); closePostMenu();">${isBlocked?'Desbloquear':'Bloquear'} a ${escapeHTML(p.author)}</button>`);
    items.push(`<button onclick="handleReportPost('${p.id}'); closePostMenu();">Reportar publicación</button>`);
  }
  return items.join('');
}
let postMenuOpenId = null;
function togglePostMenu(postId){ postMenuOpenId = postMenuOpenId===postId ? null : postId; renderCommunityFeed(); }
function closePostMenu(){ postMenuOpenId = null; renderCommunityFeed(); }

/* =========================================================
   VER QUIÉN HA REACCIONADO
========================================================= */
function showReactionViewers(postId){
  const post = communityFeedCache.find(p=>p.id===postId);
  if(!post || !post.reactions || Object.keys(post.reactions).length===0){ toast('Todavía no hay reacciones.'); return; }
  const lines = Object.entries(post.reactions).map(([u,e])=>`${e} ${u}`).join('\n');
  alert('Han reaccionado:\n' + lines);
}

/* =========================================================
   RESPONDER A UN COMENTARIO
========================================================= */
function replyToComment(postId, username){
  feedOpenComments.add(postId);
  renderCommunityFeed();
  setTimeout(()=>{
    const input = document.getElementById(`postCommentInput-${postId}`);
    if(input){ input.value = `@${username} `; input.focus(); }
  }, 30);
}

/* =========================================================
   AUTOCOMPLETAR MENCIONES (@usuario) mientras se escribe
========================================================= */
function handleMentionTypeahead(inputEl, listId){
  const val = inputEl.value;
  const cursor = inputEl.selectionStart;
  const upToCursor = val.slice(0, cursor);
  const match = upToCursor.match(/@(\w*)$/);
  const listEl = document.getElementById(listId);
  if(!match){ if(listEl) listEl.classList.add('hidden'); return; }
  const query = match[1].toLowerCase();
  const candidates = Object.keys(communityMediaCache).filter(u=>u.toLowerCase().startsWith(query) && u!==currentUser).slice(0,5);
  if(!listEl) return;
  if(candidates.length===0){ listEl.classList.add('hidden'); return; }
  listEl.classList.remove('hidden');
  listEl.innerHTML = candidates.map(u=>`<div class="mention-suggestion" onmousedown="applyMentionSuggestion('${inputEl.id}','${listId}','${u.replace(/'/g,"\\'")}')">@${escapeHTML(u)}</div>`).join('');
}
function applyMentionSuggestion(inputId, listId, username){
  const inputEl = document.getElementById(inputId);
  const val = inputEl.value;
  const cursor = inputEl.selectionStart;
  const upToCursor = val.slice(0, cursor);
  const replaced = upToCursor.replace(/@(\w*)$/, `@${username} `);
  inputEl.value = replaced + val.slice(cursor);
  document.getElementById(listId).classList.add('hidden');
  inputEl.focus();
}

/* =========================================================
   SUGERENCIAS PARA SEGUIR Y TOP RACHAS
========================================================= */
async function renderSuggestedFollows(){
  const el = document.getElementById('suggestedFollowsWidget');
  if(!el) return;
  try{
    const mySocial = await fetchSocial(currentUser);
    const following = new Set(mySocial.following||[]);
    const candidates = Object.keys(communityMediaCache).filter(u=>u!==currentUser && !following.has(u));
    if(candidates.length===0){ el.innerHTML = '<h3 style="margin-top:0;">Descubrir personas</h3><p class="muted">Ya sigues a toda la comunidad.</p>'; return; }
    const shuffled = candidates.sort(()=>Math.random()-0.5).slice(0,4);
    el.innerHTML = `<h3 style="margin-top:0;">Descubrir personas</h3>` + shuffled.map(u=>{
      const media = communityMediaCache[u] || {};
      const avatar = media.avatar ? `<img src="${media.avatar}" alt="">` : icon('user',15);
      return `<div class="suggestion-row">
        <div class="row" style="gap:8px; cursor:pointer;" onclick="jumpToProfile('${u.replace(/'/g,"\\'")}')">
          <div class="avatar-preview" style="width:30px;height:30px;">${avatar}</div><span>${escapeHTML(u)}</span>
        </div>
        <button class="ghost small" onclick="handleQuickFollow('${u.replace(/'/g,"\\'")}')">+ Seguir</button>
      </div>`;
    }).join('');
  }catch(e){ el.innerHTML = ''; }
}
async function handleQuickFollow(username){
  try{
    await toggleFollow(username, currentUser);
    pushNotification(username, { type:'follow', text:`${currentUser} ha empezado a seguirte.`, from:currentUser }).catch(()=>{});
    feedFollowingCache = null;
    toast(`Ahora sigues a ${username}.`);
    renderSuggestedFollows();
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function renderTopStreaksWidget(){
  const el = document.getElementById('topStreaksWidget');
  if(!el) return;
  try{
    const usernames = Object.keys(communityMediaCache).slice(0,15);
    const streaks = [];
    for(const u of usernames){
      const acc = await fetchAccount(u);
      if(acc) streaks.push({ username:u, streak: computeDailyChallengeStreak(acc) });
    }
    streaks.sort((a,b)=>b.streak-a.streak);
    const top = streaks.filter(s=>s.streak>0).slice(0,5);
    el.innerHTML = `<h3 style="margin-top:0;">🔥 Top rachas</h3>` + (top.length
      ? top.map((s,i)=>`<div class="suggestion-row"><span>${i+1}. ${escapeHTML(s.username)}</span><strong>${s.streak} días</strong></div>`).join('')
      : '<p class="muted">Nadie tiene una racha activa todavía.</p>');
  }catch(e){ el.innerHTML = ''; }
}

/* =========================================================
   INDICADOR DE PUBLICACIONES NUEVAS
========================================================= */
let lastSeenFeedTimestamp = null;
function checkForNewPosts(){
  const banner = document.getElementById('newPostsBanner');
  if(!banner || communityFeedCache.length===0) return;
  const newest = communityFeedCache[0].createdAt;
  if(lastSeenFeedTimestamp && newest > lastSeenFeedTimestamp){ banner.classList.remove('hidden'); }
  else{ banner.classList.add('hidden'); }
  lastSeenFeedTimestamp = lastSeenFeedTimestamp || newest;
}
function scrollFeedToTopAndRefresh(){
  document.getElementById('newPostsBanner').classList.add('hidden');
  lastSeenFeedTimestamp = communityFeedCache[0] ? communityFeedCache[0].createdAt : lastSeenFeedTimestamp;
  loadCommunityFeed();
  document.getElementById('communityFeed').scrollIntoView({ behavior:'smooth' });
}

/* =========================================================
   RUTINAS: CONSTRUCTOR DE PLANTILLAS
========================================================= */
function addBuilderExercise(){
  const name = document.getElementById('builderExerciseName').value.trim();
  const setsCount = Math.max(1, parseInt(document.getElementById('builderSetsCount').value) || 3);
  const w = document.getElementById('builderDefaultWeight').value;
  const r = document.getElementById('builderDefaultReps').value;
  const rir = document.getElementById('builderDefaultRIR').value;
  if(!name){ toast('Escribe un nombre de ejercicio.', 'error'); return; }
  const sets = [];
  for(let i=0;i<setsCount;i++){ sets.push({ targetWeight: w||'', targetReps: r||'', targetRIR: rir||'', notes:'' }); }
  builderExercises.push({ name, sets });
  document.getElementById('builderExerciseName').value = '';
  document.getElementById('builderDefaultWeight').value = '';
  document.getElementById('builderDefaultReps').value = '';
  document.getElementById('builderDefaultRIR').value = '';
  renderBuilderExercises();
  renderExerciseDatalist();
}
function removeBuilderExercise(idx){ builderExercises.splice(idx,1); renderBuilderExercises(); }
function addBuilderSet(exIdx){ builderExercises[exIdx].sets.push({targetWeight:'',targetReps:'',targetRIR:'',notes:''}); renderBuilderExercises(); }
function removeBuilderSet(exIdx, setIdx){ builderExercises[exIdx].sets.splice(setIdx,1); renderBuilderExercises(); }
function updateBuilderSetField(exIdx, setIdx, field, value){ builderExercises[exIdx].sets[setIdx][field] = value; }
function renderBuilderExercises(){
  const el = document.getElementById('builderExerciseList');
  if(!el) return;
  if(builderExercises.length===0){ el.innerHTML = '<p class="muted">Todavía no has añadido ejercicios a esta plantilla.</p>'; return; }
  el.innerHTML = builderExercises.map((ex,exIdx)=>`
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <strong>${escapeHTML(ex.name)}</strong>
        <button class="small danger" onclick="removeBuilderExercise(${exIdx})">${icon('trash',12)} Quitar ejercicio</button>
      </div>
      <table style="margin-top:10px;"><thead><tr><th>#</th><th>Peso</th><th>Reps</th><th>RIR</th><th>Notas</th><th></th></tr></thead>
      <tbody>
        ${ex.sets.map((s,setIdx)=>`
          <tr>
            <td>${setIdx+1}</td>
            <td><input type="number" value="${s.targetWeight}" style="margin:0;" oninput="updateBuilderSetField(${exIdx},${setIdx},'targetWeight',this.value)"></td>
            <td><input type="number" value="${s.targetReps}" style="margin:0;" oninput="updateBuilderSetField(${exIdx},${setIdx},'targetReps',this.value)"></td>
            <td><input type="number" value="${s.targetRIR}" style="margin:0;" oninput="updateBuilderSetField(${exIdx},${setIdx},'targetRIR',this.value)"></td>
            <td><input type="text" value="${escapeHTML(s.notes)}" style="margin:0;" oninput="updateBuilderSetField(${exIdx},${setIdx},'notes',this.value)"></td>
            <td><button class="small ghost" onclick="removeBuilderSet(${exIdx},${setIdx})">${icon('trash',11)}</button></td>
          </tr>
        `).join('')}
      </tbody></table>
      <div class="button-group"><button class="small ghost" onclick="addBuilderSet(${exIdx})">+ Serie</button></div>
    </div>
  `).join('');
}
async function saveTemplate(){
  const name = document.getElementById('templateName').value.trim();
  if(!name){ toast('Ponle un nombre a la plantilla.', 'error'); return; }
  if(builderExercises.length===0){ toast('Añade al menos un ejercicio.', 'error'); return; }
  account.routineTemplates = account.routineTemplates || [];
  account.routineTemplates.push({ id: Date.now(), name, exercises: JSON.parse(JSON.stringify(builderExercises)), createdAt: new Date().toISOString() });
  try{ await saveAccount(); toast('Plantilla guardada.'); }catch(e){ toast('Error: ' + e.message, 'error'); }
  builderExercises = [];
  document.getElementById('templateName').value = '';
  renderBuilderExercises();
  renderTemplateList();
  renderAchievements();
}
async function deleteTemplate(id){
  account.routineTemplates = (account.routineTemplates||[]).filter(t=>t.id!==id);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderTemplateList();
}
function renderTemplateList(){
  const el = document.getElementById('templateList');
  if(!el || !account) return;
  const templates = account.routineTemplates || [];
  if(templates.length===0){ el.innerHTML = '<p class="muted">Todavía no tienes plantillas guardadas.</p>'; return; }
  el.innerHTML = templates.map(t=>`
    <div class="list-item">
      <div><strong>${escapeHTML(t.name)}</strong><div class="muted">${t.exercises.length} ejercicio(s) · ${t.exercises.reduce((s,e)=>s+e.sets.length,0)} series en total</div></div>
      <div class="row">
        <button class="small" onclick="startSession(${t.id})">Usar plantilla</button>
        <button class="small danger" onclick="deleteTemplate(${t.id})">${icon('trash',12)}</button>
      </div>
    </div>
  `).join('');
}

/* =========================================================
   PLANIFICACIÓN POR CICLOS: split repetido N veces con progresión
   automática o manual por ejercicio, aplicado a un calendario real.
========================================================= */
const WEEKDAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const WEEKDAY_SHORT = ['D','L','M','X','J','V','S'];

function planDayBuilderHtml(idx){
  return `
    <div class="plan-day-row" data-day-idx="${idx}">
      <div class="grid grid-2">
        <div><label>Nombre del día</label><input type="text" class="plan-day-name" placeholder="Ej: Pecho"></div>
        <div><label>Día de la semana</label>
          <select class="plan-day-weekday">
            ${[1,2,3,4,5,6,0].map(w=>`<option value="${w}">${WEEKDAY_NAMES[w]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="plan-day-exercises"></div>
      <div class="button-group">
        <button type="button" class="ghost small" onclick="addPlanExercise(this)">+ Ejercicio</button>
        <button type="button" class="ghost small danger" onclick="this.closest('.plan-day-row').remove()">Quitar este día</button>
      </div>
    </div>
  `;
}
function planExerciseRowHtml(){
  return `
    <div class="plan-exercise-row">
      <input type="text" class="plan-ex-name" placeholder="Ejercicio (ej: Press banca)">
      <input type="number" class="plan-ex-weight" placeholder="Peso inicial (kg)" step="0.5">
      <select class="plan-ex-mode" onchange="this.nextElementSibling.style.display = this.value==='progressive' ? '' : 'none';">
        <option value="manual">Peso fijo</option>
        <option value="progressive">Progresivo</option>
      </select>
      <input type="number" class="plan-ex-increment" placeholder="+kg cada vez" step="0.5" style="display:none;">
      <button type="button" class="ghost small danger" onclick="this.closest('.plan-exercise-row').remove()">✕</button>
    </div>
  `;
}
function addPlanSplitDay(){
  const wrap = document.getElementById('planDaysBuilder');
  const idx = wrap.children.length;
  wrap.insertAdjacentHTML('beforeend', planDayBuilderHtml(idx));
  addPlanExercise(wrap.lastElementChild.querySelector('button'));
}
function addPlanExercise(btn){
  const container = btn.closest('.plan-day-row').querySelector('.plan-day-exercises');
  container.insertAdjacentHTML('beforeend', planExerciseRowHtml());
}

async function generateTrainingPlan(){
  const name = document.getElementById('planName').value.trim();
  const startDate = document.getElementById('planStartDate').value;
  const cycles = parseInt(document.getElementById('planCycles').value, 10) || 1;
  if(!name || !startDate){ toast('Ponle un nombre y una fecha de inicio al plan.', 'error'); return; }
  const dayRows = [...document.querySelectorAll('.plan-day-row')];
  if(dayRows.length===0){ toast('Añade al menos un día al ciclo.', 'error'); return; }
  const splitDays = [];
  for(const row of dayRows){
    const dayName = row.querySelector('.plan-day-name').value.trim();
    const weekday = parseInt(row.querySelector('.plan-day-weekday').value, 10);
    if(!dayName){ toast('Ponle nombre a todos los días del ciclo.', 'error'); return; }
    const exercises = [...row.querySelectorAll('.plan-exercise-row')].map(exRow=>({
      id: Date.now()+Math.random().toString(36).slice(2,6),
      name: exRow.querySelector('.plan-ex-name').value.trim(),
      startWeight: parseFloat(exRow.querySelector('.plan-ex-weight').value) || 0,
      mode: exRow.querySelector('.plan-ex-mode').value,
      increment: parseFloat(exRow.querySelector('.plan-ex-increment').value) || 0
    })).filter(e=>e.name);
    if(exercises.length===0){ toast(`Añade al menos un ejercicio al día "${dayName}".`, 'error'); return; }
    splitDays.push({ id: Date.now()+Math.random().toString(36).slice(2,6), name:dayName, weekday, exercises });
  }
  const plan = { id: Date.now(), name, createdAt:new Date().toISOString(), startDate, cycles, splitDays, overrides:{} };
  account.trainingPlans = account.trainingPlans || [];
  account.trainingPlans.push(plan);
  try{
    await saveAccount();
    toast('Plan generado. Ya puedes ver tu calendario.');
    document.getElementById('planName').value=''; document.getElementById('planDaysBuilder').innerHTML='';
    renderPlanList();
    renderTodayPlanCard();
    openPlanCalendar(plan.id);
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}

function computePlanSchedule(plan){
  const occurrences = [];
  const targetCounts = {};
  plan.splitDays.forEach(d=>{ targetCounts[d.id] = 0; });
  const totalNeeded = plan.splitDays.length * plan.cycles;
  let cursor = new Date(plan.startDate + 'T00:00:00');
  let safety = 0;
  while(occurrences.length < totalNeeded && safety < 3000){
    safety++;
    const wd = cursor.getDay();
    const matchDay = plan.splitDays.find(d=>d.weekday===wd);
    if(matchDay && targetCounts[matchDay.id] < plan.cycles){
      targetCounts[matchDay.id]++;
      const occurrenceNumber = targetCounts[matchDay.id];
      const dateStr = cursor.toISOString().slice(0,10);
      const dayOverrides = (plan.overrides && plan.overrides[dateStr]) || {};
      const exercises = matchDay.exercises.map(ex=>{
        let weight = ex.mode==='progressive' ? ex.startWeight + ex.increment*(occurrenceNumber-1) : ex.startWeight;
        if(dayOverrides[ex.id]!=null) weight = dayOverrides[ex.id];
        return { id:ex.id, name:ex.name, weight: Math.round(weight*100)/100, occurrenceNumber };
      });
      occurrences.push({ date:dateStr, splitDayId:matchDay.id, splitDayName:matchDay.name, occurrenceNumber, exercises });
    }
    cursor.setDate(cursor.getDate()+1);
  }
  return occurrences;
}

function renderPlanList(){
  const el = document.getElementById('planList');
  if(!el || !account) return;
  const plans = account.trainingPlans || [];
  if(plans.length===0){ el.innerHTML = '<p class="muted">Todavía no has creado ningún plan.</p>'; return; }
  el.innerHTML = plans.map(p=>`
    <div class="list-item">
      <div>
        <strong>${escapeHTML(p.name)}</strong>
        <div class="muted">${p.splitDays.length} días de ciclo × ${p.cycles} repeticiones · desde ${escapeHTML(p.startDate)}</div>
      </div>
      <div class="row">
        <button class="small ghost" onclick="openPlanCalendar(${p.id})">Ver calendario</button>
        <button class="small danger" onclick="deleteTrainingPlan(${p.id})">${icon('trash',12)}</button>
      </div>
    </div>
  `).join('');
}
async function deleteTrainingPlan(planId){
  if(!confirm('¿Borrar este plan y su calendario? Esta acción no se puede deshacer.')) return;
  account.trainingPlans = (account.trainingPlans||[]).filter(p=>p.id!==planId);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderPlanList();
  renderTodayPlanCard();
  if(activePlanId===planId){ activePlanId = null; document.getElementById('planCalendarCard').classList.add('hidden'); document.getElementById('planDayDetailCard').classList.add('hidden'); }
  toast('Plan borrado.');
}

let activePlanId = null;
let planCalendarYear = null;
let planCalendarMonth = null;
function openPlanCalendar(planId){
  activePlanId = planId;
  const plan = (account.trainingPlans||[]).find(p=>p.id===planId);
  if(!plan) return;
  const start = new Date(plan.startDate + 'T00:00:00');
  planCalendarYear = start.getFullYear();
  planCalendarMonth = start.getMonth();
  document.getElementById('planCalendarCard').classList.remove('hidden');
  document.getElementById('planCalendarCard').scrollIntoView({ behavior:'smooth', block:'start' });
  renderPlanCalendarGrid();
}
function shiftPlanCalendarMonth(delta){
  planCalendarMonth += delta;
  if(planCalendarMonth<0){ planCalendarMonth=11; planCalendarYear--; }
  if(planCalendarMonth>11){ planCalendarMonth=0; planCalendarYear++; }
  renderPlanCalendarGrid();
}
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function renderPlanCalendarGrid(){
  const plan = (account.trainingPlans||[]).find(p=>p.id===activePlanId);
  if(!plan) return;
  const schedule = computePlanSchedule(plan);
  const byDate = {};
  schedule.forEach(o=>{ byDate[o.date] = o; });
  document.getElementById('planCalendarTitle').textContent = `${MONTH_NAMES[planCalendarMonth]} ${planCalendarYear}`;
  const firstOfMonth = new Date(planCalendarYear, planCalendarMonth, 1);
  const startOffset = (firstOfMonth.getDay()+6)%7; // lunes=0
  const daysInMonth = new Date(planCalendarYear, planCalendarMonth+1, 0).getDate();
  const dayColors = {}; const palette = ['#f2b90f','#a77dff','#3ddc84','#ff4d67','#4d8ce8','#e0c23a','#4fb872'];
  plan.splitDays.forEach((d,i)=>{ dayColors[d.id] = palette[i%palette.length]; });
  let cells = '';
  for(let i=0;i<startOffset;i++) cells += `<div class="plan-cal-cell empty"></div>`;
  const todayStrVal = todayStr();
  for(let day=1; day<=daysInMonth; day++){
    const dateStr = `${planCalendarYear}-${String(planCalendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const occ = byDate[dateStr];
    const isToday = dateStr===todayStrVal;
    cells += `<div class="plan-cal-cell ${occ?'has-occ':''} ${isToday?'is-today':''}" ${occ?`onclick="openPlanDayDetail(${plan.id}, '${dateStr}')"`:''}>
      <span class="plan-cal-daynum">${day}</span>
      ${occ?`<span class="plan-cal-dot" style="background:${dayColors[occ.splitDayId]};" title="${escapeHTML(occ.splitDayName)}"></span>`:''}
    </div>`;
  }
  document.getElementById('planCalendarGrid').innerHTML = cells;
  document.getElementById('planCalendarLegend').innerHTML = plan.splitDays.map(d=>`<span class="plan-cal-legend-item"><span class="plan-cal-dot" style="background:${dayColors[d.id]};"></span>${escapeHTML(d.name)}</span>`).join('');
}
function openPlanDayDetail(planId, dateStr){
  const plan = (account.trainingPlans||[]).find(p=>p.id===planId);
  if(!plan) return;
  const schedule = computePlanSchedule(plan);
  const occ = schedule.find(o=>o.date===dateStr);
  const card = document.getElementById('planDayDetailCard');
  card.classList.remove('hidden');
  if(!occ){ card.innerHTML = '<p class="muted">No hay sesión planificada este día.</p>'; return; }
  const dateLabel = new Date(dateStr+'T00:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  card.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <h2 style="margin:0;">${escapeHTML(occ.splitDayName)} · ${dateLabel}</h2>
      <button class="ghost small" onclick="document.getElementById('planDayDetailCard').classList.add('hidden')">Cerrar</button>
    </div>
    <p class="muted">Repetición nº ${occ.occurrenceNumber} de ${plan.cycles}. Ajusta el peso manualmente si lo necesitas: se guardará como excepción solo para este día.</p>
    <div id="planDayExerciseRows">
      ${occ.exercises.map(ex=>`
        <div class="grid grid-2" data-ex-id="${ex.id}">
          <div><label>${escapeHTML(ex.name)}</label></div>
          <div><label>Peso (kg)</label><input type="number" step="0.5" class="plan-day-weight-input" value="${ex.weight}"></div>
        </div>
      `).join('')}
    </div>
    <div class="button-group">
      <button onclick="savePlanDayOverrides(${plan.id}, '${dateStr}')">Guardar cambios de este día</button>
      ${dateStr===todayStr()?`<button class="ghost" onclick="startSessionFromPlan(${plan.id}, '${dateStr}')">Iniciar sesión con estos pesos</button>`:''}
    </div>
  `;
}
async function savePlanDayOverrides(planId, dateStr){
  const plan = (account.trainingPlans||[]).find(p=>p.id===planId);
  if(!plan) return;
  plan.overrides = plan.overrides || {};
  plan.overrides[dateStr] = plan.overrides[dateStr] || {};
  document.querySelectorAll('#planDayExerciseRows > div').forEach(row=>{
    const exId = row.dataset.exId;
    const val = parseFloat(row.querySelector('.plan-day-weight-input').value);
    if(!isNaN(val)) plan.overrides[dateStr][exId] = val;
  });
  try{ await saveAccount(); toast('Cambios guardados para este día.'); renderPlanCalendarGrid(); renderTodayPlanCard(); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
function renderTodayPlanCard(){
  const card = document.getElementById('todayPlanCard');
  if(!card || !account) return;
  const plans = account.trainingPlans || [];
  const t = todayStr();
  let todayHtml = '';
  let matchedPlan = null, matchedOcc = null;
  for(const plan of plans){
    const schedule = computePlanSchedule(plan);
    const occ = schedule.find(o=>o.date===t);
    if(occ){ matchedPlan = plan; matchedOcc = occ; break; }
  }
  if(matchedOcc){
    todayHtml = `
      <h2 style="margin:0;">Hoy toca: ${escapeHTML(matchedOcc.splitDayName)}</h2>
      <p class="muted">Plan "${escapeHTML(matchedPlan.name)}" · repetición ${matchedOcc.occurrenceNumber} de ${matchedPlan.cycles}</p>
      <div class="grid grid-3">
        ${matchedOcc.exercises.map(ex=>`<div class="card" style="margin-top:0;"><strong>${escapeHTML(ex.name)}</strong><div class="wilks-score">${ex.weight} kg</div></div>`).join('')}
      </div>
      <div class="button-group">
        <button onclick="startSessionFromPlan(${matchedPlan.id}, '${t}')">Iniciar sesión con estos pesos</button>
        <button class="ghost" onclick="openPlanCalendar(${matchedPlan.id})">Ver calendario completo</button>
      </div>
    `;
  } else {
    todayHtml = `<h2 style="margin:0;">Sin sesión planificada hoy</h2><p class="muted">Crea un plan de ciclos más abajo para planificar automáticamente el peso de cada día.</p>`;
  }
  // Próximos entrenamientos planificados (de todos los planes, excluyendo hoy)
  let upcoming = [];
  plans.forEach(plan=>{
    computePlanSchedule(plan).filter(o=>o.date>t).forEach(o=>upcoming.push({ plan, occ:o }));
  });
  upcoming.sort((a,b)=> a.occ.date.localeCompare(b.occ.date));
  upcoming = upcoming.slice(0,5);
  const upcomingHtml = upcoming.length ? `
    <div class="divider"></div>
    <h3>Próximos entrenamientos planificados</h3>
    <div>
      ${upcoming.map(({plan,occ})=>{
        const label = new Date(occ.date+'T00:00:00').toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' });
        return `<div class="list-item" style="cursor:pointer;" onclick="openPlanCalendar(${plan.id})">
          <div><strong>${escapeHTML(occ.splitDayName)}</strong><div class="muted">${label} · ${escapeHTML(plan.name)}</div></div>
          <span class="muted">${occ.exercises.map(e=>`${escapeHTML(e.name)} ${e.weight}kg`).join(' · ')}</span>
        </div>`;
      }).join('')}
    </div>
  ` : '';
  card.innerHTML = todayHtml + upcomingHtml;
}
function startSessionFromPlan(planId, dateStr){
  const plan = (account.trainingPlans||[]).find(p=>p.id===planId);
  if(!plan) return;
  const schedule = computePlanSchedule(plan);
  const occ = schedule.find(o=>o.date===dateStr);
  if(!occ) return;
  if(activeSession && !confirm('Ya hay una sesión en curso. ¿Descartarla y empezar una nueva?')) return;
  pauseSessionTimer();
  activeSession = {
    id: Date.now(),
    templateId: null,
    templateName: `${plan.name} · ${occ.splitDayName}`,
    date: todayStr(),
    lastSessionDate: null,
    exercises: occ.exercises.map(ex=>({
      name: ex.name,
      sets: [{ weight: ex.weight, reps:'', rir:'', notes:'', setSeconds:null, restSeconds:null, mediaId:null, done:false, prevWeight:ex.weight, prevReps:'', prevIsActual:false }]
    }))
  };
  sessionElapsedSeconds = 0; restElapsedSeconds = 0; restTimerRunning = false; activeSetRef = null;
  showTab('training').then(()=>showSub('tr-routines'));
  startSessionTimer();
  renderActiveSession();
  toast('Sesión iniciada desde tu plan: ' + occ.splitDayName);
}

/* =========================================================
   RUTINAS: SESIÓN ACTIVA (cronómetro de entreno, series y descansos)
========================================================= */
function findLastCompletedSession(templateId){
  if(!account || !account.workoutSessions || templateId==null) return null;
  const matches = account.workoutSessions
    .filter(s=>s.templateId===templateId)
    .sort((a,b)=> (b.endedAt||'').localeCompare(a.endedAt||''));
  return matches[0] || null;
}
function startSession(templateId){
  if(activeSession && !confirm('Ya hay una sesión en curso. ¿Descartarla y empezar una nueva?')) return;
  pauseSessionTimer();
  const template = templateId ? (account.routineTemplates||[]).find(t=>t.id===templateId) : null;
  const lastSession = template ? findLastCompletedSession(template.id) : null;
  activeSession = {
    id: Date.now(),
    templateId: template ? template.id : null,
    templateName: template ? template.name : 'Entrenamiento libre',
    date: todayStr(),
    lastSessionDate: lastSession ? lastSession.date : null,
    exercises: template ? JSON.parse(JSON.stringify(template.exercises)).map(ex=>{
      const prevEx = lastSession ? lastSession.exercises.find(pe=>pe.name===ex.name) : null;
      return {
        name: ex.name,
        sets: ex.sets.map((s,idx)=>{
          const prevSet = prevEx ? prevEx.sets[idx] : null;
          const hasPrevActual = !!(prevSet && prevSet.weight!=='' && prevSet.weight!=null && prevSet.reps!=='' && prevSet.reps!=null);
          const prevWeight = hasPrevActual ? prevSet.weight : (s.targetWeight || '');
          const prevReps = hasPrevActual ? prevSet.reps : (s.targetReps || '');
          return {
            weight:'', reps:'', rir: s.targetRIR||'', notes: s.notes||'',
            setSeconds:null, restSeconds:null, mediaId:null, done:false,
            prevWeight, prevReps, prevIsActual: hasPrevActual
          };
        })
      };
    }) : []
  };
  sessionElapsedSeconds = 0;
  restElapsedSeconds = 0;
  restTimerRunning = false;
  activeSetRef = null;
  showSub('tr-routines');
  startSessionTimer();
  renderActiveSession();
  toast('Sesión iniciada: ' + activeSession.templateName);
}
function startFreeSession(){ startSession(null); }
function startSessionTimer(){
  if(sessionTimerInterval) return;
  sessionTimerInterval = setInterval(()=>{
    sessionElapsedSeconds++;
    const d = document.getElementById('sessionTimerDisplay');
    if(d) d.textContent = formatTime(sessionElapsedSeconds);
  }, 1000);
}
function pauseSessionTimer(){ clearInterval(sessionTimerInterval); sessionTimerInterval = null; }
function addSessionExercise(){
  if(!activeSession) return;
  const name = document.getElementById('sessionNewExerciseName').value.trim();
  if(!name){ toast('Escribe un ejercicio.', 'error'); return; }
  activeSession.exercises.push({ name, sets: [] });
  document.getElementById('sessionNewExerciseName').value = '';
  addSessionSet(activeSession.exercises.length-1);
  renderExerciseDatalist();
}
function addSessionSet(exIdx){
  activeSession.exercises[exIdx].sets.push({ weight:'', reps:'', rir:'', notes:'', setSeconds:null, restSeconds:null, mediaId:null, done:false, prevWeight:'', prevReps:'', prevIsActual:false });
  renderActiveSession();
}
function updateSessionSetField(exIdx, setIdx, field, value){ activeSession.exercises[exIdx].sets[setIdx][field] = value; }
function startSetTimer(exIdx, setIdx){
  if(restTimerRunning){ stopRestTimerAndAssign(exIdx, setIdx); }
  activeSetRef = { exIdx, setIdx };
  setElapsedSeconds = 0;
  clearInterval(setTimerInterval);
  setTimerInterval = setInterval(()=>{ setElapsedSeconds++; renderActiveSession(); }, 1000);
  renderActiveSession();
}
async function stopSetTimer(exIdx, setIdx){
  clearInterval(setTimerInterval); setTimerInterval = null;
  const set = activeSession.exercises[exIdx].sets[setIdx];
  set.setSeconds = setElapsedSeconds;
  activeSetRef = null;
  await completeSet(exIdx, setIdx);
  startRestTimer();
  renderActiveSession();
}
function startRestTimer(){
  restElapsedSeconds = 0; restTimerRunning = true;
  clearInterval(restTimerInterval);
  restTimerInterval = setInterval(()=>{
    restElapsedSeconds++;
    const d = document.getElementById('sessionRestDisplay');
    if(d) d.textContent = formatTime(restElapsedSeconds);
  }, 1000);
}
function stopRestTimerAndAssign(exIdx, setIdx){
  clearInterval(restTimerInterval); restTimerInterval = null; restTimerRunning = false;
  activeSession.exercises[exIdx].sets[setIdx].restSeconds = restElapsedSeconds;
}
async function completeSet(exIdx, setIdx){
  const ex = activeSession.exercises[exIdx];
  const set = ex.sets[setIdx];
  const weight = parseFloat(set.weight);
  const reps = parseFloat(set.reps);
  if(isNaN(weight) || isNaN(reps)){ toast('Falta peso o repeticiones en esta serie; no se ha guardado como entrenamiento.', 'error'); return; }
  set.done = true;
  const noteParts = [];
  if(set.notes) noteParts.push(set.notes);
  const rirVal = (set.rir!=='' && set.rir!=null) ? parseFloat(set.rir) : null;
  const workoutEntry = {
    id: Date.now() + Math.floor(Math.random()*1000), date: activeSession.date, exercise: ex.name,
    weight, reps, sets:1, rir: rirVal, notes: noteParts.join(' · '), mediaId: set.mediaId || null, videoLink: null, sessionId: activeSession.id
  };
  account.workouts.push(workoutEntry);
  try{ await saveAccount(); await registerExerciseIfNew(ex.name, currentUser); }
  catch(e){ toast('Error al guardar la serie: ' + e.message, 'error'); }
}
function openSessionSetCamera(exIdx, setIdx){ sessionMediaTarget = { exIdx, setIdx }; openCameraModal('sessionSet', true); }
async function handleSessionSetFile(event, exIdx, setIdx){
  const file = event.target.files[0];
  if(!file) return;
  sessionMediaTarget = { exIdx, setIdx };
  try{
    let media;
    if(file.type.startsWith('video/')){
      if(file.size > MAX_VIDEO_BYTES){ toast('El vídeo pesa más de 20 MB.', 'error'); event.target.value=''; return; }
      media = { type:'video', dataUrl: await fileToDataUrl(file) };
    } else {
      media = { type:'image', dataUrl: await resizeImageFile(file, 900, 0.7) };
    }
    await attachSessionSetMedia(media);
  }catch(e){ toast('No se pudo procesar el archivo: ' + e.message, 'error'); }
  event.target.value = '';
}
async function attachSessionSetMedia(media){
  if(!sessionMediaTarget || !activeSession) return;
  const { exIdx, setIdx } = sessionMediaTarget;
  const mediaId = 's' + Date.now();
  mediaStore.workoutMedia = mediaStore.workoutMedia || {};
  mediaStore.workoutMedia[mediaId] = media;
  const set = activeSession.exercises[exIdx].sets[setIdx];
  set.mediaId = mediaId;
  try{ await persistMediaStoreFor(currentUser, mediaStore); }catch(e){ toast('Error: ' + e.message, 'error'); }
  if(set.done){
    const match = [...account.workouts].reverse().find(w=>w.sessionId===activeSession.id && w.exercise===activeSession.exercises[exIdx].name && !w.mediaId);
    if(match){ match.mediaId = mediaId; try{ await saveAccount(); }catch(e){} }
  }
  renderActiveSession();
  renderWorkouts();
  toast('Adjunto guardado en la serie.');
}
async function finishSession(){
  if(!activeSession) return;
  pauseSessionTimer();
  if(restTimerRunning){ clearInterval(restTimerInterval); restTimerRunning = false; }
  activeSession.totalSeconds = sessionElapsedSeconds;
  account.workoutSessions = account.workoutSessions || [];
  account.workoutSessions.push({ ...activeSession, endedAt: new Date().toISOString() });
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  toast('Entrenamiento finalizado y guardado (' + formatTime(sessionElapsedSeconds) + ').');
  activeSession = null;
  renderActiveSession();
  renderWorkouts(); renderPRBoard(); renderDashboard(); renderAchievements();
}
async function saveSessionAsTemplate(){
  if(!activeSession) return;
  const suggested = activeSession.templateName === 'Entrenamiento libre' ? '' : activeSession.templateName;
  const name = prompt('Nombre para guardar esta sesión como nueva plantilla', suggested);
  if(!name) return;
  account.routineTemplates = account.routineTemplates || [];
  account.routineTemplates.push({
    id: Date.now(), name,
    exercises: activeSession.exercises.map(ex=>({ name: ex.name, sets: ex.sets.map(s=>({ targetWeight:s.weight, targetReps:s.reps, targetRIR:s.rir, notes:s.notes })) })),
    createdAt: new Date().toISOString()
  });
  try{ await saveAccount(); toast('Plantilla guardada.'); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderTemplateList();
}
function renderActiveSession(){
  const el = document.getElementById('activeSessionArea');
  if(!el) return;
  if(!activeSession){ el.innerHTML = '<p class="muted">No hay ninguna sesión en curso. Usa una plantilla o inicia un entrenamiento libre.</p>'; return; }
  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <h3 style="margin:0;">${escapeHTML(activeSession.templateName)}</h3>
        <span class="timer-display" style="font-size:1.5em; margin:0;" id="sessionTimerDisplay">${formatTime(sessionElapsedSeconds)}</span>
      </div>
      <div class="row" style="justify-content:space-between; margin-top:6px;">
        <span class="muted">Descanso actual: <strong id="sessionRestDisplay">${formatTime(restElapsedSeconds)}</strong></span>
        <div class="row">
          <button class="small ghost" onclick="saveSessionAsTemplate()">Guardar como plantilla</button>
          <button class="small danger" onclick="finishSession()">Finalizar entrenamiento</button>
        </div>
      </div>
    </div>
    ${activeSession.exercises.map((ex,exIdx)=>`
      <div class="card">
        <strong>${escapeHTML(ex.name)}</strong>
        ${ex.sets.some(s=>s.prevIsActual)?`<div class="muted prev-session-hint">${icon('flat',12)} Referencia en gris: lo que registraste la última vez${activeSession.lastSessionDate?' ('+escapeHTML(activeSession.lastSessionDate)+')':''}. El campo se guarda vacío hasta que escribas un dato nuevo.</div>`:''}
        <table style="margin-top:8px;">
          <thead><tr><th>#</th><th>Peso</th><th>Reps</th><th>RIR</th><th>Notas</th><th>Serie</th><th>Descanso</th><th>Adjunto</th></tr></thead>
          <tbody>
          ${ex.sets.map((s,setIdx)=>{
            const isTiming = activeSetRef && activeSetRef.exIdx===exIdx && activeSetRef.setIdx===setIdx;
            return `<tr style="${s.done?'opacity:.65;':''}">
              <td>${setIdx+1}</td>
              <td><input type="number" value="${s.weight}" placeholder="${s.prevWeight!==''&&s.prevWeight!=null?s.prevWeight:''}" class="${s.prevIsActual?'prev-hint-input':''}" style="margin:0; max-width:70px;" ${s.done?'disabled':''} oninput="updateSessionSetField(${exIdx},${setIdx},'weight',this.value)"></td>
              <td><input type="number" value="${s.reps}" placeholder="${s.prevReps!==''&&s.prevReps!=null?s.prevReps:''}" class="${s.prevIsActual?'prev-hint-input':''}" style="margin:0; max-width:60px;" ${s.done?'disabled':''} oninput="updateSessionSetField(${exIdx},${setIdx},'reps',this.value)"></td>
              <td><input type="number" value="${s.rir}" style="margin:0; max-width:55px;" ${s.done?'disabled':''} oninput="updateSessionSetField(${exIdx},${setIdx},'rir',this.value)"></td>
              <td><input type="text" value="${escapeHTML(s.notes)}" style="margin:0; max-width:110px;" ${s.done?'disabled':''} oninput="updateSessionSetField(${exIdx},${setIdx},'notes',this.value)"></td>
              <td>${isTiming ? `<strong>${formatTime(setElapsedSeconds)}</strong> <button class="small" onclick="stopSetTimer(${exIdx},${setIdx})">Detener</button>` : (s.done ? formatTime(s.setSeconds||0) : `<button class="small ghost" onclick="startSetTimer(${exIdx},${setIdx})">Iniciar</button>`)}</td>
              <td>${s.restSeconds!=null ? formatTime(s.restSeconds) : '—'}</td>
              <td>
                ${s.mediaId ? icon('check',14) : ''}
                <input type="file" accept="image/*,video/*" onchange="handleSessionSetFile(event, ${exIdx}, ${setIdx})" id="sessFile-${exIdx}-${setIdx}">
                <button class="small ghost" onclick="document.getElementById('sessFile-${exIdx}-${setIdx}').click()">${icon('upload',11)}</button>
                <button class="small ghost" onclick="openSessionSetCamera(${exIdx},${setIdx})">${icon('camera',11)}</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
        <div class="button-group"><button class="small ghost" onclick="addSessionSet(${exIdx})">+ Serie</button></div>
      </div>
    `).join('')}
    <div class="card">
      <label>Añadir ejercicio a la sesión</label>
      <input type="text" id="sessionNewExerciseName" list="exerciseList" placeholder="Ej: Curl de bíceps">
      <div class="button-group"><button class="flex1 ghost" onclick="addSessionExercise()">+ Añadir ejercicio</button></div>
    </div>
  `;
}

/* =========================================================
   RETOS: DIARIOS Y DE NIVEL
========================================================= */
function getDailyChallenge(){
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((new Date() - start) / (1000*60*60*24));
  return DAILY_CHALLENGE_POOL[dayOfYear % DAILY_CHALLENGE_POOL.length];
}
function computeDailyChallengeStreak(accObj){
  const acc = accObj || account;
  if(!acc || !acc.challenges || !acc.challenges.dailyCompletions) return 0;
  let streak = 0;
  const cursor = new Date();
  while(true){
    const key = cursor.toISOString().slice(0,10);
    if(acc.challenges.dailyCompletions[key]){ streak++; cursor.setDate(cursor.getDate()-1); }
    else break;
  }
  return streak;
}
function renderDailyChallenge(){
  const el = document.getElementById('dailyChallengeCard');
  if(!el || !account) return;
  account.challenges = account.challenges || { dailyCompletions:{}, levels:{} };
  const challenge = getDailyChallenge();
  const done = !!account.challenges.dailyCompletions[todayStr()];
  el.innerHTML = `
    <div class="card">
      <p class="muted">Reto de hoy</p>
      <h3 style="margin-top:4px;">${escapeHTML(challenge)}</h3>
      <div class="button-group">
        <button class="flex1" ${done?'disabled':''} onclick="completeDailyChallenge()">${done ? (icon('check',14)+' Completado hoy') : 'Marcar como completado'}</button>
      </div>
    </div>
    <p class="muted" style="margin-top:14px;">Racha de retos diarios: ${computeDailyChallengeStreak()} días</p>
  `;
}
async function completeDailyChallenge(){
  account.challenges = account.challenges || { dailyCompletions:{}, levels:{} };
  account.challenges.dailyCompletions[todayStr()] = true;
  try{ await saveAccount(); renderDailyChallenge(); renderAchievements(); toast('Reto del día completado.'); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
function renderMilestoneChallenges(){
  const el = document.getElementById('milestoneChallengeList');
  if(!el || !account) return;
  account.challenges = account.challenges || { dailyCompletions:{}, levels:{} };
  const defs = challengeCategoryFilter==='Todas' ? CHALLENGE_DEFS : CHALLENGE_DEFS.filter(c=>c.category===challengeCategoryFilter);
  el.innerHTML = defs.map(c=>{
    const currentLevel = account.challenges.levels[c.id] || 0;
    const totalLevels = c.levels.length;
    const pct = (currentLevel/totalLevels)*100;
    const nextLevel = c.levels.find(l=>l.level===currentLevel+1);
    const currentTierColor = currentLevel>0 ? tierMeta(currentLevel).color : 'var(--text-dim)';
    return `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <strong>${escapeHTML(c.name)}</strong>
        <span class="muted">${escapeHTML(c.category)} · <span style="color:${currentTierColor}; font-weight:700;">${currentLevel>0?tierMeta(currentLevel).name:'Sin rango'}</span> (${currentLevel}/${totalLevels})</span>
      </div>
      <div class="progress-track" style="margin:8px 0 10px;"><div class="progress-fill ${currentLevel>=totalLevels?'complete':''}" style="width:${pct}%; background:${currentTierColor};"></div></div>
      <div class="grid grid-6 challenge-level-grid">
        ${c.levels.map(l=>{
          const achieved = currentLevel >= l.level;
          const tm = tierMeta(l.level);
          return `<button class="small challenge-tier-btn ${achieved?'achieved':'ghost'}" style="${achieved?`border-color:${tm.color}; color:${tm.color};`:''}" onclick="setChallengeLevel('${c.id}', ${l.level})" title="${escapeHTML(challengeLevelLabel(c,l.level))} · Rango ${tm.name} (+${tierXP(l.level)} XP)">${iconFilled(rankIconName(tm.name),11)} ${tm.name}</button>`;
        }).join('')}
      </div>
      <p class="muted" style="margin-top:8px;">${nextLevel ? 'Siguiente: ' + escapeHTML(challengeLevelLabel(c, nextLevel.level)) + ` (+${tierXP(nextLevel.level)} XP)` : 'Todos los niveles superados. ¡Eres leyenda en este reto!'}</p>
    </div>`;
  }).join('');
}
async function setChallengeLevel(challengeId, level){
  account.challenges = account.challenges || { dailyCompletions:{}, levels:{} };
  const current = account.challenges.levels[challengeId] || 0;
  const newLevel = current === level ? level - 1 : level;
  if(!confirm(newLevel > current ? '¿Confirmas que has conseguido este nivel?' : '¿Quitar este nivel conseguido?')) return;
  account.challenges.levels[challengeId] = Math.max(0, newLevel);
  try{
    await saveAccount();
    renderChallengeRankCard(); renderMilestoneChallenges(); renderAchievements();
    if(newLevel>current){
      const def = CHALLENGE_DEFS.find(c=>c.id===challengeId);
      const tm = tierMeta(newLevel);
      toast(`Nivel superado: rango ${tm.name} (+${tierXP(newLevel)} XP).`);
      if(def && confirm(`¡Enhorabuena! ¿Quieres compartir en el feed que has alcanzado el rango ${tm.name} en "${def.name}"?`)){
        try{ await createPost(currentUser, `🏆 ¡Nuevo logro! He alcanzado el rango ${tm.name} en el reto "${def.name}": ${challengeLevelLabel(def, newLevel)}`, null); toast('Publicado en el feed de la comunidad.'); }
        catch(e){ toast('No se pudo publicar: ' + e.message, 'error'); }
      }
    }
  }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* ---- Retos personalizados creados por el usuario ---- */
async function addCustomChallenge(){
  const name = document.getElementById('customChallengeName').value.trim();
  const desc = document.getElementById('customChallengeDesc').value.trim();
  const difficulty = parseInt(document.getElementById('customChallengeDifficulty').value, 10) || 3;
  if(!name){ toast('Ponle un nombre a tu reto.', 'error'); return; }
  account.customChallenges = account.customChallenges || [];
  account.customChallenges.push({ id: Date.now(), name, desc, difficulty, completed:false, completedAt:null, createdAt: new Date().toISOString() });
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  document.getElementById('customChallengeName').value = '';
  document.getElementById('customChallengeDesc').value = '';
  renderCustomChallenges();
  renderAchievements();
  toast('Reto personalizado creado.');
}
async function toggleCustomChallenge(id){
  const c = (account.customChallenges||[]).find(x=>x.id===id);
  if(!c) return;
  c.completed = !c.completed;
  c.completedAt = c.completed ? new Date().toISOString() : null;
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderCustomChallenges();
  renderChallengeRankCard();
  if(c.completed){
    const tm = tierMeta(c.difficulty||3);
    toast(`Reto completado: rango ${tm.name} (+${tierXP(c.difficulty||3)} XP).`);
    if(confirm(`¿Quieres compartir en el feed que has completado "${c.name}"?`)){
      try{ await createPost(currentUser, `✅ Reto personal completado: "${c.name}"${c.desc?' — '+c.desc:''}`, null); toast('Publicado en el feed de la comunidad.'); }
      catch(e){ toast('No se pudo publicar: ' + e.message, 'error'); }
    }
  }
}
async function deleteCustomChallenge(id){
  account.customChallenges = (account.customChallenges||[]).filter(c=>c.id!==id);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderCustomChallenges();
  renderChallengeRankCard();
}
function renderCustomChallenges(){
  const el = document.getElementById('customChallengeList');
  if(!el || !account) return;
  const list = account.customChallenges || [];
  if(list.length===0){ el.innerHTML = '<p class="muted">Todavía no has creado retos propios.</p>'; return; }
  el.innerHTML = list.map(c=>{
    const tm = tierMeta(c.difficulty||3);
    return `
    <div class="list-item">
      <div>
        <strong>${c.completed?icon('check',13)+' ':''}${escapeHTML(c.name)}</strong>
        <span class="chip-filter" style="display:inline-flex; margin-left:8px; padding:2px 9px; font-size:.68em; color:${tm.color}; border-color:${tm.color};">${tm.name}</span>
        ${c.desc?`<div class="muted">${escapeHTML(c.desc)}</div>`:''}
      </div>
      <div class="row">
        <button class="small ${c.completed?'ghost':''}" onclick="toggleCustomChallenge(${c.id})">${c.completed?'Reabrir':'Completar'}</button>
        <button class="small danger" onclick="deleteCustomChallenge(${c.id})">${icon('trash',12)}</button>
      </div>
    </div>
  `;
  }).join('');
}

function updateChangePwChecklist(){
  const pw = document.getElementById('newPasswordInput').value;
  const res = passwordRuleResults(pw);
  Object.keys(res).forEach(rule=>{
    const li = document.querySelector(`#changePwChecklist li[data-rule="${rule}"]`);
    if(li) li.classList.toggle('met', res[rule]);
  });
}
async function changePassword(){
  const currentPw = document.getElementById('currentPasswordInput').value;
  const newPw = document.getElementById('newPasswordInput').value;
  const confirmPw = document.getElementById('newPasswordConfirmInput').value;
  if(!currentPw || !newPw){ toast('Completa ambos campos de contraseña.', 'error'); return; }
  if(newPw !== confirmPw){ toast('Las dos contraseñas nuevas no coinciden.', 'error'); return; }
  const rules = passwordRuleResults(newPw);
  if(!Object.values(rules).every(Boolean)){ toast('La nueva contraseña no cumple los requisitos de seguridad.', 'error'); return; }
  try{
    const currentHash = await hashPassword(currentPw);
    if(account.password !== currentHash){ toast('La contraseña actual no es correcta.', 'error'); return; }
    account.password = await hashPassword(newPw);
    await saveAccount();
    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('newPasswordConfirmInput').value = '';
    updateChangePwChecklist();
    toast('Contraseña actualizada correctamente.');
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* =========================================================
   CAMBIAR NOMBRE DE USUARIO
========================================================= */
async function changeUsername(){
  const newUsername = document.getElementById('newUsernameInput').value.trim();
  const confirmPassword = document.getElementById('changeUsernamePassword').value;
  if(!newUsername){ toast('Introduce un nuevo nombre de usuario.', 'error'); return; }
  if(newUsername === currentUser){ toast('Ese ya es tu nombre de usuario actual.', 'error'); return; }
  if(!confirmPassword){ toast('Confirma tu contraseña actual.', 'error'); return; }
  try{
    const hash = await hashPassword(confirmPassword);
    if(account.password !== hash){ toast('Contraseña incorrecta.', 'error'); return; }
    const exists = await accountExists(newUsername);
    if(exists){ toast('Ese nombre de usuario ya está en uso.', 'error'); return; }
    const oldUsername = currentUser;
    await persistAccountObj(newUsername, account);
    await persistMediaStoreFor(newUsername, mediaStore);
    try{
      const rankingList = await fetchRankingList();
      const mine = rankingList.find(r=>r.username===oldUsername);
      if(mine){ mine.username = newUsername; await persistRanking(newUsername, mine); }
    }catch(e){}
    try{
      const social = await fetchSocial(oldUsername);
      if(social && ((social.kudos||0)>0 || (social.comments&&social.comments.length))){
        if(isGithubMode()){ await collectionUpdate('social', col=>{ col[newUsername] = social; }, `Migrar social de ${oldUsername} a ${newUsername}`, {}); }
        else{ await storageSet(`wilks:social:${newUsername}`, JSON.stringify(social), true); }
      }
    }catch(e){}
    await removeAccountData(oldUsername);
    currentUser = newUsername;
    await setSession(newUsername);
    document.getElementById('currentUsernameLabel').textContent = newUsername;
    document.getElementById('newUsernameInput').value = '';
    document.getElementById('changeUsernamePassword').value = '';
    renderProfile();
    toast('Nombre de usuario actualizado a ' + newUsername + '.');
  }catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* =========================================================
   EXPORTAR / IMPORTAR / BORRAR
========================================================= */
function exportData(){
  const blob = new Blob([JSON.stringify({ username:currentUser, account, media: mediaStore }, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `wilks-pro-${currentUser}-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Datos exportados.');
}
function importData(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e)=>{
    try{
      const parsed = JSON.parse(e.target.result);
      if(!parsed.account){ toast('Archivo no válido.', 'error'); return; }
      account = ensureAccountShape({ ...defaultAccount(account.password), ...parsed.account, password: account.password });
      if(parsed.media){ mediaStore = { ...defaultMediaStore(), ...parsed.media }; }
      await saveAccount();
      await persistMediaStoreFor(currentUser, mediaStore);
      renderAll();
      toast('Datos importados correctamente.');
    }catch(err){ toast('No se pudo leer el archivo: ' + err.message, 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}
async function deleteHistoryOnly(){
  if(!confirm('¿Borrar tu historial de cálculos de Wilks? Esta acción no se puede deshacer.')) return;
  account.history = [];
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderDashboard();
  toast('Historial borrado.');
}
async function deleteMyAccount(){
  if(!confirm('¿Borrar tu cuenta por completo? Perderás todos tus datos.')) return;
  try{ await removeAccountData(currentUser); toast('Cuenta eliminada.'); await logout(); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
