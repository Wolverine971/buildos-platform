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
	buildStartHerePromptExcerpt,
	pickProjectStartHereDocument
} from '@buildos/shared-agent-ops/ontology/start-here';

const RECEIPT_EXCERPT_MAX_CHARS = 1200;
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
		const [projectRes, tasksRes, goalsRes, docsRes, planCountRes, milestoneCountRes] =
			await Promise.all([
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
				// Instantiation inserts the Start Here context doc first, so ascending
				// order keeps it inside the window even on document-heavy projects.
				supabase
					.from('onto_documents')
					.select('id, title, content, type_key, props, created_at, updated_at', {
						count: 'exact'
					})
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.order('created_at', { ascending: true })
					.limit(25),
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
		const startHereCandidates = documents.filter(
			(doc) => doc.type_key === START_HERE_DOCUMENT_TYPE_KEY
		);
		const startHereDoc = pickProjectStartHereDocument(startHereCandidates);
		const excerpt = startHereDoc?.content
			? buildStartHerePromptExcerpt(startHereDoc.content, RECEIPT_EXCERPT_MAX_CHARS)
			: null;
		// The excerpt keeps managed-region HTML comment markers (prompt consumers
		// want them); the receipt renders plain text, so drop marker-only lines.
		const excerptForDisplay = excerpt
			? excerpt.content
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
						truncated: excerpt?.truncated ?? false
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
