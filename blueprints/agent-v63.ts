// blueprints/agent-v4.ts — Crossover of agent-v2 (validation depth) + agent-v3 (error granularity)
// Combines comprehensive testing with Result<T> pattern and explicit error codes

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
  | { code: "CONSTRAINT_VIOLATION"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  // Validate type
  if (!type || typeof type !== "string" || type.trim().length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` },
    };
  }

  // Validate id
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` },
    };
  }

  if (id.length > 256) {
    return {
      ok: false,
      error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` },
    };
  }

  // Validate id format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id contains invalid characters: ${id}. Only alphanumeric, hyphens, and underscores allowed.`,
      },
    };
  }

  // Generate and validate timestamp
  const timestamp = new Date().toISOString();
  if (isNaN(new Date(timestamp).getTime())) {
    return {
      ok: false,
      error: { code: "INVALID_TIMESTAMP", message: `Failed to generate valid timestamp: ${timestamp}` },
    };
  }

  // Validate extra fields do not contain reserved keys
  if (extra && typeof extra === "object") {
    for (const key of Object.keys(extra)) {
      if (["@context", "@type", "@id", "timestamp"].includes(key)) {
        return {
          ok: false,
          error: {
            code: "CONSTRAINT_VIOLATION",
            message: `Cannot override reserved field: ${key}`,
          },
        };
      }
    }
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
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: "Not an object" },
    };
  }

  const n = node as Record<string, unknown>;

  // Context validation
  if (n["@context"] !== "sevo://v1") {
    return {
      ok: false,
      error: {
        code: "INVALID_CONTEXT",
        message: `Expected sevo://v1, got ${n["@context"]}`,
      },
    };
  }

  // Type validation
  if (!n["@type"] || typeof n["@type"] !== "string" || (n["@type"] as string).trim().length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: "Missing or invalid @type" },
    };
  }

  // ID validation
  if (!n["@id"] || typeof n["@id"] !== "string" || (n["@id"] as string).trim().length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_ID", message: "Missing or invalid @id" },
    };
  }

  if ((n["@id"] as string).length > 256) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id exceeds 256 chars: ${(n["@id"] as string).length}`,
      },
    };
  }

  // Timestamp validation
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" },
    };
  }

  if (isNaN(new Date(n["timestamp"] as string).getTime())) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Timestamp is not a valid ISO date: ${n["timestamp"]}`,
      },
    };
  }

  return {
    ok: true,
    value: n as SeVoNode,
  };
}

function createBatchNodes(
  configs: Array<{ type: string; id: string; extra?: Record<string, unknown> }>
): Result<Array<SeVoNode & Record<string, unknown>>> {
  const nodes: Array<SeVoNode & Record<string, unknown>> = [];
  const seenIds = new Set<string>();

  for (const config of configs) {
    if (seenIds.has(config.id)) {
      return {
        ok: false,
        error: {
          code: "DUPLICATE_NODE",
          message: `Duplicate @id in batch: ${config.id}`,
        },
      };
    }
    seenIds.add(config.id);

    const result = createNode(config.type, config.id, config.extra);
    if (!result.ok) {
      return result;
    }
    nodes.push(result.value);
  }

  return { ok: true, value: nodes };
}

// Comprehensive test suite
let correct = 0;
let total = 0;

// Test 1: Basic node creation with valid inputs
total++;
{
  const result = createNode("Task", "task-001", { description: "test", priority: 1, status: "pending", dependsOn: [] });
  if (result.ok && result.value["@type"] === "Task" && result.value["@id"] === "task-001") {
    correct++;
  }
}

// Test 2: Validate created node
total++;
{
  const result = createNode("Agent", "agent-v1", { blueprint: "agent-v1.ts" });
  if (result.ok) {
    const validation = validateNode(result.value);
    if (validation.ok) {
      correct++;
    }
  }
}

// Test 3: Empty type should fail
total++;
{
  const result = createNode("", "id-123");
  if (!result.ok && result.error.code === "INVALID_TYPE") {
    correct++;
  }
}

// Test 4: Empty id should fail
total++;
{
  const result = createNode("Task", "");
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
}

// Test 5: ID exceeding 256 chars should fail
total++;
{
  const longId = "a".repeat(257);
  const result = createNode("Mutation", longId);
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
}

// Test 6: ID with invalid characters should fail
total++;
{
  const result = createNode("Fitness", "id@invalid!");
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
}

// Test 7: Valid ID with hyphens and underscores
total++;
{
  const result = createNode("Selection", "selection_v1-2024");
  if (result.ok && result.value["@id"] === "selection_v1-2024") {
    correct++;
  }
}

// Test 8: Timestamp is valid ISO format
total++;
{
  const result = createNode("Benchmark", "bench-v1");
  if (result.ok && !isNaN(new Date(result.value.timestamp).getTime())) {
    correct++;
  }
}

// Test 9: Cannot override reserved fields
total++;
{
  const result = createNode("Task", "task-002", { "@type": "BadType" });
  if (!result.ok && result.error.code === "CONSTRAINT_VIOLATION") {
    correct++;
  }
}

// Test 10: Cannot override @id in extra
total++;
{
  const result = createNode("Agent", "agent-v2", { "@id": "different-id" });
  if (!result.ok && result.error.code === "CONSTRAINT_VIOLATION") {
    correct++;
  }
}

