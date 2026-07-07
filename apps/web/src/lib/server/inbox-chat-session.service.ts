// apps/web/src/lib/server/inbox-chat-session.service.ts
import {
	buildProjectSuggestionProposalContext,
	type ProposalContextLoopRun
} from '@buildos/shared-agent-ops/proposal-context';
import { createAgentRunChatSession } from './agent-run-chat-session.service';
import { createOrReuseProjectAuditChatSession } from './project-audit-chat-session.service';
import type { InboxIndexRow, InboxSourceType } from '@buildos/shared-agent-ops/inbox-index';
import type { Json } from '@buildos/shared-types';

type AnySupabase = any;

type SupportedInboxSourceType = Extract<
	InboxSourceType,
	'agent_run' | 'project_suggestion' | 'project_audit' | 'calendar_suggestion'
>;

type SourceContext = {
	humanText: string;
	llmText: string;
	displayTitle?: string;
	operationSummaries?: string[];
	evidenceSummaries?: string[];
};

type CalendarEvidenceEvent = {
	calendar_event_id?: unknown;
	event_title?: unknown;
	event_start?: unknown;
	event_end?: unknown;
};

type SessionScope = {
	contextType: 'global' | 'project' | 'calendar';
	entityId: string | null;
	projectId: string | null;
	projectName: string | null;
	chatType: string;
};

export type InboxChatSessionResult = {
	created: boolean;
	session: Record<string, unknown>;
	chat_session_id: string;
	item: InboxIndexRow;
	source_payload: Record<string, unknown> | null;
	context_type: SessionScope['contextType'];
	entity_id: string | null;
	project_id: string | null;
};

const SOURCE_TABLE_BY_TYPE: Record<SupportedInboxSourceType, string> = {
	agent_run: 'agent_runs',
	project_suggestion: 'project_suggestions',
	project_audit: 'project_audits',
	calendar_suggestion: 'calendar_project_suggestions'
};

const SOURCE_LABEL_BY_TYPE: Record<SupportedInboxSourceType, string> = {
	agent_run: 'Agent proposal',
	project_suggestion: 'Project review item',
	project_audit: 'Project audit',
	calendar_suggestion: 'Calendar project suggestion'
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compactText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length <= maxLength
		? normalized
		: `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactVisibleText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const withoutHeadingMarkers = value
		.replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1')
		.replace(/\s+#{1,6}\s+/g, '. ');
	return compactText(withoutHeadingMarkers, maxLength);
}

function compactTitle(value: string | null | undefined): string {
	const title = value?.trim() || 'Inbox item';
	return title.length <= 80 ? title : `${title.slice(0, 77)}...`;
}

function formatCalendarProjectDisplayName(value: unknown): string {
	const raw = readString(value) ?? 'Calendar project suggestion';
	const withoutGenericSuffix = raw.replace(/\s+project$/i, '').trim() || raw;
	const spaced = withoutGenericSuffix.replace(/\b(\d+)([A-Za-z])/g, '$1 $2');
	return spaced
		.split(/\s+/)
		.map((part) =>
			part === part.toLowerCase() && /[a-z]/.test(part)
				? `${part.charAt(0).toUpperCase()}${part.slice(1)}`
				: part
		)
		.join(' ');
}

function formatPercent(value: unknown): string | null {
	const score = readNumber(value);
	if (score === null) return null;
	return `${Math.round(score * 100)}% confidence`;
}

function appendSection(
	lines: string[],
	title: string,
	body: string | string[] | null | undefined
): void {
	const values = Array.isArray(body) ? body.filter(Boolean) : body ? [body] : [];
	if (values.length === 0) return;
	lines.push('', `## ${title}`, ...values);
}

function normalizeArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => isRecord(item))
		: [];
}

