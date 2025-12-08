// apps/web/src/lib/services/ontology/migration-stats.service.ts
// Migration Stats Service - Provides aggregate statistics for migration dashboard

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export type MigrationUserStatus =
	| 'not_started'
	| 'partial'
	| 'complete'
	| 'has_errors'
	| 'no_projects';

export interface UserMigrationStats {
	userId: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	stats: {
		totalProjects: number;
		migratedProjects: number;
		pendingProjects: number;
		failedProjects: number;
		totalTasks: number;
		migratedTasks: number;
		percentComplete: number;
		lastMigrationAt: string | null;
	};
	migrationStatus: MigrationUserStatus;
}

export interface UserListParams {
	limit?: number;
	offset?: number;
	sortBy?: 'email' | 'totalProjects' | 'percentComplete' | 'lastMigrationAt';
	sortOrder?: 'asc' | 'desc';
	status?: MigrationUserStatus;
	search?: string;
}

export interface UserListResponse {
	users: UserMigrationStats[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
	aggregates: {
		totalUsers: number;
		usersWithProjects: number;
		usersFullyMigrated: number;
		usersPartiallyMigrated: number;
		usersNotStarted: number;
		usersWithErrors: number;
	};
	refreshedAt: string | null;
}

export interface GlobalProgress {
	projects: {
		total: number;
		migrated: number;
		pending: number;
		failed: number;
		percentComplete: number;
	};
	tasks: {
		total: number;
		migrated: number;
		pending: number;
		percentComplete: number;
	};
	users: {
		total: number;
		withProjects: number;
		fullyMigrated: number;
		partiallyMigrated: number;
		notStarted: number;
	};
	errors: {
		total: number;
		recoverable: number;
		dataErrors: number;
		fatal: number;
	};
	activeRun: {
		runId: string;
		status: string;
		startedAt: string;
		projectsProcessed: number;
		lockedBy: string;
	} | null;
	recentRuns: Array<{
		runId: string;
		status: string;
		startedAt: string;
		completedAt: string | null;
		projectsProcessed: number;
		projectsFailed: number;
		initiatedBy: string;
		initiatedByEmail: string;
	}>;
	lastRefreshed: string;
}

export interface RefreshStatsResult {
	refreshed: boolean;
	duration: number;
	rowCount: number;
	previousRefresh: string | null;
}

export interface LockStatus {
	isLocked: boolean;
	runId: string | null;
	lockedBy: string | null;
	lockedByEmail: string | null;
	lockedAt: string | null;
	expiresAt: string | null;
}

export class MigrationStatsService {
	constructor(private readonly supabase: SupabaseClient<Database>) {}

	/**
	 * Get paginated list of users with migration statistics
	 */
	async getUsers(params: UserListParams = {}): Promise<UserListResponse> {
		const {
			limit = 50,
			offset = 0,
			sortBy = 'email',
			sortOrder = 'asc',
			status,
			search
		} = params;

		// Clamp limit to max 200
		const clampedLimit = Math.min(Math.max(1, limit), 200);

		// Build query for the materialized view
		let query = this.supabase.from('user_migration_stats').select('*', { count: 'exact' });

		// Apply status filter
		if (status) {
			query = query.eq('migration_status', status);
		}

		// Apply search filter (email or name)
		if (search?.trim()) {
			const searchTerm = `%${search.trim()}%`;
			query = query.or(`email.ilike.${searchTerm},name.ilike.${searchTerm}`);
		}

		// Apply sorting
		const sortColumn = this.mapSortColumn(sortBy);
		query = query.order(sortColumn, { ascending: sortOrder === 'asc', nullsFirst: false });

		// Apply pagination
		query = query.range(offset, offset + clampedLimit - 1);

		const { data, error, count } = await query;

		if (error) {
			throw new Error(`Failed to fetch users: ${error.message}`);
		}

		// Get aggregates
		const aggregates = await this.getUserAggregates();

		// Map to response format
		const users: UserMigrationStats[] = (data ?? []).map((row) => ({
			userId: row.user_id,
			email: row.email ?? '',
			name: row.name,
			avatarUrl: row.avatar_url,
			stats: {
				totalProjects: row.total_projects ?? 0,
				migratedProjects: row.migrated_projects ?? 0,
				pendingProjects: row.pending_projects ?? 0,
				failedProjects: row.failed_projects ?? 0,
				totalTasks: row.total_tasks ?? 0,
				migratedTasks: row.migrated_tasks ?? 0,
				percentComplete: Number(row.percent_complete) ?? 0,
				lastMigrationAt: row.last_migration_at
			},
			migrationStatus: row.migration_status as MigrationUserStatus
		}));

		const total = count ?? 0;

		return {
			users,
			pagination: {
				total,
				limit: clampedLimit,
				offset,
				hasMore: offset + clampedLimit < total
			},
			aggregates,
			refreshedAt: new Date().toISOString() // Would be better to track actual refresh time
		};
	}

