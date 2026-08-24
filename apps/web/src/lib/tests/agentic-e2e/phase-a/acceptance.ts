// apps/web/src/lib/tests/agentic-e2e/phase-a/acceptance.ts
//
// The control lane scores through the SAME validator implementation as the workflow lane.
// Two lanes that score differently cannot be compared, so this module is a thin delegation to
// `packages/agent-orchestrator/src/testing/harness/acceptance-eval.ts` rather than a second
// implementation. See research/09_INTERNAL_GROUND_TRUTH_MAP.md D12 for the divergence this removes.
//
// Imported by relative path because neither app declares a dependency on @buildos/agent-orchestrator;
// this matches how apps/worker/tests/phase-a/phaseAWorkflowEval.test.ts resolves the same modules.
import {
	evaluateHarnessAcceptance,
	extractAnswerUrls,
	type HarnessAcceptanceResult
} from '@buildos/agent-orchestrator/testing/harness';
import type { TurnResult } from '../harness/types';
import type { FrozenAcceptanceCheck } from './fixtures';

export type AcceptanceCheckResult = HarnessAcceptanceResult;

export interface AcceptanceEvaluationOptions {
	resolveUrl?: (url: string) => Promise<boolean>;
}

const MUTATION_TOOL_PATTERN =
	/^(create|update|delete|move|mark|transition|archive|send|schedule|reschedule|commit|apply|link|unlink|add|remove)_/i;

export const extractUrls = extractAnswerUrls;

export function evaluateAcceptanceChecks(
	checks: FrozenAcceptanceCheck[],
	text: string,
	options: AcceptanceEvaluationOptions = {}
): Promise<AcceptanceCheckResult[]> {
	return evaluateHarnessAcceptance({
		checks: checks.map((check) => ({
			validator_id: check.validator_id,
			description: check.description,
			required: check.required,
			config: check.config
		})),
		text,
		resolveUrl: options.resolveUrl
	});
}

export function assertNoMutationToolCalls(turn: TurnResult): void {
	const mutationTools = turn.toolCalls
		.map((call) => call.function.name)
		.filter((name) => MUTATION_TOOL_PATTERN.test(name));
	if (mutationTools.length > 0) {
		throw new Error(
			`[phase-a-control] read-only scenario called mutation tools: ${mutationTools.join(', ')}`
		);
	}
}
