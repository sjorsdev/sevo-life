// src/sevo.ts — Main SEVO evolution loop

import { queryNodes, writeNode } from "./graph.ts";
import { run, SEVO_PERMISSIONS } from "./runner.ts";
import { score } from "./scorer.ts";
import { propose } from "./mutator.ts";
import { select } from "./selector.ts";
import { git } from "./git.ts";
import type { TaskNode, AgentNode } from "./types.ts";

async function writeProgress(current: string, next: string, notes = "") {
  const activeAgents = await queryNodes<AgentNode>(
    "agent",
    (n) => n.status === "active"
  );
  const content = `# PROGRESS

## Last completed: ${current}
## Next: ${next}
## Active agents: ${activeAgents.map((a) => a["@id"]).join(", ")}
## Notes: ${notes}
## Timestamp: ${new Date().toISOString()}
`;
  await Deno.writeTextFile("PROGRESS.md", content);
  await git.add("PROGRESS.md");
  await git.commit(`progress: ${current}`);
}

async function getNextTask(): Promise<TaskNode | null> {
  const pending = await queryNodes<TaskNode>(
    "task",
    (n) => n.status === "pending"
  );
  if (!pending.length) return null;

  // Resolve dependencies — only pick tasks with all deps done
  const doneTasks = await queryNodes<TaskNode>(
    "task",
    (n) => n.status === "done"
  );
  const doneIds = new Set(doneTasks.map((t) => t["@id"]));

  const ready = pending.filter((t) =>
    t.dependsOn.every((dep) => doneIds.has(dep))
  );

  if (!ready.length) return null;

  // Sort by priority (1 = highest)
  return ready.sort((a, b) => a.priority - b.priority)[0];
}

async function getBestAgent(): Promise<AgentNode | null> {
  const active = await queryNodes<AgentNode>(
    "agent",
    (n) => n.status === "active"
  );
  if (!active.length) return null;

  // Return agent with highest recent EQS
  const fitnessScores = await queryNodes("fitness");
  if (!fitnessScores.length) return active[0];

  const agentEqs = new Map<string, number>();
  for (const f of fitnessScores) {
    const fit = f as { agent: string; eqs: number };
    agentEqs.set(fit.agent, fit.eqs);
  }

  return (
    active.sort(
      (a, b) => (agentEqs.get(b["@id"]) ?? 0) - (agentEqs.get(a["@id"]) ?? 0)
    )[0] ?? active[0]
  );
}

// Main loop
console.log("SEVO starting...");
console.log(await git.log(10));

let cycleCount = 0;

while (true) {
  cycleCount++;
  const cycleId = `cycle-${Date.now()}`;

  const task = await getNextTask();
  if (!task) {
    console.log("No pending tasks. SEVO idle.");
    await writeProgress("idle", "awaiting new tasks");
    break;
  }

  console.log(`\nCycle ${cycleCount}: ${task["@id"]} — ${task.description}`);

  // Mark task running — create new node (append only)
  await writeNode({
    ...task,
    "@id": `${task["@id"]}-running-${Date.now()}`,
    status: "running" as const,
    timestamp: new Date().toISOString(),
  });

  // Get best agent
  const agent = await getBestAgent();
  if (!agent) {
    console.log("No active agents. Cannot proceed.");
    await writeProgress(`cycle-${cycleCount}`, "debug: no active agents");
    break;
  }

  // Run agent on task
  console.log(`Running agent ${agent["@id"]} on blueprint ${agent.blueprint}`);
  const runResult = await run(agent.blueprint, SEVO_PERMISSIONS);
  console.log(
    `Run complete: success=${runResult.success}, duration=${runResult.durationMs}ms`
  );
  if (runResult.stderr) {
    console.log(`stderr: ${runResult.stderr.slice(0, 200)}`);
  }

  // Score the run
  const fitness = await score(agent["@id"], runResult, cycleId);
  console.log(`EQS: ${fitness.eqs.toFixed(3)}`);

  // Decide whether to mutate
  const shouldMutate = fitness.eqs < 0.7 || cycleCount % 5 === 0;

  if (shouldMutate) {
    console.log("Proposing mutation...");
    try {
      const mutation = await propose(agent);
      console.log(`Mutation proposed: ${mutation.branch}`);
    } catch (e) {
      console.log(
        `Mutation failed: ${e instanceof Error ? e.message : "unknown"}`
      );
    }
  }

  // Mark task done
  await writeNode({
    ...task,
    "@id": `${task["@id"]}-done-${Date.now()}`,
    status: "done" as const,
    result: runResult.stdout.slice(0, 500),
    timestamp: new Date().toISOString(),
  });

  await writeProgress(
    `cycle-${cycleCount}: ${task["@id"]}`,
    `cycle-${cycleCount + 1}: next pending task`,
    `EQS: ${fitness.eqs.toFixed(3)}`
  );

  // Context management — checkpoint periodically
  if (cycleCount % 20 === 0) {
    console.log("Checkpoint: writing progress and pausing for context management");
    break;
  }
}

console.log("SEVO cycle complete. Progress written.");
