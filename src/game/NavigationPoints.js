/**
 * NavigationPoints.js
 * Predefined positions inside each bank room for character movement.
 *
 * Each point is a THREE.Vector3 representing a comfortable standing
 * position near the center of the room.  Clone before mutating.
 */

import { Vector3 } from 'three';

/**
 * Named navigation targets aligned to the bank layout in Bank.js.
 *
 * Room bounds (for reference):
 *   lobby      x[−8,  8]   z[10, 22]   y = 0
 *   vault      x[−6,  6]   z[ 0, 10]   y = 0
 *   security   x[−16,−6]   z[−8,  2]   y = 0
 *   office     x[ 6, 16]   z[−8,  2]   y = 0
 *   hallway    x[−16, 16]  z[−12,−8]   y = 0
 *   rooftop    x[−6,  6]   z[−20,−12]  y = 4
 */
export const NAV_POINTS = Object.freeze({
  lobby:        new Vector3(  0,   0,   16),
  vault:        new Vector3(  0,   0,    5),
  securityRoom: new Vector3(-11,   0,   -3),
  office:       new Vector3( 11,   0,   -3),
  hallway:      new Vector3(  0,   0,  -10),
  rooftop:      new Vector3(  0,   4,  -16),
  frontExit:    new Vector3(  0,   0,   21),
  rooftopExit:  new Vector3(  0,   4,  -19),
});
