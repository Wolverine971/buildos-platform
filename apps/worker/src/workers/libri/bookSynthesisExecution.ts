import {
	finishResearchClaim,
	lockResearchClaim,
	researchTransaction
} from './bookResearchTransaction';
import { createLibriCostLedger } from './costLedger';
import type { ClaimedLibriStep, LibriTransactionClient, LibriTransactionalPool } from './lifecycle';
import type { SynthesisExecution, SynthesisInput } from './bookSynthesis';

export function createBookSynthesisExecution(pool: LibriTransactionalPool): SynthesisExecution {
	async function load(
		client: LibriTransactionClient,
		claim: ClaimedLibriStep
	): Promise<SynthesisInput> {
		const result = await client.query<{ input: SynthesisInput }>(
			'SELECT libri.read_book_synthesis_input($1,$2,$3) AS input',
			[claim.stepId, claim.executionGeneration, claim.leaseToken]
		);
		const input = result.rows[0]?.input;
		if (
			result.rows.length !== 1 ||
			!input?.dataset?.book?.id ||
			!Array.isArray(input.dataset.chapters) ||
			!Number.isSafeInteger(input.snapshot?.chapterCount) ||
			!/^[a-f0-9]{64}$/.test(input.fingerprint)
		)
			throw new Error('Invalid synthesis input receipt');
		return input;
	}
	return {
		load: (claim) => researchTransaction(pool, (client) => load(client, claim)),
		authorize: (claim, reservationId) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				await load(client, claim);
				const result = await createLibriCostLedger(client).authorizeProviderCall({
					reservationId,
					executionGeneration: claim.executionGeneration,
					leaseToken: claim.leaseToken
				});
				return result.authorized;
			}),
		useCurrent: (claim, artifactId) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				const input = await load(client, claim);
				const current = input.currentAnalysis;
				if (
					!current ||
					current.id !== artifactId ||
					current.fingerprint !== input.fingerprint ||
					!['generated', 'reviewed'].includes(current.status) ||
					Date.now() - Date.parse(current.generatedAt) >= 86400000
				)
					throw new Error('Current synthesis changed');
				await finishResearchClaim(client, claim, {
					message: 'Existing book synthesis is current.',
					artifactId,
					version: current.version
				});
			}),
		complete: (claim, reservationId, input, result) =>
			researchTransaction(pool, async (client) => {
				await lockResearchClaim(client, claim);
				const persisted = await client.query<{ receipt: Record<string, unknown> }>(
					`SELECT libri.persist_book_synthesis_result($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13) AS receipt`,
					[
						claim.stepId,
						claim.executionGeneration,
						claim.leaseToken,
						claim.queueRowId,
						claim.processingToken,
						reservationId,
						input.fingerprint,
						JSON.stringify(input.snapshot),
						JSON.stringify(result.analysis),
						result.costMicrousd.toString(),
						result.promptTokens.toString(),
						result.completionTokens.toString(),
						result.providerRequestId
					]
				);
				const receipt = persisted.rows[0]?.receipt;
				if (
					persisted.rows.length !== 1 ||
					!receipt ||
					typeof receipt.artifactId !== 'string' ||
					receipt.bookId !== input.dataset.book.id ||
					receipt.model !== result.model
				)
					throw new Error('Invalid synthesis completion receipt');
				await finishResearchClaim(client, claim, receipt, result);
			})
	};
}
