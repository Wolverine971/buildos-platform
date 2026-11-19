// apps/mobile/src/components/inbox/cleanup-card.tsx
//
// One project's cleanup list, in the web's blocks (InboxProjectCleanup):
//   Pick a path  — a question with 2–3 answers as big keys (recommended marked, each saying
//                  what happens), the lines it settles, Talk it through.
//   Tidy-ups     — safe filing and archiving: swipe right to Apply, left for Not needed, or
//                  "Apply all N" at once.
//   Out of date  — Update it (or Already handled), Not needed, Talk it through.
//   Want me to…? — Yes, ask me (opens the chat), Not for this project.
//   Done for you — changes made without asking, each with Undo.
// Every answer leaves the card at once and waits in the pile for five seconds.
import {
	CLEANUP_ASK_BLOCK,
	cleanupItemCautions,
	cleanupRowOperations,
	isCleanupItemSelectable,
	type CleanupAskEntry
} from '@buildos/agentic-chat-client/inbox-cleanup-presentation';
import type { ProjectCleanupItem } from '@buildos/shared-types';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
	AlarmClock,
	Check,
	Key,
	MessageCircle,
	MicroLabel,
	playHaptic,
	Stamp,
	SwipeRow,
	Undo2,
	X
} from '@/components/kit';
import type { InboxController } from '@/hooks/use-inbox';
import type { InboxCleanup } from '@/lib/inbox/model';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import { BlockHead, Card, NoteLine, TextKey } from './parts';

export function CleanupCard({ cleanup, inbox }: { cleanup: InboxCleanup; inbox: InboxController }) {
	const { colors } = useInk();
	const { blocks, view, item } = cleanup;
	const projectId = view.project_id;
	const canDecide = item.can_decide !== false;

	return (
		<Card>
			<View style={styles.head}>
				<View style={styles.headText}>
					<MicroLabel>Project cleanup</MicroLabel>
					<Text
						maxFontSizeMultiplier={1.4}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{cleanup.summary}
					</Text>
				</View>
				{canDecide ? (
					<TextKey
						label="Snooze"
						icon={AlarmClock}
						tone="muted"
						accessibilityLabel="Snooze this cleanup list until tomorrow"
						onPress={() => inbox.snoozeCleanup(item)}
					/>
				) : null}
			</View>
			{view.bottom_line ? (
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.meta, { color: colors.foreground }]}
				>
					{view.bottom_line}
				</Text>
			) : null}
			{!canDecide ? (
				<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
					{item.decision_disabled_reason ?? 'View only'}
				</Text>
			) : null}

			{blocks.paths.length ? (
				<View style={styles.block}>
					<BlockHead
						label={CLEANUP_ASK_BLOCK.path.label}
						count={blocks.paths.length}
						hint={CLEANUP_ASK_BLOCK.path.hint}
					/>
					{blocks.paths.map((entry) => (
						<AskCard
							key={entry.key}
							entry={entry}
							canDecide={canDecide}
							inbox={inbox}
							onAnswer={(answer) => inbox.answerAsk(item, projectId, entry, answer)}
							onTalk={() => void inbox.talk(item, entry.items[0] ?? null)}
						/>
					))}
				</View>
			) : null}

			{blocks.tidy.length ? (
				<View style={styles.block}>
					<BlockHead
						label={CLEANUP_ASK_BLOCK.tidy.label}
						count={blocks.tidy.length}
						hint={CLEANUP_ASK_BLOCK.tidy.hint}
					/>
					{canDecide && cleanup.ready.length > 1 ? (
						<Key
							title={`Apply all ${cleanup.ready.length}`}
							icon={Check}
							variant="primary"
							size="sm"
							haptic="success"
							accessibilityHint="Applies every ready tidy-up in this list; Undo for five seconds"
							onPress={() => inbox.applyAll(projectId, cleanup.ready)}
						/>
					) : null}
					<View>
						{blocks.tidy.map((line) => (
							<LineRow
								key={line.id}
								line={line}
								canDecide={canDecide}
								inbox={inbox}
								yes={
									isCleanupItemSelectable(line)
										? {
												label: 'Apply',
												onPress: () =>
													inbox.answerLine(projectId, line, 'apply')
											}
										: null
								}
								no={{
									label: 'Not needed',
									onPress: () => inbox.answerLine(projectId, line, 'not_needed')
								}}
								onTalk={() => void inbox.talk(item, line)}
							/>
						))}
					</View>
				</View>
			) : null}

			{blocks.stale.length ? (
				<View style={styles.block}>
					<BlockHead
						label={CLEANUP_ASK_BLOCK.stale.label}
						count={blocks.stale.length}
						hint={CLEANUP_ASK_BLOCK.stale.hint}
					/>
					<View>
						{blocks.stale.map((line) => (
							<LineRow
								key={line.id}
								line={line}
								canDecide={canDecide}
								inbox={inbox}
								yes={
									line.executable
										? isCleanupItemSelectable(line)
											? {
													label: 'Update it',
													onPress: () =>
														inbox.answerLine(
															projectId,
															line,
															'apply',
															'Update it'
														)
												}
											: null
										: {
												label: 'Already handled',
												onPress: () =>
													inbox.answerLine(projectId, line, 'done')
											}
								}
								no={{
									label: 'Not needed',
									onPress: () => inbox.answerLine(projectId, line, 'not_needed')
								}}
								onTalk={() => void inbox.talk(item, line)}
							/>
						))}
					</View>
				</View>
			) : null}

			{blocks.offers.length ? (
				<View style={styles.block}>
					<BlockHead
						label={CLEANUP_ASK_BLOCK.offer.label}
						count={blocks.offers.length}
						hint={CLEANUP_ASK_BLOCK.offer.hint}
					/>
					<View>
						{blocks.offers.map((line) => (
							<LineRow
								key={line.id}
								line={line}
								canDecide={canDecide}
								inbox={inbox}
								yes={{
									label: 'Yes, ask me',
									onPress: () => void inbox.talk(item, line),
									opensChat: true
								}}
								no={{
									label: 'Not for this project',
									onPress: () =>
										inbox.answerLine(
											projectId,
											line,
											'not_needed',
											'Not for this project'
										)
								}}
							/>
						))}
					</View>
				</View>
			) : null}

			{blocks.autoApplied.length ? (
				<View style={styles.block}>
					<BlockHead
						label={CLEANUP_ASK_BLOCK.done.label}
						count={blocks.autoApplied.length}
						hint={CLEANUP_ASK_BLOCK.done.hint}
					/>
					{blocks.autoApplied.map((entry) => (
						<DoneRow
							key={entry.suggestion_id}
							title={entry.title}
							reason={entry.reason}
							undoable={entry.undoable && canDecide}
							busy={inbox.undoing === entry.suggestion_id}
							note={inbox.notes[`auto:${entry.suggestion_id}`]}
							onUndo={() =>
								void inbox.undoAutoApplied(projectId, entry.suggestion_id)
							}
						/>
					))}
				</View>
			) : null}
		</Card>
	);
}

