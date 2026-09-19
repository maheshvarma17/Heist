/**
 * RoomManager.js
 * In-memory manager for multiplayer rooms and game sessions.
 */

export const ROOM_STATUS = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
};

export const VALID_ROLES = ['THIEF', 'HACKER', 'DISTRACTOR', 'ENFORCER'];

export class RoomManager {
  constructor() {
    /** @type {Map<string, Object>} roomCode -> room */
    this.rooms = new Map();
  }

  /**
   * Generate a unique 5-character alphanumeric room code.
   * @returns {string}
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous chars like 0/O, 1/I
    let code = '';
    let attempts = 0;
    do {
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
    } while (this.rooms.has(code) && attempts < 100);
    return code;
  }

  /**
   * Create a new room with host player.
   * @param {Object} hostPlayer
   * @returns {Object}
   */
  createRoom(hostPlayer) {
    const roomCode = this.generateRoomCode();
    hostPlayer.isHost = true;
    hostPlayer.isReady = false;
    hostPlayer.roomCode = roomCode;
    hostPlayer.role = null;

    const room = {
      code: roomCode,
      hostId: hostPlayer.id,
      status: ROOM_STATUS.WAITING,
      players: [hostPlayer],
      createdAt: Date.now(),
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  /**
   * Retrieve room by code (case-insensitive).
   * @param {string} roomCode
   * @returns {Object|null}
   */
  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(roomCode.trim().toUpperCase()) || null;
  }

  /**
   * Check if a room is full (max 4 players).
   * @param {string} roomCode
   * @returns {boolean}
   */
  isRoomFull(roomCode) {
    const room = this.getRoom(roomCode);
    return room ? room.players.length >= 4 : true;
  }

  /**
   * Get player count in a room.
   * @param {string} roomCode
   * @returns {number}
   */
  getRoomPlayerCount(roomCode) {
    const room = this.getRoom(roomCode);
    return room ? room.players.length : 0;
  }

  /**
   * Add a player to an existing room.
   * @param {string} roomCode
   * @param {Object} player
   * @returns {{ success: boolean, room?: Object, error?: string }}
   */
  joinRoom(roomCode, player) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found.' };
    }

    if (room.status === ROOM_STATUS.PLAYING) {
      return { success: false, error: 'The game has already started.' };
    }

    if (room.players.length >= 4) {
      return { success: false, error: 'Room is full.' };
    }

    // Check if already in room
    const existingIndex = room.players.findIndex(p => p.socketId === player.socketId);
    if (existingIndex >= 0) {
      return { success: true, room };
    }

    player.isHost = false;
    player.isReady = false;
    player.role = null;
    player.roomCode = room.code;

    room.players.push(player);
    return { success: true, room };
  }

  /**
   * Remove a player from their current room by socket ID.
   * @param {string} socketId
   * @returns {{ room: Object|null, player: Object|null, roomDeleted: boolean, newHost: Object|null }}
   */
  leaveRoom(socketId) {
    let affectedRoom = null;
    let removedPlayer = null;
    let roomDeleted = false;
    let newHost = null;

    for (const [code, room] of this.rooms.entries()) {
      const idx = room.players.findIndex(p => p.socketId === socketId);
      if (idx !== -1) {
        affectedRoom = room;
        removedPlayer = room.players[idx];
        room.players.splice(idx, 1);
        removedPlayer.roomCode = null;
        removedPlayer.isHost = false;
        removedPlayer.role = null;
        removedPlayer.isReady = false;

        if (room.players.length === 0) {
          this.rooms.delete(code);
          roomDeleted = true;
        } else {
          // If the leaving player was the host, promote the next player to host
          if (removedPlayer.id === room.hostId) {
            room.players[0].isHost = true;
            room.hostId = room.players[0].id;
            newHost = room.players[0];
          }
        }
        break;
      }
    }

    return { room: affectedRoom, player: removedPlayer, roomDeleted, newHost };
  }

  /**
   * Assign a role to a player in a room with authoritative checks.
   * @param {string} roomCode
   * @param {string} requesterSocketId
   * @param {string} targetPlayerId
   * @param {string} role
   * @returns {{ success: boolean, room?: Object, error?: string }}
   */
  assignRole(roomCode, requesterSocketId, targetPlayerId, role) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found.' };
    }

    const host = room.players.find(p => p.socketId === requesterSocketId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Only the host can perform this action.' };
    }

    if (role !== null && !VALID_ROLES.includes(role)) {
      return { success: false, error: 'Invalid role.' };
    }

    const targetPlayer = room.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      return { success: false, error: 'Target player not found in room.' };
    }

    if (role !== null) {
      // Ensure no other player in the room has this role
      const roleOccupied = room.players.some(p => p.id !== targetPlayerId && p.role === role);
      if (roleOccupied) {
        return { success: false, error: 'That role is already assigned.' };
      }
    }

    targetPlayer.role = role;
    return { success: true, room };
  }

  /**
   * Set player ready status.
   * @param {string} roomCode
   * @param {string} socketId
   * @param {boolean} isReady
   * @returns {{ success: boolean, room?: Object, error?: string }}
   */
  setReady(roomCode, socketId, isReady) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found.' };
    }

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) {
      return { success: false, error: 'Player not in room.' };
    }

    player.isReady = Boolean(isReady);
    return { success: true, room };
  }

  /**
   * Validate and transition room to PLAYING.
   * @param {string} roomCode
   * @param {string} requesterSocketId
   * @returns {{ success: boolean, room?: Object, error?: string }}
   */
  startGame(roomCode, requesterSocketId) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found.' };
    }

    const host = room.players.find(p => p.socketId === requesterSocketId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Only the host can start the heist.' };
    }

    if (room.status !== ROOM_STATUS.WAITING) {
      return { success: false, error: 'The game has already started.' };
    }

    if (room.players.length !== 4) {
      return { success: false, error: 'Exactly 4 players are required to start the heist.' };
    }

    const assignedRoles = room.players.map(p => p.role).filter(Boolean);
    const uniqueRoles = new Set(assignedRoles);

    if (assignedRoles.length !== 4 || uniqueRoles.size !== 4) {
      return { success: false, error: 'All 4 unique roles must be assigned before starting.' };
    }

    const allReady = room.players.every(p => p.isReady);
    if (!allReady) {
      return { success: false, error: 'All players must be READY to start.' };
    }

    room.status = ROOM_STATUS.PLAYING;
    return { success: true, room };
  }

  /**
   * Delete room by code.
   * @param {string} roomCode
   */
  removeRoom(roomCode) {
    if (roomCode) {
      this.rooms.delete(roomCode.trim().toUpperCase());
    }
  }

  /**
   * Formats a clean public room payload for clients.
   * @param {Object} room
   * @returns {Object}
   */
  serializeRoom(room) {
    if (!room) return null;
    return {
      roomCode: room.code,
      hostId: room.hostId,
      status: room.status,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        isHost: p.isHost,
        isReady: p.isReady,
      })),
    };
  }
}
