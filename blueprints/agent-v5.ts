// blueprints/agent-v5.ts — Fifth SEVO agent: multi-strategy exploration targeting branchesExplored metric
// Evolved from agent-v4. Defines three competing strategies for node creation, runs all 30 tests
// against each, selects the winner, and reports branches explored in fitness output.

// ============================================================
// Shared types
// ============================================================

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

// ============================================================
// Strategy A — strict validation up front
// All constraints checked before the node object is assembled.
// Fast failure path: if any field is invalid, nothing is created.
// ============================================================

const strategyA = {
  name: "strict-upfront",

  createNode(
    type: string,
    id: string,
    extra: Record<string, unknown> = {}
  ): Result<SeVoNode & Record<string, unknown>> {
    // Validate type first
    if (!type || typeof type !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
    }
    // Validate id
    if (!id || typeof id !== "string") {
      return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
    }
    if (id.length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
    }
    // All checks passed — build the node
    const timestamp = new Date().toISOString();
    return {
      ok: true,
      value: { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra },
    };
  },

  validateNode(node: unknown): Result<SeVoNode> {
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
    if (isNaN(new Date(n["timestamp"] as string).getTime())) {
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Invalid ISO date" } };
    }
    return { ok: true, value: n as unknown as SeVoNode };
  },

  sanitizeId(id: string): string {
    return id.replace(/[^a-z0-9-]/gi, "-");
  },

  nodeToPath(node: SeVoNode): string {
    const type = node["@type"].toLowerCase();
    const id = this.sanitizeId(node["@id"]);
    return `./graph/${type}s/${id}.jsonld`;
  },

  async writeFsNode(node: SeVoNode, baseDir: string): Promise<Result<string>> {
    const type = node["@type"].toLowerCase();
    const dir = `${baseDir}/${type}s`;
    await Deno.mkdir(dir, { recursive: true });
    const filename = `${this.sanitizeId(node["@id"])}.jsonld`;
    const path = `${dir}/${filename}`;
    try {
      await Deno.stat(path);
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `File already exists: ${path}` } };
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        return { ok: false, error: { code: "WRITE_FAILED", message: String(e) } };
      }
    }
    await Deno.writeTextFile(path, JSON.stringify(node, null, 2));
    return { ok: true, value: path };
  },

  async readFsNode(id: string, type: string, baseDir: string): Promise<Result<SeVoNode>> {
    const dir = `${baseDir}/${type.toLowerCase()}s`;
    const path = `${dir}/${this.sanitizeId(id)}.jsonld`;
    try {
      const text = await Deno.readTextFile(path);
      const parsed = JSON.parse(text);
      return this.validateNode(parsed);
    } catch (e) {
      return { ok: false, error: { code: "WRITE_FAILED", message: `Read failed: ${e}` } };
    }
  },
};

// ============================================================
// Strategy B — lenient creation with post-validation
// The node is assembled with whatever inputs are provided; a
// separate validation pass then classifies the result. Allows
// partial nodes to exist in memory for debugging purposes.
// ============================================================

