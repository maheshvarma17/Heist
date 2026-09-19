/**
 * Game.js
 * Bootstraps the Three.js scene, camera, renderer, bank environment,
 * OrbitControls, and the animation loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GameState, PHASES } from './GameState.js';
import { Bank } from './Bank.js';
import { Crew } from '../entities/Crew.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { ActionQueue } from '../systems/ActionQueue.js';
import { ActionSystem } from '../systems/ActionSystem.js';
import { HeistTimer } from '../systems/HeistTimer.js';
import { GuardSystem } from '../systems/GuardSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { AlarmSystem } from '../systems/AlarmSystem.js';
import { Guards } from '../entities/Guards.js';
import { SecurityCameras } from '../entities/SecurityCameras.js';
import { VaultSystem } from '../systems/VaultSystem.js';
import { LootSystem } from '../systems/LootSystem.js';
import { EscapeSystem } from '../systems/EscapeSystem.js';
import { PlannerUI } from '../ui/PlannerUI.js';
import { TimerHUD } from '../ui/TimerHUD.js';
import { AlarmHUD } from '../ui/AlarmHUD.js';
import { VaultHUD } from '../ui/VaultHUD.js';
import { LootHUD } from '../ui/LootHUD.js';
import { EscapeHUD } from '../ui/EscapeHUD.js';
import { ResultUI } from '../ui/ResultUI.js';
import { MultiplayerGameState } from '../multiplayer/MultiplayerGameState.js';
import {
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_POSITION,
  CAMERA_TARGET,
  COLORS,
} from './Constants.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas — the <canvas> element from index.html
   * @param {Object} [options={}] — optional player context or config
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.multiplayerClient = options.multiplayerClient || null;
    this.playerContext = options.playerContext || null;
    this.state = new GameState();
    this.clock = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initControls();
    this._initLighting();
    this._initBank();
    this._initCrew();
    this._initGuards();
    this._initCameras();
    this._initVault();
    this._initLoot();
    this._initEscape();
    this._initMovement();
    this._initActions();
    this._initTimer();
    this._initAlarm();
    this._initPlannerUI();
    this._initTimerHUD();
    this._initAlarmHUD();
    this._initVaultHUD();
    this._initLootHUD();
    this._initEscapeHUD();
    this._initResultUI();
    this._initInput();
    this._initMultiplayerState();

    if (options.autoStartPlanner !== false) {
      // Start in PLANNING phase immediately
      this._enterPlanning();
    }

    window.addEventListener('resize', () => this._onResize());
    this._onResize(); // set initial size
  }

  _initVault() {
    this.vaultSystem = new VaultSystem({
      vaultDoorGroup: this.bank.vaultDoorGroup,
      vaultWheelMesh: this.bank.vaultWheelMesh,
      onStateChange: (v) => {
        if (this.vaultHUD) {
          this.vaultHUD.update(v.state, v.progress);
        }
      },
    });
  }

  _initLoot() {
    this.lootSystem = new LootSystem({
      onLootChange: (stats) => {
        if (this.lootHUD) {
          this.lootHUD.update(stats);
        }
      },
    });
    this.lootSystem.addToScene(this.scene);
  }

  _initEscape() {
    this.escapeSystem = new EscapeSystem({
      onEscapeChange: (data) => {
        if (this.escapeHUD) {
          const localId = this.playerContext ? this.playerContext.localPlayerId : null;
          const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
          this.escapeHUD.update(data, localId, totalPlayers);
        }
      },
    });
    this.escapeSystem.addToScene(this.scene);
  }

  _initVaultHUD() {
    this.vaultHUD = new VaultHUD();
  }

  _initLootHUD() {
    this.lootHUD = new LootHUD();
  }

  _initEscapeHUD() {
    this.escapeHUD = new EscapeHUD();
  }

  _initResultUI() {
    this.resultUI = new ResultUI({
      onPlanAgain: () => {
        if (this.multiplayerClient && this.multiplayerClient.state.isConnected) {
          this.multiplayerClient.planAgain();
        } else {
          if (this.resultUI) this.resultUI.hide();
          this._enterPlanning();
        }
      },
    });
  }

  _initInput() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.state.phase === PHASES.EXECUTING) {
        this._handleInteraction();
      }
    });
  }

  _handleInteraction() {
    // Find active local member or any near crew in single player
    let localMember = null;
    let localRole = null;

    if (this.playerContext && this.playerContext.localPlayerRole) {
      localRole = this.playerContext.localPlayerRole.toUpperCase();
      localMember = this.crew.getByRole(localRole.toLowerCase());
    } else {
      // Single player fallback: find closest crew member to vault or loot
      for (const m of this.crew.members) {
        if (this.lootSystem && this.lootSystem.getClosestCollectable(m.group.position, 2.0)) {
          localMember = m;
          localRole = m.role.toUpperCase();
          break;
        }
        const vCheck = this.vaultSystem ? this.vaultSystem.checkInteraction(m.role, m.group.position) : null;
        if (vCheck && (vCheck.canOpen || vCheck.isNear)) {
          localMember = m;
          localRole = m.role.toUpperCase();
          break;
        }
      }
      if (!localMember && this.crew.members.length > 0) {
        localMember = this.crew.members[0];
        localRole = localMember.role.toUpperCase();
      }
    }

    if (!localMember) return;
    const pos = localMember.group.position;
    const isLocalEscaped = this.escapeSystem && this.escapeSystem.escapedPlayers && this.playerContext && this.escapeSystem.escapedPlayers.includes(this.playerContext.localPlayerId);

    // 1. Check if inside escape zone and can escape
    if (this.escapeSystem && !isLocalEscaped) {
      const escCheck = this.escapeSystem.checkProximity(pos, isLocalEscaped, this.playerContext ? this.playerContext.localPlayerId : null);
      if (escCheck.inZone && escCheck.canEscape) {
        console.log(`[HEIST] Interaction [E]: Escaping via ${escCheck.routeName} (${escCheck.routeId})`);
        if (this.multiplayerClient && this.multiplayerClient.state.isConnected) {
          this.multiplayerClient.requestEscape(escCheck.routeId);
        } else {
          this.escapeSystem.setEscapeState({
            state: this.escapeSystem.state,
            escapedPlayers: [this.playerContext ? this.playerContext.localPlayerId : 'local'],
            activeEscapes: {},
          });
        }
        return;
      }
    }

    // 2. Check if near uncollected loot inside open vault
    if (this.vaultSystem && this.vaultSystem.state === 'OPEN') {
      const closestLoot = this.lootSystem.getClosestCollectable(pos, 2.0);
      if (closestLoot) {
        console.log(`[HEIST] Interaction [E]: Collecting ${closestLoot.type} (${closestLoot.id})`);
        if (this.multiplayerClient && this.multiplayerClient.state.isConnected) {
          this.multiplayerClient.collectLoot(closestLoot.id);
        } else {
          this.lootSystem.collectLoot(closestLoot.id, { playerName: 'Local Player', collectedBy: 'local' });
        }
        return;
      }
    }

    // 3. Check if near vault entrance and can open
    if (this.vaultSystem) {
      const check = this.vaultSystem.checkInteraction(localRole, pos);
      if (check.canOpen) {
        console.log(`[HEIST] Interaction [E]: Opening Vault with role ${localRole}`);
        if (this.multiplayerClient && this.multiplayerClient.state.isConnected) {
          this.multiplayerClient.requestVaultOpen();
        } else {
          this.vaultSystem.setState('OPENING', 0, 'Local Player', localRole);
        }
      }
    }
  }

  _initAlarm() {
    this.alarmSystem = new AlarmSystem({
      onAlarmChange: (data) => {
        if (this.alarmHUD) {
          this.alarmHUD.update(data.level, data.state);
        }
      },
      onDetection: (evt) => {
        if (this.alarmHUD) {
          const type = evt.type === 'CAMERA_DETECTED' || evt.source === 'CAMERA' ? 'camera' : 'guard';
          const name = evt.role ? evt.role.toUpperCase() : 'CREW';
          const msg = type === 'camera' ? `CAMERA DETECTED ${name}` : `GUARD SPOTTED ${name}`;
          this.alarmHUD.showDetectionNotification(msg, type);
        }
      },
    });
  }

  _initAlarmHUD() {
    this.alarmHUD = new AlarmHUD();
  }

  _initMultiplayerState() {
    this.multiplayerGameState = new MultiplayerGameState(
      this.crew,
      this.movement,
      this.multiplayerClient,
      this.guards,
      this.securityCameras,
    );

    if (this.playerContext) {
      this.multiplayerGameState.setPlayerContext(this.playerContext);
    }

    if (this.multiplayerClient) {
      this.multiplayerClient.on('alarmUpdated', (data) => {
        this.alarmSystem.setLevel(data.level, data.state);
        this.alarmHUD.update(data.level, data.state);
      });

      this.multiplayerClient.on('guardDetected', (data) => {
        this.alarmSystem.recordDetection(data);
        this.alarmHUD.showDetectionNotification(`GUARD SPOTTED ${data.role || 'CREW'}`, 'guard');
      });

      this.multiplayerClient.on('cameraDetected', (data) => {
        this.alarmSystem.recordDetection(data);
        this.alarmHUD.showDetectionNotification(`CAMERA DETECTED ${data.role || 'CREW'}`, 'camera');
      });

      // ─── Vault & Loot Multiplayer Listeners (Milestone 13) ─
      this.multiplayerClient.on('vaultOpeningStarted', (data) => {
        const v = data.vault || {};
        this.vaultSystem.setState(v.state || 'OPENING', v.progress || 0, data.openedBy, data.role);
        this.vaultHUD.update('OPENING', v.progress || 0);
      });

      this.multiplayerClient.on('vaultStateUpdated', (data) => {
        this.vaultSystem.setState(data.state, data.progress, data.openedBy, data.openedByRole);
        this.vaultHUD.update(data.state, data.progress);
      });

      this.multiplayerClient.on('vaultOpened', (data) => {
        this.vaultSystem.setState('OPEN', 100, data.openedBy, data.openedByRole);
        this.vaultHUD.update('OPEN', 100);
        if (data.loot && data.loot.items) {
          this.lootSystem.initLootItems(data.loot.items, data.loot.totalCollectedValue || 0);
        }
      });

      this.multiplayerClient.on('vaultOpeningCancelled', (data) => {
        this.vaultSystem.setState('LOCKED', 0);
        this.vaultHUD.update('LOCKED', 0);
      });

      this.multiplayerClient.on('vaultStateSnapshot', (data) => {
        if (data.vault) {
          this.vaultSystem.setState(data.vault.state, data.vault.progress, data.vault.openedBy, data.vault.openedByRole);
          this.vaultHUD.update(data.vault.state, data.vault.progress);
        }
      });

      this.multiplayerClient.on('lootSpawned', (data) => {
        if (data.loot && data.loot.items) {
          this.lootSystem.initLootItems(data.loot.items, data.loot.totalCollectedValue || 0);
        }
      });

      this.multiplayerClient.on('lootCollected', (data) => {
        this.lootSystem.collectLoot(data.lootId, data);
      });

      this.multiplayerClient.on('lootStateSnapshot', (data) => {
        if (data.loot && data.loot.items) {
          this.lootSystem.initLootItems(data.loot.items, data.loot.totalCollectedValue || 0);
        }
      });

      // ─── Escape System Multiplayer Listeners (Milestone 14)
      this.multiplayerClient.on('escapeAvailable', (data) => {
        if (data.escape) {
          this.escapeSystem.setEscapeState(data.escape);
          if (this.escapeHUD) {
            const localId = this.playerContext ? this.playerContext.localPlayerId : null;
            const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
            this.escapeHUD.update(data.escape, localId, totalPlayers);
          }
        }
      });

      this.multiplayerClient.on('escapeStarted', (data) => {
        if (data.escape) {
          this.escapeSystem.setEscapeState(data.escape);
          if (this.escapeHUD) {
            const localId = this.playerContext ? this.playerContext.localPlayerId : null;
            const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
            this.escapeHUD.update(data.escape, localId, totalPlayers);
          }
        }
      });

      this.multiplayerClient.on('playerEscaped', (data) => {
        if (data.escape) {
          this.escapeSystem.setEscapeState(data.escape);
          if (this.escapeHUD) {
            const localId = this.playerContext ? this.playerContext.localPlayerId : null;
            const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
            this.escapeHUD.update(data.escape, localId, totalPlayers);
          }
        }
      });

      this.multiplayerClient.on('escapeCancelled', (data) => {
        if (data.escape) {
          this.escapeSystem.setEscapeState(data.escape);
          if (this.escapeHUD) {
            const localId = this.playerContext ? this.playerContext.localPlayerId : null;
            const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
            this.escapeHUD.update(data.escape, localId, totalPlayers);
          }
        }
      });

      this.multiplayerClient.on('escapeProgress', (data) => {
        if (this.escapeSystem && this.escapeSystem.activeEscapes && this.escapeSystem.activeEscapes[data.playerId]) {
          this.escapeSystem.activeEscapes[data.playerId].progress = data.progress;
          if (this.escapeHUD) {
            const localId = this.playerContext ? this.playerContext.localPlayerId : null;
            const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
            this.escapeHUD.update({
              state: this.escapeSystem.state,
              escapedPlayers: this.escapeSystem.escapedPlayers,
              activeEscapes: this.escapeSystem.activeEscapes,
            }, localId, totalPlayers);
          }
        }
      });

      this.multiplayerClient.on('escapeStateSnapshot', (data) => {
        if (data.escape) {
          this.escapeSystem.setEscapeState(data.escape);
          if (this.escapeHUD) {
            const localId = this.playerContext ? this.playerContext.localPlayerId : null;
            const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
            this.escapeHUD.update(data.escape, localId, totalPlayers);
          }
        }
      });

      // ─── Heist Outcome & Final Result (Milestone 15) ───────
      this.multiplayerClient.on('heistCompleted', (data) => {
        console.log('[HEIST] Heist Completed! Result:', data);
        this.state.phase = PHASES.RESULT;
        this.timer.stop();
        this.actions.abort();
        if (this.vaultHUD) this.vaultHUD.setPrompt(null);
        if (this.plannerUI) this.plannerUI.hideStatus();
        if (this.resultUI) {
          this.resultUI.show(data.result || data);
        }
      });

      this.multiplayerClient.on('finalResultSnapshot', (data) => {
        if (data.finalResult && this.resultUI) {
          this.resultUI.show(data.finalResult);
        }
      });

      this.multiplayerClient.on('planAgainReady', () => {
        console.log('[HEIST] Plan Again Ready — Resetting to Planning phase');
        if (this.resultUI) this.resultUI.hide();
        this._enterPlanning();
      });
    }
  }

  /**
   * Start or transition to heist planning with player context.
   * @param {Object} [context]
   */
  startHeist(context = null) {
    if (context) {
      this.playerContext = context;
      console.log('[HEIST] Starting Heist with player identity:', context);
      if (this.multiplayerGameState) {
        this.multiplayerGameState.setPlayerContext(context);
      }
      if (this.plannerUI) {
        this.plannerUI.setLocalRole(context.localPlayerRole, context.players || []);
      }
    }
    this._enterPlanning();
  }

  /* ── Renderer ──────────────────────────────────── */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(COLORS.background);
  }

  /* ── Scene ─────────────────────────────────────── */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(COLORS.background, 0.008);
  }

  /* ── Camera ────────────────────────────────────── */
  _initCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR,
    );
    this.camera.position.set(
      CAMERA_POSITION.x,
      CAMERA_POSITION.y,
      CAMERA_POSITION.z,
    );
    this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
  }

  /* ── OrbitControls (dev mode) ──────────────────── */
  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.1; // prevent going below floor
    this.controls.minDistance = 5;
    this.controls.maxDistance = 80;
    this.controls.target.set(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
  }

  /* ── Lighting ──────────────────────────────────── */
  _initLighting() {
    // Soft clean ambient fill
    const ambient = new THREE.AmbientLight(COLORS.ambientLight, 0.65);
    this.scene.add(ambient);

    // Key light — directional with soft crisp shadows
    const dirLight = new THREE.DirectionalLight(COLORS.directionalLight, 0.85);
    dirLight.position.set(12, 28, 16);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 60;
    const d = 24; // shadow frustum half-size to cover the bank
    dirLight.shadow.camera.left   = -d;
    dirLight.shadow.camera.right  =  d;
    dirLight.shadow.camera.top    =  d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Crisp hemisphere light for sky/ground bounce
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.45);
    this.scene.add(hemiLight);
  }

  /* ── Bank Environment ─────────────────────────── */
  _initBank() {
    this.bank = new Bank();
    this.bank.addToScene(this.scene);
  }

  /* ── Crew Members ──────────────────────────────── */
  _initCrew() {
    this.crew = new Crew();
    this.crew.addToScene(this.scene);
  }

  /* ── Guards ───────────────────────────────────── */
  _initGuards() {
    this.guards = new Guards();
    this.guards.addToScene(this.scene);

    this.guardSystem = new GuardSystem(
      this.guards,
      (guard, member) => {
        // Single-player fallback detection callback
        if (!this.multiplayerClient || !this.multiplayerClient.state.isConnected) {
          console.log(`[HEIST] Detection event (Local): ${guard.name} spotted ${member.name}`);
          this.alarmSystem.setLevel(this.alarmSystem.level + 20, null, { source: 'GUARD', guardName: guard.name });
          this.alarmSystem.recordDetection({
            type: 'GUARD_DETECTED',
            guardId: guard.name,
            role: member.role,
          });
        }
      },
    );
    this.guardSystem.setCrewMembers(this.crew.members);
  }

  /* ── Security Cameras ──────────────────────────── */
  _initCameras() {
    this.securityCameras = new SecurityCameras();
    this.securityCameras.addToScene(this.scene);

    this.cameraSystem = new CameraSystem(
      this.securityCameras,
      (cam, member) => {
        // Single-player fallback detection callback
        if (!this.multiplayerClient || !this.multiplayerClient.state.isConnected) {
          console.log(`[HEIST] Camera event (Local): ${cam.name} spotted ${member.name}`);
          this.alarmSystem.setLevel(this.alarmSystem.level + 15, null, { source: 'CAMERA', cameraName: cam.name });
          this.alarmSystem.recordDetection({
            type: 'CAMERA_DETECTED',
            cameraId: cam.name,
            role: member.role,
          });
        }
      },
    );
    this.cameraSystem.setCrewMembers(this.crew.members);
  }

  /* ── Movement System ───────────────────────────── */
  _initMovement() {
    this.movement = new MovementSystem();
  }

  /* ── Action System ─────────────────────────────── */
  _initActions() {
    this.actions = new ActionSystem(this.movement);

    /** Per-character ActionQueues, keyed by role. */
    this.queues = new Map();
    for (const member of this.crew.members) {
      const q = new ActionQueue();
      this.queues.set(member.role, q);
      this.actions.register(member, q);
    }
  }

  /* ── Planner UI ────────────────────────────────── */
  _initPlannerUI() {
    this.plannerUI = new PlannerUI(
      this.crew,
      this.queues,
      {
        onExecute:   () => this._enterExecution(),
        onPlanAgain: () => this._enterPlanning(),
      },
      this.multiplayerClient,
    );

    if (this.multiplayerClient) {
      this.multiplayerClient.on('executionStarting', (data) => {
        console.log('[HEIST] Synchronized execution starting with team plan:', data.teamPlan);
        if (data.teamPlan) {
          for (const [roleUpper, actions] of Object.entries(data.teamPlan)) {
            const queue = this.queues.get(roleUpper.toLowerCase());
            if (queue) {
              queue.clear();
              for (const a of actions) queue.addAction(a);
            }
          }
        }
        this._enterExecution();
      });
    }
  }

  /* ── Heist Timer ───────────────────────────────── */
  _initTimer() {
    this.timer = new HeistTimer(() => this._onTimeout());
  }

  /* ── Timer HUD ─────────────────────────────────── */
  _initTimerHUD() {
    this.timerHUD = new TimerHUD();
  }

  /* ═══════════════════════════════════════════════════
     Phase Transitions
     ═══════════════════════════════════════════════════ */

  /** Transition to PLANNING phase. */
  _enterPlanning() {
    this.state.phase = PHASES.PLANNING;

    // Stop & reset timer
    this.timer.reset();

    // Abort any in-progress execution
    this.actions.abort();

    // Clear all queues
    for (const q of this.queues.values()) q.clear();

    // Reset characters to the lobby spawn positions
    this.crew.resetPositions();

    // Reset guards to patrol start
    this.guardSystem.reset();

    // Reset cameras
    this.cameraSystem.reset();

    // Reset Alarm
    this.alarmSystem.reset();

    // Reset Vault, Loot & Escape
    if (this.vaultSystem) this.vaultSystem.reset();
    if (this.lootSystem) this.lootSystem.reset();
    if (this.escapeSystem) {
      this.escapeSystem.setEscapeState({ state: 'LOCKED', escapedPlayers: [], activeEscapes: {} });
    }

    if (this.multiplayerClient && this.multiplayerClient.state.isConnected) {
      this.multiplayerClient.resetSimulation();
    }

    // Hide result modal if open
    if (this.resultUI) {
      this.resultUI.hide();
    }

    // Show planner UI, update timer HUD to 60, hide Alarm HUD, Vault HUD, Loot HUD, Escape HUD
    this.plannerUI.show();
    this.plannerUI.hideStatus();
    this.timerHUD.update(this.timer.remaining);
    this.timerHUD.show();
    if (this.alarmHUD) {
      this.alarmHUD.hide();
    }
    if (this.vaultHUD) {
      this.vaultHUD.hide();
    }
    if (this.lootHUD) {
      this.lootHUD.hide();
    }
    if (this.escapeHUD) {
      this.escapeHUD.hide();
    }
  }

  /** Transition to EXECUTING phase. */
  _enterExecution() {
    this.state.phase = PHASES.EXECUTING;

    if (this.resultUI) {
      this.resultUI.hide();
    }

    this.plannerUI.hide();
    this.plannerUI.showStatus('EXECUTING…');

    // Start the 60-second countdown
    this.timer.start();

    // Reset guard system for a fresh run, then it auto-updates
    this.guardSystem.reset();

    // Reset camera system
    this.cameraSystem.reset();

    // Show Alarm HUD
    if (this.alarmHUD) {
      this.alarmHUD.update(this.alarmSystem.level, this.alarmSystem.state);
      this.alarmHUD.show();
    }

    // Show Vault HUD, Loot HUD & Escape HUD
    if (this.vaultHUD) {
      this.vaultHUD.update(this.vaultSystem.state, this.vaultSystem.progress);
      this.vaultHUD.show();
    }
    if (this.lootHUD) {
      this.lootHUD.update(this.lootSystem.getStats());
      this.lootHUD.show();
    }
    if (this.escapeHUD) {
      const localId = this.playerContext ? this.playerContext.localPlayerId : null;
      const totalPlayers = (this.playerContext && this.playerContext.players) ? this.playerContext.players.length : 4;
      this.escapeHUD.update({
        state: this.escapeSystem ? this.escapeSystem.state : 'LOCKED',
        escapedPlayers: this.escapeSystem ? this.escapeSystem.escapedPlayers : [],
        activeEscapes: this.escapeSystem ? this.escapeSystem.activeEscapes : {},
      }, localId, totalPlayers);
      this.escapeHUD.show();
    }

    // Begin executing all action queues
    this.actions.execute(() => this._onExecutionComplete());
  }

  /** Called when all action queues finish before timeout. */
  _onExecutionComplete() {
    // In multiplayer/escape mode, characters stay at their destination allowing escape interaction
    if (this.timer.timedOut) return;

    if (this.vaultHUD) this.vaultHUD.setPrompt(null);
    this.plannerUI.hideStatus();
  }

  /** Called when the 60-second timer reaches zero. */
  _onTimeout() {
    this.state.phase = PHASES.RESULT;

    // Stop all character movement and action execution
    this.actions.abort();

    if (this.vaultHUD) this.vaultHUD.setPrompt(null);
    this.plannerUI.hideStatus();

    if (this.multiplayerClient && this.multiplayerClient.state.isConnected) {
      this.multiplayerClient.concludeHeist('TIMEOUT');
    } else {
      // Single-player fallback result calculation
      const securedLoot = this.lootSystem ? this.lootSystem.totalCollectedValue : 0;
      const isEscaped = this.escapeSystem && this.escapeSystem.escapedPlayers && this.escapeSystem.escapedPlayers.length > 0;
      const mockResult = {
        grade: isEscaped ? (securedLoot >= 1300 ? 'S' : (securedLoot >= 650 ? 'A' : 'B')) : 'F',
        ratingTitle: isEscaped ? (securedLoot >= 1300 ? 'PERFECT HEIST' : 'CLEAN GETAWAY') : 'BUSTED',
        loot: {
          totalSecured: securedLoot,
          totalPossible: 1300,
          breakdown: this.lootSystem ? this.lootSystem.getStats() : {},
        },
        stealth: {
          alarmLevel: this.alarmSystem ? this.alarmSystem.level : 0,
          alarmState: this.alarmSystem ? this.alarmSystem.state : 'NORMAL',
        },
        operatives: this.crew.members.map((m) => ({
          id: m.role,
          role: m.role.toUpperCase(),
          name: m.role.toUpperCase(),
          status: (this.escapeSystem && this.escapeSystem.escapedPlayers.includes(m.role)) ? 'ESCAPED' : 'INSIDE',
          lootValue: m.role === 'thief' ? securedLoot : 0,
        })),
        escapedCount: isEscaped ? 1 : 0,
        totalPlayers: 4,
      };
      if (this.resultUI) {
        this.resultUI.show(mockResult);
      }
    }
  }

  /* ── Resize Handler ────────────────────────────── */
  _onResize() {
    const width  = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /* ── Animation Loop ────────────────────────────── */
  start() {
    this.renderer.setAnimationLoop((/* time */) => this._tick());
  }

  _tick() {
    const delta = this.clock.getDelta();

    // Update orbit controls damping
    this.controls.update();

    // Update vault, loot & escape visual animations
    if (this.vaultSystem) {
      this.vaultSystem.update(delta);
    }
    if (this.lootSystem) {
      this.lootSystem.update(delta);
    }
    if (this.escapeSystem) {
      this.escapeSystem.update(delta);
    }

    // Update timer & systems
    if (this.state.phase === PHASES.EXECUTING) {
      this.timer.update(delta);
      this.timerHUD.update(this.timer.remaining);

      // In single player, run local guard & camera simulation
      const isMultiplayerActive = this.multiplayerClient && this.multiplayerClient.state.isConnected;
      if (!isMultiplayerActive) {
        this.guardSystem.update(delta);
        this.cameraSystem.update(delta);

        // Single-player vault opening progression
        if (this.vaultSystem && this.vaultSystem.state === 'OPENING') {
          const newProgress = Math.min(100, this.vaultSystem.progress + (delta / 5.0) * 100);
          if (newProgress >= 100) {
            this.vaultSystem.setState('OPEN', 100);
          } else {
            this.vaultSystem.setState('OPENING', Math.round(newProgress));
          }
        }
      } else {
        // In multiplayer, cameras still oscillate scan visually while server determines detection
        for (const cam of this.securityCameras.members) {
          if (!cam._phase) cam._phase = 0;
          cam._phase += delta * cam.scanSpeed;
          cam.pivot.rotation.y = cam.baseYaw + Math.sin(cam._phase) * cam.scanAmplitude;
        }
      }

      // Check proximity for interaction prompts
      this._updateInteractionPrompts();
    } else {
      if (this.vaultHUD) this.vaultHUD.setPrompt(null);
    }

    // Update movement & actions
    this.movement.update(delta);
    this.actions.update(delta);

    // Update multiplayer network synchronization & remote interpolation
    if (this.multiplayerGameState) {
      this.multiplayerGameState.update(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _updateInteractionPrompts() {
    if (!this.vaultHUD) return;

    let localMember = null;
    let localRole = null;

    if (this.playerContext && this.playerContext.localPlayerRole) {
      localRole = this.playerContext.localPlayerRole.toUpperCase();
      localMember = this.crew.getByRole(localRole.toLowerCase());
    } else {
      for (const m of this.crew.members) {
        if (this.lootSystem && this.lootSystem.getClosestCollectable(m.group.position, 2.0)) {
          localMember = m;
          localRole = m.role.toUpperCase();
          break;
        }
        const vCheck = this.vaultSystem ? this.vaultSystem.checkInteraction(m.role, m.group.position) : null;
        if (vCheck && (vCheck.canOpen || vCheck.isNear)) {
          localMember = m;
          localRole = m.role.toUpperCase();
          break;
        }
      }
    }

    if (!localMember) {
      this.vaultHUD.setPrompt(null);
      return;
    }

    const pos = localMember.group.position;
    let prompt = null;

    const isLocalEscaped = this.escapeSystem && this.escapeSystem.escapedPlayers && this.playerContext && this.escapeSystem.escapedPlayers.includes(this.playerContext.localPlayerId);

    // 1. Proximity to Escape zone
    if (this.escapeSystem && !isLocalEscaped) {
      const escCheck = this.escapeSystem.checkProximity(pos, isLocalEscaped, this.playerContext ? this.playerContext.localPlayerId : null);
      if (escCheck.inZone) {
        prompt = escCheck.promptText;
      }
    }

    // 2. Proximity to loot if vault open
    if (!prompt && this.vaultSystem && this.vaultSystem.state === 'OPEN') {
      const closestLoot = this.lootSystem.getClosestCollectable(pos, 2.0);
      if (closestLoot) {
        prompt = `[E] COLLECT ${closestLoot.type} ($${closestLoot.value})`;
      }
    }

    // 3. Proximity to vault if not near escape/loot
    if (!prompt && this.vaultSystem) {
      const vCheck = this.vaultSystem.checkInteraction(localRole, pos);
      if (vCheck.isNear) {
        prompt = vCheck.promptText;
      }
    }

    this.vaultHUD.setPrompt(prompt);
  }
}
