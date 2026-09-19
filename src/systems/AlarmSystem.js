/**
 * AlarmSystem.js
 * Client-side management of the team's shared Alarm level and state.
 *
 * Levels:
 *   0–24%   → NORMAL      (neutral / accent)
 *   25–49%  → SUSPICIOUS  (amber warning)
 *   50–74%  → ALERT       (strong warning)
 *   75–99%  → CRITICAL    (red danger)
 *   100%    → MAXIMUM     (intense danger pulse)
 */

export const ALARM_STATES = Object.freeze({
  NORMAL:     'NORMAL',
  SUSPICIOUS: 'SUSPICIOUS',
  ALERT:      'ALERT',
  CRITICAL:   'CRITICAL',
  MAXIMUM:    'MAXIMUM',
});

export class AlarmSystem {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.onAlarmChange] – callback (alarmState) => void
   * @param {Function} [options.onDetection]   – callback (detectionEvent) => void
   */
  constructor(options = {}) {
    this._level = 0;
    this._state = ALARM_STATES.NORMAL;
    this._onAlarmChange = options.onAlarmChange || null;
    this._onDetection = options.onDetection || null;

    /** Recent detections queue */
    this.recentDetections = [];
  }

  get level() { return this._level; }
  get state() { return this._state; }

  /**
   * Compute category from 0-100 level.
   * @param {number} level
   * @returns {string}
   */
  static computeState(level) {
    if (level >= 100) return ALARM_STATES.MAXIMUM;
    if (level >= 75)  return ALARM_STATES.CRITICAL;
    if (level >= 50)  return ALARM_STATES.ALERT;
    if (level >= 25)  return ALARM_STATES.SUSPICIOUS;
    return ALARM_STATES.NORMAL;
  }

  /**
   * Update alarm state from authoritative server packet or local trigger.
   * @param {number} level
   * @param {string} [state]
   * @param {Object} [meta]
   */
  setLevel(level, state = null, meta = {}) {
    const prevLevel = this._level;
    const prevState = this._state;

    this._level = Math.max(0, Math.min(100, Math.round(level)));
    this._state = state || AlarmSystem.computeState(this._level);

    if (this._level !== prevLevel || this._state !== prevState) {
      if (this._onAlarmChange) {
        this._onAlarmChange({
          level: this._level,
          state: this._state,
          previousLevel: prevLevel,
          previousState: prevState,
          ...meta,
        });
      }
    }
  }

  /**
   * Record a detection event.
   * @param {Object} detection
   */
  recordDetection(detection) {
    this.recentDetections.unshift({
      ...detection,
      timestamp: Date.now(),
    });
    if (this.recentDetections.length > 20) {
      this.recentDetections.pop();
    }

    if (this._onDetection) {
      this._onDetection(detection);
    }
  }

  /**
   * Reset alarm back to 0 (NORMAL).
   */
  reset() {
    this._level = 0;
    this._state = ALARM_STATES.NORMAL;
    this.recentDetections = [];

    if (this._onAlarmChange) {
      this._onAlarmChange({
        level: 0,
        state: ALARM_STATES.NORMAL,
        source: 'RESET',
      });
    }
  }
}
