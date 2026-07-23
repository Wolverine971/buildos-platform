// apps/web/src/lib/server/gmail-relevance/metadata-scorer.ts
import type {
	CompiledProjectEmailProfileEntry,
	ProjectEmailProfileGroups
} from './project-email-profile';
import type { NormalizedEmailRelevanceMetadata } from './metadata-normalizer';

export const EMAIL_RELEVANCE_SCORER_VERSION = 'email-relevance-ab-scorer-v1';

export const EMAIL_RELEVANCE_SCORER_POLICY = {
	version: EMAIL_RELEVANCE_SCORER_VERSION,
	candidate_threshold: { a: 20, b: 24 },
	weights: {
		confirmed_thread: 100,
		explicit_rule: 70,
		actor_overlap: 35,
		domain_overlap: 20,
		artifact_overlap: 40,
		identifier_overlap: 50,
		lexical_overlap_each: 5,
		lexical_overlap_cap: 25,
		negative_evidence_each: -30,
		negative_evidence_floor: -60
	}
} as const;

export const EMAIL_RELEVANCE_EVIDENCE_CATEGORIES = [
	'confirmed_thread',
	'explicit_rule',
	'actor_overlap',
	'domain_overlap',
	'artifact_overlap',
	'identifier_overlap',
	'lexical_overlap',
	'negative_evidence'
] as const;

export type EmailRelevanceVariant = 'a' | 'b';
export type EmailRelevanceEvidenceCategory = (typeof EMAIL_RELEVANCE_EVIDENCE_CATEGORIES)[number];
export type EmailRelevanceRuleKind =
	| 'always_sender'
	| 'always_domain'
	| 'always_label'
	| 'always_thread'
	| 'never_sender'
	| 'never_domain'
	| 'never_label'
	| 'never_thread';

export type EmailRelevanceScoringProfile = {
	project_id: string;
	profile_id: string;
	profile_version_id: string;
	profile_version: number;
	groups: ProjectEmailProfileGroups;
};

export type EmailRelevanceScoringRule = {
	project_id: string;
	rule_kind: EmailRelevanceRuleKind;
	normalized_value: string;
};

export type EmailRelevanceEvidence = Record<EmailRelevanceEvidenceCategory, boolean> & {
	actor_overlap_count: number;
	domain_overlap_count: number;
	artifact_overlap_count: number;
	identifier_overlap_count: number;
	lexical_overlap_count: number;
	negative_evidence_count: number;
};

export type EmailRelevanceScore = {
	project_id: string;
	profile_id: string;
	profile_version_id: string;
	profile_version: number;
	variant: EmailRelevanceVariant;
	score: number;
	confidence: number;
	is_candidate: boolean;
	suppressed: boolean;
	evidence: EmailRelevanceEvidence;
};

const MAX_COUNT = 32;

