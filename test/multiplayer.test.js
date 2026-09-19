/**
 * test/multiplayer.test.js
 * Automated integration test suite for Milestone 14: Multiplayer Escape System.
 */

import { io } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { PlayerManager } from '../server/players/PlayerManager.js';
import {
  RoomManager,
  ROOM_STATUS,
  GUARD_CONFIGS,
  CAMERA_CONFIGS,
  VAULT_CONFIG,
  LOOT_CONFIGS,
  ESCAPE_CONFIGS,
  ESCAPE_DURATION,
} from '../server/rooms/RoomManager.js';

const TEST_PORT = 3099;
const app = express();
const server = http.createServer(app);
const ioServer = new Server(server, { cors: { origin: '*' } });

const playerManager = new PlayerManager();
const roomManager = new RoomManager();

// ─── Socket Server Setup ──────────────────────────────────────
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
      guards: res.guards,
      cameras: res.cameras,
      alarm: res.alarm,
      vault: res.vault,
      loot: res.loot,
      escape: res.escape,
    });
  });

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
      guards: res.guards,
      cameras: res.cameras,
      alarm: res.alarm,
      vault: res.vault,
      loot: res.loot,
      escape: res.escape,
    });
    ioServer.to(res.roomCode).emit('guardStateSnapshot', {
      roomCode: res.roomCode,
      guards: res.guards,
    });
    ioServer.to(res.roomCode).emit('cameraStateSnapshot', {
      roomCode: res.roomCode,
      cameras: res.cameras,
    });
    ioServer.to(res.roomCode).emit('alarmStateSnapshot', {
      roomCode: res.roomCode,
      alarm: res.alarm,
    });
    ioServer.to(res.roomCode).emit('vaultStateSnapshot', {
      roomCode: res.roomCode,
      vault: res.vault,
    });
    ioServer.to(res.roomCode).emit('lootStateSnapshot', {
      roomCode: res.roomCode,
      loot: res.loot,
    });
    ioServer.to(res.roomCode).emit('escapeStateSnapshot', {
      roomCode: res.roomCode,
      escape: res.escape,
    });
  });

  socket.on('crewMove', (data = {}) => {
    const res = roomManager.updateCrewState(player.roomCode, socket.id, data);
    if (!res.success) return sendError(res.error);
    socket.to(player.roomCode).emit('crewMoved', res.crewState);
  });

  socket.on('requestGuardState', () => {
    socket.emit('guardStateSnapshot', {
      roomCode: player.roomCode,
      guards: roomManager.getGuardSnapshot(player.roomCode),
    });
  });

  socket.on('requestCameraState', () => {
    socket.emit('cameraStateSnapshot', {
      roomCode: player.roomCode,
      cameras: roomManager.getCameraSnapshot(player.roomCode),
    });
  });

  socket.on('requestAlarmState', () => {
    socket.emit('alarmStateSnapshot', {
      roomCode: player.roomCode,
      alarm: roomManager.getAlarmSnapshot(player.roomCode),
    });
  });

  socket.on('requestVaultOpen', () => {
    const res = roomManager.requestVaultOpen(player.roomCode, socket.id);
    if (!res.success) {
      return socket.emit('vaultError', { message: res.error });
    }
    ioServer.to(player.roomCode).emit('vaultOpeningStarted', {
      roomCode: player.roomCode,
      openedBy: player.name,
      role: player.role,
      playerName: player.name,
      vault: res.vault,
    });
    ioServer.to(player.roomCode).emit('vaultStateUpdated', {
      roomCode: player.roomCode,
      state: res.vault.state,
      progress: res.vault.progress,
      openedBy: res.vault.openedBy,
      openedByRole: res.vault.openedByRole,
    });
  });

  socket.on('cancelVaultOpen', () => {
    const res = roomManager.cancelVaultOpen(player.roomCode, socket.id, 'Cancelled');
    if (res.success) {
      ioServer.to(player.roomCode).emit('vaultOpeningCancelled', {
        roomCode: player.roomCode,
        reason: res.reason,
        vault: res.vault,
      });
      ioServer.to(player.roomCode).emit('vaultStateUpdated', {
        roomCode: player.roomCode,
        state: res.vault.state,
        progress: res.vault.progress,
        openedBy: null,
        openedByRole: null,
      });
    }
  });

  socket.on('requestVaultState', () => {
    socket.emit('vaultStateSnapshot', {
      roomCode: player.roomCode,
      vault: roomManager.getVaultSnapshot(player.roomCode),
    });
  });

  socket.on('requestLootState', () => {
    socket.emit('lootStateSnapshot', {
      roomCode: player.roomCode,
      loot: roomManager.getLootSnapshot(player.roomCode),
    });
  });

  socket.on('collectLoot', ({ lootId } = {}) => {
    const res = roomManager.collectLoot(player.roomCode, socket.id, lootId);
    if (!res.success) {
      return socket.emit('lootError', { message: res.error });
    }
    ioServer.to(player.roomCode).emit('lootCollected', {
      roomCode: player.roomCode,
      lootId: res.lootId,
      type: res.type,
      value: res.value,
      collectedBy: res.collectedBy,
      playerName: res.playerName,
      role: res.role,
      totalValue: res.totalValue,
      remainingCount: res.remainingCount,
      loot: res.loot,
    });
  });

  // Escape System socket handlers
  socket.on('requestEscape', ({ routeId } = {}) => {
    const res = roomManager.requestEscape(player.roomCode, socket.id, routeId);
    if (!res.success) {
      return socket.emit('escapeError', { message: res.error });
    }
    ioServer.to(player.roomCode).emit('escapeStarted', {
      roomCode: player.roomCode,
      playerId: res.playerId,
      playerName: res.playerName,
      role: res.role,
      routeId: res.routeId,
      routeName: res.routeName,
      duration: res.duration,
      escape: res.escape,
    });
  });

  socket.on('cancelEscape', () => {
    const res = roomManager.cancelEscape(player.roomCode, socket.id, 'Cancelled');
    if (res.success) {
      ioServer.to(player.roomCode).emit('escapeCancelled', {
        roomCode: player.roomCode,
        playerId: res.playerId,
        reason: res.reason,
        escape: res.escape,
      });
    }
  });

  socket.on('requestEscapeState', () => {
    socket.emit('escapeStateSnapshot', {
      roomCode: player.roomCode,
      escape: roomManager.getEscapeSnapshot(player.roomCode),
    });
  });

  socket.on('resetSimulation', () => {
    const res = roomManager.resetSimulation(player.roomCode);
    if (res) {
      ioServer.to(player.roomCode).emit('alarmUpdated', {
        level: 0,
        state: 'NORMAL',
        source: 'RESET',
      });
      ioServer.to(player.roomCode).emit('guardStateSnapshot', {
        roomCode: player.roomCode,
        guards: res.guards,
      });
      ioServer.to(player.roomCode).emit('cameraStateSnapshot', {
        roomCode: player.roomCode,
        cameras: res.cameras,
      });
      ioServer.to(player.roomCode).emit('vaultStateSnapshot', {
        roomCode: player.roomCode,
        vault: res.vault,
      });
      ioServer.to(player.roomCode).emit('lootStateSnapshot', {
        roomCode: player.roomCode,
        loot: res.loot,
      });
      ioServer.to(player.roomCode).emit('escapeStateSnapshot', {
        roomCode: player.roomCode,
        escape: res.escape,
      });
    }
  });

  // ── Outcome & Replay socket handlers (Milestone 15) ────────
  socket.on('concludeHeist', ({ reason } = {}) => {
    const res = roomManager.concludeHeist(player.roomCode, reason || 'TIMEOUT');
    if (res) {
      ioServer.to(player.roomCode).emit('heistCompleted', {
        roomCode: player.roomCode,
        reason: res.result.reason,
        result: res.result,
      });
    }
  });

  socket.on('requestFinalResult', () => {
    socket.emit('finalResultSnapshot', {
      roomCode: player.roomCode,
      finalResult: roomManager.getFinalResultSnapshot(player.roomCode),
    });
  });

  socket.on('planAgain', () => {
    const res = roomManager.planAgain(player.roomCode, socket.id);
    if (!res.success) {
      return sendError(res.error || 'Failed to restart planning.');
    }
    const serialized = roomManager.serializeRoom(res.room);
    ioServer.to(res.room.code).emit('planAgainReady', {
      roomCode: res.room.code,
      room: serialized,
    });
    ioServer.to(res.room.code).emit('roomState', serialized);
  });

  socket.on('disconnect', () => {
    const leaveResult = roomManager.leaveRoom(socket.id);
    if (leaveResult.room) {
      if (leaveResult.room.status === ROOM_STATUS.PLAYING) {
        ioServer.to(leaveResult.room.code).emit('playerDisconnectedInGame', {
          playerId: leaveResult.player ? leaveResult.player.id : null,
          playerName: leaveResult.player ? leaveResult.player.name : 'Unknown',
          role: leaveResult.player ? leaveResult.player.role : null,
        });
      }
    }
    playerManager.removePlayer(socket.id);
  });
});

