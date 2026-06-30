// apps/web/src/lib/server/agent-run-chat-session.service.ts
import type { Json } from '@buildos/shared-types';

type AnySupabase = any;

export type AgentRunChatContext = {
	humanText: string;
	llmText: string;
	changeSummaries: string[];
};

export type AgentRunChatSessionOrigin = 'agent_run_context' | 'ai_inbox';

export type AgentRunInboxContext = {
	id?: string | null;
	title?: string | null;
	summary?: string | null;
	source_status?: string | null;
	project_id?: string | null;
};

export type AgentRunChatSessionResult = {
	created: boolean;
	seeded: boolean;
	session: Record<string, unknown>;
	chat_session_id: string;
	context_type: string;
	entity_id: string | null;
	project_id: string | null;
};

type SessionScope = {
	contextType: string;
	entityId: string | null;
	projectId: string | null;
	projectName: string | null;
	chatType: string;
};

const SEED_CONTEXT_VERSION = 1;
const MAX_CHANGE_SUMMARIES = 12;
const MAX_FIELD_SUMMARIES = 8;

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
		: `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function compactTitle(value: unknown): string {
	const title = compactText(value, 80) ?? 'Agent proposal';
	return title;
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) return 'empty';
	if (typeof value === 'string') return compactText(value, 160) ?? 'empty';
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	try {
		return compactText(JSON.stringify(value), 160) ?? 'object';
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

function resolveRunId(run: Record<string, unknown>): string {
	const runId = readString(run.id);
	if (!runId) throw new Error('Agent run id is required');
	return runId;
}

function resolveChangeSet(run: Record<string, unknown>): Record<string, unknown> | null {
	const rowChangeSet = isRecord(run.change_set) ? run.change_set : null;
	if (rowChangeSet) return rowChangeSet;
	const result = isRecord(run.result) ? run.result : null;
	const resultChangeSet = isRecord(result?.proposed_changes) ? result?.proposed_changes : null;
	return resultChangeSet;
}

function summarizeChange(change: Record<string, unknown>, index: number): string {
	const action = readString(change.action) ?? readString(change.op) ?? 'change';
	const op = readString(change.op);
	const entityType = readString(change.entity_type) ?? 'entity';
	const entityId = readString(change.entity_id);
	const rationale = compactText(change.rationale, 260);
	const error = compactText(change.error, 260);
	const decision = readString(change.decision);
	const before = isRecord(change.before) ? change.before : {};
	const after = isRecord(change.after) ? change.after : {};
	const afterKeys = Object.keys(after).filter(
		(key) => !key.endsWith('_id') && key !== 'project_id'
	);
	const fieldLines = afterKeys.slice(0, MAX_FIELD_SUMMARIES).map((key) => {
		return `   - ${key}: ${formatValue(before[key])} -> ${formatValue(after[key])}`;
	});
	if (afterKeys.length > MAX_FIELD_SUMMARIES) {
		fieldLines.push(`   - ${afterKeys.length - MAX_FIELD_SUMMARIES} more fields omitted`);
	}

	const headerParts = [
		`${index + 1}. ${action} ${entityType}`,
		entityId ? ` (${entityId})` : '',
		op ? ` via ${op}` : '',
		decision ? ` [${decision}]` : '',
		rationale ? ` - ${rationale}` : '',
		error ? `\n   - Failed: ${error}` : ''
	];
	const header = headerParts.join('');
	return fieldLines.length ? [header, ...fieldLines].join('\n') : header;
}

function summarizeOpenQuestions(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
		.slice(0, 6)
		.map((item) => `- ${compactText(item, 260) ?? item}`);
}

export function buildAgentRunChatContext(params: {
	run: Record<string, unknown>;
	inbox?: AgentRunInboxContext | null;
}): AgentRunChatContext {
	const { run, inbox = null } = params;
	const changeSet = resolveChangeSet(run);
	const changes = normalizeArray(changeSet?.changes);
	const displayedChanges = changes.slice(0, MAX_CHANGE_SUMMARIES);
	const changeSummaries = displayedChanges.map(summarizeChange);
	if (changes.length > MAX_CHANGE_SUMMARIES) {
		changeSummaries.push(`${changes.length - MAX_CHANGE_SUMMARIES} more changes omitted.`);
	}

	const result = isRecord(run.result) ? run.result : null;
	const resultSummary = compactText(result?.summary, 900) ?? compactText(result?.answer, 900);
	const resultAnswer =
		resultSummary && compactText(result?.answer, 900) === resultSummary
			? null
			: compactText(result?.answer, 900);
	const resultError = compactText(result?.error, 500) ?? compactText(run.error, 500) ?? null;
	const openQuestions = summarizeOpenQuestions(result?.open_questions);
	const metrics = isRecord(run.metrics)
		? run.metrics
		: isRecord(result?.metrics)
			? result?.metrics
			: null;

	const title =
		compactText(inbox?.title, 120) ??
		compactText(run.label, 120) ??
		compactText(result?.label, 120) ??
		'Agent proposal';
	const sourceIntro = inbox
		? 'AI Inbox agent-run item ready to chat about.'
		: 'Agent run ready to chat about.';

	const lines = [
		sourceIntro,
		'',
		`# ${title}`,
		'Source: Agent run',
		readString(run.status) ? `Run status: ${readString(run.status)}` : null,
		readString(changeSet?.status)
			? `Change-set status: ${readString(changeSet?.status)}`
			: null,
		readString(run.scope_mode) ? `Scope mode: ${readString(run.scope_mode)}` : null,
		Array.isArray(run.allowed_ops) && run.allowed_ops.length
			? `Allowed ops: ${run.allowed_ops.join(', ')}`
			: null,
		readString(run.goal) ? `Goal: ${readString(run.goal)}` : null,
		inbox?.summary ? `Inbox summary: ${inbox.summary}` : null
	].filter((line): line is string => Boolean(line));

	appendSection(lines, 'Instructions', compactText(run.instructions, 900));
	appendSection(lines, 'Expected output', compactText(run.expected_output, 500));
	appendSection(lines, 'Proposed or failed changes', changeSummaries);
	appendSection(lines, 'Run result', resultSummary);
	appendSection(lines, 'Run answer', resultAnswer);
	appendSection(lines, 'Open questions', openQuestions);
	appendSection(lines, 'Error', resultError);

	if (metrics) {
		const metricLines = [
			readNumber(metrics.tokens) !== null ? `Tokens: ${readNumber(metrics.tokens)}` : null,
			readNumber(metrics.tool_calls) !== null
				? `Tool calls: ${readNumber(metrics.tool_calls)}`
				: null,
			readNumber(metrics.cost_usd) !== null ? `Cost: $${readNumber(metrics.cost_usd)}` : null
		].filter((line): line is string => Boolean(line));
		appendSection(lines, 'Metrics', metricLines);
	}

	lines.push(
		'',
		'I can help you inspect the proposed changes, compare alternatives, or decide what to do next. Applying or dismissing the proposal remains a separate action unless you explicitly ask me to make a change.'
	);

	const humanText = lines.join('\n');
	return {
		humanText,
		llmText: [
			'You are discussing a BuildOS agent run with the user.',
			'Use this visible seed context as the source of truth for what the run attempted, proposed, or failed to do.',
			'',
			humanText
		].join('\n'),
		changeSummaries
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

function focusMetadata(
	projectId: string | null,
	projectName: string | null
): Record<string, unknown> | undefined {
	if (!projectId) return undefined;
	return {
		focusType: 'project-wide',
		focusEntityId: null,
		focusEntityName: null,
		projectId,
		projectName: projectName ?? 'Project'
	};
}

function resolveNewSessionScope(params: {
	run: Record<string, unknown>;
	projectName: string | null;
}): SessionScope {
	const projectId = readString(params.run.project_id);
	if (projectId) {
		return {
			contextType: 'project',
			entityId: projectId,
			projectId,
			projectName: params.projectName ?? 'Project',
			chatType: 'agent_run'
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

function sessionMatchesProjectScope(
	session: Record<string, unknown>,
	projectId: string | null
): boolean {
	if (!projectId) return true;
	return (
		readString(session.context_type) === 'project' &&
		resolveProjectIdFromSession(session) === projectId
	);
}

function resolveProjectIdFromSession(session: Record<string, unknown>): string | null {
	const metadata = isRecord(session.agent_metadata) ? session.agent_metadata : {};
	const focus = isRecord(metadata.focus) ? metadata.focus : {};
	if (readString(session.context_type) === 'project') {
		return (
			readString(session.entity_id) ??
			readString(focus.projectId) ??
			readString(metadata.project_id)
		);
	}
	return readString(focus.projectId) ?? readString(metadata.project_id);
}

function resolveScopeFromSession(
	session: Record<string, unknown>
): Pick<AgentRunChatSessionResult, 'context_type' | 'entity_id' | 'project_id'> {
	const contextType = readString(session.context_type) ?? 'global';
	const entityId = readString(session.entity_id);
	return {
		context_type: contextType,
		entity_id: entityId,
		project_id: resolveProjectIdFromSession(session)
	};
}

function isUsableSession(
	session: Record<string, unknown> | null
): session is Record<string, unknown> {
	if (!session) return false;
	if (readString(session.archived_at)) return false;
	const status = readString(session.status);
	return !status || status === 'active';
}

async function loadSessionById(params: {
	supabase: AnySupabase;
	sessionId: string | null;
	userId: string;
}): Promise<Record<string, unknown> | null> {
	if (!params.sessionId) return null;
	const { data, error } = await params.supabase
		.from('chat_sessions')
		.select('*')
		.eq('id', params.sessionId)
		.eq('user_id', params.userId)
		.maybeSingle();
	if (error || !isUsableSession(data as Record<string, unknown> | null)) return null;
	return data as Record<string, unknown>;
}

async function findSessionByMetadata(params: {
	supabase: AnySupabase;
	userId: string;
	metadata: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
	const { data, error } = await params.supabase
		.from('chat_sessions')
		.select('*')
		.eq('user_id', params.userId)
		.eq('status', 'active')
		.contains('agent_metadata', params.metadata)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error || !isUsableSession(data as Record<string, unknown> | null)) return null;
	return data as Record<string, unknown>;
}

async function findReusableSession(params: {
	supabase: AnySupabase;
	run: Record<string, unknown>;
	userId: string;
}): Promise<Record<string, unknown> | null> {
	const runId = resolveRunId(params.run);
	const runProjectId = readString(params.run.project_id);
	const parent = await loadSessionById({
		supabase: params.supabase,
		sessionId: readString(params.run.parent_session_id),
		userId: params.userId
	});
	if (parent && sessionMatchesProjectScope(parent, runProjectId)) return parent;

	const inboxSession = await findSessionByMetadata({
		supabase: params.supabase,
		userId: params.userId,
		metadata: { source: 'ai_inbox', source_type: 'agent_run', source_ref_id: runId }
	});
	if (inboxSession && sessionMatchesProjectScope(inboxSession, runProjectId)) {
		return inboxSession;
	}

	const contextSession = await findSessionByMetadata({
		supabase: params.supabase,
		userId: params.userId,
		metadata: { source: 'agent_run_context', agent_run_id: runId }
	});
	return contextSession && sessionMatchesProjectScope(contextSession, runProjectId)
		? contextSession
		: null;
}

function sessionMetadata(params: {
	origin: AgentRunChatSessionOrigin;
	run: Record<string, unknown>;
	projectId: string | null;
	projectName: string | null;
	inbox?: AgentRunInboxContext | null;
	context: AgentRunChatContext;
}): Record<string, unknown> {
	const runId = resolveRunId(params.run);
	const base: Record<string, unknown> = {
		project_id: params.projectId,
		project_name: params.projectName,
		focus: focusMetadata(params.projectId, params.projectName),
		agent_run_context: {
			run_id: runId,
			run_status: readString(params.run.status),
			context_version: SEED_CONTEXT_VERSION,
			llm_text: params.context.llmText
		}
	};

	if (params.origin === 'ai_inbox' && params.inbox) {
		return {
			...base,
			source: 'ai_inbox',
			inbox_item_id: params.inbox.id ?? null,
			source_type: 'agent_run',
			source_ref_id: runId,
			source_status: params.inbox.source_status ?? readString(params.run.status),
			source_label: 'Agent proposal',
			proposal_context: {
				llm_text: params.context.llmText,
				operation_summaries: params.context.changeSummaries
			}
		};
	}

	return {
		...base,
		source: 'agent_run_context',
		agent_run_id: runId,
		run_id: runId
	};
}

function seedMessageMetadata(params: {
	run: Record<string, unknown>;
	context: AgentRunChatContext;
	projectId: string | null;
	inbox?: AgentRunInboxContext | null;
}): Record<string, unknown> {
	const runId = resolveRunId(params.run);
	return {
		source: 'agent_run_context',
		run_id: runId,
		seed_message: true,
		idempotency_key: `agent-run-context:${runId}`,
		run_status: readString(params.run.status),
		change_set_status: readString(resolveChangeSet(params.run)?.status),
		context_version: SEED_CONTEXT_VERSION,
		project_id: params.projectId,
		inbox_item_id: params.inbox?.id ?? null,
		inbox_source_type: params.inbox ? 'agent_run' : null,
		inbox_source_ref_id: params.inbox ? runId : null,
		proposal_context: {
			llm_text: params.context.llmText,
			operation_summaries: params.context.changeSummaries
		}
	};
}

async function cleanupCreatedSession(
	supabase: AnySupabase,
	params: { sessionId: string; userId: string; projectId: string | null }
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

async function createSession(params: {
	supabase: AnySupabase;
	run: Record<string, unknown>;
	userId: string;
	origin: AgentRunChatSessionOrigin;
	inbox?: AgentRunInboxContext | null;
	context: AgentRunChatContext;
	scope: SessionScope;
	now: string;
}): Promise<Record<string, unknown>> {
	const { data: session, error } = await params.supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: params.scope.contextType,
			entity_id: params.scope.entityId,
			status: 'active',
			chat_type: params.scope.chatType,
			title: `Chat: ${compactTitle(params.inbox?.title ?? params.run.label)}`,
			summary: compactText(params.inbox?.summary ?? params.run.goal, 500),
			message_count: 1,
			last_message_at: params.now,
			agent_metadata: sessionMetadata({
				origin: params.origin,
				run: params.run,
				projectId: params.scope.projectId,
				projectName: params.scope.projectName,
				inbox: params.inbox,
				context: params.context
			}) as Json
		})
		.select('*')
		.single();

	if (error || !session) {
		throw error ?? new Error('Failed to create agent-run chat session');
	}

	const sessionId = readString(session.id);
	if (!sessionId) {
		throw new Error('Agent-run chat session id was not returned');
	}

	if (params.scope.projectId) {
		const { error: projectLinkError } = await params.supabase
			.from('chat_sessions_projects')
			.insert({
				chat_session_id: sessionId,
				project_id: params.scope.projectId,
				linked_at: params.now
			});
		if (projectLinkError) {
			await cleanupCreatedSession(params.supabase, {
				sessionId: readString(session.id) ?? '',
				userId: params.userId,
				projectId: params.scope.projectId
			});
			throw projectLinkError;
		}
	}

	return session as Record<string, unknown>;
}

async function ensureSeedMessage(params: {
	supabase: AnySupabase;
	session: Record<string, unknown>;
	run: Record<string, unknown>;
	userId: string;
	context: AgentRunChatContext;
	projectId: string | null;
	inbox?: AgentRunInboxContext | null;
	now: string;
	createdSession: boolean;
}): Promise<boolean> {
	const sessionId = readString(params.session.id);
	if (!sessionId) throw new Error('Chat session id is required');
	const runId = resolveRunId(params.run);
	const idempotencyKey = `agent-run-context:${runId}`;

	const { data: existing, error: existingError } = await params.supabase
		.from('chat_messages')
		.select('id')
		.eq('session_id', sessionId)
		.eq('user_id', params.userId)
		.eq('role', 'assistant')
		.contains('metadata', { idempotency_key: idempotencyKey })
		.limit(1)
		.maybeSingle();

	if (existingError) throw existingError;
	if (existing) return false;

	const { error: messageError } = await params.supabase.from('chat_messages').insert({
		session_id: sessionId,
		user_id: params.userId,
		role: 'assistant',
		content: params.context.humanText,
		message_type: 'assistant_message',
		created_at: params.now,
		metadata: seedMessageMetadata({
			run: params.run,
			context: params.context,
			projectId: params.projectId,
			inbox: params.inbox
		}) as Json
	});
	if (messageError) throw messageError;

	if (!params.createdSession) {
		const currentCount = readNumber(params.session.message_count) ?? 0;
		const { error: updateError } = await params.supabase
			.from('chat_sessions')
			.update({
				message_count: currentCount + 1,
				last_message_at: params.now,
				updated_at: params.now
			})
			.eq('id', sessionId)
			.eq('user_id', params.userId);
		if (updateError) {
			console.warn(
				'[AgentRunChatSession] Failed to bump reused session counters',
				updateError
			);
		}
	}

	return true;
}

export async function createAgentRunChatSession(params: {
	supabase: AnySupabase;
	run: Record<string, unknown>;
	userId: string;
	origin?: AgentRunChatSessionOrigin;
	inbox?: AgentRunInboxContext | null;
}): Promise<AgentRunChatSessionResult> {
	const runId = resolveRunId(params.run);
	const origin = params.origin ?? 'agent_run_context';
	const context = buildAgentRunChatContext({ run: params.run, inbox: params.inbox ?? null });
	const reusableSession = await findReusableSession({
		supabase: params.supabase,
		run: params.run,
		userId: params.userId
	});
	const now = new Date().toISOString();
	let created = false;
	let session = reusableSession;

	if (!session) {
		const runProjectId = readString(params.run.project_id);
		const projectName = await loadProjectName(params.supabase, runProjectId);
		const scope = resolveNewSessionScope({ run: params.run, projectName });
		session = await createSession({
			supabase: params.supabase,
			run: params.run,
			userId: params.userId,
			origin,
			inbox: params.inbox ?? null,
			context,
			scope,
			now
		});
		created = true;
	}

	const scope = resolveScopeFromSession(session);
	try {
		const seeded = await ensureSeedMessage({
			supabase: params.supabase,
			session,
			run: params.run,
			userId: params.userId,
			context,
			projectId: scope.project_id,
			inbox: params.inbox ?? null,
			now,
			createdSession: created
		});
		return {
			created,
			seeded,
			session,
			chat_session_id: readString(session.id) ?? runId,
			context_type: scope.context_type,
			entity_id: scope.entity_id,
			project_id: scope.project_id
		};
	} catch (error) {
		if (created) {
			await cleanupCreatedSession(params.supabase, {
				sessionId: readString(session.id) ?? '',
				userId: params.userId,
				projectId: scope.project_id
			});
		}
		throw error;
	}
}
