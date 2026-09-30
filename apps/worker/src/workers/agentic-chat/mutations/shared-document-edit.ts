// apps/worker/src/workers/agentic-chat/mutations/shared-document-edit.ts
// The ordinary gateway stays project-fenced. This exception is only for one
// live document on the focused child's shared shelf, after a later user turn.
import { createHash } from 'node:crypto';
import {
	canonicalizeAgenticChatJson,
	parseProjectFamilyV1,
	type Database,
	type JsonObject
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalUuid, isRecord, knownFailure, type MutationInput } from './adapter-boundary';

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
function assertHumanTurn(input: MutationInput) {
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
	input: MutationInput,
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
