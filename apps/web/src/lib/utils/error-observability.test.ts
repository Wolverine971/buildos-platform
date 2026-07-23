// apps/web/src/lib/utils/error-observability.test.ts
import { describe, expect, it } from 'vitest';
import {
	getErrorStatus,
	isIgnorableProbePath,
	isPrivateConfigProbePath,
	isPurgeablePersistedErrorNoise,
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
		expect(isIgnorableProbePath('/.openai/config.json')).toBe(true);
		expect(isIgnorableProbePath('/.anthropic/config.json')).toBe(true);
		expect(isIgnorableProbePath('/.well-known/assetlinks.json')).toBe(true);
		expect(isIgnorableProbePath('/.well-known/traffic-advice')).toBe(true);
		expect(isIgnorableProbePath('/ads.txt')).toBe(true);
		expect(isIgnorableProbePath('/wp-json/gravitysmtp/v1/tests/mock-data')).toBe(true);
		expect(isIgnorableProbePath('/env.json')).toBe(true);
		expect(isIgnorableProbePath('/__env.js')).toBe(true);
		expect(isIgnorableProbePath('/runtime-config.js')).toBe(true);
		expect(isIgnorableProbePath('/__/firebase/init.json')).toBe(true);
		expect(isIgnorableProbePath('/firebase-config.json')).toBe(true);
		expect(isIgnorableProbePath('/api/openapi.json')).toBe(true);
		expect(isIgnorableProbePath('/swagger.json')).toBe(true);
		expect(isIgnorableProbePath('/.well-known/jwks.json')).toBe(true);
		expect(isIgnorableProbePath('/keys/service-account.json')).toBe(true);
		expect(isIgnorableProbePath('/serviceAccountKey.json')).toBe(true);
		expect(isIgnorableProbePath('/_next/static/buildManifest.js')).toBe(true);
		expect(isIgnorableProbePath('/_nuxt/builds/latest.json')).toBe(true);
		expect(isIgnorableProbePath('/manifest.webmanifest')).toBe(true);
		expect(isIgnorableProbePath('/feed.xml')).toBe(true);
		expect(isIgnorableProbePath('/sitemap_index.xml')).toBe(true);
		expect(isIgnorableProbePath('/rss/news.xml')).toBe(true);
		expect(isIgnorableProbePath('/meta.json')).toBe(true);
		expect(isIgnorableProbePath('/administrator/manifests/files/joomla.xml')).toBe(true);
		expect(isIgnorableProbePath('/language/en-GB/install.xml')).toBe(true);
		expect(isIgnorableProbePath('/media/system/js/core.js')).toBe(true);
		expect(isIgnorableProbePath('/.well-known/security.txt')).toBe(true);
		expect(isIgnorableProbePath('/humans.txt')).toBe(true);
		expect(isIgnorableProbePath('/security.txt')).toBe(true);
		expect(isIgnorableProbePath('/appsettings.Production.json')).toBe(true);
		expect(isIgnorableProbePath('/google_service_app.json')).toBe(true);
		expect(isIgnorableProbePath('/config/gcp-credentials.json')).toBe(true);
		expect(isIgnorableProbePath('/auth/service_key.json')).toBe(true);
		expect(isIgnorableProbePath('/secrets/gcp-key.json')).toBe(true);
		expect(isIgnorableProbePath('/google-application-credentials.json')).toBe(true);
		expect(isIgnorableProbePath('/serviceAccountCredentials.json')).toBe(true);
		expect(isIgnorableProbePath('/api/client_secret.json')).toBe(true);
		expect(isIgnorableProbePath('/sftp-config.json')).toBe(true);
		expect(isIgnorableProbePath('/.openclaw/agents/main/agent/models.json')).toBe(true);
		expect(isIgnorableProbePath('/brain-bolt-80.png')).toBe(false);
		expect(isIgnorableProbePath('/media/system/js/core.css')).toBe(false);
		expect(isIgnorableProbePath('/site.webmanifest')).toBe(false);
		expect(isIgnorableProbePath('/openapi.json')).toBe(false);
	});

	it('recognizes private config probe paths without treating normal assets as probes', () => {
		expect(isPrivateConfigProbePath('/.openai/config.json')).toBe(true);
		expect(isPrivateConfigProbePath('/.anthropic/config.json')).toBe(true);
		expect(isPrivateConfigProbePath('/.env.production.local')).toBe(true);
		expect(isPrivateConfigProbePath('/config.json')).toBe(true);
		expect(isPrivateConfigProbePath('/appsettings.Development.json')).toBe(true);
		expect(isPrivateConfigProbePath('/service-account-key.json')).toBe(true);
		expect(isPrivateConfigProbePath('/config/firebase_credentials.json')).toBe(true);
		expect(isPrivateConfigProbePath('/firebase-adminsdk.json')).toBe(true);
		expect(isPrivateConfigProbePath('/gcloud-service-key.json')).toBe(true);
		expect(isPrivateConfigProbePath('/api/client_secret.json')).toBe(true);
		expect(isPrivateConfigProbePath('/sftp-config.json')).toBe(true);
		expect(isPrivateConfigProbePath('/.openclaw/openclaw.json')).toBe(true);
		expect(isPrivateConfigProbePath('/%252fconfig/sendgrid.json')).toBe(true);
		expect(isPrivateConfigProbePath('/..%252fconfig%252fproduction.json')).toBe(true);
		expect(isPrivateConfigProbePath('/..%5capp%5cetc%5clocal.xml')).toBe(true);
		expect(isPrivateConfigProbePath('/%2fapp/etc/local.xml')).toBe(true);
		expect(isPrivateConfigProbePath('/openapi.json')).toBe(false);
		expect(isPrivateConfigProbePath('/brain-bolt-80.png')).toBe(false);
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
				operation: 'client_fetch_network',
				pathname: '/api/agent/v2/stream'
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
				pathname: '/.anthropic/config.json',
				status: 404,
				routeId: null
			})
		).toBe(false);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.handle_error',
				pathname: '/env.json',
				status: 404,
				routeId: null
			})
		).toBe(false);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.handle_error',
				pathname: '/_next/static/buildManifest.js',
				status: 404,
				routeId: null
			})
		).toBe(false);

		expect(
			shouldPersistGenericErrorEvent({
				operation: 'hooks.handle_error',
				pathname: '/appsettings.Production.json',
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
				endpoint: '/env.json',
				error_message: 'Not found: /env.json',
				operation_type: 'hooks.handle_error',
				metadata: {
					routeId: null
				}
			})
		).toBe(false);

		expect(
			shouldDisplayPersistedErrorLog({
				endpoint: null,
				error_message: 'Not found: /service-account-key.json',
				operation_type: 'hooks.handle_error',
				metadata: {
					routeId: null
				}
			})
		).toBe(false);

		expect(
			shouldDisplayPersistedErrorLog({
				endpoint: '/api/agent/v2/stream',
				error_message: 'Failed to fetch',
				operation_type: 'client_fetch_network',
				metadata: {
					reportKind: 'fetch_network'
				}
			})
		).toBe(false);

		expect(
			shouldDisplayPersistedErrorLog({
				environment: 'development',
				endpoint: '/api/onto/comments',
				error_message: 'Request failed with status 500',
				operation_type: 'client_fetch_http',
				metadata: {
					status: 500,
					clientUrl: 'http://127.0.0.1:5173/api/onto/comments?project_id=preview-project'
				}
			})
		).toBe(false);

		expect(
			shouldDisplayPersistedErrorLog({
				environment: 'production',
				endpoint: '/api/onto/comments',
				error_message: 'Request failed with status 500',
				operation_type: 'client_fetch_http',
				metadata: {
					status: 500,
					clientUrl: 'https://build-os.com/api/onto/comments'
				}
			})
		).toBe(true);

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

	it('marks scanner probe rows as purgeable without deleting normal asset misses', () => {
		expect(
			isPurgeablePersistedErrorNoise({
				endpoint: '/appsettings.Production.json',
				error_message: 'Not found: /appsettings.Production.json',
				operation_type: 'hooks.handle_error',
				metadata: { routeId: null }
			})
		).toBe(true);

		expect(
			isPurgeablePersistedErrorNoise({
				endpoint: null,
				error_message: 'Not found: /api/client_secret.json',
				operation_type: 'hooks.handle_error',
				metadata: { routeId: null }
			})
		).toBe(true);

		expect(
			isPurgeablePersistedErrorNoise({
				endpoint: '/api/agent/v2/stream',
				error_message: 'Failed to fetch',
				operation_type: 'client_fetch_network',
				metadata: { reportKind: 'fetch_network' }
			})
		).toBe(true);

		expect(
			isPurgeablePersistedErrorNoise({
				environment: 'development',
				endpoint: '/api/onto/comments',
				error_message: 'Request failed with status 500',
				operation_type: 'client_fetch_http',
				metadata: {
					status: 500,
					clientUrl: 'http://127.0.0.1:5173/api/onto/comments'
				}
			})
		).toBe(true);

		expect(
			isPurgeablePersistedErrorNoise({
				endpoint: '/brain-bolt-80.png',
				error_message: 'Not found: /brain-bolt-80.png',
				operation_type: 'hooks.handle_error',
				metadata: { routeId: null }
			})
		).toBe(false);
	});
});
