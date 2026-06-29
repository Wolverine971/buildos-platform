// apps/web/src/lib/server/inbox-chat-session.service.ts
import {
	buildProjectSuggestionProposalContext,
	type ProposalContextLoopRun
} from '@buildos/shared-agent-ops/proposal-context';
import type { InboxIndexRow, InboxSourceType } from '@buildos/shared-agent-ops/inbox-index';
import type { Json } from '@buildos/shared-types';

type AnySupabase = any;

type SupportedInboxSourceType = Extract<
	InboxSourceType,
	'agent_run' | 'project_suggestion' | 'calendar_suggestion'
>;

type SourceContext = {
	humanText: string;
	llmText: string;
	operationSummaries?: string[];
	evidenceSummaries?: string[];
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
	calendar_suggestion: 'calendar_project_suggestions'
};

const SOURCE_LABEL_BY_TYPE: Record<SupportedInboxSourceType, string> = {
	agent_run: 'Agent proposal',
	project_suggestion: 'Project review item',
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

function compactTitle(value: string | null | undefined): string {
	const title = value?.trim() || 'Inbox item';
	return title.length <= 80 ? title : `${title.slice(0, 77)}...`;
}

function formatPercent(value: unknown): string | null {
	const score = readNumber(value);
	if (score === null) return null;
	return `${Math.round(score * 100)}% confidence`;
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) return 'empty';
	if (typeof value === 'string') return compactText(value, 140) ?? 'empty';
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	try {
		return compactText(JSON.stringify(value), 140) ?? 'object';
	} catch {
		return 'object';
	}
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

function summarizeChange(change: Record<string, unknown>, index: number): string {
	const action = readString(change.action) ?? readString(change.op) ?? 'change';
	const entityType = readString(change.entity_type) ?? 'entity';
	const entityId = readString(change.entity_id);
	const rationale = compactText(change.rationale, 220);
	const error = compactText(change.error, 240);
	const before = isRecord(change.before) ? change.before : {};
	const after = isRecord(change.after) ? change.after : {};
	const fieldLines = Object.keys(after)
		.filter((key) => !key.endsWith('_id') && key !== 'project_id')
		.slice(0, 6)
		.map((key) => `   - ${key}: ${formatValue(before[key])} -> ${formatValue(after[key])}`);
	const header = [
		`${index + 1}. ${action} ${entityType}`,
		entityId ? ` (${entityId})` : '',
		rationale ? ` - ${rationale}` : '',
		error ? `\n   - Failed: ${error}` : ''
	].join('');
	return fieldLines.length ? [header, ...fieldLines].join('\n') : header;
}

function buildAgentRunContext(
	item: InboxIndexRow,
	run: Record<string, unknown> | null
): SourceContext {
	const changeSet = isRecord(run?.change_set) ? run?.change_set : null;
	const changes = normalizeArray(changeSet?.changes);
	const result = isRecord(run?.result) ? run?.result : null;
	const resultSummary = compactText(result?.summary, 700) ?? compactText(result?.answer, 700);
	const changeSummaries = changes.map(summarizeChange);
	const lines = [
		'AI Inbox item ready to chat about.',
		'',
		`# ${item.title || readString(run?.label) || 'Agent proposal'}`,
		'Source: Agent proposal',
		readString(run?.status) ? `Status: ${readString(run?.status)}` : null,
		readString(run?.goal) ? `Goal: ${readString(run?.goal)}` : null,
		item.summary ? `Inbox summary: ${item.summary}` : null
	].filter((line): line is string => Boolean(line));

	appendSection(lines, 'Instructions', compactText(run?.instructions, 700));
	appendSection(lines, 'Proposed changes', changeSummaries);
	appendSection(lines, 'Run result', resultSummary);
	lines.push(
		'',
		'I can help you inspect the proposed changes, compare alternatives, or decide whether to accept or dismiss this inbox item.'
	);

	return {
		humanText: lines.join('\n'),
		llmText: [
			'You are discussing a BuildOS AI Inbox agent proposal with the user.',
			'Use the seeded proposal context as source material. Applying or dismissing the inbox item remains a separate decision unless the user clearly asks you to make a change.',
			'',
			...lines
		].join('\n')
	};
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

function buildCalendarSuggestionContext(
	item: InboxIndexRow,
	suggestion: Record<string, unknown> | null
): SourceContext {
	const tasks = normalizeArray(suggestion?.suggested_tasks)
		.slice(0, 8)
		.map(summarizeCalendarTask);
	const pattern = isRecord(suggestion?.event_patterns) ? suggestion?.event_patterns : null;
	const patternLines = [
		readString(pattern?.start_date) ? `Start: ${readString(pattern?.start_date)}` : null,
		readString(pattern?.end_date) ? `End: ${readString(pattern?.end_date)}` : null,
		Array.isArray(pattern?.tags) ? `Tags: ${pattern.tags.join(', ')}` : null
	].filter((line): line is string => Boolean(line));
	const lines = [
		'Calendar project suggestion ready to chat about.',
		'',
		`# ${readString(suggestion?.suggested_name) ?? item.title ?? 'Calendar project suggestion'}`,
		'Source: Calendar analysis',
		readString(suggestion?.status) ? `Status: ${readString(suggestion?.status)}` : null,
		formatPercent(suggestion?.confidence_score),
		readNumber(suggestion?.event_count) !== null
			? `${readNumber(suggestion?.event_count)} calendar events`
			: null,
		item.summary ? `Inbox summary: ${item.summary}` : null
	].filter((line): line is string => Boolean(line));

	appendSection(
		lines,
		'Suggested description',
		compactText(suggestion?.suggested_description, 700)
	);
	appendSection(lines, 'Suggested context', compactText(suggestion?.suggested_context, 900));
	appendSection(lines, 'AI reasoning', compactText(suggestion?.ai_reasoning, 900));
	appendSection(lines, 'Suggested tasks', tasks);
	appendSection(lines, 'Event pattern', patternLines);
	lines.push(
		'',
		'I can help you inspect the calendar evidence, adjust the project idea, or decide whether to accept or dismiss this inbox item.'
	);

	return {
		humanText: lines.join('\n'),
		llmText: [
			'You are discussing a BuildOS AI Inbox calendar project suggestion with the user.',
			'Use the seeded calendar context as source material. Accepting or dismissing the inbox item remains a separate decision unless the user clearly asks you to make a change.',
			'',
			...lines
		].join('\n')
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
			chatType:
				params.item.source_type === 'project_suggestion' ? 'project_suggestion' : 'project'
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

	const projectName = await loadProjectName(params.supabase, params.item.project_id ?? null);
	const scope = resolveSessionScope({
		item: params.item,
		sourcePayload,
		projectName
	});
	const existingSession = await findExistingChatSession({
		supabase: params.supabase,
		item: params.item,
		sourcePayload,
		userId: params.userId
	});
	if (existingSession) {
		return {
			created: false,
			session: existingSession,
			chat_session_id: readString(existingSession.id) ?? '',
			item: params.item,
			source_payload: sourcePayload,
			context_type: scope.contextType,
			entity_id: scope.entityId,
			project_id: scope.projectId
		};
	}

	const context =
		params.item.source_type === 'project_suggestion'
			? await buildProjectSuggestionContext({
					supabase: params.supabase,
					item: params.item,
					suggestion: sourcePayload,
					projectName
				})
			: params.item.source_type === 'calendar_suggestion'
				? buildCalendarSuggestionContext(params.item, sourcePayload)
				: buildAgentRunContext(params.item, sourcePayload);

	const now = new Date().toISOString();
	const sessionMetadata: Record<string, unknown> = {
		source: 'ai_inbox',
		inbox_item_id: params.item.id ?? null,
		source_type: params.item.source_type,
		source_ref_id: params.item.source_ref_id,
		source_status: params.item.source_status ?? null,
		source_label: SOURCE_LABEL_BY_TYPE[params.item.source_type as SupportedInboxSourceType],
		project_id: scope.projectId,
		project_name: scope.projectName,
		focus: scope.projectId
			? {
					focusType: 'project-wide',
					focusEntityId: null,
					focusEntityName: null,
					projectId: scope.projectId,
					projectName: scope.projectName ?? 'Project'
				}
			: undefined,
		proposal_context: {
			llm_text: context.llmText,
			operation_summaries: context.operationSummaries ?? [],
			evidence_summaries: context.evidenceSummaries ?? []
		}
	};

	const { data: session, error: sessionError } = await params.supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: scope.contextType,
			entity_id: scope.entityId,
			status: 'active',
			chat_type: scope.chatType,
			title: `Chat: ${compactTitle(params.item.title)}`,
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
		message_type: 'text',
		created_at: now,
		metadata: {
			source: 'ai_inbox',
			inbox_item_id: params.item.id ?? null,
			source_type: params.item.source_type,
			source_ref_id: params.item.source_ref_id,
			project_id: scope.projectId,
			seed_message: true,
			proposal_context: {
				llm_text: context.llmText
			}
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
			await cleanupCreatedInboxChatSession(params.supabase, {
				sessionId,
				userId: params.userId,
				projectId: scope.projectId,
				reason: 'project_suggestion_link_update_failed'
			});
			throw (
				updateError ?? new Error('Failed to link inbox chat session to project suggestion')
			);
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
