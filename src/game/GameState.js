/**
 * GameState.js
 * Tracks the current phase and high-level game data.
 * Intentionally minimal for Milestone 1 — expanded later.
 */

export const PHASES = Object.freeze({
  PLANNING:  'PLANNING',
  EXECUTING: 'EXECUTING',
  RESULT:    'RESULT',
});

export class GameState {
  constructor() {
    this.phase = PHASES.PLANNING;
    this.timer = 0;  // elapsed seconds during execution
    this.score = 0;
    this.isRunning = false;
  }

  /** Reset to initial values. */
  reset() {
    this.phase = PHASES.PLANNING;
    this.timer = 0;
    this.score = 0;
    this.isRunning = false;
  }
}
