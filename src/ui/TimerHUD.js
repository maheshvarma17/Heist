/**
 * TimerHUD.js
 * Prominent on-screen countdown display.
 *
 * Visual states:
 *   60–21 s  →  normal  (light)
 *   20–11 s  →  warning (amber)
 *   10–0  s  →  critical (red, pulsing)
 */

export class TimerHUD {
  constructor() {
    this._el    = null;
    this._value = null;
    this._state = 'normal';   // 'normal' | 'warning' | 'critical'

    this._injectStyles();
    this._build();
  }

  // ─── Public ────────────────────────────────────────────

  /**
   * Update the displayed time.
   * @param {number} remaining – seconds remaining (will be ceiled for display)
   */
  update(remaining) {
    const display = Math.ceil(remaining);
    this._value.textContent = display;

    // Determine visual state
    let state;
    if (remaining > 20)      state = 'normal';
    else if (remaining > 10) state = 'warning';
    else                     state = 'critical';

    if (state !== this._state) {
      this._el.classList.remove(this._state);
      this._el.classList.add(state);
      this._state = state;
    }
  }

  /** Show the HUD. */
  show() { this._el.classList.add('visible'); }

  /** Hide the HUD. */
  hide() { this._el.classList.remove('visible'); }

  // ─── Build ─────────────────────────────────────────────

  _build() {
    const hud = document.createElement('div');
    hud.id = 'timer-hud';
    hud.className = 'normal';

    const label = document.createElement('div');
    label.id = 'timer-label';
    label.textContent = 'TIME';

    const value = document.createElement('div');
    value.id = 'timer-value';
    value.textContent = '60';

    hud.appendChild(label);
    hud.appendChild(value);
    document.body.appendChild(hud);

    this._el    = hud;
    this._value = value;
  }

  // ─── Styles ────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('timer-hud-styles')) return;

    const style = document.createElement('style');
    style.id = 'timer-hud-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

// ─── CSS ─────────────────────────────────────────────────────

const CSS = `
#timer-hud {
  position: fixed;
  top: 18px;
  right: 32px;
  text-align: center;
  z-index: 120;
  user-select: none;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-10px);
  transition: opacity 0.35s, transform 0.35s;
}
#timer-hud.visible {
  opacity: 1;
  transform: translateY(0);
}

#timer-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.25em;
  color: #666;
  text-transform: uppercase;
  margin-bottom: 2px;
}

#timer-value {
  font-size: 3rem;
  font-weight: 800;
  font-family: 'Consolas', 'Courier New', monospace;
  line-height: 1;
  transition: color 0.35s, text-shadow 0.35s;
}

/* ── Normal (60–21) ───────────────── */
#timer-hud.normal #timer-value {
  color: #d0d0d0;
  text-shadow: 0 0 12px rgba(208,208,208,0.2);
}

/* ── Warning (20–11) ──────────────── */
#timer-hud.warning #timer-value {
  color: #ffaa33;
  text-shadow: 0 0 16px rgba(255,170,51,0.35);
}
#timer-hud.warning #timer-label {
  color: #aa7722;
}

/* ── Critical (10–0) ──────────────── */
#timer-hud.critical #timer-value {
  color: #ff3333;
  text-shadow: 0 0 22px rgba(255,51,51,0.5);
  animation: timer-pulse 0.7s ease-in-out infinite;
}
#timer-hud.critical #timer-label {
  color: #cc3333;
}

@keyframes timer-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.1); }
}
`;
