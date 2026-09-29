// apps/web/src/lib/server/inbox-chat-session.service.ts
import {
	buildProjectSuggestionProposalContext,
	type ProposalContextLoopRun
} from '@buildos/shared-agent-ops/proposal-context';
import { loadProjectCleanupView } from '@buildos/shared-agent-ops/project-cleanup';
import { createAgentRunChatSession } from './agent-run-chat-session.service';
import { createOrReuseProjectAuditChatSession } from './project-audit-chat-session.service';
import { ensureProjectSuggestionReviewIntegrity } from './project-suggestion-integrity.service';
import type { InboxIndexRow, InboxSourceType } from '@buildos/shared-agent-ops/inbox-index';
import type {
	Json,
	ProjectCleanupItem,
	ProjectCleanupSection,
	ProjectCleanupSource,
	ProjectCleanupView
} from '@buildos/shared-types';
import {
	appendSeedSection as appendSection,
	compactSeedText,
	isRecord,
	normalizeRecordArray as normalizeArray,
	readFiniteNumber as readNumber,
	readTrimmedString as readString
} from './chat-session-seed-formatters';

type AnySupabase = any;

type SupportedInboxSourceType = Extract<
	InboxSourceType,
	| 'agent_run'
	| 'project_suggestion'
	| 'project_review'
	| 'project_audit'
	| 'project_cleanup'
	| 'calendar_suggestion'
>;

/** Sources whose payload is one row of one table (the cleanup card is a computed view). */
type TableBackedInboxSourceType = Exclude<SupportedInboxSourceType, 'project_cleanup'>;

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

const SOURCE_TABLE_BY_TYPE: Record<TableBackedInboxSourceType, string> = {
	agent_run: 'agent_runs',
	project_suggestion: 'project_suggestions',
	project_review: 'project_loop_runs',
	project_audit: 'project_audits',
	calendar_suggestion: 'calendar_project_suggestions'
};

const SOURCE_LABEL_BY_TYPE: Record<SupportedInboxSourceType, string> = {
	agent_run: 'Agent proposal',
	project_suggestion: 'Project review item',
	project_review: 'Project manager brief',
	project_audit: 'Project audit',
	project_cleanup: 'Project cleanup',
	calendar_suggestion: 'Calendar project suggestion'
};

function isSupportedInboxChatSource(sourceType: string): sourceType is SupportedInboxSourceType {
	return sourceType === 'project_cleanup' || sourceType in SOURCE_TABLE_BY_TYPE;
}

const CLEANUP_SECTION_ORDER: ProjectCleanupSection[] = ['safe_cleanup', 'needs_call', 'note'];

const CLEANUP_SECTION_LABEL: Record<ProjectCleanupSection, string> = {
	safe_cleanup: 'Ready to apply',
	needs_call: 'Needs your call',
	note: 'Worth knowing'
};

const CLEANUP_SOURCE_LABEL: Record<ProjectCleanupSource, string> = {
	review: 'Project Review',
	audit: 'Complete Project Audit',
	radar: 'Freshness check'
};

/** Visible cap per section; the model gets every item. */
const CLEANUP_VISIBLE_ITEMS_PER_SECTION = 8;

