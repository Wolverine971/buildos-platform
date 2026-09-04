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
	const originalTimezone = process.env.TZ;

	beforeEach(() => {
		// Project timeline instants are civil-day boundaries in the owner's
		// timezone, so these assertions only mean something in a fixed zone.
		process.env.TZ = 'America/New_York';
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			writable: true,
			value: vi.fn((query: string) => ({
				matches: query === '(min-width: 1024px)',
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn()
			}))
		});
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
		process.env.TZ = originalTimezone;
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

	it('sends the bare calendar date only when the visible date changes', async () => {
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
			start_at: '2026-01-22'
		});
		expect(toastSuccess).toHaveBeenCalledWith('Project updated');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('shows the local civil day for an end-of-day instant and leaves it alone', async () => {
		const civilDayProject = project({
			// 23:59:59 on Nov 20 in America/New_York.
			start_at: '2026-11-02T05:00:00.000Z',
			end_at: '2026-11-21T04:59:59.000Z'
		});
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
				project: civilDayProject
			}
		});

		const startInput = await screen.findByLabelText('Start');
		const endInput = screen.getByLabelText('End');
		expect(startInput).toHaveValue('2026-11-02');
		expect(endInput).toHaveValue('2026-11-20');

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('No changes to save'));
		expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
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
