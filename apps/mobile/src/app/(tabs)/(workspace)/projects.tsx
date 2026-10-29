// apps/mobile/src/app/(tabs)/(workspace)/projects.tsx
// The Workspace tab, like the website's Workspace page: loose items (notes, docs and tasks that
// belong to no project yet) on top, then every project as a tile. One search box filters both;
// capture is docked at the bottom.
import {
	type DesktopProject,
	type DesktopResponse,
	isBuildOsApiError,
	type LooseItemSummary
} from '@buildos/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
	Animated,
	Keyboard,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	useAnimatedValue,
	View
} from 'react-native';

import { CaptureBar } from '@/components/capture-bar';
import {
	AccountKey,
	AlertTriangle,
	BoltSpinner,
	ChevronDown,
	ChevronRight,
	Key,
	MicroLabel,
	NavBar,
	PageTitle,
	playHaptic,
	Search,
	Stamp,
	X
} from '@/components/kit';
import { InlineAction, PendingCaptures } from '@/components/pending-captures';
import { Screen } from '@/components/screen';
import { LegendKey } from '@/components/workspace/legend';
import { TileGrid } from '@/components/workspace/tile-grid';
import { useDesktop } from '@/hooks/use-desktop';
import { useTabStack } from '@/hooks/use-tab-stack';
import { unreachableMessage } from '@/lib/api';
import { arrangeDesktop, type DesktopArrangement, type DesktopSort } from '@/lib/desktop';
import { type ReaderItem, setReaderWalk } from '@/lib/reader-walk';
import { OPEN_PROJECT_PARAM, projectHref } from '@/lib/routes';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { radius, typeScale, withAlpha } from '@/theme';

/** Loose rows shown before "Show all", so the tiles stay within a thumb's reach. */
const LOOSE_PAGE = 5;

const EMPTY_LOOSE =
	'Nothing loose. Capture a thought below; it waits here until it belongs somewhere.';

const LOOSE_KIND: Record<
	LooseItemSummary['kind'],
	{ stamp: string; label: string; reader: ReaderItem['kind'] }
> = {
	note: { stamp: 'NOTE', label: 'Note', reader: 'document' },
	doc: { stamp: 'DOC', label: 'Doc', reader: 'document' },
	task: { stamp: 'TASK', label: 'Task', reader: 'task' }
};

/**
 * Workspace: loose items, then project tiles (Recent, or grouped By activity). Tap a loose
 * item to read it and walk the rest with Prev/Next; tap a tile to open the project, or press
 * and hold it to peek (iOS).
 */
export default function WorkspaceScreen() {
	const desktop = useDesktop();
	const queryClient = useQueryClient();
	const [sort, setSort] = useState<DesktopSort>('recent');
	const [query, setQuery] = useState('');
	const search = useDeferredValue(query);
	const [pulling, setPulling] = useState(false);
	const { [OPEN_PROJECT_PARAM]: openId } = useLocalSearchParams<{ open?: string }>();
	const navigation = useNavigation<{ setParams(params: { open?: string }): void }>();

	// A project link that arrives while the app is running lands here with `?open=<id>`
	// (projectLinkPath), so the project is pushed over this grid, never left alone on the stack.
	// The param is cleared on this screen first, so the same link opened again pushes again.
	useEffect(() => {
		if (typeof openId !== 'string' || !openId) return;
		navigation.setParams({ [OPEN_PROJECT_PARAM]: undefined });
		router.push(projectHref('workspace', openId), { withAnchor: true });
	}, [navigation, openId]);

	// Back on this tab (or out of the reader): refresh stale tiles and loose items. A fetch
	// already running is reused, so the first load is not doubled.
	useFocusEffect(
		useCallback(() => {
			void queryClient.refetchQueries(
				{ queryKey: ['desktop'], type: 'active', stale: true },
				{ cancelRefetch: false }
			);
		}, [queryClient])
	);

	const { refetch } = desktop;
	// Our own flag, so a background refetch never pulls the bolt down by itself.
	const onRefresh = useCallback(() => {
		setPulling(true);
		void refetch().finally(() => setPulling(false));
	}, [refetch]);

	// Same elements every render: typing in search re-renders this screen, not the bars.
	const header = useMemo(() => <NavBar right={<AccountKey />} />, []);
	const footer = useMemo(() => <CaptureBar inTabs />, []);

	const data = desktop.data;
	return (
		<Screen
			header={header}
			footer={footer}
			refreshing={pulling}
			onRefresh={onRefresh}
			keyboardDismissMode="on-drag"
		>
			<PageTitle title="Workspace" />
			{data ? (
				<>
					{desktop.isError ? <StaleNote error={desktop.error} /> : null}
					<SearchField value={query} onChange={setQuery} />
					<PendingCaptures />
					<LooseSection
						workspace={data.workspace}
						workspaceId={
							data.workspace?.id ??
							data.projects.find((project) => project.kind === 'workspace')?.id ??
							null
						}
						search={search}
					/>
					<ProjectsSection
						projects={data.projects}
						search={search}
						sort={sort}
						onSort={setSort}
					/>
				</>
			) : desktop.isError ? (
				<LoadError
					error={desktop.error}
					retrying={desktop.isFetching}
					onRetry={() => void refetch()}
				/>
			) : (
				<View style={styles.loading}>
					<BoltSpinner size={32} label="Loading your Workspace" />
				</View>
			)}
		</Screen>
	);
}

