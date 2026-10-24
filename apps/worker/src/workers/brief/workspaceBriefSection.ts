// apps/worker/src/workers/brief/workspaceBriefSection.ts
// The Workspace (loose tasks and notes outside any project) in the daily brief. It is
// not a project: no project write-up, no project count, just a short "Loose ends" list.
import { parseISO, subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type {
	OntoProject,
	OntoProjectWithRelations,
	OntoTask,
	WorkspaceBriefSection
} from './ontologyBriefTypes.js';

const WORKSPACE_BRIEF_TASK_CAP = 5;
const WORKSPACE_BRIEF_NOTE_CAP = 3;
const WORKSPACE_BRIEF_NOTE_DAYS = 7;

export function isWorkspaceProjectRow(project: Pick<OntoProject, 'kind'> | null | undefined) {
	return project?.kind === 'workspace';
}

/** Open loose tasks (soonest due first) and notes saved this week, for "Loose ends". */
export function buildWorkspaceBriefSection(
	data: Pick<OntoProjectWithRelations, 'project' | 'tasks' | 'documents'>,
	now: Date = new Date()
): WorkspaceBriefSection {
	const dueTime = (task: OntoTask) =>
		task.due_at ? parseISO(task.due_at).getTime() : Number.POSITIVE_INFINITY;
	const openTasks = data.tasks
		.filter((task) => task.state_key !== 'done')
		.sort(
			(a, b) =>
				dueTime(a) - dueTime(b) ||
				parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime()
		);
	const noteCutoff = subDays(now, WORKSPACE_BRIEF_NOTE_DAYS).getTime();
	const recentNotes = data.documents
		.filter((doc) => parseISO(doc.created_at).getTime() >= noteCutoff)
		.sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime());
	return {
		projectId: data.project.id,
		openTasks: openTasks.slice(0, WORKSPACE_BRIEF_TASK_CAP),
		openTaskCount: openTasks.length,
		recentNotes: recentNotes.slice(0, WORKSPACE_BRIEF_NOTE_CAP).map((doc) => ({
			id: doc.id,
			title: doc.title?.trim() || 'Untitled note',
			created_at: doc.created_at
		})),
		recentNoteCount: recentNotes.length
	};
}

function escapeMarkdownLinkLabel(label: string): string {
	return label.replace(/([\\[\]*])/g, '\\$1');
}

/**
 * "Loose ends": what's waiting in the Workspace (tasks and notes outside any project).
 * Deterministic, no model call, and empty when there's nothing loose to mention.
 */
export function formatWorkspaceLooseEnds(
	workspace: WorkspaceBriefSection | null | undefined,
	timezone = 'UTC'
): string {
	if (!workspace || (workspace.openTaskCount === 0 && workspace.recentNoteCount === 0)) {
		return '';
	}
	const plural = (count: number, one: string, many: string) =>
		`${count} ${count === 1 ? one : many}`;
	const counts = [
		workspace.openTaskCount > 0
			? plural(workspace.openTaskCount, 'open task', 'open tasks')
			: null,
		workspace.recentNoteCount > 0
			? `${plural(workspace.recentNoteCount, 'note', 'notes')} saved this week`
			: null
	].filter(Boolean);
	let section = `## Loose Ends\n\n`;
	section += `${counts.join(' and ')} in your [Workspace](/projects), outside any project.\n\n`;
	for (const task of workspace.openTasks) {
		const href = `/projects/${task.project_id}/tasks/${task.id}`;
		const due = task.due_at
			? ` — due ${formatInTimeZone(parseISO(task.due_at), timezone, 'MMM d')}`
			: '';
		section += `- [${escapeMarkdownLinkLabel(task.title)}](${href})${due}\n`;
	}
	if (workspace.openTaskCount > workspace.openTasks.length) {
		section += `- ... and ${workspace.openTaskCount - workspace.openTasks.length} more\n`;
	}
	for (const note of workspace.recentNotes) {
		const href = `/projects/${workspace.projectId}/documents/${note.id}`;
		section += `- 📝 [${escapeMarkdownLinkLabel(note.title)}](${href})\n`;
	}
	return `${section}\n`;
}
