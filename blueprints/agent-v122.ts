// blueprints/agent-v4.ts — Fourth SEVO agent: crossover of v2 + v3, enhanced validation + error handling
// Combines validation depth (v2) with Result types and error granularity (v3)

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

  if (type.length > 256) {
    return {
      ok: false,
      error: { code: "INVALID_TYPE", message: `@type exceeds 256 chars` },
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
      error: { code: "INVALID_ID", message: `@id exceeds 256 chars: ${id.length}` },
    };
  }

  if (!/^[a-zA-Z0-9:_\-/.]+$/.test(id)) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: `@id contains invalid characters`,
      },
    };
  }

  // Timestamp generation and validation
  const timestamp = new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(timestamp)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Generated invalid timestamp`,
      },
    };
  }

  // Validate timestamp is parseable
  if (isNaN(new Date(timestamp).getTime())) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: `Timestamp not parseable as Date`,
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
        message: "Input is not an object",
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
        message: `Expected sevo://v1, got ${n["@context"]}`,
      },
    };
  }

  // Type validation
  if (!n["@type"] || typeof n["@type"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: "Missing or invalid @type",
      },
    };
  }

  if ((n["@type"] as string).length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_TYPE",
        message: "@type cannot be empty",
      },
    };
  }

  // ID validation
  if (!n["@id"] || typeof n["@id"] !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: "Missing or invalid @id",
      },
    };
  }

  if ((n["@id"] as string).length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_ID",
        message: "@id cannot be empty",
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

  // Timestamp validation
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
        message: "Timestamp is not a valid ISO date",
      },
    };
  }

  return { ok: true, value: n as SeVoNode };
}

