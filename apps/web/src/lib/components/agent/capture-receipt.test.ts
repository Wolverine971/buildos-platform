// apps/web/src/lib/components/agent/capture-receipt.test.ts
import { describe, expect, it } from 'vitest';
import type { UIMessage } from './agent-chat.types';
import {
	buildCaptureReceiptUIMessage,
	knowledgeHref,
	knowledgeNames,
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

	it('shows a knowledge-only capture from a chat with no project', () => {
		const knowledgeRow = {
			...row,
			project_id: null,
			applied_sections: [],
			review_sections: [],
			review_run_id: null,
			thinking_log_document_id: null,
			start_here_document_id: null,
			details: {
				knowledge: {
					fact_ids: ['f1', 'f2', 'f3'],
					entities: [
						{ id: 'e1', name: 'Dana Whitfield', facts: 2 },
						{ id: 'e2', name: 'Harbor Lane Logistics', facts: 1 }
					]
				}
			}
		};
		const receipt = readCaptureReceipt(knowledgeRow)!;
		expect(receipt.projectId).toBeNull();
		expect(receipt.knowledge?.facts).toBe(3);
		expect(knowledgeNames(receipt.knowledge!)).toBe('Dana Whitfield and Harbor Lane Logistics');
		expect(knowledgeHref(receipt.knowledge!)).toBe('/knowledge');
		expect(
			knowledgeHref({
				facts: 1,
				entries: [{ id: 'e1', name: 'Dana Whitfield', facts: 1 }],
				questions: 0
			})
		).toBe('/knowledge?e=e1');
		// Only questions filed: the chip shows them, with no details count.
		const asked = readCaptureReceipt({
			...knowledgeRow,
			details: {
				knowledge: {
					fact_ids: ['f9'],
					saved_facts: 0,
					questions: [{ entity_id: 'e1', other_entity_id: 'e9', name: 'Jev Ramos' }],
					entities: []
				}
			}
		})!;
		expect(asked.knowledge).toEqual({ facts: 0, entries: [], questions: 1 });
		// A knowledge receipt that added nothing shows nothing.
		expect(
			readCaptureReceipt({ ...knowledgeRow, details: { knowledge: { fact_ids: [] } } })
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
