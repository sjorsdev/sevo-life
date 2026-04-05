// life-agent-v5.ts — First multi-cell organism agent
// Beings grow bodies via L-system rules, then move and harvest.
// Beauty is measured on body FORM, not trail patterns.

import type { Vec2 } from "../src/life-types.ts";
import { DEFAULT_CONFIG } from "../src/life-types.ts";
import type { BodyGenome, GrowthRule } from "../src/body.ts";
import { WorldV2, type Organism, type OrganismDecisionFn } from "../src/world-v2.ts";
import { scoreBodyBeauty } from "../src/body.ts";

// --- Body genomes: different organisms with different growth programs ---

const treeOrganism: BodyGenome = {
  growthRules: [
    // Core grows upward into a trunk
    { from: "core", direction: { x: 0, y: -1 }, produces: "skin", minAge: 2, energyCost: 3, probability: 0.8, maxInstances: 6, symmetry: false },
    // Trunk branches left and right
    { from: "skin", direction: { x: 1, y: 0 }, produces: "skin", minAge: 3, energyCost: 3, probability: 0.4, maxInstances: 4, symmetry: true },
    // Tips grow mouths for harvesting
    { from: "skin", direction: { x: 0, y: -1 }, produces: "mouth", minAge: 4, energyCost: 2, probability: 0.3, maxInstances: 4, symmetry: true },
    // Core grows legs downward for movement
    { from: "core", direction: { x: 0, y: 1 }, produces: "leg", minAge: 1, energyCost: 2, probability: 0.6, maxInstances: 2, symmetry: false },
    // Core grows eyes to the sides
    { from: "core", direction: { x: 1, y: 0 }, produces: "eye", minAge: 5, energyCost: 4, probability: 0.3, maxInstances: 2, symmetry: true },
  ],
  maxCells: 18,
  growthEnergyCost: 2,
  coreColor: 2,
  skinColor: 3,
  colorGradient: true,
  bilateralSymmetry: 0.9,
  radialSymmetry: 0.1,
  elongation: 0.7,
  branching: 0.5,
};

const starOrganism: BodyGenome = {
  growthRules: [
    // Radial arms in 4 directions
    { from: "core", direction: { x: 1, y: 0 }, produces: "skin", minAge: 2, energyCost: 2, probability: 0.7, maxInstances: 3, symmetry: true },
    { from: "core", direction: { x: 0, y: 1 }, produces: "skin", minAge: 2, energyCost: 2, probability: 0.7, maxInstances: 3, symmetry: true },
    // Arm tips get mouths
    { from: "skin", direction: { x: 1, y: 0 }, produces: "mouth", minAge: 3, energyCost: 2, probability: 0.5, maxInstances: 4, symmetry: true },
    { from: "skin", direction: { x: 0, y: 1 }, produces: "mouth", minAge: 3, energyCost: 2, probability: 0.5, maxInstances: 4, symmetry: true },
    // Central eye
    { from: "core", direction: { x: 0, y: -1 }, produces: "eye", minAge: 4, energyCost: 3, probability: 0.5, maxInstances: 1, symmetry: false },
    // Legs underneath
    { from: "core", direction: { x: 1, y: 1 }, produces: "leg", minAge: 1, energyCost: 2, probability: 0.6, maxInstances: 2, symmetry: true },
  ],
  maxCells: 20,
  growthEnergyCost: 2,
  coreColor: 0,
  skinColor: 4,
  colorGradient: false,
  bilateralSymmetry: 0.8,
  radialSymmetry: 0.7,
  elongation: 0.2,
  branching: 0.3,
};

const wormOrganism: BodyGenome = {
  growthRules: [
    // Long body segments
    { from: "core", direction: { x: 0, y: -1 }, produces: "skin", minAge: 1, energyCost: 2, probability: 0.9, maxInstances: 8, symmetry: false },
    { from: "skin", direction: { x: 0, y: -1 }, produces: "skin", minAge: 2, energyCost: 2, probability: 0.6, maxInstances: 8, symmetry: false },
    // Mouth at head
    { from: "skin", direction: { x: 0, y: -1 }, produces: "mouth", minAge: 5, energyCost: 2, probability: 0.4, maxInstances: 1, symmetry: false },
    // Eyes at head
    { from: "mouth", direction: { x: 1, y: 0 }, produces: "eye", minAge: 1, energyCost: 3, probability: 0.5, maxInstances: 2, symmetry: true },
    // Many legs along body
    { from: "skin", direction: { x: 1, y: 0 }, produces: "leg", minAge: 2, energyCost: 1, probability: 0.4, maxInstances: 6, symmetry: true },
  ],
  maxCells: 22,
  growthEnergyCost: 1.5,
  coreColor: 1,
  skinColor: 5,
  colorGradient: true,
  bilateralSymmetry: 0.95,
  radialSymmetry: 0.0,
  elongation: 0.9,
  branching: 0.1,
};

