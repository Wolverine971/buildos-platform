// apps/mobile/src/lib/chat/demo.ts
/**
 * A scripted chat for looking at the screen without spending a turn: `/chat?demo=<state>` in
 * dev seeds a store with one of these states, and Send runs a fake turn through the same
 * port the realtime core drives. Pure, so vitest can replay it with a fake scheduler.
 */
import type { ChatSessionHistoryResponse, ChatSummary } from '@buildos/api-client';
import type { AgentSSEMessage } from '@buildos/shared-types';

import { newChatId } from './ids';
import type { SessionStore, WorkerTurnHandle } from './session-store';

export type DemoState = 'idle' | 'history' | 'streaming' | 'done' | 'live';

const DEMO_STATES: ReadonlySet<string> = new Set(['idle', 'history', 'streaming', 'done', 'live']);

export function parseDemoParam(value: string | string[] | undefined): DemoState | null {
	const one = Array.isArray(value) ? value[0] : value;
	if (!one) return null;
	if (one === '1') return 'live';
	return DEMO_STATES.has(one) ? (one as DemoState) : null;
}

const SESSION_ID = 'dddddddd-0000-4000-8000-00000000d3e0';
const RUN_1 = 'dddddddd-0000-4000-8000-00000000a001';
const RUN_2 = 'dddddddd-0000-4000-8000-00000000a002';

function demoHandle(turnRunId: string, clientTurnId: string): WorkerTurnHandle {
	return {
		contractVersion: 'agentic_chat_worker_v1',
		executionMode: 'worker_realtime',
		streamRunId: `stream_${clientTurnId}`,
		clientTurnId,
		sessionId: SESSION_ID,
		turnRunId
	};
}

const minutesAgo = (now: number, minutes: number) => new Date(now - minutes * 60_000).toISOString();

/** Two finished turns, as `GET /api/chat/sessions/[id]` would return them. */
export function demoHistory(now: number): ChatSessionHistoryResponse {
	return {
		session: { id: SESSION_ID, title: 'Launch week', context_type: 'global' },
		messages: [
			{
				id: 'm1',
				role: 'user',
				content: "What's still open for the launch this week?",
				created_at: minutesAgo(now, 42)
			},
			{
				id: 'm2',
				role: 'assistant',
				content:
					'Three things are still open:\n\n1. **Landing page copy** — the hero is drafted, the pricing section is empty.\n2. **Beta email** — written, not scheduled.\n3. **App Store screenshots** — nothing yet.\n\nThe screenshots are the long pole; want me to make them a task for tomorrow morning?',
				created_at: minutesAgo(now, 41),
				metadata: { turn_run_id: RUN_1 }
			},
			{
				id: 'm3',
				role: 'user',
				content: 'Yes, tomorrow at 9.',
				created_at: minutesAgo(now, 40)
			},
			{
				id: 'm4',
				role: 'assistant',
				content:
					'Done. **App Store screenshots** is on tomorrow at 9:00, under Launch, with the three sizes Apple asks for in the description.',
				created_at: minutesAgo(now, 39),
				metadata: { turn_run_id: RUN_2 }
			}
		],
		toolExecutions: [],
		turnRuns: [
			{
				id: RUN_1,
				session_id: SESSION_ID,
				user_id: 'u',
				stream_run_id: 's1',
				client_turn_id: 'c1',
				status: 'completed',
				finished_reason: 'stop',
				request_message: null,
				assistant_message_id: 'm2',
				started_at: minutesAgo(now, 41.6),
				finished_at: minutesAgo(now, 41.2),
				created_at: minutesAgo(now, 41.7),
				updated_at: minutesAgo(now, 41.2)
			},
			{
				id: RUN_2,
				session_id: SESSION_ID,
				user_id: 'u',
				stream_run_id: 's2',
				client_turn_id: 'c2',
				status: 'completed',
				finished_reason: 'stop',
				request_message: null,
				assistant_message_id: 'm4',
				started_at: minutesAgo(now, 39.8),
				finished_at: minutesAgo(now, 39.5),
				created_at: minutesAgo(now, 39.9),
				updated_at: minutesAgo(now, 39.5)
			}
		],
		timelineItems: [
			{
				id: 't1',
				sessionId: SESSION_ID,
				turnRunId: RUN_1,
				source: 'tool_execution',
				kind: 'tool',
				status: 'completed',
				timestamp: minutesAgo(now, 41.5),
				title: 'Listing tasks',
				summary: 'Launch',
				entityRefs: []
			},
			{
				id: 't2',
				sessionId: SESSION_ID,
				turnRunId: RUN_1,
				source: 'tool_execution',
				kind: 'tool',
				status: 'completed',
				timestamp: minutesAgo(now, 41.4),
				title: 'Reading document',
				summary: 'Launch checklist',
				entityRefs: []
			},
			{
				id: 't3',
				sessionId: SESSION_ID,
				turnRunId: RUN_2,
				source: 'tool_execution',
				kind: 'tool',
				status: 'completed',
				timestamp: minutesAgo(now, 39.7),
				title: 'Creating task',
				summary: 'App Store screenshots',
				entityRefs: []
			}
		],
		voiceNoteGroups: [],
		voiceNotes: [],
		truncated: false,
		historyWindow: {
			messageLimit: 60,
			toolLimit: 120,
			eventLimit: 400,
			toolsTruncated: false,
			eventsTruncated: false,
			oldestMessageId: 'm1'
		},
		pendingChange: null
	} as unknown as ChatSessionHistoryResponse;
}

