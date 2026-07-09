// apps/web/src/lib/components/agent/agent-chat-timeline.ts
import type {
	AgentTimelineEntityRef,
	AgentTimelineItem,
	AgentTimelineItemKind,
	AgentTimelineItemStatus,
	UIMessage
} from './agent-chat.types';
import {
	buildAffectedEntityUrl,
	extractAffectedEntitiesFromToolExecution,
	normalizeAffectedEntityKind
} from '$lib/services/agentic-chat/tools/core/affected-entities';

const MAX_PREVIEW_CHARS = 700;
const MAX_FULL_JSON_CHARS = 12_000;
const SENSITIVE_KEY_PATTERN =
	/(authorization|cookie|credential|password|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;

export interface TimelineChatMessageRow {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	role?: string | null;
	content?: string | null;
	created_at?: string | null;
	metadata?: unknown;
}

export interface TimelineToolExecutionRow {
	id: string;
	session_id?: string | null;
	message_id?: string | null;
	turn_run_id?: string | null;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	tool_name?: string | null;
	tool_category?: string | null;
	gateway_op?: string | null;
	help_path?: string | null;
	sequence_index?: number | null;
	arguments?: unknown;
	result?: unknown;
	result_count?: number | null;
	zero_result?: boolean | null;
	execution_time_ms?: number | null;
	tokens_consumed?: number | null;
	success?: boolean | null;
	error_message?: string | null;
	requires_user_action?: boolean | null;
	affected_entities?: unknown;
	created_at?: string | null;
}

export interface TimelineTurnRunRow {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	status?: string | null;
	finished_reason?: string | null;
	request_message?: string | null;
	assistant_message_id?: string | null;
	context_type?: string | null;
	entity_id?: string | null;
	project_id?: string | null;
	source?: string | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface TimelineTurnEventRow {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	turn_run_id?: string | null;
	stream_run_id?: string | null;
	event_type?: string | null;
	phase?: string | null;
	payload?: unknown;
	sequence_index?: number | null;
	created_at?: string | null;
}

export interface BuildAgentTimelineParams {
	sessionId: string;
	messages?: TimelineChatMessageRow[];
	toolExecutions?: TimelineToolExecutionRow[];
	turnRuns?: TimelineTurnRunRow[];
	turnEvents?: TimelineTurnEventRow[];
}

function isRecord(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function booleanValue(value: unknown): boolean | null {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true') return true;
		if (normalized === 'false') return false;
	}
	return null;
}

function normalizeStatus(value: string | boolean | null | undefined): AgentTimelineItemStatus {
	if (value === true) return 'completed';
	if (value === false) return 'failed';
	switch (value) {
		case 'completed':
		case 'success':
		case 'succeeded':
		case 'done':
			return 'completed';
		case 'failed':
		case 'error':
			return 'failed';
		case 'partial':
			return 'partial';
		case 'needs_input':
		case 'waiting_on_user':
			return 'needs_input';
		case 'cancelled':
		case 'canceled':
		case 'aborted':
			return 'cancelled';
		case 'pending':
		case 'queued':
			return 'pending';
		case 'running':
		case 'processing':
		case 'active':
			return 'running';
		default:
			return 'completed';
	}
}

function fallbackTimestamp(...values: Array<string | null | undefined>): string {
	for (const value of values) {
		if (!value) continue;
		const time = new Date(value).getTime();
		if (Number.isFinite(time)) return new Date(time).toISOString();
	}
	return new Date(0).toISOString();
}

function truncate(value: string, maxChars = MAX_PREVIEW_CHARS): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function hasSensitiveKey(value: unknown): boolean {
	if (!isRecord(value) && !Array.isArray(value)) return false;
	const stack: unknown[] = [value];
	while (stack.length > 0) {
		const current = stack.pop();
		if (Array.isArray(current)) {
			for (const item of current) stack.push(item);
			continue;
		}
		if (!isRecord(current)) continue;
		for (const [key, nested] of Object.entries(current)) {
			if (SENSITIVE_KEY_PATTERN.test(key)) return true;
			if (nested && typeof nested === 'object') stack.push(nested);
		}
	}
	return false;
}

function safePrettyJson(value: unknown): string | null {
	try {
		const fullJson = JSON.stringify(value, null, 2);
		if (fullJson.length > MAX_FULL_JSON_CHARS) return null;
		return fullJson;
	} catch {
		return null;
	}
}

function redactedJsonPreview(value: unknown): {
	preview: string | null;
	fullJson: string | null;
	redacted: boolean;
} {
	if (value === undefined || value === null) {
		return { preview: null, fullJson: null, redacted: false };
	}
	if (hasSensitiveKey(value)) {
		return { preview: '[redacted sensitive fields]', fullJson: null, redacted: true };
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return { preview: null, fullJson: null, redacted: false };
		try {
			const parsed = JSON.parse(trimmed);
			if (hasSensitiveKey(parsed)) {
				return { preview: '[redacted sensitive fields]', fullJson: null, redacted: true };
			}
			return {
				preview: truncate(JSON.stringify(parsed)),
				fullJson: safePrettyJson(parsed),
				redacted: false
			};
		} catch {
			return {
				preview: truncate(trimmed.replace(/\s+/g, ' ')),
				fullJson: null,
				redacted: false
			};
		}
	}

	try {
		return {
			preview: truncate(JSON.stringify(value)),
			fullJson: safePrettyJson(value),
			redacted: false
		};
	} catch {
		return { preview: truncate(String(value)), fullJson: null, redacted: false };
	}
}

function humanizeIdentifier(value: string | null | undefined): string {
	if (!value) return 'Agent activity';
	return value
		.replace(/^onto\./, '')
		.replace(/^util\./, '')
		.replace(/^create_onto_/, 'create ')
		.replace(/^update_onto_/, 'update ')
		.replace(/^delete_onto_/, 'delete ')
		.replace(/[._-]+/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function projectRefFromEntity(ref: AgentTimelineEntityRef | null): AgentTimelineEntityRef | null {
	if (!ref?.projectId) return null;
	return {
		kind: 'project',
		id: ref.projectId,
		title: ref.kind === 'project' ? (ref.title ?? null) : null,
		projectId: ref.projectId,
		url: `/projects/${ref.projectId}`,
		operation: ref.kind === 'project' ? ref.operation : 'linked'
	};
}

function toolSummaryTitle(execution: TimelineToolExecutionRow): string {
	const op = execution.gateway_op || execution.tool_name || 'tool';
	const status = normalizeStatus(execution.success);
	const prefix =
		status === 'failed' ? 'Failed' : status === 'needs_input' ? 'Needs input' : 'Ran';
	return `${prefix} ${humanizeIdentifier(op)}`;
}

function toolSummaryText(
	execution: TimelineToolExecutionRow,
	entityRef: AgentTimelineEntityRef | null
): string {
	if (execution.error_message) return execution.error_message;
	if (entityRef) {
		const action = entityRef.operation ?? 'changed';
		const title = entityRef.title || entityRef.id;
		return `${humanizeIdentifier(action)} ${entityRef.kind}: ${title}`;
	}
	if (typeof execution.result_count === 'number') {
		return `${execution.result_count} result${execution.result_count === 1 ? '' : 's'}`;
	}
	if (execution.zero_result) return 'No results returned';
	return execution.gateway_op || execution.tool_name || 'Tool execution completed';
}

function buildToolTimelineItem(
	sessionId: string,
	execution: TimelineToolExecutionRow
): AgentTimelineItem | null {
	if (!execution.id || !execution.tool_name) return null;
	const argsPreview = redactedJsonPreview(execution.arguments);
	const resultPreview = redactedJsonPreview(execution.result);
	const entityRefs = extractAffectedEntitiesFromToolExecution(execution);
	const entityRef = entityRefs[0] ?? null;
	const timestamp = fallbackTimestamp(execution.created_at);
	const status = execution.requires_user_action
		? 'needs_input'
		: normalizeStatus(execution.success);

	return {
		id: `tool_execution:${execution.id}`,
		sessionId,
		turnRunId: execution.turn_run_id ?? null,
		streamRunId: execution.stream_run_id ?? null,
		clientTurnId: execution.client_turn_id ?? null,
		messageId: execution.message_id ?? null,
		source: 'tool_execution',
		kind: 'tool',
		status,
		timestamp,
		sequenceIndex: execution.sequence_index ?? null,
		title: toolSummaryTitle(execution),
		summary: toolSummaryText(execution, entityRef),
		detailPreview: resultPreview.preview,
		tool: {
			name: execution.tool_name,
			category: execution.tool_category ?? null,
			gatewayOp: execution.gateway_op ?? null,
			helpPath: execution.help_path ?? null,
			durationMs: execution.execution_time_ms ?? null,
			tokensConsumed: execution.tokens_consumed ?? null,
			argsPreview: argsPreview.preview,
			argsFullJson: argsPreview.fullJson,
			resultPreview: resultPreview.preview,
			resultFullJson: resultPreview.fullJson,
			errorMessage: execution.error_message ?? null,
			zeroResult: execution.zero_result ?? null,
			resultCount: execution.result_count ?? null
		},
		projectRef: projectRefFromEntity(entityRef),
		entityRefs,
		redaction: {
			argsRedacted: argsPreview.redacted,
			resultRedacted: resultPreview.redacted,
			reason: argsPreview.redacted || resultPreview.redacted ? 'sensitive fields' : null
		}
	};
}

function buildChangeTimelineItem(toolItem: AgentTimelineItem): AgentTimelineItem | null {
	const entityRef = toolItem.entityRefs.find((ref) =>
		['created', 'updated', 'deleted', 'linked'].includes(String(ref.operation))
	);
	if (!entityRef) return null;
	const operation = entityRef.operation ?? 'changed';
	const title = `${humanizeIdentifier(operation)} ${humanizeIdentifier(entityRef.kind)}`;
	const entityLabel = entityRef.title || entityRef.id;

	return {
		...toolItem,
		id: `entity_change:${toolItem.id.replace(/^tool_execution:/, '')}:${entityRef.kind}:${entityRef.id}`,
		source: 'entity_change',
		kind: 'change',
		title,
		summary: entityLabel,
		detailPreview: toolItem.summary
	};
}

function buildCreatedEntityChangeTimelineItem(
	sessionId: string,
	message: UIMessage,
	entity: unknown,
	index: number
): AgentTimelineItem | null {
	if (!isRecord(entity)) return null;
	const kind = normalizeAffectedEntityKind(
		stringValue(entity.kind) ?? stringValue(entity.entity_type)
	);
	const id = stringValue(entity.id) ?? stringValue(entity.entity_id);
	if (!kind || !id) return null;
	const title =
		stringValue(entity.name) ?? stringValue(entity.title) ?? stringValue(entity.label);
	const projectId =
		kind === 'project'
			? id
			: stringValue(entity.projectId) || stringValue(entity.project_id) || null;
	const entityRef: AgentTimelineEntityRef = {
		kind,
		id,
		title,
		projectId,
		operation: 'created'
	};
	entityRef.url = buildAffectedEntityUrl(entityRef);
	const label = title || id;

	return {
		id: `entity_change:${message.id}:${kind}:${id}`,
		sessionId,
		messageId: message.id,
		source: 'entity_change',
		kind: 'change',
		status: 'completed',
		timestamp: fallbackTimestamp(message.created_at, message.timestamp?.toISOString()),
		sequenceIndex: index,
		title: `${humanizeIdentifier('created')} ${humanizeIdentifier(kind)}`,
		summary: label,
		detailPreview: `Created ${kind}: ${label}`,
		projectRef: projectRefFromEntity(entityRef),
		entityRefs: [entityRef]
	};
}

function buildMessageTimelineItem(
	sessionId: string,
	message: TimelineChatMessageRow
): AgentTimelineItem | null {
	if (!message.id || !message.role) return null;
	const role = message.role === 'user' ? 'User message' : 'Assistant message';
	const content = (message.content ?? '').replace(/\s+/g, ' ').trim();
	return {
		id: `message:${message.id}`,
		sessionId,
		messageId: message.id,
		source: 'message',
		kind: 'message',
		status: 'completed',
		timestamp: fallbackTimestamp(message.created_at),
		title: role,
		summary: content ? truncate(content, 180) : null,
		detailPreview: content ? truncate(content, MAX_PREVIEW_CHARS) : null,
		projectRef: null,
		entityRefs: []
	};
}

function buildTurnRunTimelineItem(
	sessionId: string,
	run: TimelineTurnRunRow
): AgentTimelineItem | null {
	if (!run.id) return null;
	const status = normalizeStatus(run.status);
	const timestamp = fallbackTimestamp(run.started_at, run.created_at, run.updated_at);
	const projectRef =
		run.project_id || (run.context_type === 'project' && run.entity_id)
			? {
					kind: 'project',
					id: run.project_id ?? run.entity_id!,
					projectId: run.project_id ?? run.entity_id!,
					url: `/projects/${run.project_id ?? run.entity_id}`,
					operation: 'linked'
				}
			: null;
	return {
		id: `turn_run:${run.id}`,
		sessionId,
		turnRunId: run.id,
		streamRunId: run.stream_run_id ?? null,
		clientTurnId: run.client_turn_id ?? null,
		messageId: run.assistant_message_id ?? null,
		source: 'turn_run',
		kind: 'status',
		status,
		timestamp,
		title:
			status === 'running' ? 'Agent turn started' : `Agent turn ${status.replace('_', ' ')}`,
		summary: run.request_message
			? truncate(run.request_message.replace(/\s+/g, ' ').trim(), 220)
			: null,
		detailPreview: run.finished_reason ? `Finished reason: ${run.finished_reason}` : null,
		projectRef,
		entityRefs: projectRef ? [projectRef] : []
	};
}

function shouldShowTurnEvent(event: TimelineTurnEventRow): boolean {
	const type = event.event_type ?? '';
	const phase = event.phase ?? '';
	if (!type && !phase) return false;
	if (
		[
			'heartbeat',
			'token',
			'chunk',
			'delta',
			'debug',
			'prompt_snapshot',
			'llm_request',
			'llm_response'
		].some((hidden) => type.includes(hidden) || phase.includes(hidden))
	) {
		return false;
	}
	return true;
}

function buildTurnEventTimelineItem(
	sessionId: string,
	event: TimelineTurnEventRow
): AgentTimelineItem | null {
	if (!event.id || !shouldShowTurnEvent(event)) return null;
	const payload = isRecord(event.payload) ? event.payload : {};
	const payloadPreview = redactedJsonPreview(event.payload);
	const status = normalizeStatus(
		stringValue(payload.status) ?? stringValue(payload.state) ?? event.event_type
	);
	const title =
		stringValue(payload.title) ||
		stringValue(payload.message) ||
		humanizeIdentifier(event.event_type || event.phase || 'Agent step');

	return {
		id: `turn_event:${event.id}`,
		sessionId,
		turnRunId: event.turn_run_id ?? null,
		streamRunId: event.stream_run_id ?? null,
		source: 'turn_event',
		kind: 'step',
		status,
		timestamp: fallbackTimestamp(event.created_at),
		sequenceIndex: event.sequence_index ?? null,
		title,
		summary:
			stringValue(payload.summary) ||
			stringValue(payload.detail) ||
			stringValue(payload.message) ||
			null,
		detailPreview: payloadPreview.preview,
		projectRef: null,
		entityRefs: [],
		redaction: {
			resultRedacted: payloadPreview.redacted,
			reason: payloadPreview.redacted ? 'sensitive fields' : null
		}
	};
}

function sourceSortPriority(source: AgentTimelineItem['source']): number {
	switch (source) {
		case 'turn_run':
			return 0;
		case 'turn_event':
			return 1;
		case 'tool_execution':
			return 2;
		case 'entity_change':
			return 3;
		case 'message':
			return 4;
		default:
			return 9;
	}
}

function compareTimelineItems(left: AgentTimelineItem, right: AgentTimelineItem): number {
	const leftTime = new Date(left.timestamp).getTime();
	const rightTime = new Date(right.timestamp).getTime();
	if (leftTime !== rightTime) return leftTime - rightTime;
	const leftSequence = left.sequenceIndex ?? Number.POSITIVE_INFINITY;
	const rightSequence = right.sequenceIndex ?? Number.POSITIVE_INFINITY;
	if (leftSequence !== rightSequence) return leftSequence - rightSequence;
	const sourceDelta = sourceSortPriority(left.source) - sourceSortPriority(right.source);
	if (sourceDelta !== 0) return sourceDelta;
	return left.id.localeCompare(right.id);
}

function createdChangeSemanticKey(item: AgentTimelineItem): string | null {
	if (item.kind !== 'change') return null;
	const entityRef = item.entityRefs.find((ref) => ref.operation === 'created');
	if (!entityRef?.id || !entityRef.kind) return null;
	return `created:${entityRef.kind}:${entityRef.id}`;
}

function sortAndDedupeTimelineItems(items: AgentTimelineItem[]): AgentTimelineItem[] {
	const seenIds = new Set<string>();
	const seenCreatedChanges = new Set<string>();
	return items.sort(compareTimelineItems).filter((item) => {
		if (seenIds.has(item.id)) return false;
		const createdKey = createdChangeSemanticKey(item);
		if (createdKey) {
			if (seenCreatedChanges.has(createdKey)) return false;
			seenCreatedChanges.add(createdKey);
		}
		seenIds.add(item.id);
		return true;
	});
}

export function buildAgentTimeline(params: BuildAgentTimelineParams): AgentTimelineItem[] {
	const items: AgentTimelineItem[] = [];

	for (const run of params.turnRuns ?? []) {
		const item = buildTurnRunTimelineItem(params.sessionId, run);
		if (item) items.push(item);
	}

	for (const event of params.turnEvents ?? []) {
		const item = buildTurnEventTimelineItem(params.sessionId, event);
		if (item) items.push(item);
	}

	for (const execution of params.toolExecutions ?? []) {
		const item = buildToolTimelineItem(params.sessionId, execution);
		if (!item) continue;
		items.push(item);
		const change = buildChangeTimelineItem(item);
		if (change) items.push(change);
	}

	for (const message of params.messages ?? []) {
		const item = buildMessageTimelineItem(params.sessionId, message);
		if (item) items.push(item);
	}

	return sortAndDedupeTimelineItems(items);
}

export function mergeAgentTimelineItems(
	persistedItems: AgentTimelineItem[],
	liveItems: AgentTimelineItem[]
): AgentTimelineItem[] {
	const byId = new Map<string, AgentTimelineItem>();
	const seenCreatedChanges = new Set<string>();
	for (const item of persistedItems) {
		const createdKey = createdChangeSemanticKey(item);
		if (createdKey) seenCreatedChanges.add(createdKey);
		byId.set(item.id, item);
	}
	for (const item of liveItems) {
		const createdKey = createdChangeSemanticKey(item);
		if (createdKey && seenCreatedChanges.has(createdKey)) continue;
		if (createdKey) seenCreatedChanges.add(createdKey);
		if (!byId.has(item.id)) {
			byId.set(item.id, item);
		}
	}
	return Array.from(byId.values()).sort(compareTimelineItems);
}

function timelineEntityRefLabel(ref: AgentTimelineEntityRef): string {
	const title = ref.title || ref.id;
	const operation = ref.operation ? `, ${ref.operation}` : '';
	return `${ref.kind}: ${title} (${ref.id}${operation})`;
}

export function buildTimelineItemQuestionDraft(item: AgentTimelineItem): string {
	const lines: string[] = [
		`Can you explain this ${item.kind} and what I should do next?`,
		'',
		`Timeline item: ${item.title}`,
		`Status: ${item.status}`
	];

	if (item.summary) {
		lines.push(`Summary: ${item.summary}`);
	}

	if (item.tool?.name) {
		const gateway = item.tool.gatewayOp ? ` (${item.tool.gatewayOp})` : '';
		lines.push(`Tool: ${item.tool.name}${gateway}`);
	}

	if (item.tool?.errorMessage) {
		lines.push(`Error: ${item.tool.errorMessage}`);
	}

	const refs = new Map<string, AgentTimelineEntityRef>();
	if (item.projectRef) {
		refs.set(`${item.projectRef.kind}:${item.projectRef.id}`, item.projectRef);
	}
	for (const ref of item.entityRefs) {
		refs.set(`${ref.kind}:${ref.id}:${ref.operation ?? ''}`, ref);
	}
	if (refs.size > 0) {
		lines.push(`Related: ${Array.from(refs.values()).map(timelineEntityRefLabel).join('; ')}`);
	}

	lines.push(`Timeline item id: ${item.id}`);
	return lines.join('\n');
}

export function timelineItemsFromMessages(
	sessionId: string,
	messages: UIMessage[]
): AgentTimelineItem[] {
	const items: AgentTimelineItem[] = [];
	for (const message of messages) {
		if (message.type === 'created_entities') {
			const entities: unknown[] = Array.isArray(message.data?.entities)
				? message.data.entities
				: [];
			entities.forEach((entity: unknown, index: number) => {
				const item = buildCreatedEntityChangeTimelineItem(
					sessionId,
					message,
					entity,
					index
				);
				if (item) items.push(item);
			});
			continue;
		}
		if (message.type === 'thinking_block' && Array.isArray((message as any).activities)) {
			for (const activity of (message as any).activities) {
				const metadata = activity.metadata ?? {};
				const timestamp =
					activity.timestamp instanceof Date
						? activity.timestamp.toISOString()
						: fallbackTimestamp(activity.timestamp, message.created_at);
				const toolName =
					stringValue(metadata.toolName) ?? stringValue(metadata.originalToolName);
				const kind: AgentTimelineItemKind =
					activity.activityType === 'tool_call' ? 'tool' : 'step';
				if (kind === 'tool' && toolName) {
					const toolItem = buildToolTimelineItem(sessionId, {
						id:
							stringValue(metadata.toolExecutionId) ??
							stringValue(metadata.toolCallId) ??
							activity.toolCallId ??
							activity.id,
						session_id: sessionId,
						message_id: message.id,
						turn_run_id:
							stringValue(metadata.turnRunId) ?? stringValue(metadata.turn_run_id),
						stream_run_id:
							stringValue(metadata.streamRunId) ??
							stringValue(metadata.stream_run_id),
						client_turn_id:
							stringValue(metadata.clientTurnId) ??
							stringValue(metadata.client_turn_id),
						tool_name: toolName,
						tool_category:
							stringValue(metadata.toolCategory) ??
							stringValue(metadata.tool_category),
						gateway_op:
							stringValue(metadata.gatewayOp) ?? stringValue(metadata.gateway_op),
						help_path:
							stringValue(metadata.helpPath) ?? stringValue(metadata.help_path),
						sequence_index: numberValue(metadata.sequenceIndex),
						arguments: metadata.arguments ?? metadata.rawArguments ?? metadata.args,
						result: metadata.result ?? metadata.response,
						result_count:
							numberValue(metadata.resultCount) ?? numberValue(metadata.result_count),
						zero_result:
							booleanValue(metadata.zeroResult) ?? booleanValue(metadata.zero_result),
						execution_time_ms:
							numberValue(metadata.durationMs) ?? numberValue(metadata.duration_ms),
						tokens_consumed:
							numberValue(metadata.tokensConsumed) ??
							numberValue(metadata.tokens_consumed),
						success: activity.status !== 'failed',
						error_message: stringValue(metadata.error),
						requires_user_action:
							booleanValue(metadata.requiresUserAction) ??
							booleanValue(metadata.requires_user_action),
						affected_entities: metadata.affectedEntities ?? metadata.affected_entities,
						created_at: timestamp
					});
					if (toolItem) {
						items.push(toolItem);
						const change = buildChangeTimelineItem(toolItem);
						if (change) items.push(change);
					}
					continue;
				}
				items.push({
					id: `activity:${activity.id}`,
					sessionId,
					source: 'turn_event',
					kind,
					status: normalizeStatus(activity.status),
					timestamp,
					messageId: message.id,
					title: activity.content,
					summary: activity.content,
					detailPreview: redactedJsonPreview(metadata.result ?? metadata.response)
						.preview,
					tool: null,
					projectRef: null,
					entityRefs: []
				});
			}
			continue;
		}
		const item = buildMessageTimelineItem(sessionId, {
			id: message.id,
			session_id: message.session_id,
			role: message.role ?? message.type,
			content: message.content,
			created_at: message.created_at ?? message.timestamp?.toISOString(),
			metadata: message.metadata
		});
		if (item) items.push(item);
	}
	return sortAndDedupeTimelineItems(items);
}
