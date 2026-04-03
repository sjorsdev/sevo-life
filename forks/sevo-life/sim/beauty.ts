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

// Complexity (25%) — combines trail intensity entropy + spatial variation
function complexityScore(grid: Cell[][]): number {
  const h = grid.length;
  const w = grid[0].length;

  // Part A: Entropy of trail intensities (only cells WITH trails)
  const bins = [0, 0, 0, 0, 0];
  let trailCells = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x].trail > 0.02) {
        const bin = Math.min(4, Math.floor(grid[y][x].trail * 5));
        bins[bin]++;
        trailCells++;
      }
    }
  }

  let intensityEntropy = 0;
  if (trailCells > 0) {
    for (const count of bins) {
      if (count > 0) {
        const p = count / trailCells;
        intensityEntropy -= p * Math.log2(p);
      }
    }
    intensityEntropy /= Math.log2(bins.length);
  }

  // Part B: Spatial variation — how much does trail intensity change between neighbors?
  let spatialDiff = 0;
  let spatialCount = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const here = grid[y][x].trail;
      const right = grid[y][x + 1].trail;
      const below = grid[y + 1][x].trail;
      if (here > 0.02 || right > 0.02) {
        spatialDiff += Math.abs(here - right);
        spatialCount++;
      }
      if (here > 0.02 || below > 0.02) {
        spatialDiff += Math.abs(here - below);
        spatialCount++;
      }
    }
  }
  const spatialVariation = spatialCount > 0 ? Math.min(1, spatialDiff / spatialCount * 3) : 0;

  // Blend: 60% intensity entropy + 40% spatial variation
  return 0.6 * intensityEntropy + 0.4 * spatialVariation;
}

// Rhythm (20%) — regularity of trail patterns in both directions + intensity periodicity
function rhythmScore(grid: Cell[][]): number {
  const h = grid.length;
  const w = grid[0].length;

  function measureGapRegularity(gaps: number[]): number {
    if (gaps.length < 2) return 0;
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    return Math.max(0, 1 - cv);
  }

  // Part A: Horizontal gap regularity
  const hGaps: number[] = [];
  for (let y = 0; y < h; y += 2) {
    let inTrail = false;
    let gapLen = 0;
    for (let x = 0; x < w; x++) {
      const hasTrail = grid[y][x].trail > 0.1;
      if (hasTrail && !inTrail) {
        if (gapLen > 0) hGaps.push(gapLen);
        gapLen = 0;
        inTrail = true;
      } else if (!hasTrail) {
        gapLen++;
        inTrail = false;
      }
    }
  }

  // Part B: Vertical gap regularity
  const vGaps: number[] = [];
  for (let x = 0; x < w; x += 2) {
    let inTrail = false;
    let gapLen = 0;
    for (let y = 0; y < h; y++) {
      const hasTrail = grid[y][x].trail > 0.1;
      if (hasTrail && !inTrail) {
        if (gapLen > 0) vGaps.push(gapLen);
        gapLen = 0;
        inTrail = true;
      } else if (!hasTrail) {
        gapLen++;
        inTrail = false;
      }
    }
  }

  // Part C: Intensity periodicity — autocorrelation of trail intensities along rows
  let periodicityScore = 0;
  let rowCount = 0;
  for (let y = 0; y < h; y += 4) {
    const intensities = Array.from({ length: w }, (_, x) => grid[y][x].trail);
    const trailCount = intensities.filter((v) => v > 0.05).length;
    if (trailCount < 5) continue;

    // Check autocorrelation at different lags
    let bestCorr = 0;
    for (let lag = 3; lag <= 12; lag++) {
      let sum = 0;
      let count = 0;
      for (let x = 0; x < w - lag; x++) {
        sum += intensities[x] * intensities[x + lag];
        count++;
      }
      const corr = count > 0 ? sum / count : 0;
      bestCorr = Math.max(bestCorr, corr);
    }
    periodicityScore += Math.min(1, bestCorr * 5);
    rowCount++;
  }
  periodicityScore = rowCount > 0 ? periodicityScore / rowCount : 0;

  const hRhythm = measureGapRegularity(hGaps);
  const vRhythm = measureGapRegularity(vGaps);

  // Blend: 35% horizontal + 35% vertical + 30% periodicity
  return 0.35 * hRhythm + 0.35 * vRhythm + 0.30 * periodicityScore;
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
