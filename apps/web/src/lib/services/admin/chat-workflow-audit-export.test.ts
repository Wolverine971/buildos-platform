// apps/web/src/lib/services/admin/chat-workflow-audit-export.test.ts
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildSessionDetailPayload } from '../../../routes/api/admin/chat/sessions/[id]/session-detail-payload';
import { buildChatSessionAuditBundleFiles } from './chat-session-audit-bundle';
import { buildChatSessionAuditMarkdown } from './chat-session-audit-export';
import type { ChatSessionAuditPayload } from './chat-session-audit-types';
import {
	buildChatWorkflowAuditPayload,
	emptyWorkflowTableCoverage
} from './chat-workflow-audit-build';
import {
	buildWorkflowAuditBundleFiles,
	buildWorkflowAuditBundleZip,
	buildWorkflowAuditMarkdown,
	buildContextFinderLines,
	buildWorkflowMermaid,
	demoteMarkdownHeadings,
	escapeMarkdownInline,
	safePathSegment
} from './chat-workflow-audit-export';
import type { WorkflowAuditRowSet } from './chat-workflow-audit-types';

const T = (s: number) => new Date(Date.UTC(2026, 8, 20, 12, 0, s)).toISOString();
const HASH = (seed: string) => seed.repeat(64).slice(0, 64);
const RUN = '11111111-1111-4111-8111-111111111111';

