/**
 * AlarmHUD.js
 * Light-themed on-screen shared team alarm and detection HUD widget.
 *
 * Visual states:
 *   NORMAL     (0–24%)  → neutral / slate accent
 *   SUSPICIOUS (25–49%) → warning amber
 *   ALERT      (50–74%) → strong amber / orange
 *   CRITICAL   (75–99%) → red danger
 *   MAXIMUM    (100%)   → pulsing intense danger
 */

export class AlarmHUD {
  constructor() {
    this._el          = null;
    this._valueEl     = null;
    this._badgeEl     = null;
    this._barFillEl   = null;
    this._toastEl     = null;
    this._toastTimer  = null;
    this._state       = 'NORMAL';

    this._injectStyles();
    this._build();
  }

  // ─── Public ────────────────────────────────────────────

  /**
   * Update the displayed alarm level & state.
   * @param {number} level – 0 to 100
   * @param {string} state – 'NORMAL' | 'SUSPICIOUS' | 'ALERT' | 'CRITICAL' | 'MAXIMUM'
   */
  update(level, state = 'NORMAL') {
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));
    const stateUpper = (state || 'NORMAL').toUpperCase();

    if (this._valueEl) {
      this._valueEl.textContent = `${clampedLevel}%`;
    }

    if (this._badgeEl) {
      this._badgeEl.textContent = stateUpper;
    }

    if (this._barFillEl) {
      this._barFillEl.style.width = `${clampedLevel}%`;
    }

    // Update CSS classes
    const stateClass = stateUpper.toLowerCase();
    this._el.className = `visible state-${stateClass}`;
    this._state = stateUpper;
  }

  /**
   * Show a lightweight detection toast alert.
   * @param {string} message
   * @param {'guard'|'camera'|'info'} [type='guard']
   */
  showDetectionNotification(message, type = 'guard') {
    if (!this._toastEl) return;

    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
    }

    const icon = type === 'camera' ? '📹' : '🚨';
    this._toastEl.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-msg">${message}</span>`;
    this._toastEl.className = `alarm-toast visible toast-${type}`;

    this._toastTimer = setTimeout(() => {
      this._toastEl.className = 'alarm-toast';
    }, 3500);
  }

  /** Show the HUD. */
  show() {
    this._el.classList.add('visible');
  }

  /** Hide the HUD. */
  hide() {
    this._el.classList.remove('visible');
    if (this._toastEl) this._toastEl.className = 'alarm-toast';
  }

  // ─── Build ─────────────────────────────────────────────

  _build() {
    const container = document.createElement('div');
    container.id = 'alarm-hud-container';

    // Alarm widget card
    const hud = document.createElement('div');
    hud.id = 'alarm-hud';
    hud.className = 'state-normal';

    const header = document.createElement('div');
    header.className = 'alarm-header';

    const label = document.createElement('span');
    label.className = 'alarm-label';
    label.textContent = 'ALARM LEVEL';

    const badge = document.createElement('span');
    badge.className = 'alarm-badge';
    badge.textContent = 'NORMAL';

    header.appendChild(label);
    header.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'alarm-body';

    const value = document.createElement('div');
    value.className = 'alarm-value';
    value.textContent = '0%';

    const barContainer = document.createElement('div');
    barContainer.className = 'alarm-bar-container';

    const barFill = document.createElement('div');
    barFill.className = 'alarm-bar-fill';
    barFill.style.width = '0%';

    barContainer.appendChild(barFill);
    body.appendChild(value);
    body.appendChild(barContainer);

    hud.appendChild(header);
    hud.appendChild(body);

    // Detection Toast container
    const toast = document.createElement('div');
    toast.id = 'alarm-toast';
    toast.className = 'alarm-toast';

    container.appendChild(hud);
    container.appendChild(toast);
    document.body.appendChild(container);

    this._el        = hud;
    this._valueEl   = value;
    this._badgeEl   = badge;
    this._barFillEl = barFill;
    this._toastEl   = toast;
  }

  // ─── Styles ────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('alarm-hud-styles')) return;

    const style = document.createElement('style');
    style.id = 'alarm-hud-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

