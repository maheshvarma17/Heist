/**
 * MultiplayerClient.js
 * Client network manager wrapping Socket.IO connection and events.
 */

import { io } from 'socket.io-client';
import { MultiplayerState } from './MultiplayerState.js';

export class MultiplayerClient {
  /**
   * @param {string} [serverUrl]
   */
  constructor(serverUrl) {
    this.serverUrl = serverUrl || this._getDefaultServerUrl();
    this.state = new MultiplayerState();
    this.socket = null;
    this._listeners = new Map();

    this._initSocket();
  }

  _getDefaultServerUrl() {
    const hostname = window.location.hostname || 'localhost';
    // If running in development with Vite on :3000, server runs on :3001
    return `http://${hostname}:3001`;
  }

  _initSocket() {
    this.socket = io(this.serverUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log(`[Multiplayer] Connected to server: ${this.socket.id}`);
      this.state.isConnected = true;
      this._emitLocal('connect', { socketId: this.socket.id });
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[Multiplayer] Disconnected: ${reason}`);
      this.state.isConnected = false;
      this._emitLocal('disconnect', { reason });
    });

    this.socket.on('connect_error', (err) => {
      console.warn(`[Multiplayer] Connection error:`, err.message);
      this._emitLocal('connect_error', { error: err.message });
    });

    this.socket.on('roomCreated', (data) => {
      this.state.playerId = data.player.id;
      this.state.roomCode = data.roomCode;
      this.state.updateFromRoom(data.room);
      this._emitLocal('roomCreated', data);
    });

    this.socket.on('roomJoined', (data) => {
      this.state.playerId = data.player.id;
      this.state.roomCode = data.roomCode;
      this.state.updateFromRoom(data.room);
      this._emitLocal('roomJoined', data);
    });

    this.socket.on('roomState', (room) => {
      this.state.updateFromRoom(room);
      this._emitLocal('roomState', room);
    });

    this.socket.on('playerJoined', (data) => {
      this.state.updateFromRoom(data.room);
      this._emitLocal('playerJoined', data);
    });

    this.socket.on('playerLeft', (data) => {
      this.state.updateFromRoom(data.room);
      this._emitLocal('playerLeft', data);
    });

    this.socket.on('roleUpdated', (data) => {
      this.state.updateFromRoom(data.room);
      this._emitLocal('roleUpdated', data);
    });

    this.socket.on('readyUpdated', (data) => {
      this.state.updateFromRoom(data.room);
      this._emitLocal('readyUpdated', data);
    });

    this.socket.on('gameStarting', (data) => {
      this.state.roomStatus = 'PLAYING';
      this._emitLocal('gameStarting', data);
    });

    this.socket.on('crewMoved', (data) => {
      this._emitLocal('crewMoved', data);
    });

    this.socket.on('crewStateSnapshot', (data) => {
      this._emitLocal('crewStateSnapshot', data);
    });

    this.socket.on('playerDisconnectedInGame', (data) => {
      this._emitLocal('playerDisconnectedInGame', data);
    });

    this.socket.on('teamPlanUpdated', (data) => {
      this._emitLocal('teamPlanUpdated', data);
    });

    this.socket.on('teamPlanSnapshot', (data) => {
      this._emitLocal('teamPlanSnapshot', data);
    });

    this.socket.on('planningReadyUpdated', (data) => {
      this._emitLocal('planningReadyUpdated', data);
    });

    this.socket.on('executionStarting', (data) => {
      this._emitLocal('executionStarting', data);
    });

    this.socket.on('guardMoved', (data) => {
      this._emitLocal('guardMoved', data);
    });

    this.socket.on('guardStateSnapshot', (data) => {
      this._emitLocal('guardStateSnapshot', data);
    });

    this.socket.on('guardDetected', (data) => {
      this._emitLocal('guardDetected', data);
    });

    this.socket.on('cameraStateSnapshot', (data) => {
      this._emitLocal('cameraStateSnapshot', data);
    });

    this.socket.on('cameraStateUpdated', (data) => {
      this._emitLocal('cameraStateUpdated', data);
    });

    this.socket.on('cameraDetected', (data) => {
      this._emitLocal('cameraDetected', data);
    });

    this.socket.on('alarmUpdated', (data) => {
      this._emitLocal('alarmUpdated', data);
    });

    this.socket.on('alarmStateSnapshot', (data) => {
      this._emitLocal('alarmStateSnapshot', data);
    });

    // ─── Vault & Loot Events (Milestone 13) ───────────────

    this.socket.on('vaultOpeningStarted', (data) => {
      this._emitLocal('vaultOpeningStarted', data);
    });

    this.socket.on('vaultStateUpdated', (data) => {
      this._emitLocal('vaultStateUpdated', data);
    });

    this.socket.on('vaultOpened', (data) => {
      this._emitLocal('vaultOpened', data);
    });

    this.socket.on('vaultOpeningCancelled', (data) => {
      this._emitLocal('vaultOpeningCancelled', data);
    });

    this.socket.on('vaultStateSnapshot', (data) => {
      this._emitLocal('vaultStateSnapshot', data);
    });

    this.socket.on('vaultError', (data) => {
      this.state.lastError = data.message;
      this._emitLocal('vaultError', data);
    });

    this.socket.on('lootSpawned', (data) => {
      this._emitLocal('lootSpawned', data);
    });

    this.socket.on('lootCollected', (data) => {
      this._emitLocal('lootCollected', data);
    });

    this.socket.on('lootStateSnapshot', (data) => {
      this._emitLocal('lootStateSnapshot', data);
    });

    this.socket.on('lootError', (data) => {
      this.state.lastError = data.message;
      this._emitLocal('lootError', data);
    });

    // ─── Escape System Events (Milestone 14) ──────────────
    this.socket.on('escapeAvailable', (data) => {
      this._emitLocal('escapeAvailable', data);
    });

    this.socket.on('escapeStarted', (data) => {
      this._emitLocal('escapeStarted', data);
    });

    this.socket.on('playerEscaped', (data) => {
      this._emitLocal('playerEscaped', data);
    });

    this.socket.on('escapeCancelled', (data) => {
      this._emitLocal('escapeCancelled', data);
    });

    this.socket.on('escapeProgress', (data) => {
      this._emitLocal('escapeProgress', data);
    });

    this.socket.on('escapeStateSnapshot', (data) => {
      this._emitLocal('escapeStateSnapshot', data);
    });

    this.socket.on('escapeError', (data) => {
      this.state.lastError = data.message;
      this._emitLocal('escapeError', data);
    });

    // ─── Heist Outcome & Final Result (Milestone 15) ───────
    this.socket.on('heistCompleted', (data) => {
      this._emitLocal('heistCompleted', data);
    });

    this.socket.on('finalResultSnapshot', (data) => {
      this._emitLocal('finalResultSnapshot', data);
    });

    this.socket.on('planAgainReady', (data) => {
      this._emitLocal('planAgainReady', data);
    });

    this.socket.on('planningError', (data) => {
      this._emitLocal('planningError', data);
    });

    this.socket.on('errorMessage', (data) => {
      this.state.lastError = data.message;
      this._emitLocal('errorMessage', data);
    });
  }

  // ─── Event Subscription ─────────────────────────────────

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback);
    }
  }

  _emitLocal(event, data) {
    if (this._listeners.has(event)) {
      for (const cb of this._listeners.get(event)) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[Multiplayer] Error in handler for ${event}:`, err);
        }
      }
    }
  }

  // ─── Actions ────────────────────────────────────────────

  createRoom(name) {
    this.state.playerName = name;
    localStorage.setItem('heist_player_name', name);
    this.socket.emit('createRoom', { name });
  }

  joinRoom(name, roomCode) {
    this.state.playerName = name;
    localStorage.setItem('heist_player_name', name);
    this.socket.emit('joinRoom', { name, roomCode });
  }

  assignRole(targetPlayerId, role) {
    this.socket.emit('assignRole', { targetPlayerId, role });
  }

  setReady(isReady) {
    this.socket.emit('setReady', { isReady });
  }

  startGame() {
    this.socket.emit('startGame');
  }

  sendCrewMove(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('crewMove', data);
    }
  }

  requestCrewState() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('crewStateRequest');
    }
  }

  // ─── Planning Actions (Milestone 11) ────────────────────

  addAction(role, action) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('addAction', { role, action });
    }
  }

  removeAction(role, index, actionId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('removeAction', { role, index, actionId });
    }
  }

  clearActions(role) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('clearActions', { role });
    }
  }

  setPlanningReady(isReady) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('setPlanningReady', { isReady });
    }
  }

  requestTeamPlan() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestTeamPlan');
    }
  }

  startExecution() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('startExecution');
    }
  }

  // ─── Guard, Camera & Alarm Requests (Milestone 12) ─────

  requestGuardState() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestGuardState');
    }
  }

  requestCameraState() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestCameraState');
    }
  }

  requestAlarmState() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestAlarmState');
    }
  }

  // ─── Vault & Loot Requests (Milestone 13) ───────────────

  requestVaultOpen() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestVaultOpen');
    }
  }

  cancelVaultOpen() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('cancelVaultOpen');
    }
  }

  requestVaultState() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestVaultState');
    }
  }

  requestLootState() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestLootState');
    }
  }

  collectLoot(lootId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('collectLoot', { lootId });
    }
  }

  resetSimulation() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('resetSimulation');
    }
  }

  // ─── Escape System Requests (Milestone 14) ──────────────

  requestEscape(routeId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestEscape', { routeId });
    }
  }

  cancelEscape() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('cancelEscape');
    }
  }

  requestEscapeState() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestEscapeState');
    }
  }

  // ─── Outcome & Replay Requests (Milestone 15) ───────────

  concludeHeist(reason = 'TIMEOUT') {
    if (this.socket && this.socket.connected) {
      this.socket.emit('concludeHeist', { reason });
    }
  }

  requestFinalResult() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('requestFinalResult');
    }
  }

  planAgain() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('planAgain');
    }
  }

  leaveRoom() {
    this.socket.emit('leaveRoom');
    this.state.resetRoom();
    this._emitLocal('leftRoom', {});
  }
}
