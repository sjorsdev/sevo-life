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
  SevoScoreNode,
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
): Promise<{ improvements: string[]; bestFitness: number; bestAgentId: string | null }> {
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
    return { improvements: [], bestFitness: 0, bestAgentId: null };
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
    return { improvements: [], bestFitness: 0, bestAgentId: null };
  }

  console.log(`  Best: ${bestAgent["@id"]} fitness=${bestFitness.toFixed(3)}`);

  // Mutate via parameter patch — ask LLM for genome tweaks as JSON,
  // then apply programmatically. Full rewrites fail >80% of the time.
  try {
    const blueprint = await Deno.readTextFile(bestAgent.blueprint);

    // Extract current genomes from blueprint
    const genomeMatch = blueprint.match(/const genomes:\s*EntityGenome\[\]\s*=\s*\[([\s\S]*?)\];/);
    const currentGenomes = genomeMatch ? genomeMatch[1].slice(0, 2000) : "unknown";

    // Get last run's detailed fitness breakdown
    const lastRunResult = fitnessMap.get(bestAgent["@id"]) ?? bestFitness;
    const bestResult = await run(bestAgent.blueprint, {
      ...SEVO_PERMISSIONS,
      read: [...SEVO_PERMISSIONS.read, "./blueprints", "./src"],
    }, 60_000);
    const breakdown = bestResult.fitnessOutput ?? {};

    const goalDescription = goal.goals.map((g) =>
      `- ${g.name}: ${g.description} (metric: ${g.metric})`
    ).join("\n");

    const prompt = `You are tuning genome parameters for a sevo-life simulation.

GOALS: ${goal.compositeFitness}
${goalDescription}

CURRENT FITNESS: ${JSON.stringify(breakdown, null, 2)}

CURRENT GENOMES (8 entities with these parameters):
${currentGenomes}

Each genome has: moveSpeed, turnBias, resourceAttraction, trailAttraction, harvestThreshold, energyConserve, explorationDrive, trailIntensity, trailColor (0-5), pulseFrequency, patternSymmetry

Analyze the fitness breakdown. Identify the weakest component and propose parameter changes to improve it.

Respond with JSON only, no markdown:
{
  "reasoning": "what to improve and why",
  "insight": "one-line domain learning",
  "genomes": [
    {"index": 0, "changes": {"moveSpeed": 0.7, "energyConserve": 0.5}},
    {"index": 2, "changes": {"trailIntensity": 0.9, "patternSymmetry": 0.8}}
  ]
}

Only include genomes you want to change. Only include parameters you want to change. Values must be numbers 0-1 (except trailColor: 0-5).`;

    const response = await callClaude(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in LLM response");
    const patch = JSON.parse(jsonMatch[0]);

    // Extract insight
    if (patch.insight) improvements.push(patch.insight);
    if (patch.reasoning) improvements.push(patch.reasoning);

    // Apply parameter patches to the blueprint
    let mutatedBlueprint = blueprint;
    const genomeParams = ["moveSpeed", "turnBias", "resourceAttraction", "trailAttraction",
      "harvestThreshold", "energyConserve", "explorationDrive", "trailIntensity",
      "trailColor", "pulseFrequency", "patternSymmetry"];

    if (patch.genomes && Array.isArray(patch.genomes)) {
      for (const genomePatch of patch.genomes) {
        const changes = genomePatch.changes;
        if (!changes || typeof changes !== "object") continue;

        for (const [param, value] of Object.entries(changes)) {
          if (!genomeParams.includes(param)) continue;
          if (typeof value !== "number") continue;

          // Find and replace the parameter value in the blueprint
          // Match patterns like "moveSpeed: 0.85" with flexible whitespace
          const paramRegex = new RegExp(
            `(${param}:\\s*)([-]?\\d+\\.?\\d*)`,
            "g"
          );

          let matchCount = 0;
          const targetIndex = genomePatch.index ?? 0;
          mutatedBlueprint = mutatedBlueprint.replace(paramRegex, (match, prefix, _oldVal) => {
            if (matchCount === targetIndex) {
              matchCount++;
              return `${prefix}${value}`;
            }
            matchCount++;
            return match;
          });
        }
      }
    }

    // Update the version comment
    const gen = bestAgent.generation + 1;
    mutatedBlueprint = mutatedBlueprint.replace(
      /^\/\/ life-agent-v\d+.*/m,
      `// life-agent-v${gen}.ts — Parameter-evolved from v${bestAgent.generation}: ${(patch.insight ?? "tuned genomes").slice(0, 80)}`
    );

    const mutantPath = `./blueprints/life-agent-v${gen}.ts`;
    await Deno.writeTextFile(mutantPath, mutatedBlueprint);

    const permissions = {
      ...SEVO_PERMISSIONS,
      read: [...SEVO_PERMISSIONS.read, "./blueprints", "./src"],
    };
    const testResult = await run(mutantPath, permissions, 60_000);

    if (testResult.success) {
      const mutantFitness = (testResult.fitnessOutput?.fitness as number) ?? 0;
      const mutantBeauty = (testResult.fitnessOutput?.beautyScore as number) ?? 0;
      const mutantSurvival = (testResult.fitnessOutput?.survivalRate as number) ?? 0;
      console.log(`  Mutant: fitness=${mutantFitness.toFixed(3)} beauty=${mutantBeauty.toFixed(3)} survival=${mutantSurvival.toFixed(3)}`);

      if (mutantFitness > bestFitness) {
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
        await git.commit(`evolve(${goal.domain}): life-agent-v${gen} fitness=${mutantFitness.toFixed(3)} beauty=${mutantBeauty.toFixed(3)}`);
        console.log(`  WINNER: ${agentNode["@id"]}`);
        bestFitness = mutantFitness;
      } else {
        console.log(`  Rejected (${mutantFitness.toFixed(3)} <= ${bestFitness.toFixed(3)})`);
        try { await Deno.remove(mutantPath); } catch { /* ok */ }
      }
    } else {
      console.log(`  Mutant failed: ${testResult.stderr.slice(0, 150)}`);
      try { await Deno.remove(mutantPath); } catch { /* ok */ }
    }
  } catch (e) {
    console.log(`  Mutation failed: ${(e as Error).message.slice(0, 100)}`);
  }

  return { improvements, bestFitness, bestAgentId: bestAgent["@id"] };
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
// META-CYCLE: EVOLVE → REFLECT → BRAINSTORM → REALIGN
// ===========================================================================
const EVOLVE_CYCLES = 5;  // evolution cycles per meta-cycle

// Load domain fitness history from SevoScore nodes — persists across sessions
async function loadFitnessHistory(): Promise<number[]> {
  const scores = await queryNodes<SevoScoreNode>("sevoscore");
  // Sort by timestamp and extract the metadata.bestEqs (domain-specific fitness)
  return scores
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((s) => {
      // Use avgFitness from metadata if available, fall back to score trend
      const avg = (s.metadata as Record<string, unknown>)?.avgFitness;
      return typeof avg === "number" ? avg : s.cyclePoints / Math.max(s.score, 1);
    });
}
const fitnessHistory: number[] = await loadFitnessHistory();
console.log(`Loaded ${fitnessHistory.length} SevoScore fitness records`);

// --- REFLECT: analyze trends, detect plateaus ---
async function reflect(
  goal: GoalConfig,
  fitnessHistory: number[],
): Promise<{ plateauing: boolean; trend: string; summary: string }> {
  console.log(`\n============================================================`);
  console.log(`  REFLECT`);
  console.log(`============================================================`);

  const recent = fitnessHistory.slice(-10);
  const older = fitnessHistory.slice(-20, -10);

  const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;
  const delta = recentAvg - olderAvg;

  const plateauing = recent.length >= 5 && Math.abs(delta) < 0.01;
  const trend = delta > 0.02 ? "improving" : delta < -0.02 ? "declining" : "plateau";

  const summary = `Fitness trend: ${trend} (recent avg: ${recentAvg.toFixed(3)}, delta: ${delta.toFixed(4)}). ` +
    `History: ${fitnessHistory.length} cycles. ${plateauing ? "PLATEAU DETECTED — need structural change." : ""}`;

  console.log(`  ${summary}`);

  // Write reflection to graph
  await writeNode({
    "@context": "sevo://v1",
    "@type": "SeedImprovement",
    "@id": `reflection-${goal.domain}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    observation: summary,
    suggestion: plateauing
      ? "Fitness is plateauing. Parameter tuning has reached its limit. Need structural evolution: new body types, new actions, new beauty dimensions, or changes to the simulation engine itself."
      : `Continue current approach. Trend: ${trend}.`,
    evidence: [`fitness-history:${recent.join(",")}`, `trend:${trend}`, `delta:${delta.toFixed(4)}`],
    priority: plateauing ? 9 : 3,
  } as SeedImprovementNode);

  return { plateauing, trend, summary };
}

// --- BRAINSTORM: when stuck, propose structural changes ---
async function brainstorm(
  goal: GoalConfig,
  reflectionSummary: string,
): Promise<string[]> {
  console.log(`\n============================================================`);
  console.log(`  BRAINSTORM — proposing structural changes`);
  console.log(`============================================================`);

  // Read all learnings for context
  const learnings = await queryNodes<SeedImprovementNode>("seedimprovement");
  const recentLearnings = learnings
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10)
    .map((l) => `- ${l.observation.slice(0, 100)}`)
    .join("\n");

  const prompt = `You are the meta-evolution brain of a sevo-life system.

SITUATION: ${reflectionSummary}

GOAL: ${goal.name}
Composite fitness: ${goal.compositeFitness}
Goals: ${goal.goals.map((g) => g.name).join(", ")}

RECENT LEARNINGS:
${recentLearnings}

The system is stuck. Parameter tuning has hit its limit. Propose 3 STRUCTURAL changes that could break through the plateau. Not parameter tweaks — architectural changes to how the simulation works.

Think about: new body cell types, new organism actions, new beauty dimensions, changes to world physics, new interaction types between organisms, changes to the decision function structure, new growth rules.

Respond with JSON only:
{
  "proposals": [
    {"change": "description", "rationale": "why this breaks the plateau", "difficulty": "easy|medium|hard"},
    {"change": "description", "rationale": "why", "difficulty": "easy|medium|hard"},
    {"change": "description", "rationale": "why", "difficulty": "easy|medium|hard"}
  ],
  "insight": "one key meta-insight about why evolution is stuck"
}`;

  try {
    const response = await callClaude(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);

    const proposals: string[] = [];
    if (parsed.insight) {
      console.log(`  Meta-insight: ${parsed.insight}`);
      proposals.push(parsed.insight);
    }
    if (parsed.proposals) {
      for (const p of parsed.proposals) {
        console.log(`  Proposal [${p.difficulty}]: ${p.change}`);
        console.log(`    Rationale: ${p.rationale}`);
        proposals.push(`[${p.difficulty}] ${p.change} — ${p.rationale}`);
      }
    }

    // Write brainstorm to graph
    await writeNode({
      "@context": "sevo://v1",
      "@type": "SeedImprovement",
      "@id": `brainstorm-${goal.domain}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      observation: `Brainstorm triggered by plateau. ${proposals.length} proposals generated.`,
      suggestion: proposals.join("; "),
      evidence: [`trigger:plateau`, `proposals:${proposals.length}`],
      priority: 8,
    } as SeedImprovementNode);

    return proposals;
  } catch (e) {
    console.log(`  Brainstorm failed: ${(e as Error).message.slice(0, 100)}`);
    return [];
  }
}

