import {
	chapterNoCostOutcome,
	type createChapterResearchExecution
} from './chapterResearchExecution';
import type {
	ChapterExtractionResult,
	ChapterResearchInput,
	ChapterSearchResult
} from './chapterResearch';
import type { LibriCostLedgerPort } from './costLedger';
import {
	LibriMaintenanceProcessorError,
	type LibriMaintenanceProcessorPort
} from './maintenanceConsumer';
export function createChapterResearchProcessor(
	deps: {
		execution: ReturnType<typeof createChapterResearchExecution>;
		ledger: LibriCostLedgerPort;
		search: {
			execute(input: ChapterResearchInput, signal: AbortSignal): Promise<ChapterSearchResult>;
		};
		extract: {
			execute(
				input: ChapterResearchInput,
				model: string,
				signal: AbortSignal
			): Promise<ChapterExtractionResult>;
		};
	},
	options: { model: string; searchReservedMicrousd: bigint; extractionReservedMicrousd: bigint }
): LibriMaintenanceProcessorPort {
	if (
		!/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(options.model) ||
		options.searchReservedMicrousd <= 0n ||
		options.extractionReservedMicrousd <= 0n
	)
		throw new Error('Invalid chapter research configuration');
	return {
		async execute(claim, signal) {
			if (
				claim.queueType !== 'libri_research' ||
				claim.payload.version !== 1 ||
				claim.payload.kind !== 'task_execute' ||
				claim.payload.taskType !== 'find_book_info'
			)
				throw failure('unsupported_chapter_task');
			signal.throwIfAborted();
			if (claim.payload.workflowVersion === undefined) {
				try {
					await deps.execution.plan(claim);
					return;
				} catch {
					throw failure('chapter_planning_failed');
				}
			}
			const search = claim.payload.phase === 'chapter_search';
			if (
				claim.payload.workflowVersion !== 1 ||
				(!search && claim.payload.phase !== 'chapter_extract')
			)
				throw failure('unsupported_chapter_stage');
			const input = await deps.execution.load(claim);
			if (chapterNoCostOutcome(claim, input)) {
				await deps.execution.skip(claim);
				return;
			}
			let reservationId: string | null = null,
				mayHaveStarted = false;
			try {
				const receipt = await deps.ledger.reserveProviderCost({
					stepId: claim.stepId,
					executionGeneration: claim.executionGeneration,
					leaseToken: claim.leaseToken,
					reservationKey: `chapter-${search ? 'search' : 'extract'}:${input.dataset.chapter.id}`,
					provider: search ? 'tavily' : 'openrouter',
					model: search ? 'advanced' : options.model,
					reservedMicrousd: search
						? options.searchReservedMicrousd
						: options.extractionReservedMicrousd
				});
				reservationId = receipt.reservationId;
				if (receipt.outcome !== 'reserved' || !reservationId)
					throw failure(`chapter_cost_${receipt.outcome}`);
				signal.throwIfAborted();
				mayHaveStarted = true;
				if (!(await deps.execution.authorize(claim, reservationId, input.fingerprint)))
					throw failure('chapter_authorization_refused');
				signal.throwIfAborted();
				if (search) {
					const result = await deps.search.execute(input, signal);
					if (result.model !== 'advanced' || result.provider !== 'tavily')
						throw failure('chapter_search_provider_mismatch');
					await deps.execution.saveSearch(claim, reservationId, input, result);
				} else {
					const result = await deps.extract.execute(input, options.model, signal);
					if (result.model !== options.model)
						throw failure('chapter_extraction_model_mismatch');
					await deps.execution.saveExtraction(claim, reservationId, input, result);
				}
			} catch (error) {
				if (reservationId && !mayHaveStarted)
					await deps.ledger
						.releaseProviderCost({
							reservationId,
							executionGeneration: claim.executionGeneration,
							leaseToken: claim.leaseToken,
							reason: 'chapter_pre_authorization_failed'
						})
						.catch(() => undefined);
				if (mayHaveStarted) throw failure('provider_reconciliation_required');
				if (error instanceof LibriMaintenanceProcessorError) throw error;
				throw failure('chapter_preparation_failed');
			}
		}
	};
}
function failure(code: string) {
	return new LibriMaintenanceProcessorError(
		code,
		'Chapter research could not complete; check research status.',
		false
	);
}
