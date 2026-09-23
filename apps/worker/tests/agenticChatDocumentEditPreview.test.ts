// apps/worker/tests/agenticChatDocumentEditPreview.test.ts
//
// Batch previews (tasker 98 review): calls on the same document execute in
// order, so each is previewed against the body the earlier calls leave behind.
import { describe, expect, it, vi } from 'vitest';
import {
	formatDocumentEditFailures,
	hasDocumentEdits,
	resolveDocumentEdits,
	summarizeDocumentChange,
	type DocumentSectionEditV1,
	type DocumentTextEditV1
} from '@buildos/shared-agent-ops/ontology/document-edits';
import {
	previewDocumentEditCalls,
	type AgenticChatDocumentEditPreviewPort,
	type DocumentEditPreviewOutcome
} from '../src/workers/agentic-chat/provider/document-edit-preview';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const NOTES_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST = { userId: 'user-1', projectId: 'project-1' };

function updateCall(id: string, args: Record<string, unknown>): CompletedProviderToolCall {
	const json = JSON.stringify(args);
	return {
		id,
		name: 'update_onto_document',
		arguments: args as CompletedProviderToolCall['arguments'],
		canonicalArguments: json,
		canonicalProviderArguments: json
	};
}

/** Resolves like the gateway dry run: against baseContent when given, else the stored body. */
function fakePort(stored: Record<string, string>) {
	const preview = vi.fn(
		async ({
			args,
			baseContent
		}: {
			args: Record<string, unknown>;
			baseContent?: string;
		}): Promise<DocumentEditPreviewOutcome> => {
			const documentId = String(args.document_id);
			const before = baseContent ?? stored[documentId] ?? '';
			let after = typeof args.content === 'string' ? args.content : before;
			if (hasDocumentEdits(args)) {
				const resolution = resolveDocumentEdits({
					project_id: 'project-1',
					document_id: documentId,
					content: before,
					edits: (args.edits as DocumentTextEditV1[] | undefined) ?? [],
					section_edits: (args.section_edits as DocumentSectionEditV1[] | undefined) ?? []
				});
				if (resolution.status === 'rejected') {
					return {
						status: 'rejected',
						message: formatDocumentEditFailures(resolution.failures)
					};
				}
				after = resolution.next_content;
			}
			const change = summarizeDocumentChange({
				project_id: 'project-1',
				document_id: documentId,
				before,
				after,
				include_revert_patch: false
			});
			if (!change) return { status: 'previewed', preview: null, next_content: null };
			return {
				status: 'previewed',
				preview: {
					document_id: documentId,
					title: null,
					lines_added: change.lines_added,
					lines_removed: change.lines_removed,
					changed_lines: change.hunks.flatMap((hunk) =>
						hunk.lines
							.filter((line) => line.kind !== 'context')
							.map((line) => `${line.kind === 'add' ? '+' : '-'} ${line.text}`)
					),
					changed_lines_truncated: false
				},
				next_content: after
			};
		}
	);
	return { preview } satisfies AgenticChatDocumentEditPreviewPort;
}

const PLAN = '# Plan\n\n## Scope\n\nShip the beta.\n\n## Notes\n\nNone yet.\n';

describe('previewDocumentEditCalls', () => {
	it('accepts a later edit whose old_text only exists after an earlier call in the batch', async () => {
		const port = fakePort({ [PLAN_ID]: PLAN });
		const calls = [
			updateCall('call-1', {
				document_id: PLAN_ID,
				edits: [{ old_text: 'Ship the beta.', new_text: 'Ship the beta.\nInvite ten users.' }]
			}),
			updateCall('call-2', {
				document_id: PLAN_ID,
				edits: [{ old_text: 'Invite ten users.', new_text: 'Invite twenty users.' }]
			})
		];

		const result = await previewDocumentEditCalls(port, calls, REQUEST);

		expect(result.issues).toEqual([]);
		expect(port.preview).toHaveBeenCalledTimes(2);
		expect(port.preview.mock.calls[0]![0]).not.toHaveProperty('baseContent');
		expect(port.preview.mock.calls[1]![0].baseContent).toBe(
			PLAN.replace('Ship the beta.', 'Ship the beta.\nInvite ten users.')
		);
		expect(result.previews.get('call-2')?.changed_lines).toEqual([
			'- Invite ten users.',
			'+ Invite twenty users.'
		]);
	});

	it('shows the reviewer that a later whole-body replace overwrites an earlier edit', async () => {
		const port = fakePort({ [PLAN_ID]: PLAN });
		const calls = [
			updateCall('call-1', {
				document_id: PLAN_ID,
				edits: [{ old_text: 'None yet.', new_text: 'Budget is tight.' }]
			}),
			updateCall('call-2', {
				document_id: PLAN_ID,
				content: PLAN.replace('Ship the beta.', 'Ship the beta in May.')
			})
		];

		const result = await previewDocumentEditCalls(port, calls, REQUEST);

		expect(result.issues).toEqual([]);
		// Against the stored body the replace would look like a one-line change;
		// chained, it also reverts call-1's edit.
		expect(result.previews.get('call-2')?.changed_lines).toEqual(
			expect.arrayContaining(['- Budget is tight.', '+ None yet.'])
		);
	});

	it('stops a document chain at a rejected call and keeps other documents independent', async () => {
		const port = fakePort({ [PLAN_ID]: PLAN, [NOTES_ID]: 'Notes body.\n' });
		const calls = [
			updateCall('call-1', {
				document_id: PLAN_ID,
				edits: [{ old_text: 'Ship the alpha.', new_text: 'Ship it.' }]
			}),
			updateCall('call-2', {
				document_id: NOTES_ID,
				edits: [{ old_text: 'Notes body.', new_text: 'Better notes.' }]
			}),
			updateCall('call-3', {
				document_id: PLAN_ID,
				edits: [{ old_text: 'None yet.', new_text: 'Some.' }]
			})
		];

		const result = await previewDocumentEditCalls(port, calls, REQUEST);

		expect(result.issues.map((issue) => issue.toolCall.id)).toEqual(['call-1']);
		expect(result.issues[0]!.errors[0]).toContain(
			'Checked against the stored document before review'
		);
		expect(result.previews.has('call-2')).toBe(true);
		// Never checked against a body it would not see.
		expect(result.previews.has('call-3')).toBe(false);
		expect(port.preview).toHaveBeenCalledTimes(2);
	});

	it('names the chained base when a later call on the same document fails', async () => {
		const port = fakePort({ [PLAN_ID]: PLAN });
		const calls = [
			updateCall('call-1', {
				document_id: PLAN_ID,
				edits: [{ old_text: 'None yet.', new_text: 'Some.' }]
			}),
			updateCall('call-2', {
				document_id: PLAN_ID,
				edits: [{ old_text: 'None yet.', new_text: 'Other.' }]
			})
		];

		const result = await previewDocumentEditCalls(port, calls, REQUEST);

		expect(result.issues.map((issue) => issue.toolCall.id)).toEqual(['call-2']);
		expect(result.issues[0]!.errors[0]).toContain(
			'as the earlier update_onto_document calls in this batch leave it'
		);
	});
});
