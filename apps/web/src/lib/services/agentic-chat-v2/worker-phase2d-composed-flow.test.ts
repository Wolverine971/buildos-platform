import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgentStreamEventV1,
	type TurnHandleV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgentChatWorkerUiAdapter,
	type AgentChatWorkerUiAdapterPort
} from '$lib/components/agent/agent-chat-worker-ui-adapter';
import { AgenticChatWorkerRealtimeCoordinator } from './worker-realtime-coordinator';
import { AgenticChatWorkerTurnAdoption } from './worker-turn-adoption';

const USER_ID = 'c1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'c2000000-0000-4000-8000-000000000001';
const TURN_ID = 'c4000000-0000-4000-8000-000000000001';

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

const handle: WorkerTurnHandle = {
	contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	executionMode: 'worker_realtime',
	turnRunId: TURN_ID,
	sessionId: SESSION_ID,
	streamRunId: 'phase2d-composed-stream-1',
	clientTurnId: 'phase2d-composed-client-1'
};

function streamEvent(
	sequence: number,
	type: 'text_delta' | 'done',
	payload: Record<string, unknown> = {}
): AgentStreamEventV1 {
	return {
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		event_id: createAgentStreamEventIdV1(TURN_ID, 1, sequence),
		stream_run_id: handle.streamRunId,
		client_turn_id: handle.clientTurnId,
		session_id: SESSION_ID,
		turn_run_id: TURN_ID,
		execution_generation: 1,
		sequence_index: sequence,
		phase: type === 'done' ? 'finalize' : 'llm',
		event_type: type,
		durable: true,
		type,
		...payload
	} as AgentStreamEventV1;
}

function descriptor() {
	return {
		handle,
		status: 'running' as const,
		executionGeneration: 1,
		terminalEventId: null,
		updatedAt: '2026-08-03T16:00:00.000Z'
	};
}

function admission(outcome: 'newly_admitted' | 'matching_duplicate') {
	return {
		success: true,
		data: {
			outcome,
			handle,
			status: outcome === 'newly_admitted' ? 'queued' : 'running'
		}
	};
}

