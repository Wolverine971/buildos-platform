// packages/agentic-chat-runtime/src/loop/request-expectation.ts
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME } from '../catalog/definitions/controls';
import type { FastToolExecution } from './shared';
import { isWriteLedgerToolExecution } from './tool-classification';
import type {
	ArchiveStateTarget,
	ArchiveStateVerification
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { buildWriteLedger, type WriteLedgerEntry } from './write-ledger';
import {
	type TurnContract,
	parseDeclaredTurnContract,
	resolveTurnContractOutcome,
	resolveTurnContractOutcomeFromLedger,
	serializeTurnContractForDeclaration
} from './turn-contract';

/** Reuse the outcome matcher, without granting a checklist any write authority. */
export function parseRequestExpectation(value: unknown): TurnContract | null {
	return parseDeclaredTurnContract(value);
}

export function requestExpectationsMatch(a: TurnContract, b: TurnContract): boolean {
	return (
		canonicalizeAgenticChatJson(serializeTurnContractForDeclaration(a)) ===
		canonicalizeAgenticChatJson(serializeTurnContractForDeclaration(b))
	);
}

/**
 * Only the first durable batch approval, before any write, can establish the
 * request expectation. Later approvals must never shrink it to the work done.
 * Old approvals without this field remain unverified, rather than acquiring an
 * expectation retrospectively. The result must echo the reviewed arguments.
 */
export function extractReviewedRequestExpectation(
	executions: readonly FastToolExecution[] | null | undefined
): TurnContract | null {
	return firstReviewedRequestApproval(executions)?.expectation ?? null;
}

function firstReviewedRequestApproval(
	executions: readonly FastToolExecution[] | null | undefined
): {
	expectation: TurnContract;
	execution: FastToolExecution;
	index: number;
} | null {
	for (const [index, execution] of (executions ?? []).entries()) {
		if (isWriteLedgerToolExecution(execution)) return null;
		if (execution.toolCall.function.name !== APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME) continue;
		if (!execution.result.success) continue;
		const result = execution.result.result;
		if (result?.status !== 'mutation_batch_review_approved') continue;
		try {
			const args = JSON.parse(execution.toolCall.function.arguments);
			if (
				!args ||
				typeof args.batch_sha256 !== 'string' ||
				!/^[a-f0-9]{64}$/.test(args.batch_sha256) ||
				result.batch_sha256 !== args.batch_sha256
			)
				return null;
			const proposed = parseRequestExpectation(args.request_expectation);
			const persisted = parseRequestExpectation(result.request_expectation);
			return proposed && persisted && requestExpectationsMatch(proposed, persisted)
				? { expectation: persisted, execution, index }
				: null;
		} catch {
			return null;
		}
	}
	return null;
}

/** Exact existing archive targets from the immutable reviewer checklist. */
export function getRequestArchiveTargets(expectation: TurnContract): ArchiveStateTarget[] {
	const targets = new Map<string, ArchiveStateTarget>();
	for (const outcome of expectation.outcomes) {
		if (
			outcome.action !== 'archive' ||
			!['task', 'goal', 'document'].includes(outcome.entityKind)
		)
			continue;
		for (const id of outcome.targetIds)
			targets.set(`${outcome.entityKind}:${id}`, {
				entity_kind: outcome.entityKind as ArchiveStateTarget['entity_kind'],
				id
			});
	}
	return [...targets.values()];
}

export function extractReviewedArchiveState(
	executions: readonly FastToolExecution[]
): ArchiveStateVerification | null {
	const approval = firstReviewedRequestApproval(executions);
	if (!approval) return null;
	const value = approval.execution.result.result?.archive_postconditions;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		record.version !== 1 ||
		record.status !== 'verified' ||
		!Array.isArray(record.targets) ||
		record.targets.length > 100
	)
		return null;
	const allowed = new Set(
		getRequestArchiveTargets(approval.expectation).map((t) => `${t.entity_kind}:${t.id}`)
	);
	const seen = new Set<string>();
	const targets: ArchiveStateVerification['targets'] = [];
	for (const value of record.targets) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		const fact = value as Record<string, unknown>;
		const key = `${fact.entity_kind}:${fact.id}`;
		if (
			!allowed.has(key) ||
			seen.has(key) ||
			!['archived', 'active', 'unavailable', 'inconsistent'].includes(String(fact.status))
		)
			return null;
		if (
			fact.status === 'archived' &&
			(typeof fact.archived_at !== 'string' ||
				!Number.isFinite(Date.parse(fact.archived_at)) ||
				typeof fact.project_id !== 'string')
		)
			return null;
		seen.add(key);
		targets.push({
			entity_kind: fact.entity_kind as ArchiveStateTarget['entity_kind'],
			id: String(fact.id),
			status: fact.status as ArchiveStateVerification['targets'][number]['status'],
			...(typeof fact.project_id === 'string' ? { project_id: fact.project_id } : {}),
			...(typeof fact.title === 'string' ? { title: fact.title } : {}),
			...(typeof fact.archived_at === 'string' ? { archived_at: fact.archived_at } : {})
		});
	}
	return { version: 1, status: 'verified', targets };
}

/**
 * Already-satisfied reads stay outside the write ledger. A later attempted
 * write invalidates the earlier read for that target, including a failed or
 * uncertain attempt; it cannot be hidden by a pre-write archive observation.
 */
export function buildRequestCompletionLedger(executions: readonly FastToolExecution[]): {
	writes: WriteLedgerEntry[];
	alreadySatisfied: WriteLedgerEntry[];
	ledger: WriteLedgerEntry[];
} {
	const writes = buildWriteLedger([...executions]);
	const facts = extractReviewedArchiveState(executions)?.targets ?? [];
	const alreadySatisfied: WriteLedgerEntry[] = facts
		.filter(
			(fact) =>
				fact.status === 'archived' &&
				!writes.some(
					(entry) => entry.entityKind === fact.entity_kind && entry.entityId === fact.id
				)
		)
		.map(
			(fact): WriteLedgerEntry => ({
				toolName: 'verified_archive_postcondition',
				status: 'success',
				action: 'archive',
				entityKind: fact.entity_kind,
				entityId: fact.id,
				title: fact.title,
				changedFields:
					fact.entity_kind === 'document' ? ['archived', 'state_key'] : ['archived'],
				changedValues:
					fact.entity_kind === 'document'
						? { archived: 'true', state_key: 'archived' }
						: { archived: 'true' }
			})
		);
	const latestByTarget = new Map<string, WriteLedgerEntry>();
	for (const entry of writes)
		if (entry.entityKind && entry.entityId)
			latestByTarget.set(`${entry.entityKind}:${entry.entityId}`, entry);
	// A later failed attempt may have committed. Earlier successes remain in
	// the saved-write receipt, but cannot prove this target's final postcondition.
	const completionWrites = writes.filter(
		(entry) =>
			entry.status !== 'success' ||
			!entry.entityId ||
			latestByTarget.get(`${entry.entityKind}:${entry.entityId}`)?.status !== 'failure'
	);
	return { writes, alreadySatisfied, ledger: [...alreadySatisfied, ...completionWrites] };
}

export function resolveRequestExpectationOutcome(params: {
	contract?: TurnContract | null;
	toolExecutions?: readonly FastToolExecution[] | null;
	finishedReason?: string | null;
}) {
	if (!params.contract)
		return resolveTurnContractOutcome({
			contract: null,
			finishedReason: params.finishedReason
		});
	return resolveTurnContractOutcomeFromLedger(
		params.contract,
		buildRequestCompletionLedger(params.toolExecutions ?? []).ledger,
		params.finishedReason
	);
}
