// apps/web/src/lib/server/gmail-read-gateway.ts
import sanitizeHtml from 'sanitize-html';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GmailOAuthError, GmailReadOAuthService } from './gmail-read-oauth.service';
import type {
	GmailMessageDetail,
	GmailMessageSearchPayload,
	GmailMessageSummary,
	GmailReadAccountResult
} from '$lib/types/gmail-integration';

const GMAIL_API_ORIGIN = 'https://gmail.googleapis.com';
const MAX_ACCOUNTS_PER_REQUEST = 5;
const MAX_MESSAGES_PER_REQUEST = 20;
const MAX_MESSAGES_PER_ACCOUNT = 10;
const MAX_QUERY_LENGTH = 300;
const MAX_PROVIDER_LIST_BYTES = 256 * 1024;
const MAX_PROVIDER_MESSAGE_BYTES = 2 * 1024 * 1024;
const MAX_DECODED_PART_BYTES = 256 * 1024;
const MAX_DECODED_BODY_BYTES = 512 * 1024;
const MAX_BODY_CHARACTERS = 100_000;
const MAX_MIME_DEPTH = 12;
const MAX_MIME_PARTS = 100;
const PROVIDER_TIMEOUT_MS = 10_000;

type ProviderFetch = typeof fetch;

type GmailProviderDiagnosticCode =
	| 'fetch_rejected'
	| 'fetch_timeout'
	| 'response_body_unreadable'
	| 'response_json_invalid';

type GmailReadGatewayOptions = {
	oauthService?: Pick<GmailReadOAuthService, 'getAuthorizedReadAccessToken'>;
	providerFetch?: ProviderFetch;
	now?: () => Date;
};

type ConnectionRow = {
	id: string;
	email_address: string;
	account_label: string;
	status: 'active' | 'reconnect_required' | 'disabled' | 'error';
	read_enabled: boolean;
};

type GmailHeader = { name?: unknown; value?: unknown };
type GmailMessagePart = {
	mimeType?: unknown;
	filename?: unknown;
	headers?: GmailHeader[];
	body?: { size?: unknown; data?: unknown; attachmentId?: unknown };
	parts?: GmailMessagePart[];
};

type GmailProviderMessage = {
	id?: unknown;
	threadId?: unknown;
	internalDate?: unknown;
	snippet?: unknown;
	payload?: GmailMessagePart;
};

type GmailProviderList = {
	messages?: Array<{ id?: unknown; threadId?: unknown }>;
	nextPageToken?: unknown;
};

export class GmailReadGatewayError extends Error {
	constructor(
		public readonly code:
			| 'invalid_request'
			| 'connection_not_found'
			| 'message_not_found'
			| 'provider_error'
			| 'provider_response_too_large'
			| 'unsupported_message',
		message: string,
		public readonly providerStatus?: number,
		public readonly providerDiagnosticCode?: GmailProviderDiagnosticCode
	) {
		super(message);
		this.name = 'GmailReadGatewayError';
	}
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}

function cleanHeaderValue(value: unknown, maxLength = 2_000): string {
	if (typeof value !== 'string') return '';
	return value
		.replace(/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
		.trim()
		.slice(0, maxLength);
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
	const match = headers?.find(
		(header) =>
			typeof header.name === 'string' && header.name.toLowerCase() === name.toLowerCase()
	);
	return cleanHeaderValue(match?.value);
}

function cleanSnippet(value: unknown): string {
	if (typeof value !== 'string') return '';
	return sanitizeHtml(value, {
		allowedTags: [],
		allowedAttributes: {},
		nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript']
	})
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 500);
}

function parseInternalDate(value: unknown): string {
	if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) return new Date(0).toISOString();
	const milliseconds = Number(value);
	return Number.isFinite(milliseconds)
		? new Date(milliseconds).toISOString()
		: new Date(0).toISOString();
}

function safeMessageId(value: unknown): string | null {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : null;
}

function decodeBase64Url(value: string): Buffer {
	if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) {
		throw new GmailReadGatewayError(
			'unsupported_message',
			'This message has malformed content'
		);
	}
	const estimatedBytes = Math.ceil((value.replace(/=+$/, '').length * 3) / 4);
	if (estimatedBytes > MAX_DECODED_PART_BYTES) {
		throw new GmailReadGatewayError(
			'unsupported_message',
			'This message part is too large to display safely'
		);
	}
	return Buffer.from(value, 'base64url');
}

