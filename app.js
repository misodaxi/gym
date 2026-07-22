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
const CHALLENGE_DEFS = [
  { id:'pullup', name:'Dominadas', category:'Calistenia', levels:[
    {level:1,label:'1 dominada estricta'},{level:2,label:'5 dominadas seguidas'},{level:3,label:'10 dominadas seguidas'},{level:4,label:'15 dominadas seguidas'}
  ]},
  { id:'handstand', name:'Pino (handstand)', category:'Calistenia', levels:[
    {level:1,label:'10 segundos apoyado en la pared'},{level:2,label:'30 segundos apoyado en la pared'},{level:3,label:'10 segundos libre, sin apoyo'},{level:4,label:'60 segundos libre, sin apoyo'}
  ]},
  { id:'squat', name:'Sentadilla con barra', category:'Fuerza', levels:[
    {level:1,label:'Levanta tu propio peso corporal'},{level:2,label:'Levanta 1.5x tu peso corporal'},{level:3,label:'Levanta 2x tu peso corporal'},{level:4,label:'Levanta 2.5x tu peso corporal'}
  ]},
  { id:'deadlift', name:'Peso muerto', category:'Fuerza', levels:[
    {level:1,label:'Levanta 1.25x tu peso corporal'},{level:2,label:'Levanta 1.75x tu peso corporal'},{level:3,label:'Levanta 2.25x tu peso corporal'},{level:4,label:'Levanta 3x tu peso corporal'}
  ]},
  { id:'plank', name:'Plancha', category:'Core', levels:[
    {level:1,label:'Aguanta 30 segundos'},{level:2,label:'Aguanta 1 minuto'},{level:3,label:'Aguanta 2 minutos'},{level:4,label:'Aguanta 3 minutos'}
  ]},
  { id:'dip', name:'Fondos en paralelas', category:'Calistenia', levels:[
    {level:1,label:'1 fondo estricto'},{level:2,label:'5 fondos seguidos'},{level:3,label:'10 fondos seguidos'},{level:4,label:'15 fondos seguidos'}
  ]},
  { id:'run5k', name:'Correr 5 km', category:'Cardio', levels:[
    {level:1,label:'Completa 5 km corriendo, sin importar el tiempo'},{level:2,label:'5 km en menos de 30 minutos'},{level:3,label:'5 km en menos de 25 minutos'},{level:4,label:'5 km en menos de 22 minutos'}
  ]},
];
function challengeLevelLabel(def, level){
  const item = def.levels.find(l=>l.level===level);
  if(!item) return item;
  if(!account || !account.profile || !account.profile.weightKg) return item.label;
  const w = account.profile.weightKg;
  const map = { squat:{1:1,2:1.5,3:2,4:2.5}, deadlift:{1:1.25,2:1.75,3:2.25,4:3} };
  if(map[def.id] && map[def.id][level]){
    const target = (w*map[def.id][level]).toFixed(0);
    return `${item.label} (~${target} kg)`;
  }
  return item.label;
}

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
  document.querySelectorAll('.mobile-nav-item[data-tab]').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-'+name));
  document.getElementById('pageTitle').textContent = TAB_TITLES[name] || '';
  if(name==='dashboard') renderDashboard();
  if(name==='training'){ renderWorkouts(); renderPRBoard(); renderExerciseDatalist(); renderTemplateList(); renderActiveSession(); }
  if(name==='health'){ renderNutrition(); renderSteps(); renderSleep(); }
  if(name==='progress'){ renderMeasurements(); renderGoals(); renderAchievements(); renderPhotoGallery(); renderDailyChallenge(); renderMilestoneChallenges(); renderCustomChallenges(); }
  if(name==='community') loadCommunity();
  if(name==='ranking') loadRanking();
  if(name==='calculators') renderPlateInventoryForm();
  if(name==='settings'){ updateSettingsStatusIndicator(); renderProfile(); renderProfileFields(); const lbl=document.getElementById('currentUsernameLabel'); if(lbl) lbl.textContent = currentUser; }
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
  document.getElementById('mDate').value = todayStr();
  document.getElementById('photoDate').value = todayStr();
  document.getElementById('nutDate').value = todayStr();
  document.getElementById('sleepDate').value = todayStr();
  updateSettingsStatusIndicator();
  await showTab('dashboard');
  renderAll();
  document.getElementById('appScreen').classList.remove('hidden');
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
let mediaRecorderRef = null;
let recordedChunks = [];
let recordingTimerHandle = null;
let recordingSeconds = 0;