async function flushAsync(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe('Agentic Chat Phase 2D composed browser convergence', () => {
	it('converges duplicate admission, reload discovery, reconnect, a sequence gap, and terminal wait', async () => {
		type ReconcileMode = 'initial' | 'reload' | 'reconnect' | 'gap' | 'terminal';
		let mode: ReconcileMode = 'initial';
		const reconcileRequests: Array<{ generation: number; after: number; mode: ReconcileMode }> =
			[];
		const discoveryRequests: string[] = [];
		const textSnapshots: string[] = [];
		const appendedText: string[] = [];
		const terminalStatuses: string[] = [];
		const adoptionSources: string[] = [];
		const releases: Array<{ reason: string; status?: string }> = [];
		const errors: unknown[] = [];

		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = new URL(String(input), 'http://buildos.test');
			if (url.pathname === '/api/agent/v2/turns') {
				discoveryRequests.push(url.searchParams.get('session_id') ?? '');
				return Response.json({ success: true, data: { turns: [descriptor()] } });
			}

			const requestedGeneration = Number(url.searchParams.get('generation'));
			const after = Number(url.searchParams.get('after'));
			reconcileRequests.push({ generation: requestedGeneration, after, mode });

			const common = {
				outcome: 'reconciled',
				contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
				turn_run_id: TURN_ID,
				session_id: SESSION_ID,
				user_id: USER_ID,
				stream_run_id: handle.streamRunId,
				client_turn_id: handle.clientTurnId,
				execution_mode: 'worker_realtime',
				requested_execution_generation: requestedGeneration,
				execution_generation: 1,
				generation_changed: requestedGeneration !== 1,
				projection: {},
				reconcile_required: false,
				assistant_message: null,
				updated_at: '2026-08-03T16:00:00.000Z'
			};

			if (mode === 'gap') {
				return Response.json({
					success: true,
					data: {
						...common,
						status: 'running',
						text: 'ABC',
						snapshot_sequence: 3,
						durable_through_sequence: 3,
						projection_durable_sequence: 1,
						durable_events: [
							streamEvent(2, 'text_delta', { text_delta: 'B' }),
							streamEvent(3, 'text_delta', { text_delta: 'C' })
						],
						response_watermark: 3,
						terminal_event_id: null,
						terminalized_at: null,
						finished_reason: null,
						failure_code: null
					}
				});
			}

			if (mode === 'terminal') {
				return Response.json({
					success: true,
					data: {
						...common,
						status: 'cancelled',
						text: 'ABC',
						snapshot_sequence: 4,
						durable_through_sequence: 4,
						projection_durable_sequence: 3,
						durable_events: [
							streamEvent(4, 'done', {
								status: 'cancelled',
								finished_reason: 'superseded',
								failure_code: null
							})
						],
						response_watermark: 4,
						terminal_event_id: createAgentStreamEventIdV1(TURN_ID, 1, 4),
						terminalized_at: '2026-08-03T16:00:01.000Z',
						finished_reason: 'superseded',
						failure_code: null
					}
				});
			}

			return Response.json({
				success: true,
				data: {
					...common,
					status: 'running',
					text: 'A',
					snapshot_sequence: 1,
					durable_through_sequence: 1,
					projection_durable_sequence: 1,
					durable_events: [],
					response_watermark: 1,
					terminal_event_id: null,
					terminalized_at: null,
					finished_reason: null,
					failure_code: null
				}
			});
		});

		const port: AgentChatWorkerUiAdapterPort = {
			beginGeneration: vi.fn(),
			replaceAssistantSnapshot: vi.fn(({ text }) => textSnapshots.push(text)),
			appendAssistantText: vi.fn(({ text }) => appendedText.push(text)),
			applySemanticEvent: vi.fn(),
			updateTurnState: vi.fn(),
			finishTurn: vi.fn(({ status }) => terminalStatuses.push(status)),
			onError: (error) => errors.push(error)
		};
		const coordinator = new AgenticChatWorkerRealtimeCoordinator({
			fetchImpl,
			changedWatchdogMs: 60_000,
			unchangedWatchdogMs: 60_000,
			retryMs: 60_000,
			onError: (error) => errors.push(error)
		});
		const adoption = new AgenticChatWorkerTurnAdoption({
			runtime: coordinator,
			fetchImpl,
			createObserver: ({ handle: adoptedHandle, onTerminal }) =>
				new AgentChatWorkerUiAdapter({ handle: adoptedHandle, port, onTerminal }),
			onAdopted: ({ source }) => adoptionSources.push(source),
			onReleased: ({ reason, status }) => releases.push({ reason, status }),
			onError: (error) => errors.push(error)
		});

		coordinator.start();
		adoption.adoptAdmissionResponse(admission('newly_admitted'));
		adoption.adoptAdmissionResponse(admission('matching_duplicate'));
		await vi.waitFor(() => expect(textSnapshots).toEqual(['A']));
		expect(adoption.trackedTurnCount).toBe(1);
		expect(coordinator.trackedTurnCount).toBe(1);
		expect(adoptionSources).toEqual(['admission', 'matching_duplicate']);

		// Reload drops the ephemeral registration, then owned discovery recreates
		// it from the server-issued immutable handle.
		adoption.releaseSession(SESSION_ID);
		expect(coordinator.trackedTurnCount).toBe(0);
		mode = 'reload';
		await adoption.discoverSession(SESSION_ID);
		await vi.waitFor(() => expect(textSnapshots).toHaveLength(2));
		expect(discoveryRequests).toEqual([SESSION_ID]);
		expect(adoption.trackedTurnCount).toBe(1);

		// Channel loss/reconnect converges through the same cursor without
		// duplicating the authoritative snapshot in UI text.
		mode = 'reconnect';
		const requestsBeforeReconnect = reconcileRequests.length;
		coordinator.inbox.notifyChannelUnavailable();
		coordinator.inbox.notifyChannelReconnected();
		await vi.waitFor(() =>
			expect(reconcileRequests.length).toBeGreaterThan(requestsBeforeReconnect)
		);

		// Sequence 3 arrives before sequence 2. The live inbox buffers it, fetches
		// the missing durable window, and the UI applies only the complete snapshot.
		mode = 'gap';
		coordinator.inbox.receiveStreamEvent(streamEvent(3, 'text_delta', { text_delta: 'C' }));
		await vi.waitFor(() => expect(textSnapshots.at(-1)).toBe('ABC'));
		expect(coordinator.inbox.getSnapshot(TURN_ID)).toMatchObject({
			executionGeneration: 1,
			lastAppliedSequence: 3,
			buffering: false,
			bufferedEvents: 0
		});
		expect(appendedText).toEqual([]);

		// A cancel/supersede acknowledgement does not release the handle. Only the
		// durable terminal receipt below ends terminal wait and permits replacement.
		expect(adoption.trackedTurnCount).toBe(1);
		expect(terminalStatuses).toEqual([]);
		mode = 'terminal';
		coordinator.requestAll('watchdog');
		await vi.waitFor(() => expect(terminalStatuses).toEqual(['cancelled']));
		await flushAsync();
		expect(adoption.trackedTurnCount).toBe(0);
		expect(coordinator.trackedTurnCount).toBe(0);
		expect(releases).toEqual([
			{ reason: 'session_changed', status: undefined },
			{ reason: 'terminal', status: 'cancelled' }
		]);
		expect(errors).toEqual([]);

		coordinator.stop();
	});
});
