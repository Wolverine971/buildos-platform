// apps/worker/src/workers/agentic-chat/workflow/role-report.ts
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import type {
	AgenticChatWorkflowEvidenceRefV1,
	AgenticChatWorkflowRoleReportV1
} from '@buildos/shared-types';

/**
 * Tasker 83 bounded role contract for the read-only project review.
 *
 * Specialist drafts stay private until this validator accepts them. JSON shape
 * alone is not success: a report is accepted only when at least one finding cites
 * a record that was actually supplied as project evidence. Output budgets include
 * hidden reasoning, which the DeepSeek V4.1 Flash reviewer spent at 1.6k-2.6k
 * tokens across the retained QA runs (a 3,200 cap left ~600 visible tokens).
 * The acting client clamps every request to AGENTIC_CHAT_ACTING_MAX_TOKENS
 * (4,000), so no role asks for more than that.
 */
export const CHAT_WORKFLOW_ROLE_REPORT_VERSION = 'chat_workflow_role_report_v1' as const;

export const CHAT_WORKFLOW_DISPATCH_POLICY = {
	planner: { maxOutputTokens: 1_200, attempts: 1 },
	specialist: { maxOutputTokens: 4_000, attempts: 2 },
	editor: { maxOutputTokens: 3_200, attempts: 1 },
	reasoningEffort: 'low',
	/** A compact retry starts only when this much of the provider budget remains. */
	retryMinRemainingMs: 75_000,
	/**
	 * Application-level provider calls: planner, two specialists with one compact
	 * retry each, and editor. Client transport retries or route fallbacks inside one
	 * call are further physical requests; Tasker 87's dispatch hook meters those.
	 */
	maxProviderCalls: 6
} as const;

/** Hard validator limits. Prompts ask for less so ordinary overshoot still fits. */
export const CHAT_WORKFLOW_ROLE_REPORT_LIMITS = {
	findings: 5,
	risks: 4,
	unknowns: 4,
	referencesPerItem: 4,
	summaryChars: 280,
	claimChars: 320,
	riskChars: 280,
	unknownChars: 240,
	recommendationChars: 480,
	referenceChars: 128
} as const;

const COMPACT_COUNTS = { findings: 3, risks: 2, unknowns: 2 } as const;
const LABEL_CHARS = 80;
const MAX_EVIDENCE_RECORDS = 2_000;

export type ChatWorkflowSpecialistRole = 'project_analyst' | 'risk_reviewer';
export type ChatWorkflowEvidenceRef = { id: string; label: string };

export type ChatWorkflowRoleReportV1 = {
	version: typeof CHAT_WORKFLOW_ROLE_REPORT_VERSION;
	role: ChatWorkflowSpecialistRole;
	summary: string;
	findings: Array<{
		claim: string;
		basis: 'recorded' | 'inferred';
		evidence: ChatWorkflowEvidenceRef[];
	}>;
	risks: Array<{ risk: string; evidence: ChatWorkflowEvidenceRef[] }>;
	unknowns: string[];
	recommendation: string;
	/** Cited ids that were not in the supplied evidence and were removed. */
	unsupportedReferences: number;
	/** Findings discarded because none of their references were supplied. */
	unsupportedFindings: number;
};

export type ChatWorkflowRoleReportParseResult =
	| { ok: true; report: ChatWorkflowRoleReportV1 }
	| { ok: false; reason: string };

const EVIDENCE_KINDS: Record<string, string> = {
	project: 'project',
	goals: 'goal',
	milestones: 'milestone',
	plans: 'plan',
	tasks: 'task',
	documents: 'document',
	events: 'event',
	start_here: 'start here'
};