function testCreateNode(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  // Test 1: Basic valid creation
  {
    const result = createNode("Task", "test-1");
    if (result.ok && result.value["@type"] === "Task") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 2: With extra fields
  {
    const result = createNode("Agent", "agent-1", {
      priority: 5,
      status: "active",
      generation: 1,
    });
    if (
      result.ok &&
      (result.value as Record<string, unknown>)["priority"] === 5
    ) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 3: Invalid type (number)
  {
    const result = createNode(123 as unknown as string, "id-1");
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 4: Invalid type (empty string)
  {
    const result = createNode("", "id-2");
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 5: Invalid ID (number)
  {
    const result = createNode("Task", 456 as unknown as string);
    if (!result.ok && result.error.code === "INVALID_ID") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 6: Invalid ID (empty string)
  {
    const result = createNode("Task", "");
    if (!result.ok && result.error.code === "INVALID_ID") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 7: ID too long
  {
    const longId = "x".repeat(257);
    const result = createNode("Task", longId);
    if (!result.ok && result.error.code === "INVALID_ID") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 8: Type too long
  {
    const longType = "x".repeat(257);
    const result = createNode(longType, "id");
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 9: Valid ID with special chars
  {
    const result = createNode("Task", "task:agent-v1/123_456-789");
    if (result.ok) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 10: Invalid ID with special chars
  {
    const result = createNode("Task", "task@invalid#char");
    if (!result.ok && result.error.code === "INVALID_ID") {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

function testValidateNode(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  // Test 1: Valid node
  {
    const node = {
      "@context": "sevo://v1",
      "@type": "Task",
      "@id": "task-1",
      timestamp: new Date().toISOString(),
    };
    const result = validateNode(node);
    if (result.ok) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 2: Invalid context
  {
    const node = {
      "@context": "invalid",
      "@type": "Task",
      "@id": "task-1",
      timestamp: new Date().toISOString(),
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_CONTEXT") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 3: Missing @type
  {
    const node = {
      "@context": "sevo://v1",
      "@id": "task-1",
      timestamp: new Date().toISOString(),
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 4: Empty @type
  {
    const node = {
      "@context": "sevo://v1",
      "@type": "",
      "@id": "task-1",
      timestamp: new Date().toISOString(),
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 5: Missing @id
  {
    const node = {
      "@context": "sevo://v1",
      "@type": "Task",
      timestamp: new Date().toISOString(),
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_ID") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 6: Empty @id
  {
    const node = {
      "@context": "sevo://v1",
      "@type": "Task",
      "@id": "",
      timestamp: new Date().toISOString(),
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_ID") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 7: @id too long
  {
    const node = {
      "@context": "sevo://v1",
      "@type": "Task",
      "@id": "x".repeat(257),
      timestamp: new Date().toISOString(),
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_ID") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 8: Missing timestamp
  {
    const node = {
      "@context": "sevo://v1",
      "@type": "Task",
      "@id": "task-1",
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_TIMESTAMP") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 9: Invalid timestamp format
  {
    const node = {
      "@context": "sevo://v1",
      "@type": "Task",
      "@id": "task-1",
      timestamp: "not-a-date",
    };
    const result = validateNode(node);
    if (!result.ok && result.error.code === "INVALID_TIMESTAMP") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 10: Not an object
  {
    const result = validateNode("not an object");
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 11: Null input
  {
    const result = validateNode(null);
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 12: Number type is invalid
  {
    const result = validateNode(42);
    if (!result.ok && result.error.code === "INVALID_TYPE") {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

function testIntegration(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  // Test 1: Create and validate
  {
    const createResult = createNode("Agent", "agent-v1", {
      generation: 3,
      status: "active",
    });
    if (createResult.ok) {
      const validateResult = validateNode(createResult.value);
      if (validateResult.ok) {
        passed++;
      } else {
        failed++;
      }
    } else {
      failed++;
    }
  }

  // Test 2: Create with complex extra fields
  {
    const result = createNode("Fitness", "fitness:agent-1-cycle-1", {
      eqs: 0.95,
      accuracy: 1.0,
      magnitude: 0.5,
      branchesExplored: 2,
      predictionError: 0.1,
    });
    if (
      result.ok &&
      (result.value as Record<string, unknown>)["eqs"] === 0.95
    ) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 3: Create mutation node
  {
    const result = createNode("Mutation", "mutation:agent-v1-1704067200000", {
      parent: "agent:v1",
      proposal: "add validation",
      branch: "mutation/agent-v1-1704067200000",
      status: "proposed",
    });
    if (
      result.ok &&
      (result.value as Record<string, unknown>)["status"] === "proposed"
    ) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 4: Create selection node
  {
    const result = createNode("Selection", "selection:v2-over-v1-1704067200001", {
      winner: "agent:v2",
      loser: "agent:v1",
      winnerEqs: 0.8,
      loserEqs: 0.6,
      reasoning: "superior accuracy",
    });
    if (
      result.ok &&
      (result.value as Record<string, unknown>)["winner"] === "agent:v2"
    ) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 5: Task node with dependencies
  {
    const result = createNode("Task", "task:benchmark-v2", {
      description: "Run benchmark v2",
      priority: 1,
      status: "pending",
      dependsOn: ["task:setup-env"],
    });
    if (
      result.ok &&
      Array.isArray((result.value as Record<string, unknown>)["dependsOn"])
    ) {
      passed++;
    } else {
      failed++;
    }
  }

  // Test 6: Verify all required fields exist in created node
  {
    const result = createNode("Test", "test-id", { custom: "value" });
    if (
      result.ok &&
      result.value["@context"] === "sevo://v1" &&
      result.value["@type"] === "Test" &&
      result.value["@id"] === "test-id" &&
      result.value["timestamp"] &&
      (result.value as Record<string, unknown>)["custom"] === "value"
    ) {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

// Run all tests
const createTests = testCreateNode();
const validateTests = testValidateNode();
const integrationTests = testIntegration();

const totalPassed = createTests.passed + validateTests.passed + integrationTests.passed;
const totalFailed = createTests.failed + validateTests.failed + integrationTests.failed;
const totalTests = totalPassed + totalFailed;
const accuracy = totalTests > 0 ? totalPassed / totalTests : 0;

console.log(`Tests: ${totalPassed}/${totalTests} passed`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}%`);

// Output fitness JSON
console.log(
  JSON.stringify({
    fitness: Math.min(1, accuracy),
    branches: 1,
    correct: totalPassed,
    total: totalTests,
  })
);
