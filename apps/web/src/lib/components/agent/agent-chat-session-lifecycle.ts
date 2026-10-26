// apps/web/src/lib/components/agent/agent-chat-session-lifecycle.ts
// Session teardown and stale-response fencing, shared by the modal and focused tests.
import type { ChatSession } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { AgentBrainDumpContext, DataMutationSummary } from './agent-chat.types';

/** Focus changes must not create a fresh thinking block in an idle conversation. */
export function logActiveFocusChange(
	state: { isTurnBusy: boolean; thinkingBlockId: string | null },
	action: string,
	focus: ProjectFocus | null,
	append: (
		content: string,
		type: 'context_shift',
		metadata: { focus: ProjectFocus | null }
	) => void
): void {
	if (!state.isTurnBusy || !state.thinkingBlockId) return;
	const details = !focus
		? 'project workspace'
		: focus.focusType === 'project-wide'
			? `${focus.projectName} (project-wide)`
			: `${focus.focusEntityName ?? 'Selected entity'} (${focus.focusType})`;
	append(`${action}: ${details}`, 'context_shift', { focus });
}

export interface SessionReleaseDeps {
	finalize: (reason: 'close' | 'destroy') => void;
	voice: { stop: () => unknown; cleanup: () => void };
	clearSessionRefresh: () => void;
	clearRestoredTurn: () => void;
	invalidateSessionLoads: () => void;
	stream: { reset: () => void; hasSentMessage: boolean };
	workerAdoption: { clear: (reason: 'teardown') => void } | null;
	workerRealtime: { stop: () => unknown } | null;
	attachments: { cleanup: () => void };
	unsubscribeSessionMessages: () => unknown;
	fallbackTimers: Map<string, ReturnType<typeof setTimeout>>;
	seenTerminalRunIds: Set<string>;
	clearToolState: () => void;
	presenter: {
		buildMutationSummary: (input: {
			hasMessagesSent: boolean;
			sessionId: string | null;
		}) => DataMutationSummary;
		resetMutationTracking: () => void;
	};
	sessionId: string | null;
	notifyDataMutation: (summary: DataMutationSummary) => void;
}

export function releaseChatSession(
	deps: SessionReleaseDeps,
	reason: 'close' | 'destroy',
	options: { deferBroadcast?: boolean } = {}
): DataMutationSummary {
	deps.finalize(reason);
	deps.voice.stop();
	deps.clearSessionRefresh();
	deps.clearRestoredTurn();
	deps.invalidateSessionLoads();
	// A first send may still be waiting for admission and have no session id.
	deps.stream.reset();
	deps.workerAdoption?.clear('teardown');
	void deps.workerRealtime?.stop();
	deps.voice.cleanup();
	deps.attachments.cleanup();
	void deps.unsubscribeSessionMessages();
	for (const timer of deps.fallbackTimers.values()) clearTimeout(timer);
	deps.fallbackTimers.clear();
	deps.seenTerminalRunIds.clear();
	deps.clearToolState();
	const summary = deps.presenter.buildMutationSummary({
		hasMessagesSent: deps.stream.hasSentMessage,
		sessionId: deps.sessionId
	});
	if (summary.hasChanges && !options.deferBroadcast) deps.notifyDataMutation(summary);
	deps.presenter.resetMutationTracking();
	return summary;
}

export async function adoptAdmissionForCurrentFocus<T>(deps: {
	currentSession: () => ChatSession | null;
	projectId: () => string | null;
	runId: () => number;
	loadSession: () => Promise<ChatSession>;
	hydrate: (session: ChatSession) => void;
	adopt: () => T | Promise<T>;
}): Promise<T> {
	if (!deps.currentSession()) {
		const projectId = deps.projectId();
		const runId = deps.runId();
		const session = await deps.loadSession();
		if (deps.currentSession() || projectId !== deps.projectId() || runId !== deps.runId()) {
			throw new Error('Chat focus changed while the turn was starting');
		}
		deps.hydrate(session);
	}
	return deps.adopt();
}

export async function hydrateBrainDumpForCurrentSession(deps: {
	session: ChatSession;
	currentSessionId: () => string | null;
	currentBrainDumpId: () => string | null;
	apply: (context: AgentBrainDumpContext) => void;
	onError: (error: unknown) => void;
}): Promise<void> {
	const metadata = (deps.session.agent_metadata ?? {}) as Record<string, unknown>;
	const id =
		typeof metadata.braindump_id === 'string'
			? metadata.braindump_id
			: typeof metadata.source_id === 'string' && metadata.source === 'onto_braindump'
				? metadata.source_id
				: null;
	if (!id || deps.currentBrainDumpId() === id) return;
	try {
		const response = await fetch(`/api/onto/braindumps/${id}`);
		const result = await response.json().catch(() => null);
		if (deps.currentSessionId() !== deps.session.id) return;
		if (response.ok && result?.success && result?.data?.braindump)
			deps.apply(result.data.braindump);
	} catch (error) {
		deps.onError(error);
	}
}
