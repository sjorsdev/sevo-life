// src/body.ts — Multi-cell organism bodies with L-system growth
// Entities are no longer single pixels. They grow from a seed cell
// into complex shapes via growth rules encoded in their genome.

import type { Vec2 } from "./life-types.ts";

/** A single cell in an organism's body */
export interface BodyCell {
  offset: Vec2;       // relative to organism center
  type: CellType;
  energy: number;     // local energy storage
  age: number;        // ticks since this cell grew
  color: number;      // 0-5 hue
}

export type CellType =
  | "core"        // center of the organism, processes energy
  | "mouth"       // harvests resources from the world
  | "leg"         // enables movement
  | "eye"         // extends perception radius
  | "skin"        // protects, contributes to form/beauty
  | "reproductive" // can spawn offspring

/** Growth rules — an L-system-like grammar for body development */
export interface GrowthRule {
  from: CellType;           // which cell type triggers this rule
  direction: Vec2;          // relative growth direction
  produces: CellType;       // what cell type grows
  minAge: number;           // cell must be this old before growing
  energyCost: number;       // energy required to grow
  probability: number;      // 0-1, chance per tick
  maxInstances: number;     // max cells of this type in the body
  symmetry: boolean;        // if true, also grow mirrored version
}

/** Body genome — encodes how an organism grows and looks */
export interface BodyGenome {
  // Growth program
  growthRules: GrowthRule[];
  maxCells: number;           // body size limit
  growthEnergyCost: number;   // base energy per new cell

  // Appearance
  coreColor: number;          // 0-5
  skinColor: number;          // 0-5
  colorGradient: boolean;     // cells color shifts with distance from core

  // Form preferences (influence growth direction)
  bilateralSymmetry: number;  // 0-1, tendency for left-right symmetry
  radialSymmetry: number;     // 0-1, tendency for rotational symmetry
  elongation: number;         // 0-1, prefer vertical growth
  branching: number;          // 0-1, tendency to branch
}

/** A living organism body */
export class Body {
  cells: BodyCell[];
  center: Vec2;
  genome: BodyGenome;
  age: number;

  constructor(center: Vec2, genome: BodyGenome) {
    this.center = center;
    this.genome = genome;
    this.age = 0;
    // Start with a single core cell
    this.cells = [{
      offset: { x: 0, y: 0 },
      type: "core",
      energy: 20,
      age: 0,
      color: genome.coreColor,
    }];
  }

  /** Get absolute world positions of all cells */
  getWorldPositions(): Vec2[] {
    return this.cells.map(c => ({
      x: this.center.x + c.offset.x,
      y: this.center.y + c.offset.y,
    }));
  }

  /** Get the bounding box of this body */
  getBounds(): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of this.cells) {
      minX = Math.min(minX, c.offset.x);
      maxX = Math.max(maxX, c.offset.x);
      minY = Math.min(minY, c.offset.y);
      maxY = Math.max(maxY, c.offset.y);
    }
    return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  /** Count cells by type */
  countByType(type: CellType): number {
    return this.cells.filter(c => c.type === type).length;
  }

  /** Check if an offset is occupied */
  hasCell(offset: Vec2): boolean {
    return this.cells.some(c => c.offset.x === offset.x && c.offset.y === offset.y);
  }

  /** Try to grow one tick. Returns new cells added. */
  grow(availableEnergy: number, rng: () => number): BodyCell[] {
    this.age++;
    for (const c of this.cells) c.age++;

    if (this.cells.length >= this.genome.maxCells) return [];

    const newCells: BodyCell[] = [];

    for (const rule of this.genome.growthRules) {
      if (this.cells.length + newCells.length >= this.genome.maxCells) break;
      if (availableEnergy < rule.energyCost) continue;

      // Count existing instances of the target type
      const existing = this.cells.filter(c => c.type === rule.produces).length +
        newCells.filter(c => c.type === rule.produces).length;
      if (existing >= rule.maxInstances) continue;

      // Find source cells that match
      const sources = this.cells.filter(c => c.type === rule.from && c.age >= rule.minAge);
      for (const source of sources) {
        if (rng() > rule.probability) continue;
        if (this.cells.length + newCells.length >= this.genome.maxCells) break;

        const newOffset = {
          x: source.offset.x + rule.direction.x,
          y: source.offset.y + rule.direction.y,
        };

        // Don't overlap existing cells
        if (this.hasCell(newOffset) || newCells.some(c => c.offset.x === newOffset.x && c.offset.y === newOffset.y)) continue;

        const color = this.genome.colorGradient
          ? (this.genome.coreColor + Math.floor(Math.sqrt(newOffset.x ** 2 + newOffset.y ** 2))) % 6
          : rule.produces === "skin" ? this.genome.skinColor : this.genome.coreColor;

        newCells.push({
          offset: newOffset,
          type: rule.produces,
          energy: 5,
          age: 0,
          color,
        });
        availableEnergy -= rule.energyCost;

        // Bilateral symmetry — mirror across Y axis
        if (rule.symmetry && this.genome.bilateralSymmetry > 0.5) {
          const mirrorOffset = { x: -newOffset.x, y: newOffset.y };
          if (!this.hasCell(mirrorOffset) && !newCells.some(c => c.offset.x === mirrorOffset.x && c.offset.y === mirrorOffset.y)) {
            newCells.push({
              offset: mirrorOffset,
              type: rule.produces,
              energy: 5,
              age: 0,
              color,
            });
            availableEnergy -= rule.energyCost;
          }
        }
      }
    }

    this.cells.push(...newCells);
    return newCells;
  }
}

