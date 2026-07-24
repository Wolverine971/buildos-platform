import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Json } from '@buildos/shared-types';
import type { CompiledProjectEmailProfile } from './project-email-profile';
import {
	ProjectEmailProfilePublicationError,
	ProjectEmailProfilePublicationService,
	ProjectEmailProfilePublicationStoreError,
	type ProjectEmailProfilePublicationStore
} from './project-email-profile-publication';
import type { BuildProjectEmailProfileCandidatesInput } from './project-email-profile-sources';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ALPHA_ID = '20000000-0000-4000-8000-000000000001';
const PROJECT_BETA_ID = '20000000-0000-4000-8000-000000000002';
const PROFILE_IDS = new Map([
	[PROJECT_ALPHA_ID, '30000000-0000-4000-8000-000000000001'],
	[PROJECT_BETA_ID, '30000000-0000-4000-8000-000000000002']
]);
const SNAPSHOT_AT = '2026-07-23T18:00:00.000Z';

type ProfilePointer = Awaited<
	ReturnType<ProjectEmailProfilePublicationStore['loadActiveProfiles']>
>[number];
type StoredVersion = Awaited<
	ReturnType<ProjectEmailProfilePublicationStore['loadProfileVersions']>
>[number];

function sourceInput(projectId: string, name: string): BuildProjectEmailProfileCandidatesInput {
	return {
		user_id: USER_ID,
		project: {
			id: projectId,
			name,
			description: `${name} bounded planning context`,
			next_step_short: null,
			next_step_long: null,
			props: { aliases: [`${name} alias`] },
			updated_at: '2026-07-22T12:00:00.000Z'
		},
		nearby_projects: [
			{
				id: projectId === PROJECT_ALPHA_ID ? PROJECT_BETA_ID : PROJECT_ALPHA_ID,
				name: projectId === PROJECT_ALPHA_ID ? 'Beta Harbor' : 'Alpha Lantern',
				updated_at: '2026-07-21T12:00:00.000Z'
			}
		]
	};
}

class FakePublicationStore implements ProjectEmailProfilePublicationStore {
	sources = new Map<string, BuildProjectEmailProfileCandidatesInput>([
		[PROJECT_ALPHA_ID, sourceInput(PROJECT_ALPHA_ID, 'Alpha Lantern')],
		[PROJECT_BETA_ID, sourceInput(PROJECT_BETA_ID, 'Beta Harbor')]
	]);
	profiles = new Map<string, ProfilePointer>();
	versions = new Map<string, StoredVersion[]>();
	writes: Array<'email_project_profiles' | 'email_project_profile_versions'> = [];
	appendAttempts = 0;
	onAppend?: (input: {
		profile_id: string;
		compiled: CompiledProjectEmailProfile;
	}) => Promise<StoredVersion> | undefined;

	async loadOwnedSourceInputs(input: {
		user_id: string;
		project_ids: string[];
		source_snapshot_at: string;
	}) {
		return input.project_ids
			.map((projectId) => this.sources.get(projectId))
			.filter((source): source is BuildProjectEmailProfileCandidatesInput => Boolean(source));
	}

	async loadActiveProfiles(input: { user_id: string; project_ids: string[] }) {
		return input.project_ids
			.map((projectId) => this.profiles.get(projectId))
			.filter((profile): profile is ProfilePointer => Boolean(profile));
	}

	async loadProfileVersions(input: { profile_ids: string[] }) {
		return input.profile_ids.flatMap((profileId) => this.versions.get(profileId) ?? []);
	}

	async createProfile(input: { user_id: string; project_id: string }) {
		if (this.profiles.has(input.project_id)) {
			throw new ProjectEmailProfilePublicationStoreError('version_conflict');
		}
		const profile: ProfilePointer = {
			id: PROFILE_IDS.get(input.project_id)!,
			user_id: input.user_id,
			project_id: input.project_id,
			current_version: 0,
			current_profile_hash: null,
			compiler_version: null,
			source_snapshot_at: null
		};
		this.profiles.set(input.project_id, profile);
		this.writes.push('email_project_profiles');
		return profile;
	}

	private persistVersion(input: {
		profile_id: string;
		compiled: CompiledProjectEmailProfile;
	}): StoredVersion {
		const version: StoredVersion = {
			id: `40000000-0000-4000-8000-${String(this.appendAttempts).padStart(12, '0')}`,
			profile_id: input.profile_id,
			profile_version: input.compiled.profile_version,
			compiler_version: input.compiled.compiler_version,
			source_snapshot_at: input.compiled.source_snapshot_at,
			profile_hash: input.compiled.profile_hash,
			groups: input.compiled.groups as unknown as Json,
			diff: input.compiled.diff as unknown as Json,
			omitted: input.compiled.omitted as unknown as Json
		};
		this.versions.set(input.profile_id, [...(this.versions.get(input.profile_id) ?? []), version]);
		const profile = [...this.profiles.values()].find((candidate) => candidate.id === input.profile_id)!;
		profile.current_version = version.profile_version;
		profile.current_profile_hash = version.profile_hash;
		profile.compiler_version = version.compiler_version;
		profile.source_snapshot_at = version.source_snapshot_at;
		this.writes.push('email_project_profile_versions');
		return version;
	}

