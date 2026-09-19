/**
 * CrewMember.js
 * Base class for heist crew members.
 * Builds a stylized procedural character from Three.js primitives.
 *
 * Subclasses override `_addAccessories()` to attach role-specific gear.
 */

import * as THREE from 'three';

// ─── Default Body Proportions ───────────────────────────────
const DEFAULTS = {
  headRadius:    0.18,
  torsoWidth:    0.32,
  torsoHeight:   0.50,
  torsoDepth:    0.20,
  armRadius:     0.055,
  armLength:     0.42,
  legRadius:     0.075,
  legLength:     0.50,
  shoulderWidth: 0.38,
  hipWidth:      0.22,
  shoeHeight:    0.10,
  neckHeight:    0.06,
};

export class CrewMember {
  /**
   * @param {Object}          config
   * @param {string}          config.name     – Display name
   * @param {string}          config.role     – Role identifier
   * @param {number}          [config.speed]  – Movement speed multiplier
   * @param {THREE.Vector3}   [config.position]
   * @param {Object}          [config.body]   – Proportion overrides
   * @param {Object}          config.colors   – { primary, secondary, accent, skin, shoe }
   */
  constructor(config) {
    this.name  = config.name;
    this.role  = config.role;
    this.speed = config.speed ?? 1.0;

    this.group = new THREE.Group();
    this.group.name = `Crew_${this.name}`;

    /** @type {Object.<string, THREE.Mesh>} Part name → mesh */
    this.meshes = {};

    // Merge body proportions with defaults
    this._body = { ...DEFAULTS, ...config.body };
    this._colors = config.colors;

    // Build the character
    this._createMaterials();
    this._buildBody();
    this._addAccessories();   // overridden by subclasses
    this._buildLabel();

    // Set position
    if (config.position) {
      this.group.position.copy(config.position);
    }
  }

  // ─── Public API ────────────────────────────────────────

  /** World position of this character. */
  get position() { return this.group.position; }

  /** Add this character into a scene or group. */
  addToScene(parent) { parent.add(this.group); }

  // ─── Materials ─────────────────────────────────────────

  _createMaterials() {
    const c = this._colors;

    this._mats = {
      skin: new THREE.MeshStandardMaterial({
        color: c.skin ?? 0x1f140e, roughness: 0.7, metalness: 0.05,
      }),
      primary: new THREE.MeshStandardMaterial({
        color: c.primary ?? 0x111116, roughness: 0.75, metalness: 0.12,
      }),
      secondary: new THREE.MeshStandardMaterial({
        color: c.secondary ?? 0x09090c, roughness: 0.75, metalness: 0.12,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: c.accent, roughness: 0.55, metalness: 0.18,
      }),
      shoe: new THREE.MeshStandardMaterial({
        color: c.shoe ?? 0x06060a, roughness: 0.8, metalness: 0.1,
      }),
      eye: new THREE.MeshStandardMaterial({
        color: 0x080808, roughness: 0.3, metalness: 0.1,
      }),
    };
  }

  // ─── Body Construction ─────────────────────────────────

  _buildBody() {
    const b   = this._body;
    const mat = this._mats;

    // ── Vertical stacking ──
    const shoeTop  = b.shoeHeight;
    const legTop   = shoeTop + b.legLength;
    const gap      = 0.04;                       // small gap between legs and torso
    const torsoBot = legTop + gap;
    const torsoTop = torsoBot + b.torsoHeight;
    const neckTop  = torsoTop + b.neckHeight;
    const headCY   = neckTop + b.headRadius;     // center-Y of head sphere

    this._headY       = headCY;
    this._torsoTopY   = torsoTop;
    this._totalHeight = headCY + b.headRadius;

    // ── Shoes ──
    const shoeW = b.legRadius * 2.4;
    const shoeD = b.legRadius * 3.0;
    this.meshes.shoeL = this._box(shoeW, b.shoeHeight, shoeD, mat.shoe,
      -b.hipWidth / 2, b.shoeHeight / 2, 0);
    this.meshes.shoeR = this._box(shoeW, b.shoeHeight, shoeD, mat.shoe,
       b.hipWidth / 2, b.shoeHeight / 2, 0);

    // ── Legs ──
    this.meshes.legL = this._cyl(b.legRadius, b.legRadius * 0.88, b.legLength, mat.secondary,
      -b.hipWidth / 2, shoeTop + b.legLength / 2, 0);
    this.meshes.legR = this._cyl(b.legRadius, b.legRadius * 0.88, b.legLength, mat.secondary,
       b.hipWidth / 2, shoeTop + b.legLength / 2, 0);

    // ── Belt / waist accent ──
    this.meshes.belt = this._box(b.torsoWidth + 0.04, 0.05, b.torsoDepth + 0.04, mat.accent,
      0, torsoBot + 0.025, 0);

    // ── Torso ──
    this.meshes.torso = this._box(b.torsoWidth, b.torsoHeight, b.torsoDepth, mat.primary,
      0, torsoBot + b.torsoHeight / 2, 0);

    // ── Arms ──
    const armHangY = torsoTop - 0.06;
    const armCY    = armHangY - b.armLength / 2;
    const armX     = b.shoulderWidth / 2 + b.armRadius + 0.01;

    this.meshes.armL = this._cyl(b.armRadius, b.armRadius * 0.78, b.armLength, mat.primary,
      -armX, armCY, 0);
    this.meshes.armR = this._cyl(b.armRadius, b.armRadius * 0.78, b.armLength, mat.primary,
       armX, armCY, 0);

    // ── Hands ──
    const handY = armHangY - b.armLength;
    this.meshes.handL = this._sphere(b.armRadius * 1.1, mat.skin,
      -armX, handY, 0);
    this.meshes.handR = this._sphere(b.armRadius * 1.1, mat.skin,
       armX, handY, 0);

    // ── Neck ──
    this.meshes.neck = this._cyl(0.055, 0.055, b.neckHeight, mat.skin,
      0, torsoTop + b.neckHeight / 2, 0);

    // ── Head ──
    this.meshes.head = this._sphere(b.headRadius, mat.skin, 0, headCY, 0);

    // ── Eyes ──
    const eyeR  = 0.028;
    const eyeGap = b.headRadius * 0.38;
    const eyeFwd = -(b.headRadius * 0.9);
    const eyeY   = headCY + b.headRadius * 0.1;

    this.meshes.eyeL = this._sphere(eyeR, mat.eye, -eyeGap, eyeY, eyeFwd);
    this.meshes.eyeR = this._sphere(eyeR, mat.eye,  eyeGap, eyeY, eyeFwd);
  }

