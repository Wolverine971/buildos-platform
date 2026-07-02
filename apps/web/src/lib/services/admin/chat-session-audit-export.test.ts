// apps/web/src/lib/services/admin/chat-session-audit-export.test.ts
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { buildSessionDetailPayload } from '../../../routes/api/admin/chat/sessions/[id]/session-detail-payload';
import {
	buildChatSessionAuditBundleFiles,
	buildChatSessionAuditBundleName,
	buildChatSessionAuditBundleZip
} from './chat-session-audit-bundle';
import {
	buildChatSessionAuditFilename,
	buildChatSessionAuditMarkdown,
	fetchChatSessionAuditPayload
} from './chat-session-audit-export';
import { deriveAuditGist } from './chat-session-audit-gist';
import type { ChatSessionAuditPayload } from './chat-session-audit-types';

const buildFixturePayload = (): ChatSessionAuditPayload =>
	buildSessionDetailPayload({
		sessionRow: {
			id: 'session-1',
			user_id: 'user-1',
			title: 'Test session',
			status: 'active',
			context_type: 'global',
			entity_id: null,
			message_count: 2,
			total_tokens_used: 1200,
			tool_call_count: 1,
			created_at: '2026-04-03T12:00:00.000Z',
			updated_at: '2026-04-03T12:01:00.000Z',
			last_message_at: '2026-04-03T12:01:00.000Z',
			agent_metadata: {
				fastchat_last_context_shift: {
					context_type: 'project',
					entity_id: 'project-1',
					shifted_at: '2026-04-03T12:00:30.000Z'
				}
			},
			extracted_entities: {
				libri_candidates: [
					{
						entity_type: 'book',
						display_name: 'Atomic Habits',
						canonical_query: 'Atomic Habits James Clear'
					}
				],
				extraction_version: 'libri_session_synthesis_v1',
				extracted_at: '2026-04-03T12:01:00.000Z'
			},
			users: {
				id: 'user-1',
				email: 'admin@example.com',
				name: 'Admin User'
			}
		},
		messages: [
			{
				id: 'message-user',
				role: 'user',
				content: 'What is happening with my project?',
				created_at: '2026-04-03T12:00:05.000Z'
			},
			{
				id: 'message-assistant',
				role: 'assistant',
				content: 'I checked the overview.',
				created_at: '2026-04-03T12:00:20.000Z'
			}
		],
		toolExecutions: [
			{
				id: 'tool-1',
				message_id: 'message-assistant',
				turn_run_id: 'run-1',
				stream_run_id: 'stream-1',
				client_turn_id: 'turn-1',
				tool_name: 'get_project_overview',
				tool_category: 'detail',
				gateway_op: 'util.project.overview',
				help_path: null,
				sequence_index: 1,
				success: true,
				execution_time_ms: 32,
				created_at: '2026-04-03T12:00:12.000Z',
				arguments: { query: '9takes' },
				result: { ok: true }
			}
		],
		llmCalls: [
			{
				id: 'llm-1',
				model_requested: 'gpt-5',
				model_used: 'gpt-5',
				provider: 'openrouter',
				status: 'success',
				prompt_tokens: 1000,
				completion_tokens: 200,
				total_tokens: 1200,
				total_cost_usd: 0.012,
				response_time_ms: 980,
				request_started_at: '2026-04-03T12:00:06.000Z',
				request_completed_at: '2026-04-03T12:00:18.000Z',
				created_at: '2026-04-03T12:00:18.000Z'
			}
		],
		operations: [],
		timingData: {
			id: 'timing-1',
			message_received_at: '2026-04-03T12:00:05.000Z',
			time_to_first_event_ms: 120,
			time_to_first_response_ms: 980
		},
		turnRuns: [
			{
				id: 'run-1',
				stream_run_id: 'stream-1',
				client_turn_id: 'turn-1',
				context_type: 'global',
				entity_id: 'project-1',
				project_id: 'project-1',
				gateway_enabled: true,
				request_message: 'What is happening with my project?',
				status: 'completed',
				finished_reason: 'stop',
				tool_round_count: 1,
				tool_call_count: 1,
				validation_failure_count: 0,
				llm_pass_count: 1,
				first_lane: 'overview',
				first_help_path: null,
				first_skill_path: null,
				first_canonical_op: 'util.project.overview',
				history_strategy: 'raw_history',
				history_compressed: false,
				raw_history_count: 0,
				history_for_model_count: 0,
				cache_source: 'fresh_load',
				cache_age_seconds: 0,
				request_prewarmed_context: false,
				started_at: '2026-04-03T12:00:05.000Z',
				finished_at: '2026-04-03T12:00:21.000Z',
				created_at: '2026-04-03T12:00:05.000Z',
				updated_at: '2026-04-03T12:00:21.000Z'
			},
			{
				id: 'run-2',
				stream_run_id: 'stream-2',
				client_turn_id: 'turn-2',
				context_type: 'global',
				entity_id: 'project-1',
				project_id: 'project-1',
				gateway_enabled: true,
				request_message: 'What is happening with my project?',
				status: 'completed',
				finished_reason: 'stop',
				tool_round_count: 1,
				tool_call_count: 1,
				validation_failure_count: 0,
				llm_pass_count: 1,
				first_lane: 'overview',
				first_help_path: null,
				first_skill_path: null,
				first_canonical_op: 'util.project.overview',
				history_strategy: 'raw_history',
				history_compressed: false,
				raw_history_count: 0,
				history_for_model_count: 0,
				cache_source: 'fresh_load',
				cache_age_seconds: 0,
				request_prewarmed_context: false,
				started_at: '2026-04-03T12:00:25.000Z',
				finished_at: '2026-04-03T12:00:40.000Z',
				created_at: '2026-04-03T12:00:25.000Z',
				updated_at: '2026-04-03T12:00:40.000Z'
			}
		],
		promptSnapshots: [
			{
				id: 'snapshot-1',
				turn_run_id: 'run-1',
				snapshot_version: 'fastchat_prompt_v1',
				prompt_variant: 'lite_seed_v1',
				system_prompt: 'System prompt body',
				model_messages: [{ role: 'user', content: 'What is happening with my project?' }],
				tool_definitions: [{ name: 'get_project_overview' }],
				system_prompt_chars: 4000,
				message_chars: 120,
				approx_prompt_tokens: 1030,
				rendered_dump_text: 'FASTCHAT V2 PROMPT SNAPSHOT',
				created_at: '2026-04-03T12:00:05.500Z'
			},
			{
				id: 'snapshot-2',
				turn_run_id: 'run-2',
				snapshot_version: 'fastchat_prompt_v1',
				prompt_variant: 'fastchat_prompt_v1',
				system_prompt: 'System prompt body',
				model_messages: [{ role: 'user', content: 'What is happening with my project?' }],
				tool_definitions: [{ name: 'get_project_overview' }],
				system_prompt_chars: 7600,
				message_chars: 120,
				approx_prompt_tokens: 1900,
				rendered_dump_text: 'FASTCHAT V2 PROMPT SNAPSHOT',
				created_at: '2026-04-03T12:00:25.500Z'
			}
		],
		turnEvents: [
			{
				id: 'event-1',
				turn_run_id: 'run-1',
				stream_run_id: 'stream-1',
				sequence_index: 1,
				phase: 'prompt',
				event_type: 'prompt_snapshot_created',
				payload: {
					prompt_snapshot_id: 'snapshot-1',
					approx_prompt_tokens: 1030
				},
				created_at: '2026-04-03T12:00:05.500Z'
			},
			{
				id: 'event-2',
				turn_run_id: 'run-1',
				stream_run_id: 'stream-1',
				sequence_index: 2,
				phase: 'tool',
				event_type: 'tool_result_received',
				payload: {
					tool_name: 'get_project_overview',
					canonical_op: 'util.project.overview'
				},
				created_at: '2026-04-03T12:00:12.000Z'
			}
		],
		evalRuns: [
			{
				id: 'eval-1',
				turn_run_id: 'run-1',
				scenario_slug: 'project.named_status',
				scenario_version: '1',
				runner_type: 'admin_manual',
				status: 'passed',
				summary: { assertion_counts: { passed: 6, failed: 0 } },
				started_at: '2026-04-03T12:01:00.000Z',
				completed_at: '2026-04-03T12:01:01.000Z',
				created_by: 'admin-1',
				created_at: '2026-04-03T12:01:00.000Z'
			},
			{
				id: 'eval-2',
				turn_run_id: 'run-2',
				scenario_slug: 'project.named_status',
				scenario_version: '1',
				runner_type: 'admin_manual',
				status: 'passed',
				summary: { assertion_counts: { passed: 6, failed: 0 } },
				started_at: '2026-04-03T12:01:10.000Z',
				completed_at: '2026-04-03T12:01:11.000Z',
				created_by: 'admin-1',
				created_at: '2026-04-03T12:01:10.000Z'
			}
		],
		evalAssertions: [
			{
				id: 'assert-1',
				eval_run_id: 'eval-1',
				assertion_key: 'first_lane_matches',
				status: 'passed',
				expected: 'overview',
				actual: 'overview',
				details: null,
				created_at: '2026-04-03T12:01:00.500Z'
			},
			{
				id: 'assert-2',
				eval_run_id: 'eval-2',
				assertion_key: 'first_lane_matches',
				status: 'passed',
				expected: 'overview',
				actual: 'overview',
				details: null,
				created_at: '2026-04-03T12:01:10.500Z'
			}
		]
	});

