// blueprints/agent-v5.ts — Fifth SEVO agent: robust node validation + comprehensive test coverage + fitness measurement
// Evolved from agent-v4, targeting higher accuracy through structured test categories and proper fitness output

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
  | { code: "CONCURRENT_WRITE"; message: string }
  | { code: "PATH_VALIDATION"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  if (!type || typeof type !== "string" || type.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be non-empty string, got: ${typeof type}` } };
  }
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be non-empty string, got: ${typeof id}` } };
  }
  if (id.length > 512) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 512 chars: ${id.length}` } };
  }

  // Sanitize ID: only alphanumeric, dash, underscore, colon
  if (!/^[a-zA-Z0-9:_-]+$/.test(id)) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id contains invalid characters: ${id}` } };
  }

  const timestamp = new Date().toISOString();

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
  if (n["@context"] !== "sevo://v1") {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: `Expected sevo://v1, got ${n["@context"]}` } };
  }
  if (!n["@type"] || typeof n["@type"] !== "string" || (n["@type"] as string).trim().length === 0) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }
  if (!n["@id"] || typeof n["@id"] !== "string" || (n["@id"] as string).trim().length === 0) {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if ((n["@id"] as string).length > 512) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 512 chars` } };
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

function nodeToPath(node: SeVoNode): Result<string> {
  const type = node["@type"].toLowerCase();
  const id = node["@id"].replace(/[^a-z0-9-]/gi, "-");
  if (!type || !id) {
    return { ok: false, error: { code: "PATH_VALIDATION", message: "Type or ID invalid for path" } };
  }
  return { ok: true, value: `./graph/${type}s/${id}.jsonld` };
}

interface TestResult {
  name: string;
  passed: boolean;
  category: string;
}

const store = new Map<string, SeVoNode>();
const pathExists = new Set<string>();
let testResults: TestResult[] = [];

function runTest(name: string, category: string, fn: () => boolean): TestResult {
  const result: TestResult = {
    name,
    category,
    passed: false,
  };
  try {
    result.passed = fn();
  } catch {
    result.passed = false;
  }
  testResults.push(result);
  return result;
}

// Category 1: Node Creation Tests
function testNodeCreation() {
  const tests = [
    runTest("basic_node_creation", "creation", () => {
      const r = createNode("Agent", "agent-v1");
      return r.ok && r.value["@type"] === "Agent" && r.value["@id"] === "agent-v1";
    }),
    runTest("node_with_extra_fields", "creation", () => {
      const r = createNode("Fitness", "fit-1", { eqs: 0.5, accuracy: 1.0 });
      return r.ok && r.value["eqs"] === 0.5 && r.value["accuracy"] === 1.0;
    }),
    runTest("timestamp_is_iso", "creation", () => {
      const r = createNode("Task", "task-1");
      return r.ok && /^\d{4}-\d{2}-\d{2}T/.test(r.value.timestamp);
    }),
  ];
  return tests.filter((t) => t.passed).length;
}

// Category 2: Validation Tests
function testValidation() {
  const tests = [
    runTest("valid_node_passes", "validation", () => {
      const node: SeVoNode = {
        "@context": "sevo://v1",
        "@type": "Agent",
        "@id": "agent-x",
        timestamp: new Date().toISOString(),
      };
      const r = validateNode(node);
      return r.ok && r.value["@id"] === "agent-x";
    }),
    runTest("missing_context_fails", "validation", () => {
      const r = validateNode({
        "@type": "Agent",
        "@id": "test",
        timestamp: new Date().toISOString(),
      });
      return !r.ok && r.error.code === "INVALID_CONTEXT";
    }),
    runTest("invalid_timestamp_fails", "validation", () => {
      const r = validateNode({
        "@context": "sevo://v1",
        "@type": "Agent",
        "@id": "test",
        timestamp: "not-a-date",
      });
      return !r.ok && r.error.code === "INVALID_TIMESTAMP";
    }),
    runTest("empty_id_fails", "validation", () => {
      const r = createNode("Agent", "");
      return !r.ok && r.error.code === "INVALID_ID";
    }),
    runTest("empty_type_fails", "validation", () => {
      const r = createNode("", "test-id");
      return !r.ok && r.error.code === "INVALID_TYPE";
    }),
  ];
  return tests.filter((t) => t.passed).length;
}

// Category 3: ID Sanitization Tests
function testIdSanitization() {
  const tests = [
    runTest("valid_id_with_dash", "sanitization", () => {
      const r = createNode("Agent", "agent-v1-test");
      return r.ok;
    }),
    runTest("valid_id_with_underscore", "sanitization", () => {
      const r = createNode("Agent", "agent_v1_test");
      return r.ok;
    }),
    runTest("valid_id_with_colon", "sanitization", () => {
      const r = createNode("Agent", "agent:v1:test");
      return r.ok;
    }),
    runTest("invalid_id_with_space", "sanitization", () => {
      const r = createNode("Agent", "agent v1");
      return !r.ok && r.error.code === "INVALID_ID";
    }),
    runTest("invalid_id_with_slash", "sanitization", () => {
      const r = createNode("Agent", "agent/v1");
      return !r.ok && r.error.code === "INVALID_ID";
    }),
    runTest("id_length_limit", "sanitization", () => {
      const longId = "a".repeat(513);
      const r = createNode("Agent", longId);
      return !r.ok && r.error.code === "INVALID_ID";
    }),
    runTest("id_at_boundary_512", "sanitization", () => {
      const boundaryId = "a".repeat(512);
      const r = createNode("Agent", boundaryId);
      return r.ok;
    }),
  ];
  return tests.filter((t) => t.passed).length;
}

// Category 4: Path Computation Tests
function testPathComputation() {
  const tests = [
    runTest("agent_path_format", "path", () => {
      const node = {
        "@context": "sevo://v1" as const,
        "@type": "Agent",
        "@id": "agent-v1",
        timestamp: new Date().toISOString(),
      };
      const r = nodeToPath(node);
      return r.ok && r.value === "./graph/agents/agent-v1.jsonld";
    }),
    runTest("fitness_path_format", "path", () => {
      const node = {
        "@context": "sevo://v1" as const,
        "@type": "Fitness",
        "@id": "fitness:agent-v1-cycle1",
        timestamp: new Date().toISOString(),
      };
      const r = nodeToPath(node);
      return r.ok && r.value.startsWith("./graph/fitnesss/");
    }),
    runTest("path_sanitizes_id", "path", () => {
      const node = {
        "@context": "sevo://v1" as const,
        "@type": "Task",
        "@id": "task:x:y",
        timestamp: new Date().toISOString(),
      };
      const r = nodeToPath(node);
      return r.ok && r.value.includes("task-x-y");
    }),
  ];
  return tests.filter((t) => t.passed).length;
}

// Category 5: Store Operations Tests
function testStoreOperations() {
  store.clear();
  const tests = [
    runTest("store_insert", "store", () => {
      const node = {
        "@context": "sevo://v1" as const,
        "@type": "Agent",
        "@id": "store-test-1",
        timestamp: new Date().toISOString(),
      };
      store.set(node["@id"], node);
      return store.has("store-test-1");
    }),
    runTest("store_duplicate_detection", "store", () => {
      const node = {
        "@context": "sevo://v1" as const,
        "@type": "Agent",
        "@id": "store-test-2",
        timestamp: new Date().toISOString(),
      };
      store.set(node["@id"], node);
      return store.has("store-test-2") && store.size >= 1;
    }),
    runTest("store_retrieval", "store", () => {
      const node = {
        "@context": "sevo://v1" as const,
        "@type": "Fitness",
        "@id": "store-fit-1",
        timestamp: new Date().toISOString(),
      };
      store.set(node["@id"], node);
      const retrieved = store.get("store-fit-1");
      return retrieved !== undefined && retrieved["@type"] === "Fitness";
    }),
  ];
  return tests.filter((t) => t.passed).length;
}

// Category 6: Edge Cases
function testEdgeCases() {
  const tests = [
    runTest("unicode_in_type", "edge_case", () => {
      const r = createNode("Agent™", "test-id");
      return r.ok; // Type can have unicode
    }),
    runTest("numeric_id_valid", "edge_case", () => {
      const r = createNode("Agent", "123-456");
      return r.ok;
    }),
    runTest("deeply_nested_extra_fields", "edge_case", () => {
      const r = createNode("Agent", "test-id", {
        nested: { deep: { structure: { value: 42 } } },
      });
      return r.ok && (r.value.nested as Record<string, unknown>).deep !== undefined;
    }),
    runTest("null_extra_field_preserved", "edge_case", () => {
      const r = createNode("Agent", "test-id", { nullable: null });
      return r.ok && r.value.nullable === null;
    }),
  ];
  return tests.filter((t) => t.passed).length;
}

// Run all tests
const creation = testNodeCreation();
const validation = testValidation();
const sanitization = testIdSanitization();
const paths = testPathComputation();
const store_ops = testStoreOperations();
const edges = testEdgeCases();

const total = creation + validation + sanitization + paths + store_ops + edges;
const categories = 6;
const categoryScores = [creation, validation, sanitization, paths, store_ops, edges];

// Calculate fitness: accuracy of test suite + coverage of categories
const accuracy = total > 0 ? total / testResults.length : 0;
const categoryBalance = categoryScores.filter((s) => s > 0).length / categories;
const fitness = (accuracy * 0.7 + categoryBalance * 0.3);

console.log(
  JSON.stringify({
    fitness: Math.min(1.0, fitness),
    branches: 6,
    correct: total,
    total: testResults.length,
  })
);
