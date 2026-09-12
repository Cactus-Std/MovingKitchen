# Multiplayer Roaming Player MVP — Engineering Specification

## 1. Goal

Build a hackathon MVP for a local multiplayer game where:

* 2–4 laptops are connected to the same LAN/Wi-Fi.
* One laptop runs the authoritative game server.
* Every laptop runs its own frontend locally.
* Players enter the same room code to join one game session.
* Each player chooses a unique color.
* Each player performs a short face enrollment once.
* Face images/video must remain local to the browser.
* Only face embeddings/descriptors may be shared through the game server.
* After enrollment, any laptop can identify any registered player standing in front of it.
* When a player walks from Laptop A to Laptop C, Laptop C recognizes that player and changes its UI to that player's color.
* When it is that player's turn, the computer they are currently standing in front of can become their active game station.

This is a proof-of-concept. Do not build a complete card game.

The key concept is:

**Player identity follows the player, not the device.**

---

# 2. MVP Success Scenario

The final demo must support this exact scenario:

1. Laptop A starts the server.
2. Four laptops connect to the same Wi-Fi.
3. Host creates room `AB12`.
4. Other laptops enter `AB12`.
5. Four players join:

   * Jack → Red
   * Amy → Blue
   * Bob → Green
   * Lucy → Yellow
6. Each player enrolls their face.
7. Game starts.
8. Laptop A recognizes Jack and becomes red.
9. Jack walks away from Laptop A.
10. Laptop A returns to neutral after Jack leaves.
11. Jack walks in front of Laptop C.
12. Laptop C recognizes Jack and becomes red.
13. Server says it is Jack's turn.
14. Laptop C displays:
    `JACK — YOUR TURN`
15. Jack presses the demo action button on Laptop C.
16. All four laptops receive the state update.
17. Server advances the turn to the next player.

If this entire scenario works reliably, the MVP is successful.

---

# 3. Non-Goals

Do NOT implement these unless all core requirements are already complete:

* Full card game mechanics
* User accounts
* Password authentication
* Database
* Cloud hosting
* WebRTC
* Video streaming between computers
* Sending camera frames to server
* Native desktop application
* Electron
* Tauri
* mDNS / Bonjour server discovery
* Mobile support
* Internet multiplayer
* Persistent player profiles
* Anti-cheat security
* Production-grade biometric authentication
* Multiple simultaneous games across multiple servers

---

# 4. Technology Stack

Use:

Frontend:

* React
* TypeScript
* Vite
* Zustand
* Socket.IO Client

Backend:

* Node.js
* TypeScript
* Express
* Socket.IO

Computer Vision:

* Browser `getUserMedia()`
* MediaPipe Face Landmarker / Face Detector
* ONNX Runtime Web
* Face embedding model compatible with browser inference

Development:

* npm workspaces
* ESLint
* Prettier

Do not introduce Next.js.

Do not introduce a database.

Do not introduce Redux.

---

# 5. Repository Structure

Create a monorepo:

```text
/
├── apps/
│   ├── client/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── game/
│   │   │   ├── networking/
│   │   │   ├── vision/
│   │   │   ├── stores/
│   │   │   ├── hooks/
│   │   │   ├── config/
│   │   │   └── App.tsx
│   │   ├── public/
│   │   │   └── models/
│   │   └── package.json
│   │
│   └── server/
│       ├── src/
│       │   ├── roomManager.ts
│       │   ├── socketHandlers.ts
│       │   ├── gameEngine.ts
│       │   ├── types.ts
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts
│           ├── events.ts
│           └── constants.ts
│
├── package.json
├── README.md
└── THIRD_PARTY_NOTICES.md
```

Shared Socket.IO event types must live inside `packages/shared`.

Do not duplicate network type definitions between client and server.

---

# 6. Development Network Architecture

For the hackathon version:

```text
Laptop A
Game Server
192.168.1.20:3001

Laptop A frontend
localhost:5173 ──┐

Laptop B frontend
localhost:5173 ──┤

Laptop C frontend
localhost:5173 ──┼── Socket.IO ──> 192.168.1.20:3001

Laptop D frontend
localhost:5173 ──┘
```

