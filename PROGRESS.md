# PROGRESS

## Status: PARTICLE SIMULATION EVOLVING — steady winners
## SevoScore: 3059
## Best fitness: ~0.67 (particle organisms, seasonal world)
## Beauty: ~0.70-0.76 (genuine spring physics beauty)
## Winners per batch: 2-5

## What's running
- `deno run --allow-all src/fork-runner.ts`
- Meta-cycle: 5 evolve → reflect → brainstorm (if plateau) → realign
- Only particle agents compete (pixel agents retired)
- Seasonal world: calm/storm/drought/bloom every 100 ticks

## Visualization
- `deno run --allow-all web/build.ts && PORT=8090 deno run --allow-all web/serve.ts`
- http://localhost:8090 — glowing particle organisms, flow field, resources

## Key files
- src/sim.ts — particle world (springs, flow, seasons, social interaction)
- src/sim-beauty.ts — beauty scorer (7 metrics, hard to satisfy)
- src/fork-runner.ts — meta-cycle evolution with brainstorming
- blueprints/life-v2-agent-v1.ts — particle agent (jellyfish, crawler, floater)
- web/v2.html — Canvas2D visualization

## Brainstorm proposals (from 10+ brainstorms)
- Predator-prey (recurring — strongest signal)
- Colony formation
- Developmental stages
- Adaptive physics (world responds to organisms)

## npm packages
- sevo-score@1.2.1 — scoring, contracts, auto-publish
- sevo-engine@1.0.0 — graph, runner, scorer, mutator

## Timestamp: 2026-04-05
