// Global variables
let currentUser = null;
let currentGameweek = 1;
let socket = null;
let userPredictions = {};
let userDoublerMatchId = null;
let gameweekDeadline = null;
let canPredict = true;

// Cache DOM elements for better performance
const domCache = {};

// Premier League team logos mapping (using reliable CDN)
const teamLogos = {
    'Arsenal': 'https://resources.premierleague.com/premierleague/badges/50/t3.png',
    'Aston Villa': 'https://resources.premierleague.com/premierleague/badges/50/t7.png',
    'Bournemouth': 'https://resources.premierleague.com/premierleague/badges/50/t91.png',
    'Brentford': 'https://resources.premierleague.com/premierleague/badges/50/t94.png',
    'Brighton': 'https://resources.premierleague.com/premierleague/badges/50/t36.png',
    'Chelsea': 'https://resources.premierleague.com/premierleague/badges/50/t8.png',
    'Crystal Palace': 'https://resources.premierleague.com/premierleague/badges/50/t31.png',
    'Everton': 'https://resources.premierleague.com/premierleague/badges/50/t11.png',
    'Fulham': 'https://resources.premierleague.com/premierleague/badges/50/t54.png',
    'Ipswich Town': 'https://resources.premierleague.com/premierleague/badges/50/t40.png',
    'Leicester City': 'https://resources.premierleague.com/premierleague/badges/50/t13.png',
    'Liverpool': 'https://resources.premierleague.com/premierleague/badges/50/t14.png',
    'Manchester City': 'https://resources.premierleague.com/premierleague/badges/50/t43.png',
    'Manchester United': 'https://resources.premierleague.com/premierleague/badges/50/t1.png',
    'Newcastle United': 'https://resources.premierleague.com/premierleague/badges/50/t4.png',
    'Nottingham Forest': 'https://resources.premierleague.com/premierleague/badges/50/t17.png',
    'Southampton': 'https://resources.premierleague.com/premierleague/badges/50/t20.png',
    'Tottenham': 'https://resources.premierleague.com/premierleague/badges/50/t6.png',
    'West Ham': 'https://resources.premierleague.com/premierleague/badges/50/t21.png',
    'Wolverhampton': 'https://resources.premierleague.com/premierleague/badges/50/t39.png'
};

// Function to get team logo
function getTeamLogo(teamName) {
    return teamLogos[teamName] || 'https://via.placeholder.com/30x30?text=FC';
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
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
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            currentUser = data.user;
            showMainApp();
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Login failed. Please try again.');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userData', JSON.stringify(data.user));
            currentUser = data.user;
            showMainApp();
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Registration failed. Please try again.');
    }
}

function showMainApp() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('usernameDisplay').textContent = currentUser.username;
    document.getElementById('userScore').textContent = currentUser.score;
    
    // Initialize socket connection
    socket = io();
    setupSocketListeners();
    
    // Load initial data
    loadGameweeks();
    loadMatches();
    loadLeaderboard();
    loadMyPredictions();
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    currentUser = null;
    
    if (socket) {
        socket.disconnect();
    }
    
    document.getElementById('authSection').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    
    // Clear forms
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
}

// Navigation functions
function showSection(sectionName) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));
    
    document.getElementById(sectionName + 'Section').classList.add('active');
    
    // Load data for the section
    switch(sectionName) {
        case 'matches':
            loadMatches();
            break;
        case 'predictions':
            loadMyPredictions();
            break;
        case 'leaderboard':
            loadLeaderboard();
            break;
    }
}

function toggleMenu() {
    const navMenu = document.getElementById('navMenu');
    navMenu.classList.toggle('active');
}

