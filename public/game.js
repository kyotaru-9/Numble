/* ========================================
    NEO-BRUTALIST GAME LOGIC
    Numble - Number Guessing Game - Client Script
    ======================================== */

// Game state
let socket = null;
let gameId = null;
let playerNumber = null;
let myNumber = null;
let isMyTurn = false;
let numberTracker = {
  available: [],
  eliminated: [],
  myGuesses: []
};

// DOM Elements - Screens
const screens = {
  start: document.getElementById('startScreen'),
  waiting: document.getElementById('waitingScreen'),
  selection: document.getElementById('selectionScreen'),
  waitingOpponent: document.getElementById('waitingOpponentScreen'),
  game: document.getElementById('gameScreen'),
  gameOver: document.getElementById('gameOverScreen'),
  disconnect: document.getElementById('disconnectScreen'),
  lobbyCreated: document.getElementById('lobbyCreatedScreen')
};

// DOM Elements - Interactive elements
const elements = {
  startBtn: document.getElementById('startBtn'),
  numberInput: document.getElementById('numberInput'),
  submitNumberBtn: document.getElementById('submitNumberBtn'),
  selectionError: document.getElementById('selectionError'),
  myNumberDisplay: document.getElementById('myNumberDisplay'),
  playerNumberDisplay: document.getElementById('playerNumberDisplay'),
  turnIndicator: document.getElementById('turnIndicator'),
  guessInput: document.getElementById('guessInput'),
  submitGuessBtn: document.getElementById('submitGuessBtn'),
  guessError: document.getElementById('guessError'),
  guessInputSection: document.getElementById('guessInputSection'),
  waitingMessage: document.getElementById('waitingMessage'),
  guessHistory: document.getElementById('guessHistory'),
  gameOverTitle: document.getElementById('gameOverTitle'),
  gameOverMessage: document.getElementById('gameOverMessage'),
  winnerEmoji: document.getElementById('winnerEmoji'),
  revealMyNumber: document.getElementById('revealMyNumber'),
  revealOpponentNumber: document.getElementById('revealOpponentNumber'),
  playAgainBtn: document.getElementById('playAgainBtn'),
  newGameBtn: document.getElementById('newGameBtn'),
  findNewOpponentBtn: document.getElementById('findNewOpponentBtn'),
  turnFooter: document.getElementById('turnFooter'),
  footerGuessInput: document.getElementById('footerGuessInput'),
  footerGuessBtn: document.getElementById('footerGuessBtn'),
  numberGrid: document.getElementById('numberGrid'),
  toggleTrackerBtn: document.getElementById('toggleTrackerBtn'),
  turnOverlay: document.getElementById('turnOverlay'),
  turnOverlayIcon: document.getElementById('turnOverlayIcon'),
  turnOverlayTitle: document.getElementById('turnOverlayTitle'),
  turnOverlayMessage: document.getElementById('turnOverlayMessage'),
  turnOverlayBtn: document.getElementById('turnOverlayBtn'),
  // Lobby elements
  lobbyCodeInput: document.getElementById('lobbyCodeInput'),
  joinLobbyBtn: document.getElementById('joinLobbyBtn'),
  createLobbyBtn: document.getElementById('createLobbyBtn'),
  cancelLobbyBtn: document.getElementById('cancelLobbyBtn'),
  lobbyError: document.getElementById('lobbyError'),
  lobbyCodeDisplay: document.getElementById('lobbyCodeDisplay')
};

// Lobby state
let currentLobbyCode = null;

/* ========================================
    INITIALIZATION
    ======================================== */
function init() {
  // Connect to Socket.IO
  socket = io();
  
  initNumberTracker();
  setupEventListeners();
  setupSocketListeners();

  // Focus management for accessibility
  elements.startBtn.focus();
}

/* ========================================
    NUMBER TRACKER
    ======================================== */
function initNumberTracker() {
  numberTracker = {
    available: [],
    eliminated: [],
    myGuesses: []
  };
  
  for (let i = 1; i <= 100; i++) {
    numberTracker.available.push(i);
  }
  
  elements.numberGrid.innerHTML = '';
  for (let i = 1; i <= 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'number-cell available';
    cell.textContent = i;
    cell.dataset.number = i;
    cell.addEventListener('click', () => selectFromTracker(i));
    elements.numberGrid.appendChild(cell);
  }
}

