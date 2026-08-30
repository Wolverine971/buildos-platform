import { Pool, type PoolConfig, type QueryResult } from 'pg';
import {
	type AuthorizeLibriProviderCostInput,
	type AuthorizeLibriProviderCostReceipt,
	type LibriCostLedgerPort,
	type ReleaseLibriProviderCostInput,
	type ReleaseLibriProviderCostReceipt,
	type ReserveLibriProviderCostInput,
	type ReserveLibriProviderCostReceipt,
	type SettleLibriProviderCostInput,
	type SettleLibriProviderCostReceipt,
	createLibriCostLedger
} from './costLedger';
import {
	type CancelLibriRunInput,
	type CancelLibriRunReceipt,
	type ClaimLibriStepInput,
	type ClaimLibriStepReceipt,
	type CompleteLibriStepInput,
	type EnqueueLibriStepInput,
	type EnqueueLibriStepReceipt,
	type FailLibriStepInput,
	type FailLibriStepReceipt,
	type HeartbeatLibriStepInput,
	type LibriLifecyclePort,
	type LibriTransactionClient,
	type RecoverStaleLibriLeasesInput,
	type RecoverStaleLibriLeasesReceipt,
	createLibriLifecycle
} from './lifecycle';

const LIBRI_DATABASE_ROLE = 'libri_worker';
const MAX_LIBRI_DATABASE_CONNECTIONS = 3;

type RoleProbeRow = {
	role_name: string;
	can_login: boolean;
	is_superuser: boolean;
	can_create_database: boolean;
	can_create_role: boolean;
	inherits_roles: boolean;
	can_replicate: boolean;
	bypasses_rls: boolean;
	connection_limit: number;
	has_memberships: boolean;
	can_delete_queue_jobs: boolean;
	can_retag_queue_jobs: boolean;
};

export type LibriPgPool = {
	query: <T extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[]
	) => Promise<QueryResult<T>>;
	connect: () => Promise<LibriTransactionClient>;
	end: () => Promise<void>;
};

export type LibriDatabasePort = LibriLifecyclePort &
	LibriCostLedgerPort & {
		probe: () => Promise<void>;
		close: () => Promise<void>;
	};

type LibriPoolFactory = (config: PoolConfig) => LibriPgPool;

export type LibriDatabaseOptions = {
	caCertificate: string;
	connectionLimit?: number;
	poolFactory?: LibriPoolFactory;
};

export function createLibriDatabase(
	databaseUrl: string,
	options: LibriDatabaseOptions
): LibriDatabasePort {
	assertDatabaseUrl(databaseUrl);
	const caCertificate = normalizeCaCertificate(options.caCertificate);
	const connectionLimit = options.connectionLimit ?? MAX_LIBRI_DATABASE_CONNECTIONS;
	if (!Number.isSafeInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 3) {
		throw new Error('Libri database connection limit must be between 1 and 3');
	}
	const poolFactory = options.poolFactory ?? ((config: PoolConfig) => new Pool(config));

	const pool = poolFactory({
		connectionString: databaseUrl,
		application_name: 'buildos-libri-worker',
		max: connectionLimit,
		connectionTimeoutMillis: 5_000,
		idleTimeoutMillis: 30_000,
		allowExitOnIdle: true,
		ssl: { ca: caCertificate, rejectUnauthorized: true }
	});
	return new LibriDatabase(pool);
}

function normalizeCaCertificate(value: string): string {
	const certificate = value.trim();
	if (
		certificate.length > 16_384 ||
		!certificate.startsWith('-----BEGIN CERTIFICATE-----') ||
		!certificate.endsWith('-----END CERTIFICATE-----')
	) {
		throw new Error('LIBRI_DATABASE_CA_CERT must contain the Supabase root certificate PEM');
	}
	return `${certificate}\n`;
}

class LibriDatabase implements LibriDatabasePort {
	private readonly lifecycle: LibriLifecyclePort;
	private readonly costLedger: LibriCostLedgerPort;

	constructor(private readonly pool: LibriPgPool) {
		this.lifecycle = createLibriLifecycle(pool);
		this.costLedger = createLibriCostLedger(pool);
	}

	reserveProviderCost(
		input: ReserveLibriProviderCostInput
	): Promise<ReserveLibriProviderCostReceipt> {
		return this.costLedger.reserveProviderCost(input);
	}