The frontend should use:

```env
VITE_SERVER_URL=http://192.168.1.20:3001
```

The backend must listen on:

```text
0.0.0.0:3001
```

Example server environment:

```env
PORT=3001
HOST=0.0.0.0
```

Do not implement automatic LAN server discovery in this MVP.

---

# 7. Core Domain Types

Use approximately these shared types:

```ts
type PlayerColor =
  | "red"
  | "blue"
  | "green"
  | "yellow";

type PlayerId = string;
type DeviceId = string;
type RoomCode = string;

interface Player {
  id: PlayerId;
  name: string;
  color: PlayerColor;

  enrolled: boolean;

  // Face embedding only.
  // Never store raw camera image.
  faceEmbedding?: number[];
}

interface DevicePresence {
  deviceId: DeviceId;

  recognizedPlayerId: PlayerId | null;

  confidence: number | null;

  lastSeenAt: number;
}

interface GameState {
  status: "lobby" | "playing" | "finished";

  currentTurnPlayerId: PlayerId | null;

  turnNumber: number;

  demoScore: Record<PlayerId, number>;
}

interface Room {
  code: RoomCode;

  players: Player[];

  gameState: GameState;

  devicePresence: Record<DeviceId, DevicePresence>;

  createdAt: number;
}
```

The server is authoritative for `Room` and `GameState`.

---

# 8. Room Code

Room codes must:

* Be exactly 4 characters.
* Be uppercase.
* Avoid visually confusing characters if convenient.

Recommended alphabet:

```text
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

Examples:

```text
AB12
K7PM
2FX8
```

The server generates room codes.

Room data exists only in server memory.

When the server process terminates, rooms may disappear.

That is acceptable.

---

# 9. Screens

Implement these screens.

## Home Screen

Actions:

```text
CREATE ROOM

Room Code:
[____]

JOIN ROOM
```

Create Room:

```text
POST/socket createRoom
→ server creates room
→ navigate to Lobby
```

Join Room:

```text
enter room code
→ joinRoom
→ navigate to Lobby
```

---

## Lobby Screen

Display:

```text
ROOM AB12

Jack      RED       ✓ Face Ready
Amy       BLUE      ✓ Face Ready
Bob       GREEN     Not Enrolled
Lucy      YELLOW    Not Enrolled
```

Allow a user to enter:

```text
Player Name
Player Color
```

Colors must be unique within the room.

Provide:

```text
ENROLL FACE
```

Host may start only when at least 2 players exist.

Ideally all players should be enrolled before starting.

For the hackathon demo, allow 2–4 players.

---

## Face Enrollment Screen

Display camera preview.

Instructions:

```text
Look directly at the camera.

Collecting face samples...
7 / 10
```

Enrollment flow:

```text
Camera
↓
Face Detection / Landmarks
↓
Face Crop + Alignment
↓
Face Embedding Model
↓
10 embeddings
↓
Average
↓
L2 normalize
↓
Final player embedding
```

Collect approximately 10 valid samples over 2–4 seconds.

Reject samples when:

* zero faces detected
* multiple faces detected
* face too small
* face heavily outside frame
* detection confidence too low

When complete:

```text
FACE ENROLLMENT COMPLETE
```

Send only the final embedding to the server.

Never send camera frames or photos to the server.

---

# 10. Face Recognition Architecture

Create a clean interface:

```ts
interface FaceRecognitionProvider {
  initialize(): Promise<void>;

  enroll(
    video: HTMLVideoElement,
    onProgress?: (progress: number) => void
  ): Promise<number[]>;

  identify(
    video: HTMLVideoElement,
    candidates: FaceCandidate[]
  ): Promise<FaceMatch | null>;

  dispose(): void;
}

interface FaceCandidate {
  playerId: string;
  embedding: number[];
}

