/**
 * MultiplayerState.js
 * Client-side state container for multiplayer session data.
 */

export class MultiplayerState {
  constructor() {
    this.playerName = localStorage.getItem('heist_player_name') || '';
    this.roomCode = null;
    this.playerId = null;
    this.hostId = null;
    this.players = [];
    this.roomStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'LOBBY' | 'PLAYING'
    this.isConnected = false;
    this.lastError = null;
  }

  /**
   * Reset room session state.
   */
  resetRoom() {
    this.roomCode = null;
    this.hostId = null;
    this.players = [];
    this.roomStatus = this.isConnected ? 'CONNECTED' : 'DISCONNECTED';
  }

  /**
   * Update state from server room state object.
   * @param {Object} roomData
   */
  updateFromRoom(roomData) {
    if (!roomData) return;
    this.roomCode = roomData.roomCode || this.roomCode;
    this.hostId = roomData.hostId || this.hostId;
    this.players = roomData.players || [];
    this.roomStatus = roomData.status || this.roomStatus;
  }

  /**
   * Get the local player's data.
   * @returns {Object|null}
   */
  getLocalPlayer() {
    return this.players.find(p => p.id === this.playerId) || null;
  }

  /**
   * Check if the local client is the room host.
   * @returns {boolean}
   */
  isHost() {
    const local = this.getLocalPlayer();
    return Boolean(local && local.isHost);
  }

  /**
   * Get the local player's assigned role.
   * @returns {string|null}
   */
  getLocalRole() {
    const local = this.getLocalPlayer();
    return local ? local.role : null;
  }
}
