// apps/worker/src/workers/agentic-chat/workflow/role-report.ts
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import {
	PROJECT_REVIEW_SPECIALISTS_V1,
	type ProjectReviewSpecialistIdV1
} from '@buildos/agentic-chat-runtime/specialists';
import type {
	AgenticChatWorkflowEvidenceRefV1,
	AgenticChatWorkflowReviewOutcomeV2,
	AgenticChatWorkflowRoleReport
} from '@buildos/shared-types';
import { collectRecordLabels } from './prepared-context';
import type { AgenticChatWorkflowEvidenceVersionV1, JsonObject } from '@buildos/shared-types';
import { AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2 } from '@buildos/shared-types';

/**
 * Tasker 83 bounded role contract for the read-only project review.
 *
 * Specialist drafts stay private until this validator accepts them. JSON shape
 * alone is not success: a report is accepted only when at least one finding cites
 * a record that was actually supplied as project evidence. Output budgets include
 * hidden reasoning, which the DeepSeek V4.1 Flash reviewer spent at 1.6k-2.6k
 * tokens across the retained QA runs (a 3,200 cap left ~600 visible tokens).
 * The acting client clamps every request to AGENTIC_CHAT_ACTING_MAX_TOKENS
 * (12,000), so no role asks for more than that.
 */
export const CHAT_WORKFLOW_ROLE_REPORT_VERSION = 'chat_workflow_role_report_v1' as const;

export const CHAT_WORKFLOW_DISPATCH_POLICY = {
	planner: { maxOutputTokens: 1_200, attempts: 1 },
	specialist: {
		maxOutputTokens: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.limits.maxOutputTokens,
		attempts: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.limits.maxAttempts
	},
	editor: { maxOutputTokens: 3_200, attempts: 1 },
	reasoningEffort: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.modelPolicy.reasoningEffort,
	/** A compact retry starts only when this much of the provider budget remains. */
	retryMinRemainingMs: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.limits.retryMinRemainingMs,
	/**
	 * Application-level provider calls: planner, two specialists with one compact
	 * retry each, and editor. Client transport retries or route fallbacks inside one
	 * call are further physical requests; Tasker 87's dispatch hook meters those.
	 */
	maxProviderCalls: 6
} as const;

/**
 * Hard validator limits, byte-identical to the SQL report validator. Prompts ask for less so
 * ordinary overshoot still fits, and a report that runs past a limit by up to
 * REPORT_OVERRUN_FACTOR is fitted rather than rejected (see `fittedText`).
 */
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
/**
 * Tasker 98 pilot (2026-09-23): on large projects V4.1 Flash wrote 485–573-character
 * recommendations against the 400 it was asked for and the 480 bound, and one finding cited
 * seven records. Rejecting those reports threw good work away for a compact retry (+4 s) or
 * left the review partial. Text up to this multiple of its bound is trimmed at a word; lists
 * and references keep their first items. Anything longer is still malformed.
 */
const REPORT_OVERRUN_FACTOR = 2;
const LABEL_CHARS = 80;
const MAX_EVIDENCE_RECORDS = 2_000;

export type ChatWorkflowSpecialistRole = ProjectReviewSpecialistIdV1;
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

export type ChatWorkflowRoleReportV2 = Omit<ChatWorkflowRoleReportV1, 'version'> & {
	version: typeof AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2;
	outcome: AgenticChatWorkflowReviewOutcomeV2;
	specialist: { id: string; version: number };
};
export type ChatWorkflowRoleReport = ChatWorkflowRoleReportV1 | ChatWorkflowRoleReportV2;

