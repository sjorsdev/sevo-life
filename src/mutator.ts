// src/mutator.ts — LLM-driven mutation proposals via claude CLI

import { writeNode, queryNodes } from "./graph.ts";
import { git } from "./git.ts";
import type { MutationNode, FitnessNode, AgentNode } from "./types.ts";

async function callClaude(prompt: string): Promise<string> {
  const cmd = new Deno.Command("claude", {
    args: ["-p", prompt, "--output-format", "text"],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`claude CLI failed: ${stderr}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

export async function propose(agent: AgentNode): Promise<MutationNode> {
  const blueprint = await Deno.readTextFile(agent.blueprint);
  const history = await queryNodes<FitnessNode>(
    "fitness",
    (n) => n.agent === agent["@id"]
  );

  const historyText =
    history
      .slice(-5)
      .map(
        (f) =>
          `- ${f.timestamp}: EQS ${f.eqs.toFixed(3)} ` +
          `(accuracy: ${f.accuracy}, magnitude: ${f.magnitude.toFixed(3)}, ` +
          `branches: ${f.branchesExplored}, predError: ${f.predictionError.toFixed(3)})`
      )
      .join("\n") || "No history yet.";

  const prompt = `You are mutating a SEVO agent blueprint to improve its Evolution Quality Score (EQS).

Current blueprint:
\`\`\`typescript
${blueprint}
\`\`\`

Recent fitness history:
${historyText}

Propose ONE specific, minimal change to improve EQS.
Focus on what the fitness history reveals about weaknesses.

Respond with JSON only, no markdown fences, no explanation:
{
  "reasoning": "why this mutation improves EQS",
  "change": "exact description of what to change",
  "expectedImprovement": 0.1,
  "targetMetric": "accuracy|magnitude|branches|predictionError"
}`;

  const response = await callClaude(prompt);

  // Extract JSON from response (handle potential markdown wrapping)
  let jsonStr = response;
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];
  const parsed = JSON.parse(jsonStr);

  // Create git branch for this mutation
  const ts = Date.now();
  const branchName = `mutation/${agent["@id"].replace(/[^a-z0-9-]/gi, "-")}-${ts}`;
  await git.branch(branchName);

  const mutationNode: MutationNode = {
    "@context": "sevo://v1",
    "@type": "Mutation",
    "@id": `mutation-${agent["@id"].replace(/[^a-z0-9-]/gi, "-")}-${ts}`,
    timestamp: new Date().toISOString(),
    parent: agent["@id"],
    proposal: parsed.change,
    branch: branchName,
    status: "proposed",
    reasoning: parsed.reasoning,
  };

  await writeNode(mutationNode);
  await git.checkout("main");
  return mutationNode;
}

export async function applyMutation(
  agent: AgentNode,
  mutationNode: MutationNode
): Promise<string> {
  const blueprint = await Deno.readTextFile(agent.blueprint);
  const newBlueprintPath = agent.blueprint.replace(
    /\.ts$/,
    `-mut-${Date.now()}.ts`
  );

  const prompt = `You are applying a mutation to a SEVO agent blueprint.

Current blueprint:
\`\`\`typescript
${blueprint}
\`\`\`

Mutation to apply:
- Change: ${mutationNode.proposal}
- Reasoning: ${mutationNode.reasoning}

Output ONLY the complete new TypeScript blueprint file. No markdown fences, no explanation.
The output must be a complete, runnable Deno TypeScript file that:
1. Defines the same test structure
2. Applies the proposed mutation
3. Outputs a JSON fitness result on the last line: {"fitness": <0-1>, "branches": 1, "correct": N, "total": N}`;

  const newBlueprint = await callClaude(prompt);

  // Strip any markdown fences if present
  let code = newBlueprint;
  const codeMatch = newBlueprint.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
  if (codeMatch) code = codeMatch[1];

  await Deno.writeTextFile(newBlueprintPath, code);
  return newBlueprintPath;
}
