import { describe, expect, it } from 'vitest';
import { PredictionStabilizer } from './predictionStabilizer';

describe('PredictionStabilizer', () => {
  it('requires four matching predictions in a five-item window', () => {
    const stabilizer = new PredictionStabilizer();
    stabilizer.update('jack');
    stabilizer.update('jack');
    stabilizer.update(null);
    stabilizer.update('jack');
    expect(stabilizer.update('jack')).toEqual({
      playerId: 'jack',
      changed: true,
    });
  });

  it('keeps a locked identity through missed detections', () => {
    const stabilizer = new PredictionStabilizer();
    for (let index = 0; index < 4; index += 1) stabilizer.update('jack');
    for (let index = 0; index < 20; index += 1) {
      expect(stabilizer.update(null)).toEqual({
        playerId: 'jack',
        changed: false,
      });
    }
  });

  it('switches only after five consecutive matches for another player', () => {
    const stabilizer = new PredictionStabilizer();
    for (let index = 0; index < 4; index += 1) stabilizer.update('jack');
    for (let index = 0; index < 4; index += 1) {
      expect(stabilizer.update('amy')).toEqual({
        playerId: 'jack',
        changed: false,
      });
    }
    expect(stabilizer.update('amy')).toEqual({
      playerId: 'amy',
      changed: true,
    });
  });

  it('resets switch evidence after a miss or the locked player returns', () => {
    const stabilizer = new PredictionStabilizer();
    for (let index = 0; index < 4; index += 1) stabilizer.update('jack');
    for (let index = 0; index < 4; index += 1) stabilizer.update('amy');
    stabilizer.update(null);
    for (let index = 0; index < 4; index += 1) stabilizer.update('amy');
    stabilizer.update('jack');
    expect(stabilizer.update('amy')).toEqual({
      playerId: 'jack',
      changed: false,
    });
  });

  it('clears the lock only when explicitly reset', () => {
    const stabilizer = new PredictionStabilizer();
    for (let index = 0; index < 4; index += 1) stabilizer.update('jack');
    stabilizer.reset();
    expect(stabilizer.update(null)).toEqual({
      playerId: null,
      changed: false,
    });
  });
});
