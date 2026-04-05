// src/chemistry.ts — Reaction-diffusion chemistry layer
// Based on Gray-Scott model: two chemicals A and B diffuse and react.
// Simple rules → organic patterns emerge (spots, stripes, spirals).
// Turing (1952) proved this generates the patterns of life.

export interface ChemField {
  width: number;
  height: number;
  a: Float64Array;  // chemical A concentration
  b: Float64Array;  // chemical B concentration
  feed: number;     // feed rate of A (F parameter)
  kill: number;     // kill rate of B (k parameter)
  dA: number;       // diffusion rate of A
  dB: number;       // diffusion rate of B
}

/** Create a chemistry field with initial conditions */
export function createChemField(
  width: number,
  height: number,
  feed = 0.055,    // sweet spot for interesting patterns
  kill = 0.062,
): ChemField {
  const size = width * height;
  const a = new Float64Array(size).fill(1.0);  // A starts full
  const b = new Float64Array(size).fill(0.0);  // B starts empty

  // Seed B in center region — this kicks off the reaction
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const r = 5;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const idx = (cy + dy) * width + (cx + dx);
        if (idx >= 0 && idx < size) {
          b[idx] = 1.0;
          a[idx] = 0.5;
        }
      }
    }
  }

  return { width, height, a, b, feed, kill, dA: 1.0, dB: 0.5 };
}

/** Laplacian using 3x3 kernel with wrapping */
function laplacian(field: Float64Array, x: number, y: number, w: number, h: number): number {
  const idx = (i: number, j: number) => ((j + h) % h) * w + ((i + w) % w);
  const center = field[idx(x, y)];
  return (
    field[idx(x - 1, y)] * 0.2 +
    field[idx(x + 1, y)] * 0.2 +
    field[idx(x, y - 1)] * 0.2 +
    field[idx(x, y + 1)] * 0.2 +
    field[idx(x - 1, y - 1)] * 0.05 +
    field[idx(x + 1, y - 1)] * 0.05 +
    field[idx(x - 1, y + 1)] * 0.05 +
    field[idx(x + 1, y + 1)] * 0.05 -
    center
  );
}

/** Step the reaction-diffusion system one tick */
export function stepChemistry(field: ChemField, steps = 1): void {
  const { width: w, height: h, feed: F, kill: k, dA, dB } = field;
  const size = w * h;

  for (let s = 0; s < steps; s++) {
    const newA = new Float64Array(size);
    const newB = new Float64Array(size);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const a = field.a[i];
        const b = field.b[i];
        const reaction = a * b * b;

        newA[i] = a + (dA * laplacian(field.a, x, y, w, h) - reaction + F * (1 - a));
        newB[i] = b + (dB * laplacian(field.b, x, y, w, h) + reaction - (k + F) * b);

        // Clamp
        newA[i] = Math.max(0, Math.min(1, newA[i]));
        newB[i] = Math.max(0, Math.min(1, newB[i]));
      }
    }

    field.a = newA;
    field.b = newB;
  }
}

/** Organisms interact with chemistry — deposit and absorb chemicals */
export function depositChemical(
  field: ChemField,
  x: number,
  y: number,
  chemical: "a" | "b",
  amount: number,
  radius = 2,
): void {
  const { width: w, height: h } = field;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const px = ((Math.floor(x) + dx) % w + w) % w;
      const py = ((Math.floor(y) + dy) % h + h) % h;
      const idx = py * w + px;
      const arr = chemical === "a" ? field.a : field.b;
      arr[idx] = Math.min(1, arr[idx] + amount);
    }
  }
}

/** Read chemical concentration at a point */
export function readChemical(field: ChemField, x: number, y: number, chemical: "a" | "b"): number {
  const { width: w, height: h } = field;
  const px = ((Math.floor(x)) % w + w) % w;
  const py = ((Math.floor(y)) % h + h) % h;
  const arr = chemical === "a" ? field.a : field.b;
  return arr[py * w + px];
}

// -----------------------------------------------------------------------
// Pattern analysis — what patterns has the chemistry produced?
// -----------------------------------------------------------------------

/** Measure pattern complexity using Shannon entropy of B concentrations */
export function patternEntropy(field: ChemField): number {
  const bins = 20;
  const counts = new Array(bins).fill(0);
  const total = field.b.length;

  for (let i = 0; i < total; i++) {
    const bin = Math.min(bins - 1, Math.floor(field.b[i] * bins));
    counts[bin]++;
  }

  let entropy = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy / Math.log2(bins); // normalized 0-1
}

/** Measure spatial structure — autocorrelation at different distances */
export function patternStructure(field: ChemField): number {
  const { width: w, height: h, b } = field;
  const lags = [2, 5, 10];
  let structure = 0;

  for (const lag of lags) {
    let corr = 0;
    let count = 0;
    for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w - lag; x += 3) {
        corr += b[y * w + x] * b[y * w + x + lag];
        count++;
      }
    }
    const avgCorr = count > 0 ? corr / count : 0;
    structure += avgCorr;
  }

  return Math.min(1, structure / lags.length * 5);
}
