// life-v2-agent-v1.ts — First particle-based organism agent
// Organisms are spring-connected particles in continuous 2D space.
// Three species: a jellyfish, a crawler, and a floater.

import { World, DEFAULT_WORLD, type Genome } from "../src/sim.ts";
import { scoreWorldBeauty } from "../src/sim-beauty.ts";

const jellyfish: Genome = {
  growthSteps: [
    // Bell shape — flesh radiating from core
    { triggerAge: 5, parentType: "core", childType: "flesh", angle: -Math.PI / 2, distance: 15, mirror: false, childRadius: 1.2, childColor: "gradient" },
    { triggerAge: 8, parentType: "core", childType: "flesh", angle: -Math.PI / 3, distance: 18, mirror: true, childRadius: 1.0, childColor: "gradient" },
    { triggerAge: 12, parentType: "core", childType: "flesh", angle: -Math.PI / 6, distance: 20, mirror: true, childRadius: 0.8, childColor: "accent" },
    // Tentacles — sensor particles hanging below
    { triggerAge: 15, parentType: "core", childType: "sensor", angle: Math.PI / 2, distance: 20, mirror: false, childRadius: 0.5, childColor: "accent" },
    { triggerAge: 18, parentType: "sensor", childType: "sensor", angle: Math.PI / 2, distance: 15, mirror: false, childRadius: 0.4, childColor: "accent" },
    { triggerAge: 20, parentType: "core", childType: "sensor", angle: Math.PI / 2 + 0.4, distance: 18, mirror: true, childRadius: 0.5, childColor: "accent" },
    // Mouth at bottom
    { triggerAge: 22, parentType: "sensor", childType: "mouth", angle: Math.PI / 2, distance: 12, mirror: false, childRadius: 0.6, childColor: "base" },
    // Fins for swimming
    { triggerAge: 10, parentType: "flesh", childType: "fin", angle: 0, distance: 12, mirror: true, childRadius: 0.7, childColor: "accent" },
  ],
  maxParticles: 20,
  baseColor: [100, 140, 255],
  accentColor: [200, 120, 255],
  springStiffness: 0.03,
  springDamping: 0.05,
  drag: 0.97,
  baseRadius: 5,
  resourceAttraction: 0.8,
  flockingStrength: 0.2,
  avoidanceRadius: 40,
  pulseRate: 0.8,
  swimStrength: 0.4,
};

const crawler: Genome = {
  growthSteps: [
    // Elongated body
    { triggerAge: 3, parentType: "core", childType: "flesh", angle: 0, distance: 12, mirror: false, childRadius: 1.0, childColor: "base" },
    { triggerAge: 6, parentType: "flesh", childType: "flesh", angle: 0, distance: 12, mirror: false, childRadius: 0.9, childColor: "gradient" },
    { triggerAge: 9, parentType: "flesh", childType: "flesh", angle: 0, distance: 12, mirror: false, childRadius: 0.8, childColor: "gradient" },
    // Head with sensors
    { triggerAge: 4, parentType: "core", childType: "sensor", angle: -Math.PI / 4, distance: 10, mirror: true, childRadius: 0.5, childColor: "accent" },
    // Legs along body
    { triggerAge: 7, parentType: "flesh", childType: "fin", angle: Math.PI / 2, distance: 8, mirror: true, childRadius: 0.6, childColor: "accent" },
    { triggerAge: 11, parentType: "flesh", childType: "fin", angle: Math.PI / 2, distance: 8, mirror: true, childRadius: 0.6, childColor: "accent" },
    // Mouth at front
    { triggerAge: 5, parentType: "core", childType: "mouth", angle: -Math.PI / 8, distance: 8, mirror: false, childRadius: 0.7, childColor: "base" },
    // Tail spike
    { triggerAge: 13, parentType: "flesh", childType: "spike", angle: 0, distance: 10, mirror: false, childRadius: 0.5, childColor: "accent" },
  ],
  maxParticles: 18,
  baseColor: [80, 200, 100],
  accentColor: [200, 255, 80],
  springStiffness: 0.08,
  springDamping: 0.1,
  drag: 0.95,
  baseRadius: 4,
  resourceAttraction: 0.85,
  flockingStrength: 0.1,
  avoidanceRadius: 30,
  pulseRate: 0.2,
  swimStrength: 0.7,
};

