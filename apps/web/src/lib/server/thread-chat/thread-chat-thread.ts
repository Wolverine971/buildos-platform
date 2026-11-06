// apps/web/src/lib/server/thread-chat/thread-chat-thread.ts
//
// One project thread for the chat lab. Every step is an event the page shows:
//   index  → the project's records and document cards (headings only)
//   carry  → last turn's used records and sections, loaded again if unchanged (tasker 151)
//   search → Jev picks the records related to these pieces (skipped on a pure follow-up)
//   read   → each read_doc / read_record call, with what it read and how much
//   decide → one decision line per piece, each marked saved / ask / info
//   keep   → what this turn carries forward
// and a compact report for the answer step and for later turns.
import {
	buildContextFinderEntities,
	findProjectContext,
	type ContextFinderDecider,
	type ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';
import { JSON_PROFILE_MODELS } from '@buildos/smart-llm';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { LineBuffer, clip, type DumpItem } from '../dump-sort/dump-sort-core';
import type { ThreadRecord } from '../dump-sort/dump-sort-thread-core';
import {
	CHAT_FINDER_OPERATION,
	CHAT_THREAD_OPERATION,
	CHAT_THREAD_SYSTEM_PROMPT,
	LAB_PROVIDER_ROUTING,
	THREAD_TOOLS,
	buildProjectIndex,
	changeKey,
	readElsewhereLine,
	type ElsewhereLine,
	buildReport,
	buildThreadPrompt,
	documentChars,
	entityRecord,
	readChatThreadLine,
	resolveSections,
	type ChatChange,
	type ThreadReport
} from './thread-chat-core';
import {
	CARRY_MAX_CHARS,
	EMPTY_WORKING_SET,
	buildWorkingSet,
	carriedBlock,
	carryLabel,
	keptItem,
	planRehydrate,
	readKeepLine,
	type CarryItem,
	type KeepLine,
	type ReadTrace,
	type ScannedItem,
	type WorkingSet
} from './thread-chat-carry';
import {
	THREAD_BUDGET,
	createThreadBudget,
	createTurnPool,
	deadlineSignal,
	extendBudget,
	nextBudget,
	readFits,
	runModelCall,
	wrapLabel,
	wrapMessage,
	type RoundYield,
	type TurnPool,
	type WrapReason
} from './thread-chat-budget';
import type { ProjectIndexStats } from './thread-chat-index';
import { READ_RESULT_MAX_CHARS, type ThreadReadPort } from './thread-chat-reads';

const FINDER_TIMEOUT_MS = 5_000;
const RELATED_MAX = 10;

export type ThreadStage = 'reading' | 'searching' | 'working' | 'done' | 'failed';

export type ThreadStep = {
	id: string;
	kind:
		| 'index'
		| 'carry'
		| 'search'
		| 'read'
		| 'decide'
		| 'keep'
		| 'budget'
		| 'retry'
		| 'unfinished'
		| 'elsewhere';
	label: string;
	detail: string;
	state: 'running' | 'done' | 'failed';
	ms?: number;
	chars?: number;
	/** Record refs this step touched, for highlighting. */
	refs?: string[];
};

export type ChatThreadEvent =
	| { type: 'thread_status'; alias: string; t: number; stage: ThreadStage; note?: string }
	| { type: 'thread_step'; alias: string; t: number; step: ThreadStep }
	| { type: 'thread_found'; alias: string; t: number; records: ThreadRecord[] }
	| {
			type: 'thread_change';
			alias: string;
			t: number;
			change: ChatChange;
			/** Set when this decision replaces an earlier one with the same key. */
			replaces?: string;
	  }
	| { type: 'thread_skip'; alias: string; t: number; line: string; reason: string }
	| {
			type: 'thread_done';
			alias: string;
			t: number;
			report: ThreadReport;
			calls: number;
			cost: number;
			ms: number;
			promptChars: number;
			stats: ThreadStats;
	  };

/** What carrying context saved, and what the model calls really cost in tokens. */
export type ThreadStats = {
	rounds: number;
	promptTokens: number;
	cachedTokens: number;
	providers: string[];
	carried: number;
	carriedChars: number;
	changed: number;
	reads: number;
	readChars: number;
	rereadsSkipped: number;
	finder: 'ran' | 'skipped' | 'none';
};

const EMPTY_STATS: ThreadStats = {
	rounds: 0,
	promptTokens: 0,
	cachedTokens: 0,
	providers: [],
	carried: 0,
	carriedChars: 0,
	changed: 0,
	reads: 0,
	readChars: 0,
	rereadsSkipped: 0,
	finder: 'none'
};

/** Prompt size of one round: every message, including tool results sent again. */
function messageChars(messages: readonly { content: unknown; tool_calls?: unknown[] }[]): number {
	return messages.reduce(
		(total, message) =>
			total +
			(typeof message.content === 'string'
				? message.content.length
				: JSON.stringify(message.content ?? '').length) +
			(message.tool_calls ? JSON.stringify(message.tool_calls).length : 0),
		0
	);
}

export function usageTokens(raw: unknown): { prompt: number; cached: number } {
	const usage = (raw ?? null) as Record<string, unknown> | null;
	const details = (usage?.prompt_tokens_details ?? null) as Record<string, unknown> | null;
	return {
		prompt: Number(usage?.prompt_tokens) || 0,
		cached: Number(details?.cached_tokens) || 0
	};
}

/** Scripted stand-ins for Jev and the model, so the replay runs the same steps for free. */
export type ChatThreadReplay = {
	pick: { id: string; p: number }[];
	findMs: number;
	/** One entry per model round: tool calls, or the final decision lines. */
	rounds: (
		| { reads: { tool: 'read_doc' | 'read_record'; args: Record<string, unknown> }[] }
		| {
				answer: string;
		  }
		/** Tests: this round's model call fails. */
		| { fail: string }
	)[];
};

type ToolCall = { id: string; function: { name: string; arguments: string } };

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		signal?.addEventListener('abort', done, { once: true });
	});
}