// ---------------------------------------------------------------------------------------------
// Search

function SearchField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
	const ink = useInk();
	const { colors } = ink;
	const [focused, setFocused] = useState(false);

	return (
		<View
			style={[
				styles.search,
				{
					backgroundColor: colors.card,
					borderColor: focused ? withAlpha(colors.accent, 0.7) : colors.border,
					boxShadow: focused
						? `0 0 0 1px ${withAlpha(colors.accent, 0.3)}, ${ink.shadows.ink}`
						: ink.shadows.ink
				}
			]}
		>
			<Search size={16} color={colors.mutedForeground} strokeWidth={2} />
			<TextInput
				value={value}
				onChangeText={onChange}
				placeholder="Search your Workspace"
				placeholderTextColor={colors.mutedForeground}
				accessibilityRole="search"
				accessibilityLabel="Search your Workspace"
				accessibilityHint="Filters loose items and projects by name"
				returnKeyType="search"
				autoCapitalize="none"
				autoCorrect={false}
				spellCheck={false}
				keyboardAppearance={ink.dark ? 'dark' : 'light'}
				selectionColor={colors.accent}
				cursorColor={colors.accent}
				maxFontSizeMultiplier={1.4}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				style={[styles.searchInput, { color: colors.foreground }]}
			/>
			{value ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Clear search"
					hitSlop={13}
					onPress={() => onChange('')}
					style={({ pressed }) => [
						styles.clear,
						{ backgroundColor: withAlpha(colors.mutedForeground, pressed ? 0.85 : 0.6) }
					]}
				>
					<X size={12} color={colors.card} strokeWidth={3} />
				</Pressable>
			) : null}
		</View>
	);
}

// ---------------------------------------------------------------------------------------------
// Loose items

function LooseSection({
	workspace,
	workspaceId,
	search
}: {
	workspace: DesktopResponse['workspace'];
	workspaceId: string | null;
	search: string;
}) {
	const [showAll, setShowAll] = useState(false);
	const [lastOpened, setLastOpened] = useState<string | null>(null);
	const tab = useTabStack();
	const items = workspace?.items;
	const needle = search.trim().toLocaleLowerCase();

	// Search box, not a classifier: a plain substring match on title and excerpt (as the web).
	const shown = useMemo(
		() =>
			(items ?? []).filter(
				(item) =>
					!needle ||
					item.title.toLocaleLowerCase().includes(needle) ||
					(item.excerpt ?? '').toLocaleLowerCase().includes(needle)
			),
		[items, needle]
	);
	const visible = showAll || needle ? shown : shown.slice(0, LOOSE_PAGE);

	const open = useCallback(
		(item: LooseItemSummary) => {
			Keyboard.dismiss();
			setLastOpened(rowKey(item));
			// Prev/Next in the reader walk the loose items in the order shown here.
			setReaderWalk({ label: 'Workspace', items: shown.map(toReaderItem) });
			router.push({
				pathname: '/reader',
				params: { kind: LOOSE_KIND[item.kind].reader, id: item.id }
			});
		},
		[shown]
	);

	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<MicroLabel
					accessibilityRole="header"
					accessibilityLabel={items ? `Loose items, ${items.length}` : 'Loose items'}
				>
					{items ? `Loose · ${items.length}` : 'Loose'}
				</MicroLabel>
				{workspaceId ? (
					<InlineAction
						title="Open Workspace"
						accessibilityHint="Opens your Workspace with all its notes, docs and tasks"
						onPress={() => {
							Keyboard.dismiss();
							router.push(projectHref(tab, workspaceId));
						}}
					/>
				) : null}
			</View>

			{!items ? (
				<Line>Loose items could not load. Pull down to try again.</Line>
			) : items.length === 0 ? (
				<Line>{EMPTY_LOOSE}</Line>
			) : shown.length === 0 ? (
				<Line>No loose items match.</Line>
			) : (
				<View>
					{visible.map((item) => (
						<LooseRow
							key={rowKey(item)}
							item={item}
							selected={lastOpened === rowKey(item)}
							onOpen={open}
						/>
					))}
				</View>
			)}

			{!needle && shown.length > LOOSE_PAGE ? (
				<InlineAction
					title={showAll ? 'Show fewer' : `Show all ${shown.length}`}
					onPress={() => setShowAll((all) => !all)}
					style={styles.more}
				/>
			) : null}
		</View>
	);
}

