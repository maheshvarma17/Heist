/**
 * server.js
 * Express and Socket.IO server for HEIST: 60 SECONDS multiplayer.
 */

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { PlayerManager } from './players/PlayerManager.js';
import { RoomManager, ROOM_STATUS } from './rooms/RoomManager.js';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const playerManager = new PlayerManager();
const roomManager = new RoomManager();

// Basic health route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: roomManager.rooms.size,
    players: playerManager.players.size,
  });
});

io.on('connection', (socket) => {
  // Create player session
  const player = playerManager.createPlayer(socket.id);
  console.log(`[Multiplayer] Socket connected: ${socket.id} (Player: ${player.id})`);

  /** Helper to send error to this client */
  const sendError = (message) => {
    socket.emit('errorMessage', { message });
  };

  /**
   * Handle: createRoom
   * Payload: { name: string }
   */
  socket.on('createRoom', ({ name } = {}) => {
    const pName = (name || '').trim();
    if (!pName) {
      return sendError('Enter a player name.');
    }

    // Leave any existing room
    handleLeaveRoom(socket);

    playerManager.setName(socket.id, pName);
    const room = roomManager.createRoom(player);
    socket.join(room.code);

    const serialized = roomManager.serializeRoom(room);
    console.log(`[Multiplayer] Room created: ${room.code} by ${player.name} (${player.id})`);

    socket.emit('roomCreated', {
      roomCode: room.code,
      player: {
        id: player.id,
        name: player.name,
        role: player.role,
        isHost: player.isHost,
        isReady: player.isReady,
      },
      room: serialized,
    });
  });

  /**
   * Handle: joinRoom
   * Payload: { name: string, roomCode: string }
   */
  socket.on('joinRoom', ({ name, roomCode } = {}) => {
    const pName = (name || '').trim();
    if (!pName) {
      return sendError('Enter a player name.');
    }

    const code = (roomCode || '').trim().toUpperCase();
    if (!code) {
      return sendError('Enter a valid room code.');
    }

    // Leave any existing room
    handleLeaveRoom(socket);

    playerManager.setName(socket.id, pName);
    const joinResult = roomManager.joinRoom(code, player);

    if (!joinResult.success) {
      return sendError(joinResult.error || 'Failed to join room.');
    }

    socket.join(joinResult.room.code);
    const serialized = roomManager.serializeRoom(joinResult.room);
    console.log(`[Multiplayer] Player ${player.name} (${player.id}) joined room ${joinResult.room.code}`);

    socket.emit('roomJoined', {
      roomCode: joinResult.room.code,
      player: {
        id: player.id,
        name: player.name,
        role: player.role,
        isHost: player.isHost,
        isReady: player.isReady,
      },
      room: serialized,
    });

    // Notify room of new player
    io.to(joinResult.room.code).emit('roomState', serialized);
    socket.to(joinResult.room.code).emit('playerJoined', {
      player: {
        id: player.id,
        name: player.name,
        role: player.role,
        isHost: player.isHost,
        isReady: player.isReady,
      },
      room: serialized,
    });
  });

  /**
   * Handle: setPlayerName
   * Payload: { name: string }
   */
  socket.on('setPlayerName', ({ name } = {}) => {
    const pName = (name || '').trim();
    if (!pName) {
      return sendError('Enter a player name.');
    }
    playerManager.setName(socket.id, pName);
    if (player.roomCode) {
      const room = roomManager.getRoom(player.roomCode);
      if (room) {
        io.to(room.code).emit('roomState', roomManager.serializeRoom(room));
      }
    }
  });

  /**
   * Handle: assignRole
   * Payload: { targetPlayerId: string, role: string|null }
   */
  socket.on('assignRole', ({ targetPlayerId, role } = {}) => {
    if (!player.roomCode) {
      return sendError('You are not in a room.');
    }

    const res = roomManager.assignRole(player.roomCode, socket.id, targetPlayerId, role);
    if (!res.success) {
      return sendError(res.error || 'Failed to assign role.');
    }

    const serialized = roomManager.serializeRoom(res.room);
    io.to(res.room.code).emit('roomState', serialized);
    io.to(res.room.code).emit('roleUpdated', {
      targetPlayerId,
      role,
      room: serialized,
    });
  });

  /**
   * Handle: setReady
   * Payload: { isReady: boolean }
   */
  socket.on('setReady', ({ isReady } = {}) => {
    if (!player.roomCode) {
      return sendError('You are not in a room.');
    }

    const res = roomManager.setReady(player.roomCode, socket.id, isReady);
    if (!res.success) {
      return sendError(res.error || 'Failed to update ready state.');
    }

    const serialized = roomManager.serializeRoom(res.room);
    io.to(res.room.code).emit('roomState', serialized);
    io.to(res.room.code).emit('readyUpdated', {
      playerId: player.id,
      isReady: Boolean(isReady),
      room: serialized,
    });
  });

  /**
   * Handle: startGame
   */
  socket.on('startGame', () => {
    if (!player.roomCode) {
      return sendError('You are not in a room.');
    }

    const res = roomManager.startGame(player.roomCode, socket.id);
    if (!res.success) {
      return sendError(res.error || 'Cannot start the game.');
    }

    console.log(`[Multiplayer] Starting game in room ${res.room.code}! Initializing crew states.`);
    const serialized = roomManager.serializeRoom(res.room);

    // Broadcast gameStarting to all players in the room along with crew snapshot
    io.to(res.room.code).emit('gameStarting', {
      roomCode: res.room.code,
      players: serialized.players,
      crew: res.crewSnapshot,
    });
  });

  /**
   * Handle: crewMove
   * Payload: { role: string, position: {x, y, z}, rotationY: number, state: string }
   */
  socket.on('crewMove', (data = {}) => {
    if (!player.roomCode) {
      return sendError('You are not in a room.');
    }

    const res = roomManager.updateCrewState(player.roomCode, socket.id, data);
    if (!res.success) {
      return sendError(res.error || 'Failed to update crew movement.');
    }

    // Broadcast validated crew movement to all OTHER clients in the room
    socket.to(player.roomCode).emit('crewMoved', res.crewState);
  });

  /**
   * Handle: crewStateRequest
   */
  socket.on('crewStateRequest', () => {
    if (!player.roomCode) {
      return sendError('You are not in a room.');
    }

    const snapshot = roomManager.getCrewSnapshot(player.roomCode);
    if (snapshot) {
      socket.emit('crewStateSnapshot', {
        roomCode: player.roomCode,
        crew: snapshot,
      });
    }
  });

  /**
   * Handle: leaveRoom
   */
  socket.on('leaveRoom', () => {
    handleLeaveRoom(socket);
  });

  /**
   * Handle: disconnect
   */
  socket.on('disconnect', () => {
    console.log(`[Multiplayer] Socket disconnected: ${socket.id} (${player.name})`);
    handleLeaveRoom(socket);
    playerManager.removePlayer(socket.id);
  });

  /** Helper to cleanly leave room */
  function handleLeaveRoom(sock) {
    const leaveResult = roomManager.leaveRoom(sock.id);
    if (leaveResult.room) {
      sock.leave(leaveResult.room.code);
      if (leaveResult.roomDeleted) {
        console.log(`[Multiplayer] Room ${leaveResult.room.code} deleted (empty).`);
      } else {
        const serialized = roomManager.serializeRoom(leaveResult.room);
        if (leaveResult.room.status === ROOM_STATUS.PLAYING) {
          // If in-game disconnect, broadcast to remaining players
          io.to(leaveResult.room.code).emit('playerDisconnectedInGame', {
            playerId: leaveResult.player ? leaveResult.player.id : null,
            playerName: leaveResult.player ? leaveResult.player.name : 'Unknown Player',
            role: leaveResult.player ? leaveResult.player.role : null,
          });
        } else {
          // Lobby disconnect
          io.to(leaveResult.room.code).emit('roomState', serialized);
          io.to(leaveResult.room.code).emit('playerLeft', {
            playerId: leaveResult.player ? leaveResult.player.id : null,
            playerName: leaveResult.player ? leaveResult.player.name : null,
            newHostId: leaveResult.newHost ? leaveResult.newHost.id : null,
            room: serialized,
          });
        }
      }
    }
  }
});

server.listen(PORT, () => {
  console.log(`[HEIST Server] Multiplayer Socket.IO server running on http://localhost:${PORT}`);
});
