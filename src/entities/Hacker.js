/**
 * Hacker.js
 * Tech specialist — headset, tablet, glowing backpack accents.
 */

import * as THREE from 'three';
import { CrewMember } from './CrewMember.js';

export class Hacker extends CrewMember {
  constructor(position) {
    super({
      name: 'Cipher',
      role: 'hacker',
      speed: 1.2,
      position,

      colors: {
        skin:      0xc49e6c,
        primary:   0x181830,   // dark navy
        secondary: 0x151528,
        accent:    0x3388ff,   // electric blue
        shoe:      0x101018,
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

    // ── Headset band (arc over the head) ──
    const bandGeo = new THREE.TorusGeometry(hR * 1.08, 0.022, 6, 16, Math.PI);
    const band = new THREE.Mesh(bandGeo, mat.accent);
    band.rotation.x = 0;
    band.rotation.z = Math.PI / 2;
    band.position.set(0, hY + hR * 0.15, 0);
    band.castShadow = true;
    this.group.add(band);
    this.meshes.headsetBand = band;

    // ── Earpieces ──
    this.meshes.earL = this._cyl(0.04, 0.04, 0.05, mat.accent,
      -(hR + 0.03), hY, 0);
    this.meshes.earL.rotation.z = Math.PI / 2;

    this.meshes.earR = this._cyl(0.04, 0.04, 0.05, mat.accent,
       (hR + 0.03), hY, 0);
    this.meshes.earR.rotation.z = Math.PI / 2;

    // ── Microphone (small cylinder from left ear toward mouth) ──
    this.meshes.mic = this._cyl(0.012, 0.015, 0.12, mat.accent,
      -(hR * 0.7), hY - hR * 0.55, -(hR * 0.5));
    this.meshes.mic.rotation.z = 0.3;

    // ── Glasses / visor ──
    this.meshes.glasses = this._box(
      hR * 1.7, hR * 0.32, 0.025, mat.accent,
      0, hY + hR * 0.1, -(hR * 0.93),
    );

    // ── Tablet held in left hand ──
    const armX = b.shoulderWidth / 2 + b.armRadius + 0.01;
    const handY = this._torsoTopY - 0.06 - b.armLength;
    // Tablet
    const tabletMat = new THREE.MeshStandardMaterial({
      color: 0x111118,
      emissive: 0x2266cc,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.meshes.tablet = this._box(0.18, 0.12, 0.015, tabletMat,
      -armX, handY + 0.10, -0.08);

    // ── Tech backpack ──
    this.meshes.backpack = this._box(
      0.22, 0.28, 0.12, mat.secondary,
      0, this._torsoTopY - 0.22, b.torsoDepth / 2 + 0.07,
    );
    // Glowing accent strip on backpack
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      emissive: 0x3388ff,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });
    this._box(0.16, 0.03, 0.005, glowMat,
      0, this._torsoTopY - 0.14, b.torsoDepth / 2 + 0.135);
    this._box(0.16, 0.03, 0.005, glowMat,
      0, this._torsoTopY - 0.28, b.torsoDepth / 2 + 0.135);
  }
}
