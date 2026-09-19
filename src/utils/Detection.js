/**
 * Detection.js
 * Deterministic detection utilities — distance + vision-cone check.
 * No AI, no ML — pure game mathematics.
 */

import * as THREE from 'three';

const _toTarget = new THREE.Vector3();
const _forward  = new THREE.Vector3();

/**
 * Check whether a `target` is inside a guard's vision cone.
 *
 * @param {THREE.Group} guardGroup   – guard.group (position + rotation)
 * @param {THREE.Group} targetGroup  – target.group (position)
 * @param {number}      range        – maximum detection distance
 * @param {number}      halfAngle    – half of the cone's opening angle (radians)
 * @returns {boolean}
 */
export function isInVisionCone(guardGroup, targetGroup, range, halfAngle) {
  // Flat XZ distance
  _toTarget.subVectors(targetGroup.position, guardGroup.position);
  _toTarget.y = 0;
  const dist = _toTarget.length();

  if (dist > range || dist < 0.01) return false;

  // Guard's forward direction (Three.js: rotY = 0 → facing −Z)
  const yaw = guardGroup.rotation.y;
  _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));

  _toTarget.normalize();
  const dot = _forward.dot(_toTarget);

  // dot = cos(angle between forward and toTarget)
  return dot >= Math.cos(halfAngle);
}
