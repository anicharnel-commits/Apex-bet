// ============================================
// APEX FIFA - Main Application
// ============================================

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000/api' 
    : 'https://your-api-domain.com/api';

let currentUser = null;
let currentToken = null;
let currentDeviceId = null;
let isAuthMode = 'login';
let currentPage = 'home';

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    currentDeviceId = localStorage.getItem('deviceId') || generateDeviceId();
    localStorage.setItem('deviceId', currentDeviceId);
    
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
        currentToken = savedToken;
        verifySession();
    } else {
        showAuthModal();
    }
    
    setupNavigation();
    setupBottomNav();
    loadSettings();
});

// ============================================
// DEVICE MANAGEMENT
// ============================================
function generateDeviceId() {
    return 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
}

function getDeviceKey() {
    let key = localStorage.getItem('deviceKey');
    if (!key) {
        key = 'key_' + Math.random().toString(36).substr(2, 16);
        localStorage.setItem('deviceKey', key);
    }
    return key;
}

function getPlatform() {
    return /Android/i.test(navigator.userAgent) ? 'android' : 
           /iPhone|iPad/i.test(navigator.userAgent) ? 'ios' : 'web';
}

// ============================================
// AUTHENTICATION
// ============================================
function showAuthModal(mode = 'login') {
    isAuthMode = mode;
    const modal = document.getElementById('authModal');
    const title = document.getElementById('authTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const switchText = document.getElementById('authSwitchText');
    const switchLink = document.getElementById('authSwitchLink');
    const confirmGroup = document.getElementById('confirmPasswordGroup');
    
    if (mode === 'login') {
        title.textContent = 'Connexion';
        submitBtn.textContent = 'Se connecter';
        switchText.textContent = 'Pas encore de compte ?';
        switchLink.textContent = "S'inscrire";
        confirmGroup.style.display = 'none';
    } else {
        title.textContent = 'Inscription';
        submitBtn.textContent = "S'inscrire";
        switchText.textContent = 'Déjà un compte ?';
        switchLink.textContent = 'Se connecter';
        confirmGroup.style.display = 'block';
    }
    
    document.getElementById('authDeviceCode').value = currentDeviceId;
    modal.classList.add('open');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
}

function switchAuthMode() {
    const newMode = isAuthMode === 'login' ? 'register' : 'login';
    showAuthModal(newMode);
}

async function handleAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const confirmPassword = document.getElementById('authConfirmPassword').value;
    
    if (!email || !password) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    if (isAuthMode === 'register' && password !== confirmPassword) {
        showToast('Les mots de passe ne correspondent pas', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('authSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Chargement...';
    
    try {
        const endpoint = isAuthMode === 'login' ? '/auth/login' : '/auth/register';
        const body = {
            email,
            password,
            installationId: currentDeviceId,
            deviceKey: getDeviceKey(),
            platform: getPlatform()
        };
        
        if (isAuthMode === 'register') {
            body.confirmPassword = confirmPassword;
        }
        
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erreur d\'authentification');
        }
        
        currentUser = data.user;
        currentToken = data.token;
        localStorage.setItem('token', currentToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        closeAuthModal();
        showToast(isAuthMode === 'login' ? 'Bienvenue !' : 'Compte créé avec succès !', 'success');
        checkAdminAccess();
        loadHomePage();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isAuthMode === 'login' ? 'Se connecter' : "S'inscrire";
    }
}

async function verifySession() {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'X-Installation-Id': currentDeviceId
            }
        });
        
        if (!response.ok) throw new Error('Session invalide');
        
        const data = await response.json();
        currentUser = data.user;
        checkAdminAccess();
        loadHomePage();
        
    } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        currentToken = null;
        currentUser = null;
        showAuthModal();
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentToken = null;
    currentUser = null;
    showAuthModal();
    showToast('Déconnecté', 'warning');
}

// ============================================
// NAVIGATION
// ============================================
function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.dataset.page);
        });
    });
}

function setupBottomNav() {
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });
}

function navigateTo(page) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    
    const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    const bottomBtn = document.querySelector(`.bottom-nav-btn[data-page="${page}"]`);
    
    if (navLink) navLink.classList.add('active');
    if (bottomBtn) bottomBtn.classList.add('active');
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');
    
    currentPage = page;
    
    switch(page) {
        case 'home': loadHomePage(); break;
        case 'predictions': loadPredictions(); break;
        case 'subscription': loadSubscription(); break;
        case 'profile': loadProfile(); break;
        case 'admin': loadAdmin(); break;
    }
    
    document.getElementById('navLinks').classList.remove('open');
}

