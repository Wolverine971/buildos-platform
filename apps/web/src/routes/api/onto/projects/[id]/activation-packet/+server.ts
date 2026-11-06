// apps/web/src/routes/api/onto/projects/[id]/activation-packet/+server.ts
// Compact "what BuildOS understood / created / will remember" packet for the
// onboarding transformation receipt (tasker/26 WP-2). Deliberately small: the
// receipt needs orientation proof, not the full project payload — use
// /api/onto/projects/[id]/full for that.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import {
	START_HERE_DOCUMENT_TYPE_KEY,
	extractStartHereOrientation,
	pickProjectStartHereDocument
} from '@buildos/shared-agent-ops/ontology/start-here';

const RECEIPT_EXCERPT_MAX_CHARS = 1200;
const START_HERE_CANDIDATE_LIMIT = 5;
const SAMPLE_ENTITY_LIMIT = 3;

export const GET: RequestHandler = async ({ params, locals }) => {
	const projectId = params.id;
	const access = await requireProjectMemberAccess({
		locals,
		projectId,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	const supabase = locals.supabase;

	try {
		const [
			projectRes,
			tasksRes,
			goalsRes,
			docsRes,
			startHereRes,
			planCountRes,
			milestoneCountRes
		] = await Promise.all([
			supabase
				.from('onto_projects')
				.select('id, name, description, next_step_short, created_at')
				.eq('id', projectId)
				.is('deleted_at', null)
				.maybeSingle(),
			supabase
				.from('onto_tasks')
				.select('id, title', { count: 'exact' })
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.order('created_at', { ascending: true })
				.limit(SAMPLE_ENTITY_LIMIT),
			supabase
				.from('onto_goals')
				.select('id, name', { count: 'exact' })
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.order('created_at', { ascending: true })
				.limit(SAMPLE_ENTITY_LIMIT),
			// Counts and sample names only: no bodies.
			supabase
				.from('onto_documents')
				.select('id, title, type_key, props, created_at, updated_at', {
					count: 'exact'
				})
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.order('created_at', { ascending: true })
				.limit(25),
			// Start Here on its own, so it is found even outside the first 25 docs.
			supabase
				.from('onto_documents')
				.select('id, title, content, props, created_at, updated_at')
				.eq('project_id', projectId)
				.eq('type_key', START_HERE_DOCUMENT_TYPE_KEY)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(START_HERE_CANDIDATE_LIMIT),
			supabase
				.from('onto_plans')
				.select('id', { count: 'exact', head: true })
				.eq('project_id', projectId)
				.is('deleted_at', null),
			supabase
				.from('onto_milestones')
				.select('id', { count: 'exact', head: true })
				.eq('project_id', projectId)
				.is('deleted_at', null)
		]);

		if (projectRes.error) return ApiResponse.databaseError(projectRes.error);
		if (!projectRes.data) return ApiResponse.notFound('Project');

		const documents = docsRes.data ?? [];
		if (startHereRes.error) {
			console.warn('[activation-packet] Start Here read failed:', startHereRes.error);
		}
		const startHereDoc = pickProjectStartHereDocument(startHereRes.data ?? []);
		// The receipt shows what the project is (the orientation paragraph), not a
		// prefix of the whole document. An unfilled template has none.
		const orientation = startHereDoc?.content
			? extractStartHereOrientation(startHereDoc.content, Number.POSITIVE_INFINITY)
			: null;
		const receiptExcerpt = orientation ? fitReceiptExcerpt(orientation) : null;
		// The receipt renders plain text, so drop any comment-marker-only lines.
		const excerptForDisplay = receiptExcerpt
			? receiptExcerpt.text
					.split('\n')
					.filter((line) => !/^\s*<!--.*-->\s*$/.test(line))
					.join('\n')
					.replace(/\n{3,}/g, '\n\n')
					.trim()
			: null;

		const sampleEntities = [
			...(tasksRes.data ?? []).map((task) => ({
				kind: 'task' as const,
				id: task.id,
				name: task.title
			})),
			...(goalsRes.data ?? []).map((goal) => ({
				kind: 'goal' as const,
				id: goal.id,
				name: goal.name
			})),
			...documents
				.filter((doc) => doc.type_key !== START_HERE_DOCUMENT_TYPE_KEY)
				.slice(0, SAMPLE_ENTITY_LIMIT)
				.map((doc) => ({ kind: 'document' as const, id: doc.id, name: doc.title }))
		];

		return ApiResponse.success({
			project: {
				id: projectRes.data.id,
				name: projectRes.data.name,
				description: projectRes.data.description ?? null,
				next_step_short: projectRes.data.next_step_short ?? null
			},
			start_here: startHereDoc
				? {
						id: startHereDoc.id,
						title: startHereDoc.title,
						excerpt: excerptForDisplay || null,
						truncated: receiptExcerpt?.truncated ?? false
					}
				: null,
			counts: {
				tasks: tasksRes.count ?? 0,
				goals: goalsRes.count ?? 0,
				documents: docsRes.count ?? documents.length,
				plans: planCountRes.count ?? 0,
				milestones: milestoneCountRes.count ?? 0
			},
			sample_entities: sampleEntities
		});
	} catch (error) {
		console.error('[activation-packet] Failed to load packet:', error);
		return ApiResponse.internalError(error, 'Failed to load project summary');
	}
};

/** Bound a very long orientation paragraph at a word boundary, never mid-word. */
function fitReceiptExcerpt(text: string): { text: string; truncated: boolean } {
	if (text.length <= RECEIPT_EXCERPT_MAX_CHARS) return { text, truncated: false };
	const slice = text.slice(0, RECEIPT_EXCERPT_MAX_CHARS - 1);
	const lastBreak = slice.search(/\s\S*$/);
	const cut = (lastBreak > 0 ? slice.slice(0, lastBreak) : slice).trimEnd();
	return { text: `${cut}…`, truncated: true };
}
