// apps/web/src/lib/server/gmail-relevance/project-email-profile.test.ts
import { describe, expect, it } from 'vitest';
import {
	compileProjectEmailProfile,
	ProjectEmailProfileCompileError,
	type ProjectEmailProfileCandidate
} from './project-email-profile';
import {
	SYNTHETIC_ALPHA_PROJECT_ID,
	SYNTHETIC_OTHER_USER_ID,
	SYNTHETIC_PROFILE_SNAPSHOT_AT,
	SYNTHETIC_PROFILE_USER_ID,
	syntheticAlphaProfileCandidates,
	syntheticEmailMetadataFixtures
} from './project-email-profile.fixtures';

function compile(
	candidates: ProjectEmailProfileCandidate[] = syntheticAlphaProfileCandidates,
	options: {
		profileVersion?: number;
		previous?: ReturnType<typeof compileProjectEmailProfile>;
	} = {}
) {
	return compileProjectEmailProfile({
		user_id: SYNTHETIC_PROFILE_USER_ID,
		project_id: SYNTHETIC_ALPHA_PROJECT_ID,
		profile_version: options.profileVersion ?? 1,
		source_snapshot_at: SYNTHETIC_PROFILE_SNAPSHOT_AT,
		candidates,
		previous_profile: options.previous
	});
}

describe('compileProjectEmailProfile', () => {
	it('is deterministic across candidate order and preserves field-level provenance', () => {
		const forward = compile();
		const reversed = compile([...syntheticAlphaProfileCandidates].reverse());

		expect(reversed.profile_hash).toBe(forward.profile_hash);
		expect(reversed.groups).toEqual(forward.groups);
		expect(forward.groups.identity[0]).toMatchObject({
			field: 'alias',
			value: 'Aurora Launch',
			normalized_value: 'aurora launch',
			value_truncated: false
		});
		expect(forward.groups.identity[0]?.sources[0]).toMatchObject({
			source_type: 'project',
			source_id: SYNTHETIC_ALPHA_PROJECT_ID,
			source_field: 'props.aliases'
		});
	});

	it('fails closed when any source belongs to another user or project', () => {
		const candidates = structuredClone(syntheticAlphaProfileCandidates);
		candidates[2]!.source.user_id = SYNTHETIC_OTHER_USER_ID;

		expect(() => compile(candidates)).toThrowError(
			expect.objectContaining<ProjectEmailProfileCompileError>({
				code: 'source_ownership_mismatch',
				candidate_index: 2
			})
		);
	});

	it('deduplicates normalized values and merges their sources deterministically', () => {
		const duplicate = structuredClone(syntheticAlphaProfileCandidates[2]!);
		duplicate.value = '@NORTHSTAR.EXAMPLE';
		duplicate.source.source_id = 'e0000000-0000-4000-8000-00000000000e';
		const profile = compile([...syntheticAlphaProfileCandidates, duplicate]);
		const domain = profile.groups.actors.find((entry) => entry.field === 'domain');

		expect(domain).toMatchObject({
			value: 'northstar.example',
			normalized_value: 'northstar.example'
		});
		expect(domain?.sources).toHaveLength(2);
	});

	it('drops expired recency evidence but rejects recency without an expiry', () => {
		const expired = structuredClone(syntheticAlphaProfileCandidates.at(-1)!);
		expired.expires_at = '2026-07-20T12:00:00.000Z';
		const withoutExpiry = structuredClone(syntheticAlphaProfileCandidates.at(-1)!);
		delete withoutExpiry.expires_at;

		const profile = compile([...syntheticAlphaProfileCandidates.slice(0, -1), expired]);
		expect(profile.groups.recency).toEqual([]);
		expect(profile.omitted.expired_recency_count).toBe(1);
		expect(() =>
			compile([...syntheticAlphaProfileCandidates.slice(0, -1), withoutExpiry])
		).toThrowError(expect.objectContaining({ code: 'invalid_expiration' }));
	});

	it('caps stored values and reports deterministic group-limit omissions', () => {
		const source = syntheticAlphaProfileCandidates[0]!.source;
		const manyAliases = Array.from({ length: 85 }, (_, index) => ({
			group: 'identity' as const,
			field: 'alias',
			value: `${String(index).padStart(3, '0')}-${'x'.repeat(260)}`,
			source: { ...source, source_id: `fixture-alias-${index}` }
		}));
		const profile = compile(manyAliases);

		expect(profile.groups.identity).toHaveLength(80);
		expect(profile.groups.identity.every((entry) => entry.value_truncated)).toBe(true);
		expect(profile.omitted.group_limit_count.identity).toBe(5);
	});

	it('produces an explainable diff when a source disappears', () => {
		const previous = compile();
		const withoutTicket = syntheticAlphaProfileCandidates.filter(
			(candidate) => !(candidate.group === 'identifiers' && candidate.field === 'ticket')
		);
		const current = compile(withoutTicket, { profileVersion: 2, previous });

		expect(current.diff.material_change).toBe(true);
		expect(current.diff.previous_profile_hash).toBe(previous.profile_hash);
		expect(current.diff.removed).toContainEqual({
			group: 'identifiers',
			field: 'ticket',
			value: 'AUR-1042'
		});
	});

	it('does not treat a version bump as a material change', () => {
		const previous = compile();
		const next = compile(syntheticAlphaProfileCandidates, {
			profileVersion: 2,
			previous
		});

		expect(next.profile_hash).toBe(previous.profile_hash);
		expect(next.diff).toMatchObject({
			material_change: false,
			added: [],
			removed: []
		});
	});

	it('keeps prompt-injection fixtures as inert synthetic data', () => {
		const malicious = syntheticEmailMetadataFixtures.find(
			(fixture) => fixture.fixture_id === 'malicious-instruction'
		);

		expect(malicious).toMatchObject({
			expected_project_id: null,
			contains_untrusted_instruction: true
		});
		expect(Object.keys(malicious ?? {})).not.toContain('tool');
		expect(Object.keys(malicious ?? {})).not.toContain('action');
	});
});
