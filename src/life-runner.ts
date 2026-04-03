// src/life-runner.ts — Simulation orchestrator for sevo-life
// Used by agent blueprints to run the world simulation and get fitness scores

import type {
  DecisionFn,
  EntityGenome,
  SimulationResult,
  WorldConfig,
} from "./life-types.ts";
import { DEFAULT_CONFIG } from "./life-types.ts";
import { World } from "./world.ts";
import { scoreBeauty } from "./beauty.ts";

export function runSimulation(
  genomes: EntityGenome[],
  decisionFn: DecisionFn,
  config: WorldConfig = DEFAULT_CONFIG,
): SimulationResult {
  const world = new World(config, genomes);

  while (!world.isFinished()) {
    world.step(decisionFn);
  }

  const entityResults = world.getEntityResults();
  const beauty = scoreBeauty(world.grid);

  const alive = entityResults.filter((e) => e.survived);
  const survivalRate = alive.length / entityResults.length;
  const avgAge =
    entityResults.reduce((s, e) => s + e.age, 0) / entityResults.length;
  const avgHarvested =
    entityResults.reduce((s, e) => s + e.totalHarvested, 0) /
    entityResults.length;

  return {
    entities: entityResults,
    beauty,
    survivalRate,
    avgAge,
    avgHarvested,
    totalTicks: world.tick,
    worldSnapshot: world.grid,
  };
}
