// apps/web/src/routes/projects/+page.server.ts
/**
 * Ontology Dashboard - Server Load
 * Fetches all projects for the dashboard view
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024 - Skeleton Loading):
 * - projectCount returned IMMEDIATELY for instant skeleton rendering
 * - Full project data streamed in background
 * - Zero layout shift - exact number of skeleton cards rendered from start
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
	ensureActorId,
	ensureWorkspaceProjectId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import { addProjectCollaborationFlags } from '$lib/components/projects/project-list';
import { loadVisibleParentIds } from '$lib/services/ontology/project-hierarchy.service';
import { loadProjectSignals } from '$lib/server/projects/desktop-signals';
import { loadProjectEmojis } from '$lib/server/projects/project-emoji';
import { getUserDashboardAnalytics } from '$lib/services/dashboard/user-dashboard-analytics.service';
import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';
import { loadWorkspaceHome } from '$lib/server/workspace/workspace.service';

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Authentication required');
	}

	depends('ontology:projects');
	depends('dashboard:analytics');
	depends('workspace:home');

	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();

	// The Workspace is resolved (created on first visit) alongside the actor, so the
	// project list below already includes it: loose items drag and drop from the first paint.
	const [actorId, workspaceId] = await Promise.all([
		measure('db.ensure_actor', () => ensureActorId(locals.supabase, user.id)),
		measure('db.ensure_workspace', () =>
			ensureWorkspaceProjectId(locals.supabase as never).catch((err) => {
				console.error('[Projects] Could not open the Workspace:', err);
				return null;
			})
		)
	]);

	// FAST: Get project count immediately (~20-50ms)
	// Prefer membership count so shared projects are included. The Workspace is the
	// viewer's own loose items, not a tile, so it isn't counted.
	const { count: memberCount, error: memberCountError } = await measure(
		'db.project_members.count',
		() =>
			locals.supabase
				.from('onto_project_members')
				.select('id, onto_projects!inner(kind)', { count: 'estimated', head: true })
				.eq('actor_id', actorId)
				.is('removed_at', null)
				.eq('onto_projects.kind', 'project')
	);

	let projectCount = memberCount ?? 0;
	if (memberCountError) {
		console.error('[Projects] Failed to get membership count:', memberCountError);
		const { count: fallbackCount, error: countError } = await measure(
			'db.projects.count_fallback',
			() =>
				locals.supabase
					.from('onto_projects')
					.select('*', { count: 'estimated', head: true })
					.eq('created_by', actorId)
					.eq('kind', 'project')
					.is('deleted_at', null)
		);
		if (countError) {
			console.error('[Projects] Failed to get project count:', countError);
		}
		projectCount = fallbackCount ?? 0;
	}

	// STREAMED: Full project data loaded in background
	// Skeletons will be hydrated when this resolves
	const projects = fetchProjectSummaries(locals.supabase, actorId, locals.serverTiming)
		.then(async (loaded) => {
			if (loaded.length === 0) {
				return addProjectCollaborationFlags(
					loaded.map((project) => ({
						...project,
						parent_project_id: null as string | null
					})),
					[]
				);
			}
			const projectIds = loaded.map((project) => project.id);

			const [{ data: memberRows, error: memberRowsError }, parentIds, signals, emojis] =
				await Promise.all([
					measure('db.project_members.collaboration_flags', () =>
						locals.supabase
							.from('onto_project_members')
							.select('project_id, actor_id')
							.in('project_id', projectIds)
							.is('removed_at', null)
					),
					// Nesting: a parent is named only when it's also in this viewer's list.
					measure('db.project_parents', () =>
						loadVisibleParentIds(locals.supabase, projectIds)
					),
					// Desktop tiles: last real change and the open-task mix per project.
					measure('db.project_desktop_signals', () =>
						loadProjectSignals(locals.supabase, projectIds).catch((err) => {
							console.error('[Projects] Failed to load desktop signals:', err);
							return null;
						})
					),
					// Tile emojis (picked automatically or by the owner); without one, initials.
					measure('db.project_emojis', () =>
						loadProjectEmojis(locals.supabase, projectIds).catch((err) => {
							console.error('[Projects] Failed to load project emojis:', err);
							return null;
						})
					)
				]);
			const summaries = loaded.map((project) => ({
				...project,
				parent_project_id: parentIds.get(project.id) ?? null,
				signals: signals?.get(project.id) ?? null,
				emoji: emojis?.get(project.id) ?? null
			}));

			if (memberRowsError) {
				console.error('[Projects] Failed to load collaborator metadata:', memberRowsError);
				return addProjectCollaborationFlags(summaries, null);
			}

			return addProjectCollaborationFlags(summaries, memberRows ?? []);
		})
		.catch((err) => {
			console.error('[Ontology Dashboard] Failed to load project summaries', err);
			throw err;
		});

	// STREAMED: the Today row's overdue count and the recent activity / chats panels
	// under the desktop (what the old dashboard showed). One RPC, never blocks the tiles.
	const dashboard = Promise.resolve(
		measure('dashboard.analytics', () =>
			getUserDashboardAnalytics(locals.supabase, user.id, locals.serverTiming, actorId, {
				projectParents: false
			})
		)
	).catch((err) => {
		console.error('[Projects] Failed to load dashboard analytics:', err);
		return createEmptyUserDashboardAnalytics();
	});

	// STREAMED: the Workspace's loose items and the agent's suggestions (created on first
	// visit). Never blocks the tiles; the shelf shows a light skeleton until it lands.
	const workspace = Promise.resolve(
		workspaceId
			? measure('workspace.home', () => loadWorkspaceHome(locals.supabase, workspaceId))
			: null
	).catch((err) => {
		console.error('[Projects] Failed to load the Workspace:', err);
		return null;
	});

	return {
		actorId,
		projects,
		projectCount,
		workspaceId,
		workspace,
		dashboard,
		userTimezone: user.timezone ?? null
	};
};
