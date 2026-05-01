// Global variables
let currentUser = null;
let currentGameweek = null;
let socket = null;
let userPredictions = {};
let userDoublerMatchId = null;
let gameweekDeadline = null;
let canPredict = true;

// Cache DOM elements for better performance
const domCache = {};

// Function to get team logo with fallback
function getTeamLogo(teamName) {
    // Check if team-logos.js is loaded
    if (typeof getTeamLogoHTML === 'function') {
        return getTeamLogoHTML(teamName);
    }
    
    // Fallback to simple colored circles with team abbreviations
    const teamColors = {
        'Arsenal': '#DC143C',
        'Aston Villa': '#95BFE5', 
        'Bournemouth': '#DA020E',
        'Brentford': '#E30613',
        'Brighton': '#0057B8',
        'Chelsea': '#034694',
        'Crystal Palace': '#1B458F',
        'Everton': '#003399',
        'Fulham': '#000000',
        'Ipswich Town': '#4169E1',
        'Leicester City': '#003090',
        'Liverpool': '#C8102E',
        'Manchester City': '#6CABDD',
        'Manchester United': '#DA020E',
        'Newcastle United': '#241F20',
        'Nottingham Forest': '#DD0000',
        'Southampton': '#D71920',
        'Tottenham': '#132257',
        'West Ham': '#7A263A',
        'Wolverhampton': '#FDB462'
    };
    
    const teamAbbr = {
        'Arsenal': 'ARS',
        'Aston Villa': 'AVL',
        'Bournemouth': 'BOU', 
        'Brentford': 'BRE',
        'Brighton': 'BHA',
        'Chelsea': 'CHE',
        'Crystal Palace': 'CRY',
        'Everton': 'EVE',
        'Fulham': 'FUL',
        'Ipswich Town': 'IPS',
        'Leicester City': 'LEI',
        'Liverpool': 'LIV',
        'Manchester City': 'MCI',
        'Manchester United': 'MUN',
        'Newcastle United': 'NEW',
        'Nottingham Forest': 'NFO',
        'Southampton': 'SOU',
        'Tottenham': 'TOT',
        'West Ham': 'WHU',
        'Wolverhampton': 'WOL'
    };
    
    const color = teamColors[teamName] || '#666666';
    const abbr = teamAbbr[teamName] || 'FC';
    const textColor = (teamName === 'Wolverhampton') ? 'black' : 'white';
    
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="${color}"/>
        <text x="12" y="16" text-anchor="middle" fill="${textColor}" font-size="9" font-weight="bold">${abbr}</text>
    </svg>`;
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    // Inject app logo into navbar
    const navLogo = document.getElementById('navLogoIcon');
    if (navLogo) {
        navLogo.innerHTML = '<img src="/icons/icon-192.svg" alt="Logo" width="32" height="32">';
    }

    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        // Verify token and load user data
        fetch('/api/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.valid && data.user) {
                currentUser = data.user;
                localStorage.setItem('userData', JSON.stringify(data.user));
                showMainApp();
            } else {
                localStorage.removeItem('token');
                localStorage.removeItem('userData');
            }
        })
        .catch(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('userData');
        });
    }

    // Set up form event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Cache frequently used DOM elements
    domCache.loginForm = document.getElementById('loginForm');
    domCache.registerForm = document.getElementById('registerForm');
    domCache.predictionForm = document.getElementById('predictionForm');
    domCache.matchesContainer = document.getElementById('matchesContainer');
    domCache.leaderboardList = document.getElementById('leaderboardList');
    domCache.usernameDisplay = document.getElementById('usernameDisplay');
    domCache.gameweekSelector = document.getElementById('gameweekSelector');
    
    // Debounce function for better performance
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Auth forms
    domCache.loginForm?.addEventListener('submit', handleLogin);
    domCache.registerForm?.addEventListener('submit', handleRegister);
    domCache.predictionForm?.addEventListener('submit', handlePredictionSubmit);
}

// Auth functions
function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'login') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        tabBtns[0].classList.add('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        tabBtns[1].classList.add('active');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showError('Please enter username and password');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            console.error('Login response not JSON:', text);
            showError('Server error. Please try again.');
            return;
        }
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            currentUser = data.user;
            showMainApp();
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error.message || String(error), error);
        showError('Login failed. Check your connection and try again.');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmEl = document.getElementById('registerConfirmPassword');
    const confirmPassword = confirmEl ? confirmEl.value : password;
    
    // Basic validation
    if (!username || username.length < 3) {
        showError('Username must be at least 3 characters');
        return;
    }
    
    // Password validation
    if (password.length < 8) {
        showError('Password must be at least 8 characters');
        return;
    }
    if (!/[A-Z]/.test(password)) {
        showError('Password needs at least one uppercase letter');
        return;
    }
    if (!/[a-z]/.test(password)) {
        showError('Password needs at least one lowercase letter');
        return;
    }
    if (!/[0-9]/.test(password)) {
        showError('Password needs at least one number');
        return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        showError('Password needs at least one special character (!@#$%...)');
        return;
    }
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        // Read response as text first, then parse
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            console.error('Register response not JSON:', text);
            showError('Server error. Please try again.');
            return;
        }
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            currentUser = data.user;
            try {
                showMainApp();
            } catch (appError) {
                console.error('showMainApp error after register:', appError.message, appError.stack, appError);
            }
        } else {
            showError(data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration fetch error:', error.message || error.name || String(error), error);
        showError('Registration failed. Check your connection and try again.');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    currentUser = null;
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    // Hide navbar and main app, show auth
    const nav = document.getElementById('mainNavbar');
    if (nav) nav.style.display = 'none';
    document.getElementById('authSection').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    
    // Clear forms
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
    
    // Reset password validation UI
    const strengthBar = document.getElementById('strengthBar');
    if (strengthBar) strengthBar.style.width = '0';
    const passwordMatch = document.getElementById('passwordMatch');
    if (passwordMatch) { passwordMatch.textContent = ''; passwordMatch.className = 'password-match'; }
    document.querySelectorAll('.password-rules .rule').forEach(r => r.classList.remove('pass'));
}

// Navigation functions
function showSection(sectionName) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));
    
    const target = document.getElementById(sectionName + 'Section');
    if (target) target.classList.add('active');
    
    // Update desktop tab highlights
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === sectionName);
    });
    // Update mobile bottom tab highlights
    document.querySelectorAll('.bottom-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === sectionName);
    });
    
    // Load data for the section
    switch(sectionName) {
        case 'matches':
            loadMatches();
            break;
        case 'leaderboard':
            loadLeaderboard();
            break;
        case 'leagues':
            if (typeof loadLeagues === 'function') loadLeagues();
            break;
        case 'h2h':
            loadH2HChallenges();
            loadH2HInfo();
            break;
        case 'profile':
            if (typeof loadProfile === 'function') loadProfile();
            if (typeof loadAchievements === 'function') loadAchievements();
            break;
        case 'seasonStats':
            if (typeof loadSeasonStats === 'function') loadSeasonStats();
            break;
    }
}

// Matches sub-tab switching (Fixtures / My Predictions / Reveals)
function showMatchesTab(tab) {
    document.querySelectorAll('.matches-sub-tabs .h2h-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('matchesFixturesTab').style.display = tab === 'fixtures' ? 'block' : 'none';
    document.getElementById('matchesPredictionsTab').style.display = tab === 'predictions' ? 'block' : 'none';
    document.getElementById('matchesRevealsTab').style.display = tab === 'reveals' ? 'block' : 'none';
    event.currentTarget.classList.add('active');
    if (tab === 'predictions') loadMyPredictions();
    if (tab === 'reveals') populateRevealSelector();
}

// Mobile bottom nav "More" menu
function toggleMoreMenu() {
    const menu = document.getElementById('moreMenu');
    if (menu) menu.classList.toggle('open');
}

function closeMoreMenu() {
    const menu = document.getElementById('moreMenu');
    if (menu) menu.classList.remove('open');
}

// Close more menu when tapping outside
document.addEventListener('click', function(e) {
    const menu = document.getElementById('moreMenu');
    const moreBtn = document.querySelector('.bottom-tab[data-section="more"]');
    if (menu && menu.classList.contains('open') && !menu.contains(e.target) && !moreBtn.contains(e.target)) {
        menu.classList.remove('open');
    }
});

function toggleMenu() {
    const navMenu = document.getElementById('navMenu');
    navMenu.classList.toggle('active');
}

async function loadMatches() {
    try {
        console.log('Loading matches for gameweek:', currentGameweek);
        const response = await fetch(`/api/matches?gameweek=${currentGameweek}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Matches response:', data);
        
        const matches = data.matches || [];
        gameweekDeadline = data.deadline;
        canPredict = data.canPredict;
        
        // Update UI
        document.getElementById('currentGameweek').textContent = currentGameweek;
        updateDeadlineDisplay();
        
        // Load user's doubler and predictions for this gameweek
        await loadUserDoubler(currentGameweek);
        await loadUserPredictionsForGameweek();
        
        displayMatches(matches);
    } catch (error) {
        console.error('Load matches error:', error);
        showError('Failed to load matches: ' + error.message);
    }
}