/** Record ids a report may cite, taken from the same packet the brief serializes. */
export function buildWorkflowEvidenceIndex(context: MasterPromptContext): Map<string, string> {
	const index = new Map<string, string>();
	const data = context.data as Record<string, unknown> | null | undefined;
	if (!data || typeof data !== 'object') return index;
	const visit = (value: unknown, kind: string, depth: number) => {
		if (index.size >= MAX_EVIDENCE_RECORDS || depth > 3 || !value || typeof value !== 'object')
			return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item, kind, depth + 1);
			return;
		}
		const record = value as Record<string, unknown>;
		const id = record.id;
		if (
			typeof id === 'string' &&
			id.length > 0 &&
			id.length <= CHAT_WORKFLOW_ROLE_REPORT_LIMITS.referenceChars &&
			!index.has(id)
		) {
			const name = [record.title, record.name].find(
				(candidate): candidate is string =>
					typeof candidate === 'string' && candidate.trim().length > 0
			);
			const text = (name ?? id).trim().replace(/\s+/g, ' ');
			index.set(
				id,
				`${kind}: ${text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text}`
			);
		}
		for (const child of Object.values(record)) {
			if (child && typeof child === 'object') visit(child, 'record', depth + 1);
		}
	};
	for (const [key, kind] of Object.entries(EVIDENCE_KINDS)) visit(data[key], kind, 0);
	return index;
}

export function buildSpecialistReportInstructions(
	assignment: string,
	retry?: { reason: string }
): string {
	const L = CHAT_WORKFLOW_ROLE_REPORT_LIMITS;
	const counts = retry ? COMPACT_COUNTS : L;
	return `${assignment}

Return only one JSON object, with no Markdown or commentary:
{"summary":"...","findings":[{"claim":"...","basis":"recorded","evidence":["<record id>"]}],"risks":[{"risk":"...","evidence":["<record id>"]}],"unknowns":["..."],"recommendation":"..."}
- findings: 1-${counts.findings} items. Each claim is under 240 characters and cites 1-${L.referencesPerItem} record ids copied exactly from PROJECT EVIDENCE. A finding without a supplied id is discarded.
- basis is "recorded" only when the records state it; otherwise "inferred".
- risks: at most ${counts.risks}; unknowns: at most ${counts.unknowns}. Each is under 200 characters.
- summary is under 240 characters; recommendation is under 400 characters.
Keep private reasoning brief. The whole response, including reasoning, has a small token budget.${
		retry
			? `\n\nYour previous report was not accepted: ${retry.reason}. Write this shorter report and decide quickly.`
			: ''
	}`;
}

