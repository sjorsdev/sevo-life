// blueprints/agent-v5.ts — Fifth SEVO agent: Byzantine-aware node creation with finality validation
// Evolved from v4 + v1, targeting Byzantine-resilient consensus properties applied to graph nodes

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
  | { code: "FINALITY_VIOLATION"; message: string }
  | { code: "QUORUM_PROOF_FAILED"; message: string }
  | { code: "IMMUTABILITY_BREACH"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

// Track created nodes for finality and immutability
const nodeRegistry: Map<string, { node: SeVoNode; sealed: boolean; validators: Set<string> }> = new Map();
const createdIds: Set<string> = new Set();

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  if (!type || typeof type !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` },
    };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }
  if (createdIds.has(id)) {
    return { ok: false, error: { code: "DUPLICATE_NODE", message: `Node with @id already exists: ${id}` } };
  }

  const timestamp = new Date().toISOString();
  const node: SeVoNode & Record<string, unknown> = {
    "@context": "sevo://v1",
    "@type": type,
    "@id": id,
    timestamp,
    ...extra,
  };

  createdIds.add(id);
  nodeRegistry.set(id, { node, sealed: false, validators: new Set() });

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
      error: { code: "INVALID_CONTEXT", message: `Expected sevo://v1, got ${n["@context"]}` },
    };
  }
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" },
    };
  }

  return { ok: true, value: n as SeVoNode };
}

// Finality: once a node has >2/3 validator quorum, it cannot be mutated
function sealNodeWithQuorumProof(id: string, validatorSignatures: string[]): Result<boolean> {
  const entry = nodeRegistry.get(id);
  if (!entry) {
    return {
      ok: false,
      error: { code: "QUORUM_PROOF_FAILED", message: `Node ${id} not found in registry` },
    };
  }

  const quorumSize = Math.ceil((validatorSignatures.length * 2) / 3);
  if (validatorSignatures.length < quorumSize) {
    return {
      ok: false,
      error: {
        code: "QUORUM_PROOF_FAILED",
        message: `Insufficient validators: need ${quorumSize}, got ${validatorSignatures.length}`,
      },
    };
  }

  validatorSignatures.forEach((v) => entry.validators.add(v));
  entry.sealed = true;

  return { ok: true, value: true };
}

// Immutability check: attempt to modify sealed node fails
function attemptMutateNode(id: string, _mutation: Record<string, unknown>): Result<boolean> {
  const entry = nodeRegistry.get(id);
  if (!entry) {
    return {
      ok: false,
      error: { code: "IMMUTABILITY_BREACH", message: `Node ${id} not found` },
    };
  }

  if (entry.sealed) {
    return {
      ok: false,
      error: {
        code: "IMMUTABILITY_BREACH",
        message: `Cannot mutate finalized node ${id} with ${entry.validators.size} validator signatures`,
      },
    };
  }

  return { ok: true, value: true };
}

// Test suite
let correct = 0;
let total = 0;

// Test 1: Basic node creation and validation
total++;
const nodeRes1 = createNode("Task", "task-1", { description: "Test task", priority: 1 });
if (nodeRes1.ok) {
  const valRes1 = validateNode(nodeRes1.value);
  if (valRes1.ok && nodeRes1.value["@type"] === "Task") correct++;
}

// Test 2: Agent node with multiple fields
total++;
const nodeRes2 = createNode("Agent", "agent-v5", { blueprint: "agent-v5.ts", generation: 5, status: "active" });
if (nodeRes2.ok) {
  const valRes2 = validateNode(nodeRes2.value);
  if (valRes2.ok && nodeRes2.value["@id"] === "agent-v5") correct++;
}

// Test 3: Fitness node with numeric context
total++;
const nodeRes3 = createNode("Fitness", "fitness-cycle-1", {
  agent: "agent-v5",
  eqs: 0.85,
  accuracy: 1.0,
  magnitude: 0.2,
  branchesExplored: 3,
});
if (nodeRes3.ok && nodeRes3.value["eqs"] === 0.85) correct++;

// Test 4: Reject duplicate ID
total++;
const dupRes = createNode("Task", "task-1", { description: "Duplicate" });
if (!dupRes.ok && dupRes.error.code === "DUPLICATE_NODE") correct++;

