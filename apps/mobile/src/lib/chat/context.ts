// apps/mobile/src/lib/chat/context.ts
// Where a chat points: the Workspace (global) or one project, the two contexts the web has.
import type { AgentProjectFocus, AgentTurnContext } from '@buildos/api-client';

/** One item the chat works from (the web's project focus): the reader opens on a task or doc,
 * the focus sheet can pick any of these. */
export type ChatFocusKind = 'task' | 'document' | 'goal' | 'plan' | 'milestone' | 'risk';
export type ChatFocus = { kind: ChatFocusKind; id: string; name: string };

export const FOCUS_KINDS: readonly ChatFocusKind[] = [
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk'
];

/** "Task", "Doc", … as the strip and the focus sheet say them. */
export const FOCUS_WORD: Record<ChatFocusKind, string> = {
	task: 'Task',
	document: 'Doc',
	goal: 'Goal',
	plan: 'Plan',
	milestone: 'Milestone',
	risk: 'Risk'
};

/** The website's context descriptors (agent-chat.constants.ts), as the phone says them. */
export function describeTarget(target: ChatTarget): { title: string; subtitle: string } {
	if (target.type === 'global') {
		return {
			title: 'Workspace',
			subtitle: "Your projects, loose notes and what's coming up."
		};
	}
	const name = target.projectName.trim() || 'this project';
	if (target.focus) {
		return {
			title: target.focus.name.trim() || FOCUS_WORD[target.focus.kind],
			subtitle: `${FOCUS_WORD[target.focus.kind]} in ${name}. Ask about it, or change it; I start from here.`
		};
	}
	return {
		title: name,
		subtitle: `Answer questions, explore insights, or update ${name}.`
	};
}

export type ChatTarget =
	| { type: 'global' }
	| { type: 'project'; projectId: string; projectName: string; focus?: ChatFocus };

export const GLOBAL_TARGET: ChatTarget = { type: 'global' };

/** The `context` the admission route wants (strict schema; see api-client `AgentTurnContext`). */
export function turnContextFor(target: ChatTarget): AgentTurnContext {
	return target.type === 'project'
		? { type: 'project', entityId: target.projectId, projectId: target.projectId }
		: { type: 'global', entityId: null, projectId: null };
}

/** Project chats open project-wide, as the web's project chat does; the agent can narrow later. */
export function projectFocusFor(target: ChatTarget): AgentProjectFocus | null {
	if (target.type !== 'project') return null;
	return target.focus
		? {
				focusType: target.focus.kind,
				focusEntityId: target.focus.id,
				focusEntityName: target.focus.name,
				projectId: target.projectId,
				projectName: target.projectName
			}
		: {
				focusType: 'project-wide',
				focusEntityId: null,
				focusEntityName: null,
				projectId: target.projectId,
				projectName: target.projectName
			};
}

/** What the header calls this context. */
export function targetLabel(target: ChatTarget): string {
	return target.type === 'project' ? target.projectName.trim() || 'Project' : 'Workspace';
}

/** "Task · Write the intro", for the strip under the nav bar; null without a focus. */
export function focusLabel(target: ChatTarget): string | null {
	if (target.type !== 'project' || !target.focus) return null;
	return `${FOCUS_WORD[target.focus.kind]} · ${target.focus.name.trim() || 'Untitled'}`;
}

/** Route params for `/chat`, and back. Expo Router only carries strings. */
export function targetParams(target: ChatTarget): Record<string, string> {
	if (target.type !== 'project') return { context: 'global' };
	return {
		context: 'project',
		projectId: target.projectId,
		projectName: target.projectName,
		...(target.focus
			? {
					focusKind: target.focus.kind,
					focusId: target.focus.id,
					focusName: target.focus.name
				}
			: {})
	};
}

export function parseTargetParams(params: {
	context?: string | string[];
	projectId?: string | string[];
	projectName?: string | string[];
	focusKind?: string | string[];
	focusId?: string | string[];
	focusName?: string | string[];
}): ChatTarget {
	const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
	const projectId = one(params.projectId);
	if (one(params.context) === 'project' && projectId) {
		const focusKind = one(params.focusKind);
		const focusId = one(params.focusId);
		const kind = FOCUS_KINDS.find((candidate) => candidate === focusKind);
		const focus: ChatFocus | undefined =
			kind && focusId ? { kind, id: focusId, name: one(params.focusName) ?? '' } : undefined;
		return {
			type: 'project',
			projectId,
			projectName: one(params.projectName) ?? 'Project',
			...(focus ? { focus } : {})
		};
	}
	return GLOBAL_TARGET;
}
