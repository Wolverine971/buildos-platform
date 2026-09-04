// apps/web/src/lib/server/gmail-database.types.ts
// Preserve the web import path while the Gmail schema narrowings live in the
// shared package the worker also consumes.
export type {
	ConsumedEmailOauthState,
	EmailAccessAuditEventRow,
	EmailCapabilityGrantRow,
	EmailConnectionCredentialRow,
	EmailOauthStateRow,
	GmailAuditOutcome,
	GmailCapability,
	GmailCapabilityStatus,
	GmailGrantKind,
	GmailOauthClientKind,
	GmailReadDatabase,
	GmailSchemaClient,
	Json,
	UserEmailConnectionRow
} from '@buildos/shared-agent-ops/email/gmail-database.types';
