// apps/web/src/routes/api/inbox/activity/+server.ts
//
// GET /api/inbox/activity -> ActivityPayload
// The rows behind the inbox's "What happened / what's suggested" view (tasker 156): every
// suggestion still waiting (touched by a review in the last month), every one settled in the last week, and that week's review runs,
// across the projects the user can read (RLS on project_suggestions and project_loop_runs).
// The browser builds the view from these rows (inbox-activity.ts) so dates use its time zone.
import type { RequestHandler } from './$types';
import {
	INBOX_ACTIVITY_DAYS,
	INBOX_WAITING_DAYS,
	type ActivityPayload,
	type ActivityRunRow,
	type ActivitySuggestionRow
} from '$lib/components/inbox/inbox-activity';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { ApiResponse } from '$lib/utils/api-response';

const SUGGESTION_SELECT =
	'id, project_id, lineage_id, kind, status, title, rationale, why_now, evidence_refs, preview, operations, result, user_feedback, rollup, created_at, decided_at, applied_at, updated_at, project:onto_projects(name, deleted_at)';
const RUN_SELECT =
	'id, project_id, trigger_reason, status, suggestion_count, cost_usd, created_at, project:onto_projects(name, deleted_at)';

type Joined = Record<string, any>;

/** Operation args can hold whole document bodies; the view only needs each step's label. */
function slimOperations(value: unknown): Array<{ tool: string | null; label: string | null }> {
	if (!Array.isArray(value)) return [];
	return value.map((operation) => ({
		tool: typeof operation?.tool === 'string' ? operation.tool : null,
		label: typeof operation?.label === 'string' ? operation.label : null
	}));
}

/** The preview's before/after lists are not shown here; keep the summary and radar records. */
function slimPreview(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object') return null;
	const preview = value as Record<string, unknown>;
	return { summary: preview.summary ?? null, review_items: preview.review_items ?? null };
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');
	const since = new Date(Date.now() - INBOX_ACTIVITY_DAYS * 86_400_000).toISOString();
	const waitingSince = new Date(Date.now() - INBOX_WAITING_DAYS * 86_400_000).toISOString();
	if (!PROJECT_LOOPS_ENABLED) {
		return ApiResponse.success({ since, suggestions: [], runs: [] } satisfies ActivityPayload);
	}
	const supabase = locals.supabase as any;

	const [waiting, settled, runs] = await Promise.all([
		supabase
			.from('project_suggestions')
			.select(SUGGESTION_SELECT)
			.eq('status', 'pending')
			// A suggestion no review has touched in a month is no longer live in the inbox.
			.gte('updated_at', waitingSince)
			.order('updated_at', { ascending: false })
			.limit(150),
		supabase
			.from('project_suggestions')
			.select(SUGGESTION_SELECT)
			.neq('status', 'pending')
			.gte('updated_at', since)
			.order('updated_at', { ascending: false })
			.limit(150),
		supabase
			.from('project_loop_runs')
			.select(RUN_SELECT)
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(200)
	]);
	if (waiting.error || settled.error) {
		return ApiResponse.internalError(
			waiting.error ?? settled.error,
			'Could not load inbox activity'
		);
	}

	const live = (row: Joined) => !row.project?.deleted_at;
	const suggestions: ActivitySuggestionRow[] = [
		...((waiting.data ?? []) as Joined[]),
		...((settled.data ?? []) as Joined[])
	]
		.filter(live)
		.map((row) => ({
			id: row.id,
			project_id: row.project_id,
			project_name: row.project?.name ?? null,
			lineage_id: row.lineage_id ?? null,
			kind: row.kind,
			status: row.status,
			title: row.title,
			rationale: row.rationale ?? null,
			why_now: row.why_now ?? null,
			evidence_refs: row.evidence_refs ?? [],
			preview: slimPreview(row.preview),
			operations: slimOperations(row.operations),
			result: row.result ?? null,
			user_feedback: row.user_feedback ?? null,
			rollup: row.rollup ?? null,
			created_at: row.created_at,
			decided_at: row.decided_at ?? null,
			applied_at: row.applied_at ?? null,
			updated_at: row.updated_at
		}));
	// The run list is a nice-to-have line; the view works without it.
	const runRows: ActivityRunRow[] = (runs.error ? [] : ((runs.data ?? []) as Joined[]))
		.filter(live)
		.map((row) => ({
			id: row.id,
			project_id: row.project_id,
			project_name: row.project?.name ?? null,
			trigger_reason: row.trigger_reason ?? null,
			status: row.status ?? null,
			suggestion_count: row.suggestion_count ?? null,
			cost_usd: row.cost_usd ?? null,
			created_at: row.created_at
		}));

	return ApiResponse.success({ since, suggestions, runs: runRows } satisfies ActivityPayload);
};
