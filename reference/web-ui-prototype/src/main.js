import * as THREE from "three";
import "./style.css";

const STATIONS = [
  ["sink", "Storage + Sink"],
  ["board1", "Cutting Board 1"],
  ["board2", "Cutting Board 2"],
  ["oven", "Oven + Serving"]
];

const FOOD = {
  tomato: { label: "Tomato", emoji: "🍅", washable: true },
  sausage: { label: "Sausage", emoji: "🌭" },
  cheese: { label: "Cheese", emoji: "🧀" },
  dough: { label: "Pizza Dough", emoji: "🫓" }
};

const TOOLS = {
  rag: { label: "Cleaning Cloth", image: "/assets/tools/rag.png" },
  knife: { label: "Knife", image: "/assets/tools/knife.png" },
  whisk: { label: "Whisk", image: "/assets/tools/whisk.png" },
  ovenMitt: { label: "Oven Mitt", image: "/assets/tools/oven-mitt.png" },
  pizzaCutter: { label: "Pizza Cutter", image: "/assets/tools/pizza-cutter.png" },
  plate: { label: "Plate", image: "/assets/tools/dark-plate.png" }
};

const initialState = {
  station: "sink",
  playerId: "mouse-player",
  carried: null,
  carriedTool: null,
  waste: { total: 0, tomato: 0, sausage: 0, cheese: 0, dough: 0 },
  water: 100,
  waterOn: false,
  sinkItem: null,
  board1: null,
  board2: null,
  ovenSlots: { tomato: false, sausage: false, cheese: false, dough: false },
  finished: false
};

const saved = JSON.parse(localStorage.getItem("kitchen-prototype") || "null");
const requestedStation = location.hash.slice(1) || "home";
const state = Object.assign({}, initialState, saved || {}, { station: requestedStation === "storage" ? "sink" : requestedStation });
state.waste = Object.assign({}, initialState.waste, saved?.waste || {});
const channel = new BroadcastChannel("kitchen-prototype");

const lobby = {
  roomCode: new URLSearchParams(location.search).get("room")?.toUpperCase() || "ABXY",
  players: [],
  selectedPlayerId: null,
  editingPlayerId: null,
  cameraReady: false,
  scanning: false,
  stream: null
};
const PLAYER_COLORS = ["red", "blue", "green", "yellow"];

function save() {
  localStorage.setItem("kitchen-prototype", JSON.stringify(state));
  channel.postMessage(state);
}

channel.onmessage = ({ data }) => {
  Object.assign(state, data, { station: state.station });
  render();
};

const app = document.querySelector("#app");
let mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let hoverTimer = null;
let hoverStart = 0;
let hoverTarget = null;
let washController = null;

window.addEventListener("mousemove", e => {
  mouse = { x: e.clientX, y: e.clientY };
  const hand = document.querySelector(".hand");
  if (hand) { hand.style.left = `${mouse.x}px`; hand.style.top = `${mouse.y}px`; }
  const ring = document.querySelector(".hover-ring");
  if (ring && ring.style.display === "block") { ring.style.left = `${mouse.x}px`; ring.style.top = `${mouse.y}px`; }
});

function toast(text) {
  const el = document.querySelector(".toast");
  if (!el) return;
  el.textContent = text; el.classList.add("show");
  clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 1300);
}

function startHover(el, callback, ms = 800) {
  cancelHover();
  hoverTarget = el;
  hoverStart = performance.now();
  const ring = document.querySelector(".hover-ring");
  if (!ring) return;
  ring.style.display = "block";
  const tick = now => {
    if (hoverTarget !== el) return;
    const p = Math.min(100, ((now - hoverStart) / ms) * 100);
    ring.style.setProperty("--p", `${p}%`);
    if (p >= 100) { cancelHover(); callback(); return; }
    hoverTimer = requestAnimationFrame(tick);
  };
  hoverTimer = requestAnimationFrame(tick);
}

function cancelHover() {
  if (hoverTimer) cancelAnimationFrame(hoverTimer);
  hoverTimer = null; hoverTarget = null;
  const ring = document.querySelector(".hover-ring");
  if (ring) { ring.style.display = "none"; ring.style.setProperty("--p", "0%"); }
}