function summarizeCalendarTask(task: Record<string, unknown>, index: number): string {
	const title = readString(task.title) ?? 'Untitled task';
	const parts = [
		`${index + 1}. ${title}`,
		compactText(task.description, 180),
		readString(task.start_date) ? `Start: ${readString(task.start_date)}` : null,
		readString(task.priority) ? `Priority: ${readString(task.priority)}` : null,
		readString(task.recurrence_pattern)
			? `Recurrence: ${readString(task.recurrence_pattern)}`
			: null
	].filter((part): part is string => Boolean(part));
	return parts.join(' - ');
}

function summarizeCalendarEventIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids = value
		.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
		.map((item) => item.trim());
	const shown = ids.slice(0, 12);
	const lines = shown.map((id, index) => `${index + 1}. ${id}`);
	if (ids.length > shown.length) {
		lines.push(`...and ${ids.length - shown.length} more event ids.`);
	}
	return lines;
}

function formatCalendarEvidenceDate(value: unknown): string | null {
	const raw = readString(value);
	if (!raw) return null;
	const date = raw.slice(0, 10);
	const time = raw.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
	return time ? `${date} ${time}` : date;
}

function summarizeCalendarEvidenceEvents(
	events: CalendarEvidenceEvent[],
	maxEvents: number
): string[] {
	return events.slice(0, maxEvents).map((event, index) => {
		const title =
			readString(event.event_title) ?? readString(event.calendar_event_id) ?? 'Event';
		const startsAt = formatCalendarEvidenceDate(event.event_start);
		return `${index + 1}. ${title}${startsAt ? ` (${startsAt})` : ''}`;
	});
}

function summarizeCalendarPattern(pattern: Record<string, unknown> | null): string | null {
	if (!pattern) return null;
	const parts = [
		readString(pattern.start_date) ? `starts ${readString(pattern.start_date)}` : null,
		readString(pattern.end_date) ? `ends ${readString(pattern.end_date)}` : null,
		Array.isArray(pattern.tags) && pattern.tags.length
			? `tags: ${pattern.tags.filter((tag) => typeof tag === 'string').join(', ')}`
			: null
	].filter((part): part is string => Boolean(part));
	return parts.length ? parts.join('; ') : null;
}