interface FaceMatch {
  playerId: string;
  similarity: number;
}
```

Create implementation:

```text
MediaPipeOnnxFaceRecognitionProvider
```

Responsibilities:

MediaPipe:

* face detection
* face landmarks
* face alignment/cropping

ONNX Runtime Web:

* face embedding inference

Do not couple vision logic directly to React components.

React components should call the provider through hooks/services.

---

# 11. Face Embedding Model

Use a lightweight face-recognition embedding model suitable for browser inference, preferably an ArcFace/MobileFaceNet-style ONNX model.

Expected input should ideally be approximately:

```text
112 × 112 RGB face
```

The exact preprocessing must match the chosen model.

Store model locally under:

```text
apps/client/public/models/
```

Do not load the model from an unreliable third-party CDN at runtime.

Document:

* model name
* original source
* license
* expected input
* expected normalization
* output vector dimensions

in:

```text
THIRD_PARTY_NOTICES.md
```

Do not use a model unless its redistribution/use terms are suitable for the hackathon project.

If a usable model cannot be bundled immediately, still implement the `FaceRecognitionProvider` abstraction and a development fallback mode.

Development fallback:

```env
VITE_IDENTITY_DEBUG_MODE=true
```

This mode may provide buttons:

```text
Pretend Jack Detected
Pretend Amy Detected
Pretend Bob Detected
Pretend Lucy Detected
```

This is only for debugging networking and UI.

The final demo should use real recognition.

---

# 12. Similarity Matching

Each embedding should be L2 normalized.

Compare live embedding against all room players using cosine similarity.

Pseudo-code:

```ts
function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }

  return dot;
}
```

If vectors are already L2 normalized, cosine similarity is the dot product.

Pick:

```text
best candidate
second-best candidate
```

A match is valid only if:

```text
bestSimilarity >= MATCH_THRESHOLD
```

and preferably:

```text
bestSimilarity - secondBestSimilarity >= MATCH_MARGIN
```

Make both configurable:

```ts
FACE_MATCH_THRESHOLD
FACE_MATCH_MARGIN
```

Start with reasonable defaults but expose them in a debug panel because the correct threshold depends on the exact embedding model.

Do not bury threshold constants inside component code.

---

# 13. Recognition Frequency

Do not run face embedding inference on every video frame.

Target approximately:

```text
3–5 recognition attempts / second
```

Example:

```text
every 250ms
```

Camera preview may remain 30 FPS.

Face recognition should be throttled separately.

---

# 14. Recognition Stabilization

Recognition must not immediately switch UI based on one prediction.

Maintain a rolling prediction window.

Example:

```text
last 5 predictions
```

Require approximately:

```text
4 / 5 = same player
```

before changing the active identity.

Example:

```text
Jack
Jack
Unknown
Jack
Jack
```

becomes:

```text
ACTIVE PLAYER = Jack
```

Do not switch immediately when one frame becomes:

```text
Amy
```

For losing identity:

If no valid player has been recognized for approximately 1 second:

```text
ACTIVE PLAYER = null
```

All timing values should live in:

```text
vision/config.ts
```

---

# 15. Multiple Faces

For the MVP:

If more than one face is visible:

```text
recognizedPlayer = null
state = ambiguous
```

Display:

```text
MULTIPLE PLAYERS DETECTED
Please stand one at a time.
```

Do not attempt to determine which face is the active player.

This greatly simplifies the MVP.

---

# 16. Local Player Presence

Each laptop gets a persistent-in-session:

```text
deviceId
```

Generate UUID once and store in:

```text
sessionStorage
```

Each client continuously maintains:

```ts
localRecognizedPlayerId
```

When stabilized identity changes:

```text
null → Jack
Jack → Amy
Jack → null
```

send:

```text
presence:update
```

to server.

Do not send presence updates for every camera frame.

---

# 17. Socket.IO Events

Create strongly typed events.

## Client → Server

```ts
"room:create"

"room:join"

"player:add"

"player:enroll"

"game:start"

"game:action"

"presence:update"

"room:leave"
```

Example payloads:

```ts
interface JoinRoomPayload {
  roomCode: string;
  deviceId: string;
}

interface AddPlayerPayload {
  roomCode: string;
  name: string;
  color: PlayerColor;
}

