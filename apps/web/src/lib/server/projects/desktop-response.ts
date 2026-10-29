// apps/web/src/lib/server/projects/desktop-response.ts
//
// The phone's Workspace tab in one answer (GET /api/projects/desktop): every project
// as a tile, with the same pulse, D/T bars and open-task mix the website's desktop
// computes in the browser (desktop-signals.ts `buildLooks`), plus the Workspace's
// loose items. Pure: the route reads, this shapes. The wire types are mirrored in
// packages/api-client/src/types.ts (`DesktopResponse`); keep the two in step.
import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
import {
	buildLooks,
	type ProjectSignals,
	type Pulse,
	type TaskBucket
} from '$lib/components/projects/desktop/desktop-signals';
import type { LooseItem, WorkspaceHome } from '$lib/components/workspace/workspace-model';

export type ProjectPulse = Pulse;
export type TaskMix = Record<TaskBucket, number>;

export type DesktopProject = {
	id: string;
	name: string;
	/** 'workspace' is the viewer's loose-items holder; it is never drawn as a tile. */
	kind: 'project' | 'workspace';
	state_key: string;
	updated_at: string;
	/** Last recorded change (app, chat or agents) in the last 60 days; null when none. */
	last_touch_at: string | null;
	next_step_short: string | null;
	/** Up to two emojis; null shows the monogram. */
	emoji: string[] | null;
	/** Set only when the parent is also in this viewer's list. */
	parent_project_id: string | null;
	/** null when there is no history to judge (signals didn't load). */
	pulse: ProjectPulse | null;
	pulse_reason: string;
	/** Bar lengths 0–1, ranked against the viewer's other projects. */
	bars: { docs: number; tasks: number };
	mix: TaskMix;
	open_tasks: number;
	document_count: number;
	task_count: number;
};

export type LooseItemSummary = {
	id: string;
	kind: 'note' | 'doc' | 'task';
	title: string;
	excerpt: string | null;
	updated_at: string;
};

export type DesktopWorkspace = {
	id: string;
	items: LooseItemSummary[];
	totals: { notes: number; docs: number; tasks: number };
};

export type DesktopResponse = {
	/** Most recently active first; a parent's activity includes its sub-projects'. */
	projects: DesktopProject[];
	workspace: DesktopWorkspace | null;
};

export type DesktopSummary = Pick<
	OntologyProjectSummary,
	| 'id'
	| 'name'
	| 'kind'
	| 'state_key'
	| 'updated_at'
	| 'next_step_short'
	| 'document_count'
	| 'task_count'
>;

export type DesktopReads = {
	summaries: readonly DesktopSummary[];
	/** Child id → parent id, visible parents only (loadVisibleParentIds). */
	parents: ReadonlyMap<string, string>;
	/** null when the signals read failed: pulses fall back the way the website's do. */
	signals: ReadonlyMap<string, ProjectSignals> | null;
	emojis: ReadonlyMap<string, readonly string[]> | null;
	workspace: WorkspaceHome | null;
	/** The request time; pulses and bars are judged against it. */
	now: number;
};

function time(value: string | null | undefined): number {
	const parsed = value ? Date.parse(value) : NaN;
	return Number.isNaN(parsed) ? 0 : parsed;
}

/** Three decimals is far finer than a 62pt bar can show, and keeps the payload small. */
function bar(value: number): number {
	return Math.round(value * 1000) / 1000;
}

/** desktop-model.ts `sortRecent`: newest activity first, a parent counting its children's. */
function byRecentActivity(projects: readonly DesktopProject[]): DesktopProject[] {
	const activity = new Map(projects.map((project) => [project.id, time(project.updated_at)]));
	for (const project of projects) {
		const parentId = project.parent_project_id;
		if (!parentId || !activity.has(parentId)) continue;
		activity.set(
			parentId,
			Math.max(activity.get(parentId) ?? 0, time(project.updated_at))
		);
	}
	return [...projects].sort(
		(a, b) =>
			(activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0) || a.name.localeCompare(b.name)
	);
}

export function toLooseItemSummary(item: LooseItem): LooseItemSummary {
	return {
		id: item.id,
		kind: item.kind,
		title: item.title,
		excerpt: item.excerpt,
		updated_at: item.updated_at
	};
}

export function buildDesktopResponse(reads: DesktopReads): DesktopResponse {
	const withSignals = reads.summaries.map((summary) => ({
		...summary,
		signals: reads.signals ? (reads.signals.get(summary.id) ?? null) : null
	}));
	// Ranked across everything the viewer can see, as the website does.
	const looks = buildLooks(withSignals, reads.now);

	const projects = withSignals.map((summary): DesktopProject => {
		const look = looks.get(summary.id);
		const emoji = reads.emojis?.get(summary.id);
		return {
			id: summary.id,
			name: summary.name,
			kind: summary.kind === 'workspace' ? 'workspace' : 'project',
			state_key: summary.state_key,
			updated_at: summary.updated_at,
			last_touch_at: summary.signals?.last_touch_at ?? null,
			next_step_short: summary.next_step_short?.trim() || null,
			emoji: emoji && emoji.length ? [...emoji] : null,
			parent_project_id: reads.parents.get(summary.id) ?? null,
			pulse: look?.pulse ?? null,
			pulse_reason: look?.reason ?? '',
			bars: { docs: bar(look?.docs ?? 0), tasks: bar(look?.tasks ?? 0) },
			mix: look
				? { ...look.mix }
				: { overdue: 0, in_progress: 0, scheduled: 0, backlog: summary.task_count },
			open_tasks: look?.open ?? summary.task_count,
			document_count: summary.document_count,
			task_count: summary.task_count
		};
	});

	const workspace = reads.workspace;
	return {
		projects: byRecentActivity(projects),
		workspace: workspace
			? {
					id: workspace.workspaceId,
					items: workspace.items.map(toLooseItemSummary),
					totals: { ...workspace.totals }
				}
			: null
	};
}
