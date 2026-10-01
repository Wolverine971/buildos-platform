// apps/worker/tests/agenticChatSharedDocumentEdit.test.ts
//
// Project hierarchy Phase 2: a child chat's edit to a document on its parent's
// shared shelf never writes. It returns a confirm card whose receipt holds the
// exact edit server-side; only the user's click (web endpoint) can apply it.
import { describe, expect, it, vi } from 'vitest';
import { parseSharedDocumentEditCardReceipt } from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import { AgenticChatTableMutationAdapter } from '../src/workers/agentic-chat/mutations/table-adapter';
import type { MutationInput } from '../src/workers/agentic-chat/mutations/adapter-boundary';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [USER, SESSION, CHILD, PARENT, DOC, FOLDER, EFFECT, TURN, MESSAGE, ACTOR] = Array.from(
	{ length: 10 },
	(_, n) => id(n + 1)
);
const FAMILY_UPDATED = '2026-09-30T12:00:00Z';
const PREVIEW_VERSION = '2026-09-30T12:00:00.123456+00:00';

function fixture() {
	const family = {
		project_id: CHILD,
		parent: {
			id: PARENT,
			name: 'Wayne Strategies',
			can_write: true,
			shared_folder_document_id: FOLDER,
			child_count: 5
		},
		shelf: [{ id: DOC, title: 'Rate card', updated_at: FAMILY_UPDATED }],
		children: []
	};
	const from = vi.fn((table: string) => {
		const filters: Record<string, unknown> = {};
		const q = {
			select: vi.fn(() => q),
			eq: vi.fn((key, value) => {
				filters[key] = value;
				return q;
			}),
			maybeSingle: vi.fn(async () => {
				const row: Record<string, unknown> | null =
					table === 'onto_actors' ? { id: ACTOR, user_id: USER } : null;
				return {
					data:
						row && Object.entries(filters).every(([k, v]) => row[k] === v) ? row : null,
					error: null
				};
			})
		};
		return q;
	});
	const rpc = vi.fn(async () => ({ data: family, error: null }));
	const runGateway = vi.fn(
		async (): Promise<any> => ({
			ok: false,
			error: { code: 'NOT_FOUND', message: 'Document not found' }
		})
	);
	const preview = vi.fn(
		async (): Promise<any> => ({
			ok: true,
			data: {
				document_id: DOC,
				title: 'Rate card',
				document_change: {
					version: 1,
					document_id: DOC,
					project_id: PARENT,
					title: 'Rate card',
					lines_added: 1,
					lines_removed: 1,
					chars_before: 24,
					chars_after: 24,
					before_hash: 'a'.repeat(64),
					after_hash: 'b'.repeat(64),
					hunks: [
						{
							old_start: 1,
							new_start: 1,
							lines: [
								{ kind: 'remove', text: 'Strategy session: $1,500' },
								{ kind: 'add', text: 'Strategy session: $1,800' }
							]
						}
					],
					hunks_truncated: false
				},
				next_content: 'Strategy session: $1,800',
				base: {
					updated_at: PREVIEW_VERSION,
					description: null,
					state_key: 'draft',
					type_key: 'document.default'
				}
			}
		})
	);
	const client = { from, rpc } as never;
	const notFound = async (): Promise<any> => ({
		ok: false,
		error: { code: 'NOT_FOUND', message: 'Document not found' }
	});
	const adapter = new AgenticChatTableMutationAdapter(client, {
		runGateway,
		archiveDocument: vi.fn(notFound) as never,
		previewSharedDocument: preview as never
	});
	const input = (args: Record<string, unknown> = {}): MutationInput =>
		({
			effectId: EFFECT,
			downstreamIdempotencyKey: `chat-effect:${EFFECT}`,
			toolName: 'update_onto_document',
			operationName: 'onto.document.update',
			downstreamIdempotencySupported: false,
			providerToolCallId: 'tool-call',
			arguments: {
				document_id: DOC,
				edits: [{ old_text: '$1,500', new_text: '$1,800' }],
				...args
			},
			executionInput: {
				claim: {
					userId: USER,
					sessionId: SESSION,
					turnRunId: TURN,
					userMessageId: MESSAGE
				},
				timingBaseline: { admittedAt: FAMILY_UPDATED },
				requestPayload: { context: { type: 'project', projectId: CHILD, entityId: CHILD } },
				artifact: {
					prepared: {
						toolSurface: {
							version: 1,
							surfaceProfile: 'test',
							toolNames: ['update_onto_document'],
							definitions: [
								{
									type: 'function',
									function: {
										name: 'update_onto_document',
										description: 'Test',
										parameters: { type: 'object', properties: {} }
									}
								}
							]
						}
					}
				}
			},
			signal: new AbortController().signal
		}) as unknown as MutationInput;
	return { family, from, rpc, runGateway, preview, adapter, input };
}

