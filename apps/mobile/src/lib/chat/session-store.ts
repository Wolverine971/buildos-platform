// apps/mobile/src/lib/chat/session-store.ts
/**
 * One chat session's screen state, and the port the shared chat core drives it through.
 *
 * `@buildos/agentic-chat-client` owns the hard parts (ordering realtime events, reconciling
 * against the durable log, re-attaching to running turns). It talks to a screen through
 * `AgentChatWorkerUiAdapterPort`; this store implements that port over a flat list of rows:
 * what the person said, what the agent is doing (a work row, folded when done), what it
 * answered. Stores outlive screens, so a reply keeps arriving while the chat is closed.
 */
import {
	WORKER_CONNECTION_LOST_FAILURE_CODE,
	WORKER_CONNECTION_LOST_MESSAGE,
	WORKER_QUEUE_TIMEOUT_FINISHED_REASON,
	WORKER_QUEUE_TIMEOUT_MESSAGE,
	type AgentChatWorkerUiAdapterPort
} from '@buildos/agentic-chat-client';
import type { ChatPendingChange, ChatSessionHistoryResponse } from '@buildos/api-client';
import type { AgentSSEMessage, ChatTurnStatusV1, TurnHandleV1 } from '@buildos/shared-types';

import { newChatId } from './ids';
import { toolLine } from './tool-lines';

export type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

export type WorkStep = {
	id: string;
	verb: string;
	target: string | null;
	status: 'pending' | 'completed' | 'failed';
	toolCallId: string | null;
};

export type UserRow = {
	kind: 'user';
	/** The client turn id of the send, so admission can mark it delivered. */
	id: string;
	text: string;
	at: number;
	delivery: 'sending' | 'sent' | 'failed';
};

export type AssistantRow = {
	kind: 'assistant';
	id: string;
	/** The persisted chat_messages row, once known. */
	messageId: string | null;
	turnRunId: string | null;
	text: string;
	/** Display-only live text after `text`; never saved. */
	preview: string | null;
	at: number;
	status: 'streaming' | 'done' | 'stopped' | 'failed';
};

export type WorkRow = {
	kind: 'work';
	id: string;
	turnRunId: string | null;
	clientTurnId: string | null;
	startedAt: number;
	endedAt: number | null;
	status: 'active' | 'completed' | 'cancelled' | 'error';
	/** The agent asked a question and is waiting. */
	waiting: boolean;
	activity: string | null;
	steps: WorkStep[];
	stopRequested: boolean;
	connectionLost: boolean;
};

export type ChatRow = UserRow | AssistantRow | WorkRow;

export type ChatSessionState = {
	sessionId: string | null;
	/** History has been read for this session (or it is a new chat). */
	loaded: boolean;
	rows: ChatRow[];
	activeTurn: WorkerTurnHandle | null;
	error: string | null;
	pendingChange: ChatPendingChange | null;
};

export type SessionStore = ReturnType<typeof createSessionStore>;

const GENERIC_FAILURE = 'Something went wrong with that reply. Try sending it again.';

function parseTime(value: string | null | undefined, fallback: number): number {
	const parsed = value ? Date.parse(value) : Number.NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}

function failureMessage(finishedReason: string | null, failureCode: string | null): string {
	if (failureCode === WORKER_CONNECTION_LOST_FAILURE_CODE) return WORKER_CONNECTION_LOST_MESSAGE;
	if (finishedReason === WORKER_QUEUE_TIMEOUT_FINISHED_REASON)
		return WORKER_QUEUE_TIMEOUT_MESSAGE;
	return GENERIC_FAILURE;
}

function devWarn(message: string, error: unknown) {
	if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(message, error);
}

