// apps/web/src/routes/admin/list-request-lifecycle.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackPage from './feedback/+page.svelte';
import UsersPage from './users/+page.svelte';

vi.mock('$app/stores', () => ({
	page: {
		subscribe(callback: (value: { url: URL }) => void) {
			callback({ url: new URL('http://localhost/admin/users') });
			return () => undefined;
		}
	}
}));

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

interface PendingRequest {
	url: string;
	signal: AbortSignal | null;
	response: Deferred<Response>;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
}

function jsonResponse(payload: unknown): Response {
	return {
		ok: true,
		status: 200,
		json: async () => payload
	} as Response;
}

function captureRequests(): PendingRequest[] {
	const requests: PendingRequest[] = [];

	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const response = deferred<Response>();
			requests.push({
				url: String(input),
				signal: init?.signal ?? null,
				response
			});

			// Ignore aborts so the components must reject stale results themselves.
			return response.promise;
		})
	);

	return requests;
}

async function settleResponse(request: PendingRequest, response: Response) {
	request.response.resolve(response);
	await request.response.promise;
	await Promise.resolve();
	await tick();
}

function feedbackResponse(id: string, text: string): Response {
	return jsonResponse({
		success: true,
		data: {
			feedback: [
				{
					id,
					feedback_text: text,
					user_email: 'user@example.com',
					user_name: 'Test User',
					category: 'general',
					status: 'new',
					rating: 4,
					created_at: '2026-07-14T12:00:00.000Z'
				}
			],
			pagination: { total_pages: 1, total_items: 1 }
		}
	});
}

function usersResponse(id: string, name: string, page: number): Response {
	return jsonResponse({
		success: true,
		data: {
			users: [
				{
					id,
					name,
					email: `${id}@example.com`,
					is_admin: false,
					last_visit: null,
					created_at: '2026-07-14T12:00:00.000Z',
					project_count: 0,
					chat_session_count: 0,
					chat_message_count: 0,
					daily_brief_count: 0,
					daily_brief_opt_in: false,
					calendar_connected: false,
					ontology_entity_total: 0,
					onboarding_completed_at: null
				}
			],
			pagination: { page, totalPages: 2, total: 40 }
		}
	});
}

function clientSortedUsersResponse(count: number): Response {
	return jsonResponse({
		success: true,
		data: {
			users: Array.from({ length: count }, (_, index) => ({
				id: `client-user-${index}`,
				name: `Client User ${index}`,
				email: `client-user-${index}@example.com`,
				is_admin: false,
				last_visit: null,
				created_at: '2026-07-14T12:00:00.000Z',
				project_count: index,
				chat_session_count: 0,
				chat_message_count: 0,
				daily_brief_count: 0,
				daily_brief_opt_in: false,
				calendar_connected: false,
				ontology_entity_total: 0,
				onboarding_completed_at: null
			})),
			pagination: { page: 1, totalPages: 1, total: count }
		}
	});
}

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
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('admin feedback request lifecycle', () => {
	it('starts once and ignores an aborted search response that resolves late', async () => {
		const requests = captureRequests();
		render(FeedbackPage);

		await waitFor(() => expect(requests).toHaveLength(1));
		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(requests).toHaveLength(1);
		const staleRequest = requests[0];

		await fireEvent.input(
			screen.getByPlaceholderText('Search feedback text or user email...'),
			{ target: { value: 'current' } }
		);

		await waitFor(() => expect(staleRequest.signal?.aborted).toBe(true));
		await waitFor(() => expect(requests).toHaveLength(2), { timeout: 1_000 });
		const currentRequest = requests[1];
		expect(currentRequest.url).toContain('search=current');

		await settleResponse(
			currentRequest,
			feedbackResponse('current-feedback', 'Current feedback')
		);
		await waitFor(() =>
			expect(screen.getAllByText('Current feedback').length).toBeGreaterThan(0)
		);

		await settleResponse(staleRequest, feedbackResponse('stale-feedback', 'Stale feedback'));

		expect(screen.queryByText('Stale feedback')).not.toBeInTheDocument();
		expect(screen.getAllByText('Current feedback').length).toBeGreaterThan(0);
	});
});

describe('admin users request lifecycle', () => {
	it('issues one server request for page two and does not reset pagination', async () => {
		const requests = captureRequests();
		render(UsersPage);

		await waitFor(() => expect(requests).toHaveLength(1));
		await settleResponse(requests[0], usersResponse('page-one-user', 'Page One User', 1));
		await waitFor(() => expect(screen.getAllByText('Page One User').length).toBeGreaterThan(0));

		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		await waitFor(() => expect(requests).toHaveLength(2));
		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(requests).toHaveLength(2);
		expect(requests[1].url).toContain('page=2');

		await settleResponse(requests[1], usersResponse('page-two-user', 'Page Two User', 2));
		await waitFor(() => expect(screen.getAllByText('Page Two User').length).toBeGreaterThan(0));
	});

	it('paginates an already-fetched client-sort result without another request', async () => {
		const requests = captureRequests();
		render(UsersPage);

		await waitFor(() => expect(requests).toHaveLength(1));
		await settleResponse(requests[0], usersResponse('initial-user', 'Initial User', 1));
		await fireEvent.click(screen.getByRole('button', { name: 'Filters & Sort' }));
		await fireEvent.change(screen.getByLabelText('Sort by'), {
			target: { value: 'project_count' }
		});

		await waitFor(() => expect(requests).toHaveLength(2));
		expect(requests[1].url).toContain('limit=1000');
		await settleResponse(requests[1], clientSortedUsersResponse(21));
		await waitFor(() =>
			expect(screen.getAllByText('Client User 20').length).toBeGreaterThan(0)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		await waitFor(() => expect(screen.getAllByText('Client User 0').length).toBeGreaterThan(0));
		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(requests).toHaveLength(2);
	});
});
