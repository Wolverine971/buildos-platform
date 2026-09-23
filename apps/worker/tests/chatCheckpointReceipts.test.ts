import { describe, expect, it } from 'vitest';
import {
	latestSavedChanges,
	SAVED_CHANGE_PROMPT_LIMIT
} from '../src/workers/chat/checkpoint/capturePrompts';

function write(title: string, created_at: string) {
	return {
		tool_name: 'update_onto_document',
		tool_category: 'ontology_action',
		success: true,
		affected_entities: [{ kind: 'document', title }],
		created_at
	};
}

describe('latestSavedChanges', () => {
	it('keeps the newest saves, oldest first, when a long chat exceeds the prompt limit', () => {
		const total = SAVED_CHANGE_PROMPT_LIMIT + 5;
		const newestFirst = Array.from({ length: total }, (_, index) => {
			const n = total - index;
			return write(`Save ${n}`, `2026-09-23T12:${String(n).padStart(2, '0')}:00Z`);
		});

		const changes = latestSavedChanges(newestFirst);

		expect(changes).toHaveLength(SAVED_CHANGE_PROMPT_LIMIT);
		expect(changes[0]?.title).toBe('Save 6');
		expect(changes.at(-1)?.title).toBe(`Save ${total}`);
	});

	it('skips reads and failed executions without spending the limit on them', () => {
		const changes = latestSavedChanges([
			write('Chapter 2', '2026-09-23T12:03:00Z'),
			{
				tool_name: 'get_onto_document_details',
				tool_category: 'read',
				success: true,
				affected_entities: [],
				created_at: '2026-09-23T12:02:00Z'
			},
			{ ...write('Failed', '2026-09-23T12:01:30Z'), success: false },
			write('Chapter 1', '2026-09-23T12:01:00Z')
		]);

		expect(changes.map((change) => change.title)).toEqual(['Chapter 1', 'Chapter 2']);
	});
});
