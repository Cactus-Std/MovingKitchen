import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants.js';

export function generateRoomCode(random = Math.random): string {
  let roomCode = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const alphabetIndex = Math.floor(random() * ROOM_CODE_ALPHABET.length);
    roomCode += ROOM_CODE_ALPHABET[alphabetIndex] ?? ROOM_CODE_ALPHABET[0];
  }
  return roomCode;
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidRoomCode(value: string): boolean {
  const normalized = normalizeRoomCode(value);
  return (
    normalized.length === ROOM_CODE_LENGTH &&
    [...normalized].every((character) => ROOM_CODE_ALPHABET.includes(character))
  );
}
