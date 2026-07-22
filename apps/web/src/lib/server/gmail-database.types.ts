// apps/web/src/lib/server/gmail-database.types.ts
/**
 * Hand-authored schema types for the Gmail read tables and RPCs created by
 * `supabase/migrations/20260722000000_gmail_read_connections.sql`.
 *
 * The generated `Database` type in `@buildos/shared-types` does not include these tables yet:
 * regeneration requires an authenticated Supabase CLI (`supabase login` or
 * `SUPABASE_ACCESS_TOKEN`). Until `pnpm gen:all` picks the tables up, this module is the single
 * typing boundary: the Gmail server modules narrow the canonical admin client to
 * `GmailSchemaClient` in their constructors and type every query against these shapes.
 *
 * When the generated types include these tables, replace the table shapes with re-exports (or
 * `satisfies` checks) against the generated definitions. The status/kind unions are deliberate
 * domain narrowings of the migration's CHECK constraints and should survive that swap.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	GmailConnectionCapability,
	GmailConnectionStatus
} from '$lib/types/gmail-integration';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type GmailGrantKind = 'read' | 'send' | 'compose' | 'modify';
export type GmailOauthClientKind = 'gmail_read' | 'gmail_actions';
export type GmailCapability = GmailConnectionCapability['capability'];
export type GmailCapabilityStatus = GmailConnectionCapability['status'];
export type GmailAuditOutcome = 'success' | 'failure' | 'blocked';

export type UserEmailConnectionRow = {
	account_label: string;
	connected_at: string;
	created_at: string;
	deleted_at: string | null;
	display_name: string | null;
	email_address: string;
	id: string;
	last_used_at: string | null;
	last_verified_at: string | null;
	provider: string;
	provider_account_id: string;
	read_enabled: boolean;
	status: GmailConnectionStatus;
	updated_at: string;
	user_id: string;
};

type UserEmailConnectionInsert = {
	account_label: string;
	connected_at?: string;
	created_at?: string;
	deleted_at?: string | null;
	display_name?: string | null;
	email_address: string;
	id?: string;
	last_used_at?: string | null;
	last_verified_at?: string | null;
	provider?: string;
	provider_account_id: string;
	read_enabled?: boolean;
	status?: GmailConnectionStatus;
	updated_at?: string;
	user_id: string;
};

type UserEmailConnectionUpdate = Partial<UserEmailConnectionInsert>;

export type EmailConnectionCredentialRow = {
	access_token_ciphertext: string;
	access_token_expires_at: string | null;
	connection_id: string;
	created_at: string;
	grant_kind: GmailGrantKind;
	granted_scopes: string[];
	id: string;
	key_version: number;
	last_refreshed_at: string | null;
	oauth_client_kind: GmailOauthClientKind;
	refresh_token_ciphertext: string;
	revoked_at: string | null;
	token_type: string;
	updated_at: string;
};

type EmailConnectionCredentialInsert = {
	access_token_ciphertext: string;
	access_token_expires_at?: string | null;
	connection_id: string;
	created_at?: string;
	grant_kind: GmailGrantKind;
	granted_scopes?: string[];
	id?: string;
	key_version?: number;
	last_refreshed_at?: string | null;
	oauth_client_kind: GmailOauthClientKind;
	refresh_token_ciphertext: string;
	revoked_at?: string | null;
	token_type?: string;
	updated_at?: string;
};

type EmailConnectionCredentialUpdate = Partial<EmailConnectionCredentialInsert>;

export type EmailCapabilityGrantRow = {
	capability: GmailCapability;
	connection_id: string;
	consent_policy_version: string;
	created_at: string;
	disabled_at: string | null;
	enabled_at: string | null;
	enabled_by_user_id: string | null;
	granted_scopes: string[];
	id: string;
	status: GmailCapabilityStatus;
	updated_at: string;
};

type EmailCapabilityGrantInsert = {
	capability: GmailCapability;
	connection_id: string;
	consent_policy_version: string;
	created_at?: string;
	disabled_at?: string | null;
	enabled_at?: string | null;
	enabled_by_user_id?: string | null;
	granted_scopes?: string[];
	id?: string;
	status?: GmailCapabilityStatus;
	updated_at?: string;
};

type EmailCapabilityGrantUpdate = Partial<EmailCapabilityGrantInsert>;

export type EmailOauthStateRow = {
	code_verifier: string;
	connection_id: string | null;
	consumed_at: string | null;
	created_at: string;
	expires_at: string;
	id: string;
	nonce: string;
	oauth_client_kind: 'gmail_read';
	redirect_path: string;
	state_hash: string;
	user_id: string;
};

type EmailOauthStateInsert = {
	code_verifier: string;
	connection_id?: string | null;
	consumed_at?: string | null;
	created_at?: string;
	expires_at?: string;
	id?: string;
	nonce: string;
	oauth_client_kind: 'gmail_read';
	redirect_path?: string;
	state_hash: string;
	user_id: string;
};

type EmailOauthStateUpdate = Partial<EmailOauthStateInsert>;

export type EmailAccessAuditEventRow = {
	connection_id: string | null;
	created_at: string;
	id: string;
	metadata: Json;
	operation: string;
	outcome: GmailAuditOutcome;
	reason_code: string | null;
	user_id: string;
};

type EmailAccessAuditEventInsert = {
	connection_id?: string | null;
	created_at?: string;
	id?: string;
	metadata?: Json;
	operation: string;
	outcome: GmailAuditOutcome;
	reason_code?: string | null;
	user_id: string;
};

type EmailAccessAuditEventUpdate = Partial<EmailAccessAuditEventInsert>;

/** Row shape returned by the `consume_email_oauth_state` RPC. */
export type ConsumedEmailOauthState = {
	code_verifier: string;
	connection_id: string | null;
	nonce: string;
	redirect_path: string;
	state_id: string;
};

