// packages/agent-orchestrator/src/application/route-mode/workflow-scope.test.ts
import { describe, expect, it, vi } from 'vitest';

import type { RouteModelPort } from '../../ports';
import { buildPhaseAWorldCard } from './world-card';
import {
	classifyWorkflowScope,
	WORKFLOW_SCOPE_PROMPT_VERSION,
	WORKFLOW_SCOPE_SYSTEM_PROMPT
} from './workflow-scope';

const worldCard = buildPhaseAWorldCard({
	project: {
		id: 'project-1',
		name: 'Example project',
		description: 'A product delivery project.',
		state: 'active',
		stage: 'execution',
		next_step: 'Validate the prototype.'
	},
	tasks: [],
	documents: [],
	goals: [],
	plans: [],
	edges: []
});

function modelReturning(
	...values: unknown[]
): RouteModelPort & { generateJson: ReturnType<typeof vi.fn> } {
	const generateJson = vi.fn();
	for (const value of values) generateJson.mockResolvedValueOnce(value);
	return { generateJson };
}

describe('Phase A workflow-scope classifier', () => {
	it('asks only for a bounded semantic fact', () => {
		expect(WORKFLOW_SCOPE_PROMPT_VERSION).toBe('phase-a-workflow-scope-v1');
		expect(WORKFLOW_SCOPE_SYSTEM_PROMPT).toContain('Do not choose a route');
		expect(WORKFLOW_SCOPE_SYSTEM_PROMPT).not.toContain('a0-c');
		expect(WORKFLOW_SCOPE_SYSTEM_PROMPT).not.toContain('cold-email');
	});

	it('accepts a valid strict classification in one call', async () => {
		const model = modelReturning({
			schema_version: 1,
			classification: 'self_contained_research',
			confidence: 0.92
		});
		const result = await classifyWorkflowScope({
			worldCard,
			request: 'Compare current practices and validation methods.',
			model
		});

		expect(result.fact.classification).toBe('self_contained_research');
		expect(result.attempts).toBe(1);
		expect(result.repaired).toBe(false);
		expect(model.generateJson.mock.calls[0]?.[0]).toMatchObject({
			promptVersion: WORKFLOW_SCOPE_PROMPT_VERSION,
			attempt: 1,
			maxTokens: 300
		});
	});

	it('makes exactly one bounded repair and then accepts', async () => {
		const model = modelReturning(
			{ classification: 'research' },
			{
				schema_version: 1,
				classification: 'current_project_then_research',
				confidence: 0.8
			}
		);
		const result = await classifyWorkflowScope({
			worldCard,
			request: 'Research the best option for this project.',
			model
		});

		expect(result.attempts).toBe(2);
		expect(result.repaired).toBe(true);
		expect(model.generateJson).toHaveBeenCalledTimes(2);
		expect(model.generateJson.mock.calls[1]?.[0].userPrompt).toContain('Validation issues');
	});

	it('fails after the single repair remains invalid', async () => {
		const model = modelReturning({}, { schema_version: 1, classification: 'unknown' });
		await expect(
			classifyWorkflowScope({ worldCard, request: 'Research this.', model })
		).rejects.toMatchObject({ name: 'WorkflowScopeFailure', attempts: 2 });
		expect(model.generateJson).toHaveBeenCalledTimes(2);
	});
});
