/**
 * LootHUD.js
 * Light-theme HUD showing loot collection breakdown by type (Cash, Gold, Diamonds)
 * and total collected LOOT VALUE.
 */

export class LootHUD {
  constructor() {
    this.el = null;
    this.cashCountEl = null;
    this.goldCountEl = null;
    this.diamondsCountEl = null;
    this.totalValueEl = null;

    this._createDOM();
  }

  _createDOM() {
    this.el = document.createElement('div');
    this.el.id = 'loot-hud';
    this.el.className = 'loot-hud hidden';

    this.el.innerHTML = `
      <div class="loot-hud-header">
        <span class="loot-hud-icon">💰</span>
        <span class="loot-hud-title">LOOT</span>
      </div>
      <div class="loot-breakdown">
        <div class="loot-row">
          <span class="loot-type">CASH</span>
          <span class="loot-count" id="loot-cash-count">0 / 3</span>
        </div>
        <div class="loot-row">
          <span class="loot-type">GOLD</span>
          <span class="loot-count" id="loot-gold-count">0 / 2</span>
        </div>
        <div class="loot-row">
          <span class="loot-type">DIAMONDS</span>
          <span class="loot-count" id="loot-diamonds-count">0 / 1</span>
        </div>
      </div>
      <div class="loot-value-box">
        <div class="loot-value-label">LOOT VALUE</div>
        <div class="loot-value-amount" id="loot-total-value">$0</div>
      </div>
    `;

    document.body.appendChild(this.el);

    this.cashCountEl = this.el.querySelector('#loot-cash-count');
    this.goldCountEl = this.el.querySelector('#loot-gold-count');
    this.diamondsCountEl = this.el.querySelector('#loot-diamonds-count');
    this.totalValueEl = this.el.querySelector('#loot-total-value');
  }

  /**
   * Update loot stats.
   * @param {{ counts: Object, totals: Object, totalValue: number }} stats
   */
  update(stats = {}) {
    const counts = stats.counts || { CASH: 0, GOLD: 0, DIAMONDS: 0 };
    const totals = stats.totals || { CASH: 3, GOLD: 2, DIAMONDS: 1 };
    const totalVal = stats.totalValue || 0;

    if (this.cashCountEl) {
      this.cashCountEl.textContent = `${counts.CASH ?? 0} / ${totals.CASH ?? 3}`;
    }
    if (this.goldCountEl) {
      this.goldCountEl.textContent = `${counts.GOLD ?? 0} / ${totals.GOLD ?? 2}`;
    }
    if (this.diamondsCountEl) {
      this.diamondsCountEl.textContent = `${counts.DIAMONDS ?? 0} / ${totals.DIAMONDS ?? 1}`;
    }
    if (this.totalValueEl) {
      this.totalValueEl.textContent = `$${totalVal.toLocaleString()}`;
    }
  }

  show() {
    if (this.el) this.el.classList.remove('hidden');
  }

  hide() {
    if (this.el) this.el.classList.add('hidden');
  }
}
