// sim/renderer.ts — Terminal renderer for sevo-life

import type { Cell, Entity } from "./types.ts";

const TRAIL_COLORS = [
  "\x1b[31m", // 0: red
  "\x1b[33m", // 1: yellow
  "\x1b[32m", // 2: green
  "\x1b[36m", // 3: cyan
  "\x1b[34m", // 4: blue
  "\x1b[35m", // 5: magenta
];

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

const TRAIL_CHARS = [" ", ".", ":", "+", "#"];
const RESOURCE_CHAR = "*";
const ENTITY_CHAR = "@";

export function renderWorld(grid: Cell[][], entities: Entity[]): string {
  const h = grid.length;
  const w = grid[0].length;

  // Build entity position lookup
  const entityPos = new Map<string, Entity>();
  for (const e of entities) {
    if (e.alive) entityPos.set(`${e.pos.x},${e.pos.y}`, e);
  }

  const lines: string[] = [];
  lines.push(`${"─".repeat(w + 2)}`);

  for (let y = 0; y < h; y++) {
    let line = "│";
    for (let x = 0; x < w; x++) {
      const key = `${x},${y}`;
      const entity = entityPos.get(key);
      const cell = grid[y][x];

      if (entity) {
        const color = TRAIL_COLORS[entity.genome.trailColor % 6];
        line += `${BOLD}${color}${ENTITY_CHAR}${RESET}`;
      } else if (cell.resource > 0.1) {
        line += `${DIM}\x1b[33m${RESOURCE_CHAR}${RESET}`;
      } else if (cell.trail > 0.05) {
        const intensity = Math.min(4, Math.floor(cell.trail * 5));
        const color = TRAIL_COLORS[cell.trailColor % 6];
        line += `${color}${TRAIL_CHARS[intensity]}${RESET}`;
      } else {
        line += " ";
      }
    }
    line += "│";
    lines.push(line);
  }

  lines.push(`${"─".repeat(w + 2)}`);
  return lines.join("\n");
}

export function renderStats(
  tick: number,
  maxTicks: number,
  entities: Entity[],
): string {
  const alive = entities.filter((e) => e.alive).length;
  const avgEnergy =
    entities.filter((e) => e.alive).reduce((s, e) => s + e.energy, 0) /
    Math.max(alive, 1);
  return (
    `Tick ${tick}/${maxTicks} | Alive: ${alive}/${entities.length} | ` +
    `Avg Energy: ${avgEnergy.toFixed(1)}`
  );
}