/** Earlier chats for the history sheet. */
export function demoChats(now: number): ChatSummary[] {
	const chat = (
		id: string,
		title: string,
		minutes: number,
		count: number,
		focus: string | null
	) =>
		({
			id,
			title,
			summary: null,
			chat_topics: [],
			context_type: 'global',
			entity_id: null,
			message_count: count,
			status: 'active',
			focus_label: focus,
			focus_type: focus ? 'task' : null,
			created_at: minutesAgo(now, minutes + 30),
			updated_at: minutesAgo(now, minutes),
			last_message_at: minutesAgo(now, minutes),
			last_activity_at: minutesAgo(now, minutes)
		}) as ChatSummary;
	return [
		chat(SESSION_ID, 'Launch week', 39, 4, null),
		chat(
			'dddddddd-0000-4000-8000-00000000c002',
			'Pricing page: three tiers or two',
			180,
			9,
			null
		),
		chat('dddddddd-0000-4000-8000-00000000c003', 'Beta email draft', 1500, 6, 'Beta email'),
		chat('dddddddd-0000-4000-8000-00000000c004', 'What did I ship in October', 4300, 3, null)
	];
}

const LIVE_ANSWER =
	"Here's your morning in one pass.\n\n" +
	'**First, the launch.** The screenshots task is at 9:00; the pricing section is still the one empty spot on the landing page, so I put a 30‑minute block after it.\n\n' +
	'**Then two quick wins:** reply to Priya about the beta list, and archive the three projects you have not opened since September.\n\n' +
	'Want me to move anything?';

const STEPS: Array<{ name: string; args: Record<string, unknown> }> = [
	{ name: 'list_onto_tasks', args: { query: 'today' } },
	{ name: 'get_onto_project_details', args: { title: 'Launch' } },
	{ name: 'search_onto_documents', args: { query: 'pricing section' } }
];

function semantic(turnRunId: string, event: Record<string, unknown>): AgentSSEMessage {
	return { turn_run_id: turnRunId, ...event } as unknown as AgentSSEMessage;
}

export type Scheduler = (run: () => void, delayMs: number) => () => void;

const defaultScheduler: Scheduler = (run, delayMs) => {
	const timer = setTimeout(run, delayMs);
	return () => clearTimeout(timer);
};

/**
 * Send a message in demo mode: the same port calls the realtime core makes, spread over about
 * five seconds. Returns a cancel (Stop) that ends the turn as cancelled.
 */
