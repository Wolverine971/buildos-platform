// apps/mobile/src/components/kit/project-tile.tsx
// A project drawn as a printed tile, like the website's DesktopTile: tinted by its pulse with
// a faint halftone, two emoji (or a mono monogram), D and T meters, a red overdue badge, and
// a folder tab when it holds sub-projects. Decorative: the caller labels the control.
import type { DesktopProject, ProjectPulse } from '@buildos/api-client';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
	FULL_TILE,
	hasLook,
	meterColors,
	monogram,
	overdueBadgeText,
	PULSE_META,
	pulsePillColors,
	taskSegments,
	tilePalette
} from '@/lib/desktop';
import { useInk } from '@/providers/theme-provider';
import { fontFamily, type ThemeColors } from '@/theme';

import { Halftone } from './textures';

export type ProjectTileProps = {
	project: DesktopProject;
	/** Default 62 (the grid). From 56 up the tile shows its meters and overdue badge. */
	size?: number;
	/** Draws the folder tab for a project that holds others. */
	hasChildren?: boolean;
	style?: StyleProp<ViewStyle>;
};

const pct = (fraction: number): `${number}%` =>
	`${Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10}%`;

export function ProjectTile({ project, size = 62, hasChildren = false, style }: ProjectTileProps) {
	const ink = useInk();
	const { colors } = ink;
	const palette = tilePalette(project.pulse, colors, ink.pulse);
	const full = size >= FULL_TILE && hasLook(project);
	const corner = Math.round(size * 0.22);
	const overdue = full ? project.mix.overdue : 0;
	const emoji = (project.emoji ?? []).filter(Boolean).slice(0, size < 40 ? 1 : 2);
	// The web's sizes: 34% alone, 25% when the meters share the tile.
	const monoSize = size * (full ? 0.25 : 0.34);

	return (
		<View
			style={[{ width: size, height: size }, style]}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<View
				style={[
					styles.body,
					{
						borderRadius: corner,
						backgroundColor: palette.face,
						borderColor: palette.border,
						boxShadow: `inset 0 1px 0 ${ink.highlight}, ${ink.shadows.ink}`
					},
					full
						? {
								paddingTop: size * 0.1,
								paddingHorizontal: size * 0.11,
								paddingBottom: size * 0.12
							}
						: null
				]}
			>
				<Halftone color={palette.dots} opacity={palette.dotOpacity} radius={corner - 1} />
				<View style={styles.glyph}>
					{emoji.length ? (
						<Emoji
							glyphs={emoji}
							size={size}
							full={full}
							pulse={project.pulse}
							dark={ink.dark}
						/>
					) : (
						<Text
							allowFontScaling={false}
							numberOfLines={1}
							style={[
								styles.monogram,
								{
									color: palette.glyph,
									fontSize: monoSize,
									lineHeight: Math.ceil(monoSize * 1.15),
									letterSpacing: -0.03 * monoSize
								}
							]}
						>
							{monogram(project.name)}
						</Text>
					)}
				</View>
				{full ? <Meters project={project} size={size} colors={colors} /> : null}
			</View>
			{hasChildren ? (
				<View
					style={[
						styles.tab,
						{
							// The web's `.folder::before`, measured from the border box.
							top: 1 - size * 0.11,
							left: 1 + (size - 2) * 0.1,
							width: (size - 2) * 0.4,
							height: size * 0.12,
							borderColor: palette.border,
							backgroundColor: palette.tab
						}
					]}
				/>
			) : null}
			{overdue > 0 ? (
				<View
					style={[
						styles.badge,
						{ backgroundColor: colors.destructive, borderColor: colors.background }
					]}
				>
					<Text
						allowFontScaling={false}
						style={[styles.badgeText, { color: ink.onDestructive }]}
					>
						{overdueBadgeText(overdue)}
					</Text>
				</View>
			) : null}
		</View>
	);
}

function Emoji({
	glyphs,
	size,
	full,
	pulse,
	dark
}: {
	glyphs: string[];
	size: number;
	full: boolean;
	pulse: ProjectPulse | null;
	dark: boolean;
}) {
	const pair = glyphs.length > 1;
	// A pair is 15pt on the 62pt grid tile; one emoji gets more room.
	const fontSize = pair ? size * (full ? 15 / 62 : 0.33) : size * (full ? 0.34 : 0.5);
	const parked = pulse === 'parked';
	return (
		<View style={[styles.emojiRow, { gap: Math.max(1, size * 0.02) }]}>
			{glyphs.map((glyph, index) => (
				<Text
					key={index}
					allowFontScaling={false}
					style={[
						styles.emoji,
						{
							fontSize,
							lineHeight: Math.ceil(fontSize * 1.2),
							// Parked work fades, emoji included, so the pulse still reads.
							opacity: parked ? 0.72 : 1
						},
						// Dark glyphs vanish on dark tiles without a faint light edge.
						dark ? (parked ? styles.emojiEdgeParked : styles.emojiEdge) : null
					]}
				>
					{glyph}
				</Text>
			))}
		</View>
	);
}