/** A loose item as a plain row: title, when and excerpt, its kind stamped on the right. */
const LooseRow = memo(function LooseRow({
	item,
	selected,
	onOpen
}: {
	item: LooseItemSummary;
	/** Last one opened: the accent bar on the left. */
	selected: boolean;
	onOpen: (item: LooseItemSummary) => void;
}) {
	const { colors } = useInk();
	const kind = LOOSE_KIND[item.kind];
	const title = item.title.trim() || 'Untitled';
	const when = dayLabel(item.updated_at, new Date());
	const meta = [when, item.excerpt?.trim()].filter(Boolean).join(' · ');

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={[kind.label, title, when].filter(Boolean).join(', ')}
			accessibilityHint="Opens it in the reader"
			onPress={() => onOpen(item)}
			style={({ pressed }) => [
				styles.row,
				{
					borderLeftColor: selected ? colors.accent : 'transparent',
					backgroundColor: selected
						? withAlpha(colors.accent, pressed ? 0.1 : 0.06)
						: pressed
							? withAlpha(colors.foreground, 0.05)
							: 'transparent'
				}
			]}
		>
			<View style={styles.rowText}>
				<Text
					numberOfLines={2}
					maxFontSizeMultiplier={1.6}
					style={[typeScale.row, { color: colors.foreground }]}
				>
					{title}
				</Text>
				{meta ? (
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.6}
						style={[typeScale.meta, { color: colors.mutedForeground }]}
					>
						{meta}
					</Text>
				) : null}
			</View>
			<Stamp size={11} style={styles.rowStamp}>
				{kind.stamp}
			</Stamp>
		</Pressable>
	);
});

function rowKey(item: LooseItemSummary): string {
	return `${item.kind}:${item.id}`;
}

