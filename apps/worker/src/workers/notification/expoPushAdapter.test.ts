// apps/worker/src/workers/notification/expoPushAdapter.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDelivery } from '@buildos/shared-types';

import {
	EXPO_PUSH_SEND_URL,
	buildExpoMessage,
	isExpoPushToken,
	sendExpoPushNotification
} from './expoPushAdapter.js';

const TOKEN = 'ExponentPushToken[abcDEF123_-xyz]';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function mockFetch(body: unknown, status = 200) {
	return vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, status));
}

function baseMessage(overrides: Partial<Parameters<typeof sendExpoPushNotification>[0]> = {}) {
	return { token: TOKEN, title: 'Your brief is ready', body: '3 things today', ...overrides };
}

function makeDelivery(overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
	return {
		id: 'delivery-1',
		event_id: 'event-1',
		recipient_user_id: 'user-1',
		channel: 'push',
		channel_identifier: TOKEN,
		status: 'pending',
		attempts: 0,
		max_attempts: 3,
		created_at: '2026-10-28T12:00:00.000Z',
		updated_at: '2026-10-28T12:00:00.000Z',
		payload: {
			title: 'Your brief is ready',
			body: '3 things today',
			event_type: 'brief.completed',
			action_url: '/briefs/2026-10-28',
			data: { brief_id: 'brief-9' }
		},
		...overrides
	};
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('isExpoPushToken', () => {
	it.each([
		['ExponentPushToken[abc123]', true],
		['ExpoPushToken[abc-123_X]', true],
		['ExponentPushToken[]', false],
		['ExponentPushToken[abc 123]', false],
		['https://fcm.googleapis.com/fcm/send/abc', false],
		['', false],
		[42, false]
	])('%s → %s', (value, expected) => {
		expect(isExpoPushToken(value)).toBe(expected);
	});
});

describe('buildExpoMessage', () => {
	it('mirrors the web-push payload: title, body, data, badge from the unread count', () => {
		const message = buildExpoMessage(makeDelivery(), TOKEN, 4);

		expect(message).toEqual({
			token: TOKEN,
			title: 'Your brief is ready',
			body: '3 things today',
			badge: 4,
			sound: 'default',
			priority: 'default',
			channelId: 'default',
			data: {
				url: '/briefs/2026-10-28',
				event_id: 'event-1',
				delivery_id: 'delivery-1',
				event_type: 'brief.completed',
				brief_id: 'brief-9'
			}
		});
	});

	it('falls back to badge 1 when the unread count is unavailable', () => {
		expect(buildExpoMessage(makeDelivery(), TOKEN, null).badge).toBe(1);
	});

	it('sends urgent deliveries at high priority', () => {
		const delivery = makeDelivery();
		delivery.payload = { ...delivery.payload, priority: 'urgent' };
		expect(buildExpoMessage(delivery, TOKEN, 0).priority).toBe('high');
	});
});

describe('sendExpoPushNotification', () => {
	it('posts one message and returns the ticket id on an ok ticket', async () => {
		const fetchMock = mockFetch({ data: [{ status: 'ok', id: 'ticket-1' }] });

		const result = await sendExpoPushNotification(
			baseMessage({ data: { url: '/x' }, badge: 2, priority: 'high' }),
			{ fetch: fetchMock }
		);

		expect(result).toEqual({ ok: true, ticketId: 'ticket-1' });
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe(EXPO_PUSH_SEND_URL);
		expect(init?.method).toBe('POST');
		expect(init?.headers).toEqual({
			accept: 'application/json',
			'content-type': 'application/json',
			'accept-encoding': 'gzip, deflate'
		});
		expect(JSON.parse(String(init?.body))).toEqual([
			{
				to: TOKEN,
				title: 'Your brief is ready',
				body: '3 things today',
				data: { url: '/x' },
				badge: 2,
				sound: 'default',
				priority: 'high',
				channelId: undefined
			}
		]);
	});

	it('flags DeviceNotRegistered tickets as deviceGone', async () => {
		const fetchMock = mockFetch({
			data: [
				{
					status: 'error',
					message: 'The recipient device is not registered with FCM.',
					details: { error: 'DeviceNotRegistered' }
				}
			]
		});

		const result = await sendExpoPushNotification(baseMessage(), { fetch: fetchMock });

		expect(result).toEqual({
			ok: false,
			error: 'The recipient device is not registered with FCM.',
			code: 'DeviceNotRegistered',
			deviceGone: true
		});
	});

	it('flags an HTTP 400 that carries DeviceNotRegistered as deviceGone', async () => {
		const fetchMock = mockFetch(
			{
				errors: [
					{
						code: 'PUSH_TOO_MANY_EXPERIENCE_IDS',
						message: 'Device gone',
						details: { error: 'DeviceNotRegistered' }
					}
				]
			},
			400
		);

		const result = await sendExpoPushNotification(baseMessage(), { fetch: fetchMock });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.deviceGone).toBe(true);
			expect(result.code).toBe('PUSH_TOO_MANY_EXPERIENCE_IDS');
		}
	});

	it('returns ok:false without deviceGone on other ticket errors', async () => {
		const fetchMock = mockFetch({
			data: [
				{
					status: 'error',
					message: 'Message too big',
					details: { error: 'MessageTooBig' }
				}
			]
		});

		const result = await sendExpoPushNotification(baseMessage(), { fetch: fetchMock });

		expect(result).toEqual({
			ok: false,
			error: 'Message too big',
			code: 'MessageTooBig',
			deviceGone: false
		});
	});

	it('returns ok:false on a non-200 response', async () => {
		const fetchMock = mockFetch({ errors: [{ code: 'INTERNAL', message: 'boom' }] }, 500);

		const result = await sendExpoPushNotification(baseMessage(), { fetch: fetchMock });

		expect(result).toEqual({ ok: false, error: 'boom', code: 'INTERNAL', deviceGone: false });
	});

	it('returns ok:false on a non-200 response with a non-JSON body', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

		const result = await sendExpoPushNotification(baseMessage(), { fetch: fetchMock });

		expect(result).toEqual({
			ok: false,
			error: 'Expo push request failed with HTTP 502',
			code: 'HTTP_502',
			deviceGone: false
		});
	});

	it('returns ok:false when fetch itself fails', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNRESET'));

		const result = await sendExpoPushNotification(baseMessage(), { fetch: fetchMock });

		expect(result).toEqual({
			ok: false,
			error: 'ECONNRESET',
			code: 'NetworkError',
			deviceGone: false
		});
	});

	it('rejects a malformed token without calling Expo', async () => {
		const fetchMock = mockFetch({ data: [{ status: 'ok', id: 'never' }] });

		const result = await sendExpoPushNotification(
			baseMessage({ token: 'https://fcm.googleapis.com/fcm/send/abc' }),
			{ fetch: fetchMock }
		);

		expect(result).toEqual({
			ok: false,
			error: 'Invalid Expo push token',
			code: 'InvalidToken',
			deviceGone: false
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('adds the Authorization header only when EXPO_ACCESS_TOKEN is set', async () => {
		vi.stubEnv('EXPO_ACCESS_TOKEN', '');
		const withoutToken = mockFetch({ data: [{ status: 'ok', id: 't' }] });
		await sendExpoPushNotification(baseMessage(), { fetch: withoutToken });
		expect(withoutToken.mock.calls[0]![1]?.headers).not.toHaveProperty('authorization');

		vi.stubEnv('EXPO_ACCESS_TOKEN', 'expo-secret');
		const withToken = mockFetch({ data: [{ status: 'ok', id: 't' }] });
		await sendExpoPushNotification(baseMessage(), { fetch: withToken });
		expect(withToken.mock.calls[0]![1]?.headers).toMatchObject({
			authorization: 'Bearer expo-secret'
		});
	});

	it('prefers an explicit accessToken over the environment', async () => {
		vi.stubEnv('EXPO_ACCESS_TOKEN', 'env-secret');
		const fetchMock = mockFetch({ data: [{ status: 'ok', id: 't' }] });

		await sendExpoPushNotification(baseMessage(), {
			fetch: fetchMock,
			accessToken: 'explicit'
		});

		expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
			authorization: 'Bearer explicit'
		});
	});
});
