// apps/worker/src/workers/agentic-chat/mutations/shared-document-edit.ts
//
// The ordinary gateway stays project-fenced. When a child project's chat edits
// a document from its parent's "Shared with sub-projects" folder, nothing is
// written: the call returns a confirm card instead. The card's receipt holds
// the exact normalized edit, the previewed document version and the ids in this
// effect's service-only ledger row. Only the user's click on the card (web:
// POST /api/chat/shared-document-edits/[id]) can apply, copy, or cancel it, so
// the model has no way to confirm a shared edit itself.
import {
	type previewGatewayDocumentUpdate,
	type GatewayDocumentUpdatePreviewResult
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	SHARED_DOCUMENT_EDIT_CARD_KIND,
	SHARED_DOCUMENT_EDIT_CARD_VERSION,
	SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND,
	isSharedDocumentEditPreview,
	sharedDocumentEditCardExpiresAt,
	type SharedDocumentEditClientActionV1,
	type SharedDocumentEditFieldChangeV1
} from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import { parseProjectFamilyV1, type Database, type JsonObject } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	canonicalMutationReceipt,
	canonicalUuid,
	knownFailure,
	throwGatewayResultFailure,
	type MutationInput
} from './adapter-boundary';

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

/** A card receipt (or a retired v1 token preview): it saved nothing. */
export function isSharedDocumentEditCard(value: unknown): value is JsonObject {
	return isSharedDocumentEditPreview(value);
}

type DocumentPreview = Extract<GatewayDocumentUpdatePreviewResult, { ok: true }>['data'];
const PRECOMMIT_PREVIEW_CODES = new Set(['VALIDATION_ERROR', 'NOT_FOUND', 'FORBIDDEN']);
export type SharedDocumentPreviewRunner = typeof previewGatewayDocumentUpdate;

function fieldChanges(
	target: SharedDocumentTarget,
	preview: DocumentPreview,
	args: Record<string, unknown>
): SharedDocumentEditFieldChangeV1[] {
	const changes: SharedDocumentEditFieldChangeV1[] = [];
	const value = (raw: unknown) => (typeof raw === 'string' ? raw : null);
	if (args.title !== undefined)
		changes.push({ field: 'title', from: preview.title ?? target.title, to: value(args.title) });
	if (args.description !== undefined)
		changes.push({
			field: 'description',
			from: preview.base.description,
			to: value(args.description)
		});
	if (args.state_key !== undefined)
		changes.push({ field: 'state', from: preview.base.state_key, to: value(args.state_key) });
	if (args.type_key !== undefined)
		changes.push({ field: 'type', from: preview.base.type_key, to: value(args.type_key) });
	if (args.props !== undefined) changes.push({ field: 'metadata', from: null, to: null });
	return changes;
}

function assertHumanTurn(input: MutationInput) {
	const claim = input.executionInput.claim;
	if (
		!canonicalUuid(claim.turnRunId) ||
		!canonicalUuid(claim.sessionId) ||
		!canonicalUuid(claim.userMessageId) ||
		!canonicalUuid(input.effectId)
	)
		throw knownFailure(
			'shared_document_turn_required',
			'Shared-document edits require a user chat turn.'
		);
	return claim;
}

/**
 * Dry-run the edit against the parent's stored copy (read-only, the parent is
 * the only widened scope) and return the confirm card. The effect executor
 * persists this receipt; its effect id is the card id the browser sends back.
 */
export async function sharedDocumentEditCard(params: {
	client: SupabaseClient<Database>;
	input: MutationInput;
	target: SharedDocumentTarget;
	args: Record<string, unknown>;
	preview: SharedDocumentPreviewRunner;
	now?: Date;
}): Promise<JsonObject> {
	const { input, target, args } = params;
	const claim = assertHumanTurn(input);
	let result: GatewayDocumentUpdatePreviewResult;
	try {
		result = await params.preview({
			admin: params.client,
			userId: claim.userId,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.update'],
				project_ids: [target.parent_project_id],
				write_project_ids: [target.parent_project_id]
			},
			args
		});
	} catch {
		throw knownFailure(
			'shared_document_preview_unavailable',
			'Could not preview the change to the shared document. Nothing was changed.'
		);
	}
	if (!result.ok) {
		// An edit that cannot apply goes back to the model to fix, like any edit.
		if (PRECOMMIT_PREVIEW_CODES.has(result.error.code))
			throwGatewayResultFailure(input.toolName, result.error);
		// A dry run writes nothing, so no other failure can leave an uncertain outcome.
		throw knownFailure(
			'shared_document_preview_unavailable',
			'Could not preview the change to the shared document. Nothing was changed.'
		);
	}
	const preview = result.data;
	const version = preview.base.updated_at;
	if (!version)
		throw knownFailure(
			'shared_document_preview_unavailable',
			'Could not preview the change to the shared document. Nothing was changed.'
		);
	const change = preview.document_change
		? {
				lines_added: preview.document_change.lines_added,
				lines_removed: preview.document_change.lines_removed,
				hunks: preview.document_change.hunks,
				hunks_truncated: preview.document_change.hunks_truncated
			}
		: null;
	const title = preview.title ?? target.title;
	const cardId = input.effectId;
	const clientAction: SharedDocumentEditClientActionV1 = {
		kind: SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND,
		action_id: cardId,
		card_id: cardId,
		session_id: claim.sessionId!,
		document_id: target.document_id,
		document_title: title,
		parent_project_id: target.parent_project_id,
		parent_name: target.parent_name,
		child_project_id: target.child_project_id,
		shared_with_count: target.shared_with_count,
		change,
		field_changes: fieldChanges(target, preview, args),
		expires_at: sharedDocumentEditCardExpiresAt(params.now ?? new Date())
	};
	return canonicalMutationReceipt(
		{
			status: 'confirmation_required',
			requires_user_action: true,
			confirmation_kind: SHARED_DOCUMENT_EDIT_CARD_KIND,
			card_version: SHARED_DOCUMENT_EDIT_CARD_VERSION,
			card_id: cardId,
			source_user_message_id: claim.userMessageId,
			pending_edit: {
				document_id: target.document_id,
				child_project_id: target.child_project_id,
				parent_project_id: target.parent_project_id,
				shared_folder_id: target.shared_folder_id,
				shared_with_count: target.shared_with_count,
				document_version: version,
				arguments: { ...args }
			},
			client_action: clientAction,
			message: `Nothing has changed yet. "${title}" belongs to ${target.parent_name} and is shared with ${target.shared_with_count} sub-projects. The user now sees a card under your reply with this exact change and three choices: Update shared doc (edits the copy every sub-project sees), Copy here (this project gets its own copy with the change), or Cancel. In one or two sentences, say what you would change and ask them to choose in the card. Do not say it is done, do not ask them to type yes, and do not repeat this edit. Their choice reaches you with their next message.`
		},
		input.toolName
	);
}
