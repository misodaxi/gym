/* =========================================================
   auth.js — lógica exclusiva de index.html (inicio de sesión)
========================================================= */
const ADMIN_PASSWORD = 'admin123';

function showScreen(which){
  document.getElementById('loginFormContainer').classList.toggle('hidden', which!=='login');
  document.getElementById('registerFormContainer').classList.toggle('hidden', which!=='register');
  document.getElementById('deleteAccountsForm').classList.toggle('hidden', which!=='delete');
  document.getElementById('adminPanelForm').classList.toggle('hidden', which!=='admin');
  document.getElementById('githubConfigForm').classList.toggle('hidden', which!=='github');
  document.getElementById('loginError').textContent = '';
  document.getElementById('registrationMessage').textContent = '';
  if(which==='github' && githubConfig){
    document.getElementById('ghOwner').value = githubConfig.owner || '';
    document.getElementById('ghRepo').value = githubConfig.repo || '';
    document.getElementById('ghBranch').value = githubConfig.branch || 'main';
    document.getElementById('ghBasePath').value = githubConfig.basePath || 'data/';
  }
  if(which==='admin'){
    document.getElementById('adminViewPassword').value = '';
    document.getElementById('adminViewError').textContent = '';
    document.getElementById('adminUsersResult').classList.add('hidden');
    document.getElementById('adminUsersResult').innerHTML = '';
  }
}
function openDeleteAccountsForm(){ showScreen('delete'); }

/* ---- Mostrar/ocultar contraseña y validación en vivo ---- */
function togglePwVisibility(id, btn){
  const input = document.getElementById(id);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Ocultar' : 'Mostrar';
}
function updatePwChecklist(){
  const pw = document.getElementById('newPassword').value;
  const res = passwordRuleResults(pw);
  Object.keys(res).forEach(rule=>{
    const li = document.querySelector(`#pwChecklist li[data-rule="${rule}"]`);
    if(li) li.classList.toggle('met', res[rule]);
  });
  updatePwMatch();
}
function updatePwMatch(){
  const p1 = document.getElementById('newPassword').value;
  const p2 = document.getElementById('newPasswordConfirm').value;
  const el = document.getElementById('pwMatchMsg');
  if(!el) return;
  if(p2.length===0){ el.textContent = ''; return; }
  if(p1===p2){ el.textContent = 'Las contraseñas coinciden.'; el.style.color = 'var(--ok)'; }
  else{ el.textContent = 'Las contraseñas no coinciden.'; el.style.color = 'var(--danger)'; }
}

/* ---- Registro ---- */
async function register(){
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const passwordConfirm = document.getElementById('newPasswordConfirm').value;
  const msgEl = document.getElementById('registrationMessage');
  const btn = document.getElementById('registerBtn');
  if(!username || !password){ msgEl.textContent = 'Completa usuario y contraseña.'; return; }
  if(password !== passwordConfirm){ msgEl.textContent = 'Las dos contraseñas no coinciden.'; return; }
  const rules = passwordRuleResults(password);
  if(!Object.values(rules).every(Boolean)){ msgEl.textContent = 'La contraseña no cumple los requisitos de seguridad marcados en la lista.'; return; }
  btn.disabled = true; btn.textContent = 'Creando...';
  try{
    const existing = await accountExists(username);
    if(existing){ msgEl.textContent = 'Ese usuario ya existe.'; return; }
    const hash = await hashPassword(password);
    const acc = defaultAccount(hash);
    await createAccount(username, acc);
    const verify = await fetchAccount(username);
    if(!verify){ msgEl.textContent = 'No se pudo guardar la cuenta (fallo de almacenamiento). Comprueba tu conexión o la configuración de GitHub e inténtalo de nuevo.'; return; }
    msgEl.textContent = 'Cuenta creada correctamente. Ya puedes iniciar sesión.';
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newPasswordConfirm').value = '';
    document.getElementById('pwMatchMsg').textContent = '';
    updatePwChecklist();
  }catch(e){ msgEl.textContent = 'Error: ' + e.message; }
  finally{ btn.disabled = false; btn.textContent = 'Registrar'; }
}

/* ---- Inicio de sesión ---- */
async function login(){
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.textContent = '';
  if(!username || !password){ errEl.textContent = 'Completa usuario y contraseña.'; return; }
  btn.disabled = true; btn.textContent = 'Entrando...';
  try{
    const acc = await fetchAccount(username);
    if(!acc){ errEl.textContent = 'Usuario o contraseña incorrectos.'; return; }
    const hash = await hashPassword(password);
    const legacyMatch = acc.password === password;
    if(acc.password !== hash && !legacyMatch){ errEl.textContent = 'Usuario o contraseña incorrectos.'; return; }
    if(legacyMatch){ acc.password = hash; await persistAccountObj(username, acc); }
    await setSession(username);
    window.location.href = 'app.html';
  }catch(e){ errEl.textContent = 'Error al iniciar sesión: ' + e.message; }
  finally{ btn.disabled = false; btn.textContent = 'Iniciar sesión'; }
}

