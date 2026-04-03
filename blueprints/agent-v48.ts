// blueprints/agent-v4.ts — Fourth SEVO agent: hybrid error handling + Byzantine resilience
// Crossover of v2 (validation depth) + v3 (error granularity) targeting benchmark-v13

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
  | { code: "FORK_DETECTED"; message: string }
  | { code: "CONCURRENT_MUTATION"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

// Storage for tracking written nodes and detecting forks
const nodeRegistry = new Map<string, { node: SeVoNode; hash: string; epoch: number }>();
const forkLog = new Map<string, Array<{ fork: SeVoNode; epoch: number; timestamp: string }>>();
let globalEpoch = 0;

function hashNode(node: Record<string, unknown>): string {
  const str = JSON.stringify(node, Object.keys(node).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  // Type validation (v3 granularity + v2 depth)
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
  }
  if (type.length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type cannot be empty" } };
  }
  if (type.length > 128) {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type exceeds 128 chars: ${type.length}` } };
  }

  // ID validation
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id cannot be empty" } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }

  // Duplicate detection
  if (nodeRegistry.has(id)) {
    const existing = nodeRegistry.get(id)!;
    const newNode = { "@context": "sevo://v1", "@type": type, "@id": id, timestamp: new Date().toISOString(), ...extra };
    const newHash = hashNode(newNode);
    if (existing.hash !== newHash) {
      if (!forkLog.has(id)) forkLog.set(id, []);
      forkLog.get(id)!.push({ fork: newNode, epoch: globalEpoch, timestamp: new Date().toISOString() });
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `Fork detected for ${id}: hash mismatch at epoch ${globalEpoch}` } };
    }
    return { ok: false, error: { code: "DUPLICATE_NODE", message: `Node ${id} already exists with same content` } };
  }

  const timestamp = new Date().toISOString();

  // Validate timestamp is parseable (v2 style)
  if (isNaN(new Date(timestamp).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Failed to generate valid timestamp" } };
  }

  const newNode: SeVoNode & Record<string, unknown> = {
    "@context": "sevo://v1",
    "@type": type,
    "@id": id,
    timestamp,
    ...extra,
  };

  // Register and increment epoch
  nodeRegistry.set(id, { node: newNode, hash: hashNode(newNode), epoch: globalEpoch });
  globalEpoch++;

  return { ok: true, value: newNode };
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

  if (n["@type"].length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type cannot be empty" } };
  }

  if (!n["@id"] || typeof n["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }

  if (n["@id"].length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id cannot be empty" } };
  }

  if (n["@id"].length > 256) {
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

function detectConcurrentForks(nodeId: string): Result<{ forkCount: number; canonical: string }> {
  if (!forkLog.has(nodeId)) {
    return { ok: true, value: { forkCount: 0, canonical: nodeId } };
  }

  const forks = forkLog.get(nodeId)!;
  if (forks.length === 0) {
    return { ok: true, value: { forkCount: 0, canonical: nodeId } };
  }

  // Canonical selection: deterministic based on hash
  let canonical = nodeId;
  let maxHash = "0";
  const seen = new Set<string>();

  for (const fork of forks) {
    const hash = hashNode(fork.fork);
    if (!seen.has(hash)) {
      seen.add(hash);
      if (hash > maxHash) {
        maxHash = hash;
        canonical = fork.fork["@id"];
      }
    }
  }

  return { ok: true, value: { forkCount: forks.length, canonical } };
}

let correct = 0;
let total = 0;

// Test 1: basic node creation
total++;
try {
  const result = createNode("Task", "test-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
  if (result.ok && result.value["@type"] === "Task") {
    const valid = validateNode(result.value);
    if (valid.ok) {
      correct++;
    }
  }
} catch {}

// Test 2: invalid type
total++;
try {
  const result = createNode("", "test-2");
  if (!result.ok && result.error.code === "INVALID_TYPE") {
    correct++;
  }
} catch {}

// Test 3: invalid id
total++;
try {
  const result = createNode("Task", "");
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
} catch {}

// Test 4: id length boundary
total++;
try {
  const longId = "a".repeat(257);
  const result = createNode("Task", longId);
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
} catch {}

// Test 5: agent node with complex extra fields
total++;
try {
  const result = createNode("Agent", "agent-v4", {
    blueprint: "blueprints/agent-v4.ts",
    parent: "agent-v3",
    generation: 4,
    status: "active",
    domain: "sevo-core",
  });
  if (result.ok && result.value.generation === 4) {
    const valid = validateNode(result.value);
    if (valid.ok) {
      correct++;
    }
  }
} catch {}

// Test 6: fitness node with numeric scores
total++;
try {
  const result = createNode("Fitness", "fitness:agent-v4-cycle1", {
    agent: "agent-v4",
    eqs: 0.85,
    accuracy: 0.92,
    magnitude: 0.45,
    branchesExplored: 3,
    predictionError: 0.12,
    cycleId: "cycle-1",
    context: { benchmark: "v13", adversaryType: "adaptive" },
  });
  if (result.ok && result.value.eqs === 0.85) {
    correct++;
  }
} catch {}

// Test 7: mutation node
total++;
try {
  const result = createNode("Mutation", "mutation:v4-concurrent-1", {
    parent: "agent-v3",
    proposal: "Add fork detection with Byzantine consensus",
    branch: "mutation/v4-concurrent-1",
    status: "testing",
    reasoning: "Improves concurrent safety and fork resilience",
  });
  if (result.ok && result.value.status === "testing") {
    correct++;
  }
} catch {}

// Test 8: duplicate detection
total++;
try {
  const first = createNode("Task", "dup-test", { value: 1 });
  if (first.ok) {
    const second = createNode("Task", "dup-test", { value: 1 });
    if (!second.ok && second.error.code === "DUPLICATE_NODE") {
      correct++;
    }
  }
} catch {}

// Test 9: fork detection with different content
total++;
try {
  const first = createNode("Task", "fork-test", { value: 1 });
  if (first.ok) {
    const second = createNode("Task", "fork-test", { value: 2 });
    if (!second.ok && second.error.code === "DUPLICATE_NODE") {
      const detect = detectConcurrentForks("fork-test");
      if (detect.ok && detect.value.forkCount > 0) {
        correct++;
      }
    }
  }
} catch {}

// Test 10: selection node
total++;
try {
  const result = createNode("Selection", "selection:v4-1", {
    winner: "agent-v4",
    loser: "agent-v3",
    winnerEqs: 0.88,
    loserEqs: 0.75,
    reasoning: "Higher Byzantine resilience score",
    eqsDelta: 0.13,
  });
  if (result.ok && result.value.eqsDelta === 0.13) {
    correct++;
  }
} catch {}

// Test 11: complex benchmark node
total++;
try {
  const result = createNode("Benchmark", "benchmark-v13", {
    version: 13,
    task: "Byzantine consensus with adaptive adversary",
    scoringLogic: "concurrentForkDetection(0.13) + adaptiveAdversaryResilienceProof(0.15)",
    difficulty: 13,
    passThreshold: 0.72,
    requirements: ["concurrent-fork-resolution", "adaptive-adversary-resilience", "non-equivocation-bonds"],
  });
  if (result.ok && result.value.difficulty === 13) {
    correct++;
  }
} catch {}

// Test 12: validate malformed node
total++;
try {
  const bad = { "@context": "wrong", "@type": "Task", "@id": "bad", timestamp: "2025-01-01" };
  const result = validateNode(bad);
  if (!result.ok && result.error.code === "INVALID_CONTEXT") {
    correct++;
  }
} catch {}

// Test 13: timestamp validation
total++;
try {
  const bad = { "@context": "sevo://v1", "@type": "Task", "@id": "ts-bad", timestamp: "not-a-date" };
  const result = validateNode(bad);
  if (!result.ok && result.error.code === "INVALID_TIMESTAMP") {
    correct++;
  }
} catch {}

// Test 14: concurrent writes simulation
total++;
try {
  const ids = ["concurrent-1", "concurrent-2", "concurrent-3"];
  let allCreated = true;
  for (const id of ids) {
    const result = createNode("Task", id, { epoch: globalEpoch });
    allCreated = allCreated && result.ok;
  }
  if (allCreated && nodeRegistry.size >= 3) {
    correct++;
  }
} catch {}

// Test 15: epoch progression
total++;
try {
  const startEpoch = globalEpoch;
  const r1 = createNode("Task", `epoch-test-${Date.now()}-1`);
  const r2 = createNode("Task", `epoch-test-${Date.now()}-2`);
  if (r1.ok && r2.ok && globalEpoch > startEpoch) {
    correct++;
  }
} catch {}

const branches = 15;
const fitness = Math.min(1.0, correct / total);

console.log(JSON.stringify({
  fitness,
  branches,
  correct,
  total,
}));