async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const leaderboard = await response.json();
        
        const leaderboardList = domCache.leaderboardList || document.getElementById('leaderboardList');
        if (!leaderboardList) return;
        
        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        
        leaderboard.forEach((player, index) => {
            const item = createLeaderboardItem(player, index + 1);
            fragment.appendChild(item);
        });
        
        leaderboardList.innerHTML = '';
        leaderboardList.appendChild(fragment);
    } catch (error) {
        showError('Failed to load leaderboard');
    }
}

async function loadMyPredictions() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/my-predictions', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const predictions = await response.json();
        
        const predictionsList = document.getElementById('predictionsList');
        predictionsList.innerHTML = '';
        
        if (predictions.length === 0) {
            predictionsList.innerHTML = '<p style="text-align: center; color: white; padding: 2rem;">No predictions yet. Go to matches to make your first prediction!</p>';
            return;
        }
        
        predictions.forEach(prediction => {
            const card = createPredictionCard(prediction);
            predictionsList.appendChild(card);
        });
    } catch (error) {
        showError('Failed to load predictions');
    }
}

// UI creation functions
function createLeaderboardItem(player, rank) {
    const item = document.createElement('div');
    item.className = `leaderboard-item ${rank <= 3 ? 'top-3' : ''}`;
    
    let rankClass = '';
    if (rank === 1) rankClass = 'gold';
    else if (rank === 2) rankClass = 'silver';
    else if (rank === 3) rankClass = 'bronze';
    
    const titleBadge = player.titleName 
        ? `<span class="user-title-badge" style="background:${player.titleColor}22;color:${player.titleColor};border:1px solid ${player.titleColor}44">${player.titleName}</span>` 
        : '';
    item.innerHTML = `
        <div class="player-info">
            <div class="player-rank ${rankClass}">${rank}</div>
            <div class="player-name">${player.username}${titleBadge}</div>
        </div>
        <div class="player-score">${player.score} pts</div>
    `;
    
    return item;
}

function createPredictionCard(prediction) {
    const card = document.createElement('div');
    card.className = `prediction-card ${prediction.isDoubler ? 'doubler' : ''}`;
    
    const homeTeam = prediction.homeTeam || 'Home';
    const awayTeam = prediction.awayTeam || 'Away';
    const homeLogo = typeof getTeamLogoHTML === 'function' ? getTeamLogoHTML(homeTeam) : '';
    const awayLogo = typeof getTeamLogoHTML === 'function' ? getTeamLogoHTML(awayTeam) : '';
    const doublerBadge = prediction.isDoubler ? '<span class="doubler-badge">2x</span>' : '';
    
    // Show actual result if match is finished
    let resultHTML = '';
    if (prediction.matchStatus === 'finished' && prediction.actualHomeScore !== null) {
        resultHTML = `<div class="prediction-result">Result: ${prediction.actualHomeScore} - ${prediction.actualAwayScore}</div>`;
    } else if (prediction.matchStatus === 'live') {
        resultHTML = `<div class="prediction-result live">LIVE</div>`;
    }
    
    card.innerHTML = `
        <div class="prediction-card-header">
            <span class="prediction-gw">GW${prediction.gameweek || 1}</span>
            ${doublerBadge}
        </div>
        <div class="prediction-teams">
            <div class="prediction-team">
                <span class="prediction-team-logo">${homeLogo}</span>
                <span class="prediction-team-name">${homeTeam}</span>
            </div>
            <div class="prediction-vs">vs</div>
            <div class="prediction-team">
                <span class="prediction-team-logo">${awayLogo}</span>
                <span class="prediction-team-name">${awayTeam}</span>
            </div>
        </div>
        <div class="prediction-your-score">
            Your prediction: <strong>${prediction.homeScore} - ${prediction.awayScore}</strong>
        </div>
        ${resultHTML}
    `;
    
    return card;
}

async function handlePredictionSubmit(e) {
    e.preventDefault();
    
    if (!canPredict) {
        showError('Prediction deadline has passed for this gameweek');
        return;
    }
    
    const homeScore = parseInt(document.getElementById('homeScore').value);
    const awayScore = parseInt(document.getElementById('awayScore').value);
    const isDoubler = document.getElementById('doublerCheckbox').checked;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                matchId: currentMatchId,
                homeScore,
                awayScore,
                isDoubler,
                gameweek: currentGameweek
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('Prediction saved successfully!');
            closePredictionModal();
            loadMyPredictions();
            loadMatches(); // Refresh to show updated predictions
            loadProfile(); // Refresh stats
            // Show badge notifications if any new badges were earned
            if (data.newBadges && data.newBadges.length > 0) {
                showBadgeNotification(data.newBadges);
            }
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Failed to save prediction');
    }
}

// Cancel doubler for current gameweek
async function cancelDoubler(gameweek) {
    if (!confirm('Remove your doubler from this match?')) return;
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/doubler/${gameweek}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            userDoublerMatchId = null;
            showSuccess('Doubler cancelled');
            loadMatches();
        } else {
            const data = await response.json();
            showError(data.error || 'Failed to cancel doubler');
        }
    } catch (error) {
        showError('Failed to cancel doubler');
    }
}

// Utility functions - showError is defined later with a better UI
function showError(message) {
    let errorDiv = document.getElementById('errorMessage');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'errorMessage';
        errorDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#ff4444;color:white;padding:15px;border-radius:8px;z-index:10000;max-width:350px;font-size:0.9rem;box-shadow:0 4px 15px rgba(0,0,0,0.3);';
        document.body.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
}

function showSuccess(message) {
    let successDiv = document.getElementById('successMessage');
    if (!successDiv) {
        successDiv = document.createElement('div');
        successDiv.id = 'successMessage';
        successDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#00b894;color:white;padding:15px;border-radius:8px;z-index:10000;max-width:350px;font-size:0.9rem;box-shadow:0 4px 15px rgba(0,0,0,0.3);';
        document.body.appendChild(successDiv);
    }
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    setTimeout(() => { successDiv.style.display = 'none'; }, 4000);
}

// Load user predictions for the current gameweek into the userPredictions map
async function loadUserPredictionsForGameweek() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const response = await fetch('/api/my-predictions', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const predictions = await response.json();
            userPredictions = {};
            predictions.forEach(p => {
                if (p.gameweek == currentGameweek) {
                    userPredictions[p.matchId] = p;
                }
            });
        }
    } catch (error) {
        console.error('Failed to load user predictions:', error);
    }
}

// Load user's doubler for a gameweek
async function loadUserDoubler(gameweek) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/doubler/${gameweek}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            userDoublerMatchId = data.doublerMatchId;
        }
    } catch (error) {
        console.error('Failed to load doubler:', error);
    }
}

// Socket.io event listeners
function setupSocketListeners() {
    if (socket) {
        socket.on('matchResult', (data) => {
            // Update leaderboard in real-time
            updateLeaderboardDisplay(data.updatedLeaderboard);
            showSuccess(`Match ${data.matchId} result: ${data.homeScore}-${data.awayScore}`);
        });
        socket.on('matchStarting', (data) => {
            if (typeof playFootballWhistle === 'function') playFootballWhistle();
            showToast(`⚽ ${data.homeTeam} vs ${data.awayTeam} is about to kick off!`, 'info');
        });
    }
}

function updateLeaderboardDisplay(leaderboard) {
    const leaderboardList = document.getElementById('leaderboardList');
    leaderboardList.innerHTML = '';
    
    leaderboard.forEach((player, index) => {
        const item = createLeaderboardItem(player, index + 1);
        leaderboardList.appendChild(item);
    });
}

// Admin panel functions
function toggleAdminPanel() {
    const panel = document.getElementById('adminPanel');
    panel.classList.toggle('show');
}

