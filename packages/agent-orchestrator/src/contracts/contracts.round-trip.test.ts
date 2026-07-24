// packages/agent-orchestrator/src/contracts/contracts.round-trip.test.ts
import { describe, expect, it } from 'vitest';

import {
	AgentResultSchema,
	ArtifactEnvelopeSchema,
	ContextPacketSchema,
	RouteDecisionSchema,
	StepAssignmentSchema,
	WorkflowStateDigestSchema
} from '.';
import {
	agentResultFixture,
	artifactEnvelopeFixture,
	contextPacketFixture,
	directRouteDecisionFixture,
	stepAssignmentFixture,
	workflowStateDigestFixture
} from '../testing/fixtures';

function jsonRoundTrip(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

describe('persisted contract round trips', () => {
	it.each([
		['route project IDs', RouteDecisionSchema, directRouteDecisionFixture],
		['assignment permissions', StepAssignmentSchema, stepAssignmentFixture],
		['context provenance', ContextPacketSchema, contextPacketFixture],
		['artifact provenance and lineage', ArtifactEnvelopeSchema, artifactEnvelopeFixture],
		['agent result artifacts', AgentResultSchema, agentResultFixture],
		[
			'workflow digest IDs and permissions',
			WorkflowStateDigestSchema,
			workflowStateDigestFixture
		]
	])('preserves %s', (_name, schema, fixture) => {
		const parsed = schema.parse(jsonRoundTrip(fixture));

		expect(parsed).toEqual(fixture);
	});
});
