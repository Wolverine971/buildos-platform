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
	processProjectAuditTriggerEvaluationJob: vi.fn()
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
});
