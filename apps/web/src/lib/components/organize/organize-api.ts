// apps/web/src/lib/components/organize/organize-api.ts
import { z } from 'zod';
import type { OrganizeMove } from './organize-plan';

const count = z.number().int().nonnegative();
export const impactSchema = z.object({
	source_project_id: z.string(),
	destination_project_id: z.string(),
	blockers: z.array(z.string()),
	items: count,
	relationships_to_detach: count,
	assignees_to_remove: count,
	finished_proposals_to_remove: count,
	task_links_to_clear: count,
	events_to_rebuild: count,
	tasks_to_reconcile: count,
	assets_to_move: count,
	comments_to_move: count,
	public_pages_to_move: count,
	relationships_to_move: count
});
const skippedSchema = z.object({ id: z.string(), kind: z.string(), reason: z.string() });
export const previewSchema = z.object({
	confirmation_token: z.string().regex(/^[a-f0-9]{32}$/),
	impact: z.array(impactSchema),
	manifest: z.array(z.object({ id: z.string(), kind: z.string() })),
	skipped: z.array(skippedSchema).default([])
});
export const receiptSchema = z.object({
	status: z.literal('applied'),
	batch_id: z.string(),
	inverse_of: z.string().nullable(),
	operations: count,
	impact: z.array(impactSchema),
	skipped: z.array(skippedSchema).default([]),
	restoration: z.object({ restored: count.optional(), skipped: count.optional() }),
	calendar_sync: z.enum(['queued', 'not_needed']),
	replayed: z.boolean()
});
export const nothingSchema = z.object({
	status: z.literal('nothing_to_undo'),
	skipped: z.array(skippedSchema)
});
export const historySchema = z.object({
	batches: z.array(
		z.object({
			id: z.string(),
			inverse_of: z.string().nullable(),
			created_at: z.string(),
			receipt: receiptSchema
		})
	)
});
export type OrganizeImpact = z.infer<typeof impactSchema>;
export type OrganizePreview = z.infer<typeof previewSchema>;
export type OrganizeReceipt = z.infer<typeof receiptSchema>;
export type OrganizeBatch = z.infer<typeof historySchema>['batches'][number];
export type OrganizeSkipped = z.infer<typeof skippedSchema>;
export type OrganizeRequest = { moves: OrganizeMove[]; project_versions: Record<string, string> };

export class OrganizeApiError extends Error {
	constructor(
		message: string,
		readonly status = 0
	) {
		super(message);
	}
}
export async function organizeFetch<Schema extends z.ZodTypeAny>(
	url: string,
	schema: Schema,
	body?: unknown,
	signal?: AbortSignal
): Promise<z.output<Schema>> {
	const response = await fetch(url, {
		...(body
			? {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				}
			: {}),
		signal
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
		throw new OrganizeApiError(
			message || 'Could not complete the request. Please try again.',
			response.status
		);
	}
	const parsed = schema.safeParse(payload?.data);
	if (!parsed.success)
		throw new OrganizeApiError('The server response could not be read. Please retry.', 502);
	return parsed.data;
}

const blockers: Record<string, string> = {
	pending_document_proposal: 'A document has a pending edit proposal. Resolve it before moving.',
	recurring_task_not_supported: 'Recurring tasks cannot move between projects yet.',
	recurring_event_not_supported: 'A repeating calendar event must stay in its current project.',
	shared_asset_requires_joint_move:
		'An attachment is also used by an item staying behind. Move those items together.',
	calendar_sync_not_deployed:
		'Moving scheduled tasks is not available yet. Leave those tasks out of this plan for now.',
	asset_access_not_deployed:
		'Moving attachments between projects is not available yet. Leave those items out of this plan for now.'
};
export function blockerMessage(code: string) {
	return (
		blockers[code] ??
		'This move is currently unavailable. Refresh the projects and review the plan.'
	);
}
export function receiptMessage(receipt: OrganizeReceipt) {
	return `${receipt.inverse_of ? 'Reversed' : 'Applied'} ${receipt.operations} ${receipt.operations === 1 ? 'move' : 'moves'}${receipt.skipped.length ? ` · ${receipt.skipped.length} skipped` : ''}`;
}
export function impactLines(impact: OrganizeImpact): string[] {
	const lines: string[] = [];
	const add = (n: number, singular: string, plural: string) => {
		if (n) lines.push(`${n} ${n === 1 ? singular : plural}`);
	};
	add(impact.relationships_to_detach, 'relationship unlinked', 'relationships unlinked');
	add(
		impact.task_links_to_clear,
		'task goal, plan or milestone link cleared',
		'task goal, plan or milestone links cleared'
	);
	add(impact.assignees_to_remove, 'assignee removed', 'assignees removed');
	add(
		impact.finished_proposals_to_remove,
		'finished edit proposal removed',
		'finished edit proposals removed'
	);
	add(
		impact.relationships_to_move,
		'relationship moves with the items',
		'relationships move with the items'
	);
	add(impact.comments_to_move, 'comment moves with the items', 'comments move with the items');
	add(
		impact.assets_to_move,
		'attachment moves to the destination',
		'attachments move to the destination'
	);
	add(
		impact.public_pages_to_move,
		'published page keeps its URL',
		'published pages keep their URLs'
	);
	add(impact.tasks_to_reconcile, 'task needs calendar sync', 'tasks need calendar sync');
	add(impact.events_to_rebuild, 'old calendar event replaced', 'old calendar events replaced');
	return lines;
}
