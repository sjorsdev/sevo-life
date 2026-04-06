# PROGRESS

## Status: organism-v2 (GRN + geometric development) built, needs integration
## SevoScore: 4039
## THINK ideas: 30+ cross-disciplinary ideas in graph

## What just happened
- organism-v2.ts: Gene Regulatory Networks, internal state (8 signals), geometric cells
- Tested: grows bilateral body with mouths/sensors/display from single cell via GRN
- Reproduction bug fixed (spawnOrganism never added to array)
- THINK phase producing novel cross-disciplinary ideas every cycle

## Immediate next step
Wire organism-v2 into the world engine (sim.ts) and visualization (web/v2.html).
The old Organism type (just particles + springs) needs to be replaced with OrganismV2
(GRN + internal state + geometric cells + costly signaling).

## Proposed: programmatic meta-cycle runner
Instead of long Claude conversations that forget, build a script that:
1. Reads PROGRESS.md + graph state
2. Calls `claude -p` with clean context for each meta-cycle phase
3. EVOLVE: run simulation, measure, mutate
4. REFLECT: analyze trends
5. THINK: creative cross-disciplinary reasoning
6. IMPLEMENT: actually build what THINK proposes
7. TEST: verify it works
8. Each step is stateless — repo IS the memory

## Key files
- src/organism-v2.ts — GRN organisms (NEW, needs integration)
- src/sim.ts — world engine (uses old Organism, needs update)
- src/chemistry.ts — Gray-Scott reaction-diffusion
- src/compression-beauty.ts — Schmidhuber + Birkhoff beauty
- src/fork-runner.ts — meta-cycle with THINK phase
- web/v2.html — visualization (needs update for GRN organisms)

## THINK themes (from 30+ ideas)
1. Temporal dimension — rhythm, oscillation, phase-locking
2. Environmental legacy — organisms shape world for offspring
3. Developmental programs — GRN, morphogenesis (NOW BUILT)
4. Costly signaling — beauty as honest signal of fitness (NOW BUILT)
5. Collective intelligence — stigmergy, niche construction
6. Polymorphic castes — group selection, division of labor

## Learnings
- Research before building (Schmidhuber, Birkhoff, Turing, Kuramoto)
- Test basic viability first (reproduction blocked everything)
- THINK phase > grinding cycles
- One missing line can block everything (spawnOrganism push)
- Don't ask permission when goal is clear
- The simulation needs serious depth, not more parameters

## Timestamp: 2026-04-06
