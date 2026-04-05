// web/entry.ts — Browser entry point for sevo-life visualization

// v3 — particle-based simulation (current)
export { World, v2, DEFAULT_WORLD } from "../src/sim.ts";
export { scoreWorldBeauty } from "../src/sim-beauty.ts";

export type {
  V2,
  Particle,
  Spring,
  Genome,
  GrowthStep,
  Organism,
  Resource,
  FlowField,
  WorldConfig,
} from "../src/sim.ts";

export type { BeautyScore } from "../src/sim-beauty.ts";
