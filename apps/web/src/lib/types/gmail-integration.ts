// apps/web/src/lib/types/gmail-integration.ts
// Preserve the web import path while the Gmail read payload shapes live in the
// shared package the worker also consumes.
export type {
	GmailConnectionCapability,
	GmailConnectionStatus,
	GmailConnectionSummary,
	GmailConnectionsPayload,
	GmailMessageDetail,
	GmailMessageSearchPayload,
	GmailMessageSummary,
	GmailReadAccountResult
} from '@buildos/shared-agent-ops/email/gmail-integration.types';
