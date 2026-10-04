import type { ClaimedLibriStep, LibriTransactionClient, LibriTransactionalPool } from './lifecycle';
import { createLibriCostLedger } from './costLedger';
import {
	finishResearchClaim,
	lockResearchClaim,
	researchTransaction
} from './bookResearchTransaction';
import type { BookAgentExecution, BookAgentInput, BookAgentResult } from './bookAgentProfile';

export function createBookAgentExecution(pool: LibriTransactionalPool): BookAgentExecution {
	async function load(
		client: LibriTransactionClient,
		claim: ClaimedLibriStep
	): Promise<BookAgentInput> {
		const result = await client.query<{ input: BookAgentInput }>(
			'SELECT libri.read_book_agent_input($1,$2,$3) AS input',
			[claim.stepId, claim.executionGeneration, claim.leaseToken]
		);
		const input = result.rows[0]?.input;
		if (
			result.rows.length !== 1 ||
			!input?.dataset?.book?.id ||
			!Array.isArray(input.dataset.chapters) ||
			!Number.isSafeInteger(input.snapshot?.chapterCount) ||
			input.snapshot.notesVisibility !== 'shared_link' ||
			!input.profileRevision ||
			!/^[a-f0-9]{64}$/.test(input.fingerprint)
		)
			throw new Error('Invalid book agent input receipt');
		return input;
	}
	function persist(
		claim: ClaimedLibriStep,
		reservationId: string | null,
		input: BookAgentInput,
		knowledge: string,
		result?: BookAgentResult
	) {
		return researchTransaction(pool, async (client) => {
			await lockResearchClaim(client, claim);
			const persisted = await client.query<{ receipt: Record<string, unknown> }>(
				'SELECT libri.persist_book_agent_result($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15) AS receipt',
				[
					claim.stepId,
					claim.executionGeneration,
					claim.leaseToken,
					claim.queueRowId,
					claim.processingToken,
					reservationId,
					input.fingerprint,
					JSON.stringify(input.snapshot),
					JSON.stringify(input.profileRevision),
					result ? JSON.stringify(result.output) : null,
					knowledge,
					result?.costMicrousd.toString() ?? null,
					result?.promptTokens.toString() ?? null,
					result?.completionTokens.toString() ?? null,
					result?.providerRequestId ?? null
				]
			);
			const receipt = persisted.rows[0]?.receipt;
			if (
				persisted.rows.length !== 1 ||
				!receipt ||
				typeof receipt.profileId !== 'string' ||
				typeof receipt.artifactId !== 'string' ||
				typeof receipt.knowledgeArtifactId !== 'string' ||
				receipt.bookId !== input.dataset.book.id ||
				(result && receipt.model !== result.model)
			)
				throw new Error('Invalid book agent completion receipt');
			await finishResearchClaim(client, claim, receipt, result);
		});
	}
	return {
		load: (claim) => researchTransaction(pool, (client) => load(client, claim)),
		authorize: (claim, reservationId) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				await load(client, claim);
				const receipt = await createLibriCostLedger(client).authorizeProviderCall({
					reservationId,
					executionGeneration: claim.executionGeneration,
					leaseToken: claim.leaseToken
				});
				return receipt.authorized;
			}),
		useCurrent: (claim, input, knowledge) => persist(claim, null, input, knowledge),
		complete: (claim, reservationId, input, result, knowledge) =>
			persist(claim, reservationId, input, knowledge, result)
	};
}
