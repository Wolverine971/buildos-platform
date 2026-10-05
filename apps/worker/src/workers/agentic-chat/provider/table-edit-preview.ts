// apps/worker/src/workers/agentic-chat/provider/table-edit-preview.ts
//
// Dry-run table row batches before independent review (BuildOS Tables,
// 2026-10-04; mirror of document-edit-preview.ts). Every update_onto_table_rows
// call is resolved against the stored table first through the shared gateway's
// previewGatewayTableRowsUpdate (same validation, scope, and access checks as
// the write): a batch naming a row handle or column that does not exist goes
// straight back to the acting model through the ordinary validation repair (no
// review round spent), and one that can apply reaches the reviewer as
// server-verified counts plus sample cell diffs, so the reviewer judges the
// effect instead of re-reading 200 raw rows.

import type { AgentCallScope } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { previewGatewayTableRowsUpdate } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import type { MutationBatch, ToolValidationIssue } from '@buildos/agentic-chat-runtime/loop';
import { completedProviderCallToChatToolCall } from './feedback';
import type { CompletedProviderToolCall } from './stream-tool-calls';

export type TableEditPreviewSampleV1 = {
	row: string;
	column: string;
	before: string;
	after: string;
};

export type TableEditPreviewV1 = {
	table_id: string;
	title: string | null;
	rows_added: number;
	rows_updated: number;
	rows_deleted: number;
	cells_changed: number;
	/** Up to 8 cell diffs, each value clipped. */
	sample: TableEditPreviewSampleV1[];
};

export type TableEditPreviewOutcome =
	| { status: 'previewed'; preview: TableEditPreviewV1 }
	/** The write would fail this way; the acting model should correct it. */
	| { status: 'rejected'; message: string }
	/** Preview could not run (infrastructure); review and execution proceed as before. */
	| { status: 'unavailable' };

export type AgenticChatTableEditPreviewPort = {
	preview(input: {
		userId: string;
		projectId: string | null;
		args: Record<string, unknown>;
	}): Promise<TableEditPreviewOutcome>;
};

const PREVIEW_SAMPLE_LIMIT = 8;
const PREVIEW_VALUE_CHARS = 160;
const PREVIEW_ERROR_LIMIT = 6;
const REREAD_HINT =
	'Read the table again (get_onto_table_details or read_table_rows) for the current row handles and column names.';

function clip(value: unknown): string {
	const text = String(value ?? '');
	return text.length > PREVIEW_VALUE_CHARS ? `${text.slice(0, PREVIEW_VALUE_CHARS)}…` : text;
}

