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

  leaveRoom() {
    this.socket.emit('leaveRoom');
    this.state.resetRoom();
    this._emitLocal('leftRoom', {});
  }
}