const rows = (): WorkflowAuditRowSet => ({
	tables: emptyWorkflowTableCoverage(),
	runs: [
		{
			turn_run_id: RUN,
			session_id: 'session-1',
			user_id: 'user-1',
			request_artifact_id: 'artifact-1',
			project_id: 'project-1',
			workflow_version: 'agentic_chat_workflow_v1',
			policy_ref: 'internal-document-organization:v4',
			policy: { version: 'v4' },
			request_hash: HASH('a'),
			phase: 'finished',
			terminal_outcome: 'partial',
			max_spend_micro_usd: 60000,
			context_id: 'ctx-1',
			context_hash: HASH('c'),
			context_accepted_at: T(5),
			evidence_versions: [
				{ kind: 'document', id: 'doc-1', version: '2026-09-20T10:00:00.000Z' },
				{ kind: 'document', id: 'doc-2', version: '2026-09-20T10:00:00.000Z' }
			],
			context_payload: { documents: [{ id: 'doc-2', title: 'Untitled | with pipe' }] },
			plan_version: 'agentic_chat_document_evidence_plan_v1',
			plan: {
				version: 'agentic_chat_document_evidence_plan_v1',
				planner: { outcome: 'accepted', stepAttemptId: 'att-p', resultHash: HASH('p') },
				steps: [
					{ key: 'planner', capability: 'plan_review', dependsOn: [] },
					{
						key: 'project_analyst',
						capability: 'project_analysis',
						dependsOn: ['planner']
					},
					{
						key: 'risk_reviewer',
						capability: 'risk_and_alternatives',
						dependsOn: ['planner', 'project_analyst']
					},
					{
						key: 'editor',
						capability: 'synthesize_review',
						dependsOn: ['project_analyst', 'risk_reviewer']
					}
				],
				assignments: {}
			},
			plan_hash: HASH('9'),
			plan_installed_at: T(8),
			answer_id: 'answer-1',
			answer_editor_step_attempt_id: 'att-e',
			answer_text: '# Answer\n\nGroup the docs. `code` and <script>alert(1)</script>',
			answer_text_sha256: HASH('f'),
			synthesis_status: 'accepted',
			synthesis_quality: 'partial',
			synthesis_accepted_at: T(50),
			created_at: T(1),
			finished_at: T(51)
		}
	],
	steps: [
		{
			turn_run_id: RUN,
			step_key: 'planner',
			status: 'accepted',
			attempts_used: 1,
			attempt_ids: ['att-p'],
			accepted_attempt_id: 'att-p',
			quality: 'complete',
			result: { assignments: {} },
			result_hash: HASH('p'),
			claimed_at: T(6),
			finished_at: T(8),
			assignment: {},
			input_evidence: null
		},
		{
			turn_run_id: RUN,
			step_key: 'project_analyst',
			status: 'accepted',
			attempts_used: 1,
			attempt_ids: ['att-o'],
			accepted_attempt_id: 'att-o',
			quality: 'complete',
			result: { summary: 'ok' },
			result_hash: HASH('1'),
			claimed_at: T(9),
			finished_at: T(20),
			assignment: { objective: 'organize' },
			input_evidence: null
		},
		{
			turn_run_id: RUN,
			step_key: 'risk_reviewer',
			status: 'failed',
			attempts_used: 2,
			attempt_ids: ['att-r1', 'att-r2'],
			failure_code: 'attempts_exhausted',
			claimed_at: T(21),
			finished_at: T(40),
			assignment: { objective: 'review' },
			input_evidence: {
				version: 'agentic_chat_document_evidence_binding_v1',
				contextId: 'ctx-1',
				contextHash: HASH('c'),
				documentReadResultHash: HASH('5'),
				organizerStatus: 'accepted'
			}
		},
		{
			turn_run_id: RUN,
			step_key: 'editor',
			status: 'accepted',
			attempts_used: 1,
			attempt_ids: ['att-e'],
			accepted_attempt_id: 'att-e',
			quality: 'partial',
			result: { ok: true },
			result_hash: HASH('6'),
			claimed_at: T(41),
			finished_at: T(50),
			assignment: {},
			input_evidence: null
		}
	],
	dispatches: [
		{
			dispatch_id: 'd1',
			turn_run_id: RUN,
			step_key: 'planner',
			step_attempt_id: 'att-p',
			physical_attempt: 1,
			dispatch_kind: 'planner',
			state: 'settled',
			model_requested: 'm',
			reserved_micro_usd: 1000,
			actual_micro_usd: 100,
			provider_request_id: 'req-1',
			reserved_at: T(6),
			settled_at: T(8),
			provider_usage: { settlementToken: 'SECRET-SETTLE', prompt_tokens: 10 }
		},
		{
			dispatch_id: 'd2',
			turn_run_id: RUN,
			step_key: 'project_analyst',
			step_attempt_id: 'att-o',
			physical_attempt: 1,
			dispatch_kind: 'specialist',
			state: 'settled',
			model_requested: 'm',
			reserved_micro_usd: 1000,
			actual_micro_usd: 200,
			reserved_at: T(9),
			settled_at: T(20)
		},
		{
			dispatch_id: 'd3',
			turn_run_id: RUN,
			step_key: 'risk_reviewer',
			step_attempt_id: 'att-r1',
			physical_attempt: 1,
			dispatch_kind: 'specialist',
			state: 'uncertain',
			model_requested: 'm',
			reserved_micro_usd: 1000,
			reserved_at: T(21),
			dispatched_at: T(21),
			uncertain_at: T(30)
		},
		{
			dispatch_id: 'd4',
			turn_run_id: RUN,
			step_key: 'risk_reviewer',
			step_attempt_id: 'att-r2',
			physical_attempt: 1,
			dispatch_kind: 'corrective',
			state: 'settled',
			model_requested: 'm',
			reserved_micro_usd: 1000,
			actual_micro_usd: 300,
			reserved_at: T(31),
			settled_at: T(40)
		},
		{
			dispatch_id: 'd5',
			turn_run_id: RUN,
			step_key: 'editor',
			step_attempt_id: 'att-e',
			physical_attempt: 1,
			dispatch_kind: 'editor',
			state: 'settled',
			model_requested: 'm',
			reserved_micro_usd: 1000,
			actual_micro_usd: 400,
			reserved_at: T(41),
			settled_at: T(50)
		}
	],
	snapshots: [
		{
			turn_run_id: RUN,
			request_hash: HASH('a'),
			snapshot_hash: HASH('s'),
			snapshot: {
				version: 'agentic_chat_specialist_snapshot_v2',
				profileId: 'document_organization',
				profileVersion: 3,
				engineVersion: 'agentic_chat_workflow_v1',
				slots: {
					project_analyst: {
						assignment: 'organize',
						definition: {
							id: 'document_organizer',
							version: 2,
							label: 'Document organizer',
							instructions: { system: 'SYSTEM PROMPT TEXT' },
							capabilities: { allowedToolIds: ['read_project_documents'] },
							modelPolicy: { primaryModel: 'm', fallbackModels: [] }
						}
					},
					risk_reviewer: {
						assignment: 'review',
						definition: {
							id: 'risk_reviewer',
							version: 2,
							label: 'Risk reviewer',
							instructions: { system: 'REVIEW PROMPT' },
							capabilities: { allowedToolIds: [] },
							modelPolicy: { primaryModel: 'm', fallbackModels: [] }
						}
					}
				}
			}
		}
	],
	readBatches: [
		{
			turn_run_id: RUN,
			request_hash: HASH('a'),
			document_ids: ['doc-1'],
			result: {
				version: 'agentic_chat_document_read_result_v1',
				documents: [
					{
						id: 'doc-1',
						status: 'read',
						title: 'Plan "quoted" [bracket]',
						version: '2026-09-20T10:00:00.000Z',
						content: 'body',
						contentHash: HASH('d'),
						fullCharacters: 4,
						truncated: false
					}
				]
			},
			result_hash: HASH('5'),
			step_attempt_id: 'att-o',
			execution_generation: 1,
			created_at: T(15)
		}
	],
	shadows: [
		{
			turn_run_id: RUN,
			request_hash: HASH('a'),
			context_id: 'ctx-1',
			context_hash: HASH('c'),
			execution_generation: 1,
			input_hash: HASH('i'),
			result_hash: HASH('r'),
			created_at: T(6),
			completed_at: T(7),
			input: {
				version: 'specialist_shadow_input_v1',
				baseline: 'document_read',
				policy: { model: 'typesafe/jev-1.13' },
				request: { candidates: [] }
			},
			result: {
				version: 'specialist_shadow_result_v1',
				status: 'observed',
				selectedBundle: 'document_read',
				recommendedBundle: 'document_read',
				agreesWithBaseline: true,
				probabilities: { document_read: 0.9 },
				usage: {
					modelRequested: 'typesafe/jev-1.13',
					costUsd: 0.00005,
					durationMs: 200,
					attempts: 1
				}
			}
		}
	],
	inputArtifacts: []
});

