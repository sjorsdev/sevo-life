// src/sim.ts — Particle-based life simulation in continuous 2D space
//
// Organisms are clusters of particles connected by springs.
// The world has chemistry (reaction-diffusion), flow fields, and seasons.
// Beauty measured by compression progress (Schmidhuber), not fixed formula.

import { createChemField, stepChemistry, depositChemical, readChemical, patternEntropy, patternStructure, type ChemField } from "./chemistry.ts";
import { BeautyEngine, countUniquePatterns } from "./compression-beauty.ts";

// --- Vector math ---
export interface V2 { x: number; y: number }
export const v2 = {
  add: (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s }),
  len: (a: V2): number => Math.sqrt(a.x * a.x + a.y * a.y),
  norm: (a: V2): V2 => { const l = v2.len(a); return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; },
  dist: (a: V2, b: V2): number => v2.len(v2.sub(a, b)),
  rot: (a: V2, rad: number): V2 => ({
    x: a.x * Math.cos(rad) - a.y * Math.sin(rad),
    y: a.x * Math.sin(rad) + a.y * Math.cos(rad),
  }),
  angle: (a: V2): number => Math.atan2(a.y, a.x),
};

// --- Particle ---
export interface Particle {
  pos: V2;
  vel: V2;
  radius: number;
  mass: number;
  color: [number, number, number]; // RGB 0-255
  age: number;
  type: "core" | "flesh" | "mouth" | "sensor" | "fin" | "spike";
  energy: number;
}

// --- Spring (connects particles within an organism) ---
export interface Spring {
  a: number; // index into organism.particles
  b: number;
  restLength: number;
  stiffness: number;
  damping: number;
}

// --- Organism genome ---
export interface Genome {
  // Growth program — when to add particles and how
  growthSteps: GrowthStep[];
  maxParticles: number;

  // Base colors (RGB)
  baseColor: [number, number, number];
  accentColor: [number, number, number];

  // Physics
  springStiffness: number;   // 0.01-0.5, how rigid
  springDamping: number;     // 0.01-0.3, how springy
  drag: number;              // 0.9-0.99, fluid resistance
  baseRadius: number;        // 2-8, particle size

  // Behavior
  resourceAttraction: number;  // 0-1
  flockingStrength: number;    // 0-1, attraction to others
  avoidanceRadius: number;     // how close before repelling
  pulseRate: number;           // 0-1, rhythmic expansion/contraction
  swimStrength: number;        // 0-1, how actively it moves
}

export interface GrowthStep {
  triggerAge: number;          // grow when organism reaches this age
  parentType: "core" | "flesh" | "mouth" | "sensor" | "fin" | "spike";
  childType: "core" | "flesh" | "mouth" | "sensor" | "fin" | "spike";
  angle: number;               // radians from parent
  distance: number;            // rest length of connecting spring
  mirror: boolean;             // bilateral symmetry — also grow at -angle
  childRadius: number;         // size multiplier (0.5-2)
  childColor: "base" | "accent" | "gradient"; // how to color
}

// --- Organism ---
export interface Organism {
  id: number;
  particles: Particle[];
  springs: Spring[];
  genome: Genome;
  age: number;
  energy: number;
  alive: boolean;
  totalHarvested: number;
}

// --- World resource ---
export interface Resource {
  pos: V2;
  amount: number;  // 0-1
  radius: number;
  regrowRate: number;
}

// --- Flow field (world is alive) ---
export interface FlowField {
  resolution: number;  // cells per unit
  width: number;
  height: number;
  field: V2[][];       // velocity at each cell
  phase: number;       // evolves over time
}

// --- World ---
export interface WorldConfig {
  width: number;
  height: number;
  maxTicks: number;
  resourceCount: number;
  flowStrength: number;
  gravity: number;  // 0 = no gravity, >0 = downward pull
}

export const DEFAULT_WORLD: WorldConfig = {
  width: 800,
  height: 600,
  maxTicks: 500,
  resourceCount: 60,
  flowStrength: 0.2,
  gravity: 0,
};

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

export class World {
  config: WorldConfig;
  organisms: Organism[];
  resources: Resource[];
  flow: FlowField;
  chem: ChemField;              // reaction-diffusion chemistry — the world's body
  beauty: BeautyEngine;         // compression progress tracker
  tick: number;
  rng: () => number;
  private nextId: number;

