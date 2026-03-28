// apps/web/src/lib/utils/error-observability.test.ts
import { describe, expect, it } from 'vitest';
import {
	getErrorStatus,
	isIgnorableProbePath,
	shouldDisplayPersistedErrorLog,
	shouldPersistGenericErrorEvent,
	shouldTrackFailedClientResponse,
	shouldTrackServerResponseFailure
} from './error-observability';

describe('error observability filters', () => {
	it('drops non-actionable client http failures', () => {
		expect(shouldTrackFailedClientResponse('/api/auth/login', 405)).toBe(false);
		expect(shouldTrackFailedClientResponse('/api/agent/v2/stream', 500)).toBe(true);
		expect(shouldTrackFailedClientResponse('/api/error-tracking/client', 500)).toBe(false);
	});

	it('drops non-actionable server response failures', () => {
		expect(shouldTrackServerResponseFailure('/api/auth/login', 405)).toBe(false);
		expect(shouldTrackServerResponseFailure('/api/agent/v2/stream', 500)).toBe(true);
		expect(shouldTrackServerResponseFailure('/admin/errors', 500)).toBe(false);
	});

	it('recognizes common scanner and platform probe paths', () => {
		expect(isIgnorableProbePath('/wp-admin/setup-config.php')).toBe(true);
		expect(isIgnorableProbePath('/wordpress/wp-admin/setup-config.php')).toBe(true);
		expect(isIgnorableProbePath('/.env')).toBe(true);
		expect(isIgnorableProbePath('/.well-known/assetlinks.json')).toBe(true);
		expect(isIgnorableProbePath('/brain-bolt-80.png')).toBe(false);
	});

	it('suppresses generic hook noise but keeps meaningful asset misses', () => {
		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.response_status',
				pathname: '/api/auth/login',
				status: 405
			})
		).toBe(false);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'client_fetch_http',
				pathname: '/api/agent/v2/stream',
				status: 404
			})
		).toBe(false);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.handle_error',
				pathname: '/wp-admin/setup-config.php',
				status: 404,
				routeId: null
			})
		).toBe(false);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.handle_error',
				pathname: '/totally-missing-page',
				status: 404,
				routeId: null
			})
		).toBe(false);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.handle_error',
				pathname: '/brain-bolt-80.png',
				status: 404,
				routeId: null
			})
		).toBe(true);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.handle_error',
				pathname: '/admin/errors',
				status: 500,
				routeId: '/admin/errors'
			})
		).toBe(true);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'auth.google.calendar_callback',
				pathname: '/auth/google/calendar-callback',
				status: 400
			})
		).toBe(true);
	});

	it('extracts status codes from framework and synthetic errors', () => {
		expect(getErrorStatus({ status: 404 })).toBe(404);
		expect(getErrorStatus(new Error('Request failed with status 405'))).toBe(405);
		expect(getErrorStatus(new Error('Not found: /wp-admin/setup-config.php'))).toBe(404);
	});

	it('hides historical noise from persisted admin error logs', () => {
		expect(
			shouldDisplayPersistedErrorLog({
				endpoint: '/wp-admin/setup-config.php',
				error_message: 'Not found: /wp-admin/setup-config.php',
				operation_type: 'hooks.handle_error',
				metadata: {
					routeId: null
				}
			})
		).toBe(false);

		expect(
			shouldDisplayPersistedErrorLog({
				endpoint: '/brain-bolt-80.png',
				error_message: 'Not found: /brain-bolt-80.png',
				operation_type: 'hooks.handle_error',
				metadata: {
					routeId: null
				}
			})
		).toBe(true);
	});
});
