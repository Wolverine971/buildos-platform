// apps/web/src/routes/api/projects/desktop/+server.ts
/**
 * GET /api/projects/desktop
 * The iPhone app's Workspace tab in one request: every project as a tile (pulse,
 * D/T bars, open-task mix, emoji, parent) and the Workspace's loose items. Same reads
 * as the website's Projects page (routes/projects/+page.server.ts); the tile math the
 * website runs in the browser runs here, against the request time.
 *
 * Reads go through the viewer's own client (cookie or the phone's Bearer token), so
 * RLS decides what they can see. Critical path is three steps:
 *   1. actor + Workspace id (side by side)
 *   2. project summaries, while the Workspace's loose items load
 *   3. parents, signals and emojis (side by side)
 * Signals, emojis and the Workspace degrade to empty rather than fail the tiles.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	ensureActorId,
	ensureWorkspaceProjectId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import { loadVisibleParentIds } from '$lib/services/ontology/project-hierarchy.service';
import { loadProjectSignals } from '$lib/server/projects/desktop-signals';
import { loadProjectEmojis } from '$lib/server/projects/project-emoji';
import { loadWorkspaceHome } from '$lib/server/workspace/workspace.service';
import { buildDesktopResponse } from '$lib/server/projects/desktop-response';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const supabase = locals.supabase;
		const measure = <T>(name: string, fn: () => Promise<T> | T) =>
			locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();
		const now = Date.now();

		// The Workspace is resolved (created on first use) before the list is read, so
		// the list already includes it, as on the website.
		const [actorId, workspaceId] = await Promise.all([
			measure('db.ensure_actor', () =>
				ensureActorId(supabase, user.id).catch((err) => {
					console.error('[Desktop API] Failed to resolve actor:', err);
					return null;
				})
			),
			measure('db.ensure_workspace', () =>
				ensureWorkspaceProjectId(supabase as never).catch((err) => {
					console.error('[Desktop API] Could not open the Workspace:', err);
					return null;
				})
			)
		]);
		if (!actorId) {
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Loose items load beside the summaries and the tile reads below.
		const workspaceRead = workspaceId
			? Promise.resolve(
					measure('workspace.home', () => loadWorkspaceHome(supabase, workspaceId))
				).catch((err) => {
					console.error('[Desktop API] Failed to load the Workspace:', err);
					return null;
				})
			: Promise.resolve(null);

		let summaries;
		try {
			summaries = await fetchProjectSummaries(supabase, actorId, locals.serverTiming);
		} catch (summaryError) {
			console.error('[Desktop API] Failed to fetch project summaries:', summaryError);
			return ApiResponse.error('Failed to fetch projects', 500);
		}

		const projectIds = summaries.map((project) => project.id);
		const [parents, signals, emojis, workspace] = await Promise.all([
			measure('db.project_parents', () => loadVisibleParentIds(supabase, projectIds)),
			measure('db.project_desktop_signals', () =>
				loadProjectSignals(supabase, projectIds, now).catch((err) => {
					console.error('[Desktop API] Failed to load desktop signals:', err);
					return null;
				})
			),
			measure('db.project_emojis', () =>
				loadProjectEmojis(supabase, projectIds).catch((err) => {
					console.error('[Desktop API] Failed to load project emojis:', err);
					return null;
				})
			),
			workspaceRead
		]);

		return ApiResponse.success(
			buildDesktopResponse({ summaries, parents, signals, emojis, workspace, now })
		);
	} catch (err) {
		console.error('[Desktop API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
