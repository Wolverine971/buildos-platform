// scripts/agentic/gate-policy.ts
export const CEDAR_CASES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14];

/**
 * Workspace chat battery (tasker/146). Run as its own slice; it is never part of
 * the 13-case Cedar House gate, and a green run is never a full post-deploy pass.
 */
export const WORKSPACE_CHAT_CASES = [1, 2, 3, 4, 5, 6];

export type BatteryName = 'cedar-house' | 'workspace-chat';

export const BATTERY_CASES: Readonly<Record<BatteryName, readonly number[]>> = Object.freeze({
	'cedar-house': CEDAR_CASES,
	'workspace-chat': WORKSPACE_CHAT_CASES
});

/** First-turn latency ceilings the audit made load-bearing. Cedar House only. */
const LATENCY_CEILINGS_MS: Readonly<Record<BatteryName, Readonly<Record<number, number>>>> = {
	'cedar-house': { 2: 60_000, 4: 30_000, 8: 30_000, 14: 40_000 },
	'workspace-chat': {}
};

/** First-turn tool-call limits. Cedar House case 14 only. */
const TOOL_CALL_LIMITS: Readonly<Record<BatteryName, Readonly<Record<number, number>>>> = {
	'cedar-house': { 14: 8 },
	'workspace-chat': {}
};

/** The failure a partial run reports; a case subset filters exactly this line out. */
export function incompleteBatteryFailure(battery: BatteryName = 'cedar-house'): string {
	return battery === 'cedar-house'
		? 'The complete 13-case battery did not run'
		: `The complete ${BATTERY_CASES[battery].length}-case ${battery} battery did not run`;
}

/** Fail closed on skipped, partial, unverified, or shortened runs. */
export function evaluateGateScorecard(
	value: unknown,
	repetitions: number,
	battery: BatteryName = 'cedar-house'
): string[] {
	const scorecard = value as any;
	const failures: string[] = [];
	if (scorecard?.kind !== 'agentic_chat_battery_scorecard' || scorecard?.battery !== battery)
		return [
			battery === 'cedar-house'
				? 'Missing Cedar House scorecard'
				: `Missing ${battery} scorecard`
		];
	if (scorecard.provenance?.verified !== true)
		failures.push('Source provenance was not verified');
	if (
		JSON.stringify(scorecard.cases?.map((entry: any) => entry.case)) !==
		JSON.stringify(BATTERY_CASES[battery])
	)
		failures.push(incompleteBatteryFailure(battery));
	for (const entry of scorecard.cases ?? []) {
		if (entry.score !== 4)
			failures.push(`Case ${entry.case}: ${entry.score}/4 — ${entry.outcome}`);
		for (let repetition = 1; repetition <= repetitions; repetition++) {
			const turns = (scorecard.turns ?? []).filter(
				(turn: any) =>
					turn.scenarioId === entry.scenarioId && turn.repetition === repetition
			);
			if (
				turns.length !== entry.expectedTurnCount ||
				!turns.length ||
				turns.some((turn: any) => turn.resultClass !== 'end_to_end_pass')
			)
				failures.push(`Case ${entry.case}, repetition ${repetition}: incomplete or failed`);
			const first = turns.find((turn: any) => turn.turnIndex === 1);
			const ceiling = LATENCY_CEILINGS_MS[battery][entry.case];
			if (ceiling && (!Number.isFinite(first?.durationMs) || first.durationMs >= ceiling))
				failures.push(
					`Case ${entry.case}, repetition ${repetition}: latency must be under ${ceiling / 1000}s`
				);
			const callLimit = TOOL_CALL_LIMITS[battery][entry.case];
			if (
				callLimit !== undefined &&
				(!Number.isFinite(first?.toolCallCount) || first.toolCallCount > callLimit)
			)
				failures.push(
					`Case ${entry.case}, repetition ${repetition}: read-call limit is ${callLimit}`
				);
		}
	}
	return failures;
}
