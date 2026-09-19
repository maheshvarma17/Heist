/**
 * SecurityCameras.js
 * Creates and manages the bank's security cameras.
 * Four cameras covering strategic routes through the bank.
 */

import * as THREE from 'three';
import { SecurityCamera } from './SecurityCamera.js';

export class SecurityCameras {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SecurityCameras';

    // ── Camera 1: Lobby — south wall, scanning into the lobby ──
    this.lobbyCam = new SecurityCamera({
      name: 'Lobby Camera',
      position: new THREE.Vector3(5, 3, 21),
      baseYaw: 0,                          // faces −Z (into lobby)
      scanAmplitude: Math.PI / 4,          // ±45°
      scanSpeed: 0.8,
      detectionRange: 10,
      fov: Math.PI / 3,                    // 60°
    });

    // ── Camera 2: Hallway — north wall, scanning southward ──
    this.hallwayCam = new SecurityCamera({
      name: 'Hallway Camera',
      position: new THREE.Vector3(-3, 3, -11.5),
      baseYaw: Math.PI,                    // faces +Z (into hallway)
      scanAmplitude: Math.PI / 3,          // ±60°
      scanSpeed: 0.6,
      detectionRange: 9,
      fov: Math.PI / 3,
    });

    // ── Camera 3: Vault — east wall, scanning into vault ──
    this.vaultCam = new SecurityCamera({
      name: 'Vault Camera',
      position: new THREE.Vector3(5.5, 3, 5),
      baseYaw: Math.PI / 2,               // faces −X (into vault)
      scanAmplitude: Math.PI / 4,
      scanSpeed: 0.7,
      detectionRange: 8,
      fov: Math.PI / 3,
    });

    // ── Camera 4: Security corridor — watching the sec room entry ──
    this.securityCam = new SecurityCamera({
      name: 'Security Camera',
      position: new THREE.Vector3(-6, 3, -4),
      baseYaw: -(Math.PI / 2),            // faces +X (toward main area)
      scanAmplitude: Math.PI / 4,
      scanSpeed: 0.9,
      detectionRange: 8,
      fov: Math.PI / 3,
    });

    /** All cameras as an iterable array. */
    this.members = [
      this.lobbyCam,
      this.hallwayCam,
      this.vaultCam,
      this.securityCam,
    ];

    for (const cam of this.members) {
      cam.addToScene(this.group);
    }
  }

  /** Add all cameras to a scene. */
  addToScene(scene) {
    scene.add(this.group);
  }

  /** Reset every camera to its initial state. */
  resetAll() {
    for (const cam of this.members) {
      cam.pivot.rotation.y = cam.baseYaw;
      cam.setConeColor(0x4488ff);
      cam.setLEDColor(0x00ff44);
    }
  }
}
