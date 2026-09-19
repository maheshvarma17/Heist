/**
 * VaultHUD.js
 * Light-theme HUD showing current vault status (LOCKED, OPENING xx%, OPEN)
 * and interactive action prompts.
 */

export class VaultHUD {
  constructor() {
    this.el = null;
    this.stateTextEl = null;
    this.progressBarEl = null;
    this.progressFillEl = null;
    this.promptEl = null;

    this.state = 'LOCKED';
    this.progress = 0;

    this._createDOM();
  }

  _createDOM() {
    // Vault Status Card (Top-Center / Left HUD)
    this.el = document.createElement('div');
    this.el.id = 'vault-hud';
    this.el.className = 'vault-hud hidden';

    this.el.innerHTML = `
      <div class="vault-hud-header">
        <span class="vault-hud-icon">🔒</span>
        <span class="vault-hud-title">VAULT</span>
      </div>
      <div class="vault-hud-status" id="vault-hud-status">LOCKED</div>
      <div class="vault-progress-bar hidden" id="vault-progress-bar">
        <div class="vault-progress-fill" id="vault-progress-fill" style="width: 0%"></div>
      </div>
    `;

    document.body.appendChild(this.el);

    this.stateTextEl = this.el.querySelector('#vault-hud-status');
    this.progressBarEl = this.el.querySelector('#vault-progress-bar');
    this.progressFillEl = this.el.querySelector('#vault-progress-fill');

    // Central Interaction Prompt
    this.promptEl = document.createElement('div');
    this.promptEl.id = 'interaction-prompt';
    this.promptEl.className = 'interaction-prompt hidden';
    document.body.appendChild(this.promptEl);
  }

  /**
   * Update vault state display.
   * @param {string} state
   * @param {number} progress
   */
  update(state, progress = 0) {
    this.state = state || 'LOCKED';
    this.progress = progress || 0;

    if (!this.stateTextEl) return;

    this.el.classList.remove('vault-locked', 'vault-opening', 'vault-open');

    if (this.state === 'OPEN') {
      this.stateTextEl.textContent = 'OPEN';
      this.el.classList.add('vault-open');
      this.progressBarEl.classList.add('hidden');
    } else if (this.state === 'OPENING') {
      this.stateTextEl.textContent = `OPENING ${this.progress}%`;
      this.el.classList.add('vault-opening');
      this.progressBarEl.classList.remove('hidden');
      this.progressFillEl.style.width = `${this.progress}%`;
    } else {
      this.stateTextEl.textContent = 'LOCKED';
      this.el.classList.add('vault-locked');
      this.progressBarEl.classList.add('hidden');
    }
  }

  /**
   * Display or hide on-screen interaction prompt.
   * @param {string|null} text
   */
  setPrompt(text) {
    if (!this.promptEl) return;

    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  show() {
    if (this.el) this.el.classList.remove('hidden');
  }

  hide() {
    if (this.el) this.el.classList.add('hidden');
    if (this.promptEl) this.promptEl.classList.add('hidden');
  }
}
