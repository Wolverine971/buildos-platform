// apps/web/src/lib/components/projects/desktop/desktop-moves.ts
//
// The calls behind the Projects desktop. An open card is one request (the
// Organize snapshot plus goals). Nesting uses the parent endpoint. Docs and
// tasks move through Organize: plan against both snapshots, preview for a
// confirmation token, apply with a fresh batch ID, undo by that batch.
import { z } from 'zod';
import {
	OrganizeApiError,
	blockerMessage,
	impactLines,
	nothingSchema,
	organizeFetch,
	previewSchema,
	receiptSchema,
	type OrganizePreview,
	type OrganizeReceipt
} from '$lib/components/organize/organize-api';
import {
	previewOrganizePlan,
	visibleDocumentTree,
	type OrganizeMove,
	type OrganizeProject
} from '$lib/components/organize/organize-plan';

const goalSchema = z.object({
	id: z.string(),
	name: z.string(),
	state_key: z.string(),
	target_date: z.string().nullable()
});
const cardSchema = z.object({
	project: z.custom<OrganizeProject>(
		(value) =>
			!!value &&
			typeof value === 'object' &&
			typeof (value as OrganizeProject).id === 'string' &&
			Array.isArray((value as OrganizeProject).documents) &&
			Array.isArray((value as OrganizeProject).tasks)
	),
	goals: z.array(goalSchema)
});

export type DesktopGoal = z.infer<typeof goalSchema>;
export type DesktopCard = z.infer<typeof cardSchema>;

/** One in-flight or settled request per project; a failure is never cached. */
export function createCardCache(load: (projectId: string) => Promise<DesktopCard> = fetchCard) {
	const cards = new Map<string, Promise<DesktopCard>>();
	function get(projectId: string): Promise<DesktopCard> {
		let pending = cards.get(projectId);
		if (!pending) {
			pending = load(projectId);
			cards.set(projectId, pending);
			pending.catch(() => {
				if (cards.get(projectId) === pending) cards.delete(projectId);
			});
		}
		return pending;
	}
	return {
		get,
		/** Start loading without waiting (hover intent, drag over a target). */
		prefetch(projectId: string) {
			get(projectId).catch(() => undefined);
		},
		invalidate(...projectIds: string[]) {
			for (const id of projectIds) cards.delete(id);
		}
	};
}
export type CardCache = ReturnType<typeof createCardCache>;

export function fetchCard(projectId: string): Promise<DesktopCard> {
	return organizeFetch(`/api/onto/projects/${encodeURIComponent(projectId)}/card`, cardSchema);
}

/** Dated tasks carry calendar events; the server refuses moving them until
 * calendar sync ships (`calendar_sync_not_deployed`). The lock shows up front. */
export const SCHEDULED_TASK_MOVES_ENABLED = false;

export function isDatedTask(task: { start_at: string | null; due_at: string | null }): boolean {
	return Boolean(task.start_at || task.due_at);
}

export type ContentItem = { kind: 'document' | 'task'; id: string; projectId: string };

export type PreparedMove = {
	request: { moves: OrganizeMove[]; project_versions: Record<string, string> };
	preview: OrganizePreview;
	batchId: string;
	/** Why the server refuses, in plain words; Move stays disabled when present. */
	blockers: string[];
	/** Side effects worth a line in the confirm ("1 relationship unlinked"). */
	effects: string[];
	/** Docs nested under a moved doc. */
	nestedCount: number;
};

/** Plan locally (throws a plain-language reason), then ask the server for the preview. */
export async function prepareContentMove(
	item: ContentItem,
	source: OrganizeProject,
	destination: OrganizeProject,
	signal?: AbortSignal
): Promise<PreparedMove> {
	const move: OrganizeMove =
		item.kind === 'document'
			? {
					kind: 'document',
					id: item.id,
					project_id: source.id,
					destination_project_id: destination.id,
					parent_id: null,
					position: visibleDocumentTree(destination).length
				}
			: {
					kind: 'task',
					id: item.id,
					project_id: source.id,
					destination_project_id: destination.id,
					parent_id: null,
					position: 0
				};
	const plan = previewOrganizePlan([source, destination], [move]);
	const request = {
		moves: [move],
		project_versions: {
			[source.id]: String(source.structure.version),
			[destination.id]: String(destination.structure.version)
		}
	};
	const preview = await organizeFetch(
		'/api/onto/organize/preview',
		previewSchema,
		request,
		signal
	);
	return {
		request,
		preview,
		batchId: crypto.randomUUID(),
		blockers: [...new Set(preview.impact.flatMap((impact) => impact.blockers))].map(
			blockerMessage
		),
		effects: preview.impact.flatMap(impactLines),
		nestedCount: plan.changes[0]?.child_count ?? 0
	};
}

/** A 4xx is a rejected request. Anything else may have committed, so the same
 * batch ID and token are replayed once; the server answers a replay with the
 * original receipt instead of moving twice. */
async function writeOnce<T>(write: () => Promise<T>): Promise<T> {
	try {
		return await write();
	} catch (cause) {
		if (cause instanceof OrganizeApiError && cause.status >= 400 && cause.status < 500)
			throw cause;
		return write();
	}
}

export function applyContentMove(prepared: PreparedMove): Promise<OrganizeReceipt> {
	const body = {
		...prepared.request,
		batch_id: prepared.batchId,
		confirmation_token: prepared.preview.confirmation_token
	};
	return writeOnce(() => organizeFetch('/api/onto/organize/apply', receiptSchema, body));
}

/** `nothing` when the items changed since the move and there is nothing safe to reverse. */
export async function undoContentMove(sourceBatchId: string): Promise<'undone' | 'nothing'> {
	const review = await organizeFetch(
		'/api/onto/organize/undo',
		z.union([previewSchema, nothingSchema]),
		{ source_batch_id: sourceBatchId }
	);
	if ('status' in review) return 'nothing';
	if (review.impact.some((impact) => impact.blockers.length > 0)) return 'nothing';
	const body = {
		source_batch_id: sourceBatchId,
		batch_id: crypto.randomUUID(),
		confirmation_token: review.confirmation_token
	};
	const result = await writeOnce(() =>
		organizeFetch('/api/onto/organize/undo', z.union([receiptSchema, nothingSchema]), body)
	);
	return result.status === 'applied' ? 'undone' : 'nothing';
}
