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
import {
	type ContextEvidenceV1,
	type ContextFinderDecider,
	type ContextFinderReadClient,
	type ContextFinderResultV1,
	type ContextPlanV1,
	findProjectContext,
	loadContextFinderProject,
	renderContextEvidenceBlock,
	renderProjectSnapshotBlock,
	unavailableContextEvidence
} from '@buildos/agentic-chat-runtime/context-finder';
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
};

export type AgenticChatContextFinderPort = {
	find(request: AgenticChatTurnProviderRequestV1): Promise<ChatContextFinding | null>;
};

/**
 * Load + two-stage ranking must fit inside the tool-selection wait or cost little more.
 * Eval (2026-09-22): two-stage p50 552 ms, p95 985 ms. Past the deadline the turn keeps
 * today's context and the chips say so.
 */
export const CHAT_CONTEXT_FINDER_DEADLINE_MS = 2_500;
export const CHAT_CONTEXT_FINDER_JEV_TIMEOUT_MS = 1_500;
/** Send a duplicate Jev request when the first has not answered by then (JevClient hedge). */
export const CHAT_CONTEXT_FINDER_HEDGE_MS = 700;
const MAX_CHIPS = 30;
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
		const outcome = await withFinderDeadline(request, deadlineMs, async (signal) => {
			const project = await loadContextFinderProject(this.options.client, projectId, signal);
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
				usage: {
					operationType: 'agentic_chat_context_finder_chat',
					userId: request.userId,
					projectId,
					chatSessionId: request.sessionId
				}
			});
			if (found.scope !== 'broad') return { found, snapshot: null };
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
		if (outcome.ok) {
			result = outcome.value.found;
			evidence = result.evidence;
			plan = result.plan;
			snapshot = outcome.value.snapshot;
		} else evidence = unavailableContextEvidence(null);

		const selected = evidence.status === 'selected';
		const injection = snapshot
			? [snapshot.block, ...(selected ? [renderContextEvidenceBlock(evidence)] : [])].join(
					'\n\n'
				)
			: selected
				? renderContextEvidenceBlock(evidence)
				: null;
		const payload = buildContextSelectionPayload({
			request,
			evidence,
			plan,
			injected: injection !== null,
			failure,
			elapsedMs: now() - started,
			scope: result?.scope ?? null,
			broadP: result?.ranking?.broadP ?? null,
			snapshot: snapshot ? { chars: snapshot.block.length, cleanup: snapshot.cleanup } : null
		});
		return {
			step: {
				type: 'semantic',
				transitionId: contextSelectionTransitionId(request.turnRunId, payload),
				phase: 'stream',
				eventType: 'context_selection',
				currentActivity: 'Finding relevant project context...',
				eventPayload: payload
			},
			injection
		};
	}
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
}): Extract<AgenticChatProviderStepV1, { type: 'semantic' }>['eventPayload'] {
	const { request, evidence, plan } = input;
	const loaded = new Set(evidence.full.map((item) => item.id));
	const items = (plan?.items ?? []).slice(0, MAX_CHIPS).map((item) => ({
		kind: item.kind,
		id: item.id,
		label: item.title,
		tier: item.tier === 'full' && loaded.has(item.id) ? 'full' : 'summary',
		p: item.p,
		pinned: item.pinned === true,
		sections: item.sections.map((section) => section.heading)
	}));
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
		counts: {
			full: items.filter((item) => item.tier === 'full').length,
			summary: items.filter((item) => item.tier === 'summary').length,
			checked: plan?.checked ?? evidence.ranker?.checked ?? 0
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
		snapshot: input.snapshot ?? null
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
