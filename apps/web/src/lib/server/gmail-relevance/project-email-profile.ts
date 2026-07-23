// apps/web/src/lib/server/gmail-relevance/project-email-profile.ts
import { createHash } from 'node:crypto';

export const PROJECT_EMAIL_PROFILE_COMPILER_VERSION = 'project-email-profile-v1';

export const PROJECT_EMAIL_PROFILE_FIELDS = {
	identity: ['name', 'alias', 'product', 'vocabulary'],
	actors: ['person', 'email', 'domain', 'relationship'],
	artifacts: ['repository', 'url', 'document', 'customer', 'product', 'contract'],
	identifiers: ['ticket', 'invoice', 'contract', 'campaign', 'event', 'external_system'],
	semantic_context: ['summary', 'goal', 'deliverable', 'workstream'],
	negative_evidence: ['nearby_project', 'generic_term', 'excluded_sender', 'excluded_domain'],
	user_rules: [
		'always_sender',
		'always_domain',
		'always_label',
		'always_thread',
		'never_sender',
		'never_domain',
		'never_label',
		'never_thread'
	],
	recency: ['collaborator', 'identifier', 'focus_term']
} as const;

export type ProjectEmailProfileGroup = keyof typeof PROJECT_EMAIL_PROFILE_FIELDS;
export type ProjectEmailProfileSourceType =
	| 'project'
	| 'task'
	| 'event'
	| 'document'
	| 'goal'
	| 'milestone'
	| 'plan'
	| 'risk'
	| 'actor'
	| 'project_member'
	| 'artifact'
	| 'user_rule'
	| 'accepted_correction';

export type ProjectEmailProfileSource = {
	user_id: string;
	project_id: string;
	source_type: ProjectEmailProfileSourceType;
	source_id: string;
	source_field: string;
	source_updated_at?: string;
};

export type ProjectEmailProfileCandidate = {
	group: ProjectEmailProfileGroup;
	field: string;
	value: string;
	source: ProjectEmailProfileSource;
	expires_at?: string;
};

export type CompiledProjectEmailProfileSource = Omit<
	ProjectEmailProfileSource,
	'user_id' | 'project_id'
>;

export type CompiledProjectEmailProfileEntry = {
	field: string;
	value: string;
	normalized_value: string;
	sources: CompiledProjectEmailProfileSource[];
	value_truncated: boolean;
	expires_at?: string;
};

export type ProjectEmailProfileGroups = Record<
	ProjectEmailProfileGroup,
	CompiledProjectEmailProfileEntry[]
>;

export type ProjectEmailProfileDiffValue = {
	group: ProjectEmailProfileGroup;
	field: string;
	value: string;
};

export type ProjectEmailProfileDiff = {
	previous_profile_hash: string | null;
	material_change: boolean;
	added: ProjectEmailProfileDiffValue[];
	removed: ProjectEmailProfileDiffValue[];
	unchanged_count: number;
};

export type CompiledProjectEmailProfile = {
	user_id: string;
	project_id: string;
	profile_version: number;
	compiler_version: typeof PROJECT_EMAIL_PROFILE_COMPILER_VERSION;
	source_snapshot_at: string;
	profile_hash: string;
	groups: ProjectEmailProfileGroups;
	diff: ProjectEmailProfileDiff;
	omitted: {
		expired_recency_count: number;
		group_limit_count: Record<ProjectEmailProfileGroup, number>;
	};
};

export type CompileProjectEmailProfileInput = {
	user_id: string;
	project_id: string;
	profile_version: number;
	source_snapshot_at: string;
	candidates: ProjectEmailProfileCandidate[];
	previous_profile?: CompiledProjectEmailProfile | null;
};

export type ProjectEmailProfileCompileErrorCode =
	| 'invalid_identity'
	| 'invalid_profile_version'
	| 'invalid_snapshot_time'
	| 'source_ownership_mismatch'
	| 'invalid_source'
	| 'invalid_group_field'
	| 'invalid_expiration';

export class ProjectEmailProfileCompileError extends Error {
	constructor(
		public readonly code: ProjectEmailProfileCompileErrorCode,
		public readonly candidate_index?: number
	) {
		super(
			candidate_index === undefined
				? `Project email profile compile failed: ${code}`
				: `Project email profile compile failed: ${code} at candidate ${candidate_index}`
		);
		this.name = 'ProjectEmailProfileCompileError';
	}
}

const GROUP_ENTRY_LIMITS: Record<ProjectEmailProfileGroup, number> = {
	identity: 80,
	actors: 100,
	artifacts: 80,
	identifiers: 100,
	semantic_context: 24,
	negative_evidence: 80,
	user_rules: 100,
	recency: 80
};

const DEFAULT_VALUE_LENGTH = 240;
const SEMANTIC_VALUE_LENGTH = 500;

