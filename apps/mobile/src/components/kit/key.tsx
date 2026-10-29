// apps/mobile/src/components/kit/key.tsx
// Raised BuildOS keys. A key sits on a 2pt lip (a darker edge of its own color); pressing drops
// the face onto the lip and releasing springs it back with a slight overshoot (the website's
// `.tx-button`). All motion is transforms on the native driver.
import * as Haptics from 'expo-haptics';
import { type Ref, useEffect } from 'react';
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

import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { lipOf, withAlpha } from '@/theme';

import { BoltSpinner } from './bolt';
import type { Icon } from './icons';
import { hitSlopFor, KEY_PRESS, KEY_SPRING, RING, ringScale } from './math';

export type KeyHaptic = 'light' | 'medium' | 'success' | 'selection' | false;

/** Fires one haptic; failures (simulator, no engine) are ignored. */
export function playHaptic(kind: KeyHaptic): void {
	if (!kind) return;
	const done =
		kind === 'success'
			? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
			: kind === 'selection'
				? Haptics.selectionAsync()
				: Haptics.impactAsync(
						kind === 'medium'
							? Haptics.ImpactFeedbackStyle.Medium
							: Haptics.ImpactFeedbackStyle.Light
					);
	void done.catch(() => {});
}

/** Press down fast, spring back with the website's overshoot. Reduce Motion: no bounce. */
function usePressMotion(rest: number, pressed: number) {
	const value = useAnimatedValue(rest);
	const reduceMotion = useReducedMotion();
	return {
		value,
		down() {
			value.stopAnimation();
			Animated.timing(value, {
				toValue: pressed,
				duration: reduceMotion ? 0 : KEY_PRESS.duration,
				easing: Easing.out(Easing.quad),
				useNativeDriver: true
			}).start();
		},
		up() {
			if (reduceMotion) {
				Animated.timing(value, { toValue: rest, duration: 0, useNativeDriver: true }).start();
				return;
			}
			Animated.spring(value, { toValue: rest, ...KEY_SPRING, useNativeDriver: true }).start();
		}
	};
}

// ---------------------------------------------------------------------------------------------
// Key

export type KeyVariant = 'primary' | 'outline' | 'ghost';
export type KeySize = 'xs' | 'sm' | 'md';

const METRICS = {
	// Fact-tag key in the reader (30pt face).
	xs: { height: 30, font: 13, icon: 14, padX: 9, gap: 5, radius: 7 },
	sm: { height: 40, font: 14, icon: 16, padX: 12, gap: 6, radius: 8 },
	md: { height: 48, font: 16, icon: 18, padX: 16, gap: 8, radius: 12 },
	// Icon over a small label: the reader's bottom action bar cells (54pt with the lip).
	stacked: { height: 52, font: 11.5, icon: 20, padX: 6, gap: 3, radius: 11 }
} as const;

type KeyLabel =
	| { title: string; icon?: Icon; accessibilityLabel?: string }
	| { title?: undefined; icon: Icon; accessibilityLabel: string };

export type KeyProps = KeyLabel & {
	/** Default 'outline'. */
	variant?: KeyVariant;
	/** Default 'md'. Ignored when `stacked`. */
	size?: KeySize;
	/** Icon above a small label, for bar cells. */
	stacked?: boolean;
	onPress?: () => void;
	onLongPress?: () => void;
	disabled?: boolean;
	/** Shows a bolt spinner in place of the content and blocks presses. */
	loading?: boolean;
	/** Default 'light' on press-in. 'success' fires when the press completes instead. */
	haptic?: KeyHaptic;
	accessibilityHint?: string;
	/** Overrides the size's corner radius. */
	radius?: number;
	/** Layout for the whole key (flex, width, margins). */
	style?: StyleProp<ViewStyle>;
	testID?: string;
	ref?: Ref<PressableInstance>;
};

