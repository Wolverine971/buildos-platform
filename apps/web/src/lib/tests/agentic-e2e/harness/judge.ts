// apps/web/src/lib/tests/agentic-e2e/harness/judge.ts
//
// LLM-as-judge for fuzzy scenarios. The chat under test runs on the cheap
// production `balanced` route; the judge must be strictly stronger, so grading
// is never bottlenecked by — or performed by — a model we are stress-testing.
// Returns a 1-5 score; `passed` is computed here, never trusted from the model.
//
// The `powerful` JSON profile is NOT safe for this: its first choice is a flash
// model and its last fallback is `deepseek/deepseek-v4-flash`, the acting model
// itself, so a bad run could end with the model under test grading its own work
// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 J6). The judge pins an explicit strong
// chain instead and asserts the acting model is not in it. The chain, system
// prompt and request options live in `judge-request.ts` so offline calibration
// probes send exactly what the gate sends.
import { SmartLLMService } from '$lib/services/smart-llm-service';
import type { JSONUsageEvent } from '@buildos/smart-llm';
import type { JudgeResult } from './types';
import { buildJudgeRequestOptions, resolveJudgeModels } from './judge-request';

export {
	JUDGE_FORBIDDEN_MODELS,
	JUDGE_MODEL_CHAIN,
	JUDGE_SYSTEM_PROMPT,
	buildJudgeRequestOptions,
	resolveJudgeModels
} from './judge-request';

const JUDGE_MAX_ATTEMPTS = 2;
// A judge that never returns scores 3, so a stalled grader fails the gate for a
// reason the product never caused. Sep 11 QA: one Case 14 turn burned both 45s
// attempts on provider stalls while a sibling turn graded the same rubric in
// 7.5s. `providerRouting` cannot sort by throughput, so the only lever is wall
// time. 75s per attempt buys a stalling endpoint room to answer without letting
// a hung request hold the battery open. This is availability only: a low score
// is still never retried, and the acting model still cannot grade itself.
const JUDGE_DEADLINE_MS = 150_000;

export interface JudgeAttempt {
	attempt: number;
	models: string[];
	durationMs: number;
	raw?: unknown;
	error?: string;
	usage?: JSONUsageEvent[];
}

export async function judgeQuality(params: {
	rubric: string;
	transcript: string;
	threshold?: number;
	onAttempt?: (attempt: JudgeAttempt) => void;
}): Promise<JudgeResult> {
	const threshold = params.threshold ?? 3;
	let raw: { score?: number; reasoning?: string } | null = null;
	// Reserve half the total wall for a usable retry of the SAME retained response.
	const deadline = Date.now() + JUDGE_DEADLINE_MS;
	const judgeModels = resolveJudgeModels(process.env.AGENTIC_E2E_JUDGE_MODEL);

	for (let attempt = 1; attempt <= JUDGE_MAX_ATTEMPTS; attempt += 1) {
		const started = Date.now();
		raw = null;
		const usage: JSONUsageEvent[] = [];
		const models = attempt === 1 ? judgeModels : judgeModels.slice(1);
		const signal = AbortSignal.timeout(
			Math.max(1, Math.min(JUDGE_DEADLINE_MS / JUDGE_MAX_ATTEMPTS, deadline - started))
		);
		try {
			const llm = new SmartLLMService();
			raw = await llm.getJSONResponse<{ score?: number; reasoning?: string }>(
				buildJudgeRequestOptions({
					rubric: params.rubric,
					transcript: params.transcript,
					models,
					signal,
					onUsage: (event) => {
						usage.push(event);
					}
				})
			);
			if (
				!raw ||
				!Number.isInteger(raw.score) ||
				raw.score! < 1 ||
				raw.score! > 5 ||
				typeof raw.reasoning !== 'string' ||
				!raw.reasoning.trim()
			) {
				throw new Error('Quality judge returned an invalid verdict');
			}
			params.onAttempt?.({ attempt, models, durationMs: Date.now() - started, raw, usage });
			break;
		} catch (error) {
			params.onAttempt?.({
				attempt,
				models,
				durationMs: Date.now() - started,
				raw,
				usage,
				error: error instanceof Error ? error.message : String(error)
			});
			if (attempt === JUDGE_MAX_ATTEMPTS) throw error;
			console.warn('[agentic-e2e] retrying quality judge after provider failure', {
				attempt,
				maxAttempts: JUDGE_MAX_ATTEMPTS,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	const score = Math.max(1, Math.min(5, Math.round(Number(raw?.score ?? 0))));
	return {
		score,
		passed: score >= threshold,
		reasoning: typeof raw?.reasoning === 'string' ? raw.reasoning : '(no reasoning returned)'
	};
}
