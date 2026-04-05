// blueprints/agent-v4-crossover.ts — Fourth SEVO agent: combines v2 validation depth + v3 error handling
// Conservative crossover (0.10 aggressiveness): inherit Result<T> + comprehensive tests

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
  | { code: "PARSE_ERROR"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): Result<SeVoNode & Record<string, unknown>> {
  // Type validation
  if (!type || typeof type !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: `@type must be a non-empty string, got: ${typeof type}`,
      },
    };
  }

  // Type format validation
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(type)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: `@type must be PascalCase starting with uppercase letter, got: ${type}`,
      },
    };
  }

  // ID validation
  if (!id || typeof id !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id must be a non-empty string, got: ${typeof id}`,
      },
    };
  }

  if (id.length > 256) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id exceeds 256 chars: ${id.length}`,
      },
    };
  }

  // ID format validation - must be valid identifier
  if (!/^[a-zA-Z0-9:_\-]+$/.test(id)) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id contains invalid characters: ${id}`,
      },
    };
  }

  const timestamp = new Date().toISOString();

  // Validate timestamp is parseable
  if (isNaN(new Date(timestamp).getTime())) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Failed to generate valid timestamp: ${timestamp}`,
      },
    };
  }

  return {
    ok: true,
    value: {
      "@context": "sevo://v1",
      "@type": type,
      "@id": id,
      timestamp,
      ...extra,
    },
  };
}

function validateNode(node: unknown): Result<SeVoNode> {
  if (!node || typeof node !== "object") {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: "Not an object",
      },
    };
  }

  const n = node as Record<string, unknown>;

  // @context validation
  if (n["@context"] !== "sevo://v1") {
    return {
      ok: false,
      error: {
        code: "INVALID_CONTEXT",
        message: `Expected sevo://v1, got ${n["@context"]}`,
      },
    };
  }

  // @type validation
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: "Missing or invalid @type",
      },
    };
  }

  // @type format validation
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(n["@type"] as string)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: `@type must be PascalCase, got: ${n["@type"]}`,
      },
    };
  }

  // @id validation
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: "Missing or invalid @id",
      },
    };
  }

  if ((n["@id"] as string).length > 256) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id exceeds 256 chars`,
      },
    };
  }

  // timestamp validation
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: "Missing or invalid timestamp",
      },
    };
  }

  if (isNaN(new Date(n["timestamp"] as string).getTime())) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Timestamp is not a valid ISO date: ${n["timestamp"]}`,
      },
    };
  }

  return { ok: true, value: n as SeVoNode };
}

let correct = 0;
let total = 0;

// Test 1: basic node creation with all required fields
total++;
const test1 = createNode("Task", "test-1", {
  description: "test",
  priority: 1,
  status: "pending",
  dependsOn: [],
});
if (test1.ok) {
  const validation = validateNode(test1.value);
  if (validation.ok) correct++;
}

// Test 2: agent node with parent reference
total++;
const test2 = createNode("Agent", "agent-v4", {
  blueprint: "./blueprints/agent-v4.ts",
  parent: "agent-v3",
  generation: 4,
  status: "active",
});
if (test2.ok) {
  const validation = validateNode(test2.value);
  if (validation.ok) correct++;
}

// Test 3: fitness node with full context
total++;
const test3 = createNode("Fitness", "fitness:agent-v4-cycle-1", {
  agent: "agent-v4",
  eqs: 0.85,
  accuracy: 1.0,
  magnitude: 0.15,
  branchesExplored: 3,
  predictionError: 0.12,
  cycleId: "cycle-1",
  context: { testsPassed: 42, testsFailed: 0 },
});
if (test3.ok) {
  const validation = validateNode(test3.value);
  if (validation.ok) correct++;
}

// Test 4: mutation node with reasoning
total++;
const test4 = createNode("Mutation", "mutation:agent-v3-1234567890", {
  parent: "agent-v3",
  proposal: "Add stricter type validation to @type field",
  branch: "mutation/agent-v3-1234567890",
  status: "proposed",
  reasoning: "v3 should validate PascalCase @type to prevent invalid node types",
});
if (test4.ok) {
  const validation = validateNode(test4.value);
  if (validation.ok) correct++;
}

// Test 5: selection node comparing two agents
total++;
const test5 = createNode("Selection", "selection:agent-v4-1234567890", {
  winner: "agent-v4",
  loser: "agent-v3",
  winnerEqs: 0.88,
  loserEqs: 0.82,
  reasoning: "v4 has better error granularity and edge case handling",
  eqsDelta: 0.06,
});
if (test5.ok) {
  const validation = validateNode(test5.value);
  if (validation.ok) correct++;
}

// Test 6: empty extra fields (valid)
total++;
const test6 = createNode("Benchmark", "benchmark:v4");
if (test6.ok) {
  const validation = validateNode(test6.value);
  if (validation.ok) correct++;
}

// Test 7: invalid type - not a string
total++;
const test7 = createNode(123 as unknown as string, "test-7");
if (!test7.ok && test7.error.code === "INVALID_TYPE") correct++;

// Test 8: invalid type - empty string
total++;
const test8 = createNode("", "test-8");
if (!test8.ok && test8.error.code === "INVALID_TYPE") correct++;

// Test 9: invalid type - lowercase
total++;
const test9 = createNode("task", "test-9");
if (!test9.ok && test9.error.code === "INVALID_TYPE") correct++;

// Test 10: invalid id - not a string
total++;
const test10 = createNode("Task", 123 as unknown as string);
if (!test10.ok && test10.error.code === "INVALID_ID") correct++;

