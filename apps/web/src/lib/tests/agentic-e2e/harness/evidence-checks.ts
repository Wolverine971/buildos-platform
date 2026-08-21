// apps/web/src/lib/tests/agentic-e2e/harness/evidence-checks.ts
import type {
	ScenarioContext,
	SeedResult,
	TurnEvidenceCheck,
	TurnEvidenceCheckResult,
	TurnResult
} from './types';

function boundedError(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

/** Run every diagnostic independently so one failure never hides later ground-truth checks. */
export async function evaluateTurnEvidenceChecks(params: {
	checks: readonly TurnEvidenceCheck[];
	turn: TurnResult;
	ctx: ScenarioContext;
	seed: SeedResult;
}): Promise<TurnEvidenceCheckResult[]> {
	return Promise.all(
		params.checks.map(async (check) => {
			if (check.applies && !check.applies(params.ctx)) {
				return {
					name: check.name,
					category: check.category,
					status: 'not_applicable' as const,
					error: null
				};
			}
			try {
				await check.check(params.turn, params.ctx, params.seed);
				return {
					name: check.name,
					category: check.category,
					status: 'passed' as const,
					error: null
				};
			} catch (error) {
				return {
					name: check.name,
					category: check.category,
					status: 'failed' as const,
					error: boundedError(error)
				};
			}
		})
	);
}
