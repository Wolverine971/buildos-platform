// apps/web/src/lib/components/agent/agent-chat-session.ts
import { dev } from '$app/environment';
import type {
	ChatAttachmentRef,
	ChatContextType,
	ChatRole,
	ChatSession,
	ChatToolExecution
} from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { compareVoiceNotesInGroup, type VoiceNote } from '$lib/types/voice-notes';
import type { FastAgentPrewarmRequest } from '$lib/services/agentic-chat-v2';
import type { FastChatContextCache } from '$lib/services/agentic-chat-v2/context-cache';
import {
	buildProjectWideFocus as buildScopeProjectWideFocus,
	isAgenticChatContextType,
	isProjectScopedContext,
	normalizeAgenticChatContextType,
	normalizeProjectFocus
} from '$lib/services/agentic-chat-v2/scope';
import type {
	ActivityEntry,
	AgentTimelineItem,
	CreatedEntityRef,
	ThinkingBlockMessage,
	UIMessage
} from './agent-chat.types';
import {
	createToolPresenter,
	extractCreatedEntityFromResult,
	toFailureAction,
	toPastTenseAction
} from './agent-chat-tool-presenter';
import { formatElapsedDuration } from './agent-chat-formatters';
import { timelineItemsFromMessages } from './agent-chat-timeline';

export type PreparedPromptClient = {
	id: string;
	key: string;
	expires_at: string;
	cache_key: string;
	prompt_variant?: string;
	default_surface_profile?: string;
	prepared_surface_profiles?: string[];
	system_prompt_sha256?: string;
};

type LoadedChatMessage = {
	id: string;
	session_id?: string;
	user_id?: string;
	role: 'user' | 'assistant' | string;
	content: string;
	created_at: string;
	metadata?: Record<string, any>;
	attachments?: ChatAttachmentRef[];
	tool_calls?: any;
	tool_call_id?: string;
};

type LoadedChatTurnRun = {
	id: string;
	session_id?: string;
	user_id?: string;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	status?: string | null;
	finished_reason?: string | null;
	request_message?: string | null;
	assistant_message_id?: string | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
};

type LoadedChatSessionPayload = {
	session: ChatSession;
	messages?: LoadedChatMessage[];
	toolExecutions?: LoadedChatToolExecution[];
	turnRuns?: LoadedChatTurnRun[];
	timelineItems?: AgentTimelineItem[];
	truncated?: boolean;
	voiceNotes?: VoiceNote[];
};

type LoadedChatToolExecution = Pick<
	ChatToolExecution,
	| 'id'
	| 'message_id'
	| 'client_turn_id'
	| 'tool_name'
	| 'tool_category'
	| 'gateway_op'
	| 'help_path'
	| 'sequence_index'
	| 'arguments'
	| 'result'
	| 'result_count'
	| 'zero_result'
	| 'execution_time_ms'
	| 'tokens_consumed'
	| 'success'
	| 'error_message'
	| 'requires_user_action'
	| 'affected_entities'
	| 'created_at'
>;

type RestoredToolActivitySource = {
	id: string;
	source: 'tool_execution' | 'metadata_trace';
	messageId?: string | null;
	clientTurnId?: string | null;
	toolName: string;
	toolCategory?: string | null;
	gatewayOp?: string | null;
	helpPath?: string | null;
	sequenceIndex?: number | null;
	arguments?: unknown;
	argumentPreview?: string | null;
	result?: unknown;
	resultPreview?: string | null;
	resultCount?: number | null;
	zeroResult?: boolean | null;
	success: boolean;
	errorMessage?: string | null;
	requiresUserAction?: boolean | null;
	affectedEntities?: unknown;
	durationMs?: number | null;
	tokensConsumed?: number | null;
	createdAt?: string | null;
};

export interface AgentChatSessionSnapshot {
	session: ChatSession;
	contextType: ChatContextType;
	selectedEntityId?: string;
	selectedContextLabel: string;
	projectFocus: ProjectFocus | null;
	messages: UIMessage[];
	timelineItems: AgentTimelineItem[];
	voiceNotesByGroupId: Record<string, VoiceNote[]>;
	turnRuns: LoadedChatTurnRun[];
	activeTurnRun: LoadedChatTurnRun | null;
}

