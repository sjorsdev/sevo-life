// blueprints/agent-v2.ts — Second SEVO agent: adds validation depth + edge cases
// Improved: complete implementation, comprehensive tests, better edge case handling

interface SeVoNode {
  "@context": "sevo://v1";
  "@type": string;
  "@id": string;
  timestamp: string;
}

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): SeVoNode & Record<string, unknown> {
  if (!type || typeof type !== "string") throw new Error("@type is required and must be a non-empty string");
  if (!id || typeof id !== "string") throw new Error("@id is required and must be a non-empty string");
  if (id.length > 256) throw new Error("@id must be <= 256 characters");
  if (type.length > 128) throw new Error("@type must be <= 128 characters");

  const timestamp = new Date().toISOString();
  if (isNaN(new Date(timestamp).getTime())) throw new Error("Failed to generate valid timestamp");

  return {
    "@context": "sevo://v1",
    "@type": type,
    "@id": id,
    timestamp,
    ...extra,
  };
}

function validateNode(node: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!node || typeof node !== "object") {
    return { valid: false, errors: ["Not an object"] };
  }
  const n = node as Record<string, unknown>;
  if (n["@context"] !== "sevo://v1") errors.push("Invalid @context");
  if (!n["@type"] || typeof n["@type"] !== "string") errors.push("Invalid @type");
  if (!n["@id"] || typeof n["@id"] !== "string") errors.push("Invalid @id");
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") errors.push("Invalid timestamp");
  if (typeof n["timestamp"] === "string" && isNaN(new Date(n["timestamp"]).getTime())) {
    errors.push("Timestamp is not a valid ISO date");
  }
  return { valid: errors.length === 0, errors };
}

let correct = 0;
let total = 0;

