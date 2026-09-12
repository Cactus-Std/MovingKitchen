import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import { getGameControl, type ActionContext } from "./gameControl";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState,
  IdentityCandidate,
  CommandMeta,
  KitchenAction,
  Evidence,
} from "@kitchen/shared";
import { activeCommandErrorText, activeText } from "./i18n";
type State = {
  room: RoomState | null;
  roster: IdentityCandidate[];
  connected: boolean;
  ready: boolean;
  error: string | null;
};
let state: State = {
  room: null,
  roster: [],
  connected: false,
  ready: false,
  error: null,
};
const listeners = new Set<() => void>();
const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
export const deviceId = (() => {
  const id = sessionStorage.getItem("kitchen-device") ?? crypto.randomUUID();
  sessionStorage.setItem("kitchen-device", id);
  return id;
})();
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SERVER_URL || undefined,
  { autoConnect: false, reconnectionDelay: 500, reconnectionDelayMax: 4000 },
);
const saved = () => {
  const value = sessionStorage.getItem("kitchen-room");
  return value ? (JSON.parse(value) as { code: string }) : null;
};
function applyRoom(room: RoomState) {
  if (
    state.room?.code === room.code &&
    state.room.kitchen.revision > room.kitchen.revision
  )
    return;
  update({ room });
  sessionStorage.setItem(
    "kitchen-room",
    JSON.stringify({
      code: room.code,
    }),
  );
}
export const meta = (): CommandMeta => ({
  protocolVersion: 1,
  requestId: crypto.randomUUID(),
});
type Payload<E extends keyof ClientToServerEvents> = Parameters<
  ClientToServerEvents[E]
>[0];
type Result<E extends keyof ClientToServerEvents> = Parameters<
  Parameters<ClientToServerEvents[E]>[1]
>[0];
export async function command<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Payload<E>,
): Promise<Result<E>> {
  if (!socket.connected)
    throw new Error(
      activeText(
        "The kitchen server disconnected. Wait for it to reconnect.",
        "服务器连接已断开，请等待重新连接。",
      ),
    );
  const emit = socket.timeout(5000).emitWithAck.bind(socket) as <
    T extends keyof ClientToServerEvents,
  >(
    event: T,
    payload: Payload<T>,
  ) => Promise<Result<T>>;
  const result = await emit(event, payload);
  if (!result.ok) {
    const message = activeCommandErrorText(
      result.error.code,
      result.error.message,
    );
    update({ error: message });
    throw new Error(message);
  }
  if (result.data) applyRoom(result.data);
  return result;
}
export const roomMeta = () => {
  if (!state.room)
    throw new Error(activeText("Join a kitchen first.", "请先加入房间。"));
  return { ...meta(), roomCode: state.room.code, deviceId };
};
export async function createRoom(debugMode: boolean) {
  await command("room:create", {
    ...meta(),
    deviceId,
    debugMode,
  });
  update({ ready: true });
}
export async function joinRoom(code: string) {
  await command("room:join", {
    ...meta(),
    deviceId,
    roomCode: code.trim().toUpperCase(),
  });
  update({ ready: true });
}
export async function leaveRoom() {
  await command("room:leave", roomMeta());
  sessionStorage.removeItem("kitchen-room");
  update({ room: null, roster: [], ready: false });
}
export async function presence(
  playerId: string | null,
  evidence: Evidence,
  confidence: number | null = null,
) {
  if (state.ready)
    await command("identity:presence", {
      ...roomMeta(),
      playerId,
      evidence,
      confidence,
    });
}
export async function kitchenAction(
  action: KitchenAction,
  context: ActionContext,
  actionId: string = crypto.randomUUID(),
): Promise<void> {
  if (!state.room || !state.ready)
    throw new Error(
      activeText("Wait for the kitchen to reconnect.", "等待厨房重新连接。"),
    );
  const control = getGameControl(
    state.room,
    deviceId,
    state.room.presenceByDevice[deviceId]?.lockedPlayerId ?? null,
  );
  if (
    !control ||
    control.context.controlToken !== context.controlToken ||
    control.context.roomCode !== context.roomCode ||
    control.context.stationId !== context.stationId
  )
    throw new Error(
      activeText(
        "The chef identity or station changed. Please try the action again.",
        "控制身份或工位已变化，请重新操作。",
      ),
    );
  const payload = {
    ...meta(),
    deviceId,
    ...context,
    actionId,
    action,
  };
  // A transport timeout is uncertain: retry exactly the same action, never a new ID.
  try {
    await command("kitchen:action", payload);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "operation has timed out" &&
      socket.connected
    ) {
      await command("kitchen:action", payload);
      return;
    }
    throw error;
  }
}
socket.on("connect", () => {
  update({ connected: true, error: null });
  const previous = saved();
  if (previous)
    void joinRoom(previous.code)
      .then(() => command("state:resync", roomMeta()))
      .catch((error) => update({ ready: false, error: error.message }));
});
socket.on("disconnect", () => update({ connected: false, ready: false }));
socket.on("connect_error", () =>
  update({
    connected: false,
    ready: false,
    error: activeText(
      "Can't reach the kitchen server. Check your network connection.",
      "连接不到厨房服务器，请检查网络。",
    ),
  }),
);
socket.on("room:state", applyRoom);
socket.on("identity:roster", (roster) => update({ roster }));
export function clearError() {
  update({ error: null });
}
export function forgetRoom() {
  sessionStorage.removeItem("kitchen-room");
  update({ room: null, roster: [], ready: false, error: null });
}
export function useNetwork() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
