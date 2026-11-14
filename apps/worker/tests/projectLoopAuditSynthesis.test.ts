// apps/worker/tests/projectLoopAuditSynthesis.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ProjectAuditEvidenceRef } from '@buildos/shared-types';

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {}
}));

vi.mock('../src/lib/posthog', () => ({
	captureWorkerEvent: vi.fn()
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: vi.fn()
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn()
}));

vi.mock('../src/workers/project-loop/auditEnqueue', () => ({
	processProjectAuditTriggerEvaluationJob: vi.fn(),
	queueProjectAuditFromWorker: vi.fn()
}));

import {
	COMPLETE_AUDIT_SYNTHESIS_SYSTEM_PROMPT,
	applyCompleteAuditSynthesis,
	buildAuditChildSuggestionDrafts,
	describeAuditEvidenceCatalog,
	describeAuditScaffold
} from '../src/workers/project-loop/projectLoopWorker';

function basePacket() {
	const evidence: ProjectAuditEvidenceRef[] = [
		{
			entity_type: 'task',
			entity_id: 'task-1',
			label: 'Ship launch page',
			reason: 'Open launch work'
		},
		{
			entity_type: 'document',
			entity_id: 'doc-1',
			label: 'Launch plan',
			reason: 'Project plan'
		}
	];

	return {
		deliveryConfidence: 'yellow',
		projectThesis: 'Original thesis',
		summary: 'Deterministic summary',
		topFindings: [],
		topActions: [],
		changeSummary: {},
		dimensions: [
			{
				key: 'risk_decision_quality',
				name: 'Risk and decision quality',
				rating: 'unknown',
				summary: 'No dedicated risk register was loaded.',
				evidence_refs: [evidence[1]],
				recommendations: [
					'Add explicit risks, blockers, or decision points where they exist.'
				]
			}
		],
		risks: [],
		openQuestions: [],
		evidenceRefs: evidence,
		recommendations: []
	} as any;
}