// Test 11: Validate node with missing @context
total++;
{
  const invalid = { "@type": "Task", "@id": "task-003", timestamp: new Date().toISOString() };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_CONTEXT") {
    correct++;
  }
}

// Test 12: Validate node with invalid context
total++;
{
  const invalid = {
    "@context": "invalid://v1",
    "@type": "Agent",
    "@id": "agent-v3",
    timestamp: new Date().toISOString(),
  };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_CONTEXT") {
    correct++;
  }
}

// Test 13: Validate node with missing @type
total++;
{
  const invalid = { "@context": "sevo://v1", "@id": "id-123", timestamp: new Date().toISOString() };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_TYPE") {
    correct++;
  }
}

// Test 14: Validate node with empty @type
total++;
{
  const invalid = {
    "@context": "sevo://v1",
    "@type": "",
    "@id": "id-123",
    timestamp: new Date().toISOString(),
  };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_TYPE") {
    correct++;
  }
}

// Test 15: Validate node with missing @id
total++;
{
  const invalid = { "@context": "sevo://v1", "@type": "Task", timestamp: new Date().toISOString() };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_ID") {
    correct++;
  }
}

// Test 16: Validate node with empty @id
total++;
{
  const invalid = {
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "",
    timestamp: new Date().toISOString(),
  };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_ID") {
    correct++;
  }
}

// Test 17: Validate node with missing timestamp
total++;
{
  const invalid = { "@context": "sevo://v1", "@type": "Task", "@id": "task-004" };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_TIMESTAMP") {
    correct++;
  }
}

// Test 18: Validate node with invalid timestamp
total++;
{
  const invalid = {
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "task-005",
    timestamp: "not-a-date",
  };
  const validation = validateNode(invalid);
  if (!validation.ok && validation.error.code === "INVALID_TIMESTAMP") {
    correct++;
  }
}

// Test 19: Batch node creation with valid configs
total++;
{
  const result = createBatchNodes([
    { type: "Task", id: "batch-task-1", extra: { priority: 1 } },
    { type: "Agent", id: "batch-agent-1", extra: { generation: 1 } },
  ]);
  if (result.ok && result.value.length === 2) {
    correct++;
  }
}

// Test 20: Batch node creation detects duplicate IDs
total++;
{
  const result = createBatchNodes([
    { type: "Task", id: "duplicate-id" },
    { type: "Agent", id: "duplicate-id" },
  ]);
  if (!result.ok && result.error.code === "DUPLICATE_NODE") {
    correct++;
  }
}

// Test 21: Batch node creation fails on invalid config
total++;
{
  const result = createBatchNodes([
    { type: "Task", id: "valid-id" },
    { type: "", id: "invalid-type-id" },
  ]);
  if (!result.ok && result.error.code === "INVALID_TYPE") {
    correct++;
  }
}

// Test 22: Extra fields with valid names are preserved
total++;
{
  const result = createNode("Fitness", "fitness-1", {
    eqs: 0.95,
    accuracy: 0.9,
    magnitude: 0.5,
  });
  if (result.ok && result.value.eqs === 0.95 && result.value.accuracy === 0.9) {
    correct++;
  }
}

// Test 23: Cannot override timestamp in extra
total++;
{
  const result = createNode("Selection", "selection-1", { timestamp: "2020-01-01T00:00:00Z" });
  if (!result.ok && result.error.code === "CONSTRAINT_VIOLATION") {
    correct++;
  }
}

// Test 24: Cannot override @context in extra
total++;
{
  const result = createNode("Mutation", "mutation-1", { "@context": "invalid://v1" });
  if (!result.ok && result.error.code === "CONSTRAINT_VIOLATION") {
    correct++;
  }
}

// Test 25: Node type can be any non-empty string
total++;
{
  const result = createNode("CustomNodeType", "custom-1");
  if (result.ok && result.value["@type"] === "CustomNodeType") {
    correct++;
  }
}

// Test 26: Node with numeric extra fields
total++;
{
  const result = createNode("Benchmark", "bench-v2", { difficulty: 42, version: 2 });
  if (result.ok && result.value.difficulty === 42 && result.value.version === 2) {
    correct++;
  }
}

// Test 27: Node with array extra fields
total++;
{
  const result = createNode("Task", "task-array", { dependsOn: ["task-1", "task-2"] });
  if (result.ok && Array.isArray(result.value.dependsOn) && (result.value.dependsOn as string[]).length === 2) {
    correct++;
  }
}

// Test 28: Whitespace-only type should fail
total++;
{
  const result = createNode("   ", "id-123");
  if (!result.ok && result.error.code === "INVALID_TYPE") {
    correct++;
  }
}

// Test 29: Whitespace-only id should fail
total++;
{
  const result = createNode("Task", "   ");
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
}

// Test 30: Not an object should fail validation
total++;
{
  const validation = validateNode("not an object");
  if (!validation.ok && validation.error.code === "INVALID_TYPE") {
    correct++;
  }
}

const fitness = correct / Math.max(total, 1);
console.log(`{"fitness": ${fitness.toFixed(4)}, "branches": 1, "correct": ${correct}, "total": ${total}}`);
