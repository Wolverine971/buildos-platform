// apps/web/src/lib/tests/agentic-e2e/harness/turn-sequencing.ts
interface CheckedTurnOptions {
	hasFollowup: boolean;
	assertTurn: () => Promise<void>;
	judgeTurn?: () => Promise<void>;
	/** Capture evidence before the harness mutates a running turn for follow-up release. */
	captureTurn?: (checkError: unknown | null) => Promise<void>;
	releaseForFollowup: () => Promise<void>;
}

/** Keep any harness mutation strictly after all checks of the observed turn. */
export async function checkTurnBeforeFollowupRelease({
	hasFollowup,
	assertTurn,
	judgeTurn,
	captureTurn,
	releaseForFollowup
}: CheckedTurnOptions): Promise<void> {
	let checkError: unknown | null = null;
	try {
		await assertTurn();
		if (judgeTurn) await judgeTurn();
	} catch (error) {
		checkError = error;
		throw error;
	} finally {
		if (captureTurn) await captureTurn(checkError);
	}
	if (hasFollowup) await releaseForFollowup();
}
