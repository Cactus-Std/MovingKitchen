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
  getItemLabels,
  getStationLabels,
  heldInput,
  intentAction,
  toolImages,
} from "./gameView";
import { TomatoWash } from "./TomatoWash";
import { EnrollmentProgress } from "./EnrollmentProgress";
import { getGameControl } from "./gameControl";
import {
  DEFAULT_LANGUAGE,
  runtimeErrorText,
  setActiveLanguage,
  text,
  type Language,
} from "./i18n";

function foodSprite(item: Item): string | null {
  if (!FOODS.includes(item.kind as (typeof FOODS)[number])) return null;
  const stage =
    item.kind === "tomato" || item.kind === "sausage" || item.kind === "cheese"
      ? Math.min(5, Math.max(1, Math.round((item.cutProgress ?? 0) / 25) + 1))
      : 1;
  return `/assets/tools/${item.kind}${stage}.png`;
}

function DoughArt({ item }: { item: Item }) {
  const activeStage = Math.min(
    5,
    Math.max(1, Math.round((item.stretchProgress ?? 0) / 25) + 1),
  );
  return (
    <span className="food-art dough-art" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((stage) => (
        <img
          key={stage}
          draggable={false}
          src={`/assets/tools/dough${stage}.png`}
          alt=""
          className={stage === activeStage ? "visible" : ""}
        />
      ))}
    </span>
  );
}