// ─── CSS (Light Theme) ───────────────────────────────────────

const CSS = `
#alarm-hud-container {
  position: fixed;
  top: 18px;
  right: 140px;
  z-index: 120;
  user-select: none;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

#alarm-hud {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-md);
  padding: 8px 16px;
  min-width: 170px;
  opacity: 0;
  transform: translateY(-10px);
  transition: opacity 0.35s, transform 0.35s, border-color 0.25s, box-shadow 0.25s;
}

#alarm-hud.visible {
  opacity: 1;
  transform: translateY(0);
}

.alarm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.alarm-label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: var(--color-text-secondary);
  text-transform: uppercase;
}

.alarm-badge {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: background-color 0.2s, color 0.2s;
}

.alarm-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.alarm-value {
  font-size: 1.4rem;
  font-weight: 800;
  font-family: var(--font-family-mono);
  line-height: 1;
  min-width: 48px;
  transition: color 0.25s;
}

.alarm-bar-container {
  flex: 1;
  height: 8px;
  background: var(--color-surface-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.alarm-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.3s ease, background-color 0.3s ease;
}

/* ── State Themes ────────────────────────────────────────── */

/* NORMAL */
#alarm-hud.state-normal .alarm-badge {
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}
#alarm-hud.state-normal .alarm-value {
  color: var(--color-text);
}
#alarm-hud.state-normal .alarm-bar-fill {
  background: var(--color-accent);
}

/* SUSPICIOUS */
#alarm-hud.state-suspicious {
  border-color: #fcd34d;
}
#alarm-hud.state-suspicious .alarm-badge {
  background: #fef3c7;
  color: #b45309;
}
#alarm-hud.state-suspicious .alarm-value {
  color: var(--color-warning);
}
#alarm-hud.state-suspicious .alarm-bar-fill {
  background: var(--color-warning);
}

/* ALERT */
#alarm-hud.state-alert {
  border-color: #fb923c;
  box-shadow: 0 10px 15px -3px rgba(249, 115, 22, 0.15);
}
#alarm-hud.state-alert .alarm-badge {
  background: #ffedd5;
  color: #c2410c;
}
#alarm-hud.state-alert .alarm-value {
  color: #ea580c;
}
#alarm-hud.state-alert .alarm-bar-fill {
  background: #ea580c;
}

/* CRITICAL */
#alarm-hud.state-critical {
  border-color: #f87171;
  box-shadow: 0 10px 15px -3px rgba(220, 38, 38, 0.2);
}
#alarm-hud.state-critical .alarm-badge {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}
#alarm-hud.state-critical .alarm-value {
  color: var(--color-danger);
}
#alarm-hud.state-critical .alarm-bar-fill {
  background: var(--color-danger);
}

/* MAXIMUM */
#alarm-hud.state-maximum {
  border-color: var(--color-danger);
  box-shadow: 0 0 15px rgba(220, 38, 38, 0.4);
  animation: alarm-pulse 0.8s ease-in-out infinite alternate;
}
#alarm-hud.state-maximum .alarm-badge {
  background: var(--color-danger);
  color: #ffffff;
}
#alarm-hud.state-maximum .alarm-value {
  color: var(--color-danger);
}
#alarm-hud.state-maximum .alarm-bar-fill {
  background: var(--color-danger);
}

@keyframes alarm-pulse {
  from { transform: scale(1); }
  to   { transform: scale(1.03); }
}

/* ── Detection Toast Notification ────────────────────────── */
.alarm-toast {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-danger);
  color: var(--color-text);
  padding: 8px 14px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
  font-size: 0.82rem;
  font-weight: 700;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.25s, transform 0.25s;
  pointer-events: none;
}

.alarm-toast.visible {
  opacity: 1;
  transform: translateY(0);
}

.alarm-toast.toast-camera {
  border-left-color: #ea580c;
}

.toast-icon {
  font-size: 1.1rem;
}
`;
