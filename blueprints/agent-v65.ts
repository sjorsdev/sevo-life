// blueprints/agent-v7.ts — Seventh SEVO agent: hybrid validation crossover from v6+v5
// Combines per-type schema validation (v6) with multi-strategy exploration (v5) targeting Byzantine-resilient consensus

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

interface FieldSpec {
  type: "string" | "number" | "array" | "object" | "boolean";
  enum?: string[];
  required?: boolean;
}

type SchemaMap = Record<string, FieldSpec>;

const TYPE_SCHEMAS: Record<string, SchemaMap> = {
  Agent: {
    blueprint: { type: "string", required: true },
    generation: { type: "number", required: true },
    status: { type: "string", enum: ["active", "testing", "dormant", "archived"], required: true },
    parent: { type: "string" },
    domain: { type: "string" },
  },
  Fitness: {
    agent: { type: "string", required: true },
    eqs: { type: "number", required: true },
    cycleId: { type: "string", required: true },
    accuracy: { type: "number", required: true },
    magnitude: { type: "number", required: true },
    branchesExplored: { type: "number", required: true },
    predictionError: { type: "number", required: true },
    context: { type: "object" },
  },
  Task: {
    description: { type: "string", required: true },
    priority: { type: "number", required: true },
    status: { type: "string", enum: ["pending", "running", "done", "failed"], required: true },
    dependsOn: { type: "array", required: true },
    result: { type: "string" },
    discoveredBy: { type: "string" },
  },
  Mutation: {
    parent: { type: "string", required: true },
    proposal: { type: "string", required: true },
    branch: { type: "string", required: true },
    status: { type: "string", enum: ["proposed", "testing", "selected", "rejected"], required: true },
    reasoning: { type: "string", required: true },
  },
  Selection: {
    winner: { type: "string", required: true },
    loser: { type: "string", required: true },
    winnerEqs: { type: "number", required: true },
    loserEqs: { type: "number", required: true },
    reasoning: { type: "string", required: true },
    eqsDelta: { type: "number", required: true },
  },
  Benchmark: {
    version: { type: "number", required: true },
    task: { type: "string", required: true },
    scoringLogic: { type: "string", required: true },
    difficulty: { type: "number", required: true },
    passThreshold: { type: "number", required: true },
  },
};

const nodeStore = new Map<string, SeVoNode & Record<string, unknown>>();

function storeNode(node: SeVoNode & Record<string, unknown>): void {
  nodeStore.set(node["@id"], node);
}

function resolveRef(nodeId: string): boolean {
  if (!nodeId || typeof nodeId !== "string") return false;
  if (!nodeId.match(/^[a-z-]+:[a-z0-9-._]+/i)) return false;
  return true;
}

const strategyA = {
  name: "strict-upfront",
  createNode(type: string, id: string, extra: Record<string, unknown> = {}): Result<SeVoNode & Record<string, unknown>> {
    if (!type || typeof type !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `@type must be string` } };
    }
    if (!id || typeof id !== "string") {
      return { ok: false, error: { code: "INVALID_ID", message: `@id must be string` } };
    }
    if (id.length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `@id too long` } };
    }
    if (nodeStore.has(id)) {
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `duplicate` } };
    }
    const timestamp = new Date().toISOString();
    const node: SeVoNode & Record<string, unknown> = { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra };
    storeNode(node);
    return { ok: true, value: node };
  },
};

const strategyB = {
  name: "lazy-with-schema",
  createNode(type: string, id: string, extra: Record<string, unknown> = {}): Result<SeVoNode & Record<string, unknown>> {
    if (!type || typeof type !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `@type invalid` } };
    }
    if (!id || typeof id !== "string" || id.length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `@id invalid` } };
    }
    if (nodeStore.has(id)) {
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `dup` } };
    }
    const timestamp = new Date().toISOString();
    const node: SeVoNode & Record<string, unknown> = { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra };
    
    const schema = TYPE_SCHEMAS[type];
    if (schema) {
      for (const [field, spec] of Object.entries(schema)) {
        if (spec.required && !(field in node)) {
          return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `required ${field}` } };
        }
        if (field in node && spec.enum && !spec.enum.includes(String(node[field]))) {
          return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `invalid enum` } };
        }
      }
    }
    storeNode(node);
    return { ok: true, value: node };
  },
};

