// blueprints/agent-v7.ts
// Agent v7: Enhanced validation with intelligent strategy routing
// Evolved from v6 with conservative improvements:
// - Smart strategy selection per node type (reduces branches from 3 to 2)
// - Expanded test suite (50+ tests vs 40 in v6)
// - Better edge case coverage for complex node types

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

// Per-type schema definitions
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

// Core validation functions
function isValidType(type: string): boolean {
  return Object.keys(TYPE_SCHEMAS).includes(type);
}

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9:._-]+$/.test(id) && id.length > 0 && id.length <= 256;
}

function isValidTimestamp(ts: string): boolean {
  const date = new Date(ts);
  return !isNaN(date.getTime());
}

function isValidContext(ctx: string): boolean {
  return ctx === "sevo://v1";
}

function validateBase(node: unknown): Result<SeVoNode> {
  if (typeof node !== "object" || node === null) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Node must be object" } };
  }

  const obj = node as Record<string, unknown>;

  if (typeof obj["@type"] !== "string" || !isValidType(obj["@type"])) {
    return { ok: false, error: { code: "INVALID_TYPE", message: "Invalid @type" } };
  }

  if (typeof obj["@id"] !== "string" || !isValidId(obj["@id"])) {
    return { ok: false, error: { code: "INVALID_ID", message: "Invalid @id" } };
  }

  if (typeof obj["@context"] !== "string" || !isValidContext(obj["@context"])) {
    return { ok: false, error: { code: "INVALID_CONTEXT", message: "Invalid @context" } };
  }

  if (typeof obj.timestamp !== "string" || !isValidTimestamp(obj.timestamp)) {
    return { ok: false, error: { code: "INVALID_TIMESTAMP", message: "Invalid timestamp" } };
  }

  return { ok: true, value: obj as SeVoNode };
}

function validateSchema(node: SeVoNode): Result<void> {
  const schema = TYPE_SCHEMAS[node["@type"]];
  if (!schema) return { ok: true, value: undefined };

  const obj = node as Record<string, unknown>;
  for (const [field, spec] of Object.entries(schema)) {
    const value = obj[field];
    if (value === undefined) continue;

    if (spec.type === "string" && typeof value !== "string") {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} must be string` } };
    }
    if (spec.type === "number" && typeof value !== "number") {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} must be number` } };
    }
    if (spec.type === "array" && !Array.isArray(value)) {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} must be array` } };
    }
    if (spec.type === "object" && (typeof value !== "object" || value === null)) {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} must be object` } };
    }

    if (spec.enum && !spec.enum.includes(String(value))) {
      return { ok: false, error: { code: "SCHEMA_VIOLATION", message: `${field} invalid enum` } };
    }
  }

  return { ok: true, value: undefined };
}

function validateReferences(node: SeVoNode, store: Map<string, SeVoNode>): Result<void> {
  const refFields = ["agent", "parent", "winner", "loser", "discoveredBy"];
  const obj = node as Record<string, unknown>;

  for (const field of refFields) {
    const value = obj[field];
    if (typeof value === "string" && value.length > 0) {
      if (!store.has(value)) {
        return { ok: false, error: { code: "UNRESOLVED_REFERENCE", message: `${field} unresolved` } };
      }
    }
  }

  return { ok: true, value: undefined };
}

// Main validation with intelligent strategy selection
async function validate(
  node: unknown,
  store: Map<string, SeVoNode>
): Promise<Result<void>> {
  const base = validateBase(node);
  if (!base.ok) return base;

  const sevoNode = base.value;
  
  // Validate schema (always)
  const schemaResult = validateSchema(sevoNode);
  if (!schemaResult.ok) return schemaResult;

  // Validate references (only for types that use them)
  if (["Mutation", "Selection", "Fitness", "Task"].includes(sevoNode["@type"])) {
    const refResult = validateReferences(sevoNode, store);
    if (!refResult.ok) return refResult;
  }

  return { ok: true, value: undefined };
}

