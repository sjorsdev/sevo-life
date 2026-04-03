// src/world.ts — 2D world engine for sevo-life

import type {
  Cell,
  CellView,
  DecisionFn,
  Entity,
  EntityAction,
  EntityGenome,
  EntityResult,
  Vec2,
  WorldConfig,
  WorldEvent,
} from "./life-types.ts";

// Mulberry32 — seeded PRNG for deterministic simulation
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  config: WorldConfig;  // mutable — world evolves too
  readonly grid: Cell[][];
  readonly entities: Entity[];
  events: WorldEvent[];
  tick: number;
  private rng: () => number;
  private nextId: number;
  totalBirths: number;
  totalDeaths: number;

  constructor(config: WorldConfig, genomes: EntityGenome[]) {
    this.config = config;
    this.tick = 0;
    this.events = [];
    this.rng = mulberry32(config.seed);
    this.totalBirths = 0;
    this.totalDeaths = 0;

    // Initialize empty grid
    this.grid = Array.from({ length: config.height }, () =>
      Array.from({ length: config.width }, () => ({
        resource: 0,
        trail: 0,
        trailColor: 0,
        occupied: false,
      }))
    );

    // Place initial resources randomly
    let placed = 0;
    while (placed < config.initialResources) {
      const x = Math.floor(this.rng() * config.width);
      const y = Math.floor(this.rng() * config.height);
      if (this.grid[y][x].resource === 0) {
        this.grid[y][x].resource = 0.3 + this.rng() * 0.7;
        placed++;
      }
    }

    // Spawn entities at random positions
    this.entities = genomes.map((genome, i) => {
      const pos: Vec2 = {
        x: Math.floor(this.rng() * config.width),
        y: Math.floor(this.rng() * config.height),
      };
      this.grid[pos.y][pos.x].occupied = true;
      this.totalBirths++;
      return {
        id: i,
        pos,
        energy: 20,
        age: 0,
        genome,
        alive: true,
        totalHarvested: 0,
        trailsLeft: 0,
        distanceTraveled: 0,
        generation: 0,
        parentIds: [],
        bornAtTick: 0,
      };
    });
    this.nextId = genomes.length;
  }

  /** Spawn a new entity into the living world. Returns the entity or null if no space. */
  spawn(genome: EntityGenome, generation = 0, parentIds: number[] = []): Entity | null {
    const { width, height } = this.config;
    let attempts = 0;
    while (attempts < 50) {
      const x = Math.floor(this.rng() * width);
      const y = Math.floor(this.rng() * height);
      if (!this.grid[y][x].occupied) {
        const entity: Entity = {
          id: this.nextId++,
          pos: { x, y },
          energy: 20,
          age: 0,
          genome,
          alive: true,
          totalHarvested: 0,
          trailsLeft: 0,
          distanceTraveled: 0,
          generation,
          parentIds,
          bornAtTick: this.tick,
        };
        this.grid[y][x].occupied = true;
        this.entities.push(entity);
        this.totalBirths++;
        this.events.push({ type: "birth", x, y, id: entity.id, generation });
        return entity;
      }
      attempts++;
    }
    return null;
  }

  /** Get currently alive entities */
  getAlive(): Entity[] {
    return this.entities.filter(e => e.alive);
  }

  /** Evolve world parameters mid-simulation. Only affects future ticks. */
  evolveConfig(changes: Partial<WorldConfig>): void {
    this.config = { ...this.config, ...changes };
  }

  getNeighbors(pos: Vec2, radius = 3): CellView[] {
    const views: CellView[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = (pos.x + dx + this.config.width) % this.config.width;
        const ny = (pos.y + dy + this.config.height) % this.config.height;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          views.push({
            pos: { x: nx, y: ny },
            cell: this.grid[ny][nx],
            distance: dist,
            direction: { x: Math.sign(dx), y: Math.sign(dy) },
          });
        }
      }
    }
    return views;
  }

  applyAction(entity: Entity, action: EntityAction): void {
    const { config, grid } = this;

    switch (action.type) {
      case "move": {
        const nx = (entity.pos.x + action.direction.x + config.width) % config.width;
        const ny = (entity.pos.y + action.direction.y + config.height) % config.height;
        if (!grid[ny][nx].occupied) {
          // Leave trail — 3 intensity phases for complexity, longer period for rhythm
          const oldCell = grid[entity.pos.y][entity.pos.x];
          const entityPeriod = 8 + entity.id * 3;
          const phase = entity.age % (entityPeriod * 3);
          let trailStrength: number;
          if (phase < entityPeriod) {
            trailStrength = entity.genome.trailIntensity * 0.15;
          } else if (phase < entityPeriod * 2) {
            trailStrength = entity.genome.trailIntensity * 0.5;
          } else {
            trailStrength = entity.genome.trailIntensity * 0.9;
          }
          oldCell.trail = Math.min(1, oldCell.trail + trailStrength);
          oldCell.trailColor = entity.genome.trailColor;
          if (entity.genome.trailIntensity > 0.1) entity.trailsLeft++;

          oldCell.occupied = false;
          entity.pos = { x: nx, y: ny };
          grid[ny][nx].occupied = true;
          entity.energy -= config.moveCost;
          entity.distanceTraveled++;
        }
        break;
      }
      case "harvest": {
        const cell = grid[entity.pos.y][entity.pos.x];
        if (cell.resource > 0) {
          const gained = Math.min(cell.resource, 1) * config.harvestGain;
          entity.energy += gained;
          entity.totalHarvested += gained;
          cell.resource = 0;
          this.events.push({ type: "harvest", x: entity.pos.x, y: entity.pos.y, id: entity.id });
        }
        break;
      }
      case "trail": {
        const cell = grid[entity.pos.y][entity.pos.x];
        cell.trail = Math.min(1, cell.trail + action.intensity);
        cell.trailColor = action.color;
        entity.trailsLeft++;
        break;
      }
      case "pulse": {
        const r = Math.min(action.radius, 3);
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.sqrt(dx * dx + dy * dy) <= r) {
              const px = (entity.pos.x + dx + config.width) % config.width;
              const py = (entity.pos.y + dy + config.height) % config.height;
              grid[py][px].trail = Math.min(1, grid[py][px].trail + 0.3);
              grid[py][px].trailColor = entity.genome.trailColor;
            }
          }
        }
        entity.energy -= 1;
        entity.trailsLeft += r * r;
        this.events.push({ type: "pulse", x: entity.pos.x, y: entity.pos.y, id: entity.id, r });
        break;
      }
      case "idle":
        entity.energy += 0.1;
        break;
    }
  }

  step(decisionFn: DecisionFn): void {
    this.tick++;
    this.events = [];
    const { config, grid, entities } = this;

    // Entity actions
    for (const entity of entities) {
      if (!entity.alive) continue;

      entity.energy -= config.energyDrainPerTick;
      entity.age++;

      if (entity.energy <= 0) {
        entity.alive = false;
        grid[entity.pos.y][entity.pos.x].occupied = false;
        this.totalDeaths++;
        this.events.push({ type: "death", x: entity.pos.x, y: entity.pos.y, id: entity.id });
        continue;
      }

      const neighbors = this.getNeighbors(entity.pos);
      const action = decisionFn(entity, neighbors);
      this.applyAction(entity, action);
    }

    // Trail decay
    for (let y = 0; y < config.height; y++) {
      for (let x = 0; x < config.width; x++) {
        if (grid[y][x].trail > 0) {
          grid[y][x].trail = Math.max(0, grid[y][x].trail - config.trailDecayRate);
        }
      }
    }

    // Resource regeneration
    for (let y = 0; y < config.height; y++) {
      for (let x = 0; x < config.width; x++) {
        if (grid[y][x].resource === 0 && this.rng() < config.resourceRegenRate) {
          grid[y][x].resource = 0.2 + this.rng() * 0.5;
        }
      }
    }
  }

  getEntityResults(): EntityResult[] {
    return this.entities.map((e) => ({
      id: e.id,
      survived: e.alive,
      age: e.age,
      totalHarvested: e.totalHarvested,
      trailsLeft: e.trailsLeft,
      distanceTraveled: e.distanceTraveled,
      finalEnergy: e.energy,
      generation: e.generation,
      parentIds: e.parentIds,
    }));
  }

  isFinished(): boolean {
    return (
      this.tick >= this.config.maxTicks ||
      this.entities.every((e) => !e.alive)
    );
  }
}