function buildCalendarSuggestionContext(
	item: InboxIndexRow,
	suggestion: Record<string, unknown> | null,
	evidenceEvents: CalendarEvidenceEvent[] = []
): SourceContext {
	const allTasks = normalizeArray(suggestion?.suggested_tasks);
	const visibleTasks = allTasks
		.slice(0, 3)
		.map((task, index) => `${index + 1}. ${readString(task.title) ?? 'Untitled task'}`);
	const llmTasks = allTasks.slice(0, 8).map(summarizeCalendarTask);
	const eventIdLines = summarizeCalendarEventIds(suggestion?.calendar_event_ids);
	const pattern = isRecord(suggestion?.event_patterns) ? suggestion?.event_patterns : null;
	const patternSummary = summarizeCalendarPattern(pattern);
	const eventCount = readNumber(suggestion?.event_count);
	const displayTitle = formatCalendarProjectDisplayName(
		readString(suggestion?.suggested_name) ?? item.title
	);
	const visibleEvidence = summarizeCalendarEvidenceEvents(evidenceEvents, 4);
	const visibleLines = [
		`Calendar found a possible project: ${displayTitle}.`,
		'',
		`This inbox item is asking whether to create a new project from related calendar activity${eventCount !== null ? ` (${eventCount} events)` : ''}.`,
		allTasks.length
			? `If accepted, it will create the project and seed ${allTasks.length} suggested task${allTasks.length === 1 ? '' : 's'}.`
			: 'If accepted, it will create the project from the calendar analysis.',
		'',
		formatPercent(suggestion?.confidence_score),
		item.summary ? `Why it was suggested: ${compactVisibleText(item.summary, 280)}` : null,
		compactVisibleText(suggestion?.suggested_description, 360)
			? `Suggested description: ${compactVisibleText(suggestion?.suggested_description, 360)}`
			: null,
		compactVisibleText(suggestion?.suggested_context, 420)
			? `Draft project context: ${compactVisibleText(suggestion?.suggested_context, 420)}`
			: null,
		patternSummary ? `Calendar pattern: ${patternSummary}` : null
	].filter((line): line is string => Boolean(line));

	appendSection(visibleLines, 'Suggested tasks', visibleTasks);
	appendSection(
		visibleLines,
		'Calendar evidence',
		visibleEvidence.length
			? visibleEvidence
			: eventCount !== null
				? `${eventCount} related calendar events. Event IDs are available to the agent in the background.`
				: null
	);
	visibleLines.push(
		'',
		'You can ask me to inspect the evidence, adjust the project name/description/tasks, accept it, or dismiss it.'
	);

	const evidenceSummaries = summarizeCalendarEvidenceEvents(evidenceEvents, 20);
	const llmLines = [
		'You are discussing a BuildOS AI Inbox calendar project suggestion with the user.',
		'This suggestion proposes creating a new project from related calendar events and seeding its initial tasks.',
		'Accepting or dismissing the inbox item remains a separate decision unless the user clearly asks you to take that action.',
		'When the user asks for evidence detail beyond the visible summary, use the calendar event ids below with the available calendar tools instead of inventing event details.',
		'',
		`Suggested project display name: ${displayTitle}`,
		readString(suggestion?.suggested_name)
			? `Raw suggested project name: ${readString(suggestion?.suggested_name)}`
			: null,
		readString(suggestion?.status) ? `Source status: ${readString(suggestion?.status)}` : null,
		formatPercent(suggestion?.confidence_score),
		eventCount !== null ? `${eventCount} calendar events` : null,
		item.summary ? `Inbox summary: ${item.summary}` : null
	].filter((line): line is string => Boolean(line));
	appendSection(
		llmLines,
		'Suggested description',
		compactText(suggestion?.suggested_description, 1200)
	);
	appendSection(
		llmLines,
		'Suggested context',
		compactVisibleText(suggestion?.suggested_context, 1600)
	);
	appendSection(llmLines, 'AI reasoning', compactText(suggestion?.ai_reasoning, 1200));
	appendSection(llmLines, 'Suggested tasks', llmTasks);
	appendSection(llmLines, 'Event pattern', patternSummary);
	appendSection(llmLines, 'Calendar evidence event summaries', evidenceSummaries);
	appendSection(llmLines, 'Calendar evidence event ids', eventIdLines);

	return {
		humanText: visibleLines.join('\n'),
		llmText: llmLines.join('\n'),
		displayTitle,
		evidenceSummaries
	};
}

async function loadProjectName(
	supabase: AnySupabase,
	projectId: string | null
): Promise<string | null> {
	if (!projectId) return null;
	const { data } = await supabase
		.from('onto_projects')
		.select('id, name')
		.eq('id', projectId)
		.maybeSingle();
	return readString(data?.name);
}

async function loadSourcePayload(
	supabase: AnySupabase,
	item: InboxIndexRow
): Promise<Record<string, unknown> | null> {
	const table = SOURCE_TABLE_BY_TYPE[item.source_type as SupportedInboxSourceType];
	if (!table) return null;
	const { data, error } = await supabase
		.from(table)
		.select('*')
		.eq('id', item.source_ref_id)
		.maybeSingle();
	if (error) throw error;
	return (data ?? null) as Record<string, unknown> | null;
}

async function loadProjectSuggestionLoopRun(
	supabase: AnySupabase,
	suggestion: Record<string, unknown> | null,
	projectId: string | null
): Promise<ProposalContextLoopRun | null> {
	const runId = readString(suggestion?.run_id);
	if (!runId || !projectId) return null;
	const { data } = await supabase
		.from('project_loop_runs')
		.select('id, trigger_reason, summary, created_at, finished_at')
		.eq('id', runId)
		.eq('project_id', projectId)
		.maybeSingle();
	return (data ?? null) as ProposalContextLoopRun | null;
}