  constructor(config: WorldConfig, genomes: Genome[], seed = 42) {
    this.config = config;
    this.tick = 0;
    this.rng = mulberry32(seed);
    this.nextId = 0;

    // Chemistry — the world is alive, a slow giant organism
    // Reaction-diffusion creates organic patterns that organisms interact with
    const chemRes = 4; // each chem pixel = 4 world units
    this.chem = createChemField(
      Math.ceil(config.width / chemRes),
      Math.ceil(config.height / chemRes),
      0.055, // feed rate — sweet spot for spots/stripes
      0.062, // kill rate
    );

    // Beauty engine — tracks compression progress over time
    this.beauty = new BeautyEngine();

    // Create flow field — swirling currents that change over time
    const res = 20;
    const fw = Math.ceil(config.width / res);
    const fh = Math.ceil(config.height / res);
    this.flow = {
      resolution: res,
      width: fw,
      height: fh,
      field: Array.from({ length: fh }, (_, y) =>
        Array.from({ length: fw }, (_, x) => {
          // Initial flow: gentle circular patterns
          const cx = x / fw - 0.5, cy = y / fh - 0.5;
          return { x: -cy * config.flowStrength, y: cx * config.flowStrength };
        })
      ),
      phase: 0,
    };

    // Scatter resources
    this.resources = Array.from({ length: config.resourceCount }, () => ({
      pos: { x: this.rng() * config.width, y: this.rng() * config.height },
      amount: 0.5 + this.rng() * 0.5,
      radius: 10 + this.rng() * 20,
      regrowRate: 0.002 + this.rng() * 0.005,
    }));

    // Spawn organisms
    this.organisms = genomes.map((genome) => this.spawnOrganism(genome));
  }

  spawnOrganism(genome: Genome, pos?: V2): Organism {
    const p = pos ?? {
      x: 50 + this.rng() * (this.config.width - 100),
      y: 50 + this.rng() * (this.config.height - 100),
    };

    // Start with a single core particle
    const org: Organism = {
      id: this.nextId++,
      particles: [{
        pos: { ...p },
        vel: { x: 0, y: 0 },
        radius: genome.baseRadius,
        mass: 1,
        color: [...genome.baseColor] as [number, number, number],
        age: 0,
        type: "core",
        energy: 30,
      }],
      springs: [],
      genome,
      age: 0,
      energy: 50,
      alive: true,
      totalHarvested: 0,
    };

    return org;
  }

