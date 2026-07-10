// apps/web/src/lib/components/notifications/types/agent-run/ChangeSetReview.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ChangeSetReview from './ChangeSetReview.svelte';
import type { ChangeSet } from '@buildos/shared-types';

const { loadAiInboxCountMock, toastWarningMock, notifyDataMutationMock } = vi.hoisted(() => ({
	loadAiInboxCountMock: vi.fn(),
	toastWarningMock: vi.fn(),
	notifyDataMutationMock: vi.fn()
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warning: toastWarningMock
	}
}));

vi.mock('$lib/stores/projectDataMutations', () => ({
	notifyDataMutation: notifyDataMutationMock
}));

vi.mock('$lib/stores/aiInboxCount.store', () => ({
	loadAiInboxCount: loadAiInboxCountMock
}));

const changeSet: ChangeSet = {
	run_id: 'run-1',
	status: 'pending',
	created_at: '2026-07-03T12:00:00.000Z',
	changes: [
		{
			id: 'change-1',
			op: 'onto.task.update',
			entity_type: 'task',
			entity_id: 'task-1',
			action: 'update',
			before: { title: 'Old title', project_id: 'project-1' },
			after: { title: 'New title', project_id: 'project-1' },
			rationale: 'Keep the task current.'
		}
	]
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('ChangeSetReview', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('does not open chat automatically when applying leaves failed changes', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse(200, {
					success: true,
					data: {
						applied: 0,
						failed: 1,
						rejected: 0
					}
				})
			)
		);
		const onChat = vi.fn();
		const onApplied = vi.fn();

		render(ChangeSetReview, {
			props: {
				runId: 'run-1',
				changeSet,
				onChat,
				onApplied
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));

		await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
		expect(loadAiInboxCountMock).toHaveBeenCalledWith({ force: true });
		expect(onChat).not.toHaveBeenCalled();
		expect(toastWarningMock).toHaveBeenCalledWith(
			'Applied 0, 1 failed, 0 rejected. Use Chat for follow-up.'
		);
	});
});
