// apps/worker/tests/agenticChatTableMutationAdapter.test.ts
//
// Behavior parity for the one table-driven mutation adapter.
//
// Every case here was ported from the per-tool adapter suites it replaced
// (create/update onto task, create onto document, gateway entity, gateway
// project, gateway edge, gateway document relationship, move onto task, tag
// onto entity). The expected receipts and failure codes are unchanged: a table
// row that produces a different receipt for the same input is a regression.
import { EntityMentionPingServiceError } from '@buildos/shared-agent-ops/ops/entity-mention-ping.service';
import { TaskMoveServiceError } from '@buildos/shared-agent-ops/ontology/task-move.service';
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1,
	AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1
} from '../src/workers/agentic-chat/mutation-argument-normalizers';
import { AgenticChatMutationAdapterError } from '../src/workers/agentic-chat/mutation-executor';
import { reviewedAgenticChatGatewayMutationSpecV1 } from '../src/workers/agentic-chat/mutationToolCatalog';
import { AgenticChatTableMutationAdapter } from '../src/workers/agentic-chat/tableMutationAdapter';

const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const EFFECT_ID = '44444444-4444-4444-8444-444444444444';

type InputSpec = {
	toolName: string;
	operationName: string;
	downstreamIdempotencySupported?: boolean;
	args: Record<string, unknown>;
	/** Project id for a `project` turn context; null composes a workspace turn. */
	projectContext?: string | null;
	providerToolCallId?: string;
	userId?: string;
	overrides?: Record<string, unknown>;
};

function mutationInput(spec: InputSpec) {
	const projectId = spec.projectContext ?? null;
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: spec.toolName,
		operationName: spec.operationName,
		downstreamIdempotencySupported: spec.downstreamIdempotencySupported ?? false,
		arguments: spec.args,
		providerToolCallId: spec.providerToolCallId ?? `provider-${spec.toolName}`,
		executionInput: {
			claim: { userId: spec.userId ?? USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context:
					projectId === null
						? { type: 'workspace', entityId: null, projectId: null }
						: { type: 'project', entityId: projectId, projectId }
			},
			artifact: {
				prepared: {
					toolSurface: {
						version: 1,
						surfaceProfile: 'test_table_mutation',
						toolNames: [spec.toolName],
						definitions: [
							{
								type: 'function',
								function: {
									name: spec.toolName,
									description: 'Mutation fixture',
									parameters: { type: 'object', properties: {} }
								}
							}
						]
					}
				}
			}
		},
		signal: new AbortController().signal,
		...spec.overrides
	} as never;
}

function adapter(options: Record<string, unknown> = {}) {
	return new AgenticChatTableMutationAdapter({} as never, options as never);
}

// ---------------------------------------------------------------------------
// create_onto_task (ported from agenticChatCreateOntoTaskMutationAdapter)
// ---------------------------------------------------------------------------

describe('table row create_onto_task', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
	const TASK_ID = '33333333-3333-4333-8333-333333333333';

	function input(overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'create_onto_task',
			operationName: 'onto.task.create',
			downstreamIdempotencySupported: true,
			projectContext: PROJECT_ID,
			args: {
				project_id: PROJECT_ID,
				title: 'New task',
				assignee_handles: ['@sam'],
				plan_id: '77777777-7777-4777-8777-777777777777'
			},
			providerToolCallId: 'provider-create-1',
			...overrides
		});
	}

	function taskReceipt() {
		return {
			id: TASK_ID,
			project_id: PROJECT_ID,
			title: 'New task',
			description: null,
			type_key: 'task.default',
			state_key: 'todo',
			priority: 3,
			start_at: null,
			due_at: null,
			completed_at: null,
			props: {},
			assignees: [],
			idempotency_key: `chat-effect:${EFFECT_ID}`,
			project_name: 'Fixture project'
		};
	}

	it('passes the stable effect key through the project-fenced shared gateway', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { task: taskReceipt() }
		}));
		const port = adapter({ runGateway, taskSync: { syncTaskEvents: vi.fn() } });

		await expect(port.execute(input())).resolves.toEqual({
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'New task',
				description: null,
				type_key: 'task.default',
				state_key: 'todo',
				priority: 3,
				start_at: null,
				due_at: null,
				completed_at: null,
				props: {},
				assignees: []
			},
			message: 'Task created successfully.',
			requires_user_action: false
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				op: 'onto.task.create',
				chatSessionId: SESSION_ID,
				downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
				args: {
					project_id: PROJECT_ID,
					title: 'New task',
					assignee_handles: ['@sam'],
					plan_id: '77777777-7777-4777-8777-777777777777'
				},
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.create'],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				}
			})
		);
	});

	it('fails closed on a project mismatch before dispatch', async () => {
		const runGateway = vi.fn();
		await expect(
			adapter({ runGateway }).execute(
				input({ args: { project_id: OTHER_PROJECT_ID, title: 'Outside scope' } })
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects unsupported arguments and absent signed admission', async () => {
		const port = adapter({ runGateway: vi.fn() });
		await expect(
			port.execute(
				input({ args: { project_id: PROJECT_ID, title: 'New task', archived: true } })
			)
		).rejects.toMatchObject({ failureCode: 'mutation_arguments_not_admitted' });

		const absent = input() as any;
		absent.executionInput.artifact.prepared.toolSurface.toolNames = [];
		await expect(port.execute(absent)).rejects.toMatchObject({
			failureCode: 'mutation_tool_not_admitted'
		});
	});

	it('classifies pre-commit gateway failures as known and ambiguous outcomes as uncertain', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'FORBIDDEN', message: 'denied' }
				}))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'create_onto_task_forbidden'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => {
					throw new Error('response lost');
				})
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_task_gateway_threw'
		});
	});

	it('rejects a mismatched task receipt as an uncertain post-dispatch outcome', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: { task: { ...taskReceipt(), project_id: OTHER_PROJECT_ID } }
				}))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_task_receipt_invalid'
		});
	});

	it('exposes adapter failures with the expected typed boundary', async () => {
		await expect(
			adapter({ runGateway: vi.fn() }).execute(
				input({ overrides: { downstreamIdempotencyKey: 'changed' } })
			)
		).rejects.toBeInstanceOf(AgenticChatMutationAdapterError);
	});

	it('reports the calendar events the gateway actually created', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				task: taskReceipt(),
				calendar_sync: 'synced',
				calendar_events: [
					{
						id: '88888888-8888-4888-8888-888888888888',
						title: 'Due: New task',
						start_at: '2026-09-19T03:29:59.000Z',
						end_at: '2026-09-19T03:59:59.000Z'
					}
				]
			}
		}));
		const receipt = (await adapter({
			runGateway,
			taskSync: { syncTaskEvents: vi.fn() }
		}).execute(input())) as Record<string, unknown>;

		expect(receipt.calendar_sync).toBe('synced');
		expect(receipt.calendar_events).toEqual([
			{
				id: '88888888-8888-4888-8888-888888888888',
				title: 'Due: New task',
				start_at: '2026-09-19T03:29:59.000Z',
				end_at: '2026-09-19T03:59:59.000Z'
			}
		]);
	});

	it('admits calendar_sync as a reviewed argument and reports the skip', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { task: taskReceipt(), calendar_sync: 'skipped' }
		}));
		const receipt = (await adapter({
			runGateway,
			taskSync: { syncTaskEvents: vi.fn() }
		}).execute(
			input({
				args: {
					project_id: PROJECT_ID,
					title: 'New task',
					due_at: '2026-09-18',
					calendar_sync: 'none'
				}
			})
		)) as Record<string, unknown>;

		expect(runGateway.mock.calls[0]?.[0]).toMatchObject({
			args: expect.objectContaining({ calendar_sync: 'none' })
		});
		expect(receipt.calendar_sync).toBe('skipped');
		expect(receipt).not.toHaveProperty('calendar_events');
	});

	it('carries a removed calendar event count onto the receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				task: taskReceipt(),
				calendar_sync: 'removed',
				removed_calendar_event_count: 2
			}
		}));
		const receipt = (await adapter({
			runGateway,
			taskSync: { syncTaskEvents: vi.fn() }
		}).execute(input())) as Record<string, unknown>;

		expect(receipt.calendar_sync).toBe('removed');
		expect(receipt.removed_calendar_event_count).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// update_onto_task (ported from agenticChatUpdateOntoTaskMutationAdapter)