describe('applyCompleteAuditSynthesis', () => {
	it('keeps LLM audit additions only when they cite catalog evidence', () => {
		const packet = basePacket();
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				delivery_confidence: 'red',
				project_thesis: 'Launch is under-scoped for current commitments.',
				summary: 'The audit found overloaded launch work and missing decisions.',
				top_findings: [
					{
						title: 'Launch work is overloaded',
						summary: 'The same launch task carries page shipping and planning risk.',
						dimension: 'execution_health',
						rating: 'red',
						evidence_refs: [
							{
								entity_type: 'task',
								entity_id: 'task-1',
								label: 'Ship launch page'
							}
						]
					},
					{
						title: 'Unsupported finding',
						summary: 'This cites something outside the catalog.',
						evidence_refs: [
							{
								entity_type: 'task',
								entity_id: 'missing-task',
								label: 'Missing task'
							}
						]
					}
				],
				dimension_updates: [
					{
						key: 'risk_decision_quality',
						rating: 'red',
						summary: 'Launch risk is present but decisions are not explicit.',
						recommendations: ['Name the launch go/no-go decision.'],
						evidence_refs: [
							{
								entity_type: 'document',
								entity_id: 'doc-1',
								label: 'Launch plan'
							}
						]
					}
				],
				risks: [
					{
						title: 'Launch decision gap',
						summary: 'The plan has launch work but no explicit go/no-go owner.',
						severity: 'high',
						dimension: 'risk_decision_quality',
						evidence_refs: [
							{
								entity_type: 'document',
								entity_id: 'doc-1',
								label: 'Launch plan'
							}
						]
					}
				],
				recommendations: [
					{
						title: 'Define the launch go/no-go decision',
						summary: 'Create one clear decision point before more execution work.',
						role: 'decision_point',
						priority: 'high',
						dimension: 'risk_decision_quality',
						evidence_refs: [
							{
								entity_type: 'document',
								entity_id: 'doc-1',
								label: 'Launch plan'
							}
						]
					}
				]
			},
			packet.evidenceRefs
		);

		expect(result.deliveryConfidence).toBe('red');
		expect(result.summary).toContain('overloaded launch work');
		expect(result.topFindings).toHaveLength(1);
		expect(result.risks).toHaveLength(1);
		expect(result.recommendations[0]).toMatchObject({
			title: 'Define the launch go/no-go decision',
			priority: 'high',
			role: 'decision_point'
		});
		expect(result.dimensions[0]).toMatchObject({
			rating: 'red',
			summary: 'Launch risk is present but decisions are not explicit.',
			recommendations: ['Name the launch go/no-go decision.']
		});
		expect(result.changeSummary).toMatchObject({
			synthesis_model: 'llm-audit-synthesis-v1',
			finding_count: 1,
			risk_count: 1,
			recommendation_count: 1
		});
	});

	it('ignores the whole synthesis when no structured item has valid evidence', () => {
		const packet = basePacket();
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				delivery_confidence: 'red',
				summary: 'Unsupported summary should not replace the deterministic packet.',
				recommendations: [
					{
						title: 'Unsupported recommendation',
						summary: 'No matching evidence.',
						evidence_refs: [
							{
								entity_type: 'external',
								entity_id: 'missing',
								label: 'Missing evidence'
							}
						]
					}
				]
			},
			packet.evidenceRefs
		);

		expect(result).toBe(packet);
	});

	it('promotes a grounded dimension recommendation into an actionable audit recommendation', () => {
		const packet = basePacket();
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				dimension_updates: [
					{
						key: 'risk_decision_quality',
						rating: 'red',
						summary: 'The launch plan does not name a go/no-go owner.',
						recommendations: ['Choose the launch go/no-go owner.'],
						evidence_refs: [
							{
								entity_type: 'document',
								entity_id: 'doc-1',
								label: 'Launch plan'
							}
						]
					}
				]
			},
			packet.evidenceRefs
		);

		expect(result.recommendations[0]).toMatchObject({
			title: 'Choose the launch go/no-go owner.',
			summary: 'The launch plan does not name a go/no-go owner.',
			role: 'decision_point',
			priority: 'high',
			dimension: 'risk_decision_quality'
		});
		expect(result.changeSummary).toMatchObject({
			recommendation_count: 0,
			derived_recommendation_count: 1,
			actionable_recommendation_count: 1
		});
	});

	it('turns a grounded open question into the decisional fallback when no action exists', () => {
		const packet = basePacket();
		packet.dimensions[0].recommendations = [];
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				open_questions: [
					{
						question: 'Should the launch wait until the page task is complete?',
						dimension: 'execution_health',
						evidence_refs: [
							{
								entity_type: 'task',
								entity_id: 'task-1',
								label: 'Ship launch page'
							}
						]
					}
				]
			},
			packet.evidenceRefs
		);

		expect(result.recommendations).toEqual([
			expect.objectContaining({
				title: 'Should the launch wait until the page task is complete?',
				role: 'decision_point',
				priority: 'medium',
				dimension: 'execution_health'
			})
		]);
	});

	it('clears a deterministic recommendation when grounded synthesis resolves it green', () => {
		const packet = basePacket();
		packet.recommendations = [
			{
				title: 'Name the launch decision.',
				summary: 'No decision was visible in the deterministic scaffold.',
				role: 'decision_point',
				priority: 'low',
				dimension: 'risk_decision_quality',
				evidence_refs: [packet.evidenceRefs[1]]
			}
		];

		const result = applyCompleteAuditSynthesis(
			packet,
			{
				dimension_updates: [
					{
						key: 'risk_decision_quality',
						rating: 'green',
						summary: 'The launch plan names the go/no-go owner and criteria.',
						evidence_refs: [
							{
								entity_type: 'document',
								entity_id: 'doc-1',
								label: 'Launch plan'
							}
						]
					}
				]
			},
			packet.evidenceRefs
		);

		expect(result.dimensions[0]).toMatchObject({
			rating: 'green',
			summary: 'The launch plan names the go/no-go owner and criteria.'
		});
		expect(result.dimensions[0].recommendations).toBeUndefined();
		expect(result.recommendations).toEqual([]);
		expect(result.topActions).toEqual([]);
		expect(result.changeSummary).toMatchObject({
			actionable_recommendation_count: 0,
			cleared_deterministic_recommendation_count: 1
		});
	});

	it('resolves evidence cited by catalog handle, and by the bare number older prompts used', () => {
		const packet = basePacket();
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				recommendations: [
					{
						title: 'Decide which launch page ships first',
						summary: 'Recommend the launch page; the plan already names it.',
						role: 'decision_point',
						priority: 'high',
						dimension: 'execution_health',
						target_entity_type: 'document',
						target_entity_id: 'doc-1',
						evidence: ['E2', 1, 'E2', 'E99']
					}
				]
			},
			packet.evidenceRefs
		);
		const recommendation = result.recommendations.find(
			(item: { title: string }) => item.title === 'Decide which launch page ships first'
		);
		expect(
			(recommendation?.evidence_refs ?? []).map(
				(ref: { entity_id?: string }) => ref.entity_id
			)
		).toEqual(['doc-1', 'task-1']);
	});
});

const titles = (items: Array<{ title: string }>) => items.map((item) => item.title);

