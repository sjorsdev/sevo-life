// web/build.ts — Bundle the sim engine from source for the browser
// Uses the REAL src/*.ts files — no copies, no drift
import { bundle } from "jsr:@deno/emit";

const entryPoint = new URL("./entry.ts", import.meta.url);
const result = await bundle(entryPoint);

const outPath = new URL("./sim.bundle.js", import.meta.url);
await Deno.writeTextFile(outPath, result.code);

console.log(`Bundled sim engine → ${outPath.pathname} (${result.code.length} bytes)`);
