// apps/mobile/src/components/project/project-header.tsx
// The project's header on card + 12pt graph paper, like the website's project head: its tile,
// name, pulse pill with "N open · N done", the NEXT STEP block, then the projects inside it.
import type { DesktopProject, ProjectPulse } from '@buildos/api-client';
import { StyleSheet, Text, View } from 'react-native';

import { GraphPaper, Inbox, MicroLabel, ProjectTile, PulsePill, Stamp } from '@/components/kit';
import { PULSE_META } from '@/lib/desktop';
import { useInk } from '@/providers/theme-provider';
import { colorMix, typeScale } from '@/theme';

import { countsStamp, type TaskCounts } from './format';
import { SubProjects } from './sub-projects';

export const HEADER_TILE = 46;
/** Horizontal padding of the header and the lists under it. */
export const PAGE_INSET = 14;

export type ProjectHeaderProps = {
	name: string;
	/** The project's tile; null draws the Workspace's inbox glyph. */
	tile: DesktopProject | null;
	pulse: ProjectPulse | null;
	/** Why the pulse is what it is ("finished a task 2 days ago"); read by VoiceOver. */
	pulseReason?: string;
	/** Null until the project read arrives. */
	counts: TaskCounts | null;
	nextStep: string | null;
	/** Shown when there is no next step. */
	description: string | null;
	subProjects: readonly DesktopProject[];
	nestedCounts: ReadonlyMap<string, number>;
	/** Reports the header's height (the tabs continue its graph paper and stick under it). */
	onHeight?: (height: number) => void;
};

export function ProjectHeader({
	name,
	tile,
	pulse,
	pulseReason,
	counts,
	nextStep,
	description,
	subProjects,
	nestedCounts,
	onHeight
}: ProjectHeaderProps) {
	const ink = useInk();
	const { colors } = ink;
	const summary = [
		pulse ? PULSE_META[pulse].label : '',
		pulse && pulseReason ? pulseReason : '',
		counts ? `${counts.open} open, ${counts.done} done` : ''
	]
		.filter(Boolean)
		.join(', ');

	return (
		<View
			onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
			style={[styles.root, { backgroundColor: colors.card }]}
		>
			<GraphPaper cell={12} />
			<View style={styles.top}>
				{tile ? (
					<ProjectTile
						project={tile}
						size={HEADER_TILE}
						hasChildren={subProjects.length > 0}
					/>
				) : (
					<View
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
						style={[
							styles.inbox,
							{
								backgroundColor: colorMix(colors.muted, colors.card, 0.6),
								borderColor: colors.border,
								boxShadow: `inset 0 1px 0 ${ink.highlight}, ${ink.shadows.ink}`
							}
						]}
					>
						<Inbox size={20} strokeWidth={1.9} color={colors.mutedForeground} />
					</View>
				)}
				<View style={styles.titles}>
					<Text
						accessibilityRole="header"
						numberOfLines={2}
						maxFontSizeMultiplier={1.3}
						style={[typeScale.title, { color: colors.foreground }]}
					>
						{name}
					</Text>
					{summary ? (
						<View accessible accessibilityLabel={summary} style={styles.pills}>
							{pulse ? (
								<PulsePill pulse={pulse} style={styles.pill}>
									{counts ? <Stamp size={11}>{countsStamp(counts)}</Stamp> : null}
								</PulsePill>
							) : counts ? (
								<Stamp size={11}>{countsStamp(counts)}</Stamp>
							) : null}
						</View>
					) : null}
				</View>
			</View>

			{nextStep ? (
				<View
					accessible
					accessibilityLabel={`Next step: ${nextStep}`}
					style={[
						styles.next,
						{
							borderColor: colorMix(colors.accent, colors.border, 0.35),
							backgroundColor: colorMix(colors.accent, colors.background, 0.06)
						}
					]}
				>
					<MicroLabel tone="accent">Next step</MicroLabel>
					<Text
						maxFontSizeMultiplier={1.4}
						style={[styles.nextText, { color: colors.foreground }]}
					>
						{nextStep}
					</Text>
				</View>
			) : description ? (
				<Text
					numberOfLines={3}
					maxFontSizeMultiplier={1.4}
					style={[styles.description, { color: colors.mutedForeground }]}
				>
					{description}
				</Text>
			) : null}

			{subProjects.length ? (
				<View style={styles.inside}>
					<SubProjects
						projects={subProjects}
						nestedCounts={nestedCounts}
						inset={PAGE_INSET}
					/>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	root: { paddingTop: 12, paddingBottom: 12, paddingHorizontal: PAGE_INSET },
	top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
	inbox: {
		width: HEADER_TILE,
		height: HEADER_TILE,
		borderRadius: 10,
		borderCurve: 'continuous',
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center'
	},
	titles: { flex: 1, minWidth: 0 },
	pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 5 },
	pill: { borderRadius: 6 },
	next: {
		marginTop: 12,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 10,
		borderCurve: 'continuous',
		borderWidth: 1,
		gap: 4
	},
	nextText: { fontSize: 14.5, lineHeight: 20 },
	description: { marginTop: 10, fontSize: 13.5, lineHeight: 19 },
	inside: { marginTop: 12 }
});