describe('shared-document confirm card boundary', () => {
	it('returns a card with the exact edit held server-side and writes nothing', async () => {
		const f = fixture();
		const receipt = await f.adapter.execute(f.input());
		const card = parseSharedDocumentEditCardReceipt(receipt);
		expect(card).not.toBeNull();
		expect(card).toMatchObject({
			status: 'confirmation_required',
			requires_user_action: true,
			card_id: EFFECT,
			source_user_message_id: MESSAGE,
			pending_edit: {
				document_id: DOC,
				child_project_id: CHILD,
				parent_project_id: PARENT,
				shared_folder_id: FOLDER,
				shared_with_count: 5,
				// The version the diff was computed against, not the family read.
				document_version: PREVIEW_VERSION,
				arguments: {
					document_id: DOC,
					edits: [{ old_text: '$1,500', new_text: '$1,800' }]
				}
			},
			client_action: {
				kind: 'confirm_shared_document_edit',
				card_id: EFFECT,
				session_id: SESSION,
				document_title: 'Rate card',
				parent_name: 'Wayne Strategies',
				shared_with_count: 5,
				change: { lines_added: 1, lines_removed: 1 }
			}
		});
		expect(card!.client_action.change!.hunks[0]!.lines.map((line) => line.text)).toEqual([
			'Strategy session: $1,500',
			'Strategy session: $1,800'
		]);
		expect(receipt.message).toContain('Nothing has changed yet');
		expect(receipt.message).toContain('do not ask them to type yes');
		expect(receipt).not.toHaveProperty('document');
		expect(receipt).not.toHaveProperty('confirmation_token');
		// One fenced attempt in the child, then a read-only dry run in the parent.
		expect(f.runGateway).toHaveBeenCalledTimes(1);
		expect((f.runGateway.mock.calls[0] as unknown[])[0]).toMatchObject({
			scope: { project_ids: [CHILD], write_project_ids: [CHILD] }
		});
		expect(f.preview).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER,
				scope: expect.objectContaining({
					project_ids: [PARENT],
					write_project_ids: [PARENT]
				}),
				args: { document_id: DOC, edits: [{ old_text: '$1,500', new_text: '$1,800' }] }
			})
		);
		expect(f.rpc).toHaveBeenCalledWith('onto_project_family_v1', {
			p_project_id: CHILD,
			p_actor_id: ACTOR
		});
	});

	it('lists field changes with their current values', async () => {
		const f = fixture();
		const receipt = await f.adapter.execute(
			f.input({ edits: undefined, title: 'Rates 2027', state_key: 'ready' })
		);
		expect(parseSharedDocumentEditCardReceipt(receipt)!.client_action.field_changes).toEqual([
			{ field: 'title', from: 'Rate card', to: 'Rates 2027' },
			{ field: 'state', from: 'draft', to: 'ready' }
		]);
	});

	it('keeps ordinary document edits on the original fence without hierarchy reads', async () => {
		const f = fixture();
		f.runGateway.mockResolvedValue({
			ok: true,
			data: { document: { id: DOC, project_id: CHILD, title: 'Local' } }
		});
		await expect(f.adapter.execute(f.input())).resolves.toHaveProperty(
			'document.project_id',
			CHILD
		);
		expect(f.from).not.toHaveBeenCalled();
		expect(f.rpc).not.toHaveBeenCalled();
		expect(f.preview).not.toHaveBeenCalled();
	});

	it('refuses a model-supplied confirmation token before any lookup or write', async () => {
		const f = fixture();
		await expect(
			f.adapter.execute(f.input({ confirmation_token: EFFECT }))
		).rejects.toMatchObject({ disposition: 'known_failed' });
		expect(f.runGateway).not.toHaveBeenCalled();
		expect(f.preview).not.toHaveBeenCalled();
	});

	it('sends an edit that cannot apply back to the model instead of showing a card', async () => {
		const f = fixture();
		f.preview.mockResolvedValue({
			ok: false,
			error: { code: 'VALIDATION_ERROR', message: 'old_text was not found' }
		});
		await expect(f.adapter.execute(f.input())).rejects.toMatchObject({
			disposition: 'known_failed',
			message: 'old_text was not found'
		});
	});

	it('fails closed when the dry run is unavailable', async () => {
		const f = fixture();
		f.preview.mockRejectedValue(new Error('timeout'));
		await expect(f.adapter.execute(f.input())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'shared_document_preview_unavailable'
		});
	});

	it.each(['not shared', 'no write access', 'archive'])(
		'shows no card for %s',
		async (scenario) => {
			const f = fixture();
			const input = f.input(
				scenario === 'archive'
					? { edits: undefined, state_key: 'archived', archive_mode: 'archive_children' }
					: {}
			);
			if (scenario === 'not shared') f.family.shelf = [];
			if (scenario === 'no write access') f.family.parent.can_write = false;
			await expect(f.adapter.execute(input)).rejects.toMatchObject({
				disposition: 'known_failed'
			});
			expect(f.preview).not.toHaveBeenCalled();
		}
	);

	it('requires a user chat turn', async () => {
		const f = fixture();
		const input = f.input();
		(input.executionInput.claim as { userMessageId: string | null }).userMessageId = null;
		await expect(f.adapter.execute(input)).rejects.toMatchObject({
			failureCode: 'shared_document_turn_required'
		});
	});
});