describe('audit recommendations point at one real record (F2)', () => {
	it('drops recommendations without a target record and resolves a target named by handle', () => {
		const packet = basePacket();
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				recommendations: [
					{
						title: 'Create a risk register for the project',
						summary: 'Recommend a register; the project names no risks.',
						dimension: 'risk_decision_quality',
						evidence: ['E1', 'E2']
					},
					{
						title: 'Decide whether the launch page ships before the plan is final',
						summary: 'Recommend shipping it first; the plan already depends on it.',
						role: 'decision_point',
						priority: 'high',
						dimension: 'execution_health',
						target_entity_type: 'task',
						target_entity_id: 'E1',
						evidence: ['E2']
					},
					{
						title: 'Assign owners to every external dependency',
						summary: 'Recommend owners for each dependency.',
						dimension: 'dependency_readiness',
						target_entity_id: 'not-a-record',
						evidence: ['E1', 'E2']
					}
				]
			},
			packet.evidenceRefs
		);

		expect(titles(result.recommendations)).toEqual([
			'Decide whether the launch page ships before the plan is final'
		]);
		expect(result.recommendations[0]).toMatchObject({
			target_entity_type: 'task',
			target_entity_id: 'task-1'
		});
		// The target is added to the evidence so the light review can close it with the record.
		expect(
			(result.recommendations[0].evidence_refs ?? []).map(
				(ref: { entity_id?: string }) => ref.entity_id
			)
		).toEqual(['task-1', 'doc-1']);
		expect(result.changeSummary).toMatchObject({
			recommendation_count: 3,
			actionable_recommendation_count: 1
		});
	});

	it('keeps always-unknown dimensions, their questions and untargeted recommendations out of the prompt', () => {
		const packet = basePacket();
		packet.dimensions = [
			packet.dimensions[0],
			{
				key: 'dependency_readiness',
				name: 'Dependency readiness',
				rating: 'unknown',
				summary: 'The available project evidence does not name external owners.',
				evidence_refs: [],
				recommendations: []
			},
			{
				key: 'execution_health',
				name: 'Execution health',
				rating: 'yellow',
				summary: 'The launch page task is open past its window.',
				evidence_refs: [packet.evidenceRefs[0]],
				recommendations: ['Finish the launch page.']
			}
		];
		packet.openQuestions = [
			{ dimension: 'risk_decision_quality', question: 'Who owns the launch decision?' },
			{ dimension: 'dependency_readiness', question: 'Who owns each handoff?' },
			{ dimension: 'execution_health', question: 'Is the launch page still first?' }
		];
		packet.topFindings = [
			{ dimension: 'risk_decision_quality', rating: 'unknown', title: 'Risk', summary: 'x' },
			{ dimension: 'execution_health', rating: 'yellow', title: 'Execution', summary: 'y' }
		];
		packet.recommendations = [
			{
				title: 'Decide which stale documents to refresh and which to archive.',
				summary: 'Several documents look stale.',
				dimension: 'evidence_freshness',
				evidence_refs: packet.evidenceRefs
			},
			{
				title: 'Finish the launch page.',
				summary: 'The launch page task is open past its window.',
				dimension: 'execution_health',
				evidence_refs: [packet.evidenceRefs[0]]
			}
		];

		const scaffold = JSON.parse(describeAuditScaffold(packet));

		expect(scaffold.dimensions.map((dimension: { key: string }) => dimension.key)).toEqual([
			'execution_health'
		]);
		expect(scaffold.dimensions[0].recommendations).toBeUndefined();
		expect(
			scaffold.open_questions.map((question: { question: string }) => question.question)
		).toEqual(['Is the launch page still first?']);
		expect(scaffold.top_findings).toHaveLength(1);
		expect(scaffold.recommendations).toEqual([
			expect.objectContaining({
				title: 'Finish the launch page.',
				target_entity_type: 'task',
				target_entity_id: 'task-1'
			})
		]);
	});

	it('no longer tells the model to mirror questions or gaps as recommendations', () => {
		expect(COMPLETE_AUDIT_SYNTHESIS_SYSTEM_PROMPT).not.toContain('mirror it as a top-level');
		expect(COMPLETE_AUDIT_SYNTHESIS_SYSTEM_PROMPT).not.toContain(
			'pair it with a decision_point'
		);
		expect(COMPLETE_AUDIT_SYNTHESIS_SYSTEM_PROMPT).toContain('target_entity_id');
	});
});

