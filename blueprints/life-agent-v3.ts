// life-agent-v3.ts — Evolved sevo-life agent: improved survival + aesthetic balance
// Genome: focus on sustainable harvesting + emergent beauty patterns
// Strategy: balanced resource seeking + survival protection + collaborative trail following

import type {
  CellView,
  DecisionFn,
  Entity,
  EntityAction,
  EntityGenome,
} from "../src/life-types.ts";
import { DEFAULT_CONFIG } from "../src/life-types.ts";
import { runSimulation } from "../src/life-runner.ts";

// INSIGHT: survival rate bottleneck identified. Previous versions exhausted energy chasing marginal resources.
// Redesigned genomes to balance sustainable energy management with efficiency.
// Added threshold-based idle strategy: rest when energy is moderate (5-7 range) to prevent death spirals.
const genomes: EntityGenome[] = [
  // Sustainable Harvester — aggressive but energy-aware, survives longer
  // INSIGHT: raised harvestThreshold from 0.08 to 0.12 to avoid chasing trace resources at high energy cost
  {
    moveSpeed: 0.8, turnBias: 0.0, resourceAttraction: 0.95, trailAttraction: -0.35,
    harvestThreshold: 0.12, energyConserve: 0.5, explorationDrive: 0.6,
    trailIntensity: 0.2, trailColor: 0, pulseFrequency: 0.0, patternSymmetry: 0.2,
  },
  // Energy Guardian — stays still when endangered, captures good resources
  // INSIGHT: high energyConserve (0.9) + moderate harvest (0.11) + willingness to idle prevents death
  {
    moveSpeed: 0.35, turnBias: -0.1, resourceAttraction: 0.9, trailAttraction: 0.1,
    harvestThreshold: 0.11, energyConserve: 0.9, explorationDrive: 0.1,
    trailIntensity: 0.3, trailColor: 1, pulseFrequency: 0.02, patternSymmetry: 0.4,
  },
  // Beauty Cultivator — creates visual complexity + survives via pattern efficiency
  // INSIGHT: high pulseFrequency + patternSymmetry create emergent beauty while moderate speed saves energy
  {
    moveSpeed: 0.55, turnBias: 0.35, resourceAttraction: 0.7, trailAttraction: 0.25,
    harvestThreshold: 0.13, energyConserve: 0.6, explorationDrive: 0.4,
    trailIntensity: 0.9, trailColor: 2, pulseFrequency: 0.5, patternSymmetry: 0.9,
  },
  // Equilibrium Optimizer — balanced across all dimensions, reliable
  // INSIGHT: tuned all parameters to mid-range for stability. Lower moveSpeed (0.6) reduces energy waste.
  {
    moveSpeed: 0.6, turnBias: 0.08, resourceAttraction: 0.75, trailAttraction: 0.2,
    harvestThreshold: 0.14, energyConserve: 0.6, explorationDrive: 0.45,
    trailIntensity: 0.55, trailColor: 3, pulseFrequency: 0.15, patternSymmetry: 0.55,
  },
  // Trail Specialist — efficiently follows resource paths created by others
  // INSIGHT: very high trailAttraction (0.8) + moderate resourceAttraction creates synergy with other entities
  {
    moveSpeed: 0.7, turnBias: -0.15, resourceAttraction: 0.6, trailAttraction: 0.8,
    harvestThreshold: 0.12, energyConserve: 0.7, explorationDrive: 0.3,
    trailIntensity: 0.6, trailColor: 4, pulseFrequency: 0.05, patternSymmetry: 0.5,
  },
  // Precision Reaper — ultra-selective harvesting, minimal energy expenditure
  // INSIGHT: very low moveSpeed (0.3) + high energyConserve (0.88) allows long survival on selective harvests
  {
    moveSpeed: 0.3, turnBias: 0.15, resourceAttraction: 0.88, trailAttraction: 0.25,
    harvestThreshold: 0.09, energyConserve: 0.88, explorationDrive: 0.2,
    trailIntensity: 0.4, trailColor: 5, pulseFrequency: 0.03, patternSymmetry: 0.45,
  },
  // Rhythmic Explorer — creates complex patterns through coordinated pulsing + moderate harvest
  // INSIGHT: pulseFrequency 0.55 + patternSymmetry 0.8 enable coordination without constant movement
  {
    moveSpeed: 0.5, turnBias: 0.25, resourceAttraction: 0.65, trailAttraction: 0.15,
    harvestThreshold: 0.14, energyConserve: 0.55, explorationDrive: 0.35,
    trailIntensity: 0.85, trailColor: 0, pulseFrequency: 0.55, patternSymmetry: 0.8,
  },
  // Cooperative Forager — follows trails + creates them, moderate on all fronts
  // INSIGHT: balanced trailAttraction (0.65) and trailIntensity (0.7) enable population trail formation
  {
    moveSpeed: 0.65, turnBias: 0.1, resourceAttraction: 0.72, trailAttraction: 0.65,
    harvestThreshold: 0.13, energyConserve: 0.65, explorationDrive: 0.4,
    trailIntensity: 0.7, trailColor: 2, pulseFrequency: 0.1, patternSymmetry: 0.6,
  },
  // Adaptive Survivor — responds to energy state dynamically, shifts strategy based on resources
  // INSIGHT: moderate parameters allow this genome to adapt behavior based on decision logic constraints
  {
    moveSpeed: 0.72, turnBias: 0.02, resourceAttraction: 0.8, trailAttraction: 0.0,
    harvestThreshold: 0.11, energyConserve: 0.72, explorationDrive: 0.55,
    trailIntensity: 0.25, trailColor: 3, pulseFrequency: 0.08, patternSymmetry: 0.25,
  },
];