	authorizeProviderCall(
		input: AuthorizeLibriProviderCostInput
	): Promise<AuthorizeLibriProviderCostReceipt> {
		return this.costLedger.authorizeProviderCall(input);
	}

	settleProviderCost(
		input: SettleLibriProviderCostInput
	): Promise<SettleLibriProviderCostReceipt> {
		return this.costLedger.settleProviderCost(input);
	}

	releaseProviderCost(
		input: ReleaseLibriProviderCostInput
	): Promise<ReleaseLibriProviderCostReceipt> {
		return this.costLedger.releaseProviderCost(input);
	}

	enqueueStep(input: EnqueueLibriStepInput): Promise<EnqueueLibriStepReceipt> {
		return this.lifecycle.enqueueStep(input);
	}

	claimNextStep(input: ClaimLibriStepInput): Promise<ClaimLibriStepReceipt> {
		return this.lifecycle.claimNextStep(input);
	}

	heartbeatStep(input: HeartbeatLibriStepInput): Promise<boolean> {
		return this.lifecycle.heartbeatStep(input);
	}

	completeStep(input: CompleteLibriStepInput): Promise<boolean> {
		return this.lifecycle.completeStep(input);
	}

	failStep(input: FailLibriStepInput): Promise<FailLibriStepReceipt> {
		return this.lifecycle.failStep(input);
	}

	cancelRun(input: CancelLibriRunInput): Promise<CancelLibriRunReceipt> {
		return this.lifecycle.cancelRun(input);
	}

	recoverStaleLeases(
		input?: RecoverStaleLibriLeasesInput
	): Promise<RecoverStaleLibriLeasesReceipt> {
		return this.lifecycle.recoverStaleLeases(input);
	}

	async probe(): Promise<void> {
		const result = await this.pool.query<RoleProbeRow>(`
			SELECT
				current_user::text AS role_name,
				role.rolcanlogin AS can_login,
				role.rolsuper AS is_superuser,
				role.rolcreatedb AS can_create_database,
				role.rolcreaterole AS can_create_role,
				role.rolinherit AS inherits_roles,
				role.rolreplication AS can_replicate,
				role.rolbypassrls AS bypasses_rls,
				role.rolconnlimit AS connection_limit,
				EXISTS (
					SELECT 1
					FROM pg_catalog.pg_auth_members membership
					WHERE membership.member = role.oid
				) AS has_memberships,
				pg_catalog.has_table_privilege(
					current_user,
					'public.queue_jobs',
					'DELETE'
				) AS can_delete_queue_jobs,
				pg_catalog.has_column_privilege(
					current_user,
					'public.queue_jobs',
					'job_type',
					'UPDATE'
				) AS can_retag_queue_jobs
			FROM pg_catalog.pg_roles role
			WHERE role.rolname = current_user
		`);
		const role = result.rows[0];
		if (!role || !isApprovedRole(role)) {
			throw new Error('Libri database connection is not using the approved restricted role');
		}
	}

	close(): Promise<void> {
		return this.pool.end();
	}
}

function assertDatabaseUrl(value: string): void {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error('LIBRI_DATABASE_URL must be a valid PostgreSQL URL');
	}
	if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
		throw new Error('LIBRI_DATABASE_URL must use the PostgreSQL protocol');
	}
	const username = decodeURIComponent(parsed.username);
	if (username !== LIBRI_DATABASE_ROLE && !username.startsWith(`${LIBRI_DATABASE_ROLE}.`)) {
		throw new Error('LIBRI_DATABASE_URL must authenticate as libri_worker');
	}
	if (!parsed.password) {
		throw new Error('LIBRI_DATABASE_URL must include the provisioned role password');
	}
}

function isApprovedRole(role: RoleProbeRow): boolean {
	return Boolean(
		role.role_name === LIBRI_DATABASE_ROLE &&
			role.can_login &&
			!role.is_superuser &&
			!role.can_create_database &&
			!role.can_create_role &&
			!role.inherits_roles &&
			!role.can_replicate &&
			!role.bypasses_rls &&
			role.connection_limit === MAX_LIBRI_DATABASE_CONNECTIONS &&
			!role.has_memberships &&
			!role.can_delete_queue_jobs &&
			!role.can_retag_queue_jobs
	);
}
