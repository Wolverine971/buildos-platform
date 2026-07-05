// apps/web/src/lib/components/ontology/DocumentVersionHistoryPanel.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DocumentVersionHistoryPanel from './DocumentVersionHistoryPanel.svelte';

function okJson(payload: Record<string, unknown>) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

function versionRow(number: number, overrides: Record<string, unknown> = {}) {
	return {
		id: `version-${number}`,
		number,
		created_by: 'user-1',
		created_by_name: 'DJ Wayne',
		created_at: `2026-05-21T12:0${number}:00.000Z`,
		snapshot_hash: `hash-${number}`,
		window: null,
		change_count: 1,
		change_source: 'api',
		is_merged: false,
		is_restore: false,
		restored_by_user_id: null,
		restore_of_version: null,
		...overrides
	};
}

describe('DocumentVersionHistoryPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/onto/documents/document-1/versions?')) {
				return okJson({
					data: {
						versions: [versionRow(4), versionRow(3)],
						total: 2,
						hasMore: false,
						nextCursor: null
					}
				});
			}

			return Promise.resolve({
				ok: false,
				status: 404,
				json: async () => ({ error: `Unhandled ${url}` })
			} as Response);
		});
	});

	it('opens inline comparison when a version row is clicked', async () => {
		const onCompareRequested = vi.fn();

		render(DocumentVersionHistoryPanel, {
			props: {
				documentId: 'document-1',
				projectId: 'project-1',
				onCompareRequested
			}
		});

		const versionThree = await screen.findByRole('button', { name: /v3/i });
		await fireEvent.click(versionThree);

		await waitFor(() => {
			expect(onCompareRequested).toHaveBeenCalledWith(3, 4);
		});
	});
});
