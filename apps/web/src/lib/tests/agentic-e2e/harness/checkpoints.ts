// apps/web/src/lib/tests/agentic-e2e/harness/checkpoints.ts
import type { ScenarioContext, SeedResult, TurnCheckpoint, TurnResult } from './types';

export interface CheckpointFailure {
	turnNumber: number;
	turnLabel: string;
	checkpoint: string;
	message: string;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Run every checkpoint so one quality miss does not hide the rest of a journey. */
export async function evaluateTurnCheckpoints(params: {
	checkpoints: TurnCheckpoint[];
	turn: TurnResult;
	ctx: ScenarioContext;
	seed: SeedResult;
	turnNumber: number;
	turnLabel?: string;
}): Promise<CheckpointFailure[]> {
	const failures: CheckpointFailure[] = [];
	const turnLabel = params.turnLabel?.trim() || `Turn ${params.turnNumber}`;

	for (const checkpoint of params.checkpoints) {
		try {
			await checkpoint.check(params.turn, params.ctx, params.seed);
		} catch (error) {
			failures.push({
				turnNumber: params.turnNumber,
				turnLabel,
				checkpoint: checkpoint.name,
				message: errorMessage(error)
			});
		}
	}

	return failures;
}

export function formatCheckpointFailures(
	scenarioId: string,
	failures: CheckpointFailure[]
): string {
	const details = failures
		.map(
			(failure, index) =>
				`${index + 1}. ${failure.turnLabel} — ${failure.checkpoint}\n   ${failure.message.replace(/\n/g, '\n   ')}`
		)
		.join('\n');

	return (
		`[agentic-e2e] ${scenarioId} completed all turns with ${failures.length} ` +
		`checkpoint failure(s):\n${details}`
	);
}
