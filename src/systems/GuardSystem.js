/**
 * GuardSystem.js
 * State-machine + movement for bank guards.
 *
 * States:
 *   PATROL      – follow waypoints, check for crew in vision cone
 *   INVESTIGATE – move to last-known crew position, look around
 *   RETURN      – move back to nearest patrol waypoint, then resume
 *
 * Detection is pure game-math (distance + angle), no AI / ML.
 */

import * as THREE from 'three';
import { isInVisionCone } from '../utils/Detection.js';

// ─── State Constants ────────────────────────────────────────
export const GuardState = Object.freeze({
  PATROL:      'PATROL',
  INVESTIGATE: 'INVESTIGATE',
  RETURN:      'RETURN',
});

// ─── Tuning ─────────────────────────────────────────────────
const WAYPOINT_THRESHOLD  = 0.3;    // how close = "arrived" at a waypoint
const PATROL_WAIT         = 1.5;    // seconds to wait at each patrol point
const INVESTIGATE_LINGER  = 2.5;    // seconds lingering at investigation site
const ROTATION_SPEED      = 6.0;    // radians / sec
const WALK_ANIM_RATE      = 7.0;
const LEG_SWING           = 0.28;
const ARM_SWING           = 0.16;

// Cone colours per state
const CONE_COLOR = {
  [GuardState.PATROL]:      0x44ff44,  // green
  [GuardState.INVESTIGATE]: 0xff4444,  // red
  [GuardState.RETURN]:      0xffaa33,  // amber
};

// Reusable temp vector
const _dir = new THREE.Vector3();

// ═══════════════════════════════════════════════════════════════

export class GuardSystem {
  /**
   * @param {import('../entities/Guards.js').Guards} guards
   * @param {Function} [onDetection] – (guard, crewMember) called on first detection
   */
  constructor(guards, onDetection = null) {
    this._guards      = guards;
    this._onDetection = onDetection;
    /** @type {import('../entities/CrewMember.js').CrewMember[]} */
    this._crewMembers = [];

    // Per-guard state
    this._states = new Map();
    for (const guard of guards.members) {
      this._states.set(guard, {
        state:        GuardState.PATROL,
        patrolIndex:  0,
        waitTimer:    0,
        target:       null,               // current movement target (Vector3)
        lastKnown:    new THREE.Vector3(), // last known crew position
        lingerTimer:  0,
        walkPhase:    0,
      });
    }
  }

  /** Provide the crew member list so guards can scan for them. */
  setCrewMembers(members) {
    this._crewMembers = members;
  }

  /** Reset all guards to PATROL at waypoint 0. */
  reset() {
    this._guards.resetAll();
    for (const [guard, s] of this._states) {
      s.state       = GuardState.PATROL;
      s.patrolIndex = 0;
      s.waitTimer   = 0;
      s.target      = null;
      s.lingerTimer = 0;
      s.walkPhase   = 0;
      guard.setConeColor(CONE_COLOR[GuardState.PATROL]);
      this._resetAnim(guard);
    }
  }

  /** Per-frame update — call only during EXECUTING phase. */
  update(dt) {
    for (const guard of this._guards.members) {
      const s = this._states.get(guard);

      switch (s.state) {
        case GuardState.PATROL:      this._updatePatrol(guard, s, dt);      break;
        case GuardState.INVESTIGATE: this._updateInvestigate(guard, s, dt); break;
        case GuardState.RETURN:      this._updateReturn(guard, s, dt);      break;
      }
    }
  }

  // ─── PATROL ────────────────────────────────────────────

  _updatePatrol(guard, s, dt) {
    const route = this._guards.getRoute(guard);

    // Waiting at waypoint?
    if (s.waitTimer > 0) {
      s.waitTimer -= dt;
      // Still scan while waiting
      if (this._scanForCrew(guard, s)) return;
      return;
    }

    // Need a target?
    if (!s.target) {
      s.target = route[s.patrolIndex].clone();
    }

    // Move toward target
    if (this._moveToward(guard, s, dt)) {
      // Arrived at waypoint
      s.target    = null;
      s.waitTimer = PATROL_WAIT;
      s.patrolIndex = (s.patrolIndex + 1) % route.length;
      this._resetAnim(guard);
    }

    // Scan for crew
    this._scanForCrew(guard, s);
  }

  // ─── INVESTIGATE ───────────────────────────────────────