async function updateMatchResult(event) {
    event.preventDefault();
    
    const matchId = parseInt(document.getElementById('adminMatchId').value);
    const homeScore = parseInt(document.getElementById('adminHomeScore').value);
    const awayScore = parseInt(document.getElementById('adminAwayScore').value);
    
    try {
        const response = await fetch('/api/admin/update-match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ matchId, homeScore, awayScore })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('Match result updated! Points calculated.');
            document.getElementById('adminPanel').classList.remove('show');
            // Refresh data
            loadMatches();
            loadLeaderboard();
            loadMyPredictions();
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Failed to update match result');
    }
}

// Gameweek navigation
function changeGameweek() {
    const selector = document.getElementById('gameweekSelector');
    currentGameweek = parseInt(selector.value);
    loadMatches();
}

// Update deadline display
function updateDeadlineDisplay() {
    const deadlineInfo = document.getElementById('deadlineInfo');
    const deadlineText = document.getElementById('deadlineText');
    
    if (!gameweekDeadline) {
        deadlineText.textContent = 'No deadline information';
        return;
    }
    
    const deadline = new Date(gameweekDeadline);
    const now = new Date();
    const timeUntilDeadline = deadline - now;
    
    deadlineInfo.className = 'deadline-info';
    
    if (timeUntilDeadline <= 0) {
        deadlineInfo.classList.add('expired');
        deadlineText.textContent = `Deadline passed: ${deadline.toLocaleDateString()} ${deadline.toLocaleTimeString()}`;
    } else if (timeUntilDeadline < 24 * 60 * 60 * 1000) { // Less than 24 hours
        deadlineInfo.classList.add('warning');
        const hours = Math.floor(timeUntilDeadline / (60 * 60 * 1000));
        const minutes = Math.floor((timeUntilDeadline % (60 * 60 * 1000)) / (60 * 1000));
        deadlineText.textContent = `Deadline in ${hours}h ${minutes}m`;
    } else {
        deadlineInfo.classList.add('safe');
        deadlineText.textContent = `Deadline: ${deadline.toLocaleDateString()} ${deadline.toLocaleTimeString()}`;
    }
}

// Update deadline display every minute
setInterval(updateDeadlineDisplay, 60000);

// Display matches in the UI
function displayMatches(matches) {
    const container = domCache.matchesContainer || document.getElementById('matchesContainer');
    if (!container) {
        console.error('Matches container not found');
        return;
    }
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    if (!matches || matches.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: white; padding: 2rem;">No matches available for this gameweek.</p>';
        return;
    }
    
    matches.forEach(match => {
        const matchCard = createMatchCard(match);
        fragment.appendChild(matchCard);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

// Create a match card element
function createMatchCard(match) {
    const card = document.createElement('div');
    
    // Check if user has predicted this match
    const userPrediction = userPredictions[match.id];
    const isDoubler = userDoublerMatchId == match.id;
    
    card.className = `match-card ${userPrediction ? 'predicted' : ''} ${isDoubler ? 'doubler' : ''}`;
    
    // Predicted badge + score overlay
    let predictionOverlay = '';
    if (userPrediction) {
        const cancelBtn = (userPrediction.isDoubler && match.status === 'upcoming' && canPredict) 
            ? `<button class="btn-cancel-doubler" onclick="cancelDoubler(${match.gameweek})" title="Cancel Doubler"><i class="fas fa-times"></i></button>` 
            : '';
        predictionOverlay = `
            <div class="match-predicted-banner">
                <i class="fas fa-check-circle"></i>
                <span>Predicted: <strong>${userPrediction.homeScore} - ${userPrediction.awayScore}</strong></span>
                ${userPrediction.isDoubler ? '<span class="doubler-badge">2x</span>' : ''}
                ${cancelBtn}
            </div>
        `;
    }
    
    // Action button
    let actionHTML = '';
    if (match.status === 'upcoming' && canPredict) {
        const btnClass = userPrediction ? 'btn btn-edit' : 'btn btn-primary';
        const btnIcon = userPrediction ? 'fas fa-pen' : 'fas fa-bullseye';
        const btnText = userPrediction ? 'Edit Prediction' : 'Predict';
        actionHTML = `
            <div class="match-actions">
                <button class="${btnClass}" onclick="openPredictionModal(${match.id}, '${match.homeTeam.replace(/'/g, "\\'")}', '${match.awayTeam.replace(/'/g, "\\'")}', '${match.date}', ${match.gameweek})">
                    <i class="${btnIcon}"></i> ${btnText}
                </button>
            </div>
        `;
    } else if (match.status === 'upcoming' && !canPredict) {
        actionHTML = `
            <div class="match-actions">
                <button class="btn btn-secondary" disabled>
                    <i class="fas fa-lock"></i> Deadline Passed
                </button>
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="match-header">
            <span class="match-date">${new Date(match.date).toLocaleDateString()}</span>
            <span class="match-time">${new Date(match.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            <span class="match-status ${match.status}">${match.status.toUpperCase()}</span>
        </div>
        <div class="match-teams">
            <div class="team home-team">
                <span class="team-logo">${getTeamLogo(match.homeTeam)}</span>
                <span class="team-name">${match.homeTeam}</span>
            </div>
            <div class="vs">VS</div>
            <div class="team away-team">
                <span class="team-logo">${getTeamLogo(match.awayTeam)}</span>
                <span class="team-name">${match.awayTeam}</span>
            </div>
        </div>
        ${predictionOverlay}
        ${match.status === 'finished' ? `
            <div class="final-score">
                Final: ${match.homeScore} - ${match.awayScore}
            </div>
        ` : ''}
        ${actionHTML}
    `;
    
    return card;
}

// Load existing prediction for a match
async function loadExistingPrediction(matchId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/my-predictions', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const predictions = await response.json();
            const existingPrediction = predictions.find(p => p.matchId == matchId);
            
            if (existingPrediction) {
                document.getElementById('homeScore').value = existingPrediction.homeScore;
                document.getElementById('awayScore').value = existingPrediction.awayScore;
                document.getElementById('doublerCheckbox').checked = existingPrediction.isDoubler;
            }
        }
    } catch (error) {
        console.error('Failed to load existing prediction:', error);
    }
}

// Open prediction modal
function openPredictionModal(matchId, homeTeam, awayTeam, matchDate, gameweek) {
    // Store match info for submission
    window.currentMatchId = matchId;
    window.currentGameweek = gameweek;
    
    // Set team names in modal
    document.getElementById('modalHomeTeam').textContent = homeTeam;
    document.getElementById('modalAwayTeam').textContent = awayTeam;
    const homeLabel = document.getElementById('homeTeamLabel');
    const awayLabel = document.getElementById('awayTeamLabel');
    if (homeLabel) homeLabel.textContent = homeTeam;
    if (awayLabel) awayLabel.textContent = awayTeam;
    document.getElementById('modalMatchDate').textContent = new Date(matchDate).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    // Deadline check
    const deadlineWarning = document.getElementById('modalDeadlineWarning');
    const predictionForm = document.getElementById('predictionForm');
    if (deadlineWarning && predictionForm) {
        if (!canPredict) {
            deadlineWarning.style.display = 'flex';
            predictionForm.style.display = 'none';
        } else {
            deadlineWarning.style.display = 'none';
            predictionForm.style.display = 'block';
        }
    }
    
    // Reset form
    document.getElementById('homeScore').value = '';
    document.getElementById('awayScore').value = '';
    document.getElementById('doublerCheckbox').checked = false;
    
    // Update doubler hint
    const doublerHint = document.getElementById('doublerHint');
    if (doublerHint) {
        if (userDoublerMatchId && userDoublerMatchId != matchId) {
            doublerHint.textContent = 'You already used your doubler on another match this gameweek. Checking this will move it here.';
            doublerHint.style.display = 'block';
        } else {
            doublerHint.textContent = '';
            doublerHint.style.display = 'none';
        }
    }
    
    // Load existing prediction if any (pre-fills the form for editing)
    const existing = userPredictions[matchId];
    if (existing) {
        document.getElementById('homeScore').value = existing.homeScore;
        document.getElementById('awayScore').value = existing.awayScore;
        document.getElementById('doublerCheckbox').checked = !!existing.isDoubler;
    }
    
    // Show modal
    document.getElementById('predictionModal').style.display = 'block';
}

// Close prediction modal
function closePredictionModal() {
    document.getElementById('predictionModal').style.display = 'none';
}

// Show error message
function showError(message) {
    // Create or update error element
    let errorDiv = document.getElementById('errorMessage');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'errorMessage';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 300px;
        `;
        document.body.appendChild(errorDiv);
    }
    
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Show main app
function showMainApp() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    // Show navbar when logged in
    const nav = document.getElementById('mainNavbar');
    if (nav) nav.style.display = 'block';
    
    // Display username
    if (currentUser && currentUser.username) {
        const usernameDisplay = domCache.usernameDisplay || document.getElementById('usernameDisplay');
        if (usernameDisplay) {
            usernameDisplay.textContent = currentUser.username;
        }
    }
    
    // Initialize socket connection
    if (!socket) {
        socket = io();
        socket.on('leaderboardUpdate', loadLeaderboard);
    }
    
    // Load gameweeks first, then matches
    loadGameweeks().then(() => {
        loadMatches();
        loadLeaderboard();
        loadMyPredictions();
    });
}

// Toggle password visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(inputId + 'Toggle');
    
    if (input.type === 'password') {
        input.type = 'text';
        toggle.classList.remove('fa-eye');
        toggle.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        toggle.classList.remove('fa-eye-slash');
        toggle.classList.add('fa-eye');
    }
}

// Load gameweeks into selector with status indicators
async function loadGameweeks() {
    try {
        const selector = domCache.gameweekSelector || document.getElementById('gameweekSelector');
        if (!selector) {
            console.error('Gameweek selector not found');
            return;
        }
        
        // Auto-detect current gameweek from API if not set
        let matchList = [];
        try {
            const response = await fetch('/api/matches');
            if (response.ok) {
                const data = await response.json();
                matchList = data.matches || data;
                if (!Array.isArray(matchList)) matchList = [];
            }
        } catch (e) {
            console.log('Could not fetch matches for gameweek detection');
        }

        // Set currentGameweek to first upcoming if not already set
        if (!currentGameweek) {
            const firstUpcoming = matchList.find(m => m.status === 'upcoming');
            if (firstUpcoming) {
                currentGameweek = firstUpcoming.gameweek;
            } else {
                // Fallback: last finished gameweek or 1
                const finished = matchList.filter(m => m.status === 'finished');
                if (finished.length > 0) {
                    currentGameweek = Math.max(...finished.map(m => m.gameweek));
                } else {
                    currentGameweek = 1;
                }
            }
            console.log('Auto-detected gameweek:', currentGameweek);
        }

        // Safety guard: never leave currentGameweek null
        if (!currentGameweek) currentGameweek = 1;

        // Clear and populate hidden select
        selector.innerHTML = '';
        for (let i = 1; i <= 38; i++) {
            const option = document.createElement('option');
            option.value = i;

            // Add status indicator
            const gwMatches = matchList.filter(m => m.gameweek === i);
            let status = '';
            if (gwMatches.length > 0) {
                const finCount = gwMatches.filter(m => m.status === 'finished').length;
                const liveCount = gwMatches.filter(m => m.status === 'live').length;
                if (finCount === gwMatches.length) status = ' ✅';
                else if (liveCount > 0) status = ' 🔴';
                else status = ' ⏳';
            }
            option.textContent = `Gameweek ${i}${status}`;
            if (i === currentGameweek) option.selected = true;
            selector.appendChild(option);
        }

        // Update header display
        const gwDisplay = document.getElementById('currentGameweek');
        if (gwDisplay) gwDisplay.textContent = currentGameweek;

        // Build gameweek statuses and render pills
        const gameweekStatuses = {};
        for (let i = 1; i <= 38; i++) {
            const gwMatches = matchList.filter(m => m.gameweek === i);
            if (gwMatches.length > 0) {
                const finCount = gwMatches.filter(m => m.status === 'finished').length;
                const liveCount = gwMatches.filter(m => m.status === 'live').length;
                if (finCount === gwMatches.length) gameweekStatuses[i] = 'finished';
                else if (liveCount > 0) gameweekStatuses[i] = 'live';
            }
        }
        setTimeout(() => renderGameweekPills(gameweekStatuses), 100);
        
    } catch (error) {
        console.error('Failed to load gameweeks:', error);
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modals = ['predictionModal', 'createLeagueModal', 'joinLeagueModal', 'shareCardModal'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Generic close modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// ===== LEAGUES =====

function openCreateLeagueModal() {
    document.getElementById('createLeagueModal').style.display = 'block';
    document.getElementById('leagueName').value = '';
}

function openJoinLeagueModal() {
    document.getElementById('joinLeagueModal').style.display = 'block';
    document.getElementById('inviteCode').value = '';
}

async function handleCreateLeague(e) {
    e.preventDefault();
    const name = document.getElementById('leagueName').value.trim();
    if (!name) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/leagues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (response.ok) {
            closeModal('createLeagueModal');
            showSuccess(`League "${data.name}" created! Invite code: ${data.inviteCode}`);
            loadLeagues();
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Failed to create league');
    }
}

async function handleJoinLeague(e) {
    e.preventDefault();
    const inviteCode = document.getElementById('inviteCode').value.trim().toUpperCase();
    if (!inviteCode) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/leagues/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ inviteCode })
        });
        const data = await response.json();
        if (response.ok) {
            closeModal('joinLeagueModal');
            showSuccess(`Joined league "${data.name}"!`);
            loadLeagues();
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Failed to join league');
    }
}

async function loadLeagues() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/leagues', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const leagues = await response.json();
        const container = document.getElementById('leaguesList');

        if (!leagues.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No leagues yet. Create one and invite your friends!</p>
                </div>`;
            return;
        }

        container.innerHTML = leagues.map(league => `
            <div class="league-card" onclick="openLeagueLeaderboard(${league.id})">
                <div class="league-info">
                    <h4>${league.name}</h4>
                    <span class="league-meta"><i class="fas fa-users"></i> ${league.member_count} members</span>
                    <span class="league-meta"><i class="fas fa-user"></i> Created by ${league.creator_name}</span>
                </div>
                <div class="league-code">
                    <span class="code-label">Code</span>
                    <span class="code-value">${league.invite_code}</span>
                </div>
                <i class="fas fa-chevron-right league-arrow"></i>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load leagues:', error);
    }
}

async function openLeagueLeaderboard(leagueId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/leagues/${leagueId}/leaderboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        document.getElementById('leaguesList').style.display = 'none';
        document.getElementById('leagueLeaderboardView').style.display = 'block';
        document.getElementById('leagueNameTitle').textContent = data.league.name;
        document.getElementById('leagueInviteDisplay').textContent = data.league.invite_code;
        window._currentLeagueCode = data.league.invite_code;

        const list = document.getElementById('leagueLeaderboardList');
        list.innerHTML = '';

        data.leaderboard.forEach((player, index) => {
            const item = createLeaderboardItem(player, index + 1);
            list.appendChild(item);
        });
    } catch (error) {
        showError('Failed to load league leaderboard');
    }
}

function backToLeaguesList() {
    document.getElementById('leaguesList').style.display = '';
    document.getElementById('leagueLeaderboardView').style.display = 'none';
}

function copyInviteCode() {
    const code = window._currentLeagueCode;
    if (code) {
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('copyCodeBtn');
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = original; }, 2000);
        });
    }
}

// ===== TITLE SYSTEM =====

async function setTitle(titleKey) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ titleKey })
        });
        const data = await response.json();
        if (response.ok) {
            showSuccess(data.message);
            loadLeaderboard();
        } else {
            showError(data.error || 'Failed to set title');
        }
    } catch (error) {
        showError('Failed to set title');
    }
}

async function clearTitle() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ titleKey: null })
        });
        if (response.ok) {
            showSuccess('Title cleared');
            loadLeaderboard();
        }
    } catch (error) {
        showError('Failed to clear title');
    }
}

// ===== ACHIEVEMENTS =====

async function loadAchievements() {
    try {
        const token = localStorage.getItem('token');
        
        // Fetch current title
        try {
            const titleRes = await fetch('/api/title', { headers: { 'Authorization': `Bearer ${token}` } });
            if (titleRes.ok) {
                const titleData = await titleRes.json();
                const titleBar = document.getElementById('currentTitleBar');
                const titleName = document.getElementById('currentTitleName');
                if (titleBar && titleName) {
                    if (titleData.titleName) {
                        titleName.textContent = titleData.titleName;
                        titleBar.style.display = 'flex';
                    } else {
                        titleBar.style.display = 'none';
                    }
                }
            }
        } catch (e) { /* ignore title fetch error */ }

        const response = await fetch('/api/achievements', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to load achievements');
        const achievements = await response.json();
        
        const earned = achievements.filter(a => a.earned);
        
        // Summary
        const summaryEl = document.getElementById('achievementsSummary');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="achievements-progress">
                    <div class="achievements-count">${earned.length} <span>/ ${achievements.length}</span></div>
                    <div class="achievements-bar">
                        <div class="achievements-bar-fill" style="width: ${Math.round((earned.length / achievements.length) * 100)}%"></div>
                    </div>
                    <div class="achievements-label">Achievements Unlocked</div>
                </div>
            `;
        }
        
        // Grid grouped by tier
        const gridEl = document.getElementById('achievementsGrid');
        if (gridEl) {
            gridEl.innerHTML = '';
            
            const tierOrder = ['beginner', 'veteran', 'elite', 'mythic'];
            const tierLabels = { beginner: 'Beginner', veteran: 'Veteran', elite: 'Elite', mythic: 'Mythic' };
            const tierColors = { beginner: '#90CAF9', veteran: '#FFD700', elite: '#E91E63', mythic: '#FF1744' };
            
            tierOrder.forEach(tier => {
                const tierAchievements = achievements.filter(a => (a.tier || 'beginner') === tier);
                if (tierAchievements.length === 0) return;
                
                const tierEarned = tierAchievements.filter(a => a.earned).length;
                
                // Tier header
                const header = document.createElement('div');
                header.className = 'tier-header';
                header.innerHTML = `
                    <span class="tier-label" style="color: ${tierColors[tier]}">${tierLabels[tier]}</span>
                    <span class="tier-count">${tierEarned}/${tierAchievements.length}</span>
                `;
                gridEl.appendChild(header);
                
                // Earned first, then locked within each tier
                const sorted = [...tierAchievements.filter(a => a.earned), ...tierAchievements.filter(a => !a.earned)];
                sorted.forEach(a => {
                    const card = document.createElement('div');
                    card.className = `achievement-card ${a.earned ? 'earned' : 'locked'} tier-${a.tier || 'beginner'}`;
                    const dateStr = a.earned_at ? new Date(a.earned_at).toLocaleDateString() : '';
                    const titleBtn = a.earned ? `<button class="btn-set-title" onclick="setTitle('${a.key}')" title="Use as title"><i class="fas fa-tag"></i></button>` : '';
                    card.innerHTML = `
                        <div class="achievement-icon" style="color: ${a.earned ? a.color : '#555'}">
                            <i class="${a.icon}"></i>
                        </div>
                        <div class="achievement-info">
                            <div class="achievement-name">${a.name} ${titleBtn}</div>
                            <div class="achievement-desc">${a.description}</div>
                            ${a.earned ? `<div class="achievement-date">Earned ${dateStr}</div>` : '<div class="achievement-locked"><i class="fas fa-lock"></i> Locked</div>'}
                        </div>
                    `;
                    gridEl.appendChild(card);
                });
            });
        }
    } catch (error) {
        console.error('Failed to load achievements:', error);
    }
}

// ===== PROFILE & STATS =====

async function loadProfile() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const profile = await response.json();

        // Update header stats
        const streakEl = document.getElementById('userStreak');
        const rankEl = document.getElementById('userRank');
        if (streakEl) streakEl.textContent = profile.currentStreak;
        if (rankEl) rankEl.textContent = profile.rank;

        // Profile stats grid
        const statsGrid = document.getElementById('profileStats');
        if (statsGrid) {
            statsGrid.innerHTML = `
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-trophy"></i></div>
                    <div class="stat-value">${profile.score}</div>
                    <div class="stat-label">Total Points</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-ranking-star"></i></div>
                    <div class="stat-value">#${profile.rank}</div>
                    <div class="stat-label">Global Rank</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-fire"></i></div>
                    <div class="stat-value">${profile.currentStreak}</div>
                    <div class="stat-label">Current Streak</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-meteor"></i></div>
                    <div class="stat-value">${profile.bestStreak}</div>
                    <div class="stat-label">Best Streak</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-futbol"></i></div>
                    <div class="stat-value">${profile.predictions}</div>
                    <div class="stat-label">Predictions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-medal"></i></div>
                    <div class="stat-value">${profile.badges.length}</div>
                    <div class="stat-label">Badges</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-value">${profile.leagues}</div>
                    <div class="stat-label">Leagues</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-earth-americas"></i></div>
                    <div class="stat-value">${profile.totalPlayers}</div>
                    <div class="stat-label">Total Players</div>
                </div>
            `;
        }

        // Badges
        loadBadgesDisplay(profile.badges);

    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

async function loadBadgesDisplay(earnedBadges) {
    try {
        const response = await fetch('/api/badges/all');
        const allBadges = await response.json();

        const grid = document.getElementById('badgesGrid');
        if (!grid) return;

        const earnedKeys = earnedBadges ? earnedBadges.map(b => b.key) : [];

        grid.innerHTML = Object.entries(allBadges).map(([key, badge]) => {
            const earned = earnedKeys.includes(key);
            return `
                <div class="badge-item ${earned ? 'earned' : 'locked'}" title="${badge.description}">
                    <div class="badge-icon" style="${earned ? 'color:' + badge.color : ''}">
                        <i class="${badge.icon}"></i>
                    </div>
                    <div class="badge-name">${badge.name}</div>
                    <div class="badge-desc">${badge.description}</div>
                    ${earned ? '<div class="badge-earned"><i class="fas fa-check-circle"></i></div>' : '<div class="badge-lock"><i class="fas fa-lock"></i></div>'}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load badges:', error);
    }
}

// ===== WEEKLY WINNER BANNER =====

async function loadWeeklyWinner() {
    try {
        // Try to load winner for the previous gameweek
        const gwToCheck = currentGameweek > 1 ? currentGameweek - 1 : 1;
        const response = await fetch(`/api/weekly-winner/${gwToCheck}`);
        const winner = await response.json();

        const banner = document.getElementById('weeklyWinnerBanner');
        if (winner && winner.username) {
            document.getElementById('winnerGameweek').textContent = winner.gameweek;
            document.getElementById('winnerName').textContent = winner.username;
            document.getElementById('winnerScore').textContent = winner.score;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load weekly winner:', error);
    }
}

async function loadWeeklyWinnersHistory() {
    try {
        const response = await fetch('/api/weekly-winners');
        const winners = await response.json();
        const container = document.getElementById('winnersHistory');
        if (!container) return;

        if (!winners.length) {
            container.innerHTML = '<p class="empty-text">No weekly champions declared yet.</p>';
            return;
        }

        container.innerHTML = winners.map(w => `
            <div class="winner-row">
                <span class="winner-gw">GW${w.gameweek}</span>
                <span class="winner-name"><i class="fas fa-crown" style="color: #FFD700;"></i> ${w.username}</span>
                <span class="winner-pts">${w.score} pts</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load winners history:', error);
    }
}

// ===== SHARE CARD =====

async function openShareCard() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/share-card', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const canvas = document.getElementById('shareCardCanvas');
        canvas.innerHTML = `
            <div class="share-card-inner">
                <div class="share-card-header">
                    <i class="fas fa-futbol"></i>
                    <span>PL Predictions</span>
                </div>
                <div class="share-card-username">${data.username}</div>
                <div class="share-card-stats">
                    <div class="share-stat">
                        <div class="share-stat-value">${data.score}</div>
                        <div class="share-stat-label">Points</div>
                    </div>
                    <div class="share-stat">
                        <div class="share-stat-value">#${data.rank}</div>
                        <div class="share-stat-label">Rank</div>
                    </div>
                    <div class="share-stat">
                        <div class="share-stat-value">${data.currentStreak}</div>
                        <div class="share-stat-label">Streak</div>
                    </div>
                    <div class="share-stat">
                        <div class="share-stat-value">${data.predictions}</div>
                        <div class="share-stat-label">Predictions</div>
                    </div>
                </div>
                <div class="share-card-footer">
                    <span>${data.badgeCount} badges earned</span>
                    <span>Rank ${data.rank} of ${data.totalPlayers}</span>
                </div>
                <div class="share-card-cta">Can you beat me? Join now!</div>
            </div>
        `;

        window._shareCardData = data;
        document.getElementById('shareCardModal').style.display = 'block';
    } catch (error) {
        showError('Failed to generate share card');
    }
}

function copyShareText() {
    const data = window._shareCardData;
    if (!data) return;
    const text = `I scored ${data.score} points in PL Predictions! Rank #${data.rank} with a ${data.currentStreak}-game streak. Can you beat me? Join now!`;
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Share text copied to clipboard!');
    });
}

