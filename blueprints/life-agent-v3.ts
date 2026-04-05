// life-agent-v3.ts — Parameter-evolved from v2: Organisms survive but metabolically inefficient — over-movement without goal. Re
// Genome: optimized for harvest efficiency while maintaining pattern diversity
// Strategy: aggressive resource seeking + energy-aware movement + aesthetic pattern creation

import type {
  CellView,
  DecisionFn,
  Entity,
  EntityAction,
  EntityGenome,
} from "../src/life-types.ts";
import { DEFAULT_CONFIG } from "../src/life-types.ts";
import { runSimulation } from "../src/life-runner.ts";

// INSIGHT: efficiency was the weakest component (0.2 weight). Redesigned genomes to harvest more aggressively
// while maintaining diverse strategies for beauty and survival emergence.
const genomes: EntityGenome[] = [
  // Harvester — aggressive resource seeker, low harvest threshold
  // INSIGHT: new role focused purely on efficiency. Low threshold + high attraction.
  {
    moveSpeed: 0.85, turnBias: 0.0, resourceAttraction: 0.95, trailAttraction: -0.4,
    harvestThreshold: 0.08, energyConserve: 0.4, explorationDrive: 0.7,
    trailIntensity: 0.2, trailColor: 0, pulseFrequency: 0.0, patternSymmetry: 0.2,
  },
  // Efficient Hoarder — stays near resources, very low harvest threshold for max gain
  // INSIGHT: reduced harvestThreshold from 0.1 to 0.05 to capture more marginal resources
  {
    moveSpeed: 0.4, turnBias: -0.15, resourceAttraction: 0.95, trailAttraction: 0.05,
    harvestThreshold: 0.05, energyConserve: 0.8, explorationDrive: 0.15,
    trailIntensity: 0.25, trailColor: 1, pulseFrequency: 0.03, patternSymmetry: 0.4,
  },
  // Aesthetic Harvester — efficient + creates beauty, balanced harvest
  // INSIGHT: merge efficiency with beauty. Moderate threshold, high trail intensity.
  {
    moveSpeed: 0.7, turnBias: 0.4, resourceAttraction: 0.75, trailAttraction: 0.15,
    harvestThreshold: 0.12, energyConserve: 0.45, explorationDrive: 0.55,
    trailIntensity: 0.85, trailColor: 2, pulseFrequency: 0.25, patternSymmetry: 0.75,
  },
  // Balanced Optimizer — jack of all trades with lower harvest threshold
  // INSIGHT: shifted from 0.2 to 0.15 harvestThreshold for better efficiency baseline
  {
    moveSpeed: 0.65, turnBias: 0.05, resourceAttraction: 0.65, trailAttraction: 0.1,
    harvestThreshold: 0.15, energyConserve: 0.55, explorationDrive: 0.5,
    trailIntensity: 0.5, trailColor: 3, pulseFrequency: 0.12, patternSymmetry: 0.5,
  },
  // Persistence Hunter — survives longer by seeking resources constantly
  // INSIGHT: reduced energy waste (lower moveSpeed for endurance) while maintaining resource drive
  {
    moveSpeed: 0.75, turnBias: -0.2, resourceAttraction: 0.88, trailAttraction: -0.3,
    harvestThreshold: 0.1, energyConserve: 0.65, explorationDrive: 0.8,
    trailIntensity: 0.15, trailColor: 4, pulseFrequency: 0.0, patternSymmetry: 0.1,
  },
  // Conservative Reaper — very efficient, slow but misses nothing
  // INSIGHT: ultra-low threshold (0.06) + high energy conservation for maximum harvest ratio
  {
    moveSpeed: 0.35, turnBias: 0.1, resourceAttraction: 0.92, trailAttraction: 0.2,
    harvestThreshold: 0.06, energyConserve: 0.85, explorationDrive: 0.2,
    trailIntensity: 0.35, trailColor: 5, pulseFrequency: 0.04, patternSymmetry: 0.55,
  },
  // Pattern Harvester — creates complex patterns while seeking resources
  // INSIGHT: high pulse frequency + symmetry enable beauty creation without sacrificing resource drive
  {
    moveSpeed: 0.6, turnBias: 0.3, resourceAttraction: 0.7, trailAttraction: 0.05,
    harvestThreshold: 0.14, energyConserve: 0.5, explorationDrive: 0.45,
    trailIntensity: 0.8, trailColor: 0, pulseFrequency: 0.45, patternSymmetry: 0.85,
  },
  // Trail Adaptor — follows trails to resources, energy-aware
  // INSIGHT: high trailAttraction but lower threshold means it efficiently captures resource trails
  {
    moveSpeed: 0.65, turnBias: 0.15, resourceAttraction: 0.65, trailAttraction: 0.7,
    harvestThreshold: 0.11, energyConserve: 0.5, explorationDrive: 0.35,
    trailIntensity: 0.65, trailColor: 2, pulseFrequency: 0.08, patternSymmetry: 0.65,
  },
];

