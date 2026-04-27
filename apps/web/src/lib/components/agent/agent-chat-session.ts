// apps/web/src/lib/components/agent/agent-chat-session.ts
import { dev } from '$app/environment';
import type {
	ChatContextType,
	ChatRole,
	ChatSession,
	ChatToolExecution
} from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { VoiceNote } from '$lib/types/voice-notes';
import type { FastAgentPrewarmRequest } from '$lib/services/agentic-chat-v2';
import type { FastChatContextCache } from '$lib/services/agentic-chat-v2/context-cache';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';

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
	tool_calls?: any;
	tool_call_id?: string;
};

type LoadedChatSessionPayload = {
	session: ChatSession;
	messages?: LoadedChatMessage[];
	toolExecutions?: LoadedChatToolExecution[];
	truncated?: boolean;
	voiceNotes?: VoiceNote[];
};

type LoadedChatToolExecution = Pick<
	ChatToolExecution,
	| 'id'
	| 'message_id'
	| 'client_turn_id'
	| 'tool_name'
	| 'gateway_op'
	| 'sequence_index'
	| 'arguments'
	| 'result'
	| 'execution_time_ms'
	| 'success'
	| 'error_message'
	| 'created_at'
>;

type RestoredToolActivitySource = {
	id: string;
	source: 'tool_execution' | 'metadata_trace';
	messageId?: string | null;
	clientTurnId?: string | null;
	toolName: string;
	gatewayOp?: string | null;
	sequenceIndex?: number | null;
	arguments?: unknown;
	argumentPreview?: string | null;
	result?: unknown;
	resultPreview?: string | null;
	success: boolean;
	errorMessage?: string | null;
	durationMs?: number | null;
	createdAt?: string | null;
};

export interface AgentChatSessionSnapshot {
	session: ChatSession;
	contextType: ChatContextType;
	selectedEntityId?: string;
	selectedContextLabel: string;
	projectFocus: ProjectFocus | null;
	messages: UIMessage[];
	voiceNotesByGroupId: Record<string, VoiceNote[]>;
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
	return context === 'project';
}

export function normalizeSessionContextType(context: string | null | undefined): ChatContextType {
	switch (context) {
		case 'general':
			return 'global';
		case 'project_audit':
		case 'project_forecast':
			return 'project';
		case 'global':
		case 'project':
		case 'calendar':
		case 'daily_brief':
		case 'project_create':
		case 'daily_brief_update':
		case 'ontology':
			return context;
		default:
			return 'global';
	}
}

export function buildProjectWideFocus(
	projectId: string,
	projectName?: string | null
): ProjectFocus {
	return {
		focusType: 'project-wide',
		focusEntityId: null,
		focusEntityName: null,
		projectId,
		projectName: projectName ?? 'Project'
	};
}

