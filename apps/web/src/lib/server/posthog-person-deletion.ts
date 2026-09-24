// apps/web/src/lib/server/posthog-person-deletion.ts
import { env } from '$env/dynamic/private';

export type PostHogPersonDeletionStatus = 'deleted' | 'not_found' | 'skipped' | 'failed';

// The private API host, not the ingestion host in PUBLIC_POSTHOG_HOST.
const DEFAULT_POSTHOG_API_HOST = 'https://us.posthog.com';
const POSTHOG_DELETE_TIMEOUT_MS = 10_000;

type BulkDeleteResponse = {
	persons_found?: number;
	persons_deleted?: number;
	deletion_errors?: unknown[];
};

/**
 * Deletes the PostHog person identified by the BuildOS user id, with their
 * events and recordings. Never throws: the purge records the outcome and
 * continues. Without a personal API key and project id it returns 'skipped'.
 */
export async function deletePostHogPerson(
	userId: string,
	fetchImpl: typeof fetch = fetch
): Promise<PostHogPersonDeletionStatus> {
	const apiKey = env.PRIVATE_POSTHOG_PERSONAL_API_KEY?.trim();
	const projectId = env.PRIVATE_POSTHOG_PROJECT_ID?.trim();
	if (!apiKey || !projectId) return 'skipped';

	const host = (env.PRIVATE_POSTHOG_API_HOST?.trim() || DEFAULT_POSTHOG_API_HOST).replace(
		/\/+$/,
		''
	);

	try {
		const response = await fetchImpl(
			`${host}/api/projects/${encodeURIComponent(projectId)}/persons/bulk_delete/`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					distinct_ids: [userId],
					delete_events: true,
					delete_recordings: true
				}),
				signal: AbortSignal.timeout(POSTHOG_DELETE_TIMEOUT_MS)
			}
		);
		if (!response.ok) {
			console.error('PostHog person deletion failed with status', response.status);
			return 'failed';
		}

		const body = (await response.json().catch(() => null)) as BulkDeleteResponse | null;
		if (Array.isArray(body?.deletion_errors) && body.deletion_errors.length > 0)
			return 'failed';
		if (body?.persons_found === 0) return 'not_found';
		return 'deleted';
	} catch (error) {
		console.error(
			'PostHog person deletion failed:',
			error instanceof Error ? error.name : 'unknown_error'
		);
		return 'failed';
	}
}
