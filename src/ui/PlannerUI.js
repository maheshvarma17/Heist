/**
 * PlannerUI.js
 * DOM-based planning panel for assigning actions to crew members.
 *
 * Shows during the PLANNING phase.
 * Hidden during EXECUTING.
 * Shows a completion overlay when all actions finish.
 *
 * This is a temporary UI — it will be replaced with a
 * polished in-game planner in a future milestone.
 */

import { ROOM_LABELS } from '../systems/ActionSystem.js';

// ─── Character accent colors (CSS) ──────────────────────────
const ACCENT = {
  thief:      '#00ccaa',
  hacker:     '#3388ff',
  distractor: '#ffaa33',
  enforcer:   '#cc3333',
};

// Navigation point keys available for MOVE actions
const ROOM_KEYS = [
  'lobby', 'vault', 'securityRoom', 'office',
  'hallway', 'rooftop', 'frontExit', 'rooftopExit',
];

// ═══════════════════════════════════════════════════════════════

export class PlannerUI {
  /**
   * @param {import('../entities/Crew.js').Crew} crew
   * @param {Map<string, import('../systems/ActionQueue.js').ActionQueue>} queues
   *        – keyed by role name (e.g. 'thief')
   * @param {{ onExecute: Function, onPlanAgain: Function }} callbacks
   */
  constructor(crew, queues, callbacks) {
    this._crew      = crew;
    this._queues    = queues;          // role → ActionQueue
    this._onExecute = callbacks.onExecute;
    this._onPlanAgain = callbacks.onPlanAgain;

    /** @type {Object.<string, HTMLElement>} */
    this._listEls   = {};              // role → action-list <div>

    this._panel      = null;
    this._overlay    = null;
    this._statusBar  = null;

    this._injectStyles();
    this._buildPanel();
    this._buildOverlay();
  }

  // ─── Public ────────────────────────────────────────────

  /** Show the planning panel (PLANNING phase). */
  show() {
    this._panel.classList.add('visible');
    this._hideOverlay();
    this._refresh();
  }

  /** Hide the planning panel (EXECUTING phase). */
  hide() {
    this._panel.classList.remove('visible');
  }

  /** Show the execution status bar. */
  showStatus(text) {
    this._statusBar.textContent = text;
    this._statusBar.classList.add('visible');
  }

  /** Hide the execution status bar. */
  hideStatus() {
    this._statusBar.classList.remove('visible');
  }

  /**
   * Show the result overlay.
   * @param {{ type: 'success'|'timeout', remaining?: number }} result
   */
  showComplete(result = { type: 'success', remaining: 0 }) {
    this._updateOverlay(result);
    this._overlay.classList.add('visible');
  }

  /** Re-render all action lists from queue data. */
  _refresh() {
    for (const member of this._crew.members) {
      this._renderActions(member.role);
    }
  }

  // ─── Build Panel ───────────────────────────────────────

  _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'planner-panel';

    // ── Title ──
    const title = document.createElement('div');
    title.className = 'planner-title';
    title.innerHTML = '<h2>PLAN YOUR HEIST</h2><p>Assign actions, then execute.</p>';
    panel.appendChild(title);

    // ── Character cards ──
    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'planner-cards';

    for (const member of this._crew.members) {
      cardsWrap.appendChild(this._buildCard(member));
    }
    panel.appendChild(cardsWrap);

    // ── Execute button ──
    const execBtn = document.createElement('button');
    execBtn.id = 'execute-btn';
    execBtn.innerHTML = '▶&ensp;EXECUTE';
    execBtn.addEventListener('click', () => {
      // Only execute if at least one character has actions
      const hasAny = this._crew.members.some(m => this._queues.get(m.role).hasActions());
      if (!hasAny) return;
      this._onExecute();
    });
    panel.appendChild(execBtn);

    document.body.appendChild(panel);
    this._panel = panel;

