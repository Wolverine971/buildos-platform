// apps/web/src/routes/api/onto/projects/[id]/icon/generations/[generationId]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createProjectAccessSupabase() {
	const generation = {
		id: GENERATION_ID,
		project_id: PROJECT_ID,
		trigger_source: 'manual',
		steering_prompt: 'minimal mountain icon',
		candidate_count: 4,
		status: 'queued',
		selected_candidate_id: null,
		error_message: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		completed_at: null
	};

	const candidates = [
		{
			id: '33333333-3333-4333-8333-333333333333',
			candidate_index: 0,
			concept: 'Peak',
			svg_sanitized:
				'<svg viewBox="0 0 64 64" stroke="currentColor"><path d="M8 52l24-36 24 36"/></svg>',
			selected_at: null,
			created_at: new Date().toISOString()
		}
	];

	const projectMaybeSingle = vi.fn().mockResolvedValue({
		data: { id: PROJECT_ID },
		error: null
	});
	const projectIs = vi.fn().mockReturnValue({ maybeSingle: projectMaybeSingle });
	const projectEq = vi.fn().mockReturnValue({ is: projectIs });
	const projectSelect = vi.fn().mockReturnValue({ eq: projectEq });

	const generationMaybeSingle = vi.fn().mockResolvedValue({ data: generation, error: null });
	const generationEqProject = vi.fn().mockReturnValue({ maybeSingle: generationMaybeSingle });
	const generationEqId = vi.fn().mockReturnValue({ eq: generationEqProject });
	const generationSelect = vi.fn().mockReturnValue({ eq: generationEqId });

	const candidatesOrder = vi.fn().mockResolvedValue({ data: candidates, error: null });
	const candidatesEqProject = vi.fn().mockReturnValue({ order: candidatesOrder });
	const candidatesEqGeneration = vi.fn().mockReturnValue({ eq: candidatesEqProject });
	const candidatesSelect = vi.fn().mockReturnValue({ eq: candidatesEqGeneration });

	return {
		rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') {
				return { select: projectSelect };
			}
			if (table === 'onto_project_icon_generations') {
				return { select: generationSelect };
			}
			if (table === 'onto_project_icon_candidates') {
				return { select: candidatesSelect };
			}
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createEvent(supabase: any): RequestEvent {
	return {
		params: { id: PROJECT_ID, generationId: GENERATION_ID },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: USER_ID, email: 'editor@example.com' }
			})
		}
	} as unknown as RequestEvent;
}

describe('GET /api/onto/projects/[id]/icon/generations/[generationId]', () => {
	beforeEach(() => {
		createAdminSupabaseClientMock.mockReset();
	});

	it('returns generation, candidates, and queue diagnostics', async () => {
		const queueJob = {
			queue_job_id: 'generate_project_icon_job_1',
			status: 'pending',
			attempts: 0,
			max_attempts: 3,
			error_message: null,
			created_at: new Date().toISOString(),
			started_at: null,
			completed_at: null
		};

		const queueMaybeSingle = vi.fn().mockResolvedValue({ data: queueJob, error: null });
		const queueLimit = vi.fn().mockReturnValue({ maybeSingle: queueMaybeSingle });
		const queueOrder = vi.fn().mockReturnValue({ limit: queueLimit });
		const queueEqProject = vi.fn().mockReturnValue({ order: queueOrder });
		const queueEqGeneration = vi.fn().mockReturnValue({ eq: queueEqProject });
		const queueEqType = vi.fn().mockReturnValue({ eq: queueEqGeneration });
		const queueSelect = vi.fn().mockReturnValue({ eq: queueEqType });
		const adminFrom = vi.fn().mockReturnValue({ select: queueSelect });

		createAdminSupabaseClientMock.mockReturnValue({ from: adminFrom });

		const event = createEvent(createProjectAccessSupabase());
		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.generation.id).toBe(GENERATION_ID);
		expect(payload.data.candidates).toHaveLength(1);
		expect(payload.data.queueJob?.status).toBe('pending');
	});

	it('still returns generation payload when queue diagnostics lookup fails', async () => {
		createAdminSupabaseClientMock.mockImplementation(() => {
			throw new Error('admin unavailable');
		});

		const event = createEvent(createProjectAccessSupabase());
		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.generation.id).toBe(GENERATION_ID);
		expect(payload.data.queueJob).toBeNull();
	});
});
