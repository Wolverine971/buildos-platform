// apps/worker/scripts/preview-specialists.ts
// Read-only catalog/selection preview. No credentials, database, or model calls.
import {
	SPECIALIST_REGISTRY_V6,
	buildDocumentOrganizationSnapshotV2,
	buildDocumentReadSnapshotV2,
	buildDocumentEvidenceSnapshotV2,
	DOCUMENT_READ_LIMITS,
	hashSpecialistSnapshotV2,
	ProjectReviewAgentSelectorV1,
	type AgentSelectionInputV1
} from '@buildos/agentic-chat-runtime/specialists';

async function main() {
	const definitions = SPECIALIST_REGISTRY_V6.list();
	const selector = new ProjectReviewAgentSelectorV1();
	const baseline: AgentSelectionInputV1 = {
		intent: 'project_review',
		question: 'What should happen next?',
		context: { type: 'project', projectId: 'preview-project' },
		eligibleSpecialists: definitions.map(({ id, version }) => ({ id, version })),
		maxSpecialists: 2
	};
	const scenarios: Array<{ name: string; input: AgentSelectionInputV1 }> = [
		{ name: 'Explicit project review', input: baseline },
		{ name: 'Ordinary chat', input: { ...baseline, intent: 'auto' } },
		{
			name: 'Missing reviewer eligibility',
			input: { ...baseline, eligibleSpecialists: baseline.eligibleSpecialists.slice(0, 1) }
		},
		{ name: 'Only one specialist permitted', input: { ...baseline, maxSpecialists: 1 } }
	];
	const selections = await Promise.all(
		scenarios.map(async ({ name, input }) => ({ name, receipt: await selector.select(input) }))
	);
	const documentOrganization = buildDocumentOrganizationSnapshotV2();
	const snapshotHash = await hashSpecialistSnapshotV2(documentOrganization);
	const documentReads = buildDocumentReadSnapshotV2();
	const documentReadsHash = await hashSpecialistSnapshotV2(documentReads);
	const documentEvidence = buildDocumentEvidenceSnapshotV2();
	const documentEvidenceHash = await hashSpecialistSnapshotV2(documentEvidence);
	if (process.argv.includes('--json')) {
		process.stdout.write(
			JSON.stringify(
				{
					definitions,
					selections,
					documentOrganization,
					snapshotHash,
					documentReads,
					documentReadsHash,
					documentEvidence,
					documentEvidenceHash,
					documentReadLimits: DOCUMENT_READ_LIMITS
				},
				null,
				2
			) + '\n'
		);
		return;
	}
	const lines = [
		'# Specialist catalog',
		'',
		'Project review uses analyst + reviewer; document organization uses document organizer + reviewer. This preview makes no model calls.',
		'',
		'## Definitions',
		''
	];
	for (const definition of definitions) {
		lines.push(
			`### ${definition.label}`,
			'',
			`**${definition.id}@${definition.version}** — ${definition.description}`,
			'',
			`- Expertise: ${definition.expertise.join(', ')}`,
			`- Knowledge: ${definition.knowledge.map((item) => `${item.id}@${item.version}`).join(', ')}`,
			`- Input contract: ${definition.inputContract}`,
			`- Output contract: ${definition.outputContract}`,
			`- Tools: ${definition.capabilities.allowedToolIds.join(', ') || 'none'}`,
			`- Workflows this specialist may invoke: ${definition.capabilities.allowedWorkflowIds.join(', ') || 'none'}`,
			`- Model: ${definition.modelPolicy.primaryModel}; fallback: ${definition.modelPolicy.fallbackModels.join(', ')}`,
			`- Output limit: ${definition.limits.maxOutputTokens} tokens including reasoning; at most ${definition.limits.maxAttempts} attempts`,
			`- Request timeout: ${definition.limits.requestTimeoutMs / 1000} seconds`,
			`- Shared workflow ceiling: $${(definition.budgetPolicy.maxSpendMicroUsd / 1_000_000).toFixed(2)} / ${definition.budgetPolicy.wholeRunLifetimeMs / 60_000} minutes`,
			'',
			'**Default assignment**',
			'',
			definition.instructions.defaultAssignment,
			'',
			'**System instructions**',
			'',
			definition.instructions.system,
			''
		);
	}
	lines.push(
		'## Selection preview',
		'',
		'This deterministic selector is the baseline for a future Jev adapter. The current v1 runner keeps its fixed roster.',
		'',
		'| Request | Outcome | Selected definitions | Reason |',
		'| --- | --- | --- | --- |'
	);
	for (const { name, receipt } of selections) {
		lines.push(
			`| ${name} | ${receipt.outcome} | ${receipt.selected.map((ref) => `${ref.id}@${ref.version}`).join(', ') || '—'} | ${receipt.reason} |`
		);
	}
	lines.push(
		'',
		`Document organization profile: ${documentOrganization.version}; fixed selector ${documentOrganization.selector.id}@1. Snapshot SHA-256: ${snapshotHash}.`,
		'',
		`Read-capable profile: document_organization@2, document_organizer@2; one batch of ${DOCUMENT_READ_LIMITS.maxDocuments} documents, up to ${DOCUMENT_READ_LIMITS.maxCharactersPerDocument} characters / ${DOCUMENT_READ_LIMITS.maxSerializedBytesPerDocument} serialized bytes each. Snapshot SHA-256: ${documentReadsHash}.`,
		'',
		`Shared-evidence profile: document_organization@3; document_organizer@2 followed by risk_reviewer@2 using the saved read batch. Snapshot SHA-256: ${documentEvidenceHash}.`,
		'',
		'Project review v3: project_analyst@3 + risk_reviewer@4; source-bound excerpts, computed dates and selection-only synthesis. Requires its migration and AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED on worker and web.',
		'Project review v2: project_analyst@2 + risk_reviewer@3; richer saved evidence and explicit abstention. Requires its migration and AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED on worker and web.',
		'',
		'Enable only after migration and deployment: AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED=true on web and every worker.',
		'',
		'Definitions describe capabilities; the host must authorize them. Adding a definition alone does not enable execution, tools, or a new workflow.',
		''
	);
	process.stdout.write(lines.join('\n'));
}

void main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