describe('one recommendation per dimension and record (F3)', () => {
	it('ignores dimension-update copies when explicit recommendations exist', () => {
		const packet = basePacket();
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				dimension_updates: [
					{
						key: 'execution_health',
						rating: 'red',
						summary: 'The launch page task has stalled.',
						recommendations: ['Unblock the launch page task.'],
						evidence: ['E1']
					}
				],
				recommendations: [
					{
						title: 'Decide who finishes the launch page this week',
						summary: 'Recommend finishing it before launch prep continues.',
						role: 'decision_point',
						priority: 'high',
						dimension: 'execution_health',
						target_entity_type: 'task',
						target_entity_id: 'task-1',
						evidence: ['E1']
					},
					{
						title: 'Assign an owner to the launch page task',
						summary: 'Recommend one owner for the launch page.',
						priority: 'medium',
						dimension: 'execution_health',
						target_entity_type: 'task',
						target_entity_id: 'task-1',
						evidence: ['E1']
					}
				]
			},
			packet.evidenceRefs
		);

		expect(titles(result.recommendations)).toEqual([
			'Decide who finishes the launch page this week'
		]);
	});

	it('drops a recommendation the user already decided, however it is reworded', () => {
		const packet = basePacket();
		packet.reviewedRecommendations = [
			// Rejected after 2026-11-14: matched on dimension + record.
			{ title: 'Review the launch page task', key: 'execution_health:task-1' },
			// Rejected before keys were stored: only its exact title can match.
			{ title: 'Update the launch plan.', key: null }
		];
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				recommendations: [
					{
						title: 'Decide whether to finish the launch page this week',
						summary: 'Recommend finishing it first.',
						dimension: 'execution_health',
						target_entity_id: 'task-1',
						evidence: ['E1']
					},
					{
						title: 'Update the launch plan',
						summary: 'Recommend updating the plan.',
						dimension: 'documentation_quality',
						target_entity_id: 'doc-1',
						evidence: ['E2']
					},
					{
						title: 'Retire the launch page task once the plan ships',
						summary: 'Recommend closing it after launch.',
						dimension: 'plan_integrity',
						target_entity_id: 'task-1',
						evidence: ['E1']
					}
				]
			},
			packet.evidenceRefs
		);

		// Same record, different dimension: a different recommendation, so it stays.
		expect(titles(result.recommendations)).toEqual([
			'Retire the launch page task once the plan ships'
		]);
	});

	it('writes one inbox row per dimension and record, storing what it is about', () => {
		const packet = basePacket();
		packet.recommendations = [
			{
				title: 'Decide who finishes the launch page',
				summary: 'Recommend finishing it this week.',
				priority: 'high',
				dimension: 'execution_health',
				target_entity_type: 'task',
				target_entity_id: 'task-1',
				evidence_refs: [packet.evidenceRefs[0]]
			},
			{
				title: 'Finish the launch page first',
				summary: 'Same advice, new words.',
				priority: 'medium',
				dimension: 'execution_health',
				target_entity_type: 'task',
				target_entity_id: 'task-1',
				evidence_refs: [packet.evidenceRefs[0]]
			}
		];

		const drafts = buildAuditChildSuggestionDrafts({
			auditId: 'audit-1',
			runId: 'run-1',
			projectId: 'project-1',
			packet
		});

		expect(drafts).toHaveLength(1);
		expect(drafts[0].key).toBe('execution_health:task-1');
		expect(drafts[0].row.preview).toMatchObject({
			audit_recommendation: {
				dimension: 'execution_health',
				target_entity_type: 'task',
				target_entity_id: 'task-1'
			}
		});
	});
});

describe('evidence handles never reach the user (F4)', () => {
	it('lists the catalog by handle', () => {
		const packet = basePacket();
		expect(describeAuditEvidenceCatalog(packet.evidenceRefs).split('\n')).toEqual([
			'E1 task id=task-1: "Ship launch page" — Open launch work',
			'E2 document id=doc-1: "Launch plan" — Project plan'
		]);
		expect(COMPLETE_AUDIT_SYNTHESIS_SYSTEM_PROMPT).toContain('Never write a handle');
	});

	it('scrubs handles out of titles and prose, and leaves unknown ones as written', () => {
		const packet = basePacket();
		const result = applyCompleteAuditSynthesis(
			packet,
			{
				summary: 'Launch is close; see E1 and E9.',
				recommendations: [
					{
						title: 'Finish the launch page task (E1)',
						summary: 'E2 already names E1 as the first launch step.',
						dimension: 'execution_health',
						target_entity_id: 'task-1',
						evidence: ['E1', 'E2']
					}
				]
			},
			packet.evidenceRefs
		);

		expect(result.summary).toBe('Launch is close; see "Ship launch page" and E9.');
		expect(result.recommendations[0]).toMatchObject({
			title: 'Finish the launch page task',
			summary: '"Launch plan" already names "Ship launch page" as the first launch step.'
		});
	});
});
