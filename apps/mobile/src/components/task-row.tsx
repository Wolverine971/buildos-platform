// apps/mobile/src/components/task-row.tsx
// The website's plain list row (TodayAgendaRow on a phone): text on the sheet, no card. The
// whole row opens the reader, which holds Mark done; a finished task stays on the list, struck
// through, until the list refreshes.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Check, CircleAlert, type Icon, playHaptic } from '@/components/kit';
import { useInk, useTheme } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

/** A plain row reaches this far left of the content edge, so its bar sits in the margin. */
export const ROW_BAR_INSET = 10;

/** The web row's in-progress and blocked marks, shown before the meta. */
export type TaskRowStatus = 'in_progress' | 'blocked';

const STATUS_LABEL: Record<TaskRowStatus, string> = {
	in_progress: 'In progress',
	blocked: 'Blocked'
};

export type TaskRowProps = {
	title: string;
	/** Second line, muted, one line (e.g. "Due 3:00 PM · BuildOS"). */
	meta?: string | null;
	/** Struck through and muted, with a small check. */
	done?: boolean;
	/** The row last opened: a 2pt accent bar on the left and a faint accent wash. */
	selected?: boolean;
	/** An event under way: accent bar and a "Now" mark on the meta line. */
	current?: boolean;
	/** A finished event: muted title. */
	past?: boolean;
	status?: TaskRowStatus | null;
	/** Small glyph before the title, e.g. Calendar on events. Done rows show the check instead. */
	icon?: Icon;
	/**
	 * Drawn left of the bar, outside the wash (the schedule's time rail). Rows with it start at
	 * the content edge instead of reaching into the margin.
	 */
	leading?: ReactNode;
	/** Without it the row is plain text, e.g. an event with no task. */
	onPress?: () => void;
	/** Default "Opens the task". */
	accessibilityHint?: string;
	testID?: string;
};

/** A task (or event) in a list: 15/500 title clamped to two lines, optional muted meta line. */
export function TaskRow({
	title,
	meta,
	done = false,
	selected = false,
	current = false,
	past = false,
	status,
	icon: Glyph,
	leading,
	onPress,
	accessibilityHint,
	testID
}: TaskRowProps) {
	const colors = useTheme();
	const marked = selected || current;
	const shownStatus = done ? null : status;
	const label = [
		title,
		done ? 'done' : null,
		current ? 'now' : null,
		shownStatus ? STATUS_LABEL[shownStatus] : null,
		meta
	]
		.filter(Boolean)
		.join(', ');

	const body = (pressed: boolean) => (
		<View
			style={[
				styles.body,
				{
					borderLeftColor: marked ? colors.accent : 'transparent',
					backgroundColor: pressed
						? marked
							? withAlpha(colors.accent, 0.12)
							: withAlpha(colors.muted, 0.7)
						: marked
							? withAlpha(colors.accent, 0.06)
							: 'transparent'
				}
			]}
		>
			<View style={styles.titleLine}>
				{done ? (
					<Check size={13} strokeWidth={2.75} color={colors.success} style={styles.glyph} />
				) : Glyph ? (
					<Glyph
						size={13}
						strokeWidth={2.25}
						color={current ? colors.accent : colors.mutedForeground}
						style={styles.glyph}
					/>
				) : null}
				<Text
					numberOfLines={2}
					maxFontSizeMultiplier={1.6}
					style={[
						typeScale.row,
						styles.title,
						{
							color: done || past ? colors.mutedForeground : colors.foreground,
							textDecorationLine: done ? 'line-through' : 'none'
						}
					]}
				>
					{title}
				</Text>
			</View>
			{current || shownStatus || meta ? (
				<MetaLine current={current} status={shownStatus ?? null} meta={meta ?? null} />
			) : null}
		</View>
	);

	if (!onPress) {
		return (
			<View
				accessible
				accessibilityLabel={label}
				testID={testID}
				style={[styles.row, !leading && styles.reach]}
			>
				{leading}
				{body(false)}
			</View>
		);
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityHint={accessibilityHint ?? 'Opens the task'}
			accessibilityState={{ selected }}
			testID={testID}
			onPress={() => {
				playHaptic('selection');
				onPress();
			}}
			style={[styles.row, !leading && styles.reach]}
		>
			{({ pressed }) => (
				<>
					{leading}
					{body(pressed)}
				</>
			)}
		</Pressable>
	);
}

function MetaLine({
	current,
	status,
	meta
}: {
	current: boolean;
	status: TaskRowStatus | null;
	meta: string | null;
}) {
	const { colors, warningText } = useInk();
	const mark = current ? (
		<View style={styles.mark}>
			<View style={[styles.dot, { backgroundColor: colors.accent }]} />
			<Text maxFontSizeMultiplier={1.6} style={[styles.metaText, styles.strong, { color: colors.accent }]}>
				Now
			</Text>
		</View>
	) : status === 'blocked' ? (
		<View style={styles.mark}>
			<CircleAlert size={12} strokeWidth={2.25} color={warningText} />
			<Text maxFontSizeMultiplier={1.6} style={[styles.metaText, styles.strong, { color: warningText }]}>
				Blocked
			</Text>
		</View>
	) : status === 'in_progress' ? (
		<Text maxFontSizeMultiplier={1.6} style={[styles.metaText, { color: colors.mutedForeground }]}>
			In progress
		</Text>
	) : null;

	return (
		<View style={styles.meta}>
			{mark}
			{mark && meta ? (
				<Text
					maxFontSizeMultiplier={1.6}
					style={[styles.metaText, { color: withAlpha(colors.mutedForeground, 0.5) }]}
				>
					·
				</Text>
			) : null}
			{meta ? (
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.6}
					style={[styles.metaText, styles.metaShrink, { color: colors.mutedForeground }]}
				>
					{meta}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'stretch', gap: 8, minHeight: 44 },
	reach: { marginLeft: -ROW_BAR_INSET },
	body: {
		flex: 1,
		minWidth: 0,
		justifyContent: 'center',
		borderLeftWidth: 2,
		paddingLeft: ROW_BAR_INSET - 2,
		paddingRight: 6,
		paddingVertical: 8,
		borderTopRightRadius: 6,
		borderBottomRightRadius: 6
	},
	titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
	// Centers a 13pt glyph on the title's first 20pt line.
	glyph: { marginTop: 3.5 },
	title: { flex: 1, flexShrink: 1 },
	meta: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'center',
		columnGap: 6,
		rowGap: 2,
		marginTop: 2
	},
	mark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	dot: { width: 6, height: 6, borderRadius: 3 },
	metaText: { ...typeScale.small },
	metaShrink: { flexShrink: 1 },
	strong: { fontWeight: '600' }
});
