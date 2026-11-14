// apps/mobile/src/components/today/repeated.tsx
// The bottom of Today (the web's "More ways in" row and TodayRepeatedSuggestions): Lay it out
// (every project's next move), Talk it through, Close out the day, and the tasks the daily
// brief has suggested every morning for days, with Keep / Snooze / Let go and Undo.
import type { TodayProject, TodayRepeatedSuggestion } from '@buildos/api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Key, MicroLabel, playHaptic, Stamp, Undo2 } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import { REPEATED_DONE_LABEL, type RepeatedChoice } from './picks';
import { SectionHead } from './sections';

export function MoreWaysIn({
	projects,
	showCloseOut,
	onOpenProject,
	onTalk,
	onCloseOut
}: {
	/** Active projects with a next step (the caller filters). */
	projects: TodayProject[];
	showCloseOut: boolean;
	onOpenProject: (projectId: string) => void;
	onTalk: () => void;
	onCloseOut: () => void;
}) {
	const { colors } = useInk();
	const [layout, setLayout] = useState(false);
	return (
		<View style={[styles.more, { borderTopColor: withAlpha(colors.border, 0.7) }]}>
			<View style={styles.keys}>
				{projects.length > 0 ? (
					<Key
						title="Lay it out"
						size="sm"
						haptic="selection"
						accessibilityHint={
							layout
								? 'Hides every project’s next move'
								: 'Shows every project’s next move'
						}
						onPress={() => setLayout((on) => !on)}
					/>
				) : null}
				<Key title="Talk it through" size="sm" haptic="selection" onPress={onTalk} />
				{showCloseOut ? (
					<Key
						title="Close out the day"
						size="sm"
						haptic="selection"
						onPress={onCloseOut}
					/>
				) : null}
			</View>
			{layout ? (
				<View>
					<MicroLabel style={styles.layoutHead}>Every project's next move</MicroLabel>
					{projects.map((project) => (
						<Pressable
							key={project.id}
							accessibilityRole="button"
							accessibilityLabel={`${project.name}: ${project.next_step_short ?? ''}`}
							accessibilityHint="Opens the project"
							onPress={() => {
								playHaptic('selection');
								onOpenProject(project.id);
							}}
							style={({ pressed }) => [
								styles.layoutRow,
								{ borderBottomColor: withAlpha(colors.border, 0.7) },
								pressed && { backgroundColor: withAlpha(colors.muted, 0.7) }
							]}
						>
							<Text
								numberOfLines={1}
								maxFontSizeMultiplier={1.5}
								style={[typeScale.row, { color: colors.foreground }]}
							>
								{project.name}
							</Text>
							<Text
								maxFontSizeMultiplier={1.5}
								style={[typeScale.meta, { color: colors.mutedForeground }]}
							>
								{project.next_step_short}
							</Text>
						</Pressable>
					))}
				</View>
			) : null}
		</View>
	);
}

export function RepeatedSuggestions({
	items,
	onChoose,
	onUndo
}: {
	items: TodayRepeatedSuggestion[];
	/** Resolve false when the save failed. */
	onChoose: (item: TodayRepeatedSuggestion, choice: RepeatedChoice) => Promise<boolean>;
	onUndo: (item: TodayRepeatedSuggestion, choice: RepeatedChoice) => Promise<boolean>;
}) {
	const { colors } = useInk();
	const [chosen, setChosen] = useState<Record<string, RepeatedChoice>>({});
	if (items.length === 0) return null;

	const drop = (taskId: string) =>
		setChosen((current) => {
			const { [taskId]: _removed, ...rest } = current;
			return rest;
		});

	const choose = async (item: TodayRepeatedSuggestion, choice: RepeatedChoice) => {
		setChosen((current) => ({ ...current, [item.task_id]: choice }));
		if (!(await onChoose(item, choice))) drop(item.task_id);
	};

	const undo = async (item: TodayRepeatedSuggestion) => {
		const choice = chosen[item.task_id];
		if (!choice) return;
		drop(item.task_id);
		if (!(await onUndo(item, choice)))
			setChosen((current) => ({ ...current, [item.task_id]: choice }));
	};

	return (
		<View>
			<SectionHead title="Your brief keeps suggesting these" />
			<Text
				maxFontSizeMultiplier={1.5}
				style={[typeScale.meta, styles.lede, { color: colors.mutedForeground }]}
			>
				They haven't moved. Keep them, snooze them, or let them go, and they'll stop showing
				up.
			</Text>
			{items.map((item) => {
				const choice = chosen[item.task_id];
				return (
					<View
						key={item.task_id}
						style={[styles.row, { borderBottomColor: withAlpha(colors.border, 0.7) }]}
					>
						<View style={styles.rowHead}>
							<Stamp>{`${item.days} ${item.days === 1 ? 'day' : 'days'}`}</Stamp>
							<View style={styles.rowText}>
								<Text
									maxFontSizeMultiplier={1.5}
									style={[
										typeScale.row,
										choice
											? {
													color: colors.mutedForeground,
													textDecorationLine: 'line-through',
													fontWeight: '400'
												}
											: { color: colors.foreground }
									]}
								>
									{item.title}
								</Text>
								<Text
									numberOfLines={1}
									maxFontSizeMultiplier={1.4}
									style={[typeScale.small, { color: colors.mutedForeground }]}
								>
									{choice ? REPEATED_DONE_LABEL[choice] : item.project_name}
								</Text>
							</View>
						</View>
						<View style={styles.choices}>
							{choice ? (
								<Key
									title="Undo"
									icon={Undo2}
									variant="ghost"
									size="xs"
									onPress={() => void undo(item)}
								/>
							) : (
								<>
									<Key
										title="Keep"
										variant="ghost"
										size="xs"
										haptic="selection"
										onPress={() => void choose(item, 'keep')}
									/>
									<Key
										title="Snooze"
										variant="ghost"
										size="xs"
										haptic="selection"
										onPress={() => void choose(item, 'snooze')}
									/>
									<Key
										title="Let go"
										variant="ghost"
										size="xs"
										haptic="selection"
										onPress={() => void choose(item, 'let_go')}
									/>
								</>
							)}
						</View>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	more: { gap: 12, paddingTop: 14, borderTopWidth: 1 },
	keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	layoutHead: { marginBottom: 4 },
	layoutRow: {
		gap: 2,
		paddingVertical: 10,
		paddingHorizontal: 4,
		borderBottomWidth: 1,
		borderRadius: 6
	},
	lede: { marginBottom: 6 },
	row: { gap: 6, paddingVertical: 10, borderBottomWidth: 1 },
	rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
	rowText: { flex: 1, minWidth: 0, gap: 2 },
	choices: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }
});
