// apps/mobile/src/hooks/use-desktop.ts
import type { DesktopResponse } from '@buildos/api-client';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { buildFallbackDesktop, desktopFallbackReason, withParents } from '@/lib/desktop-fallback';
import { useAuth } from '@/providers/auth-provider';

/**
 * The Workspace tab's data: every project as a tile plus the Workspace's loose items, in one
 * request (GET /api/projects/desktop). Until the website ships that route, it falls back to
 * the project list and the Workspace's project read (see lib/desktop-fallback.ts).
 */

export function desktopQueryKey(userId: string | null) {
	return ['desktop', userId] as const;
}

/** After the route answers "missing", skip it this long; a web deploy shows up within minutes. */
const RECHECK_ROUTE_AFTER_MS = 10 * 60_000;
let routeMissingUntil = 0;

async function loadFallback(signal?: AbortSignal): Promise<DesktopResponse> {
	// The plain list has the Workspace row but no parents; the hierarchy read has parents but
	// drops the Workspace. Same projects otherwise, so ask for both at once. Nesting is extra:
	// without it the tiles are flat.
	const [{ projects }, hierarchy] = await Promise.all([
		api.projects.list({ limit: 100 }, { signal }),
		api.projects
			.list({ limit: 100, include: 'hierarchy' }, { signal })
			.then((response) => response.projects)
			.catch(() => [])
	]);
	const workspace = projects.find((project) => project.kind === 'workspace');
	const full = workspace
		? await api.projects
				.full(workspace.id, { profile: 'v2-initial' }, { signal })
				.catch(() => null)
		: null;
	return buildFallbackDesktop(withParents(projects, hierarchy), full);
}

export async function fetchDesktop(signal?: AbortSignal): Promise<DesktopResponse> {
	if (Date.now() >= routeMissingUntil) {
		try {
			return await api.projects.desktop({ signal });
		} catch (error) {
			const reason = desktopFallbackReason(error);
			if (!reason) throw error;
			if (reason === 'missing') routeMissingUntil = Date.now() + RECHECK_ROUTE_AFTER_MS;
		}
	}
	return loadFallback(signal);
}

function useUserId(): string | null {
	const { session } = useAuth();
	return session?.user.id ?? null;
}

export function useDesktop() {
	const userId = useUserId();
	return useQuery({
		queryKey: desktopQueryKey(userId),
		queryFn: ({ signal }) => fetchDesktop(signal),
		enabled: Boolean(userId)
	});
}

/**
 * Refetch the tiles and loose items (after a capture is sorted, a task changes, …). With no
 * user id, every account's desktop is marked stale. `refetch: false` only marks it stale, for
 * bursts of edits: the Workspace tab refetches stale data when it is focused again.
 */
export function invalidateDesktop(
	queryClient: QueryClient,
	userId: string | null | undefined,
	{ refetch = true }: { refetch?: boolean } = {}
): Promise<void> {
	return queryClient.invalidateQueries({
		queryKey: userId ? desktopQueryKey(userId) : ['desktop'],
		refetchType: refetch ? 'active' : 'none'
	});
}