function hoverable(selector, callback, ms = 800) {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener("mouseenter", () => startHover(el, () => callback(el), ms));
    el.addEventListener("mouseleave", cancelHover);
  });
}

function navigate(station) {
  washController?.destroy(); washController = null;
  stopLobbyCamera();
  state.station = station; location.hash = station; save(); render();
}

function stopLobbyCamera() {
  lobby.stream?.getTracks().forEach(track => track.stop());
  lobby.stream = null;
  lobby.cameraReady = false;
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function renderHome() {
  app.innerHTML = `<main class="home-screen">
    <form class="room-entry-form">
      <label class="sr-only" for="room-code-input">Room code</label>
      <input id="room-code-input" maxlength="4" autocomplete="off" spellcheck="false" placeholder="OPTIONAL" value="">
      <button class="room-entry-button" type="submit">CREATE GAME</button>
    </form>
  </main>`;
  const form = document.querySelector(".room-entry-form");
  const input = document.querySelector("#room-code-input");
  const button = document.querySelector(".room-entry-button");
  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    button.textContent = input.value ? "JOIN GAME" : "CREATE GAME";
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    lobby.roomCode = input.value.trim() || generateRoomCode();
    lobby.players = [];
    lobby.selectedPlayerId = null;
    lobby.editingPlayerId = null;
    navigate("join");
  });
  input.focus();
}

function renderJoinRoom() {
  const selected = lobby.players.find(player => player.id === lobby.selectedPlayerId);
  const allReady = lobby.players.length > 0 && lobby.players.every(player => player.enrolled);
  app.innerHTML = `<main class="join-room-screen">
    <section class="face-enrollment">
      <video class="join-camera" autoplay muted playsinline></video>
      <div class="face-oval"></div>
      <div class="camera-message">${lobby.cameraReady ? selected ? `Ready to scan ${selected.name}` : "Select a player" : "Starting camera…"}</div>
    </section>
    <button class="join-action scan-face-button" ${!selected || !lobby.cameraReady || lobby.scanning ? "disabled" : ""}>${lobby.scanning ? "SCANNING…" : selected?.enrolled ? "SCAN AGAIN" : "SCAN FACE"}</button>
    <section class="room-panel">
      <h1>ROOM <span>${lobby.roomCode}</span></h1>
      <p class="room-count">${lobby.players.length} / 4 PLAYERS</p>
      <div class="join-player-list">
        ${lobby.players.map((player, index) => `<button class="join-player ${player.id === lobby.selectedPlayerId ? "selected" : ""}" data-player-id="${player.id}" style="--player-color:var(--player-${player.color})">
          <span class="player-color-dot"></span><span class="player-copy">${lobby.editingPlayerId === player.id ? `<input class="player-name-editor" data-name-editor="${player.id}" maxlength="24" value="${player.name.replaceAll('"', '&quot;')}">` : `<b>${player.name}</b>`}<small>${player.enrolled ? "FACE READY ✓" : "FACE NOT SCANNED"}</small></span><span class="player-index">P${index + 1}</span>
        </button>`).join("")}
        ${lobby.players.length < 4 ? `<button class="add-player-card">＋ ADD PLAYER</button>` : ""}
      </div>
    </section>
    <button class="join-action start-game-button" ${!allReady ? "disabled" : ""}>START GAME</button>
    <div class="join-toast"></div>
  </main>`;

  document.querySelectorAll("[data-player-id]").forEach(button => {
    button.onclick = event => {
      if (event.target.closest(".player-name-editor")) return;
      lobby.selectedPlayerId = button.dataset.playerId; renderJoinRoom(); attachLobbyCamera();
    };
    button.ondblclick = event => {
      event.preventDefault();
      const player = lobby.players.find(candidate => candidate.id === button.dataset.playerId);
      if (!player) return;
      lobby.selectedPlayerId = player.id;
      lobby.editingPlayerId = player.id;
      renderJoinRoom(); attachLobbyCamera();
      const editor = document.querySelector(`[data-name-editor="${player.id}"]`);
      editor?.focus(); editor?.select();
    };
  });
  document.querySelectorAll("[data-name-editor]").forEach(editor => {
    const commit = () => {
      const player = lobby.players.find(candidate => candidate.id === editor.dataset.nameEditor);
      const nextName = editor.value.trim().slice(0, 24);
      if (player && nextName) player.name = nextName;
      lobby.editingPlayerId = null;
      renderJoinRoom(); attachLobbyCamera();
    };
    editor.onclick = event => event.stopPropagation();
    editor.ondblclick = event => event.stopPropagation();
    editor.onblur = commit;
    editor.onkeydown = event => {
      if (event.key === "Enter") editor.blur();
      if (event.key === "Escape") {
        lobby.editingPlayerId = null;
        renderJoinRoom(); attachLobbyCamera();
      }
    };
  });
  document.querySelector(".add-player-card")?.addEventListener("click", addLobbyPlayer);
  document.querySelector(".scan-face-button")?.addEventListener("click", scanSelectedFace);
  document.querySelector(".start-game-button")?.addEventListener("click", () => navigate("sink"));
  startLobbyCamera();
}