function toggleMobileMenu() {
    document.getElementById('navLinks').classList.toggle('open');
}

function checkAdminAccess() {
    if (currentUser && currentUser.email === 'koffimono5@gmail.com') {
        document.getElementById('adminLink').style.display = 'inline';
    } else {
        document.getElementById('adminLink').style.display = 'none';
    }
}

// ============================================
// HOME PAGE
// ============================================
async function loadHomePage() {
    const container = document.getElementById('page-home');
    
    if (!currentUser) {
        container.innerHTML = `<div class="empty-state">
            <div class="icon">🔒</div>
            <h3>Veuillez vous connecter</h3>
            <p>Connectez-vous pour accéder aux prédictions</p>
        </div>`;
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/subscriptions/current`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const subData = await response.json();
        
        const matchesResponse = await fetch(`${API_URL}/predictions/matches`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const matches = await matchesResponse.json();
        
        container.innerHTML = `
            <div class="welcome-section">
                <h1>Bonjour ${currentUser.email.split('@')[0]} 👋</h1>
                <p class="subtitle">Bienvenue sur Apex FIFA, votre plateforme de prédiction professionnelle</p>
                
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${subData.plan || 'Aucun'}</div>
                        <div class="stat-label">Plan actuel</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${subData.used || 0} / ${subData.limit || 0}</div>
                        <div class="stat-label">Prédictions aujourd'hui</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${subData.remaining || 0}</div>
                        <div class="stat-label">Restantes</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${subData.plan === 'TRIAL' ? '7j' : (subData.expiresAt ? new Date(subData.expiresAt).toLocaleDateString() : 'N/A')}</div>
                        <div class="stat-label">Expiration</div>
                    </div>
                </div>
            </div>
            
            <h2 style="margin: 24px 0 16px;">📊 Dernières prédictions disponibles</h2>
            ${matches && matches.length > 0 ? matches.slice(0, 5).map(m => renderMatchCard(m)).join('') : 
                '<div class="empty-state"><p>Aucun match disponible pour le moment</p></div>'}
        `;
        
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Erreur de chargement: ${error.message}</p></div>`;
    }
}