// ---------------------------------------------------------------------------

describe('table row update_onto_task', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
	const TASK_ID = '33333333-3333-4333-8333-333333333333';
	const ASSIGNEE_ID = '77777777-7777-4777-8777-777777777777';
	const GOAL_ID = '88888888-8888-4888-8888-888888888888';
	const MILESTONE_ID = '99999999-9999-4999-8999-999999999999';

	function input(overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'update_onto_task',
			operationName: 'onto.task.update',
			projectContext: PROJECT_ID,
			args: {
				project_id: PROJECT_ID,
				task_id: TASK_ID,
				title: 'Updated task',
				state_key: 'in_progress'
			},
			providerToolCallId: 'provider-call-1',
			...overrides
		});
	}

	function gatewayTask() {
		return {
			id: TASK_ID,
			project_id: PROJECT_ID,
			title: 'Updated task',
			description: 'Fixture task',
			type_key: 'task.default',
			state_key: 'in_progress',
			priority: 2,
			start_at: null,
			due_at: null,
			completed_at: null,
			props: {},
			project_name: 'Fixture project'
		};
	}

	it('executes the admitted canonical op through the project-fenced shared gateway', async () => {
		const runGateway = vi.fn(async () => ({ ok: true, data: { task: gatewayTask() } }));
		const port = adapter({ runGateway, taskSync: { syncTaskEvents: vi.fn() } });

		await expect(port.execute(input())).resolves.toEqual({
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'Updated task',
				description: 'Fixture task',
				type_key: 'task.default',
				state_key: 'in_progress',
				priority: 2,
				start_at: null,
				due_at: null,
				completed_at: null,
				props: {}
			},
			message: 'Task updated successfully.',
			requires_user_action: false
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				op: 'onto.task.update',
				chatSessionId: SESSION_ID,
				args: { task_id: TASK_ID, title: 'Updated task', state_key: 'in_progress' },
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.update'],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				},
				taskSync: expect.objectContaining({ syncTaskEvents: expect.any(Function) })
			})
		);
	});

	it('reports the calendar sync the gateway performed on an update', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				task: gatewayTask(),
				calendar_sync: 'synced',
				calendar_events: [{ id: GOAL_ID, title: 'Due: Updated task' }],
				removed_calendar_event_count: 1
			}
		}));
		const receipt = (await adapter({
			runGateway,
			taskSync: { syncTaskEvents: vi.fn() }
		}).execute(input())) as Record<string, unknown>;

		expect(receipt.calendar_sync).toBe('synced');
		expect(receipt.calendar_events).toEqual([{ id: GOAL_ID, title: 'Due: Updated task' }]);
		expect(receipt.removed_calendar_event_count).toBe(1);
	});

	it('admits the ratified assignment and relationship arguments without weakening the project fence', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { task: { ...gatewayTask(), assignees: [] } }
		}));
		const port = adapter({ runGateway, taskSync: { syncTaskEvents: vi.fn() } });

		await expect(
			port.execute(
				input({
					args: {
						project_id: PROJECT_ID,
						task_id: TASK_ID,
						assignee_actor_ids: [ASSIGNEE_ID],
						assignee_handles: ['@sam'],
						goal_id: GOAL_ID,
						supporting_milestone_id: MILESTONE_ID
					}
				})
			)
		).resolves.toMatchObject({
			task: { id: TASK_ID, project_id: PROJECT_ID, assignees: [] }
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				args: {
					task_id: TASK_ID,
					assignee_actor_ids: [ASSIGNEE_ID],
					assignee_handles: ['@sam'],
					goal_id: GOAL_ID,
					supporting_milestone_id: MILESTONE_ID
				},
				scope: expect.objectContaining({
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				})
			})
		);
	});

	it('rejects a changed effect key before dispatch', async () => {
		const runGateway = vi.fn();
		await expect(
			adapter({ runGateway }).execute(
				input({ overrides: { downstreamIdempotencyKey: 'chat-effect:not-the-effect' } })
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_effect_identity_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects a tool absent from the immutable admitted surface before dispatch', async () => {
		const runGateway = vi.fn();
		const absent = input() as any;
		absent.executionInput.artifact.prepared.toolSurface.toolNames = [];

		await expect(adapter({ runGateway }).execute(absent)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_tool_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects a malformed retained surface at the mutation fence before dispatch', async () => {
		const runGateway = vi.fn();
		const malformed = input() as any;
		delete malformed.executionInput.artifact.prepared.toolSurface.version;
		malformed.executionInput.artifact.prepared.toolSurface.definitions[0].function.parameters =
			{ type: 'object' };

		await expect(adapter({ runGateway }).execute(malformed)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_tool_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects an argument project outside the admitted project context', async () => {
		const runGateway = vi.fn();
		const outside = input() as any;
		outside.arguments.project_id = OTHER_PROJECT_ID;

		await expect(adapter({ runGateway }).execute(outside)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects fields outside the reviewed adapter subset before dispatch', async () => {
		const runGateway = vi.fn();
		const extra = input() as any;
		extra.arguments.archived = true;

		await expect(adapter({ runGateway }).execute(extra)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('classifies pre-commit gateway rejections as known failures', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'FORBIDDEN', message: 'Task is outside the writable scope' }
				})),
				taskSync: { syncTaskEvents: vi.fn() }
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_task_forbidden'
		});
	});

	it('classifies internal or thrown gateway outcomes as uncertain', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'INTERNAL', message: 'response lost' }
				})),
				taskSync: { syncTaskEvents: vi.fn() }
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_task_outcome_uncertain'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => {
					throw new Error('connection closed');
				}),
				taskSync: { syncTaskEvents: vi.fn() }
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_task_gateway_threw'
		});
	});

	it('treats a successful but mismatched receipt as an uncertain commit', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: { task: { ...gatewayTask(), id: ASSIGNEE_ID } }
				})),
				taskSync: { syncTaskEvents: vi.fn() }
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_task_receipt_invalid'
		});
	});

	it('does not dispatch when cancellation is already visible', async () => {
		const runGateway = vi.fn();
		const controller = new AbortController();
		controller.abort(new Error('cancelled'));

		await expect(
			adapter({ runGateway }).execute(input({ overrides: { signal: controller.signal } }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_cancelled_before_dispatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// create_onto_document (ported from agenticChatCreateOntoDocumentMutationAdapter)
// ---------------------------------------------------------------------------

describe('table row create_onto_document', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
	const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

	function input(overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'create_onto_document',
			operationName: 'onto.document.create',
			projectContext: PROJECT_ID,
			args: {
				project_id: PROJECT_ID,
				title: 'Decision log',
				description: 'Durable decisions for the project.',
				content: '# Decision log',
				parent_id: '77777777-7777-4777-8777-777777777777',
				position: 2
			},
			providerToolCallId: 'provider-create-document-1',
			...overrides
		});
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

	it('uses the project-fenced gateway once and returns the legacy-compatible receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { document: documentReceipt(), structure: { version: 3 }, structure_error: null }
		}));

		await expect(adapter({ runGateway }).execute(input())).resolves.toEqual({
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
			chatSessionId: SESSION_ID
		});
	});

	it('fails closed on project mismatch before dispatch', async () => {
		const runGateway = vi.fn();
		await expect(
			adapter({ runGateway }).execute(
				input({
					args: {
						project_id: OTHER_PROJECT_ID,
						title: 'Outside scope',
						description: 'No access'
					}
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects unsupported arguments, missing description, and absent signed admission', async () => {
		const port = adapter({ runGateway: vi.fn() });
		await expect(
			port.execute(
				input({
					args: {
						project_id: PROJECT_ID,
						title: 'New document',
						description: 'Summary',
						props: { private: true }
					}
				})
			)
		).rejects.toMatchObject({ failureCode: 'mutation_arguments_not_admitted' });

		const missingDescription = input() as any;
		delete missingDescription.arguments.description;
		await expect(port.execute(missingDescription)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const blankDescription = input() as any;
		blankDescription.arguments.description = '   ';
		await expect(port.execute(blankDescription)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const absent = input() as any;
		absent.executionInput.artifact.prepared.toolSurface.toolNames = [];
		await expect(port.execute(absent)).rejects.toMatchObject({
			failureCode: 'mutation_tool_not_admitted'
		});
	});

	it('classifies pre-commit gateway failures as known and ambiguous outcomes as uncertain', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'FORBIDDEN', message: 'denied' }
				}))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'create_onto_document_forbidden'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => {
					throw new Error('response lost');
				})
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_document_gateway_threw'
		});
	});

	it('rejects a mismatched document receipt as an uncertain post-dispatch outcome', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: { document: { ...documentReceipt(), project_id: OTHER_PROJECT_ID } }
				}))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_document_receipt_invalid'
		});
	});

	it('exposes boundary failures through the typed adapter error', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });
		await expect(
			port.execute(input({ overrides: { downstreamIdempotencyKey: 'changed' } }))
		).rejects.toBeInstanceOf(AgenticChatMutationAdapterError);
		await expect(
			port.execute(input({ downstreamIdempotencySupported: true }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_idempotency_contract_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('normalizes the legacy description, parent, and position semantics before dispatch', async () => {
		const runGateway = vi.fn(async () => ({ ok: true, data: { document: documentReceipt() } }));

		await adapter({ runGateway }).execute(
			input({
				args: {
					project_id: PROJECT_ID,
					title: 'Decision log',
					description: '  Durable decisions for the project.  ',
					parent_id: '   ',
					position: 1.5
				}
			})
		);

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

// ---------------------------------------------------------------------------
// Gateway ontology entities (ported from agenticChatGatewayEntityMutationAdapter)
// ---------------------------------------------------------------------------

describe('table rows for reviewed gateway ontology entities', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
	const ENTITY_ID = '33333333-3333-4333-8333-333333333333';
	const GOAL_ID = '44444444-4444-4444-8444-444444444444';

	type SuccessCase = {
		toolName: string;
		operationName: string;
		entityKind: 'document' | 'goal' | 'plan' | 'milestone' | 'risk';
		arguments: Record<string, unknown>;
		gatewayArguments?: Record<string, unknown>;
		entity: Record<string, unknown>;
		expectedEntity: Record<string, unknown>;
		message: string;
	};

	const SUCCESS_CASES: SuccessCase[] = [
		{
			toolName: 'update_onto_document',
			operationName: 'onto.document.update',
			entityKind: 'document',
			arguments: {
				document_id: ENTITY_ID,
				content: '\nNext section',
				update_strategy: 'append',
				props: {}
			},
			gatewayArguments: {
				document_id: ENTITY_ID,
				content: '\nNext section',
				update_strategy: 'append'
			},
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Decision log',
				props: { origin: 'external_agent', retained: true },
				project_name: 'Fixture project'
			},
			expectedEntity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Decision log',
				props: { retained: true }
			},
			message: 'Updated ontology document "Decision log"'
		},
		{
			toolName: 'create_onto_goal',
			operationName: 'onto.goal.create',
			entityKind: 'goal',
			arguments: { project_id: PROJECT_ID, name: 'Ship beta', target_date: '2026-08-31' },
			gatewayArguments: {
				project_id: PROJECT_ID,
				name: 'Ship beta',
				target_date: '2026-08-31T23:59:59.000Z'
			},
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				name: 'Ship beta',
				project_name: 'Fixture project'
			},
			expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Ship beta' },
			message: 'Created ontology goal "Ship beta"'
		},
		{
			toolName: 'update_onto_goal',
			operationName: 'onto.goal.update',
			entityKind: 'goal',
			arguments: { goal_id: ENTITY_ID, name: 'Ship stable', target_date: null },
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				name: 'Ship stable',
				project_name: 'Fixture project'
			},
			expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Ship stable' },
			message: 'Updated ontology goal "Ship stable"'
		},
		{
			toolName: 'create_onto_plan',
			operationName: 'onto.plan.create',
			entityKind: 'plan',
			arguments: { project_id: PROJECT_ID, name: 'Beta plan', plan: '# Steps' },
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				name: 'Beta plan',
				project_name: 'Fixture project'
			},
			expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Beta plan' },
			message: 'Created ontology plan "Beta plan"'
		},
		{
			toolName: 'update_onto_plan',
			operationName: 'onto.plan.update',
			entityKind: 'plan',
			arguments: { plan_id: ENTITY_ID, name: 'Stable plan' },
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				name: 'Stable plan',
				project_name: 'Fixture project'
			},
			expectedEntity: { id: ENTITY_ID, project_id: PROJECT_ID, name: 'Stable plan' },
			message: 'Updated ontology plan "Stable plan"'
		},
		{
			toolName: 'create_onto_milestone',
			operationName: 'onto.milestone.create',
			entityKind: 'milestone',
			arguments: {
				project_id: PROJECT_ID,
				title: 'Beta ready',
				goal_id: GOAL_ID,
				due_at: '2099-08-31'
			},
			gatewayArguments: {
				project_id: PROJECT_ID,
				title: 'Beta ready',
				goal_id: GOAL_ID,
				due_at: '2099-08-31T00:00:00.000Z'
			},
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Beta ready',
				type_key: 'milestone.default',
				state_key: 'pending',
				due_at: '2099-08-31T00:00:00.000Z',
				props: {},
				project_name: 'Fixture project'
			},
			expectedEntity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Beta ready',
				state_key: 'pending',
				due_at: '2099-08-31T00:00:00.000Z',
				props: {},
				effective_state_key: 'pending',
				is_missed: false,
				goal_id: GOAL_ID
			},
			message: 'Created ontology milestone "Beta ready"'
		},
		{
			toolName: 'update_onto_milestone',
			operationName: 'onto.milestone.update',
			entityKind: 'milestone',
			arguments: { milestone_id: ENTITY_ID, state_key: 'completed', due_at: null },
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Beta ready',
				type_key: 'milestone.default',
				state_key: 'completed',
				due_at: null,
				props: {},
				project_name: 'Fixture project'
			},
			expectedEntity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Beta ready',
				state_key: 'completed',
				due_at: null,
				props: {},
				effective_state_key: 'completed',
				is_missed: false
			},
			message: 'Updated ontology milestone "Beta ready"'
		},
		{
			toolName: 'create_onto_risk',
			operationName: 'onto.risk.create',
			entityKind: 'risk',
			arguments: { project_id: PROJECT_ID, title: 'Launch slip', impact: 'high' },
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Launch slip',
				impact: 'high',
				project_name: 'Fixture project'
			},
			expectedEntity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Launch slip',
				impact: 'high'
			},
			message: 'Created ontology risk "Launch slip"'
		},
		{
			toolName: 'update_onto_risk',
			operationName: 'onto.risk.update',
			entityKind: 'risk',
			arguments: { risk_id: ENTITY_ID, state_key: 'mitigated' },
			entity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Launch slip',
				state_key: 'mitigated',
				project_name: 'Fixture project'
			},
			expectedEntity: {
				id: ENTITY_ID,
				project_id: PROJECT_ID,
				title: 'Launch slip',
				state_key: 'mitigated'
			},
			message: 'Updated ontology risk "Launch slip"'
		}
	];

	function caseInput(testCase: SuccessCase, args?: Record<string, unknown>) {
		return mutationInput({
			toolName: testCase.toolName,
			operationName: testCase.operationName,
			projectContext: PROJECT_ID,
			args: args ?? testCase.arguments
		});
	}

	it.each(SUCCESS_CASES)(
		'dispatches $toolName once through the project-fenced gateway',
		async (testCase) => {
			const runGateway = vi.fn(async () => ({
				ok: true,
				data: { [testCase.entityKind]: testCase.entity }
			}));

			await expect(adapter({ runGateway }).execute(caseInput(testCase))).resolves.toEqual({
				[testCase.entityKind]: testCase.expectedEntity,
				message: testCase.message
			});
			expect(runGateway).toHaveBeenCalledOnce();
			expect(runGateway).toHaveBeenCalledWith({
				admin: {},
				userId: USER_ID,
				scope: {
					mode: 'read_write',
					allowed_ops: [testCase.operationName],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				},
				op: testCase.operationName,
				args: testCase.gatewayArguments ?? testCase.arguments,
				chatSessionId: SESSION_ID
			});
		}
	);

	it('rejects compound fields and merge_llm before gateway dispatch', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });
		const plan = SUCCESS_CASES.find((entry) => entry.toolName === 'create_onto_plan')!;
		await expect(
			port.execute(caseInput(plan, { ...plan.arguments, goal_id: GOAL_ID }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const document = SUCCESS_CASES.find((entry) => entry.toolName === 'update_onto_document')!;
		await expect(
			port.execute(
				caseInput(document, {
					document_id: ENTITY_ID,
					content: 'Merge this',
					update_strategy: 'merge_llm'
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects invalid scope, date, and create prerequisites before dispatch', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });
		const goal = SUCCESS_CASES.find((entry) => entry.toolName === 'create_onto_goal')!;
		await expect(
			port.execute(caseInput(goal, { ...goal.arguments, project_id: OTHER_PROJECT_ID }))
		).rejects.toMatchObject({ failureCode: 'mutation_project_scope_mismatch' });

		await expect(
			port.execute(caseInput(goal, { ...goal.arguments, target_date: '2026-02-31' }))
		).rejects.toMatchObject({ failureCode: 'mutation_arguments_not_admitted' });

		const milestone = SUCCESS_CASES.find(
			(entry) => entry.toolName === 'create_onto_milestone'
		)!;
		await expect(
			port.execute(caseInput(milestone, { project_id: PROJECT_ID, title: 'No parent' }))
		).rejects.toMatchObject({ failureCode: 'mutation_scope_invalid' });

		const risk = SUCCESS_CASES.find((entry) => entry.toolName === 'create_onto_risk')!;
		await expect(
			port.execute(caseInput(risk, { project_id: PROJECT_ID, title: 'No impact' }))
		).rejects.toMatchObject({ failureCode: 'mutation_arguments_not_admitted' });
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects a non-canonical target id on a reviewed update before dispatch', async () => {
		const runGateway = vi.fn();
		const goal = SUCCESS_CASES.find((entry) => entry.toolName === 'update_onto_goal')!;

		await expect(
			adapter({ runGateway }).execute(caseInput(goal, { goal_id: 'goal-1', name: 'Nope' }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_scope_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('classifies known gateway failures separately from uncertain outcomes', async () => {
		const goal = SUCCESS_CASES.find((entry) => entry.toolName === 'update_onto_goal')!;
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'FORBIDDEN', message: 'denied' }
				}))
			}).execute(caseInput(goal))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_goal_forbidden'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => {
					throw new Error('response lost');
				})
			}).execute(caseInput(goal))
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_goal_gateway_threw'
		});
	});

	it('treats a mismatched post-dispatch receipt as uncertain', async () => {
		const risk = SUCCESS_CASES.find((entry) => entry.toolName === 'update_onto_risk')!;
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: { risk: { ...risk.entity, id: GOAL_ID } }
				}))
			}).execute(caseInput(risk))
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_risk_receipt_invalid'
		});
	});
});