    // ── Status bar (shown during execution) ──
    const status = document.createElement('div');
    status.id = 'exec-status';
    status.textContent = 'Executing…';
    document.body.appendChild(status);
    this._statusBar = status;
  }

  _buildCard(member) {
    const role   = member.role;
    const accent = ACCENT[role] ?? '#888';
    const queue  = this._queues.get(role);

    const card = document.createElement('div');
    card.className = 'crew-card';
    card.style.setProperty('--accent', accent);

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `
      <span class="accent-dot" style="background:${accent}"></span>
      <span class="card-role">${role.toUpperCase()}</span>
      <span class="card-name">${member.name}</span>
    `;
    card.appendChild(header);

    // ── Action list ──
    const list = document.createElement('div');
    list.className = 'action-list';
    card.appendChild(list);
    this._listEls[role] = list;

    // ── Controls ──
    const controls = document.createElement('div');
    controls.className = 'card-controls';

    // Room selector
    const select = document.createElement('select');
    select.className = 'room-select';
    for (const key of ROOM_KEYS) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = ROOM_LABELS[key] ?? key;
      select.appendChild(opt);
    }

    // +MOVE button
    const moveBtn = document.createElement('button');
    moveBtn.className = 'add-btn move-btn';
    moveBtn.textContent = '+ MOVE';
    moveBtn.addEventListener('click', () => {
      queue.addAction({ type: 'MOVE', target: select.value });
      this._renderActions(role);
    });

    // +WAIT button
    const waitBtn = document.createElement('button');
    waitBtn.className = 'add-btn wait-btn';
    waitBtn.textContent = '+ WAIT';
    waitBtn.addEventListener('click', () => {
      queue.addAction({ type: 'WAIT', duration: 2 });
      this._renderActions(role);
    });

    controls.appendChild(select);
    controls.appendChild(moveBtn);
    controls.appendChild(waitBtn);
    card.appendChild(controls);

    return card;
  }

  // ─── Render Action List ────────────────────────────────

  _renderActions(role) {
    const list  = this._listEls[role];
    const queue = this._queues.get(role);
    const actions = queue.actions; // defensive copy

    list.innerHTML = '';

    if (actions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'action-empty';
      empty.textContent = 'No actions planned';
      list.appendChild(empty);
      return;
    }

    actions.forEach((action, i) => {
      const row = document.createElement('div');
      row.className = 'action-row';

      const label = document.createElement('span');
      label.className = 'action-label';
      label.textContent = `${i + 1}. ${_labelFor(action)}`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        queue.removeAction(i);
        this._renderActions(role);
      });

      row.appendChild(label);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  }

  // ─── Completion Overlay ────────────────────────────────

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'complete-overlay';

    overlay.innerHTML = `
      <div class="complete-box">
        <h2 id="result-title">HEIST COMPLETE</h2>
        <p id="result-subtitle">All crew members have finished their actions.</p>
        <p id="result-detail" class="result-detail"></p>
        <button id="plan-again-btn">↻&ensp;PLAN AGAIN</button>
      </div>
    `;

    overlay.querySelector('#plan-again-btn')
      .addEventListener('click', () => this._onPlanAgain());

    document.body.appendChild(overlay);
    this._overlay = overlay;
  }

  /** Update overlay content based on result type. */
  _updateOverlay(result) {
    const titleEl    = this._overlay.querySelector('#result-title');
    const subtitleEl = this._overlay.querySelector('#result-subtitle');
    const detailEl   = this._overlay.querySelector('#result-detail');
    const box        = this._overlay.querySelector('.complete-box');

    box.classList.remove('success', 'timeout');

    if (result.type === 'timeout') {
      box.classList.add('timeout');
      titleEl.textContent    = "TIME'S UP";
      subtitleEl.textContent = 'The 60 seconds are over.';
      detailEl.textContent   = '';
    } else {
      box.classList.add('success');
      titleEl.textContent    = 'HEIST COMPLETE';
      subtitleEl.textContent = 'All actions executed successfully.';
      const secs = result.remaining != null ? result.remaining.toFixed(1) : '0.0';
      detailEl.textContent   = `Time remaining: ${secs}s`;
    }
  }

  _hideOverlay() {
    this._overlay.classList.remove('visible');
  }

  // ─── Inject Styles ─────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('planner-styles')) return;

    const style = document.createElement('style');
    style.id = 'planner-styles';
    style.textContent = PLANNER_CSS;
    document.head.appendChild(style);
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function _labelFor(action) {
  switch (action.type) {
    case 'MOVE': return `MOVE → ${ROOM_LABELS[action.target] ?? action.target}`;
    case 'WAIT': return `WAIT ${action.duration ?? 1}s`;
    default:     return action.type;
  }
}

// ─── CSS ─────────────────────────────────────────────────────

