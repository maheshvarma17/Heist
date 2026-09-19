/**
 * EscapeSystem.js
 * Manages 3D escape beacon zones (Front Exit & Rooftop Exit),
 * proximity interaction checks, beacon visual animations, and escape status.
 */

import * as THREE from 'three';

export const ESCAPE_ROUTES = {
  frontExit: {
    id: 'frontExit',
    name: 'Front Exit',
    position: { x: 0, y: 0, z: 21 },
    radius: 3.0,
  },
  rooftopExit: {
    id: 'rooftopExit',
    name: 'Rooftop Exit',
    position: { x: 0, y: 4, z: -19 },
    radius: 3.0,
  },
};

export const ESCAPE_STATES = {
  LOCKED: 'LOCKED',
  AVAILABLE: 'AVAILABLE',
};

export class EscapeSystem {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.onEscapeChange]
   */
  constructor(options = {}) {
    this.group = new THREE.Group();
    this.group.name = 'EscapeBeaconsGroup';
    this.onEscapeChange = options.onEscapeChange || null;

    this.state = ESCAPE_STATES.LOCKED;
    this.escapedPlayers = [];
    this.activeEscapes = {};
    this.beacons = new Map(); // routeId -> THREE.Group
    this._animTime = 0;

    this._buildBeacons();
  }

  /**
   * Build 3D visual beacon zones for each escape route.
   */
  _buildBeacons() {
    // Shared materials
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981, // Emerald green
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const cylinderMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7b7,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    for (const [routeId, route] of Object.entries(ESCAPE_ROUTES)) {
      const beaconGroup = new THREE.Group();
      beaconGroup.name = `Beacon_${routeId}`;
      beaconGroup.position.set(route.position.x, route.position.y, route.position.z);

      // Floor ring marker
      const ringGeo = new THREE.RingGeometry(route.radius - 0.4, route.radius, 32);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat.clone());
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.05;
      beaconGroup.add(ringMesh);

      // Subtle zone cylinder
      const cylGeo = new THREE.CylinderGeometry(route.radius, route.radius, 2.0, 32, 1, true);
      const cylMesh = new THREE.Mesh(cylGeo, cylinderMat.clone());
      cylMesh.position.y = 1.0;
      beaconGroup.add(cylMesh);

      // Center light beam
      const beamGeo = new THREE.CylinderGeometry(0.15, 0.4, 3.5, 16, 1, true);
      const beamMesh = new THREE.Mesh(beamGeo, pillarMat.clone());
      beamMesh.position.y = 1.75;
      beaconGroup.add(beamMesh);

      // Floating diamond badge above center
      const iconGeo = new THREE.OctahedronGeometry(0.35, 0);
      const iconMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      });
      const iconMesh = new THREE.Mesh(iconGeo, iconMat);
      iconMesh.position.y = 2.2;
      beaconGroup.add(iconMesh);

      this.beacons.set(routeId, {
        group: beaconGroup,
        ringMesh,
        cylMesh,
        beamMesh,
        iconMesh,
        baseY: 2.2,
      });

      this.group.add(beaconGroup);
    }
  }

  /**
   * Add escape beacon group to Three.js scene.
   * @param {THREE.Scene} scene
   */
  addToScene(scene) {
    scene.add(this.group);
  }

  /**
   * Synchronize escape state from server snapshot.
   * @param {Object} escapeSnapshot
   */
  setEscapeState(escapeSnapshot) {
    if (!escapeSnapshot) return;
    this.state = escapeSnapshot.state || ESCAPE_STATES.LOCKED;
    this.escapedPlayers = Array.isArray(escapeSnapshot.escapedPlayers) ? [...escapeSnapshot.escapedPlayers] : [];
    this.activeEscapes = escapeSnapshot.activeEscapes ? { ...escapeSnapshot.activeEscapes } : {};

    // Update beacon visibility / material tint based on locked/available
    const isAvail = this.state === ESCAPE_STATES.AVAILABLE;
    for (const [routeId, b] of this.beacons.entries()) {
      b.group.visible = true; // Always visible as map landmark
      const colorHex = isAvail ? 0x10b981 : 0x64748b; // Green when available, slate when locked
      b.ringMesh.material.color.setHex(colorHex);
      b.cylMesh.material.color.setHex(colorHex);
      b.beamMesh.material.color.setHex(colorHex);
      b.iconMesh.material.color.setHex(colorHex);
      b.ringMesh.material.opacity = isAvail ? 0.45 : 0.15;
      b.cylMesh.material.opacity = isAvail ? 0.2 : 0.05;
    }

    if (this.onEscapeChange) {
      this.onEscapeChange({
        state: this.state,
        escapedPlayers: this.escapedPlayers,
        activeEscapes: this.activeEscapes,
      });
    }
  }

  /**
   * Check if local player is inside an escape zone.
   * @param {{ x: number, y: number, z: number }} position
   * @param {boolean} [isPlayerEscaped=false]
   * @param {string} [localPlayerId=null]
   * @returns {{ inZone: boolean, canEscape: boolean, isEscaping: boolean, routeId: string|null, routeName: string|null, promptText: string|null }}
   */
  checkProximity(position, isPlayerEscaped = false, localPlayerId = null) {
    if (!position || isPlayerEscaped) {
      return {
        inZone: false,
        canEscape: false,
        isEscaping: false,
        routeId: null,
        routeName: null,
        promptText: null,
      };
    }

    const isEscaping = localPlayerId && this.activeEscapes && !!this.activeEscapes[localPlayerId];

    for (const [routeId, route] of Object.entries(ESCAPE_ROUTES)) {
      const dx = position.x - route.position.x;
      const dz = position.z - route.position.z;
      const dy = Math.abs(position.y - route.position.y);
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= route.radius && dy <= 2.5) {
        if (isEscaping) {
          const escInfo = this.activeEscapes[localPlayerId];
          return {
            inZone: true,
            canEscape: false,
            isEscaping: true,
            routeId,
            routeName: route.name,
            promptText: `ESCAPING VIA ${route.name.toUpperCase()} (${escInfo.progress || 0}%)...`,
          };
        }

        if (this.state !== ESCAPE_STATES.AVAILABLE) {
          return {
            inZone: true,
            canEscape: false,
            isEscaping: false,
            routeId,
            routeName: route.name,
            promptText: `${route.name.toUpperCase()} (LOCKED - OPEN VAULT FIRST)`,
          };
        }

        return {
          inZone: true,
          canEscape: true,
          isEscaping: false,
          routeId,
          routeName: route.name,
          promptText: `[E] ESCAPE VIA ${route.name.toUpperCase()}`,
        };
      }
    }

    return {
      inZone: false,
      canEscape: false,
      isEscaping: false,
      routeId: null,
      routeName: null,
      promptText: null,
    };
  }

  /**
   * Update visual animations for escape beacons.
   * @param {number} dt
   */
  update(dt) {
    this._animTime += dt;
    const isAvail = this.state === ESCAPE_STATES.AVAILABLE;
    const speed = isAvail ? 2.0 : 0.5;

    for (const b of this.beacons.values()) {
      // Rotate beacon ring and beam
      b.ringMesh.rotation.z += dt * (speed * 0.4);
      b.cylMesh.rotation.y -= dt * (speed * 0.3);
      b.iconMesh.rotation.y += dt * speed;

      // Bobbing floating diamond
      b.iconMesh.position.y = b.baseY + Math.sin(this._animTime * speed) * 0.15;

      // Pulsating opacity when available
      if (isAvail) {
        b.cylMesh.material.opacity = 0.15 + Math.sin(this._animTime * 3) * 0.08;
      }
    }
  }

  /**
   * Cleanup Three.js meshes and materials.
   */
  dispose() {
    for (const b of this.beacons.values()) {
      if (b.ringMesh) {
        b.ringMesh.geometry.dispose();
        b.ringMesh.material.dispose();
      }
      if (b.cylMesh) {
        b.cylMesh.geometry.dispose();
        b.cylMesh.material.dispose();
      }
      if (b.beamMesh) {
        b.beamMesh.geometry.dispose();
        b.beamMesh.material.dispose();
      }
      if (b.iconMesh) {
        b.iconMesh.geometry.dispose();
        b.iconMesh.material.dispose();
      }
    }
    this.beacons.clear();
  }
}
