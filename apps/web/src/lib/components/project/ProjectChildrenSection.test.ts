// apps/web/src/lib/components/project/ProjectChildrenSection.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFamilyChildV1 } from '@buildos/shared-types';
import ProjectChildrenSection from './ProjectChildrenSection.svelte';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({ toastService: toast }));

const child = (id: string, name: string, can_detach: boolean): ProjectFamilyChildV1 => ({
	id,
	name,
	state_key: 'active',
	next_step_short: null,
	updated_at: '2026-09-30T12:00:00Z',
	can_detach
});
const respond = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

describe('ProjectChildrenSection detach', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('scrollTo', vi.fn());
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});
	function setup(onFamilyChanged = vi.fn()) {
		render(ProjectChildrenSection, {
			projectId: 'hub',
			projectName: 'Wayne Strategies',
			canEdit: true,
			subProjects: [child('redline', 'Redline', true), child('other', 'Other', false)],
			totalCount: 2,
			onFamilyChanged
		});
		return onFamilyChanged;
	}

	it('confirms, detaches through the parent endpoint, refreshes and toasts', async () => {
		const fetchMock = vi.fn(async () =>
			respond({
				success: true,
				data: {
					project_id: 'redline',
					parent_project_id: null,
					previous_parent_project_id: 'hub',
					shared_folder_document_id: null
				}
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const onFamilyChanged = setup();
		expect(
			screen.queryByRole('button', { name: 'Remove Other from Wayne Strategies' })
		).toBeNull();
		await fireEvent.click(
			screen.getByRole('button', { name: 'Remove Redline from Wayne Strategies' })
		);
		expect(screen.getByText('Remove Redline from Wayne Strategies?')).toBeInTheDocument();
		expect(
			screen.getByText(
				"It keeps all its docs and tasks. It will stop showing Wayne Strategies' shared docs."
			)
		).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
		await waitFor(() => expect(onFamilyChanged).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/onto/projects/redline/parent',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ parent_project_id: null })
			})
		);
		expect(toast.success).toHaveBeenCalledWith('Removed Redline from Wayne Strategies');
		await waitFor(() =>
			expect(screen.queryByText('Remove Redline from Wayne Strategies?')).toBeNull()
		);
	});

	it('keeps the dialog open with the server message when detaching is refused', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				respond({ success: false, error: 'Only an admin can remove this project.' }, 403)
			)
		);
		const onFamilyChanged = setup();
		await fireEvent.click(
			screen.getByRole('button', { name: 'Remove Redline from Wayne Strategies' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Only an admin can remove this project.'
		);
		expect(onFamilyChanged).not.toHaveBeenCalled();
	});
});