  step(): void {
    this.tick++;

    // Chemistry — the world's body evolves (reaction-diffusion)
    // Run 2 chemistry steps per world step (chemistry is faster/smaller scale)
    stepChemistry(this.chem, 2);

    // Organisms deposit chemicals where they are — they shape the world
    for (const org of this.organisms) {
      if (!org.alive) continue;
      for (const p of org.particles) {
        const chemX = p.pos.x / 4; // world→chem coordinates
        const chemY = p.pos.y / 4;
        // Living particles deposit chemical B — they leave a chemical trace
        depositChemical(this.chem, chemX, chemY, "b", 0.02, 1);
      }
    }

    // Track beauty via compression progress every 10 ticks
    if (this.tick % 10 === 0) {
      const entropy = patternEntropy(this.chem);
      const structure = patternStructure(this.chem);
      const uniqueP = countUniquePatterns(this.chem.b, this.chem.width, this.chem.height);
      this.beauty.record(this.tick, entropy, structure, uniqueP);
    }

    // Evolve flow field — world breathes
    this.flow.phase += 0.01;
    for (let y = 0; y < this.flow.height; y++) {
      for (let x = 0; x < this.flow.width; x++) {
        const cx = x / this.flow.width - 0.5;
        const cy = y / this.flow.height - 0.5;
        const phase = this.flow.phase;
        this.flow.field[y][x] = {
          x: (-cy + 0.1 * Math.sin(phase + cx * 6)) * this.config.flowStrength,
          y: (cx + 0.1 * Math.cos(phase + cy * 6)) * this.config.flowStrength,
        };
      }
    }

    // Seasons — world physics shift every 100 ticks
    // No single organism design can be optimal in all seasons
    const season = Math.floor(this.tick / 100) % 4;
    const seasonNames = ["calm", "storm", "drought", "bloom"];
    if (this.tick % 100 === 0 && this.tick > 0) {
      // Storm: strong currents, scattered resources
      if (season === 1) {
        this.config.flowStrength = 0.5;
        for (const r of this.resources) r.regrowRate *= 0.5;
      }
      // Drought: resources shrink and slow regen
      else if (season === 2) {
        this.config.flowStrength = 0.1;
        for (const r of this.resources) { r.radius *= 0.7; r.regrowRate *= 0.3; }
      }
      // Bloom: resources explode, easy living
      else if (season === 3) {
        this.config.flowStrength = 0.2;
        for (const r of this.resources) { r.amount = 1; r.radius *= 1.5; r.regrowRate *= 3; }
      }
      // Calm: restore defaults
      else {
        this.config.flowStrength = 0.2;
        for (const r of this.resources) { r.regrowRate = 0.002 + 0.005 * this.rng(); r.radius = 10 + this.rng() * 20; }
      }
    }

    // Resource regrowth
    for (const r of this.resources) {
      r.amount = Math.min(1, r.amount + r.regrowRate);
    }

    // Update organisms
    for (const org of this.organisms) {
      if (!org.alive) continue;
      org.age++;
      // Energy drain varies by season — storms cost more
      const seasonDrainMult = season === 1 ? 1.5 : season === 2 ? 1.3 : 1.0;
      org.energy -= (0.03 + org.particles.length * 0.005) * seasonDrainMult;

      if (org.energy <= 0) {
        org.alive = false;
        continue;
      }

      // Growth
      this.growOrganism(org);

      // Physics
      this.updatePhysics(org);

      // Behavior — swim toward resources
      this.applyBehavior(org);

      // Harvest
      this.harvest(org);

      // Social energy — beautiful organisms near you give energy (mutualism)
      this.socialInteraction(org);

      // LIVE EVOLUTION SIGNAL: organisms in chemically interesting areas get energy.
      // Compression progress feeds directly into survival — beauty = fitness, in real-time.
      if (this.tick % 20 === 0) {
        const center = this.getCenter(org);
        const chemX = Math.floor(center.x / 4);
        const chemY = Math.floor(center.y / 4);
        // Read local chemical B — organisms thrive where chemistry is active
        const localB = readChemical(this.chem, chemX, chemY, "b");
        // Energy bonus proportional to local chemical activity
        // High B = active reaction zone = interesting = energy
        org.energy += localB * 0.5;

        // Global beauty bonus — if the whole system is getting more interesting,
        // all organisms benefit (rising tide lifts all boats)
        const beautyScore = this.beauty.beauty();
        org.energy += beautyScore.total * 0.2;
      }

      // Reproduction — organisms with enough energy and age spawn offspring
      if (org.energy > 40 && org.age > 100 && org.particles.length >= org.genome.maxParticles * 0.5) {
        const alive = this.organisms.filter(o => o.alive);
        if (alive.length < 12) { // population cap
          // Mutate genome — parameters AND structure
          const childGenome: Genome = JSON.parse(JSON.stringify(org.genome));
          // Parameter mutations
          childGenome.baseRadius = org.genome.baseRadius * (0.85 + this.rng() * 0.3);
          childGenome.swimStrength = Math.min(1, Math.max(0, org.genome.swimStrength + (this.rng() - 0.5) * 0.15));
          childGenome.pulseRate = Math.min(1, Math.max(0, org.genome.pulseRate + (this.rng() - 0.5) * 0.15));
          childGenome.drag = Math.min(0.99, Math.max(0.9, org.genome.drag + (this.rng() - 0.5) * 0.03));
          childGenome.springStiffness = Math.max(0.005, org.genome.springStiffness * (0.7 + this.rng() * 0.6));
          childGenome.springDamping = Math.max(0.005, org.genome.springDamping * (0.7 + this.rng() * 0.6));
          childGenome.maxParticles = Math.max(5, Math.min(30, childGenome.maxParticles + Math.floor((this.rng() - 0.5) * 4)));
          childGenome.resourceAttraction = Math.min(1, Math.max(0, org.genome.resourceAttraction + (this.rng() - 0.5) * 0.15));
          childGenome.flockingStrength = Math.min(1, Math.max(0, org.genome.flockingStrength + (this.rng() - 0.5) * 0.15));
          // Color mutation
          childGenome.baseColor = childGenome.baseColor.map(c =>
            Math.max(0, Math.min(255, c + Math.floor((this.rng() - 0.5) * 40)))
          ) as [number, number, number];
          childGenome.accentColor = childGenome.accentColor.map(c =>
            Math.max(0, Math.min(255, c + Math.floor((this.rng() - 0.5) * 40)))
          ) as [number, number, number];
          // Structural mutation: randomly adjust a growth step
          if (childGenome.growthSteps.length > 0 && this.rng() < 0.3) {
            const stepIdx = Math.floor(this.rng() * childGenome.growthSteps.length);
            const step = childGenome.growthSteps[stepIdx];
            step.angle += (this.rng() - 0.5) * 0.5;
            step.distance = Math.max(5, step.distance + (this.rng() - 0.5) * 6);
            step.childRadius = Math.max(0.3, Math.min(2, step.childRadius + (this.rng() - 0.5) * 0.3));
            step.probability = Math.max(0.1, Math.min(1, step.probability + (this.rng() - 0.5) * 0.2));
          }
          // Rare: add a new growth step
          if (this.rng() < 0.1 && childGenome.growthSteps.length < 10) {
            const types: Array<"core" | "flesh" | "mouth" | "sensor" | "fin" | "spike"> = ["flesh", "mouth", "sensor", "fin", "spike"];
            childGenome.growthSteps.push({
              triggerAge: 5 + Math.floor(this.rng() * 20),
              parentType: types[Math.floor(this.rng() * types.length)],
              childType: types[Math.floor(this.rng() * types.length)],
              angle: (this.rng() - 0.5) * Math.PI * 2,
              distance: 8 + this.rng() * 12,
              mirror: this.rng() > 0.5,
              childRadius: 0.5 + this.rng() * 1,
              childColor: this.rng() > 0.5 ? "accent" : "gradient",
            });
          }

          const center = this.getCenter(org);
          const offset = { x: (this.rng() - 0.5) * 60, y: (this.rng() - 0.5) * 60 };
          const childPos = { x: center.x + offset.x, y: center.y + offset.y };
          const child = this.spawnOrganism(childGenome, childPos);
          child.generation = (org as any).generation + 1;
          org.energy -= 20; // reproduction cost
        }
      }

      // Pulse — rhythmic expansion
      if (org.genome.pulseRate > 0) {
        const pulse = Math.sin(this.tick * org.genome.pulseRate * 0.1) * 0.3;
        for (const s of org.springs) {
          s.restLength *= (1 + pulse * 0.02);
        }
      }

      // Age particles
      for (const p of org.particles) p.age++;
    }
  }

