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
    tick;
    rng;
    nextId;
    constructor(config, genomes, seed = 42){
        this.config = config;
        this.tick = 0;
        this.rng = mulberry32(seed);
        this.nextId = 0;
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
            if (org.energy > 40 && org.age > 100 && org.particles.length >= org.genome.maxParticles * 0.5) {
                const alive = this.organisms.filter((o)=>o.alive);
                if (alive.length < 12) {
                    const childGenome = {
                        ...org.genome
                    };
                    childGenome.baseRadius = org.genome.baseRadius * (0.9 + this.rng() * 0.2);
                    childGenome.swimStrength = Math.min(1, Math.max(0, org.genome.swimStrength + (this.rng() - 0.5) * 0.1));
                    childGenome.pulseRate = Math.min(1, Math.max(0, org.genome.pulseRate + (this.rng() - 0.5) * 0.1));
                    childGenome.drag = Math.min(0.99, Math.max(0.9, org.genome.drag + (this.rng() - 0.5) * 0.02));
                    childGenome.springStiffness = Math.max(0.01, org.genome.springStiffness + (this.rng() - 0.5) * 0.01);
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
