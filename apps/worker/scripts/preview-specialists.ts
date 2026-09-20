// apps/worker/scripts/preview-specialists.ts
// Read-only catalog/selection preview. No credentials, database, or model calls.
import {
	SPECIALIST_REGISTRY_V1,
	ProjectReviewAgentSelectorV1,
	type AgentSelectionInputV1
} from '@buildos/agentic-chat-runtime/specialists';

async function main() {
	const definitions = SPECIALIST_REGISTRY_V1.list();
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
	if (process.argv.includes('--json')) {
		process.stdout.write(JSON.stringify({ definitions, selections }, null, 2) + '\n');
		return;
	}
	const lines = [
		'# Specialist catalog',
		'',
		'The current project review uses these exact version-1 definitions. This preview makes no model calls.',
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
		'Definitions describe capabilities; the host must authorize them. Adding a definition alone does not enable execution, tools, or a new workflow.',
		''
	);
	process.stdout.write(lines.join('\n'));
}

void main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
