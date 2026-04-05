// src/world-v2.ts — World engine v2: multi-cell organisms with bodies
// Entities are organisms that grow from a seed cell via L-system rules.
// The world has terrain, and beauty is measured on body forms, not trails.

import type { Vec2, Cell, WorldConfig, WorldEvent } from "./life-types.ts";
import { Body, type BodyGenome, type BodyCell, type GrowthRule, scoreBodyBeauty } from "./body.ts";

export interface Organism {
  id: number;
  body: Body;
  energy: number;
  age: number;
  alive: boolean;
  totalHarvested: number;
  generation: number;
  parentIds: number[];
  bornAtTick: number;
}

export type OrganismAction =
  | { type: "grow" }         // attempt to grow body according to growth rules
  | { type: "move"; direction: Vec2 }  // move entire body
  | { type: "harvest" }      // harvest with all mouth cells
  | { type: "pulse"; color: number }   // aesthetic emission from skin cells
  | { type: "idle" }

export type OrganismDecisionFn = (
  organism: Organism,
  nearbyResources: Vec2[],
  nearbyOrganisms: { id: number; distance: number; cellCount: number }[],
  worldTick: number,
) => OrganismAction;

export interface WorldV2Result {
  organisms: {
    id: number;
    survived: boolean;
    age: number;
    cellCount: number;
    bodyBeauty: ReturnType<typeof scoreBodyBeauty>;
    totalHarvested: number;
    generation: number;
  }[];
  worldBeauty: number;         // aggregate beauty of all living bodies
  ecosystemDiversity: number;  // how different organisms are from each other
  survivalRate: number;
  avgBodySize: number;
  avgAge: number;
  totalTicks: number;
  grid: Cell[][];
}

