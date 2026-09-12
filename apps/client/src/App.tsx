import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  COLORS,
  FOODS,
  STATIONS,
  type Item,
  type KitchenAction,
  type StationId,
} from "@kitchen/shared";
import {
  clearError,
  command,
  createRoom,
  deviceId,
  forgetRoom,
  joinRoom,
  kitchenAction,
  leaveRoom,
  presence,
  roomMeta,
  socket,
  useNetwork,
} from "./network";
import { useKitchenInput } from "./input/useKitchenInput";
import type { KitchenIntent, PoseSample } from "./input/contracts";
import { useIdentity } from "./useIdentity";
import {
  emoji,
  gameTargets,
  heldInput,
  intentAction,
  labels,
  stationLabels,
  toolImages,
} from "./gameView";
import { TomatoWash } from "./TomatoWash";
import { EnrollmentProgress } from "./EnrollmentProgress";

function Art({ item }: { item: Item }) {
  return toolImages[item.kind] ? (
    <img
      draggable={false}
      src={`/assets/tools/${toolImages[item.kind]}.png`}
      alt={labels[item.kind]}
    />
  ) : (
    <span
      className={`food-art ${item.cutProgress === 100 ? "chopped" : ""} ${item.stretched ? "stretched" : ""}`}
    >
      {emoji[item.kind]}
    </span>
  );
}
export function App() {
  const net = useNetwork(),
    room = net.room,
    k = room?.kitchen;
  const [code, setCode] = useState(""),
    [debugMode, setDebugMode] = useState(false);
  const [name, setName] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [manual, setManual] = useState<string | null>(null),
    [cameraOn, setCameraOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [guide, setGuide] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null),
    pose = useRef<PoseSample | null>(null),
    flight = useRef(false);
  const identity = useIdentity(
    video,
    cameraOn && net.ready,
    net.roster,
    room?.debugMode ? manual : null,
    room?.code ?? null,
  );
  const station = room?.stationByDevice[deviceId];
  const playerId = identity.locked;
  const player = room?.players.find((p) => p.id === playerId);
  const lease = playerId ? room?.controlLeaseByPlayer[playerId] : undefined;
  const canAct =
    !!room &&
    !!station &&
    !!playerId &&
    lease?.deviceId === deviceId &&
    net.ready &&
    k?.status === "playing";
  const held = k?.items[k.playerCarry[playerId ?? ""] ?? ""];
  const game =
    room && station
      ? gameTargets(room, station, held)
      : { targets: [], actionTarget: null };
  const latest = useRef({ canAct, game, held, station });
  latest.current = { canAct, game, held, station };
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    clearError();
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  const send = useCallback(async (action: KitchenAction, id?: string) => {
    if (flight.current || !latest.current.canAct)
      return {
        ok: false as const,
        reason: "等待连接、身份确认或上一次操作完成。",
      };
    flight.current = true;
    setPending(true);
    setMessage(null);
    clearError();
    try {
      await kitchenAction(action, id);
      return { ok: true as const };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "操作失败";
      setMessage(reason);
      return { ok: false as const, reason };
    } finally {
      flight.current = false;
      setPending(false);
    }
  }, []);
  const onIntent = async (intent: KitchenIntent) => {
    const action = intentAction(
      intent,
      latest.current.game.targets,
      latest.current.held,
    );
    return action
      ? send(action, intent.intentId)
      : { ok: false as const, reason: "操作目标已变化，请重试。" };
  };
  const wipe = useRef<{ x: number; distance: number; at: number } | null>(null);
  const input = useKitchenInput({
    enabled: canAct,
    cameraOn: cameraOn && !!room,
    context: {
      contextId: room ? `${room.code}:${k?.startedAt}` : "home",
      playerId: canAct ? playerId : null,
      sceneId: station ?? "unassigned",
      held: held ? heldInput(held) : null,
      actionTarget: game.actionTarget,
      pending,
    },
    getTargets: () => latest.current.game.targets.map((t) => t.input),
    onIntent,
    onPose: (p) => {
      pose.current = p;
      if (
        latest.current.held?.kind === "cloth" &&
        p.cursor &&
        p.cursor.x > 0.22 &&
        p.cursor.x < 0.81 &&
        p.cursor.y > 0.39 &&
        p.cursor.y < 0.76
      ) {
        const prev = wipe.current;
        const distance =
          (prev?.distance ?? 0) +
          Math.abs(p.cursor.x - (prev?.x ?? p.cursor.x));
        wipe.current = { x: p.cursor.x, distance, at: p.detectedAt };
        if (distance > 0.16 && p.detectedAt - (prev?.at ?? 0) < 250) {
          wipe.current = null;
          void send({ type: "WIPE" });
        }
      } else wipe.current = null;
    },
  });
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    if (cameraOn || !canAct) return;
    let frame = 0;
    const tick = () => {
      const p = pointer.current;
      if (p) inputRef.current.debugPose(p.x, p.y);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cameraOn, canAct]);
  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    if (room?.players.length && !selected) setSelected(room.players[0].id);
  }, [room?.players, selected]);
  useEffect(() => {
    setManual(null);
    setSelected(null);
    setCameraOn(false);
    pose.current = null;
  }, [room?.code]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,select,textarea")) return;
      if (e.key === "f")
        void (
          document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen()
        ).catch(() => {});
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    window.render_game_to_text = () =>
      JSON.stringify({
        coordinates: "normalized stage: origin top-left, x right, y down",
        connected: net.connected,
        ready: net.ready,
        room: room?.code,
        mode: k?.status ?? "home",
        station,
        player: player?.name,
        held: held
          ? { id: held.id, kind: held.kind, stretched: held.stretched }
          : null,
        control: canAct,
        kitchen: k,
        targets: game.targets.map((t) => ({
          id: t.input.id,
          ...t.input.bounds,
          allowed: t.input.allowed,
        })),
        input: { cursor: input.view.cursor, progress: input.view.progress },
      });
    window.advanceTime = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  });
  const boardItem =
    k && station
      ? k.items[k.stations[station].occupiedItemId ?? ""]
      : undefined;
  const error = message ?? net.error ?? identity.error ?? input.error;
  const connection = (
    <span className={`connection ${net.connected ? "online" : ""}`}>
      {net.connected ? "厨房已连接" : "正在连接厨房…"}
    </span>
  );
  const changeStation = (value: StationId) => {
    pointer.current = null;
    input.resetTracking();
    if (room)
      void run(() =>
        command("station:select", { ...roomMeta(), stationId: value }),
      );
  };
  return (
    <main className={room ? "kitchen-app" : "welcome-app"}>
      {!room ? (
        <section className="welcome">
          <div className="welcome-copy">
            <p className="eyebrow">四位厨师 · 四个工位 · 一份 Pizza</p>
            <h1>
              Moving
              <br />
              <span>Kitchen</span>
            </h1>
            <p className="tagline">带着食材，跑进队友的厨房。</p>
            <div className="entry">
              <label className="check">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                />
                手动测试房间（可单人、鼠标操作）
              </label>
              <button
                className="primary"
                disabled={busy || !net.connected}
                onClick={() => void run(() => createRoom(debugMode))}
              >
                创建厨房 <span>↗</span>
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => joinRoom(code));
                }}
              >
                <input
                  aria-label="房间码"
                  placeholder="队友的四位房间码"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <button disabled={busy || !net.connected || code.length !== 4}>
                  加入
                </button>
              </form>
            </div>
            <div className="welcome-bottom">
              {connection}
              <button className="text-button" onClick={() => setGuide(true)}>
                怎么玩 ↗
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <header className="topbar">
            <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
              Moving Kitchen<span>一起开饭</span>
            </a>
            <div className="room-code">
              厨房 <strong>{room.code}</strong>
            </div>
            <nav>
              {STATIONS.map((s) => (
                <button
                  disabled={
                    busy ||
                    (!room.debugMode && k?.status !== "lobby" && !!station) ||
                    Object.entries(room.stationByDevice).some(
                      ([id, st]) =>
                        id !== deviceId &&
                        st === s &&
                        room.connectedDeviceIds.includes(id),
                    )
                  }
                  className={station === s ? "active" : ""}
                  key={s}
                  onClick={() => changeStation(s)}
                >
                  {stationLabels[s]}
                  <small>
                    {Object.entries(room.stationByDevice).some(
                      ([id, st]) =>
                        st === s && room.connectedDeviceIds.includes(id),
                    )
                      ? "●"
                      : "○"}
                  </small>
                </button>
              ))}
            </nav>
            <button className="text-button" onClick={() => setGuide(true)}>
              玩法
            </button>
            <button
              className="text-button"
              onClick={() =>
                void run(async () => {
                  await leaveRoom();
                  setCameraOn(false);
                })
              }
            >
              退出
            </button>
          </header>
          {k?.status === "lobby" || !station ? (
            <section className="lobby">
              <div className="lobby-copy">
                <p className="eyebrow">先认个脸，再一起开饭</p>
                <h1>厨师集合。</h1>
                <p>
                  分享房间码 <b>{room.code}</b>，每台电脑选择一个工位。
                </p>
                <label className="station-assignment">
                  这台电脑的工位
                  <select
                    aria-label="工位"
                    value={station ?? ""}
                    disabled={busy}
                    onChange={(e) => changeStation(e.target.value as StationId)}
                  >
                    <option value="" disabled>
                      加入成功，请选择工位
                    </option>
                    {STATIONS.map((s) => {
                      const occupied = Object.entries(
                        room.stationByDevice,
                      ).some(
                        ([id, st]) =>
                          id !== deviceId &&
                          st === s &&
                          room.connectedDeviceIds.includes(id),
                      );
                      return (
                        <option key={s} value={s} disabled={occupied}>
                          {stationLabels[s]}
                          {occupied ? " · 已有电脑" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <div className="players">
                  {room.players.map((p) => (
                    <button
                      key={p.id}
                      className={`player ${selected === p.id ? "selected" : ""}`}
                      disabled={identity.enrolling}
                      onClick={() => setSelected(p.id)}
                      style={{ "--chef": p.color } as CSSProperties}
                    >
                      <span className="chef-dot" />
                      <span>
                        <b>{p.name}</b>
                        <small>{p.enrolled ? "已录脸 ✓" : "等待录脸"}</small>
                      </span>
                      <span>{selected === p.id ? "←" : "＋"}</span>
                    </button>
                  ))}
                </div>
                {room.players.length < 4 && (
                  <form
                    className="add-player"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await command("player:add", {
                          ...roomMeta(),
                          name,
                          color: COLORS.find(
                            (c) => !room.players.some((p) => p.color === c),
                          )!,
                        });
                        setName("");
                      });
                    }}
                  >
                    <input
                      aria-label="厨师名字"
                      placeholder="厨师的名字"
                      maxLength={20}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <button disabled={!name.trim() || busy}>＋ 添加厨师</button>
                  </form>
                )}
                <p className="privacy">
                  录脸和手势在本机处理。仅临时人脸特征共享到本房间，视频不会上传。
                </p>
                <button
                  className="secondary"
                  disabled={!selected || identity.enrolling || !cameraOn}
                  onClick={() => selected && void identity.enroll(selected)}
                >
                  {identity.enrolling
                    ? "正在录入人脸…"
                    : "同意并录入选中厨师的人脸"}
                </button>
                <EnrollmentProgress
                  phase={
                    identity.enrollingPlayerId === selected
                      ? identity.phase
                      : "idle"
                  }
                  progress={identity.progress}
                />
                <div className="lobby-start">
                  <span>
                    {room.connectedDeviceIds.length}/4 台电脑 ·{" "}
                    {room.players.length}/4 位厨师
                    {room.debugMode && " · 手动测试模式"}
                  </span>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      identity.enrolling ||
                      room.hostDeviceId !== deviceId ||
                      !room.players.length ||
                      !room.connectedDeviceIds.every(
                        (id) => room.stationByDevice[id],
                      )
                    }
                    onClick={() =>
                      void run(() => command("game:start", roomMeta()))
                    }
                  >
                    {room.hostDeviceId === deviceId ? "开饭！" : "等待房主开始"}
                  </button>
                </div>
              </div>
              <div className="lobby-art" aria-hidden="true" />
            </section>
          ) : (
            <>
              <div className="game-hud">
                <div>
                  <span className="eyebrow">这一单</span>
                  <b>一起做一份 Pizza</b>
                </div>
                <div className="recipe">
                  {FOODS.map((f) => (
                    <span
                      className={k?.oven.ingredientItemIds[f] ? "done" : ""}
                      key={f}
                    >
                      {emoji[f]} {labels[f]}
                      {k?.oven.ingredientItemIds[f] ? " ✓" : ""}
                    </span>
                  ))}
                </div>
                <div className="timer">
                  {Math.floor((k?.remainingMs ?? 0) / 60000)}:
                  {String(
                    Math.ceil(((k?.remainingMs ?? 0) % 60000) / 1000),
                  ).padStart(2, "0")}
                </div>
              </div>
              <section
                className={`stage stage-${station} ${k?.faucetOn ? "water-on" : ""}`}
                onPointerMove={(e) => {
                  if (cameraOn) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  pointer.current = {
                    x: (e.clientX - r.left) / r.width,
                    y: (e.clientY - r.top) / r.height,
                  };
                }}
                onPointerLeave={() => {
                  pointer.current = null;
                  input.debugLeave();
                }}
              >
                {game.targets.map((t) => (
                  <button
                    key={t.input.id}
                    data-target={t.input.id}
                    aria-label={t.input.label}
                    className={`hotspot target-${t.visual} ${t.input.allowed ? "allowed" : ""} ${input.view.hoverId === t.input.id ? "hovered" : ""}`}
                    style={{
                      left: `${t.input.bounds.x * 100}%`,
                      top: `${t.input.bounds.y * 100}%`,
                      width: `${t.input.bounds.width * 100}%`,
                      height: `${t.input.bounds.height * 100}%`,
                    }}
                    onClick={() => {
                      if (!cameraOn && canAct && t.input.allowed)
                        input.debugTarget(t.input.id);
                    }}
                  >
                    {t.item &&
                      t.visual !== "sink" &&
                      (t.visual !== "tool" || t.item.location === "home") && (
                        <Art item={t.item} />
                      )}
                    {t.visual === "food" && (
                      <span className="hotspot-label">
                        {t.item && labels[t.item.kind]}
                      </span>
                    )}
                    {t.visual === "tool" && t.item?.location !== "home" && (
                      <span className="tool-away">使用中</span>
                    )}
                    {t.visual === "board" && boardItem && (
                      <span className="process">
                        <span style={{ width: `${boardItem.cutProgress}%` }} />
                      </span>
                    )}
                  </button>
                ))}
                {station === "storage-sink" && (
                  <>
                    <div className="water-gauge">
                      水量 <b>{Math.round(k?.waterRemaining ?? 0)}%</b>
                      <div>
                        <i style={{ width: `${k?.waterRemaining}%` }} />
                      </div>
                    </div>
                    {boardItem && (
                      <TomatoWash
                        item={boardItem}
                        pose={pose}
                        waterOn={!!k?.faucetOn && canAct && !held}
                        onWash={async (patches) => {
                          await send({
                            type: "WASH",
                            itemId: boardItem.id,
                            patches,
                          });
                        }}
                      />
                    )}
                    {k?.faucetOn && <div className="water-stream" />}
                    <div className="station-hint">
                      {boardItem
                        ? `番茄清洁度 ${boardItem.cleanliness}% · 移动手或鼠标旋转，洗净后悬停拿起`
                        : "拿起番茄放进水池，再打开水龙头。"}
                    </div>
                  </>
                )}
                {station.startsWith("board") && (
                  <>
                    <div
                      className={`board-stain ${k?.stations[station].dirty ? "dirty" : ""}`}
                    />
                    <div className="station-hint">
                      {k?.stations[station].dirty
                        ? "案板有污渍 · 拿起抹布左右擦拭"
                        : "放上食材 → 拿刀上下切 → 归还菜刀 → 拿起食材"}
                    </div>
                  </>
                )}
                {station === "oven-pass" && (
                  <>
                    <div className={`oven-state ${k?.oven.status}`}>
                      {k?.oven.status === "idle"
                        ? `食材 ${Object.keys(k.oven.ingredientItemIds).length}/4`
                        : k?.oven.status === "baking"
                          ? `烘烤中 ${Math.round(k.oven.cookProgress)}%`
                          : k?.oven.status === "ready"
                            ? "烤好了！用隔热手套取出"
                            : "切开 Pizza，准备出餐"}
                    </div>
                    <div className="station-hint">
                      {held?.kind === "dough" && !held.stretched
                        ? "双手靠近后向两侧展开面饼，再放入烤箱。"
                        : "备齐四种食材自动烤制 · 烤好后有 15 秒取出时间"}
                    </div>
                  </>
                )}
                {input.view.cursor && canAct && (
                  <div
                    className="hand"
                    style={{
                      left: `${input.view.cursor.x * 100}%`,
                      top: `${input.view.cursor.y * 100}%`,
                    }}
                  >
                    <div
                      className="hover-ring"
                      style={
                        {
                          "--progress": `${input.view.progress * 100}%`,
                          opacity: input.view.progress ? 1 : 0,
                        } as CSSProperties
                      }
                    />
                    <div
                      className="carried"
                      style={{
                        transform: `rotate(${input.view.rotationRad ?? 0}rad)`,
                      }}
                    >
                      {held ? <Art item={held} /> : <span>✋</span>}
                    </div>
                  </div>
                )}
                {!canAct && k?.status === "playing" && (
                  <div className="identity-notice">
                    {!net.ready
                      ? "正在重新连接厨房…"
                      : !player
                        ? "面对摄像头识别厨师身份，或在测试模式选择厨师。"
                        : "控制权在另一台电脑。请重新面对摄像头，或点击接管。"}
                  </div>
                )}
              </section>
              <footer className="game-footer">
                <div>
                  <span
                    className="chef-dot"
                    style={
                      { "--chef": player?.color ?? "#888" } as CSSProperties
                    }
                  />
                  <b>{player?.name ?? "等待厨师"}</b>
                  <span>
                    {held
                      ? `携带：${labels[held.kind]}${held.stretched ? " · 已展开" : ""}`
                      : "空手"}
                  </span>
                </div>
                <p>
                  {pending
                    ? "厨房正在确认…"
                    : (
                        input.feedback ??
                        (canAct ? input.view.feedback : "等待身份确认")
                      ).replace("宿主", "厨房")}
                </p>
                <span>浪费 {k?.waste.total} · F 全屏</span>
              </footer>
              {room.debugMode && (
                <div className="debug-strip">
                  <b>手动测试</b>
                  {room.players.map((p) => (
                    <button
                      key={p.id}
                      className={manual === p.id ? "active" : ""}
                      onClick={() => {
                        if (manual === p.id)
                          void run(() => presence(p.id, "manual-debug"));
                        else setManual(p.id);
                      }}
                    >
                      {p.name}
                      {manual === p.id ? " · 接管" : ""}
                    </button>
                  ))}
                  {game.actionTarget && (
                    <button
                      disabled={!canAct || pending}
                      onClick={() => input.debugAction()}
                    >
                      {game.actionTarget.action === "STRETCH"
                        ? "模拟双手展开"
                        : "模拟切一次"}
                    </button>
                  )}
                  {held?.kind === "cloth" && (
                    <button onClick={() => void send({ type: "WIPE" })}>
                      模拟擦拭
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          <aside
            className={`camera-panel ${k?.status === "lobby" || !station ? "camera-lobby" : ""}`}
          >
            <video
              ref={(node) => {
                video.current = node;
                input.videoRef.current = node;
              }}
              autoPlay
              muted
              playsInline
            />
            <div className="camera-caption">
              {cameraOn
                ? `${input.hands.length} 只手 · ${player?.name ?? "等待识别"}`
                : "摄像头已关闭"}
              <button
                disabled={identity.enrolling}
                onClick={() => {
                  setCameraOn((v) => !v);
                  if (!cameraOn) setManual(null);
                }}
              >
                {cameraOn ? "关闭" : "开启摄像头"}
              </button>
            </div>
            {cameraOn && input.status === "loading" && (
              <span className="camera-loading">
                {input.loadingStep === "permission"
                  ? "请允许摄像头权限"
                  : "正在加载本地模型…"}
              </span>
            )}
            {input.error && (
              <button onClick={input.retry}>重新连接摄像头</button>
            )}
          </aside>
          {!net.ready && room && net.connected && (
            <div className="reconnect">
              <p>房间尚未恢复。若服务器已重启，请重新创建厨房。</p>
              <button onClick={() => void run(() => joinRoom(room.code))}>
                重连房间
              </button>
              <button onClick={forgetRoom}>返回首页</button>
            </div>
          )}
          {k?.status === "finished" && (
            <div className="modal-backdrop">
              <section className="results">
                <p className="eyebrow">本轮结束</p>
                <div className="result-art">
                  {k.finishedReason === "served"
                    ? "🍕"
                    : k.finishedReason === "burnt"
                      ? "🔥"
                      : "⏲️"}
                </div>
                <h1>
                  {k.finishedReason === "served"
                    ? "开饭啦！"
                    : k.finishedReason === "burnt"
                      ? "Pizza 烤焦了"
                      : "时间到了"}
                </h1>
                <p>
                  {k.finishedReason === "served"
                    ? "四个工位，一份默契。"
                    : "再来一次，分工会更顺手。"}
                </p>
                <strong className="score">
                  {k.score}
                  <small> 分</small>
                </strong>
                <div className="result-stats">
                  <span>
                    剩余水量 <b>{Math.round(k.waterRemaining)}%</b>
                  </span>
                  <span>
                    食材浪费 <b>{k.waste.total}</b>
                  </span>
                  <span>
                    剩余时间 <b>{Math.ceil(k.remainingMs / 1000)}s</b>
                  </span>
                </div>
                <button
                  className="primary"
                  disabled={busy || room.hostDeviceId !== deviceId}
                  onClick={() =>
                    void run(() => command("game:restart", roomMeta()))
                  }
                >
                  {room.hostDeviceId === deviceId ? "再开一单" : "等待房主重开"}
                </button>
                <button onClick={() => void run(leaveRoom)}>离开厨房</button>
              </section>
            </div>
          )}
        </>
      )}
      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button
            aria-label="关闭提示"
            onClick={() => {
              setMessage(null);
              clearError();
            }}
          >
            ×
          </button>
        </div>
      )}
      {guide && (
        <div className="modal-backdrop">
          <section className="guide">
            <button className="close" onClick={() => setGuide(false)}>
              ×
            </button>
            <p className="eyebrow">今天的菜单</p>
            <h1>Pizza 接力</h1>
            <ol>
              <li>
                <b>番茄</b>在水池洗净，在菜板用刀切碎。
              </li>
              <li>
                <b>香肠</b>在另一块菜板切碎；换食材前用抹布擦净。
              </li>
              <li>
                <b>面饼</b>拿在手中，双手靠近再向两侧展开。芝士可以直接使用。
              </li>
              <li>
                把四种食材放进<b>烤箱</b>，等待 20 秒，用隔热手套取出。
              </li>
              <li>
                归还手套，拿起<b>披萨刀</b>，在托盘上下切，完成出餐！
              </li>
            </ol>
            <p>
              空手悬停 0.8 秒拿取，携带时悬停 0.4
              秒放置。工具放回原位后先移开手。食材随你的人脸身份跨屏移动。
            </p>
            <button className="primary" onClick={() => setGuide(false)}>
              知道了，开工
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
