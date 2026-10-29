// apps/mobile/src/components/today/notices.tsx
// Today's notices (could not load, partly loaded) and its empty states.
import { StyleSheet, Text, View } from 'react-native';

import { AlertTriangle, CircleAlert, Key, Sun } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

/** A card with an icon, what went wrong, and a Try again key. */
export function TodayNotice({
	tone,
	title,
	detail,
	onRetry,
	retrying = false
}: {
	tone: 'error' | 'warning';
	title: string;
	detail?: string | null;
	onRetry: () => void;
	retrying?: boolean;
}) {
	const ink = useInk();
	const { colors } = ink;
	const color = tone === 'error' ? colors.destructive : colors.warning;
	const Glyph = tone === 'error' ? CircleAlert : AlertTriangle;

	return (
		<View
			style={[
				styles.notice,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<View style={[styles.noticeIcon, { backgroundColor: withAlpha(color, 0.12) }]}>
				<Glyph size={16} strokeWidth={2.25} color={color} />
			</View>
			<View
				accessible
				accessibilityLabel={detail ? `${title} ${detail}` : title}
				style={styles.noticeText}
			>
				<Text
					maxFontSizeMultiplier={1.6}
					style={[
						styles.noticeTitle,
						{ color: tone === 'error' ? colors.destructive : colors.foreground }
					]}
				>
					{title}
				</Text>
				{detail ? (
					<Text
						maxFontSizeMultiplier={1.6}
						style={[typeScale.meta, { color: colors.mutedForeground }]}
					>
						{detail}
					</Text>
				) : null}
			</View>
			<Key title="Try again" size="sm" loading={retrying} onPress={onRetry} />
		</View>
	);
}

/**
 * A day with nothing on it. `first_run`: no projects yet, so point at the capture box.
 * `clear`: projects exist but nothing is dated today and none has a next step.
 */
export function EmptyDay({
	variant,
	overdueCount = 0
}: {
	variant: 'first_run' | 'clear';
	overdueCount?: number;
}) {
	const ink = useInk();
	const { colors } = ink;
	const copy =
		variant === 'first_run'
			? {
					title: 'Your day starts here',
					body: 'Jot or say anything in the box below. It lands in your Workspace, and BuildOS sorts it for you.'
				}
			: overdueCount > 0
				? {
						title: 'Nothing due today',
						body: `Nothing is scheduled today. You have ${overdueCount} overdue ${overdueCount === 1 ? 'task' : 'tasks'}.`
					}
				: {
						title: 'Clear day ahead',
						body: "Nothing scheduled and no tasks due. Capture what's on your mind below."
					};

	return (
		<View
			accessible
			accessibilityLabel={`${copy.title}. ${copy.body}`}
			style={[
				styles.empty,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<View
				style={[
					styles.emptyIcon,
					{
						backgroundColor: withAlpha(colors.accent, 0.1),
						borderColor: withAlpha(colors.accent, 0.2)
					}
				]}
			>
				<Sun size={18} strokeWidth={2} color={colors.accent} />
			</View>
			<Text
				maxFontSizeMultiplier={1.6}
				style={[typeScale.section, styles.center, { color: colors.foreground }]}
			>
				{copy.title}
			</Text>
			<Text
				maxFontSizeMultiplier={1.6}
				style={[styles.emptyBody, styles.center, { color: colors.mutedForeground }]}
			>
				{copy.body}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	notice: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 12,
		borderRadius: 12,
		borderWidth: 1
	},
	noticeIcon: {
		width: 32,
		height: 32,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center'
	},
	noticeText: { flex: 1, minWidth: 0, gap: 2 },
	noticeTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
	empty: {
		alignItems: 'center',
		gap: 8,
		paddingVertical: 24,
		paddingHorizontal: 20,
		borderRadius: 12,
		borderWidth: 1,
		marginTop: 8
	},
	emptyIcon: {
		width: 40,
		height: 40,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 4
	},
	emptyBody: { fontSize: 13.5, lineHeight: 20, maxWidth: 300 },
	center: { textAlign: 'center' }
});
