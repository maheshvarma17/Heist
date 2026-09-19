/**
 * PlannerUI.js
 * DOM-based planning panel for assigning actions to crew members.
 * Supports real-time shared team planning, role ownership, planning ready states, and synchronized execution.
 */

import { ROOM_LABELS } from '../systems/ActionSystem.js';

// ─── Character accent colors (CSS) ──────────────────────────
const ACCENT = {
  thief:      '#059669', // Emerald
  hacker:     '#2563eb', // Blue
  distractor: '#d97706', // Amber
  enforcer:   '#dc2626', // Red
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
   * @param {import('../multiplayer/MultiplayerClient.js').MultiplayerClient} [client]
   */
  constructor(crew, queues, callbacks, client = null) {
    this._crew      = crew;
    this._queues    = queues;          // role → ActionQueue
    this._onExecute = callbacks.onExecute;
    this._onPlanAgain = callbacks.onPlanAgain;
    this._client    = client;

    /** @type {Object.<string, HTMLElement>} */
    this._listEls   = {};              // role → action-list <div>

    this._panel      = null;
    this._overlay    = null;
    this._statusBar  = null;
    this._cards      = {};             // role -> card <div>
    this._localRole  = null;
    this._players    = [];
    this._planningReadyMap = {};
    this._isPlanningReady = false;

    this._injectStyles();
    this._buildPanel();
    this._buildOverlay();

    if (this._client) {
      this._bindMultiplayerEvents();
    }
  }

  setClient(client) {
    this._client = client;
    this._bindMultiplayerEvents();
  }

  // ─── Public ────────────────────────────────────────────

  /**
   * Set local player's role in multiplayer mode to enforce control restrictions.
   * @param {string|null} localRole
   * @param {Array} [players=[]]
   */
  setLocalRole(localRole, players = []) {
    this._localRole = localRole ? localRole.toLowerCase() : null;
    this._players = players;
    this._isPlanningReady = false;
    this._planningReadyMap = {};
    this._rebuildCards();
    this._updateButtons();
  }

  /** Show the planning panel (PLANNING phase). */
  show() {
    this._panel.classList.add('visible');
    this._hideOverlay();
    this._refresh();
    this._updateButtons();
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
    this._updateButtons();
  }

  // ─── Build Panel ───────────────────────────────────────

  _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'planner-panel';

    // ── Title ──
    const title = document.createElement('div');
    title.className = 'planner-title';
    title.innerHTML = '<h2>TEAM PLANNER</h2><p>Coordinate crew actions and synchronize execution.</p>';
    panel.appendChild(title);

    // ── Character cards ──
    this._cardsWrap = document.createElement('div');
    this._cardsWrap.className = 'planner-cards';

    for (const member of this._crew.members) {
      this._cardsWrap.appendChild(this._buildCard(member));
    }
    panel.appendChild(this._cardsWrap);

    // ── Planning Actions Footer ──
    const footer = document.createElement('div');
    footer.className = 'planner-footer';

    // Ready toggle button (for multiplayer)
    const readyBtn = document.createElement('button');
    readyBtn.id = 'planning-ready-btn';
    readyBtn.className = 'btn btn-secondary';
    readyBtn.textContent = '✓ READY FOR HEIST';
    readyBtn.addEventListener('click', () => {
      if (this._client && this._localRole) {
        this._client.setPlanningReady(!this._isPlanningReady);
      }
    });
    footer.appendChild(readyBtn);
    this._readyBtn = readyBtn;

    // Execute button
    const execBtn = document.createElement('button');
    execBtn.id = 'execute-btn';
    execBtn.className = 'btn btn-primary';
    execBtn.innerHTML = '▶&ensp;EXECUTE HEIST';
    execBtn.addEventListener('click', () => {
      if (this._client && this._localRole) {
        // In multiplayer, host triggers synchronized startExecution
        this._client.startExecution();
      } else {
        // Single player local execution
        const hasAny = this._crew.members.some(m => this._queues.get(m.role).hasActions());
        if (!hasAny) return;
        this._onExecute();
      }
    });
    footer.appendChild(execBtn);
    this._execBtn = execBtn;

    panel.appendChild(footer);

    document.body.appendChild(panel);
    this._panel = panel;

    // ── Status bar (shown during execution) ──
    const status = document.createElement('div');
    status.id = 'exec-status';
    status.textContent = 'EXECUTING HEIST…';
    document.body.appendChild(status);
    this._statusBar = status;
  }

  _rebuildCards() {
    if (!this._cardsWrap) return;
    this._cardsWrap.innerHTML = '';
    for (const member of this._crew.members) {
      this._cardsWrap.appendChild(this._buildCard(member));
    }
    this._refresh();
  }

  _buildCard(member) {
    const role   = member.role;
    const accent = ACCENT[role] ?? '#0284c7';
    const queue  = this._queues.get(role);

    const isOwned = !this._localRole || (role.toLowerCase() === this._localRole);
    const assignedPlayer = this._players.find(p => p.role === role.toUpperCase());
    const playerName = assignedPlayer ? assignedPlayer.name : member.name;
    const isPlayerReady = assignedPlayer ? Boolean(this._planningReadyMap[assignedPlayer.id]) : false;

    const card = document.createElement('div');
    card.className = `crew-card ${isOwned ? 'is-owned' : 'is-remote'}`;
    card.style.setProperty('--card-accent', accent);
    if (!isOwned && this._localRole) {
      card.style.opacity = '0.85';
    }

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'card-header';
    
    let badgeHtml = '';
    if (this._localRole) {
      const youBadge = isOwned 
        ? '<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:0.65rem;">YOU</span>'
        : '<span class="badge badge-not-ready" style="font-size:0.65rem;">TEAM</span>';

      const readyBadge = isPlayerReady
        ? '<span class="badge badge-ready" style="font-size:0.62rem;">✓ READY</span>'
        : '<span class="badge badge-not-ready" style="font-size:0.62rem;">PLANNING</span>';

      badgeHtml = `${youBadge} ${readyBadge}`;
    }

    header.innerHTML = `
      <span class="accent-dot" style="background:${accent}"></span>
      <span class="card-role">${role.toUpperCase()}</span>
      ${badgeHtml}
      <span class="card-name">${playerName}</span>
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

    if (isOwned) {
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
        const action = { type: 'MOVE', target: select.value };
        if (this._client && this._localRole) {
          this._client.addAction(role.toUpperCase(), action);
        } else {
          queue.addAction(action);
          this._renderActions(role);
        }
      });

      // +WAIT button
      const waitBtn = document.createElement('button');
      waitBtn.className = 'add-btn wait-btn';
      waitBtn.textContent = '+ WAIT (2s)';
      waitBtn.addEventListener('click', () => {
        const action = { type: 'WAIT', duration: 2 };
        if (this._client && this._localRole) {
          this._client.addAction(role.toUpperCase(), action);
        } else {
          queue.addAction(action);
          this._renderActions(role);
        }
      });

      // CLEAR button
      const clearBtn = document.createElement('button');
      clearBtn.className = 'add-btn clear-btn';
      clearBtn.textContent = 'CLEAR';
      clearBtn.addEventListener('click', () => {
        if (this._client && this._localRole) {
          this._client.clearActions(role.toUpperCase());
        } else {
          queue.clear();
          this._renderActions(role);
        }
      });

      controls.appendChild(select);
      controls.appendChild(moveBtn);
      controls.appendChild(waitBtn);
      controls.appendChild(clearBtn);
    } else {
      controls.innerHTML = `<span style="font-size: 0.72rem; color: var(--color-text-muted); font-style: italic; padding: 4px 0;">Controlled by ${playerName}</span>`;
    }

    card.appendChild(controls);
    return card;
  }

  // ─── Render Action List ────────────────────────────────

  _renderActions(role) {
    const list  = this._listEls[role];
    const queue = this._queues.get(role);
    if (!list || !queue) return;
    const actions = queue.actions; // defensive copy
    const isOwned = !this._localRole || (role.toLowerCase() === this._localRole);

    list.innerHTML = '';

    if (actions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'action-empty';
      empty.textContent = isOwned ? 'No actions planned' : 'Waiting for orders…';
      list.appendChild(empty);
      return;
    }

    actions.forEach((action, i) => {
      const row = document.createElement('div');
      row.className = 'action-row';

      const label = document.createElement('span');
      label.className = 'action-label';
      label.textContent = `${i + 1}. ${_labelFor(action)}`;

      row.appendChild(label);

      if (isOwned) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove action';
        removeBtn.addEventListener('click', () => {
          if (this._client && this._localRole) {
            this._client.removeAction(role.toUpperCase(), i, action.id);
          } else {
            queue.removeAction(i);
            this._renderActions(role);
          }
        });
        row.appendChild(removeBtn);
      }

      list.appendChild(row);
    });
  }

  _updateButtons() {
    if (!this._readyBtn || !this._execBtn) return;

    if (!this._localRole) {
      // Single player mode: hide ready button, enable execute if actions present
      this._readyBtn.style.display = 'none';
      this._execBtn.style.display = 'block';
      const hasAny = this._crew.members.some(m => this._queues.get(m.role).hasActions());
      this._execBtn.disabled = !hasAny;
      this._execBtn.textContent = '▶ EXECUTE HEIST';
      return;
    }

    // Multiplayer mode
    this._readyBtn.style.display = 'inline-flex';
    this._readyBtn.className = this._isPlanningReady ? 'btn btn-success' : 'btn btn-secondary';
    this._readyBtn.textContent = this._isPlanningReady ? '✓ READY' : 'READY FOR HEIST';

    const isHost = this._client ? this._client.state.isHost() : false;
    const hasAnyAction = this._crew.members.some(m => this._queues.get(m.role).hasActions());
    const allPlanningReady = this._players.length > 0 && this._players.every(p => Boolean(this._planningReadyMap[p.id]));

    if (isHost) {
      this._execBtn.style.display = 'block';
      this._execBtn.disabled = !(allPlanningReady && hasAnyAction);
      this._execBtn.innerHTML = '▶&ensp;EXECUTE HEIST';
      if (!allPlanningReady) {
        this._execBtn.title = 'Waiting for all operatives to declare READY';
      } else if (!hasAnyAction) {
        this._execBtn.title = 'Plan at least one action to execute';
      } else {
        this._execBtn.title = 'Start synchronized heist execution!';
      }
    } else {
      this._execBtn.style.display = 'none';
    }
  }

  // ─── Multiplayer Event Binding ──────────────────────────

  _bindMultiplayerEvents() {
    if (!this._client) return;

    this._client.on('teamPlanUpdated', (data) => {
      this._applyTeamPlan(data.teamPlan);
      if (data.planningReady) {
        this._planningReadyMap = data.planningReady;
        const localPlayer = this._client.state.getLocalPlayer();
        if (localPlayer) {
          this._isPlanningReady = Boolean(this._planningReadyMap[localPlayer.id]);
        }
      }
      this._rebuildCards();
      this._updateButtons();
    });

    this._client.on('teamPlanSnapshot', (data) => {
      this._applyTeamPlan(data.teamPlan);
      if (data.planningReady) {
        this._planningReadyMap = data.planningReady;
        const localPlayer = this._client.state.getLocalPlayer();
        if (localPlayer) {
          this._isPlanningReady = Boolean(this._planningReadyMap[localPlayer.id]);
        }
      }
      this._rebuildCards();
      this._updateButtons();
    });

    this._client.on('planningReadyUpdated', (data) => {
      this._planningReadyMap = data.planningReady || this._planningReadyMap;
      const localPlayer = this._client.state.getLocalPlayer();
      if (localPlayer && data.playerId === localPlayer.id) {
        this._isPlanningReady = data.isReady;
      }
      this._rebuildCards();
      this._updateButtons();
    });
  }

  _applyTeamPlan(teamPlan = {}) {
    for (const [roleUpper, actions] of Object.entries(teamPlan)) {
      const queue = this._queues.get(roleUpper.toLowerCase());
      if (queue) {
        queue.clear();
        for (const action of actions) {
          queue.addAction(action);
        }
      }
    }
  }

  // ─── Completion Overlay ────────────────────────────────

  _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'complete-overlay';

    overlay.innerHTML = `
      <div class="complete-box light-card">
        <h2 id="result-title">HEIST COMPLETE</h2>
        <p id="result-subtitle">All crew members have finished their actions.</p>
        <p id="result-detail" class="result-detail"></p>
        <button id="plan-again-btn" class="btn btn-primary">↻&ensp;PLAN AGAIN</button>
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
      detailEl.textContent   = `TIME REMAINING: ${secs} SEC`;
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

// ─── CSS (Light Theme) ───────────────────────────────────────

const PLANNER_CSS = `
/* ══ Planner Panel ═══════════════════════════════════ */
#planner-panel {
  position: fixed;
  top: 0; left: 0;
  width: 360px;
  height: 100vh;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  padding: 24px 18px 18px;
  gap: 12px;
  z-index: 100;
  overflow-y: auto;
  transform: translateX(-110%);
  transition: transform 0.35s ease;
}
#planner-panel.visible {
  transform: translateX(0);
}
#planner-panel::-webkit-scrollbar { width: 5px; }
#planner-panel::-webkit-scrollbar-thumb { background: var(--color-border-strong); border-radius: 4px; }

/* ── Title ──────────────────────────────────────────── */
.planner-title h2 {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: var(--color-text);
  text-transform: uppercase;
  margin-bottom: 2px;
}
.planner-title p {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

/* ── Cards container ────────────────────────────────── */
.planner-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

/* ── Crew Card ──────────────────────────────────────── */
.crew-card {
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--card-accent, var(--color-accent));
  border-radius: var(--radius-md);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
  transition: opacity var(--transition-fast), border-color var(--transition-fast);
}
.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.accent-dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.card-role {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--color-text);
}
.card-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-left: auto;
}

/* ── Action list ────────────────────────────────────── */
.action-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  max-height: 120px;
  overflow-y: auto;
}
.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
}
.action-label {
  font-size: 0.75rem;
  font-family: var(--font-family-mono);
  font-weight: 600;
  color: var(--color-text);
}
.action-empty {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  font-style: italic;
  padding: 4px 0;
}
.remove-btn {
  background: none;
  border: none;
  color: var(--color-danger);
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity var(--transition-fast);
}
.remove-btn:hover { opacity: 1; }

/* ── Card controls ──────────────────────────────────── */
.card-controls {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.room-select {
  flex: 1;
  min-width: 100px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-family: var(--font-family-base);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 6px 8px;
  cursor: pointer;
}
.room-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.add-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-family-base);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 6px 8px;
  cursor: pointer;
  letter-spacing: 0.05em;
  transition: all var(--transition-fast);
}
.add-btn:hover {
  background: var(--color-surface-tertiary);
  color: var(--color-text);
  border-color: var(--color-text-secondary);
}
.move-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
.wait-btn:hover { border-color: var(--color-text-secondary); }
.clear-btn:hover { border-color: var(--color-danger); color: var(--color-danger); }

/* ── Footer ─────────────────────────────────────────── */
.planner-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

#planning-ready-btn {
  width: 100%;
  padding: 10px;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

#execute-btn {
  width: 100%;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

/* ══ Execution Status Bar ════════════════════════════ */
#exec-status {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(-20px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-md);
  padding: 8px 24px;
  color: var(--color-accent);
  font-size: 0.85rem;
  font-weight: 800;
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
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
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
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  padding: 36px 48px;
  max-width: 440px;
  width: 90%;
}
.complete-box h2 {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.complete-box.success h2 {
  color: var(--color-success);
}
.complete-box.timeout h2 {
  color: var(--color-danger);
}
.complete-box p {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.result-detail {
  font-family: var(--font-family-mono);
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 20px !important;
}
.complete-box.success .result-detail {
  color: var(--color-success);
}
.complete-box.timeout .result-detail {
  color: var(--color-danger);
}
#plan-again-btn {
  padding: 10px 24px;
}
`;
