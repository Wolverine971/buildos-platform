// packages/agent-orchestrator/src/contracts/contracts.invalid.test.ts
import { describe, expect, it } from 'vitest';

import {
	AcceptanceCriterionSchema,
	ArtifactEnvelopeSchema,
	CONTRACT_SCHEMA_VERSION,
	ContextPacketSchema,
	DirectActionSpecSchema,
	MAX_ARTIFACT_PAYLOAD_BYTES,
	MAX_OBJECTIVE_CHARS,
	MAX_STEPS_PER_STAGE,
	RouteDecisionSchema,
	StepAssignmentSchema,
	StepSpecSchema,
	TransitionDecisionSchema,
	WorkflowStageSpecSchema,
	WorkflowStateDigestSchema,
	AgentResultSchema
} from '.';
import {
	agentResultFixture,
	artifactEnvelopeFixture,
	contextPacketFixture,
	directActionFixture,
	directRouteDecisionFixture,
	stepAssignmentFixture,
	stepSpecFixture,
	transitionDecisionFixture,
	workflowStageFixture,
	workflowStateDigestFixture
} from '../testing/fixtures';

describe('agent-orchestrator contracts reject malformed values', () => {
	it('rejects a route payload that does not match its discriminant', () => {
		const malformed = {
			...directRouteDecisionFixture,
			route: 'clarify',
			reason_code: 'ambiguous_scope'
		};

		expect(RouteDecisionSchema.safeParse(malformed).success).toBe(false);
	});

	it('rejects a reason code that is incompatible with the route', () => {
		const malformed = {
			...directRouteDecisionFixture,
			reason_code: 'multi_source_research'
		};

		expect(RouteDecisionSchema.safeParse(malformed).success).toBe(false);
	});

	it('rejects unknown fields instead of silently stripping model output', () => {
		const malformed = { ...directRouteDecisionFixture, private_reasoning: 'hidden text' };

		expect(RouteDecisionSchema.safeParse(malformed).success).toBe(false);
	});

	it('requires a validator id for machine-checkable acceptance criteria', () => {
		const { validator_id: _removed, ...malformed } = stepSpecFixture.acceptance_criteria[0];

		expect(AcceptanceCriterionSchema.safeParse(malformed).success).toBe(false);
	});

	it('rejects unknown same-stage dependencies', () => {
		const malformed = {
			...workflowStageFixture,
			steps: [
				{
					...stepSpecFixture,
					depends_on_step_keys: ['missing.step']
				}
			]
		};

		expect(WorkflowStageSpecSchema.safeParse(malformed).success).toBe(false);
	});

	it('rejects dependency cycles', () => {
		const firstStep = {
			...workflowStageFixture.steps[0],
			depends_on_step_keys: [workflowStageFixture.steps[1].client_step_key]
		};
		const malformed = {
			...workflowStageFixture,
			steps: [firstStep, workflowStageFixture.steps[1]]
		};

		expect(WorkflowStageSpecSchema.safeParse(malformed).success).toBe(false);
	});

	it('rejects non-JSON artifact payloads', () => {
		const malformed = {
			...artifactEnvelopeFixture,
			payload: { execute: () => 'not serializable' }
		};

		expect(ArtifactEnvelopeSchema.safeParse(malformed).success).toBe(false);
	});

	it('rejects direct operations above the low-risk ceiling', () => {
		const malformed = {
			...directActionFixture,
			operations: [{ ...directActionFixture.operations[0], risk: 'high' }]
		};

		expect(DirectActionSpecSchema.safeParse(malformed).success).toBe(false);
	});
});

describe('agent-orchestrator contracts reject oversized values', () => {
	it('rejects an oversized route objective', () => {
		const oversized = {
			...directRouteDecisionFixture,
			objective: 'x'.repeat(MAX_OBJECTIVE_CHARS + 1)
		};

		expect(RouteDecisionSchema.safeParse(oversized).success).toBe(false);
	});

	it('rejects an artifact payload above 256 KB', () => {
		const oversized = {
			...artifactEnvelopeFixture,
			payload: { text: 'x'.repeat(MAX_ARTIFACT_PAYLOAD_BYTES) }
		};

		expect(ArtifactEnvelopeSchema.safeParse(oversized).success).toBe(false);
	});

	it('rejects a stage above its step bound', () => {
		const oversized = {
			...workflowStageFixture,
			steps: Array.from({ length: MAX_STEPS_PER_STAGE + 1 }, (_, index) => ({
				...stepSpecFixture,
				client_step_key: `step.${index}`
			}))
		};

		expect(WorkflowStageSpecSchema.safeParse(oversized).success).toBe(false);
	});
});

describe('agent-orchestrator contracts reject unknown schema versions', () => {
	it.each([
		['RouteDecision', RouteDecisionSchema, directRouteDecisionFixture],
		['WorkflowStageSpec', WorkflowStageSpecSchema, workflowStageFixture],
		['StepSpec', StepSpecSchema, stepSpecFixture],
		['StepAssignment', StepAssignmentSchema, stepAssignmentFixture],
		['ContextPacket', ContextPacketSchema, contextPacketFixture],
		['AgentResult', AgentResultSchema, agentResultFixture],
		['ArtifactEnvelope', ArtifactEnvelopeSchema, artifactEnvelopeFixture],
		['TransitionDecision', TransitionDecisionSchema, transitionDecisionFixture],
		['WorkflowStateDigest', WorkflowStateDigestSchema, workflowStateDigestFixture],
		['DirectActionSpec', DirectActionSpecSchema, directActionFixture]
	])('%s', (_name, schema, fixture) => {
		const unknownVersion = { ...fixture, schema_version: CONTRACT_SCHEMA_VERSION + 1 };

		expect(schema.safeParse(unknownVersion).success).toBe(false);
	});
});
