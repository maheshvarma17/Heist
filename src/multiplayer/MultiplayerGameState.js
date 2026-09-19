/**
 * MultiplayerGameState.js
 * Synchronizes crew movement, handles throttled updates, and interpolates remote players.
 */

import * as THREE from 'three';

const SYNC_INTERVAL = 0.08; // ~12.5 Hz update rate during active movement
const REMOTE_LERP_SPEED = 12.0; // Lerp factor for smooth interpolation
const ROTATION_SPEED = 8.0;
const ARRIVAL_THRESHOLD = 0.08;

// Tuning for procedural walk animation on remote characters
const WALK_ANIM_RATE = 8.0;
const LEG_SWING      = 0.30;
const ARM_SWING      = 0.18;
const BODY_SWAY      = 0.02;

export class MultiplayerGameState {
  /**
   * @param {import('../entities/Crew.js').Crew} crew
   * @param {import('../systems/MovementSystem.js').MovementSystem} movementSystem
   * @param {import('./MultiplayerClient.js').MultiplayerClient} client
   * @param {import('../entities/Guards.js').Guards} [guards]
   * @param {import('../entities/SecurityCameras.js').SecurityCameras} [securityCameras]
   */
  constructor(crew, movementSystem, client, guards = null, securityCameras = null) {
    this.crew = crew;
    this.movementSystem = movementSystem;
    this.client = client;
    this.guards = guards;
    this.securityCameras = securityCameras;

    this.localPlayerRole = null;
    this.localPlayerId = null;
    this.roomCode = null;

    /**
     * Remote crew states. Keyed by uppercase role ('THIEF', 'HACKER', etc.)
     * @type {Map<string, { targetPosition: THREE.Vector3, targetRotationY: number, state: string, connected: boolean }>}
     */
    this.remoteStates = new Map();

    /**
     * Remote guard states. Keyed by guardId ('lobbyGuard', 'vaultGuard', 'securityGuard')
     */
    this.remoteGuards = new Map();

    /**
     * Remote camera states. Keyed by cameraId ('lobbyCam', etc.)
     */
    this.remoteCameras = new Map();

    this.alarmState = { level: 0, state: 'NORMAL' };

    this._syncTimer = 0;
    this._lastSentPos = new THREE.Vector3();
    this._lastSentRotY = 0;
    this._lastSentState = 'IDLE';

    this._bindEvents();
  }

  /**
   * Configure player context from game start.
   * @param {Object} context
   */
  setPlayerContext(context = {}) {
    this.localPlayerRole = context.localPlayerRole ? context.localPlayerRole.toUpperCase() : null;
    this.localPlayerId = context.localPlayerId || null;
    this.roomCode = context.roomCode || null;

    const players = context.players || [];

    // Update 3D floating labels on all crew members
    for (const member of this.crew.members) {
      const roleUpper = member.role.toUpperCase();
      const player = players.find(p => p.role === roleUpper);
      const isLocal = Boolean(this.localPlayerRole && roleUpper === this.localPlayerRole);

      member.updatePlayerLabel(player ? player.name : member.name, isLocal);

      // Initialize remote state if not local
      if (!isLocal) {
        this.remoteStates.set(roleUpper, {
          targetPosition: member.group.position.clone(),
          targetRotationY: member.group.rotation.y,
          state: 'IDLE',
          connected: true,
        });
      }
    }

    console.log(`[MultiplayerGameState] Context configured. Local Role: ${this.localPlayerRole || 'ALL (Single Player)'}`);
  }

  /**
   * Check if a crew member is locally owned.
   * @param {string|import('../entities/CrewMember.js').CrewMember} memberOrRole
   * @returns {boolean}
   */
  isLocalOwned(memberOrRole) {
    if (!this.localPlayerRole) return true; // Single player mode owns all
    const role = typeof memberOrRole === 'string' ? memberOrRole : memberOrRole.role;
    return role.toUpperCase() === this.localPlayerRole;
  }

