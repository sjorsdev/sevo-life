// src/organism-v2.ts — Organisms with internal state, development, and geometry
//
// Each organism has:
// - A Gene Regulatory Network (GRN) that controls development
// - Internal chemical signals that change over time
// - Geometric shape that emerges from growth rules
// - Memory (recent states influence future behavior)
//
// Based on THINK ideas: morphogenesis, evo-devo, honest signaling

import type { V2 } from "./sim.ts";
import { v2 } from "./sim.ts";

// --- Internal State: chemicals inside the organism ---
export interface InternalState {
  signals: number[];    // 8 internal chemical concentrations (0-1)
  age: number;
  energy: number;
  stress: number;       // accumulated damage / starvation
  memory: number[];     // last 5 signal snapshots (flattened)
}

// --- Gene Regulatory Network: controls what the organism does ---
// Each gene: IF signal[input] > threshold THEN modify signal[output] by weight
export interface Gene {
  inputSignal: number;   // 0-7, which internal signal to read
  threshold: number;     // 0-1, activation threshold
  outputSignal: number;  // 0-7, which signal to modify
  weight: number;        // -1 to 1, how much to change it
  // Development control
  growthTrigger: boolean;  // if true, activation triggers cell growth
  growthAngle: number;     // direction of growth (radians)
  growthType: CellKind;    // what kind of cell to grow
}

export type CellKind = "body" | "sensor" | "mouth" | "display" | "anchor";

// --- Geometric Cell: actual shape with position, size, and kind ---
export interface GeoCell {
  localPos: V2;          // position relative to organism center
  radius: number;
  kind: CellKind;
  color: [number, number, number];
  angle: number;         // orientation
  growthAge: number;     // when this cell was grown
  // Display cells have extra properties (for beauty/costly signaling)
  displayIntensity?: number;  // 0-1, how bright (costs energy)
}

// --- Organism Genome v2 ---
export interface GenomeV2 {
  grn: Gene[];                    // gene regulatory network (8-20 genes)
  initialSignals: number[];       // starting internal state (8 values)
  baseColor: [number, number, number];
  displayColor: [number, number, number];
  maxCells: number;               // body size limit
  metabolicRate: number;          // 0.5-2, energy consumption speed
  displayCost: number;            // energy cost of display cells (costly signaling)
  growthEnergy: number;           // energy needed per new cell
  sensorRange: number;            // how far sensors can detect
  moveSpeed: number;              // base movement speed
  // Shape parameters
  baseRadius: number;
  symmetryMode: "bilateral" | "radial" | "asymmetric";
  branchAngle: number;            // base angle between branches
}

// --- Organism v2 ---
export interface OrganismV2 {
  id: number;
  pos: V2;
  vel: V2;
  cells: GeoCell[];
  genome: GenomeV2;
  state: InternalState;
  alive: boolean;
  totalHarvested: number;
  generation: number;
  parentId: number | null;
}

// --- Development: run the GRN to update internal state and grow ---
export function developStep(org: OrganismV2, envSignals: number[]): GeoCell[] {
  const { genome, state } = org;
  const newCells: GeoCell[] = [];

  // Inject environment into signals (first 2 signals = external)
  state.signals[0] = envSignals[0] ?? 0; // local food
  state.signals[1] = envSignals[1] ?? 0; // local chemistry B
  // Signal 2 = energy level
  state.signals[2] = Math.min(1, state.energy / 100);
  // Signal 3 = stress
  state.signals[3] = Math.min(1, state.stress / 50);
  // Signal 4 = body size ratio
  state.signals[4] = org.cells.length / genome.maxCells;
  // Signals 5-7 are internal (set by GRN)

  // Run GRN
  const deltas = new Array(8).fill(0);
  for (const gene of genome.grn) {
    const input = state.signals[gene.inputSignal] ?? 0;
    if (input > gene.threshold) {
      const activation = (input - gene.threshold) * gene.weight;
      deltas[gene.outputSignal] += activation;

      // Growth trigger
      if (gene.growthTrigger && org.cells.length < genome.maxCells && state.energy > genome.growthEnergy) {
        const parentCell = org.cells[org.cells.length - 1] ?? org.cells[0];
        const angle = gene.growthAngle + parentCell.angle;
        const dist = genome.baseRadius * 2.2;

        const newPos = v2.add(parentCell.localPos, {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
        });

        // Check symmetry
        const positions = [newPos];
        if (genome.symmetryMode === "bilateral") {
          positions.push({ x: -newPos.x, y: newPos.y });
        } else if (genome.symmetryMode === "radial") {
          for (let i = 1; i < 4; i++) {
            positions.push(v2.rot(newPos, (Math.PI * 2 / 4) * i));
          }
        }

        for (const pos of positions) {
          // Don't overlap existing cells
          const overlap = org.cells.some(c => v2.dist(c.localPos, pos) < genome.baseRadius * 1.5);
          if (overlap) continue;
          if (org.cells.length + newCells.length >= genome.maxCells) break;

          const isDisplay = gene.growthType === "display";
          const color: [number, number, number] = isDisplay
            ? [...genome.displayColor] as [number, number, number]
            : genome.baseColor.map((c, i) => {
                const grad = org.cells.length / genome.maxCells;
                return Math.round(c + (genome.displayColor[i] - c) * grad * 0.3);
              }) as [number, number, number];

          const cell: GeoCell = {
            localPos: pos,
            radius: genome.baseRadius * (gene.growthType === "sensor" ? 0.6 : gene.growthType === "display" ? 0.8 : 1),
            kind: gene.growthType,
            color,
            angle,
            growthAge: state.age,
            displayIntensity: isDisplay ? 0.5 : undefined,
          };

          newCells.push(cell);
          state.energy -= genome.growthEnergy;
          if (isDisplay) state.energy -= genome.displayCost; // extra cost for beauty
        }
      }
    }
  }

  // Apply signal deltas
  for (let i = 0; i < 8; i++) {
    state.signals[i] = Math.max(0, Math.min(1, state.signals[i] + deltas[i] * 0.1));
  }

  // Update memory (rolling window of signal snapshots)
  state.memory = [...state.signals, ...state.memory.slice(0, 32)];

  state.age++;
  org.cells.push(...newCells);
  return newCells;
}

