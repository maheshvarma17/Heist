/**
 * SecurityCamera.js
 * Procedural security camera NPC mounted to walls/ceiling.
 *
 * Visual: mounting bracket, arm, camera housing, lens barrel, indicator LED.
 * Includes a ground-level detection cone that rotates with the camera's scan.
 */

import * as THREE from 'three';

// ─── Colors ─────────────────────────────────────────────────
const COL = {
  bracket:  0x444444,
  housing:  0x2a2a30,
  lens:     0x111122,
  lensRing: 0x555565,
  led:      0x00ff44,
  cone:     0x4488ff,
};

// ═══════════════════════════════════════════════════════════════

export class SecurityCamera {
  /**
   * @param {Object} config
   * @param {string}        config.name
   * @param {THREE.Vector3} config.position
   * @param {number}        config.baseYaw        – centre scan direction (radians)
   * @param {number}        [config.scanAmplitude] – half-sweep range (radians)
   * @param {number}        [config.scanSpeed]     – oscillation speed
   * @param {number}        [config.detectionRange]
   * @param {number}        [config.fov]           – full cone angle (radians)
   */
  constructor(config) {
    this.name           = config.name;
    this.baseYaw        = config.baseYaw ?? 0;
    this.scanAmplitude  = config.scanAmplitude ?? (Math.PI / 4);
    this.scanSpeed      = config.scanSpeed ?? 1.0;
    this.detectionRange = config.detectionRange ?? 10;
    this.fov            = config.fov ?? (Math.PI / 3); // 60°

    // Main group (positioned at camera mount point)
    this.group = new THREE.Group();
    this.group.name = `Camera_${this.name}`;

    // Pivot rotates for scanning — camera body + cone are children
    this.pivot = new THREE.Group();
    this.group.add(this.pivot);

    this._buildMaterials();
    this._buildMesh();
    this._buildLED();

    // Set position
    if (config.position) {
      this.group.position.copy(config.position);
    }

    // Build cone after position is set (needs height for ground offset)
    this._buildDetectionCone(config.position?.y ?? 3);

    // Initialise at base yaw
    this.pivot.rotation.y = this.baseYaw;
  }

  // ─── Public ────────────────────────────────────────────

  get position() { return this.group.position; }

  addToScene(parent) { parent.add(this.group); }

  setConeColor(hex) {
    if (this._coneMat) this._coneMat.color.setHex(hex);
  }

  setConeVisible(v) {
    if (this._coneMesh) this._coneMesh.visible = v;
  }

  setLEDColor(hex) {
    if (this._ledMat) {
      this._ledMat.color.setHex(hex);
      this._ledMat.emissive.setHex(hex);
    }
  }

  // ─── Materials ─────────────────────────────────────────

  _buildMaterials() {
    this._mats = {
      bracket:  new THREE.MeshStandardMaterial({ color: COL.bracket,  roughness: 0.6, metalness: 0.3 }),
      housing:  new THREE.MeshStandardMaterial({ color: COL.housing,  roughness: 0.5, metalness: 0.2 }),
      lens:     new THREE.MeshStandardMaterial({ color: COL.lens,     roughness: 0.2, metalness: 0.5 }),
      lensRing: new THREE.MeshStandardMaterial({ color: COL.lensRing, roughness: 0.4, metalness: 0.4 }),
    };

    this._ledMat = new THREE.MeshStandardMaterial({
      color: COL.led,
      emissive: COL.led,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.1,
    });
  }

  // ─── Camera Mesh ───────────────────────────────────────

  _buildMesh() {
    const m = this._mats;

    // Mount plate (against wall/ceiling)
    this._addBox(0.10, 0.10, 0.04, m.bracket, 0, 0, 0);

    // Arm extending out and down
    this._addBox(0.03, 0.16, 0.03, m.bracket, 0, -0.10, -0.04);

    // Camera housing (main body)
    this._addBox(0.12, 0.09, 0.20, m.housing, 0, -0.22, -0.12);

    // Lens ring
    this._addCyl(0.04, 0.04, 0.03, m.lensRing, 0, -0.22, -0.24, 10);

    // Lens glass
    this._addCyl(0.03, 0.035, 0.02, m.lens, 0, -0.22, -0.26, 10);
  }

  // ─── LED Indicator ─────────────────────────────────────

  _buildLED() {
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 8, 6),
      this._ledMat,
    );
    led.position.set(0.04, -0.165, -0.12);
    this.pivot.add(led);
    this._ledMesh = led;
  }

  // ─── Detection Cone (ground level) ─────────────────────

  _buildDetectionCone(cameraHeight) {
    const range     = this.detectionRange;
    const halfAngle = this.fov / 2;
    const segments  = 18;

    // Flat fan shape in XY plane
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const a = -halfAngle + (this.fov * i / segments);
      shape.lineTo(Math.sin(a) * range, -Math.cos(a) * range);
    }
    shape.lineTo(0, 0);

    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // XY → XZ

    this._coneMat = new THREE.MeshBasicMaterial({
      color: COL.cone,
      transparent: true,
      opacity: 0.10,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this._coneMesh = new THREE.Mesh(geo, this._coneMat);
    // Offset to ground level (camera is elevated)
    this._coneMesh.position.y = -cameraHeight + 0.05;
    this._coneMesh.renderOrder = 1;
    this.pivot.add(this._coneMesh);
  }

  // ─── Geometry Helpers ──────────────────────────────────

  _addBox(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.pivot.add(mesh);
    return mesh;
  }

  _addCyl(rTop, rBot, height, material, x, y, z, segs = 8) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, height, segs), material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.pivot.add(mesh);
    return mesh;
  }
}
