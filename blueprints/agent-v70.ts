// blueprints/agent-v7.ts — Seventh SEVO agent: improved schema validation + enhanced reference checking
// Evolved from agent-v6. Adds: stricter timestamp validation (ISO8601), enhanced reference tracking,
// more comprehensive edge cases, additional validation strategies, improved scoring logic.

interface SeVoNode {
  "@context": "sevo://v1";
  "@type": string;
  "@id": string;
  timestamp: string;
  [key: string]: unknown;
}

type FieldSpec = { 
  type: "string" | "number" | "array" | "object" | "boolean"; 
  enum?: string[];
  required?: boolean;
  minValue?: number;
  maxValue?: number;
};

type SchemaMap = Record<string, FieldSpec>;

const TYPE_SCHEMAS: Record<string, SchemaMap> = {
  Agent: {
    blueprint:  { type: "string", required: true },
    generation: { type: "number", required: true, minValue: 0 },
    status:     { type: "string", enum: ["active", "testing", "dormant", "archived"], required: true },
    parent:     { type: "string" },
    domain:     { type: "string" },
  },
  Fitness: {
    agent:           { type: "string", required: true },
    eqs:             { type: "number", required: true, minValue: 0 },
    cycleId:         { type: "string", required: true },
    accuracy:        { type: "number", required: true, minValue: 0, maxValue: 1 },
    magnitude:       { type: "number", required: true, minValue: 0 },
    branchesExplored:{ type: "number", required: true, minValue: 1 },
    predictionError: { type: "number", required: true, minValue: 0 },
    context:         { type: "object" },
  },
  Task: {
    description: { type: "string", required: true },
    priority:    { type: "number", required: true, minValue: 1, maxValue: 10 },
    status:      { type: "string", enum: ["pending", "running", "done", "failed"], required: true },
    dependsOn:   { type: "array", required: true },
    result:      { type: "string" },
    discoveredBy:{ type: "string" },
  },
  Mutation: {
    parent:   { type: "string", required: true },
    proposal: { type: "string", required: true },
    branch:   { type: "string", required: true },
    status:   { type: "string", enum: ["proposed", "testing", "selected", "rejected"], required: true },
    reasoning:{ type: "string", required: true },
  },
  Selection: {
    winner:    { type: "string", required: true },
    loser:     { type: "string", required: true },
    winnerEqs: { type: "number", required: true, minValue: 0 },
    loserEqs:  { type: "number", required: true, minValue: 0 },
    eqsDelta:  { type: "number", required: true },
    reasoning: { type: "string", required: true },
  },
  Benchmark: {
    version:      { type: "number", required: true, minValue: 1 },
    task:         { type: "string", required: true },
    scoringLogic: { type: "string", required: true },
    difficulty:   { type: "number", required: true, minValue: 1 },
    passThreshold:{ type: "number", required: true, minValue: 0, maxValue: 1 },
    parent:       { type: "string" },
  },
  SeedImprovement: {
    observation: { type: "string", required: true },
    suggestion:  { type: "string", required: true },
    evidence:    { type: "array", required: true },
    priority:    { type: "number", required: true, minValue: 1, maxValue: 10 },
  },
};

function isISO8601(timestamp: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  return iso8601Regex.test(timestamp);
}

function validateContextField(context: unknown): boolean {
  return context === "sevo://v1";
}

function validateIdFormat(id: string): boolean {
  return id.length > 0 && /^[a-zA-Z0-9:_-]+$/.test(id);
}

function validateTypeField(type: string): boolean {
  const validTypes = Object.keys(TYPE_SCHEMAS);
  return validTypes.includes(type);
}

function validateFieldAgainstSpec(value: unknown, spec: FieldSpec): boolean {
  if (spec.required && value === undefined) {
    return false;
  }

  if (value === undefined) return true;

  const actualType = Array.isArray(value) ? "array" : typeof value;
  if (actualType !== spec.type) {
    return false;
  }

  if (spec.enum && !spec.enum.includes(String(value))) {
    return false;
  }

  if (spec.type === "number") {
    const num = value as number;
    if (spec.minValue !== undefined && num < spec.minValue) return false;
    if (spec.maxValue !== undefined && num > spec.maxValue) return false;
  }

  return true;
}

