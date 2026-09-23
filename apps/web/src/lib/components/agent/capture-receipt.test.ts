// apps/web/src/lib/components/agent/capture-receipt.test.ts
import { describe, expect, it } from 'vitest';
import type { UIMessage } from './agent-chat.types';
import {
	buildCaptureReceiptUIMessage,
	readCaptureReceipt,
	upsertCaptureReceipt
} from './capture-receipt';

const row = {
	id: 'c1',
	session_id: 's1',
	project_id: 'p1',
	status: 'captured',
	created_at: '2026-09-22T20:00:30.000Z',
	applied_sections: ['Decisions'],
	review_sections: ['Open questions'],
	review_run_id: 'r1',
	thinking_log_document_id: 'log1',
	start_here_document_id: 'sh1'
};

function message(id: string, at: string): UIMessage {
	return { id, type: 'assistant', content: id, timestamp: new Date(at) };
}

describe('capture receipts', () => {
	it('shows only captures that saved or staged something', () => {
		expect(readCaptureReceipt(row)).toMatchObject({
			startHereDocumentId: 'sh1',
			thinkingLogDocumentId: 'log1',
			reviewSections: ['Open questions']
		});
		expect(readCaptureReceipt({ ...row, status: 'noop' })).toBeNull();
		expect(readCaptureReceipt({ ...row, status: 'failed' })).toBeNull();
		expect(
			readCaptureReceipt({
				...row,
				applied_sections: [],
				review_sections: [],
				thinking_log_document_id: null
			})
		).toBeNull();
	});

	it('inserts receipts in time order and replaces an updated one in place', () => {
		const list = [message('a', '2026-09-22T20:00:00Z'), message('b', '2026-09-22T20:01:00Z')];
		const receipt = buildCaptureReceiptUIMessage(row)!;
		const withReceipt = upsertCaptureReceipt(list, receipt);
		expect(withReceipt.map((item) => item.id)).toEqual(['a', 'capture-receipt:c1', 'b']);
		const undone = buildCaptureReceiptUIMessage({ ...row, status: 'undone' })!;
		const updated = upsertCaptureReceipt(withReceipt, undone);
		expect(updated.map((item) => item.id)).toEqual(['a', 'capture-receipt:c1', 'b']);
		expect(updated[1]!.data.receipt.status).toBe('undone');
	});
});
