// blueprints/agent-v2.ts — Second SEVO agent: adds validation depth + edge cases
// Variant of agent-v1 with more thorough testing

interface SeVoNode {
  "@context": "sevo://v1";
  "@type": string;
  "@id": string;
  timestamp: string;
}

function createNode(
  type: string,
  id: string,
  extra: Record<string, unknown> = {}
): SeVoNode & Record<string, unknown> {
  if (!type || typeof type !== "string") throw new Error("@type is required and must be a non-empty string");
  if (!id || typeof id !== "string") throw new Error("@id is required and must be a non-empty string");
  if (id.length > 256) throw new Error("@id must be <= 256 characters");

  const timestamp = new Date().toISOString();
  // Validate timestamp is parseable
  if (isNaN(new Date(timestamp).getTime())) throw new Error("Failed to generate valid timestamp");

  return {
    "@context": "sevo://v1",
    "@type": type,
    "@id": id,
    timestamp,
    ...extra,
  };
}

function validateNode(node: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!node || typeof node !== "object") {
    return { valid: false, errors: ["Not an object"] };
  }
  const n = node as Record<string, unknown>;
  if (n["@context"] !== "sevo://v1") errors.push("Invalid @context");
  if (!n["@type"] || typeof n["@type"] !== "string") errors.push("Invalid @type");
  if (!n["@id"] || typeof n["@id"] !== "string") errors.push("Invalid @id");
  if (!n["timestamp"] || typeof n["timestamp"] !== "string") errors.push("Invalid timestamp");
  // Validate timestamp is a parseable ISO date
  if (typeof n["timestamp"] === "string" && isNaN(new Date(n["timestamp"]).getTime())) {
    errors.push("Timestamp is not a valid ISO date");
  }
  return { valid: errors.length === 0, errors };
}

let correct = 0;
let total = 0;

// Test 1: basic node creation
total++;
try {
  const node = createNode("Task", "test-1", { description: "test", priority: 1, status: "pending", dependsOn: [] });
  if (validateNode(node).valid) correct++;
} catch { /* failed */ }

// Test 2: agent node
total++;
try {
  const node = createNode("Agent", "agent-1", { blueprint: "test.ts", generation: 1, status: "active" });
  if (validateNode(node).valid && node["@type"] === "Agent") correct++;
} catch { /* failed */ }

// Test 3: reject empty type
total++;
try { createNode("", "id"); } catch { correct++; }

// Test 4: reject empty id
total++;
try { createNode("Task", ""); } catch { correct++; }

// Test 5: timestamp validity
total++;
try {
  const node = createNode("Fitness", "fit-1");
  if (!isNaN(new Date(node.timestamp).getTime())) correct++;
} catch { /* failed */ }

// Test 6: JSON roundtrip
total++;
try {
  const node = createNode("Mutation", "mut-1", { proposal: "change", reasoning: "test" });
  const parsed = JSON.parse(JSON.stringify(node));
  if (validateNode(parsed).valid && parsed.proposal === "change") correct++;
} catch { /* failed */ }

// Test 7: extra fields preserved
total++;
try {
  const node = createNode("Selection", "sel-1", { winner: "a", loser: "b", eqsDelta: 0.5 });
  if (node.winner === "a" && node.eqsDelta === 0.5) correct++;
} catch { /* failed */ }

// Test 8: reject null/undefined
total++;
try {
  const v = validateNode(null);
  if (!v.valid) correct++;
} catch { /* failed */ }

// Test 9: reject non-objects
total++;
try {
  const v = validateNode("string");
  if (!v.valid) correct++;
} catch { /* failed */ }

// Test 10: id length boundary
total++;
try {
  createNode("Task", "x".repeat(257));
} catch {
  correct++; // Should reject overlong id
}

const fitness = correct / total;
console.log(JSON.stringify({ fitness, branches: 1, correct, total }));
