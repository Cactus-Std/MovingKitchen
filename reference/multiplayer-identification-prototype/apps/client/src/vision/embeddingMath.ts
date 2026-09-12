import { FACE_MATCH_MARGIN, FACE_MATCH_THRESHOLD } from './config';

export interface FaceCandidate {
  playerId: string;
  embedding: number[];
}

export interface FaceMatch {
  playerId: string;
  similarity: number;
  secondBestPlayerId: string | null;
  secondBestSimilarity: number | null;
}

export function normalizeEmbedding(embedding: readonly number[]): number[] {
  const magnitude = Math.sqrt(
    embedding.reduce((sum, value) => sum + value * value, 0),
  );
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error('Cannot normalize an empty or zero embedding.');
  }
  return embedding.map((value) => value / magnitude);
}

export function averageEmbeddings(embeddings: readonly number[][]): number[] {
  const dimension = embeddings[0]?.length ?? 0;
  if (
    embeddings.length === 0 ||
    dimension === 0 ||
    embeddings.some((embedding) => embedding.length !== dimension)
  ) {
    throw new Error('Embeddings must have matching non-zero dimensions.');
  }

  const average = new Array<number>(dimension).fill(0);
  for (const embedding of embeddings) {
    for (let index = 0; index < dimension; index += 1) {
      average[index] = (average[index] ?? 0) + (embedding[index] ?? 0);
    }
  }
  return normalizeEmbedding(average.map((value) => value / embeddings.length));
}

export function cosineSimilarity(
  first: readonly number[],
  second: readonly number[],
): number {
  if (first.length === 0 || first.length !== second.length) {
    throw new Error('Embeddings must have equal non-zero dimensions.');
  }
  let dot = 0;
  for (let index = 0; index < first.length; index += 1) {
    dot += (first[index] ?? 0) * (second[index] ?? 0);
  }
  return dot;
}

export function selectBestFaceMatch(
  embedding: readonly number[],
  candidates: readonly FaceCandidate[],
  threshold = FACE_MATCH_THRESHOLD,
  margin = FACE_MATCH_MARGIN,
): FaceMatch | null {
  let best: FaceCandidate | null = null;
  let bestSimilarity = Number.NEGATIVE_INFINITY;
  let secondBest: FaceCandidate | null = null;
  let secondBestSimilarity = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.embedding.length !== embedding.length) continue;
    const similarity = cosineSimilarity(embedding, candidate.embedding);
    if (similarity > bestSimilarity) {
      secondBest = best;
      secondBestSimilarity = bestSimilarity;
      best = candidate;
      bestSimilarity = similarity;
    } else if (similarity > secondBestSimilarity) {
      secondBest = candidate;
      secondBestSimilarity = similarity;
    }
  }

  const hasRequiredMargin =
    secondBest === null || bestSimilarity - secondBestSimilarity >= margin;
  if (!best || bestSimilarity < threshold || !hasRequiredMargin) return null;

  return {
    playerId: best.playerId,
    similarity: bestSimilarity,
    secondBestPlayerId: secondBest?.playerId ?? null,
    secondBestSimilarity: secondBest ? secondBestSimilarity : null,
  };
}