const sessionPayload = (withWorkflows: boolean): ChatSessionAuditPayload => {
	const detail = buildSessionDetailPayload({
		sessionRow: {
			id: 'session-1',
			user_id: 'user-1',
			title: 'Workshop docs',
			status: 'active',
			context_type: 'project',
			entity_id: 'project-1',
			created_at: T(0),
			updated_at: T(60),
			last_message_at: T(60),
			users: { id: 'user-1', email: 'dj@example.com', name: 'DJ' }
		},
		messages: [
			{ id: 'm-user', role: 'user', content: 'Organize my documents', created_at: T(0) },
			{ id: 'm-assistant', role: 'assistant', content: 'Group the docs.', created_at: T(51) }
		],
		toolExecutions: [],
		llmCalls: [
			{
				id: 'u1',
				turn_run_id: RUN,
				openrouter_request_id: 'req-1',
				total_cost_usd: 0.0001,
				created_at: T(8)
			}
		],
		operations: [],
		timingData: null,
		turnRuns: [
			{
				id: RUN,
				status: 'completed',
				request_message: 'Organize my documents',
				user_message_id: 'm-user',
				assistant_message_id: 'm-assistant',
				started_at: T(0),
				finished_at: T(51),
				created_at: T(0)
			}
		],
		promptSnapshots: [],
		turnEvents: [],
		evalRuns: [],
		evalAssertions: []
	});
	const payload: ChatSessionAuditPayload = {
		...detail,
		messages: detail.messages.map((row) => ({ ...row })),
		tool_executions: detail.tool_executions.map((row) => ({ ...row })),
		llm_calls: detail.llm_calls.map((row) => ({ ...row })),
		operations: detail.operations.map((row) => ({ ...row })),
		timing_metrics: detail.timing_metrics ? { ...detail.timing_metrics } : null,
		turn_runs: detail.turn_runs.map((run) => ({
			...run,
			prompt_snapshot: run.prompt_snapshot ? { ...run.prompt_snapshot } : null,
			events: run.events.map((event) => ({ ...event })),
			eval_runs: run.eval_runs.map((evaluation) => ({
				...evaluation,
				assertions: evaluation.assertions.map((assertion) => ({ ...assertion }))
			}))
		}))
	};
	if (withWorkflows) {
		payload.workflows = buildChatWorkflowAuditPayload({
			rows: rows(),
			turnRuns: detail.turn_runs,
			llmCalls: detail.llm_calls,
			capturedAt: T(100)
		});
	}
	return payload;
};