function kchars(chars: number): string {
	return chars >= 1000 ? `${(chars / 1000).toFixed(1)}k chars` : `${chars} chars`;
}

export type ThreadInput = {
	alias: string;
	projectId: string;
	load: Promise<{ project: ContextFinderProjectV1; stats: ProjectIndexStats }>;
	pieces: DumpItem[];
	today: string;
	userId: string;
	history: string;
	nextQuestion: () => number;
	decider: ContextFinderDecider | null;
	llm: SmartLLMService | null;
	reads: ThreadReadPort;
	/** This project's working set from its last turn, if any. */
	carry?: WorkingSet | null;
	/** Every piece continues last turn's work (the planner's `cont`), so the search can skip. */
	continues?: boolean;
	replay?: ChatThreadReplay;
	/** Reading budget shared by every thread in the turn. */
	pool?: TurnPool;
	send: (event: ChatThreadEvent) => void;
	t: () => number;
	signal?: AbortSignal;
};

/** One try at a project thread. The wrapper decides whether to try again. */
type ThreadAttempt = {
	report: ThreadReport;
	calls: number;
	cost: number;
	promptChars: number;
	stats: ThreadStats;
	failed: string | null;
	/** Decision lines that arrived (answers, changes, questions). */
	decided: number;
	/** Worth another try: the project loaded and the failure came later (a model call). */
	retryable: boolean;
};

function addStats(total: ThreadStats, part: ThreadStats): void {
	total.rounds += part.rounds;
	total.promptTokens += part.promptTokens;
	total.cachedTokens += part.cachedTokens;
	for (const provider of part.providers)
		if (!total.providers.includes(provider)) total.providers.push(provider);
	total.carried = Math.max(total.carried, part.carried);
	total.carriedChars = Math.max(total.carriedChars, part.carriedChars);
	total.changed = Math.max(total.changed, part.changed);
	total.reads += part.reads;
	total.readChars += part.readChars;
	total.rereadsSkipped += part.rereadsSkipped;
	if (part.finder !== 'none') total.finder = part.finder;
}

/**
 * A project thread: an agent loop over one project. Robust by design (tasker 152):
 * - it earns more reading budget by finding new material, inside a turn-wide pool;
 * - a model call that fails or stalls before producing anything is retried once;
 * - past its time limit it decides with what it has, and decisions already made are kept;
 * - pieces it skipped get one repair round, and anything still undecided is reported;
 * - if it fails before deciding anything, the whole thread is tried once more.
 */
export async function runChatThread(input: ThreadInput): Promise<ThreadReport> {
	const { alias, send, t, signal } = input;
	const startedAt = t();
	const pool = input.pool ?? createTurnPool();
	let calls = 0;
	let cost = 0;
	let promptChars = 0;
	const stats: ThreadStats = { ...EMPTY_STATS, providers: [] };
	for (let attempt = 1; ; attempt += 1) {
		const outcome = await attemptThread(input, { attempt, pool, startedAt });
		calls += outcome.calls;
		cost += outcome.cost;
		promptChars += outcome.promptChars;
		addStats(stats, outcome.stats);
		const retry =
			outcome.failed !== null &&
			outcome.retryable &&
			outcome.decided === 0 &&
			attempt < 2 &&
			!signal?.aborted &&
			t() - startedAt < THREAD_BUDGET.softMs;
		if (retry) {
			send({
				type: 'thread_step',
				alias,
				t: t(),
				step: {
					id: `retry-${attempt}`,
					kind: 'retry',
					label: 'Something went wrong; trying this project again',
					detail: outcome.failed ?? '',
					state: 'done'
				}
			});
			continue;
		}
		send({
			type: 'thread_status',
			alias,
			t: t(),
			stage: outcome.failed ? 'failed' : 'done',
			...(outcome.failed ? { note: outcome.failed } : {})
		});
		send({
			type: 'thread_done',
			alias,
			t: t(),
			report: outcome.report,
			calls,
			cost,
			ms: t() - startedAt,
			promptChars,
			stats
		});
		return outcome.report;
	}
}

