// apps/web/src/lib/components/ontology/OntologyProjectEditModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '$lib/types/onto';
import OntologyProjectEditModal from './OntologyProjectEditModal.svelte';

const { toastInfo, toastSuccess } = vi.hoisted(() => ({
	toastInfo: vi.fn(),
	toastSuccess: vi.fn()
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		add: vi.fn(),
		error: vi.fn(),
		info: toastInfo,
		success: toastSuccess
	}
}));

vi.mock('$lib/utils/ontology-client-logger', () => ({
	logOntologyClientError: vi.fn()
}));

function project(overrides: Partial<Project> = {}): Project {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		org_id: null,
		name: 'Mobile Project',
		description: 'A compact project editor.',
		type_key: 'project.default',
		state_key: 'planning',
		props: {},
		facet_context: 'client',
		facet_scale: 'small',
		facet_stage: 'execution',
		start_at: '2026-01-21T15:45:00.000Z',
		end_at: '2026-02-12T18:30:00.000Z',
		created_by: '22222222-2222-4222-8222-222222222222',
		created_at: '2026-01-21T15:45:00.000Z',
		updated_at: '2026-07-14T17:26:00.000Z',
		...overrides
	};
}

function commentsResponse(): Response {
	return new Response(
		JSON.stringify({
			data: {
				comments: [],
				actorId: null
			}
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

describe('OntologyProjectEditModal date saving', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'scrollTo', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			writable: true,
			value: vi.fn(() => ({
				cancel: vi.fn(),
				commitStyles: vi.fn(),
				finished: Promise.resolve(),
				play: vi.fn()
			}))
		});
		Object.defineProperty(HTMLElement.prototype, 'checkVisibility', {
			configurable: true,
			writable: true,
			value: vi.fn(() => true)
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('does not rewrite unchanged timestamped dates to midnight', async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/onto/comments?')) {
				return Promise.resolve(commentsResponse());
			}
			return Promise.resolve(
				new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 })
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		render(OntologyProjectEditModal, {
			props: {
				isOpen: true,
				project: project()
			}
		});

		const nameInput = await screen.findByLabelText(/Project Name/);
		const startInput = screen.getByLabelText('Start');
		const endInput = screen.getByLabelText('End');
		const formId = nameInput.getAttribute('form');

		expect(formId).toMatch(/^project-edit-form-/);
		expect(startInput).toHaveAttribute('form', formId);
		expect(endInput).toHaveAttribute('form', formId);
		expect(document.getElementById(String(formId))).toBeInstanceOf(HTMLFormElement);
		expect(startInput).toHaveValue('2026-01-21');
		expect(endInput).toHaveValue('2026-02-12');

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('No changes to save'));
		expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
	});

	it('sends midnight UTC only when the visible calendar date changes', async () => {
		const initialProject = project();
		const updatedProject = project({ start_at: '2026-01-22T00:00:00.000Z' });
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/onto/comments?')) {
				return Promise.resolve(commentsResponse());
			}
			if (url === `/api/onto/projects/${initialProject.id}` && init?.method === 'PATCH') {
				return Promise.resolve(
					new Response(JSON.stringify({ data: { project: updatedProject } }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 })
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const onSaved = vi.fn();
		const onClose = vi.fn();

		render(OntologyProjectEditModal, {
			props: {
				isOpen: true,
				project: initialProject,
				onSaved,
				onClose
			}
		});

		const startInput = await screen.findByLabelText('Start');
		await fireEvent.input(startInput, { target: { value: '2026-01-22' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updatedProject));
		const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
		expect(patchCall).toBeDefined();
		expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
			start_at: '2026-01-22T00:00:00.000Z'
		});
		expect(toastSuccess).toHaveBeenCalledWith('Project updated');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('blocks a reversed date range before making an update request', async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/onto/comments?')) {
				return Promise.resolve(commentsResponse());
			}
			return Promise.resolve(
				new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 })
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		render(OntologyProjectEditModal, {
			props: {
				isOpen: true,
				project: project()
			}
		});

		const endInput = await screen.findByLabelText('End');
		await fireEvent.input(endInput, { target: { value: '2026-01-20' } });
		const formId = endInput.getAttribute('form');
		const form = document.getElementById(String(formId));
		expect(form).toBeInstanceOf(HTMLFormElement);
		await fireEvent.submit(form as HTMLFormElement);

		expect(
			await screen.findByText('End date cannot be before the start date.')
		).toBeInTheDocument();
		expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
	});
});
