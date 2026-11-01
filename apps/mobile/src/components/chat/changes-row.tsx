// apps/mobile/src/components/chat/changes-row.tsx
// What a turn changed, at the end of the turn, the way the website shows it under a reply:
// chips for what the agent created (tap opens it), a card per document it edited ("+4 −1",
// expands to the diff, one-tap Undo) and per table it wrote ("+3 rows · 7 cells", Undo).
import { memo, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import {
	AlertTriangle,
	Calendar,
	Check,
	ChevronDown,
	FileText,
	Flag,
	FolderKanban,
	type Icon,
	Key,
	ListChecks,
	MicroLabel,
	playHaptic,
	Sparkles,
	Table,
	Target,
	Undo2
} from '@/components/kit';
import {
	type CreatedEntity,
	type CreatedEntityKind,
	describeDocumentChange,
	describeSavedInProject,
	describeTableChange,
	DOCUMENT_UNDO_TOO_LARGE,
	type DocumentChange,
	ENTITY_KIND_LABEL,
	type TableChange
} from '@/lib/chat/changes';
import type { ChangesRow } from '@/lib/chat/session-store';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { fontFamily, radius, spacing, typeScale, withAlpha } from '@/theme';

import { useChatActions } from './chat-actions';

const KIND_ICON: Record<CreatedEntityKind, Icon> = {
	project: FolderKanban,
	task: ListChecks,
	goal: Target,
	plan: Calendar,
	document: FileText,
	milestone: Flag,
	risk: AlertTriangle
};

/** Diff lines rendered before the card points to version history instead. */
const DIFF_LINE_LIMIT = 60;

export const ChangesBlock = memo(function ChangesBlock({ row }: { row: ChangesRow }) {
	const { created, documents, tables } = row.changes;
	const projects = created.filter((entity) => entity.kind === 'project');
	const details = created.filter((entity) => entity.kind !== 'project');
	return (
		<View style={styles.block}>
			{projects.map((project) => (
				<ProjectSaved
					key={project.id}
					project={project}
					related={details.filter((entity) => entity.projectId === project.id)}
				/>
			))}
			{details.length ? <CreatedChips entities={details} /> : null}
			{documents.length ? (
				<Section
					icon={FileText}
					label={
						documents.length === 1 ? 'Edited' : `Edited ${documents.length} documents`
					}
				>
					{documents.map((change) => (
						<DocumentCard key={change.id} row={row} change={change} />
					))}
				</Section>
			) : null}
			{tables.length ? (
				<Section
					icon={Table}
					label={
						tables.length === 1 ? 'Table changed' : `${tables.length} tables changed`
					}
				>
					{tables.map((change) => (
						<TableCard key={change.id} row={row} change={change} />
					))}
				</Section>
			) : null}
		</View>
	);
});

function Section({
	icon: Glyph,
	label,
	children
}: {
	icon: Icon;
	label: string;
	children: React.ReactNode;
}) {
	const { colors } = useInk();
	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<Glyph size={12} color={colors.accent} />
				<MicroLabel>{label}</MicroLabel>
			</View>
			{children}
		</View>
	);
}

