// apps/web/src/lib/components/project/ProjectParentPickerModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFamilyV1 } from '@buildos/shared-types';
import ProjectParentPickerModal from './ProjectParentPickerModal.svelte';
import { fetchParentCandidates, type ParentCandidate } from './project-family';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('$lib/stores/toast.store', () => ({ toastService: toast }));
vi.mock('./project-family', async (importOriginal) => ({
	...(await importOriginal<typeof import('./project-family')>()),
	fetchParentCandidates: vi.fn()
}));

const candidate = (overrides: Partial<ParentCandidate> = {}): ParentCandidate => ({
	id: 'hub',
	name: 'Wayne Strategies',
	stateKey: 'active',
	updatedAt: '',
	parentProjectId: null,
	parentProjectName: null,
	hasChildren: false,
	accessLevel: 'admin',
	...overrides
});

const family = (parent: ProjectFamilyV1['parent']): ProjectFamilyV1 => ({
	project_id: 'redline',
	parent,
	shelf: [],
	children: [],
	own_shared_folder_document_id: null,
	child_count: 0
});
const respond = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

describe('ProjectParentPickerModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('scrollTo', vi.fn());
		vi.mocked(fetchParentCandidates).mockResolvedValue([candidate()]);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("offers only removal to a parent's admin who can't move this project", async () => {
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
		const onChanged = vi.fn();
		render(ProjectParentPickerModal, {
			isOpen: true,
			projectId: 'redline',
			projectName: 'Redline',
			canMove: false,
			family: family({
				id: 'hub',
				name: 'Wayne Strategies',
				state_key: 'active',
				can_write: true,
				shared_folder_document_id: 'folder',
				child_count: 1,
				can_detach: true
			}),
			onClose: vi.fn(),
			onChanged
		});
		expect(screen.queryByRole('searchbox', { name: 'Search projects' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Remove from Wayne Strategies' }));
		await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/onto/projects/redline/parent',
			expect.objectContaining({ body: JSON.stringify({ parent_project_id: null }) })
		);
	});

	it('focuses search first and shows a refused attach message by the buttons', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				respond(
					{ success: false, error: 'You need admin access to Wayne Strategies.' },
					403
				)
			)
		);
		render(ProjectParentPickerModal, {
			isOpen: true,
			projectId: 'redline',
			projectName: 'Redline',
			family: family(null),
			onClose: vi.fn()
		});
		expect(screen.getByRole('searchbox', { name: 'Search projects' })).toHaveAttribute(
			'data-autofocus'
		);
		await fireEvent.click(await screen.findByRole('button', { name: /Wayne Strategies/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Move under Wayne Strategies' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'You need admin access to Wayne Strategies.'
		);
	});

	it('greys out parents the server would refuse, with the reason', async () => {
		vi.mocked(fetchParentCandidates).mockResolvedValue([
			candidate({ hasChildren: true }),
			candidate({
				id: 'redline',
				name: 'Redline',
				parentProjectId: 'hub',
				parentProjectName: 'Wayne Strategies'
			}),
			candidate({ id: 'cadre', name: 'The Cadre', accessLevel: 'write' }),
			candidate({ id: 'studio', name: 'DJ Wayne Studio', accessLevel: null })
		]);
		render(ProjectParentPickerModal, {
			isOpen: true,
			projectId: 'beyond-exit',
			projectName: 'Beyond Exit',
			family: family(null),
			onClose: vi.fn()
		});
		const hub = await screen.findByRole('button', { name: /^Wayne Strategies/ });
		expect(hub).toBeEnabled();
		expect(hub).toHaveTextContent('Has sub-projects');
		expect(screen.getByRole('button', { name: /^Redline/ })).toBeDisabled();
		expect(screen.getByText('Already inside Wayne Strategies')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^The Cadre/ })).toBeDisabled();
		expect(screen.getByText('Needs admin access')).toBeInTheDocument();
		// Unknown access is left to the server.
		expect(screen.getByRole('button', { name: /^DJ Wayne Studio/ })).toBeEnabled();
		expect(fetchParentCandidates).toHaveBeenCalledWith(expect.objectContaining({ search: '' }));
	});
});
