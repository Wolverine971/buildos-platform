// packages/agent-orchestrator/src/testing/harness/open-brief-eval.ts
import { z } from 'zod';

export const OpenBriefClarificationLabelSchema = z.enum(['blocked', 'proceedable']);
export type OpenBriefClarificationLabel = z.infer<typeof OpenBriefClarificationLabelSchema>;

export const OpenBriefSnapshotSchema = z
	.object({
		snapshot_id: z.string().min(1),
		as_of: z.string().datetime(),
		project: z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough(),
		tasks: z.array(z.object({ id: z.string().min(1), title: z.string().min(1) }).passthrough()),
		documents: z.array(
			z.object({ id: z.string().min(1), title: z.string().min(1) }).passthrough()
		),
		goals: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough()),
		plans: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough())
	})
	.passthrough();

export type OpenBriefSnapshot = z.infer<typeof OpenBriefSnapshotSchema>;

export interface LoadBearingUnknown {
	description: string;
	/** Terms that make an assumption or question responsive to this particular unknown. */
	matchTerms: string[];
}

export interface OpenBriefEvaluationProfile {
	clarificationLabel: OpenBriefClarificationLabel;
	loadBearingUnknowns: LoadBearingUnknown[];
	requiresPlanShape: boolean;
	researchBearing: boolean;
	maxSteps?: number;
	maxTokens?: number;
}

export interface OpenBriefDocumentEvidence {
	documentId: string;
	title: string;
	content: string;
	persisted: boolean;
	/** Only model-authored documents count. Research Logs and other system floors do not. */
	author: 'model' | 'system';
}

export interface OpenBriefExternalClaim {
	claim: string;
	citationUrls: string[];
}

export interface OpenBriefRunEvidence {
	assistantText: string;
	documents: OpenBriefDocumentEvidence[];
	projectContextReadCount: number;
	assumptions: string[];
	questions: string[];
	externalClaims: OpenBriefExternalClaim[];
	resolvedSourceUrls: string[];
	stepsUsed?: number;
	tokensUsed?: number;
	repeatedAssignmentCount?: number;
}

export type OpenBriefL0CheckId =
	| 'context_before_planning'
	| 'silent_guessing'
	| 'steps_not_schedules'
	| 'per_step_effort'
	| 'knowns_and_unknowns'
	| 'durable_document'
	| 'bluf_names_document'
	| 'citation_floor'
	| 'budget_and_loop';

export interface OpenBriefMachineCheck {
	id: OpenBriefL0CheckId;
	applicable: boolean;
	passed: boolean;
	details: string[];
}

export interface OpenBriefL0Result {
	passed: boolean;
	checks: OpenBriefMachineCheck[];
}

export interface GroundingReferent {
	value: string;
	kind: 'entity' | 'number_or_date' | 'named_phrase' | 'url';
	resolved: boolean;
	resolution: string | null;
}

export interface OpenBriefGroundingResult {
	ratio: number | null;
	resolvedCount: number;
	totalCount: number;
	referents: GroundingReferent[];
	unresolved: GroundingReferent[];
}

export interface OpenBriefFeasibilityResult {
	passed: boolean;
	hasExplicitSection: boolean;
	statesContextSufficiency: boolean;
	weighsDifficulty: boolean;
	namesNeeds: boolean;
	sectionText: string | null;
}

export interface OpenBriefMachineScore {
	l0: OpenBriefL0Result;
	grounding: OpenBriefGroundingResult;
	feasibility: OpenBriefFeasibilityResult;
	clarification: {
		label: OpenBriefClarificationLabel;
		asked: boolean;
		surfacedAssumptions: boolean;
		askOnBlocked: boolean | null;
		needlessAskOnProceedable: boolean | null;
	};
}

export interface OpenBriefSwapResult {
	structuralOverlap: number;
	specificityDelta: number;
	leftHeadingCount: number;
	rightHeadingCount: number;
	leftShingleCount: number;
	rightShingleCount: number;
}

const WEEK_BLOCK = /^\s*(?:#{1,6}\s*)?(?:\*\*)?week\s+(?:\d+|one|two|three|four)\b/im;
const EFFORT =
	/\b(?:effort|workload|time\s+estimate|estimated\s+time)\s*:|\b\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:minutes?|mins?|hours?|hrs?|days?)\b/i;
