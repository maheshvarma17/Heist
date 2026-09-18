/**
 * Distractor.js
 * Social manipulator — casual disguise with cap, phone, and scarf accent.
 */

import * as THREE from 'three';
import { CrewMember } from './CrewMember.js';

export class Distractor extends CrewMember {
  constructor(position) {
    super({
      name: 'Mirage',
      role: 'distractor',
      speed: 1.4,
      position,

      colors: {
        skin:      0xc8a882,
        primary:   0x2a3a28,   // olive green
        secondary: 0x263020,
        accent:    0xffaa33,   // warm orange
        shoe:      0x1a1510,
      },

      body: {
        // Standard proportions
      },
    });
  }

  _addAccessories() {
    const b   = this._body;
    const mat = this._mats;
    const hY  = this._headY;
    const hR  = b.headRadius;

    // ── Baseball cap — crown + brim ──
    this.meshes.capCrown = this._cyl(hR * 1.08, hR * 1.12, 0.07, mat.accent,
      0, hY + hR * 0.88, 0, 12);

    this.meshes.capBrim = this._box(
      hR * 1.5, 0.025, hR * 0.7, mat.accent,
      0, hY + hR * 0.84, -(hR * 0.65),
    );

    // ── Scarf / bandana around neck ──
    const scarfY = this._torsoTopY + b.neckHeight * 0.3;
    this.meshes.scarf = this._cyl(0.085, 0.085, 0.06, mat.accent,
      0, scarfY, 0, 10);

    // ── Phone held in right hand ──
    const armX  = b.shoulderWidth / 2 + b.armRadius + 0.01;
    const handY = this._torsoTopY - 0.06 - b.armLength;
    const phoneMat = new THREE.MeshStandardMaterial({
      color: 0x151515,
      emissive: 0xeebb44,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.meshes.phone = this._box(0.06, 0.11, 0.015, phoneMat,
      armX, handY + 0.12, -0.06);

    // ── Collar detail on jacket ──
    this.meshes.collarL = this._box(0.08, 0.07, 0.10, mat.accent,
      -b.torsoWidth / 2 + 0.04, this._torsoTopY - 0.02, -b.torsoDepth / 2 + 0.04);
    this.meshes.collarR = this._box(0.08, 0.07, 0.10, mat.accent,
       b.torsoWidth / 2 - 0.04, this._torsoTopY - 0.02, -b.torsoDepth / 2 + 0.04);

    // ── Sunglasses ──
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x111111, roughness: 0.1, metalness: 0.5,
    });
    this.meshes.glassL = this._box(hR * 0.55, hR * 0.35, 0.02, glassMat,
      -hR * 0.35, hY + hR * 0.1, -(hR * 0.93));
    this.meshes.glassR = this._box(hR * 0.55, hR * 0.35, 0.02, glassMat,
       hR * 0.35, hY + hR * 0.1, -(hR * 0.93));
    // Bridge
    this._box(hR * 0.15, 0.015, 0.02, glassMat,
      0, hY + hR * 0.1, -(hR * 0.93));
  }
}