describe('chat-session-audit-export', () => {
	it('formats a gist-first markdown audit with compact tables and a raw appendix', () => {
		const markdown = buildChatSessionAuditMarkdown(buildFixturePayload());

		// Gist comes first.
		expect(markdown).toContain('# Chat Session Audit: Test session');
		expect(markdown).toContain('## TL;DR');
		expect(markdown).toContain('**Outcome:** COMPLETED');
		expect(markdown).toContain('What is happening with my project?');

		// Readable layers.
		expect(markdown).toContain('## Conversation');
		expect(markdown).toContain('## Tool Calls (1)');
		expect(markdown).toContain('get_project_overview');
		expect(markdown).toContain('## LLM Calls (1)');
		expect(markdown).toContain('## Turns (2)');
		expect(markdown).toContain('Prompt variant: lite_seed_v1');
		expect(markdown).toContain('## Timeline');

		// Prompt variant comparison preserved.
		expect(markdown).toContain('## Prompt Variant Comparison');
		expect(markdown).toContain('1 paired scenario');
		expect(markdown).toContain('Lite seed vs FastChat v2: better in 1');
		expect(markdown).toContain('project.named_status: lite better; prompt tokens -870');

		// Raw JSON lives in a single collapsed appendix (one home, no triple dup).
		expect(markdown).toContain('## Appendix: Raw Data');
		expect(markdown).toContain('<summary>Tool Executions</summary>');
		expect(markdown).toContain('"tool_name": "get_project_overview"');
		expect(markdown).toContain('Atomic Habits');

		// The gist-first file is dramatically smaller than the old dump for the
		// readable portion: the body before the appendix carries no raw payloads.
		const appendixIndex = markdown.indexOf('## Appendix: Raw Data');
		const body = markdown.slice(0, appendixIndex);
		expect(body).not.toContain('"gateway_op"');
	});

	it('builds a stable markdown filename', () => {
		const filename = buildChatSessionAuditFilename(buildFixturePayload());
		expect(filename).toMatch(/^csa-project-\d{8}T\d{6}Z\.md$/);
	});

	it('loads a session audit payload from the admin session detail endpoint', async () => {
		const payload = buildSessionDetailPayload({
			sessionRow: {
				id: 'session-2',
				user_id: 'user-2',
				title: 'Loaded session',
				status: 'active',
				context_type: 'global',
				entity_id: null,
				message_count: 0,
				total_tokens_used: 0,
				tool_call_count: 0,
				created_at: '2026-04-03T12:00:00.000Z',
				updated_at: '2026-04-03T12:00:00.000Z',
				last_message_at: null,
				agent_metadata: {},
				extracted_entities: null,
				users: { id: 'user-2', email: 'admin@example.com', name: 'Admin User' }
			},
			messages: [],
			toolExecutions: [],
			llmCalls: [],
			operations: [],
			timingData: null,
			turnRuns: [],
			promptSnapshots: [],
			turnEvents: [],
			evalRuns: [],
			evalAssertions: []
		});

		const fetcher = vi.fn<typeof fetch>().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, data: payload })
		} as Response);

		await expect(fetchChatSessionAuditPayload('session-2', fetcher)).resolves.toEqual(payload);
		expect(fetcher).toHaveBeenCalledWith('/api/admin/chat/sessions/session-2');
	});
});

