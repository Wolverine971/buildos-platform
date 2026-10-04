import {
	finishResearchClaim,
	lockResearchClaim,
	researchTransaction
} from './bookResearchTransaction';
import { createLibriCostLedger } from './costLedger';
import {
	CHAPTER_RESEARCH_FIELDS,
	type ChapterExtractionResult,
	type ChapterResearchInput,
	type ChapterSearchResult
} from './chapterResearch';
import { type ChapterWorkflowStage, createLibriResearchWorkflow } from './researchWorkflow';
import type {
	ClaimedLibriStep,
	LibriLifecyclePort,
	LibriTransactionClient,
	LibriTransactionalPool
} from './lifecycle';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function chapterNoCostOutcome(claim: ClaimedLibriStep, input: ChapterResearchInput) {
	if (
		claim.payload.phase === 'chapter_extract' &&
		input.searchFingerprint &&
		input.searchFingerprint !== input.fingerprint
	)
		return 'outdated';
	if (input.dataset.requestedFields.length === 0 || input.searchOutcome === 'current')
		return 'current';
	if (
		claim.payload.phase === 'chapter_extract' &&
		!input.dataset.evidence?.results.some((r) => r.content.trim())
	)
		return 'insufficient_evidence';
	return null;
}
export function createChapterResearchExecution(
	pool: LibriTransactionalPool,
	lifecycle: Pick<LibriLifecyclePort, 'enqueueStep'>
) {
	const workflow = createLibriResearchWorkflow(pool, lifecycle);
	async function load(
		client: LibriTransactionClient,
		claim: ClaimedLibriStep
	): Promise<ChapterResearchInput> {
		const result = await client.query<{ input: ChapterResearchInput }>(
			'SELECT libri.read_chapter_research_input($1,$2,$3) AS input',
			[claim.stepId, claim.executionGeneration, claim.leaseToken]
		);
		const input = result.rows[0]?.input;
		if (
			!input ||
			input.dataset?.book?.id !== claim.payload.bookId ||
			input.dataset.chapter?.id !== claim.payload.chapterId ||
			!Array.isArray(input.dataset.requestedFields) ||
			input.dataset.requestedFields.some((f) => !CHAPTER_RESEARCH_FIELDS.includes(f)) ||
			!/^[a-f0-9]{64}$/.test(input.fingerprint)
		)
			throw new Error('Invalid chapter research input');
		return input;
	}
	return {
		plan: (claim: ClaimedLibriStep) =>
			workflow.plan(claim, async (client) => {
				const result = await client.query<{
					plan: { bookId: string; chapterCount: number; chapters: Array<{ id: string }> };
				}>('SELECT libri.read_chapter_research_plan($1,$2,$3) AS plan', [
					claim.stepId,
					claim.executionGeneration,
					claim.leaseToken
				]);
				const plan = result.rows[0]?.plan;
				if (
					!plan ||
					plan.bookId !== claim.payload.bookId ||
					!Number.isSafeInteger(plan.chapterCount) ||
					plan.chapterCount < 1 ||
					plan.chapterCount > 300 ||
					!Array.isArray(plan.chapters) ||
					plan.chapters.length > plan.chapterCount ||
					new Set(plan.chapters.map((c) => c.id)).size !== plan.chapters.length ||
					plan.chapters.some((c) => !UUID.test(c.id))
				)
					throw new Error('Invalid chapter plan receipt');
				return plan.chapters.flatMap((chapter, index): ChapterWorkflowStage[] => [
					{ phase: 'chapter_search', chapterId: chapter.id, dependsOn: [] },
					{ phase: 'chapter_extract', chapterId: chapter.id, dependsOn: [index * 2] }
				]);
			}),
		load: (claim: ClaimedLibriStep) =>
			researchTransaction(pool, (client) => load(client, claim)),
		authorize: (claim: ClaimedLibriStep, reservationId: string, fingerprint: string) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				const input = await load(client, claim);
				if (
					input.fingerprint !== fingerprint ||
					chapterNoCostOutcome(claim, input) !== null
				)
					throw new Error('Chapter research input changed');
				return (
					await createLibriCostLedger(client).authorizeProviderCall({
						reservationId,
						executionGeneration: claim.executionGeneration,
						leaseToken: claim.leaseToken
					})
				).authorized;
			}),
		skip: (claim: ClaimedLibriStep) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				const input = await load(client, claim),
					outcome = chapterNoCostOutcome(claim, input);
				if (!outcome) throw new Error('Chapter stage still requires research');
				await finishResearchClaim(client, claim, {
					outcome,
					message:
						outcome === 'current'
							? 'Existing chapter fields are current.'
							: outcome === 'outdated'
								? 'Chapter changed after its saved search; review required.'
								: 'Saved search has insufficient chapter evidence.'
				});
			}),
		saveSearch: (
			claim: ClaimedLibriStep,
			reservationId: string,
			input: ChapterResearchInput,
			result: ChapterSearchResult
		) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				const saved = await client.query<{ receipt: Record<string, unknown> }>(
					'SELECT libri.persist_chapter_search_result($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9) receipt',
					[
						claim.stepId,
						claim.executionGeneration,
						claim.leaseToken,
						reservationId,
						input.fingerprint,
						JSON.stringify(input.dataset),
						JSON.stringify(result.output),
						result.costMicrousd.toString(),
						result.providerRequestId
					]
				);
				const receipt = saved.rows[0]?.receipt;
				if (
					!receipt ||
					!UUID.test(String(receipt.evidenceId)) ||
					receipt.model !== result.model
				)
					throw new Error('Invalid saved search receipt');
				await finishResearchClaim(client, claim, receipt, result);
			}),
		saveExtraction: (
			claim: ClaimedLibriStep,
			reservationId: string,
			input: ChapterResearchInput,
			result: ChapterExtractionResult
		) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				const saved = await client.query<{ receipt: Record<string, unknown> }>(
					'SELECT libri.persist_chapter_research_result($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11) receipt',
					[
						claim.stepId,
						claim.executionGeneration,
						claim.leaseToken,
						reservationId,
						input.fingerprint,
						JSON.stringify(input.dataset.requestedFields),
						JSON.stringify(result.output),
						result.costMicrousd.toString(),
						result.promptTokens.toString(),
						result.completionTokens.toString(),
						result.providerRequestId
					]
				);
				const receipt = saved.rows[0]?.receipt;
				if (
					!receipt ||
					!UUID.test(String(receipt.artifactId)) ||
					receipt.chapterId !== input.dataset.chapter.id ||
					receipt.model !== result.model
				)
					throw new Error('Invalid saved chapter receipt');
				await finishResearchClaim(client, claim, receipt, result);
			})
	};
}
