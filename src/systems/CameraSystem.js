/**
 * CameraSystem.js
 * Handles scanning rotation and crew detection for all security cameras.
 *
 * States per camera:
 *   ACTIVE    – scanning normally
 *   DETECTING – crew member inside cone
 *   DISABLED  – turned off (future: hacker action)
 *
 * Detection uses distance + dot-product angle check (same math as guards).
 * Detection events fire only once per detection start.
 */

// ─── State Constants ────────────────────────────────────────
export const CameraState = Object.freeze({
  ACTIVE:    'ACTIVE',
  DETECTING: 'DETECTING',
  DISABLED:  'DISABLED',
});

// Cone colours per state
const CONE_COLORS = {
  [CameraState.ACTIVE]:    0x4488ff,  // blue
  [CameraState.DETECTING]: 0xff4444,  // red
  [CameraState.DISABLED]:  0x333333,  // dark grey
};
const LED_COLORS = {
  [CameraState.ACTIVE]:    0x00ff44,  // green
  [CameraState.DETECTING]: 0xff0000,  // red
  [CameraState.DISABLED]:  0x333333,  // dim
};

// ═══════════════════════════════════════════════════════════════

export class CameraSystem {
  /**
   * @param {import('../entities/SecurityCameras.js').SecurityCameras} cameras
   * @param {Function} [onDetection] – (camera, crewMember) called once per detection start
   */
  constructor(cameras, onDetection = null) {
    this._cameras     = cameras;
    this._onDetection = onDetection;

    /** @type {import('../entities/CrewMember.js').CrewMember[]} */
    this._crewMembers = [];

    /** Per-camera state. */
    this._states = new Map();
    for (const cam of cameras.members) {
      this._states.set(cam, {
        state:    CameraState.ACTIVE,
        phase:    0,                 // scan oscillation phase
        detected: null,              // currently detected crew member
      });
    }
  }

  /** Provide the crew member list for detection scanning. */
  setCrewMembers(members) {
    this._crewMembers = members;
  }

  /** Programmatically disable a camera (for future hacker action). */
  disableCamera(cam) {
    const s = this._states.get(cam);
    if (!s) return;
    s.state    = CameraState.DISABLED;
    s.detected = null;
    cam.setConeColor(CONE_COLORS[CameraState.DISABLED]);
    cam.setLEDColor(LED_COLORS[CameraState.DISABLED]);
    console.log(`[CAMERA] ${cam.name} → DISABLED`);
  }

  /** Re-enable a disabled camera. */
  enableCamera(cam) {
    const s = this._states.get(cam);
    if (!s) return;
    s.state = CameraState.ACTIVE;
    cam.setConeColor(CONE_COLORS[CameraState.ACTIVE]);
    cam.setLEDColor(LED_COLORS[CameraState.ACTIVE]);
    console.log(`[CAMERA] ${cam.name} → ACTIVE`);
  }

  /** Reset all cameras to initial state. */
  reset() {
    for (const cam of this._cameras.members) {
      const s = this._states.get(cam);
      s.state    = CameraState.ACTIVE;
      s.phase    = 0;
      s.detected = null;
      cam.pivot.rotation.y = cam.baseYaw;
      cam.setConeColor(CONE_COLORS[CameraState.ACTIVE]);
      cam.setLEDColor(LED_COLORS[CameraState.ACTIVE]);
    }
  }

  /**
   * Per-frame update — call only during EXECUTING phase.
   */
  update(dt) {
    for (const cam of this._cameras.members) {
      const s = this._states.get(cam);
      if (s.state === CameraState.DISABLED) continue;

      // ── Scanning rotation ──
      s.phase += dt * cam.scanSpeed;
      cam.pivot.rotation.y = cam.baseYaw + Math.sin(s.phase) * cam.scanAmplitude;

      // ── Detection ──
      const found = this._scanForCrew(cam);

      if (found && s.state !== CameraState.DETECTING) {
        // Just started detecting
        s.state    = CameraState.DETECTING;
        s.detected = found;
        cam.setConeColor(CONE_COLORS[CameraState.DETECTING]);
        cam.setLEDColor(LED_COLORS[CameraState.DETECTING]);
        console.log(`[CAMERA] ${cam.name} detected ${found.role.toUpperCase()}`);
        if (this._onDetection) this._onDetection(cam, found);

      } else if (!found && s.state === CameraState.DETECTING) {
        // Target left cone
        s.state    = CameraState.ACTIVE;
        s.detected = null;
        cam.setConeColor(CONE_COLORS[CameraState.ACTIVE]);
        cam.setLEDColor(LED_COLORS[CameraState.ACTIVE]);
        console.log(`[CAMERA] ${cam.name} target lost`);
      }
    }
  }

  // ─── Detection (inline math, avoids local/world issues) ──

  /**
   * Check all crew members against a camera's current cone.
   * Returns the first detected member, or null.
   */
  _scanForCrew(cam) {
    const camX = cam.group.position.x;
    const camZ = cam.group.position.z;
    const yaw  = cam.pivot.rotation.y;
    const range    = cam.detectionRange;
    const halfFov  = cam.fov / 2;

    // Camera forward direction from its yaw
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);

    for (const member of this._crewMembers) {
      const dx = member.group.position.x - camX;
      const dz = member.group.position.z - camZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > range || dist < 0.01) continue;

      // Normalise direction to target
      const nx = dx / dist;
      const nz = dz / dist;

      // Dot product = cos(angle between forward and target direction)
      const dot = fwdX * nx + fwdZ * nz;

      if (dot >= Math.cos(halfFov)) {
        return member; // detected
      }
    }

    return null;
  }
}
