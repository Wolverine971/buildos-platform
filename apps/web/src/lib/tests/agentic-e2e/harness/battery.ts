// apps/web/src/lib/tests/agentic-e2e/harness/battery.ts
//
// Turns the e2e catalog into a re-runnable graded battery.
//
// The 2026-09-03 adversarial browser assessment
// (artifacts/agentic-chat-audit-2026-09-03.md) scored 14 hand-driven cases 0-4
// and reported one letter grade. That number is only useful if the same cases
// can be replayed on the next deploy and diffed, so this module does three
// things and nothing else:
//
//   1. selects a battery (`AGENTIC_BATTERY`, mirroring `AGENTIC_SCENARIOS`),
//   2. maps the harness's existing `resultClass` taxonomy onto the audit's 0-4
//      rubric, so scoring stays mechanical rather than a second judgement call,
//   3. writes a small, diffable scorecard artifact per run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Phase0ResultClass } from '../phase0/evidence-report';
import type { Scenario } from './types';

export type BatteryScore = 0 | 1 | 2 | 3 | 4;

/**
 * The audit's predeclared rubric, verbatim:
 *
 *   4 = correct outcome verified
 *   3 = correct with minor friction or incomplete independent verification
 *   2 = partial completion or repair needed
 *   1 = material failure with useful/accurate recovery
 *   0 = failed or misleading success
 *
 * Mapping each band onto an existing result class keeps the score derivable from
 * evidence the harness already produces:
 *
 *   end_to_end_pass              -> 4  deterministic checks and judge both clean
 *   instrument_failure           -> 3  behavior correct, evidence capture incomplete
 *   judge_infrastructure_failure -> 3  behavior correct, quality left unverified
 *   quality_failure              -> 2  it did the writes; the judge found real gaps
 *   behavior_failure             -> 1  the turn completed and reported, DB disagrees
 *   transport_failure            -> 0  the turn never landed a trustworthy result
 */
export const BATTERY_RESULT_CLASS_SCORES: Readonly<Record<Phase0ResultClass, BatteryScore>> = {
	end_to_end_pass: 4,
	instrument_failure: 3,
	judge_infrastructure_failure: 3,
	quality_failure: 2,
	behavior_failure: 1,
	transport_failure: 0
};

export const BATTERY_MAX_SCORE_PER_CASE = 4;

export function scoreResultClass(resultClass: Phase0ResultClass): BatteryScore {
	return BATTERY_RESULT_CLASS_SCORES[resultClass];
}

/**
 * A scenario scores as its WORST turn. A two-turn case that creates a document
 * correctly and then fails to edit it is not "half right" to the user; the audit
 * scored case 8 zero for exactly that shape.
 */
export function scoreScenario(result: {
	resultClasses: readonly Phase0ResultClass[];
}): BatteryScore {
	if (result.resultClasses.length === 0) return 0;
	return result.resultClasses.reduce<BatteryScore>(
		(worst, resultClass) =>
			scoreResultClass(resultClass) < worst ? scoreResultClass(resultClass) : worst,
		BATTERY_MAX_SCORE_PER_CASE
	);
}

export type BatteryLetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Audit grade bands: A 90-100, B 80-89, C 70-79, D 60-69, F <60. */
export function letterGrade(percent: number): BatteryLetterGrade {
	if (percent >= 90) return 'A';
	if (percent >= 80) return 'B';
	if (percent >= 70) return 'C';
	if (percent >= 60) return 'D';
	return 'F';
}

/**
 * Battery selection, mirroring the entry test's `AGENTIC_SCENARIOS` mechanism:
 * an unknown name fails loudly rather than silently running nothing, because a
 * typo that passes zero cases reads as a perfect score.
 */
export function selectBattery(
	catalog: readonly Scenario[],
	battery = process.env.AGENTIC_BATTERY?.trim()
): Scenario[] {
	if (!battery) return [...catalog];
	const matched = catalog.filter((scenario) => scenario.category === battery);
	if (matched.length === 0) {
		const known = [...new Set(catalog.map((scenario) => scenario.category))];
		throw new Error(
			`[agentic-e2e] AGENTIC_BATTERY names unknown battery "${battery}". ` +
				`Known batteries: [${known.join(', ')}]`
		);
	}
	const missingCase = matched.filter((scenario) => typeof scenario.batteryCase !== 'number');
	if (missingCase.length > 0) {
		throw new Error(
			`[agentic-e2e] battery "${battery}" has scenario(s) without a batteryCase number: ` +
				`[${missingCase.map((scenario) => scenario.id).join(', ')}]`
		);
	}
	return [...matched].sort((left, right) => (left.batteryCase ?? 0) - (right.batteryCase ?? 0));
}

