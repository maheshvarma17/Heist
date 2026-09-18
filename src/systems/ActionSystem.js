/**
 * ActionSystem.js
 * Sequentially executes each crew member's ActionQueue.
 *
 * Supported action types (extensible):
 *   MOVE  → { type: 'MOVE',  target: '<navPointKey>' }
 *   WAIT  → { type: 'WAIT',  duration: <seconds> }
 *
 * Future types (HACK, STEAL, BREAK, UNLOCK, DISTRACT, ESCAPE)
 * can be added by extending the switch in `_startAction()`.
 */

import { NAV_POINTS } from '../game/NavigationPoints.js';

// ═══════════════════════════════════════════════════════════════

export class ActionSystem {
  /**
   * @param {import('./MovementSystem.js').MovementSystem} movementSystem
   */
  constructor(movementSystem) {
    this._movement = movementSystem;

    /**
     * Registered characters.
     * @type {Array<{
     *   character:     CrewMember,
     *   queue:         ActionQueue,
     *   currentAction: Object|null,
     *   status:        'idle'|'busy'|'done',
     *   waitTimer:     number
     * }>}
     */
    this._entries = [];

    this._executing    = false;
    this._onAllComplete = null;
  }

  // ─── Registration ──────────────────────────────────────

  /**
   * Pair a character with its ActionQueue.
   * Call once during setup for each crew member.
   */
  register(character, queue) {
    this._entries.push({
      character,
      queue,
      currentAction: null,
      status: 'idle',
      waitTimer: 0,
    });
  }

  // ─── Execution Control ─────────────────────────────────

  /** Begin executing all registered queues. */
  execute(onAllComplete = null) {
    this._executing     = true;
    this._onAllComplete = onAllComplete;

    for (const entry of this._entries) {
      entry.status = 'idle';
      this._advance(entry);
    }
  }

  /** Abort execution and stop all characters. */
  abort() {
    for (const entry of this._entries) {
      this._movement.stop(entry.character);
      entry.currentAction = null;
      entry.status = 'idle';
      entry.waitTimer = 0;
    }
    this._executing = false;
  }

  /** True while any character still has actions to process. */
  get isExecuting() {
    return this._executing;
  }

  /**
   * Get the current action label for a character (for UI display).
   * @returns {{ type: string, label: string }|null}
   */
  getCurrentAction(character) {
    const entry = this._entries.find(e => e.character === character);
    if (!entry || !entry.currentAction) return null;
    return {
      type:  entry.currentAction.type,
      label: _actionLabel(entry.currentAction),
    };
  }

  // ─── Per-Frame Update ──────────────────────────────────

  update(dt) {
    if (!this._executing) return;

    let allDone = true;

    for (const entry of this._entries) {
      if (entry.status === 'done') continue;
      allDone = false;

      // Only WAIT needs per-frame countdown; MOVE uses callbacks.
      if (entry.currentAction?.type === 'WAIT') {
        entry.waitTimer -= dt;
        if (entry.waitTimer <= 0) {
          this._advance(entry);
        }
      }
    }

    if (allDone) {
      this._executing = false;
      if (this._onAllComplete) this._onAllComplete();
    }
  }

  // ─── Internal: Advance to Next Action ──────────────────

  _advance(entry) {
    if (!entry.queue.hasActions()) {
      entry.currentAction = null;
      entry.status = 'done';
      return;
    }

    const action = entry.queue.getNextAction();
    entry.currentAction = action;
    entry.status = 'busy';

    this._startAction(entry, action);
  }

  /**
   * Dispatch an action.  Extend this switch to support new types.
   */
  _startAction(entry, action) {
    switch (action.type) {
      case 'MOVE': {
        const target = NAV_POINTS[action.target];
        if (!target) {
          console.warn(`[ActionSystem] Unknown nav point: "${action.target}"`);
          this._advance(entry);
          return;
        }
        this._movement.moveTo(entry.character, target, () => {
          this._advance(entry);
        });
        break;
      }

      case 'WAIT':
        entry.waitTimer = action.duration ?? 1;
        break;

      // ── Future action stubs ──
      // case 'HACK':
      // case 'STEAL':
      // case 'BREAK':
      // case 'UNLOCK':
      // case 'DISTRACT':
      // case 'ESCAPE':
      //   break;

      default:
        console.warn(`[ActionSystem] Unsupported action: "${action.type}"`);
        this._advance(entry);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────

const ROOM_LABELS = {
  lobby:        'Lobby',
  vault:        'Vault',
  securityRoom: 'Security Room',
  office:       'Office',
  hallway:      'Hallway',
  rooftop:      'Rooftop',
  frontExit:    'Front Exit',
  rooftopExit:  'Rooftop Exit',
};

/** Human-readable label for an action (used by UI). */
function _actionLabel(action) {
  switch (action.type) {
    case 'MOVE': return `Move → ${ROOM_LABELS[action.target] ?? action.target}`;
    case 'WAIT': return `Wait ${action.duration ?? 1}s`;
    default:     return action.type;
  }
}

export { ROOM_LABELS };
