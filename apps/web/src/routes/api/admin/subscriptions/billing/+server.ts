// apps/web/src/routes/api/admin/subscriptions/billing/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	BILLING_OPS_DEFAULT_WINDOW_DAYS,
	BILLING_OPS_MAX_WINDOW_DAYS,
	fetchBillingOpsMetrics
} from '$lib/server/billing-ops-monitoring';

type BillingAction = 'manual_unfreeze' | 'set_billing_state';
type BillingTransitionSource = 'system' | 'admin' | 'user' | 'authenticated' | 'migration';

const BILLING_TRANSITION_SOURCES = new Set<BillingTransitionSource>([
	'system',
	'admin',
	'user',
	'authenticated',
	'migration'
]);

const DEFAULT_TIMELINE_LIMIT = 100;
const MAX_TIMELINE_LIMIT = 500;

function normalizeTargetState(targetTier: string): string {
	if (targetTier === 'power') return 'power_active';
	if (targetTier === 'pro') return 'pro_active';
	return 'explorer_active';
}

function parseOptionalDateAtUtcStart(value: string | null): string | null {
	if (!value) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
}

function parseOptionalDateAtUtcEndExclusive(value: string | null): string | null {
	if (!value) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) return null;
	parsed.setUTCDate(parsed.getUTCDate() + 1);
	return parsed.toISOString();
}

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession }, url }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const { data: adminCheck } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!adminCheck?.is_admin) {
		return ApiResponse.forbidden();
	}

	try {
		const userId = url.searchParams.get('userId');
		const sourceParam = url.searchParams.get('source');
		const source = sourceParam === 'all' ? null : sourceParam;
		const actorUserId = url.searchParams.get('actorUserId');
		const startDateParam = url.searchParams.get('startDate');
		const endDateParam = url.searchParams.get('endDate');
		const includeMetrics = url.searchParams.get('includeMetrics') === 'true';
		const metricsWindowDaysParam = Number.parseInt(
			url.searchParams.get('metricsWindowDays') || `${BILLING_OPS_DEFAULT_WINDOW_DAYS}`,
			10
		);
		const metricsWindowDays = Number.isFinite(metricsWindowDaysParam)
			? Math.min(Math.max(metricsWindowDaysParam, 1), BILLING_OPS_MAX_WINDOW_DAYS)
			: BILLING_OPS_DEFAULT_WINDOW_DAYS;

		const limit = Number.parseInt(
			url.searchParams.get('limit') || `${DEFAULT_TIMELINE_LIMIT}`,
			10
		);
		const boundedLimit = Number.isFinite(limit)
			? Math.min(Math.max(limit, 1), MAX_TIMELINE_LIMIT)
			: DEFAULT_TIMELINE_LIMIT;

		if (source && !BILLING_TRANSITION_SOURCES.has(source as BillingTransitionSource)) {
			return ApiResponse.badRequest('Invalid source filter');
		}

		const startDateIso = parseOptionalDateAtUtcStart(startDateParam);
		if (startDateParam && !startDateIso) {
			return ApiResponse.badRequest('Invalid startDate; expected YYYY-MM-DD');
		}

		const endDateExclusiveIso = parseOptionalDateAtUtcEndExclusive(endDateParam);
		if (endDateParam && !endDateExclusiveIso) {
			return ApiResponse.badRequest('Invalid endDate; expected YYYY-MM-DD');
		}
		if (startDateIso && endDateExclusiveIso && startDateIso >= endDateExclusiveIso) {
			return ApiResponse.badRequest('startDate must be on or before endDate');
		}

		let accountQuery = (supabase as any).from('billing_accounts').select('*');
		let timelineQuery = (supabase as any)
			.from('billing_state_transitions')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(boundedLimit);

		if (userId) {
			accountQuery = accountQuery.eq('user_id', userId).maybeSingle();
			timelineQuery = timelineQuery.eq('user_id', userId);
		} else {
			accountQuery = accountQuery.order('updated_at', { ascending: false }).limit(50);
		}

		if (source) {
			timelineQuery = timelineQuery.eq('change_source', source);
		}
		if (actorUserId && actorUserId !== 'all') {
			timelineQuery = timelineQuery.eq('changed_by_user_id', actorUserId);
		}
		if (startDateIso) {
			timelineQuery = timelineQuery.gte('created_at', startDateIso);
		}
		if (endDateExclusiveIso) {
			timelineQuery = timelineQuery.lt('created_at', endDateExclusiveIso);
		}

		const timelinePromise = timelineQuery;
		const accountPromise = accountQuery;
		const metricsPromise = includeMetrics
			? fetchBillingOpsMetrics(supabase, metricsWindowDays)
			: Promise.resolve(null);
		const trendsPromise = includeMetrics
			? (supabase as any)
					.from('billing_ops_snapshots')
					.select(
						'snapshot_date,window_days,frozen_active_count,manual_unfreeze_rate,auto_pro_to_power_escalation_rate,current_power_share,anomaly_count'
					)
					.eq('window_days', metricsWindowDays)
					.order('snapshot_date', { ascending: false })
					.limit(14)
			: Promise.resolve(null);

		const [
			{ data: accountData, error: accountError },
			{ data: timelineData, error: timelineError },
			opsMetrics,
			trendsResult
		] = await Promise.all([accountPromise, timelinePromise, metricsPromise, trendsPromise]);

		if (accountError) throw accountError;
		if (timelineError) throw timelineError;
		if ((trendsResult as any)?.error) throw (trendsResult as any).error;

		const transitions = (timelineData || []) as Array<Record<string, unknown>>;
		const userIdsToResolve = new Set<string>();
		for (const row of transitions) {
			const targetUserId = typeof row.user_id === 'string' ? row.user_id : null;
			const actorUserId =
				typeof row.changed_by_user_id === 'string' ? row.changed_by_user_id : null;
			if (targetUserId) userIdsToResolve.add(targetUserId);
			if (actorUserId) userIdsToResolve.add(actorUserId);
		}

		let usersById: Record<string, { id: string; email: string | null; name: string | null }> =
			{};
		if (userIdsToResolve.size > 0) {
			const { data: users, error: usersError } = await supabase
				.from('users')
				.select('id, email, name')
				.in('id', Array.from(userIdsToResolve));

			if (usersError) throw usersError;

			usersById = Object.fromEntries(
				(users || []).map((row: any) => [
					row.id,
					{ id: row.id, email: row.email ?? null, name: row.name ?? null }
				])
			);
		}

		const actorOptions = transitions
			.map((row) =>
				typeof row.changed_by_user_id === 'string'
					? (usersById[row.changed_by_user_id] ?? {
							id: row.changed_by_user_id,
							email: null,
							name: null
						})
					: null
			)
			.filter(
				(actor): actor is { id: string; email: string | null; name: string | null } =>
					!!actor
			)
			.filter(
				(actor, index, arr) =>
					arr.findIndex((candidate) => candidate.id === actor.id) === index
			)
			.sort((a, b) => {
				const aLabel = (a.name || a.email || a.id).toLowerCase();
				const bLabel = (b.name || b.email || b.id).toLowerCase();
				return aLabel.localeCompare(bLabel);
			});

		return ApiResponse.success({
			account: userId ? (accountData ?? null) : null,
			accounts: userId ? [] : (accountData ?? []),
			timeline: transitions,
			usersById,
			actorOptions,
			opsMetrics,
			opsTrends: ((trendsResult as any)?.data ?? []).reverse()
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load billing audit data');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const { data: adminCheck } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!adminCheck?.is_admin) {
		return ApiResponse.forbidden();
	}

	try {
		const body = (await request.json()) as {
			action?: BillingAction;
			userId?: string;
			targetTier?: 'explorer' | 'pro' | 'power';
			targetState?:
				| 'explorer_active'
				| 'upgrade_required_frozen'
				| 'pro_active'
				| 'power_active';
			note?: string;
		};

		const action = body.action;
		const userId = body.userId;
		if (!action || !userId) {
			return ApiResponse.badRequest('action and userId are required');
		}

		if (action !== 'manual_unfreeze' && action !== 'set_billing_state') {
			return ApiResponse.badRequest('Unsupported billing action');
		}

		const now = new Date().toISOString();
		const targetTier = body.targetTier ?? (action === 'manual_unfreeze' ? 'pro' : 'explorer');
		const targetState =
			body.targetState ??
			(action === 'manual_unfreeze' ? normalizeTargetState(targetTier) : 'explorer_active');

		const isFrozenState = targetState === 'upgrade_required_frozen';

		const { data: updatedAccount, error: updateError } = await (supabase as any)
			.from('billing_accounts')
			.upsert(
				{
					user_id: userId,
					billing_state: targetState,
					billing_tier: targetTier,
					frozen_at: isFrozenState ? now : null,
					frozen_reason: isFrozenState ? body.note || 'admin_state_update' : null,
					updated_at: now
				},
				{ onConflict: 'user_id' }
			)
			.select('*')
			.single();

		if (updateError) throw updateError;

		await supabase.from('user_activity_logs').insert({
			user_id: userId,
			activity_type:
				action === 'manual_unfreeze'
					? 'admin_manual_unfreeze'
					: 'admin_billing_state_update',
			activity_data: {
				admin_user_id: user.id,
				target_state: targetState,
				target_tier: targetTier,
				note: body.note || null
			}
		});

		return ApiResponse.success(
			{ account: updatedAccount },
			action === 'manual_unfreeze'
				? 'Billing account manually unfrozen'
				: 'Billing state updated'
		);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to update billing state');
	}
};
