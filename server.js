const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const games = new Map();
const waitingPlayers = [];
const lobbies = new Map(); // lobbyCode -> { creatorSocketId, gameId, createdAt }

// Generate unique game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 10);
}

// Generate lobby code (6 character alphanumeric, uppercase)
function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters (I, O, 0, 1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Handle player joining
  socket.on('joinGame', () => {
    if (waitingPlayers.length > 0) {
      // Pair with waiting player
      const opponentSocketId = waitingPlayers.shift();
      const gameId = generateGameId();
      
      const game = {
        id: gameId,
        players: [
          { socketId: opponentSocketId, number: null, ready: false },
          { socketId: socket.id, number: null, ready: false }
        ],
        currentTurn: 0, // Index of player whose turn it is
        status: 'choosing', // 'choosing', 'playing', 'finished'
        guesses: [],
        winner: null
      };
      
      games.set(gameId, game);
      
      // Join both players to the game room
      const opponentSocket = io.sockets.sockets.get(opponentSocketId);
      if (opponentSocket) {
        opponentSocket.join(gameId);
        socket.join(gameId);
        
        // Notify both players
        io.to(opponentSocketId).emit('gameStarted', {
          gameId,
          playerNumber: 1,
          message: 'Game started! Choose your secret number (1-100).'
        });
        
        socket.emit('gameStarted', {
          gameId,
          playerNumber: 2,
          message: 'Game started! Choose your secret number (1-100).'
        });
      }
    } else {
      // Add to waiting list
      waitingPlayers.push(socket.id);
      socket.emit('waiting', { message: 'Waiting for an opponent...' });
    }
  });

  // Handle lobby creation
  socket.on('createLobby', () => {
    // Remove from waiting players if they were there
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    // Generate unique lobby code
    let lobbyCode;
    do {
      lobbyCode = generateLobbyCode();
    } while (lobbies.has(lobbyCode));

    // Create lobby
    lobbies.set(lobbyCode, {
      creatorSocketId: socket.id,
      gameId: null,
      createdAt: Date.now()
    });

    console.log(`Lobby created: ${lobbyCode} by ${socket.id}`);
    socket.emit('lobbyCreated', { lobbyCode });
  });

  // Handle lobby joining
  socket.on('joinLobby', ({ lobbyCode }) => {
    const normalizedCode = lobbyCode.toUpperCase().trim();
    const lobby = lobbies.get(normalizedCode);

    if (!lobby) {
      socket.emit('lobbyError', { message: 'Lobby not found. Check the code and try again.' });
      return;
    }

    if (lobby.creatorSocketId === socket.id) {
      socket.emit('lobbyError', { message: 'You cannot join your own lobby.' });
      return;
    }

    // Check if creator is still connected
    const creatorSocket = io.sockets.sockets.get(lobby.creatorSocketId);
    if (!creatorSocket) {
      lobbies.delete(normalizedCode);
      socket.emit('lobbyError', { message: 'Lobby expired. The creator disconnected.' });
      return;
    }

    // Create game for these two players
    const gameId = generateGameId();
    const game = {
      id: gameId,
      players: [
        { socketId: lobby.creatorSocketId, number: null, ready: false },
        { socketId: socket.id, number: null, ready: false }
      ],
      currentTurn: 0,
      status: 'choosing',
      guesses: [],
      winner: null
    };

    games.set(gameId, game);
    lobby.gameId = gameId;

    // Join both players to the game room
    creatorSocket.join(gameId);
    socket.join(gameId);

    // Notify both players
    io.to(lobby.creatorSocketId).emit('gameStarted', {
      gameId,
      playerNumber: 1,
      message: 'Opponent joined! Choose your secret number (1-100).'
    });

    socket.emit('gameStarted', {
      gameId,
      playerNumber: 2,
      message: 'Joined lobby! Choose your secret number (1-100).'
    });

    // Clean up the lobby
    lobbies.delete(normalizedCode);
    console.log(`Lobby ${normalizedCode} closed, game ${gameId} started`);
  });

  // Handle lobby cancellation
  socket.on('cancelLobby', ({ lobbyCode }) => {
    const lobby = lobbies.get(lobbyCode);
    if (lobby && lobby.creatorSocketId === socket.id) {
      lobbies.delete(lobbyCode);
      console.log(`Lobby cancelled: ${lobbyCode}`);
    }
  });

  // Handle number selection
  socket.on('chooseNumber', ({ gameId, number }) => {
    const game = games.get(gameId);
    if (!game) return;

    const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;

    // Validate number
    const num = parseInt(number);
    if (isNaN(num) || num < 1 || num > 100) {
      socket.emit('error', { message: 'Please choose a number between 1 and 100.' });
      return;
    }

    // Store player's number
    game.players[playerIndex].number = num;
    game.players[playerIndex].ready = true;

    socket.emit('numberConfirmed', { 
      message: 'Your number is set! Waiting for opponent...',
      yourNumber: num 
    });

    // Check if both players have chosen
    if (game.players[0].ready && game.players[1].ready) {
      game.status = 'playing';
      
      // Randomly decide who goes first
      game.currentTurn = Math.random() < 0.5 ? 0 : 1;
      
      const currentPlayerSocketId = game.players[game.currentTurn].socketId;
      const otherPlayerSocketId = game.players[1 - game.currentTurn].socketId;
      
      io.to(gameId).emit('bothReady', {
        message: 'Both players are ready! Let the guessing begin!'
      });
      
      io.to(currentPlayerSocketId).emit('yourTurn', {
        message: 'It\'s your turn! Guess your opponent\'s number (1-100).'
      });
      
      io.to(otherPlayerSocketId).emit('opponentTurn', {
        message: 'Waiting for opponent to guess...'
      });
    }
  });

  // Handle guess
  socket.on('makeGuess', ({ gameId, guess }) => {
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') return;

    const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;

    // Check if it's this player's turn
    if (game.currentTurn !== playerIndex) {
      socket.emit('error', { message: 'It\'s not your turn!' });
      return;
    }

    // Validate guess
    const guessNum = parseInt(guess);
    if (isNaN(guessNum) || guessNum < 1 || guessNum > 100) {
      socket.emit('error', { message: 'Please enter a number between 1 and 100.' });
      return;
    }

    const opponentIndex = 1 - playerIndex;
    const opponentNumber = game.players[opponentIndex].number;
    
    let result;
    let resultMessage;
    
    if (guessNum === opponentNumber) {
      result = 'correct';
      resultMessage = `Correct! The number was ${opponentNumber}.`;
      game.status = 'finished';
      game.winner = playerIndex;
    } else if (guessNum < opponentNumber) {
      result = 'higher';
      resultMessage = `Your guess ${guessNum} is too low. The number is HIGHER.`;
    } else {
      result = 'lower';
      resultMessage = `Your guess ${guessNum} is too high. The number is LOWER.`;
    }

    // Record the guess
    game.guesses.push({
      player: playerIndex + 1,
      guess: guessNum,
      result: result,
      timestamp: Date.now()
    });

    // Send result to both players
    io.to(gameId).emit('guessResult', {
      player: playerIndex + 1,
      guess: guessNum,
      result: result,
      message: resultMessage,
      guessCount: game.guesses.filter(g => g.player === playerIndex + 1).length
    });

    if (result === 'correct') {
      // Game over
      io.to(socket.id).emit('gameOver', {
        winner: true,
        message: 'Congratulations! You guessed the correct number!',
        opponentNumber: opponentNumber,
        yourNumber: game.players[playerIndex].number
      });
      
      const opponentSocketId = game.players[opponentIndex].socketId;
      io.to(opponentSocketId).emit('gameOver', {
        winner: false,
        message: `Game over! Player ${playerIndex + 1} guessed your number.`,
        opponentNumber: game.players[playerIndex].number,
        yourNumber: opponentNumber
      });
    } else {
      // Switch turns
      game.currentTurn = opponentIndex;
      
      const nextPlayerSocketId = game.players[game.currentTurn].socketId;
      const otherPlayerSocketId = game.players[playerIndex].socketId;
      
      io.to(nextPlayerSocketId).emit('yourTurn', {
        message: `Opponent guessed ${guessNum}. It's now your turn!`
      });
      
      io.to(otherPlayerSocketId).emit('opponentTurn', {
        message: 'Waiting for opponent to guess...'
      });
    }
  });

  // Handle play again
  socket.on('playAgain', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) return;

    // Reset game state
    game.players.forEach(p => {
      p.number = null;
      p.ready = false;
    });
    game.currentTurn = 0;
    game.status = 'choosing';
    game.guesses = [];
    game.winner = null;

    io.to(gameId).emit('gameReset', {
      message: 'New round! Choose your secret number (1-100).'
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove from waiting list
    const waitingIndex = waitingPlayers.indexOf(socket.id);
    if (waitingIndex > -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    // Find and end any active games
    for (const [gameId, game] of games.entries()) {
      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const opponentIndex = 1 - playerIndex;
        const opponentSocketId = game.players[opponentIndex].socketId;
        
        io.to(opponentSocketId).emit('opponentDisconnected', {
          message: 'Your opponent disconnected. Game ended.'
        });
        
        games.delete(gameId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log('🎯 Numble Server Started!');
  console.log('========================================');
  console.log(`
  Numble - Number Guessing Game
  Local:    http://localhost:${PORT}`);
  
  // Get local IP addresses
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  
  if (addresses.length > 0) {
    console.log(`  Network:  http://${addresses[0]}:${PORT}`);
    console.log('\nShare the Network URL with other devices on your WiFi!');
  }
  
  console.log('========================================\n');
});