function downloadShareCard() {
    // Use html2canvas if available, otherwise just copy text
    const card = document.getElementById('shareCardCanvas');
    if (typeof html2canvas !== 'undefined') {
        html2canvas(card).then(canvas => {
            const link = document.createElement('a');
            link.download = 'pl-predictions-card.png';
            link.href = canvas.toDataURL();
            link.click();
        });
    } else {
        // Fallback: copy text
        copyShareText();
        showSuccess('Text copied! (Add html2canvas library for image download)');
    }
}

// ===== BADGE NOTIFICATION =====

function showBadgeNotification(badgeKeys) {
    if (!badgeKeys || !badgeKeys.length) return;

    const notif = document.getElementById('badgeNotification');
    const text = document.getElementById('badgeNotifText');

    // Show each badge notification sequentially
    let i = 0;
    function showNext() {
        if (i >= badgeKeys.length) return;
        text.textContent = badgeKeys[i];
        notif.style.display = 'block';
        notif.classList.add('show');
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => {
                notif.style.display = 'none';
                i++;
                showNext();
            }, 300);
        }, 3000);
    }
    showNext();
}

// ===== SHOW SUCCESS NOTIFICATION =====

function showSuccess(message) {
    let successDiv = document.getElementById('successMessage');
    if (!successDiv) {
        successDiv = document.createElement('div');
        successDiv.id = 'successMessage';
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00b894, #00cec9);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            z-index: 10000;
            max-width: 350px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            font-weight: 500;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(successDiv);
    }
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    setTimeout(() => { successDiv.style.display = 'none'; }, 4000);
}

