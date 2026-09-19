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

## Current Multiplayer Scope & Limitations (Milestone 11)

- **Synchronized in Milestone 11**:
  - Player identities, lobby rooms, role assignment, and lobby ready states.
  - Server-authoritative **Shared Team Plan** (`THIEF`, `HACKER`, `DISTRACTOR`, `ENFORCER`).
  - Strict role-based action validation: players can only add/remove actions for their assigned role.
  - Real-time action broadcast (`teamPlanUpdated`) displaying live plans of all 4 teammates in real time.
  - Separate **Planning Ready** system (`READY FOR HEIST`) tracking all 4 players' readiness.
  - Synchronized host execution trigger (`EXECUTE HEIST` / `executionStarting`) that kicks off the 60-second heist simultaneously across all clients.
  - Server-validated crew movement and state updates.
  - 12.5 Hz throttled network transmission and remote interpolation.
  - Role labels and "YOU" local ownership indicator.
  - In-game player disconnect broadcasting.
- **Local in Milestone 11**:
  - 3D scene rendering, guard patrolling, security camera scanning and detection mathematics, and local 60-second timer simulation.
  - Networked guards/cameras, alarms, and loot will be introduced in subsequent milestones.

---

## Project Structure

```
HEIST-60-SECONDS/
├── index.html            # HTML entry point
├── package.json          # Dependencies & dev scripts
├── vite.config.js        # Vite build configuration
├── server/               # Multiplayer backend
│   ├── server.js         # Express + Socket.IO server & socket handlers
│   ├── rooms/
│   │   └── RoomManager.js # Room lifecycle, team planning & crew states
│   └── players/
│       └── PlayerManager.js
├── src/
│   ├── main.js           # App bootstrap & lobby-game handoff
│   ├── style.css         # Global Light UI design system & CSS variables
│   ├── multiplayer/
│   │   ├── MultiplayerClient.js    # Socket.IO client interface
│   │   ├── MultiplayerState.js     # Client session state
│   │   └── MultiplayerGameState.js # Crew sync, throttling & remote lerp
│   ├── game/
│   │   ├── Game.js       # Three.js scene setup & render loop
│   │   ├── GameState.js  # Phase tracking
│   │   ├── Bank.js       # 3D Bank geometry & rooms
│   │   ├── NavigationPoints.js
│   │   └── Constants.js
│   ├── entities/         # Crew (Thief, Hacker, Distractor, Enforcer), Guards, Cameras
│   ├── systems/          # MovementSystem, ActionQueue, ActionSystem, Timer, Guards, Cameras
│   └── ui/
│       ├── MultiplayerUI.js # Light theme lobby, name & join modals
│       ├── PlannerUI.js     # Light theme shared team strategy planner panel
│       └── TimerHUD.js      # Light theme countdown timer display
└── test/
    └── multiplayer.test.js # Automated integration test suite
```