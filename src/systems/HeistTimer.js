/**
 * HeistTimer.js
 * Real-time 60-second countdown driven by the game loop's delta time.
 *
 * The timer does NOT use setInterval — it subtracts delta each frame
 * for frame-accurate timing that stays in sync with the game.
 */

import { HEIST_DURATION } from '../game/Constants.js';

export class HeistTimer {
  /**
   * @param {Function} [onTimeout] – called once when remaining reaches 0
   */
  constructor(onTimeout = null) {
    this._duration   = HEIST_DURATION;
    this._remaining  = HEIST_DURATION;
    this._running    = false;
    this._onTimeout  = onTimeout;
    this._timedOut   = false;
  }

  // ─── Control ───────────────────────────────────────────

  /** Begin (or restart) the countdown from 60. */
  start() {
    this._remaining = this._duration;
    this._running   = true;
    this._timedOut  = false;
  }

  /** Pause without resetting. */
  pause() {
    this._running = false;
  }

  /** Resume from where it was paused. */
  resume() {
    if (!this._timedOut) {
      this._running = true;
    }
  }

  /** Stop the timer (does not reset). */
  stop() {
    this._running = false;
  }

  /** Reset to initial state (stopped at 60). */
  reset() {
    this._remaining = this._duration;
    this._running   = false;
    this._timedOut  = false;
  }

  // ─── Accessors ─────────────────────────────────────────

  /** Seconds left (clamped ≥ 0). */
  get remaining() { return this._remaining; }

  /** Seconds elapsed since start. */
  get elapsed() { return this._duration - this._remaining; }

  /** True while actively counting down. */
  get isRunning() { return this._running; }

  /** True if the timer reached zero. */
  get timedOut() { return this._timedOut; }

  /** Full duration (60). */
  get duration() { return this._duration; }

  // ─── Per-Frame Update ──────────────────────────────────

  /**
   * Call once per frame with the frame's delta (seconds).
   */
  update(dt) {
    if (!this._running) return;

    this._remaining -= dt;

    if (this._remaining <= 0) {
      this._remaining = 0;
      this._running   = false;
      this._timedOut  = true;
      if (this._onTimeout) this._onTimeout();
    }
  }
}