export function parseWorkflowRoleReport(
	text: string,
	role: ChatWorkflowSpecialistRole,
	evidence: ReadonlyMap<string, string>
): ChatWorkflowRoleReportParseResult {
	const L = CHAT_WORKFLOW_ROLE_REPORT_LIMITS;
	let data: unknown;
	try {
		data = JSON.parse(
			text
				.trim()
				.replace(/^```(?:json)?\s*/i, '')
				.replace(/\s*```$/, '')
		);
	} catch {
		return invalid('the report was not valid JSON');
	}
	if (!isRecord(data)) return invalid('the report was not a JSON object');
	const summary = boundedText(data.summary, L.summaryChars);
	if (!summary) return invalid(`summary must be 1-${L.summaryChars} characters`);
	const recommendation = boundedText(data.recommendation, L.recommendationChars);
	if (!recommendation)
		return invalid(`recommendation must be 1-${L.recommendationChars} characters`);
	if (!Array.isArray(data.findings) || !data.findings.length || data.findings.length > L.findings)
		return invalid(`findings must list 1-${L.findings} items`);
	const risksInput = data.risks ?? [];
	if (!Array.isArray(risksInput) || risksInput.length > L.risks)
		return invalid(`risks must list at most ${L.risks} items`);
	const unknownsInput = data.unknowns ?? [];
	if (!Array.isArray(unknownsInput) || unknownsInput.length > L.unknowns)
		return invalid(`unknowns must list at most ${L.unknowns} items`);

	let unsupportedReferences = 0;
	let unsupportedFindings = 0;
	const references = (value: unknown): ChatWorkflowEvidenceRef[] | null => {
		if (value === undefined) return [];
		if (!Array.isArray(value) || value.length > L.referencesPerItem) return null;
		const accepted: ChatWorkflowEvidenceRef[] = [];
		for (const item of value) {
			if (typeof item !== 'string' || item.length > L.referenceChars) return null;
			const id = item.trim();
			const label = evidence.get(id);
			if (!label) unsupportedReferences++;
			else if (!accepted.some((ref) => ref.id === id)) accepted.push({ id, label });
		}
		return accepted;
	};

	const findings: ChatWorkflowRoleReportV1['findings'] = [];
	for (const item of data.findings) {
		if (!isRecord(item)) return invalid('each finding must be an object');
		const claim = boundedText(item.claim, L.claimChars);
		if (!claim) return invalid(`each finding claim must be 1-${L.claimChars} characters`);
		if (item.basis !== 'recorded' && item.basis !== 'inferred')
			return invalid('each finding basis must be "recorded" or "inferred"');
		const refs = references(item.evidence);
		if (!refs)
			return invalid(`each finding may cite at most ${L.referencesPerItem} record ids`);
		if (!refs.length) unsupportedFindings++;
		else findings.push({ claim, basis: item.basis, evidence: refs });
	}
	if (!findings.length) return invalid('no finding cited a supplied project record');

	const risks: ChatWorkflowRoleReportV1['risks'] = [];
	for (const item of risksInput) {
		if (!isRecord(item)) return invalid('each risk must be an object');
		const risk = boundedText(item.risk, L.riskChars);
		if (!risk) return invalid(`each risk must be 1-${L.riskChars} characters`);
		const refs = references(item.evidence);
		if (!refs) return invalid(`each risk may cite at most ${L.referencesPerItem} record ids`);
		risks.push({ risk, evidence: refs });
	}
	const unknowns: string[] = [];
	for (const item of unknownsInput) {
		const unknown = boundedText(item, L.unknownChars);
		if (!unknown) return invalid(`each unknown must be 1-${L.unknownChars} characters`);
		unknowns.push(unknown);
	}

	return {
		ok: true,
		report: {
			version: CHAT_WORKFLOW_ROLE_REPORT_VERSION,
			role,
			summary,
			findings,
			risks,
			unknowns,
			recommendation,
			unsupportedReferences,
			unsupportedFindings
		}
	};
}

/** Human-readable step result. The caller still bounds it to the progress contract. */
export function renderWorkflowRoleReport(
	report: ChatWorkflowRoleReportV1,
	attempts: number
): string {
	const cite = (refs: ChatWorkflowEvidenceRef[]) =>
		refs.length ? ` [${refs.map((ref) => ref.label).join('; ')}]` : '';
	const lines = [
		report.summary,
		'',
		'Findings',
		...report.findings.map(
			(finding, i) => `${i + 1}. ${finding.claim} (${finding.basis})${cite(finding.evidence)}`
		)
	];
	if (report.risks.length)
		lines.push(
			'',
			'Risks',
			...report.risks.map((risk) => `- ${risk.risk}${cite(risk.evidence)}`)
		);
	if (report.unknowns.length)
		lines.push('', 'Unknowns', ...report.unknowns.map((unknown) => `- ${unknown}`));
	lines.push('', `Recommendation: ${report.recommendation}`);
	const notes: string[] = [];
	if (attempts > 1) notes.push('accepted after one compact retry');
	if (report.unsupportedFindings)
		notes.push(
			`${plural(report.unsupportedFindings, 'finding')} without supplied evidence removed`
		);
	if (report.unsupportedReferences)
		notes.push(`${plural(report.unsupportedReferences, 'unsupported reference')} removed`);
	if (notes.length) lines.push('', `Note: ${notes.join('; ')}.`);
	return lines.join('\n');
}

/** The editor sees accepted reports only, with record names beside their ids. */
export function workflowReportForEditor(report: ChatWorkflowRoleReportV1) {
	const refs = (items: ChatWorkflowEvidenceRef[]) =>
		items.map((ref) => `${ref.label} (${ref.id})`);
	return {
		role: report.role,
		summary: report.summary,
		findings: report.findings.map((finding) => ({
			claim: finding.claim,
			basis: finding.basis,
			evidence: refs(finding.evidence)
		})),
		risks: report.risks.map((risk) => ({ risk: risk.risk, evidence: refs(risk.evidence) })),
		unknowns: report.unknowns,
		recommendation: report.recommendation
	};
}