// --- Mutation: create varied offspring ---
export function mutateGenome(parent: GenomeV2, rng: () => number): GenomeV2 {
  const child: GenomeV2 = JSON.parse(JSON.stringify(parent));

  // Mutate GRN genes
  for (const gene of child.grn) {
    if (rng() < 0.2) gene.threshold = Math.max(0, Math.min(1, gene.threshold + (rng() - 0.5) * 0.2));
    if (rng() < 0.2) gene.weight = Math.max(-1, Math.min(1, gene.weight + (rng() - 0.5) * 0.3));
    if (rng() < 0.1) gene.growthAngle += (rng() - 0.5) * 0.8;
    if (rng() < 0.05) gene.inputSignal = Math.floor(rng() * 8);
    if (rng() < 0.05) gene.outputSignal = Math.floor(rng() * 8);
    if (rng() < 0.05) gene.growthTrigger = !gene.growthTrigger;
    if (rng() < 0.05) {
      const kinds: CellKind[] = ["body", "sensor", "mouth", "display", "anchor"];
      gene.growthType = kinds[Math.floor(rng() * kinds.length)];
    }
  }

  // Add gene (rare)
  if (rng() < 0.08 && child.grn.length < 20) {
    const kinds: CellKind[] = ["body", "sensor", "mouth", "display", "anchor"];
    child.grn.push({
      inputSignal: Math.floor(rng() * 8),
      threshold: rng() * 0.8,
      outputSignal: Math.floor(rng() * 8),
      weight: (rng() - 0.5) * 0.5,
      growthTrigger: rng() < 0.3,
      growthAngle: (rng() - 0.5) * Math.PI * 2,
      growthType: kinds[Math.floor(rng() * kinds.length)],
    });
  }

  // Remove gene (rare)
  if (rng() < 0.05 && child.grn.length > 4) {
    child.grn.splice(Math.floor(rng() * child.grn.length), 1);
  }

  // Mutate body params
  child.maxCells = Math.max(5, Math.min(40, child.maxCells + Math.floor((rng() - 0.5) * 4)));
  child.metabolicRate = Math.max(0.3, Math.min(3, child.metabolicRate + (rng() - 0.5) * 0.2));
  child.displayCost = Math.max(0, child.displayCost + (rng() - 0.5) * 0.5);
  child.moveSpeed = Math.max(0.1, Math.min(2, child.moveSpeed + (rng() - 0.5) * 0.2));
  child.sensorRange = Math.max(10, Math.min(100, child.sensorRange + (rng() - 0.5) * 10));
  child.baseRadius = Math.max(2, Math.min(8, child.baseRadius + (rng() - 0.5) * 1));
  child.branchAngle += (rng() - 0.5) * 0.3;

  // Mutate colors
  child.baseColor = child.baseColor.map(c => Math.max(0, Math.min(255, c + Math.floor((rng() - 0.5) * 30)))) as [number, number, number];
  child.displayColor = child.displayColor.map(c => Math.max(0, Math.min(255, c + Math.floor((rng() - 0.5) * 30)))) as [number, number, number];

  // Symmetry mutation (rare)
  if (rng() < 0.05) {
    const modes: Array<"bilateral" | "radial" | "asymmetric"> = ["bilateral", "radial", "asymmetric"];
    child.symmetryMode = modes[Math.floor(rng() * modes.length)];
  }

  return child;
}

// --- Measure organism geometric complexity ---
export function measureComplexity(org: OrganismV2): {
  cellCount: number;
  typeCount: number;
  symmetryScore: number;
  branchingDepth: number;
  displayRatio: number;
  signalActivity: number;
} {
  const cells = org.cells;
  const types = new Set(cells.map(c => c.kind));

  // Symmetry
  let mirrorMatches = 0, mirrorTotal = 0;
  for (const c of cells) {
    if (Math.abs(c.localPos.x) < 1) continue;
    mirrorTotal++;
    if (cells.some(m => Math.abs(m.localPos.x + c.localPos.x) < 3 && Math.abs(m.localPos.y - c.localPos.y) < 3)) {
      mirrorMatches++;
    }
  }

  // Branching depth — max distance from center in cell hops
  const maxDist = cells.length > 0 ? Math.max(...cells.map(c => v2.len(c.localPos))) / (org.genome.baseRadius * 2) : 0;

  // Display ratio — how much of the body is decoration (costly signaling)
  const displayCells = cells.filter(c => c.kind === "display").length;

  // Signal activity — how much the internal state is changing
  const signalActivity = org.state.signals.reduce((s, v) => s + Math.abs(v - 0.5), 0) / 8;

  return {
    cellCount: cells.length,
    typeCount: types.size,
    symmetryScore: mirrorTotal > 0 ? mirrorMatches / mirrorTotal : 0,
    branchingDepth: maxDist,
    displayRatio: cells.length > 0 ? displayCells / cells.length : 0,
    signalActivity,
  };
}