  _updateInvestigate(guard, s, dt) {
    // Move to last known position
    if (!s.target) {
      s.target = s.lastKnown.clone();
    }

    if (this._moveToward(guard, s, dt)) {
      // Arrived at investigation site — linger
      this._resetAnim(guard);

      if (s.lingerTimer <= 0) {
        s.lingerTimer = INVESTIGATE_LINGER;
      }

      s.lingerTimer -= dt;
      if (s.lingerTimer <= 0) {
        // Done investigating → return to patrol
        this._changeState(guard, s, GuardState.RETURN);
        s.target = null;
      }
    }
  }

  // ─── RETURN ────────────────────────────────────────────

  _updateReturn(guard, s, dt) {
    if (!s.target) {
      // Find nearest patrol waypoint
      const route = this._guards.getRoute(guard);
      let bestDist = Infinity;
      let bestIdx  = 0;
      for (let i = 0; i < route.length; i++) {
        const d = guard.group.position.distanceTo(route[i]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      s.patrolIndex = bestIdx;
      s.target = route[bestIdx].clone();
    }

    if (this._moveToward(guard, s, dt)) {
      // Back on route → resume patrol
      this._resetAnim(guard);
      s.target    = null;
      s.waitTimer = 0.5;
      s.patrolIndex = (s.patrolIndex + 1) % this._guards.getRoute(guard).length;
      this._changeState(guard, s, GuardState.PATROL);
    }
  }

  // ─── Crew Detection ────────────────────────────────────

  _scanForCrew(guard, s) {
    for (const member of this._crewMembers) {
      if (isInVisionCone(
        guard.group, member.group,
        guard.detectionRange,
        guard.detectionAngle / 2,
      )) {
        // Detected!
        s.lastKnown.copy(member.group.position);
        s.target      = null;
        s.lingerTimer = 0;

        console.log(`[GUARD] ${guard.name} detected ${member.role.toUpperCase()}`);

        this._changeState(guard, s, GuardState.INVESTIGATE);

        if (this._onDetection) {
          this._onDetection(guard, member);
        }
        return true;
      }
    }
    return false;
  }

  // ─── State Change ──────────────────────────────────────

  _changeState(guard, s, newState) {
    if (s.state === newState) return;
    const oldState = s.state;
    s.state = newState;

    guard.setConeColor(CONE_COLOR[newState]);

    console.log(`[GUARD] ${guard.name} → ${newState}  (was ${oldState})`);
  }

  // ─── Movement ──────────────────────────────────────────

  /**
   * Move guard toward s.target. Returns true when arrived.
   */
  _moveToward(guard, s, dt) {
    if (!s.target) return false;

    _dir.subVectors(s.target, guard.group.position);
    _dir.y = 0;
    const dist = _dir.length();

    if (dist < WAYPOINT_THRESHOLD) return true;

    _dir.normalize();
    const step = Math.min(guard.speed * dt, dist);
    guard.group.position.addScaledVector(_dir, step);

    // Smooth rotation toward direction
    const targetAngle = Math.atan2(-_dir.x, -_dir.z);
    let diff = targetAngle - guard.group.rotation.y;
    if (diff >  Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const maxRot = ROTATION_SPEED * dt;
    guard.group.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), maxRot);

    // Walk animation
    this._animateWalk(guard, s, dt);

    return false;
  }

  // ─── Walk Animation ────────────────────────────────────

  _animateWalk(guard, s, dt) {
    s.walkPhase += dt * guard.speed * WALK_ANIM_RATE;
    const p = s.walkPhase;
    const leg = Math.sin(p) * LEG_SWING;
    const arm = Math.sin(p) * ARM_SWING;
    const m = guard.meshes;

    if (m.legL)  m.legL.rotation.x  =  leg;
    if (m.legR)  m.legR.rotation.x  = -leg;
    if (m.shoeL) m.shoeL.rotation.x =  leg * 0.5;
    if (m.shoeR) m.shoeR.rotation.x = -leg * 0.5;
    if (m.armL)  m.armL.rotation.x  = -arm;
    if (m.armR)  m.armR.rotation.x  =  arm;
  }

  _resetAnim(guard) {
    const m = guard.meshes;
    if (m.legL)  m.legL.rotation.x  = 0;
    if (m.legR)  m.legR.rotation.x  = 0;
    if (m.shoeL) m.shoeL.rotation.x = 0;
    if (m.shoeR) m.shoeR.rotation.x = 0;
    if (m.armL)  m.armL.rotation.x  = 0;
    if (m.armR)  m.armR.rotation.x  = 0;
  }
}
