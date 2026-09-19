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
    socket.emit('planningError', { message });
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
   * Handle: setReady (Lobby Ready)
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
   * Handle: startGame (Lobby -> Planning Phase)
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

    // Broadcast gameStarting to all players in the room along with crew snapshot & empty teamPlan
    io.to(res.room.code).emit('gameStarting', {
      roomCode: res.room.code,
      players: serialized.players,
      crew: res.crewSnapshot,
      teamPlan: res.teamPlan,
      guards: res.guards,
      cameras: res.cameras,
      alarm: res.alarm,
      vault: res.vault,
      loot: res.loot,
    });
  });

  // ═══════════════════════════════════════════════════════════
  // SHARED TEAM PLANNING EVENTS (Milestone 11)
  // ═══════════════════════════════════════════════════════════

  /**
   * Handle: addAction
   * Payload: { role: string, action: { type, target, duration } }
   */
  socket.on('addAction', (data = {}) => {
    if (!player.roomCode) return sendError('You are not in a room.');

    const res = roomManager.addAction(player.roomCode, socket.id, data);
    if (!res.success) {
      return sendError(res.error || 'Failed to add action to team plan.');
    }

    // Broadcast updated team plan & planning ready state to all players in the room
    io.to(player.roomCode).emit('teamPlanUpdated', {
      roomCode: player.roomCode,
      teamPlan: res.teamPlan,
      planningReady: res.planningReady,
      addedAction: res.addedAction,
      role: data.role.toUpperCase(),
    });
  });

  /**
   * Handle: removeAction
   * Payload: { role: string, index?: number, actionId?: string }
   */
  socket.on('removeAction', (data = {}) => {
    if (!player.roomCode) return sendError('You are not in a room.');

    const res = roomManager.removeAction(player.roomCode, socket.id, data);
    if (!res.success) {
      return sendError(res.error || 'Failed to remove action from team plan.');
    }

    io.to(player.roomCode).emit('teamPlanUpdated', {
      roomCode: player.roomCode,
      teamPlan: res.teamPlan,
      planningReady: res.planningReady,
      role: data.role.toUpperCase(),
    });
  });

  /**
   * Handle: clearActions
   * Payload: { role: string }
   */
  socket.on('clearActions', (data = {}) => {
    if (!player.roomCode) return sendError('You are not in a room.');

    const res = roomManager.clearActions(player.roomCode, socket.id, data);
    if (!res.success) {
      return sendError(res.error || 'Failed to clear role actions.');
    }

    io.to(player.roomCode).emit('teamPlanUpdated', {
      roomCode: player.roomCode,
      teamPlan: res.teamPlan,
      planningReady: res.planningReady,
      role: data.role.toUpperCase(),
    });
  });

  /**
   * Handle: setPlanningReady
   * Payload: { isReady: boolean }
   */
  socket.on('setPlanningReady', ({ isReady } = {}) => {
    if (!player.roomCode) return sendError('You are not in a room.');

    const res = roomManager.setPlanningReady(player.roomCode, socket.id, isReady);
    if (!res.success) {
      return sendError(res.error || 'Failed to set planning ready state.');
    }

    io.to(player.roomCode).emit('planningReadyUpdated', {
      roomCode: player.roomCode,
      playerId: res.playerId,
      isReady: res.isReady,
      planningReady: res.planningReady,
    });
  });

  /**
   * Handle: requestTeamPlan
   */
  socket.on('requestTeamPlan', () => {
    if (!player.roomCode) return sendError('You are not in a room.');

    const room = roomManager.getRoom(player.roomCode);
    if (room) {
      socket.emit('teamPlanSnapshot', {
        roomCode: room.code,
        teamPlan: room.teamPlan,
        planningReady: room.planningReady,
      });
    }
  });

  /**
   * Handle: startExecution (Planning -> Execution Phase)
   */
  socket.on('startExecution', () => {
    if (!player.roomCode) return sendError('You are not in a room.');

    const res = roomManager.startExecution(player.roomCode, socket.id);
    if (!res.success) {
      return sendError(res.error || 'Cannot start heist execution.');
    }

    console.log(`[Multiplayer] Starting synchronized heist execution in room ${res.roomCode}!`);

    // Broadcast executionStarting with final synchronized team plan & simulation states to all 4 clients
    io.to(res.roomCode).emit('executionStarting', {
      roomCode: res.roomCode,
      teamPlan: res.teamPlan,
      guards: res.guards,
      cameras: res.cameras,
      alarm: res.alarm,
      vault: res.vault,
      loot: res.loot,
    });

    io.to(res.roomCode).emit('guardStateSnapshot', {
      roomCode: res.roomCode,
      guards: res.guards,
    });

    io.to(res.roomCode).emit('cameraStateSnapshot', {
      roomCode: res.roomCode,
      cameras: res.cameras,
    });

    io.to(res.roomCode).emit('alarmStateSnapshot', {
      roomCode: res.roomCode,
      alarm: res.alarm,
    });

    io.to(res.roomCode).emit('vaultStateSnapshot', {
      roomCode: res.roomCode,
      vault: res.vault,
    });

    io.to(res.roomCode).emit('lootStateSnapshot', {
      roomCode: res.roomCode,
      loot: res.loot,
    });
  });

  // ═══════════════════════════════════════════════════════════
  // NETWORKED GUARDS, CAMERAS & ALARM (Milestone 12)
  // ═══════════════════════════════════════════════════════════

  /**
   * Handle: requestGuardState
   */
  socket.on('requestGuardState', () => {
    if (!player.roomCode) return sendError('You are not in a room.');
    socket.emit('guardStateSnapshot', {
      roomCode: player.roomCode,
      guards: roomManager.getGuardSnapshot(player.roomCode),
    });
  });

  /**
   * Handle: requestCameraState
   */
  socket.on('requestCameraState', () => {
    if (!player.roomCode) return sendError('You are not in a room.');
    socket.emit('cameraStateSnapshot', {
      roomCode: player.roomCode,
      cameras: roomManager.getCameraSnapshot(player.roomCode),
    });
  });

  /**
   * Handle: requestAlarmState
   */
  socket.on('requestAlarmState', () => {
    if (!player.roomCode) return sendError('You are not in a room.');
    socket.emit('alarmStateSnapshot', {
      roomCode: player.roomCode,
      alarm: roomManager.getAlarmSnapshot(player.roomCode),
    });
  });

  // ═══════════════════════════════════════════════════════════
  // VAULT & LOOT EVENTS (Milestone 13)
  // ═══════════════════════════════════════════════════════════

  /**
   * Handle: requestVaultOpen
   */
  socket.on('requestVaultOpen', () => {
    if (!player.roomCode) return socket.emit('vaultError', { message: 'You are not in a room.' });

    const res = roomManager.requestVaultOpen(player.roomCode, socket.id);
    if (!res.success) {
      return socket.emit('vaultError', { message: res.error || 'Failed to open vault.' });
    }

    console.log(`[Multiplayer] Vault opening started by ${player.name} (${player.role}) in room ${player.roomCode}`);
    io.to(player.roomCode).emit('vaultOpeningStarted', {
      roomCode: player.roomCode,
      openedBy: player.name,
      role: player.role,
      playerName: player.name,
      vault: res.vault,
    });
    io.to(player.roomCode).emit('vaultStateUpdated', {
      roomCode: player.roomCode,
      state: res.vault.state,
      progress: res.vault.progress,
      openedBy: res.vault.openedBy,
      openedByRole: res.vault.openedByRole,
    });
  });

  /**
   * Handle: cancelVaultOpen
   */
  socket.on('cancelVaultOpen', () => {
    if (!player.roomCode) return socket.emit('vaultError', { message: 'You are not in a room.' });

    const res = roomManager.cancelVaultOpen(player.roomCode, socket.id, 'Cancelled by player');
    if (res.success) {
      io.to(player.roomCode).emit('vaultOpeningCancelled', {
        roomCode: player.roomCode,
        reason: res.reason,
        vault: res.vault,
      });
      io.to(player.roomCode).emit('vaultStateUpdated', {
        roomCode: player.roomCode,
        state: res.vault.state,
        progress: res.vault.progress,
        openedBy: null,
        openedByRole: null,
      });
    }
  });

  /**
   * Handle: requestVaultState
   */
  socket.on('requestVaultState', () => {
    if (!player.roomCode) return socket.emit('vaultError', { message: 'You are not in a room.' });
    socket.emit('vaultStateSnapshot', {
      roomCode: player.roomCode,
      vault: roomManager.getVaultSnapshot(player.roomCode),
    });
  });

  /**
   * Handle: requestLootState
   */
  socket.on('requestLootState', () => {
    if (!player.roomCode) return socket.emit('lootError', { message: 'You are not in a room.' });
    socket.emit('lootStateSnapshot', {
      roomCode: player.roomCode,
      loot: roomManager.getLootSnapshot(player.roomCode),
    });
  });

  /**
   * Handle: collectLoot
   * Payload: { lootId: string }
   */
  socket.on('collectLoot', ({ lootId } = {}) => {
    if (!player.roomCode) return socket.emit('lootError', { message: 'You are not in a room.' });

    const res = roomManager.collectLoot(player.roomCode, socket.id, lootId);
    if (!res.success) {
      return socket.emit('lootError', { message: res.error || 'Failed to collect loot.' });
    }

    console.log(`[Multiplayer] Loot ${res.lootId} (${res.type}) collected by ${player.name} in room ${player.roomCode}`);
    io.to(player.roomCode).emit('lootCollected', {
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

  /**
   * Handle: resetSimulation (Plan Again)
   */
  socket.on('resetSimulation', () => {
    if (!player.roomCode) return sendError('You are not in a room.');
    const res = roomManager.resetSimulation(player.roomCode);
    if (res) {
      io.to(player.roomCode).emit('alarmUpdated', {
        level: 0,
        state: 'NORMAL',
        source: 'RESET',
      });
      io.to(player.roomCode).emit('guardStateSnapshot', {
        roomCode: player.roomCode,
        guards: res.guards,
      });
      io.to(player.roomCode).emit('cameraStateSnapshot', {
        roomCode: player.roomCode,
        cameras: res.cameras,
      });
      io.to(player.roomCode).emit('vaultStateSnapshot', {
        roomCode: player.roomCode,
        vault: res.vault,
      });
      io.to(player.roomCode).emit('lootStateSnapshot', {
        roomCode: player.roomCode,
        loot: res.loot,
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // CREW MOVEMENT EVENTS (Milestone 10)
  // ═══════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════
// 20 HZ AUTHORITATIVE ROOM SIMULATION TICK LOOP (Milestone 12)
// ═════════════════════════════════════════════════════════════
const SIM_TICK_RATE_HZ = 20;
const SIM_TICK_INTERVAL_MS = 1000 / SIM_TICK_RATE_HZ; // 50ms
const DT = 1 / SIM_TICK_RATE_HZ;                      // 0.05s

setInterval(() => {
  for (const [code, room] of roomManager.rooms.entries()) {
    if (room.status === ROOM_STATUS.PLAYING && room.simulationActive) {
      const sim = roomManager.updateSimulation(room, DT);

      if (sim.guardUpdates && sim.guardUpdates.length > 0) {
        io.to(code).emit('guardMoved', { roomCode: code, guards: sim.guardUpdates });
      }

      for (const evt of sim.guardEvents) {
        io.to(code).emit('guardDetected', evt);
      }

      for (const evt of sim.cameraEvents) {
        io.to(code).emit('cameraDetected', evt);
      }

      for (const evt of sim.cameraStateEvents) {
        io.to(code).emit('cameraStateUpdated', evt);
      }

      if (sim.alarmEvent) {
        io.to(code).emit('alarmUpdated', sim.alarmEvent);
      }

      if (sim.vaultCancelledEvent) {
        io.to(code).emit('vaultOpeningCancelled', sim.vaultCancelledEvent);
        io.to(code).emit('vaultStateUpdated', {
          roomCode: code,
          state: sim.vaultCancelledEvent.vault.state,
          progress: sim.vaultCancelledEvent.vault.progress,
          openedBy: null,
          openedByRole: null,
        });
      }

      if (sim.vaultOpenedEvent) {
        io.to(code).emit('vaultOpened', sim.vaultOpenedEvent);
        io.to(code).emit('vaultStateUpdated', {
          roomCode: code,
          state: 'OPEN',
          progress: 100,
          openedBy: sim.vaultOpenedEvent.openedBy,
          openedByRole: sim.vaultOpenedEvent.openedByRole,
        });
        io.to(code).emit('lootSpawned', {
          roomCode: code,
          loot: sim.vaultOpenedEvent.loot,
        });
      } else if (sim.vaultEvent) {
        io.to(code).emit('vaultStateUpdated', sim.vaultEvent);
      }
    }
  }
}, SIM_TICK_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`[HEIST Server] Multiplayer Socket.IO server running on http://localhost:${PORT}`);
});
