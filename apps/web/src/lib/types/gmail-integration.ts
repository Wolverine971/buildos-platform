// apps/web/src/lib/types/gmail-integration.ts
export type {
	GmailConnectionCapability,
	GmailConnectionStatus,
	GmailConnectionSummary,
	GmailConnectionsPayload
} from '@buildos/shared-agent-ops/email/gmail-account-read-port';

export type GmailReadAccountResult = {
	connectionId: string;
	accountLabel: string;
	emailAddress: string;
	status: 'success' | 'reconnect_required' | 'unavailable';
	messageCount: number;
	hasMore: boolean;
	nextCursor: string | null;
};

export type GmailMessageSummary = {
	connectionId: string;
	accountLabel: string;
	emailAddress: string;
	messageId: string;
	threadId: string;
	subject: string;
	from: string;
	internalDate: string;
	snippet: string;
};

export type GmailMessageDetail = GmailMessageSummary & {
	to: string;
	cc: string | null;
	bodyText: string;
	bodyTruncated: boolean;
	hasUnsupportedAttachments: boolean;
	fetchedAt: string;
	readOnly: true;
};

export type GmailMessageSearchPayload = {
	accounts: GmailReadAccountResult[];
	messages: GmailMessageSummary[];
	fetchedAt: string;
	readOnly: true;
};
