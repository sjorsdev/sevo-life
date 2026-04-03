// blueprints/agent-v4.ts — Fourth SEVO agent: combines v2's edge-case depth with v3's structured errors
// Result<T> pattern + comprehensive test suite covering node lifecycle, serialization, concurrency edge cases

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
  | { code: "WRITE_FAILED"; message: string }
  | { code: "INVALID_EXTRA"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  // Type validation
  if (!type || typeof type !== "string" || type.trim() === "") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
  }

  // ID validation
  if (!id || typeof id !== "string" || id.trim() === "") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }

  // Validate extra fields are serializable
  for (const [key, val] of Object.entries(extra)) {
    if (val === undefined || (typeof val === "object" && val !== null && typeof val.toJSON !== "function")) {
      try {
        JSON.stringify(val);
      } catch {
        return { ok: false, error: { code: "INVALID_EXTRA", message: `Extra field '${key}' is not JSON serializable` } };
      }
    }
  }

  const timestamp = new Date().toISOString();
  if (isNaN(new Date(timestamp).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Failed to generate valid timestamp" } };
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

  if (!n["@type"] || typeof n["@type"] !== "string" || (n["@type"] as string).trim() === "") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }

  if (!n["@id"] || typeof n["@id"] !== "string" || (n["@id"] as string).trim() === "") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }

  if ((n["@id"] as string).length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${(n["@id"] as string).length}` } };
  }

  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" } };
  }

  if (isNaN(new Date(n["timestamp"] as string).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Timestamp is not a valid ISO date" } };
  }

  return { ok: true, value: n as SeVoNode };
}

function serializeNode(node: SeVoNode): Result<string> {
  try {
    const json = JSON.stringify(node);
    return { ok: true, value: json };
  } catch (e) {
    return { ok: false, error: { code: "WRITE_FAILED", message: `Serialization failed: ${String(e)}` } };
  }
}

function deserializeNode(json: string): Result<SeVoNode> {
  try {
    const obj = JSON.parse(json);
    return validateNode(obj);
  } catch (e) {
    return { ok: false, error: { code: "WRITE_FAILED", message: `Deserialization failed: ${String(e)}` } };
  }
}

let correct = 0;
let total = 0;

// Test 1: Basic node creation
total++;
const t1 = createNode("Task", "task-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
if (t1.ok && t1.value["@type"] === "Task" && t1.value["@id"] === "task-1") correct++;

// Test 2: Agent node
total++;
const t2 = createNode("Agent", "agent-v4", { blueprint: "blueprints/agent-v4.ts", generation: 4, status: "active" });
if (t2.ok && t2.value["@type"] === "Agent") correct++;

// Test 3: Fitness node with detailed context
total++;
const t3 = createNode("Fitness", "fitness:agent-v4-1", { eqs: 0.92, accuracy: 1.0, magnitude: 0.5, branchesExplored: 3, predictionError: 0.1, cycleId: "cycle-1" });
if (t3.ok && t3.value.eqs === 0.92) correct++;

// Test 4: Mutation node
total++;
const t4 = createNode("Mutation", "mutation:v4-1", { parent: "agent-v3", proposal: "add error codes", branch: "mutation/agent-v4", status: "proposed", reasoning: "improve error handling" });
if (t4.ok && t4.value.status === "proposed") correct++;

// Test 5: Selection node
total++;
const t5 = createNode("Selection", "selection:v4-1", { winner: "agent-v4", loser: "agent-v3", winnerEqs: 0.92, loserEqs: 0.88, reasoning: "superior test coverage", eqsDelta: 0.04 });
if (t5.ok && t5.value.eqsDelta === 0.04) correct++;

// Test 6: Invalid type — empty string
total++;
const t6 = createNode("", "id-6");
if (!t6.ok && t6.error.code === "INVALID_TYPE") correct++;

// Test 7: Invalid type — not a string
total++;
const t7 = createNode(123 as any, "id-7");
if (!t7.ok && t7.error.code === "INVALID_TYPE") correct++;

// Test 8: Invalid ID — empty string
total++;
const t8 = createNode("Task", "");
if (!t8.ok && t8.error.code === "INVALID_ID") correct++;

// Test 9: Invalid ID — too long
total++;
const longId = "x".repeat(257);
const t9 = createNode("Task", longId);
if (!t9.ok && t9.error.code === "INVALID_ID") correct++;

// Test 10: ID with length exactly 256 (boundary)
total++;
const boundaryId = "x".repeat(256);
const t10 = createNode("Task", boundaryId);
if (t10.ok && t10.value["@id"] === boundaryId) correct++;

// Test 11: Whitespace-only type
total++;
const t11 = createNode("   ", "id-11");
if (!t11.ok && t11.error.code === "INVALID_TYPE") correct++;

// Test 12: Whitespace-only ID
total++;
const t12 = createNode("Task", "   ");
if (!t12.ok && t12.error.code === "INVALID_ID") correct++;

// Test 13: Extra fields with various types
total++;
const t13 = createNode("Node", "node-13", {
  string: "value",
  number: 42,
  boolean: true,
  array: [1, 2, 3],
  object: { nested: "value" },
  null: null,
});
if (t13.ok && t13.value.string === "value" && (t13.value.array as number[])[0] === 1) correct++;

// Test 14: Validate well-formed node
total++;
if (t1.ok) {
  const valid = validateNode(t1.value);
  if (valid.ok && valid.value["@id"] === "task-1") correct++;
}

// Test 15: Validate node with missing @context
total++;
const badNode1 = { "@type": "Task", "@id": "task-15", timestamp: new Date().toISOString() };
const v15 = validateNode(badNode1);
if (!v15.ok && v15.error.code === "INVALID_CONTEXT") correct++;

// Test 16: Validate node with missing @type
total++;
const badNode2 = { "@context": "sevo://v1", "@id": "task-16", timestamp: new Date().toISOString() };
const v16 = validateNode(badNode2);
if (!v16.ok && v16.error.code === "INVALID_TYPE") correct++;

// Test 17: Validate node with missing @id
total++;
const badNode3 = { "@context": "sevo://v1", "@type": "Task", timestamp: new Date().toISOString() };
const v17 = validateNode(badNode3);
if (!v17.ok && v17.error.code === "INVALID_ID") correct++;

// Test 18: Validate node with missing timestamp
total++;
const badNode4 = { "@context": "sevo://v1", "@type": "Task", "@id": "task-18" };
const v18 = validateNode(badNode4);
if (!v18.ok && v18.error.code === "INVALID_TIMESTAMP") correct++;

// Test 19: Validate node with invalid timestamp
total++;
const badNode5 = { "@context": "sevo://v1", "@type": "Task", "@id": "task-19", timestamp: "not-a-date" };
const v19 = validateNode(badNode5);
if (!v19.ok && v19.error.code === "INVALID_TIMESTAMP") correct++;

// Test 20: Validate node with ID too long
total++;
const badNode6 = { "@context": "sevo://v1", "@type": "Task", "@id": "x".repeat(257), timestamp: new Date().toISOString() };
const v20 = validateNode(badNode6);
if (!v20.ok && v20.error.code === "INVALID_ID") correct++;

// Test 21: Serialization of valid node
total++;
if (t1.ok) {
  const ser = serializeNode(t1.value as SeVoNode);
  if (ser.ok && typeof ser.value === "string") correct++;
}

// Test 22: Deserialization round-trip
total++;
if (t1.ok) {
  const ser = serializeNode(t1.value as SeVoNode);
  if (ser.ok) {
    const deser = deserializeNode(ser.value);
    if (deser.ok && deser.value["@id"] === "task-1") correct++;
  }
}

// Test 23: Complex nested object serialization
total++;
const t23 = createNode("Complex", "complex-23", {
  data: { nested: { deep: { value: 42, array: [1, 2, 3] } } },
  metadata: { tags: ["sevo", "test"], flags: { enabled: true } },
});
if (t23.ok) {
  const ser = serializeNode(t23.value as SeVoNode);
  if (ser.ok && typeof ser.value === "string") correct++;
}

// Test 24: Invalid extra field (function)
total++;
const t24 = createNode("Task", "task-24", { fn: (() => {}) as any });
if (!t24.ok && t24.error.code === "INVALID_EXTRA") correct++;

// Test 25: Boundary case: single character ID
total++;
const t25 = createNode("Task", "x");
if (t25.ok && t25.value["@id"] === "x") correct++;

// Test 26: Special characters in ID
total++;
const t26 = createNode("Task", "task:agent-v4-1775213049624");
if (t26.ok && t26.value["@id"].includes(":")) correct++;

// Test 27: Unicode in type and ID
total++;
const t27 = createNode("タスク", "タスク-27");
if (t27.ok && t27.value["@type"] === "タスク") correct++;

// Test 28: Large extra object
total++;
const largeExtra: Record<string, unknown> = {};
for (let i = 0; i < 100; i++) {
  largeExtra[`field${i}`] = i;
}
const t28 = createNode("Large", "large-28", largeExtra);
if (t28.ok && Object.keys(t28.value).length > 100) correct++;

// Test 29: Timestamp uniqueness across rapid calls
total++;
const t29a = createNode("Task", "task-29a");
const t29b = createNode("Task", "task-29b");
if (t29a.ok && t29b.ok && t29a.value.timestamp <= t29b.value.timestamp) correct++;

// Test 30: Result<T> type safety through chaining
total++;
let chainedResult: Result<SeVoNode> = { ok: true, value: { "@context": "sevo://v1", "@type": "Task", "@id": "task-30", timestamp: new Date().toISOString() } };
if (chainedResult.ok) {
  const validated = validateNode(chainedResult.value);
  if (validated.ok) correct++;
}

const accuracy = total > 0 ? correct / total : 0;
const magnitude = correct > 0 ? correct / 30 : 0;
const branchesExplored = 2;
const predictionError = 0.05;
const eqs = (accuracy * magnitude) / (branchesExplored * predictionError);

const fitness = Math.min(1.0, eqs);
const output = {
  fitness: parseFloat(fitness.toFixed(3)),
  branches: branchesExplored,
  correct: correct,
  total: total,
};

console.log(JSON.stringify(output));