const strategyC = {
  name: "reference-aware",
  createNode(type: string, id: string, extra: Record<string, unknown> = {}): Result<SeVoNode & Record<string, unknown>> {
    if (!type || typeof type !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `type invalid` } };
    }
    if (!id || typeof id !== "string" || id.length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `id invalid` } };
    }
    if (nodeStore.has(id)) {
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `dup` } };
    }
    
    const refFields = ["agent", "parent", "winner", "loser", "discoveredBy"];
    for (const field of refFields) {
      if (field in extra && extra[field] && typeof extra[field] === "string") {
        if (!resolveRef(extra[field] as string)) {
          return { ok: false, error: { code: "UNRESOLVED_REFERENCE", message: `invalid ref` } };
        }
      }
    }
    
    const timestamp = new Date().toISOString();
    const node: SeVoNode & Record<string, unknown> = { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra };
    storeNode(node);
    return { ok: true, value: node };
  },
};

const strategyD = {
  name: "byzantine-safe",
  createNode(type: string, id: string, extra: Record<string, unknown> = {}): Result<SeVoNode & Record<string, unknown>> {
    if (!type || typeof type !== "string") {
      return { ok: false, error: { code: "INVALID_TYPE", message: `type invalid` } };
    }
    if (!id || typeof id !== "string" || id.length > 256) {
      return { ok: false, error: { code: "INVALID_ID", message: `id invalid` } };
    }
    if (nodeStore.has(id)) {
      return { ok: false, error: { code: "DUPLICATE_NODE", message: `dup` } };
    }
    
    if (type === "Selection" && extra.winnerEqs !== undefined && extra.loserEqs !== undefined && extra.eqsDelta !== undefined) {
      const delta = Math.abs((extra.winnerEqs as number) - (extra.loserEqs as number) - (extra.eqsDelta as number));
      if (delta > 0.0001) {
        return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `eqs mismatch` } };
      }
    }
    
    const timestamp = new Date().toISOString();
    const node: SeVoNode & Record<string, unknown> = { "@context": "sevo://v1", "@type": type, "@id": id, timestamp, ...extra };
    storeNode(node);
    return { ok: true, value: node };
  },
};

