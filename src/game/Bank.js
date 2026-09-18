/**
 * Bank.js
 * Procedurally generates the full bank environment for HEIST: 60 SECONDS.
 *
 * Layout (top-down view, Z− = north, Z+ = south):
 *
 *              ROOFTOP (y = 4)
 *                  │
 *           ┌──────┴──────┐
 *           │   HALLWAY   │  z: [−12, −8]
 *           └──┬──────┬───┘
 *              │      │
 *      ┌──────┘      └──────┐
 *      │                     │
 *   SECURITY              OFFICE
 *   x[−16,−6]           x[6, 16]
 *   z[−8,  2]           z[−8, 2]
 *      │                     │
 *      └──────┐      ┌──────┘
 *             │      │
 *          ┌──┴──────┴──┐
 *          │    VAULT    │  z: [0, 10]
 *          └──────┬─────┘
 *                 │
 *          ┌──────┴─────┐
 *          │   LOBBY    │  z: [10, 22]
 *          │  ENTRANCE  │
 *          └────────────┘
 */

import * as THREE from 'three';

// ─── Dimensions ─────────────────────────────────────────────
const H  = 4;       // wall height
const T  = 0.3;     // wall thickness
const DH = 3.2;     // door-opening height
const ROOFTOP_Y = 4;
const PARAPET_H = 1.2;

// ─── Color Palette ──────────────────────────────────────────
const PAL = Object.freeze({
  // Floors
  lobbyFloor:   0x3d3428,
  vaultFloor:   0x14142a,
  secFloor:     0x1a1518,
  officeFloor:  0x2a2418,
  hallFloor:    0x1e1e2c,
  roofFloor:    0x2a2a2a,
  ground:       0x08080e,

  // Walls
  lobbyWall:    0x4a4035,
  vaultWall:    0x1e1e38,
  secWall:      0x251822,
  officeWall:   0x3a3025,
  hallWall:     0x262436,
  roofWall:     0x333333,

  // Ceilings
  ceiling:      0x131318,

  // Props
  vaultDoor:    0x556070,
  desk:         0x3a2a1a,
  counter:      0x4a3a2a,
  chair:        0x222228,
  computer:     0x1a1a1e,
  screen:       0x1155cc,
  shelf:        0x3a3530,
  serverRack:   0x111114,
  gold:         0xdaa520,
  safe:         0x3a3a4a,
  plant:        0x1a3a1a,
  plantPot:     0x5a3a2a,
  railing:      0x555566,
  doorFrame:    0x444450,
});

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

/** Create a MeshStandardMaterial with sensible defaults. */
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0.08,
    ...opts,
  });
}

/** Create an emissive material (for screens, lights, etc.). */
function emMat(color, emissive, intensity = 0.9) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.15,
  });
}

