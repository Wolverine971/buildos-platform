// apps/mobile/src/components/reader/task-reader.tsx
import { isBuildOsApiError, type TaskUpdateInput } from '@buildos/api-client';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Markdown } from '@/components/markdown';
import { Chip } from '@/components/reader/chip';
import { ReaderBar } from '@/components/reader/reader-bar';
import type { ReaderHandle } from '@/components/reader/reader-handle';
import { AppText } from '@/components/text';
import { useTask, useUpdateTask } from '@/hooks/use-entities';
import { describeDue, duePicks, endOfDay, isDueOn } from '@/lib/due-date';
import type { WalkPosition } from '@/lib/reader-walk';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

const STATES = [
	{ key: 'todo', label: 'To do' },
	{ key: 'in_progress', label: 'In progress' },
	{ key: 'blocked', label: 'Blocked' },
	{ key: 'done', label: 'Done' }
] as const;

function describeError(error: unknown): string {
	if (isBuildOsApiError(error)) {
		if (error.isNetworkError) return 'No connection. That change was not saved.';
		if (error.status === 403) return 'This project is view-only for you.';
		return error.message;
	}
	return error instanceof Error ? error.message : 'Could not save that.';
}

/**
 * One task, readable and quick to change: state, due date, title and description. Every
 * change saves at once and shows on the list you came from; a failed save puts it back.
 * Leaving (Done, Prev, Next) saves a title or description still being typed first.
 */
