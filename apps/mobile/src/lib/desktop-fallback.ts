// apps/mobile/src/lib/desktop-fallback.ts
//
// The Workspace tab reads GET /api/projects/desktop. Until the website ships that route,
// production answers with an error, so the tab falls back to the reads the app already
// had: the project list (plain monogram tiles: no pulse, bars or mix; parents from the
// list's hierarchy read) and the Workspace's own project read (its loose notes, docs and
// tasks). Pure: no fetches.
//
// Known limits, gone once the route deploys: the list returns at most 50 projects (newest
// first), and when the Workspace row isn't among them its loose items show as not loaded.
import {
	isBuildOsApiError,
	type DesktopProject,
	type DesktopResponse,
	type LooseItemSummary,
	type ProjectFullResponse,
	type ProjectSummary
} from '@buildos/api-client';

/**
 * Why the desktop read failed, when the fallback can stand in:
 * - `missing`: the route isn't there. Production today sends /api/projects/desktop to
 *   /api/projects/[id], which fails the non-uuid id as a 500 DATABASE_ERROR; a plain
 *   404 means the same. Worth skipping the route for a while.
 * - `failed`: any other server error; fall back this time only.
 * null: not a server answer (offline, signed out, billing gate): show the error.
 */
export function desktopFallbackReason(error: unknown): 'missing' | 'failed' | null {
	if (!isBuildOsApiError(error) || error.isNetworkError) return null;
	if (error.status === 404) return 'missing';
	if (error.status === 500 && error.code === 'DATABASE_ERROR') return 'missing';
	if (error.status >= 500) return 'failed';
	return null;
}

const NOTE_TYPE_KEY = 'document.note';
const EXCERPT_MAX = 220;

function time(value: string | null | undefined): number {
	const parsed = value ? Date.parse(value) : NaN;
	return Number.isNaN(parsed) ? 0 : parsed;
}

/** A tile with nothing but its name and counts: the tile draws its monogram. */
export function fallbackDesktopProject(project: ProjectSummary): DesktopProject {
	return {
		id: project.id,
		name: project.name,
		kind: project.kind === 'workspace' ? 'workspace' : 'project',
		state_key: project.state_key,
		updated_at: project.updated_at,
		last_touch_at: null,
		next_step_short: null,
		emoji: null,
		parent_project_id: project.parent_project_id ?? null,
		pulse: null,
		pulse_reason: '',
		bars: { docs: 0, tasks: 0 },
		mix: { overdue: 0, in_progress: 0, scheduled: 0, backlog: 0 },
		open_tasks: 0,
		document_count: 0,
		task_count: project.task_count
	};
}

/** A few words of a body for a row: markdown marks dropped, whitespace folded, clipped. */
export function excerptOf(text: string | null | undefined): string | null {
	if (!text) return null;
	const folded = text
		.replace(/[#>*_`~]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!folded) return null;
	return folded.length > EXCERPT_MAX ? `${folded.slice(0, EXCERPT_MAX).trimEnd()}…` : folded;
}

type TreeNode = { id?: unknown; children?: unknown };

/** Docs filed inside another doc stay in their folder; only top-level docs are loose. */
export function nestedDocIds(structure: unknown): Set<string> {
	const nested = new Set<string>();
	const root = (structure as { root?: unknown } | null)?.root;
	const walk = (nodes: unknown) => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes as TreeNode[]) {
			if (typeof node?.id === 'string') nested.add(node.id);
			walk(node?.children);
		}
	};
	if (Array.isArray(root)) for (const node of root as TreeNode[]) walk(node?.children);
	return nested;
}

type LooseWorkspace = NonNullable<DesktopResponse['workspace']>;

/** The Workspace's loose items from its project read, newest first, as the website lists them. */
export function looseFromWorkspace(full: ProjectFullResponse): LooseWorkspace {
	const nested = nestedDocIds(full.project.doc_structure);
	const docs = full.documents
		.filter(
			(doc) =>
				!doc.deleted_at &&
				!doc.archived_at &&
				doc.state_key !== 'archived' &&
				!nested.has(doc.id)
		)
		.map((doc) => {
			const title = doc.title?.trim() || 'Untitled note';
			const item: LooseItemSummary = {
				id: doc.id,
				kind: doc.type_key === NOTE_TYPE_KEY ? 'note' : 'doc',
				title,
				excerpt: excerptOf(doc.description),
				updated_at: doc.updated_at
			};
			return { item, created: time(doc.created_at) };
		});
	const tasks = full.tasks
		.filter((task) => !task.deleted_at && !task.archived_at && task.state_key !== 'done')
		.map((task) => ({
			item: {
				id: task.id,
				kind: 'task',
				title: task.title,
				excerpt: excerptOf(task.description),
				updated_at: task.updated_at
			} satisfies LooseItemSummary,
			created: time(task.created_at)
		}));
	const items = [...docs, ...tasks]
		.sort((a, b) => b.created - a.created)
		.map((entry) => entry.item);
	const notes = items.filter((item) => item.kind === 'note').length;
	return {
		id: full.project.id,
		items,
		totals: {
			notes,
			docs: items.filter((item) => item.kind === 'doc').length,
			tasks: items.filter((item) => item.kind === 'task').length
		}
	};
}

/**
 * The plain list's projects with each one's parent from the `include=hierarchy` read (the
 * plain list never carries parent ids).
 */
export function withParents(
	projects: readonly ProjectSummary[],
	hierarchy: readonly ProjectSummary[]
): ProjectSummary[] {
	const parents = new Map(
		hierarchy.map((project) => [project.id, project.parent_project_id ?? null] as const)
	);
	return projects.map((project) =>
		parents.has(project.id)
			? { ...project, parent_project_id: parents.get(project.id) ?? null }
			: project
	);
}

/**
 * The desktop from the older reads. `workspace` is the Workspace project's read, or null
 * when there is no Workspace row or that read failed (the tab then says it couldn't load
 * loose items rather than claiming there are none).
 */
export function buildFallbackDesktop(
	projects: readonly ProjectSummary[],
	workspace: ProjectFullResponse | null
): DesktopResponse {
	const tiles = [...projects]
		.sort((a, b) => time(b.updated_at) - time(a.updated_at) || a.name.localeCompare(b.name))
		.map(fallbackDesktopProject);
	return { projects: tiles, workspace: workspace ? looseFromWorkspace(workspace) : null };
}