const KNOWN_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*)?knowns?\b/im;
const UNKNOWN_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*)?unknowns?\b/im;
const TAKEAWAY_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:bottom line|takeaways?|tl;dr)\b/im;
const LIST_ITEM = /^\s*(?:[-*+] |\d+[.)]\s+)/gm;
const URL = /https?:\/\/[^\s<>()\]]+/gi;

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9$%]+/g, ' ')
		.trim();
}

function round(value: number, places = 4): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

function stableSnapshotText(snapshot: OpenBriefSnapshot): string {
	return normalizeText(JSON.stringify(snapshot));
}

function entityEntries(snapshot: OpenBriefSnapshot): Array<{ name: string; id: string }> {
	return [
		{ name: snapshot.project.name, id: snapshot.project.id },
		...snapshot.tasks.map((entry) => ({ name: entry.title, id: entry.id })),
		...snapshot.documents.map((entry) => ({ name: entry.title, id: entry.id })),
		...snapshot.goals.map((entry) => ({ name: entry.name, id: entry.id })),
		...snapshot.plans.map((entry) => ({ name: entry.name, id: entry.id }))
	];
}

function documentText(evidence: OpenBriefRunEvidence): string {
	return evidence.documents
		.filter((document) => document.persisted && document.author === 'model')
		.map((document) => document.content)
		.join('\n\n');
}

function fullOutputText(evidence: OpenBriefRunEvidence): string {
	return `${evidence.assistantText}\n\n${documentText(evidence)}`.trim();
}

function extractHeadingSection(text: string, headingPattern: RegExp): string | null {
	const lines = text.split('\n');
	const start = lines.findIndex((line) => {
		const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
		return Boolean(match?.[2] && headingPattern.test(match[2]));
	});
	if (start < 0) return null;
	const headingLevel = lines[start]!.match(/^\s*(#{1,6})/)?.[1]?.length ?? 6;
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		const level = lines[index]!.match(/^\s*(#{1,6})\s+/)?.[1]?.length;
		if (level !== undefined && level <= headingLevel) {
			end = index;
			break;
		}
	}
	return lines
		.slice(start + 1, end)
		.join('\n')
		.trim();
}

function sectionItems(section: string | null): string[] {
	if (!section) return [];
	return section
		.split('\n')
		.map((line) => line.replace(/^\s*(?:[-*+] |\d+[.)]\s+)/, '').trim())
		.filter((line) => line.length > 0);
}

export function extractOpenBriefAssumptions(text: string): string[] {
	return sectionItems(extractHeadingSection(text, /^(?:assumptions?|working assumptions?)$/i));
}

export function extractOpenBriefQuestions(text: string): string[] {
	const section = sectionItems(
		extractHeadingSection(
			text,
			/^(?:open questions?|questions?(?: for (?:dj|you|the user))?|needed from (?:dj|you|the user)|inputs? needed)$/i
		)
	);
	if (section.length > 0) return section;
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.endsWith('?') && line.length > 5);
}

function citationReferenceMap(text: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const match of text.matchAll(/^\s*\[(\d+)\]:\s*(https?:\/\/\S+)/gm)) {
		result.set(match[1]!, match[2]!.replace(/[.,;:]+$/, ''));
	}
	return result;
}

/**
 * Deterministic, intentionally conservative claim extraction for the citation floor. It catches
 * quantified/current/generalized claims and research-language claims; it does not pretend to be
 * a semantic fact checker. The unresolved list remains visible for instrument auditing.
 */
export function extractOpenBriefExternalClaims(text: string): OpenBriefExternalClaim[] {
	const references = citationReferenceMap(text);
	const sourceSectionStart = text.search(/^\s*#{1,6}\s+(?:sources?|references?)\b/im);
	const claimText = sourceSectionStart >= 0 ? text.slice(0, sourceSectionStart) : text;
	const paragraphs = claimText
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/^\s*[-*+]\s+/, '').trim())
		.filter(Boolean);
	const cue =
		/\b(?:according to|research (?:shows|suggests|finds|indicates)|stud(?:y|ies)|survey|report|benchmark|industry|market|typically|on average|best practice|current practice|trend|percent|rate)\b|\b\d+(?:\.\d+)?%\b|\$\d+/i;
	return paragraphs
		.filter((paragraph) => cue.test(paragraph))
		.map((claim) => {
			const urls = Array.from(claim.matchAll(URL), (match) =>
				match[0].replace(/[.,;:]+$/, '')
			);
			for (const match of claim.matchAll(/\[(\d+)\]/g)) {
				const url = references.get(match[1]!);
				if (url) urls.push(url);
			}
			return { claim, citationUrls: Array.from(new Set(urls)) };
		});
}

