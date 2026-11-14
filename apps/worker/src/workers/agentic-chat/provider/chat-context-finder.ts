// apps/worker/src/workers/agentic-chat/provider/chat-context-finder.ts
//
// Ordinary project chat: the shared context finder ranks the project's records for this
// message on the opening pass, concurrently with Jev tool selection. The selection is published
// as a durable `context_selection` event so the UI can show "Working from" chips before the
// answer starts (docs/architecture/CONTEXT_FINDER_2026-09-22.md, "Chat consumer plan").
//
// The chips are visible and the evidence is injected into the opening request (the `shadow`
// and `chips` measurement modes were retired with tasker 136). Every failure is fail-open: the
// turn runs without the finder's context.
//
// The off-ramp (rank.ts): Jev also answers whether the request is about the project as a whole.
// A broad request loads only records Jev is sure about plus a whole-project snapshot (snapshot.ts),
// so "does everything look good?" no longer spends rounds fetching overview, cleanup and lists.
import { createHash } from 'node:crypto';
import {
	type ContextCardSectionV1,
	type ContextEvidenceV1,
	type ContextFinderDecider,
	type ContextFinderReadClient,
	type ContextFinderResultV1,
	type ContextPlanV1,
	buildContextFinderEntities,
	contextEvidenceReadTools,
	contextRecordReadTools,
	findProjectContext,
	loadContextFinderPlanText,
	loadContextFinderProject,
	markCarriedDocuments,
	renderContextEvidenceBlock,
	renderProjectSnapshotBlock,
	startHereIds,
	unavailableContextEvidence
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	type CarryItem,
	type TurnWorkingSetV1,
	planTurnCarry,
	readTurnWorkingSetV1,
	renderTurnCarry
} from '@buildos/agentic-chat-runtime/working-set';
import { runWithAbortableDeadline, throwIfAborted } from '../shared/abortable-deadline';
import { stableUuidFromSeed } from '../shared/identity-hash';
import type { AgenticChatProviderStepV1, AgenticChatTurnProviderRequestV1 } from './contracts';

export function allowsContextFinderUser(
	userIds: readonly string[] | 'all',
	userId: string
): boolean {
	return userIds === 'all' || userIds.includes(userId.toLowerCase());
}

export type ChatContextFinding = {
	step: Extract<AgenticChatProviderStepV1, { type: 'semantic' }>;
	/** Evidence block to append to the opening request; null when nothing was found. */
	injection: string | null;
	/**
	 * Tools the injection needs mounted: every tool its text tells the agent to read with (the
	 * section reader for cards and one-line documents, the table tools, a cut record's detail
	 * tool, and the readers of records the carry note names). Tool selection runs before the
	 * injection exists, so it can drop them.
	 */
	toolPins?: readonly string[];
};

/** Size and SHA-256 of the exact text a finder adds to the prompt (the turn stores the text). */
export function contextInjectionReceipt(
	injection: string | null
): { chars: number; sha256: string } | null {
	return injection
		? {
				chars: injection.length,
				sha256: createHash('sha256').update(injection, 'utf8').digest('hex')
			}
		: null;
}

export type AgenticChatContextFinderPort = {
	find(request: AgenticChatTurnProviderRequestV1): Promise<ChatContextFinding | null>;
};

/**
 * Load + two-stage ranking (+ reloading last turn's carry) should fit inside the tool-selection
 * wait or cost little more. Eval (2026-09-22): two-stage p50 552 ms, p95 985 ms. Raised from
 * 2.5 s to 4 s on 2026-11-05 (DJ): the carry rides inside it, and a slow turn losing its
 * context costs more than a second of waiting. Past the deadline the turn keeps today's context.
 */
