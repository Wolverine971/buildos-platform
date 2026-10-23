// apps/web/src/lib/server/workspace/capture-sort-core.ts
//
// Smart capture (DJ, 2026-10-23): a jot saves instantly as a note, then a cheap model
// reads it a second later and sorts it. It may become one or more tasks or notes, land in
// a project it clearly belongs to, or report progress on a task that already exists
// ("finished the BuildOS deck" marks that task done). Every change comes back with Undo.
// It never creates a project: starting one stays a suggestion the person accepts.
//
// This file is pure: the prompt, the check on the model's answer, and the plan. The
// model decides what the words mean (a structured answer, no keyword rules, AGENTS.md);
// the code only checks that answer against what it was shown.

export const CAPTURE_SORT_OPERATION = 'workspace_capture_sort';
/** A project-bound item or a task update needs at least this confidence; below it the
 * item stays in the Workspace and the update is dropped. */
export const SORT_PROJECT_MIN_CONFIDENCE = 0.75;
export const SORT_UPDATE_MIN_CONFIDENCE = 0.8;
export const SORT_MAX_ITEMS = 8;
export const SORT_MAX_UPDATES = 5;
/** What the model sees: the most recently touched projects and their open tasks. */
export const SORT_PROJECT_LIMIT = 40;
export const SORT_TASKS_PER_PROJECT = 8;
export const SORT_WORKSPACE_TASKS = 12;
const TITLE_MAX = 120;
const DETAILS_MAX = 4000;
const PROJECT_DESCRIPTION_MAX = 120;
const TASK_TITLE_MAX = 90;

export type SortProjectInput = { id: string; name: string; description: string | null };
export type SortTaskInput = {
	id: string;
	title: string;
	project_id: string;
	state_key: string;
	due_at: string | null;
};
export type SortProject = SortProjectInput & { alias: string };
export type SortTask = SortTaskInput & { alias: string };

export type SortContext = {
	today: string;
	weekday: string;
	timezone: string;
	workspaceId: string;
	projects: SortProject[];
	tasks: SortTask[];
};

export type SortedItem = {
	kind: 'note' | 'task';
	title: string;
	details: string;
	/** YYYY-MM-DD, only when the capture states or clearly implies it. */
	due: string | null;
	/** A project id when the item clearly belongs there; null keeps it in the Workspace. */
	projectId: string | null;
};

export type SortedUpdate = {
	taskId: string;
	title: string;
	projectId: string;
	action: 'complete' | 'reschedule';
	due: string | null;
	before: { state_key: string; due_at: string | null };
};

export type CheckedSort = { items: SortedItem[]; updates: SortedUpdate[]; notes: string[] };

export type SortPlan =
	| { kind: 'keep' }
	| { kind: 'move'; projectId: string }
	| { kind: 'replace'; items: SortedItem[]; updates: SortedUpdate[] };

/** Short aliases the model can't mistype: P1.. for projects, T1.. for open tasks. Projects
 * the person can't write to are left out by the caller. */
export function buildSortContext(input: {
	workspaceId: string;
	projects: SortProjectInput[];
	tasks: SortTaskInput[];
	today: string;
	weekday: string;
	timezone: string;
}): SortContext {
	const projects = input.projects
		.filter((project) => project.id !== input.workspaceId)
		.slice(0, SORT_PROJECT_LIMIT)
		.map((project, index) => ({ ...project, alias: `P${index + 1}` }));
	const allowed = new Set([input.workspaceId, ...projects.map((project) => project.id)]);
	const perProject = new Map<string, number>();
	const tasks: SortTask[] = [];
	for (const task of input.tasks) {
		if (!allowed.has(task.project_id) || task.state_key === 'done') continue;
		const cap =
			task.project_id === input.workspaceId ? SORT_WORKSPACE_TASKS : SORT_TASKS_PER_PROJECT;
		const used = perProject.get(task.project_id) ?? 0;
		if (used >= cap) continue;
		perProject.set(task.project_id, used + 1);
		tasks.push({ ...task, alias: `T${tasks.length + 1}` });
	}
	return {
		today: input.today,
		weekday: input.weekday,
		timezone: input.timezone,
		workspaceId: input.workspaceId,
		projects,
		tasks
	};
}

export const CAPTURE_SORT_SYSTEM_PROMPT = `You sort one quick capture a person just jotted into BuildOS. Read it and decide what it is. Return JSON only.

- items: what to save from it.
  - kind "task" when it is something the person still needs to do; kind "note" for an idea, thought, reference, or anything not actionable. If unsure, use "note".
  - Split into several items only when the capture clearly lists separate things. Otherwise return one item.
  - Keep the person's own words. title: at most 80 characters (a task title starts with a verb). details: anything else worth keeping from the capture, or "".
  - due: "YYYY-MM-DD" only when the capture states or clearly implies a date. Never invent one.
  - project: a project alias (P#) only when the item clearly belongs to that listed project, by name or unmistakable subject. Otherwise null, and it stays in the Workspace (the person's loose notes and tasks).
- updates: changes to a listed open task (T#) that the capture clearly reports.
  - "complete" when it says that task is done. "reschedule" with due when it moves that task's date.
  - Only when the match is unmistakable. Something already covered by an update must not also be an item.
- confidence: 0 to 1 on every item and update.
- Never create a project and never use an alias that is not listed.

Shape:
{"items":[{"kind":"note","title":"","details":"","due":null,"project":null,"confidence":0.9}],"updates":[{"task":"T1","action":"complete","due":null,"confidence":0.9}]}`;

