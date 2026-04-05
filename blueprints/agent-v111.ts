// blueprints/agent-v4.ts — Child of agent-v2 and agent-v3: merged error handling + comprehensive testing
// Combines v2's thorough validation with v3's granular error codes and Result<T> pattern

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
  | { code: "MISSING_FIELD"; message: string }
  | { code: "CONSTRAINT_VIOLATION"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
  }
  if (type.length > 128) {
    return { ok: false, error: { code: "CONSTRAINT_VIOLATION", message: `@type exceeds 128 chars: ${type.length}` } };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "CONSTRAINT_VIOLATION", message: `@id exceeds 256 chars: ${id.length}` } };
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) {
    return { ok: false, error: { code: "CONSTRAINT_VIOLATION", message: `@id contains invalid characters: ${id}` } };
  }

  const timestamp = new Date().toISOString();
  if (isNaN(new Date(timestamp).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Failed to generate valid ISO timestamp" } };
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
  if ((n["@id"] as string).length > 256) {
    return { ok: false, error: { code: "CONSTRAINT_VIOLATION", message: `@id exceeds 256 chars` } };
  }

  return { ok: true, value: n as SeVoNode };
}

let correct = 0;
let total = 0;

// Test 1: Basic node creation
total++;
{
  const result = createNode("Task", "task-1", { description: "test", priority: 1 });
  if (result.ok && validateNode(result.value).ok) correct++;
}

// Test 2: Multiple node types
total++;
{
  const types = ["Agent", "Fitness", "Selection", "Mutation", "Benchmark"];
  let allValid = true;
  for (const t of types) {
    const result = createNode(t, `${t.toLowerCase()}-test-1`);
    if (!result.ok || !validateNode(result.value).ok) {
      allValid = false;
      break;
    }
  }
  if (allValid) correct++;
}

// Test 3: Empty type rejected
total++;
{
  const result = createNode("", "test-id");
  if (!result.ok && result.error.code === "INVALID_TYPE") correct++;
}

// Test 4: Empty ID rejected
total++;
{
  const result = createNode("Task", "");
  if (!result.ok && result.error.code === "INVALID_ID") correct++;
}

// Test 5: ID too long (>256 chars) rejected
total++;
{
  const longId = "a".repeat(257);
  const result = createNode("Task", longId);
  if (!result.ok && result.error.code === "CONSTRAINT_VIOLATION") correct++;
}

// Test 6: Type too long (>128 chars) rejected
total++;
{
  const longType = "T".repeat(129);
  const result = createNode(longType, "test-id");
  if (!result.ok && result.error.code === "CONSTRAINT_VIOLATION") correct++;
}

// Test 7: Invalid ID characters rejected
total++;
{
  const result = createNode("Task", "test id with spaces!");
  if (!result.ok && result.error.code === "CONSTRAINT_VIOLATION") correct++;
}

// Test 8: Valid ID with allowed special chars
total++;
{
  const result = createNode("Task", "agent:v4-test_1");
  if (result.ok) correct++;
}

// Test 9: Validation catches invalid context
total++;
{
  const node = { "@context": "wrong://v1", "@type": "Task", "@id": "test", timestamp: new Date().toISOString() };
  const result = validateNode(node);
  if (!result.ok && result.error.code === "INVALID_CONTEXT") correct++;
}

// Test 10: Validation catches missing @type
total++;
{
  const node = { "@context": "sevo://v1", "@id": "test", timestamp: new Date().toISOString() };
  const result = validateNode(node);
  if (!result.ok && result.error.code === "INVALID_TYPE") correct++;
}

// Test 11: Validation catches missing @id
total++;
{
  const node = { "@context": "sevo://v1", "@type": "Task", timestamp: new Date().toISOString() };
  const result = validateNode(node);
  if (!result.ok && result.error.code === "INVALID_ID") correct++;
}

// Test 12: Validation catches missing timestamp
total++;
{
  const node = { "@context": "sevo://v1", "@type": "Task", "@id": "test" };
  const result = validateNode(node);
  if (!result.ok && result.error.code === "INVALID_TIMESTAMP") correct++;
}

// Test 13: Validation catches invalid timestamp format
total++;
{
  const node = { "@context": "sevo://v1", "@type": "Task", "@id": "test", timestamp: "not-a-date" };
  const result = validateNode(node);
  if (!result.ok && result.error.code === "INVALID_TIMESTAMP") correct++;
}

// Test 14: Validation accepts valid complex node
total++;
{
  const result = createNode("Fitness", "fitness:agent1-cycle1", {
    agent: "agent:v4",
    eqs: 0.85,
    accuracy: 1.0,
    magnitude: 0.3,
    branchesExplored: 2,
    predictionError: 0.1,
    cycleId: "cycle-1",
    context: { task: "test" },
  });
  if (result.ok && validateNode(result.value).ok) correct++;
}

// Test 15: Extra fields are preserved
total++;
{
  const result = createNode("Agent", "agent:v4-test", {
    generation: 4,
    blueprint: "blueprints/agent-v4.ts",
    status: "active",
  });
  if (result.ok && result.value.generation === 4) correct++;
}

// Test 16: Non-object validation rejected
total++;
{
  const result = validateNode(null);
  if (!result.ok && result.error.code === "INVALID_TYPE") correct++;
}

// Test 17: Number instead of object rejected
total++;
{
  const result = validateNode(42);
  if (!result.ok && result.error.code === "INVALID_TYPE") correct++;
}

// Test 18: String instead of object rejected
total++;
{
  const result = validateNode("not an object");
  if (!result.ok && result.error.code === "INVALID_TYPE") correct++;
}

// Test 19: Timestamp is ISO format (not arbitrary string)
total++;
{
  const result = createNode("Task", "timestamp-test");
  if (result.ok) {
    const parsed = new Date(result.value.timestamp);
    if (!isNaN(parsed.getTime())) correct++;
  }
}

// Test 20: Multiple nodes with same @id base but different suffixes
total++;
{
  const results = [];
  for (let i = 0; i < 3; i++) {
    const result = createNode("Task", `batch-task-${i}`);
    results.push(result.ok && validateNode(result.value).ok);
  }
  if (results.every((r) => r)) correct++;
}

const fitness = Math.min(1.0, correct / total);
const branches = 2;

console.log(
  JSON.stringify({
    fitness: parseFloat(fitness.toFixed(3)),
    branches,
    correct,
    total,
  })
);