export function createSessionStore(
	init: { sessionId?: string | null; now?: () => number; makeId?: () => string } = {}
) {
	const now = init.now ?? Date.now;
	const makeId = init.makeId ?? (() => newChatId('row'));
	let state: ChatSessionState = {
		sessionId: init.sessionId ?? null,
		loaded: !init.sessionId,
		rows: [],
		activeTurn: null,
		error: null,
		pendingChange: null
	};
	const listeners = new Set<() => void>();

	const set = (patch: Partial<ChatSessionState>) => {
		state = { ...state, ...patch };
		for (const listener of listeners) listener();
	};
	const updateRows = (update: (rows: ChatRow[]) => ChatRow[]) =>
		set({ rows: update(state.rows) });

	const workIndex = (handle: { turnRunId: string; clientTurnId?: string | null }) => {
		const byTurn = state.rows.findIndex(
			(row) => row.kind === 'work' && row.turnRunId === handle.turnRunId
		);
		if (byTurn >= 0 || !handle.clientTurnId) return byTurn;
		return state.rows.findIndex(
			(row) =>
				row.kind === 'work' &&
				row.turnRunId === null &&
				row.clientTurnId === handle.clientTurnId
		);
	};
	const patchWork = (
		handle: { turnRunId: string; clientTurnId?: string | null },
		patch: Partial<WorkRow> | ((row: WorkRow) => Partial<WorkRow>)
	) => {
		const index = workIndex(handle);
		if (index < 0) return false;
		updateRows((rows) => {
			const row = rows[index] as WorkRow;
			const next = [...rows];
			next[index] = { ...row, ...(typeof patch === 'function' ? patch(row) : patch) };
			return next;
		});
		return true;
	};
	const assistantIndex = (turnRunId: string) =>
		state.rows.findIndex((row) => row.kind === 'assistant' && row.turnRunId === turnRunId);
	const patchAssistant = (
		turnRunId: string,
		patch: Partial<AssistantRow> | ((row: AssistantRow) => Partial<AssistantRow>)
	) => {
		const index = assistantIndex(turnRunId);
		if (index < 0) return false;
		updateRows((rows) => {
			const row = rows[index] as AssistantRow;
			const next = [...rows];
			next[index] = { ...row, ...(typeof patch === 'function' ? patch(row) : patch) };
			return next;
		});
		return true;
	};
	const patchStep = (turnRunId: string, toolCallId: string, patch: Partial<WorkStep>) =>
		patchWork({ turnRunId }, (row) => ({
			steps: row.steps.map((step) =>
				step.toolCallId === toolCallId ? { ...step, ...patch } : step
			)
		}));

	const port: AgentChatWorkerUiAdapterPort = {
		beginGeneration({ handle, status }) {
			const index = workIndex(handle);
			const at = now();
			updateRows((rows) => {
				const next = [...rows];
				const existing = index >= 0 ? (rows[index] as WorkRow) : null;
				const work: WorkRow = existing
					? {
							...existing,
							turnRunId: handle.turnRunId,
							clientTurnId: handle.clientTurnId,
							status: 'active',
							endedAt: null,
							stopRequested: false,
							activity: existing.turnRunId ? existing.activity : null
						}
					: {
							kind: 'work',
							id: makeId(),
							turnRunId: handle.turnRunId,
							clientTurnId: handle.clientTurnId,
							startedAt: at,
							endedAt: null,
							status: 'active',
							waiting: false,
							activity: null,
							steps: [],
							stopRequested: false,
							connectionLost: false
						};
				const workAt = index >= 0 ? index : next.length;
				if (index >= 0) next[index] = work;
				else next.push(work);
				const answerAt = next.findIndex(
					(row) => row.kind === 'assistant' && row.turnRunId === handle.turnRunId
				);
				if (answerAt >= 0) {
					next[answerAt] = { ...(next[answerAt] as AssistantRow), status: 'streaming' };
				} else {
					next.splice(workAt + 1, 0, {
						kind: 'assistant',
						id: makeId(),
						messageId: null,
						turnRunId: handle.turnRunId,
						text: '',
						preview: null,
						at,
						status: 'streaming'
					});
				}
				return next.map((row) =>
					row.kind === 'user' &&
					row.id === handle.clientTurnId &&
					row.delivery === 'sending'
						? { ...row, delivery: 'sent' }
						: row
				);
			});
			const terminal =
				status === 'completed' || status === 'failed' || status === 'cancelled';
			if (!terminal) set({ activeTurn: handle, error: null });
		},
		replaceAssistantSnapshot({ handle, text, assistantMessage }) {
			patchAssistant(handle.turnRunId, {
				text,
				preview: null,
				messageId: assistantMessage?.id ?? null
			});
		},
		appendAssistantText({ handle, text }) {
			patchAssistant(handle.turnRunId, (row) => ({ text: row.text + text }));
		},
		applySemanticEvent(event: AgentSSEMessage) {
			const turnRunId = event.turn_run_id;
			if (!turnRunId) return;
			switch (event.type) {
				case 'tool_call': {
					const call = event.tool_call;
					const toolCallId = call?.id ?? null;
					const line = toolLine(
						call?.function?.name ?? 'unknown',
						call?.function?.arguments
					);
					patchWork({ turnRunId }, (row) => {
						if (
							toolCallId &&
							row.steps.some((step) => step.toolCallId === toolCallId)
						) {
							return {};
						}
						return {
							steps: [
								...row.steps,
								{
									id: makeId(),
									verb: line.verb,
									target: line.target,
									status: 'pending',
									toolCallId
								}
							],
							activity: line.verb,
							waiting: false
						};
					});
					return;
				}
				case 'tool_result': {
					const result = event.result ?? {};
					const toolCallId =
						typeof result.tool_call_id === 'string' ? result.tool_call_id : null;
					if (!toolCallId) return;
					patchStep(turnRunId, toolCallId, {
						status: result.success === false ? 'failed' : 'completed'
					});
					return;
				}
				case 'tool_progress':
					patchWork({ turnRunId }, { activity: event.message });
					return;
				case 'agent_state': {
					const waiting = event.state === 'waiting_on_user';
					patchWork({ turnRunId }, (row) => ({
						waiting,
						activity: waiting ? row.activity : (event.details ?? row.activity)
					}));
					return;
				}
				case 'turn_phase':
					patchWork({ turnRunId }, { activity: event.message });
					return;
				case 'error':
					set({ error: event.error || GENERIC_FAILURE });
					return;
				default:
					return;
			}
		},
		updateTurnState({ handle, currentActivity }) {
			patchWork(handle, { activity: currentActivity, waiting: false });
		},
		finishTurn({ handle, status, finishedReason, failureCode }) {
			const at = now();
			patchWork(handle, {
				status: status === 'failed' ? 'error' : status,
				endedAt: at,
				stopRequested: false,
				waiting: false,
				activity: null
			});
			const index = assistantIndex(handle.turnRunId);
			if (index >= 0) {
				updateRows((rows) => {
					const row = rows[index] as AssistantRow;
					const text = row.text + (status === 'cancelled' ? (row.preview ?? '') : '');
					if (!text.trim()) return rows.filter((_, position) => position !== index);
					const next = [...rows];
					next[index] = {
						...row,
						text,
						preview: null,
						status:
							status === 'completed'
								? 'done'
								: status === 'cancelled'
									? 'stopped'
									: 'failed'
					};
					return next;
				});
			}
			const patch: Partial<ChatSessionState> = {};
			if (state.activeTurn?.turnRunId === handle.turnRunId) patch.activeTurn = null;
			if (status === 'failed') patch.error = failureMessage(finishedReason, failureCode);
			set(patch);
		},
		setAssistantPreview({ handle, text }) {
			patchAssistant(handle.turnRunId, { preview: text });
		},
		freezeAssistantPreview({ handle, text }) {
			patchAssistant(handle.turnRunId, (row) => ({ text: row.text + text, preview: null }));
		},
		isStopRequested(handle) {
			const index = workIndex(handle);
			return index >= 0 ? (state.rows[index] as WorkRow).stopRequested : false;
		},
		setConnectionLost({ handle, lost }) {
			patchWork(handle, { connectionLost: lost });
		},
		onError(error) {
			devWarn('[chat] worker projection degraded', error);
		}
	};

	return {
		port,
		getState: () => state,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setSessionId(sessionId: string) {
			if (state.sessionId !== sessionId) set({ sessionId });
		},
		setError(error: string | null) {
			set({ error });
		},
		/** The person pressed Send: their words appear at once, with a work row waiting on admission. */
		addUserMessage(input: { clientTurnId: string; text: string }) {
			const at = now();
			updateRows((rows) => [
				...rows,
				{ kind: 'user', id: input.clientTurnId, text: input.text, at, delivery: 'sending' },
				{
					kind: 'work',
					id: makeId(),
					turnRunId: null,
					clientTurnId: input.clientTurnId,
					startedAt: at,
					endedAt: null,
					status: 'active',
					waiting: false,
					activity: 'Sending',
					steps: [],
					stopRequested: false,
					connectionLost: false
				}
			]);
			set({ error: null });
		},
		/** Admission failed: keep the words (marked), drop the waiting work row, say why. */
		markFailed(clientTurnId: string, message: string) {
			updateRows((rows) =>
				rows
					.filter(
						(row) =>
							!(
								row.kind === 'work' &&
								row.turnRunId === null &&
								row.clientTurnId === clientTurnId
							)
					)
					.map((row) =>
						row.kind === 'user' && row.id === clientTurnId
							? { ...row, delivery: 'failed' as const }
							: row
					)
			);
			set({ error: message });
		},
		/** The route admitted the turn (or discovery found it running): own it until it ends. */
		adoptHandle(handle: WorkerTurnHandle, status: ChatTurnStatusV1) {
			const terminal =
				status === 'completed' || status === 'failed' || status === 'cancelled';
			patchWork(handle, {
				turnRunId: handle.turnRunId,
				activity: status === 'queued' ? 'Starting' : null
			});
			updateRows((rows) =>
				rows.map((row) =>
					row.kind === 'user' &&
					row.id === handle.clientTurnId &&
					row.delivery === 'sending'
						? { ...row, delivery: 'sent' }
						: row
				)
			);
			set({ activeTurn: terminal ? null : handle });
		},
		requestStop(turnRunId: string, requested = true) {
			patchWork({ turnRunId }, { stopRequested: requested });
		},
		/** Install a session's stored history: messages in order, each turn's work folded before its answer. */
		restore(history: ChatSessionHistoryResponse): { activeTurnRunIds: string[] } {
			const messageRows: Array<{ at: number; order: number; row: ChatRow }> = [];
			let fallback = 0;
			for (const message of history.messages) {
				const at = parseTime(message.created_at, fallback);
				fallback = at + 1;
				const text = (message.content ?? '').trim();
				if (message.role === 'user') {
					messageRows.push({
						at,
						order: 0,
						row: { kind: 'user', id: message.id, text, at, delivery: 'sent' }
					});
				} else if (message.role === 'assistant' && text) {
					const metadata = (message.metadata ?? null) as Record<string, unknown> | null;
					messageRows.push({
						at,
						order: 2,
						row: {
							kind: 'assistant',
							id: message.id,
							messageId: message.id,
							turnRunId:
								typeof metadata?.turn_run_id === 'string'
									? metadata.turn_run_id
									: null,
							text,
							preview: null,
							at,
							status: 'done'
						}
					});
				}
			}
			const activeTurnRunIds: string[] = [];
			const workRows: Array<{
				at: number;
				order: number;
				row: WorkRow;
				answerId: string | null;
			}> = [];
			for (const run of history.turnRuns) {
				const active = run.status === 'queued' || run.status === 'running';
				if (active) activeTurnRunIds.push(run.id);
				const steps: WorkStep[] = history.timelineItems
					.filter((item) => item.kind === 'tool' && item.turnRunId === run.id)
					.map((item) => ({
						id: item.id,
						verb: item.title,
						target: item.summary ?? null,
						status:
							item.status === 'failed'
								? 'failed'
								: active && (item.status === 'running' || item.status === 'pending')
									? 'pending'
									: 'completed',
						toolCallId: null
					}));
				const startedAt = parseTime(run.started_at ?? run.created_at, 0);
				const endedAt = run.finished_at ? parseTime(run.finished_at, startedAt) : null;
				const status: WorkRow['status'] = active
					? 'active'
					: run.status === 'failed'
						? 'error'
						: run.status === 'cancelled'
							? 'cancelled'
							: 'completed';
				// A finished turn with no visible work has nothing to fold; its answer speaks.
				if (!active && steps.length === 0) continue;
				workRows.push({
					at: startedAt,
					order: 1,
					answerId: run.assistant_message_id ?? null,
					row: {
						kind: 'work',
						id: `work:${run.id}`,
						turnRunId: run.id,
						clientTurnId: run.client_turn_id ?? null,
						startedAt,
						endedAt,
						status,
						waiting: false,
						activity: null,
						steps,
						stopRequested: false,
						connectionLost: false
					}
				});
			}
			const merged = [
				...messageRows,
				...workRows.filter(
					(work) => !work.answerId || !messageRows.some((m) => m.row.id === work.answerId)
				)
			]
				.sort((a, b) => a.at - b.at || a.order - b.order)
				.map((entry) => entry.row);
			// Work that produced a stored answer sits right above that answer.
			for (const work of workRows) {
				if (!work.answerId) continue;
				const answerAt = merged.findIndex((row) => row.id === work.answerId);
				if (answerAt >= 0) merged.splice(answerAt, 0, work.row);
			}
			set({
				sessionId: history.session.id,
				loaded: true,
				rows: merged,
				pendingChange: history.pendingChange ?? null,
				error: null
			});
			return { activeTurnRunIds };
		}
	};
}
