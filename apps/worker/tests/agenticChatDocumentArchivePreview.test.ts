// apps/worker/tests/agenticChatDocumentArchivePreview.test.ts
import { describe, expect, it, vi } from 'vitest';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import { buildMutationBatch, mutationBatchSha256 } from '@buildos/agentic-chat-runtime/loop';
import type { DocumentArchiveReviewSnapshot } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { previewDocumentArchiveCalls } from '../src/workers/agentic-chat/provider/document-archive-preview';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';

const project = '10000000-0000-4000-8000-000000000001';
const parent = '10000000-0000-4000-8000-000000000002';
const child = '10000000-0000-4000-8000-000000000003';
const sibling = '10000000-0000-4000-8000-000000000004';
const request = { userId: 'user', projectId: project };
function snapshot(id = parent): DocumentArchiveReviewSnapshot {
	return {
		project_id: project,
		document_id: id,
		archive_mode: 'archive_children',
		target_updated_at: '2026-09-29T00:00:00Z',
		tree_fingerprint: 'subtree',
		archived_document_ids: [id],
		documents: [{ id, title: 'Document', effect: 'archive' }],
		public_pages: []
	};
}
function call(args: JsonObject = {}, id = 'archive'): CompletedProviderToolCall {
	const arguments_ = {
		document_id: parent,
		state_key: 'archived',
		archive_mode: 'archive_children',
		...args
	};
	const text = canonicalizeAgenticChatJson(arguments_);
	return {
		id,
		name: 'update_onto_document',
		arguments: arguments_,
		canonicalArguments: text,
		canonicalProviderArguments: text
	};
}

describe('document archive preview', () => {
	it('binds server publication and descendant facts into the reviewed digest, preserving scheduling', async () => {
		const facts = snapshot();
		facts.archived_document_ids.push(child);
		facts.documents.push({ id: child, title: 'Public child', effect: 'archive' });
		facts.public_pages.push({ document_id: child, slug: 'public-child', status: 'published' });
		const original = call();
		original.canonicalProviderArguments = canonicalizeAgenticChatJson({
			...original.arguments,
			call_ref: 'cleanup'
		});
		const result = await previewDocumentArchiveCalls(
			{ preview: vi.fn(async () => ({ ok: true as const, snapshot: facts })) },
			[original],
			request
		);
		expect(result.issues).toEqual([]);
		const prepared = result.calls[0]!;
		expect(prepared.arguments._archive_review).toEqual(facts);
		expect(JSON.parse(prepared.canonicalProviderArguments)).toMatchObject({
			call_ref: 'cleanup',
			_archive_review: facts
		});
		expect(
			JSON.parse(buildMutationBatch(result.calls).calls[0]!.canonicalArguments)
				._archive_review
		).toEqual(facts);
		expect(mutationBatchSha256(buildMutationBatch(result.calls))).not.toBe(
			mutationBatchSha256(buildMutationBatch([original]))
		);
		expect(original.arguments).not.toHaveProperty('_archive_review');
	});
	it.each([
		{ archive_mode: null },
		{ archive_mode: 'unlink_children' },
		{ state_key: 'archive' },
		{ state_key: ' ARCHIVED ' },
		{ _archive_review: { confirmed: true } },
		{ content: 'also rewrite' }
	])('rejects unsupported or actor-authored archive arguments %j', async (args) => {
		const preview = vi.fn();
		const result = await previewDocumentArchiveCalls({ preview }, [call(args)], request);
		expect(result.issues).toHaveLength(1);
		expect(preview).not.toHaveBeenCalled();
	});
	it('fails closed when the preview port is absent or throws', async () => {
		for (const port of [
			undefined,
			{
				preview: vi.fn(async () => {
					throw new Error('offline');
				})
			}
		]) {
			const result = await previewDocumentArchiveCalls(port, [call()], request);
			expect(result.issues[0]?.errors.join(' ')).toContain('unavailable');
			expect(result.calls[0]?.arguments).not.toHaveProperty('_archive_review');
		}
	});
	it('allows independent siblings in a stage and rejects overlapping descendant effects', async () => {
		const preview = vi.fn(async ({ args }: { args: JsonObject }) => ({
			ok: true as const,
			snapshot: snapshot(String(args.document_id))
		}));
		expect(
			(
				await previewDocumentArchiveCalls(
					{ preview },
					[call(), call({ document_id: sibling }, 'sibling')],
					request
				)
			).issues
		).toEqual([]);
		const facts = snapshot();
		facts.documents.push({ id: child, title: 'Child', effect: 'archive' });
		const overlap = await previewDocumentArchiveCalls(
			{
				preview: vi
					.fn()
					.mockResolvedValueOnce({ ok: true, snapshot: facts })
					.mockResolvedValueOnce({ ok: true, snapshot: snapshot(child) })
			},
			[call(), call({ document_id: child }, 'child')],
			request
		);
		expect(overlap.issues[0]?.errors.join(' ')).toContain('overlap');
	});
	it('rejects a mismatched server preview', async () => {
		const result = await previewDocumentArchiveCalls(
			{ preview: async () => ({ ok: true, snapshot: snapshot(child) }) },
			[call()],
			request
		);
		expect(result.issues[0]?.errors.join(' ')).toContain('did not match');
	});
});
