// apps/mobile/src/components/inbox/check-ins.tsx
// Check-ins (the web's InboxCheckIns): "Did this happen?" for overdue tasks, grouped by due
// day — swipe right Done, left Drop, or Tomorrow to move it — and "Still on?" once for a
// project nothing touched in 45 days (Pause it / It's finished / Still on, which opens the
// task list). Plus the email strip: updates the nightly email read proposed (Apply / Not now).
import type { CheckInProject, CheckInTask, EmailUpdateEntry } from '@buildos/api-client';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Check, Clock, Key, Mail, MicroLabel, Stamp, SwipeRow, X } from '@/components/kit';
import type { InboxController } from '@/hooks/use-inbox';
import { civilDay } from '@/lib/due-date';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import { Card, TextKey } from './parts';

/** A due day shows this many tasks, then "Show N more". */
const FOLD_AT = 5;

function tomorrow(): string {
	const date = new Date();
	date.setDate(date.getDate() + 1);
	return civilDay(date);
}

export function CheckInCard({
	project,
	inbox
}: {
	project: CheckInProject;
	inbox: InboxController;
}) {
	const { colors } = useInk();
	const [expanded, setExpanded] = useState(false);
	const [showAll, setShowAll] = useState<Record<string, boolean>>({});
	const askStillOn = project.quiet && !expanded;
	const taskCount = project.groups.reduce((total, group) => total + group.tasks.length, 0);

	return (
		<Card>
			<View style={styles.head}>
				<MicroLabel>{askStillOn ? 'Still on?' : 'Did this happen?'}</MicroLabel>
			</View>
			{askStillOn ? (
				<>
					<Text
						maxFontSizeMultiplier={1.6}
						style={[typeScale.meta, { color: colors.foreground }]}
					>
						Nothing in {project.project_name} has moved
						{project.last_touched_date
							? ` since ${project.last_touched_date}`
							: ' in a while'}
						, and {project.overdue_count} task
						{project.overdue_count === 1 ? ' is' : 's are'} overdue.
					</Text>
					<View style={styles.keys}>
						<Key
							title="Pause it"
							variant="primary"
							size="sm"
							accessibilityHint="Recommended. Pauses the project; its tasks stop showing as overdue."
							onPress={() => inbox.answerProject(project, 'pause')}
						/>
						<Key
							title="It's finished"
							size="sm"
							accessibilityHint="Marks the project complete."
							onPress={() => inbox.answerProject(project, 'finish')}
						/>
						<Key
							title="Still on"
							variant="ghost"
							size="sm"
							accessibilityHint={`Go through the ${project.overdue_count} tasks one by one.`}
							onPress={() => setExpanded(true)}
						/>
					</View>
				</>
			) : (
				<>
					{project.groups.map((group) => (
						<View key={group.key}>
							<View
								style={[
									styles.dueHead,
									{ borderBottomColor: withAlpha(colors.border, 0.7) }
								]}
							>
								<MicroLabel>Due {group.label}</MicroLabel>
								<Stamp>({group.tasks.length})</Stamp>
							</View>
							{(showAll[group.key] ? group.tasks : group.tasks.slice(0, FOLD_AT)).map(
								(task) => (
									<TaskRow key={task.id} task={task} inbox={inbox} />
								)
							)}
							{!showAll[group.key] && group.tasks.length > FOLD_AT ? (
								<TextKey
									label={`Show ${group.tasks.length - FOLD_AT} more`}
									tone="muted"
									onPress={() =>
										setShowAll((current) => ({ ...current, [group.key]: true }))
									}
								/>
							) : null}
						</View>
					))}
					{taskCount > 1 ? (
						<Key
							title={`Mark all ${taskCount} done`}
							icon={Check}
							size="sm"
							haptic="success"
							onPress={() => inbox.markAllDone(project)}
						/>
					) : null}
				</>
			)}
		</Card>
	);
}

function TaskRow({ task, inbox }: { task: CheckInTask; inbox: InboxController }) {
	const { colors } = useInk();
	return (
		<SwipeRow
			face={colors.card}
			right={{
				label: 'Done',
				icon: Check,
				tone: 'success',
				onSwipe: () => inbox.answerTask(task, 'done')
			}}
			left={{
				label: 'Drop',
				icon: X,
				tone: 'muted',
				onSwipe: () => inbox.answerTask(task, 'drop')
			}}
			style={[styles.task, { borderBottomColor: withAlpha(colors.border, 0.7) }]}
		>
			<View style={styles.taskBody}>
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.row, styles.taskTitle, { color: colors.foreground }]}
				>
					{task.title}
				</Text>
				<View style={styles.taskKeys}>
					<Key
						icon={Check}
						size="xs"
						haptic="success"
						accessibilityLabel={`Done: ${task.title}`}
						onPress={() => inbox.answerTask(task, 'done')}
					/>
					<Key
						icon={Clock}
						size="xs"
						accessibilityLabel={`Move to tomorrow: ${task.title}`}
						onPress={() => inbox.answerTask(task, 'move', tomorrow())}
					/>
					<Key
						icon={X}
						size="xs"
						variant="ghost"
						accessibilityLabel={`Drop: ${task.title}`}
						onPress={() => inbox.answerTask(task, 'drop')}
					/>
				</View>
			</View>
		</SwipeRow>
	);
}

export function EmailUpdateCard({
	entry,
	inbox
}: {
	entry: EmailUpdateEntry;
	inbox: InboxController;
}) {
	const { colors } = useInk();
	const from = entry.email.from.replace(/<[^>]*>/, '').trim();
	return (
		<Card>
			<View style={styles.head}>
				<Mail size={13} strokeWidth={2.25} color={colors.mutedForeground} />
				<MicroLabel>From your email</MicroLabel>
				{entry.project_name ? (
					<Text
						numberOfLines={1}
						style={[typeScale.small, styles.project, { color: colors.mutedForeground }]}
					>
						{entry.project_name}
					</Text>
				) : null}
			</View>
			<Text maxFontSizeMultiplier={1.6} style={[typeScale.row, { color: colors.foreground }]}>
				{entry.title}
			</Text>
			{entry.why ? (
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					{entry.why}
				</Text>
			) : null}
			<Text numberOfLines={2} style={[typeScale.small, { color: colors.mutedForeground }]}>
				“{entry.email.subject}”{from ? ` — ${from}` : ''}
			</Text>
			<View style={styles.keys}>
				<Key
					title="Apply"
					icon={Check}
					variant="primary"
					size="sm"
					haptic="success"
					onPress={() => inbox.decideEmail(entry, 'apply')}
				/>
				<Key
					title="Not now"
					variant="ghost"
					size="sm"
					onPress={() => inbox.decideEmail(entry, 'dismiss')}
				/>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	project: { flex: 1, minWidth: 0, textAlign: 'right' },
	keys: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
	dueHead: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingBottom: 4,
		borderBottomWidth: 1
	},
	task: { borderBottomWidth: 1, borderRadius: 0 },
	taskBody: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
	taskTitle: { flex: 1, minWidth: 0 },
	taskKeys: { flexDirection: 'row', gap: 6 }
});
