// apps/worker/tests/fixtures/agenticChatTurnFixtures.ts
//
// Deterministic turn inputs for the worker turn-executor suite. These were the
// input halves of the retired two-engine parity fixtures
// (`@buildos/agentic-chat-runtime` `*-parity-fixture.ts`, retired 2026-09-04 in
// the one-engine cutover); the legacy golden runs and the diff machinery that
// compared them are gone. Nothing here describes a second engine — they are
// just fixed request/response/tool payloads the executor tests drive.

export const AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:00:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Snapshot this lifecycle',
		contextType: 'global'
	},
	response: {
		assistantText: 'Hello back.',
		finishedReason: 'stop',
		usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 }
	}
} as const;

const READ_ONLY_CONTEXT_SHIFT_V1 = {
	new_context: 'project',
	entity_id: 'da000000-0000-4000-8000-000000000001',
	entity_name: 'Fixture project',
	entity_type: 'project',
	message: 'Focused on Fixture project.'
} as const;

export const AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:00:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Review the fixture workspace, project, and tasks',
		contextType: 'global'
	},
	tool: {
		callId: 'read-tool-call-1',
		name: 'get_workspace_overview',
		arguments: { project_limit: 8 },
		result: {
			generated_at: '2026-08-04T12:00:00.000Z',
			scope: 'workspace',
			projects_returned: 1,
			maybe_more: false,
			snapshot: {
				returned_projects: 1,
				total_accessible_projects: 1,
				project_limit: 8,
				has_more_projects: false,
				totals_scope: 'returned_projects'
			},
			totals: {
				projects: 1,
				active_tasks: 1,
				blocked_tasks: 0,
				overdue_tasks: 0,
				due_soon_tasks: 0,
				open_milestones: 0,
				open_plans: 0,
				open_risks: 0,
				upcoming_events: 0,
				collaborators: 0
			},
			entity_totals: {
				projects: 1,
				tasks: 1,
				documents: 0,
				plans: 0,
				goals: 0,
				collaborators: 0
			},
			projects: [
				{
					project_id: 'da000000-0000-4000-8000-000000000001',
					name: 'Fixture project',
					state_key: 'active',
					description: 'Deterministic worker turn fixture.',
					next_step_short: 'Review the ready task',
					updated_at: '2026-08-04T11:00:00.000Z',
					counts: {
						active_tasks: 1,
						blocked_tasks: 0,
						overdue_tasks: 0,
						due_soon_tasks: 0,
						open_milestones: 0,
						open_plans: 0,
						open_risks: 0,
						upcoming_events: 0,
						collaborators: 0
					},
					entity_counts: {
						tasks: 1,
						documents: 0,
						plans: 0,
						goals: 0,
						collaborators: 0
					},
					next_milestone: null,
					next_event: null,
					recent_activity: []
				}
			],
			message:
				'Workspace overview prepared for 1 of 1 accessible project. Returned snapshot totals cover these project.'
		},
		durationMs: 11,
		tokensConsumed: 7,
		toolCategory: 'read'
	},
	validationFailure: {
		callId: 'read-tool-call-invalid-2',
		name: 'get_project_overview',
		arguments: {},
		error: 'Tool validation failed: Missing required parameter: project_id',
		toolCategory: 'read'
	},
	secondTool: {
		callId: 'read-tool-call-2',
		name: 'get_project_overview',
		arguments: { project_id: 'da000000-0000-4000-8000-000000000001' },
		result: {
			generated_at: '2026-08-04T12:00:00.000Z',
			scope: 'project',
			match: {
				status: 'resolved',
				project_id: 'da000000-0000-4000-8000-000000000001',
				query: null
			},
			project: {
				id: 'da000000-0000-4000-8000-000000000001',
				name: 'Fixture project',
				state_key: 'active',
				description: 'Deterministic worker turn fixture.',
				start_at: null,
				end_at: null,
				next_step_short: 'Review the ready task',
				updated_at: '2026-08-04T11:00:00.000Z'
			},
			counts: {
				active_tasks: 1,
				blocked_tasks: 0,
				overdue_tasks: 0,
				due_soon_tasks: 0,
				open_milestones: 0,
				open_plans: 0,
				open_risks: 0,
				upcoming_events: 0,
				collaborators: 0
			},
			entity_counts: {
				tasks: 1,
				documents: 0,
				plans: 0,
				goals: 0,
				collaborators: 0
			},
			tasks: [
				{
					id: 'db000000-0000-4000-8000-000000000002',
					title: 'Fixture task',
					state_key: 'todo',
					priority: 2,
					due_at: null,
					updated_at: '2026-08-04T11:30:00.000Z'
				}
			],
			milestones: [],
			collaborators: { count: 0, members: [], truncated: false },
			risks: [],
			upcoming_events: [],
			recent_activity: [],
			context_shift: READ_ONLY_CONTEXT_SHIFT_V1,
			message: 'Project overview prepared for Fixture project.'
		},
		durationMs: 12,
		tokensConsumed: 9,
		toolCategory: 'read'
	},
	thirdTool: {
		callId: 'read-tool-call-3',
		name: 'list_onto_tasks',
		arguments: { project_id: 'da000000-0000-4000-8000-000000000001' },
		result: {
			tasks: [
				{
					id: 'db000000-0000-4000-8000-000000000002',
					project_id: 'da000000-0000-4000-8000-000000000001',
					title: 'Fixture task',
					description: null,
					type_key: 'task.default',
					state_key: 'todo',
					priority: 2,
					start_at: null,
					due_at: null,
					completed_at: null,
					props: {},
					project_name: 'Fixture project'
				}
			],
			total: 1,
			message: 'Found 1 ontology tasks. Use get_onto_task_details for full information.'
		},
		durationMs: 8,
		tokensConsumed: 5,
		toolCategory: 'search'
	},
	response: {
		assistantText: 'The fixture workspace has one active project and one ready task.',
		finishedReason: 'stop',
		usage: { promptTokens: 10, completionTokens: 6, totalTokens: 16 }
	}
};

