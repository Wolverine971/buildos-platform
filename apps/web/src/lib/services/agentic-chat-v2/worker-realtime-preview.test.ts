// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-preview.test.ts
import {
	AGENTIC_CHAT_REALTIME_PREVIEW_EVENT,
	AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
	AGENTIC_CHAT_REALTIME_STREAM_EVENT,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatLiveTextPreviewV1,
	type TurnHandleV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatWorkerRealtimeChannel,
	type AgenticChatRealtimeChannelLike,
	type AgenticChatRealtimeClientLike,
	type AgenticChatRealtimeSubscribeStatus
} from './worker-realtime-channel';
import { AgenticChatWorkerRealtimeCoordinator } from './worker-realtime-coordinator';
import { AgenticChatWorkerRealtimeInbox } from './worker-realtime-inbox';
import {
	LIVE_TEXT_PREVIEW_STALE_MS,
	clearLiveTextPreview,
	createLiveTextPreviewState,
	expireLiveTextPreview,
	liveTextPreviewSuffix,
	observeDurableLiveEvent,
	observeDurableReconciliation,
	parseAgenticChatLiveTextPreview,
	receiveLiveTextPreview,
	type LiveTextPreviewState
} from './worker-realtime-preview';
import { AgenticChatWorkerRealtimeRuntime } from './worker-realtime-runtime';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const TURN_ID = 'd4000000-0000-4000-8000-000000000001';

const handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }> = {
	contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	executionMode: 'worker_realtime',
	turnRunId: TURN_ID,
	sessionId: SESSION_ID,
	streamRunId: 'worker-stream-1',
	clientTurnId: 'worker-client-1'
};

function preview(
	overrides: Partial<AgenticChatLiveTextPreviewV1> = {}
): AgenticChatLiveTextPreviewV1 {
	return {
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		execution_generation: 1,
		pass_key: '1.acting.1.1',
		seq: 100,
		text: 'Here is the plan',
		state: 'streaming',
		durable_sequence_floor: 4,
		...overrides
	};
}

function live(
	state: LiveTextPreviewState,
	overrides: Partial<AgenticChatLiveTextPreviewV1> = {}
): LiveTextPreviewState {
	return receiveLiveTextPreview(state, preview(overrides), 1_000);
}

describe('parseAgenticChatLiveTextPreview', () => {
	it('accepts the worker contract and rejects anything else', () => {
		expect(parseAgenticChatLiveTextPreview(preview())).toEqual(preview());
		expect(parseAgenticChatLiveTextPreview(preview({ state: 'discard', text: '' }))).not.toBeNull();
		for (const bad of [
			null,
			'text',
			[],
			{ ...preview(), contract_version: 'v0' },
			{ ...preview(), seq: 0 },
			{ ...preview(), seq: 1.5 },
			{ ...preview(), execution_generation: 0 },
			{ ...preview(), durable_sequence_floor: -1 },
			{ ...preview(), state: 'final' },
			{ ...preview(), text: 42 },
			{ ...preview(), pass_key: '' },
			{ ...preview(), session_id: ' ' },
			{ ...preview(), text: 'x'.repeat(16 * 1024 + 1) }
		]) {
			expect(parseAgenticChatLiveTextPreview(bad)).toBeNull();
		}
	});
});

