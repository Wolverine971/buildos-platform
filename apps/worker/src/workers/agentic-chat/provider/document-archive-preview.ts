// apps/worker/src/workers/agentic-chat/provider/document-archive-preview.ts
// Archive facts must be available before review and must travel inside its SHA.
import { type JsonObject, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	type DocumentArchiveReviewSnapshot,
	isDocumentArchiveReviewSnapshot,
	isDocumentArchiveState,
	previewGatewayDocumentArchive
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import type { ToolValidationIssue } from '@buildos/agentic-chat-runtime/loop';
import { completedProviderCallToChatToolCall } from './feedback';
import type { CompletedProviderToolCall } from './stream-tool-calls';

export type AgenticChatDocumentArchivePreviewPort = {
	preview(input: {
		userId: string;
		projectId: string | null;
		args: JsonObject;
	}): Promise<
		| { ok: true; snapshot: DocumentArchiveReviewSnapshot }
		| { ok: false; error: { message: string } }
	>;
};

export function createGatewayDocumentArchivePreviewPort(
	client: SupabaseClient
): AgenticChatDocumentArchivePreviewPort {
	return {
		preview: ({ userId, projectId, args }) =>
			previewGatewayDocumentArchive({
				admin: client as never,
				userId,
				args,
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.document.update'],
					...(projectId
						? { project_ids: [projectId], write_project_ids: [projectId] }
						: {})
				}
			})
	};
}

export function isDocumentArchiveCall(call: CompletedProviderToolCall): boolean {
	return call.name === 'update_onto_document' && isDocumentArchiveState(call.arguments.state_key);
}

export async function previewDocumentArchiveCalls(
	port: AgenticChatDocumentArchivePreviewPort | undefined,
	calls: readonly CompletedProviderToolCall[],
	request: { userId: string; projectId: string | null }
): Promise<{ calls: CompletedProviderToolCall[]; issues: ToolValidationIssue[] }> {
	const issues: ToolValidationIssue[] = [];
	const prepared = [...calls];
	const addIssue = (call: CompletedProviderToolCall, message: string) =>
		issues.push({
			toolCall: completedProviderCallToChatToolCall(call),
			toolName: call.name,
			op: 'onto.document.update',
			errors: [`Nothing was archived. ${message}`]
		});
	// Serial bounded previews avoid a fan-out and give deterministic call ordering.
	for (const [index, call] of calls.entries()) {
		if (Object.hasOwn(call.arguments, '_archive_review')) {
			addIssue(call, '_archive_review is reserved for server facts; never supply it.');
			continue;
		}
		if (!isDocumentArchiveCall(call)) continue;
		if (call.arguments.state_key !== 'archived') {
			addIssue(call, 'Use the canonical state_key archived for this archive.');
			continue;
		}
		if (
			!['archive_children', 'promote_children'].includes(String(call.arguments.archive_mode))
		) {
			addIssue(
				call,
				'Choose archive_mode explicitly: archive_children archives descendants; promote_children keeps children active and moves them up a level.'
			);
			continue;
		}
		if (
			Object.keys(call.arguments).some(
				(key) => !['document_id', 'state_key', 'archive_mode'].includes(key)
			)
		) {
			addIssue(call, 'Archive separately from document content, title, or other changes.');
			continue;
		}
		if (!port) {
			addIssue(call, 'The required server archive preview is unavailable.');
			continue;
		}
		const preview = await port.preview({ ...request, args: call.arguments }).catch(() => null);
		if (!preview?.ok || !isDocumentArchiveReviewSnapshot(preview.snapshot)) {
			addIssue(
				call,
				preview && !preview.ok
					? preview.error.message
					: 'The required server archive preview is unavailable.'
			);
			continue;
		}
		const snapshot = preview.snapshot;
		if (
			snapshot.document_id !== call.arguments.document_id ||
			snapshot.archive_mode !== call.arguments.archive_mode ||
			(request.projectId && snapshot.project_id !== request.projectId)
		) {
			addIssue(call, 'The server archive preview did not match this call.');
			continue;
		}
		const affectedIds = new Set(snapshot.documents.map((d) => d.id));
		if (
			prepared.some(
				(other, i) =>
					i < index &&
					isDocumentArchiveCall(other) &&
					isDocumentArchiveReviewSnapshot(other.arguments._archive_review) &&
					other.arguments._archive_review.documents.some((d) => affectedIds.has(d.id))
			)
		) {
			addIssue(
				call,
				'These archive effects overlap an earlier archive in this stage; keep only one call for each affected document.'
			);
			continue;
		}
		const args: JsonObject = { ...call.arguments, _archive_review: snapshot };
		prepared[index] = {
			...call,
			arguments: args,
			canonicalArguments: canonicalizeAgenticChatJson(args),
			// The batch digest includes scheduling sidecars as well as these facts.
			canonicalProviderArguments: canonicalizeAgenticChatJson({
				...JSON.parse(call.canonicalProviderArguments),
				_archive_review: snapshot
			})
		};
	}
	return { calls: prepared, issues };
}
