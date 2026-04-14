// apps/web/src/lib/services/agentic-chat/tools/libri/client.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { resolveLibriResource } from './client';

function resetEnv(): void {
	delete mockEnv.LIBRI_INTEGRATION_ENABLED;
	delete mockEnv.LIBRI_API_BASE_URL;
	delete mockEnv.LIBRI_API_KEY;
	delete mockEnv.LIBRI_APP_BASE_URL;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json'
		}
	});
}

function configuredEnv() {
	return {
		LIBRI_INTEGRATION_ENABLED: 'true',
		LIBRI_API_BASE_URL: 'https://libri.example',
		LIBRI_API_KEY: 'libri-secret-key',
		LIBRI_APP_BASE_URL: 'https://app.libri.example'
	};
}

afterEach(() => {
	resetEnv();
	vi.restoreAllMocks();
});

describe('resolveLibriResource', () => {
	it('calls POST /api/v1/resolve and returns a found person result', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({
				status: 'found',
				resourceKey: 'person:james-clear',
				query: 'James Clear',
				results: [
					{
						type: 'person',
						id: 'people:123',
						title: 'James Clear',
						snippet: 'Author of Atomic Habits'
					}
				],
				job: null,
				message: 'Found existing Libri resource.'
			})
		) as unknown as typeof fetch;

		const result = await resolveLibriResource(
			{
				query: 'James Clear',
				project_id: 'project-1',
				reason: 'User asked BuildOS for information about James Clear'
			},
			{
				fetchFn,
				env: configuredEnv(),
				sessionId: 'session-1',
				now: () => new Date('2026-04-13T12:00:00.000Z')
			}
		);

		expect(result.status).toBe('found');
		expect(result.resourceKey).toBe('person:james-clear');
		expect(result.results).toHaveLength(1);
		expect(result.info).toEqual(
			expect.objectContaining({
				provider: 'libri',
				endpoint: 'POST /api/v1/resolve',
				response_depth: 'summary',
				types: ['person'],
				app_base_url: 'https://app.libri.example',
				fetched_at: '2026-04-13T12:00:00.000Z'
			})
		);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetchFn).mock.calls[0];
		expect(url).toBe('https://libri.example/api/v1/resolve');
		expect(init?.method).toBe('POST');
		expect((init?.headers as Record<string, string>).Authorization).toBe(
			'Bearer libri-secret-key'
		);
		expect((init?.headers as Record<string, string>)['Idempotency-Key']).toMatch(
			/^buildos-libri-resolve-[a-f0-9]{32}$/
		);
		expect(JSON.parse(String(init?.body))).toEqual({
			query: 'James Clear',
			types: ['person'],
			enqueueIfMissing: true,
			responseDepth: 'summary',
			source: {
				system: 'buildos',
				contextType: 'project',
				projectId: 'project-1',
				sessionId: 'session-1',
				reason: 'User asked BuildOS for information about James Clear'
			}
		});
	});

	it.each([
		[
			'queued',
			{
				jobId: 'job-queued',
				kind: 'person.discovery',
				status: 'queued'
			}
		],
		[
			'pending',
			{
				jobId: 'job-pending',
				kind: 'person.discovery',
				status: 'processing'
			}
		]
	] as const)('returns %s without polling or waiting for enrichment', async (status, job) => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({
				status,
				resourceKey: 'person:new-clear-person',
				query: 'New Clear Person',
				results: [],
				job,
				message:
					status === 'queued'
						? 'No existing Libri record was found, so enrichment was queued.'
						: 'Enrichment is already in progress.'
			})
		) as unknown as typeof fetch;

		const result = await resolveLibriResource(
			{
				query: 'New Clear Person'
			},
			{
				fetchFn,
				env: configuredEnv()
			}
		);

		expect(result.status).toBe(status);
		expect(result.job).toEqual(job);
		expect(result.results).toEqual([]);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('returns a structured configuration result when Libri env is missing', async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;

		const result = await resolveLibriResource(
			{
				query: 'James Clear'
			},
			{
				fetchFn,
				env: {
					LIBRI_INTEGRATION_ENABLED: 'true'
				}
			}
		);

		expect(result).toEqual({
			status: 'configuration_error',
			code: 'LIBRI_NOT_CONFIGURED',
			message: 'Libri is not configured for this BuildOS environment.',
			results: [],
			job: null
		});
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('returns a structured disabled result when the feature flag is off', async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;

		const result = await resolveLibriResource(
			{
				query: 'James Clear'
			},
			{
				fetchFn,
				env: {
					LIBRI_API_BASE_URL: 'https://libri.example',
					LIBRI_API_KEY: 'libri-secret-key'
				}
			}
		);

		expect(result).toEqual({
			status: 'configuration_error',
			code: 'LIBRI_DISABLED',
			message: 'Libri integration is disabled for this BuildOS environment.',
			results: [],
			job: null
		});
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('returns resolver_unavailable for a real Libri 404 without legacy fallback', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(
				{
					error: {
						code: 'NOT_FOUND',
						message: 'Not found'
					}
				},
				404
			)
		) as unknown as typeof fetch;

		const result = await resolveLibriResource(
			{
				query: 'James Clear'
			},
			{
				fetchFn,
				env: configuredEnv()
			}
		);

		expect(result.status).toBe('resolver_unavailable');
		expect(result.code).toBe('LIBRI_RESOLVER_UNAVAILABLE');
		expect(result.http_status).toBe(404);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(vi.mocked(fetchFn).mock.calls[0][0]).toBe('https://libri.example/api/v1/resolve');
	});

	it('redacts the configured API key from structured error results', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(
				{
					error: {
						code: 'INTERNAL_ERROR',
						message:
							'Upstream failed with token libri-secret-key and Authorization: Bearer libri-secret-key'
					}
				},
				500
			)
		) as unknown as typeof fetch;

		const result = await resolveLibriResource(
			{
				query: 'James Clear'
			},
			{
				fetchFn,
				env: configuredEnv()
			}
		);

		expect(result.status).toBe('error');
		expect(result.code).toBe('INTERNAL_ERROR');
		expect(JSON.stringify(result)).not.toContain('libri-secret-key');
		expect(result.message).toContain('[redacted]');
	});
});