	/**
	 * Get aggregate user counts by status
	 */
	private async getUserAggregates(): Promise<UserListResponse['aggregates']> {
		const { data, error } = await this.supabase
			.from('user_migration_stats')
			.select('migration_status, total_projects');

		if (error) {
			console.error('Failed to get user aggregates:', error);
			return {
				totalUsers: 0,
				usersWithProjects: 0,
				usersFullyMigrated: 0,
				usersPartiallyMigrated: 0,
				usersNotStarted: 0,
				usersWithErrors: 0
			};
		}

		const rows = data ?? [];
		return {
			totalUsers: rows.length,
			usersWithProjects: rows.filter((r) => (r.total_projects ?? 0) > 0).length,
			usersFullyMigrated: rows.filter((r) => r.migration_status === 'complete').length,
			usersPartiallyMigrated: rows.filter((r) => r.migration_status === 'partial').length,
			usersNotStarted: rows.filter((r) => r.migration_status === 'not_started').length,
			usersWithErrors: rows.filter((r) => r.migration_status === 'has_errors').length
		};
	}

	/**
	 * Get global migration progress statistics
	 */
	async getGlobalProgress(): Promise<GlobalProgress> {
		// Get progress from the view
		const { data: progressData, error: progressError } = await this.supabase
			.from('global_migration_progress')
			.select('*')
			.single();

		if (progressError) {
			throw new Error(`Failed to fetch global progress: ${progressError.message}`);
		}

		const progress = progressData ?? {
			total_projects: 0,
			migrated_projects: 0,
			failed_projects: 0,
			total_tasks: 0,
			migrated_tasks: 0,
			failed_tasks: 0,
			total_users: 0,
			users_with_projects: 0,
			total_errors: 0,
			recoverable_errors: 0,
			data_errors: 0,
			fatal_errors: 0
		};

		// Get user migration status counts
		const { data: userStats } = await this.supabase
			.from('user_migration_stats')
			.select('migration_status');

		const userStatusCounts = {
			fullyMigrated: 0,
			partiallyMigrated: 0,
			notStarted: 0
		};

		for (const user of userStats ?? []) {
			if (user.migration_status === 'complete') userStatusCounts.fullyMigrated++;
			else if (user.migration_status === 'partial') userStatusCounts.partiallyMigrated++;
			else if (user.migration_status === 'not_started') userStatusCounts.notStarted++;
		}

		// Get active run and lock status
		const activeRun = await this.getActiveRun();

		// Get recent runs
		const recentRuns = await this.getRecentRuns(5);

		const totalProjects = progress.total_projects ?? 0;
		const migratedProjects = progress.migrated_projects ?? 0;
		const failedProjects = progress.failed_projects ?? 0;
		const totalTasks = progress.total_tasks ?? 0;
		const migratedTasks = progress.migrated_tasks ?? 0;

		return {
			projects: {
				total: totalProjects,
				migrated: migratedProjects,
				pending: totalProjects - migratedProjects,
				failed: failedProjects,
				percentComplete:
					totalProjects > 0
						? Math.round((migratedProjects / totalProjects) * 100 * 10) / 10
						: 0
			},
			tasks: {
				total: totalTasks,
				migrated: migratedTasks,
				pending: totalTasks - migratedTasks,
				percentComplete:
					totalTasks > 0 ? Math.round((migratedTasks / totalTasks) * 100 * 10) / 10 : 0
			},
			users: {
				total: progress.total_users ?? 0,
				withProjects: progress.users_with_projects ?? 0,
				fullyMigrated: userStatusCounts.fullyMigrated,
				partiallyMigrated: userStatusCounts.partiallyMigrated,
				notStarted: userStatusCounts.notStarted
			},
			errors: {
				total: progress.total_errors ?? 0,
				recoverable: progress.recoverable_errors ?? 0,
				dataErrors: progress.data_errors ?? 0,
				fatal: progress.fatal_errors ?? 0
			},
			activeRun,
			recentRuns,
			lastRefreshed: new Date().toISOString()
		};
	}

