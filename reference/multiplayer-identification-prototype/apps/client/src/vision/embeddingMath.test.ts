import { describe, expect, it } from 'vitest';
import {
  averageEmbeddings,
  cosineSimilarity,
  normalizeEmbedding,
  selectBestFaceMatch,
} from './embeddingMath';

describe('embedding math', () => {
  it('normalizes vectors and calculates cosine similarity', () => {
    expect(normalizeEmbedding([3, 4])).toEqual([0.6, 0.8]);
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  });

  it('averages and normalizes enrollment samples', () => {
    const average = averageEmbeddings([
      [1, 0],
      [0, 1],
    ]);
    expect(average[0]).toBeCloseTo(Math.SQRT1_2);
    expect(average[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('requires both threshold and margin', () => {
    const candidates = [
      { playerId: 'jack', embedding: [1, 0] },
      { playerId: 'amy', embedding: [0.9, 0.1] },
    ];
    expect(selectBestFaceMatch([1, 0], candidates, 0.5, 0.2)).toBeNull();
    expect(selectBestFaceMatch([1, 0], candidates, 0.5, 0.05)?.playerId).toBe(
      'jack',
    );
  });
});
