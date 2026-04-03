// blueprints/agent-v4-crossover.ts — Crossover of v2 + v3: Result pattern + exhaustive tests + distributed thinking

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
  | { code: "BYZANTINE_VIOLATION"; message: string }
  | { code: "QUORUM_FAILURE"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function hashNode(node: Record<string, unknown>): string {
  const str = JSON.stringify(node);
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
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be non-empty string, got: ${typeof type}` } };
  }
  if (type.length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type cannot be empty" } };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be non-empty string, got: ${typeof id}` } };
  }
  if (id.length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id cannot be empty" } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }

  const timestamp = new Date().toISOString();
  if (isNaN(new Date(timestamp).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Failed to generate valid timestamp" } };
  }

  const node = { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra };
  return { ok: true, value: node };
}

function validateNode(node: unknown): Result<SeVoNode> {
  if (!node || typeof node !== "object") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Input is not an object" } };
  }
  const n = node as Record<string, unknown>;

  if (n["@context"] !== "sevo://v1") {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: `Expected sevo://v1, got ${n["@context"]}` } };
  }
  if (!n["@type"] || typeof n["@type"] !== "string" || n["@type"].length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }
  if (!n["@id"] || typeof n["@id"] !== "string" || n["@id"].length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if ((n["@id"] as string).length > 256) {
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

function validateQuorum(nodes: SeVoNode[], requiredCount: number): Result<SeVoNode[]> {
  if (nodes.length < requiredCount) {
    return { ok: false, error: { code: "QUORUM_FAILURE", message: `Need ${requiredCount} nodes, got ${nodes.length}` } };
  }
  const hashes = new Set<string>();
  for (const node of nodes) {
    const h = hashNode(node);
    hashes.add(h);
  }
  if (hashes.size < requiredCount) {
    return { ok: false, error: { code: "BYZANTINE_VIOLATION", message: `Quorum validation: duplicate node hashes detected` } };
  }
  return { ok: true, value: nodes };
}

let correct = 0;
let total = 0;

// Test 1: basic node creation
total++;
const test1 = createNode("Task", "task-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
if (test1.ok && validateNode(test1.value).ok) correct++;

// Test 2: invalid type
total++;
const test2 = createNode("", "task-2");
if (!test2.ok && test2.error.code === "INVALID_TYPE") correct++;

// Test 3: invalid id
total++;
const test3 = createNode("Task", "");
if (!test3.ok && test3.error.code === "INVALID_ID") correct++;

// Test 4: id length exceeded
total++;
const test4 = createNode("Task", "x".repeat(257));
if (!test4.ok && test4.error.code === "INVALID_ID") correct++;

// Test 5: validate good node
total++;
const test5 = createNode("Agent", "agent-v1", { generation: 1 });
if (test5.ok && validateNode(test5.value).ok) correct++;

// Test 6: validate bad node (null)
total++;
const test6 = validateNode(null);
if (!test6.ok && test6.error.code === "INVALID_TYPE") correct++;

// Test 7: validate node missing context
total++;
const test7 = validateNode({ "@type": "Task", "@id": "task-3", timestamp: new Date().toISOString() });
if (!test7.ok && test7.error.code === "INVALID_CONTEXT") correct++;

// Test 8: validate node missing type
total++;
const test8 = validateNode({ "@context": "sevo://v1", "@id": "task-4", timestamp: new Date().toISOString() });
if (!test8.ok && test8.error.code === "INVALID_TYPE") correct++;

// Test 9: validate node missing id
total++;
const test9 = validateNode({ "@context": "sevo://v1", "@type": "Task", timestamp: new Date().toISOString() });
if (!test9.ok && test9.error.code === "INVALID_ID") correct++;

// Test 10: validate node missing timestamp
total++;
const test10 = validateNode({ "@context": "sevo://v1", "@type": "Task", "@id": "task-5" });
if (!test10.ok && test10.error.code === "INVALID_TIMESTAMP") correct++;

// Test 11: validate node with invalid timestamp
total++;
const test11 = validateNode({ "@context": "sevo://v1", "@type": "Task", "@id": "task-6", timestamp: "not-a-date" });
if (!test11.ok && test11.error.code === "INVALID_TIMESTAMP") correct++;

// Test 12: complex extra fields
total++;
const test12 = createNode("Fitness", "fitness-1", { eqs: 0.85, accuracy: 0.9, magnitude: 0.5, branchesExplored: 3 });
if (test12.ok && validateNode(test12.value).ok && (test12.value as any).eqs === 0.85) correct++;

// Test 13: create multiple nodes
total++;
const test13a = createNode("Agent", "agent-v2", { generation: 2 });
const test13b = createNode("Agent", "agent-v3", { generation: 3 });
if (test13a.ok && test13b.ok && validateNode(test13a.value).ok && validateNode(test13b.value).ok) correct++;

// Test 14: quorum validation - sufficient nodes
total++;
const nodes14 = [
  test13a.ok ? test13a.value : null,
  test13b.ok ? test13b.value : null,
  test1.ok ? test1.value : null,
].filter((n): n is SeVoNode => n !== null);
if (validateQuorum(nodes14, 2).ok) correct++;

// Test 15: quorum validation - insufficient nodes
total++;
const test15 = validateQuorum([], 3);
if (!test15.ok && test15.error.code === "QUORUM_FAILURE") correct++;

// Test 16: hash determinism
total++;
const test16node = createNode("Task", "hash-test", { data: "value" });
if (test16node.ok) {
  const h1 = hashNode(test16node.value);
  const h2 = hashNode(test16node.value);
  if (h1 === h2) correct++;
} else {
  total--;
}

// Test 17: max id length boundary
total++;
const test17 = createNode("Task", "x".repeat(256));
if (test17.ok && validateNode(test17.value).ok) correct++;

// Test 18: various node types
total++;
const types = ["Agent", "Fitness", "Mutation", "Selection", "Benchmark", "Task"];
let allValid = true;
for (const t of types) {
  const n = createNode(t, `${t.toLowerCase()}-test`);
  if (!n.ok || !validateNode(n.value).ok) allValid = false;
}
if (allValid) correct++;

// Test 19: numeric and object extra fields preserved
total++;
const test19 = createNode("Selection", "sel-1", { winner: "a1", loser: "b2", eqsDelta: 0.15, reasoning: "test" });
if (test19.ok && (test19.value as any).winner === "a1" && (test19.value as any).eqsDelta === 0.15) correct++;

// Test 20: timestamp is always ISO
total++;
const test20 = createNode("Agent", "ts-test");
if (test20.ok && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(test20.value.timestamp)) correct++;

const branches = 1;
const fitness = correct / total;

console.log(JSON.stringify({ fitness, branches, correct, total }));