function selectFromTracker(num) {
  if (!isMyTurn) return;
  elements.footerGuessInput.value = num;
  elements.guessInput.value = num;
}

function updateNumberTracker(result, guess) {
  const cells = elements.numberGrid.querySelectorAll('.number-cell');
  
  if (result === 'higher') {
    for (let i = 1; i < guess; i++) {
      eliminateNumber(i);
    }
  } else if (result === 'lower') {
    for (let i = guess + 1; i <= 100; i++) {
      eliminateNumber(i);
    }
  }
  
  numberTracker.myGuesses.push(guess);
  const cell = elements.numberGrid.querySelector(`[data-number="${guess}"]`);
  if (cell) {
    cell.classList.remove('available');
    cell.classList.add('my-guess');
  }
}

function eliminateNumber(num) {
  if (numberTracker.eliminated.includes(num)) return;
  numberTracker.eliminated.push(num);
  const cell = elements.numberGrid.querySelector(`[data-number="${num}"]`);
  if (cell) {
    cell.classList.remove('available');
    cell.classList.add('eliminated');
  }
}

/* ========================================
   LOBBY FUNCTIONS
   ======================================== */
function joinLobby() {
  const code = elements.lobbyCodeInput.value.trim().toUpperCase();
  if (!code) {
    showError(elements.lobbyError, 'Please enter a lobby code');
    return;
  }
  if (code.length < 4) {
    showError(elements.lobbyError, 'Invalid lobby code');
    return;
  }
  addButtonPressEffect(elements.joinLobbyBtn);
  socket.emit('joinLobby', { lobbyCode: code });
}

/* ========================================
   EVENT LISTENERS
   ======================================== */
function setupEventListeners() {
  // Start button - Find opponent
  elements.startBtn.addEventListener('click', () => {
    addButtonPressEffect(elements.startBtn);
    socket.emit('joinGame');
    showScreen('waiting');
  });

  // Create lobby button
  elements.createLobbyBtn.addEventListener('click', () => {
    addButtonPressEffect(elements.createLobbyBtn);
    socket.emit('createLobby');
  });

  // Join lobby button
  elements.joinLobbyBtn.addEventListener('click', joinLobby);
  elements.lobbyCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinLobby();
  });

  // Cancel lobby button
  elements.cancelLobbyBtn.addEventListener('click', () => {
    addButtonPressEffect(elements.cancelLobbyBtn);
    if (currentLobbyCode) {
      socket.emit('cancelLobby', { lobbyCode: currentLobbyCode });
      currentLobbyCode = null;
    }
    showScreen('start');
  });

  // Number selection
  elements.submitNumberBtn.addEventListener('click', submitNumber);
  elements.numberInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitNumber();
  });

  // Guess submission
  elements.submitGuessBtn.addEventListener('click', submitGuess);
  elements.guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitGuess();
  });

  // Play again
  elements.playAgainBtn.addEventListener('click', () => {
    addButtonPressEffect(elements.playAgainBtn);
    socket.emit('playAgain', { gameId });
    resetGameUI();
    showScreen('selection');
  });

  // New game / Find new opponent
  elements.newGameBtn.addEventListener('click', () => {
    addButtonPressEffect(elements.newGameBtn);
    location.reload();
  });

  elements.findNewOpponentBtn.addEventListener('click', () => {
    addButtonPressEffect(elements.findNewOpponentBtn);
    location.reload();
  });
  
  // Add hover sound effects simulation (visual feedback)
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px)';
    });
    btn.addEventListener('mouseleave', () => {
      if (!btn.matches(':active')) {
        btn.style.transform = '';
      }
    });
  });

  // Footer guess input
  elements.footerGuessBtn.addEventListener('click', submitFooterGuess);
  elements.footerGuessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitFooterGuess();
  });

  // Number tracker
  elements.toggleTrackerBtn.addEventListener('click', () => {
    const grid = elements.numberGrid;
    if (grid.style.display === 'none') {
      grid.style.display = 'grid';
      elements.toggleTrackerBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="1rem" height="1rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    } else {
      grid.style.display = 'none';
      elements.toggleTrackerBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="1rem" height="1rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    }
  });
}

