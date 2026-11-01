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

import {
	type ChangeReceipts,
	changesFromExecutions,
	collectReceipts,
	emptyReceipts,
	hasChanges,
	mergeChanges,
	type TurnChanges
} from './changes';
import { newChatId } from './ids';
import { parseProposalCard, proposalProgress, type ProposalCard } from './proposals';
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

/** A proposal the agent is waiting on (nest, combine, file, start); see lib/chat/proposals.ts. */
export type CardRow = {
	kind: 'card';
	/** `card:<card_id>`. */
	id: string;
	turnRunId: string | null;
	at: number;
	card: ProposalCard;
	/** What the last answer said ("Filed 2 items into Launch"), shown in place of the state. */
	note: string | null;
	busy: 'apply' | 'cancel' | 'undo' | null;
};

/** What a finished turn changed: chips for what it created, cards for what it edited; see lib/chat/changes.ts. */
export type ChangesRow = {
	kind: 'changes';
	/** `changes:<turn run id>`. */
	id: string;
	turnRunId: string | null;
	at: number;
	changes: TurnChanges;
	/** Document and table change ids whose Undo went through. */
	undone: string[];
	/** Per change id: what the last Undo attempt said ("The text has changed since…"). */
	notes: Record<string, string>;
	/** The change id whose Undo is in flight. */
	busy: string | null;
};

export type ChatRow = UserRow | AssistantRow | WorkRow | CardRow | ChangesRow;

