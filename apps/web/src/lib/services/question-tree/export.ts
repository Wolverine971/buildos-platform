import { strToU8, zipSync } from 'fflate';
import type {
	QuestionTreeClaim,
	QuestionTreeNode,
	QuestionTreeRunDetail,
	QuestionTreeSynthesis
} from './types';

export type QuestionTreeExportOptions = {
	exportedAt?: Date;
};

const section = (lines: string[]): string => `${lines.join('\n').trimEnd()}\n`;
const jsonFile = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function filenamePart(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 54);
	return normalized || 'research';
}

function inline(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === '') return '—';
	return String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function text(value: string | null | undefined, fallback = '_None recorded._'): string {
	return value?.trim() || fallback;
}

function humanize(value: string): string {
	return value
		.split('_')
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(' ');
}

function bulletList(items: string[], fallback = '_None identified._'): string[] {
	return items.length > 0 ? items.map((item) => `- ${item}`) : [fallback];
}

function nodeLabel(node: QuestionTreeNode): string {
	return node.node_kind === 'root' ? 'Root' : `Node ${node.node_number}`;
}

function nodeReference(nodeId: string | null, nodesById: Map<string, QuestionTreeNode>): string {
	if (!nodeId) return 'Run';
	const node = nodesById.get(nodeId);
	return node ? `${nodeLabel(node)} (${node.id})` : nodeId;
}

function claimLines(claims: QuestionTreeClaim[] | null): string[] {
	if (!claims?.length) return ['_No node-level claims recorded._'];
	return claims.flatMap((claim) => [
		`- **${humanize(claim.status)}:** ${claim.statement}`,
		`  - Basis: ${claim.basis}`
	]);
}

function synthesisLines(synthesis: QuestionTreeSynthesis | null): string[] {
	if (!synthesis) {
		return [
			'## Final synthesis',
			'',
			'_A final synthesis has not been recorded for this run._',
			''
		];
	}

	return [
		'## Final synthesis',
		'',
		'### Final thesis',
		'',
		text(synthesis.finalThesis),
		'',
		'### Final answer',
		'',
		text(synthesis.finalAnswer),
		'',
		'## Confidence assessment',
		'',
		'### Probably right',
		'',
		...bulletList(synthesis.probablyRight),
		'',
		'### Probably wrong',
		'',
		...bulletList(synthesis.probablyWrong),
		'',
		'### Still unsure',
		'',
		...bulletList(synthesis.stillUnsure),
		'',
		'## Key evidence',
		'',
		...(synthesis.keyEvidence.length > 0
			? synthesis.keyEvidence.map(
					(entry) =>
						`- ${entry.finding} _(nodes: ${entry.nodeNumbers.length ? entry.nodeNumbers.join(', ') : 'none cited'})_`
				)
			: ['_None identified._']),
		'',
		'## Important disagreements',
		'',
		...(synthesis.importantDisagreements.length > 0
			? synthesis.importantDisagreements.map(
					(entry) =>
						`- ${entry.issue} _(nodes: ${entry.nodeNumbers.length ? entry.nodeNumbers.join(', ') : 'none cited'})_`
				)
			: ['_None identified._']),
		'',
		'## Recommended next research',
		'',
		...bulletList(synthesis.recommendedNextResearch),
		'',
		'## Limitations',
		'',
		...bulletList(synthesis.limitations),
		''
	];
}

export function buildQuestionTreeExportName(detail: QuestionTreeRunDetail): string {
	const createdDate = detail.run.created_at.slice(0, 10) || 'undated';
	return `question-tree-${filenamePart(detail.run.root_question)}-${createdDate}-${detail.run.id.slice(0, 8)}`;
}

