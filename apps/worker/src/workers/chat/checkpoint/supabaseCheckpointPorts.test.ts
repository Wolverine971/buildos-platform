// apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts.test.ts
//
// Checkpoint capture writes a project's thinking log and START HERE (paid model calls). A
// session scoped to a project its owner can only read must not be captured into it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessible = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
	id: 'session-1',
	user_id: 'user-1',
	context_type: 'project',
	entity_id: 'project-1',
	title: 'Plan',
	auto_title: null,
	capture_watermark_at: null
}));

vi.mock('../../../lib/supabase', () => {
	const query: Record<string, unknown> = {};
	for (const method of ['select', 'eq']) query[method] = () => query;
	query.maybeSingle = () => Promise.resolve({ data: session, error: null });
	return { supabase: { from: () => query, rpc: vi.fn() } };
});

vi.mock('../../../lib/projectAccess', () => ({ accessibleSessionProjectId: accessible }));

import { createSupabaseCheckpointPorts } from './supabaseCheckpointPorts';

beforeEach(() => accessible.mockReset());

describe('loadSession', () => {
	it('follows the session project only with write access', async () => {
		accessible.mockImplementation(async (_c, _u, _s, level?: string) =>
			level === 'write' ? null : 'project-1'
		);
		const ports = createSupabaseCheckpointPorts({ completeJson: vi.fn() });
		const loaded = await ports.loadSession({ sessionId: 'session-1', userId: 'user-1' });
		expect(accessible).toHaveBeenCalledWith(expect.anything(), 'user-1', session, 'write');
		expect(loaded).toMatchObject({ id: 'session-1', projectId: null });
	});
});
