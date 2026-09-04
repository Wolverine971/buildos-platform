// apps/web/src/lib/tests/agentic-e2e/harness/battery.test.ts
import { describe, expect, it } from 'vitest';

import {
	BATTERY_MAX_SCORE_PER_CASE,
	BATTERY_RESULT_CLASS_SCORES,
	BatteryRecorder,
	letterGrade,
	scoreResultClass,
	scoreScenario,
	selectBattery
} from './battery';
import type { Phase0ResultClass } from '../phase0/evidence-report';
import type { Scenario } from './types';

function stubScenario(overrides: Partial<Scenario> & Pick<Scenario, 'id'>): Scenario {
	return {
		title: `Stub ${overrides.id}`,
		category: 'task',
		turns: [],
		...overrides
	} as Scenario;
}

const ALL_RESULT_CLASSES: Phase0ResultClass[] = [
	'end_to_end_pass',
	'transport_failure',
	'behavior_failure',
	'quality_failure',
	'judge_infrastructure_failure',
	'instrument_failure'
];

describe('battery scoring', () => {
	it('maps every result class onto the audit rubric', () => {
		expect(BATTERY_RESULT_CLASS_SCORES).toEqual({
			end_to_end_pass: 4,
			instrument_failure: 3,
			judge_infrastructure_failure: 3,
			quality_failure: 2,
			behavior_failure: 1,
			transport_failure: 0
		});
		for (const resultClass of ALL_RESULT_CLASSES) {
			const score = scoreResultClass(resultClass);
			expect(Number.isInteger(score)).toBe(true);
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(BATTERY_MAX_SCORE_PER_CASE);
		}
	});

	it('scores a scenario as its worst turn', () => {
		expect(scoreScenario({ resultClasses: ['end_to_end_pass', 'end_to_end_pass'] })).toBe(4);
		expect(scoreScenario({ resultClasses: ['end_to_end_pass', 'behavior_failure'] })).toBe(1);
		expect(scoreScenario({ resultClasses: ['quality_failure', 'transport_failure'] })).toBe(0);
		expect(scoreScenario({ resultClasses: ['instrument_failure'] })).toBe(3);
	});

	it('scores a scenario that never produced a turn as zero', () => {
		expect(scoreScenario({ resultClasses: [] })).toBe(0);
	});

	it('uses the audit grade bands', () => {
		expect(letterGrade(100)).toBe('A');
		expect(letterGrade(90)).toBe('A');
		expect(letterGrade(89.9)).toBe('B');
		expect(letterGrade(80)).toBe('B');
		expect(letterGrade(70)).toBe('C');
		expect(letterGrade(60)).toBe('D');
		expect(letterGrade(59.9)).toBe('F');
		// The original assessment: 28/52 = 53.8% = F.
		expect(letterGrade((28 / 52) * 100)).toBe('F');
	});
});

describe('battery selection', () => {
	const catalog = [
		stubScenario({ id: 'task-a' }),
		stubScenario({ id: 'cedar-2', category: 'cedar-house', batteryCase: 2 }),
		stubScenario({ id: 'cedar-1', category: 'cedar-house', batteryCase: 1 })
	];

	it('returns the whole catalog when no battery is selected', () => {
		expect(selectBattery(catalog, undefined).map((s) => s.id)).toEqual([
			'task-a',
			'cedar-2',
			'cedar-1'
		]);
	});

	it('filters to one battery and orders by case number', () => {
		expect(selectBattery(catalog, 'cedar-house').map((s) => s.id)).toEqual([
			'cedar-1',
			'cedar-2'
		]);
	});

	it('fails loudly on an unknown battery instead of running nothing', () => {
		expect(() => selectBattery(catalog, 'cedar-hous')).toThrow(/unknown battery/i);
	});

	it('refuses a battery scenario without a case number', () => {
		expect(() =>
			selectBattery([stubScenario({ id: 'cedar-x', category: 'cedar-house' })], 'cedar-house')
		).toThrow(/batteryCase/);
	});
});

describe('BatteryRecorder', () => {
	const scenarios = [
		stubScenario({ id: 'cedar-1', category: 'cedar-house', batteryCase: 1 }),
		stubScenario({ id: 'cedar-2', category: 'cedar-house', batteryCase: 2 }),
		stubScenario({ id: 'cedar-3', category: 'cedar-house', batteryCase: 3 })
	];

	it('builds a diffable scorecard, scoring un-run cases as zero', () => {
		const recorder = new BatteryRecorder('cedar-house', scenarios);
		recorder.recordTurn({
			scenario: scenarios[0]!,
			repetition: 1,
			turnIndex: 1,
			turnLabel: 'create',
			streamRunId: 'run-1',
			resultClass: 'end_to_end_pass'
		});
		recorder.recordTurn({
			scenario: scenarios[1]!,
			repetition: 1,
			turnIndex: 1,
			turnLabel: 'write',
			streamRunId: 'run-2',
			resultClass: 'behavior_failure',
			error: new Error('[assert] no matching task found')
		});

		const scorecard = recorder.build({
			runId: 'test-run',
			baseUrl: 'http://127.0.0.1:5173',
			executionMode: 'worker_realtime',
			head: 'abcdef1234',
			generatedAt: '2026-09-03T21:00:00.000Z'
		});

		expect(scorecard.cases.map((entry) => [entry.case, entry.score])).toEqual([
			[1, 4],
			[2, 1],
			[3, 0]
		]);
		expect(scorecard.summary).toEqual({
			caseCount: 3,
			totalScore: 5,
			maxScore: 12,
			percent: 41.7,
			grade: 'F'
		});
		expect(scorecard.cases[1]!.outcome).toContain('no matching task found');
		expect(scorecard.cases[2]!.outcome).toContain('did not run');
		expect(scorecard.cases[0]!.streamRunIds).toEqual(['run-1']);
	});
});
