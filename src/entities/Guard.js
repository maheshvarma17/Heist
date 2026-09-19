/**
 * Guard.js
 * Procedural bank guard NPC.
 * Built from Three.js primitives at the same scale as CrewMember.
 *
 * Visual identity:
 *   • Navy blue uniform
 *   • Security cap with gold band
 *   • Badge on chest
 *   • Shoulder radio
 *   • Detection cone visualisation (debug)
 */

import * as THREE from 'three';

// ─── Body Proportions (matches CrewMember scale) ────────────
const B = {
  headRadius:    0.19,
  torsoWidth:    0.36,
  torsoHeight:   0.52,
  torsoDepth:    0.22,
  armRadius:     0.06,
  armLength:     0.44,
  legRadius:     0.08,
  legLength:     0.50,
  shoulderWidth: 0.40,
  hipWidth:      0.24,
  shoeHeight:    0.10,
  neckHeight:    0.06,
};

// ─── Guard Colors ───────────────────────────────────────────
const COL = {
  uniform:    0x1a2a4a,   // dark navy
  shirt:      0x2a3a5a,   // lighter navy
  skin:       0xd4a574,
  capTop:     0x1a2240,
  capBand:    0xd4a030,   // gold band
  badge:      0xddb040,   // shiny gold
  shoe:       0x111111,
  eye:        0x101010,
  radio:      0x222222,
  cone:       0x44ff44,   // default detection cone (green)
};

// ═══════════════════════════════════════════════════════════════

export class Guard {
  /**
   * @param {Object} config
   * @param {string}        config.name
   * @param {THREE.Vector3} config.position
   * @param {number}        [config.speed]          – world-units / sec
   * @param {number}        [config.detectionRange] – units
   * @param {number}        [config.detectionAngle] – full cone angle (radians)
   */
  constructor(config) {
    this.name           = config.name;
    this.speed          = config.speed ?? 2.5;
    this.detectionRange = config.detectionRange ?? 8;
    this.detectionAngle = config.detectionAngle ?? (Math.PI / 3); // 60°

    this.group = new THREE.Group();
    this.group.name = `Guard_${this.name}`;

    /** @type {Object.<string, THREE.Mesh>} */
    this.meshes = {};

    this._buildMaterials();
    this._buildBody();
    this._addAccessories();
    this._buildLabel();
    this._buildDetectionCone();

    if (config.position) {
      this.group.position.copy(config.position);
    }
  }

  // ─── Public ────────────────────────────────────────────

  get position() { return this.group.position; }

  addToScene(parent) { parent.add(this.group); }

  /** Set the detection cone color (e.g. for state changes). */
  setConeColor(hex) {
    if (this._coneMat) this._coneMat.color.setHex(hex);
  }

  /** Show / hide cone. */
  setConeVisible(v) {
    if (this._coneMesh) this._coneMesh.visible = v;
  }

  // ─── Materials ─────────────────────────────────────────

  _buildMaterials() {
    this._mats = {
      uniform: new THREE.MeshStandardMaterial({ color: COL.uniform,  roughness: 0.7, metalness: 0.08 }),
      shirt:   new THREE.MeshStandardMaterial({ color: COL.shirt,    roughness: 0.72, metalness: 0.05 }),
      skin:    new THREE.MeshStandardMaterial({ color: COL.skin,     roughness: 0.7, metalness: 0.05 }),
      shoe:    new THREE.MeshStandardMaterial({ color: COL.shoe,     roughness: 0.8, metalness: 0.1 }),
      eye:     new THREE.MeshStandardMaterial({ color: COL.eye,      roughness: 0.3, metalness: 0.1 }),
      cap:     new THREE.MeshStandardMaterial({ color: COL.capTop,   roughness: 0.6, metalness: 0.1 }),
      capBand: new THREE.MeshStandardMaterial({ color: COL.capBand,  roughness: 0.4, metalness: 0.3 }),
      badge:   new THREE.MeshStandardMaterial({ color: COL.badge,    roughness: 0.3, metalness: 0.6 }),
      radio:   new THREE.MeshStandardMaterial({ color: COL.radio,    roughness: 0.6, metalness: 0.2 }),
    };
  }

  // ─── Body ──────────────────────────────────────────────

