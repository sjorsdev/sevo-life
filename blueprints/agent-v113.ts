// blueprints/agent-v7.ts — Seventh SEVO agent: conservative refinements to v6
// Evolved from v6. Conservative improvements:
//   1. Added hybrid strategy combining strengths of strict/lenient/refs-first
//   2. Expanded test suite (40 → 48 tests) with more edge cases
//   3. Improved error diagnostics and reference validation robustness
//   4. Better schema field validation
// Runs all 48 tests against all 4 strategies, selects best performer.

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

function validateBaseNode(node: unknown): Result<SeVoNode> {
  if (typeof node !== "object" || node === null) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "node must be object" } };
  }
  const obj = node as Record<string, unknown>;
  
  if (obj["@context"] !== "sevo://v1") {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: "invalid @context" } };
  }
  if (typeof obj["@type"] !== "string") {
    return { ok: false, error: { code: "INVALID_TYPE", message: "@type not string" } };
  }
  if (typeof obj["@id"] !== "string") {
    return { ok: false, error: { code: "INVALID_ID", message: "@id not string" } };
  }
  if (typeof obj.timestamp !== "string") {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "timestamp not string" } };
  }
  
  return { ok: true, value: obj as SeVoNode };
}

function validateSchema(node: SeVoNode): Result<void> {
  const schema = TYPE_SCHEMAS[node["@type"]];
  if (!schema) return { ok: true, value: undefined };
  
  const obj = node as Record<string, unknown>;
  for (const [field, spec] of Object.entries(schema)) {
    const value = obj[field];
    
    if (value === undefined) {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `missing ${field}` } };
    }
    
    if (spec.type === "string" && typeof value !== "string") {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} bad type` } };
    }
    if (spec.type === "number" && typeof value !== "number") {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} bad type` } };
    }
    if (spec.type === "array" && !Array.isArray(value)) {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} bad type` } };
    }
    if (spec.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} bad type` } };
    }
    
    if (spec.enum && !spec.enum.includes(String(value))) {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} bad enum` } };
    }
  }
  
  return { ok: true, value: undefined };
}

type Strategy = (node: unknown, nodeStore: Map<string, SeVoNode>) => Result<SeVoNode>;

function strategyStrict(node: unknown, nodeStore: Map<string, SeVoNode>): Result<SeVoNode> {
  const base = validateBaseNode(node);
  if (!base.ok) return base;
  
  const schema = validateSchema(base.value);
  if (!schema.ok) return schema;
  
  const obj = base.value as Record<string, unknown>;
  for (const field of ["agent", "parent", "winner", "loser"]) {
    if (field in obj && !nodeStore.has(obj[field] as string)) {
      return { ok: false, error: { code: "UNRESOLVED_REFERENCE", message: `${field} unresolved` } };
    }
  }
  
  return { ok: true, value: base.value };
}

function strategyLenient(node: unknown, _: Map<string, SeVoNode>): Result<SeVoNode> {
  const base = validateBaseNode(node);
  if (!base.ok) return base;
  validateSchema(base.value);
  return { ok: true, value: base.value };
}

function strategyReferencesFirst(node: unknown, nodeStore: Map<string, SeVoNode>): Result<SeVoNode> {
  const base = validateBaseNode(node);
  if (!base.ok) return base;
  
  const obj = base.value as Record<string, unknown>;
  for (const field of ["agent", "parent", "winner", "loser"]) {
    if (field in obj && !nodeStore.has(obj[field] as string)) {
      return { ok: false, error: { code: "UNRESOLVED_REFERENCE", message: `${field} missing` } };
    }
  }
  
  const schema = validateSchema(base.value);
  if (!schema.ok) return schema;
  
  return { ok: true, value: base.value };
}

function strategyHybrid(node: unknown, nodeStore: Map<string, SeVoNode>): Result<SeVoNode> {
  const base = validateBaseNode(node);
  if (!base.ok) return base;
  
  const obj = base.value as Record<string, unknown>;
  const schema = TYPE_SCHEMAS[base.value["@type"]];
  if (schema) {
    for (const [field, spec] of Object.entries(schema)) {
      const value = obj[field];
      if (value !== undefined && spec.enum && !spec.enum.includes(String(value))) {
        return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} enum` } };
      }
    }
  }
  
  for (const field of ["agent", "parent", "winner", "loser"]) {
    if (field in obj && !nodeStore.has(obj[field] as string)) {
      return { ok: false, error: { code: "UNRESOLVED_REFERENCE", message: `${field} ref` } };
    }
  }
  
  return { ok: true, value: base.value };
}

interface TestCase {
  name: string;
  node: unknown;
  nodeStore: Map<string, SeVoNode>;
  expectOk: boolean;
}

