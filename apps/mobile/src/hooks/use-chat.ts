// apps/mobile/src/hooks/use-chat.ts
// A chat screen's view of one session: its rows, sending, stopping, switching sessions.
import {
	type AgentTurnAttachment,
	isBuildOsApiError,
	PROPOSAL_CARD_CLOSED_CODES
} from '@buildos/api-client';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LayoutAnimation } from 'react-native';

import { useDesktop } from '@/hooks/use-desktop';
import { api, unreachableMessage } from '@/lib/api';
import {
	describeDocumentUndoConflict,
	describeTableUndoConflict,
	DOCUMENT_UNDO_TOO_LARGE
} from '@/lib/chat/changes';
import { type ChatTarget, projectFocusFor, turnContextFor } from '@/lib/chat/context';
import { type DemoState, demoHasSession, runDemoTurn, seedDemo } from '@/lib/chat/demo';
import { newChatId } from '@/lib/chat/ids';
import { attachedLine, type MessageImage } from '@/lib/chat/images';
import { PENDING_CHANGE_FINISH_MESSAGE } from '@/lib/chat/proposals';
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

function undoErrorMessage(error: unknown, kind: 'document' | 'table'): string {
	if (isBuildOsApiError(error)) {
		if (error.isNetworkError) return unreachableMessage('No connection. Nothing changed.');
		if (error.status === 409) {
			return kind === 'document'
				? describeDocumentUndoConflict(error.code)
				: describeTableUndoConflict(error.code);
		}
		return error.message || 'Undo did not go through. Nothing changed.';
	}
	return 'Undo did not go through. Nothing changed.';
}

function proposalErrorMessage(error: unknown): string {
	if (isBuildOsApiError(error)) {
		if (error.code && (PROPOSAL_CARD_CLOSED_CODES as readonly string[]).includes(error.code)) {
			return 'This proposal has closed.';
		}
		if (error.isNetworkError) return unreachableMessage('No connection. Nothing changed.');
		return error.message || 'That did not go through. Nothing changed.';
	}
	return 'That did not go through. Nothing changed.';
}

/** New rows slide into place instead of popping (the keyboard's own curve wins if both move). */
function animateRows() {
	LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
}

