// apps/web/src/routes/api/onto/projects/[id]/icon/generations/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { queueProjectIconGenerationMock } = vi.hoisted(() => ({
	queueProjectIconGenerationMock: vi.fn()
}));

vi.mock('$lib/server/project-icon-generation.service', () => ({
	queueProjectIconGeneration: queueProjectIconGenerationMock
}));

import { POST } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '22222222-2222-4222-8222-222222222222';

const createEvent = (body?: Record<string, unknown>): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: PROJECT_ID },
		request: {
			json: vi.fn().mockResolvedValue(body ?? {})
		},
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'editor@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

const mockProjectExists = () => {
	const projectMaybeSingle = vi.fn().mockResolvedValue({
		data: { id: PROJECT_ID },
		error: null
	});
	const projectIs = vi.fn().mockReturnValue({ maybeSingle: projectMaybeSingle });
	const projectEq = vi.fn().mockReturnValue({ is: projectIs });
	const projectSelect = vi.fn().mockReturnValue({ eq: projectEq });

	return { projectSelect, projectMaybeSingle };
};

describe('POST /api/onto/projects/[id]/icon/generations', () => {
	beforeEach(() => {
		queueProjectIconGenerationMock.mockReset();
	});

	it('returns forbidden when write access is missing', async () => {
		const event = createEvent({ steeringPrompt: 'minimal mountain icon', candidateCount: 4 });
		const supabase = event.locals.supabase as any;
		const { projectSelect } = mockProjectExists();

		supabase.rpc.mockResolvedValue({ data: false, error: null });
		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return { select: projectSelect };
			}
			return {};
		});

		const response = await POST(event);
		expect(response.status).toBe(403);
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: PROJECT_ID,
			p_required_access: 'write'
		});
	});

	it('creates generation and queues project icon job', async () => {
		const event = createEvent({
			steeringPrompt: 'minimal mountain + trail vibe, no tools',
			candidateCount: 4
		});
		const supabase = event.locals.supabase as any;
		const { projectSelect } = mockProjectExists();

		const insertSingle = vi.fn().mockResolvedValue({
			data: { id: GENERATION_ID, status: 'queued' },
			error: null
		});
		const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
		const insert = vi.fn().mockReturnValue({ select: insertSelect });

		supabase.rpc.mockResolvedValue({ data: true, error: null });
		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return { select: projectSelect };
			}
			if (table === 'onto_project_icon_generations') {
				return { insert };
			}
			return {};
		});

		queueProjectIconGenerationMock.mockResolvedValue({
			queued: true,
			jobId: 'job-1',
			reason: 'queued'
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload.success).toBe(true);
		expect(payload.data.generationId).toBe(GENERATION_ID);
		expect(queueProjectIconGenerationMock).toHaveBeenCalledWith({
			projectId: PROJECT_ID,
			generationId: GENERATION_ID,
			userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
			triggerSource: 'manual',
			steeringPrompt: 'minimal mountain + trail vibe, no tools',
			candidateCount: 4,
			autoSelect: false,
			priority: 8,
			dedupKey: `project-icon:generation:${GENERATION_ID}`
		});
	});
});