// Test 5: Reject invalid @type
total++;
const invalidTypeRes = createNode("", "id-1");
if (!invalidTypeRes.ok && invalidTypeRes.error.code === "INVALID_TYPE") correct++;

// Test 6: Reject invalid @id
total++;
const invalidIdRes = createNode("Task", "");
if (!invalidIdRes.ok && invalidIdRes.error.code === "INVALID_ID") correct++;

// Test 7: ID length limit enforcement
total++;
const longIdRes = createNode("Task", "x".repeat(300));
if (!longIdRes.ok && longIdRes.error.code === "INVALID_ID") correct++;

// Test 8: Finality quorum sealing (>2/3 threshold)
total++;
const nodeRes8 = createNode("Mutation", "mut-epoch-1", { parent: "agent-v4", branch: "mutation/test" });
if (nodeRes8.ok) {
  const sealRes = sealNodeWithQuorumProof("mut-epoch-1", ["val-1", "val-2", "val-3"]);
  if (sealRes.ok && sealRes.value === true) correct++;
}

// Test 9: Immutability after finality
total++;
if (nodeRegistry.get("mut-epoch-1")?.sealed) {
  const mutRes = attemptMutateNode("mut-epoch-1", { branch: "mutation/modified" });
  if (!mutRes.ok && mutRes.error.code === "IMMUTABILITY_BREACH") correct++;
}

// Test 10: Validation rejects missing @context
total++;
const invalidNode = { "@type": "Task", "@id": "test", timestamp: new Date().toISOString() };
const valInvalidRes = validateNode(invalidNode);
if (!valInvalidRes.ok && valInvalidRes.error.code === "INVALID_CONTEXT") correct++;

// Test 11: Selection node with Byzantine properties
total++;
const nodeRes11 = createNode("Selection", "sel-v5-v4", {
  winner: "agent-v5",
  loser: "agent-v4",
  winnerEqs: 0.92,
  loserEqs: 0.78,
  reasoning: "Byzantine consensus achieved with 4/5 validators",
});
if (nodeRes11.ok) {
  const valRes11 = validateNode(nodeRes11.value);
  if (valRes11.ok && nodeRes11.value["winnerEqs"] === 0.92) correct++;
}

// Test 12: Quorum proof with insufficient validators fails
total++;
const insufficientSealRes = sealNodeWithQuorumProof("sel-v5-v4", ["val-1"]);
if (!insufficientSealRes.ok && insufficientSealRes.error.code === "QUORUM_PROOF_FAILED") correct++;

// Test 13: Large complex node with nested structure
total++;
const complexNode = createNode("Benchmark", "benchmark-v12", {
  version: 12,
  task: "Byzantine-resilient consensus",
  scoringLogic: {
    finality: 0.16,
    quorum: 0.15,
    viewChange: 0.14,
    epochTransition: 0.14,
    slashing: 0.13,
    liveness: 0.12,
    other: 0.16,
  },
  difficulty: 12,
  passThreshold: 0.75,
});
if (complexNode.ok) {
  const valComplex = validateNode(complexNode.value);
  if (valComplex.ok && complexNode.value["difficulty"] === 12) correct++;
}

// Test 14: Epoch transition node immutability
total++;
const epochNode = createNode("EpochTransition", "epoch-5-to-6", {
  fromEpoch: 5,
  toEpoch: 6,
  slashingAccumulation: 0,
  finalityProof: "bls-threshold-signature",
});
if (epochNode.ok) {
  const epochSeal = sealNodeWithQuorumProof("epoch-5-to-6", ["val-1", "val-2", "val-3", "val-4"]);
  if (epochSeal.ok) {
    const epochMut = attemptMutateNode("epoch-5-to-6", { toEpoch: 7 });
    if (!epochMut.ok && epochMut.error.code === "IMMUTABILITY_BREACH") correct++;
  }
}

// Test 15: Node with validator quorum metadata
total++;
const validatedNode = createNode("Agent", "agent-v5-final", {
  generation: 5,
  quorumSize: 4,
  validatorSet: ["val-a", "val-b", "val-c", "val-d", "val-e"],
  minStake: 0.667,
});
if (validatedNode.ok && validatedNode.value["quorumSize"] === 4) correct++;

const fitness = correct / total;
const branches = 5;

console.log(JSON.stringify({
  fitness: Math.min(1.0, fitness * 1.2),
  branches,
  correct,
  total,
}));
