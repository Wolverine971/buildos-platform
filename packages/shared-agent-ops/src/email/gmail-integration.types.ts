// packages/shared-agent-ops/src/email/gmail-integration.types.ts
// Gmail read payload shapes shared by the web routes/executors and the worker tools.
export type {
	GmailConnectionCapability,
	GmailConnectionStatus,
	GmailConnectionSummary,
	GmailConnectionsPayload
} from './gmail-account-read-port';

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
