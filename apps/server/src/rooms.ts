import { randomUUID } from "node:crypto";
import {
  COLORS,
  FACE_MODEL,
  PRESENCE_TTL,
  STATIONS,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  type DevicePresence,
  type Evidence,
  type FaceTemplate,
  type IdentityCandidate,
  type KitchenActionPayload,
  type PlayerColor,
  type RoomState,
  type StationId,
} from "@kitchen/shared";
import { requireRule as check } from "./errors.js";
import { advanceKitchen, applyKitchenAction, newKitchen } from "./kitchen.js";
interface Entry {
  state: RoomState;
  roster: IdentityCandidate[];
  sockets: Map<string, Set<string>>;
  actions: Map<string, string>;
  requests: Map<string, string>;
  lastAction: Map<string, number>;
  tickAt: number;
  emptyAt: number | null;
}
export class Rooms {
  entries = new Map<string, Entry>();
  constructor(
    public allowDebug = false,
    private clock = Date.now,
  ) {}
  get(code: string): Entry {
    const entry = this.entries.get(normalizeRoomCode(code));
    check(entry, "ROOM_NOT_FOUND", "房间不存在，可能已随服务器重启关闭。");
    return entry;
  }
  create(
    device: string,
    socket: string,
    station: StationId,
    debugMode: boolean,
  ): RoomState {
    check(
      !debugMode || this.allowDebug,
      "NOT_AUTHORIZED",
      "服务器未开启手动测试模式。",
    );
    this.validStation(station);
    let code = generateRoomCode();
    while (this.entries.has(code)) code = generateRoomCode();
    const now = this.clock();
    const state: RoomState = {
      code,
      hostDeviceId: device,
      players: [],
      connectedDeviceIds: [device],
      stationByDevice: { [device]: station },
      presenceByDevice: {},
      controlLeaseByPlayer: {},
      kitchen: newKitchen(),
      createdAt: now,
      debugMode,
    };
    this.entries.set(code, {
      state,
      roster: [],
      sockets: new Map([[device, new Set([socket])]]),
      actions: new Map(),
      requests: new Map(),
      lastAction: new Map(),
      tickAt: now,
      emptyAt: null,
    });
    return state;
  }
  join(
    code: string,
    device: string,
    socket: string,
    station: StationId,
  ): RoomState {
    check(isValidRoomCode(code), "INVALID_REQUEST", "请输入四位房间码。");
    const e = this.get(code);
    this.bind(e, device, station);
    const sockets = e.sockets.get(device) ?? new Set();
    sockets.add(socket);
    e.sockets.set(device, sockets);
    e.state.connectedDeviceIds = [...e.sockets.keys()];
    e.emptyAt = null;
    return e.state;
  }
  validStation(station: StationId) {
    check(STATIONS.includes(station), "INVALID_STATION", "未知工位。");
  }
  bind(e: Entry, device: string, station: StationId) {
    this.validStation(station);
    check(
      !Object.entries(e.state.stationByDevice).some(
        ([id, s]) => id !== device && s === station && e.sockets.has(id),
      ),
      "INVALID_STATION",
      "这个工位已经有电脑加入。",
    );
    e.state.stationByDevice[device] = station;
  }
  leave(code: string, device: string, socket: string): RoomState {
    const e = this.get(code);
    const sockets = e.sockets.get(device);
    sockets?.delete(socket);
    if (!sockets?.size) {
      e.sockets.delete(device);
      delete e.state.presenceByDevice[device];
      this.release(e, device);
    }
    e.state.connectedDeviceIds = [...e.sockets.keys()];
    if (!e.sockets.size) e.emptyAt = this.clock();
    return e.state;
  }
  release(e: Entry, device: string, keepPlayerId?: string) {
    for (const [player, lease] of Object.entries(e.state.controlLeaseByPlayer))
      if (player !== keepPlayerId && lease?.deviceId === device)
        delete e.state.controlLeaseByPlayer[player];
  }
  add(code: string, name: string, color: PlayerColor): RoomState {
    const e = this.get(code),
      r = e.state;
    check(
      r.kitchen.status === "lobby",
      "INVALID_REQUEST",
      "游戏开始后不能添加玩家。",
    );
    check(r.players.length < 4, "ROOM_FULL", "最多四位厨师。");
    check(
      typeof name === "string" &&
        name.trim().length > 0 &&
        name.trim().length <= 20 &&
        COLORS.includes(color),
      "INVALID_REQUEST",
      "请输入 1–20 字的名字和有效颜色。",
    );
    check(
      !r.players.some(
        (p) =>
          p.name.toLowerCase() === name.trim().toLowerCase() ||
          p.color === color,
      ),
      "INVALID_REQUEST",
      "名字和颜色不能重复。",
    );
    const player = {
      id: randomUUID(),
      name: name.trim(),
      color,
      enrolled: false,
    };
    r.players.push(player);
    r.kitchen.playerCarry[player.id] = null;
    return r;
  }
  enroll(code: string, playerId: string, template: FaceTemplate): RoomState {
    const e = this.get(code),
      p = e.state.players.find((p) => p.id === playerId);
    check(
      e.state.kitchen.status === "lobby",
      "INVALID_REQUEST",
      "请在准备室录脸。",
    );
    check(p, "PLAYER_NOT_FOUND", "找不到这位厨师。");
    check(
      template &&
        template.modelId === FACE_MODEL.modelId &&
        template.modelVersion === FACE_MODEL.modelVersion &&
        template.preprocessingVersion === FACE_MODEL.preprocessingVersion,
      "INVALID_REQUEST",
      "人脸模型版本不匹配。",
    );
    const v = template.vector;
    check(
      Array.isArray(v) &&
        v.length === 512 &&
        v.every(Number.isFinite) &&
        Math.abs(Math.hypot(...v) - 1) < 0.02,
      "INVALID_REQUEST",
      "人脸模板必须是归一化的 512 维向量。",
    );
    e.roster = e.roster.filter((c) => c.playerId !== playerId);
    e.roster.push({ playerId, template: structuredClone(template) });
    p.enrolled = true;
    return e.state;
  }
  start(code: string, device: string, restart = false): RoomState {
    const e = this.get(code),
      r = e.state;
    check(
      r.hostDeviceId === device,
      "NOT_AUTHORIZED",
      "只有房主可以开始或重开。",
    );
    check(
      restart ? r.kitchen.status === "finished" : r.kitchen.status === "lobby",
      "INVALID_REQUEST",
      "当前不能开始新一轮。",
    );
    check(
      r.players.length >= (r.debugMode ? 1 : 4),
      "INVALID_REQUEST",
      "正式模式需要四位厨师；测试模式可单人体验。",
    );
    check(
      r.debugMode ||
        (r.players.every((p) => p.enrolled) &&
          r.connectedDeviceIds.length === 4),
      "INVALID_REQUEST",
      "请完成四位厨师录脸并连接四台工位。",
    );
    const revision = r.kitchen.revision + 1;
    r.kitchen = newKitchen(r.players);
    r.kitchen.revision = revision;
    r.kitchen.status = "playing";
    r.kitchen.startedAt = this.clock();
    e.tickAt = this.clock();
    e.lastAction.clear();
    return r;
  }
  presence(
    code: string,
    device: string,
    playerId: string | null,
    confidence: number | null,
    evidence: Evidence,
  ): RoomState {
    const e = this.get(code),
      r = e.state,
      now = this.clock();
    check(
      ["positive-match", "lock-heartbeat", "manual-debug", "cleared"].includes(
        evidence,
      ),
      "INVALID_REQUEST",
      "无效身份依据。",
    );
    check(
      confidence === null ||
        (typeof confidence === "number" &&
          Number.isFinite(confidence) &&
          confidence >= -1 &&
          confidence <= 1),
      "INVALID_REQUEST",
      "无效识别置信度。",
    );
    if (evidence === "cleared") {
      check(playerId === null, "INVALID_REQUEST", "清除身份时不能包含玩家。");
      this.release(e, device);
      delete r.presenceByDevice[device];
      return r;
    }
    const player = r.players.find((p) => p.id === playerId);
    check(player, "PLAYER_NOT_FOUND", "未识别到房间内玩家。");
    if (evidence === "manual-debug")
      check(
        this.allowDebug && r.debugMode,
        "NOT_AUTHORIZED",
        "此房间未开启手动身份。",
      );
    else
      check(
        player.enrolled ||
          (evidence === "lock-heartbeat" &&
            r.debugMode &&
            this.allowDebug &&
            r.presenceByDevice[device]?.lockedPlayerId === playerId),
        "PLAYER_NOT_ENROLLED",
        "请先录脸。",
      );
    this.release(e, device, player.id);
    const previous = r.presenceByDevice[device];
    const fresh = evidence === "positive-match" || evidence === "manual-debug";
    const presence: DevicePresence = {
      deviceId: device,
      lockedPlayerId: player.id,
      confidence,
      evidence,
      lastHeartbeatAt: now,
      lastPositiveMatchAt: fresh
        ? now
        : (previous?.lastPositiveMatchAt ?? null),
    };
    r.presenceByDevice[device] = presence;
    const lease = r.controlLeaseByPlayer[player.id];
    if (fresh)
      r.controlLeaseByPlayer[player.id] = {
        playerId: player.id,
        deviceId: device,
        acquiredAt: lease?.deviceId === device ? lease.acquiredAt : now,
        lastHeartbeatAt: now,
      };
    else if (
      lease?.deviceId === device &&
      now - lease.lastHeartbeatAt <= PRESENCE_TTL
    )
      lease.lastHeartbeatAt = now;
    return r;
  }
  action(payload: KitchenActionPayload): RoomState {
    const e = this.get(payload.roomCode),
      r = e.state,
      now = this.clock();
    check(
      typeof payload.actionId === "string" &&
        payload.actionId.length > 0 &&
        payload.actionId.length <= 128 &&
        Number.isSafeInteger(payload.expectedRevision) &&
        payload.expectedRevision >= 0,
      "INVALID_REQUEST",
      "动作 ID 或版本号无效。",
    );
    const key = `${payload.deviceId}:${payload.actionId}`,
      fingerprint = JSON.stringify({
        station: payload.stationId,
        action: payload.action,
      });
    const cached = e.actions.get(key);
    if (cached) {
      check(
        cached === fingerprint,
        "INVALID_REQUEST",
        "同一个动作 ID 不能用于不同操作。",
      );
      return r;
    }
    check(
      r.stationByDevice[payload.deviceId] === payload.stationId,
      "INVALID_STATION",
      "电脑绑定的工位已变化。",
    );
    const presence = r.presenceByDevice[payload.deviceId];
    check(
      presence?.lockedPlayerId &&
        now - presence.lastHeartbeatAt <= PRESENCE_TTL,
      "PRESENCE_STALE",
      "身份已过期，请重新面对摄像头。",
    );
    const lease = r.controlLeaseByPlayer[presence.lockedPlayerId];
    check(
      lease?.deviceId === payload.deviceId &&
        now - lease.lastHeartbeatAt <= PRESENCE_TTL,
      "CONTROL_LEASE_MOVED",
      "这位厨师已移动到另一台电脑。",
    );
    check(
      payload.expectedRevision === r.kitchen.revision,
      "REVISION_CONFLICT",
      "厨房状态已更新，请重试。",
    );
    check(
      payload.action && typeof payload.action === "object",
      "INVALID_REQUEST",
      "厨房动作格式无效。",
    );
    const last = e.lastAction.get(payload.deviceId);
    check(
      last === undefined || now - last >= 120,
      "RATE_LIMITED",
      "操作太快，请稍候。",
    );
    applyKitchenAction(
      r.kitchen,
      presence.lockedPlayerId,
      payload.stationId,
      payload.action,
      now,
    );
    e.lastAction.set(payload.deviceId, now);
    e.actions.set(key, fingerprint);
    return r;
  }
  tick(): RoomState[] {
    const now = this.clock(),
      changed: RoomState[] = [];
    for (const [code, e] of this.entries) {
      if (e.emptyAt !== null && now - e.emptyAt > 30 * 60_000) {
        this.entries.delete(code);
        continue;
      }
      let update = advanceKitchen(e.state.kitchen, now, now - e.tickAt);
      e.tickAt = now;
      for (const [player, lease] of Object.entries(
        e.state.controlLeaseByPlayer,
      ))
        if (lease && now - lease.lastHeartbeatAt > PRESENCE_TTL) {
          delete e.state.controlLeaseByPlayer[player];
          update = true;
        }
      if (update) changed.push(e.state);
    }
    return changed;
  }
}