/** Score the beauty of a body's form */
export function scoreBodyBeauty(body: Body): {
  formSymmetry: number;
  proportion: number;
  complexity: number;
  colorHarmony: number;
  total: number;
} {
  const cells = body.cells;
  if (cells.length <= 1) return { formSymmetry: 0, proportion: 0, complexity: 0, colorHarmony: 0, total: 0 };

  // Form symmetry — how symmetric is the body shape?
  let mirrorMatches = 0;
  let mirrorTotal = 0;
  for (const c of cells) {
    if (c.offset.x === 0) continue; // center line
    mirrorTotal++;
    const mirror = cells.find(m => m.offset.x === -c.offset.x && m.offset.y === c.offset.y);
    if (mirror) {
      mirrorMatches++;
      // Bonus for same type mirrored
      if (mirror.type === c.type) mirrorMatches += 0.5;
    }
  }
  const formSymmetry = mirrorTotal > 0 ? Math.min(1, mirrorMatches / mirrorTotal) : 0;

  // Proportion — golden ratio of width to height
  const bounds = body.getBounds();
  const ratio = bounds.width / Math.max(bounds.height, 1);
  const goldenRatio = 1.618;
  const inverseGolden = 1 / goldenRatio;
  const closestGolden = Math.min(
    Math.abs(ratio - goldenRatio),
    Math.abs(ratio - inverseGolden),
    Math.abs(ratio - 1), // square is also beautiful
  );
  const proportion = Math.max(0, 1 - closestGolden);

  // Complexity — number of distinct cell types used × body size factor
  const usedTypes = new Set(cells.map(c => c.type));
  const typeDiversity = usedTypes.size / 6; // 6 possible types
  const sizeFactor = Math.min(1, cells.length / body.genome.maxCells);
  const complexity = 0.6 * typeDiversity + 0.4 * sizeFactor;

  // Color harmony — same as world beauty but on body colors
  const colorCounts = [0, 0, 0, 0, 0, 0];
  for (const c of cells) colorCounts[c.color % 6]++;
  const usedColors = colorCounts
    .map((count, i) => ({ color: i, ratio: count / cells.length }))
    .filter(c => c.ratio > 0.05);

  let harmonySum = 0;
  let pairs = 0;
  for (let i = 0; i < usedColors.length; i++) {
    for (let j = i + 1; j < usedColors.length; j++) {
      const dist = Math.min(
        Math.abs(usedColors[i].color - usedColors[j].color),
        6 - Math.abs(usedColors[i].color - usedColors[j].color),
      );
      harmonySum += dist === 3 ? 1.0 : dist === 2 ? 0.8 : 0.5;
      pairs++;
    }
  }
  const colorHarmony = pairs > 0 ? harmonySum / pairs : 0.3;

  const total = formSymmetry * 0.35 + proportion * 0.20 + complexity * 0.25 + colorHarmony * 0.20;

  return { formSymmetry, proportion, complexity, colorHarmony, total };
}
