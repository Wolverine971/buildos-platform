// apps/mobile/src/app/(tabs)/(today)/index.tsx
import { BuildOsApiError } from '@buildos/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CaptureBar } from '@/components/capture-bar';
import { AccountKey, BoltSpinner, NavBar } from '@/components/kit';
import { PendingCaptures } from '@/components/pending-captures';
import { Screen } from '@/components/screen';
import {
	AllDaySection,
	AnytimeSection,
	buildAgenda,
	describeDegraded,
	EmptyDay,
	FollowReader,
	formatDay,
	groupTodayTasks,
	hasProjects,
	isClearDay,
	isDone,
	nextEntry,
	ScheduleSection,
	TodayHeader,
	TodayNotice,
	type UpNext,
	useNow,
	waitingProjects,
	WaitingSection,
	walkOrder
} from '@/components/today';
import { useTabStack } from '@/hooks/use-tab-stack';
import { api, unreachableMessage } from '@/lib/api';
import { civilDay } from '@/lib/due-date';
import { setReaderWalk } from '@/lib/reader-walk';
import { projectHref } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

/** A second tap this soon after the first opens nothing more (no stacked sheets or pushes). */
const TAP_GUARD_MS = 600;

/**
 * Today, the command center: the same feed the web's /today renders, through /api/today, laid
 * out like the website (schedule on a time rail, anytime tasks by bucket and project). Tap a
 * task to open it in the reader and walk the day with Prev and Next; capture is docked at the
 * bottom in thumb reach.
 */
