// apps/mobile/src/components/kit/math.ts
// Pure numbers behind the kit (no react-native imports, so vitest can load it).

/** Small seeded PRNG: same seed, same sequence, values in [0, 1). */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export type GrainDot = { x: number; y: number; r: number; a: number };

export const GRAIN = { seed: 0xb01d05, count: 260, tile: 120, rMin: 0.5, rMax: 0.9 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Dots for one grain tile. Each dot stays inside the tile so the pattern has no clipped seams;
 * `a` is a per-dot strength (0.5–1) so the grain reads as noise, not a dot screen.
 */
export function grainDots({
	seed = GRAIN.seed,
	count = GRAIN.count,
	tile = GRAIN.tile,
	rMin = GRAIN.rMin,
	rMax = GRAIN.rMax
}: Partial<{ seed: number; count: number; tile: number; rMin: number; rMax: number }> = {}): GrainDot[] {
	const next = mulberry32(seed);
	const dots: GrainDot[] = [];
	for (let i = 0; i < count; i++) {
		const r = round2(rMin + next() * (rMax - rMin));
		const span = tile - 2 * r;
		dots.push({
			x: round2(r + next() * span),
			y: round2(r + next() * span),
			r,
			a: round2(0.5 + next() * 0.5)
		});
	}
	return dots;
}

/**
 * Grain dots as a few compound paths, one per strength bucket, so a grain tile costs 3 SVG
 * nodes instead of 260. Each dot is two arcs.
 */
export function grainPaths(dots: GrainDot[], buckets = 3): { d: string; a: number }[] {
	const parts: string[][] = Array.from({ length: buckets }, () => []);
	for (const dot of dots) {
		const i = Math.min(buckets - 1, Math.floor(((dot.a - 0.5) / 0.5) * buckets));
		const r = dot.r;
		parts[i].push(`M${round2(dot.x - r)} ${dot.y}a${r} ${r} 0 1 0 ${round2(2 * r)} 0a${r} ${r} 0 1 0 ${round2(-2 * r)} 0`);
	}
	return parts
		.map((list, i) => ({ d: list.join(''), a: round2(0.5 + ((i + 0.5) / buckets) * 0.5) }))
		.filter((part) => part.d.length > 0);
}

/** Pull-to-refresh: the bolt starts to show at 10pt of pull and is fully charged at 90pt. */
export const PULL = { start: 10, full: 90 } as const;

/** How far the pull has charged the bolt, 0–1, from a scroll view's contentOffset.y. */
export function pullProgress(offsetY: number, start: number = PULL.start, full: number = PULL.full): number {
	const pull = -offsetY;
	if (pull <= start) return 0;
	if (pull >= full) return 1;
	return (pull - start) / (full - start);
}

/** True on the frame the pull first reaches the trigger (for a single haptic tick). */
export function crossedPullTrigger(prevOffsetY: number, offsetY: number, trigger: number = PULL.full): boolean {
	return -prevOffsetY < trigger && -offsetY >= trigger;
}

/** Recording halo around the mic: 2pt at silence, 8pt at full voice. */
export const RING = { min: 2, max: 8 } as const;

export function ringSpread(level: number): number {
	const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
	return RING.min + clamped * (RING.max - RING.min);
}

/** Scale for a halo drawn at its largest size, so the level animates as a native transform. */
export function ringScale(level: number, size: number): number {
	return (size + 2 * ringSpread(level)) / (size + 2 * RING.max);
}

export type Insets = { top: number; bottom: number; left: number; right: number };

/** Hit slop that grows a control to at least `min` points each way. */
export function hitSlopFor(width: number, height: number, min = 44): Insets {
	const v = Math.max(0, Math.ceil((min - height) / 2));
	const h = Math.max(0, Math.ceil((min - width) / 2));
	return { top: v, bottom: v, left: h, right: h };
}

export type SpringConfig = { stiffness: number; damping: number; mass: number };

/**
 * Key release spring, fitted to the website's `.tx-button` curve: peaks ~14% past rest at
 * ~105ms, then settles within ~420ms.
 */
export const KEY_SPRING: SpringConfig = { stiffness: 1250, damping: 37.5, mass: 1 };

/** Key press-down: 2pt in 60ms, ease-out (the web's `:active` transition). */
export const KEY_PRESS = { travel: 2, duration: 60 } as const;

/**
 * Closed-form numbers for an underdamped spring released `travel` points from rest.
 * `settleMs` is when the envelope drops under `threshold` points (RN's default rest
 * displacement is 0.001).
 */
export function springStats(
	{ stiffness, damping, mass }: SpringConfig,
	travel: number = KEY_PRESS.travel,
	threshold = 0.001
): { dampingRatio: number; overshoot: number; peakMs: number; settleMs: number } {
	const omega = Math.sqrt(stiffness / mass);
	const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
	if (dampingRatio >= 1) {
		return { dampingRatio, overshoot: 0, peakMs: Infinity, settleMs: Infinity };
	}
	const damped = omega * Math.sqrt(1 - dampingRatio * dampingRatio);
	const decay = dampingRatio * omega;
	return {
		dampingRatio,
		overshoot: Math.exp((-decay * Math.PI) / damped),
		peakMs: (Math.PI / damped) * 1000,
		settleMs: (Math.log(travel / threshold) / decay) * 1000
	};
}

/**
 * The spinner's charge cycle, as fractions of one loop: fill rises, flashes full, holds,
 * then drains. Durations in ms.
 */
export const BOLT_CYCLE = { charge: 820, flashUp: 140, flashDown: 220, hold: 160, drain: 260 } as const;

export function boltCycleMs(): number {
	return Object.values(BOLT_CYCLE).reduce((sum, ms) => sum + ms, 0);
}
