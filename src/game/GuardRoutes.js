/**
 * GuardRoutes.js
 * Predefined patrol routes for bank guards.
 * Each route is an array of Vector3 waypoints that loops continuously.
 */

import { Vector3 } from 'three';

export const GUARD_ROUTES = Object.freeze({
  /** Lobby Guard — patrols lobby ↔ hallway along the right side. */
  lobbyGuard: Object.freeze([
    new Vector3(  3, 0,  17),   // lobby (right side)
    new Vector3(  3, 0,  12),   // lobby inner
    new Vector3(  5, 0,  -9),   // hallway (right side)
    new Vector3(  3, 0,  12),   // lobby inner (return)
  ]),

  /** Vault Guard — patrols vault ↔ hallway along the left side. */
  vaultGuard: Object.freeze([
    new Vector3( -2, 0,   4),   // vault (left side)
    new Vector3( -2, 0,   7),   // vault inner
    new Vector3( -5, 0,  -9),   // hallway (left side)
    new Vector3( -2, 0,   7),   // vault inner (return)
  ]),

  /** Security Guard — patrols security room ↔ hallway connector. */
  securityGuard: Object.freeze([
    new Vector3(-12, 0,  -2),   // security room center
    new Vector3( -8, 0,  -5),   // security room door area
    new Vector3( -6, 0, -10),   // hallway near security
    new Vector3( -8, 0,  -5),   // security room door (return)
  ]),
});