describe('live text preview state', () => {
	it('renders the pass text after durable text, joined the way the worker joins passes', () => {
		const state = live(createLiveTextPreviewState());
		expect(liveTextPreviewSuffix(state, '')).toBe('Here is the plan');
		expect(liveTextPreviewSuffix(state, 'Let me check.')).toBe('\n\nHere is the plan');
		expect(liveTextPreviewSuffix(state, 'Let me check.\n')).toBe('Here is the plan');
		expect(
			liveTextPreviewSuffix(live(createLiveTextPreviewState(), { text: ' more' }), 'Done.')
		).toBe(' more');
	});

	it('ignores stale seq and updates whose floor durable truth already passed', () => {
		let state = live(createLiveTextPreviewState(), { seq: 10, text: 'Newer' });
		state = live(state, { seq: 9, text: 'Older' });
		expect(state.active?.text).toBe('Newer');
		state = live(state, { seq: 10, text: 'Same seq' });
		expect(state.active?.text).toBe('Newer');

		const applied = createLiveTextPreviewState(7);
		expect(live(applied, { durable_sequence_floor: 6 }).active).toBeNull();
		expect(live(applied, { durable_sequence_floor: 7 }).active?.text).toBe('Here is the plan');
	});

	it('retracts only its own pass on discard and lets a newer pass replace it', () => {
		let state = live(createLiveTextPreviewState(), { seq: 1, pass_key: 'a' });
		state = live(state, { seq: 2, pass_key: 'b', state: 'discard', text: '' });
		expect(state.active?.passKey).toBe('a');
		state = live(state, { seq: 3, pass_key: 'a', state: 'discard', text: '' });
		expect(state.active).toBeNull();

		state = live(state, { seq: 4, pass_key: 'c', text: 'First pass' });
		state = live(state, { seq: 5, pass_key: 'd', text: 'Second pass' });
		expect(state.active).toMatchObject({ passKey: 'd', text: 'Second pass' });
		// A late update from the replaced pass is older by seq and changes nothing.
		state = live(state, { seq: 4, pass_key: 'c', text: 'First pass, more' });
		expect(state.active?.passKey).toBe('d');
	});

	it('is superseded by any non-text durable event above its floor, not at or below it', () => {
		let state = live(createLiveTextPreviewState(), { durable_sequence_floor: 4 });
		state = observeDurableLiveEvent(state, {
			sequence: 4,
			isText: false,
			durableTextBefore: ''
		});
		expect(state.active).not.toBeNull();
		state = observeDurableLiveEvent(state, {
			sequence: 5,
			isText: false,
			durableTextBefore: ''
		});
		expect(state.active).toBeNull();
		expect(state.appliedSequence).toBe(5);
	});

	it('settles against durable text released in chunks without shrinking or duplicating', () => {
		const earlier = 'Let me check.';
		let state = live(createLiveTextPreviewState(), {
			text: 'Here is the plan for today.',
			durable_sequence_floor: 4
		});
		const onScreen = earlier + liveTextPreviewSuffix(state, earlier);
		expect(onScreen).toBe('Let me check.\n\nHere is the plan for today.');

		// First durable chunk of this pass (the worker prefixes the paragraph join).
		state = observeDurableLiveEvent(state, {
			sequence: 5,
			isText: true,
			durableTextBefore: earlier
		});
		let durable = `${earlier}\n\nHere`;
		expect(durable + liveTextPreviewSuffix(state, durable)).toBe(onScreen);

		state = observeDurableLiveEvent(state, {
			sequence: 6,
			isText: true,
			durableTextBefore: durable
		});
		durable = `${durable} is the plan for today.`;
		expect(liveTextPreviewSuffix(state, durable)).toBe('');
		expect(durable).toBe(onScreen);
	});

	it('yields to durable text that diverges from the preview', () => {
		let state = live(createLiveTextPreviewState(), { text: 'Draft wording' });
		state = observeDurableLiveEvent(state, {
			sequence: 5,
			isText: true,
			durableTextBefore: ''
		});
		expect(liveTextPreviewSuffix(state, 'Final')).toBe('');
		expect(liveTextPreviewSuffix(state, 'Draft')).toBe(' wording');
	});

	it('treats a reconciliation above the floor as settling only when every new event is listed text', () => {
		const base = live(createLiveTextPreviewState(3), { durable_sequence_floor: 4 });
		const events = (list: Array<[number, boolean]>) => (after: number) => {
			const above = list.filter(([sequence]) => sequence > after);
			return { count: above.length, allText: above.every(([, isText]) => isText) };
		};

		expect(
			observeDurableReconciliation(base, {
				watermark: 4,
				eventsAbove: events([[4, false]]),
				durableTextBefore: ''
			}).active
		).not.toBeNull();
		expect(
			observeDurableReconciliation(base, {
				watermark: 6,
				eventsAbove: events([
					[5, true],
					[6, false]
				]),
				durableTextBefore: ''
			}).active
		).toBeNull();
		expect(
			observeDurableReconciliation(base, {
				watermark: 6,
				eventsAbove: events([[6, true]]),
				durableTextBefore: ''
			}).active
		).toBeNull();
		const settling = observeDurableReconciliation(base, {
			watermark: 6,
			eventsAbove: events([
				[5, true],
				[6, true]
			]),
			durableTextBefore: ''
		});
		expect(settling.active?.settleTarget).toBe('Here is the plan');
		expect(settling.appliedSequence).toBe(6);
	});

	it('expires after the stale window and clears on demand', () => {
		const state = live(createLiveTextPreviewState());
		expect(expireLiveTextPreview(state, 1_000 + LIVE_TEXT_PREVIEW_STALE_MS - 1).active).not.toBeNull();
		expect(expireLiveTextPreview(state, 1_000 + LIVE_TEXT_PREVIEW_STALE_MS).active).toBeNull();
		expect(clearLiveTextPreview(state).active).toBeNull();
	});
});

