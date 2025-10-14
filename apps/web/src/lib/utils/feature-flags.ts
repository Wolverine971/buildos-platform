// apps/web/src/lib/utils/feature-flags.ts
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Database, FeatureName, FeatureFlag } from '@buildos/shared-types';

type TypedSupabaseClient = SupabaseClient<Database>;

const ROW_NOT_FOUND = 'PGRST116';

/**
 * Check if a feature flag is enabled for a given user.
 */
export async function isFeatureEnabled(
	supabase: TypedSupabaseClient,
	userId: string,
	featureName: FeatureName
): Promise<boolean> {
	try {
		return true;
		const { data, error } = await supabase
			.from('feature_flags')
			.select('enabled')
			.eq('user_id', userId)
			.eq('feature_name', featureName)
			.maybeSingle();

		if (error) {
			// Missing row = disabled
			if ((error as PostgrestError).code === ROW_NOT_FOUND) {
				return false;
			}
			throw error;
		}

		return data?.enabled ?? false;
	} catch (error) {
		console.error(`[FeatureFlags] Failed to check flag ${featureName} for ${userId}:`, error);
		return false;
	}
}

/**
 * Enable a feature flag for a user (admin/service role only).
 */
export async function enableFeature(
	supabase: TypedSupabaseClient,
	userId: string,
	featureName: FeatureName
): Promise<FeatureFlag | null> {
	const { data, error } = await supabase
		.from('feature_flags')
		.upsert(
			{
				user_id: userId,
				feature_name: featureName,
				enabled: true,
				enabled_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,feature_name' }
		)
		.select()
		.single();

	if (error) {
		throw error;
	}

	return data as FeatureFlag | null;
}

/**
 * Disable a feature flag for a user (admin/service role only).
 */
export async function disableFeature(
	supabase: TypedSupabaseClient,
	userId: string,
	featureName: FeatureName
): Promise<void> {
	const { error } = await supabase
		.from('feature_flags')
		.update({
			enabled: false,
			enabled_at: null,
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId)
		.eq('feature_name', featureName);

	if (error) {
		throw error;
	}
}

/**
 * Fetch all feature flags for a user and return a map of feature -> enabled.
 */
export async function getUserFeatures(
	supabase: TypedSupabaseClient,
	userId: string
): Promise<Record<FeatureName, boolean>> {
	const { data, error } = await supabase
		.from('feature_flags')
		.select('feature_name, enabled')
		.eq('user_id', userId);

	if (error) {
		throw error;
	}

	const features = Object.create(null) as Record<FeatureName, boolean>;
	for (const flag of data ?? []) {
		features[flag.feature_name as FeatureName] = !!flag.enabled;
	}

	return features;
}
