// packages/shared-agent-ops/src/project-cleanup.ts
//
// Tasker 112: one living "Project cleanup" change set per project. It is not a table: it is
// the project's open review items (light review findings, Complete Project Audit
// recommendations, and the freshness radar's bundle), grouped by lineage and arranged by the
// latest review pass's roll-up synthesis (project_loop_runs.brief.cleanup). The AI Inbox shows
// it as one item per project; project chat reads the same view.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	LoopOperation,
	ProjectCleanupGroup,
	ProjectCleanupItem,
	ProjectCleanupItemRow,
	ProjectCleanupSection,
	ProjectCleanupSource,
	ProjectCleanupSynthesis,
	ProjectCleanupView,
	ProjectSuggestionEvidenceRef,
	ProjectSuggestionKind,
	ProjectSuggestionPreview,
	ProjectSuggestionReviewItem,
	ProjectSuggestionRollup
} from '@buildos/shared-types';
import {
	verifyProjectSuggestionIntegrity,
	type ProjectSuggestionIntegrityDiagnostic
} from './proposal-context/verify-operations';

type AnySupabase = SupabaseClient<any, any, any>;

/** Light review findings: the lineages a review pass carries forward. */
export const PROJECT_REVIEW_FINDING_KINDS = [
	'doc_org',
	'doc_outdated',
	'drift',
	'task_conflict'
] as const;

/** Everything that reaches the AI Inbox through the cleanup card instead of on its own. */
export const PROJECT_CLEANUP_KINDS: readonly ProjectSuggestionKind[] = [
	...PROJECT_REVIEW_FINDING_KINDS,
	'audit_recommendation',
	'freshness_update'
];

/** inbox_items.source_status for an item folded into the project's cleanup card. */
export const GROUPED_INTO_PROJECT_CLEANUP = 'grouped_into_project_cleanup';

/**
 * Tools whose change is reversible from the project itself and never needs a judgment
 * call beyond "yes, do it". Anything else (project edits, goal renames, text edits) sits
 * under "Needs your call" even when it is executable.
 */
const SAFE_CLEANUP_TOOLS = new Set([
	'move_document_in_tree',
	'archive_onto_document',
	'archive_onto_task'
]);

const SECTION_ORDER: ProjectCleanupSection[] = ['safe_cleanup', 'needs_call', 'note'];

const DEFAULT_GROUP_TITLES: Record<ProjectCleanupSection, string> = {
	safe_cleanup: 'Ready to apply',
	needs_call: 'Needs your call',
	note: 'Worth knowing'
};

export interface ProjectCleanupRowRecord {
	id: string;
	project_id: string;
	run_id: string | null;
	kind: ProjectSuggestionKind;
	status: string;
	risk_tier: number | null;
	title: string;
	rationale: string | null;
	why_now: string | null;
	evidence_refs: ProjectSuggestionEvidenceRef[];
	preview: ProjectSuggestionPreview | null;
	operations: LoopOperation[];
	reversible: boolean | null;
	lineage_id: string | null;
	rollup: ProjectSuggestionRollup | null;
	created_at: string;
	updated_at: string;
}

const ROW_SELECT =
	'id, project_id, run_id, kind, status, risk_tier, title, rationale, why_now, evidence_refs, preview, operations, reversible, lineage_id, rollup, created_at, updated_at';

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRow(value: unknown): ProjectCleanupRowRecord | null {
	const row = asRecord(value);
	const id = asString(row?.id);
	const projectId = asString(row?.project_id);
	const kind = asString(row?.kind) as ProjectSuggestionKind | null;
	if (!row || !id || !projectId || !kind) return null;
	return {
		id,
		project_id: projectId,
		run_id: asString(row.run_id),
		kind,
		status: asString(row.status) ?? 'pending',
		risk_tier: typeof row.risk_tier === 'number' ? row.risk_tier : null,
		title: asString(row.title) ?? 'Project review item',
		rationale: asString(row.rationale),
		why_now: asString(row.why_now),
		evidence_refs: Array.isArray(row.evidence_refs)
			? (row.evidence_refs as ProjectSuggestionEvidenceRef[])
			: [],
		preview: (asRecord(row.preview) as ProjectSuggestionPreview | null) ?? null,
		operations: Array.isArray(row.operations) ? (row.operations as LoopOperation[]) : [],
		reversible: typeof row.reversible === 'boolean' ? row.reversible : null,
		lineage_id: asString(row.lineage_id),
		rollup: (asRecord(row.rollup) as ProjectSuggestionRollup | null) ?? null,
		created_at: asString(row.created_at) ?? new Date(0).toISOString(),
		updated_at:
			asString(row.updated_at) ?? asString(row.created_at) ?? new Date(0).toISOString()
	};
}

