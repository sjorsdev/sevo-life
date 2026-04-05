// web/entry.ts — Browser entry point for sevo-life visualization
// Exports both v1 (pixel) and v2 (body) world engines

// v1 — legacy pixel world
export { World } from "../src/world.ts";
export { scoreBeauty, beautyByColor } from "../src/beauty.ts";
export { DEFAULT_CONFIG } from "../src/life-types.ts";

// v2 — multi-cell organism world
export { WorldV2 } from "../src/world-v2.ts";
export { Body, scoreBodyBeauty } from "../src/body.ts";

export type {
  Cell,
  CellView,
  DecisionFn,
  Entity,
  EntityAction,
  EntityGenome,
  EntityResult,
  BeautyMetrics,
  SimulationResult,
  Vec2,
  WorldConfig,
  WorldEvent,
} from "../src/life-types.ts";

export type {
  BodyGenome,
  BodyCell,
  GrowthRule,
  CellType,
} from "../src/body.ts";

export type {
  Organism,
  OrganismAction,
  OrganismDecisionFn,
} from "../src/world-v2.ts";
