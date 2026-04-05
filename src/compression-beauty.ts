// src/compression-beauty.ts — Beauty as compression progress (Schmidhuber 2009)
//
// Core idea: beauty = rate of compression improvement.
// Something is beautiful when you're LEARNING to compress it better.
// Not static beauty — dynamic beauty. The change in predictability.
//
// Implementation: track how compressible the simulation state is over time.
// When compressibility improves (we discover new patterns), that's beauty.
//
// Also includes Birkhoff's M = O/C as a static component.
// Combined: beauty = static_order + dynamic_compression_progress

/** State snapshot for compression tracking */
export interface StateSnapshot {
  tick: number;
  entropy: number;        // Shannon entropy (complexity)
  structure: number;      // spatial autocorrelation (order)
  uniquePatterns: number; // count of distinct local patterns
  compressibility: number;// how much the state compresses (order/complexity)
}

/** Compression progress tracker — the beauty engine */
export class BeautyEngine {
  history: StateSnapshot[] = [];
  private windowSize = 20;

  /** Record a new state snapshot */
  record(tick: number, entropy: number, structure: number, uniquePatterns: number): void {
    const compressibility = entropy > 0.01 ? structure / entropy : 0;
    this.history.push({ tick, entropy, structure, uniquePatterns, compressibility });

    // Keep bounded history
    if (this.history.length > 200) {
      this.history = this.history.slice(-200);
    }
  }

  /**
   * Schmidhuber's compression progress:
   * How much has compressibility IMPROVED recently?
   * Positive = we're discovering new patterns = beautiful
   * Zero = nothing new = boring
   * Negative = becoming more random = ugly
   */
  compressionProgress(): number {
    if (this.history.length < this.windowSize * 2) return 0;

    const recent = this.history.slice(-this.windowSize);
    const older = this.history.slice(-this.windowSize * 2, -this.windowSize);

    const recentAvg = recent.reduce((s, h) => s + h.compressibility, 0) / recent.length;
    const olderAvg = older.reduce((s, h) => s + h.compressibility, 0) / older.length;

    // Compression progress = improvement in compressibility
    return recentAvg - olderAvg;
  }

  /**
   * Birkhoff's aesthetic measure: M = O/C
   * Order (O) = spatial structure / autocorrelation
   * Complexity (C) = Shannon entropy
   * Beautiful things have high order relative to their complexity.
   */
  birkhoffMeasure(): number {
    if (this.history.length === 0) return 0;
    const latest = this.history[this.history.length - 1];
    return latest.compressibility; // O/C
  }

  /**
   * Novelty: how different is the current state from what we've seen?
   * Based on unique pattern count change rate.
   */
  novelty(): number {
    if (this.history.length < 10) return 0;
    const recent = this.history.slice(-5);
    const older = this.history.slice(-10, -5);

    const recentPatterns = recent.reduce((s, h) => s + h.uniquePatterns, 0) / recent.length;
    const olderPatterns = older.reduce((s, h) => s + h.uniquePatterns, 0) / older.length;

    // New patterns appearing = novel
    return Math.max(0, (recentPatterns - olderPatterns) / Math.max(olderPatterns, 1));
  }

  /**
   * Combined beauty score using all three theories:
   * - Schmidhuber: compression progress (dynamic, learning-based)
   * - Birkhoff: order/complexity ratio (static, structural)
   * - Novelty: how new is this? (exploration-based)
   *
   * beauty = 0.4 * compression_progress + 0.3 * birkhoff + 0.3 * novelty
   */
  beauty(): {
    total: number;
    compressionProgress: number;
    birkhoff: number;
    novelty: number;
    entropy: number;
    structure: number;
  } {
    const cp = this.compressionProgress();
    const bm = this.birkhoffMeasure();
    const nv = this.novelty();

    // Normalize compression progress to 0-1 range
    const cpNorm = Math.max(0, Math.min(1, cp * 10 + 0.5));
    // Birkhoff is already roughly 0-1
    const bmNorm = Math.min(1, bm);
    // Novelty normalized
    const nvNorm = Math.min(1, nv);

    const total = 0.4 * cpNorm + 0.3 * bmNorm + 0.3 * nvNorm;

    const latest = this.history[this.history.length - 1];
    return {
      total,
      compressionProgress: cpNorm,
      birkhoff: bmNorm,
      novelty: nvNorm,
      entropy: latest?.entropy ?? 0,
      structure: latest?.structure ?? 0,
    };
  }
}

// -----------------------------------------------------------------------
// Helper: count unique local patterns in a 2D field
// (Approximation using hash of 3x3 neighborhoods)
// -----------------------------------------------------------------------
export function countUniquePatterns(
  field: Float64Array,
  width: number,
  height: number,
  resolution = 5, // quantize values to this many levels
): number {
  const patterns = new Set<string>();

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      // 3x3 neighborhood quantized
      let hash = "";
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const val = field[(y + dy) * width + (x + dx)];
          hash += Math.floor(val * resolution);
        }
      }
      patterns.add(hash);
    }
  }

  return patterns.size;
}
