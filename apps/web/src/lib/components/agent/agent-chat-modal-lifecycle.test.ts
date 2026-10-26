// apps/web/src/lib/components/agent/agent-chat-modal-lifecycle.test.ts
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '@buildos/shared-types';
import type { CaptureReceiptClient } from './agent-chat-capture-receipts.svelte';
import type { DataMutationSummary, UIMessage } from './agent-chat.types';
import {
	adoptAdmissionForCurrentFocus,
	hydrateBrainDumpForCurrentSession,
	logActiveFocusChange,
	releaseChatSession,
	type SessionReleaseDeps
} from './agent-chat-session-lifecycle';
import ChatCaptureReceipts from './ChatCaptureReceipts.test-harness.svelte';
import { buildCaptureReceiptUIMessage } from './capture-receipt';
import { flushSync } from 'svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
const session = (id: string) => ({ id }) as ChatSession;
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function releaseDeps(hasChanges = false): SessionReleaseDeps {
	const summary: DataMutationSummary = {
		hasChanges,
		totalMutations: hasChanges ? 1 : 0,
		affectedProjectIds: [],
		hasMessagesSent: true
	};
	return {
		finalize: vi.fn(),
		voice: { stop: vi.fn(), cleanup: vi.fn() },
		clearSessionRefresh: vi.fn(),
		clearRestoredTurn: vi.fn(),
		invalidateSessionLoads: vi.fn(),
		stream: { reset: vi.fn(), hasSentMessage: true },
		workerAdoption: { clear: vi.fn() },
		workerRealtime: { stop: vi.fn() },
		attachments: { cleanup: vi.fn() },
		unsubscribeSessionMessages: vi.fn(),
		fallbackTimers: new Map(),
		seenTerminalRunIds: new Set(['old']),
		clearToolState: vi.fn(),
		presenter: { buildMutationSummary: vi.fn(() => summary), resetMutationTracking: vi.fn() },
		sessionId: null,
		notifyDataMutation: vi.fn()
	};
}

describe('chat session resource lifecycle', () => {
	it.each([
		[false, null, false],
		[false, 'block', false],
		[true, null, false],
		[true, 'block', true]
	] as const)(
		'logs focus only into an active turn (busy=%s, block=%s)',
		(isTurnBusy, thinkingBlockId, shouldAppend) => {
			const append = vi.fn();
			logActiveFocusChange({ isTurnBusy, thinkingBlockId }, 'Focus changed', null, append);
			expect(append).toHaveBeenCalledTimes(shouldAppend ? 1 : 0);
			if (shouldAppend)
				expect(append).toHaveBeenCalledWith(
					'Focus changed: project workspace',
					'context_shift',
					{ focus: null }
				);
		}
	);

	it.each(['close', 'destroy'] as const)(
		'invalidates pending admission and releases resources on %s even before a session exists',
		(reason) => {
			vi.useFakeTimers();
			const deps = releaseDeps();
			const lateRefresh = vi.fn();
			deps.fallbackTimers.set('old', setTimeout(lateRefresh, 100));
			releaseChatSession(deps, reason);
			vi.advanceTimersByTime(200);
			expect(lateRefresh).not.toHaveBeenCalled();
			expect(deps.stream.reset).toHaveBeenCalledOnce();
			expect(deps.invalidateSessionLoads).toHaveBeenCalledOnce();
			expect(deps.clearRestoredTurn).toHaveBeenCalledOnce();
			expect(deps.finalize).toHaveBeenCalledWith(reason);
			expect(deps.workerAdoption?.clear).toHaveBeenCalledWith('teardown');
			for (const callback of [
				deps.voice.stop,
				deps.voice.cleanup,
				deps.workerRealtime!.stop,
				deps.attachments.cleanup,
				deps.unsubscribeSessionMessages,
				deps.clearToolState
			])
				expect(callback).toHaveBeenCalledOnce();
			expect(deps.fallbackTimers.size).toBe(0);
			expect(deps.seenTerminalRunIds.size).toBe(0);
			expect(deps.presenter.buildMutationSummary).toHaveBeenCalledWith({
				hasMessagesSent: true,
				sessionId: null
			});
			expect(deps.notifyDataMutation).not.toHaveBeenCalled();
		}
	);

	it.each([false, true])(
		'returns mutations and respects deferred broadcasting (%s)',
		(deferBroadcast) => {
			const deps = releaseDeps(true);
			const result = releaseChatSession(deps, 'close', { deferBroadcast });
			expect(result.hasChanges).toBe(true);
			expect(deps.notifyDataMutation).toHaveBeenCalledTimes(deferBroadcast ? 0 : 1);
			if (!deferBroadcast) expect(deps.notifyDataMutation).toHaveBeenCalledWith(result);
			expect(deps.presenter.resetMutationTracking).toHaveBeenCalledOnce();
		}
	);

	it.each(['unchanged', 'reset', 'project', 'session'] as const)(
		'accepts a delayed admission only for its original focus: %s',
		async (change) => {
			const snapshot = deferred<ChatSession>();
			const state = { session: null as ChatSession | null, project: 'p1', run: 1 };
			const hydrate = vi.fn();
			const adopt = vi.fn();
			const pending = adoptAdmissionForCurrentFocus({
				currentSession: () => state.session,
				projectId: () => state.project,
				runId: () => state.run,
				loadSession: () => snapshot.promise,
				hydrate,
				adopt
			});
			if (change === 'reset') state.run++;
			if (change === 'project') state.project = 'p2';
			if (change === 'session') state.session = session('s2');
			snapshot.resolve(session('s1'));
			if (change === 'unchanged') await pending;
			else await expect(pending).rejects.toThrow('Chat focus changed');
			expect(hydrate).toHaveBeenCalledTimes(change === 'unchanged' ? 1 : 0);
			expect(adopt).toHaveBeenCalledTimes(change === 'unchanged' ? 1 : 0);
		}
	);

	it.each([false, true])(
		'fences delayed brain-dump hydration after session change (%s)',
		async (switched) => {
			const body = deferred<unknown>();
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => ({ ok: true, json: () => body.promise }))
			);
			let currentSession = 's1';
			const apply = vi.fn();
			const pending = hydrateBrainDumpForCurrentSession({
				session: { ...session('s1'), agent_metadata: { braindump_id: 'dump1' } },
				currentSessionId: () => currentSession,
				currentBrainDumpId: () => null,
				apply,
				onError: vi.fn()
			});
			if (switched) currentSession = 's2';
			body.resolve({ success: true, data: { braindump: { id: 'dump1', content: 'Notes' } } });
			await pending;
			expect(apply).toHaveBeenCalledTimes(switched ? 0 : 1);
		}
	);
});