function buildReadme(detail: QuestionTreeRunDetail, exportedAt: Date): string {
	return section([
		'# Question Tree research export',
		'',
		`> ${detail.run.root_question}`,
		'',
		'## Export metadata',
		'',
		`- **Exported at:** ${exportedAt.toISOString()}`,
		`- **Run ID:** ${detail.run.id}`,
		`- **Run status:** ${humanize(detail.run.status)}`,
		`- **Run phase:** ${humanize(detail.run.phase)}`,
		`- **Created at:** ${detail.run.created_at}`,
		`- **Completed at:** ${inline(detail.run.completed_at)}`,
		`- **Nodes:** ${detail.nodes.length} total; ${detail.run.nodes_completed} answered; ${detail.run.nodes_failed} failed`,
		`- **Proposals:** ${detail.proposals.length}`,
		`- **Lifecycle events:** ${detail.events.length}`,
		`- **Model requests:** ${detail.run.provider_requests}/${detail.run.max_provider_requests}`,
		`- **Tokens:** ${detail.run.usage.total_tokens}`,
		`- **Cost (USD):** ${detail.run.usage.cost_usd}`,
		'',
		...synthesisLines(detail.run.synthesis),
		'## Files',
		'',
		'- `synthesis.md` — final answer, confidence buckets, evidence, disagreements, next research, and limitations.',
		'- `research-tree.md` — every question node with its answer, thesis, confidence, and node-level claims.',
		'- `proposals.md` — every proposed branch, including branches that were not selected.',
		'- `events.md` — the complete ordered lifecycle event log.',
		'- `raw/complete-export.json` — the full machine-readable export in one file.',
		'- `raw/run.json`, `raw/nodes.json`, `raw/proposals.json`, `raw/events.json`, and `raw/synthesis.json` — the same primary records split by type.',
		''
	]);
}

function buildSynthesis(detail: QuestionTreeRunDetail): string {
	return section([
		`# Synthesis: ${detail.run.root_question}`,
		'',
		`- **Run ID:** ${detail.run.id}`,
		`- **Status:** ${humanize(detail.run.status)}`,
		'',
		...synthesisLines(detail.run.synthesis)
	]);
}

function buildResearchTree(detail: QuestionTreeRunDetail): string {
	const nodes = [...detail.nodes].sort((a, b) => a.node_number - b.node_number);
	const nodesById = new Map(nodes.map((node) => [node.id, node]));
	const proposalsByNode = new Map<string, typeof detail.proposals>();
	for (const proposal of detail.proposals) {
		const current = proposalsByNode.get(proposal.source_node_id) ?? [];
		current.push(proposal);
		proposalsByNode.set(proposal.source_node_id, current);
	}

	const lines = [
		`# Research tree: ${detail.run.root_question}`,
		'',
		`This file contains all ${nodes.length} tree nodes in node-number order.`,
		''
	];

	for (const node of nodes) {
		const proposals = proposalsByNode.get(node.id) ?? [];
		lines.push(
			`## ${nodeLabel(node)} — ${node.question}`,
			'',
			`- **Node ID:** ${node.id}`,
			`- **Parent:** ${nodeReference(node.parent_node_id, nodesById)}`,
			`- **Depth:** ${node.depth}`,
			`- **Status:** ${humanize(node.status)}`,
			`- **Confidence:** ${node.confidence === null ? '—' : `${Math.round(node.confidence * 100)}%`}`,
			`- **Model used:** ${inline(node.model_used)}`,
			`- **Attempts:** ${node.attempt_count}`,
			`- **Tokens:** ${node.prompt_tokens + node.completion_tokens + node.reasoning_tokens}`,
			`- **Cost (USD):** ${node.cost_usd}`,
			`- **Latency (ms):** ${node.latency_ms}`,
			'',
			'### Answer',
			'',
			text(node.answer, '_No answer was recorded._'),
			'',
			'### Thesis',
			'',
			text(node.thesis),
			'',
			'### Epistemic assessment',
			'',
			...claimLines(node.epistemic_assessment),
			'',
			'### Produced questions',
			'',
			...(proposals.length > 0
				? [...proposals]
						.sort((a, b) => a.rank - b.rank)
						.map(
							(proposal) =>
								`- ${proposal.question} _(${humanize(proposal.purpose)}; ${humanize(proposal.status)}; ${humanize(proposal.expected_information_gain)} information gain)_`
						)
				: ['_No follow-up questions were recorded._']),
			''
		);
	}

	return section(lines);
}