interface EnrollPlayerPayload {
  roomCode: string;
  playerId: string;
  embedding: number[];
}

interface PresenceUpdatePayload {
  roomCode: string;
  deviceId: string;

  playerId: string | null;

  confidence: number | null;

  timestamp: number;
}

interface GameActionPayload {
  roomCode: string;
  deviceId: string;
  type: "DEMO_ACTION";
}
```

## Server → Client

```ts
"room:created"

"room:state"

"room:error"

"player:joined"

"player:updated"

"game:started"

"game:state"

"presence:state"
```

Prefer broadcasting the canonical `room:state` after important mutations instead of making clients reconstruct server state independently.

---

# 18. Server Authority

Clients may request actions.

Clients must not directly mutate game state.

Example:

Laptop C sends:

```text
game:action
deviceId = C
type = DEMO_ACTION
```

Server checks:

```text
Which player was most recently recognized on Device C?
```

Then:

```text
Is that presence fresh?
```

Then:

```text
Is that player == currentTurnPlayer?
```

Only then accept action.

Recommended presence expiration:

```text
2 seconds
```

Pseudo-code:

```ts
const presence = room.devicePresence[deviceId];

if (!presence) reject();

if (
  Date.now() - presence.lastSeenAt >
  PRESENCE_EXPIRATION_MS
) {
  reject();
}

if (
  presence.recognizedPlayerId !==
  room.gameState.currentTurnPlayerId
) {
  reject();
}

acceptAction();
```

This is not intended as production security.

It is sufficient for the hackathon concept.

---

# 19. Demo Game Logic

Do not implement cards yet.

Use the simplest possible turn system.

Game state:

```ts
{
  currentTurnPlayerId,
  turnNumber,
  demoScore
}
```

Game screen contains:

```text
CURRENT TURN

JACK
```

If camera recognizes Jack:

```text
JACK

YOUR TURN

[ ACT ]
```

If camera recognizes Amy while it is Jack's turn:

```text
AMY

WAITING FOR JACK
```

When correct player presses:

```text
ACT
```

Server:

```text
score[player] += 1
turnNumber += 1
currentTurnPlayer = next player
```

All clients update immediately.

This action exists only to prove:

```text
physical player
→ face identification
→ device association
→ server authorization
→ multiplayer state change
```

---

# 20. Game UI Behavior

Every player has a color.

When no player is detected:

```text
background = neutral/dark
```

When Jack is confidently detected:

```text
background/accent → RED
```

When Amy is detected:

```text
background/accent → BLUE
```

etc.

Main game view:

```text
┌────────────────────────────────────┐
│ ROOM AB12                          │
│                                    │
│             JACK                   │
│                                    │
│          PLAYER DETECTED           │
│                                    │
│           YOUR TURN                │
│                                    │
│            [ ACT ]                 │
│                                    │
│ Camera: ✓                          │
│ Network: ✓                         │
└────────────────────────────────────┘
```

Switching players should feel visually obvious.

Add a smooth approximately 200–400ms transition.

---

# 21. Camera UI

During the game, the raw camera preview does not need to dominate the screen.

Recommended:

Small debug preview:

```text
bottom-right corner
```

Allow toggling:

```text
SHOW CAMERA DEBUG
```

Debug overlay should display:

```text
Detected faces: 1

Best match:
Jack

Similarity:
0.71

Second match:
Amy — 0.42

Stable identity:
Jack

Recognition FPS:
4.0

Device ID:
...

Socket:
Connected
```

This debug view is extremely important for the hackathon.

---

# 22. Privacy Rules

Implement these rules:

```text
RAW VIDEO:
never leaves device

FACE IMAGE:
never sent to server

FACE EMBEDDING:
may be sent to game server

FACE EMBEDDING STORAGE:
memory only

ROOM DESTROYED:
embedding destroyed

SERVER RESTART:
embedding destroyed
```

Display short enrollment notice:

```text
Face recognition runs locally on this device.

The game shares only a temporary mathematical
face embedding with other devices in this room.

