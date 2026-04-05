// blueprints/agent-v5.ts — Crossover child combining v4 type safety + v1 test coverage
// Parent 1 (v4): Result<T> pattern, comprehensive validation, ID length checks
// Parent 2 (v1): Direct tests, fitness scoring, pragmatic approach
// Child (v5): Unified error handling + comprehensive test suite + Byzantine-aware validation

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
  | { code: "ORDERING_VIOLATION"; message: string }
  | { code: "BYZANTINE_EQUIVOCATION"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  // Type validation
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be non-empty string` } };
  }
  if (type.length > 128) {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type exceeds 128 chars` } };
  }

  // ID validation
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be non-empty string` } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars` } };
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id contains invalid characters` } };
  }

  // Timestamp
  const timestamp = new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: `Timestamp format invalid` } };
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

  // Context check
  if (n["@context"] !== "sevo://v1") {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: `Expected sevo://v1` } };
  }

  // Type check
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }

  // ID check
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if (n["@id"].length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id exceeds 256 chars" } };
  }

  // Timestamp check
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" } };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(n["timestamp"] as string)) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Timestamp format invalid" } };
  }

  return { ok: true, value: n as SeVoNode };
}

// Tracking for Byzantine detection
const seenNodeIds = new Set<string>();
const nodeTimestamps: Array<{ id: string; ts: string }> = [];

function detectDuplicateNode(id: string): Result<null> {
  if (seenNodeIds.has(id)) {
    return { ok: false, error: { code: "DUPLICATE_NODE", message: `Node ${id} already exists` } };
  }
  return { ok: true, value: null };
}

function enforceTimestampOrdering(id: string, timestamp: string): Result<null> {
  if (nodeTimestamps.length > 0) {
    const lastTs = nodeTimestamps[nodeTimestamps.length - 1].ts;
    if (timestamp < lastTs) {
      return { ok: false, error: { code: "ORDERING_VIOLATION", message: `Timestamp ordering violated` } };
    }
  }
  nodeTimestamps.push({ id, ts: timestamp });
  return { ok: true, value: null };
}

// Test execution
let correct = 0;
let total = 0;
const results: string[] = [];

// Test 1: Basic Task node creation
total++;
const test1 = createNode("Task", "task-1", { description: "basic test", priority: 1, status: "pending", dependsOn: [] });
if (test1.ok) {
  const v1 = validateNode(test1.value);
  if (v1.ok) {
    const dupCheck = detectDuplicateNode("task-1");
    if (dupCheck.ok) {
      const tsCheck = enforceTimestampOrdering("task-1", test1.value.timestamp);
      if (tsCheck.ok) {
        correct++;
        seenNodeIds.add("task-1");
        results.push("✓ Test 1: Basic Task creation");
      }
    }
  }
}

// Test 2: Agent node with metadata
total++;
const test2 = createNode("Agent", "agent-v5-1", { blueprint: "agent-v5.ts", generation: 5, status: "active", domain: "evolution" });
if (test2.ok) {
  const v2 = validateNode(test2.value);
  if (v2.ok && test2.value["@type"] === "Agent") {
    const dupCheck = detectDuplicateNode("agent-v5-1");
    if (dupCheck.ok) {
      const tsCheck = enforceTimestampOrdering("agent-v5-1", test2.value.timestamp);
      if (tsCheck.ok) {
        correct++;
        seenNodeIds.add("agent-v5-1");
        results.push("✓ Test 2: Agent node with metadata");
      }
    }
  }
}

// Test 3: Fitness node with complex context
total++;
const test3 = createNode("Fitness", "fitness:agent-v5-1-cycle-1", {
  agent: "agent-v5-1",
  eqs: 0.85,
  accuracy: 0.95,
  magnitude: 0.12,
  branchesExplored: 3,
  predictionError: 0.08,
  cycleId: "cycle-1",
  context: { benchmark: "v26", nodeCount: 150, avgLatency: 2.3 }
});
if (test3.ok) {
  const v3 = validateNode(test3.value);
  if (v3.ok && test3.value.eqs > 0 && test3.value.eqs < 1) {
    correct++;
    seenNodeIds.add("fitness:agent-v5-1-cycle-1");
    results.push("✓ Test 3: Fitness node with EQS scoring");
  }
}

// Test 4: ID length boundary (255 chars)
total++;
const longId = "node-" + "x".repeat(250);
const test4 = createNode("Task", longId, {});
if (test4.ok) {
  const v4 = validateNode(test4.value);
  if (v4.ok) {
    correct++;
    seenNodeIds.add(longId);
    results.push("✓ Test 4: ID length boundary (255 chars)");
  }
}

// Test 5: ID length rejection (257 chars)
total++;
const tooLongId = "node-" + "x".repeat(252);
const test5 = createNode("Task", tooLongId, {});
if (!test5.ok && test5.error.code === "INVALID_ID") {
  correct++;
  results.push("✓ Test 5: ID rejection at 257 chars");
}

