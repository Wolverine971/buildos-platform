// apps/web/src/lib/server/document-proposal.service.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashDocumentContent } from '@buildos/shared-agent-ops/utils/document-outline';
import { createDocumentPatchV1 } from '@buildos/shared-agent-ops/ontology/document-patch';
import {
	createDocumentProposal,
	generateDocumentProposalReplacement,
	applyDocumentProposal,
	DocumentProposalGenerationError
} from './document-proposal.service';
import { writeDocumentHeadAndVersion } from '$lib/services/ontology/document-write.service';

vi.mock('$lib/services/ontology/document-write.service', () => ({
	writeDocumentHeadAndVersion: vi.fn()
}));

function documentFixture(content = '# Plan\n\nDraft this paragraph.') {
	return {
		id: 'document-1',
		project_id: 'project-1',
		content,
		content_hash: hashDocumentContent(content),
		props: { body_markdown: content },
		updated_at: '2026-08-26T20:00:00.000Z',
		title: 'Plan',
		description: null,
		state_key: 'draft',
		type_key: 'document.knowledge.research',
		archived_at: null,
		children: null,
		created_at: '2026-08-26T19:00:00.000Z',
		created_by: 'actor-1',
		deleted_at: null,
		outline: null,
		search_vector: null
	} as any;
}

function proposalFixture(content: string, replacement = 'Publish this paragraph.') {
	const from = content.indexOf('Draft this paragraph.');
	const to = from + 'Draft this paragraph.'.length;
	const resultContent = content.slice(0, from) + replacement + content.slice(to);
	const patch = createDocumentPatchV1({
		project_id: 'project-1',
		document_id: 'document-1',
		base_content: content,
		selections: [
			{
				op_id: 'op-1',
				from,
				to,
				replacement_markdown: replacement
			}
		]
	});
	return {
		id: 'proposal-1',
		project_id: 'project-1',
		document_id: 'document-1',
		created_by_actor_id: 'actor-1',
		instruction: 'Make it final',
		patch,
		patch_hash: patch.patch_hash,
		base_content_hash: patch.base_content_hash,
		result_content_hash: hashDocumentContent(resultContent),
		status: 'pending',
		conflict_reason: null,
		applied_at: null,
		applied_by_actor_id: null,
		version_warning: null,
		created_at: '2026-08-26T20:01:00.000Z',
		updated_at: '2026-08-26T20:01:00.000Z'
	} as any;
}

describe('generateDocumentProposalReplacement', () => {
	it('requests one bounded replacement-only JSON response', async () => {
		const getJSONResponse = vi.fn().mockResolvedValue({
			replacement_markdown: 'Publish this paragraph.'
		});

		await expect(
			generateDocumentProposalReplacement(
				{
					instruction: 'Make it final',
					selectedMarkdown: 'Draft this paragraph.',
					prefixMarkdown: '# Plan\n\n',
					suffixMarkdown: '',
					userId: 'user-1',
					projectId: 'project-1',
					documentId: 'document-1'
				},
				{ llmClient: { getJSONResponse } as never }
			)
		).resolves.toBe('Publish this paragraph.');
		expect(getJSONResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				operationType: 'document_proposal_generate',
				userPrompt: expect.stringContaining('Selected Markdown:\nDraft this paragraph.')
			})
		);
	});

	it('rejects a proposal that makes no change', async () => {
		const promise = generateDocumentProposalReplacement(
			{
				instruction: 'Improve this',
				selectedMarkdown: 'Same',
				prefixMarkdown: '',
				suffixMarkdown: '',
				userId: 'user-1',
				projectId: 'project-1',
				documentId: 'document-1'
			},
			{
				llmClient: {
					getJSONResponse: vi.fn().mockResolvedValue({ replacement_markdown: 'Same' })
				} as never
			}
		);

		await expect(promise).rejects.toBeInstanceOf(DocumentProposalGenerationError);
		await expect(promise).rejects.toMatchObject({
			code: 'NO_CHANGE'
		});
	});
});