export interface BatteryTurnRecord {
	scenarioId: string;
	repetition: number;
	turnIndex: number;
	turnLabel: string | null;
	streamRunId: string | null;
	resultClass: Phase0ResultClass;
	error: string | null;
}

export interface BatteryCaseResult {
	battery: string;
	case: number;
	scenarioId: string;
	title: string;
	score: BatteryScore;
	maxScore: typeof BATTERY_MAX_SCORE_PER_CASE;
	resultClasses: Phase0ResultClass[];
	outcome: string;
	streamRunIds: string[];
}

export interface BatteryScorecard {
	schemaVersion: 1;
	kind: 'agentic_chat_battery_scorecard';
	battery: string;
	runId: string;
	generatedAt: string;
	head: string | null;
	configuration: {
		baseUrl: string;
		executionMode: string;
	};
	cases: BatteryCaseResult[];
	summary: {
		caseCount: number;
		totalScore: number;
		maxScore: number;
		percent: number;
		grade: BatteryLetterGrade;
	};
}

/** One line the scorecard table can print without re-reading the whole evidence blob. */
function summarizeOutcome(turns: readonly BatteryTurnRecord[], score: BatteryScore): string {
	if (turns.length === 0)
		return 'did not run (seed, skip, or harness failure before the first turn)';
	const worst = turns.find((turn) => scoreResultClass(turn.resultClass) === score);
	if (!worst) return 'scored, but no turn matched the scenario score';
	if (worst.error) {
		const label = worst.turnLabel ?? `turn ${worst.turnIndex}`;
		return `${worst.resultClass} on ${label}: ${worst.error.replace(/\s+/g, ' ').slice(0, 240)}`;
	}
	return worst.resultClass === 'end_to_end_pass'
		? 'verified against saved records'
		: worst.resultClass;
}

function errorMessage(error: unknown): string | null {
	if (error === null || error === undefined) return null;
	return error instanceof Error ? error.message : String(error);
}

/**
 * Accumulates per-turn outcomes during a run and renders the scorecard at the
 * end. Deliberately independent of Phase 0 evidence capture: the scorecard must
 * be producible on a dirty tree during ordinary development, while Phase 0
 * capture intentionally refuses one.
 */
export class BatteryRecorder {
	private readonly turns: BatteryTurnRecord[] = [];

	constructor(
		private readonly battery: string,
		private readonly scenarios: readonly Scenario[]
	) {}

	record(turn: BatteryTurnRecord): void {
		this.turns.push(turn);
	}

	recordTurn(params: {
		scenario: Scenario;
		repetition: number;
		turnIndex: number;
		turnLabel: string | null;
		streamRunId: string | null;
		resultClass: Phase0ResultClass;
		error?: unknown;
	}): void {
		this.record({
			scenarioId: params.scenario.id,
			repetition: params.repetition,
			turnIndex: params.turnIndex,
			turnLabel: params.turnLabel,
			streamRunId: params.streamRunId,
			resultClass: params.resultClass,
			error: errorMessage(params.error)
		});
	}

	build(params: {
		runId: string;
		baseUrl: string;
		executionMode: string;
		head?: string | null;
		generatedAt?: string;
	}): BatteryScorecard {
		const cases = this.scenarios.map<BatteryCaseResult>((scenario) => {
			const turns = this.turns.filter((turn) => turn.scenarioId === scenario.id);
			const resultClasses = turns.map((turn) => turn.resultClass);
			const score = scoreScenario({ resultClasses });
			return {
				battery: this.battery,
				case: scenario.batteryCase ?? 0,
				scenarioId: scenario.id,
				title: scenario.title,
				score,
				maxScore: BATTERY_MAX_SCORE_PER_CASE,
				resultClasses,
				outcome: summarizeOutcome(turns, score),
				streamRunIds: turns
					.map((turn) => turn.streamRunId)
					.filter((id): id is string => typeof id === 'string')
			};
		});
		const totalScore = cases.reduce((sum, entry) => sum + entry.score, 0);
		const maxScore = cases.length * BATTERY_MAX_SCORE_PER_CASE;
		const percent = maxScore === 0 ? 0 : (totalScore / maxScore) * 100;
		return {
			schemaVersion: 1,
			kind: 'agentic_chat_battery_scorecard',
			battery: this.battery,
			runId: params.runId,
			generatedAt: params.generatedAt ?? new Date().toISOString(),
			head: params.head ?? null,
			configuration: { baseUrl: params.baseUrl, executionMode: params.executionMode },
			cases,
			summary: {
				caseCount: cases.length,
				totalScore,
				maxScore,
				percent: Math.round(percent * 10) / 10,
				grade: letterGrade(percent)
			}
		};
	}
}

export function writeBatteryScorecard(path: string, scorecard: BatteryScorecard): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(scorecard, null, 2)}\n`, 'utf8');
}
