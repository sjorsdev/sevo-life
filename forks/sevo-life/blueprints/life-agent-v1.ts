// life-agent-v1.ts — First sevo-life agent: reactive survival + trail aesthetics
// Genome: balanced between survival and beauty
// Strategy: harvest when on resources, move toward nearest resource, leave trails

import type {
  CellView,
  DecisionFn,
  Entity,
  EntityAction,
  EntityGenome,
} from "../sim/types.ts";
import { DEFAULT_CONFIG } from "../sim/types.ts";
import { runSimulation } from "../sim/runner.ts";

// Define 8 entity genomes with variation
const genomes: EntityGenome[] = [
  // Explorer — high movement, moderate harvesting
  {
    moveSpeed: 0.9, turnBias: 0.1, resourceAttraction: 0.6, trailAttraction: -0.3,
    harvestThreshold: 0.2, energyConserve: 0.3, explorationDrive: 0.8,
    trailIntensity: 0.5, trailColor: 0, pulseFrequency: 0.1, patternSymmetry: 0.3,
  },
  // Hoarder — stays near resources, efficient harvesting
  {
    moveSpeed: 0.5, turnBias: -0.1, resourceAttraction: 0.9, trailAttraction: 0.0,
    harvestThreshold: 0.1, energyConserve: 0.7, explorationDrive: 0.2,
    trailIntensity: 0.3, trailColor: 1, pulseFrequency: 0.05, patternSymmetry: 0.5,
  },
  // Artist — focuses on trail patterns
  {
    moveSpeed: 0.7, turnBias: 0.5, resourceAttraction: 0.4, trailAttraction: 0.2,
    harvestThreshold: 0.3, energyConserve: 0.4, explorationDrive: 0.6,
    trailIntensity: 0.9, trailColor: 2, pulseFrequency: 0.3, patternSymmetry: 0.8,
  },
  // Balanced — jack of all trades
  {
    moveSpeed: 0.6, turnBias: 0.0, resourceAttraction: 0.5, trailAttraction: 0.1,
    harvestThreshold: 0.2, energyConserve: 0.5, explorationDrive: 0.5,
    trailIntensity: 0.5, trailColor: 3, pulseFrequency: 0.15, patternSymmetry: 0.5,
  },
  // Sprinter — fast but wasteful
  {
    moveSpeed: 1.0, turnBias: -0.3, resourceAttraction: 0.7, trailAttraction: -0.5,
    harvestThreshold: 0.4, energyConserve: 0.1, explorationDrive: 0.9,
    trailIntensity: 0.2, trailColor: 4, pulseFrequency: 0.0, patternSymmetry: 0.1,
  },
  // Conservative — slow, energy efficient
  {
    moveSpeed: 0.3, turnBias: 0.0, resourceAttraction: 0.8, trailAttraction: 0.3,
    harvestThreshold: 0.15, energyConserve: 0.9, explorationDrive: 0.1,
    trailIntensity: 0.4, trailColor: 5, pulseFrequency: 0.05, patternSymmetry: 0.6,
  },
  // Pulser — creates radial patterns
  {
    moveSpeed: 0.5, turnBias: 0.2, resourceAttraction: 0.5, trailAttraction: 0.0,
    harvestThreshold: 0.25, energyConserve: 0.5, explorationDrive: 0.4,
    trailIntensity: 0.7, trailColor: 0, pulseFrequency: 0.5, patternSymmetry: 0.9,
  },
  // Trail-follower — follows existing trails
  {
    moveSpeed: 0.6, turnBias: 0.1, resourceAttraction: 0.3, trailAttraction: 0.8,
    harvestThreshold: 0.2, energyConserve: 0.4, explorationDrive: 0.3,
    trailIntensity: 0.6, trailColor: 2, pulseFrequency: 0.1, patternSymmetry: 0.7,
  },
];

// Decision function: reactive behavior driven by genome
const decide: DecisionFn = (entity: Entity, neighbors: CellView[]): EntityAction => {
  const g = entity.genome;

  // Check if we're on a resource — harvest if above threshold
  const selfCell = neighbors.find((n) => n.distance === 0);
  const onResource = selfCell ? selfCell.cell.resource > g.harvestThreshold : false;

  // Low energy? Conserve or harvest urgently
  if (entity.energy < 5) {
    if (onResource) return { type: "harvest" };
    // Find nearest resource and move toward it
    const resourceCells = neighbors
      .filter((n) => n.cell.resource > 0.1)
      .sort((a, b) => a.distance - b.distance);
    if (resourceCells.length > 0) {
      return { type: "move", direction: resourceCells[0].direction };
    }
    if (g.energyConserve > 0.5) return { type: "idle" };
  }

  // Harvest opportunity — always harvest when on resources (boosts efficiency)
  if (onResource) {
    return { type: "harvest" };
  }

  // Pulse — aesthetic action at regular intervals (creates rhythm)
  if (entity.energy > 8 && g.pulseFrequency > 0 && entity.age % Math.max(5, Math.round(20 * (1 - g.pulseFrequency))) === 0) {
    return { type: "pulse", radius: 2 };
  }

  // Move decision — always try to move, and leave trail behind
  if (Math.random() < g.moveSpeed) {
    // Score each neighbor direction
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

      for (const n of nearby) {
        score += n.cell.resource * g.resourceAttraction * (1 / n.distance);
        score += n.cell.trail * g.trailAttraction * (1 / n.distance);
        if (!n.cell.occupied) score += 0.1;
      }

      // Symmetry-seeking: prefer directions that mirror previous movement
      if (g.patternSymmetry > 0.5) {
        // Bias toward axis-aligned movement for symmetric patterns
        if (dir.x === 0 || dir.y === 0) score += g.patternSymmetry * 0.3;
      }

      // Exploration bonus for less-visited directions
      score += g.explorationDrive * (Math.random() * 0.5);

      // Turn bias
      score += dir.x * g.turnBias * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return { type: "move", direction: bestDir };
  }

  // When idle, leave a trail (builds coverage and complexity)
  if (g.trailIntensity > 0.2 && entity.energy > 5) {
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