	async appendVersion(input: {
		profile_id: string;
		compiled: CompiledProjectEmailProfile;
	}) {
		this.appendAttempts += 1;
		const overridden = await this.onAppend?.(input);
		if (overridden) return overridden;
		return this.persistVersion(input);
	}

	persistConcurrentWinner(input: {
		profile_id: string;
		compiled: CompiledProjectEmailProfile;
	}) {
		return this.persistVersion(input);
	}
}

function service(store: FakePublicationStore) {
	return new ProjectEmailProfilePublicationService({
		store,
		now: () => new Date(SNAPSHOT_AT)
	});
}

describe('ProjectEmailProfilePublicationService', () => {
	it('publishes two deterministic versions at one snapshot and is idempotent across input order', async () => {
		const store = new FakePublicationStore();
		const publisher = service(store);

		const first = await publisher.captureProfiles({
			user_id: USER_ID,
			project_ids: [PROJECT_BETA_ID, PROJECT_ALPHA_ID]
		});
		const second = await publisher.captureProfiles({
			user_id: USER_ID,
			project_ids: [PROJECT_ALPHA_ID, PROJECT_BETA_ID]
		});

		expect(first).toEqual(second);
		expect(first.map((selection) => selection.project_id)).toEqual([
			PROJECT_ALPHA_ID,
			PROJECT_BETA_ID
		]);
		expect(first.every((selection) => selection.profile_version === 1)).toBe(true);
		expect(store.appendAttempts).toBe(2);
		expect([...store.versions.values()].flat().map((version) => version.source_snapshot_at)).toEqual([
			SNAPSHOT_AT,
			SNAPSHOT_AT
		]);
	});

	it('appends exactly one new version when one project source changes', async () => {
		const store = new FakePublicationStore();
		const publisher = service(store);
		await publisher.captureProfiles({
			user_id: USER_ID,
			project_ids: [PROJECT_ALPHA_ID, PROJECT_BETA_ID]
		});
		store.sources.set(PROJECT_ALPHA_ID, sourceInput(PROJECT_ALPHA_ID, 'Alpha Lantern Revised'));

		const selections = await publisher.captureProfiles({
			user_id: USER_ID,
			project_ids: [PROJECT_ALPHA_ID, PROJECT_BETA_ID]
		});

		expect(selections.map((selection) => selection.profile_version)).toEqual([2, 1]);
		expect(store.appendAttempts).toBe(3);
		expect(store.versions.get(PROFILE_IDS.get(PROJECT_ALPHA_ID)!)).toHaveLength(2);
		expect(store.versions.get(PROFILE_IDS.get(PROJECT_BETA_ID)!)).toHaveLength(1);
	});

	it('fails unavailable projects before writing any profile row', async () => {
		const store = new FakePublicationStore();
		store.sources.delete(PROJECT_BETA_ID);

		await expect(
			service(store).captureProfiles({
				user_id: USER_ID,
				project_ids: [PROJECT_ALPHA_ID, PROJECT_BETA_ID]
			})
		).rejects.toEqual(
			expect.objectContaining<ProjectEmailProfilePublicationError>({
				code: 'project_unavailable'
			})
		);
		expect(store.writes).toEqual([]);
	});

	it('reloads and accepts an identical concurrent version winner', async () => {
		const store = new FakePublicationStore();
		let raced = false;
		store.onAppend = async (input) => {
			if (raced) return undefined;
			raced = true;
			store.persistConcurrentWinner(input);
			throw new ProjectEmailProfilePublicationStoreError('version_conflict');
		};

		const selections = await service(store).captureProfiles({
			user_id: USER_ID,
			project_ids: [PROJECT_ALPHA_ID]
		});

		expect(selections).toHaveLength(1);
		expect(selections[0]?.profile_version).toBe(1);
		expect(store.versions.get(PROFILE_IDS.get(PROJECT_ALPHA_ID)!)).toHaveLength(1);
	});

	it('returns and throws only content-free material and writes only dedicated profile tables', async () => {
		const store = new FakePublicationStore();
		const restrictedTerm = 'Confidential Nebula Phrase';
		store.sources.set(PROJECT_ALPHA_ID, sourceInput(PROJECT_ALPHA_ID, restrictedTerm));
		const publisher = service(store);

		const result = await publisher.captureProfiles({
			user_id: USER_ID,
			project_ids: [PROJECT_ALPHA_ID]
		});
		expect(JSON.stringify(result)).not.toContain(restrictedTerm);
		expect(store.writes.every((table) => table.startsWith('email_project_profile'))).toBe(true);

		store.sources.delete(PROJECT_ALPHA_ID);
		let failure: unknown;
		try {
			await publisher.captureProfiles({ user_id: USER_ID, project_ids: [PROJECT_ALPHA_ID] });
		} catch (cause) {
			failure = cause;
		}
		expect(String(failure)).not.toContain(restrictedTerm);
		expect(String(failure)).not.toContain(PROJECT_ALPHA_ID);

		const source = readFileSync(new URL('./project-email-profile-publication.ts', import.meta.url), 'utf8');
		expect(source).not.toMatch(/from\('onto_[^']+'\)[\s\S]{0,120}\.update\(/);
		expect(source).not.toMatch(/from\('onto_[^']+'\)[\s\S]{0,120}\.insert\(/);
	});
});
