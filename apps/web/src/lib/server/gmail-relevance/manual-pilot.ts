import type { Json } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GMAIL_READ_SCOPE } from '../gmail-read-oauth.service';
import { EmailRelevanceMetadataDriver, type EmailRelevanceMetadataDriverResult } from './metadata-driver';
import {
	isGmailRelevancePhaseAEnabled,
	isGmailRelevancePhaseAUserAllowed
} from './config';
import {
	ProjectEmailProfilePublicationService,
	type ProjectEmailProfilePublicationStore
} from './project-email-profile-publication';
import {
	EmailRelevanceScanControlPlane,
	EmailRelevanceScanControlPlaneError,
	type EmailRelevanceScanControlAction
} from './scan-control-plane';
import { hashEmailRelevanceScanIdempotencyKey } from './scan-manifest';
import type { EmailRelevanceScanRunState } from './scan-state';

const UUID_SCHEMA = z.string().uuid();
const CREATE_INPUT_SCHEMA = z
	.object({
		user_id: UUID_SCHEMA,
		idempotency_key: z.string().min(16).max(200),
		connection_ids: z.array(UUID_SCHEMA).min(1).max(3),
		project_ids: z.array(UUID_SCHEMA).min(1).max(25)
	})
	.strict();
const RUN_ONE_INPUT_SCHEMA = z
	.object({
		user_id: UUID_SCHEMA,
		run_id: UUID_SCHEMA,
		connection_scope_id: UUID_SCHEMA
	})
	.strict();
const CONTROL_INPUT_SCHEMA = z
	.object({
		user_id: UUID_SCHEMA,
		run_id: UUID_SCHEMA,
		action: z.enum(['pause', 'resume', 'cancel', 'expire'])
	})
	.strict();

type ExistingRun = {
	id: string;
	configuration: Json;
};

export type GmailRelevancePilotRepository = {
	listEligibleConnectionIds(userId: string): Promise<string[]>;
	listOwnedProjectIds(userId: string): Promise<string[]>;
	loadExistingRun(input: { user_id: string; idempotency_key_hash: string }): Promise<ExistingRun | null>;
	loadConnectionScopeIds(input: { user_id: string; run_id: string }): Promise<string[]>;
};

export type GmailRelevancePilotServiceErrorCode =
	| 'phase_a_disabled'
	| 'user_not_allowed'
	| 'invalid_input'
	| 'connection_unavailable'
	| 'project_unavailable'
	| 'idempotency_conflict'
	| 'scope_unavailable'
	| 'storage_unavailable';

export class GmailRelevancePilotServiceError extends Error {
	constructor(public readonly code: GmailRelevancePilotServiceErrorCode) {
		super(`Gmail relevance pilot rejected: ${code}`);
		this.name = 'GmailRelevancePilotServiceError';
	}
}

function compareAscii(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort(compareAscii);
}

function hasReadOnlyGmailScope(scopes: string[] | null | undefined): boolean {
	if (!Array.isArray(scopes)) return false;
	const normalized = uniqueSorted(scopes.map((scope) => scope.trim()).filter(Boolean));
	return (
		normalized.includes(GMAIL_READ_SCOPE) &&
		!normalized.some(
			(scope) =>
				scope.replace(/\/+$/, '') === 'https://mail.google.com' ||
				(scope.startsWith('https://www.googleapis.com/auth/gmail.') &&
					scope !== GMAIL_READ_SCOPE)
		)
	);
}

function storageFailure(): never {
	throw new GmailRelevancePilotServiceError('storage_unavailable');
}

class SupabaseGmailRelevancePilotRepository implements GmailRelevancePilotRepository {
	constructor(private readonly client: TypedSupabaseClient = createAdminSupabaseClient()) {}

