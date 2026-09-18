/**
 * Enforcer.js
 * Heavy-duty muscle — larger build, shoulder pads, heavy pack, gloves.
 */

import * as THREE from 'three';
import { CrewMember } from './CrewMember.js';

export class Enforcer extends CrewMember {
  constructor(position) {
    super({
      name: 'Tank',
      role: 'enforcer',
      speed: 0.9,
      position,

      colors: {
        skin:      0xba936a,
        primary:   0x3a1a1a,   // dark maroon
        secondary: 0x301515,
        accent:    0xcc3333,   // strong red
        shoe:      0x151010,
      },

      // Bulky build
      body: {
        headRadius:    0.19,
        torsoWidth:    0.40,
        torsoHeight:   0.55,
        torsoDepth:    0.25,
        armRadius:     0.072,
        armLength:     0.46,
        legRadius:     0.095,
        legLength:     0.55,
        shoulderWidth: 0.46,
        hipWidth:      0.26,
      },
    });
  }

  _addAccessories() {
    const b   = this._body;
    const mat = this._mats;
    const hY  = this._headY;
    const hR  = b.headRadius;

    // ── Shoulder pads ──
    const padY = this._torsoTopY + 0.01;
    this.meshes.padL = this._box(0.14, 0.07, 0.16, mat.accent,
      -(b.shoulderWidth / 2 + 0.01), padY, 0);
    this.meshes.padR = this._box(0.14, 0.07, 0.16, mat.accent,
       (b.shoulderWidth / 2 + 0.01), padY, 0);

    // ── Heavy backpack ──
    this.meshes.backpack = this._box(
      0.30, 0.36, 0.16, mat.secondary,
      0, this._torsoTopY - 0.24, b.torsoDepth / 2 + 0.09,
    );
    // Backpack buckle accent
    this._box(0.06, 0.06, 0.02, mat.accent,
      0, this._torsoTopY - 0.10, b.torsoDepth / 2 + 0.18);

    // ── Chest strap (X-harness) ──
    this._box(0.04, 0.35, 0.02, mat.accent,
      -0.08, this._torsoTopY - b.torsoHeight / 2, -(b.torsoDepth / 2 + 0.012));
    this._box(0.04, 0.35, 0.02, mat.accent,
       0.08, this._torsoTopY - b.torsoHeight / 2, -(b.torsoDepth / 2 + 0.012));

    // ── Gloves (replace default skin-colored hands) ──
    const armX  = b.shoulderWidth / 2 + b.armRadius + 0.01;
    const handY = this._torsoTopY - 0.06 - b.armLength;
    // Override hand materials
    this.meshes.handL.material = mat.accent;
    this.meshes.handR.material = mat.accent;
    // Slightly bigger glove cuffs
    this._cyl(b.armRadius * 1.3, b.armRadius * 1.1, 0.04, mat.accent,
      -armX, handY + b.armRadius * 1.5, 0);
    this._cyl(b.armRadius * 1.3, b.armRadius * 1.1, 0.04, mat.accent,
       armX, handY + b.armRadius * 1.5, 0);

    // ── Balaclava / face mask ──
    // Dark covering over the lower face
    this.meshes.mask = this._box(
      hR * 1.5, hR * 0.5, hR * 0.7, mat.primary,
      0, hY - hR * 0.3, -(hR * 0.55),
    );

    // ── Tactical goggles on forehead ──
    this.meshes.goggles = this._box(
      hR * 1.8, hR * 0.3, 0.04, mat.accent,
      0, hY + hR * 0.45, -(hR * 0.88),
    );

    // ── Knee pads ──
    const kneeY = b.shoeHeight + b.legLength * 0.55;
    this._box(b.legRadius * 2.2, 0.08, 0.06, mat.accent,
      -b.hipWidth / 2, kneeY, -(b.legRadius + 0.02));
    this._box(b.legRadius * 2.2, 0.08, 0.06, mat.accent,
       b.hipWidth / 2, kneeY, -(b.legRadius + 0.02));
  }
}
