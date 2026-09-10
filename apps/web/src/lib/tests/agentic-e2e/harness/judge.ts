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
// chain instead and asserts the acting model is not in it.
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { DEEPSEEK_V4_FLASH_MODEL } from '@buildos/smart-llm';
import type { JudgeResult } from './types';

const JUDGE_MAX_ATTEMPTS = 2;
const JUDGE_DEADLINE_MS = 90_000;

/** Strong graders only, most capable first. Override with AGENTIC_E2E_JUDGE_MODEL. */
export const JUDGE_MODEL_CHAIN: readonly string[] = [
	'openai/gpt-5.6-luna',
	'moonshotai/kimi-k3',
	'x-ai/grok-4.6'
];

/** Models a judge may never use, because the battery is grading them. */
export const JUDGE_FORBIDDEN_MODELS: readonly string[] = [DEEPSEEK_V4_FLASH_MODEL];

export function resolveJudgeModels(override?: string | null): string[] {
	const pinned = override?.trim();
	const models = pinned ? [pinned, ...JUDGE_MODEL_CHAIN] : [...JUDGE_MODEL_CHAIN];
	const unique = Array.from(new Set(models));
	const forbidden = unique.filter((model) => JUDGE_FORBIDDEN_MODELS.includes(model));
	if (forbidden.length > 0) {
		throw new Error(
			`[agentic-e2e] the quality judge cannot run on a model under test: ${forbidden.join(', ')}`
		);
	}
	return unique;
}

const JUDGE_SYSTEM_PROMPT = `You are a strict QA judge evaluating an AI assistant that operates inside a
productivity app (it manages projects, documents, and tasks via tools).

You will be given a rubric describing what a good outcome looks like, plus a transcript of what the
assistant said and did (its tool calls and the resulting data state). Judge ONLY against the rubric.

Score on a 1-5 integer scale:
  1 = failed the task entirely
  2 = attempted but largely wrong or unhelpful
  3 = acceptable; did the core job with notable gaps
  4 = good; did the job well with minor issues
  5 = excellent; fully satisfied the rubric

Be critical and concrete. Reward real, correct actions on the data; penalize hand-waving, hallucinated
success, dropped context, or leaving the work undone.

Respond with STRICT JSON only, no prose outside it:
{ "score": <1-5 integer>, "reasoning": "<one or two sentences citing specifics>" }`;

export async function judgeQuality(params: {
	rubric: string;
	transcript: string;
	threshold?: number;
}): Promise<JudgeResult> {
	const threshold = params.threshold ?? 3;
	let raw: { score?: number; reasoning?: string } | null = null;
	// One hard wall covers the initial attempt and the single bounded retry.
	// SmartLLM can otherwise route across several models, each with its own
	// timeout, after the scenario's worker turn has already completed.
	const signal = AbortSignal.timeout(JUDGE_DEADLINE_MS);
	const judgeModels = resolveJudgeModels(process.env.AGENTIC_E2E_JUDGE_MODEL);

	for (let attempt = 1; attempt <= JUDGE_MAX_ATTEMPTS; attempt += 1) {
		try {
			const llm = new SmartLLMService();
			raw = await llm.getJSONResponse<{ score?: number; reasoning?: string }>({
				systemPrompt: JUDGE_SYSTEM_PROMPT,
				userPrompt: `RUBRIC:\n${params.rubric}\n\nTRANSCRIPT:\n${params.transcript}`,
				models: judgeModels,
				// `maximum` carries no acting-model fallback, so even an exhausted
				// explicit chain cannot land on the model under test.
				profile: 'maximum',
				temperature: 0,
				maxTokens: 600,
				signal,
				userId: 'agentic-e2e-judge',
				operationType: 'agentic_e2e_judge'
			});
			break;
		} catch (error) {
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
