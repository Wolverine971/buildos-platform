// packages/shared-agent-ops/src/inbox-index.ts
//
// Worker-safe helpers for maintaining the AI Inbox denormalized index. Source
// tables remain authoritative; these functions only upsert/repair index rows.
import type { SupabaseClient } from '@supabase/supabase-js';

export type InboxSourceType =
	| 'agent_run'
	| 'project_suggestion'
	| 'project_audit'
	| 'calendar_suggestion'
	| 'profile_fragment'
	| 'contact_merge_candidate';

export type InboxItemStatus =
	| 'pending'
	| 'deciding'
	| 'decided'
	| 'blocked'
	| 'expired'
	| 'snoozed';

export type InboxAudience = 'user' | 'project_members';

export interface InboxIndexRow {
	id?: string;
	source_type: InboxSourceType;
	source_ref_id: string;
	source_status?: string | null;
	user_id?: string | null;
	project_id?: string | null;
	audience: InboxAudience;
	status: InboxItemStatus;
	title: string;
	summary?: string | null;
	risk_tier?: number | null;
	action_kinds: string[];
	blocked_reason?: string | null;
	snoozed_until?: string | null;
	expires_at?: string | null;
	decided_at?: string | null;
	created_at?: string;
	updated_at?: string;
}

type AnySupabase = SupabaseClient<any, any, any>;
const INBOX_REVIEW_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
export const PROJECT_DELETED_INBOX_REASON = 'Project was deleted';

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compactText(value: unknown, maxLength: number): string | null {
	const text = asString(value)?.replace(/\s+/g, ' ').trim();
	if (!text) return null;
	return text.length <= maxLength
		? text
		: `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

type AuditInboxRecommendation = {
	title: string;
	summary: string | null;
	role: string | null;
	priority: string | null;
	evidenceLabels: string[];
};

function readAuditInboxRecommendations(audit: Record<string, unknown>): AuditInboxRecommendation[] {
	const source = [
		...(Array.isArray(audit.recommendations) ? audit.recommendations : []),
		...(Array.isArray(audit.top_actions) ? audit.top_actions : [])
	];
	const recommendations: AuditInboxRecommendation[] = [];
	const seen = new Set<string>();

	for (const item of source) {
		const record = asRecord(item);
		const title = compactText(record?.title ?? item, 180);
		if (!title) continue;
		const key = title.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const evidenceLabels = Array.isArray(record?.evidence_refs)
			? record.evidence_refs
					.map((ref) => compactText(asRecord(ref)?.label ?? asRecord(ref)?.title, 80))
					.filter((label): label is string => Boolean(label))
					.slice(0, 3)
			: [];
		recommendations.push({
			title,
			summary: compactText(record?.summary ?? record?.description, 420),
			role: asString(record?.role),
			priority: asString(record?.priority),
			evidenceLabels
		});
	}

	return recommendations;
}

function auditRecommendationTitle(recommendation: AuditInboxRecommendation): string {
	const prefix =
		recommendation.role === 'decision_point'
			? 'Decision'
			: recommendation.role === 'cleanup'
				? 'Update'
				: recommendation.role === 'risk_follow_up'
					? 'Consider'
					: 'Recommendation';
	return `${prefix}: ${recommendation.title}`;
}

function auditRecommendationSummary(params: {
	audit: Record<string, unknown>;
	recommendation: AuditInboxRecommendation;
	additionalCount: number;
}): string | null {
	const factors = params.recommendation.summary ?? compactText(params.audit.summary, 420);
	const evidence = params.recommendation.evidenceLabels.length
		? ` Evidence: ${params.recommendation.evidenceLabels.join(', ')}.`
		: '';
	const more = params.additionalCount
		? ` ${params.additionalCount} more recommendation${params.additionalCount === 1 ? '' : 's'} in the audit.`
		: '';
	if (!factors && !evidence && !more) return null;
	return `${factors ? `Factors: ${factors}` : ''}${evidence}${more}`.trim();
}

function formatCalendarSuggestionTitle(value: unknown): string {
	const raw = asString(value) ?? 'Calendar project suggestion';
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

function changeCount(changeSet: unknown): number {
	const record = asRecord(changeSet);
	const changes = record?.changes;
	return Array.isArray(changes) ? changes.length : 0;
}

function changeSetStatus(changeSet: unknown): string | null {
	const record = asRecord(changeSet);
	return asString(record?.status);
}

function terminalDecidedAt(row: Record<string, unknown>): string | null {
	return (
		asString(row.decided_at) ??
		asString(row.completed_at) ??
		asString(row.status_changed_at) ??
		asString(row.updated_at) ??
		null
	);
}

function projectAuditDecidedAt(row: Record<string, unknown>): string | null {
	return asString(row.reviewed_at) ?? asString(row.archived_at) ?? terminalDecidedAt(row);
}

function parseTimestamp(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function shouldPreserveActiveSnooze(
	existing: InboxIndexRow | null,
	nextStatus: InboxItemStatus
): boolean {
	if (nextStatus !== 'pending' || existing?.status !== 'snoozed') return false;
	const snoozedUntil = parseTimestamp(existing.snoozed_until);
	return snoozedUntil !== null && snoozedUntil > Date.now();
}

function shouldPreserveExpired(
	existing: InboxIndexRow | null,
	nextStatus: InboxItemStatus
): boolean {
	if (
		existing?.status === 'expired' &&
		existing.blocked_reason === PROJECT_DELETED_INBOX_REASON
	) {
		return true;
	}
	if ((nextStatus !== 'pending' && nextStatus !== 'deciding') || existing?.status !== 'expired') {
		return false;
	}
	const expiresAt = parseTimestamp(existing.expires_at);
	return expiresAt !== null && expiresAt <= Date.now();
}

function reviewExpiresAt(
	createdAt: string | null | undefined,
	status: InboxItemStatus
): string | null {
	if (status !== 'pending' && status !== 'deciding') return null;
	const created = parseTimestamp(createdAt);
	const base = created ?? Date.now();
	return new Date(base + INBOX_REVIEW_EXPIRY_MS).toISOString();
}

function shouldExpireIncoming(row: InboxIndexRow): boolean {
	if (row.status !== 'pending' && row.status !== 'deciding' && row.status !== 'snoozed') {
		return false;
	}
	const expiresAt = parseTimestamp(row.expires_at);
	return expiresAt !== null && expiresAt <= Date.now();
}

async function upsertInboxItem(
	supabase: AnySupabase,
	row: InboxIndexRow
): Promise<InboxIndexRow | null> {
	const { data: existingData, error: existingError } = await (supabase as any)
		.from('inbox_items')
		.select('status,snoozed_until,expires_at,decided_at,blocked_reason')
		.eq('source_type', row.source_type)
		.eq('source_ref_id', row.source_ref_id)
		.maybeSingle();
	if (existingError) {
		console.warn('[AI Inbox] Failed to read existing inbox item before upsert', {
			source_type: row.source_type,
			source_ref_id: row.source_ref_id,
			error: existingError.message
		});
	}
	const existing = (existingData ?? null) as InboxIndexRow | null;
	const preserveSnooze = shouldPreserveActiveSnooze(existing, row.status);
	const preserveExpired = shouldPreserveExpired(existing, row.status);
	const expireIncoming = shouldExpireIncoming(row);
	const finalExpired = preserveExpired || expireIncoming;
	const payload = {
		source_type: row.source_type,
		source_ref_id: row.source_ref_id,
		source_status: row.source_status ?? null,
		user_id: row.user_id ?? null,
		project_id: row.project_id ?? null,
		audience: row.audience,
		status: finalExpired ? 'expired' : preserveSnooze ? 'snoozed' : row.status,
		title: row.title,
		summary: row.summary ?? null,
		risk_tier: row.risk_tier ?? null,
		action_kinds: row.action_kinds,
		blocked_reason: finalExpired
			? (existing?.blocked_reason ?? 'Review item expired')
			: preserveSnooze
				? null
				: (row.blocked_reason ?? null),
		snoozed_until: finalExpired
			? null
			: preserveSnooze
				? existing?.snoozed_until
				: (row.snoozed_until ?? null),
		expires_at: preserveExpired ? existing?.expires_at : (row.expires_at ?? null),
		decided_at: finalExpired
			? (existing?.decided_at ?? new Date().toISOString())
			: preserveSnooze
				? null
				: (row.decided_at ?? null)
	};

	const { data, error } = await (supabase as any)
		.from('inbox_items')
		.upsert(payload, { onConflict: 'source_type,source_ref_id' })
		.select('*')
		.single();

	if (error) {
		console.warn('[AI Inbox] Failed to upsert inbox item', {
			source_type: row.source_type,
			source_ref_id: row.source_ref_id,
			error: error.message
		});
		return null;
	}

	return (data ?? null) as InboxIndexRow | null;
}

async function markInboxItemExpired(
	supabase: AnySupabase,
	sourceType: InboxSourceType,
	sourceRefId: string
): Promise<InboxIndexRow | null> {
	const { data, error } = await (supabase as any)
		.from('inbox_items')
		.update({
			status: 'expired',
			source_status: 'missing',
			decided_at: new Date().toISOString(),
			blocked_reason: 'Source review item no longer exists'
		})
		.eq('source_type', sourceType)
		.eq('source_ref_id', sourceRefId)
		.select('*')
		.maybeSingle();
	if (error) {
		console.warn('[AI Inbox] Failed to expire missing inbox item', {
			sourceType,
			sourceRefId,
			error: error.message
		});
		return null;
	}
	return (data ?? null) as InboxIndexRow | null;
}

async function markProjectAuditInboxNoActionRequired(
	supabase: AnySupabase,
	auditId: string
): Promise<InboxIndexRow | null> {
	const { data, error } = await (supabase as any)
		.from('inbox_items')
		.update({
			status: 'expired',
			source_status: 'no_action_required',
			decided_at: new Date().toISOString(),
			blocked_reason: 'Audit completed without an actionable recommendation',
			snoozed_until: null,
			expires_at: null
		})
		.eq('source_type', 'project_audit')
		.eq('source_ref_id', auditId)
		.in('status', ['pending', 'deciding', 'snoozed', 'blocked'])
		.select('*')
		.maybeSingle();
	if (error) {
		console.warn('[AI Inbox] Failed to expire no-action project audit item', {
			auditId,
			error: error.message
		});
		return null;
	}
	return (data ?? null) as InboxIndexRow | null;
}

export function mapAgentRunToInboxItem(run: Record<string, unknown>): InboxIndexRow | null {
	const runId = asString(run.id);
	const userId = asString(run.user_id);
	if (!runId || !userId) return null;

	const status = asString(run.status) ?? 'unknown';
	const setStatus = changeSetStatus(run.change_set);
	const changes = changeCount(run.change_set);
	if (changes === 0) return null;

	let inboxStatus: InboxItemStatus = 'pending';
	let blockedReason: string | null = null;
	if (status === 'proposal_ready' && setStatus === 'pending') {
		inboxStatus = 'pending';
	} else if (
		(status === 'completed' || status === 'partial') &&
		setStatus &&
		setStatus !== 'pending'
	) {
		inboxStatus = 'decided';
	} else if (status === 'failed' || status === 'cancelled') {
		inboxStatus = 'blocked';
		blockedReason = asString(run.error) ?? `Agent run ended as ${status}`;
	} else if (status === 'running') {
		inboxStatus = 'deciding';
	}

	const label = asString(run.label) ?? 'Agent proposal';
	const goal = asString(run.goal);
	return {
		source_type: 'agent_run',
		source_ref_id: runId,
		source_status: status,
		user_id: userId,
		project_id: asString(run.project_id),
		audience: 'user',
		status: inboxStatus,
		title: label,
		summary: changes === 1 ? goal : `${changes} proposed changes${goal ? ` - ${goal}` : ''}`,
		risk_tier: null,
		action_kinds: ['approve', 'reject'],
		blocked_reason: blockedReason,
		decided_at:
			inboxStatus === 'decided' || inboxStatus === 'blocked' ? terminalDecidedAt(run) : null,
		expires_at: reviewExpiresAt(asString(run.created_at), inboxStatus),
		created_at: asString(run.created_at) ?? undefined
	};
}

export function mapProjectSuggestionToInboxItem(
	suggestion: Record<string, unknown>
): InboxIndexRow | null {
	const id = asString(suggestion.id);
	const projectId = asString(suggestion.project_id);
	if (!id || !projectId) return null;

	const status = asString(suggestion.status) ?? 'pending';
	const inboxStatus: InboxItemStatus =
		status === 'pending'
			? 'pending'
			: status === 'approved' || status === 'delegated'
				? 'deciding'
				: status === 'failed'
					? 'blocked'
					: 'decided';

	return {
		source_type: 'project_suggestion',
		source_ref_id: id,
		source_status: status,
		user_id: null,
		project_id: projectId,
		audience: 'project_members',
		status: inboxStatus,
		title: asString(suggestion.title) ?? 'Project review item',
		summary: asString(suggestion.why_now) ?? asString(suggestion.rationale),
		risk_tier:
			typeof suggestion.risk_tier === 'number'
				? Math.max(1, Math.min(3, suggestion.risk_tier))
				: null,
		action_kinds: ['approve', 'reject'],
		blocked_reason: inboxStatus === 'blocked' ? 'Project suggestion failed to apply' : null,
		decided_at:
			inboxStatus === 'pending' || inboxStatus === 'deciding'
				? null
				: terminalDecidedAt(suggestion),
		expires_at: reviewExpiresAt(asString(suggestion.created_at), inboxStatus),
		created_at: asString(suggestion.created_at) ?? undefined
	};
}

export function mapProjectAuditToInboxItem(audit: Record<string, unknown>): InboxIndexRow | null {
	const id = asString(audit.id);
	const projectId = asString(audit.project_id);
	if (!id || !projectId) return null;
	const status = asString(audit.status) ?? 'queued';
	if (status === 'queued' || status === 'running') return null;
	const recommendations = readAuditInboxRecommendations(audit);
	// Audit reports remain useful project history, but the inbox is reserved for
	// concrete asks. Queued/running audits and clean audits must not create noise.
	if (recommendations.length === 0) return null;
	const leadRecommendation = recommendations[0];

	const inboxStatus: InboxItemStatus =
		status === 'ready' ? 'pending' : status === 'failed' ? 'blocked' : 'decided';
	const summary = auditRecommendationSummary({
		audit,
		recommendation: leadRecommendation,
		additionalCount: recommendations.length - 1
	});

	return {
		source_type: 'project_audit',
		source_ref_id: id,
		source_status: status,
		user_id: null,
		project_id: projectId,
		audience: 'project_members',
		status: inboxStatus,
		title: auditRecommendationTitle(leadRecommendation),
		summary,
		risk_tier:
			leadRecommendation.priority === 'high'
				? 3
				: leadRecommendation.priority === 'low'
					? 1
					: 2,
		action_kinds: ['open', 'resolve'],
		blocked_reason: inboxStatus === 'blocked' ? 'Project audit failed' : null,
		decided_at: inboxStatus === 'pending' ? null : projectAuditDecidedAt(audit),
		expires_at: reviewExpiresAt(asString(audit.created_at), inboxStatus),
		created_at: asString(audit.created_at) ?? undefined
	};
}

export function mapCalendarSuggestionToInboxItem(
	suggestion: Record<string, unknown>
): InboxIndexRow | null {
	const id = asString(suggestion.id);
	const userId = asString(suggestion.user_id);
	if (!id || !userId) return null;

	const status = asString(suggestion.status) ?? 'pending';
	let inboxStatus: InboxItemStatus;
	if (status === 'pending') inboxStatus = 'pending';
	else if (status === 'processing') inboxStatus = 'deciding';
	else inboxStatus = 'decided';

	const taskCount = Array.isArray(suggestion.suggested_tasks)
		? suggestion.suggested_tasks.length
		: null;
	const eventCount = typeof suggestion.event_count === 'number' ? suggestion.event_count : null;
	const summaryParts = [
		eventCount !== null ? `${eventCount} calendar event${eventCount === 1 ? '' : 's'}` : null,
		taskCount !== null ? `${taskCount} suggested task${taskCount === 1 ? '' : 's'}` : null
	].filter(Boolean);

	return {
		source_type: 'calendar_suggestion',
		source_ref_id: id,
		source_status: status,
		user_id: userId,
		project_id: asString(suggestion.created_project_id),
		audience: 'user',
		status: inboxStatus,
		title: formatCalendarSuggestionTitle(suggestion.suggested_name),
		summary: asString(suggestion.ai_reasoning) ?? (summaryParts.join(' - ') || null),
		risk_tier: 1,
		action_kinds: ['approve', 'reject'],
		decided_at:
			inboxStatus === 'pending' || inboxStatus === 'deciding'
				? null
				: terminalDecidedAt(suggestion),
		expires_at: reviewExpiresAt(asString(suggestion.created_at), inboxStatus),
		created_at: asString(suggestion.created_at) ?? undefined
	};
}

export async function syncInboxItemForAgentRun(params: {
	supabase: AnySupabase;
	run?: Record<string, unknown> | null;
	runId?: string;
}): Promise<InboxIndexRow | null> {
	let run = params.run ?? null;
	if (!run && params.runId) {
		const { data, error } = await (params.supabase as any)
			.from('agent_runs')
			.select('*')
			.eq('id', params.runId)
			.maybeSingle();
		if (error) throw error;
		run = data;
	}
	if (!run) {
		return params.runId
			? markInboxItemExpired(params.supabase, 'agent_run', params.runId)
			: null;
	}
	const row = mapAgentRunToInboxItem(run);
	return row ? upsertInboxItem(params.supabase, row) : null;
}

export async function syncInboxItemForProjectSuggestion(params: {
	supabase: AnySupabase;
	suggestion?: Record<string, unknown> | null;
	suggestionId?: string;
}): Promise<InboxIndexRow | null> {
	let suggestion = params.suggestion ?? null;
	if (!suggestion && params.suggestionId) {
		const { data, error } = await (params.supabase as any)
			.from('project_suggestions')
			.select('*')
			.eq('id', params.suggestionId)
			.maybeSingle();
		if (error) throw error;
		suggestion = data;
	}
	if (!suggestion) {
		return params.suggestionId
			? markInboxItemExpired(params.supabase, 'project_suggestion', params.suggestionId)
			: null;
	}
	const row = mapProjectSuggestionToInboxItem(suggestion);
	return row ? upsertInboxItem(params.supabase, row) : null;
}

export async function syncInboxItemForProjectAudit(params: {
	supabase: AnySupabase;
	audit?: Record<string, unknown> | null;
	auditId?: string;
}): Promise<InboxIndexRow | null> {
	let audit = params.audit ?? null;
	if (!audit && params.auditId) {
		const { data, error } = await (params.supabase as any)
			.from('project_audits')
			.select('*')
			.eq('id', params.auditId)
			.maybeSingle();
		if (error) throw error;
		audit = data;
	}
	if (!audit) {
		return params.auditId
			? markInboxItemExpired(params.supabase, 'project_audit', params.auditId)
			: null;
	}
	const row = mapProjectAuditToInboxItem(audit);
	if (row) return upsertInboxItem(params.supabase, row);
	const auditId = asString(audit.id) ?? params.auditId;
	return auditId && asString(audit.status) === 'ready'
		? markProjectAuditInboxNoActionRequired(params.supabase, auditId)
		: null;
}

export async function expireInboxItemsForProjectAuditChildSuggestions(params: {
	supabase: AnySupabase;
	auditId: string;
	reason?: string;
}): Promise<number> {
	const { data: links, error: linkError } = await (params.supabase as any)
		.from('project_audit_suggestions')
		.select('suggestion_id')
		.eq('audit_id', params.auditId);
	if (linkError) throw linkError;

	const suggestionIds = Array.from(
		new Set(
			((links ?? []) as Record<string, unknown>[])
				.map((link) => asString(link.suggestion_id))
				.filter((id): id is string => Boolean(id))
		)
	);
	if (suggestionIds.length === 0) return 0;

	const { data, error } = await (params.supabase as any)
		.from('inbox_items')
		.update({
			status: 'expired',
			source_status: 'grouped_into_project_audit',
			decided_at: new Date().toISOString(),
			blocked_reason: params.reason ?? 'Grouped into the complete project audit inbox packet'
		})
		.eq('source_type', 'project_suggestion')
		.in('source_ref_id', suggestionIds)
		.in('status', ['pending', 'deciding', 'snoozed', 'blocked'])
		.select('id');
	if (error) throw error;
	return (data ?? []).length;
}

export async function expireInboxItemsForProject(params: {
	supabase: AnySupabase;
	projectId: string;
	reason?: string;
}): Promise<number> {
	const { data, error } = await (params.supabase as any)
		.from('inbox_items')
		.update({
			status: 'expired',
			source_status: 'project_deleted',
			decided_at: new Date().toISOString(),
			blocked_reason: params.reason ?? PROJECT_DELETED_INBOX_REASON,
			snoozed_until: null
		})
		.eq('project_id', params.projectId)
		.in('status', ['pending', 'deciding', 'snoozed', 'blocked'])
		.select('id');
	if (error) throw error;
	return (data ?? []).length;
}

export async function syncInboxItemForCalendarSuggestion(params: {
	supabase: AnySupabase;
	suggestion?: Record<string, unknown> | null;
	suggestionId?: string;
}): Promise<InboxIndexRow | null> {
	let suggestion = params.suggestion ?? null;
	if (!suggestion && params.suggestionId) {
		const { data, error } = await (params.supabase as any)
			.from('calendar_project_suggestions')
			.select('*')
			.eq('id', params.suggestionId)
			.maybeSingle();
		if (error) throw error;
		suggestion = data;
	}
	if (!suggestion) {
		return params.suggestionId
			? markInboxItemExpired(params.supabase, 'calendar_suggestion', params.suggestionId)
			: null;
	}
	const row = mapCalendarSuggestionToInboxItem(suggestion);
	return row ? upsertInboxItem(params.supabase, row) : null;
}

export async function syncInboxItemForSource(params: {
	supabase: AnySupabase;
	sourceType: InboxSourceType;
	sourceRefId: string;
}): Promise<InboxIndexRow | null> {
	switch (params.sourceType) {
		case 'agent_run':
			return syncInboxItemForAgentRun({
				supabase: params.supabase,
				runId: params.sourceRefId
			});
		case 'project_suggestion':
			return syncInboxItemForProjectSuggestion({
				supabase: params.supabase,
				suggestionId: params.sourceRefId
			});
		case 'project_audit':
			return syncInboxItemForProjectAudit({
				supabase: params.supabase,
				auditId: params.sourceRefId
			});
		case 'calendar_suggestion':
			return syncInboxItemForCalendarSuggestion({
				supabase: params.supabase,
				suggestionId: params.sourceRefId
			});
		default:
			return null;
	}
}
