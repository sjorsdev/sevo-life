import type {
  CellView,
  DecisionFn,
  Entity,
  EntityAction,
  EntityGenome,
} from "../src/life-types.ts";
import { DEFAULT_CONFIG } from "../src/life-types.ts";
import { runSimulation } from "../src/life-runner.ts";

// INSIGHT: Survival dominates fitness (0.5 weight). v1 had high-speed explorers wasting energy.
// Mutation: reduce moveSpeed variance (0.3-0.7 band), increase energyConserve (0.5-0.85),
// raise resourceAttraction (0.6-0.95), lower harvestThresholds (0.08-0.25).
// This keeps diversity while improving energy management across all types.

const genomes: EntityGenome[] = [
  // Scout — faster but more conservative than v1 Explorer
  {
    moveSpeed: 0.7, turnBias: 0.1, resourceAttraction: 0.8, trailAttraction: -0.2,
    harvestThreshold: 0.12, energyConserve: 0.65, explorationDrive: 0.6,
    trailIntensity: 0.5, trailColor: 0, pulseFrequency: 0.15, patternSymmetry: 0.3,
  },
  // Forager — stays near resources, improved efficiency
  {
    moveSpeed: 0.4, turnBias: -0.1, resourceAttraction: 0.95, trailAttraction: 0.0,
    harvestThreshold: 0.08, energyConserve: 0.8, explorationDrive: 0.15,
    trailIntensity: 0.4, trailColor: 1, pulseFrequency: 0.1, patternSymmetry: 0.5,
  },
  // Aesthete — balanced beauty and survival
  {
    moveSpeed: 0.55, turnBias: 0.4, resourceAttraction: 0.65, trailAttraction: 0.3,
    harvestThreshold: 0.15, energyConserve: 0.7, explorationDrive: 0.5,
    trailIntensity: 0.85, trailColor: 2, pulseFrequency: 0.35, patternSymmetry: 0.8,
  },
  // Balanced — jack of all trades with better energy management
  {
    moveSpeed: 0.55, turnBias: 0.0, resourceAttraction: 0.7, trailAttraction: 0.1,
    harvestThreshold: 0.12, energyConserve: 0.75, explorationDrive: 0.45,
    trailIntensity: 0.6, trailColor: 3, pulseFrequency: 0.2, patternSymmetry: 0.5,
  },
  // Rusher — faster movement but still efficient (replaces wasteful Sprinter)
  {
    moveSpeed: 0.75, turnBias: -0.2, resourceAttraction: 0.85, trailAttraction: -0.4,
    harvestThreshold: 0.2, energyConserve: 0.6, explorationDrive: 0.75,
    trailIntensity: 0.3, trailColor: 4, pulseFrequency: 0.08, patternSymmetry: 0.2,
  },
  // Steady — slow and very energy efficient
  {
    moveSpeed: 0.35, turnBias: 0.0, resourceAttraction: 0.9, trailAttraction: 0.2,
    harvestThreshold: 0.1, energyConserve: 0.85, explorationDrive: 0.1,
    trailIntensity: 0.45, trailColor: 5, pulseFrequency: 0.12, patternSymmetry: 0.6,
  },
  // Conductor — high-frequency pulsing for beauty with survival
  {
    moveSpeed: 0.5, turnBias: 0.2, resourceAttraction: 0.75, trailAttraction: 0.0,
    harvestThreshold: 0.15, energyConserve: 0.7, explorationDrive: 0.35,
    trailIntensity: 0.8, trailColor: 0, pulseFrequency: 0.45, patternSymmetry: 0.9,
  },
  // Pattern-follower — follows trails more effectively
  {
    moveSpeed: 0.55, turnBias: 0.1, resourceAttraction: 0.65, trailAttraction: 0.7,
    harvestThreshold: 0.12, energyConserve: 0.75, explorationDrive: 0.25,
    trailIntensity: 0.65, trailColor: 2, pulseFrequency: 0.15, patternSymmetry: 0.7,
  },
];

// INSIGHT: Decision logic unchanged — improvements are purely in genome parameters.
// Energy thresholds remain the same, but better-balanced genomes reach those thresholds more often.
const decide: DecisionFn = (entity: Entity, neighbors: CellView[]): EntityAction => {
  const g = entity.genome;

  const selfCell = neighbors.find((n) => n.distance === 0);
  const onResource = selfCell ? selfCell.cell.resource > g.harvestThreshold : false;

  if (entity.energy < 5) {
    if (onResource) return { type: "harvest" };
    const resourceCells = neighbors
      .filter((n) => n.cell.resource > 0.1)
      .sort((a, b) => a.distance - b.distance);
    if (resourceCells.length > 0) {
      return { type: "move", direction: resourceCells[0].direction };
    }
    if (g.energyConserve > 0.5) return { type: "idle" };
  }

  if (onResource) return { type: "harvest" };

  if (entity.energy > 8 && g.pulseFrequency > 0 && entity.age % Math.max(5, Math.round(20 * (1 - g.pulseFrequency))) === 0) {
    return { type: "pulse", radius: 2 };
  }

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

      for (const n of nearby) {
        score += n.cell.resource * g.resourceAttraction * (1 / n.distance);
        score += n.cell.trail * g.trailAttraction * (1 / n.distance);
        if (!n.cell.occupied) score += 0.1;
      }

      if (g.patternSymmetry > 0.5) {
        if (dir.x === 0 || dir.y === 0) score += g.patternSymmetry * 0.3;
      }

      score += g.explorationDrive * (Math.random() * 0.5);
      score += dir.x * g.turnBias * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return { type: "move", direction: bestDir };
  }

  if (g.trailIntensity > 0.2 && entity.energy > 5) {
    return { type: "trail", intensity: g.trailIntensity, color: g.trailColor };
  }

  return { type: "idle" };
};

const result = runSimulation(genomes, decide, {
  ...DEFAULT_CONFIG,
  seed: Date.now() % 100000,
});

const maxPossibleHarvest = DEFAULT_CONFIG.harvestGain * DEFAULT_CONFIG.maxTicks;
const efficiency = Math.min(1, result.avgHarvested / maxPossibleHarvest);
const fitness = 0.5 * result.survivalRate + 0.3 * result.beauty.total + 0.2 * efficiency;

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