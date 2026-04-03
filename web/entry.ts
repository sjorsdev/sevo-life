// web/entry.ts — Browser entry point: re-exports from the real sim engine
// This is what gets bundled. It imports the SAME code the agents use.

export { World } from "../src/world.ts";
export { scoreBeauty, beautyByColor } from "../src/beauty.ts";
export { DEFAULT_CONFIG } from "../src/life-types.ts";
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