// ---------------------------------------------------------------------------------------------

function AskCard({
	entry,
	canDecide,
	inbox,
	onAnswer,
	onTalk
}: {
	entry: CleanupAskEntry;
	canDecide: boolean;
	inbox: InboxController;
	onAnswer: (answer: CleanupAskEntry['ask']['answers'][number]) => void;
	onTalk: () => void;
}) {
	const { colors } = useInk();
	const canApply = entry.items.some((line) => isCleanupItemSelectable(line));
	const settles = entry.items.length > 1 ? entry.items.map((line) => line.title) : [];
	const note = entry.items.map((line) => inbox.notes[line.id]).find(Boolean);

	return (
		<View
			style={[styles.ask, { borderColor: colors.border, backgroundColor: colors.background }]}
		>
			<Text
				accessibilityRole="header"
				maxFontSizeMultiplier={1.6}
				style={[styles.question, { color: colors.foreground }]}
			>
				{entry.ask.question}
			</Text>
			{entry.ask.context ? (
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					{entry.ask.context}
				</Text>
			) : null}
			<NoteLine note={note} />
			{canDecide ? (
				<View style={styles.answers}>
					{entry.ask.answers.map((answer, index) => {
						const blocked = answer.action === 'apply' && !canApply;
						return (
							<Pressable
								key={`${index}:${answer.label}`}
								accessibilityRole="button"
								accessibilityLabel={`${answer.label}${answer.recommended ? ', recommended' : ''}`}
								accessibilityHint={
									blocked
										? 'Not ready to apply from here'
										: (answer.effect ?? undefined)
								}
								accessibilityState={{ disabled: blocked }}
								disabled={blocked}
								onPress={() => {
									playHaptic(answer.action === 'apply' ? 'success' : 'light');
									onAnswer(answer);
								}}
								style={({ pressed }) => [
									styles.answer,
									{
										borderColor: answer.recommended
											? withAlpha(colors.info, 0.55)
											: colors.border,
										backgroundColor: pressed
											? withAlpha(colors.info, 0.08)
											: colors.card,
										opacity: blocked ? 0.55 : 1
									}
								]}
							>
								<View style={styles.answerTitle}>
									<Text
										maxFontSizeMultiplier={1.5}
										style={[styles.answerLabel, { color: colors.foreground }]}
									>
										{answer.label}
									</Text>
									{answer.recommended ? (
										<Stamp tone="info">Recommended</Stamp>
									) : null}
								</View>
								{blocked ? (
									<Text
										style={[typeScale.small, { color: colors.mutedForeground }]}
									>
										Not ready to apply from here. Talk it through instead.
									</Text>
								) : answer.effect ? (
									<Text
										maxFontSizeMultiplier={1.5}
										style={[typeScale.small, { color: colors.mutedForeground }]}
									>
										{answer.effect}
									</Text>
								) : null}
							</Pressable>
						);
					})}
				</View>
			) : null}
			{settles.length ? (
				<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
					Settles: {settles.join(' · ')}
				</Text>
			) : null}
			{canDecide ? (
				<View style={styles.footer}>
					<TextKey
						label="Talk it through"
						icon={MessageCircle}
						disabled={inbox.openingChat}
						onPress={onTalk}
					/>
				</View>
			) : null}
		</View>
	);
}

