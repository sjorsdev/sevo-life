// src/benchmark.ts — Benchmark runner and evolution

import { queryNodes } from "./graph.ts";
import { run, SEVO_PERMISSIONS } from "./runner.ts";
import type { BenchmarkNode, AgentNode } from "./types.ts";
import type { RunResult } from "./runner.ts";

export interface BenchmarkResult {
  benchmark: BenchmarkNode;
  agent: AgentNode;
  runResult: RunResult;
  passed: boolean;
  score: number;
}

export async function runBenchmark(
  agent: AgentNode,
  benchmark: BenchmarkNode
): Promise<BenchmarkResult> {
  const result = await run(agent.blueprint, SEVO_PERMISSIONS);

  const score = (result.fitnessOutput?.fitness as number) ?? 0;
  const passed = score >= benchmark.passThreshold;

  return {
    benchmark,
    agent,
    runResult: result,
    passed,
    score,
  };
}

export async function getLatestBenchmark(): Promise<BenchmarkNode | null> {
  const benchmarks = await queryNodes<BenchmarkNode>("benchmark");
  if (!benchmarks.length) return null;
  return benchmarks.sort((a, b) => b.version - a.version)[0];
}
