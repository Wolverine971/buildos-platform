// apps/worker/src/workers/agentic-chat/tools/email-read-port.ts
//
// Worker adapter for `AgenticChatEmailReadPortV1` — the provider half of the
// five shared email tools. It composes the same shared Gmail read stack web
// deploys (`GmailReadOAuthService` + `GmailReadGateway`, which already enforce
// connection ownership, the read capability and stored scopes, sanitization,
// size caps, and content-free audit rows) plus the shared Google Calendar
// connection read that `get_external_account_status` reports beside the inbox.
//
// Three properties this file must keep:
//
//  1. Nothing here touches OAuth environment variables at construction time.
//     `readEnv` is resolved lazily inside the shared services, so a worker
//     deployed without the Gmail OAuth env still boots; `listAccounts` then
//     reports `available: false` and a search reports a structured
//     `not_configured` instead of throwing an unhandled error.
//  2. Only classified provider failures become `AgenticChatEmailReadErrorV1`.
//     Anything else propagates unchanged so the shared tool collapses it into
//     one generic message rather than leaking request details or credentials.
//  3. Rate limiting lives here, not in the shared tool: web keeps its process
//     singleton limiter, the worker gets its own in-memory instance.
//
// Authorization: the port is bound to the turn's trusted `userId` claim and
// refuses any input carrying a different one. The Gmail gateway re-checks
// connection ownership against that same user id on every call.

