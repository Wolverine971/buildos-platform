// apps/web/src/lib/types/gmail-integration.ts
export type GmailConnectionStatus = 'active' | 'reconnect_required' | 'disabled' | 'error';

export type GmailConnectionCapability = {
	capability: 'read' | 'send' | 'save_gmail_draft' | 'modify_message';
	status: 'enabled' | 'disabled' | 'reconnect_required';
};

export type GmailConnectionSummary = {
	id: string;
	emailAddress: string;
	displayName: string | null;
	accountLabel: string;
	status: GmailConnectionStatus;
	readEnabled: boolean;
	connectedAt: string;
	lastVerifiedAt: string | null;
	lastUsedAt: string | null;
	capabilities: GmailConnectionCapability[];
};

export type GmailConnectionsPayload = {
	available: boolean;
	maxConnections: number;
	connections: GmailConnectionSummary[];
	readOnly: true;
};

export type GmailReadAccountResult = {
	connectionId: string;
	accountLabel: string;
	emailAddress: string;
	status: 'success' | 'reconnect_required' | 'unavailable';
	messageCount: number;
	hasMore: boolean;
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
