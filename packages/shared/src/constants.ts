export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
export const STATIONS = [
  "storage-sink",
  "board-1",
  "board-2",
  "oven-pass",
] as const;
export const COLORS = ["red", "blue", "green", "yellow"] as const;
export const FOODS = ["tomato", "sausage", "cheese", "dough"] as const;
export const GAME_MS = 300_000;
export const BAKE_MS = 20_000;
export const BURN_MS = 35_000;
export const PRESENCE_TTL = 3500;
export const FACE_MODEL = {
  modelId: "facex-tiny-mobilefacenet",
  modelVersion: "facex-tiny-v1",
  preprocessingVersion: "rgb-112-nchw-v1",
} as const;
