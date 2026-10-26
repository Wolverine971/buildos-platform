// apps/web/src/lib/components/email-campaigns/SentLog.test.ts
// @vitest-environment jsdom
// Ported from the retired EmailManager request-lifecycle test: one effect owns
// list requests, and a superseded response that lands late is ignored.
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SentLog from './SentLog.svelte';

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
	return { ok: true, status: 200, json: async () => payload } as Response;
}

function listPayload(id: string, subject: string) {
	return {
		success: true,
		data: {
			emails: [
				{
					id,
					subject,
					status: 'sent',
					category: null,
					created_at: '2026-10-25T12:00:00.000Z',
					email_recipients: [{ id: `${id}-r`, recipient_email: 'kay@example.com' }]
				}
			],
			pagination: { total_pages: 1, total_items: 1 }
		}
	};
}

function captureRequests(): PendingRequest[] {
	const requests: PendingRequest[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const response = deferred<Response>();
			requests.push({ url: String(input), signal: init?.signal ?? null, response });
			return response.promise;
		})
	);
	return requests;
}

async function settle(request: PendingRequest, response: Response) {
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
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('SentLog', () => {
	it('hides automatic email by default and asks for it when toggled', async () => {
		const requests = captureRequests();
		render(SentLog);

		await waitFor(() => expect(requests).toHaveLength(1));
		expect(requireTestValue(requests[0]).url).toContain('hide_automatic=true');

		await fireEvent.click(screen.getByLabelText('Show automatic emails'));
		await waitFor(() => expect(requests).toHaveLength(2));
		expect(requireTestValue(requests[1]).url).not.toContain('hide_automatic');
	});

	it('owns one request at a time and ignores a superseded response', async () => {
		const requests = captureRequests();
		render(SentLog);

		await waitFor(() => expect(requests).toHaveLength(1));
		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(requests).toHaveLength(1);
		const initial = requireTestValue(requests[0]);

		await fireEvent.input(
			screen.getByPlaceholderText('Search emails by subject or content...'),
			{
				target: { value: 'newest' }
			}
		);
		await waitFor(() => expect(initial.signal?.aborted).toBe(true));
		await waitFor(() => expect(requests).toHaveLength(2), { timeout: 1_000 });

		const current = requireTestValue(requests[1]);
		expect(current.url).toContain('search=newest');
		await settle(current, jsonResponse(listPayload('current', 'Newest email')));
		await waitFor(() => expect(screen.getByText('Newest email')).toBeInTheDocument());

		await settle(initial, jsonResponse(listPayload('stale', 'Stale email')));
		expect(screen.queryByText('Stale email')).not.toBeInTheDocument();
		expect(screen.getByText('Newest email')).toBeInTheDocument();
	});
});