describe('createDocumentProposal', () => {
	it('binds the persisted proposal to the exact saved selection and hash', async () => {
		const document = documentFixture();
		const inserted = proposalFixture(document.content);
		const single = vi.fn().mockResolvedValue({ data: inserted, error: null });
		const select = vi.fn(() => ({ single }));
		const insert = vi.fn(() => ({ select }));
		const supabase = { from: vi.fn(() => ({ insert })) } as any;
		const from = document.content.indexOf('Draft this paragraph.');

		await expect(
			createDocumentProposal({
				supabase,
				document,
				actorId: 'actor-1',
				userId: 'user-1',
				instruction: 'Make it final',
				selectionFrom: from,
				selectionTo: from + 'Draft this paragraph.'.length,
				baseContentHash: hashDocumentContent(document.content),
				llmClient: {
					getJSONResponse: vi
						.fn()
						.mockResolvedValue({ replacement_markdown: 'Publish this paragraph.' })
				} as never
			})
		).resolves.toBe(inserted);

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				document_id: 'document-1',
				patch_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
				base_content_hash: hashDocumentContent(document.content),
				result_content_hash: hashDocumentContent('# Plan\n\nPublish this paragraph.')
			})
		);
	});
});

describe('applyDocumentProposal', () => {
	beforeEach(() => vi.mocked(writeDocumentHeadAndVersion).mockReset());

	it('forces a revision boundary when the reviewed patch applies', async () => {
		const document = documentFixture();
		const proposal = proposalFixture(document.content);
		const applied = {
			...proposal,
			status: 'applied',
			applied_at: '2026-08-26T20:02:00.000Z',
			applied_by_actor_id: 'actor-1'
		};
		const proposalSelect = {
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: proposal, error: null })
		};
		const proposalUpdate = {
			eq: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: applied, error: null })
		};
		const documentSelect = {
			eq: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: document, error: null })
		};
		const supabase = {
			from: vi.fn((table: string) =>
				table === 'onto_documents'
					? { select: vi.fn(() => documentSelect) }
					: {
							select: vi.fn(() => proposalSelect),
							update: vi.fn(() => proposalUpdate)
						}
			)
		} as any;
		vi.mocked(writeDocumentHeadAndVersion).mockResolvedValue({
			status: 'updated',
			document: { ...document, content: '# Plan\n\nPublish this paragraph.' },
			versionWarning: null,
			versionError: null
		});

		await expect(
			applyDocumentProposal({
				supabase,
				documentId: 'document-1',
				proposalId: 'proposal-1',
				actorId: 'actor-1'
			})
		).resolves.toMatchObject({
			status: 'applied',
			proposal: applied,
			strategy: 'fast_path'
		});

		expect(writeDocumentHeadAndVersion).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedUpdatedAt: document.updated_at,
				forceCreateVersion: true,
				changeSource: 'document_proposal_apply',
				update: expect.objectContaining({
					content: '# Plan\n\nPublish this paragraph.'
				})
			})
		);
	});

	it('treats the exact reviewed result after a lost CAS as an idempotent apply', async () => {
		const document = documentFixture();
		const proposal = proposalFixture(document.content);
		const nextDocument = {
			...document,
			content: '# Plan\n\nPublish this paragraph.',
			updated_at: '2026-08-26T20:02:00.000Z'
		};
		const applied = {
			...proposal,
			status: 'applied',
			applied_at: '2026-08-26T20:02:00.000Z',
			applied_by_actor_id: 'actor-1'
		};
		const proposalSelect = {
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: proposal, error: null })
		};
		const proposalUpdate = {
			eq: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: applied, error: null })
		};
		const documentSelect = {
			eq: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			maybeSingle: vi
				.fn()
				.mockResolvedValueOnce({ data: document, error: null })
				.mockResolvedValueOnce({ data: nextDocument, error: null })
		};
		const supabase = {
			from: vi.fn((table: string) =>
				table === 'onto_documents'
					? { select: vi.fn(() => documentSelect) }
					: {
							select: vi.fn(() => proposalSelect),
							update: vi.fn(() => proposalUpdate)
						}
			)
		} as any;
		vi.mocked(writeDocumentHeadAndVersion).mockResolvedValue({ status: 'conflict' });

		await expect(
			applyDocumentProposal({
				supabase,
				documentId: 'document-1',
				proposalId: 'proposal-1',
				actorId: 'actor-1'
			})
		).resolves.toMatchObject({
			status: 'applied',
			proposal: applied,
			document: nextDocument,
			strategy: 'fast_path'
		});

		expect(writeDocumentHeadAndVersion).toHaveBeenCalledTimes(1);
	});
});