function addLobbyPlayer() {
  if (lobby.players.length >= 4) return;
  const index = lobby.players.length;
  const player = { id: `player-${Date.now()}`, name: `PLAYER ${index + 1}`, color: PLAYER_COLORS[index], enrolled: false, faceEmbedding: null };
  lobby.players.push(player);
  lobby.selectedPlayerId = player.id;
  renderJoinRoom();
}

function attachLobbyCamera() {
  const video = document.querySelector(".join-camera");
  if (video && lobby.stream) video.srcObject = lobby.stream;
}

async function startLobbyCamera() {
  if (lobby.stream) return attachLobbyCamera();
  try {
    lobby.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    lobby.cameraReady = true;
    attachLobbyCamera();
    const button = document.querySelector(".scan-face-button");
    if (button && lobby.selectedPlayerId) button.disabled = false;
    const message = document.querySelector(".camera-message");
    if (message) message.textContent = lobby.selectedPlayerId ? `Ready to scan ${lobby.players.find(p => p.id === lobby.selectedPlayerId)?.name}` : "Select a player";
  } catch {
    const message = document.querySelector(".camera-message");
    if (message) message.textContent = "CAMERA UNAVAILABLE";
  }
}

function scanSelectedFace() {
  const player = lobby.players.find(candidate => candidate.id === lobby.selectedPlayerId);
  if (!player || !lobby.cameraReady || lobby.scanning) return;
  lobby.scanning = true;
  renderJoinRoom(); attachLobbyCamera();
  // UI hook for MediaPipeOnnxFaceRecognitionProvider.enroll(video, onProgress).
  setTimeout(() => {
    player.enrolled = true;
    player.faceEmbedding = "pending-websocket-integration";
    lobby.scanning = false;
    renderJoinRoom(); attachLobbyCamera();
  }, 1400);
}

function take(type) {
  if (state.carried || state.carriedTool) return toast("Your hand is already full");
  state.carried = { type, state: type === "tomato" ? "dirty" : "raw", cleanliness: 0, cut: 0 };
  save(); render(); toast(`Picked up ${FOOD[type].label}`);
}

function takeOrReturnTool(type) {
  if (state.carried) return toast("Put down the ingredient first");
  if (state.carriedTool) {
    state.carriedTool = null;
    save(); render(); toast("Tool returned");
    return;
  }
  state.carriedTool = type;
  save(); render(); toast(`Picked up ${TOOLS[type].label}`);
}

function handHtml() {
  const item = state.carried;
  const tool = state.carriedTool ? TOOLS[state.carriedTool] : null;
  return `<div class="hand" style="left:${mouse.x}px;top:${mouse.y}px">${tool ? `<img class="held-tool" src="${tool.image}" alt="${tool.label}">` : item ? FOOD[item.type].emoji : "🖐️"}${item ? `<span class="carried-label">${FOOD[item.type].label} · ${item.state}</span>` : tool ? `<span class="carried-label">${tool.label}</span>` : ""}</div>`;
}

