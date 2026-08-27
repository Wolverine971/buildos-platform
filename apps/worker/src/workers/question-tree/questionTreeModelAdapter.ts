// apps/worker/src/workers/question-tree/questionTreeModelAdapter.ts
import {
	OpenRouterClient,
	type OpenRouterResponse,
	cleanJSONResponse,
	extractTextFromChoice,
	isRetryableOpenRouterError,
	repairTruncatedJSONResponse
} from '@buildos/smart-llm';
import { buildNodePrompts, buildSeedPrompts, buildSynthesisPrompts } from './questionTreePrompts';
import type {
	FollowUpQuestion,
	QuestionTreeClaim,
	QuestionTreeModelClient,
	QuestionTreeModelResult,
	QuestionTreeModelTelemetry,
	QuestionTreeNodeOutput,
	QuestionTreeSeedOutput,
	QuestionTreeSynthesisOutput,
	SeedQuestion
} from './questionTreeContracts';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

function objectValue(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Question Tree model returned a non-object JSON value');
	}
	return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string, max = 20_000): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Question Tree model omitted ${field}`);
	}
	return value.trim().slice(0, max);
}

function optionalString(value: unknown, fallback: string, max = 20_000): string {
	return typeof value === 'string' && value.trim().length > 0
		? value.trim().slice(0, max)
		: fallback;
}

function numberValue(value: unknown, fallback = 0.5): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.min(1, value))
		: fallback;
}

function parseJsonContent(response: OpenRouterResponse): Record<string, unknown> {
	const raw = extractTextFromChoice(response.choices[0]);
	if (!raw || raw.trim().length === 0) {
		throw new Error('Question Tree model returned empty content');
	}
	const cleaned = cleanJSONResponse(raw);
	try {
		return objectValue(JSON.parse(cleaned));
	} catch (error) {
		const repaired = repairTruncatedJSONResponse(cleaned);
		if (repaired) {
			console.warn('Question Tree repaired a truncated model JSON response', {
				requestId: response.id || null,
				finishReason: response.choices[0]?.finish_reason ?? null
			});
			return objectValue(JSON.parse(repaired));
		}
		throw new Error(
			`Question Tree model returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function validateSeedQuestion(value: unknown): SeedQuestion {
	const row = objectValue(value);
	const purpose = row.purpose;
	const informationGain = row.expectedInformationGain;
	return {
		question: stringValue(row.question, 'questions[].question', 1000),
		unknownAddressed: optionalString(
			row.unknownAddressed,
			'The material uncertainty addressed by this question.',
			2000
		),
		whyItMatters: optionalString(
			row.whyItMatters,
			'Answering this would reduce uncertainty in the final thesis.',
			2000
		),
		purpose:
			purpose === 'resolve_unknown' || purpose === 'falsify' || purpose === 'frame'
				? purpose
				: 'frame',
		expectedInformationGain: informationGain === 'high' ? 'high' : 'medium'
	};
}

function validateClaim(value: unknown): QuestionTreeClaim {
	const row = objectValue(value);
	const status = row.status;
	return {
		statement: stringValue(row.statement, 'claims[].statement', 3000),
		status:
			status === 'probably_right' || status === 'probably_wrong' || status === 'unsure'
				? status
				: 'unsure',
		basis: optionalString(
			row.basis,
			'The model did not provide a separate basis for this assessment.',
			3000
		)
	};
}

function validateFollowUp(value: unknown): FollowUpQuestion {
	const row = objectValue(value);
	const purpose = row.purpose;
	const informationGain = row.expectedInformationGain;
	return {
		question: stringValue(row.question, 'followUpQuestions[].question', 1000),
		purpose:
			purpose === 'strengthen' || purpose === 'falsify' || purpose === 'resolve_unknown'
				? purpose
				: 'resolve_unknown',
		targetClaim: optionalString(row.targetClaim, '', 3000),
		whyItMatters: optionalString(
			row.whyItMatters,
			'Answering this would strengthen or challenge the current thesis.',
			3000
		),
		expectedInformationGain:
			informationGain === 'high' || informationGain === 'medium' || informationGain === 'low'
				? informationGain
				: 'medium',
		priority: numberValue(row.priority)
	};
}