/**
 * Durable evidence (Tasker 85/87): a report may cite only records in the accepted
 * context's `evidenceVersions`, and each reference carries that record's version.
 * Labels come from the accepted payload when it names the record, else its kind and id.
 */
export type ChatWorkflowDurableEvidenceIndex = ReadonlyMap<
	string,
	{ kind: string; version: string; label: string }
>;

/**
 * The durable evidence index from Tasker 86's model input: the accepted evidence
 * versions with their display labels, bounded to the durable label limit.
 */
export function durableEvidenceIndexFromModelInputV1(
	evidence: ReadonlyMap<string, { recordKind: string; version: string; label: string }>
): ChatWorkflowDurableEvidenceIndex {
	const index = new Map<string, { kind: string; version: string; label: string }>();
	for (const [id, entry] of evidence) {
		index.set(id, {
			kind: entry.recordKind,
			version: entry.version,
			label: boundLabel(entry.label)
		});
	}
	return index;
}

/** The label map the 83 validator consumes, restricted to accepted evidence. */
export function durableEvidenceLabels(
	index: ChatWorkflowDurableEvidenceIndex
): Map<string, string> {
	return new Map([...index].map(([id, entry]) => [id, entry.label]));
}

/** Adds each accepted reference's durable kind and version (SQL re-checks both). */
export function toDurableWorkflowRoleReport(
	report: ChatWorkflowRoleReportV1,
	index: ChatWorkflowDurableEvidenceIndex
): AgenticChatWorkflowRoleReportV1 {
	const refs = (items: ChatWorkflowEvidenceRef[]): AgenticChatWorkflowEvidenceRefV1[] =>
		items.flatMap((ref) => {
			const entry = index.get(ref.id);
			return entry
				? [
						{
							kind: 'project_record' as const,
							id: ref.id,
							version: entry.version,
							label: entry.label
						}
					]
				: [];
		});
	return {
		version: report.version,
		role: report.role,
		summary: report.summary,
		findings: report.findings.map((finding) => ({
			claim: finding.claim,
			basis: finding.basis,
			evidence: refs(finding.evidence)
		})),
		risks: report.risks.map((risk) => ({ risk: risk.risk, evidence: refs(risk.evidence) })),
		unknowns: [...report.unknowns],
		recommendation: report.recommendation,
		unsupportedReferences: report.unsupportedReferences,
		unsupportedFindings: report.unsupportedFindings
	};
}

/** Reads an accepted durable report back into the renderer's shape. */
export function fromDurableWorkflowRoleReport(
	report: AgenticChatWorkflowRoleReportV1
): ChatWorkflowRoleReportV1 {
	const refs = (items: AgenticChatWorkflowEvidenceRefV1[]) =>
		items.map((ref) => ({ id: ref.id, label: ref.label }));
	return {
		version: CHAT_WORKFLOW_ROLE_REPORT_VERSION,
		role: report.role,
		summary: report.summary,
		findings: report.findings.map((finding) => ({
			claim: finding.claim,
			basis: finding.basis,
			evidence: refs(finding.evidence)
		})),
		risks: report.risks.map((risk) => ({ risk: risk.risk, evidence: refs(risk.evidence) })),
		unknowns: [...report.unknowns],
		recommendation: report.recommendation,
		unsupportedReferences: report.unsupportedReferences,
		unsupportedFindings: report.unsupportedFindings
	};
}

/** SQL bounds evidence labels at 80 code points, including the kind prefix. */
function boundLabel(value: string): string {
	const points = Array.from(value.trim().replace(/\s+/g, ' '));
	if (!points.length) return 'record';
	return points.length > LABEL_CHARS
		? `${points.slice(0, LABEL_CHARS - 1).join('')}…`
		: value.trim().replace(/\s+/g, ' ');
}

function invalid(reason: string): ChatWorkflowRoleReportParseResult {
	return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return text.length > 0 && text.length <= maximum ? text : null;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