No camera image is uploaded or stored.
```

This is a hackathon identification feature, not biometric authentication.

Do not market it as secure identity verification.

---

# 23. Disconnection Behavior

Socket.IO reconnection should be enabled.

If client temporarily disconnects:

```text
NETWORK DISCONNECTED
RECONNECTING...
```

Do not crash.

Room state should be requested/restored after reconnect.

Use:

```text
roomCode
deviceId
```

to restore device participation.

For MVP, player data itself can remain in the room even if the device that originally enrolled the player disconnects.

---

# 24. Error States

Handle visibly:

```text
ROOM NOT FOUND

ROOM FULL

COLOR ALREADY TAKEN

CAMERA PERMISSION DENIED

CAMERA NOT AVAILABLE

FACE MODEL FAILED TO LOAD

NO FACE DETECTED

MULTIPLE FACES DETECTED

FACE ENROLLMENT FAILED

SOCKET DISCONNECTED

SERVER UNAVAILABLE
```

Never fail silently.

---

# 25. State Management

Use Zustand on client.

Suggested stores:

```text
roomStore
connectionStore
visionStore
```

`roomStore`:

* room
* current game state
* players

`connectionStore`:

* socket state
* room code
* deviceId

`visionStore`:

* camera state
* detected player
* confidence
* recognition state
* debug metrics

Do not store MediaStream itself inside global state unless necessary.

---

# 26. Vision State Machine

Implement explicit states:

```ts
type VisionState =
  | "idle"
  | "loading"
  | "camera-ready"
  | "enrolling"
  | "recognizing"
  | "recognized"
  | "unknown"
  | "ambiguous"
  | "error";
```

Avoid many unrelated booleans such as:

```text
isCameraReady
isRecognizing
hasError
isUnknown
...
```

where possible.

---

# 27. Performance

MVP target:

```text
Socket action latency:
visually instantaneous on LAN

Recognition:
3–5 inference attempts/sec

Identity transition:
approximately 0.5–1 sec

Identity clearing:
approximately 1 sec

UI:
60 FPS where possible
```

If vision inference blocks React rendering, move inference into a Web Worker if reasonably achievable.

Do not add a worker prematurely if main-thread inference is already smooth.

Prioritize working demo over premature optimization.

---

# 28. ONNX Execution Provider

Start with the most compatible implementation.

Prefer:

```text
WASM fallback
```

Optionally use:

```text
WebGPU
```

when supported.

The app must not require WebGPU to function.

Architecture should allow:

```ts
["webgpu", "wasm"]
```

style fallback behavior where practical.

---

# 29. Browser Target

Optimize for:

```text
latest desktop Chrome / Edge
```

Do not spend hackathon time on Safari or Firefox compatibility.

Every laptop should launch the frontend from:

```text
http://localhost:5173
```

The frontend connects over LAN to the Socket.IO server.

---

# 30. Testing Strategy

Implement basic unit tests for:

```text
cosineSimilarity()

normalizeEmbedding()

selectBestFaceMatch()

prediction stabilization

room code generation

turn rotation

server game-action authorization
```

Do not spend excessive time on UI snapshot tests.

Manual integration testing is more important.

---

# 31. Manual Integration Test

Before declaring MVP complete, perform:

```text
TEST 1
Create room

TEST 2
Join from second laptop

TEST 3
Join from four laptops

TEST 4
Add four uniquely-colored players

TEST 5
Enroll player face

TEST 6
Verify embedding arrives on all clients

TEST 7
Recognize Jack on Laptop A

TEST 8
Walk Jack to Laptop C

TEST 9
Confirm Laptop A clears Jack

TEST 10
Confirm Laptop C becomes Jack / red

TEST 11
Set current turn = Jack

TEST 12
Press ACT on Laptop C

TEST 13
Verify all four laptops advance turn

TEST 14
Put wrong player in front of Laptop C

