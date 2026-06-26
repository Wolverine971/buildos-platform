// packages/shared-agent-ops/src/proposal-context/build-proposal-context.ts
import type {
	LoopOperation,
	ProjectLoopRiskTier,
	ProjectSuggestionEvidenceRef,
	ProjectSuggestionKind,
	ProjectSuggestionPreview,
	ProjectSuggestionStatus
} from '@buildos/shared-types';
import { decodeLoopOperations, type DecodedLoopOperation } from './decode-operations';

export type ProposalContextSuggestion = {
	id: string;
	run_id?: string | null;
	project_id: string;
	kind: ProjectSuggestionKind | string;
	risk_tier: ProjectLoopRiskTier | number;
	title: string;
	rationale?: string | null;
	why_now?: string | null;
	confidence?: number | null;
	evidence_refs?: ProjectSuggestionEvidenceRef[] | unknown;
	preview?: ProjectSuggestionPreview | null | unknown;
	operations?: LoopOperation[] | unknown;
	status?: ProjectSuggestionStatus | string | null;
	reversible?: boolean | null;
	freshness_state?: string | null;
	created_at?: string | null;
};

export type ProposalContextLoopRun = {
	id?: string | null;
	trigger_reason?: string | null;
	summary?: string | null;
	created_at?: string | null;
	finished_at?: string | null;
};

export type BuildProposalContextOptions = {
	suggestion: ProposalContextSuggestion;
	projectName?: string | null;
	loopRun?: ProposalContextLoopRun | null;
	maxEvidence?: number;
};

export type BuiltProposalContext = {
	humanText: string;
	llmText: string;
	operationSummaries: string[];
	evidenceSummaries: string[];
};

const kindLabel: Record<string, string> = {
	doc_org: 'Document organization',
	doc_outdated: 'Outdated documentation',
	drift: 'Project drift',
	task_conflict: 'Task conflict'
};

const riskLabel: Record<number, string> = {
	1: 'Low risk',
	2: 'Needs review',
	3: 'High risk'
};

function compactText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length <= maxLength
		? normalized
		: `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeOperations(value: unknown): LoopOperation[] {
	if (!Array.isArray(value)) return [];
	return value.filter((operation): operation is LoopOperation => {
		if (!operation || typeof operation !== 'object') return false;
		const record = operation as Record<string, unknown>;
		return typeof record.tool === 'string';
	});
}

function normalizeEvidence(value: unknown): ProjectSuggestionEvidenceRef[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object')
		.map((ref) => ({
			entity_type:
				typeof ref.entity_type === 'string'
					? (ref.entity_type as ProjectSuggestionEvidenceRef['entity_type'])
					: 'unknown',
			entity_id: typeof ref.entity_id === 'string' ? ref.entity_id : undefined,
			title:
				compactText(ref.title, 140) ?? compactText(ref.entity_id, 80) ?? 'Untitled source',
			reason: compactText(ref.reason, 240) ?? undefined,
			excerpt: compactText(ref.excerpt, 360) ?? undefined,
			updated_at: typeof ref.updated_at === 'string' ? ref.updated_at : undefined
		}));
}

function normalizePreview(value: unknown): ProjectSuggestionPreview | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const summary = compactText(record.summary, 420);
	if (!summary) return null;
	return {
		kind:
			typeof record.kind === 'string'
				? (record.kind as ProjectSuggestionPreview['kind'])
				: undefined,
		summary,
		before: Array.isArray(record.before)
			? record.before
					.map((item) => compactText(item, 180))
					.filter((item): item is string => Boolean(item))
			: undefined,
		after: Array.isArray(record.after)
			? record.after
					.map((item) => compactText(item, 180))
					.filter((item): item is string => Boolean(item))
			: undefined,
		impact: compactText(record.impact, 360) ?? undefined
	};
}

function formatPercent(value: number | null | undefined): string | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return `${Math.round(value * 100)}% confidence`;
}

function formatDate(value: string | null | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function operationSummary(operation: DecodedLoopOperation, index: number): string {
	const title = [
		`${index + 1}. ${operation.actionLabel} ${operation.entityLabel}`,
		operation.target ? `: ${operation.target}` : '',
		operation.summary ? ` - ${operation.summary}` : ''
	].join('');
	const changes = operation.changes.map((change) => `   - ${change.label}: ${change.value}`);
	return changes.length ? [title, ...changes].join('\n') : title;
}

function evidenceSummary(ref: ProjectSuggestionEvidenceRef, index: number): string {
	const parts = [
		`${index + 1}. ${ref.entity_type}: ${ref.title}`,
		ref.reason ? `Reason: ${ref.reason}` : null,
		ref.excerpt ? `Excerpt: "${ref.excerpt}"` : null,
		ref.updated_at ? `Updated: ${formatDate(ref.updated_at) ?? ref.updated_at}` : null
	].filter((part): part is string => Boolean(part));
	return parts.join('\n   ');
}

function appendSection(lines: string[], title: string, body: string | string[] | null | undefined) {
	const values = Array.isArray(body) ? body.filter(Boolean) : body ? [body] : [];
	if (values.length === 0) return;
	lines.push('', `## ${title}`, ...values);
}

