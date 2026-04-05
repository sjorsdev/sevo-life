function createChemField(width, height, feed = 0.055, kill = 0.062) {
    const size = width * height;
    const a = new Float64Array(size).fill(1.0);
    const b = new Float64Array(size).fill(0.0);
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    for(let dy = -5; dy <= 5; dy++){
        for(let dx = -5; dx <= 5; dx++){
            if (dx * dx + dy * dy <= 5 * 5) {
                const idx = (cy + dy) * width + (cx + dx);
                if (idx >= 0 && idx < size) {
                    b[idx] = 1.0;
                    a[idx] = 0.5;
                }
            }
        }
    }
    return {
        width,
        height,
        a,
        b,
        feed,
        kill,
        dA: 1.0,
        dB: 0.5
    };
}
function laplacian(field, x, y, w, h) {
    const idx = (i, j)=>(j + h) % h * w + (i + w) % w;
    const center = field[idx(x, y)];
    return field[idx(x - 1, y)] * 0.2 + field[idx(x + 1, y)] * 0.2 + field[idx(x, y - 1)] * 0.2 + field[idx(x, y + 1)] * 0.2 + field[idx(x - 1, y - 1)] * 0.05 + field[idx(x + 1, y - 1)] * 0.05 + field[idx(x - 1, y + 1)] * 0.05 + field[idx(x + 1, y + 1)] * 0.05 - center;
}
function stepChemistry(field, steps = 1) {
    const { width: w, height: h, feed: F, kill: k, dA, dB } = field;
    const size = w * h;
    for(let s = 0; s < steps; s++){
        const newA = new Float64Array(size);
        const newB = new Float64Array(size);
        for(let y = 0; y < h; y++){
            for(let x = 0; x < w; x++){
                const i = y * w + x;
                const a = field.a[i];
                const b = field.b[i];
                const reaction = a * b * b;
                newA[i] = a + (dA * laplacian(field.a, x, y, w, h) - reaction + F * (1 - a));
                newB[i] = b + (dB * laplacian(field.b, x, y, w, h) + reaction - (k + F) * b);
                newA[i] = Math.max(0, Math.min(1, newA[i]));
                newB[i] = Math.max(0, Math.min(1, newB[i]));
            }
        }
        field.a = newA;
        field.b = newB;
    }
}
function depositChemical(field, x, y, chemical, amount, radius = 2) {
    const { width: w, height: h } = field;
    for(let dy = -radius; dy <= radius; dy++){
        for(let dx = -radius; dx <= radius; dx++){
            if (dx * dx + dy * dy > radius * radius) continue;
            const px = ((Math.floor(x) + dx) % w + w) % w;
            const py = ((Math.floor(y) + dy) % h + h) % h;
            const idx = py * w + px;
            const arr = chemical === "a" ? field.a : field.b;
            arr[idx] = Math.min(1, arr[idx] + amount);
        }
    }
}
function readChemical(field, x, y, chemical) {
    const { width: w, height: h } = field;
    const px = (Math.floor(x) % w + w) % w;
    const py = (Math.floor(y) % h + h) % h;
    const arr = chemical === "a" ? field.a : field.b;
    return arr[py * w + px];
}
function patternEntropy(field) {
    const counts = new Array(20).fill(0);
    const total = field.b.length;
    for(let i = 0; i < total; i++){
        const bin = Math.min(20 - 1, Math.floor(field.b[i] * 20));
        counts[bin]++;
    }
    let entropy = 0;
    for (const c of counts){
        if (c > 0) {
            const p = c / total;
            entropy -= p * Math.log2(p);
        }
    }
    return entropy / Math.log2(20);
}
function patternStructure(field) {
    const { width: w, height: h, b } = field;
    const lags = [
        2,
        5,
        10
    ];
    let structure = 0;
    for (const lag of lags){
        let corr = 0;
        let count = 0;
        for(let y = 0; y < h; y += 3){
            for(let x = 0; x < w - lag; x += 3){
                corr += b[y * w + x] * b[y * w + x + lag];
                count++;
            }
        }
        const avgCorr = count > 0 ? corr / count : 0;
        structure += avgCorr;
    }
    return Math.min(1, structure / lags.length * 5);
}
class BeautyEngine {
    history = [];
    windowSize = 20;
    record(tick, entropy, structure, uniquePatterns) {
        const compressibility = entropy > 0.01 ? structure / entropy : 0;
        this.history.push({
            tick,
            entropy,
            structure,
            uniquePatterns,
            compressibility
        });
        if (this.history.length > 200) {
            this.history = this.history.slice(-200);
        }
    }
    compressionProgress() {
        if (this.history.length < this.windowSize * 2) return 0;
        const recent = this.history.slice(-this.windowSize);
        const older = this.history.slice(-this.windowSize * 2, -this.windowSize);
        const recentAvg = recent.reduce((s, h)=>s + h.compressibility, 0) / recent.length;
        const olderAvg = older.reduce((s, h)=>s + h.compressibility, 0) / older.length;
        return recentAvg - olderAvg;
    }
    birkhoffMeasure() {
        if (this.history.length === 0) return 0;
        const latest = this.history[this.history.length - 1];
        return latest.compressibility;
    }
    novelty() {
        if (this.history.length < 10) return 0;
        const recent = this.history.slice(-5);
        const older = this.history.slice(-10, -5);
        const recentPatterns = recent.reduce((s, h)=>s + h.uniquePatterns, 0) / recent.length;
        const olderPatterns = older.reduce((s, h)=>s + h.uniquePatterns, 0) / older.length;
        return Math.max(0, (recentPatterns - olderPatterns) / Math.max(olderPatterns, 1));
    }
    beauty() {
        const cp = this.compressionProgress();
        const bm = this.birkhoffMeasure();
        const nv = this.novelty();
        const cpNorm = Math.max(0, Math.min(1, cp * 10 + 0.5));
        const bmNorm = Math.min(1, bm);
        const nvNorm = Math.min(1, nv);
        const total = 0.4 * cpNorm + 0.3 * bmNorm + 0.3 * nvNorm;
        const latest = this.history[this.history.length - 1];
        return {
            total,
            compressionProgress: cpNorm,
            birkhoff: bmNorm,
            novelty: nvNorm,
            entropy: latest?.entropy ?? 0,
            structure: latest?.structure ?? 0
        };
    }
}
function countUniquePatterns(field, width, height, resolution = 5) {
    const patterns = new Set();
    for(let y = 1; y < height - 1; y += 2){
        for(let x = 1; x < width - 1; x += 2){
            let hash = "";
            for(let dy = -1; dy <= 1; dy++){
                for(let dx = -1; dx <= 1; dx++){
                    const val = field[(y + dy) * width + (x + dx)];
                    hash += Math.floor(val * resolution);
                }
            }
            patterns.add(hash);
        }
    }
    return patterns.size;
}
const v2 = {
    add: (a, b)=>({
            x: a.x + b.x,
            y: a.y + b.y
        }),
    sub: (a, b)=>({
            x: a.x - b.x,
            y: a.y - b.y
        }),
    scale: (a, s)=>({
            x: a.x * s,
            y: a.y * s
        }),
    len: (a)=>Math.sqrt(a.x * a.x + a.y * a.y),
    norm: (a)=>{
        const l = v2.len(a);
        return l > 0 ? {
            x: a.x / l,
            y: a.y / l
        } : {
            x: 0,
            y: 0
        };
    },
    dist: (a, b)=>v2.len(v2.sub(a, b)),
    rot: (a, rad)=>({
            x: a.x * Math.cos(rad) - a.y * Math.sin(rad),
            y: a.x * Math.sin(rad) + a.y * Math.cos(rad)
        }),
    angle: (a)=>Math.atan2(a.y, a.x)
};
const DEFAULT_WORLD = {
    width: 800,
    height: 600,
    maxTicks: 500,
    resourceCount: 60,
    flowStrength: 0.2,
    gravity: 0
};
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
    organisms;
    resources;
    flow;
    chem;
    beauty;
    tick;
    rng;
    nextId;
    constructor(config, genomes, seed = 42){
        this.config = config;
        this.tick = 0;
        this.rng = mulberry32(seed);
        this.nextId = 0;
        const chemRes = 4;
        this.chem = createChemField(Math.ceil(config.width / chemRes), Math.ceil(config.height / chemRes), 0.055, 0.062);
        this.beauty = new BeautyEngine();
        const res = 20;
        const fw = Math.ceil(config.width / 20);
        const fh = Math.ceil(config.height / 20);
        this.flow = {
            resolution: res,
            width: fw,
            height: fh,
            field: Array.from({
                length: fh
            }, (_, y)=>Array.from({
                    length: fw
                }, (_, x)=>{
                    const cx = x / fw - 0.5, cy = y / fh - 0.5;
                    return {
                        x: -cy * config.flowStrength,
                        y: cx * config.flowStrength
                    };
                })),
            phase: 0
        };
        this.resources = Array.from({
            length: config.resourceCount
        }, ()=>({
                pos: {
                    x: this.rng() * config.width,
                    y: this.rng() * config.height
                },
                amount: 0.5 + this.rng() * 0.5,
                radius: 10 + this.rng() * 20,
                regrowRate: 0.002 + this.rng() * 0.005
            }));
        this.organisms = genomes.map((genome)=>this.spawnOrganism(genome));
    }
    spawnOrganism(genome, pos) {
        const p = pos ?? {
            x: 50 + this.rng() * (this.config.width - 100),
            y: 50 + this.rng() * (this.config.height - 100)
        };
        const org = {
            id: this.nextId++,
            particles: [
                {
                    pos: {
                        ...p
                    },
                    vel: {
                        x: 0,
                        y: 0
                    },
                    radius: genome.baseRadius,
                    mass: 1,
                    color: [
                        ...genome.baseColor
                    ],
                    age: 0,
                    type: "core",
                    energy: 30
                }
            ],
            springs: [],
            genome,
            age: 0,
            energy: 50,
            alive: true,
            totalHarvested: 0
        };
        return org;
    }
    step() {
        this.tick++;
        stepChemistry(this.chem, 2);
        for (const org of this.organisms){
            if (!org.alive) continue;
            for (const p of org.particles){
                const chemX = p.pos.x / 4;
                const chemY = p.pos.y / 4;
                depositChemical(this.chem, chemX, chemY, "b", 0.02, 1);
            }
        }
        if (this.tick % 10 === 0) {
            const entropy = patternEntropy(this.chem);
            const structure = patternStructure(this.chem);
            const uniqueP = countUniquePatterns(this.chem.b, this.chem.width, this.chem.height);
            this.beauty.record(this.tick, entropy, structure, uniqueP);
        }
        this.flow.phase += 0.01;
        for(let y = 0; y < this.flow.height; y++){
            for(let x = 0; x < this.flow.width; x++){
                const cx = x / this.flow.width - 0.5;
                const cy = y / this.flow.height - 0.5;
                const phase = this.flow.phase;
                this.flow.field[y][x] = {
                    x: (-cy + 0.1 * Math.sin(phase + cx * 6)) * this.config.flowStrength,
                    y: (cx + 0.1 * Math.cos(phase + cy * 6)) * this.config.flowStrength
                };
            }
        }
        const season = Math.floor(this.tick / 100) % 4;
        if (this.tick % 100 === 0 && this.tick > 0) {
            if (season === 1) {
                this.config.flowStrength = 0.5;
                for (const r of this.resources)r.regrowRate *= 0.5;
            } else if (season === 2) {
                this.config.flowStrength = 0.1;
                for (const r of this.resources){
                    r.radius *= 0.7;
                    r.regrowRate *= 0.3;
                }
            } else if (season === 3) {
                this.config.flowStrength = 0.2;
                for (const r of this.resources){
                    r.amount = 1;
                    r.radius *= 1.5;
                    r.regrowRate *= 3;
                }
            } else {
                this.config.flowStrength = 0.2;
                for (const r of this.resources){
                    r.regrowRate = 0.002 + 0.005 * this.rng();
                    r.radius = 10 + this.rng() * 20;
                }
            }
        }
        for (const r of this.resources){
            r.amount = Math.min(1, r.amount + r.regrowRate);
        }
        for (const org of this.organisms){
            if (!org.alive) continue;
            org.age++;
            const seasonDrainMult = season === 1 ? 1.5 : season === 2 ? 1.3 : 1.0;
            org.energy -= (0.03 + org.particles.length * 0.005) * seasonDrainMult;
            if (org.energy <= 0) {
                org.alive = false;
                continue;
            }
            this.growOrganism(org);
            this.updatePhysics(org);
            this.applyBehavior(org);
            this.harvest(org);
            this.socialInteraction(org);
            if (this.tick % 20 === 0) {
                const center = this.getCenter(org);
                const chemX = Math.floor(center.x / 4);
                const chemY = Math.floor(center.y / 4);
                const localB = readChemical(this.chem, chemX, chemY, "b");
                org.energy += localB * 0.5;
                const beautyScore = this.beauty.beauty();
                org.energy += beautyScore.total * 0.2;
            }
            if (org.energy > 40 && org.age > 100 && org.particles.length >= org.genome.maxParticles * 0.5) {
                const alive = this.organisms.filter((o)=>o.alive);
                if (alive.length < 12) {
                    const childGenome = JSON.parse(JSON.stringify(org.genome));
                    childGenome.baseRadius = org.genome.baseRadius * (0.85 + this.rng() * 0.3);
                    childGenome.swimStrength = Math.min(1, Math.max(0, org.genome.swimStrength + (this.rng() - 0.5) * 0.15));
                    childGenome.pulseRate = Math.min(1, Math.max(0, org.genome.pulseRate + (this.rng() - 0.5) * 0.15));
                    childGenome.drag = Math.min(0.99, Math.max(0.9, org.genome.drag + (this.rng() - 0.5) * 0.03));
                    childGenome.springStiffness = Math.max(0.005, org.genome.springStiffness * (0.7 + this.rng() * 0.6));
                    childGenome.springDamping = Math.max(0.005, org.genome.springDamping * (0.7 + this.rng() * 0.6));
                    childGenome.maxParticles = Math.max(5, Math.min(30, childGenome.maxParticles + Math.floor((this.rng() - 0.5) * 4)));
                    childGenome.resourceAttraction = Math.min(1, Math.max(0, org.genome.resourceAttraction + (this.rng() - 0.5) * 0.15));
                    childGenome.flockingStrength = Math.min(1, Math.max(0, org.genome.flockingStrength + (this.rng() - 0.5) * 0.15));
                    childGenome.baseColor = childGenome.baseColor.map((c)=>Math.max(0, Math.min(255, c + Math.floor((this.rng() - 0.5) * 40))));
                    childGenome.accentColor = childGenome.accentColor.map((c)=>Math.max(0, Math.min(255, c + Math.floor((this.rng() - 0.5) * 40))));
                    if (childGenome.growthSteps.length > 0 && this.rng() < 0.3) {
                        const stepIdx = Math.floor(this.rng() * childGenome.growthSteps.length);
                        const step = childGenome.growthSteps[stepIdx];
                        step.angle += (this.rng() - 0.5) * 0.5;
                        step.distance = Math.max(5, step.distance + (this.rng() - 0.5) * 6);
                        step.childRadius = Math.max(0.3, Math.min(2, step.childRadius + (this.rng() - 0.5) * 0.3));
                        step.probability = Math.max(0.1, Math.min(1, step.probability + (this.rng() - 0.5) * 0.2));
                    }
                    if (this.rng() < 0.1 && childGenome.growthSteps.length < 10) {
                        const types = [
                            "flesh",
                            "mouth",
                            "sensor",
                            "fin",
                            "spike"
                        ];
                        childGenome.growthSteps.push({
                            triggerAge: 5 + Math.floor(this.rng() * 20),
                            parentType: types[Math.floor(this.rng() * types.length)],
                            childType: types[Math.floor(this.rng() * types.length)],
                            angle: (this.rng() - 0.5) * Math.PI * 2,
                            distance: 8 + this.rng() * 12,
                            mirror: this.rng() > 0.5,
                            childRadius: 0.5 + this.rng() * 1,
                            childColor: this.rng() > 0.5 ? "accent" : "gradient"
                        });
                    }
                    const center = this.getCenter(org);
                    const offset = {
                        x: (this.rng() - 0.5) * 60,
                        y: (this.rng() - 0.5) * 60
                    };
                    const childPos = {
                        x: center.x + offset.x,
                        y: center.y + offset.y
                    };
                    const child = this.spawnOrganism(childGenome, childPos);
                    child.generation = org.generation + 1;
                    org.energy -= 20;
                }
            }
            if (org.genome.pulseRate > 0) {
                const pulse = Math.sin(this.tick * org.genome.pulseRate * 0.1) * 0.3;
                for (const s of org.springs){
                    s.restLength *= 1 + pulse * 0.02;
                }
            }
            for (const p of org.particles)p.age++;
        }
    }
    growOrganism(org) {
        if (org.particles.length >= org.genome.maxParticles) return;
        if (org.energy < 5) return;
        for (const step of org.genome.growthSteps){
            if (org.age !== step.triggerAge) continue;
            if (org.particles.length >= org.genome.maxParticles) break;
            const parentIdx = org.particles.findIndex((p)=>p.type === step.parentType);
            if (parentIdx < 0) continue;
            const parent = org.particles[parentIdx];
            const growOne = (angle)=>{
                if (org.particles.length >= org.genome.maxParticles) return;
                const dir = v2.rot({
                    x: 1,
                    y: 0
                }, angle);
                const childPos = v2.add(parent.pos, v2.scale(dir, step.distance));
                let color;
                if (step.childColor === "accent") color = [
                    ...org.genome.accentColor
                ];
                else if (step.childColor === "gradient") {
                    const t = org.particles.length / org.genome.maxParticles;
                    color = org.genome.baseColor.map((c, i)=>Math.round(c + (org.genome.accentColor[i] - c) * t));
                } else color = [
                    ...org.genome.baseColor
                ];
                const childIdx = org.particles.length;
                org.particles.push({
                    pos: childPos,
                    vel: {
                        x: 0,
                        y: 0
                    },
                    radius: org.genome.baseRadius * step.childRadius,
                    mass: step.childRadius,
                    color,
                    age: 0,
                    type: step.childType,
                    energy: 5
                });
                org.springs.push({
                    a: parentIdx,
                    b: childIdx,
                    restLength: step.distance,
                    stiffness: org.genome.springStiffness,
                    damping: org.genome.springDamping
                });
                org.energy -= 2;
            };
            growOne(step.angle);
            if (step.mirror) growOne(-step.angle);
        }
    }
    updatePhysics(org) {
        const { config } = this;
        for (const spring of org.springs){
            const a = org.particles[spring.a];
            const b = org.particles[spring.b];
            const delta = v2.sub(b.pos, a.pos);
            const dist = v2.len(delta);
            if (dist < 0.01) continue;
            const displacement = dist - spring.restLength;
            const dir = v2.norm(delta);
            const force = v2.scale(dir, displacement * spring.stiffness);
            const relVel = v2.sub(b.vel, a.vel);
            const dampForce = v2.scale(dir, v2.len(relVel) * spring.damping * Math.sign(displacement));
            a.vel = v2.add(a.vel, v2.scale(v2.add(force, dampForce), 1 / a.mass));
            b.vel = v2.sub(b.vel, v2.scale(v2.add(force, dampForce), 1 / b.mass));
        }
        for (const p of org.particles){
            const fx = Math.floor(p.pos.x / this.flow.resolution);
            const fy = Math.floor(p.pos.y / this.flow.resolution);
            if (fx >= 0 && fx < this.flow.width && fy >= 0 && fy < this.flow.height) {
                const flowForce = this.flow.field[fy][fx];
                p.vel = v2.add(p.vel, v2.scale(flowForce, 0.05));
            }
            if (config.gravity > 0) {
                p.vel.y += config.gravity;
            }
            p.vel = v2.scale(p.vel, org.genome.drag);
            p.pos = v2.add(p.pos, p.vel);
            p.pos.x = (p.pos.x % config.width + config.width) % config.width;
            p.pos.y = (p.pos.y % config.height + config.height) % config.height;
        }
    }
    applyBehavior(org) {
        if (org.particles.length === 0) return;
        const core = org.particles[0];
        let nearestDist = Infinity;
        let nearestDir = {
            x: 0,
            y: 0
        };
        for (const r of this.resources){
            if (r.amount < 0.1) continue;
            const d = v2.dist(core.pos, r.pos);
            if (d < nearestDist) {
                nearestDist = d;
                nearestDir = v2.norm(v2.sub(r.pos, core.pos));
            }
        }
        if (nearestDist < 300) {
            const swimForce = v2.scale(nearestDir, org.genome.swimStrength * 0.3);
            const fins = org.particles.filter((p)=>p.type === "fin");
            const movers = fins.length > 0 ? fins : [
                core
            ];
            for (const p of movers){
                p.vel = v2.add(p.vel, swimForce);
            }
        }
        for (const other of this.organisms){
            if (!other.alive || other.id === org.id) continue;
            const otherCore = other.particles[0];
            if (!otherCore) continue;
            const d = v2.dist(core.pos, otherCore.pos);
            if (d < org.genome.avoidanceRadius && d > 0.1) {
                const away = v2.norm(v2.sub(core.pos, otherCore.pos));
                core.vel = v2.add(core.vel, v2.scale(away, 0.5));
            }
        }
    }
    harvest(org) {
        const mouths = org.particles.filter((p)=>p.type === "mouth");
        const harvesters = mouths.length > 0 ? mouths : [
            org.particles[0]
        ];
        const efficiency = mouths.length > 0 ? 1.0 : 0.3;
        for (const h of harvesters){
            for (const r of this.resources){
                if (r.amount < 0.05) continue;
                const d = v2.dist(h.pos, r.pos);
                if (d < r.radius + h.radius) {
                    const gained = Math.min(r.amount, 0.1) * 5 * efficiency;
                    org.energy += gained;
                    org.totalHarvested += gained;
                    r.amount -= Math.min(r.amount, 0.1);
                }
            }
        }
    }
    socialInteraction(org) {
        const center = this.getCenter(org);
        for (const other of this.organisms){
            if (!other.alive || other.id === org.id) continue;
            const otherCenter = this.getCenter(other);
            const dist = v2.dist(center, otherCenter);
            if (dist > 100 || dist < 1) continue;
            const sizeDiff = Math.abs(org.particles.length - other.particles.length);
            const diversityBonus = Math.min(1, sizeDiff / 5);
            const complexity = Math.min(1, other.particles.length / other.genome.maxParticles);
            const proximity = 1 - dist / 100;
            const energyGain = proximity * complexity * diversityBonus * 0.05;
            org.energy += energyGain;
        }
    }
    isFinished() {
        return this.tick >= this.config.maxTicks || this.organisms.every((o)=>!o.alive);
    }
    getCenter(org) {
        if (org.particles.length === 0) return {
            x: 0,
            y: 0
        };
        const sum = org.particles.reduce((s, p)=>v2.add(s, p.pos), {
            x: 0,
            y: 0
        });
        return v2.scale(sum, 1 / org.particles.length);
    }
}
function scoreForm(org) {
    const n = org.particles.length;
    if (n < 3) return 0;
    const center = org.particles.reduce((s, p)=>v2.add(s, p.pos), {
        x: 0,
        y: 0
    });
    const c = v2.scale(center, 1 / n);
    const dists = org.particles.map((p)=>v2.dist(p.pos, c));
    const avgDist = dists.reduce((a, b)=>a + b, 0) / n;
    const variance = dists.reduce((s, d)=>s + (d - avgDist) ** 2, 0) / n;
    const cv = avgDist > 0 ? Math.sqrt(variance) / avgDist : 0;
    const formScore = cv < 0.1 ? cv * 3 : cv > 1.2 ? Math.max(0, 1.5 - cv) : Math.min(1, 0.3 + cv * 0.7);
    const types = new Set(org.particles.map((p)=>p.type));
    const typeDiversity = Math.min(1, (types.size - 1) / 4);
    const sizeFactor = Math.min(1, n / (org.genome.maxParticles * 0.6));
    return formScore * 0.4 + typeDiversity * 0.3 + sizeFactor * 0.3;
}
function scoreSymmetry(org) {
    if (org.particles.length < 4) return 0;
    const center = org.particles.reduce((s, p)=>v2.add(s, p.pos), {
        x: 0,
        y: 0
    });
    const c = v2.scale(center, 1 / org.particles.length);
    const left = org.particles.filter((p)=>p.pos.x < c.x);
    const right = org.particles.filter((p)=>p.pos.x >= c.x);
    if (left.length === 0 || right.length === 0) return 0.1;
    let matchScore = 0;
    for (const lp of left){
        const mirrorX = 2 * c.x - lp.pos.x;
        const mirrorY = lp.pos.y;
        let bestDist = Infinity;
        for (const rp of right){
            const d = Math.sqrt((rp.pos.x - mirrorX) ** 2 + (rp.pos.y - mirrorY) ** 2);
            bestDist = Math.min(bestDist, d);
        }
        if (bestDist < 2) matchScore += 0.7;
        else if (bestDist < 20) matchScore += Math.min(1, 0.7 + bestDist * 0.02);
        else matchScore += Math.max(0, 0.5 - bestDist * 0.005);
    }
    return Math.min(1, matchScore / left.length);
}
function scoreProportion(org) {
    if (org.particles.length < 4) return 0;
    const center = org.particles.reduce((s, p)=>v2.add(s, p.pos), {
        x: 0,
        y: 0
    });
    v2.scale(center, 1 / org.particles.length);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of org.particles){
        minX = Math.min(minX, p.pos.x);
        maxX = Math.max(maxX, p.pos.x);
        minY = Math.min(minY, p.pos.y);
        maxY = Math.max(maxY, p.pos.y);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 1 || h < 1) return 0;
    const ratio = Math.max(w, h) / Math.min(w, h);
    const targets = [
        1.618,
        1.618 * 1.618,
        1 / 1.618,
        1,
        2
    ];
    let bestDist = Infinity;
    for (const t of targets){
        bestDist = Math.min(bestDist, Math.abs(ratio - t));
    }
    return Math.max(0, 1 - bestDist * 0.5);
}
function scoreColor(org) {
    if (org.particles.length < 2) return 0;
    let coherence = 0;
    let pairs = 0;
    for (const spring of org.springs){
        const a = org.particles[spring.a];
        const b = org.particles[spring.b];
        const colorDist = Math.sqrt((a.color[0] - b.color[0]) ** 2 + (a.color[1] - b.color[1]) ** 2 + (a.color[2] - b.color[2]) ** 2);
        if (colorDist < 10) coherence += 0.5;
        else if (colorDist < 150) coherence += 0.8 + 0.2 * (colorDist / 150);
        else coherence += Math.max(0.2, 1 - (colorDist - 150) / 300);
        pairs++;
    }
    return pairs > 0 ? coherence / pairs : 0;
}
function scoreDiversity(organisms) {
    const alive = organisms.filter((o)=>o.alive && o.particles.length > 2);
    if (alive.length < 2) return 0;
    let totalDiff = 0;
    let pairs = 0;
    for(let i = 0; i < alive.length; i++){
        for(let j = i + 1; j < alive.length; j++){
            const a = alive[i], b = alive[j];
            const sizeDiff = Math.abs(a.particles.length - b.particles.length) / Math.max(a.particles.length, b.particles.length);
            const typesA = new Map();
            const typesB = new Map();
            for (const p of a.particles)typesA.set(p.type, (typesA.get(p.type) ?? 0) + 1);
            for (const p of b.particles)typesB.set(p.type, (typesB.get(p.type) ?? 0) + 1);
            const allTypes = new Set([
                ...typesA.keys(),
                ...typesB.keys()
            ]);
            let typeDiff = 0;
            for (const t of allTypes){
                const ra = (typesA.get(t) ?? 0) / a.particles.length;
                const rb = (typesB.get(t) ?? 0) / b.particles.length;
                typeDiff += Math.abs(ra - rb);
            }
            totalDiff += sizeDiff * 0.4 + typeDiff * 0.6;
            pairs++;
        }
    }
    return pairs > 0 ? Math.min(1, totalDiff / pairs) : 0;
}
function scoreComposition(world) {
    const alive = world.organisms.filter((o)=>o.alive && o.particles.length > 2);
    if (alive.length < 2) return 0.1;
    const centers = alive.map((o)=>world.getCenter(o));
    let totalDist = 0;
    let pairs = 0;
    for(let i = 0; i < centers.length; i++){
        for(let j = i + 1; j < centers.length; j++){
            totalDist += v2.dist(centers[i], centers[j]);
            pairs++;
        }
    }
    const avgDist = pairs > 0 ? totalDist / pairs : 0;
    const idealDist = Math.sqrt(world.config.width * world.config.height) / (alive.length + 1);
    const distRatio = avgDist / Math.max(idealDist, 1);
    const spacingScore = distRatio > 0.5 && distRatio < 2 ? 1 - Math.abs(1 - distRatio) * 0.5 : 0.3;
    return spacingScore;
}
function scoreMotion(world) {
    const alive = world.organisms.filter((o)=>o.alive);
    if (alive.length === 0) return 0;
    let graceSum = 0;
    for (const org of alive){
        const speeds = org.particles.map((p)=>v2.len(p.vel));
        const avgSpeed = speeds.reduce((a, b)=>a + b, 0) / speeds.length;
        if (avgSpeed < 0.01) {
            graceSum += 0.2;
            continue;
        }
        const speedVariance = speeds.reduce((s, v)=>s + (v - avgSpeed) ** 2, 0) / speeds.length;
        const speedCv = Math.sqrt(speedVariance) / avgSpeed;
        const coordination = Math.max(0, 1 - speedCv);
        const speedScore = avgSpeed > 0.1 && avgSpeed < 3 ? 1 : 0.3;
        graceSum += coordination * 0.6 + speedScore * 0.4;
    }
    return graceSum / alive.length;
}
function scoreWorldBeauty(world) {
    const alive = world.organisms.filter((o)=>o.alive && o.particles.length > 2);
    if (alive.length === 0) {
        return {
            formBeauty: 0,
            symmetryQuality: 0,
            proportionHarmony: 0,
            colorCoherence: 0,
            diversityOfForms: 0,
            spatialComposition: 0,
            motionGrace: 0,
            total: 0
        };
    }
    const formBeauty = alive.reduce((s, o)=>s + scoreForm(o), 0) / alive.length;
    const symmetryQuality = alive.reduce((s, o)=>s + scoreSymmetry(o), 0) / alive.length;
    const proportionHarmony = alive.reduce((s, o)=>s + scoreProportion(o), 0) / alive.length;
    const colorCoherence = alive.reduce((s, o)=>s + scoreColor(o), 0) / alive.length;
    const diversityOfForms = scoreDiversity(alive);
    const spatialComposition = scoreComposition(world);
    const motionGrace = scoreMotion(world);
    const total = formBeauty * 0.20 + symmetryQuality * 0.15 + proportionHarmony * 0.10 + colorCoherence * 0.10 + diversityOfForms * 0.15 + spatialComposition * 0.15 + motionGrace * 0.15;
    return {
        formBeauty,
        symmetryQuality,
        proportionHarmony,
        colorCoherence,
        diversityOfForms,
        spatialComposition,
        motionGrace,
        total
    };
}
export { World as World, v2 as v2, DEFAULT_WORLD as DEFAULT_WORLD };
export { scoreWorldBeauty as scoreWorldBeauty };
export { createChemField as createChemField, stepChemistry as stepChemistry, patternEntropy as patternEntropy, patternStructure as patternStructure };
export { BeautyEngine as BeautyEngine, countUniquePatterns as countUniquePatterns };