function surfacedUnknowns(
	unknowns: LoadBearingUnknown[],
	evidence: OpenBriefRunEvidence
): string[] {
	const surfacedText = normalizeText([...evidence.assumptions, ...evidence.questions].join(' '));
	return unknowns
		.filter((unknown) =>
			unknown.matchTerms.some((term) => surfacedText.includes(normalizeText(term)))
		)
		.map((unknown) => unknown.description);
}

function extractNumberedStepBlocks(text: string): string[] {
	const matches = Array.from(
		text.matchAll(/^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:step\s+)?\d+[.)\s:—–-]+.*$/gim)
	);
	return matches.map((match, index) =>
		text.slice(match.index, matches[index + 1]?.index ?? text.length).trim()
	);
}

function tableHasStepEffort(text: string): boolean {
	const lines = text.split('\n');
	for (let index = 0; index < lines.length - 2; index += 1) {
		const header = lines[index] ?? '';
		if (!/^\s*\|/.test(header) || !/\bstep\b/i.test(header) || !/\beffort\b/i.test(header)) {
			continue;
		}
		const bodyRows = lines.slice(index + 2).filter((line) => /^\s*\|/.test(line));
		return bodyRows.length >= 2 && bodyRows.every((line) => EFFORT.test(line));
	}
	return false;
}

function planEffortDetails(text: string): { passed: boolean; details: string[] } {
	if (tableHasStepEffort(text)) return { passed: true, details: [] };
	const steps = extractNumberedStepBlocks(text);
	if (steps.length < 2) {
		return {
			passed: false,
			details: ['Fewer than two explicit numbered step blocks were found.']
		};
	}
	const missing = steps
		.map((step, index) => ({ step, index: index + 1 }))
		.filter(({ step }) => !EFFORT.test(step))
		.map(({ index }) => `Step ${index}`);
	return {
		passed: missing.length === 0,
		details: missing.length > 0 ? [`Missing effort estimate: ${missing.join(', ')}.`] : []
	};
}

function blufNamesDocument(evidence: OpenBriefRunEvidence): { passed: boolean; details: string[] } {
	const modelDocuments = evidence.documents.filter(
		(document) => document.persisted && document.author === 'model'
	);
	const assistant = evidence.assistantText;
	const named = modelDocuments.filter(
		(document) =>
			assistant.toLowerCase().includes(document.title.toLowerCase()) ||
			assistant.includes(document.documentId)
	);
	const firstSection = assistant.slice(0, 1_500);
	const hasBluf =
		TAKEAWAY_HEADING.test(firstSection) && (firstSection.match(LIST_ITEM) ?? []).length >= 2;
	const details: string[] = [];
	if (named.length === 0)
		details.push('The reply does not name a persisted model-authored document.');
	if (!hasBluf)
		details.push('The first 1,500 characters do not contain a 2+ item BLUF takeaway list.');
	return { passed: named.length > 0 && hasBluf, details };
}

function citationDetails(evidence: OpenBriefRunEvidence): { passed: boolean; details: string[] } {
	const resolved = new Set(evidence.resolvedSourceUrls);
	const details: string[] = [];
	if (evidence.externalClaims.length === 0) {
		return {
			passed: false,
			details: ['No external claims were extracted for a research-bearing brief.']
		};
	}
	for (const claim of evidence.externalClaims) {
		if (claim.citationUrls.length === 0) {
			details.push(`Uncited external claim: ${claim.claim}`);
			continue;
		}
		const unresolved = claim.citationUrls.filter((url) => !resolved.has(url));
		if (unresolved.length > 0) {
			details.push(`Claim has unresolved source URL(s): ${unresolved.join(', ')}`);
		}
	}
	return { passed: details.length === 0, details };
}

