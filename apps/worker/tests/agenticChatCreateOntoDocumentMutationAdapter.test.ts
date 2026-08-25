import { describe, expect, it, vi } from 'vitest';
import { AgenticChatCreateOntoDocumentMutationAdapter } from '../src/workers/agentic-chat/createOntoDocumentMutationAdapter';
import { AgenticChatMutationAdapterError } from '../src/workers/agentic-chat/mutation-executor';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const EFFECT_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'create_onto_document',
		operationName: 'onto.document.create',
		downstreamIdempotencySupported: false,
		arguments: {
			project_id: PROJECT_ID,
			title: 'Decision log',
			description: 'Durable decisions for the project.',
			content: '# Decision log',
			parent_id: '77777777-7777-4777-8777-777777777777',
			position: 2
		},
		providerToolCallId: 'provider-create-document-1',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'test_create_document',
						toolNames: ['create_onto_document'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'create_onto_document',
									description: 'Create a document',
									parameters: { type: 'object', properties: {} }
								}
							}
						]
					}
				}
			}
		},
		signal: new AbortController().signal,
		...overrides
	} as never;
}

function documentReceipt() {
	return {
		id: DOCUMENT_ID,
		project_id: PROJECT_ID,
		title: 'Decision log',
		description: 'Durable decisions for the project.',
		type_key: 'document.default',
		state_key: 'draft',
		content: '# Decision log',
		props: { body_markdown: '# Decision log', origin: 'external_agent' },
		children: [],
		created_by: USER_ID,
		archived_at: null,
		deleted_at: null,
		project_name: 'Fixture project'
	};
}

describe('AgenticChatCreateOntoDocumentMutationAdapter', () => {
	it('uses the project-fenced gateway once and returns the legacy-compatible receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				document: documentReceipt(),
				structure: { version: 3 },
				structure_error: null
			},
			entityKind: 'document',
			entityId: DOCUMENT_ID,
			entityProjectId: PROJECT_ID,
			entityTitle: 'Decision log'
		}));
		const adapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			document: {
				id: DOCUMENT_ID,
				project_id: PROJECT_ID,
				title: 'Decision log',
				description: 'Durable decisions for the project.',
				type_key: 'document.default',
				state_key: 'draft',
				content: '# Decision log',
				props: { body_markdown: '# Decision log' },
				children: [],
				created_by: USER_ID,
				archived_at: null,
				deleted_at: null
			},
			message: 'Created ontology document "Decision log"'
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.create'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.document.create',
			args: {
				project_id: PROJECT_ID,
				title: 'Decision log',
				description: 'Durable decisions for the project.',
				content: '# Decision log',
				parent_document_id: '77777777-7777-4777-8777-777777777777',
				position: 2
			},
			callSessionId: SESSION_ID
		});
	});

	it('fails closed on project mismatch before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput() as any;
		input.arguments = {
			project_id: OTHER_PROJECT_ID,
			title: 'Outside scope',
			description: 'No access'
		};

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects unsupported arguments, missing description, and absent signed admission', async () => {
		const adapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: vi.fn() as never
		});
		const unsupported = mutationInput() as any;
		unsupported.arguments = {
			project_id: PROJECT_ID,
			title: 'New document',
			description: 'Summary',
			props: { private: true }
		};
		await expect(adapter.execute(unsupported)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const missingDescription = mutationInput() as any;
		delete missingDescription.arguments.description;
		await expect(adapter.execute(missingDescription)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const blankDescription = mutationInput() as any;
		blankDescription.arguments.description = '   ';
		await expect(adapter.execute(blankDescription)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const absent = mutationInput() as any;
		absent.executionInput.artifact.prepared.toolSurface.toolNames = [];
		await expect(adapter.execute(absent)).rejects.toMatchObject({
			failureCode: 'mutation_tool_not_admitted'
		});
	});

	it('classifies pre-commit gateway failures as known and ambiguous outcomes as uncertain', async () => {
		const knownAdapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'FORBIDDEN', message: 'denied' }
			})) as never
		});
		await expect(knownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'create_onto_document_forbidden'
		});

		const uncertainAdapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: vi.fn(async () => {
				throw new Error('response lost');
			}) as never
		});
		await expect(uncertainAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_document_gateway_threw'
		});
	});

	it('rejects a mismatched document receipt as an uncertain post-dispatch outcome', async () => {
		const adapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: { document: { ...documentReceipt(), project_id: OTHER_PROJECT_ID } }
			})) as never
		});

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_document_receipt_invalid'
		});
	});

	it('exposes boundary failures through the typed adapter error', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		await expect(
			adapter.execute(mutationInput({ downstreamIdempotencyKey: 'changed' }))
		).rejects.toBeInstanceOf(AgenticChatMutationAdapterError);
		await expect(
			adapter.execute(mutationInput({ downstreamIdempotencySupported: true }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_idempotency_contract_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('normalizes the legacy description, parent, and position semantics before dispatch', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { document: documentReceipt() }
		}));
		const adapter = new AgenticChatCreateOntoDocumentMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput() as any;
		input.arguments = {
			project_id: PROJECT_ID,
			title: 'Decision log',
			description: '  Durable decisions for the project.  ',
			parent_id: '   ',
			position: 1.5
		};

		await adapter.execute(input);

		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				args: {
					project_id: PROJECT_ID,
					title: 'Decision log',
					description: 'Durable decisions for the project.',
					parent_document_id: null
				}
			})
		);
	});
});