export const CHAT_CONTEXT_FINDER_DEADLINE_MS = 4_000;
export const CHAT_CONTEXT_FINDER_JEV_TIMEOUT_MS = 1_500;
/** Send a duplicate Jev request when the first has not answered by then (JevClient hedge). */
export const CHAT_CONTEXT_FINDER_HEDGE_MS = 700;
const MAX_CHIPS = 30;
/**
 * The carry read (one indexed row) gets this long, counted from the start of the turn's finder
 * work, so a slow read costs this turn its carry and never the rest of the finder's deadline.
 */
export const CHAT_CONTEXT_FINDER_CARRY_READ_MS = 1_200;
/**
 * The cleanup set and the user's timezone load beside the ranking; a broad turn waits at
 * most this much longer for them, then goes out with what it has.
 */
export const CHAT_CONTEXT_FINDER_CLEANUP_GRACE_MS = 300;
/** Leave this much of the deadline unused so a slow extra read never costs the snapshot. */
const CLEANUP_DEADLINE_MARGIN_MS = 150;

/** The project's open cleanup set as get_project_cleanup returns it (bootstrap wires it). */
export type ChatContextFinderCleanupLoader = (projectId: string) => Promise<unknown>;
/** The user's IANA timezone (`users.timezone`), or null. */
export type ChatContextFinderTimezoneLoader = (userId: string) => Promise<string | null>;
/** The session's latest `last_turn_context.working_set` (tasker 153), or null. */
export type ChatContextFinderWorkingSetLoader = (input: {
	sessionId: string;
	userId: string;
}) => Promise<unknown>;

/**
 * What the turn carried in from the last one: loaded items, the set for the finalizer, and how
 * many records the block names without loading (shown as notes, not chips).
 */
export type ChatTurnCarry = {
	loaded: CarryItem[];
	carryIn: TurnWorkingSetV1;
	notes?: { changed: number; notLoaded: number };
};

/** The value, or null after `ms`. Never rejects. */
function withinMs<T>(work: Promise<T>, ms: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		work.catch(() => null),
		new Promise<null>((resolve) => {
			timer = setTimeout(() => resolve(null), ms);
		})
	]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

export class ChatContextFinder implements AgenticChatContextFinderPort {
	constructor(
		private readonly options: {
			/** Allowlisted ids, or 'all'. An empty list ranks nobody. */
			userIds: readonly string[] | 'all';
			client: ContextFinderReadClient;
			decider: ContextFinderDecider;
			/** Adds the open cleanup set to a broad request's snapshot. */
			loadCleanup?: ChatContextFinderCleanupLoader;
			/** Shows the snapshot's dates in the user's zone. */
			loadTimezone?: ChatContextFinderTimezoneLoader;
			/**
			 * Carry (tasker 153): users whose follow-ups start with what the last turn used,
			 * already loaded. Ids or 'all'; absent or empty carries for nobody.
			 */
			carry?: {
				userIds: readonly string[] | 'all';
				load: ChatContextFinderWorkingSetLoader;
				/** Limit for the carry read; defaults to CHAT_CONTEXT_FINDER_CARRY_READ_MS. */
				readMs?: number;
			};
			deadlineMs?: number;
			jevTimeoutMs?: number;
			now?: () => number;
		}
	) {}