export type ChatWorkflowRoleReportParseResult =
	| { ok: true; report: ChatWorkflowRoleReport }
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
	retry?: { reason: string },
	projectReviewV2 = false
): string {
	const L = CHAT_WORKFLOW_ROLE_REPORT_LIMITS;
	const counts = retry ? COMPACT_COUNTS : L;
	return `${assignment}

Return only one JSON object, with no Markdown or commentary:
{${projectReviewV2 ? '"outcome":"findings",' : ''}"summary":"...","findings":[{"claim":"...","basis":"recorded","evidence":["<record id>"]}],"risks":[{"risk":"...","evidence":["<record id>"]}],"unknowns":["..."],"recommendation":"..."}
- findings: ${projectReviewV2 ? '0' : '1'}-${counts.findings} items. Each claim is under 240 characters and cites 1-${L.referencesPerItem} record ids copied exactly from PROJECT EVIDENCE. A finding without a supplied id is discarded.
${projectReviewV2 ? '- outcome must be findings, no_material_findings, insufficient_evidence, or needs_clarification. Use findings only with at least one supported finding. Other outcomes require empty findings and risks; insufficient_evidence and needs_clarification require a specific unknown. Every risk must cite a supplied record. Never fabricate a finding; limit a clean review to inspected evidence.\n' : ''}- basis is "recorded" only when the records state it; otherwise "inferred".
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
): { ok: true; report: ChatWorkflowRoleReportV1 } | { ok: false; reason: string };
export function parseWorkflowRoleReport(
	text: string,
	role: ChatWorkflowSpecialistRole,
	evidence: ReadonlyMap<string, string>,
	specialist: { id: string; version: number } | undefined
): ChatWorkflowRoleReportParseResult;
export function parseWorkflowRoleReport(
	text: string,
	role: ChatWorkflowSpecialistRole,
	evidence: ReadonlyMap<string, string>,
	specialist?: { id: string; version: number }
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
	const outcomes = [
		'findings',
		'no_material_findings',
		'insufficient_evidence',
		'needs_clarification'
	];
	if (specialist && !outcomes.includes(String(data.outcome)))
		return invalid('a valid explicit review outcome is required');
	const summary = fittedText(data.summary, L.summaryChars);
	if (!summary) return invalid(`summary must be 1-${L.summaryChars} characters`);
	const recommendation = fittedText(data.recommendation, L.recommendationChars);
	if (!recommendation)
		return invalid(`recommendation must be 1-${L.recommendationChars} characters`);
	if (
		!Array.isArray(data.findings) ||
		(!specialist && !data.findings.length) ||
		data.findings.length > L.findings * REPORT_OVERRUN_FACTOR
	)
		return invalid(`findings must list 1-${L.findings} items`);
	const risksInput = data.risks ?? [];
	if (!Array.isArray(risksInput) || risksInput.length > L.risks * REPORT_OVERRUN_FACTOR)
		return invalid(`risks must list at most ${L.risks} items`);
	const unknownsInput = data.unknowns ?? [];
	if (!Array.isArray(unknownsInput) || unknownsInput.length > L.unknowns * REPORT_OVERRUN_FACTOR)
		return invalid(`unknowns must list at most ${L.unknowns} items`);

	let unsupportedReferences = 0;
	let unsupportedFindings = 0;
	const references = (value: unknown): ChatWorkflowEvidenceRef[] | null => {
		if (value === undefined) return [];
		if (!Array.isArray(value) || value.length > L.referencesPerItem * REPORT_OVERRUN_FACTOR)
			return null;
		const accepted: ChatWorkflowEvidenceRef[] = [];
		for (const item of value) {
			if (typeof item !== 'string' || item.length > L.referenceChars) return null;
			const id = item.trim();
			const label = evidence.get(id);
			if (!label) unsupportedReferences++;
			else if (!accepted.some((ref) => ref.id === id)) accepted.push({ id, label });
		}
		return accepted.slice(0, L.referencesPerItem);
	};

	const findings: ChatWorkflowRoleReportV1['findings'] = [];
	for (const item of data.findings) {
		if (!isRecord(item)) return invalid('each finding must be an object');
		const claim = fittedText(item.claim, L.claimChars);
		if (!claim) return invalid(`each finding claim must be 1-${L.claimChars} characters`);
		if (item.basis !== 'recorded' && item.basis !== 'inferred')
			return invalid('each finding basis must be "recorded" or "inferred"');
		const refs = references(item.evidence);
		if (!refs)
			return invalid(`each finding may cite at most ${L.referencesPerItem} record ids`);
		if (!refs.length) unsupportedFindings++;
		else findings.push({ claim, basis: item.basis, evidence: refs });
	}
	findings.splice(L.findings);
	if (!findings.length && (!specialist || data.outcome === 'findings'))
		return invalid('no finding cited a supplied project record');

	const risks: ChatWorkflowRoleReportV1['risks'] = [];
	for (const item of risksInput) {
		if (!isRecord(item)) return invalid('each risk must be an object');
		const risk = fittedText(item.risk, L.riskChars);
		if (!risk) return invalid(`each risk must be 1-${L.riskChars} characters`);
		const refs = references(item.evidence);
		if (!refs) return invalid(`each risk may cite at most ${L.referencesPerItem} record ids`);
		if (specialist && !refs.length)
			return invalid('each risk must cite a supplied project record');
		risks.push({ risk, evidence: refs });
	}
	const unknowns: string[] = [];
	for (const item of unknownsInput) {
		const unknown = fittedText(item, L.unknownChars);
		if (!unknown) return invalid(`each unknown must be 1-${L.unknownChars} characters`);
		unknowns.push(unknown);
	}
	risks.splice(L.risks);
	unknowns.splice(L.unknowns);

	if (specialist && data.outcome !== 'findings' && (data.findings.length || risks.length))
		return invalid('an abstention must have empty findings and risks');
	if (
		specialist &&
		['insufficient_evidence', 'needs_clarification'].includes(String(data.outcome)) &&
		!unknowns.length
	)
		return invalid('an evidence gap or clarification needs a specific unknown');
	return {
		ok: true,
		report: {
			...(specialist
				? {
						version: AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2,
						outcome: data.outcome as AgenticChatWorkflowReviewOutcomeV2,
						specialist: { ...specialist }
					}
				: { version: CHAT_WORKFLOW_ROLE_REPORT_VERSION }),
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
export function renderWorkflowRoleReport(report: ChatWorkflowRoleReport, attempts: number): string {
	const cite = (refs: ChatWorkflowEvidenceRef[]) =>
		refs.length ? ` [${refs.map((ref) => ref.label).join('; ')}]` : '';
	const lines = [
		report.summary,
		'',
		...(report.version === AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2 &&
		report.outcome !== 'findings'
			? [`Outcome: ${report.outcome.replaceAll('_', ' ')}`]
			: ['Findings']),
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
export function workflowReportForEditor(report: ChatWorkflowRoleReport) {
	const refs = (items: ChatWorkflowEvidenceRef[]) =>
		items.map((ref) => `${ref.label} (${ref.id})`);
	return {
		role: report.role,
		...(report.version === AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2
			? { outcome: report.outcome, specialist: report.specialist }
			: {}),
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

export function durableEvidenceIndexFromPreparedContext(context: {
	payload: JsonObject;
	evidenceVersions: AgenticChatWorkflowEvidenceVersionV1[];
}): ChatWorkflowDurableEvidenceIndex {
	const labels = collectRecordLabels(context.payload);
	return new Map(
		context.evidenceVersions.map((entry) => [
			entry.id,
			{
				kind: entry.kind,
				version: entry.version,
				label: boundLabel(labels.get(entry.id) ?? `${entry.kind}: ${entry.id}`)
			}
		])
	);
}

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
	report: ChatWorkflowRoleReport,
	index: ChatWorkflowDurableEvidenceIndex
): AgenticChatWorkflowRoleReport {
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
		...(report.version === AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2
			? {
					version: report.version,
					outcome: report.outcome,
					specialist: { ...report.specialist }
				}
			: { version: report.version }),
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
	report: AgenticChatWorkflowRoleReport
): ChatWorkflowRoleReport {
	// V3's compatibility fields are host-authored. Extractive synthesis has its
	// own renderer; legacy progress/detail callers receive the bounded v2 shape.
	if (report.version === 'chat_workflow_role_report_v3') {
		const { claims: _claims, contextHash: _hash, ...compatible } = report;
		return fromDurableWorkflowRoleReport({
			...compatible,
			version: 'chat_workflow_role_report_v2'
		});
	}
	const refs = (items: AgenticChatWorkflowEvidenceRefV1[]) =>
		items.map((ref) => ({ id: ref.id, label: ref.label }));
	return {
		...(report.version === AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2
			? {
					version: report.version,
					outcome: report.outcome,
					specialist: { ...report.specialist }
				}
			: { version: CHAT_WORKFLOW_ROLE_REPORT_VERSION }),
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

/**
 * Report text within its bound, or trimmed to it at a word with an ellipsis when it runs over
 * by at most REPORT_OVERRUN_FACTOR. Counts code points, as SQL `char_length` does, and never
 * splits a surrogate pair.
 */
function fittedText(value: unknown, maximum: number): string | null {
	if (typeof value !== 'string') return null;
	const chars = [...value.trim()];
	if (!chars.length || chars.length > maximum * REPORT_OVERRUN_FACTOR) return null;
	if (chars.length <= maximum) return chars.join('');
	const cut = chars.slice(0, maximum - 1).join('');
	const space = cut.lastIndexOf(' ');
	return `${(space >= maximum / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
