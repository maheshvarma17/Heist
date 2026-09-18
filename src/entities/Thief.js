/**
 * Thief.js
 * Fast, stealthy crew member — slim silhouette with hood, visor, and backpack.
 */

import * as THREE from 'three';
import { CrewMember } from './CrewMember.js';

export class Thief extends CrewMember {
  constructor(position) {
    super({
      name: 'Shadow',
      role: 'thief',
      speed: 1.8,
      position,

      colors: {
        skin:      0xd4a574,
        primary:   0x1a1a22,   // dark near-black
        secondary: 0x151520,
        accent:    0x00ccaa,   // teal
        shoe:      0x0a0a10,
      },

      // Slim build
      body: {
        torsoWidth:    0.26,
        torsoDepth:    0.16,
        shoulderWidth: 0.30,
        armRadius:     0.048,
        legRadius:     0.065,
      },
    });
  }

  _addAccessories() {
    const b   = this._body;
    const mat = this._mats;
    const hY  = this._headY;
    const hR  = b.headRadius;

    // ── Hood — elongated sphere covering the back/top of head ──
    const hoodGeo = new THREE.SphereGeometry(hR * 1.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.72);
    const hood = new THREE.Mesh(hoodGeo, mat.primary);
    hood.position.set(0, hY + hR * 0.06, 0.02);
    hood.castShadow = true;
    this.group.add(hood);
    this.meshes.hood = hood;

    // ── Visor / mask — accent-colored band across eyes ──
    this.meshes.visor = this._box(
      hR * 2.0, hR * 0.45, 0.04, mat.accent,
      0, hY + hR * 0.08, -(hR * 0.92),
    );

    // ── Small backpack ──
    this.meshes.backpack = this._box(
      0.16, 0.22, 0.10, mat.secondary,
      0, this._torsoTopY - 0.20, b.torsoDepth / 2 + 0.06,
    );

    // Backpack strap accent
    this._box(0.03, 0.28, 0.04, mat.accent,
      -0.06, this._torsoTopY - 0.18, b.torsoDepth / 2 + 0.01);
    this._box(0.03, 0.28, 0.04, mat.accent,
       0.06, this._torsoTopY - 0.18, b.torsoDepth / 2 + 0.01);
  }
}