	/**
	 * Get active migration run (if any)
	 */
	private async getActiveRun(): Promise<GlobalProgress['activeRun']> {
		const lock = await this.fetchLockInfo();
		if (!lock || !lock.is_locked || !lock.run_id) {
			return null;
		}

		// Get run details
		const { data: runData } = await this.supabase
			.from('migration_log')
			.select('status, created_at, metadata')
			.eq('run_id', lock.run_id)
			.eq('entity_type', 'run')
			.single();

		if (!runData) {
			return null;
		}

		// Count processed projects for this run
		const { count } = await this.supabase
			.from('migration_log')
			.select('*', { count: 'exact', head: true })
			.eq('run_id', lock.run_id)
			.eq('entity_type', 'project')
			.in('status', ['completed', 'failed']);

		return {
			runId: lock.run_id,
			status: runData.status ?? 'in_progress',
			startedAt: runData.created_at ?? lock.locked_at,
			projectsProcessed: count ?? 0,
			lockedBy: lock.locked_by_email ?? lock.locked_by
		};
	}

	/**
	 * Get recent migration runs
	 */
	private async getRecentRuns(limit: number): Promise<GlobalProgress['recentRuns']> {
		const { data, error } = await this.supabase
			.from('migration_log')
			.select('run_id, status, created_at, updated_at, metadata')
			.eq('entity_type', 'run')
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error || !data) {
			return [];
		}

		const runs: GlobalProgress['recentRuns'] = [];

		for (const run of data) {
			// Get counts for this run
			const { data: counts } = await this.supabase
				.from('migration_log')
				.select('status')
				.eq('run_id', run.run_id)
				.eq('entity_type', 'project');

			const projectsProcessed = counts?.filter((c) => c.status === 'completed').length ?? 0;
			const projectsFailed = counts?.filter((c) => c.status === 'failed').length ?? 0;

			const metadata = run.metadata as Record<string, unknown> | null;
			const initiatedBy = (metadata?.initiatedBy as string) ?? '';

			// Get email for initiatedBy
			let initiatedByEmail = '';
			if (initiatedBy) {
				const { data: user } = await this.supabase
					.from('users')
					.select('email')
					.eq('id', initiatedBy)
					.single();
				initiatedByEmail = user?.email ?? '';
			}

			runs.push({
				runId: run.run_id,
				status: run.status ?? 'unknown',
				startedAt: run.created_at ?? '',
				completedAt:
					run.status === 'completed' || run.status === 'failed' ? run.updated_at : null,
				projectsProcessed,
				projectsFailed,
				initiatedBy,
				initiatedByEmail
			});
		}

		return runs;
	}

	/**
	 * Get lock status
	 */
	async getLockStatus(): Promise<LockStatus> {
		let lock: Awaited<ReturnType<MigrationStatsService['fetchLockInfo']>> = null;
		try {
			lock = await this.fetchLockInfo();
		} catch (err) {
			console.warn('[Migration] Lock status lookup failed, defaulting to unlocked', err);
			return {
				isLocked: false,
				runId: null,
				lockedBy: null,
				lockedByEmail: null,
				lockedAt: null,
				expiresAt: null
			};
		}

		if (!lock) {
			return {
				isLocked: false,
				runId: null,
				lockedBy: null,
				lockedByEmail: null,
				lockedAt: null,
				expiresAt: null
			};
		}

		return {
			isLocked: lock.is_locked ?? false,
			runId: lock.run_id,
			lockedBy: lock.locked_by,
			lockedByEmail: lock.locked_by_email,
			lockedAt: lock.locked_at,
			expiresAt: lock.expires_at
		};
	}

