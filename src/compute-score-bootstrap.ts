#!/usr/bin/env -S deno run --allow-all
// One-time bootstrap: compute SevoScore from existing graph data.

import { computeSevoScore } from "./sevoscore.ts";
import { queryNodes } from "./graph.ts";
import type { AgentNode, FitnessNode } from "./types.ts";

const agents = await queryNodes<AgentNode>("agent", (a) => a.status === "active");
const fitness = await queryNodes<FitnessNode>("fitness");

const sorted = fitness.sort((a, b) => b.eqs - a.eqs);
const bestFitness = sorted[0];
const bestAgentId = bestFitness?.agent ?? "unknown";
const bestEqs = bestFitness?.eqs ?? 0;

const latestPerAgent = new Map<string, number>();
for (const f of fitness) {
  latestPerAgent.set(f.agent, Math.max(latestPerAgent.get(f.agent) ?? 0, f.eqs));
}
const avgFitness = latestPerAgent.size > 0
  ? [...latestPerAgent.values()].reduce((a, b) => a + b, 0) / latestPerAgent.size
  : 0;

console.log(`Bootstrap SevoScore for sevo-life:`);
console.log(`  Active agents: ${agents.length}`);
console.log(`  Total fitness records: ${fitness.length}`);
console.log(`  Best: ${bestAgentId} (EQS: ${bestEqs.toFixed(3)})`);

const result = await computeSevoScore(
  `bootstrap-${Date.now()}`,
  bestAgentId,
  bestEqs,
  avgFitness,
);

console.log(`\nDone! SevoScore: ${result.score}`);
