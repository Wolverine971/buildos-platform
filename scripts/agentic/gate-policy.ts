// scripts/agentic/gate-policy.ts
export const CEDAR_CASES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14];

/** Fail closed on skipped, partial, unverified, or shortened runs. */
export function evaluateGateScorecard(value: unknown, repetitions: number): string[] {
	const scorecard = value as any;
	const failures: string[] = [];
	if (
		scorecard?.kind !== 'agentic_chat_battery_scorecard' ||
		scorecard?.battery !== 'cedar-house'
	)
		return ['Missing Cedar House scorecard'];
	if (scorecard.provenance?.verified !== true)
		failures.push('Source provenance was not verified');
	if (
		JSON.stringify(scorecard.cases?.map((entry: any) => entry.case)) !==
		JSON.stringify(CEDAR_CASES)
	)
		failures.push('The complete 13-case battery did not run');
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
			const ceiling = (
				{ 2: 60_000, 4: 30_000, 8: 30_000, 14: 40_000 } as Record<number, number>
			)[entry.case];
			if (ceiling && (!Number.isFinite(first?.durationMs) || first.durationMs >= ceiling))
				failures.push(
					`Case ${entry.case}, repetition ${repetition}: latency must be under ${ceiling / 1000}s`
				);
			if (
				entry.case === 14 &&
				(!Number.isFinite(first?.toolCallCount) || first.toolCallCount > 8)
			)
				failures.push(`Case 14, repetition ${repetition}: read-call limit is 8`);
		}
	}
	return failures;
}
