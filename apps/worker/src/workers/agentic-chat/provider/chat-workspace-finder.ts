// apps/worker/src/workers/agentic-chat/provider/chat-workspace-finder.ts
//
// Global chat (no project in focus): Jev decides which projects the message is about (hop 1,
// always) and, only when the message looks for something specific, ranks records inside them
// (hop 2). Published as the same durable `context_selection` event as project chat, with the
// focused projects on top, so the UI shows "Looking in: …" before the answer starts.
// Design: docs/architecture/JEV_GLOBAL_CONTEXT_2026-09-23.md.
//
// Modes: shadow publishes a hidden receipt; chips publishes visible chips; on also injects the
// block. Every failure is fail-open: the turn keeps today's global prompt.
import {
	findWorkspaceContext,
	loadContextFinderProject,
	loadWorkspaceFinderProjects,
	renderWorkspaceContextBlock,
	type ContextFinderDecider,
	type WorkspaceContextV1,
	type WorkspaceFinderDecider,
	type WorkspaceFinderReadClient
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	contextSelectionTransitionId,
	turnConversation,
	withFinderDeadline,
	type AgenticChatContextFinderPort,
	type ChatContextFinderMode,
	type ChatContextFinding
} from './chat-context-finder';
import type { AgenticChatProviderStepV1, AgenticChatTurnProviderRequestV1 } from './contracts';

/**
 * Card load (~3 round trips) + hop 1 + optional hop 2. Measured 2026-09-23: hedged hop 1 p50
 * 662 ms, max 1.3 s over 48 calls. Hop 2 gets its own window after hop 1 and falls back to
 * the project brief when it misses it.
 */
export const CHAT_WORKSPACE_FINDER_DEADLINE_MS = 3_500;
export const CHAT_WORKSPACE_HOP1_TIMEOUT_MS = 2_000;
export const CHAT_WORKSPACE_HOP2_TIMEOUT_MS = 1_300;
export const CHAT_WORKSPACE_HOP2_DEADLINE_MS = 1_600;
const GLOBAL_CONTEXT_TYPES = new Set(['global', 'general']);
const MAX_CHIPS = 30;

export class ChatWorkspaceFinder implements AgenticChatContextFinderPort {
	constructor(
		private readonly options: {
			mode: Exclude<ChatContextFinderMode, 'off'>;
			/** Only these users are ranked; an empty list ranks nobody. */
			userIds: readonly string[];
			/** Service client: access is decided by the accessible-projects RPC in the loader. */
			client: WorkspaceFinderReadClient;
			decider: WorkspaceFinderDecider & ContextFinderDecider;
			deadlineMs?: number;
			now?: () => number;
		}
	) {}

	async find(request: AgenticChatTurnProviderRequestV1): Promise<ChatContextFinding | null> {
		if (request.projectId || !GLOBAL_CONTEXT_TYPES.has(request.contextType)) return null;
		if (!this.options.userIds.includes(request.userId.toLowerCase())) return null;
		const turn = turnConversation(request);
		if (!turn) return null;

		const now = this.options.now ?? Date.now;
		const started = now();
		const client = this.options.client;
		const outcome = await withFinderDeadline(
			request,
			this.options.deadlineMs ?? CHAT_WORKSPACE_FINDER_DEADLINE_MS,
			async (signal) => {
				const [projects, previousFocus] = await Promise.all([
					loadWorkspaceFinderProjects(client, request.userId, signal),
					loadPreviousFocus(client, request.sessionId, signal)
				]);
				return findWorkspaceContext({
					projects,
					// Only ids from the access-checked cards ever reach this loader.
					loadProject: (projectId, hopSignal) =>
						loadContextFinderProject(client, projectId, hopSignal ?? signal),
					decider: this.options.decider,
					message: turn.message,
					recentConversation: turn.recent,
					previousFocus,
					speculate: previousFocus.length > 0,
					hop1TimeoutMs: CHAT_WORKSPACE_HOP1_TIMEOUT_MS,
					timeoutMs: CHAT_WORKSPACE_HOP2_TIMEOUT_MS,
					hop2DeadlineMs: CHAT_WORKSPACE_HOP2_DEADLINE_MS,
					signal,
					usage: {
						operationType: 'agentic_chat_context_finder_global',
						userId: request.userId,
						chatSessionId: request.sessionId
					}
				});
			}
		);
		const context = outcome.ok ? outcome.value : null;
		const block =
			context && this.options.mode === 'on' ? renderWorkspaceContextBlock(context) : null;
		const payload = buildWorkspaceSelectionPayload({
			request,
			mode: this.options.mode,
			context,
			injected: block !== null,
			failure: outcome.ok ? null : outcome.failure,
			elapsedMs: now() - started
		});
		return {
			step: {
				type: 'semantic',
				transitionId: contextSelectionTransitionId(request.turnRunId, payload),
				phase: 'stream',
				eventType: 'context_selection',
				currentActivity: 'Finding which projects this is about...',
				eventPayload: payload
			},
			injection: block
		};
	}
}

