// apps/mobile/src/components/kit/bolt.tsx
// The BuildOS bolt: a drawn mark, a charging spinner for loading states, and a scroll view
// whose pull-to-refresh charges the bolt instead of showing the system spinner.
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, type Ref } from 'react';
import {
	Animated,
	Easing,
	type NativeScrollEvent,
	RefreshControl,
	ScrollView,
	type ScrollViewInstance,
	type ScrollViewProps,
	type StyleProp,
	StyleSheet,
	useAnimatedValue,
	View,
	type ViewStyle
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useReducedMotion, useTheme } from '@/providers/theme-provider';

import { BOLT_CYCLE, crossedPullTrigger, PULL } from './math';

// No vector bolt exists in the repo (the Brain Bolt is a raster), so this is Lucide Zap.
export const BOLT_PATH =
	'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z';

// The path's ink spans y 2–22 of the 24 box; the charge window fills exactly that span.
const INK_TOP = 2 / 24;
const INK_BOTTOM = 22 / 24;

/** The bolt, filled (accent by default). Decorative: label the control around it instead. */
export function BoltMark({
	size = 24,
	color,
	style
}: {
	size?: number;
	color?: string;
	style?: StyleProp<ViewStyle>;
}) {
	const colors = useTheme();
	const fill = color ?? colors.accent;
	return (
		<Svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			style={style}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<Path d={BOLT_PATH} fill={fill} stroke={fill} strokeWidth={1.25} strokeLinejoin="round" />
		</Svg>
	);
}

// Anything with a numeric interpolate (an Animated.Value or an interpolation of one).
type Charge = {
	interpolate(config: Animated.InterpolationConfig<number>): Animated.AnimatedInterpolation<number>;
};

/**
 * A dim bolt with a bright one revealed from the bottom up as `charge` goes 0 → 1. Both moves
 * are transforms (a clipping window rising while its content counter-moves), so they run on
 * the native driver.
 */
function ChargeBolt({
	size,
	charge,
	color,
	fillOpacity
}: {
	size: number;
	charge: Charge;
	color: string;
	fillOpacity?: Animated.Value;
}) {
	const { windowY, counterY } = useMemo(
		() => ({
			windowY: charge.interpolate({
				inputRange: [0, 1],
				outputRange: [size * INK_BOTTOM, size * INK_TOP]
			}),
			counterY: charge.interpolate({
				inputRange: [0, 1],
				outputRange: [-size * INK_BOTTOM, -size * INK_TOP]
			})
		}),
		[charge, size]
	);
	return (
		<View style={{ width: size, height: size }}>
			<BoltMark size={size} color={color} style={[StyleSheet.absoluteFill, styles.track]} />
			<Animated.View
				style={[
					styles.window,
					{ width: size, height: size, transform: [{ translateY: windowY }] },
					fillOpacity ? { opacity: fillOpacity } : null
				]}
			>
				<Animated.View style={{ transform: [{ translateY: counterY }] }}>
					<BoltMark size={size} color={color} />
				</Animated.View>
			</Animated.View>
		</View>
	);
}

/**
 * Loading indicator: the bolt charges from the bottom, flashes full, then drains and repeats
 * (~1.6s). With Reduce Motion on it only breathes in opacity. Use instead of ActivityIndicator.
 */
export function BoltSpinner({
	size = 28,
	label = 'Loading',
	color,
	style
}: {
	size?: number;
	label?: string;
	color?: string;
	style?: StyleProp<ViewStyle>;
}) {
	const colors = useTheme();
	const reduceMotion = useReducedMotion();
	// Every value starts and ends each cycle at 1, so the loop's per-iteration reset is seamless.
	const charge = useAnimatedValue(1);
	const fill = useAnimatedValue(1);
	const scale = useAnimatedValue(1);

	useEffect(() => {
		const native = { useNativeDriver: true } as const;
		const loop = reduceMotion
			? Animated.loop(
					Animated.sequence([
						Animated.timing(fill, {
							toValue: 0.4,
							duration: 750,
							easing: Easing.inOut(Easing.ease),
							...native
						}),
						Animated.timing(fill, {
							toValue: 1,
							duration: 750,
							easing: Easing.inOut(Easing.ease),
							...native
						})
					])
				)
			: Animated.loop(
					Animated.sequence([
						Animated.timing(scale, {
							toValue: 1.12,
							duration: BOLT_CYCLE.flashUp,
							easing: Easing.out(Easing.quad),
							...native
						}),
						Animated.timing(scale, {
							toValue: 1,
							duration: BOLT_CYCLE.flashDown,
							easing: Easing.inOut(Easing.quad),
							...native
						}),
						Animated.timing(fill, {
							toValue: 0,
							delay: BOLT_CYCLE.hold,
							duration: BOLT_CYCLE.drain,
							easing: Easing.in(Easing.quad),
							...native
						}),
						Animated.parallel([
							Animated.timing(charge, { toValue: 0, duration: 0, ...native }),
							Animated.timing(fill, { toValue: 1, duration: 0, ...native })
						]),
						Animated.timing(charge, {
							toValue: 1,
							duration: BOLT_CYCLE.charge,
							easing: Easing.inOut(Easing.cubic),
							...native
						})
					])
				);
		loop.start();
		return () => {
			loop.stop();
			charge.setValue(1);
			fill.setValue(1);
			scale.setValue(1);
		};
	}, [reduceMotion, charge, fill, scale]);

	return (
		<Animated.View
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={label}
			accessibilityState={{ busy: true }}
			style={[{ width: size, height: size, transform: [{ scale }] }, style]}
		>
			<ChargeBolt size={size} charge={charge} color={color ?? colors.accent} fillOpacity={fill} />
		</Animated.View>
	);
}

