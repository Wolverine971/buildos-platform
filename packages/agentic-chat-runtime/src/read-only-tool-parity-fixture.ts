// packages/agentic-chat-runtime/src/read-only-tool-parity-fixture.ts
import type { AgenticChatParityRunV1 } from './parity';

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
					description: 'Deterministic parity fixture.',
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
				description: 'Deterministic parity fixture.',
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

/**
 * Legacy three-round read success (Slice 18 S3 instrument change). The rounds
 * exercise three distinct production tools and pin the legacy project-overview
 * envelope on both adapters before the synthesis round answers.
 */
export const AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1: AgenticChatParityRunV1 = {
	events: [
		{
			type: 'turn_phase',
			phase: 'stream',
			payload: {
				message: 'Request received. Preparing the workspace context...',
				turn_phase: 'acknowledged'
			}
		},
		{
			type: 'session',
			phase: 'stream',
			payload: {
				session: {
					agent_metadata: {},
					id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.request.sessionId,
					summary: null
				}
			}
		},
		{
			type: 'context_usage',
			phase: 'stream',
			payload: {
				usage: {
					estimatedTokens: 12,
					lastCompressedAt: null,
					lastCompression: null,
					status: 'ok',
					tokenBudget: 1000,
					tokensRemaining: 988,
					usagePercent: 1
				}
			}
		},
		{
			type: 'agent_state',
			phase: 'stream',
			payload: {
				activity_visibility: 'activity_log',
				contextType: 'global',
				details: 'Planning the first step...',
				state: 'thinking'
			}
		},
		{
			type: 'tool_call',
			phase: 'tool',
			payload: {
				tool_call: {
					function: {
						arguments: JSON.stringify(
							AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.arguments
						),
						name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name
					},
					id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.callId,
					type: 'function'
				}
			}
		},
		{
			type: 'tool_result',
			phase: 'tool',
			payload: {
				result: {
					affected_entities: [],
					duration_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.durationMs,
					result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.result,
					success: true,
					tokens_consumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.tokensConsumed,
					tool_category: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.toolCategory,
					tool_call_id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.callId,
					tool_name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name
				}
			}
		},
		{
			type: 'tool_call',
			phase: 'tool',
			payload: {
				tool_call: {
					function: {
						arguments: JSON.stringify(
							AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.arguments
						),
						name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.name
					},
					id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.callId,
					type: 'function'
				}
			}
		},
		{
			type: 'tool_result',
			phase: 'tool',
			payload: {
				result: {
					affected_entities: [],
					duration_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.durationMs,
					result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.result,
					success: true,
					tokens_consumed:
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.tokensConsumed,
					tool_category: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.toolCategory,
					tool_call_id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.callId,
					tool_name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.name
				}
			}
		},
		{
			type: 'tool_call',
			phase: 'tool',
			payload: {
				tool_call: {
					function: {
						arguments: JSON.stringify(
							AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.arguments
						),
						name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.name
					},
					id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.callId,
					type: 'function'
				}
			}
		},
		{
			type: 'tool_result',
			phase: 'tool',
			payload: {
				result: {
					affected_entities: [],
					duration_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.durationMs,
					result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.result,
					success: true,
					tokens_consumed:
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.tokensConsumed,
					tool_category: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.toolCategory,
					tool_call_id: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.callId,
					tool_name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.name
				}
			}
		},
		{
			type: 'assistant_text',
			phase: 'llm',
			payload: { content: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText }
		},
		{
			type: 'turn_phase',
			phase: 'stream',
			payload: { message: 'Finalizing the response...', turn_phase: 'finalizing' }
		},
		{
			type: 'last_turn_context',
			phase: 'finalize',
			payload: {
				context: {
					context_type: 'global',
					data_accessed: [
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name,
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.name,
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.name
					],
					entities: {
						project_id: 'da000000-0000-4000-8000-000000000001',
						projects: [
							{
								id: 'da000000-0000-4000-8000-000000000001',
								name: 'Fixture project',
								description: 'Deterministic parity fixture.'
							}
						],
						task_ids: ['db000000-0000-4000-8000-000000000002'],
						tasks: [
							{
								id: 'db000000-0000-4000-8000-000000000002',
								name: 'Fixture task'
							}
						]
					},
					summary: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText,
					timestamp: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'timing',
			phase: 'finalize',
			payload: {
				timing: {
					assistant_persisted_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					bypassed_context_cache: false,
					cache_age_seconds: 0,
					cache_source: 'fresh_load',
					context_load_source: 'none',
					context_ready_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					done_emitted_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					finished_reason: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.finishedReason,
					first_event_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					first_response_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					history_composed_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					history_compressed: false,
					history_for_model_count: 0,
					history_loaded_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					history_strategy: 'raw_history',
					phases: {
						assistant_persist_ms: 0,
						context_build_ms: 0,
						finalization_ms: 0,
						history_compose_ms: 0,
						history_load_ms: 0,
						prepared_prompt_consume_ms: 0,
						request_to_context_ready_ms: 0,
						response_generation_ms: 0,
						session_resolve_ms: 0,
						time_to_first_event_ms: 0,
						time_to_first_response_ms: 0,
						tool_selection_ms: 0,
						total_request_ms: 0,
						turn_admission_ms: 0
					},
					raw_history_count: 0,
					request_started_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso,
					session_resolved_at: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'done',
			phase: 'finalize',
			payload: {
				answer_source: 'model',
				completion_status: 'completed',
				finished_reason: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.finishedReason,
				usage: {
					completion_tokens:
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage.completionTokens,
					prompt_tokens:
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage.promptTokens,
					total_tokens: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage.totalTokens
				}
			}
		}
	],
	messages: [
		{ content: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.request.message, role: 'user' },
		{
			content: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText,
			metadata: { answer_source: 'model', completion_status: 'completed' },
			role: 'assistant'
		}
	],
	toolExecutions: [
		{
			affected_entities: [],
			arguments: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.arguments,
			execution_time_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.durationMs,
			message_linked: true,
			result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.result,
			sequence_index: 1,
			success: true,
			tokens_consumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.tokensConsumed,
			tool_category: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.toolCategory,
			tool_name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name
		},
		{
			affected_entities: [],
			arguments: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.arguments,
			execution_time_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.durationMs,
			message_linked: true,
			result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.result,
			sequence_index: 2,
			success: true,
			tokens_consumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.tokensConsumed,
			tool_category: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.toolCategory,
			tool_name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.name
		},
		{
			affected_entities: [],
			arguments: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.arguments,
			execution_time_ms: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.durationMs,
			message_linked: true,
			result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.result,
			sequence_index: 3,
			success: true,
			tokens_consumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.tokensConsumed,
			tool_category: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.toolCategory,
			tool_name: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.name
		}
	],
	checkpoints: [],
	outcome: {
		assistant_message_linked: true,
		finished_reason: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.finishedReason,
		status: 'completed',
		tool_call_count: 3,
		tool_round_count: 3,
		total_tokens: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage.totalTokens
	},
	metadata: {
		admission: { context_type: 'global', status: 'running', user_message_linked: true },
		lifecycle_events: [
			{ event_type: 'turn_intent_resolved', phase: 'prompt' },
			{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
			{ event_type: 'tool_call_emitted', phase: 'tool' },
			{ event_type: 'first_tool_call_planning_cue_emitted', phase: 'stream' },
			{ event_type: 'tool_result_received', phase: 'tool' },
			{ event_type: 'tool_call_emitted', phase: 'tool' },
			{ event_type: 'tool_result_received', phase: 'tool' },
			{ event_type: 'tool_call_emitted', phase: 'tool' },
			{ event_type: 'tool_result_received', phase: 'tool' },
			{ event_type: 'turn_phase_changed', phase: 'stream' },
			{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
			{ event_type: 'orchestration_interventions', phase: 'finalize' },
			{ event_type: 'done_emitted', phase: 'finalize' },
			{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
		],
		prompt_snapshot_count: 1
	}
};
