// apps/mobile/src/hooks/use-chat.ts
// A chat screen's view of one session: its rows, sending, stopping, switching sessions.
import { isBuildOsApiError } from '@buildos/api-client';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LayoutAnimation } from 'react-native';

import { useDesktop } from '@/hooks/use-desktop';
import { api, unreachableMessage } from '@/lib/api';
import { type ChatTarget, projectFocusFor, turnContextFor } from '@/lib/chat/context';
import { type DemoState, runDemoTurn, seedDemo } from '@/lib/chat/demo';
import { newChatId } from '@/lib/chat/ids';
import { getChatRuntime } from '@/lib/chat/runtime';
import { createSessionStore } from '@/lib/chat/session-store';

const BUSY_MESSAGE = 'Still working on your last message. Stop it or wait for it to finish.';

function sendErrorMessage(error: unknown): string {
	if (isBuildOsApiError(error)) {
		if (error.isNetworkError)
			return unreachableMessage("No connection. Your message wasn't sent.");
		if (error.isUnauthorized()) return 'Signed out. Sign in again to keep chatting.';
		if (error.isUpgradeRequired()) return 'Chat needs an active plan. Manage it on the web.';
		return error.message || "Couldn't send that.";
	}
	return error instanceof Error && error.message ? error.message : "Couldn't send that.";
}

/** New rows slide into place instead of popping (the keyboard's own curve wins if both move). */
function animateRows() {
	LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
}

export type UseChatOptions = {
	/** Dev only: a scripted store instead of the realtime runtime (see lib/chat/demo.ts). */
	demo?: DemoState | null;
};

export function useChat(
	target: ChatTarget,
	initialSessionId: string | null,
	{ demo = null }: UseChatOptions = {}
) {
	const chat = demo ? null : getChatRuntime();
	const [sessionId, setSessionId] = useState<string | null>(demo ? null : initialSessionId);
	const draftKey = useRef(newChatId('row'));
	const [demoEpoch, setDemoEpoch] = useState(0);
	const demoCancel = useRef<(() => void) | null>(null);
	const store = useMemo(() => {
		if (demo) {
			const skew = { ms: 0 };
			const seeded = createSessionStore({ now: () => Date.now() + skew.ms });
			seedDemo(seeded, demoEpoch === 0 ? demo : 'idle', { skew });
			return seeded;
		}
		return sessionId ? chat!.storeFor(sessionId) : chat!.draftStore(draftKey.current);
	}, [chat, demo, demoEpoch, sessionId]);
	const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
	const [loading, setLoading] = useState(false);

	// A stored session: read it once, then let realtime events keep it current. Turns still
	// running are discovered and re-attached, so a reply in flight keeps streaming in.
	useEffect(() => {
		if (!chat || !sessionId || store.getState().loaded) return;
		let cancelled = false;
		setLoading(true);
		void (async () => {
			try {
				const history = await api.chat.history(sessionId);
				if (cancelled) return;
				const { activeTurnRunIds } = store.restore(history);
				if (activeTurnRunIds.length > 0) await chat.adoption.discoverSession(sessionId);
			} catch (error) {
				if (!cancelled) store.setError(sendErrorMessage(error));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [chat, sessionId, store]);

	// Leaving the screen ends a demo turn; a real one keeps running in its store.
	useEffect(() => () => demoCancel.current?.(), []);

	const send = useCallback(
		async (text: string) => {
			const message = text.trim();
			if (!message) return;
			if (store.getState().activeTurn) {
				store.setError(BUSY_MESSAGE);
				return;
			}
			animateRows();
			if (!chat) {
				demoCancel.current = runDemoTurn(store, message);
				return;
			}
			const clientTurnId = newChatId('turn');
			const streamRunId = newChatId('stream');
			store.addUserMessage({ clientTurnId, text: message });
			try {
				const admission = await api.agent.sendTurn({
					clientTurnId,
					streamRunId,
					sessionId: store.getState().sessionId,
					context: turnContextFor(target),
					message,
					projectFocus: projectFocusFor(target)
				});
				if (!store.getState().sessionId) {
					const created = admission.session?.id ?? admission.handle.sessionId;
					chat.bindSession(draftKey.current, created);
					setSessionId(created);
				}
				if (admission.outcome === 'active_turn_conflict') {
					store.markFailed(clientTurnId, BUSY_MESSAGE);
					return;
				}
				// The route echoes our client turn id; the core's handle type has it non-null.
				store.adoptHandle(
					{
						...admission.handle,
						clientTurnId: admission.handle.clientTurnId ?? clientTurnId
					},
					admission.status
				);
				// The core wants the route's envelope; api-client already unwrapped it.
				chat.adoption.adoptAdmissionResponse({ success: true, data: admission });
			} catch (error) {
				store.markFailed(clientTurnId, sendErrorMessage(error));
			}
		},
		[chat, store, target]
	);

	const stop = useCallback(async () => {
		const handle = store.getState().activeTurn;
		if (!handle) return;
		if (!chat) {
			demoCancel.current?.();
			demoCancel.current = null;
			return;
		}
		store.requestStop(handle.turnRunId);
		try {
			await api.agent.cancelTurn(handle.turnRunId, { reason: 'user_cancelled' });
		} catch (error) {
			store.requestStop(handle.turnRunId, false);
			store.setError(sendErrorMessage(error));
		}
	}, [chat, store]);

	const startNew = useCallback(() => {
		demoCancel.current?.();
		demoCancel.current = null;
		draftKey.current = newChatId('row');
		setSessionId(null);
		if (!chat) setDemoEpoch((value) => value + 1);
	}, [chat]);

	const open = useCallback(
		(id: string) => {
			if (!chat) {
				setDemoEpoch(0);
				return;
			}
			setSessionId(id);
		},
		[chat]
	);

	return {
		sessionId: chat ? sessionId : demoEpoch === 0 && demo !== 'idle' ? 'demo' : null,
		rows: state.rows,
		activeTurn: state.activeTurn,
		error: state.error,
		pendingChange: state.pendingChange,
		loading,
		send,
		stop,
		startNew,
		open,
		clearError: () => store.setError(null)
	};
}

/** The chats to pick from for this context: a project's, or the Workspace's plus loose ones. */
export function useChatSessions(target: ChatTarget, enabled: boolean) {
	const desktop = useDesktop();
	const workspaceId = desktop.data?.workspace?.id ?? null;
	const projectId = target.type === 'project' ? target.projectId : workspaceId;
	return useQuery({
		queryKey: ['chat-sessions', target.type, projectId],
		enabled: enabled && Boolean(projectId),
		queryFn: ({ signal }) =>
			api.chat.recentForProject(
				projectId!,
				{ limit: 25, include: target.type === 'global' ? 'workspace_chats' : undefined },
				{ signal }
			)
	});
}

/** How many turns are running anywhere, for the Brain Bolt's badge. */
export function useActiveTurnCount(): number {
	const chat = getChatRuntime();
	return useSyncExternalStore(
		chat.subscribeActiveTurns,
		chat.activeTurnCount,
		chat.activeTurnCount
	);
}
