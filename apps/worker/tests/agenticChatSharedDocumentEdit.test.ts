// apps/worker/tests/agenticChatSharedDocumentEdit.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatTableMutationAdapter } from '../src/workers/agentic-chat/mutations/table-adapter';
import type { MutationInput } from '../src/workers/agentic-chat/mutations/adapter-boundary';
import { createSharedDocumentConfirmationCheckPort } from '../src/workers/agentic-chat/mutations/shared-document-edit';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [USER, SESSION, CHILD, PARENT, DOC, FOLDER, EFFECT, TURN, MESSAGE, ACTOR] = Array.from(
	{ length: 10 },
	(_, n) => id(n + 1)
);
const UPDATED = '2026-09-30T12:00:00Z';
function fixture() {
	const family = {
		project_id: CHILD,
		parent: {
			id: PARENT,
			name: 'Business',
			can_write: true,
			shared_folder_document_id: FOLDER,
			child_count: 5
		},
		shelf: [{ id: DOC, title: 'Rate card', updated_at: UPDATED }],
		children: []
	};
	let effect: Record<string, unknown> | null = null;
	const from = vi.fn((table: string) => {
		const filters: Record<string, unknown> = {};
		const q = {
			select: vi.fn(() => q),
			eq: vi.fn((key, value) => {
				filters[key] = value;
				return q;
			}),
			maybeSingle: vi.fn(async () => {
				const row = table === 'onto_actors' ? { id: ACTOR, user_id: USER } : effect;
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
		async (params: any): Promise<any> =>
			params.scope.project_ids[0] === PARENT
				? {
						ok: true,
						data: { document: { id: DOC, project_id: PARENT, title: 'Rate card' } }
					}
				: { ok: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }
	);
	const client = { from, rpc } as never;
	const adapter = new AgenticChatTableMutationAdapter(client, { runGateway });
	const input = (confirmed = false, args: Record<string, unknown> = {}): MutationInput =>
		({
			effectId: confirmed ? id(11) : EFFECT,
			downstreamIdempotencyKey: `chat-effect:${confirmed ? id(11) : EFFECT}`,
			toolName: 'update_onto_document',
			operationName: 'onto.document.update',
			downstreamIdempotencySupported: false,
			providerToolCallId: 'tool-call',
			arguments: {
				document_id: DOC,
				content: 'New rates',
				...(confirmed ? { confirmation_token: EFFECT } : {}),
				...args
			},
			executionInput: {
				claim: {
					userId: USER,
					sessionId: SESSION,
					turnRunId: confirmed ? id(12) : TURN,
					userMessageId: confirmed ? id(13) : MESSAGE
				},
				timingBaseline: { admittedAt: confirmed ? '2026-09-30T12:02:00Z' : UPDATED },
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
	async function preview() {
		const receipt = await adapter.execute(input());
		effect = {
			id: EFFECT,
			user_id: USER,
			session_id: SESSION,
			turn_run_id: TURN,
			finished_at: '2026-09-30T12:01:00Z',
			state: 'succeeded',
			tool_name: 'update_onto_document',
			operation_name: 'onto.document.update',
			downstream_receipt: receipt
		};
		runGateway.mockClear();
		return receipt;
	}
	return {
		family,
		from,
		rpc,
		runGateway,
		adapter,
		client,
		input,
		preview,
		get effect() {
			return effect!;
		}
	};
}

describe('shared-document confirmation boundary', () => {
	it('returns a no-write warning with the full child count and user-resolved actor', async () => {
		const f = fixture();
		const result = await f.preview();
		expect(result).toMatchObject({
			status: 'confirmation_required',
			requires_user_action: true,
			confirmation_token: EFFECT,
			shared_document: { parent_project_id: PARENT, shared_with_count: 5 }
		});
		expect(result).not.toHaveProperty('document');
		expect(result.message).toContain('Nothing was changed');
		expect(f.rpc).toHaveBeenCalledWith('onto_project_family_v1', {
			p_project_id: CHILD,
			p_actor_id: ACTOR
		});
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
	});
	it('allows the exact later-turn edit only to its parent, without forwarding the token or cached access', async () => {
		const f = fixture();
		await f.preview();
		await expect(f.adapter.execute(f.input(true))).resolves.toHaveProperty(
			'document.project_id',
			PARENT
		);
		expect(f.runGateway).toHaveBeenCalledTimes(1);
		expect(f.runGateway.mock.calls[0]![0]).toMatchObject({
			scope: { project_ids: [PARENT], write_project_ids: [PARENT] },
			documentWriteGuard: { documentId: DOC, projectId: PARENT, updatedAt: UPDATED },
			args: { document_id: DOC, content: 'New rates' }
		});
		expect(f.runGateway.mock.calls[0]![0].args).not.toHaveProperty('confirmation_token');
		expect(f.runGateway.mock.calls[0]![0]).not.toHaveProperty('memo');
	});
	it.each([
		'same turn',
		'same user message',
		'another user',
		'another session',
		'future receipt',
		'expired',
		'changed edit',
		'changed document',
		'changed count',
		'wrong token',
		'uncommitted receipt'
	])('rejects %s before any write', async (scenario) => {
		const f = fixture();
		await f.preview();
		const input = f.input(true);
		switch (scenario) {
			case 'same turn':
				input.executionInput.claim.turnRunId = TURN;
				break;
			case 'same user message':
				input.executionInput.claim.userMessageId = MESSAGE;
				break;
			case 'another user':
				f.effect.user_id = id(99);
				break;
			case 'another session':
				f.effect.session_id = id(99);
				break;
			case 'future receipt':
				f.effect.finished_at = '2026-09-30T12:03:00Z';
				break;
			case 'expired':
				input.executionInput.timingBaseline.admittedAt = '2026-10-02T12:03:00Z';
				break;
			case 'changed edit':
				input.arguments.content = 'Other rates';
				break;
			case 'changed document':
				f.family.shelf[0]!.updated_at = '2026-09-30T12:01:30Z';
				break;
			case 'changed count':
				f.family.parent.child_count++;
				break;
			case 'wrong token':
				input.arguments.confirmation_token = id(99);
				break;
			case 'uncommitted receipt':
				f.effect.state = 'started';
				break;
		}
		await expect(f.adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed'
		});
		expect(f.runGateway).not.toHaveBeenCalled();
	});
	it.each(['not shared', 'no write access', 'different parent', 'archive'])(
		'rejects %s without widening the fence',
		async (scenario) => {
			const f = fixture();
			await f.preview();
			const input = f.input(true);
			if (scenario === 'not shared') f.family.shelf = [];
			if (scenario === 'no write access') f.family.parent.can_write = false;
			if (scenario === 'different parent') f.family.parent.id = id(99);
			if (scenario === 'archive') input.arguments.state_key = 'archived';
			await expect(f.adapter.execute(input)).rejects.toMatchObject({
				disposition: 'known_failed'
			});
			expect(f.runGateway).not.toHaveBeenCalled();
		}
	);
	it('classifies a guarded CAS conflict as known failed without retrying', async () => {
		const f = fixture();
		await f.preview();
		f.runGateway.mockResolvedValue({
			ok: false,
			error: { code: 'CONFLICT', message: 'Changed', details: { confirmation_changed: true } }
		});
		await expect(f.adapter.execute(f.input(true))).rejects.toMatchObject({
			disposition: 'known_failed',
			retryable: false
		});
		expect(f.runGateway).toHaveBeenCalledTimes(1);
	});
	it('rejects reuse after the successful edit changes the document version', async () => {
		const f = fixture();
		await f.preview();
		await f.adapter.execute(f.input(true));
		f.family.shelf[0]!.updated_at = '2026-09-30T12:02:30Z';
		f.runGateway.mockClear();
		await expect(f.adapter.execute(f.input(true))).rejects.toMatchObject({
			failureCode: 'shared_document_confirmation_changed'
		});
		expect(f.runGateway).not.toHaveBeenCalled();
	});

	describe('pre-review check', () => {
		const check = (f: ReturnType<typeof fixture>, input: MutationInput) =>
			createSharedDocumentConfirmationCheckPort(f.client).check({
				executionInput: input.executionInput,
				args: { ...input.arguments }
			});
		const dispatchFailure = async (f: ReturnType<typeof fixture>, input: MutationInput) => {
			const error = await f.adapter.execute(input).then(
				() => null,
				(caught: { failureCode: string; message: string }) => caught
			);
			return error && { code: error.failureCode, message: error.message };
		};

		it('passes the exact later-turn edit without writing, then dispatch still re-checks', async () => {
			const f = fixture();
			await f.preview();
			f.from.mockClear();
			// drop_empty_props runs before hashing at dispatch; the check must match it.
			const input = f.input(true, { props: {} });
			await expect(check(f, input)).resolves.toBeNull();
			expect(f.runGateway).not.toHaveBeenCalled();
			expect(f.from.mock.calls.map(([table]) => table)).toEqual([
				'onto_actors',
				'chat_turn_effects'
			]);
			await expect(f.adapter.execute(input)).resolves.toHaveProperty(
				'document.project_id',
				PARENT
			);
			expect(f.from.mock.calls.filter(([table]) => table === 'chat_turn_effects')).toHaveLength(
				2
			);
		});

		it.each([
			'same turn',
			'same user message',
			'another session',
			'expired',
			'changed edit',
			'changed document',
			'wrong token',
			'not shared',
			'archive'
		])('fails %s with the identical dispatch error and no write', async (scenario) => {
			const f = fixture();
			await f.preview();
			const input = f.input(true);
			switch (scenario) {
				case 'same turn':
					input.executionInput.claim.turnRunId = TURN;
					break;
				case 'same user message':
					input.executionInput.claim.userMessageId = MESSAGE;
					break;
				case 'another session':
					f.effect.session_id = id(99);
					break;
				case 'expired':
					input.executionInput.timingBaseline.admittedAt = '2026-10-02T12:03:00Z';
					break;
				case 'changed edit':
					input.arguments.content = 'Other rates';
					break;
				case 'changed document':
					f.family.shelf[0]!.updated_at = '2026-09-30T12:01:30Z';
					break;
				case 'wrong token':
					input.arguments.confirmation_token = id(99);
					break;
				case 'not shared':
					f.family.shelf = [];
					break;
				case 'archive':
					input.arguments.state_key = 'archived';
					break;
			}
			const early = await check(f, input);
			expect(early).not.toBeNull();
			expect(early).toEqual(await dispatchFailure(f, input));
			expect(f.runGateway).not.toHaveBeenCalled();
		});

		it('leaves undecidable infrastructure failures to the dispatch check', async () => {
			const f = fixture();
			await f.preview();
			f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } } as never);
			await expect(check(f, f.input(true))).resolves.toBeNull();
			expect(f.runGateway).not.toHaveBeenCalled();
		});
	});
});
