// packages/agentic-chat-runtime/src/parity-scenarios.test.ts
import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_PARITY_SCENARIO_CLASSES_V1,
	AGENTIC_CHAT_PARITY_SCENARIOS_V1,
	createAgenticChatLegacyParityCoverageTrackerV1,
	createAgenticChatWorkerParityCoverageTrackerV1,
	evaluateAgenticChatLegacyParityRunV1,
	evaluateAgenticChatWorkerParityRunV1,
	getAgenticChatParityScenarioV1,
	listBlockedAgenticChatParityScenariosV1,
	listImplementedAgenticChatParityScenariosV1,
	partitionAgenticChatParityDifferencesV1
} from './parity-scenarios';
import type { AgenticChatParityRunV1 } from './parity';

function cloneRun(run: AgenticChatParityRunV1): AgenticChatParityRunV1 {
	return JSON.parse(JSON.stringify(run)) as AgenticChatParityRunV1;
}

function successGolden(): AgenticChatParityRunV1 {
	const scenario = getAgenticChatParityScenarioV1('success');
	if (scenario.status !== 'implemented') throw new Error('success scenario must be implemented');
	return scenario.golden;
}

describe('agentic chat parity scenario registry', () => {
	it('registers every plan-mandated scenario class exactly once', () => {
		const registered = AGENTIC_CHAT_PARITY_SCENARIOS_V1.map(
			(scenario) => scenario.scenarioClass
		);
		expect([...registered].sort()).toEqual([...AGENTIC_CHAT_PARITY_SCENARIO_CLASSES_V1].sort());
		expect(new Set(registered).size).toBe(registered.length);
	});

	it('has no blocked deterministic scenario classes', () => {
		const blocked = listBlockedAgenticChatParityScenariosV1();
		expect(blocked).toEqual([]);
	});

	it('anchors every implemented scenario to its golden timing and done events', () => {
		for (const scenario of listImplementedAgenticChatParityScenariosV1()) {
			const timingIndex = scenario.golden.events.findIndex(
				(event) => event.type === 'timing'
			);
			const doneIndex = scenario.golden.events.findIndex((event) => event.type === 'done');
			expect(scenario.workerDeliberateDivergencePrefixes[0]).toBe(
				`/events/${timingIndex}/payload/timing/`
			);
			if (scenario.scenarioClass === 'mutating_tools') {
				const resultIndex = scenario.golden.events.findIndex(
					(event) => event.type === 'tool_result'
				);
				expect(scenario.workerDeliberateDivergencePrefixes.slice(1)).toEqual([
					`/events/${resultIndex}/payload/result/effect_id`,
					`/events/${resultIndex}/payload/result/replayed`,
					'/toolExecutions/0/effect_id',
					'/toolExecutions/0/execution_time_ms'
				]);
			} else if (scenario.scenarioClass === 'timeout') {
				expect(scenario.workerDeliberateDivergencePrefixes).toEqual([
					`/events/${timingIndex}/payload/timing/`,
					'/outcome/total_tokens',
					'/metadata/lifecycle_events/5',
					'/metadata/prompt_snapshot_count'
				]);
			} else {
				expect(scenario.workerDeliberateDivergencePrefixes).toHaveLength(1);
			}
			expect(scenario.workerOpenDivergences.map(({ path }) => path)).toEqual([
				`/events/${doneIndex}/payload/failure_code`,
				`/events/${doneIndex}/payload/status`
			]);
			for (const divergence of scenario.workerOpenDivergences) {
				expect(divergence.reason.length).toBeGreaterThan(0);
			}
		}
	});

	it('partitions differences by deliberate prefix', () => {
		const timing = {
			path: '/events/6/payload/timing/done_emitted_at',
			kind: 'value_mismatch' as const,
			expected: { present: true, value: 'x' },
			actual: { present: true, value: null }
		};
		const done = {
			path: '/events/7/payload/status',
			kind: 'unexpected_in_actual' as const,
			expected: { present: false, value: null },
			actual: { present: true, value: 'completed' }
		};
		const partition = partitionAgenticChatParityDifferencesV1(
			[timing, done],
			['/events/6/payload/timing/']
		);
		expect(partition.deliberate).toEqual([timing]);
		expect(partition.contested).toEqual([done]);
	});

	it('does not treat a sibling JSON pointer as a deliberate prefix match', () => {
		const sibling = {
			path: '/metadata/lifecycle_events/40',
			kind: 'unexpected_in_actual' as const,
			expected: { present: false, value: null },
			actual: { present: true, value: 'unexpected' }
		};
		const partition = partitionAgenticChatParityDifferencesV1(
			[sibling],
			['/metadata/lifecycle_events/4']
		);
		expect(partition.deliberate).toEqual([]);
		expect(partition.contested).toEqual([sibling]);
	});
});

