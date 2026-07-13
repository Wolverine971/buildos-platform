// apps/web/src/lib/tests/agentic-e2e/harness/judge.ts
//
// LLM-as-judge for fuzzy scenarios. The chat under test runs on the cheap
// production `balanced` route; the judge deliberately uses a STRONG JSON route
// (`powerful`) so grading is not bottlenecked by the same weak models we're
// stress-testing. Returns a 1-5 score; `passed` is computed here, never trusted
// from the model.
import { SmartLLMService } from '$lib/services/smart-llm-service';
import type { JudgeResult } from './types';

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
	const llm = new SmartLLMService();

	const raw = await llm.getJSONResponse<{ score?: number; reasoning?: string }>({
		systemPrompt: JUDGE_SYSTEM_PROMPT,
		userPrompt: `RUBRIC:\n${params.rubric}\n\nTRANSCRIPT:\n${params.transcript}`,
		profile: 'powerful',
		temperature: 0,
		maxTokens: 600,
		userId: 'agentic-e2e-judge',
		operationType: 'agentic_e2e_judge'
	});

	const score = Math.max(1, Math.min(5, Math.round(Number(raw?.score ?? 0))));
	return {
		score,
		passed: score >= threshold,
		reasoning: typeof raw?.reasoning === 'string' ? raw.reasoning : '(no reasoning returned)'
	};
}
