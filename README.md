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

## Vault System & Multiplayer Loot System (Milestone 13)

```
TEAM PLANS ➔ HEIST STARTS ➔ REACH VAULT ➔ OPEN VAULT (5s) ➔ LOOT AVAILABLE ➔ COLLECT LOOT
```

### Authoritative Vault System
* **Vault States**:
  * `LOCKED`: Initial state at start of heist or on reset.
  * `OPENING`: Active opening sequence lasting approximately **5.0 seconds** with continuous progress tracking (0% to 100%).
  * `OPEN`: Vault door swung open 90°; enables 3D loot items inside the vault for collection.
* **Authorized Roles**: Only the **THIEF** or **HACKER** can initiate vault opening.
* **Proximity & Cancellation**: The operative must remain within **3.0 world units** of the vault entrance (`(0, 0, 10)`). Moving away or disconnecting automatically cancels opening and resets the vault to `LOCKED`.
* **Visuals**: Procedural circular vault door with rotating locking wheel during opening and smooth hinge pivot swinging open upon completion.

### Authoritative Loot System
* **Loot Types & Values**:
  * **CASH** (3 items): **$100** each (procedural bill stacks with band)
  * **GOLD** (2 items): **$250** each (procedural shiny metallic gold bars)
  * **DIAMONDS** (1 item): **$500** (procedural faceted crystal gemstone)
  * **Total Heist Vault Value**: **$1,500** across 6 distinct items.
* **Collection Rules**:
  * Available only when `vault.state === 'OPEN'`.
  * Accessible to **all 4 crew members**.
  * Operative must be within **2.0 world units** of the item.
  * Triggered using the **[E]** keyboard interaction prompt.
* **Server Authority & Race Protection**:
  * The server is authoritative over all loot existence, positions, and claimed states.
  * Simultaneous collection attempts on the same loot item resolve to a single winner; subsequent attempts receive `lootError` ("Loot has already been collected.").
* **3D Visuals & Animation**:
  * Procedural Three.js geometry with continuous gentle rotation and vertical sinusoidal bobbing.
  * Collected items are instantly hidden and synchronized across all clients.
* **Light Theme HUDs & Prompts**:
  * **Vault HUD**: Displays `VAULT: LOCKED` / `OPENING XX%` / `OPEN` with a live progress bar.
  * **Loot HUD**: Displays real-time counts (`CASH 0/3`, `GOLD 0/2`, `DIAMONDS 0/1`) and accumulated `LOOT VALUE`. *(Note: Scoring and Escape are not implemented yet).*
  * **Interaction Prompt**: Dynamic floating banner displaying `[E] OPEN VAULT`, `[E] COLLECT CASH ($100)`, etc.

---

## Current Multiplayer Scope & Limitations (Milestone 13)

- **Synchronized in Milestone 13**:
  - Player identities, lobby rooms, role assignment, and lobby ready states.
  - Server-authoritative **Shared Team Plan** (`THIEF`, `HACKER`, `DISTRACTOR`, `ENFORCER`).
  - Strict role-based action validation and planning ready state tracking.
  - Synchronized host execution start.
  - Server-authoritative **Guards** (movement, routing, investigation state machine, 20 Hz updates).
  - Server-authoritative **Security Cameras** (oscillating FOV scan, state synchronization).
  - Server-authoritative **Alarm System** (0–100% level, 5 danger states, +20/+15 increments, -5/3s decay).
  - Server-authoritative **Vault System** (LOCKED, OPENING 5s duration, OPEN, Thief/Hacker authorization, proximity cancellation).
  - Server-authoritative **Loot System** (6 items: Cash, Gold, Diamonds, proximity checks, duplicate protection, instant network removal).
  - Synchronized Vault HUD, Loot HUD, and [E] interaction prompts.
  - Crew movement synchronization (12.5 Hz) and remote character interpolation.
- **Out of Scope in Milestone 13**:
  - Escape zones and vehicle pickup.
  - Final win/fail scoring system.
  - Police response.
  - Hacker camera disabling.
  - Combat and subduing guards.

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
│   │   └── RoomManager.js # Room lifecycle, team planning, authoritative guards, cameras, alarm, vault & loot
│   └── players/
│       └── PlayerManager.js
├── src/
│   ├── main.js           # App bootstrap & lobby-game handoff
│   ├── style.css         # Global Light UI design system & CSS variables
│   ├── multiplayer/
│   │   ├── MultiplayerClient.js    # Socket.IO client interface (vault & loot events)
│   │   ├── MultiplayerState.js     # Client session state
│   │   └── MultiplayerGameState.js # Crew & guard sync, throttling & remote lerp
│   ├── game/
│   │   ├── Game.js       # Three.js scene setup, render loop, [E] interaction handler
│   │   ├── GameState.js  # Phase tracking
│   │   ├── Bank.js       # 3D Bank geometry, animated vault door
│   │   ├── NavigationPoints.js
│   │   ├── GuardRoutes.js
│   │   └── Constants.js
│   ├── entities/         # Crew, Guards, SecurityCameras
│   ├── systems/          # MovementSystem, ActionQueue, ActionSystem, Timer, GuardSystem, CameraSystem, AlarmSystem, VaultSystem, LootSystem
│   └── ui/
│       ├── MultiplayerUI.js # Light theme lobby, name & join modals
│       ├── PlannerUI.js     # Light theme shared team strategy planner panel
│       ├── TimerHUD.js      # Light theme countdown timer display
│       ├── AlarmHUD.js      # Light theme shared alarm level & detection HUD
│       ├── VaultHUD.js      # Light theme vault status & interaction prompt
│       └── LootHUD.js       # Light theme team loot collection breakdown
└── test/
    └── multiplayer.test.js # 16 automated integration tests for Milestone 13
```