describe('worker parity evaluation', () => {
	it('rejects an exact golden match while the open-divergence inventory is non-empty', () => {
		const evaluation = evaluateAgenticChatWorkerParityRunV1('success', successGolden());
		expect(evaluation.diff.matches).toBe(true);
		expect(evaluation.contested).toEqual([]);
		expect(evaluation.matchesContract).toBe(false);
	});

	it('accepts a run whose contested inventory equals the registered open divergences', () => {
		const scenario = getAgenticChatParityScenarioV1('success');
		if (scenario.status !== 'implemented') throw new Error('unreachable');
		const run = cloneRun(scenario.golden);
		const doneIndex = run.events.findIndex((event) => event.type === 'done');
		const doneEvent = run.events[doneIndex]!;
		doneEvent.payload = {
			...doneEvent.payload,
			failure_code: null,
			status: 'completed'
		} as JsonObject;
		const timingIndex = run.events.findIndex((event) => event.type === 'timing');
		const timingEvent = run.events[timingIndex]!;
		timingEvent.payload = {
			...timingEvent.payload,
			timing: {
				...(timingEvent.payload.timing as JsonObject),
				done_emitted_at: null
			}
		} as JsonObject;

		const evaluation = evaluateAgenticChatWorkerParityRunV1('success', run);
		expect(evaluation.deliberate.map(({ path }) => path)).toEqual([
			`/events/${timingIndex}/payload/timing/done_emitted_at`
		]);
		expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
			scenario.workerOpenDivergences.map(({ path, kind }) => ({ path, kind }))
		);
		expect(evaluation.matchesContract).toBe(true);
	});

	it('rejects contested drift outside the registered inventory', () => {
		const run = cloneRun(successGolden());
		(run.outcome as Record<string, unknown>).status = 'failed';
		const evaluation = evaluateAgenticChatWorkerParityRunV1('success', run);
		expect(evaluation.matchesContract).toBe(false);
		expect(evaluation.contested.map(({ path }) => path)).toContain('/outcome/status');
	});

	it('rejects a different implemented scenario golden', () => {
		const evaluation = evaluateAgenticChatWorkerParityRunV1('timeout', successGolden());
		expect(evaluation.matchesContract).toBe(false);
		expect(evaluation.contested.length).toBeGreaterThan(0);
	});
});

describe('legacy parity evaluation', () => {
	it('requires exact equality with the golden', () => {
		expect(
			evaluateAgenticChatLegacyParityRunV1('success', successGolden()).matchesContract
		).toBe(true);
		const drifted = cloneRun(successGolden());
		(drifted.outcome as Record<string, unknown>).status = 'failed';
		expect(evaluateAgenticChatLegacyParityRunV1('success', drifted).matchesContract).toBe(
			false
		);
	});
});

describe('parity coverage tracker', () => {
	it('reports implemented scenarios as missing until each one is evaluated', () => {
		const tracker = createAgenticChatLegacyParityCoverageTrackerV1();
		const implemented = listImplementedAgenticChatParityScenariosV1();
		expect(tracker.missing().length).toBe(implemented.length);
		for (const scenario of implemented) {
			tracker.evaluate(scenario.scenarioClass, scenario.golden);
		}
		expect(tracker.missing()).toEqual([]);
		expect([...tracker.exercised()].sort()).toEqual(
			implemented.map((scenario) => scenario.scenarioClass).sort()
		);
	});

	it('tracks worker evaluations with the worker contract', () => {
		const tracker = createAgenticChatWorkerParityCoverageTrackerV1();
		const evaluation = tracker.evaluate('success', successGolden());
		expect(evaluation.matchesContract).toBe(false);
		expect(tracker.missing()).not.toContain('success');
	});
});
