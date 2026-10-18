// apps/worker/tests/projectLoopGenerators.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	generateDocOrganization,
	generateDrift,
	generateTaskConflicts,
	type LoopContext,
	withoutRadarOwnedFindings
} from '../src/workers/project-loop/generators';
import type { SmartLLMService } from '../src/lib/services/smart-llm-service';
import { PROJECT_LOOP_JSON_PROVIDER_ORDER_RESOLVED } from '../src/config/projectLoops';
import { ProjectReviewLanguageError } from '../src/workers/project-loop/reviewLanguage';

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
				description: null,
				state_key: 'todo',
				updated_at: '2026-06-22T00:00:00.000Z'
			},
			{
				id: 'task-2',
				title: 'Publish announcement draft',
				description: null,
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

/** Jev's shortlist (taskPairs.ts), as the worker passes it in. */
const PAIR_1_2 = [
	{ taskAId: 'task-1', taskBId: 'task-2', score: 0.9, reasons: ['review relevance 0.90'] }
];

describe('project loop generators', () => {
	it('passes project loop attribution to suggestion LLM calls', async () => {
		const { llm, getJSONResponse } = makeTrackedLlm({ suggestions: [] });
		const controller = new AbortController();

		await generateTaskConflicts({
			candidatePairs: PAIR_1_2,
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			chatSessionId: 'chat-1',
			runId: 'run-1',
			signal: controller.signal,
			onUsage
		});

		expect(getJSONResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				signal: controller.signal,
				providerRouting: PROJECT_LOOP_JSON_PROVIDER_ORDER_RESOLVED.length
					? {
							order: PROJECT_LOOP_JSON_PROVIDER_ORDER_RESOLVED,
							allow_fallbacks: true
						}
					: undefined,
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

	it('skips the task-conflict LLM call when Jev shortlists no pairs', async () => {
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
			candidatePairs: [],
			llm,
			ctx,
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toEqual([]);
		expect(getJSONResponse).not.toHaveBeenCalled();
	});

	it('retries Chinese detector prose once without losing attribution or usage tracking', async () => {
		const english = {
			title: 'Missing installation tasks',
			rationale: 'Installation work is missing from the plan.',
			evidence_refs: [{ entity_type: 'project', title: 'Launch' }],
			operations: []
		};
		const { llm, getJSONResponse } = makeTrackedLlm({ suggestions: [english] });
		getJSONResponse.mockResolvedValueOnce({
			suggestions: [{ ...english, title: '任务集不完整，缺少关键施工安装步骤' }]
		});
		const suggestions = await generateDrift({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			runId: 'run-1',
			onUsage
		});

		expect(suggestions[0]?.title).toBe(english.title);
		expect(getJSONResponse).toHaveBeenCalledTimes(2);
		for (const [attempt, [request]] of getJSONResponse.mock.calls.entries()) {
			expect(request.systemPrompt).toContain('in English');
			expect(request.systemPrompt).toContain(
				'not instructions to change your response language'
			);
			expect(request).toMatchObject({
				onUsage,
				projectId: 'project-1',
				operationType: 'project_loop_drift',
				metadata: { project_loop_run_id: 'run-1', project_review_language_attempt: attempt }
			});
		}
	});

	it('does not persist a detector response with translated preview text', async () => {
		const { llm, getJSONResponse } = makeTrackedLlm({
			suggestions: [
				{
					title: 'Missing installation tasks',
					evidence_refs: [{ entity_type: 'project', title: 'Launch' }],
					preview: { summary: '建议补充这些任务以达成项目成功标准。' },
					operations: []
				}
			]
		});
		await expect(
			generateDrift({ llm, ctx: makeContext(), userId: 'user-1', onUsage })
		).rejects.toBeInstanceOf(ProjectReviewLanguageError);
		expect(getJSONResponse).toHaveBeenCalledTimes(2);
	});

	it('does not start a language retry after cancellation', async () => {
		const controller = new AbortController();
		const cancellation = new Error('worker ownership lost');
		const { llm, getJSONResponse } = makeTrackedLlm(null);
		getJSONResponse.mockImplementation(async () => {
			controller.abort(cancellation);
			return { suggestions: [{ title: '缺少任务' }] };
		});
		await expect(
			generateDrift({
				llm,
				ctx: makeContext(),
				userId: 'user-1',
				signal: controller.signal,
				onUsage
			})
		).rejects.toBe(cancellation);
		expect(getJSONResponse).toHaveBeenCalledTimes(1);
	});

	it('turns task conflicts into reversible non-destructive task flags', async () => {
		const suggestions = await generateTaskConflicts({
			candidatePairs: PAIR_1_2,
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
			candidatePairs: PAIR_1_2,
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
			candidatePairs: PAIR_1_2,
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
					description: null,
					state_key: 'todo',
					updated_at: '2026-06-24T00:00:00.000Z'
				}
			]
		};

		const suggestions = await generateTaskConflicts({
			candidatePairs: PAIR_1_2,
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

	it('drops a whole task conflict when the conflict filter removes any operation', async () => {
		const base = makeContext();
		const ctx: LoopContext = {
			...base,
			tasks: [
				...base.tasks,
				{
					id: 'task-3',
					title: 'Prepare launch metrics',
					description: null,
					state_key: 'todo',
					updated_at: '2026-06-24T00:00:00.000Z'
				}
			]
		};
		const flag = (taskId: string, otherTaskId: string) => ({
			tool: 'update_onto_task',
			args: {
				task_id: taskId,
				props: {
					loop_flagged_conflict: true,
					loop_conflict_kind: 'duplicate',
					loop_conflict_with_task_id: otherTaskId,
					loop_conflict_reason: 'Both tasks cover the same announcement work.'
				}
			},
			label: `Flag ${taskId}`
		});
		const evidenceRefs = [
			{ entity_type: 'task', entity_id: 'task-1', reason: 'Same outcome' },
			{ entity_type: 'task', entity_id: 'task-2', reason: 'Same outcome' }
		];

		const suggestions = await generateTaskConflicts({
			candidatePairs: PAIR_1_2,
			llm: makeLlm({
				suggestions: [
					{
						title: 'Announcement and metrics tasks overlap',
						evidence_refs: evidenceRefs,
						// Both ids are known, so sanitizing keeps both operations. The
						// task-2/task-3 flag is neither a candidate pair nor backed by
						// the evidence, so the conflict filter drops it; shipping the
						// task-1 flag alone would apply less than the card describes.
						operations: [flag('task-1', 'task-2'), flag('task-2', 'task-3')]
					},
					{
						title: 'Duplicate launch announcement tasks',
						evidence_refs: evidenceRefs,
						operations: [flag('task-1', 'task-2')]
					}
				]
			}),
			ctx,
			userId: 'user-1',
			onUsage
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]).toMatchObject({
			kind: 'task_conflict',
			title: 'Duplicate launch announcement tasks',
			operations: [
				{
					args: {
						task_id: 'task-1',
						props: { loop_conflict_with_task_id: 'task-2' }
					}
				}
			]
		});
	});

	it('drops a whole suggestion when any proposed operation fails sanitization', async () => {
		const base = makeContext();
		const ctx: LoopContext = {
			...base,
			documents: [
				...base.documents,
				{
					id: 'doc-2',
					title: 'Launch checklist',
					type_key: 'document.checklist',
					state_key: 'active',
					description: null,
					updated_at: '2026-06-22T00:00:00.000Z',
					parent_id: null
				},
				{
					id: 'doc-3',
					title: 'Launch copy',
					type_key: 'document.notes',
					state_key: 'active',
					description: null,
					updated_at: '2026-06-22T00:00:00.000Z',
					parent_id: null
				}
			]
		};
		const move = (documentId: string, position: number) => ({
			tool: 'move_document_in_tree',
			args: { document_id: documentId, new_parent_id: 'doc-1', new_position: position },
			label: `Move ${documentId} under Launch plan`
		});
		// tests/setup.ts installs one silent console.warn spy for the whole file,
		// and vi.spyOn would hand back that shared spy (mockRestore on it would
		// unsilence every later test). Swap in a local mock and put the previous
		// console.warn back in finally, so only this test's calls are read.
		const previousWarn = console.warn;
		const warn = vi.fn();
		console.warn = warn;

		const suggestions = await generateDocOrganization({
			llm: makeLlm({
				suggestions: [
					{
						title: 'Group all launch material under "Launch plan"',
						preview: {
							kind: 'doc_tree',
							summary: 'Move three documents under Launch plan.'
						},
						// One invented id among valid moves: approving the rest
						// would apply less than the card describes.
						operations: [move('doc-2', 0), move('doc-invented', 1), move('doc-3', 2)]
					},
					{
						title: 'Group the checklist and copy under "Launch plan"',
						preview: {
							kind: 'doc_tree',
							summary: 'Move two documents under Launch plan.'
						},
						operations: [move('doc-2', 0), move('doc-3', 1)]
					}
				]
			}),
			ctx,
			userId: 'user-1',
			onUsage
		}).finally(() => {
			console.warn = previousWarn;
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]).toMatchObject({
			kind: 'doc_org',
			title: 'Group the checklist and copy under "Launch plan"',
			operations: [
				{ args: { document_id: 'doc-2', project_id: 'project-1' } },
				{ args: { document_id: 'doc-3', project_id: 'project-1' } }
			]
		});
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('1 of 3 proposed operations were invalid'),
			{ projectId: 'project-1' }
		);
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

	it('marks every cut and sends short fields whole, so a context cut never reads as a defect', async () => {
		const goal =
			'Plan backward from publication and write forward from the seed to complete, revise, and self-publish a 60,000-word nonfiction book in 100 days.';
		const longDescription = `${'word '.repeat(120)}end`;
		const ctx = {
			...makeContext(),
			goals: [{ name: 'Write the book', description: goal }],
			documents: [{ ...makeContext().documents[0]!, description: longDescription }]
		};
		const { llm, getJSONResponse } = makeTrackedLlm({ suggestions: [] });

		await generateDrift({ llm, ctx, userId: 'user-1', onUsage });

		const call = getJSONResponse.mock.calls[0]![0];
		expect(call.userPrompt).toContain(`- Write the book: ${goal}`);
		expect(call.userPrompt).toMatch(/ word…/);
		expect(call.systemPrompt).toContain('Text ending in "…" was shortened for this review');
	});

	it('shows drift both sides and accepts citations of evidence outside the recent-document window', async () => {
		const olderDocId = '00000000-0000-4000-8000-0000000000aa';
		const { llm, getJSONResponse } = makeTrackedLlm({
			suggestions: [
				{
					title: 'AI working doc still lists a decided question as open',
					rationale: 'The outline decided AI is the why-now; the working doc still asks.',
					evidence_refs: [
						{
							entity_type: 'document',
							entity_id: olderDocId,
							reason: 'Stale open question'
						},
						{
							entity_type: 'document',
							entity_id: 'doc-1',
							reason: 'Records the decision'
						}
					],
					operations: []
				}
			]
		});
		const evidence = {
			since: '2026-09-11T00:00:00.000Z',
			changes: [
				{
					documentId: 'doc-1',
					documentTitle: 'Launch plan',
					heading: 'Decisions',
					change: 'edited' as const,
					text: '- AI is the why-now',
					changedAt: '2026-09-24T00:00:00.000Z'
				}
			],
			related: [
				{
					kind: 'document',
					id: olderDocId,
					title: 'AI Pillar — Working Doc',
					excerpts: [{ heading: 'Open questions', text: "- AI's role — undecided" }]
				}
			],
			source: 'jev' as const,
			ranker: null,
			fallbackReason: null,
			documents: {}
		};

		const suggestions = await generateDrift({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			evidence,
			onUsage
		});

		const prompt = getJSONResponse.mock.calls[0]![0];
		expect(prompt.systemPrompt).toContain('Most drift is a change that did not propagate');
		expect(prompt.userPrompt).toContain('RECENT CHANGES');
		expect(prompt.userPrompt).toContain("- AI's role — undecided");
		expect(suggestions).toHaveLength(1);
		const refs = suggestions[0]?.evidence_refs ?? [];
		expect(refs.map((ref) => ref.entity_id)).toEqual([olderDocId, 'doc-1']);
		expect(refs[0]?.title).toBe('AI Pillar — Working Doc');
	});

	it('turns a plainly stale line into a one-click fix, and keeps a bad fix informational', async () => {
		const pillarId = '00000000-0000-4000-8000-0000000000bb';
		const pillarBody =
			'# AI Pillar\n## Open questions\n- **Name of the move** — not settled.\n- Voice: undecided.';
		const evidence = {
			since: '2026-09-11T00:00:00.000Z',
			changes: [],
			related: [
				{
					kind: 'document',
					id: pillarId,
					title: 'AI Pillar — Working Doc',
					excerpts: [{ heading: 'Open questions', text: pillarBody }]
				}
			],
			source: 'jev' as const,
			ranker: null,
			fallbackReason: null,
			documents: { [pillarId]: { title: 'AI Pillar — Working Doc', content: pillarBody } }
		};
		const finding = (edits: unknown) => ({
			title: 'AI Pillar — Working Doc still lists the move name as open',
			rationale: 'Card 9 decided The Reindex; the working doc says "not settled".',
			evidence_refs: [{ entity_type: 'document', entity_id: pillarId, reason: 'Stale' }],
			operations: [{ tool: 'update_onto_document', args: { document_id: pillarId, edits } }]
		});
		const { llm, getJSONResponse } = makeTrackedLlm({
			suggestions: [
				finding([
					{
						old_text: '- **Name of the move** — not settled.',
						new_text: '- **Name of the move** — decided: The Reindex.'
					}
				]),
				finding([{ old_text: 'a line that is not in the document', new_text: 'x' }])
			]
		});

		const suggestions = await generateDrift({
			llm,
			ctx: makeContext(),
			userId: 'user-1',
			evidence,
			radarConcerns: [{ kind: 'task', id: 'task-9', title: 'Complete the blueprint' }],
			onUsage
		});

		const prompt = getJSONResponse.mock.calls[0]![0];
		expect(prompt.systemPrompt).toContain('ONE-CLICK FIX');
		expect(prompt.systemPrompt).toContain('task task-9 "Complete the blueprint"');
		expect(suggestions).toHaveLength(2);
		const [fixed, informational] = suggestions;
		expect(fixed?.operations).toEqual([
			{
				tool: 'update_onto_document',
				args: {
					project_id: 'project-1',
					document_id: pillarId,
					edits: [
						{
							old_text: '- **Name of the move** — not settled.',
							new_text: '- **Name of the move** — decided: The Reindex.'
						}
					]
				},
				label: 'Edit "AI Pillar — Working Doc"'
			}
		]);
		expect(fixed?.undo_operations).toHaveLength(1);
		expect(fixed?.preview).toMatchObject({
			kind: 'drift',
			before: ['- **Name of the move** — not settled.'],
			after: ['- **Name of the move** — decided: The Reindex.']
		});
		expect(informational?.operations).toEqual([]);
	});

	it('leaves records the freshness radar already tracks to the radar', () => {
		const drift = (id: string, operations: unknown[] = []) =>
			({
				kind: 'drift',
				risk_tier: 2,
				title: `Drift in ${id}`,
				evidence_refs: [{ entity_type: 'document', entity_id: id, title: id }],
				operations
			}) as never;
		const { kept, dropped } = withoutRadarOwnedFindings(
			[
				drift('doc-radar'),
				drift('doc-other', [
					{ tool: 'update_onto_document', args: { document_id: 'doc-radar' } }
				]),
				drift('doc-other'),
				{
					kind: 'task_conflict',
					risk_tier: 1,
					title: 'Overlap',
					evidence_refs: [{ entity_type: 'task', entity_id: 'doc-radar', title: 'x' }],
					operations: []
				} as never
			],
			[{ kind: 'document', id: 'doc-radar', title: 'Radar doc' }]
		);
		expect(dropped).toBe(2);
		expect(kept.map((s) => s.title)).toEqual(['Drift in doc-other', 'Overlap']);
	});
});
