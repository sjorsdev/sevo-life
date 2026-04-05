# PROGRESS

## Status: REBUILD NEEDED — simulation does not produce beauty
## SevoScore: 2550 (represents activity, not quality)

## Honest assessment
The current simulation is not producing beautiful life. A "tree" organism
is 5 cells in a row. Beauty score 0.83 is a trivially satisfied formula.
100+ cycles of evolution, only 2 life agents survived, nothing visually
meaningful emerged. The grid-cell model is too simple for real beauty.

## What to KEEP
- sevo-score (npm) — canonical scoring, works
- sevo-engine (npm) — graph, runner, scorer, works
- sevo-web — leaderboard, learnings page, works
- All learnings in graph/seedimprovements/ — 220+ records
- Meta-cycle structure (EVOLVE → REFLECT → BRAINSTORM → REALIGN)
- Fork detection, SevoScore computation
- The brainstorm proposals (seasonal cycles, predator-prey, developmental stages)

## What to REBUILD from scratch
- World engine — needs continuous space, not grid cells
- Organism model — needs organic shapes from hundreds of particles, not 5-18 cells
- Beauty scoring — needs emergence-based metrics, not trivially-satisfied formulas
- Visualization — needs to render something actually beautiful

## Key learnings for the rebuild
1. Parameter tuning is a local optimum — structural evolution matters more
2. LLM full-file rewrites fail 80% — use JSON patches or structured mutations
3. Beauty score must be hard to satisfy — if everything scores 0.8, the metric is broken
4. The world must be alive too — not a static backdrop for agents
5. Evolution needs reflection — detect plateaus, brainstorm, realign with the goal
6. Don't grind cycles without checking if the output is actually beautiful
7. Don't ask for permission — if the goal is clear, act on it
8. Forked projects must use fork-runner.ts not sevo.ts

## Entry point
- Run: `deno run --allow-all src/fork-runner.ts`
- Visualization: `deno run --allow-all web/build.ts && PORT=8090 deno run --allow-all web/serve.ts`

## Timestamp: 2026-04-05