describe('safety helpers', () => {
	it('generates safe archive paths and escapes inline markdown', () => {
		expect(safePathSegment('../../etc/passwd')).toBe('etc-passwd');
		expect(safePathSegment('')).toBe('item');
		expect(safePathSegment('Risk Reviewer @2')).toBe('risk-reviewer-2');
		expect(escapeMarkdownInline('# Title <b>x</b> [link](y) | z')).toBe(
			'\\# Title &lt;b&gt;x&lt;/b&gt; \\[link\\](y) \\| z'
		);
	});
});

describe('demoteMarkdownHeadings', () => {
	it('nests headings outside fences only, whether the fence is one chunk or separate lines', () => {
		const section = [
			'# Report',
			'```markdown\n# inside a self-contained fence\n## still inside\n```',
			'## After the block',
			'````text',
			'## inside an open fence',
			'```',
			'# still inside (shorter fence does not close it)',
			'````',
			'###### Deepest'
		];
		expect(demoteMarkdownHeadings(section, 2)).toEqual([
			'### Report',
			'```markdown\n# inside a self-contained fence\n## still inside\n```',
			'#### After the block',
			'````text',
			'## inside an open fence',
			'```',
			'# still inside (shorter fence does not close it)',
			'````',
			'###### Deepest'
		]);
		expect(demoteMarkdownHeadings(['#hashtag not a heading'], 1)).toEqual([
			'#hashtag not a heading'
		]);
	});
});