import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	type AgenticChatCalendarAccountsResultV1,
	type AgenticChatEmailAccountsResultV1,
	type AgenticChatEmailCapabilityStatusV1,
	type AgenticChatEmailGetMessageInputV1,
	type AgenticChatEmailMessageV1,
	AgenticChatEmailReadErrorV1,
	type AgenticChatEmailReadPortV1,
	type AgenticChatEmailSearchInputV1,
	type AgenticChatEmailSearchResultV1,
	type AgenticChatExternalAccountsResultV1
} from '@buildos/agentic-chat-runtime/tools';
import {
	type GmailReadEnvReader,
	GmailReadOAuthService
} from '@buildos/shared-agent-ops/email/gmail-read-oauth.service';
import { GmailReadGateway } from '@buildos/shared-agent-ops/email/gmail-read-gateway';
import {
	type GmailReadOperation,
	checkGmailReadRateLimit
} from '@buildos/shared-agent-ops/email/gmail-read-rate-limit';
import {
	type RateLimiterPort,
	createInMemoryRateLimiter
} from '@buildos/shared-agent-ops/email/gmail-rate-limiter-port';
import {
	GoogleCalendarConnectionReadPort,
	isGoogleCalendarMultiAccountConfigured
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';

type GmailAccountsPort = Pick<GmailReadOAuthService, 'listConnections'>;
type GmailMessagesPort = Pick<GmailReadGateway, 'searchMessages' | 'getMessage'>;
type CalendarAccountsPort = Pick<GoogleCalendarConnectionReadPort, 'listConnections'>;

/**
 * One process-wide limiter, matching web's singleton: the quota is per user and
 * per connection, so a per-turn limiter would reset the window on every turn.
 */
const WORKER_GMAIL_RATE_LIMITER = createInMemoryRateLimiter();

const GMAIL_OAUTH_ERROR_CODES = new Set([
	'not_configured',
	'connection_not_found',
	'read_capability_disabled',
	'reconnect_required'
]);
const GMAIL_GATEWAY_ERROR_CODES = new Set([
	'invalid_request',
	'connection_not_found',
	'message_not_found',
	'provider_error',
	'provider_response_too_large',
	'unsupported_message'
]);

function namedErrorCode(error: unknown, name: string): string | null {
	// Bundle boundaries can break `instanceof`, so classify by shape exactly as
	// the calendar read port does for GoogleCalendarConnectionError.
	if (!error || typeof error !== 'object') return null;
	const candidate = error as { name?: unknown; code?: unknown };
	if (candidate.name !== name || typeof candidate.code !== 'string') return null;
	return candidate.code;
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Translate the shared Gmail stack's classified failures into the host-neutral
 * port error. Unclassified errors are rethrown untouched.
 */
function toPortError(error: unknown, connectionId: string | null): unknown {
	const oauthCode = namedErrorCode(error, 'GmailOAuthError');
	if (oauthCode) {
		if (GMAIL_OAUTH_ERROR_CODES.has(oauthCode)) {
			return new AgenticChatEmailReadErrorV1(
				oauthCode as 'not_configured',
				errorMessage(error, 'Gmail read failed'),
				connectionId
			);
		}
		return new AgenticChatEmailReadErrorV1('provider_error', 'Gmail read failed', connectionId);
	}
	const gatewayCode = namedErrorCode(error, 'GmailReadGatewayError');
	if (gatewayCode && GMAIL_GATEWAY_ERROR_CODES.has(gatewayCode)) {
		return new AgenticChatEmailReadErrorV1(
			gatewayCode as 'provider_error',
			errorMessage(error, 'Gmail read failed'),
			connectionId
		);
	}
	return error;
}

function readCapabilityStatus(
	capabilities: ReadonlyArray<{ capability: string; status: string }>
): AgenticChatEmailCapabilityStatusV1 {
	const grant = capabilities.find((capability) => capability.capability === 'read');
	return (grant?.status as AgenticChatEmailCapabilityStatusV1) ?? 'disabled';
}

export type WorkerAgenticChatEmailReadPortOptions = {
	/** Test seam: supply the composed Gmail account service. */
	accounts?: () => GmailAccountsPort;
	/** Test seam: supply the composed Gmail message gateway. */
	messages?: () => GmailMessagesPort;
	/** Test seam: supply the composed calendar connection reader. */
	calendarAccounts?: () => CalendarAccountsPort;
	readEnv?: GmailReadEnvReader;
	rateLimiter?: RateLimiterPort;
};

/**
 * Binds one email read port to a single trusted user id for the duration of a
 * turn. Provider services are built on first use, never at construction.
 */
export function createWorkerAgenticChatEmailReadPort(input: {
	client: SupabaseClient<Database>;
	userId: string;
	options?: WorkerAgenticChatEmailReadPortOptions;
}): AgenticChatEmailReadPortV1 {
	const { client, userId } = input;
	const options = input.options ?? {};
	const readEnv: GmailReadEnvReader = options.readEnv ?? ((name) => process.env[name]);
	const rateLimiter = options.rateLimiter ?? WORKER_GMAIL_RATE_LIMITER;
	const typedClient = client as unknown as TypedSupabaseClient;

	let accountsPort: GmailAccountsPort | null = null;
	let messagesPort: GmailMessagesPort | null = null;
	let calendarPort: CalendarAccountsPort | null = null;

	const requireAccounts = (): GmailAccountsPort => {
		if (!accountsPort) {
			accountsPort = options.accounts
				? options.accounts()
				: new GmailReadOAuthService(typedClient, { readEnv });
		}
		return accountsPort;
	};
	const requireMessages = (): GmailMessagesPort => {
		if (!messagesPort) {
			messagesPort = options.messages
				? options.messages()
				: new GmailReadGateway(typedClient, { readEnv });
		}
		return messagesPort;
	};
	const requireCalendarAccounts = (): CalendarAccountsPort => {
		if (!calendarPort) {
			calendarPort = options.calendarAccounts
				? options.calendarAccounts()
				: new GoogleCalendarConnectionReadPort(client, {
						available: isGoogleCalendarMultiAccountConfigured(readEnv)
					});
		}
		return calendarPort;
	};

	const assertBoundUser = (candidate: string): void => {
		if (candidate !== userId) {
			throw new Error('Email read port received a userId outside the turn claim');
		}
	};

	const enforceRateLimit = (
		connectionIds: readonly string[],
		operation: GmailReadOperation
	): void => {
		const decision = checkGmailReadRateLimit({
			userId,
			connectionIds: [...connectionIds],
			operation,
			limiter: rateLimiter
		});
		if (!decision.allowed) {
			throw new AgenticChatEmailReadErrorV1(
				'rate_limited',
				'Too many Gmail reads in a short window',
				connectionIds.length === 1 ? (connectionIds[0] ?? null) : null
			);
		}
	};

	const loadGmailAccounts = async (): Promise<AgenticChatEmailAccountsResultV1> => {
		const payload = await requireAccounts().listConnections(userId);
		return {
			available: payload.available,
			maxConnections: payload.maxConnections,
			accounts: payload.connections.map((connection) => ({
				connectionId: connection.id,
				emailAddress: connection.emailAddress,
				accountLabel: connection.accountLabel,
				status: connection.status,
				readEnabled: connection.readEnabled,
				readCapabilityStatus: readCapabilityStatus(connection.capabilities)
			}))
		};
	};

	const loadCalendarAccounts = async (): Promise<AgenticChatCalendarAccountsResultV1> => {
		const payload = await requireCalendarAccounts().listConnections(userId);
		return {
			available: payload.available,
			accounts: payload.connections.map((connection) => ({
				connectionId: connection.id,
				emailAddress: connection.emailAddress,
				accountLabel: connection.accountLabel,
				status: connection.status,
				sources: connection.sources.map((source) => ({
					readEnabled: source.readEnabled,
					accessRole: source.accessRole
				}))
			}))
		};
	};

	return {
		async listAccounts(accountsInput): Promise<AgenticChatEmailAccountsResultV1> {
			assertBoundUser(accountsInput.userId);
			try {
				return await loadGmailAccounts();
			} catch (error) {
				throw toPortError(error, null);
			}
		},

		async listExternalAccounts(statusInput): Promise<AgenticChatExternalAccountsResultV1> {
			assertBoundUser(statusInput.userId);
			// The calendar half must never hide a healthy inbox answer, exactly as
			// the legacy web executor's Promise.allSettled did.
			const [gmailResult, calendarResult] = await Promise.allSettled([
				loadGmailAccounts(),
				loadCalendarAccounts()
			]);
			if (gmailResult.status === 'rejected') throw toPortError(gmailResult.reason, null);
			return {
				gmail: gmailResult.value,
				calendar: calendarResult.status === 'fulfilled' ? calendarResult.value : null
			};
		},

		async searchMessages(
			searchInput: AgenticChatEmailSearchInputV1
		): Promise<AgenticChatEmailSearchResultV1> {
			assertBoundUser(searchInput.userId);
			enforceRateLimit(searchInput.connectionIds, 'search');
			try {
				const payload = await requireMessages().searchMessages({
					userId,
					connectionIds: [...searchInput.connectionIds],
					query: searchInput.query,
					maxResults: searchInput.maxResults,
					cursor: searchInput.cursor
				});
				return {
					fetchedAt: payload.fetchedAt,
					accounts: payload.accounts.map((account) => ({
						connectionId: account.connectionId,
						accountLabel: account.accountLabel,
						emailAddress: account.emailAddress,
						status: account.status,
						messageCount: account.messageCount,
						hasMore: account.hasMore,
						nextCursor: account.nextCursor
					})),
					messages: payload.messages.map((message) => ({
						connectionId: message.connectionId,
						accountLabel: message.accountLabel,
						emailAddress: message.emailAddress,
						messageId: message.messageId,
						threadId: message.threadId,
						subject: message.subject,
						from: message.from,
						date: message.internalDate,
						snippet: message.snippet
					}))
				};
			} catch (error) {
				throw toPortError(
					error,
					searchInput.connectionIds.length === 1
						? (searchInput.connectionIds[0] ?? null)
						: null
				);
			}
		},

		async getMessage(
			messageInput: AgenticChatEmailGetMessageInputV1
		): Promise<AgenticChatEmailMessageV1> {
			assertBoundUser(messageInput.userId);
			enforceRateLimit([messageInput.connectionId], 'get');
			try {
				const detail = await requireMessages().getMessage({
					userId,
					connectionId: messageInput.connectionId,
					messageId: messageInput.messageId
				});
				return {
					connectionId: detail.connectionId,
					accountLabel: detail.accountLabel,
					emailAddress: detail.emailAddress,
					messageId: detail.messageId,
					threadId: detail.threadId,
					subject: detail.subject,
					from: detail.from,
					date: detail.internalDate,
					snippet: detail.snippet,
					to: detail.to,
					cc: detail.cc,
					body: detail.bodyText,
					bodyTruncated: detail.bodyTruncated,
					hasUnsupportedAttachments: detail.hasUnsupportedAttachments,
					fetchedAt: detail.fetchedAt
				};
			} catch (error) {
				throw toPortError(error, messageInput.connectionId);
			}
		}
	};
}
