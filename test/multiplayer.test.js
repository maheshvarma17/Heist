/**
 * test/multiplayer.test.js
 * Automated test suite for Milestone 9 Multiplayer server and logic.
 */

import { io } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { PlayerManager } from '../server/players/PlayerManager.js';
import { RoomManager, ROOM_STATUS } from '../server/rooms/RoomManager.js';

// Setup test server on dedicated port
const TEST_PORT = 3099;
const app = express();
const server = http.createServer(app);
const ioServer = new Server(server, { cors: { origin: '*' } });

const playerManager = new PlayerManager();
const roomManager = new RoomManager();

ioServer.on('connection', (socket) => {
  const player = playerManager.createPlayer(socket.id);

  const sendError = (message) => {
    socket.emit('errorMessage', { message });
  };

  socket.on('createRoom', ({ name } = {}) => {
    const pName = (name || '').trim();
    if (!pName) return sendError('Enter a player name.');
    playerManager.setName(socket.id, pName);
    const room = roomManager.createRoom(player);
    socket.join(room.code);
    const serialized = roomManager.serializeRoom(room);
    socket.emit('roomCreated', { roomCode: room.code, player, room: serialized });
  });

  socket.on('joinRoom', ({ name, roomCode } = {}) => {
    const pName = (name || '').trim();
    if (!pName) return sendError('Enter a player name.');
    const code = (roomCode || '').trim().toUpperCase();
    playerManager.setName(socket.id, pName);
    const res = roomManager.joinRoom(code, player);
    if (!res.success) return sendError(res.error);
    socket.join(res.room.code);
    const serialized = roomManager.serializeRoom(res.room);
    socket.emit('roomJoined', { roomCode: res.room.code, player, room: serialized });
    ioServer.to(res.room.code).emit('roomState', serialized);
  });

  socket.on('assignRole', ({ targetPlayerId, role } = {}) => {
    const res = roomManager.assignRole(player.roomCode, socket.id, targetPlayerId, role);
    if (!res.success) return sendError(res.error);
    const serialized = roomManager.serializeRoom(res.room);
    ioServer.to(res.room.code).emit('roomState', serialized);
    ioServer.to(res.room.code).emit('roleUpdated', { targetPlayerId, role, room: serialized });
  });

  socket.on('setReady', ({ isReady } = {}) => {
    const res = roomManager.setReady(player.roomCode, socket.id, isReady);
    if (!res.success) return sendError(res.error);
    const serialized = roomManager.serializeRoom(res.room);
    ioServer.to(res.room.code).emit('roomState', serialized);
    ioServer.to(res.room.code).emit('readyUpdated', { playerId: player.id, isReady, room: serialized });
  });

  socket.on('startGame', () => {
    const res = roomManager.startGame(player.roomCode, socket.id);
    if (!res.success) return sendError(res.error);
    const serialized = roomManager.serializeRoom(res.room);
    ioServer.to(res.room.code).emit('gameStarting', { roomCode: res.room.code, players: serialized.players });
  });

  socket.on('disconnect', () => {
    const leaveResult = roomManager.leaveRoom(socket.id);
    if (leaveResult.room) {
      if (!leaveResult.roomDeleted) {
        const serialized = roomManager.serializeRoom(leaveResult.room);
        ioServer.to(leaveResult.room.code).emit('roomState', serialized);
      }
    }
    playerManager.removePlayer(socket.id);
  });
});

function createClientSocket() {
  const sock = io(`http://localhost:${TEST_PORT}`, {
    autoConnect: false,
    reconnection: false,
    forceNew: true,
  });
  return sock;
}

function connectAnd(sock) {
  return new Promise((resolve) => {
    sock.on('connect', () => resolve(sock));
    sock.connect();
  });
}