export function TaskReader({
	ref,
	taskId,
	position,
	onPrev,
	onNext,
	onDirtyChange
}: {
	ref?: Ref<ReaderHandle>;
	taskId: string;
	position: WalkPosition | null;
	onPrev: () => void;
	onNext: () => void;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const colors = useTheme();
	const query = useTask(taskId);
	const update = useUpdateTask();
	const task = query.data?.task;

	const [title, setTitle] = useState('');
	const [draft, setDraft] = useState<string | null>(null);
	const [picking, setPicking] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const titleRef = useRef(title);
	titleRef.current = title;

	// A new task in the walk starts clean.
	useEffect(() => {
		setDraft(null);
		setPicking(false);
		setError(null);
	}, [taskId]);
	useEffect(() => {
		if (task) setTitle(task.title);
	}, [task?.id, task?.title]);

	const titleDirty = Boolean(task && title.trim() && title.trim() !== task.title);
	const dirty = titleDirty || draft !== null;
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

	const save = async (patch: TaskUpdateInput): Promise<boolean> => {
		setError(null);
		try {
			await update.mutateAsync({ taskId, patch });
			return true;
		} catch (cause) {
			setError(describeError(cause));
			return false;
		}
	};

	const commitTitle = async (): Promise<boolean> => {
		if (!task) return true;
		const next = titleRef.current.trim();
		if (!next) {
			setTitle(task.title);
			return true;
		}
		return next === task.title ? true : save({ title: next });
	};

	const saveDraft = async (): Promise<boolean> => {
		if (draft === null) return true;
		setSaving(true);
		const ok = await save({ description: draft.trim() ? draft : null });
		setSaving(false);
		if (ok) setDraft(null);
		return ok;
	};

	useImperativeHandle(ref, () => ({
		flush: async () => (await commitTitle()) && (await saveDraft())
	}));

	if (!task) {
		return (
			<View style={{ flex: 1, backgroundColor: colors.background }}>
				<View
					style={{
						flex: 1,
						alignItems: 'center',
						justifyContent: 'center',
						padding: spacing.lg,
						gap: spacing.md
					}}
				>
					{query.isError ? (
						<>
							<AppText variant="error" style={{ textAlign: 'center' }}>
								{describeError(query.error)}
							</AppText>
							<Button
								title="Try again"
								variant="ghost"
								onPress={() => void query.refetch()}
							/>
						</>
					) : (
						<ActivityIndicator
							color={colors.accent}
							accessibilityLabel="Loading the task"
						/>
					)}
				</View>
				<ReaderBar position={position} onPrev={onPrev} onNext={onNext}>
					<View />
				</ReaderBar>
			</View>
		);
	}

	const done = task.state_key === 'done';
	const now = new Date();
	const picks = duePicks(now);
	const due = describeDue(task.due_at, now);
	const editing = draft !== null;

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<ScrollView
				automaticallyAdjustKeyboardInsets
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
			>
				<TextInput
					accessibilityLabel="Task title"
					value={title}
					onChangeText={setTitle}
					onEndEditing={() => void commitTitle()}
					multiline
					submitBehavior="blurAndSubmit"
					returnKeyType="done"
					style={{
						fontSize: 24,
						lineHeight: 30,
						fontWeight: '700',
						color: colors.foreground,
						textDecorationLine: done ? 'line-through' : 'none',
						padding: 0
					}}
				/>

				<View style={{ gap: spacing.sm }}>
					<AppText variant="label">State</AppText>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
						{STATES.map((state) => (
							<Chip
								key={state.key}
								label={state.label}
								selected={task.state_key === state.key}
								onPress={() => {
									if (task.state_key === state.key) return;
									void Haptics.selectionAsync().catch(() => {});
									void save({ state_key: state.key });
								}}
							/>
						))}
					</View>
				</View>

				<View style={{ gap: spacing.sm }}>
					<AppText variant="label">{due ?? 'No due date'}</AppText>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
						{picks.map((pick) => (
							<Chip
								key={pick.key}
								label={pick.label}
								selected={isDueOn(task.due_at, pick.day)}
								onPress={() => void save({ due_at: pick.value })}
							/>
						))}
						<Chip
							label="Pick a date"
							selected={picking}
							onPress={() => setPicking((open) => !open)}
						/>
						{task.due_at ? (
							<Chip label="Clear" onPress={() => void save({ due_at: null })} />
						) : null}
					</View>
					{picking ? (
						<DateTimePicker
							mode="date"
							display={Platform.OS === 'ios' ? 'inline' : 'default'}
							value={task.due_at ? new Date(task.due_at) : now}
							accentColor={colors.accent}
							onChange={(event, date) => {
								if (Platform.OS !== 'ios') setPicking(false);
								if (event.type !== 'set' || !date) return;
								if (Platform.OS === 'ios') setPicking(false);
								void save({ due_at: endOfDay(date) });
							}}
						/>
					) : null}
				</View>

				<View style={{ gap: spacing.sm }}>
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between'
						}}
					>
						<AppText variant="label">Description</AppText>
						{editing ? null : (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel="Edit description"
								hitSlop={8}
								onPress={() => setDraft(task.description ?? '')}
							>
								<AppText style={{ color: colors.accent, fontWeight: '600' }}>
									Edit
								</AppText>
							</Pressable>
						)}
					</View>
					{editing ? (
						<View style={{ gap: spacing.sm }}>
							<View style={{ flexDirection: 'row', gap: spacing.sm }}>
								<Button
									title="Cancel"
									variant="ghost"
									style={{ flex: 1 }}
									onPress={() => setDraft(null)}
								/>
								<Button
									title="Save"
									style={{ flex: 1 }}
									loading={saving}
									onPress={() => void saveDraft()}
								/>
							</View>
							<TextInput
								accessibilityLabel="Description"
								value={draft ?? ''}
								onChangeText={setDraft}
								multiline
								autoFocus
								textAlignVertical="top"
								style={{
									minHeight: 160,
									padding: spacing.md,
									fontSize: 16,
									lineHeight: 22,
									color: colors.foreground,
									backgroundColor: colors.card,
									borderColor: colors.borderStrong,
									borderWidth: 1,
									borderRadius: radius.md
								}}
							/>
						</View>
					) : task.description?.trim() ? (
						<Markdown source={task.description} />
					) : (
						<AppText variant="muted">No description yet.</AppText>
					)}
				</View>

				{error ? <AppText variant="error">{error}</AppText> : null}
			</ScrollView>

			<ReaderBar position={position} onPrev={onPrev} onNext={onNext}>
				<Button
					title={done ? 'Reopen' : 'Mark done'}
					variant={done ? 'ghost' : 'accent'}
					onPress={() => {
						void Haptics.notificationAsync(
							Haptics.NotificationFeedbackType.Success
						).catch(() => {});
						void save({ state_key: done ? 'todo' : 'done' });
					}}
				/>
			</ReaderBar>
		</View>
	);
}
