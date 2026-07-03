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
import type { VoiceNote } from '$lib/types/voice-notes';
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
import { extractCreatedEntityFromResult } from './agent-chat-tool-presenter';
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

export type LoadedChatTurnRun = {
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

export function normalizeProjectFocusClient(focus?: ProjectFocus | null): ProjectFocus | null {
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

function shortIdLabel(value: unknown): string | null {
	const raw = stringValue(value);
	if (!raw) return null;
	const normalized = raw.replace(/\s+/g, ' ').trim();
	if (
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			normalized
		)
	) {
		return normalized.slice(0, 8);
	}
	return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
}

function joinCompactLabels(...values: unknown[]): string | null {
	const parts = values
		.map((value) => compactLabel(value))
		.filter((value): value is string => Boolean(value));
	return parts.length > 0 ? parts.join(' · ') : null;
}

function libriCapabilityTarget(record: Record<string, unknown> | null): string | null {
	if (!record) return null;
	const query =
		compactLabel(record.query) ?? compactLabel(record.capability) ?? compactLabel(record.name);
	const domain =
		compactLabel(record.domain) ?? compactLabel(record.category) ?? compactLabel(record.kind);
	if (domain && query) return `${domain}: ${query}`;
	return query ?? domain;
}

function webVisitTarget(record: Record<string, unknown> | null): string | null {
	if (!record) return null;
	const url = compactLabel(record.url);
	const details = joinCompactLabels(record.mode, record.output_format ?? record.outputFormat);
	if (url && details) return `${url} · ${details}`;
	return url ?? details;
}

function searchWithScopeTarget(record: Record<string, unknown> | null): string | null {
	if (!record) return null;
	const query =
		compactLabel(record.query) ?? compactLabel(record.q) ?? compactLabel(record.search);
	const domain = compactLabel(record.domain) ?? compactLabel(record.skill);
	const capability =
		compactLabel(record.buildosCapability) ??
		compactLabel(record.buildos_capability) ??
		compactLabel(record.workCapability) ??
		compactLabel(record.work_capability) ??
		compactLabel(record.capability) ??
		compactLabel(record.kind) ??
		compactLabel(record.entity) ??
		compactLabel(record.group);
	const scope = joinCompactLabels(domain, capability);
	if (scope && query) return `${scope}: ${query}`;
	return query ?? scope;
}

function loadTarget(record: Record<string, unknown> | null, ...keys: string[]): string | null {
	if (!record) return null;
	for (const key of keys) {
		const label = compactLabel(record[key]);
		if (label) return label;
	}
	return null;
}

function skillReferenceTarget(record: Record<string, unknown> | null): string | null {
	if (!record) return null;
	const skill = loadTarget(record, 'skill', 'id', 'path');
	const reference = loadTarget(record, 'reference', 'reference_id', 'module');
	if (skill && reference) return `${skill} · ${reference}`;
	return reference ?? skill;
}

function corsairToolTarget(record: Record<string, unknown> | null): string | null {
	if (!record) return null;
	return compactLabel(record.name) ?? compactLabel(record.reason);
}

function delegatedTaskTarget(record: Record<string, unknown> | null): string | null {
	if (!record) return null;
	const label = compactLabel(record.label) ?? compactLabel(record.goal);
	const mode = compactLabel(record.scope_mode) ?? compactLabel(record.context_type);
	if (label && mode) return `${label} · ${mode}`;
	return label ?? mode;
}

function changeSetTarget(record: Record<string, unknown> | null): string | null {
	if (!record) return null;
	const runId = shortIdLabel(record.run_id);
	const defaultDecision = compactLabel(record.default_decision);
	if (runId && defaultDecision) return `run ${runId} · ${defaultDecision}`;
	return runId ? `run ${runId}` : defaultDecision;
}

function documentTitleTarget(...records: Array<Record<string, unknown> | null>): string | null {
	for (const record of records) {
		if (!record) continue;
		const title =
			compactLabel(record.document_title) ??
			compactLabel(record.documentTitle) ??
			compactLabel(record.title) ??
			compactLabel((record.document as Record<string, unknown> | undefined)?.title);
		if (title) return title;
	}
	return null;
}

function documentSectionTarget(...records: Array<Record<string, unknown> | null>): string | null {
	const documentTitle = documentTitleTarget(...records);
	let section: string | null = null;
	for (const record of records) {
		if (!record) continue;
		section =
			compactLabel(record.heading) ??
			compactLabel(record.section_title) ??
			compactLabel(record.sectionTitle) ??
			compactLabel(record.anchor);
		if (section) break;
	}

	if (documentTitle && section) return `${documentTitle} · section: ${section}`;
	return documentTitle ?? (section ? `section: ${section}` : null);
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
	'skill',
	'reference',
	'resource',
	'domain',
	'outcomeCard',
	'outcome_card',
	'workCapability',
	'work_capability',
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
	const argumentRecord = parseRecord(source.arguments) ?? parseRecord(source.argumentPreview);
	const resultRecord = parseRecord(source.result) ?? parseRecord(source.resultPreview);
	const toolName = source.toolName.toLowerCase();
	if (toolName === 'domain_search' || toolName === 'skill_search') {
		const target = searchWithScopeTarget(argumentRecord);
		if (target) return target;
	}
	if (toolName === 'domain_load') {
		const target = loadTarget(argumentRecord, 'domain', 'domain_id', 'id');
		if (target) return target;
	}
	if (
		toolName === 'outcome_card_search' ||
		toolName === 'work_capability_search' ||
		toolName === 'resource_search'
	) {
		const target = searchWithScopeTarget(argumentRecord);
		if (target) return target;
	}
	if (toolName === 'outcome_card_load' || toolName === 'work_capability_load') {
		const target = loadTarget(
			argumentRecord,
			'outcomeCard',
			'outcome_card',
			'workCapability',
			'work_capability',
			'id'
		);
		if (target) return target;
	}
	if (toolName === 'resource_load') {
		const target = loadTarget(argumentRecord, 'resource', 'resource_id', 'id');
		if (target) return target;
	}
	if (toolName === 'skill_load') {
		const target = loadTarget(argumentRecord, 'skill', 'id', 'path');
		if (target) return target;
	}
	if (toolName === 'skill_reference_load') {
		const target = skillReferenceTarget(argumentRecord);
		if (target) return target;
	}
	if (toolName === 'call_corsair_mcp_tool') {
		const target = corsairToolTarget(argumentRecord);
		if (target) return target;
	}
	if (toolName === 'delegate_task') {
		const target = delegatedTaskTarget(argumentRecord);
		if (target) return target;
	}
	if (toolName === 'commit_change_set') {
		const target = changeSetTarget(argumentRecord);
		if (target) return target;
	}
	if (toolName === 'get_document_outline') {
		const target = documentTitleTarget(argumentRecord, resultRecord);
		if (target) return target;
	}
	if (toolName === 'read_document_section') {
		const target = documentSectionTarget(argumentRecord, resultRecord);
		if (target) return target;
	}
	if (toolName === 'web_visit') {
		const target = webVisitTarget(argumentRecord);
		if (target) return target;
	}
	if (
		toolName === 'libri_search_capabilities' ||
		toolName === 'libri_get_capability_schema' ||
		toolName === 'resolve_libri_resource' ||
		toolName === 'query_libri_library'
	) {
		const target = libriCapabilityTarget(argumentRecord);
		if (target) return target;
	}
	if (toolName === 'libri_overview') {
		const target = joinCompactLabels(
			argumentRecord?.domain,
			argumentRecord?.include_domains ?? argumentRecord?.includeDomains
		);
		if (target) return target;
	}

	return extractTargetFromRecord(argumentRecord) ?? extractTargetFromRecord(resultRecord);
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
	if (toolName === 'skill_search')
		return { completed: 'Searched skills', failed: 'search skills' };
	if (toolName === 'skill_reference_load') {
		return { completed: 'Loaded skill reference', failed: 'load skill reference' };
	}
	if (toolName === 'domain_search') {
		return { completed: 'Searched domains', failed: 'search domains' };
	}
	if (toolName === 'domain_load') {
		return { completed: 'Loaded domain', failed: 'load domain' };
	}
	if (toolName === 'outcome_card_search' || toolName === 'work_capability_search') {
		return { completed: 'Searched outcome cards', failed: 'search outcome cards' };
	}
	if (toolName === 'outcome_card_load' || toolName === 'work_capability_load') {
		return { completed: 'Loaded outcome card', failed: 'load outcome card' };
	}
	if (toolName === 'resource_search') {
		return { completed: 'Searched resources', failed: 'search resources' };
	}
	if (toolName === 'resource_load') {
		return { completed: 'Loaded resource', failed: 'load resource' };
	}
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
	if (toolName === 'get_document_outline') {
		return { completed: 'Read document outline', failed: 'read document outline' };
	}
	if (toolName === 'read_document_section') {
		return { completed: 'Read document section', failed: 'read document section' };
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
	if (toolName === 'web_search') {
		return { completed: 'Searched web', failed: 'search web' };
	}
	if (toolName === 'libri_overview') {
		return { completed: 'Loaded Libri overview', failed: 'load Libri overview' };
	}
	if (toolName === 'libri_search_capabilities') {
		return { completed: 'Searched Libri capabilities', failed: 'search Libri capabilities' };
	}
	if (toolName === 'libri_get_capability_schema') {
		return {
			completed: 'Loaded Libri capability schema',
			failed: 'load Libri capability schema'
		};
	}
	if (toolName === 'resolve_libri_resource') {
		return { completed: 'Resolved library resource', failed: 'resolve library resource' };
	}
	if (toolName === 'query_libri_library') {
		return { completed: 'Queried library', failed: 'query library' };
	}
	if (toolName === 'list_corsair_mcp_tools') {
		return { completed: 'Listed Corsair tools', failed: 'list Corsair tools' };
	}
	if (toolName === 'call_corsair_mcp_tool') {
		return { completed: 'Called Corsair tool', failed: 'call Corsair tool' };
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
	if (toolName === 'delegate_task') {
		return { completed: 'Delegated background agent', failed: 'delegate background agent' };
	}
	if (toolName === 'commit_change_set') {
		return { completed: 'Committed agent change set', failed: 'commit agent change set' };
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
	const formattedDuration = formatElapsedDuration(source.durationMs);
	const durationSuffix = formattedDuration ? ` (${formattedDuration})` : '';

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
		grouped[groupId] = grouped[groupId]!.sort((a, b) => {
			const aIndex = a.segment_index ?? 0;
			const bIndex = b.segment_index ?? 0;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		});
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