export function cleanupSourceForKind(kind: string): ProjectCleanupSource {
	if (kind === 'audit_recommendation') return 'audit';
	if (kind === 'freshness_update') return 'radar';
	return 'review';
}

/** The lineage a row belongs to; a row from before the roll-up is its own lineage. */
export function cleanupLineageId(
	row: Pick<ProjectCleanupRowRecord, 'id' | 'lineage_id' | 'kind'>
): string {
	return row.kind === 'freshness_update' ? row.id : (row.lineage_id ?? row.id);
}

export interface CleanupItemFacts {
	source: ProjectCleanupSource;
	kind: string;
	executable: boolean;
	reversible: boolean | null;
	tools: string[];
	cautions: string[];
	hasReviewItems: boolean;
}

/** Where an item belongs when no synthesis has placed it. */
export function defaultCleanupSection(facts: CleanupItemFacts): ProjectCleanupSection {
	if (cleanupSectionAllowed('safe_cleanup', facts)) return 'safe_cleanup';
	if (facts.executable || facts.source !== 'review' || facts.hasReviewItems) return 'needs_call';
	return facts.kind === 'drift' ? 'note' : 'needs_call';
}

/** Code's floor under the model: only a verified, reversible, caution-free change is "safe". */
export function cleanupSectionAllowed(
	section: ProjectCleanupSection,
	facts: CleanupItemFacts
): boolean {
	if (section !== 'safe_cleanup') return true;
	return (
		facts.executable &&
		facts.reversible !== false &&
		facts.cautions.length === 0 &&
		!facts.hasReviewItems &&
		facts.tools.length > 0 &&
		facts.tools.every(
			(tool) =>
				SAFE_CLEANUP_TOOLS.has(tool) ||
				// The radar's scalar updates (status, dates) come from the user's own words.
				(facts.source === 'radar' && tool !== 'update_onto_document')
		)
	);
}

export function resolveCleanupSection(
	requested: ProjectCleanupSection | null | undefined,
	facts: CleanupItemFacts
): ProjectCleanupSection {
	if (requested && cleanupSectionAllowed(requested, facts)) {
		// A finding with nothing to apply is never "ready to apply", and a change is never a note.
		if (requested === 'note' && facts.executable) return 'needs_call';
		return requested;
	}
	return requested === 'safe_cleanup' && facts.executable
		? 'needs_call'
		: defaultCleanupSection(facts);
}

export type ProjectCleanupVerification =
	| {
			ok: true;
			headline: string;
			fingerprint: string;
			operations: Array<Record<string, unknown>>;
			cautions: string[];
	  }
	| { ok: false; diagnostic: ProjectSuggestionIntegrityDiagnostic };

/**
 * Pure: arrange open rows into the change set. `verification` is optional; without it
 * (the inbox index sync) an executable row is counted as executable unverified.
 */
