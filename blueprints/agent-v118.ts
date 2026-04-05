// blueprints/agent-v5.ts — Fifth SEVO agent: enhanced robustness + branch diversity
// Evolved from agent-v4: conservative improvements to validation, expanded test coverage, more mutation strategies

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
  | { code: "CONSTRAINT_VIOLATION"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  if (!type || typeof type !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
  }
  if (type.length > 128) {
    return { ok: false, error: { code: "INVALID_TYPE", message: `@type exceeds 128 chars: ${type.length}` } };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
  }
  if (id.length > 256) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
  }
  if (id.length < 3) {
    return { ok: false, error: { code: "INVALID_ID", message: `@id must be at least 3 characters` } };
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
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Missing or invalid @type" } };
  }
  if (n["@type"].length > 128) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type exceeds max length" } };
  }
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "Missing or invalid @id" } };
  }
  if (n["@id"].length > 256 || n["@id"].length < 3) {
    return { ok: false, error: { code: "INVALID_ID", message: "@id length out of bounds" } };
  }
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing timestamp" } };
  }
  if (isNaN(new Date(n["timestamp"] as string).getTime())) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Invalid ISO date" } };
  }
  return { ok: true, value: n as unknown as SeVoNode };
}

const store = new Map<string, SeVoNode>();

async function writeToStore(node: SeVoNode): Promise<Result<string>> {
  if (store.has(node["@id"])) {
    return { ok: false, error: { code: "DUPLICATE_NODE", message: `Node ${node["@id"]} already exists` } };
  }
  await new Promise((r) => setTimeout(r, 1));
  store.set(node["@id"], node);
  return { ok: true, value: node["@id"] };
}

async function readFromStore(id: string): Promise<Result<SeVoNode>> {
  const node = store.get(id);
  if (!node) {
    return { ok: false, error: { code: "WRITE_FAILED", message: `Node ${id} not found` } };
  }
  return { ok: true, value: node };
}

async function queryStore(typeFilter?: string): Promise<Result<SeVoNode[]>> {
  const results = Array.from(store.values());
  if (typeFilter) {
    return { ok: true, value: results.filter((n) => n["@type"] === typeFilter) };
  }
  return { ok: true, value: results };
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-z0-9-_:]/gi, "-").substring(0, 256);
}

async function branch1_BasicCreation(): Promise<number> {
  const r = createNode("TestNode", "test-1");
  if (!r.ok) return 0;
  const validated = validateNode(r.value);
  if (!validated.ok) return 0;
  const written = await writeToStore(r.value);
  return written.ok ? 1 : 0;
}

async function branch2_InvalidTypes(): Promise<number> {
  const tests = [
    createNode("", "id-1"),
    createNode(123 as unknown as string, "id-2"),
    createNode("A".repeat(200), "id-3"),
  ];
  return tests.filter((t) => !t.ok).length === 3 ? 1 : 0;
}

async function branch3_InvalidIds(): Promise<number> {
  const tests = [
    createNode("Type", ""),
    createNode("Type", "x"),
    createNode("Type", "A".repeat(300)),
  ];
  return tests.filter((t) => !t.ok).length === 3 ? 1 : 0;
}

async function branch4_TimestampValidation(): Promise<number> {
  const r = createNode("Temporal", "ts-1");
  if (!r.ok) return 0;
  const ts = (r.value as Record<string, unknown>)["timestamp"] as string;
  const date = new Date(ts);
  return !isNaN(date.getTime()) ? 1 : 0;
}

async function branch5_DuplicatePrevention(): Promise<number> {
  store.clear();
  const r1 = createNode("Unique", "dup-test");
  if (!r1.ok) return 0;
  const w1 = await writeToStore(r1.value);
  if (!w1.ok) return 0;
  const w2 = await writeToStore(r1.value);
  return !w2.ok && w2.error.code === "DUPLICATE_NODE" ? 1 : 0;
}

async function branch6_ReadAfterWrite(): Promise<number> {
  store.clear();
  const r = createNode("ReadTest", "read-1");
  if (!r.ok) return 0;
  const written = await writeToStore(r.value);
  if (!written.ok) return 0;
  const read = await readFromStore(r.value["@id"]);
  return read.ok && read.value["@id"] === r.value["@id"] ? 1 : 0;
}

