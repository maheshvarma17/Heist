/**
 * test/multiplayer.test.js
 * Automated test suite for Milestone 10: Multiplayer Crew Control & Synchronization.
 */

import { io } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { PlayerManager } from '../server/players/PlayerManager.js';
import { RoomManager, ROOM_STATUS } from '../server/rooms/RoomManager.js';

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
    ioServer.to(res.room.code).emit('gameStarting', {
      roomCode: res.room.code,
      players: serialized.players,
      crew: res.crewSnapshot,
    });
  });

  socket.on('crewMove', (data = {}) => {
    const res = roomManager.updateCrewState(player.roomCode, socket.id, data);
    if (!res.success) return sendError(res.error);
    socket.to(player.roomCode).emit('crewMoved', res.crewState);
  });

  socket.on('crewStateRequest', () => {
    const snapshot = roomManager.getCrewSnapshot(player.roomCode);
    if (snapshot) {
      socket.emit('crewStateSnapshot', { roomCode: player.roomCode, crew: snapshot });
    }
  });

  socket.on('disconnect', () => {
    const leaveResult = roomManager.leaveRoom(socket.id);
    if (leaveResult.room) {
      if (leaveResult.room.status === ROOM_STATUS.PLAYING) {
        ioServer.to(leaveResult.room.code).emit('playerDisconnectedInGame', {
          playerId: leaveResult.player ? leaveResult.player.id : null,
          playerName: leaveResult.player ? leaveResult.player.name : 'Player',
          role: leaveResult.player ? leaveResult.player.role : null,
        });
      } else {
        const serialized = roomManager.serializeRoom(leaveResult.room);
        ioServer.to(leaveResult.room.code).emit('roomState', serialized);
      }
    }
    playerManager.removePlayer(socket.id);
  });
});

