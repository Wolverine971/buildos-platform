// apps/web/src/lib/services/agentic-chat-v2/specialist-recommendations.server.ts
import {
	hashSpecialistWorkbenchValue,
	verifySpecialistRecommendationReceiptV1,
	type SpecialistRecommendationInputV1,
	type SpecialistRecommendationResultV1,
	type SpecialistRecommendationReceiptV1
} from '@buildos/agentic-chat-runtime/specialists';
import { parseJevAnswers, type JevDecider, type JevDecisionResult } from '@buildos/smart-llm';
import { normalizeAgenticChatText } from '@buildos/shared-types';
import type { SpecialistWorkbenchClient } from './specialist-workbench.server';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const finite = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
/**
 * Stored numbers are hashed by JavaScript and re-canonicalized by PostgreSQL. JavaScript writes
 * values below 1e-6 in exponent form ("1e-7") while PostgreSQL writes "0.0000001", so the finish
 * RPC would reject the result. Rounding keeps every stored value in plain decimal form.
 */
const decimal = (value: number, places: number): number => {
	const rounded = Number(value.toFixed(places));
	return Math.abs(rounded) < 1e-6 ? 0 : rounded;
};
const decimalOrNull = (value: unknown, places: number): number | null => {
	const checked = finite(value);
	return checked === null ? null : decimal(checked, places);
};
// Workbench limits count code points; UTF-16 length would reject valid emoji names.
const chars = (value: string) => [...value].length;
const object = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

export class SpecialistRecommendationError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

function storageResult(response: {
	data: unknown;
	error: { message?: string } | null;
}): Record<string, unknown> {
	if (response.error)
		throw new SpecialistRecommendationError(
			503,
			'Specialist recommendations are unavailable. Try again later.'
		);
	const value = object(response.data);
	if (!value || typeof value.outcome !== 'string')
		throw new SpecialistRecommendationError(503, 'Invalid recommendation storage response.');
	return value;
}

function inputShape(value: unknown): value is SpecialistRecommendationInputV1 {
	const v = object(value);
	if (
		!v ||
		v.version !== 'specialist_recommendation_input_v1' ||
		v.policy !== 'jev_specialist_choice_v1' ||
		typeof v.question !== 'string' ||
		typeof v.projectId !== 'string' ||
		!Array.isArray(v.candidates) ||
		v.candidates.length > 20
	)
		return false;
	const seen = new Set<string>();
	return v.candidates.every((candidate: unknown) => {
		const c = object(candidate);
		if (
			!c ||
			typeof c.draftId !== 'string' ||
			!uuid.test(c.draftId) ||
			!Number.isSafeInteger(c.version) ||
			Number(c.version) < 1 ||
			Number(c.version) > 50 ||
			!Number.isSafeInteger(c.draftRevision) ||
			Number(c.draftRevision) < 1 ||
			typeof c.snapshotHash !== 'string' ||
			!hash.test(c.snapshotHash) ||
			typeof c.name !== 'string' ||
			chars(c.name) > 80 ||
			typeof c.description !== 'string' ||
			chars(c.description) > 600 ||
			typeof c.createdAt !== 'string' ||
			typeof c.documentReadEnabled !== 'boolean' ||
			!Array.isArray(c.expertise) ||
			c.expertise.length > 8 ||
			!c.expertise.every((e: unknown) => typeof e === 'string' && chars(e) <= 60) ||
			seen.has(c.draftId)
		)
			return false;
		seen.add(c.draftId);
		return true;
	});
}

async function checkedReceipt(
	value: unknown,
	projectId: string,
	question: string
): Promise<SpecialistRecommendationReceiptV1> {
	const r = object(value);
	if (
		!r ||
		typeof r.id !== 'string' ||
		!uuid.test(r.id) ||
		typeof r.inputHash !== 'string' ||
		!hash.test(r.inputHash) ||
		typeof r.resultHash !== 'string' ||
		!hash.test(r.resultHash) ||
		!inputShape(r.input) ||
		r.input.projectId !== projectId ||
		r.input.question !== question ||
		(await hashSpecialistWorkbenchValue(r.input)) !== r.inputHash ||
		!object(r.result) ||
		(await hashSpecialistWorkbenchValue(r.result)) !== r.resultHash
	) {
		throw new SpecialistRecommendationError(
			503,
			'Saved recommendation integrity check failed.'
		);
	}
	const receipt = r as SpecialistRecommendationReceiptV1;
	if (!['selected', 'uncertain', 'unavailable'].includes(receipt.result.status))
		throw new SpecialistRecommendationError(503, 'Saved recommendation status is invalid.');
	if (receipt.result.status === 'selected' && receipt.result.selected)
		await verifySpecialistRecommendationReceiptV1(receipt, receipt.result.selected);
	return receipt;
}

