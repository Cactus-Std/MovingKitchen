import type { Hand } from "./types";
interface Track {
  id: string;
  label: string;
  palm: Hand["palm"];
  seenAt: number;
}
// Handedness is a model classification, not a unique tracking identity.
export class HandTracker {
  private tracks: Track[] = [];
  update(hands: Hand[], time: number): Hand[] {
    if (!hands.length) return [];
    const cost = (hand: Hand, track: Track) => {
      const distance = Math.hypot(
        hand.palm.x - track.palm.x,
        hand.palm.y - track.palm.y,
      );
      const recent = time - track.seenAt < 350;
      return distance + (hand.id === track.label ? 0 : recent ? 0.02 : 0.08);
    };
    const assignments: number[] = [];
    if (this.tracks.length === 2 && hands.length === 2) {
      const same =
        cost(hands[0], this.tracks[0]) + cost(hands[1], this.tracks[1]);
      const crossed =
        cost(hands[0], this.tracks[1]) + cost(hands[1], this.tracks[0]);
      assignments.push(...(same <= crossed ? [0, 1] : [1, 0]));
    } else if (this.tracks.length && hands.length === 1) {
      const first = this.tracks[0];
      const differentHand =
        this.tracks.length === 1 &&
        hands[0].id !== first.label &&
        Math.hypot(
          hands[0].palm.x - first.palm.x,
          hands[0].palm.y - first.palm.y,
        ) > 0.25;
      assignments.push(
        differentHand
          ? 1
          : this.tracks.length === 1 ||
              cost(hands[0], first) <= cost(hands[0], this.tracks[1])
            ? 0
            : 1,
      );
    } else if (this.tracks.length === 1 && hands.length === 2) {
      assignments.push(
        ...(cost(hands[0], this.tracks[0]) <= cost(hands[1], this.tracks[0])
          ? [0, 1]
          : [1, 0]),
      );
    } else hands.forEach((_, i) => assignments.push(i));
    const distinctLabels =
      hands.length === 2 &&
      new Set(hands.map((hand) => hand.id)).size === hands.length;
    return hands.map((hand, i) => {
      const index = assignments[i];
      const existing = this.tracks[index];
      const track = {
        id: existing?.id ?? `tracked-${index}`,
        label: existing && !distinctLabels ? existing.label : hand.id,
        palm: hand.palm,
        seenAt: time,
      };
      this.tracks[index] = track;
      return { ...hand, id: track.id };
    });
  }
}
