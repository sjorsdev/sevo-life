// src/sim-beauty.ts — Beauty scoring for particle-based organisms
//
// Key principle: beauty must be HARD to achieve. If everything scores 0.8,
// the metric is broken. These metrics reward emergence and organic form,
// not trivial arrangements.

import type { Organism, World, V2 } from "./sim.ts";
import { v2 } from "./sim.ts";

export interface BeautyScore {
  // Per-organism
  formBeauty: number;        // shape quality: organic, not blobby
  symmetryQuality: number;   // imperfect symmetry > perfect symmetry
  proportionHarmony: number; // golden-ratio relationships between parts
  colorCoherence: number;    // colors tell a story, not random

  // Ecosystem
  diversityOfForms: number;  // organisms look different from each other
  spatialComposition: number;// how the whole scene is composed
  motionGrace: number;       // smooth, purposeful movement

  total: number;
}

/** Score a single organism's form beauty */
function scoreForm(org: Organism): number {
  const n = org.particles.length;
  if (n < 3) return 0; // too simple to be beautiful

  // Organic shape: variance of distances from center
  // A circle has 0 variance (boring). A complex form has moderate variance.
  const center = org.particles.reduce(
    (s, p) => v2.add(s, p.pos),
    { x: 0, y: 0 },
  );
  const c = v2.scale(center, 1 / n);
  const dists = org.particles.map(p => v2.dist(p.pos, c));
  const avgDist = dists.reduce((a, b) => a + b, 0) / n;
  const variance = dists.reduce((s, d) => s + (d - avgDist) ** 2, 0) / n;
  const cv = avgDist > 0 ? Math.sqrt(variance) / avgDist : 0;
  // Sweet spot: cv between 0.3 and 0.8 is interesting form
  const formScore = cv < 0.1 ? cv * 3 : cv > 1.2 ? Math.max(0, 1.5 - cv) : Math.min(1, 0.3 + cv * 0.7);

  // Type diversity — using multiple particle types
  const types = new Set(org.particles.map(p => p.type));
  const typeDiversity = Math.min(1, (types.size - 1) / 4); // -1 because core is free

  // Size matters — tiny organisms aren't impressive
  const sizeFactor = Math.min(1, n / (org.genome.maxParticles * 0.6));

  return formScore * 0.4 + typeDiversity * 0.3 + sizeFactor * 0.3;
}

/** Score symmetry quality — imperfect > perfect */
function scoreSymmetry(org: Organism): number {
  if (org.particles.length < 4) return 0;

  const center = org.particles.reduce((s, p) => v2.add(s, p.pos), { x: 0, y: 0 });
  const c = v2.scale(center, 1 / org.particles.length);

  // Check bilateral symmetry by comparing left vs right particles
  const left = org.particles.filter(p => p.pos.x < c.x);
  const right = org.particles.filter(p => p.pos.x >= c.x);

  if (left.length === 0 || right.length === 0) return 0.1;

  // For each left particle, find closest right mirror
  let matchScore = 0;
  for (const lp of left) {
    const mirrorX = 2 * c.x - lp.pos.x;
    const mirrorY = lp.pos.y;
    let bestDist = Infinity;
    for (const rp of right) {
      const d = Math.sqrt((rp.pos.x - mirrorX) ** 2 + (rp.pos.y - mirrorY) ** 2);
      bestDist = Math.min(bestDist, d);
    }
    // Imperfect symmetry: close but not exact is most beautiful
    // Perfect mirror (dist=0) scores 0.7. Slight asymmetry (dist=5-15) scores 1.0.
    if (bestDist < 2) matchScore += 0.7;
    else if (bestDist < 20) matchScore += Math.min(1, 0.7 + bestDist * 0.02);
    else matchScore += Math.max(0, 0.5 - bestDist * 0.005);
  }

  return Math.min(1, matchScore / left.length);
}

/** Score proportions — golden ratio relationships */
function scoreProportion(org: Organism): number {
  if (org.particles.length < 4) return 0;

  const center = org.particles.reduce((s, p) => v2.add(s, p.pos), { x: 0, y: 0 });
  const c = v2.scale(center, 1 / org.particles.length);

  // Bounding dimensions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of org.particles) {
    minX = Math.min(minX, p.pos.x); maxX = Math.max(maxX, p.pos.x);
    minY = Math.min(minY, p.pos.y); maxY = Math.max(maxY, p.pos.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 1 || h < 1) return 0;

  const ratio = Math.max(w, h) / Math.min(w, h);
  const PHI = 1.618;

  // Score proximity to golden ratio or its powers
  const targets = [PHI, PHI * PHI, 1 / PHI, 1, 2];
  let bestDist = Infinity;
  for (const t of targets) {
    bestDist = Math.min(bestDist, Math.abs(ratio - t));
  }

  return Math.max(0, 1 - bestDist * 0.5);
}