export function buildProjectCleanupView(params: {
	projectId: string;
	rows: ProjectCleanupRowRecord[];
	synthesis?: ProjectCleanupSynthesis | null;
	synthesisAt?: string | null;
	latestRunId?: string | null;
	latestAudit?: ProjectCleanupView['latest_audit'];
	auditIdBySuggestionId?: ReadonlyMap<string, string>;
	verification?: ReadonlyMap<string, ProjectCleanupVerification>;
}): ProjectCleanupView {
	const verification = params.verification;
	const byLineage = new Map<string, ProjectCleanupRowRecord[]>();
	for (const row of params.rows) {
		if (row.status !== 'pending') continue;
		const check = verification?.get(row.id);
		// A change that no longer applies is not offered; the next review pass closes it.
		if (check && !check.ok) continue;
		const lineageId = cleanupLineageId(row);
		const rows = byLineage.get(lineageId) ?? [];
		rows.push(row);
		byLineage.set(lineageId, rows);
	}

	const requestedSection = new Map<string, ProjectCleanupSection>();
	for (const group of params.synthesis?.groups ?? []) {
		for (const id of group.item_ids) {
			if (!requestedSection.has(id)) requestedSection.set(id, group.section);
		}
	}

	const items: ProjectCleanupItem[] = [];
	for (const [lineageId, lineageRows] of byLineage) {
		const rows = [...lineageRows].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
		const lead = rows.at(-1)!;
		const source = cleanupSourceForKind(lead.kind);
		const itemRows: ProjectCleanupItemRow[] = rows.map((row) => {
			const check = verification?.get(row.id);
			const verified = check?.ok ? check : null;
			return {
				suggestion_id: row.id,
				kind: row.kind,
				title: row.title,
				operation_count: row.operations.length,
				verified_headline: verified?.headline ?? null,
				verified_fingerprint: verified?.fingerprint ?? null,
				...(verified ? { verified_operations: verified.operations } : {}),
				...(verified?.cautions.length ? { cautions: verified.cautions } : {}),
				updated_at: row.updated_at
			};
		});
		const reviewItems = rows.flatMap((row) =>
			Array.isArray(row.preview?.review_items)
				? (row.preview?.review_items as ProjectSuggestionReviewItem[])
				: []
		);
		const tools = [...new Set(rows.flatMap((row) => row.operations.map((op) => op.tool)))];
		const facts: CleanupItemFacts = {
			source,
			kind: lead.kind,
			executable: rows.some((row) => row.operations.length > 0),
			reversible: rows.some((row) => row.reversible === false) ? false : lead.reversible,
			tools,
			cautions: itemRows.flatMap((row) => row.cautions ?? []),
			hasReviewItems: reviewItems.length > 0
		};
		const rollup = rows
			.map((row) => row.rollup)
			.filter((value): value is ProjectSuggestionRollup => Boolean(value));
		const seenRuns = new Set(rollup.flatMap((value) => value.seen_run_ids ?? []));
		const firstSeen = [
			...rollup.map((value) => value.first_seen_at),
			...rows.map((row) => row.created_at)
		]
			.filter(Boolean)
			.sort()[0];
		const singleVerified = itemRows.length === 1 ? itemRows[0]?.verified_headline : null;
		// The latest synthesis's group wins; the section the roll-up stamped on the rows
		// covers items the synthesis did not group.
		const stampedSection = rollup.map((value) => value.section).find(Boolean) ?? null;
		items.push({
			id: lineageId,
			source,
			kind: lead.kind,
			section: resolveCleanupSection(
				requestedSection.get(lineageId) ?? stampedSection,
				facts
			),
			title: lead.kind === 'freshness_update' ? lead.title : (singleVerified ?? lead.title),
			summary:
				rollup.map((value) => value.summary).find((value) => Boolean(value)) ??
				lead.rationale ??
				null,
			why_now: lead.why_now,
			executable: facts.executable,
			rows: itemRows,
			evidence_refs: dedupeEvidence(rows.flatMap((row) => row.evidence_refs)).slice(0, 8),
			seen_count: Math.max(1, seenRuns.size),
			first_seen_at: firstSeen ?? lead.created_at,
			updated_at: lead.updated_at,
			...(reviewItems.length ? { review_items: reviewItems } : {}),
			...(source === 'audit'
				? { audit_id: params.auditIdBySuggestionId?.get(lead.id) ?? null }
				: {})
		});
	}

	const itemIds = new Set(items.map((item) => item.id));
	const placed = new Set<string>();
	const groups: ProjectCleanupGroup[] = [];
	for (const group of params.synthesis?.groups ?? []) {
		const members = group.item_ids.filter(
			(id) =>
				itemIds.has(id) &&
				!placed.has(id) &&
				items.find((item) => item.id === id)?.section === group.section
		);
		if (!members.length) continue;
		members.forEach((id) => placed.add(id));
		groups.push({ ...group, item_ids: members });
	}
	for (const section of SECTION_ORDER) {
		const rest = items
			.filter((item) => item.section === section && !placed.has(item.id))
			.sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at))
			.map((item) => item.id);
		if (rest.length) {
			groups.push({
				title: DEFAULT_GROUP_TITLES[section],
				section,
				item_ids: rest,
				recommendation: null
			});
		}
	}
	groups.sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));

	const counts = { total: items.length, safe_cleanup: 0, needs_call: 0, note: 0 };
	for (const item of items) counts[item.section] += 1;

	return {
		project_id: params.projectId,
		items,
		groups,
		bottom_line: params.synthesis?.bottom_line ?? null,
		recommendation: params.synthesis?.recommendation ?? null,
		synthesized_at: params.synthesisAt ?? params.synthesis?.generated_at ?? null,
		latest_run_id: params.latestRunId ?? null,
		latest_audit: params.latestAudit ?? null,
		counts,
		recently_closed: (params.synthesis?.closed_this_pass ?? []).map((closed) => ({
			...closed,
			at: params.synthesisAt ?? params.synthesis?.generated_at ?? null
		}))
	};
}