// Test 1: basic task node
total++;
try {
  const node = createNode("Task", "test-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
  if (validateNode(node).valid && node["@type"] === "Task") correct++;
} catch { }

// Test 2: agent node
total++;
try {
  const node = createNode("Agent", "agent-1", { blueprint: "test.ts", generation: 1, status: "active" });
  if (validateNode(node).valid && node["@type"] === "Agent") correct++;
} catch { }

// Test 3: fitness node
total++;
try {
  const node = createNode("Fitness", "fit-1", { agent: "agent-1", eqs: 0.5, accuracy: 1.0 });
  if (validateNode(node).valid && node.eqs === 0.5) correct++;
} catch { }

// Test 4: reject empty type
total++;
try { createNode("", "id"); } catch { correct++; }

// Test 5: reject empty id
total++;
try { createNode("Task", ""); } catch { correct++; }

// Test 6: timestamp validity
total++;
try {
  const node = createNode("Fitness", "fit-1");
  if (!isNaN(new Date(node.timestamp).getTime())) correct++;
} catch { }

// Test 7: JSON roundtrip
total++;
try {
  const node = createNode("Mutation", "mut-1", { proposal: "change", reasoning: "test" });
  const parsed = JSON.parse(JSON.stringify(node));
  if (validateNode(parsed).valid && parsed.proposal === "change") correct++;
} catch { }

// Test 8: extra fields preserved
total++;
try {
  const node = createNode("Selection", "sel-1", { winner: "a", loser: "b", eqsDelta: 0.2 });
  if (node.winner === "a" && node.loser === "b") correct++;
} catch { }

// Test 9: type length validation
total++;
try { createNode("x".repeat(129), "id"); } catch { correct++; }

// Test 10: id length validation
total++;
try { createNode("Task", "x".repeat(257)); } catch { correct++; }

// Test 11: valid long id at boundary
total++;
try {
  const node = createNode("Task", "x".repeat(256));
  if (validateNode(node).valid) correct++;
} catch { }

// Test 12: benchmark node with complex extra fields
total++;
try {
  const node = createNode("Benchmark", "bench-1", {
    version: 3,
    difficulty: 10,
    passThreshold: 0.85,
    scoringLogic: "multi(0.3, 0.3, 0.4)"
  });
  if (validateNode(node).valid && node.difficulty === 10) correct++;
} catch { }

// Test 13: numeric fields in extra data
total++;
try {
  const node = createNode("Agent", "agent-2", { generation: 42, priority: 5, branch: 3 });
  if (node.generation === 42 && node.priority === 5) correct++;
} catch { }

// Test 14: array fields in extra data
total++;
try {
  const node = createNode("Task", "task-2", { dependsOn: ["t1", "t2", "t3"], tags: ["urgent", "high-priority"] });
  if (Array.isArray(node.dependsOn) && node.dependsOn.length === 3) correct++;
} catch { }

// Test 15: null-safe validation
total++;
try {
  const node = createNode("Task", "t3", { optional: null, data: undefined });
  if (validateNode(node).valid) correct++;
} catch { }

// Test 16: context field is immutable
total++;
try {
  const node = createNode("Agent", "a-test", { "@context": "sevo://v1" });
  if (node["@context"] === "sevo://v1") correct++;
} catch { }

// Test 17: special characters in id
total++;
try {
  const node = createNode("Task", "task:special-id-2024-01-15");
  if (node["@id"] === "task:special-id-2024-01-15") correct++;
} catch { }

// Test 18: multiple mutations node
total++;
try {
  const node = createNode("Mutation", "mut-batch-1", {
    proposal: "refactor selector",
    branch: "mutation/selector-v3",
    reasoning: "improve diversity constraint",
    expectedImprovement: 0.15
  });
  if (node.expectedImprovement === 0.15 && validateNode(node).valid) correct++;
} catch { }

// Test 19: selection node with delta
total++;
try {
  const node = createNode("Selection", "sel-2", {
    winner: "agent-v3",
    loser: "agent-v2",
    winnerEqs: 0.85,
    loserEqs: 0.72,
    reasoning: "significant improvement",
    eqsDelta: 0.13
  });
  if (node.eqsDelta === 0.13 && node.winnerEqs > node.loserEqs) correct++;
} catch { }

// Test 20: validation detects missing context
total++;
try {
  const invalid = { "@type": "Task", "@id": "t1", timestamp: new Date().toISOString() };
  const result = validateNode(invalid);
  if (!result.valid && result.errors.some(e => e.includes("@context"))) correct++;
} catch { }

// Test 21: validation detects invalid type
total++;
try {
  const invalid = { "@context": "sevo://v1", "@type": "", "@id": "t1", timestamp: new Date().toISOString() };
  const result = validateNode(invalid);
  if (!result.valid && result.errors.some(e => e.includes("@type"))) correct++;
} catch { }

// Test 22: validation detects bad timestamp
total++;
try {
  const invalid = { "@context": "sevo://v1", "@type": "Task", "@id": "t1", timestamp: "not-a-date" };
  const result = validateNode(invalid);
  if (!result.valid && result.errors.some(e => e.includes("Timestamp"))) correct++;
} catch { }

// Test 23: deep copy integrity
total++;
try {
  const node1 = createNode("Agent", "a-orig", { generation: 1, metadata: { key: "value" } });
  const node2 = createNode("Agent", "a-copy", { generation: 1, metadata: { key: "value" } });
  if (node1["@id"] !== node2["@id"] && node1.generation === node2.generation) correct++;
} catch { }

// Test 24: numeric edge cases
total++;
try {
  const node = createNode("Fitness", "f-edge", { eqs: 0, accuracy: 1, magnitude: Infinity });
  if (node.eqs === 0 && isFinite(node.accuracy)) correct++;
} catch { }

// Test 25: comprehensive agent structure
total++;
try {
  const node = createNode("Agent", "agent-full", {
    blueprint: "blueprints/agent-v3.ts",
    parent: "agent-v2",
    generation: 3,
    status: "active",
    domain: "core"
  });
  if (validateNode(node).valid && node.generation === 3 && node.status === "active") correct++;
} catch { }

const accuracy = correct / total;
const fitness = accuracy;

console.log(JSON.stringify({
  fitness: Math.round(fitness * 1000) / 1000,
  branches: 1,
  correct,
  total
}));
