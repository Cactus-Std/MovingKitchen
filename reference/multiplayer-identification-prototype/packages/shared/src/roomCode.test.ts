import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
} from './index.js';

describe('room codes', () => {
  it('generates four-character codes from the safe alphabet', () => {
    const code = generateRoomCode(() => 0.5);
    expect(code).toHaveLength(4);
    expect(
      [...code].every((character) => ROOM_CODE_ALPHABET.includes(character)),
    ).toBe(true);
  });

  it('normalizes user input before validation', () => {
    expect(normalizeRoomCode(' ab23 ')).toBe('AB23');
    expect(isValidRoomCode(' ab23 ')).toBe(true);
    expect(isValidRoomCode('OI10')).toBe(false);
  });
});
