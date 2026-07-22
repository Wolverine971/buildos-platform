// apps/web/src/lib/server/account-deletion.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { StripeService } from '$lib/services/stripe-service';
import { GmailOAuthError, GmailReadOAuthService } from '$lib/server/gmail-read-oauth.service';

type DeletionRequestRow = {
	id: string;
	user_id: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	requested_at: string;
	scheduled_for: string;
	attempt_count: number;
	billing_cancellation_status: 'pending' | 'completed' | 'not_applicable';
	billing_subscription_ids: string[];
};

type StorageObjectRef = {
	bucket_id: string;
	object_name: string;
};

type GmailDeletionCleanupResult = {
	connectionsFound: number;
	connectionsDeleted: number;
	remoteRevocationsSucceeded: number;
	remoteRevocationsUnconfirmed: number;
};

const EMPTY_GMAIL_CLEANUP: GmailDeletionCleanupResult = {
	connectionsFound: 0,
	connectionsDeleted: 0,
	remoteRevocationsSucceeded: 0,
	remoteRevocationsUnconfirmed: 0
};

const ACTIVE_SUBSCRIPTION_STATUSES = [
	'active',
	'trialing',
	'past_due',
	'unpaid',
	'incomplete',
	'paused'
];

function chunk<T>(values: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

function isMissingStripeResource(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'resource_missing'
	);
}

function isMissingAuthUser(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const value = error as { status?: number; message?: string };
	return value.status === 404 || value.message?.toLowerCase().includes('user not found') === true;
}

async function removeGmailConnectionsForAccountDeletion(
	userId: string
): Promise<GmailDeletionCleanupResult> {
	const admin = createAdminSupabaseClient();
	try {
		return await new GmailReadOAuthService(
			admin as any
		).disconnectAllConnectionsForAccountDeletion(userId);
	} catch (error) {
		// Account deletion must proceed even if Google or the integration tables are unavailable.
		// The database purge remains the final local credential deletion boundary.
		console.error(
			'Account deletion Gmail cleanup could not be completed:',
			error instanceof GmailOAuthError ? error.code : 'unknown_error'
		);
		return EMPTY_GMAIL_CLEANUP;
	}
}

export async function scheduleAccountDeletion(userId: string): Promise<{
	requestId: string;
	requestedAt: string;
	scheduledFor: string;
}> {
	const admin = createAdminSupabaseClient();
	const { data, error } = await (admin as any).rpc('request_account_deletion', {
		p_user_id: userId
	});
	if (error) throw error;

	const row = (Array.isArray(data) ? data[0] : data) as
		| { request_id?: string; requested_at?: string; scheduled_for?: string }
		| undefined;
	if (!row?.request_id || !row.requested_at || !row.scheduled_for) {
		throw new Error('Account deletion request was not created');
	}

	// Revoke and remove integrations immediately when access to BuildOS is disabled, rather than
	// retaining usable Gmail credentials during the 30-day deletion window.
	await removeGmailConnectionsForAccountDeletion(userId);

	return {
		requestId: row.request_id,
		requestedAt: row.requested_at,
		scheduledFor: row.scheduled_for
	};
}

export async function cancelDeletionSubscriptions(
	request: Pick<DeletionRequestRow, 'id' | 'user_id' | 'billing_subscription_ids'>,
	options: { immediately: boolean }
): Promise<{ completed: boolean; subscriptionCount: number }> {
	const admin = createAdminSupabaseClient();
	let subscriptionIds = Array.from(new Set(request.billing_subscription_ids ?? []));

	if (subscriptionIds.length === 0) {
		const { data, error } = await admin
			.from('customer_subscriptions')
			.select('stripe_subscription_id, status')
			.eq('user_id', request.user_id)
			.in('status', ACTIVE_SUBSCRIPTION_STATUSES);
		if (error) throw error;

		subscriptionIds = Array.from(
			new Set(
				(data ?? [])
					.map((row) => row.stripe_subscription_id)
					.filter((id): id is string => typeof id === 'string' && id.length > 0)
			)
		);

		await (admin as any)
			.from('account_deletion_requests')
			.update({
				billing_subscription_ids: subscriptionIds,
				updated_at: new Date().toISOString()
			})
			.eq('id', request.id);
	}

	if (subscriptionIds.length === 0 || !StripeService.isEnabled()) {
		const status = subscriptionIds.length === 0 ? 'not_applicable' : 'pending';
		await (admin as any)
			.from('account_deletion_requests')
			.update({
				billing_cancellation_status: status,
				billing_cancellation_error:
					status === 'pending' ? 'Stripe is not configured in this runtime' : null,
				updated_at: new Date().toISOString()
			})
			.eq('id', request.id);
		return { completed: status !== 'pending', subscriptionCount: subscriptionIds.length };
	}

	const stripe = new StripeService(admin as any);
	const failures: string[] = [];
	for (const subscriptionId of subscriptionIds) {
		try {
			await stripe.cancelSubscription(subscriptionId, options.immediately);
		} catch (error) {
			if (!isMissingStripeResource(error)) {
				failures.push(error instanceof Error ? error.message : String(error));
			}
		}
	}

	await (admin as any)
		.from('account_deletion_requests')
		.update({
			billing_cancellation_status: failures.length === 0 ? 'completed' : 'pending',
			billing_cancellation_error:
				failures.length === 0 ? null : failures.join('; ').slice(0, 4000),
			updated_at: new Date().toISOString()
		})
		.eq('id', request.id);

	return { completed: failures.length === 0, subscriptionCount: subscriptionIds.length };
}