	async find(request: AgenticChatTurnProviderRequestV1): Promise<ChatContextFinding | null> {
		const projectId = request.projectId;
		if (!projectId || !allowsContextFinderUser(this.options.userIds, request.userId))
			return null;
		const turn = turnConversation(request);
		if (!turn) return null;

		const now = this.options.now ?? Date.now;
		const started = now();
		const deadlineMs = this.options.deadlineMs ?? CHAT_CONTEXT_FINDER_DEADLINE_MS;
		let evidence: ContextEvidenceV1;
		let plan: ContextPlanV1 | null = null;
		let result: ContextFinderResultV1 | null = null;
		let snapshot: { block: string; cleanup: boolean } | null = null;
		let carried: (ChatTurnCarry & { block: string }) | null = null;
		const carryOption = this.options.carry;
		// Read beside the project load, with its own short limit; a failed or slow read only
		// means this turn starts fresh.
		const priorSet =
			carryOption &&
			request.sessionId &&
			allowsContextFinderUser(carryOption.userIds, request.userId)
				? withinMs(
						carryOption.load({ sessionId: request.sessionId, userId: request.userId }),
						carryOption.readMs ?? CHAT_CONTEXT_FINDER_CARRY_READ_MS
					)
				: null;
		const outcome = await withFinderDeadline(request, deadlineMs, async (signal) => {
			const project = await loadContextFinderProject(this.options.client, projectId, signal);
			// Last turn's working set: ids checked against this project's index, text reloaded
			// from the database (never trusted from the stored set), loaded beside the ranking.
			const set = priorSet ? readTurnWorkingSetV1(await priorSet, projectId) : null;
			const carryEntities = set ? buildContextFinderEntities(project) : null;
			const carryPlan =
				set && carryEntities ? planTurnCarry({ set, entities: carryEntities }) : null;
			// Carried records are already in the prompt whole; don't rank them again. A carried
			// document holds only the sections read before, so it stays rankable: a follow-up
			// about another part of it still gets its card and flags.
			const carriedIds = new Set(
				(carryPlan?.plan.load ?? [])
					.filter(({ item }) => item.kind !== 'document')
					.map(({ item }) => item.id)
			);
			const carryText =
				carryPlan && carryEntities
					? loadContextFinderPlanText({
							project,
							entities: carryEntities,
							plan: null,
							extraIds: carryPlan.textIds,
							signal
						})
					: null;
			const finishCarry = async () =>
				set && carryPlan && carryText
					? renderTurnCarry({ set, plan: carryPlan.plan, entities: await carryText })
					: null;
			// Started once the project is in, beside the ranking, so a broad request rarely
			// waits for them; both are dropped when the request turns out to be specific.
			const cleanup = this.options.loadCleanup
				? this.options.loadCleanup(projectId).then(
						(value) => value ?? null,
						() => null
					)
				: null;
			const timeZone = this.options.loadTimezone
				? this.options.loadTimezone(request.userId).then(
						(value) => value ?? null,
						() => null
					)
				: null;
			const found = await findProjectContext({
				project,
				message: turn.message,
				decider: this.options.decider,
				recentConversation: turn.recent,
				signal,
				timeoutMs: this.options.jevTimeoutMs ?? CHAT_CONTEXT_FINDER_JEV_TIMEOUT_MS,
				// The off-ramp (rank.ts): is this about the project as a whole?
				askBroad: true,
				...(carriedIds.size
					? { skipIds: new Set([...startHereIds(project), ...carriedIds]) }
					: {}),
				usage: {
					operationType: 'agentic_chat_context_finder_chat',
					userId: request.userId,
					projectId,
					chatSessionId: request.sessionId
				}
			});
			const carry = await finishCarry();
			if (found.scope !== 'broad') return { found, snapshot: null, carry };
			const graceMs = Math.min(
				CHAT_CONTEXT_FINDER_CLEANUP_GRACE_MS,
				deadlineMs - (now() - started) - CLEANUP_DEADLINE_MARGIN_MS
			);
			const [cleanupSet, userTimeZone] = await Promise.all([
				cleanup ? settleWithin(cleanup, graceMs, signal) : null,
				timeZone ? settleWithin(timeZone, graceMs, signal) : null
			]);
			return {
				found,
				carry,
				snapshot: {
					block: renderProjectSnapshotBlock({
						project,
						now: new Date(now()),
						cleanup: cleanupSet,
						timeZone: userTimeZone
					}),
					cleanup: cleanupSet !== null
				}
			};
		});
		const failure = outcome.ok ? null : outcome.failure;
		// The set the finalizer fades. When the finder missed its deadline or failed, or the
		// carry could not be rendered, last turn's set passes through unchanged: a slow turn
		// must not erase what the conversation was working from.
		let carryIn: TurnWorkingSetV1 | null = null;
		if (outcome.ok) {
			result = outcome.value.found;
			plan = result.plan;
			snapshot = outcome.value.snapshot;
			const carry = outcome.value.carry;
			if (carry?.block) carried = carry;
			if (carry) carryIn = carry.carryIn;
			// A picked document whose sections are carried says so on its card.
			evidence = markCarriedDocuments(
				result.evidence,
				carriedDocumentSections(carried?.loaded ?? [])
			);
		} else evidence = unavailableContextEvidence(null);
		if (!carryIn && priorSet) carryIn = readTurnWorkingSetV1(await priorSet, projectId);

		const selected = evidence.status === 'selected';
		const parts = [
			...(carried ? [carried.block] : []),
			...(snapshot ? [snapshot.block] : []),
			...(selected ? [renderContextEvidenceBlock(evidence)] : [])
		];
		const injection = parts.length ? parts.join('\n\n') : null;
		const payload = buildContextSelectionPayload({
			request,
			evidence,
			plan,
			injected: injection !== null,
			failure,
			elapsedMs: now() - started,
			scope: result?.scope ?? null,
			broadP: result?.ranking?.broadP ?? null,
			snapshot: snapshot ? { chars: snapshot.block.length, cleanup: snapshot.cleanup } : null,
			carried,
			carryIn,
			injection: contextInjectionReceipt(injection)
		});
		const toolPins = injection
			? [
					...new Set([
						...(selected ? contextEvidenceReadTools(evidence) : []),
						...(carried ? carryReadTools(carried) : [])
					])
				]
			: [];
		return {
			step: {
				type: 'semantic',
				transitionId: contextSelectionTransitionId(request.turnRunId, payload),
				phase: 'stream',
				eventType: 'context_selection',
				currentActivity: 'Finding relevant project context...',
				eventPayload: payload
			},
			injection,
			...(toolPins.length ? { toolPins } : {})
		};
	}
}

