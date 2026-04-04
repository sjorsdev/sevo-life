// src/fork-runner.ts — Domain-aware evolution runner
// Detects domain from goal.jsonld and runs appropriate evolution cycles.
// For sevo-life: evolves agent blueprints that control beings in a 2D world.
// Supports multi-goal forks (being beauty + world + simulation).

import { queryNodes, writeNode } from "./graph.ts";
import { run, SEVO_PERMISSIONS } from "./runner.ts";
import { score } from "./scorer.ts";
import { git } from "./git.ts";
import { reportDiscovery, pullLearnings } from "./reporter.ts";
import { computeSevoScore } from "./sevoscore.ts";
import type {
  AgentNode,
  FitnessNode,
  BenchmarkNode,
  SeedImprovementNode,
} from "./types.ts";

// ---------------------------------------------------------------------------
// LLM helper
// ---------------------------------------------------------------------------
async function callClaude(prompt: string, retries = 3): Promise<string> {
  const claudePath = `${Deno.env.get("HOME")}/.local/bin/claude`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const cmd = new Deno.Command(claudePath, {
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
        throw new Error(`claude CLI failed: ${new TextDecoder().decode(result.stderr).slice(0, 200)}`);
      }
      return stdout;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, attempt * 15_000));
    }
  }
  throw new Error("callClaude: unreachable");
}

// ---------------------------------------------------------------------------
// Goal loading — supports single and multi-goal formats
// ---------------------------------------------------------------------------
interface GoalConfig {
  id: string;
  name: string;
  domain: string;
  goals: Array<{ name: string; description: string; metric: string; evolvable: string[] }>;
  compositeFitness: string;
}

async function loadGoal(): Promise<GoalConfig> {
  const text = await Deno.readTextFile("./goal.jsonld");
  const goal = JSON.parse(text);

  // Multi-goal format (sevo-life style)
  if (goal.goals && Array.isArray(goal.goals)) {
    return {
      id: goal["@id"],
      name: goal.name,
      domain: goal["@id"].replace("goal:", ""),
      goals: goal.goals,
      compositeFitness: goal.composite_fitness ?? goal.metric ?? "",
    };
  }

  // Single-goal format (sevo-calc style, backward compatible)
  return {
    id: goal["@id"],
    name: goal.name,
    domain: goal["@id"].replace("goal:", ""),
    goals: [{
      name: goal.name,
      description: goal.note ?? "",
      metric: goal.metric,
      evolvable: [],
    }],
    compositeFitness: goal.metric,
  };
}

// ---------------------------------------------------------------------------
// Domain agent loading
// ---------------------------------------------------------------------------
async function getDomainAgents(domain: string): Promise<AgentNode[]> {
  const agents = await queryNodes<AgentNode>("agent",
    (n) => n.status === "active" && n.domain === domain,
  );

  // If no domain-tagged agents, check for life agents in graph
  if (agents.length === 0) {
    const allActive = await queryNodes<AgentNode>("agent",
      (n) => n.status === "active",
    );
    // Return any agents whose blueprint references the domain
    return allActive.filter((a) =>
      a.blueprint.includes("life-agent") || a.domain === domain
    );
  }

  return agents;
}

// ---------------------------------------------------------------------------
// Domain benchmark loading
// ---------------------------------------------------------------------------
async function getDomainBenchmark(domain: string): Promise<BenchmarkNode | null> {
  const benchmarks = await queryNodes<BenchmarkNode>("benchmark",
    (n) => n["@id"].includes(domain) || n["@id"].includes("life"),
  );
  if (benchmarks.length === 0) return null;
  return benchmarks.sort((a, b) => b.version - a.version)[0];
}