function buildProposals(detail: QuestionTreeRunDetail): string {
	const nodesById = new Map(detail.nodes.map((node) => [node.id, node]));
	const proposals = [...detail.proposals].sort((a, b) => {
		const sourceDifference =
			(nodesById.get(a.source_node_id)?.node_number ?? 0) -
			(nodesById.get(b.source_node_id)?.node_number ?? 0);
		return sourceDifference || a.rank - b.rank;
	});
	const lines = [
		`# Proposed questions: ${detail.run.root_question}`,
		'',
		`This file contains all ${proposals.length} proposals, including unselected and rejected branches.`,
		''
	];

	for (const proposal of proposals) {
		lines.push(
			`## ${nodeReference(proposal.source_node_id, nodesById)} · proposal ${proposal.rank + 1}`,
			'',
			proposal.question,
			'',
			`- **Proposal ID:** ${proposal.id}`,
			`- **Purpose:** ${humanize(proposal.purpose)}`,
			`- **Status:** ${humanize(proposal.status)}`,
			`- **Expected information gain:** ${humanize(proposal.expected_information_gain)}`,
			`- **Model priority:** ${inline(proposal.model_priority)}`,
			`- **Scheduler score:** ${inline(proposal.scheduler_score)}`,
			`- **Spawned child:** ${nodeReference(proposal.child_node_id, nodesById)}`,
			`- **Duplicate of:** ${nodeReference(proposal.duplicate_of_node_id, nodesById)}`,
			'',
			'### Why it matters',
			'',
			text(proposal.why_it_matters),
			'',
			'### Target claim',
			'',
			text(proposal.target_claim),
			'',
			'### Validation',
			'',
			text(proposal.validation_error, '_No validation error._'),
			''
		);
	}

	return section(lines);
}

function buildEvents(detail: QuestionTreeRunDetail): string {
	const nodesById = new Map(detail.nodes.map((node) => [node.id, node]));
	const events = [...detail.events].sort((a, b) => a.seq - b.seq);
	const lines = [
		`# Lifecycle events: ${detail.run.root_question}`,
		'',
		`This is the complete ordered event log (${events.length} events).`,
		''
	];

	for (const event of events) {
		lines.push(
			`## ${event.seq}. ${event.event_type}`,
			'',
			`- **Event ID:** ${event.id}`,
			`- **Node:** ${nodeReference(event.node_id, nodesById)}`,
			`- **Created at:** ${event.created_at}`,
			'',
			'```json',
			JSON.stringify(event.payload, null, 2),
			'```',
			''
		);
	}

	return section(lines);
}

export function buildQuestionTreeExportFiles(
	detail: QuestionTreeRunDetail,
	options: QuestionTreeExportOptions = {}
): Record<string, string> {
	const exportedAt = options.exportedAt ?? new Date();
	const completeExport = {
		schema_version: 'question-tree-export-v1',
		exported_at: exportedAt.toISOString(),
		...detail
	};

	return {
		'README.md': buildReadme(detail, exportedAt),
		'synthesis.md': buildSynthesis(detail),
		'research-tree.md': buildResearchTree(detail),
		'proposals.md': buildProposals(detail),
		'events.md': buildEvents(detail),
		'raw/complete-export.json': jsonFile(completeExport),
		'raw/run.json': jsonFile(detail.run),
		'raw/nodes.json': jsonFile(detail.nodes),
		'raw/proposals.json': jsonFile(detail.proposals),
		'raw/events.json': jsonFile(detail.events),
		'raw/synthesis.json': jsonFile(detail.run.synthesis)
	};
}

export function buildQuestionTreeExportZip(
	detail: QuestionTreeRunDetail,
	options: QuestionTreeExportOptions = {}
): Uint8Array {
	const folder = buildQuestionTreeExportName(detail);
	const files = buildQuestionTreeExportFiles(detail, options);
	const zippable: Record<string, Uint8Array> = {};
	for (const [path, contents] of Object.entries(files)) {
		zippable[`${folder}/${path}`] = strToU8(contents);
	}
	return zipSync(zippable, { level: 6 });
}
