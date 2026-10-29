// apps/mobile/src/components/kit/textures.tsx
// Inkprint textures drawn in SVG: graph paper, halftone dots and bench grain. Each fills its
// parent absolutely, ignores touches and is hidden from VoiceOver. Keep them out from under
// body text (the capture box grid is the one exception).
import { type PropsWithChildren, useId } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';

import { useInk } from '@/providers/theme-provider';

import { GRAIN, grainDots, grainPaths } from './math';

type TextureProps = {
	/** Corner radius to clip to: the parent's radius minus its border width. */
	radius?: number;
	style?: StyleProp<ViewStyle>;
};

/** A pattern id that is unique per instance and safe inside `url(#…)`. */
export function usePatternId(prefix: string): string {
	return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function TextureLayer({
	id,
	radius,
	style,
	children
}: PropsWithChildren<TextureProps & { id: string }>) {
	return (
		<View
			style={[StyleSheet.absoluteFill, styles.layer, style]}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<Svg width="100%" height="100%">
				<Defs>{children}</Defs>
				<Rect
					x={0}
					y={0}
					width="100%"
					height="100%"
					rx={radius}
					ry={radius}
					fill={`url(#${id})`}
				/>
			</Svg>
		</View>
	);
}

/** Graph paper: 1pt lines on a square cell (20 on the capture box, 12 on headers). */
export function GraphPaper({
	cell = 20,
	opacity,
	color,
	...layer
}: TextureProps & { cell?: number; opacity?: number; color?: string }) {
	const ink = useInk();
	const id = usePatternId('graph');
	return (
		<TextureLayer id={id} {...layer}>
			<Pattern id={id} patternUnits="userSpaceOnUse" x={0} y={0} width={cell} height={cell}>
				{/* One L per cell (top and left edges) so the corner pixel is not drawn twice. */}
				<Path
					d={`M0 0H${cell}V1H1V${cell}H0Z`}
					fill={color ?? ink.txInk}
					fillOpacity={opacity ?? ink.texture.graph}
				/>
			</Pattern>
		</TextureLayer>
	);
}

/**
 * Halftone dots on a square grid. With a `color` (a pulse color on tiles) dots default to 18%
 * of it; without one they use the faint texture ink.
 */
export function Halftone({
	color,
	gap = 4,
	dot = 0.7,
	opacity,
	...layer
}: TextureProps & { color?: string; gap?: number; dot?: number; opacity?: number }) {
	const ink = useInk();
	const id = usePatternId('halftone');
	return (
		<TextureLayer id={id} {...layer}>
			<Pattern id={id} patternUnits="userSpaceOnUse" x={0} y={0} width={gap} height={gap}>
				<Circle
					cx={gap / 2}
					cy={gap / 2}
					r={dot}
					fill={color ?? ink.txInk}
					fillOpacity={opacity ?? (color ? 0.18 : ink.texture.halftone)}
				/>
			</Pattern>
		</TextureLayer>
	);
}

// One seeded tile, built once for the whole app.
const GRAIN_PATHS = grainPaths(grainDots());

/** Bench grain: fine seeded noise, ~10% ink in light and ~6% in dark. */
export function Grain({ opacity, ...layer }: TextureProps & { opacity?: number }) {
	const ink = useInk();
	const id = usePatternId('grain');
	const strength = opacity ?? ink.texture.grain;
	return (
		<TextureLayer id={id} {...layer}>
			<Pattern
				id={id}
				patternUnits="userSpaceOnUse"
				x={0}
				y={0}
				width={GRAIN.tile}
				height={GRAIN.tile}
			>
				{GRAIN_PATHS.map((part) => (
					<Path key={part.a} d={part.d} fill={ink.txInk} fillOpacity={part.a * strength} />
				))}
			</Pattern>
		</TextureLayer>
	);
}

const styles = StyleSheet.create({
	layer: { pointerEvents: 'none' }
});
