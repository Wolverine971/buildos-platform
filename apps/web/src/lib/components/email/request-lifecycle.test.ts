// apps/web/src/lib/components/email/request-lifecycle.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmailManager from './EmailManager.svelte';
import RecipientSelector from './RecipientSelector.svelte';

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

			// Ignore aborts so stale-response protection is exercised independently.
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

describe('EmailManager request lifecycle', () => {
	it('owns one initial request and ignores an aborted response that resolves late', async () => {
		const requests = captureRequests();
		render(EmailManager);

		await waitFor(() => expect(requests).toHaveLength(1));
		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(requests).toHaveLength(1);

		const initialRequest = requests[0];
		await fireEvent.input(
			screen.getByPlaceholderText('Search emails by subject or content...'),
			{ target: { value: 'newest' } }
		);

		await waitFor(() => expect(initialRequest.signal?.aborted).toBe(true));
		await waitFor(() => expect(requests).toHaveLength(2), { timeout: 1_000 });

		const currentRequest = requests[1];
		expect(currentRequest.url).toContain('search=newest');
		await settleResponse(
			currentRequest,
			jsonResponse({
				success: true,
				data: {
					emails: [
						{
							id: 'current-email',
							subject: 'Newest email',
							status: 'draft',
							created_at: '2026-07-14T12:00:00.000Z',
							email_recipients: []
						}
					],
					pagination: { total_pages: 1, total_items: 1 }
				}
			})
		);
		await waitFor(() => expect(screen.getAllByText('Newest email').length).toBeGreaterThan(0));

		await settleResponse(
			initialRequest,
			jsonResponse({
				success: true,
				data: {
					emails: [
						{
							id: 'stale-email',
							subject: 'Stale email',
							status: 'draft',
							created_at: '2026-07-14T11:00:00.000Z',
							email_recipients: []
						}
					],
					pagination: { total_pages: 1, total_items: 1 }
				}
			})
		);

		expect(screen.queryByText('Stale email')).not.toBeInTheDocument();
		expect(screen.getAllByText('Newest email').length).toBeGreaterThan(0);
	});
});

describe('RecipientSelector request lifecycle', () => {
	it('loads each recipient source once and ignores results from a previous opening', async () => {
		const requests = captureRequests();
		const view = render(RecipientSelector, {
			props: { isOpen: true, selectedRecipients: [] }
		});

		await waitFor(() => expect(requests).toHaveLength(2));
		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(requests).toHaveLength(2);
		const staleRequests = requests.slice();

		await view.rerender({ isOpen: false, selectedRecipients: [] });
		await waitFor(() =>
			expect(staleRequests.every(({ signal }) => signal?.aborted)).toBe(true)
		);

		await view.rerender({ isOpen: true, selectedRecipients: [] });
		await waitFor(() => expect(requests).toHaveLength(4));
		const currentRequests = requests.slice(2);

		for (const request of currentRequests) {
			const isUserRequest = request.url.includes('source=beta_users');
			request.response.resolve(
				jsonResponse({
					success: true,
					data: {
						recipients: isUserRequest
							? [
									{
										id: 'current-user',
										name: 'Current Recipient',
										email: 'current@example.com',
										company: 'BuildOS',
										status: 'approved'
									}
								]
							: []
					}
				})
			);
		}
		await Promise.all(currentRequests.map(({ response }) => response.promise));
		await waitFor(() => expect(screen.getByText('Current Recipient')).toBeInTheDocument());

		for (const request of staleRequests) {
			const isUserRequest = request.url.includes('source=beta_users');
			request.response.resolve(
				jsonResponse({
					success: true,
					data: {
						recipients: isUserRequest
							? [
									{
										id: 'stale-user',
										name: 'Stale Recipient',
										email: 'stale@example.com',
										company: 'BuildOS',
										status: 'approved'
									}
								]
							: []
					}
				})
			);
		}
		await Promise.all(staleRequests.map(({ response }) => response.promise));
		await Promise.resolve();
		await tick();

		expect(screen.queryByText('Stale Recipient')).not.toBeInTheDocument();
		expect(screen.getByText('Current Recipient')).toBeInTheDocument();
	});
});
