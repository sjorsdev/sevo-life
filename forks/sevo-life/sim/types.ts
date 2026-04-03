// sim/types.ts — Simulation types for sevo-life

export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldConfig {
  width: number;
  height: number;
  maxTicks: number;
  initialResources: number;     // resource cells at start
  resourceRegenRate: number;    // probability per tick per empty cell
  trailDecayRate: number;       // trail intensity lost per tick (0-1) — lower = trails persist longer
  energyDrainPerTick: number;   // energy cost per tick alive
  moveCost: number;             // extra energy cost for moving
  harvestGain: number;          // energy gained from harvesting
  seed: number;                 // PRNG seed for determinism
}

export interface Cell {
  resource: number;     // 0-1, harvestable amount
  trail: number;        // 0-1, aesthetic trail intensity
  trailColor: number;   // 0-5, hue index
  occupied: boolean;
}

export interface Entity {
  id: number;
  pos: Vec2;
  energy: number;
  age: number;
  genome: EntityGenome;
  alive: boolean;
  totalHarvested: number;
  trailsLeft: number;
  distanceTraveled: number;
}

export interface EntityGenome {
  // Movement genes
  moveSpeed: number;        // 0-1, movement probability per tick
  turnBias: number;         // -1 to 1, left vs right preference
  resourceAttraction: number; // 0-1, tendency to move toward resources
  trailAttraction: number;  // -1 to 1, follow or avoid trails

  // Survival genes
  harvestThreshold: number; // 0-1, minimum resource to bother harvesting
  energyConserve: number;   // 0-1, tendency to idle when energy is low
  explorationDrive: number; // 0-1, preference for unvisited cells

  // Aesthetic genes
  trailIntensity: number;   // 0-1, how strong trails are left
  trailColor: number;       // 0-5, hue index
  pulseFrequency: number;   // 0-1, how often to emit visual pulse
  patternSymmetry: number;  // 0-1, tendency to create symmetric paths
}

export type EntityAction =
  | { type: "move"; direction: Vec2 }
  | { type: "harvest" }
  | { type: "trail"; intensity: number; color: number }
  | { type: "pulse"; radius: number }
  | { type: "idle" };

export type DecisionFn = (entity: Entity, neighbors: CellView[]) => EntityAction;

export interface CellView {
  pos: Vec2;
  cell: Cell;
  distance: number;
  direction: Vec2;
}

export interface EntityResult {
  id: number;
  survived: boolean;
  age: number;
  totalHarvested: number;
  trailsLeft: number;
  distanceTraveled: number;
  finalEnergy: number;
}

export interface BeautyMetrics {
  symmetry: number;     // 0-1
  complexity: number;   // 0-1
  rhythm: number;       // 0-1
  colorHarmony: number; // 0-1
  coverage: number;     // 0-1
  total: number;        // weighted composite 0-1
}

export interface SimulationResult {
  entities: EntityResult[];
  beauty: BeautyMetrics;
  survivalRate: number;
  avgAge: number;
  avgHarvested: number;
  totalTicks: number;
  worldSnapshot: Cell[][];
}

export const DEFAULT_CONFIG: WorldConfig = {
  width: 40,
  height: 30,
  maxTicks: 200,
  initialResources: 80,
  resourceRegenRate: 0.005,
  trailDecayRate: 0.02,  // slower decay = trails persist longer for coverage/complexity
  energyDrainPerTick: 0.5,
  moveCost: 0.3,
  harvestGain: 5,
  seed: 42,
};