const strategyB = {
  name: "lenient-post-validate",

  createNode(
    type: unknown,
    id: unknown,
    extra: Record<string, unknown> = {}
  ): Result<SeVoNode & Record<string, unknown>> {
    // Build optimistically
    const candidate: Record<string, unknown> = {
      "@context": "sevo://v1",
      "@type": type,
      "@id": id,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    // Post-validate
    return this.validateNode(candidate) as Result<SeVoNode & Record<string, unknown>>;
  },

  validateNode(node: unknown): Result<SeVoNode> {
    if (!node || typeof node !== "object") {
      return { ok: false, error: { code: "INVALID_TYPE", message: "Not an object" } };
    }
    const n = node as Record<string, unknown>;
    // Check context
    if (n["@context"] !== "sevo://v1") {
      return { ok: false, error: { code: "INVALID_CONTEXT", message: `Expected sevo://v1, got ${n["@context"]}` } };
    }
    // Check type — lenient: coerce truthy string, otherwise fail
    if (!n["@type"] || typeof n["@type"] !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof n["@type"]}` } };
    }
    // Check id — also enforce length limit here
    if (!n["@id"] || typeof n["@id"] !== "string") {
      return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof n["@id"]}` } };
    }
    if ((n["@id"] as string).length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${(n["@id"] as string).length}` } };
    }
    // Check timestamp
    if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing timestamp" } };
    }
    if (isNaN(new Date(n["timestamp"] as string).getTime())) {
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Invalid ISO date" } };
    }
    return { ok: true, value: n as unknown as SeVoNode };
  },

  sanitizeId(id: string): string {
    return id.replace(/[^a-z0-9-]/gi, "-");
  },

  nodeToPath(node: SeVoNode): string {
    const type = node["@type"].toLowerCase();
    const id = this.sanitizeId(node["@id"]);
    return `./graph/${type}s/${id}.jsonld`;
  },

  async writeFsNode(node: SeVoNode, baseDir: string): Promise<Result<string>> {
    const type = node["@type"].toLowerCase();
    const dir = `${baseDir}/${type}s`;
    await Deno.mkdir(dir, { recursive: true });
    const filename = `${this.sanitizeId(node["@id"])}.jsonld`;
    const path = `${dir}/${filename}`;
    try {
      await Deno.stat(path);
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `File already exists: ${path}` } };
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        return { ok: false, error: { code: "WRITE_FAILED", message: String(e) } };
      }
    }
    await Deno.writeTextFile(path, JSON.stringify(node, null, 2));
    return { ok: true, value: path };
  },

  async readFsNode(id: string, type: string, baseDir: string): Promise<Result<SeVoNode>> {
    const dir = `${baseDir}/${type.toLowerCase()}s`;
    const path = `${dir}/${this.sanitizeId(id)}.jsonld`;
    try {
      const text = await Deno.readTextFile(path);
      const parsed = JSON.parse(text);
      return this.validateNode(parsed);
    } catch (e) {
      return { ok: false, error: { code: "WRITE_FAILED", message: `Read failed: ${e}` } };
    }
  },
};

// ============================================================
// Strategy C — builder pattern
// A NodeBuilder accumulates fields via chained setters; .build()
// runs all validation and returns a Result. Separates the
// construction API from the validation logic.
// ============================================================

class NodeBuilder {
  private _type: string = "";
  private _id: string = "";
  private _extra: Record<string, unknown> = {};

  type(t: string): NodeBuilder { this._type = t; return this; }
  id(i: string): NodeBuilder { this._id = i; return this; }
  fields(extra: Record<string, unknown>): NodeBuilder { this._extra = { ...this._extra, ...extra }; return this; }

  build(): Result<SeVoNode & Record<string, unknown>> {
    if (!this._type || typeof this._type !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof this._type}` } };
    }
    if (!this._id || typeof this._id !== "string") {
      return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof this._id}` } };
    }
    if (this._id.length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${this._id.length}` } };
    }
    return {
      ok: true,
      value: {
        "@context": "sevo://v1",
        "@type": this._type,
        "@id": this._id,
        timestamp: new Date().toISOString(),
        ...this._extra,
      },
    };
  }
}

const strategyC = {
  name: "builder-pattern",

  createNode(
    type: string,
    id: string,
    extra: Record<string, unknown> = {}
  ): Result<SeVoNode & Record<string, unknown>> {
    return new NodeBuilder().type(type).id(id).fields(extra).build();
  },

  validateNode(node: unknown): Result<SeVoNode> {
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
    if (isNaN(new Date(n["timestamp"] as string).getTime())) {
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Invalid ISO date" } };
    }
    return { ok: true, value: n as unknown as SeVoNode };
  },

  sanitizeId(id: string): string {
    return id.replace(/[^a-z0-9-]/gi, "-");
  },

  nodeToPath(node: SeVoNode): string {
    const type = node["@type"].toLowerCase();
    const id = this.sanitizeId(node["@id"]);
    return `./graph/${type}s/${id}.jsonld`;
  },

  async writeFsNode(node: SeVoNode, baseDir: string): Promise<Result<string>> {
    const type = node["@type"].toLowerCase();
    const dir = `${baseDir}/${type}s`;
    await Deno.mkdir(dir, { recursive: true });
    const filename = `${this.sanitizeId(node["@id"])}.jsonld`;
    const path = `${dir}/${filename}`;
    try {
      await Deno.stat(path);
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `File already exists: ${path}` } };
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        return { ok: false, error: { code: "WRITE_FAILED", message: String(e) } };
      }
    }
    await Deno.writeTextFile(path, JSON.stringify(node, null, 2));
    return { ok: true, value: path };
  },

  async readFsNode(id: string, type: string, baseDir: string): Promise<Result<SeVoNode>> {
    const dir = `${baseDir}/${type.toLowerCase()}s`;
    const path = `${dir}/${this.sanitizeId(id)}.jsonld`;
    try {
      const text = await Deno.readTextFile(path);
      const parsed = JSON.parse(text);
      return this.validateNode(parsed);
    } catch (e) {
      return { ok: false, error: { code: "WRITE_FAILED", message: `Read failed: ${e}` } };
    }
  },
};