function dedupeEvidence(refs: ProjectSuggestionEvidenceRef[]): ProjectSuggestionEvidenceRef[] {
	const seen = new Set<string>();
	return refs.filter((ref) => {
		if (!ref || typeof ref !== 'object') return false;
		const key = `${ref.entity_type}:${ref.entity_id ?? ref.title}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export async function loadProjectCleanupRows(
	supabase: AnySupabase,
	projectId: string
): Promise<ProjectCleanupRowRecord[]> {
	const { data, error } = await (supabase as any)
		.from('project_suggestions')
		.select(ROW_SELECT)
		.eq('project_id', projectId)
		.eq('status', 'pending')
		.in('kind', PROJECT_CLEANUP_KINDS as unknown as string[])
		.order('created_at', { ascending: true })
		.limit(200);
	if (error) throw error;
	return ((data ?? []) as unknown[])
		.map(normalizeRow)
		.filter((row): row is ProjectCleanupRowRecord => Boolean(row));
}

/** The newest review pass that wrote a roll-up synthesis (brief v3). */
export async function loadLatestProjectCleanupSynthesis(
	supabase: AnySupabase,
	projectId: string
): Promise<{ runId: string; at: string | null; synthesis: ProjectCleanupSynthesis } | null> {
	// The newest completed pass that carries a roll-up. Light passes are daily at most, so
	// the few newest runs always include it once the roll-up has run.
	const { data: runs, error } = await (supabase as any)
		.from('project_loop_runs')
		.select('id, finished_at, created_at, brief')
		.eq('project_id', projectId)
		.eq('status', 'completed')
		.order('created_at', { ascending: false })
		.limit(5);
	if (error) throw error;
	const data = ((runs ?? []) as Array<Record<string, unknown>>).find((run) =>
		asRecord(asRecord(run.brief)?.cleanup)
	);
	const synthesis = asRecord(asRecord(data?.brief)?.cleanup) as ProjectCleanupSynthesis | null;
	const runId = asString(data?.id);
	if (!runId || !synthesis) return null;
	return {
		runId,
		at: asString(data?.finished_at) ?? asString(data?.created_at),
		synthesis: {
			...synthesis,
			groups: Array.isArray(synthesis.groups) ? synthesis.groups : [],
			closed_this_pass: Array.isArray(synthesis.closed_this_pass)
				? synthesis.closed_this_pass
				: []
		}
	};
}

async function loadAuditContext(
	supabase: AnySupabase,
	projectId: string,
	auditSuggestionIds: string[]
): Promise<{
	latest: ProjectCleanupView['latest_audit'];
	bySuggestionId: Map<string, string>;
}> {
	const bySuggestionId = new Map<string, string>();
	const [latestResult, linkResult] = await Promise.all([
		(supabase as any)
			.from('project_audits')
			.select('id, created_at, summary')
			.eq('project_id', projectId)
			.in('status', ['ready', 'reviewed'])
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle(),
		auditSuggestionIds.length
			? (supabase as any)
					.from('project_audit_suggestions')
					.select('audit_id, suggestion_id')
					.in('suggestion_id', auditSuggestionIds)
			: Promise.resolve({ data: [], error: null })
	]);
	if (latestResult.error) throw latestResult.error;
	if (linkResult.error) throw linkResult.error;
	for (const link of (linkResult.data ?? []) as Record<string, unknown>[]) {
		const suggestionId = asString(link.suggestion_id);
		const auditId = asString(link.audit_id);
		if (suggestionId && auditId) bySuggestionId.set(suggestionId, auditId);
	}
	const latestId = asString(latestResult.data?.id);
	return {
		latest: latestId
			? {
					id: latestId,
					created_at: asString(latestResult.data?.created_at),
					summary: asString(latestResult.data?.summary)
				}
			: null,
		bySuggestionId
	};
}

/**
 * The project's cleanup change set. `verify` re-resolves every executable row against the
 * live project (the card needs the verified wording and fingerprints); the inbox index sync
 * skips it and only counts.
 */
export async function loadProjectCleanupView(
	supabase: AnySupabase,
	projectId: string,
	options: { verify?: boolean } = {}
): Promise<ProjectCleanupView> {
	const [rows, latest] = await Promise.all([
		loadProjectCleanupRows(supabase, projectId),
		loadLatestProjectCleanupSynthesis(supabase, projectId)
	]);
	const audit = await loadAuditContext(
		supabase,
		projectId,
		rows.filter((row) => row.kind === 'audit_recommendation').map((row) => row.id)
	);
	let verification: Map<string, ProjectCleanupVerification> | undefined;
	if (options.verify) {
		verification = new Map();
		await Promise.all(
			rows
				.filter((row) => row.operations.length > 0)
				.map(async (row) => {
					const result = await verifyProjectSuggestionIntegrity(supabase, {
						projectId,
						operations: row.operations,
						title: row.title,
						preview: row.preview,
						checkModelAlignment: true
					});
					verification!.set(
						row.id,
						result.ok
							? {
									ok: true,
									headline: result.summary.headline,
									fingerprint: result.summary.structural_fingerprint,
									operations: result.summary.operations as unknown as Array<
										Record<string, unknown>
									>,
									cautions:
										(result.summary as { cautions?: string[] }).cautions ?? []
								}
							: { ok: false, diagnostic: result.diagnostic }
					);
				})
		);
	}
	return buildProjectCleanupView({
		projectId,
		rows,
		synthesis: latest?.synthesis ?? null,
		synthesisAt: latest?.at ?? null,
		latestRunId: latest?.runId ?? null,
		latestAudit: audit.latest,
		auditIdBySuggestionId: audit.bySuggestionId,
		verification
	});
}

/** Code-authored inbox copy for the card: the synthesis line when there is one. */
export function projectCleanupInboxCopy(view: ProjectCleanupView): {
	title: string;
	summary: string;
} {
	const { safe_cleanup: ready, needs_call: calls, note: notes } = view.counts;
	const parts = [
		ready ? `${ready} ready to apply` : null,
		calls ? `${calls} need${calls === 1 ? 's' : ''} your call` : null,
		notes ? `${notes} to know` : null
	].filter(Boolean);
	const countLine = parts.join(' · ');
	return {
		title: view.bottom_line ?? `Project cleanup: ${countLine || 'nothing open'}`,
		summary: view.recommendation ? `${view.recommendation} (${countLine})` : countLine
	};
}