type MutableEntry = {
	field: string;
	value: string;
	normalized_value: string;
	sources: Map<string, CompiledProjectEmailProfileSource>;
	value_truncated: boolean;
	expires_at?: string;
};

function emptyGroups<T>(factory: () => T): Record<ProjectEmailProfileGroup, T> {
	return {
		identity: factory(),
		actors: factory(),
		artifacts: factory(),
		identifiers: factory(),
		semantic_context: factory(),
		negative_evidence: factory(),
		user_rules: factory(),
		recency: factory()
	};
}

function normalizeWhitespace(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeCandidateValue(group: ProjectEmailProfileGroup, field: string, value: string) {
	const cleaned = normalizeWhitespace(value);
	if (!cleaned) return { value: '', normalized: '', truncated: false };

	const maxLength = group === 'semantic_context' ? SEMANTIC_VALUE_LENGTH : DEFAULT_VALUE_LENGTH;
	const codepoints = Array.from(cleaned);
	const truncated = codepoints.length > maxLength;
	let displayValue = truncated ? codepoints.slice(0, maxLength).join('') : cleaned;

	if (field === 'domain') {
		displayValue = displayValue.replace(/^@/, '').toLowerCase();
	}

	if (field === 'email' || field.endsWith('_sender') || field.endsWith('_domain')) {
		displayValue = displayValue.toLowerCase();
	}

	if (field === 'url') {
		try {
			const url = new URL(displayValue);
			if (url.protocol === 'http:' || url.protocol === 'https:') {
				url.hostname = url.hostname.toLowerCase();
				url.hash = '';
				displayValue = url.toString().replace(/\/$/, '');
			}
		} catch {
			// Preserve a bounded literal artifact value; scoring can treat it as text.
		}
	}

	return {
		value: displayValue,
		normalized: displayValue.toLocaleLowerCase('en-US'),
		truncated
	};
}

function assertIsoTime(value: string, code: ProjectEmailProfileCompileErrorCode, index?: number) {
	if (!Number.isFinite(Date.parse(value))) {
		throw new ProjectEmailProfileCompileError(code, index);
	}
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256(value: unknown): string {
	return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function sourceKey(source: CompiledProjectEmailProfileSource): string {
	return canonicalJson(source);
}

function entryKey(
	group: ProjectEmailProfileGroup,
	entry: Pick<CompiledProjectEmailProfileEntry, 'field' | 'normalized_value'>
): string {
	return `${group}\u0000${entry.field}\u0000${entry.normalized_value}`;
}

function flattenGroups(groups: ProjectEmailProfileGroups) {
	const flattened = new Map<
		string,
		ProjectEmailProfileDiffValue & { normalized_value: string }
	>();
	for (const group of Object.keys(PROJECT_EMAIL_PROFILE_FIELDS) as ProjectEmailProfileGroup[]) {
		for (const entry of groups[group]) {
			flattened.set(entryKey(group, entry), {
				group,
				field: entry.field,
				value: entry.value,
				normalized_value: entry.normalized_value
			});
		}
	}
	return flattened;
}

function compareDiffValues(
	left: ProjectEmailProfileDiffValue,
	right: ProjectEmailProfileDiffValue
) {
	return (
		left.group.localeCompare(right.group) ||
		left.field.localeCompare(right.field) ||
		left.value.localeCompare(right.value)
	);
}

function buildDiff(
	groups: ProjectEmailProfileGroups,
	profileHash: string,
	previousProfile?: CompiledProjectEmailProfile | null
): ProjectEmailProfileDiff {
	if (!previousProfile) {
		return {
			previous_profile_hash: null,
			material_change: true,
			added: Array.from(flattenGroups(groups).values())
				.map(({ normalized_value: _normalizedValue, ...value }) => value)
				.sort(compareDiffValues),
			removed: [],
			unchanged_count: 0
		};
	}

	const current = flattenGroups(groups);
	const previous = flattenGroups(previousProfile.groups);
	const added = Array.from(current.entries())
		.filter(([key]) => !previous.has(key))
		.map(([, { normalized_value: _normalizedValue, ...value }]) => value)
		.sort(compareDiffValues);
	const removed = Array.from(previous.entries())
		.filter(([key]) => !current.has(key))
		.map(([, { normalized_value: _normalizedValue, ...value }]) => value)
		.sort(compareDiffValues);

	return {
		previous_profile_hash: previousProfile.profile_hash,
		material_change: profileHash !== previousProfile.profile_hash,
		added,
		removed,
		unchanged_count: Array.from(current.keys()).filter((key) => previous.has(key)).length
	};
}

export function compileProjectEmailProfile(
	input: CompileProjectEmailProfileInput
): CompiledProjectEmailProfile {
	if (!input.user_id.trim() || !input.project_id.trim()) {
		throw new ProjectEmailProfileCompileError('invalid_identity');
	}
	if (!Number.isSafeInteger(input.profile_version) || input.profile_version < 1) {
		throw new ProjectEmailProfileCompileError('invalid_profile_version');
	}
	assertIsoTime(input.source_snapshot_at, 'invalid_snapshot_time');

	const snapshotTime = Date.parse(input.source_snapshot_at);
	const groupedEntries = emptyGroups(() => new Map<string, MutableEntry>());
	let expiredRecencyCount = 0;

	input.candidates.forEach((candidate, index) => {
		if (
			candidate.source.user_id !== input.user_id ||
			candidate.source.project_id !== input.project_id
		) {
			throw new ProjectEmailProfileCompileError('source_ownership_mismatch', index);
		}
		if (
			!candidate.source.source_id.trim() ||
			!candidate.source.source_field.trim() ||
			(candidate.source.source_updated_at &&
				!Number.isFinite(Date.parse(candidate.source.source_updated_at)))
		) {
			throw new ProjectEmailProfileCompileError('invalid_source', index);
		}

		const allowedFields = PROJECT_EMAIL_PROFILE_FIELDS[candidate.group] as readonly string[];
		if (!allowedFields.includes(candidate.field)) {
			throw new ProjectEmailProfileCompileError('invalid_group_field', index);
		}

		if (candidate.group === 'recency' && !candidate.expires_at) {
			throw new ProjectEmailProfileCompileError('invalid_expiration', index);
		}
		if (candidate.expires_at) {
			assertIsoTime(candidate.expires_at, 'invalid_expiration', index);
			if (candidate.group === 'recency' && Date.parse(candidate.expires_at) <= snapshotTime) {
				expiredRecencyCount += 1;
				return;
			}
		}

		const normalized = normalizeCandidateValue(
			candidate.group,
			candidate.field,
			candidate.value
		);
		if (!normalized.normalized) return;

		const key = `${candidate.field}\u0000${normalized.normalized}`;
		const entries = groupedEntries[candidate.group];
		const source: CompiledProjectEmailProfileSource = {
			source_type: candidate.source.source_type,
			source_id: candidate.source.source_id,
			source_field: candidate.source.source_field,
			...(candidate.source.source_updated_at
				? { source_updated_at: candidate.source.source_updated_at }
				: {})
		};
		const existing = entries.get(key);
		if (existing) {
			existing.sources.set(sourceKey(source), source);
			existing.value = [existing.value, normalized.value].sort((left, right) =>
				left.localeCompare(right)
			)[0]!;
			existing.value_truncated ||= normalized.truncated;
			if (candidate.expires_at) {
				existing.expires_at = [existing.expires_at, candidate.expires_at]
					.filter((value): value is string => Boolean(value))
					.sort()
					.at(-1);
			}
			return;
		}

		entries.set(key, {
			field: candidate.field,
			value: normalized.value,
			normalized_value: normalized.normalized,
			sources: new Map([[sourceKey(source), source]]),
			value_truncated: normalized.truncated,
			...(candidate.expires_at ? { expires_at: candidate.expires_at } : {})
		});
	});

	const omittedByGroup = emptyGroups(() => 0);
	const groups = emptyGroups<CompiledProjectEmailProfileEntry[]>(() => []);
	for (const group of Object.keys(PROJECT_EMAIL_PROFILE_FIELDS) as ProjectEmailProfileGroup[]) {
		const entries = Array.from(groupedEntries[group].values())
			.map((entry) => ({
				field: entry.field,
				value: entry.value,
				normalized_value: entry.normalized_value,
				sources: Array.from(entry.sources.values()).sort((left, right) =>
					sourceKey(left).localeCompare(sourceKey(right))
				),
				value_truncated: entry.value_truncated,
				...(entry.expires_at ? { expires_at: entry.expires_at } : {})
			}))
			.sort(
				(left, right) =>
					left.field.localeCompare(right.field) ||
					left.normalized_value.localeCompare(right.normalized_value)
			);
		const limit = GROUP_ENTRY_LIMITS[group];
		omittedByGroup[group] = Math.max(0, entries.length - limit);
		groups[group] = entries.slice(0, limit);
	}

	const profileHash = sha256({
		compiler_version: PROJECT_EMAIL_PROFILE_COMPILER_VERSION,
		groups
	});

	return {
		user_id: input.user_id,
		project_id: input.project_id,
		profile_version: input.profile_version,
		compiler_version: PROJECT_EMAIL_PROFILE_COMPILER_VERSION,
		source_snapshot_at: input.source_snapshot_at,
		profile_hash: profileHash,
		groups,
		diff: buildDiff(groups, profileHash, input.previous_profile),
		omitted: {
			expired_recency_count: expiredRecencyCount,
			group_limit_count: omittedByGroup
		}
	};
}