/** Carried documents by id: the sections whose text is loaded, or 'whole'. */
function carriedDocumentSections(
	loaded: readonly CarryItem[]
): Map<string, ContextCardSectionV1[] | 'whole'> {
	return new Map(
		loaded
			.filter((item) => item.kind === 'document')
			.map((item): [string, ContextCardSectionV1[] | 'whole'] => [
				item.id,
				item.anchors.length
					? item.anchors.map((anchor, i) => ({
							heading: item.headings[i] ?? anchor,
							anchor
						}))
					: 'whole'
			])
	);
}

/**
 * Readers for what the carry block names: loaded documents (the agent may want another
 * section) and every record listed as changed or not loaded ("read it if you need it").
 */
function carryReadTools(carried: ChatTurnCarry): string[] {
	const loadedIds = new Set(carried.loaded.map((item) => item.id));
	const kinds = new Set([
		...carried.loaded.filter((item) => item.kind === 'document').map((item) => item.kind),
		...carried.carryIn.carry.filter((item) => !loadedIds.has(item.id)).map((item) => item.kind),
		...carried.carryIn.scanned.map((item) => item.kind)
	]);
	return [...kinds].flatMap((kind) => [...contextRecordReadTools(kind)]);
}

/**
 * The value, or null once `ms` passes or the turn's finder work is aborted. Never rejects:
 * a missing cleanup set only leaves it out of the snapshot.
 */
async function settleWithin<T>(
	work: Promise<T | null>,
	ms: number,
	signal: AbortSignal
): Promise<T | null> {
	if (ms <= 0 || signal.aborted) {
		// Already settled values still count; anything pending is dropped.
		return Promise.race([work, Promise.resolve(null)]);
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: (() => void) | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), ms);
				onAbort = () => resolve(null);
				signal.addEventListener('abort', onAbort, { once: true });
			})
		]);
	} finally {
		if (timer) clearTimeout(timer);
		if (onAbort) signal.removeEventListener('abort', onAbort);
	}
}

