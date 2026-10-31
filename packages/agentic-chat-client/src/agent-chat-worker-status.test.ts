// packages/agentic-chat-client/src/agent-chat-worker-status.test.ts
import { describe, expect, it } from 'vitest';
import {
	isWorkerQueueTimeout,
	isWorkerWaitActivity,
	WORKER_QUEUED_SLOW_AFTER_MS,
	WORKER_RESUMING_STATUS,
	WORKER_SLOW_WAIT_STATUS,
	workerActivityForStatus,
	workerResumingActivity
} from './agent-chat-worker-status';

const QUEUED_AT = '2026-09-23T12:00:00.000Z';
const at = (elapsedMs: number) => Date.parse(QUEUED_AT) + elapsedMs;

describe('workerActivityForStatus', () => {
	it('shows one calm status while the turn is queued or running, never infrastructure words', () => {
		expect(workerActivityForStatus('queued')).toBe('Thinking…');
		expect(workerActivityForStatus('running')).toBe('Thinking…');
		expect(workerActivityForStatus('completed')).toBe('');
		expect(workerActivityForStatus('cancelled')).toBe('');
	});

	it('names a long queue wait after ~20 seconds, measured from when the turn was queued', () => {
		expect(WORKER_QUEUED_SLOW_AFTER_MS).toBe(20_000);
		expect(workerActivityForStatus('queued', { queuedSince: QUEUED_AT, now: at(19_999) })).toBe(
			'Thinking…'
		);
		expect(workerActivityForStatus('queued', { queuedSince: QUEUED_AT, now: at(20_000) })).toBe(
			'Taking longer than usual…'
		);
		expect(
			workerActivityForStatus('queued', { queuedSince: QUEUED_AT, now: at(600_000) })
		).toBe('Taking longer than usual…');
	});

	it('keeps a running turn’s text however long it has run', () => {
		expect(
			workerActivityForStatus('running', { queuedSince: QUEUED_AT, now: at(600_000) })
		).toBe('Thinking…');
	});

	it('stays calm when the queue time is unknown, unreadable, or ahead of this clock', () => {
		expect(workerActivityForStatus('queued', { queuedSince: null, now: at(600_000) })).toBe(
			'Thinking…'
		);
		expect(
			workerActivityForStatus('queued', { queuedSince: 'not-a-time', now: at(600_000) })
		).toBe('Thinking…');
		expect(
			workerActivityForStatus('queued', { queuedSince: QUEUED_AT, now: at(-60_000) })
		).toBe('Thinking…');
	});
});

describe('workerResumingActivity', () => {
	it('names the restart, then the long wait ~20s after this browser saw it', () => {
		const seenAt = Date.parse(QUEUED_AT);
		expect(WORKER_RESUMING_STATUS).toBe('Picking back up after an update…');
		expect(workerResumingActivity(seenAt, seenAt)).toBe(WORKER_RESUMING_STATUS);
		expect(workerResumingActivity(seenAt, seenAt + 19_999)).toBe(WORKER_RESUMING_STATUS);
		expect(workerResumingActivity(seenAt, seenAt + 20_000)).toBe('Taking longer than usual…');
	});

	it('recognizes only its own wait lines', () => {
		expect(isWorkerWaitActivity(WORKER_RESUMING_STATUS)).toBe(true);
		expect(isWorkerWaitActivity(WORKER_SLOW_WAIT_STATUS)).toBe(true);
		expect(isWorkerWaitActivity('Thinking…')).toBe(false);
		expect(isWorkerWaitActivity('Reading your project…')).toBe(false);
		expect(isWorkerWaitActivity('')).toBe(false);
	});
});

describe('isWorkerQueueTimeout', () => {
	it('recognizes only the sweeper’s cancelled + timeout terminal', () => {
		expect(isWorkerQueueTimeout('cancelled', 'timeout')).toBe(true);
		expect(isWorkerQueueTimeout('cancelled', 'user_cancelled')).toBe(false);
		expect(isWorkerQueueTimeout('cancelled', 'superseded')).toBe(false);
		expect(isWorkerQueueTimeout('failed', 'timeout')).toBe(false);
		expect(isWorkerQueueTimeout('completed', 'timeout')).toBe(false);
		expect(isWorkerQueueTimeout('cancelled', null)).toBe(false);
	});
});