function sanitizePlainText(value: string): string {
	return value
		.replace(/\r\n?/g, '\n')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
		.replace(/\n{4,}/g, '\n\n\n')
		.trim();
}

function sanitizeHtmlToText(value: string): string {
	const withLineBreaks = value.replace(
		/<\s*\/?\s*(?:p|div|br|li|tr|h[1-6]|blockquote)\b[^>]*>/gi,
		'\n'
	);
	return sanitizePlainText(
		sanitizeHtml(withLineBreaks, {
			allowedTags: [],
			allowedAttributes: {},
			nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript']
		})
	);
}

function parseMessageBody(payload: GmailMessagePart | undefined): {
	bodyText: string;
	bodyTruncated: boolean;
	hasUnsupportedAttachments: boolean;
} {
	if (!payload) {
		return { bodyText: '', bodyTruncated: false, hasUnsupportedAttachments: false };
	}

	const plainParts: string[] = [];
	const htmlParts: string[] = [];
	let decodedBytes = 0;
	let partCount = 0;
	let hasUnsupportedAttachments = false;

	const visit = (part: GmailMessagePart, depth: number): void => {
		partCount += 1;
		if (depth > MAX_MIME_DEPTH || partCount > MAX_MIME_PARTS) {
			throw new GmailReadGatewayError(
				'unsupported_message',
				'This message is too complex to display safely'
			);
		}

		const mimeType =
			typeof part.mimeType === 'string'
				? (part.mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '')
				: '';
		if (mimeType === 'multipart/encrypted' || mimeType === 'application/pkcs7-mime') {
			throw new GmailReadGatewayError(
				'unsupported_message',
				'Encrypted message content is not supported'
			);
		}

		const filename = cleanHeaderValue(part.filename, 500);
		const attachmentId = part.body?.attachmentId;
		if (filename || typeof attachmentId === 'string') {
			hasUnsupportedAttachments = true;
			return;
		}

		const encoded = part.body?.data;
		if (
			typeof encoded === 'string' &&
			(mimeType === 'text/plain' || mimeType === 'text/html')
		) {
			const decoded = decodeBase64Url(encoded);
			decodedBytes += decoded.byteLength;
			if (decodedBytes > MAX_DECODED_BODY_BYTES) {
				throw new GmailReadGatewayError(
					'unsupported_message',
					'This message is too large to display safely'
				);
			}
			const text = decoded.toString('utf8');
			if (mimeType === 'text/plain') plainParts.push(text);
			else htmlParts.push(text);
		}

		for (const child of part.parts ?? []) visit(child, depth + 1);
	};

	visit(payload, 0);
	const sanitized =
		plainParts.length > 0
			? sanitizePlainText(plainParts.join('\n\n'))
			: sanitizeHtmlToText(htmlParts.join('\n\n'));
	const bodyTruncated = sanitized.length > MAX_BODY_CHARACTERS;

	return {
		bodyText: sanitized.slice(0, MAX_BODY_CHARACTERS),
		bodyTruncated,
		hasUnsupportedAttachments
	};
}

