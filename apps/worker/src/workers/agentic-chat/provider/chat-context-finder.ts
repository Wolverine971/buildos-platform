// apps/worker/src/workers/agentic-chat/provider/chat-context-finder.ts
//
// Ordinary project chat: the shared context finder ranks the project's records for this
// message on the opening pass, concurrently with Jev tool selection. The selection is published
// as a durable `context_selection` event so the UI can show "Working from" chips before the
// answer starts (docs/architecture/CONTEXT_FINDER_2026-09-22.md, "Chat consumer plan").
//
// Modes: shadow publishes a hidden receipt; chips publishes visible chips; on also injects the
// evidence into the opening request. Every failure is fail-open: the turn runs as it does today.
import { createHash } from 'node:crypto';
import {
	type ContextEvidenceV1,
	type ContextFinderDecider,
	type ContextFinderReadClient,
	type ContextPlanV1,
	findProjectContext,
	loadContextFinderProject,
	renderContextEvidenceBlock,
	unavailableContextEvidence
} from '@buildos/agentic-chat-runtime/context-finder';
import type { AgenticChatProviderStepV1, AgenticChatTurnProviderRequestV1 } from './contracts';

export type ChatContextFinderMode = 'off' | 'shadow' | 'chips' | 'on';

export type ChatContextFinding = {
	step: Extract<AgenticChatProviderStepV1, { type: 'semantic' }>;
	/** Evidence block to append to the opening request (`on` only). */
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

export class ChatContextFinder implements AgenticChatContextFinderPort {
	constructor(
		private readonly options: {
			mode: Exclude<ChatContextFinderMode, 'off'>;
			/** Only these users are ranked; an empty list ranks nobody. */
			userIds: readonly string[];
			client: ContextFinderReadClient;
			decider: ContextFinderDecider;
			deadlineMs?: number;
			jevTimeoutMs?: number;
			now?: () => number;
		}
	) {}

	async find(request: AgenticChatTurnProviderRequestV1): Promise<ChatContextFinding | null> {
		const projectId = request.projectId;
		if (!projectId || !this.options.userIds.includes(request.userId.toLowerCase())) return null;
		const turn = turnConversation(request);
		if (!turn) return null;

		const now = this.options.now ?? Date.now;
		const started = now();
		let evidence: ContextEvidenceV1;
		let plan: ContextPlanV1 | null = null;
		const outcome = await withFinderDeadline(
			request,
			this.options.deadlineMs ?? CHAT_CONTEXT_FINDER_DEADLINE_MS,
			async (signal) => {
				const project = await loadContextFinderProject(
					this.options.client,
					projectId,
					signal
				);
				return findProjectContext({
					project,
					message: turn.message,
					decider: this.options.decider,
					recentConversation: turn.recent,
					signal,
					timeoutMs: this.options.jevTimeoutMs ?? CHAT_CONTEXT_FINDER_JEV_TIMEOUT_MS,
					usage: {
						operationType: 'agentic_chat_context_finder_chat',
						userId: request.userId,
						projectId,
						chatSessionId: request.sessionId
					}
				});
			}
		);
		const failure = outcome.ok ? null : outcome.failure;
		if (outcome.ok) {
			evidence = outcome.value.evidence;
			plan = outcome.value.plan;
		} else evidence = unavailableContextEvidence(null);

		const injected = this.options.mode === 'on' && evidence.status === 'selected';
		const payload = buildContextSelectionPayload({
			request,
			mode: this.options.mode,
			evidence,
			plan,
			injected,
			failure,
			elapsedMs: now() - started
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
			injection: injected ? renderContextEvidenceBlock(evidence) : null
		};
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
	request.signal.throwIfAborted();
	const deadline = new AbortController();
	const onAbort = () => deadline.abort(request.signal.reason);
	request.signal.addEventListener('abort', onAbort, { once: true });
	const timer = setTimeout(
		() => deadline.abort(new Error('context_finder_deadline')),
		deadlineMs
	);
	const expired = new Promise<never>((_, reject) => {
		deadline.signal.addEventListener('abort', () => reject(deadline.signal.reason), {
			once: true
		});
	});
	expired.catch(() => undefined);
	try {
		const running = work(deadline.signal);
		// When the deadline wins, the abandoned work may still reject later.
		running.catch(() => undefined);
		return { ok: true, value: await Promise.race([running, expired]) };
	} catch (error) {
		if (request.signal.aborted) throw error;
		return { ok: false, failure: deadline.signal.aborted ? 'deadline' : 'load_or_rank_failed' };
	} finally {
		clearTimeout(timer);
		request.signal.removeEventListener('abort', onAbort);
	}
}

/**
 * Chips carry ids, titles, tiers and section headings only: no record text. Titles stay nested
 * in `items`, because the timeline turns top-level title/summary/message/detail into a step.
 */
export function buildContextSelectionPayload(input: {
	request: AgenticChatTurnProviderRequestV1;
	mode: Exclude<ChatContextFinderMode, 'off'>;
	evidence: ContextEvidenceV1;
	plan: ContextPlanV1 | null;
	injected: boolean;
	failure: string | null;
	elapsedMs: number;
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
		mode: input.mode,
		visible: input.mode !== 'shadow',
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
		elapsed_ms: input.elapsedMs
	};
}

/**
 * Idempotency key derived from the payload: an identical retry is recognised as already
 * persisted, while a retry that ranked differently becomes a new event instead of a
 * transition conflict that would fail the turn. The UI keeps the latest selection.
 */
export function contextSelectionTransitionId(turnRunId: string, payload: unknown): string {
	const bytes = createHash('sha256')
		.update(`agentic-chat-context-selection-v1:${turnRunId}:${JSON.stringify(payload)}`, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