	/**
	 * Fetch lock info with fallback if the RPC is incompatible locally
	 */
	private async fetchLockInfo(): Promise<{
		is_locked: boolean;
		run_id: string | null;
		locked_by: string | null;
		locked_by_email: string | null;
		locked_at: string | null;
		expires_at: string | null;
	} | null> {
		// First try the RPC
		try {
			const { data, error } = await this.supabase.rpc('get_migration_platform_lock_status');
			if (error) {
				console.warn('[Migration] Lock status RPC error:', error.message);
			}
			if (!error && Array.isArray(data) && data.length > 0) {
				return data[0] as {
					is_locked: boolean;
					run_id: string | null;
					locked_by: string | null;
					locked_by_email: string | null;
					locked_at: string | null;
					expires_at: string | null;
				};
			}
		} catch (err) {
			console.warn(
				'[Migration] Lock status RPC unavailable, falling back to table query',
				err
			);
		}

		// Fallback: query the lock table directly
		const { data: lockTable } = await this.supabase
			.from('migration_platform_lock')
			.select('run_id, locked_by, locked_at, expires_at')
			.eq('id', 1)
			.maybeSingle();

		if (!lockTable) {
			return null;
		}

		let lockedByEmail: string | null = null;
		if (lockTable.locked_by) {
			const { data: user } = await this.supabase
				.from('users')
				.select('email')
				.eq('id', lockTable.locked_by)
				.single();
			lockedByEmail = user?.email ?? null;
		}

		const isLocked =
			Boolean(lockTable.run_id) &&
			Boolean(lockTable.expires_at) &&
			new Date(lockTable.expires_at as string).getTime() > Date.now();

		return {
			is_locked: isLocked,
			run_id: lockTable.run_id ?? null,
			locked_by: lockTable.locked_by ?? null,
			locked_by_email: lockedByEmail,
			locked_at: (lockTable.locked_at as string | null) ?? null,
			expires_at: (lockTable.expires_at as string | null) ?? null
		};
	}

	/**
	 * Acquire platform lock for a migration run
	 */
	async acquireLock(
		runId: string,
		userId: string,
		durationMinutes = 60
	): Promise<{
		acquired: boolean;
		existingLock?: LockStatus;
	}> {
		const { data, error } = await this.supabase.rpc('acquire_migration_platform_lock', {
			p_run_id: runId,
			p_locked_by: userId,
			p_duration_minutes: durationMinutes
		});

		if (error) {
			throw new Error(`Failed to acquire lock: ${error.message}`);
		}

		if (!data || !Array.isArray(data) || data.length === 0) {
			return { acquired: false };
		}

		const result = data[0];
		if (result.acquired) {
			return { acquired: true };
		}

		return {
			acquired: false,
			existingLock: {
				isLocked: true,
				runId: result.existing_run_id,
				lockedBy: result.existing_locked_by,
				lockedByEmail: null, // Would need additional query
				lockedAt: result.existing_locked_at,
				expiresAt: result.existing_expires_at
			}
		};
	}

	/**
	 * Release platform lock
	 */
	async releaseLock(runId: string): Promise<boolean> {
		const { data, error } = await this.supabase.rpc('release_migration_platform_lock', {
			p_run_id: runId
		});

		if (error) {
			throw new Error(`Failed to release lock: ${error.message}`);
		}

		return data === true;
	}

	/**
	 * Refresh the user migration stats materialized view
	 */
	async refreshStats(): Promise<RefreshStatsResult> {
		// Get current timestamp as "previous refresh" approximation
		const previousRefresh = new Date().toISOString();

		const { data, error } = await this.supabase.rpc('refresh_user_migration_stats');

		if (error) {
			throw new Error(`Failed to refresh stats: ${error.message}`);
		}

		if (!data || !Array.isArray(data) || data.length === 0) {
			return {
				refreshed: false,
				duration: 0,
				rowCount: 0,
				previousRefresh
			};
		}

		const result = data[0];
		return {
			refreshed: result.refreshed ?? false,
			duration: result.duration_ms ?? 0,
			rowCount: result.row_count ?? 0,
			previousRefresh
		};
	}

	/**
	 * Map sort column names to database column names
	 */
	private mapSortColumn(sortBy: string): string {
		const mapping: Record<string, string> = {
			email: 'email',
			totalProjects: 'total_projects',
			percentComplete: 'percent_complete',
			lastMigrationAt: 'last_migration_at'
		};
		return mapping[sortBy] ?? 'email';
	}
}
