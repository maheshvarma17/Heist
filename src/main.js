/**
 * main.js
 * Application entry point — connects Multiplayer lobby and 3D Game.
 */

import './style.css';
import { Game } from './game/Game.js';
import { MultiplayerClient } from './multiplayer/MultiplayerClient.js';
import { MultiplayerUI } from './ui/MultiplayerUI.js';

const canvas = document.getElementById('game-canvas');

if (!canvas) {
  throw new Error('Canvas element #game-canvas not found in the DOM.');
}

// Initialize 3D game instance (renders atmospheric bank scene behind UI)
const game = new Game(canvas, { autoStartPlanner: false });
game.start();

// Initialize Multiplayer Client & UI
const multiplayerClient = new MultiplayerClient();

const multiplayerUI = new MultiplayerUI(multiplayerClient, {
  onGameStart: (context) => {
    console.log('[HEIST] Game starting handoff from lobby:', context);
    game.startHeist(context);
  },
});

console.log('[HEIST] Multiplayer Foundation & Scene initialised ✓');
