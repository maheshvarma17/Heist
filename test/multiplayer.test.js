/**
 * test/multiplayer.test.js
 * Automated test suite for Milestone 11: Shared Team Planning & Action Synchronization.
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
    socket.emit('planningError', { message });
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
      teamPlan: res.teamPlan,
    });
  });

  // Planning handlers
  socket.on('addAction', (data = {}) => {
    const res = roomManager.addAction(player.roomCode, socket.id, data);
    if (!res.success) return sendError(res.error);
    ioServer.to(player.roomCode).emit('teamPlanUpdated', {
      roomCode: player.roomCode,
      teamPlan: res.teamPlan,
      planningReady: res.planningReady,
      addedAction: res.addedAction,
      role: data.role.toUpperCase(),
    });
  });

  socket.on('removeAction', (data = {}) => {
    const res = roomManager.removeAction(player.roomCode, socket.id, data);
    if (!res.success) return sendError(res.error);
    ioServer.to(player.roomCode).emit('teamPlanUpdated', {
      roomCode: player.roomCode,
      teamPlan: res.teamPlan,
      planningReady: res.planningReady,
      role: data.role.toUpperCase(),
    });
  });

  socket.on('clearActions', (data = {}) => {
    const res = roomManager.clearActions(player.roomCode, socket.id, data);
    if (!res.success) return sendError(res.error);
    ioServer.to(player.roomCode).emit('teamPlanUpdated', {
      roomCode: player.roomCode,
      teamPlan: res.teamPlan,
      planningReady: res.planningReady,
      role: data.role.toUpperCase(),
    });
  });

  socket.on('setPlanningReady', ({ isReady } = {}) => {
    const res = roomManager.setPlanningReady(player.roomCode, socket.id, isReady);
    if (!res.success) return sendError(res.error);
    ioServer.to(player.roomCode).emit('planningReadyUpdated', {
      roomCode: player.roomCode,
      playerId: res.playerId,
      isReady: res.isReady,
      planningReady: res.planningReady,
    });
  });

  socket.on('startExecution', () => {
    const res = roomManager.startExecution(player.roomCode, socket.id);
    if (!res.success) return sendError(res.error);
    ioServer.to(res.roomCode).emit('executionStarting', {
      roomCode: res.roomCode,
      teamPlan: res.teamPlan,
    });
  });

  socket.on('crewMove', (data = {}) => {
    const res = roomManager.updateCrewState(player.roomCode, socket.id, data);
    if (!res.success) return sendError(res.error);
    socket.to(player.roomCode).emit('crewMoved', res.crewState);
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
    // ── Setup: 4 players join, assign roles, ready up, and start heist ──
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

    client1.emit('assignRole', { targetPlayerId: p1Id, role: 'THIEF' });
    client1.emit('assignRole', { targetPlayerId: p2Id, role: 'HACKER' });
    client1.emit('assignRole', { targetPlayerId: p3Id, role: 'DISTRACTOR' });
    client1.emit('assignRole', { targetPlayerId: p4Id, role: 'ENFORCER' });
    await new Promise(r => setTimeout(r, 100));

    client1.emit('setReady', { isReady: true });
    client2.emit('setReady', { isReady: true });
    client3.emit('setReady', { isReady: true });
    client4.emit('setReady', { isReady: true });
    await new Promise(r => setTimeout(r, 100));

    await new Promise(resolve => {
      client1.once('gameStarting', () => resolve());
      client1.emit('startGame');
    });

    console.log('✓ SETUP COMPLETE: 4-Player room entered PLANNING phase');

    // ── TEST 1: Role-owned action addition ──
    await new Promise((resolve, reject) => {
      client1.once('teamPlanUpdated', (data) => {
        if (data.teamPlan && data.teamPlan.THIEF && data.teamPlan.THIEF.length === 1 && data.teamPlan.THIEF[0].target === 'office') {
          console.log('✓ TEST 1 PASSED: Player 1 (THIEF) successfully added action to team plan');
          resolve();
        } else {
          reject(new Error(`TEST 1 Failed: Unexpected teamPlan payload: ${JSON.stringify(data)}`));
        }
      });
      client1.emit('addAction', { role: 'THIEF', action: { type: 'MOVE', target: 'office' } });
    });

    // ── TEST 2: Unauthorized action addition rejection ──
    await new Promise((resolve, reject) => {
      client1.once('planningError', (data) => {
        if (data.message.includes('Unauthorized: You can only add actions for your own role')) {
          console.log('✓ TEST 2 PASSED: Server rejected unauthorized action modification (P1 trying to modify HACKER)');
          resolve();
        } else {
          reject(new Error(`TEST 2 Failed: Unexpected planning error message: ${data.message}`));
        }
      });
      client1.emit('addAction', { role: 'HACKER', action: { type: 'MOVE', target: 'securityRoom' } });
    });

    // ── TEST 3: Real-time team plan broadcast ──
    const p1ReceivePromise = new Promise(resolve => {
      const handler = (data) => {
        if (data.teamPlan && data.teamPlan.HACKER && data.teamPlan.HACKER.length === 1) {
          client1.off('teamPlanUpdated', handler);
          resolve();
        }
      };
      client1.on('teamPlanUpdated', handler);
    });

    const p4ReceivePromise = new Promise(resolve => {
      const handler = (data) => {
        if (data.teamPlan && data.teamPlan.HACKER && data.teamPlan.HACKER.length === 1) {
          client4.off('teamPlanUpdated', handler);
          resolve();
        }
      };
      client4.on('teamPlanUpdated', handler);
    });

    client2.emit('addAction', { role: 'HACKER', action: { type: 'MOVE', target: 'securityRoom' } });
    await Promise.all([p1ReceivePromise, p4ReceivePromise]);
    console.log('✓ TEST 3 PASSED: Teammate actions broadcast live to all other clients in real-time');

    // ── TEST 4: Multiple Operatives Planning Simultaneously ──
    const addActionAsync = (client, role, action) => {
      return new Promise((resolve) => {
        const handler = (data) => {
          if (data.role === role.toUpperCase()) {
            client.off('teamPlanUpdated', handler);
            resolve(data);
          }
        };
        client.on('teamPlanUpdated', handler);
        client.emit('addAction', { role, action });
      });
    };

    await addActionAsync(client1, 'THIEF', { type: 'WAIT', duration: 2 });
    await addActionAsync(client3, 'DISTRACTOR', { type: 'MOVE', target: 'lobby' });
    await addActionAsync(client4, 'ENFORCER', { type: 'MOVE', target: 'hallway' });

    const room = roomManager.getRoom(roomCode);
    const plan = room.teamPlan;
    if (plan.THIEF.length === 2 && plan.HACKER.length === 1 && plan.DISTRACTOR.length === 1 && plan.ENFORCER.length === 1) {
      console.log('✓ TEST 4 PASSED: All 4 operatives planned actions concurrently');
    } else {
      throw new Error(`TEST 4 Failed: Incomplete team plan: ${JSON.stringify(plan)}`);
    }

    // ── TEST 5: Action Removal and Queue Clearing ──
    await new Promise((resolve) => {
      const handler = (data) => {
        if (data.role === 'THIEF' && data.teamPlan.THIEF.length === 1) {
          client1.off('teamPlanUpdated', handler);
          resolve();
        }
      };
      client1.on('teamPlanUpdated', handler);
      client1.emit('removeAction', { role: 'THIEF', index: 0 });
    });

    await new Promise((resolve) => {
      const handler = (data) => {
        if (data.role === 'DISTRACTOR' && data.teamPlan.DISTRACTOR.length === 0) {
          client3.off('teamPlanUpdated', handler);
          resolve();
        }
      };
      client3.on('teamPlanUpdated', handler);
      client3.emit('clearActions', { role: 'DISTRACTOR' });
    });
    console.log('✓ TEST 5 PASSED: Action removal and queue clearing synchronized across team');

    // ── TEST 6: Planning Readiness Tracking ──
    await new Promise((resolve) => {
      const handler = (data) => {
        if (data.playerId === p2Id && data.isReady === true) {
          client2.off('planningReadyUpdated', handler);
          resolve();
        }
      };
      client2.on('planningReadyUpdated', handler);
      client2.emit('setPlanningReady', { isReady: true });
    });
    console.log('✓ TEST 6 PASSED: Planning ready state updated and broadcast');

    // ── TEST 7: Execution Start Blocked When Players Not Ready ──
    await new Promise((resolve, reject) => {
      client1.once('planningError', (data) => {
        if (data.message.includes('READY')) {
          console.log('✓ TEST 7 PASSED: Execution start blocked when not all operatives are ready');
          resolve();
        } else {
          reject(new Error(`TEST 7 Failed: Expected readiness error, got: ${data.message}`));
        }
      });
      client1.emit('startExecution');
    });

    // ── TEST 8: Non-Host Execution Start Rejection ──
    // Set all players to ready
    const setReadyAsync = (client, isReady) => {
      return new Promise((resolve) => {
        const handler = (data) => {
          client.off('planningReadyUpdated', handler);
          resolve();
        };
        client.on('planningReadyUpdated', handler);
        client.emit('setPlanningReady', { isReady });
      });
    };

    await setReadyAsync(client1, true);
    await setReadyAsync(client3, true);
    await setReadyAsync(client4, true);

    // Player 2 (non-host) attempts to trigger execution
    await new Promise((resolve, reject) => {
      client2.once('planningError', (data) => {
        if (data.message.includes('Only the host')) {
          console.log('✓ TEST 8 PASSED: Non-host execution trigger rejected');
          resolve();
        } else {
          reject(new Error(`TEST 8 Failed: Expected host authority error, got: ${data.message}`));
        }
      });
      client2.emit('startExecution');
    });

    // ── TEST 9: Synchronized Execution Trigger ──
    let clientsStartingCount = 0;
    const countExecution = (data) => {
      if (data.teamPlan && data.roomCode === roomCode) {
        clientsStartingCount++;
      }
    };

    client1.on('executionStarting', countExecution);
    client2.on('executionStarting', countExecution);
    client3.on('executionStarting', countExecution);
    client4.on('executionStarting', countExecution);

    // Host triggers execution
    client1.emit('startExecution');
    await new Promise(r => setTimeout(r, 200));

    if (clientsStartingCount === 4) {
      console.log('✓ TEST 9 PASSED: executionStarting received by all 4 clients with synchronized team plan');
    } else {
      throw new Error(`TEST 9 Failed: clientsStartingCount = ${clientsStartingCount}`);
    }

    // ── TEST 10: In-Game Disconnect ──
    await new Promise((resolve) => {
      client1.once('playerDisconnectedInGame', (data) => {
        if (data.role === 'ENFORCER') {
          resolve();
        }
      });
      client4.disconnect();
    });
    console.log('✓ TEST 10 PASSED: In-game disconnect handled cleanly');

    // Cleanup
    client1.disconnect();
    client2.disconnect();
    client3.disconnect();
    await new Promise(r => setTimeout(r, 100));

    console.log('\n========================================');
    console.log('ALL 10 MILESTONE 11 TESTS PASSED!');
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