export default function TodayScreen() {
	const { session } = useAuth();
	const tab = useTabStack();
	const nowMs = useNow();
	const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
	// The phone's day is part of the key, so a screen left open past midnight loads the new day.
	const day = civilDay(new Date(nowMs));

	const today = useQuery({
		queryKey: ['today', session?.user.id, timezone, day],
		queryFn: async () => (await api.today.get({ timezone })).feed,
		enabled: Boolean(session),
		placeholderData: keepPreviousData
	});
	const feed = today.data;
	const refetch = today.refetch;

	// Only a pull shows the bolt; background refreshes (after a capture sorts) stay quiet.
	const [pulling, setPulling] = useState(false);
	const onRefresh = useCallback(() => {
		setPulling(true);
		void refetch().finally(() => setPulling(false));
	}, [refetch]);
	const retry = useCallback(() => void refetch(), [refetch]);

	// The task last opened (and, via FollowReader, wherever Prev/Next walked it) gets the bar.
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const agenda = useMemo(() => (feed ? buildAgenda(feed) : null), [feed]);
	const groups = useMemo(() => (agenda ? groupTodayTasks(agenda.anytime) : []), [agenda]);
	const order = useMemo(() => (agenda ? walkOrder(agenda, groups) : []), [agenda, groups]);
	const workspaceIds = useMemo(
		() =>
			new Set(
				(feed?.projects ?? [])
					.filter((project) => project.kind === 'workspace')
					.map((project) => project.id)
			),
		[feed]
	);

	const lastTap = useRef(0);
	const guarded = useCallback((go: () => void) => {
		const at = Date.now();
		if (at - lastTap.current < TAP_GUARD_MS) return;
		lastTap.current = at;
		go();
	}, []);

	const openTask = useCallback(
		(taskId: string) =>
			guarded(() => {
				setSelectedId(taskId);
				// Prev/Next in the reader walk the day in the order it reads down this page.
				setReaderWalk({
					label: 'Today',
					items: order.map((id) => ({ kind: 'task' as const, id }))
				});
				router.push({ pathname: '/reader', params: { kind: 'task', id: taskId } });
			}),
		[guarded, order]
	);

	// Every sub-head pushes its project on Today's own stack, so back returns here with the tab
	// bar. The "Workspace" one opens the Workspace page (its loose tasks and docs) the same way,
	// leaving the Workspace tab as the user left it.
	const openProject = useCallback(
		(projectId: string) => guarded(() => router.push(projectHref(tab, projectId))),
		[guarded, tab]
	);

	const projectName = useCallback(
		(projectId: string | null) => {
			if (!projectId || !feed) return null;
			if (workspaceIds.has(projectId)) return 'Workspace';
			return feed.projectNames[projectId] ?? null;
		},
		[feed, workspaceIds]
	);
	const projectLabel = useCallback(
		(projectId: string, fallback: string) =>
			workspaceIds.has(projectId) ? 'Workspace' : fallback,
		[workspaceIds]
	);

	const next = agenda ? nextEntry(agenda.schedule, nowMs) : null;
	const nextTask = next?.task ?? null;
	const upNext: UpNext | null = next
		? {
				title: next.title,
				time: next.timeLabel,
				onPress: nextTask ? () => openTask(nextTask.id) : undefined
			}
		: null;

	const clear = feed && agenda ? isClearDay(feed, agenda) : false;
	const waiting = clear && feed && hasProjects(feed) ? waitingProjects(feed) : [];

	return (
		<>
			<FollowReader onTask={setSelectedId} />
			<Screen
				header={<NavBar right={<AccountKey />} />}
				footer={<CaptureBar inTabs />}
				refreshing={pulling}
				onRefresh={onRefresh}
				keyboardDismissMode="interactive"
			>
				<TodayHeader
					dateLabel={formatDay(feed?.date ?? day)}
					counts={
						feed
							? {
									events: feed.events.length,
									tasks: feed.tasks.filter((task) => !isDone(task)).length
								}
							: null
					}
					overdueCount={feed?.overdueCount ?? 0}
					upNext={upNext}
				/>

				<PendingCaptures />

				{today.isPending ? (
					<View style={styles.loading}>
						<BoltSpinner size={34} label="Loading your day" />
					</View>
				) : null}

				{today.isError ? (
					<TodayNotice
						tone="error"
						title={feed ? "Couldn't refresh your day" : "Couldn't load your day"}
						detail={describeError(today.error)}
						onRetry={retry}
						retrying={today.isFetching && !pulling}
					/>
				) : null}

				{feed && feed.degradedSections.length > 0 ? (
					<TodayNotice
						tone="warning"
						title="Some of your day couldn't be loaded."
						detail={describeDegraded(feed.degradedSections)}
						onRetry={retry}
						retrying={today.isFetching && !pulling}
					/>
				) : null}

				{agenda && agenda.allDay.length > 0 ? (
					<AllDaySection
						entries={agenda.allDay}
						projectName={projectName}
						selectedId={selectedId}
						onOpenTask={openTask}
					/>
				) : null}

				{feed && agenda && agenda.schedule.length > 0 ? (
					<ScheduleSection
						entries={agenda.schedule}
						nowMs={nowMs}
						timezone={feed.timezone}
						projectName={projectName}
						selectedId={selectedId}
						onOpenTask={openTask}
					/>
				) : null}

				{agenda && groups.length > 0 ? (
					<AnytimeSection
						groups={groups}
						count={agenda.anytime.length}
						projectLabel={projectLabel}
						selectedId={selectedId}
						onOpenTask={openTask}
						onOpenProject={openProject}
					/>
				) : null}

				{clear && feed ? (
					waiting.length > 0 ? (
						<WaitingSection projects={waiting} onOpenProject={openProject} />
					) : (
						<EmptyDay
							variant={hasProjects(feed) ? 'clear' : 'first_run'}
							overdueCount={feed.overdueCount}
						/>
					)
				) : null}
			</Screen>
		</>
	);
}

function describeError(error: unknown): string {
	if (error instanceof BuildOsApiError && error.isUnauthorized()) {
		return 'You are signed in, but BuildOS could not authorize this request. Try again shortly.';
	}
	if (error && typeof error === 'object' && 'isNetworkError' in error && error.isNetworkError) {
		return unreachableMessage('No connection. Your day will load when you are back online.');
	}
	return error instanceof Error ? error.message : 'Something went wrong.';
}

const styles = StyleSheet.create({
	loading: {
		flexGrow: 1,
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: 160,
		paddingVertical: 32
	}
});
