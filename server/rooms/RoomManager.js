/**
 * RoomManager.js
 * In-memory manager for multiplayer rooms, game sessions, and shared team planning.
 */

export const ROOM_STATUS = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
};

export const VALID_ROLES = ['THIEF', 'HACKER', 'DISTRACTOR', 'ENFORCER'];

export const VALID_CREW_STATES = ['IDLE', 'MOVING', 'WAITING', 'EXECUTING', 'COMPLETED'];

export const VALID_ACTION_TYPES = ['MOVE', 'WAIT'];

export const VALID_NAV_TARGETS = [
  'lobby',
  'vault',
  'securityRoom',
  'office',
  'hallway',
  'rooftop',
  'frontExit',
  'rooftopExit',
];

export const DEFAULT_SPAWN_POSITIONS = {
  THIEF:      { x: -4,   y: 0, z: 19.5 },
  HACKER:     { x: -1.5, y: 0, z: 19.5 },
  DISTRACTOR: { x: 1.5,  y: 0, z: 19.5 },
  ENFORCER:   { x: 4,    y: 0, z: 19.5 },
};

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
    hostPlayer.connected = true;

    const room = {
      code: roomCode,
      hostId: hostPlayer.id,
      status: ROOM_STATUS.WAITING,
      players: [hostPlayer],
      crewStates: {},
      teamPlan: {
        THIEF: [],
        HACKER: [],
        DISTRACTOR: [],
        ENFORCER: [],
      },
      planningReady: {},
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
    player.connected = true;
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
        removedPlayer.connected = false;

        if (room.status === ROOM_STATUS.PLAYING) {
          // If in active gameplay, mark disconnected in crew state and planning ready
          if (room.crewStates[removedPlayer.id]) {
            room.crewStates[removedPlayer.id].connected = false;
          }
          if (room.planningReady) {
            delete room.planningReady[removedPlayer.id];
          }
          // Remove from active players list
          room.players.splice(idx, 1);
        } else {
          // In lobby, clean up completely
          room.players.splice(idx, 1);
          removedPlayer.roomCode = null;
          removedPlayer.isHost = false;
          removedPlayer.role = null;
          removedPlayer.isReady = false;
        }

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
   * Set player ready status in lobby.
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
   * Validate and transition room to PLAYING, initializing crew states and team plan.
   * @param {string} roomCode
   * @param {string} requesterSocketId
   * @returns {{ success: boolean, room?: Object, error?: string, crewSnapshot?: Array, teamPlan?: Object }}
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

    // Initialize authoritative crew states
    room.crewStates = {};
    room.planningReady = {};
    room.teamPlan = {
      THIEF: [],
      HACKER: [],
      DISTRACTOR: [],
      ENFORCER: [],
    };

    for (const p of room.players) {
      const defaultPos = DEFAULT_SPAWN_POSITIONS[p.role] || { x: 0, y: 0, z: 0 };
      room.crewStates[p.id] = {
        playerId: p.id,
        playerName: p.name,
        role: p.role,
        position: { ...defaultPos },
        rotationY: 0,
        state: 'IDLE',
        connected: true,
      };
      room.planningReady[p.id] = false;
    }

    return {
      success: true,
      room,
      crewSnapshot: Object.values(room.crewStates),
      teamPlan: room.teamPlan,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SHARED TEAM PLANNING METHODS (Milestone 11)
  // ═══════════════════════════════════════════════════════════

  /**
   * Add an action to a player's role queue in the shared team plan.
   * @param {string} roomCode
   * @param {string} socketId
   * @param {{ role: string, action: Object }} data
   * @returns {{ success: boolean, teamPlan?: Object, planningReady?: Object, error?: string }}
   */
  addAction(roomCode, socketId, data = {}) {
    const room = this.getRoom(roomCode);
    if (!room) return { success: false, error: 'Room not found.' };
    if (room.status !== ROOM_STATUS.PLAYING) return { success: false, error: 'Game is not in planning phase.' };

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return { success: false, error: 'Player not found in room.' };

    const roleUpper = (data.role || '').toUpperCase();
    if (roleUpper !== player.role) {
      return { success: false, error: `Unauthorized: You can only add actions for your own role (${player.role}).` };
    }

    const action = data.action;
    if (!action || !VALID_ACTION_TYPES.includes(action.type)) {
      return { success: false, error: `Invalid action type. Allowed: ${VALID_ACTION_TYPES.join(', ')}` };
    }

    if (action.type === 'MOVE') {
      if (!action.target || !VALID_NAV_TARGETS.includes(action.target)) {
        return { success: false, error: `Invalid move destination. Target must be a valid room key.` };
      }
    } else if (action.type === 'WAIT') {
      const duration = Number(action.duration);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
        return { success: false, error: 'Wait duration must be between 1 and 60 seconds.' };
      }
    }

    const cleanAction = {
      id: action.id || `act_${Math.random().toString(36).substring(2, 9)}`,
      type: action.type,
      target: action.target || null,
      duration: action.type === 'WAIT' ? (Number(action.duration) || 2) : null,
      order: room.teamPlan[roleUpper].length,
    };

    room.teamPlan[roleUpper].push(cleanAction);
    room.planningReady[player.id] = false; // Modifying plan un-readies the player

    return {
      success: true,
      teamPlan: room.teamPlan,
      planningReady: room.planningReady,
      addedAction: cleanAction,
    };
  }

  /**
   * Remove an action from the player's role queue.
   * @param {string} roomCode
   * @param {string} socketId
   * @param {{ role: string, index?: number, actionId?: string }} data
   * @returns {{ success: boolean, teamPlan?: Object, planningReady?: Object, error?: string }}
   */
  removeAction(roomCode, socketId, data = {}) {
    const room = this.getRoom(roomCode);
    if (!room) return { success: false, error: 'Room not found.' };

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return { success: false, error: 'Player not found in room.' };

    const roleUpper = (data.role || '').toUpperCase();
    if (roleUpper !== player.role) {
      return { success: false, error: `Unauthorized: You can only remove actions from your own role (${player.role}).` };
    }

    const queue = room.teamPlan[roleUpper];
    if (!queue) return { success: false, error: 'Queue not found.' };

    let removeIdx = -1;
    if (typeof data.index === 'number' && data.index >= 0 && data.index < queue.length) {
      removeIdx = data.index;
    } else if (data.actionId) {
      removeIdx = queue.findIndex(a => a.id === data.actionId);
    }

    if (removeIdx === -1) {
      return { success: false, error: 'Action not found in queue.' };
    }

    queue.splice(removeIdx, 1);
    // Re-index orders
    queue.forEach((a, i) => { a.order = i; });

    room.planningReady[player.id] = false;

    return {
      success: true,
      teamPlan: room.teamPlan,
      planningReady: room.planningReady,
    };
  }

  /**
   * Clear all actions for a player's role queue.
   * @param {string} roomCode
   * @param {string} socketId
   * @param {{ role: string }} data
   * @returns {{ success: boolean, teamPlan?: Object, planningReady?: Object, error?: string }}
   */
  clearActions(roomCode, socketId, data = {}) {
    const room = this.getRoom(roomCode);
    if (!room) return { success: false, error: 'Room not found.' };

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return { success: false, error: 'Player not found in room.' };

    const roleUpper = (data.role || '').toUpperCase();
    if (roleUpper !== player.role) {
      return { success: false, error: `Unauthorized: You can only clear actions for your own role (${player.role}).` };
    }

    room.teamPlan[roleUpper] = [];
    room.planningReady[player.id] = false;

    return {
      success: true,
      teamPlan: room.teamPlan,
      planningReady: room.planningReady,
    };
  }

  /**
   * Set planning ready state for a player.
   * @param {string} roomCode
   * @param {string} socketId
   * @param {boolean} isReady
   * @returns {{ success: boolean, planningReady?: Object, error?: string }}
   */
  setPlanningReady(roomCode, socketId, isReady) {
    const room = this.getRoom(roomCode);
    if (!room) return { success: false, error: 'Room not found.' };

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return { success: false, error: 'Player not found in room.' };

    room.planningReady[player.id] = Boolean(isReady);

    return {
      success: true,
      playerId: player.id,
      isReady: Boolean(isReady),
      planningReady: room.planningReady,
    };
  }

  /**
   * Start execution of the shared team plan (Host only).
   * @param {string} roomCode
   * @param {string} socketId
   * @returns {{ success: boolean, teamPlan?: Object, error?: string }}
   */
  startExecution(roomCode, socketId) {
    const room = this.getRoom(roomCode);
    if (!room) return { success: false, error: 'Room not found.' };

    const host = room.players.find(p => p.socketId === socketId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Only the host can trigger heist execution.' };
    }

    // Check if there are planned actions across the team
    const totalActions = Object.values(room.teamPlan).reduce((acc, q) => acc + q.length, 0);
    if (totalActions === 0) {
      return { success: false, error: 'Cannot execute empty team plan. At least one action must be planned.' };
    }

    // Check if all connected players in the room are ready
    const allPlanningReady = room.players.every(p => !p.connected || room.planningReady[p.id]);
    if (!allPlanningReady) {
      return { success: false, error: 'All operatives must be READY before starting execution.' };
    }

    return {
      success: true,
      roomCode: room.code,
      teamPlan: room.teamPlan,
    };
  }

  /**
   * Retrieve the current team plan for a room.
   * @param {string} roomCode
   * @returns {Object|null}
   */
  getTeamPlan(roomCode) {
    const room = this.getRoom(roomCode);
    return room ? room.teamPlan : null;
  }

  /**
   * Update crew state with authoritative validation.
   * @param {string} roomCode
   * @param {string} socketId
   * @param {Object} data
   * @returns {{ success: boolean, crewState?: Object, error?: string }}
   */
  updateCrewState(roomCode, socketId, data = {}) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found.' };
    }

    if (room.status !== ROOM_STATUS.PLAYING) {
      return { success: false, error: 'Game is not currently active.' };
    }

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) {
      return { success: false, error: 'Player not authorized in this room.' };
    }

    // Role ownership validation
    if (data.role && data.role.toUpperCase() !== player.role) {
      return { success: false, error: `Unauthorized: You do not own role ${data.role}.` };
    }

    // Coordinate & rotation validation (must be finite numbers within map bounds)
    const pos = data.position;
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') {
      return { success: false, error: 'Invalid position coordinates.' };
    }

    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
      return { success: false, error: 'Coordinates must be finite numbers.' };
    }

    // Bound limits for playable area (generous bounds)
    if (pos.x < -30 || pos.x > 30 || pos.z < -40 || pos.z > 40 || pos.y < -5 || pos.y > 25) {
      return { success: false, error: 'Position is out of playable bounds.' };
    }

    const rotY = typeof data.rotationY === 'number' && Number.isFinite(data.rotationY) ? data.rotationY : 0;
    const state = VALID_CREW_STATES.includes(data.state) ? data.state : 'IDLE';

    // Update authoritative state
    const current = room.crewStates[player.id] || {
      playerId: player.id,
      playerName: player.name,
      role: player.role,
      connected: true,
    };

    current.position = { x: pos.x, y: pos.y, z: pos.z };
    current.rotationY = rotY;
    current.state = state;
    current.connected = true;

    room.crewStates[player.id] = current;

    return {
      success: true,
      crewState: current,
    };
  }

  /**
   * Get crew snapshot list for room.
   * @param {string} roomCode
   * @returns {Array|null}
   */
  getCrewSnapshot(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room || !room.crewStates) return null;
    return Object.values(room.crewStates);
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
      teamPlan: room.teamPlan,
      planningReady: room.planningReady,
    };
  }
}
