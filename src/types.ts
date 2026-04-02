// src/types.ts — All SEVO graph node types

export interface SeVoNode {
  "@context": "sevo://v1";
  "@type": string;
  "@id": string;
  timestamp: string;
}

export interface AgentNode extends SeVoNode {
  "@type": "Agent";
  blueprint: string;
  parent?: string;
  generation: number;
  status: "active" | "testing" | "dormant" | "archived";
  domain?: string;
}

export interface FitnessNode extends SeVoNode {
  "@type": "Fitness";
  agent: string;
  eqs: number;
  accuracy: number;
  magnitude: number;
  branchesExplored: number;
  predictionError: number;
  cycleId: string;
  context: Record<string, unknown>;
}

export interface TaskNode extends SeVoNode {
  "@type": "Task";
  description: string;
  priority: number;
  status: "pending" | "running" | "done" | "failed";
  dependsOn: string[];
  result?: string;
  discoveredBy?: string;
}

export interface MutationNode extends SeVoNode {
  "@type": "Mutation";
  parent: string;
  proposal: string;
  branch: string;
  status: "proposed" | "testing" | "selected" | "rejected";
  reasoning: string;
}

export interface SelectionNode extends SeVoNode {
  "@type": "Selection";
  winner: string;
  loser: string;
  winnerEqs: number;
  loserEqs: number;
  reasoning: string;
  eqsDelta: number;
}

export interface BenchmarkNode extends SeVoNode {
  "@type": "Benchmark";
  version: number;
  parent?: string;
  task: string;
  scoringLogic: string;
  difficulty: number;
  passThreshold: number;
}

export interface SeedImprovementNode extends SeVoNode {
  "@type": "SeedImprovement";
  observation: string;
  suggestion: string;
  evidence: string[];
  priority: number;
}
