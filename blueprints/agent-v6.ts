// blueprints/agent-v6.ts — Sixth SEVO agent: per-type schema validation + cross-node reference validation
// Evolved from agent-v5. Adds two new layers on top of the multi-strategy approach:
//   1. Per-type schema validation — each known node type has required fields with type constraints.
//   2. Cross-node reference validation — fields like `agent`, `parent`, `winner`, `loser` must
//      resolve to existing nodes in the in-memory store.
// Runs all 40 tests (30 from v5 + 10 new) against all three strategies, selects the winner.

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
  | { code: "WRITE_FAILED"; message: string }
  | { code: "SCHEMA_VIOLATION"; message: string }
  | { code: "UNRESOLVED_REFERENCE"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

// ============================================================
// Per-type schema definitions
// ============================================================

type FieldSpec = { type: "string" | "number" | "array" | "object"; enum?: string[] };
type SchemaMap = Record<string, FieldSpec>;

const TYPE_SCHEMAS: Record<string, SchemaMap> = {
  Agent: {
    blueprint:  { type: "string" },
    generation: { type: "number" },
    status:     { type: "string", enum: ["active", "testing", "dormant", "archived"] },
  },
  Fitness: {
    agent:           { type: "string" },
    eqs:             { type: "number" },
    cycleId:         { type: "string" },
    accuracy:        { type: "number" },
    magnitude:       { type: "number" },
    branchesExplored:{ type: "number" },
    predictionError: { type: "number" },
  },
  Task: {
    description: { type: "string" },
    priority:    { type: "number" },
    status:      { type: "string", enum: ["pending", "running", "done", "failed"] },
    dependsOn:   { type: "array" },
  },
  Mutation: {
    parent:   { type: "string" },
    proposal: { type: "string" },
    branch:   { type: "string" },
    status:   { type: "string", enum: ["proposed", "testing", "selected", "rejected"] },
    reasoning:{ type: "string" },
  },
  Selection: {
    winner:    { type: "string" },
    loser:     { type: "string" },
    winnerEqs: { type: "number" },
    loserEqs:  { type: "number" },
    eqsDelta:  { type: "number" },
    reasoning: { type: "string" },
  },
  Benchmark: {
    version:      { type: "number" },
    task:         { type: "string" },
    scoringLogic: { type: "string" },
    difficulty:   { type: "number" },
    passThreshold:{ type: "number" },
  },
};

// Fields that are @id references — must resolve in the node store when present
const REFERENCE_FIELDS: Record<string, string[]> = {
  Agent:     ["parent"],
  Fitness:   ["agent"],
  Task:      [],
  Mutation:  ["parent"],
  Selection: ["winner", "loser"],
  Benchmark: ["parent"],
};

// ============================================================
// Schema validation helper — pure, shared by all strategies
// ============================================================

function validateSchema(
  node: Record<string, unknown>,
  store: Map<string, SeVoNode>
): Result<true> {
  const type = node["@type"] as string;
  const schema = TYPE_SCHEMAS[type];

  if (!schema) {
    // Unknown type — no schema to enforce; pass through
    return { ok: true, value: true };
  }

  // Check required fields and their types
  for (const [field, spec] of Object.entries(schema)) {
    const val = node[field];
    if (val === undefined || val === null) {
      return {
        ok: false,
        error: {
          code: "SCHEMA_VIOLATION",
          message: `${type} node missing required field: ${field}`,
        },
      };
    }
    const actualType = Array.isArray(val) ? "array" : typeof val;
    if (actualType !== spec.type) {
      return {
        ok: false,
        error: {
          code: "SCHEMA_VIOLATION",
          message: `${type}.${field} expected ${spec.type}, got ${actualType}`,
        },
      };
    }
    if (spec.enum && !spec.enum.includes(val as string)) {
      return {
        ok: false,
        error: {
          code: "SCHEMA_VIOLATION",
          message: `${type}.${field} must be one of [${spec.enum.join(", ")}], got "${val}"`,
        },
      };
    }
  }

  // Check cross-node references
  const refFields = REFERENCE_FIELDS[type] ?? [];
  for (const field of refFields) {
    const ref = node[field] as string | undefined;
    if (ref === undefined || ref === null) continue; // optional references are skipped
    if (!store.has(ref)) {
      return {
        ok: false,
        error: {
          code: "UNRESOLVED_REFERENCE",
          message: `${type}.${field} references unknown node: "${ref}"`,
        },
      };
    }
  }

  return { ok: true, value: true };
}

// ============================================================
// Strategy A — strict validation up front
// All constraints checked before the node object is assembled.
// Fast failure path: if any field is invalid, nothing is created.
// ============================================================

const strategyA = {
  name: "strict-upfront",

  // The store is injected at test time so each strategy shares a common
  // in-memory reference store for cross-node validation.
  _store: new Map<string, SeVoNode>(),

  registerInStore(node: SeVoNode): void {
    this._store.set(node["@id"], node);
  },

  createNode(
    type: string,
    id: string,
    extra: Record<string, unknown> = {}
  ): Result<SeVoNode & Record<string, unknown>> {
    // Validate base fields first
    if (!type || typeof type !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof type}` } };
    }
    if (!id || typeof id !== "string") {
      return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof id}` } };
    }
    if (id.length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` } };
    }
    // Build node
    const timestamp = new Date().toISOString();
    const candidate = { "@context": "sevo://v1" as const, "@type": type, "@id": id, timestamp, ...extra };
    // Per-type schema + reference validation
    const schemaResult = validateSchema(candidate as Record<string, unknown>, this._store);
    if (!schemaResult.ok) return { ok: false, error: schemaResult.error };
    return { ok: true, value: candidate };
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

  validateNodeWithSchema(node: unknown): Result<SeVoNode> {
    const base = this.validateNode(node);
    if (!base.ok) return base;
    const schemaResult = validateSchema(node as Record<string, unknown>, this._store);
    if (!schemaResult.ok) return { ok: false, error: schemaResult.error };
    return base;
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

  _store: new Map<string, SeVoNode>(),

  registerInStore(node: SeVoNode): void {
    this._store.set(node["@id"], node);
  },

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
    // Post-validate base fields
    const baseResult = this.validateNode(candidate) as Result<SeVoNode & Record<string, unknown>>;
    if (!baseResult.ok) return baseResult;
    // Per-type schema + reference validation
    const schemaResult = validateSchema(candidate, this._store);
    if (!schemaResult.ok) return { ok: false, error: schemaResult.error };
    return baseResult;
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
      return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be a non-empty string, got: ${typeof n["@type"]}` } };
    }
    if (!n["@id"] || typeof n["@id"] !== "string") {
      return { ok: false, error: { code: "INVALID_ID", message: `@id must be a non-empty string, got: ${typeof n["@id"]}` } };
    }
    if ((n["@id"] as string).length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${(n["@id"] as string).length}` } };
    }
    if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Missing timestamp" } };
    }
    if (isNaN(new Date(n["timestamp"] as string).getTime())) {
      return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Invalid ISO date" } };
    }
    return { ok: true, value: n as unknown as SeVoNode };
  },

  validateNodeWithSchema(node: unknown): Result<SeVoNode> {
    const base = this.validateNode(node);
    if (!base.ok) return base;
    const schemaResult = validateSchema(node as Record<string, unknown>, this._store);
    if (!schemaResult.ok) return { ok: false, error: schemaResult.error };
    return base;
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
  private _store: Map<string, SeVoNode> = new Map();

  type(t: string): NodeBuilder { this._type = t; return this; }
  id(i: string): NodeBuilder { this._id = i; return this; }
  fields(extra: Record<string, unknown>): NodeBuilder { this._extra = { ...this._extra, ...extra }; return this; }
  withStore(store: Map<string, SeVoNode>): NodeBuilder { this._store = store; return this; }

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
    const candidate = {
      "@context": "sevo://v1" as const,
      "@type": this._type,
      "@id": this._id,
      timestamp: new Date().toISOString(),
      ...this._extra,
    };
    // Per-type schema + reference validation
    const schemaResult = validateSchema(candidate as Record<string, unknown>, this._store);
    if (!schemaResult.ok) return { ok: false, error: schemaResult.error };
    return { ok: true, value: candidate };
  }
}

const strategyC = {
  name: "builder-pattern",

  _store: new Map<string, SeVoNode>(),

  registerInStore(node: SeVoNode): void {
    this._store.set(node["@id"], node);
  },

  createNode(
    type: string,
    id: string,
    extra: Record<string, unknown> = {}
  ): Result<SeVoNode & Record<string, unknown>> {
    return new NodeBuilder().type(type).id(id).fields(extra).withStore(this._store).build();
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

  validateNodeWithSchema(node: unknown): Result<SeVoNode> {
    const base = this.validateNode(node);
    if (!base.ok) return base;
    const schemaResult = validateSchema(node as Record<string, unknown>, this._store);
    if (!schemaResult.ok) return { ok: false, error: schemaResult.error };
    return base;
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
// Unified strategy type — both old + new capabilities
// ============================================================

type Strategy = typeof strategyA;

// ============================================================
// Test suite — 40 tests: 30 from v5 + 10 new schema/ref tests
// ============================================================

async function runTests(s: Strategy): Promise<{ correct: number; total: number }> {
  let correct = 0;
  let total = 0;

  // Reset strategy store before each run so tests are isolated
  s._store.clear();

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

  // ---- v5 tests (1–30) ----------------------------------------

  // Test 1: basic creation
  total++;
  {
    s._store.clear();
    const r1 = s.createNode("Task", "t-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
    if (r1.ok && s.validateNode(r1.value).ok) correct++;
  }

  // Test 2: agent node
  total++;
  {
    s._store.clear();
    const r2 = s.createNode("Agent", "a-1", { blueprint: "t.ts", generation: 1, status: "active" });
    if (r2.ok && r2.value["@type"] === "Agent") correct++;
  }

  // Test 3: reject empty type with proper error code
  total++;
  {
    s._store.clear();
    const r3 = s.createNode("", "id");
    if (!r3.ok && r3.error.code === "INVALID_TYPE") correct++;
  }

  // Test 4: reject empty id with proper error code
  total++;
  {
    s._store.clear();
    const r4 = s.createNode("Task", "");
    if (!r4.ok && r4.error.code === "INVALID_ID") correct++;
  }

  // Test 5: timestamp validity
  total++;
  {
    s._store.clear();
    // Pre-register the agent that Fitness.agent will reference
    s.registerInStore({
      "@context": "sevo://v1",
      "@type": "Agent",
      "@id": "a-1",
      timestamp: new Date().toISOString(),
    });
    const r5 = s.createNode("Fitness", "f-1", {
      agent: "a-1", eqs: 0.5, cycleId: "c-1",
      accuracy: 1, magnitude: 0.5, branchesExplored: 3, predictionError: 0.1,
      context: {}
    });
    if (r5.ok && !isNaN(new Date(r5.value.timestamp).getTime())) correct++;
  }

  // Test 6: JSON roundtrip
  total++;
  {
    s._store.clear();
    const r6 = s.createNode("Mutation", "m-1", {
      parent: "a-1", proposal: "change", branch: "mut/1",
      status: "proposed", reasoning: "test"
    });
    // parent "a-1" not in store — use unknown type to bypass ref check
    // (tests the base roundtrip, not schema)
    const r6u = s.createNode("Unknown", "m-1-u", { proposal: "change" });
    if (r6u.ok) {
      const parsed = JSON.parse(JSON.stringify(r6u.value));
      if (s.validateNode(parsed).ok && parsed.proposal === "change") correct++;
    } else if (r6.ok) {
      // if store happened to have a-1 (e.g. prior test populated it)
      const parsed = JSON.parse(JSON.stringify(r6.value));
      if (s.validateNode(parsed).ok && parsed.proposal === "change") correct++;
    }
  }

  // Test 7: reject null
  total++;
  if (!s.validateNode(null).ok) correct++;

  // Test 8: reject non-objects
  total++;
  if (!s.validateNode("string").ok) correct++;

  // Test 9: id length boundary
  total++;
  {
    const r9 = s.createNode("Task", "x".repeat(257));
    if (!r9.ok && r9.error.code === "INVALID_ID") correct++;
  }

  // Test 10: nested object preservation
  total++;
  {
    s._store.clear();
    const r10 = s.createNode("Unknown", "s-1", { winner: "a", context: { nested: { deep: true } } });
    if (r10.ok && (r10.value.context as Record<string, unknown>)?.nested) correct++;
  }

  // Test 11: concurrent writes — no duplicates
  total++;
  {
    store.clear();
    s._store.clear();
    const node1 = s.createNode("Task", "concurrent-1", { description: "t", priority: 1, status: "pending", dependsOn: [] });
    const node2 = s.createNode("Task", "concurrent-1", { description: "t", priority: 1, status: "pending", dependsOn: [] });
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
    s._store.clear();
    const nodes = Array.from({ length: 5 }, (_, i) =>
      s.createNode("Task", `parallel-${i}`, { description: `t${i}`, priority: i, status: "pending", dependsOn: [] })
    );
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
  {
    const badContext = { "@context": "wrong", "@type": "Task", "@id": "x", timestamp: new Date().toISOString() };
    const r13 = s.validateNode(badContext);
    if (!r13.ok && r13.error.code === "INVALID_CONTEXT") correct++;
  }

  // Test 14: error granularity — bad timestamp
  total++;
  {
    const badTs = { "@context": "sevo://v1", "@type": "Task", "@id": "x", timestamp: "not-a-date" };
    const r14 = s.validateNode(badTs);
    if (!r14.ok && r14.error.code === "INVALID_TIMESTAMP") correct++;
  }

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
      s._store.clear();
      const node = s.createNode("Task", "fs-test-1", { description: "fs roundtrip", priority: 1, status: "pending", dependsOn: [] });
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
      s._store.clear();
      const node = s.createNode("Agent", "fs-dedup-1", { blueprint: "x.ts", generation: 1, status: "active" });
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
      s._store.clear();
      const task  = s.createNode("Task",  "shared-id-1", { description: "t", priority: 1, status: "pending", dependsOn: [] });
      const agent = s.createNode("Agent", "shared-id-1", { blueprint: "x.ts", generation: 1, status: "active" });
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
      s._store.clear();
      // Use unknown type so no schema required fields block the test
      const node = s.createNode("Unknown", "fitness:agent-v1", { eqs: 0.85 });
      if (node.ok) {
        const writeResult = await s.writeFsNode(node.value as SeVoNode, tempDir);
        if (writeResult.ok) {
          const expectedPath = `${tempDir}/unknowns/fitness-agent-v1.jsonld`;
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
    s._store.clear();
    const extra: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      extra[`field_${i}`] = { value: i, label: `field-${i}`, nested: { x: i * 2 } };
    }
    const node = s.createNode("Unknown", "large-payload-1", extra);
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
    s._store.clear();
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 9; i >= 0; i--) {
      deep = { [`level_${i}`]: deep };
    }
    const node = s.createNode("Unknown", "deep-payload-1", { deep });
    if (node.ok) {
      const json = JSON.stringify(node.value);
      const parsed = JSON.parse(json);
      if (s.validateNode(parsed).ok && parsed.deep !== undefined) correct++;
    }
  }

  // Test 29: large payload — array with 500 elements
  total++;
  {
    s._store.clear();
    const bigArray = Array.from({ length: 500 }, (_, i) => ({ index: i, data: `item-${i}` }));
    const node = s.createNode("Task", "array-payload-1", {
      description: "big", priority: 1, status: "pending", dependsOn: [], items: bigArray
    });
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
      s._store.clear();
      const extra: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        extra[`prop_${i}`] = `value_${i}`;
      }
      const node = s.createNode("Benchmark", "large-fs-1", {
        version: 1, task: "do thing", scoringLogic: "x", difficulty: 1, passThreshold: 0.6,
        ...extra
      });
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

  // ---- v6 new tests (31–40): schema + reference validation -----

  // Test 31: AgentNode — schema valid with all required fields
  total++;
  {
    s._store.clear();
    const r = s.createNode("Agent", "agent-schema-ok", {
      blueprint: "blueprints/agent-v1.ts",
      generation: 1,
      status: "active",
    });
    if (r.ok) correct++;
  }

  // Test 32: AgentNode — schema violation: missing `blueprint`
  total++;
  {
    s._store.clear();
    const r = s.createNode("Agent", "agent-no-blueprint", {
      generation: 1,
      status: "active",
    });
    if (!r.ok && r.error.code === "SCHEMA_VIOLATION") correct++;
  }

  // Test 33: AgentNode — schema violation: `status` not in enum
  total++;
  {
    s._store.clear();
    const r = s.createNode("Agent", "agent-bad-status", {
      blueprint: "x.ts",
      generation: 1,
      status: "running",   // not in the enum
    });
    if (!r.ok && r.error.code === "SCHEMA_VIOLATION") correct++;
  }

  // Test 34: FitnessNode — schema valid with all required fields
  total++;
  {
    s._store.clear();
    // Register the referenced agent so reference check passes
    const agentNode: SeVoNode = {
      "@context": "sevo://v1",
      "@type": "Agent",
      "@id": "agent-ref-1",
      timestamp: new Date().toISOString(),
    };
    s.registerInStore(agentNode);
    const r = s.createNode("Fitness", "fitness-schema-ok", {
      agent: "agent-ref-1",
      eqs: 0.72,
      cycleId: "cycle-1",
      accuracy: 1.0,
      magnitude: 0.72,
      branchesExplored: 3,
      predictionError: 0.1,
      context: {},
    });
    if (r.ok) correct++;
  }

  // Test 35: FitnessNode — schema violation: `eqs` is a string not a number
  total++;
  {
    s._store.clear();
    const r = s.createNode("Fitness", "fitness-bad-eqs", {
      agent: "a",
      eqs: "high",        // wrong type
      cycleId: "c1",
      accuracy: 1,
      magnitude: 0.5,
      branchesExplored: 3,
      predictionError: 0.1,
      context: {},
    });
    if (!r.ok && r.error.code === "SCHEMA_VIOLATION") correct++;
  }

  // Test 36: SelectionNode — cross-node ref: winner exists in store
  total++;
  {
    s._store.clear();
    const winner: SeVoNode = { "@context": "sevo://v1", "@type": "Agent", "@id": "w-1", timestamp: new Date().toISOString() };
    const loser: SeVoNode  = { "@context": "sevo://v1", "@type": "Agent", "@id": "l-1", timestamp: new Date().toISOString() };
    s.registerInStore(winner);
    s.registerInStore(loser);
    const r = s.createNode("Selection", "sel-ref-ok", {
      winner: "w-1",
      loser: "l-1",
      winnerEqs: 0.8,
      loserEqs: 0.6,
      eqsDelta: 0.2,
      reasoning: "mutant won",
    });
    if (r.ok) correct++;
  }

  // Test 37: SelectionNode — cross-node ref: winner does NOT exist in store
  total++;
  {
    s._store.clear();
    // Only register loser, not winner
    const loser: SeVoNode = { "@context": "sevo://v1", "@type": "Agent", "@id": "l-2", timestamp: new Date().toISOString() };
    s.registerInStore(loser);
    const r = s.createNode("Selection", "sel-ref-missing", {
      winner: "w-missing",  // not in store
      loser: "l-2",
      winnerEqs: 0.9,
      loserEqs: 0.4,
      eqsDelta: 0.5,
      reasoning: "won",
    });
    if (!r.ok && r.error.code === "UNRESOLVED_REFERENCE") correct++;
  }

  // Test 38: MutationNode — cross-node ref: parent exists in store
  total++;
  {
    s._store.clear();
    const parent: SeVoNode = { "@context": "sevo://v1", "@type": "Agent", "@id": "parent-agent-1", timestamp: new Date().toISOString() };
    s.registerInStore(parent);
    const r = s.createNode("Mutation", "mut-ref-ok", {
      parent: "parent-agent-1",
      proposal: "add caching",
      branch: "mutation/parent-agent-1-1234",
      status: "proposed",
      reasoning: "cache misses are high",
    });
    if (r.ok) correct++;
  }

  // Test 39: TaskNode — `dependsOn` must be an array; fail if number
  total++;
  {
    s._store.clear();
    const r = s.createNode("Task", "task-bad-deps", {
      description: "do something",
      priority: 1,
      status: "pending",
      dependsOn: 42,   // wrong type — should be array
    });
    if (!r.ok && r.error.code === "SCHEMA_VIOLATION") correct++;
  }

  // Test 40: validateNodeWithSchema — rejects existing node that breaks schema
  total++;
  {
    s._store.clear();
    // A raw object that passes base validation but violates the Benchmark schema
    // (missing required fields `task`, `scoringLogic`, etc.)
    const raw = {
      "@context": "sevo://v1",
      "@type": "Benchmark",
      "@id": "bench-partial",
      timestamp: new Date().toISOString(),
      version: 1,
      // deliberately omitting: task, scoringLogic, difficulty, passThreshold
    };
    const result = s.validateNodeWithSchema(raw);
    if (!result.ok && result.error.code === "SCHEMA_VIOLATION") correct++;
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
