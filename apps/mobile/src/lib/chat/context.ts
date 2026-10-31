// apps/mobile/src/lib/chat/context.ts
// Where a chat points: the Workspace (global) or one project, the two contexts the web has.
import type { AgentProjectFocus, AgentTurnContext } from '@buildos/api-client';

export type ChatTarget =
	| { type: 'global' }
	| { type: 'project'; projectId: string; projectName: string };

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
	return {
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

/** Route params for `/chat`, and back. Expo Router only carries strings. */
export function targetParams(target: ChatTarget): Record<string, string> {
	return target.type === 'project'
		? { context: 'project', projectId: target.projectId, projectName: target.projectName }
		: { context: 'global' };
}

export function parseTargetParams(params: {
	context?: string | string[];
	projectId?: string | string[];
	projectName?: string | string[];
}): ChatTarget {
	const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
	const projectId = one(params.projectId);
	if (one(params.context) === 'project' && projectId) {
		return { type: 'project', projectId, projectName: one(params.projectName) ?? 'Project' };
	}
	return GLOBAL_TARGET;
}
