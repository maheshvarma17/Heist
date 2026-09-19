/**
 * MultiplayerUI.js
 * Light-themed UI for player naming, room creation/joining, and 4-player lobby.
 */

import { VALID_ROLES } from '../../server/rooms/RoomManager.js';

export class MultiplayerUI {
  /**
   * @param {import('../multiplayer/MultiplayerClient.js').MultiplayerClient} client
   * @param {{ onGameStart: Function }} callbacks
   */
  constructor(client, callbacks) {
    this.client = client;
    this.onGameStart = callbacks.onGameStart;

    this.container = null;
    this.nameScreen = null;
    this.joinModal = null;
    this.lobbyScreen = null;
    this.toastEl = null;

    this._initDOM();
    this._bindEvents();
  }

  _initDOM() {
    this.container = document.createElement('div');
    this.container.id = 'multiplayer-ui';

    this._injectStyles();
    this._buildToast();
    this._buildNameScreen();
    this._buildJoinModal();
    this._buildLobbyScreen();

    document.body.appendChild(this.container);

    // Initial view is Name Screen
    this.showNameScreen();
  }

  _injectStyles() {
    const style = document.createElement('style');
    style.id = 'multiplayer-ui-styles';
    style.textContent = `
      #multiplayer-ui {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      #multiplayer-ui.active {
        pointer-events: auto;
      }

      /* ── Background Overlay ───────────────────────── */
      .mp-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(248, 250, 252, 0.92);
        backdrop-filter: blur(8px);
        transition: opacity var(--transition-normal);
      }

      /* ── Card Container ───────────────────────────── */
      .mp-card {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 480px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        padding: 36px 32px;
        text-align: center;
      }

      .mp-title {
        font-size: 1.6rem;
        font-weight: 800;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--color-text);
        margin-bottom: 4px;
      }
      .mp-subtitle {
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--color-accent);
        margin-bottom: 24px;
      }

      /* ── Name Screen ──────────────────────────────── */
      .mp-form-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
        text-align: left;
        margin-bottom: 24px;
      }
      .mp-label {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-secondary);
      }
      .mp-btn-group {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mp-btn-group .btn {
        width: 100%;
        padding: 12px;
        font-size: 0.95rem;
      }

      /* ── Modal Overlay ────────────────────────────── */
      .mp-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 23, 42, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 600;
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--transition-fast);
      }
      .mp-modal-backdrop.visible {
        opacity: 1;
        pointer-events: auto;
      }
      .mp-modal {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        width: 100%;
        max-width: 380px;
        padding: 28px;
        text-align: left;
      }

      /* ── Lobby Screen ─────────────────────────────── */
      .lobby-card {
        max-width: 620px;
        padding: 32px;
      }
      .lobby-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--color-border);
        padding-bottom: 16px;
        margin-bottom: 20px;
      }
      .lobby-room-code-badge {
        font-family: var(--font-family-mono);
        font-size: 1.1rem;
        font-weight: 800;
        letter-spacing: 0.1em;
        background: var(--color-accent-subtle);
        color: var(--color-accent);
        padding: 6px 14px;
        border-radius: var(--radius-md);
        border: 1px solid #bae6fd;
      }

      .lobby-players-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 24px;
      }

      .lobby-player-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--color-surface-secondary);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 12px 16px;
        transition: border-color var(--transition-fast), background var(--transition-fast);
      }
      .lobby-player-row.is-local {
        border-color: var(--color-accent);
        background: #f0f9ff;
      }
      .lobby-player-row.empty-slot {
        background: transparent;
        border-style: dashed;
        color: var(--color-text-muted);
      }

      .player-info {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .player-num {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--color-text-muted);
        width: 18px;
      }
      .player-name {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .player-role-display {
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        padding: 4px 10px;
        border-radius: var(--radius-sm);
      }

      .role-select {
        font-family: var(--font-family-base);
        font-size: 0.8rem;
        font-weight: 600;
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border-strong);
        background: var(--color-surface);
        color: var(--color-text);
        cursor: pointer;
        outline: none;
      }
      .role-select:focus {
        border-color: var(--color-accent);
      }

      .lobby-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border);
      }
      .lobby-actions .btn {
        padding: 10px 20px;
      }
    `;
    document.head.appendChild(style);
  }

  _buildToast() {
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast-error';
    document.body.appendChild(this.toastEl);
  }