// ============================================
// PREDICTIONS PAGE
// ============================================
async function loadPredictions() {
    const container = document.getElementById('page-predictions');
    
    if (!currentUser) {
        container.innerHTML = `<div class="empty-state"><h3>Veuillez vous connecter</h3></div>`;
        return;
    }
    
    container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Chargement des prédictions...</p></div>`;
    
    try {
        const response = await fetch(`${API_URL}/predictions/matches`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const matches = await response.json();
        
        if (!matches || matches.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <div class="icon">⚽</div>
                <h3>Aucun match disponible</h3>
                <p>Revenez plus tard pour les prochains matchs</p>
            </div>`;
            return;
        }
        
        container.innerHTML = `
            <h2 style="margin-bottom: 16px;">📊 Matchs disponibles</h2>
            <div class="matches-list">
                ${matches.map(m => renderMatchCard(m, true)).join('')}
            </div>
        `;
        
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Erreur: ${error.message}</p></div>`;
    }
}

// ============================================
// MATCH CARD
// ============================================
function renderMatchCard(match, showDetails = false) {
    const pred = match.prediction || {};
    const signal = pred.signal || 'NO_BET';
    const confidence = pred.confidence || 0;
    const signalClass = signal === 'NO_BET' ? 'NO_BET' : signal;
    
    return `
        <div class="match-card" onclick="viewMatch('${match.id}')">
            <div class="match-header">
                <span class="match-competition">${match.competition || 'FIFA'}</span>
                <span class="match-format">${match.format || 'UNKNOWN'}</span>
            </div>
            <div class="match-teams">
                <span>${match.home_team || 'TBD'}</span>
                <span class="match-vs">VS</span>
                <span>${match.away_team || 'TBD'}</span>
            </div>
            <div class="match-time">${match.match_time ? new Date(match.match_time).toLocaleString() : 'Heure à définir'}</div>
            ${showDetails ? `
                <div class="match-prediction">
                    <div class="match-signal">
                        <span class="signal-badge signal-${signalClass}">${signal}</span>
                        ${pred.recommended_market ? `<span style="font-size:12px;color:var(--text-secondary)">${pred.recommended_market}</span>` : ''}
                    </div>
                    <div class="confidence-bar">
                        <span class="confidence-text">${confidence}%</span>
                        <div class="confidence-track">
                            <div class="confidence-fill" style="width:${confidence}%"></div>
                        </div>
                    </div>
                </div>
                ${pred.home_prob ? `
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;font-size:12px;color:var(--text-secondary)">
                        <span>🏠 ${(pred.home_prob * 100).toFixed(1)}%</span>
                        <span>🤝 ${(pred.draw_prob * 100).toFixed(1)}%</span>
                        <span>✈️ ${(pred.away_prob * 100).toFixed(1)}%</span>
                    </div>
                ` : ''}
            ` : `
                <div class="match-prediction">
                    <div class="match-signal">
                        <span class="signal-badge signal-${signalClass}">${signal}</span>
                    </div>
                    <button class="btn-primary" style="padding:6px 16px;font-size:12px;" onclick="event.stopPropagation();viewMatch('${match.id}')">
                        Voir la prédiction
                    </button>
                </div>
            `}
        </div>
    `;
}

// ============================================
// VIEW MATCH
// ============================================
async function viewMatch(matchId) {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/predictions/match/${matchId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            if (response.status === 429) {
                showToast(error.error || 'Limite quotidienne atteinte', 'warning');
            } else if (response.status === 403) {
                showToast(error.error || 'Abonnement requis', 'error');
            } else {
                throw new Error(error.error || 'Erreur');
            }
            return;
        }
        
        const data = await response.json();
        const p = data.prediction;
        const match = data.match;
        
        showToast(`📊 Prédiction ${match.home_team} vs ${match.away_team}: ${p.signal} (${p.confidence}%)`, 'success');
        navigateTo(currentPage);
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
// SUBSCRIPTION PAGE
// ============================================
async function loadSubscription() {
    const container = document.getElementById('page-subscription');
    
    if (!currentUser) {
        container.innerHTML = `<div class="empty-state"><h3>Veuillez vous connecter</h3></div>`;
        return;
    }
    
    try {
        const subResponse = await fetch(`${API_URL}/subscriptions/current`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const sub = await subResponse.json();
        
        const settingsResponse = await fetch(`${API_URL}/settings`);
        const settings = await settingsResponse.json();
        
        container.innerHTML = `
            <h2 style="margin-bottom:16px;">💎 Votre abonnement</h2>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Plan actuel</span>
                    <span style="font-weight:700;color:var(--accent)">${sub.plan || 'Aucun'}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="profile-item">
                        <div class="label">Prédictions / jour</div>
                        <div class="value">${sub.limit || 0}</div>
                    </div>
                    <div class="profile-item">
                        <div class="label">Utilisées aujourd'hui</div>
                        <div class="value">${sub.used || 0}</div>
                    </div>
                    <div class="profile-item">
                        <div class="label">Restantes</div>
                        <div class="value">${sub.remaining || 0}</div>
                    </div>
                    <div class="profile-item">
                        <div class="label">Expiration</div>
                        <div class="value">${sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : 'N/A'}</div>
                    </div>
                </div>
            </div>
            
            <div class="code-activation">
                <h3>Activer un code d'abonnement</h3>
                <p style="color:var(--text-secondary);font-size:14px;">Entrez votre code pour activer ou prolonger votre abonnement</p>
                <div class="code-input-group">
                    <input type="text" id="activationCode" placeholder="Ex: VIP-7J-XXXXXX" oninput="this.value=this.value.toUpperCase()">
                    <button class="btn-primary" onclick="activateCode()">Activer</button>
                </div>
            </div>
            
            <h2 style="margin:24px 0 12px;">📋 Nos offres</h2>
            <div class="plans-grid">
                ${renderPlanCard('VIP', 7, settings, sub)}
                ${renderPlanCard('VVIP', 7, settings, sub)}
            </div>
            
            <div style="text-align:center;margin-top:20px;">
                <button class="btn-secondary" onclick="openWhatsApp()">💬 Contacter le support</button>
            </div>
        `;
        
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Erreur: ${error.message}</p></div>`;
    }
}

function renderPlanCard(plan, days, settings, currentSub) {
    const prices = settings.prices || {};
    const price = prices[plan.toLowerCase()]?.[days] || 'N/A';
    const dailyLimit = plan === 'VIP' ? 7 : 10;
    const isActive = currentSub.plan === plan;
    
    return `
        <div class="plan-card ${isActive ? 'featured' : ''}">
            <div class="plan-name">${plan}</div>
            <div style="color:var(--text-secondary);font-size:13px;">${dailyLimit} prédictions / jour</div>
            <div class="plan-price">${price} ${settings.currency || 'FCFA'}</div>
            <div style="font-size:13px;color:var(--text-secondary);">pour ${days} jours</div>
            <ul class="plan-features">
                <li>${dailyLimit} analyses par jour</li>
                <li>Tous les formats FIFA/EA FC</li>
                <li>Statistiques avancées</li>
                <li>Signal de confiance</li>
                <li>Support prioritaire</li>
            </ul>
            <button class="btn-secondary" onclick="openWhatsApp()">Contacter pour un code</button>
            ${isActive ? '<div style="margin-top:8px;color:var(--success);font-weight:600;">✓ Actif</div>' : ''}
        </div>
    `;
}