/** The previous turn's focused projects in this session, from its persisted selection. */
export async function loadPreviousFocus(
	client: WorkspaceFinderReadClient,
	sessionId: string,
	signal: AbortSignal
): Promise<string[]> {
	const { data, error } = await client
		.from('chat_turn_events')
		.select('payload')
		.eq('session_id', sessionId)
		.eq('event_type', 'context_selection')
		.order('created_at', { ascending: false })
		.limit(1)
		.abortSignal(signal);
	if (error || !Array.isArray(data)) return [];
	const payload = (data[0] as { payload?: Record<string, unknown> } | undefined)?.payload;
	const projects = Array.isArray(payload?.projects) ? payload.projects : [];
	const ids = projects
		.map((project) => (project as { id?: unknown } | null)?.id)
		.filter((id): id is string => typeof id === 'string');
	if (!ids.length && typeof payload?.project_id === 'string') ids.push(payload.project_id);
	return ids.slice(0, 3);
}

/**
 * The global chips: focused projects (hop 1) and, when hop 2 ran, their records with a
 * project id each. Ids, titles, tiers and headings only; never record text. Titles stay nested,
 * because the timeline turns top-level title/summary/message/detail fields into a step.
 */
export function buildWorkspaceSelectionPayload(input: {
	request: AgenticChatTurnProviderRequestV1;
	mode: Exclude<ChatContextFinderMode, 'off'>;
	context: WorkspaceContextV1 | null;
	injected: boolean;
	failure: string | null;
	elapsedMs: number;
}): Extract<AgenticChatProviderStepV1, { type: 'semantic' }>['eventPayload'] {
	const { request, context } = input;
	const selection = context?.selection;
	const status: 'selected' | 'empty' | 'unavailable' =
		!context || context.status === 'unavailable'
			? 'unavailable'
			: context.status === 'selected'
				? 'selected'
				: 'empty';
	const focus = selection?.scope === 'portfolio' ? (context?.pulse ?? []) : (context?.zoom ?? []);
	const projects = focus.map((entry) => {
		const pick = 'project' in entry ? entry.project : entry;
		return {
			id: pick.id,
			name: pick.name,
			p: pick.p,
			hop2: 'hop2' in entry ? entry.hop2 : 'skipped'
		};
	});
	const items = (context?.zoom ?? [])
		.flatMap((entry) => {
			if (entry.hop2 !== 'ran' || !entry.plan || !entry.evidence) return [];
			const loaded = new Set(entry.evidence.full.map((item) => item.id));
			return entry.plan.items.map((item) => ({
				kind: item.kind,
				id: item.id,
				label: item.title,
				tier: item.tier === 'full' && loaded.has(item.id) ? 'full' : 'summary',
				p: item.p,
				pinned: item.pinned === true,
				sections: item.sections.map((section) => section.heading),
				project_id: entry.project.id
			}));
		})
		.slice(0, MAX_CHIPS);
	return {
		type: 'context_selection',
		version: 1,
		mode: input.mode,
		// "Needs no saved work" turns are receipts only: nothing to show.
		visible: input.mode !== 'shadow' && context?.status !== 'skipped',
		injected: input.injected,
		status,
		failure: input.failure,
		client_turn_id: request.clientTurnId,
		turn_run_id: request.turnRunId,
		project_id: null,
		workspace: context
			? {
					scope: selection?.scope ?? null,
					dig: selection?.dig ?? false,
					dig_p: context.ranking.dig,
					checked: context.ranking.checked,
					unchecked: context.ranking.unchecked,
					hop1_ms: context.ranking.durationMs
				}
			: null,
		projects,
		items,
		counts: {
			full: items.filter((item) => item.tier === 'full').length,
			summary: items.filter((item) => item.tier === 'summary').length,
			checked: context?.ranking.checked ?? 0
		},
		ranker: context
			? {
					status: context.status,
					duration_ms: context.durationMs,
					cost_usd: context.costUsd,
					model: context.ranking.stage.model
				}
			: null,
		elapsed_ms: input.elapsedMs
	};
}

/** Project turns go to the project finder, global turns to the workspace finder. */
export function composeContextFinders(
	project: AgenticChatContextFinderPort | undefined,
	workspace: AgenticChatContextFinderPort | undefined
): AgenticChatContextFinderPort | undefined {
	if (!project && !workspace) return undefined;
	return {
		find: async (request) =>
			request.projectId
				? ((await project?.find(request)) ?? null)
				: ((await workspace?.find(request)) ?? null)
	};
}
