// apps/mobile/src/components/reader/task-reader.tsx
import { isBuildOsApiError, type TaskUpdateInput } from '@buildos/api-client';
import DateTimePicker from '@react-native-community/datetimepicker';
import { type ComponentRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
	ActionSheetIOS,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View
} from 'react-native';

import { Calendar, Check, Circle, Key, Pencil, playHaptic, Undo2, X } from '@/components/kit';
import { Markdown } from '@/components/markdown';
import { ActionBar, BarKey } from '@/components/reader/action-bar';
import { type DueChoice, dueChoices } from '@/components/reader/due-menu';
import { FactTag } from '@/components/reader/fact-tag';
import { shortDate } from '@/components/reader/format';
import type { ReaderChromeProps } from '@/components/reader/reader-handle';
import { ReaderHead, StatePill, useScrolledPastTop } from '@/components/reader/reader-head';
import { ReaderNote, ReaderStatus, Rise } from '@/components/reader/reader-status';
import { STATE_ICON, StateSwitcher } from '@/components/reader/state-switcher';
import {
	glyphTone,
	isTaskStateKey,
	stateTone,
	taskStateLabel
} from '@/components/reader/task-state';
import { useTask, useUpdateTask } from '@/hooks/use-entities';
import { describeDue, endOfDay } from '@/lib/due-date';
import { bucketOf } from '@/lib/task-buckets';
import { useInk } from '@/providers/theme-provider';
import { radius, spacing, typeScale } from '@/theme';

function describeError(error: unknown): string {
	if (isBuildOsApiError(error)) {
		if (error.isNetworkError) return 'No connection. That change was not saved.';
		if (error.status === 403) return 'This project is view-only for you.';
		return error.message;
	}
	return error instanceof Error ? error.message : 'Could not save that.';
}

/**
 * One task in the reader sheet: state, due date, title and description. Every change saves at
 * once and shows on the list you came from; a failed save puts it back. Leaving (Close, Prev,
 * Next) saves a title or description still being typed first.
 */
