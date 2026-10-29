// apps/mobile/src/components/reader/doc-reader.tsx
import { isBuildOsApiError } from '@buildos/api-client';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Markdown } from '@/components/markdown';
import { ReaderBar } from '@/components/reader/reader-bar';
import type { ReaderHandle } from '@/components/reader/reader-handle';
import { AppText } from '@/components/text';
import { useDocument, useUpdateDocument } from '@/hooks/use-entities';
import type { WalkPosition } from '@/lib/reader-walk';
import { useTheme } from '@/providers/theme-provider';
import { radius, spacing } from '@/theme';

/** Tables are edited row by row on the website; their text is generated from the rows. */
const TABLE_TYPE_KEY = 'document.table';
const isTable = (typeKey: string | null | undefined) =>
	typeKey === TABLE_TYPE_KEY || Boolean(typeKey?.startsWith(`${TABLE_TYPE_KEY}.`));

const isConflict = (error: unknown) => isBuildOsApiError(error) && error.status === 409;

function describeError(error: unknown): string {
	if (isBuildOsApiError(error)) {
		if (error.isNetworkError) {
			return 'No connection. Your text is still here; save again when you are back online.';
		}
		if (error.status === 403) return 'This project is view-only for you.';
		return error.message;
	}
	return error instanceof Error ? error.message : 'Could not save that.';
}

