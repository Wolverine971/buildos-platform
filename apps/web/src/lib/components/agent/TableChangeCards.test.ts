// apps/web/src/lib/components/agent/TableChangeCards.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { toastService } from '$lib/stores/toast.store';
import TableChangeCards from './TableChangeCards.svelte';
import { buildTableChangeCards, type TableChangeReceipt } from './table-change-cards';

function card() {
	const receipt: TableChangeReceipt = {
		kind: 'table_change',
		document_id: 'table-1',
		project_id: 'project-1',
		title: 'Job applications',
		revision: 4,
		applied_revision: 5,
		rows_added: 3,
		rows_updated: 0,
		rows_deleted: 0,
		cells_changed: 7,
		columns_changed: [],
		sample: [
			{ row: 'r12', column: 'Hiring manager', before: '', after: 'Ana Ruiz' },
			{ row: 'r4', column: 'Status', before: 'Applied', after: 'Interview' }
		],
		inverse_ops: [] as TableChangeReceipt['inverse_ops']
	};
	return buildTableChangeCards([receipt])[0]!;
}

function respond(status: number, body: unknown) {
	return vi.fn(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
	);
}

describe('TableChangeCards', () => {
	beforeEach(() => toastService.clear());
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		toastService.clear();
	});

	it('shows the title, the change line, an Open link, and expands sample diffs', async () => {
		render(TableChangeCards, { changes: [card()] });
		expect(screen.getByText('Job applications')).toBeInTheDocument();
		expect(screen.getByText(/\+3 rows · 7 cells/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Open table/ })).toHaveAttribute(
			'href',
			'/projects/project-1?doc=table-1'
		);
		const toggle = screen.getByRole('button', { name: /Job applications/, expanded: false });
		await fireEvent.click(toggle);
		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
		expect(screen.getByText('Applied')).toBeInTheDocument();
		expect(screen.getByText('Interview')).toBeInTheDocument();
		expect(screen.getByText('Showing 2 of 7 changed cells.')).toBeInTheDocument();
	});

	it('undoes through the revert endpoint and marks the card undone', async () => {
		const fetchMock = respond(200, { success: true, data: {} });
		vi.stubGlobal('fetch', fetchMock);
		const onUndone = vi.fn();
		render(TableChangeCards, { changes: [card()], onUndone });
		await fireEvent.click(screen.getByRole('button', { name: /Undo the changes/ }));
		await waitFor(() => expect(onUndone).toHaveBeenCalledWith(expect.any(Object), true));
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/onto/tables/table-1/revert-change',
			expect.objectContaining({ method: 'POST' })
		);
		expect(screen.getAllByText('Undone').length).toBeGreaterThan(0);
		expect(screen.queryByRole('button', { name: /Undo the changes/ })).toBeNull();
	});

	it('explains a conflict and hides Undo', async () => {
		vi.stubGlobal('fetch', respond(409, { success: false, code: 'TABLE_CONFLICT' }));
		const onUndone = vi.fn();
		render(TableChangeCards, { changes: [card()], onUndone });
		await fireEvent.click(screen.getByRole('button', { name: /Undo the changes/ }));
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('changed since'));
		expect(onUndone).not.toHaveBeenCalled();
		expect(screen.queryByRole('button', { name: /Undo the changes/ })).toBeNull();
	});
});