/* ---- Panel de administración ---- */
async function viewAllUsers(){
  const pw = document.getElementById('adminViewPassword').value;
  const errEl = document.getElementById('adminViewError');
  if(pw !== ADMIN_PASSWORD){ errEl.textContent = 'Contraseña de administrador incorrecta.'; return; }
  errEl.textContent = '';
  const resultEl = document.getElementById('adminUsersResult');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = '<p class="muted">Cargando usuarios...</p>';
  try{
    const summaries = await listAllAccountSummaries();
    if(summaries.length===0){ resultEl.innerHTML = '<p class="muted">No hay usuarios registrados todavía.</p>'; return; }
    summaries.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    resultEl.innerHTML = `
      <div class="divider"></div>
      <h3>${summaries.length} usuario(s) registrado(s)</h3>
      ${summaries.map(u=>`
        <div class="list-item">
          <div class="row" style="gap:10px;">
            <div class="avatar-preview" style="width:36px;height:36px;">${u.avatar?`<img src="${u.avatar}" alt="">`:icon('user',18)}</div>
            <div>
              <strong>${escapeHTML(u.username)}</strong>
              <div class="muted">Creada: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-ES') : '—'} · ${u.workouts} entrenamientos · Mejor Wilks: ${u.bestWilks?u.bestWilks.toFixed(1):'—'}</div>
            </div>
          </div>
        </div>
      `).join('')}
      <div class="button-group"><button class="flex1 ghost" onclick="showScreen('register')">Volver</button></div>
    `;
  }catch(e){ resultEl.innerHTML = `<p class="muted">Error al cargar usuarios: ${escapeHTML(e.message)}</p>`; }
}
async function deleteAllAccounts(){
  const password = document.getElementById('deletePassword').value;
  const errEl = document.getElementById('deleteAdminError');
  if(password !== ADMIN_PASSWORD){ errEl.textContent = 'Contraseña de administrador incorrecta.'; return; }
  try{
    await wipeAllAccounts();
    errEl.textContent = '';
    document.getElementById('deletePassword').value = '';
    toast('Todas las cuentas fueron borradas.');
    showScreen('register');
  }catch(e){ errEl.textContent = 'Error: ' + e.message; }
}

/* ---- Conexión con GitHub ---- */
function updateAuthStatusIndicator(){
  const on = isGithubMode();
  const dot = document.getElementById('authStatusDot');
  const text = document.getElementById('authStatusText');
  if(dot) dot.className = 'status-dot ' + (on?'on':'off');
  if(text) text.textContent = on ? `Conectado a ${githubConfig.owner}/${githubConfig.repo}` : 'Modo local';
}
async function connectGithub(){
  const owner = document.getElementById('ghOwner').value.trim();
  const repo = document.getElementById('ghRepo').value.trim();
  const branch = document.getElementById('ghBranch').value.trim() || 'main';
  const basePath = document.getElementById('ghBasePath').value.trim() || 'data/';
  const token = document.getElementById('ghToken').value.trim();
  const errEl = document.getElementById('ghConfigError');
  const msgEl = document.getElementById('ghConfigMsg');
  errEl.textContent = ''; msgEl.textContent = '';
  if(!owner || !repo || !token){ errEl.textContent = 'Completa usuario, repositorio y token.'; return; }
  const btn = document.getElementById('ghConnectBtn');
  btn.disabled = true; btn.textContent = 'Verificando...';
  const testConfig = { owner, repo, branch, basePath, token };
  const prevConfig = githubConfig;
  githubConfig = testConfig;
  try{
    for(const name of ['accounts','media','ranking','exercises','social']){
      const { content, sha } = await ghFetchCollection(name, {});
      if(sha===null){ await ghWriteCollection(name, content, null, `Inicializar ${name}.json`); }
    }
    await saveGithubConfigToStorage(testConfig);
    msgEl.textContent = 'Conectado correctamente. Ya puedes iniciar sesión o crear una cuenta.';
    updateAuthStatusIndicator();
  }catch(e){
    githubConfig = prevConfig;
    errEl.textContent = 'No se pudo conectar: ' + e.message + ' Revisa el usuario, repositorio y los permisos del token.';
  }finally{
    btn.disabled = false; btn.textContent = 'Conectar y verificar';
  }
}
async function disconnectGithub(){
  await clearGithubConfig();
  updateAuthStatusIndicator();
  toast('Modo local activado. Los datos solo se guardarán en este dispositivo.');
  showScreen('login');
}

/* ---- Inicialización ---- */
(async function initAuth(){
  await loadGithubConfigFromStorage();
  updateAuthStatusIndicator();
  const session = await getSession();
  if(session && session.username){
    window.location.href = 'app.html';
    return;
  }
  showScreen('login');
})();