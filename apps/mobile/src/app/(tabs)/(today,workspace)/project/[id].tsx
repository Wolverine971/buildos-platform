// apps/mobile/src/app/(tabs)/(today,workspace)/project/[id].tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactElement, useCallback, useMemo, useRef, useState } from 'react';
import {
	ActionSheetIOS,
	Alert,
	Platform,
	type ScrollViewInstance,
	StyleSheet,
	Text,
	View
} from 'react-native';

import {
	BookOpen,
	BoltSpinner,
	CircleAlert,
	Ellipsis,
	Key,
	NavBar,
	NavKey
} from '@/components/kit';
import {
	DocList,
	headerTile,
	PAGE_INSET,
	ProjectHeader,
	shortLabel,
	TaskList,
	taskCounts,
	UnderlineTabs,
	useBackLabel,
	useDesktopSnapshot,
	webProjectUrl
} from '@/components/project';
import { Screen } from '@/components/screen';
import { useProject } from '@/hooks/use-entities';
import { nestedCounts } from '@/lib/desktop';
import { orderDocs } from '@/lib/doc-order';
import { config } from '@/lib/env';
import { type ReaderItem, setReaderWalk } from '@/lib/reader-walk';
import { groupTasks } from '@/lib/task-buckets';
import { useInk } from '@/providers/theme-provider';
import { typeScale } from '@/theme';

type Tab = 'tasks' | 'docs';

// The tabs are the scroll view's second child (after the header).
const STICKY_TABS = [1];

/**
 * A project: the website's header (tile, pulse, NEXT STEP, the projects inside it), then
 * underline tabs that stick under the nav bar. Tasks are grouped the way the website's board
 * groups them (overdue first, done folded away); docs follow the website's tree order. Anything
 * opens in the reader, and Prev/Next walk the list you opened it from.
 *
 * A shared route: it is pushed on the stack of the tab it was opened from (Today or Workspace),
 * so the tab bar stays under it and already clears the home indicator.
 */