/* ========================================
   SOCKET.IO EVENT HANDLERS
   ======================================== */
function setupSocketListeners() {
  // Waiting for opponent
  socket.on('waiting', (data) => {
    console.log(data.message);
  });

  // Lobby created
  socket.on('lobbyCreated', (data) => {
    currentLobbyCode = data.lobbyCode;
    elements.lobbyCodeDisplay.textContent = data.lobbyCode;
    hideError(elements.lobbyError);
    showScreen('lobbyCreated');
  });

  // Lobby error
  socket.on('lobbyError', (data) => {
    showError(elements.lobbyError, data.message);
  });

  // Game started
  socket.on('gameStarted', (data) => {
    gameId = data.gameId;
    playerNumber = data.playerNumber;
    showScreen('selection');
    hideError(elements.selectionError);
    elements.numberInput.value = '';
    
    // Focus with slight delay for animation
    setTimeout(() => elements.numberInput.focus(), 300);
  });

  // Number confirmed
  socket.on('numberConfirmed', (data) => {
    myNumber = data.yourNumber;
    elements.myNumberDisplay.textContent = myNumber;
    elements.playerNumberDisplay.textContent = myNumber;
    showScreen('waitingOpponent');
  });

  // Both players ready - Game starts
  socket.on('bothReady', (data) => {
    console.log(data.message);
    showScreen('game');
    showTurnOverlay('gamepad-2', 'GAME ON!', 'Let the guessing begin', true);
    setTimeout(() => elements.guessInput.focus(), 300);
  });

  // Your turn
  socket.on('yourTurn', (data) => {
    isMyTurn = true;
    showTurnOverlay('flame', 'YOUR TURN!', 'Guess your opponent\'s number');
    updateTurnIndicator('your-turn', 'YOUR TURN!', 'flame');
    showTurnFooter(true);
    
    elements.guessInputSection.classList.remove('hidden');
    elements.waitingMessage.classList.add('hidden');
    hideError(elements.guessError);
    elements.guessInput.value = '';
    
    // Focus the input
    setTimeout(() => elements.guessInput.focus(), 100);
    
    // Add attention animation to guess panel
    const guessPanel = document.querySelector('.guess-panel');
    guessPanel.style.animation = 'pulse-border 0.5s ease-in-out 3';
    setTimeout(() => {
      guessPanel.style.animation = '';
    }, 1500);
    
    // Also sync footer input
    elements.footerGuessInput.value = '';
  });

  // Opponent's turn
  socket.on('opponentTurn', (data) => {
    isMyTurn = false;
    updateTurnIndicator('waiting', 'OPPONENT TURN', 'hourglass');
    showTurnFooter(false);
    
    elements.guessInputSection.classList.add('hidden');
    elements.waitingMessage.classList.remove('hidden');
    hideError(elements.guessError);
  });

  // Guess result received
  socket.on('guessResult', (data) => {
    addGuessToHistory(data);
    if (data.player === playerNumber) {
      updateNumberTracker(data.result, data.guess);
    } else {
      // Opponent just guessed - show what they guessed
      let resultText = '';
      if (data.result === 'higher') resultText = 'too LOW (↑)';
      else if (data.result === 'lower') resultText = 'too HIGH (↓)';
      else if (data.result === 'correct') resultText = 'CORRECT!';
      
      showTurnOverlay('🎯', `OPPONENT GUESSED ${data.guess}`, `Their guess was ${resultText}`, true);
    }
  });

  // Game over
  socket.on('gameOver', (data) => {
    showScreen('gameOver');
    showTurnFooter(false);
    
    if (data.winner) {
      elements.winnerEmoji.textContent = '🏆';
      elements.gameOverTitle.textContent = 'YOU WON!';
      // Add victory animation
      document.querySelector('.game-over-card').style.animation = 'bounce 0.5s ease 3';
    } else {
      elements.winnerEmoji.textContent = '😔';
      elements.gameOverTitle.textContent = 'YOU LOST';
    }
    
    elements.gameOverMessage.textContent = data.message;
    elements.revealMyNumber.textContent = data.yourNumber;
    elements.revealOpponentNumber.textContent = data.opponentNumber;
  });

  // Game reset (play again)
  socket.on('gameReset', (data) => {
    resetGameUI();
    showScreen('selection');
    hideError(elements.selectionError);
    elements.numberInput.value = '';
    setTimeout(() => elements.numberInput.focus(), 300);
  });

  // Opponent disconnected
  socket.on('opponentDisconnected', (data) => {
    showScreen('disconnect');
    showTurnFooter(false);
  });

  // Error messages
  socket.on('error', (data) => {
    if (isSelectionScreenVisible()) {
      showError(elements.selectionError, data.message);
    } else {
      showError(elements.guessError, data.message);
    }
  });
}

