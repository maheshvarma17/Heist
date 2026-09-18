/**
 * Constants.js
 * Central place for game-wide magic numbers and configuration.
 */

// ── Timer ───────────────────────────────────────────
export const HEIST_DURATION = 60; // seconds

// ── Camera defaults ─────────────────────────────────
export const CAMERA_FOV = 50;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 300;
export const CAMERA_POSITION = { x: 28, y: 32, z: 28 };
export const CAMERA_TARGET   = { x: 0, y: 0, z: 2 };

// ── Colors ──────────────────────────────────────────
export const COLORS = {
  background: 0x0a0a0f,
  ambientLight: 0x404060,
  directionalLight: 0xffeedd,
};