/** Add a box mesh to a parent group. Returns the mesh. */
function box(parent, w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Add a floor plane (XZ) to a parent group. */
function floor(parent, w, d, material, x, z, y = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y + 0.01, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Add a ceiling plane (XZ, flipped) to a parent group. */
function ceiling(parent, w, d, material, x, z, y = H) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/**
 * Build wall segments along the X axis at a fixed Z.
 * @param {THREE.Group} parent
 * @param {number} z         – Z position of the wall
 * @param {Array}  segments  – [{ x1, x2, h?, yBase? }]
 * @param {THREE.Material} material
 */
function xWall(parent, z, segments, material) {
  for (const s of segments) {
    const w = s.x2 - s.x1;
    const cx = (s.x1 + s.x2) / 2;
    const sh = s.h ?? H;
    const yb = s.yBase ?? 0;
    box(parent, w, sh, T, material, cx, yb + sh / 2, z);
  }
}

/**
 * Build wall segments along the Z axis at a fixed X.
 * @param {THREE.Group} parent
 * @param {number} x         – X position of the wall
 * @param {Array}  segments  – [{ z1, z2, h?, yBase? }]
 * @param {THREE.Material} material
 */
function zWall(parent, x, segments, material) {
  for (const s of segments) {
    const d = s.z2 - s.z1;
    const cz = (s.z1 + s.z2) / 2;
    const sh = s.h ?? H;
    const yb = s.yBase ?? 0;
    box(parent, T, sh, d, material, x, yb + sh / 2, cz);
  }
}

/** Add a point light to the group. */
function pointLight(parent, color, intensity, x, y, z, distance = 14) {
  const light = new THREE.PointLight(color, intensity, distance);
  light.position.set(x, y, z);
  light.castShadow = false; // keep shadow budget for the directional
  parent.add(light);
  return light;
}

// ═══════════════════════════════════════════════════════════
//  Bank Class
// ═══════════════════════════════════════════════════════════

export class Bank {
  constructor() {
    /** Root group — add this to the scene. */
    this.group = new THREE.Group();
    this.group.name = 'Bank';

    /** References for future gameplay systems. */
    this.rooms        = {};
    this.doors        = [];
    this.vault        = null;
    this.securityRoom = null;
    this.escapeRoutes = [];

    // Shared materials (created once, reused)
    this._mats = {};

    this._createMaterials();
    this._buildGround();
    this._buildLobby();
    this._buildVault();
    this._buildSecurityRoom();
    this._buildOffice();
    this._buildHallway();
    this._buildRooftop();
    this._addRoomLighting();
    this._registerDoors();
    this._registerEscapeRoutes();
  }

  /** Add the entire bank to a Three.js scene. */
  addToScene(scene) {
    scene.add(this.group);
  }

  // ───────────────────────────────────────────────────────
  //  Materials
  // ───────────────────────────────────────────────────────

  _createMaterials() {
    const m = this._mats;
    // Floors
    m.lobbyFloor  = mat(PAL.lobbyFloor);
    m.vaultFloor  = mat(PAL.vaultFloor, { roughness: 0.5, metalness: 0.25 });
    m.secFloor    = mat(PAL.secFloor);
    m.officeFloor = mat(PAL.officeFloor);
    m.hallFloor   = mat(PAL.hallFloor);
    m.roofFloor   = mat(PAL.roofFloor, { roughness: 0.9 });
    m.ground      = mat(PAL.ground);
    // Walls
    m.lobbyWall   = mat(PAL.lobbyWall);
    m.vaultWall   = mat(PAL.vaultWall);
    m.secWall     = mat(PAL.secWall);
    m.officeWall  = mat(PAL.officeWall);
    m.hallWall    = mat(PAL.hallWall);
    m.roofWall    = mat(PAL.roofWall);
    // Ceiling
    m.ceiling     = mat(PAL.ceiling);
    // Props
    m.vaultDoor   = mat(PAL.vaultDoor, { roughness: 0.3, metalness: 0.8 });
    m.desk        = mat(PAL.desk);
    m.counter     = mat(PAL.counter);
    m.chair       = mat(PAL.chair);
    m.computer    = mat(PAL.computer);
    m.screen      = emMat(PAL.computer, PAL.screen, 1.2);
    m.shelf       = mat(PAL.shelf);
    m.serverRack  = mat(PAL.serverRack);
    m.gold        = mat(PAL.gold, { roughness: 0.25, metalness: 0.85 });
    m.safe        = mat(PAL.safe, { roughness: 0.4, metalness: 0.6 });
    m.plant       = mat(PAL.plant);
    m.plantPot    = mat(PAL.plantPot);
    m.railing     = mat(PAL.railing, { roughness: 0.4, metalness: 0.6 });
    m.doorFrame   = mat(PAL.doorFrame, { roughness: 0.5, metalness: 0.4 });
  }

  // ───────────────────────────────────────────────────────
  //  Ground plane
  // ───────────────────────────────────────────────────────

  _buildGround() {
    floor(this.group, 80, 80, this._mats.ground, 0, 0, -0.05);
  }

  // ───────────────────────────────────────────────────────
  //  LOBBY  x[−8, 8]  z[10, 22]  (16 × 12)
  // ───────────────────────────────────────────────────────

  _buildLobby() {
    const g = new THREE.Group();
    g.name = 'Lobby';
    const m = this._mats;

    // ── Floor & ceiling ──
    floor(g, 16, 12, m.lobbyFloor, 0, 16);
    ceiling(g, 16, 12, m.ceiling, 0, 16);

    // ── South wall (z = 22) — entrance opening x[−2, 2] ──
    xWall(g, 22, [
      { x1: -8, x2: -2 },
      { x1:  2, x2:  8 },
      { x1: -2, x2:  2, h: H - DH, yBase: DH },   // lintel
    ], m.lobbyWall);

    // ── West wall (x = −8) ──
    zWall(g, -8, [{ z1: 10, z2: 22 }], m.lobbyWall);

    // ── East wall (x = 8) ──
    zWall(g, 8, [{ z1: 10, z2: 22 }], m.lobbyWall);

    // ── North wall (z = 10) — vault entry x[−2, 2] ──
    // Lobby is 16 wide, vault is 12 wide → extra wall stubs at edges
    xWall(g, 10, [
      { x1: -8, x2: -2 },               // left of opening
      { x1:  2, x2:  8 },               // right of opening
      { x1: -2, x2:  2, h: H - DH, yBase: DH },  // lintel
    ], m.lobbyWall);

    // ── Furniture ──
    // Two service counters
    box(g, 5, 1.1, 1.2, m.counter, -3, 0.55, 18);
    box(g, 5, 1.1, 1.2, m.counter,  3, 0.55, 18);

    // Partition glass tops on counters (thin translucent)
    const glassMat = mat(0x88aacc, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.35 });
    box(g, 5, 0.8, 0.08, glassMat, -3, 1.5, 18);
    box(g, 5, 0.8, 0.08, glassMat,  3, 1.5, 18);

    // Waiting benches along west wall
    box(g, 0.5, 0.45, 3,  m.chair, -7, 0.225, 20);
    box(g, 0.5, 0.45, 3,  m.chair, -7, 0.225, 14);

    // Potted plants flanking the entrance
    this._addPlant(g, -6, 0, 21);
    this._addPlant(g,  6, 0, 21);

    // Welcome desk near entrance
    box(g, 2.5, 0.9, 1, m.desk, 5, 0.45, 20.5);
    // Computer on welcome desk
    this._addComputer(g, 5, 0.9, 20.5);

    this.group.add(g);
    this.rooms.lobby = {
      group: g,
      bounds: { x1: -8, x2: 8, z1: 10, z2: 22 },
    };
  }

  // ───────────────────────────────────────────────────────
  //  VAULT  x[−6, 6]  z[0, 10]  (12 × 10)
  // ───────────────────────────────────────────────────────

  _buildVault() {
    const g = new THREE.Group();
    g.name = 'Vault';
    const m = this._mats;

    // ── Floor & ceiling ──
    floor(g, 12, 10, m.vaultFloor, 0, 5);
    ceiling(g, 12, 10, m.ceiling, 0, 5);

    // ── South wall (z = 10) — already built by lobby ──

    // ── North wall (z = 0) — solid ──
    xWall(g, 0, [{ x1: -6, x2: 6 }], m.vaultWall);

    // ── West wall (x = −6) ──
    // z[0, 2]: opening to security room
    // z[2, 10]: solid
    zWall(g, -6, [
      { z1: 2, z2: 10 },                            // solid upper section
      { z1: 0, z2: 2, h: H - DH, yBase: DH },      // lintel above opening
    ], m.vaultWall);

    // ── East wall (x = 6) ──
    // z[0, 2]: opening to office
    // z[2, 10]: solid
    zWall(g, 6, [
      { z1: 2, z2: 10 },
      { z1: 0, z2: 2, h: H - DH, yBase: DH },
    ], m.vaultWall);

    // ── Vault door (iconic circular door near south entry) ──
    // Thick metallic disc flush with the south opening
    const doorGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.4, 32);
    const doorMesh = new THREE.Mesh(doorGeo, m.vaultDoor);
    doorMesh.rotation.x = Math.PI / 2;
    doorMesh.position.set(2.5, 1.6, 9.5);  // swung open to the right
    doorMesh.castShadow = true;
    g.add(doorMesh);

    // Door handle (small cylinder)
    const handleGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8);
    const handleMesh = new THREE.Mesh(handleGeo, m.vaultDoor);
    handleMesh.position.set(2.5, 1.6, 9.28);
    g.add(handleMesh);

    // Vault wheel (torus on the door)
    const wheelGeo = new THREE.TorusGeometry(0.5, 0.06, 8, 24);
    const wheelMesh = new THREE.Mesh(wheelGeo, m.doorFrame);
    wheelMesh.rotation.x = Math.PI / 2;
    wheelMesh.position.set(2.5, 1.6, 9.28);
    g.add(wheelMesh);

    // ── Furniture ──
    // Safety-deposit shelving along north wall
    box(g, 10, 2.8, 0.6, m.safe, 0, 1.4, 0.5);

    // Central pedestal with gold
    box(g, 1.5, 0.7, 1.5, m.shelf, 0, 0.35, 5);
    // Gold bars on pedestal
    for (let i = -1; i <= 1; i++) {
      box(g, 0.35, 0.15, 0.2, m.gold, i * 0.45, 0.775, 5);
    }

    // Side shelves with safe boxes
    box(g, 0.6, 2.5, 4, m.safe, -5.3, 1.25, 6);
    box(g, 0.6, 2.5, 4, m.safe,  5.3, 1.25, 6);

    this.group.add(g);
    this.rooms.vault = {
      group: g,
      bounds: { x1: -6, x2: 6, z1: 0, z2: 10 },
    };
    this.vault = this.rooms.vault;
  }

  // ───────────────────────────────────────────────────────
  //  SECURITY ROOM  x[−16, −6]  z[−8, 2]  (10 × 10)
  // ───────────────────────────────────────────────────────

  _buildSecurityRoom() {
    const g = new THREE.Group();
    g.name = 'SecurityRoom';
    const m = this._mats;

    // ── Floor & ceiling ──
    floor(g, 10, 10, m.secFloor, -11, -3);
    ceiling(g, 10, 10, m.ceiling, -11, -3);

    // ── South wall (z = 2) — solid ──
    xWall(g, 2, [{ x1: -16, x2: -6 }], m.secWall);

    // ── West wall (x = −16) — solid ──
    zWall(g, -16, [{ z1: -8, z2: 2 }], m.secWall);

    // ── East wall (x = −6) — partial (opening to vault at z[0, 2]) ──
    // z[0, 2] is handled by vault's west wall (lintel).
    // Security builds the rest: z[−8, 0]
    zWall(g, -6, [{ z1: -8, z2: 0 }], m.secWall);

    // ── North wall (z = −8) — opening to hallway x[−14, −11] (3 wide) ──
    xWall(g, -8, [
      { x1: -16, x2: -14 },
      { x1: -11, x2: -6 },
      { x1: -14, x2: -11, h: H - DH, yBase: DH },
    ], m.secWall);

    // ── Furniture ──
    // L-shaped monitoring desk
    box(g, 4, 0.8, 1.2, m.desk, -13.5, 0.4, -1);
    box(g, 1.2, 0.8, 3, m.desk, -15, 0.4, -3.5);

    // 3 security monitors
    this._addComputer(g, -14.5, 0.8, -1, 0.7);
    this._addComputer(g, -13, 0.8, -1, 0.7);
    this._addComputer(g, -11.5, 0.8, -1, 0.7);

    // Side monitor on vertical desk
    this._addComputer(g, -15, 0.8, -4, 0.6);

    // Office chair
    this._addChair(g, -13, 0, -2.5);

    // Server rack along west wall
    box(g, 0.8, 2.2, 2.5, m.serverRack, -15.3, 1.1, -6);
    // Server LEDs (small emissive accents)
    const ledMat = emMat(0x111111, 0x00ff44, 0.6);
    for (let i = 0; i < 4; i++) {
      box(g, 0.05, 0.05, 0.05, ledMat, -14.85, 0.6 + i * 0.4, -5.5 + i * 0.3);
    }

    this.group.add(g);
    this.rooms.security = {
      group: g,
      bounds: { x1: -16, x2: -6, z1: -8, z2: 2 },
    };
    this.securityRoom = this.rooms.security;
  }

  // ───────────────────────────────────────────────────────
  //  OFFICE  x[6, 16]  z[−8, 2]  (10 × 10)
  // ───────────────────────────────────────────────────────

  _buildOffice() {
    const g = new THREE.Group();
    g.name = 'Office';
    const m = this._mats;

    // ── Floor & ceiling ──
    floor(g, 10, 10, m.officeFloor, 11, -3);
    ceiling(g, 10, 10, m.ceiling, 11, -3);

    // ── South wall (z = 2) — solid ──
    xWall(g, 2, [{ x1: 6, x2: 16 }], m.officeWall);

    // ── East wall (x = 16) — solid ──
    zWall(g, 16, [{ z1: -8, z2: 2 }], m.officeWall);

    // ── West wall (x = 6) — partial (opening to vault at z[0, 2]) ──
    // z[0, 2] handled by vault's east wall
    zWall(g, 6, [{ z1: -8, z2: 0 }], m.officeWall);

    // ── North wall (z = −8) — opening to hallway x[11, 14] (3 wide) ──
    xWall(g, -8, [
      { x1: 6, x2: 11 },
      { x1: 14, x2: 16 },
      { x1: 11, x2: 14, h: H - DH, yBase: DH },
    ], m.officeWall);

    // ── Furniture ──
    // Manager desk (large)
    box(g, 3.5, 0.8, 1.5, m.desk, 11, 0.4, -5);
    this._addComputer(g, 11, 0.8, -5, 0.8);
    this._addChair(g, 11, 0, -6.5);

    // Staff desk
    box(g, 2.5, 0.8, 1, m.desk, 14, 0.4, -1);
    this._addComputer(g, 14, 0.8, -1, 0.65);
    this._addChair(g, 14, 0, -2.5);

    // Bookshelf along east wall
    box(g, 0.5, 2.4, 3, m.shelf, 15.5, 1.2, -5);

    // Filing cabinet
    box(g, 0.6, 1.3, 0.5, m.safe, 7, 0.65, -7);
    box(g, 0.6, 1.3, 0.5, m.safe, 7.8, 0.65, -7);

    // Small plant on manager desk
    this._addPlant(g, 9.5, 0.8, -5, 0.35);

    this.group.add(g);
    this.rooms.office = {
      group: g,
      bounds: { x1: 6, x2: 16, z1: -8, z2: 2 },
    };
  }

  // ───────────────────────────────────────────────────────
  //  HALLWAY  x[−16, 16]  z[−12, −8]  (32 × 4)
  // ───────────────────────────────────────────────────────

  _buildHallway() {
    const g = new THREE.Group();
    g.name = 'Hallway';
    const m = this._mats;

    // ── Floor & ceiling ──
    floor(g, 32, 4, m.hallFloor, 0, -10);
    ceiling(g, 32, 4, m.ceiling, 0, -10);

    // ── South wall (z = −8) ──
    // Openings for security (x[−14, −11]) and office (x[11, 14])
    // The center section (x[−6, 6]) backs onto exterior void — solid wall
    xWall(g, -8, [
      { x1: -16, x2: -14 },
      { x1: -14, x2: -11, h: H - DH, yBase: DH },  // security lintel
      { x1: -11, x2: 11 },                           // long center section
      { x1: 11, x2: 14, h: H - DH, yBase: DH },     // office lintel
      { x1: 14, x2: 16 },
    ], m.hallWall);

    // ── West wall (x = −16) ──
    zWall(g, -16, [{ z1: -12, z2: -8 }], m.hallWall);

    // ── East wall (x = 16) ──
    zWall(g, 16, [{ z1: -12, z2: -8 }], m.hallWall);

    // ── North wall (z = −12) ──
    // Opening to rooftop stairwell x[−2, 2]
    xWall(g, -12, [
      { x1: -16, x2: -2 },
      { x1:  2, x2: 16 },
      { x1: -2, x2:  2, h: H - DH, yBase: DH },
    ], m.hallWall);

    this.group.add(g);
    this.rooms.hallway = {
      group: g,
      bounds: { x1: -16, x2: 16, z1: -12, z2: -8 },
    };
  }

  // ───────────────────────────────────────────────────────
  //  ROOFTOP  x[−6, 6]  z[−20, −12]  floor y = 4
  // ───────────────────────────────────────────────────────

  _buildRooftop() {
    const g = new THREE.Group();
    g.name = 'Rooftop';
    const m = this._mats;

    // ── Elevated floor ──
    floor(g, 12, 8, m.roofFloor, 0, -16, ROOFTOP_Y);

    // ── Parapet walls (low walls around the edge, no ceiling) ──
    // South parapet (z = −12) — opening for stairs x[−2, 2]
    xWall(g, -12, [
      { x1: -6, x2: -2, h: PARAPET_H, yBase: ROOFTOP_Y },
      { x1:  2, x2:  6, h: PARAPET_H, yBase: ROOFTOP_Y },
    ], m.roofWall);

    // North parapet (z = −20)
    xWall(g, -20, [
      { x1: -6, x2: 6, h: PARAPET_H, yBase: ROOFTOP_Y },
    ], m.roofWall);

    // West parapet (x = −6)
    zWall(g, -6, [
      { z1: -20, z2: -12, h: PARAPET_H, yBase: ROOFTOP_Y },
    ], m.roofWall);

    // East parapet (x = 6)
    zWall(g, 6, [
      { z1: -20, z2: -12, h: PARAPET_H, yBase: ROOFTOP_Y },
    ], m.roofWall);

    // ── Stairwell enclosure (walls from ground to rooftop at stair opening) ──
    // Left wall of stairwell
    zWall(g, -2, [{ z1: -16, z2: -12, h: ROOFTOP_Y + PARAPET_H }], m.hallWall);
    // Right wall of stairwell
    zWall(g, 2,  [{ z1: -16, z2: -12, h: ROOFTOP_Y + PARAPET_H }], m.hallWall);
    // Back wall of stairwell
    xWall(g, -16, [{ x1: -2, x2: 2, h: ROOFTOP_Y + PARAPET_H }], m.hallWall);

    // ── Stairs (8 steps from y=0 to y=ROOFTOP_Y) ──
    const stepH = ROOFTOP_Y / 8;
    const stepD = 4 / 8; // spread over 4 units of Z
    for (let i = 0; i < 8; i++) {
      const yTop = (i + 1) * stepH;
      const zPos = -12 - (i + 0.5) * stepD;
      box(g, 3.6, stepH, stepD, m.hallFloor, 0, yTop - stepH / 2, zPos);
    }

    // ── Stair floor (ground level inside stairwell) ──
    floor(g, 4, 4, m.hallFloor, 0, -14);

    // ── Rooftop props ──
    // AC units
    box(g, 2, 1.2, 1.5, m.serverRack, -4, ROOFTOP_Y + 0.6, -18);
    box(g, 1.5, 1,  1.5, m.serverRack,  4, ROOFTOP_Y + 0.5, -18);

    // Railing along the parapet top edge (north side)
    box(g, 12, 0.06, 0.06, m.railing, 0, ROOFTOP_Y + PARAPET_H + 0.4, -20);
    // Railing posts
    for (let x = -5; x <= 5; x += 2.5) {
      box(g, 0.06, 0.4, 0.06, m.railing, x, ROOFTOP_Y + PARAPET_H + 0.2, -20);
    }

    this.group.add(g);
    this.rooms.rooftop = {
      group: g,
      bounds: { x1: -6, x2: 6, z1: -20, z2: -12, y: ROOFTOP_Y },
    };
  }

  // ───────────────────────────────────────────────────────
  //  Room Lighting
  // ───────────────────────────────────────────────────────

  _addRoomLighting() {
    const lg = this.group;

    // ── Lobby — warm inviting light ──
    pointLight(lg, 0xffe8c8, 1.4, 0, 3.5, 16, 18);
    pointLight(lg, 0xffddaa, 0.6, -5, 3.5, 13, 10);
    pointLight(lg, 0xffddaa, 0.6,  5, 3.5, 13, 10);

    // ── Vault — cool blueish, dramatic ──
    pointLight(lg, 0x8899dd, 1.0, 0, 3.5, 5, 14);
    pointLight(lg, 0x6677bb, 0.5, 0, 3.5, 2, 10);

    // ── Security — red/amber accent ──
    pointLight(lg, 0xcc3333, 0.7, -11, 3.5, -3, 12);
    pointLight(lg, 0xff4444, 0.4, -14, 3.5, -6, 8);
    // Dim overhead
    pointLight(lg, 0x888899, 0.4, -11, 3.5, -3, 14);

    // ── Office — warm working light ──
    pointLight(lg, 0xffeebb, 1.0, 11, 3.5, -3, 14);
    pointLight(lg, 0xffddaa, 0.5, 14, 3.5, -1, 10);

    // ── Hallway — neutral cool ──
    pointLight(lg, 0x8888aa, 0.6, -8, 3.5, -10, 16);
    pointLight(lg, 0x8888aa, 0.6,  0, 3.5, -10, 16);
    pointLight(lg, 0x8888aa, 0.6,  8, 3.5, -10, 16);

    // ── Rooftop — moonlight / sky ──
    pointLight(lg, 0x7788cc, 0.5, 0, ROOFTOP_Y + 6, -16, 20);
  }

  // ───────────────────────────────────────────────────────
  //  Door & Escape-Route Registration
  // ───────────────────────────────────────────────────────

  _registerDoors() {
    this.doors = [
      { id: 'entrance',          position: new THREE.Vector3(0, 0, 22),    connects: ['exterior', 'lobby'] },
      { id: 'lobby-vault',       position: new THREE.Vector3(0, 0, 10),    connects: ['lobby', 'vault'] },
      { id: 'vault-security',    position: new THREE.Vector3(-6, 0, 1),    connects: ['vault', 'security'] },
      { id: 'vault-office',      position: new THREE.Vector3(6, 0, 1),     connects: ['vault', 'office'] },
      { id: 'security-hallway',  position: new THREE.Vector3(-12.5, 0, -8), connects: ['security', 'hallway'] },
      { id: 'office-hallway',    position: new THREE.Vector3(12.5, 0, -8),  connects: ['office', 'hallway'] },
      { id: 'hallway-rooftop',   position: new THREE.Vector3(0, 0, -12),   connects: ['hallway', 'rooftop'] },
    ];
  }

  _registerEscapeRoutes() {
    this.escapeRoutes = [
      { id: 'front-exit',   position: new THREE.Vector3(0, 0, 22),         type: 'ground' },
      { id: 'rooftop-exit', position: new THREE.Vector3(0, ROOFTOP_Y, -20), type: 'rooftop' },
    ];
  }

  // ───────────────────────────────────────────────────────
  //  Reusable Furniture Helpers
  // ───────────────────────────────────────────────────────

  /** A simple potted plant (cylinder pot + sphere foliage). */
  _addPlant(parent, x, y, z, scale = 0.6) {
    const m = this._mats;
    // Pot
    const potGeo = new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 0.4 * scale, 8);
    const pot = new THREE.Mesh(potGeo, m.plantPot);
    pot.position.set(x, y + 0.2 * scale, z);
    pot.castShadow = true;
    parent.add(pot);

    // Foliage
    const leafGeo = new THREE.SphereGeometry(0.35 * scale, 8, 6);
    const leaf = new THREE.Mesh(leafGeo, m.plant);
    leaf.position.set(x, y + 0.55 * scale, z);
    leaf.castShadow = true;
    parent.add(leaf);
  }

  /** A computer monitor (thin box with emissive screen face). */
  _addComputer(parent, x, y, z, screenH = 0.55) {
    const m = this._mats;
    // Monitor body
    box(parent, 0.5, screenH, 0.05, m.computer, x, y + screenH / 2 + 0.05, z);
    // Screen (slightly in front)
    box(parent, 0.44, screenH - 0.06, 0.01, m.screen, x, y + screenH / 2 + 0.05, z - 0.03);
    // Stand
    box(parent, 0.1, 0.15, 0.15, m.computer, x, y + 0.075, z);
    // Base
    box(parent, 0.25, 0.02, 0.18, m.computer, x, y + 0.01, z);
  }

  /** A simple office chair (seat + backrest + base). */
  _addChair(parent, x, y, z) {
    const m = this._mats;
    // Seat
    box(parent, 0.5, 0.08, 0.5, m.chair, x, y + 0.45, z);
    // Backrest
    box(parent, 0.5, 0.5, 0.08, m.chair, x, y + 0.75, z + 0.22);
    // Pedestal
    box(parent, 0.08, 0.4, 0.08, m.chair, x, y + 0.2, z);
    // Base (cross shape approximated with two thin boxes)
    box(parent, 0.5, 0.04, 0.08, m.chair, x, y + 0.02, z);
    box(parent, 0.08, 0.04, 0.5, m.chair, x, y + 0.02, z);
  }
}
