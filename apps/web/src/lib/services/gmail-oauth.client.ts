import type { GmailConnectionSummary, GmailConnectionsPayload } from '$lib/types/gmail-integration';

export const GMAIL_OAUTH_COMPLETE_MESSAGE = 'buildos:gmail-oauth-complete';
const GMAIL_OAUTH_CHANNEL = 'buildos:gmail-oauth';
const POPUP_COMPLETION_PATH = '/auth/google/gmail-read/complete';
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export type GmailOAuthCompletion = {
	type: typeof GMAIL_OAUTH_COMPLETE_MESSAGE;
	success: boolean;
	connectionId: string | null;
	error: string | null;
};

type StartGmailOAuthOptions = {
	connectionId?: string | null;
	fallbackRedirectPath?: string;
};

function unwrapPayload<T>(payload: unknown): T {
	if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
		return (payload as { data: T }).data;
	}
	return payload as T;
}

function errorMessage(payload: unknown, fallback: string): string {
	if (!payload || typeof payload !== 'object') return fallback;
	const candidate = payload as { error?: unknown; message?: unknown };
	if (typeof candidate.error === 'string') return candidate.error;
	if (typeof candidate.message === 'string') return candidate.message;
	return fallback;
}

export function gmailOAuthErrorMessage(code: string | null | undefined): string {
	const messages: Record<string, string> = {
		access_denied: 'Gmail access was not granted',
		invalid_state: 'The Gmail connection request expired. Please try again.',
		identity_verification_failed: 'Google account verification failed',
		scope_mismatch: 'Google did not return the required read-only permission',
		refresh_token_required: 'Google did not return offline access. Please reconnect.',
		account_mismatch: 'Reconnect using the same Google account',
		account_already_connected: 'That Gmail account is connected to another BuildOS user',
		connection_limit_exceeded: 'You have reached the Gmail account limit',
		not_configured: 'Gmail connections are not configured yet',
		popup_closed: 'The Google reconnect window was closed before authorization finished',
		oauth_timeout: 'Google authorization timed out. Please try again.'
	};
	return messages[code ?? ''] ?? 'Gmail connection failed';
}

function currentReturnPath(): string {
	const url = new URL(window.location.href);
	url.searchParams.set('gmail', '1');
	url.searchParams.delete('success');
	url.searchParams.delete('error');
	url.searchParams.delete('connection');
	return `${url.pathname}${url.search}${url.hash}`;
}

async function requestAuthorizationUrl(params: {
	connectionId: string | null;
	redirectPath: string;
}): Promise<string> {
	const response = await fetch('/api/integrations/gmail/connections', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params)
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(errorMessage(payload, 'Failed to start Gmail connection'));
	}
	const result = unwrapPayload<{ authorizationUrl?: string }>(payload);
	if (!result.authorizationUrl) throw new Error('Google authorization URL was not returned');
	return result.authorizationUrl;
}

async function verifyConnectedAccount(
	expectedConnectionId: string | null,
	completedConnectionId: string | null
): Promise<GmailConnectionSummary> {
	const response = await fetch('/api/integrations/gmail/connections', {
		headers: { 'Cache-Control': 'no-cache' }
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(errorMessage(payload, 'Unable to verify the Gmail connection'));
	}

	const result = unwrapPayload<GmailConnectionsPayload>(payload);
	const connectionId = expectedConnectionId ?? completedConnectionId;
	const connection = connectionId
		? result.connections.find((candidate) => candidate.id === connectionId)
		: result.connections.find(
				(candidate) => candidate.status === 'active' && candidate.readEnabled
			);
	if (!connection || connection.status !== 'active' || !connection.readEnabled) {
		throw new Error('Gmail reconnect finished, but read access could not be verified');
	}
	return connection;
}

/**
 * Starts Gmail OAuth in a popup so the current app context remains intact. If
 * the browser blocks popups, it falls back to a full-page authorization flow.
 * The returned promise resolves only after the server confirms read access is
 * active for the connection.
 */
export async function startGmailOAuth(
	options: StartGmailOAuthOptions = {}
): Promise<GmailConnectionSummary> {
	if (typeof window === 'undefined') throw new Error('Gmail authorization requires a browser');

	const expectedConnectionId = options.connectionId ?? null;
	const popup = window.open(
		'',
		`buildos-gmail-${crypto.randomUUID()}`,
		'popup=yes,width=560,height=720,resizable=yes,scrollbars=yes'
	);

	if (!popup) {
		const authorizationUrl = await requestAuthorizationUrl({
			connectionId: expectedConnectionId,
			redirectPath: options.fallbackRedirectPath ?? currentReturnPath()
		});
		window.location.assign(authorizationUrl);
		return new Promise<GmailConnectionSummary>(() => undefined);
	}

	popup.document.title = 'Connect Gmail';
	popup.document.body.textContent = 'Opening Google authorization…';

	try {
		const authorizationUrl = await requestAuthorizationUrl({
			connectionId: expectedConnectionId,
			redirectPath: POPUP_COMPLETION_PATH
		});
		popup.location.assign(authorizationUrl);
	} catch (error) {
		popup.close();
		throw error;
	}

	return await new Promise<GmailConnectionSummary>((resolve, reject) => {
		let settled = false;
		let completionReceived = false;
		let channel: BroadcastChannel | null = null;

		const finish = (error: Error | null, connection?: GmailConnectionSummary) => {
			if (settled) return;
			settled = true;
			window.clearInterval(closePoll);
			window.clearTimeout(timeout);
			window.removeEventListener('message', onWindowMessage);
			channel?.close();
			if (!popup.closed) popup.close();
			if (error) reject(error);
			else if (connection) resolve(connection);
		};

		const handleCompletion = async (completion: GmailOAuthCompletion) => {
			if (completion.type !== GMAIL_OAUTH_COMPLETE_MESSAGE || settled || completionReceived) {
				return;
			}
			completionReceived = true;
			if (!completion.success) {
				finish(new Error(gmailOAuthErrorMessage(completion.error)));
				return;
			}
			try {
				const connection = await verifyConnectedAccount(
					expectedConnectionId,
					completion.connectionId
				);
				finish(null, connection);
			} catch (error) {
				finish(
					error instanceof Error ? error : new Error('Unable to verify Gmail reconnect')
				);
			}
		};

		const onWindowMessage = (event: MessageEvent<unknown>) => {
			if (event.origin !== window.location.origin || event.source !== popup) return;
			void handleCompletion(event.data as GmailOAuthCompletion);
		};

		window.addEventListener('message', onWindowMessage);
		if ('BroadcastChannel' in window) {
			channel = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
			channel.onmessage = (event: MessageEvent<unknown>) => {
				void handleCompletion(event.data as GmailOAuthCompletion);
			};
		}

		const closePoll = window.setInterval(() => {
			if (popup.closed && !completionReceived) {
				finish(new Error(gmailOAuthErrorMessage('popup_closed')));
			}
		}, 500);
		const timeout = window.setTimeout(
			() => finish(new Error(gmailOAuthErrorMessage('oauth_timeout'))),
			OAUTH_TIMEOUT_MS
		);
	});
}