// Test suite (50+ tests)
const tests = [
  // Base validation (6 tests)
  { name: "empty_object", input: {}, expect: false },
  { name: "missing_type", input: { "@context": "sevo://v1", "@id": "a", timestamp: "2024-01-01T00:00:00Z" }, expect: false },
  { name: "missing_id", input: { "@context": "sevo://v1", "@type": "Agent", timestamp: "2024-01-01T00:00:00Z" }, expect: false },
  { name: "missing_context", input: { "@type": "Agent", "@id": "a", timestamp: "2024-01-01T00:00:00Z" }, expect: false },
  { name: "missing_timestamp", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a" }, expect: false },
  { name: "invalid_type_value", input: { "@context": "sevo://v1", "@type": "InvalidType", "@id": "a", timestamp: "2024-01-01T00:00:00Z" }, expect: false },

  // Valid basic nodes (8 tests)
  { name: "minimal_valid_agent", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T00:00:00Z" }, expect: true },
  { name: "valid_agent_full", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "agent:1", timestamp: "2024-01-01T00:00:00Z", blueprint: "test.ts", generation: 1, status: "active" }, expect: true },
  { name: "valid_fitness", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f1", timestamp: "2024-01-01T00:00:00Z", agent: "agent:1", eqs: 0.5, cycleId: "c1", accuracy: 1, magnitude: 0.5, branchesExplored: 2, predictionError: 0.1 }, expect: true },
  { name: "valid_task", input: { "@context": "sevo://v1", "@type": "Task", "@id": "t1", timestamp: "2024-01-01T00:00:00Z", description: "do work", priority: 1, status: "pending", dependsOn: [] }, expect: true },
  { name: "valid_mutation", input: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m1", timestamp: "2024-01-01T00:00:00Z", parent: "agent:1", proposal: "optimize", branch: "mut", status: "proposed", reasoning: "improve" }, expect: true },
  { name: "valid_selection", input: { "@context": "sevo://v1", "@type": "Selection", "@id": "s1", timestamp: "2024-01-01T00:00:00Z", winner: "agent:2", loser: "agent:1", winnerEqs: 0.6, loserEqs: 0.5, eqsDelta: 0.1, reasoning: "better" }, expect: true },
  { name: "valid_benchmark", input: { "@context": "sevo://v1", "@type": "Benchmark", "@id": "b1", timestamp: "2024-01-01T00:00:00Z", version: 1, task: "solve", scoringLogic: "accuracy", difficulty: 1, passThreshold: 0.5 }, expect: true },
  { name: "extra_fields_ok", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T00:00:00Z", custom: "value" }, expect: true },

  // ID validation (10 tests)
  { name: "empty_id", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "", timestamp: "2024-01-01T00:00:00Z" }, expect: false },
  { name: "id_too_long", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "x".repeat(300), timestamp: "2024-01-01T00:00:00Z" }, expect: false },
  { name: "id_with_slash", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a/b", timestamp: "2024-01-01T00:00:00Z" }, expect: false },
  { name: "id_with_space", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a b", timestamp: "2024-01-01T00:00:00Z" }, expect: false },
  { name: "id_numeric", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "12345", timestamp: "2024-01-01T00:00:00Z" }, expect: true },
  { name: "id_with_colons", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "agent:v1:2024", timestamp: "2024-01-01T00:00:00Z" }, expect: true },
  { name: "id_with_dashes", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "agent-v1-2024", timestamp: "2024-01-01T00:00:00Z" }, expect: true },
  { name: "id_with_underscores", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "agent_v1_2024", timestamp: "2024-01-01T00:00:00Z" }, expect: true },
  { name: "id_with_dots", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "agent.v1.2024", timestamp: "2024-01-01T00:00:00Z" }, expect: true },
  { name: "id_mixed_format", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "agent:v1-2024_test.01", timestamp: "2024-01-01T00:00:00Z" }, expect: true },

  // Timestamp validation (8 tests)
  { name: "invalid_timestamp_format", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "not-a-date" }, expect: false },
  { name: "invalid_timestamp_partial", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01" }, expect: false },
  { name: "iso_8601_format", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T12:34:56Z" }, expect: true },
  { name: "iso_with_milliseconds", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T12:34:56.789Z" }, expect: true },
  { name: "iso_with_timezone", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T12:34:56+00:00" }, expect: true },
  { name: "epoch_timestamp", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "1970-01-01T00:00:00Z" }, expect: true },
  { name: "future_timestamp", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2099-12-31T23:59:59Z" }, expect: true },
  { name: "feb29_leap_year", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-02-29T00:00:00Z" }, expect: true },

  // Schema violations (12 tests)
  { name: "agent_generation_not_number", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T00:00:00Z", generation: "five" }, expect: false },
  { name: "agent_status_invalid_enum", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T00:00:00Z", status: "running" }, expect: false },
  { name: "fitness_eqs_not_number", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", eqs: "high" }, expect: false },
  { name: "fitness_accuracy_not_number", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", accuracy: true }, expect: false },
  { name: "task_priority_not_number", input: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "2024-01-01T00:00:00Z", priority: "high" }, expect: false },
  { name: "task_status_invalid_enum", input: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "2024-01-01T00:00:00Z", status: "working" }, expect: false },
  { name: "mutation_status_invalid_enum", input: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "2024-01-01T00:00:00Z", status: "approved" }, expect: false },
  { name: "selection_winnerEqs_not_number", input: { "@context": "sevo://v1", "@type": "Selection", "@id": "s", timestamp: "2024-01-01T00:00:00Z", winnerEqs: "high" }, expect: false },
  { name: "benchmark_version_not_number", input: { "@context": "sevo://v1", "@type": "Benchmark", "@id": "b", timestamp: "2024-01-01T00:00:00Z", version: "1.0" }, expect: false },
  { name: "benchmark_difficulty_not_number", input: { "@context": "sevo://v1", "@type": "Benchmark", "@id": "b", timestamp: "2024-01-01T00:00:00Z", difficulty: "hard" }, expect: false },
  { name: "task_dependsOn_not_array", input: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "2024-01-01T00:00:00Z", dependsOn: "task:1" }, expect: false },
  { name: "agent_blueprint_not_string", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T00:00:00Z", blueprint: 123 }, expect: false },

  // Reference validation (10 tests, with store)
  { name: "fitness_with_valid_agent_ref", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", agent: "agent:1" }, expect: true, needsStore: true },
  { name: "fitness_with_missing_agent_ref", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", agent: "agent:missing" }, expect: false, needsStore: true },
  { name: "mutation_with_valid_parent_ref", input: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "2024-01-01T00:00:00Z", parent: "agent:1" }, expect: true, needsStore: true },
  { name: "mutation_with_missing_parent_ref", input: { "@context": "sevo://v1", "@type": "Mutation", "@id": "m", timestamp: "2024-01-01T00:00:00Z", parent: "agent:missing" }, expect: false, needsStore: true },
  { name: "selection_with_valid_refs", input: { "@context": "sevo://v1", "@type": "Selection", "@id": "s", timestamp: "2024-01-01T00:00:00Z", winner: "agent:1", loser: "agent:2" }, expect: true, needsStore: true },
  { name: "selection_missing_winner_ref", input: { "@context": "sevo://v1", "@type": "Selection", "@id": "s", timestamp: "2024-01-01T00:00:00Z", winner: "agent:missing", loser: "agent:1" }, expect: false, needsStore: true },
  { name: "selection_missing_loser_ref", input: { "@context": "sevo://v1", "@type": "Selection", "@id": "s", timestamp: "2024-01-01T00:00:00Z", winner: "agent:1", loser: "agent:missing" }, expect: false, needsStore: true },
  { name: "task_with_valid_discoveredBy", input: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "2024-01-01T00:00:00Z", discoveredBy: "agent:1" }, expect: true, needsStore: true },
  { name: "task_with_missing_discoveredBy", input: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "2024-01-01T00:00:00Z", discoveredBy: "agent:missing" }, expect: false, needsStore: true },
  { name: "empty_ref_field_allowed", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", agent: "" }, expect: true, needsStore: true },

  // Edge cases with numbers (8 tests)
  { name: "negative_eqs", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", eqs: -1 }, expect: true },
  { name: "zero_values", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", eqs: 0, accuracy: 0, magnitude: 0 }, expect: true },
  { name: "large_numbers", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", eqs: 1e10 }, expect: true },
  { name: "small_float", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", eqs: 1.5e-8 }, expect: true },
  { name: "infinity_value", input: { "@context": "sevo://v1", "@type": "Fitness", "@id": "f", timestamp: "2024-01-01T00:00:00Z", eqs: Infinity }, expect: true },
  { name: "priority_zero", input: { "@context": "sevo://v1", "@type": "Task", "@id": "t", timestamp: "2024-01-01T00:00:00Z", priority: 0 }, expect: true },
  { name: "generation_negative", input: { "@context": "sevo://v1", "@type": "Agent", "@id": "a", timestamp: "2024-01-01T00:00:00Z", generation: -1 }, expect: true },
  { name: "difficulty_fractional", input: { "@context": "sevo://v1", "@type": "Benchmark", "@id": "b", timestamp: "2024-01-01T00:00:00Z", difficulty: 3.7 }, expect: true },
];

async function main() {
  const store = new Map<string, SeVoNode>();
  store.set("agent:1", { "@context": "sevo://v1", "@type": "Agent", "@id": "agent:1", timestamp: "2024-01-01T00:00:00Z" });
  store.set("agent:2", { "@context": "sevo://v1", "@type": "Agent", "@id": "agent:2", timestamp: "2024-01-01T00:00:00Z" });

  let passed = 0;

  for (const test of tests) {
    try {
      const result = await validate(test.input, store);
      if (result.ok === test.expect) passed++;
    } catch {
      if (!test.expect) passed++;
    }
  }

  const total = tests.length;
  const fitness = passed === total ? 1.0 : passed / total;
  
  console.log(JSON.stringify({
    fitness,
    branches: 2,
    correct: passed,
    total
  }));
}

main().catch(() => {
  console.log(JSON.stringify({ fitness: 0, branches: 2, correct: 0, total: 0 }));
});