function shell(content, subtitle) {
  return `<div class="app">
    <header class="topbar"><div class="brand">🍕 Cross-Screen Kitchen</div><nav class="stations">
      ${STATIONS.map(([id, label]) => `<button class="station-tab ${state.station === id ? "active" : ""}" data-station="${id}">${label}</button>`).join("")}
    </nav><div class="status">Holding: ${state.carried ? FOOD[state.carried.type].label : state.carriedTool ? TOOLS[state.carriedTool].label : "Nothing"}<small>Waste: ${state.waste.total}</small></div></header>
    <main class="stage stage-${state.station} ${state.waterOn ? "water-on" : ""}">${content}</main>
    <footer class="footer"><span>The mouse is your virtual hand · Hold to complete the green ring</span><button id="reset">Reset Demo</button></footer>
    <div class="hover-ring"></div>${handHtml()}<div class="toast"></div>
  </div>`;
}

function shelfFoodsMarkup() {
  return `<div class="shelf-foods">${Object.entries(FOOD).map(([type, f]) => `<div class="food-card" data-food="${type}"><div class="emoji">${f.emoji}</div><div class="label">${f.label}</div></div>`).join("")}</div>`;
}

function toolMarkup(type, className) {
  const tool = TOOLS[type];
  const hidden = state.carriedTool === type ? "held" : "";
  return `<div class="tool-home ${className} ${hidden}" data-tool="${type}" title="${tool.label}"><img src="${tool.image}" alt="${tool.label}"></div>`;
}

function boardToolsMarkup() {
  return `<div class="trash-zone" title="Discard ingredient"></div>${toolMarkup("rag", "tool-rag")}${toolMarkup("knife", "tool-knife")}${toolMarkup("whisk", "tool-whisk")}`;
}

function boardMarkup(which) {
  const item = state[which];
  const label = item ? `${FOOD[item.type].emoji} ${FOOD[item.type].label} · ${item.state}` : "Place ingredient here";
  return `<div class="board ${which === "board2" ? "center" : ""}"><div class="drop-zone ${state.carried ? "ready" : ""}" data-drop="${which}">${label}</div>${item ? `<div class="progress"><div style="width:${item.cut || 0}%"></div></div>` : ""}</div>`;
}

function sinkScene() {
  return shell(`${shelfFoodsMarkup()}<div class="sink"><div class="faucet-hotspot ${state.waterOn ? "on" : ""}" title="Hold here to toggle water"></div><div class="water-stream ${state.waterOn ? "on" : ""}"></div><div class="wash-viewport ${state.carried?.type === "tomato" ? "ready" : ""}" id="wash3d"></div><div class="wash-help">${state.sinkItem ? "Drag the tomato to rinse every side" : "Move the tomato into the sink and complete the green ring"}</div></div><div class="water-meter"><b class="water-value">Water ${Math.round(state.water)}%</b><div class="meter-track"><div class="meter-fill" style="width:${state.water}%"></div></div></div>`, "Pick up ingredients on the left; hold over the faucet or sink to interact");
}

function board1Scene() {
  return shell(`${boardToolsMarkup()}${boardMarkup("board1")}`, "Cutting Board 1");
}

function board2Scene() {
  return shell(`${boardToolsMarkup()}${boardMarkup("board2")}`, "Cutting Board 2");
}

function ovenScene() {
  const all = Object.values(state.ovenSlots).every(Boolean);
  return shell(`${toolMarkup("ovenMitt", "tool-oven-mitt")}${toolMarkup("pizzaCutter", "tool-pizza-cutter")}<div class="oven-drop-zone ${state.carried ? "ready" : ""}"></div>${all ? `<div class="oven-status">${state.finished ? "🎉 Pizza Complete" : "All ingredients ready · Hold over the oven to bake"}</div>` : ""}`, "Put prepared ingredients directly into the oven");
}

function render() {
  washController?.destroy(); washController = null;
  if (state.station === "home") { renderHome(); return; }
  if (state.station === "join") { renderJoinRoom(); return; }
  const scene = state.station === "sink" ? sinkScene() : state.station === "board1" ? board1Scene() : state.station === "board2" ? board2Scene() : ovenScene();
  app.innerHTML = scene;
  document.querySelectorAll("[data-station]").forEach(b => b.onclick = () => navigate(b.dataset.station));
  document.querySelector("#reset").onclick = () => { Object.assign(state, structuredClone(initialState), { station: state.station }); save(); render(); };
  bindScene();
}

