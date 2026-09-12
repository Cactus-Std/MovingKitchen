import type { COLORS, FOODS, STATIONS, FACE_MODEL } from "./constants.js";
export type StationId = (typeof STATIONS)[number];
export type PlayerColor = (typeof COLORS)[number];
export type IngredientKind = (typeof FOODS)[number];
export type ToolKind =
  "knife" | "cloth" | "whisk" | "oven-mitt" | "pizza-cutter";
export type ItemKind = IngredientKind | ToolKind | "pizza";
export type Evidence =
  "positive-match" | "lock-heartbeat" | "manual-debug" | "cleared";
export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  enrolled: boolean;
}
export interface FaceTemplate {
  vector: number[];
  modelId: typeof FACE_MODEL.modelId;
  modelVersion: string;
  preprocessingVersion: typeof FACE_MODEL.preprocessingVersion;
}
export interface IdentityCandidate {
  playerId: string;
  template: FaceTemplate;
}
export interface Item {
  id: string;
  kind: ItemKind;
  location:
    "carried" | "sink" | "board-1" | "board-2" | "oven" | "pass" | "home";
  heldBy: string | null;
  processState: "dirty" | "clean" | "raw" | "chopped" | "cooked" | "burnt";
  cleanliness: number;
  cutProgress: number;
  hygiene: number;
  stretched: boolean;
  homeStation?: StationId;
  washedPatches: number[];
}
export interface StationState {
  occupiedItemId: string | null;
  dirty: boolean;
  lastIngredient: IngredientKind | null;
  contaminationCount: number;
}
export interface KitchenState {
  revision: number;
  status: "lobby" | "playing" | "finished";
  remainingMs: number;
  startedAt: number | null;
  finishedReason: "served" | "timeout" | "burnt" | null;
  playerCarry: Record<string, string | null>;
  items: Record<string, Item>;
  stations: Record<StationId, StationState>;
  waterRemaining: number;
  faucetOn: boolean;
  oven: {
    ingredientItemIds: Partial<Record<IngredientKind, string>>;
    pizzaItemId: string | null;
    status: "idle" | "baking" | "ready" | "burnt" | "served";
    startedAt: number | null;
    cookProgress: number;
  };
  waste: Record<IngredientKind | "total", number>;
  score: number;
}
export interface DevicePresence {
  deviceId: string;
  lockedPlayerId: string | null;
  confidence: number | null;
  evidence: Evidence;
  lastHeartbeatAt: number;
  lastPositiveMatchAt: number | null;
}
export interface ControlLease {
  playerId: string;
  deviceId: string;
  acquiredAt: number;
  lastHeartbeatAt: number;
}
export interface RoomState {
  code: string;
  hostDeviceId: string;
  players: Player[];
  connectedDeviceIds: string[];
  stationByDevice: Record<string, StationId>;
  presenceByDevice: Record<string, DevicePresence>;
  controlLeaseByPlayer: Record<string, ControlLease | undefined>;
  kitchen: KitchenState;
  createdAt: number;
  debugMode: boolean;
}
export type KitchenAction =
  | { type: "PICKUP_STORAGE"; ingredient: IngredientKind }
  | { type: "PICKUP_ITEM"; itemId: string }
  | { type: "PLACE_ITEM" }
  | { type: "RETURN_TOOL" }
  | { type: "TOGGLE_FAUCET" }
  | { type: "WASH"; itemId: string; patches: number[] }
  | { type: "CHOP" }
  | { type: "WIPE" }
  | { type: "STRETCH" }
  | { type: "DISCARD" }
  | { type: "ADD_TO_OVEN" }
  | { type: "TAKE_PIZZA" }
  | { type: "SLICE_PIZZA" };
export type ErrorCode =
  | "UNSUPPORTED_PROTOCOL"
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "PLAYER_NOT_FOUND"
  | "PLAYER_NOT_ENROLLED"
  | "NOT_AUTHORIZED"
  | "PRESENCE_STALE"
  | "CONTROL_LEASE_MOVED"
  | "REVISION_CONFLICT"
  | "ITEM_NOT_AVAILABLE"
  | "HANDS_FULL"
  | "INVALID_ITEM_STATE"
  | "INVALID_STATION"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";
export interface CommandError {
  requestId: string | null;
  code: ErrorCode;
  message: string;
  retryable: boolean;
  canonicalRevision?: number;
}
export type CommandAck<T> =
  { ok: true; data: T } | { ok: false; error: CommandError };
export interface CommandMeta {
  protocolVersion: 1;
  requestId: string;
}
export interface RoomCommand extends CommandMeta {
  roomCode: string;
  deviceId: string;
}
export interface CreateRoomPayload extends CommandMeta {
  deviceId: string;
  stationId: StationId;
  debugMode: boolean;
}
export interface JoinRoomPayload extends RoomCommand {
  stationId: StationId;
}
export interface KitchenActionPayload extends RoomCommand {
  actionId: string;
  expectedRevision: number;
  stationId: StationId;
  action: KitchenAction;
}
type Handler<P, T = RoomState> = (
  payload: P,
  ack: (result: CommandAck<T>) => void,
) => void;
export interface ClientToServerEvents {
  "room:create": Handler<CreateRoomPayload>;
  "room:join": Handler<JoinRoomPayload>;
  "room:leave": Handler<RoomCommand, null>;
  "player:add": Handler<RoomCommand & { name: string; color: PlayerColor }>;
  "player:enroll": Handler<
    RoomCommand & { playerId: string; template: FaceTemplate }
  >;
  "game:start": Handler<RoomCommand>;
  "game:restart": Handler<RoomCommand>;
  "station:select": Handler<RoomCommand & { stationId: StationId }>;
  "identity:presence": Handler<
    RoomCommand & {
      playerId: string | null;
      confidence: number | null;
      evidence: Evidence;
    }
  >;
  "kitchen:action": Handler<KitchenActionPayload>;
  "state:resync": Handler<RoomCommand>;
}
export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "identity:roster": (roster: IdentityCandidate[]) => void;
}
export interface SocketData {
  roomCode?: string;
  deviceId?: string;
}