/** A project the agent started this conversation: the one card that opens it. */
function ProjectSaved({ project, related }: { project: CreatedEntity; related: CreatedEntity[] }) {
	const ink = useInk();
	const { colors } = ink;
	const actions = useChatActions();
	const saved = describeSavedInProject(related);
	const task = related.find((entity) => entity.kind === 'task');
	return (
		<View
			accessibilityRole="summary"
			accessibilityLabel={`Saved project: ${project.name}`}
			style={[
				styles.project,
				{
					backgroundColor: withAlpha(colors.accent, 0.05),
					borderColor: withAlpha(colors.accent, 0.3),
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<MicroLabel tone="accent">Project saved</MicroLabel>
			<Text
				maxFontSizeMultiplier={1.4}
				style={[typeScale.section, { color: colors.foreground }]}
			>
				{project.name}
			</Text>
			<Text
				maxFontSizeMultiplier={1.4}
				style={[typeScale.meta, { color: colors.mutedForeground }]}
			>
				{saved
					? `Saved in this conversation: ${saved}.`
					: 'Open what’s saved, or keep shaping it here.'}
			</Text>
			<View style={styles.keys}>
				<Key
					title="Open project"
					size="sm"
					variant="primary"
					onPress={() => actions.openEntity(project)}
				/>
				{task ? (
					<Key
						title="Open a task"
						size="sm"
						variant="outline"
						accessibilityHint={task.name}
						onPress={() => actions.openEntity(task)}
					/>
				) : null}
			</View>
		</View>
	);
}

function CreatedChips({ entities }: { entities: CreatedEntity[] }) {
	const { colors } = useInk();
	const actions = useChatActions();
	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<Sparkles size={12} color={colors.accent} />
				<MicroLabel>
					{entities.length === 1 ? 'Created' : `Created ${entities.length}`}
				</MicroLabel>
			</View>
			<View style={styles.chips}>
				{entities.map((entity) => {
					const Glyph = KIND_ICON[entity.kind];
					return (
						<Pressable
							key={entity.id}
							accessibilityRole="button"
							accessibilityLabel={`${ENTITY_KIND_LABEL[entity.kind]}: ${entity.name}`}
							accessibilityHint="Opens it"
							onPress={() => {
								playHaptic('selection');
								actions.openEntity(entity);
							}}
							style={({ pressed }) => [
								styles.chip,
								{
									backgroundColor: pressed
										? withAlpha(colors.accent, 0.1)
										: colors.card,
									borderColor: withAlpha(colors.accent, 0.35)
								}
							]}
						>
							<Glyph size={14} color={colors.accent} />
							<Text
								numberOfLines={1}
								maxFontSizeMultiplier={1.3}
								style={[
									typeScale.meta,
									styles.chipText,
									{ color: colors.foreground }
								]}
							>
								{entity.name}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

function useExpand() {
	const reduce = useReducedMotion();
	const [expanded, setExpanded] = useState(false);
	const toggle = () => {
		if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
		setExpanded((value) => !value);
	};
	return { expanded, toggle };
}

function DocumentCard({ row, change }: { row: ChangesRow; change: DocumentChange }) {
	const { colors } = useInk();
	const actions = useChatActions();
	const { expanded, toggle } = useExpand();
	const undone = row.undone.includes(change.id);
	const note = row.notes[change.id] ?? null;
	const canUndo = !undone && Boolean(change.revertPatches?.length);
	return (
		<Card>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				accessibilityLabel={`Edited document ${change.title}: ${change.linesAdded} lines added, ${change.linesRemoved} removed${undone ? ', undone' : ''}`}
				accessibilityHint={expanded ? 'Hides the changes' : 'Shows the changes'}
				onPress={toggle}
				style={({ pressed }) => [styles.head, pressed && { backgroundColor: colors.muted }]}
			>
				<FileText size={16} color={colors.accent} />
				<View style={styles.headText}>
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.3}
						style={[
							typeScale.row,
							{
								color: undone ? colors.mutedForeground : colors.foreground,
								textDecorationLine: undone ? 'line-through' : 'none'
							}
						]}
					>
						{change.title}
					</Text>
					<Text
						maxFontSizeMultiplier={1.3}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{undone
							? 'Undone'
							: `${describeDocumentChange(change)} · ${expanded ? 'hide changes' : 'view changes'}`}
					</Text>
				</View>
				<Text
					maxFontSizeMultiplier={1.2}
					style={[styles.counts, { opacity: undone ? 0.5 : 1 }]}
				>
					<Text style={{ color: colors.success }}>+{change.linesAdded}</Text>{' '}
					<Text style={{ color: colors.destructive }}>−{change.linesRemoved}</Text>
				</Text>
				<ChevronDown
					size={16}
					color={colors.mutedForeground}
					style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
				/>
			</Pressable>
			{expanded ? <Diff change={change} /> : null}
			{note ? (
				<Note text={note} />
			) : !canUndo && !undone ? (
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.small, styles.aside, { color: colors.mutedForeground }]}
				>
					{DOCUMENT_UNDO_TOO_LARGE} Restore it from version history on the website.
				</Text>
			) : null}
			<Footer
				undone={undone}
				canUndo={canUndo}
				busy={row.busy === change.id}
				locked={row.busy !== null || actions.turnActive}
				undoLabel={`Undo the edit to ${change.title}`}
				openLabel="Open document"
				onUndo={() => void actions.undoChange(row.id, change.id)}
				onOpen={() =>
					actions.openEntity({
						kind: 'document',
						id: change.documentId,
						name: change.title,
						projectId: change.projectId
					})
				}
			/>
		</Card>
	);
}

function Diff({ change }: { change: DocumentChange }) {
	const { colors } = useInk();
	type Line = DocumentChange['hunks'][number]['lines'][number] | { kind: 'gap'; text: '' };
	const all: Line[] = change.hunks.flatMap((hunk, index) => [
		...(index > 0 ? [{ kind: 'gap', text: '' } as const] : []),
		...hunk.lines
	]);
	const lines = all.slice(0, DIFF_LINE_LIMIT);
	const more = all.length - lines.length;
	return (
		<View
			style={[
				styles.diff,
				{ borderColor: colors.border, backgroundColor: colors.background }
			]}
		>
			{lines.length === 0 ? (
				<Text style={[typeScale.small, styles.diffMore, { color: colors.mutedForeground }]}>
					No line preview for this change.
				</Text>
			) : (
				lines.map((line, index) =>
					line.kind === 'gap' ? (
						<View
							key={index}
							style={[styles.diffGap, { borderColor: colors.border }]}
						/>
					) : (
						<View
							key={index}
							style={[
								styles.diffLine,
								line.kind === 'add'
									? { backgroundColor: withAlpha(colors.success, 0.14) }
									: line.kind === 'remove'
										? { backgroundColor: withAlpha(colors.destructive, 0.12) }
										: null
							]}
						>
							<Text
								style={[
									styles.diffSign,
									{
										color:
											line.kind === 'add'
												? colors.success
												: line.kind === 'remove'
													? colors.destructive
													: colors.mutedForeground
									}
								]}
							>
								{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
							</Text>
							<Text
								selectable
								style={[
									styles.diffText,
									{
										color:
											line.kind === 'context'
												? colors.mutedForeground
												: colors.foreground
									}
								]}
							>
								{line.text || ' '}
							</Text>
						</View>
					)
				)
			)}
			{more > 0 || change.hunksTruncated ? (
				<Text style={[typeScale.small, styles.diffMore, { color: colors.mutedForeground }]}>
					{more > 0 ? `… ${more} more lines. ` : '… more changes. '}
					See it all in version history on the website.
				</Text>
			) : null}
		</View>
	);
}

function TableCard({ row, change }: { row: ChangesRow; change: TableChange }) {
	const { colors } = useInk();
	const actions = useChatActions();
	const { expanded, toggle } = useExpand();
	const undone = row.undone.includes(change.id);
	const note = row.notes[change.id] ?? null;
	const summary = describeTableChange(change);
	const hasSample = change.sample.length > 0;
	return (
		<Card>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				accessibilityLabel={`Changed table ${change.title}: ${summary}${undone ? ', undone' : ''}`}
				accessibilityHint={
					hasSample
						? expanded
							? 'Hides the cells'
							: 'Shows the changed cells'
						: undefined
				}
				disabled={!hasSample}
				onPress={toggle}
				style={({ pressed }) => [styles.head, pressed && { backgroundColor: colors.muted }]}
			>
				<Table size={16} color={colors.accent} />
				<View style={styles.headText}>
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.3}
						style={[
							typeScale.row,
							{
								color: undone ? colors.mutedForeground : colors.foreground,
								textDecorationLine: undone ? 'line-through' : 'none'
							}
						]}
					>
						{change.title}
					</Text>
					<Text
						maxFontSizeMultiplier={1.3}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{undone
							? 'Undone'
							: hasSample
								? `${summary} · ${expanded ? 'hide cells' : 'view cells'}`
								: summary}
					</Text>
				</View>
				{hasSample ? (
					<ChevronDown
						size={16}
						color={colors.mutedForeground}
						style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
					/>
				) : null}
			</Pressable>
			{expanded && hasSample ? (
				<View
					style={[
						styles.diff,
						{ borderColor: colors.border, backgroundColor: colors.background }
					]}
				>
					{change.sample.map((cell, index) => (
						<View key={`${cell.row}:${cell.column}:${index}`} style={styles.cell}>
							<Text
								numberOfLines={1}
								maxFontSizeMultiplier={1.3}
								style={[typeScale.small, { color: colors.mutedForeground }]}
							>
								<Text style={styles.cellRow}>{cell.row}</Text>
								{'  '}
								<Text style={{ color: colors.foreground, fontWeight: '600' }}>
									{cell.column}
								</Text>
							</Text>
							<Text
								maxFontSizeMultiplier={1.4}
								style={[typeScale.meta, { color: colors.foreground }]}
							>
								{cell.before ? (
									<>
										<Text
											style={{
												color: colors.destructive,
												textDecorationLine: 'line-through'
											}}
										>
											{cell.before}
										</Text>
										<Text style={{ color: colors.mutedForeground }}> → </Text>
									</>
								) : null}
								<Text style={{ color: colors.success }}>
									{cell.after || '(cleared)'}
								</Text>
							</Text>
						</View>
					))}
					{change.cellsChanged > change.sample.length ? (
						<Text
							style={[
								typeScale.small,
								styles.diffMore,
								{ color: colors.mutedForeground }
							]}
						>
							Showing {change.sample.length} of {change.cellsChanged} changed cells.
						</Text>
					) : null}
				</View>
			) : null}
			{note ? <Note text={note} /> : null}
			<Footer
				undone={undone}
				canUndo={!undone}
				busy={row.busy === change.id}
				locked={row.busy !== null || actions.turnActive}
				undoLabel={`Undo the changes to ${change.title}`}
				openLabel="Open table"
				onUndo={() => void actions.undoChange(row.id, change.id)}
				onOpen={() =>
					actions.openEntity({
						kind: 'document',
						id: change.documentId,
						name: change.title,
						projectId: change.projectId
					})
				}
			/>
		</Card>
	);
}

function Card({ children }: { children: React.ReactNode }) {
	const ink = useInk();
	const { colors } = ink;
	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			{children}
		</View>
	);
}

function Note({ text }: { text: string }) {
	const ink = useInk();
	const { colors } = ink;
	return (
		<View
			accessibilityRole="alert"
			style={[
				styles.note,
				{
					backgroundColor: withAlpha(colors.warning, 0.1),
					borderColor: withAlpha(colors.warning, 0.35)
				}
			]}
		>
			<AlertTriangle size={14} color={ink.warningText} />
			<Text
				maxFontSizeMultiplier={1.4}
				style={[typeScale.small, styles.noteText, { color: colors.foreground }]}
			>
				{text}
			</Text>
		</View>
	);
}

function Footer({
	undone,
	canUndo,
	busy,
	locked,
	undoLabel,
	openLabel,
	onUndo,
	onOpen
}: {
	undone: boolean;
	canUndo: boolean;
	busy: boolean;
	locked: boolean;
	undoLabel: string;
	openLabel: string;
	onUndo: () => void;
	onOpen: () => void;
}) {
	const { colors } = useInk();
	return (
		<View style={[styles.footer, { borderTopColor: colors.border }]}>
			{undone ? (
				<View accessibilityRole="text" style={styles.undone}>
					<Check size={14} color={colors.success} />
					<Text
						maxFontSizeMultiplier={1.3}
						style={[typeScale.small, { color: colors.success, fontWeight: '600' }]}
					>
						Undone
					</Text>
				</View>
			) : canUndo ? (
				<Key
					title="Undo"
					icon={Undo2}
					size="sm"
					variant="outline"
					accessibilityLabel={undoLabel}
					disabled={locked && !busy}
					loading={busy}
					onPress={onUndo}
				/>
			) : null}
			<Key title={openLabel} size="sm" variant="ghost" haptic="selection" onPress={onOpen} />
		</View>
	);
}

const styles = StyleSheet.create({
	block: { gap: spacing.md },
	section: { gap: 6 },
	sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	project: {
		borderWidth: 1,
		borderRadius: radius.md,
		paddingHorizontal: 14,
		paddingVertical: 12,
		gap: 5
	},
	keys: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
	chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		minHeight: 36,
		paddingHorizontal: 10,
		borderWidth: 1,
		borderRadius: radius.sm,
		maxWidth: '100%'
	},
	chipText: { flexShrink: 1, maxWidth: 240 },
	card: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
	head: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		minHeight: 48,
		paddingHorizontal: 12,
		paddingVertical: 8
	},
	headText: { flex: 1, minWidth: 0, gap: 1 },
	counts: { fontFamily: fontFamily.mono, fontSize: 12, fontWeight: '600' },
	diff: {
		marginHorizontal: 12,
		marginBottom: 8,
		borderWidth: 1,
		borderRadius: radius.xs,
		overflow: 'hidden'
	},
	diffLine: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 1 },
	diffSign: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 17, width: 12 },
	diffText: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 17, flex: 1 },
	diffGap: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 3 },
	diffMore: { paddingHorizontal: 8, paddingVertical: 6 },
	cell: { paddingHorizontal: 8, paddingVertical: 6, gap: 1 },
	cellRow: { fontFamily: fontFamily.mono },
	aside: { paddingHorizontal: 12, paddingBottom: 8 },
	note: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 8,
		marginHorizontal: 12,
		marginBottom: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderWidth: 1,
		borderRadius: radius.xs
	},
	noteText: { flex: 1 },
	footer: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		flexWrap: 'wrap',
		borderTopWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 8
	},
	undone: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingRight: 4 }
});