type LineAnswer = { label: string; onPress: () => void; opensChat?: boolean };

function LineRow({
	line,
	canDecide,
	inbox,
	yes,
	no,
	onTalk
}: {
	line: ProjectCleanupItem;
	canDecide: boolean;
	inbox: InboxController;
	yes: LineAnswer | null;
	no: LineAnswer;
	onTalk?: () => void;
}) {
	const { colors } = useInk();
	const changes = line.rows
		.flatMap((row) => cleanupRowOperations(row.verified_operations))
		.slice(0, 3);
	const cautions = cleanupItemCautions(line);
	const note = inbox.notes[line.id];
	// Swiping right applies only a real change; "Yes, ask me" opens chat, so it stays a key.
	const swipeYes = canDecide && yes && !yes.opensChat ? yes : null;

	return (
		<SwipeRow
			disabled={!canDecide}
			face={colors.card}
			right={
				swipeYes
					? {
							label: swipeYes.label,
							icon: Check,
							tone: 'success',
							onSwipe: swipeYes.onPress
						}
					: undefined
			}
			left={
				canDecide
					? { label: no.label, icon: X, tone: 'muted', onSwipe: no.onPress }
					: undefined
			}
			style={[styles.line, { borderBottomColor: withAlpha(colors.border, 0.7) }]}
		>
			<View style={styles.lineBody}>
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.row, { color: colors.foreground }]}
				>
					{line.title}
				</Text>
				{line.summary && line.summary !== line.title ? (
					<Text
						maxFontSizeMultiplier={1.6}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{line.summary}
					</Text>
				) : null}
				{changes.length ? (
					<View style={styles.changes}>
						{changes.map((change) => (
							<Text
								key={change.key}
								numberOfLines={2}
								style={[typeScale.small, { color: colors.mutedForeground }]}
							>
								• {change.label}
								{change.target ? `: ${change.target}` : ''}
							</Text>
						))}
					</View>
				) : null}
				{cautions.map((caution) => (
					<Text key={caution} style={[typeScale.small, { color: colors.warning }]}>
						⚠ {caution}
					</Text>
				))}
				<NoteLine note={note} />
				{canDecide ? (
					<View style={styles.lineKeys}>
						{yes ? (
							<Key
								title={yes.label}
								icon={yes.opensChat ? MessageCircle : Check}
								size="xs"
								variant={yes.opensChat ? 'primary' : 'outline'}
								haptic={yes.opensChat ? 'light' : 'success'}
								accessibilityLabel={`${yes.label}: ${line.title}`}
								onPress={yes.onPress}
							/>
						) : null}
						<Key
							title={no.label}
							icon={X}
							size="xs"
							variant="ghost"
							accessibilityLabel={`${no.label}: ${line.title}`}
							onPress={no.onPress}
						/>
						{onTalk ? (
							<TextKey
								label="Talk"
								icon={MessageCircle}
								accessibilityLabel={`Talk it through: ${line.title}`}
								disabled={inbox.openingChat}
								onPress={onTalk}
							/>
						) : null}
					</View>
				) : null}
			</View>
		</SwipeRow>
	);
}

export function DoneRow({
	title,
	reason,
	meta,
	undoable,
	busy,
	note,
	onUndo
}: {
	title: string;
	reason: string | null;
	meta?: string | null;
	undoable: boolean;
	busy: boolean;
	note?: Parameters<typeof NoteLine>[0]['note'];
	onUndo: () => void;
}) {
	const { colors } = useInk();
	return (
		<View style={[styles.done, { borderBottomColor: withAlpha(colors.border, 0.7) }]}>
			<View style={styles.doneText}>
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.meta, { color: colors.foreground }]}
				>
					{title}
				</Text>
				{reason || meta ? (
					<Text style={[typeScale.small, { color: colors.mutedForeground }]}>
						{[meta, reason].filter(Boolean).join(' · ')}
					</Text>
				) : null}
				<NoteLine note={note} />
			</View>
			{undoable ? (
				<Key
					title="Undo"
					icon={Undo2}
					size="xs"
					variant="ghost"
					loading={busy}
					accessibilityLabel={`Undo: ${title}`}
					onPress={onUndo}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
	headText: { flex: 1, minWidth: 0, gap: 2 },
	block: { gap: 8 },
	ask: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
	question: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
	answers: { gap: 8 },
	answer: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
		gap: 2,
		minHeight: 48
	},
	answerTitle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
	answerLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
	footer: { flexDirection: 'row', justifyContent: 'flex-end' },
	line: { borderBottomWidth: 1, borderRadius: 0 },
	lineBody: { paddingVertical: 10, paddingHorizontal: 2, gap: 4 },
	changes: { gap: 1 },
	lineKeys: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		gap: 8,
		marginTop: 4
	},
	done: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingVertical: 8,
		borderBottomWidth: 1
	},
	doneText: { flex: 1, minWidth: 0, gap: 2 }
});
