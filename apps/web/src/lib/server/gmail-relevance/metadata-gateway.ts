// apps/web/src/lib/server/gmail-relevance/metadata-gateway.ts
import { z } from 'zod';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { GmailSchemaClient } from '../gmail-database.types';
import { GmailOAuthError, GmailReadOAuthService } from '../gmail-read-oauth.service';
import {
	normalizeEmailRelevanceMetadata,
	type EmailRelevanceProviderMetadata,
	type NormalizedEmailRelevanceMetadata
} from './metadata-normalizer';

const GMAIL_API_ORIGIN = 'https://gmail.googleapis.com';
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_LIST_BYTES = 256 * 1024;
const MAX_PROVIDER_METADATA_BYTES = 256 * 1024;
const LIST_PAGE_SIZE = 100;
const METADATA_BATCH_CEILING = 50;
const METADATA_CONCURRENCY = 4;
const MAX_PAGE_TOKEN_CHARACTERS = 4_096;
const WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;
const METADATA_HEADERS = ['From', 'To', 'Cc', 'Bcc', 'Subject'] as const;

const UUID_SCHEMA = z.string().uuid();
const PROVIDER_ID_SCHEMA = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const ISO_TIMESTAMP_SCHEMA = z.string().datetime({ offset: true });

type ProviderFetch = typeof fetch;

type GmailRelevanceMetadataGatewayOptions = {
	oauthService?: Pick<GmailReadOAuthService, 'getAuthorizedReadAccessToken'>;
	providerFetch?: ProviderFetch;
};

type GmailProviderList = {
	messages?: unknown;
	nextPageToken?: unknown;
};

export type EmailRelevanceListPage = {
	messages: { provider_message_id: string; provider_thread_id: string }[];
	next_page_token: string | null;
};

export type EmailRelevanceMetadataBatch = {
	messages: NormalizedEmailRelevanceMetadata[];
};

export type GmailRelevanceMetadataGatewayErrorCode =
	| 'invalid_request'
	| 'connection_unavailable'
	| 'provider_timeout'
	| 'provider_rejected'
	| 'provider_response_too_large'
	| 'invalid_provider_response';

export class GmailRelevanceMetadataGatewayError extends Error {
	constructor(
		public readonly code: GmailRelevanceMetadataGatewayErrorCode,
		public readonly providerCallsStarted = 0
	) {
		super(`Gmail relevance metadata gateway rejected: ${code}`);
		this.name = 'GmailRelevanceMetadataGatewayError';
	}
}

function pageToken(value: string | null | undefined): string | undefined {
	if (value === null || value === undefined) return undefined;
	if (value.length < 1 || value.length > MAX_PAGE_TOKEN_CHARACTERS || /\p{Cc}/u.test(value)) {
		throw new GmailRelevanceMetadataGatewayError('invalid_request');
	}
	return value;
}

function compileQuery(windowStart: string, windowEnd: string): string {
	const start = Date.parse(windowStart);
	const end = Date.parse(windowEnd);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== WINDOW_MILLISECONDS) {
		throw new GmailRelevanceMetadataGatewayError('invalid_request');
	}
	return `{in:inbox in:sent} -in:spam -in:trash -in:drafts after:${Math.floor(
		start / 1_000
	)} before:${Math.floor(end / 1_000)}`;
}

