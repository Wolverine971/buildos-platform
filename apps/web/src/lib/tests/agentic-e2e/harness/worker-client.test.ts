import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthenticatedHarnessFetch, resolveAgenticE2EExecutionMode } from './worker-client';

describe('agentic E2E worker client boundaries', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.AGENTIC_E2E_EXECUTION_MODE;
	});

	it('defaults to legacy but accepts only the two explicit execution modes', () => {
		delete process.env.AGENTIC_E2E_EXECUTION_MODE;
		expect(resolveAgenticE2EExecutionMode()).toBe('legacy_sse');
		expect(resolveAgenticE2EExecutionMode(' worker_realtime ')).toBe('worker_realtime');
		expect(resolveAgenticE2EExecutionMode('legacy_sse')).toBe('legacy_sse');
		expect(() => resolveAgenticE2EExecutionMode('auto')).toThrow(
			'AGENTIC_E2E_EXECUTION_MODE must be legacy_sse or worker_realtime'
		);
	});

	it('prefixes product-relative requests and carries the authenticated cookie', async () => {
		const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);
		const authenticatedFetch = createAuthenticatedHarnessFetch(
			'https://build-os.example/base',
			'sb-auth-token=secret-cookie'
		);

		await authenticatedFetch('/api/agent/v2/transport', {
			method: 'POST',
			headers: { Accept: 'application/json' }
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe('https://build-os.example/api/agent/v2/transport');
		const headers = new Headers(init?.headers);
		expect(headers.get('accept')).toBe('application/json');
		expect(headers.get('cookie')).toBe('sb-auth-token=secret-cookie');
	});
});
