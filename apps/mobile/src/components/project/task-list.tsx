// apps/mobile/src/components/project/task-list.tsx
// The project's tasks as one list, after the website's ReaderTaskList: groups in attention
// order under small uppercase heads with mono counts, Done folded away at the end.
import type { ProjectTask, ProjectTaskBucket, ProjectTasksCoverage } from '@buildos/api-client';
import { memo, useEffect, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, useAnimatedValue, View } from 'react-native';

import { ChevronRight, playHaptic } from '@/components/kit';
import type { TaskGroup } from '@/lib/task-buckets';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { fontFamily, typeScale } from '@/theme';

import { dueTone, shortDue, taskGlyph, taskRowLabel } from './format';
import { DateChip, Glyph, ListRow } from './rows';
import { ShowAll } from './show-all';

export type TaskListProps = {
	groups: readonly TaskGroup<ProjectTask>[];
	coverage: ProjectTasksCoverage | null | undefined;
	projectId: string | undefined;
	showDone: boolean;
	onToggleDone: () => void;
	/** Keep it stable (useCallback): rows are memoized and only redraw when it changes. */
	onOpen: (taskId: string) => void;
	now: Date;
};

export function TaskList({
	groups,
	coverage,
	projectId,
	showDone,
	onToggleDone,
	onOpen,
	now
}: TaskListProps) {
	const { colors } = useInk();

	if (groups.length === 0) {
		return (
			<Text
				maxFontSizeMultiplier={1.4}
				style={[styles.empty, { color: colors.mutedForeground }]}
			>
				No tasks yet.
			</Text>
		);
	}

	return (
		<View>
			{groups.map((group) => {
				const bucketCoverage = coverage?.buckets?.[group.bucket];
				const total = bucketCoverage?.total ?? group.tasks.length;
				const folded = group.bucket === 'done' && !showDone;
				return (
					<View key={group.bucket}>
						{group.bucket === 'done' ? (
							<FoldHead
								label={group.label}
								count={total}
								open={showDone}
								onToggle={onToggleDone}
							/>
						) : (
							<GroupHead label={group.label} count={total} />
						)}
						{folded
							? null
							: group.tasks.map((task) => (
									<TaskItem
										key={task.id}
										task={task}
										bucket={group.bucket}
										// A string, so a fresh `now` each render doesn't redraw the row.
										due={
											task.state_key === 'done' ? null : shortDue(task.due_at, now)
										}
										onOpen={onOpen}
									/>
								))}
						{!folded && bucketCoverage && !bucketCoverage.complete && projectId ? (
							<ShowAll projectId={projectId} bucket={group.bucket} total={total} />
						) : null}
					</View>
				);
			})}
		</View>
	);
}

/**
 * One task row. Memoized: after Show all a bucket can hold hundreds of rows, and a page
 * re-render (the reader opening or closing, an edit saved behind it) redraws only the rows
 * whose task changed. The task cache keeps unchanged task objects identical.
 */
const TaskItem = memo(function TaskItem({
	task,
	bucket,
	due,
	onOpen
}: {
	task: ProjectTask;
	bucket: ProjectTaskBucket;
	due: string | null;
	onOpen: (taskId: string) => void;
}) {
	const { colors } = useInk();
	const done = task.state_key === 'done';
	const glyph = taskGlyph(bucket, task.state_key);
	const title = task.title.trim() || 'Untitled task';
	return (
		<ListRow
			glyph={<Glyph shape={glyph.shape} tone={glyph.tone} />}
			title={title}
			titleStyle={
				done ? { color: colors.mutedForeground, textDecorationLine: 'line-through' } : null
			}
			trailing={due ? <DateChip label={due} tone={dueTone(bucket)} /> : null}
			onPress={() => onOpen(task.id)}
			accessibilityLabel={taskRowLabel(title, bucket, due)}
			accessibilityHint="Opens the task"
		/>
	);
});

function GroupHead({ label, count }: { label: string; count: number }) {
	const { colors } = useInk();
	return (
		<View
			style={styles.head}
			accessible
			accessibilityRole="header"
			accessibilityLabel={`${label}, ${count}`}
		>
			<Text
				maxFontSizeMultiplier={1.3}
				style={[typeScale.groupHead, { color: colors.mutedForeground }]}
			>
				{label}
			</Text>
			<Text
				maxFontSizeMultiplier={1.3}
				style={[styles.count, { color: colors.mutedForeground }]}
			>
				{count}
			</Text>
		</View>
	);
}

/** "› DONE 43": a head that opens and closes the done group. */
function FoldHead({
	label,
	count,
	open,
	onToggle
}: {
	label: string;
	count: number;
	open: boolean;
	onToggle: () => void;
}) {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const turn = useAnimatedValue(open ? 1 : 0);

	useEffect(() => {
		if (reduceMotion) {
			turn.setValue(open ? 1 : 0);
			return;
		}
		Animated.timing(turn, {
			toValue: open ? 1 : 0,
			duration: 160,
			useNativeDriver: true
		}).start();
	}, [open, reduceMotion, turn]);

	const rotate = useMemo(
		() => turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }),
		[turn]
	);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${label}, ${count}`}
			accessibilityHint={open ? 'Hides finished tasks' : 'Shows finished tasks'}
			accessibilityState={{ expanded: open }}
			onPress={() => {
				playHaptic('selection');
				onToggle();
			}}
			style={({ pressed }) => [styles.head, styles.fold, { opacity: pressed ? 0.6 : 1 }]}
		>
			<Animated.View style={{ transform: [{ rotate }] }}>
				<ChevronRight size={13} strokeWidth={2.4} color={colors.mutedForeground} />
			</Animated.View>
			<Text
				maxFontSizeMultiplier={1.3}
				style={[typeScale.groupHead, { color: colors.mutedForeground }]}
			>
				{label}
			</Text>
			<Text
				maxFontSizeMultiplier={1.3}
				style={[styles.count, { color: colors.mutedForeground }]}
			>
				{count}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	head: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 7,
		marginTop: 14,
		marginBottom: 4
	},
	// The fold head is a control: tall enough to hit, same baseline as the others.
	fold: { minHeight: 44, marginTop: 0, marginBottom: 0 },
	count: {
		fontFamily: fontFamily.mono,
		fontSize: 11.5,
		lineHeight: 14,
		fontVariant: ['tabular-nums']
	},
	empty: { fontSize: 13, lineHeight: 18, paddingVertical: 16 }
});