// ---------------------------------------------------------------------------
// update_onto_project (ported from agenticChatGatewayProjectMutationAdapter)
// ---------------------------------------------------------------------------

describe('table row update_onto_project', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';

	function input(args?: Record<string, unknown>) {
		return mutationInput({
			toolName: 'update_onto_project',
			operationName: 'onto.project.update',
			projectContext: PROJECT_ID,
			providerToolCallId: 'provider-update-project',
			args: args ?? {
				project_id: PROJECT_ID,
				name: 'Renamed project',
				description: '  Updated context  ',
				state_key: 'In Progress',
				start_at: '2026-08-11',
				end_at: null,
				props: {
					color: 'blue',
					preferences: { secret: true },
					agent_workspace: { mode: 'living_reference' }
				}
			}
		});
	}

	it('dispatches the sanitized row update once and restores the legacy receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				project: {
					id: PROJECT_ID,
					name: 'Renamed project',
					description: 'Updated context',
					state_key: 'active',
					start_at: '2026-08-11T00:00:00.000Z',
					end_at: null,
					props: {
						color: 'blue',
						preferences: { hidden: true },
						agent_workspace: { domain_profile: 'fiction_story' }
					}
				}
			}
		}));

		await expect(adapter({ runGateway }).execute(input())).resolves.toEqual({
			project: {
				id: PROJECT_ID,
				name: 'Renamed project',
				description: 'Updated context',
				state_key: 'active',
				start_at: '2026-08-11T00:00:00.000Z',
				end_at: null,
				props: { color: 'blue', agent_workspace: { domain_profile: 'fiction_story' } }
			},
			message: 'Updated ontology project "Renamed project"'
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.project.update'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.project.update',
			args: {
				project_id: PROJECT_ID,
				name: 'Renamed project',
				description: '  Updated context  ',
				state_key: 'active',
				start_at: '2026-08-11T00:00:00.000Z',
				end_at: null,
				props: { color: 'blue' }
			},
			chatSessionId: SESSION_ID
		});
	});

	it('rejects project-scope mismatch, aliases, and empty effective updates before dispatch', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });

		await expect(
			port.execute(input({ project_id: OTHER_PROJECT_ID, name: 'Outside scope' }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});

		await expect(
			port.execute(input({ project_id: PROJECT_ID, state: 'active' }))
		).rejects.toMatchObject({ failureCode: 'mutation_arguments_not_admitted' });

		await expect(
			port.execute(
				input({
					project_id: PROJECT_ID,
					props: {
						agent_workspace: { mode: 'living_reference' },
						preferences: { hidden: true }
					}
				})
			)
		).rejects.toMatchObject({ failureCode: 'mutation_arguments_not_admitted' });
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects invalid dates before dispatch', async () => {
		const runGateway = vi.fn();
		await expect(
			adapter({ runGateway }).execute(input({ project_id: PROJECT_ID, end_at: '2026-02-31' }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('separates known gateway failures from uncertain post-dispatch outcomes', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'FORBIDDEN', message: 'denied' }
				}))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_project_forbidden'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => {
					throw new Error('response lost');
				})
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_project_gateway_threw'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: { project: { id: OTHER_PROJECT_ID, name: 'Wrong project' } }
				}))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_project_receipt_invalid'
		});
	});
});

