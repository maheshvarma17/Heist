/**
 * Crew.js
 * Manages the four-person heist crew.
 * Creates, positions, and exposes all crew members.
 */

import * as THREE from 'three';
import { Thief } from './Thief.js';
import { Hacker } from './Hacker.js';
import { Distractor } from './Distractor.js';
import { Enforcer } from './Enforcer.js';

export class Crew {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Crew';

    // Spawn positions inside the lobby, near the entrance (z ≈ 20),
    // evenly spaced along X, facing north (toward bank interior).
    this._spawnPositions = [
      new THREE.Vector3(-4,    0, 19.5),
      new THREE.Vector3(-1.5,  0, 19.5),
      new THREE.Vector3( 1.5,  0, 19.5),
      new THREE.Vector3( 4,    0, 19.5),
    ];

    this.thief      = new Thief(this._spawnPositions[0].clone());
    this.hacker     = new Hacker(this._spawnPositions[1].clone());
    this.distractor = new Distractor(this._spawnPositions[2].clone());
    this.enforcer   = new Enforcer(this._spawnPositions[3].clone());

    /** All crew members as an iterable array. */
    this.members = [
      this.thief,
      this.hacker,
      this.distractor,
      this.enforcer,
    ];

    // Add every member to the crew group
    for (const member of this.members) {
      member.addToScene(this.group);
    }
  }

  /** Reset all crew members to their lobby spawn positions. */
  resetPositions() {
    this.members.forEach((member, i) => {
      member.group.position.copy(this._spawnPositions[i]);
      member.group.rotation.y = 0;
    });
  }

  /** Add the entire crew into a Three.js scene or group. */
  addToScene(scene) {
    scene.add(this.group);
  }

  /** Retrieve a crew member by role string (e.g. 'thief'). */
  getByRole(role) {
    return this.members.find(m => m.role === role) ?? null;
  }

  /** Retrieve a crew member by display name (e.g. 'Shadow'). */
  getByName(name) {
    return this.members.find(m => m.name === name) ?? null;
  }
}
