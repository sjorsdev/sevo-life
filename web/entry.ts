// web/entry.ts — Browser entry point for sevo-life visualization

export { World, v2, DEFAULT_WORLD } from "../src/sim.ts";
export { scoreWorldBeauty } from "../src/sim-beauty.ts";
export { createChemField, stepChemistry, patternEntropy, patternStructure } from "../src/chemistry.ts";
export { BeautyEngine, countUniquePatterns } from "../src/compression-beauty.ts";

export type {
  V2, Particle, Spring, Genome, GrowthStep, Organism,
  Resource, FlowField, WorldConfig,
} from "../src/sim.ts";
export type { ChemField } from "../src/chemistry.ts";
export type { BeautyScore } from "../src/sim-beauty.ts";
