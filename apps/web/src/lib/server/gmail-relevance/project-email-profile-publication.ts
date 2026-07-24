import type { Json } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	compileProjectEmailProfile,
	PROJECT_EMAIL_PROFILE_COMPILER_VERSION,
	type CompiledProjectEmailProfile,
	type ProjectEmailProfileDiff,
	type ProjectEmailProfileGroups
} from './project-email-profile';
import {
	buildProjectEmailProfileCandidates,
	type BuildProjectEmailProfileCandidatesInput,
	type ProjectEmailProfileDocumentRow,
	type ProjectEmailProfileEventRow,
	type ProjectEmailProfileGoalRow,
	type ProjectEmailProfileMemberRow,
	type ProjectEmailProfileMilestoneRow,
	type ProjectEmailProfileProjectRow,
	type ProjectEmailProfileTaskRow
} from './project-email-profile-sources';
import type { EmailRelevanceScanProjectSelection } from './scan-manifest';

const UUID_SCHEMA = z.string().uuid();
const PUBLICATION_INPUT_SCHEMA = z
	.object({
		user_id: UUID_SCHEMA,
		project_ids: z.array(UUID_SCHEMA).min(1).max(25)
	})
	.strict();

type ProfilePointer = {
	id: string;
	user_id: string;
	project_id: string;
	current_version: number;
	current_profile_hash: string | null;
	compiler_version: string | null;
	source_snapshot_at: string | null;
};

type StoredProfileVersion = {
	id: string;
	profile_id: string;
	profile_version: number;
	compiler_version: string;
	source_snapshot_at: string;
	profile_hash: string;
	groups: Json;
	diff: Json;
	omitted: Json;
};

type PublicationStoreErrorCode = 'storage_unavailable' | 'version_conflict';

export class ProjectEmailProfilePublicationStoreError extends Error {
	constructor(public readonly code: PublicationStoreErrorCode) {
		super(`Project email profile publication store failed: ${code}`);
		this.name = 'ProjectEmailProfilePublicationStoreError';
	}
}

export type ProjectEmailProfilePublicationStore = {
	loadOwnedSourceInputs(input: {
		user_id: string;
		project_ids: string[];
		source_snapshot_at: string;
	}): Promise<BuildProjectEmailProfileCandidatesInput[]>;
	loadActiveProfiles(input: {
		user_id: string;
		project_ids: string[];
	}): Promise<ProfilePointer[]>;
	loadProfileVersions(input: {
		profile_ids: string[];
	}): Promise<StoredProfileVersion[]>;
	createProfile(input: { user_id: string; project_id: string }): Promise<ProfilePointer>;
	appendVersion(input: {
		profile_id: string;
		compiled: CompiledProjectEmailProfile;
	}): Promise<StoredProfileVersion>;
};

export type ProjectEmailProfilePublicationErrorCode =
	| 'invalid_input'
	| 'project_unavailable'
	| 'profile_unavailable'
	| 'concurrent_publication_conflict'
	| 'storage_unavailable';

export class ProjectEmailProfilePublicationError extends Error {
	constructor(public readonly code: ProjectEmailProfilePublicationErrorCode) {
		super(`Project email profile publication rejected: ${code}`);
		this.name = 'ProjectEmailProfilePublicationError';
	}
}

