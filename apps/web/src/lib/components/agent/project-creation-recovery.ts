// apps/web/src/lib/components/agent/project-creation-recovery.ts
import type { AgentChatSessionSnapshot } from './agent-chat-session';

export type ProjectCreationProgress =
	| { status: 'working' }
	| { status: 'review' }
	| { status: 'saved'; projectIds: string[] };

/** Only successful, persisted tool results prove creation — not an affected project or chat label. */
export function projectCreationProgress(
	snapshot: AgentChatSessionSnapshot
): ProjectCreationProgress {
	if (snapshot.activeTurnRun) return { status: 'working' };
	const projectIds = new Set<string>();
	for (const message of snapshot.messages) {
		if (message.type !== 'created_entities' || !Array.isArray(message.data?.entities)) continue;
		for (const entity of message.data.entities) {
			if (entity?.kind === 'project' && typeof entity.id === 'string' && entity.id.trim()) {
				projectIds.add(entity.id);
			}
		}
	}
	return projectIds.size
		? { status: 'saved', projectIds: [...projectIds] }
		: { status: 'review' };
}

export async function checkProjectCreation(
	sessionId: string,
	signal: AbortSignal
): Promise<ProjectCreationProgress> {
	// Keep the session parser/tool presenter out of the initial capture bundle.
	const { probeActiveTurnRun, loadAgentChatSessionSnapshot } = await import(
		'./agent-chat-session'
	);
	const active = await probeActiveTurnRun(sessionId, { signal });
	if (!active) throw new Error('Could not check the conversation.');
	if (active.hasActiveTurnRun) return { status: 'working' };
	// The inexpensive worker probe runs while busy; fetch the full receipt only at rest.
	return projectCreationProgress(await loadAgentChatSessionSnapshot(sessionId, { signal }));
}