// Decision function: improved survival through smart energy management + beauty creation
const decide: DecisionFn = (entity: Entity, neighbors: CellView[]): EntityAction => {
  const g = entity.genome;

  // Check if we're on a resource — harvest if above threshold
  const selfCell = neighbors.find((n) => n.distance === 0);
  const onResource = selfCell ? selfCell.cell.resource > g.harvestThreshold : false;

  // INSIGHT: critical survival protection. When energy is critically low, harvest anything or rest.
  if (entity.energy < 3) {
    if (onResource) return { type: "harvest" };
    const resourceCells = neighbors
      .filter((n) => n.cell.resource > 0.04)
      .sort((a, b) => a.distance - b.distance);
    if (resourceCells.length > 0) {
      return { type: "move", direction: resourceCells[0].direction };
    }
    return { type: "idle" };
  }

  // INSIGHT: new survival tier (3-5 energy): conservative behavior. Harvest what's available, rest otherwise.
  if (entity.energy < 5) {
    if (onResource) return { type: "harvest" };
    if (g.energyConserve > 0.7) return { type: "idle" };
    const goodResources = neighbors
      .filter((n) => n.cell.resource > 0.1)
      .sort((a, b) => a.distance - b.distance);
    if (goodResources.length > 0) {
      return { type: "move", direction: goodResources[0].direction };
    }
    return { type: "idle" };
  }

  if (onResource) return { type: "harvest" };

  // Pulse — aesthetic action at regular intervals when energy permits
  // INSIGHT: pulse threshold raised to energy > 8 to prevent energy depletion from beauty creation
  if (entity.energy > 8 && g.pulseFrequency > 0 && entity.age % Math.max(5, Math.round(16 * (1 - g.pulseFrequency))) === 0) {
    return { type: "pulse", radius: 2 };
  }

  // INSIGHT: improved movement strategy with better resource + trail scoring integration
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

      // INSIGHT: balanced resource weight. Reduced from 2.0 to 1.5 to avoid energy-expensive chasing
      for (const n of nearby) {
        score += n.cell.resource * g.resourceAttraction * 1.5 * (1 / Math.max(n.distance, 0.5));
        score += n.cell.trail * g.trailAttraction * (1 / n.distance);
        if (!n.cell.occupied) score += 0.1;
      }

      // INSIGHT: pattern symmetry bonus for organized movement patterns
      if (g.patternSymmetry > 0.5) {
        if (dir.x === 0 || dir.y === 0) score += g.patternSymmetry * 0.2;
      }

      // INSIGHT: exploration tuned to energy state. High exploration when full, minimal when moderate.
      const explorationBoost = entity.energy > 10 ? g.explorationDrive * 0.5 : 
                               entity.energy > 7 ? g.explorationDrive * 0.2 : 0.05;
      score += explorationBoost * (Math.random() * 0.4);
      score += dir.x * g.turnBias * 0.15;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return { type: "move", direction: bestDir };
  }

  // INSIGHT: strategic idle + trail creation. When full of energy but not moving, leave aesthetics.
  if (entity.energy > 8 && g.trailIntensity > 0.3) {
    return { type: "trail", intensity: g.trailIntensity, color: g.trailColor };
  }

  // When moderately energized but not acting, rest to preserve energy for critical moments
  if (entity.energy > 5 && entity.energy < 9) {
    return { type: "idle" };
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