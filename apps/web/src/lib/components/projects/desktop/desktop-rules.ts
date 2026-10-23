// apps/web/src/lib/components/projects/desktop/desktop-rules.ts
//
// What may be dropped where on the Projects desktop, and why not. Drag and the
// "Move to…" list both ask here, so they always agree. These mirror the server
// (one level of nesting, admin on both projects to nest, admin on either side
// to take out, edit access to move docs and tasks); the server stays the authority.
// The Workspace (the person's loose items, kind = 'workspace') is a drop target for docs
// and tasks only: dropping one on the desktop sends it back there. Projects never go in.
import type { ProjectListSummary } from '../project-list';
import { shortName, type DesktopIndex } from './desktop-model';

export type DesktopItem =
	| { kind: 'project'; id: string }
	| { kind: 'document' | 'task'; id: string; projectId: string };

export type DropTarget = { kind: 'desktop' } | { kind: 'project'; id: string };

export type DropAction = 'nest' | 'renest' | 'unnest' | 'move';

/** `null` means the item is already there: no highlight, no message. */
export type DropVerdict =
	| { ok: true; action: DropAction; targetId: string | null }
	| { ok: false; reason: string }
	| null;

const isAdmin = (project: ProjectListSummary | undefined) => project?.access_level === 'admin';
const canWrite = (project: ProjectListSummary | undefined) =>
	project?.access_level === 'admin' || project?.access_level === 'write';

const isWorkspace = (project: ProjectListSummary | undefined) => project?.kind === 'workspace';

export function dropVerdict(
	item: DesktopItem,
	target: DropTarget,
	index: DesktopIndex,
	workspaceId: string | null = null
): DropVerdict {
	if (item.kind === 'project') return projectVerdict(item.id, target, index);
	if (target.kind === 'desktop') {
		// The desktop is the Workspace's home: a doc or task dropped there becomes loose.
		if (!workspaceId || !index.byId.has(workspaceId))
			return { ok: false, reason: 'Docs and tasks belong to a project.' };
		if (item.projectId === workspaceId) return null;
		return { ok: true, action: 'move', targetId: workspaceId };
	}
	if (target.id === item.projectId) return null;
	const destination = index.byId.get(target.id);
	if (!destination) return null;
	if (!canWrite(destination))
		return {
			ok: false,
			reason: `You can view ${shortName(destination.name)} but not add to it.`
		};
	return { ok: true, action: 'move', targetId: destination.id };
}

function projectVerdict(id: string, target: DropTarget, index: DesktopIndex): DropVerdict {
	const project = index.byId.get(id);
	if (!project) return null;
	const parent = project.parent_project_id
		? index.byId.get(project.parent_project_id)
		: undefined;
	const name = shortName(project.name);

	if (target.kind === 'desktop') {
		if (!parent) return null;
		if (!isAdmin(project) && !isAdmin(parent))
			return {
				ok: false,
				reason: `Taking ${name} out needs admin access on it or on ${shortName(parent.name)}.`
			};
		return { ok: true, action: 'unnest', targetId: null };
	}

	const destination = index.byId.get(target.id);
	if (!destination || destination.id === project.id || destination.id === parent?.id) return null;
	if (isWorkspace(destination))
		return {
			ok: false,
			reason: 'Projects stay out of the Workspace. Drop their docs and tasks here instead.'
		};
	const destinationName = shortName(destination.name);
	const destinationParent = destination.parent_project_id
		? index.byId.get(destination.parent_project_id)
		: undefined;
	if (destinationParent)
		return {
			ok: false,
			reason: `${destinationName} is inside ${shortName(destinationParent.name)}. Projects nest one level deep.`
		};
	if ((index.children.get(project.id) ?? []).length > 0)
		return { ok: false, reason: `${name} holds projects, so it stays at the top level.` };
	if (!isAdmin(project) || !isAdmin(destination))
		return {
			ok: false,
			reason: `Putting ${name} inside ${destinationName} needs admin access on both.`
		};
	return { ok: true, action: parent ? 'renest' : 'nest', targetId: destination.id };
}

/** Words for the quick confirm. Pure so the dialog and tests share one source. */
export function confirmCopy(
	item: DesktopItem,
	action: DropAction,
	index: DesktopIndex,
	details: { title?: string; targetId: string | null; nestedCount?: number }
): { title: string; body: string; cta: string } {
	const target = details.targetId ? index.byId.get(details.targetId) : undefined;
	const targetName = target ? shortName(target.name) : '';
	if (item.kind === 'project') {
		const project = index.byId.get(item.id);
		const name = project ? shortName(project.name) : 'This project';
		const from = project?.parent_project_id
			? index.byId.get(project.parent_project_id)
			: undefined;
		const fromName = from ? shortName(from.name) : '';
		if (action === 'unnest')
			return {
				title: `Take ${name} out of ${fromName}?`,
				body: `It goes back to the top level of Projects and stops seeing ${fromName}'s shared docs.`,
				cta: 'Take out'
			};
		if (action === 'renest')
			return {
				title: `Move ${name} from ${fromName} into ${targetName}?`,
				body: `It shows under ${targetName} and reads ${targetName}'s shared docs instead.`,
				cta: 'Move'
			};
		return {
			title: `Put ${name} inside ${targetName}?`,
			body: `It shows under ${targetName} and can read ${targetName}'s shared docs. People invited only to ${name} still can't see ${targetName}.`,
			cta: 'Move inside'
		};
	}
	if (isWorkspace(target)) {
		const from = 'projectId' in item ? index.byId.get(item.projectId) : undefined;
		return {
			title: `Send “${details.title ?? 'this item'}” to your Workspace?`,
			body: `It leaves ${from ? shortName(from.name) : 'the project'} and waits with your loose items. ${
				item.kind === 'document' && details.nestedCount
					? `Its ${details.nestedCount} nested ${details.nestedCount === 1 ? 'doc moves' : 'docs move'} with it. `
					: ''
			}Links keep working.`,
			cta: 'Send'
		};
	}
	const title = `Move “${details.title ?? 'this item'}” to ${targetName}?`;
	if (item.kind === 'task')
		return {
			title,
			body: `It keeps its comments, and assignees who are in ${targetName}.`,
			cta: 'Move'
		};
	const nested = details.nestedCount ?? 0;
	return {
		title,
		body: nested
			? `Its ${nested} nested ${nested === 1 ? 'doc moves' : 'docs move'} with it. Links keep working.`
			: 'Links to it keep working.',
		cta: 'Move'
	};
}