export type PublicSpecialistRecommendation = Omit<
	SpecialistRecommendationResultV1,
	'provider' | 'status'
> & {
	id: string;
	status: SpecialistRecommendationResultV1['status'] | 'pending';
};
function publicResult(
	id: string,
	result: SpecialistRecommendationResultV1
): PublicSpecialistRecommendation {
	const { provider: _provider, ...visible } = result;
	return { id, ...visible };
}
function pending(id: string): PublicSpecialistRecommendation {
	return {
		id,
		status: 'pending',
		selected: null,
		ranking: [],
		confidence: null,
		margin: null,
		// A claim can stay pending forever after a crash or a failed save. It never bills again;
		// the page starts a new request on the next ask.
		reason: 'Jev has not finished this request. Ask again to retry, or choose a specialist yourself.',
		durationMs: null,
		costUsd: null
	};
}

function unavailable(reason: string): SpecialistRecommendationResultV1 {
	return {
		status: 'unavailable',
		selected: null,
		ranking: [],
		confidence: null,
		margin: null,
		reason,
		durationMs: null,
		costUsd: null,
		provider: null
	};
}

function interpret(
	input: SpecialistRecommendationInputV1,
	model: JevDecisionResult<{
		specialist: { type: 'choice'; instructions: string; criteria: Record<string, string> };
	}>
): SpecialistRecommendationResultV1 {
	const receipt = model.receipt;
	const telemetry = {
		durationMs: decimalOrNull(receipt.durationMs, 0),
		costUsd: decimalOrNull(receipt.costUsd, 9),
		provider: {
			model: String(receipt.modelUsed ?? receipt.modelRequested).slice(0, 128),
			requestId: receipt.requestId?.slice(0, 256) ?? null,
			inputTokens: decimalOrNull(receipt.inputTokens, 0),
			outputTokens: decimalOrNull(receipt.outputTokens, 0),
			attempts: Math.min(1, Math.floor(finite(receipt.attempts) ?? 0))
		}
	};
	if (!model.ok)
		return {
			...unavailable('Jev could not rank these specialists. Choose one manually.'),
			...telemetry
		};
	const questions = choiceQuestions(input);
	const parsed = parseJevAnswers(questions, { answers: model.answers });
	if (!parsed.ok)
		return {
			...unavailable('Jev returned an invalid ranking. Choose one manually.'),
			...telemetry
		};
	const answer = parsed.answers.specialist;
	const raw = Object.values(answer.probabilities);
	const total = raw.reduce((sum, p) => sum + p, 0);
	if (Math.abs(total - 1) > 0.02 || Math.max(...raw) !== answer.probabilities[answer.choice])
		return {
			...unavailable('Jev returned an inconsistent ranking. Choose one manually.'),
			...telemetry
		};
	// Thresholds apply to the stored values, so the receipt alone reproduces the decision.
	const entries = Object.entries(answer.probabilities)
		.map(([key, p]) => [key, decimal(p, 4)] as const)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	const top = entries[0]!;
	const margin = decimal(top[1] - entries[1]![1], 4);
	const ranking = entries
		.filter(([key]) => key !== 'none')
		.map(([key, probability]) => {
			const candidate = input.candidates[Number(key.slice(2))]!;
			return {
				draftId: candidate.draftId,
				version: candidate.version,
				name: candidate.name,
				probability
			};
		});
	const selected =
		top[0] !== 'none' && top[1] >= 0.6 && margin >= 0.15
			? input.candidates[Number(top[0].slice(2))]!
			: null;
	return {
		status: selected ? 'selected' : 'uncertain',
		selected,
		ranking,
		confidence: decimal(answer.confidence, 4),
		margin,
		reason: selected
			? 'This published specialist has the clearest fit for the question. Review the ranking before using it.'
			: top[0] === 'none'
				? 'None of the published specialists is a clear fit. Choose manually or publish another specialist.'
				: 'No published specialist is a clear enough fit to recommend. Review the ranking or choose manually.',
		...telemetry
	};
}

function choiceQuestions(input: SpecialistRecommendationInputV1) {
	const criteria: Record<string, string> = {
		none: 'No published specialist fits this question well enough for a saved-project read-only review.'
	};
	input.candidates.forEach((c, index) => {
		criteria[`s_${index}`] =
			`${c.name}: ${c.description}. Expertise: ${c.expertise.join(', ')}. Can read saved project documents: ${c.documentReadEnabled ? 'yes' : 'no'}.`;
	});
	return {
		specialist: {
			type: 'choice' as const,
			instructions:
				'Which one published specialist is most suitable for the user question? Prefer none when the available specialties do not fit. Use descriptions and capabilities only; do not infer facts about the project.',
			criteria
		}
	};
}