// Test 11: invalid id - empty string
total++;
const test11 = createNode("Task", "");
if (!test11.ok && test11.error.code === "INVALID_ID") correct++;

// Test 12: invalid id - too long
total++;
const test12 = createNode("Task", "x".repeat(257));
if (!test12.ok && test12.error.code === "INVALID_ID") correct++;

// Test 13: invalid id - bad characters
total++;
const test13 = createNode("Task", "test@#$%");
if (!test13.ok && test13.error.code === "INVALID_ID") correct++;

// Test 14: validate node missing @context
total++;
const malformed1 = {
  "@type": "Task",
  "@id": "test-14",
  timestamp: new Date().toISOString(),
};
const test14 = validateNode(malformed1);
if (!test14.ok && test14.error.code === "INVALID_CONTEXT") correct++;

// Test 15: validate node missing @type
total++;
const malformed2 = {
  "@context": "sevo://v1",
  "@id": "test-15",
  timestamp: new Date().toISOString(),
};
const test15 = validateNode(malformed2);
if (!test15.ok && test15.error.code === "INVALID_TYPE") correct++;

// Test 16: validate node with invalid @type format
total++;
const malformed3 = {
  "@context": "sevo://v1",
  "@type": "task-name",
  "@id": "test-16",
  timestamp: new Date().toISOString(),
};
const test16 = validateNode(malformed3);
if (!test16.ok && test16.error.code === "INVALID_TYPE") correct++;

// Test 17: validate node missing @id
total++;
const malformed4 = {
  "@context": "sevo://v1",
  "@type": "Task",
  timestamp: new Date().toISOString(),
};
const test17 = validateNode(malformed4);
if (!test17.ok && test17.error.code === "INVALID_ID") correct++;

// Test 18: validate node missing timestamp
total++;
const malformed5 = {
  "@context": "sevo://v1",
  "@type": "Task",
  "@id": "test-18",
};
const test18 = validateNode(malformed5);
if (!test18.ok && test18.error.code === "INVALID_TIMESTAMP") correct++;

// Test 19: validate node with invalid timestamp
total++;
const malformed6 = {
  "@context": "sevo://v1",
  "@type": "Task",
  "@id": "test-19",
  timestamp: "not-a-date",
};
const test19 = validateNode(malformed6);
if (!test19.ok && test19.error.code === "INVALID_TIMESTAMP") correct++;

// Test 20: validate node not an object
total++;
const test20 = validateNode("not an object");
if (!test20.ok && test20.error.code === "INVALID_TYPE") correct++;

// Test 21: validate node with null
total++;
const test21 = validateNode(null);
if (!test21.ok && test21.error.code === "INVALID_TYPE") correct++;

// Test 22: complex extra fields preserved
total++;
const test22 = createNode("Task", "test-22", {
  nested: { level1: { level2: "value" } },
  array: [1, 2, 3],
  bool: true,
  num: 42,
});
if (
  test22.ok &&
  (test22.value as Record<string, unknown>).nested &&
  (test22.value as Record<string, unknown>).array
) {
  const validation = validateNode(test22.value);
  if (validation.ok) correct++;
}

// Test 23: node with hyphenated id
total++;
const test23 = createNode("Task", "test-task-v1-2024");
if (test23.ok) {
  const validation = validateNode(test23.value);
  if (validation.ok) correct++;
}

// Test 24: node with colon in id
total++;
const test24 = createNode("Fitness", "fitness:agent-v4:cycle-1");
if (test24.ok) {
  const validation = validateNode(test24.value);
  if (validation.ok) correct++;
}

// Test 25: node with underscore in id
total++;
const test25 = createNode("Task", "task_2024_01_15");
if (test25.ok) {
  const validation = validateNode(test25.value);
  if (validation.ok) correct++;
}

// Test 26: large extra data
total++;
const largeExtra: Record<string, unknown> = {};
for (let i = 0; i < 100; i++) {
  largeExtra[`field${i}`] = `value${i}`;
}
const test26 = createNode("Task", "test-26", largeExtra);
if (test26.ok) {
  const validation = validateNode(test26.value);
  if (validation.ok) correct++;
}

// Test 27: timestamp is recent
total++;
const test27 = createNode("Task", "test-27");
if (test27.ok) {
  const tsNum = new Date(test27.value.timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - tsNum) < 5000) correct++;
}

// Test 28: error messages are descriptive
total++;
const test28 = createNode("", "test-28");
if (!test28.ok && test28.error.message.length > 10) correct++;

// Test 29: type with numbers
total++;
const test29 = createNode("Task2024", "test-29");
if (test29.ok) {
  const validation = validateNode(test29.value);
  if (validation.ok) correct++;
}

// Test 30: deep validation chain - create then validate
total++;
const test30Result = createNode("Selection", "selection:test-30", {
  winner: "agent-v4",
  loser: "agent-v3",
  winnerEqs: 0.92,
  loserEqs: 0.78,
});
if (test30Result.ok) {
  const validation = validateNode(test30Result.value);
  if (validation.ok && validation.value["@type"] === "Selection") correct++;
}

const accuracy = correct / total;
const magnitude = Math.max(0, accuracy - 0.75);
const branchesExplored = 1;
const predictionError = 0.05;
const fitness = (accuracy * magnitude) / Math.max(branchesExplored * predictionError, 0.001);

console.log(`{"fitness": ${fitness.toFixed(4)}, "branches": ${branchesExplored}, "correct": ${correct}, "total": ${total}}`);
