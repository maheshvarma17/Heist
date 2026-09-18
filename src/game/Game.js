/**
 * Game.js
 * Bootstraps the Three.js scene, camera, renderer, bank environment,
 * OrbitControls, and the animation loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { GameState } from './GameState.js';
import { Bank } from './Bank.js';
import { Crew } from '../entities/Crew.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { NAV_POINTS } from './NavigationPoints.js';
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
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.state = new GameState();
    this.clock = new THREE.Clock();

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initControls();
    this._initLighting();
    this._initBank();
    this._initCrew();
    this._initMovement();

    // ── DEV TEST (Milestone 4) — remove for production ──
    this._devTestMovement();

    window.addEventListener('resize', () => this._onResize());
    this._onResize(); // set initial size
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

  /* ── Movement System ───────────────────────────── */
  _initMovement() {
    this.movement = new MovementSystem();
  }

  /* ── DEV TEST (Milestone 4) ────────────────────── */
  /* Moves each crew member to a different room after
     a short delay.  Remove this method and its call
     in the constructor once the planning UI exists.  */
  _devTestMovement() {
    setTimeout(() => {
      this.movement.moveTo(this.crew.thief,      NAV_POINTS.office,       (c) => console.log(`[DEV] ${c.name} arrived at Office`));
      this.movement.moveTo(this.crew.hacker,     NAV_POINTS.securityRoom, (c) => console.log(`[DEV] ${c.name} arrived at Security`));
      this.movement.moveTo(this.crew.distractor, NAV_POINTS.hallway,      (c) => console.log(`[DEV] ${c.name} arrived at Hallway`));
      this.movement.moveTo(this.crew.enforcer,   NAV_POINTS.vault,        (c) => console.log(`[DEV] ${c.name} arrived at Vault`));
    }, 2000);
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

    // Update systems
    this.movement.update(delta);

    this.renderer.render(this.scene, this.camera);
  }
}