/** Only the fresh database claim permits one paid call. Replays return the saved result or pending. */
export async function recommendPublishedSpecialist(input: {
	client: SpecialistWorkbenchClient;
	decider: JevDecider;
	userId: string;
	projectId: string;
	requestId: string;
	question: string;
}): Promise<PublicSpecialistRecommendation> {
	const question = normalizeAgenticChatText(input.question);
	if (
		!uuid.test(input.projectId) ||
		!uuid.test(input.requestId) ||
		[...question].length < 3 ||
		[...question].length > 6000 ||
		new TextEncoder().encode(question).length > 24576
	)
		throw new SpecialistRecommendationError(
			422,
			'Enter a project question between 3 and 6,000 characters.'
		);
	const begin = storageResult(
		await input.client.rpc('begin_specialist_recommendation_v1', {
			p_user_id: input.userId,
			p_project_id: input.projectId,
			p_id: input.requestId,
			p_question: question
		})
	);
	if (begin.outcome === 'access_denied')
		throw new SpecialistRecommendationError(404, 'Project not found.');
	if (begin.outcome === 'idempotency_conflict')
		throw new SpecialistRecommendationError(
			409,
			'This request ID belongs to a different question.'
		);
	if (begin.outcome === 'quota_reached')
		throw new SpecialistRecommendationError(
			429,
			'The daily Jev recommendation limit has been reached.'
		);
	if (begin.outcome === 'invalid_request')
		throw new SpecialistRecommendationError(422, 'Invalid recommendation request.');
	if (begin.outcome === 'pending') return pending(input.requestId);
	if (begin.outcome === 'recorded') {
		const saved = await checkedReceipt(begin.receipt, input.projectId, question);
		return publicResult(saved.id, saved.result);
	}
	if (begin.outcome !== 'claimed')
		throw new SpecialistRecommendationError(503, 'Invalid recommendation claim.');
	const claim = object(begin.receipt);
	if (
		!claim ||
		typeof claim.id !== 'string' ||
		claim.id !== input.requestId ||
		typeof claim.inputHash !== 'string' ||
		!inputShape(claim.input) ||
		claim.input.projectId !== input.projectId ||
		claim.input.question !== question ||
		(await hashSpecialistWorkbenchValue(claim.input)) !== claim.inputHash ||
		typeof begin.attemptToken !== 'string' ||
		!uuid.test(begin.attemptToken)
	)
		throw new SpecialistRecommendationError(
			503,
			'Recommendation claim integrity check failed.'
		);
	const roster = claim.input as SpecialistRecommendationInputV1;
	let result: SpecialistRecommendationResultV1;
	if (roster.candidates.length === 0) {
		result = unavailable('Publish a specialist before asking Jev to choose one.');
	} else {
		try {
			const model = await input.decider.decide(
				{ state: { question: roster.question }, questions: choiceQuestions(roster) },
				{
					timeoutMs: 3000,
					usage: {
						operationType: 'agentic_chat_specialist_recommendation',
						userId: input.userId,
						projectId: input.projectId,
						metadata: { recommendationId: input.requestId, policy: roster.policy }
					}
				}
			);
			result = interpret(roster, model);
		} catch {
			result = unavailable('Jev could not rank these specialists. Choose one manually.');
		}
	}
	const finish = storageResult(
		await input.client.rpc('finish_specialist_recommendation_v1', {
			p_user_id: input.userId,
			p_id: input.requestId,
			p_input_hash: claim.inputHash,
			p_attempt_token: begin.attemptToken,
			p_result: result,
			p_result_hash: await hashSpecialistWorkbenchValue(result)
		})
	);
	if (finish.outcome !== 'recorded')
		throw new SpecialistRecommendationError(503, 'Recommendation could not be saved.');
	const saved = await checkedReceipt(finish.receipt, input.projectId, question);
	return publicResult(saved.id, saved.result);
}

export async function loadSelectedSpecialistRecommendation(input: {
	client: SpecialistWorkbenchClient;
	userId: string;
	id: string;
	projectId: string;
	question: string;
	selected: { draftId: string; version: number; snapshotHash: string };
}): Promise<SpecialistRecommendationReceiptV1> {
	const response = await input.client.rpc('get_specialist_recommendation_v1', {
		p_user_id: input.userId,
		p_project_id: input.projectId,
		p_id: input.id,
		p_question: input.question,
		p_draft_id: input.selected.draftId,
		p_version: input.selected.version,
		p_snapshot_hash: input.selected.snapshotHash
	});
	if (response.error || object(response.data)?.outcome !== 'selected')
		throw new SpecialistRecommendationError(
			409,
			'Jev recommendation is unavailable. Ask again or choose manually.'
		);
	const receipt = await checkedReceipt(
		object(response.data)?.receipt,
		input.projectId,
		input.question
	);
	await verifySpecialistRecommendationReceiptV1(receipt, input.selected);
	return receipt;
}