// --- REALIGN: check if we're still serving the goal ---
async function realign(goal: GoalConfig, bestFitness: number): Promise<void> {
  console.log(`\n============================================================`);
  console.log(`  REALIGN — goal check`);
  console.log(`============================================================`);

  const agents = await queryNodes<AgentNode>("agent", (a) => a.status === "active" && a.domain === goal.domain);
  const totalLearnings = (await queryNodes<SeedImprovementNode>("seedimprovement")).length;

  console.log(`  Goal: ${goal.name}`);
  console.log(`  Active agents: ${agents.length}`);
  console.log(`  Best fitness: ${bestFitness.toFixed(3)}`);
  console.log(`  Total learnings: ${totalLearnings}`);
  console.log(`  Are we making life more beautiful? ${bestFitness > 0.7 ? "Yes — pushing further." : bestFitness > 0.5 ? "Getting there." : "Not yet — fundamentals first."}`);
}

// ===========================================================================
// MAIN — Meta-cycle: EVOLVE → REFLECT → BRAINSTORM → REALIGN
// ===========================================================================

async function main() {
  const goal = await loadGoal();
  console.log(`\nSEVO Domain Evolution: ${goal.name}`);
  console.log(`Meta-cycle: ${EVOLVE_CYCLES} evolve → reflect → brainstorm (if stuck) → realign`);

  // --- EVOLVE phase ---
  let bestFitness = 0;
  let bestAgentId: string | null = null;

  for (let cycle = 1; cycle <= EVOLVE_CYCLES; cycle++) {
    console.log(`\n============================================================`);
    console.log(`  EVOLVE ${cycle}/${EVOLVE_CYCLES}`);
    console.log(`============================================================`);

    const result = await runDomainCycle(goal, cycle);

    if (result.improvements.length > 0) {
      console.log(`\n  Insights:`);
      for (const insight of result.improvements) {
        console.log(`    - ${insight}`);
      }
      await recordDomainLearnings(goal.domain, result.improvements, result.bestFitness, cycle);
    }

    fitnessHistory.push(result.bestFitness);
    if (result.bestFitness > bestFitness) {
      bestFitness = result.bestFitness;
      bestAgentId = result.bestAgentId;
    }

    // SevoScore
    console.log("\n--- SevoScore ---");
    await computeSevoScore(
      `${goal.domain}-cycle-${cycle}-${Date.now()}`,
      bestAgentId ?? "unknown",
      bestFitness,
      bestFitness,
    );

    if (cycle < EVOLVE_CYCLES) {
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }

  // --- REFLECT phase ---
  const reflection = await reflect(goal, fitnessHistory);

  // --- BRAINSTORM phase (only if plateauing) ---
  if (reflection.plateauing) {
    await brainstorm(goal, reflection.summary);
  }

  // --- REALIGN phase ---
  await realign(goal, bestFitness);

  console.log(`\n${goal.domain} meta-cycle complete.`);
}

main();