export default function ProjectScreen() {
	const ink = useInk();
	const { colors } = ink;
	const { id } = useLocalSearchParams<{ id: string }>();
	const projectId = typeof id === 'string' ? id : undefined;
	const query = useProject(projectId);
	const desktop = useDesktopSnapshot();
	const data = query.data;
	const [tab, setTab] = useState<Tab>('tasks');
	const [showDone, setShowDone] = useState(false);
	const [pulling, setPulling] = useState(false);
	const [headerHeight, setHeaderHeight] = useState(0);
	const scrollRef = useRef<ScrollViewInstance | null>(null);
	const scrollY = useRef(0);
	const backLabel = useBackLabel(desktop.data?.projects);

	// This project's tile on the Workspace tab: pulse and emoji, and the header before the read.
	const entry = useMemo(
		() => desktop.data?.projects.find((project) => project.id === projectId),
		[desktop.data, projectId]
	);
	const isWorkspace = (data?.project.kind ?? entry?.kind) === 'workspace';
	const name = isWorkspace ? 'Workspace' : (data?.project.name ?? entry?.name ?? 'Project');
	const tile = useMemo(() => headerTile(data?.project, entry), [data?.project, entry]);
	const subProjects = useMemo(
		() =>
			projectId && desktop.data
				? desktop.data.projects.filter(
						(project) =>
							project.parent_project_id === projectId && project.kind !== 'workspace'
					)
				: [],
		[desktop.data, projectId]
	);
	const nested = useMemo(() => nestedCounts(desktop.data?.projects ?? []), [desktop.data]);

	const groups = useMemo(() => {
		if (!data) return [];
		const asOf = data.tasks_coverage?.as_of ? new Date(data.tasks_coverage.as_of) : new Date();
		return groupTasks(data.tasks, Number.isNaN(asOf.getTime()) ? new Date() : asOf);
	}, [data]);

	const docs = useMemo(() => {
		if (!data) return [];
		const contextId = data.context_document?.id;
		const ordered = orderDocs(
			data.documents.filter((doc) => doc.id !== contextId),
			data.project.doc_structure
		);
		return data.context_document
			? [{ doc: data.context_document, depth: 0 }, ...ordered]
			: ordered;
	}, [data]);

	const counts = data ? taskCounts(data.tasks_coverage, groups) : null;
	const nextStep = (data ? data.project.next_step_short : entry?.next_step_short)?.trim() || null;
	const description = data?.project.description?.trim() || null;
	const contextDoc = data?.context_document ?? null;
	const now = new Date();

	const visibleGroups = groups.filter((group) => group.bucket !== 'done' || showDone);
	const openItem = (items: ReaderItem[], item: ReaderItem) => {
		setReaderWalk({ label: shortLabel(name), items });
		router.push({ pathname: '/reader', params: { kind: item.kind, id: item.id } });
	};
	const taskItems = (): ReaderItem[] =>
		visibleGroups.flatMap((group) =>
			group.tasks.map((task) => ({ kind: 'task' as const, id: task.id }))
		);
	const docItems = (): ReaderItem[] =>
		docs.map(({ doc }) => ({ kind: 'document' as const, id: doc.id }));

	// Stable, so the memoized task rows skip a page re-render; reads this render's walk.
	const latest = useRef({ openItem, taskItems });
	latest.current = { openItem, taskItems };
	const openTask = useCallback(
		(taskId: string) =>
			latest.current.openItem(latest.current.taskItems(), { kind: 'task', id: taskId }),
		[]
	);

	const openStartHere = () => {
		if (!contextDoc) return;
		const item: ReaderItem = { kind: 'document', id: contextDoc.id };
		openItem([item], item);
	};

	const openOnWeb = () => {
		if (!projectId) return;
		void WebBrowser.openBrowserAsync(webProjectUrl(config.apiBaseUrl, projectId), {
			controlsColor: colors.accent,
			dismissButtonStyle: 'done'
		}).catch(() => {});
	};

	const showMore = () => {
		if (Platform.OS === 'ios') {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					title: name,
					options: ['Open on the web', 'Cancel'],
					cancelButtonIndex: 1,
					tintColor: colors.accent,
					userInterfaceStyle: ink.scheme
				},
				(index) => {
					if (index === 0) openOnWeb();
				}
			);
			return;
		}
		Alert.alert(name, undefined, [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Open on the web', onPress: openOnWeb }
		]);
	};

	// Pull to refresh reloads the project and its tile. Background refetches (after a reader
	// edit) stay quiet instead of holding the bolt open.
	const refresh = async () => {
		setPulling(true);
		try {
			await Promise.all([query.refetch(), desktop.refetch()]);
		} finally {
			setPulling(false);
		}
	};

	const changeTab = (next: Tab) => {
		setTab(next);
		// With the tabs stuck under the nav bar, start the other list at its top.
		if (headerHeight > 0 && scrollY.current > headerHeight) {
			scrollRef.current?.scrollTo({ y: headerHeight, animated: false });
		}
	};

	// Direct children of the scroll view, so the tabs (index 1) can stick under the nav bar.
	const content: ReactElement[] = [];
	if (data || entry) {
		content.push(
			<ProjectHeader
				key="head"
				name={name}
				tile={tile}
				pulse={isWorkspace ? null : (entry?.pulse ?? null)}
				pulseReason={entry?.pulse_reason}
				counts={counts}
				nextStep={nextStep}
				description={description}
				subProjects={subProjects}
				nestedCounts={nested}
				onHeight={setHeaderHeight}
			/>
		);
	}
	if (data) {
		content.push(
			<UnderlineTabs
				key="tabs"
				value={tab}
				onChange={changeTab}
				gridOffset={headerHeight % 12}
				options={[
					{ value: 'tasks', label: 'Tasks', count: counts?.total ?? data.tasks.length },
					{ value: 'docs', label: 'Docs', count: docs.length }
				]}
			/>,
			<View key="body" style={styles.body}>
				{query.isError ? (
					<View style={styles.stale}>
						<CircleAlert size={15} strokeWidth={2} color={colors.destructive} />
						<Text
							maxFontSizeMultiplier={1.4}
							style={[
								typeScale.meta,
								styles.staleText,
								{ color: colors.mutedForeground }
							]}
						>
							{"Couldn't refresh this project."}
						</Text>
						<Key title="Try again" size="xs" onPress={() => void query.refetch()} />
					</View>
				) : null}
				{tab === 'tasks' ? (
					<TaskList
						groups={groups}
						coverage={data.tasks_coverage}
						projectId={projectId}
						showDone={showDone}
						onToggleDone={() => setShowDone((open) => !open)}
						onOpen={openTask}
						now={now}
					/>
				) : (
					<DocList
						docs={docs}
						contextId={contextDoc?.id ?? null}
						onOpen={(documentId) =>
							openItem(docItems(), { kind: 'document', id: documentId })
						}
						now={now}
					/>
				)}
			</View>
		);
	} else if (query.isError || !projectId) {
		content.push(
			<View key="error" style={styles.center}>
				<CircleAlert size={24} strokeWidth={2} color={colors.destructive} />
				<Text
					selectable
					maxFontSizeMultiplier={1.4}
					style={[typeScale.row, styles.errorText, { color: colors.foreground }]}
				>
					{!projectId
						? 'This link is missing its project.'
						: query.error instanceof Error
							? query.error.message
							: 'Could not load this project.'}
				</Text>
				{projectId ? (
					<Key title="Try again" size="sm" onPress={() => void query.refetch()} />
				) : null}
			</View>
		);
	} else {
		content.push(
			<View key="loading" style={styles.center}>
				<BoltSpinner size={32} label="Loading the project" />
			</View>
		);
	}

	return (
		<>
			<Stack.Screen options={{ headerShown: false, title: name }} />
			<Screen
				ref={scrollRef}
				header={
					<NavBar
						back={{ label: backLabel }}
						right={
							<>
								{contextDoc ? (
									<NavKey
										icon={BookOpen}
										onPress={openStartHere}
										accessibilityLabel="Start here"
										accessibilityHint="Opens what BuildOS remembers about this project"
									/>
								) : null}
								<NavKey
									icon={Ellipsis}
									onPress={showMore}
									accessibilityLabel="More"
									accessibilityHint="Open this project on the web"
								/>
							</>
						}
					/>
				}
				refreshing={pulling}
				onRefresh={() => void refresh()}
				onScroll={(event) => {
					scrollY.current = event.nativeEvent.contentOffset.y;
				}}
				stickyHeaderIndices={data ? STICKY_TABS : undefined}
				contentContainerStyle={styles.content}
			>
				{content}
			</Screen>
		</>
	);
}

const styles = StyleSheet.create({
	// The header and tabs run edge to edge; the lists below carry their own inset.
	content: { padding: 0, gap: 0 },
	// The tab bar sits below the page, so the last row only needs breathing room.
	body: { paddingHorizontal: PAGE_INSET, paddingTop: 2, paddingBottom: 28 },
	center: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 14,
		paddingHorizontal: 24,
		paddingTop: 48,
		paddingBottom: 48
	},
	errorText: { textAlign: 'center' },
	stale: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingTop: 12
	},
	staleText: { flex: 1 }
});
