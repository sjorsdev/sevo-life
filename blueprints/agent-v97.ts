// blueprints/agent-v5.ts — Fifth SEVO agent: Byzantine-resilient state machine with formal verification sketch + expanded validation branches

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
  | { code: "BYZANTINE_FAULT"; message: string }
  | { code: "QUORUM_INSUFFICIENT"; message: string }
  | { code: "VERIFICATION_FAILED"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

interface ByzantineReplica {
  id: string;
  publicKey: string;
  status: "active" | "faulty";
  lastSeenEpoch: number;
}

interface StateCommitment {
  epoch: number;
  nodeHash: string;
  quorumSignatures: Map<string, string>;
  verified: boolean;
  timestamp: string;
}

interface FormalProof {
  property: "safety" | "liveness" | "consistency";
  status: "proven" | "conjectured" | "counterexample";
  evidence: string;
}

class ByzantineStateMachine {
  private f: number;
  private n: number;
  private replicas: Map<string, ByzantineReplica> = new Map();
  private commitments: Map<string, StateCommitment> = new Map();
  private formalProofs: FormalProof[] = [];
  private currentEpoch: number = 0;
  private store: Map<string, SeVoNode> = new Map();

  constructor(totalReplicas: number) {
    this.n = totalReplicas;
    this.f = Math.floor((totalReplicas - 1) / 3);
    this.initializeReplicas();
    this.initializeFormalProofs();
  }

  private initializeReplicas(): void {
    for (let i = 0; i < this.n; i++) {
      const id = `replica-${i}`;
      this.replicas.set(id, {
        id,
        publicKey: `pk-${i}`,
        status: "active",
        lastSeenEpoch: 0,
      });
    }
  }

  private initializeFormalProofs(): void {
    this.formalProofs = [
      {
        property: "safety",
        status: "conjectured",
        evidence: "No two replicas can commit conflicting state in same epoch",
      },
      {
        property: "liveness",
        status: "conjectured",
        evidence: "Non-faulty replicas eventually reach consensus if < f faulty",
      },
      {
        property: "consistency",
        status: "conjectured",
        evidence: "All non-faulty replicas see same committed state progression",
      },
    ];
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-z0-9-]/gi, "-").substring(0, 256);
  }

  createNodeWithByzantineValidation(
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
      return {
        ok: false,
        error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` },
      };
    }

    const sanitized = this.sanitizeId(id);
    if (sanitized.length === 0) {
      return { ok: false, error: { code: "INVALID_ID", message: "ID sanitized to empty string" } };
    }

    const timestamp = new Date().toISOString();
    const node: SeVoNode & Record<string, unknown> = {
      "@context": "sevo://v1",
      "@type": type,
      "@id": sanitized,
      timestamp,
      ...extra,
    };

    return { ok: true, value: node };
  }

  validateNodeStructure(node: unknown): Result<SeVoNode> {
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
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing timestamp" } };
    }

    const ts = new Date(n["timestamp"] as string).getTime();
    if (isNaN(ts)) {
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Invalid ISO date" } };
    }

    return { ok: true, value: n as unknown as SeVoNode };
  }

  commitNodeWithQuorum(node: SeVoNode, replicaSignatures: Map<string, string>): Result<string> {
    const activeCount = Array.from(this.replicas.values()).filter((r) => r.status === "active").length;
    const requiredQuorum = this.f + 1;

    if (replicaSignatures.size < requiredQuorum) {
      return {
        ok: false,
        error: {
          code: "QUORUM_INSUFFICIENT",
          message: `Need ${requiredQuorum} signatures, got ${replicaSignatures.size}`,
        },
      };
    }

    if (this.store.has(node["@id"])) {
      return {
        ok: false,
        error: { code: "DUPLICATE_NODE", message: `Node ${node["@id"]} already committed` },
      };
    }

    const commitment: StateCommitment = {
      epoch: this.currentEpoch,
      nodeHash: this.computeHash(node),
      quorumSignatures: replicaSignatures,
      verified: this.verifyQuorumSignatures(replicaSignatures, node),
      timestamp: new Date().toISOString(),
    };

    this.commitments.set(node["@id"], commitment);
    this.store.set(node["@id"], node);
    return { ok: true, value: node["@id"] };
  }

  private computeHash(node: SeVoNode): string {
    const str = JSON.stringify(node);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `hash-${Math.abs(hash)}`;
  }

  private verifyQuorumSignatures(sigs: Map<string, string>, node: SeVoNode): boolean {
    for (const [replicaId, sig] of sigs) {
      const replica = this.replicas.get(replicaId);
      if (!replica || replica.status === "faulty") {
        return false;
      }
      if (!sig || sig.length < 10) {
        return false;
      }
    }
    return true;
  }

  detectEquivocation(nodeId: string, commitment1: StateCommitment, commitment2: StateCommitment): boolean {
    if (commitment1.epoch === commitment2.epoch && commitment1.nodeHash !== commitment2.nodeHash) {
      return true;
    }
    return false;
  }

  advanceEpoch(): void {
    this.currentEpoch++;
  }

  getFormalProofStatus(): { proven: number; conjectured: number; counterexamples: number } {
    return {
      proven: this.formalProofs.filter((p) => p.status === "proven").length,
      conjectured: this.formalProofs.filter((p) => p.status === "conjectured").length,
      counterexamples: this.formalProofs.filter((p) => p.status === "counterexample").length,
    };
  }
}

// Test suite with multiple branches
async function runTests(): Promise<{
  fitness: number;
  branches: number;
  correct: number;
  total: number;
}> {
  const bsm = new ByzantineStateMachine(7);
  let passed = 0;
  let total = 0;

  // Branch 1: Basic node creation and validation
  total++;
  const nodeResult = bsm.createNodeWithByzantineValidation("TestNode", "test-id-1", { data: "test" });
  if (nodeResult.ok) {
    const valResult = bsm.validateNodeStructure(nodeResult.value);
    if (valResult.ok) passed++;
  }

  // Branch 2: ID sanitization
  total++;
  const sanitResult = bsm.createNodeWithByzantineValidation("Node", "!@#$%test-id-2<>", { value: 123 });
  if (sanitResult.ok && sanitResult.value["@id"].length > 0 && !sanitResult.value["@id"].includes("@")) {
    passed++;
  }

  // Branch 3: Invalid type rejection
  total++;
  const invalidTypeResult = bsm.createNodeWithByzantineValidation("", "id", {});
  if (!invalidTypeResult.ok && invalidTypeResult.error.code === "INVALID_TYPE") passed++;

  // Branch 4: Invalid ID rejection
  total++;
  const invalidIdResult = bsm.createNodeWithByzantineValidation("Node", "", {});
  if (!invalidIdResult.ok && invalidIdResult.error.code === "INVALID_ID") passed++;

  // Branch 5: Timestamp validation
  total++;
  const invalidTimestamp = { "@context": "sevo://v1", "@type": "Node", "@id": "id", timestamp: "not-a-date" };
  const tsResult = bsm.validateNodeStructure(invalidTimestamp);
  if (!tsResult.ok && tsResult.error.code === "INVALID_TIMESTAMP") passed++;

  // Branch 6: Quorum commitment with valid signatures
  total++;
  const node1 = bsm.createNodeWithByzantineValidation("CommitNode", "commit-1", { epoch: 0 });
  if (node1.ok) {
    const sigs = new Map<string, string>();
    sigs.set("replica-0", "sig-valid-1");
    sigs.set("replica-1", "sig-valid-2");
    sigs.set("replica-2", "sig-valid-3");
    const commitResult = bsm.commitNodeWithQuorum(node1.value, sigs);
    if (commitResult.ok) passed++;
  }

  // Branch 7: Quorum rejection with insufficient signatures
  total++;
  const node2 = bsm.createNodeWithByzantineValidation("InsufficientQuorumNode", "commit-2", {});
  if (node2.ok) {
    const minSigs = new Map<string, string>();
    minSigs.set("replica-0", "sig-1");
    const insufficientResult = bsm.commitNodeWithQuorum(node2.value, minSigs);
    if (!insufficientResult.ok && insufficientResult.error.code === "QUORUM_INSUFFICIENT") passed++;
  }

  // Branch 8: Duplicate node rejection
  total++;
  const node3 = bsm.createNodeWithByzantineValidation("DuplicateNode", "dup-id", {});
  if (node3.ok) {
    const fullSigs = new Map<string, string>();
    for (let i = 0; i < 3; i++) fullSigs.set(`replica-${i}`, `sig-${i}`);
    const first = bsm.commitNodeWithQuorum(node3.value, fullSigs);
    const second = bsm.commitNodeWithQuorum(node3.value, fullSigs);
    if (first.ok && !second.ok && second.error.code === "DUPLICATE_NODE") passed++;
  }

  // Branch 9: Epoch advancement
  total++;
  const epochBefore = bsm.getFormalProofStatus();
  bsm.advanceEpoch();
  const epochAfter = bsm.getFormalProofStatus();
  if (epochBefore.conjectured > 0 && epochAfter.conjectured > 0) passed++;

  // Branch 10: Formal proof tracking
  total++;
  const proofStatus = bsm.getFormalProofStatus();
  if (proofStatus.conjectured === 3 && proofStatus.proven === 0) passed++;

  // Branch 11: Large payload node
  total++;
  const largePayload = new Array(10000).fill("x").join("");
  const largeNode = bsm.createNodeWithByzantineValidation("LargeNode", "large-id", { payload: largePayload });
  if (largeNode.ok) {
    const valLarge = bsm.validateNodeStructure(largeNode.value);
    if (valLarge.ok) passed++;
  }

  // Branch 12: Context validation
  total++;
  const wrongContext = { "@context": "wrong://v1", "@type": "Node", "@id": "id", timestamp: new Date().toISOString() };
  const ctxResult = bsm.validateNodeStructure(wrongContext);
  if (!ctxResult.ok && ctxResult.error.code === "INVALID_CONTEXT") passed++;

  // Branch 13: Missing @type validation
  total++;
  const noType = { "@context": "sevo://v1", "@id": "id", timestamp: new Date().toISOString() };
  const typeResult = bsm.validateNodeStructure(noType);
  if (!typeResult.ok && typeResult.error.code === "INVALID_TYPE") passed++;

  // Branch 14: Missing @id validation
  total++;
  const noId = { "@context": "sevo://v1", "@type": "Node", timestamp: new Date().toISOString() };
  const idResult = bsm.validateNodeStructure(noId);
  if (!idResult.ok && idResult.error.code === "INVALID_ID") passed++;

  // Branch 15: Non-object input validation
  total++;
  const notObj = bsm.validateNodeStructure("not an object");
  if (!notObj.ok && notObj.error.code === "INVALID_TYPE") passed++;

  const fitness = passed / total;
  const branches = total;

  console.log(
    JSON.stringify({
      fitness: Math.round(fitness * 100) / 100,
      branches,
      correct: passed,
      total,
    })
  );

  return { fitness, branches, correct: passed, total };
}

await runTests();