export function buildProjectSuggestionProposalContext({
	suggestion,
	projectName,
	loopRun,
	maxEvidence = 5
}: BuildProposalContextOptions): BuiltProposalContext {
	const operations = normalizeOperations(suggestion.operations);
	const decodedOperations = decodeLoopOperations(operations);
	const operationSummaries = decodedOperations.map(operationSummary);
	const evidence = normalizeEvidence(suggestion.evidence_refs).slice(0, maxEvidence);
	const evidenceSummaries = evidence.map(evidenceSummary);
	const preview = normalizePreview(suggestion.preview);
	const confidence = formatPercent(suggestion.confidence);
	const risk = riskLabel[suggestion.risk_tier] ?? `Risk tier ${suggestion.risk_tier}`;
	const kind = kindLabel[suggestion.kind] ?? suggestion.kind;

	const summaryLines = [
		`Project: ${projectName?.trim() || 'Project'}`,
		`Review family: ${kind}`,
		`Risk: ${risk}`,
		confidence,
		suggestion.reversible === false
			? 'Reversible: No'
			: suggestion.reversible === true
				? 'Reversible: Yes'
				: null,
		suggestion.freshness_state ? `Freshness: ${suggestion.freshness_state}` : null,
		loopRun?.trigger_reason ? `Review trigger: ${loopRun.trigger_reason}` : null,
		loopRun?.finished_at || loopRun?.created_at
			? `Review date: ${formatDate(loopRun.finished_at ?? loopRun.created_at) ?? loopRun.finished_at ?? loopRun.created_at}`
			: null
	].filter((line): line is string => Boolean(line));

	const previewLines: string[] = [];
	if (preview?.summary) previewLines.push(preview.summary);
	if (preview?.impact) previewLines.push(`Impact: ${preview.impact}`);
	if (preview?.before?.length)
		previewLines.push(`Before:\n${preview.before.map((line) => `- ${line}`).join('\n')}`);
	if (preview?.after?.length)
		previewLines.push(`After:\n${preview.after.map((line) => `- ${line}`).join('\n')}`);

	const humanLines = [
		'Project review item ready to discuss.',
		'',
		`# ${suggestion.title.trim() || 'Project review item'}`,
		...summaryLines
	];

	appendSection(humanLines, 'Why now', compactText(suggestion.why_now, 700));
	appendSection(humanLines, 'Rationale', compactText(suggestion.rationale, 900));
	appendSection(humanLines, 'Preview', previewLines);
	appendSection(humanLines, 'Proposed changes', operationSummaries);
	appendSection(humanLines, 'Evidence', evidenceSummaries);
	appendSection(humanLines, 'Review summary', compactText(loopRun?.summary, 700));
	humanLines.push(
		'',
		'I can help you inspect the evidence, compare alternatives, revise the proposal, or reason through whether to apply or dismiss it.'
	);

	const llmLines = [
		'You are discussing a BuildOS Project Review suggestion with the user.',
		'Use the proposal context below as source material. Be explicit about evidence, risk, tradeoffs, and possible alternatives. Applying or dismissing the inbox item remains a separate decision unless the user clearly asks you to perform a project edit.',
		'',
		...humanLines
	];

	return {
		humanText: humanLines.join('\n'),
		llmText: llmLines.join('\n'),
		operationSummaries,
		evidenceSummaries
	};
}
