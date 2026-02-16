// apps/web/src/routes/api/onto/projects/[id]/icon/generations/[generationId]/select/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { POST } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '22222222-2222-4222-8222-222222222222';
const CANDIDATE_ID = '33333333-3333-4333-8333-333333333333';

const createEvent = (body?: Record<string, unknown>): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: PROJECT_ID, generationId: GENERATION_ID },
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

describe('POST /api/onto/projects/[id]/icon/generations/[generationId]/select', () => {
	it('requires candidateId', async () => {
		const event = createEvent({});
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });
		const projectMaybeSingle = vi.fn().mockResolvedValue({
			data: { id: PROJECT_ID },
			error: null
		});
		const projectIs = vi.fn().mockReturnValue({ maybeSingle: projectMaybeSingle });
		const projectEq = vi.fn().mockReturnValue({ is: projectIs });
		const projectSelect = vi.fn().mockReturnValue({ eq: projectEq });
		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return { select: projectSelect };
			}
			return {};
		});

		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('applies selected candidate to the project icon fields', async () => {
		const event = createEvent({ candidateId: CANDIDATE_ID });
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const projectSelectMaybeSingle = vi.fn().mockResolvedValue({
			data: { id: PROJECT_ID },
			error: null
		});
		const projectSelectIs = vi.fn().mockReturnValue({ maybeSingle: projectSelectMaybeSingle });
		const projectSelectEq = vi.fn().mockReturnValue({ is: projectSelectIs });
		const projectSelect = vi.fn().mockReturnValue({ eq: projectSelectEq });

		const projectUpdateIs = vi.fn().mockResolvedValue({ error: null });
		const projectUpdateEq = vi.fn().mockReturnValue({ is: projectUpdateIs });
		const projectUpdate = vi.fn().mockReturnValue({ eq: projectUpdateEq });

		const generationFetchMaybeSingle = vi.fn().mockResolvedValue({
			data: {
				id: GENERATION_ID,
				project_id: PROJECT_ID,
				steering_prompt: 'minimal mountain icon'
			},
			error: null
		});
		const generationFetchEq2 = vi
			.fn()
			.mockReturnValue({ maybeSingle: generationFetchMaybeSingle });
		const generationFetchEq1 = vi.fn().mockReturnValue({ eq: generationFetchEq2 });
		const generationFetchSelect = vi.fn().mockReturnValue({ eq: generationFetchEq1 });

		const generationUpdateEq2 = vi.fn().mockResolvedValue({ error: null });
		const generationUpdateEq1 = vi.fn().mockReturnValue({ eq: generationUpdateEq2 });
		const generationUpdate = vi.fn().mockReturnValue({ eq: generationUpdateEq1 });

		const candidateFetchMaybeSingle = vi.fn().mockResolvedValue({
			data: {
				id: CANDIDATE_ID,
				generation_id: GENERATION_ID,
				project_id: PROJECT_ID,
				concept: 'Mountain Trail',
				svg_sanitized:
					'<svg viewBox="0 0 64 64" fill="none" stroke="currentColor"><path d="M8 52l16-24 8 12 10-16 14 28"/></svg>'
			},
			error: null
		});
		const candidateFetchEq3 = vi
			.fn()
			.mockReturnValue({ maybeSingle: candidateFetchMaybeSingle });
		const candidateFetchEq2 = vi.fn().mockReturnValue({ eq: candidateFetchEq3 });
		const candidateFetchEq1 = vi.fn().mockReturnValue({ eq: candidateFetchEq2 });
		const candidateFetchSelect = vi.fn().mockReturnValue({ eq: candidateFetchEq1 });

		const clearSelectionEq2 = vi.fn().mockResolvedValue({ error: null });
		const clearSelectionEq1 = vi.fn().mockReturnValue({ eq: clearSelectionEq2 });
		const clearSelectionUpdate = vi.fn().mockReturnValue({ eq: clearSelectionEq1 });

		const markSelectionEq3 = vi.fn().mockResolvedValue({ error: null });
		const markSelectionEq2 = vi.fn().mockReturnValue({ eq: markSelectionEq3 });
		const markSelectionEq1 = vi.fn().mockReturnValue({ eq: markSelectionEq2 });
		const markSelectionUpdate = vi.fn().mockReturnValue({ eq: markSelectionEq1 });

		let projectsCallCount = 0;
		let generationsCallCount = 0;
		let candidatesCallCount = 0;

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				projectsCallCount += 1;
				if (projectsCallCount === 1) {
					return { select: projectSelect };
				}
				return { update: projectUpdate };
			}

			if (table === 'onto_project_icon_generations') {
				generationsCallCount += 1;
				if (generationsCallCount === 1) {
					return { select: generationFetchSelect };
				}
				return { update: generationUpdate };
			}

			if (table === 'onto_project_icon_candidates') {
				candidatesCallCount += 1;
				if (candidatesCallCount === 1) {
					return { select: candidateFetchSelect };
				}
				if (candidatesCallCount === 2) {
					return { update: clearSelectionUpdate };
				}
				return { update: markSelectionUpdate };
			}

			return {};
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.generationId).toBe(GENERATION_ID);
		expect(payload.data.candidateId).toBe(CANDIDATE_ID);
		expect(projectUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				icon_concept: 'Mountain Trail',
				icon_generation_source: 'manual',
				icon_generation_prompt: 'minimal mountain icon'
			})
		);
		expect(generationUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				selected_candidate_id: CANDIDATE_ID,
				status: 'completed',
				error_message: null
			})
		);
	});
});