async function loadCalendarEvidenceEvents(
	supabase: AnySupabase,
	suggestion: Record<string, unknown> | null
): Promise<CalendarEvidenceEvent[]> {
	const analysisId = readString(suggestion?.analysis_id);
	const eventIds = Array.isArray(suggestion?.calendar_event_ids)
		? suggestion.calendar_event_ids.filter(
				(eventId): eventId is string =>
					typeof eventId === 'string' && eventId.trim().length > 0
			)
		: [];
	if (!analysisId || eventIds.length === 0) return [];

	const { data, error } = await supabase
		.from('calendar_analysis_events')
		.select('calendar_event_id, event_title, event_start, event_end')
		.eq('analysis_id', analysisId)
		.in('calendar_event_id', eventIds.slice(0, 50));
	if (error) {
		console.warn('Failed to load calendar evidence events for inbox chat', {
			analysisId,
			error
		});
		return [];
	}

	const rows = Array.isArray(data) ? (data as CalendarEvidenceEvent[]) : [];
	const rowsById = new Map<string, CalendarEvidenceEvent>();
	for (const row of rows) {
		const id = readString(row.calendar_event_id);
		if (id) rowsById.set(id, row);
	}
	return eventIds
		.map((id) => rowsById.get(id))
		.filter((row): row is CalendarEvidenceEvent => !!row);
}

async function buildProjectSuggestionContext(params: {
	supabase: AnySupabase;
	item: InboxIndexRow;
	suggestion: Record<string, unknown>;
	projectName: string | null;
}): Promise<SourceContext> {
	const loopRun = await loadProjectSuggestionLoopRun(
		params.supabase,
		params.suggestion,
		params.item.project_id ?? null
	);
	const proposalContext = buildProjectSuggestionProposalContext({
		suggestion: {
			id: params.item.source_ref_id,
			project_id: params.item.project_id ?? '',
			kind: readString(params.suggestion.kind) ?? 'project_suggestion',
			risk_tier: readNumber(params.suggestion.risk_tier) ?? params.item.risk_tier ?? 2,
			title: readString(params.suggestion.title) ?? params.item.title,
			run_id: readString(params.suggestion.run_id),
			rationale: readString(params.suggestion.rationale),
			why_now: readString(params.suggestion.why_now),
			confidence: readNumber(params.suggestion.confidence),
			evidence_refs: params.suggestion.evidence_refs,
			preview: params.suggestion.preview,
			operations: params.suggestion.operations,
			status: readString(params.suggestion.status),
			reversible:
				typeof params.suggestion.reversible === 'boolean'
					? params.suggestion.reversible
					: null,
			freshness_state: readString(params.suggestion.freshness_state),
			created_at: readString(params.suggestion.created_at)
		},
		projectName: params.projectName,
		loopRun
	});

	return {
		humanText: proposalContext.humanText,
		llmText: proposalContext.llmText,
		operationSummaries: proposalContext.operationSummaries,
		evidenceSummaries: proposalContext.evidenceSummaries
	};
}

function resolveSessionScope(params: {
	item: InboxIndexRow;
	sourcePayload: Record<string, unknown> | null;
	projectName: string | null;
}): SessionScope {
	const projectId =
		params.item.project_id ??
		readString(params.sourcePayload?.project_id) ??
		readString(params.sourcePayload?.created_project_id);

	if (projectId) {
		return {
			contextType: 'project',
			entityId: projectId,
			projectId,
			projectName: params.projectName ?? 'Project',
			chatType: 'project'
		};
	}

	if (params.item.source_type === 'calendar_suggestion') {
		return {
			contextType: 'calendar',
			entityId: params.item.source_ref_id,
			projectId: null,
			projectName: null,
			chatType: 'calendar'
		};
	}

	return {
		contextType: 'global',
		entityId: null,
		projectId: null,
		projectName: null,
		chatType: 'global'
	};
}