/** A raised key: primary (accent), outline (card) or ghost (flat, muted text). */
export function Key({
	title,
	icon: IconGlyph,
	variant = 'outline',
	size = 'md',
	stacked = false,
	onPress,
	onLongPress,
	disabled = false,
	loading = false,
	haptic = 'light',
	accessibilityLabel,
	accessibilityHint,
	radius,
	style,
	testID,
	ref
}: KeyProps) {
	const ink = useInk();
	const { colors } = ink;
	const press = usePressMotion(0, KEY_PRESS.travel);
	const m = stacked ? METRICS.stacked : METRICS[size];
	const corner = radius ?? m.radius;
	const inactive = disabled || loading;
	const iconOnly = !title;

	const tone =
		variant === 'primary'
			? {
					face: colors.accent,
					border: colors.accent,
					text: colors.accentForeground,
					lip: lipOf(colors.accent),
					highlight: 'rgba(255, 255, 255, 0.3)'
				}
			: variant === 'outline'
				? {
						face: colors.card,
						border: colors.border,
						text: colors.foreground,
						lip: ink.lip,
						highlight: ink.dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.35)'
					}
				: {
						face: 'transparent',
						border: 'transparent',
						text: colors.mutedForeground,
						lip: 'transparent',
						highlight: null
					};
	const raised = variant !== 'ghost';
	const drop = ink.dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(24, 24, 27, 0.22)';

	const content = (
		<View style={[stacked ? styles.stack : styles.row, { gap: m.gap }]}>
			{IconGlyph ? <IconGlyph size={m.icon} color={tone.text} strokeWidth={2} /> : null}
			{title ? (
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.3}
					style={[styles.title, { fontSize: m.font, color: tone.text }]}
				>
					{title}
				</Text>
			) : null}
		</View>
	);

	return (
		<Pressable
			ref={ref}
			testID={testID}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? title}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled: inactive, busy: loading }}
			disabled={inactive}
			hitSlop={hitSlopFor(iconOnly && !stacked ? m.height : 44, m.height + KEY_PRESS.travel)}
			onPressIn={() => {
				if (haptic !== 'success') playHaptic(haptic);
				press.down();
			}}
			onPressOut={press.up}
			onPress={() => {
				if (haptic === 'success') playHaptic('success');
				onPress?.();
			}}
			onLongPress={onLongPress}
			style={[styles.key, { opacity: disabled ? 0.5 : 1 }, style]}
		>
			{({ pressed }) => (
				<>
					<View
						style={[
							styles.lip,
							{
								borderRadius: corner,
								backgroundColor: tone.lip,
								boxShadow: raised ? `0 3px 6px -2px ${drop}` : undefined
							}
						]}
					/>
					<Animated.View
						style={[
							styles.face,
							{
								minHeight: m.height,
								minWidth: iconOnly && !stacked ? m.height : undefined,
								paddingHorizontal: iconOnly && !stacked ? 0 : m.padX,
								borderRadius: corner,
								backgroundColor:
									!raised && pressed ? withAlpha(colors.muted, 0.7) : tone.face,
								borderColor: tone.border,
								boxShadow: tone.highlight ? `inset 0 1px 0 ${tone.highlight}` : undefined,
								transform: [{ translateY: press.value }]
							}
						]}
					>
						<View style={loading ? styles.hidden : null}>{content}</View>
						{loading ? (
							<View style={styles.spinner}>
								<BoltSpinner
									size={Math.round(m.icon * 1.15)}
									color={variant === 'primary' ? colors.accentForeground : colors.accent}
									label="Working"
								/>
							</View>
						) : null}
					</Animated.View>
				</>
			)}
		</Pressable>
	);
}

// ---------------------------------------------------------------------------------------------
// RoundKey

export type RoundKeyTone = 'accent' | 'outline' | 'danger' | 'muted';