function normalizeMatchValue(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function entries(groups: ProjectEmailProfileGroups, names: (keyof ProjectEmailProfileGroups)[]) {
	return names.flatMap((name) => groups[name]);
}

function entryValues(
	profileEntries: CompiledProjectEmailProfileEntry[],
	fields?: readonly string[]
): string[] {
	return profileEntries
		.filter((entry) => !fields || fields.includes(entry.field))
		.map((entry) => normalizeMatchValue(entry.normalized_value))
		.filter(Boolean);
}

function overlapCount(left: Iterable<string>, right: Iterable<string>): number {
	const rightSet = new Set(right);
	let count = 0;
	for (const value of new Set(left)) {
		if (rightSet.has(value)) count += 1;
		if (count >= MAX_COUNT) break;
	}
	return count;
}

function phraseMatchCount(needles: Iterable<string>, haystack: string): number {
	let count = 0;
	for (const rawNeedle of new Set(needles)) {
		const needle = normalizeMatchValue(rawNeedle);
		if (needle.length >= 2 && haystack.includes(needle)) count += 1;
		if (count >= MAX_COUNT) break;
	}
	return count;
}

function matchingRules(
	metadata: NormalizedEmailRelevanceMetadata,
	rules: EmailRelevanceScoringRule[]
): EmailRelevanceScoringRule[] {
	const addresses = new Set(metadata.participant_addresses);
	const domains = new Set(metadata.participant_domains);
	const labels = new Set(metadata.label_ids.map(normalizeMatchValue));
	return rules.filter((rule) => {
		const value = normalizeMatchValue(rule.normalized_value);
		switch (rule.rule_kind) {
			case 'always_sender':
			case 'never_sender':
				return addresses.has(value);
			case 'always_domain':
			case 'never_domain':
				return domains.has(value.replace(/^@/, ''));
			case 'always_label':
			case 'never_label':
				return labels.has(value);
			case 'always_thread':
			case 'never_thread':
				return metadata.provider_thread_id === rule.normalized_value;
		}
	});
}

function emptyEvidence(): EmailRelevanceEvidence {
	return {
		confirmed_thread: false,
		explicit_rule: false,
		actor_overlap: false,
		domain_overlap: false,
		artifact_overlap: false,
		identifier_overlap: false,
		lexical_overlap: false,
		negative_evidence: false,
		actor_overlap_count: 0,
		domain_overlap_count: 0,
		artifact_overlap_count: 0,
		identifier_overlap_count: 0,
		lexical_overlap_count: 0,
		negative_evidence_count: 0
	};
}

function scoreOne(
	metadata: NormalizedEmailRelevanceMetadata,
	profile: EmailRelevanceScoringProfile,
	rules: EmailRelevanceScoringRule[],
	variant: EmailRelevanceVariant
): EmailRelevanceScore {
	const evidence = emptyEvidence();
	const text = normalizeMatchValue(`${metadata.subject} ${metadata.snippet}`);
	const matchedRules = matchingRules(metadata, rules);
	const suppressingRules = matchedRules.filter((rule) => rule.rule_kind.startsWith('never_'));
	const positiveRules = matchedRules.filter((rule) => rule.rule_kind.startsWith('always_'));

	evidence.explicit_rule = positiveRules.length > 0;
	evidence.confirmed_thread = positiveRules.some((rule) => rule.rule_kind === 'always_thread');
	evidence.negative_evidence = suppressingRules.length > 0;
	evidence.negative_evidence_count = Math.min(MAX_COUNT, suppressingRules.length);

	const actorAddresses = entryValues(profile.groups.actors, ['email']);
	const actorDomains = entryValues(profile.groups.actors, ['domain']).map((value) =>
		value.replace(/^@/, '')
	);
	evidence.actor_overlap_count = overlapCount(metadata.participant_addresses, actorAddresses);
	evidence.domain_overlap_count = overlapCount(metadata.participant_domains, actorDomains);
	evidence.actor_overlap = evidence.actor_overlap_count > 0;
	evidence.domain_overlap = evidence.domain_overlap_count > 0;

	const artifactValues = entryValues(profile.groups.artifacts);
	evidence.artifact_overlap_count = phraseMatchCount(artifactValues, text);
	evidence.artifact_overlap = evidence.artifact_overlap_count > 0;

	const identifierValues = entryValues(profile.groups.identifiers);
	evidence.identifier_overlap_count = phraseMatchCount(identifierValues, text);
	evidence.identifier_overlap = evidence.identifier_overlap_count > 0;

	if (variant === 'b') {
		const lexicalValues = entryValues(
			entries(profile.groups, ['identity', 'semantic_context', 'recency'])
		).filter((value) => value.length >= 3);
		evidence.lexical_overlap_count = phraseMatchCount(lexicalValues, text);
		evidence.lexical_overlap = evidence.lexical_overlap_count > 0;

		const negativeValues = entryValues(profile.groups.negative_evidence);
		const structuredNegativeCount = phraseMatchCount(negativeValues, text);
		evidence.negative_evidence_count = Math.min(
			MAX_COUNT,
			evidence.negative_evidence_count + structuredNegativeCount
		);
		evidence.negative_evidence = evidence.negative_evidence_count > 0;
	}

	const weights = EMAIL_RELEVANCE_SCORER_POLICY.weights;
	const negativePoints = Math.max(
		weights.negative_evidence_floor,
		evidence.negative_evidence_count * weights.negative_evidence_each
	);
	const lexicalPoints = Math.min(
		weights.lexical_overlap_cap,
		evidence.lexical_overlap_count * weights.lexical_overlap_each
	);
	const rawScore =
		(evidence.confirmed_thread ? weights.confirmed_thread : 0) +
		(evidence.explicit_rule ? weights.explicit_rule : 0) +
		(evidence.actor_overlap ? weights.actor_overlap : 0) +
		(evidence.domain_overlap ? weights.domain_overlap : 0) +
		(evidence.artifact_overlap ? weights.artifact_overlap : 0) +
		(evidence.identifier_overlap ? weights.identifier_overlap : 0) +
		lexicalPoints +
		negativePoints;
	const score = Math.max(0, Math.min(100, rawScore));
	const suppressed = suppressingRules.length > 0;

	return {
		project_id: profile.project_id,
		profile_id: profile.profile_id,
		profile_version_id: profile.profile_version_id,
		profile_version: profile.profile_version,
		variant,
		score,
		confidence: score / 100,
		is_candidate:
			!suppressed && score >= EMAIL_RELEVANCE_SCORER_POLICY.candidate_threshold[variant],
		suppressed,
		evidence
	};
}

export function scoreEmailRelevanceVariants(input: {
	metadata: NormalizedEmailRelevanceMetadata;
	profiles: EmailRelevanceScoringProfile[];
	rules?: EmailRelevanceScoringRule[];
}): EmailRelevanceScore[] {
	const projectIds = input.profiles.map((profile) => profile.project_id);
	if (new Set(projectIds).size !== projectIds.length) {
		throw new Error('Email relevance scoring profiles must have unique project IDs');
	}
	const rulesByProject = new Map<string, EmailRelevanceScoringRule[]>();
	for (const rule of input.rules ?? []) {
		rulesByProject.set(rule.project_id, [...(rulesByProject.get(rule.project_id) ?? []), rule]);
	}

	return [...input.profiles]
		.sort((left, right) => left.project_id.localeCompare(right.project_id))
		.flatMap((profile) =>
			(['a', 'b'] as const).map((variant) =>
				scoreOne(
					input.metadata,
					profile,
					rulesByProject.get(profile.project_id) ?? [],
					variant
				)
			)
		);
}
