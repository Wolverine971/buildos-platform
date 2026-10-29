// apps/mobile/src/components/workspace/tile-grid.tsx
// Project tiles four across, like icons on a home screen. Tap opens the project. On iOS a
// long press peeks at it (expo-router Link.Preview) with an Open menu; Android has no peek,
// so its tiles are plain pressables that push the project.
import type { DesktopProject } from '@buildos/api-client';
import { Link, router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import {
	Animated,
	type DimensionValue,
	Platform,
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	useAnimatedValue,
	View,
	type ViewStyle
} from 'react-native';

import { KEY_SPRING, playHaptic, ProjectTile } from '@/components/kit';
import { useTabStack } from '@/hooks/use-tab-stack';
import { gridColumns, nestedStamp, peekLayout, tileAccessibilityLabel } from '@/lib/desktop';
import { projectHref } from '@/lib/routes';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { fontFamily } from '@/theme';

import { ProjectPeek } from './project-peek';

export type TileGridProps = {
	/** Tiles in display order (see arrangeDesktop / sortRecent in lib/desktop). */
	projects: readonly DesktopProject[];
	/** Sub-project count per project id ("N NESTED" and the folder tab). */
	nestedCounts: ReadonlyMap<string, number>;
	/** While searching: tile id → parent name, shown as "in Parent" under sub-projects. */
	parentNames?: ReadonlyMap<string, string>;
	/** Called when a tile opens its project by tap or the menu's Open (not by tapping the peek). */
	onOpen?: (project: DesktopProject) => void;
	style?: StyleProp<ViewStyle>;
};

const PEEK_SUPPORTED = Platform.OS === 'ios';
// Wait this long before the press-in haptic so starting a scroll on a tile doesn't buzz.
const PRESS_DELAY_MS = 90;
// Critically damped: settles at 0.96 without dipping under it.
const PRESS_IN_SPRING = { stiffness: 1250, damping: 71, mass: 1 } as const;
const TILE_SIZE = 62;

export function TileGrid({ projects, nestedCounts, parentNames, onOpen, style }: TileGridProps) {
	const [width, setWidth] = useState(0);
	const columns = gridColumns(width);
	const cellWidth: DimensionValue = `${100 / columns}%`;

	return (
		<View
			style={[styles.grid, style]}
			onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
		>
			{projects.map((project) => (
				<TileCell
					key={project.id}
					project={project}
					nested={nestedCounts.get(project.id) ?? 0}
					parentName={parentNames?.get(project.id) ?? null}
					width={cellWidth}
					onOpen={onOpen}
				/>
			))}
		</View>
	);
}

type TileCellProps = {
	project: DesktopProject;
	nested: number;
	parentName: string | null;
	width: DimensionValue;
	onOpen?: (project: DesktopProject) => void;
};

const TileCell = memo(function TileCell({
	project,
	nested,
	parentName,
	width,
	onOpen
}: TileCellProps) {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const scale = useAnimatedValue(1);
	// Pushed on this tab's stack (the peek needs that native stack too). Stable per id: Link
	// throws if href changes while its preview is open.
	const tab = useTabStack();
	const href = useMemo(() => projectHref(tab, project.id), [tab, project.id]);
	const peek = useMemo(() => (PEEK_SUPPORTED ? peekLayout(project) : null), [project]);

	const pressIn = () => {
		playHaptic('light');
		if (reduceMotion) return;
		scale.stopAnimation();
		Animated.spring(scale, {
			toValue: 0.96,
			...PRESS_IN_SPRING,
			useNativeDriver: true
		}).start();
	};
	const pressOut = () => {
		if (reduceMotion) return;
		Animated.spring(scale, { toValue: 1, ...KEY_SPRING, useNativeDriver: true }).start();
	};
	const open = () => {
		onOpen?.(project);
		router.push(href);
	};

	// Inside Link.Trigger this element is cloned by a Slot that spreads `style` as an object,
	// so it must stay a plain Pressable with an object style (no array, no function).
	const face = (
		<Pressable
			accessibilityRole="link"
			accessibilityLabel={tileAccessibilityLabel(project, nested, parentName)}
			accessibilityHint="Opens the project"
			unstable_pressDelay={PRESS_DELAY_MS}
			onPressIn={pressIn}
			onPressOut={pressOut}
			{...(PEEK_SUPPORTED ? {} : { onPress: open })}
			style={styles.press}
		>
			<Animated.View style={{ transform: [{ scale }] }}>
				<ProjectTile project={project} size={TILE_SIZE} hasChildren={nested > 0} />
			</Animated.View>
			<Text
				numberOfLines={2}
				maxFontSizeMultiplier={1.3}
				style={[styles.label, { color: colors.foreground }]}
			>
				{project.name}
			</Text>
			{nested > 0 ? (
				<Text maxFontSizeMultiplier={1.2} style={[styles.nested, { color: colors.accent }]}>
					{nestedStamp(nested)}
				</Text>
			) : parentName ? (
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.2}
					style={[styles.where, { color: colors.mutedForeground }]}
				>
					in {parentName}
				</Text>
			) : null}
		</Pressable>
	);

	return (
		<View style={[styles.cell, { width }]}>
			{PEEK_SUPPORTED && peek ? (
				<Link href={href} push asChild onPress={onOpen ? () => onOpen(project) : undefined}>
					<Link.Trigger>{face}</Link.Trigger>
					<Link.Preview
						style={{
							width: peek.width,
							height: peek.height,
							backgroundColor: colors.background
						}}
					>
						<ProjectPeek project={project} nested={nested} layout={peek} />
					</Link.Preview>
					<Link.Menu>
						<Link.MenuAction icon="folder" onPress={open}>
							Open
						</Link.MenuAction>
					</Link.Menu>
				</Link>
			) : (
				face
			)}
		</View>
	);
});

const styles = StyleSheet.create({
	grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
	cell: { alignItems: 'stretch' },
	press: {
		alignItems: 'center',
		gap: 7,
		paddingTop: 10,
		paddingBottom: 8,
		paddingHorizontal: 3
	},
	label: {
		maxWidth: 86,
		fontSize: 12.5,
		lineHeight: 16,
		textAlign: 'center'
	},
	nested: {
		marginTop: -4,
		fontFamily: fontFamily.mono,
		fontSize: 9.5,
		lineHeight: 12,
		fontWeight: '600',
		letterSpacing: 0.57
	},
	where: { marginTop: -4, maxWidth: 86, fontSize: 11, lineHeight: 14, textAlign: 'center' }
});
