// apps/web/src/lib/components/project/v2/GoalTrackingModal.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import GoalTrackingModal from './GoalTrackingModal.svelte';
import type { Goal } from '$lib/types/onto';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('$lib/utils/ontology-client-logger', () => ({
	logOntologyClientError: vi.fn()
}));

const goal: Goal = {
	id: '22222222-2222-4222-8222-222222222222',
	project_id: '11111111-1111-4111-8111-111111111111',
	name: 'Validate family demand',
	type_key: null,
	state_key: 'active',
	goal: null,
	description: null,
	target_date: null,
	completed_at: null,
	deleted_at: null,
	props: {},
	created_by: '33333333-3333-4333-8333-333333333333',
	created_at: '2026-08-01T12:00:00.000Z',
	updated_at: '2026-08-02T12:00:00.000Z'
};

describe('GoalTrackingModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', fetchMock);
		Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
	});

	it('persists an explicit manual progress choice in goal props', async () => {
		const onSaved = vi.fn();
		const updatedGoal = {
			...goal,
			props: {
				goal_tracking: {
					version: 1,
					method: 'manual',
					manual: { percent: 35, note: 'Five interviews complete' }
				}
			}
		};
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ data: { goal: updatedGoal } })
		});

		render(GoalTrackingModal, {
			props: { goal, summary: null, onClose: vi.fn(), onSaved }
		});

		expect(screen.getByRole('radio', { name: /Milestones/ })).toBeInTheDocument();
		expect(screen.queryByText(/Checkpoints/i)).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('radio', { name: /Manual/ }));
		await fireEvent.input(screen.getByLabelText('Progress'), { target: { value: '35' } });
		await fireEvent.input(screen.getByLabelText(/Evidence note/), {
			target: { value: 'Five interviews complete' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(request.body));
		expect(body.props.goal_tracking).toMatchObject({
			version: 1,
			method: 'manual',
			manual: { percent: 35, note: 'Five interviews complete' }
		});
		expect(body.props.goal_tracking.updated_at).toEqual(expect.any(String));
		expect(onSaved).toHaveBeenCalledWith(updatedGoal);
	});
});
