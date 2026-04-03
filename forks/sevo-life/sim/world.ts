// sim/world.ts — 2D world engine for sevo-life

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
} from "./types.ts";

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
  readonly config: WorldConfig;
  readonly grid: Cell[][];
  readonly entities: Entity[];
  tick: number;
  private rng: () => number;

  constructor(config: WorldConfig, genomes: EntityGenome[]) {
    this.config = config;
    this.tick = 0;
    this.rng = mulberry32(config.seed);

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
      };
    });
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
          grid[entity.pos.y][entity.pos.x].occupied = false;
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
        // Visual pulse — leaves trails in a radius
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
        break;
      }
      case "idle":
        // Resting — slight energy conservation
        entity.energy += 0.1;
        break;
    }
  }

  step(decisionFn: DecisionFn): void {
    this.tick++;
    const { config, grid, entities } = this;

    // Entity actions
    for (const entity of entities) {
      if (!entity.alive) continue;

      entity.energy -= config.energyDrainPerTick;
      entity.age++;

      if (entity.energy <= 0) {
        entity.alive = false;
        grid[entity.pos.y][entity.pos.x].occupied = false;
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
    }));
  }

  isFinished(): boolean {
    return (
      this.tick >= this.config.maxTicks ||
      this.entities.every((e) => !e.alive)
    );
  }
}
