// src/life-runner.ts — Dedicated runner for sevo-life fork
// Follows fork-runner.ts pattern, runs evolution cycles on life agents

import { queryNodes, writeNode } from "./graph.ts";
import { run, SEVO_PERMISSIONS } from "./runner.ts";
import { score } from "./scorer.ts";
import { reportDiscovery } from "./reporter.ts";
import type { AgentNode, FitnessNode, BenchmarkNode } from "./types.ts";

const CLAUDE_PATH = `${Deno.env.get("HOME")}/.local/bin/claude`;
const FORK_DIR = "forks/sevo-life";
const MAX_CYCLES = 5;

async function callClaude(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const cmd = new Deno.Command(CLAUDE_PATH, {
        args: ["-p", prompt, "--output-format", "text", "--model", "haiku"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const stdout = new TextDecoder().decode(result.stdout).trim();
      if (!result.success || !stdout) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, attempt * 15_000));
          continue;
        }
        throw new Error(
          `claude CLI failed: ${new TextDecoder().decode(result.stderr).slice(0, 200)}`,
        );
      }
      return stdout;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, attempt * 15_000));
    }
  }
  throw new Error("callClaude: unreachable");
}

async function getLifeAgents(): Promise<AgentNode[]> {
  return await queryNodes<AgentNode>(
    "agent",
    (n) => n.status === "active" && n.domain === "sevo-life",
  );
}

async function getLifeBenchmark(): Promise<BenchmarkNode | null> {
  const benchmarks = await queryNodes<BenchmarkNode>("benchmark", (n) =>
    n["@id"].includes("life"),
  );
  if (benchmarks.length === 0) {
    // Try fork-local benchmarks
    try {
      const text = await Deno.readTextFile(
        `${FORK_DIR}/graph/benchmarks/benchmark-life-v1.jsonld`,
      );
      return JSON.parse(text) as BenchmarkNode;
    } catch {
      return null;
    }
  }
  return benchmarks.sort((a, b) => b.version - a.version)[0];
}

async function runLifeCycle(
  cycle: number,
  agents: AgentNode[],
  benchmark: BenchmarkNode,
): Promise<void> {
  const cycleId = `life-cycle-${cycle}-${Date.now()}`;
  console.log(`\n--- sevo-life cycle ${cycle} ---`);

  // Run each agent's blueprint
  const fitnessResults: { agent: AgentNode; fitness: FitnessNode }[] = [];

  for (const agent of agents) {
    console.log(`  Running ${agent["@id"]}...`);
    const permissions = {
      ...SEVO_PERMISSIONS,
      read: [...SEVO_PERMISSIONS.read, `./${FORK_DIR}`],
    };

    try {
      const result = await run(agent.blueprint, permissions, 60_000);
      if (result.success && result.fitnessOutput) {
        const fitness = await score(agent["@id"], result, cycleId);
        fitnessResults.push({ agent, fitness });
        console.log(
          `  ${agent["@id"]}: fitness=${(result.fitnessOutput.fitness as number)?.toFixed(3)} EQS=${fitness.eqs.toFixed(3)}`,
        );
      } else {
        console.log(`  ${agent["@id"]}: FAILED — ${result.stderr.slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  ${agent["@id"]}: ERROR — ${(e as Error).message.slice(0, 100)}`);
    }
  }

  if (fitnessResults.length === 0) {
    console.log("  No successful runs this cycle.");
    return;
  }

  // Find best agent
  const best = fitnessResults.sort((a, b) => b.fitness.eqs - a.fitness.eqs)[0];
  console.log(`  Best: ${best.agent["@id"]} EQS=${best.fitness.eqs.toFixed(3)}`);

  // Report discovery
  await reportDiscovery("eqs_milestone", {
    agentId: best.agent["@id"],
    eqs: best.fitness.eqs,
    previousBest: 0,
    generation: best.agent.generation,
    cycleId,
    domain: "sevo-life",
    fitness: best.fitness.context,
  });

  // Mutate best agent for next cycle
  try {
    const blueprint = await Deno.readTextFile(best.agent.blueprint);
    const truncated = blueprint.slice(0, 3000);

    const prompt = `You are mutating a sevo-life agent to improve survival + beauty fitness.

Current blueprint (truncated):
\`\`\`typescript
${truncated}
\`\`\`

Current fitness: ${JSON.stringify(best.fitness.context)}
EQS: ${best.fitness.eqs.toFixed(3)}

The agent controls entities in a 2D grid world. Entities must survive (harvest resources)
and create beautiful trail patterns. Fitness = 0.5*survival + 0.3*beauty + 0.2*efficiency.

Propose ONE specific change to the decision function or genome values.
Focus on the weakest metric.

Respond with JSON only:
{"reasoning": "why", "change": "what to change", "targetMetric": "survivalRate|beautyScore|efficiency"}`;

    const response = await callClaude(prompt);
    console.log(`  Mutation proposed: ${response.slice(0, 100)}...`);
  } catch (e) {
    console.log(`  Mutation failed: ${(e as Error).message.slice(0, 100)}`);
  }
}

// Main
async function main() {
  console.log("sevo-life runner starting...");

  let agents = await getLifeAgents();
  if (agents.length === 0) {
    // Register the first agent from fork-local graph
    try {
      const text = await Deno.readTextFile(
        `${FORK_DIR}/graph/agents/agent-life-v1.jsonld`,
      );
      const agentNode = JSON.parse(text) as AgentNode;
      await writeNode(agentNode);
      agents = [agentNode];
      console.log("Registered initial life agent.");
    } catch (e) {
      console.error(`Failed to load initial agent: ${(e as Error).message}`);
      Deno.exit(1);
    }
  }

  const benchmark = await getLifeBenchmark();
  if (!benchmark) {
    console.error("No benchmark found for sevo-life.");
    Deno.exit(1);
  }

  console.log(`Agents: ${agents.length}, Benchmark: ${benchmark["@id"]}`);

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    await runLifeCycle(cycle, agents, benchmark);
    agents = await getLifeAgents(); // refresh after mutations
    await new Promise((r) => setTimeout(r, 2000)); // cooldown
  }

  console.log("\nsevo-life runner finished.");
}

main();