  _buildBody() {
    const m = this._mats;

    const shoeTop  = B.shoeHeight;
    const legTop   = shoeTop + B.legLength;
    const gap      = 0.04;
    const torsoBot = legTop + gap;
    const torsoTop = torsoBot + B.torsoHeight;
    const neckTop  = torsoTop + B.neckHeight;
    const headCY   = neckTop + B.headRadius;

    this._headY       = headCY;
    this._torsoTopY   = torsoTop;
    this._totalHeight = headCY + B.headRadius;

    // Shoes
    const shoeW = B.legRadius * 2.4, shoeD = B.legRadius * 3.0;
    this.meshes.shoeL = this._box(shoeW, B.shoeHeight, shoeD, m.shoe,
      -B.hipWidth / 2, B.shoeHeight / 2, 0);
    this.meshes.shoeR = this._box(shoeW, B.shoeHeight, shoeD, m.shoe,
       B.hipWidth / 2, B.shoeHeight / 2, 0);

    // Legs
    this.meshes.legL = this._cyl(B.legRadius, B.legRadius * 0.88, B.legLength, m.shirt,
      -B.hipWidth / 2, shoeTop + B.legLength / 2, 0);
    this.meshes.legR = this._cyl(B.legRadius, B.legRadius * 0.88, B.legLength, m.shirt,
       B.hipWidth / 2, shoeTop + B.legLength / 2, 0);

    // Belt
    this.meshes.belt = this._box(B.torsoWidth + 0.04, 0.06, B.torsoDepth + 0.04, m.radio,
      0, torsoBot + 0.03, 0);

    // Torso
    this.meshes.torso = this._box(B.torsoWidth, B.torsoHeight, B.torsoDepth, m.uniform,
      0, torsoBot + B.torsoHeight / 2, 0);

    // Arms
    const armHangY = torsoTop - 0.06;
    const armCY    = armHangY - B.armLength / 2;
    const armX     = B.shoulderWidth / 2 + B.armRadius + 0.01;

    this.meshes.armL = this._cyl(B.armRadius, B.armRadius * 0.78, B.armLength, m.uniform,
      -armX, armCY, 0);
    this.meshes.armR = this._cyl(B.armRadius, B.armRadius * 0.78, B.armLength, m.uniform,
       armX, armCY, 0);

    // Hands
    const handY = armHangY - B.armLength;
    this.meshes.handL = this._sphere(B.armRadius * 1.1, m.skin, -armX, handY, 0);
    this.meshes.handR = this._sphere(B.armRadius * 1.1, m.skin,  armX, handY, 0);

    // Neck
    this.meshes.neck = this._cyl(0.055, 0.055, B.neckHeight, m.skin,
      0, torsoTop + B.neckHeight / 2, 0);

    // Head
    this.meshes.head = this._sphere(B.headRadius, m.skin, 0, headCY, 0);

    // Eyes
    const eyeR = 0.028, eyeGap = B.headRadius * 0.38;
    const eyeFwd = -(B.headRadius * 0.9), eyeY = headCY + B.headRadius * 0.1;
    this.meshes.eyeL = this._sphere(eyeR, m.eye, -eyeGap, eyeY, eyeFwd);
    this.meshes.eyeR = this._sphere(eyeR, m.eye,  eyeGap, eyeY, eyeFwd);
  }

  // ─── Accessories ───────────────────────────────────────

  _addAccessories() {
    const m = this._mats;

    // ── Security cap ──
    const capY = this._headY + B.headRadius * 0.6;
    // Cap dome
    this.meshes.cap = this._cyl(B.headRadius * 0.7, B.headRadius * 0.85, 0.10, m.cap,
      0, capY, -0.02, 12);
    // Cap brim
    this.meshes.brim = this._box(B.headRadius * 1.6, 0.02, B.headRadius * 0.8, m.cap,
      0, capY - 0.04, -(B.headRadius * 0.6));
    // Gold band
    this.meshes.capBand = this._box(B.headRadius * 1.5, 0.03, 0.02, m.capBand,
      0, capY - 0.02, -(B.headRadius * 0.35));

    // ── Badge on chest ──
    this.meshes.badge = this._box(0.07, 0.07, 0.02, m.badge,
      -0.08, this._torsoTopY - 0.18, -(B.torsoDepth / 2 + 0.01));

    // ── Shoulder radio ──
    this.meshes.radio = this._box(0.04, 0.12, 0.03, m.radio,
      B.shoulderWidth / 2 + 0.02, this._torsoTopY - 0.04, 0);
    // Radio antenna
    this.meshes.antenna = this._cyl(0.008, 0.005, 0.10, m.radio,
      B.shoulderWidth / 2 + 0.02, this._torsoTopY + 0.06, 0);

    // ── Epaulettes (shoulder patches) ──
    this.meshes.epL = this._box(0.10, 0.02, B.torsoDepth * 0.6, m.capBand,
      -(B.shoulderWidth / 2), this._torsoTopY + 0.01, 0);
    this.meshes.epR = this._box(0.10, 0.02, B.torsoDepth * 0.6, m.capBand,
       (B.shoulderWidth / 2), this._torsoTopY + 0.01, 0);
  }

  // ─── Floating Label ────────────────────────────────────

  _buildLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
    this._roundRect(ctx, 28, 6, 200, 52, 10);
    ctx.fill();

    ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff6644';
    ctx.fillText(`GUARD`, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.30, 1);
    sprite.position.set(0, this._totalHeight + 0.45, 0);
    sprite.renderOrder = 999;
    this.group.add(sprite);
  }

  // ─── Detection Cone Visualisation ──────────────────────

  _buildDetectionCone() {
    const range     = this.detectionRange;
    const halfAngle = this.detectionAngle / 2;
    const segments  = 20;

    // Build a flat fan shape in XY, then rotate to XZ
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const a = -halfAngle + (this.detectionAngle * i / segments);
      shape.lineTo(Math.sin(a) * range, -Math.cos(a) * range);
    }
    shape.lineTo(0, 0);

    const geo = new THREE.ShapeGeometry(shape);
    // Rotate from XY plane → XZ plane
    geo.rotateX(-Math.PI / 2);

    this._coneMat = new THREE.MeshBasicMaterial({
      color: COL.cone,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this._coneMesh = new THREE.Mesh(geo, this._coneMat);
    this._coneMesh.position.y = 0.05; // just above floor
    this._coneMesh.renderOrder = 1;
    this.group.add(this._coneMesh);
  }

  // ─── Geometry Helpers ──────────────────────────────────

  _box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _cyl(rTop, rBot, height, material, x, y, z, segs = 8) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, height, segs), material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _sphere(radius, material, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 8), material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
