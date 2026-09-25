// apps/worker/tests/projectLoopDriftFixes.test.ts
import { describe, expect, it } from 'vitest';
import { resolveDocumentEdits } from '@buildos/shared-agent-ops';
import {
	buildDriftFix,
	computeRevertEdit,
	type DriftFixDocument
} from '../src/workers/project-loop/driftFixes';

const DOC = 'doc-pillar';
const body = [
	'# AI Pillar — Working Doc',
	'## Open questions before folding into the outline',
	'- **Name of the move** — candidates above; not settled.',
	"- **AI's role in the book overall** — one pillar, or the why-now?",
	'- **Voice-first framing:** undecided.'
].join('\n');
const documents = new Map<string, DriftFixDocument>([
	[DOC, { id: DOC, title: 'AI Pillar — Working Doc', content: body }]
]);

const apply = (content: string, edits: Array<{ old_text: string; new_text: string }>) => {
	const result = resolveDocumentEdits({
		project_id: 'p',
		document_id: 'd',
		content,
		edits
	});
	if (result.status !== 'resolved') throw new Error('did not resolve');
	return result.next_content;
};

describe('computeRevertEdit', () => {
	it('reverses a deletion exactly by anchoring on neighboring lines', () => {
		const after = apply(body, [
			{ old_text: '- **Name of the move** — candidates above; not settled.\n', new_text: '' }
		]);
		const revert = computeRevertEdit(body, after);
		expect(revert?.old_text.trim()).not.toBe('');
		expect(apply(after, [revert!])).toBe(body);
	});

	it('reverses a replacement at the very start and at the very end', () => {
		for (const [oldText, newText] of [
			['# AI Pillar — Working Doc', '# AI Pillar'],
			['- **Voice-first framing:** undecided.', '- **Voice-first framing:** decided.']
		]) {
			const after = apply(body, [{ old_text: oldText!, new_text: newText! }]);
			expect(apply(after, [computeRevertEdit(body, after)!])).toBe(body);
		}
	});

	it('has nothing to reverse when nothing changed', () => {
		expect(computeRevertEdit(body, body)).toBeNull();
	});
});

describe('buildDriftFix', () => {
	const fixOperation = (args: Record<string, unknown>) => [
		{ tool: 'update_onto_document', args: { document_id: DOC, ...args } }
	];

	it('keeps only the document id and exact edits, with a verified reverse and preview', () => {
		const result = buildDriftFix({
			projectId: 'project-1',
			documents,
			rawOperations: fixOperation({
				edits: [
					{
						old_text: '- **Name of the move** — candidates above; not settled.',
						new_text: '- **Name of the move** — decided: The Reindex (Card 9).'
					}
				],
				content: 'a whole-body rewrite that must never ride along',
				props: { hidden: true }
			})
		});
		expect('fix' in result).toBe(true);
		if (!('fix' in result)) return;
		expect(result.fix.operations).toEqual([
			{
				tool: 'update_onto_document',
				args: {
					project_id: 'project-1',
					document_id: DOC,
					edits: [
						{
							old_text: '- **Name of the move** — candidates above; not settled.',
							new_text: '- **Name of the move** — decided: The Reindex (Card 9).'
						}
					]
				},
				label: 'Edit "AI Pillar — Working Doc"'
			}
		]);
		expect(result.fix.before).toEqual([
			'- **Name of the move** — candidates above; not settled.'
		]);
		const undo = result.fix.undoOperations[0]!.args as { edits: [{ old_text: string }] };
		const applied = apply(body, [
			{
				old_text: '- **Name of the move** — candidates above; not settled.',
				new_text: '- **Name of the move** — decided: The Reindex (Card 9).'
			}
		]);
		expect(apply(applied, undo.edits as never)).toBe(body);
	});

	it('shows a deletion as removed', () => {
		const result = buildDriftFix({
			projectId: 'project-1',
			documents,
			rawOperations: fixOperation({
				edits: [
					{
						old_text:
							"- **AI's role in the book overall** — one pillar, or the why-now?",
						new_text: ''
					}
				]
			})
		});
		expect('fix' in result && result.fix.after).toEqual(['(removed)']);
	});

	it('refuses what it cannot apply safely', () => {
		const cases: Array<[unknown, string]> = [
			[[], 'no_operation'],
			[
				[
					...fixOperation({ edits: [{ old_text: 'not settled', new_text: 'settled' }] }),
					...fixOperation({ edits: [{ old_text: 'undecided', new_text: 'decided' }] })
				],
				'invalid_shape'
			],
			[[{ tool: 'update_onto_task', args: { task_id: 't' } }], 'invalid_shape'],
			[
				[
					{
						tool: 'update_onto_document',
						args: {
							document_id: 'not-shown',
							edits: [{ old_text: 'a', new_text: 'b' }]
						}
					}
				],
				'unknown_document'
			],
			[
				fixOperation({ edits: [{ old_text: 'text that is not there', new_text: 'x' }] }),
				'unresolved'
			],
			[fixOperation({ edits: [{ old_text: '- **', new_text: '* ' }] }), 'unresolved'],
			[
				fixOperation({ edits: [{ old_text: 'undecided', new_text: 'undecided' }] }),
				'invalid_shape'
			]
		];
		for (const [rawOperations, reason] of cases) {
			expect(buildDriftFix({ projectId: 'project-1', documents, rawOperations })).toEqual({
				rejected: reason
			});
		}
	});

	it('refuses a fix that deletes most of a long document', () => {
		const long = `${'Keep this paragraph of real material. '.repeat(60)}\n## Tail\nend`;
		const result = buildDriftFix({
			projectId: 'project-1',
			documents: new Map([[DOC, { id: DOC, title: 'Long', content: long }]]),
			rawOperations: fixOperation({
				edits: [{ old_text: long.slice(0, 1_400), new_text: '' }]
			})
		});
		expect(result).toEqual({ rejected: 'large_deletion' });
	});
});
