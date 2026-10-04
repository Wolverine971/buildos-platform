// apps/web/src/lib/components/consolidation/consolidation-types.ts
// What the consolidation API returns; shared by the server service and the run page.
import type {
	ConsolidationPlan,
	ConsolidationQuestion,
	ConsolidationRunStatus,
	MergeDraftView
} from '@buildos/shared-agent-ops/consolidation';

export type ConsolidationRunRow = {
	id: string;
	user_id: string;
	root_project_id: string;
	project_ids: string[];
	request: string | null;
	status: ConsolidationRunStatus;
	progress: Record<string, unknown>;
	plan: ConsolidationPlan | null;
	receipt: ConsolidationReceipt | null;
	cost_usd: number;
	error: string | null;
	created_at: string;
	updated_at: string;
	finished_at: string | null;
};

export type ConsolidationReceipt = {
	applied_at: string;
	organize_batch_id: string | null;
	moved: Array<{
		id: string;
		/** Absent means a document (older receipts). */
		kind?: 'document' | 'task';
		title: string;
		from_project_id: string;
		to_project_id: string;
	}>;
	archived: Array<{
		id: string;
		title: string;
		project_id: string;
		previous_state: string;
		replaced_by_id: string | null;
		/** Where it sat, so Undo can put it back (absent on older receipts). */
		parent_id?: string | null;
		position?: number;
		child_ids?: string[];
	}>;
	/** Merged docs Apply created (absent on receipts without merges). */
	created?: Array<{ id: string; title: string; project_id: string; cluster_key: string }>;
	failures: Array<{ id: string | null; title: string; message: string }>;
	/** Clusters left as they were because their question was never answered. */
	unanswered: string[];
	/** Undo saves progress here; a retry skips what is already done. */
	undo?: {
		undone_at: string;
		moves_undone?: boolean;
		/** Merged docs archived again. */
		removed?: string[];
		restored: string[];
		/** Items Undo left as they are because they changed after Apply, with why. */
		left?: string[];
		failures: string[];
	};
};

export type ConsolidationRunView = {
	run: ConsolidationRunRow;
	questions: ConsolidationQuestion[];
	/** One per group being merged: its fact ledger and draft. `stalled` when the
	 * worker has not touched an unfinished merge for a while, so Retry shows. */
	merges: Array<MergeDraftView & { stalled?: boolean }>;
	/** Docs and tasks Apply would change right now, and groups still waiting on an answer. */
	ready_count: number;
	waiting: string[];
};
