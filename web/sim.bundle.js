function mulberry32(seed) {
    let s = seed | 0;
    return ()=>{
        s = s + 0x6d2b79f5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
class World {
    config;
    grid;
    entities;
    events;
    tick;
    rng;
    nextId;
    totalBirths;
    totalDeaths;
    constructor(config, genomes){
        this.config = config;
        this.tick = 0;
        this.events = [];
        this.rng = mulberry32(config.seed);
        this.totalBirths = 0;
        this.totalDeaths = 0;
        this.grid = Array.from({
            length: config.height
        }, ()=>Array.from({
                length: config.width
            }, ()=>({
                    resource: 0,
                    trail: 0,
                    trailColor: 0,
                    occupied: false
                })));
        let placed = 0;
        while(placed < config.initialResources){
            const x = Math.floor(this.rng() * config.width);
            const y = Math.floor(this.rng() * config.height);
            if (this.grid[y][x].resource === 0) {
                this.grid[y][x].resource = 0.3 + this.rng() * 0.7;
                placed++;
            }
        }
        this.entities = genomes.map((genome, i)=>{
            const pos = {
                x: Math.floor(this.rng() * config.width),
                y: Math.floor(this.rng() * config.height)
            };
            this.grid[pos.y][pos.x].occupied = true;
            this.totalBirths++;
            return {
                id: i,
                pos,
                energy: 20,
                age: 0,
                genome,
                alive: true,
                totalHarvested: 0,
                trailsLeft: 0,
                distanceTraveled: 0,
                generation: 0,
                parentIds: [],
                bornAtTick: 0
            };
        });
        this.nextId = genomes.length;
    }
    spawn(genome, generation = 0, parentIds = []) {
        const { width, height } = this.config;
        let attempts = 0;
        while(attempts < 50){
            const x = Math.floor(this.rng() * width);
            const y = Math.floor(this.rng() * height);
            if (!this.grid[y][x].occupied) {
                const entity = {
                    id: this.nextId++,
                    pos: {
                        x,
                        y
                    },
                    energy: 20,
                    age: 0,
                    genome,
                    alive: true,
                    totalHarvested: 0,
                    trailsLeft: 0,
                    distanceTraveled: 0,
                    generation,
                    parentIds,
                    bornAtTick: this.tick
                };
                this.grid[y][x].occupied = true;
                this.entities.push(entity);
                this.totalBirths++;
                this.events.push({
                    type: "birth",
                    x,
                    y,
                    id: entity.id,
                    generation
                });
                return entity;
            }
            attempts++;
        }
        return null;
    }
    getAlive() {
        return this.entities.filter((e)=>e.alive);
    }
    evolveConfig(changes) {
        this.config = {
            ...this.config,
            ...changes
        };
    }
    getNeighbors(pos, radius = 3) {
        const views = [];
        for(let dy = -radius; dy <= radius; dy++){
            for(let dx = -radius; dx <= radius; dx++){
                const nx = (pos.x + dx + this.config.width) % this.config.width;
                const ny = (pos.y + dy + this.config.height) % this.config.height;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                    views.push({
                        pos: {
                            x: nx,
                            y: ny
                        },
                        cell: this.grid[ny][nx],
                        distance: dist,
                        direction: {
                            x: Math.sign(dx),
                            y: Math.sign(dy)
                        }
                    });
                }
            }
        }
        return views;
    }
    applyAction(entity, action) {
        const { config, grid } = this;
        switch(action.type){
            case "move":
                {
                    const nx = (entity.pos.x + action.direction.x + config.width) % config.width;
                    const ny = (entity.pos.y + action.direction.y + config.height) % config.height;
                    if (!grid[ny][nx].occupied) {
                        const oldCell = grid[entity.pos.y][entity.pos.x];
                        const entityPeriod = 8 + entity.id * 3;
                        const phase = entity.age % (entityPeriod * 3);
                        let trailStrength;
                        if (phase < entityPeriod) {
                            trailStrength = entity.genome.trailIntensity * 0.15;
                        } else if (phase < entityPeriod * 2) {
                            trailStrength = entity.genome.trailIntensity * 0.5;
                        } else {
                            trailStrength = entity.genome.trailIntensity * 0.9;
                        }
                        oldCell.trail = Math.min(1, oldCell.trail + trailStrength);
                        oldCell.trailColor = entity.genome.trailColor;
                        if (entity.genome.trailIntensity > 0.1) entity.trailsLeft++;
                        oldCell.occupied = false;
                        entity.pos = {
                            x: nx,
                            y: ny
                        };
                        grid[ny][nx].occupied = true;
                        entity.energy -= config.moveCost;
                        entity.distanceTraveled++;
                    }
                    break;
                }
            case "harvest":
                {
                    const cell = grid[entity.pos.y][entity.pos.x];
                    if (cell.resource > 0) {
                        const gained = Math.min(cell.resource, 1) * config.harvestGain;
                        entity.energy += gained;
                        entity.totalHarvested += gained;
                        cell.resource = 0;
                        this.events.push({
                            type: "harvest",
                            x: entity.pos.x,
                            y: entity.pos.y,
                            id: entity.id
                        });
                    }
                    break;
                }
            case "trail":
                {
                    const cell = grid[entity.pos.y][entity.pos.x];
                    cell.trail = Math.min(1, cell.trail + action.intensity);
                    cell.trailColor = action.color;
                    entity.trailsLeft++;
                    break;
                }
            case "pulse":
                {
                    const r = Math.min(action.radius, 3);
                    for(let dy = -r; dy <= r; dy++){
                        for(let dx = -r; dx <= r; dx++){
                            if (Math.sqrt(dx * dx + dy * dy) <= r) {
                                const px = (entity.pos.x + dx + config.width) % config.width;
                                const py = (entity.pos.y + dy + config.height) % config.height;
                                grid[py][px].trail = Math.min(1, grid[py][px].trail + 0.3);
                                grid[py][px].trailColor = entity.genome.trailColor;
                            }
                        }
                    }
                    entity.energy -= 1;
                    entity.trailsLeft += r * r;
                    this.events.push({
                        type: "pulse",
                        x: entity.pos.x,
                        y: entity.pos.y,
                        id: entity.id,
                        r
                    });
                    break;
                }
            case "idle":
                entity.energy += 0.1;
                break;
        }
    }
    step(decisionFn) {
        this.tick++;
        this.events = [];
        const { config, grid, entities } = this;
        for (const entity of entities){
            if (!entity.alive) continue;
            entity.energy -= config.energyDrainPerTick;
            entity.age++;
            if (entity.energy <= 0) {
                entity.alive = false;
                grid[entity.pos.y][entity.pos.x].occupied = false;
                this.totalDeaths++;
                this.events.push({
                    type: "death",
                    x: entity.pos.x,
                    y: entity.pos.y,
                    id: entity.id
                });
                continue;
            }
            const neighbors = this.getNeighbors(entity.pos);
            const action = decisionFn(entity, neighbors);
            this.applyAction(entity, action);
        }
        for(let y = 0; y < config.height; y++){
            for(let x = 0; x < config.width; x++){
                if (grid[y][x].trail > 0) {
                    grid[y][x].trail = Math.max(0, grid[y][x].trail - config.trailDecayRate);
                }
            }
        }
        for(let y = 0; y < config.height; y++){
            for(let x = 0; x < config.width; x++){
                if (grid[y][x].resource === 0 && this.rng() < config.resourceRegenRate) {
                    grid[y][x].resource = 0.2 + this.rng() * 0.5;
                }
            }
        }
    }
    getEntityResults() {
        return this.entities.map((e)=>({
                id: e.id,
                survived: e.alive,
                age: e.age,
                totalHarvested: e.totalHarvested,
                trailsLeft: e.trailsLeft,
                distanceTraveled: e.distanceTraveled,
                finalEnergy: e.energy,
                generation: e.generation,
                parentIds: e.parentIds
            }));
    }
    isFinished() {
        return this.tick >= this.config.maxTicks || this.entities.every((e)=>!e.alive);
    }
}
function symmetryScore(grid) {
    const h = grid.length;
    const w = grid[0].length;
    let matches = 0;
    let total = 0;
    for(let y = 0; y < h; y++){
        for(let x = 0; x < Math.floor(w / 2); x++){
            const left = grid[y][x].trail;
            const right = grid[y][w - 1 - x].trail;
            const bothPresent = left > 0.1 || right > 0.1;
            if (bothPresent) {
                total++;
                if (Math.abs(left - right) < 0.3) matches++;
            }
        }
    }
    for(let y = 0; y < Math.floor(h / 2); y++){
        for(let x = 0; x < w; x++){
            const top = grid[y][x].trail;
            const bottom = grid[h - 1 - y][x].trail;
            const bothPresent = top > 0.1 || bottom > 0.1;
            if (bothPresent) {
                total++;
                if (Math.abs(top - bottom) < 0.3) matches++;
            }
        }
    }
    return total > 0 ? matches / total : 0;
}
function complexityScore(grid) {
    const h = grid.length;
    const w = grid[0].length;
    const bins = [
        0,
        0,
        0,
        0,
        0
    ];
    let trailCells = 0;
    for(let y = 0; y < h; y++){
        for(let x = 0; x < w; x++){
            if (grid[y][x].trail > 0.02) {
                const bin = Math.min(4, Math.floor(grid[y][x].trail * 5));
                bins[bin]++;
                trailCells++;
            }
        }
    }
    let intensityEntropy = 0;
    if (trailCells > 0) {
        for (const count of bins){
            if (count > 0) {
                const p = count / trailCells;
                intensityEntropy -= p * Math.log2(p);
            }
        }
        intensityEntropy /= Math.log2(bins.length);
    }
    let spatialDiff = 0;
    let spatialCount = 0;
    for(let y = 0; y < h - 1; y++){
        for(let x = 0; x < w - 1; x++){
            const here = grid[y][x].trail;
            const right = grid[y][x + 1].trail;
            const below = grid[y + 1][x].trail;
            if (here > 0.02 || right > 0.02) {
                spatialDiff += Math.abs(here - right);
                spatialCount++;
            }
            if (here > 0.02 || below > 0.02) {
                spatialDiff += Math.abs(here - below);
                spatialCount++;
            }
        }
    }
    const spatialVariation = spatialCount > 0 ? Math.min(1, spatialDiff / spatialCount * 3) : 0;
    return 0.6 * intensityEntropy + 0.4 * spatialVariation;
}
function rhythmScore(grid) {
    const h = grid.length;
    const w = grid[0].length;
    function measureGapRegularity(gaps) {
        if (gaps.length < 2) return 0;
        const mean = gaps.reduce((a, b)=>a + b, 0) / gaps.length;
        const variance = gaps.reduce((a, b)=>a + (b - mean) ** 2, 0) / gaps.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
        return Math.max(0, 1 - cv);
    }
    const hGaps = [];
    for(let y = 0; y < h; y += 2){
        let inTrail = false;
        let gapLen = 0;
        for(let x = 0; x < w; x++){
            const hasTrail = grid[y][x].trail > 0.1;
            if (hasTrail && !inTrail) {
                if (gapLen > 0) hGaps.push(gapLen);
                gapLen = 0;
                inTrail = true;
            } else if (!hasTrail) {
                gapLen++;
                inTrail = false;
            }
        }
    }
    const vGaps = [];
    for(let x = 0; x < w; x += 2){
        let inTrail = false;
        let gapLen = 0;
        for(let y = 0; y < h; y++){
            const hasTrail = grid[y][x].trail > 0.1;
            if (hasTrail && !inTrail) {
                if (gapLen > 0) vGaps.push(gapLen);
                gapLen = 0;
                inTrail = true;
            } else if (!hasTrail) {
                gapLen++;
                inTrail = false;
            }
        }
    }
    let periodicityScore = 0;
    let rowCount = 0;
    for(let y = 0; y < h; y += 4){
        const intensities = Array.from({
            length: w
        }, (_, x)=>grid[y][x].trail);
        const trailCount = intensities.filter((v)=>v > 0.05).length;
        if (trailCount < 5) continue;
        let bestCorr = 0;
        for(let lag = 3; lag <= 12; lag++){
            let sum = 0;
            let count = 0;
            for(let x = 0; x < w - lag; x++){
                sum += intensities[x] * intensities[x + lag];
                count++;
            }
            const corr = count > 0 ? sum / count : 0;
            bestCorr = Math.max(bestCorr, corr);
        }
        periodicityScore += Math.min(1, bestCorr * 5);
        rowCount++;
    }
    periodicityScore = rowCount > 0 ? periodicityScore / rowCount : 0;
    const hRhythm = measureGapRegularity(hGaps);
    const vRhythm = measureGapRegularity(vGaps);
    return 0.35 * hRhythm + 0.35 * vRhythm + 0.30 * periodicityScore;
}
function colorHarmonyScore(grid) {
    const h = grid.length;
    const w = grid[0].length;
    const colorCounts = [
        0,
        0,
        0,
        0,
        0,
        0
    ];
    let totalTrails = 0;
    for(let y = 0; y < h; y++){
        for(let x = 0; x < w; x++){
            if (grid[y][x].trail > 0.1) {
                const c = Math.min(5, Math.max(0, Math.floor(grid[y][x].trailColor)));
                colorCounts[c]++;
                totalTrails++;
            }
        }
    }
    if (totalTrails === 0) return 0;
    const usedColors = colorCounts.map((count, i)=>({
            color: i,
            ratio: count / totalTrails
        })).filter((c)=>c.ratio > 0.05);
    if (usedColors.length <= 1) return 0.2;
    let harmonySum = 0;
    let pairs = 0;
    for(let i = 0; i < usedColors.length; i++){
        for(let j = i + 1; j < usedColors.length; j++){
            const dist = Math.min(Math.abs(usedColors[i].color - usedColors[j].color), 6 - Math.abs(usedColors[i].color - usedColors[j].color));
            harmonySum += dist === 3 ? 1.0 : dist === 2 ? 0.8 : 0.5;
            pairs++;
        }
    }
    return pairs > 0 ? harmonySum / pairs : 0;
}
function coverageScore(grid) {
    const h = grid.length;
    const w = grid[0].length;
    let trailCells = 0;
    const totalCells = h * w;
    for(let y = 0; y < h; y++){
        for(let x = 0; x < w; x++){
            if (grid[y][x].trail > 0.05) trailCells++;
        }
    }
    const ratio = trailCells / totalCells;
    if (ratio < 0.1) return ratio * 5;
    if (ratio > 0.7) return Math.max(0, 1 - (ratio - 0.7) * 3);
    return 0.5 + (ratio - 0.1) * (0.5 / 0.6);
}
function scoreBeauty(grid) {
    const symmetry = symmetryScore(grid);
    const complexity = complexityScore(grid);
    const rhythm = rhythmScore(grid);
    const colorHarmony = colorHarmonyScore(grid);
    const coverage = coverageScore(grid);
    const total = symmetry * 0.25 + complexity * 0.25 + rhythm * 0.20 + colorHarmony * 0.15 + coverage * 0.15;
    return {
        symmetry,
        complexity,
        rhythm,
        colorHarmony,
        coverage,
        total
    };
}
function beautyByColor(grid) {
    const h = grid.length;
    const w = grid[0].length;
    const globalBeauty = scoreBeauty(grid).total;
    const contributions = [];
    for(let color = 0; color < 6; color++){
        const masked = Array.from({
            length: h
        }, (_, y)=>Array.from({
                length: w
            }, (_, x)=>{
                const cell = grid[y][x];
                const c = Math.min(5, Math.max(0, Math.floor(cell.trailColor)));
                if (c === color && cell.trail > 0) {
                    return {
                        ...cell,
                        trail: 0
                    };
                }
                return cell;
            }));
        const beautyWithout = scoreBeauty(masked).total;
        contributions[color] = globalBeauty - beautyWithout;
    }
    return contributions;
}
const DEFAULT_CONFIG = {
    width: 40,
    height: 30,
    maxTicks: 200,
    initialResources: 80,
    resourceRegenRate: 0.005,
    trailDecayRate: 0.02,
    energyDrainPerTick: 0.5,
    moveCost: 0.3,
    harvestGain: 5,
    seed: 42
};
export { World as World };
export { scoreBeauty as scoreBeauty, beautyByColor as beautyByColor };
export { DEFAULT_CONFIG as DEFAULT_CONFIG };