const allGenomes = [treeOrganism, starOrganism, wormOrganism, treeOrganism, starOrganism];

// --- Decision function ---
const decide: OrganismDecisionFn = (
  org: Organism,
  nearbyResources: Vec2[],
  nearbyOrganisms: { id: number; distance: number; cellCount: number }[],
  worldTick: number,
): { type: "grow" | "move" | "harvest" | "pulse" | "idle"; direction?: Vec2; color?: number } => {
  const bodySize = org.body.cells.length;
  const maxSize = org.body.genome.maxCells;

  // Phase 1: Grow body — but only when energy is healthy
  if (bodySize < maxSize * 0.5 && org.energy > 20) {
    return { type: "grow" };
  }

  // Emergency: harvest when low energy
  if (org.energy < 8) {
    if (nearbyResources.length > 0) {
      const closest = nearbyResources.sort((a, b) => {
        const da = Math.abs(a.x - org.body.center.x) + Math.abs(a.y - org.body.center.y);
        const db = Math.abs(b.x - org.body.center.x) + Math.abs(b.y - org.body.center.y);
        return da - db;
      })[0];
      const dx = Math.sign(closest.x - org.body.center.x);
      const dy = Math.sign(closest.y - org.body.center.y);
      if (dx === 0 && dy === 0) return { type: "harvest" };
      return { type: "move", direction: { x: dx, y: dy } };
    }
    return { type: "harvest" };
  }

  // Still growing — continue if plenty of energy
  if (bodySize < maxSize && org.energy > 25) {
    return { type: "grow" };
  }

  // Pulse for beauty periodically
  if (worldTick % 12 === 0 && org.energy > 12) {
    return { type: "pulse", color: org.body.genome.coreColor };
  }

  // Move toward resources
  if (nearbyResources.length > 0) {
    const closest = nearbyResources[0];
    const dx = Math.sign(closest.x - org.body.center.x);
    const dy = Math.sign(closest.y - org.body.center.y);
    if (dx === 0 && dy === 0) return { type: "harvest" };
    return { type: "move", direction: { x: dx, y: dy } };
  }

  // Explore
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const dir = dirs[worldTick % dirs.length];
  return { type: "move", direction: dir };
};

// --- Run simulation ---
const config = {
  ...DEFAULT_CONFIG,
  width: 60,
  height: 45,
  maxTicks: 300,
  initialResources: 200,
  resourceRegenRate: 0.015,
  harvestGain: 8,
  energyDrainPerTick: 0.3,
  seed: Date.now() % 100000,
};

const world = new WorldV2(config, allGenomes);

while (!world.isFinished()) {
  world.step(decide);
}

const result = world.getResults();

// Dynamic fitness weights — shift toward beauty when survival is solved
// (Brainstorm proposal: "increase beauty coefficient when survivalRate plateaus")
const maxHarvest = config.harvestGain * config.maxTicks;
const avgHarvest = result.organisms.reduce((s, o) => s + o.totalHarvested, 0) / result.organisms.length;
const efficiency = Math.min(1, avgHarvest / maxHarvest);

// When survival is high, beauty matters more. When survival is low, survival matters more.
const survivalSolved = result.survivalRate > 0.8;
const wSurvival = survivalSolved ? 0.20 : 0.45;
const wBeauty = survivalSolved ? 0.50 : 0.30;
const wDiversity = survivalSolved ? 0.20 : 0.15;
const wEfficiency = survivalSolved ? 0.10 : 0.10;

const fitness =
  wSurvival * result.survivalRate +
  wBeauty * result.worldBeauty +
  wDiversity * result.ecosystemDiversity +
  wEfficiency * efficiency;

console.log(JSON.stringify({
  fitness: Math.round(fitness * 1000) / 1000,
  branches: allGenomes.length,
  survivalRate: Math.round(result.survivalRate * 1000) / 1000,
  beautyScore: Math.round(result.worldBeauty * 1000) / 1000,
  ecosystemDiversity: Math.round(result.ecosystemDiversity * 1000) / 1000,
  efficiency: Math.round(efficiency * 1000) / 1000,
  avgBodySize: Math.round(result.avgBodySize * 10) / 10,
  avgAge: Math.round(result.avgAge),
  organisms: result.organisms.map(o => ({
    id: o.id,
    survived: o.survived,
    cells: o.cellCount,
    beauty: Math.round(o.bodyBeauty.total * 1000) / 1000,
    formSymmetry: Math.round(o.bodyBeauty.formSymmetry * 1000) / 1000,
  })),
}));
