// apps/worker/src/workers/notification/expoPushAdapter.ts
/**
 * Expo push adapter.
 *
 * Delivers one notification to a native app install (the iPhone/Android app) through Expo's
 * push API. This is the Expo twin of the `web-push` call in notificationWorker.ts: same
 * `notification_deliveries` row, same title/body/data payload, different transport.
 *
 * Uses plain `fetch` (Node 22+) instead of `expo-server-sdk` so the worker gains no dependency.
 * Expo answers a send with a *ticket* per message; a ticket can already say the device is gone
 * (`DeviceNotRegistered`), which the caller uses to deactivate the subscription row.
 */

import type { NotificationDelivery } from '@buildos/shared-types';

export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Structural check on a credential format: Expo push tokens look like
 * `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]` (older SDKs emitted `ExpoPushToken[...]`).
 */
const EXPO_PUSH_TOKEN_SHAPE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

export function isExpoPushToken(value: unknown): value is string {
	return typeof value === 'string' && EXPO_PUSH_TOKEN_SHAPE.test(value);
}

export type ExpoPushPriority = 'default' | 'high';

export interface ExpoPushMessage {
	/** Expo push token for the target install. */
	token: string;
	title: string;
	body: string;
	/** Arrives on the device as `notification.request.content.data`. Must be JSON. */
	data?: Record<string, unknown>;
	/** iOS app-icon badge number. */
	badge?: number;
	priority?: ExpoPushPriority;
	sound?: 'default' | null;
	/** Android notification channel; ignored on iOS. */
	channelId?: string;
}

export type ExpoPushResult =
	| { ok: true; ticketId: string | null }
	| {
			ok: false;
			error: string;
			/** Expo error code such as `DeviceNotRegistered`, `MessageTooBig`, `InvalidCredentials`. */
			code?: string;
			/** True when the install is gone and the subscription row should be deactivated. */
			deviceGone: boolean;
	  };

export interface SendExpoPushOptions {
	fetch?: typeof fetch;
	/** Expo access token (enhanced push security). Defaults to `process.env.EXPO_ACCESS_TOKEN`. */
	accessToken?: string;
	timeoutMs?: number;
}

const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Build the Expo message for a delivery, mirroring the payload the web-push branch sends so a
 * brief or any other event looks the same on the phone as in the browser.
 *
 * `unreadCount` becomes the iOS badge; `null` (count unavailable) falls back to 1 exactly like
 * the web-push `badge_count`.
 */
export function buildExpoMessage(
	delivery: NotificationDelivery,
	token: string,
	unreadCount: number | null
): ExpoPushMessage {
	return {
		token,
		title: delivery.payload.title,
		body: delivery.payload.body,
		badge: unreadCount ?? 1,
		sound: 'default',
		priority: delivery.payload.priority === 'urgent' ? 'high' : 'default',
		channelId: 'default',
		data: {
			url: delivery.payload.action_url,
			event_id: delivery.event_id,
			delivery_id: delivery.id,
			event_type: delivery.payload.event_type,
			...delivery.payload.data
		}
	};
}

interface ExpoTicketOk {
	status: 'ok';
	id?: string;
}

interface ExpoTicketError {
	status: 'error';
	message?: string;
	details?: { error?: string; [key: string]: unknown };
}

interface ExpoRequestError {
	code?: string;
	message?: string;
	details?: { error?: string; [key: string]: unknown };
}

interface ExpoSendResponse {
	data?: Array<ExpoTicketOk | ExpoTicketError>;
	errors?: ExpoRequestError[];
}

/** `details.error` from a ticket or request-level error, if Expo sent one. */
function readErrorCode(entry: unknown): string | undefined {
	if (!entry || typeof entry !== 'object') return undefined;
	const details = (entry as { details?: unknown }).details;
	if (!details || typeof details !== 'object') return undefined;
	const code = (details as { error?: unknown }).error;
	return typeof code === 'string' ? code : undefined;
}

/** True when any ticket or request-level error says the install is gone. */
function mentionsDeviceGone(body: ExpoSendResponse | null): boolean {
	if (!body) return false;
	const tickets = Array.isArray(body.data) ? body.data : [];
	const errors = Array.isArray(body.errors) ? body.errors : [];
	return (
		tickets.some((ticket) => readErrorCode(ticket) === DEVICE_NOT_REGISTERED) ||
		errors.some((entry) => readErrorCode(entry) === DEVICE_NOT_REGISTERED)
	);
}

async function readJson(response: Response): Promise<ExpoSendResponse | null> {
	try {
		const parsed: unknown = await response.json();
		return parsed && typeof parsed === 'object' ? (parsed as ExpoSendResponse) : null;
	} catch {
		return null;
	}
}

/**
 * Send one message through Expo's push API and interpret its ticket.
 */
export async function sendExpoPushNotification(
	message: ExpoPushMessage,
	options: SendExpoPushOptions = {}
): Promise<ExpoPushResult> {
	if (!isExpoPushToken(message.token)) {
		return {
			ok: false,
			error: 'Invalid Expo push token',
			code: 'InvalidToken',
			deviceGone: false
		};
	}

	const doFetch = options.fetch ?? globalThis.fetch;
	const accessToken = options.accessToken ?? process.env.EXPO_ACCESS_TOKEN;

	const headers: Record<string, string> = {
		accept: 'application/json',
		'content-type': 'application/json',
		'accept-encoding': 'gzip, deflate'
	};
	if (accessToken) {
		headers.authorization = `Bearer ${accessToken}`;
	}

	const payload = [
		{
			to: message.token,
			title: message.title,
			body: message.body,
			data: message.data ?? {},
			badge: message.badge,
			sound: message.sound === undefined ? 'default' : message.sound,
			priority: message.priority ?? 'default',
			channelId: message.channelId
		}
	];

	let response: Response;
	try {
		response = await doFetch(EXPO_PUSH_SEND_URL, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
		});
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : 'Expo push request failed',
			code: 'NetworkError',
			deviceGone: false
		};
	}

	const body = await readJson(response);

	if (!response.ok) {
		const firstError = body?.errors?.[0];
		return {
			ok: false,
			error: firstError?.message ?? `Expo push request failed with HTTP ${response.status}`,
			code: firstError?.code ?? `HTTP_${response.status}`,
			deviceGone: mentionsDeviceGone(body)
		};
	}

	const ticket = body?.data?.[0];
	if (!ticket) {
		const firstError = body?.errors?.[0];
		return {
			ok: false,
			error: firstError?.message ?? 'Expo push response contained no ticket',
			code: firstError?.code ?? 'NoTicket',
			deviceGone: mentionsDeviceGone(body)
		};
	}

	if (ticket.status === 'ok') {
		return { ok: true, ticketId: typeof ticket.id === 'string' ? ticket.id : null };
	}

	const code = readErrorCode(ticket);
	return {
		ok: false,
		error: ticket.message ?? 'Expo rejected the push message',
		code,
		deviceGone: code === DEVICE_NOT_REGISTERED
	};
}