const PLANNER_CSS = `
/* ══ Planner Panel ═══════════════════════════════════ */
#planner-panel {
  position: fixed;
  top: 0; left: 0;
  width: 330px;
  height: 100vh;
  background: rgba(8, 8, 14, 0.92);
  backdrop-filter: blur(12px);
  border-right: 1px solid rgba(240, 192, 64, 0.15);
  display: flex;
  flex-direction: column;
  padding: 20px 16px 16px;
  gap: 10px;
  z-index: 100;
  overflow-y: auto;
  transform: translateX(-110%);
  transition: transform 0.35s ease;
}
#planner-panel.visible {
  transform: translateX(0);
}
#planner-panel::-webkit-scrollbar { width: 4px; }
#planner-panel::-webkit-scrollbar-thumb { background: rgba(240,192,64,0.25); border-radius: 2px; }

/* ── Title ──────────────────────────────────────────── */
.planner-title h2 {
  font-size: 1.15rem;
  letter-spacing: 0.2em;
  color: #f0c040;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.planner-title p {
  font-size: 0.75rem;
  color: #777;
}

/* ── Cards container ────────────────────────────────── */
.planner-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ── Crew Card ──────────────────────────────────────── */
.crew-card {
  background: rgba(20, 20, 30, 0.85);
  border: 1px solid rgba(255,255,255,0.06);
  border-left: 3px solid var(--accent, #888);
  border-radius: 6px;
  padding: 10px 12px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.accent-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.card-role {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #ddd;
}
.card-name {
  font-size: 0.7rem;
  color: #666;
  margin-left: auto;
}

/* ── Action list ────────────────────────────────────── */
.action-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
  max-height: 120px;
  overflow-y: auto;
}
.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255,255,255,0.03);
  border-radius: 3px;
  padding: 4px 8px;
}
.action-label {
  font-size: 0.72rem;
  font-family: 'Consolas', 'Courier New', monospace;
  color: #bbb;
}
.action-empty {
  font-size: 0.7rem;
  color: #555;
  font-style: italic;
  padding: 4px 0;
}
.remove-btn {
  background: none;
  border: none;
  color: #cc4444;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.remove-btn:hover { opacity: 1; }

/* ── Card controls ──────────────────────────────────── */
.card-controls {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.room-select {
  flex: 1;
  min-width: 100px;
  background: rgba(20,20,30,0.9);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px;
  color: #ccc;
  font-size: 0.7rem;
  padding: 4px 6px;
  cursor: pointer;
}
.room-select:focus { outline: 1px solid rgba(240,192,64,0.4); }

.add-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px;
  color: #bbb;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 4px 8px;
  cursor: pointer;
  letter-spacing: 0.05em;
  transition: background 0.15s, color 0.15s;
}
.add-btn:hover {
  background: rgba(255,255,255,0.12);
  color: #fff;
}
.move-btn:hover { border-color: rgba(240,192,64,0.5); }
.wait-btn:hover { border-color: rgba(136,136,170,0.5); }

/* ── Execute button ─────────────────────────────────── */
#execute-btn {
  width: 100%;
  padding: 12px;
  margin-top: 6px;
  background: linear-gradient(135deg, #f0c040, #d4a020);
  border: none;
  border-radius: 6px;
  color: #0a0a0f;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  cursor: pointer;
  text-transform: uppercase;
  transition: filter 0.2s, transform 0.1s;
  flex-shrink: 0;
}
#execute-btn:hover {
  filter: brightness(1.12);
  transform: scale(1.02);
}
#execute-btn:active {
  transform: scale(0.98);
}

/* ══ Execution Status Bar ════════════════════════════ */
#exec-status {
  position: fixed;
  top: 70px;
  left: 50%;
  transform: translateX(-50%) translateY(-30px);
  background: rgba(8,8,14,0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(240,192,64,0.25);
  border-radius: 6px;
  padding: 8px 24px;
  color: #f0c040;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: none;
}
#exec-status.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ══ Completion Overlay ══════════════════════════════ */
#complete-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 4, 10, 0.75);
  backdrop-filter: blur(6px);
  z-index: 200;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s;
}
#complete-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}
.complete-box {
  text-align: center;
  background: rgba(14,14,22,0.95);
  border: 1px solid rgba(240,192,64,0.3);
  border-radius: 10px;
  padding: 36px 48px;
}
.complete-box h2 {
  font-size: 1.5rem;
  letter-spacing: 0.25em;
  margin-bottom: 8px;
}
.complete-box.success h2 {
  color: #44dd66;
}
.complete-box.timeout h2 {
  color: #ff4444;
}
.complete-box p {
  font-size: 0.85rem;
  color: #999;
  margin-bottom: 6px;
}
.result-detail {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin-bottom: 16px !important;
}
.complete-box.success .result-detail {
  color: #44dd66;
}
.complete-box.timeout .result-detail {
  color: #ff4444;
}
#plan-again-btn {
  background: linear-gradient(135deg, #f0c040, #d4a020);
  border: none;
  border-radius: 6px;
  color: #0a0a0f;
  font-size: 0.9rem;
  font-weight: 700;
  padding: 10px 28px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: filter 0.2s, transform 0.1s;
}
#plan-again-btn:hover { filter: brightness(1.12); transform: scale(1.02); }
#plan-again-btn:active { transform: scale(0.98); }
`;
