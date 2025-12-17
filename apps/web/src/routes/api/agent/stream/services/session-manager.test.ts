// apps/web/src/routes/api/agent/stream/services/session-manager.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '@buildos/shared-types';
import type { StreamRequest, AgentSessionMetadata } from '../types';
import { SessionManager } from './session-manager';

const createSupabaseStub = () => {
	const update = vi.fn(() => ({
		eq: vi.fn(() => ({ error: null }))
	}));

	return {
		from: vi.fn(() => ({
			update
		})),
		update
	};
};

describe('SessionManager.resolveProjectFocus', () => {
	it('retains stored focus when project_focus is not provided', async () => {
		const supabase = createSupabaseStub();
		const manager = new SessionManager(supabase as any);

		const session = { id: 'sess_1' } as unknown as ChatSession;
		const metadata: AgentSessionMetadata = {
			focus: {
				projectId: 'proj_1',
				projectName: 'Project 1',
				focusType: 'project-wide',
				focusEntityId: null,
				focusEntityName: null
			}
		};

		const request: StreamRequest = {
			message: 'hello',
			context_type: 'project'
		};

		const result = await manager.resolveProjectFocus(request, session, metadata);

		expect(result.resolvedFocus?.projectId).toBe('proj_1');
		expect(result.focusChanged).toBe(false);
		expect(supabase.from).not.toHaveBeenCalled();
	});

	it('persists focus clearing when project_focus is explicitly null', async () => {
		const supabase = createSupabaseStub();
		const manager = new SessionManager(supabase as any);

		const session = { id: 'sess_1' } as unknown as ChatSession;
		const metadata: AgentSessionMetadata = {
			focus: {
				projectId: 'proj_1',
				projectName: 'Project 1',
				focusType: 'project-wide',
				focusEntityId: null,
				focusEntityName: null
			}
		};

		const request: StreamRequest = {
			message: 'hello',
			context_type: 'project',
			project_focus: null
		};

		const result = await manager.resolveProjectFocus(request, session, metadata);

		expect(result.resolvedFocus).toBeNull();
		expect(result.focusChanged).toBe(true);
		expect(supabase.update).toHaveBeenCalled();
	});
});