TEST 15
Verify ACT cannot trigger Jack's turn
```

---

# 32. Implementation Order

Implement strictly in this order.

### Phase 1 — Multiplayer Skeleton

Build:

```text
React frontend
Node server
Socket.IO connection
Create Room
Join Room
Room state broadcast
```

Verify with multiple browser windows first.

---

### Phase 2 — Player System

Implement:

```text
player name
unique color
player list
start game
turn rotation
ACT button
```

No camera yet.

Use manual player selection temporarily.

---

### Phase 3 — Multi-Laptop LAN

Run server on:

```text
0.0.0.0:3001
```

Connect two real laptops.

Then four laptops.

Do not begin face recognition until this works.

---

### Phase 4 — Camera

Implement:

```text
getUserMedia()
camera preview
permission/error handling
```

Run locally on each computer.

---

### Phase 5 — Face Detection

Add MediaPipe.

Show:

```text
0 face
1 face
multiple faces
```

Do not add recognition until detection is stable.

---

### Phase 6 — Enrollment + Embeddings

Implement:

```text
face crop
alignment
ONNX inference
embedding normalization
10-sample averaging
server synchronization
```

---

### Phase 7 — Recognition

Implement:

```text
live embedding
cosine similarity
threshold
margin
stabilization
```

Display stable player identity.

---

### Phase 8 — Roaming Identity

Connect recognition to:

```text
presence:update
```

Server associates:

```text
device ↔ currently recognized player
```

Verify Jack can move between laptops.

---

### Phase 9 — Gameplay Authorization

Connect:

```text
face identification
+
device presence
+
current turn
```

Only current recognized player may press ACT.

---

### Phase 10 — Polish

Only after everything works:

```text
animations
color transitions
sound
debug panel
connection status
better lobby
```

---

# 33. README Requirements

README must explain exact setup.

Example:

```bash
npm install
```

Server:

```bash
npm run dev:server
```

Client:

```bash
npm run dev:client
```

Show how to find server LAN IP.

Example:

```text
Server laptop:
192.168.1.20
```

Then explain every laptop needs:

```env
VITE_SERVER_URL=http://192.168.1.20:3001
```

Also explain:

```text
Each laptop runs frontend locally.
Only one laptop needs to run the game server.
All laptops must be on the same Wi-Fi/LAN.
```

Include troubleshooting for:

```text
firewall
wrong server IP
camera permissions
model loading
Socket.IO connection failure
```

---

# 34. Code Quality Requirements

Use TypeScript strict mode.

Avoid `any`.

Separate:

```text
UI
networking
vision
game logic
```

Do not place the entire application inside `App.tsx`.

Do not put Socket.IO event handlers directly throughout random React components.

Do not place computer vision inference directly in component render logic.

Use services/hooks/modules.

All tunable recognition parameters should be centralized.

---

# 35. Definition of Done

The MVP is DONE only when all of these work on real hardware:

```text
✓ 4 laptops on same LAN

✓ one game server

✓ room creation

✓ room-code joining

✓ synchronized player list

✓ unique player colors

✓ camera access on all laptops

✓ player face enrollment

✓ embeddings synchronized between devices

✓ no raw images uploaded

✓ face identification on every laptop

✓ stable identity smoothing

✓ UI changes to identified player's color

✓ player can walk from one laptop to another

✓ new laptop correctly identifies player

✓ old laptop clears player

✓ server tracks device/player presence

✓ current-turn player can act from current laptop

✓ wrong player cannot trigger another player's turn

✓ action synchronizes across all laptops

✓ disconnect does not crash app

✓ README allows another developer to reproduce setup
```

---

# 36. Priority Rule

If time becomes limited, prioritize in this exact order:

```text
1. LAN multiplayer
2. Room joining
3. Player/color synchronization
4. Camera
5. Face enrollment
6. Face recognition
7. Roaming between devices
8. Turn authorization
9. UI polish
```

Do not sacrifice the roaming-player demo in order to implement additional game mechanics.

The primary technical demo is:

```text
PLAYER JACK
      ↓
walks away from Laptop A
      ↓
Laptop A becomes neutral
      ↓
walks to Laptop C
      ↓
Laptop C identifies JACK
      ↓
Laptop C becomes RED
      ↓
server recognizes Jack is at Laptop C
      ↓
Jack takes his turn there
      ↓
all laptops synchronize
```

That behavior is the MVP.