function compareAscii(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function throwStorageError(error: { code?: string; message?: string } | null): never {
	if (
		error?.code === '23505' ||
		error?.message?.includes('email_relevance_profile_version_out_of_sequence')
	) {
		throw new ProjectEmailProfilePublicationStoreError('version_conflict');
	}
	throw new ProjectEmailProfilePublicationStoreError('storage_unavailable');
}

function asCompiledProfile(
	userId: string,
	projectId: string,
	version: StoredProfileVersion
): CompiledProjectEmailProfile {
	return {
		user_id: userId,
		project_id: projectId,
		profile_version: version.profile_version,
		compiler_version: PROJECT_EMAIL_PROFILE_COMPILER_VERSION,
		source_snapshot_at: version.source_snapshot_at,
		profile_hash: version.profile_hash,
		groups: version.groups as unknown as ProjectEmailProfileGroups,
		diff: version.diff as unknown as ProjectEmailProfileDiff,
		omitted: version.omitted as unknown as CompiledProjectEmailProfile['omitted']
	};
}

function selectionFrom(
	projectId: string,
	profile: ProfilePointer,
	version: StoredProfileVersion
): EmailRelevanceScanProjectSelection {
	return {
		project_id: projectId,
		profile_id: profile.id,
		profile_version: version.profile_version,
		profile_hash: version.profile_hash
	};
}

function isMatchingVersion(
	version: StoredProfileVersion,
	compiled: CompiledProjectEmailProfile
): boolean {
	return (
		version.compiler_version === compiled.compiler_version &&
		version.profile_hash === compiled.profile_hash
	);
}

class SupabaseProjectEmailProfilePublicationStore
	implements ProjectEmailProfilePublicationStore
{
	constructor(private readonly client: TypedSupabaseClient = createAdminSupabaseClient()) {}

	async loadOwnedSourceInputs(input: {
		user_id: string;
		project_ids: string[];
		source_snapshot_at: string;
	}): Promise<BuildProjectEmailProfileCandidatesInput[]> {
		const { data: actor, error: actorError } = await this.client
			.from('onto_actors')
			.select('id')
			.eq('user_id', input.user_id)
			.maybeSingle();
		if (actorError) throwStorageError(actorError);
		if (!actor) throw new ProjectEmailProfilePublicationError('project_unavailable');

		const [{ data: memberships, error: membershipError }, { data: projectRows, error: projectError }] =
			await Promise.all([
				this.client
					.from('onto_project_members')
					.select('project_id')
					.eq('actor_id', actor.id)
					.eq('role_key', 'owner')
					.is('removed_at', null),
				this.client
					.from('onto_projects')
					.select(
						'id, name, description, next_step_short, next_step_long, props, updated_at, created_by'
					)
					.is('deleted_at', null)
					.lte('updated_at', input.source_snapshot_at)
					.order('updated_at', { ascending: false })
					.limit(1000)
			]);
		if (membershipError || projectError) throwStorageError(membershipError ?? projectError);

		const memberProjectIds = new Set((memberships ?? []).map((row) => row.project_id));
		const ownedProjects = (projectRows ?? []).filter(
			(project) => project.created_by === actor.id || memberProjectIds.has(project.id)
		);
		const projectById = new Map(ownedProjects.map((project) => [project.id, project]));
		if (input.project_ids.some((projectId) => !projectById.has(projectId))) {
			throw new ProjectEmailProfilePublicationError('project_unavailable');
		}

		const selectedIds = input.project_ids;
		const [tasks, documents, goals, milestones, events, members] = await Promise.all([
			this.client
				.from('onto_tasks')
				.select('id, project_id, title, description, state_key, props, updated_at')
				.in('project_id', selectedIds)
				.is('deleted_at', null)
				.lte('updated_at', input.source_snapshot_at)
				.order('updated_at', { ascending: false })
				.limit(selectedIds.length * 60),
			this.client
				.from('onto_documents')
				.select('id, project_id, title, description, props, updated_at')
				.in('project_id', selectedIds)
				.is('deleted_at', null)
				.lte('updated_at', input.source_snapshot_at)
				.order('updated_at', { ascending: false })
				.limit(selectedIds.length * 60),
			this.client
				.from('onto_goals')
				.select('id, project_id, name, description, goal, updated_at')
				.in('project_id', selectedIds)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(selectedIds.length * 30),
			this.client
				.from('onto_milestones')
				.select('id, project_id, title, description, milestone, updated_at')
				.in('project_id', selectedIds)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.limit(selectedIds.length * 30),
			this.client
				.from('onto_events')
				.select('id, project_id, title, description, external_link, updated_at')
				.in('project_id', selectedIds)
				.is('deleted_at', null)
				.lte('updated_at', input.source_snapshot_at)
				.order('updated_at', { ascending: false })
				.limit(selectedIds.length * 30),
			this.client
				.from('onto_project_members')
				.select(
					'id, project_id, role_name, role_description, actor:onto_actors!onto_project_members_actor_id_fkey(id, name, email, user_id)'
				)
				.in('project_id', selectedIds)
				.is('removed_at', null)
				.limit(selectedIds.length * 50)
		]);
		const results = [tasks, documents, goals, milestones, events, members];
		const failed = results.find((result) => result.error);
		if (failed?.error) throwStorageError(failed.error);

		const byProject = <T extends { project_id: string | null }>(
			rows: T[] | null,
			projectId: string
		) =>
			(rows ?? []).filter((row) => row.project_id === projectId);
		const nearbyProjects = ownedProjects
			.map(({ id, name, updated_at }) => ({ id, name, updated_at }))
			.sort((left, right) => compareAscii(left.id, right.id));

		return selectedIds.map((projectId) => ({
			user_id: input.user_id,
			project: projectById.get(projectId)! as ProjectEmailProfileProjectRow,
			tasks: byProject(tasks.data, projectId) as ProjectEmailProfileTaskRow[],
			documents: byProject(documents.data, projectId) as ProjectEmailProfileDocumentRow[],
			goals: byProject(goals.data, projectId) as ProjectEmailProfileGoalRow[],
			milestones: byProject(
				milestones.data,
				projectId
			) as ProjectEmailProfileMilestoneRow[],
			events: byProject(events.data, projectId) as ProjectEmailProfileEventRow[],
			members: byProject(
				members.data as unknown as Array<ProjectEmailProfileMemberRow & { project_id: string }>,
				projectId
			) as ProjectEmailProfileMemberRow[],
			nearby_projects: nearbyProjects
		}));
	}

	async loadActiveProfiles(input: {
		user_id: string;
		project_ids: string[];
	}): Promise<ProfilePointer[]> {
		const { data, error } = await this.client
			.from('email_project_profiles')
			.select(
				'id, user_id, project_id, current_version, current_profile_hash, compiler_version, source_snapshot_at'
			)
			.eq('user_id', input.user_id)
			.in('project_id', input.project_ids)
			.is('deleted_at', null);
		if (error) throwStorageError(error);
		return data ?? [];
	}

	async loadProfileVersions(input: { profile_ids: string[] }): Promise<StoredProfileVersion[]> {
		if (input.profile_ids.length === 0) return [];
		const { data, error } = await this.client
			.from('email_project_profile_versions')
			.select(
				'id, profile_id, profile_version, compiler_version, source_snapshot_at, profile_hash, groups, diff, omitted'
			)
			.in('profile_id', input.profile_ids);
		if (error) throwStorageError(error);
		return data ?? [];
	}

	async createProfile(input: { user_id: string; project_id: string }): Promise<ProfilePointer> {
		const { data, error } = await this.client
			.from('email_project_profiles')
			.insert(input)
			.select(
				'id, user_id, project_id, current_version, current_profile_hash, compiler_version, source_snapshot_at'
			)
			.single();
		if (error || !data) throwStorageError(error);
		return data;
	}

	async appendVersion(input: {
		profile_id: string;
		compiled: CompiledProjectEmailProfile;
	}): Promise<StoredProfileVersion> {
		const { data, error } = await this.client
			.from('email_project_profile_versions')
			.insert({
				profile_id: input.profile_id,
				profile_version: input.compiled.profile_version,
				compiler_version: input.compiled.compiler_version,
				source_snapshot_at: input.compiled.source_snapshot_at,
				profile_hash: input.compiled.profile_hash,
				groups: input.compiled.groups as unknown as Json,
				diff: input.compiled.diff as unknown as Json,
				omitted: input.compiled.omitted as unknown as Json
			})
			.select(
				'id, profile_id, profile_version, compiler_version, source_snapshot_at, profile_hash, groups, diff, omitted'
			)
			.single();
		if (error || !data) throwStorageError(error);
		return data;
	}
}

type ProjectEmailProfilePublicationServiceDependencies = {
	store?: ProjectEmailProfilePublicationStore;
	now?: () => Date;
};

export class ProjectEmailProfilePublicationService {
	private readonly store: ProjectEmailProfilePublicationStore;
	private readonly now: () => Date;

	constructor(dependencies: ProjectEmailProfilePublicationServiceDependencies = {}) {
		this.store = dependencies.store ?? new SupabaseProjectEmailProfilePublicationStore();
		this.now = dependencies.now ?? (() => new Date());
	}

	private async reloadCurrentVersion(input: {
		user_id: string;
		project_id: string;
	}): Promise<{ profile: ProfilePointer; version: StoredProfileVersion | null }> {
		const profiles = await this.store.loadActiveProfiles({
			user_id: input.user_id,
			project_ids: [input.project_id]
		});
		const profile = profiles[0];
		if (!profile) throw new ProjectEmailProfilePublicationError('profile_unavailable');
		if (profile.current_version === 0) return { profile, version: null };
		const versions = await this.store.loadProfileVersions({ profile_ids: [profile.id] });
		const version = versions.find(
			(candidate) => candidate.profile_version === profile.current_version
		);
		if (!version) throw new ProjectEmailProfilePublicationError('profile_unavailable');
		return { profile, version };
	}

	async captureProfiles(input: {
		user_id: string;
		project_ids: string[];
	}): Promise<EmailRelevanceScanProjectSelection[]> {
		const parsed = PUBLICATION_INPUT_SCHEMA.safeParse(input);
		if (!parsed.success || new Set(parsed.data.project_ids).size !== parsed.data.project_ids.length) {
			throw new ProjectEmailProfilePublicationError('invalid_input');
		}

		const projectIds = [...parsed.data.project_ids].sort(compareAscii);
		const sourceSnapshotAt = this.now().toISOString();

		try {
			const sourceInputs = await this.store.loadOwnedSourceInputs({
				user_id: parsed.data.user_id,
				project_ids: projectIds,
				source_snapshot_at: sourceSnapshotAt
			});
			const sourcesByProject = new Map(
				sourceInputs.map((source) => [source.project.id, source])
			);
			if (
				sourcesByProject.size !== projectIds.length ||
				projectIds.some((projectId) => !sourcesByProject.has(projectId))
			) {
				throw new ProjectEmailProfilePublicationError('project_unavailable');
			}

			const existingProfiles = await this.store.loadActiveProfiles({
				user_id: parsed.data.user_id,
				project_ids: projectIds
			});
			const profileByProject = new Map(
				existingProfiles.map((profile) => [profile.project_id, profile])
			);
			const storedVersions = await this.store.loadProfileVersions({
				profile_ids: existingProfiles.map((profile) => profile.id)
			});
			const versionByProfileAndNumber = new Map(
				storedVersions.map((version) => [
					`${version.profile_id}:${version.profile_version}`,
					version
				])
			);

			const compiledByProject = new Map<string, CompiledProjectEmailProfile>();
			for (const projectId of projectIds) {
				const profile = profileByProject.get(projectId);
				const previousVersion = profile?.current_version
					? versionByProfileAndNumber.get(`${profile.id}:${profile.current_version}`)
					: undefined;
				if (profile?.current_version && !previousVersion) {
					throw new ProjectEmailProfilePublicationError('profile_unavailable');
				}
				const source = sourcesByProject.get(projectId)!;
				compiledByProject.set(
					projectId,
					compileProjectEmailProfile({
						user_id: parsed.data.user_id,
						project_id: projectId,
						profile_version: (profile?.current_version ?? 0) + 1,
						source_snapshot_at: sourceSnapshotAt,
						candidates: buildProjectEmailProfileCandidates(source),
						previous_profile: previousVersion
							? asCompiledProfile(parsed.data.user_id, projectId, previousVersion)
							: null
					})
				);
			}

			const selections: EmailRelevanceScanProjectSelection[] = [];
			for (const projectId of projectIds) {
				const compiled = compiledByProject.get(projectId)!;
				let profile = profileByProject.get(projectId);
				if (!profile) {
					try {
						profile = await this.store.createProfile({
							user_id: parsed.data.user_id,
							project_id: projectId
						});
					} catch (cause) {
						if (
							!(cause instanceof ProjectEmailProfilePublicationStoreError) ||
							cause.code !== 'version_conflict'
						) {
							throw cause;
						}
						const concurrent = await this.reloadCurrentVersion({
							user_id: parsed.data.user_id,
							project_id: projectId
						});
						profile = concurrent.profile;
						if (concurrent.version) {
							if (!isMatchingVersion(concurrent.version, compiled)) {
								throw new ProjectEmailProfilePublicationError(
									'concurrent_publication_conflict'
								);
							}
							selections.push(selectionFrom(projectId, profile, concurrent.version));
							continue;
						}
					}
				}

				const currentStoredVersion = profile.current_version
					? versionByProfileAndNumber.get(`${profile.id}:${profile.current_version}`)
					: undefined;
				if (currentStoredVersion && isMatchingVersion(currentStoredVersion, compiled)) {
					selections.push(selectionFrom(projectId, profile, currentStoredVersion));
					continue;
				}

				try {
					const inserted = await this.store.appendVersion({
						profile_id: profile.id,
						compiled
					});
					selections.push(selectionFrom(projectId, profile, inserted));
				} catch (cause) {
					if (
						!(cause instanceof ProjectEmailProfilePublicationStoreError) ||
						cause.code !== 'version_conflict'
					) {
						throw cause;
					}
					const concurrent = await this.reloadCurrentVersion({
						user_id: parsed.data.user_id,
						project_id: projectId
					});
					if (!concurrent.version || !isMatchingVersion(concurrent.version, compiled)) {
						throw new ProjectEmailProfilePublicationError(
							'concurrent_publication_conflict'
						);
					}
					selections.push(selectionFrom(projectId, concurrent.profile, concurrent.version));
				}
			}

			return selections;
		} catch (cause) {
			if (cause instanceof ProjectEmailProfilePublicationError) throw cause;
			if (cause instanceof ProjectEmailProfilePublicationStoreError) {
				throw new ProjectEmailProfilePublicationError(
					cause.code === 'version_conflict'
						? 'concurrent_publication_conflict'
						: 'storage_unavailable'
				);
			}
			throw new ProjectEmailProfilePublicationError('storage_unavailable');
		}
	}
}