export function evaluateOpenBriefL0(params: {
	profile: OpenBriefEvaluationProfile;
	evidence: OpenBriefRunEvidence;
}): OpenBriefL0Result {
	const { evidence, profile } = params;
	const artifactText = documentText(evidence);
	const outputText = fullOutputText(evidence);
	const surfaced = surfacedUnknowns(profile.loadBearingUnknowns, evidence);
	const missingUnknowns = profile.loadBearingUnknowns
		.map((unknown) => unknown.description)
		.filter((description) => !surfaced.includes(description));
	const effort = planEffortDetails(artifactText);
	const modelDocuments = evidence.documents.filter(
		(document) => document.persisted && document.author === 'model'
	);
	const bluf = blufNamesDocument(evidence);
	const citations = citationDetails(evidence);
	const budgetDetails: string[] = [];
	if (profile.maxSteps !== undefined && (evidence.stepsUsed ?? 0) > profile.maxSteps) {
		budgetDetails.push(`Step cap exceeded: ${evidence.stepsUsed} > ${profile.maxSteps}.`);
	}
	if (profile.maxTokens !== undefined && (evidence.tokensUsed ?? 0) > profile.maxTokens) {
		budgetDetails.push(`Token cap exceeded: ${evidence.tokensUsed} > ${profile.maxTokens}.`);
	}
	if ((evidence.repeatedAssignmentCount ?? 0) > 0) {
		budgetDetails.push(
			`${evidence.repeatedAssignmentCount} repeated assignment(s) had no new evidence.`
		);
	}

	const checks: OpenBriefMachineCheck[] = [
		{
			id: 'context_before_planning',
			applicable: true,
			passed: evidence.projectContextReadCount > 0,
			details:
				evidence.projectContextReadCount > 0
					? []
					: ['No project-context read was recorded before the output was produced.']
		},
		{
			id: 'silent_guessing',
			applicable: profile.loadBearingUnknowns.length > 0,
			passed: profile.loadBearingUnknowns.length === 0 || missingUnknowns.length === 0,
			details: missingUnknowns.map((unknown) => `Neither asked nor surfaced: ${unknown}`)
		},
		{
			id: 'steps_not_schedules',
			applicable: profile.requiresPlanShape,
			passed: !profile.requiresPlanShape || !WEEK_BLOCK.test(artifactText),
			details:
				profile.requiresPlanShape && WEEK_BLOCK.test(artifactText)
					? ['Week-block scaffolding was found in the artifact.']
					: []
		},
		{
			id: 'per_step_effort',
			applicable: profile.requiresPlanShape,
			passed: !profile.requiresPlanShape || effort.passed,
			details: profile.requiresPlanShape ? effort.details : []
		},
		{
			id: 'knowns_and_unknowns',
			applicable: profile.requiresPlanShape,
			passed:
				!profile.requiresPlanShape ||
				(KNOWN_HEADING.test(artifactText) && UNKNOWN_HEADING.test(artifactText)),
			details:
				profile.requiresPlanShape &&
				!(KNOWN_HEADING.test(artifactText) && UNKNOWN_HEADING.test(artifactText))
					? ['Explicit Knowns and Unknowns sections are both required.']
					: []
		},
		{
			id: 'durable_document',
			applicable: true,
			passed: modelDocuments.length > 0,
			details:
				modelDocuments.length > 0
					? []
					: [
							'No persisted model-authored document exists; system documents are excluded.'
						]
		},
		{
			id: 'bluf_names_document',
			applicable: true,
			passed: bluf.passed,
			details: bluf.details
		},
		{
			id: 'citation_floor',
			applicable: profile.researchBearing,
			passed: !profile.researchBearing || citations.passed,
			details: profile.researchBearing ? citations.details : []
		},
		{
			id: 'budget_and_loop',
			applicable:
				profile.maxSteps !== undefined ||
				profile.maxTokens !== undefined ||
				(evidence.repeatedAssignmentCount ?? 0) > 0,
			passed: budgetDetails.length === 0,
			details: budgetDetails
		}
	];

	return {
		passed: checks.filter((check) => check.applicable).every((check) => check.passed),
		checks
	};
}

function addReferent(referents: Map<string, GroundingReferent>, referent: GroundingReferent): void {
	const key = `${referent.kind}:${normalizeText(referent.value)}`;
	const prior = referents.get(key);
	if (!prior || (!prior.resolved && referent.resolved)) referents.set(key, referent);
}