function telemetry(
	response: OpenRouterResponse,
	modelRequested: string,
	latencyMs: number
): QuestionTreeModelTelemetry {
	const usage = response.usage;
	return {
		model_requested: modelRequested,
		model_used: response.model || modelRequested,
		provider_request_id: response.id || '',
		prompt_tokens: usage?.prompt_tokens ?? 0,
		completion_tokens: usage?.completion_tokens ?? 0,
		total_tokens: usage?.total_tokens ?? 0,
		cost_usd: usage?.cost ?? 0,
		latency_ms: latencyMs,
		reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0
	};
}

export class OpenRouterQuestionTreeModel implements QuestionTreeModelClient {
	private readonly client: OpenRouterClient;
	private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

	constructor(params?: {
		apiKey?: string;
		fetchImpl?: typeof fetch;
		sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
	}) {
		const apiKey = (params?.apiKey ?? process.env.PRIVATE_OPENROUTER_API_KEY ?? '').trim();
		if (!apiKey) throw new Error('Question Tree requires PRIVATE_OPENROUTER_API_KEY');
		this.client = new OpenRouterClient({
			apiKey,
			apiUrl: OPENROUTER_CHAT_URL,
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Question Tree',
			fetchImpl: params?.fetchImpl
		});
		this.sleep = params?.sleepImpl ?? waitForRetry;
	}

