// apps/worker/tests/projectLoopGenerators.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildTaskConflictCandidatePairs,
	buildHeuristicProjectManagerBrief,
	generateDrift,
	generateProjectBrief,
	generateProjectManagerBrief,
	generateTaskConflicts,
	type LoopContext,
	type ProjectReviewSynthesisCandidate
} from '../src/workers/project-loop/generators';
import type { SmartLLMService } from '../src/lib/services/smart-llm-service';

function makeContext(): LoopContext {
	return {
		projectId: 'project-1',
		projectName: 'Launch',
		projectDescription: 'Ship v1',
		goals: [{ name: 'Public launch', description: 'Get the first release out' }],
		docStructureSummary: '- Launch plan',
		documents: [
			{
				id: 'doc-1',
				title: 'Launch plan',
				type_key: 'document.plan',
				state_key: 'active',
				description: 'Current launch plan',
				updated_at: '2026-06-22T00:00:00.000Z',
				parent_id: null
			}
		],
		tasks: [
			{
				id: 'task-1',
				title: 'Publish launch announcement',
				state_key: 'todo',
				updated_at: '2026-06-22T00:00:00.000Z'
			},
			{
				id: 'task-2',
				title: 'Publish announcement draft',
				state_key: 'todo',
				updated_at: '2026-06-23T00:00:00.000Z'
			}
		],
		priorDecisions: []
	};
}

function makeLlm(response: unknown): SmartLLMService {
	return {
		getJSONResponse: vi.fn().mockResolvedValue(response)
	} as unknown as SmartLLMService;
}

function makeTrackedLlm(response: unknown): {
	llm: SmartLLMService;
	getJSONResponse: ReturnType<typeof vi.fn>;
} {
	const getJSONResponse = vi.fn().mockResolvedValue(response);
	return {
		llm: { getJSONResponse } as unknown as SmartLLMService,
		getJSONResponse
	};
}

const onUsage = vi.fn(async () => undefined);

function makeReviewCandidates(): ProjectReviewSynthesisCandidate[] {
	return [
		{
			id: 'suggestion-1',
			kind: 'doc_org',
			risk_tier: 2,
			title: 'Choose canonical project documents, then consolidate or expand them',
			rationale: 'The launch plan and launch notes cover the same work.',
			why_now: 'Complete audit follow-up for documentation_quality.',
			evidence_refs: [
				{
					entity_type: 'document',
					entity_id: 'doc-1',
					title: 'Launch plan',
					reason: 'Contains the current launch milestones.'
				}
			],
			operations: [
				{
					tool: 'update_onto_document',
					args: { document_id: 'doc-1', props: { title: 'Launch plan' } },
					label: 'Update document'
				}
			],
			reversible: true,
			verified_change_headline: 'Keep Launch plan as the main launch document'
		},
		{
			id: 'suggestion-2',
			kind: 'doc_org',
			risk_tier: 1,
			title: 'Old launch notes may be stale',
			rationale: 'The notes predate the current launch plan.',
			why_now: null,
			evidence_refs: [
				{
					entity_type: 'document',
					entity_id: 'doc-2',
					title: 'Old launch notes',
					reason: 'Predates the current plan.'
				}
			],
			operations: [],
			reversible: null
		}
	];
}