export type BoltScrollViewProps = Omit<ScrollViewProps, 'refreshControl'> & {
	/** Shows the bolt spinner in the pulled gap. */
	refreshing?: boolean;
	/** Turns on pull to refresh; without it this is a plain ScrollView. */
	onRefresh?: () => void;
	ref?: Ref<ScrollViewInstance>;
	/** Style for the wrapper that holds the scroll view and the bolt overlay. */
	containerStyle?: StyleProp<ViewStyle>;
	boltSize?: number;
};

/**
 * ScrollView with BuildOS pull to refresh. The system RefreshControl still owns the gesture
 * and the held gap, tinted invisible; a bolt overlay charges with the pull (fading and growing
 * in from 10pt, full at 90pt with one selection tick) and spins while `refreshing`.
 */
export function BoltScrollView({
	refreshing = false,
	onRefresh,
	ref,
	containerStyle,
	boltSize = 30,
	onScroll,
	onScrollBeginDrag,
	onScrollEndDrag,
	scrollEventThrottle = 16,
	contentInset,
	...props
}: BoltScrollViewProps) {
	const colors = useTheme();
	const reduceMotion = useReducedMotion();
	const scrollY = useAnimatedValue(0);
	const insetTop = contentInset?.top ?? 0;

	// Latest handlers and state for the scroll listener, which is created once.
	const live = useRef({ onScroll, refreshing, insetTop, dragging: false, lastY: 0 });
	live.current.onScroll = onScroll;
	live.current.refreshing = refreshing;
	live.current.insetTop = insetTop;

	const handleScroll = useMemo(
		() =>
			Animated.event<NativeScrollEvent>([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
				useNativeDriver: true,
				listener: (event) => {
					const state = live.current;
					const y = event.nativeEvent.contentOffset.y + state.insetTop;
					if (state.dragging && !state.refreshing && crossedPullTrigger(state.lastY, y)) {
						void Haptics.selectionAsync().catch(() => {});
					}
					state.lastY = y;
					state.onScroll?.(event);
				}
			}),
		[scrollY]
	);

	// Pull distance measured from the resting offset (a top content inset shifts it).
	const pull = useMemo(() => {
		const pullY = Animated.add(scrollY, insetTop);
		const range = { inputRange: [-PULL.full, -PULL.start], extrapolate: 'clamp' } as const;
		return {
			opacity: pullY.interpolate({ ...range, outputRange: [1, 0] }),
			scale: pullY.interpolate({ ...range, outputRange: [1, reduceMotion ? 1 : 0.6] }),
			charge: pullY.interpolate({ ...range, outputRange: [1, 0] }),
			// While refreshing the gap is held open; fade the spinner if content is scrolled over it.
			hold: pullY.interpolate({ inputRange: [-40, -10], outputRange: [1, 0], extrapolate: 'clamp' }),
			// Keep the bolt centered in the gap the pull opens.
			centerY: pullY.interpolate({
				inputRange: [-200, 0],
				outputRange: [100 - boltSize / 2, -boltSize / 2],
				extrapolate: 'clamp'
			})
		};
	}, [scrollY, insetTop, reduceMotion, boltSize]);

	if (!onRefresh) {
		return (
			<ScrollView
				ref={ref}
				onScroll={onScroll}
				onScrollBeginDrag={onScrollBeginDrag}
				onScrollEndDrag={onScrollEndDrag}
				scrollEventThrottle={scrollEventThrottle}
				contentInset={contentInset}
				{...props}
			/>
		);
	}

	return (
		<View style={[styles.container, containerStyle]}>
			<Animated.ScrollView
				ref={ref}
				{...props}
				contentInset={contentInset}
				scrollEventThrottle={scrollEventThrottle}
				onScroll={handleScroll}
				onScrollBeginDrag={(event) => {
					live.current.dragging = true;
					onScrollBeginDrag?.(event);
				}}
				onScrollEndDrag={(event) => {
					live.current.dragging = false;
					onScrollEndDrag?.(event);
				}}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor="transparent"
						colors={[colors.accent]}
						progressBackgroundColor={colors.card}
					/>
				}
			/>
			<Animated.View
				style={[styles.overlay, { top: insetTop, transform: [{ translateY: pull.centerY }] }]}
				accessibilityElementsHidden={!refreshing}
				importantForAccessibility={refreshing ? 'auto' : 'no-hide-descendants'}
			>
				{refreshing ? (
					<Animated.View style={{ opacity: pull.hold }}>
						<BoltSpinner size={boltSize} label="Refreshing" />
					</Animated.View>
				) : (
					<Animated.View style={{ opacity: pull.opacity, transform: [{ scale: pull.scale }] }}>
						<ChargeBolt size={boltSize} charge={pull.charge} color={colors.accent} />
					</Animated.View>
				)}
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	track: { opacity: 0.22 },
	window: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
	container: { flexGrow: 1, flexShrink: 1 },
	overlay: {
		position: 'absolute',
		left: 0,
		right: 0,
		alignItems: 'center',
		pointerEvents: 'none'
	}
});
