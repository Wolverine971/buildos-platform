// apps/worker/tests/agenticChatDocumentEvidence.test.ts
// Saved evidence must match all three durable sources, including explicit no-read coverage.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { documentEvidenceHandoffPrompt } from '../src/workers/agentic-chat/workflow/document-read-tool';

const context = { contextId: 'context', contextHash: 'a'.repeat(64) };
const result = {
	version: 'agentic_chat_document_read_result_v1',
	documents: [
		{
			id: 'document',
			title: 'Workshop brief',
			status: 'read',
			content: 'Exact saved text',
			truncated: false
		}
	]
};
const binding = {
	version: 'agentic_chat_document_evidence_binding_v1',
	...context,
	documentReadResultHash: createHash('sha256')
		.update(canonicalizeAgenticChatJson(result))
		.digest('hex'),
	organizerStatus: 'accepted'
};

describe('saved document evidence binding', () => {
	it('supplies exactly the saved source with coverage', () => {
		expect(
			documentEvidenceHandoffPrompt({ context, result, binding, organizerStatus: 'accepted' })
		).toContain(JSON.stringify(result));
	});
	it.each(['context', 'read_hash', 'body', 'missing_batch', 'organizer', 'binding'])(
		'fails closed on %s mismatch',
		(field) => {
			const input = {
				context: { ...context },
				result: structuredClone(result),
				binding: { ...binding },
				organizerStatus: 'accepted'
			};
			if (field === 'context') input.context.contextHash = 'b'.repeat(64);
			if (field === 'read_hash') input.binding.documentReadResultHash = 'b'.repeat(64);
			if (field === 'body') input.result.documents[0]!.content = 'Changed later';
			if (field === 'organizer') input.organizerStatus = 'claimed';
			expect(() =>
				documentEvidenceHandoffPrompt({
					...input,
					...(field === 'missing_batch' ? { result: undefined } : {}),
					...(field === 'binding' ? { binding: undefined } : {})
				})
			).toThrow('binding mismatch');
		}
	);
	it('pins inventory-only coverage after failure and rejects a later batch', () => {
		const limited = { ...binding, documentReadResultHash: null, organizerStatus: 'failed' };
		expect(
			documentEvidenceHandoffPrompt({ context, binding: limited, organizerStatus: 'failed' })
		).toContain('No document-read batch was saved');
		expect(() =>
			documentEvidenceHandoffPrompt({
				context,
				result,
				binding: limited,
				organizerStatus: 'failed'
			})
		).toThrow();
	});
});
