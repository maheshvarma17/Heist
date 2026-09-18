/**
 * MovementSystem.js
 * Smoothly moves crew members between navigation points.
 *
 * Usage:
 *   movementSystem.moveTo(character, targetVector3, onComplete?)
 *   movementSystem.stop(character)
 *   movementSystem.isMoving(character)
 *   movementSystem.update(deltaSeconds)          // call every frame
 *
 * Designed so future milestones can feed it from an action queue.
 */

import * as THREE from 'three';

// ─── Tuning ─────────────────────────────────────────────────
const SPEED_SCALE       = 2.5;   // multiplied with character.speed
const ARRIVAL_THRESHOLD = 0.15;  // units — "close enough" to target
const ROTATION_SPEED    = 8.0;   // radians / second
const WALK_ANIM_RATE    = 8.0;   // phase speed multiplier
const LEG_SWING         = 0.30;  // max leg rotation (radians)
const ARM_SWING         = 0.18;  // max arm rotation (radians)
const BODY_SWAY         = 0.02;  // subtle torso z-rotation

// ─── Playable-area bounding box (generous, covers entire bank) ──
const BOUNDS = Object.freeze({
  minX: -17.5, maxX: 17.5,
  minZ: -21,   maxZ: 23.5,
});

// Reusable temporaries (avoids per-frame allocation)
const _dir = new THREE.Vector3();

// ═══════════════════════════════════════════════════════════════
export class MovementSystem {
  constructor() {
    /**
     * Active movement orders.
     * Map<CrewMember, { target: Vector3, onComplete: Function|null }>
     */
    this._orders = new Map();
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Start moving a character toward `target`.
   * Any previous order for that character is replaced.
   *
   * @param {CrewMember} character
   * @param {THREE.Vector3} target      – will be cloned internally
   * @param {Function}      [onComplete] – called with (character) on arrival
   */
  moveTo(character, target, onComplete = null) {
    this._orders.set(character, {
      target: target.clone(),
      onComplete,
    });
  }

  /**
   * Cancel movement for a character and reset its walk animation.
   */
  stop(character) {
    this._resetAnim(character);
    this._orders.delete(character);
  }

  /**
   * @returns {boolean} true if the character has an active move order.
   */
  isMoving(character) {
    return this._orders.has(character);
  }

  /**
   * Advance all active movements by `dt` seconds.
   * Call once per frame from the game loop.
   */
  update(dt) {
    for (const [character, order] of this._orders) {
      this._step(character, order, dt);
    }
  }

  // ─── Per-frame step ────────────────────────────────────────

  _step(character, order, dt) {
    const pos    = character.group.position;
    const target = order.target;

    // Direction on the XZ plane (Y handled separately for multi-floor)
    _dir.subVectors(target, pos);
    const dist = _dir.length();

    // ── Arrival check ──
    if (dist < ARRIVAL_THRESHOLD) {
      pos.copy(target);
      this._clamp(pos);
      this._resetAnim(character);
      this._orders.delete(character);
      if (order.onComplete) order.onComplete(character);
      return;
    }

    // ── Move toward target ──
    _dir.normalize();
    const speed    = character.speed * SPEED_SCALE;
    const stepDist = Math.min(speed * dt, dist);

    pos.addScaledVector(_dir, stepDist);
    this._clamp(pos);

    // ── Rotate toward movement direction ──
    // Three.js: rotation.y = 0 → facing −Z
    // We want the −Z face to point along _dir.
    const xzLen = Math.sqrt(_dir.x * _dir.x + _dir.z * _dir.z);
    if (xzLen > 0.001) {
      const targetAngle = Math.atan2(-_dir.x, -_dir.z);
      let diff = targetAngle - character.group.rotation.y;

      // Shortest-arc wrap
      if (diff >  Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;

      const maxRot = ROTATION_SPEED * dt;
      character.group.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), maxRot);
    }

    // ── Procedural walk animation ──
    this._animateWalk(character, dt);
  }

  // ─── Walk animation ────────────────────────────────────────

  _animateWalk(character, dt) {
    // Accumulate phase
    if (character._walkPhase === undefined) character._walkPhase = 0;
    character._walkPhase += dt * character.speed * WALK_ANIM_RATE;
    const p = character._walkPhase;

    const legAngle = Math.sin(p) * LEG_SWING;
    const armAngle = Math.sin(p) * ARM_SWING;
    const sway     = Math.sin(p * 0.5) * BODY_SWAY;

    const m = character.meshes;

    // Legs — opposite swing
    if (m.legL) m.legL.rotation.x =  legAngle;
    if (m.legR) m.legR.rotation.x = -legAngle;

    // Shoes follow legs
    if (m.shoeL) m.shoeL.rotation.x =  legAngle * 0.5;
    if (m.shoeR) m.shoeR.rotation.x = -legAngle * 0.5;

    // Arms — counter-swing
    if (m.armL) m.armL.rotation.x = -armAngle;
    if (m.armR) m.armR.rotation.x =  armAngle;

    // Subtle torso sway
    if (m.torso) m.torso.rotation.z = sway;
  }

  // ─── Reset walk animation ──────────────────────────────────

  _resetAnim(character) {
    character._walkPhase = 0;
    const m = character.meshes;

    if (m.legL)  m.legL.rotation.x  = 0;
    if (m.legR)  m.legR.rotation.x  = 0;
    if (m.shoeL) m.shoeL.rotation.x = 0;
    if (m.shoeR) m.shoeR.rotation.x = 0;
    if (m.armL)  m.armL.rotation.x  = 0;
    if (m.armR)  m.armR.rotation.x  = 0;
    if (m.torso) m.torso.rotation.z = 0;
  }

  // ─── Boundary clamp ────────────────────────────────────────

  _clamp(pos) {
    pos.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, pos.x));
    pos.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, pos.z));
  }
}