describe('project loop generators', () => {
	it('passes project loop attribution to suggestion LLM calls', async () => {
		const { llm, getJSONResponse } = makeTrackedLlm({ suggestions: [] });

		await generateTaskConflicts({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			chatSessionId: 'chat-1',
			runId: 'run-1',
			onUsage
		});

		expect(getJSONResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				operationType: 'project_loop_task_conflicts',
				projectId: 'project-1',
				chatSessionId: 'chat-1',
				metadata: expect.objectContaining({
					project_loop: true,
					project_loop_run_id: 'run-1',
					project_loop_generator: 'project_loop_task_conflicts',
					onto_project_id: 'project-1'
				})
			})
		);
		expect(getJSONResponse.mock.calls[0]?.[0]?.userPrompt).toContain(
			'Candidate pairs to classify:'
		);
		expect(getJSONResponse.mock.calls[0]?.[0]?.userPrompt).toContain('[task-1]');
		expect(getJSONResponse.mock.calls[0]?.[0]?.userPrompt).toContain('[task-2]');
	});

	it('shortlists likely task-conflict candidate pairs deterministically', () => {
		const pairs = buildTaskConflictCandidatePairs([
			{
				id: 'task-1',
				title: 'Publish launch announcement',
				description: null,
				state_key: 'todo',
				updated_at: '2026-06-22T00:00:00.000Z',
				goal_names: ['Public launch']
			},
			{
				id: 'task-2',
				title: 'Publish announcement draft',
				description: null,
				state_key: 'todo',
				updated_at: '2026-06-23T00:00:00.000Z',
				goal_names: ['Public launch']
			},
			{
				id: 'task-3',
				title: 'Set up analytics dashboard',
				description: null,
				state_key: 'todo',
				updated_at: '2026-06-24T00:00:00.000Z'
			}
		]);

		expect(pairs).toEqual([
			expect.objectContaining({
				taskAId: 'task-1',
				taskBId: 'task-2',
				reasons: expect.arrayContaining(['same goal linkage'])
			})
		]);
	});

	it('skips the task-conflict LLM call when no deterministic candidate pairs exist', async () => {
		const { llm, getJSONResponse } = makeTrackedLlm({ suggestions: [] });
		const ctx: LoopContext = {
			...makeContext(),
			tasks: [
				{
					id: 'task-1',
					title: 'Publish launch announcement',
					description: null,
					state_key: 'todo',
					updated_at: '2026-06-22T00:00:00.000Z'
				},
				{
					id: 'task-2',
					title: 'Set up analytics dashboard',
					description: null,
					state_key: 'todo',
					updated_at: '2026-06-23T00:00:00.000Z'
				}
			]
		};

		const suggestions = await generateTaskConflicts({
			llm,
			ctx,
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toEqual([]);
		expect(getJSONResponse).not.toHaveBeenCalled();
	});

	it('passes project loop attribution to brief LLM calls', async () => {
		const { llm, getJSONResponse } = makeTrackedLlm({
			brief: {
				current_goal: 'Ship v1',
				recent_changes: ['Launch plan updated'],
				open_decisions: [],
				stale_assumptions: [],
				contradictions_or_drift: [],
				next_best_action: 'Publish the announcement'
			}
		});

		await generateProjectBrief({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			chatSessionId: 'chat-1',
			runId: 'run-1',
			onUsage
		});

		expect(getJSONResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				operationType: 'project_loop_brief',
				projectId: 'project-1',
				chatSessionId: 'chat-1',
				metadata: expect.objectContaining({
					project_loop: true,
					project_loop_brief: true,
					project_loop_run_id: 'run-1',
					project_loop_generator: 'project_loop_brief',
					onto_project_id: 'project-1'
				})
			})
		);
	});

	it('produces a decision-first manager brief with reversible candidate clusters', () => {
		const brief = buildHeuristicProjectManagerBrief({
			ctx: makeContext(),
			candidates: makeReviewCandidates(),
			now: new Date('2026-08-14T12:00:00.000Z')
		});

		expect(brief).toMatchObject({
			version: 2,
			attention_level: 'decision',
			decision: {
				recommended_suggestion_id: 'suggestion-1',
				candidate_ids: ['suggestion-1']
			},
			candidate_ids: ['suggestion-1', 'suggestion-2'],
			cluster_members: [
				{
					label: expect.any(String),
					member_candidate_ids: ['suggestion-1', 'suggestion-2']
				}
			]
		});
		expect(brief.bottom_line).toContain('Launch plan');
		expect(brief.issues?.[0]?.evidence_refs).toEqual([
			expect.objectContaining({ entity_id: 'doc-1', title: 'Launch plan' })
		]);
	});

	it('does not admit a review that contains only minor notes', () => {
		const candidate = makeReviewCandidates()[1];
		const brief = buildHeuristicProjectManagerBrief({
			ctx: makeContext(),
			candidates: candidate ? [candidate] : []
		});

		expect(brief.attention_level).toBe('minor');
		expect(brief.decision).toBeNull();
		expect(brief.no_attention_reason).toContain('minor');
	});

	it('rejects academic audit copy, unknown ids, and model attempts to hide a decision', async () => {
		const candidates = makeReviewCandidates();
		const brief = await generateProjectManagerBrief({
			llm: makeLlm({
				brief: {
					attention_level: 'minor',
					bottom_line: 'Complete audit follow-up for documentation_quality.',
					recommendation:
						'Choose the canonical project documents, then consolidate or expand them.',
					decision: {
						question: 'What do you want to do?',
						recommendation: 'Choose the canonical documents.',
						why_user_needed: 'Complete audit follow-up.',
						options: [],
						recommended_option_id: null,
						recommended_suggestion_id: 'invented-suggestion',
						candidate_ids: ['invented-suggestion']
					},
					issues: [],
					decision_item_ids: ['invented-suggestion'],
					safe_cleanup_item_ids: [],
					no_attention_reason: 'Nothing important.'
				}
			}),
			ctx: makeContext(),
			candidates,
			userId: 'user-1',
			onUsage
		});

		expect(brief.attention_level).toBe('decision');
		expect(brief.bottom_line).not.toContain('audit follow-up');
		expect(brief.recommendation).not.toContain('canonical');
		expect(brief.decision?.recommended_suggestion_id).toBe('suggestion-1');
		expect(brief.candidate_ids).toEqual(['suggestion-1', 'suggestion-2']);
		expect(brief.decision_item_ids).toEqual([]);
	});

	it('turns task conflicts into reversible non-destructive task flags', async () => {
		const suggestions = await generateTaskConflicts({
			llm: makeLlm({
				suggestions: [
					{
						title: 'Duplicate launch announcement tasks',
						rationale: 'Both tasks describe the same publishing work.',
						why_now: 'The launch project has two active announcement tasks.',
						confidence: 0.82,
						evidence_refs: [
							{ entity_type: 'task', entity_id: 'task-1', reason: 'Same outcome' },
							{ entity_type: 'task', entity_id: 'task-2', reason: 'Same outcome' }
						],
						preview: {
							kind: 'task_merge',
							summary: 'Flag task-1 as a likely duplicate of task-2.',
							impact: 'No task is deleted or completed.'
						},
						operations: [
							{
								tool: 'update_onto_task',
								args: {
									task_id: 'task-1',
									props: {
										loop_flagged_conflict: true,
										loop_conflict_kind: 'duplicate',
										loop_conflict_with_task_id: 'task-2',
										loop_conflict_reason:
											'Both tasks ask for launch announcement publishing.'
									}
								},
								label: 'Flag likely duplicate'
							}
						]
					}
				]
			}),
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]).toMatchObject({
			kind: 'task_conflict',
			risk_tier: 1,
			reversible: true,
			operations: [
				{
					tool: 'update_onto_task',
					args: {
						task_id: 'task-1',
						project_id: 'project-1',
						props: {
							loop_flagged_conflict: true,
							loop_conflict_kind: 'duplicate',
							loop_conflict_with_task_id: 'task-2'
						}
					}
				}
			],
			undo_operations: [
				{
					tool: 'update_onto_task',
					args: {
						task_id: 'task-1',
						project_id: 'project-1',
						props: {
							loop_flagged_conflict: false,
							loop_conflict_kind: null,
							loop_conflict_with_task_id: null,
							loop_conflict_reason: null
						}
					}
				}
			]
		});
	});

	it('drops task conflict suggestions with unknown task ids', async () => {
		const suggestions = await generateTaskConflicts({
			llm: makeLlm({
				suggestions: [
					{
						title: 'Unknown task conflict',
						evidence_refs: [
							{ entity_type: 'task', entity_id: 'task-1', reason: 'Known' },
							{ entity_type: 'task', entity_id: 'task-2', reason: 'Known' }
						],
						operations: [
							{
								tool: 'update_onto_task',
								args: {
									task_id: 'task-missing',
									props: { loop_flagged_conflict: true }
								}
							}
						]
					}
				]
			}),
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toEqual([]);
	});

	it('drops task conflict suggestions with unknown paired task ids', async () => {
		const suggestions = await generateTaskConflicts({
			llm: makeLlm({
				suggestions: [
					{
						title: 'Unknown paired task conflict',
						evidence_refs: [
							{ entity_type: 'task', entity_id: 'task-1', reason: 'Known' },
							{ entity_type: 'task', entity_id: 'task-2', reason: 'Known' }
						],
						operations: [
							{
								tool: 'update_onto_task',
								args: {
									task_id: 'task-1',
									props: {
										loop_flagged_conflict: true,
										loop_conflict_kind: 'duplicate',
										loop_conflict_with_task_id: 'task-missing'
									}
								}
							}
						]
					}
				]
			}),
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toEqual([]);
	});

	it('drops task conflict suggestions when evidence does not match the flagged pair', async () => {
		const ctx: LoopContext = {
			...makeContext(),
			tasks: [
				...makeContext().tasks,
				{
					id: 'task-3',
					title: 'Prepare launch metrics',
					state_key: 'todo',
					updated_at: '2026-06-24T00:00:00.000Z'
				}
			]
		};

		const suggestions = await generateTaskConflicts({
			llm: makeLlm({
				suggestions: [
					{
						title: 'Mismatched evidence conflict',
						evidence_refs: [
							{ entity_type: 'task', entity_id: 'task-1', reason: 'Known' },
							{ entity_type: 'task', entity_id: 'task-2', reason: 'Known' }
						],
						operations: [
							{
								tool: 'update_onto_task',
								args: {
									task_id: 'task-1',
									props: {
										loop_flagged_conflict: true,
										loop_conflict_kind: 'duplicate',
										loop_conflict_with_task_id: 'task-3'
									}
								}
							}
						]
					}
				]
			}),
			ctx,
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toEqual([]);
	});

	it('emits drift as an evidence-backed no-op review item', async () => {
		const suggestions = await generateDrift({
			llm: makeLlm({
				suggestions: [
					{
						title: 'Launch scope drifted toward research',
						rationale:
							'The project says ship v1, but recent artifacts are research-heavy.',
						why_now:
							'The current review found active shipping tasks and research docs.',
						confidence: 0.7,
						evidence_refs: [
							{ entity_type: 'document', entity_id: 'doc-1', reason: 'Current plan' }
						],
						preview: {
							kind: 'drift',
							summary:
								'Decide whether launch or research is the current project priority.'
						},
						operations: []
					}
				]
			}),
			ctx: makeContext(),
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]).toMatchObject({
			kind: 'drift',
			risk_tier: 2,
			reversible: true,
			operations: [],
			undo_operations: [],
			evidence_refs: [{ entity_type: 'document', entity_id: 'doc-1', title: 'Launch plan' }]
		});
	});
});