const floater: Genome = {
  growthSteps: [
    // Radial symmetry — bloom shape
    { triggerAge: 4, parentType: "core", childType: "flesh", angle: 0, distance: 14, mirror: false, childRadius: 0.8, childColor: "gradient" },
    { triggerAge: 4, parentType: "core", childType: "flesh", angle: Math.PI * 2 / 5, distance: 14, mirror: false, childRadius: 0.8, childColor: "gradient" },
    { triggerAge: 4, parentType: "core", childType: "flesh", angle: Math.PI * 4 / 5, distance: 14, mirror: false, childRadius: 0.8, childColor: "gradient" },
    { triggerAge: 4, parentType: "core", childType: "flesh", angle: Math.PI * 6 / 5, distance: 14, mirror: false, childRadius: 0.8, childColor: "gradient" },
    { triggerAge: 4, parentType: "core", childType: "flesh", angle: Math.PI * 8 / 5, distance: 14, mirror: false, childRadius: 0.8, childColor: "gradient" },
    // Petal tips — sensors
    { triggerAge: 10, parentType: "flesh", childType: "sensor", angle: 0, distance: 10, mirror: false, childRadius: 0.5, childColor: "accent" },
    // Central mouth
    { triggerAge: 8, parentType: "core", childType: "mouth", angle: Math.PI / 2, distance: 8, mirror: false, childRadius: 0.6, childColor: "accent" },
  ],
  maxParticles: 15,
  baseColor: [255, 140, 100],
  accentColor: [255, 220, 150],
  springStiffness: 0.02,
  springDamping: 0.03,
  drag: 0.98,
  baseRadius: 6,
  resourceAttraction: 0.75,
  flockingStrength: 0.4,
  avoidanceRadius: 50,
  pulseRate: 0.6,
  swimStrength: 0.2,
};

// Run simulation
const genomes = [jellyfish, crawler, floater, jellyfish, crawler, floater];
const world = new World(DEFAULT_WORLD, genomes, Date.now() % 100000);

while (!world.isFinished()) {
  world.step();
}

const beauty = scoreWorldBeauty(world);
const alive = world.organisms.filter(o => o.alive);
const survivalRate = alive.length / world.organisms.length;
const efficiency = world.organisms.reduce((s, o) => s + o.totalHarvested, 0) /
  (world.organisms.length * world.config.maxTicks * 0.1);

// Dynamic weights — once surviving, focus on beauty
const survivalSolved = survivalRate > 0.7;
const wSurvival = survivalSolved ? 0.15 : 0.40;
const wBeauty = survivalSolved ? 0.55 : 0.35;
const wEfficiency = survivalSolved ? 0.10 : 0.15;
const wDiversity = survivalSolved ? 0.20 : 0.10;

const fitness = wSurvival * survivalRate + wBeauty * beauty.total +
  wEfficiency * Math.min(1, efficiency) + wDiversity * beauty.diversityOfForms;

console.log(JSON.stringify({
  fitness: Math.round(fitness * 1000) / 1000,
  branches: genomes.length,
  survivalRate: Math.round(survivalRate * 1000) / 1000,
  beautyScore: Math.round(beauty.total * 1000) / 1000,
  beauty: {
    formBeauty: Math.round(beauty.formBeauty * 1000) / 1000,
    symmetryQuality: Math.round(beauty.symmetryQuality * 1000) / 1000,
    proportionHarmony: Math.round(beauty.proportionHarmony * 1000) / 1000,
    colorCoherence: Math.round(beauty.colorCoherence * 1000) / 1000,
    diversityOfForms: Math.round(beauty.diversityOfForms * 1000) / 1000,
    spatialComposition: Math.round(beauty.spatialComposition * 1000) / 1000,
    motionGrace: Math.round(beauty.motionGrace * 1000) / 1000,
  },
  efficiency: Math.round(Math.min(1, efficiency) * 1000) / 1000,
  organisms: world.organisms.map(o => ({
    id: o.id,
    alive: o.alive,
    particles: o.particles.length,
    energy: Math.round(o.energy),
    age: o.age,
  })),
}));
