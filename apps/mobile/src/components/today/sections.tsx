// apps/mobile/src/components/today/sections.tsx
// Today's sections, matching the web's Today list (TodayAgendaRow, TodayTaskGroups): All day,
// Schedule with its time rail and "now" line, Anytime today grouped by bucket and project, and
// What's waiting for a day with nothing dated.
import type { TodayProject } from '@buildos/api-client';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Calendar, FolderKanban, MicroLabel, playHaptic, Stamp } from '@/components/kit';
import { type TaskRowStatus, ROW_BAR_INSET, TaskRow } from '@/components/task-row';
import { useInk, useTheme } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import {
	type AllDayEntry,
	formatClock,
	isCurrent,
	isDone,
	isPast,
	nowMarkerIndex,
	type ScheduleEntry,
	splitClock,
	type TodayTaskGroup
} from './agenda';

/** Width of the schedule's time rail. */
export const RAIL_WIDTH = 48;

type TaskLike = { state_key: string } | null | undefined;

/** The web row's marks: blocked always, in progress unless the group already says so. */
export function taskStatus(task: TaskLike, showProgress = true): TaskRowStatus | null {
	if (!task || isDone(task)) return null;
	if (task.state_key === 'blocked') return 'blocked';
	if (showProgress && task.state_key === 'in_progress') return 'in_progress';
	return null;
}

// ---------------------------------------------------------------------------------------------
// Heads

/** "Anytime today 7": 15/600 title with a mono count on the same baseline. */
export function SectionHead({
	title,
	count,
	style
}: {
	title: string;
	count?: number | null;
	style?: StyleProp<ViewStyle>;
}) {
	const colors = useTheme();
	return (
		<View
			accessible
			accessibilityRole="header"
			accessibilityLabel={count != null ? `${title}, ${count}` : title}
			style={[styles.sectionHead, style]}
		>
			<Text maxFontSizeMultiplier={1.4} style={[typeScale.section, { color: colors.foreground }]}>
				{title}
			</Text>
			{count != null ? <Stamp>{count}</Stamp> : null}
		</View>
	);
}

/** Bucket label over a hairline: DUE TODAY, STARTS TODAY, IN PROGRESS. */
function BucketLabel({ label }: { label: string }) {
	const colors = useTheme();
	return (
		<MicroLabel
			accessibilityRole="header"
			style={[styles.bucket, { borderBottomColor: withAlpha(colors.border, 0.7) }]}
		>
			{label}
		</MicroLabel>
	);
}

/** Folder glyph and an underlined project name; tap opens the project. */
export function ProjectSubHead({ name, onPress }: { name: string; onPress: () => void }) {
	const colors = useTheme();
	return (
		<Pressable
			accessibilityRole="link"
			accessibilityLabel={`Open project ${name}`}
			hitSlop={SUBHEAD_SLOP}
			onPress={() => {
				playHaptic('selection');
				onPress();
			}}
			style={styles.subHead}
		>
			{({ pressed }) => {
				const color = pressed ? colors.foreground : colors.mutedForeground;
				return (
					<>
						<FolderKanban size={13} strokeWidth={2} color={color} />
						<Text
							numberOfLines={1}
							maxFontSizeMultiplier={1.4}
							style={[
								typeScale.small,
								styles.subHeadName,
								{ color, textDecorationColor: colors.borderStrong }
							]}
						>
							{name}
						</Text>
					</>
				);
			}}
		</Pressable>
	);
}

// ---------------------------------------------------------------------------------------------
// Time rail

/** A rail time with its day period stacked under it, so "12:00 PM" fits 48pt. */
export function RailTime({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' }) {
	const colors = useTheme();
	const { time, period } = splitClock(label);
	const color = tone === 'accent' ? colors.accent : colors.mutedForeground;
	const weight = tone === 'accent' ? styles.strong : null;
	return (
		<View style={styles.railTime}>
			<Text
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={0.8}
				maxFontSizeMultiplier={1.2}
				style={[typeScale.stamp, styles.railClock, weight, { color }]}
			>
				{time}
			</Text>
			{period ? (
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.2}
					style={[typeScale.stamp, styles.railPeriod, weight, { color }]}
				>
					{period}
				</Text>
			) : null}
		</View>
	);
}

function Rail({ label, tone }: { label: string; tone: 'muted' | 'accent' }) {
	return (
		<View style={styles.rail}>
			<RailTime label={label} tone={tone} />
		</View>
	);
}

/**
 * The accent "now" line between schedule rows: the time on one compact line, then a rule with
 * a dot centered on the rows' accent bar. Decorative, like the web's.
 */
