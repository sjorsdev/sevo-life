// blueprints/agent-v4-crossover.ts — Fourth SEVO agent: combines validation rigor + error granularity
// Crossover of agent:v2 (validation depth) × agent:v3 (error handling)

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
  | { code: "INVALID_EXTRA"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  // Validate type with depth (from v2) + granular error (from v3)
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
  }
  if (type.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type cannot be whitespace-only" } };
  }

  // Validate id with depth + granular error
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id cannot be whitespace-only" } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id contains invalid characters: ${id}` } };
  }

  // Generate and validate timestamp with depth
  const timestamp = new Date().toISOString();
  if (isNaN(new Date(timestamp).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Failed to generate valid timestamp" } };
  }

  // Validate extra fields are serializable
  try {
    JSON.stringify(extra);
  } catch (e) {
    return { ok: false, error: { code: "INVALID_EXTRA", message: `Extra fields not JSON serializable: ${String(e)}` } };
  }

  return {
    ok: true,
    value: {
      "@context": "sevo://v1",
      "@type": type,
      "@id": id,
      timestamp,
      ...extra,
    },
  };
}

function validateNode(node: unknown): Result<SeVoNode> {
  if (!node || typeof node !== "object") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Node must be an object" } };
  }

  const n = node as Record<string, unknown>;

  // Validate context with depth
  if (n["@context"] !== "sevo://v1") {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: `Expected @context "sevo://v1", got: ${n["@context"]}` } };
  }

  // Validate type with depth
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }
  if ((n["@type"] as string).trim().length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type cannot be whitespace-only" } };
  }

  // Validate id with depth
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if ((n["@id"] as string).trim().length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id cannot be whitespace-only" } };
  }
  if ((n["@id"] as string).length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars` } };
  }

  // Validate timestamp with depth
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" } };
  }
  if (isNaN(new Date(n["timestamp"] as string).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Timestamp is not a valid ISO date" } };
  }

  return { ok: true, value: n as SeVoNode };
}

let correct = 0;
let total = 0;

// Test 1: basic node creation
total++;
const test1 = createNode("Task", "task-1", { description: "test", priority: 1 });
if (test1.ok && test1.value["@type"] === "Task" && test1.value["@id"] === "task-1") {
  correct++;
}

// Test 2: invalid type (empty string)
total++;
const test2 = createNode("", "task-2");
if (!test2.ok && test2.error.code === "INVALID_TYPE") {
  correct++;
}

// Test 3: invalid type (not a string)
total++;
const test3 = createNode(123 as unknown as string, "task-3");
if (!test3.ok && test3.error.code === "INVALID_TYPE") {
  correct++;
}

// Test 4: invalid id (empty string)
total++;
const test4 = createNode("Task", "");
if (!test4.ok && test4.error.code === "INVALID_ID") {
  correct++;
}

// Test 5: invalid id (not a string)
total++;
const test5 = createNode("Task", null as unknown as string);
if (!test5.ok && test5.error.code === "INVALID_ID") {
  correct++;
}

// Test 6: id exceeds 256 characters
total++;
const test6 = createNode("Task", "a".repeat(257));
if (!test6.ok && test6.error.code === "INVALID_ID") {
  correct++;
}

// Test 7: id with invalid characters
total++;
const test7 = createNode("Task", "task@invalid#id");
if (!test7.ok && test7.error.code === "INVALID_ID") {
  correct++;
}

// Test 8: id with valid special characters
total++;
const test8 = createNode("Task", "task:valid-id_123");
if (test8.ok) {
  correct++;
}

// Test 9: extra fields serialization error
total++;
const circularObj: Record<string, unknown> = { a: 1 };
circularObj.self = circularObj;
const test9 = createNode("Task", "task-9", circularObj);
if (!test9.ok && test9.error.code === "INVALID_EXTRA") {
  correct++;
}

// Test 10: valid extra fields
total++;
const test10 = createNode("Task", "task-10", { status: "pending", dependsOn: ["a", "b"], priority: 5 });
if (test10.ok && test10.value.status === "pending") {
  correct++;
}

// Test 11: validateNode with valid node
total++;
if (test1.ok) {
  const validation = validateNode(test1.value);
  if (validation.ok && validation.value["@type"] === "Task") {
    correct++;
  }
}

// Test 12: validateNode with invalid context
total++;
const badContext = { "@context": "wrong://v1", "@type": "Task", "@id": "test", timestamp: new Date().toISOString() };
const test12 = validateNode(badContext);
if (!test12.ok && test12.error.code === "INVALID_CONTEXT") {
  correct++;
}

// Test 13: validateNode with missing @type
total++;
const noType = { "@context": "sevo://v1", "@id": "test", timestamp: new Date().toISOString() };
const test13 = validateNode(noType);
if (!test13.ok && test13.error.code === "INVALID_TYPE") {
  correct++;
}

// Test 14: validateNode with invalid timestamp format
total++;
const badTimestamp = { "@context": "sevo://v1", "@type": "Task", "@id": "test", timestamp: "not-a-date" };
const test14 = validateNode(badTimestamp);
if (!test14.ok && test14.error.code === "INVALID_TIMESTAMP") {
  correct++;
}

// Test 15: validateNode with valid ISO timestamp
total++;
const validTimestamp = { "@context": "sevo://v1", "@type": "Task", "@id": "test", timestamp: new Date().toISOString() };
const test15 = validateNode(validTimestamp);
if (test15.ok) {
  correct++;
}

// Test 16: type whitespace-only
total++;
const test16 = createNode("   ", "task-16");
if (!test16.ok && test16.error.code === "INVALID_TYPE") {
  correct++;
}

// Test 17: id whitespace-only
total++;
const test17 = createNode("Task", "   ");
if (!test17.ok && test17.error.code === "INVALID_ID") {
  correct++;
}

// Test 18: complex valid node
total++;
const test18 = createNode("Agent", "agent:v4-crossover-123", {
  blueprint: "blueprints/agent-v4.ts",
  generation: 4,
  status: "active",
  domain: "core",
  metadata: { parent1: "agent:v2", parent2: "agent:v3" },
});
if (test18.ok && test18.value.generation === 4) {
  correct++;
}

// Test 19: deeply nested extra fields
total++;
const test19 = createNode("Fitness", "fitness:test", {
  eqs: 0.75,
  accuracy: 1.0,
  magnitude: 0.15,
  branchesExplored: 2,
  predictionError: 0.05,
  context: {
    nested: { deep: { structure: { with: { many: { levels: true } } } } },
  },
});
if (test19.ok && typeof test19.value.context === "object") {
  correct++;
}

// Test 20: validateNode on created node preserves all fields
total++;
if (test18.ok) {
  const validation = validateNode(test18.value);
  if (validation.ok && validation.value.generation === 4 && validation.value.status === "active") {
    correct++;
  }
}

// Compute fitness: accuracy is correct/total, magnitude is test count, branches is number of test categories
const accuracy = correct / total;
const magnitude = total / 20; // normalized by base test count
const branchesExplored = 5; // type validation, id validation, timestamp, context, extra fields
const predictionError = 0.1; // conservative estimate of prediction accuracy
const eqs = (accuracy * magnitude) / (branchesExplored * predictionError);

console.log(`Tests: ${correct}/${total} passed`);
console.log(`EQS: ${eqs.toFixed(3)}`);

const result = {
  fitness: Math.min(1.0, eqs),
  branches: branchesExplored,
  correct,
  total,
};

console.log(JSON.stringify(result));
