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
	ensureWorkspaceProjectId
} from '$lib/services/ontology/ontology-projects.service';
import { loadProjectListSummaries } from '$lib/server/projects/project-list-summaries';
import { getUserDashboardAnalytics } from '$lib/services/dashboard/user-dashboard-analytics.service';
import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';
import { loadWorkspaceHome } from '$lib/server/workspace/workspace.service';
import { resolveOpenTarget, type OpenTarget } from '$lib/server/workspace/find.service';
import { parseOpenParam } from '$lib/components/workspace/find-model';

export const load: PageServerLoad = async ({ locals, depends, url }) => {
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
	const projects = loadProjectListSummaries(locals.supabase, actorId, locals.serverTiming).catch(
		(err) => {
			console.error('[Ontology Dashboard] Failed to load project summaries', err);
			throw err;
		}
	);

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

	// STREAMED: `?open=kind:id` (search results, ⌘K, chat links): the item's project, read with
	// the person's session. The page opens its card and reader once the tiles land.
	const openRef = parseOpenParam(url.searchParams.get('open'));
	const openTarget: Promise<OpenTarget | null> | null = openRef
		? resolveOpenTarget(locals.supabase as never, openRef).catch((err) => {
				console.error('[Projects] Could not resolve the open link:', err);
				return null;
			})
		: null;

	return {
		actorId,
		openTarget,
		projects,
		projectCount,
		workspaceId,
		workspace,
		dashboard,
		userTimezone: user.timezone ?? null
	};
};
