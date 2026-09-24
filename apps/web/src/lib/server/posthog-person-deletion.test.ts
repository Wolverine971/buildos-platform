// apps/web/src/lib/server/posthog-person-deletion.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

import { deletePostHogPerson } from './posthog-person-deletion';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('deletePostHogPerson', () => {
	beforeEach(() => {
		for (const key of Object.keys(env)) delete env[key];
	});

	it('skips without calling PostHog when admin credentials are missing', async () => {
		const fetchImpl = vi.fn();
		env.PRIVATE_POSTHOG_PROJECT_ID = '123';

		await expect(deletePostHogPerson('user-1', fetchImpl)).resolves.toBe('skipped');
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('deletes the person, events and recordings by distinct id', async () => {
		env.PRIVATE_POSTHOG_PERSONAL_API_KEY = 'phx_secret';
		env.PRIVATE_POSTHOG_PROJECT_ID = '123';
		const fetchImpl = vi.fn(async () =>
			jsonResponse({ persons_found: 1, persons_deleted: 1, deletion_errors: [] })
		);

		await expect(deletePostHogPerson('user-1', fetchImpl)).resolves.toBe('deleted');

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://us.posthog.com/api/projects/123/persons/bulk_delete/');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer phx_secret');
		expect(JSON.parse(init.body as string)).toEqual({
			distinct_ids: ['user-1'],
			delete_events: true,
			delete_recordings: true
		});
	});

	it('uses the configured API host', async () => {
		env.PRIVATE_POSTHOG_PERSONAL_API_KEY = 'phx_secret';
		env.PRIVATE_POSTHOG_PROJECT_ID = '123';
		env.PRIVATE_POSTHOG_API_HOST = 'https://eu.posthog.com/';
		const fetchImpl = vi.fn(async () => jsonResponse({ persons_found: 1 }));

		await deletePostHogPerson('user-1', fetchImpl);

		expect(fetchImpl.mock.calls[0]?.[0]).toBe(
			'https://eu.posthog.com/api/projects/123/persons/bulk_delete/'
		);
	});

	it('reports a person PostHog never saw as not_found', async () => {
		env.PRIVATE_POSTHOG_PERSONAL_API_KEY = 'phx_secret';
		env.PRIVATE_POSTHOG_PROJECT_ID = '123';
		const fetchImpl = vi.fn(async () =>
			jsonResponse({ persons_found: 0, persons_deleted: 0, deletion_errors: [] })
		);

		await expect(deletePostHogPerson('user-1', fetchImpl)).resolves.toBe('not_found');
	});

	it('returns failed instead of throwing on HTTP errors, deletion errors and network errors', async () => {
		env.PRIVATE_POSTHOG_PERSONAL_API_KEY = 'phx_secret';
		env.PRIVATE_POSTHOG_PROJECT_ID = '123';
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			deletePostHogPerson(
				'user-1',
				vi.fn(async () => jsonResponse({ detail: 'nope' }, 403))
			)
		).resolves.toBe('failed');
		await expect(
			deletePostHogPerson(
				'user-1',
				vi.fn(async () =>
					jsonResponse({ persons_found: 1, deletion_errors: [{ id: 'x' }] })
				)
			)
		).resolves.toBe('failed');
		await expect(
			deletePostHogPerson(
				'user-1',
				vi.fn(async () => {
					throw new TypeError('fetch failed');
				})
			)
		).resolves.toBe('failed');

		expect(JSON.stringify(consoleError.mock.calls)).not.toContain('phx_secret');
		consoleError.mockRestore();
	});
});