// ============================================
// ACTIVATE CODE
// ============================================
async function activateCode() {
    const codeInput = document.getElementById('activationCode');
    const code = codeInput.value.trim();
    
    if (!code) {
        showToast('Veuillez entrer un code', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/subscriptions/activate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Code invalide');
        }
        
        showToast('✅ Abonnement activé avec succès !', 'success');
        codeInput.value = '';
        loadSubscription();
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
// PROFILE PAGE
// ============================================
async function loadProfile() {
    const container = document.getElementById('page-profile');
    
    if (!currentUser) {
        container.innerHTML = `<div class="empty-state"><h3>Veuillez vous connecter</h3></div>`;
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/subscriptions/current`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const sub = await response.json();
        
        container.innerHTML = `
            <h2 style="margin-bottom:16px;">👤 Mon compte</h2>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Informations personnelles</span>
                </div>
                <div class="profile-info">
                    <div class="profile-item">
                        <div class="label">Email</div>
                        <div class="value">${currentUser.email}</div>
                    </div>
                    <div class="profile-item">
                        <div class="label">Plan</div>
                        <div class="value" style="color:var(--accent)">${sub.plan || 'Aucun'}</div>
                    </div>
                    <div class="profile-item">
                        <div class="label">Appareil</div>
                        <div class="value" style="font-size:13px;color:var(--text-secondary)">${currentDeviceId}</div>
                    </div>
                    <div class="profile-item">
                        <div class="label">Plateforme</div>
                        <div class="value">${getPlatform()}</div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Historique des prédictions</span>
                </div>
                <div id="historyContainer">
                    <div class="loading"><div class="loading-spinner"></div></div>
                </div>
            </div>
            
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
                <button class="btn-secondary" onclick="openWhatsApp()">💬 Contacter le support</button>
                <button class="btn-secondary" style="border-color:var(--danger);color:var(--danger);" onclick="logout()">🚪 Déconnexion</button>
            </div>
        `;
        
        loadHistory();
        
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Erreur: ${error.message}</p></div>`;
    }
}

async function loadHistory() {
    try {
        const response = await fetch(`${API_URL}/predictions/history`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const history = await response.json();
        
        const container = document.getElementById('historyContainer');
        
        if (!history || history.length === 0) {
            container.innerHTML = `<p style="color:var(--text-secondary);text-align:center;">Aucune prédiction consultée</p>`;
            return;
        }
        
        container.innerHTML = history.slice(0, 20).map(h => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:13px;">
                <span>${h.home_team} vs ${h.away_team}</span>
                <span style="color:var(--text-secondary)">${h.signal || 'N/A'}</span>
                <span style="color:var(--text-muted);font-size:11px;">${new Date(h.timestamp).toLocaleDateString()}</span>
            </div>
        `).join('');
        
    } catch (error) {}
}

// ============================================
// ADMIN PAGE
// ============================================
async function loadAdmin() {
    const container = document.getElementById('page-admin');
    
    if (!currentUser || currentUser.email !== 'koffimono5@gmail.com') {
        container.innerHTML = `<div class="empty-state"><h3>Accès restreint</h3><p>Espace administrateur uniquement</p></div>`;
        return;
    }
    
    try {
        const statsResponse = await fetch(`${API_URL}/admin/dashboard`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const stats = await statsResponse.json();
        
        const usersResponse = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const users = await usersResponse.json();
        
        container.innerHTML = `
            <h2 style="margin-bottom:16px;">🛠️ Administration</h2>
            
            <div class="admin-stats">
                <div class="admin-stat">
                    <div class="number">${stats.total_users || 0}</div>
                    <div class="label">Utilisateurs</div>
                </div>
                <div class="admin-stat">
                    <div class="number">${stats.trial_active || 0}</div>
                    <div class="label">Essais actifs</div>
                </div>
                <div class="admin-stat">
                    <div class="number">${stats.vip_active || 0}</div>
                    <div class="label">VIP</div>
                </div>
                <div class="admin-stat">
                    <div class="number">${stats.vvip_active || 0}</div>
                    <div class="label">VVIP</div>
                </div>
                <div class="admin-stat">
                    <div class="number">${stats.predictions_today || 0}</div>
                    <div class="label">Prédictions aujourd'hui</div>
                </div>
                <div class="admin-stat">
                    <div class="number">${stats.matches_available || 0}</div>
                    <div class="label">Matchs disponibles</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">👥 Utilisateurs</span>
                    <button class="btn-secondary" style="padding:4px 12px;font-size:12px;" onclick="loadAdmin()">🔄</button>
                </div>
                <div class="admin-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>Plan</th>
                                <th>Prédictions</th>
                                <th>Statut</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(u => `
                                <tr>
                                    <td>${u.email}</td>
                                    <td>${u.plan || 'Aucun'}</td>
                                    <td>${u.predictions_used || 0}</td>
                                    <td><span class="status-badge status-${u.status === 'active' ? 'active' : 'suspended'}">${u.status || 'inactive'}</span></td>
                                    <td>
                                        <button class="btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="adminAction('${u.id}','suspend')">Suspendre</button>
                                        <button class="btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="adminAction('${u.id}','reset-device')">Réinitialiser</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🎫 Générer des codes</span>
                </div>
                <div style="display:grid;grid-template-columns:auto auto auto;gap:12px;align-items:end;">
                    <div class="form-group" style="margin:0;">
                        <label>Plan</label>
                        <select id="adminPlan" style="width:100%;padding:10px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);">
                            <option value="VIP">VIP</option>
                            <option value="VVIP">VVIP</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Durée</label>
                        <select id="adminDuration" style="width:100%;padding:10px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);">
                            <option value="7">7 jours</option>
                            <option value="14">14 jours</option>
                            <option value="28">28 jours</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Quantité</label>
                        <select id="adminQuantity" style="width:100%;padding:10px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);">
                            <option value="1">1</option>
                            <option value="5">5</option>
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                        </select>
                    </div>
                    <button class="btn-primary" onclick="generateCodes()">Générer</button>
                </div>
                <div id="generatedCodes" style="margin-top:12px;font-size:13px;"></div>
            </div>
        `;
        
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Erreur: ${error.message}</p></div>`;
    }
}

async function adminAction(userId, action) {
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            showToast('Action effectuée avec succès', 'success');
            loadAdmin();
        } else {
            const error = await response.json();
            showToast(error.error || 'Erreur', 'error');
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function generateCodes() {
    const plan = document.getElementById('adminPlan').value;
    const durationDays = parseInt(document.getElementById('adminDuration').value);
    const quantity = parseInt(document.getElementById('adminQuantity').value);
    
    try {
        const response = await fetch(`${API_URL}/admin/codes/generate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plan, durationDays, quantity })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur');
        }
        
        const data = await response.json();
        
        const container = document.getElementById('generatedCodes');
        container.innerHTML = `
            <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;">
                <p style="color:var(--success);font-weight:600;">✅ ${data.codes.length} codes générés</p>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
                    ${data.codes.map(c => `
                        <span style="background:var(--bg-card);padding:4px 12px;border-radius:4px;font-size:12px;font-family:monospace;border:1px solid var(--border-color);">${c.code}</span>
                    `).join('')}
                </div>
            </div>
        `;
        
        showToast(`${data.codes.length} codes générés avec succès`, 'success');
        
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
// WHATSAPP
// ============================================
function openWhatsApp() {
    fetch(`${API_URL}/settings`)
        .then(res => res.json())
        .then(settings => {
            const number = settings.whatsapp_number || '2250758305133';
            const message = settings.whatsapp_message || 'Bonjour, je souhaite avoir un abonnement sur Apex FIFA.';
            window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank');
        })
        .catch(() => {
            window.open(`https://wa.me/2250758305133?text=${encodeURIComponent('Bonjour, je souhaite avoir un abonnement sur Apex FIFA.')}`, '_blank');
        });
}

// ============================================
// SETTINGS
// ============================================
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/settings`);
        const settings = await response.json();
        document.title = settings.app_name || 'Apex FIFA';
    } catch (error) {}
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// ============================================
// EXPOSE GLOBALS
// ============================================
window.navigateTo = navigateTo;
window.viewMatch = viewMatch;
window.activateCode = activateCode;
window.openWhatsApp = openWhatsApp;
window.logout = logout;
window.adminAction = adminAction;
window.generateCodes = generateCodes;
window.toggleMobileMenu = toggleMobileMenu;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthMode = switchAuthMode;
window.handleAuth = handleAuth;
window.loadAdmin = loadAdmin;