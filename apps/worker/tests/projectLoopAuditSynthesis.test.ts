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

import { applyCompleteAuditSynthesis } from '../src/workers/project-loop/projectLoopWorker';

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
});