	async listEligibleConnectionIds(userId: string): Promise<string[]> {
		const { data: connections, error: connectionError } = await this.client
			.from('user_email_connections')
			.select('id')
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.eq('status', 'active')
			.eq('read_enabled', true)
			.is('deleted_at', null);
		if (connectionError) storageFailure();
		const connectionIds = (connections ?? []).map((connection) => connection.id);
		if (connectionIds.length === 0) return [];

		const [{ data: grants, error: grantError }, { data: credentials, error: credentialError }] =
			await Promise.all([
				this.client
					.from('email_capability_grants')
					.select('connection_id, status, granted_scopes')
					.in('connection_id', connectionIds)
					.eq('capability', 'read'),
				this.client
					.from('email_connection_credentials')
					.select('connection_id, granted_scopes')
					.in('connection_id', connectionIds)
					.eq('grant_kind', 'read')
					.eq('oauth_client_kind', 'gmail_read')
					.is('revoked_at', null)
			]);
		if (grantError || credentialError) storageFailure();
		const eligible = connectionIds.filter((connectionId) => {
			const grant = (grants ?? []).find((row) => row.connection_id === connectionId);
			const credential = (credentials ?? []).find(
				(row) => row.connection_id === connectionId
			);
			return (
				grant?.status === 'enabled' &&
				hasReadOnlyGmailScope(grant.granted_scopes) &&
				hasReadOnlyGmailScope(credential?.granted_scopes)
			);
		});
		return eligible.sort(compareAscii);
	}

	async listOwnedProjectIds(userId: string): Promise<string[]> {
		const { data: actor, error: actorError } = await this.client
			.from('onto_actors')
			.select('id')
			.eq('user_id', userId)
			.maybeSingle();
		if (actorError) storageFailure();
		if (!actor) return [];
		const [{ data: memberships, error: membershipError }, { data: projects, error: projectError }] =
			await Promise.all([
				this.client
					.from('onto_project_members')
					.select('project_id')
					.eq('actor_id', actor.id)
					.eq('role_key', 'owner')
					.is('removed_at', null),
				this.client
					.from('onto_projects')
					.select('id, created_by')
					.is('deleted_at', null)
					.limit(1000)
			]);
		if (membershipError || projectError) storageFailure();
		const memberIds = new Set((memberships ?? []).map((row) => row.project_id));
		return (projects ?? [])
			.filter((project) => project.created_by === actor.id || memberIds.has(project.id))
			.map((project) => project.id)
			.sort(compareAscii);
	}

	async loadExistingRun(input: {
		user_id: string;
		idempotency_key_hash: string;
	}): Promise<ExistingRun | null> {
		const { data, error } = await this.client
			.from('email_relevance_scan_runs')
			.select('id, configuration')
			.eq('user_id', input.user_id)
			.eq('idempotency_key_hash', input.idempotency_key_hash)
			.maybeSingle();
		if (error) storageFailure();
		return data;
	}

	async loadConnectionScopeIds(input: {
		user_id: string;
		run_id: string;
	}): Promise<string[]> {
		const { data, error } = await this.client
			.from('email_relevance_scan_connections')
			.select('id, email_relevance_scan_runs!inner(user_id)')
			.eq('run_id', input.run_id)
			.eq('email_relevance_scan_runs.user_id', input.user_id)
			.order('id', { ascending: true });
		if (error) storageFailure();
		return (data ?? []).map((scope) => scope.id);
	}
}

function existingSelection(run: ExistingRun): {
	connection_ids: string[];
	project_ids: string[];
} | null {
	const parsed = z
		.object({
			connection_ids: z.array(UUID_SCHEMA),
			projects: z.array(z.object({ project_id: UUID_SCHEMA }).passthrough())
		})
		.passthrough()
		.safeParse(run.configuration);
	if (!parsed.success) return null;
	return {
		connection_ids: uniqueSorted(parsed.data.connection_ids),
		project_ids: uniqueSorted(parsed.data.projects.map((project) => project.project_id))
	};
}

