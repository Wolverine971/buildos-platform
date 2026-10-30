// apps/web/src/lib/stores/inbox-cleared-pile.svelte.ts
//
// The AI Inbox "Cleared" pile (tasker 149). Every answer leaves its card at once and lands
// here: it waits a few seconds (Undo), then saves in the background. Saves run one lane at a
// time (one project, in order), so two answers never race on the server; answers that are
// ready together in a lane can share one request. A failed or outdated save puts its items
// back on their card. The pile lives outside the inbox modal, so closing the inbox never
// drops an answer.
//
// Cards hide anything the pile is holding, saving or has cleared (`isHidden`), so a card
// rebuilt from an older view never shows an answered item again.

export const PILE_HOLD_MS = 5000;
const MAX_SETTLED_ENTRIES = 40;

export type PileStatus = 'holding' | 'queued' | 'working' | 'done' | 'partial' | 'failed';

export type PileEntry = {
	id: string;
	/** What the answer was about, e.g. the task or change title. */
	title: string;
	/** What the user said, e.g. "Make this change", "Moved to Fri, Oct 31". */
	label: string;
	/** Where, e.g. the project name. */
	context: string | null;
	/** Items it clears. */
	count: number;
	status: PileStatus;
	/** The server's reply or why it failed. */
	detail: string | null;
	/** Epoch ms when the Undo window ends; null once it is saving. */
	holdUntil: number | null;
	createdAt: number;
	keys: string[];
	/** Keys put back on their card after the save. */
	returnedKeys: string[];
};

export type PileOutcome = {
	/** Items to put back on their card (failed or changed since the user saw them). */
	returnedKeys?: string[];
	/** True when nothing was saved, even for an entry without keys. */
	failed?: boolean;
	detail?: string | null;
};

export type PileRunOptions = { keepalive: boolean };

/** Jobs with the same key that are ready together run as one call. */
export type PileMerge<P> = {
	key: string;
	payload: P;
	weight: number;
	maxWeight: number;
	runMany: (payloads: P[], options: PileRunOptions) => Promise<PileOutcome[]>;
};

export type PileJobInput<P = unknown> = {
	title: string;
	label: string;
	context?: string | null;
	keys?: string[];
	count?: number;
	/** Saves run in order within a lane, e.g. one per project. */
	lane: string;
	/** False when the save may leave the item open (a note): its keys show again after. */
	settles?: boolean;
	holdMs?: number;
	/** Send with fetch keepalive (the page may be going away). */
	keepalive?: boolean;
	run?: (options: PileRunOptions) => Promise<PileOutcome>;
	merge?: PileMerge<P>;
	/** Called when Undo takes the answer back before it saved. */
	onUndo?: () => void;
};

export type PileSettled = PileEntry | (Omit<PileEntry, 'status'> & { status: 'undone' });

type Job = {
	id: string;
	lane: string;
	settles: boolean;
	keepalive: boolean;
	run?: (options: PileRunOptions) => Promise<PileOutcome>;
	merge?: PileMerge<unknown>;
	onUndo?: () => void;
	timer: ReturnType<typeof setTimeout> | null;
	resolve: (entry: PileSettled) => void;
};

const ACTIVE: ReadonlySet<PileStatus> = new Set(['holding', 'queued', 'working']);

let entries = $state.raw<PileEntry[]>([]);
let settledKeys = $state.raw<Set<string>>(new Set());
let pinned = $state(false);
const jobs = new Map<string, Job>();
const runningLanes = new Set<string>();
let holdMs = PILE_HOLD_MS;
let keepaliveMode = false;
let sequence = 0;
let unloadHooked = false;

function patch(id: string, changes: Partial<PileEntry>): PileEntry | null {
	let next: PileEntry | null = null;
	entries = entries.map((entry) => {
		if (entry.id !== id) return entry;
		next = { ...entry, ...changes };
		return next;
	});
	return next;
}

function entryById(id: string): PileEntry | null {
	return entries.find((entry) => entry.id === id) ?? null;
}

function hookUnload() {
	if (unloadHooked || typeof window === 'undefined') return;
	unloadHooked = true;
	// Leaving the page mid-Undo still saves: send what is held, with keepalive.
	window.addEventListener('pagehide', () => flushAll({ keepalive: true }));
	// Back from the page cache: answers wait for Undo again.
	window.addEventListener('pageshow', () => (keepaliveMode = false));
}

function trimSettled(list: PileEntry[]): PileEntry[] {
	const settled = list.filter((entry) => !ACTIVE.has(entry.status));
	if (settled.length <= MAX_SETTLED_ENTRIES) return list;
	const drop = new Set(
		settled.slice(0, settled.length - MAX_SETTLED_ENTRIES).map((entry) => entry.id)
	);
	return list.filter((entry) => !drop.has(entry.id));
}

function add<P>(input: PileJobInput<P>): { id: string; settled: Promise<PileSettled> } {
	if (!input.run && !input.merge) throw new Error('A pile job needs run or merge');
	hookUnload();
	const id = `pile-${Date.now().toString(36)}-${++sequence}`;
	const hold = Math.max(0, input.holdMs ?? holdMs);
	const keys = [...new Set(input.keys ?? [])];
	const now = Date.now();
	const entry: PileEntry = {
		id,
		title: input.title,
		label: input.label,
		context: input.context ?? null,
		count: Math.max(1, input.count ?? keys.length),
		status: hold > 0 ? 'holding' : 'queued',
		detail: null,
		holdUntil: hold > 0 ? now + hold : null,
		createdAt: now,
		keys,
		returnedKeys: []
	};
	let resolve!: (entry: PileSettled) => void;
	const settled = new Promise<PileSettled>((done) => (resolve = done));
	const job: Job = {
		id,
		lane: input.lane,
		settles: input.settles !== false,
		keepalive: Boolean(input.keepalive),
		run: input.run,
		merge: input.merge as PileMerge<unknown> | undefined,
		onUndo: input.onUndo,
		timer: null,
		resolve
	};
	jobs.set(id, job);
	entries = trimSettled([...entries, entry]);
	if (hold > 0 && !keepaliveMode) {
		job.timer = setTimeout(() => release(id), hold);
	} else {
		if (hold > 0) patch(id, { status: 'queued', holdUntil: null });
		void pump(job.lane);
	}
	return { id, settled };
}

