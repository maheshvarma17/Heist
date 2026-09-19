/**
 * PlayerManager.js
 * In-memory manager for connected player states.
 */

export class PlayerManager {
  constructor() {
    /** @type {Map<string, Object>} socketId -> player */
    this.players = new Map();
  }

  /**
   * Create or register a player by socket ID.
   * @param {string} socketId
   * @param {string} [name='Anonymous']
   * @returns {Object}
   */
  createPlayer(socketId, name = 'Player') {
    const id = `p_${Math.random().toString(36).substring(2, 9)}`;
    const player = {
      id,
      socketId,
      name: (name || 'Player').trim().substring(0, 20),
      role: null,
      isHost: false,
      isReady: false,
      connected: true,
      roomCode: null,
    };
    this.players.set(socketId, player);
    return player;
  }

  /**
   * Retrieve player by socket ID.
   * @param {string} socketId
   * @returns {Object|null}
   */
  getPlayer(socketId) {
    return this.players.get(socketId) || null;
  }

  /**
   * Update player display name.
   * @param {string} socketId
   * @param {string} name
   * @returns {Object|null}
   */
  setName(socketId, name) {
    const player = this.getPlayer(socketId);
    if (player && name) {
      player.name = name.trim().substring(0, 20) || player.name;
    }
    return player;
  }

  /**
   * Set player role.
   * @param {string} socketId
   * @param {string|null} role
   * @returns {Object|null}
   */
  setRole(socketId, role) {
    const player = this.getPlayer(socketId);
    if (player) {
      player.role = role;
    }
    return player;
  }

  /**
   * Set player ready state.
   * @param {string} socketId
   * @param {boolean} isReady
   * @returns {Object|null}
   */
  setReady(socketId, isReady) {
    const player = this.getPlayer(socketId);
    if (player) {
      player.isReady = Boolean(isReady);
    }
    return player;
  }

  /**
   * Remove player by socket ID.
   * @param {string} socketId
   * @returns {Object|null}
   */
  removePlayer(socketId) {
    const player = this.getPlayer(socketId);
    if (player) {
      this.players.delete(socketId);
    }
    return player;
  }
}
