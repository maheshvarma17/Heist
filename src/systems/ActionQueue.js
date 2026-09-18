/**
 * ActionQueue.js
 * Per-character ordered list of planned actions.
 *
 * The queue is filled during the PLANNING phase and
 * consumed sequentially by ActionSystem during EXECUTING.
 */

export class ActionQueue {
  constructor() {
    /** @type {Array<{type: string, [key: string]: *}>} */
    this._actions = [];
  }

  // ─── Mutators ──────────────────────────────────────────

  /** Append an action to the end of the queue. */
  addAction(action) {
    this._actions.push({ ...action });
  }

  /** Remove the action at `index`. */
  removeAction(index) {
    if (index >= 0 && index < this._actions.length) {
      this._actions.splice(index, 1);
    }
  }

  /** Remove all actions. */
  clear() {
    this._actions.length = 0;
  }

  // ─── Accessors ─────────────────────────────────────────

  /** Look at the first action without removing it. */
  peek() {
    return this._actions[0] ?? null;
  }

  /** Remove and return the first action (used during execution). */
  getNextAction() {
    return this._actions.shift() ?? null;
  }

  /** True if there is at least one action queued. */
  hasActions() {
    return this._actions.length > 0;
  }

  /** Number of actions currently queued. */
  get length() {
    return this._actions.length;
  }

  /** Defensive copy of the action list (safe for UI iteration). */
  get actions() {
    return this._actions.map(a => ({ ...a }));
  }
}
