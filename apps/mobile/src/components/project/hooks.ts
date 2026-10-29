// apps/mobile/src/components/project/hooks.ts
import type { DesktopProject, ProjectFullResponse } from '@buildos/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useNavigation, useRoute } from 'expo-router';

import { desktopQueryKey, fetchDesktop } from '@/hooks/use-desktop';
import { useTabStack } from '@/hooks/use-tab-stack';
import { TAB_LABEL } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

import { backTarget, shortLabel } from './format';

/**
 * The Workspace tab's tiles (same cache entry as useDesktop()), read for the header's pulse
 * and emoji and the projects inside this one. Kept fresh for 5 minutes instead of 30s, so
 * opening one project after another doesn't refetch every tile; pull to refresh refetches it.
 */
export function useDesktopSnapshot() {
	const { session } = useAuth();
	const userId = session?.user.id ?? null;
	return useQuery({
		queryKey: desktopQueryKey(userId),
		queryFn: ({ signal }) => fetchDesktop(signal),
		enabled: Boolean(userId),
		staleTime: 5 * 60_000
	});
}

/**
 * The back control's label: the parent project's name for a sub-project, else the tab whose
 * stack this project is on ("Today" or "Workspace").
 */
export function useBackLabel(projects: readonly DesktopProject[] | undefined): string {
	const navigation = useNavigation();
	const route = useRoute();
	const tab = useTabStack();
	const queryClient = useQueryClient();
	const { session } = useAuth();
	// Re-render on focus: a screen preloaded by a link preview may be opened from elsewhere.
	useIsFocused();

	// The navigator here is this tab's stack, so whatever sits under the project is in it.
	const target = backTarget(navigation.getState(), route.key, tab);
	if (target.kind !== 'project') return TAB_LABEL[target.kind];

	const tile = projects?.find((project) => project.id === target.id);
	const cached = queryClient.getQueryData<ProjectFullResponse>([
		'project',
		session?.user.id ?? null,
		target.id
	]);
	if ((tile?.kind ?? cached?.project.kind) === 'workspace') return 'Workspace';
	const name = cached?.project.name ?? tile?.name;
	return name ? shortLabel(name) : 'Project';
}