describe('deriveAuditGist', () => {
	it('classifies a normal session as completed', () => {
		const gist = deriveAuditGist(buildFixturePayload());
		expect(gist.outcome).toBe('completed');
		expect(gist.outcomeLabel).toBe('COMPLETED');
		expect(gist.toolNames).toContain('get_project_overview');
		expect(gist.flags).toContain('context shift mid-session');
	});

	it('classifies a safety-limit reply as errored with forced-synthesis flags', () => {
		const payload = buildFixturePayload();
		payload.messages[1].content =
			'I hit a safety limit while coordinating tools. Please break the request into smaller steps and try again.';
		payload.messages[1].metadata = {
			llm_passes: [
				{
					pass: 5,
					model: 'deepseek',
					finished_reason: 'tool_calls',
					forced_no_tool_synthesis: true
				},
				{
					pass: 6,
					model: 'deepseek',
					finished_reason: 'tool_calls',
					forced_no_tool_synthesis: true
				}
			]
		};
		payload.turn_runs[1].finished_reason = 'tool_calls';
		payload.turn_runs[1].llm_pass_count = 6;

		const gist = deriveAuditGist(payload);
		expect(gist.outcome).toBe('errored');
		expect(gist.outcomeLabel).toBe('FAILED — safety limit');
		expect(gist.flags).toContain('forced synthesis ×2');
		expect(gist.flags).toContain('high LLM pass count (6)');
		expect(gist.flags).toContain('finished_reason=tool_calls');
	});

	it('classifies a recovered tool retry as completed with a diagnostic flag', () => {
		const payload = buildFixturePayload();
		payload.session.has_errors = true;
		payload.metrics.tool_failures = 1;
		payload.messages[1].content = 'Project created successfully.';

		const gist = deriveAuditGist(payload);
		expect(gist.outcome).toBe('completed');
		expect(gist.outcomeLabel).toBe('COMPLETED — recovered after 1 tool failure');
		expect(gist.flags).toContain('1 tool failure');
	});

	it('classifies an unrecovered tool failure as failed', () => {
		const payload = buildFixturePayload();
		payload.session.has_errors = true;
		payload.metrics.tool_failures = 1;
		payload.tool_executions = [
			{
				id: 'tool-1',
				success: false,
				tool_name: 'create_onto_project',
				gateway_op: 'onto.project.create'
			}
		];

		const gist = deriveAuditGist(payload);
		expect(gist.outcome).toBe('errored');
		expect(gist.outcomeLabel).toBe('FAILED — 1 tool failure');
	});

	it('classifies a session with no assistant reply as incomplete', () => {
		const payload = buildFixturePayload();
		payload.messages = [payload.messages[0]];
		const gist = deriveAuditGist(payload);
		expect(gist.outcome).toBe('incomplete');
	});
});

