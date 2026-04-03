// sim/beauty.ts — Algorithmic beauty scorer for sevo-life
// Pure math, no LLM, fully deterministic

import type { BeautyMetrics, Cell } from "./types.ts";

// Symmetry (25%) — how symmetric are trail patterns?
function symmetryScore(grid: Cell[][]): number {
  const h = grid.length;
  const w = grid[0].length;
  let matches = 0;
  let total = 0;

  // Horizontal symmetry
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < Math.floor(w / 2); x++) {
      const left = grid[y][x].trail;
      const right = grid[y][w - 1 - x].trail;
      const bothPresent = left > 0.1 || right > 0.1;
      if (bothPresent) {
        total++;
        if (Math.abs(left - right) < 0.3) matches++;
      }
    }
  }

  // Vertical symmetry
  for (let y = 0; y < Math.floor(h / 2); y++) {
    for (let x = 0; x < w; x++) {
      const top = grid[y][x].trail;
      const bottom = grid[h - 1 - y][x].trail;
      const bothPresent = top > 0.1 || bottom > 0.1;
      if (bothPresent) {
        total++;
        if (Math.abs(top - bottom) < 0.3) matches++;
      }
    }
  }

  return total > 0 ? matches / total : 0;
}

// Complexity (25%) — entropy of trail pattern distribution
function complexityScore(grid: Cell[][]): number {
  const h = grid.length;
  const w = grid[0].length;

  // Quantize trail intensities into 5 bins
  const bins = [0, 0, 0, 0, 0];
  let totalCells = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bin = Math.min(4, Math.floor(grid[y][x].trail * 5));
      bins[bin]++;
      totalCells++;
    }
  }

  // Shannon entropy normalized to 0-1
  let entropy = 0;
  for (const count of bins) {
    if (count > 0) {
      const p = count / totalCells;
      entropy -= p * Math.log2(p);
    }
  }
  const maxEntropy = Math.log2(bins.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

// Rhythm (20%) — regularity of spacing between trail clusters
function rhythmScore(grid: Cell[][]): number {
  const h = grid.length;
  const w = grid[0].length;

  // Sample row-by-row: find gaps between trail segments
  const gaps: number[] = [];
  for (let y = 0; y < h; y += 3) {
    let inTrail = false;
    let gapLen = 0;
    for (let x = 0; x < w; x++) {
      const hasTrail = grid[y][x].trail > 0.15;
      if (hasTrail && !inTrail) {
        if (gapLen > 0) gaps.push(gapLen);
        gapLen = 0;
        inTrail = true;
      } else if (!hasTrail) {
        gapLen++;
        inTrail = false;
      }
    }
  }

  if (gaps.length < 2) return 0;

  // Regularity: low variance in gap lengths = rhythmic
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;

  // cv near 0 = perfect rhythm, cv > 1 = chaotic
  return Math.max(0, 1 - cv);
}

// Color harmony (15%) — how well do trail colors complement each other?
function colorHarmonyScore(grid: Cell[][]): number {
  const h = grid.length;
  const w = grid[0].length;

  // Count color usage (only where trails exist)
  const colorCounts = [0, 0, 0, 0, 0, 0];
  let totalTrails = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x].trail > 0.1) {
        const c = Math.min(5, Math.max(0, Math.floor(grid[y][x].trailColor)));
        colorCounts[c]++;
        totalTrails++;
      }
    }
  }

  if (totalTrails === 0) return 0;

  // Harmony: complementary colors (distance 3 on 6-hue wheel) score highest
  // Analogous (distance 1) score medium, same color scores low
  const usedColors = colorCounts
    .map((count, i) => ({ color: i, ratio: count / totalTrails }))
    .filter((c) => c.ratio > 0.05);

  if (usedColors.length <= 1) return 0.2; // monochrome = low harmony

  let harmonySum = 0;
  let pairs = 0;
  for (let i = 0; i < usedColors.length; i++) {
    for (let j = i + 1; j < usedColors.length; j++) {
      const dist = Math.min(
        Math.abs(usedColors[i].color - usedColors[j].color),
        6 - Math.abs(usedColors[i].color - usedColors[j].color),
      );
      // Distance 3 = complementary (1.0), distance 2 = triadic (0.8), distance 1 = analogous (0.5)
      harmonySum += dist === 3 ? 1.0 : dist === 2 ? 0.8 : 0.5;
      pairs++;
    }
  }

  return pairs > 0 ? harmonySum / pairs : 0;
}

// Coverage (15%) — what fraction of the world has trail activity?
function coverageScore(grid: Cell[][]): number {
  const h = grid.length;
  const w = grid[0].length;
  let trailCells = 0;
  const totalCells = h * w;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x].trail > 0.05) trailCells++;
    }
  }

  // Optimal coverage is around 30-60% — too sparse or too full isn't beautiful
  const ratio = trailCells / totalCells;
  if (ratio < 0.1) return ratio * 5; // ramp up to 0.5 at 10%
  if (ratio > 0.7) return Math.max(0, 1 - (ratio - 0.7) * 3); // ramp down after 70%
  return 0.5 + (ratio - 0.1) * (0.5 / 0.6); // linear 0.5 to 1.0 in sweet spot
}

export function scoreBeauty(grid: Cell[][]): BeautyMetrics {
  const symmetry = symmetryScore(grid);
  const complexity = complexityScore(grid);
  const rhythm = rhythmScore(grid);
  const colorHarmony = colorHarmonyScore(grid);
  const coverage = coverageScore(grid);

  const total =
    symmetry * 0.25 +
    complexity * 0.25 +
    rhythm * 0.20 +
    colorHarmony * 0.15 +
    coverage * 0.15;

  return { symmetry, complexity, rhythm, colorHarmony, coverage, total };
}
