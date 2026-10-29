// apps/mobile/src/components/kit/nav-bar.tsx
// The top bar on the bench: the wordmark on tab roots, a back control on pushed screens, and
// square keys on the right. It also paints the status-bar area, so the bench runs to the top.
import { router } from 'expo-router';
import type { ReactNode, Ref } from 'react';
import {
	Animated,
	Easing,
	Pressable,
	type PressableInstance,
	type StyleProp,
	StyleSheet,
	Text,
	useAnimatedValue,
	View,
	type ViewStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInk, useReducedMotion } from '@/providers/theme-provider';

import { Bench } from './frame';
import { ChevronLeft, type Icon } from './icons';
import { type KeyHaptic, playHaptic } from './key';
import { hitSlopFor, KEY_PRESS, KEY_SPRING } from './math';
import { Wordmark } from './wordmark';

/** Height of the bar's row, not counting the status-bar area above it. */
export const NAV_BAR_HEIGHT = 54;
/** Nav keys are 38pt squares; hit slop grows them to 44. */
export const NAV_KEY_SIZE = 38;

export type NavBack = {
	/** Where back goes, e.g. "Workspace" or "Today". */
	label: string;
	/** Defaults to router.back(), or Today when there is nothing to go back to. */
	onPress?: () => void;
};

export type NavBarProps = {
	/** Pushed screens: a back control replaces the wordmark. */
	back?: NavBack;
	/** Keys on the right (NavKey, AccountKey). They sit 7pt apart. */
	right?: ReactNode;
	style?: StyleProp<ViewStyle>;
};

function goBack() {
	if (router.canGoBack()) router.back();
	else router.replace('/');
}

/** The bench bar at the top of every signed-in screen. */
export function NavBar({ back, right, style }: NavBarProps) {
	const { colors } = useInk();
	const insets = useSafeAreaInsets();

	return (
		<Bench
			style={[
				{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
				style
			]}
		>
			<View style={styles.row}>
				<View style={styles.left}>
					{back ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={back.label ? `Back to ${back.label}` : 'Back'}
							hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
							onPress={() => {
								playHaptic('selection');
								(back.onPress ?? goBack)();
							}}
							style={({ pressed }) => [styles.back, { opacity: pressed ? 0.55 : 1 }]}
						>
							<ChevronLeft size={22} strokeWidth={2.4} color={colors.foreground} />
							{back.label ? (
								<Text
									numberOfLines={1}
									maxFontSizeMultiplier={1.3}
									style={[styles.backLabel, { color: colors.foreground }]}
								>
									{back.label}
								</Text>
							) : null}
						</Pressable>
					) : (
						<Wordmark size={24} />
					)}
				</View>
				{right ? <View style={styles.right}>{right}</View> : null}
			</View>
		</Bench>
	);
}

export type NavKeyProps = {
	icon: Icon;
	onPress?: () => void;
	onLongPress?: () => void;
	accessibilityLabel: string;
	accessibilityHint?: string;
	disabled?: boolean;
	/** Default 'light' on press-in. */
	haptic?: KeyHaptic;
	style?: StyleProp<ViewStyle>;
	testID?: string;
	ref?: Ref<PressableInstance>;
};

/**
 * A 38pt square key for the nav bar: card face, hairline border, ink shadow. Pressing sinks it
 * 1pt and drops the shadow; release springs back like the other keys.
 */
export function NavKey({
	icon: IconGlyph,
	onPress,
	onLongPress,
	accessibilityLabel,
	accessibilityHint,
	disabled = false,
	haptic = 'light',
	style,
	testID,
	ref
}: NavKeyProps) {
	const ink = useInk();
	const { colors } = ink;
	const reduceMotion = useReducedMotion();
	const sink = useAnimatedValue(0);

	const down = () => {
		if (reduceMotion) return;
		sink.stopAnimation();
		Animated.timing(sink, {
			toValue: 1,
			duration: KEY_PRESS.duration,
			easing: Easing.out(Easing.quad),
			useNativeDriver: true
		}).start();
	};
	const up = () => {
		if (reduceMotion) return;
		Animated.spring(sink, { toValue: 0, ...KEY_SPRING, useNativeDriver: true }).start();
	};

	return (
		<Pressable
			ref={ref}
			testID={testID}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled }}
			disabled={disabled}
			hitSlop={hitSlopFor(NAV_KEY_SIZE, NAV_KEY_SIZE)}
			onPressIn={() => {
				playHaptic(haptic);
				down();
			}}
			onPressOut={up}
			onPress={onPress}
			onLongPress={onLongPress}
			style={[styles.keyBox, { opacity: disabled ? 0.5 : 1 }, style]}
		>
			{({ pressed }) => (
				<Animated.View
					style={[
						styles.keyFace,
						{
							backgroundColor: pressed ? colors.muted : colors.card,
							borderColor: colors.border,
							boxShadow: pressed
								? `inset 0 1px 0 ${ink.highlight}`
								: `inset 0 1px 0 ${ink.highlight}, ${ink.shadows.ink}`,
							transform: [{ translateY: sink }]
						}
					]}
				>
					<IconGlyph size={18} color={colors.foreground} strokeWidth={2} />
				</Animated.View>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		height: NAV_BAR_HEIGHT,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 8,
		paddingLeft: 14,
		paddingRight: 12
	},
	left: { flexShrink: 1, flexDirection: 'row', alignItems: 'center' },
	right: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
	// The chevron's ink starts ~8pt into its box; pull it left so it lines up with the content.
	back: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 2,
		minHeight: 44,
		marginLeft: -6,
		paddingRight: 6,
		flexShrink: 1
	},
	backLabel: { fontSize: 16, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
	keyBox: { width: NAV_KEY_SIZE, height: NAV_KEY_SIZE },
	keyFace: {
		flex: 1,
		borderRadius: 9,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center'
	}
});