function buildInboxSessionMetadata(params: {
	item: InboxIndexRow;
	scope: SessionScope;
	context: SourceContext;
}): Record<string, unknown> {
	return {
		source: 'ai_inbox',
		inbox_item_id: params.item.id ?? null,
		source_type: params.item.source_type,
		source_ref_id: params.item.source_ref_id,
		source_status: params.item.source_status ?? null,
		source_label: SOURCE_LABEL_BY_TYPE[params.item.source_type as SupportedInboxSourceType],
		project_id: params.scope.projectId,
		project_name: params.scope.projectName,
		focus: params.scope.projectId
			? {
					focusType: 'project-wide',
					focusEntityId: null,
					focusEntityName: null,
					projectId: params.scope.projectId,
					projectName: params.scope.projectName ?? 'Project'
				}
			: undefined,
		proposal_context: {
			llm_text: params.context.llmText,
			operation_summaries: params.context.operationSummaries ?? [],
			evidence_summaries: params.context.evidenceSummaries ?? []
		}
	};
}

function buildInboxSeedMessageMetadata(params: {
	item: InboxIndexRow;
	scope: SessionScope;
	context: SourceContext;
}): Record<string, unknown> {
	return {
		source: 'ai_inbox',
		inbox_item_id: params.item.id ?? null,
		source_type: params.item.source_type,
		source_ref_id: params.item.source_ref_id,
		project_id: params.scope.projectId,
		seed_message: true,
		proposal_context: {
			llm_text: params.context.llmText
		}
	};
}

async function findExistingChatSession(params: {
	supabase: AnySupabase;
	item: InboxIndexRow;
	sourcePayload: Record<string, unknown> | null;
	userId: string;
}): Promise<Record<string, unknown> | null> {
	const linkedSessionId = readString(params.sourcePayload?.chat_session_id);
	if (linkedSessionId) {
		const { data, error } = await params.supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', linkedSessionId)
			.eq('user_id', params.userId)
			.maybeSingle();
		if (!error && data) return data as Record<string, unknown>;
	}

	const containsCandidates: Record<string, unknown>[] = [];
	if (params.item.id) {
		containsCandidates.push({ source: 'ai_inbox', inbox_item_id: params.item.id });
	}
	containsCandidates.push({
		source: 'ai_inbox',
		source_type: params.item.source_type,
		source_ref_id: params.item.source_ref_id
	});

	for (const candidate of containsCandidates) {
		const { data, error } = await params.supabase
			.from('chat_sessions')
			.select('*')
			.eq('user_id', params.userId)
			.eq('status', 'active')
			.contains('agent_metadata', candidate)
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (!error && data) return data as Record<string, unknown>;
	}

	return null;
}

