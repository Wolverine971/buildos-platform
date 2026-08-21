// apps/web/src/lib/tests/agentic-e2e/harness/turn-sequencing.ts
export interface CheckedTurnJudgeResult {
	score: number;
	passed: boolean;
	reasoning: string;
	threshold: number;
}

export type CheckedTurnJudgeOutcome =
	| { status: 'not_configured' }
	| { status: 'not_reached' }
	| { status: 'passed' | 'failed'; result: CheckedTurnJudgeResult }
	| { status: 'error'; error: unknown };

export interface CheckedTurnOutcome {
	deterministicAssertionPassed: boolean;
	deterministicAssertionError: unknown | null;
	judge: CheckedTurnJudgeOutcome;
	overallError: unknown | null;
}

interface CheckedTurnOptions {
	hasFollowup: boolean;
	assertTurn: () => Promise<void>;
	judgeTurn?: () => Promise<CheckedTurnJudgeResult>;
	/** Capture evidence before the harness mutates a running turn for follow-up release. */
	captureTurn?: (outcome: CheckedTurnOutcome) => Promise<void>;
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
	let deterministicAssertionPassed = false;
	let deterministicAssertionError: unknown | null = null;
	let judgeOutcome: CheckedTurnJudgeOutcome = judgeTurn
		? { status: 'not_reached' }
		: { status: 'not_configured' };
	try {
		try {
			await assertTurn();
			deterministicAssertionPassed = true;
		} catch (error) {
			deterministicAssertionError = error;
			throw error;
		}
		if (judgeTurn) {
			try {
				const result = await judgeTurn();
				judgeOutcome = { status: result.passed ? 'passed' : 'failed', result };
				if (!result.passed) {
					throw new Error(
						`LLM judge scored ${result.score}/5 (needed ${result.threshold}): ${result.reasoning}`
					);
				}
			} catch (error) {
				if (judgeOutcome.status === 'not_reached') {
					judgeOutcome = { status: 'error', error };
				}
				throw error;
			}
		}
	} catch (error) {
		checkError = error;
		throw error;
	} finally {
		if (captureTurn) {
			await captureTurn({
				deterministicAssertionPassed,
				deterministicAssertionError,
				judge: judgeOutcome,
				overallError: checkError
			});
		}
	}
	if (hasFollowup) await releaseForFollowup();
}