describe('workflow-scoped export', () => {
	const payload = sessionPayload(true);
	const scope = { kind: 'workflow', turnRunId: RUN } as const;
	const files = buildWorkflowAuditBundleFiles(payload, scope);

	it('produces the documented bundle layout with per-agent folders and raw records', () => {
		const paths = Object.keys(files).sort();
		for (const expected of [
			'README.md',
			'transcript.md',
			'workflow.md',
			'flow.mmd',
			'timeline.md',
			'costs.md',
			'evidence.md',
			'agents/planner/README.md',
			'agents/project_analyst/assignment.json',
			'agents/risk_reviewer/evidence.json',
			'agents/editor/result.json',
			'raw/workflow.json',
			'raw/steps.json',
			'raw/dispatches.json',
			'raw/document_reads.json',
			'raw/specialist_snapshot.json',
			'raw/selection_shadow.json',
			'raw/coverage.json'
		]) {
			expect(paths).toContain(expected);
		}
		expect(files['README.md']).toContain('one workflow (turn run');
		// Issue text is escaped for Markdown; it still renders as risk_reviewer failed: attempts_exhausted.
		expect(files['README.md']).toContain('risk\\_reviewer failed: attempts\\_exhausted');
		expect(files['README.md']).toContain('1 dispatch(es) with uncertain cost');
		expect(files['README.md']).toContain('manifest.json');
	});

	it('renders a Mermaid graph from the saved plan with an evidence edge and a dashed shadow node', () => {
		const mermaid = files['flow.mmd']!;
		expect(mermaid.startsWith('flowchart LR')).toBe(true);
		expect(mermaid).toContain('n_step_project_analyst ==>');
		expect(mermaid).not.toContain('subgraph');
		expect(mermaid).toContain('n_shadow{{');
		expect(mermaid).toContain('class n_shadow shadow');
		expect(mermaid).not.toContain('"Plan "quoted"');
		expect(
			buildWorkflowMermaid({
				...payload.workflows!.runs[0]!,
				graph: { ...payload.workflows!.runs[0]!.graph, nodes: [], edges: [] }
			})
		).toContain('No saved plan or steps');
	});

	it('reports evidence receipt per agent and separates selector cost from the ledger', () => {
		expect(files['evidence.md']).toContain(
			'| Plan \\"quoted\\" \\[bracket\\]'.replace(/\\\\/g, '\\').slice(0, 6)
		);
		expect(files['evidence.md']).toContain('| Untitled \\| with pipe |');
		expect(files['evidence.md']).toMatch(/Document organizer.*Risk reviewer/);
		expect(files['evidence.md']).toContain('Jev shadow selection (observation only)');
		expect(files['costs.md']).toContain('Settled (paid): $0.001000');
		expect(files['costs.md']).toContain('Uncertain exposure: $0.001000 across 1 dispatch(es)');
		expect(files['costs.md']).toContain('outside the workflow budget');
		expect(files['costs.md']).toContain('| uncorrelated |');
	});

	it('includes stored prompts/assignments but never control secrets, and escapes the answer inside a fence', () => {
		const all = Object.values(files).join('\n');
		expect(all).toContain('SYSTEM PROMPT TEXT');
		expect(all).not.toContain('SECRET-SETTLE');
		expect(all).toContain('[redacted]');
		expect(files['workflow.md']).toContain('```markdown\n# Answer');
		expect(files['workflow.md']).toContain(
			'Prompt coverage: system run_snapshot; assignment stored; request not_persisted; rejected outputs not_persisted; accepted result stored'
		);
		expect(files['agents/risk_reviewer/README.md']).toContain('attempts_exhausted');
		expect(
			JSON.parse(files['agents/risk_reviewer/evidence.json']!).input_evidence
				.documentReadResultHash
		).toBe(HASH('5'));
	});

	it('zips with a manifest that keeps stored hashes apart from exported-file hashes', async () => {
		const { bytes, name, files: zipped } = await buildWorkflowAuditBundleZip(payload, scope);
		expect(name).toMatch(/^cwa-workflow-session-11111111-\d{8}T\d{6}Z$/);
		const entries = unzipSync(bytes);
		const manifestEntry = entries[`${name}/manifest.json`];
		expect(manifestEntry).toBeDefined();
		const manifest = JSON.parse(strFromU8(manifestEntry!));
		expect(manifest.schema_version).toBe('chat_workflow_audit_bundle_v1');
		expect(manifest.audit_version).toBe('chat_workflow_audit_v1');
		expect(manifest.scope).toEqual({
			kind: 'workflow',
			session_id: 'session-1',
			turn_run_id: RUN
		});
		expect(manifest.incomplete).toBe(false);
		expect(manifest.counts.dispatches).toBe(5);
		expect(manifest.counts.redactions).toBe(1);
		expect(manifest.stored_record_hashes[RUN].answer_text_sha256).toBe(HASH('f'));
		expect(manifest.stored_record_hashes[RUN].document_read_result_hashes).toEqual([HASH('5')]);
		expect(manifest.exported_file_hashes['workflow.md']).toMatch(/^[0-9a-f]{64}$/);
		expect(manifest.exported_file_hashes['workflow.md']).not.toBe(HASH('f'));
		expect(manifest.files).toContain('flow.mmd');
		expect(
			manifest.coverage.runs[RUN].some(
				(c: { scope: string }) => c.scope === 'per_attempt_prompts'
			)
		).toBe(true);
		expect(Object.keys(zipped)).toContain('manifest.json');
	});

	it('builds a single markdown report for the workflow scope', () => {
		const markdown = buildWorkflowAuditMarkdown(payload, scope);
		expect(markdown).toContain('- Scope: one workflow (turn run ' + RUN + ')');
		expect(markdown).toContain('## Workflow');
		expect(markdown).toContain('### Transcript (workflow turn');
		expect(markdown).toContain('Organize my documents');
		expect(markdown).not.toContain('SECRET-SETTLE');
		expect(markdown).toContain('## Capture coverage');
	});
	it('makes a saved specialist recommendation inspectable in the workflow export', () => {
		const selected = sessionPayload(true);
		selected.workflows!.runs[0]!.specialist_snapshot!.raw!.recommendation = {
			id: 'decision-1',
			inputHash: HASH('1'),
			resultHash: HASH('2'),
			result: {
				status: 'selected',
				selected: { name: 'Research | Synthesizer', version: 1 },
				ranking: [{ name: 'Research | Synthesizer', version: 1, probability: 0.82 }],
				costUsd: 0.0001
			}
		};
		const markdown = buildWorkflowAuditMarkdown(selected, scope);
		expect(markdown).toContain('Specialist recommendation');
		expect(markdown).toContain('Research \\| Synthesizer');
		expect(markdown).toContain('Jev recommendation cost (outside workflow cap)');
		expect(markdown).toContain('$0.000100');
	});
});