async function branch7_QueryByType(): Promise<number> {
  store.clear();
  const r1 = createNode("TypeA", "q-1");
  const r2 = createNode("TypeA", "q-2");
  const r3 = createNode("TypeB", "q-3");
  if (!r1.ok || !r2.ok || !r3.ok) return 0;
  await writeToStore(r1.value);
  await writeToStore(r2.value);
  await writeToStore(r3.value);
  const query = await queryStore("TypeA");
  return query.ok && query.value.length === 2 ? 1 : 0;
}

async function branch8_IdSanitization(): Promise<number> {
  const dirty = "test@#$%node!";
  const clean = sanitizeId(dirty);
  return clean.length > 0 && clean.length <= 256 && !/[@#$%!]/.test(clean) ? 1 : 0;
}

async function branch9_ExtraFieldHandling(): Promise<number> {
  const r = createNode("Extended", "ext-1", { custom: "value", nested: { key: 42 } });
  if (!r.ok) return 0;
  const v = r.value as Record<string, unknown>;
  return v["custom"] === "value" && (v["nested"] as Record<string, unknown>)["key"] === 42 ? 1 : 0;
}

async function branch10_LargeBatch(): Promise<number> {
  store.clear();
  let success = 0;
  for (let i = 0; i < 50; i++) {
    const r = createNode(`Type${i % 5}`, `batch-${i}`);
    if (r.ok) {
      const w = await writeToStore(r.value);
      if (w.ok) success++;
    }
  }
  return success === 50 ? 1 : 0;
}

async function branch11_ContextValidation(): Promise<number> {
  const bad = { "@context": "sevo://v2", "@type": "Test", "@id": "ctx-1", timestamp: new Date().toISOString() };
  const r = validateNode(bad);
  return !r.ok && r.error.code === "INVALID_CONTEXT" ? 1 : 0;
}

async function branch12_ConcurrentWrites(): Promise<number> {
  store.clear();
  const promises = [];
  for (let i = 0; i < 10; i++) {
    const r = createNode("Concurrent", `conc-${i}`);
    if (r.ok) promises.push(writeToStore(r.value));
  }
  const results = await Promise.all(promises);
  return results.filter((r) => r.ok).length === 10 ? 1 : 0;
}

async function branch13_EdgeCaseTimestamps(): Promise<number> {
  const epoch = validateNode({
    "@context": "sevo://v1",
    "@type": "Epoch",
    "@id": "epoch-1",
    timestamp: "1970-01-01T00:00:00Z",
  });
  const future = validateNode({
    "@context": "sevo://v1",
    "@type": "Future",
    "@id": "future-1",
    timestamp: "2100-12-31T23:59:59Z",
  });
  return epoch.ok && future.ok ? 1 : 0;
}

async function branch14_TypeCoercionResistance(): Promise<number> {
  const tests = [
    createNode(null as unknown as string, "coerce-1"),
    createNode(undefined as unknown as string, "coerce-2"),
    createNode({ toString: () => "Type" } as unknown as string, "coerce-3"),
  ];
  return tests.filter((t) => !t.ok).length === 3 ? 1 : 0;
}

async function branch15_EmptyExtraFields(): Promise<number> {
  const r = createNode("Empty", "empty-1", {});
  if (!r.ok) return 0;
  const v = r.value as Record<string, unknown>;
  return v["@context"] === "sevo://v1" && v["@type"] === "Empty" && v["@id"] === "empty-1" ? 1 : 0;
}

const branches = [
  branch1_BasicCreation,
  branch2_InvalidTypes,
  branch3_InvalidIds,
  branch4_TimestampValidation,
  branch5_DuplicatePrevention,
  branch6_ReadAfterWrite,
  branch7_QueryByType,
  branch8_IdSanitization,
  branch9_ExtraFieldHandling,
  branch10_LargeBatch,
  branch11_ContextValidation,
  branch12_ConcurrentWrites,
  branch13_EdgeCaseTimestamps,
  branch14_TypeCoercionResistance,
  branch15_EmptyExtraFields,
];

async function main() {
  let passed = 0;
  let total = 0;

  for (const branch of branches) {
    try {
      const result = await branch();
      if (result === 1) passed++;
      total++;
    } catch {
      total++;
    }
  }

  const fitness = passed / total;
  console.log(JSON.stringify({ fitness, branches: branches.length, correct: passed, total }));
}

main();