export function normalizeProjectFocusClient(focus?: ProjectFocus | null): ProjectFocus | null {
	if (!focus || !focus.projectId) return null;
	return {
		focusType: focus.focusType ?? 'project-wide',
		focusEntityId: focus.focusEntityId ?? null,
		focusEntityName: focus.focusEntityName ?? null,
		projectId: focus.projectId,
		projectName: focus.projectName ?? 'Project'
	};
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
			return null;
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
		if ((err as DOMException)?.name === 'AbortError') {
			throw err;
		}
		if (dev) {
			console.warn('[AgentChat] Prewarm failed:', err);
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

const TOOL_TARGET_KEYS = [
	'title',
	'name',
	'project_name',
	'project_query',
	'task_title',
	'task_name',
	'goal_name',
	'plan_name',
	'document_title',
	'milestone_title',
	'risk_title',
	'event_title',
	'entity_name',
	'label',
	'display_name',
	'query',
	'search',
	'url',
	'op',
	'action',
	'path',
	'skill_path'
];

const TOOL_TARGET_NESTED_KEYS = [
	'project',
	'task',
	'goal',
	'plan',
	'document',
	'milestone',
	'risk',
	'event',
	'calendar_event',
	'entity',
	'data',
	'result'
];

function extractTargetFromRecord(record: Record<string, unknown> | null, depth = 0): string | null {
	if (!record || depth > 2) return null;

	for (const key of TOOL_TARGET_KEYS) {
		const label = compactLabel(record[key]);
		if (label) return label;
	}

	for (const key of TOOL_TARGET_NESTED_KEYS) {
		const nested = record[key];
		if (isRecord(nested)) {
			const label = extractTargetFromRecord(nested, depth + 1);
			if (label) return label;
		}
	}

	return null;
}

function extractToolTarget(source: RestoredToolActivitySource): string | null {
	return (
		extractTargetFromRecord(parseRecord(source.arguments)) ??
		extractTargetFromRecord(parseRecord(source.argumentPreview)) ??
		extractTargetFromRecord(parseRecord(source.result)) ??
		extractTargetFromRecord(parseRecord(source.resultPreview))
	);
}

function entityFromToolName(toolName: string, gatewayOp?: string | null): string {
	const source = `${toolName} ${gatewayOp ?? ''}`.toLowerCase();
	if (source.includes('project')) return 'project';
	if (source.includes('task')) return 'task';
	if (source.includes('goal')) return 'goal';
	if (source.includes('plan')) return 'plan';
	if (source.includes('document')) return 'document';
	if (source.includes('milestone')) return 'milestone';
	if (source.includes('risk')) return 'risk';
	if (source.includes('calendar') || source.includes('event')) return 'calendar event';
	if (source.includes('skill')) return 'skill';
	if (source.includes('context')) return 'chat context';
	if (source.includes('relationship') || source.includes('link_')) return 'relationship';
	return 'tool';
}

function readableToolName(toolName: string): string {
	return toolName.replace(/_/g, ' ');
}

function restoredToolAction(source: RestoredToolActivitySource): {
	completed: string;
	failed: string;
} {
	const toolName = source.toolName.toLowerCase();
	const gatewayOp = source.gatewayOp?.toLowerCase() ?? '';
	const entity = entityFromToolName(toolName, gatewayOp);

	if (toolName === 'skill_load') return { completed: 'Loaded skill', failed: 'load skill' };
	if (toolName === 'tool_search') return { completed: 'Searched tools', failed: 'search tools' };
	if (toolName === 'tool_schema') {
		return { completed: 'Loaded tool schema', failed: 'load tool schema' };
	}
	if (toolName === 'get_workspace_overview') {
		return { completed: 'Loaded workspace overview', failed: 'load workspace overview' };
	}
	if (toolName === 'get_project_overview') {
		return { completed: 'Loaded project overview', failed: 'load project overview' };
	}
	if (toolName === 'change_chat_context') {
		return { completed: 'Switched chat context', failed: 'switch chat context' };
	}
	if (toolName === 'get_user_profile_overview') {
		return { completed: 'Loaded profile overview', failed: 'load profile overview' };
	}
	if (toolName === 'search_user_contacts') {
		return { completed: 'Searched contacts', failed: 'search contacts' };
	}
	if (toolName === 'upsert_user_contact') {
		return { completed: 'Updated contact', failed: 'update contact' };
	}
	if (toolName === 'web_visit') {
		return { completed: 'Visited web page', failed: 'visit web page' };
	}
	if (toolName === 'resolve_libri_resource') {
		return { completed: 'Resolved library resource', failed: 'resolve library resource' };
	}
	if (toolName === 'query_libri_library') {
		return { completed: 'Queried library', failed: 'query library' };
	}
	if (toolName === 'link_onto_entities') {
		return { completed: 'Linked entities', failed: 'link entities' };
	}
	if (toolName === 'unlink_onto_edge') {
		return { completed: 'Unlinked entities', failed: 'unlink entities' };
	}
	if (toolName === 'create_task_document') {
		return { completed: 'Attached document to task', failed: 'attach document to task' };
	}
	if (toolName === 'move_document_in_tree') {
		return { completed: 'Moved document in tree', failed: 'move document in tree' };
	}

	if (toolName.startsWith('create_') || gatewayOp.endsWith('.create')) {
		return { completed: `Created ${entity}`, failed: `create ${entity}` };
	}
	if (toolName.startsWith('update_') || gatewayOp.endsWith('.update')) {
		return { completed: `Updated ${entity}`, failed: `update ${entity}` };
	}
	if (toolName.startsWith('delete_') || gatewayOp.endsWith('.delete')) {
		return { completed: `Deleted ${entity}`, failed: `delete ${entity}` };
	}
	if (toolName.startsWith('search_') || gatewayOp.includes('.search')) {
		return { completed: `Searched ${entity}`, failed: `search ${entity}` };
	}
	if (toolName.startsWith('list_') || gatewayOp.includes('.list')) {
		return { completed: `Listed ${entity}`, failed: `list ${entity}` };
	}
	if (toolName.startsWith('get_') || gatewayOp.includes('.read')) {
		return { completed: `Loaded ${entity}`, failed: `load ${entity}` };
	}

	const readable = readableToolName(source.toolName);
	return { completed: `Used ${readable}`, failed: `run ${readable}` };
}

function formatRestoredToolActivity(source: RestoredToolActivitySource): string {
	const action = restoredToolAction(source);
	const target = extractToolTarget(source);
	const targetSuffix = target ? `: "${target}"` : '';
	const durationSuffix =
		typeof source.durationMs === 'number' && Number.isFinite(source.durationMs)
			? ` (${Math.round(source.durationMs)}ms)`
			: '';

	if (source.success) {
		return `${action.completed}${targetSuffix}${durationSuffix}`;
	}

	const errorSuffix = source.errorMessage ? ` - ${compactLabel(source.errorMessage, 120)}` : '';
	return `Failed to ${action.failed}${targetSuffix}${errorSuffix}`;
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
			gatewayOp: execution.gateway_op,
			sequenceIndex: execution.sequence_index,
			arguments: execution.arguments,
			result: execution.result,
			success: execution.success === true,
			errorMessage: execution.error_message,
			durationMs: execution.execution_time_ms,
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
			gatewayOp: source.gatewayOp ?? undefined,
			toolExecutionId: source.source === 'tool_execution' ? source.id : undefined,
			toolCallId: source.source === 'metadata_trace' ? source.id : undefined,
			arguments: source.arguments ?? source.argumentPreview,
			result: source.result ?? source.resultPreview,
			error: source.errorMessage ?? undefined,
			status: source.success ? 'completed' : 'failed',
			durationMs: source.durationMs ?? undefined
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

	for (const msg of messages) {
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
		}

		uiMessages.push(mapLoadedMessageToUI(msg));
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
		grouped[groupId] = grouped[groupId]!.sort((a, b) => {
			const aIndex = a.segment_index ?? 0;
			const bIndex = b.segment_index ?? 0;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		});
	}

	return grouped;
}

export function buildAgentChatSessionSnapshot(
	payload: LoadedChatSessionPayload
): AgentChatSessionSnapshot {
	const {
		session,
		messages: loadedMessages,
		toolExecutions,
		truncated,
		voiceNotes = []
	} = payload;
	const contextType = normalizeSessionContextType(session.context_type);
	const selectedEntityId = session.entity_id || undefined;
	const selectedContextLabel = deriveSessionTitle(session) || 'Resumed Chat';
	const metadataFocus = normalizeProjectFocusClient(
		(session.agent_metadata as { focus?: ProjectFocus | null })?.focus
	);

	let projectFocus: ProjectFocus | null = null;
	if (isProjectContext(contextType)) {
		if (metadataFocus) {
			projectFocus = metadataFocus;
		} else if (selectedEntityId) {
			projectFocus = buildProjectWideFocus(selectedEntityId, selectedContextLabel);
		}
	}

	let messages = mapLoadedMessagesToUI(loadedMessages, toolExecutions);

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

	return {
		session,
		contextType,
		selectedEntityId: metadataFocus?.projectId || projectFocus?.projectId || selectedEntityId,
		selectedContextLabel,
		projectFocus,
		messages: [...messages, welcomeMessage],
		voiceNotesByGroupId: groupVoiceNotesByGroupId(voiceNotes)
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
