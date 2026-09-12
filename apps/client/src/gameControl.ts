import {
  getCarriedItem,
  type RoomState,
  type KitchenActionPayload,
} from "@kitchen/shared";

export type ActionContext = Pick<
  KitchenActionPayload,
  "roomCode" | "stationId" | "expectedRevision" | "controlToken"
>;

export function getGameControl(
  room: RoomState | null,
  deviceId: string,
  recognizedPlayerId: string | null,
) {
  if (!room || !recognizedPlayerId) return null;
  const player = room.players.find((p) => p.id === recognizedPlayerId);
  const stationId = room.stationByDevice[deviceId];
  const presence = room.presenceByDevice[deviceId];
  const lease = room.controlLeaseByPlayer[recognizedPlayerId];
  if (
    !player ||
    !stationId ||
    presence?.lockedPlayerId !== player.id ||
    lease?.deviceId !== deviceId ||
    !lease.token
  )
    return null;
  const held = getCarriedItem(room.kitchen, player.id);
  if (room.kitchen.playerCarry[player.id] && !held) return null;
  const context: ActionContext = {
    roomCode: room.code,
    stationId,
    expectedRevision: room.kitchen.revision,
    controlToken: lease.token,
  };
  return { player, held, context };
}
