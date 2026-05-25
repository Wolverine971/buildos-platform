// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/llm-judge.ts
import type {
	TurnDigest,
	TurnSupervisorDecision,
	TurnSupervisorJudge,
	TurnSupervisorJudgeInput
} from './types';

type JudgeLLM = {
	generateText(options: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		timeoutMs?: number;
		userId?: string;
		operationType?: string;
		profile?: string;
		model?: string;
	}): Promise<string>;
};

export type LLMTurnSupervisorJudgeOptions = {
	llm: JudgeLLM;
	enabled?: boolean;
	model?: string;
	timeoutMs?: number;
	maxTokens?: number;
};

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_TOKENS = 420;

const JUDGE_SYSTEM_PROMPT = [
	'You are a hidden runtime supervisor for an agentic chat turn.',
	'You only receive a compact digest of runtime facts. Do not invent tool results.',
	'Choose the least disruptive action that keeps the user experience moving.',
	'Return only one JSON object.'
].join('\n');

export function createLLMTurnSupervisorJudge(
	options: LLMTurnSupervisorJudgeOptions
): TurnSupervisorJudge {
	return {
		async evaluate(input) {
			if (options.enabled === false) return null;
			const raw = await options.llm.generateText({
				systemPrompt: JUDGE_SYSTEM_PROMPT,
				prompt: buildJudgePrompt(input),
				temperature: 0,
				maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
				timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				userId: input.digest.userId,
				operationType: 'fastchat_turn_supervisor_judge',
				profile: 'fast',
				model: options.model
			});
			return parseJudgeDecision(raw, input.digest);
		}
	};
}

function buildJudgePrompt(input: TurnSupervisorJudgeInput): string {
	return JSON.stringify(
		{
			task: 'Decide whether the running turn should continue, ask the user, synthesize, stop safely, or only emit status.',
			trigger: input.trigger,
			observation_type: input.observationType,
			deterministic_decision: input.deterministicDecision,
			digest: input.digest,
			output_schema: {
				action: 'continue | emit_status | force_synthesis | ask_user | stop_with_message | flag_eval',
				reason: 'short stable reason string',
				message: 'required for emit_status or stop_with_message',
				question: 'required for ask_user',
				instruction: 'required for force_synthesis',
				finishedReason: 'required for stop_with_message'
			},
			rules: [
				'Use continue when deterministic handling is already sufficient.',
				'Use emit_status only for long-running cases where the user needs progress context.',
				'Use force_synthesis when enough evidence exists and more tools are likely wasteful.',
				'Use ask_user only when continuing could mutate the wrong target or a required detail is missing.',
				'Use stop_with_message when progress is impossible and a concise explanation is safer.',
				'Never claim a write succeeded unless digest.progress.successfulWrites is positive.'
			]
		},
		null,
		2
	);
}

function parseJudgeDecision(raw: string, digest: TurnDigest): TurnSupervisorDecision | null {
	const parsed = extractJsonObject(raw);
	if (!parsed) return null;
	const action = typeof parsed.action === 'string' ? parsed.action.trim() : '';
	const reason = readNonEmptyString(parsed.reason) ?? 'llm_judge';

	if (action === 'continue') {
		return { action: 'continue', reason };
	}

	if (action === 'emit_status') {
		const message = readNonEmptyString(parsed.message);
		return message ? { action, message, reason } : null;
	}

	if (action === 'force_synthesis') {
		const instruction =
			readNonEmptyString(parsed.instruction) ??
			'Supervisor judge: stop calling tools and produce the best final answer from the available tool results.';
		return { action, instruction, reason };
	}

	if (action === 'ask_user') {
		const question = readNonEmptyString(parsed.question);
		if (!question) return null;
		return {
			action,
			question,
			reason,
			checkpoint: {
				digest,
				resumeContext: {
					reason,
					question,
					triggered_by: 'llm_judge',
					instruction:
						'Continue from this supervisor judge checkpoint after the user provides the missing detail. Do not retry unsafe writes until the ambiguity is resolved.'
				}
			}
		};
	}

	if (action === 'stop_with_message') {
		const message = readNonEmptyString(parsed.message);
		if (!message) return null;
		return {
			action,
			message,
			reason,
			finishedReason: readNonEmptyString(parsed.finishedReason) ?? 'supervisor_judge_stop'
		};
	}

	if (action === 'flag_eval') {
		return { action, reason };
	}

	return null;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
	const trimmed = raw.trim();
	const candidates = [trimmed];
	const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fencedMatch?.[1]) {
		candidates.unshift(fencedMatch[1].trim());
	}
	const objectStart = trimmed.indexOf('{');
	const objectEnd = trimmed.lastIndexOf('}');
	if (objectStart >= 0 && objectEnd > objectStart) {
		candidates.push(trimmed.slice(objectStart, objectEnd + 1));
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate) as unknown;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

function readNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
