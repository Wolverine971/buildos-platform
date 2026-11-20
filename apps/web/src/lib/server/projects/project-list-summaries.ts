// apps/web/src/lib/server/projects/project-list-summaries.ts
//
// The Projects page's tiles: every project the viewer can see, with what a tile shows
// (parent, activity and task mix, emoji, shared flag). One function so the page's first
// load and its later refreshes (GET /api/projects/summaries) can never drift apart.
//
// Reads go through the viewer's own client, so RLS decides what they can see. Signals and
// emojis degrade to none rather than fail the tiles.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { fetchProjectSummaries } from '$lib/services/ontology/ontology-projects.service';
import {
	addProjectCollaborationFlags,
	type ProjectListSummary
} from '$lib/components/projects/project-list';
import { loadVisibleParentIds } from '$lib/services/ontology/project-hierarchy.service';
import { loadProjectSignals } from '$lib/server/projects/desktop-signals';
import { loadProjectEmojis } from '$lib/server/projects/project-emoji';

type Timing = App.Locals['serverTiming'];

export async function loadProjectListSummaries(
	supabase: SupabaseClient<Database>,
	actorId: string,
	timing?: Timing
): Promise<ProjectListSummary[]> {
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	const loaded = await fetchProjectSummaries(supabase, actorId, timing);
	if (loaded.length === 0) return [];
	const projectIds = loaded.map((project) => project.id);

	const [{ data: memberRows, error: memberRowsError }, parentIds, signals, emojis] =
		await Promise.all([
			measure('db.project_members.collaboration_flags', () =>
				supabase
					.from('onto_project_members')
					.select('project_id, actor_id')
					.in('project_id', projectIds)
					.is('removed_at', null)
			),
			// Nesting: a parent is named only when it's also in this viewer's list.
			measure('db.project_parents', () => loadVisibleParentIds(supabase, projectIds)),
			// Desktop tiles: last real change and the open-task mix per project.
			measure('db.project_desktop_signals', () =>
				loadProjectSignals(supabase, projectIds).catch((err) => {
					console.error('[Projects] Failed to load desktop signals:', err);
					return null;
				})
			),
			// Tile emojis (picked automatically or by the owner); without one, initials.
			measure('db.project_emojis', () =>
				loadProjectEmojis(supabase, projectIds).catch((err) => {
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
}
