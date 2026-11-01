// apps/mobile/src/lib/chat/opening.ts
/**
 * How the chat opens, mirroring the website's AgentChatModal: from the nav (Today, Workspace)
 * the first thing is the context picker (Workspace chat, or a project); from a project page
 * the project is already chosen; a stored chat opens straight into itself. Pure helpers, so
 * the screen's choices are testable without React.
 */
import type { DesktopProject, ProjectFullResponse } from '@buildos/api-client';

import { type ChatFocus, type ChatFocusKind, type ChatTarget, FOCUS_WORD } from './context';

export type ChatStage = 'pick' | 'projects' | 'chat';

export function initialStage(input: {
	target: ChatTarget;
	sessionId: string | null;
	/** Dev demo states that want a specific stage. */
	demo?: string | null;
}): ChatStage {
	if (input.demo === 'pick') return 'pick';
	if (input.demo === 'projects') return 'projects';
	// Any other demo state is a chat: `idle` is the empty chat right after choosing.
	if (input.demo) return 'chat';
	if (input.sessionId) return 'chat';
	return input.target.type === 'project' ? 'chat' : 'pick';
}

function matches(name: string, query: string): boolean {
	const q = query.trim().toLowerCase();
	return !q || name.toLowerCase().includes(q);
}

/** Projects a chat can be about: never the Workspace row; most recently touched first. */
export function pickableProjects(
	projects: readonly DesktopProject[] | undefined,
	query = ''
): DesktopProject[] {
	return (projects ?? [])
		.filter((project) => project.kind !== 'workspace' && matches(project.name, query))
		.sort(
			(a, b) =>
				Date.parse(b.last_touch_at ?? b.updated_at) -
				Date.parse(a.last_touch_at ?? a.updated_at)
		);
}

/** One line under a project's name in the picker. */
export function projectAside(project: DesktopProject): string | null {
	if (project.next_step_short?.trim()) return project.next_step_short.trim();
	if (project.open_tasks > 0)
		return `${project.open_tasks} open ${project.open_tasks === 1 ? 'task' : 'tasks'}`;
	return null;
}

export type FocusOption = ChatFocus & { meta: string | null };
export type FocusSection = { kind: ChatFocusKind; label: string; items: FocusOption[] };

const SECTION_LABEL: Record<ChatFocusKind, string> = {
	task: 'Tasks',
	document: 'Docs',
	goal: 'Goals',
	plan: 'Plans',
	milestone: 'Milestones',
	risk: 'Risks'
};

function live<T extends { archived_at?: string | null; deleted_at?: string | null }>(row: T) {
	return !row.archived_at && !row.deleted_at;
}

/**
 * What a project chat can focus on, from the project read the app already holds (tasks, docs,
 * goals, plans, milestones, risks), the website's six tabs. Finished tasks sink to the end.
 */
export function focusSections(
	full: ProjectFullResponse | undefined,
	query = '',
	limitPerSection = 12
): FocusSection[] {
	if (!full) return [];
	const sections: FocusSection[] = [];
	const push = (kind: ChatFocusKind, items: FocusOption[]) => {
		const kept = items.filter((item) => matches(item.name, query)).slice(0, limitPerSection);
		if (kept.length) sections.push({ kind, label: SECTION_LABEL[kind], items: kept });
	};
	const tasks = [...full.tasks]
		.filter(live)
		.sort((a, b) => Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at)));
	push(
		'task',
		tasks.map((task) => ({
			kind: 'task',
			id: task.id,
			name: task.title,
			meta: task.completed_at ? 'Done' : null
		}))
	);
	push(
		'document',
		full.documents
			.filter(live)
			.map((doc) => ({ kind: 'document', id: doc.id, name: doc.title, meta: null }))
	);
	push(
		'goal',
		full.goals
			.filter(live)
			.map((goal) => ({ kind: 'goal', id: goal.id, name: goal.name, meta: null }))
	);
	push(
		'plan',
		full.plans
			.filter(live)
			.map((plan) => ({ kind: 'plan', id: plan.id, name: plan.name, meta: null }))
	);
	push(
		'milestone',
		full.milestones.filter(live).map((milestone) => ({
			kind: 'milestone',
			id: milestone.id,
			name: milestone.title,
			meta: milestone.is_missed ? 'Missed' : null
		}))
	);
	push(
		'risk',
		full.risks
			.filter(live)
			.map((risk) => ({ kind: 'risk', id: risk.id, name: risk.title, meta: null }))
	);
	return sections;
}

/** "Task · Write the intro" for a chosen focus option. */
export function focusOptionLabel(option: ChatFocus): string {
	return `${FOCUS_WORD[option.kind]} · ${option.name.trim() || 'Untitled'}`;
}