async function openCameraModal(context, allowVideo){
  cameraContext = context;
  document.getElementById('cameraVideoBtn').classList.toggle('hidden', !allowVideo);
  document.getElementById('cameraModal').classList.add('open');
  try{
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width:{ideal:1280}, height:{ideal:720} }, audio: !!allowVideo });
    document.getElementById('cameraPreview').srcObject = cameraStream;
  }catch(e){
    toast('No se pudo acceder a la cámara: ' + e.message, 'error');
    closeCameraModal();
  }
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
  25:{color:'#d1453b', diameter:74, thickness:24},
  20:{color:'#3b7fd1', diameter:66, thickness:21},
  15:{color:'#e0c23e', diameter:60, thickness:19},
  10:{color:'#3e9e5c', diameter:52, thickness:17},
  5:{color:'#ececeb',  diameter:44, thickness:13},
  2.5:{color:'#242424', diameter:36, thickness:11},
  1.25:{color:'#b9b9c2', diameter:30, thickness:9},
  0.5:{color:'#8a8a92',  diameter:24, thickness:7}
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
        <div class="plate-swatch" style="background:${meta.color};"></div>
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
    <p>Peso total cargado: <span class="wilks-score">${achieved.toFixed(2)} kg</span></p>
    ${shortfallNote}
  </div>`;
  const platesHtml = used.map((p,i)=>{
    const meta = PLATE_META[p];
    return `<div class="plate-disc" style="width:${meta.thickness}px; height:${meta.diameter}px; background:${meta.color}; margin-left:${i===0?0:-7}px; z-index:${used.length-i}; animation-delay:${i*0.04}s;" title="${p} kg"></div>`;
  }).join('');
  vizEl.innerHTML = `<div class="bar-end"></div><div class="bar-line"></div><div class="plate-stack">${platesHtml}</div><div class="bar-collar"></div>`;
  const usedSizes = [...new Set(used)].sort((a,b)=>b-a);
  legendEl.innerHTML = usedSizes.map(p=>`<div class="plate-legend-item"><span class="plate-legend-dot" style="background:${PLATE_META[p].color};"></span>${p} kg</div>`).join('');
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
async function loadCommunity(){
  const grid = document.getElementById('communityGrid');
  document.getElementById('communityDetail').classList.add('hidden');
  grid.innerHTML = '<p class="muted">Cargando perfiles...</p>';
  try{
    const accountsMap = await fetchAllAccountsMap();
    const mediaMap = await fetchAllMediaMap();
    const profiles = Object.keys(accountsMap)
      .map(u=>({ username:u, acc:accountsMap[u], media: mediaMap[u]||{} }))
      .filter(p=> !p.acc.profile || p.acc.profile.isPublic !== false);
    if(profiles.length===0){ grid.innerHTML = '<p class="muted">No hay perfiles públicos todavía.</p>'; return; }
    grid.innerHTML = `<div class="grid grid-3">` + profiles.map(p=>{
      const bestWilks = (p.acc.history||[]).reduce((m,h)=>Math.max(m,h.wilksScore),0);
      return `
      <div class="card profile-card" onclick="openCommunityProfile('${p.username.replace(/'/g,"\\'")}')">
        <div class="row" style="gap:10px;">
          <div class="avatar-preview" style="width:44px;height:44px;">${p.media.avatar?`<img src="${p.media.avatar}" alt="">`:icon('user',20)}</div>
          <div><strong>${escapeHTML(p.username)}</strong><div class="muted">Mejor Wilks: ${bestWilks?bestWilks.toFixed(1):'—'}</div></div>
        </div>
      </div>`;
    }).join('') + `</div>`;
  }catch(e){ grid.innerHTML = `<p class="muted">Error: ${escapeHTML(e.message)}</p>`; }
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
    const bestWilks = (acc.history||[]).reduce((m,h)=>Math.max(m,h.wilksScore),0);
    const p = acc.profile || {};
    const iGaveKudos = (social.kudosBy||[]).includes(currentUser);
    detailEl.innerHTML = `
      <div class="row" style="gap:14px; align-items:flex-start;">
        <div class="avatar-preview" style="width:72px;height:72px;">${media.avatar?`<img src="${media.avatar}" alt="">`:icon('user',30)}</div>
        <div style="flex:1;">
          <h2 style="margin:0;">${escapeHTML(username)}</h2>
          <p class="muted">${p.age?p.age+' años · ':''}${p.heightCm?p.heightCm+' cm · ':''}${p.weightKg?p.weightKg+' kg':''}</p>
          <p>${escapeHTML(p.bio||'')}</p>
          <p class="muted">Mejor Wilks: ${bestWilks?bestWilks.toFixed(1):'—'} · ${(acc.workouts||[]).length} entrenamientos</p>
        </div>
      </div>
      <div class="button-group">
        <button class="flex1 ${iGaveKudos?'':'ghost'}" onclick="handleToggleKudos('${username.replace(/'/g,"\\'")}')">${icon('award',14)} Apoyo (${social.kudos||0})</button>
        <button class="flex1 ghost" onclick="document.getElementById('communityDetail').classList.add('hidden')">Cerrar</button>
      </div>
      <div class="divider"></div>
      <h3>Comentarios</h3>
      <div id="communityComments">${(social.comments||[]).map(c=>`<div class="list-item"><span><strong>${escapeHTML(c.from)}:</strong> ${escapeHTML(c.text)}</span></div>`).join('') || '<p class="muted">Sin comentarios todavía.</p>'}</div>
      <div class="row" style="margin-top:10px;">
        <input type="text" id="communityCommentInput" placeholder="Escribe un comentario" style="margin:0;">
        <button class="ghost" onclick="handleAddCommunityComment('${username.replace(/'/g,"\\'")}')">Comentar</button>
      </div>
    `;
  }catch(e){ detailEl.innerHTML = `<p class="muted">Error: ${escapeHTML(e.message)}</p>`; }
}
async function handleToggleKudos(username){
  try{ await toggleKudos(username, currentUser); openCommunityProfile(username); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}
async function handleAddCommunityComment(username){
  const input = document.getElementById('communityCommentInput');
  const text = input.value.trim();
  if(!text){ toast('Escribe algo primero.', 'error'); return; }
  try{ await addSocialComment(username, currentUser, text); input.value=''; openCommunityProfile(username); toast('Comentario publicado.'); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
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
   RUTINAS: SESIÓN ACTIVA (cronómetro de entreno, series y descansos)
========================================================= */
function startSession(templateId){
  if(activeSession && !confirm('Ya hay una sesión en curso. ¿Descartarla y empezar una nueva?')) return;
  pauseSessionTimer();
  const template = templateId ? (account.routineTemplates||[]).find(t=>t.id===templateId) : null;
  activeSession = {
    id: Date.now(),
    templateId: template ? template.id : null,
    templateName: template ? template.name : 'Entrenamiento libre',
    date: todayStr(),
    exercises: template ? JSON.parse(JSON.stringify(template.exercises)).map(ex=>({
      name: ex.name,
      sets: ex.sets.map(s=>({ weight: s.targetWeight||'', reps: s.targetReps||'', rir: s.targetRIR||'', notes: s.notes||'', setSeconds:null, restSeconds:null, mediaId:null, done:false }))
    })) : []
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
  activeSession.exercises[exIdx].sets.push({ weight:'', reps:'', rir:'', notes:'', setSeconds:null, restSeconds:null, mediaId:null, done:false });
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
        <table style="margin-top:8px;">
          <thead><tr><th>#</th><th>Peso</th><th>Reps</th><th>RIR</th><th>Notas</th><th>Serie</th><th>Descanso</th><th>Adjunto</th></tr></thead>
          <tbody>
          ${ex.sets.map((s,setIdx)=>{
            const isTiming = activeSetRef && activeSetRef.exIdx===exIdx && activeSetRef.setIdx===setIdx;
            return `<tr style="${s.done?'opacity:.65;':''}">
              <td>${setIdx+1}</td>
              <td><input type="number" value="${s.weight}" style="margin:0; max-width:70px;" ${s.done?'disabled':''} oninput="updateSessionSetField(${exIdx},${setIdx},'weight',this.value)"></td>
              <td><input type="number" value="${s.reps}" style="margin:0; max-width:60px;" ${s.done?'disabled':''} oninput="updateSessionSetField(${exIdx},${setIdx},'reps',this.value)"></td>
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
function computeDailyChallengeStreak(){
  if(!account || !account.challenges || !account.challenges.dailyCompletions) return 0;
  let streak = 0;
  const cursor = new Date();
  while(true){
    const key = cursor.toISOString().slice(0,10);
    if(account.challenges.dailyCompletions[key]){ streak++; cursor.setDate(cursor.getDate()-1); }
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
  el.innerHTML = CHALLENGE_DEFS.map(c=>{
    const currentLevel = account.challenges.levels[c.id] || 0;
    const totalLevels = c.levels.length;
    const pct = (currentLevel/totalLevels)*100;
    const nextLevel = c.levels.find(l=>l.level===currentLevel+1);
    return `
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <strong>${escapeHTML(c.name)}</strong>
        <span class="muted">${escapeHTML(c.category)} · Nivel ${currentLevel}/${totalLevels}</span>
      </div>
      <div class="progress-track" style="margin:8px 0 10px;"><div class="progress-fill ${currentLevel>=totalLevels?'complete':''}" style="width:${pct}%;"></div></div>
      <div class="grid grid-4">
        ${c.levels.map(l=>{
          const achieved = currentLevel >= l.level;
          return `<button class="small ${achieved?'':'ghost'}" onclick="setChallengeLevel('${c.id}', ${l.level})" title="${escapeHTML(challengeLevelLabel(c,l.level))}">${achieved?icon('check',11)+' ':''}Nv.${l.level}</button>`;
        }).join('')}
      </div>
      <p class="muted" style="margin-top:8px;">${nextLevel ? 'Siguiente: ' + escapeHTML(challengeLevelLabel(c, nextLevel.level)) : 'Todos los niveles superados.'}</p>
    </div>`;
  }).join('');
}
async function setChallengeLevel(challengeId, level){
  account.challenges = account.challenges || { dailyCompletions:{}, levels:{} };
  const current = account.challenges.levels[challengeId] || 0;
  const newLevel = current === level ? level - 1 : level;
  if(!confirm(newLevel > current ? '¿Confirmas que has conseguido este nivel?' : '¿Quitar este nivel conseguido?')) return;
  account.challenges.levels[challengeId] = Math.max(0, newLevel);
  try{ await saveAccount(); renderMilestoneChallenges(); renderAchievements(); if(newLevel>current) toast('Nivel superado.'); }
  catch(e){ toast('Error: ' + e.message, 'error'); }
}

/* ---- Retos personalizados creados por el usuario ---- */
async function addCustomChallenge(){
  const name = document.getElementById('customChallengeName').value.trim();
  const desc = document.getElementById('customChallengeDesc').value.trim();
  if(!name){ toast('Ponle un nombre a tu reto.', 'error'); return; }
  account.customChallenges = account.customChallenges || [];
  account.customChallenges.push({ id: Date.now(), name, desc, completed:false, completedAt:null, createdAt: new Date().toISOString() });
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
}
async function deleteCustomChallenge(id){
  account.customChallenges = (account.customChallenges||[]).filter(c=>c.id!==id);
  try{ await saveAccount(); }catch(e){ toast('Error: ' + e.message, 'error'); }
  renderCustomChallenges();
}
function renderCustomChallenges(){
  const el = document.getElementById('customChallengeList');
  if(!el || !account) return;
  const list = account.customChallenges || [];
  if(list.length===0){ el.innerHTML = '<p class="muted">Todavía no has creado retos propios.</p>'; return; }
  el.innerHTML = list.map(c=>`
    <div class="list-item">
      <div>
        <strong>${c.completed?icon('check',13)+' ':''}${escapeHTML(c.name)}</strong>
        ${c.desc?`<div class="muted">${escapeHTML(c.desc)}</div>`:''}
      </div>
      <div class="row">
        <button class="small ${c.completed?'ghost':''}" onclick="toggleCustomChallenge(${c.id})">${c.completed?'Reabrir':'Completar'}</button>
        <button class="small danger" onclick="deleteCustomChallenge(${c.id})">${icon('trash',12)}</button>
      </div>
    </div>
  `).join('');
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