const GENERIC_NAMED_PHRASES = new Set([
	'bottom line',
	'takeaways',
	'knowns',
	'unknowns',
	'feasibility',
	'stress test',
	'next steps',
	'sources'
]);

export function evaluateGrounding(params: {
	text: string;
	snapshot: OpenBriefSnapshot;
	resolvedSourceUrls?: string[];
}): OpenBriefGroundingResult {
	const snapshotText = stableSnapshotText(params.snapshot);
	const output = params.text;
	const referents = new Map<string, GroundingReferent>();
	const resolvedUrls = new Set(params.resolvedSourceUrls ?? []);

	for (const entity of entityEntries(params.snapshot)) {
		if (!output.toLowerCase().includes(entity.name.toLowerCase())) continue;
		addReferent(referents, {
			value: entity.name,
			kind: 'entity',
			resolved: true,
			resolution: entity.id
		});
	}

	for (const match of output.matchAll(URL)) {
		const value = match[0].replace(/[.,;:]+$/, '');
		addReferent(referents, {
			value,
			kind: 'url',
			resolved: resolvedUrls.has(value),
			resolution: resolvedUrls.has(value) ? value : null
		});
	}

	const numericPattern =
		/\b(?:20\d{2}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*20\d{2})?|[$~]?\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:%|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|users?|tasks?|documents?|mg|dau|\/mo)?)\b/gi;
	for (const match of output.matchAll(numericPattern)) {
		const value = match[0].trim();
		if (!/[0-9]/.test(value)) continue;
		const normalized = normalizeText(value);
		const resolved = normalized.length > 0 && snapshotText.includes(normalized);
		addReferent(referents, {
			value,
			kind: 'number_or_date',
			resolved,
			resolution: resolved ? 'snapshot fact' : null
		});
	}

	const namedPhrasePatterns = [
		/`([^`]{3,100})`/g,
		/\*\*([^*\n]{3,100})\*\*/g,
		/[“"]([^”"\n]{3,100})[”"]/g
	];
	for (const pattern of namedPhrasePatterns) {
		for (const match of output.matchAll(pattern)) {
			const value = match[1]?.trim();
			if (!value || GENERIC_NAMED_PHRASES.has(normalizeText(value))) continue;
			if (EFFORT.test(value) || /^[\d\s$%./~–-]+$/.test(value)) continue;
			const normalized = normalizeText(value);
			const entity = entityEntries(params.snapshot).find(
				(entry) => normalizeText(entry.name) === normalized
			);
			const resolved =
				Boolean(entity) || (normalized.length > 0 && snapshotText.includes(normalized));
			addReferent(referents, {
				value,
				kind: 'named_phrase',
				resolved,
				resolution: entity?.id ?? (resolved ? 'snapshot text' : null)
			});
		}
	}

	const list = Array.from(referents.values());
	const resolvedCount = list.filter((referent) => referent.resolved).length;
	return {
		ratio: list.length > 0 ? round(resolvedCount / list.length) : null,
		resolvedCount,
		totalCount: list.length,
		referents: list,
		unresolved: list.filter((referent) => !referent.resolved)
	};
}

function extractFeasibilitySection(text: string): string | null {
	const body = extractHeadingSection(
		text,
		/^(?:feasibility|doability|stress test|can this work|execution confidence)\b/i
	);
	return body === null ? null : `## Feasibility\n\n${body}`;
}

export function evaluateFeasibility(text: string): OpenBriefFeasibilityResult {
	const section = extractFeasibilitySection(text);
	const candidate = section ?? '';
	const statesContextSufficiency =
		/\b(?:enough|sufficient|insufficient|missing|limited|lack(?:ing)?)\s+(?:project\s+)?context\b|\bcontext\s+(?:is|isn't|is not|appears|seems)\s+(?:enough|sufficient|insufficient|limited)\b/i.test(
			candidate
		);
	const weighsDifficulty =
		/\b(?:difficulty|hard|easy|feasible|doable|confidence|risk|effort|workload)\b/i.test(
			candidate
		);
	const namesNeeds =
		/\b(?:need(?:ed|s)?|require(?:d|s)?|missing|unknown|decision|input|ask|permission|no additional (?:context|input))\b/i.test(
			candidate
		);
	return {
		passed: Boolean(section) && statesContextSufficiency && weighsDifficulty && namesNeeds,
		hasExplicitSection: Boolean(section),
		statesContextSufficiency,
		weighsDifficulty,
		namesNeeds,
		sectionText: section
	};
}