function toReaderItem(item: LooseItemSummary): ReaderItem {
	return { kind: LOOSE_KIND[item.kind].reader, id: item.id };
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", "Oct 28" (with the year when it isn't this one). */
function dayLabel(iso: string, now: Date): string | null {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
	if (days <= 0) return 'Today';
	if (days === 1) return 'Yesterday';
	return date.toLocaleDateString(
		undefined,
		date.getFullYear() === now.getFullYear()
			? { month: 'short', day: 'numeric' }
			: { month: 'short', day: 'numeric', year: 'numeric' }
	);
}

// ---------------------------------------------------------------------------------------------
// Projects

function ProjectsSection({
	projects,
	search,
	sort,
	onSort
}: {
	projects: DesktopResponse['projects'];
	search: string;
	sort: DesktopSort;
	onSort: (sort: DesktopSort) => void;
}) {
	const arrangement: DesktopArrangement = useMemo(
		() => arrangeDesktop(projects, { sort, query: search }),
		[projects, sort, search]
	);
	const empty = arrangement.total === 0;

	return (
		<View style={styles.projects}>
			<View style={styles.projectsHead}>
				<MicroLabel
					accessibilityRole="header"
					accessibilityLabel={empty ? 'Projects' : `Projects, ${arrangement.shown}`}
				>
					{empty ? 'Projects' : `Projects · ${arrangement.shown}`}
				</MicroLabel>
				{empty ? null : (
					<View style={styles.tools}>
						<SortSwitch value={sort} onChange={onSort} />
						<LegendKey />
					</View>
				)}
			</View>

			{empty ? (
				<Line>
					No projects yet. Capture a few thoughts below and BuildOS will suggest one.
				</Line>
			) : arrangement.shown === 0 ? (
				<Line>{`No projects match “${search.trim()}”.`}</Line>
			) : (
				arrangement.groups.map((group) =>
					sort === 'activity' ? (
						<View key={group.key} style={styles.group}>
							<MicroLabel
								accessibilityRole="header"
								accessibilityLabel={`${group.label}, ${group.projects.length}`}
							>
								{`${group.label} · ${group.projects.length}`}
							</MicroLabel>
							<TileGrid
								projects={group.projects}
								nestedCounts={arrangement.nestedCounts}
								parentNames={arrangement.parentNames}
								onOpen={dismissKeyboard}
							/>
						</View>
					) : (
						<TileGrid
							key={group.key}
							projects={group.projects}
							nestedCounts={arrangement.nestedCounts}
							parentNames={arrangement.parentNames}
							onOpen={dismissKeyboard}
						/>
					)
				)
			)}

			{arrangement.completed.length ? (
				<CompletedFold
					projects={arrangement.completed}
					nestedCounts={arrangement.nestedCounts}
				/>
			) : null}
		</View>
	);
}

/** Finished projects, folded away like the website's COMPLETED section. */
function CompletedFold({
	projects,
	nestedCounts
}: {
	projects: DesktopProject[];
	nestedCounts: Map<string, number>;
}) {
	const { colors } = useInk();
	const [open, setOpen] = useState(false);
	return (
		<View style={styles.group}>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				accessibilityLabel={`Completed, ${projects.length}`}
				hitSlop={10}
				onPress={() => {
					playHaptic('selection');
					setOpen((value) => !value);
				}}
				style={styles.foldHead}
			>
				{open ? (
					<ChevronDown size={14} color={colors.mutedForeground} strokeWidth={2.25} />
				) : (
					<ChevronRight size={14} color={colors.mutedForeground} strokeWidth={2.25} />
				)}
				<MicroLabel>{`Completed · ${projects.length}`}</MicroLabel>
			</Pressable>
			{open ? (
				<TileGrid
					projects={projects}
					nestedCounts={nestedCounts}
					parentNames={EMPTY_NAMES}
					onOpen={dismissKeyboard}
				/>
			) : null}
		</View>
	);
}

const EMPTY_NAMES = new Map<string, string>();

function dismissKeyboard() {
	Keyboard.dismiss();
}

// ---------------------------------------------------------------------------------------------
// Recent | By activity

const SORTS: readonly { value: DesktopSort; label: string; hint: string }[] = [
	{
		value: 'recent',
		label: 'Recent',
		hint: 'Shows the projects you worked on most recently first'
	},
	{ value: 'activity', label: 'By activity', hint: 'Groups projects by how active they are' }
];

const SEG = { pad: 2, padX: 10, height: 26, radius: 7 } as const;
// Near-critical: the thumb glides to the other segment without bouncing past it.
const THUMB_SPRING = { stiffness: 700, damping: 50, mass: 1 } as const;
// Segments are 26pt tall; this brings the target to 44.
const SEG_SLOP = { top: 9, bottom: 9, left: 2, right: 2 } as const;

/**
 * A small segmented control: muted track, card thumb that slides between equal segments,
 * selection haptic on change.
 */
function SortSwitch({
	value,
	onChange
}: {
	value: DesktopSort;
	onChange: (sort: DesktopSort) => void;
}) {
	const ink = useInk();
	const { colors } = ink;
	const reduceMotion = useReducedMotion();
	// Label widths, measured once laid out; segments match the wider one so the thumb only slides.
	const [labels, setLabels] = useState<readonly number[]>(() => SORTS.map(() => 0));
	const segment = labels.every((width) => width > 0)
		? Math.ceil(Math.max(...labels)) + 2 * SEG.padX
		: 0;
	const index = Math.max(
		0,
		SORTS.findIndex((sort) => sort.value === value)
	);
	const x = useAnimatedValue(0);
	const placed = useRef(false);

	useEffect(() => {
		if (!segment) return;
		const to = index * segment;
		if (!placed.current || reduceMotion) {
			placed.current = true;
			x.setValue(to);
			return;
		}
		Animated.spring(x, { toValue: to, ...THUMB_SPRING, useNativeDriver: true }).start();
	}, [index, segment, reduceMotion, x]);

	const measure = (i: number, width: number) =>
		setLabels((prev) => (prev[i] === width ? prev : prev.map((w, j) => (j === i ? width : w))));

	return (
		<View style={[styles.track, { backgroundColor: colors.muted }]}>
			{segment ? (
				<Animated.View
					style={[
						styles.thumb,
						{
							width: segment,
							backgroundColor: colors.card,
							boxShadow: `inset 0 1px 0 ${ink.highlight}, ${ink.shadows.ink}`,
							transform: [{ translateX: x }]
						}
					]}
				/>
			) : null}
			{SORTS.map((sort, i) => {
				const active = sort.value === value;
				return (
					<Pressable
						key={sort.value}
						accessibilityRole="button"
						accessibilityLabel={sort.label}
						accessibilityHint={sort.hint}
						accessibilityState={{ selected: active }}
						hitSlop={SEG_SLOP}
						onPress={() => {
							if (active) return;
							playHaptic('selection');
							onChange(sort.value);
						}}
						style={({ pressed }) => [
							styles.segment,
							segment
								? { minWidth: segment }
								: active
									? { backgroundColor: colors.card, boxShadow: ink.shadows.ink }
									: null,
							{ opacity: pressed && !active ? 0.6 : 1 }
						]}
					>
						<Text
							numberOfLines={1}
							maxFontSizeMultiplier={1.3}
							onLayout={(event) => measure(i, event.nativeEvent.layout.width)}
							style={[
								styles.segmentLabel,
								{ color: active ? colors.foreground : colors.mutedForeground }
							]}
						>
							{sort.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

// ---------------------------------------------------------------------------------------------
// States

function Line({ children }: { children: string }) {
	const { colors } = useInk();
	return (
		<Text maxFontSizeMultiplier={1.6} style={[styles.line, { color: colors.mutedForeground }]}>
			{children}
		</Text>
	);
}

function isOffline(error: unknown): boolean {
	return isBuildOsApiError(error) && error.isNetworkError;
}

function describeError(error: unknown): string {
	if (isOffline(error))
		return unreachableMessage(
			'No connection. Your Workspace will load when you are back online.'
		);
	if (isBuildOsApiError(error) && error.status === 401) {
		return 'You are signed in, but BuildOS could not authorize this request. Try again shortly.';
	}
	return error instanceof Error && error.message
		? error.message
		: 'Could not load your Workspace.';
}

/** First load failed: what went wrong and a Try again key. */
function LoadError({
	error,
	retrying,
	onRetry
}: {
	error: unknown;
	retrying: boolean;
	onRetry: () => void;
}) {
	const { colors } = useInk();
	return (
		<View style={styles.error}>
			<Text maxFontSizeMultiplier={1.6} style={[typeScale.row, { color: colors.foreground }]}>
				{describeError(error)}
			</Text>
			<Key title="Try again" size="sm" loading={retrying} onPress={onRetry} />
		</View>
	);
}

/** A refresh failed but an earlier copy is on screen. */
function StaleNote({ error }: { error: unknown }) {
	const { colors } = useInk();
	return (
		<View style={styles.stale} accessible accessibilityRole="text">
			<AlertTriangle size={14} color={colors.warning} strokeWidth={2.25} />
			<Text
				maxFontSizeMultiplier={1.6}
				style={[typeScale.meta, styles.staleText, { color: colors.mutedForeground }]}
			>
				{isOffline(error)
					? unreachableMessage('No connection. Showing what loaded last.')
					: 'Could not refresh. Showing what loaded last; pull down to try again.'}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	loading: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' },
	error: { gap: 12, alignItems: 'flex-start' },
	stale: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
	staleText: { flex: 1, marginTop: -1 },
	search: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 9,
		minHeight: 42,
		paddingLeft: 12,
		paddingRight: 12,
		borderRadius: radius.md,
		borderWidth: 1
	},
	searchInput: { flex: 1, minHeight: 40, paddingVertical: 9, fontSize: 15.5 },
	clear: {
		width: 18,
		height: 18,
		borderRadius: 9,
		alignItems: 'center',
		justifyContent: 'center'
	},
	section: { gap: 6 },
	sectionHead: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		minHeight: 24
	},
	line: { fontSize: 13.5, lineHeight: 19 },
	// The web's `.trow`: full-bleed press area, 2pt accent bar on the last one opened.
	row: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
		paddingVertical: 8,
		paddingLeft: 8,
		paddingRight: 10,
		marginHorizontal: -10,
		borderLeftWidth: 2
	},
	rowText: { flex: 1, gap: 2 },
	rowStamp: { marginTop: 3 },
	more: { alignSelf: 'flex-start' },
	projects: { gap: 10 },
	projectsHead: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'center',
		justifyContent: 'space-between',
		columnGap: 12,
		rowGap: 8,
		marginTop: 2
	},
	tools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	group: { gap: 2 },
	foldHead: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		minHeight: 36,
		alignSelf: 'flex-start'
	},
	track: { flexDirection: 'row', padding: SEG.pad, borderRadius: SEG.radius + SEG.pad },
	thumb: {
		position: 'absolute',
		top: SEG.pad,
		left: SEG.pad,
		height: SEG.height,
		borderRadius: SEG.radius,
		pointerEvents: 'none'
	},
	segment: {
		height: SEG.height,
		paddingHorizontal: SEG.padX,
		borderRadius: SEG.radius,
		alignItems: 'center',
		justifyContent: 'center'
	},
	segmentLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600' }
});
