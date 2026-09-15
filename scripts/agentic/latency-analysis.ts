// scripts/agentic/latency-analysis.ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function distribution(values: number[]) {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	const n = sorted.length;
	return {
		count: n,
		medianMs: n ? (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.floor(n / 2)]!) / 2 : null,
		p90Ms: n ? sorted[Math.ceil(n * 0.9) - 1] : null,
		maxMs: n ? sorted[n - 1] : null
	};
}

/** Analyze retained evidence only; never dispatches or retries a product turn. */
export function writeGateLatencyAnalysis(directory: string): void {
	const turnsDirectory = join(directory, 'turns');
	if (!existsSync(turnsDirectory)) return;
	const log = join(directory, 'worker.log');
	const traces: Record<string, any>[] = [];
	const httpTraces: Record<string, any>[] = [];
	for (const service of ['worker', 'web', 'battery']) {
		const file = join(directory, `${service}.log`);
		if (!existsSync(file)) continue;
		for (const line of readFileSync(file, 'utf8').split('\n')) {
			if (!line.includes('"event":"agentic_gate_http_trace"')) continue;
			try {
				httpTraces.push({ ...JSON.parse(line.slice(line.indexOf('{'))), service });
			} catch {
				/* Non-JSON logging line. */
			}
		}
	}
	if (existsSync(log)) {
		for (const line of readFileSync(log, 'utf8').split('\n')) {
			if (!line.includes('"event":"agentic_chat_persistence_trace"')) continue;
			try {
				traces.push(JSON.parse(line.slice(line.indexOf('{'))));
			} catch {
				/* Non-JSON logging line. */
			}
		}
	}
	const turns = readdirSync(turnsDirectory)
		.filter((name) => name.endsWith('.json'))
		.sort()
		.map((file) => {
			const evidence = JSON.parse(readFileSync(join(turnsDirectory, file), 'utf8'));
			const { timing, serverTiming } = evidence.result;
			const turnRunId =
				evidence.result.rawEvents?.find(
					(event: Record<string, unknown>) => typeof event.turn_run_id === 'string'
				)?.turn_run_id ??
				evidence.modelPasses?.[0]?.turn_run_id ??
				null;
			const turnTraces = traces.filter((trace) => trace.turnRunId === turnRunId);
			const observedAt =
				typeof timing.terminalEventMs === 'number'
					? Date.parse(timing.requestStartedAt) + timing.terminalEventMs
					: NaN;
			const terminalAt = Date.parse(serverTiming?.terminal_committed_at);
			const terminalObservationEstimateMs = Number.isFinite(observedAt - terminalAt)
				? observedAt - terminalAt
				: null;
			const publisherAttempts = turnTraces.filter(
				(t) => t.lane === 'publisher' && t.stage === 'attempt_finished'
			);
			const usageAttempts = turnTraces.filter(
				(t) => t.lane === 'usage' && t.stage === 'attempt_finished'
			);
			return {
				file,
				turnRunId,
				durationMs: timing.totalDurationMs,
				intakeRequests: timing.intakeRequests ?? null,
				terminalObservationEstimateMs,
				publisherAttempts: distribution(publisherAttempts.map((t) => t.durationMs)),
				usagePersistence: distribution(usageAttempts.map((t) => t.durationMs)),
				persistenceRetries: turnTraces.length
					? turnTraces.filter((t) => t.stage === 'retry_scheduled').length
					: null,
				pressureWaits: distribution(
					turnTraces
						.filter((t) => t.stage === 'pressure_finished')
						.map((t) => t.durationMs)
				),
				failedUsageWrites: turnTraces.length
					? usageAttempts.filter((t) => t.outcome !== 'persisted').length
					: null,
				slowAttempts: [...publisherAttempts, ...usageAttempts].filter(
					(t) => t.durationMs >= 1000
				)
			};
		});
	writeFileSync(
		join(directory, 'latency-analysis.json'),
		JSON.stringify(
			{
				version: 2,
				terminalObservationMetric:
					'client request wall time + monotonic terminal offset - database terminal timestamp',
				caveat: 'Cross-clock estimate, including transaction completion after its database timestamp; subject to clock skew. Missing traces are unknown, not zero. Admission-to-headers time is not subtracted twice.',
				terminalObservationEstimate: distribution(
					turns.flatMap((t) =>
						t.terminalObservationEstimateMs === null
							? []
							: [t.terminalObservationEstimateMs]
					)
				),
				traceCount: traces.length,
				httpTraceCount: httpTraces.length,
				httpTimingMetric:
					'Application wait to response headers versus gateway-reported upstream service duration. Neither includes subsequent response-body consumption. Gateway timing is not SQL execution time.',
				httpResponseHeaders: distribution(httpTraces.map((t) => t.responseHeadersMs)),
				httpUpstreamService: distribution(
					httpTraces.flatMap((t) =>
						typeof t.upstreamServiceMs === 'number' ? [t.upstreamServiceMs] : []
					)
				),
				slowHttpRequests: httpTraces.filter(
					(t) => t.responseHeadersMs >= 1000 || t.status === null
				),
				turns
			},
			null,
			2
		) + '\n'
	);
}