export function evaluateOpenBriefRun(params: {
	profile: OpenBriefEvaluationProfile;
	evidence: OpenBriefRunEvidence;
	snapshot: OpenBriefSnapshot;
}): OpenBriefMachineScore {
	const asked = params.evidence.questions.some((question) => question.trim().length > 0);
	const surfacedAssumptions = params.evidence.assumptions.some(
		(assumption) => assumption.trim().length > 0
	);
	return {
		l0: evaluateOpenBriefL0(params),
		grounding: evaluateGrounding({
			text: fullOutputText(params.evidence),
			snapshot: params.snapshot,
			resolvedSourceUrls: params.evidence.resolvedSourceUrls
		}),
		feasibility: evaluateFeasibility(documentText(params.evidence)),
		clarification: {
			label: params.profile.clarificationLabel,
			asked,
			surfacedAssumptions,
			askOnBlocked: params.profile.clarificationLabel === 'blocked' ? asked : null,
			needlessAskOnProceedable:
				params.profile.clarificationLabel === 'proceedable' ? asked : null
		}
	};
}

const STRUCTURE_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'from',
	'has',
	'have',
	'in',
	'is',
	'it',
	'of',
	'on',
	'or',
	'that',
	'the',
	'this',
	'to',
	'with',
	'you',
	'your'
]);

function stripSnapshotEntities(text: string, snapshot: OpenBriefSnapshot): string {
	return entityEntries(snapshot)
		.sort((left, right) => right.name.length - left.name.length)
		.reduce(
			(value, entity) =>
				value.replace(
					new RegExp(entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
					' entity '
				),
			text
		)
		.replace(URL, ' source ')
		.replace(/\b\d+(?:\.\d+)?\b/g, ' number ');
}

function tokens(text: string): string[] {
	return normalizeText(text)
		.split(/\s+/)
		.filter((token) => token.length > 1 && !STRUCTURE_STOP_WORDS.has(token));
}

function shingles(values: string[], size: number): Set<string> {
	const result = new Set<string>();
	for (let index = 0; index <= values.length - size; index += 1) {
		result.add(values.slice(index, index + size).join(' '));
	}
	return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
	if (left.size === 0 && right.size === 0) return 0;
	let intersection = 0;
	for (const value of left) if (right.has(value)) intersection += 1;
	return intersection / (left.size + right.size - intersection);
}

function normalizedHeadings(text: string): Set<string> {
	return new Set(
		text
			.split('\n')
			.filter((line) => /^\s*#{1,6}\s+/.test(line))
			.map((line) => normalizeText(line.replace(/^\s*#{1,6}\s+/, '')))
			.filter(Boolean)
	);
}

export function evaluateSwapTest(params: {
	leftText: string;
	leftSnapshot: OpenBriefSnapshot;
	rightText: string;
	rightSnapshot: OpenBriefSnapshot;
}): OpenBriefSwapResult {
	const left = stripSnapshotEntities(params.leftText, params.leftSnapshot);
	const right = stripSnapshotEntities(params.rightText, params.rightSnapshot);
	const leftHeadings = normalizedHeadings(left);
	const rightHeadings = normalizedHeadings(right);
	const leftShingles = shingles(tokens(left), 3);
	const rightShingles = shingles(tokens(right), 3);
	const headingWeight = leftHeadings.size > 0 || rightHeadings.size > 0 ? 0.6 : 0;
	const shingleWeight = 1 - headingWeight;
	const structuralOverlap = round(
		headingWeight * jaccard(leftHeadings, rightHeadings) +
			shingleWeight * jaccard(leftShingles, rightShingles)
	);
	return {
		structuralOverlap,
		specificityDelta: round(1 - structuralOverlap),
		leftHeadingCount: leftHeadings.size,
		rightHeadingCount: rightHeadings.size,
		leftShingleCount: leftShingles.size,
		rightShingleCount: rightShingles.size
	};
}
