import {
  IDENTITY_SWITCH_REQUIRED_MATCHES,
  PREDICTION_REQUIRED_MATCHES,
  PREDICTION_WINDOW_SIZE,
} from './config';

export interface StabilizedPrediction {
  playerId: string | null;
  changed: boolean;
}

export class PredictionStabilizer {
  private readonly predictions: Array<string | null> = [];
  private stablePlayerId: string | null = null;
  private switchCandidateId: string | null = null;
  private switchCandidateMatches = 0;

  update(playerId: string | null): StabilizedPrediction {
    const previousPlayerId = this.stablePlayerId;

    if (this.stablePlayerId) {
      if (!playerId || playerId === this.stablePlayerId) {
        this.resetSwitchCandidate();
      } else if (playerId === this.switchCandidateId) {
        this.switchCandidateMatches += 1;
      } else {
        this.switchCandidateId = playerId;
        this.switchCandidateMatches = 1;
      }

      if (
        this.switchCandidateId &&
        this.switchCandidateMatches >= IDENTITY_SWITCH_REQUIRED_MATCHES
      ) {
        this.stablePlayerId = this.switchCandidateId;
        this.resetSwitchCandidate();
      }

      return {
        playerId: this.stablePlayerId,
        changed: previousPlayerId !== this.stablePlayerId,
      };
    }

    this.predictions.push(playerId);
    if (this.predictions.length > PREDICTION_WINDOW_SIZE) {
      this.predictions.shift();
    }

    const counts = new Map<string, number>();
    for (const prediction of this.predictions) {
      if (prediction) counts.set(prediction, (counts.get(prediction) ?? 0) + 1);
    }
    let winningPlayerId: string | null = null;
    let winningCount = 0;
    for (const [candidateId, count] of counts) {
      if (count > winningCount) {
        winningPlayerId = candidateId;
        winningCount = count;
      }
    }

    if (winningPlayerId && winningCount >= PREDICTION_REQUIRED_MATCHES) {
      this.stablePlayerId = winningPlayerId;
      this.predictions.length = 0;
    }

    return {
      playerId: this.stablePlayerId,
      changed: previousPlayerId !== this.stablePlayerId,
    };
  }

  reset(): void {
    this.predictions.length = 0;
    this.stablePlayerId = null;
    this.resetSwitchCandidate();
  }

  private resetSwitchCandidate(): void {
    this.switchCandidateId = null;
    this.switchCandidateMatches = 0;
  }
}