// ===== UPDATE showSection to handle new sections =====

// Override showSection to support leagues and profile
const _originalShowSection = typeof showSection === 'function' ? showSection : null;

showSection = function(sectionName) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));

    const target = document.getElementById(sectionName + 'Section');
    if (target) target.classList.add('active');

    // Update active tab in navbar (desktop + mobile)
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === sectionName);
    });
    document.querySelectorAll('.bottom-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === sectionName);
    });

    // Reset league sub-view when navigating away
    if (sectionName !== 'leagues') {
        backToLeaguesList();
    }

    // Load data for the section
    switch(sectionName) {
        case 'matches':
            loadMatches();
            break;
        case 'leaderboard':
            loadLeaderboard();
            break;
        case 'leagues':
            loadLeagues();
            break;
        case 'h2h':
            loadH2HChallenges();
            loadH2HInfo();
            break;
        case 'seasonStats':
            loadSeasonStats();
            break;
        case 'notifications':
            loadNotifications();
            loadNotificationCount();
            break;
        case 'profile':
            loadProfile();
            loadWeeklyWinnersHistory();
            if (typeof loadAchievements === 'function') loadAchievements();
            break;
    }
}

// ===== UPDATE showMainApp to load new features =====

const _origShowMainApp = showMainApp;
showMainApp = function() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    // Show navbar when logged in
    const nav = document.getElementById('mainNavbar');
    if (nav) nav.style.display = 'block';

    if (currentUser && currentUser.username) {
        const usernameDisplay = domCache.usernameDisplay || document.getElementById('usernameDisplay');
        if (usernameDisplay) usernameDisplay.textContent = currentUser.username;
    }

    if (!socket && typeof io !== 'undefined') {
        socket = io();
        socket.on('leaderboardUpdate', loadLeaderboard);
        // Listen for real-time notifications
        socket.on('notification', (data) => {
            if (data.userId === currentUser.id) {
                loadNotificationCount();
            }
        });
    }

    loadGameweeks().then(() => {
        loadMatches();
        loadLeaderboard();
        loadMyPredictions();
        loadProfile();
        loadWeeklyWinner();
        loadNotificationCount();
        populateRevealSelector();
    });
}

