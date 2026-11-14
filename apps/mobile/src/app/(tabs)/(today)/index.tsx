// apps/mobile/src/app/(tabs)/(today)/index.tsx
import {
	BuildOsApiError,
	type TodayRepeatedSuggestion,
	type TodayWaitingItem,
	type TodayWaitingStatus
} from '@buildos/api-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BriefCard } from '@/components/brief';
import { CaptureBar } from '@/components/capture-bar';
import { ChatKey } from '@/components/chat/chat-key';
import { AccountKey, BoltSpinner, NavBar } from '@/components/kit';
import { PendingCaptures } from '@/components/pending-captures';
import { Screen } from '@/components/screen';
import {
	AllDaySection,
	AnytimeSection,
	buildAgenda,
	buildDayDraft,
	CLOSE_OUT_DRAFT,
	CloseOut,
	type CloseOutAnswer,
	CloseOutPrompt,
	type DaySeen,
	dueWeekday,
	MoreWaysIn,
	nudgeDraft,
	PickCard,
	pickTodayFocus,
	readDayFlag,
	type RepeatedChoice,
	RepeatedSuggestions,
	snoozeDueAt,
	summarizeDay,
	taskMeta,
	timeOfDay,
	type TodayPick,
	WaitingOnSection,
	writeDayFlag,
	describeDegraded,
	EmptyDay,
	FollowReader,
	formatDay,
	groupTodayTasks,
	hasProjects,
	isActiveFacing,
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
import { useUpdateTask } from '@/hooks/use-entities';
import { useTabStack } from '@/hooks/use-tab-stack';
import { type ChatTarget, GLOBAL_TARGET, targetParams } from '@/lib/chat/context';
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
		// The whole response: the feed plus `attention` (who's waiting, repeated suggestions).
		queryFn: () => api.today.get({ timezone }),
		enabled: Boolean(session),
		placeholderData: keepPreviousData
	});
	const feed = today.data?.feed;
	const attention = today.data?.attention ?? null;
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
	const feedTimezone = feed?.timezone ?? timezone;
	const metaOf = useCallback(
		(task: Parameters<typeof taskMeta>[0]) => taskMeta(task, feedTimezone),
		[feedTimezone]
	);

	// ----- The pick on top, who's waiting, the close-out (the web's Today, 2026-11-05) -----
	const updateTask = useUpdateTask();
	const date = feed?.date ?? day;
	const dayPart = timeOfDay(new Date(nowMs).getHours());

	// Asks marked done or removed here leave the picks at once; their rows stay with Undo.
	const [settledWaiting, setSettledWaiting] = useState<ReadonlySet<string>>(new Set());
	const allWaiting = useMemo(() => attention?.waiting ?? [], [attention]);
	const openWaitingItems = useMemo(
		() => allWaiting.filter((item) => !settledWaiting.has(item.id)),
		[allWaiting, settledWaiting]
	);
	const doneIds = useMemo(
		() => new Set((feed?.tasks ?? []).filter(isDone).map((task) => task.id)),
		[feed]
	);
	const picks = useMemo(
		() =>
			feed
				? pickTodayFocus({
						tasks: feed.tasks,
						waiting: openWaitingItems,
						doneIds,
						weekdayOf: (dueAt) => dueWeekday(dueAt, feed.timezone)
					})
				: [],
		[doneIds, feed, openWaitingItems]
	);
	const [lastPickDone, setLastPickDone] = useState<string | null>(null);

	const [sideways, setSidewaysState] = useState(() => readDayFlag(date, 'sideways'));
	const [closeHidden, setCloseHidden] = useState(() => readDayFlag(date, 'closeout-hidden'));
	const [closeOpen, setCloseOpen] = useState(false);
	const [closePicks, setClosePicks] = useState<TodayPick[]>([]);
	const [seen, setSeen] = useState<DaySeen | null>(null);
	// A new day (screen left open past midnight) starts with its own flags.
	useEffect(() => {
		setSidewaysState(readDayFlag(date, 'sideways'));
		setCloseHidden(readDayFlag(date, 'closeout-hidden'));
		setCloseOpen(false);
		setLastPickDone(null);
		setSettledWaiting(new Set());
	}, [date]);

	const setSideways = useCallback(
		(on: boolean) => {
			setSidewaysState(on);
			writeDayFlag(date, 'sideways', on);
		},
		[date]
	);

	const openChat = useCallback(
		(target: ChatTarget, draft?: string) =>
			guarded(() =>
				router.push({
					pathname: '/chat',
					params: { ...targetParams(target), from: 'Today', ...(draft ? { draft } : {}) }
				})
			),
		[guarded]
	);

	const setWaitingStatus = useCallback(
		async (item: TodayWaitingItem, status: TodayWaitingStatus): Promise<boolean> => {
			const mark = (settled: boolean) =>
				setSettledWaiting((current) => {
					const next = new Set(current);
					if (settled) next.add(item.id);
					else next.delete(item.id);
					return next;
				});
			mark(status !== 'open');
			try {
				await api.today.setWaitingStatus(item.id, status);
				return true;
			} catch {
				mark(status === 'open');
				return false;
			}
		},
		[]
	);

	const openWaiting = useCallback(
		(item: TodayWaitingItem) => {
			if (item.task_id) {
				const taskId = item.task_id;
				guarded(() => {
					setReaderWalk(null);
					router.push({ pathname: '/reader', params: { kind: 'task', id: taskId } });
				});
			} else if (item.project_id) {
				openProject(item.project_id);
			}
		},
		[guarded, openProject]
	);

	const nudgeWaiting = useCallback(
		(item: TodayWaitingItem) => {
			const project = item.project_id ? projectName(item.project_id) : null;
			const target: ChatTarget =
				item.project_id && project && project !== 'Workspace'
					? { type: 'project', projectId: item.project_id, projectName: project }
					: GLOBAL_TARGET;
			openChat(target, nudgeDraft(item));
		},
		[openChat, projectName]
	);

	const openPick = useCallback(
		(pick: TodayPick) => {
			if (pick.task) openTask(pick.task.id);
			else if (pick.waiting) openWaiting(pick.waiting);
		},
		[openTask, openWaiting]
	);

	const markDone = useCallback(
		async (taskId: string): Promise<boolean> => {
			try {
				await updateTask.mutateAsync({ taskId, patch: { state_key: 'done' } });
				return true;
			} catch {
				return false;
			}
		},
		[updateTask]
	);

	const completePick = useCallback(
		(pick: TodayPick) => {
			setLastPickDone(pick.title);
			if (pick.task && !doneIds.has(pick.task.id)) void markDone(pick.task.id);
			if (pick.waiting) void setWaitingStatus(pick.waiting, 'resolved');
		},
		[doneIds, markDone, setWaitingStatus]
	);

	const openCloseOut = useCallback(() => {
		setClosePicks((current) => (picks.length > 0 ? picks : current));
		setCloseOpen(true);
		setSeen(null);
		if (!feed) return;
		api.today
			.changes({ since: feed.dayStart })
			.then(({ feed: changes }) => setSeen(summarizeDay(changes.entries)))
			.catch(() => setSeen({ you: 0, agents: [] }));
	}, [feed, picks]);

	const hideCloseOut = useCallback(() => {
		setCloseOpen(false);
		setCloseHidden(true);
		writeDayFlag(date, 'closeout-hidden', true);
	}, [date]);

	const archiveTask = useCallback(async (taskId: string) => {
		try {
			await api.tasks.remove(taskId, { archive: true });
			return true;
		} catch {
			return false;
		}
	}, []);

	const applyCloseOut = useCallback(
		async (answers: { pick: TodayPick; answer: CloseOutAnswer }[]): Promise<number> => {
			let saved = 0;
			for (const { pick, answer } of answers) {
				let ok = false;
				if (answer === 'not_today') continue;
				if (answer === 'done') {
					if (pick.task) ok = doneIds.has(pick.task.id) || (await markDone(pick.task.id));
					if (pick.waiting) ok = (await setWaitingStatus(pick.waiting, 'resolved')) || ok;
				} else if (answer === 'progress') {
					if (pick.task) {
						try {
							await updateTask.mutateAsync({
								taskId: pick.task.id,
								patch: { state_key: 'in_progress' }
							});
							ok = true;
						} catch {
							ok = false;
						}
					}
				} else if (answer === 'let_go') {
					if (pick.task) ok = await archiveTask(pick.task.id);
					else if (pick.waiting) ok = await setWaitingStatus(pick.waiting, 'dismissed');
				}
				if (ok) saved += 1;
			}
			void refetch();
			return saved;
		},
		[archiveTask, doneIds, markDone, refetch, setWaitingStatus, updateTask]
	);

	const talkCloseOut = useCallback(() => openChat(GLOBAL_TARGET, CLOSE_OUT_DRAFT), [openChat]);

	const talkDay = useCallback(() => {
		if (!feed || !agenda) return openChat(GLOBAL_TARGET, 'Help me plan my day.');
		openChat(
			GLOBAL_TARGET,
			buildDayDraft({
				dateLabel: formatDay(feed.date),
				allDay: agenda.allDay,
				schedule: agenda.schedule,
				anytime: agenda.anytime,
				overdueCount: feed.overdueCount,
				projectName
			})
		);
	}, [agenda, feed, openChat, projectName]);

	const nextMoves = useMemo(
		() =>
			(feed?.projects ?? []).filter(
				(project) =>
					project.kind !== 'workspace' &&
					isActiveFacing(project.state_key) &&
					project.next_step_short
			),
		[feed]
	);

	const chooseRepeated = useCallback(
		async (item: TodayRepeatedSuggestion, choice: RepeatedChoice): Promise<boolean> => {
			try {
				if (choice === 'keep') await api.today.keepSuggestion(item.task_id);
				else if (choice === 'snooze')
					await updateTask.mutateAsync({
						taskId: item.task_id,
						patch: { due_at: snoozeDueAt(date) }
					});
				else await api.tasks.remove(item.task_id, { archive: true });
				return true;
			} catch {
				return false;
			}
		},
		[date, updateTask]
	);

	const undoRepeated = useCallback(
		async (item: TodayRepeatedSuggestion, choice: RepeatedChoice): Promise<boolean> => {
			try {
				if (choice === 'keep') await api.today.unkeepSuggestion(item.task_id);
				else if (choice === 'snooze')
					await updateTask.mutateAsync({
						taskId: item.task_id,
						patch: { due_at: item.due_at }
					});
				else await api.tasks.restore(item.task_id);
				return true;
			} catch {
				return false;
			}
		},
		[updateTask]
	);

	const planned = feed ? hasProjects(feed) : false;

	return (
		<>
			<FollowReader onTask={setSelectedId} />
			<Screen
				header={
					<NavBar
						right={
							<>
								<ChatKey target={GLOBAL_TARGET} from="Today" />
								<AccountKey />
							</>
						}
					/>
				}
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

				<BriefCard />

				<PendingCaptures />

				{planned && dayPart === 'evening' && !closeOpen && !closeHidden ? (
					<CloseOutPrompt onOpen={openCloseOut} onHide={hideCloseOut} />
				) : null}

				{planned && closeOpen ? (
					<CloseOut
						picks={closePicks}
						seen={seen}
						onApply={applyCloseOut}
						onTalk={talkCloseOut}
						onHide={hideCloseOut}
					/>
				) : null}

				{planned ? (
					<PickCard
						picks={picks}
						time={dayPart}
						sideways={sideways}
						lastDone={lastPickDone}
						onOpen={openPick}
						onDone={completePick}
						onSideways={() => setSideways(true)}
						onBack={() => setSideways(false)}
					/>
				) : null}

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
						metaOf={metaOf}
					/>
				) : null}

				{!sideways ? (
					<WaitingOnSection
						items={allWaiting}
						onOpen={openWaiting}
						onNudge={nudgeWaiting}
						onSetStatus={setWaitingStatus}
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

				{planned ? (
					<MoreWaysIn
						projects={nextMoves}
						showCloseOut={dayPart !== 'morning' && !closeOpen}
						onOpenProject={openProject}
						onTalk={talkDay}
						onCloseOut={openCloseOut}
					/>
				) : null}

				{planned ? (
					<RepeatedSuggestions
						items={attention?.repeated ?? []}
						onChoose={chooseRepeated}
						onUndo={undoRepeated}
					/>
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
