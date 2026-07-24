// packages/agent-orchestrator/src/contracts/contracts.valid.test.ts
import { describe, expect, it } from 'vitest';

import {
	AcceptanceCriterionSchema,
	AcceptanceResultSchema,
	AgentResultSchema,
	ArtifactDraftSchema,
	ArtifactEnvelopeSchema,
	ArtifactProvenanceSchema,
	ArtifactReferenceSchema,
	CapabilityGapSchema,
	ContextPacketSchema,
	DirectActionSpecSchema,
	DirectOperationSchema,
	PermissionGrantSchema,
	ProjectScopeSchema,
	ProvenancedExcerptSchema,
	ProvenancedFactSchema,
	RetrievalOptionSchema,
	RouteDecisionSchema,
	StepAssignmentSchema,
	StepSpecSchema,
	TransitionDecisionSchema,
	WorkflowStageSpecSchema,
	WorkflowStateDigestSchema
} from '.';
import {
	acceptanceCriterionFixture,
	acceptanceResultFixture,
	agentResultFixture,
	artifactDraftFixture,
	artifactEnvelopeFixture,
	artifactProvenanceFixture,
	capabilityGapFixture,
	capabilityGapRouteDecisionFixture,
	clarifyRouteDecisionFixture,
	contextPacketFixture,
	directActionFixture,
	directRouteDecisionFixture,
	permissionGrantFixture,
	projectScopeFixture,
	stepAssignmentFixture,
	stepSpecFixture,
	transitionDecisionFixture,
	workflowRouteDecisionFixture,
	workflowStageFixture,
	workflowStateDigestFixture
} from '../testing/fixtures';

describe('agent-orchestrator contracts accept valid fixtures', () => {
	it.each([
		['RouteDecision: direct', RouteDecisionSchema, directRouteDecisionFixture],
		['RouteDecision: workflow', RouteDecisionSchema, workflowRouteDecisionFixture],
		['RouteDecision: clarify', RouteDecisionSchema, clarifyRouteDecisionFixture],
		['RouteDecision: capability gap', RouteDecisionSchema, capabilityGapRouteDecisionFixture],
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
		expect(schema.safeParse(fixture).success).toBe(true);
	});

	it.each([
		['AcceptanceCriterion', AcceptanceCriterionSchema, acceptanceCriterionFixture],
		['AcceptanceResult', AcceptanceResultSchema, acceptanceResultFixture],
		['CapabilityGap', CapabilityGapSchema, capabilityGapFixture],
		['PermissionGrant', PermissionGrantSchema, permissionGrantFixture],
		['ProvenancedFact', ProvenancedFactSchema, contextPacketFixture.facts[0]],
		['ProvenancedExcerpt', ProvenancedExcerptSchema, contextPacketFixture.excerpts[0]],
		['ArtifactReference', ArtifactReferenceSchema, contextPacketFixture.artifact_refs[0]],
		['ArtifactProvenance', ArtifactProvenanceSchema, artifactProvenanceFixture],
		['ArtifactDraft', ArtifactDraftSchema, artifactDraftFixture],
		['RetrievalOption', RetrievalOptionSchema, contextPacketFixture.retrieval_options[0]],
		['ProjectScope', ProjectScopeSchema, projectScopeFixture],
		['DirectOperation', DirectOperationSchema, directActionFixture.operations[0]]
	])('%s leaf contract', (_name, schema, fixture) => {
		expect(schema.safeParse(fixture).success).toBe(true);
	});
});
