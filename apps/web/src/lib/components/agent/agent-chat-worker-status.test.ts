import { describe, expect, it } from 'vitest';
import { workerActivityForStatus } from './agent-chat-worker-status';

describe('workerActivityForStatus', () => {
	it('projects durable queued and running states into waiting and processing copy', () => {
		expect(workerActivityForStatus('queued')).toBe('Waiting for an available worker...');
		expect(workerActivityForStatus('running')).toBe('Processing...');
		expect(workerActivityForStatus('completed')).toBe('');
	});
});
