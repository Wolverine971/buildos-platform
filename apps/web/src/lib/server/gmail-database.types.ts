// apps/web/src/lib/server/gmail-database.types.ts
/**
 * Gmail-specific domain narrowings over the canonical generated Supabase types.
 *
 * The database tables and RPCs come from `@buildos/shared-types`. This module keeps
 * CHECK-constrained string fields narrow and compensates for nullable Postgres RPC
 * arguments/returns that the Supabase generator cannot infer from function bodies.
 * It must not duplicate table columns or become an independent schema mirror.
 */

import type { Database, Json } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	GmailConnectionCapability,
	GmailConnectionStatus
} from '$lib/types/gmail-integration';

export type { Json } from '@buildos/shared-types';

export type GmailGrantKind = 'read' | 'send' | 'compose' | 'modify';
export type GmailOauthClientKind = 'gmail_read' | 'gmail_actions';
export type GmailCapability = GmailConnectionCapability['capability'];
export type GmailCapabilityStatus = GmailConnectionCapability['status'];
export type GmailAuditOutcome = 'success' | 'failure' | 'blocked';

type PublicSchema = Database['public'];
type Table<Name extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][Name];
type Function<Name extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][Name];
type FunctionArgs<Name extends keyof PublicSchema['Functions']> = Function<Name>['Args'];
type NullableArgs<Args, Keys extends keyof Args> = Omit<Args, Keys> & {
	[Key in Keys]: Args[Key] | null;
};

export type UserEmailConnectionRow = Omit<
	Table<'user_email_connections'>['Row'],
	'status'
> & {
	status: GmailConnectionStatus;
};

export type EmailConnectionCredentialRow = Omit<
	Table<'email_connection_credentials'>['Row'],
	'grant_kind' | 'oauth_client_kind'
> & {
	grant_kind: GmailGrantKind;
	oauth_client_kind: GmailOauthClientKind;
};

export type EmailCapabilityGrantRow = Omit<
	Table<'email_capability_grants'>['Row'],
	'capability' | 'status'
> & {
	capability: GmailCapability;
	status: GmailCapabilityStatus;
};

export type EmailOauthStateRow = Omit<
	Table<'email_oauth_states'>['Row'],
	'oauth_client_kind'
> & {
	oauth_client_kind: 'gmail_read';
};

export type EmailAccessAuditEventRow = Omit<
	Table<'email_access_audit_events'>['Row'],
	'outcome'
> & {
	metadata: Json;
	outcome: GmailAuditOutcome;
};

type GeneratedConsumedEmailOauthState =
	Function<'consume_email_oauth_state'>['Returns'][number];

/** Row shape returned by the `consume_email_oauth_state` RPC. */
export type ConsumedEmailOauthState = Omit<
	GeneratedConsumedEmailOauthState,
	'connection_id'
> & {
	connection_id: string | null;
};

type UpsertGmailReadConnectionArgs = NullableArgs<
	FunctionArgs<'upsert_gmail_read_connection'>,
	| 'p_access_token_expires_at'
	| 'p_default_account_label'
	| 'p_display_name'
	| 'p_expected_connection_id'
	| 'p_token_type'
>;

type RotateGmailReadCredentialsArgs = NullableArgs<
	FunctionArgs<'rotate_gmail_read_credentials'>,
	'p_access_token_expires_at' | 'p_token_type'
>;

export type GmailReadDatabase = {
	__InternalSupabase: Database['__InternalSupabase'];
	public: {
		Tables: {
			user_email_connections: Omit<Table<'user_email_connections'>, 'Row'> & {
				Row: UserEmailConnectionRow;
			};
			email_connection_credentials: Omit<
				Table<'email_connection_credentials'>,
				'Row'
			> & {
				Row: EmailConnectionCredentialRow;
			};
			email_capability_grants: Omit<Table<'email_capability_grants'>, 'Row'> & {
				Row: EmailCapabilityGrantRow;
			};
			email_oauth_states: Omit<Table<'email_oauth_states'>, 'Row'> & {
				Row: EmailOauthStateRow;
			};
			email_access_audit_events: Omit<Table<'email_access_audit_events'>, 'Row'> & {
				Row: EmailAccessAuditEventRow;
			};
		};
		Views: PublicSchema['Views'];
		Functions: {
			consume_email_oauth_state: Omit<
				Function<'consume_email_oauth_state'>,
				'Returns'
			> & {
				Returns: ConsumedEmailOauthState[];
			};
			upsert_gmail_read_connection: Omit<
				Function<'upsert_gmail_read_connection'>,
				'Args' | 'Returns'
			> & {
				Args: UpsertGmailReadConnectionArgs;
				Returns: UserEmailConnectionRow[];
			};
			rotate_gmail_read_credentials: Omit<
				Function<'rotate_gmail_read_credentials'>,
				'Args' | 'Returns'
			> & {
				Args: RotateGmailReadCredentialsArgs;
				Returns: UserEmailConnectionRow[];
			};
			mark_gmail_read_connection_reconnect_required: Function<'mark_gmail_read_connection_reconnect_required'>;
		};
		Enums: PublicSchema['Enums'];
		CompositeTypes: PublicSchema['CompositeTypes'];
	};
};

export type GmailSchemaClient = SupabaseClient<GmailReadDatabase>;