/** Score color coherence */
function scoreColor(org: Organism): number {
  if (org.particles.length < 2) return 0;

  // Color should vary but not randomly — adjacent particles should have related colors
  let coherence = 0;
  let pairs = 0;
  for (const spring of org.springs) {
    const a = org.particles[spring.a];
    const b = org.particles[spring.b];
    const colorDist = Math.sqrt(
      (a.color[0] - b.color[0]) ** 2 +
      (a.color[1] - b.color[1]) ** 2 +
      (a.color[2] - b.color[2]) ** 2,
    );
    // Some variation is good (not all same color), but not random
    // Sweet spot: colorDist between 30-150
    if (colorDist < 10) coherence += 0.5; // too uniform
    else if (colorDist < 150) coherence += 0.8 + 0.2 * (colorDist / 150);
    else coherence += Math.max(0.2, 1 - (colorDist - 150) / 300);
    pairs++;
  }

  return pairs > 0 ? coherence / pairs : 0;
}

/** Score diversity of forms across all organisms */
function scoreDiversity(organisms: Organism[]): number {
  const alive = organisms.filter(o => o.alive && o.particles.length > 2);
  if (alive.length < 2) return 0;

  let totalDiff = 0;
  let pairs = 0;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      // Size difference
      const sizeDiff = Math.abs(a.particles.length - b.particles.length) /
        Math.max(a.particles.length, b.particles.length);
      // Type composition difference
      const typesA = new Map<string, number>();
      const typesB = new Map<string, number>();
      for (const p of a.particles) typesA.set(p.type, (typesA.get(p.type) ?? 0) + 1);
      for (const p of b.particles) typesB.set(p.type, (typesB.get(p.type) ?? 0) + 1);
      const allTypes = new Set([...typesA.keys(), ...typesB.keys()]);
      let typeDiff = 0;
      for (const t of allTypes) {
        const ra = (typesA.get(t) ?? 0) / a.particles.length;
        const rb = (typesB.get(t) ?? 0) / b.particles.length;
        typeDiff += Math.abs(ra - rb);
      }
      totalDiff += sizeDiff * 0.4 + typeDiff * 0.6;
      pairs++;
    }
  }

  return pairs > 0 ? Math.min(1, totalDiff / pairs) : 0;
}

/** Score spatial composition — how organisms are arranged in the world */
function scoreComposition(world: World): number {
  const alive = world.organisms.filter(o => o.alive && o.particles.length > 2);
  if (alive.length < 2) return 0.1;

  const centers = alive.map(o => world.getCenter(o));

  // Not too clustered, not too spread
  let totalDist = 0;
  let pairs = 0;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      totalDist += v2.dist(centers[i], centers[j]);
      pairs++;
    }
  }
  const avgDist = pairs > 0 ? totalDist / pairs : 0;
  const idealDist = Math.sqrt(world.config.width * world.config.height) / (alive.length + 1);

  // Score how close average distance is to ideal
  const distRatio = avgDist / Math.max(idealDist, 1);
  const spacingScore = distRatio > 0.5 && distRatio < 2 ? 1 - Math.abs(1 - distRatio) * 0.5 : 0.3;

  return spacingScore;
}

/** Score motion grace — smooth, purposeful movement */
function scoreMotion(world: World): number {
  const alive = world.organisms.filter(o => o.alive);
  if (alive.length === 0) return 0;

  let graceSum = 0;
  for (const org of alive) {
    // Speed consistency — all particles moving at similar speeds
    const speeds = org.particles.map(p => v2.len(p.vel));
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    if (avgSpeed < 0.01) { graceSum += 0.2; continue; } // stationary is ok but not graceful

    const speedVariance = speeds.reduce((s, v) => s + (v - avgSpeed) ** 2, 0) / speeds.length;
    const speedCv = Math.sqrt(speedVariance) / avgSpeed;

    // Low variance = coordinated movement = graceful
    const coordination = Math.max(0, 1 - speedCv);

    // Not too fast, not too slow
    const speedScore = avgSpeed > 0.1 && avgSpeed < 3 ? 1 : 0.3;

    graceSum += coordination * 0.6 + speedScore * 0.4;
  }

  return graceSum / alive.length;
}

/** Score the beauty of the whole world */
export function scoreWorldBeauty(world: World): BeautyScore {
  const alive = world.organisms.filter(o => o.alive && o.particles.length > 2);

  if (alive.length === 0) {
    return { formBeauty: 0, symmetryQuality: 0, proportionHarmony: 0, colorCoherence: 0,
      diversityOfForms: 0, spatialComposition: 0, motionGrace: 0, total: 0 };
  }

  // Per-organism metrics (averaged)
  const formBeauty = alive.reduce((s, o) => s + scoreForm(o), 0) / alive.length;
  const symmetryQuality = alive.reduce((s, o) => s + scoreSymmetry(o), 0) / alive.length;
  const proportionHarmony = alive.reduce((s, o) => s + scoreProportion(o), 0) / alive.length;
  const colorCoherence = alive.reduce((s, o) => s + scoreColor(o), 0) / alive.length;

  // Ecosystem metrics
  const diversityOfForms = scoreDiversity(alive);
  const spatialComposition = scoreComposition(world);
  const motionGrace = scoreMotion(world);

  // Weighted total — no single metric can carry the score
  const total =
    formBeauty * 0.20 +
    symmetryQuality * 0.15 +
    proportionHarmony * 0.10 +
    colorCoherence * 0.10 +
    diversityOfForms * 0.15 +
    spatialComposition * 0.15 +
    motionGrace * 0.15;

  return { formBeauty, symmetryQuality, proportionHarmony, colorCoherence,
    diversityOfForms, spatialComposition, motionGrace, total };
}