/** The latest user message and up to six turns before it (Jev's recent_conversation). */
export function turnConversation(
	request: AgenticChatTurnProviderRequestV1
): { message: string; recent: { role: string; content: string }[] } | null {
	const conversation = request.messages.filter(
		(m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
	);
	let currentIndex = conversation.length - 1;
	while (currentIndex >= 0 && conversation[currentIndex]!.role !== 'user') currentIndex--;
	const message = conversation[currentIndex]?.content;
	if (typeof message !== 'string' || !message.trim()) return null;
	return {
		message,
		recent: conversation
			.slice(Math.max(0, currentIndex - 6), currentIndex)
			.map((m) => ({ role: m.role, content: String(m.content) }))
	};
}

/**
 * Runs finder work against a deadline and the turn's own cancellation. The work is also raced,
 * so a dependency that ignores the abort signal cannot hold the turn. A cancelled turn still
 * throws; every other failure is reported so the caller keeps today's context.
 */
export async function withFinderDeadline<T>(
	request: AgenticChatTurnProviderRequestV1,
	deadlineMs: number,
	work: (signal: AbortSignal) => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; failure: 'deadline' | 'load_or_rank_failed' }> {
	// An already-cancelled turn spends nothing.
	throwIfAborted(request.signal);
	let expired = false;
	try {
		const value = await runWithAbortableDeadline({
			parentSignal: request.signal,
			timeoutMs: deadlineMs,
			createTimeoutError() {
				expired = true;
				return new Error('context_finder_deadline');
			},
			run: work
		});
		return { ok: true, value };
	} catch (error) {
		if (request.signal.aborted) throw error;
		return { ok: false, failure: expired ? 'deadline' : 'load_or_rank_failed' };
	}
}

type SelectionChip = {
	kind: ContextEvidenceV1['full'][number]['kind'];
	id: string;
	label: string;
	tier: 'full' | 'summary';
	given: 'text' | 'card' | 'line';
	partial?: true;
	p: number | null;
	pinned: boolean;
	sections: string[];
	carried?: true;
	project_id?: string;
};

/**
 * Chips for what the evidence block actually holds, built from the rendered evidence (never the
 * plan, which also lists items that did not fit): `text` for a record, a short document shown
 * whole or loaded sections, `card` for a document card, `line` for a one-line summary.
 */
export function contextEvidenceChips(evidence: ContextEvidenceV1): SelectionChip[] {
	const full = evidence.full.map((item): SelectionChip => {
		const given =
			item.given ?? (item.excerpts.length || item.card?.text ? 'text' : ('card' as const));
		return {
			kind: item.kind,
			id: item.id,
			label: item.title,
			tier: 'full',
			given,
			...(given === 'text' && item.partial ? { partial: true as const } : {}),
			p: item.p,
			pinned: item.pinned === true,
			sections: item.excerpts.length
				? item.excerpts.flatMap((excerpt) => (excerpt.heading ? [excerpt.heading] : []))
				: (item.card?.flagged ?? []).map((section) => section.heading)
		};
	});
	const lines = evidence.summaries.map(
		(item): SelectionChip => ({
			kind: item.kind,
			id: item.id,
			label: item.title,
			tier: 'summary',
			given: 'line',
			p: item.p,
			pinned: false,
			sections: []
		})
	);
	return [...full, ...lines];
}

/**
 * Chips carry ids, titles, tiers and section headings only: no record text. Titles stay nested
 * in `items`, because the timeline turns top-level title/summary/message/detail into a step.
 */
export function buildContextSelectionPayload(input: {
	request: AgenticChatTurnProviderRequestV1;
	evidence: ContextEvidenceV1;
	plan: ContextPlanV1 | null;
	injected: boolean;
	failure: string | null;
	elapsedMs: number;
	/** The off-ramp's answer (rank.ts); null when Jev did not answer it. */
	scope?: 'broad' | 'specific' | null;
	broadP?: number | null;
	/** Size of the injected whole-project snapshot, when one went out. */
	snapshot?: { chars: number; cleanup: boolean } | null;
	/** What the turn carried in from the last one (tasker 153). */
	carried?: ChatTurnCarry | null;
	/**
	 * The set the finalizer fades. Defaults to `carried.carryIn`; set on its own when the carry
	 * did not render (finder deadline or failure), so last turn's set is not erased.
	 */
	carryIn?: TurnWorkingSetV1 | null;
	/** Size and hash of the exact text added to the prompt. */
	injection?: { chars: number; sha256: string } | null;
}): Extract<AgenticChatProviderStepV1, { type: 'semantic' }>['eventPayload'] {
	const { request, evidence, plan } = input;
	const ranked = evidence.status === 'selected' ? contextEvidenceChips(evidence) : [];
	const rankedById = new Map(ranked.map((chip) => [chip.id, chip]));
	// One chip per record: a carried document that was also picked keeps its carried chip (its
	// text is in the prompt) and gains the sections flagged on its card.
	const carriedChips = (input.carried?.loaded ?? []).map((item): SelectionChip => {
		const also = rankedById.get(item.id);
		return {
			kind: item.kind,
			id: item.id,
			label: item.title,
			tier: 'full',
			given: 'text',
			p: also?.p ?? null,
			pinned: false,
			sections: [
				...item.headings,
				...(also?.sections ?? []).filter((heading) => !item.headings.includes(heading))
			],
			carried: true
		};
	});
	const carriedIds = new Set(carriedChips.map((chip) => chip.id));
	const picked = ranked.filter((chip) => !carriedIds.has(chip.id));
	const items = [...carriedChips, ...picked].slice(0, MAX_CHIPS);
	const notes = input.carried?.notes;
	const carryIn = input.carryIn ?? input.carried?.carryIn ?? null;
	return {
		type: 'context_selection',
		version: 1,
		// Kept in the payload for the shared contract, which still reads older shadow/chips rows.
		mode: 'on',
		visible: true,
		injected: input.injected,
		status: evidence.status,
		failure: input.failure,
		client_turn_id: request.clientTurnId,
		turn_run_id: request.turnRunId,
		project_id: request.projectId,
		items,
		// Picks only: carried items are counted apart, never inside `full`.
		counts: {
			full: items.filter((item) => item.tier === 'full' && !item.carried).length,
			summary: items.filter((item) => item.tier === 'summary').length,
			checked: plan?.checked ?? evidence.ranker?.checked ?? 0,
			carried: items.filter((item) => item.carried).length
		},
		coverage: evidence.coverage,
		ranker: evidence.ranker
			? {
					status: evidence.ranker.status,
					duration_ms: evidence.ranker.durationMs,
					cost_usd: evidence.ranker.costUsd,
					model: evidence.ranker.model
				}
			: null,
		elapsed_ms: input.elapsedMs,
		scope: input.scope ?? null,
		broad_p: input.broadP ?? null,
		snapshot: input.snapshot ?? null,
		// Records the carry block names without loading: handed to the model, no chip.
		notes:
			notes && (notes.changed || notes.notLoaded)
				? { changed: notes.changed, not_loaded: notes.notLoaded }
				: null,
		injection: input.injection ?? null,
		// Pointers only: the finalizer fades what this turn carried in but didn't use.
		...(carryIn ? { carry_in: carryIn } : {})
	};
}

/**
 * Idempotency key derived from the payload: an identical retry is recognised as already
 * persisted, while a retry that ranked differently becomes a new event instead of a
 * transition conflict that would fail the turn. The UI keeps the latest selection.
 */
export function contextSelectionTransitionId(turnRunId: string, payload: unknown): string {
	return stableUuidFromSeed(
		`agentic-chat-context-selection-v1:${turnRunId}:${JSON.stringify(payload)}`
	);
}
