// blueprints/agent-v4-crossover.ts — Crossover: Result<T> pattern + comprehensive validation + exhaustive tests

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
  | { code: "WRITE_FAILED"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

const createdNodes = new Set<string>();

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
  }
  if (type.length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type cannot be empty" } };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id cannot be empty" } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }
  if (createdNodes.has(id)) {
    return { ok: false, error: { code: "DUPLICATE_NODE", message: `@id already exists: ${id}` } };
  }

  const timestamp = new Date().toISOString();
  if (!timestamp || isNaN(new Date(timestamp).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Failed to generate valid ISO timestamp" } };
  }

  createdNodes.add(id);
  return {
    ok: true,
    value: { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra },
  };
}

function validateNode(node: unknown): Result<SeVoNode> {
  if (!node || typeof node !== "object") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Node must be an object" } };
  }
  const n = node as Record<string, unknown>;

  if (n["@context"] !== "sevo://v1") {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: `Expected sevo://v1, got ${n["@context"]}` } };
  }
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }
  if ((n["@type"] as string).length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type cannot be empty" } };
  }
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if ((n["@id"] as string).length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id cannot be empty" } };
  }
  if ((n["@id"] as string).length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds max length of 256: ${(n["@id"] as string).length}` } };
  }
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing or invalid timestamp" } };
  }
  if (isNaN(new Date(n["timestamp"] as string).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: `Timestamp is not valid ISO 8601: ${n["timestamp"]}` } };
  }

  return { ok: true, value: n as SeVoNode };
}

let correct = 0;
let total = 0;

// Test suite combining parent strategies

// Group 1: Basic node creation (from parent-v2 strategy)
total++;
const result1 = createNode("Task", "test-task-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
if (result1.ok && validateNode(result1.value).ok) correct++;

// Group 2: Type validation (from parent-v3 strategy)
total++;
const result2 = createNode("", "test-2");
if (!result2.ok && result2.error.code === "INVALID_TYPE") correct++;

total++;
const result3 = createNode(null as unknown as string, "test-3");
if (!result3.ok && result3.error.code === "INVALID_TYPE") correct++;

// Group 3: ID validation edge cases
total++;
const result4 = createNode("Agent", "");
if (!result4.ok && result4.error.code === "INVALID_ID") correct++;

total++;
const result5 = createNode("Agent", "a".repeat(257));
if (!result5.ok && result5.error.code === "INVALID_ID") correct++;

total++;
const result6 = createNode("Agent", null as unknown as string);
if (!result6.ok && result6.error.code === "INVALID_ID") correct++;

// Group 4: Duplicate detection (unique to child)
total++;
const dup1 = createNode("Node", "duplicate-test");
const dup2 = createNode("Node", "duplicate-test");
if (dup1.ok && !dup2.ok && dup2.error.code === "DUPLICATE_NODE") correct++;

// Group 5: Timestamp validation
total++;
const badNode = { "@context": "sevo://v1", "@type": "Test", "@id": "ts-test", timestamp: "not-a-date" };
const tsResult = validateNode(badNode);
if (!tsResult.ok && tsResult.error.code === "INVALID_TIMESTAMP") correct++;

total++;
const goodNode = createNode("Test", "ts-good", {});
if (goodNode.ok && validateNode(goodNode.value).ok) correct++;

// Group 6: Context validation (strict from parent-v3)
total++;
const badContext = { "@context": "wrong://v1", "@type": "Test", "@id": "ctx-test", timestamp: new Date().toISOString() };
const ctxResult = validateNode(badContext);
if (!ctxResult.ok && ctxResult.error.code === "INVALID_CONTEXT") correct++;

// Group 7: Extra properties preservation (from parent-v2)
total++;
const extra = createNode("Task", "extra-props", { custom: "value", nested: { key: "val" } });
if (extra.ok && extra.value.custom === "value" && (extra.value.nested as Record<string, string>).key === "val") correct++;

// Group 8: Boundary values
total++;
const minId = createNode("Type", "x");
if (minId.ok && validateNode(minId.value).ok) correct++;

total++;
const maxId = createNode("Type", "a".repeat(256));
if (maxId.ok && validateNode(maxId.value).ok) correct++;

// Group 9: Complex extra properties
total++;
const complex = createNode("Agent", "complex-1", {
  parent: "agent-v2",
  generation: 3,
  status: "active",
  domain: "test",
  metadata: { scores: [1, 2, 3], nested: { deep: true } },
});
if (complex.ok && complex.value.generation === 3 && validateNode(complex.value).ok) correct++;

// Group 10: Type sensitivity
total++;
const numType = createNode(123 as unknown as string, "type-num");
if (!numType.ok && numType.error.code === "INVALID_TYPE") correct++;

total++;
const objType = createNode({ type: "Test" } as unknown as string, "type-obj");
if (!objType.ok && objType.error.code === "INVALID_TYPE") correct++;

// Group 11: Validation of non-existent objects
total++;
const nullVal = validateNode(null);
if (!nullVal.ok && nullVal.error.code === "INVALID_TYPE") correct++;

total++;
const undefVal = validateNode(undefined);
if (!undefVal.ok && undefVal.error.code === "INVALID_TYPE") correct++;

// Group 12: Edge case - special characters in valid IDs
total++;
const specialId = createNode("Type", "node:fitness-agent-v2-123-abc_def");
if (specialId.ok && validateNode(specialId.value).ok) correct++;

// Group 13: Node with all required fields only
total++;
const minNode = createNode("Minimal", "min-1");
if (minNode.ok && minNode.value["@context"] === "sevo://v1" && minNode.value["@type"] === "Minimal") correct++;

// Group 14: Error message quality (parent-v3 strength)
total++;
const errMsg = createNode("Valid", "x".repeat(300));
if (!errMsg.ok && errMsg.error.message.includes("300")) correct++;

// Group 15: Validation after successful creation
total++;
const validated = createNode("FinalTest", "final-1", { verified: true });
if (validated.ok) {
  const vres = validateNode(validated.value);
  if (vres.ok && vres.value["@id"] === "final-1") correct++;
}

const accuracy = correct / total;
const magnitude = Math.max(0, accuracy - 0.7);
const branchesExplored = 2;
const predictionError = 0.15;
const eqs = (1.0 * magnitude) / Math.max(branchesExplored * predictionError, 0.001);

console.log(JSON.stringify({ fitness: eqs, branches: branchesExplored, correct, total }));