function Meters({
	project,
	size,
	colors
}: {
	project: DesktopProject;
	size: number;
	colors: ThemeColors;
}) {
	const meter = meterColors(colors);
	const letter = Math.max(7.5, size * 0.12);
	const track = Math.max(4, size * 0.07);
	const segments = taskSegments(project);
	const row = (label: string, fill: ReactNode) => (
		<View style={[styles.meter, { gap: size * 0.05 }]}>
			<Text
				allowFontScaling={false}
				style={[
					styles.letter,
					{
						fontSize: letter,
						lineHeight: Math.ceil(letter),
						width: letter * 0.75,
						color: colors.mutedForeground
					}
				]}
			>
				{label}
			</Text>
			<View
				style={[
					styles.track,
					{ height: track, borderRadius: track / 2, backgroundColor: meter.track }
				]}
			>
				{fill}
			</View>
		</View>
	);
	return (
		<View style={{ gap: size * 0.045 }}>
			{row(
				'D',
				project.bars.docs > 0 ? (
					<View
						style={[
							styles.fill,
							{
								width: pct(project.bars.docs),
								borderRadius: track / 2,
								backgroundColor: meter.docs
							}
						]}
					/>
				) : null
			)}
			{row(
				'T',
				segments.length ? (
					<View
						style={[
							styles.fill,
							styles.split,
							{ width: pct(project.bars.tasks), borderRadius: track / 2 }
						]}
					>
						{segments.map((segment) => (
							<View
								key={segment.bucket}
								style={{
									flex: segment.fraction,
									backgroundColor: meter[segment.bucket]
								}}
							/>
						))}
					</View>
				) : null
			)}
		</View>
	);
}

// ---------------------------------------------------------------------------------------------
// PulsePill

export type PulsePillProps = {
	pulse: ProjectPulse;
	/** Extra content after the label, e.g. a stamp. */
	children?: ReactNode;
	/** Default true (capped at 1.3×). The peek card turns it off: its size is fixed up front. */
	allowFontScaling?: boolean;
	style?: StyleProp<ViewStyle>;
};

/** "MOVING", "BEING SHAPED"…: the pulse as a tinted uppercase pill (DesktopProjectCard `.pulse`). */
export function PulsePill({ pulse, children, allowFontScaling = true, style }: PulsePillProps) {
	const ink = useInk();
	const tone = pulsePillColors(pulse, ink.colors, ink.pulse);
	return (
		<View
			style={[styles.pill, { backgroundColor: tone.fill, borderColor: tone.border }, style]}
		>
			<Text
				allowFontScaling={allowFontScaling}
				maxFontSizeMultiplier={1.3}
				style={[styles.pillText, { color: tone.text }]}
			>
				{PULSE_META[pulse].label}
			</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	body: {
		flex: 1,
		borderWidth: 1,
		borderCurve: 'continuous'
	},
	glyph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	monogram: { fontFamily: fontFamily.mono, fontWeight: '600', textAlign: 'center' },
	emojiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
	emoji: { textAlign: 'center' },
	emojiEdge: {
		textShadowColor: 'rgba(255, 255, 255, 0.35)',
		textShadowOffset: { width: 0, height: 0 },
		textShadowRadius: 1.5
	},
	emojiEdgeParked: {
		textShadowColor: 'rgba(255, 255, 255, 0.3)',
		textShadowOffset: { width: 0, height: 0 },
		textShadowRadius: 1.5
	},
	meter: { flexDirection: 'row', alignItems: 'center' },
	letter: { fontFamily: fontFamily.mono, fontWeight: '600', textAlign: 'center' },
	track: { flex: 1, overflow: 'hidden' },
	fill: { height: '100%' },
	split: { flexDirection: 'row', overflow: 'hidden' },
	tab: {
		position: 'absolute',
		borderWidth: 1,
		borderBottomWidth: 0,
		borderTopLeftRadius: 5,
		borderTopRightRadius: 5
	},
	badge: {
		position: 'absolute',
		// The web's left -6 / top -7 sit on the padding box, 1pt inside the border.
		left: -5,
		top: -6,
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
	},
	pill: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		gap: 6,
		borderRadius: 99,
		borderWidth: 1,
		paddingHorizontal: 7,
		paddingVertical: 2
	},
	pillText: {
		fontSize: 10.5,
		lineHeight: 14,
		fontWeight: '600',
		letterSpacing: 0.42,
		textTransform: 'uppercase'
	}
});
