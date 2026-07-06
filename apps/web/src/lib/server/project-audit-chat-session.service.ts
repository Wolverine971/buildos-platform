// apps/web/src/lib/server/project-audit-chat-session.service.ts
import type { Json } from '@buildos/shared-types';

type AnySupabase = any;

export type ProjectAuditChatSessionResult = {
	created: boolean;
	seeded: boolean;
	chat_session_id: string;
	session: Record<string, unknown>;
	audit: Record<string, unknown>;
	project: Record<string, unknown> | null;
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
		: `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => isRecord(item))
		: [];
}

function auditTitle(projectName: string | null): string {
	return projectName ? `Chat: ${projectName} audit` : 'Chat: Project audit';
}

function summarizeFinding(finding: Record<string, unknown>, index: number): string {
	return `${index + 1}. ${
		compactText(finding.title, 120) ??
		compactText(finding.summary, 160) ??
		compactText(finding.description, 160) ??
		'Finding'
	}`;
}

function summarizeRecommendation(item: Record<string, unknown>, index: number): string {
	const title =
		compactText(item.title, 120) ??
		compactText(item.summary, 160) ??
		compactText(item.description, 160) ??
		'Recommendation';
	const priority = readString(item.priority);
	return `${index + 1}. ${title}${priority ? ` (${priority})` : ''}`;
}

function buildVisibleSeed(params: {
	audit: Record<string, unknown>;
	projectName: string | null;
	childSuggestions: Record<string, unknown>[];
}): string {
	const deliveryConfidence = readString(params.audit.delivery_confidence) ?? 'unknown';
	const summary = compactText(params.audit.summary, 420);
	const topFindings = normalizeArray(params.audit.top_findings).slice(0, 3);
	const recommendations = normalizeArray(params.audit.recommendations).slice(0, 3);
	const pendingSuggestions = params.childSuggestions.filter(
		(item) => readString(item.status) === 'pending' || readString(item.status) === 'delegated'
	);

	const lines = [
		`I reviewed the latest complete audit for ${params.projectName ?? 'this project'}.`,
		'',
		`Delivery confidence: ${deliveryConfidence}`,
		readString(params.audit.status) ? `Audit status: ${readString(params.audit.status)}` : null,
		readString(params.audit.trigger_reason)
			? `Trigger: ${readString(params.audit.trigger_reason)}`
			: null,
		pendingSuggestions.length
			? `Follow-up items: ${pendingSuggestions.length} pending suggestion${pendingSuggestions.length === 1 ? '' : 's'}.`
			: 'Follow-up items: none pending yet.',
		summary ? `\n${summary}` : null
	].filter((line): line is string => Boolean(line));

	if (topFindings.length) {
		lines.push('', '## Top findings', ...topFindings.map(summarizeFinding));
	}

	if (recommendations.length) {
		lines.push('', '## Recommendations', ...recommendations.map(summarizeRecommendation));
	}

	lines.push(
		'',
		'You can ask me to explain the evidence, compare this to the last audit, or turn one recommendation into a concrete project change.'
	);

	return lines.join('\n');
}

function buildSessionMetadata(params: {
	audit: Record<string, unknown>;
	project: Record<string, unknown> | null;
	childSuggestions: Record<string, unknown>[];
}): Record<string, unknown> {
	return {
		source: 'project_audit',
		audit_id: params.audit.id,
		project_id: params.audit.project_id,
		project_name: readString(params.project?.name),
		status: readString(params.audit.status),
		trigger_reason: readString(params.audit.trigger_reason),
		delivery_confidence: readString(params.audit.delivery_confidence),
		project_size_class: readString(params.audit.project_size_class),
		audit_depth: readString(params.audit.audit_depth),
		summary: compactText(params.audit.summary, 1200),
		project_thesis: compactText(params.audit.project_thesis, 800),
		change_summary: params.audit.change_summary ?? null,
		dimensions: params.audit.dimensions ?? [],
		risks: params.audit.risks ?? [],
		open_questions: params.audit.open_questions ?? [],
		evidence_refs: params.audit.evidence_refs ?? [],
		recommendations: params.audit.recommendations ?? [],
		child_suggestions: params.childSuggestions.map((suggestion) => ({
			id: readString(suggestion.id),
			title: readString(suggestion.title),
			status: readString(suggestion.status),
			risk_tier: readNumber(suggestion.risk_tier)
		}))
	};
}

async function loadAuditContext(params: {
	supabase: AnySupabase;
	auditId: string;
	projectId?: string | null;
}): Promise<{
	audit: Record<string, unknown> | null;
	project: Record<string, unknown> | null;
	childSuggestions: Record<string, unknown>[];
}> {
	let auditQuery = params.supabase.from('project_audits').select('*').eq('id', params.auditId);
	if (params.projectId) auditQuery = auditQuery.eq('project_id', params.projectId);
	const { data: audit, error: auditError } = await auditQuery.maybeSingle();
	if (auditError) throw auditError;
	if (!audit) return { audit: null, project: null, childSuggestions: [] };

	const projectId = readString(audit.project_id);
	const [projectRes, linksRes] = await Promise.all([
		projectId
			? params.supabase
					.from('onto_projects')
					.select('id, name')
					.eq('id', projectId)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		params.supabase
			.from('project_audit_suggestions')
			.select('role, project_suggestions(id, title, status, risk_tier)')
			.eq('audit_id', params.auditId)
	]);

	if (projectRes.error) throw projectRes.error;
	if (linksRes.error) throw linksRes.error;

	const childSuggestions = ((linksRes.data ?? []) as Record<string, unknown>[])
		.map((link) => link.project_suggestions)
		.filter((item): item is Record<string, unknown> => isRecord(item));

	return {
		audit: audit as Record<string, unknown>,
		project: (projectRes.data as Record<string, unknown> | null) ?? null,
		childSuggestions
	};
}

async function findExistingAuditChatSession(params: {
	supabase: AnySupabase;
	audit: Record<string, unknown>;
	userId: string;
}): Promise<Record<string, unknown> | null> {
	const linkedSessionId = readString(params.audit.chat_session_id);
	if (linkedSessionId) {
		const { data, error } = await params.supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', linkedSessionId)
			.eq('user_id', params.userId)
			.maybeSingle();
		if (!error && data) return data as Record<string, unknown>;
	}

	const auditId = readString(params.audit.id);
	if (!auditId) return null;
	const { data, error } = await params.supabase
		.from('chat_sessions')
		.select('*')
		.eq('user_id', params.userId)
		.eq('status', 'active')
		.contains('agent_metadata', { source: 'project_audit', audit_id: auditId })
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (!error && data) return data as Record<string, unknown>;
	return null;
}

async function upsertSeedMessage(params: {
	supabase: AnySupabase;
	sessionId: string;
	userId: string;
	auditId: string;
	content: string;
}): Promise<boolean> {
	const metadata = {
		source: 'project_audit',
		audit_id: params.auditId,
		seed_message: true
	};
	const { data: existing, error: existingError } = await params.supabase
		.from('chat_messages')
		.select('id')
		.eq('session_id', params.sessionId)
		.eq('user_id', params.userId)
		.contains('metadata', metadata)
		.limit(1)
		.maybeSingle();
	if (existingError) throw existingError;

	if (existing?.id) {
		const { error } = await params.supabase
			.from('chat_messages')
			.update({
				content: params.content,
				metadata: metadata as Json
			})
			.eq('id', existing.id);
		if (error) throw error;
		return false;
	}

	const { error } = await params.supabase.from('chat_messages').insert({
		session_id: params.sessionId,
		user_id: params.userId,
		role: 'assistant',
		content: params.content,
		message_type: 'assistant_message',
		metadata: metadata as Json
	});
	if (error) throw error;
	return true;
}

export async function createOrReuseProjectAuditChatSession(params: {
	supabase: AnySupabase;
	auditId: string;
	userId: string;
	projectId?: string | null;
}): Promise<ProjectAuditChatSessionResult> {
	const { audit, project, childSuggestions } = await loadAuditContext(params);
	if (!audit) throw new Error('Project audit not found');

	const auditId = readString(audit.id);
	const projectId = readString(audit.project_id);
	if (!auditId || !projectId) throw new Error('Project audit is missing required ids');

	const projectName = readString(project?.name);
	const visibleSeed = buildVisibleSeed({ audit, projectName, childSuggestions });
	const agentMetadata = buildSessionMetadata({ audit, project, childSuggestions });
	const existing = await findExistingAuditChatSession({
		supabase: params.supabase,
		audit,
		userId: params.userId
	});

	if (existing) {
		const sessionId = readString(existing.id);
		if (!sessionId) throw new Error('Existing audit chat session is missing id');
		const { data: mergedMetadata } = await params.supabase.rpc(
			'merge_chat_session_agent_metadata',
			{
				p_session_id: sessionId,
				p_patch: agentMetadata as Json
			}
		);
		const { data: updatedSession, error: updateError } = await params.supabase
			.from('chat_sessions')
			.update({
				title: auditTitle(projectName),
				summary: compactText(audit.summary, 500),
				agent_metadata: (mergedMetadata ?? agentMetadata) as Json
			})
			.eq('id', sessionId)
			.eq('user_id', params.userId)
			.select('*')
			.maybeSingle();
		if (updateError) throw updateError;

		await upsertSeedMessage({
			supabase: params.supabase,
			sessionId,
			userId: params.userId,
			auditId,
			content: visibleSeed
		});

		return {
			created: false,
			seeded: true,
			chat_session_id: sessionId,
			session: (updatedSession as Record<string, unknown> | null) ?? existing,
			audit,
			project
		};
	}

	const now = new Date().toISOString();
	const { data: session, error: sessionError } = await params.supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: 'project',
			entity_id: projectId,
			status: 'active',
			chat_type: 'project_audit',
			title: auditTitle(projectName),
			summary: compactText(audit.summary, 500),
			message_count: 1,
			last_message_at: now,
			agent_metadata: agentMetadata as Json
		})
		.select('*')
		.single();

	if (sessionError || !session) {
		throw sessionError ?? new Error('Failed to create project audit chat session');
	}

	const sessionId = readString(session.id);
	if (!sessionId) throw new Error('Project audit chat session id was not returned');

	const { error: linkError } = await params.supabase.from('chat_sessions_projects').insert({
		chat_session_id: sessionId,
		project_id: projectId,
		linked_at: now
	});
	if (linkError) {
		await params.supabase
			.from('chat_sessions')
			.update({ status: 'archived', archived_at: now })
			.eq('id', sessionId)
			.eq('status', 'active');
		throw linkError;
	}

	await upsertSeedMessage({
		supabase: params.supabase,
		sessionId,
		userId: params.userId,
		auditId,
		content: visibleSeed
	});

	const { error: auditUpdateError } = await params.supabase
		.from('project_audits')
		.update({ chat_session_id: sessionId })
		.eq('id', auditId)
		.eq('project_id', projectId);
	if (auditUpdateError) throw auditUpdateError;

	return {
		created: true,
		seeded: true,
		chat_session_id: sessionId,
		session: session as Record<string, unknown>,
		audit: { ...audit, chat_session_id: sessionId },
		project
	};
}
