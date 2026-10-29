// apps/mobile/src/components/kit/tab-bar.tsx
// The bottom tab bar on the bench (for the js-tabs `tabBar` prop). Active tab = accent icon and
// label plus a short accent bar on the top edge. Presses go through the navigator's emitter like
// the stock bar, so tabPress listeners still work: re-tapping the current tab pops its stack to
// the root (the tab's native Stack listens), and a second tap there scrolls to the top (Screen).
import {
	BottomTabBarHeightCallbackContext,
	type BottomTabBarProps,
	type BottomTabViewRoute
} from 'expo-router/js-tabs';
import { use, useEffect, useMemo } from 'react';
import {
	Animated,
	Easing,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	useAnimatedValue,
	View
} from 'react-native';

import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { withAlpha } from '@/theme';

import { Bench } from './frame';
import { playHaptic } from './key';
import { KEY_SPRING } from './math';

/** Height of the tab row, not counting the home-indicator area below it. */
export const TAB_BAR_ROW_HEIGHT = 50;
const ICON_SIZE = 24;
const INDICATOR_WIDTH = 26;

type TabDescriptor = BottomTabBarProps['descriptors'][string];

/** Pass as `tabBar={(props) => <TabBar {...props} />}` on js-tabs `Tabs`. */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
	const { colors } = useInk();
	// Feeds useBottomTabBarHeight(), as the stock bar does.
	const onHeightChange = use(BottomTabBarHeightCallbackContext);
	const count = state.routes.length;

	return (
		<Bench
			onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
			style={[
				styles.bar,
				{
					borderTopColor: withAlpha(colors.border, 0.8),
					paddingBottom: Math.max(insets.bottom, 4),
					paddingLeft: insets.left,
					paddingRight: insets.right
				}
			]}
		>
			<View accessibilityRole="tablist" style={styles.row}>
				{state.routes.map((route, index) => {
					const focused = index === state.index;
					return (
						<TabItem
							key={route.key}
							route={route}
							descriptor={descriptors[route.key]}
							focused={focused}
							index={index}
							count={count}
							onPress={() => {
								const event = emitter.emit({
									type: 'tabPress',
									target: route.key,
									canPreventDefault: true
								});
								if (!focused && !event.defaultPrevented) navigateToTab(route.key);
							}}
							onLongPress={() => {
								emitter.emit({ type: 'tabLongPress', target: route.key });
							}}
						/>
					);
				})}
			</View>
		</Bench>
	);
}

function TabItem({
	route,
	descriptor,
	focused,
	index,
	count,
	onPress,
	onLongPress
}: {
	route: BottomTabViewRoute;
	descriptor: TabDescriptor;
	focused: boolean;
	index: number;
	count: number;
	onPress: () => void;
	onLongPress: () => void;
}) {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const { options } = descriptor;
	const color = focused ? colors.accent : colors.mutedForeground;
	const title =
		typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

	const on = useAnimatedValue(focused ? 1 : 0);
	const press = useAnimatedValue(1);
	const indicator = useMemo(
		() => ({
			opacity: on.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
			scaleX: on.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] })
		}),
		[on]
	);

	useEffect(() => {
		if (reduceMotion) {
			on.setValue(focused ? 1 : 0);
			return;
		}
		const move = Animated.spring(on, {
			toValue: focused ? 1 : 0,
			stiffness: 420,
			damping: 30,
			mass: 1,
			useNativeDriver: true
		});
		move.start();
		return () => move.stop();
	}, [focused, on, reduceMotion]);

	const label =
		options.tabBarShowLabel === false ? null : typeof options.tabBarLabel === 'function' ? (
			options.tabBarLabel({ focused, color, position: 'below-icon', children: title })
		) : (
			<Text
				numberOfLines={1}
				allowFontScaling={options.tabBarAllowFontScaling}
				maxFontSizeMultiplier={1.2}
				style={[styles.label, { color }, options.tabBarLabelStyle]}
			>
				{title}
			</Text>
		);

	return (
		<Pressable
			testID={options.tabBarButtonTestID}
			// iOS gives role "tab" no trait, so (like React Navigation's own bar) iOS uses a
			// button that says "tab, N of M"; Android gets the real tab role.
			accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
			accessibilityLabel={
				options.tabBarAccessibilityLabel ??
				(Platform.OS === 'ios' ? `${title}, tab, ${index + 1} of ${count}` : title)
			}
			accessibilityState={{ selected: focused }}
			accessibilityShowsLargeContentViewer
			accessibilityLargeContentTitle={title}
			onPressIn={() => {
				if (reduceMotion) return;
				press.stopAnimation();
				Animated.timing(press, {
					toValue: 0.88,
					duration: 80,
					easing: Easing.out(Easing.quad),
					useNativeDriver: true
				}).start();
			}}
			onPressOut={() => {
				if (reduceMotion) return;
				Animated.spring(press, { toValue: 1, ...KEY_SPRING, useNativeDriver: true }).start();
			}}
			onPress={() => {
				playHaptic('selection');
				onPress();
			}}
			onLongPress={onLongPress}
			style={[styles.item, options.tabBarItemStyle]}
		>
			<Animated.View
				style={[
					styles.indicator,
					{
						backgroundColor: colors.accent,
						opacity: indicator.opacity,
						transform: [{ scaleX: indicator.scaleX }]
					}
				]}
			/>
			<Animated.View style={[options.tabBarIconStyle, { transform: [{ scale: press }] }]}>
				{options.tabBarIcon?.({ focused, color, size: ICON_SIZE }) ?? null}
			</Animated.View>
			{label}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	bar: { borderTopWidth: StyleSheet.hairlineWidth },
	row: { flexDirection: 'row', paddingHorizontal: 40 },
	item: {
		flex: 1,
		minHeight: TAB_BAR_ROW_HEIGHT,
		alignItems: 'center',
		paddingTop: 8,
		gap: 3
	},
	// Sits over the bar's top hairline, centered on the tab.
	indicator: {
		position: 'absolute',
		top: -StyleSheet.hairlineWidth,
		left: '50%',
		marginLeft: -INDICATOR_WIDTH / 2,
		width: INDICATOR_WIDTH,
		height: 2,
		borderRadius: 1,
		pointerEvents: 'none'
	},
	label: { fontSize: 11, lineHeight: 13, fontWeight: '600' }
});
