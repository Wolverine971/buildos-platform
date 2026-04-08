// apps/web/src/lib/server/auth-user-profile.ts
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAuthenticatedSupabaseClient } from '$lib/supabase/authenticated';
import { getAuthUserCreatedAt } from '$lib/utils/auth-profile';

type TypedSupabaseClient = SupabaseClient<Database>;
type UserRow = Database['public']['Tables']['users']['Row'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type ErrorLogger = Pick<ErrorLoggerService, 'logError'>;
type ProfileSource = 'session_cookie' | 'session_token' | 'admin';

interface EnsureUserProfileOptions {
	authUser: User;
	client: TypedSupabaseClient;
	source: ProfileSource;
	errorLogger: ErrorLogger;
	endpoint: string;
	fetchOperationType: string;
	insertOperationType: string;
	metadata?: Record<string, unknown>;
	profileName?: string;
}

interface EnsureUserProfileWithSessionOptions {
	authUser: User;
	accessToken: string | null | undefined;
	sessionClient: TypedSupabaseClient;
	errorLogger: ErrorLogger;
	endpoint: string;
	fetchOperationType: string;
	insertOperationType: string;
	metadata?: Record<string, unknown>;
	profileName?: string;
}

export function buildUserProfilePayload(authUser: User, profileName?: string): UserInsert {
	const now = new Date().toISOString();

	return {
		id: authUser.id,
		email: authUser.email as string,
		name:
			profileName || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
		is_admin: false,
		created_at: getAuthUserCreatedAt(authUser),
		updated_at: now
	};
}

async function fetchUserProfile({
	authUser,
	client,
	source,
	errorLogger,
	endpoint,
	fetchOperationType,
	metadata
}: Omit<EnsureUserProfileOptions, 'insertOperationType' | 'profileName'>): Promise<UserRow | null> {
	const { data, error } = await client
		.from('users')
		.select('*')
		.eq('id', authUser.id)
		.maybeSingle();

	if (error && error.code !== 'PGRST116') {
		await errorLogger.logError(error, {
			endpoint,
			httpMethod: 'POST',
			operationType: fetchOperationType,
			metadata: {
				...metadata,
				source,
				userId: authUser.id
			}
		});
		return null;
	}

	return data ?? null;
}

async function insertUserProfile({
	authUser,
	client,
	source,
	errorLogger,
	endpoint,
	fetchOperationType,
	insertOperationType,
	metadata,
	profileName
}: EnsureUserProfileOptions): Promise<UserRow | null> {
	const { data, error } = await client
		.from('users')
		.insert(buildUserProfilePayload(authUser, profileName))
		.select()
		.single();

	if (!error) {
		return data;
	}

	if (error.code === '23505') {
		return fetchUserProfile({
			authUser,
			client,
			source,
			errorLogger,
			endpoint,
			fetchOperationType,
			metadata
		});
	}

	await errorLogger.logError(error, {
		endpoint,
		httpMethod: 'POST',
		operationType: insertOperationType,
		metadata: {
			...metadata,
			source,
			userId: authUser.id
		}
	});
	return null;
}

export async function ensureUserProfileWithClient(
	options: EnsureUserProfileOptions
): Promise<UserRow | null> {
	const existing = await fetchUserProfile(options);
	if (existing) {
		return existing;
	}

	return insertUserProfile(options);
}

export async function ensureUserProfileWithAuthenticatedSession({
	authUser,
	accessToken,
	sessionClient,
	errorLogger,
	endpoint,
	fetchOperationType,
	insertOperationType,
	metadata,
	profileName
}: EnsureUserProfileWithSessionOptions): Promise<UserRow | null> {
	if (accessToken) {
		const tokenClient = createAuthenticatedSupabaseClient(accessToken);
		const tokenUser = await ensureUserProfileWithClient({
			authUser,
			client: tokenClient,
			source: 'session_token',
			errorLogger,
			endpoint,
			fetchOperationType,
			insertOperationType,
			metadata,
			profileName
		});

		if (tokenUser) {
			return tokenUser;
		}
	}

	return ensureUserProfileWithClient({
		authUser,
		client: sessionClient,
		source: 'session_cookie',
		errorLogger,
		endpoint,
		fetchOperationType,
		insertOperationType,
		metadata,
		profileName
	});
}
