// apps/mobile/src/components/workspace/project-peek.tsx
// What a long press on a tile shows (iOS Link.Preview): a small version of the project's
// header, its next step and its open tasks by where they stand. Like the website's hover
// card. iOS needs the size before it renders, so every text is clamped to peekLayout().
import type { DesktopProject } from '@buildos/api-client';
import { StyleSheet, Text, View } from 'react-native';

import { GraphPaper, MicroLabel, ProjectTile, PulsePill } from '@/components/kit';
import {
	meterColors,
	openTaskCount,
	PEEK,
	type PeekLayout,
	peekLayout,
	peekNextStep,
	TASK_BUCKET_LABEL,
	TASK_BUCKETS,
	type TaskBucket
} from '@/lib/desktop';
import { useInk } from '@/providers/theme-provider';
import { colorMix, fontFamily } from '@/theme';

export type ProjectPeekProps = {
	project: DesktopProject;
	/** Sub-project count; any draws the tile's folder tab. */
	nested?: number;
	/** Pass the layout used for Link.Preview's size so both agree. */
	layout?: PeekLayout;
};

export function ProjectPeek({ project, nested = 0, layout }: ProjectPeekProps) {
	const { colors } = useInk();
	const size = layout ?? peekLayout(project);
	const next = peekNextStep(project);

	return (
		<View
			style={[
				styles.root,
				{ width: size.width, height: size.height, backgroundColor: colors.background }
			]}
		>
			<View
				style={[
					styles.head,
					{ backgroundColor: colors.card, borderBottomColor: colors.border }
				]}
			>
				<GraphPaper cell={12} />
				<View style={styles.headRow}>
					<ProjectTile project={project} size={PEEK.tile} hasChildren={nested > 0} />
					<Text
						allowFontScaling={false}
						numberOfLines={size.nameLines}
						style={[styles.name, { color: colors.foreground }]}
					>
						{project.name}
					</Text>
				</View>
				{project.pulse ? (
					<View style={styles.pulseRow}>
						<PulsePill pulse={project.pulse} allowFontScaling={false} />
						{size.reasonLines && project.pulse_reason ? (
							<Text
								allowFontScaling={false}
								numberOfLines={size.reasonLines}
								style={[styles.reason, { color: colors.mutedForeground }]}
							>
								{project.pulse_reason}.
							</Text>
						) : null}
					</View>
				) : null}
			</View>

			{size.parts.next || size.parts.mix ? (
				<View style={styles.body}>
					{next ? (
						<View
							style={[
								styles.next,
								{
									borderColor: colorMix(colors.accent, colors.border, 0.35),
									backgroundColor: colorMix(
										colors.accent,
										colors.background,
										0.06
									)
								}
							]}
						>
							<MicroLabel tone="accent" allowFontScaling={false}>
								Next step
							</MicroLabel>
							<Text
								allowFontScaling={false}
								numberOfLines={size.nextLines}
								style={[styles.nextText, { color: colors.foreground }]}
							>
								{next}
							</Text>
						</View>
					) : null}
					{size.parts.mix ? <TaskMix project={project} /> : null}
				</View>
			) : null}
		</View>
	);
}

/** Open tasks as one split bar plus four labeled mono counts (DesktopTaskMix). */
function TaskMix({ project }: { project: DesktopProject }) {
	const { colors } = useInk();
	const meter = meterColors(colors);
	const open = openTaskCount(project.mix);
	const rows: TaskBucket[][] = [
		['overdue', 'in_progress'],
		['scheduled', 'backlog']
	];

	return (
		<View>
			<MicroLabel allowFontScaling={false} style={styles.mixLabel}>
				{`Open tasks · ${open}`}
			</MicroLabel>
			<View style={[styles.bar, { backgroundColor: meter.track }]}>
				{TASK_BUCKETS.filter((bucket) => project.mix[bucket] > 0).map((bucket) => (
					<View
						key={bucket}
						style={{ flex: project.mix[bucket], backgroundColor: meter[bucket] }}
					/>
				))}
			</View>
			<View style={styles.grid}>
				{rows.map((row) => (
					<View key={row.join()} style={styles.gridRow}>
						{row.map((bucket) => {
							const count = project.mix[bucket];
							return (
								<View key={bucket} style={styles.count}>
									<View
										style={[
											styles.swatch,
											{
												backgroundColor: meter[bucket],
												opacity: count ? 1 : 0.35
											}
										]}
									/>
									<Text
										allowFontScaling={false}
										style={[
											styles.countText,
											{
												color: count
													? colors.foreground
													: colors.mutedForeground
											}
										]}
									>
										{count}
									</Text>
									<Text
										allowFontScaling={false}
										numberOfLines={1}
										style={[
											styles.countLabel,
											{ color: colors.mutedForeground }
										]}
									>
										{TASK_BUCKET_LABEL[bucket].toLowerCase()}
									</Text>
								</View>
							);
						})}
					</View>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { overflow: 'hidden' },
	head: {
		paddingTop: PEEK.head.top,
		paddingBottom: PEEK.head.bottom,
		paddingHorizontal: PEEK.padX,
		gap: PEEK.head.gap,
		borderBottomWidth: 1
	},
	headRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: PEEK.head.rowGap,
		minHeight: PEEK.tile
	},
	name: {
		flex: 1,
		fontSize: PEEK.name.size,
		lineHeight: PEEK.name.line,
		fontWeight: '600',
		letterSpacing: -0.3
	},
	pulseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: PEEK.pill.gap },
	reason: {
		flex: 1,
		paddingTop: PEEK.reason.offset,
		fontSize: PEEK.reason.size,
		lineHeight: PEEK.reason.line
	},
	body: {
		paddingTop: PEEK.body.top,
		paddingBottom: PEEK.body.bottom,
		paddingHorizontal: PEEK.padX,
		gap: PEEK.body.gap
	},
	next: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: PEEK.next.padX,
		paddingVertical: PEEK.next.padY,
		gap: PEEK.next.labelGap
	},
	nextText: { fontSize: PEEK.next.size, lineHeight: PEEK.next.line },
	mixLabel: { marginBottom: PEEK.mix.labelGap },
	bar: {
		flexDirection: 'row',
		height: PEEK.mix.bar,
		borderRadius: PEEK.mix.bar / 2,
		overflow: 'hidden',
		marginBottom: PEEK.mix.barGap
	},
	grid: { gap: PEEK.mix.rowGap },
	gridRow: { flexDirection: 'row', height: PEEK.mix.row },
	count: { flex: 1, flexDirection: 'row', alignItems: 'center' },
	swatch: { width: 8, height: 8, borderRadius: 2, marginRight: 6 },
	countText: {
		fontFamily: fontFamily.mono,
		fontSize: 12,
		lineHeight: PEEK.mix.row,
		fontWeight: '600',
		fontVariant: ['tabular-nums'],
		marginRight: 5
	},
	countLabel: { flexShrink: 1, fontSize: 12.5, lineHeight: PEEK.mix.row }
});