function captureHarness() {
	const loads = [deferred<{ data: unknown[] }>(), deferred<{ data: unknown[] }>()];
	const callbacks: Array<(value: { new: unknown }) => void> = [];
	const channels: unknown[] = [];
	let queryIndex = 0;
	const client = {
		channel: vi.fn(() => {
			const channel = {
				on: vi.fn((_event, _filter, callback) => {
					callbacks.push(callback);
				}),
				subscribe: vi.fn()
			};
			channels.push(channel);
			return channel;
		}),
		from: vi.fn(() => {
			const loading = loads[queryIndex++]!.promise;
			const query: Record<string, unknown> = { then: loading.then.bind(loading) };
			for (const method of ['select', 'eq', 'in', 'order', 'limit'])
				query[method] = () => query;
			return query;
		}),
		removeChannel: vi.fn()
	};
	const onReceipts = vi.fn<(rows: UIMessage[]) => void>();
	const props = {
		client: client as unknown as CaptureReceiptClient,
		sessionId: 's1',
		onReceipts
	};
	const view = render(ChatCaptureReceipts, props);
	const receipt = (id: string, sid: string) => ({
		id,
		session_id: sid,
		project_id: 'p1',
		status: 'captured',
		created_at: '2026-10-18T12:00:00Z',
		thinking_log_document_id: 'doc1'
	});
	return { callbacks, loads, channels, client, onReceipts, props, view, receipt };
}

describe('capture receipt effect lifecycle', () => {
	it('preserves externally inserted receipts through realtime and initial-load updates without resubscribing', async () => {
		const { callbacks, loads, client, onReceipts, view, receipt } = captureHarness();
		callbacks[0]!({ new: receipt('live-1', 's1') });
		flushSync(() =>
			view.component.insertReceipt(buildCaptureReceiptUIMessage(receipt('external', 's1'))!)
		);
		flushSync(() => callbacks[0]!({ new: receipt('live-2', 's1') }));
		loads[0]!.resolve({ data: [receipt('loaded', 's1')] });
		await loads[0]!.promise;
		await Promise.resolve();
		flushSync();
		expect(onReceipts.mock.lastCall?.[0].map((row) => row.id)).toEqual([
			'capture-receipt:live-1',
			'capture-receipt:external',
			'capture-receipt:live-2',
			'capture-receipt:loaded'
		]);
		expect(client.channel).toHaveBeenCalledOnce();
		expect(client.removeChannel).not.toHaveBeenCalled();
	});

	it('disposes the old session on prop changes and ignores late queries and realtime callbacks after unmount', async () => {
		const { callbacks, loads, channels, client, onReceipts, props, view, receipt } =
			captureHarness();
		callbacks[0]!({ new: receipt('r1', 's1') });
		expect(onReceipts.mock.lastCall?.[0]).toHaveLength(1);
		await view.rerender({ ...props, sessionId: 's2' });
		expect(client.removeChannel).toHaveBeenCalledWith(channels[0]);
		expect(onReceipts.mock.lastCall?.[0]).toEqual([]);
		callbacks[0]!({ new: receipt('r-old', 's1') });
		loads[0]!.resolve({ data: [receipt('r-old', 's1')] });
		await loads[0]!.promise;
		await Promise.resolve();
		expect(onReceipts.mock.lastCall?.[0]).toEqual([]);
		callbacks[1]!({ new: receipt('r-wrong', 's1') });
		expect(onReceipts.mock.lastCall?.[0]).toEqual([]);
		callbacks[1]!({ new: receipt('r2', 's2') });
		expect(onReceipts.mock.lastCall?.[0]?.map((r) => r.id)).toEqual(['capture-receipt:r2']);
		view.unmount();
		const callsAtUnmount = onReceipts.mock.calls.length;
		callbacks[1]!({ new: receipt('r-late', 's2') });
		loads[1]!.resolve({ data: [receipt('r-late', 's2')] });
		await loads[1]!.promise;
		await Promise.resolve();
		expect(onReceipts).toHaveBeenCalledTimes(callsAtUnmount);
		expect(client.removeChannel).toHaveBeenCalledWith(channels[1]);
	});
});
