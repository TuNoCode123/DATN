import { PartialSnapshot, TokenEvolution } from './types';

export class StableTokenTracker {
  private snapshots: PartialSnapshot[] = [];
  private tokenHistory: Map<string, TokenEvolution> = new Map();
  private readonly STABILITY_THRESHOLD = 3;

  addPartial(snapshot: PartialSnapshot): void {
    this.snapshots.push(snapshot);
    const idx = snapshot.snapshotIndex;

    for (let pos = 0; pos < snapshot.words.length; pos++) {
      const word = snapshot.words[pos];
      if (word.type === 'punctuation') continue;

      const key = `${pos}:${word.content.toLowerCase()}`;

      if (this.tokenHistory.has(key)) {
        const evolution = this.tokenHistory.get(key)!;
        evolution.lastSeenAt = idx;
        evolution.consecutiveCount++;
        evolution.startTime = word.startTime;
        evolution.endTime = word.endTime;

        if (
          evolution.consecutiveCount >= this.STABILITY_THRESHOLD &&
          !evolution.isStable
        ) {
          evolution.isStable = true;
          evolution.stableSince = idx;
        }
      } else {
        const prevAtPos = this.findLatestAtPosition(pos);
        const variants = prevAtPos
          ? [...prevAtPos.variants, word.content]
          : [word.content];

        this.tokenHistory.set(key, {
          token: word.content,
          positionIndex: pos,
          firstSeenAt: idx,
          lastSeenAt: idx,
          stableSince: null,
          isStable: false,
          consecutiveCount: 1,
          confidence: word.confidence || 0,
          startTime: word.startTime,
          endTime: word.endTime,
          variants,
          wasAutoCorrected: false,
        });
      }
    }
  }

  addFinal(result: PartialSnapshot): void {
    for (let pos = 0; pos < result.words.length; pos++) {
      const word = result.words[pos];
      if (word.type === 'punctuation') continue;

      const finalWord = word.content.toLowerCase();
      const stableAtPos = this.getStableTokenAtPosition(pos);
      const latestAtPos = this.findLatestAtPosition(pos);

      if (stableAtPos && stableAtPos.token.toLowerCase() !== finalWord) {
        stableAtPos.wasAutoCorrected = true;
        stableAtPos.variants.push(`[final:${finalWord}]`);
        stableAtPos.confidence = word.confidence;
      } else if (stableAtPos) {
        stableAtPos.confidence = word.confidence;
      } else if (latestAtPos && latestAtPos.token.toLowerCase() !== finalWord) {
        // Non-stable token at this position differs from final — auto-corrected
        latestAtPos.wasAutoCorrected = true;
        latestAtPos.variants.push(`[final:${finalWord}]`);
        latestAtPos.confidence = word.confidence;
      } else if (!latestAtPos) {
        // Word wasn't tracked in any partial — add it from the final result
        const key = `${pos}:${finalWord}`;
        this.tokenHistory.set(key, {
          token: word.content,
          positionIndex: pos,
          firstSeenAt: result.snapshotIndex,
          lastSeenAt: result.snapshotIndex,
          stableSince: result.snapshotIndex,
          isStable: true,
          consecutiveCount: this.STABILITY_THRESHOLD,
          confidence: word.confidence,
          startTime: word.startTime,
          endTime: word.endTime,
          variants: [word.content],
          wasAutoCorrected: false,
        });
      }
    }
  }

  finalize(): TokenEvolution[] {
    const maxPosition = this.getMaxPosition();
    const result: TokenEvolution[] = [];

    for (let pos = 0; pos <= maxPosition; pos++) {
      const stable = this.getStableTokenAtPosition(pos);
      if (stable) {
        result.push(stable);
      } else {
        const latest = this.findLatestAtPosition(pos);
        if (latest) {
          latest.isStable = false;
          latest.confidence *= 0.7;
          result.push(latest);
        }
      }
    }

    return result;
  }

  private getStableTokenAtPosition(pos: number): TokenEvolution | null {
    for (const [, evolution] of this.tokenHistory) {
      if (evolution.positionIndex === pos && evolution.isStable) {
        return evolution;
      }
    }
    return null;
  }

  private findLatestAtPosition(pos: number): TokenEvolution | null {
    let latest: TokenEvolution | null = null;
    for (const [, evolution] of this.tokenHistory) {
      if (evolution.positionIndex === pos) {
        if (!latest || evolution.lastSeenAt > latest.lastSeenAt) {
          latest = evolution;
        }
      }
    }
    return latest;
  }

  private getMaxPosition(): number {
    let max = 0;
    for (const [, evolution] of this.tokenHistory) {
      max = Math.max(max, evolution.positionIndex);
    }
    return max;
  }
}