export type GmailReadDatabase = {
	__InternalSupabase: {
		PostgrestVersion: '12.2.3 (519615d)';
	};
	public: {
		Tables: {
			user_email_connections: {
				Row: UserEmailConnectionRow;
				Insert: UserEmailConnectionInsert;
				Update: UserEmailConnectionUpdate;
				Relationships: [];
			};
			email_connection_credentials: {
				Row: EmailConnectionCredentialRow;
				Insert: EmailConnectionCredentialInsert;
				Update: EmailConnectionCredentialUpdate;
				Relationships: [];
			};
			email_capability_grants: {
				Row: EmailCapabilityGrantRow;
				Insert: EmailCapabilityGrantInsert;
				Update: EmailCapabilityGrantUpdate;
				Relationships: [];
			};
			email_oauth_states: {
				Row: EmailOauthStateRow;
				Insert: EmailOauthStateInsert;
				Update: EmailOauthStateUpdate;
				Relationships: [];
			};
			email_access_audit_events: {
				Row: EmailAccessAuditEventRow;
				Insert: EmailAccessAuditEventInsert;
				Update: EmailAccessAuditEventUpdate;
				Relationships: [];
			};
		};
		Views: { [_ in never]: never };
		Functions: {
			consume_email_oauth_state: {
				Args: {
					p_oauth_client_kind: string;
					p_state_hash: string;
					p_user_id: string;
				};
				Returns: ConsumedEmailOauthState[];
			};
			upsert_gmail_read_connection: {
				Args: {
					p_access_token_ciphertext: string;
					p_access_token_expires_at: string | null;
					p_consent_policy_version: string;
					p_default_account_label: string | null;
					p_display_name: string | null;
					p_email_address: string;
					p_expected_connection_id: string | null;
					p_granted_scopes: string[];
					p_key_version: number;
					p_provider_account_id: string;
					p_refresh_token_ciphertext: string;
					p_token_type: string | null;
					p_user_id: string;
				};
				Returns: UserEmailConnectionRow[];
			};
			rotate_gmail_read_credentials: {
				Args: {
					p_access_token_ciphertext: string;
					p_access_token_expires_at: string | null;
					p_connection_id: string;
					p_granted_scopes: string[];
					p_key_version: number;
					p_refresh_token_ciphertext: string;
					p_token_type: string | null;
					p_user_id: string;
				};
				Returns: UserEmailConnectionRow[];
			};
			mark_gmail_read_connection_reconnect_required: {
				Args: {
					p_connection_id: string;
					p_user_id: string;
				};
				Returns: undefined;
			};
		};
		Enums: { [_ in never]: never };
		CompositeTypes: { [_ in never]: never };
	};
};

export type GmailSchemaClient = SupabaseClient<GmailReadDatabase>;
