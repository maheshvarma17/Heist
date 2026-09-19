/**
 * VaultSystem.js
 * Manages vault state, player proximity interaction checks,
 * and procedural 3D door opening animation.
 */

import * as THREE from 'three';

export const VAULT_STATES = {
  LOCKED: 'LOCKED',
  OPENING: 'OPENING',
  OPEN: 'OPEN',
};

export const VAULT_INTERACTION_RADIUS = 3.0;
export const VAULT_ENTRANCE_POSITION = { x: 0, y: 0, z: 10 };
export const VAULT_ALLOWED_ROLES = ['THIEF', 'HACKER'];

export class VaultSystem {
  /**
   * @param {Object} [options={}]
   * @param {THREE.Group} [options.vaultDoorGroup]
   * @param {THREE.Mesh} [options.vaultWheelMesh]
   * @param {Function} [options.onStateChange]
   */
  constructor(options = {}) {
    this.vaultDoorGroup = options.vaultDoorGroup || null;
    this.vaultWheelMesh = options.vaultWheelMesh || null;
    this.onStateChange = options.onStateChange || null;

    this.state = VAULT_STATES.LOCKED;
    this.progress = 0;
    this.openedBy = null;
    this.openedByRole = null;

    // Visual animation angles
    this.currentDoorAngle = 0;
    this.targetDoorAngle = 0;
    this.wheelRotationSpeed = 0;
  }

  /**
   * Set Bank mesh references for door animation.
   * @param {THREE.Group} doorGroup
   * @param {THREE.Mesh} wheelMesh
   */
  setBankDoorRefs(doorGroup, wheelMesh) {
    this.vaultDoorGroup = doorGroup;
    this.vaultWheelMesh = wheelMesh;
  }

  /**
   * Update vault state authoritatively from server or local event.
   * @param {string} state
   * @param {number} [progress=0]
   * @param {string} [openedBy=null]
   * @param {string} [openedByRole=null]
   */
  setState(state, progress = 0, openedBy = null, openedByRole = null) {
    const prevState = this.state;
    this.state = state || VAULT_STATES.LOCKED;
    this.progress = typeof progress === 'number' ? progress : 0;
    this.openedBy = openedBy;
    this.openedByRole = openedByRole;

    if (this.state === VAULT_STATES.OPEN) {
      this.targetDoorAngle = -Math.PI / 2; // swing open 90°
      this.progress = 100;
    } else if (this.state === VAULT_STATES.OPENING) {
      this.targetDoorAngle = -Math.PI * 0.05 * (this.progress / 100); // slight give
    } else {
      this.targetDoorAngle = 0; // tightly closed
      this.progress = 0;
    }

    if (prevState !== this.state && this.onStateChange) {
      this.onStateChange({
        state: this.state,
        progress: this.progress,
        openedBy: this.openedBy,
        openedByRole: this.openedByRole,
      });
    }
  }

  /**
   * Check if local player is close enough and authorized to open the vault.
   * @param {string} role
   * @param {{ x: number, y: number, z: number }} position
   * @returns {{ isNear: boolean, canOpen: boolean, promptText: string|null }}
   */
  checkInteraction(role, position) {
    if (!position) {
      return { isNear: false, canOpen: false, promptText: null };
    }

    const dx = position.x - VAULT_ENTRANCE_POSITION.x;
    const dz = position.z - VAULT_ENTRANCE_POSITION.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const isNear = dist <= VAULT_INTERACTION_RADIUS;

    if (!isNear) {
      return { isNear: false, canOpen: false, promptText: null };
    }

    const roleUpper = (role || '').toUpperCase();
    const isAuthorizedRole = VAULT_ALLOWED_ROLES.includes(roleUpper);

    if (this.state === VAULT_STATES.OPEN) {
      return {
        isNear: true,
        canOpen: false,
        promptText: 'VAULT OPEN',
      };
    }

    if (this.state === VAULT_STATES.OPENING) {
      return {
        isNear: true,
        canOpen: false,
        promptText: `OPENING VAULT (${this.progress}%)`,
      };
    }

    // State is LOCKED
    if (!isAuthorizedRole) {
      return {
        isNear: true,
        canOpen: false,
        promptText: 'VAULT LOCKED (Thief or Hacker required)',
      };
    }

    return {
      isNear: true,
      canOpen: true,
      promptText: 'VAULT LOCKED — [E] OPEN VAULT',
    };
  }

  /**
   * Tick visual animations for the door and turning wheel.
   * @param {number} dt
   */
  update(dt) {
    // Interpolate door angle smoothly
    if (this.vaultDoorGroup) {
      const lerpFactor = Math.min(1, dt * 4.0);
      this.currentDoorAngle += (this.targetDoorAngle - this.currentDoorAngle) * lerpFactor;
      this.vaultDoorGroup.rotation.y = this.currentDoorAngle;
    }

    // Spin vault wheel during opening state
    if (this.vaultWheelMesh) {
      if (this.state === VAULT_STATES.OPENING) {
        this.vaultWheelMesh.rotation.z += dt * 8.0;
      }
    }
  }

  /**
   * Reset system state back to initial LOCKED.
   */
  reset() {
    this.setState(VAULT_STATES.LOCKED, 0, null, null);
    this.currentDoorAngle = 0;
    this.targetDoorAngle = 0;
    if (this.vaultDoorGroup) {
      this.vaultDoorGroup.rotation.y = 0;
    }
    if (this.vaultWheelMesh) {
      this.vaultWheelMesh.rotation.z = 0;
    }
  }
}
