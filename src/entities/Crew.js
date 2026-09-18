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
    this.thief      = new Thief(new THREE.Vector3(-4,    0, 19.5));
    this.hacker     = new Hacker(new THREE.Vector3(-1.5, 0, 19.5));
    this.distractor = new Distractor(new THREE.Vector3(1.5, 0, 19.5));
    this.enforcer   = new Enforcer(new THREE.Vector3(4,   0, 19.5));

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