function NowLine({ label }: { label: string }) {
	const colors = useTheme();
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={styles.nowLine}
		>
			<Text
				numberOfLines={1}
				adjustsFontSizeToFit
				minimumFontScale={0.75}
				maxFontSizeMultiplier={1.2}
				style={[typeScale.stamp, styles.nowLabel, { color: colors.accent }]}
			>
				{label}
			</Text>
			<View style={styles.nowTrack}>
				<View style={[styles.nowRule, { backgroundColor: withAlpha(colors.accent, 0.4) }]} />
				<View style={[styles.nowDot, { backgroundColor: colors.accent }]} />
			</View>
		</View>
	);
}

// ---------------------------------------------------------------------------------------------
// Sections

type ProjectName = (projectId: string | null) => string | null;

/** All-day events as small pills; one linked to a task opens it. */
export function AllDaySection({
	entries,
	projectName,
	selectedId,
	onOpenTask
}: {
	entries: AllDayEntry[];
	projectName: ProjectName;
	selectedId: string | null;
	onOpenTask: (taskId: string) => void;
}) {
	const ink = useInk();
	const { colors } = ink;
	return (
		<View>
			<SectionHead title="All day" count={entries.length} />
			<View style={styles.pills}>
				{entries.map((entry) => {
					const project = projectName(entry.projectId);
					const task = entry.task;
					const selected = !!task && task.id === selectedId;
					const face = {
						backgroundColor: colors.card,
						borderColor: selected ? colors.accent : colors.border,
						boxShadow: ink.shadows.ink
					};
					const content = (
						<>
							<Calendar size={12} strokeWidth={2.25} color={colors.accent} />
							<Text
								numberOfLines={1}
								maxFontSizeMultiplier={1.4}
								style={[
									styles.pillText,
									styles.pillTitle,
									{
										color: isDone(task)
											? colors.mutedForeground
											: colors.foreground,
										textDecorationLine: isDone(task) ? 'line-through' : 'none'
									}
								]}
							>
								{entry.title}
							</Text>
							{project ? (
								<Text
									numberOfLines={1}
									maxFontSizeMultiplier={1.4}
									style={[
										styles.pillText,
										styles.pillProject,
										{ color: colors.mutedForeground }
									]}
								>
									· {project}
								</Text>
							) : null}
						</>
					);
					const a11y = [entry.title, 'all day', isDone(task) ? 'done' : null, project]
						.filter(Boolean)
						.join(', ');
					return task ? (
						<Pressable
							key={entry.key}
							accessibilityRole="button"
							accessibilityLabel={a11y}
							accessibilityHint="Opens the task"
							accessibilityState={{ selected }}
							hitSlop={PILL_SLOP}
							onPress={() => {
								playHaptic('selection');
								onOpenTask(task.id);
							}}
							style={({ pressed }) => [
								styles.pill,
								face,
								pressed && { backgroundColor: colors.muted }
							]}
						>
							{content}
						</Pressable>
					) : (
						<View
							key={entry.key}
							accessible
							accessibilityLabel={a11y}
							style={[styles.pill, face]}
						>
							{content}
						</View>
					);
				})}
			</View>
		</View>
	);
}

/** Timed events and tasks on a 48pt rail, with the accent "now" line where the time falls. */
export function ScheduleSection({
	entries,
	nowMs,
	timezone,
	projectName,
	selectedId,
	onOpenTask
}: {
	entries: ScheduleEntry[];
	nowMs: number;
	timezone: string;
	projectName: ProjectName;
	selectedId: string | null;
	onOpenTask: (taskId: string) => void;
}) {
	const colors = useTheme();
	const nowIndex = nowMarkerIndex(entries, nowMs);
	const nowLabel = formatClock(nowMs, timezone);

	return (
		<View>
			<SectionHead title="Schedule" count={entries.length} />
			<View style={[styles.scheduleList, { borderColor: withAlpha(colors.border, 0.7) }]}>
				{entries.map((entry, index) => {
					const task = entry.task;
					const current = isCurrent(entry, nowMs);
					const meta = [entry.metaLabel, projectName(entry.projectId)]
						.filter(Boolean)
						.join(' · ');
					return (
						<Fragment key={entry.key}>
							{index === nowIndex ? <NowLine label={nowLabel} /> : null}
							<TaskRow
								title={entry.title}
								meta={meta}
								done={isDone(task)}
								selected={!!task && task.id === selectedId}
								current={current}
								past={isPast(entry, nowMs)}
								status={taskStatus(task)}
								icon={entry.kind === 'event' ? Calendar : undefined}
								leading={
									<Rail label={entry.timeLabel} tone={current ? 'accent' : 'muted'} />
								}
								onPress={task ? () => onOpenTask(task.id) : undefined}
							/>
						</Fragment>
					);
				})}
				{nowIndex === entries.length ? <NowLine label={nowLabel} /> : null}
			</View>
		</View>
	);
}

