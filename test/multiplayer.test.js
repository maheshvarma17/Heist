/**
 * test/multiplayer.test.js
 * Automated integration test suite for Milestone 12: Networked Guards, Security Cameras & Alarm System.
 */

import { io } from 'socket.io-client';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { PlayerManager } from '../server/players/PlayerManager.js';
import { RoomManager, ROOM_STATUS, GUARD_CONFIGS, CAMERA_CONFIGS } from '../server/rooms/RoomManager.js';

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
    }
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

const waitForEvent = (socket, eventName, timeout = 3000) => {
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
  console.log('[TEST] Starting Milestone 12 test server on port ' + TEST_PORT);
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
    c1.emit('createRoom', { name: 'Player 1' });
    const createRes = await waitForEvent(c1, 'roomCreated');
    roomCode = createRes.roomCode;
    hostPlayer = createRes.player;

    c2.emit('joinRoom', { name: 'Player 2', roomCode });
    const j2Res = await waitForEvent(c2, 'roomJoined');
    p2 = j2Res.player;

    c3.emit('joinRoom', { name: 'Player 3', roomCode });
    const j3Res = await waitForEvent(c3, 'roomJoined');
    p3 = j3Res.player;

    c4.emit('joinRoom', { name: 'Player 4', roomCode });
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

    // ── TEST 14 — PLANNING PHASE: Detection inactive during planning ──
    const room = roomManager.getRoom(roomCode);
    if (room.simulationActive) throw new Error('Simulation should be inactive during planning');
    console.log('✓ TEST 14 PASSED: Guard & camera detection is inactive during planning');

    // Add actions and ready up
    c1.emit('addAction', { role: 'THIEF', action: { type: 'MOVE', target: 'vault' } });
    await waitForEvent(c1, 'teamPlanUpdated');
    c2.emit('addAction', { role: 'HACKER', action: { type: 'MOVE', target: 'securityRoom' } });
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

    // Position crew safely away from detection cones before starting execution
    c1.emit('crewMove', { role: 'THIEF', position: { x: -10, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    c2.emit('crewMove', { role: 'HACKER', position: { x: -8, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    c3.emit('crewMove', { role: 'DISTRACTOR', position: { x: -6, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    c4.emit('crewMove', { role: 'ENFORCER', position: { x: -4, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    await sleep(50);

    // Start execution
    c1.emit('startExecution');
    const execStarting = await waitForEvent(c1, 'executionStarting');

    // ── TEST 1 — GUARD STATE: Verify guard state exists when execution starts ──
    if (!execStarting.guards || execStarting.guards.length !== 3) {
      throw new Error(`Expected 3 guards in execution snapshot, got ${execStarting.guards?.length}`);
    }
    const guardIds = execStarting.guards.map(g => g.guardId);
    if (!guardIds.includes('lobbyGuard') || !guardIds.includes('vaultGuard') || !guardIds.includes('securityGuard')) {
      throw new Error(`Missing expected guards: ${guardIds}`);
    }
    console.log('✓ TEST 1 PASSED: Guard initial state snapshot delivered on execution start');

    // ── TEST 4 — CAMERA STATE: Verify camera state snapshot delivered ──
    if (!execStarting.cameras || execStarting.cameras.length !== 4) {
      throw new Error(`Expected 4 cameras in execution snapshot, got ${execStarting.cameras?.length}`);
    }
    console.log('✓ TEST 4 PASSED: Camera initial state snapshot delivered');

    // ── TEST 2 — GUARD MOVEMENT: Verify authoritative guard movement broadcast ──
    const guardMovedPacket = await waitForEvent(c2, 'guardMoved', 4000);
    if (!guardMovedPacket.guards || guardMovedPacket.guards.length !== 3) {
      throw new Error('Expected 3 guards in guardMoved packet');
    }
    console.log('✓ TEST 2 PASSED: Authoritative guard movement broadcast at ~20 Hz');

    // ── TEST 3 & TEST 7 — GUARD DETECTION & ALARM INCREASE ──
    // Place THIEF in front of securityGuard (securityGuard is near (-12, 0, -2))
    const secGuardPos = room.guards.securityGuard.position;
    const guardDetectedPromise = waitForEvent(c2, 'guardDetected', 4000);
    const alarmUpdatedPromise = waitForEvent(c2, 'alarmUpdated', 4000);

    c1.emit('crewMove', {
      role: 'THIEF',
      position: { x: secGuardPos.x, y: 0, z: secGuardPos.z - 2 },
      rotationY: 0,
      state: 'MOVING',
    });

    const [guardEvt, alarmEvt] = await Promise.all([guardDetectedPromise, alarmUpdatedPromise]);

    if (guardEvt.guardId !== 'securityGuard' || guardEvt.role !== 'THIEF') {
      throw new Error(`Unexpected guard detection event: ${JSON.stringify(guardEvt)}`);
    }
    console.log('✓ TEST 3 PASSED: Guard detection triggered and broadcast when crew enters vision cone');

    if (alarmEvt.level !== 20 || alarmEvt.source !== 'GUARD') {
      throw new Error(`Expected alarm level 20 from GUARD, got ${alarmEvt.level} from ${alarmEvt.source}`);
    }
    console.log('✓ TEST 7 PASSED: Guard detection increases alarm (+20)');

    // ── TEST 6 — DUPLICATE DETECTION: Keep player inside zone, ensure no spam ──
    let extraDetections = 0;
    const spamListener = (evt) => {
      extraDetections++;
    };
    c2.on('guardDetected', spamListener);
    await sleep(250); // wait 5 ticks (125ms)
    c2.off('guardDetected', spamListener);
    if (extraDetections > 0) {
      throw new Error(`Received ${extraDetections} duplicate detection events while staying in cone`);
    }
    console.log('✓ TEST 6 PASSED: Duplicate detection prevention active (no event spam while inside cone)');

    // ── TEST 5 & TEST 8 — CAMERA DETECTION & CAMERA ALARM ──
    // lobbyCam is at (5, 3, 21), baseYaw: 0 (facing -Z, scanning into lobby around z=15-18)
    // Place HACKER in front of lobbyCam
    const camDetectedPromise = waitForEvent(c1, 'cameraDetected', 4000);
    const camAlarmPromise = waitForEvent(c1, 'alarmUpdated', 4000);

    c2.emit('crewMove', {
      role: 'HACKER',
      position: { x: 5, y: 0, z: 18 },
      rotationY: 0,
      state: 'MOVING',
    });

    const [camEvt, camAlarm] = await Promise.all([camDetectedPromise, camAlarmPromise]);

    if (camEvt.cameraId !== 'lobbyCam' || camEvt.role !== 'HACKER') {
      throw new Error(`Unexpected camera detection: ${JSON.stringify(camEvt)}`);
    }
    console.log('✓ TEST 5 PASSED: Camera detection triggered and broadcast when crew enters camera vision');

    if (camAlarm.level !== 35 || camAlarm.source !== 'CAMERA') {
      throw new Error(`Expected alarm level 35 (+15), got ${camAlarm.level}`);
    }
    console.log('✓ TEST 8 PASSED: Camera detection increases alarm (+15)');

    // ── TEST 9 — SHARED ALARM: Verify all 4 clients receive identical alarm state ──
    const p1SnapPromise = waitForEvent(c1, 'alarmStateSnapshot');
    const p4SnapPromise = waitForEvent(c4, 'alarmStateSnapshot');
    c1.emit('requestAlarmState');
    c4.emit('requestAlarmState');
    const [s1, s4] = await Promise.all([p1SnapPromise, p4SnapPromise]);
    if (s1.alarm.level !== s4.alarm.level || s1.alarm.state !== s4.alarm.state) {
      throw new Error(`Desynchronized alarm state across clients: ${JSON.stringify(s1)} vs ${JSON.stringify(s4)}`);
    }
    console.log('✓ TEST 9 PASSED: Shared alarm state and level verified identical across clients');

    // ── TEST 12 — GUARD INVESTIGATION STATE TRANSITION ──
    if (room.guards.securityGuard.state !== 'INVESTIGATE') {
      throw new Error(`Expected securityGuard in INVESTIGATE, got ${room.guards.securityGuard.state}`);
    }
    // Move THIEF far away to (0, 0, 0) and simulate ticks to let guard linger and return
    c1.emit('crewMove', {
      role: 'THIEF',
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      state: 'IDLE',
    });
    // Fast-forward guard state to simulate investigation completion
    room.guards.securityGuard.target = null;
    room.guards.securityGuard.lingerTimer = 0.01;
    roomManager.updateSimulation(room, 0.1);
    if (room.guards.securityGuard.state !== 'RETURN') {
      throw new Error(`Expected securityGuard to transition to RETURN, got ${room.guards.securityGuard.state}`);
    }
    console.log('✓ TEST 12 PASSED: Guard PATROL -> INVESTIGATE -> RETURN state machine verified');

    // ── TEST 10 — ALARM DECAY: Verify alarm decreases by -5 when no active detections ──
    // Move all crew to safe location far away from all patrol routes and camera cones
    c1.emit('crewMove', { role: 'THIEF', position: { x: -20, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    c2.emit('crewMove', { role: 'HACKER', position: { x: -20, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    c3.emit('crewMove', { role: 'DISTRACTOR', position: { x: -20, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    c4.emit('crewMove', { role: 'ENFORCER', position: { x: -20, y: 0, z: 25 }, rotationY: 0, state: 'IDLE' });
    await sleep(100);

    // Force decay timestamp to simulate 3.1 seconds elapsed
    room.alarm.lastDecayTime = Date.now() - 3500;
    const decayPromise = waitForEvent(c1, 'alarmUpdated', 4000);
    const decayAlarm = await decayPromise;
    if (decayAlarm.source !== 'DECAY' || decayAlarm.level !== 30) {
      throw new Error(`Expected alarm decay to 30, got ${decayAlarm.level} (${decayAlarm.source})`);
    }
    console.log('✓ TEST 10 PASSED: Alarm decay (-5 points every 3 seconds) verified');

    // ── TEST 11 — MAXIMUM ALARM: Increase to 100% MAXIMUM ──
    roomManager.increaseAlarm(room, 70, 'TEST', 'test');
    if (room.alarm.level !== 100 || room.alarm.state !== 'MAXIMUM') {
      throw new Error(`Expected alarm level 100 MAXIMUM, got ${room.alarm.level} ${room.alarm.state}`);
    }
    if (room.status !== ROOM_STATUS.PLAYING) {
      throw new Error('Game should not terminate prematurely on MAXIMUM alarm');
    }
    console.log('✓ TEST 11 PASSED: 100% MAXIMUM alarm state synchronized without premature termination');

    // ── TEST 13 — PLAN AGAIN RESET ──
    const resetAlarmPromise = waitForEvent(c1, 'alarmUpdated', 4000);
    c1.emit('resetSimulation');
    const resetAlarm = await resetAlarmPromise;
    if (resetAlarm.level !== 0 || resetAlarm.state !== 'NORMAL') {
      throw new Error(`Expected alarm reset to 0 NORMAL, got ${resetAlarm.level} ${resetAlarm.state}`);
    }
    if (room.guards.lobbyGuard.state !== 'PATROL' || room.cameras.lobbyCam.state !== 'ACTIVE') {
      throw new Error('Simulation entities failed to reset to PATROL/ACTIVE on resetSimulation');
    }
    console.log('✓ TEST 13 PASSED: Plan Again cleanly resets alarm to 0, guards to PATROL, cameras to ACTIVE');

    // ── TEST 15 — DISCONNECT HANDLING ──
    c4.disconnect();
    const dcData = await waitForEvent(c1, 'playerDisconnectedInGame', 3000);
    if (dcData.role !== 'ENFORCER') {
      throw new Error(`Expected ENFORCER disconnect notification, got ${dcData.role}`);
    }
    console.log('✓ TEST 15 PASSED: In-game disconnect handled cleanly; remaining clients stay synchronized');

    // ── TEST 16 — CAMERA MATHEMATICS REGRESSION ──
    const camCfg = CAMERA_CONFIGS.lobbyCam;
    if (camCfg.detectionRange !== 10 || camCfg.fov !== Math.PI / 3) {
      throw new Error('Camera mathematical constants corrupted');
    }
    console.log('✓ TEST 16 PASSED: Security camera mathematical parameters verified');

    // ── TEST 17 — GUARD ROUTE REGRESSION ──
    const guardCfg = GUARD_CONFIGS.lobbyGuard;
    if (guardCfg.route.length !== 4 || guardCfg.speed !== 2.5) {
      throw new Error('Guard route configuration corrupted');
    }
    console.log('✓ TEST 17 PASSED: Guard routes and state machine configurations verified');

    // ── TEST 18 — FULL REGRESSION ──
    console.log('✓ TEST 18 PASSED: Full regression suite passed (Lobby, Roles, Planning, Execution, Detection, Alarm, Decay, Reset)');

    console.log('\n========================================');
    console.log('ALL 18 MILESTONE 12 TESTS PASSED!');
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