function clip(text: string | null | undefined, max: number): string {
	const value = (text ?? '').replace(/\s+/g, ' ').trim();
	return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function buildCaptureSortPrompt(capture: string, context: SortContext): string {
	const lines: string[] = [
		`Today is ${context.weekday} ${context.today} (${context.timezone}).`,
		'',
		'Projects:'
	];
	if (!context.projects.length) lines.push('(none)');
	for (const project of context.projects) {
		const about = clip(project.description, PROJECT_DESCRIPTION_MAX);
		lines.push(`${project.alias} · ${clip(project.name, 80)}${about ? ` — ${about}` : ''}`);
	}
	lines.push('', 'Open tasks:');
	if (!context.tasks.length) lines.push('(none)');
	const projectAlias = new Map(context.projects.map((project) => [project.id, project.alias]));
	for (const task of context.tasks) {
		const where =
			task.project_id === context.workspaceId
				? 'Workspace'
				: (projectAlias.get(task.project_id) ?? 'Workspace');
		const due = task.due_at ? ` · due ${task.due_at.slice(0, 10)}` : '';
		lines.push(`${task.alias} · ${where} · ${clip(task.title, TASK_TITLE_MAX)}${due}`);
	}
	lines.push('', 'Capture:', '"""', capture.trim(), '"""');
	return lines.join('\n');
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!DATE_ONLY.test(trimmed)) return null;
	const parsed = new Date(`${trimmed}T12:00:00Z`);
	return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed
		? null
		: trimmed;
}

function confidenceOf(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.min(1, value))
		: 0;
}

function aliasOf(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

/** Keeps what the model returned that fits what it was shown: known aliases, confident
 * project picks and updates, real dates. Anything else is dropped with a note. */
export function checkCaptureSortAnswer(raw: unknown, context: SortContext): CheckedSort {
	const notes: string[] = [];
	const answer = (raw && typeof raw === 'object' ? raw : {}) as {
		items?: unknown;
		updates?: unknown;
	};
	const projects = new Map(context.projects.map((project) => [project.alias, project]));
	const tasks = new Map(context.tasks.map((task) => [task.alias, task]));

	const items: SortedItem[] = [];
	for (const entry of Array.isArray(answer.items) ? answer.items : []) {
		if (items.length >= SORT_MAX_ITEMS) {
			notes.push('too many items');
			break;
		}
		if (!entry || typeof entry !== 'object') continue;
		const item = entry as Record<string, unknown>;
		const title = clip(typeof item.title === 'string' ? item.title : '', TITLE_MAX);
		if (!title) {
			notes.push('item without a title');
			continue;
		}
		const alias = aliasOf(item.project);
		const project = alias ? projects.get(alias) : undefined;
		if (alias && !project) notes.push(`unknown project ${alias}`);
		const confident = confidenceOf(item.confidence) >= SORT_PROJECT_MIN_CONFIDENCE;
		if (project && !confident) notes.push(`weak project pick ${alias}`);
		items.push({
			kind: item.kind === 'task' ? 'task' : 'note',
			title,
			details:
				typeof item.details === 'string' ? item.details.trim().slice(0, DETAILS_MAX) : '',
			due: validDate(item.due),
			projectId: project && confident ? project.id : null
		});
	}

	const updates: SortedUpdate[] = [];
	const seen = new Set<string>();
	for (const entry of Array.isArray(answer.updates) ? answer.updates : []) {
		if (updates.length >= SORT_MAX_UPDATES) break;
		if (!entry || typeof entry !== 'object') continue;
		const update = entry as Record<string, unknown>;
		const alias = aliasOf(update.task);
		const task = alias ? tasks.get(alias) : undefined;
		if (!task) {
			notes.push(`unknown task ${alias ?? '(none)'}`);
			continue;
		}
		if (confidenceOf(update.confidence) < SORT_UPDATE_MIN_CONFIDENCE) {
			notes.push(`weak update ${alias}`);
			continue;
		}
		if (seen.has(task.id)) continue;
		const action =
			update.action === 'complete'
				? 'complete'
				: update.action === 'reschedule'
					? 'reschedule'
					: null;
		const due = validDate(update.due);
		if (!action || (action === 'reschedule' && !due)) {
			notes.push(`unusable update ${alias}`);
			continue;
		}
		seen.add(task.id);
		updates.push({
			taskId: task.id,
			title: task.title,
			projectId: task.project_id,
			action,
			due: action === 'reschedule' ? due : null,
			before: { state_key: task.state_key, due_at: task.due_at }
		});
	}
	return { items, updates, notes };
}

/** What to do with the note that was saved: keep it as it is, move it into a project, or
 * replace it with what the model found in it. */
export function planCaptureSort(checked: CheckedSort): SortPlan {
	const { items, updates } = checked;
	if (!updates.length && items.length <= 1) {
		const only = items[0];
		if (!only || (only.kind === 'note' && !only.projectId)) return { kind: 'keep' };
		if (only.kind === 'note' && only.projectId)
			return { kind: 'move', projectId: only.projectId };
	}
	return { kind: 'replace', items, updates };
}

/** "Mon" style weekday and YYYY-MM-DD for a timezone, for the prompt's date line. */
export function civilToday(now: Date, timezone: string): { today: string; weekday: string } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		weekday: 'long'
	}).formatToParts(now);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	return { today: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') };
}