function compactText(value: unknown, maxLength: number): string | null {
	return compactSeedText(value, maxLength, { trimTruncatedEnd: false });
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

function buildProjectReviewContext(
	item: InboxIndexRow,
	run: Record<string, unknown>,
	projectName: string | null
): SourceContext {
	const brief = isRecord(run.brief) ? run.brief : null;
	const decision = brief && isRecord(brief.decision) ? brief.decision : null;
	const issues = brief ? normalizeArray(brief.issues).slice(0, 8) : [];
	const evidence = new Map<string, string>();
	const collectEvidence = (value: unknown) => {
		for (const ref of normalizeArray(value)) {
			const type = readString(ref.entity_type) ?? 'source';
			const id = readString(ref.entity_id);
			const title = readString(ref.title);
			if (!title) continue;
			evidence.set(`${type}:${id ?? title}`, `${type}: ${title}${id ? ` (${id})` : ''}`);
		}
	};
	collectEvidence(decision?.evidence_refs);
	for (const issue of issues) collectEvidence(issue.evidence_refs);

	const bottomLine =
		compactVisibleText(brief?.bottom_line, 420) ?? compactVisibleText(item.title, 420);
	const recommendation =
		compactVisibleText(decision?.recommendation, 700) ??
		compactVisibleText(brief?.recommendation, 700) ??
		compactVisibleText(item.summary, 700);
	const question = compactVisibleText(decision?.question, 420);
	const whyUser = compactVisibleText(decision?.why_user_needed, 520);
	const visibleLines = [
		`${projectName ?? 'Project'} — project manager brief`,
		'',
		bottomLine ? `Bottom line: ${bottomLine}` : null,
		recommendation ? `Recommendation: ${recommendation}` : null,
		question ? `Your decision: ${question}` : null,
		whyUser ? `Why I need your input: ${whyUser}` : null
	].filter((line): line is string => Boolean(line));
	appendSection(visibleLines, 'Work involved', [...evidence.values()].slice(0, 8));
	appendSection(
		visibleLines,
		'Other things I noticed',
		issues.slice(1).map((issue) => {
			const category = readString(issue.category)?.replaceAll('_', ' ') ?? 'project note';
			return `${category}: ${readString(issue.headline) ?? readString(issue.summary) ?? 'Review item'}`;
		})
	);
	visibleLines.push(
		'',
		'You can ask me to explain the recommendation, inspect the linked work, compare options, or carry out an approved project change.'
	);

	const llmLines = [
		'You are discussing a BuildOS project manager brief with the user.',
		'Lead with the bottom line and the manager recommendation. Do not expose internal detector keys.',
		'Use project tools to inspect current entities when the user asks for more detail; do not invent evidence.',
		'Only apply a project change when the user clearly authorizes it.',
		'',
		`Project: ${projectName ?? readString(run.project_id) ?? 'Project'}`,
		bottomLine ? `Bottom line: ${bottomLine}` : null,
		recommendation ? `Recommendation: ${recommendation}` : null,
		question ? `Decision question: ${question}` : null,
		whyUser ? `Why user judgment is needed: ${whyUser}` : null,
		`Candidate ids: ${Array.isArray(brief?.candidate_ids) ? brief.candidate_ids.join(', ') : '(none)'}`
	].filter((line): line is string => Boolean(line));
	appendSection(llmLines, 'Evidence entities', [...evidence.values()]);
	appendSection(
		llmLines,
		'Secondary issues',
		issues.map((issue) =>
			[
				readString(issue.category),
				readString(issue.severity),
				readString(issue.headline),
				readString(issue.summary),
				readString(issue.recommendation)
			]
				.filter(Boolean)
				.join(' — ')
		)
	);

	return {
		humanText: visibleLines.join('\n'),
		llmText: llmLines.join('\n'),
		displayTitle: bottomLine ?? 'Project decision',
		evidenceSummaries: [...evidence.values()]
	};
}

function cleanupSeenText(item: ProjectCleanupItem): string | null {
	if (item.seen_count <= 1) return null;
	const since = readString(item.first_seen_at)?.slice(0, 10);
	return since
		? `seen in ${item.seen_count} reviews since ${since}`
		: `seen in ${item.seen_count} reviews`;
}

function cleanupEvidenceLines(item: ProjectCleanupItem): string[] {
	return (item.evidence_refs ?? []).flatMap((ref) => {
		const title = readString(ref?.title);
		if (!title) return [];
		const id = readString(ref.entity_id);
		return [`${ref.entity_type ?? 'source'}: ${title}${id ? ` (${id})` : ''}`];
	});
}

/** One item, fully, for the model: ids, section, source, what it would change, and why. */
function describeCleanupItemForModel(item: ProjectCleanupItem): string {
	const parts = [
		`[${CLEANUP_SECTION_LABEL[item.section] ?? item.section}] ${item.title}`,
		`item id ${item.id}`,
		`from ${CLEANUP_SOURCE_LABEL[item.source] ?? item.source}`,
		`kind ${item.kind}`,
		item.executable ? 'verified change the user can apply from the card' : 'finding, no change',
		cleanupSeenText(item),
		`suggestion ids ${item.rows.map((row) => row.suggestion_id).join(', ') || '(none)'}`
	].filter(Boolean);
	const lines = [parts.join(' — ')];
	const summary = compactText(item.summary, 500);
	if (summary) lines.push(`  Summary: ${summary}`);
	const whyNow = compactText(item.why_now, 300);
	if (whyNow) lines.push(`  Why now: ${whyNow}`);
	const changes = item.rows
		.map((row) => readString(row.verified_headline) ?? readString(row.title))
		.filter((value): value is string => Boolean(value));
	if (item.executable && changes.length) lines.push(`  Changes: ${changes.join('; ')}`);
	const cautions = [...new Set(item.rows.flatMap((row) => row.cautions ?? []))];
	if (cautions.length) lines.push(`  Cautions: ${cautions.join('; ')}`);
	const evidence = cleanupEvidenceLines(item);
	if (evidence.length) lines.push(`  Evidence: ${evidence.join('; ')}`);
	for (const reviewItem of item.review_items ?? []) {
		lines.push(
			`  Out of date: ${reviewItem.entity_type} ${reviewItem.title} (${reviewItem.entity_id}) — ${reviewItem.reason} Suggested request: ${reviewItem.fix_in_chat_prompt}`
		);
	}
	return lines.join('\n');
}

function buildProjectCleanupContext(params: {
	item: InboxIndexRow;
	view: ProjectCleanupView;
	projectName: string | null;
	focus: ProjectCleanupItem | null;
}): SourceContext {
	const { item, view, projectName, focus } = params;
	const items = Array.isArray(view.items) ? view.items : [];
	const bottomLine =
		compactVisibleText(view.bottom_line, 420) ?? compactVisibleText(item.title, 420);
	const recommendation = compactVisibleText(view.recommendation, 700);
	const sections = CLEANUP_SECTION_ORDER.map((section) => ({
		section,
		items: items.filter((entry) => entry.section === section)
	})).filter((entry) => entry.items.length > 0);

	const visibleLines: string[] = [`${projectName ?? 'Project'} — project cleanup`, ''];
	if (focus) {
		visibleLines.push(`Let's look at: ${focus.title}`);
		visibleLines.push(
			[
				CLEANUP_SECTION_LABEL[focus.section],
				`from ${CLEANUP_SOURCE_LABEL[focus.source] ?? 'Project Review'}`,
				cleanupSeenText(focus)
			]
				.filter(Boolean)
				.join(' · ')
		);
		const summary = compactVisibleText(focus.summary, 500);
		if (summary) visibleLines.push(summary);
		const whyNow = compactVisibleText(focus.why_now, 300);
		if (whyNow) visibleLines.push(`Why now: ${whyNow}`);
		appendSection(
			visibleLines,
			'Out of date',
			(focus.review_items ?? []).map((entry) => `${entry.title}: ${entry.reason}`)
		);
		visibleLines.push('');
	}
	if (bottomLine) visibleLines.push(`Bottom line: ${bottomLine}`);
	if (recommendation) visibleLines.push(`Recommendation: ${recommendation}`);
	for (const { section, items: sectionItems } of sections) {
		const shown = sectionItems
			.slice(0, CLEANUP_VISIBLE_ITEMS_PER_SECTION)
			.map((entry, index) => `${index + 1}. ${entry.title}`);
		if (sectionItems.length > shown.length) {
			shown.push(`...and ${sectionItems.length - shown.length} more.`);
		}
		appendSection(
			visibleLines,
			`${CLEANUP_SECTION_LABEL[section]} (${sectionItems.length})`,
			shown
		);
	}
	visibleLines.push(
		'',
		'You can ask me to explain any item, check the records involved, or make a change you approve. Applying or dismissing items stays on the cleanup card.'
	);

	const llmLines = [
		"You are discussing a BuildOS project cleanup list with the user: the project's open review findings, audit recommendations and freshness concerns, grouped into Ready to apply, Needs your call and Worth knowing.",
		focus
			? `The user opened this chat from one item (item id ${focus.id}). Lead with it; bring in other items only when they bear on it.`
			: 'Lead with the bottom line and the recommendation.',
		'Use project tools to inspect the records involved before making claims; do not invent evidence.',
		'Items are applied, dismissed or marked done from the cleanup card. Only change the project directly when the user clearly asks you to.',
		'',
		`Project: ${projectName ?? view.project_id ?? 'Project'}`,
		bottomLine ? `Bottom line: ${bottomLine}` : null,
		recommendation ? `Recommendation: ${recommendation}` : null,
		`Open: ${view.counts?.safe_cleanup ?? 0} ready to apply, ${view.counts?.needs_call ?? 0} need a call, ${view.counts?.note ?? 0} worth knowing`
	].filter((line): line is string => line !== null);
	appendSection(llmLines, 'Focused item', focus ? describeCleanupItemForModel(focus) : null);
	appendSection(
		llmLines,
		'Open items',
		items.filter((entry) => entry.id !== focus?.id).map(describeCleanupItemForModel)
	);
	appendSection(
		llmLines,
		'Closed since the last review',
		(view.recently_closed ?? []).map(
			(closed) =>
				`${closed.title} — ${closed.reason}${closed.detail ? `: ${closed.detail}` : ''}`
		)
	);

	const evidenceSource = focus ? [focus] : items;
	return {
		humanText: visibleLines.join('\n'),
		llmText: llmLines.join('\n'),
		displayTitle: focus?.title ?? bottomLine ?? 'Project cleanup',
		operationSummaries: (focus?.rows ?? [])
			.map((row) => readString(row.verified_headline) ?? readString(row.title))
			.filter((value): value is string => Boolean(value)),
		evidenceSummaries: [...new Set(evidenceSource.flatMap(cleanupEvidenceLines))].slice(0, 20)
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
	if (item.source_type === 'project_cleanup') {
		// Keyed by the project; the chat seed reads the same change set the card shows.
		const view = await loadProjectCleanupView(supabase, item.source_ref_id);
		return view as unknown as Record<string, unknown>;
	}
	const table = SOURCE_TABLE_BY_TYPE[item.source_type as TableBackedInboxSourceType];
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
	const integrity = await ensureProjectSuggestionReviewIntegrity({
		supabase: params.supabase,
		suggestion: params.suggestion
	});
	if (!integrity.ok) {
		throw new Error(
			`Project review item failed integrity verification (${integrity.diagnostic.code})`
		);
	}
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
		loopRun,
		verifiedChangeSummary: integrity.summary
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
	cleanupItemId?: string | null;
}): Record<string, unknown> {
	return {
		source: 'ai_inbox',
		inbox_item_id: params.item.id ?? null,
		source_type: params.item.source_type,
		source_ref_id: params.item.source_ref_id,
		// One chat per cleanup item discussed, plus one for the whole card (null).
		...(params.item.source_type === 'project_cleanup'
			? { cleanup_item_id: params.cleanupItemId ?? null }
			: {}),
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
	cleanupItemId?: string | null;
}): Promise<Record<string, unknown> | null> {
	if (params.item.source_type === 'project_cleanup') {
		// The card lives on across nights, so reuse is keyed by project and focused item,
		// never just the inbox row (a whole-card chat must not reopen an item's chat).
		const { data, error } = await params.supabase
			.from('chat_sessions')
			.select('*')
			.eq('user_id', params.userId)
			.eq('status', 'active')
			.contains('agent_metadata', {
				source: 'ai_inbox',
				source_type: 'project_cleanup',
				source_ref_id: params.item.source_ref_id,
				cleanup_item_id: params.cleanupItemId ?? null
			})
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		return !error && data ? (data as Record<string, unknown>) : null;
	}

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
	/** Project cleanup only: the card item the user chose to discuss (null = whole card). */
	focusCleanupItemId?: string | null;
}): Promise<InboxChatSessionResult> {
	if (!isSupportedInboxChatSource(params.item.source_type)) {
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

	const cleanupView =
		params.item.source_type === 'project_cleanup'
			? (sourcePayload as unknown as ProjectCleanupView)
			: null;
	// A focus on an item that closed since the card loaded falls back to the whole card.
	const cleanupFocus =
		cleanupView && params.focusCleanupItemId
			? ((cleanupView.items ?? []).find((entry) => entry.id === params.focusCleanupItemId) ??
				null)
			: null;
	const context = cleanupView
		? buildProjectCleanupContext({
				item: params.item,
				view: cleanupView,
				projectName,
				focus: cleanupFocus
			})
		: params.item.source_type === 'project_review'
			? buildProjectReviewContext(params.item, sourcePayload, projectName)
			: params.item.source_type === 'project_suggestion'
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
		context,
		cleanupItemId: cleanupFocus?.id ?? null
	});

	const existingSession = await findExistingChatSession({
		supabase: params.supabase,
		item: params.item,
		sourcePayload,
		userId: params.userId,
		cleanupItemId: cleanupFocus?.id ?? null
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
	if (params.item.source_type === 'project_review') {
		const { error: updateError } = await params.supabase
			.from('project_loop_runs')
			.update({ chat_session_id: sessionId, updated_at: now })
			.eq('id', params.item.source_ref_id)
			.eq('project_id', scope.projectId);
		if (updateError) {
			console.warn('Failed to persist project manager brief chat session link', {
				runId: params.item.source_ref_id,
				inboxItemId: params.item.id ?? null,
				sessionId,
				error: updateError
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
