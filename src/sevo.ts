// src/sevo.ts — Main SEVO evolution loop

import { queryNodes, writeNode } from "./graph.ts";
import { run, SEVO_PERMISSIONS } from "./runner.ts";
import { score } from "./scorer.ts";
import { propose } from "./mutator.ts";
import { select } from "./selector.ts";
import { git } from "./git.ts";
import type { TaskNode, AgentNode, FitnessNode } from "./types.ts";

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
  const allTasks = await queryNodes<TaskNode>("task");

  // Find which base task IDs have been completed or are running
  // Done/running nodes have IDs like "task:X-done-<ts>" or "task:X-running-<ts>"
  const consumedBaseIds = new Set<string>();
  for (const t of allTasks) {
    if (t.status === "done" || t.status === "running") {
      // Extract base ID by removing "-done-<ts>" or "-running-<ts>" suffix
      const match = t["@id"].match(/^(.+?)-(done|running)-\d+$/);
      if (match) consumedBaseIds.add(match[1]);
    }
  }

  // Get truly pending tasks (not yet consumed)
  const pending = allTasks.filter(
    (t) => t.status === "pending" && !consumedBaseIds.has(t["@id"])
  );
  if (!pending.length) return null;

  // Resolve dependencies — check if deps are done
  const doneBaseIds = new Set<string>();
  for (const t of allTasks) {
    if (t.status === "done") {
      const match = t["@id"].match(/^(.+?)-done-\d+$/);
      if (match) doneBaseIds.add(match[1]);
    }
  }

  const ready = pending.filter((t) =>
    t.dependsOn.every((dep) => doneBaseIds.has(dep))
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

  const fitnessScores = await queryNodes<FitnessNode>("fitness");
  if (!fitnessScores.length) return active[0];

  // Composite score: latest EQS + average absolute fitness
  const agentScore = new Map<string, number>();
  for (const agent of active) {
    const agentFitness = fitnessScores.filter((f) => f.agent === agent["@id"]);
    if (!agentFitness.length) {
      agentScore.set(agent["@id"], 0);
      continue;
    }
    const latestEqs = agentFitness.at(-1)?.eqs ?? 0;
    const avgFitness =
      agentFitness.reduce(
        (sum, f) => sum + ((f.context?.fitness as number) ?? 0),
        0
      ) / agentFitness.length;
    agentScore.set(agent["@id"], 0.5 * latestEqs + 0.5 * avgFitness);
  }

  return (
    active.sort(
      (a, b) =>
        (agentScore.get(b["@id"]) ?? 0) - (agentScore.get(a["@id"]) ?? 0)
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
  const runningTask: TaskNode = {
    ...task,
    "@id": `${task["@id"]}-running-${Date.now()}`,
    status: "running",
    timestamp: new Date().toISOString(),
  };
  await writeNode(runningTask);

  // Get best agent
  const agent = await getBestAgent();
  if (!agent) {
    console.log("No active agents. Cannot proceed.");
    await writeProgress(`cycle-${cycleCount}`, "debug: no active agents");
    break;
  }

  // Run agent on task — pass task context via stdin
  console.log(`Running agent ${agent["@id"]} on blueprint ${agent.blueprint}`);
  const taskContext = JSON.stringify({
    taskId: task["@id"],
    description: task.description,
    priority: task.priority,
  });
  const runResult = await run(agent.blueprint, SEVO_PERMISSIONS, 300_000, taskContext);
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
  const doneTask: TaskNode = {
    ...task,
    "@id": `${task["@id"]}-done-${Date.now()}`,
    status: "done",
    result: runResult.stdout.slice(0, 500),
    timestamp: new Date().toISOString(),
  };
  await writeNode(doneTask);

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
