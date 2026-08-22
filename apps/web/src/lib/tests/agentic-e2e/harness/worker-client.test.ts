// apps/web/src/lib/tests/agentic-e2e/harness/worker-client.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createAuthenticatedHarnessFetch,
	requireAdvertisedMutationTools,
	resolveAgenticE2EExecutionMode,
	waitForWorkerTerminalWithRecovery
} from './worker-client';

function healthResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('agentic E2E worker client boundaries', () => {
	afterEach(() => {
		vi.useRealTimers();
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

	it('recovers a missed terminal broadcast from durable truth after the deadline', async () => {
		vi.useFakeTimers();
		let resolveTerminal!: () => void;
		const terminal = new Promise<void>((resolve) => {
			resolveTerminal = resolve;
		});
		const requestReconciliation = vi.fn(() => {
			setTimeout(resolveTerminal, 10);
		});
		const waiting = waitForWorkerTerminalWithRecovery({
			terminal,
			turnRunId: 'd4000000-0000-4000-8000-000000000001',
			requestReconciliation,
			timeoutMs: 100,
			recoveryTimeoutMs: 50
		});

		await vi.advanceTimersByTimeAsync(100);
		expect(requestReconciliation).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(10);
		await expect(waiting).resolves.toBeUndefined();
	});

	it('reports a distinct failure when final durable reconciliation also misses', async () => {
		vi.useFakeTimers();
		const requestReconciliation = vi.fn();
		const waiting = waitForWorkerTerminalWithRecovery({
			terminal: new Promise<void>(() => undefined),
			turnRunId: 'd4000000-0000-4000-8000-000000000001',
			requestReconciliation,
			timeoutMs: 100,
			recoveryTimeoutMs: 50
		});
		const rejected = expect(waiting).rejects.toThrow(
			'did not terminate after final durable reconciliation'
		);

		await vi.advanceTimersByTimeAsync(150);
		await rejected;
		expect(requestReconciliation).toHaveBeenCalledOnce();
	});

	it('does not hide a non-timeout terminal observer failure behind reconciliation', async () => {
		const requestReconciliation = vi.fn();
		await expect(
			waitForWorkerTerminalWithRecovery({
				terminal: Promise.reject(new Error('terminal observer failed')),
				turnRunId: 'd4000000-0000-4000-8000-000000000001',
				requestReconciliation,
				timeoutMs: 100,
				recoveryTimeoutMs: 50
			})
		).rejects.toThrow('terminal observer failed');
		expect(requestReconciliation).not.toHaveBeenCalled();
	});
});

describe('requireAdvertisedMutationTools', () => {
	it('passes when the advertised tool set is a superset of what is required', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			healthResponse({
				agenticChat: {
					mutationCapabilities: {
						provider: { count: 2, names: ['create_onto_task', 'update_onto_task'] },
						adapter: { count: 2, names: ['create_onto_task', 'update_onto_task'] },
						advertisedMutationToolNames: [
							'create_onto_task',
							'update_onto_task',
							'create_onto_document'
						]
					}
				}
			})
		);

		const result = await requireAdvertisedMutationTools({
			healthUrl: 'https://worker.example',
			required: ['create_onto_task', 'update_onto_task'],
			fetchImpl
		});

		expect(result.advertised).toEqual([
			'create_onto_task',
			'update_onto_task',
			'create_onto_document'
		]);
		expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/health');
	});

	it('throws a distinct error when the worker predates capability readback', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => healthResponse({ ok: true }));

		await expect(
			requireAdvertisedMutationTools({
				healthUrl: 'https://worker.example',
				required: ['create_onto_task'],
				fetchImpl
			})
		).rejects.toThrow(
			'[agentic-e2e] worker /health has no agenticChat.mutationCapabilities field — deployed worker predates the capability readback; deploy before running mutation scenarios'
		);
	});

	it('throws listing the missing tools when the worker does not advertise them all', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			healthResponse({
				agenticChat: {
					mutationCapabilities: {
						provider: { count: 1, names: ['create_onto_task'] },
						adapter: { count: 1, names: ['create_onto_task'] },
						advertisedMutationToolNames: ['create_onto_task']
					}
				}
			})
		);

		await expect(
			requireAdvertisedMutationTools({
				healthUrl: 'https://worker.example',
				required: ['create_onto_task', 'update_onto_task'],
				fetchImpl
			})
		).rejects.toThrow(
			'[agentic-e2e] worker does not advertise required write tools: [update_onto_task]; advertised: [create_onto_task]; refusing to spend on a read-only worker'
		);
	});

	it('skips the fetch entirely when no tools are required', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => healthResponse({}));

		const result = await requireAdvertisedMutationTools({
			healthUrl: 'https://worker.example',
			required: [],
			fetchImpl
		});

		expect(result.advertised).toEqual([]);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('throws on a non-2xx health response', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => healthResponse({}, 503));

		await expect(
			requireAdvertisedMutationTools({
				healthUrl: 'https://worker.example',
				required: ['create_onto_task'],
				fetchImpl
			})
		).rejects.toThrow('[agentic-e2e] worker health 503');
	});
});
