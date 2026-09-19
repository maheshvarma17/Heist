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
import { PlannerUI } from '../ui/PlannerUI.js';
import { TimerHUD } from '../ui/TimerHUD.js';
import { AlarmHUD } from '../ui/AlarmHUD.js';
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
    this._initMovement();
    this._initActions();
    this._initTimer();
    this._initAlarm();
    this._initPlannerUI();
    this._initTimerHUD();
    this._initAlarmHUD();
    this._initMultiplayerState();

    if (options.autoStartPlanner !== false) {
      // Start in PLANNING phase immediately
      this._enterPlanning();
    }

    window.addEventListener('resize', () => this._onResize());
    this._onResize(); // set initial size
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
    // Soft ambient fill
    const ambient = new THREE.AmbientLight(COLORS.ambientLight, 0.4);
    this.scene.add(ambient);

    // Key light — directional with shadows (covers the full bank)
    const dirLight = new THREE.DirectionalLight(COLORS.directionalLight, 0.8);
    dirLight.position.set(10, 25, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 60;
    const d = 24; // shadow frustum half-size to cover the bank
    dirLight.shadow.camera.left   = -d;
    dirLight.shadow.camera.right  =  d;
    dirLight.shadow.camera.top    =  d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    // Subtle hemisphere for sky/ground bounce
    const hemiLight = new THREE.HemisphereLight(0x8899bb, 0x222244, 0.25);
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

    if (this.multiplayerClient && this.multiplayerClient.state.isConnected) {
      this.multiplayerClient.resetSimulation();
    }

    // Show planner UI, update timer HUD to 60, hide Alarm HUD
    this.plannerUI.show();
    this.plannerUI.hideStatus();
    this.timerHUD.update(this.timer.remaining);
    this.timerHUD.show();
    if (this.alarmHUD) {
      this.alarmHUD.hide();
    }
  }

  /** Transition to EXECUTING phase. */
  _enterExecution() {
    this.state.phase = PHASES.EXECUTING;

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

    // Begin executing all action queues
    this.actions.execute(() => this._onExecutionComplete());
  }

  /** Called when all action queues finish before timeout. */
  _onExecutionComplete() {
    // Ignore if already timed out
    if (this.timer.timedOut) return;

    this.state.phase = PHASES.RESULT;
    this.timer.stop();

    this.plannerUI.hideStatus();
    this.plannerUI.showComplete({
      type: 'success',
      remaining: this.timer.remaining,
    });
  }

  /** Called when the 60-second timer reaches zero. */
  _onTimeout() {
    this.state.phase = PHASES.RESULT;

    // Stop all character movement and action execution
    this.actions.abort();

    this.plannerUI.hideStatus();
    this.plannerUI.showComplete({ type: 'timeout' });
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

    // Update timer & systems
    if (this.state.phase === PHASES.EXECUTING) {
      this.timer.update(delta);
      this.timerHUD.update(this.timer.remaining);

      // In single player, run local guard & camera simulation
      const isMultiplayerActive = this.multiplayerClient && this.multiplayerClient.state.isConnected;
      if (!isMultiplayerActive) {
        this.guardSystem.update(delta);
        this.cameraSystem.update(delta);
      } else {
        // In multiplayer, cameras still oscillate scan visually while server determines detection
        for (const cam of this.securityCameras.members) {
          if (!cam._phase) cam._phase = 0;
          cam._phase += delta * cam.scanSpeed;
          cam.pivot.rotation.y = cam.baseYaw + Math.sin(cam._phase) * cam.scanAmplitude;
        }
      }
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
}
