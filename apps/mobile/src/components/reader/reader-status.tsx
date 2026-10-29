// apps/mobile/src/components/reader/reader-status.tsx
import { type ReactNode, useEffect } from 'react';
import {
	Animated,
	Easing,
	type StyleProp,
	StyleSheet,
	Text,
	useAnimatedValue,
	View,
	type ViewStyle
} from 'react-native';

import { AlertTriangle, BoltSpinner, CircleAlert, Info, Key } from '@/components/kit';
import { useAnnounce } from '@/hooks/use-announce';
import { spokenText } from '@/lib/announce';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { radius, spacing, typeScale, withAlpha } from '@/theme';

/** Content rises 6pt and fades in, like the website's reader body. Reduce Motion: no motion. */
export function Rise({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
	const reduceMotion = useReducedMotion();
	const progress = useAnimatedValue(reduceMotion ? 1 : 0);

	useEffect(() => {
		if (reduceMotion) {
			progress.setValue(1);
			return;
		}
		Animated.timing(progress, {
			toValue: 1,
			duration: 180,
			easing: Easing.out(Easing.quad),
			useNativeDriver: true
		}).start();
	}, [progress, reduceMotion]);

	return (
		<Animated.View
			style={[
				{
					opacity: progress,
					transform: [
						{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }
					]
				},
				style
			]}
		>
			{children}
		</Animated.View>
	);
}

/** The reader body before its item arrives: the bolt while loading, or the error and Try again. */
export function ReaderStatus({
	error,
	onRetry,
	label
}: {
	error: string | null;
	onRetry: () => void;
	/** What VoiceOver says while loading, e.g. "Loading the task". */
	label: string;
}) {
	const { colors } = useInk();
	useAnnounce(error);
	return (
		<View style={styles.status}>
			{error ? (
				<>
					<CircleAlert size={22} color={colors.destructive} strokeWidth={2} />
					<Text
						selectable
						maxFontSizeMultiplier={1.4}
						style={[typeScale.row, styles.center, { color: colors.foreground }]}
					>
						{error}
					</Text>
					<Key title="Try again" size="sm" variant="outline" onPress={onRetry} />
				</>
			) : (
				<BoltSpinner size={32} label={label} />
			)}
		</View>
	);
}

export type NoteTone = 'error' | 'warning' | 'info';

/** A short line pinned under the head: a failed save, or why something is read-only. */
export function ReaderNote({
	tone,
	children,
	action,
	style
}: {
	tone: NoteTone;
	children: ReactNode;
	/** A key under the text, e.g. "Load their version". */
	action?: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const { colors } = useInk();
	const color =
		tone === 'error'
			? colors.destructive
			: tone === 'warning'
				? colors.warning
				: colors.mutedForeground;
	const Glyph = tone === 'error' ? CircleAlert : tone === 'warning' ? AlertTriangle : Info;
	// The alert role is not spoken on iOS: say a failed save or a conflict out loud.
	useAnnounce(tone === 'info' ? null : spokenText(children));
	return (
		<View
			accessibilityRole={tone === 'info' ? undefined : 'alert'}
			style={[
				styles.note,
				{
					backgroundColor: tone === 'info' ? 'transparent' : colors.card,
					borderColor:
						tone === 'info'
							? colors.border
							: tone === 'warning'
								? colors.warning
								: withAlpha(color, 0.45)
				},
				style
			]}
		>
			<View style={styles.noteRow}>
				<Glyph size={15} color={color} strokeWidth={2} style={styles.noteIcon} />
				<Text
					selectable
					maxFontSizeMultiplier={1.4}
					style={[
						typeScale.meta,
						styles.noteText,
						{ color: tone === 'info' ? colors.mutedForeground : colors.foreground }
					]}
				>
					{children}
				</Text>
			</View>
			{action ? <View style={styles.noteAction}>{action}</View> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	status: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: spacing.xl,
		gap: spacing.md
	},
	center: { textAlign: 'center' },
	note: {
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: radius.md,
		paddingVertical: 10,
		paddingHorizontal: spacing.md
	},
	noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
	noteIcon: { marginTop: 1.5 },
	noteText: { flex: 1, minWidth: 0 },
	noteAction: { alignSelf: 'flex-start', paddingLeft: 23 }
});