async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw new GmailRelevanceMetadataGatewayError('provider_response_too_large');
	}
	if (!response.body) return {};
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			throw new GmailRelevanceMetadataGatewayError('provider_response_too_large');
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
		throw new GmailRelevanceMetadataGatewayError('invalid_provider_response');
	}
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(items.length, concurrency) }, async () => {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			results[index] = await mapper(items[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}

function isConnectionFailure(error: unknown): boolean {
	return (
		error instanceof GmailOAuthError &&
		[
			'connection_not_found',
			'read_capability_disabled',
			'reconnect_required',
			'scope_mismatch',
			'database_error'
		].includes(error.code)
	);
}

export class GmailRelevanceMetadataGateway {
	private readonly oauthService: Pick<GmailReadOAuthService, 'getAuthorizedReadAccessToken'>;
	private readonly providerFetch: ProviderFetch;

	constructor(
		admin: TypedSupabaseClient | GmailSchemaClient,
		options: GmailRelevanceMetadataGatewayOptions = {}
	) {
		this.oauthService = options.oauthService ?? new GmailReadOAuthService(admin);
		this.providerFetch = options.providerFetch ?? fetch;
	}

	private async accessToken(userId: string, connectionId: string): Promise<string> {
		try {
			return await this.oauthService.getAuthorizedReadAccessToken(userId, connectionId);
		} catch (error) {
			throw new GmailRelevanceMetadataGatewayError(
				isConnectionFailure(error) ? 'connection_unavailable' : 'provider_rejected'
			);
		}
	}

	private async providerGet(
		path: string,
		accessToken: string,
		parameters: URLSearchParams,
		maxBytes: number
	): Promise<unknown> {
		const url = new URL(path, GMAIL_API_ORIGIN);
		if (
			url.origin !== GMAIL_API_ORIGIN ||
			!url.pathname.startsWith('/gmail/v1/users/me/messages')
		) {
			throw new GmailRelevanceMetadataGatewayError('invalid_request');
		}
		url.search = parameters.toString();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
		try {
			const response = await this.providerFetch(url, {
				method: 'GET',
				headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
				redirect: 'error',
				signal: controller.signal
			});
			if (!response.ok) throw new GmailRelevanceMetadataGatewayError('provider_rejected');
			return await readJsonBounded(response, maxBytes);
		} catch (error) {
			if (error instanceof GmailRelevanceMetadataGatewayError) throw error;
			throw new GmailRelevanceMetadataGatewayError(
				error instanceof Error && error.name === 'AbortError'
					? 'provider_timeout'
					: 'provider_rejected'
			);
		} finally {
			clearTimeout(timeout);
		}
	}

	async listPage(input: {
		user_id: string;
		connection_id: string;
		window_start: string;
		window_end: string;
		page_token?: string | null;
	}): Promise<EmailRelevanceListPage> {
		const parsed = z
			.object({
				user_id: UUID_SCHEMA,
				connection_id: UUID_SCHEMA,
				window_start: ISO_TIMESTAMP_SCHEMA,
				window_end: ISO_TIMESTAMP_SCHEMA,
				page_token: z.string().optional().nullable()
			})
			.strict()
			.safeParse(input);
		if (!parsed.success) throw new GmailRelevanceMetadataGatewayError('invalid_request');

		const query = compileQuery(parsed.data.window_start, parsed.data.window_end);
		const token = pageToken(parsed.data.page_token);
		const accessToken = await this.accessToken(parsed.data.user_id, parsed.data.connection_id);
		const parameters = new URLSearchParams({
			q: query,
			maxResults: String(LIST_PAGE_SIZE),
			includeSpamTrash: 'false',
			fields: 'messages(id,threadId),nextPageToken'
		});
		if (token) parameters.set('pageToken', token);
		let payload: unknown;
		try {
			payload = await this.providerGet(
				'/gmail/v1/users/me/messages',
				accessToken,
				parameters,
				MAX_PROVIDER_LIST_BYTES
			);
		} catch (error) {
			throw new GmailRelevanceMetadataGatewayError(
				error instanceof GmailRelevanceMetadataGatewayError
					? error.code
					: 'provider_rejected',
				1
			);
		}
		try {
			if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
				throw new GmailRelevanceMetadataGatewayError('invalid_provider_response');
			}
			const list = payload as GmailProviderList;
			const rawMessages = list.messages === undefined ? [] : list.messages;
			if (!Array.isArray(rawMessages) || rawMessages.length > LIST_PAGE_SIZE) {
				throw new GmailRelevanceMetadataGatewayError('invalid_provider_response');
			}
			const messages = rawMessages.map((raw) => {
				const parsedMessage = z
					.object({ id: PROVIDER_ID_SCHEMA, threadId: PROVIDER_ID_SCHEMA })
					.passthrough()
					.safeParse(raw);
				if (!parsedMessage.success) {
					throw new GmailRelevanceMetadataGatewayError('invalid_provider_response');
				}
				return {
					provider_message_id: parsedMessage.data.id,
					provider_thread_id: parsedMessage.data.threadId
				};
			});
			const nextPageToken = pageToken(
				typeof list.nextPageToken === 'string' ? list.nextPageToken : undefined
			);
			return { messages, next_page_token: nextPageToken ?? null };
		} catch (error) {
			throw new GmailRelevanceMetadataGatewayError(
				error instanceof GmailRelevanceMetadataGatewayError
					? error.code
					: 'invalid_provider_response',
				1
			);
		}
	}

	async getMetadataBatch(input: {
		user_id: string;
		connection_id: string;
		provider_message_ids: string[];
	}): Promise<EmailRelevanceMetadataBatch> {
		const parsed = z
			.object({
				user_id: UUID_SCHEMA,
				connection_id: UUID_SCHEMA,
				provider_message_ids: z.array(PROVIDER_ID_SCHEMA).min(1).max(METADATA_BATCH_CEILING)
			})
			.strict()
			.safeParse(input);
		if (
			!parsed.success ||
			new Set(parsed.data?.provider_message_ids ?? []).size !==
				(parsed.data?.provider_message_ids.length ?? -1)
		) {
			throw new GmailRelevanceMetadataGatewayError('invalid_request');
		}

		let providerCallsStarted = 0;
		let firstFailure: GmailRelevanceMetadataGatewayError | null = null;
		const messages = await mapWithConcurrency(
			parsed.data.provider_message_ids,
			METADATA_CONCURRENCY,
			async (messageId) => {
				try {
					// Re-authorize immediately before every provider call. The OAuth service re-checks
					// owner, connection state, read capability, and stored read-only scopes.
					const accessToken = await this.accessToken(
						parsed.data.user_id,
						parsed.data.connection_id
					);
					providerCallsStarted += 1;
					const parameters = new URLSearchParams({
						format: 'metadata',
						fields: 'id,threadId,internalDate,labelIds,snippet,payload/headers'
					});
					for (const header of METADATA_HEADERS)
						parameters.append('metadataHeaders', header);
					const provider = (await this.providerGet(
						`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
						accessToken,
						parameters,
						MAX_PROVIDER_METADATA_BYTES
					)) as EmailRelevanceProviderMetadata;
					const normalized = normalizeEmailRelevanceMetadata(provider);
					if (normalized.provider_message_id !== messageId) {
						throw new GmailRelevanceMetadataGatewayError('invalid_provider_response');
					}
					return normalized;
				} catch (error) {
					firstFailure ??= new GmailRelevanceMetadataGatewayError(
						error instanceof GmailRelevanceMetadataGatewayError
							? error.code
							: 'invalid_provider_response'
					);
					return null;
				}
			}
		);
		const completedFailure = firstFailure as GmailRelevanceMetadataGatewayError | null;
		if (completedFailure) {
			throw new GmailRelevanceMetadataGatewayError(
				completedFailure.code,
				providerCallsStarted
			);
		}
		return {
			messages: messages.filter(
				(message): message is NormalizedEmailRelevanceMetadata => message !== null
			)
		};
	}
}
