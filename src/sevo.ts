// src/sevo.ts — Self-driving SEVO evolution loop
// No human-provided tasks. No stopping when tasks run out.
// The system generates its own goals, benchmarks, mutations, and selections.

import { queryNodes, writeNode } from "./graph.ts";
import { run, SEVO_PERMISSIONS } from "./runner.ts";
import { score } from "./scorer.ts";
import { select } from "./selector.ts";
import { git } from "./git.ts";
import { getLatestBenchmark } from "./benchmark.ts";
import type {
  AgentNode,
  FitnessNode,
  BenchmarkNode,
  MutationNode,
} from "./types.ts";

// ---------------------------------------------------------------------------
// LLM helper — shells out to claude CLI
// ---------------------------------------------------------------------------
async function callClaude(prompt: string): Promise<string> {
  const cmd = new Deno.Command("claude", {
    args: ["-p", prompt, "--output-format", "text"],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`claude CLI failed: ${stderr}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

// ---------------------------------------------------------------------------
// Progress checkpoint — write before any stop
// ---------------------------------------------------------------------------
async function writeProgress(cycle: number, notes: string) {
  const active = await queryNodes<AgentNode>(
    "agent",
    (n) => n.status === "active"
  );
  const content = `# PROGRESS

## Cycle: ${cycle}
## Active agents: ${active.map((a) => `${a["@id"]}(gen${a.generation})`).join(", ")}
## Notes: ${notes}
## Timestamp: ${new Date().toISOString()}
`;
  await Deno.writeTextFile("PROGRESS.md", content);
  await git.add("PROGRESS.md");
  await git.commit(`progress: cycle ${cycle} — ${notes}`);
}

// ---------------------------------------------------------------------------
// Step 1: Benchmark all active agents, return sorted results
// ---------------------------------------------------------------------------
async function benchmarkAll(
  agents: AgentNode[],
  cycleId: string
): Promise<{ agent: AgentNode; fitness: FitnessNode }[]> {
  const results: { agent: AgentNode; fitness: FitnessNode }[] = [];

  for (const agent of agents) {
    console.log(`  Benchmarking ${agent["@id"]} (${agent.blueprint})...`);
    const runResult = await run(agent.blueprint, SEVO_PERMISSIONS);

    if (!runResult.success) {
      console.log(`    FAILED: ${runResult.stderr.slice(0, 150)}`);
      // Score a failed run as 0 fitness
      const fitness = await score(agent["@id"], runResult, cycleId);
      results.push({ agent, fitness });
      continue;
    }

    const fitness = await score(agent["@id"], runResult, cycleId);
    const appFitness = (runResult.fitnessOutput?.fitness as number) ?? 0;
    const branches = (runResult.fitnessOutput?.branches as number) ?? 1;
    console.log(
      `    fitness=${appFitness.toFixed(3)} branches=${branches} EQS=${fitness.eqs.toFixed(3)}`
    );
    results.push({ agent, fitness });
  }

  // Sort by EQS descending
  results.sort((a, b) => b.fitness.eqs - a.fitness.eqs);
  return results;
}

// ---------------------------------------------------------------------------
// Step 2: Mutate — actually generate new blueprint code via claude CLI
// ---------------------------------------------------------------------------
async function mutateAgent(
  agent: AgentNode,
  benchmark: BenchmarkNode,
  fitnessHistory: FitnessNode[]
): Promise<{ mutantPath: string; mutationNode: MutationNode } | null> {
  console.log(`  Mutating ${agent["@id"]}...`);

  const blueprint = await Deno.readTextFile(agent.blueprint);

  const historyText =
    fitnessHistory
      .slice(-5)
      .map(
        (f) =>
          `EQS=${f.eqs.toFixed(3)} fitness=${((f.context?.fitness as number) ?? 0).toFixed(3)} ` +
          `branches=${f.branchesExplored} accuracy=${f.accuracy}`
      )
      .join("\n") || "No history yet.";

  // Ask claude to generate the ACTUAL mutated blueprint code
  const prompt = `You are evolving a SEVO agent blueprint. Your job: produce an IMPROVED version.

CURRENT BLUEPRINT:
\`\`\`typescript
${blueprint}
\`\`\`

RECENT FITNESS HISTORY:
${historyText}

CURRENT BENCHMARK (difficulty ${benchmark.difficulty}):
${benchmark.task}
Scoring: ${benchmark.scoringLogic}
Pass threshold: ${benchmark.passThreshold}

RULES:
1. Output ONLY the complete new TypeScript file. No markdown fences. No explanation.
2. The file must be self-contained — no imports from other files.
3. It must output JSON on the last line: {"fitness": <0-1>, "branches": N, "correct": N, "total": N}
4. It must IMPROVE on the parent — add more tests, cover more edge cases, explore more strategies.
5. All tests must actually pass. Do not write tests that will fail.
6. The code must run with: deno run --allow-read --allow-write blueprints/file.ts

Focus on whatever the fitness history shows is weakest. If fitness is already 1.0, add MORE tests to make the benchmark harder to pass. If branches is low, add more strategies.`;

  try {
    const response = await callClaude(prompt);

    // Strip markdown fences if claude wrapped it
    let code = response;
    const fenceMatch = response.match(
      /```(?:typescript|ts)?\n([\s\S]*?)```/
    );
    if (fenceMatch) code = fenceMatch[1];

    // Write new blueprint
    const ts = Date.now();
    const gen = agent.generation + 1;
    const mutantPath = `./blueprints/agent-v${gen}-mut-${ts}.ts`;
    await Deno.writeTextFile(mutantPath, code);

    // Record the mutation
    const mutationNode: MutationNode = {
      "@context": "sevo://v1",
      "@type": "Mutation",
      "@id": `mutation-${agent["@id"].replace(/[^a-z0-9-]/gi, "-")}-${ts}`,
      timestamp: new Date().toISOString(),
      parent: agent["@id"],
      proposal: `LLM-generated mutation of ${agent.blueprint} targeting benchmark difficulty ${benchmark.difficulty}`,
      branch: "main",
      status: "testing",
      reasoning: `Auto-generated to improve EQS. Parent history: ${historyText.slice(0, 200)}`,
    };
    await writeNode(mutationNode);

    return { mutantPath, mutationNode };
  } catch (e) {
    console.log(
      `    Mutation generation failed: ${e instanceof Error ? e.message : "unknown"}`
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 3: Test a mutant blueprint — does it compile and run?
// ---------------------------------------------------------------------------
async function testMutant(
  mutantPath: string,
  cycleId: string
): Promise<{ success: boolean; fitness: number; runResult: ReturnType<typeof run> extends Promise<infer R> ? R : never } | null> {
  console.log(`  Testing mutant ${mutantPath}...`);
  const runResult = await run(mutantPath, SEVO_PERMISSIONS);

  if (!runResult.success) {
    console.log(`    Mutant FAILED: ${runResult.stderr.slice(0, 200)}`);
    return { success: false, fitness: 0, runResult };
  }

  const fitness = (runResult.fitnessOutput?.fitness as number) ?? 0;
  const branches = (runResult.fitnessOutput?.branches as number) ?? 1;
  console.log(`    Mutant result: fitness=${fitness.toFixed(3)} branches=${branches}`);
  return { success: true, fitness, runResult };
}

// ---------------------------------------------------------------------------
// Step 4: Register a winning mutant as a new agent
// ---------------------------------------------------------------------------
async function registerMutant(
  parent: AgentNode,
  mutantPath: string,
  mutationNode: MutationNode
): Promise<AgentNode> {
  const gen = parent.generation + 1;
  // Rename to canonical path
  const canonicalPath = `./blueprints/agent-v${gen}.ts`;
  try {
    await Deno.stat(canonicalPath);
    // Already exists — keep the mutation path
  } catch {
    await Deno.rename(mutantPath, canonicalPath);
  }
  const finalPath =
    (await Deno.stat(canonicalPath).catch(() => null)) ? canonicalPath : mutantPath;

  const newAgent: AgentNode = {
    "@context": "sevo://v1",
    "@type": "Agent",
    "@id": `agent:v${gen}`,
    timestamp: new Date().toISOString(),
    blueprint: finalPath,
    parent: parent["@id"],
    generation: gen,
    status: "active",
  };

  await writeNode(newAgent);
  await git.add(finalPath);
  await git.commit(`evolution: register agent-v${gen} from mutation of ${parent["@id"]}`);

  // Update mutation status
  const selectedMutation: MutationNode = {
    ...mutationNode,
    "@id": `${mutationNode["@id"]}-selected`,
    status: "selected",
    timestamp: new Date().toISOString(),
  };
  await writeNode(selectedMutation);

  return newAgent;
}

// ---------------------------------------------------------------------------
// Step 5: Evolve the benchmark when agents are too good
// ---------------------------------------------------------------------------
async function evolveBenchmark(
  current: BenchmarkNode,
  avgFitness: number
): Promise<BenchmarkNode | null> {
  if (avgFitness < 0.9) return null; // Benchmark is still challenging enough

  console.log(
    `  Benchmark too easy (avg fitness ${avgFitness.toFixed(3)}). Evolving...`
  );

  const newVersion = current.version + 1;
  const newDifficulty = current.difficulty + 1;
  const newThreshold = Math.min(current.passThreshold + 0.05, 0.95);

  try {
    const prompt = `You are evolving a SEVO benchmark to be harder.

CURRENT BENCHMARK (v${current.version}, difficulty ${current.difficulty}):
Task: ${current.task}
Scoring: ${current.scoringLogic}
Pass threshold: ${current.passThreshold}

All agents currently pass with avg fitness ${avgFitness.toFixed(3)}.

Create a HARDER version (difficulty ${newDifficulty}). Add requirements that will
challenge agents. Return JSON only, no fences:
{
  "task": "description of what agents must do",
  "scoringLogic": "how to evaluate",
  "newRequirements": "what was added"
}`;

    const response = await callClaude(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);

    const newBenchmark: BenchmarkNode = {
      "@context": "sevo://v1",
      "@type": "Benchmark",
      "@id": `benchmark-v${newVersion}`,
      timestamp: new Date().toISOString(),
      version: newVersion,
      parent: current["@id"],
      task: parsed.task,
      scoringLogic: parsed.scoringLogic,
      difficulty: newDifficulty,
      passThreshold: newThreshold,
    };

    await writeNode(newBenchmark);
    console.log(
      `  Benchmark evolved to v${newVersion} (difficulty ${newDifficulty}, threshold ${newThreshold})`
    );
    return newBenchmark;
  } catch (e) {
    console.log(
      `  Benchmark evolution failed: ${e instanceof Error ? e.message : "unknown"}`
    );
    return null;
  }
}

// ===========================================================================
// MAIN SELF-DRIVING LOOP
// ===========================================================================

console.log("SEVO starting — self-driving mode");
console.log(await git.log(10));

let cycle = 0;

while (true) {
  cycle++;
  const cycleId = `cycle-${Date.now()}`;

  console.log(`\n========== CYCLE ${cycle} ==========`);

  // --- Get active agents ---
  const agents = await queryNodes<AgentNode>(
    "agent",
    (n) => n.status === "active"
  );

  if (!agents.length) {
    console.log("FATAL: No active agents. Cannot continue.");
    await writeProgress(cycle, "FATAL: no active agents");
    break;
  }

  console.log(`Active agents: ${agents.map((a) => a["@id"]).join(", ")}`);

  // --- Get latest benchmark ---
  const benchmark = await getLatestBenchmark();
  if (!benchmark) {
    console.log("FATAL: No benchmark found.");
    await writeProgress(cycle, "FATAL: no benchmark");
    break;
  }
  console.log(
    `Benchmark: ${benchmark["@id"]} (difficulty ${benchmark.difficulty})`
  );

  // --- STEP 1: Benchmark all agents ---
  console.log("\n--- Benchmarking all agents ---");
  const results = await benchmarkAll(agents, cycleId);

  const best = results[0];
  const avgFitness =
    results.reduce(
      (sum, r) => sum + ((r.fitness.context?.fitness as number) ?? 0),
      0
    ) / results.length;

  console.log(
    `\nBest: ${best.agent["@id"]} (EQS=${best.fitness.eqs.toFixed(3)})`
  );
  console.log(`Average fitness: ${avgFitness.toFixed(3)}`);

  // --- STEP 2: Mutate the best agent ---
  console.log("\n--- Mutating best agent ---");
  const fitnessHistory = await queryNodes<FitnessNode>(
    "fitness",
    (n) => n.agent === best.agent["@id"]
  );
  const mutation = await mutateAgent(best.agent, benchmark, fitnessHistory);

  if (mutation) {
    // --- STEP 3: Test the mutant ---
    console.log("\n--- Testing mutant ---");
    const mutantResult = await testMutant(mutation.mutantPath, cycleId);

    if (mutantResult && mutantResult.success) {
      // Score the mutant
      const mutantFitness = await score(
        `mutant-of-${best.agent["@id"]}-${Date.now()}`,
        mutantResult.runResult,
        cycleId
      );

      const parentAppFitness =
        (best.fitness.context?.fitness as number) ?? 0;
      const mutantAppFitness = mutantResult.fitness;

      console.log(
        `\n  Parent fitness: ${parentAppFitness.toFixed(3)} | Mutant fitness: ${mutantAppFitness.toFixed(3)}`
      );

      // --- STEP 4: Selection ---
      if (mutantAppFitness >= parentAppFitness) {
        console.log("  MUTANT WINS — registering as new agent");
        const newAgent = await registerMutant(
          best.agent,
          mutation.mutantPath,
          mutation.mutationNode
        );

        // Record selection
        await select(
          newAgent["@id"],
          best.agent["@id"],
          mutantFitness,
          best.fitness
        );

        console.log(`  Registered: ${newAgent["@id"]} (gen ${newAgent.generation})`);
      } else {
        console.log("  Parent wins — mutant rejected");
        // Record the rejection
        await select(
          best.agent["@id"],
          `mutant-of-${best.agent["@id"]}`,
          best.fitness,
          mutantFitness
        );
        // Clean up failed mutant file
        try {
          await Deno.remove(mutation.mutantPath);
        } catch { /* ok */ }
      }
    } else {
      console.log("  Mutant failed to run — rejected");
      // Clean up
      try {
        await Deno.remove(mutation.mutantPath);
      } catch { /* ok */ }
    }
  }

  // --- STEP 5: Evolve benchmark if too easy ---
  console.log("\n--- Checking benchmark difficulty ---");
  await evolveBenchmark(benchmark, avgFitness);

  // --- Checkpoint ---
  await writeProgress(
    cycle,
    `best=${best.agent["@id"]} EQS=${best.fitness.eqs.toFixed(3)} avgFitness=${avgFitness.toFixed(3)}`
  );

  // Context management — stop after N cycles so Claude Code can resume
  if (cycle % 10 === 0) {
    console.log(
      "\nCheckpoint: pausing for context management. Resume to continue."
    );
    break;
  }
}

console.log("\nSEVO cycle complete. System will resume from PROGRESS.md.");