async function refreshExistingInboxChatSession(params: {
	supabase: AnySupabase;
	session: Record<string, unknown>;
	item: InboxIndexRow;
	scope: SessionScope;
	context: SourceContext;
	sessionMetadata: Record<string, unknown>;
	userId: string;
}): Promise<Record<string, unknown>> {
	const sessionId = readString(params.session.id);
	if (!sessionId) return params.session;

	// Merge only the inbox session metadata keys through the atomic shallow-merge
	// RPC so we never clobber cancel hints (`fastchat_cancel_hints_v1`) or `focus`
	// written concurrently by the stream/cancel writers from a stale snapshot.
	const { data: mergedMetadata, error: metadataMergeError } = await params.supabase.rpc(
		'merge_chat_session_agent_metadata',
		{
			p_session_id: sessionId,
			p_patch: params.sessionMetadata as Json
		}
	);
	if (metadataMergeError) {
		console.warn('Failed to merge inbox chat session metadata', {
			sessionId,
			inboxItemId: params.item.id ?? null,
			error: metadataMergeError
		});
	}

	const { data: updatedSession, error: sessionUpdateError } = await params.supabase
		.from('chat_sessions')
		.update({
			title: `Chat: ${compactTitle(params.context.displayTitle ?? params.item.title)}`,
			summary: params.item.summary ?? null
		})
		.eq('id', sessionId)
		.eq('user_id', params.userId)
		.select('*')
		.maybeSingle();
	if (sessionUpdateError) {
		console.warn('Failed to refresh inbox chat session metadata', {
			sessionId,
			inboxItemId: params.item.id ?? null,
			error: sessionUpdateError
		});
	}

	const { error: seedUpdateError } = await params.supabase
		.from('chat_messages')
		.update({
			content: params.context.humanText,
			metadata: buildInboxSeedMessageMetadata({
				item: params.item,
				scope: params.scope,
				context: params.context
			}) as Json
		})
		.eq('session_id', sessionId)
		.eq('user_id', params.userId)
		.contains('metadata', {
			source: 'ai_inbox',
			source_type: params.item.source_type,
			source_ref_id: params.item.source_ref_id,
			seed_message: true
		});
	if (seedUpdateError) {
		console.warn('Failed to refresh inbox chat seed message', {
			sessionId,
			inboxItemId: params.item.id ?? null,
			error: seedUpdateError
		});
	}

	return (
		(updatedSession as Record<string, unknown> | null) ?? {
			...params.session,
			title: `Chat: ${compactTitle(params.context.displayTitle ?? params.item.title)}`,
			summary: params.item.summary ?? null,
			agent_metadata: mergedMetadata
		}
	);
}

async function cleanupCreatedInboxChatSession(
	supabase: AnySupabase,
	params: { sessionId: string; userId: string; projectId: string | null; reason: string }
): Promise<void> {
	await supabase
		.from('chat_messages')
		.delete()
		.eq('session_id', params.sessionId)
		.eq('user_id', params.userId);

	if (params.projectId) {
		await supabase
			.from('chat_sessions_projects')
			.delete()
			.eq('chat_session_id', params.sessionId)
			.eq('project_id', params.projectId);
	}

	await supabase
		.from('chat_sessions')
		.delete()
		.eq('id', params.sessionId)
		.eq('user_id', params.userId);
}