function placeOnBoard(which) {
  if (!state.carried) return;
  if (state[which]) return toast("This cutting board is in use");
  if (state.carried.type === "tomato" && state.carried.state !== "clean") return toast("Wash the tomato first");
  state[which] = state.carried; state.carried = null; save(); render();
}

function bindBoard(which) {
  const board = document.querySelector(`[data-drop="${which}"]`);
  if (!board) return;

  hoverable(".trash-zone", () => {
    if (state.carried) {
      const type = state.carried.type;
      state.waste.total += 1;
      state.waste[type] += 1;
      state.carried = null;
      save(); render();
      toast(`${FOOD[type].label} discarded · Waste ${state.waste.total}`);
    } else if (state.carriedTool) {
      toast("Tools cannot be discarded");
    }
  }, 500);

  board.addEventListener("mouseenter", () => {
    if (state.carried) {
      startHover(board, () => placeOnBoard(which), 450);
      return;
    }
    if (state[which]?.state === "chopped") {
      if (state.carriedTool) {
        startHover(board, () => toast("Return the tool before picking up food"), 450);
        return;
      }
      startHover(board, () => {
        state.carried = state[which];
        state[which] = null;
        save(); render();
        toast(`Picked up chopped ${FOOD[state.carried.type].label}`);
      }, 450);
    }
  });
  board.addEventListener("mouseleave", cancelHover);

  if (!state[which] || state.carriedTool !== "knife") return;
  let cutting = false;
  let lastY = null;
  let direction = 0;

  board.addEventListener("mouseenter", () => {
    cutting = true;
    lastY = mouse.y;
    toast("Move up and down over the board to cut");
  });
  board.addEventListener("mouseleave", () => { cutting = false; lastY = null; });

  window.onmousemove = e => {
    if (!cutting || lastY === null || !state[which]) return;
    const d = e.clientY - lastY;
    if (Math.abs(d) > 22 && Math.sign(d) !== direction) {
      direction = Math.sign(d); lastY = e.clientY;
      state[which].cut = Math.min(100, (state[which].cut || 0) + 20);
      const bar = document.querySelector(".progress > div");
      if (bar) bar.style.width = `${state[which].cut}%`;
      save();
      if (state[which].cut >= 100) {
        state[which].state = "chopped";
        cutting = false;
        save();
        toast("Chopping complete");
        setTimeout(render, 350);
      }
    }
  };
}

function bindScene() {
  hoverable("[data-tool]", el => takeOrReturnTool(el.dataset.tool), 550);
  if (state.station === "sink") {
    hoverable("[data-food]", el => take(el.dataset.food));
    hoverable(".faucet-hotspot", () => {
      if (state.water <= 0) return toast("The water has run out");
      state.waterOn = !state.waterOn; save(); render();
    }, 650);
    const sinkZone = document.querySelector("#wash3d");
    hoverable("#wash3d", () => {
      if (!state.sinkItem && state.carried?.type === "tomato") { state.sinkItem = state.carried; state.carried = null; save(); render(); }
      else if (state.sinkItem?.state === "clean" && !state.carried) { state.carried = state.sinkItem; state.sinkItem = null; save(); render(); }
      else if (state.carried && state.carried.type !== "tomato") toast("Only tomatoes need washing for now");
    }, 500);
    if (state.sinkItem) washController = createTomatoWash(document.querySelector("#wash3d"));
  }
  if (state.station === "board1") bindBoard("board1");
  if (state.station === "board2") bindBoard("board2");
  if (state.station === "oven") {
    hoverable(".oven-drop-zone", () => {
      if (!state.carried) return;
      const type = state.carried.type;
      if ((type === "tomato" || type === "sausage") && state.carried.state !== "chopped") return toast("Chop it first");
      if (state.ovenSlots[type]) return toast(`${FOOD[type].label} is already in the oven`);
      state.ovenSlots[type] = true; state.carried = null; save(); render();
    }, 450);
    if (Object.values(state.ovenSlots).every(Boolean) && !state.finished) hoverable(".oven-drop-zone", () => { state.finished = true; save(); render(); }, 1000);
  }
}