export function TaskReader({
	ref,
	taskId,
	position,
	walkLabel,
	leaving,
	onPrev,
	onNext,
	onClose,
	onDirtyChange,
	onEditingChange
}: ReaderChromeProps & { taskId: string }) {
	const ink = useInk();
	const { colors } = ink;
	const query = useTask(taskId);
	const update = useUpdateTask();
	const task = query.data?.task;

	const [title, setTitle] = useState('');
	const [draft, setDraft] = useState<string | null>(null);
	const [picking, setPicking] = useState(false);
	// The inline due menu, where there is no iOS action sheet.
	const [menuOpen, setMenuOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editorFocused, setEditorFocused] = useState(false);
	const titleRef = useRef(title);
	titleRef.current = title;
	const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
	const { scrolled, onScroll, reset: resetScroll } = useScrolledPastTop();

	// A new task in the walk starts clean.
	useEffect(() => {
		setDraft(null);
		setPicking(false);
		setMenuOpen(false);
		setError(null);
		resetScroll();
	}, [taskId, resetScroll]);
	useEffect(() => {
		if (task) setTitle(task.title);
	}, [task?.id, task?.title]);

	const titleDirty = Boolean(task && title.trim() && title.trim() !== task.title);
	const editing = draft !== null;
	const dirty = titleDirty || editing;
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
	useEffect(() => onEditingChange(editing), [editing, onEditingChange]);

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

	const applyDue = (choice: DueChoice) => {
		setMenuOpen(false);
		if (choice.kind === 'pick') {
			setPicking(true);
			return;
		}
		playHaptic('selection');
		void save({ due_at: choice.kind === 'clear' ? null : choice.value });
	};

	const openDueMenu = () => {
		if (!task) return;
		// The tag doubles as the calendar's close control.
		if (picking) {
			setPicking(false);
			return;
		}
		if (Platform.OS !== 'ios') {
			setMenuOpen((open) => !open);
			return;
		}
		const now = new Date();
		const choices = dueChoices(now, Boolean(task.due_at));
		const options = [...choices.map((choice) => choice.label), 'Cancel'];
		const clear = choices.findIndex((choice) => choice.kind === 'clear');
		ActionSheetIOS.showActionSheetWithOptions(
			{
				title: describeDue(task.due_at, now) ?? 'No due date',
				options,
				cancelButtonIndex: options.length - 1,
				destructiveButtonIndex: clear >= 0 ? clear : undefined,
				tintColor: colors.accent,
				userInterfaceStyle: ink.scheme
			},
			(index) => {
				const choice = choices[index];
				if (choice) applyDue(choice);
			}
		);
	};

	if (!task) {
		return (
			// Not flattened: the sheet stretches a scroll view it finds directly inside.
			<View collapsable={false} style={[styles.root, { backgroundColor: colors.background }]}>
				<ReaderHead
					glyph={Circle}
					title={null}
					meta={walkLabel}
					onClose={onClose}
					closing={leaving === 'close'}
				/>
				<ReaderStatus
					error={query.isError ? describeError(query.error) : null}
					onRetry={() => void query.refetch()}
					label="Loading the task"
				/>
				<ActionBar
					word="task"
					position={position}
					leaving={leaving}
					onPrev={onPrev}
					onNext={onNext}
				>
					<BarKey title="Mark done" icon={Check} variant="primary" disabled />
					<BarKey
						title="Close"
						icon={X}
						variant="ghost"
						loading={leaving === 'close'}
						disabled={leaving !== null && leaving !== 'close'}
						onPress={onClose}
					/>
				</ActionBar>
			</View>
		);
	}

	const now = new Date();
	const done = task.state_key === 'done';
	const due = describeDue(task.due_at, now);
	const overdue = bucketOf(task, now) === 'overdue';
	const updated = shortDate(task.updated_at);
	const closeLabel = dirty ? 'Save and close' : 'Close';

	return (
		// Not flattened: the sheet stretches a scroll view it finds directly inside.
		<View collapsable={false} style={[styles.root, { backgroundColor: colors.background }]}>
			<ReaderHead
				glyph={isTaskStateKey(task.state_key) ? STATE_ICON[task.state_key] : Circle}
				glyphColor={colors[glyphTone(task, now)]}
				title={{
					value: title,
					onChange: setTitle,
					onCommit: () => void commitTitle(),
					accessibilityLabel: 'Task title',
					struck: done
				}}
				badge={
					<StatePill
						label={taskStateLabel(task.state_key)}
						color={colors[stateTone(task.state_key)]}
					/>
				}
				meta={walkLabel}
				onClose={onClose}
				closing={leaving === 'close'}
				closeLabel={closeLabel}
				edge={scrolled}
			/>

			{error ? (
				<ReaderNote tone="error" style={styles.pinned}>
					{error}
				</ReaderNote>
			) : null}

			<ScrollView
				key={taskId}
				ref={scrollRef}
				automaticallyAdjustKeyboardInsets
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="interactive"
				onScroll={onScroll}
				scrollEventThrottle={32}
				contentContainerStyle={styles.body}
			>
				<Rise>
					<StateSwitcher
						value={task.state_key}
						onChange={(next) => void save({ state_key: next })}
					/>

					<View style={styles.facts}>
						{task.priority != null ? <FactTag label={`Priority ${task.priority}`} /> : null}
						<FactTag
							icon={Calendar}
							label={due ?? 'No due date'}
							tone={overdue ? 'danger' : 'muted'}
							open={picking || menuOpen}
							onPress={openDueMenu}
							accessibilityLabel={due ?? 'No due date'}
							accessibilityHint={picking ? 'Closes the calendar' : 'Changes the due date'}
						/>
						{updated ? <FactTag label={`Updated ${updated}`} /> : null}
						{editing ? null : (
							<Key
								size="xs"
								icon={Pencil}
								title="Edit"
								accessibilityLabel="Edit description"
								onPress={() => setDraft(task.description ?? '')}
							/>
						)}
					</View>

					{menuOpen ? (
						<View style={styles.menu}>
							{dueChoices(now, Boolean(task.due_at)).map((choice) => (
								<Key
									key={choice.label}
									size="xs"
									variant={choice.kind === 'clear' ? 'ghost' : 'outline'}
									title={choice.label}
									onPress={() => applyDue(choice)}
								/>
							))}
						</View>
					) : null}

					{picking ? (
						<View
							style={[
								styles.picker,
								{ backgroundColor: colors.card, borderColor: colors.border }
							]}
							onLayout={(event) =>
								scrollRef.current?.scrollTo({
									y: Math.max(0, event.nativeEvent.layout.y - spacing.sm),
									animated: true
								})
							}
						>
							<DateTimePicker
								mode="date"
								display={Platform.OS === 'ios' ? 'inline' : 'default'}
								value={task.due_at ? new Date(task.due_at) : now}
								accentColor={colors.accent}
								themeVariant={ink.scheme}
								onChange={(event, date) => {
									if (Platform.OS !== 'ios') setPicking(false);
									if (event.type !== 'set' || !date) return;
									if (Platform.OS === 'ios') setPicking(false);
									playHaptic('selection');
									void save({ due_at: endOfDay(date) });
								}}
							/>
						</View>
					) : null}

					{editing ? (
						<View style={styles.editor}>
							{/* Above the text, so the keyboard never hides them. */}
							<View style={styles.editorKeys}>
								<Key
									title="Cancel"
									size="sm"
									variant="outline"
									style={styles.grow}
									onPress={() => setDraft(null)}
								/>
								<Key
									title="Save"
									size="sm"
									variant="primary"
									style={styles.grow}
									loading={saving}
									onPress={() => {
										void saveDraft().then((ok) => {
											if (ok) playHaptic('success');
										});
									}}
								/>
							</View>
							<TextInput
								accessibilityLabel="Description"
								value={draft ?? ''}
								onChangeText={setDraft}
								onFocus={() => setEditorFocused(true)}
								onBlur={() => setEditorFocused(false)}
								placeholder="Add a description"
								placeholderTextColor={colors.mutedForeground}
								selectionColor={colors.accent}
								multiline
								autoFocus
								textAlignVertical="top"
								style={[
									typeScale.body,
									styles.input,
									{
										color: colors.foreground,
										backgroundColor: colors.card,
										borderColor: editorFocused ? colors.accent : colors.borderStrong
									}
								]}
							/>
						</View>
					) : task.description?.trim() ? (
						<Markdown source={task.description} />
					) : (
						<Text
							maxFontSizeMultiplier={1.4}
							style={[typeScale.meta, { color: colors.mutedForeground }]}
						>
							No description yet.
						</Text>
					)}
				</Rise>
			</ScrollView>

			<ActionBar word="task" position={position} leaving={leaving} onPrev={onPrev} onNext={onNext}>
				<BarKey
					title={done ? 'Reopen' : 'Mark done'}
					icon={done ? Undo2 : Check}
					variant={done ? 'outline' : 'primary'}
					haptic={done ? 'light' : 'success'}
					onPress={() => void save({ state_key: done ? 'todo' : 'done' })}
				/>
				<BarKey
					title="Close"
					icon={X}
					variant="ghost"
					accessibilityLabel={closeLabel}
					loading={leaving === 'close'}
					disabled={leaving !== null && leaving !== 'close'}
					onPress={onClose}
				/>
			</ActionBar>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	pinned: { marginHorizontal: 14, marginBottom: 10 },
	body: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 28 },
	facts: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'center',
		gap: 7,
		marginTop: 12,
		marginBottom: 14
	},
	menu: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: 14 },
	picker: {
		marginBottom: 14,
		padding: spacing.xs,
		borderWidth: 1,
		borderRadius: radius.md,
		overflow: 'hidden'
	},
	editor: { gap: spacing.sm },
	editorKeys: { flexDirection: 'row', gap: spacing.sm },
	grow: { flex: 1 },
	input: {
		minHeight: 180,
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: radius.md
	}
});
