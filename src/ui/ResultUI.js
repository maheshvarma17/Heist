/**
 * ResultUI.js
 * Clean light-theme Final Result modal overlay displaying
 * operative statuses (ESCAPED vs INSIDE), loot secured, stealth metrics,
 * heist rating grade (S/A/B/C/F), and Plan Again replay actions.
 */

export class ResultUI {
  /**
   * @param {{ onPlanAgain: Function }} callbacks
   */
  constructor(callbacks = {}) {
    this.onPlanAgain = callbacks.onPlanAgain || null;
    this.el = null;
    this._createDOM();
  }

  _createDOM() {
    this.el = document.createElement('div');
    this.el.id = 'result-modal-backdrop';
    this.el.className = 'result-backdrop hidden';

    this.el.innerHTML = `
      <div class="result-modal light-card">
        <div class="result-header">
          <div class="result-grade-stamp" id="result-grade">S</div>
          <div class="result-title-group">
            <h1 class="result-main-title" id="result-main-title">PERFECT HEIST</h1>
            <p class="result-subtitle" id="result-subtitle">All operatives escaped with maximum loot.</p>
          </div>
        </div>

        <div class="result-section-label">OPERATIVE STATUSES</div>
        <div class="operatives-grid" id="operatives-grid">
          <!-- Populated dynamically -->
        </div>

        <div class="result-stats-row">
          <div class="result-stat-card">
            <div class="stat-label">TOTAL LOOT SECURED</div>
            <div class="stat-value text-success" id="result-total-loot">$1,300</div>
            <div class="stat-sub" id="result-loot-breakdown">3 Cash · 2 Gold · 1 Diamond</div>
          </div>
          <div class="result-stat-card">
            <div class="stat-label">FACILITY ALARM</div>
            <div class="stat-value" id="result-alarm-level">0%</div>
            <div class="stat-sub" id="result-alarm-state">NORMAL</div>
          </div>
          <div class="result-stat-card">
            <div class="stat-label">TEAM ESCAPE</div>
            <div class="stat-value text-accent" id="result-escape-count">4 / 4</div>
            <div class="stat-sub" id="result-escape-sub">Full Extraction</div>
          </div>
        </div>

        <div class="result-footer">
          <button id="result-plan-again-btn" class="btn btn-primary btn-lg">
            ↻&ensp;PLAN AGAIN
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.el);

    this.gradeEl = this.el.querySelector('#result-grade');
    this.titleEl = this.el.querySelector('#result-main-title');
    this.subtitleEl = this.el.querySelector('#result-subtitle');
    this.operativesGridEl = this.el.querySelector('#operatives-grid');
    this.totalLootEl = this.el.querySelector('#result-total-loot');
    this.lootBreakdownEl = this.el.querySelector('#result-loot-breakdown');
    this.alarmLevelEl = this.el.querySelector('#result-alarm-level');
    this.alarmStateEl = this.el.querySelector('#result-alarm-state');
    this.escapeCountEl = this.el.querySelector('#result-escape-count');
    this.escapeSubEl = this.el.querySelector('#result-escape-sub');

    this.el.querySelector('#result-plan-again-btn').addEventListener('click', () => {
      if (this.onPlanAgain) this.onPlanAgain();
    });
  }

  /**
   * Populate and display the Final Result modal with authoritative outcome data.
   * @param {Object} result
   */
  show(result = {}) {
    if (!this.el) return;

    const grade = result.grade || 'F';
    const title = result.ratingTitle || 'HEIST COMPLETE';
    const loot = result.loot || { totalSecured: 0, totalPossible: 1300, breakdown: {} };
    const stealth = result.stealth || { alarmLevel: 0, alarmState: 'NORMAL' };
    const operatives = result.operatives || [];
    const escapedCount = result.escapedCount || 0;
    const totalPlayers = result.totalPlayers || operatives.length || 4;

    // Grade & Title
    this.gradeEl.textContent = grade;
    this.gradeEl.className = `result-grade-stamp grade-${grade.toLowerCase()}`;
    this.titleEl.textContent = title;

    if (grade === 'S') {
      this.subtitleEl.textContent = 'Flawless execution! All operatives extracted with 100% loot.';
    } else if (grade === 'A') {
      this.subtitleEl.textContent = 'Clean heist! The crew successfully secured significant loot and escaped.';
    } else if (grade === 'B') {
      this.subtitleEl.textContent = 'Partial extraction. Some loot was secured before the alarms peaked.';
    } else if (grade === 'C') {
      this.subtitleEl.textContent = 'Messy escape under heavy security response.';
    } else {
      this.subtitleEl.textContent = 'The heist was compromised. Operatives were caught inside or no loot secured.';
    }

    // Operatives Grid
    this.operativesGridEl.innerHTML = '';
    for (const op of operatives) {
      const isEscaped = op.status === 'ESCAPED';
      const card = document.createElement('div');
      card.className = `op-result-card ${isEscaped ? 'op-escaped' : 'op-inside'}`;

      card.innerHTML = `
        <div class="op-header">
          <span class="op-role op-role-${(op.role || '').toLowerCase()}">${op.role || 'CREW'}</span>
          <span class="op-badge ${isEscaped ? 'badge-escaped' : 'badge-inside'}">
            ${isEscaped ? '✓ ESCAPED' : '⚠ INSIDE'}
          </span>
        </div>
        <div class="op-name">${op.name || 'Operative'}</div>
        <div class="op-loot">Secured: $${(op.lootValue || 0).toLocaleString()}</div>
      `;
      this.operativesGridEl.appendChild(card);
    }

    // Loot & Stats
    this.totalLootEl.textContent = `$${(loot.totalSecured || 0).toLocaleString()}`;
    const bd = loot.breakdown || {};
    const cash = bd.cash ? bd.cash.count : 0;
    const gold = bd.gold ? bd.gold.count : 0;
    const dia = bd.diamonds ? bd.diamonds.count : 0;
    this.lootBreakdownEl.textContent = `${cash}/3 Cash · ${gold}/2 Gold · ${dia}/1 Diamond`;

    this.alarmLevelEl.textContent = `${stealth.alarmLevel || 0}%`;
    this.alarmStateEl.textContent = stealth.alarmState || 'NORMAL';
    this.alarmLevelEl.className = `stat-value ${(stealth.alarmLevel || 0) >= 75 ? 'text-danger' : ((stealth.alarmLevel || 0) >= 50 ? 'text-warning' : 'text-slate')}`;

    this.escapeCountEl.textContent = `${escapedCount} / ${totalPlayers}`;
    this.escapeSubEl.textContent = escapedCount === totalPlayers ? 'Full Extraction' : (escapedCount === 0 ? 'All Captured' : 'Partial Getaway');

    this.el.classList.remove('hidden');
    this.el.classList.add('visible');
  }

  hide() {
    if (this.el) {
      this.el.classList.remove('visible');
      this.el.classList.add('hidden');
    }
  }
}