  showError(message) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 4000);
  }

  _buildNameScreen() {
    this.nameScreen = document.createElement('div');
    this.nameScreen.className = 'mp-card';

    const savedName = this.client.state.playerName || '';

    this.nameScreen.innerHTML = `
      <h1 class="mp-title">HEIST</h1>
      <div class="mp-subtitle">60 SECONDS</div>
      <div class="mp-form-group">
        <label class="mp-label" for="player-name-input">ENTER YOUR NAME</label>
        <input id="player-name-input" class="input-text" type="text" maxlength="20" placeholder="e.g. Fox" value="${savedName}" />
      </div>
      <div class="mp-btn-group">
        <button id="create-room-btn" class="btn btn-primary">CREATE ROOM</button>
        <button id="open-join-btn" class="btn btn-secondary">JOIN ROOM</button>
      </div>
    `;

    const nameInput = this.nameScreen.querySelector('#player-name-input');
    const createBtn = this.nameScreen.querySelector('#create-room-btn');
    const openJoinBtn = this.nameScreen.querySelector('#open-join-btn');

    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        this.showError('Enter a player name.');
        nameInput.focus();
        return;
      }
      this.client.createRoom(name);
    });

    openJoinBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        this.showError('Enter a player name first.');
        nameInput.focus();
        return;
      }
      this.showJoinModal();
    });

    this.container.appendChild(this.nameScreen);
  }

  _buildJoinModal() {
    this.joinModal = document.createElement('div');
    this.joinModal.className = 'mp-modal-backdrop';

    this.joinModal.innerHTML = `
      <div class="mp-modal">
        <h2 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 16px;">JOIN HEIST ROOM</h2>
        <div class="mp-form-group">
          <label class="mp-label" for="room-code-input">ROOM CODE</label>
          <input id="room-code-input" class="input-text" type="text" maxlength="5" placeholder="e.g. HX7K2" style="text-transform: uppercase; font-family: var(--font-family-mono); font-size: 1.1rem; letter-spacing: 0.1em;" />
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancel-join-btn" class="btn btn-secondary">CANCEL</button>
          <button id="confirm-join-btn" class="btn btn-primary">JOIN ROOM</button>
        </div>
      </div>
    `;

    const codeInput = this.joinModal.querySelector('#room-code-input');
    const cancelBtn = this.joinModal.querySelector('#cancel-join-btn');
    const confirmBtn = this.joinModal.querySelector('#confirm-join-btn');

    cancelBtn.addEventListener('click', () => this.hideJoinModal());

    confirmBtn.addEventListener('click', () => {
      const name = this.nameScreen.querySelector('#player-name-input').value.trim();
      const code = codeInput.value.trim().toUpperCase();
      if (!code) {
        this.showError('Enter a valid room code.');
        codeInput.focus();
        return;
      }
      this.client.joinRoom(name, code);
      this.hideJoinModal();
    });

    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn.click();
      if (e.key === 'Escape') this.hideJoinModal();
    });

    document.body.appendChild(this.joinModal);
  }

  showJoinModal() {
    this.joinModal.classList.add('visible');
    const input = this.joinModal.querySelector('#room-code-input');
    input.value = '';
    input.focus();
  }

  hideJoinModal() {
    this.joinModal.classList.remove('visible');
  }

  _buildLobbyScreen() {
    this.lobbyScreen = document.createElement('div');
    this.lobbyScreen.className = 'mp-card lobby-card';
    this.lobbyScreen.style.display = 'none';

    this.container.appendChild(this.lobbyScreen);
  }

  showNameScreen() {
    this.container.classList.add('active');
    this.nameScreen.style.display = 'block';
    this.lobbyScreen.style.display = 'none';
  }

  showLobbyScreen() {
    this.container.classList.add('active');
    this.nameScreen.style.display = 'none';
    this.lobbyScreen.style.display = 'block';
    this.renderLobby();
  }

  hideAll() {
    this.container.classList.remove('active');
    this.nameScreen.style.display = 'none';
    this.lobbyScreen.style.display = 'none';
  }

  renderLobby() {
    const { roomCode, players, playerId } = this.client.state;
    const isHost = this.client.state.isHost();
    const localPlayer = this.client.state.getLocalPlayer();

    // Find taken roles
    const assignedRoles = players.map(p => p.role).filter(Boolean);

    let rowsHtml = '';
    for (let i = 0; i < 4; i++) {
      const player = players[i];
      if (player) {
        const isLocal = player.id === playerId;
        const hostBadge = player.isHost ? '<span class="badge badge-host">HOST</span>' : '';
        const readyBadge = player.isReady
          ? '<span class="badge badge-ready">✓ READY</span>'
          : '<span class="badge badge-not-ready">NOT READY</span>';

        let roleControl = '';
        if (isHost) {
          // Host can change assignments
          roleControl = `
            <select class="role-select" data-player-id="${player.id}">
              <option value="">Select Role...</option>
              ${VALID_ROLES.map(role => {
                const isSelected = player.role === role;
                const isOccupiedByOther = !isSelected && assignedRoles.includes(role);
                return `<option value="${role}" ${isSelected ? 'selected' : ''} ${isOccupiedByOther ? 'disabled' : ''}>${role}${isOccupiedByOther ? ' (Taken)' : ''}</option>`;
              }).join('')}
            </select>
          `;
        } else {
          // Non-host just views role
          const roleLabel = player.role || 'Unassigned';
          roleControl = `<span class="player-role-display" style="color: var(--color-text-secondary);">${roleLabel}</span>`;
        }

        rowsHtml += `
          <div class="lobby-player-row ${isLocal ? 'is-local' : ''}">
            <div class="player-info">
              <span class="player-num">${i + 1}.</span>
              <span class="player-name">${player.name} ${isLocal ? '(You)' : ''}</span>
              ${hostBadge}
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              ${roleControl}
              ${readyBadge}
            </div>
          </div>
        `;
      } else {
        rowsHtml += `
          <div class="lobby-player-row empty-slot">
            <div class="player-info">
              <span class="player-num">${i + 1}.</span>
              <span style="font-size: 0.9rem; font-style: italic;">Waiting for player...</span>
            </div>
            <span class="badge badge-not-ready">NOT READY</span>
          </div>
        `;
      }
    }

    // Determine start button availability
    const allAssigned = players.length === 4 && new Set(assignedRoles).size === 4 && assignedRoles.length === 4;
    const allReady = players.length === 4 && players.every(p => p.isReady);
    const canStart = isHost && allAssigned && allReady;

    const isLocalReady = localPlayer ? localPlayer.isReady : false;

    this.lobbyScreen.innerHTML = `
      <div class="lobby-header">
        <div>
          <h2 style="font-size: 1.1rem; font-weight: 800; letter-spacing: 0.1em; color: var(--color-text);">MULTIPLAYER LOBBY</h2>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">4 PLAYERS REQUIRED</span>
        </div>
        <div class="lobby-room-code-badge">ROOM ${roomCode || '-----'}</div>
      </div>

      <div class="lobby-players-list">
        ${rowsHtml}
      </div>

      <div class="lobby-actions">
        <button id="leave-room-btn" class="btn btn-secondary">LEAVE ROOM</button>
        <div style="display: flex; gap: 10px;">
          <button id="ready-toggle-btn" class="btn ${isLocalReady ? 'btn-secondary' : 'btn-success'}">
            ${isLocalReady ? 'NOT READY' : '✓ READY'}
          </button>
          ${isHost ? `
            <button id="start-heist-btn" class="btn btn-primary" ${!canStart ? 'disabled' : ''}>
              ▶ START HEIST
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Bind lobby buttons
    const leaveBtn = this.lobbyScreen.querySelector('#leave-room-btn');
    leaveBtn.addEventListener('click', () => {
      this.client.leaveRoom();
      this.showNameScreen();
    });

    const readyBtn = this.lobbyScreen.querySelector('#ready-toggle-btn');
    if (readyBtn) {
      readyBtn.addEventListener('click', () => {
        this.client.setReady(!isLocalReady);
      });
    }

    const startBtn = this.lobbyScreen.querySelector('#start-heist-btn');
    if (startBtn && isHost) {
      startBtn.addEventListener('click', () => {
        if (canStart) {
          this.client.startGame();
        }
      });
    }

    // Bind role selectors
    if (isHost) {
      const selects = this.lobbyScreen.querySelectorAll('.role-select');
      selects.forEach(select => {
        select.addEventListener('change', (e) => {
          const targetPlayerId = e.target.dataset.playerId;
          const role = e.target.value || null;
          this.client.assignRole(targetPlayerId, role);
        });
      });
    }
  }

  _bindEvents() {
    this.client.on('roomCreated', () => {
      this.showLobbyScreen();
    });

    this.client.on('roomJoined', () => {
      this.showLobbyScreen();
    });

    this.client.on('roomState', () => {
      if (this.client.state.roomCode) {
        this.renderLobby();
      }
    });

    this.client.on('leftRoom', () => {
      this.showNameScreen();
    });

    this.client.on('errorMessage', (data) => {
      this.showError(data.message);
    });

    this.client.on('gameStarting', (data) => {
      this.hideAll();
      const localRole = this.client.state.getLocalRole();
      if (this.onGameStart) {
        this.onGameStart({
          roomCode: data.roomCode,
          players: data.players,
          localPlayerRole: localRole,
          localPlayerId: this.client.state.playerId,
        });
      }
    });
  }
}