function validateWithStrictSchema(node: SeVoNode): boolean {
  if (!validateContextField(node["@context"])) return false;
  if (!validateTypeField(node["@type"])) return false;
  if (!validateIdFormat(node["@id"])) return false;
  if (!isISO8601(node.timestamp)) return false;

  const schema = TYPE_SCHEMAS[node["@type"]];
  if (schema) {
    for (const [fieldName, fieldSpec] of Object.entries(schema)) {
      const fieldValue = node[fieldName];
      if (!validateFieldAgainstSpec(fieldValue, fieldSpec)) {
        return false;
      }
    }
  }

  return true;
}

function validateReferences(node: SeVoNode, allNodes: Map<string, SeVoNode>): boolean {
  const referenceFields = ["agent", "parent", "winner", "loser", "discoveredBy"];

  for (const field of referenceFields) {
    const value = node[field];
    if (value && typeof value === "string") {
      if (!allNodes.has(value)) {
        return false;
      }
    }
  }

  for (const arrayField of ["dependsOn", "evidence"]) {
    const arr = node[arrayField] as string[] | undefined;
    if (Array.isArray(arr)) {
      for (const id of arr) {
        if (!allNodes.has(id)) {
          return false;
        }
      }
    }
  }

  return true;
}

function validateDependencies(node: SeVoNode, allNodes: Map<string, SeVoNode>): boolean {
  const visited = new Set<string>();

  function hasCycle(id: string, path: Set<string>): boolean {
    if (path.has(id)) return true;
    if (visited.has(id)) return false;

    const n = allNodes.get(id);
    if (!n) return false;

    const newPath = new Set(path);
    newPath.add(id);

    const deps = n.dependsOn as string[] | undefined;
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        if (hasCycle(dep, newPath)) return true;
      }
    }

    visited.add(id);
    return false;
  }

  return !hasCycle(node["@id"], new Set());
}

interface TestCase {
  name: string;
  node: SeVoNode;
  context: Map<string, SeVoNode>;
  expectedStrict: boolean;
  expectedReferences: boolean;
  expectedDeps: boolean;
}

