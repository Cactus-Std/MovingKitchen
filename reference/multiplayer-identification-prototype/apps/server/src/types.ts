export class RoomManagerError extends Error {
  constructor(
    public readonly code:
      | 'ROOM_NOT_FOUND'
      | 'ROOM_FULL'
      | 'COLOR_ALREADY_TAKEN'
      | 'PLAYER_NAME_TAKEN'
      | 'INVALID_ROOM_CODE'
      | 'INVALID_REQUEST'
      | 'GAME_ALREADY_STARTED'
      | 'NOT_ENOUGH_PLAYERS'
      | 'NOT_AUTHORIZED',
    message: string,
  ) {
    super(message);
    this.name = 'RoomManagerError';
  }
}