// Simulation loop
const SIM_TICK_RATE_HZ = 20;
const SIM_TICK_INTERVAL_MS = 1000 / SIM_TICK_RATE_HZ;
const DT = 1 / SIM_TICK_RATE_HZ;

const simInterval = setInterval(() => {
  for (const [code, room] of roomManager.rooms.entries()) {
    if (room.status === ROOM_STATUS.PLAYING && room.simulationActive) {
      const sim = roomManager.updateSimulation(room, DT);
      if (sim.guardUpdates && sim.guardUpdates.length > 0) {
        ioServer.to(code).emit('guardMoved', { roomCode: code, guards: sim.guardUpdates });
      }
      for (const evt of sim.guardEvents) {
        ioServer.to(code).emit('guardDetected', evt);
      }
      for (const evt of sim.cameraEvents) {
        ioServer.to(code).emit('cameraDetected', evt);
      }
      for (const evt of sim.cameraStateEvents) {
        ioServer.to(code).emit('cameraStateUpdated', evt);
      }
      if (sim.alarmEvent) {
        ioServer.to(code).emit('alarmUpdated', sim.alarmEvent);
      }
      if (sim.vaultCancelledEvent) {
        ioServer.to(code).emit('vaultOpeningCancelled', sim.vaultCancelledEvent);
        ioServer.to(code).emit('vaultStateUpdated', {
          roomCode: code,
          state: sim.vaultCancelledEvent.vault.state,
          progress: sim.vaultCancelledEvent.vault.progress,
          openedBy: null,
          openedByRole: null,
        });
      }
      if (sim.vaultOpenedEvent) {
        ioServer.to(code).emit('vaultOpened', sim.vaultOpenedEvent);
        ioServer.to(code).emit('vaultStateUpdated', {
          roomCode: code,
          state: 'OPEN',
          progress: 100,
          openedBy: sim.vaultOpenedEvent.openedBy,
          openedByRole: sim.vaultOpenedEvent.openedByRole,
        });
        ioServer.to(code).emit('lootSpawned', {
          roomCode: code,
          loot: sim.vaultOpenedEvent.loot,
        });
      } else if (sim.vaultEvent) {
        ioServer.to(code).emit('vaultStateUpdated', sim.vaultEvent);
      }

      // Escape events
      if (sim.escapeAvailableEvent) {
        ioServer.to(code).emit('escapeAvailable', sim.escapeAvailableEvent);
      }
      for (const evt of sim.escapeCancelledEvents) {
        ioServer.to(code).emit('escapeCancelled', evt);
      }
      for (const evt of sim.escapeProgressEvents) {
        ioServer.to(code).emit('escapeProgress', evt);
      }
      for (const evt of sim.playerEscapedEvents) {
        ioServer.to(code).emit('playerEscaped', evt);
      }

      // Milestone 15: Heist Completion
      if (sim.heistCompletedEvent) {
        ioServer.to(code).emit('heistCompleted', sim.heistCompletedEvent);
      }
    }
  }
}, SIM_TICK_INTERVAL_MS);