  private growOrganism(org: Organism): void {
    if (org.particles.length >= org.genome.maxParticles) return;
    if (org.energy < 5) return;

    for (const step of org.genome.growthSteps) {
      if (org.age !== step.triggerAge) continue;
      if (org.particles.length >= org.genome.maxParticles) break;

      // Find parent particle
      const parentIdx = org.particles.findIndex(p => p.type === step.parentType);
      if (parentIdx < 0) continue;
      const parent = org.particles[parentIdx];

      const growOne = (angle: number) => {
        if (org.particles.length >= org.genome.maxParticles) return;
        const dir = v2.rot({ x: 1, y: 0 }, angle);
        const childPos = v2.add(parent.pos, v2.scale(dir, step.distance));

        let color: [number, number, number];
        if (step.childColor === "accent") color = [...org.genome.accentColor] as [number, number, number];
        else if (step.childColor === "gradient") {
          const t = org.particles.length / org.genome.maxParticles;
          color = org.genome.baseColor.map((c, i) =>
            Math.round(c + (org.genome.accentColor[i] - c) * t)
          ) as [number, number, number];
        } else color = [...org.genome.baseColor] as [number, number, number];

        const childIdx = org.particles.length;
        org.particles.push({
          pos: childPos,
          vel: { x: 0, y: 0 },
          radius: org.genome.baseRadius * step.childRadius,
          mass: step.childRadius,
          color,
          age: 0,
          type: step.childType,
          energy: 5,
        });

        org.springs.push({
          a: parentIdx,
          b: childIdx,
          restLength: step.distance,
          stiffness: org.genome.springStiffness,
          damping: org.genome.springDamping,
        });

        org.energy -= 2;
      };

      growOne(step.angle);
      if (step.mirror) growOne(-step.angle);
    }
  }

