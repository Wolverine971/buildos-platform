// apps/web/src/lib/components/agent/agent-chat-worker-status.test.ts
import { describe, expect, it } from 'vitest';
import { workerActivityForStatus } from './agent-chat-worker-status';

describe('workerActivityForStatus', () => {
	it('shows one calm status while the turn is queued or running, never infrastructure words', () => {
		expect(workerActivityForStatus('queued')).toBe('Thinking…');
		expect(workerActivityForStatus('running')).toBe('Thinking…');
		expect(workerActivityForStatus('completed')).toBe('');
	});
});
