// apps/mobile/src/components/workspace/legend.tsx
// The ⓘ key beside the Workspace grid and the small sheet it opens: what a tile's color,
// bars and marks mean (the website's DesktopKey, with each rule spelled out). The sheet
// slides up over a dimmed page; tap outside, swipe the header down or press Close.
import type { DesktopProject, ProjectPulse } from '@buildos/api-client';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	Animated,
	Easing,
	Modal,
	PanResponder,
	Platform,
	Pressable,
	ScrollView,
	type StyleProp,
	StyleSheet,
	Text,
	useAnimatedValue,
	useWindowDimensions,
	View,
	type ViewStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Halftone, Info, Key, KEY_SPRING, MicroLabel, ProjectTile, X } from '@/components/kit';
import {
	meterColors,
	PULSE_META,
	PULSES,
	TASK_BUCKET_LABEL,
	TASK_BUCKETS,
	tilePalette
} from '@/lib/desktop';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { fontFamily, radius, typeScale, withAlpha } from '@/theme';

// ---------------------------------------------------------------------------------------------
// Key

/** The ⓘ key (30pt face, 44pt target) that opens the legend sheet. */
export function LegendKey({ style }: { style?: StyleProp<ViewStyle> }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Key
				icon={Info}
				size="xs"
				accessibilityLabel="What the tiles mean"
				accessibilityHint="Explains the colors, bars and badges on project tiles"
				onPress={() => setOpen(true)}
				style={style}
			/>
			<LegendSheet visible={open} onClose={() => setOpen(false)} />
		</>
	);
}

// ---------------------------------------------------------------------------------------------
// Sheet

export type LegendSheetProps = { visible: boolean; onClose: () => void };

// Near-critical: glides up without a bounce.
const SHEET_SPRING = { stiffness: 420, damping: 40, mass: 1 } as const;
const DISMISS_DRAG = 80;
const DISMISS_VELOCITY = 1.1;

export function LegendSheet({ visible, onClose }: LegendSheetProps) {
	const ink = useInk();
	const { colors } = ink;
	const insets = useSafeAreaInsets();
	const { height } = useWindowDimensions();
	const reduceMotion = useReducedMotion();
	const progress = useAnimatedValue(0);
	const drag = useAnimatedValue(0);
	const closing = useRef(false);

	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

	const close = useCallback(() => {
		if (closing.current) return;
		closing.current = true;
		Animated.timing(progress, {
			toValue: 0,
			duration: reduceMotion ? 120 : 200,
			easing: Easing.in(Easing.quad),
			useNativeDriver: true
		}).start(() => onCloseRef.current());
	}, [progress, reduceMotion]);

	const enter = () => {
		closing.current = false;
		drag.setValue(0);
		const motion = reduceMotion
			? Animated.timing(progress, { toValue: 1, duration: 150, useNativeDriver: true })
			: Animated.spring(progress, { toValue: 1, ...SHEET_SPRING, useNativeDriver: true });
		motion.start();
	};

	// If the parent hides the sheet without our exit animation, start the next open from below.
	useEffect(() => {
		if (!visible) {
			progress.setValue(0);
			drag.setValue(0);
		}
	}, [visible, progress, drag]);

	const pan = useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponder: (_event, gesture) =>
					gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
				onPanResponderMove: (_event, gesture) => drag.setValue(Math.max(0, gesture.dy)),
				onPanResponderRelease: (_event, gesture) => {
					if (gesture.dy > DISMISS_DRAG || gesture.vy > DISMISS_VELOCITY) {
						close();
						return;
					}
					Animated.spring(drag, {
						toValue: 0,
						...KEY_SPRING,
						useNativeDriver: true
					}).start();
				},
				onPanResponderTerminate: () => {
					Animated.spring(drag, {
						toValue: 0,
						...KEY_SPRING,
						useNativeDriver: true
					}).start();
				}
			}),
		[drag, close]
	);

	const translateY = useMemo(
		() =>
			reduceMotion
				? drag
				: Animated.add(
						progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
						drag
					),
		[drag, height, progress, reduceMotion]
	);

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			onShow={enter}
			onRequestClose={close}
			statusBarTranslucent
			navigationBarTranslucent
		>
			<View style={styles.fill}>
				<Animated.View
					style={[
						StyleSheet.absoluteFill,
						{
							backgroundColor: ink.scrim,
							opacity: progress
						}
					]}
				>
					<Pressable
						style={StyleSheet.absoluteFill}
						onPress={close}
						accessibilityRole="button"
						accessibilityLabel="Close the legend"
					/>
				</Animated.View>
				<Animated.View
					accessibilityViewIsModal
					onAccessibilityEscape={close}
					style={[
						styles.card,
						{
							maxHeight: height - insets.top - 24,
							paddingBottom: insets.bottom + 12,
							backgroundColor: colors.background,
							borderTopColor: ink.edge,
							boxShadow: `inset 0 1px 0 ${ink.highlight}, ${ink.shadows.inkStrong}`,
							opacity: reduceMotion ? progress : 1,
							transform: [{ translateY }]
						}
					]}
				>
					<View {...pan.panHandlers} style={styles.handleArea}>
						<View
							style={[
								styles.grabber,
								{ backgroundColor: withAlpha(colors.foreground, 0.18) }
							]}
						/>
						<View style={styles.titleRow}>
							<Text
								accessibilityRole="header"
								maxFontSizeMultiplier={1.4}
								style={[
									typeScale.sheetTitle,
									styles.title,
									{ color: colors.foreground }
								]}
							>
								What the tiles mean
							</Text>
							<Key icon={X} size="xs" accessibilityLabel="Close" onPress={close} />
						</View>
					</View>
					<ScrollView
						style={styles.scroll}
						contentContainerStyle={styles.content}
						showsVerticalScrollIndicator={false}
					>
						<Legend />
					</ScrollView>
				</Animated.View>
			</View>
		</Modal>
	);
}

