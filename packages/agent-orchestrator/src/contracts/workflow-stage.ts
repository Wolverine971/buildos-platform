// packages/agent-orchestrator/src/contracts/workflow-stage.ts
import { z } from 'zod';

import { CONTRACT_SCHEMA_VERSION, MAX_STEPS_PER_STAGE } from './limits';
import { CanonicalIdSchema, DescriptionSchema, NonEmptyStringSchema } from './primitives';
import { StepSpecSchema } from './step-spec';

function findCycle(dependencies: Map<string, string[]>): string[] | null {
	const visiting = new Set<string>();
	const visited = new Set<string>();

	function visit(stepKey: string, path: string[]): string[] | null {
		if (visiting.has(stepKey)) return [...path, stepKey];
		if (visited.has(stepKey)) return null;

		visiting.add(stepKey);
		for (const dependency of dependencies.get(stepKey) ?? []) {
			const cycle = visit(dependency, [...path, stepKey]);
			if (cycle) return cycle;
		}
		visiting.delete(stepKey);
		visited.add(stepKey);
		return null;
	}

	for (const stepKey of dependencies.keys()) {
		const cycle = visit(stepKey, []);
		if (cycle) return cycle;
	}

	return null;
}

export const WorkflowStageSpecSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		client_stage_key: CanonicalIdSchema,
		label: NonEmptyStringSchema.max(200),
		purpose: DescriptionSchema,
		steps: z.array(StepSpecSchema).min(1).max(MAX_STEPS_PER_STAGE),
		join_policy: z.enum(['all', 'best_effort']),
		decision_gate: z.boolean(),
		failure_policy: z.enum(['replan', 'complete_partial', 'fail'])
	})
	.strict()
	.superRefine((stage, context) => {
		const keys = stage.steps.map((step) => step.client_step_key);
		const knownKeys = new Set(keys);
		if (knownKeys.size !== keys.length) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['steps'],
				message: 'Step keys must be unique within a stage'
			});
		}

		for (const [stepIndex, step] of stage.steps.entries()) {
			for (const dependency of step.depends_on_step_keys) {
				if (!knownKeys.has(dependency)) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['steps', stepIndex, 'depends_on_step_keys'],
						message: `Unknown same-stage dependency: ${dependency}`
					});
				}
			}
		}

		const cycle = findCycle(
			new Map(stage.steps.map((step) => [step.client_step_key, step.depends_on_step_keys]))
		);
		if (cycle) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['steps'],
				message: `Step dependency cycle: ${cycle.join(' -> ')}`
			});
		}
	});

export type WorkflowStageSpec = z.infer<typeof WorkflowStageSpecSchema>;
