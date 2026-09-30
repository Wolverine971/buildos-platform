// apps/worker/src/workers/agentic-chat/mutations/shared-document-edit.ts
// The ordinary gateway stays project-fenced. This exception is only for one
// live document on the focused child's shared shelf, after a later user turn.
import { createHash } from 'node:crypto';
import { isDocumentArchiveState } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	canonicalizeAgenticChatJson,
	parseProjectFamilyV1,
	type Database,
	type JsonObject
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	canonicalUuid,
	isRecord,
	knownFailure,
	requestProjectId,
	requiredUuid,
	type MutationInput
} from './adapter-boundary';
import { AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1 } from './argument-normalizers';
import type { AgenticChatMutationExecutionContextV1 } from './execution-context';
import { AgenticChatMutationAdapterError } from './mutation-executor';
import { reviewedAgenticChatMutationSpecV1 } from './tool-catalog';

export type SharedDocumentTarget = {
	child_project_id: string;
	parent_project_id: string;
	parent_name: string;
	shared_folder_id: string;
	shared_with_count: number;
	document_id: string;
	title: string;
	updated_at: string;
};
const CONFIRMATION_KIND = 'shared_document_edit_v1';
const MAX_CONFIRMATION_AGE_MS = 24 * 60 * 60 * 1000;

/** The immutable turn a confirmation is bound to. The provider holds the same
 * execution input the adapter later receives, so both can run the same check. */
type SharedDocumentTurn = Pick<MutationInput, 'executionInput'>;

/** No broad document lookup: the family RPC authorizes the user before exposing IDs. */
export async function loadSharedDocumentTarget(
	client: SupabaseClient<Database>,
	userId: string,
	projectId: string,
	documentId: string
): Promise<SharedDocumentTarget | null> {
	const actor = await client.from('onto_actors').select('id').eq('user_id', userId).maybeSingle();
	if (actor.error)
		throw knownFailure(
			'shared_document_access_unavailable',
			'Could not verify shared-document access. Nothing was changed.'
		);
	if (!actor.data) return null;
	const { data, error } = await client.rpc('onto_project_family_v1', {
		p_project_id: projectId,
		p_actor_id: actor.data.id
	});
	if (error)
		throw knownFailure(
			'shared_document_access_unavailable',
			'Could not verify shared-document access. Nothing was changed.'
		);
	const family = parseProjectFamilyV1(data);
	const doc = family?.shelf.find((item) => item.id === documentId);
	const parent = family?.parent;
	if (
		!family ||
		family.project_id !== projectId ||
		!parent?.can_write ||
		!parent.shared_folder_document_id ||
		!doc ||
		!doc.updated_at
	)
		return null;
	return {
		child_project_id: projectId,
		parent_project_id: parent.id,
		parent_name: parent.name,
		shared_folder_id: parent.shared_folder_document_id,
		shared_with_count: parent.child_count,
		document_id: doc.id,
		title: doc.title,
		updated_at: doc.updated_at
	};
}

export function sharedDocumentEditArgs(args: Record<string, unknown>) {
	const { confirmation_token: _token, ...edit } = args;
	return edit;
}
function editHash(target: SharedDocumentTarget, args: Record<string, unknown>) {
	return createHash('sha256')
		.update(
			canonicalizeAgenticChatJson({
				target,
				args: sharedDocumentEditArgs(args)
			} as unknown as JsonObject)
		)
		.digest('hex');
}
function assertHumanTurn(input: SharedDocumentTurn) {
	const claim = input.executionInput.claim;
	if (
		!canonicalUuid(claim.turnRunId) ||
		!canonicalUuid(claim.sessionId) ||
		!canonicalUuid(claim.userMessageId)
	)
		throw knownFailure(
			'shared_document_turn_required',
			'Shared-document edits require a user chat turn.'
		);
	return claim;
}

/** The effect executor persists this receipt before it can become a token. */
export function sharedDocumentConfirmation(
	input: MutationInput,
	target: SharedDocumentTarget,
	args: Record<string, unknown>
): JsonObject {
	const claim = assertHumanTurn(input);
	return {
		status: 'confirmation_required',
		requires_user_action: true,
		confirmation_kind: CONFIRMATION_KIND,
		confirmation_token: input.effectId,
		source_user_message_id: claim.userMessageId,
		edit_hash: editHash(target, args),
		shared_document: { ...target },
		message: `Nothing was changed. This edits "${target.title}" in "${target.parent_name}", shared with ${target.shared_with_count} sub-projects. Explain the exact edit and this shared impact, then ask the user to confirm. Only after their explicit confirmation in a later turn, repeat the identical edit with this confirmation_token. Never confirm on the user's behalf. To make a child-only edit, use Copy here in the document window instead.`
	};
}

/** Tokens are server-written ledger receipts, never hashes the model can mint.
 * The gateway's exact-head CAS prevents concurrent or later successful reuse. */
