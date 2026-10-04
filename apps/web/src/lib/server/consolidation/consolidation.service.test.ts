// apps/web/src/lib/server/consolidation/consolidation.service.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/smart-llm-service', () => ({ SmartLLMService: class {} }));
vi.mock('$lib/server/queue-job-id', () => ({ addQueueJobWithPublicId: vi.fn() }));
vi.mock('$lib/server/organize/organize-service', () => ({
	previewOrApplyOrganize: vi.fn(),
	undoOrganize: vi.fn(),
	OrganizeError: class extends Error {}
}));

import { parseConsolidationQuestion } from '@buildos/shared-agent-ops/consolidation';
import { organizeMovesFor, parseReading } from './consolidation.service';

const WAYNE = 'p-wayne';
const BEYOND = 'p-beyond';

describe('organizeMovesFor', () => {
	it('moves each doc to the top of its destination', () => {
		const moves = organizeMovesFor(
			new Map([['a', BEYOND]]),
			() => WAYNE,
			new Map([['a', null]])
		);
		expect(moves).toEqual([
			{
				kind: 'document',
				id: 'a',
				project_id: WAYNE,
				destination_project_id: BEYOND,
				parent_id: null,
				position: 0
			}
		]);
	});

	it('lets a doc travel with its folder, and moves deeper docs first', () => {
		const parents = new Map<string, string | null>([
			['folder', null],
			['child', 'folder'],
			['grandchild', 'child'],
			['elsewhere', 'folder']
		]);
		const targets = new Map([
			['folder', BEYOND],
			['child', BEYOND],
			['grandchild', BEYOND],
			['elsewhere', 'p-uxm']
		]);
		// `elsewhere` leaves the folder before the folder moves, so it is not carried off.
		expect(organizeMovesFor(targets, () => WAYNE, parents).map((move) => move.id)).toEqual([
			'elsewhere',
			'folder'
		]);
	});
});

describe('parseReading', () => {
	const question = parseConsolidationQuestion({
		id: '00000000-0000-4000-8000-000000000001',
		run_id: '00000000-0000-4000-8000-000000000002',
		piece: 'cluster:c1',
		header: 'Rod docs',
		question: 'What should happen?',
		evidence: [],
		options: [
			{
				id: 'rec',
				label: 'Move',
				description: '',
				ops: [
					{
						op: 'move',
						document_ids: ['00000000-0000-4000-8000-000000000003'],
						target_project_id: '00000000-0000-4000-8000-000000000004'
					}
				]
			},
			{
				id: 'leave',
				label: 'Leave',
				description: '',
				ops: [{ op: 'keep', document_ids: ['00000000-0000-4000-8000-000000000003'] }]
			}
		],
		recommended_option_id: 'rec',
		skip_option_id: 'leave',
		status: 'open'
	})!;

	it('keeps an option id only when it is on the card', () => {
		expect(parseReading({ option_id: 'rec', readback: 'Move it.' }, question)).toEqual({
			option_id: 'rec',
			instruction: null,
			readback: 'Move it.'
		});
		expect(
			parseReading({ option_id: 'delete_all', readback: 'Delete it.' }, question)
		).toBeNull();
	});

	it('takes an instruction when no option fits, and needs a readback either way', () => {
		expect(
			parseReading(
				{
					option_id: null,
					instruction: 'Move all but the May prep',
					readback: 'Move 10 docs.'
				},
				question
			)
		).toEqual({
			option_id: null,
			instruction: 'Move all but the May prep',
			readback: 'Move 10 docs.'
		});
		expect(parseReading({ option_id: 'rec' }, question)).toBeNull();
		expect(parseReading(null, question)).toBeNull();
	});
});