const DEFAULT_CHAT_SESSION_TITLES = [
	'Agent Session',
	'Project Assistant',
	'Calendar Assistant',
	'Brief Chat',
	'General Assistant',
	'New Project Creation',
	'Project Audit',
	'Project Forecast',
	'Daily Brief Settings',
	'Chat session',
	'Untitled Chat'
].map((title) => title.toLowerCase());

export function isProjectContext(context: ChatContextType | null | undefined): boolean {
	return isProjectScopedContext(context);
}

export function normalizeSessionContextType(context: string | null | undefined): ChatContextType {
	const normalized = normalizeAgenticChatContextType(context);
	return isAgenticChatContextType(normalized) ? normalized : 'global';
}

export function buildProjectWideFocus(
	projectId: string,
	projectName?: string | null
): ProjectFocus {
	return buildScopeProjectWideFocus(projectId, projectName);
}

function normalizeProjectFocusClient(focus?: ProjectFocus | null): ProjectFocus | null {
	return normalizeProjectFocus(focus);
}

function isPlaceholderSessionTitle(title?: string | null): boolean {
	const normalized = title?.trim().toLowerCase();
	if (!normalized) return true;
	return DEFAULT_CHAT_SESSION_TITLES.includes(normalized);
}

export function deriveSessionTitle(session: ChatSession | null | undefined): string | null {
	if (!session) return null;
	const rawTitle = session.title?.trim() ?? '';
	const autoTitle = session.auto_title?.trim() ?? '';

	if (rawTitle && !isPlaceholderSessionTitle(rawTitle)) {
		return rawTitle;
	}

	if (autoTitle) {
		return autoTitle;
	}

	return rawTitle || null;
}

/**
 * HTTP failure from an agent endpoint with a message safe to surface
 * directly in the chat error banner. `message` is status-aware: a 402
 * consumption freeze carries the server's billing guidance instead of a
 * generic "try again".
 */
export class AgentRequestError extends Error {
	status: number;
	code: string | null;

	constructor(message: string, status: number, code: string | null = null) {
		super(message);
		this.name = 'AgentRequestError';
		this.status = status;
		this.code = code;
	}
}

function describeAgentRequestFailure(
	status: number,
	serverMessage: string | null,
	fallback: string
): string {
	if (status === 402) {
		return serverMessage ?? 'Upgrade required to continue. Your workspace remains readable.';
	}
	if (status === 401) {
		return 'Your session has expired. Refresh the page and sign in again.';
	}
	if (status === 429) {
		return (
			serverMessage ??
			"You're sending requests too quickly — wait a few seconds and try again."
		);
	}
	if (status >= 400 && status < 500 && serverMessage) {
		return serverMessage;
	}
	return fallback;
}

/** Reads the ApiResponse-style error body (`{ error, code }`) off a failed response. */
export async function buildAgentRequestError(
	response: Response,
	fallback: string
): Promise<AgentRequestError> {
	let serverMessage: string | null = null;
	let code: string | null = null;
	try {
		const body = await response.json();
		if (body && typeof body === 'object') {
			const record = body as Record<string, unknown>;
			serverMessage =
				typeof record.error === 'string'
					? record.error
					: typeof record.message === 'string'
						? record.message
						: null;
			code = typeof record.code === 'string' ? record.code : null;
		}
	} catch {
		/* non-JSON error body */
	}
	return new AgentRequestError(
		describeAgentRequestFailure(response.status, serverMessage, fallback),
		response.status,
		code
	);
}