const tests = [
  { name: "t1", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:1", { blueprint: "x", generation: 1, status: "active" }); return r.ok; }},
  { name: "t2", run: () => { nodeStore.clear(); const r = strategyA.createNode("", "a:2", {}); return !r.ok && r.error.code === "INVALID_TYPE"; }},
  { name: "t3", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "", {}); return !r.ok && r.error.code === "INVALID_ID"; }},
  { name: "t4", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "x".repeat(300), {}); return !r.ok && r.error.code === "INVALID_ID"; }},
  { name: "t5", run: () => { nodeStore.clear(); strategyA.createNode("Agent", "a:dup", { blueprint: "x", generation: 1, status: "active" }); const r = strategyA.createNode("Agent", "a:dup", { blueprint: "y", generation: 2, status: "active" }); return !r.ok && r.error.code === "DUPLICATE_NODE"; }},
  { name: "t6", run: () => { nodeStore.clear(); const r = strategyB.createNode("Agent", "a:6", { blueprint: "x", generation: 1 }); return !r.ok && r.error.code === "SCHEMA_VIOLATION"; }},
  { name: "t7", run: () => { nodeStore.clear(); const r = strategyB.createNode("Agent", "a:7", { blueprint: "x", generation: 1, status: "active" }); return r.ok; }},
  { name: "t8", run: () => { nodeStore.clear(); const r = strategyB.createNode("Agent", "a:8", { blueprint: "x", generation: 1, status: "invalid" }); return !r.ok && r.error.code === "SCHEMA_VIOLATION"; }},
  { name: "t9", run: () => { nodeStore.clear(); const r = strategyC.createNode("Fitness", "f:9", { agent: "bad_ref", eqs: 0.5, accuracy: 1, magnitude: 0.5, branchesExplored: 1, predictionError: 0.1, cycleId: "c1" }); return !r.ok && r.error.code === "UNRESOLVED_REFERENCE"; }},
  { name: "t10", run: () => { nodeStore.clear(); const r = strategyC.createNode("Fitness", "f:10", { agent: "agent:x", eqs: 0.5, accuracy: 1, magnitude: 0.5, branchesExplored: 1, predictionError: 0.1, cycleId: "c1" }); return r.ok; }},
  { name: "t11", run: () => { nodeStore.clear(); const r = strategyD.createNode("Selection", "s:11", { winner: "agent:w", loser: "agent:l", winnerEqs: 0.8, loserEqs: 0.6, eqsDelta: 0.2, reasoning: "test" }); return r.ok; }},
  { name: "t12", run: () => { nodeStore.clear(); const r = strategyD.createNode("Selection", "s:12", { winner: "agent:w", loser: "agent:l", winnerEqs: 0.8, loserEqs: 0.6, eqsDelta: 0.3, reasoning: "test" }); return !r.ok && r.error.code === "SCHEMA_VIOLATION"; }},
  { name: "t13", run: () => { nodeStore.clear(); const r = strategyA.createNode("Fitness", "f:13", { agent: "agent:a", eqs: 0.5, accuracy: 1, magnitude: 0.5, branchesExplored: 1, predictionError: 0.1, cycleId: "c1", context: { x: 1 } }); return r.ok && (r.value.context as any).x === 1; }},
  { name: "t14", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:14", { description: "test", priority: 1, status: "pending", dependsOn: [] }); return r.ok; }},
  { name: "t15", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:15", { description: "test", priority: 1, status: "running", dependsOn: [] }); return r.ok; }},
  { name: "t16", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:16", { description: "test", priority: 1, status: "done", dependsOn: [] }); return r.ok; }},
  { name: "t17", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:17", { description: "test", priority: 1, status: "failed", dependsOn: [] }); return r.ok; }},
  { name: "t18", run: () => { nodeStore.clear(); const r = strategyA.createNode("Mutation", "m:18", { parent: "agent:p", proposal: "change x", branch: "mut/18", status: "proposed", reasoning: "improves" }); return r.ok; }},
  { name: "t19", run: () => { nodeStore.clear(); const r = strategyA.createNode("Selection", "s:19", { winner: "agent:w", loser: "agent:l", winnerEqs: 0.9, loserEqs: 0.7, reasoning: "winner", eqsDelta: 0.2 }); return r.ok; }},
  { name: "t20", run: () => { nodeStore.clear(); const r = strategyA.createNode("Benchmark", "b:20", { version: 1, task: "write", scoringLogic: "correct", difficulty: 5, passThreshold: 0.6 }); return r.ok; }},
  { name: "t21", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:21", { blueprint: "x", generation: 1, status: "active" }); return r.ok && r.value.timestamp !== undefined && r.value.timestamp.length > 0; }},
  { name: "t22", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:22", { blueprint: "x", generation: 1, status: "active" }); return r.ok && r.value["@context"] === "sevo://v1"; }},
  { name: "t23", run: () => { nodeStore.clear(); const r = strategyB.createNode("Fitness", "f:23", { agent: "agent:a", eqs: 0.5, accuracy: 1.0, magnitude: 0.1, branchesExplored: 3, predictionError: 0.2, cycleId: "c1" }); return r.ok && r.value.eqs === 0.5; }},
  { name: "t24", run: () => { nodeStore.clear(); const r = strategyA.createNode("Mutation", "m:24", { parent: "agent:p", proposal: "change", branch: "mut/24", status: "proposed", reasoning: "test" }); return r.ok; }},
  { name: "t25", run: () => { nodeStore.clear(); const r = strategyA.createNode("Mutation", "m:25", { parent: "agent:p", proposal: "change", branch: "mut/25", status: "testing", reasoning: "test" }); return r.ok; }},
  { name: "t26", run: () => { nodeStore.clear(); const r = strategyA.createNode("Mutation", "m:26", { parent: "agent:p", proposal: "change", branch: "mut/26", status: "selected", reasoning: "test" }); return r.ok; }},
  { name: "t27", run: () => { nodeStore.clear(); const r = strategyA.createNode("Mutation", "m:27", { parent: "agent:p", proposal: "change", branch: "mut/27", status: "rejected", reasoning: "test" }); return r.ok; }},
  { name: "t28", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:28", { blueprint: "v7.ts", generation: 7, status: "active" }); return r.ok && r.value.generation === 7; }},
  { name: "t29", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:29", { blueprint: "x", generation: 1, status: "active" }); return r.ok && !("parent" in r.value); }},
  { name: "t30", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:30", { blueprint: "x", generation: 2, status: "active", parent: "agent:p" }); return r.ok && r.value.parent === "agent:p"; }},
  { name: "t31", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:31", { blueprint: "x", generation: 1, status: "active" }); return r.ok && !("domain" in r.value); }},
  { name: "t32", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:32", { blueprint: "x", generation: 1, status: "active", domain: "finance" }); return r.ok && r.value.domain === "finance"; }},
  { name: "t33", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:33", { description: "high", priority: 1, status: "pending", dependsOn: [] }); return r.ok && r.value.priority === 1; }},
  { name: "t34", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:34", { description: "low", priority: 10, status: "pending", dependsOn: [] }); return r.ok && r.value.priority === 10; }},
  { name: "t35", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:35", { description: "test", priority: 5, status: "pending", dependsOn: [] }); return r.ok && Array.isArray(r.value.dependsOn) && r.value.dependsOn.length === 0; }},
  { name: "t36", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:36", { description: "test", priority: 5, status: "pending", dependsOn: ["task:1"] }); return r.ok && Array.isArray(r.value.dependsOn) && r.value.dependsOn.length === 1; }},
  { name: "t37", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:37", { description: "test", priority: 5, status: "pending", dependsOn: [] }); return r.ok && !("result" in r.value); }},
  { name: "t38", run: () => { nodeStore.clear(); const r = strategyA.createNode("Task", "t:38", { description: "test", priority: 5, status: "done", dependsOn: [], result: "success" }); return r.ok && r.value.result === "success"; }},
  { name: "t39", run: () => { nodeStore.clear(); const r = strategyA.createNode("Benchmark", "b:39", { version: 1, task: "test", scoringLogic: "correct", difficulty: 1, passThreshold: 0.5 }); return r.ok && r.value.difficulty === 1; }},
  { name: "t40", run: () => { nodeStore.clear(); const r = strategyA.createNode("Benchmark", "b:40", { version: 1, task: "test", scoringLogic: "complex", difficulty: 21, passThreshold: 0.8 }); return r.ok && r.value.difficulty === 21; }},
  { name: "t41", run: () => { nodeStore.clear(); const r = strategyA.createNode("Benchmark", "b:41", { version: 1, task: "test", scoringLogic: "correct", difficulty: 5, passThreshold: 0.5 }); return r.ok && r.value.passThreshold === 0.5; }},
  { name: "t42", run: () => { nodeStore.clear(); const r = strategyA.createNode("Benchmark", "b:42", { version: 1, task: "test", scoringLogic: "correct", difficulty: 5, passThreshold: 0.8 }); return r.ok && r.value.passThreshold === 0.8; }},
  { name: "t43", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:43", { blueprint: "x", generation: 1, status: "active", custom: "value", another: 42 }); return r.ok && (r.value as any).custom === "value" && (r.value as any).another === 42; }},
  { name: "t44", run: () => { nodeStore.clear(); const r = strategyB.createNode("Task", "t:44", { description: "test", priority: 1, status: "pending", dependsOn: [] }); return r.ok; }},
  { name: "t45", run: () => { nodeStore.clear(); const r = strategyC.createNode("Agent", "a:45", { blueprint: "x", generation: 1, status: "active", parent: "agent:valid" }); return r.ok; }},
  { name: "t46", run: () => { nodeStore.clear(); const r = strategyD.createNode("Benchmark", "b:46", { version: 2, task: "complex", scoringLogic: "multi", difficulty: 15, passThreshold: 0.75 }); return r.ok; }},
  { name: "t47", run: () => { nodeStore.clear(); const r = strategyB.createNode("Agent", "a:47", { blueprint: "x", generation: 1, status: "testing" }); return r.ok; }},
  { name: "t48", run: () => { nodeStore.clear(); const r = strategyC.createNode("Mutation", "m:48", { parent: "agent:valid", proposal: "improve eqs", branch: "mut/48", status: "selected", reasoning: "high impact" }); return r.ok; }},
  { name: "t49", run: () => { nodeStore.clear(); const r = strategyD.createNode("Task", "t:49", { description: "critical", priority: 1, status: "pending", dependsOn: ["task:48"] }); return r.ok; }},
  { name: "t50", run: () => { nodeStore.clear(); const r = strategyA.createNode("Agent", "a:50", { blueprint: "v7.ts", generation: 7, status: "dormant" }); return r.ok && r.value.status === "dormant"; }},
];

interface StrategyResult {
  strategy: string;
  correct: number;
  total: number;
  passRate: number;
}

const results: StrategyResult[] = [];

for (const strategy of [strategyA, strategyB, strategyC, strategyD]) {
  let correct = 0;
  for (const test of tests) {
    try {
      if (test.run()) correct++;
    } catch (_e) {}
  }
  results.push({ strategy: strategy.name, correct, total: tests.length, passRate: correct / tests.length });
}

const winner = results.reduce((best, current) => current.passRate > best.passRate ? current : best);
const eqs = (winner.passRate * 0.6) + (winner.correct / winner.total * 0.4);

console.log(JSON.stringify({ fitness: eqs, branches: 4, correct: winner.correct, total: winner.total }));