describe('chat-session-audit-bundle', () => {
	it('builds the expected set of bundle files with a gist-led README', () => {
		const files = buildChatSessionAuditBundleFiles(buildFixturePayload());

		expect(Object.keys(files)).toEqual(
			expect.arrayContaining([
				'README.md',
				'transcript.md',
				'tool-calls.md',
				'llm-calls.md',
				'timeline.md',
				'turns.md',
				'diagnostics.md',
				'capabilities.md',
				'raw/session.json',
				'raw/messages.json',
				'raw/tool_executions.json',
				'raw/llm_calls.json',
				'raw/timeline.json',
				'raw/turn_runs.json',
				'raw/turn_events.json',
				'raw/prompt_snapshots.json',
				'raw/capabilities.json'
			])
		);

		expect(files['README.md']).toContain('## TL;DR');
		expect(files['README.md']).toContain('**Outcome:** COMPLETED');
		expect(files['README.md']).toContain('## Files');
		expect(files['tool-calls.md']).toContain('## Call detail');
		expect(files['capabilities.md']).toContain('### Tools Available / Loaded');
		expect(files['capabilities.md']).toContain('get_project_overview');

		// Raw lives as real parseable JSON, not markdown-fenced.
		const toolExecRaw = JSON.parse(files['raw/tool_executions.json']);
		expect(toolExecRaw[0].tool_name).toBe('get_project_overview');

		const timelineRaw = JSON.parse(files['raw/timeline.json']);
		expect(JSON.stringify(timelineRaw)).not.toContain('FASTCHAT V2 PROMPT SNAPSHOT');

		const turnRunsRaw = JSON.parse(files['raw/turn_runs.json']);
		expect(turnRunsRaw[0].prompt_snapshot_id).toBe('snapshot-1');
		expect(turnRunsRaw[0].events).toBeUndefined();

		const promptSnapshotsRaw = JSON.parse(files['raw/prompt_snapshots.json']);
		expect(promptSnapshotsRaw[0].rendered_dump_text).toBe('FASTCHAT V2 PROMPT SNAPSHOT');

		const capabilitiesRaw = JSON.parse(files['raw/capabilities.json']);
		expect(capabilitiesRaw.tools.loaded[0].id).toBe('get_project_overview');
	});

	it('produces a valid zip that round-trips back to the source files', () => {
		const payload = buildFixturePayload();
		const folder = buildChatSessionAuditBundleName(payload);
		const zipped = buildChatSessionAuditBundleZip(payload);

		// Zip signature.
		expect(zipped[0]).toBe(0x50);
		expect(zipped[1]).toBe(0x4b);

		const entries = unzipSync(zipped);
		expect(Object.keys(entries)).toContain(`${folder}/README.md`);
		expect(strFromU8(entries[`${folder}/README.md`])).toContain('**Outcome:** COMPLETED');
		expect(JSON.parse(strFromU8(entries[`${folder}/raw/messages.json`]))).toHaveLength(2);
	});
});