// ---------------------------------------------------------------------------
// Edges (ported from agenticChatGatewayEdgeMutationAdapter)
// ---------------------------------------------------------------------------

describe('table rows for reviewed ontology edges', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
	const TASK_ID = '33333333-3333-4333-8333-333333333333';
	const GOAL_ID = '44444444-4444-4444-8444-444444444444';
	const PLAN_ID = '55555555-5555-4555-8555-555555555555';
	const EDGE_ID = '66666666-6666-4666-8666-666666666666';

	const LINK_ARGS = {
		src_kind: 'task',
		src_id: TASK_ID,
		dst_kind: 'goal',
		dst_id: GOAL_ID,
		rel: 'Helps With',
		props: { weight: 2 }
	};

	function linkInput(args?: Record<string, unknown>, overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'link_onto_entities',
			operationName: 'onto.edge.link',
			projectContext: PROJECT_ID,
			args: args ?? LINK_ARGS,
			...overrides
		});
	}

	function unlinkInput(args?: Record<string, unknown>) {
		return mutationInput({
			toolName: 'unlink_onto_edge',
			operationName: 'onto.edge.unlink',
			projectContext: PROJECT_ID,
			args: args ?? { edge_id: EDGE_ID }
		});
	}

	function edge(overrides: Record<string, unknown> = {}) {
		return {
			id: EDGE_ID,
			project_id: PROJECT_ID,
			src_kind: 'task',
			src_id: TASK_ID,
			dst_kind: 'goal',
			dst_id: GOAL_ID,
			rel: 'supports_goal',
			props: { weight: 2, original_rel: 'helps_with' },
			...overrides
		};
	}

	it('normalizes and links one exact non-project relationship with a legacy receipt', async () => {
		const runGateway = vi.fn(async () => ({ ok: true, data: { created: 1, edge: edge() } }));

		await expect(adapter({ runGateway }).execute(linkInput())).resolves.toEqual({
			created: 1,
			edge_id: EDGE_ID,
			edge: {
				id: EDGE_ID,
				project_id: PROJECT_ID,
				src_kind: 'task',
				src_id: TASK_ID,
				dst_kind: 'goal',
				dst_id: GOAL_ID,
				rel: 'supports_goal'
			},
			message: 'Linked entities successfully.'
		});
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.edge.link'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.edge.link',
			args: {
				src_kind: 'task',
				src_id: TASK_ID,
				dst_kind: 'goal',
				dst_id: GOAL_ID,
				rel: 'supports_goal',
				props: { weight: 2, original_rel: 'helps_with' }
			},
			chatSessionId: SESSION_ID
		});
	});

	it('canonicalizes deprecated relationship direction before dispatch', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				created: 0,
				edge: edge({
					src_kind: 'plan',
					src_id: PLAN_ID,
					dst_kind: 'task',
					dst_id: TASK_ID,
					rel: 'has_task',
					props: { existing: true }
				})
			}
		}));

		await expect(
			adapter({ runGateway }).execute(
				linkInput({
					src_kind: 'task',
					src_id: TASK_ID,
					dst_kind: 'plan',
					dst_id: PLAN_ID,
					rel: 'belongs_to_plan'
				})
			)
		).resolves.toEqual({
			created: 0,
			edge_id: EDGE_ID,
			edge: {
				id: EDGE_ID,
				project_id: PROJECT_ID,
				src_kind: 'plan',
				src_id: PLAN_ID,
				dst_kind: 'task',
				dst_id: TASK_ID,
				rel: 'has_task'
			},
			message: 'Linked entities successfully.'
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				args: {
					src_kind: 'plan',
					src_id: PLAN_ID,
					dst_kind: 'task',
					dst_id: TASK_ID,
					rel: 'has_task',
					props: {}
				}
			})
		);
	});

	it('deletes one exact edge and returns the legacy public receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { deleted: true, edge_id: EDGE_ID, edge: edge() }
		}));

		await expect(adapter({ runGateway }).execute(unlinkInput())).resolves.toEqual({
			deleted: true,
			message: 'Unlinked entities successfully.'
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.edge.unlink',
				args: { edge_id: EDGE_ID },
				scope: expect.objectContaining({ project_ids: [PROJECT_ID] })
			})
		);
	});

	it('rejects project endpoints, self-links, malformed props, and invalid edge IDs before dispatch', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });

		await expect(
			port.execute(linkInput({ ...LINK_ARGS, src_kind: 'project' }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(
			port.execute(linkInput({ ...LINK_ARGS, dst_id: TASK_ID }))
		).rejects.toMatchObject({ failureCode: 'mutation_arguments_not_admitted' });
		await expect(port.execute(linkInput({ ...LINK_ARGS, props: [] }))).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(port.execute(unlinkInput({ edge_id: 'edge-1' }))).rejects.toMatchObject({
			failureCode: 'mutation_scope_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('requires an admitted project context and the one-attempt idempotency contract', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });

		await expect(
			port.execute(linkInput(undefined, { projectContext: null }))
		).rejects.toMatchObject({ failureCode: 'mutation_context_invalid' });

		await expect(
			port.execute(linkInput(undefined, { downstreamIdempotencySupported: true }))
		).rejects.toMatchObject({ failureCode: 'mutation_idempotency_contract_invalid' });
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('treats mismatched successful link and unlink receipts as uncertain', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: { created: 1, edge: edge({ rel: 'references' }) }
				}))
			}).execute(linkInput())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'link_onto_entities_receipt_invalid'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: {
						deleted: true,
						edge_id: EDGE_ID,
						edge: edge({ project_id: OTHER_PROJECT_ID })
					}
				}))
			}).execute(unlinkInput())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'unlink_onto_edge_receipt_invalid'
		});
	});

	it('keeps gateway validation failures known and thrown outcomes uncertain', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'NOT_FOUND', message: 'Edge not found' }
				}))
			}).execute(unlinkInput())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'unlink_onto_edge_not_found'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => {
					throw new Error('response lost');
				})
			}).execute(linkInput())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'link_onto_entities_gateway_threw'
		});
	});
});