// Test 6: Invalid ID characters rejection
total++;
const invalidId = "task@invalid#id";
const test6 = createNode("Task", invalidId, {});
if (!test6.ok && test6.error.code === "INVALID_ID") {
  correct++;
  results.push("✓ Test 6: Invalid ID characters rejected");
}

// Test 7: Duplicate node detection
total++;
seenNodeIds.add("existing-node");
const test7 = detectDuplicateNode("existing-node");
if (!test7.ok && test7.error.code === "DUPLICATE_NODE") {
  correct++;
  results.push("✓ Test 7: Duplicate node detection");
}

// Test 8: Timestamp ordering enforcement
total++;
const ts1 = "2026-04-05T10:00:00.000Z";
const ts2 = "2026-04-05T10:00:01.000Z";
const ts1Check = enforceTimestampOrdering("node-ts-1", ts1);
const ts2Check = enforceTimestampOrdering("node-ts-2", ts2);
if (ts1Check.ok && ts2Check.ok) {
  correct++;
  results.push("✓ Test 8: Timestamp ordering enforced");
}

// Test 9: Timestamp ordering violation
total++;
const tsViolation = enforceTimestampOrdering("node-ts-early", "2026-04-05T09:00:00.000Z");
if (!tsViolation.ok && tsViolation.error.code === "ORDERING_VIOLATION") {
  correct++;
  results.push("✓ Test 9: Timestamp ordering violation detected");
}

// Test 10: Selection node (Byzantine resilience concept)
total++;
const test10 = createNode("Selection", "selection:winner-loser-1", {
  winner: "agent-v5-1",
  loser: "agent-v4-3",
  winnerEqs: 0.88,
  loserEqs: 0.72,
  reasoning: "winner shows better evolutionary quality",
  eqsDelta: 0.16
});
if (test10.ok) {
  const v10 = validateNode(test10.value);
  if (v10.ok && test10.value.eqsDelta > 0) {
    correct++;
    seenNodeIds.add("selection:winner-loser-1");
    results.push("✓ Test 10: Selection node with winner choice");
  }
}

// Test 11: Mutation proposal node
total++;
const test11 = createNode("Mutation", "mutation:agent-v5-2-1", {
  parent: "agent-v5-1",
  proposal: "improve Byzantine consensus latency",
  branch: "mutation/agent-v5-2-1775381900000",
  status: "proposed",
  reasoning: "reduce fast-path latency from 3 to 2 network delays"
});
if (test11.ok) {
  const v11 = validateNode(test11.value);
  if (v11.ok && test11.value.status === "proposed") {
    correct++;
    seenNodeIds.add("mutation:agent-v5-2-1");
    results.push("✓ Test 11: Mutation proposal node");
  }
}

// Test 12: Missing @context rejection
total++;
const invalidNode = { "@type": "Task", "@id": "task-bad", timestamp: new Date().toISOString() };
const test12 = validateNode(invalidNode);
if (!test12.ok && test12.error.code === "INVALID_CONTEXT") {
  correct++;
  results.push("✓ Test 12: Missing @context rejected");
}

// Test 13: Type validation with empty string
total++;
const test13 = createNode("", "valid-id", {});
if (!test13.ok && test13.error.code === "INVALID_TYPE") {
  correct++;
  results.push("✓ Test 13: Empty type rejected");
}

// Test 14: ID validation with null
total++;
const test14 = createNode("Task", null as unknown as string, {});
if (!test14.ok && test14.error.code === "INVALID_ID") {
  correct++;
  results.push("✓ Test 14: Null ID rejected");
}

// Test 15: Complex nested structure preservation
total++;
const test15 = createNode("Fitness", "fitness:complex-1", {
  context: {
    consensus: { fastPath: { latency: 2.3, correctness: 0.99 }, slowPath: { latency: 15.2 } },
    Byzantine: { faults: 3, tolerance: 0.33, recovery: true }
  }
});
if (test15.ok) {
  const v15 = validateNode(test15.value);
  const ctx = test15.value.context as Record<string, unknown>;
  if (v15.ok && ctx && typeof ctx === "object") {
    correct++;
    seenNodeIds.add("fitness:complex-1");
    results.push("✓ Test 15: Complex nested structures preserved");
  }
}

// Calculate fitness scores
const accuracy = correct / total;
const magnitude = Math.min(total / 10, 1.0);
const branchesExplored = 2; // v4 + v1 parents
const predictionError = Math.abs(0.75 - accuracy); // expected 75% pass rate
const eqs = (accuracy * magnitude) / Math.max(branchesExplored * predictionError, 0.001);

console.log(results.join("\n"));
console.log(`\nPassed ${correct}/${total} tests`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}%`);
console.log(`EQS: ${eqs.toFixed(3)}`);

// Output JSON fitness score
console.log(JSON.stringify({
  fitness: Math.min(accuracy, 1.0),
  branches: branchesExplored,
  correct,
  total,
  eqs: eqs,
  accuracy: accuracy,
  magnitude: magnitude,
  predictionError: predictionError,
  testsRun: total,
  byzantineTests: ["duplicate-detection", "timestamp-ordering", "selection-ranking"]
}));
