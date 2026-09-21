// packages/agentic-chat-runtime/src/specialists/recommendations.ts
import { hashSpecialistWorkbenchValue } from './workbench';

export type SpecialistRecommendationCandidateV1 = {
	draftId: string;
	version: number;
	draftRevision: number;
	snapshotHash: string;
	name: string;
	createdAt: string;
	description: string;
	expertise: string[];
	documentReadEnabled: boolean;
};
export type SpecialistRecommendationInputV1 = {
	version: 'specialist_recommendation_input_v1';
	policy: 'jev_specialist_choice_v1';
	projectId: string;
	question: string;
	candidates: SpecialistRecommendationCandidateV1[];
};
export type SpecialistRecommendationResultV1 = {
	status: 'selected' | 'uncertain' | 'unavailable';
	selected: SpecialistRecommendationCandidateV1 | null;
	ranking: Array<{ draftId: string; version: number; name: string; probability: number }>;
	confidence: number | null;
	margin: number | null;
	reason: string;
	durationMs: number | null;
	costUsd: number | null;
	provider: {
		model: string;
		requestId: string | null;
		inputTokens: number | null;
		outputTokens: number | null;
		attempts: number;
	} | null;
};
export type SpecialistRecommendationReceiptV1 = {
	id: string;
	inputHash: string;
	resultHash: string;
	input: SpecialistRecommendationInputV1;
	result: SpecialistRecommendationResultV1;
};

/** Recovery verifies the frozen selection receipt; it never calls Jev or reads the live catalog. */
export async function verifySpecialistRecommendationReceiptV1(
	receipt: SpecialistRecommendationReceiptV1,
	selected: { draftId: string; version: number; snapshotHash: string }
): Promise<void> {
	const match = receipt?.result?.selected;
	if (
		!/^[a-f0-9-]{36}$/.test(receipt?.id ?? '') ||
		receipt.input?.version !== 'specialist_recommendation_input_v1' ||
		receipt.input?.policy !== 'jev_specialist_choice_v1' ||
		receipt.result?.status !== 'selected' ||
		!match ||
		match.draftId !== selected.draftId ||
		match.version !== selected.version ||
		match.snapshotHash !== selected.snapshotHash ||
		!Array.isArray(receipt.input.candidates) ||
		receipt.input.candidates.length > 20 ||
		!receipt.input.candidates.some(
			(c) =>
				c.draftId === match.draftId &&
				c.version === match.version &&
				c.snapshotHash === match.snapshotHash
		) ||
		(await hashSpecialistWorkbenchValue(receipt.input)) !== receipt.inputHash ||
		(await hashSpecialistWorkbenchValue(receipt.result)) !== receipt.resultHash
	)
		throw new Error('Invalid specialist recommendation receipt');
}