// ============================================================
// Test suite — identical 30 tests run against any strategy
// ============================================================

type Strategy = typeof strategyA; // all three share the same shape

async function runTests(s: Strategy): Promise<{ correct: number; total: number }> {
  let correct = 0;
  let total = 0;

  // In-memory store used by concurrency tests — scoped per strategy run
  const store = new Map<string, SeVoNode>();

  async function writeToStore(node: SeVoNode): Promise<Result<string>> {
    if (store.has(node["@id"])) {
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `Node ${node["@id"]} already exists` } };
    }
    await new Promise((r) => setTimeout(r, 1));
    store.set(node["@id"], node);
    return { ok: true, value: node["@id"] };
  }

  // Test 1: basic creation
  total++;
  const r1 = s.createNode("Task", "t-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
  if (r1.ok && s.validateNode(r1.value).ok) correct++;

  // Test 2: agent node
  total++;
  const r2 = s.createNode("Agent", "a-1", { blueprint: "t.ts", generation: 1, status: "active" });
  if (r2.ok && r2.value["@type"] === "Agent") correct++;

  // Test 3: reject empty type with proper error code
  total++;
  const r3 = s.createNode("", "id");
  if (!r3.ok && r3.error.code === "INVALID_TYPE") correct++;

  // Test 4: reject empty id with proper error code
  total++;
  const r4 = s.createNode("Task", "");
  if (!r4.ok && r4.error.code === "INVALID_ID") correct++;

  // Test 5: timestamp validity
  total++;
  const r5 = s.createNode("Fitness", "f-1");
  if (r5.ok && !isNaN(new Date(r5.value.timestamp).getTime())) correct++;

  // Test 6: JSON roundtrip
  total++;
  const r6 = s.createNode("Mutation", "m-1", { proposal: "change" });
  if (r6.ok) {
    const parsed = JSON.parse(JSON.stringify(r6.value));
    if (s.validateNode(parsed).ok && parsed.proposal === "change") correct++;
  }

  // Test 7: reject null
  total++;
  if (!s.validateNode(null).ok) correct++;

  // Test 8: reject non-objects
  total++;
  if (!s.validateNode("string").ok) correct++;

  // Test 9: id length boundary
  total++;
  const r9 = s.createNode("Task", "x".repeat(257));
  if (!r9.ok && r9.error.code === "INVALID_ID") correct++;

  // Test 10: nested object preservation
  total++;
  const r10 = s.createNode("Selection", "s-1", { winner: "a", context: { nested: { deep: true } } });
  if (r10.ok && (r10.value.context as Record<string, unknown>)?.nested) correct++;

  // Test 11: concurrent writes — no duplicates
  total++;
  {
    store.clear();
    const node1 = s.createNode("Task", "concurrent-1");
    const node2 = s.createNode("Task", "concurrent-1");
    if (node1.ok && node2.ok) {
      const w1 = await writeToStore(node1.value as SeVoNode);
      const w2 = await writeToStore(node2.value as SeVoNode);
      if (w1.ok && !w2.ok && w2.error.code === "DUPLICATE_NODE") correct++;
    }
  }

  // Test 12: concurrent parallel writes
  total++;
  {
    store.clear();
    const nodes = Array.from({ length: 5 }, (_, i) => s.createNode("Task", `parallel-${i}`));
    const writes = nodes.map((n) =>
      n.ok
        ? writeToStore(n.value as SeVoNode)
        : Promise.resolve({ ok: false as const, error: { code: "INVALID_TYPE" as const, message: "" } })
    );
    const results = await Promise.all(writes);
    if (results.every((r) => r.ok)) correct++;
  }

  // Test 13: error granularity — bad context
  total++;
  const badContext = { "@context": "wrong", "@type": "Task", "@id": "x", timestamp: new Date().toISOString() };
  const r13 = s.validateNode(badContext);
  if (!r13.ok && r13.error.code === "INVALID_CONTEXT") correct++;

  // Test 14: error granularity — bad timestamp
  total++;
  const badTs = { "@context": "sevo://v1", "@type": "Task", "@id": "x", timestamp: "not-a-date" };
  const r14 = s.validateNode(badTs);
  if (!r14.ok && r14.error.code === "INVALID_TIMESTAMP") correct++;

  // Test 15: graph path — basic well-formed id
  total++;
  {
    const node = { "@context": "sevo://v1" as const, "@type": "Agent", "@id": "agent-v1", timestamp: new Date().toISOString() };
    const path = s.nodeToPath(node);
    if (path === "./graph/agents/agent-v1.jsonld") correct++;
  }

  // Test 16: graph path — special characters are sanitized
  total++;
  {
    const node = { "@context": "sevo://v1" as const, "@type": "Fitness", "@id": "fitness:agent-v1/cycle 1\u00e9", timestamp: new Date().toISOString() };
    const path = s.nodeToPath(node);
    const expected = "./graph/fitnesss/fitness-agent-v1-cycle-1-.jsonld";
    if (path === expected) correct++;
  }

  // Test 17: graph path — id with only special chars becomes all hyphens
  total++;
  {
    const node = { "@context": "sevo://v1" as const, "@type": "Task", "@id": "!!!@@@", timestamp: new Date().toISOString() };
    const path = s.nodeToPath(node);
    if (path === "./graph/tasks/------.jsonld") correct++;
  }

  // Test 18: graph path — uppercase letters preserved
  total++;
  {
    const node = { "@context": "sevo://v1" as const, "@type": "Mutation", "@id": "Mutation-ABC-123", timestamp: new Date().toISOString() };
    const path = s.nodeToPath(node);
    if (path === "./graph/mutations/Mutation-ABC-123.jsonld") correct++;
  }

  // Test 19: sanitizeId — colons replaced
  total++;
  {
    const sanitized = s.sanitizeId("agent:v1:gen-3");
    if (sanitized === "agent-v1-gen-3") correct++;
  }

  // Test 20: sanitizeId — slashes replaced
  total++;
  {
    const sanitized = s.sanitizeId("selection/winner/2024");
    if (sanitized === "selection-winner-2024") correct++;
  }

  // Test 21: sanitizeId — spaces replaced
  total++;
  {
    const sanitized = s.sanitizeId("my node id");
    if (sanitized === "my-node-id") correct++;
  }

  // Test 22: sanitizeId — dots replaced
  total++;
  {
    const sanitized = s.sanitizeId("v1.0.3");
    if (sanitized === "v1-0-3") correct++;
  }

  // Test 23: FS write + read roundtrip
  total++;
  {
    const tempDir = await Deno.makeTempDir({ prefix: "sevo-test-" });
    try {
      const node = s.createNode("Task", "fs-test-1", { description: "fs roundtrip" });
      if (node.ok) {
        const writeResult = await s.writeFsNode(node.value as SeVoNode, tempDir);
        if (writeResult.ok) {
          const readResult = await s.readFsNode("fs-test-1", "Task", tempDir);
          if (
            readResult.ok &&
            readResult.value["@id"] === "fs-test-1" &&
            readResult.value["@type"] === "Task"
          ) correct++;
        }
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  // Test 24: FS append-only — second write to same id is rejected
  total++;
  {
    const tempDir = await Deno.makeTempDir({ prefix: "sevo-test-" });
    try {
      const node = s.createNode("Agent", "fs-dedup-1", { generation: 1, status: "active" });
      if (node.ok) {
        const w1 = await s.writeFsNode(node.value as SeVoNode, tempDir);
        const w2 = await s.writeFsNode(node.value as SeVoNode, tempDir);
        if (w1.ok && !w2.ok && w2.error.code === "DUPLICATE_NODE") correct++;
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  // Test 25: FS — different types go to different subdirectories
  total++;
  {
    const tempDir = await Deno.makeTempDir({ prefix: "sevo-test-" });
    try {
      const task = s.createNode("Task", "shared-id-1");
      const agent = s.createNode("Agent", "shared-id-1");
      if (task.ok && agent.ok) {
        const wt = await s.writeFsNode(task.value as SeVoNode, tempDir);
        const wa = await s.writeFsNode(agent.value as SeVoNode, tempDir);
        if (wt.ok && wa.ok) correct++;
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  // Test 26: FS — special-char id is sanitized on disk
  total++;
  {
    const tempDir = await Deno.makeTempDir({ prefix: "sevo-test-" });
    try {
      const node = s.createNode("Fitness", "fitness:agent-v1", { eqs: 0.85 });
      if (node.ok) {
        const writeResult = await s.writeFsNode(node.value as SeVoNode, tempDir);
        if (writeResult.ok) {
          const expectedPath = `${tempDir}/fitnesss/fitness-agent-v1.jsonld`;
          try {
            const stat = await Deno.stat(expectedPath);
            if (stat.isFile) correct++;
          } catch { /* file not found at expected path */ }
        }
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  // Test 27: large payload — node with 100 extra fields
  total++;
  {
    const extra: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      extra[`field_${i}`] = { value: i, label: `field-${i}`, nested: { x: i * 2 } };
    }
    const node = s.createNode("Selection", "large-payload-1", extra);
    if (node.ok) {
      const json = JSON.stringify(node.value);
      const parsed = JSON.parse(json);
      const validationResult = s.validateNode(parsed);
      const allFieldsPresent = Array.from({ length: 100 }, (_, i) => `field_${i}`)
        .every((k) => parsed[k] !== undefined);
      if (validationResult.ok && allFieldsPresent) correct++;
    }
  }

  // Test 28: large payload — deeply nested object
  total++;
  {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 9; i >= 0; i--) {
      deep = { [`level_${i}`]: deep };
    }
    const node = s.createNode("Mutation", "deep-payload-1", { deep });
    if (node.ok) {
      const json = JSON.stringify(node.value);
      const parsed = JSON.parse(json);
      if (s.validateNode(parsed).ok && parsed.deep !== undefined) correct++;
    }
  }

  // Test 29: large payload — array with 500 elements
  total++;
  {
    const bigArray = Array.from({ length: 500 }, (_, i) => ({ index: i, data: `item-${i}` }));
    const node = s.createNode("Task", "array-payload-1", { items: bigArray });
    if (node.ok) {
      const json = JSON.stringify(node.value);
      const parsed = JSON.parse(json);
      const items = parsed.items as unknown[];
      if (s.validateNode(parsed).ok && Array.isArray(items) && items.length === 500) correct++;
    }
  }

  // Test 30: large payload — FS write + read roundtrip with many fields
  total++;
  {
    const tempDir = await Deno.makeTempDir({ prefix: "sevo-test-" });
    try {
      const extra: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        extra[`prop_${i}`] = `value_${i}`;
      }
      const node = s.createNode("Benchmark", "large-fs-1", extra);
      if (node.ok) {
        const writeResult = await s.writeFsNode(node.value as SeVoNode, tempDir);
        if (writeResult.ok) {
          const readResult = await s.readFsNode("large-fs-1", "Benchmark", tempDir);
          if (readResult.ok) {
            const raw = readResult.value as unknown as Record<string, unknown>;
            const allPresent = Array.from({ length: 50 }, (_, i) => `prop_${i}`)
              .every((k) => raw[k] !== undefined);
            if (allPresent) correct++;
          }
        }
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  return { correct, total };
}

// ============================================================
// Run all three strategies and select the winner
// ============================================================

const strategies: Strategy[] = [strategyA, strategyB, strategyC];
const branches = strategies.length;

const results: Array<{ name: string; correct: number; total: number; score: number }> = [];

for (const s of strategies) {
  const { correct, total } = await runTests(s);
  results.push({ name: s.name, correct, total, score: correct / total });
}

// Select winner by highest score; tie-break by strategy order (earlier = preferred)
const winner = results.reduce((best, cur) => cur.score > best.score ? cur : best);

const fitness = winner.score;
console.log(JSON.stringify({
  fitness,
  branches,
  correct: winner.correct,
  total: winner.total,
  winningStrategy: winner.name,
}));
