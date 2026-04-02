// src/mutator.ts — LLM-driven mutation proposals via Anthropic API

import Anthropic from "npm:@anthropic-ai/sdk";
import { writeNode, queryNodes } from "./graph.ts";
import { git } from "./git.ts";
import type { MutationNode, FitnessNode, AgentNode } from "./types.ts";

const client = new Anthropic();

export async function propose(agent: AgentNode): Promise<MutationNode> {
  // Read blueprint and fitness history
  const blueprint = await Deno.readTextFile(agent.blueprint);
  const history = await queryNodes<FitnessNode>(
    "fitness",
    (n) => n.agent === agent["@id"]
  );

  // Ask LLM for one targeted mutation
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are mutating a SEVO agent blueprint to improve EQS.

Current blueprint:
\`\`\`typescript
${blueprint}
\`\`\`

Recent fitness history (EQS scores):
${
          history
            .slice(-5)
            .map(
              (f) =>
                `- ${f.timestamp}: EQS ${f.eqs.toFixed(3)} ` +
                `(accuracy: ${f.accuracy}, magnitude: ${f.magnitude.toFixed(3)}, ` +
                `branches: ${f.branchesExplored}, predError: ${f.predictionError.toFixed(3)})`
            )
            .join("\n") || "No history yet."
        }

Propose ONE specific, minimal change to improve EQS.
Focus on what the fitness history reveals about weaknesses.

Respond with JSON only, no markdown fences:
{
  "reasoning": "why this mutation improves EQS",
  "change": "exact description of what to change",
  "expectedImprovement": 0.1,
  "targetMetric": "accuracy|magnitude|branches|predictionError"
}`,
      },
    ],
  });

  const text = (response.content[0] as { type: "text"; text: string }).text;
  const parsed = JSON.parse(text);

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