  // ─── Per-Frame Synchronization & Interpolation ──────────

  update(dt) {
    this._updateLocalSync(dt);
    this._updateRemoteInterpolation(dt);
    this._updateRemoteGuardInterpolation(dt);
  }

  /**
   * Throttled sender for local player's character.
   */
  _updateLocalSync(dt) {
    if (!this.localPlayerRole || !this.client || !this.client.state.isConnected) return;

    const localMember = this.crew.getByRole(this.localPlayerRole.toLowerCase());
    if (!localMember) return;

    const isMoving = this.movementSystem.isMoving(localMember);
    const currentState = isMoving ? 'MOVING' : 'IDLE';

    const currentPos = localMember.group.position;
    const currentRotY = localMember.group.rotation.y;

    const stateChanged = (currentState !== this._lastSentState);
    const moved = currentPos.distanceToSquared(this._lastSentPos) > 0.0004 || Math.abs(currentRotY - this._lastSentRotY) > 0.01;

    this._syncTimer += dt;

    // Send immediately if state changed (e.g. stopped moving), or on interval while active
    if (stateChanged || (isMoving && this._syncTimer >= SYNC_INTERVAL && moved)) {
      this._syncTimer = 0;
      this._lastSentPos.copy(currentPos);
      this._lastSentRotY = currentRotY;
      this._lastSentState = currentState;

      this.client.sendCrewMove({
        role: this.localPlayerRole,
        position: {
          x: Number(currentPos.x.toFixed(3)),
          y: Number(currentPos.y.toFixed(3)),
          z: Number(currentPos.z.toFixed(3)),
        },
        rotationY: Number(currentRotY.toFixed(3)),
        state: currentState,
      });
    }
  }

  /**
   * Smoothly interpolate position and limb animations for remote crew members.
   */
  _updateRemoteInterpolation(dt) {
    for (const [roleUpper, remote] of this.remoteStates) {
      const member = this.crew.getByRole(roleUpper.toLowerCase());
      if (!member) continue;

      const pos = member.group.position;
      const target = remote.targetPosition;

      // Distance to network target
      const dist = pos.distanceTo(target);

      if (dist > 0.01) {
        // Interpolate smoothly towards target
        pos.lerp(target, Math.min(1.0, dt * REMOTE_LERP_SPEED));
      } else {
        pos.copy(target);
      }

      // Smooth rotation interpolation
      let angleDiff = remote.targetRotationY - member.group.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (Math.abs(angleDiff) > 0.01) {
        const step = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), ROTATION_SPEED * dt);
        member.group.rotation.y += step;
      } else {
        member.group.rotation.y = remote.targetRotationY;
      }