async function removeAccountStorage(userId: string): Promise<number> {
	const admin = createAdminSupabaseClient();
	const { data, error } = await (admin as any).rpc('list_account_deletion_storage_objects', {
		p_user_id: userId
	});
	if (error) throw error;

	const byBucket = new Map<string, Set<string>>();
	for (const row of (data ?? []) as StorageObjectRef[]) {
		if (!row.bucket_id || !row.object_name) continue;
		const paths = byBucket.get(row.bucket_id) ?? new Set<string>();
		paths.add(row.object_name);
		byBucket.set(row.bucket_id, paths);
	}

	let removed = 0;
	for (const [bucket, paths] of byBucket) {
		for (const pathBatch of chunk([...paths], 1000)) {
			const { error: removeError } = await admin.storage.from(bucket).remove(pathBatch);
			if (removeError) throw removeError;
			removed += pathBatch.length;
		}
	}

	return removed;
}

async function purgeAccount(request: DeletionRequestRow): Promise<{
	storageObjects: number;
	gmailCleanup: GmailDeletionCleanupResult;
}> {
	const admin = createAdminSupabaseClient();
	await (admin as any)
		.from('users')
		.update({ deletion_status: 'processing', updated_at: new Date().toISOString() })
		.eq('id', request.user_id);

	// Subscription cancellation is retried independently and must never postpone
	// the promised active-system data purge beyond the scheduled date.
	try {
		await cancelDeletionSubscriptions(request, { immediately: true });
	} catch (error) {
		console.error('Account deletion billing cancellation retry failed:', error);
	}

	// Defense in depth for older requests or an integration outage at scheduling time.
	const gmailCleanup = await removeGmailConnectionsForAccountDeletion(request.user_id);

	const storageObjects = await removeAccountStorage(request.user_id);
	const { error: databaseError } = await (admin as any).rpc(
		'finalize_account_deletion_database',
		{ p_user_id: request.user_id }
	);
	if (databaseError) throw databaseError;

	const { error: authError } = await admin.auth.admin.deleteUser(request.user_id);
	if (authError && !isMissingAuthUser(authError)) throw authError;

	const completedAt = new Date().toISOString();
	const { error: completionError } = await (admin as any)
		.from('account_deletion_requests')
		.update({
			status: 'completed',
			completed_at: completedAt,
			lease_expires_at: null,
			next_attempt_at: null,
			last_error: null,
			updated_at: completedAt
		})
		.eq('id', request.id);
	if (completionError) throw completionError;

	return { storageObjects, gmailCleanup };
}

export async function retryPendingDeletionSubscriptionCancellations(limit = 25): Promise<{
	processed: number;
	completed: number;
}> {
	const admin = createAdminSupabaseClient();
	const { data, error } = await (admin as any)
		.from('account_deletion_requests')
		.select('id, user_id, billing_subscription_ids')
		.eq('billing_cancellation_status', 'pending')
		.order('requested_at', { ascending: true })
		.limit(limit);
	if (error) throw error;

	let completed = 0;
	for (const request of (data ?? []) as DeletionRequestRow[]) {
		const result = await cancelDeletionSubscriptions(request, { immediately: false });
		if (result.completed) completed += 1;
	}

	return { processed: data?.length ?? 0, completed };
}

export async function processDueAccountDeletions(limit = 5): Promise<{
	claimed: number;
	completed: number;
	failed: number;
	storageObjectsRemoved: number;
	gmailConnectionsDeleted: number;
	gmailRemoteRevocationsSucceeded: number;
	gmailRemoteRevocationsUnconfirmed: number;
}> {
	const admin = createAdminSupabaseClient();
	const { data, error } = await (admin as any).rpc('claim_due_account_deletions', {
		p_limit: limit,
		p_lease_minutes: 15
	});
	if (error) throw error;

	const requests = (data ?? []) as DeletionRequestRow[];
	let completed = 0;
	let failed = 0;
	let storageObjectsRemoved = 0;
	let gmailConnectionsDeleted = 0;
	let gmailRemoteRevocationsSucceeded = 0;
	let gmailRemoteRevocationsUnconfirmed = 0;

	for (const request of requests) {
		try {
			const result = await purgeAccount(request);
			completed += 1;
			storageObjectsRemoved += result.storageObjects;
			gmailConnectionsDeleted += result.gmailCleanup.connectionsDeleted;
			gmailRemoteRevocationsSucceeded += result.gmailCleanup.remoteRevocationsSucceeded;
			gmailRemoteRevocationsUnconfirmed += result.gmailCleanup.remoteRevocationsUnconfirmed;
		} catch (requestError) {
			failed += 1;
			const message =
				requestError instanceof Error ? requestError.message : String(requestError);
			const nextAttemptAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
			await (admin as any)
				.from('account_deletion_requests')
				.update({
					status: 'failed',
					lease_expires_at: null,
					next_attempt_at: nextAttemptAt,
					last_error: message.slice(0, 4000),
					updated_at: new Date().toISOString()
				})
				.eq('id', request.id);
			console.error(`Account deletion ${request.id} failed:`, requestError);
		}
	}

	return {
		claimed: requests.length,
		completed,
		failed,
		storageObjectsRemoved,
		gmailConnectionsDeleted,
		gmailRemoteRevocationsSucceeded,
		gmailRemoteRevocationsUnconfirmed
	};
}