function edited(updatedAt: string): string {
	const date = new Date(updatedAt);
	if (Number.isNaN(date.getTime())) return '';
	return `Edited ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/**
 * One doc, formatted for reading, editable as plain text. An edit is based on the revision on
 * screen when Edit was tapped, so a save never overwrites a newer edit made somewhere else; on
 * a clash the person keeps their text and chooses. Leaving saves what is still being typed.
 */
export function DocReader({
	ref,
	documentId,
	position,
	onPrev,
	onNext,
	onDirtyChange
}: {
	ref?: Ref<ReaderHandle>;
	documentId: string;
	position: WalkPosition | null;
	onPrev: () => void;
	onNext: () => void;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const colors = useTheme();
	const query = useDocument(documentId);
	const update = useUpdateDocument(documentId);
	const doc = query.data?.document;

	const [title, setTitle] = useState('');
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [conflict, setConflict] = useState(false);
	const titleRef = useRef(title);
	titleRef.current = title;
	/** The revision the open edit is based on; moves forward with this phone's own title saves. */
	const draftRevision = useRef<string | undefined>(undefined);

	useEffect(() => {
		setDraft(null);
		setError(null);
		setConflict(false);
		draftRevision.current = undefined;
	}, [documentId]);
	useEffect(() => {
		if (doc) setTitle(doc.title ?? '');
	}, [doc?.id, doc?.title]);

	const titleDirty = Boolean(doc && title.trim() && title.trim() !== (doc.title ?? ''));
	const dirty = titleDirty || draft !== null;
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

	const commitTitle = async (): Promise<boolean> => {
		if (!doc) return true;
		const next = titleRef.current.trim();
		if (!next) {
			setTitle(doc.title ?? '');
			return true;
		}
		if (next === (doc.title ?? '')) return true;
		setError(null);
		try {
			await update.mutateAsync({
				documentId,
				patch: { title: next },
				// An open body edit was based on the revision before this rename; keep it current.
				onSaved: (previous, saved) => {
					if (draftRevision.current === previous) draftRevision.current = saved;
				}
			});
			return true;
		} catch (cause) {
			if (isConflict(cause)) {
				setError('This doc changed somewhere else, so the new title was not saved.');
				setTitle(doc.title ?? '');
				void query.refetch();
				return true;
			}
			setError(describeError(cause));
			return false;
		}
	};

	const saveDraft = async (): Promise<boolean> => {
		if (draft === null) return true;
		if (conflict) return false;
		setSaving(true);
		setError(null);
		try {
			await update.mutateAsync({
				documentId,
				patch: { body_markdown: draft },
				revision: () => draftRevision.current
			});
			setDraft(null);
			return true;
		} catch (cause) {
			if (isConflict(cause)) setConflict(true);
			else setError(describeError(cause));
			return false;
		} finally {
			setSaving(false);
		}
	};

	useImperativeHandle(ref, () => ({
		flush: async () => (await commitTitle()) && (await saveDraft())
	}));

	if (!doc) {
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
							accessibilityLabel="Loading the doc"
						/>
					)}
				</View>
				<ReaderBar position={position} onPrev={onPrev} onNext={onNext}>
					<View />
				</ReaderBar>
			</View>
		);
	}

	const editing = draft !== null;
	const table = isTable(doc.type_key);
	// Edit only from settled data: text and revision must come from the same read.
	const canEdit = !table && !query.isFetching && Boolean(query.data?.editor_revision);

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<ScrollView
				automaticallyAdjustKeyboardInsets
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
			>
				<TextInput
					accessibilityLabel="Doc title"
					value={title}
					onChangeText={setTitle}
					onEndEditing={() => void commitTitle()}
					placeholder="Untitled"
					placeholderTextColor={colors.mutedForeground}
					multiline
					submitBehavior="blurAndSubmit"
					returnKeyType="done"
					style={{
						fontSize: 24,
						lineHeight: 30,
						fontWeight: '700',
						color: colors.foreground,
						padding: 0
					}}
				/>
				<AppText variant="muted">{edited(doc.updated_at)}</AppText>

				{conflict ? (
					<View
						style={{
							gap: spacing.sm,
							padding: spacing.md,
							borderRadius: radius.md,
							borderWidth: 1,
							borderColor: colors.warning,
							backgroundColor: colors.card
						}}
					>
						<AppText>
							Someone saved a newer version of this doc while you were editing. Your
							text is still below: copy what you need, then load their version.
						</AppText>
						<Button
							title="Load their version"
							variant="ghost"
							onPress={() => {
								setDraft(null);
								setConflict(false);
								draftRevision.current = undefined;
								void query.refetch();
							}}
						/>
					</View>
				) : null}

				{editing ? (
					<View style={{ gap: spacing.sm }}>
						{/* Above the text, so the keyboard never hides them. */}
						<View style={{ flexDirection: 'row', gap: spacing.sm }}>
							<Button
								title="Cancel"
								variant="ghost"
								style={{ flex: 1 }}
								onPress={() => {
									setDraft(null);
									setConflict(false);
								}}
							/>
							<Button
								title="Save"
								style={{ flex: 1 }}
								loading={saving}
								disabled={conflict}
								onPress={() => void saveDraft()}
							/>
						</View>
						<TextInput
							accessibilityLabel="Doc text"
							value={draft ?? ''}
							onChangeText={setDraft}
							multiline
							autoFocus
							textAlignVertical="top"
							style={{
								minHeight: 320,
								padding: spacing.md,
								fontSize: 16,
								lineHeight: 23,
								color: colors.foreground,
								backgroundColor: colors.card,
								borderColor: colors.borderStrong,
								borderWidth: 1,
								borderRadius: radius.md
							}}
						/>
					</View>
				) : doc.content?.trim() ? (
					<Markdown source={doc.content} />
				) : (
					<AppText variant="muted">This doc is empty.</AppText>
				)}

				{table && !editing ? (
					<AppText variant="muted">
						This doc is a table; edit its rows on the website.
					</AppText>
				) : null}
				{error ? <AppText variant="error">{error}</AppText> : null}
			</ScrollView>

			<ReaderBar position={position} onPrev={onPrev} onNext={onNext}>
				{editing ? (
					<AppText variant="muted" style={{ textAlign: 'center' }}>
						Editing
					</AppText>
				) : (
					<Button
						title="Edit"
						variant="ghost"
						disabled={!canEdit}
						onPress={() => {
							draftRevision.current = query.data?.editor_revision;
							setDraft(doc.content ?? '');
						}}
					/>
				)}
			</ReaderBar>
		</View>
	);
}
