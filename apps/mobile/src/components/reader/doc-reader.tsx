// apps/mobile/src/components/reader/doc-reader.tsx
import { isBuildOsApiError } from '@buildos/api-client';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Check, FileText, Key, Pencil, playHaptic, Stamp, Undo2, X } from '@/components/kit';
import { Markdown } from '@/components/markdown';
import { ActionBar, BarKey } from '@/components/reader/action-bar';
import { shortDate } from '@/components/reader/format';
import type { ReaderChromeProps } from '@/components/reader/reader-handle';
import { ReaderHead, useScrolledPastTop } from '@/components/reader/reader-head';
import { ReaderNote, ReaderStatus, Rise } from '@/components/reader/reader-status';
import { useDocument, useUpdateDocument } from '@/hooks/use-entities';
import { useInk } from '@/providers/theme-provider';
import { radius, spacing, typeScale } from '@/theme';

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

/**
 * One doc in the reader sheet, formatted for reading, editable as plain text. An edit is based
 * on the revision on screen when Edit was tapped, so a save never overwrites a newer edit made
 * somewhere else; on a clash the person keeps their text and chooses. Leaving saves what is
 * still being typed.
 */
export function DocReader({
	ref,
	documentId,
	position,
	walkLabel,
	leaving,
	onPrev,
	onNext,
	onClose,
	onDirtyChange,
	onEditingChange
}: ReaderChromeProps & { documentId: string }) {
	const { colors } = useInk();
	const query = useDocument(documentId);
	const update = useUpdateDocument(documentId);
	const doc = query.data?.document;

	const [title, setTitle] = useState('');
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [conflict, setConflict] = useState(false);
	const [editorFocused, setEditorFocused] = useState(false);
	const titleRef = useRef(title);
	titleRef.current = title;
	/** The revision the open edit is based on; moves forward with this phone's own title saves. */
	const draftRevision = useRef<string | undefined>(undefined);
	const { scrolled, onScroll, reset: resetScroll } = useScrolledPastTop();

	useEffect(() => {
		setDraft(null);
		setError(null);
		setConflict(false);
		draftRevision.current = undefined;
		resetScroll();
	}, [documentId, resetScroll]);
	useEffect(() => {
		if (doc) setTitle(doc.title ?? '');
	}, [doc?.id, doc?.title]);

	const titleDirty = Boolean(doc && title.trim() && title.trim() !== (doc.title ?? ''));
	const editing = draft !== null;
	const dirty = titleDirty || editing;
	useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
	useEffect(() => onEditingChange(editing), [editing, onEditingChange]);

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
			// Not flattened: the sheet stretches a scroll view it finds directly inside.
			<View collapsable={false} style={[styles.root, { backgroundColor: colors.background }]}>
				<ReaderHead
					glyph={FileText}
					title={null}
					meta={walkLabel}
					onClose={onClose}
					closing={leaving === 'close'}
				/>
				<ReaderStatus
					error={query.isError ? describeError(query.error) : null}
					onRetry={() => void query.refetch()}
					label="Loading the doc"
				/>
				<ActionBar
					word="doc"
					position={position}
					leaving={leaving}
					onPrev={onPrev}
					onNext={onNext}
				>
					<BarKey title="Edit" icon={Pencil} variant="outline" disabled />
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

	const table = isTable(doc.type_key);
	// Edit only from settled data: text and revision must come from the same read.
	const canEdit = !table && !query.isFetching && Boolean(query.data?.editor_revision);
	const edited = shortDate(doc.updated_at);
	const closeLabel = dirty ? 'Save and close' : 'Close';

	const startEdit = () => {
		draftRevision.current = query.data?.editor_revision;
		setDraft(doc.content ?? '');
	};
	const cancelEdit = () => {
		setDraft(null);
		setConflict(false);
	};
	const loadTheirs = () => {
		setDraft(null);
		setConflict(false);
		draftRevision.current = undefined;
		void query.refetch();
	};

	return (
		// Not flattened: the sheet stretches a scroll view it finds directly inside.
		<View collapsable={false} style={[styles.root, { backgroundColor: colors.background }]}>
			<ReaderHead
				glyph={FileText}
				title={{
					value: title,
					onChange: setTitle,
					onCommit: () => void commitTitle(),
					accessibilityLabel: 'Doc title',
					placeholder: 'Untitled'
				}}
				badge={edited ? <Stamp size={11.5}>{`Edited ${edited}`}</Stamp> : null}
				meta={walkLabel}
				onClose={onClose}
				closing={leaving === 'close'}
				closeLabel={closeLabel}
				edge={editing || scrolled}
			/>

			{error ? (
				<ReaderNote tone="error" style={styles.pinned}>
					{error}
				</ReaderNote>
			) : null}
			{conflict ? (
				<ReaderNote
					tone="warning"
					style={styles.pinned}
					action={
						<Key
							title="Load their version"
							size="sm"
							variant="outline"
							onPress={loadTheirs}
						/>
					}
				>
					Someone saved a newer version of this doc while you were editing. Your text is
					still below: copy what you need, then load their version.
				</ReaderNote>
			) : null}

			{editing ? (
				<View style={styles.editorWrap}>
					<TextInput
						accessibilityLabel="Doc text"
						value={draft ?? ''}
						onChangeText={setDraft}
						onFocus={() => setEditorFocused(true)}
						onBlur={() => setEditorFocused(false)}
						placeholder="Start writing"
						placeholderTextColor={colors.mutedForeground}
						selectionColor={colors.accent}
						multiline
						textAlignVertical="top"
						style={[
							typeScale.body,
							styles.editor,
							{
								color: colors.foreground,
								backgroundColor: colors.card,
								borderColor: editorFocused ? colors.accent : colors.borderStrong
							}
						]}
					/>
				</View>
			) : (
				<ScrollView
					key={documentId}
					keyboardShouldPersistTaps="handled"
					onScroll={onScroll}
					scrollEventThrottle={32}
					contentContainerStyle={styles.body}
				>
					<Rise>
						{doc.content?.trim() ? (
							<Markdown source={doc.content} />
						) : (
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.meta, { color: colors.mutedForeground }]}
							>
								This doc is empty.
							</Text>
						)}
						{table ? (
							<ReaderNote tone="info" style={styles.tableNote}>
								This doc is a table; edit its rows on the website.
							</ReaderNote>
						) : null}
					</Rise>
				</ScrollView>
			)}

			<ActionBar
				word="doc"
				position={position}
				leaving={leaving}
				onPrev={onPrev}
				onNext={onNext}
				liftWithKeyboard={editing}
			>
				{editing ? (
					<>
						<BarKey
							title="Cancel"
							icon={Undo2}
							variant="outline"
							accessibilityLabel="Cancel editing"
							onPress={cancelEdit}
						/>
						<BarKey
							title="Save"
							icon={Check}
							variant="primary"
							loading={saving}
							disabled={conflict}
							onPress={() => {
								void saveDraft().then((ok) => {
									if (ok) playHaptic('success');
								});
							}}
						/>
					</>
				) : (
					<>
						<BarKey
							title="Edit"
							icon={Pencil}
							variant="outline"
							disabled={!canEdit}
							accessibilityHint={table ? 'Tables are edited on the website' : undefined}
							onPress={startEdit}
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
					</>
				)}
			</ActionBar>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	pinned: { marginHorizontal: 14, marginBottom: 10 },
	body: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 28 },
	tableNote: { marginTop: spacing.lg },
	editorWrap: { flex: 1, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
	editor: {
		flex: 1,
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: radius.md
	}
});
