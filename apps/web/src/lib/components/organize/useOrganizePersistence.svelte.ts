// apps/web/src/lib/components/organize/useOrganizePersistence.svelte.ts
import { z } from 'zod';
import {
	OrganizeApiError,
	organizeFetch,
	previewSchema,
	receiptSchema,
	nothingSchema,
	historySchema,
	type OrganizePreview,
	type OrganizeReceipt,
	type OrganizeBatch,
	type OrganizeRequest,
	type OrganizeSkipped
} from './organize-api';

type Review = {
	preview: OrganizePreview;
	batchId: string;
	request: OrganizeRequest | { source_batch_id: string };
	mode: 'apply' | 'undo';
};

/** Own the exact reviewed request until a write has a definite outcome. A lost
 * response is retried with the same token and batch ID, never as a new move. */
export function createOrganizePersistence(options: {
	getProjectId: () => string;
	onapplied: (receipt: OrganizeReceipt) => Promise<void>;
}) {
	let review = $state.raw<Review | null>(null);
	let busy = $state(false);
	let uncertain = $state(false);
	let stale = $state(false);
	let error = $state('');
	let notice = $state('');
	let skipped = $state.raw<OrganizeSkipped[]>([]);
	let lastReceipt = $state.raw<OrganizeReceipt | null>(null);
	let history = $state.raw<OrganizeBatch[]>([]);
	let historyOpen = $state(false);
	let historyLoading = $state(false);
	let historyError = $state('');
	let disposed = false;
	let historyController: AbortController | null = null;

	async function prepare(request: Review['request'], mode: Review['mode']) {
		if (busy || uncertain || disposed) return;
		busy = true;
		error = '';
		notice = '';
		skipped = [];
		stale = false;
		review = null;
		try {
			const result = await organizeFetch(
				`/api/onto/organize/${mode === 'undo' ? 'undo' : 'preview'}`,
				z.union([previewSchema, nothingSchema]),
				request
			);
			if (disposed) return;
			if ('status' in result) {
				notice = 'Nothing can be undone. The items have changed since this batch.';
				skipped = result.skipped;
				return;
			}
			review = { preview: result, request, mode, batchId: crypto.randomUUID() };
			historyOpen = false;
		} catch (cause) {
			if (!disposed) {
				error = cause instanceof Error ? cause.message : 'Could not review these moves.';
				stale = cause instanceof OrganizeApiError && cause.status === 409;
			}
		} finally {
			if (!disposed) busy = false;
		}
	}
	async function confirm() {
		const current = review;
		if (
			!current ||
			busy ||
			stale ||
			disposed ||
			current.preview.impact.some((i) => i.blockers.length)
		)
			return;
		busy = true;
		error = '';
		let receipt: OrganizeReceipt;
		try {
			const result = await organizeFetch(
				`/api/onto/organize/${current.mode}`,
				z.union([receiptSchema, nothingSchema]),
				{
					...current.request,
					batch_id: current.batchId,
					confirmation_token: current.preview.confirmation_token
				}
			);
			if (disposed) return;
			uncertain = false;
			if (result.status === 'nothing_to_undo') {
				review = null;
				skipped = result.skipped;
				notice = 'Nothing can be undone. The items have changed since this batch.';
				return;
			}
			receipt = result;
		} catch (cause) {
			if (!disposed) {
				// 4xx is a rejected request; network/5xx may have committed already.
				uncertain = !(
					cause instanceof OrganizeApiError &&
					cause.status >= 400 &&
					cause.status < 500
				);
				stale = !uncertain;
				error = uncertain
					? 'The save could not be confirmed. Retry the same request to check its result safely.'
					: cause instanceof Error
						? cause.message
						: 'The move was rejected. Review again.';
			}
			return;
		} finally {
			if (!disposed) busy = false;
		}
		// Post-save refresh failures must never masquerade as a failed write.
		lastReceipt = receipt;
		review = null;
		skipped = receipt.skipped;
		history = [
			{
				id: receipt.batch_id,
				inverse_of: receipt.inverse_of,
				receipt,
				created_at: new Date().toISOString()
			},
			...history.filter((b) => b.id !== receipt.batch_id)
		];
		await options.onapplied(receipt);
	}
	async function openHistory() {
		if (busy || uncertain || disposed) return;
		historyOpen = true;
		historyLoading = true;
		historyError = '';
		historyController?.abort();
		const controller = new AbortController();
		historyController = controller;
		try {
			const result = await organizeFetch(
				`/api/onto/organize/history?project_id=${encodeURIComponent(options.getProjectId())}`,
				historySchema,
				undefined,
				controller.signal
			);
			if (!disposed && !controller.signal.aborted) history = result.batches;
		} catch (cause) {
			if (!disposed && !controller.signal.aborted)
				historyError = cause instanceof Error ? cause.message : 'Could not load history.';
		} finally {
			if (!disposed && !controller.signal.aborted) historyLoading = false;
		}
	}
	return {
		get review() {
			return review;
		},
		get busy() {
			return busy;
		},
		get uncertain() {
			return uncertain;
		},
		get stale() {
			return stale;
		},
		get error() {
			return error;
		},
		get notice() {
			return notice;
		},
		get skipped() {
			return skipped;
		},
		get lastReceipt() {
			return lastReceipt;
		},
		get history() {
			return history;
		},
		get historyOpen() {
			return historyOpen;
		},
		get historyLoading() {
			return historyLoading;
		},
		get historyError() {
			return historyError;
		},
		prepare,
		confirm,
		openHistory,
		closeHistory() {
			historyOpen = false;
			historyController?.abort();
			historyLoading = false;
		},
		closeReview() {
			if (!busy && !uncertain) {
				review = null;
				error = '';
				stale = false;
			}
		},
		clearError() {
			error = '';
			stale = false;
			notice = '';
			skipped = [];
		},
		destroy() {
			disposed = true;
			historyController?.abort();
		}
	};
}