  /**
   * Override in subclasses to add role-specific accessories.
   * Called after `_buildBody()`, so all meshes and measurements are available.
   */
  _addAccessories() {
    // Base class: no accessories
  }

  // ─── Floating Label & Local Indicator ──────────────────

  _buildLabel() {
    this._labelCanvas = document.createElement('canvas');
    this._labelCanvas.width  = 300;
    this._labelCanvas.height = 90;
    this._labelTexture = new THREE.CanvasTexture(this._labelCanvas);

    const spriteMat = new THREE.SpriteMaterial({
      map: this._labelTexture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.5, 0.45, 1);
    sprite.position.set(0, this._totalHeight + 0.42, 0);
    sprite.renderOrder = 999;

    this.group.add(sprite);
    this.label = sprite;

    this._drawLabel(this.name, false);
  }

  /**
   * Update floating label with player name, local ownership badge, and optional status tag.
   * @param {string} [playerName]
   * @param {boolean} [isLocal=false]
   * @param {string} [statusTag=null]
   */
  updatePlayerLabel(playerName, isLocal = false, statusTag = null) {
    this._drawLabel(playerName || this.name, isLocal, statusTag);
    this._setLocalIndicator(isLocal);
  }

  _drawLabel(playerName, isLocal, statusTag = null) {
    if (!this._labelCanvas || !this._labelTexture) return;
    const ctx = this._labelCanvas.getContext('2d');
    ctx.clearRect(0, 0, 300, 90);

    const accentHex = '#' + this._colors.accent.toString(16).padStart(6, '0');

    // Background pill (Light theme aesthetic with subtle border)
    if (statusTag === 'ESCAPED') {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
    } else {
      ctx.fillStyle = isLocal ? 'rgba(2, 132, 199, 0.90)' : 'rgba(255, 255, 255, 0.92)';
    }
    this._canvasRoundRect(ctx, 15, 6, 270, 78, 12);
    ctx.fill();

    // Border
    ctx.lineWidth = isLocal ? 3 : 2;
    ctx.strokeStyle = statusTag === 'ESCAPED' ? '#ffffff' : (isLocal ? '#ffffff' : accentHex);
    ctx.stroke();

    // Role text
    ctx.font = 'bold 22px Inter, system-ui, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = (isLocal || statusTag === 'ESCAPED') ? '#ffffff' : '#0f172a';
    
    let roleText = isLocal ? `${this.role.toUpperCase()} (YOU)` : this.role.toUpperCase();
    if (statusTag === 'ESCAPED') {
      roleText = isLocal ? `${this.role.toUpperCase()} [ESCAPED]` : `${this.role.toUpperCase()} [ESCAPED]`;
    }
    ctx.fillText(roleText, 150, 30);

    // Player name sub-text
    ctx.font = '600 18px Inter, system-ui, Arial, sans-serif';
    ctx.fillStyle = (isLocal || statusTag === 'ESCAPED') ? '#ecfdf5' : '#475569';
    ctx.fillText(playerName || this.name, 150, 58);

    this._labelTexture.needsUpdate = true;
  }

  _setLocalIndicator(isLocal) {
    if (isLocal) {
      if (!this._ringMesh) {
        const ringGeo = new THREE.RingGeometry(0.35, 0.45, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x0284c7,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        this._ringMesh = new THREE.Mesh(ringGeo, ringMat);
        this._ringMesh.rotation.x = -Math.PI / 2;
        this._ringMesh.position.y = 0.02;
        this.group.add(this._ringMesh);
      }
      this._ringMesh.visible = true;
    } else if (this._ringMesh) {
      this._ringMesh.visible = false;
    }
  }

  /** Manual roundRect for full browser compatibility. */
  _canvasRoundRect(ctx, x, y, w, h, r) {
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

  // ─── Geometry Helpers (used by subclasses too) ─────────

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
}