function sameValues(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

type GmailRelevancePilotServiceDependencies = {
	repository?: GmailRelevancePilotRepository;
	publicationStore?: ProjectEmailProfilePublicationStore;
	profilePublisher?: Pick<ProjectEmailProfilePublicationService, 'captureProfiles'>;
	controlPlane?: Pick<
		EmailRelevanceScanControlPlane,
		'createRun' | 'controlRun' | 'expireRun'
	>;
	driver?: Pick<EmailRelevanceMetadataDriver, 'runOneOperation'>;
	now?: () => Date;
	environment?: Record<string, string | undefined>;
};

export class GmailRelevancePilotService {
	private readonly repository: GmailRelevancePilotRepository;
	private readonly profilePublisher: Pick<
		ProjectEmailProfilePublicationService,
		'captureProfiles'
	>;
	private readonly controlPlane: Pick<
		EmailRelevanceScanControlPlane,
		'createRun' | 'controlRun' | 'expireRun'
	>;
	private readonly driver: Pick<EmailRelevanceMetadataDriver, 'runOneOperation'>;
	private readonly now: () => Date;
	private readonly environment: Record<string, string | undefined>;

	constructor(dependencies: GmailRelevancePilotServiceDependencies = {}) {
		this.repository = dependencies.repository ?? new SupabaseGmailRelevancePilotRepository();
		this.profilePublisher =
			dependencies.profilePublisher ??
			new ProjectEmailProfilePublicationService(
				dependencies.publicationStore ? { store: dependencies.publicationStore } : {}
			);
		this.controlPlane = dependencies.controlPlane ?? new EmailRelevanceScanControlPlane();
		this.driver = dependencies.driver ?? new EmailRelevanceMetadataDriver();
		this.now = dependencies.now ?? (() => new Date());
		this.environment = dependencies.environment ?? process.env;
	}

	private assertAllowed(userId: string): void {
		if (!isGmailRelevancePhaseAUserAllowed(userId, this.environment)) {
			throw new GmailRelevancePilotServiceError(
				isGmailRelevancePhaseAEnabled(this.environment)
					? 'user_not_allowed'
					: 'phase_a_disabled'
			);
		}
	}

	async listOptions(userId: string): Promise<{
		connection_ids: string[];
		project_ids: string[];
	}> {
		this.assertAllowed(userId);
		if (!UUID_SCHEMA.safeParse(userId).success) {
			throw new GmailRelevancePilotServiceError('invalid_input');
		}
		const [connectionIds, projectIds] = await Promise.all([
			this.repository.listEligibleConnectionIds(userId),
			this.repository.listOwnedProjectIds(userId)
		]);
		return { connection_ids: connectionIds, project_ids: projectIds };
	}

	private async existingResult(input: {
		user_id: string;
		idempotency_key_hash: string;
		connection_ids: string[];
		project_ids: string[];
	}): Promise<{ run_id: string; created: false; connection_scope_ids: string[] } | null> {
		const existing = await this.repository.loadExistingRun(input);
		if (!existing) return null;
		const selection = existingSelection(existing);
		if (
			!selection ||
			!sameValues(selection.connection_ids, input.connection_ids) ||
			!sameValues(selection.project_ids, input.project_ids)
		) {
			throw new GmailRelevancePilotServiceError('idempotency_conflict');
		}
		return {
			run_id: existing.id,
			created: false,
			connection_scope_ids: await this.repository.loadConnectionScopeIds({
				user_id: input.user_id,
				run_id: existing.id
			})
		};
	}

	async createOrResumeRun(input: {
		user_id: string;
		idempotency_key: string;
		connection_ids: string[];
		project_ids: string[];
	}): Promise<{ run_id: string; created: boolean; connection_scope_ids: string[] }> {
		this.assertAllowed(input.user_id);
		const parsed = CREATE_INPUT_SCHEMA.safeParse(input);
		if (
			!parsed.success ||
			new Set(parsed.data.connection_ids).size !== parsed.data.connection_ids.length ||
			new Set(parsed.data.project_ids).size !== parsed.data.project_ids.length
		) {
			throw new GmailRelevancePilotServiceError('invalid_input');
		}
		const connectionIds = [...parsed.data.connection_ids].sort(compareAscii);
		const projectIds = [...parsed.data.project_ids].sort(compareAscii);
		const eligibleConnections = await this.repository.listEligibleConnectionIds(
			parsed.data.user_id
		);
		if (connectionIds.some((id) => !eligibleConnections.includes(id))) {
			throw new GmailRelevancePilotServiceError('connection_unavailable');
		}
		const idempotencyKeyHash = hashEmailRelevanceScanIdempotencyKey(
			parsed.data.user_id,
			parsed.data.idempotency_key
		);
		const existing = await this.existingResult({
			user_id: parsed.data.user_id,
			idempotency_key_hash: idempotencyKeyHash,
			connection_ids: connectionIds,
			project_ids: projectIds
		});
		if (existing) return existing;

		const projects = await this.profilePublisher.captureProfiles({
			user_id: parsed.data.user_id,
			project_ids: projectIds
		});
		const now = this.now();
		const windowEndMs = Math.floor(now.getTime() / 60_000) * 60_000;
		const windowStartMs = windowEndMs - 30 * 24 * 60 * 60 * 1_000;
		const expiresAtMs = windowEndMs + 24 * 60 * 60 * 1_000;
		let created: Awaited<ReturnType<EmailRelevanceScanControlPlane['createRun']>>;
		try {
			created = await this.controlPlane.createRun({
				user_id: parsed.data.user_id,
				idempotency_key: parsed.data.idempotency_key,
				connection_ids: connectionIds,
				projects,
				window_start: new Date(windowStartMs).toISOString(),
				window_end: new Date(windowEndMs).toISOString(),
				expires_at: new Date(expiresAtMs).toISOString()
			});
		} catch (cause) {
			if (
				cause instanceof EmailRelevanceScanControlPlaneError &&
				cause.code === 'idempotency_conflict'
			) {
				const winner = await this.existingResult({
					user_id: parsed.data.user_id,
					idempotency_key_hash: idempotencyKeyHash,
					connection_ids: connectionIds,
					project_ids: projectIds
				});
				if (winner) return winner;
			}
			throw cause;
		}

		return {
			run_id: created.run_id,
			created: created.created,
			connection_scope_ids: await this.repository.loadConnectionScopeIds({
				user_id: parsed.data.user_id,
				run_id: created.run_id
			})
		};
	}

	async runOneOperation(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
	}): Promise<EmailRelevanceMetadataDriverResult> {
		this.assertAllowed(input.user_id);
		const parsed = RUN_ONE_INPUT_SCHEMA.safeParse(input);
		if (!parsed.success) throw new GmailRelevancePilotServiceError('invalid_input');
		return this.driver.runOneOperation(parsed.data);
	}

	async controlRun(input: {
		user_id: string;
		run_id: string;
		action: EmailRelevanceScanControlAction | 'expire';
	}): Promise<EmailRelevanceScanRunState> {
		this.assertAllowed(input.user_id);
		const parsed = CONTROL_INPUT_SCHEMA.safeParse(input);
		if (!parsed.success) throw new GmailRelevancePilotServiceError('invalid_input');
		if (parsed.data.action === 'expire') {
			return this.controlPlane.expireRun({
				user_id: parsed.data.user_id,
				run_id: parsed.data.run_id
			});
		}
		return this.controlPlane.controlRun({
			user_id: parsed.data.user_id,
			run_id: parsed.data.run_id,
			action: parsed.data.action
		});
	}
}

export function createGmailRelevancePilotService(): GmailRelevancePilotService {
	return new GmailRelevancePilotService();
}