// Data loading functions
async function loadGameweeks() {
    try {
        const response = await fetch('/api/gameweeks');
        const gameweeks = await response.json();
        
        const selector = document.getElementById('gameweekSelector');
        selector.innerHTML = '';
        
        gameweeks.forEach(gw => {
            const option = document.createElement('option');
            option.value = gw.gameweek;
            option.textContent = `GW ${gw.gameweek} (${gw.status})`;
            if (gw.gameweek === currentGameweek) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
        
        // Set current gameweek to first upcoming if not set
        if (!currentGameweek) {
            const upcomingGW = gameweeks.find(gw => gw.status === 'upcoming');
            if (upcomingGW) {
                currentGameweek = upcomingGW.gameweek;
                selector.value = currentGameweek;
            }
        }
    } catch (error) {
        console.error('Failed to load gameweeks:', error);
    }
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
        
        // Load user's doubler for this gameweek
        await loadUserDoubler(currentGameweek);
        
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
function createMatchCard(match) {
    const card = document.createElement('div');
    const isDoubler = userDoublerMatchId === match.id;
    const deadlinePassed = !canPredict;
    
    card.className = `match-card ${isDoubler ? 'doubler' : ''} ${deadlinePassed ? 'deadline-passed' : ''}`;
    
    const statusClass = `status-${match.status}`;
    const matchDate = new Date(match.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Check if user has existing prediction (need to fetch from server)
    // This will be populated when we load user predictions
    const predictionText = '';
    
    card.innerHTML = `
        <div class="match-header">
            <div class="match-date">${matchDate}</div>
            <div class="match-status ${statusClass}">${match.status.toUpperCase()}</div>
        </div>
        <div class="match-teams">
            <div class="team">${match.homeTeam}</div>
            <div class="vs">VS</div>
            <div class="team">${match.awayTeam}</div>
        </div>
        ${predictionText}
        ${match.status === 'upcoming' && canPredict ? `
            <div class="match-actions">
                <button class="btn btn-primary" onclick="openPredictionModal(${match.id}, '${match.homeTeam}', '${match.awayTeam}', '${match.date}', ${match.gameweek})">
                    <i class="fas fa-crystal-ball"></i> ${userPrediction ? 'Edit Prediction' : 'Predict'}
                </button>
            </div>
        ` : ''}
        ${match.status === 'upcoming' && !canPredict ? `
            <div class="match-actions">
                <button class="btn btn-secondary" disabled>
                    <i class="fas fa-lock"></i> Deadline Passed
                </button>
            </div>
        ` : ''}
        ${match.status === 'finished' ? `
            <div class="final-score">
                Final: ${match.homeScore} - ${match.awayScore}
            </div>
        ` : ''}
    `;
    
    return card;
}

function createLeaderboardItem(player, rank) {
    const item = document.createElement('div');
    item.className = `leaderboard-item ${rank <= 3 ? 'top-3' : ''}`;
    
    let rankClass = '';
    if (rank === 1) rankClass = 'gold';
    else if (rank === 2) rankClass = 'silver';
    else if (rank === 3) rankClass = 'bronze';
    
    item.innerHTML = `
        <div class="player-info">
            <div class="player-rank ${rankClass}">${rank}</div>
            <div class="player-name">${player.username}</div>
        </div>
        <div class="player-score">${player.score} pts</div>
    `;
    
    return item;
}

function createPredictionCard(prediction) {
    const card = document.createElement('div');
    card.className = `prediction-card ${prediction.isDoubler ? 'doubler' : ''}`;
    
    const doublerText = prediction.isDoubler ? ' (DOUBLER)' : '';
    const maxPoints = prediction.isDoubler ? '8' : '4';
    
    card.innerHTML = `
        <div class="prediction-match">
            <div>Match #${prediction.matchId}${doublerText}</div>
            <div class="prediction-points">+${prediction.points}/${maxPoints} pts</div>
        </div>
        <div class="prediction-score">
            Your prediction: ${prediction.homeScore} - ${prediction.awayScore}
        </div>
        <div class="prediction-gameweek">
            Gameweek ${prediction.gameweek || 1}
        </div>
    `;
    
    return card;
}

// Modal functions
function openPredictionModal(matchId, homeTeam, awayTeam, matchDate, gameweek) {
    currentMatchId = matchId;
    
    // Check if deadline has passed
    const deadlineWarning = document.getElementById('modalDeadlineWarning');
    const predictionForm = document.getElementById('predictionForm');
    
    if (!canPredict) {
        deadlineWarning.style.display = 'flex';
        predictionForm.style.display = 'none';
    } else {
        deadlineWarning.style.display = 'none';
        predictionForm.style.display = 'block';
    }
    
    document.getElementById('modalHomeTeam').textContent = homeTeam;
    document.getElementById('modalAwayTeam').textContent = awayTeam;
    document.getElementById('homeTeamLabel').textContent = homeTeam;
    document.getElementById('awayTeamLabel').textContent = awayTeam;
    
    const date = new Date(matchDate).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('modalMatchDate').textContent = date;
    
    // Load existing prediction if any (fetch from server)
    loadExistingPrediction(matchId);
    
    // Reset form initially
    document.getElementById('homeScore').value = '';
    document.getElementById('awayScore').value = '';
    document.getElementById('doublerCheckbox').checked = userDoublerMatchId === matchId;
    
    document.getElementById('predictionModal').style.display = 'block';
}

function closePredictionModal() {
    document.getElementById('predictionModal').style.display = 'none';
    document.getElementById('predictionForm').reset();
    document.getElementById('doublerCheckbox').checked = false;
    currentMatchId = null;
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
        } else {
            showError(data.error);
        }
    } catch (error) {
        showError('Failed to save prediction');
    }
}

// Utility functions
function showError(message) {
    // Simple alert for now - you can enhance this with a better notification system
    alert('Error: ' + message);
}

function showSuccess(message) {
    // Simple alert for now - you can enhance this with a better notification system
    alert('Success: ' + message);
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
    card.className = 'match-card';
    
    // Check if user has predicted this match
    const userPrediction = userPredictions[match.id];
    
    let predictionText = '';
    if (userPrediction) {
        predictionText = `
            <div class="user-prediction">
                <span class="prediction-label">Your prediction:</span>
                <span class="prediction-score">${userPrediction.homeScore} - ${userPrediction.awayScore}</span>
                ${userPrediction.isDoubler ? '<span class="doubler-badge">DOUBLER</span>' : ''}
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
                <img src="${getTeamLogo(match.homeTeam)}" alt="${match.homeTeam}" class="team-logo">
                <span class="team-name">${match.homeTeam}</span>
            </div>
            <div class="vs">VS</div>
            <div class="team away-team">
                <img src="${getTeamLogo(match.awayTeam)}" alt="${match.awayTeam}" class="team-logo">
                <span class="team-name">${match.awayTeam}</span>
            </div>
        </div>
        ${predictionText}
        ${match.status === 'upcoming' && canPredict ? `
            <div class="match-actions">
                <button class="btn btn-primary" onclick="openPredictionModal(${match.id}, '${match.homeTeam}', '${match.awayTeam}', '${match.date}', ${match.gameweek})">
                    <i class="fas fa-crystal-ball"></i> ${userPrediction ? 'Edit Prediction' : 'Predict'}
                </button>
            </div>
        ` : ''}
        ${match.status === 'upcoming' && !canPredict ? `
            <div class="match-actions">
                <button class="btn btn-secondary" disabled>
                    <i class="fas fa-lock"></i> Deadline Passed
                </button>
            </div>
        ` : ''}
        ${match.status === 'finished' ? `
            <div class="final-score">
                Final: ${match.homeScore} - ${match.awayScore}
            </div>
        ` : ''}
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
    document.getElementById('modalHomeTeam').textContent = homeTeam;
    document.getElementById('modalAwayTeam').textContent = awayTeam;
    document.getElementById('modalMatchDate').textContent = new Date(matchDate).toLocaleDateString();
    
    // Store match info for submission
    window.currentMatchId = matchId;
    window.currentGameweek = gameweek;
    
    // Reset form
    document.getElementById('homeScore').value = '';
    document.getElementById('awayScore').value = '';
    document.getElementById('doublerCheckbox').checked = false;
    
    // Load existing prediction if any
    loadExistingPrediction(matchId);
    
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

// Load gameweeks into selector
async function loadGameweeks() {
    try {
        const selector = domCache.gameweekSelector || document.getElementById('gameweekSelector');
        if (!selector) return;
        
        // Clear existing options
        selector.innerHTML = '';
        
        // Add gameweeks 1-38
        for (let i = 1; i <= 38; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Gameweek ${i}`;
            if (i === currentGameweek) {
                option.selected = true;
            }
            selector.appendChild(option);
        }
    } catch (error) {
        console.error('Failed to load gameweeks:', error);
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('predictionModal');
    if (event.target === modal) {
        closePredictionModal();
    }
}