export async function verifySharedDocumentConfirmation(
	client: SupabaseClient<Database>,
	input: SharedDocumentTurn,
	target: SharedDocumentTarget,
	args: Record<string, unknown>
): Promise<void> {
	const claim = assertHumanTurn(input);
	const token = args.confirmation_token;
	if (!canonicalUuid(token))
		throw knownFailure(
			'shared_document_confirmation_invalid',
			'Use the confirmation token returned by the shared-document preview.'
		);
	const { data, error } = await client
		.from('chat_turn_effects')
		.select('turn_run_id,finished_at,downstream_receipt')
		.eq('id', token)
		.eq('user_id', claim.userId)
		.eq('session_id', claim.sessionId)
		.eq('tool_name', 'update_onto_document')
		.eq('operation_name', 'onto.document.update')
		.eq('state', 'succeeded')
		.maybeSingle();
	if (error)
		throw knownFailure(
			'shared_document_confirmation_unavailable',
			'Could not check confirmation. Nothing was changed.'
		);
	const receipt = data?.downstream_receipt;
	const admittedAt = Date.parse(input.executionInput.timingBaseline?.admittedAt ?? '');
	const finishedAt = Date.parse(data?.finished_at ?? '');
	if (
		!data ||
		!isRecord(receipt) ||
		receipt.confirmation_kind !== CONFIRMATION_KIND ||
		receipt.status !== 'confirmation_required' ||
		receipt.confirmation_token !== token ||
		!canonicalUuid(receipt.source_user_message_id) ||
		data.turn_run_id === claim.turnRunId ||
		receipt.source_user_message_id === claim.userMessageId ||
		!Number.isFinite(admittedAt) ||
		!Number.isFinite(finishedAt) ||
		finishedAt >= admittedAt ||
		admittedAt - finishedAt > MAX_CONFIRMATION_AGE_MS ||
		receipt.edit_hash !== editHash(target, args)
	) {
		throw knownFailure(
			'shared_document_confirmation_changed',
			'This confirmation is missing, expired, or no longer matches the edit and shared document. Request a fresh preview without a token, then wait for the user to confirm in a later turn. Nothing was changed.'
		);
	}
}

export function isSharedDocumentConfirmation(value: unknown): value is JsonObject {
	return (
		isRecord(value) &&
		value.confirmation_kind === CONFIRMATION_KIND &&
		value.status === 'confirmation_required'
	);
}

/**
 * Everything a confirmed edit must pass before it may write: edit-only shape,
 * current writable shelf membership, and the bound preview receipt. Reads
 * only. The adapter runs it at dispatch (after the paid review, immediately
 * before the guarded write); the provider runs it before review so a stale
 * token fails cheaply with the identical error.
 */
export async function authorizeConfirmedSharedDocumentEdit(
	client: SupabaseClient<Database>,
	input: SharedDocumentTurn,
	projectId: string | null,
	args: Record<string, unknown>
): Promise<SharedDocumentTarget> {
	if (
		!projectId ||
		isDocumentArchiveState(args.state_key) ||
		args.archive_mode !== undefined ||
		args._archive_review !== undefined
	) {
		throw knownFailure(
			'shared_document_edit_only',
			'Shared confirmation is only for editing a shared document from its child project. Open the parent project to archive it.'
		);
	}
	const target = await loadSharedDocumentTarget(
		client,
		input.executionInput.claim.userId,
		projectId,
		String(args.document_id)
	);
	if (!target)
		throw knownFailure(
			'shared_document_not_accessible',
			'This document is not on the writable shared shelf. Nothing was changed.'
		);
	await verifySharedDocumentConfirmation(client, input, target, args);
	return target;
}

export type SharedDocumentConfirmationFailure = { code: string; message: string };

/** Pre-review check for token-bearing update_onto_document calls. */
export type AgenticChatSharedDocumentConfirmationPort = {
	/**
	 * The known failure dispatch would produce for this call right now, or null
	 * when it would pass or the check could not decide. Null never authorizes
	 * anything: dispatch repeats the full check before the guarded write.
	 */
	check(input: {
		executionInput: MutationInput['executionInput'];
		args: Record<string, unknown>;
	}): Promise<SharedDocumentConfirmationFailure | null>;
};

// Infrastructure hiccups say nothing about the token. Letting the call reach
// review costs one pass; rejecting would push the actor to drop a valid token.
const UNDECIDED_FAILURE_CODES = new Set([
	'shared_document_access_unavailable',
	'shared_document_confirmation_unavailable'
]);

/**
 * Replays the adapter's pre-write steps for the table row (uuid arguments,
 * project fence, argument normalizers) so the edit hash is computed over the
 * same arguments dispatch will hash, then the shared authorization above.
 */
export function createSharedDocumentConfirmationCheckPort(
	client: SupabaseClient<Database>
): AgenticChatSharedDocumentConfirmationPort {
	return {
		async check({ executionInput, args }) {
			const toolName = 'update_onto_document';
			const execution = reviewedAgenticChatMutationSpecV1(toolName)?.execution;
			// Only the row shape this replay mirrors; anything else is left to dispatch.
			if (execution?.executor !== 'table' || execution.scope.mode !== 'context_project')
				return null;
			// The normalizers and the fence read only the immutable execution input.
			const input = { toolName, arguments: args, executionInput } as unknown as MutationInput;
			try {
				for (const argument of execution.requiredUuidArguments ?? []) {
					requiredUuid(args[argument], argument);
				}
				const context: AgenticChatMutationExecutionContextV1 = {
					toolName,
					input,
					args: { ...args },
					projectId: requestProjectId(input),
					expected: {}
				};
				for (const normalizerId of execution.argumentNormalizers ?? []) {
					AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1[normalizerId](context);
				}
				await authorizeConfirmedSharedDocumentEdit(
					client,
					input,
					context.projectId,
					context.args
				);
				return null;
			} catch (error) {
				if (
					error instanceof AgenticChatMutationAdapterError &&
					error.disposition === 'known_failed' &&
					!UNDECIDED_FAILURE_CODES.has(error.failureCode)
				) {
					return { code: error.failureCode, message: error.message };
				}
				return null;
			}
		}
	};
}