function createTomatoWash(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.z = 5;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(3, 4, 5); scene.add(light);

  const tomato = new THREE.Group();
  tomato.position.x = -0.58;
  scene.add(tomato);
  const fruit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 24), new THREE.MeshStandardMaterial({ color: 0xd93632, roughness: .65 }));
  fruit.scale.y = .92; tomato.add(fruit);
  const stem = new THREE.Mesh(new THREE.ConeGeometry(.42, .25, 6), new THREE.MeshStandardMaterial({ color: 0x3d8e45 }));
  stem.position.y = 1.08; stem.rotation.z = Math.PI; tomato.add(stem);

  const dirt = [];
  const savedDirt = state.sinkItem.dirtValues;
  for (let i = 0; i < 24; i++) {
    const phi = Math.acos(1 - 2 * (i + .5) / 24);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const normal = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).normalize();
    const spot = new THREE.Mesh(new THREE.CircleGeometry(.16 + (i % 3) * .025, 10), new THREE.MeshBasicMaterial({ color: 0x62584b, transparent: true, opacity: savedDirt?.[i] ?? 1, depthWrite: false, side: THREE.DoubleSide }));
    spot.position.copy(normal).multiplyScalar(1.16); spot.lookAt(normal.clone().multiplyScalar(2.3)); tomato.add(spot);
    dirt.push({ mesh: spot, normal, amount: savedDirt?.[i] ?? 1 });
  }

  let dragging = false, px = 0, py = 0, dead = false;
  renderer.domElement.onmousedown = e => { dragging = true; px = e.clientX; py = e.clientY; };
  window.addEventListener("mouseup", () => dragging = false);
  renderer.domElement.onmousemove = e => {
    if (!dragging) return;
    tomato.rotation.y += (e.clientX - px) * .012;
    tomato.rotation.x += (e.clientY - py) * .012;
    px = e.clientX; py = e.clientY;
  };

  let last = performance.now(), syncAt = 0;
  function frame(now) {
    if (dead) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (state.waterOn && state.water > 0) {
      const rect = renderer.domElement.getBoundingClientRect();
      // 标注图中的水流约占水池交互框横向的 36%–47%。
      const waterLeft = rect.width * .36, waterRight = rect.width * .47;
      const cameraDir = new THREE.Vector3(0, 0, 1);
      for (const s of dirt) {
        if (s.amount <= 0) continue;
        const worldNormal = s.normal.clone().applyQuaternion(tomato.quaternion);
        const worldPos = s.mesh.getWorldPosition(new THREE.Vector3()).project(camera);
        const sx = (worldPos.x + 1) * rect.width / 2;
        const visible = worldNormal.dot(cameraDir) > .15;
        if (visible && sx >= waterLeft && sx <= waterRight) {
          s.amount = Math.max(0, s.amount - dt * .75);
          s.mesh.material.opacity = s.amount;
        }
      }
      const remaining = dirt.reduce((n, s) => n + s.amount, 0) / dirt.length;
      state.sinkItem.cleanliness = Math.round((1 - remaining) * 100);
      state.sinkItem.dirtValues = dirt.map(s => Number(s.amount.toFixed(3)));
      if (state.sinkItem.cleanliness >= 92) state.sinkItem.state = "clean";
      if (now - syncAt > 300) { syncAt = now; save(); const fill = document.querySelector(".meter-fill"); if (fill) fill.style.width = `${state.water}%`; }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { destroy() { dead = true; renderer.dispose(); renderer.domElement.remove(); } };
}

window.addEventListener("hashchange", () => navigate((location.hash.slice(1) || "home") === "storage" ? "sink" : location.hash.slice(1)));
render();

// 水量属于公共游戏状态：即使所有玩家离开水池页面，忘关的水仍会继续消耗。
setInterval(() => {
  if (!state.waterOn || state.water <= 0) return;
  state.water = Math.max(0, state.water - 1.75);
  if (state.water === 0) state.waterOn = false;
  const fill = document.querySelector(".meter-fill");
  const value = document.querySelector(".water-value");
  if (fill) fill.style.width = `${state.water}%`;
  if (value) value.textContent = `Water ${Math.round(state.water)}%`;
  save();
}, 500);