// Mulberry32 PRNG
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class WorldV2 {
  config: WorldConfig;
  grid: Cell[][];
  organisms: Organism[];
  events: WorldEvent[];
  tick: number;
  rng: () => number;
  private nextId: number;

  constructor(config: WorldConfig, genomes: BodyGenome[]) {
    this.config = config;
    this.tick = 0;
    this.events = [];
    this.rng = mulberry32(config.seed);
    this.nextId = 0;

    // Initialize grid
    this.grid = Array.from({ length: config.height }, () =>
      Array.from({ length: config.width }, () => ({
        resource: 0,
        trail: 0,
        trailColor: 0,
        occupied: false,
      }))
    );

    // Place resources
    let placed = 0;
    while (placed < config.initialResources) {
      const x = Math.floor(this.rng() * config.width);
      const y = Math.floor(this.rng() * config.height);
      if (this.grid[y][x].resource === 0) {
        this.grid[y][x].resource = 0.3 + this.rng() * 0.7;
        placed++;
      }
    }

    // Spawn organisms with spacing
    this.organisms = genomes.map((genome) => {
      const center = this.findOpenSpace();
      const body = new Body(center, genome);
      this.markOccupied(body);
      const org: Organism = {
        id: this.nextId++,
        body,
        energy: 30,
        age: 0,
        alive: true,
        totalHarvested: 0,
        generation: 0,
        parentIds: [],
        bornAtTick: 0,
      };
      return org;
    });
  }

  private findOpenSpace(): Vec2 {
    for (let i = 0; i < 100; i++) {
      const x = 3 + Math.floor(this.rng() * (this.config.width - 6));
      const y = 3 + Math.floor(this.rng() * (this.config.height - 6));
      if (!this.grid[y][x].occupied) return { x, y };
    }
    return { x: Math.floor(this.config.width / 2), y: Math.floor(this.config.height / 2) };
  }

  private markOccupied(body: Body): void {
    for (const pos of body.getWorldPositions()) {
      const wx = ((pos.x % this.config.width) + this.config.width) % this.config.width;
      const wy = ((pos.y % this.config.height) + this.config.height) % this.config.height;
      this.grid[wy][wx].occupied = true;
    }
  }

  private clearOccupied(body: Body): void {
    for (const pos of body.getWorldPositions()) {
      const wx = ((pos.x % this.config.width) + this.config.width) % this.config.width;
      const wy = ((pos.y % this.config.height) + this.config.height) % this.config.height;
      this.grid[wy][wx].occupied = false;
    }
  }

  step(decisionFn: OrganismDecisionFn): void {
    this.tick++;
    this.events = [];

    for (const org of this.organisms) {
      if (!org.alive) continue;

      org.energy -= this.config.energyDrainPerTick * (1 + org.body.cells.length * 0.02);
      org.age++;

      if (org.energy <= 0) {
        org.alive = false;
        this.clearOccupied(org.body);
        continue;
      }

      // Gather perception
      const nearbyResources: Vec2[] = [];
      const center = org.body.center;
      const eyeCount = org.body.countByType("eye");
      const perceptionRadius = 3 + eyeCount * 2;

      for (let dy = -perceptionRadius; dy <= perceptionRadius; dy++) {
        for (let dx = -perceptionRadius; dx <= perceptionRadius; dx++) {
          if (Math.sqrt(dx * dx + dy * dy) > perceptionRadius) continue;
          const wx = ((center.x + dx) % this.config.width + this.config.width) % this.config.width;
          const wy = ((center.y + dy) % this.config.height + this.config.height) % this.config.height;
          if (this.grid[wy][wx].resource > 0.1) {
            nearbyResources.push({ x: wx, y: wy });
          }
        }
      }

      const nearbyOrganisms = this.organisms
        .filter(o => o.alive && o.id !== org.id)
        .map(o => {
          const dx = o.body.center.x - center.x;
          const dy = o.body.center.y - center.y;
          return { id: o.id, distance: Math.sqrt(dx * dx + dy * dy), cellCount: o.body.cells.length };
        })
        .filter(o => o.distance < perceptionRadius * 2);

      const action = decisionFn(org, nearbyResources, nearbyOrganisms, this.tick);
      this.applyAction(org, action);
    }

    // Trail decay + resource regen
    for (let y = 0; y < this.config.height; y++) {
      for (let x = 0; x < this.config.width; x++) {
        if (this.grid[y][x].trail > 0) {
          this.grid[y][x].trail = Math.max(0, this.grid[y][x].trail - this.config.trailDecayRate);
        }
        if (this.grid[y][x].resource === 0 && this.rng() < this.config.resourceRegenRate) {
          this.grid[y][x].resource = 0.2 + this.rng() * 0.5;
        }
      }
    }
  }

  private applyAction(org: Organism, action: OrganismAction): void {
    switch (action.type) {
      case "grow": {
        const newCells = org.body.grow(org.energy, this.rng);
        org.energy -= newCells.length * org.body.genome.growthEnergyCost;
        this.markOccupied(org.body);
        break;
      }
      case "move": {
        const legCount = org.body.countByType("leg");
        if (legCount === 0 && org.body.cells.length > 1) break; // can't move without legs (single cells can always move)

        this.clearOccupied(org.body);
        org.body.center.x = ((org.body.center.x + action.direction.x) % this.config.width + this.config.width) % this.config.width;
        org.body.center.y = ((org.body.center.y + action.direction.y) % this.config.height + this.config.height) % this.config.height;
        this.markOccupied(org.body);

        // Leave trail from skin cells
        for (const cell of org.body.cells) {
          if (cell.type === "skin") {
            const wx = ((org.body.center.x + cell.offset.x) % this.config.width + this.config.width) % this.config.width;
            const wy = ((org.body.center.y + cell.offset.y) % this.config.height + this.config.height) % this.config.height;
            this.grid[wy][wx].trail = Math.min(1, this.grid[wy][wx].trail + 0.3);
            this.grid[wy][wx].trailColor = cell.color;
          }
        }

        org.energy -= this.config.moveCost * (1 + org.body.cells.length * 0.05);
        break;
      }
      case "harvest": {
        const mouths = org.body.cells.filter(c => c.type === "mouth");
        if (mouths.length === 0) {
          // Core can harvest too, just less efficiently
          const cx = ((org.body.center.x) % this.config.width + this.config.width) % this.config.width;
          const cy = ((org.body.center.y) % this.config.height + this.config.height) % this.config.height;
          if (this.grid[cy][cx].resource > 0) {
            const gained = this.grid[cy][cx].resource * this.config.harvestGain * 0.5;
            org.energy += gained;
            org.totalHarvested += gained;
            this.grid[cy][cx].resource = 0;
          }
          break;
        }
        for (const mouth of mouths) {
          const wx = ((org.body.center.x + mouth.offset.x) % this.config.width + this.config.width) % this.config.width;
          const wy = ((org.body.center.y + mouth.offset.y) % this.config.height + this.config.height) % this.config.height;
          if (this.grid[wy][wx].resource > 0) {
            const gained = this.grid[wy][wx].resource * this.config.harvestGain;
            org.energy += gained;
            org.totalHarvested += gained;
            this.grid[wy][wx].resource = 0;
          }
        }
        break;
      }
      case "pulse": {
        for (const cell of org.body.cells) {
          if (cell.type === "skin" || cell.type === "core") {
            const wx = ((org.body.center.x + cell.offset.x) % this.config.width + this.config.width) % this.config.width;
            const wy = ((org.body.center.y + cell.offset.y) % this.config.height + this.config.height) % this.config.height;
            this.grid[wy][wx].trail = Math.min(1, this.grid[wy][wx].trail + 0.5);
            this.grid[wy][wx].trailColor = action.color;
          }
        }
        org.energy -= 0.5;
        break;
      }
      case "idle":
        org.energy += 0.05;
        break;
    }
  }

  isFinished(): boolean {
    return this.tick >= this.config.maxTicks || this.organisms.every(o => !o.alive);
  }

  getResults(): WorldV2Result {
    const alive = this.organisms.filter(o => o.alive);

    const organismResults = this.organisms.map(o => ({
      id: o.id,
      survived: o.alive,
      age: o.age,
      cellCount: o.body.cells.length,
      bodyBeauty: scoreBodyBeauty(o.body),
      totalHarvested: o.totalHarvested,
      generation: o.generation,
    }));

    // World beauty = average body beauty of living organisms
    const livingBeauties = organismResults.filter(o => o.survived).map(o => o.bodyBeauty.total);
    const worldBeauty = livingBeauties.length > 0
      ? livingBeauties.reduce((a, b) => a + b, 0) / livingBeauties.length
      : 0;

    // Ecosystem diversity — how different are organisms from each other?
    let diversitySum = 0;
    let diversityPairs = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i].body.cells.length;
        const b = alive[j].body.cells.length;
        const sizeDiff = Math.abs(a - b) / Math.max(a, b, 1);
        const typesA = new Set(alive[i].body.cells.map(c => c.type));
        const typesB = new Set(alive[j].body.cells.map(c => c.type));
        const typeOverlap = [...typesA].filter(t => typesB.has(t)).length / Math.max(typesA.size, typesB.size, 1);
        diversitySum += sizeDiff * 0.5 + (1 - typeOverlap) * 0.5;
        diversityPairs++;
      }
    }
    const ecosystemDiversity = diversityPairs > 0 ? diversitySum / diversityPairs : 0;

    return {
      organisms: organismResults,
      worldBeauty,
      ecosystemDiversity,
      survivalRate: alive.length / Math.max(this.organisms.length, 1),
      avgBodySize: alive.length > 0 ? alive.reduce((s, o) => s + o.body.cells.length, 0) / alive.length : 0,
      avgAge: this.organisms.reduce((s, o) => s + o.age, 0) / Math.max(this.organisms.length, 1),
      totalTicks: this.tick,
      grid: this.grid,
    };
  }
}