function createClientSocket() {
  return io(`http://localhost:${TEST_PORT}`, {
    autoConnect: false,
    reconnection: false,
    forceNew: true,
  });
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
    // ── Setup: 4 players join and ready up ──
    const client1 = createClientSocket();
    const client2 = createClientSocket();
    const client3 = createClientSocket();
    const client4 = createClientSocket();

    await connectAnd(client1);
    await connectAnd(client2);
    await connectAnd(client3);
    await connectAnd(client4);

    let roomCode = null;
    let p1Id = null, p2Id = null, p3Id = null, p4Id = null;

    await new Promise(resolve => {
      client1.once('roomCreated', data => {
        roomCode = data.roomCode;
        p1Id = data.player.id;
        resolve();
      });
      client1.emit('createRoom', { name: 'Player 1' });
    });

    await new Promise(resolve => {
      client2.once('roomJoined', data => { p2Id = data.player.id; resolve(); });
      client2.emit('joinRoom', { name: 'Player 2', roomCode });
    });

    await new Promise(resolve => {
      client3.once('roomJoined', data => { p3Id = data.player.id; resolve(); });
      client3.emit('joinRoom', { name: 'Player 3', roomCode });
    });

    await new Promise(resolve => {
      client4.once('roomJoined', data => { p4Id = data.player.id; resolve(); });
      client4.emit('joinRoom', { name: 'Player 4', roomCode });
    });

    // Assign unique roles: P1 -> THIEF, P2 -> HACKER, P3 -> DISTRACTOR, P4 -> ENFORCER
    client1.emit('assignRole', { targetPlayerId: p1Id, role: 'THIEF' });
    client1.emit('assignRole', { targetPlayerId: p2Id, role: 'HACKER' });
    client1.emit('assignRole', { targetPlayerId: p3Id, role: 'DISTRACTOR' });
    client1.emit('assignRole', { targetPlayerId: p4Id, role: 'ENFORCER' });
    await new Promise(r => setTimeout(r, 100));

    // Ready all players
    client1.emit('setReady', { isReady: true });
    client2.emit('setReady', { isReady: true });
    client3.emit('setReady', { isReady: true });
    client4.emit('setReady', { isReady: true });
    await new Promise(r => setTimeout(r, 100));

    // TEST 1 — ROLE OWNERSHIP
    const room = roomManager.getRoom(roomCode);
    if (room.players.find(p => p.id === p1Id).role === 'THIEF' &&
        room.players.find(p => p.id === p2Id).role === 'HACKER') {
      console.log('✓ TEST 1 PASSED: Role ownership verified (P1=THIEF, P2=HACKER)');
    } else {
      throw new Error('TEST 1 Failed: Roles not assigned correctly');
    }

    // TEST 2 — WRONG CREW CONTROL REJECTION
    // Before game starts, crewMove should be rejected
    await new Promise((resolve, reject) => {
      client1.once('errorMessage', data => {
        if (data.message.includes('not currently active') || data.message.includes('Unauthorized')) {
          console.log('✓ TEST 2.1 PASSED: crewMove blocked before game start');
          resolve();
        } else {
          reject(new Error(`TEST 2.1 Failed: Unexpected error: ${data.message}`));
        }
      });
      client1.emit('crewMove', { role: 'THIEF', position: { x: 0, y: 0, z: 0 }, rotationY: 0, state: 'MOVING' });
    });

    // TEST 3 — CREW SNAPSHOT ON GAME START
    let startData = null;
    await new Promise(resolve => {
      client1.once('gameStarting', data => {
        startData = data;
        resolve();
      });
      client1.emit('startGame');
    });

    if (startData && startData.crew && startData.crew.length === 4) {
      const thiefInit = startData.crew.find(c => c.role === 'THIEF');
      if (thiefInit && thiefInit.position.x === -4 && thiefInit.position.z === 19.5) {
        console.log('✓ TEST 3 PASSED: gameStarting delivered initial 4-player crew snapshot with spawn positions');
      } else {
        throw new Error('TEST 3 Failed: Thief initial position invalid');
      }
    } else {
      throw new Error('TEST 3 Failed: Crew snapshot missing or incomplete');
    }

    // TEST 2 (Cont.) — UNAUTHORIZED ROLE MOVE DURING GAME
    // Player 1 (THIEF) tries to move HACKER
    await new Promise((resolve, reject) => {
      client1.once('errorMessage', data => {
        if (data.message.includes('Unauthorized: You do not own role HACKER')) {
          console.log('✓ TEST 2.2 PASSED: Server rejected unauthorized role control (P1 trying to move HACKER)');
          resolve();
        } else {
          reject(new Error(`TEST 2.2 Failed: Unexpected error: ${data.message}`));
        }
      });
      client1.emit('crewMove', { role: 'HACKER', position: { x: 5, y: 0, z: 5 }, rotationY: 0, state: 'MOVING' });
    });

    // TEST 4 — SINGLE CREW MOVEMENT BROADCAST
    await new Promise((resolve, reject) => {
      client2.once('crewMoved', data => {
        if (data.role === 'THIEF' && data.position.x === 2.5 && data.state === 'MOVING') {
          console.log('✓ TEST 4 PASSED: Player 1 movement of THIEF broadcast to other clients');
          resolve();
        } else {
          reject(new Error(`TEST 4 Failed: Received unexpected crewMoved data: ${JSON.stringify(data)}`));
        }
      });
      client1.emit('crewMove', {
        role: 'THIEF',
        position: { x: 2.5, y: 0, z: 10.0 },
        rotationY: 1.57,
        state: 'MOVING',
      });
    });

    // TEST 5 — MULTIPLE PLAYERS MOVEMENT SYNC
    const p3HackerPromise = new Promise(resolve => {
      const handler = (data) => {
        if (data.role === 'HACKER' && data.position.x === -1.0) {
          client3.off('crewMoved', handler);
          resolve();
        }
      };
      client3.on('crewMoved', handler);
    });

    const p1DistractorPromise = new Promise(resolve => {
      const handler = (data) => {
        if (data.role === 'DISTRACTOR' && data.position.x === 3.0) {
          client1.off('crewMoved', handler);
          resolve();
        }
      };
      client1.on('crewMoved', handler);
    });

    client2.emit('crewMove', { role: 'HACKER', position: { x: -1.0, y: 0, z: 15.0 }, rotationY: 0.5, state: 'MOVING' });
    client3.emit('crewMove', { role: 'DISTRACTOR', position: { x: 3.0, y: 0, z: 12.0 }, rotationY: -0.5, state: 'MOVING' });

    await Promise.all([p3HackerPromise, p1DistractorPromise]);
    console.log('✓ TEST 5 PASSED: Multi-client movement synchronized simultaneously');

    // TEST 6 — INVALID COORDINATES REJECTION
    await new Promise((resolve, reject) => {
      client1.once('errorMessage', data => {
        if (data.message.includes('finite') || data.message.includes('out of playable bounds')) {
          console.log('✓ TEST 6 PASSED: Out-of-bounds / invalid coordinates rejected by server');
          resolve();
        } else {
          reject(new Error(`TEST 6 Failed: Unexpected error: ${data.message}`));
        }
      });
      client1.emit('crewMove', { role: 'THIEF', position: { x: 999.0, y: 0, z: 999.0 }, rotationY: 0, state: 'MOVING' });
    });

    // TEST 7 — STATE TRANSITION TO IDLE (FINAL UPDATE)
    await new Promise((resolve, reject) => {
      client4.once('crewMoved', data => {
        if (data.role === 'THIEF' && data.state === 'IDLE') {
          console.log('✓ TEST 7 PASSED: Authoritative IDLE state broadcast on arrival');
          resolve();
        } else {
          reject(new Error(`TEST 7 Failed: Expected state IDLE, got ${data.state}`));
        }
      });
      client1.emit('crewMove', { role: 'THIEF', position: { x: 2.5, y: 0, z: 10.0 }, rotationY: 1.57, state: 'IDLE' });
    });

    // TEST 8 — CREW STATE REQUEST
    await new Promise((resolve, reject) => {
      client3.once('crewStateSnapshot', data => {
        if (data.crew && data.crew.length === 4) {
          console.log('✓ TEST 8 PASSED: crewStateRequest returned active room crew snapshot');
          resolve();
        } else {
          reject(new Error('TEST 8 Failed: Snapshot missing crew array'));
        }
      });
      client3.emit('crewStateRequest');
    });

    // TEST 9 — IN-GAME DISCONNECT BROADCAST
    await new Promise((resolve, reject) => {
      client1.once('playerDisconnectedInGame', data => {
        if (data.role === 'ENFORCER') {
          console.log('✓ TEST 9 PASSED: In-game disconnect of Player 4 broadcast to remaining players');
          resolve();
        } else {
          reject(new Error(`TEST 9 Failed: Expected ENFORCER disconnect, got: ${JSON.stringify(data)}`));
        }
      });
      client4.disconnect();
    });

    // TEST 10 — PLAYING ROOM JOIN RESTRICTION
    const client5 = createClientSocket();
    await connectAnd(client5);
    await new Promise((resolve, reject) => {
      client5.once('errorMessage', data => {
        if (data.message.includes('already started')) {
          console.log('✓ TEST 10 PASSED: New player prevented from joining active PLAYING room');
          client5.disconnect();
          resolve();
        } else {
          reject(new Error(`TEST 10 Failed: Expected already started error, got: ${data.message}`));
        }
      });
      client5.emit('joinRoom', { name: 'Late Player', roomCode });
    });

    // Cleanup remaining clients
    client1.disconnect();
    client2.disconnect();
    client3.disconnect();
    await new Promise(r => setTimeout(r, 100));

    console.log('\n========================================');
    console.log('ALL 10 MILESTONE 10 MULTIPLAYER TESTS PASSED!');
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