// ===== HEAD-TO-HEAD =====

let selectedOpponentId = null;

async function openH2HChallengeModal() {
    document.getElementById('h2hChallengeModal').style.display = 'block';
    document.getElementById('h2hSearchInput').value = '';
    document.getElementById('h2hSearchResults').innerHTML = '';
    document.getElementById('sendChallengeBtn').disabled = true;
    selectedOpponentId = null;

    // Fetch H2H info to get allowed challenge GW
    try {
        const token = localStorage.getItem('token');
        const infoRes = await fetch('/api/h2h/info', { headers: { 'Authorization': `Bearer ${token}` } });
        if (infoRes.ok) {
            const info = await infoRes.json();
            const sel = document.getElementById('h2hGameweek');
            sel.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = info.challengeGameweek;
            opt.textContent = `Gameweek ${info.challengeGameweek}`;
            opt.selected = true;
            sel.appendChild(opt);

            if (info.proposalsSent >= info.maxProposals) {
                showError(`You already sent ${info.maxProposals} challenge proposals for GW${info.challengeGameweek}`);
                closeModal('h2hChallengeModal');
                return;
            }
        }
    } catch (e) {
        // Fallback: show current GW
        const sel = document.getElementById('h2hGameweek');
        sel.innerHTML = `<option value="${currentGameweek}">Gameweek ${currentGameweek}</option>`;
    }
}

let h2hSearchTimeout = null;
function searchH2HOpponent() {
    clearTimeout(h2hSearchTimeout);
    const query = document.getElementById('h2hSearchInput').value.trim();
    if (query.length < 2) {
        document.getElementById('h2hSearchResults').innerHTML = '';
        return;
    }
    h2hSearchTimeout = setTimeout(async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const users = await response.json();
            const container = document.getElementById('h2hSearchResults');
            if (!users.length) {
                container.innerHTML = '<div class="h2h-no-results">No players found</div>';
                return;
            }
            container.innerHTML = users.map(u => `
                <div class="h2h-user-result ${selectedOpponentId === u.id ? 'selected' : ''}" onclick="selectH2HOpponent(${u.id}, '${u.username}')">
                    <span class="h2h-user-name">${u.username}</span>
                    <span class="h2h-user-score">${u.score} pts</span>
                </div>
            `).join('');
        } catch (e) {
            console.error('H2H search error:', e);
        }
    }, 300);
}

function selectH2HOpponent(id, name) {
    selectedOpponentId = id;
    document.getElementById('sendChallengeBtn').disabled = false;
    // Highlight selected
    document.querySelectorAll('.h2h-user-result').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

async function sendH2HChallenge() {
    if (!selectedOpponentId) return;
    const gameweek = parseInt(document.getElementById('h2hGameweek').value);
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/h2h/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ opponentId: selectedOpponentId, gameweek })
        });
        const data = await response.json();
        if (response.ok) {
            closeModal('h2hChallengeModal');
            showSuccess('Challenge sent!');
            loadH2HChallenges();
        } else {
            showError(data.error);
        }
    } catch (e) {
        showError('Failed to send challenge');
    }
}

async function loadH2HChallenges() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/h2h', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const challenges = await response.json();

        const pending = challenges.filter(c => c.status === 'pending' && c.opponent_id === currentUser.id);
        const rest = challenges.filter(c => !(c.status === 'pending' && c.opponent_id === currentUser.id));

        // Pending challenges (need action)
        const pendingContainer = document.getElementById('h2hPending');
        if (pending.length > 0) {
            pendingContainer.innerHTML = `
                <h4 style="color:#ffd700; margin-bottom:0.75rem;"><i class="fas fa-exclamation-circle"></i> Pending Challenges</h4>
                ${pending.map(c => `
                    <div class="h2h-card pending">
                        <div class="h2h-card-header">
                            <span class="h2h-gw">GW${c.gameweek}</span>
                            <span class="h2h-status status-pending">PENDING</span>
                        </div>
                        <div class="h2h-players">
                            <span class="h2h-player">${c.challenger_name}</span>
                            <span class="h2h-vs">VS</span>
                            <span class="h2h-player">${c.opponent_name}</span>
                        </div>
                        <div class="h2h-actions">
                            <button class="btn btn-primary btn-sm" onclick="acceptChallenge(${c.id})"><i class="fas fa-check"></i> Accept</button>
                            <button class="btn btn-secondary btn-sm" onclick="declineChallenge(${c.id})"><i class="fas fa-times"></i> Decline</button>
                        </div>
                    </div>
                `).join('')}`;
        } else {
            pendingContainer.innerHTML = '';
        }

        // All other challenges
        const listContainer = document.getElementById('h2hList');
        if (!rest.length && !pending.length) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-people-arrows"></i>
                    <p>No challenges yet. Challenge a friend!</p>
                </div>`;
            return;
        }

        listContainer.innerHTML = rest.map(c => {
            const statusClass = c.status === 'accepted' ? 'status-active' : c.status === 'completed' ? 'status-completed' : c.status === 'declined' ? 'status-declined' : c.status === 'expired' ? 'status-expired' : 'status-pending';
            const isMeChallenger = c.challenger_id === currentUser.id;
            return `
                <div class="h2h-card ${c.status}">
                    <div class="h2h-card-header">
                        <span class="h2h-gw">GW${c.gameweek}</span>
                        <span class="h2h-status ${statusClass}">${c.status.toUpperCase()}</span>
                    </div>
                    <div class="h2h-players">
                        <div class="h2h-player-side ${c.winner_id === c.challenger_id ? 'winner' : ''}">
                            <span class="h2h-player-name">${c.challenger_name}</span>
                            ${c.status === 'completed' ? `<span class="h2h-score">${c.challenger_score} pts</span>` : ''}
                        </div>
                        <span class="h2h-vs">VS</span>
                        <div class="h2h-player-side ${c.winner_id === c.opponent_id ? 'winner' : ''}">
                            <span class="h2h-player-name">${c.opponent_name}</span>
                            ${c.status === 'completed' ? `<span class="h2h-score">${c.opponent_score} pts</span>` : ''}
                        </div>
                    </div>
                    ${c.status === 'completed' && c.winner_name ? `<div class="h2h-winner"><i class="fas fa-trophy" style="color:#ffd700;"></i> ${c.winner_name} wins!</div>` : ''}
                    ${c.status === 'completed' && !c.winner_id ? `<div class="h2h-winner"><i class="fas fa-handshake" style="color:#667eea;"></i> It's a draw!</div>` : ''}
                    ${c.status === 'pending' && isMeChallenger ? `<div class="h2h-waiting"><i class="fas fa-hourglass-half"></i> Waiting for response...</div>` : ''}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load H2H challenges:', e);
    }
}

async function acceptChallenge(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/h2h/${id}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            showSuccess('Challenge accepted!');
            loadH2HChallenges();
        } else {
            const data = await response.json();
            showError(data.error);
        }
    } catch (e) { showError('Failed to accept'); }
}

async function declineChallenge(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/h2h/${id}/decline`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            showSuccess('Challenge declined');
            loadH2HChallenges();
        }
    } catch (e) { showError('Failed to decline'); }
}

// H2H tab switching
function showH2HTab(tab) {
    document.querySelectorAll('.h2h-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('h2hChallengesTab').style.display = tab === 'challenges' ? 'block' : 'none';
    document.getElementById('h2hLeaderboardTab').style.display = tab === 'leaderboard' ? 'block' : 'none';
    event.currentTarget.classList.add('active');
    if (tab === 'leaderboard') loadH2HLeaderboard();
}

// Load H2H info bar (challenge GW + remaining slots)
async function loadH2HInfo() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/h2h/info', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const info = await res.json();
        const bar = document.getElementById('h2hInfoBar');
        const proposalsLeft = info.maxProposals - info.proposalsSent;
        const acceptsLeft = info.maxAccepts - info.challengesAccepted;
        bar.innerHTML = `
            <span><i class="fas fa-gamepad"></i> Challenge for: <strong>GW${info.challengeGameweek}</strong></span>
            <span><i class="fas fa-paper-plane"></i> ${proposalsLeft}/${info.maxProposals} proposals</span>
            <span><i class="fas fa-check-circle"></i> ${acceptsLeft}/${info.maxAccepts} accepts</span>
        `;
    } catch (e) { /* ignore */ }
}

// Load H2H leaderboard
async function loadH2HLeaderboard() {
    try {
        const response = await fetch('/api/h2h/leaderboard');
        if (!response.ok) throw new Error('Failed');
        const leaderboard = await response.json();
        const container = document.getElementById('h2hLeaderboardList');

        if (!leaderboard.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-people-arrows"></i>
                    <p>No completed H2H challenges yet</p>
                </div>`;
            return;
        }

        container.innerHTML = leaderboard.map((p, i) => {
            const rank = i + 1;
            let rankClass = '';
            if (rank === 1) rankClass = 'gold';
            else if (rank === 2) rankClass = 'silver';
            else if (rank === 3) rankClass = 'bronze';
            return `
                <div class="leaderboard-item ${rank <= 3 ? 'top-3' : ''}">
                    <div class="player-info">
                        <div class="player-rank ${rankClass}">${rank}</div>
                        <div class="player-name">${p.username}</div>
                    </div>
                    <div class="player-score" style="display:flex;gap:0.75rem;align-items:center;">
                        <span style="font-size:0.7rem;color:rgba(255,255,255,0.5);">${p.wins}W ${p.draws}D ${p.losses}L</span>
                        <span>${p.glory} <i class="fas fa-fire" style="color:#ffd700;font-size:0.7rem;"></i> Glory</span>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        console.error('H2H leaderboard error:', e);
    }
}

// ===== PREDICTION REVEAL =====

function populateRevealSelector() {
    const sel = document.getElementById('revealGwSelector');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select Gameweek</option>';
    for (let i = 1; i <= 38; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Gameweek ${i}`;
        sel.appendChild(opt);
    }
}

