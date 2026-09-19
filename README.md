# HEIST: 60 SECONDS

A real-time 3D multiplayer strategy heist game built with **Three.js**, **Socket.IO**, **Express.js**, **Vite**, and vanilla JavaScript ES6+.

---

## Tech Stack

| Layer          | Technology                      |
|----------------|---------------------------------|
| Language       | JavaScript ES6+                 |
| 3D Engine      | Three.js (via npm)              |
| Networking     | Socket.IO + Express.js          |
| Bundler / Dev  | Vite + Concurrently             |
| UI / Styling   | HTML5 + Vanilla CSS (Light Theme) |

---

## Multiplayer Setup & Getting Started

### Requirements
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation & Running

```bash
# 1. Install dependencies
npm install

# 2. Start both server and client concurrently
npm run dev
```

- **Client (Vite)**: http://localhost:3000
- **Multiplayer Server (Socket.IO + Express)**: http://localhost:3001

You can also run client and server separately:
```bash
npm run dev:server  # Runs Express + Socket.IO backend on :3001
npm run dev:client  # Runs Vite frontend on :3000
```

---

## Multiplayer Architecture

```
PLAYER BROWSER
    │
    │ (Socket.IO WebSocket Connection)
    ▼
NODE + EXPRESS + SOCKET.IO SERVER (server/server.js)
    ├── ROOM MANAGER (server/rooms/RoomManager.js)
    ├── PLAYER MANAGER (server/players/PlayerManager.js)
    └── MULTIPLAYER GAME STATE
            ├── Player 1 → THIEF
            ├── Player 2 → HACKER
            ├── Player 3 → DISTRACTOR
            └── Player 4 → ENFORCER
```

### Flow & Lifecycle:

1. **Player Name**: Enter your operative name on the landing screen.
2. **Create Room**: Generates a unique 5-character room code (e.g., `HX7K2`). The creator becomes the room **HOST**.
3. **Join Room**: Other players enter the room code to join the lobby.
4. **4-Player Lobby**:
   - Up to 4 players per room.
   - Host assigns each player a unique role: **THIEF**, **HACKER**, **DISTRACTOR**, or **ENFORCER**.
   - Duplicate roles are strictly prohibited and validated on the server.
5. **Ready System**: Each player toggles their **READY** status.
6. **Start Heist**: Once all 4 players are present, assigned unique roles, and set to **READY**, the host clicks **START HEIST**.
7. **Game Start & Crew Synchronization**:
   - Server broadcasts initial `crewStateSnapshot` with spawn coordinates for all 4 crew members.
   - Each player is granted authoritative control **only** over their assigned crew member.
   - Planner UI enforces role ownership: players can only assign actions to their owned operative.
   - Active movement is throttled to ~12.5 Hz across the network, with an immediate authoritative update upon arrival.
   - Remote characters are smoothly interpolated (`Vector3.lerp`) with natural procedural limb swinging animations.
   - 3D labels display Role, Player Name, and a distinctive **YOU** badge on the local player's character.

---

## The Four Roles

| Role | Description |
|---|---|
| **THIEF** | Agile infiltrator specialized in rapid navigation and vault access. |
| **HACKER** | Technical expert handling security overrides and camera disabling. |
| **DISTRACTOR** | Area manipulator drawing guard attention away from the crew. |
| **ENFORCER** | Heavy operative capable of subduing threats and neutralizing obstacles. |

---

## Networked Detection & Alarm System (Milestone 12)

```
                NODE.JS + SOCKET.IO SERVER (20 Hz Simulation)
                                │
        ┌───────────────────────┼───────────────────────┐
        ↓                       ↓                       ↓
   ROOM STATE              GUARD STATE             CAMERA STATE
  (Shared Plan)       (Patrol/Investigate/Return)    (Active/Detecting)
        │                       │                       │
        │                       └───────────┬───────────┘
        │                                   ↓
        │                           DETECTION ENGINE
        │                       (Pure distance/FOV math)
        │                                   │
        │                                   ↓
        │                              ALARM STATE
        │                           (0–100% Shared Level)
        │                                   │
        └───────────────────┬───────────────┘
                            ↓ (Real-time Broadcast)
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
          PLAYER 1       PLAYER 2      PLAYER 3/4
             │              │              │
             └────── Synchronized Game State ──────┘
```

### Authoritative Guards
* **Simulation Rate**: 20 Hz (50ms interval) authoritative tick on Node.js server during heist execution.
* **Patrol Routes**: Predefined multi-waypoint routes (`lobbyGuard`, `vaultGuard`, `securityGuard`).
* **State Machine**:
  * `PATROL`: Guards follow assigned waypoints and scan for crew.
  * `INVESTIGATE`: Triggered when an operative is detected; guard moves to last known position and lingers for 2.5s.
  * `RETURN`: Moves to nearest patrol waypoint, then resumes `PATROL`.