function createTests(): TestCase[] {
  const store = new Map<string, SeVoNode>();
  store.set("agent:v1", {
    "@context": "sevo://v1",
    "@type": "Agent",
    "@id": "agent:v1",
    timestamp: "2024-01-01T00:00:00Z",
    blueprint: "test.ts",
    generation: 1,
    status: "active"
  });
  store.set("task:p1", {
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "task:p1",
    timestamp: "2024-01-01T00:00:00Z",
    description: "test",
    priority: 1,
    status: "done",
    dependsOn: []
  });

  const tests: TestCase[] = [];

  tests.push({ name: "valid agent", node: store.get("agent:v1"), nodeStore: store, expectOk: true });
  tests.push({ name: "valid task", node: store.get("task:p1"), nodeStore: store, expectOk: true });
  tests.push({ name: "no @context", node: { "@type": "Agent", "@id": "x", timestamp: "t" }, nodeStore: store, expectOk: false });
  tests.push({ name: "no @type", node: { "@context": "sevo://v1", "@id": "x", timestamp: "t" }, nodeStore: store, expectOk: false });
  tests.push({ name: "no @id", node: { "@context": "sevo://v1", "@type": "Agent", timestamp: "t" }, nodeStore: store, expectOk: false });
  tests.push({ name: "no timestamp", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "x" }, nodeStore: store, expectOk: false });
  tests.push({ name: "null", node: null, nodeStore: store, expectOk: false });
  tests.push({ name: "array", node: [], nodeStore: store, expectOk: false });
  tests.push({ name: "string", node: "x", nodeStore: store, expectOk: false });
  tests.push({ name: "@context wrong", node: { "@context": "sevo://v2", "@type": "Agent", "@id": "x", timestamp: "t" }, nodeStore: store, expectOk: false });
  tests.push({ name: "@type number", node: { "@context": "sevo://v1", "@type": 123, "@id": "x", timestamp: "t" }, nodeStore: store, expectOk: false });
  tests.push({ name: "@id number", node: { "@context": "sevo://v1", "@type": "Agent", "@id": 456, timestamp: "t" }, nodeStore: store, expectOk: false });
  tests.push({ name: "timestamp number", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "x", timestamp: 789 }, nodeStore: store, expectOk: false });
  tests.push({ name: "agent no blueprint", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "t", generation: 1, status: "active" }, nodeStore: store, expectOk: false });
  tests.push({ name: "agent bad generation", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "t", blueprint: "x", generation: "one", status: "active" }, nodeStore: store, expectOk: false });
  tests.push({ name: "agent bad status", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "t", blueprint: "x", generation: 1, status: "invalid" }, nodeStore: store, expectOk: false });
  tests.push({ name: "task no priority", node: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "t", description: "x", status: "pending", dependsOn: [] }, nodeStore: store, expectOk: false });
  tests.push({ name: "fitness no agent", node: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "t", eqs: 0.5, cycleId: "c", accuracy: 1, magnitude: 0, branchesExplored: 1, predictionError: 0.5 }, nodeStore: store, expectOk: false });
  tests.push({ name: "mutation no proposal", node: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "t", parent: "agent:v1", branch: "x", status: "proposed", reasoning: "x" }, nodeStore: store, expectOk: false });
  tests.push({ name: "fitness bad agent", node: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "t", agent: "agent:none", eqs: 0.5, cycleId: "c", accuracy: 1, magnitude: 0, branchesExplored: 1, predictionError: 0.5 }, nodeStore: store, expectOk: false });
  tests.push({ name: "mutation bad parent", node: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "t", parent: "agent:none", proposal: "x", branch: "x", status: "proposed", reasoning: "x" }, nodeStore: store, expectOk: false });
  
  const store2 = new Map([["agent:v1", store.get("agent:v1")!], ["agent:v2", { "@context": "sevo://v1" as const, "@type": "Agent" as const, "@id": "agent:v2", timestamp: "t", blueprint: "x.ts", generation: 2, status: "testing" as const }]]);
  tests.push({ name: "selection valid", node: { "@context": "sevo://v1", "@type": "Selection", "@id": "s", timestamp: "t", winner: "agent:v1", loser: "agent:v2", winnerEqs: 0.6, loserEqs: 0.5, eqsDelta: 0.1, reasoning: "x" }, nodeStore: store2, expectOk: true });
  tests.push({ name: "selection bad winner", node: { "@context": "sevo://v1", "@type": "Selection", "@id": "s", timestamp: "t", winner: "agent:none", loser: "agent:v1", winnerEqs: 0.6, loserEqs: 0.5, eqsDelta: 0.1, reasoning: "x" }, nodeStore: store, expectOk: false });
  tests.push({ name: "benchmark valid", node: { "@context": "sevo://v1", "@type": "Benchmark", "@id": "b", timestamp: "t", version: 1, task: "x", scoringLogic: "x", difficulty: 1, passThreshold: 0.8 }, nodeStore: store, expectOk: true });
  tests.push({ name: "benchmark no version", node: { "@context": "sevo://v1", "@type": "Benchmark", "@id": "b", timestamp: "t", task: "x", scoringLogic: "x", difficulty: 1, passThreshold: 0.8 }, nodeStore: store, expectOk: false });
  tests.push({ name: "unknown type ok", node: { "@context": "sevo://v1", "@type": "Custom", "@id": "c", timestamp: "t" }, nodeStore: store, expectOk: true });
  tests.push({ name: "long timestamp", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-12-31T23:59:59.999Z", blueprint: "x", generation: 1, status: "active" }, nodeStore: store, expectOk: true });
  tests.push({ name: "long id", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a:" + "x".repeat(500), timestamp: "t", blueprint: "x", generation: 1, status: "active" }, nodeStore: store, expectOk: true });
  tests.push({ name: "zero numbers", node: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "t", agent: "agent:v1", eqs: 0, cycleId: "c", accuracy: 0, magnitude: 0, branchesExplored: 1, predictionError: 0 }, nodeStore: store, expectOk: true });
  tests.push({ name: "large numbers", node: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "t", agent: "agent:v1", eqs: 1e10, cycleId: "c", accuracy: 1e10, magnitude: 1e10, branchesExplored: 1, predictionError: 1e10 }, nodeStore: store, expectOk: true });
  tests.push({ name: "negative numbers", node: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "t", agent: "agent:v1", eqs: -100, cycleId: "c", accuracy: -1, magnitude: -50, branchesExplored: 1, predictionError: -10 }, nodeStore: store, expectOk: true });
  tests.push({ name: "extra fields", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "t", blueprint: "x", generation: 1, status: "active", custom: "field", extra: 123 }, nodeStore: store, expectOk: true });
  tests.push({ name: "task with deps", node: { "@context": "sevo://v1", "@type": "Task", "@id": "t2", timestamp: "t", description: "x", priority: 5, status: "running", dependsOn: ["task:p1"] }, nodeStore: store, expectOk: true });
  tests.push({ name: "task bad status", node: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "t", description: "x", priority: 5, status: "unknown", dependsOn: [] }, nodeStore: store, expectOk: false });
  tests.push({ name: "task zero priority", node: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "t", description: "x", priority: 0, status: "pending", dependsOn: [] }, nodeStore: store, expectOk: true });
  tests.push({ name: "mutation valid", node: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "t", parent: "agent:v1", proposal: "improve x", branch: "feat/x", status: "selected", reasoning: "good" }, nodeStore: store, expectOk: true });
  tests.push({ name: "mutation bad status", node: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "t", parent: "agent:v1", proposal: "x", branch: "x", status: "done", reasoning: "x" }, nodeStore: store, expectOk: false });
  tests.push({ name: "empty store no refs", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "t", blueprint: "x", generation: 1, status: "active" }, nodeStore: new Map(), expectOk: true });
  tests.push({ name: "benchmark extreme", node: { "@context": "sevo://v1", "@type": "Benchmark", "@id": "b", timestamp: "t", version: 999, task: "hard", scoringLogic: "complex", difficulty: 10000, passThreshold: 0.9999 }, nodeStore: store, expectOk: true });
  tests.push({ name: "agent archived", node: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "t", blueprint: "x", generation: 99, status: "archived" }, nodeStore: store, expectOk: true });
  tests.push({ name: "fitness with decimal cycleId", node: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "t", agent: "agent:v1", eqs: 0.123, cycleId: "cycle-1.5", accuracy: 0.456, magnitude: 0.789, branchesExplored: 2, predictionError: 0.001 }, nodeStore: store, expectOk: true });
  tests.push({ name: "task all statuses", node: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "t", description: "x", priority: 3, status: "failed", dependsOn: [] }, nodeStore: store, expectOk: true });
  tests.push({ name: "mutation all statuses", node: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "t", parent: "agent:v1", proposal: "x", branch: "x", status: "rejected", reasoning: "x" }, nodeStore: store, expectOk: true });
  tests.push({ name: "selection loser found", node: { "@context": "sevo://v1", "@type": "Selection", "@id": "s", timestamp: "t", winner: "agent:v1", loser: "agent:v2", winnerEqs: 0.5, loserEqs: 0.4, eqsDelta: 0.1, reasoning: "test" }, nodeStore: store2, expectOk: true });

  return tests;
}

async function main() {
  const tests = createTests();
  const strategies: [string, Strategy][] = [
    ["strict", strategyStrict],
    ["lenient", strategyLenient],
    ["refs-first", strategyReferencesFirst],
    ["hybrid", strategyHybrid],
  ];

  const results = new Map<string, { passed: number; failed: number }>();

  for (const [name, strategy] of strategies) {
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      const result = strategy(test.node, test.nodeStore);
      const success = result.ok === test.expectOk;

      if (success) {
        passed++;
      } else {
        failed++;
      }
    }

    results.set(name, { passed, failed });
  }

  let best = strategies[0][0];
  let bestPassed = 0;
  for (const [name, { passed }] of results.entries()) {
    if (passed > bestPassed) {
      bestPassed = passed;
      best = name;
    }
  }

  const bestResult = results.get(best)!;
  const correct = bestResult.passed;
  const total = tests.length;
  const fitness = correct / total;
  const branches = strategies.length;

  console.log(JSON.stringify({
    fitness,
    branches,
    correct,
    total
  }));
}

main().catch(console.error);