// ---------------------------------------------------------------------------
// Run a domain evolution cycle
// ---------------------------------------------------------------------------
async function runDomainCycle(
  goal: GoalConfig,
  cycle: number,
): Promise<{ improvements: string[]; bestFitness: number }> {
  const cycleId = `${goal.domain}-cycle-${cycle}-${Date.now()}`;
  const improvements: string[] = [];

  console.log(`\n--- ${goal.domain}: Cycle ${cycle} ---`);
  console.log(`  Goals: ${goal.goals.map(g => g.name).join(", ")}`);

  // Pull learnings from discovery server before evolving
  const learnings = await pullLearnings(goal.domain);
  if (learnings) {
    const recs = learnings.recommendations as Record<string, unknown> | undefined;
    const topPriority = recs?.topPriority as string | undefined;
    if (topPriority && topPriority !== "none") {
      console.log(`  Server recommends focus on: ${topPriority}`);
    }
    const crossInsights = learnings.crossInsights as Array<Record<string, unknown>> | undefined;
    if (crossInsights?.length) {
      console.log(`  Cross-domain insights: ${crossInsights.length}`);
    }
  }

  // Get agents and benchmark
  let agents = await getDomainAgents(goal.domain);
  const benchmark = await getDomainBenchmark(goal.domain);

  if (!benchmark) {
    console.log("  No domain benchmark found.");
    return { improvements: [], bestFitness: 0 };
  }

  // If no agents, register the initial one
  if (agents.length === 0) {
    const agentNode: AgentNode = {
      "@context": "sevo://v1",
      "@type": "Agent",
      "@id": `agent:life-v1-${Date.now()}`,
      timestamp: new Date().toISOString(),
      blueprint: "./blueprints/life-agent-v1.ts",
      generation: 1,
      status: "active",
      domain: goal.domain,
    };
    await writeNode(agentNode);
    agents = [agentNode];
    console.log(`  Registered initial agent: ${agentNode["@id"]}`);
  }

  // Benchmark all agents
  let bestFitness = 0;
  let bestAgent: AgentNode | null = null;
  const fitnessMap: Map<string, number> = new Map();

  for (const agent of agents) {
    console.log(`  Testing ${agent["@id"]}...`);
    const permissions = {
      ...SEVO_PERMISSIONS,
      read: [...SEVO_PERMISSIONS.read, "./blueprints", "./src"],
    };

    try {
      const result = await run(agent.blueprint, permissions, 60_000);
      if (result.success && result.fitnessOutput) {
        const fitness = (result.fitnessOutput.fitness as number) ?? 0;
        fitnessMap.set(agent["@id"], fitness);

        // Score with SEVO's EQS machinery
        await score(agent["@id"], result, cycleId);

        const beautyScore = (result.fitnessOutput.beautyScore as number) ?? 0;
        const survivalRate = (result.fitnessOutput.survivalRate as number) ?? 0;
        console.log(`    fitness=${fitness.toFixed(3)} beauty=${beautyScore.toFixed(3)} survival=${survivalRate.toFixed(3)}`);

        // Report to discovery server
        reportDiscovery("eqs_milestone", {
          agentId: agent["@id"],
          fitness,
          beautyScore,
          survivalRate,
          efficiency: (result.fitnessOutput.efficiency as number) ?? 0,
          beauty: result.fitnessOutput.beauty ?? {},
          generation: agent.generation,
          cycleId,
        }, goal.domain);

        if (fitness > bestFitness) {
          bestFitness = fitness;
          bestAgent = agent;
        }
      } else {
        console.log(`    FAILED: ${result.stderr.slice(0, 150)}`);
      }
    } catch (e) {
      console.log(`    ERROR: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  if (!bestAgent) {
    return { improvements: [], bestFitness: 0 };
  }

  console.log(`  Best: ${bestAgent["@id"]} fitness=${bestFitness.toFixed(3)}`);

  // Mutate the best agent — include all goals in the prompt
  try {
    const blueprint = await Deno.readTextFile(bestAgent.blueprint);
    const truncated = blueprint.slice(0, 3000);
    const goalDescription = goal.goals.map((g) =>
      `- ${g.name}: ${g.description} (metric: ${g.metric})`
    ).join("\n");

    // Include server recommendations in mutation prompt if available
    let serverGuidance = "";
    if (learnings) {
      const recs = learnings.recommendations as Record<string, unknown> | undefined;
      const recList = recs?.recommendations as string[] | undefined;
      if (recList?.length) {
        serverGuidance = `\nSERVER RECOMMENDATIONS (from cross-instance learning):\n${recList.slice(0, 3).map(r => `- ${r}`).join("\n")}\n`;
      }
    }

    const prompt = `You are evolving a sevo-life agent to improve multi-goal fitness.

DOMAIN GOALS:
${goalDescription}

COMPOSITE FITNESS: ${goal.compositeFitness}
${serverGuidance}
CURRENT BLUEPRINT (truncated):
\`\`\`typescript
${truncated}
\`\`\`

CURRENT FITNESS: ${bestFitness.toFixed(3)}

RULES:
1. Output ONLY the complete new TypeScript file. No markdown fences.
2. Self-contained — imports only from ../src/life-types.ts and ../src/life-runner.ts
3. Must output JSON on last line: {"fitness": 0-1, "branches": 1, "survivalRate": 0-1, "beautyScore": 0-1, "efficiency": 0-1}
4. Improve the weakest component of fitness.
5. Add comments with domain insights: // INSIGHT: <description>`;

    const response = await callClaude(prompt);
    let code = response;
    const fenceMatch = response.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
    if (fenceMatch) code = fenceMatch[1];

    // Extract insights
    const insightMatches = code.matchAll(/\/\/\s*INSIGHT:\s*(.+)/g);
    for (const match of insightMatches) {
      improvements.push(match[1].trim());
    }

    // Write and test the mutant
    const gen = bestAgent.generation + 1;
    const mutantPath = `./blueprints/life-agent-v${gen}.ts`;
    await Deno.writeTextFile(mutantPath, code);

    const permissions = {
      ...SEVO_PERMISSIONS,
      read: [...SEVO_PERMISSIONS.read, "./blueprints", "./src"],
    };
    const testResult = await run(mutantPath, permissions, 60_000);

    if (testResult.success) {
      const mutantFitness = (testResult.fitnessOutput?.fitness as number) ?? 0;
      console.log(`  Mutant fitness: ${mutantFitness.toFixed(3)}`);

      if (mutantFitness >= bestFitness) {
        // Register the winning mutant
        const agentNode: AgentNode = {
          "@context": "sevo://v1",
          "@type": "Agent",
          "@id": `agent:life-v${gen}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          blueprint: mutantPath,
          parent: bestAgent["@id"],
          generation: gen,
          status: "active",
          domain: goal.domain,
        };
        await writeNode(agentNode);
        await git.add(mutantPath);
        await git.commit(`evolve(${goal.domain}): life-agent-v${gen} fitness=${mutantFitness.toFixed(3)}`);
        console.log(`  Registered: ${agentNode["@id"]}`);
        bestFitness = mutantFitness;
      } else {
        console.log(`  Rejected (${mutantFitness.toFixed(3)} < ${bestFitness.toFixed(3)})`);
        try { await Deno.remove(mutantPath); } catch { /* ok */ }
      }
    } else {
      console.log(`  Mutant failed to run`);
      try { await Deno.remove(mutantPath); } catch { /* ok */ }
    }
  } catch (e) {
    console.log(`  Mutation failed: ${(e as Error).message.slice(0, 100)}`);
  }

  return { improvements, bestFitness };
}

// ---------------------------------------------------------------------------
// Record domain learnings as SeedImprovement
// ---------------------------------------------------------------------------
async function recordDomainLearnings(
  domain: string,
  improvements: string[],
  fitness: number,
  cycle: number,
): Promise<void> {
  if (improvements.length === 0) return;

  const seedImprovement: SeedImprovementNode = {
    "@context": "sevo://v1",
    "@type": "SeedImprovement",
    "@id": `domain-learning-${domain}-cycle-${cycle}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    observation: `Domain ${domain} (fitness ${fitness.toFixed(3)}) generated ${improvements.length} insights`,
    suggestion: improvements.join("; "),
    evidence: [`domain:${domain}`, `cycle:${cycle}`],
    priority: 5,
  };

  await writeNode(seedImprovement);
  console.log(`  Recorded ${improvements.length} domain learnings`);

  // Also report insights to discovery server
  for (const insight of improvements) {
    reportDiscovery("domain_insight", {
      insight,
      source: `${domain}-cycle-${cycle}`,
      applicability: "cross-domain",
    }, domain);
  }
}

// ===========================================================================
// MAIN — Detect domain from goal.jsonld and run evolution
// ===========================================================================
const MAX_CYCLES = 5;

async function main() {
  const goal = await loadGoal();
  console.log(`\nSEVO Domain Evolution: ${goal.name}`);
  console.log(`Domain: ${goal.domain}`);
  console.log(`Goals: ${goal.goals.length}`);

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const { improvements, bestFitness } = await runDomainCycle(goal, cycle);

    if (improvements.length > 0) {
      console.log(`\n  Domain insights:`);
      for (const insight of improvements) {
        console.log(`    - ${insight}`);
      }
      await recordDomainLearnings(goal.domain, improvements, bestFitness, cycle);
    }

    // Compute SevoScore for this cycle
    console.log("\n--- SevoScore ---");
    const bestAgent = bestFitness?.agent ?? "unknown";
    const bestEqs = bestFitness?.eqs ?? 0;
    const avgFit = bestFitness?.context?.fitness as number ?? 0;
    await computeSevoScore(`${goal.domain}-cycle-${cycle}-${Date.now()}`, bestAgent, bestEqs, avgFit);

    // Cooldown between cycles
    if (cycle < MAX_CYCLES) {
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  console.log(`\n${goal.domain} evolution complete.`);
}

main();