export type ChatSessionState = {
	sessionId: string | null;
	/** History has been read for this session (or it is a new chat). */
	loaded: boolean;
	rows: ChatRow[];
	activeTurn: WorkerTurnHandle | null;
	error: string | null;
	pendingChange: ChatPendingChange | null;
	/** Bumped when a turn ends with a failed step: time to ask the server for the strip again. */
	pendingChangeCheck: number;
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
		pendingChange: null,
		pendingChangeCheck: 0
	};
	const listeners = new Set<() => void>();
	// Tool calls by id (name and arguments), so a result can be read for what it created.
	const calls = new Map<string, { name: string; args: unknown }>();
	// Receipts gathered per running turn; merged into one changes row when the turn ends.
	const receiptsByTurn = new Map<string, ChangeReceipts>();
	// Ids of entities already shown as created this conversation (a replay adds no second chip).
	const seenCreated = new Set<string>();

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

	/**
	 * A card arrived (or a later copy with its decision/undo): keep the furthest-along copy, in
	 * place; a new card lands right after its turn's work row so it reads as part of that turn.
	 */
	const upsertCard = (card: ProposalCard, turnRunId: string | null, at: number) => {
		const id = `card:${card.card_id}`;
		updateRows((rows) => {
			const index = rows.findIndex((row) => row.kind === 'card' && row.id === id);
			if (index >= 0) {
				const existing = rows[index] as CardRow;
				if (proposalProgress(card) < proposalProgress(existing.card)) return rows;
				const next = [...rows];
				next[index] = { ...existing, card };
				return next;
			}
			const row: CardRow = { kind: 'card', id, turnRunId, at, card, note: null, busy: null };
			const workAt = turnRunId
				? rows.findIndex(
						(candidate) =>
							candidate.kind === 'work' && candidate.turnRunId === turnRunId
					)
				: -1;
			const next = [...rows];
			next.splice(workAt >= 0 ? workAt + 1 : next.length, 0, row);
			return next;
		});
	};
	/** The index just past the last row that belongs to a turn (its work, card and answer rows). */
	const afterTurn = (rows: ChatRow[], turnRunId: string): number => {
		let last = -1;
		rows.forEach((row, index) => {
			if (row.kind !== 'user' && row.turnRunId === turnRunId) last = index;
		});
		return last >= 0 ? last + 1 : rows.length;
	};
	/** The turn ended: everything it changed becomes one row at the end of the turn. */
	const flushChanges = (turnRunId: string, at: number) => {
		const receipts = receiptsByTurn.get(turnRunId);
		receiptsByTurn.delete(turnRunId);
		if (!receipts) return;
		const changes = mergeChanges(receipts);
		if (!hasChanges(changes)) return;
		const id = `changes:${turnRunId}`;
		updateRows((rows) => {
			if (rows.some((row) => row.id === id)) return rows;
			const next = [...rows];
			next.splice(afterTurn(next, turnRunId), 0, {
				kind: 'changes',
				id,
				turnRunId,
				at,
				changes,
				undone: [],
				notes: {},
				busy: null
			});
			return next;
		});
	};
	const patchChanges = (rowId: string, patch: (row: ChangesRow) => Partial<ChangesRow>) =>
		updateRows((rows) =>
			rows.map((row) =>
				row.kind === 'changes' && row.id === rowId ? { ...row, ...patch(row) } : row
			)
		);
	const patchCard = (cardId: string, patch: Partial<CardRow>) =>
		updateRows((rows) =>
			rows.map((row) =>
				row.kind === 'card' && row.card.card_id === cardId ? { ...row, ...patch } : row
			)
		);

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
					if (toolCallId && call?.function?.name) {
						calls.set(toolCallId, {
							name: call.function.name,
							args: call.function.arguments
						});
					}
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
					if (toolCallId) {
						patchStep(turnRunId, toolCallId, {
							status: result.success === false ? 'failed' : 'completed'
						});
					}
					if (result.success !== false) {
						const call = toolCallId ? calls.get(toolCallId) : undefined;
						const receipts = receiptsByTurn.get(turnRunId) ?? emptyReceipts();
						collectReceipts(receipts, call?.name, call?.args, result, seenCreated);
						receiptsByTurn.set(turnRunId, receipts);
					}
					const card = parseProposalCard(result);
					if (card) upsertCard(card, turnRunId, now());
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
			flushChanges(handle.turnRunId, at);
			const patch: Partial<ChatSessionState> = {};
			if (state.activeTurn?.turnRunId === handle.turnRunId) patch.activeTurn = null;
			if (status === 'failed') patch.error = failureMessage(finishedReason, failureCode);
			// A failed write leaves a commission on the session; the screen re-reads the strip.
			const workAt = workIndex(handle);
			const failedStep =
				workAt >= 0 &&
				(state.rows[workAt] as WorkRow).steps.some((step) => step.status === 'failed');
			if (status === 'failed' || failedStep)
				patch.pendingChangeCheck = state.pendingChangeCheck + 1;
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
		setPendingChange(view: ChatPendingChange | null) {
			set({ pendingChange: view });
		},
		setCardBusy(cardId: string, busy: CardRow['busy']) {
			patchCard(cardId, { busy });
		},
		/** The server answered a choice or an undo: show its outcome and its one-line receipt. */
		settleCard(cardId: string, card: ProposalCard, note: string | null) {
			patchCard(cardId, { card, note, busy: null });
		},
		setCardNote(cardId: string, note: string | null) {
			patchCard(cardId, { note, busy: null });
		},
		setChangeBusy(rowId: string, changeId: string | null) {
			patchChanges(rowId, () => ({ busy: changeId }));
		},
		/** An Undo came back: mark the change undone, or keep its note for the person to read. */
		settleChange(
			rowId: string,
			changeId: string,
			outcome: { undone: boolean; note: string | null }
		) {
			patchChanges(rowId, (row) => {
				const notes = { ...row.notes };
				if (outcome.note) notes[changeId] = outcome.note;
				else delete notes[changeId];
				return {
					busy: null,
					notes,
					undone:
						outcome.undone && !row.undone.includes(changeId)
							? [...row.undone, changeId]
							: row.undone
				};
			});
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
			// Proposal cards ride in tool results; each sits right after its turn's work row.
			const seen = new Map<string, number>();
			for (const execution of history.toolExecutions) {
				const card = parseProposalCard(execution.result);
				if (!card) continue;
				const id = `card:${card.card_id}`;
				const at = parseTime(execution.created_at, 0);
				const row: CardRow = {
					kind: 'card',
					id,
					turnRunId: execution.turn_run_id ?? null,
					at,
					card,
					note: null,
					busy: null
				};
				const existingAt = seen.get(id);
				if (existingAt !== undefined) {
					const existing = merged[existingAt] as CardRow;
					if (proposalProgress(card) >= proposalProgress(existing.card))
						merged[existingAt] = row;
					continue;
				}
				const workAt = merged.findIndex(
					(candidate) =>
						candidate.kind === 'work' && candidate.turnRunId === row.turnRunId
				);
				const answerAt = merged.findIndex(
					(candidate) =>
						candidate.kind === 'assistant' && candidate.turnRunId === row.turnRunId
				);
				const insertAt =
					workAt >= 0 ? workAt + 1 : answerAt >= 0 ? answerAt : merged.length;
				merged.splice(insertAt, 0, row);
				seen.clear();
				merged.forEach((candidate, index) => {
					if (candidate.kind === 'card') seen.set(candidate.id, index);
				});
			}
			// What each turn changed, read back from its stored tool results, at the end of the turn.
			seenCreated.clear();
			for (const run of history.turnRuns) {
				const executions = history.toolExecutions.filter(
					(execution) => execution.turn_run_id === run.id
				);
				if (executions.length === 0) continue;
				const changes = changesFromExecutions(executions, seenCreated);
				if (!hasChanges(changes)) continue;
				const id = `changes:${run.id}`;
				if (merged.some((row) => row.id === id)) continue;
				merged.splice(afterTurn(merged, run.id), 0, {
					kind: 'changes',
					id,
					turnRunId: run.id,
					at: parseTime(run.finished_at ?? run.created_at, 0),
					changes,
					undone: [],
					notes: {},
					busy: null
				});
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
