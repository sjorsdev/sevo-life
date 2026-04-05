# PROGRESS

## Status: PARTICLE SIMULATION EVOLVING — steady 2-4 winners per batch
## SevoScore: 3180
## Best fitness: ~0.67 | Beauty: ~0.74 | Survival: 67-100%
## Evolution rate: 2-4 winning mutants per 5-cycle meta-batch

## Run command
```
deno run --allow-all src/fork-runner.ts
```

## Visualization
```
deno run --allow-all web/build.ts && PORT=8090 deno run --allow-all web/serve.ts
```

## Architecture
- Particle-based organisms (springs, forces, drag) in continuous 2D space
- 3 species: jellyfish (pulsing bell), crawler (elongated), floater (radial bloom)
- Seasonal world: calm → storm → drought → bloom every 100 ticks
- Social interaction: organisms near complex neighbors gain energy
- Beauty scorer with 7 metrics (hard to satisfy — not trivially gamed)
- Meta-cycle: 5 evolve → reflect → brainstorm (if plateau) → realign
- Parameter-patch mutations via LLM (JSON genome tweaks, not full rewrites)

## Key files
- src/sim.ts — particle world engine
- src/sim-beauty.ts — beauty scorer
- src/fork-runner.ts — meta-cycle evolution
- blueprints/life-v2-agent-v1.ts — particle organism agent
- web/v2.html — Canvas2D visualization

## Brainstorm proposals (from 10+ brainstorms, written to graph)
- Predator-prey dynamics (strongest recurring signal)
- Colony formation (organisms that cluster)
- Developmental stages (juvenile → mature → elder)
- Adaptive physics (world responds to organisms)

## Learnings (in graph/seedimprovements/)
- Parameter tuning plateaus — need structural evolution
- LLM full rewrites fail 80% — use JSON patches
- Beauty must be hard to satisfy — trivial metrics are useless
- Don't grind cycles without checking output visually
- Retire agents that game metrics instead of producing beauty
- Evolution needs seasons/variation to prevent convergence
- Beauty should couple to survival (peacock principle)
- The system should brainstorm when stuck, not keep grinding

## npm packages
- sevo-score@1.2.1 — scoring, contracts, publishScore()
- sevo-engine@1.0.0 — graph, runner, scorer, mutator, selector

## Timestamp: 2026-04-05