/** Tasks with no set time: bucket labels over hairlines, project sub-heads, plain rows. */
export function AnytimeSection({
	groups,
	count,
	projectLabel,
	selectedId,
	onOpenTask,
	onOpenProject
}: {
	groups: TodayTaskGroup[];
	count: number;
	/** The sub-head's name (e.g. "Workspace" for loose tasks). */
	projectLabel: (projectId: string, fallback: string) => string;
	selectedId: string | null;
	onOpenTask: (taskId: string) => void;
	onOpenProject: (projectId: string) => void;
}) {
	return (
		<View>
			<SectionHead title="Anytime today" count={count} />
			{groups.map((bucket, index) => (
				<View key={bucket.key} style={index > 0 ? styles.bucketGap : null}>
					<BucketLabel label={bucket.label} />
					{bucket.projects.map((project) => (
						<View key={project.id}>
							<ProjectSubHead
								name={projectLabel(project.id, project.name)}
								onPress={() => onOpenProject(project.id)}
							/>
							{project.tasks.map((task) => (
								<TaskRow
									key={task.id}
									title={task.title}
									done={isDone(task)}
									selected={task.id === selectedId}
									status={taskStatus(task, bucket.key !== 'in_progress')}
									onPress={() => onOpenTask(task.id)}
								/>
							))}
						</View>
					))}
				</View>
			))}
		</View>
	);
}

/** A day with nothing dated: each active project's next move, tap to open the project. */
export function WaitingSection({
	projects,
	onOpenProject
}: {
	projects: TodayProject[];
	onOpenProject: (projectId: string) => void;
}) {
	const colors = useTheme();
	return (
		<View>
			<SectionHead title="Here's what's waiting" />
			{projects.map((project) => (
				<Pressable
					key={project.id}
					accessibilityRole="button"
					accessibilityLabel={`Next in ${project.name}: ${project.next_step_short ?? ''}`}
					accessibilityHint="Opens the project"
					onPress={() => {
						playHaptic('selection');
						onOpenProject(project.id);
					}}
					style={({ pressed }) => [
						styles.waiting,
						pressed && { backgroundColor: withAlpha(colors.muted, 0.7) }
					]}
				>
					<MicroLabel tone="accent" style={styles.waitingLabel}>
						Next
					</MicroLabel>
					<View style={styles.waitingText}>
						<Text
							maxFontSizeMultiplier={1.6}
							style={[styles.waitingStep, { color: colors.foreground }]}
						>
							{project.next_step_short}
						</Text>
						<Text
							numberOfLines={1}
							maxFontSizeMultiplier={1.6}
							style={[typeScale.small, { color: colors.mutedForeground }]}
						>
							{project.name}
						</Text>
					</View>
				</Pressable>
			))}
		</View>
	);
}

// The sub-head is ~28pt tall and as wide as its name; slop takes it to 44.
const SUBHEAD_SLOP = { top: 8, bottom: 8, left: 6, right: 12 } as const;
const PILL_SLOP = { top: 6, bottom: 6, left: 0, right: 0 } as const;

const styles = StyleSheet.create({
	sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginBottom: 6 },
	bucket: { paddingTop: 9, paddingBottom: 6, borderBottomWidth: 1, marginBottom: 4 },
	bucketGap: { marginTop: 8 },
	subHead: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		maxWidth: '100%',
		gap: 6,
		minHeight: 28,
		marginTop: 4
	},
	subHeadName: { flexShrink: 1, textDecorationLine: 'underline' },
	strong: { fontWeight: '600' },
	rail: { width: RAIL_WIDTH, paddingTop: 10 },
	railTime: { alignItems: 'flex-end' },
	railClock: { fontSize: 11.5, lineHeight: 15 },
	railPeriod: { fontSize: 9.5, lineHeight: 12, letterSpacing: 0.4 },
	scheduleList: { borderTopWidth: 1, borderBottomWidth: 1 },
	nowLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
	nowLabel: {
		width: RAIL_WIDTH,
		fontSize: 10,
		lineHeight: 13,
		fontWeight: '600',
		textAlign: 'right'
	},
	// Starts where the rows' 2pt bar does; the dot is centered on that bar.
	nowTrack: { flex: 1, height: 6, justifyContent: 'center' },
	nowRule: { height: 1 },
	nowDot: { position: 'absolute', left: -2, top: 0, width: 6, height: 6, borderRadius: 3 },
	pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	pill: {
		flexDirection: 'row',
		alignItems: 'center',
		maxWidth: '100%',
		gap: 6,
		minHeight: 32,
		paddingHorizontal: 10,
		borderRadius: 8,
		borderWidth: 1
	},
	pillText: { fontSize: 13, lineHeight: 17 },
	pillTitle: { flexShrink: 1, fontWeight: '500' },
	pillProject: { flexShrink: 2 },
	waiting: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 10,
		minHeight: 44,
		paddingVertical: 10,
		paddingLeft: ROW_BAR_INSET,
		paddingRight: 6,
		marginLeft: -ROW_BAR_INSET,
		borderRadius: 8
	},
	waitingLabel: { marginTop: 4 },
	waitingText: { flex: 1, minWidth: 0, gap: 2 },
	waitingStep: { fontSize: 15, lineHeight: 21 }
});