function generateTestCases(): TestCase[] {
  const baseAgent: SeVoNode = {
    "@context": "sevo://v1",
    "@type": "Agent",
    "@id": "agent:base",
    timestamp: new Date().toISOString(),
    blueprint: "blueprints/test.ts",
    generation: 1,
    status: "active",
  };

  const baseFitness: SeVoNode = {
    "@context": "sevo://v1",
    "@type": "Fitness",
    "@id": "fitness:base",
    timestamp: new Date().toISOString(),
    agent: "agent:base",
    eqs: 0.5,
    cycleId: "cycle-1",
    accuracy: 0.8,
    magnitude: 0.2,
    branchesExplored: 3,
    predictionError: 0.1,
  };

  return [
    {
      name: "Valid Agent",
      node: baseAgent,
      context: new Map([["agent:base", baseAgent]]),
      expectedStrict: true,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Valid Fitness",
      node: baseFitness,
      context: new Map([
        ["agent:base", baseAgent],
        ["fitness:base", baseFitness],
      ]),
      expectedStrict: true,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Invalid @context",
      node: { ...baseAgent, "@context": "wrong://v1" } as SeVoNode,
      context: new Map([["agent:base", baseAgent]]),
      expectedStrict: false,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Invalid @type",
      node: { ...baseAgent, "@type": "Unknown" } as SeVoNode,
      context: new Map([["agent:base", baseAgent]]),
      expectedStrict: false,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Invalid timestamp",
      node: { ...baseAgent, timestamp: "not-iso" } as SeVoNode,
      context: new Map([["agent:base", baseAgent]]),
      expectedStrict: false,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Invalid @id format",
      node: { ...baseAgent, "@id": "invalid$id" } as SeVoNode,
      context: new Map([["agent:base", baseAgent]]),
      expectedStrict: false,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Unresolved reference",
      node: { ...baseFitness, "@id": "fitness:bad", agent: "agent:missing" } as SeVoNode,
      context: new Map([
        ["agent:base", baseAgent],
        ["fitness:bad", { ...baseFitness, "@id": "fitness:bad", agent: "agent:missing" } as SeVoNode],
      ]),
      expectedStrict: true,
      expectedReferences: false,
      expectedDeps: true,
    },
    {
      name: "Number out of range",
      node: {
        "@context": "sevo://v1",
        "@type": "Fitness",
        "@id": "fitness:oor",
        timestamp: new Date().toISOString(),
        agent: "agent:base",
        eqs: 0.5,
        cycleId: "cycle-1",
        accuracy: 1.5,
        magnitude: 0.2,
        branchesExplored: 3,
        predictionError: 0.1,
      },
      context: new Map([
        ["agent:base", baseAgent],
        ["fitness:oor", { "@context": "sevo://v1", "@type": "Fitness", "@id": "fitness:oor", timestamp: new Date().toISOString(), agent: "agent:base", eqs: 0.5, cycleId: "cycle-1", accuracy: 1.5, magnitude: 0.2, branchesExplored: 3, predictionError: 0.1 } as SeVoNode],
      ]),
      expectedStrict: false,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Task with dependencies",
      node: {
        "@context": "sevo://v1",
        "@type": "Task",
        "@id": "task:2",
        timestamp: new Date().toISOString(),
        description: "Task 2",
        priority: 5,
        status: "pending",
        dependsOn: ["task:1"],
      },
      context: new Map([
        ["task:1", { "@context": "sevo://v1", "@type": "Task", "@id": "task:1", timestamp: new Date().toISOString(), description: "Task 1", priority: 3, status: "done", dependsOn: [] } as SeVoNode],
        ["task:2", { "@context": "sevo://v1", "@type": "Task", "@id": "task:2", timestamp: new Date().toISOString(), description: "Task 2", priority: 5, status: "pending", dependsOn: ["task:1"] } as SeVoNode],
      ]),
      expectedStrict: true,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Missing required field",
      node: { "@context": "sevo://v1", "@type": "Agent", "@id": "agent:bad", timestamp: new Date().toISOString(), generation: 1, status: "active" } as SeVoNode,
      context: new Map([["agent:bad", { "@context": "sevo://v1", "@type": "Agent", "@id": "agent:bad", timestamp: new Date().toISOString(), generation: 1, status: "active" } as SeVoNode]]),
      expectedStrict: false,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "Valid Selection",
      node: {
        "@context": "sevo://v1",
        "@type": "Selection",
        "@id": "selection:1",
        timestamp: new Date().toISOString(),
        winner: "agent:base",
        loser: "agent:other",
        winnerEqs: 0.7,
        loserEqs: 0.6,
        eqsDelta: 0.1,
        reasoning: "Higher EQS",
      },
      context: new Map([
        ["agent:base", baseAgent],
        ["agent:other", { ...baseAgent, "@id": "agent:other" } as SeVoNode],
        ["selection:1", { "@context": "sevo://v1", "@type": "Selection", "@id": "selection:1", timestamp: new Date().toISOString(), winner: "agent:base", loser: "agent:other", winnerEqs: 0.7, loserEqs: 0.6, eqsDelta: 0.1, reasoning: "Higher EQS" } as SeVoNode],
      ]),
      expectedStrict: true,
      expectedReferences: true,
      expectedDeps: true,
    },
    {
      name: "SeedImprovement with evidence",
      node: {
        "@context": "sevo://v1",
        "@type": "SeedImprovement",
        "@id": "seed:imp",
        timestamp: new Date().toISOString(),
        observation: "Validation needed",
        suggestion: "Add stricter checks",
        evidence: ["fitness:base", "selection:1"],
        priority: 3,
      },
      context: new Map([
        ["fitness:base", baseFitness],
        ["selection:1", { "@context": "sevo://v1", "@type": "Selection", "@id": "selection:1", timestamp: new Date().toISOString(), winner: "agent:base", loser: "agent:other", winnerEqs: 0.7, loserEqs: 0.6, eqsDelta: 0.1, reasoning: "Higher EQS" } as SeVoNode],
        ["seed:imp", { "@context": "sevo://v1", "@type": "SeedImprovement", "@id": "seed:imp", timestamp: new Date().toISOString(), observation: "Validation needed", suggestion: "Add stricter checks", evidence: ["fitness:base", "selection:1"], priority: 3 } as SeVoNode],
      ]),
      expectedStrict: true,
      expectedReferences: true,
      expectedDeps: true,
    },
  ];
}

function runTests(): { correct: number; total: number; branches: number } {
  const tests = generateTestCases();
  let correct = 0;

  for (const test of tests) {
    const strictPass = validateWithStrictSchema(test.node);
    const refPass = validateReferences(test.node, test.context);
    const depPass = validateDependencies(test.node, test.context);

    if (
      strictPass === test.expectedStrict &&
      refPass === test.expectedReferences &&
      depPass === test.expectedDeps
    ) {
      correct++;
    }
  }

  return { correct, total: tests.length, branches: 3 };
}

const result = runTests();
const fitness = result.correct / result.total;

console.log(JSON.stringify({
  fitness: fitness,
  branches: result.branches,
  correct: result.correct,
  total: result.total,
}));
