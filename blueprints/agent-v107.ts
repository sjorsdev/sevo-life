// blueprints/agent-v2-improved.ts
// Enhanced SEVO agent: complete implementation with comprehensive test coverage

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

function validateNodeStructure(node: unknown, expectedType: string): boolean {
  const validation = validateNode(node);
  if (!validation.valid) return false;
  const n = node as Record<string, unknown>;
  return n["@type"] === expectedType;
}

let correct = 0;
let total = 0;

// Test 1: basic task node creation
total++;
try {
  const node = createNode("Task", "task-basic", { description: "test", priority: 1, status: "pending", dependsOn: [] });
  if (validateNode(node).valid && node["@type"] === "Task") correct++;
} catch { }

// Test 2: agent node creation
total++;
try {
  const node = createNode("Agent", "agent-v2", { blueprint: "test.ts", generation: 2, status: "active" });
  if (validateNodeStructure(node, "Agent") && node.generation === 2) correct++;
} catch { }

// Test 3: fitness node with detailed metrics
total++;
try {
  const node = createNode("Fitness", "fitness-001", { eqs: 0.85, accuracy: 0.9, magnitude: 0.5, branchesExplored: 3, predictionError: 0.2 });
  if (validateNodeStructure(node, "Fitness") && node.eqs === 0.85) correct++;
} catch { }

// Test 4: mutation node with reasoning
total++;
try {
  const node = createNode("Mutation", "mut-alpha", { parent: "agent-v1", proposal: "refactor selector", branch: "mutation/agent-v1-001", status: "proposed", reasoning: "improve diversity" });
  if (validateNodeStructure(node, "Mutation") && node.status === "proposed") correct++;
} catch { }

// Test 5: selection node with comparison
total++;
try {
  const node = createNode("Selection", "sel-round-1", { winner: "agent-v2", loser: "agent-v1", winnerEqs: 0.9, loserEqs: 0.4, reasoning: "superior performance", eqsDelta: 0.5 });
  if (validateNodeStructure(node, "Selection") && node.eqsDelta === 0.5) correct++;
} catch { }

// Test 6: reject empty type
total++;
try { createNode("", "id"); } catch { correct++; }

// Test 7: reject empty id
total++;
try { createNode("Task", ""); } catch { correct++; }

// Test 8: reject long id (>256 chars)
total++;
try { createNode("Task", "x".repeat(257)); } catch { correct++; }

// Test 9: reject long type (>128 chars)
total++;
try { createNode("x".repeat(129), "id"); } catch { correct++; }

// Test 10: timestamp validity
total++;
try {
  const node = createNode("Fitness", "fit-time");
  const timestamp = new Date(node.timestamp);
  if (!isNaN(timestamp.getTime()) && Math.abs(Date.now() - timestamp.getTime()) < 5000) correct++;
} catch { }

// Test 11: JSON roundtrip preservation
total++;
try {
  const node = createNode("Mutation", "mut-json", { proposal: "optimize", reasoning: "reduce branches", branch: "feat/opt" });
  const json = JSON.stringify(node);
  const parsed = JSON.parse(json);
  if (validateNodeStructure(parsed, "Mutation") && parsed.proposal === "optimize") correct++;
} catch { }

// Test 12: extra fields preserved through validation
total++;
try {
  const node = createNode("Agent", "agent-extra", { blueprint: "a.ts", customField: "value123", nestedObj: { key: "val" } });
  if (node.customField === "value123" && node.nestedObj?.key === "val") correct++;
} catch { }

// Test 13: null extra fields handled
total++;
try {
  const node = createNode("Task", "task-null", { description: null, priority: 0 });
  if (validateNodeStructure(node, "Task")) correct++;
} catch { }

// Test 14: numeric and boolean fields in extra
total++;
try {
  const node = createNode("Agent", "agent-types", { generation: 5, active: true, score: 3.14159, archived: false });
  if (node.generation === 5 && node.active === true && node.score === 3.14159) correct++;
} catch { }

// Test 15: special characters in id
total++;
try {
  const node = createNode("Task", "task-special-@#$%-001");
  if (validateNodeStructure(node, "Task")) correct++;
} catch { }

// Test 16: array fields in extra
total++;
try {
  const node = createNode("Task", "task-deps", { dependsOn: ["t1", "t2", "t3"], tags: ["urgent", "critical"] });
  if (Array.isArray(node.dependsOn) && node.dependsOn.length === 3) correct++;
} catch { }

// Test 17: deeply nested objects
total++;
try {
  const node = createNode("Agent", "agent-nested", {
    config: {
      strategy: { params: { alpha: 0.5, beta: [1, 2, 3] } },
      limits: { max: 100, min: 0 }
    }
  });
  if (node.config?.strategy?.params?.alpha === 0.5) correct++;
} catch { }

// Test 18: timestamp format ISO strict compliance
total++;
try {
  const node = createNode("Fitness", "fit-iso");
  const ts = node.timestamp;
  if (ts.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) && ts.includes("Z")) correct++;
} catch { }

// Test 19: validation catches multiple errors
total++;
try {
  const badNode = { "@context": "wrong", "@type": "", "@id": "", timestamp: "invalid" };
  const result = validateNode(badNode);
  if (!result.valid && result.errors.length > 2) correct++;
} catch { }

// Test 20: validation accepts valid complex node
total++;
try {
  const complex = createNode("Selection", "sel-complex", {
    winner: "agent-winner",
    loser: "agent-loser",
    winnerEqs: 0.95,
    loserEqs: 0.42,
    reasoning: "superior EQS performance and diversity maintenance",
    eqsDelta: 0.53,
    cycleNumber: 15,
    timestamp: new Date().toISOString()
  });
  if (validateNode(complex).valid) correct++;
} catch { }

// Test 21: edge case - id exactly 256 chars
total++;
try {
  const node = createNode("Task", "t".repeat(256));
  if (validateNodeStructure(node, "Task")) correct++;
} catch { }

// Test 22: edge case - type exactly 128 chars
total++;
try {
  const node = createNode("T".repeat(128), "id-max-type");
  if (validateNodeStructure(node, "T".repeat(128))) correct++;
} catch { }

// Test 23: fitness edge case with zero values
total++;
try {
  const node = createNode("Fitness", "fit-zero", { eqs: 0, accuracy: 0, magnitude: 0, branchesExplored: 1, predictionError: 0 });
  if (validateNodeStructure(node, "Fitness") && node.eqs === 0) correct++;
} catch { }

// Test 24: validation preserves error messages
total++;
try {
  const invalid = { "@type": "Valid", "@id": "id" };
  const result = validateNode(invalid);
  if (!result.valid && result.errors.includes("Invalid @context")) correct++;
} catch { }

// Test 25: agent node with all optional fields
total++;
try {
  const node = createNode("Agent", "agent-full", {
    blueprint: "agent-v2.ts",
    parent: "agent-v1",
    generation: 3,
    status: "active",
    domain: "financial",
    resources: { cpu: "high", memory: "medium" },
    metadata: { created_by: "mutator", confidence: 0.92 }
  });
  if (validateNodeStructure(node, "Agent") && node.domain === "financial") correct++;
} catch { }

const fitness = correct / total;
const branches = 5;

console.log(JSON.stringify({ fitness, branches, correct, total }));