async function runTests() {
  await new Promise(r => server.listen(TEST_PORT, r));
  console.log(`[TEST] Test server started on port ${TEST_PORT}`);

  try {
    // TEST 1 — CREATE ROOM
    const client1 = createClientSocket();
    await connectAnd(client1);

    let roomCode = null;
    let client1Id = null;

    await new Promise((resolve, reject) => {
      client1.on('roomCreated', (data) => {
        roomCode = data.roomCode;
        client1Id = data.player.id;
        if (data.player.isHost && data.room.players.length === 1 && data.room.status === 'WAITING') {
          console.log('✓ TEST 1 PASSED: Player 1 created room', roomCode, 'as HOST');
          resolve();
        } else {
          reject(new Error('TEST 1 Failed: Unexpected createRoom payload'));
        }
      });
      client1.emit('createRoom', { name: 'Player 1' });
    });

    // TEST 2 — JOIN ROOM
    const client2 = createClientSocket();
    await connectAnd(client2);
    let client2Id = null;

    await new Promise((resolve, reject) => {
      client2.on('roomJoined', (data) => {
        client2Id = data.player.id;
        if (!data.player.isHost && data.room.players.length === 2) {
          console.log('✓ TEST 2 PASSED: Player 2 joined room', roomCode);
          resolve();
        } else {
          reject(new Error('TEST 2 Failed: Unexpected roomJoined payload'));
        }
      });
      client2.emit('joinRoom', { name: 'Player 2', roomCode });
    });

    // TEST 3 — FOUR PLAYERS
    const client3 = createClientSocket();
    await connectAnd(client3);
    const client4 = createClientSocket();
    await connectAnd(client4);
    let client3Id = null;
    let client4Id = null;

    await new Promise((resolve) => {
      client3.on('roomJoined', (data) => {
        client3Id = data.player.id;
        resolve();
      });
      client3.emit('joinRoom', { name: 'Player 3', roomCode });
    });

    await new Promise((resolve) => {
      client4.on('roomJoined', (data) => {
        client4Id = data.player.id;
        resolve();
      });
      client4.emit('joinRoom', { name: 'Player 4', roomCode });
    });

    const room = roomManager.getRoom(roomCode);
    if (room && room.players.length === 4) {
      console.log('✓ TEST 3 PASSED: All 4 players joined room');
    } else {
      throw new Error('TEST 3 Failed: Room does not have 4 players');
    }

    // TEST 4 — FIFTH PLAYER REJECTION
    const client5 = createClientSocket();
    await connectAnd(client5);
    await new Promise((resolve, reject) => {
      client5.on('errorMessage', (data) => {
        if (data.message === 'Room is full.') {
          console.log('✓ TEST 4 PASSED: 5th player rejected (Room is full)');
          client5.disconnect();
          resolve();
        } else {
          reject(new Error(`TEST 4 Failed: Expected "Room is full.", got "${data.message}"`));
        }
      });
      client5.emit('joinRoom', { name: 'Player 5', roomCode });
    });

    // TEST 5 — HOST AUTHORITY
    await new Promise((resolve, reject) => {
      client2.once('errorMessage', (data) => {
        if (data.message.includes('Only the host')) {
          console.log('✓ TEST 5 PASSED: Non-host cannot assign roles');
          resolve();
        } else {
          reject(new Error(`TEST 5 Failed: Unexpected error: ${data.message}`));
        }
      });
      client2.emit('assignRole', { targetPlayerId: client2Id, role: 'HACKER' });
    });

    // TEST 6 & 7 — ROLE ASSIGNMENT & DUPLICATE ROLE PREVENTION
    // Assign THIEF to client1
    client1.emit('assignRole', { targetPlayerId: client1Id, role: 'THIEF' });
    await new Promise(r => setTimeout(r, 100));

    // Try assigning THIEF to client2 (duplicate test)
    await new Promise((resolve, reject) => {
      client1.once('errorMessage', (data) => {
        if (data.message === 'That role is already assigned.') {
          console.log('✓ TEST 7 PASSED: Duplicate role assignment rejected');
          resolve();
        } else {
          reject(new Error(`TEST 7 Failed: Expected duplicate role rejection, got: ${data.message}`));
        }
      });
      client1.emit('assignRole', { targetPlayerId: client2Id, role: 'THIEF' });
    });

    // Now assign valid unique roles to remaining
    client1.emit('assignRole', { targetPlayerId: client2Id, role: 'HACKER' });
    client1.emit('assignRole', { targetPlayerId: client3Id, role: 'DISTRACTOR' });
    client1.emit('assignRole', { targetPlayerId: client4Id, role: 'ENFORCER' });
    await new Promise(r => setTimeout(r, 150));

    const updatedRoom = roomManager.getRoom(roomCode);
    const assigned = updatedRoom.players.map(p => p.role);
    if (assigned.join(',') === 'THIEF,HACKER,DISTRACTOR,ENFORCER') {
      console.log('✓ TEST 6 PASSED: All 4 unique roles assigned successfully');
    } else {
      throw new Error(`TEST 6 Failed: Roles are ${assigned.join(',')}`);
    }

    // TEST 8 — READY SYSTEM
    // Try starting before players are ready
    await new Promise((resolve, reject) => {
      client1.once('errorMessage', (data) => {
        if (data.message.includes('READY')) {
          console.log('✓ TEST 8.1 PASSED: Start blocked when players are not ready');
          resolve();
        } else {
          reject(new Error(`TEST 8.1 Failed: Unexpected start response: ${data.message}`));
        }
      });
      client1.emit('startGame');
    });

    // Set all players to ready
    client1.emit('setReady', { isReady: true });
    client2.emit('setReady', { isReady: true });
    client3.emit('setReady', { isReady: true });
    client4.emit('setReady', { isReady: true });
    await new Promise(r => setTimeout(r, 150));

    if (updatedRoom.players.every(p => p.isReady)) {
      console.log('✓ TEST 8.2 PASSED: All 4 players are READY');
    } else {
      throw new Error('TEST 8.2 Failed: Not all players ready');
    }

    // TEST 9 — START HEIST
    let startedCount = 0;
    const checkStart = (data) => {
      if (data.roomCode === roomCode && data.players.length === 4) {
        startedCount++;
      }
    };

    client1.on('gameStarting', checkStart);
    client2.on('gameStarting', checkStart);
    client3.on('gameStarting', checkStart);
    client4.on('gameStarting', checkStart);

    client1.emit('startGame');
    await new Promise(r => setTimeout(r, 200));

    if (startedCount === 4 && updatedRoom.status === ROOM_STATUS.PLAYING) {
      console.log('✓ TEST 9 PASSED: gameStarting received by all 4 clients, room is PLAYING');
    } else {
      throw new Error(`TEST 9 Failed: startedCount is ${startedCount}`);
    }

    // TEST 10 — DISCONNECT
    client4.disconnect();
    await new Promise(r => setTimeout(r, 100));
    if (updatedRoom.players.length === 3) {
      console.log('✓ TEST 10 PASSED: Disconnect cleaned up player from room');
    } else {
      throw new Error('TEST 10 Failed: Disconnected player was not removed');
    }

    // Cleanup remaining clients
    client1.disconnect();
    client2.disconnect();
    client3.disconnect();
    await new Promise(r => setTimeout(r, 100));

    if (roomManager.getRoom(roomCode) === null) {
      console.log('✓ ROOM CLEANUP PASSED: Empty room removed successfully');
    }

    console.log('\n========================================');
    console.log('ALL 10 MULTIPLAYER TESTS PASSED SUCCESSFULLY!');
    console.log('========================================\n');

  } finally {
    server.close();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