async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw new GmailReadGatewayError(
			'provider_response_too_large',
			'Google returned more Gmail data than BuildOS allows for one request'
		);
	}

	if (!response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			throw new GmailReadGatewayError(
				'provider_response_too_large',
				'Google returned more Gmail data than BuildOS allows for one request'
			);
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new GmailReadGatewayError(
			'provider_error',
			'Google returned an invalid Gmail response',
			undefined,
			'response_json_invalid'
		);
	}
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await mapper(items[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}

export class GmailReadGateway {
	private readonly admin: SupabaseClient<any>;
	private readonly oauthService: Pick<GmailReadOAuthService, 'getAuthorizedReadAccessToken'>;
	private readonly providerFetch: ProviderFetch;
	private readonly now: () => Date;

	constructor(admin: SupabaseClient<any>, options: GmailReadGatewayOptions = {}) {
		this.admin = admin;
		this.oauthService = options.oauthService ?? new GmailReadOAuthService(admin);
		this.providerFetch = options.providerFetch ?? fetch;
		this.now = options.now ?? (() => new Date());
	}

	private async audit(params: {
		userId: string;
		connectionId?: string;
		operation: string;
		outcome: 'success' | 'failure' | 'blocked';
		reasonCode?: string;
		metadata?: Record<string, string | number | boolean | null>;
	}): Promise<void> {
		try {
			await this.admin.from('email_access_audit_events').insert({
				user_id: params.userId,
				connection_id: params.connectionId ?? null,
				operation: params.operation,
				outcome: params.outcome,
				reason_code: params.reasonCode ?? null,
				metadata: params.metadata ?? {}
			});
		} catch {
			// Audit records never contain message content and must not replace the primary response.
		}
	}

	private async loadOwnedConnections(
		userId: string,
		connectionIds: string[]
	): Promise<ConnectionRow[]> {
		const ids = uniqueStrings(connectionIds);
		if (
			ids.length === 0 ||
			ids.length > MAX_ACCOUNTS_PER_REQUEST ||
			ids.length !== connectionIds.length
		) {
			throw new GmailReadGatewayError(
				'invalid_request',
				'Select between one and five unique Gmail accounts'
			);
		}

		const { data, error } = await this.admin
			.from('user_email_connections')
			.select('id, email_address, account_label, status, read_enabled')
			.eq('user_id', userId)
			.eq('provider', 'google_gmail')
			.in('id', ids)
			.is('deleted_at', null);

		const rows = (data ?? []) as ConnectionRow[];
		if (error || rows.length !== ids.length) {
			await this.audit({
				userId,
				operation: 'gmail.messages.authorize',
				outcome: 'blocked',
				reasonCode: 'connection_not_found',
				metadata: { requestedConnectionCount: ids.length }
			});
			throw new GmailReadGatewayError(
				'connection_not_found',
				'One or more Gmail accounts were not found'
			);
		}

		const rowsById = new Map(rows.map((row) => [row.id, row]));
		return ids.map((id) => rowsById.get(id) as ConnectionRow);
	}

	private async providerGet(
		path: string,
		accessToken: string,
		params: URLSearchParams,
		maxBytes: number
	): Promise<unknown> {
		const url = new URL(path, GMAIL_API_ORIGIN);
		if (url.origin !== GMAIL_API_ORIGIN || !url.pathname.startsWith('/gmail/v1/users/me/')) {
			throw new GmailReadGatewayError('invalid_request', 'Unsupported Gmail read operation');
		}
		url.search = params.toString();

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
		let response: Response;
		try {
			response = await this.providerFetch(url, {
				method: 'GET',
				headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
				redirect: 'error',
				signal: controller.signal
			});
		} catch (error) {
			clearTimeout(timeout);
			throw new GmailReadGatewayError(
				'provider_error',
				'Google is temporarily unavailable',
				undefined,
				error instanceof Error && error.name === 'AbortError'
					? 'fetch_timeout'
					: 'fetch_rejected'
			);
		}

		try {
			if (response.status === 404) {
				throw new GmailReadGatewayError('message_not_found', 'Gmail message was not found');
			}
			if (!response.ok) {
				throw new GmailReadGatewayError(
					'provider_error',
					'Google could not complete this read-only Gmail request',
					response.status
				);
			}
			return await readJsonBounded(response, maxBytes);
		} catch (error) {
			if (error instanceof GmailReadGatewayError) throw error;
			throw new GmailReadGatewayError(
				'provider_error',
				'Google is temporarily unavailable',
				undefined,
				'response_body_unreadable'
			);
		} finally {
			clearTimeout(timeout);
		}
	}

	private summaryFromProvider(
		connection: ConnectionRow,
		message: GmailProviderMessage
	): GmailMessageSummary {
		const messageId = safeMessageId(message.id);
		const threadId = safeMessageId(message.threadId);
		if (!messageId || !threadId) {
			throw new GmailReadGatewayError(
				'provider_error',
				'Google returned an invalid Gmail message identifier'
			);
		}
		const headers = Array.isArray(message.payload?.headers) ? message.payload?.headers : [];
		return {
			connectionId: connection.id,
			accountLabel: cleanHeaderValue(connection.account_label, 60),
			emailAddress: cleanHeaderValue(connection.email_address, 320),
			messageId,
			threadId,
			subject: getHeader(headers, 'Subject') || '(No subject)',
			from: getHeader(headers, 'From') || 'Unknown sender',
			internalDate: parseInternalDate(message.internalDate),
			snippet: cleanSnippet(message.snippet)
		};
	}

	private async searchOneAccount(params: {
		userId: string;
		connection: ConnectionRow;
		query: string;
		maxResults: number;
	}): Promise<{ account: GmailReadAccountResult; messages: GmailMessageSummary[] }> {
		const { userId, connection, query, maxResults } = params;
		if (connection.status !== 'active' || !connection.read_enabled) {
			return {
				account: {
					connectionId: connection.id,
					accountLabel: connection.account_label,
					emailAddress: connection.email_address,
					status:
						connection.status === 'reconnect_required'
							? 'reconnect_required'
							: 'unavailable',
					messageCount: 0,
					hasMore: false
				},
				messages: []
			};
		}

		let failureStage: 'authorize' | 'list' | 'metadata' | 'map' = 'authorize';
		try {
			const accessToken = await this.oauthService.getAuthorizedReadAccessToken(
				userId,
				connection.id
			);
			failureStage = 'list';
			const listParams = new URLSearchParams({
				q: query,
				maxResults: String(maxResults),
				includeSpamTrash: 'false',
				fields: 'messages(id,threadId),nextPageToken'
			});
			const listPayload = await this.providerGet(
				'/gmail/v1/users/me/messages',
				accessToken,
				listParams,
				MAX_PROVIDER_LIST_BYTES
			);
			if (
				listPayload !== null &&
				(typeof listPayload !== 'object' || Array.isArray(listPayload))
			) {
				throw new GmailReadGatewayError(
					'provider_error',
					'Google returned an invalid Gmail response',
					undefined,
					'response_json_invalid'
				);
			}
			const listResponse = (listPayload ?? {}) as GmailProviderList;
			const messageIds = (Array.isArray(listResponse.messages) ? listResponse.messages : [])
				.map((message) => safeMessageId(message.id))
				.filter((id): id is string => Boolean(id))
				.slice(0, maxResults);

			failureStage = 'metadata';
			const providerMessages = await mapWithConcurrency(messageIds, 4, async (messageId) => {
				const metadataParams = new URLSearchParams({
					format: 'metadata',
					fields: 'id,threadId,internalDate,snippet,payload/headers'
				});
				for (const header of ['From', 'Subject', 'Date'])
					metadataParams.append('metadataHeaders', header);
				return (await this.providerGet(
					`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
					accessToken,
					metadataParams,
					MAX_PROVIDER_LIST_BYTES
				)) as GmailProviderMessage;
			});
			failureStage = 'map';
			const messages = providerMessages.map((message) =>
				this.summaryFromProvider(connection, message)
			);

			await this.audit({
				userId,
				connectionId: connection.id,
				operation: 'gmail.messages.search',
				outcome: 'success',
				metadata: {
					resultCount: messages.length,
					hasMore: typeof listResponse.nextPageToken === 'string'
				}
			});
			return {
				account: {
					connectionId: connection.id,
					accountLabel: connection.account_label,
					emailAddress: connection.email_address,
					status: 'success',
					messageCount: messages.length,
					hasMore: typeof listResponse.nextPageToken === 'string'
				},
				messages
			};
		} catch (error) {
			const reconnectRequired =
				error instanceof GmailOAuthError &&
				(error.code === 'reconnect_required' || error.code === 'read_capability_disabled');
			await this.audit({
				userId,
				connectionId: connection.id,
				operation: 'gmail.messages.search',
				outcome: 'failure',
				reasonCode: reconnectRequired ? 'reconnect_required' : 'provider_error',
				metadata: {
					failureStage,
					gatewayErrorCode: error instanceof GmailReadGatewayError ? error.code : null,
					providerStatus:
						error instanceof GmailReadGatewayError
							? (error.providerStatus ?? null)
							: null,
					providerDiagnosticCode:
						error instanceof GmailReadGatewayError
							? (error.providerDiagnosticCode ?? null)
							: null
				}
			});
			return {
				account: {
					connectionId: connection.id,
					accountLabel: connection.account_label,
					emailAddress: connection.email_address,
					status: reconnectRequired ? 'reconnect_required' : 'unavailable',
					messageCount: 0,
					hasMore: false
				},
				messages: []
			};
		}
	}

	async searchMessages(params: {
		userId: string;
		connectionIds: string[];
		query: string;
		maxResults?: number;
	}): Promise<GmailMessageSearchPayload> {
		const query = params.query.trim();
		if (
			query.length < 1 ||
			query.length > MAX_QUERY_LENGTH ||
			/[\u0000-\u001f\u007f]/.test(query)
		) {
			throw new GmailReadGatewayError(
				'invalid_request',
				'Gmail search must be between 1 and 300 safe characters'
			);
		}
		const maxResults = Math.max(
			1,
			Math.min(Math.floor(params.maxResults ?? 12), MAX_MESSAGES_PER_REQUEST)
		);
		const connections = await this.loadOwnedConnections(params.userId, params.connectionIds);
		const perAccountLimit = Math.min(
			MAX_MESSAGES_PER_ACCOUNT,
			Math.ceil(maxResults / connections.length)
		);
		const accountResults = await mapWithConcurrency(connections, 3, (connection) =>
			this.searchOneAccount({
				userId: params.userId,
				connection,
				query,
				maxResults: perAccountLimit
			})
		);
		const messages = accountResults
			.flatMap((result) => result.messages)
			.sort(
				(left, right) =>
					right.internalDate.localeCompare(left.internalDate) ||
					left.connectionId.localeCompare(right.connectionId) ||
					left.messageId.localeCompare(right.messageId)
			)
			.slice(0, maxResults);

		return {
			accounts: accountResults.map((result) => result.account),
			messages,
			fetchedAt: this.now().toISOString(),
			readOnly: true
		};
	}

	async getMessage(params: {
		userId: string;
		connectionId: string;
		messageId: string;
	}): Promise<GmailMessageDetail> {
		const messageId = safeMessageId(params.messageId);
		if (!messageId)
			throw new GmailReadGatewayError('invalid_request', 'Invalid Gmail message identifier');
		const connections = await this.loadOwnedConnections(params.userId, [params.connectionId]);
		const connection = connections[0];
		if (!connection) {
			throw new GmailReadGatewayError('connection_not_found', 'Gmail account was not found');
		}
		if (connection.status !== 'active' || !connection.read_enabled) {
			throw new GmailOAuthError(
				'reconnect_required',
				'This Gmail account must be reconnected before it can be read'
			);
		}

		try {
			const accessToken = await this.oauthService.getAuthorizedReadAccessToken(
				params.userId,
				connection.id
			);
			const providerMessage = (await this.providerGet(
				`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
				accessToken,
				new URLSearchParams({
					format: 'full',
					fields: 'id,threadId,internalDate,snippet,payload(mimeType,filename,headers,body,parts)'
				}),
				MAX_PROVIDER_MESSAGE_BYTES
			)) as GmailProviderMessage;
			const summary = this.summaryFromProvider(connection, providerMessage);
			const body = parseMessageBody(providerMessage.payload);
			const headers = providerMessage.payload?.headers;
			const detail: GmailMessageDetail = {
				...summary,
				to: getHeader(headers, 'To'),
				cc: getHeader(headers, 'Cc') || null,
				...body,
				fetchedAt: this.now().toISOString(),
				readOnly: true
			};

			await this.audit({
				userId: params.userId,
				connectionId: connection.id,
				operation: 'gmail.messages.get',
				outcome: 'success',
				metadata: {
					bodyCharacters: detail.bodyText.length,
					bodyTruncated: detail.bodyTruncated,
					hasUnsupportedAttachments: detail.hasUnsupportedAttachments
				}
			});
			return detail;
		} catch (error) {
			await this.audit({
				userId: params.userId,
				connectionId: connection.id,
				operation: 'gmail.messages.get',
				outcome: 'failure',
				reasonCode:
					error instanceof GmailReadGatewayError
						? error.code
						: error instanceof GmailOAuthError
							? error.code
							: 'provider_error'
			});
			throw error;
		}
	}
}