describe('whole-session export integration', () => {
	it('adds workflow folders, raw payload and manifest only when the session has workflow runs', () => {
		const plain = buildChatSessionAuditBundleFiles(sessionPayload(false));
		expect(Object.keys(plain).some((p) => p.startsWith('workflows/'))).toBe(false);
		expect(plain['manifest.json']).toBeUndefined();

		const withRuns = buildChatSessionAuditBundleFiles(sessionPayload(true));
		const paths = Object.keys(withRuns);
		expect(paths).toContain('raw/workflows.json');
		expect(paths).toContain('manifest.json');
		expect(paths.some((p) => /^workflows\/workflow-1-11111111\/workflow\.md$/.test(p))).toBe(
			true
		);
		expect(
			paths.some((p) =>
				/^workflows\/workflow-1-11111111\/agents\/editor\/README\.md$/.test(p)
			)
		).toBe(true);
		expect(withRuns['README.md']).toContain('## Workflows (1)');
		expect(withRuns['README.md']).toContain('raw/workflows.json');
		const manifest = JSON.parse(withRuns['manifest.json']!);
		expect(manifest.scope.kind).toBe('session');
		expect(manifest.counts.workflow_runs).toBe(1);
		expect(manifest.counts.ordinary_turns).toBe(0);
		expect(Object.values(withRuns).join('\n')).not.toContain('SECRET-SETTLE');
	});

	it('adds a Workflow Runs section to the single-file markdown export', () => {
		expect(buildChatSessionAuditMarkdown(sessionPayload(false))).not.toContain(
			'## Workflow Runs'
		);
		const markdown = buildChatSessionAuditMarkdown(sessionPayload(true));
		expect(markdown).toContain('## Workflow Runs (1)');
		expect(markdown).toContain('### Workflow 1 · Partial · internal-document-organization:v4');
		expect(markdown).toContain('```mermaid');
		expect(markdown).not.toContain('SECRET-SETTLE');
	});

	it('exports the whole session as a workflow-audit bundle with the ordinary transcript', () => {
		const files = buildWorkflowAuditBundleFiles(sessionPayload(true), { kind: 'session' });
		expect(Object.keys(files)).toContain('transcript.md');
		expect(Object.keys(files)).toContain('raw/messages.json');
		expect(files['README.md']).toContain(
			'whole session (all workflow turns and ordinary conversation turns)'
		);
		expect(files['README.md']).toContain('## Session coverage');
	});

	it('renders what Jev selected from the frozen checkpoint, and nothing when absent', () => {
		expect(buildContextFinderLines({ data: {} })).toEqual([]);
		const lines = buildContextFinderLines({
			data: {
				selected_evidence: {
					version: 'context_evidence_v1',
					status: 'selected',
					source: 'curated',
					policy: 'safe_v1',
					ranker: {
						status: 'ranked',
						checked: 40,
						unchecked: 2,
						durationMs: 1420,
						costUsd: 0.0011
					},
					note: 'Selected for this question.',
					full: [
						{
							kind: 'document',
							id: 'doc-1',
							title: 'Pricing | memo',
							p: 0.91,
							pinned: true,
							partial: true,
							excerpts: [
								{ heading: 'Tiers', text: 'x' },
								{ heading: null, text: 'y' }
							]
						}
					],
					summaries: [
						{ kind: 'task', id: 'task-1', title: 'Call Sam', p: 0.3, line: 'Call Sam' }
					],
					missing: [{ kind: 'goal', id: 'goal-9' }],
					coverage: { fullChars: 900, summaryChars: 40, budgetChars: 14000 }
				}
			}
		}).join('\n');
		expect(lines).toContain('### Context finder (Jev-selected evidence)');
		expect(lines).toContain('curated (edited by the user)');
		expect(lines).toContain('checked 40, unchecked 2');
		expect(lines).toContain('Pricing \\| memo');
		expect(lines).toContain('Tiers · opening');
		expect(lines).toContain('Call Sam (0.30)');
		expect(lines).toContain('Planned but no longer in the project: goal goal-9');
	});
});