export function runDemoTurn(
	store: SessionStore,
	text: string,
	options: { schedule?: Scheduler; now?: () => number } = {}
): () => void {
	const schedule = options.schedule ?? defaultScheduler;
	const clientTurnId = newChatId('turn', options.now?.());
	const handle = demoHandle(newChatId('row', options.now?.()), clientTurnId);
	const cancels: Array<() => void> = [];
	let finished = false;
	const at = (delay: number, run: () => void) => {
		cancels.push(
			schedule(() => {
				if (!finished) run();
			}, delay)
		);
	};

	store.addUserMessage({ clientTurnId, text });
	at(350, () => {
		store.adoptHandle(handle, 'queued');
		store.port.beginGeneration({ handle, executionGeneration: 0, status: 'running' });
		store.port.updateTurnState({ handle, status: 'running', currentActivity: 'Thinking' });
	});
	STEPS.forEach((step, index) => {
		const id = `call_${index + 1}`;
		at(1000 + index * 800, () =>
			store.port.applySemanticEvent(
				semantic(handle.turnRunId, {
					type: 'tool_call',
					tool_call: {
						id,
						type: 'function',
						function: { name: step.name, arguments: JSON.stringify(step.args) }
					}
				})
			)
		);
		at(1550 + index * 800, () =>
			store.port.applySemanticEvent(
				semantic(handle.turnRunId, {
					type: 'tool_result',
					result: { tool_call_id: id, success: true }
				})
			)
		);
	});
	const words = LIVE_ANSWER.split(/(?<=\s)/);
	const chunk = 3;
	let delay = 1000 + STEPS.length * 800 + 300;
	for (let index = 0; index < words.length; index += chunk) {
		const piece = words.slice(index, index + chunk).join('');
		at(delay, () =>
			store.port.appendAssistantText({ handle, executionGeneration: 0, text: piece })
		);
		delay += 70;
	}
	at(delay + 200, () => {
		finished = true;
		store.port.finishTurn({
			handle,
			status: 'completed',
			finishedReason: 'stop',
			failureCode: null
		});
	});

	return () => {
		if (finished) return;
		finished = true;
		for (const cancel of cancels) cancel();
		store.requestStop(handle.turnRunId);
		store.port.finishTurn({
			handle,
			status: 'cancelled',
			finishedReason: 'user_cancelled',
			failureCode: null
		});
	};
}

/** Put a store into one of the demo states. `live` is `history` plus a running turn you can watch. */
export function seedDemo(
	store: SessionStore,
	state: DemoState,
	options: {
		now?: () => number;
		schedule?: Scheduler;
		/** The store's clock offset, so a seeded turn spans seconds instead of one instant. */
		skew?: { ms: number };
	} = {}
): void {
	const now = options.now ?? Date.now;
	if (state === 'idle') return;
	store.restore(demoHistory(now()));
	if (state === 'history') return;
	if (state === 'live') {
		runDemoTurn(store, 'Plan my morning around the launch.', options);
		return;
	}
	const handle = demoHandle(newChatId('row', now()), newChatId('turn', now()));
	if (options.skew) options.skew.ms = -23_000;
	store.addUserMessage({
		clientTurnId: handle.clientTurnId,
		text: 'Plan my morning around the launch.'
	});
	store.adoptHandle(handle, 'queued');
	store.port.beginGeneration({ handle, executionGeneration: 0, status: 'running' });
	STEPS.forEach((step, index) => {
		const id = `call_${index + 1}`;
		store.port.applySemanticEvent(
			semantic(handle.turnRunId, {
				type: 'tool_call',
				tool_call: {
					id,
					type: 'function',
					function: { name: step.name, arguments: JSON.stringify(step.args) }
				}
			})
		);
		if (state === 'done' || index < STEPS.length - 1) {
			store.port.applySemanticEvent(
				semantic(handle.turnRunId, {
					type: 'tool_result',
					result: { tool_call_id: id, success: true }
				})
			);
		}
	});
	if (options.skew) options.skew.ms = 0;
	if (state === 'streaming') {
		store.port.appendAssistantText({
			handle,
			executionGeneration: 0,
			text: LIVE_ANSWER.slice(0, 140)
		});
		return;
	}
	store.port.appendAssistantText({ handle, executionGeneration: 0, text: LIVE_ANSWER });
	store.port.finishTurn({
		handle,
		status: 'completed',
		finishedReason: 'stop',
		failureCode: null
	});
}