export async function createInboxChatSession(params: {
	supabase: AnySupabase;
	item: InboxIndexRow;
	userId: string;
}): Promise<InboxChatSessionResult> {
	if (!SOURCE_TABLE_BY_TYPE[params.item.source_type as SupportedInboxSourceType]) {
		throw new Error(`Unsupported inbox source: ${params.item.source_type}`);
	}

	const sourcePayload = await loadSourcePayload(params.supabase, params.item);
	if (!sourcePayload) {
		throw new Error('Inbox source not found');
	}

	if (params.item.source_type === 'agent_run') {
		const result = await createAgentRunChatSession({
			supabase: params.supabase,
			run: sourcePayload,
			userId: params.userId,
			origin: 'ai_inbox',
			inbox: {
				id: params.item.id ?? null,
				title: params.item.title,
				summary: params.item.summary ?? null,
				source_status: params.item.source_status ?? null,
				project_id: params.item.project_id ?? null
			}
		});
		return {
			created: result.created,
			session: result.session,
			chat_session_id: result.chat_session_id,
			item: params.item,
			source_payload: sourcePayload,
			context_type: result.context_type as SessionScope['contextType'],
			entity_id: result.entity_id,
			project_id: result.project_id
		};
	}

	if (params.item.source_type === 'project_audit') {
		const projectId = params.item.project_id ?? readString(sourcePayload.project_id);
		const result = await createOrReuseProjectAuditChatSession({
			supabase: params.supabase,
			auditId: params.item.source_ref_id,
			userId: params.userId,
			projectId
		});
		return {
			created: result.created,
			session: result.session,
			chat_session_id: result.chat_session_id,
			item: params.item,
			source_payload: result.audit,
			context_type: 'project',
			entity_id: projectId,
			project_id: projectId
		};
	}

	const projectName = await loadProjectName(params.supabase, params.item.project_id ?? null);
	const scope = resolveSessionScope({
		item: params.item,
		sourcePayload,
		projectName
	});

	const context =
		params.item.source_type === 'project_suggestion'
			? await buildProjectSuggestionContext({
					supabase: params.supabase,
					item: params.item,
					suggestion: sourcePayload,
					projectName
				})
			: buildCalendarSuggestionContext(
					params.item,
					sourcePayload,
					await loadCalendarEvidenceEvents(params.supabase, sourcePayload)
				);
	const sessionMetadata = buildInboxSessionMetadata({
		item: params.item,
		scope,
		context
	});

	const existingSession = await findExistingChatSession({
		supabase: params.supabase,
		item: params.item,
		sourcePayload,
		userId: params.userId
	});
	if (existingSession) {
		const refreshedSession = await refreshExistingInboxChatSession({
			supabase: params.supabase,
			session: existingSession,
			item: params.item,
			scope,
			context,
			sessionMetadata,
			userId: params.userId
		});
		return {
			created: false,
			session: refreshedSession,
			chat_session_id:
				readString(refreshedSession.id) ?? readString(existingSession.id) ?? '',
			item: params.item,
			source_payload: sourcePayload,
			context_type: scope.contextType,
			entity_id: scope.entityId,
			project_id: scope.projectId
		};
	}

	const now = new Date().toISOString();

	const { data: session, error: sessionError } = await params.supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: scope.contextType,
			entity_id: scope.entityId,
			status: 'active',
			chat_type: scope.chatType,
			title: `Chat: ${compactTitle(context.displayTitle ?? params.item.title)}`,
			summary: params.item.summary ?? null,
			message_count: 1,
			last_message_at: now,
			agent_metadata: sessionMetadata as Json
		})
		.select('*')
		.single();

	if (sessionError || !session) {
		throw sessionError ?? new Error('Failed to create inbox chat session');
	}

	const sessionId = readString(session.id);
	if (!sessionId) {
		throw new Error('Inbox chat session id was not returned');
	}

	if (scope.projectId) {
		const { error: projectLinkError } = await params.supabase
			.from('chat_sessions_projects')
			.insert({
				chat_session_id: sessionId,
				project_id: scope.projectId,
				linked_at: now
			});
		if (projectLinkError) {
			await cleanupCreatedInboxChatSession(params.supabase, {
				sessionId,
				userId: params.userId,
				projectId: scope.projectId,
				reason: 'project_link_insert_failed'
			});
			throw projectLinkError;
		}
	}

	const { error: messageError } = await params.supabase.from('chat_messages').insert({
		session_id: sessionId,
		user_id: params.userId,
		role: 'assistant',
		content: context.humanText,
		message_type: 'assistant_message',
		created_at: now,
		metadata: {
			...buildInboxSeedMessageMetadata({
				item: params.item,
				scope,
				context
			})
		} as Json
	});

	if (messageError) {
		await cleanupCreatedInboxChatSession(params.supabase, {
			sessionId,
			userId: params.userId,
			projectId: scope.projectId,
			reason: 'seed_message_insert_failed'
		});
		throw messageError;
	}

	if (params.item.source_type === 'project_suggestion') {
		const { data: updatedSuggestion, error: updateError } = await params.supabase
			.from('project_suggestions')
			.update({
				chat_session_id: sessionId,
				updated_at: now
			})
			.eq('id', params.item.source_ref_id)
			.eq('project_id', scope.projectId)
			.select('id')
			.maybeSingle();
		if (updateError || !updatedSuggestion) {
			console.warn('Failed to persist project suggestion chat session link', {
				suggestionId: params.item.source_ref_id,
				inboxItemId: params.item.id ?? null,
				sessionId,
				error: updateError ?? 'No project_suggestions row returned'
			});
		}
	}

	return {
		created: true,
		session,
		chat_session_id: sessionId,
		item: params.item,
		source_payload: sourcePayload,
		context_type: scope.contextType,
		entity_id: scope.entityId,
		project_id: scope.projectId
	};
}
