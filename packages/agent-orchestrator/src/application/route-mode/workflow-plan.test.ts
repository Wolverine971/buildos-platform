// packages/agent-orchestrator/src/application/route-mode/workflow-plan.test.ts

import { describe, expect, it } from 'vitest';

import { selectWorkflowPlanShape, WORKFLOW_PLAN_SELECTION_POLICY } from './workflow-plan';

describe('observable workflow plan selection', () => {
	it('has a versioned policy', () => {
		expect(WORKFLOW_PLAN_SELECTION_POLICY).toBe('observable-request-features-v1');
	});

	it('uses one researcher when the request supplies a source URL', () => {
		expect(
			selectWorkflowPlanShape(
				'Review this source and summarize its implications: https://example.com/report'
			)
		).toBe('supplied_source_research');
	});

	it('loads project context before research when the request has a project referent', () => {
		expect(selectWorkflowPlanShape('Research which service is best for this project.')).toBe(
			'context_then_research'
		);
	});

	it('fans out a self-contained research brief without relying on a model reason label', () => {
		expect(
			selectWorkflowPlanShape(
				'Compare onboarding practice, accessibility risks, and validation methods for a new editor.'
			)
		).toBe('parallel_research');
	});
});