// ---------------------------------------------------------------------------
// Document relationships (ported from
// agenticChatGatewayDocumentRelationshipMutationAdapter)
// ---------------------------------------------------------------------------

describe('table rows for reviewed document relationships', () => {
	const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
	const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
	const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
	const PARENT_ID = '44444444-4444-4444-8444-444444444444';
	const TASK_ID = '55555555-5555-4555-8555-555555555555';
	const EDGE_ID = '66666666-6666-4666-8666-666666666666';

	const MOVE_ARGS = {
		project_id: PROJECT_ID,
		document_id: DOCUMENT_ID,
		new_parent_id: PARENT_ID,
		new_position: 4
	};
	const ATTACH_ARGS = { task_id: TASK_ID, document_id: DOCUMENT_ID, role: ' primary ' };

	const STRUCTURE = {
		version: 7,
		root: [
			{
				id: PARENT_ID,
				order: 0,
				children: [
					{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', order: 0 },
					{ id: DOCUMENT_ID, order: 1 }
				]
			}
		]
	};

	function moveInput(args?: Record<string, unknown>, overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'move_document_in_tree',
			operationName: 'onto.document.tree.move',
			projectContext: PROJECT_ID,
			args: args ?? MOVE_ARGS,
			...overrides
		});
	}

	function attachInput(args?: Record<string, unknown>, overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'create_task_document',
			operationName: 'onto.task.docs.create_or_attach',
			downstreamIdempotencySupported: true,
			projectContext: PROJECT_ID,
			args: args ?? ATTACH_ARGS,
			...overrides
		});
	}

	it('moves one exact document and proves its returned parent and clamped position', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { project_id: PROJECT_ID, document_id: DOCUMENT_ID, structure: STRUCTURE }
		}));

		await expect(adapter({ runGateway }).execute(moveInput())).resolves.toEqual({
			structure: STRUCTURE,
			parent_id: PARENT_ID,
			parent_title: null,
			parent_created: false,
			message: `Moved document ${DOCUMENT_ID} under "${PARENT_ID}".`
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.tree.move'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.document.tree.move',
			args: MOVE_ARGS,
			chatSessionId: SESSION_ID
		});
	});

	it('attaches an existing document through the exact replayable edge identity', async () => {
		const edge = {
			id: EDGE_ID,
			project_id: PROJECT_ID,
			src_kind: 'task',
			src_id: TASK_ID,
			dst_kind: 'document',
			dst_id: DOCUMENT_ID,
			rel: 'task_has_document',
			props: { role: 'primary', created_at: '2026-08-10T12:00:00.000Z' }
		};
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				document: {
					id: DOCUMENT_ID,
					project_id: PROJECT_ID,
					title: 'Launch notes',
					project_name: 'Fixture project'
				},
				edge
			}
		}));

		await expect(adapter({ runGateway }).execute(attachInput())).resolves.toEqual({
			document: { id: DOCUMENT_ID, project_id: PROJECT_ID, title: 'Launch notes' },
			edge: {
				src_kind: 'task',
				src_id: TASK_ID,
				dst_kind: 'document',
				dst_id: DOCUMENT_ID,
				rel: 'task_has_document',
				props: edge.props
			},
			message: 'Linked document "Launch notes" to task.'
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.task.docs.create_or_attach',
				args: { task_id: TASK_ID, document_id: DOCUMENT_ID, role: 'primary' }
			})
		);
	});

	it('rejects the task-document create branch and invalid placement before dispatch', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });

		await expect(
			port.execute(moveInput({ ...MOVE_ARGS, new_parent_id: null, new_parent_title: '   ' }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(
			port.execute(
				moveInput({ ...MOVE_ARGS, new_parent_id: null, new_parent_title: 'x'.repeat(121) })
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(
			port.execute(attachInput({ task_id: TASK_ID, title: 'New document' }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(
			port.execute(moveInput({ ...MOVE_ARGS, new_position: 1.5 }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('requires the admitted project fence and rejects a mismatched move project', async () => {
		const runGateway = vi.fn();
		const port = adapter({ runGateway });

		await expect(
			port.execute(moveInput({ ...MOVE_ARGS, project_id: OTHER_PROJECT_ID }))
		).rejects.toMatchObject({ failureCode: 'mutation_project_scope_mismatch' });

		await expect(
			port.execute(attachInput(undefined, { projectContext: null }))
		).rejects.toMatchObject({ failureCode: 'mutation_context_invalid' });
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('treats an unproven tree placement or mismatched edge as uncertain', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: {
						project_id: PROJECT_ID,
						document_id: DOCUMENT_ID,
						structure: { version: 7, root: [{ id: DOCUMENT_ID, order: 0 }] }
					}
				}))
			}).execute(moveInput())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_receipt_invalid'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: true,
					data: {
						document: {
							id: DOCUMENT_ID,
							project_id: PROJECT_ID,
							title: 'Launch notes'
						},
						edge: {
							id: EDGE_ID,
							project_id: PROJECT_ID,
							src_kind: 'task',
							src_id: TASK_ID,
							dst_kind: 'document',
							dst_id: DOCUMENT_ID,
							rel: 'task_has_document',
							props: { role: 'scratch' }
						}
					}
				}))
			}).execute(attachInput())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_task_document_receipt_invalid'
		});
	});

	it('keeps gateway validation failures known and thrown outcomes uncertain', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'NOT_FOUND', message: 'Document not found' }
				}))
			}).execute(moveInput())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'move_document_in_tree_not_found'
		});

		await expect(
			adapter({
				runGateway: vi.fn(async () => {
					throw new Error('response lost');
				})
			}).execute(attachInput())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_task_document_gateway_threw'
		});
	});

	it('groups by title: passes new_parent_title through and proves the receipt parent', async () => {
		const titledStructure = {
			version: 8,
			root: [
				{
					id: PARENT_ID,
					title: 'Planning',
					order: 0,
					children: [{ id: DOCUMENT_ID, order: 0 }]
				}
			]
		};
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				parent_id: PARENT_ID,
				parent_created: true,
				structure: titledStructure
			}
		}));

		await expect(
			adapter({ runGateway }).execute(
				moveInput({
					project_id: PROJECT_ID,
					document_id: DOCUMENT_ID,
					new_parent_title: '  planning ',
					new_position: 0
				})
			)
		).resolves.toEqual({
			structure: titledStructure,
			parent_id: PARENT_ID,
			parent_title: 'Planning',
			parent_created: true,
			message: `Moved document ${DOCUMENT_ID} under "Planning" (parent document created).`
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				args: {
					project_id: PROJECT_ID,
					document_id: DOCUMENT_ID,
					new_parent_id: null,
					new_parent_title: 'planning',
					new_position: 0
				}
			})
		);
	});

	it('lets an exact parent UUID win over a title and drops the title from dispatch', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				parent_id: PARENT_ID,
				parent_created: false,
				structure: STRUCTURE
			}
		}));

		await expect(
			adapter({ runGateway }).execute(
				moveInput({ ...MOVE_ARGS, new_parent_title: 'Planning' })
			)
		).resolves.toMatchObject({ parent_id: PARENT_ID, parent_created: false });
		expect(runGateway).toHaveBeenCalledWith(expect.objectContaining({ args: MOVE_ARGS }));
	});

	it('fails closed when a title move returns no resolved parent or a differently titled one', async () => {
		const placed = {
			version: 8,
			root: [
				{
					id: PARENT_ID,
					title: 'Pricing',
					order: 0,
					children: [{ id: DOCUMENT_ID, order: 0 }]
				}
			]
		};
		const titled = () =>
			moveInput({
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				new_parent_title: 'Planning',
				new_position: 0
			});
		const portFor = (data: Record<string, unknown>) =>
			adapter({ runGateway: vi.fn(async () => ({ ok: true, data })) });

		await expect(
			portFor({
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				structure: placed
			}).execute(titled())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_receipt_invalid'
		});
		await expect(
			portFor({
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				parent_id: PARENT_ID,
				parent_created: false,
				structure: placed
			}).execute(titled())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_receipt_invalid'
		});
	});

	it('classifies a gateway failure on the title branch as uncertain, never known', async () => {
		await expect(
			adapter({
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'VALIDATION_ERROR', message: 'Parent document is not linked.' }
				}))
			}).execute(
				moveInput({
					project_id: PROJECT_ID,
					document_id: DOCUMENT_ID,
					new_parent_title: 'Planning',
					new_position: 0
				})
			)
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_title_branch_uncertain'
		});
	});
});

