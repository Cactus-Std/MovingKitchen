# Roaming Player

A local-network multiplayer proof of concept where a player's temporary face identity follows them between laptops. It includes room-code multiplayer, browser-local face enrollment and recognition, roaming presence, and server-authorized turn actions.

This is a hackathon identification feature, not secure biometric authentication.

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer
- A camera and a recent Chromium, Firefox, or Safari browser
- Two or more laptops on one LAN for the roaming demo

## Install

```bash
npm install
```

Installation also copies MediaPipe and ONNX Runtime WASM files into generated, gitignored public directories. The detection and recognition model files are already bundled. Check the recognition model independently with:

```bash
npm run model:check
```

## Hosted deployment on Render

The shared test deployment is available at:

- **Backend health:** [https://multiplayer-identification.onrender.com/health](https://multiplayer-identification.onrender.com/health) — currently returns HTTP 200 with the Express health response.
- **Frontend application:** [https://multiplayer-identification-frontend.onrender.com/](https://multiplayer-identification-frontend.onrender.com/) — the current browser entry point.
- **Frontend health URL:** [https://multiplayer-identification-frontend.onrender.com/health](https://multiplayer-identification-frontend.onrender.com/health) — reserved/provided health path; at the time of writing, the Render static site returns HTTP 404 here, so use the frontend root URL for availability checks until a dedicated static health endpoint is deployed.

The hosted deployment is convenient for shared testing. The local and LAN workflows below remain supported and are still the recommended way to test multiple laptops with predictable camera permissions and a locally controlled game server.

## Run locally

Start the server in one terminal:

```bash
npm run dev:server
```

Start the client in a second terminal:

```bash
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173), create a room, add players, and enroll each face. Join the displayed code from the other laptops before starting. The server health endpoint is [http://localhost:3001/health](http://localhost:3001/health).

You can also run the client, server, and shared-package watcher together:

```bash
npm run dev
```

## Run across a LAN

Only one laptop runs the game server. Every laptop runs its own frontend locally so the page has a secure `localhost` camera context. All laptops must be connected to the same Wi-Fi or LAN.

1. Find the server laptop's LAN IP. On macOS, try `ipconfig getifaddr en0`; on Windows, run `ipconfig` and look for the Wi-Fi IPv4 address.
2. Clone this repository and run `npm install` on each laptop.
3. Copy the tracked example on every laptop:

   ```bash
   cp apps/client/.env.example apps/client/.env.local
   ```

   Windows PowerShell equivalent: `Copy-Item apps/client/.env.example apps/client/.env.local`.

4. Set the server URL using the real LAN IP, for example:

   ```env
   VITE_SERVER_URL=http://192.168.1.20:3001
   ```

5. Run `npm run dev:server` on the server laptop and `npm run dev:client` on every laptop, including the server laptop if it will show the game.
6. Open `http://localhost:5173` on each machine. Create one room, join the same code everywhere, enroll players once, and start the game from the host laptop.

The backend listens on `0.0.0.0:3001` by default. Override it with `HOST` and `PORT` if needed.

### Connected, but `ROOM NOT FOUND`

If the UI says the server is connected but a friend's room cannot be found, the client is usually connected to the wrong server. Without `apps/client/.env.local`, the frontend falls back to `http://localhost:3001`. If both laptops run `npm run dev`, each may have its own in-memory server, so a room created on one laptop does not exist on the other.

1. On the host laptop, find its LAN IP and keep the server running:

   ```bash
   ipconfig getifaddr en0
   npm run dev:server
   ```

2. From the joining laptop, verify that the host server is reachable:

   ```bash
   curl http://192.168.1.20:3001/health
   ```

3. On the joining laptop, set `apps/client/.env.local` to the host laptop's real IP:

   ```env
   VITE_SERVER_URL=http://192.168.1.20:3001
   VITE_IDENTITY_DEBUG_MODE=false
   ```

4. Fully stop and restart Vite with `npm run dev:client`; refreshing the browser does not reload Vite environment variables.

If the health check fails, check the host firewall, port `3001`, the LAN IP, and whether the Wi-Fi isolates clients. If the health check succeeds but the room is still missing, make sure the host server was not restarted after room creation—rooms are stored only in that server process's memory.

## Identity behavior

- MediaPipe detects a single usable face at about four attempts per second. Enrollment keeps a 20%-of-frame quality gate, while recognition accepts faces down to roughly 8% of the video width.
- FaceX produces a normalized 512-value embedding in the browser.
- Enrollment averages ten local samples and sends only the resulting embedding to the in-memory room.
- Initial recognition requires four matching predictions in a five-item rolling window. Once locked, missed detections do not clear the player; switching requires five consecutive accepted matches for another enrolled player.
- A device sends presence when the locked identity changes and then roughly once per second while locked. Presence is stale after two seconds if the heartbeat itself stops.
- The server accepts `ACT` only when the sending device has fresh presence for the current-turn player.

Open **Camera Debug** during a game to see face count, similarities, locked identity, recognition rate, and adjustable threshold/margin controls.

For a camera-free demo, set this in `apps/client/.env.local` and restart Vite:

```env
VITE_IDENTITY_DEBUG_MODE=true
```

Manual identity buttons also appear automatically if nobody has been enrolled.

## Privacy

Camera frames and face crops never leave the browser and are never stored. Only a temporary mathematical embedding is shared with devices in the room. Rooms and embeddings live in server memory only and disappear when the server restarts.

## Checks

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run model:check
```

## Troubleshooting

- **Server unavailable / Socket.IO failure:** verify `VITE_SERVER_URL`, confirm the health endpoint opens from another laptop, and allow inbound TCP traffic on port 3001 through the server laptop's firewall.
- **Wrong server IP:** LAN addresses can change after reconnecting to Wi-Fi. Re-check the server laptop's IPv4 address and restart Vite after editing `.env.local`.
- **Room not found after restart:** rooms and all future face embeddings live only in server memory; restarting the server intentionally clears them.
- **Camera permission denied:** open the frontend as `http://localhost:5173`, allow camera access for localhost, close other camera-heavy applications, and reload.
- **No face / multiple faces:** enrollment still needs one well-lit, centered face occupying about 20% of the video width. During gameplay, recognition accepts a centered face down to roughly 8%; very small, blurred, backlit, or heavily angled faces can still exceed the model's practical limit. Only one face is processed at a time.
- **Model loading failure:** run `npm install` again to regenerate local WASM assets, then run `npm run model:check`. Check that `/models`, `/mediapipe`, and `/onnxruntime` are served by Vite. A production deployment must publish both the regular and JSEP ONNX Runtime files; in particular, verify that `/onnxruntime/ort-wasm-simd-threaded.jsep.mjs` and its matching `.wasm` file return HTTP 200 rather than 404.
- **Recognition is too strict or loose:** open Camera Debug and tune match threshold and second-best margin for the room, lighting, and camera.
- **Action rejected:** confirm the detected identity is the current-turn player and that the socket is connected. Presence intentionally expires after two seconds.

Third-party runtime and model provenance is recorded in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

For the full Chinese/English-jargon architecture rationale, face-enrollment walkthrough, implementation notes, known limitations, and production-integration checklist, see [TECHNICAL_HANDOFF.zh-CN.md](./TECHNICAL_HANDOFF.zh-CN.md).