export type RoundKeyProps = {
	icon: Icon;
	/** Default 'outline'. accent = Send with text, outline = Mic, danger = recording, muted = idle. */
	tone?: RoundKeyTone;
	/** Default 44. */
	size?: number;
	iconSize?: number;
	onPress?: () => void;
	onLongPress?: () => void;
	disabled?: boolean;
	accessibilityLabel: string;
	accessibilityHint?: string;
	/** Live voice level 0–1: draws a destructive halo whose spread grows with the level. */
	ring?: number;
	/** Default 'light' on press-in. */
	haptic?: KeyHaptic;
	style?: StyleProp<ViewStyle>;
	testID?: string;
	ref?: Ref<PressableInstance>;
};

/** A round key for the capture box: Send, Mic, Stop. */
export function RoundKey({
	icon: IconGlyph,
	tone = 'outline',
	size = 44,
	iconSize,
	onPress,
	onLongPress,
	disabled = false,
	accessibilityLabel,
	accessibilityHint,
	ring,
	haptic = 'light',
	style,
	testID,
	ref
}: RoundKeyProps) {
	const ink = useInk();
	const { colors } = ink;
	const reduceMotion = useReducedMotion();
	const press = usePressMotion(1, reduceMotion ? 1 : 0.92);
	const halo = useAnimatedValue(ringScale(ring ?? 0, size));
	const showRing = ring !== undefined;

	useEffect(() => {
		if (ring === undefined) return;
		Animated.timing(halo, {
			toValue: ringScale(ring, size),
			duration: 90,
			easing: Easing.out(Easing.quad),
			useNativeDriver: true
		}).start();
	}, [halo, ring, size]);

	const palette = {
		accent: { face: colors.accent, border: colors.accent, glyph: colors.accentForeground },
		outline: {
			face: colors.card,
			border: withAlpha(colors.foreground, 0.22),
			glyph: colors.foreground
		},
		danger: {
			face: colors.destructive,
			border: colors.destructive,
			glyph: colors.destructiveForeground
		},
		muted: { face: colors.muted, border: colors.border, glyph: colors.mutedForeground }
	}[tone];
	const haloSize = size + 2 * RING.max;

	return (
		<Pressable
			ref={ref}
			testID={testID}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled }}
			disabled={disabled}
			hitSlop={hitSlopFor(size, size)}
			onPressIn={() => {
				playHaptic(haptic);
				press.down();
			}}
			onPressOut={press.up}
			onPress={onPress}
			onLongPress={onLongPress}
			style={[{ width: size, height: size, opacity: disabled ? 0.5 : 1 }, style]}
		>
			{showRing ? (
				<Animated.View
					style={[
						styles.halo,
						{
							width: haloSize,
							height: haloSize,
							left: -RING.max,
							top: -RING.max,
							borderRadius: haloSize / 2,
							backgroundColor: withAlpha(colors.destructive, 0.22),
							transform: [{ scale: halo }]
						}
					]}
				/>
			) : null}
			<Animated.View
				style={[
					styles.round,
					{
						width: size,
						height: size,
						borderRadius: size / 2,
						backgroundColor: palette.face,
						borderColor: palette.border,
						boxShadow: ink.shadows.ink,
						transform: [{ scale: press.value }]
					}
				]}
			>
				<IconGlyph size={iconSize ?? Math.round(size * 0.45)} color={palette.glyph} strokeWidth={2} />
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	key: { paddingBottom: KEY_PRESS.travel },
	lip: { position: 'absolute', left: 0, right: 0, top: KEY_PRESS.travel, bottom: 0 },
	face: {
		flexGrow: 1,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center'
	},
	row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
	stack: { alignItems: 'center', justifyContent: 'center' },
	title: { fontWeight: '600', letterSpacing: -0.1 },
	hidden: { opacity: 0 },
	spinner: {
		position: 'absolute',
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: 'center',
		justifyContent: 'center'
	},
	halo: { position: 'absolute', pointerEvents: 'none' },
	round: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' }
});