	private async request<T>(params: {
		model: string;
		policy: 'paid_floor_strict' | 'free_strict';
		system: string;
		user: string;
		maxTokens: number;
		signal?: AbortSignal;
		parse: (value: Record<string, unknown>) => T;
	}): Promise<QuestionTreeModelResult<T>> {
		const started = Date.now();
		let response: OpenRouterResponse | null = null;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				response = await this.client.callOpenRouter({
					model: params.model,
					messages: [
						{ role: 'system', content: params.system },
						{ role: 'user', content: params.user }
					],
					temperature: 0.2,
					max_tokens: params.maxTokens,
					timeoutMs: 120_000,
					signal: params.signal,
					...(params.policy === 'free_strict'
						? { reasoning: { effort: 'none', exclude: true } }
						: {}),
					...(params.policy === 'paid_floor_strict'
						? { response_format: { type: 'json_object' } }
						: {}),
					provider: {
						allow_fallbacks: true,
						require_parameters: params.policy === 'paid_floor_strict',
						data_collection: 'deny',
						zdr: true,
						...(params.policy === 'paid_floor_strict'
							? {
									max_price: {
										prompt: 0.02,
										completion: 0.06,
										request: 0
									}
								}
							: {})
					}
				});
				break;
			} catch (error) {
				if (attempt === 2 || !isRetryableOpenRouterError(error) || params.signal?.aborted) {
					throw error;
				}
				await this.sleep(retryDelayMs(error, attempt), params.signal);
			}
		}
		if (!response) throw new Error('Question Tree model request did not return a response');
		return {
			value: params.parse(parseJsonContent(response)),
			telemetry: telemetry(response, params.model, Date.now() - started)
		};
	}

	seed(params: Parameters<QuestionTreeModelClient['seed']>[0]) {
		const prompts = buildSeedPrompts(params.run.root_question);
		return this.request<QuestionTreeSeedOutput>({
			model: params.run.explorer_model_requested,
			policy: params.run.model_policy,
			...prompts,
			maxTokens: 800,
			signal: params.signal,
			parse: (value) => {
				if (!Array.isArray(value.questions))
					throw new Error('Seed output omitted questions');
				const questions = value.questions.slice(0, 5).map(validateSeedQuestion);
				if (questions.length < 2)
					throw new Error('Seed output must contain at least two questions');
				return { questions };
			}
		});
	}

	answer(params: Parameters<QuestionTreeModelClient['answer']>[0]) {
		const prompts = buildNodePrompts(params);
		const configuredMax = Number(params.run.config.explorer_max_tokens);
		return this.request<QuestionTreeNodeOutput>({
			model: params.run.explorer_model_requested,
			policy: params.run.model_policy,
			...prompts,
			maxTokens: Number.isFinite(configuredMax)
				? Math.min(1800, Math.max(1200, configuredMax))
				: 1300,
			signal: params.signal,
			parse: (value) => ({
				answer: stringValue(value.answer, 'answer'),
				thesis: stringValue(value.thesis, 'thesis', 6000),
				confidence: numberValue(value.confidence),
				claims: Array.isArray(value.claims)
					? value.claims.slice(0, 6).map(validateClaim)
					: [],
				followUpQuestions: Array.isArray(value.followUpQuestions)
					? value.followUpQuestions.slice(0, 3).map(validateFollowUp)
					: [],
				stopReason:
					typeof value.stopReason === 'string' && value.stopReason.trim()
						? value.stopReason.trim().slice(0, 3000)
						: 'No additional high-value questions proposed.'
			})
		});
	}

	synthesize(params: Parameters<QuestionTreeModelClient['synthesize']>[0]) {
		const prompts = buildSynthesisPrompts(params);
		const configuredMax = Number(params.run.config.synthesis_max_tokens);
		return this.request<QuestionTreeSynthesisOutput>({
			model: params.run.synthesis_model_requested,
			policy: params.run.model_policy,
			...prompts,
			maxTokens: Number.isFinite(configuredMax)
				? Math.min(3000, Math.max(900, configuredMax))
				: 1800,
			signal: params.signal,
			parse: (value) => {
				const strings = (input: unknown, max = 20): string[] =>
					Array.isArray(input)
						? input
								.filter((entry): entry is string => typeof entry === 'string')
								.slice(0, max)
						: [];
				const evidence = Array.isArray(value.keyEvidence)
					? value.keyEvidence.slice(0, 30).map((entry) => {
							const row = objectValue(entry);
							return {
								finding: stringValue(row.finding, 'keyEvidence[].finding'),
								nodeNumbers: Array.isArray(row.nodeNumbers)
									? row.nodeNumbers.filter((number): number is number =>
											Number.isInteger(number)
										)
									: []
							};
						})
					: [];
				const disagreements = Array.isArray(value.importantDisagreements)
					? value.importantDisagreements.slice(0, 20).map((entry) => {
							const row = objectValue(entry);
							return {
								issue: stringValue(row.issue, 'importantDisagreements[].issue'),
								nodeNumbers: Array.isArray(row.nodeNumbers)
									? row.nodeNumbers.filter((number): number is number =>
											Number.isInteger(number)
										)
									: []
							};
						})
					: [];
				return {
					finalAnswer: stringValue(value.finalAnswer, 'finalAnswer', 40_000),
					finalThesis: stringValue(value.finalThesis, 'finalThesis', 10_000),
					probablyRight: strings(value.probablyRight),
					probablyWrong: strings(value.probablyWrong),
					stillUnsure: strings(value.stillUnsure),
					keyEvidence: evidence,
					importantDisagreements: disagreements,
					recommendedNextResearch: strings(value.recommendedNextResearch),
					limitations: strings(value.limitations)
				};
			}
		});
	}
}

export function isOpenRouterQuotaError(
	error: unknown,
	policy: 'paid_floor_strict' | 'free_strict'
): boolean {
	const status = (error as { status?: unknown })?.status;
	return policy === 'free_strict' && status === 429;
}

function retryDelayMs(error: unknown, attempt: number): number {
	const retryAfterMs = (error as { openrouter?: { retryAfterMs?: unknown } })?.openrouter
		?.retryAfterMs;
	if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)) {
		return Math.min(30_000, Math.max(500, retryAfterMs));
	}
	return 1_000 * 2 ** attempt + Math.floor(Math.random() * 250);
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Request aborted'));
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		function onAbort() {
			clearTimeout(timer);
			reject(signal?.reason ?? new Error('Request aborted'));
		}
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}
