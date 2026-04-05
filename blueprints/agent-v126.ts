// blueprints/agent-v4.ts — Child of agent-v2 + agent-v3: Result<T> pattern + comprehensive test coverage + concurrent validation

interface SeVoNode {
  "@context": "sevo://v1";
  "@type": string;
  "@id": string;
  timestamp: string;
}

type NodeError =
  | { code: "INVALID_TYPE"; message: string }
  | { code: "INVALID_ID"; message: string }
  | { code: "INVALID_TIMESTAMP"; message: string }
  | { code: "INVALID_CONTEXT"; message: string }
  | { code: "DUPLICATE_NODE"; message: string }
  | { code: "WRITE_FAILED"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }

  const timestamp = new Date().toISOString();
  if (isNaN(new Date(timestamp).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: `Failed to generate valid timestamp` } };
  }

  return {
    ok: true,
    value: { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra },
  };
}

function validateNode(node: unknown): Result<SeVoNode> {
  if (!node || typeof node !== "object") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Not an object" } };
  }
  const n = node as Record<string, unknown>;
  if (n["@context"] !== "sevo://v1") {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: `Expected sevo://v1, got ${n["@context"]}` } };
  }
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" } };
  }
  if (isNaN(new Date(n["timestamp"] as string).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: `Timestamp is not a valid ISO date: ${n["timestamp"]}` } };
  }
  return { ok: true, value: n as SeVoNode };
}

let correct = 0;
let total = 0;

// TEST CATEGORY 1: Basic creation and validation
total++;
const basicNode = createNode("Agent", "agent:v4");
if (basicNode.ok && validateNode(basicNode.value).ok) correct++;

total++;
const nodeWithExtra = createNode("Task", "task:1", { priority: 1, status: "pending", dependsOn: [] });
if (nodeWithExtra.ok && validateNode(nodeWithExtra.value).ok) correct++;

// TEST CATEGORY 2: Error handling - invalid inputs
total++;
const invalidType = createNode("", "test");
if (!invalidType.ok && invalidType.error.code === "INVALID_TYPE") correct++;

total++;
const invalidId = createNode("Task", "");
if (!invalidId.ok && invalidId.error.code === "INVALID_ID") correct++;

total++;
const idTooLong = createNode("Task", "x".repeat(300));
if (!idTooLong.ok && idTooLong.error.code === "INVALID_ID") correct++;

total++;
const nullType = createNode(null as unknown as string, "test");
if (!nullType.ok && nullType.error.code === "INVALID_TYPE") correct++;

total++;
const nullId = createNode("Task", null as unknown as string);
if (!nullId.ok && nullId.error.code === "INVALID_ID") correct++;

// TEST CATEGORY 3: Validation edge cases
total++;
const invalidContextValidation = validateNode({
  "@context": "wrong",
  "@type": "Task",
  "@id": "test",
  timestamp: new Date().toISOString(),
});
if (!invalidContextValidation.ok && invalidContextValidation.error.code === "INVALID_CONTEXT") correct++;

total++;
const missingTimestamp = validateNode({
  "@context": "sevo://v1",
  "@type": "Agent",
  "@id": "agent:test",
});
if (!missingTimestamp.ok && missingTimestamp.error.code === "INVALID_TIMESTAMP") correct++;

total++;
const invalidTimestampFormat = validateNode({
  "@context": "sevo://v1",
  "@type": "Agent",
  "@id": "agent:test",
  timestamp: "not-a-date",
});
if (!invalidTimestampFormat.ok && invalidTimestampFormat.error.code === "INVALID_TIMESTAMP") correct++;

total++;
const notAnObject = validateNode("not an object");
if (!notAnObject.ok && notAnObject.error.code === "INVALID_TYPE") correct++;

total++;
const nullInput = validateNode(null);
if (!nullInput.ok && nullInput.error.code === "INVALID_TYPE") correct++;

// TEST CATEGORY 4: Complex node types (Agent, Task, Fitness, Mutation, Selection)
total++;
const agentNode = createNode("Agent", "agent:v4-test", {
  blueprint: "blueprints/agent-v4.ts",
  parent: "agent:v3",
  generation: 4,
  status: "active",
});
if (agentNode.ok && validateNode(agentNode.value).ok) correct++;