      // Animate walking limbs for remote character
      if (dist > ARRIVAL_THRESHOLD || remote.state === 'MOVING') {
        this._animateRemoteWalk(member, dt);
      } else {
        this._resetRemoteWalk(member);
      }
    }
  }

  /**
   * Smoothly interpolate position and rotations for authoritative guards in multiplayer.
   */
  _updateRemoteGuardInterpolation(dt) {
    if (!this.guards) return;

    const GUARD_CONE_COLORS = {
      PATROL: 0x44ff44,
      INVESTIGATE: 0xff4444,
      RETURN: 0xffaa33,
    };

    for (const [guardId, remote] of this.remoteGuards) {
      let guard = null;
      if (guardId === 'lobbyGuard') guard = this.guards.lobbyGuard;
      else if (guardId === 'vaultGuard') guard = this.guards.vaultGuard;
      else if (guardId === 'securityGuard') guard = this.guards.securityGuard;

      if (!guard) continue;

      const pos = guard.group.position;
      const target = remote.targetPosition;
      const dist = pos.distanceTo(target);

      if (dist > 0.01) {
        pos.lerp(target, Math.min(1.0, dt * REMOTE_LERP_SPEED));
      } else {
        pos.copy(target);
      }

      let angleDiff = remote.targetRotationY - guard.group.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (Math.abs(angleDiff) > 0.01) {
        const step = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), ROTATION_SPEED * dt);
        guard.group.rotation.y += step;
      } else {
        guard.group.rotation.y = remote.targetRotationY;
      }

      // Update cone color to reflect state
      if (GUARD_CONE_COLORS[remote.state]) {
        guard.setConeColor(GUARD_CONE_COLORS[remote.state]);
      }

      // Procedural limb walk animation for guard
      if (dist > ARRIVAL_THRESHOLD) {
        this._animateRemoteWalk(guard, dt);
      } else {
        this._resetRemoteWalk(guard);
      }
    }
  }

  _animateRemoteWalk(character, dt) {
    if (character._remoteWalkPhase === undefined) character._remoteWalkPhase = 0;
    character._remoteWalkPhase += dt * (character.speed || 1.0) * WALK_ANIM_RATE;
    const p = character._remoteWalkPhase;

    const legAngle = Math.sin(p) * LEG_SWING;
    const armAngle = Math.sin(p) * ARM_SWING;
    const sway     = Math.sin(p * 0.5) * BODY_SWAY;

    const m = character.meshes;
    if (m.legL) m.legL.rotation.x =  legAngle;
    if (m.legR) m.legR.rotation.x = -legAngle;
    if (m.shoeL) m.shoeL.rotation.x =  legAngle * 0.5;
    if (m.shoeR) m.shoeR.rotation.x = -legAngle * 0.5;
    if (m.armL) m.armL.rotation.x = -armAngle;
    if (m.armR) m.armR.rotation.x =  armAngle;
    if (m.torso) m.torso.rotation.z = sway;
  }

  _resetRemoteWalk(character) {
    character._remoteWalkPhase = 0;
    const m = character.meshes;
    if (m.legL)  m.legL.rotation.x  = 0;
    if (m.legR)  m.legR.rotation.x  = 0;
    if (m.shoeL) m.shoeL.rotation.x = 0;
    if (m.shoeR) m.shoeR.rotation.x = 0;
    if (m.armL)  m.armL.rotation.x  = 0;
    if (m.armR)  m.armR.rotation.x  = 0;
    if (m.torso) m.torso.rotation.z = 0;
  }

  // ─── Socket Event Binding ───────────────────────────────

  _bindEvents() {
    this.client.on('crewMoved', (data) => {
      const roleUpper = data.role ? data.role.toUpperCase() : null;
      if (!roleUpper || roleUpper === this.localPlayerRole) return;

      let remote = this.remoteStates.get(roleUpper);
      if (!remote) {
        remote = {
          targetPosition: new THREE.Vector3(),
          targetRotationY: 0,
          state: 'IDLE',
          connected: true,
        };
        this.remoteStates.set(roleUpper, remote);
      }

      if (data.position) {
        remote.targetPosition.set(data.position.x, data.position.y, data.position.z);
      }
      if (typeof data.rotationY === 'number') {
        remote.targetRotationY = data.rotationY;
      }
      if (data.state) {
        remote.state = data.state;
      }
    });

    this.client.on('crewStateSnapshot', (data) => {
      const crewList = data.crew || [];
      for (const item of crewList) {
        const roleUpper = item.role ? item.role.toUpperCase() : null;
        if (!roleUpper) continue;

        if (roleUpper !== this.localPlayerRole) {
          let remote = this.remoteStates.get(roleUpper);
          if (!remote) {
            remote = {
              targetPosition: new THREE.Vector3(),
              targetRotationY: 0,
              state: 'IDLE',
              connected: true,
            };
            this.remoteStates.set(roleUpper, remote);
          }
          if (item.position) {
            remote.targetPosition.set(item.position.x, item.position.y, item.position.z);
            const member = this.crew.getByRole(roleUpper.toLowerCase());
            if (member) member.group.position.copy(remote.targetPosition);
          }
          if (typeof item.rotationY === 'number') {
            remote.targetRotationY = item.rotationY;
            const member = this.crew.getByRole(roleUpper.toLowerCase());
            if (member) member.group.rotation.y = item.rotationY;
          }
          remote.state = item.state || 'IDLE';
          remote.connected = item.connected !== false;
        }
      }
    });

    this.client.on('guardMoved', (data) => {
      const guardsList = data.guards || [];
      for (const g of guardsList) {
        let remote = this.remoteGuards.get(g.guardId);
        if (!remote) {
          remote = {
            targetPosition: new THREE.Vector3(g.position.x, g.position.y, g.position.z),
            targetRotationY: g.rotationY,
            state: g.state,
            targetPlayerId: g.targetPlayerId,
          };
          this.remoteGuards.set(g.guardId, remote);
        } else {
          remote.targetPosition.set(g.position.x, g.position.y, g.position.z);
          remote.targetRotationY = g.rotationY;
          remote.state = g.state;
          remote.targetPlayerId = g.targetPlayerId;
        }
      }
    });

    this.client.on('guardStateSnapshot', (data) => {
      const guardsList = data.guards || [];
      for (const g of guardsList) {
        let remote = this.remoteGuards.get(g.guardId);
        if (!remote) {
          remote = {
            targetPosition: new THREE.Vector3(g.position.x, g.position.y, g.position.z),
            targetRotationY: g.rotationY,
            state: g.state,
            targetPlayerId: g.targetPlayerId,
          };
          this.remoteGuards.set(g.guardId, remote);
        } else {
          remote.targetPosition.set(g.position.x, g.position.y, g.position.z);
          remote.targetRotationY = g.rotationY;
          remote.state = g.state;
          remote.targetPlayerId = g.targetPlayerId;
        }

        if (this.guards) {
          let guard = null;
          if (g.guardId === 'lobbyGuard') guard = this.guards.lobbyGuard;
          else if (g.guardId === 'vaultGuard') guard = this.guards.vaultGuard;
          else if (g.guardId === 'securityGuard') guard = this.guards.securityGuard;
          if (guard) {
            guard.group.position.set(g.position.x, g.position.y, g.position.z);
            guard.group.rotation.y = g.rotationY;
          }
        }
      }
    });

    this.client.on('cameraStateUpdated', (data) => {
      this.remoteCameras.set(data.cameraId, {
        state: data.state,
        detectedPlayerId: data.detectedPlayerId,
      });

      if (this.securityCameras) {
        let cam = null;
        if (data.cameraId === 'lobbyCam') cam = this.securityCameras.lobbyCam;
        else if (data.cameraId === 'hallwayCam') cam = this.securityCameras.hallwayCam;
        else if (data.cameraId === 'vaultCam') cam = this.securityCameras.vaultCam;
        else if (data.cameraId === 'securityCam') cam = this.securityCameras.securityCam;

        if (cam) {
          if (data.state === 'DETECTING') {
            cam.setConeColor(0xff4444); // red
            cam.setLEDColor(0xff0000);  // red
          } else if (data.state === 'ACTIVE') {
            cam.setConeColor(0x4488ff); // blue
            cam.setLEDColor(0x00ff44);  // green
          } else if (data.state === 'DISABLED') {
            cam.setConeColor(0x333333); // dark grey
            cam.setLEDColor(0x333333);
          }
        }
      }
    });

    this.client.on('alarmUpdated', (data) => {
      this.alarmState.level = data.level;
      this.alarmState.state = data.state;
    });

    this.client.on('playerDisconnectedInGame', (data) => {
      console.log(`[MultiplayerGameState] Player disconnected: ${data.playerName} (${data.role})`);
      const roleUpper = data.role ? data.role.toUpperCase() : null;
      if (roleUpper && this.remoteStates.has(roleUpper)) {
        this.remoteStates.get(roleUpper).connected = false;
        this.remoteStates.get(roleUpper).state = 'IDLE';
      }
    });
  }
}