const PROJECT_ID = 'da000000-0000-4000-8000-000000000001';
const TASK_ID = 'db000000-0000-4000-8000-000000000002';

export const AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:00:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Rename the fixture task and move it into progress',
		contextType: 'project',
		entityId: PROJECT_ID
	},
	tool: {
		logicalOperationId: 'c3000000-0000-4000-8000-00000000003c',
		callId: 'mutation-tool-call-1',
		name: 'update_onto_task',
		operationName: 'onto.task.update',
		arguments: {
			project_id: PROJECT_ID,
			task_id: TASK_ID,
			title: 'Updated fixture task',
			state_key: 'in_progress'
		},
		result: {
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'Updated fixture task',
				description: 'Deterministic worker turn fixture.',
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
		},
		executionTimeMs: null,
		tokensConsumed: null,
		requiresUserAction: false,
		toolCategory: 'ontology_action',
		affectedEntities: [
			{
				kind: 'task',
				id: TASK_ID,
				title: 'Updated fixture task',
				projectId: PROJECT_ID,
				operation: 'updated',
				url: `/projects/${PROJECT_ID}?entity=task&entity_id=${TASK_ID}`
			}
		],
		downstreamIdempotencySupported: false
	},
	response: {
		assistantText: 'Updated the fixture task and moved it into progress.',
		finishedReason: 'stop',
		usage: { promptTokens: 10, completionTokens: 6, totalTokens: 16 }
	}
} as const;

export const AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:05:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Stop after a partial response',
		contextType: 'global'
	},
	response: {
		assistantText: 'Partial answer.',
		finishedReason: 'cancelled',
		interruptedReason: 'cancelled',
		usage: null
	}
} as const;

export const AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:10:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Fail after a partial provider response',
		contextType: 'global'
	},
	response: {
		assistantText: 'Discarded partial.',
		finishedReason: 'error',
		publicError: 'An error occurred while streaming.',
		usage: { total_tokens: 0 }
	}
} as const;

export const AGENTIC_CHAT_TIMEOUT_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:15:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Exceed the provider deadline before returning a response',
		contextType: 'global'
	},
	response: {
		finishedReason: 'error',
		publicError: 'An error occurred while streaming.',
		usage: { total_tokens: 0 }
	}
} as const;