async function attemptThread(
	input: ThreadInput,
	context: { attempt: number; pool: TurnPool; startedAt: number }
): Promise<ThreadAttempt> {
	const { alias, send, t } = input;
	const { pool, startedAt, attempt } = context;
	// The thread's own clock: past hardMs its model call is cut, decisions so far are kept.
	const deadline = deadlineSignal(
		input.signal,
		Math.max(1_000, THREAD_BUDGET.hardMs - (t() - startedAt))
	);
	const signal = deadline.signal;
	const changes: ChatChange[] = [];
	const readLog: string[] = [];
	let projectName = alias;
	let calls = 0;
	let cost = 0;
	let promptChars = 0;
	const stats: ThreadStats = { ...EMPTY_STATS, providers: [] };
	let workingSet: WorkingSet = EMPTY_WORKING_SET;
	// The index load is one shared promise: if it failed, a second attempt fails the same way.
	let indexLoaded = false;
	// A second attempt gets its own step ids, so the page shows both tries.
	const step = (value: ThreadStep) =>
		send({
			type: 'thread_step',
			alias,
			t: t(),
			step: attempt > 1 ? { ...value, id: `a${attempt}-${value.id}` } : value
		});

	try {
		// 1. The index: records and document cards, no document text.
		send({ type: 'thread_status', alias, t: t(), stage: 'reading' });
		step({
			id: 'index',
			kind: 'index',
			label: 'Reading the project',
			detail: '',
			state: 'running'
		});
		const { project, stats: indexStats } = await input.load;
		indexLoaded = true;
		projectName = project.project.name;
		const entities = buildContextFinderEntities(project);
		const byId = new Map(entities.map((entity) => [entity.id, entity]));
		const byRef = new Map(entities.map((entity) => [entity.ref, entity]));
		const counts = Object.entries(indexStats.counts)
			.filter(([, count]) => count > 0)
			.map(([name, count]) => `${count} ${name}`)
			.join(' · ');
		step({
			id: 'index',
			kind: 'index',
			label: 'Read the project index',
			detail: `${counts || 'empty'}${indexStats.counts.docs ? ` — docs as headings only${indexStats.fallback ? ` (${indexStats.fallback} without a stored outline)` : ''}` : ''}`,
			state: 'done',
			ms: indexStats.ms
		});

		// 2. Last turn's working set: reload the text of what it used, if unchanged.
		const prior = input.carry ?? EMPTY_WORKING_SET;
		const rehydrate = planRehydrate(prior.carry, byId);
		// The carry comes back from the browser: take titles and headings from this turn's
		// index, and keep only section anchors the document really has.
		const trust = <T extends { item: CarryItem; entity: (typeof entities)[number] }>(
			entry: T
		): T => {
			const anchors = entry.item.anchors.filter((anchor) =>
				entry.entity.sections.some((section) => section.anchor === anchor)
			);
			return {
				...entry,
				item: {
					...entry.item,
					title: entry.entity.title,
					anchors,
					headings: anchors.map(
						(anchor) =>
							entry.entity.sections.find((section) => section.anchor === anchor)
								?.heading ?? anchor
					)
				}
			};
		};
		rehydrate.load = rehydrate.load.map(trust);
		rehydrate.changed = rehydrate.changed.map(trust);
		rehydrate.over = rehydrate.over.map(trust);
		const carryAt = t();
		if (prior.carry.length || prior.scannedCount) {
			step({
				id: 'carry',
				kind: 'carry',
				label: 'Loading what we had last turn',
				detail: '',
				state: 'running'
			});
		}
		const loading = Promise.all(
			rehydrate.load.map(async ({ item, entity }) => {
				try {
					const result =
						entity.kind === 'document'
							? await input.reads.readDoc(entity, item.anchors)
							: await input.reads.readRecord(entity);
					return { item, entity, text: result.text };
				} catch {
					return null;
				}
			})
		);
		// A pure follow-up skips the search, but only if the carried text actually loaded
		// (these are quick database reads; the search is the slow part it replaces).
		const settled = input.continues && rehydrate.load.length ? await loading : null;
		const continues = !!settled?.some(Boolean);

		// 3. Jev picks what these pieces are about (not needed when they all continue last turn).
		send({ type: 'thread_status', alias, t: t(), stage: 'searching' });
		const searchAt = t();
		step({
			id: 'search',
			kind: 'search',
			label: 'Finding related records',
			detail: '',
			state: 'running'
		});
		const related = new Map<string, number>();
		let finderCost = 0;
		if (continues) {
			stats.finder = 'skipped';
		} else if (input.replay) {
			stats.finder = 'ran';
			await wait(input.replay.findMs, signal);
			for (const { id, p } of input.replay.pick) if (byId.has(id)) related.set(id, p);
		} else if (input.decider && entities.length) {
			stats.finder = 'ran';
			try {
				const found = await findProjectContext({
					project,
					message: input.pieces
						.map((piece) => `- ${piece.quote} (${piece.title})`)
						.join('\n'),
					decider: input.decider,
					signal,
					timeoutMs: FINDER_TIMEOUT_MS,
					usage: {
						operationType: CHAT_FINDER_OPERATION,
						userId: input.userId,
						projectId: input.projectId
					}
				});
				finderCost = found.ranking?.costUsd ?? 0;
				calls += found.ranking?.stages.length ?? 0;
				for (const item of found.plan?.items.slice(0, RELATED_MAX) ?? []) {
					if (byId.has(item.id)) related.set(item.id, item.p ?? 0);
				}
			} catch {
				// No picks: the index still lists everything, most recent first.
			}
		}
		cost += finderCost;

		// The budget again, on the real text: tool payloads run larger than outline estimates.
		const loaded: { item: CarryItem; entity: (typeof entities)[number]; text: string }[] = [];
		let room = CARRY_MAX_CHARS;
		for (const entry of await loading) {
			if (!entry) continue;
			const item = { ...entry.item, chars: entry.text.length };
			if (entry.text.length > room) {
				rehydrate.over.push({ item, entity: entry.entity });
				continue;
			}
			room -= entry.text.length;
			loaded.push({ ...entry, item });
		}
		const carriedLoaded = new Set(loaded.map(({ item }) => item.id));
		// Carried records count as related: they lead the index with a ★ too.
		for (const { item } of loaded)
			related.set(item.id, Math.max(related.get(item.id) ?? 0, 0.99));
		const marks = new Map<string, '↺' | '·seen'>();
		for (const { item } of [...loaded, ...rehydrate.changed]) marks.set(item.id, '↺');
		const scannedBefore = prior.scanned.filter(
			(item) => byId.has(item.id) && !marks.has(item.id)
		);
		for (const item of scannedBefore) marks.set(item.id, '·seen');
		for (const { item } of rehydrate.over) marks.set(item.id, '·seen');
		const carried = carriedBlock({
			loaded: loaded.map(({ item, entity, text }) => ({ item, ref: entity.ref, text })),
			changed: rehydrate.changed.map(({ item, entity }) => ({ item, ref: entity.ref })),
			over: rehydrate.over.map(({ item, entity }) => ({ item, ref: entity.ref })),
			scanned: scannedBefore.map((item) => ({
				ref: byId.get(item.id)!.ref,
				title: byId.get(item.id)!.title
			})),
			scannedCount:
				scannedBefore.length + Math.max(0, prior.scannedCount - prior.scanned.length)
		});
		stats.carried = loaded.length;
		stats.carriedChars = loaded.reduce((total, entry) => total + entry.text.length, 0);
		stats.changed = rehydrate.changed.length;
		if (prior.carry.length || prior.scannedCount) {
			const parts = [
				loaded.map(({ item }) => carryLabel(item)).join(' · '),
				rehydrate.changed.length
					? `${rehydrate.changed.length} changed, will reread if needed`
					: '',
				rehydrate.gone.length ? `${rehydrate.gone.length} gone` : '',
				scannedBefore.length || rehydrate.over.length
					? `${scannedBefore.length + rehydrate.over.length} more looked at before`
					: ''
			].filter(Boolean);
			step({
				id: 'carry',
				kind: 'carry',
				label: loaded.length
					? `Carried ${loaded.length} from last turn`
					: 'Nothing to carry from last turn',
				detail: parts.join(' — '),
				state: 'done',
				ms: t() - carryAt,
				chars: stats.carriedChars,
				refs: loaded.map(({ entity }) => entity.ref)
			});
		}

		const relatedRecords = [...related]
			.map(([id, p]) => entityRecord(byId.get(id)!, p))
			.sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
		send({ type: 'thread_found', alias, t: t(), records: relatedRecords });
		step({
			id: 'search',
			kind: 'search',
			label: continues
				? 'Skipped the search: continuing last turn'
				: related.size
					? `Found ${related.size} related records`
					: 'No clear matches; using the whole index',
			detail: relatedRecords
				.slice(0, 4)
				.map((record) => clip(record.title, 40))
				.join(' · '),
			state: 'done',
			ms: t() - searchAt,
			refs: relatedRecords.map((record) => record.ref)
		});

		// 3. Reads and decisions.
		send({ type: 'thread_status', alias, t: t(), stage: 'working' });
		const index = buildProjectIndex(entities, related, marks);
		const userPrompt = buildThreadPrompt({
			projectName: project.project.name,
			projectDescription: project.project.description ?? null,
			today: input.today,
			pieces: input.pieces,
			index: index.text,
			hidden: index.hidden,
			history: input.history,
			carried
		});

		const known = {
			records: new Map(
				entities.map((entity) => [
					entity.ref,
					entityRecord(entity, related.get(entity.id) ?? null)
				])
			),
			pieces: new Set(input.pieces.map((piece) => piece.n))
		};
		const buffer = new LineBuffer();
		let keepLine: KeepLine | null = null;
		// During the repair round, pieces already decided are ignored: a model that rewrites
		// every line would otherwise duplicate changes and burn question numbers.
		let decidedBeforeRepair: Set<number> | null = null;
		// Pieces this thread says belong to another project; the turn re-routes them.
		const elsewhere: ElsewhereLine[] = [];
		const handle = (lines: string[]) => {
			for (const line of lines) {
				const keep = readKeepLine(line);
				if (keep) {
					keepLine = keep;
					continue;
				}
				const away = readElsewhereLine(line, known.pieces);
				if (away) {
					if (!elsewhere.some((entry) => entry.piece === away.piece)) {
						elsewhere.push(away);
						step({
							id: `elsewhere-${away.piece}`,
							kind: 'elsewhere',
							label: 'Not in this project; handing it back',
							detail: `"${clip(away.lookFor, 60)}"${away.why ? ` — ${clip(away.why, 80)}` : ''}`,
							state: 'done'
						});
					}
					continue;
				}
				const read = readChatThreadLine(line, known);
				if (read.type === 'change' && decidedBeforeRepair?.has(read.change.piece)) continue;
				if (read.type === 'change') {
					const key = changeKey(read.change);
					const at = changes.findIndex((existing) => existing.key === key);
					const earlier = at >= 0 ? changes[at] : null;
					const change: ChatChange = {
						...read.change,
						key,
						...(read.change.status === 'ask'
							? { qn: earlier?.qn ?? input.nextQuestion() }
							: {})
					};
					if (earlier) {
						changes[at] = change;
						send({ type: 'thread_change', alias, t: t(), change, replaces: key });
					} else {
						changes.push(change);
						send({ type: 'thread_change', alias, t: t(), change });
					}
				} else if (!line.startsWith('```')) {
					send({
						type: 'thread_skip',
						alias,
						t: t(),
						line: line.slice(0, 200),
						reason: read.reason
					});
				}
			}
		};

		const budget = createThreadBudget();
		// What the current read round brought in; extending the budget is earned by this.
		let roundYield: RoundYield = { fresh: 0, freshChars: 0 };
		const traces: ReadTrace[] = [];
		// What is already in front of the model, by record id: 'whole' or the section anchors.
		const have = new Map<string, 'whole' | Set<string>>();
		const wholeAsked = new Set<string>();
		for (const { item } of loaded) {
			have.set(item.id, item.anchors.length ? new Set(item.anchors) : 'whole');
		}
		const runRead = async (call: ToolCall, round: number): Promise<string> => {
			// Keyed by round too: some providers reuse tool-call ids across rounds.
			const id = `read-${round}-${call.id}`;
			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
			} catch {
				return 'Arguments were not valid JSON.';
			}
			const ref = typeof args.ref === 'string' ? args.ref.trim() : '';
			const entity = byRef.get(ref);
			if (!entity) return `No record ${ref || '(none)'} in this project.`;
			const wantsDoc = call.function.name === 'read_doc' && entity.kind === 'document';
			const requested = Array.isArray(args.sections)
				? args.sections.filter((value): value is string => typeof value === 'string')
				: [];
			const asked = wantsDoc ? resolveSections(entity, requested) : null;
			// Skip what is already loaded: carried from last turn, or read earlier this turn.
			const held = have.get(entity.id);
			const already = asked?.anchors.length
				? asked.anchors.filter((anchor) => held === 'whole' || held?.has(anchor))
				: [];
			const fresh = asked?.anchors.filter((anchor) => !already.includes(anchor)) ?? [];
			const duplicate = asked?.anchors.length
				? fresh.length === 0
				: held === 'whole' || (entity.kind === 'document' && wholeAsked.has(entity.id));
			if (duplicate) {
				stats.rereadsSkipped += 1;
				step({
					id,
					kind: 'read',
					label: 'Skipped a reread',
					detail: `${clip(entity.title, 60)} is already loaded`,
					state: 'done',
					ms: 0,
					refs: [entity.ref]
				});
				return `${entity.title}: already loaded above${carriedLoaded.has(entity.id) ? ' (carried from last turn)' : ''}. Use that text; no need to read it again.`;
			}
			if (!readFits(budget, pool)) return 'Read limit reached. Decide with what you have.';
			budget.reads += 1;
			// Reserve the most a read can return before it starts: reads in a round run in
			// parallel, so checking after they finish let a round overshoot the caps.
			const reserved = READ_RESULT_MAX_CHARS;
			budget.readChars += reserved;
			pool.readChars -= reserved;
			const startedRead = t();
			const sections = asked
				? {
						...asked,
						anchors: fresh,
						headings: asked.headings.filter(
							(_, index) => !already.includes(asked.anchors[index] ?? '')
						)
					}
				: null;
			// Claim it before the read starts: reads in one round run in parallel.
			const claimed = sections?.anchors ?? [];
			if (claimed.length) {
				const set = held instanceof Set ? held : new Set<string>();
				claimed.forEach((anchor) => set.add(anchor));
				have.set(entity.id, set);
			} else if (entity.kind === 'document') wholeAsked.add(entity.id);
			else have.set(entity.id, 'whole');
			const target =
				sections && sections.headings.length
					? `${clip(entity.title, 40)} › ${sections.headings.map((heading) => clip(heading, 30)).join(', ')}`
					: clip(entity.title, 60);
			const label = wantsDoc
				? sections?.headings.length
					? 'Read sections'
					: 'Read document'
				: `Read ${entity.kind}`;
			step({ id, kind: 'read', label, detail: target, state: 'running', refs: [entity.ref] });
			try {
				const result = wantsDoc
					? await input.reads.readDoc(entity, sections?.anchors ?? [])
					: await input.reads.readRecord(entity);
				const whole = documentChars(entity);
				readLog.push(
					`${target}${wantsDoc && whole ? ` (${kchars(result.chars)} of ${kchars(whole)})` : ''}`
				);
				const anchors = claimed;
				if (
					entity.kind === 'document' &&
					!anchors.length &&
					result.chars <= READ_RESULT_MAX_CHARS
				)
					have.set(entity.id, 'whole');
				stats.reads += 1;
				stats.readChars += Math.min(result.chars, READ_RESULT_MAX_CHARS);
				const got = Math.min(result.text.length, READ_RESULT_MAX_CHARS);
				// Settle the reservation to what actually came back.
				budget.readChars += got - reserved;
				pool.readChars -= got - reserved;
				if (got > 0) {
					roundYield.fresh += 1;
					roundYield.freshChars += got;
				}
				traces.push({
					id: entity.id,
					kind: entity.kind as ReadTrace['kind'],
					title: entity.title,
					anchors,
					headings: sections?.headings ?? [],
					version: entity.version ?? null,
					chars: Math.min(result.chars, READ_RESULT_MAX_CHARS),
					whole: wantsDoc && !anchors.length,
					docChars: whole
				});
				step({
					id,
					kind: 'read',
					label,
					detail: `${target}${sections?.missing.length ? ` (no section "${sections.missing.join('", "')}")` : ''}`,
					state: 'done',
					ms: t() - startedRead,
					chars: result.chars,
					refs: [entity.ref]
				});
				const skipped = already.length
					? `\n(Already loaded above, not repeated: ${asked!.headings
							.filter((_, index) => already.includes(asked!.anchors[index] ?? ''))
							.join(', ')}.)`
					: '';
				const note = sections?.missing.length
					? `\n(Not found: ${sections.missing.join(', ')}. Headings: ${entity.sections
							.map((s) => s.heading)
							.slice(0, 20)
							.join(' · ')})`
					: '';
				return result.text + note + skipped;
			} catch (error) {
				step({
					id,
					kind: 'read',
					label,
					detail: target,
					state: 'failed',
					ms: t() - startedRead,
					refs: [entity.ref]
				});
				// A failed read costs nothing: give back its reservation and its slot.
				budget.readChars -= reserved;
				pool.readChars += reserved;
				budget.reads -= 1;
				// Release the claim so a retry can read it.
				const current = have.get(entity.id);
				if (claimed.length && current instanceof Set)
					claimed.forEach((anchor) => current.delete(anchor));
				else if (entity.kind === 'document') wholeAsked.delete(entity.id);
				else if (held === undefined) have.delete(entity.id);
				return `Read failed: ${error instanceof Error ? error.message : 'unknown error'}`;
			}
		};

		const messages: {
			role: string;
			content: unknown;
			tool_calls?: unknown[];
			tool_call_id?: string;
		}[] = [
			{ role: 'system', content: CHAT_THREAD_SYSTEM_PROMPT },
			{ role: 'user', content: userPrompt }
		];

		// One model round: stream it, keep decisions as they arrive. Retried once if it fails or
		// stalls before producing anything (runModelCall).
		const modelRound = async (
			round: number,
			options: { forced: boolean; deciding: boolean }
		): Promise<{ text: string; toolCalls: ToolCall[]; provider: string }> => {
			const toolCalls: ToolCall[] = [];
			let text = '';
			let provider = '';
			promptChars += messageChars(messages);
			stats.rounds += 1;
			if (input.replay) {
				const scripted = input.replay.rounds[round];
				await wait(550, signal);
				if (scripted && 'fail' in scripted) throw new Error(scripted.fail);
				if (scripted && 'reads' in scripted && !options.deciding) {
					scripted.reads.forEach((read, index) =>
						toolCalls.push({
							id: `r${round}-${index}`,
							function: { name: read.tool, arguments: JSON.stringify(read.args) }
						})
					);
				} else if (scripted && 'answer' in scripted) {
					for (let at = 0; at < scripted.answer.length; at += 16) {
						if (signal.aborted) break;
						text += scripted.answer.slice(at, at + 16);
						handle(buffer.push(scripted.answer.slice(at, at + 16)));
						await wait(25, signal);
					}
				}
				calls += 1;
				return { text, toolCalls, provider };
			}
			if (!input.llm) return { text, toolCalls, provider };
			const llm = input.llm;
			await runModelCall({
				open: (callSignal) =>
					llm.streamText({
						messages,
						tools: [...THREAD_TOOLS],
						tool_choice: options.forced ? 'none' : 'auto',
						userId: input.userId,
						models: [...JSON_PROFILE_MODELS.fast],
						temperature: 0.1,
						maxTokens: 2500,
						reasoning: { enabled: false },
						providerRouting: {
							...LAB_PROVIDER_ROUTING,
							order: [...LAB_PROVIDER_ROUTING.order],
							ignore: [...LAB_PROVIDER_ROUTING.ignore]
						},
						signal: callSignal,
						operationType: CHAT_THREAD_OPERATION,
						contextType: 'thread_chat_lab',
						projectId: input.projectId
					}),
				signal,
				isOutput: (event) =>
					(event.type === 'text' && !!event.content) ||
					(event.type === 'tool_call' && !!event.tool_call?.function?.name),
				errorOf: (event) =>
					event.type === 'error' ? (event.error ?? 'Model stream failed') : null,
				onRetry: (reason) =>
					step({
						id: `retry-call-${round}`,
						kind: 'retry',
						label: 'The model call failed; trying again',
						detail: reason,
						state: 'done'
					}),
				onEvent: (event) => {
					if (event.type === 'text' && event.content) {
						text += event.content;
						handle(buffer.push(event.content));
					}
					if (event.type === 'tool_call' && event.tool_call?.function?.name) {
						toolCalls.push(event.tool_call as ToolCall);
					}
					if (event.type === 'done') {
						calls += 1;
						const usage = (event.usage ?? null) as Record<string, unknown> | null;
						cost += usage && Number(usage.cost) ? Number(usage.cost) : 0;
						const tokens = usageTokens(usage);
						stats.promptTokens += tokens.prompt;
						stats.cachedTokens += tokens.cached;
						provider = event.provider ?? '';
						if (provider && !stats.providers.includes(provider))
							stats.providers.push(provider);
					}
				}
			});
			return { text, toolCalls, provider };
		};

		// Rounds: read while the budget allows (more is earned by finding new material), then
		// decide. The decide round asks in words rather than with tool_choice "none": Relace,
		// Parasail and DeepInfra don't accept "none", so forcing it sent decide rounds to slow
		// hosts with a cold cache (2026-11-05). "none" is a fallback if the model still reads.
		let forceStop = false;
		let wrap: WrapReason | null = null;
		let lastText = '';
		let cut: string | null = null;
		let thinking: ThreadStep | null = null;
		// After a broken call, keep the last line only if it is a whole JSON object.
		const flushWhole = () => {
			const rest = buffer.flush();
			const line = rest[0];
			if (!line) return;
			try {
				JSON.parse(line.replace(/,$/, ''));
				handle(rest);
			} catch {
				// A half-written line: drop it.
			}
		};
		try {
			for (let round = 0; round < THREAD_BUDGET.maxReadRounds + 3; round += 1) {
				if (signal.aborted) break;
				if (round > 0 && !wrap) {
					const verdict = nextBudget(budget, roundYield, pool, t() - startedAt);
					if (verdict.action === 'extend') {
						extendBudget(budget);
						step({
							id: `budget-${round}`,
							kind: 'budget',
							label: 'Found more; reading further',
							detail: `up to ${budget.allowedReadRounds} read rounds, ${budget.allowedReads} reads`,
							state: 'done'
						});
					} else if (verdict.action === 'wrap') {
						wrap = verdict.reason;
						messages.push({ role: 'user', content: wrapMessage(verdict.reason) });
						if (round > 1 || verdict.reason !== 'budget')
							step({
								id: `budget-${round}`,
								kind: 'budget',
								label: wrapLabel(verdict.reason),
								detail: `${budget.reads} read${budget.reads === 1 ? '' : 's'} · ${kchars(budget.readChars)}`,
								state: 'done'
							});
					}
				}
				const deciding = wrap !== null;
				const forced = forceStop;
				const decideId = `decide-${round}`;
				const decideAt = t();
				thinking = {
					id: decideId,
					kind: 'decide',
					label: round === 0 ? 'Thinking' : 'Thinking again',
					detail: '',
					state: 'running'
				};
				step(thinking);
				const { text, toolCalls, provider } = await modelRound(round, { forced, deciding });
				thinking = null;
				lastText = text;
				handle(buffer.flush());
				step({
					id: decideId,
					kind: 'decide',
					label:
						toolCalls.length && !deciding
							? `Asked for ${toolCalls.length} read${toolCalls.length === 1 ? '' : 's'}`
							: toolCalls.length && !changes.length && !forced
								? 'Asked to read past the limit'
								: 'Decided',
					detail: [
						toolCalls.length && !deciding
							? ''
							: `${changes.length} decision${changes.length === 1 ? '' : 's'}`,
						provider
					]
						.filter(Boolean)
						.join(' · '),
					state: 'done',
					ms: t() - decideAt
				});
				if (!toolCalls.length) break;
				if (deciding) {
					if (forced || changes.length) break;
					forceStop = true;
					continue;
				}

				messages.push({
					role: 'assistant',
					content: text,
					tool_calls: toolCalls.map((call) => ({
						id: call.id,
						type: 'function',
						function: { name: call.function.name, arguments: call.function.arguments }
					}))
				});
				roundYield = { fresh: 0, freshChars: 0 };
				budget.readRounds += 1;
				pool.readRounds -= 1;
				const results = await Promise.all(toolCalls.map((call) => runRead(call, round)));
				toolCalls.forEach((call, index) =>
					messages.push({ role: 'tool', tool_call_id: call.id, content: results[index]! })
				);
			}
		} catch (error) {
			// Don't leave the card's spinner running.
			if (thinking) step({ ...thinking, state: 'failed' });
			// The person pressed Stop: nothing more to do.
			if (input.signal?.aborted) throw error;
			flushWhole();
			const reason = deadline.timedOut()
				? 'ran out of time'
				: error instanceof Error
					? error.message
					: 'the model call failed';
			// Nothing decided yet: let the wrapper try the whole thread again.
			if (!changes.length) throw new Error(reason);
			cut = reason;
		}

		// Pieces with no decision line get one repair round, if there is time.
		const undecided = () =>
			input.pieces.filter(
				(piece) =>
					!changes.some((change) => change.piece === piece.n) &&
					!elsewhere.some((entry) => entry.piece === piece.n)
			);
		const timeLeft = THREAD_BUDGET.hardMs - (t() - startedAt);
		if (!cut && undecided().length && !signal.aborted && !input.replay && timeLeft > 10_000) {
			const missing = undecided();
			decidedBeforeRepair = new Set(changes.map((change) => change.piece));
			// An empty assistant turn trips some fallback models; send it only with content.
			if (lastText.trim()) messages.push({ role: 'assistant', content: lastText });
			messages.push({
				role: 'user',
				content: `You wrote no decision line for ${missing
					.map((piece) => `piece ${piece.n} ("${clip(piece.title, 80)}")`)
					.join(
						', '
					)}. No more reads. Write their decision lines now (use "sure":false and ask if you can't tell), then the keep line.`
			});
			step({
				id: 'repair',
				kind: 'decide',
				label: `Asked about ${missing.length} skipped piece${missing.length === 1 ? '' : 's'}`,
				detail: '',
				state: 'running'
			});
			const repairAt = t();
			let repairFailed = false;
			try {
				await modelRound(THREAD_BUDGET.maxReadRounds + 3, {
					forced: false,
					deciding: true
				});
				handle(buffer.flush());
			} catch (error) {
				if (input.signal?.aborted) throw error;
				repairFailed = true;
				flushWhole();
				if (deadline.timedOut()) cut = 'ran out of time';
			}
			decidedBeforeRepair = null;
			step({
				id: 'repair',
				kind: 'decide',
				label: `Asked about ${missing.length} skipped piece${missing.length === 1 ? '' : 's'}`,
				detail: `${missing.length - undecided().length} now decided`,
				state: repairFailed ? 'failed' : 'done',
				ms: t() - repairAt
			});
		}
		const unfinished = undecided().map((piece) => piece.title);
		if (unfinished.length) {
			step({
				id: 'unfinished',
				kind: 'unfinished',
				label: `Didn't get to ${unfinished.length} piece${unfinished.length === 1 ? '' : 's'}`,
				detail: [cut, unfinished.map((title) => clip(title, 50)).join(' · ')]
					.filter(Boolean)
					.join(' — '),
				state: 'failed'
			});
		}

		// 4. What carries to the next turn.
		const used = new Set<string>();
		for (const change of changes) {
			if (change.op === 'answer') change.records.forEach((record) => used.add(record.id));
			else if (change.op !== 'create') used.add(change.record.id);
		}
		const kept = keepLine as KeepLine | null;
		const keep = kept
			? kept.items.flatMap(({ ref, sections }) => {
					const entity = byRef.get(ref);
					if (!entity) return [];
					const resolved =
						entity.kind === 'document' && sections.length
							? resolveSections(entity, sections)
							: null;
					const trace = traces.find((entry) => entry.id === entity.id);
					return [keptItem(entity, resolved, trace?.chars ?? null)];
				})
			: null;
		const carriedIn: CarryItem[] = [
			...loaded.map(({ item, text }) => ({ ...item, chars: text.length })),
			...rehydrate.changed.map(({ item }) => item),
			...rehydrate.over.map(({ item }) => item)
		];
		workingSet = buildWorkingSet({
			carriedIn,
			reads: traces,
			used,
			keep,
			related: relatedRecords
				.filter((record) => !carriedLoaded.has(record.id))
				.map((record) => ({ id: record.id, kind: record.kind, title: record.title })),
			previousScanned: scannedBefore as ScannedItem[]
		});
		if (workingSet.carry.length || workingSet.scannedCount) {
			step({
				id: 'keep',
				kind: 'keep',
				label: workingSet.carry.length
					? `Carrying ${workingSet.carry.length} to the next turn`
					: 'Nothing to carry to the next turn',
				detail: [
					workingSet.carry.map((item) => carryLabel(item)).join(' · '),
					workingSet.scannedCount ? `${workingSet.scannedCount} looked at` : ''
				]
					.filter(Boolean)
					.join(' — '),
				state: 'done',
				chars: workingSet.carry.reduce((total, item) => total + item.chars, 0)
			});
		}

		const report = buildReport({
			alias,
			projectId: input.projectId,
			project: projectName,
			read: readLog,
			changes,
			failed: null,
			unfinished,
			elsewhere,
			workingSet
		});
		return {
			report,
			calls,
			cost,
			promptChars,
			stats,
			failed: null,
			decided: changes.length,
			retryable: false
		};
	} catch (error) {
		const note = input.signal?.aborted
			? 'Stopped'
			: error instanceof Error
				? error.message
				: 'This project could not be checked';
		const report = buildReport({
			alias,
			projectId: input.projectId,
			project: projectName,
			read: readLog,
			changes,
			failed: note,
			// Keep last turn's set: a failed turn shouldn't wipe what we were working on.
			workingSet: input.carry ?? EMPTY_WORKING_SET
		});
		return {
			report,
			calls,
			cost,
			promptChars,
			stats,
			failed: note,
			decided: changes.length,
			retryable: indexLoaded && !input.signal?.aborted
		};
	} finally {
		deadline.clear();
	}
}
