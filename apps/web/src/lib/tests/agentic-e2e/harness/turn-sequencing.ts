// apps/web/src/lib/tests/agentic-e2e/harness/turn-sequencing.ts
interface CheckedTurnOptions {
	hasFollowup: boolean;
	assertTurn: () => Promise<void>;
	judgeTurn?: () => Promise<void>;
	releaseForFollowup: () => Promise<void>;
}

/** Keep any harness mutation strictly after all checks of the observed turn. */
export async function checkTurnBeforeFollowupRelease({
	hasFollowup,
	assertTurn,
	judgeTurn,
	releaseForFollowup
}: CheckedTurnOptions): Promise<void> {
	await assertTurn();
	if (judgeTurn) await judgeTurn();
	if (hasFollowup) await releaseForFollowup();
}