export async function prewarmAgentContext(
	payload: FastAgentPrewarmRequest,
	options: { signal?: AbortSignal } = {}
): Promise<{
	session: ChatSession | null;
	prewarmedContext: FastChatContextCache | null;
	preparedPrompt: PreparedPromptClient | null;
} | null> {
	try {
		const response = await fetch('/api/agent/v2/prewarm', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			signal: options.signal,
			body: JSON.stringify(payload)
		});
		if (!response.ok) {
			// Throw so session bootstrap can surface the status-specific message
			// (402 freeze, 401 expiry). The background prewarm orchestrator
			// catches and logs.
			throw await buildAgentRequestError(
				response,
				'Unable to prepare a chat session right now.'
			);
		}

		const result = await response.json();
		if (!result?.success) {
			return null;
		}

		const session = result?.data?.session ?? null;
		const prewarmedContext = result?.data?.prewarmed_context ?? null;
		const preparedPrompt = result?.data?.prepared_prompt ?? null;
		return {
			session: session as ChatSession | null,
			prewarmedContext: prewarmedContext as FastChatContextCache | null,
			preparedPrompt: preparedPrompt as PreparedPromptClient | null
		};
	} catch (err) {
		if ((err as DOMException)?.name === 'AbortError' || err instanceof AgentRequestError) {
			throw err;
		}
		if (dev) {
			console.warn('[AgentChat] Prewarm failed:', err);
		}
		return null;
	}
}

export interface ActiveTurnRunProbeResult {
	hasActiveTurnRun: boolean;
	activeTurnRunId: string | null;
}

/**
 * Lightweight "is the restored turn still running" check — a single
 * turn-runs query server-side instead of the full ~8-query session
 * snapshot. Returns null on failure so callers keep polling with backoff.
 */
export async function probeActiveTurnRun(
	sessionId: string,
	options: { signal?: AbortSignal } = {}
): Promise<ActiveTurnRunProbeResult | null> {
	try {
		const response = await fetch(`/api/chat/sessions/${sessionId}?probe=active-turn`, {
			signal: options.signal
		});
		if (!response.ok) return null;
		const result = await response.json().catch(() => null);
		const runs = Array.isArray(result?.data?.turnRuns) ? result.data.turnRuns : [];
		const active =
			runs.find(
				(run: unknown) =>
					isRecord(run) && typeof run.status === 'string' && run.status === 'running'
			) ?? null;
		return {
			hasActiveTurnRun: Boolean(active),
			activeTurnRunId: active && typeof active.id === 'string' ? active.id : null
		};
	} catch (err) {
		if ((err as DOMException)?.name === 'AbortError') {
			throw err;
		}
		return null;
	}
}

