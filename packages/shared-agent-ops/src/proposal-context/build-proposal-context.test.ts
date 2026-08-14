// packages/shared-agent-ops/src/proposal-context/build-proposal-context.test.ts
import { describe, expect, it } from 'vitest';
import { buildProjectSuggestionProposalContext } from './build-proposal-context';

const suggestion = {
	id: 'suggestion-1',
	project_id: 'project-1',
	kind: 'doc_org',
	risk_tier: 1,
	title: 'Move the intended document',
	preview: { summary: 'Move the wrong model-authored title.' },
	operations: [
		{
			tool: 'move_document_in_tree',
			args: {
				project_id: 'project-1',
				document_id: 'doc-1',
				new_parent_id: 'doc-2'
			},
			label: 'Move the wrong model-authored title'
		}
	]
};

describe('buildProjectSuggestionProposalContext', () => {
	it('does not decode raw executable operations without a verified summary', () => {
		const context = buildProjectSuggestionProposalContext({ suggestion });

		expect(context.operationSummaries).toEqual([]);
		expect(context.humanText).not.toContain('wrong model-authored title');
	});

	it('uses only canonical resolved operation text when verification is provided', () => {
		const context = buildProjectSuggestionProposalContext({
			suggestion,
			verifiedChangeSummary: {
				headline: 'Move "Current document title" under "Current parent title".',
				operation_count: 1,
				structural_fingerprint: 'fingerprint',
				verified_at: '2026-08-13T12:00:00.000Z',
				operations: [
					{
						key: 'move_document_in_tree:doc-1:0',
						action: 'move',
						actionLabel: 'Move',
						entityLabel: 'document',
						target: 'Current document title',
						summary: 'Move "Current document title" under "Current parent title"',
						changes: [{ label: 'New location', value: 'Current parent title' }]
					}
				]
			}
		});

		expect(context.humanText).toContain('Current document title');
		expect(context.humanText).toContain('Current parent title');
		expect(context.humanText).not.toContain('wrong model-authored title');
	});
});
