// scripts/agentic/latency-analysis.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeGateLatencyAnalysis } from './latency-analysis';

test('keeps failed usage traces when no model receipt exists and does not invent a terminal time', () => {
	const directory = mkdtempSync(join(tmpdir(), 'gate-latency-'));
	try {
		mkdirSync(join(directory, 'turns'));
		writeFileSync(
			join(directory, 'turns', 'failed.json'),
			JSON.stringify({
				modelPasses: [],
				result: {
					rawEvents: [{ turn_run_id: 'failed-turn' }],
					timing: {
						requestStartedAt: '2026-09-13T12:00:00Z',
						terminalEventMs: null,
						totalDurationMs: 1200
					},
					serverTiming: { terminal_committed_at: '2026-09-13T12:00:00.300Z' }
				}
			})
		);
		writeFileSync(
			join(directory, 'worker.log'),
			[
				{
					event: 'agentic_chat_persistence_trace',
					turnRunId: 'failed-turn',
					lane: 'usage',
					stage: 'attempt_finished',
					durationMs: 5000,
					outcome: 'timed_out'
				},
				{
					event: 'agentic_gate_http_trace',
					responseHeadersMs: 1500,
					upstreamServiceMs: 1200,
					status: 200,
					requestId: 'request-123'
				}
			]
				.map((value) => JSON.stringify(value))
				.join('\n')
		);
		writeGateLatencyAnalysis(directory);
		const report = JSON.parse(readFileSync(join(directory, 'latency-analysis.json'), 'utf8'));
		assert.equal(report.turns[0].turnRunId, 'failed-turn');
		assert.equal(report.turns[0].failedUsageWrites, 1);
		assert.equal(report.turns[0].terminalObservationEstimateMs, null);
		assert.equal(report.turns[0].intakeRequests, null);
		assert.equal(report.httpTraceCount, 1);
		assert.equal(report.httpResponseHeaders.maxMs, 1500);
		assert.equal(report.httpUpstreamService.maxMs, 1200);
		assert.equal(report.slowHttpRequests[0].requestId, 'request-123');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
