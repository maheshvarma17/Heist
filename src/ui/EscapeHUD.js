/**
 * EscapeHUD.js
 * Light-theme HUD card showing escape route status (LOCKED, AVAILABLE, ESCAPING, ESCAPED),
 * escaped team count (e.g. 2 / 4 ESCAPED), and progress bar during escape confirmation.
 */

export class EscapeHUD {
  constructor() {
    this.el = null;
    this.stateTextEl = null;
    this.countTextEl = null;
    this.progressBarEl = null;
    this.progressFillEl = null;

    this.state = 'LOCKED';
    this.escapedCount = 0;
    this.totalPlayers = 4;

    this._createDOM();
  }

  _createDOM() {
    this.el = document.createElement('div');
    this.el.id = 'escape-hud';
    this.el.className = 'escape-hud hidden';

    this.el.innerHTML = `
      <div class="escape-hud-header">
        <span class="escape-hud-icon">🏃</span>
        <span class="escape-hud-title">ESCAPE</span>
      </div>
      <div class="escape-hud-status" id="escape-hud-status">LOCKED</div>
      <div class="escape-hud-count" id="escape-hud-count">0 / 4 ESCAPED</div>
      <div class="escape-progress-bar hidden" id="escape-progress-bar">
        <div class="escape-progress-fill" id="escape-progress-fill" style="width: 0%"></div>
      </div>
    `;

    document.body.appendChild(this.el);

    this.stateTextEl = this.el.querySelector('#escape-hud-status');
    this.countTextEl = this.el.querySelector('#escape-hud-count');
    this.progressBarEl = this.el.querySelector('#escape-progress-bar');
    this.progressFillEl = this.el.querySelector('#escape-progress-fill');
  }

  /**
   * Update escape HUD state.
   * @param {Object} escapeSnapshot
   * @param {string} [localPlayerId=null]
   * @param {number} [totalPlayers=4]
   */
  update(escapeSnapshot = {}, localPlayerId = null, totalPlayers = 4) {
    if (!this.el) return;

    this.state = escapeSnapshot.state || 'LOCKED';
    const escapedPlayers = escapeSnapshot.escapedPlayers || [];
    this.escapedCount = escapedPlayers.length;
    this.totalPlayers = totalPlayers || 4;

    const isLocalEscaped = localPlayerId && escapedPlayers.includes(localPlayerId);
    const localActiveEscape = localPlayerId && escapeSnapshot.activeEscapes ? escapeSnapshot.activeEscapes[localPlayerId] : null;

    this.el.classList.remove('escape-locked', 'escape-available', 'escape-escaping', 'escape-escaped');

    if (isLocalEscaped) {
      this.stateTextEl.textContent = 'ESCAPED';
      this.el.classList.add('escape-escaped');
      this.progressBarEl.classList.add('hidden');
    } else if (localActiveEscape) {
      const prog = localActiveEscape.progress || 0;
      this.stateTextEl.textContent = `ESCAPING ${prog}%`;
      this.el.classList.add('escape-escaping');
      this.progressBarEl.classList.remove('hidden');
      this.progressFillEl.style.width = `${prog}%`;
    } else if (this.state === 'AVAILABLE') {
      this.stateTextEl.textContent = 'AVAILABLE';
      this.el.classList.add('escape-available');
      this.progressBarEl.classList.add('hidden');
    } else {
      this.stateTextEl.textContent = 'LOCKED';
      this.el.classList.add('escape-locked');
      this.progressBarEl.classList.add('hidden');
    }

    if (this.countTextEl) {
      this.countTextEl.textContent = `${this.escapedCount} / ${this.totalPlayers} ESCAPED`;
    }
  }

  show() {
    if (this.el) this.el.classList.remove('hidden');
  }

  hide() {
    if (this.el) this.el.classList.add('hidden');
  }
}
