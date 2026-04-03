// blueprints/agent-v4.ts — Fourth SEVO agent: crossover of v2+v3
// Combines v2's validation depth + v3's Result type + comprehensive edge cases

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
  | { code: "VALIDATION_FAILED"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: NodeError };

const createdIds = new Set<string>();

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

  if (id.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: "@id cannot be empty",
      },
    };
  }

  // Duplicate check
  if (createdIds.has(id)) {
    return {
      ok: false,
      error: {
        code: "DUPLICATE_NODE",
        message: `Node with @id "${id}" already exists`,
      },
    };
  }

  // Timestamp generation and validation
  const timestamp = new Date().toISOString();
  if (!timestamp || typeof timestamp !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: "Failed to generate valid ISO timestamp",
      },
    };
  }

  // Validate timestamp is parseable
  const parsedTime = new Date(timestamp);
  if (isNaN(parsedTime.getTime())) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Generated timestamp is not valid ISO format: ${timestamp}`,
      },
    };
  }

  createdIds.add(id);

  const node = {
    "@context": "sevo://v1" as const,
    "@type": type,
    "@id": id,
    timestamp,
    ...extra,
  };

  return { ok: true, value: node };
}

function validateNode(node: unknown): Result<SeVoNode> {
  // Type check
  if (!node || typeof node !== "object") {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: "Node must be an object",
      },
    };
  }

  const n = node as Record<string, unknown>;

  // Context validation
  if (n["@context"] !== "sevo://v1") {
    return {
      ok: false,
      error: {
        code: "INVALID_CONTEXT",
        message: `Expected @context "sevo://v1", got "${n["@context"]}"`,
      },
    };
  }

  // Type validation
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: "Missing or invalid @type (must be non-empty string)",
      },
    };
  }

  if ((n["@type"] as string).length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: "@type cannot be empty string",
      },
    };
  }

  // ID validation
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: "Missing or invalid @id (must be non-empty string)",
      },
    };
  }

  if ((n["@id"] as string).length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: "@id cannot be empty string",
      },
    };
  }

  if ((n["@id"] as string).length > 256) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id exceeds 256 characters: ${(n["@id"] as string).length}`,
      },
    };
  }

  // Timestamp validation
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: "Missing or invalid timestamp (must be non-empty string)",
      },
    };
  }

  const parsedTime = new Date(n["timestamp"] as string);
  if (isNaN(parsedTime.getTime())) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Timestamp is not valid ISO format: "${n["timestamp"]}"`,
      },
    };
  }

  return { ok: true, value: n as SeVoNode };
}

let correct = 0;
let total = 0;

// Test 1: Basic node creation
total++;
try {
  const result = createNode("Task", "test-basic-1", {
    description: "test",
    priority: 1,
    status: "pending",
    dependsOn: [],
  });
  if (result.ok && validateNode(result.value).ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 2: Invalid type
total++;
try {
  const result = createNode("", "test-2");
  if (!result.ok && result.error.code === "INVALID_TYPE") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 3: Invalid ID (empty)
total++;
try {
  const result = createNode("Task", "");
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 4: ID too long
total++;
try {
  const result = createNode("Task", "x".repeat(257));
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 5: Duplicate ID detection
total++;
try {
  const r1 = createNode("Task", "duplicate-test", { priority: 1 });
  const r2 = createNode("Task", "duplicate-test", { priority: 2 });
  if (r1.ok && !r2.ok && r2.error.code === "DUPLICATE_NODE") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 6: Valid node with extra fields
total++;
try {
  const result = createNode("Agent", "agent-test-6", {
    blueprint: "agent-v4.ts",
    generation: 4,
    status: "active",
  });
  if (result.ok && result.value["@context"] === "sevo://v1") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 7: Validate malformed object
total++;
try {
  const result = validateNode({ "@context": "wrong" });
  if (!result.ok && result.error.code === "INVALID_CONTEXT") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 8: Validate missing required fields
total++;
try {
  const result = validateNode({
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "test-8",
  });
  if (!result.ok && result.error.code === "INVALID_TIMESTAMP") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 9: Validate invalid timestamp format
total++;
try {
  const result = validateNode({
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "test-9",
    timestamp: "not-a-date",
  });
  if (!result.ok && result.error.code === "INVALID_TIMESTAMP") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 10: Valid timestamp in different ISO formats
total++;
try {
  const result = validateNode({
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "test-10",
    timestamp: "2026-04-03T12:00:00Z",
  });
  if (result.ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 11: Create and validate Fitness node
total++;
try {
  const result = createNode("Fitness", "fitness-test-11", {
    agent: "agent-v4",
    eqs: 0.85,
    accuracy: 1.0,
    magnitude: 0.15,
    branchesExplored: 3,
    predictionError: 0.05,
    cycleId: "cycle-1",
    context: { domain: "benchmark-v7" },
  });
  if (result.ok && validateNode(result.value).ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 12: Create and validate Selection node
total++;
try {
  const result = createNode("Selection", "selection-test-12", {
    winner: "agent-v4",
    loser: "agent-v3",
    winnerEqs: 0.88,
    loserEqs: 0.72,
    reasoning: "crossover superior to parent",
    eqsDelta: 0.16,
  });
  if (result.ok && validateNode(result.value).ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 13: Type validation on validation function
total++;
try {
  const result = validateNode(null);
  if (!result.ok && result.error.code === "INVALID_TYPE") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 14: ID with max valid length (256 chars)
total++;
try {
  const maxId = "x".repeat(256);
  const result = createNode("Task", maxId);
  if (result.ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 15: Validate node with additional unknown properties
total++;
try {
  const result = validateNode({
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "test-15",
    timestamp: "2026-04-03T12:00:00Z",
    customField: "should-be-allowed",
    nested: { data: [1, 2, 3] },
  });
  if (result.ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 16: Empty extra fields object
total++;
try {
  const result = createNode("Task", "test-16-empty-extra", {});
  if (result.ok && result.value["@context"] === "sevo://v1") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 17: Multiple valid nodes in sequence
total++;
try {
  const r1 = createNode("Task", "seq-17-a", { priority: 1 });
  const r2 = createNode("Task", "seq-17-b", { priority: 2 });
  const r3 = createNode("Task", "seq-17-c", { priority: 3 });
  if (r1.ok && r2.ok && r3.ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 18: Validate node with null extra values
total++;
try {
  const result = createNode("Task", "test-18", {
    description: null,
    priority: undefined,
  });
  if (result.ok && validateNode(result.value).ok) {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 19: Type field validation (non-empty string)
total++;
try {
  const result = validateNode({
    "@context": "sevo://v1",
    "@type": "",
    "@id": "test-19",
    timestamp: "2026-04-03T12:00:00Z",
  });
  if (!result.ok && result.error.code === "INVALID_TYPE") {
    correct++;
  }
} catch (_e) {
  // test failed
}

// Test 20: ID field validation (non-empty string)
total++;
try {
  const result = validateNode({
    "@context": "sevo://v1",
    "@type": "Task",
    "@id": "",
    timestamp: "2026-04-03T12:00:00Z",
  });
  if (!result.ok && result.error.code === "INVALID_ID") {
    correct++;
  }
} catch (_e) {
  // test failed
}

const fitness = (correct / total) * 0.7 + (correct >= total * 0.9 ? 0.3 : 0);
console.log(
  JSON.stringify({
    fitness: Math.min(1, fitness),
    branches: 2,
    correct,
    total,
  })
);
