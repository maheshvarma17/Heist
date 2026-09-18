/**
 * main.js
 * Application entry point — grabs the canvas and starts the game.
 */

import './style.css';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game-canvas');

if (!canvas) {
  throw new Error('Canvas element #game-canvas not found in the DOM.');
}

const game = new Game(canvas);
game.start();

console.log('[HEIST] Scene initialised ✓');
