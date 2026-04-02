// blueprints/agent-v1.ts — First SEVO agent: naive, minimal
// This agent attempts to create valid SeVoNodes and measure its own fitness.

interface SeVoNode {
  "@context": "sevo://v1";
  "@type": string;
  "@id": string;
  timestamp: string;
}

function createNode(type: string, id: string, extra: Record<string, unknown> = {}): SeVoNode & Record<string, unknown> {
  // Validate required fields
  if (!type || typeof type !== "string") throw new Error("@type is required");
  if (!id || typeof id !== "string") throw new Error("@id is required");

  return {
    "@context": "sevo://v1",
    "@type": type,
    "@id": id,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function validateNode(node: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!node || typeof node !== "object") {
    return { valid: false, errors: ["Not an object"] };
  }
  const n = node as Record<string, unknown>;
  if (n["@context"] !== "sevo://v1") errors.push("Missing or invalid @context");
  if (!n["@type"] || typeof n["@type"] !== "string") errors.push("Missing @type");
  if (!n["@id"] || typeof n["@id"] !== "string") errors.push("Missing @id");
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") errors.push("Missing timestamp");

  return { valid: errors.length === 0, errors };
}

// Run benchmark: create nodes, validate them, measure correctness
let correct = 0;
let total = 0;

// Test 1: basic node creation
total++;
try {
  const node = createNode("Task", "test-task-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
  const v = validateNode(node);
  if (v.valid) correct++;
} catch { /* failed */ }

// Test 2: node with all required fields
total++;
try {
  const node = createNode("Agent", "agent-test-1", { blueprint: "test.ts", generation: 1, status: "active" });
  const v = validateNode(node);
  if (v.valid && node["@type"] === "Agent") correct++;
} catch { /* failed */ }

// Test 3: reject invalid input
total++;
try {
  createNode("", "id");
  // Should have thrown
} catch {
  correct++; // Correctly rejected
}

// Test 4: reject missing id
total++;
try {
  createNode("Task", "");
  // Should have thrown
} catch {
  correct++; // Correctly rejected
}

// Test 5: timestamp is valid ISO string
total++;
try {
  const node = createNode("Fitness", "fit-1");
  const d = new Date(node.timestamp);
  if (!isNaN(d.getTime())) correct++;
} catch { /* failed */ }

// Test 6: JSON-LD serialization roundtrip
total++;
try {
  const node = createNode("Mutation", "mut-1", { proposal: "test change", reasoning: "test" });
  const json = JSON.stringify(node);
  const parsed = JSON.parse(json);
  const v = validateNode(parsed);
  if (v.valid && parsed.proposal === "test change") correct++;
} catch { /* failed */ }

const fitness = correct / total;
const branches = 1;

// Output fitness as JSON on last line — this is what the scorer reads
console.log(JSON.stringify({ fitness, branches, correct, total }));