async function loadPredictionReveal() {
    const gw = parseInt(document.getElementById('revealGwSelector').value);
    const container = document.getElementById('revealContent');
    if (!gw) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-eye-slash"></i><p>Select a gameweek</p></div>';
        return;
    }

    try {
        const response = await fetch(`/api/predictions/reveal/${gw}`);
        const data = await response.json();

        if (data.locked) {
            container.innerHTML = `
                <div class="reveal-locked">
                    <i class="fas fa-lock"></i>
                    <h4>Predictions Locked</h4>
                    <p>Predictions will be revealed once the gameweek deadline passes.</p>
                </div>`;
            return;
        }

        if (!data.matches || !data.matches.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No matches found for this gameweek</p></div>';
            return;
        }

        container.innerHTML = data.matches.map(match => {
            const matchPreds = data.predictions[match.id] || [];
            return `
                <div class="reveal-match-card">
                    <div class="reveal-match-header">
                        <span class="reveal-teams">${match.homeTeam} vs ${match.awayTeam}</span>
                        ${match.status === 'finished' ? `<span class="reveal-result">Final: ${match.homeScore}-${match.awayScore}</span>` : `<span class="reveal-status">${match.status.toUpperCase()}</span>`}
                    </div>
                    <div class="reveal-predictions">
                        ${matchPreds.length === 0 ? '<div class="reveal-none">No predictions</div>' :
                        matchPreds.map(p => `
                            <div class="reveal-pred-row">
                                <span class="reveal-username">${p.username}</span>
                                <span class="reveal-pred-score">${p.homeScore} - ${p.awayScore}</span>
                                ${p.isDoubler ? '<span class="reveal-doubler">2x</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load predictions</p></div>';
    }
}

// ===== SEASON STATS =====

async function loadSeasonStats() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/season-stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const stats = await response.json();

        // Stats grid
        const grid = document.getElementById('seasonStatsGrid');
        grid.innerHTML = `
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-trophy"></i></div><div class="stat-value">${stats.totalPoints}</div><div class="stat-label">Total Points</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-ranking-star"></i></div><div class="stat-value">#${stats.rank}</div><div class="stat-label">Rank</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-bullseye"></i></div><div class="stat-value">${stats.accuracy}%</div><div class="stat-label">Accuracy</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-star"></i></div><div class="stat-value">${stats.perfectScores}</div><div class="stat-label">Perfect 4/4</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-value">${stats.correctResults}</div><div class="stat-label">Correct Results</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-crosshairs"></i></div><div class="stat-value">${stats.correctScorelines}</div><div class="stat-label">Exact Scores</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-fire"></i></div><div class="stat-value">${stats.currentStreak}</div><div class="stat-label">Current Streak</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-meteor"></i></div><div class="stat-value">${stats.bestStreak}</div><div class="stat-label">Best Streak</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-futbol"></i></div><div class="stat-value">${stats.totalPredicted}</div><div class="stat-label">Predictions</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-value">${stats.avgPointsPerGW}</div><div class="stat-label">Avg Pts/GW</div></div>
            <div class="stat-card highlight-green"><div class="stat-icon"><i class="fas fa-arrow-up"></i></div><div class="stat-value">${stats.bestGameweek ? stats.bestGameweek.points + ' pts' : '-'}</div><div class="stat-label">Best GW${stats.bestGameweek ? ' (' + stats.bestGameweek.gameweek + ')' : ''}</div></div>
            <div class="stat-card highlight-red"><div class="stat-icon"><i class="fas fa-arrow-down"></i></div><div class="stat-value">${stats.worstGameweek ? stats.worstGameweek.points + ' pts' : '-'}</div><div class="stat-label">Worst GW${stats.worstGameweek ? ' (' + stats.worstGameweek.gameweek + ')' : ''}</div></div>
        `;

        // Bar chart for gameweek history
        const chartContainer = document.getElementById('gwChart');
        if (stats.gameweekHistory && stats.gameweekHistory.length > 0) {
            const maxPts = Math.max(...stats.gameweekHistory.map(g => g.points), 1);
            chartContainer.innerHTML = `
                <div class="chart-bars">
                    ${stats.gameweekHistory.map(g => {
                        const pct = (g.points / maxPts) * 100;
                        const isBest = stats.bestGameweek && g.gameweek === stats.bestGameweek.gameweek;
                        return `
                            <div class="chart-bar-group" title="GW${g.gameweek}: ${g.points} pts">
                                <div class="chart-bar-value">${g.points}</div>
                                <div class="chart-bar ${isBest ? 'bar-best' : ''}" style="height: ${Math.max(pct, 5)}%"></div>
                                <div class="chart-bar-label">GW${g.gameweek}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            chartContainer.innerHTML = '<p class="empty-text">No gameweek data yet. Start predicting!</p>';
        }
    } catch (e) {
        console.error('Failed to load season stats:', e);
    }
}

// ===== NOTIFICATIONS =====

async function loadNotificationCount() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const response = await fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const badge = document.getElementById('notifBadge');
        if (badge) {
            if (data.unreadCount > 0) {
                badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) { console.error('Notif count error:', e); }
}

async function loadNotifications() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const container = document.getElementById('notificationsList');
        if (!data.notifications.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No notifications yet</p></div>';
            return;
        }

        container.innerHTML = data.notifications.map(n => {
            const iconMap = {
                'h2h_challenge': 'fas fa-people-arrows',
                'h2h_accepted': 'fas fa-check-circle',
                'badge': 'fas fa-medal',
                'result': 'fas fa-futbol',
                'deadline': 'fas fa-clock'
            };
            const icon = iconMap[n.type] || 'fas fa-bell';
            const timeAgo = getTimeAgo(new Date(n.created_at));
            return `
                <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotifRead(${n.id})">
                    <div class="notif-icon"><i class="${icon}"></i></div>
                    <div class="notif-body">
                        <div class="notif-title">${n.title}</div>
                        <div class="notif-message">${n.message}</div>
                        <div class="notif-time">${timeAgo}</div>
                    </div>
                    ${!n.is_read ? '<div class="notif-dot"></div>' : ''}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load notifications:', e);
    }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

async function markNotifRead(id) {
    try {
        const token = localStorage.getItem('token');
        await fetch(`/api/notifications/${id}/read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        loadNotifications();
        loadNotificationCount();
    } catch (e) {}
}

async function markAllNotificationsRead() {
    try {
        const token = localStorage.getItem('token');
        await fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        showSuccess('All notifications marked as read');
        loadNotifications();
        loadNotificationCount();
    } catch (e) { showError('Failed to mark notifications'); }
}

// Poll notification count every 30 seconds
setInterval(() => {
    if (currentUser) loadNotificationCount();
}, 30000);

// ===== PWA SERVICE WORKER REGISTRATION + PUSH NOTIFICATIONS =====

let swRegistration = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => {
                console.log('Service Worker registered:', reg.scope);
                swRegistration = reg;
            })
            .catch(err => console.log('Service Worker registration failed:', err));
    });
    
    // Listen for messages from service worker (e.g., play sound)
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PLAY_SOUND' && event.data.sound === 'football') {
            playFootballWhistle();
        }
    });
}

// matchStarting socket listener is registered in setupSocketListeners()

// Persistent AudioContext for notification sounds (mobile requires user gesture to unlock)
let _audioCtx = null;
function getAudioContext() {
    if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') {
        _audioCtx.resume();
    }
    return _audioCtx;
}

// Unlock AudioContext on first user interaction (required for iOS/Android)
['click', 'touchstart', 'keydown'].forEach(evt => {
    document.addEventListener(evt, function unlockAudio() {
        getAudioContext();
        document.removeEventListener(evt, unlockAudio);
    }, { once: true });
});

// Generate a referee whistle sound using Web Audio API (no external file needed)
function playFootballWhistle() {
    try {
        const ctx = getAudioContext();
        // Three short whistle tones (like a referee whistle)
        const tones = [
            { freq: 3200, start: 0, dur: 0.15 },
            { freq: 3400, start: 0.2, dur: 0.15 },
            { freq: 3600, start: 0.4, dur: 0.3 }
        ];
        tones.forEach(t => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = t.freq;
            gain.gain.setValueAtTime(0.3, ctx.currentTime + t.start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t.start + t.dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + t.start);
            osc.stop(ctx.currentTime + t.start + t.dur + 0.05);
        });
    } catch (e) {
        console.log('Could not play notification sound:', e);
    }
}