// ---------------------------------------------------------------------------------------------
// Legend content

// An illustration for the legend, not a real project.
const SAMPLE: DesktopProject = {
	id: 'legend-sample',
	name: 'Example',
	kind: 'project',
	state_key: 'active',
	updated_at: '1970-01-01T00:00:00.000Z',
	last_touch_at: null,
	next_step_short: null,
	emoji: ['🌱', '📐'],
	parent_project_id: null,
	pulse: 'moving',
	pulse_reason: '',
	bars: { docs: 0.7, tasks: 0.85 },
	mix: { overdue: 3, in_progress: 2, scheduled: 2, backlog: 3 },
	open_tasks: 10,
	document_count: 6,
	task_count: 14
};
const SAMPLE_FOLDER: DesktopProject = {
	...SAMPLE,
	id: 'legend-folder',
	emoji: ['🗂️'],
	pulse: 'shaping'
};

function sentence(rule: string): string {
	return `${rule.charAt(0).toUpperCase()}${rule.slice(1)}.`;
}

/** The legend itself (no sheet): sample tile, pulse colors, D/T bars, overdue and nested marks. */
export function Legend() {
	const ink = useInk();
	const { colors } = ink;
	const meter = meterColors(colors);
	const muted = { color: colors.mutedForeground };

	return (
		<View style={styles.legend}>
			<View style={styles.sampleRow}>
				<View style={styles.sampleTile}>
					<ProjectTile project={SAMPLE} hasChildren />
				</View>
				<View style={styles.rowText}>
					<Text
						maxFontSizeMultiplier={1.4}
						style={[typeScale.row, { color: colors.foreground }]}
					>
						Every project is a tile.
					</Text>
					<Text maxFontSizeMultiplier={1.4} style={[typeScale.meta, muted]}>
						Its color says how it's going. Its bars say how much it holds, next to your
						other projects.
					</Text>
				</View>
			</View>

			<Section label="Color · pulse">
				{PULSES.map((pulse) => (
					<Row
						key={pulse}
						mark={<PulseSwatch pulse={pulse} />}
						title={PULSE_META[pulse].label}
						detail={sentence(PULSE_META[pulse].rule)}
					/>
				))}
			</Section>

			<Section label="Bars">
				<Row
					mark={
						<BarMark
							letter="D"
							fill={0.7}
							parts={[{ key: 'docs', flex: 1, color: meter.docs }]}
						/>
					}
					title="D · Docs"
					detail="Documents. Longer means more than your other projects."
				/>
				<Row
					mark={
						<BarMark
							letter="T"
							fill={0.85}
							parts={TASK_BUCKETS.map((bucket) => ({
								key: bucket,
								flex: SAMPLE.mix[bucket],
								color: meter[bucket]
							}))}
						/>
					}
					title="T · Open tasks"
					detail="Longer means more than your other projects, split by where they stand:"
				/>
				<View style={styles.buckets}>
					{TASK_BUCKETS.map((bucket) => (
						<View key={bucket} style={styles.bucket}>
							<View style={[styles.bucketBar, { backgroundColor: meter[bucket] }]} />
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.meta, { color: colors.foreground }]}
							>
								{TASK_BUCKET_LABEL[bucket]}
								{bucket === 'backlog' ? (
									<Text style={muted}> · no date yet, or blocked</Text>
								) : null}
							</Text>
						</View>
					))}
				</View>
			</Section>

			<Section label="Marks">
				<Row
					mark={
						<View
							style={[
								styles.badge,
								{
									backgroundColor: colors.destructive,
									borderColor: colors.background
								}
							]}
						>
							<Text
								allowFontScaling={false}
								style={[styles.badgeText, { color: ink.onDestructive }]}
							>
								3
							</Text>
						</View>
					}
					title="Overdue"
					detail="The red count: tasks past their due date."
				/>
				<Row
					mark={<ProjectTile project={SAMPLE_FOLDER} size={30} hasChildren />}
					title="Holds projects"
					detail={
						'A folder tab, and "N NESTED" under the name: projects kept inside this one.'
					}
				/>
			</Section>

			{Platform.OS === 'ios' ? (
				<Text maxFontSizeMultiplier={1.4} style={[typeScale.meta, muted]}>
					Press and hold a tile to peek inside.
				</Text>
			) : null}
		</View>
	);
}