function LanguageToggle({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  return (
    <div
      className="language-toggle"
      role="group"
      aria-label={text(language, "Language", "语言")}
    >
      <button
        type="button"
        className={language === "en" ? "active" : ""}
        aria-pressed={language === "en"}
        onClick={() => onChange("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={language === "zh" ? "active" : ""}
        aria-pressed={language === "zh"}
        onClick={() => onChange("zh")}
      >
        中文
      </button>
    </div>
  );
}

function Art({ item, language }: { item: Item; language: Language }) {
  const labels = getItemLabels(language);
  const sprite = foodSprite(item);
  return item.kind === "dough" ? (
    <DoughArt item={item} />
  ) : toolImages[item.kind] ? (
    <img
      className={`tool-art tool-art-${item.kind}`}
      draggable={false}
      src={`/assets/tools/${toolImages[item.kind]}.png`}
      alt={labels[item.kind]}
    />
  ) : sprite ? (
    <img
      className="food-art"
      draggable={false}
      src={sprite}
      alt=""
      aria-hidden="true"
    />
  ) : (
    <span className="food-art">{emoji[item.kind]}</span>
  );
}
export function App() {
  const net = useNetwork(),
    room = net.room,
    k = room?.kitchen;
  const resultPreview = new URLSearchParams(window.location.search).has(
    "resultPreview",
  );
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE),
    [code, setCode] = useState(""),
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
    flight = useRef<string | null>(null);
  const labels = getItemLabels(language);
  const stationLabels = getStationLabels(language);
  const identity = useIdentity(
    video,
    cameraOn && net.ready,
    net.roster,
    room?.debugMode ? manual : null,
    room?.code ?? null,
    language,
  );
  const station = room?.stationByDevice[deviceId];
  const playerId = identity.locked;
  const control = identity.switching
    ? null
    : getGameControl(room, deviceId, playerId);
  const player = control?.player;
  const contextId = `${room?.code ?? "home"}:${k?.startedAt ?? "lobby"}:${station ?? "unassigned"}:${control?.context.controlToken ?? "unconfirmed"}`;
  const canAct =
    !!room &&
    !!station &&
    !!control &&
    !identity.enrolling &&
    net.ready &&
    k?.status === "playing";
  const held = control?.held;
  const game =
    room && station
      ? gameTargets(room, station, held, language)
      : { targets: [], actionTarget: null };
  const latest = useRef({ canAct, game, held, station, control, contextId });
  latest.current = { canAct, game, held, station, control, contextId };
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    clearError();
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? runtimeErrorText(language, e.message)
          : text(
              language,
              "Action failed. Please try again.",
              "操作失败，请重试。",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  const send = useCallback(
    async (action: KitchenAction, id?: string) => {
      const current = latest.current;
      if (flight.current || !current.canAct || !current.control)
        return {
          ok: false as const,
          reason: text(
            language,
            "Wait for the connection, identity, or previous action to finish.",
            "等待连接、身份确认或上一次操作完成。",
          ),
        };
      const actionId = id ?? crypto.randomUUID();
      flight.current = actionId;
      setPending(true);
      setMessage(null);
      clearError();
      try {
        await kitchenAction(action, current.control.context, actionId);
        return { ok: true as const };
      } catch (e) {
        const reason =
          e instanceof Error
            ? runtimeErrorText(language, e.message)
            : text(language, "Action failed", "操作失败");
        if (latest.current.contextId === current.contextId) setMessage(reason);
        return { ok: false as const, reason };
      } finally {
        if (flight.current === actionId) {
          flight.current = null;
          setPending(false);
        }
      }
    },
    [language],
  );
  const onIntent = async (intent: KitchenIntent) => {
    if (
      intent.contextId !== latest.current.contextId ||
      intent.playerId !== latest.current.control?.player.id ||
      intent.sceneId !== latest.current.station
    )
      return {
        ok: false as const,
        reason: text(
          language,
          "The chef or station changed. Please try again.",
          "玩家或工位已变化，请重新操作。",
        ),
      };
    const action = intentAction(
      intent,
      latest.current.game.targets,
      latest.current.held,
    );
    return action
      ? send(action, intent.intentId)
      : {
          ok: false as const,
          reason: text(
            language,
            "The action target changed. Please try again.",
            "操作目标已变化，请重试。",
          ),
        };
  };
  const wipe = useRef<{ x: number; distance: number; at: number } | null>(null);
  const input = useKitchenInput({
    enabled: canAct,
    cameraOn: cameraOn && !!room,
    language,
    context: {
      contextId,
      playerId: canAct ? playerId : null,
      sceneId: station ?? "unassigned",
      held: held ? heldInput(held, language) : null,
      actionTarget: game.actionTarget,
      pending,
    },
    getTargets: () => latest.current.game.targets.map((t) => t.input),
    onIntent,
    onPose: (p) => {
      if (
        p.contextId !== latest.current.contextId ||
        p.playerId !== latest.current.control?.player.id
      )
        return;
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
    flight.current = null;
    setPending(false);
    pointer.current = null;
    pose.current = null;
    wipe.current = null;
  }, [contextId]);
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
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = text(
      language,
      "Moving Kitchen · Cook together",
      "Moving Kitchen · 一起开饭",
    );
  }, [language]);
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
          ? {
              id: held.id,
              kind: held.kind,
              stretchProgress: held.stretchProgress,
              stretched: held.stretched,
            }
          : null,
        control: canAct,
        identityAbsent: identity.absent,
        identitySwitching: identity.switching,
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
      {net.connected
        ? text(language, "Kitchen connected", "厨房已连接")
        : text(language, "Connecting to kitchen…", "正在连接厨房…")}
    </span>
  );
  const changeLanguage = (next: Language) => {
    setActiveLanguage(next);
    setLanguage(next);
    setMessage(null);
    clearError();
  };
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
          <div className="welcome-language">
            <LanguageToggle language={language} onChange={changeLanguage} />
          </div>
          <div className="welcome-copy">
            <p className="eyebrow">
              {text(
                language,
                "Four chefs · Four stations · One pizza",
                "四位厨师 · 四个工位 · 一份 Pizza",
              )}
            </p>
            <h1>
              Moving
              <br />
              <span>Kitchen</span>
            </h1>
            <p className="tagline">
              {text(
                language,
                "Carry ingredients across your teammates' kitchens.",
                "带着食材，跑进队友的厨房。",
              )}
            </p>
            <div className="entry">
              <label className="check">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                />
                {text(
                  language,
                  "Manual test kitchen (solo play with a mouse)",
                  "手动测试房间（可单人、鼠标操作）",
                )}
              </label>
              <button
                className="primary"
                disabled={busy || !net.connected}
                onClick={() => void run(() => createRoom(debugMode))}
              >
                {text(language, "Create kitchen", "创建厨房")} <span>↗</span>
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => joinRoom(code));
                }}
              >
                <input
                  aria-label={text(language, "Kitchen code", "房间码")}
                  placeholder={text(
                    language,
                    "Teammate's four-letter code",
                    "队友的四位房间码",
                  )}
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <button disabled={busy || !net.connected || code.length !== 4}>
                  {text(language, "Join", "加入")}
                </button>
              </form>
            </div>
            <div className="welcome-bottom">
              {connection}
              <button className="text-button" onClick={() => setGuide(true)}>
                {text(language, "How to play ↗", "怎么玩 ↗")}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <header className="topbar">
            <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
              Moving Kitchen
              <span>{text(language, "COOK TOGETHER", "一起开饭")}</span>
            </a>
            <div className="room-code">
              {text(language, "KITCHEN", "厨房")} <strong>{room.code}</strong>
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
            {k?.status === "lobby" && (
              <LanguageToggle language={language} onChange={changeLanguage} />
            )}
            <button className="text-button" onClick={() => setGuide(true)}>
              {text(language, "How to play", "玩法")}
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
              {text(language, "Exit", "退出")}
            </button>
          </header>
          {k?.status === "lobby" || !station ? (
            <section className="lobby">
              <div className="lobby-copy">
                <p className="eyebrow">
                  {text(
                    language,
                    "Meet the team before service",
                    "先认个脸，再一起开饭",
                  )}
                </p>
                <h1>{text(language, "Chefs, assemble.", "厨师集合。")}</h1>
                <p>
                  {text(language, "Share code", "分享房间码")}{" "}
                  <b>{room.code}</b>
                  {text(
                    language,
                    ", then choose one station on each computer.",
                    "，每台电脑选择一个工位。",
                  )}
                </p>
                <label className="station-assignment">
                  {text(language, "This computer's station", "这台电脑的工位")}
                  <select
                    aria-label={text(language, "Station", "工位")}
                    value={station ?? ""}
                    disabled={busy}
                    onChange={(e) => changeStation(e.target.value as StationId)}
                  >
                    <option value="" disabled>
                      {text(
                        language,
                        "Joined — choose a station",
                        "加入成功，请选择工位",
                      )}
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
                          {occupied
                            ? text(language, " · Occupied", " · 已有电脑")
                            : ""}
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
                        <small>
                          {p.enrolled
                            ? text(language, "Face enrolled ✓", "已录脸 ✓")
                            : text(
                                language,
                                "Waiting for face enrollment",
                                "等待录脸",
                              )}
                        </small>
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
                      aria-label={text(language, "Chef name", "厨师名字")}
                      placeholder={text(language, "Chef's name", "厨师的名字")}
                      maxLength={20}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <button disabled={!name.trim() || busy}>
                      {text(language, "+ Add chef", "＋ 添加厨师")}
                    </button>
                  </form>
                )}
                <p className="privacy">
                  {text(
                    language,
                    "Face and gesture processing stays on this device. Only temporary face features are shared with this kitchen; video is never uploaded.",
                    "录脸和手势在本机处理。仅临时人脸特征共享到本房间，视频不会上传。",
                  )}
                </p>
                <button
                  className="secondary"
                  disabled={!selected || identity.enrolling || !cameraOn}
                  onClick={() => selected && void identity.enroll(selected)}
                >
                  {identity.enrolling
                    ? text(language, "Enrolling face…", "正在录入人脸…")
                    : text(
                        language,
                        "Consent and enroll the selected chef's face",
                        "同意并录入选中厨师的人脸",
                      )}
                </button>
                <EnrollmentProgress
                  phase={
                    identity.enrollingPlayerId === selected
                      ? identity.phase
                      : "idle"
                  }
                  progress={identity.progress}
                  language={language}
                />
                <div className="lobby-start">
                  <span>
                    {room.connectedDeviceIds.length}/4{" "}
                    {text(language, "computers", "台电脑")} ·{" "}
                    {room.players.length}/4 {text(language, "chefs", "位厨师")}
                    {room.debugMode &&
                      text(language, " · Manual test mode", " · 手动测试模式")}
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
                    {room.hostDeviceId === deviceId
                      ? text(language, "Start cooking!", "开饭！")
                      : text(language, "Waiting for the host", "等待房主开始")}
                  </button>
                </div>
              </div>
              <div className="lobby-art" aria-hidden="true" />
            </section>
          ) : (
            <>
              <div className="game-hud">
                <div>
                  <span className="eyebrow">
                    {text(language, "CURRENT ORDER", "这一单")}
                  </span>
                  <b>
                    {text(
                      language,
                      "Make one pizza together",
                      "一起做一份 Pizza",
                    )}
                  </b>
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
                        <Art item={t.item} language={language} />
                      )}
                    {t.visual === "tool" && t.item?.location !== "home" && (
                      <span className="tool-away">
                        {text(language, "IN USE", "使用中")}
                      </span>
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
                      {text(language, "Water", "水量")}{" "}
                      <b>{Math.round(k?.waterRemaining ?? 0)}%</b>
                      <div>
                        <i style={{ width: `${k?.waterRemaining}%` }} />
                      </div>
                    </div>
                    {boardItem && (
                      <TomatoWash
                        item={boardItem}
                        pose={pose}
                        language={language}
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
                        ? text(
                            language,
                            `Tomato cleanliness ${boardItem.cleanliness}% · Move your hand or mouse to rotate it; hover to pick it up when clean`,
                            `番茄清洁度 ${boardItem.cleanliness}% · 移动手或鼠标旋转，洗净后悬停拿起`,
                          )
                        : text(
                            language,
                            "Pick up a tomato, place it in the sink, then turn on the faucet.",
                            "拿起番茄放进水池，再打开水龙头。",
                          )}
                    </div>
                  </>
                )}
                {station.startsWith("board") && (
                  <>
                    <div
                      className={`board-stain ${k?.stations[station].dirty ? "dirty" : ""}`}
                    />
                    <div className="station-hint">
                      {boardItem?.kind === "dough" && !boardItem.stretched
                        ? text(
                            language,
                            `Use two empty hands to stretch the dough · ${boardItem.stretchProgress}%`,
                            `空手用双手展开面团 · ${boardItem.stretchProgress}%`,
                          )
                        : k?.stations[station].dirty
                          ? text(
                              language,
                              "Board is dirty · Pick up the cloth and wipe left and right",
                              "案板有污渍 · 拿起抹布左右擦拭",
                            )
                          : text(
                              language,
                              "Place ingredient → Chop → Return knife → Pick up ingredient",
                              "放上食材 → 拿刀上下切 → 归还菜刀 → 拿起食材",
                            )}
                    </div>
                  </>
                )}
                {station === "oven-pass" && (
                  <>
                    <div className={`oven-state ${k?.oven.status}`}>
                      {k?.oven.status === "idle"
                        ? text(
                            language,
                            `Ingredients ${Object.keys(k.oven.ingredientItemIds).length}/4`,
                            `食材 ${Object.keys(k.oven.ingredientItemIds).length}/4`,
                          )
                        : k?.oven.status === "baking"
                          ? text(
                              language,
                              `Baking ${Math.round(k.oven.cookProgress)}%`,
                              `烘烤中 ${Math.round(k.oven.cookProgress)}%`,
                            )
                          : k?.oven.status === "ready"
                            ? text(
                                language,
                                "Ready! Take it out with the oven mitt",
                                "烤好了！用隔热手套取出",
                              )
                            : text(
                                language,
                                "Slice the pizza to serve",
                                "切开 Pizza，准备出餐",
                              )}
                    </div>
                    <div className="station-hint">
                      {held?.kind === "dough" && !held.stretched
                        ? text(
                            language,
                            `Keep stretching the dough with both hands ${held.stretchProgress}% · Finish before adding it to the oven.`,
                            `重复双手展开面饼 ${held.stretchProgress}% · 完成后再放入烤箱。`,
                          )
                        : text(
                            language,
                            "Add all four ingredients to bake · Remove the pizza within 15 seconds",
                            "备齐四种食材自动烤制 · 烤好后有 15 秒取出时间",
                          )}
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
                      {held ? (
                        <Art item={held} language={language} />
                      ) : (
                        <span>✋</span>
                      )}
                    </div>
                  </div>
                )}
                {!canAct && k?.status === "playing" && (
                  <div className="identity-notice">
                    {!net.ready
                      ? text(
                          language,
                          "Reconnecting to the kitchen…",
                          "正在重新连接厨房…",
                        )
                      : identity.absent
                        ? text(
                            language,
                            "No chef is visible. Return to the camera; carried items remain with their chef.",
                            "当前未识别到玩家，请回到摄像头前。携带物仍保留在原玩家名下。",
                          )
                        : identity.switching
                          ? text(
                              language,
                              "Confirming the new chef…",
                              "正在确认新玩家，请稍候。",
                            )
                          : !playerId
                            ? text(
                                language,
                                "Face the camera to identify your chef, or choose one in test mode.",
                                "面对摄像头识别厨师身份，或在测试模式选择厨师。",
                              )
                            : text(
                                language,
                                "Waiting to confirm this chef's identity and control. Face the camera or take control in test mode.",
                                "等待当前玩家身份与控制权确认，请面对摄像头，或在测试模式点击接管。",
                              )}
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
                  <b>
                    {player?.name ??
                      (identity.absent
                        ? text(language, "No chef detected", "未识别到玩家")
                        : text(language, "Confirming chef", "等待厨师确认"))}
                  </b>
                  <span>
                    {held
                      ? text(
                          language,
                          `Carrying: ${labels[held.kind]}${held.kind === "dough" ? ` · Stretched ${held.stretchProgress}%` : ""}`,
                          `携带：${labels[held.kind]}${held.kind === "dough" ? ` · 展开 ${held.stretchProgress}%` : ""}`,
                        )
                      : text(language, "Empty-handed", "空手")}
                  </span>
                </div>
                <p>
                  {pending
                    ? text(language, "Kitchen is confirming…", "厨房正在确认…")
                    : (
                        input.feedback ??
                        (canAct
                          ? input.view.feedback
                          : text(
                              language,
                              "Waiting for identity",
                              "等待身份确认",
                            ))
                      ).replace(
                        text(language, "host", "宿主"),
                        text(language, "kitchen", "厨房"),
                      )}
                </p>
                <span>
                  {text(language, "Waste", "浪费")} {k?.waste.total} · F{" "}
                  {text(language, "Fullscreen", "全屏")}
                </span>
              </footer>
              {room.debugMode && (
                <div className="debug-strip">
                  <b>{text(language, "MANUAL TEST", "手动测试")}</b>
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
                      {manual === p.id
                        ? text(language, " · Take control", " · 接管")
                        : ""}
                    </button>
                  ))}
                  {game.actionTarget && (
                    <button
                      disabled={!canAct || pending}
                      onClick={() => input.debugAction()}
                    >
                      {game.actionTarget.action === "STRETCH"
                        ? text(
                            language,
                            "Simulate two-hand stretch",
                            "模拟双手展开",
                          )
                        : text(language, "Simulate one chop", "模拟切一次")}
                    </button>
                  )}
                  {held?.kind === "cloth" && (
                    <button onClick={() => void send({ type: "WIPE" })}>
                      {text(language, "Simulate wipe", "模拟擦拭")}
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
                ? text(
                    language,
                    `${input.hands.length} ${input.hands.length === 1 ? "hand" : "hands"} · ${player?.name ?? "Waiting for identity"}`,
                    `${input.hands.length} 只手 · ${player?.name ?? "等待识别"}`,
                  )
                : text(language, "Camera off", "摄像头已关闭")}
              <button
                disabled={identity.enrolling}
                onClick={() => {
                  setCameraOn((v) => !v);
                  if (!cameraOn) setManual(null);
                }}
              >
                {cameraOn
                  ? text(language, "Turn off", "关闭")
                  : text(language, "Turn on camera", "开启摄像头")}
              </button>
            </div>
            {cameraOn && input.status === "loading" && (
              <span className="camera-loading">
                {input.loadingStep === "permission"
                  ? text(language, "Allow camera access", "请允许摄像头权限")
                  : text(
                      language,
                      "Loading local models…",
                      "正在加载本地模型…",
                    )}
              </span>
            )}
            {input.error && (
              <button onClick={input.retry}>
                {text(language, "Reconnect camera", "重新连接摄像头")}
              </button>
            )}
          </aside>
          {!net.ready && room && net.connected && (
            <div className="reconnect">
              <p>
                {text(
                  language,
                  "This kitchen has not recovered. If the server restarted, create a new kitchen.",
                  "房间尚未恢复。若服务器已重启，请重新创建厨房。",
                )}
              </p>
              <button onClick={() => void run(() => joinRoom(room.code))}>
                {text(language, "Reconnect kitchen", "重连房间")}
              </button>
              <button onClick={forgetRoom}>
                {text(language, "Back to home", "返回首页")}
              </button>
            </div>
          )}
          {resultPreview && (
            <div className="modal-backdrop result-preview-backdrop">
              <div className="result-preview-pizza">
                <img src="/assets/tools/pizza-plate.png" alt="Result pizza preview" />
              </div>
            </div>
          )}
          {k?.status === "finished" && (
            <div className="modal-backdrop">
              <section className="results">
                <p className="eyebrow">
                  {text(language, "SERVICE COMPLETE", "本轮结束")}
                </p>
                <div className="result-art">
                  {k.finishedReason === "served"
                    ? "🍕"
                    : k.finishedReason === "burnt"
                      ? "🔥"
                      : "⏲️"}
                </div>
                <h1>
                  {k.finishedReason === "served"
                    ? text(language, "Order up!", "开饭啦！")
                    : k.finishedReason === "burnt"
                      ? text(language, "The pizza burned", "Pizza 烤焦了")
                      : text(language, "Time's up", "时间到了")}
                </h1>
                <p>
                  {k.finishedReason === "served"
                    ? text(
                        language,
                        "Four stations, one perfectly coordinated team.",
                        "四个工位，一份默契。",
                      )
                    : text(
                        language,
                        "Try again — the teamwork gets smoother every round.",
                        "再来一次，分工会更顺手。",
                      )}
                </p>
                <strong className="score">
                  {k.score}
                  <small> {text(language, "pts", "分")}</small>
                </strong>
                <div className="result-stats">
                  <span>
                    {text(language, "Water left", "剩余水量")}{" "}
                    <b>{Math.round(k.waterRemaining)}%</b>
                  </span>
                  <span>
                    {text(language, "Food wasted", "食材浪费")}{" "}
                    <b>{k.waste.total}</b>
                  </span>
                  <span>
                    {text(language, "Time left", "剩余时间")}{" "}
                    <b>{Math.ceil(k.remainingMs / 1000)}s</b>
                  </span>
                </div>
                <button
                  className="primary"
                  disabled={busy || room.hostDeviceId !== deviceId}
                  onClick={() =>
                    void run(() => command("game:restart", roomMeta()))
                  }
                >
                  {room.hostDeviceId === deviceId
                    ? text(language, "Cook another", "再开一单")
                    : text(
                        language,
                        "Waiting for the host to restart",
                        "等待房主重开",
                      )}
                </button>
                <button onClick={() => void run(leaveRoom)}>
                  {text(language, "Leave kitchen", "离开厨房")}
                </button>
              </section>
            </div>
          )}
        </>
      )}
      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button
            aria-label={text(language, "Dismiss message", "关闭提示")}
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
            <button
              className="close"
              aria-label={text(language, "Close guide", "关闭玩法说明")}
              onClick={() => setGuide(false)}
            >
              ×
            </button>
            <p className="eyebrow">
              {text(language, "TODAY'S MENU", "今天的菜单")}
            </p>
            <h1>{text(language, "Pizza Relay", "Pizza 接力")}</h1>
            {language === "en" ? (
              <>
                <ol>
                  <li>
                    Wash the <b>tomato</b> in the sink, then chop it on a
                    cutting board.
                  </li>
                  <li>
                    Chop the <b>sausage</b> and <b>cheese</b> on the other
                    board. Wipe the board before switching ingredients.
                  </li>
                  <li>
                    Place the <b>dough</b> on a board. With empty hands, bring
                    both hands together, then stretch them apart.
                  </li>
                  <li>
                    Add all four ingredients to the <b>oven</b>, bake for 20
                    seconds, then remove the pizza with the oven mitt.
                  </li>
                  <li>
                    Return the mitt, pick up the <b>pizza cutter</b>, and slice
                    on the tray to serve!
                  </li>
                </ol>
                <p>
                  Hover empty-handed for 0.8 seconds to pick up an item, or
                  hover for 0.4 seconds to place one. Move away after returning
                  a tool. Ingredients follow your face identity across screens.
                </p>
              </>
            ) : (
              <>
                <ol>
                  <li>
                    <b>番茄</b>在水池洗净，在菜板用刀切碎。
                  </li>
                  <li>
                    <b>香肠</b>和<b>芝士</b>
                    在另一块菜板切碎；换食材前用抹布擦净。
                  </li>
                  <li>
                    <b>面饼</b>
                    放到菜板上，空手将双手靠近，再向两侧展开。
                  </li>
                  <li>
                    把四种食材放进<b>烤箱</b>，等待 20 秒，用隔热手套取出。
                  </li>
                  <li>
                    归还手套，拿起<b>披萨刀</b>
                    ，在托盘上下切，完成出餐！
                  </li>
                </ol>
                <p>
                  空手悬停 0.8 秒拿取，携带时悬停 0.4
                  秒放置。工具放回原位后先移开手。食材随你的人脸身份跨屏移动。
                </p>
              </>
            )}
            <button className="primary" onClick={() => setGuide(false)}>
              {text(language, "Got it — let's cook", "知道了，开工")}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
