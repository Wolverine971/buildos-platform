// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/grounded-status-rubric.test.ts
//
// Static guard for the Case 14 grounding calibration. The LLM judge itself is
// exercised by the reproducible probe in output/case14-grounding-2026-09-14/;
// these tests pin what the gate sends so calibration cannot silently weaken an
// existing clause, change the threshold, or turn into a Cedar House phrase rule.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ScenarioContext, TurnResult } from '../../harness/types';
import { scenarioCatalog } from '../catalog';
import { selectBattery } from '../../harness/battery';
import {
	GROUNDED_STATUS_SCORING_RULES,
	REVISION_HISTORY_ABSENCE_RULE,
	buildGroundedStatusRubric,
	type GroundedStatusRubricFacts
} from './grounded-status-rubric';

/** SHA-256 of the Case 14 rubric the September 14 gate judged with, before calibration. */
const PRE_CALIBRATION_CASE14_RUBRIC_SHA256 =
	'c5dba99b0b51cd488f4a5b5cae4fd2cf9af5b4e1d6187387d9c02c665264e1c6';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

async function case14JudgeSpec() {
	const scenario = selectBattery(scenarioCatalog, 'cedar-house').find(
		(entry) => entry.batteryCase === 14
	)!;
	return scenario.turns[0]!.judge!(
		{ assistantText: 'A report.', toolCalls: [], toolResults: [] } as unknown as TurnResult,
		{} as ScenarioContext,
		{ entityIds: {}, notes: {} }
	);
}

const FICTIONAL_FACTS: GroundedStatusRubricFacts = {
	budgetCap: '$42,500',
	contingency: '$5,000',
	schedule: 'October 5 to December 12, 2026',
	exclusions: 'exterior signage and parking resurfacing excluded',
	tasks: [
		{ title: 'Confirm occupancy permit requirements', due: 'October 6, 2026', minutes: 45 },
		{
			title: 'Order kiln ventilation hood',
			due: 'October 9, 2026',
			minutes: 120,
			dependsOn: 'Confirm occupancy permit requirements'
		}
	],
	briefAudience: 'Adult beginners looking for weekend ceramics classes.',
	briefCallToAction: 'Reserve a free studio tour.',
	briefChangelog: '2026-09-28: Initial draft.'
};

describe('Case 14 grounded-status rubric calibration', () => {
	it('adds only the revision-history rule to the rubric the gate already enforced', async () => {
		const spec = await case14JudgeSpec();

		expect(spec.threshold).toBe(3);
		expect(spec.rubric.split(REVISION_HISTORY_ABSENCE_RULE)).toHaveLength(2);
		expect(sha256(spec.rubric.replace(`${REVISION_HISTORY_ABSENCE_RULE}\n`, ''))).toBe(
			PRE_CALIBRATION_CASE14_RUBRIC_SHA256
		);
	});

	it('scores inferences from partial records to complete history, including attributed ones', () => {
		expect(REVISION_HISTORY_ABSENCE_RULE).toMatch(/^Score 1 if ANY passage, heading, table/);
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain('has not been revised');
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain(
			'they do not show that the history they list is complete'
		);
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain('Inferring the conclusion from the record');
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain(
			'a general caveat elsewhere does not excuse it'
		);
	});

	it('keeps bounded findings and evidence-supported history statements passing', () => {
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain('"no later revisions are recorded"');
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain(
			'"the change log lists only the initial draft"'
		);
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain(
			'presents the revision history as complete supports "not revised since"'
		);
	});

	// Synthesis probe (2026-09-14): answers said "No later revisions are recorded" after a
	// truncated read that never reached the change log, and the bounded-phrase allowance
	// let most of them pass. Bounded wording must still describe what was actually read.
	it('does not accept bounded wording about a record that was truncated, failed, or unread', () => {
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain(
			'acceptable only when they describe records the transcript shows were actually read'
		);
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain(
			'truncated, failed, or never opened, its history is unknown'
		);
		expect(REVISION_HISTORY_ABSENCE_RULE).toContain(
			'explicit dated revision entry supports "revised on" that date'
		);
	});

	it('is a generic evidence rule, not a Cedar House phrase match', () => {
		for (const fixtureSpecific of [
			'Cedar',
			'kitchen',
			'2026-09-03',
			'Initial draft',
			'$85,000'
		]) {
			expect(REVISION_HISTORY_ABSENCE_RULE).not.toContain(fixtureSpecific);
		}
	});

	it('renders the same scoring rules for fictional calibration fixtures', () => {
		const rubric = buildGroundedStatusRubric(FICTIONAL_FACTS);

		expect(rubric.endsWith(GROUNDED_STATUS_SCORING_RULES)).toBe(true);
		expect(rubric).toContain('budget cap $42,500 including a $5,000 contingency');
		expect(rubric).toContain(
			'- Task 2: "Order kiln ventilation hood", state To Do, due October 9, 2026, ' +
				'props.duration_minutes 120; description records "Depends on Confirm occupancy permit requirements."'
		);
		expect(rubric).toContain('change log, verbatim: "2026-09-28: Initial draft."');
		expect(rubric).not.toContain('Cedar');
	});
});
