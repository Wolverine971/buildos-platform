// packages/agentic-chat-runtime/src/loop/cleanup-manifest.ts
// Requested outcomes and their evidence, kept separate from write receipts.
import type { FastToolExecution } from './shared';
import { buildRequestCompletionLedger, extractReviewedArchiveState } from './request-expectation';
import {
	type TurnContract,
	bindTurnContractLabels,
	resolveTurnContractOutcomeFromLedger
} from './turn-contract';

export type CleanupManifestStatus =
	| 'saved'
	| 'already_satisfied'
	| 'pending'
	| 'blocked'
	| 'uncertain';
export type CleanupManifestItem = {
	outcomeId: string;
	targetId: string | null;
	entityKind: string;
	action: string;
	status: CleanupManifestStatus;
	title?: string;
	description?: string;
	savedEffects: number;
	alreadySatisfiedEffects: number;
	requiredEffects: number;
	reason?: string;
};
export type CleanupManifest = {
	version: 1;
	fulfilled: boolean;
	items: CleanupManifestItem[];
};

export function buildCleanupManifest(params: {
	contract: TurnContract;
	toolExecutions: readonly FastToolExecution[];
	finishedReason?: string | null;
	partialFailureClass?: string | null;
}): CleanupManifest {
	const { writes, ledger } = buildRequestCompletionLedger(params.toolExecutions);
	const facts = extractReviewedArchiveState(params.toolExecutions)?.targets ?? [];
	const writeBindings = bindTurnContractLabels(params.contract, writes);
	const allBindings = bindTurnContractLabels(params.contract, ledger);
	const resolution = resolveTurnContractOutcomeFromLedger(
		params.contract,
		ledger,
		params.finishedReason
	);
	const items = params.contract.outcomes.flatMap((outcome, index) => {
		// With an explicit lower minimum, targets are eligible candidates. Once
		// that outcome is fulfilled, unselected candidates are not pending work.
		const candidateIds = outcome.targetIds.length ? outcome.targetIds : [null];
		return candidateIds.flatMap((targetId): CleanupManifestItem[] => {
			const resolvedTargetId =
				targetId ??
				(outcome.action === 'create' && outcome.label
					? (allBindings.get(outcome.label) ?? null)
					: null);
			const single = {
				...outcome,
				...(targetId ? { targetIds: [targetId], minimumSuccessfulEffects: 1 } : {})
			};
			const contract = { ...params.contract, outcomes: [single] };
			const saved = resolveTurnContractOutcomeFromLedger(
				contract,
				writes,
				undefined,
				writeBindings
			).outcomes[0]!;
			const all = resolveTurnContractOutcomeFromLedger(
				contract,
				ledger,
				undefined,
				allBindings
			).outcomes[0]!;
			if (targetId && resolution.outcomes[index]?.fulfilled && !all.fulfilled) return [];
			const related = writes.filter(
				(entry) =>
					entry.entityKind === outcome.entityKind &&
					(resolvedTargetId
						? entry.entityId === resolvedTargetId
						: entry.action === outcome.action)
			);
			const latest = related.at(-1);
			const failure = latest?.status === 'failure' ? latest : undefined;
			const fact = targetId
				? facts.find((f) => f.id === targetId && f.entity_kind === outcome.entityKind)
				: undefined;
			const terminalBlock = ['supervisor_question', 'semantic_review_failed'].includes(
				params.finishedReason ?? ''
			);
			const status: CleanupManifestStatus = failure?.uncertain
				? 'uncertain'
				: failure
					? 'blocked'
					: saved.fulfilled
						? 'saved'
						: all.fulfilled
							? 'already_satisfied'
							: fact?.status === 'inconsistent' || terminalBlock
								? 'blocked'
								: 'pending';
			const title = [...related].reverse().find((e) => e.title)?.title ?? fact?.title;
			return [
				{
					outcomeId: outcome.id,
					targetId: resolvedTargetId,
					entityKind: outcome.entityKind,
					action: outcome.action,
					status,
					...(title ? { title } : {}),
					...(outcome.description ? { description: outcome.description } : {}),
					savedEffects: saved.matchedEffects,
					alreadySatisfiedEffects: Math.max(0, all.matchedEffects - saved.matchedEffects),
					requiredEffects: all.requiredEffects,
					...(failure?.error
						? { reason: failure.error }
						: fact?.status === 'inconsistent'
							? { reason: 'archive_tree_inconsistent' }
							: fact?.status === 'unavailable'
								? { reason: 'archive_state_unavailable' }
								: terminalBlock
									? { reason: params.finishedReason ?? undefined }
									: {})
				}
			];
		});
	});
	return { version: 1, fulfilled: resolution.fulfilled && !params.partialFailureClass, items };
}

/** Deterministic labels from structured evidence, never an interpretation of prose. */
export function describePendingCleanupItems(manifest: CleanupManifest): string[] {
	return manifest.items
		.filter((item) => ['pending', 'blocked', 'uncertain'].includes(item.status))
		.map((item) =>
			[
				item.status === 'pending' ? null : item.status,
				item.action,
				item.entityKind,
				item.title ?? item.targetId ?? item.description ?? item.outcomeId
			]
				.filter(Boolean)
				.join(' ')
		);
}

export function renderAlreadySatisfiedCleanupItems(manifest: CleanupManifest): string | null {
	const items = manifest.items.filter((item) => item.status === 'already_satisfied');
	if (!items.length) return null;
	return [
		'Already satisfied before this turn (verified; no new write):',
		'',
		...items.map(
			(item) =>
				`- ${item.entityKind}: ${(item.title ?? item.targetId ?? item.outcomeId).replace(/[\r\n\t]/g, ' ').slice(0, 240)}`
		)
	].join('\n');
}
