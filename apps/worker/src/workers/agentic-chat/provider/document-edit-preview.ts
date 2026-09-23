// apps/worker/src/workers/agentic-chat/provider/document-edit-preview.ts
//
// Dry-run document body changes before independent review (tasker 98 p05).
// A body-changing update_onto_document call is resolved against the stored
// document first: an edit that cannot apply goes straight back to the acting
// model through the ordinary validation repair (no review round spent), and
// one that can apply reaches the reviewer with its server-verified diff, so the
// reviewer judges the effect instead of re-matching old_text against reads.

import type { AgentCallScope } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { previewGatewayDocumentUpdate } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { hasDocumentEdits } from '@buildos/shared-agent-ops/ontology/document-edits';
import type { MutationBatch, ToolValidationIssue } from '@buildos/agentic-chat-runtime/loop';
import { completedProviderCallToChatToolCall } from './feedback';
import type { CompletedProviderToolCall } from './stream-tool-calls';

export type DocumentEditPreviewV1 = {
	document_id: string;
	title: string | null;
	lines_added: number;
	lines_removed: number;
	/** "+ text" / "- text" lines in document order, bounded. */
	changed_lines: string[];
	changed_lines_truncated: boolean;
};

export type DocumentEditPreviewOutcome =
	| { status: 'previewed'; preview: DocumentEditPreviewV1 | null }
	/** The write would fail this way; the acting model should correct it. */
	| { status: 'rejected'; message: string }
	/** Preview could not run (infrastructure); review and execution proceed as before. */
	| { status: 'unavailable' };

export type AgenticChatDocumentEditPreviewPort = {
	preview(input: {
		userId: string;
		projectId: string | null;
		args: Record<string, unknown>;
	}): Promise<DocumentEditPreviewOutcome>;
};

const PREVIEW_CHANGED_LINES = 60;
const PREVIEW_LINE_CHARS = 300;

function clip(text: string): string {
	return text.length > PREVIEW_LINE_CHARS ? `${text.slice(0, PREVIEW_LINE_CHARS)}…` : text;
}

/** Production port: the same gateway scope the table mutation adapter writes with. */
export function createGatewayDocumentEditPreviewPort(
	client: SupabaseClient
): AgenticChatDocumentEditPreviewPort {
	return {
		async preview({ userId, projectId, args }) {
			const scope: AgentCallScope = {
				mode: 'read_write',
				allowed_ops: ['onto.document.update'],
				...(projectId ? { project_ids: [projectId], write_project_ids: [projectId] } : {})
			};
			let result: Awaited<ReturnType<typeof previewGatewayDocumentUpdate>>;
			try {
				result = await previewGatewayDocumentUpdate({
					admin: client as never,
					userId,
					scope,
					args
				});
			} catch {
				return { status: 'unavailable' };
			}
			if (!result.ok) {
				return result.error.code === 'VALIDATION_ERROR' || result.error.code === 'NOT_FOUND'
					? { status: 'rejected', message: result.error.message }
					: { status: 'unavailable' };
			}
			const change = result.data.document_change;
			if (!change) return { status: 'previewed', preview: null };
			const changedLines: string[] = [];
			let truncated = change.hunks_truncated;
			for (const hunk of change.hunks) {
				for (const line of hunk.lines) {
					if (line.kind === 'context') continue;
					if (changedLines.length >= PREVIEW_CHANGED_LINES) {
						truncated = true;
						break;
					}
					changedLines.push(`${line.kind === 'add' ? '+' : '-'} ${clip(line.text)}`);
				}
			}
			return {
				status: 'previewed',
				preview: {
					document_id: result.data.document_id,
					title: result.data.title,
					lines_added: change.lines_added,
					lines_removed: change.lines_removed,
					changed_lines: changedLines,
					changed_lines_truncated: truncated
				}
			};
		}
	};
}

function domainArguments(call: CompletedProviderToolCall): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(call.canonicalArguments) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** Only body-changing updates have something to verify before review. */
function changesDocumentBody(args: Record<string, unknown>): boolean {
	return (
		hasDocumentEdits(args) ||
		typeof args.content === 'string' ||
		typeof args.body_markdown === 'string'
	);
}

/**
 * Preview every body-changing update_onto_document call. Returns validation
 * issues for calls whose write would fail, and the verified previews by call id.
 */
export async function previewDocumentEditCalls(
	port: AgenticChatDocumentEditPreviewPort,
	calls: readonly CompletedProviderToolCall[],
	request: { userId: string; projectId: string | null }
): Promise<{
	issues: ToolValidationIssue[];
	previews: Map<string, DocumentEditPreviewV1>;
}> {
	const issues: ToolValidationIssue[] = [];
	const previews = new Map<string, DocumentEditPreviewV1>();
	const targets = calls.flatMap((call) => {
		if (call.name !== 'update_onto_document') return [];
		const args = domainArguments(call);
		return args && changesDocumentBody(args) ? [{ call, args }] : [];
	});
	const outcomes = await Promise.all(
		targets.map(({ args }) =>
			port
				.preview({ userId: request.userId, projectId: request.projectId, args })
				.catch((): DocumentEditPreviewOutcome => ({ status: 'unavailable' }))
		)
	);
	targets.forEach(({ call }, index) => {
		const outcome = outcomes[index]!;
		if (outcome.status === 'rejected') {
			issues.push({
				toolCall: completedProviderCallToChatToolCall(call),
				toolName: call.name,
				op: 'onto.document.update',
				errors: [
					`Checked against the stored document before review; nothing was written. ${outcome.message}`
				]
			});
		} else if (outcome.status === 'previewed' && outcome.preview) {
			previews.set(call.id, outcome.preview);
		}
	});
	return { issues, previews };
}

/** Reviewer-facing rendering of the previews that belong to a held batch. */
export function formatDocumentEditPreviewsForReview(
	batch: MutationBatch,
	previews: ReadonlyMap<string, DocumentEditPreviewV1>
): string | null {
	const entries = batch.calls.flatMap((call, index) => {
		const preview = previews.get(call.id);
		return preview ? [{ call: index + 1, ...preview }] : [];
	});
	if (entries.length === 0) return null;
	return `Server preview of the held document changes (dry run against the stored document: every old_text and section resolved, nothing else in the document changes; this is the exact effect if approved): ${JSON.stringify(entries)}`;
}