function Section({ label, children }: { label: string; children: ReactNode }) {
	return (
		<View style={styles.section}>
			<MicroLabel>{label}</MicroLabel>
			<View style={styles.sectionBody}>{children}</View>
		</View>
	);
}

function Row({ mark, title, detail }: { mark: ReactNode; title: string; detail: string }) {
	const { colors } = useInk();
	return (
		<View style={styles.row}>
			<View style={styles.mark}>{mark}</View>
			<View style={styles.rowText}>
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.row, { color: colors.foreground }]}
				>
					{title}
				</Text>
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.meta, { color: colors.mutedForeground }]}
				>
					{detail}
				</Text>
			</View>
		</View>
	);
}

function PulseSwatch({ pulse }: { pulse: ProjectPulse }) {
	const ink = useInk();
	const palette = tilePalette(pulse, ink.colors, ink.pulse);
	return (
		<View
			style={[
				styles.swatch,
				{
					backgroundColor: palette.face,
					borderColor: palette.border,
					boxShadow: `inset 0 1px 0 ${ink.highlight}`
				}
			]}
		>
			<Halftone
				color={palette.dots}
				opacity={palette.dotOpacity}
				radius={SWATCH_RADIUS - 1}
			/>
		</View>
	);
}

function BarMark({
	letter,
	fill,
	parts
}: {
	letter: string;
	fill: number;
	parts: { key: string; flex: number; color: string }[];
}) {
	const { colors } = useInk();
	const meter = meterColors(colors);
	return (
		<View style={styles.barMark}>
			<Text
				allowFontScaling={false}
				style={[styles.barLetter, { color: colors.mutedForeground }]}
			>
				{letter}
			</Text>
			<View style={[styles.barTrack, { backgroundColor: meter.track }]}>
				<View style={[styles.barFill, { width: pct(fill) }]}>
					{parts.map((part) => (
						<View
							key={part.key}
							style={{ flex: part.flex, backgroundColor: part.color }}
						/>
					))}
				</View>
			</View>
		</View>
	);
}

const pct = (fraction: number): `${number}%` => `${Math.round(fraction * 1000) / 10}%`;

const SWATCH_RADIUS = 7;
const MARK_WIDTH = 46;

const styles = StyleSheet.create({
	fill: { flex: 1, justifyContent: 'flex-end' },
	card: {
		borderTopLeftRadius: radius.sheet,
		borderTopRightRadius: radius.sheet,
		borderCurve: 'continuous',
		borderTopWidth: StyleSheet.hairlineWidth
	},
	handleArea: { paddingTop: 8, paddingHorizontal: 16 },
	grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, marginBottom: 10 },
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		paddingBottom: 6
	},
	title: { flexShrink: 1 },
	scroll: { flexGrow: 0, flexShrink: 1 },
	content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
	legend: { gap: 20 },
	sampleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
	// Room for the badge and folder tab that sit outside the tile.
	sampleTile: { paddingTop: 8, paddingLeft: 6 },
	section: { gap: 10 },
	sectionBody: { gap: 12 },
	row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
	mark: { width: MARK_WIDTH, minHeight: 20, alignItems: 'center', paddingTop: 1 },
	rowText: { flex: 1, gap: 2 },
	swatch: {
		width: 24,
		height: 24,
		borderRadius: SWATCH_RADIUS,
		borderCurve: 'continuous',
		borderWidth: 1
	},
	barMark: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		width: MARK_WIDTH,
		paddingTop: 6
	},
	barLetter: { width: 8, fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '600' },
	barTrack: { flex: 1, height: 5, borderRadius: 2.5, overflow: 'hidden' },
	barFill: { height: '100%', flexDirection: 'row', borderRadius: 2.5, overflow: 'hidden' },
	buckets: { marginLeft: MARK_WIDTH + 12, gap: 6 },
	bucket: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	bucketBar: { width: 16, height: 5, borderRadius: 2.5 },
	badge: {
		marginTop: 1,
		minWidth: 18,
		height: 17,
		paddingHorizontal: 4,
		borderRadius: 8.5,
		borderWidth: 2,
		alignItems: 'center',
		justifyContent: 'center'
	},
	badgeText: {
		fontSize: 10,
		lineHeight: 13,
		fontWeight: '600',
		textAlign: 'center',
		fontVariant: ['tabular-nums']
	}
});
