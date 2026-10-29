// apps/mobile/src/components/project/sub-projects.tsx
// "Inside this project": the projects nested in this one as a sideways row of small tiles.
// Tap opens one; on iOS a long press peeks at it like the Workspace grid does.
import type { DesktopProject } from '@buildos/api-client';
import { Link, router } from 'expo-router';
import { memo, useMemo } from 'react';
import {
	Animated,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	useAnimatedValue,
	View
} from 'react-native';

import { KEY_SPRING, MicroLabel, playHaptic, ProjectTile } from '@/components/kit';
import { ProjectPeek } from '@/components/workspace/project-peek';
import { useTabStack } from '@/hooks/use-tab-stack';
import { nestedStamp, peekLayout, tileAccessibilityLabel } from '@/lib/desktop';
import { projectHref } from '@/lib/routes';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { fontFamily } from '@/theme';

const PEEK_SUPPORTED = Platform.OS === 'ios';
const TILE_SIZE = 48;
const CELL_WIDTH = 78;
// Same feel as the Workspace grid: no haptic if the touch turns into a scroll.
const PRESS_DELAY_MS = 90;
const PRESS_IN_SPRING = { stiffness: 1250, damping: 71, mass: 1 } as const;

export type SubProjectsProps = {
	projects: readonly DesktopProject[];
	nestedCounts: ReadonlyMap<string, number>;
	/** Horizontal page padding, so the row can run edge to edge and still line up. */
	inset: number;
};

export function SubProjects({ projects, nestedCounts, inset }: SubProjectsProps) {
	if (projects.length === 0) return null;
	return (
		<View style={styles.root}>
			<MicroLabel accessibilityRole="header">{`Inside this project · ${projects.length}`}</MicroLabel>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ marginHorizontal: -inset }}
				// Cells are wider than their tiles; this puts the first tile near the page edge.
				contentContainerStyle={[styles.row, { paddingHorizontal: Math.max(0, inset - 12) }]}
			>
				{projects.map((project) => (
					<SubProjectCell
						key={project.id}
						project={project}
						nested={nestedCounts.get(project.id) ?? 0}
					/>
				))}
			</ScrollView>
		</View>
	);
}

const SubProjectCell = memo(function SubProjectCell({
	project,
	nested
}: {
	project: DesktopProject;
	nested: number;
}) {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const scale = useAnimatedValue(1);
	// Pushed on the same tab's stack as this project. Stable per id: Link throws if href
	// changes while its preview is open.
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
	const open = () => router.push(href);

	// Inside Link.Trigger this element is cloned by a Slot that spreads `style` as an object,
	// so it must stay a plain Pressable with an object style (no array, no function).
	const face = (
		<Pressable
			accessibilityRole="link"
			accessibilityLabel={tileAccessibilityLabel(project, nested)}
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
			) : null}
		</Pressable>
	);

	return (
		<View style={styles.cell}>
			{PEEK_SUPPORTED && peek ? (
				<Link href={href} push asChild>
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
	root: { gap: 2 },
	row: { gap: 2 },
	cell: { width: CELL_WIDTH },
	press: {
		alignItems: 'center',
		gap: 6,
		// Room above for the folder tab of a project that holds others.
		paddingTop: 9,
		paddingBottom: 4,
		paddingHorizontal: 3
	},
	label: { fontSize: 12, lineHeight: 15, textAlign: 'center' },
	nested: {
		marginTop: -3,
		fontFamily: fontFamily.mono,
		fontSize: 9.5,
		lineHeight: 12,
		fontWeight: '600',
		letterSpacing: 0.57
	}
});
