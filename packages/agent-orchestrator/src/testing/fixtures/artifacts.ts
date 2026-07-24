// packages/agent-orchestrator/src/testing/fixtures/artifacts.ts
import type {
	AgentResult,
	ArtifactDraft,
	ArtifactEnvelope,
	ArtifactProvenance,
	ContextPacket
} from '../../contracts';
import {
	acceptanceResultFixture,
	directRouteDecisionFixture,
	FIXTURE_IDS,
	FIXTURE_NOW,
	projectScopeFixture
} from './base';

export const artifactProvenanceFixture = {
	relationship: 'derived_from',
	source: {
		source_type: 'buildos_entity',
		source_id: FIXTURE_IDS.project,
		source_uri: null,
		project_id: FIXTURE_IDS.project,
		captured_at: FIXTURE_NOW
	}
} satisfies ArtifactProvenance;

export const artifactDraftFixture = {
	schema_version: 1,
	artifact_type: 'status_summary',
	summary: 'The launch is blocked by an incomplete approval.',
	payload: {
		blocker: 'approval',
		status: 'blocked'
	},
	provenance: [artifactProvenanceFixture]
} satisfies ArtifactDraft;

export const artifactEnvelopeFixture = {
	...artifactDraftFixture,
	artifact_version: 2,
	run_id: FIXTURE_IDS.run,
	producer_step_id: FIXTURE_IDS.step,
	supersedes_artifact_id: FIXTURE_IDS.previousArtifact,
	created_at: FIXTURE_NOW
} satisfies ArtifactEnvelope;

export const contextPacketFixture = {
	schema_version: 1,
	objective: directRouteDecisionFixture.objective,
	project_scope: [projectScopeFixture],
	facts: [
		{
			fact_id: FIXTURE_IDS.fact,
			statement: 'Launch approval is incomplete.',
			source: artifactProvenanceFixture.source,
			as_of: FIXTURE_NOW,
			confidence: 0.98
		}
	],
	excerpts: [
		{
			excerpt_id: FIXTURE_IDS.excerpt,
			text: 'Approval remains pending.',
			source: artifactProvenanceFixture.source,
			locator: 'Project status field'
		}
	],
	artifact_refs: [
		{
			artifact_id: FIXTURE_IDS.artifact,
			artifact_type: artifactEnvelopeFixture.artifact_type,
			artifact_version: artifactEnvelopeFixture.artifact_version,
			summary: artifactEnvelopeFixture.summary
		}
	],
	constraints: ['Read-only execution.'],
	intentionally_excluded: ['Full chat history.'],
	retrieval_options: [
		{
			option_id: 'load.status.artifact',
			kind: 'artifact_load',
			operation: 'artifact.load',
			label: 'Load the full status artifact',
			reason: 'The bounded summary may not contain the full approval history.',
			arguments: { artifact_id: FIXTURE_IDS.artifact }
		}
	],
	as_of: FIXTURE_NOW
} satisfies ContextPacket;

export const agentResultFixture = {
	schema_version: 1,
	status: 'completed',
	summary: artifactDraftFixture.summary,
	artifact_drafts: [artifactDraftFixture],
	acceptance_results: [acceptanceResultFixture],
	open_questions: [],
	assumptions: ['The project snapshot is current as of the packet timestamp.'],
	residual_risks: [],
	confidence: 0.94,
	capability_gaps: []
} satisfies AgentResult;
