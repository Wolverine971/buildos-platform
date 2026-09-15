// scripts/agentic/http-trace.mjs
// Gate-only request metadata. Never reads request/response bodies or credentials.
import { performance } from 'node:perf_hooks';

export function createGateHttpTraceFetch(
	fetchImpl,
	{ origin, emit, now = () => performance.now() }
) {
	return async function tracedFetch(input, init) {
		let endpoint = null;
		try {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (
				url.origin === origin &&
				/^\/(?:rest\/v1\/(?:rpc\/)?[a-z][a-z0-9_]*|auth\/v1\/[a-z][a-z0-9_]*)$/.test(
					url.pathname
				)
			)
				endpoint = url.pathname;
		} catch {
			/* Let the original fetch validate its input. */
		}
		if (!endpoint) return fetchImpl(input, init);
		const startedAt = new Date().toISOString();
		const start = now();
		const utilization = performance.eventLoopUtilization();
		const base = {
			event: 'agentic_gate_http_trace',
			pid: process.pid,
			endpoint,
			method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
			startedAt
		};
		const report = (extra) => {
			try {
				emit({
					...base,
					headersObservedAt: new Date().toISOString(),
					responseHeadersMs: Math.max(0, now() - start),
					eventLoopUtilization: performance.eventLoopUtilization(utilization).utilization,
					...extra
				});
			} catch {
				/* Logging cannot change the request result. */
			}
		};
		try {
			const response = await fetchImpl(input, init);
			const numeric = (name) => {
				const value = response.headers.get(name);
				return value !== null && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
			};
			const requestId = response.headers.get('sb-request-id');
			report({
				status: response.status,
				upstreamServiceMs: numeric('x-envoy-upstream-service-time'),
				upstreamAttempts: numeric('x-envoy-attempt-count'),
				requestId: requestId && /^[a-zA-Z0-9-]{1,80}$/.test(requestId) ? requestId : null
			});
			return response;
		} catch (error) {
			report({
				status: null,
				outcome:
					init?.signal?.aborted || (input instanceof Request && input.signal.aborted)
						? 'aborted'
						: 'failed'
			});
			throw error;
		}
	};
}

if (
	process.env.AGENTIC_GATE_HTTP_TRACE === 'true' &&
	process.env.AGENTIC_GATE_DATABASE_ISOLATED === 'true'
) {
	globalThis.fetch = createGateHttpTraceFetch(globalThis.fetch.bind(globalThis), {
		origin: new URL(process.env.PUBLIC_SUPABASE_URL).origin,
		emit: (trace) => console.info(JSON.stringify(trace))
	});
}