function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reduce the gateway's preview data (previewTableRowsUpdate: `{ table_id,
 * title, preview: { rows_added, rows_updated, rows_deleted, cells_changed,
 * sample } }`) to the reviewer-facing shape. Resolution errors normally arrive
 * as a VALIDATION_ERROR instead; an `errors` list here is handled the same way.
 */
export function toTableEditPreviewOutcome(data: unknown, tableId: string): TableEditPreviewOutcome {
	if (!isRecord(data)) return { status: 'unavailable' };
	const counts = isRecord(data.preview) ? data.preview : data;
	const rawErrors = Array.isArray(counts.errors) ? counts.errors : data.errors;
	const errors = Array.isArray(rawErrors)
		? rawErrors.filter((error): error is string => typeof error === 'string' && !!error)
		: [];
	if (errors.length > 0) {
		const shown = errors.slice(0, PREVIEW_ERROR_LIMIT);
		const more = errors.length - shown.length;
		return {
			status: 'rejected',
			message: `${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}. ${REREAD_HINT}`
		};
	}
	const sample = (Array.isArray(counts.sample) ? counts.sample : [])
		.filter(isRecord)
		.slice(0, PREVIEW_SAMPLE_LIMIT)
		.map((entry) => ({
			row: clip(entry.row),
			column: clip(entry.column),
			before: clip(entry.before),
			after: clip(entry.after)
		}));
	return {
		status: 'previewed',
		preview: {
			table_id: typeof data.table_id === 'string' ? data.table_id : tableId,
			title: typeof data.title === 'string' ? data.title : null,
			rows_added: count(counts.rows_added),
			rows_updated: count(counts.rows_updated),
			rows_deleted: count(counts.rows_deleted),
			cells_changed: count(counts.cells_changed),
			sample
		}
	};
}

/** Production port: the same gateway scope the table mutation adapter writes with. */
export function createGatewayTableEditPreviewPort(
	client: SupabaseClient
): AgenticChatTableEditPreviewPort {
	return {
		async preview({ userId, projectId, args }) {
			const scope: AgentCallScope = {
				mode: 'read_write',
				allowed_ops: ['onto.table.rows.update'],
				...(projectId ? { project_ids: [projectId], write_project_ids: [projectId] } : {})
			};
			let result: Awaited<ReturnType<typeof previewGatewayTableRowsUpdate>>;
			try {
				result = await previewGatewayTableRowsUpdate({
					admin: client,
					userId,
					scope,
					args
				});
			} catch {
				return { status: 'unavailable' };
			}
			if (!result.ok) {
				// A bad handle, column, or value (VALIDATION_ERROR lists each) or a
				// table the actor cannot see: the acting model fixes the call.
				return result.error.code === 'VALIDATION_ERROR' || result.error.code === 'NOT_FOUND'
					? { status: 'rejected', message: `${result.error.message} ${REREAD_HINT}` }
					: { status: 'unavailable' };
			}
			return toTableEditPreviewOutcome(
				result.data,
				typeof args.table_id === 'string' ? args.table_id : ''
			);
		}
	};
}

function domainArguments(call: CompletedProviderToolCall): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(call.canonicalArguments) as unknown;
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Preview every update_onto_table_rows call. Returns validation issues for
 * calls whose write would fail, and the verified previews by call id.
 *
 * Only the first call on a table is previewed against the stored rows: a later
 * call in the same batch may address rows the first one adds, which the stored
 * table cannot show, so it is left unpreviewed (review still sees its raw call).
 * Tables are independent and preview in parallel.
 */
export async function previewTableEditCalls(
	port: AgenticChatTableEditPreviewPort,
	calls: readonly CompletedProviderToolCall[],
	request: { userId: string; projectId: string | null }
): Promise<{
	issues: ToolValidationIssue[];
	previews: Map<string, TableEditPreviewV1>;
}> {
	const issues: ToolValidationIssue[] = [];
	const previews = new Map<string, TableEditPreviewV1>();
	const firstByTable = new Map<
		string,
		{ call: CompletedProviderToolCall; args: Record<string, unknown> }
	>();
	for (const call of calls) {
		if (call.name !== 'update_onto_table_rows') continue;
		const args = domainArguments(call);
		if (!args) continue;
		const key = typeof args.table_id === 'string' ? args.table_id : `call:${call.id}`;
		if (!firstByTable.has(key)) firstByTable.set(key, { call, args });
	}

	await Promise.all(
		[...firstByTable.values()].map(async ({ call, args }) => {
			const outcome = await port
				.preview({ userId: request.userId, projectId: request.projectId, args })
				.catch((): TableEditPreviewOutcome => ({ status: 'unavailable' }));
			if (outcome.status === 'rejected') {
				issues.push({
					toolCall: completedProviderCallToChatToolCall(call),
					toolName: call.name,
					op: 'onto.table.rows.update',
					errors: [
						`Checked against the stored table before review; nothing was written. ${outcome.message}`
					]
				});
			} else if (outcome.status === 'previewed') {
				previews.set(call.id, outcome.preview);
			}
		})
	);
	return { issues, previews };
}

/** Reviewer-facing rendering of the previews that belong to a held batch. */
export function formatTableEditPreviewsForReview(
	batch: MutationBatch,
	previews: ReadonlyMap<string, TableEditPreviewV1>
): string | null {
	const entries = batch.calls.flatMap((call, index) => {
		const preview = previews.get(call.id);
		return preview ? [{ call: index + 1, ...preview }] : [];
	});
	if (entries.length === 0) return null;
	return `Server preview of the held table changes (dry run against the stored table: every row handle and column resolved; counts are exact and the samples are real cell diffs, before → after): ${JSON.stringify(entries)}`;
}