/* ========================================
   GAME ACTIONS
   ======================================== */
function submitNumber() {
  const number = parseInt(elements.numberInput.value);
  
  if (isNaN(number) || number < 1 || number > 100) {
    showError(elements.selectionError, 'Enter a number between 1-100!');
    shakeElement(elements.numberInput);
    return;
  }
  
  // Visual feedback
  addButtonPressEffect(elements.submitNumberBtn);
  socket.emit('chooseNumber', { gameId, number });
}

function submitGuess() {
  if (!isMyTurn) return;
  
  const guess = parseInt(elements.guessInput.value);
  
  if (isNaN(guess) || guess < 1 || guess > 100) {
    showError(elements.guessError, 'Enter a number between 1-100!');
    shakeElement(elements.guessInput);
    return;
  }
  
  // Visual feedback
  addButtonPressEffect(elements.submitGuessBtn);
  socket.emit('makeGuess', { gameId, guess });
}

function submitFooterGuess() {
  if (!isMyTurn) return;
  
  const guess = parseInt(elements.footerGuessInput.value);
  
  if (isNaN(guess) || guess < 1 || guess > 100) {
    shakeElement(elements.footerGuessInput);
    return;
  }
  
  addButtonPressEffect(elements.footerGuessBtn);
  socket.emit('makeGuess', { gameId, guess });
}

window.addEventListener('resize', () => {
  if (screens.game.classList.contains('active')) {
    showTurnFooter(isMyTurn);
  }
});

/* ========================================
   UI UPDATES
   ======================================== */
function updateTurnIndicator(status, text, iconName) {
  const indicator = elements.turnIndicator;
  indicator.className = 'status-box';
  
  if (status === 'your-turn') {
    indicator.classList.add('status-your-turn');
  } else if (status === 'winner') {
    indicator.classList.add('status-winner');
  } else {
    indicator.classList.add('status-waiting');
  }
  
  const icons = {
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    hourglass: '<path d="M5 22v-5l9-7-9-7V2"/>',
    'gamepad-2': '<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'
  };

  const iconPath = icons[iconName] || icons.hourglass;

  indicator.innerHTML = `<span><svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline">${iconPath}</svg> ${text}</span>`;
}

function showTurnFooter(show) {
  const isMobile = window.innerWidth <= 640;
  if (!isMobile) return;
  
  if (show) {
    elements.turnFooter.classList.add('active');
    elements.footerGuessInput.value = '';
    setTimeout(() => elements.footerGuessInput.focus(), 100);
  } else {
    elements.turnFooter.classList.remove('active');
  }
}

function showTurnOverlay(iconName, title, message, autoDismiss = false) {
  const icons = {
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    'gamepad-2': '<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'
  };

  const iconPath = icons[iconName];
  if (iconPath) {
    elements.turnOverlayIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="4rem" height="4rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>`;
  }
  elements.turnOverlayTitle.textContent = title;
  elements.turnOverlayMessage.textContent = message;
  elements.turnOverlay.classList.add('active');
  
  if (autoDismiss) {
    setTimeout(() => {
      elements.turnOverlay.classList.remove('active');
    }, 2000);
  } else {
    elements.turnOverlayBtn.onclick = () => {
      elements.turnOverlay.classList.remove('active');
    };
  }
}

