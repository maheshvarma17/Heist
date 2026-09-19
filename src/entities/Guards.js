/**
 * Guards.js
 * Creates and manages the bank's security guards.
 * Three guards with assigned patrol routes.
 */

import * as THREE from 'three';
import { Guard } from './Guard.js';
import { GUARD_ROUTES } from '../game/GuardRoutes.js';

export class Guards {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Guards';

    // ── Create guards at the first waypoint of their route ──
    this.lobbyGuard = new Guard({
      name: 'Lobby Guard',
      position: GUARD_ROUTES.lobbyGuard[0].clone(),
      speed: 2.5,
      detectionRange: 7,
      detectionAngle: Math.PI / 3,   // 60°
    });

    this.vaultGuard = new Guard({
      name: 'Vault Guard',
      position: GUARD_ROUTES.vaultGuard[0].clone(),
      speed: 2.0,
      detectionRange: 6,
      detectionAngle: Math.PI / 3.5, // ~51°
    });

    this.securityGuard = new Guard({
      name: 'Security Guard',
      position: GUARD_ROUTES.securityGuard[0].clone(),
      speed: 2.2,
      detectionRange: 8,
      detectionAngle: Math.PI / 2.8, // ~64°
    });

    /** All guards as an iterable array. */
    this.members = [
      this.lobbyGuard,
      this.vaultGuard,
      this.securityGuard,
    ];

    // Assign routes
    this._routes = new Map([
      [this.lobbyGuard,    GUARD_ROUTES.lobbyGuard],
      [this.vaultGuard,    GUARD_ROUTES.vaultGuard],
      [this.securityGuard, GUARD_ROUTES.securityGuard],
    ]);

    for (const guard of this.members) {
      guard.addToScene(this.group);
    }
  }

  /** Get the patrol route for a guard. */
  getRoute(guard) {
    return this._routes.get(guard);
  }

  /** Add all guards into a scene or group. */
  addToScene(scene) {
    scene.add(this.group);
  }

  /** Reset every guard to its starting position and rotation. */
  resetAll() {
    this.members.forEach((guard) => {
      const route = this._routes.get(guard);
      guard.group.position.copy(route[0]);
      guard.group.rotation.y = 0;
    });
  }
}