  private updatePhysics(org: Organism): void {
    const { config } = this;

    // Spring forces
    for (const spring of org.springs) {
      const a = org.particles[spring.a];
      const b = org.particles[spring.b];
      const delta = v2.sub(b.pos, a.pos);
      const dist = v2.len(delta);
      if (dist < 0.01) continue;

      const displacement = dist - spring.restLength;
      const dir = v2.norm(delta);
      const force = v2.scale(dir, displacement * spring.stiffness);

      // Damping
      const relVel = v2.sub(b.vel, a.vel);
      const dampForce = v2.scale(dir, v2.len(relVel) * spring.damping * Math.sign(displacement));

      a.vel = v2.add(a.vel, v2.scale(v2.add(force, dampForce), 1 / a.mass));
      b.vel = v2.sub(b.vel, v2.scale(v2.add(force, dampForce), 1 / b.mass));
    }

    // Flow field + drag + boundary
    for (const p of org.particles) {
      // Flow field force
      const fx = Math.floor(p.pos.x / this.flow.resolution);
      const fy = Math.floor(p.pos.y / this.flow.resolution);
      if (fx >= 0 && fx < this.flow.width && fy >= 0 && fy < this.flow.height) {
        const flowForce = this.flow.field[fy][fx];
        p.vel = v2.add(p.vel, v2.scale(flowForce, 0.05));
      }

      // Gravity
      if (config.gravity > 0) {
        p.vel.y += config.gravity;
      }

      // Drag
      p.vel = v2.scale(p.vel, org.genome.drag);

      // Integrate
      p.pos = v2.add(p.pos, p.vel);

      // Wrap boundaries
      p.pos.x = ((p.pos.x % config.width) + config.width) % config.width;
      p.pos.y = ((p.pos.y % config.height) + config.height) % config.height;
    }
  }

  private applyBehavior(org: Organism): void {
    if (org.particles.length === 0) return;
    const core = org.particles[0];

    // Swim toward nearest resource
    let nearestDist = Infinity;
    let nearestDir: V2 = { x: 0, y: 0 };
    for (const r of this.resources) {
      if (r.amount < 0.1) continue;
      const d = v2.dist(core.pos, r.pos);
      if (d < nearestDist) {
        nearestDist = d;
        nearestDir = v2.norm(v2.sub(r.pos, core.pos));
      }
    }

    if (nearestDist < 300) {
      const swimForce = v2.scale(nearestDir, org.genome.swimStrength * 0.3);
      // Apply to fin particles, or core if no fins
      const fins = org.particles.filter(p => p.type === "fin");
      const movers = fins.length > 0 ? fins : [core];
      for (const p of movers) {
        p.vel = v2.add(p.vel, swimForce);
      }
    }

    // Avoidance between organisms
    for (const other of this.organisms) {
      if (!other.alive || other.id === org.id) continue;
      const otherCore = other.particles[0];
      if (!otherCore) continue;
      const d = v2.dist(core.pos, otherCore.pos);
      if (d < org.genome.avoidanceRadius && d > 0.1) {
        const away = v2.norm(v2.sub(core.pos, otherCore.pos));
        core.vel = v2.add(core.vel, v2.scale(away, 0.5));
      }
    }
  }

  private harvest(org: Organism): void {
    const mouths = org.particles.filter(p => p.type === "mouth");
    const harvesters = mouths.length > 0 ? mouths : [org.particles[0]];
    const efficiency = mouths.length > 0 ? 1.0 : 0.3;

    for (const h of harvesters) {
      for (const r of this.resources) {
        if (r.amount < 0.05) continue;
        const d = v2.dist(h.pos, r.pos);
        if (d < r.radius + h.radius) {
          const gained = Math.min(r.amount, 0.1) * 5 * efficiency;
          org.energy += gained;
          org.totalHarvested += gained;
          r.amount -= Math.min(r.amount, 0.1);
        }
      }
    }
  }

  private socialInteraction(org: Organism): void {
    // Organisms near beautiful others gain energy — beauty becomes a survival advantage.
    // This couples beauty to fitness: the more beautiful your neighbors, the better you do.
    // Mechanism: beautiful organisms attract resources (like flowers attract pollinators).
    const center = this.getCenter(org);

    for (const other of this.organisms) {
      if (!other.alive || other.id === org.id) continue;
      const otherCenter = this.getCenter(other);
      const dist = v2.dist(center, otherCenter);

      if (dist > 100 || dist < 1) continue;

      // Both organisms benefit from proximity if they're different (diversity bonus)
      const sizeDiff = Math.abs(org.particles.length - other.particles.length);
      const diversityBonus = Math.min(1, sizeDiff / 5);

      // Energy transfer based on neighbor's particle count (proxy for form complexity)
      const complexity = Math.min(1, other.particles.length / other.genome.maxParticles);
      const proximity = 1 - dist / 100;

      const energyGain = proximity * complexity * diversityBonus * 0.05;
      org.energy += energyGain;
    }
  }

  isFinished(): boolean {
    return this.tick >= this.config.maxTicks || this.organisms.every(o => !o.alive);
  }

  getCenter(org: Organism): V2 {
    if (org.particles.length === 0) return { x: 0, y: 0 };
    const sum = org.particles.reduce((s, p) => v2.add(s, p.pos), { x: 0, y: 0 });
    return v2.scale(sum, 1 / org.particles.length);
  }
}