function release(id: string) {
	const job = jobs.get(id);
	if (!job) return;
	if (job.timer) clearTimeout(job.timer);
	job.timer = null;
	patch(id, { status: 'queued', holdUntil: null });
	void pump(job.lane);
}

async function pump(lane: string): Promise<void> {
	if (runningLanes.has(lane)) return;
	runningLanes.add(lane);
	try {
		for (;;) {
			const ready = entries
				.filter((entry) => entry.status === 'queued')
				.map((entry) => jobs.get(entry.id))
				.filter((job): job is Job => Boolean(job && job.lane === lane));
			const head = ready[0];
			if (!head) break;

			// Only neighbours merge, so answers still save in the order they were given.
			const group: Job[] = [head];
			if (head.merge) {
				let weight = head.merge.weight;
				for (const next of ready.slice(1)) {
					if (!next.merge || next.merge.key !== head.merge.key) break;
					if (weight + next.merge.weight > head.merge.maxWeight) break;
					weight += next.merge.weight;
					group.push(next);
				}
			}
			for (const job of group) patch(job.id, { status: 'working' });

			const options: PileRunOptions = {
				keepalive: keepaliveMode || group.some((job) => job.keepalive)
			};
			let outcomes: PileOutcome[];
			try {
				outcomes = head.merge
					? await head.merge.runMany(
							group.map((job) => job.merge!.payload),
							options
						)
					: [await head.run!(options)];
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Could not save this';
				outcomes = group.map(() => ({ failed: true, detail: message }));
			}
			group.forEach((job, index) =>
				settle(job, outcomes[index] ?? { failed: true, detail: 'No reply from the server' })
			);
		}
	} finally {
		runningLanes.delete(lane);
	}
}

function settle(job: Job, outcome: PileOutcome) {
	jobs.delete(job.id);
	const entry = entryById(job.id);
	if (!entry) return;
	const keySet = new Set(entry.keys);
	const returned = outcome.failed
		? entry.keys
		: [...new Set(outcome.returnedKeys ?? [])].filter((key) => keySet.has(key));
	const status: PileStatus =
		outcome.failed || (entry.keys.length > 0 && returned.length >= entry.keys.length)
			? 'failed'
			: returned.length
				? 'partial'
				: 'done';
	if (job.settles && status !== 'failed') {
		const back = new Set(returned);
		const cleared = entry.keys.filter((key) => !back.has(key));
		if (cleared.length) settledKeys = new Set([...settledKeys, ...cleared]);
	}
	const next = patch(job.id, {
		status,
		detail: outcome.detail ?? null,
		holdUntil: null,
		returnedKeys: returned
	});
	job.resolve(next ?? { ...entry, status });
}

/** Takes an answer back while it is still waiting; its items return to their card. */
function undo(id: string): boolean {
	const job = jobs.get(id);
	const entry = entryById(id);
	if (!job || !entry || entry.status !== 'holding') return false;
	if (job.timer) clearTimeout(job.timer);
	jobs.delete(id);
	entries = entries.filter((candidate) => candidate.id !== id);
	job.onUndo?.();
	job.resolve({ ...entry, status: 'undone' });
	return true;
}

function undoLatest(): boolean {
	const latest = [...entries].reverse().find((entry) => entry.status === 'holding');
	return latest ? undo(latest.id) : false;
}

/** Sends everything still waiting, now. */
function flushAll(options: { keepalive?: boolean } = {}) {
	if (options.keepalive) keepaliveMode = true;
	for (const entry of entries) {
		if (entry.status === 'holding') release(entry.id);
	}
}

/** Clears finished answers from the pile; anything still saving stays. */
function dismissSettled() {
	entries = entries.filter((entry) => ACTIVE.has(entry.status));
}

function isHidden(key: string): boolean {
	if (settledKeys.has(key)) return true;
	return entries.some((entry) => ACTIVE.has(entry.status) && entry.keys.includes(key));
}

/** Items cleared by an entry: everything it covered except what came back. */
export function pileClearedCount(entry: PileEntry): number {
	if (entry.status === 'failed' || ACTIVE.has(entry.status)) return 0;
	if (!entry.keys.length) return entry.count;
	return Math.max(0, entry.keys.length - entry.returnedKeys.length);
}

export function isPileEntryActive(entry: PileEntry): boolean {
	return ACTIVE.has(entry.status);
}

export const clearedPile = {
	get entries(): PileEntry[] {
		return entries;
	},
	/** True while the inbox is open: the pile stays put instead of fading. */
	get pinned(): boolean {
		return pinned;
	},
	setPinned(value: boolean) {
		pinned = value;
	},
	add,
	undo,
	undoLatest,
	flushAll,
	dismissSettled,
	isHidden
};

/** Tests only: hold length (0 saves at once) and a clean slate. */
export function configureClearedPileForTests(options: { holdMs?: number } = {}) {
	for (const job of jobs.values()) {
		if (job.timer) clearTimeout(job.timer);
	}
	jobs.clear();
	runningLanes.clear();
	entries = [];
	settledKeys = new Set();
	pinned = false;
	keepaliveMode = false;
	holdMs = options.holdMs ?? PILE_HOLD_MS;
}