class RecordingChannel implements AgenticChatRealtimeChannelLike {
	readonly handlers = new Map<string, (message: unknown) => void>();
	statusCallback: ((status: AgenticChatRealtimeSubscribeStatus) => void) | null = null;

	on(
		_type: 'broadcast',
		filter: { event: string },
		callback: (message: unknown) => void
	): AgenticChatRealtimeChannelLike {
		this.handlers.set(filter.event, callback);
		return this;
	}

	subscribe(
		callback: (status: AgenticChatRealtimeSubscribeStatus) => void
	): AgenticChatRealtimeChannelLike {
		this.statusCallback = callback;
		return this;
	}

	emit(event: string, payload: unknown): void {
		this.handlers.get(event)?.({ payload });
	}
}

function recordingClient() {
	const channels: RecordingChannel[] = [];
	const client: AgenticChatRealtimeClientLike = {
		channel: () => {
			const channel = new RecordingChannel();
			channels.push(channel);
			return channel;
		},
		removeChannel: async () => undefined
	};
	return { client, channels };
}

describe('live preview transport', () => {
	it('subscribes the preview event only when a preview sink is given, outside the inbox', async () => {
		const { client, channels } = recordingClient();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		const receiveStreamEvent = vi.spyOn(inbox, 'receiveStreamEvent');
		const received: unknown[] = [];
		const transport = new AgenticChatWorkerRealtimeChannel(
			client,
			inbox,
			undefined,
			undefined,
			(payload) => {
				received.push(payload);
				throw new Error('observer failure stays contained');
			}
		);
		await transport.connect(USER_ID);
		expect([...channels[0]!.handlers.keys()]).toEqual([
			AGENTIC_CHAT_REALTIME_STREAM_EVENT,
			AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
			AGENTIC_CHAT_REALTIME_PREVIEW_EVENT
		]);

		expect(() => channels[0]!.emit(AGENTIC_CHAT_REALTIME_PREVIEW_EVENT, preview())).not.toThrow();
		expect(received).toEqual([preview()]);
		expect(receiveStreamEvent).not.toHaveBeenCalled();

		await transport.close();
		channels[0]!.emit(AGENTIC_CHAT_REALTIME_PREVIEW_EVENT, preview({ seq: 101 }));
		expect(received).toHaveLength(1);
	});

	it('routes a valid preview to its registered turn without touching the durable cursor', () => {
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl: vi.fn(() => new Promise<Response>(() => undefined))
		});
		const applyPreview = vi.fn();
		coordinator.registerTurn({
			handle,
			observer: { applyLiveEvent: vi.fn(), applyReconciliation: vi.fn(), applyPreview }
		});
		const before = coordinator.inbox.getSnapshot(TURN_ID);

		coordinator.receivePreview(preview());
		coordinator.receivePreview({ ...preview(), seq: 'nope' });
		coordinator.receivePreview(preview({ session_id: 'd2000000-0000-4000-8000-000000000009' }));
		coordinator.receivePreview(preview({ turn_run_id: 'd4000000-0000-4000-8000-000000000009' }));

		expect(applyPreview).toHaveBeenCalledExactlyOnceWith(preview());
		expect(coordinator.inbox.getSnapshot(TURN_ID)).toEqual(before);
	});

	it('wires the runtime channel to the coordinator', async () => {
		const { client, channels } = recordingClient();
		const runtime = new AgenticChatWorkerRealtimeRuntime({
			client: {
				...client,
				auth: {
					getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
					onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } })
				}
			},
			fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)),
			windowTarget: null,
			documentTarget: null
		});
		const receivePreview = vi.spyOn(runtime.coordinator, 'receivePreview');
		await runtime.start();

		channels[0]!.emit(AGENTIC_CHAT_REALTIME_PREVIEW_EVENT, preview());
		expect(receivePreview).toHaveBeenCalledExactlyOnceWith(preview());
		await runtime.stop();
	});
});