function addGuessToHistory(data) {
  // Remove empty message
  const emptyMessage = elements.guessHistory.querySelector('.empty-message');
  if (emptyMessage) {
    emptyMessage.remove();
  }
  
  // Create guess item
  const guessItem = document.createElement('div');
  const playerClass = data.player === 1 ? 'guess-item-player-1' : 'guess-item-player-2';
  const isCorrect = data.result === 'correct';
  
  guessItem.className = `guess-item ${playerClass}`;
  if (isCorrect) {
    guessItem.classList.add('guess-item-correct');
  }
  
  const isMyGuess = data.player === playerNumber;
  const playerLabel = isMyGuess ? 'YOU' : `P${data.player}`;
  
  let resultText = '';
  let resultClass = '';
  let resultIcon = '';
  
  switch (data.result) {
    case 'higher':
      resultText = 'HIGHER ↑';
      resultClass = 'guess-result-higher';
      resultIcon = '↑';
      break;
    case 'lower':
      resultText = 'LOWER ↓';
      resultClass = 'guess-result-lower';
      resultIcon = '↓';
      break;
    case 'correct':
      resultText = 'CORRECT!';
      resultClass = 'guess-result-correct';
      resultIcon = '✓';
      break;
  }
  
  guessItem.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span class="guess-player-label">${playerLabel}</span>
      <span class="guess-number">${data.guess}</span>
    </div>
    <span class="guess-result ${resultClass}">${resultText}</span>
  `;
  
  // Insert at top
  elements.guessHistory.insertBefore(guessItem, elements.guessHistory.firstChild);
  
  // Celebration effect for correct guess
  if (isCorrect) {
    guessItem.style.animation = 'bounce 0.5s ease 2';
  }
}

/* ========================================
   SCREEN MANAGEMENT
   ======================================== */
function showScreen(screenName) {
  // Hide all screens
  Object.values(screens).forEach(screen => {
    screen.classList.remove('active');
  });
  
  // Show requested screen
  if (screens[screenName]) {
    screens[screenName].classList.add('active');
  }
}

function isSelectionScreenVisible() {
  return screens.selection.classList.contains('active');
}

/* ========================================
   ERROR HANDLING
   ======================================== */
function showError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
  element.style.animation = 'shake 0.5s ease-in-out';
}

function hideError(element) {
  element.textContent = '';
  element.classList.add('hidden');
}

/* ========================================
   ANIMATION HELPERS
   ======================================== */
function addButtonPressEffect(button) {
  // The CSS :active state handles the visual press
  // This adds any additional effects
  button.style.transform = 'translate(4px, 4px)';
  button.style.boxShadow = 'none';
  
  setTimeout(() => {
    button.style.transform = '';
    button.style.boxShadow = '';
  }, 150);
}

function shakeElement(element) {
  element.style.animation = 'shake 0.5s ease-in-out';
  setTimeout(() => {
    element.style.animation = '';
  }, 500);
}

/* ========================================
    GAME RESET
    ======================================== */
function resetGameUI() {
  myNumber = null;
  isMyTurn = false;
  showTurnFooter(false);
  
  // Reset number tracker
  initNumberTracker();
  
  // Clear guess history
  elements.guessHistory.innerHTML = '<p class="empty-message">No guesses yet</p>';
  
  // Reset turn indicator
  updateTurnIndicator('waiting', 'WAITING', 'hourglass');
  
  // Clear inputs
  elements.guessInput.value = '';
  hideError(elements.guessError);
  hideError(elements.selectionError);
  
  // Reset animations
  document.querySelectorAll('.game-over-card, .guess-panel').forEach(el => {
    el.style.animation = '';
  });
}

/* ========================================
   KEYBOARD NAVIGATION
   ======================================== */
document.addEventListener('keydown', (e) => {
  // Allow Escape to reload (for disconnected state)
  if (e.key === 'Escape' && screens.disconnect.classList.contains('active')) {
    location.reload();
  }
});

/* ========================================
   START THE GAME
   ======================================== */
init();