total++;
const taskNode = createNode("Task", "task:benchmark-v37", {
  description: "Implement adaptive consensus",
  priority: 1,
  status: "pending",
  dependsOn: [],
});
if (taskNode.ok && validateNode(taskNode.value).ok) correct++;

total++;
const fitnessNode = createNode("Fitness", "fitness:agent-v4-cycle-1", {
  agent: "agent:v4",
  eqs: 0.85,
  accuracy: 1.0,
  magnitude: 0.15,
  branchesExplored: 2,
  predictionError: 0.1,
  cycleId: "cycle-1",
  context: {},
});
if (fitnessNode.ok && validateNode(fitnessNode.value).ok) correct++;

total++;
const mutationNode = createNode("Mutation", "mutation:agent-v4-001", {
  parent: "agent:v3",
  proposal: "Add Result<T> pattern to error handling",
  branch: "mutation/agent-v4-001",
  status: "proposed",
  reasoning: "Improves error granularity and type safety",
});
if (mutationNode.ok && validateNode(mutationNode.value).ok) correct++;

total++;
const selectionNode = createNode("Selection", "selection:v4-over-v3", {
  winner: "agent:v4",
  loser: "agent:v3",
  winnerEqs: 0.85,
  loserEqs: 0.78,
  reasoning: "Child agent outperforms parent on test coverage",
  eqsDelta: 0.07,
});
if (selectionNode.ok && validateNode(selectionNode.value).ok) correct++;

// TEST CATEGORY 5: Concurrency and rapid sequential creation
total++;
const batch1 = createNode("Task", "task:batch-1");
const batch2 = createNode("Task", "task:batch-2");
const batch3 = createNode("Task", "task:batch-3");
if (batch1.ok && batch2.ok && batch3.ok) correct++;

total++;
if (batch1.value["@id"] !== batch2.value["@id"] && batch2.value["@id"] !== batch3.value["@id"]) correct++;

// TEST CATEGORY 6: Timestamp consistency
total++;
const node1 = createNode("Agent", "agent:consistency-1");
const node2 = createNode("Agent", "agent:consistency-2");
if (
  node1.ok &&
  node2.ok &&
  node1.value.timestamp !== "" &&
  node2.value.timestamp !== "" &&
  new Date(node1.value.timestamp).getTime() <= new Date(node2.value.timestamp).getTime()
) {
  correct++;
}

// TEST CATEGORY 7: Special characters and edge case IDs
total++;
const specialCharsId = createNode("Task", "task:v4-2026-04-05T12:30:45Z");
if (specialCharsId.ok && validateNode(specialCharsId.value).ok) correct++;

total++;
const numericId = createNode("Task", "task:12345");
if (numericId.ok && validateNode(numericId.value).ok) correct++;

total++;
const hyphenatedId = createNode("Task", "task-mutation-agent-v4-concat");
if (hyphenatedId.ok && validateNode(hyphenatedId.value).ok) correct++;

// TEST CATEGORY 8: Extra properties preservation
total++;
const extraProps = createNode("Agent", "agent:extra-test", {
  custom_field_1: "value1",
  custom_field_2: 42,
  custom_field_3: true,
  nested: { key: "value" },
});
if (
  extraProps.ok &&
  extraProps.value.custom_field_1 === "value1" &&
  extraProps.value.custom_field_2 === 42 &&
  (extraProps.value.nested as Record<string, string>).key === "value"
) {
  correct++;
}

// TEST CATEGORY 9: Validation with extra properties
total++;
const validNodeWithExtras = createNode("Fitness", "fitness:extra-test", { score: 0.9, tags: ["v4", "crossover"] });
const validationResult = validateNode(validNodeWithExtras.value);
if (validNodeWithExtras.ok && validationResult.ok) correct++;

// TEST CATEGORY 10: Error message granularity
total++;
const typeErrorMsg = createNode(123 as unknown as string, "test");
if (typeErrorMsg.ok === false && typeErrorMsg.error.message.includes("string")) correct++;

total++;
const idErrorMsg = createNode("Task", "x".repeat(300));
if (idErrorMsg.ok === false && idErrorMsg.error.message.includes("256")) correct++;

// Output fitness metrics
const fitness = correct / Math.max(total, 1);
const branches = 2; // child of 2 parents
const output = {
  fitness,
  branches,
  correct,
  total,
};

console.log(JSON.stringify(output));