/** Images riding on a send: what the turn references, and what the bubble shows meanwhile. */
export type ChatSendImages = { attachments: AgentTurnAttachment[]; images: MessageImage[] };

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

	// A turn ended with a failed write: ask whether the session now owes a change (the strip).
	const pendingCheck = state.pendingChangeCheck;
	useEffect(() => {
		if (!chat || !sessionId || pendingCheck === 0) return;
		let cancelled = false;
		void api.chat
			.probePendingChange(sessionId)
			.then((result) => {
				if (!cancelled) store.setPendingChange(result.pendingChange);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [chat, pendingCheck, sessionId, store]);

	const [pendingBusy, setPendingBusy] = useState<'finish' | 'dismiss' | null>(null);
	const dismissPendingChange = useCallback(async () => {
		const view = store.getState().pendingChange;
		const id = store.getState().sessionId;
		if (!view) return;
		if (!chat || !id) {
			store.setPendingChange(null);
			return;
		}
		setPendingBusy('dismiss');
		try {
			await api.chat.dismissPendingChange(id, view.key);
			store.setPendingChange(null);
		} catch (error) {
			store.setError(sendErrorMessage(error));
		} finally {
			setPendingBusy(null);
		}
	}, [chat, store]);

	const chooseProposal = useCallback(
		async (cardId: string, choice: string) => {
			const row = store
				.getState()
				.rows.find(
					(candidate) => candidate.kind === 'card' && candidate.card.card_id === cardId
				);
			if (!row || row.kind !== 'card' || row.busy) return;
			const busy = choice === 'cancel' ? 'cancel' : 'apply';
			store.setCardBusy(cardId, busy);
			if (!chat) {
				// Demo: settle locally so the card's answered state can be seen.
				const resolvedAt = new Date().toISOString();
				store.settleCard(
					cardId,
					{
						...row.card,
						card_resolution: {
							version: 1,
							card_id: cardId,
							kind: row.card.kind,
							choice,
							outcome: choice === 'cancel' ? 'cancelled' : 'applied',
							resolved_at: resolvedAt,
							reason_code: null,
							receipt: null
						}
					},
					choice === 'cancel' ? null : 'Done. You can undo this once.'
				);
				return;
			}
			try {
				const result = await api.chat.chooseProposal(cardId, {
					choice,
					session_id: row.card.session_id
				});
				store.settleCard(
					cardId,
					{ ...row.card, card_resolution: result.resolution },
					result.description.text || null
				);
			} catch (error) {
				store.setCardNote(cardId, proposalErrorMessage(error));
				if (
					isBuildOsApiError(error) &&
					error.code &&
					(PROPOSAL_CARD_CLOSED_CODES as readonly string[]).includes(error.code)
				) {
					// Closed on the server: show it closed rather than inviting another tap.
					store.settleCard(
						cardId,
						{
							...row.card,
							card_resolution: {
								version: 1,
								card_id: cardId,
								kind: row.card.kind,
								choice,
								outcome: 'stale',
								resolved_at: new Date().toISOString(),
								reason_code: error.code,
								receipt: null
							}
						},
						'This proposal has closed.'
					);
				}
			}
		},
		[chat, store]
	);

	const undoProposal = useCallback(
		async (cardId: string) => {
			const row = store
				.getState()
				.rows.find(
					(candidate) => candidate.kind === 'card' && candidate.card.card_id === cardId
				);
			if (!row || row.kind !== 'card' || row.busy) return;
			store.setCardBusy(cardId, 'undo');
			if (!chat) {
				store.settleCard(
					cardId,
					{
						...row.card,
						card_undo: {
							version: 1,
							card_id: cardId,
							kind: row.card.kind,
							outcome: 'undone',
							undone_at: new Date().toISOString(),
							reason_code: null,
							receipt: null
						}
					},
					'Undone.'
				);
				return;
			}
			try {
				const result = await api.chat.undoProposal(cardId, {
					session_id: row.card.session_id
				});
				store.settleCard(
					cardId,
					{ ...row.card, card_undo: result.undo },
					result.description.text || null
				);
			} catch (error) {
				store.setCardNote(cardId, proposalErrorMessage(error));
			}
		},
		[chat, store]
	);

	const undoChange = useCallback(
		async (rowId: string, changeId: string) => {
			const row = store
				.getState()
				.rows.find((candidate) => candidate.kind === 'changes' && candidate.id === rowId);
			if (!row || row.kind !== 'changes' || row.busy || row.undone.includes(changeId)) return;
			const document = row.changes.documents.find((change) => change.id === changeId);
			const table = document
				? null
				: row.changes.tables.find((change) => change.id === changeId);
			if (!document && !table) return;
			store.setChangeBusy(rowId, changeId);
			if (!chat) {
				// Demo: settle locally so the undone state can be seen.
				store.settleChange(rowId, changeId, { undone: true, note: null });
				return;
			}
			try {
				if (document) {
					if (!document.revertPatches?.length) {
						store.settleChange(rowId, changeId, {
							undone: false,
							note: DOCUMENT_UNDO_TOO_LARGE
						});
						return;
					}
					await api.documents.revertChange(document.documentId, {
						revert_patches: document.revertPatches,
						before_hash: document.beforeHash,
						expected_after_hash: document.afterHash
					});
				} else if (table) {
					await api.tables.revertChange(
						table.documentId,
						table.receipts.length === 1
							? { receipt: table.receipts[0]! }
							: { receipts: table.receipts }
					);
				}
				store.settleChange(rowId, changeId, { undone: true, note: null });
			} catch (error) {
				store.settleChange(rowId, changeId, {
					undone: false,
					note: undoErrorMessage(error, document ? 'document' : 'table')
				});
			}
		},
		[chat, store]
	);

	const send = useCallback(
		async (text: string, attach?: ChatSendImages) => {
			const message = text.trim();
			const attachments = attach?.attachments ?? [];
			if (!message && attachments.length === 0) return;
			if (store.getState().activeTurn) {
				store.setError(BUSY_MESSAGE);
				return;
			}
			animateRows();
			const shown = message || attachedLine(attachments.length);
			const images = attach?.images;
			if (!chat) {
				demoCancel.current = runDemoTurn(store, shown, { images });
				return;
			}
			const clientTurnId = newChatId('turn');
			const streamRunId = newChatId('stream');
			store.addUserMessage({ clientTurnId, text: shown, images });
			try {
				const admission = await api.agent.sendTurn({
					clientTurnId,
					streamRunId,
					sessionId: store.getState().sessionId,
					context: turnContextFor(target),
					message,
					...(attachments.length ? { attachments } : {}),
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

	const finishPendingChange = useCallback(async () => {
		setPendingBusy('finish');
		try {
			await send(PENDING_CHANGE_FINISH_MESSAGE);
		} finally {
			setPendingBusy(null);
		}
	}, [send]);

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
		sessionId: chat
			? sessionId
			: demoEpoch === 0 && demo && demoHasSession(demo)
				? 'demo'
				: null,
		rows: state.rows,
		activeTurn: state.activeTurn,
		error: state.error,
		pendingChange: state.pendingChange,
		loading,
		send,
		stop,
		startNew,
		open,
		clearError: () => store.setError(null),
		pendingBusy,
		dismissPendingChange,
		finishPendingChange,
		chooseProposal,
		undoProposal,
		undoChange
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