// ---------------------------------------------------------------------------
// move_onto_task (ported from agenticChatMoveOntoTaskMutationAdapter)
// ---------------------------------------------------------------------------

describe('table row move_onto_task', () => {
	const TASK_ID = '10000000-0000-4000-8000-000000000001';
	const SOURCE_ID = '20000000-0000-4000-8000-000000000002';
	const DESTINATION_ID = '30000000-0000-4000-8000-000000000003';
	const OTHER_PROJECT_ID = '40000000-0000-4000-8000-000000000004';

	function input(args?: Record<string, unknown>, overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'move_onto_task',
			operationName: 'onto.task.move',
			projectContext: SOURCE_ID,
			args: args ?? {
				task_id: TASK_ID,
				expected_source_project_id: SOURCE_ID,
				destination_project_id: DESTINATION_ID
			},
			...overrides
		});
	}

	function movedResult() {
		return {
			status: 'moved' as const,
			requires_user_action: false,
			task: { id: TASK_ID, title: 'Move me', project_id: DESTINATION_ID, props: {} },
			task_before: { id: TASK_ID, title: 'Move me', project_id: SOURCE_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { relationships_to_detach: 0 },
			applied: { relationships_detached: 0 }
		};
	}

	it('keeps the worker-only move operation outside the external gateway allowlist', () => {
		expect(reviewedAgenticChatGatewayMutationSpecV1('move_onto_task')).toBeNull();
		expect(reviewedAgenticChatGatewayMutationSpecV1('update_onto_task')).toMatchObject({
			operationName: 'onto.task.update'
		});
	});

	it('dispatches one worker-authorized move and restores the compact legacy receipt', async () => {
		const moveTask = vi.fn(async () => movedResult());

		await expect(adapter({ moveTask }).execute(input())).resolves.toEqual({
			status: 'moved',
			requires_user_action: false,
			task: { id: TASK_ID, title: 'Move me', project_id: DESTINATION_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { relationships_to_detach: 0 },
			applied: { relationships_detached: 0 },
			message: 'Moved task "Move me" to "Destination"',
			context_shift: {
				new_context: 'project',
				entity_id: DESTINATION_ID,
				entity_name: 'Destination',
				entity_type: 'project',
				message: 'Focused the destination project "Destination" after moving the task.'
			}
		});
		expect(moveTask).toHaveBeenCalledOnce();
		expect(moveTask).toHaveBeenCalledWith({
			client: {},
			taskId: TASK_ID,
			expectedSourceProjectId: SOURCE_ID,
			destinationProjectId: DESTINATION_ID,
			confirmationToken: null,
			caller: { kind: 'worker', userId: USER_ID },
			activity: { changedBy: USER_ID, changeSource: 'chat', chatSessionId: SESSION_ID }
		});
	});

	it('returns confirmation and blocked receipts without a context shift', async () => {
		const preview = {
			status: 'confirmation_required' as const,
			requires_user_action: true,
			confirmation_token: 'preview-token',
			message: 'Confirm exact cleanup.',
			task: { id: TASK_ID, title: 'Move me', project_id: SOURCE_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { relationships_to_detach: 1 }
		};
		await expect(
			adapter({ moveTask: vi.fn(async () => preview) }).execute(input())
		).resolves.toEqual(preview);

		const blocked = {
			status: 'blocked' as const,
			requires_user_action: true,
			blocker: 'scheduled_task_not_supported',
			message: 'Scheduled tasks cannot be moved yet.',
			task: { id: TASK_ID, title: 'Move me', project_id: SOURCE_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { is_scheduled: true }
		};
		await expect(
			adapter({ moveTask: vi.fn(async () => blocked) }).execute(input())
		).resolves.toEqual(blocked);
	});

	it('passes a confirmed token only when it is canonical', async () => {
		const moveTask = vi.fn(async () => movedResult());
		const port = adapter({ moveTask });

		await port.execute(
			input({
				task_id: TASK_ID,
				expected_source_project_id: SOURCE_ID,
				destination_project_id: DESTINATION_ID,
				confirmation_token: 'confirmed-token'
			})
		);
		expect(moveTask.mock.calls[0]?.[0]).toMatchObject({
			confirmationToken: 'confirmed-token'
		});

		await expect(
			port.execute(
				input({
					task_id: TASK_ID,
					expected_source_project_id: SOURCE_ID,
					destination_project_id: DESTINATION_ID,
					confirmation_token: ' confirmed-token '
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
	});

	it('rejects source-scope mismatches and identical projects before dispatch', async () => {
		const moveTask = vi.fn();
		const port = adapter({ moveTask });

		await expect(
			port.execute(input(undefined, { projectContext: OTHER_PROJECT_ID }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});

		await expect(
			port.execute(
				input({
					task_id: TASK_ID,
					expected_source_project_id: SOURCE_ID,
					destination_project_id: SOURCE_ID
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_scope_invalid'
		});
		expect(moveTask).not.toHaveBeenCalled();
	});

	it('separates atomic rollback failures from uncertain post-dispatch outcomes', async () => {
		await expect(
			adapter({
				moveTask: vi.fn(async () => {
					throw new TaskMoveServiceError('impact_changed', 'Impact changed');
				})
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'move_onto_task_impact_changed'
		});

		await expect(
			adapter({
				moveTask: vi.fn(async () => {
					throw new Error('response lost');
				})
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_onto_task_outcome_uncertain'
		});

		await expect(
			adapter({
				moveTask: vi.fn(async () => ({
					...movedResult(),
					task: { id: TASK_ID, project_id: SOURCE_ID }
				}))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_onto_task_receipt_invalid'
		});
	});
});

// ---------------------------------------------------------------------------
// tag_onto_entity (ported from agenticChatTagOntoEntityPingMutationAdapter)
// ---------------------------------------------------------------------------

describe('table row tag_onto_entity', () => {
	const PROJECT_ID = '10000000-0000-4000-8000-000000000001';
	const ENTITY_ID = '20000000-0000-4000-8000-000000000002';
	const RECIPIENT_ID = '30000000-0000-4000-8000-000000000003';
	const OTHER_PROJECT_ID = '70000000-0000-4000-8000-000000000007';

	function input(args?: Record<string, unknown>, overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'tag_onto_entity',
			operationName: 'x.misc.tag_onto_entity',
			projectContext: PROJECT_ID,
			args: args ?? {
				project_id: PROJECT_ID,
				entity_type: 'task',
				entity_id: ENTITY_ID,
				mode: 'ping',
				mentioned_user_ids: [RECIPIENT_ID],
				message: 'Please review.'
			},
			...overrides
		});
	}

	function pingResult() {
		return {
			project_id: PROJECT_ID,
			entity_type: 'task' as const,
			entity_id: ENTITY_ID,
			mentioned_user_ids: [RECIPIENT_ID],
			notified_user_ids: [RECIPIENT_ID]
		};
	}

	it('keeps the worker-only tag operation outside the external gateway allowlist', () => {
		expect(reviewedAgenticChatGatewayMutationSpecV1('tag_onto_entity')).toBeNull();
	});

	it('dispatches one worker-authorized ping and restores the legacy receipt', async () => {
		const pingEntity = vi.fn(async () => pingResult());

		await expect(adapter({ pingEntity }).execute(input())).resolves.toEqual({
			project_id: PROJECT_ID,
			entity_type: 'task',
			entity_id: ENTITY_ID,
			mentioned_user_ids: [RECIPIENT_ID],
			notified_user_ids: [RECIPIENT_ID],
			message: 'Tagged 1 collaborator on the task.'
		});
		expect(pingEntity).toHaveBeenCalledOnce();
		expect(pingEntity).toHaveBeenCalledWith({
			client: {},
			projectId: PROJECT_ID,
			entityType: 'task',
			entityId: ENTITY_ID,
			mentionedUserIds: [RECIPIENT_ID],
			messageSuffix: 'Please review.',
			source: 'agent_ping',
			caller: { kind: 'worker', userId: USER_ID, actorDisplayName: 'BuildOS agent' }
		});
	});

	it('rejects content mode, handles, duplicates, and project-scope mismatch before dispatch', async () => {
		const pingEntity = vi.fn();
		const port = adapter({ pingEntity });
		const base = {
			project_id: PROJECT_ID,
			entity_type: 'task',
			entity_id: ENTITY_ID,
			mode: 'ping',
			mentioned_user_ids: [RECIPIENT_ID],
			message: 'Please review.'
		};

		await expect(port.execute(input({ ...base, mode: 'content' }))).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(
			port.execute(input({ ...base, mentioned_handles: ['@dj'] }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(
			port.execute(input({ ...base, mentioned_user_ids: [RECIPIENT_ID, RECIPIENT_ID] }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		await expect(
			port.execute(input(undefined, { projectContext: OTHER_PROJECT_ID }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(pingEntity).not.toHaveBeenCalled();
	});

	it('separates pre-dispatch service failures from uncertain delivery outcomes', async () => {
		await expect(
			adapter({
				pingEntity: vi.fn(async () => {
					throw new EntityMentionPingServiceError(
						'ineligible_recipients',
						'known_failed',
						'Recipient is not an active member'
					);
				})
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'tag_onto_entity_ineligible_recipients'
		});

		await expect(
			adapter({
				pingEntity: vi.fn(async () => {
					throw new EntityMentionPingServiceError(
						'delivery_incomplete',
						'outcome_uncertain',
						'Delivery incomplete'
					);
				})
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'tag_onto_entity_delivery_incomplete'
		});

		await expect(
			adapter({
				pingEntity: vi.fn(async () => ({ ...pingResult(), notified_user_ids: [] }))
			}).execute(input())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'tag_onto_entity_receipt_invalid'
		});
	});
});

// ---------------------------------------------------------------------------
// Calendar writes (2026-09-04): four table rows on the `calendar_service`
// runner. The port itself is covered by agenticChatCalendarWritePort.test.ts;
// these cases prove the row wiring — fence, admitted arguments, receipt shape,
// and the structured reconnect/not-configured envelopes.
// ---------------------------------------------------------------------------

describe('table rows calendar writes', () => {
	const PROJECT_ID = '90000000-0000-4000-8000-000000000009';
	const OTHER_PROJECT_ID = '91000000-0000-4000-8000-000000000091';
	const EVENT_ID = '92000000-0000-4000-8000-000000000092';
	const CONNECTION_ID = '93000000-0000-4000-8000-000000000093';

	function calendarPort(result: Record<string, unknown> | (() => never)) {
		return {
			execute: vi.fn(async () => (typeof result === 'function' ? result() : result))
		};
	}

	function createInput(args: Record<string, unknown>, overrides: Partial<InputSpec> = {}) {
		return mutationInput({
			toolName: 'create_calendar_event',
			operationName: 'cal.event.create',
			projectContext: null,
			args,
			...overrides
		});
	}

	it('carries the whole calendar receipt for a synced project event', async () => {
		const calendarWrites = calendarPort({
			ok: true,
			event_id: EVENT_ID,
			google_event_id: 'google-1',
			html_link: 'https://calendar.google.com/event?eid=google-1',
			calendar_id: 'project@group.calendar.google.com',
			scope: 'project',
			synced: true,
			task_link_created: true
		});

		await expect(
			adapter({ calendarWrites }).execute(
				createInput(
					{ title: 'Kickoff', start_at: '2026-09-10T15:00:00Z', project_id: PROJECT_ID },
					{ projectContext: PROJECT_ID }
				)
			)
		).resolves.toEqual({
			ok: true,
			event_id: EVENT_ID,
			google_event_id: 'google-1',
			html_link: 'https://calendar.google.com/event?eid=google-1',
			calendar_id: 'project@group.calendar.google.com',
			scope: 'project',
			synced: true,
			task_link_created: true,
			message: 'Created the calendar event and synced it to Google.'
		});
		expect(calendarWrites.execute).toHaveBeenCalledWith({
			toolName: 'create_calendar_event',
			userId: USER_ID,
			sessionId: SESSION_ID,
			projectId: PROJECT_ID,
			arguments: {
				title: 'Kickoff',
				start_at: '2026-09-10T15:00:00Z',
				project_id: PROJECT_ID
			}
		});
	});

	it('reports a dead Google grant as data, keeping the unsynced ontology row', async () => {
		const calendarWrites = calendarPort({
			ok: false,
			error_code: 'reconnect_required',
			connection_id: CONNECTION_ID,
			event_id: EVENT_ID,
			google_event_id: null,
			html_link: null,
			calendar_id: null,
			scope: 'user',
			synced: false,
			sync_error: 'This Google Calendar account must be reconnected'
		});

		const receipt = (await adapter({ calendarWrites }).execute(
			createInput({ title: 'Dentist', start_at: '2026-09-10T15:00:00Z' })
		)) as Record<string, unknown>;

		expect(receipt).toMatchObject({
			ok: false,
			error_code: 'reconnect_required',
			connection_id: CONNECTION_ID,
			event_id: EVENT_ID,
			synced: false,
			requires_user_action: true,
			status: 'browser_handoff_required',
			sync_error: 'This Google Calendar account must be reconnected'
		});
		// Same envelope shape the Gmail connection handoff renders.
		expect(receipt.client_action).toMatchObject({
			kind: 'connect_google_calendar',
			action_id: `calendar:${CONNECTION_ID}`,
			mode: 'reconnect',
			connection_id: CONNECTION_ID,
			title: 'Reconnect Google Calendar',
			button_label: 'Reconnect Google Calendar'
		});
	});

	it('reports a worker with no Calendar OAuth deployment as not_configured', async () => {
		const calendarWrites = calendarPort({
			ok: false,
			error_code: 'not_configured',
			event_id: EVENT_ID,
			google_event_id: null,
			html_link: null,
			calendar_id: null,
			scope: 'user',
			synced: false
		});

		const receipt = (await adapter({ calendarWrites }).execute(
			createInput({ title: 'Dentist', start_at: '2026-09-10T15:00:00Z' })
		)) as Record<string, unknown>;

		expect(receipt).toMatchObject({
			ok: false,
			error_code: 'not_configured',
			connection_id: null,
			requires_user_action: false,
			synced: false
		});
		expect(receipt).not.toHaveProperty('client_action');
	});

	it('refuses attendees and reminders before the port is reached', async () => {
		const calendarWrites = calendarPort({ ok: true, event_id: EVENT_ID, synced: true });
		const port = adapter({ calendarWrites });

		for (const forbidden of ['attendees', 'reminders']) {
			await expect(
				port.execute(
					createInput({
						title: 'Kickoff',
						start_at: '2026-09-10T15:00:00Z',
						[forbidden]: ['someone@example.com']
					})
				)
			).rejects.toMatchObject({
				disposition: 'known_failed',
				failureCode: 'mutation_arguments_not_admitted'
			});
		}
		expect(calendarWrites.execute).not.toHaveBeenCalled();
	});

	it('strips attendees and reminders in the normalizer and names them on the receipt', () => {
		const context = {
			toolName: 'create_calendar_event',
			input: { arguments: {} },
			args: {
				title: 'Kickoff',
				attendees: ['someone@example.com'],
				reminders: { useDefault: true }
			},
			projectId: null,
			expected: {}
		} as never as Parameters<
			(typeof AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1)['strip_calendar_attendees_and_reminders']
		>[0];

		AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1.strip_calendar_attendees_and_reminders(
			context
		);

		expect(context.args).toEqual({ title: 'Kickoff' });
		expect(context.expected.strippedFields).toEqual(['attendees', 'reminders']);
		expect(
			AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1.calendar_event(
				{ ok: true, event_id: EVENT_ID, scope: 'user', synced: false },
				context
			)
		).toMatchObject({ stripped_fields: ['attendees', 'reminders'] });
	});

	it('never widens past the admitted project fence', async () => {
		const calendarWrites = calendarPort({ ok: true, event_id: EVENT_ID, synced: true });

		await expect(
			adapter({ calendarWrites }).execute(
				createInput(
					{ title: 'Kickoff', start_at: '2026-09-10T15:00:00Z', project_id: PROJECT_ID },
					{ projectContext: OTHER_PROJECT_ID }
				)
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(calendarWrites.execute).not.toHaveBeenCalled();
	});

	it('surfaces a membership refusal as a known failure, not an uncertain commit', async () => {
		const calendarWrites = calendarPort(() => {
			throw new AgenticChatMutationAdapterError(
				'known_failed',
				'update_calendar_event_access_denied',
				'Project not found or access denied'
			);
		});

		await expect(
			adapter({ calendarWrites }).execute(
				mutationInput({
					toolName: 'update_calendar_event',
					operationName: 'cal.event.update',
					projectContext: PROJECT_ID,
					args: { onto_event_id: EVENT_ID, title: 'Renamed' }
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_calendar_event_access_denied'
		});
	});

	it('classifies an unexpected calendar failure as an uncertain commit', async () => {
		const calendarWrites = calendarPort(() => {
			throw new Error('socket hang up');
		});

		await expect(
			adapter({ calendarWrites }).execute(
				mutationInput({
					toolName: 'delete_calendar_event',
					operationName: 'cal.event.delete',
					projectContext: PROJECT_ID,
					args: { onto_event_id: EVENT_ID }
				})
			)
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'delete_calendar_event_outcome_uncertain'
		});
	});

	it('returns the project-calendar receipt shape for set_project_calendar', async () => {
		const calendarWrites = calendarPort({
			ok: true,
			project_id: PROJECT_ID,
			calendar_id: 'project@group.calendar.google.com',
			sync_mode: 'actor_projection'
		});

		await expect(
			adapter({ calendarWrites }).execute(
				mutationInput({
					toolName: 'set_project_calendar',
					operationName: 'cal.project.set',
					projectContext: PROJECT_ID,
					args: { project_id: PROJECT_ID, name: 'Launch calendar' }
				})
			)
		).resolves.toEqual({
			ok: true,
			project_id: PROJECT_ID,
			calendar_id: 'project@group.calendar.google.com',
			sync_mode: 'actor_projection',
			message: 'Updated the project calendar.'
		});
	});

	it('requires a project id for set_project_calendar', async () => {
		const calendarWrites = calendarPort({ ok: true, project_id: PROJECT_ID });

		await expect(
			adapter({ calendarWrites }).execute(
				mutationInput({
					toolName: 'set_project_calendar',
					operationName: 'cal.project.set',
					projectContext: null,
					args: { name: 'Launch calendar' }
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_scope_invalid'
		});
		expect(calendarWrites.execute).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Table boundary
// ---------------------------------------------------------------------------

describe('table adapter boundary', () => {
	it('refuses a tool with no table row, including the custom-adapter tools', async () => {
		const port = adapter({ runGateway: vi.fn() });

		for (const toolName of ['create_onto_project', 'delegate_task', 'delete_onto_task']) {
			await expect(
				port.execute(
					mutationInput({
						toolName,
						operationName: 'onto.project.create',
						projectContext: null,
						args: {}
					})
				)
			).rejects.toMatchObject({
				disposition: 'known_failed',
				failureCode: 'mutation_adapter_not_allowlisted'
			});
		}
	});
});