export async function warmAgentChatStreamTransport(
	options: { signal?: AbortSignal } = {}
): Promise<boolean> {
	try {
		const response = await fetch('/api/agent/v2/stream?purpose=warmup', {
			method: 'GET',
			cache: 'no-store',
			signal: options.signal
		});
		return response.ok;
	} catch (err) {
		if ((err as DOMException)?.name === 'AbortError') {
			throw err;
		}
		if (dev) {
			console.warn('[AgentChat] Stream transport warmup failed:', err);
		}
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function numberValue(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
	if (isRecord(value)) return value;
	if (typeof value !== 'string') return null;
	try {
		const parsed = JSON.parse(value);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function compactLabel(value: unknown, maxLength = 90): string | null {
	const raw = stringValue(value);
	if (!raw) return null;
	const normalized = raw.replace(/\s+/g, ' ').trim();
	if (
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			normalized
		)
	) {
		return null;
	}
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

/**
 * Cache-free presenter for the restored (session-snapshot) path. Shares the single
 * per-tool display table in agent-chat-tool-presenter with the live streaming path.
 * Context getters return null/undefined so entity names resolve only from the
 * persisted args/result payloads (no live name cache, no project focus).
 */
let restoredToolPresenter: ReturnType<typeof createToolPresenter> | null = null;
function getRestoredToolPresenter(): ReturnType<typeof createToolPresenter> {
	if (!restoredToolPresenter) {
		restoredToolPresenter = createToolPresenter({
			getContextType: () => null,
			getEntityId: () => undefined,
			getContextLabel: () => null,
			getProjectFocus: () => null,
			getResolvedProjectFocus: () => null,
			isDev: false
		});
	}
	return restoredToolPresenter;
}

function formatRestoredToolActivity(source: RestoredToolActivitySource): string {
	const args = parseRecord(source.arguments) ?? parseRecord(source.argumentPreview) ?? {};
	const resultRecord = parseRecord(source.result) ?? parseRecord(source.resultPreview);
	const formattedDuration = formatElapsedDuration(source.durationMs);
	const durationSuffix = formattedDuration ? ` (${formattedDuration})` : '';
	const errorSuffix = source.errorMessage ? ` - ${compactLabel(source.errorMessage, 120)}` : '';

	const descriptor = getRestoredToolPresenter().describeToolDisplay(source.toolName, args, {
		resultRecord,
		genericPrefix: true,
		gatewayOp: source.gatewayOp ?? null
	});

	if (!descriptor) {
		// Tool has no formatter and no CRUD prefix: keep a readable last-resort label.
		const readable = source.toolName.replace(/_/g, ' ');
		if (source.success) return `Used ${readable}${durationSuffix}`;
		return `Failed to run ${readable}${errorSuffix}`;
	}

	const targetSuffix = descriptor.target ? `: "${descriptor.target}"` : '';
	if (source.success) {
		return `${toPastTenseAction(descriptor.action)}${targetSuffix}${durationSuffix}`;
	}
	return `Failed to ${toFailureAction(descriptor.action)}${targetSuffix}${errorSuffix}`;
}

function sortRestoredToolSources(
	left: RestoredToolActivitySource,
	right: RestoredToolActivitySource
): number {
	const leftSequence = left.sequenceIndex ?? Number.POSITIVE_INFINITY;
	const rightSequence = right.sequenceIndex ?? Number.POSITIVE_INFINITY;
	if (leftSequence !== rightSequence) return leftSequence - rightSequence;

	const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
	const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
	if (leftTime !== rightTime) return leftTime - rightTime;

	return left.id.localeCompare(right.id);
}

function mapToolExecutionsToSources(
	toolExecutions: LoadedChatToolExecution[] | undefined
): RestoredToolActivitySource[] {
	return (toolExecutions ?? [])
		.filter((execution) => execution?.id && execution?.tool_name)
		.map((execution) => ({
			id: execution.id,
			source: 'tool_execution' as const,
			messageId: execution.message_id,
			clientTurnId: execution.client_turn_id,
			toolName: execution.tool_name,
			toolCategory: execution.tool_category,
			gatewayOp: execution.gateway_op,
			helpPath: execution.help_path,
			sequenceIndex: execution.sequence_index,
			arguments: execution.arguments,
			result: execution.result,
			resultCount: execution.result_count,
			zeroResult: execution.zero_result,
			success: execution.success === true,
			errorMessage: execution.error_message,
			requiresUserAction: execution.requires_user_action,
			affectedEntities: execution.affected_entities,
			durationMs: execution.execution_time_ms,
			tokensConsumed: execution.tokens_consumed,
			createdAt: execution.created_at
		}));
}

function parseMetadataToolTrace(
	messageId: string,
	metadata?: Record<string, any>
): RestoredToolActivitySource[] {
	const trace = metadata?.fastchat_tool_trace_v1;
	if (!Array.isArray(trace)) return [];

	return trace
		.map((entry, index): RestoredToolActivitySource | null => {
			if (!isRecord(entry)) return null;
			const toolName = stringValue(entry.tool_name) ?? stringValue(entry.toolName);
			if (!toolName) return null;
			const toolCallId = stringValue(entry.tool_call_id) ?? stringValue(entry.toolCallId);
			return {
				id: toolCallId ?? `${messageId}-trace-${index}`,
				source: 'metadata_trace',
				messageId,
				toolName,
				gatewayOp: stringValue(entry.op) ?? stringValue(entry.gateway_op),
				sequenceIndex: index + 1,
				argumentPreview: stringValue(entry.arguments_preview),
				resultPreview: stringValue(entry.result_preview),
				success: entry.success !== false,
				errorMessage: stringValue(entry.error),
				durationMs: numberValue(entry.duration_ms)
			};
		})
		.filter((entry): entry is RestoredToolActivitySource => Boolean(entry));
}

function addToolSourcesByKey(
	map: Map<string, RestoredToolActivitySource[]>,
	key: string | null | undefined,
	source: RestoredToolActivitySource
): void {
	if (!key) return;
	const existing = map.get(key) ?? [];
	existing.push(source);
	map.set(key, existing);
}

function uniqueToolSources(sources: RestoredToolActivitySource[]): RestoredToolActivitySource[] {
	const seen = new Set<string>();
	const unique: RestoredToolActivitySource[] = [];
	for (const source of sources) {
		const key = `${source.source}:${source.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(source);
	}
	return unique;
}

function buildRestoredToolBlock(params: {
	idSuffix: string;
	timestamp?: string | null;
	sources: RestoredToolActivitySource[];
}): ThinkingBlockMessage | null {
	const sortedSources = uniqueToolSources(params.sources).sort(sortRestoredToolSources);
	if (sortedSources.length === 0) return null;

	const activities: ActivityEntry[] = sortedSources.map((source) => ({
		id: `restored-tool-${source.source}-${source.id}`,
		content: formatRestoredToolActivity(source),
		timestamp: new Date(source.createdAt ?? params.timestamp ?? Date.now()),
		activityType: 'tool_call',
		status: source.success ? 'completed' : 'failed',
		toolCallId: source.id,
		metadata: {
			restored: true,
			source: source.source,
			toolName: source.toolName,
			toolCategory: source.toolCategory ?? undefined,
			gatewayOp: source.gatewayOp ?? undefined,
			helpPath: source.helpPath ?? undefined,
			toolExecutionId: source.source === 'tool_execution' ? source.id : undefined,
			toolCallId: source.source === 'metadata_trace' ? source.id : undefined,
			arguments: source.arguments ?? source.argumentPreview,
			result: source.result ?? source.resultPreview,
			resultCount: source.resultCount ?? undefined,
			zeroResult: source.zeroResult ?? undefined,
			requiresUserAction: source.requiresUserAction ?? undefined,
			affectedEntities: source.affectedEntities ?? undefined,
			error: source.errorMessage ?? undefined,
			status: source.success ? 'completed' : 'failed',
			durationMs: source.durationMs ?? undefined,
			tokensConsumed: source.tokensConsumed ?? undefined
		}
	}));
	const timestamp = params.timestamp ?? sortedSources[0]?.createdAt ?? new Date().toISOString();
	const failedCount = activities.filter((activity) => activity.status === 'failed').length;

	return {
		id: `restored-tools-${params.idSuffix}`,
		type: 'thinking_block',
		role: 'system' as ChatRole,
		content:
			failedCount > 0
				? `Restored ${activities.length} tool call${activities.length === 1 ? '' : 's'} with ${failedCount} failure${failedCount === 1 ? '' : 's'}`
				: `Restored ${activities.length} tool call${activities.length === 1 ? '' : 's'}`,
		timestamp: new Date(timestamp),
		created_at: timestamp,
		activities,
		status: 'completed',
		isCollapsed: false
	};
}

function mapLoadedMessageToUI(msg: LoadedChatMessage): UIMessage {
	return {
		id: msg.id,
		session_id: msg.session_id,
		user_id: msg.user_id,
		type: msg.role === 'user' ? 'user' : 'assistant',
		role: msg.role as ChatRole,
		content: msg.content,
		timestamp: new Date(msg.created_at),
		created_at: msg.created_at,
		metadata: msg.metadata as Record<string, any> | undefined,
		attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
		tool_calls: msg.tool_calls,
		tool_call_id: msg.tool_call_id
	};
}

function mapLoadedMessagesToUI(
	loadedMessages: LoadedChatMessage[] | undefined,
	toolExecutions: LoadedChatToolExecution[] | undefined
): UIMessage[] {
	const messages = (loadedMessages ?? []).filter(
		(msg) => msg.role === 'user' || msg.role === 'assistant'
	);
	const loadedMessageIds = new Set(messages.map((message) => message.id));
	const toolSources = mapToolExecutionsToSources(toolExecutions).filter(
		(source) => !source.messageId || loadedMessageIds.has(source.messageId)
	);
	const sourcesByMessageId = new Map<string, RestoredToolActivitySource[]>();
	const sourcesByClientTurnId = new Map<string, RestoredToolActivitySource[]>();
	for (const source of toolSources) {
		addToolSourcesByKey(sourcesByMessageId, source.messageId, source);
		addToolSourcesByKey(sourcesByClientTurnId, source.clientTurnId, source);
	}

	const usedSourceIds = new Set<string>();
	const uiMessages: UIMessage[] = [];
	// Ids already turned into chips, so an entity never gets a duplicate chip.
	const seenCreatedIds = new Set<string>();

	for (const msg of messages) {
		let createdForTurn: CreatedEntityRef[] = [];
		if (msg.role === 'assistant') {
			const metadata = msg.metadata as Record<string, any> | undefined;
			const clientTurnId = stringValue(metadata?.client_turn_id);
			const directSources = [
				...(sourcesByMessageId.get(msg.id) ?? []),
				...(clientTurnId ? (sourcesByClientTurnId.get(clientTurnId) ?? []) : [])
			].filter((source) => !usedSourceIds.has(`${source.source}:${source.id}`));

			const blockSources =
				directSources.length > 0 ? directSources : parseMetadataToolTrace(msg.id, metadata);

			if (blockSources.length > 0) {
				for (const source of blockSources) {
					usedSourceIds.add(`${source.source}:${source.id}`);
				}
				const restoredBlock = buildRestoredToolBlock({
					idSuffix: msg.id,
					timestamp: msg.created_at,
					sources: blockSources
				});
				if (restoredBlock) {
					uiMessages.push(restoredBlock);
				}
			}

			createdForTurn = deriveCreatedEntitiesFromSources(directSources, seenCreatedIds);
		}

		uiMessages.push(mapLoadedMessageToUI(msg));

		// Inline chips for whatever this turn created, placed right after its reply.
		if (createdForTurn.length > 0) {
			uiMessages.push(buildCreatedEntitiesMessage(createdForTurn, msg.id, msg.created_at));
		}
	}

	const unlinkedSources = toolSources.filter(
		(source) => !source.messageId && !usedSourceIds.has(`${source.source}:${source.id}`)
	);
	const unlinkedBlock = buildRestoredToolBlock({
		idSuffix: 'unlinked',
		timestamp: unlinkedSources[0]?.createdAt,
		sources: unlinkedSources
	});
	if (unlinkedBlock) {
		uiMessages.push(unlinkedBlock);
	}
	const unlinkedCreated = deriveCreatedEntitiesFromSources(unlinkedSources, seenCreatedIds);
	if (unlinkedCreated.length > 0) {
		uiMessages.push(buildCreatedEntitiesMessage(unlinkedCreated, 'unlinked'));
	}

	return uiMessages;
}

function groupVoiceNotesByGroupId(voiceNotes: VoiceNote[]): Record<string, VoiceNote[]> {
	const grouped: Record<string, VoiceNote[]> = {};
	for (const note of voiceNotes) {
		if (!note.group_id) continue;
		const existing = grouped[note.group_id] ?? [];
		existing.push(note);
		grouped[note.group_id] = existing;
	}

	for (const groupId of Object.keys(grouped)) {
		grouped[groupId] = grouped[groupId]!.sort(compareVoiceNotesInGroup);
	}

	return grouped;
}

/**
 * Pull successful created entities out of a turn's restored tool sources (in source
 * order = creation order), skipping ids already surfaced earlier in the conversation.
 */
function deriveCreatedEntitiesFromSources(
	sources: RestoredToolActivitySource[],
	seen: Set<string>
): CreatedEntityRef[] {
	const out: CreatedEntityRef[] = [];
	for (const source of sources) {
		if (!source.success) continue;
		const created = extractCreatedEntityFromResult(
			source.toolName,
			parseRecord(source.arguments) ?? undefined,
			source.result
		);
		if (created && !seen.has(created.id)) {
			seen.add(created.id);
			out.push(created);
		}
	}
	return out;
}

/** Build the inline "created entities" chip message placed after a turn's reply. */
function buildCreatedEntitiesMessage(
	entities: CreatedEntityRef[],
	idSuffix: string,
	timestamp?: string | null
): UIMessage {
	return {
		id: `created-${idSuffix}`,
		type: 'created_entities',
		content: '',
		data: { entities },
		timestamp: timestamp ? new Date(timestamp) : new Date(),
		created_at: timestamp ?? undefined
	};
}

export function buildAgentChatSessionSnapshot(
	payload: LoadedChatSessionPayload
): AgentChatSessionSnapshot {
	const {
		session,
		messages: loadedMessages,
		toolExecutions,
		turnRuns: loadedTurnRuns = [],
		timelineItems: loadedTimelineItems,
		truncated,
		voiceNotes = []
	} = payload;
	const turnRuns = Array.isArray(loadedTurnRuns) ? loadedTurnRuns : [];
	const contextType = normalizeSessionContextType(session.context_type);
	const selectedEntityId = session.entity_id || undefined;
	const sessionTitle = deriveSessionTitle(session) || 'Resumed Chat';
	const metadataFocus = normalizeProjectFocusClient(
		(session.agent_metadata as { focus?: ProjectFocus | null })?.focus
	);

	let projectFocus: ProjectFocus | null = null;
	let selectedContextLabel = sessionTitle;
	if (isProjectContext(contextType)) {
		if (metadataFocus) {
			projectFocus = metadataFocus;
			selectedContextLabel = metadataFocus.projectName?.trim() || sessionTitle;
		} else if (selectedEntityId) {
			projectFocus = buildProjectWideFocus(selectedEntityId, selectedContextLabel);
		}
	}

	let messages = mapLoadedMessagesToUI(loadedMessages, toolExecutions);
	const timelineItems = Array.isArray(loadedTimelineItems)
		? loadedTimelineItems
		: timelineItemsFromMessages(session.id, messages);
	const activeTurnRun = turnRuns.find((run) => run.status === 'running') ?? null;

	if (truncated) {
		const truncationNote: UIMessage = {
			id: crypto.randomUUID(),
			type: 'activity',
			role: 'system' as ChatRole,
			content: 'Note: This conversation has been truncated to show the most recent messages.',
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [truncationNote, ...messages];
	}

	if (activeTurnRun) {
		const activeTurnNote: UIMessage = {
			id: `active-turn-${activeTurnRun.id}`,
			type: 'activity',
			role: 'system' as ChatRole,
			content:
				'BuildOS is still finishing the latest response. This view will refresh shortly.',
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [...messages, activeTurnNote];
	}

	if (messages.length === 0) {
		const welcomeMessage: UIMessage = {
			id: crypto.randomUUID(),
			type: 'assistant',
			role: 'system' as ChatRole,
			content: session.summary
				? `Resuming your conversation. Here's where we left off:\n\n**Summary:** ${session.summary}\n\nHow can I help you continue?`
				: "Welcome back! I've restored your previous conversation. How can I help you continue?",
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [...messages, welcomeMessage];
	}

	return {
		session,
		contextType,
		selectedEntityId: metadataFocus?.projectId || projectFocus?.projectId || selectedEntityId,
		selectedContextLabel,
		projectFocus,
		messages,
		timelineItems,
		voiceNotesByGroupId: groupVoiceNotesByGroupId(voiceNotes),
		turnRuns,
		activeTurnRun
	};
}

export async function loadAgentChatSessionSnapshot(
	sessionId: string,
	options: { signal?: AbortSignal } = {}
): Promise<AgentChatSessionSnapshot> {
	const response = await fetch(`/api/chat/sessions/${sessionId}?includeVoiceNotes=1`, {
		signal: options.signal
	});
	const result = await response.json().catch(() => null);

	if (!response.ok || !result?.success) {
		throw new Error(result?.error || 'Failed to load chat session');
	}

	return buildAgentChatSessionSnapshot(result.data as LoadedChatSessionPayload);
}