// ─── Test Helpers ─────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createClient = () => {
  return io(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket'],
    forceNew: true,
  });
};

const waitForEvent = (socket, eventName, timeout = 4000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeout);
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

// ─── Main Test Runner ─────────────────────────────────────────
async function runTests() {
  console.log('[TEST] Starting Milestone 14 test server on port ' + TEST_PORT);
  await new Promise((res) => server.listen(TEST_PORT, res));

  let clients = [];
  let roomCode = '';
  let hostPlayer = null;
  let p2 = null, p3 = null, p4 = null;

  try {
    const c1 = createClient();
    const c2 = createClient();
    const c3 = createClient();
    const c4 = createClient();
    clients = [c1, c2, c3, c4];

    await Promise.all(clients.map(c => new Promise(res => c.on('connect', res))));

    // ── Setup 4-Player Room in PLANNING phase ──
    c1.emit('createRoom', { name: 'ThiefPlayer' });
    const createRes = await waitForEvent(c1, 'roomCreated');
    roomCode = createRes.roomCode;
    hostPlayer = createRes.player;

    c2.emit('joinRoom', { name: 'HackerPlayer', roomCode });
    const j2Res = await waitForEvent(c2, 'roomJoined');
    p2 = j2Res.player;

    c3.emit('joinRoom', { name: 'DistractorPlayer', roomCode });
    const j3Res = await waitForEvent(c3, 'roomJoined');
    p3 = j3Res.player;

    c4.emit('joinRoom', { name: 'EnforcerPlayer', roomCode });
    const j4Res = await waitForEvent(c4, 'roomJoined');
    p4 = j4Res.player;

    c1.emit('assignRole', { targetPlayerId: hostPlayer.id, role: 'THIEF' });
    await waitForEvent(c1, 'roleUpdated');
    c1.emit('assignRole', { targetPlayerId: p2.id, role: 'HACKER' });
    await waitForEvent(c1, 'roleUpdated');
    c1.emit('assignRole', { targetPlayerId: p3.id, role: 'DISTRACTOR' });
    await waitForEvent(c1, 'roleUpdated');
    c1.emit('assignRole', { targetPlayerId: p4.id, role: 'ENFORCER' });
    await waitForEvent(c1, 'roleUpdated');

    c1.emit('setReady', { isReady: true });
    await waitForEvent(c1, 'readyUpdated');
    c2.emit('setReady', { isReady: true });
    await waitForEvent(c2, 'readyUpdated');
    c3.emit('setReady', { isReady: true });
    await waitForEvent(c3, 'readyUpdated');
    c4.emit('setReady', { isReady: true });
    await waitForEvent(c4, 'readyUpdated');

    c1.emit('startGame');
    const startData = await waitForEvent(c1, 'gameStarting');
    console.log('✓ SETUP COMPLETE: 4-Player room entered PLANNING phase');

    // ── TEST 1: ESCAPE INITIAL STATE ──
    const room = roomManager.getRoom(roomCode);
    if (!room.escape || room.escape.state !== 'LOCKED' || room.escape.escapedPlayers.length !== 0) {
      throw new Error(`Expected escape LOCKED with 0 escaped, got ${JSON.stringify(room.escape)}`);
    }
    const routes = Object.keys(ESCAPE_CONFIGS);
    if (routes.length !== 2 || !routes.includes('frontExit') || !routes.includes('rooftopExit')) {
      throw new Error(`Expected exactly 2 escape routes (frontExit, rooftopExit), got ${JSON.stringify(routes)}`);
    }
    console.log('✓ TEST 1 PASSED: Escape system initializes in authoritative LOCKED state with 2 exit routes');

    // ── TEST 2: ESCAPE ROUTE DEFINITIONS & COORDINATES ──
    const frontCfg = ESCAPE_CONFIGS.frontExit;
    const roofCfg = ESCAPE_CONFIGS.rooftopExit;
    if (frontCfg.position.x !== 0 || frontCfg.position.y !== 0 || frontCfg.position.z !== 21 || frontCfg.radius !== 3.0) {
      throw new Error(`frontExit configuration mismatch: ${JSON.stringify(frontCfg)}`);
    }
    if (roofCfg.position.x !== 0 || roofCfg.position.y !== 4 || roofCfg.position.z !== -19 || roofCfg.radius !== 3.0) {
      throw new Error(`rooftopExit configuration mismatch: ${JSON.stringify(roofCfg)}`);
    }
    console.log('✓ TEST 2 PASSED: Escape routes exactly match specified 3D positions and 3.0m radii');

    // ── TEST 3: ESCAPE ATTEMPT WHEN LOCKED IS REJECTED ──
    // Place Thief right at frontExit (0, 0, 21) while vault is locked and request escape
    c1.emit('crewMove', { role: 'THIEF', position: { x: 0, y: 0, z: 21 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);
    const lockedEscapePromise = waitForEvent(c1, 'escapeError');
    c1.emit('requestEscape', { routeId: 'frontExit' });
    const lockedErr = await lockedEscapePromise;
    if (!lockedErr.message.includes('locked') && !lockedErr.message.includes('Vault must be opened')) {
      throw new Error(`Expected escape locked error, got: ${lockedErr.message}`);
    }
    console.log('✓ TEST 3 PASSED: Escape request when vault is LOCKED is rejected');

    // Add planning actions & start execution
    c1.emit('addAction', { role: 'THIEF', action: { type: 'MOVE', target: 'vault' } });
    await waitForEvent(c1, 'teamPlanUpdated');
    c2.emit('addAction', { role: 'HACKER', action: { type: 'MOVE', target: 'vault' } });
    await waitForEvent(c2, 'teamPlanUpdated');
    c3.emit('addAction', { role: 'DISTRACTOR', action: { type: 'MOVE', target: 'hallway' } });
    await waitForEvent(c3, 'teamPlanUpdated');
    c4.emit('addAction', { role: 'ENFORCER', action: { type: 'MOVE', target: 'office' } });
    await waitForEvent(c4, 'teamPlanUpdated');

    c1.emit('setPlanningReady', { isReady: true });
    await waitForEvent(c1, 'planningReadyUpdated');
    c2.emit('setPlanningReady', { isReady: true });
    await waitForEvent(c2, 'planningReadyUpdated');
    c3.emit('setPlanningReady', { isReady: true });
    await waitForEvent(c3, 'planningReadyUpdated');
    c4.emit('setPlanningReady', { isReady: true });
    await waitForEvent(c4, 'planningReadyUpdated');

    c1.emit('startExecution');
    await waitForEvent(c1, 'executionStarting');

    // ── Open the Vault to Unlock Escape ──
    c1.emit('crewMove', { role: 'THIEF', position: { x: 0, y: 0, z: 10 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);
    c1.emit('requestVaultOpen');
    await waitForEvent(c1, 'vaultOpeningStarted');

    // Fast-forward vault timer to open
    room.vault.timer = 5.0;

    // ── TEST 4 & 5: ESCAPE UNLOCK & BROADCAST ON VAULT OPEN ──
    const [vaultOpenedEvt, escapeAvailEvt] = await Promise.all([
      waitForEvent(c2, 'vaultOpened', 5000),
      waitForEvent(c2, 'escapeAvailable', 5000),
    ]);

    if (room.escape.state !== 'AVAILABLE' || escapeAvailEvt.escape.state !== 'AVAILABLE') {
      throw new Error(`Expected escape state AVAILABLE, got ${JSON.stringify(escapeAvailEvt)}`);
    }
    console.log('✓ TEST 4 PASSED: Opening the vault automatically unlocks escape routes (state AVAILABLE)');
    console.log('✓ TEST 5 PASSED: escapeAvailable event is broadcast to all players in the room');

    // ── TEST 6: DISTANCE VALIDATION (> 3.0m) ──
    // Hacker (c2) is at vault (0, 0, 10), far from frontExit (0, 0, 21), tries to escape
    c2.emit('crewMove', { role: 'HACKER', position: { x: 0, y: 0, z: 10 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);
    const distErrPromise = waitForEvent(c2, 'escapeError');
    c2.emit('requestEscape', { routeId: 'frontExit' });
    const distErr = await distErrPromise;
    if (!distErr.message.includes('closer')) {
      throw new Error(`Expected distance validation error, got: ${distErr.message}`);
    }
    console.log('✓ TEST 6 PASSED: Escape request outside zone radius (> 3.0) is rejected');

    // ── TEST 7: ALTITUDE/Y VALIDATION ──
    // Distractor (c3) at rooftop X/Z (0, -19) but at ground level (Y=0 vs Y=4), tries rooftopExit
    c3.emit('crewMove', { role: 'DISTRACTOR', position: { x: 0, y: 0, z: -19 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);
    const altErrPromise = waitForEvent(c3, 'escapeError');
    c3.emit('requestEscape', { routeId: 'rooftopExit' });
    const altErr = await altErrPromise;
    if (!altErr.message.includes('closer')) {
      throw new Error(`Expected altitude validation error, got: ${altErr.message}`);
    }
    console.log('✓ TEST 7 PASSED: Rooftop escape request from wrong altitude/floor (Y=0) is rejected');

    // ── TEST 8 & 9: VALID FRONT EXIT INITIATION & BROADCAST ──
    // Move Thief (c1) to frontExit zone (0, 0, 21)
    c1.emit('crewMove', { role: 'THIEF', position: { x: 0.5, y: 0, z: 21.0 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);

    const escapeStartedPromise = waitForEvent(c2, 'escapeStarted');
    c1.emit('requestEscape', { routeId: 'frontExit' });
    const startEvt = await escapeStartedPromise;

    if (startEvt.playerId !== hostPlayer.id || startEvt.routeId !== 'frontExit' || startEvt.duration !== 2.0) {
      throw new Error(`Unexpected escapeStarted event: ${JSON.stringify(startEvt)}`);
    }
    console.log('✓ TEST 8 PASSED: Valid escape request initiates 2.0s confirmation timer');
    console.log('✓ TEST 9 PASSED: escapeStarted event is broadcast to all clients with route and player info');

    // ── TEST 10 & 11: ESCAPE PROGRESS TICK & COMPLETION ──
    const playerEscapedPromise = waitForEvent(c3, 'playerEscaped', 5000);

    // Fast-forward escape timer
    if (room.escape.activeEscapes[hostPlayer.id]) {
      room.escape.activeEscapes[hostPlayer.id].timer = 2.0;
    }

    const escapedData = await playerEscapedPromise;
    if (escapedData.playerId !== hostPlayer.id || escapedData.escapedCount !== 1 || escapedData.totalPlayers !== 4) {
      throw new Error(`Unexpected playerEscaped payload: ${JSON.stringify(escapedData)}`);
    }
    console.log('✓ TEST 10 PASSED: Server authoritatively ticks escape progress to 100%');
    console.log('✓ TEST 11 PASSED: playerEscaped event broadcast with updated team count (1 / 4 ESCAPED)');

    // ── TEST 12: AUTHORITATIVE CREW STATE MARKED COMPLETED ──
    const thiefState = room.crewStates[hostPlayer.id];
    if (thiefState.state !== 'COMPLETED' || !room.escape.escapedPlayers.includes(hostPlayer.id)) {
      throw new Error(`Expected Thief state COMPLETED and in escapedPlayers, got ${JSON.stringify(thiefState)}`);
    }
    console.log('✓ TEST 12 PASSED: Escaped operative is authoritatively marked COMPLETED');

    // ── TEST 13: ESCAPED PLAYER CANNOT MOVE ──
    const moveRejectPromise = waitForEvent(c1, 'errorMessage');
    c1.emit('crewMove', { role: 'THIEF', position: { x: 0, y: 0, z: 15 }, rotationY: 0, state: 'MOVING' });
    const moveErr = await moveRejectPromise;
    if (!moveErr.message.includes('already escaped')) {
      throw new Error(`Expected move rejection for escaped player, got: ${moveErr.message}`);
    }
    console.log('✓ TEST 13 PASSED: Escaped player attempting movement is rejected by server');

    // ── TEST 14: ESCAPED PLAYER CANNOT OPEN VAULT OR COLLECT LOOT ──
    const vaultRejectPromise = waitForEvent(c1, 'vaultError');
    c1.emit('requestVaultOpen');
    const vErr = await vaultRejectPromise;
    if (!vErr.message.includes('already escaped')) {
      throw new Error(`Expected vault rejection for escaped player, got: ${vErr.message}`);
    }

    const lootRejectPromise = waitForEvent(c1, 'lootError');
    c1.emit('collectLoot', { lootId: 'cash_01' });
    const lErr = await lootRejectPromise;
    if (!lErr.message.includes('already escaped')) {
      throw new Error(`Expected loot rejection for escaped player, got: ${lErr.message}`);
    }
    console.log('✓ TEST 14 PASSED: Escaped player attempting vault or loot actions is rejected by server');

    // ── TEST 15: ROOFTOP EXIT ESCAPE ──
    // Move Hacker (c2) to rooftopExit (0, 4, -19)
    c2.emit('crewMove', { role: 'HACKER', position: { x: 0, y: 4, z: -19 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);

    const roofStartPromise = waitForEvent(c4, 'escapeStarted');
    c2.emit('requestEscape', { routeId: 'rooftopExit' });
    const roofStartEvt = await roofStartPromise;
    if (roofStartEvt.routeId !== 'rooftopExit' || roofStartEvt.role !== 'HACKER') {
      throw new Error(`Expected rooftop escapeStarted, got: ${JSON.stringify(roofStartEvt)}`);
    }

    // Fast-forward escape timer
    if (room.escape.activeEscapes[p2.id]) {
      room.escape.activeEscapes[p2.id].timer = 2.0;
    }

    const roofEscapedEvt = await waitForEvent(c4, 'playerEscaped', 5000);
    if (roofEscapedEvt.playerId !== p2.id || roofEscapedEvt.escapedCount !== 2) {
      throw new Error(`Expected 2 escaped players, got ${roofEscapedEvt.escapedCount}`);
    }
    console.log('✓ TEST 15 PASSED: Second operative successfully escapes via Rooftop Exit (2 / 4 ESCAPED)');

    // ── TEST 16: DISTANCE BREAK CANCELLATION ──
    // Distractor (c3) moves to frontExit (0, 0, 21), starts escape, then moves away
    c3.emit('crewMove', { role: 'DISTRACTOR', position: { x: 0, y: 0, z: 21 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);
    c3.emit('requestEscape', { routeId: 'frontExit' });
    await waitForEvent(c3, 'escapeStarted');

    // Move Distractor away to (0, 0, 10) during confirmation
    const cancelPromise = waitForEvent(c4, 'escapeCancelled');
    c3.emit('crewMove', { role: 'DISTRACTOR', position: { x: 0, y: 0, z: 10 }, rotationY: 0, state: 'MOVING' });
    const cancelEvt = await cancelPromise;
    if (cancelEvt.playerId !== p3.id || !cancelEvt.reason.includes('moved away')) {
      throw new Error(`Expected escapeCancelled due to moving away, got: ${JSON.stringify(cancelEvt)}`);
    }
    console.log('✓ TEST 16 PASSED: Moving away from escape zone during confirmation cancels escape attempt');

    // ── TEST 17: DISCONNECT CANCELLATION ──
    // Enforcer (c4) moves to rooftopExit (0, 4, -19), starts escape, then disconnects
    c4.emit('crewMove', { role: 'ENFORCER', position: { x: 0, y: 4, z: -19 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);
    c4.emit('requestEscape', { routeId: 'rooftopExit' });
    await waitForEvent(c3, 'escapeStarted');

    const discCancelPromise = waitForEvent(c3, 'escapeCancelled');
    c4.disconnect(); // Disconnect Enforcer client
    const discCancelEvt = await discCancelPromise;
    if (discCancelEvt.playerId !== p4.id) {
      throw new Error(`Expected escapeCancelled for disconnected player, got: ${JSON.stringify(discCancelEvt)}`);
    }
    console.log('✓ TEST 17 PASSED: Disconnecting during active escape confirmation cleanly cancels escape');

    // ── TEST 18: INDEPENDENT ESCAPE FOR REMAINING OPERATIVE ──
    // Distractor (c3) returns to frontExit (0, 0, 21) and completes escape
    c3.emit('crewMove', { role: 'DISTRACTOR', position: { x: 0, y: 0, z: 21 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);
    c3.emit('requestEscape', { routeId: 'frontExit' });
    await waitForEvent(c3, 'escapeStarted');

    if (room.escape.activeEscapes[p3.id]) {
      room.escape.activeEscapes[p3.id].timer = 2.0;
    }
    const finalEscapedEvt = await waitForEvent(c3, 'playerEscaped', 5000);
    if (finalEscapedEvt.playerId !== p3.id || finalEscapedEvt.escapedCount !== 3) {
      throw new Error(`Expected 3 total escaped players, got ${finalEscapedEvt.escapedCount}`);
    }
    console.log('✓ TEST 18 PASSED: Remaining operative independently escapes (3 / 3 connected escaped)');

    // ── TEST 19: PLAN AGAIN RESET ──
    // Host (c1) triggers resetSimulation
    const resetSnapPromise = waitForEvent(c3, 'escapeStateSnapshot');
    c1.emit('resetSimulation');
    const resetSnap = await resetSnapPromise;
    if (resetSnap.escape.state !== 'LOCKED' || resetSnap.escape.escapedPlayers.length !== 0) {
      throw new Error(`Expected reset escape LOCKED with 0 escaped, got ${JSON.stringify(resetSnap.escape)}`);
    }
    console.log('✓ TEST 19 PASSED: Resetting simulation cleanly restores escape state back to LOCKED with 0 escaped players');

    // ═══════════════════════════════════════════════════════════════
    // MILESTONE 15 — HEIST OUTCOME & FINAL RESULT TESTS
    // ═══════════════════════════════════════════════════════════════

    // ── TEST 20: OUTCOME COMPUTATION - GRADE S (PERFECT HEIST) ──
    // Simulate room with all 4 escaped, 100% loot ($1,300), 0% alarm
    room.loot.totalCollectedValue = 1300;
    room.loot.items.cash_01.collected = true;
    room.loot.items.cash_01.collectedBy = hostPlayer.id;
    room.loot.items.cash_02.collected = true;
    room.loot.items.cash_02.collectedBy = hostPlayer.id;
    room.loot.items.cash_03.collected = true;
    room.loot.items.cash_03.collectedBy = hostPlayer.id;
    room.loot.items.gold_01.collected = true;
    room.loot.items.gold_01.collectedBy = p2.id;
    room.loot.items.gold_02.collected = true;
    room.loot.items.gold_02.collectedBy = p2.id;
    room.loot.items.diamond_01.collected = true;
    room.loot.items.diamond_01.collectedBy = p3.id;

    room.escape.escapedPlayers = [hostPlayer.id, p2.id, p3.id];
    room.alarm.level = 10;
    room.alarm.state = 'NORMAL';

    const gradeSResult = roomManager.computeFinalResult(room, 'ALL_ESCAPED');
    if (gradeSResult.grade !== 'S' || gradeSResult.ratingTitle !== 'PERFECT HEIST') {
      throw new Error(`Expected Grade S (PERFECT HEIST), got ${gradeSResult.grade} (${gradeSResult.ratingTitle})`);
    }
    if (gradeSResult.loot.totalSecured !== 1300 || gradeSResult.loot.breakdown.cash.count !== 3 || gradeSResult.loot.breakdown.gold.count !== 2 || gradeSResult.loot.breakdown.diamonds.count !== 1) {
      throw new Error(`Loot breakdown mismatch: ${JSON.stringify(gradeSResult.loot)}`);
    }
    console.log('✓ TEST 20 PASSED: Grade S (PERFECT HEIST) awarded for all operatives escaped + 100% loot + low alarm');

    // ── TEST 21: OUTCOME COMPUTATION - TIMEOUT WITH INSIDE OPERATIVES ──
    // Simulate timeout where only 1 operative escaped and 2 remained inside
    room.escape.escapedPlayers = [hostPlayer.id]; // p2 and p3 inside
    room.loot.totalCollectedValue = 600; // partial loot
    room.alarm.level = 80;
    room.alarm.state = 'ALARM';

    const timeoutResult = roomManager.computeFinalResult(room, 'TIMEOUT');
    if (timeoutResult.grade !== 'C' || timeoutResult.ratingTitle !== 'MESSY ESCAPE') {
      throw new Error(`Expected Grade C (MESSY ESCAPE) for partial escape + high alarm, got ${timeoutResult.grade}`);
    }
    
    const hostOp = timeoutResult.operatives.find((o) => o.id === hostPlayer.id);
    const p2Op = timeoutResult.operatives.find((o) => o.id === p2.id);
    if (!hostOp || hostOp.status !== 'ESCAPED') {
      throw new Error(`Expected host status ESCAPED, got ${JSON.stringify(hostOp)}`);
    }
    if (!p2Op || p2Op.status !== 'INSIDE') {
      throw new Error(`Expected p2 status INSIDE, got ${JSON.stringify(p2Op)}`);
    }
    console.log('✓ TEST 21 PASSED: Operatives correctly classified as ESCAPED vs INSIDE on TIMEOUT');

    // ── TEST 22: OUTCOME COMPUTATION - GRADE F (BUSTED) ──
    // 0 operatives escaped, $0 secured
    room.escape.escapedPlayers = [];
    room.loot.totalCollectedValue = 0;
    const bustedResult = roomManager.computeFinalResult(room, 'TIMEOUT');
    if (bustedResult.grade !== 'F' || bustedResult.ratingTitle !== 'BUSTED') {
      throw new Error(`Expected Grade F (BUSTED), got ${bustedResult.grade} (${bustedResult.ratingTitle})`);
    }
    console.log('✓ TEST 22 PASSED: Grade F (BUSTED) awarded when 0 operatives escape or 0 loot secured');

    // ── TEST 23: SERVER HEIST COMPLETION & BROADCAST ──
    // Trigger concludeHeist via socket from host
    const heistCompletedPromise = waitForEvent(c3, 'heistCompleted');
    c1.emit('concludeHeist', { reason: 'HOST_CONCLUDED' });
    const heistEvt = await heistCompletedPromise;
    if (!heistEvt || !heistEvt.result || !heistEvt.result.grade) {
      throw new Error(`Invalid heistCompleted payload: ${JSON.stringify(heistEvt)}`);
    }
    console.log('✓ TEST 23 PASSED: concludeHeist authoritatively finalizes heist and broadcasts result to all clients');

    // ── TEST 24: REQUEST FINAL RESULT SNAPSHOT ──
    const snapPromise = waitForEvent(c3, 'finalResultSnapshot');
    c3.emit('requestFinalResult');
    const snapData = await snapPromise;
    if (!snapData.finalResult || snapData.finalResult.grade !== heistEvt.result.grade) {
      throw new Error(`Mismatch in finalResultSnapshot: ${JSON.stringify(snapData)}`);
    }
    console.log('✓ TEST 24 PASSED: requestFinalResult returns latest authoritative outcome snapshot');

    // ── TEST 25: PLAN AGAIN SOCKET FLOW ──
    // Host requests planAgain
    const planAgainPromise = waitForEvent(c3, 'planAgainReady');
    c1.emit('planAgain');
    const planAgainEvt = await planAgainPromise;
    if (!planAgainEvt.room || planAgainEvt.room.finalResult !== null) {
      throw new Error(`Expected reset room with null finalResult, got ${JSON.stringify(planAgainEvt)}`);
    }
    if (room.finalResult !== null || room.phase !== 'PLANNING' || room.readyStatuses[hostPlayer.id] !== false) {
      throw new Error(`Room state not cleanly reset to PLANNING: ${JSON.stringify(room)}`);
    }
    console.log('✓ TEST 25 PASSED: planAgain cleanly resets room simulation, finalResult, and returns all players to PLANNING phase');

    console.log('\n========================================');
    console.log('ALL 25 MILESTONES 14 & 15 INTEGRATION TESTS PASSED!');
    console.log('========================================\n');

  } finally {
    for (const c of clients) {
      if (c && c.connected) c.disconnect();
    }
    clearInterval(simInterval);
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  console.error(err.stack);
  clearInterval(simInterval);
  server.close();
  process.exit(1);
});