* **Client Interpolation**: Smooth `lerp` position and rotation interpolation with walking limb animations on remote clients.

### Authoritative Security Cameras
* **Scanning Motion**: Sinusoidal yaw sweep (`baseYaw + sin(phase) * scanAmplitude`) computed continuously.
* **Detection State**: Server computes viewing cone math (`distance <= range` and `dot >= cos(halfFov)`) to toggle `ACTIVE` and `DETECTING`.
* **Visual Cone & LED**: Synchronized color transitions (Blue/Green for `ACTIVE`, Red for `DETECTING`).

### Shared Alarm System
* **Shared Team Alarm**: 0% to 100% danger level shared simultaneously across all 4 players.
* **Detection Increments**:
  * Guard Spot: **+20%**
  * Camera Spot: **+15%**
* **Alarm Levels**:
  * `0–24%`: **NORMAL** (slate neutral/accent)
  * `25–49%`: **SUSPICIOUS** (amber warning)
  * `50–74%`: **ALERT** (orange alert)
  * `75–99%`: **CRITICAL** (red danger)
  * `100%`: **MAXIMUM** (pulsing bold danger)
* **Alarm Decay**: Automatic **-5% every 3 seconds** when no active detections exist in the bank.
* **Light Theme UI**: Prominent HUD widget displaying percentage, state badge, animated progress bar, and sliding toast alerts (`🚨 GUARD SPOTTED [ROLE]`, `📹 CAMERA DETECTED [ROLE]`).
* **Plan Again Reset**: Returning to planning resets alarm to 0%, guards to patrol routes, and cameras to active state.

---

## Current Multiplayer Scope & Limitations (Milestone 12)

- **Synchronized in Milestone 12**:
  - Player identities, lobby rooms, role assignment, and lobby ready states.
  - Server-authoritative **Shared Team Plan** (`THIEF`, `HACKER`, `DISTRACTOR`, `ENFORCER`).
  - Strict role-based action validation and planning ready state tracking.
  - Synchronized host execution start.
  - Server-authoritative **Guards** (movement, routing, investigation state machine, 20 Hz updates).
  - Server-authoritative **Security Cameras** (oscillating FOV scan, state synchronization).
  - Server-authoritative **Alarm System** (0–100% level, 5 danger states, +20/+15 increments, -5/3s decay).
  - Synchronized detection toasts and Light Theme Alarm HUD.
  - Crew movement synchronization (12.5 Hz) and remote character interpolation.
- **Local in Milestone 12**:
  - 3D rendering, materials, lighting, particle/LED effects, and local countdown timer.
  - Loot collection, vault opening, escape zones, scoring, and hacker camera disabling will be introduced in subsequent milestones.

---

## Project Structure

```
HEIST-60-SECONDS/
├── index.html            # HTML entry point
├── package.json          # Dependencies & dev scripts
├── vite.config.js        # Vite build configuration
├── server/               # Multiplayer backend
│   ├── server.js         # Express + Socket.IO server, 20 Hz simulation loop & handlers
│   ├── rooms/
│   │   └── RoomManager.js # Room lifecycle, team planning, authoritative guards, cameras & alarm
│   └── players/
│       └── PlayerManager.js
├── src/
│   ├── main.js           # App bootstrap & lobby-game handoff
│   ├── style.css         # Global Light UI design system & CSS variables
│   ├── multiplayer/
│   │   ├── MultiplayerClient.js    # Socket.IO client interface
│   │   ├── MultiplayerState.js     # Client session state
│   │   └── MultiplayerGameState.js # Crew & guard sync, throttling & remote lerp
│   ├── game/
│   │   ├── Game.js       # Three.js scene setup & render loop
│   │   ├── GameState.js  # Phase tracking
│   │   ├── Bank.js       # 3D Bank geometry & rooms
│   │   ├── NavigationPoints.js
│   │   ├── GuardRoutes.js
│   │   └── Constants.js
│   ├── entities/         # Crew, Guards, SecurityCameras
│   ├── systems/          # MovementSystem, ActionQueue, ActionSystem, Timer, GuardSystem, CameraSystem, AlarmSystem
│   └── ui/
│       ├── MultiplayerUI.js # Light theme lobby, name & join modals
│       ├── PlannerUI.js     # Light theme shared team strategy planner panel
│       ├── TimerHUD.js      # Light theme countdown timer display
│       └── AlarmHUD.js      # Light theme shared alarm level & detection HUD
└── test/
    └── multiplayer.test.js # 18 automated integration tests for Milestone 12
```