// Decision function: resource-seeking behavior with improved efficiency
const decide: DecisionFn = (entity: Entity, neighbors: CellView[]): EntityAction => {
  const g = entity.genome;

  // Check if we're on a resource — harvest if above threshold
  const selfCell = neighbors.find((n) => n.distance === 0);
  const onResource = selfCell ? selfCell.cell.resource > g.harvestThreshold : false;

  // INSIGHT: improved energy emergency detection. Wider radius search for resources when desperate.
  if (entity.energy < 4) {
    if (onResource) return { type: "harvest" };
    const resourceCells = neighbors
      .filter((n) => n.cell.resource > 0.05)
      .sort((a, b) => a.distance - b.distance);
    if (resourceCells.length > 0) {
      return { type: "move", direction: resourceCells[0].direction };
    }
    if (g.energyConserve > 0.6) return { type: "idle" };
  }

  if (onResource) return { type: "harvest" };

  // Pulse — aesthetic action at regular intervals
  if (entity.energy > 7 && g.pulseFrequency > 0 && entity.age % Math.max(4, Math.round(18 * (1 - g.pulseFrequency))) === 0) {
    return { type: "pulse", radius: 2 };
  }

  // INSIGHT: improved movement strategy. Always check for resources, weight them heavily.
  if (Math.random() < g.moveSpeed) {
    let bestDir = { x: 0, y: 0 };
    let bestScore = -Infinity;

    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: -1 },
      { x: 1, y: -1 }, { x: -1, y: 1 },
    ];

    for (const dir of directions) {
      let score = 0;
      const nearby = neighbors.filter(
        (n) => n.direction.x === dir.x && n.direction.y === dir.y,
      );

      // INSIGHT: doubled resource weight contribution to emphasize harvest efficiency
      for (const n of nearby) {
        score += n.cell.resource * g.resourceAttraction * 2.0 * (1 / Math.max(n.distance, 0.5));
        score += n.cell.trail * g.trailAttraction * (1 / n.distance);
        if (!n.cell.occupied) score += 0.15;
      }

      if (g.patternSymmetry > 0.5) {
        if (dir.x === 0 || dir.y === 0) score += g.patternSymmetry * 0.25;
      }

      // INSIGHT: reduced exploration randomness when energy is moderate to focus on resources
      const explorationBoost = entity.energy > 6 ? g.explorationDrive * 0.4 : g.explorationDrive * 0.15;
      score += explorationBoost * (Math.random() * 0.5);
      score += dir.x * g.turnBias * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return { type: "move", direction: bestDir };
  }

  // When idle, leave a trail if energy permits
  if (g.trailIntensity > 0.15 && entity.energy > 6) {
    return { type: "trail", intensity: g.trailIntensity, color: g.trailColor };
  }

  return { type: "idle" };
};

// Run simulation
const result = runSimulation(genomes, decide, {
  ...DEFAULT_CONFIG,
  seed: Date.now() % 100000,
});

// Compute composite fitness: 0.5 survival + 0.3 beauty + 0.2 efficiency
const maxPossibleHarvest = DEFAULT_CONFIG.harvestGain * DEFAULT_CONFIG.maxTicks;
const efficiency = Math.min(1, result.avgHarvested / maxPossibleHarvest);
const fitness = 0.5 * result.survivalRate + 0.3 * result.beauty.total + 0.2 * efficiency;

// Output fitness JSON on last line (SEVO protocol)
console.log(JSON.stringify({
  fitness: Math.round(fitness * 1000) / 1000,
  branches: 1,
  survivalRate: Math.round(result.survivalRate * 1000) / 1000,
  beautyScore: Math.round(result.beauty.total * 1000) / 1000,
  efficiency: Math.round(efficiency * 1000) / 1000,
  beauty: {
    symmetry: Math.round(result.beauty.symmetry * 1000) / 1000,
    complexity: Math.round(result.beauty.complexity * 1000) / 1000,
    rhythm: Math.round(result.beauty.rhythm * 1000) / 1000,
    colorHarmony: Math.round(result.beauty.colorHarmony * 1000) / 1000,
    coverage: Math.round(result.beauty.coverage * 1000) / 1000,
  },
  totalTicks: result.totalTicks,
  avgAge: Math.round(result.avgAge),
  correct: result.entities.filter((e) => e.survived).length,
  total: result.entities.length,
}));