// Ask for push notification permission and subscribe
async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return;
    }

    try {
        // Get VAPID public key from server
        const vapidResponse = await fetch('/api/push/vapid-public-key');
        if (!vapidResponse.ok) return;
        const { publicKey } = await vapidResponse.json();

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission denied');
            return;
        }

        // Wait for SW registration
        const registration = swRegistration || await navigator.serviceWorker.ready;

        // Check existing subscription
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Convert VAPID key from base64
            const applicationServerKey = urlBase64ToUint8Array(publicKey);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });
        }

        // Send subscription to server
        const token = localStorage.getItem('token');
        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ subscription })
        });

        console.log('Push notifications enabled');
    } catch (error) {
        console.error('Push subscription failed:', error);
    }
}

// Convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Test push notification
async function testPushNotification() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/push/test', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        showSuccess(data.message || 'Test notification sent!');
    } catch (e) {
        showError('Failed to send test notification');
    }
}

// ===== PWA INSTALL PROMPT =====

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show install banner if not dismissed before
    if (!localStorage.getItem('installBannerDismissed')) {
        const banner = document.getElementById('installBanner');
        if (banner) banner.style.display = 'block';
    }
});

function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            showSuccess('App installed! Check your home screen.');
        }
        deferredPrompt = null;
        document.getElementById('installBanner').style.display = 'none';
    });
}

function dismissInstallBanner() {
    document.getElementById('installBanner').style.display = 'none';
    localStorage.setItem('installBannerDismissed', 'true');
}

// Show banner on iOS Safari (no beforeinstallprompt)
window.addEventListener('load', () => {
    const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIOS && !isInStandalone && !localStorage.getItem('installBannerDismissed')) {
        const banner = document.getElementById('installBanner');
        if (banner) {
            const installText = banner.querySelector('.install-text span');
            if (installText) installText.textContent = 'Tap Share then "Add to Home Screen" for the best experience!';
            const installBtn = document.getElementById('installBtn');
            if (installBtn) installBtn.style.display = 'none';
            banner.style.display = 'block';
        }
    }
});

// ===== GAMEWEEK PILLS SELECTOR =====

function renderGameweekPills(gameweekStatuses) {
    const container = document.getElementById('gameweekPills');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= 38; i++) {
        const pill = document.createElement('button');
        pill.className = 'gw-pill';
        pill.textContent = `GW${i}`;
        pill.dataset.gw = i;

        if (i === currentGameweek) pill.classList.add('active');

        // Add status class if we have status info
        if (gameweekStatuses && gameweekStatuses[i]) {
            pill.classList.add(gameweekStatuses[i]);
        }

        pill.onclick = () => selectGameweekPill(i);
        container.appendChild(pill);
    }

    // Auto-scroll to current gameweek
    setTimeout(() => scrollToActivePill(), 100);
}

function selectGameweekPill(gw) {
    currentGameweek = gw;

    // Update pill active states
    document.querySelectorAll('.gw-pill').forEach(p => p.classList.remove('active'));
    const activePill = document.querySelector(`.gw-pill[data-gw="${gw}"]`);
    if (activePill) activePill.classList.add('active');

    // Update header display
    const gwDisplay = document.getElementById('currentGameweek');
    if (gwDisplay) gwDisplay.textContent = gw;

    // Also sync hidden select
    const selector = document.getElementById('gameweekSelector');
    if (selector) selector.value = gw;

    loadMatches();
}

function scrollGameweeks(direction) {
    const container = document.getElementById('gameweekPills');
    if (!container) return;
    container.scrollBy({ left: direction * 200, behavior: 'smooth' });
}

function scrollToActivePill() {
    const container = document.getElementById('gameweekPills');
    const activePill = container ? container.querySelector('.gw-pill.active') : null;
    if (activePill && container) {
        const pillLeft = activePill.offsetLeft;
        const containerWidth = container.offsetWidth;
        container.scrollTo({
            left: pillLeft - containerWidth / 2 + activePill.offsetWidth / 2,
            behavior: 'smooth'
        });
    }
}

// Pills rendering is now handled inside loadGameweeks directly

// ===== PASSWORD VALIDATION =====

function checkPasswordStrength() {
    const password = document.getElementById('registerPassword').value;
    const strengthBar = document.getElementById('strengthBar');

    const rules = {
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    // Update rule indicators
    document.getElementById('ruleLength').classList.toggle('pass', rules.length);
    document.getElementById('ruleUpper').classList.toggle('pass', rules.upper);
    document.getElementById('ruleLower').classList.toggle('pass', rules.lower);
    document.getElementById('ruleNumber').classList.toggle('pass', rules.number);
    document.getElementById('ruleSpecial').classList.toggle('pass', rules.special);

    // Calculate strength (0-5)
    const score = Object.values(rules).filter(Boolean).length;

    // Update strength bar
    const widths = [0, 20, 40, 60, 80, 100];
    const colors = ['#ff4444', '#ff6b35', '#ffa500', '#9acd32', '#00b894'];
    strengthBar.style.width = widths[score] + '%';
    strengthBar.style.background = colors[Math.max(0, score - 1)] || '#ff4444';

    // Also check confirm password match
    checkPasswordMatch();

    return score;
}

function checkPasswordMatch() {
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirmPassword').value;
    const matchDiv = document.getElementById('passwordMatch');

    if (!confirm) {
        matchDiv.textContent = '';
        matchDiv.className = 'password-match';
        return false;
    }

    if (password === confirm) {
        matchDiv.textContent = 'Passwords match';
        matchDiv.className = 'password-match match';
        return true;
    } else {
        matchDiv.textContent = 'Passwords do not match';
        matchDiv.className = 'password-match no-match';
        return false;
    }
}

function validateRegistrationPassword() {
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirmPassword').value;

    if (password.length < 8) {
        showError('Password must be at least 8 characters long');
        return false;
    }
    if (!/[A-Z]/.test(password)) {
        showError('Password must contain at least one uppercase letter');
        return false;
    }
    if (!/[a-z]/.test(password)) {
        showError('Password must contain at least one lowercase letter');
        return false;
    }
    if (!/[0-9]/.test(password)) {
        showError('Password must contain at least one number');
        return false;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        showError('Password must contain at least one special character');
        return false;
    }
    if (password !== confirm) {
        showError('Passwords do not match');
        return false;
    }
    return true;
}

// ===== PRO SUBSCRIPTION =====

async function loadProStatus() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const response = await fetch('/api/subscription/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const statusDiv = document.getElementById('proStatus');
        const subscribeBtn = document.getElementById('proSubscribeBtn');

        if (data.isPro) {
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <div class="pro-active-badge">
                        <i class="fas fa-crown"></i> PRO ACTIVE
                    </div>
                    <p style="color: rgba(255,255,255,0.6); margin-top: 0.5rem; font-size: 0.85rem;">
                        Active since ${new Date(data.subscribedAt).toLocaleDateString()}
                        ${data.expiresAt ? ' - Renews ' + new Date(data.expiresAt).toLocaleDateString() : ''}
                    </p>`;
            }
            if (subscribeBtn) {
                subscribeBtn.textContent = 'Manage Subscription';
                subscribeBtn.onclick = () => manageSubscription();
            }

            // Add pro badge to username
            const usernameDisplay = document.getElementById('usernameDisplay');
            if (usernameDisplay && !usernameDisplay.querySelector('.pro-badge-inline')) {
                usernameDisplay.innerHTML += ' <span class="pro-badge-inline"><i class="fas fa-crown"></i> PRO</span>';
            }
        }

        return data.isPro;
    } catch (e) {
        console.error('Failed to load pro status:', e);
        return false;
    }
}

async function subscribeToPro() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/subscription/create-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.url) {
            // Redirect to Stripe Checkout
            window.location.href = data.url;
        } else if (data.message) {
            // Demo mode - simulate subscription
            showSuccess(data.message);
            loadProStatus();
        } else {
            showError(data.error || 'Failed to start checkout');
        }
    } catch (e) {
        showError('Failed to start subscription process');
    }
}

async function manageSubscription() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/subscription/manage', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.url) {
            window.location.href = data.url;
        } else {
            showSuccess(data.message || 'Subscription management is available in your Stripe dashboard');
        }
    } catch (e) {
        showError('Failed to open subscription management');
    }
}

// Update showSection to handle pro section
const __prevShowSection = showSection;
showSection = function(sectionName) {
    __prevShowSection(sectionName);
    if (sectionName === 'pro') {
        loadProStatus();
    }
}

// Update showMainApp to load pro status and subscribe to push
const __prevShowMainApp = showMainApp;
showMainApp = function() {
    __prevShowMainApp();
    loadProStatus();
    // Subscribe to push notifications after login (non-blocking)
    if (typeof subscribeToPushNotifications === 'function') {
        setTimeout(() => subscribeToPushNotifications(), 2000);
    }
}
