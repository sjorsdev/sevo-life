// blueprints/agent-crossover-v7.ts — Crossover of agent:v2 × agent:v3
// Combined: parent-v2's thorough validation + parent-v3's typed error pattern
// Target: Byzantine safety through immutable node structures and error resilience

interface SeVoNode {
  "@context": "sevo://v1";
  "@type": string;
  "@id": string;
  timestamp: string;
  readonly _sealed?: true;
}

type NodeError =
  | { code: "INVALID_TYPE"; message: string }
  | { code: "INVALID_ID"; message: string }
  | { code: "INVALID_TIMESTAMP"; message: string }
  | { code: "INVALID_CONTEXT"; message: string }
  | { code: "DUPLICATE_NODE"; message: string }
  | { code: "WRITE_FAILED"; message: string }
  | { code: "MUTATION_DETECTED"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

const nodeRegistry = new Set<string>();
const nodeVersions = new Map<string, number>();

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  // Validation from parent-v2: comprehensive type checks
  if (!type || typeof type !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` },
    };
  }

  if (type.length > 128) {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: `@type exceeds 128 chars: ${type.length}` },
    };
  }

  if (!id || typeof id !== "string") {
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

  // Validate ID format (alphanumeric, dash, colon)
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) {
    return {
      ok: false,
      error: { code: "INVALID_ID", message: `@id contains invalid characters: ${id}` },
    };
  }

  // Detect duplicate nodes (immutability check)
  const existingVersion = nodeVersions.get(id);
  if (existingVersion !== undefined) {
    return {
      ok: false,
      error: { code: "DUPLICATE_NODE", message: `Node ${id} already exists (version ${existingVersion})` },
    };
  }

  const timestamp = new Date().toISOString();

  // Validate timestamp is parseable (from parent-v2)
  if (isNaN(new Date(timestamp).getTime())) {
    return {
      ok: false,
      error: { code: "INVALID_TIMESTAMP", message: "Failed to generate valid ISO timestamp" },
    };
  }

  // Validate extra fields don't contain reserved keys
  for (const key of Object.keys(extra)) {
    if (key.startsWith("@")) {
      return {
        ok: false,
        error: { code: "INVALID_ID", message: `Reserved key in extra: ${key}` },
      };
    }
  }

  const node = Object.freeze({
    "@context": "sevo://v1",
    "@type": type,
    "@id": id,
    timestamp,
    ...extra,
  }) as SeVoNode & Record<string, unknown>;

  nodeRegistry.add(id);
  nodeVersions.set(id, 1);

  return { ok: true, value: node };
}

function validateNode(node: unknown): Result<SeVoNode> {
  if (!node || typeof node !== "object") {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: "Not an object" },
    };
  }

  const n = node as Record<string, unknown>;

  if (n["@context"] !== "sevo://v1") {
    return {
      ok: false,
      error: {
        code: "INVALID_CONTEXT",
        message: `Expected sevo://v1, got ${n["@context"]}`,
      },
    };
  }

  if (!n["@type"] || typeof n["@type"] !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: "Missing or invalid @type" },
    };
  }

  if (!n["@id"] || typeof n["@id"] !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_ID", message: "Missing or invalid @id" },
    };
  }

  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" },
    };
  }

  // Validate timestamp is parseable
  const tsDate = new Date(n["timestamp"] as string);
  if (isNaN(tsDate.getTime())) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Timestamp not valid ISO date: ${n["timestamp"]}`,
      },
    };
  }

  // Validate no mutations occurred (immutability check)
  if (Object.isFrozen(n) === false && n._sealed === true) {
    return {
      ok: false,
      error: {
        code: "MUTATION_DETECTED",
        message: "Node marked sealed but not frozen",
      },
    };
  }

  return { ok: true, value: n as SeVoNode };
}

let correct = 0;
let total = 0;

// Test suite: combine parent-v2 breadth with parent-v3's error typing

// Test 1: Basic node creation
total++;
const test1 = createNode("Task", "test-1", {
  description: "test",
  priority: 1,
  status: "pending",
  dependsOn: [],
});
if (test1.ok && validateNode(test1.value).ok) correct++;

// Test 2: Agent node with nested structure
total++;
const test2 = createNode("Agent", "agent-v4", {
  blueprint: "./blueprints/agent-v4.ts",
  generation: 4,
  status: "active",
});
if (test2.ok && validateNode(test2.value).ok) correct++;

// Test 3: Fitness node with numeric values
total++;
const test3 = createNode("Fitness", "fitness-cycle-1", {
  agent: "agent-v4",
  eqs: 0.85,
  accuracy: 1.0,
  magnitude: 0.5,
  branchesExplored: 3,
  predictionError: 0.1,
  cycleId: "cycle-001",
  context: { trials: 100 },
});
if (test3.ok && validateNode(test3.value).ok) correct++;

// Test 4: Mutation node
total++;
const test4 = createNode("Mutation", "mutation-aggressive-1", {
  parent: "agent-v4",
  proposal: "increase search depth",
  branch: "mutation/agent-v4-1704067200",
  status: "proposed",
  reasoning: "improve accuracy",
});
if (test4.ok && validateNode(test4.value).ok) correct++;

// Test 5: Invalid type (empty string)
total++;
const test5 = createNode("", "test-5");
if (!test5.ok && test5.error.code === "INVALID_TYPE") correct++;

// Test 6: Invalid type (non-string)
total++;
const test6 = createNode(123 as any, "test-6");
if (!test6.ok && test6.error.code === "INVALID_TYPE") correct++;

// Test 7: Invalid ID (empty string)
total++;
const test7 = createNode("Task", "");
if (!test7.ok && test7.error.code === "INVALID_ID") correct++;

// Test 8: Invalid ID (non-string)
total++;
const test8 = createNode("Task", null as any);
if (!test8.ok && test8.error.code === "INVALID_ID") correct++;

// Test 9: ID too long (>256 chars)
total++;
const test9 = createNode("Task", "x".repeat(257));
if (!test9.ok && test9.error.code === "INVALID_ID") correct++;

// Test 10: Type too long (>128 chars)
total++;
const test10 = createNode("x".repeat(129), "test-10");
if (!test10.ok && test10.error.code === "INVALID_TYPE") correct++;

// Test 11: ID with invalid characters
total++;
const test11 = createNode("Task", "test@#$%^");
if (!test11.ok && test11.error.code === "INVALID_ID") correct++;

// Test 12: Extra fields with reserved @ prefix
total++;
const test12 = createNode("Task", "test-12", { "@reserved": "value" });
if (!test12.ok && test12.error.code === "INVALID_ID") correct++;

// Test 13: Duplicate node detection
total++;
const test13a = createNode("Task", "unique-node", { priority: 1 });
const test13b = createNode("Task", "unique-node", { priority: 2 });
if (test13a.ok && !test13b.ok && test13b.error.code === "DUPLICATE_NODE") correct++;

// Test 14: Validation of valid complex node
total++;
const validNode = {
  "@context": "sevo://v1",
  "@type": "Selection",
  "@id": "selection-001",
  timestamp: new Date().toISOString(),
  winner: "agent-v5",
  loser: "agent-v4",
  reasoning: "eqs improved",
};
if (validateNode(validNode).ok) correct++;

// Test 15: Validation rejects invalid context
total++;
const badContext = {
  "@context": "sevo://v2",
  "@type": "Task",
  "@id": "test-15",
  timestamp: new Date().toISOString(),
};
if (!validateNode(badContext).ok) correct++;

// Test 16: Validation rejects missing @type
total++;
const noType = {
  "@context": "sevo://v1",
  "@id": "test-16",
  timestamp: new Date().toISOString(),
};
if (!validateNode(noType).ok) correct++;

// Test 17: Validation rejects missing @id
total++;
const noId = {
  "@context": "sevo://v1",
  "@type": "Task",
  timestamp: new Date().toISOString(),
};
if (!validateNode(noId).ok) correct++;

// Test 18: Validation rejects missing timestamp
total++;
const noTs = {
  "@context": "sevo://v1",
  "@type": "Task",
  "@id": "test-18",
};
if (!validateNode(noTs).ok) correct++;

// Test 19: Validation rejects invalid timestamp
total++;
const badTs = {
  "@context": "sevo://v1",
  "@type": "Task",
  "@id": "test-19",
  timestamp: "not-a-date",
};
if (!validateNode(badTs).ok) correct++;

// Test 20: Immutability - created nodes are frozen
total++;
const test20 = createNode("Task", "test-20", { data: "value" });
if (test20.ok && Object.isFrozen(test20.value)) correct++;

// Test 21: BenchmarkNode with difficulty escalation
total++;
const test21 = createNode("Benchmark", "benchmark-v5", {
  version: 5,
  task: "byzantine consensus",
  scoringLogic: "0.3*safety + 0.3*liveness + 0.4*fault_tolerance",
  difficulty: 15,
  passThreshold: 0.75,
});
if (test21.ok && validateNode(test21.value).ok) correct++;

// Test 22: SeedImprovementNode
total++;
const test22 = createNode("SeedImprovement", "seed-obs-001", {
  observation: "Type-safe errors reduce ambiguity",
  suggestion: "Use Result pattern globally",
  evidence: ["selection-001", "fitness-001"],
  priority: 1,
});
if (test22.ok && validateNode(test22.value).ok) correct++;

// Test 23: Large @id within bounds
total++;
const test23 = createNode("Task", "x".repeat(256), { data: 1 });
if (test23.ok && validateNode(test23.value).ok) correct++;

// Test 24: Numeric types in extra fields
total++;
const test24 = createNode("Fitness", "fitness-numeric-001", {
  eqs: 0.999,
  branches: 42,
  accuracy: 1.0,
  magnitude: 0,
  predictionError: NaN,
});
if (test24.ok && validateNode(test24.value).ok) correct++;

// Test 25: Complex nested structure
total++;
const test25 = createNode("Task", "task-complex-001", {
  dependsOn: ["task-1", "task-2", "task-3"],
  context: {
    metadata: { version: 1, author: "test" },
    config: { timeout: 5000, retries: 3 },
  },
  tags: ["benchmark", "evolution", "critical"],
});
if (test25.ok && validateNode(test25.value).ok) correct++;

// Output fitness metrics
const fitness = (correct / total) * 0.7 + (correct >= total * 0.9 ? 0.3 : 0);
const output = {
  fitness: Math.min(1.0, fitness),
  branches: 2,
  correct,
  total,
};

console.log(JSON.stringify(output));
